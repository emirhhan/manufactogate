import { describe, expect, it } from "vitest";
import type { PriceSnapshot } from "@manufactogate/adapters";
import { MAX_OFFERS, mergeSnapshot } from "./snapshots";

const snap = (key: string, seenAt: string, offers: PriceSnapshot["offers"] = [{ market: "cn-1688", price: 25.8, currency: "CNY" }]): PriceSnapshot => ({
  key,
  market: "tr-trendyol",
  listingId: key.split(":")[1]!,
  title: "Kask",
  offers,
  seenAt,
});

describe("mergeSnapshot", () => {
  it("stores the snapshot under its key in the overlay's shape", () => {
    const store = mergeSnapshot({}, snap("tr-trendyol:123", "2026-10-03T00:00:00Z"));
    expect(store["tr-trendyol:123"]).toEqual({ at: "2026-10-03T00:00:00Z", title: "Kask", offers: [{ market: "cn-1688", price: 25.8, currency: "CNY" }] });
  });
  it("replaces an older snapshot of the same listing and drops invalid offers", () => {
    const a = mergeSnapshot({}, snap("tr-trendyol:1", "2026-10-01T00:00:00Z"));
    const b = mergeSnapshot(a, snap("tr-trendyol:1", "2026-10-02T00:00:00Z", [{ market: "cn-taobao", price: 30, currency: "CNY" }, { market: "cn-x", price: NaN, currency: "CNY" }, { market: "cn-1688", price: -1, currency: "CNY" }]));
    expect(b["tr-trendyol:1"]?.offers).toEqual([{ market: "cn-taobao", price: 30, currency: "CNY" }]);
    expect(b["tr-trendyol:1"]?.at).toBe("2026-10-02T00:00:00Z");
  });
  it("ignores malformed input and caps offers and entries, evicting the oldest", () => {
    const base = mergeSnapshot({}, snap("tr-trendyol:1", "2026-10-01T00:00:00Z"));
    expect(mergeSnapshot(base, { ...snap("nokey", "2026-10-01T00:00:00Z") })).toBe(base);
    expect(mergeSnapshot(base, snap("tr-trendyol:2", "2026-10-01T00:00:00Z", []))).toBe(base);
    const many = Array.from({ length: MAX_OFFERS + 5 }, (_, i) => ({ market: "cn-1688" as const, price: i + 1, currency: "CNY" }));
    expect(mergeSnapshot({}, snap("tr-trendyol:3", "2026-10-01T00:00:00Z", many))["tr-trendyol:3"]?.offers).toHaveLength(MAX_OFFERS);
    let store = {};
    for (let i = 0; i < 5; i++) store = mergeSnapshot(store, snap(`tr-trendyol:${i}`, `2026-10-0${i + 1}T00:00:00Z`), 3);
    expect(Object.keys(store).sort()).toEqual(["tr-trendyol:2", "tr-trendyol:3", "tr-trendyol:4"]);
  });
});
