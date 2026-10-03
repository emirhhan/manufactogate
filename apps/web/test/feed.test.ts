import type { MatchRecord, SearchRecord } from "../src/lib/db";
import { buildFeedFrom, feedLimitFor, marketReliability, tokensOf } from "../src/lib/feed";
import { listing } from "./helpers";

const META: Record<string, { country: string; role: "source" | "target" | "both"; name: string }> = {
  "cn-1688": { country: "cn", role: "source", name: "1688" },
  "cn-taobao": { country: "cn", role: "source", name: "Taobao" },
  "tr-trendyol": { country: "tr", role: "target", name: "Trendyol" },
  "de-amazon": { country: "de", role: "target", name: "Amazon DE" },
};
const meta = (m: string) => META[m];
const img = { images: ["https://img/x.jpg"] };
const now = Date.parse("2026-10-03T12:00:00Z");

describe("tokensOf", () => {
  it("keeps Turkish words after folding and makes overlapping CJK bigrams", () => {
    expect(tokensOf("Kablosuz Kulaklık Bluetooth")).toEqual(new Set(["kablosuz", "kulaklik", "bluetooth"]));
    expect([...tokensOf("无线蓝牙耳机 kablosuz kulaklik")]).toEqual(expect.arrayContaining(["kablosuz", "kulaklik", "无线", "线蓝", "蓝牙", "牙耳", "耳机"]));
    expect(tokensOf("Gözlük ve Şarj Seti")).toEqual(new Set(["gozluk", "sarj"]));
  });
});

describe("buildFeedFrom", () => {
  it("labels margin picks with the target's own currency and respects the ratio band", () => {
    const src = listing("cn-1688", "s", { ...img, price: { currency: "CNY", tiers: [{ minQty: 1, unitPrice: 10 }] }, title: "无线蓝牙耳机 X9 Pro" });
    const de = listing("de-amazon", "d", { ...img, price: { currency: "EUR", tiers: [{ minQty: 1, unitPrice: 9 }] }, title: "Wireless earbuds X9 Pro" });
    const tooHigh = listing("de-amazon", "h", { ...img, price: { currency: "EUR", tiers: [{ minQty: 1, unitPrice: 900 }] } });
    const matches: MatchRecord[] = [
      { key: "s1:c1", searchId: "s1", confidence: 0.9, members: [{ key: "cn-1688:s", market: "cn-1688", score: 0.95 }, { key: "de-amazon:d", market: "de-amazon", score: 0.9 }] },
      { key: "s1:c2", searchId: "s1", confidence: 0.9, members: [{ key: "cn-1688:s", market: "cn-1688", score: 0.95 }, { key: "de-amazon:h", market: "de-amazon", score: 0.9 }] },
    ];
    const f = buildFeedFrom({ listings: [src, de, tooHigh], matches, watched: new Set(), inProjects: new Set(), searches: 1, targetCountry: "de", meta, now, classify: () => null });
    expect(f.marginPicks).toHaveLength(1);
    const m = f.marginPicks[0]!;
    expect(m.targetCurrency).toBe("EUR");
    expect(m.target.id).toBe("d");
    expect(m.ratio).toBeGreaterThan(2);
    expect(m.ratio).toBeLessThan(25);
  });
  it("falls back to title agreement when there is no stored match", () => {
    const src = listing("cn-1688", "s", { ...img, price: { currency: "CNY", tiers: [{ minQty: 1, unitPrice: 20 }] }, title: "Kablosuz Kulaklık Bluetooth TWS X9 Pro" });
    const tr = listing("tr-trendyol", "t", { ...img, price: { currency: "TRY", tiers: [{ minQty: 1, unitPrice: 600 }] }, title: "Kablosuz Kulaklık Bluetooth TWS X9 Pro Siyah" });
    const f = buildFeedFrom({ listings: [src, tr], matches: [], watched: new Set(), inProjects: new Set(), searches: 1, targetCountry: "tr", meta, now, classify: () => null });
    expect(f.marginPicks.map((m) => m.listing.id)).toEqual(["s"]);
    expect(f.marginPicks[0]!.targetCurrency).toBe("TRY");
  });
  it("caps featured at 3 per market, orders fresh by fetchedAt and builds reasons and rails", () => {
    const ls = [];
    for (let i = 0; i < 6; i++) ls.push(listing("cn-1688", `a${i}`, { ...img, sold: 1000 - i, fetchedAt: `2026-10-0${1 + (i % 3)}T00:00:00Z` }));
    for (let i = 0; i < 2; i++) ls.push(listing("cn-taobao", `b${i}`, { ...img, sold: 5, fetchedAt: "2026-10-03T00:00:00Z" }));
    const f = buildFeedFrom({ listings: ls, matches: [], watched: new Set(["cn-taobao:b0"]), inProjects: new Set(), searches: 3, targetCountry: "tr", meta, now, limit: 12, classify: () => null });
    expect(f.featured.filter((x) => x.listing.market === "cn-1688")).toHaveLength(3);
    expect(f.featured.find((x) => x.listing.id === "b0")?.reason).toContain("izleniyor");
    expect(f.fresh[0]!.fetchedAt >= f.fresh[1]!.fetchedAt).toBe(true);
    expect(f.rails.map((r) => r.market)).toEqual(["cn-1688", "cn-taobao"]);
    expect(f.stats.thisWeek).toBe(8);
    expect(f.bestSellers[0]!.id).toBe("a0");
  });
  it("counts categories through the classifier", () => {
    const f = buildFeedFrom({ listings: [listing("cn-1688", "1", { ...img, title: "x" }), listing("cn-1688", "2", { ...img, title: "y" })], matches: [], watched: new Set(), inProjects: new Set(), searches: 0, targetCountry: "tr", meta, now, classify: (t) => (t === "x" ? { key: "kask", tr: "Kask" } : null) });
    expect(f.categories).toEqual([{ key: "kask", tr: "Kask", count: 1 }]);
  });
  it("feedLimitFor is responsive", () => {
    expect(feedLimitFor(390)).toBe(12);
    expect(feedLimitFor(1280)).toBe(18);
    expect(feedLimitFor(1920)).toBe(24);
  });
});

describe("marketReliability", () => {
  it("aggregates per-market outcomes and merges persisted health", () => {
    const rec = (id: string, at: string, st: NonNullable<SearchRecord["marketStatus"]>): SearchRecord => ({ id, input: { kind: "text", query: "" }, markets: Object.keys(st), startedAt: at, finishedAt: at, clusterCount: 0, marketStatus: st });
    const rows = marketReliability(
      [
        rec("1", "2026-10-01T00:00:00Z", { "cn-1688": { state: "done", received: 5, durationMs: 1 }, "tr-n11": { state: "error", type: "SelectorBroken", message: "x", retryable: false } }),
        rec("2", "2026-10-02T00:00:00Z", { "cn-1688": { state: "done", received: 0, durationMs: 1 }, "tr-n11": { state: "error", type: "Captcha", message: "y", retryable: true } }),
      ],
      { "tr-n11": { ok: false, checkedAt: "2026-10-03T00:00:00Z", message: "0 sonuç" } },
    );
    const a = rows.find((r) => r.market === "cn-1688")!;
    expect(a.runs).toBe(2);
    expect(a.ok).toBe(1);
    expect(a.lastOkAt).toBe("2026-10-01T00:00:00Z");
    const n = rows.find((r) => r.market === "tr-n11")!;
    expect(n.errors).toEqual({ SelectorBroken: 1, Captcha: 1 });
    expect(n.lastErrorType).toBe("Captcha");
    expect(n.health?.ok).toBe(false);
  });
});
