import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Currency } from "../mocks/data";

// 메인 대시보드에서 설정한 표시 통화를 앱 전체(자산 총액, 구독 월 지출 등)에서 공유합니다.
// 실제 서비스에서는 users.currency_pref 컬럼과 동기화될 값이며, 지금은 로컬 저장으로 사용자별(기기별) 기본값을 유지합니다.
const STORAGE_KEY = "myfamilyhub_currency";
const DEFAULT_CURRENCY: Currency = "JPY";

interface CurrencyContextValue {
  currency: Currency;
  setCurrency: (currency: Currency) => void;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

function readInitialCurrency(): Currency {
  if (typeof window === "undefined") return DEFAULT_CURRENCY;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "KRW" || stored === "JPY" || stored === "USD" ? stored : DEFAULT_CURRENCY;
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrency] = useState<Currency>(readInitialCurrency);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, currency);
  }, [currency]);

  const value = useMemo<CurrencyContextValue>(() => ({ currency, setCurrency }), [currency]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used within a CurrencyProvider");
  return ctx;
}
