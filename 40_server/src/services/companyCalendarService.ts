import { HttpError } from "./authService.js";
import type { AuthRepository } from "../domain/authRepository.js";
import type { CompanyCalendarRepository } from "../domain/companyCalendarRepository.js";
import {
  fetchAndParseCompanyCalendarPdf,
  parseUploadedCompanyCalendarPdf,
  yearFromCalendarUrl,
} from "../domain/companyCalendarFetch.js";
import {
  bakedOffDatesForCal,
  japanFiscalYear,
  khiAkashiCalendarUrl,
  parseCompanyHolidayPref,
  weekdayCount,
} from "../domain/companyHolidays.js";

export interface PublicCompanyCalendar {
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

export class CompanyCalendarService {
  constructor(
    private readonly authRepo: AuthRepository,
    private readonly repo: CompanyCalendarRepository,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async requireUser(userId: number) {
    const user = await this.authRepo.findUserById(userId);
    if (!user) throw new HttpError(401, "unauthorized", "UNAUTHORIZED");
    return user;
  }

  async get(userId: number): Promise<PublicCompanyCalendar> {
    const user = await this.requireUser(userId);
    const pref = parseCompanyHolidayPref(user.companyHolidayPref);
    const stored = await this.repo.findByUserId(userId);
    const year = stored?.fiscalYear ?? japanFiscalYear();
    const baked = bakedOffDatesForCal(pref);
    const offDates = stored?.offDates ?? (pref === "KHI_AKASHI" ? [...(baked ?? [])] : []);
    return {
      pref,
      enabled: pref !== "NONE",
      sourceUrl: stored?.sourceUrl ?? (pref === "KHI_AKASHI" ? khiAkashiCalendarUrl(year) : null),
      defaultUrl: khiAkashiCalendarUrl(year),
      fiscalYear: stored?.fiscalYear ?? (pref === "KHI_AKASHI" ? 2026 : null),
      parsedAt: stored?.parsedAt.toISOString() ?? null,
      offDateCount: offDates.length,
      weekdayOffCount: weekdayCount(offDates),
      usingBakedFallback: !stored && pref === "KHI_AKASHI",
      offDates,
    };
  }

  async importFromUrl(userId: number, body: Record<string, unknown>): Promise<PublicCompanyCalendar> {
    const user = await this.requireUser(userId);
    const year =
      typeof body.year === "number" && Number.isInteger(body.year)
        ? body.year
        : typeof body.year === "string" && /^\d{4}$/.test(body.year)
          ? Number(body.year)
          : undefined;
    const fallbackYear = year ?? japanFiscalYear();
    const url =
      typeof body.url === "string" && body.url.trim()
        ? body.url.trim()
        : khiAkashiCalendarUrl(fallbackYear);
    const { parsed, sourceUrl } = await fetchAndParseCompanyCalendarPdf(url, {
      year: year ?? yearFromCalendarUrl(url, fallbackYear),
      fetchImpl: this.fetchImpl,
    });
    await this.repo.upsertForUser(userId, {
      sourceUrl,
      fiscalYear: parsed.fiscalYear,
      offDates: parsed.offDates,
    });
    if (parseCompanyHolidayPref(user.companyHolidayPref) === "NONE") {
      await this.authRepo.updateUser(userId, { companyHolidayPref: "KHI_AKASHI" });
    }
    return this.get(userId);
  }

  async importFromPdf(
    userId: number,
    bytes: Uint8Array,
    body: { url?: string; year?: number },
  ): Promise<PublicCompanyCalendar> {
    const user = await this.requireUser(userId);
    const yearHint = body.year ?? japanFiscalYear();
    const parsed = await parseUploadedCompanyCalendarPdf(bytes, { yearHint });
    const sourceUrl =
      typeof body.url === "string" && body.url.trim() ? body.url.trim() : khiAkashiCalendarUrl(parsed.fiscalYear);
    await this.repo.upsertForUser(userId, {
      sourceUrl,
      fiscalYear: parsed.fiscalYear,
      offDates: parsed.offDates,
    });
    if (parseCompanyHolidayPref(user.companyHolidayPref) === "NONE") {
      await this.authRepo.updateUser(userId, { companyHolidayPref: "KHI_AKASHI" });
    }
    return this.get(userId);
  }

  async remove(userId: number): Promise<PublicCompanyCalendar> {
    await this.requireUser(userId);
    await this.repo.removeForUser(userId);
    return this.get(userId);
  }
}
