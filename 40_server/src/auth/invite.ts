import { randomBytes } from "node:crypto";

/** e.g. FAM-8X39A */
export function generateInviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(5);
  let body = "";
  for (let i = 0; i < 5; i++) {
    body += alphabet[bytes[i]! % alphabet.length];
  }
  return `FAM-${body}`;
}
