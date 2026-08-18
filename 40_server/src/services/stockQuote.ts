import type { StockMarket } from "../domain/assetTypes.js";
import { HttpError } from "../services/authService.js";

export function currencyForMarket(market: StockMarket): "KRW" | "JPY" | "USD" {
  if (market === "KR") return "KRW";
  if (market === "JP") return "JPY";
  return "USD";
}

/** Build Yahoo Finance symbol from market + user ticker. */
export function toYahooSymbol(market: StockMarket, code: string): string {
  const raw = code.trim().toUpperCase();
  if (!raw) throw new HttpError(400, "stockCode is required for stocks");
  if (raw.includes(".")) return raw;

  if (market === "US") return raw;
  if (market === "JP") return `${raw}.T`;
  // KR: KOSPI .KS by default; user can enter 035420.KQ for KOSDAQ
  const digits = raw.padStart(6, "0");
  return `${digits}.KS`;
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
        currency?: string;
        symbol?: string;
        shortName?: string;
        longName?: string;
      };
    }>;
    error?: { description?: string } | null;
  };
}

export type StockQuote = {
  price: number;
  currency: string;
  symbol: string;
  shortName: string | null;
};

export function quoteCompanyName(quote: {
  shortName?: string | null;
  longName?: string | null;
}): string | null {
  const name = quote.shortName?.trim() || quote.longName?.trim() || "";
  return name ? name.slice(0, 200) : null;
}

function sameName(a: string, b: string): boolean {
  return a.trim().toUpperCase() === b.trim().toUpperCase();
}

/** Create: keep a real nickname; if the user only typed the ticker, use the quote name. */
export function resolveCreateStockLabel(
  userLabel: string,
  stockCode: string,
  quoteName: string | null,
): string {
  const trimmed = userLabel.trim().slice(0, 200);
  const code = stockCode.trim().toUpperCase();
  if (!trimmed || sameName(trimmed, code)) {
    return (quoteName || code).slice(0, 200);
  }
  return trimmed;
}

/**
 * Update: when the ticker/market changes, keep the submitted name only if the user
 * actually edited it. Otherwise follow the quote's company name (or the new ticker).
 */
export function resolveUpdateStockLabel(opts: {
  existingLabel: string;
  incomingLabel: string | undefined;
  previousCode: string | null;
  nextCode: string;
  quoteName: string | null;
  tickerChanged: boolean;
}): string | undefined {
  const nextCode = opts.nextCode.trim().toUpperCase();
  const prevCode = (opts.previousCode ?? "").trim().toUpperCase();
  const incoming = opts.incomingLabel?.trim();
  const quoteName = opts.quoteName?.trim() || null;

  if (opts.tickerChanged) {
    if (incoming) {
      const renamed =
        !sameName(incoming, opts.existingLabel) &&
        !sameName(incoming, prevCode) &&
        !sameName(incoming, nextCode) &&
        !(quoteName && sameName(incoming, quoteName));
      if (renamed) return incoming.slice(0, 200);
    }
    return (quoteName || nextCode).slice(0, 200);
  }

  if (incoming) return incoming.slice(0, 200);
  return undefined;
}

export async function fetchYahooPrice(yahooSymbol: string): Promise<StockQuote> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    yahooSymbol,
  )}?interval=1d&range=1d`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; MyFamilyHub/1.0)",
        accept: "application/json",
      },
    });
  } catch {
    throw new HttpError(502, "failed to reach market data", "QUOTE_UNAVAILABLE");
  }
  if (!res.ok) {
    throw new HttpError(502, `market data HTTP ${res.status}`, "QUOTE_UNAVAILABLE");
  }
  const data = (await res.json()) as YahooChartResponse;
  if (data.chart?.error) {
    throw new HttpError(404, data.chart.error.description ?? "symbol not found", "QUOTE_NOT_FOUND");
  }
  const meta = data.chart?.result?.[0]?.meta;
  const price = meta?.regularMarketPrice;
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
    throw new HttpError(404, `no price for ${yahooSymbol}`, "QUOTE_NOT_FOUND");
  }
  return {
    price,
    currency: meta?.currency ?? "USD",
    symbol: meta?.symbol ?? yahooSymbol,
    shortName: quoteCompanyName(meta ?? {}),
  };
}
