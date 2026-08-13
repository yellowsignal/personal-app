export interface WebAuthnConfig {
  rpID: string;
  rpName: string;
  origin: string;
}

export function getWebAuthnConfig(): WebAuthnConfig {
  return {
    rpID: process.env.WEBAUTHN_RP_ID ?? "localhost",
    rpName: process.env.WEBAUTHN_RP_NAME ?? "すみっチョぐらし",
    origin: process.env.WEBAUTHN_ORIGIN ?? "http://localhost:5173",
  };
}
