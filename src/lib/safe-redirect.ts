// Only allow redirects to paths on this site, so a crafted login link cannot send
// someone to another domain after sign-in.
export function safeNextPath(next: string | null | undefined, fallback = "/overview"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return next;
}
