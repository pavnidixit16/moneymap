// Encrypts the Gmail refresh token before it is stored. AES-256-GCM with the key from
// GMAIL_TOKEN_KEY; the user id is bound in as associated data, so a token copied to
// another user's row cannot be decrypted.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";

export function encryptToken(token: string, key: Buffer, userId: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(userId));
  const data = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function decryptToken(sealed: string, key: Buffer, userId: string): string | null {
  const [version, iv, tag, data] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(userId));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null; // wrong key, wrong user, or tampered
  }
}
