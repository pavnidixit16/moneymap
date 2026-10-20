import { describe, expect, it } from "vitest";
import { normalizeSupabaseUrl } from "./env";

describe("normalizeSupabaseUrl", () => {
  it.each([
    "https://abc.supabase.co",
    "https://abc.supabase.co/",
    "https://abc.supabase.co/rest/v1/",
    "https://abc.supabase.co/rest/v1",
    "  https://abc.supabase.co  ",
  ])("reduces %s to the project origin", (raw) => {
    expect(normalizeSupabaseUrl(raw)).toBe("https://abc.supabase.co");
  });

  it("rejects values that are not URLs", () => {
    expect(() => normalizeSupabaseUrl("abc.supabase.co")).toThrow();
  });
});
