import { encryptSecret } from "../auth/secretCrypto.js";
import { isClientE2eCipher } from "../auth/e2eCipher.js";
import { HttpError } from "./authService.js";

/**
 * Prefer client E2E cipher (`loginPasswordCipher` / `secretCipher` already `e2e1.…`).
 * Fall back to plaintext `loginPassword` / `secret` → server AES (legacy).
 */
export function parseSecretCipherField(
  body: Record<string, unknown>,
  mode: "create" | "update",
  opts: {
    cipherKey: "loginPasswordCipher" | "secretCipher";
    plainKey: "loginPassword" | "secret";
    maxPlainLen?: number;
  },
): string | null | undefined {
  const { cipherKey, plainKey, maxPlainLen = 512 } = opts;
  if (cipherKey in body) {
    const value = body[cipherKey];
    if (value === null || value === "") return null;
    if (typeof value !== "string") {
      throw new HttpError(400, `${cipherKey} must be a string`);
    }
    if (!isClientE2eCipher(value)) {
      throw new HttpError(400, `${cipherKey} must be an e2e1 client cipher`, "INVALID_E2E_CIPHER");
    }
    return value.slice(0, 10_000);
  }
  if (!(plainKey in body)) {
    return mode === "create" ? null : undefined;
  }
  const value = body[plainKey];
  if (value === null || value === "") return null;
  if (typeof value !== "string") throw new HttpError(400, `${plainKey} must be a string`);
  if (value.length > maxPlainLen) throw new HttpError(400, `${plainKey} is too long`);
  return encryptSecret(value);
}
