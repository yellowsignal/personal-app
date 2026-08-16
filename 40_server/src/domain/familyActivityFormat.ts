import type { FamilyActivityAction, FamilyActivityEntityType } from "./familyActivityTypes.js";

export type ActivityChangeField =
  | "title"
  | "date"
  | "time"
  | "endDate"
  | "amount"
  | "label"
  | "serviceName"
  | "typeLabel"
  | "shared";

export interface ActivityChange {
  field: ActivityChangeField;
  from?: string | null;
  to?: string | null;
}

export interface ActivityDetail {
  changes?: ActivityChange[];
}

export function serializeActivityDetail(detail: ActivityDetail | null | undefined): string | null {
  if (!detail?.changes?.length) return null;
  return JSON.stringify({ changes: detail.changes.slice(0, 12) });
}

export function parseActivityDetail(raw: string | null | undefined): ActivityDetail | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ActivityDetail;
    if (!parsed || !Array.isArray(parsed.changes)) return null;
    return { changes: parsed.changes };
  } catch {
    return null;
  }
}

function kindLabel(entityType: FamilyActivityEntityType, ja: boolean): string {
  if (ja) {
    switch (entityType) {
      case "CALENDAR_EVENT":
        return "予定";
      case "DOCUMENT":
        return "書類";
      case "CHECKLIST":
        return "チェックリスト";
      case "ASSET":
        return "資産";
      case "SUBSCRIPTION":
        return "サブスク";
      case "PHOTO":
        return "写真";
      default:
        return "項目";
    }
  }
  switch (entityType) {
    case "CALENDAR_EVENT":
      return "일정";
    case "DOCUMENT":
      return "증명서";
    case "CHECKLIST":
      return "체크리스트";
    case "ASSET":
      return "자산";
    case "SUBSCRIPTION":
      return "구독";
    case "PHOTO":
      return "사진";
    default:
      return "항목";
  }
}

function fieldLabel(field: ActivityChangeField, ja: boolean): string {
  if (ja) {
    switch (field) {
      case "title":
        return "タイトル";
      case "date":
        return "日付";
      case "time":
        return "時刻";
      case "endDate":
        return "終了日";
      case "amount":
        return "金額";
      case "label":
        return "名前";
      case "serviceName":
        return "サービス名";
      case "typeLabel":
        return "名前";
      case "shared":
        return "共有";
      default:
        return "内容";
    }
  }
  switch (field) {
    case "title":
      return "제목";
    case "date":
      return "날짜";
    case "time":
      return "시간";
    case "endDate":
      return "종료일";
    case "amount":
      return "금액";
    case "label":
      return "이름";
    case "serviceName":
      return "서비스명";
    case "typeLabel":
      return "이름";
    case "shared":
      return "공유";
    default:
      return "내용";
  }
}

function quoteTitle(title: string): string {
  const t = title.trim() || "(untitled)";
  return `「${t.slice(0, 40)}」`;
}

const ALL_DAY = "__all_day__";

function displayValue(field: ActivityChangeField, raw: string, ja: boolean): string {
  if (field === "shared") {
    if (raw === "on") return ja ? "オン" : "켜짐";
    if (raw === "off") return ja ? "オフ" : "꺼짐";
  }
  if (field === "time" && raw === ALL_DAY) return ja ? "終日" : "하루종일";
  return raw;
}

function formatChangeLine(change: ActivityChange, ja: boolean): string {
  const label = fieldLabel(change.field, ja);
  const fromRaw = (change.from ?? "").trim();
  const toRaw = (change.to ?? "").trim();
  const from = fromRaw ? displayValue(change.field, fromRaw, ja) : "";
  const to = toRaw ? displayValue(change.field, toRaw, ja) : "";
  if (from && to && from !== to) return `${label} ${from} → ${to}`;
  if (to && !from) return `${label} ${to}`;
  if (from && !to) return ja ? `${label}を削除` : `${label} 삭제`;
  return label;
}

/** Sentinel for all-day events when recording time changes. */
export const FAMILY_ACTIVITY_ALL_DAY = ALL_DAY;

/** Localized one-line summary for feed + push body. */
export function formatFamilyActivitySummary(input: {
  languagePref: string | null | undefined;
  action: FamilyActivityAction;
  entityType: FamilyActivityEntityType;
  title: string;
  detailJson?: string | null;
}): string {
  const ja = input.languagePref === "ja";
  const kind = kindLabel(input.entityType, ja);
  const name = quoteTitle(input.title);
  const detail = parseActivityDetail(input.detailJson);
  const changeBits =
    detail?.changes
      ?.filter((c) => (c.from ?? "") !== (c.to ?? "") || c.field === "shared")
      .slice(0, 3)
      .map((c) => formatChangeLine(c, ja)) ?? [];

  if (input.action === "CREATED") {
    return ja ? `${name} ${kind}を登録しました` : `${name} ${kind}을(를) 등록했어요`;
  }
  if (input.action === "DELETED") {
    return ja ? `${name} ${kind}を削除しました` : `${name} ${kind}을(를) 삭제했어요`;
  }
  // UPDATED
  if (changeBits.length > 0) {
    return ja
      ? `${name} ${kind} · ${changeBits.join("、")}`
      : `${name} ${kind} · ${changeBits.join(", ")}`;
  }
  return ja ? `${name} ${kind}を更新しました` : `${name} ${kind}을(를) 수정했어요`;
}

export function formatFamilyActivityPushTitle(input: {
  languagePref: string | null | undefined;
  actorName: string;
  action: FamilyActivityAction;
}): string {
  const ja = input.languagePref === "ja";
  const name = input.actorName.trim() || "?";
  if (input.action === "CREATED") {
    return ja ? `${name}さんが登録しました` : `${name}님이 등록했어요`;
  }
  if (input.action === "DELETED") {
    return ja ? `${name}さんが削除しました` : `${name}님이 삭제했어요`;
  }
  return ja ? `${name}さんが更新しました` : `${name}님이 수정했어요`;
}

export function collectChanges(
  pairs: Array<{ field: ActivityChangeField; from?: string | null; to?: string | null }>,
): ActivityChange[] {
  const out: ActivityChange[] = [];
  for (const p of pairs) {
    const from = p.from == null ? null : String(p.from);
    const to = p.to == null ? null : String(p.to);
    if ((from ?? "") === (to ?? "")) continue;
    out.push({ field: p.field, from, to });
  }
  return out;
}
