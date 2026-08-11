import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { randomBytes } from "node:crypto";
import type { ChallengeStore, RegistrationFlow } from "../auth/challengeStore.js";
import { generateInviteCode } from "../auth/invite.js";
import { generateInviteTokenPlain, hashInviteToken, passkeyUserEmail } from "../auth/inviteTokenUtil.js";
import { signAuthToken } from "../auth/token.js";
import { getWebAuthnConfig } from "../auth/webauthnConfig.js";
import type { AuthRepository } from "../domain/authRepository.js";
import type { InviteTokenRepository, PasskeyRepository } from "../domain/passkeyTypes.js";
import { toPublicUser, type FamilySummary, type PublicUser } from "../domain/types.js";
import { HttpError } from "./authService.js";

const INVITE_TTL_MS = 48 * 60 * 60 * 1000;

function pickName(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new HttpError(400, "name is required");
  return value.trim();
}

function pickFlow(value: unknown): RegistrationFlow {
  if (value === "bootstrap" || value === "invite" || value === "link") return value;
  throw new HttpError(400, "flow must be bootstrap, invite, or link");
}

function userIdToBytes(userId: number): Uint8Array {
  const buf = new Uint8Array(8);
  new DataView(buf.buffer).setBigUint64(0, BigInt(userId), false);
  return buf;
}

function tempUserIdBytes(): Uint8Array {
  return randomBytes(16);
}

export class PasskeyService {
  constructor(
    private readonly authRepo: AuthRepository,
    private readonly passkeyRepo: PasskeyRepository,
    private readonly inviteRepo: InviteTokenRepository,
    private readonly challenges: ChallengeStore,
    private readonly jwtSecret: string,
  ) {}

  private webauthn() {
    return getWebAuthnConfig();
  }

  private async familySummary(familyId: number): Promise<FamilySummary> {
    const family = await this.authRepo.findFamilyById(familyId);
    if (!family) throw new HttpError(404, "family not found", "FAMILY_NOT_FOUND");
    const members = await this.authRepo.listFamilyMembers(familyId);
    return {
      id: family.id,
      familyName: family.familyName,
      inviteCode: family.inviteCode,
      createdAt: family.createdAt.toISOString(),
      members: members.map((m) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        role: m.role,
      })),
    };
  }

  private session(user: PublicUser, family: FamilySummary | null) {
    const token = signAuthToken({ userId: user.id, email: user.email }, this.jwtSecret);
    return { token, user, family };
  }

  async createInviteToken(ownerUserId: number): Promise<{ token: string; expiresAt: string }> {
    const owner = await this.authRepo.findUserById(ownerUserId);
    if (!owner) throw new HttpError(401, "unauthorized", "UNAUTHORIZED");
    if (!owner.familyId) throw new HttpError(404, "user has no family", "NO_FAMILY");
    if (owner.role !== "OWNER") throw new HttpError(403, "only owner can create invites", "FORBIDDEN");

    const plain = generateInviteTokenPlain();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    await this.inviteRepo.create({
      familyId: owner.familyId,
      tokenHash: hashInviteToken(plain),
      expiresAt,
      createdByUserId: owner.id,
    });
    return { token: plain, expiresAt: expiresAt.toISOString() };
  }

  private async resolveInvite(tokenRaw: unknown): Promise<{ inviteTokenId: number; familyId: number }> {
    if (typeof tokenRaw !== "string" || !tokenRaw.trim()) {
      throw new HttpError(400, "inviteToken is required");
    }
    const record = await this.inviteRepo.findByTokenHash(hashInviteToken(tokenRaw));
    if (!record) throw new HttpError(404, "invite token not found", "INVITE_NOT_FOUND");
    if (record.usedAt) throw new HttpError(400, "invite token already used", "INVITE_USED");
    if (record.expiresAt.getTime() < Date.now()) {
      throw new HttpError(400, "invite token expired", "INVITE_EXPIRED");
    }
    return { inviteTokenId: record.id, familyId: record.familyId };
  }

  async registrationOptions(body: Record<string, unknown>, linkUserId?: number) {
    const flow = pickFlow(body.flow);
    const name = pickName(body.name);
    const { rpID, rpName } = this.webauthn();
    const languagePref = typeof body.languagePref === "string" ? body.languagePref : "ko";
    const currencyPref = typeof body.currencyPref === "string" ? body.currencyPref : "JPY";
    const countryPref = typeof body.countryPref === "string" ? body.countryPref : "JP";

    let pending: Parameters<ChallengeStore["putRegistration"]>[1];
    let userName: string;
    let userID: Uint8Array;
    let excludeCredentials: { id: string }[] = [];

    if (flow === "link") {
      if (!linkUserId) throw new HttpError(401, "unauthorized", "UNAUTHORIZED");
      const user = await this.authRepo.findUserById(linkUserId);
      if (!user) throw new HttpError(401, "unauthorized", "UNAUTHORIZED");
      const existing = await this.passkeyRepo.listByUserId(user.id);
      excludeCredentials = existing.map((c) => ({ id: c.id }));
      pending = {
        flow,
        name: user.name,
        userId: user.id,
        languagePref: user.languagePref,
        currencyPref: user.currencyPref,
        countryPref: user.countryPref,
      };
      userName = user.email;
      userID = userIdToBytes(user.id);
    } else if (flow === "bootstrap") {
      const count = await this.authRepo.countUsers();
      if (count > 0) throw new HttpError(403, "bootstrap registration is closed", "BOOTSTRAP_CLOSED");
      pending = {
        flow,
        name,
        familyName:
          typeof body.familyName === "string" && body.familyName.trim()
            ? body.familyName.trim()
            : `${name} Family`,
        role: "OWNER",
        languagePref,
        currencyPref,
        countryPref,
      };
      userName = name;
      userID = tempUserIdBytes();
    } else {
      const invite = await this.resolveInvite(body.inviteToken);
      const members = await this.authRepo.listFamilyMembers(invite.familyId);
      if (members.length >= 5) throw new HttpError(400, "family is full", "FAMILY_FULL");
      pending = {
        flow,
        name,
        inviteTokenId: invite.inviteTokenId,
        familyId: invite.familyId,
        role: "MEMBER",
        languagePref,
        currencyPref,
        countryPref,
      };
      userName = name;
      userID = tempUserIdBytes();
    }

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userName,
      userDisplayName: name,
      userID: userID as Uint8Array<ArrayBuffer>,
      attestationType: "none",
      excludeCredentials,
      authenticatorSelection: {
        residentKey: "preferred",
        requireResidentKey: false,
        userVerification: "preferred",
      },
    });

    this.challenges.putRegistration(options.challenge, pending);
    return options;
  }

  async registrationVerify(body: Record<string, unknown>, linkUserId?: number) {
    const response = body.response as RegistrationResponseJSON | undefined;
    const challenge = typeof body.challenge === "string" ? body.challenge : null;
    if (!response || !challenge) throw new HttpError(400, "response and challenge are required");

    const regPending = this.challenges.takeRegistration(challenge);
    if (!regPending) throw new HttpError(400, "registration session expired", "CHALLENGE_EXPIRED");

    if (regPending.flow === "link" && linkUserId !== regPending.userId) {
      throw new HttpError(403, "forbidden", "FORBIDDEN");
    }

    const { rpID, origin } = this.webauthn();
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw new HttpError(400, "passkey verification failed", "PASSKEY_INVALID");
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
    let userId: number;

    if (regPending.flow === "link") {
      userId = regPending.userId!;
    } else if (regPending.flow === "bootstrap") {
      const invite = generateInviteCode();
      const { user } = await this.authRepo.createOwnerWithFamily({
        email: `pending-${randomBytes(8).toString("hex")}@passkey.myfamily`,
        passwordHash: null,
        name: regPending.name,
        familyName: regPending.familyName ?? `${regPending.name} Family`,
        inviteCode: invite,
        languagePref: regPending.languagePref,
        countryPref: regPending.countryPref,
        currencyPref: regPending.currencyPref,
      });
      userId = user.id;
    } else {
      const user = await this.authRepo.createUser({
        email: `pending-${randomBytes(8).toString("hex")}@passkey.myfamily`,
        passwordHash: null,
        name: regPending.name,
        familyId: regPending.familyId!,
        role: "MEMBER",
        languagePref: regPending.languagePref,
        countryPref: regPending.countryPref,
        currencyPref: regPending.currencyPref,
      });
      userId = user.id;
      if (regPending.inviteTokenId) {
        await this.inviteRepo.markUsed(regPending.inviteTokenId, userId);
      }
    }

    await this.authRepo.updateUser(userId, { email: passkeyUserEmail(userId) });

    await this.passkeyRepo.create({
      id: credential.id,
      userId,
      publicKey: new Uint8Array(credential.publicKey),
      counter: credential.counter,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      transports: credential.transports ?? null,
    });

    const userRecord = await this.authRepo.findUserById(userId);
    if (!userRecord) throw new HttpError(500, "user creation failed");

    const family = userRecord.familyId ? await this.familySummary(userRecord.familyId) : null;
    return this.session(toPublicUser(userRecord), family);
  }

  async loginOptions() {
    const { rpID } = this.webauthn();
    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: "required",
    });
    this.challenges.putAuthentication(options.challenge);
    return options;
  }

  async loginVerify(body: Record<string, unknown>) {
    const response = body.response as AuthenticationResponseJSON | undefined;
    const challenge = typeof body.challenge === "string" ? body.challenge : null;
    if (!response || !challenge) throw new HttpError(400, "response and challenge are required");
    if (!this.challenges.takeAuthentication(challenge)) {
      throw new HttpError(400, "login session expired", "CHALLENGE_EXPIRED");
    }

    const credentialId = response.id;
    const stored = await this.passkeyRepo.findByCredentialId(credentialId);
    if (!stored) throw new HttpError(401, "passkey not registered", "PASSKEY_NOT_FOUND");

    const { rpID, origin } = this.webauthn();
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: stored.id,
        publicKey: stored.publicKey as Uint8Array<ArrayBuffer>,
        counter: stored.counter,
        transports: (stored.transports ?? undefined) as AuthenticatorTransportFuture[] | undefined,
      },
      requireUserVerification: true,
    });

    if (!verification.verified) {
      throw new HttpError(401, "passkey verification failed", "PASSKEY_INVALID");
    }

    await this.passkeyRepo.updateCounter(stored.id, verification.authenticationInfo.newCounter);

    const user = await this.authRepo.findUserById(stored.userId);
    if (!user) throw new HttpError(401, "unauthorized", "UNAUTHORIZED");

    const family = user.familyId ? await this.familySummary(user.familyId) : null;
    return this.session(toPublicUser(user), family);
  }
}
