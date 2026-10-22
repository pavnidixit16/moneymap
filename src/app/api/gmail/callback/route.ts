import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { gmailConfig, OAUTH_COOKIE } from "@/lib/gmail/config";
import { encryptToken } from "@/lib/gmail/crypto";
import { exchangeCode, GoogleError, profileEmail, revokeToken } from "@/lib/gmail/google";
import { createClient, getVerifiedUserId } from "@/lib/supabase/server";

function same(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// Google sends the user back here after the Gmail consent screen.
export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl;
  const done = (result: string) => {
    const response = NextResponse.redirect(new URL(`/spending/smart?tab=gmail&gmail=${result}`, origin));
    response.cookies.set(OAUTH_COOKIE, "", { path: "/api/gmail", maxAge: 0 });
    return response;
  };

  const userId = await getVerifiedUserId();
  if (!userId) return NextResponse.redirect(new URL("/login", origin));
  const config = gmailConfig();
  if (!config) return done("unavailable");

  let saved: { state?: string; verifier?: string; userId?: string } = {};
  try {
    saved = JSON.parse(request.cookies.get(OAUTH_COOKIE)?.value ?? "{}");
  } catch {
    // treated as missing below
  }
  const state = searchParams.get("state") ?? "";
  // The consent must have been started by this same signed-in user, in this browser.
  if (!saved.state || !saved.verifier || saved.userId !== userId || !same(saved.state, state)) return done("expired");
  if (searchParams.get("error")) return done("denied"); // the user cancelled on Google's screen
  const code = searchParams.get("code");
  if (!code) return done("denied");

  try {
    const tokens = await exchangeCode(config, code, saved.verifier, `${origin}/api/gmail/callback`);
    const googleEmail = await profileEmail(config, tokens.accessToken);
    const supabase = await createClient();
    const { error } = await supabase.from("gmail_connections").upsert({
      user_id: userId,
      google_email: googleEmail,
      encrypted_refresh_token: encryptToken(tokens.refreshToken, config.tokenKey, userId),
      scope: tokens.scope,
      status: "connected",
      connected_at: new Date().toISOString(),
    });
    if (error) {
      // Don't leave a live grant at Google that MoneyMap can't use or revoke later.
      await revokeToken(config, tokens.refreshToken);
      return done("failed");
    }
    return done("connected");
  } catch (e) {
    return done(e instanceof GoogleError && e.code === "scope_missing" ? "scope_missing" : "failed");
  }
}
