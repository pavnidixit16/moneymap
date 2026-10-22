// Gmail connection settings, read from the server environment (Vercel → Settings →
// Environment Variables). Gmail stays switched off unless all three are present.
// Server only: never import this from browser code.

// Short-lived cookie holding the consent state and PKCE verifier between the two redirects.
export const OAUTH_COOKIE = "mm_gmail_oauth";

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export interface GmailConfig {
  clientId: string;
  clientSecret: string;
  tokenKey: Buffer;
  endpoints: { auth: string; token: string; revoke: string; api: string };
}

export function gmailConfig(): GmailConfig | null {
  const clientId = process.env.GMAIL_CLIENT_ID?.trim();
  const clientSecret = process.env.GMAIL_CLIENT_SECRET?.trim();
  const key = process.env.GMAIL_TOKEN_KEY?.trim();
  if (!clientId || !clientSecret || !key) return null;
  const tokenKey = Buffer.from(key, "base64");
  if (tokenKey.length !== 32) return null; // must be 32 random bytes, base64-encoded

  // LOCAL TESTING ONLY: point at a stand-in Google server. Ignored on Vercel.
  const fake = !process.env.VERCEL && process.env.GMAIL_TEST_GOOGLE_BASE;
  return {
    clientId,
    clientSecret,
    tokenKey,
    endpoints: fake
      ? { auth: `${fake}/o/oauth2/v2/auth`, token: `${fake}/token`, revoke: `${fake}/revoke`, api: fake }
      : {
          auth: "https://accounts.google.com/o/oauth2/v2/auth",
          token: "https://oauth2.googleapis.com/token",
          revoke: "https://oauth2.googleapis.com/revoke",
          api: "https://gmail.googleapis.com",
        },
  };
}
