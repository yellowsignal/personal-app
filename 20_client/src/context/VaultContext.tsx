import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./AuthContext";
import { vaultKeysApi } from "../api/vaultKeys";
import {
  decryptSecretE2e,
  deriveKek,
  encryptSecretE2e,
  exportPublicJwk,
  generateDekRaw,
  generateWrapKeyPair,
  isE2eCipher,
  KDF_ITERATIONS,
  newKdfSalt,
  rsaDecrypt,
  rsaEncryptToPublicJwk,
  unwrapKeyWithKek,
  unwrapPrivateKey,
  wrapKeyWithKek,
  wrapPrivateKey,
  type SecretScope,
} from "../crypto/e2eVault";

type VaultStatus = "unknown" | "missing" | "locked" | "unlocked";

interface VaultContextValue {
  status: VaultStatus;
  hasFamilyDek: boolean;
  pendingDelivery: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setup: (passphrase: string) => Promise<void>;
  unlock: (passphrase: string) => Promise<void>;
  lock: () => void;
  encryptSecret: (plaintext: string, scope: SecretScope) => Promise<string>;
  decryptSecret: (cipher: string) => Promise<string>;
  deliverFamilyDekTo: (toUserId: number, publicKeyJwk: string) => Promise<void>;
  acceptPendingFamilyDek: (passphrase?: string) => Promise<void>;
  ensureUnlocked: () => boolean;
}

const VaultContext = createContext<VaultContextValue | null>(null);

export function VaultProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  const [status, setStatus] = useState<VaultStatus>("unknown");
  const [hasFamilyDek, setHasFamilyDek] = useState(false);
  const [pendingDelivery, setPendingDelivery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [personalDek, setPersonalDek] = useState<CryptoKey | null>(null);
  const [familyDek, setFamilyDek] = useState<CryptoKey | null>(null);
  const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null);
  const [sessionKek, setSessionKek] = useState<CryptoKey | null>(null);
  const [pkgMeta, setPkgMeta] = useState<{
    kdfSalt: string;
    kdfIterations: number;
    personalDekWrapped: string;
    privateKeyWrapped: string;
    familyDekWrapped: string | null;
    pendingCipher: string | null;
  } | null>(null);

  const lock = useCallback(() => {
    setPersonalDek(null);
    setFamilyDek(null);
    setPrivateKey(null);
    setSessionKek(null);
    setStatus((s) => (s === "missing" || s === "unknown" ? s : "locked"));
  }, []);

  const refresh = useCallback(async () => {
    if (!token || !user) {
      setStatus("unknown");
      setPkgMeta(null);
      lock();
      return;
    }
    try {
      const me = await vaultKeysApi.me(token);
      if (!me.configured || !me.package) {
        setStatus("missing");
        setHasFamilyDek(false);
        setPendingDelivery(false);
        setPkgMeta(null);
        lock();
        return;
      }
      setHasFamilyDek(me.package.hasFamilyDek);
      setPendingDelivery(Boolean(me.pendingFamilyDek));
      setPkgMeta({
        kdfSalt: me.package.kdfSalt,
        kdfIterations: me.package.kdfIterations,
        personalDekWrapped: me.package.personalDekWrapped,
        privateKeyWrapped: me.package.privateKeyWrapped,
        familyDekWrapped: me.package.familyDekWrapped,
        pendingCipher: me.pendingFamilyDek?.ciphertext ?? null,
      });
      setStatus((prev) => (prev === "unlocked" && personalDek ? "unlocked" : "locked"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "vault refresh failed");
    }
  }, [lock, personalDek, token, user]);

  useEffect(() => {
    void refresh();
  }, [token, user?.id]);

  const unlockWithPassphrase = useCallback(
    async (passphrase: string, meta: NonNullable<typeof pkgMeta>) => {
      const kek = await deriveKek(passphrase, meta.kdfSalt, meta.kdfIterations);
      const pDek = await unwrapKeyWithKek(kek, meta.personalDekWrapped);
      const priv = await unwrapPrivateKey(kek, meta.privateKeyWrapped);
      let fDek: CryptoKey | null = null;
      if (meta.familyDekWrapped) {
        fDek = await unwrapKeyWithKek(kek, meta.familyDekWrapped);
      }
      setPersonalDek(pDek);
      setFamilyDek(fDek);
      setPrivateKey(priv);
      setSessionKek(kek);
      setHasFamilyDek(Boolean(fDek));
      setStatus("unlocked");
      setError(null);
      return { kek, pDek, fDek, priv };
    },
    [],
  );

  const setup = useCallback(
    async (passphrase: string) => {
      if (!token || !user) throw new Error("not logged in");
      if (passphrase.length < 8) throw new Error("passphrase too short");
      const salt = newKdfSalt();
      const kek = await deriveKek(passphrase, salt, KDF_ITERATIONS);
      const personalRaw = await generateDekRaw();
      const familyRaw = await generateDekRaw();
      const pair = await generateWrapKeyPair();
      const personalDekWrapped = await wrapKeyWithKek(kek, personalRaw);
      const familyDekWrapped = await wrapKeyWithKek(kek, familyRaw);
      const privateKeyWrapped = await wrapPrivateKey(kek, pair.privateKey);
      const publicKeyJwk = await exportPublicJwk(pair.publicKey);
      await vaultKeysApi.setup(token, {
        kdfSalt: salt,
        kdfIterations: KDF_ITERATIONS,
        personalDekWrapped,
        privateKeyWrapped,
        publicKeyJwk,
        familyDekWrapped: user.familyId ? familyDekWrapped : null,
      });
      await refresh();
      await unlockWithPassphrase(passphrase, {
        kdfSalt: salt,
        kdfIterations: KDF_ITERATIONS,
        personalDekWrapped,
        privateKeyWrapped,
        familyDekWrapped: user.familyId ? familyDekWrapped : null,
        pendingCipher: null,
      });
    },
    [refresh, token, unlockWithPassphrase, user],
  );

  const unlock = useCallback(
    async (passphrase: string) => {
      if (!pkgMeta) throw new Error("vault not configured");
      await unlockWithPassphrase(passphrase, pkgMeta);
    },
    [pkgMeta, unlockWithPassphrase],
  );

  const encryptSecret = useCallback(
    async (plaintext: string, scope: SecretScope) => {
      const dek = scope === "family" ? familyDek : personalDek;
      if (!dek) throw new Error("vault locked");
      if (scope === "family" && !familyDek) throw new Error("family DEK missing");
      return encryptSecretE2e(dek, plaintext, scope);
    },
    [familyDek, personalDek],
  );

  const decryptSecret = useCallback(
    async (cipher: string) => {
      if (!isE2eCipher(cipher)) throw new Error("not e2e");
      const scope = cipher.startsWith("e2e1.f.") ? "family" : "personal";
      const dek = scope === "family" ? familyDek : personalDek;
      if (!dek) throw new Error("vault locked");
      return decryptSecretE2e(dek, cipher);
    },
    [familyDek, personalDek],
  );

  const deliverFamilyDekTo = useCallback(
    async (toUserId: number, publicKeyJwk: string) => {
      if (!token || !familyDek) throw new Error("family DEK not unlocked");
      const raw = new Uint8Array(await crypto.subtle.exportKey("raw", familyDek));
      const ciphertext = await rsaEncryptToPublicJwk(publicKeyJwk, raw);
      await vaultKeysApi.deliverFamily(token, { toUserId, ciphertext });
      await refresh();
    },
    [familyDek, refresh, token],
  );

  const acceptPendingFamilyDek = useCallback(
    async (passphrase?: string) => {
      if (!token || !pkgMeta?.pendingCipher) throw new Error("no pending delivery");
      let priv = privateKey;
      let kek = sessionKek;
      if (!priv || !kek) {
        if (!passphrase) throw new Error("unlock vault first");
        const unlocked = await unlockWithPassphrase(passphrase, pkgMeta);
        priv = unlocked.priv;
        kek = unlocked.kek;
      }
      if (!priv || !kek) throw new Error("private key missing");
      const raw = await rsaDecrypt(priv, pkgMeta.pendingCipher);
      const familyDekWrapped = await wrapKeyWithKek(kek, raw);
      await vaultKeysApi.acceptFamily(token, { familyDekWrapped });
      const fDek = await unwrapKeyWithKek(kek, familyDekWrapped);
      setFamilyDek(fDek);
      setHasFamilyDek(true);
      setPendingDelivery(false);
      await refresh();
    },
    [pkgMeta, privateKey, refresh, sessionKek, token, unlockWithPassphrase],
  );

  const value = useMemo<VaultContextValue>(
    () => ({
      status,
      hasFamilyDek,
      pendingDelivery,
      error,
      refresh,
      setup,
      unlock,
      lock,
      encryptSecret,
      decryptSecret,
      deliverFamilyDekTo,
      acceptPendingFamilyDek,
      ensureUnlocked: () => status === "unlocked" && Boolean(personalDek),
    }),
    [
      acceptPendingFamilyDek,
      decryptSecret,
      deliverFamilyDekTo,
      encryptSecret,
      error,
      hasFamilyDek,
      lock,
      pendingDelivery,
      personalDek,
      refresh,
      setup,
      status,
      unlock,
    ],
  );

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function useVault() {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error("useVault must be used within VaultProvider");
  return ctx;
}
