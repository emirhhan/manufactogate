import { create } from "zustand";
import type { MarketId, RawListing } from "@manufactogate/core";
import { db, type WatchRecord } from "@/lib/db";
import { getRegistry } from "@/lib/registry";

interface WatchState {
  watches: WatchRecord[];
  checking: boolean;
  load(): Promise<void>;
  toggle(listing: RawListing): Promise<boolean>;
  has(listingKey: string): boolean;
  refresh(listingKey?: string): Promise<void>;
}

const minPrice = (l: RawListing) => Math.min(...l.price.tiers.map((t) => t.unitPrice));

export const useWatch = create<WatchState>((set, get) => ({
  watches: [],
  checking: false,
  async load() {
    set({ watches: await db.watches.toArray() });
  },
  has(listingKey) {
    return get().watches.some((w) => w.listingKey === listingKey);
  },
  async toggle(listing) {
    const listingKey = `${listing.market}:${listing.id}`;
    if (get().has(listingKey)) {
      await db.watches.delete(listingKey);
      await get().load();
      return false;
    }
    const price = minPrice(listing);
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
      history: [{ at, price }],
    });
    await get().load();
    return true;
  },
  /** Re-fetches watched listings through the registry (the extension when installed) and records price points. */
  async refresh(listingKey) {
    set({ checking: true });
    try {
      const targets = get().watches.filter((w) => !listingKey || w.listingKey === listingKey);
      for (const w of targets) {
        const adapter = getRegistry().get(w.market as MarketId);
        if (!adapter) continue;
        try {
          const d = await adapter.fetchListing(w.listingId);
          const price = minPrice(d);
          const at = new Date().toISOString();
          await db.watches.update(w.listingKey, { lastPrice: price, lastCheckedAt: at, history: [...w.history, { at, price }].slice(-60) });
          await db.listings.put({ ...d, key: w.listingKey, searchId: "watch" });
        } catch {
          await db.watches.update(w.listingKey, { lastCheckedAt: new Date().toISOString() });
        }
      }
      await get().load();
    } finally {
      set({ checking: false });
    }
  },
}));
