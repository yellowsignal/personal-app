import type { CalendarEventRecord } from "./calendarTypes.js";

export interface CreateCalendarEventInput {
  userId: number;
  familyId: number | null;
  title: string;
  description: string | null;
  startTime: Date;
  endTime: Date;
  isAllDay: boolean;
  category: string;
  sourceDocumentId?: number | null;
  reminderMinutesBefore?: number | null;
  isShared: boolean;
}

export interface UpdateCalendarEventInput {
  title?: string;
  description?: string | null;
  startTime?: Date;
  endTime?: Date;
  isAllDay?: boolean;
  category?: string;
  reminderMinutesBefore?: number | null;
  isShared?: boolean;
  familyId?: number | null;
}

export interface CalendarRepository {
  findById(id: number): Promise<CalendarEventRecord | null>;
  listInRange(
    userId: number,
    familyId: number | null,
    from: Date,
    to: Date,
  ): Promise<CalendarEventRecord[]>;
  create(input: CreateCalendarEventInput): Promise<CalendarEventRecord>;
  update(id: number, input: UpdateCalendarEventInput): Promise<CalendarEventRecord>;
  remove(id: number): Promise<boolean>;
  findBySourceDocumentId(sourceDocumentId: number): Promise<CalendarEventRecord | null>;
  removeBySourceDocumentId(sourceDocumentId: number): Promise<boolean>;
}
