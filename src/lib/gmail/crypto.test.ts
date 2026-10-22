import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptToken, encryptToken } from "./crypto";

const key = randomBytes(32);
const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";

describe("refresh token encryption", () => {
  it("round-trips and never contains the token in plain text", () => {
    const sealed = encryptToken("1//refresh-token-value", key, A);
    expect(sealed).not.toContain("refresh-token-value");
    expect(decryptToken(sealed, key, A)).toBe("1//refresh-token-value");
  });

  it("uses a fresh nonce each time", () => {
    expect(encryptToken("t", key, A)).not.toBe(encryptToken("t", key, A));
  });

  it("refuses another user's row, another key, or a tampered value", () => {
    const sealed = encryptToken("secret", key, A);
    expect(decryptToken(sealed, key, B)).toBeNull();
    expect(decryptToken(sealed, randomBytes(32), A)).toBeNull();
    const parts = sealed.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(decryptToken(parts.join("."), key, A)).toBeNull();
    expect(decryptToken("garbage", key, A)).toBeNull();
  });
});
