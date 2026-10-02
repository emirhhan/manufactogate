import Dexie, { type EntityTable } from "dexie";
import type { Cluster, RawListing, SearchInput } from "@manufactogate/core";

export interface SearchRecord {
  id: string;
  input: SearchInput;
  /** Thumbnail for history list (data URL), image searches only. */
  thumb?: string;
  markets: string[];
  startedAt: string;
  finishedAt?: string;
  clusterCount: number;
}

export interface ListingRecord extends RawListing {
  key: string; // `${market}:${id}`
  searchId: string;
}

export interface ClusterRecord {
  key: string; // `${searchId}:${cluster.id}`
  searchId: string;
  cluster: Cluster;
}

export interface SettingsRecord {
  key: string;
  value: unknown;
}

class ManufactogateDb extends Dexie {
  searches!: EntityTable<SearchRecord, "id">;
  listings!: EntityTable<ListingRecord, "key">;
  clusters!: EntityTable<ClusterRecord, "key">;
  settings!: EntityTable<SettingsRecord, "key">;

  constructor() {
    super("manufactogate");
    this.version(1).stores({
      searches: "id, startedAt",
      listings: "key, searchId, market",
      clusters: "key, searchId",
      settings: "key",
    });
  }
}

export const db = new ManufactogateDb();

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const r = await db.settings.get(key);
  return r ? (r.value as T) : fallback;
}
export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value });
}
