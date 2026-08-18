import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createApp } from "./app.js";
import { TaskStore } from "./store.js";
import { MemoryAuthRepository } from "./domain/memoryAuthRepository.js";
import { MemoryAssetRepository } from "./domain/memoryAssetRepository.js";
import { MemoryDocumentRepository } from "./domain/memoryDocumentRepository.js";
import { MemorySubscriptionRepository } from "./domain/memorySubscriptionRepository.js";
import { MemoryCalendarRepository } from "./domain/memoryCalendarRepository.js";
import { MemoryRecurringDepositRepository } from "./domain/memoryRecurringDepositRepository.js";
import { MemoryTransactionRepository } from "./domain/memoryTransactionRepository.js";
import { MemoryPasskeyRepository } from "./domain/memoryPasskeyRepository.js";
import { MemoryInviteTokenRepository } from "./domain/memoryInviteTokenRepository.js";
import { MemoryCompanyCalendarRepository } from "./domain/memoryCompanyCalendarRepository.js";
import { ChallengeStore } from "./auth/challengeStore.js";
import { parseCompanyCalendarPdf } from "./domain/companyCalendarParse.js";
import { assertAllowedCalendarUrl, fetchAndParseCompanyCalendarPdf } from "./domain/companyCalendarFetch.js";
import { fiscalYearRange, japanFiscalYear, substituteCalendarYear } from "./domain/companyHolidays.js";
import { KHI_AKASHI_FY2026_OFF_DATES } from "./domain/khiAkashiFy2026OffDates.js";

function tmpStore(): TaskStore {
  const dir = mkdtempSync(join(tmpdir(), "personal-app-"));
  return new TaskStore(join(dir, "tasks.json"));
}

async function listen(app: ReturnType<typeof createApp>) {
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("expected TCP address");
  return { server, base: `http://127.0.0.1:${address.port}` };
}

test("union calendar URL year substitution and host allowlist", () => {
  const url = "https://www.khiunion.or.jp/wp-content/themes/kawasakijukou/pdf/calendar/2026/09_2026-akashi-A.pdf";
  assert.equal(
    substituteCalendarYear(url, 2027),
    "https://www.khiunion.or.jp/wp-content/themes/kawasakijukou/pdf/calendar/2027/09_2027-akashi-A.pdf",
  );
  assert.equal(assertAllowedCalendarUrl(url).hostname, "www.khiunion.or.jp");
  assert.throws(() => assertAllowedCalendarUrl("https://evil.example/calendar.pdf"));
});

test("calendar PDF fetch sends Referer so union hotlink protection allows the file", async () => {
  const seen: { referer?: string; ua?: string } = {};
  const url = "https://www.khiunion.or.jp/wp-content/themes/kawasakijukou/pdf/calendar/2026/09_2026-akashi-A.pdf";
  await assert.rejects(
    () =>
      fetchAndParseCompanyCalendarPdf(url, {
        year: 2026,
        fetchImpl: (async (_input, init) => {
          const headers = new Headers(init?.headers);
          seen.referer = headers.get("referer") ?? "";
          seen.ua = headers.get("user-agent") ?? "";
          return new Response("<html>home</html>", {
            status: 200,
            headers: { "content-type": "text/html" },
          });
        }) as typeof fetch,
      }),
    (err: unknown) => (err as { code?: string }).code === "NEEDS_UPLOAD",
  );
  assert.equal(seen.referer, "https://www.khiunion.or.jp/");
  assert.match(seen.ua ?? "", /Mozilla\/5\.0/);
});

test("import-url returns NEEDS_UPLOAD when the site returns a homepage HTML instead of a PDF", async () => {
  const html = new TextEncoder().encode("<html>login</html>");
  const app = createApp(tmpStore(), {
    authRepo: new MemoryAuthRepository(),
    calendarRepo: new MemoryCalendarRepository(),
    assetRepo: new MemoryAssetRepository(),
    documentRepo: new MemoryDocumentRepository(),
    subscriptionRepo: new MemorySubscriptionRepository(),
    recurringDepositRepo: new MemoryRecurringDepositRepository(),
    transactionRepo: new MemoryTransactionRepository(),
    passkeyRepo: new MemoryPasskeyRepository(),
    inviteTokenRepo: new MemoryInviteTokenRepository(),
    challengeStore: new ChallengeStore(),
    companyCalendarRepo: new MemoryCompanyCalendarRepository(),
    jwtSecret: "test-secret",
    calendarFetch: (async () =>
      new Response(html, { status: 200, headers: { "content-type": "text/html" } })) as typeof fetch,
  });
  const { server, base } = await listen(app);
  try {
    const reg = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "cal-pdf@example.com",
        password: "password123",
        name: "민호",
        familyName: "최가네",
      }),
    });
    assert.equal(reg.status, 201);
    const { token } = (await reg.json()) as { token: string };
    const res = await fetch(`${base}/api/company-calendar/import-url`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        url: "https://www.khiunion.or.jp/wp-content/themes/kawasakijukou/pdf/calendar/2026/09_2026-akashi-A.pdf",
        year: 2026,
      }),
    });
    assert.equal(res.status, 409);
    const body = (await res.json()) as { code?: string };
    assert.equal(body.code, "NEEDS_UPLOAD");
  } finally {
    server.close();
  }
});

test("union calendar PDF with unreadable fonts is parsed from red holiday circles", async () => {
  const pdfPath = "/tmp/khi-cal/union-real.pdf";
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(readFileSync(pdfPath));
  } catch {
    return;
  }
  const parsed = await parseCompanyCalendarPdf(bytes, { yearHint: 2026 });
  assert.equal(parsed.fiscalYear, 2026);
  assert.deepEqual(parsed.offDates, [...KHI_AKASHI_FY2026_OFF_DATES]);
  assert.equal(parsed.offDates.includes("2026-11-03"), false, "Culture Day is a company workday");
  assert.ok(parsed.offDates.includes("2026-07-21"));
  assert.ok(parsed.offDates.includes("2026-12-29"));
});

test("import-pdf stores parsed off dates and uses them on the calendar", async () => {
  const pdfPath = "/tmp/khi-cal/bk117.pdf";
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(readFileSync(pdfPath));
  } catch {
    return;
  }
  const parsed = await parseCompanyCalendarPdf(bytes, { yearHint: 2026 });
  assert.ok(parsed.offDates.includes("2026-04-30"));
  assert.ok(parsed.offDates.includes("2026-11-23"));
  assert.equal(parsed.offDates.includes("2026-11-03"), false);
  assert.equal(parsed.fiscalYear, 2026);
  for (const d of ["2026-08-10", "2026-08-12", "2026-08-13", "2026-08-14"]) {
    assert.ok(parsed.offDates.includes(d), d);
  }
  assert.equal(parsed.offDates.length, KHI_AKASHI_FY2026_OFF_DATES.length);

  const app = createApp(tmpStore(), {
    authRepo: new MemoryAuthRepository(),
    calendarRepo: new MemoryCalendarRepository(),
    assetRepo: new MemoryAssetRepository(),
    documentRepo: new MemoryDocumentRepository(),
    subscriptionRepo: new MemorySubscriptionRepository(),
    recurringDepositRepo: new MemoryRecurringDepositRepository(),
    transactionRepo: new MemoryTransactionRepository(),
    passkeyRepo: new MemoryPasskeyRepository(),
    inviteTokenRepo: new MemoryInviteTokenRepository(),
    challengeStore: new ChallengeStore(),
    companyCalendarRepo: new MemoryCompanyCalendarRepository(),
    jwtSecret: "test-secret",
  });
  const { server, base } = await listen(app);
  try {
    const reg = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "pdf-owner@example.com",
        password: "password123",
        name: "민호",
        familyName: "최가네",
      }),
    });
    const { token } = (await reg.json()) as { token: string };
    const imported = await fetch(
      `${base}/api/company-calendar/import-pdf?year=2026&url=${encodeURIComponent("https://www.khiunion.or.jp/wp-content/themes/kawasakijukou/pdf/calendar/2026/09_2026-akashi-A.pdf")}`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/pdf" },
        body: Buffer.from(bytes),
      },
    );
    assert.equal(imported.status, 200);
    const cal = (await imported.json()) as {
      fiscalYear: number;
      weekdayOffCount: number;
      usingBakedFallback: boolean;
      validFrom: string | null;
      validTo: string | null;
      expired: boolean;
    };
    assert.equal(cal.fiscalYear, 2026);
    assert.equal(cal.validFrom, "2026-04-01");
    assert.equal(cal.validTo, "2027-03-31");
    assert.equal(cal.expired, false);
    assert.equal(cal.usingBakedFallback, false);
    assert.ok(cal.weekdayOffCount >= 12);
  } finally {
    server.close();
  }
});

test("company calendar GET scopes a stored PDF to one April–March year", async () => {
  const companyCalendarRepo = new MemoryCompanyCalendarRepository();
  const app = createApp(tmpStore(), {
    authRepo: new MemoryAuthRepository(),
    calendarRepo: new MemoryCalendarRepository(),
    assetRepo: new MemoryAssetRepository(),
    documentRepo: new MemoryDocumentRepository(),
    subscriptionRepo: new MemorySubscriptionRepository(),
    recurringDepositRepo: new MemoryRecurringDepositRepository(),
    transactionRepo: new MemoryTransactionRepository(),
    passkeyRepo: new MemoryPasskeyRepository(),
    inviteTokenRepo: new MemoryInviteTokenRepository(),
    challengeStore: new ChallengeStore(),
    companyCalendarRepo,
    jwtSecret: "test-secret",
  });
  const { server, base } = await listen(app);
  try {
    const reg = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "fy-scope@example.com",
        password: "password123",
        name: "민호",
        familyName: "최가네",
      }),
    });
    assert.equal(reg.status, 201);
    const { token, user } = (await reg.json()) as { token: string; user: { id: number } };

    const empty = await fetch(`${base}/api/company-calendar`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const emptyCal = (await empty.json()) as {
      fiscalYear: number | null;
      expired: boolean;
      validFrom: string | null;
    };
    assert.equal(emptyCal.fiscalYear, null);
    assert.equal(emptyCal.expired, false);
    assert.equal(emptyCal.validFrom, null);

    const on = await fetch(`${base}/api/auth/me`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ companyHolidayPref: "KHI_AKASHI" }),
    });
    assert.equal(on.status, 200);

    const baked = await fetch(`${base}/api/company-calendar`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const bakedCal = (await baked.json()) as {
      fiscalYear: number | null;
      expired: boolean;
      validFrom: string | null;
      validTo: string | null;
      usingBakedFallback: boolean;
    };
    const currentFy = japanFiscalYear();
    const currentRange = fiscalYearRange(currentFy);
    assert.equal(bakedCal.fiscalYear, currentFy);
    assert.equal(bakedCal.validFrom, currentRange.from);
    assert.equal(bakedCal.validTo, currentRange.to);
    assert.equal(bakedCal.expired, false);
    assert.equal(bakedCal.usingBakedFallback, currentFy === 2026);

    await companyCalendarRepo.upsertForUser(user.id, {
      sourceUrl: "https://www.khiunion.or.jp/wp-content/themes/kawasakijukou/pdf/calendar/2025/09_2025-akashi-A.pdf",
      fiscalYear: 2025,
      offDates: ["2025-08-13", "2026-04-02"],
    });
    const stale = await fetch(`${base}/api/company-calendar`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const staleCal = (await stale.json()) as {
      fiscalYear: number;
      expired: boolean;
      validFrom: string;
      validTo: string;
      offDates: string[];
    };
    assert.equal(staleCal.fiscalYear, 2025);
    assert.equal(staleCal.expired, currentFy !== 2025);
    assert.equal(staleCal.validFrom, "2025-04-01");
    assert.equal(staleCal.validTo, "2026-03-31");
    assert.deepEqual(staleCal.offDates, ["2025-08-13"]);
  } finally {
    server.close();
  }
});
