import { apiFetch, ApiError } from "./http";

export interface CompanyCalendar {
  pref: string;
  enabled: boolean;
  sourceUrl: string | null;
  defaultUrl: string;
  fiscalYear: number | null;
  parsedAt: string | null;
  offDateCount: number;
  weekdayOffCount: number;
  usingBakedFallback: boolean;
  offDates: string[];
}

const KHI_AKASHI_DEFAULT_URL =
  "https://www.khiunion.or.jp/wp-content/themes/kawasakijukou/pdf/calendar/{year}/09_{year}-akashi-A.pdf";

export function japanFiscalYear(now: Date = new Date()): number {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  return m >= 4 ? y : y - 1;
}

export function defaultCompanyCalendarUrl(year: number = japanFiscalYear()): string {
  return KHI_AKASHI_DEFAULT_URL.replaceAll("{year}", String(year));
}

export const companyCalendarApi = {
  get(token: string) {
    return apiFetch<CompanyCalendar>("/api/company-calendar", { token });
  },

  importUrl(token: string, body: { url?: string; year?: number }) {
    return apiFetch<CompanyCalendar>("/api/company-calendar/import-url", {
      method: "POST",
      token,
      body: JSON.stringify(body),
    });
  },

  async importPdf(token: string, file: Blob, opts: { url?: string; year?: number } = {}) {
    const qs = new URLSearchParams();
    if (opts.url) qs.set("url", opts.url);
    if (opts.year) qs.set("year", String(opts.year));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    const res = await fetch(`/api/company-calendar/import-pdf${suffix}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/pdf",
      },
      body: file,
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
    if (!res.ok) {
      throw new ApiError(data.error ?? `request failed (${res.status})`, res.status, data.code);
    }
    return data as CompanyCalendar;
  },

  remove(token: string) {
    return apiFetch<CompanyCalendar>("/api/company-calendar", { method: "DELETE", token });
  },
};
