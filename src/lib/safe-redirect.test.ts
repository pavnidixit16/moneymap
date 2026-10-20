import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-redirect";

describe("safeNextPath", () => {
  it("keeps same-site paths", () => {
    expect(safeNextPath("/commitments?tab=review")).toBe("/commitments?tab=review");
  });

  it.each([null, undefined, "", "https://evil.example", "//evil.example", "/\\evil.example", "overview"])(
    "falls back for %s",
    (value) => {
      expect(safeNextPath(value)).toBe("/overview");
    },
  );
});
