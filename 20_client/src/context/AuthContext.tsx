import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { authApi, type AuthResponse, type FamilySummary, type PublicUser } from "../api/auth";
import { passkeyApi } from "../api/passkey";
import { ApiError } from "../api/http";
import { useCurrency } from "./CurrencyContext";
import { useLanguage } from "../i18n/LanguageContext";
import type { Lang } from "../i18n/translations";
import type { Currency } from "../mocks/data";

const TOKEN_KEY = "myfamilyhub_token";

interface AuthContextValue {
  token: string | null;
  user: PublicUser | null;
  family: FamilySummary | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: {
    email: string;
    password: string;
    name: string;
    inviteCode?: string;
    familyName?: string;
  }) => Promise<void>;
  passkeyLogin: () => Promise<void>;
  passkeyRegister: (input: {
    flow: "bootstrap" | "invite";
    name: string;
    familyName?: string;
    inviteToken?: string;
  }) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  applySession: (session: AuthResponse) => void;
  updateMe: (patch: Partial<{ languagePref: string; currencyPref: string; countryPref: string; name: string }>) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function syncPrefs(
  user: PublicUser,
  setLang: (lang: Lang) => void,
  setCurrency: (currency: Currency) => void,
) {
  if (user.languagePref === "ko" || user.languagePref === "ja") {
    setLang(user.languagePref);
  }
  if (user.currencyPref === "KRW" || user.currencyPref === "JPY" || user.currencyPref === "USD") {
    setCurrency(user.currencyPref);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { setLang, lang } = useLanguage();
  const { setCurrency, currency } = useCurrency();
  const [token, setToken] = useState<string | null>(() =>
    typeof window === "undefined" ? null : window.localStorage.getItem(TOKEN_KEY),
  );
  const [user, setUser] = useState<PublicUser | null>(null);
  const [family, setFamily] = useState<FamilySummary | null>(null);
  const [loading, setLoading] = useState(Boolean(token));

  const applySession = useCallback(
    (session: AuthResponse) => {
      window.localStorage.setItem(TOKEN_KEY, session.token);
      setToken(session.token);
      setUser(session.user);
      setFamily(session.family);
      syncPrefs(session.user, setLang, setCurrency);
    },
    [setCurrency, setLang],
  );

  const logout = useCallback(() => {
    window.localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    setFamily(null);
  }, []);

  const refresh = useCallback(async () => {
    if (!token) {
      setUser(null);
      setFamily(null);
      setLoading(false);
      return;
    }
    try {
      const me = await authApi.me(token);
      setUser(me.user);
      setFamily(me.family);
      syncPrefs(me.user, setLang, setCurrency);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) logout();
    } finally {
      setLoading(false);
    }
  }, [logout, setCurrency, setLang, token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Persist language/currency changes back to server when logged in
  useEffect(() => {
    if (!token || !user) return;
    if (user.languagePref === lang && user.currencyPref === currency) return;
    const timer = window.setTimeout(() => {
      void authApi
        .updateMe(token, { languagePref: lang, currencyPref: currency })
        .then((res) => setUser(res.user))
        .catch(() => {
          /* ignore offline/pref sync errors in mock phase */
        });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [currency, lang, token, user]);

  const updateMe = useCallback(
    async (patch: Partial<{ languagePref: string; currencyPref: string; countryPref: string; name: string }>) => {
      if (!token) return;
      const res = await authApi.updateMe(token, patch);
      setUser(res.user);
    },
    [token],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      family,
      loading,
      applySession,
      logout,
      refresh,
      updateMe,
      login: async (email, password) => {
        const session = await authApi.login({ email, password });
        applySession(session);
      },
      register: async (input) => {
        const session = await authApi.register({
          ...input,
          languagePref: lang,
          currencyPref: currency,
        });
        applySession(session);
      },
      passkeyLogin: async () => {
        const session = await passkeyApi.loginWithPasskey();
        applySession(session);
      },
      passkeyRegister: async (input) => {
        const session = await passkeyApi.registerWithPasskey({
          ...input,
          languagePref: lang,
          currencyPref: currency,
        });
        applySession(session);
      },
    }),
    [applySession, currency, family, lang, loading, logout, refresh, token, updateMe, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
