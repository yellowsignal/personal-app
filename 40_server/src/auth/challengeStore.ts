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

export type AuthenticationPurpose = "login" | "reveal-credentials";
export type RevealResourceKind = "subscription" | "document";

export interface PendingAuthentication {
  expiresAt: number;
  purpose: AuthenticationPurpose;
  userId?: number;
  /** @deprecated use revealKind + revealId */
  subscriptionId?: number;
  revealKind?: RevealResourceKind;
  revealId?: number;
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

  putAuthentication(
    challenge: string,
    data: Omit<PendingAuthentication, "expiresAt"> = { purpose: "login" },
  ): void {
    this.authentications.set(challenge, { ...data, expiresAt: Date.now() + TTL_MS });
  }

  takeAuthentication(challenge: string): PendingAuthentication | null {
    const item = this.authentications.get(challenge);
    this.authentications.delete(challenge);
    if (!item || item.expiresAt < Date.now()) return null;
    return item;
  }
}
