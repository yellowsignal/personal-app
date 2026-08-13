import { apiFetch } from "./http";
import type { ViewScope } from "../components/ScopeToggle";

export type CalendarCategory =
  | "personal"
  | "family"
  | "holiday"
  | "document_expiry"
  | "subscription_billing"
  | "recurring_deposit";

export type RecurrenceFreq = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
export type RecurrenceMonthMode = "BY_MONTHDAY" | "BY_NTH_WEEKDAY";

export interface RecurrenceRule {
  freq: RecurrenceFreq;
  interval: number;
  byWeekday?: number[];
  monthMode?: RecurrenceMonthMode;
  bySetPos?: number;
  until?: string;
  count?: number;
}

export interface PublicCalendarEvent {
  id: string;
  userId: number;
  title: string;
  description: string | null;
  date: string;
  time: string | null;
  endDate: string;
  endTime?: string | null;
  isAllDay: boolean;
  category: CalendarCategory;
  isShared: boolean;
  editable: boolean;
  sourceDocumentId: number | null;
  ownerName: string;
  seriesId?: string;
  recurrence?: RecurrenceRule | null;
}

export interface CreateCalendarEventInput {
  title: string;
  date: string;
  endDate?: string | null;
  time?: string | null;
  endTime?: string | null;
  isAllDay?: boolean;
  category?: "personal" | "family" | "holiday";
  description?: string | null;
  isShared?: boolean;
  recurrence?: RecurrenceRule | null;
}

export const categoryColor: Record<CalendarCategory, string> = {
  personal: "#5B5BF6",
  family: "#34C759",
  holiday: "#EF4444",
  document_expiry: "#FF3B30",
  subscription_billing: "#AF52DE",
  recurring_deposit: "#0A84FF",
};

export const calendarApi = {
  listEvents(token: string, from: string, to: string, scope: ViewScope = "all") {
    return apiFetch<PublicCalendarEvent[]>(
      `/api/calendar/events?from=${from}&to=${to}&scope=${scope}`,
      { token },
    );
  },

  create(token: string, body: CreateCalendarEventInput) {
    return apiFetch<PublicCalendarEvent>("/api/calendar/events", {
      method: "POST",
      token,
      body: JSON.stringify(body),
    });
  },

  update(token: string, id: string, body: Partial<CreateCalendarEventInput>) {
    return apiFetch<PublicCalendarEvent>(`/api/calendar/events/${id}`, {
      method: "PATCH",
      token,
      body: JSON.stringify(body),
    });
  },

  remove(token: string, id: string) {
    return apiFetch<void>(`/api/calendar/events/${encodeURIComponent(id)}`, {
      method: "DELETE",
      token,
    });
  },
};
