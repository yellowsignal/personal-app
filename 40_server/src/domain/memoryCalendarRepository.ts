import type {
  CalendarRepository,
  CreateCalendarEventInput,
  UpdateCalendarEventInput,
} from "./calendarRepository.js";
import type { CalendarEventRecord } from "./calendarTypes.js";

export class MemoryCalendarRepository implements CalendarRepository {
  private rows = new Map<number, CalendarEventRecord>();
  private nextId = 1;

  async findById(id: number): Promise<CalendarEventRecord | null> {
    const row = this.rows.get(id);
    return row ? { ...row } : null;
  }

  async listInRange(
    userId: number,
    familyId: number | null,
    from: Date,
    to: Date,
  ): Promise<CalendarEventRecord[]> {
    return [...this.rows.values()]
      .filter((r) => {
        const visible =
          r.userId === userId ||
          (familyId !== null && r.familyId === familyId && r.isShared);
        if (!visible) return false;
        const overlaps = r.startTime <= to && r.endTime >= from;
        const recurring = r.recurrence != null && r.startTime <= to;
        return overlaps || recurring;
      })
      .map((r) => ({ ...r }))
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime() || a.id - b.id);
  }

  async create(input: CreateCalendarEventInput): Promise<CalendarEventRecord> {
    const record: CalendarEventRecord = {
      id: this.nextId++,
      userId: input.userId,
      familyId: input.familyId,
      title: input.title,
      description: input.description,
      startTime: input.startTime,
      endTime: input.endTime,
      isAllDay: input.isAllDay,
      category: input.category,
      sourceDocumentId: input.sourceDocumentId ?? null,
      reminderMinutesBefore: input.reminderMinutesBefore ?? null,
      isReminderSent: false,
      reminderSentFor: null,
      isShared: input.isShared,
      recurrence: input.recurrence ?? null,
      createdAt: new Date(),
    };
    this.rows.set(record.id, record);
    return { ...record };
  }

  async update(id: number, input: UpdateCalendarEventInput): Promise<CalendarEventRecord> {
    const existing = this.rows.get(id);
    if (!existing) throw Object.assign(new Error("not found"), { code: "NOT_FOUND" });
    const updated: CalendarEventRecord = {
      ...existing,
      title: input.title === undefined ? existing.title : input.title,
      description: input.description === undefined ? existing.description : input.description,
      startTime: input.startTime === undefined ? existing.startTime : input.startTime,
      endTime: input.endTime === undefined ? existing.endTime : input.endTime,
      isAllDay: input.isAllDay === undefined ? existing.isAllDay : input.isAllDay,
      category: input.category === undefined ? existing.category : input.category,
      reminderMinutesBefore:
        input.reminderMinutesBefore === undefined
          ? existing.reminderMinutesBefore
          : input.reminderMinutesBefore,
      isReminderSent:
        input.isReminderSent === undefined ? existing.isReminderSent : input.isReminderSent,
      reminderSentFor:
        input.reminderSentFor === undefined ? existing.reminderSentFor : input.reminderSentFor,
      isShared: input.isShared === undefined ? existing.isShared : input.isShared,
      familyId: input.familyId === undefined ? existing.familyId : input.familyId,
      recurrence: input.recurrence === undefined ? existing.recurrence : input.recurrence,
    };
    this.rows.set(id, updated);
    return { ...updated };
  }

  async listWithReminders(): Promise<CalendarEventRecord[]> {
    return [...this.rows.values()]
      .filter((r) => r.reminderMinutesBefore != null)
      .map((r) => ({ ...r }));
  }

  async remove(id: number): Promise<boolean> {
    return this.rows.delete(id);
  }

  async findBySourceDocumentId(sourceDocumentId: number): Promise<CalendarEventRecord | null> {
    for (const r of this.rows.values()) {
      if (r.sourceDocumentId === sourceDocumentId) return { ...r };
    }
    return null;
  }

  async removeBySourceDocumentId(sourceDocumentId: number): Promise<boolean> {
    for (const [id, r] of this.rows) {
      if (r.sourceDocumentId === sourceDocumentId) {
        this.rows.delete(id);
        return true;
      }
    }
    return false;
  }
}
