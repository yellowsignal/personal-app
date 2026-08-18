import { HttpError } from "../services/authService.js";
import { isPdfMagic, parseCompanyCalendarPdf, type ParsedCompanyCalendar } from "./companyCalendarParse.js";
import { substituteCalendarYear } from "./companyHolidays.js";

const MAX_PDF_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20_000;

const ALLOWED_HOSTS = new Set([
  "www.khiunion.or.jp",
  "khiunion.or.jp",
  "www.bk117.com",
  "bk117.com",
]);

export interface FetchPdfResult {
  parsed: ParsedCompanyCalendar;
  sourceUrl: string;
}

export function assertAllowedCalendarUrl(raw: unknown): URL {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new HttpError(400, "url is required", "URL_REQUIRED");
  }
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new HttpError(400, "url is invalid", "URL_INVALID");
  }
  if (url.protocol !== "https:") {
    throw new HttpError(400, "url must be https", "URL_INVALID");
  }
  if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase())) {
    throw new HttpError(400, "url host is not allowed", "URL_FORBIDDEN");
  }
  return url;
}

export function yearFromCalendarUrl(url: string, fallback: number): number {
  const m = url.match(/\/calendar\/(20\d{2})\//) ?? url.match(/_(20\d{2})-/);
  if (m) return Number(m[1]);
  return fallback;
}

export async function fetchAndParseCompanyCalendarPdf(
  rawUrl: string,
  opts: { year?: number; fetchImpl?: typeof fetch } = {},
): Promise<FetchPdfResult> {
  const year = opts.year;
  const resolved = year != null ? substituteCalendarYear(rawUrl, year) : rawUrl;
  const url = assertAllowedCalendarUrl(resolved);
  const http = opts.fetchImpl ?? fetch;

  let res: Response;
  try {
    res = await http(url.toString(), {
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { accept: "application/pdf,*/*", "user-agent": "sumicchogurashi-calendar/1.0" },
    });
  } catch {
    throw new HttpError(502, "could not download calendar PDF", "FETCH_FAILED");
  }

  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > MAX_PDF_BYTES) {
    throw new HttpError(400, "PDF is too large", "PDF_TOO_LARGE");
  }
  const contentType = res.headers.get("content-type") ?? "";
  const looksHtml = contentType.includes("text/html") || !isPdfMagic(buf);
  if (!res.ok || looksHtml) {
    throw new HttpError(
      409,
      "calendar PDF requires login — download it on this phone and upload the file",
      "NEEDS_UPLOAD",
    );
  }

  try {
    const parsed = await parseCompanyCalendarPdf(buf, {
      yearHint: year ?? yearFromCalendarUrl(url.toString(), japanFiscalYearUtc()),
    });
    return { parsed, sourceUrl: url.toString() };
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "PARSE_FAILED") {
      throw new HttpError(422, "could not read holidays from this PDF", "PARSE_FAILED");
    }
    throw err;
  }
}

export async function parseUploadedCompanyCalendarPdf(
  bytes: Uint8Array,
  opts: { yearHint?: number } = {},
): Promise<ParsedCompanyCalendar> {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_PDF_BYTES) {
    throw new HttpError(400, "PDF is missing or too large", "PDF_TOO_LARGE");
  }
  if (!isPdfMagic(bytes)) {
    throw new HttpError(400, "file is not a PDF", "NOT_PDF");
  }
  try {
    return await parseCompanyCalendarPdf(bytes, { yearHint: opts.yearHint });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "PARSE_FAILED") {
      throw new HttpError(422, "could not read holidays from this PDF", "PARSE_FAILED");
    }
    throw err;
  }
}

function japanFiscalYearUtc(): number {
  const now = new Date();
  const y = now.getUTCFullYear();
  return now.getUTCMonth() + 1 >= 4 ? y : y - 1;
}
