import { createHash, randomBytes } from "node:crypto";

const TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateInviteTokenPlain(): string {
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += TOKEN_ALPHABET[bytes[i]! % TOKEN_ALPHABET.length];
  }
  return out;
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token.trim().toUpperCase()).digest("hex");
}

export function passkeyUserEmail(userId: number): string {
  return `user-${userId}@passkey.myfamily`;
}
