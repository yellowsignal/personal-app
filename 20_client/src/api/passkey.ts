import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/browser";
import { apiFetch } from "./http";
import type { AuthResponse } from "./auth";

export const passkeyApi = {
  registerOptions(body: {
    flow: "bootstrap" | "invite";
    name: string;
    familyName?: string;
    inviteToken?: string;
    languagePref?: string;
    currencyPref?: string;
  }) {
    return apiFetch<PublicKeyCredentialCreationOptionsJSON>("/api/auth/passkey/register/options", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  registerVerify(body: { challenge: string; response: RegistrationResponseJSON }) {
    return apiFetch<AuthResponse>("/api/auth/passkey/register/verify", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  loginOptions() {
    return apiFetch<PublicKeyCredentialRequestOptionsJSON>("/api/auth/passkey/login/options", {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  loginVerify(body: { challenge: string; response: AuthenticationResponseJSON }) {
    return apiFetch<AuthResponse>("/api/auth/passkey/login/verify", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  async registerWithPasskey(input: {
    flow: "bootstrap" | "invite";
    name: string;
    familyName?: string;
    inviteToken?: string;
    languagePref?: string;
    currencyPref?: string;
  }) {
    const options = await passkeyApi.registerOptions(input);
    const response = await startRegistration({ optionsJSON: options });
    return passkeyApi.registerVerify({ challenge: options.challenge, response });
  },

  async linkWithPasskey(token: string, name: string) {
    const options = await apiFetch<PublicKeyCredentialCreationOptionsJSON>(
      "/api/auth/passkey/link/options",
      {
        method: "POST",
        token,
        body: JSON.stringify({ flow: "link", name }),
      },
    );
    const response = await startRegistration({ optionsJSON: options });
    return apiFetch<AuthResponse>("/api/auth/passkey/link/verify", {
      method: "POST",
      token,
      body: JSON.stringify({ challenge: options.challenge, response }),
    });
  },

  async loginWithPasskey() {
    const options = await passkeyApi.loginOptions();
    const response = await startAuthentication({ optionsJSON: options });
    return passkeyApi.loginVerify({ challenge: options.challenge, response });
  },

  createInviteToken(token: string) {
    return apiFetch<{ token: string; expiresAt: string }>("/api/family/invite/create", {
      method: "POST",
      token,
    });
  },
};

export function isPasskeySupported(): boolean {
  return typeof window !== "undefined" && window.PublicKeyCredential !== undefined;
}
