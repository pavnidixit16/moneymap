// LOCAL TESTING ONLY. A stand-in for Google's OAuth and Gmail APIs, so the Gmail flow can
// be tested end to end without real accounts. Never deployed: the app only uses it when
// GMAIL_TEST_GOOGLE_BASE is set and it isn't running on Vercel.
//   GET  /o/oauth2/v2/auth             consent screen: approves at once (or denies, or
//                                      drops the Gmail scope, if login_hint asks)
//   POST /token                        code (checks PKCE) and refresh-token grants
//   POST /revoke                       revokes a refresh token
//   GET  /gmail/v1/users/me/...        profile, messages list, message
//   GET  /__state                      what the tests need to assert (query, revocations)
import http from "node:http";
import crypto from "node:crypto";

const PORT = Number(process.env.FAKE_GOOGLE_PORT ?? 3200);
const codes = new Map(); // code -> { challenge, redirectUri, scope }
const refreshTokens = new Map(); // token -> { revoked }
const accessTokens = new Set();
const state = { lastQuery: null, revoked: 0, messageFetches: 0 };

const today = new Date(Date.now() + 5.5 * 3600 * 1000);
const daysAgo = (n) => String(today.getTime() - 5.5 * 3600 * 1000 - n * 86400000);
const b64 = (s) => Buffer.from(s).toString("base64url");
const message = (id, from, subject, body, days, html = false) => ({
  id,
  internalDate: daysAgo(days),
  snippet: body.replace(/<[^>]+>/g, " ").slice(0, 120),
  payload: {
    mimeType: html ? "text/html" : "text/plain",
    headers: [
      { name: "From", value: from },
      { name: "Subject", value: subject },
    ],
    body: { data: b64(body) },
  },
});

const MESSAGES = [
  message("18f0000000000001", "HDFC Bank InstaAlerts <alerts@hdfcbank.net>", "You have done a UPI txn", "Dear Customer, Rs.640.00 has been debited from account **1234 to VPA zomato@hdfcbank ZOMATO. Your UPI transaction reference number is 629412345678.", 1),
  message("18f0000000000002", "Swiggy <noreply@swiggy.in>", "Your Swiggy order summary", "<table><tr><td>Paneer Tikka</td><td>&#8377;280</td></tr><tr><td>Order Total:</td><td>&#8377;375</td></tr></table>", 2, true),
  message("18f0000000000003", "HDFC Bank <alerts@hdfcbank.net>", "OTP for your transaction", "Your OTP for transaction of Rs 4,999 at AMAZON is 482913. Do not share it with anyone.", 1),
  message("18f0000000000004", "HDFC Bank Credit Cards <emailstatements.cards@hdfcbank.net>", "Your HDFC Bank Credit Card statement", "Total Amount Due: Rs. 12,345.00. Minimum Amount Due: Rs. 620.00. Payment Due Date: 05 Nov 2026.", 3),
  message("18f0000000000005", "Netflix <info@account.netflix.com>", "Your Netflix membership payment", "We've charged ₹649 for your monthly membership.", 4),
  // Worded like a real IndusInd alert: balance after the amount, payee as a QR code, footer.
  message("18f0000000000006", "IndusInd Bank <transactionalert@indusind.com>", "Transaction alert", "Dear Customer, your A/c 1234XXXXXX5678 is debited for INR 162.13 on 22-10-2026 towards UPI/tmqr61p679@ybl. Available Balance is INR 2,92,221.73. To reach us, call 1860 267 7777 or write to reachus@indusind.com.", 1),
];

const json = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};
const form = (req) =>
  new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(new URLSearchParams(data)));
  });

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const p = url.pathname;

    if (p === "/__state") return json(res, 200, state);
    if (p === "/__revoke_all") {
      // Simulates the user removing access in their Google Account, or Testing-mode expiry.
      for (const t of refreshTokens.values()) t.revoked = true;
      return json(res, 200, {});
    }

    if (p === "/o/oauth2/v2/auth") {
      const q = url.searchParams;
      const back = new URL(q.get("redirect_uri"));
      back.searchParams.set("state", q.get("state"));
      if (q.get("client_id") !== "test-client" || q.get("code_challenge_method") !== "S256" || q.get("access_type") !== "offline") {
        back.searchParams.set("error", "invalid_request");
      } else if ((q.get("login_hint") ?? "").startsWith("deny")) {
        back.searchParams.set("error", "access_denied");
      } else {
        const code = crypto.randomBytes(12).toString("hex");
        const scope = (q.get("login_hint") ?? "").startsWith("noscope") ? "openid" : q.get("scope");
        codes.set(code, { challenge: q.get("code_challenge"), redirectUri: q.get("redirect_uri"), scope });
        back.searchParams.set("code", code);
      }
      res.writeHead(302, { location: back.toString() });
      return res.end();
    }

    if (p === "/token" && req.method === "POST") {
      const f = await form(req);
      if (f.get("client_id") !== "test-client" || f.get("client_secret") !== "test-secret") return json(res, 401, { error: "invalid_client" });
      if (f.get("grant_type") === "authorization_code") {
        const c = codes.get(f.get("code"));
        codes.delete(f.get("code"));
        const challenge = crypto.createHash("sha256").update(f.get("code_verifier") ?? "").digest("base64url");
        if (!c || c.challenge !== challenge || c.redirectUri !== f.get("redirect_uri")) return json(res, 400, { error: "invalid_grant" });
        const refresh = `1//rt-${crypto.randomBytes(16).toString("hex")}`;
        const access = `at-${crypto.randomBytes(16).toString("hex")}`;
        refreshTokens.set(refresh, { revoked: false });
        accessTokens.add(access);
        return json(res, 200, { access_token: access, refresh_token: refresh, scope: c.scope, expires_in: 3599, token_type: "Bearer" });
      }
      if (f.get("grant_type") === "refresh_token") {
        const t = refreshTokens.get(f.get("refresh_token"));
        if (!t || t.revoked) return json(res, 400, { error: "invalid_grant" });
        const access = `at-${crypto.randomBytes(16).toString("hex")}`;
        accessTokens.add(access);
        return json(res, 200, { access_token: access, expires_in: 3599, token_type: "Bearer" });
      }
      return json(res, 400, { error: "unsupported_grant_type" });
    }

    if (p === "/revoke" && req.method === "POST") {
      const f = await form(req);
      const t = refreshTokens.get(f.get("token"));
      if (!t) return json(res, 400, { error: "invalid_token" });
      t.revoked = true;
      state.revoked += 1;
      return json(res, 200, {});
    }

    if (p.startsWith("/gmail/v1/users/me/")) {
      const bearer = (req.headers.authorization ?? "").replace(/^Bearer /, "");
      if (!accessTokens.has(bearer)) return json(res, 401, { error: { code: 401 } });
      const rest = p.slice("/gmail/v1/users/me/".length);
      if (rest === "profile") return json(res, 200, { emailAddress: "tester@gmail.com" });
      if (rest === "messages") {
        state.lastQuery = url.searchParams.get("q");
        return json(res, 200, { messages: MESSAGES.map((m) => ({ id: m.id, threadId: m.id })) });
      }
      const m = MESSAGES.find((x) => `messages/${x.id}` === rest);
      if (m) {
        state.messageFetches += 1;
        return json(res, 200, m);
      }
      return json(res, 404, { error: { code: 404 } });
    }

    json(res, 404, { error: "not found" });
  })
  .listen(PORT, () => console.log(`fake google on ${PORT}`));
