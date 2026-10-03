import Dexie, { type EntityTable, type Table } from "dexie";
import type { Cluster, MarketStatus, ProductIdentity, RawListing, SearchInput } from "@manufactogate/core";

/** Outcome of a search once it stops; absent while it runs (or when the tab was closed mid-search). */
export type SearchStatus = "done" | "cancelled" | "error";

export interface SearchRecord {
  id: string;
  input: SearchInput;
  /** Thumbnail for history list (small data URL), image searches only. */
  thumb?: string;
  /** The listing a comparison was started from (`market:id`). */
  sourceKey?: string;
  markets: string[];
  startedAt: string;
  finishedAt?: string;
  clusterCount: number;
  /** Wall-clock duration reported by the orchestrator. */
  durationMs?: number;
  /** Final per-market status, so errors and durations survive a reload. */
  marketStatus?: Record<string, MarketStatus>;
  /** Listings received across all markets. */
  resultCount?: number;
  status?: SearchStatus;
  /** Why the search ended with `status: "error"`. */
  error?: string;
  /** Photo-only searches: what the product was named (free model or Claude). */
  identity?: ProductIdentity;
}

/**
 * Canonical listing row, one per `market:id`, newest fetch wins. Which searches returned it
 * lives in `searchItems`; the legacy `searchId` field is ignored and removed on upgrade.
 */
export interface ListingRecord extends RawListing {
  key: string; // `${market}:${id}`
  /** @deprecated v2 field, kept optional so older writers still type-check; never read. */
  searchId?: string;
}

/** Membership of a listing in a search, in the order the market returned it. */
export interface SearchItemRecord {
  searchId: string;
  key: string; // listing key
  market: string;
  order: number;
}

export interface ClusterRecord {
  key: string; // `${searchId}:${cluster.id}`
  searchId: string;
  cluster: Cluster;
}

/** Slim view of a cluster (keys and scores only) so the home feed never loads fingerprints. */
export interface MatchRecord {
  key: string; // `${searchId}:${cluster.id}`
  searchId: string;
  confidence: number;
  members: { key: string; market: string; score: number }[];
}

export interface SettingsRecord {
  key: string;
  value: unknown;
}

export interface ProjectRecord {
  id: string;
  name: string;
  notes: string;
  /** The outcome the user wrote down ("Tedarikçi A ile numune", "vazgeçildi"). */
  decision?: string;
  createdAt: string;
  updatedAt: string;
}

export type ProjectItemStatus = "aday" | "numune" | "secildi" | "elendi";

/** A listing saved into a project with the user's note. */
export interface ProjectItemRecord {
  key: string; // `${projectId}:${market}:${listingId}`
  projectId: string;
  listingKey: string; // `${market}:${listingId}`
  note: string;
  status?: ProjectItemStatus;
  addedAt: string;
}

export interface WatchRecord {
  listingKey: string;
  market: string;
  listingId: string;
  title: string;
  image?: string;
  currency: string;
  firstPrice: number;
  lastPrice: number;
  lastCheckedAt: string;
  /** Last successful fetch; absent when every refresh so far failed. */
  lastOkAt?: string;
  /** Message of the last failed refresh, cleared on success. */
  lastError?: string | undefined;
  /** Alert when the price reaches this value (listing currency). */
  targetPrice?: number;
  /** When the user acknowledged the current alert; alerts newer than this show again. */
  alertSeenAt?: string;
  /** Price points, appended only when the price changes. */
  history: { at: string; price: number }[];
}

const LEGACY_PSEUDO_SEARCH_IDS = new Set(["watch", "project", "detail"]);

export class ManufactogateDb extends Dexie {
  searches!: EntityTable<SearchRecord, "id">;
  listings!: EntityTable<ListingRecord, "key">;
  searchItems!: Table<SearchItemRecord, [string, string]>;
  clusters!: EntityTable<ClusterRecord, "key">;
  matches!: EntityTable<MatchRecord, "key">;
  settings!: EntityTable<SettingsRecord, "key">;
  projects!: EntityTable<ProjectRecord, "id">;
  projectItems!: EntityTable<ProjectItemRecord, "key">;
  watches!: EntityTable<WatchRecord, "listingKey">;

  constructor(name = "manufactogate") {
    super(name);
    this.version(1).stores({
      searches: "id, startedAt",
      listings: "key, searchId, market",
      clusters: "key, searchId",
      settings: "key",
    });
    this.version(2).stores({
      searches: "id, startedAt",
      listings: "key, searchId, market",
      clusters: "key, searchId",
      settings: "key",
      projects: "id, updatedAt",
      projectItems: "key, projectId, listingKey",
      watches: "listingKey, lastCheckedAt",
    });
    this.version(3)
      .stores({
        searches: "id, startedAt",
        listings: "key, market, fetchedAt",
        searchItems: "[searchId+key], searchId, key",
        clusters: "key, searchId",
        matches: "key, searchId",
        settings: "key",
        projects: "id, updatedAt",
        projectItems: "key, projectId, listingKey",
        watches: "listingKey, lastCheckedAt",
      })
      .upgrade(async (tx) => {
        // One row per listing stays canonical; its old single `searchId` becomes a searchItems row.
        const items: SearchItemRecord[] = [];
        const perSearch = new Map<string, number>();
        await tx
          .table("listings")
          .toCollection()
          .modify((l: ListingRecord) => {
            const sid = l.searchId;
            if (sid && !LEGACY_PSEUDO_SEARCH_IDS.has(sid)) {
              const order = perSearch.get(sid) ?? 0;
              perSearch.set(sid, order + 1);
              items.push({ searchId: sid, key: l.key, market: l.market, order });
            }
            delete l.searchId;
          });
        if (items.length) await tx.table("searchItems").bulkPut(items);
        const clusters = (await tx.table("clusters").toArray()) as ClusterRecord[];
        if (clusters.length) await tx.table("matches").bulkPut(clusters.map(toMatchRecord));
      });
  }
}

export const db = new ManufactogateDb();

/** Something another tab or the browser did to the database that the UI should mention. */
export type DbEvent = { type: "versionchange" } | { type: "blocked" } | { type: "closed" };
const dbListeners = new Set<(e: DbEvent) => void>();
export function subscribeDb(cb: (e: DbEvent) => void): () => void {
  dbListeners.add(cb);
  return () => dbListeners.delete(cb);
}
function emitDb(e: DbEvent) {
  for (const cb of dbListeners) cb(e);
}
// Another tab upgraded the schema: close so it can proceed, and let the UI ask for a reload.
db.on("versionchange", () => {
  emitDb({ type: "versionchange" });
  db.close();
  emitDb({ type: "closed" });
});
db.on("blocked", () => emitDb({ type: "blocked" }));

/** Reads a setting; a storage failure (private window, blocked site data) yields the fallback. */
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    const r = await db.settings.get(key);
    return r ? (r.value as T) : fallback;
  } catch {
    return fallback;
  }
}
/** Reads a setting and lets storage failures through, so hydrate can report them. */
export async function getSettingStrict<T>(key: string, fallback: T): Promise<T> {
  const r = await db.settings.get(key);
  return r ? (r.value as T) : fallback;
}
export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value });
}

/* ------------------------------------------------------------------------------------------ */
/* Listings and searches                                                                       */

export const listingKeyOf = (l: Pick<RawListing, "market" | "id">): string => `${l.market}:${l.id}`;

let writeVersion = 0;
/** Increments on every listing write; caches keyed on it (real catalog, feed) know when to refresh. */
export function listingsWriteVersion(): number {
  return writeVersion;
}
export function bumpListingsVersion(): void {
  writeVersion++;
}

export interface ListingBatchItem {
  listing: RawListing;
  order: number;
}

/**
 * Stores a batch of listings for a search: canonical rows (newest fetch wins) plus one
 * membership row per listing, in one transaction. Shared by live searches, bulk research and
 * the listing page's compare flow.
 */
export async function persistListings(searchId: string, batch: ListingBatchItem[]): Promise<void> {
  if (!batch.length) return;
  await db.transaction("rw", db.listings, db.searchItems, async () => {
    const rows = batch.map(({ listing }) => ({ ...listing, key: listingKeyOf(listing) }) as ListingRecord);
    await db.listings.bulkPut(rows);
    await db.searchItems.bulkPut(batch.map(({ listing, order }) => ({ searchId, key: listingKeyOf(listing), market: listing.market, order })));
  });
  writeVersion++;
}

/** Stores a listing that no search produced (detail fetch, watch refresh, project add). */
export async function upsertListing(listing: RawListing): Promise<void> {
  await db.listings.put({ ...listing, key: listingKeyOf(listing) });
  writeVersion++;
}

/** Listings of a search in the order the markets returned them. */
export async function listingsForSearch(searchId: string): Promise<ListingRecord[]> {
  const items = await db.searchItems.where("searchId").equals(searchId).toArray();
  items.sort((a, b) => a.order - b.order);
  const rows = await db.listings.bulkGet(items.map((i) => i.key));
  return rows.filter((r): r is ListingRecord => !!r);
}

export function toMatchRecord(rec: ClusterRecord): MatchRecord {
  return {
    key: rec.key,
    searchId: rec.searchId,
    confidence: rec.cluster.confidence,
    members: rec.cluster.members.map((m) => ({ key: listingKeyOf(m.listing), market: m.listing.market, score: m.match.score })),
  };
}

/** Writes the clusters of a search and their slim match view together. */
export async function persistClusters(searchId: string, clusters: Cluster[]): Promise<void> {
  const recs: ClusterRecord[] = clusters.map((c) => ({ key: `${searchId}:${c.id}`, searchId, cluster: c }));
  await db.transaction("rw", db.clusters, db.matches, async () => {
    await db.clusters.where("searchId").equals(searchId).delete();
    await db.matches.where("searchId").equals(searchId).delete();
    if (recs.length) {
      await db.clusters.bulkPut(recs);
      await db.matches.bulkPut(recs.map(toMatchRecord));
    }
  });
}

/** Listing keys that nothing references any more. Pure. */
export function orphanKeys(listingKeys: Iterable<string>, referenced: ReadonlySet<string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const k of listingKeys) {
    if (seen.has(k) || referenced.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

/**
 * Deletes searches with their memberships and clusters, then the listings nothing else
 * references (projects, watchlist and other searches keep theirs). Returns what was removed.
 */
export async function deleteSearches(ids: string[] | "all"): Promise<{ searches: number; listings: number }> {
  return db.transaction("rw", [db.searches, db.searchItems, db.clusters, db.matches, db.listings, db.projectItems, db.watches], async () => {
    const searchIds = ids === "all" ? (await db.searches.toCollection().primaryKeys()) as string[] : ids;
    if (!searchIds.length) return { searches: 0, listings: 0 };
    const candidates = ids === "all" ? ((await db.listings.toCollection().primaryKeys()) as string[]) : (await db.searchItems.where("searchId").anyOf(searchIds).toArray()).map((i) => i.key);
    await db.searchItems.where("searchId").anyOf(searchIds).delete();
    await db.clusters.where("searchId").anyOf(searchIds).delete();
    await db.matches.where("searchId").anyOf(searchIds).delete();
    await db.searches.bulkDelete(searchIds);
    const referenced = new Set<string>();
    for (const p of await db.projectItems.toArray()) referenced.add(p.listingKey);
    for (const w of await db.watches.toArray()) referenced.add(w.listingKey);
    if (ids !== "all") for (const k of (await db.searchItems.where("key").anyOf(candidates).toArray()).map((i) => i.key)) referenced.add(k);
    const orphans = orphanKeys(candidates, referenced);
    await db.listings.bulkDelete(orphans);
    writeVersion++;
    return { searches: searchIds.length, listings: orphans.length };
  });
}

/** Drops oversized history thumbnails written before thumbnails were resized. */
export async function pruneLargeThumbs(maxBytes = 200_000): Promise<number> {
  let n = 0;
  await db.searches
    .filter((s) => !!s.thumb && s.thumb.length > maxBytes)
    .modify((s) => {
      delete s.thumb;
      n++;
    });
  return n;
}

/* ------------------------------------------------------------------------------------------ */
/* Backup                                                                                      */

export const BACKUP_FORMAT = "manufactogate-backup";
export const BACKUP_VERSION = 3;
export const BACKUP_TABLES = ["searches", "listings", "searchItems", "clusters", "matches", "settings", "projects", "projectItems", "watches"] as const;
export type BackupTable = (typeof BACKUP_TABLES)[number];

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  tables: Partial<Record<BackupTable, unknown[]>>;
}

/** Validates a parsed backup; throws a Turkish message on a foreign or damaged file. Pure. */
export function parseBackup(text: string): Backup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Dosya JSON değil.");
  }
  if (!data || typeof data !== "object") throw new Error("Yedek dosyası tanınmadı.");
  const b = data as Partial<Backup>;
  if (b.format !== BACKUP_FORMAT) throw new Error("Bu bir Manufactogate yedeği değil.");
  if (typeof b.version !== "number" || b.version > BACKUP_VERSION) throw new Error(`Yedek sürümü (${String(b.version)}) bu uygulamadan yeni.`);
  if (!b.tables || typeof b.tables !== "object") throw new Error("Yedekte tablo yok.");
  const tables: Backup["tables"] = {};
  for (const t of BACKUP_TABLES) {
    const rows = (b.tables as Record<string, unknown>)[t];
    if (rows === undefined) continue;
    if (!Array.isArray(rows)) throw new Error(`Tablo bozuk: ${t}`);
    tables[t] = rows;
  }
  return { format: BACKUP_FORMAT, version: b.version, exportedAt: typeof b.exportedAt === "string" ? b.exportedAt : "", tables };
}

/** Serialises every table; typed arrays inside fingerprints are dropped (they are recomputed). */
export async function exportAll(): Promise<string> {
  const tables: Backup["tables"] = {};
  for (const t of BACKUP_TABLES) tables[t] = await db.table(t).toArray();
  const backup: Backup = { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), tables };
  return JSON.stringify(backup, (_k, v: unknown) => (v instanceof Float32Array ? undefined : v));
}

export interface ImportSummary {
  rows: number;
  tables: Partial<Record<BackupTable, number>>;
}

/** Loads a backup; "replace" clears each table first, "merge" keeps rows the backup lacks. */
export async function importAll(backup: Backup, mode: "merge" | "replace"): Promise<ImportSummary> {
  const summary: ImportSummary = { rows: 0, tables: {} };
  await db.transaction("rw", BACKUP_TABLES.map((t) => db.table(t)), async () => {
    for (const t of BACKUP_TABLES) {
      const rows = backup.tables[t];
      if (!rows) continue;
      const table = db.table(t);
      if (mode === "replace") await table.clear();
      if (rows.length) await table.bulkPut(rows);
      summary.tables[t] = rows.length;
      summary.rows += rows.length;
    }
  });
  writeVersion++;
  return summary;
}

/** Clears one family of data. Settings keeps nothing but the schema. */
export async function clearData(kind: "history" | "watches" | "projects" | "settings"): Promise<void> {
  if (kind === "history") {
    await deleteSearches("all");
    return;
  }
  if (kind === "watches") await db.watches.clear();
  else if (kind === "projects") await db.transaction("rw", db.projects, db.projectItems, async () => { await db.projects.clear(); await db.projectItems.clear(); });
  else await db.settings.clear();
  writeVersion++;
}

/** Bytes used and granted by the browser, when it tells. */
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const est = await navigator.storage?.estimate?.();
    if (!est) return null;
    return { usage: est.usage ?? 0, quota: est.quota ?? 0 };
  } catch {
    return null;
  }
}

/** Row counts per table for the storage card. */
export async function tableCounts(): Promise<Record<BackupTable, number>> {
  const out = {} as Record<BackupTable, number>;
  for (const t of BACKUP_TABLES) out[t] = await db.table(t).count();
  return out;
}
