import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Copy, Bell, Fingerprint, Globe, LogOut, UserPlus, Users, CalendarDays, Factory } from "lucide-react";
import TopBar from "../components/TopBar";
import HolidayPrefPicker, { parseHolidayPref, type HolidayPref } from "../components/HolidayPrefPicker";
import { ApiError } from "../api/http";
import { companyCalendarApi, defaultCompanyCalendarUrl, japanFiscalYear, type CompanyCalendar } from "../api/companyCalendar";
import { passkeyApi } from "../api/passkey";
import {
  disableHomeScreenPush,
  enableHomeScreenPush,
  isIosDevice,
  isStandaloneDisplay,
  pushApi,
} from "../api/push";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../i18n/LanguageContext";

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, family, logout, token, updateMe, refresh } = useAuth();
  const { lang, toggleLang, t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [passkeyMsg, setPasskeyMsg] = useState<string | null>(null);
  const [linkingPasskey, setLinkingPasskey] = useState(false);
  const [savingHolidayPref, setSavingHolidayPref] = useState(false);
  const [savingCompanyHoliday, setSavingCompanyHoliday] = useState(false);
  const [companyCal, setCompanyCal] = useState<CompanyCalendar | null>(null);
  const [companyCalUrl, setCompanyCalUrl] = useState(() => defaultCompanyCalendarUrl(japanFiscalYear()));
  const [companyCalYear, setCompanyCalYear] = useState(() => japanFiscalYear());
  const [companyCalBusy, setCompanyCalBusy] = useState(false);
  const [companyCalMsg, setCompanyCalMsg] = useState<string | null>(null);
  const companyPdfRef = useRef<HTMLInputElement>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushMsg, setPushMsg] = useState<string | null>(null);
  const holidayPref = parseHolidayPref(user?.countryPref);
  const companyHolidayOn = user?.companyHolidayPref === "KHI_AKASHI";
  const ios = isIosDevice();
  const standalone = isStandaloneDisplay();

  const initial = (user?.name?.trim()?.charAt(0) || "?").toUpperCase();
  const memberCount = family?.members.length ?? 0;
  const isOwner = user?.role === "OWNER";

  useEffect(() => {
    if (!token) return;
    void pushApi
      .status(token)
      .then((s) => setPushSubscribed(s.subscribed))
      .catch(() => setPushSubscribed(false));
  }, [token]);

  useEffect(() => {
    if (!token) return;
    void companyCalendarApi
      .get(token)
      .then((cal) => {
        setCompanyCal(cal);
        setCompanyCalUrl(cal.sourceUrl || cal.defaultUrl || defaultCompanyCalendarUrl(cal.fiscalYear ?? japanFiscalYear()));
        if (cal.fiscalYear) setCompanyCalYear(cal.fiscalYear);
      })
      .catch(() => {
        setCompanyCalUrl((prev) => prev || defaultCompanyCalendarUrl(japanFiscalYear()));
      });
  }, [token]);

  useEffect(() => {
    if (window.location.hash !== "#company-calendar") return;
    document.getElementById("company-calendar")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  async function togglePush() {
    if (!token) return;
    setPushBusy(true);
    setPushMsg(null);
    try {
      if (pushSubscribed) {
        await disableHomeScreenPush(token);
        setPushSubscribed(false);
        setPushMsg(t("settings.pushOff"));
        return;
      }
      const result = await enableHomeScreenPush(token);
      if (result === "ok") {
        setPushSubscribed(true);
        setPushMsg(t("settings.pushOn"));
      } else if (result === "denied") {
        setPushMsg(t("settings.pushDenied"));
      } else {
        setPushMsg(ios && !standalone ? t("settings.pushNeedHomeScreen") : t("settings.pushUnsupported"));
      }
    } catch (err) {
      setPushMsg(err instanceof ApiError ? err.message : t("settings.pushUnsupported"));
    } finally {
      setPushBusy(false);
    }
  }

  async function sendTestPush() {
    if (!token) return;
    setPushBusy(true);
    setPushMsg(null);
    try {
      await pushApi.test(token);
      setPushMsg(t("settings.pushTestOk"));
    } catch (err) {
      setPushMsg(err instanceof ApiError ? err.message : t("settings.pushTestFail"));
    } finally {
      setPushBusy(false);
    }
  }

  async function changeHolidayPref(pref: HolidayPref) {
    if (pref === holidayPref) return;
    setSavingHolidayPref(true);
    try {
      await updateMe({ countryPref: pref });
    } finally {
      setSavingHolidayPref(false);
    }
  }

  async function changeCompanyHolidayPref(on: boolean) {
    if (on === companyHolidayOn) return;
    setSavingCompanyHoliday(true);
    try {
      await updateMe({ companyHolidayPref: on ? "KHI_AKASHI" : "NONE" });
    } finally {
      setSavingCompanyHoliday(false);
    }
  }

  function applyCompanyCal(cal: CompanyCalendar) {
    setCompanyCal(cal);
    setCompanyCalUrl(cal.sourceUrl || cal.defaultUrl);
    if (cal.fiscalYear) setCompanyCalYear(cal.fiscalYear);
  }

  async function refreshCompanyCalFromUrl() {
    if (!token) return;
    setCompanyCalBusy(true);
    setCompanyCalMsg(null);
    try {
      const cal = await companyCalendarApi.importUrl(token, { url: companyCalUrl, year: companyCalYear });
      applyCompanyCal(cal);
      await refresh();
      setCompanyCalMsg(null);
    } catch (err) {
      if (err instanceof ApiError && err.code === "NEEDS_UPLOAD") {
        setCompanyCalMsg(t("settings.companyCalNeedsUpload"));
      } else {
        setCompanyCalMsg(err instanceof ApiError ? err.message : t("settings.companyCalError"));
      }
    } finally {
      setCompanyCalBusy(false);
    }
  }

  async function uploadCompanyCalPdf(file: File) {
    if (!token) return;
    setCompanyCalBusy(true);
    setCompanyCalMsg(null);
    try {
      const cal = await companyCalendarApi.importPdf(token, file, { url: companyCalUrl, year: companyCalYear });
      applyCompanyCal(cal);
      await refresh();
      setCompanyCalMsg(null);
    } catch (err) {
      setCompanyCalMsg(err instanceof ApiError ? err.message : t("settings.companyCalError"));
    } finally {
      setCompanyCalBusy(false);
    }
  }

  async function copyInvite() {
    if (!family?.inviteCode) return;
    try {
      await navigator.clipboard.writeText(family.inviteCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  async function createInviteToken() {
    if (!token) return;
    setCreatingInvite(true);
    try {
      const res = await passkeyApi.createInviteToken(token);
      setInviteToken(res.token);
    } finally {
      setCreatingInvite(false);
    }
  }

  async function linkPasskey() {
    if (!token || !user) return;
    setPasskeyMsg(null);
    setLinkingPasskey(true);
    try {
      await passkeyApi.linkWithPasskey(token, user.name);
      setPasskeyMsg(t("settings.passkeyLinked"));
    } catch (err) {
      if (err instanceof ApiError) setPasskeyMsg(err.message);
      else if (err instanceof Error) setPasskeyMsg(err.message);
      else setPasskeyMsg(t("login.error.passkey"));
    } finally {
      setLinkingPasskey(false);
    }
  }

  async function copyInviteToken() {
    if (!inviteToken) return;
    try {
      await navigator.clipboard.writeText(inviteToken);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div>
      <TopBar title={t("settings.title")} subtitle={t("settings.subtitle")} />

      <div className="mx-auto max-w-md px-4 pt-4">
        <section className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-base font-bold text-white">
            {initial}
          </div>
          <div>
            <p className="text-sm font-bold text-neutral-900">{user?.name ?? "—"}</p>
            <p className="text-xs text-neutral-400">
              {user?.email?.includes("@passkey.myfamily") ? t("login.button.faceId") : user?.email}
            </p>
          </div>
        </section>

        <section className="mt-4 rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <Users size={18} className="text-neutral-400" />
              <div>
                <p className="text-sm font-medium text-neutral-800">
                  {family?.familyName ?? t("settings.noFamily")}
                </p>
                <p className="text-[11px] text-neutral-400">
                  {t("settings.membersCount", { n: memberCount })}
                </p>
              </div>
            </div>
          </div>
          {family && (
            <div className="flex items-center justify-between border-t border-neutral-100 px-4 py-3">
              <div>
                <p className="text-[11px] text-neutral-400">{t("settings.inviteCode")}</p>
                <p className="font-mono text-sm font-bold text-indigo-600">{family.inviteCode}</p>
              </div>
              <button
                type="button"
                onClick={() => void copyInvite()}
                className="flex items-center gap-1 rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-500"
              >
                <Copy size={12} /> {copied ? t("settings.copied") : t("settings.copy")}
              </button>
            </div>
          )}
          {family && isOwner && (
            <div className="border-t border-neutral-100 px-4 py-3">
              <p className="text-[11px] text-neutral-400">{t("settings.inviteTokenHint")}</p>
              {inviteToken ? (
                <div className="mt-2 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] text-neutral-400">{t("settings.inviteTokenReady")}</p>
                    <p className="font-mono text-lg font-bold tracking-widest text-indigo-600">{inviteToken}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void copyInviteToken()}
                    className="flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-600"
                  >
                    <Copy size={12} /> {t("settings.copy")}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={creatingInvite}
                  onClick={() => void createInviteToken()}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  <UserPlus size={16} />
                  {creatingInvite ? "…" : t("settings.inviteTokenCreate")}
                </button>
              )}
            </div>
          )}
        </section>

        <section className="mt-4 divide-y divide-neutral-100 rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
          <button
            type="button"
            onClick={toggleLang}
            className="flex w-full items-center justify-between px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <Globe size={18} className="text-neutral-400" />
              <span className="text-sm font-medium text-neutral-800">{t("settings.language")}</span>
            </div>
            <span className="flex items-center gap-1 text-sm text-neutral-400">
              {lang === "ko" ? "한국어" : "日本語"}
              <ChevronRight size={16} />
            </span>
          </button>

          <div className="px-4 py-3">
            <div className="flex items-center gap-3">
              <CalendarDays size={18} className="text-neutral-400" />
              <div>
                <p className="text-sm font-medium text-neutral-800">{t("settings.holidays")}</p>
                <p className="text-[11px] text-neutral-400">{t("settings.holidaysHint")}</p>
              </div>
            </div>
            <div className="mt-3">
              <HolidayPrefPicker
                value={holidayPref}
                onChange={(v) => void changeHolidayPref(v)}
                disabled={savingHolidayPref}
              />
            </div>
          </div>

          <div id="company-calendar" className="px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Factory size={18} className="text-neutral-400" />
                <div>
                  <p className="text-sm font-medium text-neutral-800">{t("settings.companyHolidays")}</p>
                  <p className="text-[11px] text-neutral-400">{t("settings.companyHolidaysHint")}</p>
                </div>
              </div>
              <button
                type="button"
                disabled={savingCompanyHoliday}
                onClick={() => void changeCompanyHolidayPref(!companyHolidayOn)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                  companyHolidayOn ? "bg-indigo-600 text-white" : "bg-neutral-100 text-neutral-500"
                }`}
              >
                {companyHolidayOn ? t("settings.companyHolidaysOn") : t("settings.companyHolidaysOff")}
              </button>
            </div>
            <div className="mt-3 space-y-2">
                <p className="text-[11px] text-neutral-400">{t("settings.companyCalHint")}</p>
                <label className="block text-[11px] font-semibold text-neutral-500">
                  {t("settings.companyCalYear")}
                  <input
                    type="number"
                    inputMode="numeric"
                    min={2024}
                    max={2040}
                    value={companyCalYear}
                    onChange={(e) => {
                      const year = Number(e.target.value) || companyCalYear;
                      setCompanyCalYear(year);
                      setCompanyCalUrl((prev) => {
                        const prevDefault = defaultCompanyCalendarUrl(companyCalYear);
                        if (!prev.trim() || prev === prevDefault) return defaultCompanyCalendarUrl(year);
                        return prev.replace(/20\d{2}/g, String(year));
                      });
                    }}
                    className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-800"
                  />
                </label>
                <label className="block text-[11px] font-semibold text-neutral-500">
                  {t("settings.companyCalUrl")}
                  <input
                    type="url"
                    value={companyCalUrl}
                    onChange={(e) => setCompanyCalUrl(e.target.value)}
                    placeholder={defaultCompanyCalendarUrl(companyCalYear)}
                    className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-800"
                    autoCapitalize="none"
                    autoCorrect="off"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={companyCalBusy}
                    onClick={() => void refreshCompanyCalFromUrl()}
                    className="rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-600 disabled:opacity-60"
                  >
                    {companyCalBusy ? t("settings.companyCalWorking") : t("settings.companyCalRefresh")}
                  </button>
                  <button
                    type="button"
                    disabled={companyCalBusy}
                    onClick={() => companyPdfRef.current?.click()}
                    className="rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-700 disabled:opacity-60"
                  >
                    {t("settings.companyCalUpload")}
                  </button>
                  <input
                    ref={companyPdfRef}
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) void uploadCompanyCalPdf(file);
                    }}
                  />
                </div>
                {companyCal?.parsedAt ? (
                  <p className="text-[11px] text-neutral-500">
                    {t("settings.companyCalSynced", {
                      year: companyCal.fiscalYear ?? companyCalYear,
                      n: companyCal.weekdayOffCount,
                      when: companyCal.parsedAt.slice(0, 10),
                    })}
                  </p>
                ) : companyCal?.usingBakedFallback ? (
                  <p className="text-[11px] text-neutral-400">{t("settings.companyCalFallback")}</p>
                ) : (
                  <p className="text-[11px] text-neutral-400">{t("settings.companyCalEmpty")}</p>
                )}
                {companyCalMsg ? <p className="text-[11px] text-rose-600">{companyCalMsg}</p> : null}
            </div>
          </div>

          <div className="px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Bell size={18} className="text-neutral-400" />
                <div>
                  <p className="text-sm font-medium text-neutral-800">{t("settings.push")}</p>
                  <p className="text-[11px] text-neutral-400">
                    {pushSubscribed ? t("settings.pushOnHint") : t("settings.pushHint")}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={pushBusy}
                onClick={() => void togglePush()}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-60 ${
                  pushSubscribed ? "bg-neutral-100 text-neutral-600" : "bg-indigo-50 text-indigo-600"
                }`}
              >
                {pushBusy ? "…" : pushSubscribed ? t("settings.pushDisable") : t("settings.pushEnable")}
              </button>
            </div>
            {ios && !standalone && (
              <p className="mt-2 text-[11px] text-amber-600">{t("settings.pushNeedHomeScreen")}</p>
            )}
            {pushSubscribed && (
              <div className="mt-3">
                <button
                  type="button"
                  disabled={pushBusy}
                  onClick={() => void sendTestPush()}
                  className="rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-700 disabled:opacity-60"
                >
                  {t("settings.pushTest")}
                </button>
                <p className="mt-2 text-[11px] text-neutral-400">{t("settings.pushTestHint")}</p>
              </div>
            )}
            {pushMsg && <p className="mt-2 text-[11px] text-neutral-500">{pushMsg}</p>}
          </div>

          <div className="px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Fingerprint size={18} className="text-neutral-400" />
                <span className="text-sm font-medium text-neutral-800">{t("settings.faceId")}</span>
              </div>
              <button
                type="button"
                disabled={linkingPasskey}
                onClick={() => void linkPasskey()}
                className="rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-600 disabled:opacity-60"
              >
                {linkingPasskey ? "…" : t("settings.passkeyLink")}
              </button>
            </div>
            {passkeyMsg && (
              <p className="mt-2 text-[11px] text-neutral-500">{passkeyMsg}</p>
            )}
          </div>
        </section>

        <button
          type="button"
          onClick={() => {
            logout();
            navigate("/login", { replace: true });
          }}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 py-3 text-sm font-semibold text-rose-500"
        >
          <LogOut size={16} />
          {t("settings.logout")}
        </button>
      </div>
    </div>
  );
}

