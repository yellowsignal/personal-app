import type {
  CompanyCalendarRecord,
  CompanyCalendarRepository,
  CompanyCalendarUpsert,
} from "./companyCalendarRepository.js";

function clone(row: CompanyCalendarRecord): CompanyCalendarRecord {
  return { ...row, offDates: [...row.offDates] };
}

export class MemoryCompanyCalendarRepository implements CompanyCalendarRepository {
  private byUser = new Map<number, CompanyCalendarRecord>();
  private nextId = 1;

  async findByUserId(userId: number): Promise<CompanyCalendarRecord | null> {
    const row = this.byUser.get(userId);
    return row ? clone(row) : null;
  }

  async upsertForUser(userId: number, input: CompanyCalendarUpsert): Promise<CompanyCalendarRecord> {
    const existing = this.byUser.get(userId);
    const now = new Date();
    const parsedAt = input.parsedAt ?? now;
    if (existing) {
      const updated: CompanyCalendarRecord = {
        ...existing,
        sourceUrl: input.sourceUrl,
        fiscalYear: input.fiscalYear,
        offDates: [...input.offDates],
        parsedAt,
        updatedAt: now,
      };
      this.byUser.set(userId, updated);
      return clone(updated);
    }
    const created: CompanyCalendarRecord = {
      id: this.nextId++,
      userId,
      sourceUrl: input.sourceUrl,
      fiscalYear: input.fiscalYear,
      offDates: [...input.offDates],
      parsedAt,
      createdAt: now,
      updatedAt: now,
    };
    this.byUser.set(userId, created);
    return clone(created);
  }

  async removeForUser(userId: number): Promise<boolean> {
    return this.byUser.delete(userId);
  }
}
