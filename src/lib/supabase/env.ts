// Public Supabase settings. Both values are safe to expose: data access is enforced
// by row-level security in the database, not by keeping these secret.

// Accepts the project URL with common copy-paste extras (the REST path from the
// dashboard, trailing slashes, whitespace) and returns the bare origin the clients need.
export function normalizeSupabaseUrl(raw: string): string {
  const url = new URL(raw.trim());
  return url.origin;
}

export function readSupabaseEnv(): { url: string; key: string } | null {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!rawUrl || !key) return null;
  try {
    return { url: normalizeSupabaseUrl(rawUrl), key };
  } catch {
    return null;
  }
}

export function supabaseEnv() {
  const env = readSupabaseEnv();
  if (!env) {
    throw new Error(
      "Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see .env.example).",
    );
  }
  return env;
}
