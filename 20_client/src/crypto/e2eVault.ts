/** Client-side E2E vault crypto (WebCrypto). Passphrase never leaves the device. */

const E2E_PREFIX = "e2e1";
const KDF_ITERATIONS = 310_000;

function b64urlFromBuf(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function bufFromB64url(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Copy into a standalone ArrayBuffer so WebCrypto BufferSource typing accepts it. */
function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function importAesRaw(raw: ArrayBuffer | Uint8Array, extractable = true): Promise<CryptoKey> {
  const keyData = raw instanceof Uint8Array ? asArrayBuffer(raw) : raw;
  return crypto.subtle.importKey("raw", keyData, "AES-GCM", extractable, [
    "encrypt",
    "decrypt",
    "wrapKey",
    "unwrapKey",
  ]);
}

export async function deriveKek(passphrase: string, saltB64: string, iterations = KDF_ITERATIONS): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: asArrayBuffer(bufFromB64url(saltB64)),
      iterations,
      hash: "SHA-256",
    },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey", "encrypt", "decrypt"],
  );
}

async function aesEncryptRaw(key: CryptoKey, plain: Uint8Array): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, asArrayBuffer(plain));
  const ctBytes = new Uint8Array(ct);
  // WebCrypto GCM appends the 16-byte tag to ciphertext; store iv || ciphertext+tag
  const out = new Uint8Array(12 + ctBytes.length);
  out.set(iv, 0);
  out.set(ctBytes, 12);
  return b64urlFromBuf(out);
}

async function aesDecryptRaw(key: CryptoKey, payloadB64: string): Promise<Uint8Array> {
  const buf = bufFromB64url(payloadB64);
  if (buf.length < 12 + 16 + 1) throw new Error("invalid cipher");
  const iv = asArrayBuffer(buf.subarray(0, 12));
  const data = asArrayBuffer(buf.subarray(12));
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return new Uint8Array(plain);
}

export async function wrapKeyWithKek(kek: CryptoKey, rawKey: Uint8Array): Promise<string> {
  return aesEncryptRaw(kek, rawKey);
}

export async function unwrapKeyWithKek(kek: CryptoKey, wrappedB64: string): Promise<CryptoKey> {
  const raw = await aesDecryptRaw(kek, wrappedB64);
  return importAesRaw(raw);
}

export async function generateDekRaw(): Promise<Uint8Array> {
  return crypto.getRandomValues(new Uint8Array(32));
}

export type SecretScope = "personal" | "family";

export function isE2eCipher(value: string): boolean {
  return /^e2e1\.[pf]\./.test(value);
}

export async function encryptSecretE2e(
  dek: CryptoKey,
  plaintext: string,
  scope: SecretScope,
): Promise<string> {
  const scopeTag = scope === "family" ? "f" : "p";
  const blob = await aesEncryptRaw(dek, new TextEncoder().encode(plaintext));
  return `${E2E_PREFIX}.${scopeTag}.${blob}`;
}

export async function decryptSecretE2e(dek: CryptoKey, cipher: string): Promise<string> {
  const m = /^e2e1\.[pf]\.(.+)$/.exec(cipher);
  if (!m) throw new Error("not an e2e cipher");
  const plain = await aesDecryptRaw(dek, m[1]!);
  return new TextDecoder().decode(plain);
}

export async function generateWrapKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"],
  );
}

export async function exportPublicJwk(publicKey: CryptoKey): Promise<string> {
  return JSON.stringify(await crypto.subtle.exportKey("jwk", publicKey));
}

export async function wrapPrivateKey(kek: CryptoKey, privateKey: CryptoKey): Promise<string> {
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", privateKey));
  return wrapKeyWithKek(kek, pkcs8);
}

export async function unwrapPrivateKey(kek: CryptoKey, wrappedB64: string): Promise<CryptoKey> {
  const pkcs8 = await aesDecryptRaw(kek, wrappedB64);
  return crypto.subtle.importKey(
    "pkcs8",
    asArrayBuffer(pkcs8),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["decrypt"],
  );
}

export async function rsaEncryptToPublicJwk(publicKeyJwk: string, raw: Uint8Array): Promise<string> {
  const jwk = JSON.parse(publicKeyJwk) as JsonWebKey;
  const pub = await crypto.subtle.importKey("jwk", jwk, { name: "RSA-OAEP", hash: "SHA-256" }, false, [
    "encrypt",
  ]);
  const ct = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, pub, asArrayBuffer(raw));
  return b64urlFromBuf(ct);
}

export async function rsaDecrypt(privateKey: CryptoKey, ciphertextB64: string): Promise<Uint8Array> {
  const plain = await crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    privateKey,
    asArrayBuffer(bufFromB64url(ciphertextB64)),
  );
  return new Uint8Array(plain);
}

export function newKdfSalt(): string {
  return b64urlFromBuf(crypto.getRandomValues(new Uint8Array(16)));
}

export { KDF_ITERATIONS, b64urlFromBuf };
