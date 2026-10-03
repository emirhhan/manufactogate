import { create } from "zustand";
import type { MarketId, RawListing } from "@manufactogate/core";
import { db, upsertListing, type WatchRecord } from "@/lib/db";
import { getDataSource, getRegistry } from "@/lib/registry";
import { listingHint } from "@/lib/listingFields";

export const WATCH_MOCK_NOTICE = "Fiyat yenileme eklenti ister: sahte veri modunda gerçek ilanlar güncellenmez.";
/** Watches not checked for this long are refreshed in the background when the app opens. */
export const AUTO_REFRESH_AFTER_MS = 12 * 3600 * 1000;
/** Pause between two markets during a refresh, like a person opening pages. */
export const REFRESH_SPACING_MS = 1500;

export interface WatchAlert {
  watch: WatchRecord;
  kind: "drop" | "target";
  /** Previous price (drop) or the target (target). */
  reference: number;
  delta: number;
}

interface WatchState {
  watches: WatchRecord[];
  checking: boolean;
  progress: string;
  notice: string | null;
  abort?: AbortController | undefined;
  load(): Promise<void>;
  toggle(listing: RawListing): Promise<boolean>;
  remove(listingKey: string): Promise<void>;
  has(listingKey: string): boolean;
  setTarget(listingKey: string, price: number | null): Promise<void>;
  markSeen(listingKey: string): Promise<void>;
  refresh(listingKey?: string, opts?: { onlyStale?: boolean }): Promise<void>;
  stop(): void;
}

export const minPrice = (l: Pick<RawListing, "price">): number | null => {
  if (!l.price.tiers.length) return null;
  return Math.min(...l.price.tiers.map((t) => t.unitPrice));
};

/** The point before the latest one, when the history has it. */
export function previousPrice(w: Pick<WatchRecord, "history">): number | null {
  const h = w.history;
  return h.length >= 2 ? h[h.length - 2]!.price : null;
}

/**
 * Appends a price point only when the price changed; always moves `lastCheckedAt`. Pure.
 * Returns the fields to write.
 */
export function applyPriceCheck(w: WatchRecord, price: number, at: string, keep = 60): Partial<WatchRecord> {
  const changed = price !== w.lastPrice;
  const history = changed ? [...w.history, { at, price }].slice(-keep) : w.history;
  return { lastPrice: price, lastCheckedAt: at, lastOkAt: at, history, lastError: undefined } as Partial<WatchRecord>;
}

/** Watches whose latest price dropped below the previous point or reached the target, unseen since. Pure. */
export function computeAlerts(watches: WatchRecord[]): WatchAlert[] {
  const out: WatchAlert[] = [];
  for (const w of watches) {
    const last = w.history[w.history.length - 1];
    const seenAt = w.alertSeenAt ? new Date(w.alertSeenAt).getTime() : 0;
    const lastAt = last ? new Date(last.at).getTime() : 0;
    if (last && lastAt <= seenAt) continue;
    const prev = previousPrice(w);
    if (prev !== null && w.lastPrice < prev) out.push({ watch: w, kind: "drop", reference: prev, delta: w.lastPrice - prev });
    else if (w.targetPrice !== undefined && w.targetPrice > 0 && w.lastPrice <= w.targetPrice) out.push({ watch: w, kind: "target", reference: w.targetPrice, delta: w.lastPrice - w.targetPrice });
  }
  return out;
}

/** Watches not checked within `maxAgeMs`. Pure. */
export function staleWatches(watches: WatchRecord[], now = Date.now(), maxAgeMs = AUTO_REFRESH_AFTER_MS): WatchRecord[] {
  return watches.filter((w) => now - new Date(w.lastCheckedAt).getTime() > maxAgeMs);
}

export const useWatch = create<WatchState>((set, get) => ({
  watches: [],
  checking: false,
  progress: "",
  notice: null,
  async load() {
    set({ watches: await db.watches.toArray() });
  },
  has(listingKey) {
    return get().watches.some((w) => w.listingKey === listingKey);
  },
  async toggle(listing) {
    const listingKey = `${listing.market}:${listing.id}`;
    if (get().has(listingKey)) {
      await get().remove(listingKey);
      return false;
    }
    const price = minPrice(listing) ?? 0;
    const at = new Date().toISOString();
    await db.watches.put({
      listingKey,
      market: listing.market,
      listingId: listing.id,
      title: listing.title,
      ...(listing.images[0] ? { image: listing.images[0] } : {}),
      currency: listing.price.currency,
      firstPrice: price,
      lastPrice: price,
      lastCheckedAt: at,
      lastOkAt: at,
      history: [{ at, price }],
    });
    await get().load();
    return true;
  },
  async remove(listingKey) {
    await db.watches.delete(listingKey);
    await get().load();
  },
  async setTarget(listingKey, price) {
    if (price === null || !Number.isFinite(price) || price <= 0) {
      await db.watches.where("listingKey").equals(listingKey).modify((w) => {
        delete w.targetPrice;
      });
    } else await db.watches.update(listingKey, { targetPrice: price });
    await get().load();
  },
  async markSeen(listingKey) {
    await db.watches.update(listingKey, { alertSeenAt: new Date().toISOString() });
    await get().load();
  },
  /** Re-fetches watched listings through the extension, paced, recording a point only when the price moved. */
  async refresh(listingKey, opts = {}) {
    if (get().checking) return;
    if (getDataSource() !== "extension") {
      set({ notice: WATCH_MOCK_NOTICE });
      return;
    }
    const abort = new AbortController();
    set({ checking: true, abort, notice: null, progress: "" });
    try {
      let targets = get().watches.filter((w) => !listingKey || w.listingKey === listingKey);
      if (opts.onlyStale) targets = staleWatches(targets);
      for (let i = 0; i < targets.length; i++) {
        if (abort.signal.aborted) break;
        const w = targets[i]!;
        set({ progress: `${i + 1}/${targets.length}` });
        const adapter = getRegistry().get(w.market as MarketId);
        const at = new Date().toISOString();
        if (!adapter) {
          await db.watches.update(w.listingKey, { lastCheckedAt: at, lastError: "Pazar artık tanımlı değil" });
          continue;
        }
        try {
          // Seller-specific detail (Trendyol merchantId): hint from the stored listing when we still have it.
          const stored = await db.listings.get(w.listingKey).catch(() => undefined);
          const d = await adapter.fetchListing(w.listingId, stored ? listingHint(stored) : undefined);
          const price = minPrice(d);
          if (price === null) throw new Error("İlanda fiyat yok (teklif iste)");
          await db.watches.update(w.listingKey, applyPriceCheck(w, price, at));
          await upsertListing(d);
        } catch (e) {
          await db.watches.update(w.listingKey, { lastCheckedAt: at, lastError: e instanceof Error ? e.message : String(e) });
        }
        if (i < targets.length - 1) await new Promise((r) => setTimeout(r, REFRESH_SPACING_MS));
      }
      await get().load();
    } finally {
      set({ checking: false, abort: undefined, progress: "" });
    }
  },
  stop() {
    get().abort?.abort();
  },
}));
