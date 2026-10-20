// LOCAL TESTING ONLY. A stand-in for the Supabase API gateway:
//   /rest/v1/*     -> the real PostgREST (row-level security fully applies)
//   /auth/v1/user  -> verifies the test JWT, like Supabase Auth's getUser
// Never deployed; production talks to real Supabase.
import http from "node:http";
import crypto from "node:crypto";

const SECRET = process.env.JWT_SECRET;
const PGRST = process.env.PGRST_URL ?? "http://127.0.0.1:3001";
const PORT = Number(process.env.GATEWAY_PORT ?? 54321);

function verify(token) {
  const [h, p, s] = String(token).split(".");
  if (!h || !p || !s) return null;
  const sig = crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url");
  if (sig !== s) return null;
  const payload = JSON.parse(Buffer.from(p, "base64url").toString());
  return payload.exp * 1000 > Date.now() ? payload : null;
}

const json = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    const bearer = (req.headers.authorization ?? "").replace(/^Bearer /, "");

    if (url.pathname === "/auth/v1/user") {
      const claims = verify(bearer);
      if (!claims) return json(res, 401, { code: 401, msg: "invalid JWT" });
      return json(res, 200, {
        id: claims.sub,
        aud: "authenticated",
        role: "authenticated",
        email: claims.email,
        app_metadata: {},
        user_metadata: {},
        created_at: "2026-01-01T00:00:00Z",
      });
    }
    if (url.pathname === "/auth/v1/logout") {
      res.writeHead(204);
      return res.end();
    }
    if (url.pathname.startsWith("/rest/v1")) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const headers = {};
      for (const k of ["content-type", "prefer", "accept", "range", "accept-profile", "content-profile"]) {
        if (req.headers[k]) headers[k] = req.headers[k];
      }
      // A publishable key is not a JWT: requests carrying only it run as `anon`.
      if (bearer.split(".").length === 3) headers.authorization = `Bearer ${bearer}`;
      const upstream = await fetch(PGRST + url.pathname.slice("/rest/v1".length) + url.search, {
        method: req.method,
        headers,
        body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks),
      });
      const body = Buffer.from(await upstream.arrayBuffer());
      const out = {};
      upstream.headers.forEach((v, k) => {
        if (!["content-encoding", "transfer-encoding", "connection"].includes(k)) out[k] = v;
      });
      res.writeHead(upstream.status, out);
      return res.end(body);
    }
    json(res, 404, { msg: "not found" });
  })
  .listen(PORT, "127.0.0.1", () => console.log(`gateway on ${PORT}`));
