const TTL_MS = 5 * 60 * 1000;

export type RegistrationFlow = "bootstrap" | "invite" | "link";

export interface PendingRegistration {
  flow: RegistrationFlow;
  name: string;
  familyName?: string;
  inviteTokenId?: number;
  familyId?: number;
  role?: "OWNER" | "MEMBER";
  userId?: number;
  languagePref: string;
  currencyPref: string;
  countryPref: string;
  expiresAt: number;
}

export interface PendingAuthentication {
  expiresAt: number;
}

export class ChallengeStore {
  private registrations = new Map<string, PendingRegistration>();
  private authentications = new Map<string, PendingAuthentication>();

  putRegistration(challenge: string, data: Omit<PendingRegistration, "expiresAt">): void {
    this.registrations.set(challenge, { ...data, expiresAt: Date.now() + TTL_MS });
  }

  takeRegistration(challenge: string): PendingRegistration | null {
    const item = this.registrations.get(challenge);
    this.registrations.delete(challenge);
    if (!item || item.expiresAt < Date.now()) return null;
    return item;
  }

  putAuthentication(challenge: string): void {
    this.authentications.set(challenge, { expiresAt: Date.now() + TTL_MS });
  }

  takeAuthentication(challenge: string): boolean {
    const item = this.authentications.get(challenge);
    this.authentications.delete(challenge);
    return Boolean(item && item.expiresAt >= Date.now());
  }
}
