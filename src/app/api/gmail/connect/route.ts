import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { gmailConfig, OAUTH_COOKIE } from "@/lib/gmail/config";
import { consentUrl } from "@/lib/gmail/google";
import { createClient, getVerifiedUserId } from "@/lib/supabase/server";

// Starts "Connect Gmail": a separate Google consent for read-only Gmail access, bound to
// the signed-in user with a one-time state value and PKCE. POST only, so a link or a
// prefetch can never start it.
export async function POST(request: NextRequest) {
  const { origin } = request.nextUrl;
  const userId = await getVerifiedUserId();
  if (!userId) return NextResponse.redirect(new URL("/login", origin), { status: 303 });
  const config = gmailConfig();
  if (!config) return NextResponse.redirect(new URL("/spending/smart?tab=gmail&gmail=unavailable", origin), { status: 303 });

  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const { data } = await (await createClient()).auth.getClaims();
  const email = typeof data?.claims?.email === "string" ? data.claims.email : undefined;

  const response = NextResponse.redirect(
    consentUrl(config, { redirectUri: `${origin}/api/gmail/callback`, state, codeChallenge: challenge, loginHint: email }),
    { status: 303 },
  );
  response.cookies.set(OAUTH_COOKIE, JSON.stringify({ state, verifier, userId }), {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/api/gmail",
    maxAge: 600,
  });
  return response;
}
