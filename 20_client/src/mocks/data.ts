// 개발 초기 단계의 화면 예시(mock-up)를 위한 더미 데이터입니다.
// 실제 데이터는 40_server API 연동 후 대체됩니다.
// 한국어/일본어 목업 화면을 모두 지원하기 위해 표시용 텍스트는 { ko, ja } 형태로 관리합니다.

import type { LocalText } from "../i18n/translations";

export type Currency = "KRW" | "JPY" | "USD";

export interface FamilyMember {
  id: string;
  name: LocalText;
  role: "OWNER" | "MEMBER";
  avatarColor: string;
  initial: LocalText;
}

export const currentUser: FamilyMember = {
  id: "u1",
  name: { ko: "민호", ja: "ミンホ" },
  role: "OWNER",
  avatarColor: "#5B5BF6",
  initial: { ko: "민", ja: "ミ" },
};

export const familyMembers: FamilyMember[] = [
  currentUser,
  { id: "u2", name: { ko: "아내", ja: "妻" }, role: "MEMBER", avatarColor: "#FF6B81", initial: { ko: "아", ja: "妻" } },
  { id: "u3", name: { ko: "딸", ja: "娘" }, role: "MEMBER", avatarColor: "#34C759", initial: { ko: "딸", ja: "娘" } },
];

export const familyInfo = {
  familyName: { ko: "최가네", ja: "チェ家" } as LocalText,
  inviteCode: "FAM-8X39A",
};

export type AssetType = "deposit" | "stock" | "cash" | "realestate";

export interface AssetItem {
  id: string;
  type: AssetType;
  label: LocalText;
  currency: Currency;
  amount: number;
  stockCode?: string;
  buyPrice?: number;
  currentPrice?: number;
  changePercent?: number;
  isShared: boolean;
  owner: LocalText;
}

const OWNER_MINHO: LocalText = { ko: "민호", ja: "ミンホ" };
const OWNER_SHARED: LocalText = { ko: "가족 공유", ja: "家族共有" };
const OWNER_WIFE: LocalText = { ko: "아내", ja: "妻" };

export const assets: AssetItem[] = [
  { id: "a1", type: "deposit", label: { ko: "신한은행 급여통장", ja: "新韓銀行 給与口座" }, currency: "KRW", amount: 12_400_000, isShared: false, owner: OWNER_MINHO },
  { id: "a2", type: "deposit", label: { ko: "미즈호 생활비 통장", ja: "みずほ 生活費口座" }, currency: "JPY", amount: 850_000, isShared: true, owner: OWNER_SHARED },
  { id: "a3", type: "stock", label: { ko: "Apple Inc.", ja: "Apple Inc." }, currency: "USD", amount: 3_200, stockCode: "AAPL", buyPrice: 165.2, currentPrice: 231.4, changePercent: 2.3, isShared: false, owner: OWNER_MINHO },
  { id: "a4", type: "stock", label: { ko: "삼성전자", ja: "サムスン電子" }, currency: "KRW", amount: 5_400_000, stockCode: "005930", buyPrice: 68_000, currentPrice: 81_500, changePercent: -1.1, isShared: true, owner: OWNER_SHARED },
  { id: "a5", type: "cash", label: { ko: "비상금", ja: "非常用資金" }, currency: "USD", amount: 1_500, isShared: false, owner: OWNER_MINHO },
];

export const exchangeRates: Record<Currency, number> = {
  KRW: 1,
  JPY: 9.1,
  USD: 1385,
};

export type DocType = "license" | "passport" | "idcard" | "certificate";

export interface DocumentItem {
  id: string;
  docType: DocType;
  docNumber: string;
  expiryDate: string;
  owner: LocalText;
  isShared: boolean;
  daysLeft: number;
}

export const documents: DocumentItem[] = [
  { id: "d1", docType: "license", docNumber: "11-22-334455-60", expiryDate: "2026-09-02", owner: OWNER_MINHO, isShared: false, daysLeft: 22 },
  { id: "d2", docType: "passport", docNumber: "M12345678", expiryDate: "2027-03-14", owner: OWNER_MINHO, isShared: true, daysLeft: 215 },
  { id: "d3", docType: "passport", docNumber: "M87654321", expiryDate: "2026-08-30", owner: OWNER_WIFE, isShared: true, daysLeft: 19 },
  { id: "d4", docType: "certificate", docNumber: "정보처리기사-2019-004321", expiryDate: "2029-01-10", owner: OWNER_MINHO, isShared: false, daysLeft: 880 },
];

export interface SubscriptionItem {
  id: string;
  serviceName: LocalText;
  cost: number;
  currency: Currency;
  billingDate: number;
  reason: LocalText;
  cancelUrl: string;
  isShared: boolean;
  owner: LocalText;
  color: string;
}

export const subscriptions: SubscriptionItem[] = [
  { id: "s1", serviceName: { ko: "Netflix", ja: "Netflix" }, cost: 17_000, currency: "KRW", billingDate: 5, reason: { ko: "가족 공용 시청", ja: "家族共用視聴" }, cancelUrl: "https://netflix.com/cancelplan", isShared: true, owner: OWNER_SHARED, color: "#E50914" },
  { id: "s2", serviceName: { ko: "Cursor Pro", ja: "Cursor Pro" }, cost: 20, currency: "USD", billingDate: 12, reason: { ko: "개발용 AI 도구", ja: "開発用AIツール" }, cancelUrl: "https://cursor.com/settings", isShared: false, owner: OWNER_MINHO, color: "#5B5BF6" },
  { id: "s3", serviceName: { ko: "NHK 수신료", ja: "NHK受信料" }, cost: 2_170, currency: "JPY", billingDate: 27, reason: { ko: "일본 거주 필수", ja: "日本居住のため必須" }, cancelUrl: "#", isShared: true, owner: OWNER_SHARED, color: "#34C759" },
  { id: "s4", serviceName: { ko: "iCloud+ 200GB", ja: "iCloud+ 200GB" }, cost: 3_300, currency: "KRW", billingDate: 15, reason: { ko: "가족 사진 백업", ja: "家族写真のバックアップ" }, cancelUrl: "https://icloud.com", isShared: true, owner: OWNER_SHARED, color: "#8E8E93" },
];

export interface PhotoItem {
  id: string;
  caption: LocalText;
  color: string;
  isShared: boolean;
  owner: LocalText;
  createdAt: string;
}

export const photos: PhotoItem[] = [
  { id: "p1", caption: { ko: "오사카 여행", ja: "大阪旅行" }, color: "#FFB199", isShared: true, owner: OWNER_SHARED, createdAt: "2026-07-20" },
  { id: "p2", caption: { ko: "딸 생일 파티", ja: "娘の誕生日パーティー" }, color: "#A5C8FF", isShared: true, owner: OWNER_SHARED, createdAt: "2026-06-14" },
  { id: "p3", caption: { ko: "회사 워크숍", ja: "会社のワークショップ" }, color: "#C7B7FF", isShared: false, owner: OWNER_MINHO, createdAt: "2026-05-30" },
  { id: "p4", caption: { ko: "벚꽃 나들이", ja: "お花見" }, color: "#FFD6A5", isShared: true, owner: OWNER_SHARED, createdAt: "2026-04-02" },
  { id: "p5", caption: { ko: "새 노트북", ja: "新しいノートパソコン" }, color: "#B5F0C0", isShared: false, owner: OWNER_MINHO, createdAt: "2026-03-11" },
  { id: "p6", caption: { ko: "장모님 댁", ja: "義母の家" }, color: "#FFC1D9", isShared: true, owner: OWNER_SHARED, createdAt: "2026-02-08" },
];

export interface CalendarEvent {
  id: string;
  title: LocalText;
  date: string;
  time?: string;
  category: "personal" | "family" | "holiday" | "document_expiry";
  isShared: boolean;
}

export const calendarEvents: CalendarEvent[] = [
  { id: "c1", title: { ko: "치과 예약", ja: "歯科の予約" }, date: "2026-08-12", time: "14:00", category: "personal", isShared: false },
  { id: "c2", title: { ko: "가족 저녁 외식", ja: "家族での外食" }, date: "2026-08-14", time: "19:00", category: "family", isShared: true },
  { id: "c3", title: { ko: "야마노 히 (산의 날)", ja: "山の日" }, date: "2026-08-11", category: "holiday", isShared: true },
  { id: "c4", title: { ko: "운전면허증 만료", ja: "運転免許証 有効期限" }, date: "2026-09-02", category: "document_expiry", isShared: false },
  { id: "c5", title: { ko: "아내 여권 만료", ja: "妻のパスポート有効期限" }, date: "2026-08-30", category: "document_expiry", isShared: true },
  { id: "c6", title: { ko: "딸 유치원 발표회", ja: "娘の幼稚園発表会" }, date: "2026-08-22", time: "10:00", category: "family", isShared: true },
  { id: "c7", title: { ko: "프로젝트 마감", ja: "プロジェクト締切" }, date: "2026-08-18", time: "18:00", category: "personal", isShared: false },
];

export const categoryColor: Record<CalendarEvent["category"], string> = {
  personal: "#5B5BF6",
  family: "#34C759",
  holiday: "#EF4444",
  document_expiry: "#FF3B30",
};
