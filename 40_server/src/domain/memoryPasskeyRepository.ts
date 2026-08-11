import type {
  CreatePasskeyInput,
  PasskeyCredentialRecord,
  PasskeyRepository,
} from "./passkeyTypes.js";

export class MemoryPasskeyRepository implements PasskeyRepository {
  private items = new Map<string, PasskeyCredentialRecord>();

  async findByCredentialId(id: string): Promise<PasskeyCredentialRecord | null> {
    const item = this.items.get(id);
    return item ? { ...item, publicKey: new Uint8Array(item.publicKey) } : null;
  }

  async listByUserId(userId: number): Promise<PasskeyCredentialRecord[]> {
    return [...this.items.values()]
      .filter((c) => c.userId === userId)
      .map((c) => ({ ...c, publicKey: new Uint8Array(c.publicKey) }));
  }

  async create(input: CreatePasskeyInput): Promise<PasskeyCredentialRecord> {
    const record: PasskeyCredentialRecord = {
      id: input.id,
      userId: input.userId,
      publicKey: new Uint8Array(input.publicKey),
      counter: input.counter,
      deviceType: input.deviceType,
      backedUp: input.backedUp,
      transports: input.transports ? [...input.transports] : null,
      createdAt: new Date(),
    };
    this.items.set(record.id, record);
    return { ...record, publicKey: new Uint8Array(record.publicKey) };
  }

  async updateCounter(id: string, counter: number): Promise<void> {
    const item = this.items.get(id);
    if (!item) return;
    item.counter = counter;
  }
}
