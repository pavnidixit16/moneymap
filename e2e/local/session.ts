// LOCAL TESTING ONLY. Builds the Supabase session cookie for a test user, signed with the
// local JWT secret, so browser tests can start signed in without Google.
import crypto from "node:crypto";

export const USERS = {
  a: { id: "11111111-1111-4111-8111-111111111111", email: "tester-a@example.invalid" },
  b: { id: "22222222-2222-4222-8222-222222222222", email: "tester-b@example.invalid" },
  c: { id: "33333333-3333-4333-8333-333333333333", email: "tester-c@example.invalid" },
  // Gmail tests: the stand-in Google approves g, refuses d, and drops the Gmail scope for e.
  g: { id: "44444444-4444-4444-8444-444444444444", email: "tester-g@example.invalid" },
  d: { id: "55555555-5555-4555-8555-555555555555", email: "deny-d@example.invalid" },
  e: { id: "66666666-6666-4666-8666-666666666666", email: "noscope-e@example.invalid" },
  // Progress tests: each starts from an empty account.
  p: { id: "77777777-7777-4777-8777-777777777771", email: "progress-p@example.invalid" },
  q: { id: "77777777-7777-4777-8777-777777777772", email: "progress-q@example.invalid" },
  r: { id: "77777777-7777-4777-8777-777777777773", email: "progress-r@example.invalid" },
  s: { id: "77777777-7777-4777-8777-777777777774", email: "progress-s@example.invalid" },
  t: { id: "77777777-7777-4777-8777-777777777775", email: "progress-t@example.invalid" },
  // Feedback admin (listed in app_admins by setup.sql).
  h: { id: "88888888-8888-4888-8888-888888888888", email: "owner-h@example.invalid" },
  // "Can I afford this?" (seeded by setup.sql): u has a full plan, v has no income yet.
  u: { id: "99999999-9999-4999-8999-999999999991", email: "afford-u@example.invalid" },
  v: { id: "99999999-9999-4999-8999-999999999992", email: "afford-v@example.invalid" },
  w: { id: "aaaaaaaa-1111-4111-8111-aaaaaaaaaaa1", email: "welcome-w@example.invalid" },
} as const;

const b64url = (v: string | Buffer) => Buffer.from(v).toString("base64url");

export function sessionCookie(user: keyof typeof USERS) {
  const secret = process.env.JWT_SECRET!;
  const now = Math.floor(Date.now() / 1000);
  const { id, email } = USERS[user];
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ sub: id, email, role: "authenticated", aud: "authenticated", iat: now, exp: now + 86400 }));
  const signature = crypto.createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  const session = {
    access_token: `${header}.${payload}.${signature}`,
    refresh_token: "local-test",
    token_type: "bearer",
    expires_in: 86400,
    expires_at: now + 86400,
    user: { id, email, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
  };
  return { name: "sb-localhost-auth-token", value: `base64-${b64url(JSON.stringify(session))}` };
}
