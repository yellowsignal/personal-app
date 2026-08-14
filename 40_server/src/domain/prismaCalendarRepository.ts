import { Prisma, type PrismaClient, type CalendarEvent as PrismaRow } from "@prisma/client";
import type {
  CalendarRepository,
  CreateCalendarEventInput,
  UpdateCalendarEventInput,
} from "./calendarRepository.js";
import type { CalendarEventRecord } from "./calendarTypes.js";
import { parseRecurrence } from "./recurrence.js";
import { agentLog } from "../debugNdjson.js";

function map(row: PrismaRow): CalendarEventRecord {
  return {
    id: row.id,
    userId: row.userId,
    familyId: row.familyId,
    title: row.title,
    description: row.description,
    startTime: row.startTime,
    endTime: row.endTime,
    isAllDay: row.isAllDay,
    category: row.category,
    sourceDocumentId: row.sourceDocumentId,
    reminderMinutesBefore: row.reminderMinutesBefore,
    isReminderSent: row.isReminderSent,
    reminderSentFor: row.reminderSentFor,
    isShared: row.isShared,
    recurrence: parseRecurrence(row.recurrence),
    createdAt: row.createdAt,
  };
}

function recurrenceJson(rule: CreateCalendarEventInput["recurrence"]): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (rule === undefined) return undefined;
  if (rule == null) return Prisma.JsonNull;
  return rule as unknown as Prisma.InputJsonValue;
}

export class PrismaCalendarRepository implements CalendarRepository {
  constructor(private readonly db: PrismaClient) {}

  async findById(id: number): Promise<CalendarEventRecord | null> {
    const row = await this.db.calendarEvent.findUnique({ where: { id } });
    return row ? map(row) : null;
  }

  async listInRange(
    userId: number,
    familyId: number | null,
    from: Date,
    to: Date,
  ): Promise<CalendarEventRecord[]> {
    const rows = await this.db.calendarEvent.findMany({
      where: {
        AND: [
          {
            OR: familyId
              ? [{ userId }, { familyId, isShared: true }]
              : [{ userId }],
          },
          {
            OR: [
              { AND: [{ startTime: { lte: to } }, { endTime: { gte: from } }] },
              { AND: [{ startTime: { lte: to } }, { NOT: { recurrence: { equals: Prisma.DbNull } } }] },
            ],
          },
        ],
      },
      orderBy: [{ startTime: "asc" }, { id: "asc" }],
    });
    return rows.map(map);
  }

  async create(input: CreateCalendarEventInput): Promise<CalendarEventRecord> {
    const row = await this.db.calendarEvent.create({
      data: {
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
        isShared: input.isShared,
        recurrence: recurrenceJson(input.recurrence ?? null),
      },
    });
    return map(row);
  }

  async update(id: number, input: UpdateCalendarEventInput): Promise<CalendarEventRecord> {
    const row = await this.db.calendarEvent.update({
      where: { id },
      data: {
        title: input.title,
        description: input.description,
        startTime: input.startTime,
        endTime: input.endTime,
        isAllDay: input.isAllDay,
        category: input.category,
        reminderMinutesBefore: input.reminderMinutesBefore,
        isReminderSent: input.isReminderSent,
        reminderSentFor: input.reminderSentFor,
        isShared: input.isShared,
        familyId: input.familyId,
        recurrence: recurrenceJson(input.recurrence),
      },
    });
    return map(row);
  }

  async listWithReminders(): Promise<CalendarEventRecord[]> {
    const rows = await this.db.calendarEvent.findMany({
      where: { reminderMinutesBefore: { not: null } },
    });
    const mapped = rows.map(map);
    // #region agent log
    agentLog("A", "prismaCalendarRepository.ts:listWithReminders", "prisma startTime round-trip", {
      count: mapped.length,
      sample: mapped.slice(0, 8).map((e) => ({
        id: e.id,
        startIso: e.startTime.toISOString(),
        utcHours: e.startTime.getUTCHours(),
        utcDate: e.startTime.toISOString().slice(0, 10),
        isAllDay: e.isAllDay,
        minutes: e.reminderMinutesBefore,
      })),
    });
    // #endregion
    return mapped;
  }

  async remove(id: number): Promise<boolean> {
    try {
      await this.db.calendarEvent.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }

  async findBySourceDocumentId(sourceDocumentId: number): Promise<CalendarEventRecord | null> {
    const row = await this.db.calendarEvent.findFirst({ where: { sourceDocumentId } });
    return row ? map(row) : null;
  }

  async removeBySourceDocumentId(sourceDocumentId: number): Promise<boolean> {
    const result = await this.db.calendarEvent.deleteMany({ where: { sourceDocumentId } });
    return result.count > 0;
  }
}
