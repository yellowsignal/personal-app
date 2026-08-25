/** Client E2E ciphertext: e2e1.p.<blob> or e2e1.f.<blob> */
export function isClientE2eCipher(value: string): boolean {
  return /^e2e1\.[pf]\.[A-Za-z0-9_-]+$/.test(value);
}

export function e2eCipherScope(value: string): "personal" | "family" | null {
  if (value.startsWith("e2e1.p.")) return "personal";
  if (value.startsWith("e2e1.f.")) return "family";
  return null;
}
