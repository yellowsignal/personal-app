import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  CompanyCalendarRecord,
  CompanyCalendarRepository,
  CompanyCalendarUpsert,
} from "./companyCalendarRepository.js";

function asDateKeys(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v));
}

function mapRow(row: {
  id: number;
  userId: number;
  sourceUrl: string | null;
  fiscalYear: number;
  offDates: Prisma.JsonValue;
  parsedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}): CompanyCalendarRecord {
  return {
    id: row.id,
    userId: row.userId,
    sourceUrl: row.sourceUrl,
    fiscalYear: row.fiscalYear,
    offDates: asDateKeys(row.offDates),
    parsedAt: row.parsedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PrismaCompanyCalendarRepository implements CompanyCalendarRepository {
  constructor(private readonly db: PrismaClient) {}

  async findByUserId(userId: number): Promise<CompanyCalendarRecord | null> {
    const row = await this.db.companyCalendar.findUnique({ where: { userId } });
    return row ? mapRow(row) : null;
  }

  async upsertForUser(userId: number, input: CompanyCalendarUpsert): Promise<CompanyCalendarRecord> {
    const parsedAt = input.parsedAt ?? new Date();
    const data = {
      sourceUrl: input.sourceUrl,
      fiscalYear: input.fiscalYear,
      offDates: input.offDates,
      parsedAt,
    };
    const row = await this.db.companyCalendar.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    return mapRow(row);
  }

  async removeForUser(userId: number): Promise<boolean> {
    try {
      await this.db.companyCalendar.delete({ where: { userId } });
      return true;
    } catch (err) {
      if ((err as { code?: string }).code === "P2025") return false;
      throw err;
    }
  }
}
