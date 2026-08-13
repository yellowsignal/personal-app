import type { PrismaClient, CalendarEvent as PrismaRow } from "@prisma/client";
import type {
  CalendarRepository,
  CreateCalendarEventInput,
  UpdateCalendarEventInput,
} from "./calendarRepository.js";
import type { CalendarEventRecord } from "./calendarTypes.js";

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
    isShared: row.isShared,
    createdAt: row.createdAt,
  };
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
          { startTime: { lte: to } },
          { endTime: { gte: from } },
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
        isShared: input.isShared,
        familyId: input.familyId,
      },
    });
    return map(row);
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
