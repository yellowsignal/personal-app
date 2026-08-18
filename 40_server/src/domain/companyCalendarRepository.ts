export interface CompanyCalendarRecord {
  id: number;
  userId: number;
  sourceUrl: string | null;
  fiscalYear: number;
  offDates: string[];
  parsedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CompanyCalendarUpsert {
  sourceUrl: string | null;
  fiscalYear: number;
  offDates: string[];
  parsedAt?: Date;
}

export interface CompanyCalendarRepository {
  findByUserId(userId: number): Promise<CompanyCalendarRecord | null>;
  upsertForUser(userId: number, input: CompanyCalendarUpsert): Promise<CompanyCalendarRecord>;
  removeForUser(userId: number): Promise<boolean>;
}
