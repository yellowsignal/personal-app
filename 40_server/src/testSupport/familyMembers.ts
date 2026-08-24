import { hashPassword } from "../auth/password.js";
import type { MemoryAuthRepository } from "../domain/memoryAuthRepository.js";

/** Seed a family MEMBER for tests (password register with FAM is closed). */
export async function seedFamilyMember(
  authRepo: MemoryAuthRepository,
  input: {
    familyId: number;
    email: string;
    name?: string;
    password?: string;
  },
): Promise<void> {
  const password = input.password ?? "password123";
  await authRepo.createUser({
    email: input.email.toLowerCase(),
    passwordHash: await hashPassword(password),
    name: input.name ?? "Member",
    familyId: input.familyId,
    role: "MEMBER",
    languagePref: "ko",
    countryPref: "JP",
    currencyPref: "JPY",
  });
}

export async function loginForToken(
  base: string,
  email: string,
  password = "password123",
): Promise<string> {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(`login failed: ${res.status}`);
  }
  const body = (await res.json()) as { token: string };
  return body.token;
}
