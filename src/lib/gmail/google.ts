// The few Google calls MoneyMap makes. Server only. Tokens and email contents are never
// logged; errors carry only a short code.
import { GMAIL_SCOPE, type GmailConfig } from "./config";
import type { GmailMessage } from "./message";

export class GoogleError extends Error {
  constructor(
    public code: "revoked" | "scope_missing" | "no_refresh_token" | "google_unavailable",
  ) {
    super(code);
  }
}

async function google(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new GoogleError("google_unavailable");
  }
}

export function consentUrl(config: GmailConfig, opts: { redirectUri: string; state: string; codeChallenge: string; loginHint?: string }) {
  const url = new URL(config.endpoints.auth);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPE,
    access_type: "offline", // a refresh token, so "Check Gmail" works without asking again
    prompt: "consent",
    include_granted_scopes: "false",
    state: opts.state,
    code_challenge: opts.codeChallenge,
    code_challenge_method: "S256",
    ...(opts.loginHint ? { login_hint: opts.loginHint } : {}),
  }).toString();
  return url.toString();
}

export async function exchangeCode(config: GmailConfig, code: string, codeVerifier: string, redirectUri: string) {
  const res = await google(config.endpoints.token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      code_verifier: codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) throw new GoogleError(res.status >= 500 ? "google_unavailable" : "revoked");
  const body = (await res.json()) as { access_token?: string; refresh_token?: string; scope?: string };
  // The user can untick Gmail on Google's consent screen; then there's nothing to read.
  if (!body.scope?.split(" ").includes(GMAIL_SCOPE)) throw new GoogleError("scope_missing");
  if (!body.access_token || !body.refresh_token) throw new GoogleError("no_refresh_token");
  return { accessToken: body.access_token, refreshToken: body.refresh_token, scope: body.scope };
}

export async function refreshAccessToken(config: GmailConfig, refreshToken: string): Promise<string> {
  const res = await google(config.endpoints.token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  // 400/401 invalid_grant: revoked in the Google account, or expired (7 days in Testing mode).
  if (res.status === 400 || res.status === 401) throw new GoogleError("revoked");
  if (!res.ok) throw new GoogleError("google_unavailable");
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) throw new GoogleError("google_unavailable");
  return body.access_token;
}

// Best effort: an already-revoked token is fine.
export async function revokeToken(config: GmailConfig, token: string): Promise<boolean> {
  try {
    const res = await google(config.endpoints.revoke, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    });
    return res.ok || res.status === 400;
  } catch {
    return false;
  }
}

async function gmailGet<T>(config: GmailConfig, accessToken: string, path: string): Promise<T> {
  const res = await google(`${config.endpoints.api}/gmail/v1/users/me/${path}`, { headers: { authorization: `Bearer ${accessToken}` } });
  if (res.status === 401 || res.status === 403) throw new GoogleError("revoked");
  if (!res.ok) throw new GoogleError("google_unavailable");
  return (await res.json()) as T;
}

export async function profileEmail(config: GmailConfig, accessToken: string): Promise<string> {
  const p = await gmailGet<{ emailAddress?: string }>(config, accessToken, "profile");
  if (!p.emailAddress) throw new GoogleError("google_unavailable");
  return p.emailAddress;
}

export async function listMessageIds(config: GmailConfig, accessToken: string, query: string, max: number): Promise<string[]> {
  const params = new URLSearchParams({ q: query, maxResults: String(max) });
  const list = await gmailGet<{ messages?: { id: string }[] }>(config, accessToken, `messages?${params}`);
  return (list.messages ?? []).map((m) => m.id).filter((id) => /^[0-9a-zA-Z_-]{6,64}$/.test(id));
}

export async function getMessage(config: GmailConfig, accessToken: string, id: string): Promise<GmailMessage> {
  return gmailGet<GmailMessage>(config, accessToken, `messages/${encodeURIComponent(id)}?format=full`);
}
