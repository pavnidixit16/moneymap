import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { cache } from "react";
import { supabaseEnv } from "./env";

// Supabase client for Server Components, Server Actions and Route Handlers.
// Memoised per request, so one page render shares a single client.
export const createClient = cache(async () => {
  // Per-user data is always rendered at request time, never prerendered.
  await connection();
  const cookieStore = await cookies();
  const { url, key } = supabaseEnv();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components cannot set cookies; the proxy refreshes the session instead.
        }
      },
    },
  });
});

// Verified identity of the signed-in user, or null. Never trusts an unverified cookie.
// Memoised per request: every data function calls it, but it is verified once per render.
export const getVerifiedUserId = cache(async (): Promise<string | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return data.claims.sub;
});
