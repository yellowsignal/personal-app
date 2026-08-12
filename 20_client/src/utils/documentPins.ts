const STORAGE_KEY = "personal-app:document-pins";

export function readPinnedDocumentIds(): number[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is number => typeof id === "number");
  } catch {
    return [];
  }
}

export function writePinnedDocumentIds(ids: number[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}

export function togglePinnedDocumentId(id: number): number[] {
  const current = readPinnedDocumentIds();
  const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
  writePinnedDocumentIds(next);
  return next;
}
