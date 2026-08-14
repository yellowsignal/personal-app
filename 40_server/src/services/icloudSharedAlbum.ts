/** Unofficial public iCloud Shared Album APIs (legacy Shared Streams + CloudKit). */

export const ICLOUD_ALBUM_MAX_PHOTOS = 200;
const ASSET_BATCH = 25;
const REQUEST_MS = 12_000;
const PHOTO_UA = "Photos/5.0 (Macintosh; OS X 10.15.4) AppleWebKit/605.1.15";
const TOKEN_RE = /^[A-Za-z0-9_-]{8,80}$/;
const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const CK_HOST = "https://ckdatabasews.icloud.com";
const CK_CONTAINER = "com.apple.photos.cloud";
const CK_BUILD = "2620BuildBeta48";
const CK_PARAMS = `clientBuildNumber=${CK_BUILD}&clientMasteringNumber=${CK_BUILD}`;
const CK_RECORD_TYPE = "CPLAssetAndMasterByAssetDateWithoutHiddenOrDeleted";

export type IcloudAlbumKind = "legacy" | "cloudkit";

export interface ParsedIcloudAlbum {
  kind: IcloudAlbumKind;
  token: string;
  canonicalUrl: string;
}

export interface IcloudAlbumPhoto {
  id: string;
  caption: string | null;
  date: string | null;
  thumbUrl: string;
  fullUrl: string;
}

export interface IcloudAlbum {
  name: string;
  photos: IcloudAlbumPhoto[];
}

export class IcloudAlbumError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IcloudAlbumError";
  }
}

export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface FetchIcloudAlbumOptions {
  http?: FetchLike;
  includeAssets?: boolean;
  maxPhotos?: number;
}

function base62ToInt(input: string): number {
  let n = 0;
  for (const char of input) {
    const idx = BASE62.indexOf(char);
    if (idx < 0) return 0;
    n = n * 62 + idx;
  }
  return n;
}

export function getLegacyPartition(token: string): string {
  const serverPartition =
    token[0] === "A" ? base62ToInt(token[1] ?? "0") : base62ToInt(token.substring(1, 3));
  if (serverPartition < 10) return `0${serverPartition}`;
  return String(serverPartition);
}

function coerceUrl(raw: string): string {
  const s = raw.trim();
  if (/^https?:\/\//i.test(s)) return s;
  if (/^(www\.)?icloud\.com/i.test(s) || /^photos\.icloud\.com/i.test(s)) return `https://${s}`;
  return s;
}

export function parseIcloudSharedAlbumUrl(raw: unknown): ParsedIcloudAlbum | null {
  if (typeof raw !== "string") return null;
  const coerced = coerceUrl(raw);
  if (!coerced) return null;

  const ck = coerced.match(/icloud\.com\/shared\/album\/([^/?#]+)/i);
  if (ck) {
    const token = decodeURIComponent(ck[1]).trim();
    if (!TOKEN_RE.test(token)) return null;
    return {
      kind: "cloudkit",
      token,
      canonicalUrl: `https://photos.icloud.com/shared/album/${token}`,
    };
  }

  let token = "";
  try {
    const u = new URL(coerced);
    const host = u.hostname.toLowerCase();
    if (host !== "icloud.com" && !host.endsWith(".icloud.com")) return null;
    const path = u.pathname.toLowerCase();
    const isLegacy =
      path.includes("/sharedalbum") || path.includes("/photo-stream") || path.includes("/photostream");
    if (!isLegacy) return null;
    token = decodeURIComponent(u.hash.replace(/^#/, "")).trim();
  } catch {
    return null;
  }
  if (!TOKEN_RE.test(token)) return null;
  return {
    kind: "legacy",
    token,
    canonicalUrl: `https://www.icloud.com/sharedalbum/#${token}`,
  };
}

async function postJson(
  http: FetchLike,
  url: string,
  body: string,
  extraHeaders: Record<string, string> = {},
): Promise<{ status: number; json: unknown; header: (name: string) => string | null }> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), REQUEST_MS);
  try {
    const response = await http(url, {
      method: "POST",
      headers: {
        "content-type": "text/plain",
        "cache-control": "no-cache",
        "user-agent": PHOTO_UA,
        origin: "https://www.icloud.com",
        ...extraHeaders,
      },
      body,
      signal: ac.signal,
    });
    const text = await response.text();
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text) as unknown;
      } catch {
        json = null;
      }
    }
    return {
      status: response.status,
      json,
      header: (name) => response.headers.get(name),
    };
  } catch (err) {
    if (err instanceof IcloudAlbumError) throw err;
    throw new IcloudAlbumError("iCloud album request failed");
  } finally {
    clearTimeout(timer);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function pickDerivatives(derivatives: unknown): { thumbChecksum: string; fullChecksum: string } | null {
  const rec = asRecord(derivatives);
  if (!rec) return null;
  const ranked: Array<{ size: number; checksum: string }> = [];
  for (const [key, value] of Object.entries(rec)) {
    if (key === "PosterFrame" || /video|720p|360p/i.test(key)) continue;
    const d = asRecord(value);
    const checksum = str(d?.checksum);
    if (!checksum) continue;
    const size = Number.parseInt(key, 10);
    ranked.push({ size: Number.isFinite(size) ? size : 0, checksum });
  }
  if (ranked.length === 0) return null;
  ranked.sort((a, b) => a.size - b.size);
  const thumb = ranked.find((d) => d.size >= 640) ?? ranked[ranked.length - 1];
  const full = ranked[ranked.length - 1];
  return { thumbChecksum: thumb.checksum, fullChecksum: full.checksum };
}

function assetUrl(item: unknown): string | null {
  const rec = asRecord(item);
  if (!rec) return null;
  const loc = str(rec.url_location);
  const path = str(rec.url_path);
  if (!loc || !path) return null;
  return `https://${loc}${path}`;
}

async function fetchLegacyAlbum(
  token: string,
  http: FetchLike,
  includeAssets: boolean,
  maxPhotos: number,
): Promise<IcloudAlbum> {
  const firstHost = `p${getLegacyPartition(token)}-sharedstreams.icloud.com`;
  const body = JSON.stringify({ streamCtag: null });
  let host = firstHost;
  let streamRes = await postJson(http, `https://${host}/${token}/sharedstreams/webstream`, body);

  if (streamRes.status === 330) {
    const payload = asRecord(streamRes.json);
    const redirected =
      str(payload?.["X-Apple-MMe-Host"]) ??
      streamRes.header("x-apple-mme-host") ??
      streamRes.header("X-Apple-MMe-Host");
    if (!redirected) throw new IcloudAlbumError("iCloud album redirect missing host");
    host = redirected.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    streamRes = await postJson(http, `https://${host}/${token}/sharedstreams/webstream`, body);
  }

  if (streamRes.status !== 200) throw new IcloudAlbumError("iCloud album was not found");
  const stream = asRecord(streamRes.json);
  if (!stream) throw new IcloudAlbumError("iCloud album was not found");
  const name = str(stream.streamName) ?? "Shared Album";
  const photosRaw = Array.isArray(stream.photos) ? stream.photos : [];

  type Pending = {
    id: string;
    caption: string | null;
    date: string | null;
    thumbChecksum: string;
    fullChecksum: string;
  };
  const pending: Pending[] = [];
  for (const row of photosRaw) {
    if (pending.length >= maxPhotos) break;
    const photo = asRecord(row);
    if (!photo) continue;
    if (str(photo.mediaAssetType) === "video") continue;
    const id = str(photo.photoGuid);
    if (!id) continue;
    const deriv = pickDerivatives(photo.derivatives);
    if (!deriv) continue;
    pending.push({
      id,
      caption: str(photo.caption),
      date: str(photo.dateCreated) ?? str(photo.batchDateCreated),
      thumbChecksum: deriv.thumbChecksum,
      fullChecksum: deriv.fullChecksum,
    });
  }

  if (!includeAssets || pending.length === 0) {
    return { name, photos: [] };
  }

  const urlByChecksum = new Map<string, string>();
  for (let i = 0; i < pending.length; i += ASSET_BATCH) {
    const batch = pending.slice(i, i + ASSET_BATCH);
    const assetRes = await postJson(
      http,
      `https://${host}/${token}/sharedstreams/webasseturls`,
      JSON.stringify({ photoGuids: batch.map((p) => p.id) }),
    );
    if (assetRes.status !== 200) continue;
    const items = asRecord(asRecord(assetRes.json)?.items);
    if (!items) continue;
    for (const [checksum, value] of Object.entries(items)) {
      const url = assetUrl(value);
      if (url) urlByChecksum.set(checksum, url);
    }
  }

  const photos: IcloudAlbumPhoto[] = [];
  for (const p of pending) {
    const fullUrl = urlByChecksum.get(p.fullChecksum);
    const thumbUrl = urlByChecksum.get(p.thumbChecksum) ?? fullUrl;
    if (!fullUrl || !thumbUrl) continue;
    photos.push({
      id: p.id,
      caption: p.caption,
      date: p.date,
      thumbUrl,
      fullUrl,
    });
  }
  return { name, photos };
}

function ckFieldString(fields: Record<string, unknown> | null, key: string): string | null {
  if (!fields) return null;
  const field = asRecord(fields[key]);
  const value = field?.value;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeCkHost(raw: string | null): string {
  if (!raw) return CK_HOST;
  let host = raw.replace(/:443$/, "");
  if (!/^https?:\/\//i.test(host)) host = `https://${host}`;
  return host.replace(/\/$/, "");
}

function pickCloudKitAsset(fields: Record<string, unknown>): { thumbUrl: string; fullUrl: string } | null {
  const ranked: Array<{ width: number; url: string }> = [];
  for (const [key, raw] of Object.entries(fields)) {
    if (!key.startsWith("res") || !key.endsWith("Res") || key.includes("Vid")) continue;
    const wrapper = asRecord(raw);
    const value = asRecord(wrapper?.value);
    const url = str(value?.downloadURL);
    if (!url) continue;
    const widthKey = `${key.slice(0, -3)}Width`;
    const widthField = asRecord(fields[widthKey]);
    const width = typeof widthField?.value === "number" ? widthField.value : 0;
    ranked.push({ width, url });
  }
  if (ranked.length === 0) return null;
  ranked.sort((a, b) => a.width - b.width);
  const thumb = ranked.find((d) => d.width >= 640) ?? ranked[ranked.length - 1];
  const full = ranked[ranked.length - 1];
  return { thumbUrl: thumb.url, fullUrl: full.url };
}

async function fetchCloudKitAlbum(
  token: string,
  http: FetchLike,
  includeAssets: boolean,
  maxPhotos: number,
): Promise<IcloudAlbum> {
  const resolveUrl = `${CK_HOST}/database/1/${CK_CONTAINER}/production/public/records/resolve?${CK_PARAMS}`;
  const resolveRes = await postJson(
    http,
    resolveUrl,
    JSON.stringify({ shortGUIDs: [{ value: token }] }),
    { "content-type": "application/json" },
  );
  if (resolveRes.status !== 200) throw new IcloudAlbumError("iCloud album was not found");
  const results = asRecord(resolveRes.json)?.results;
  const first = Array.isArray(results) ? asRecord(results[0]) : null;
  if (!first) throw new IcloudAlbumError("iCloud album was not found");
  const zone = asRecord(first.zoneID);
  const zoneName = str(zone?.zoneName);
  if (!zoneName) throw new IcloudAlbumError("iCloud album was not found");
  const ownerRecordName = str(zone?.ownerRecordName) ?? "";
  const zoneType = str(zone?.zoneType) ?? "REGULAR_CUSTOM_ZONE";
  const access = asRecord(first.anonymousPublicAccess);
  const authToken = str(access?.token);
  if (!authToken) throw new IcloudAlbumError("iCloud album was not found");
  const share = asRecord(first.share);
  const shareFields = asRecord(share?.fields);
  const name =
    ckFieldString(shareFields, "cloudkit.title") ??
    ckFieldString(shareFields, "title") ??
    "Shared Album";

  if (!includeAssets) return { name, photos: [] };

  const partition = normalizeCkHost(str(access?.databasePartition));
  const queryUrl =
    `${partition}/database/1/${CK_CONTAINER}/production/shared/records/query?${CK_PARAMS}` +
    `&publicAccessAuthToken=${encodeURIComponent(authToken)}`;
  const zoneJson = {
    zoneName,
    ownerRecordName,
    zoneType,
  };

  const photos: IcloudAlbumPhoto[] = [];
  let marker: string | null = null;
  let pages = 0;
  do {
    const payload: Record<string, unknown> = {
      query: {
        recordType: CK_RECORD_TYPE,
        filterBy: [
          {
            fieldName: "direction",
            comparator: "EQUALS",
            fieldValue: { value: "DESCENDING", type: "STRING" },
          },
        ],
      },
      zoneID: zoneJson,
      resultsLimit: 100,
    };
    if (marker) payload.continuationMarker = marker;
    const queryRes = await postJson(http, queryUrl, JSON.stringify(payload), {
      "content-type": "application/json",
    });
    if (queryRes.status !== 200) break;
    const obj = asRecord(queryRes.json);
    const records = Array.isArray(obj?.records) ? obj.records : [];
    for (const row of records) {
      if (photos.length >= maxPhotos) break;
      const rec = asRecord(row);
      if (!rec || str(rec.recordType) !== "CPLMaster") continue;
      const fields = asRecord(rec.fields);
      if (!fields) continue;
      const itemType = (ckFieldString(fields, "itemType") ?? "").toLowerCase();
      if (itemType.includes("movie") || itemType.includes("video")) continue;
      const urls = pickCloudKitAsset(fields);
      if (!urls) continue;
      photos.push({
        id: str(rec.recordName) ?? `ck-${photos.length}`,
        caption: ckFieldString(fields, "caption"),
        date: ckFieldString(fields, "originalCreationDate"),
        thumbUrl: urls.thumbUrl,
        fullUrl: urls.fullUrl,
      });
    }
    marker = str(obj?.continuationMarker);
    pages += 1;
  } while (marker && pages < 2 && photos.length < maxPhotos);

  return { name, photos };
}

export async function fetchIcloudSharedAlbum(
  url: string,
  options: FetchIcloudAlbumOptions = {},
): Promise<IcloudAlbum> {
  const parsed = parseIcloudSharedAlbumUrl(url);
  if (!parsed) throw new IcloudAlbumError("invalid iCloud shared album URL");
  const http = options.http ?? fetch;
  const includeAssets = options.includeAssets !== false;
  const maxPhotos = options.maxPhotos ?? ICLOUD_ALBUM_MAX_PHOTOS;
  if (parsed.kind === "cloudkit") {
    return fetchCloudKitAlbum(parsed.token, http, includeAssets, maxPhotos);
  }
  return fetchLegacyAlbum(parsed.token, http, includeAssets, maxPhotos);
}
