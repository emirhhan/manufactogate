import type { PriceSnapshot, SnapshotOffer } from "@manufactogate/adapters";

/**
 * Price snapshots the web app pushes for the overlay ("bu ürün şu pazarlarda şu fiyattan var"),
 * stored in chrome.storage.local.snapshots keyed by `${market}:${listingId}`. Pure merge so it can
 * be unit-tested; the store is bounded so a long research session does not grow it without limit.
 */

export interface StoredSnapshot {
  at: string;
  title?: string;
  offers: SnapshotOffer[];
}

export type SnapshotStore = Record<string, StoredSnapshot>;

export const MAX_SNAPSHOTS = 300;
export const MAX_OFFERS = 12;

function validOffer(o: unknown): o is SnapshotOffer {
  if (!o || typeof o !== "object") return false;
  const x = o as Partial<SnapshotOffer>;
  return typeof x.market === "string" && typeof x.price === "number" && Number.isFinite(x.price) && x.price > 0 && typeof x.currency === "string";
}

/** Adds or replaces one snapshot; drops the oldest entries past `max`. Invalid input leaves the store untouched. */
export function mergeSnapshot(store: SnapshotStore, snap: PriceSnapshot, max = MAX_SNAPSHOTS): SnapshotStore {
  if (!snap || typeof snap.key !== "string" || !/^[a-z]{2}-[a-z0-9]+:.+$/i.test(snap.key) || !Array.isArray(snap.offers)) return store;
  const offers = snap.offers.filter(validOffer).slice(0, MAX_OFFERS);
  if (!offers.length) return store;
  const at = typeof snap.seenAt === "string" && Number.isFinite(Date.parse(snap.seenAt)) ? snap.seenAt : new Date().toISOString();
  const next: SnapshotStore = { ...store, [snap.key]: { at, ...(snap.title ? { title: snap.title } : {}), offers } };
  const keys = Object.keys(next);
  if (keys.length > max) {
    keys.sort((a, b) => Date.parse(next[a]!.at) - Date.parse(next[b]!.at));
    for (const k of keys.slice(0, keys.length - max)) delete next[k];
  }
  return next;
}
