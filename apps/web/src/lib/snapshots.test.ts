import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RawListing } from "@manufactogate/core";
import { db } from "./db";
import { offersFromBest, offersFromMatches, pushListingSnapshot, SNAPSHOT_MAX_OFFERS } from "./snapshots";
import { setDataSource } from "./registry";

const L = (market: string, id: string, price: number | null, currency = "CNY"): RawListing => ({
  market: market as RawListing["market"],
  id,
  url: `https://x/${market}/${id}`,
  title: `title ${id}`,
  images: [],
  price: { currency, tiers: price === null ? [] : [{ minQty: 1, unitPrice: price }] },
  badges: [],
  fetchedAt: "2026-10-01T00:00:00Z",
});

beforeEach(async () => {
  setDataSource("mock");
  await Promise.all([db.listings.clear(), db.matches.clear()]);
});
afterEach(() => setDataSource("mock"));

describe("overlay price snapshots", () => {
  it("offersFromBest keeps one priced offer per market, skips the source market, sorts by price and caps", () => {
    const src = { market: "tr-trendyol" as const, id: "t1" };
    const best = [L("tr-trendyol", "t1", 500, "TRY"), L("cn-1688", "a", 20), L("cn-1688", "a2", 10), L("cn-taobao", "b", null), L("cn-pinduoduo", "c", 12), undefined];
    const offers = offersFromBest(best, src, (m) => (m === "cn-1688" ? "1688" : undefined));
    expect(offers).toEqual([
      { market: "cn-pinduoduo", price: 12, currency: "CNY", url: "https://x/cn-pinduoduo/c" },
      { market: "cn-1688", name: "1688", price: 20, currency: "CNY", url: "https://x/cn-1688/a" },
    ]);
    const many = Array.from({ length: 20 }, (_, i) => L(`m-${i}`, `x${i}`, i + 1));
    expect(offersFromBest(many, src, () => undefined)).toHaveLength(SNAPSHOT_MAX_OFFERS);
  });
  it("offersFromMatches reads stored cluster matches above the score floor and picks the cheapest per market", async () => {
    await db.listings.bulkPut([
      { ...L("tr-trendyol", "t1", 500, "TRY"), key: "tr-trendyol:t1" },
      { ...L("cn-1688", "a", 20), key: "cn-1688:a" },
      { ...L("cn-1688", "b", 15), key: "cn-1688:b" },
      { ...L("cn-taobao", "c", 30), key: "cn-taobao:c" },
      { ...L("cn-pinduoduo", "weak", 5), key: "cn-pinduoduo:weak" },
    ]);
    await db.matches.bulkPut([
      {
        key: "s1:c1",
        searchId: "s1",
        confidence: 0.9,
        members: [
          { key: "tr-trendyol:t1", market: "tr-trendyol", score: 0.95 },
          { key: "cn-1688:a", market: "cn-1688", score: 0.9 },
          { key: "cn-1688:b", market: "cn-1688", score: 0.88 },
          { key: "cn-pinduoduo:weak", market: "cn-pinduoduo", score: 0.6 },
        ],
      },
      { key: "s2:c1", searchId: "s2", confidence: 0.9, members: [{ key: "tr-trendyol:t1", market: "tr-trendyol", score: 0.9 }, { key: "cn-taobao:c", market: "cn-taobao", score: 0.86 }] },
      { key: "s3:c1", searchId: "s3", confidence: 0.5, members: [{ key: "tr-trendyol:t1", market: "tr-trendyol", score: 0.5 }, { key: "cn-pinduoduo:weak", market: "cn-pinduoduo", score: 0.99 }] },
    ]);
    const offers = await offersFromMatches("tr-trendyol:t1");
    expect(offers.map((o) => `${o.market}:${o.price}`)).toEqual(["cn-1688:15", "cn-taobao:30"]);
    expect(offers[0]!.name).toBe("1688");
    expect(await offersFromMatches("cn-1688:a")).toEqual([{ market: "tr-trendyol", name: "Trendyol", price: 500, currency: "TRY", url: "https://x/tr-trendyol/t1" }]);
    expect(await offersFromMatches("nope:1")).toEqual([]);
  });
  it("pushListingSnapshot is a no-op outside extension mode and without offers", async () => {
    expect(await pushListingSnapshot({ market: "tr-trendyol", id: "t1", title: "x" }, [{ market: "cn-1688", price: 1, currency: "CNY" }])).toBe(false);
    setDataSource("extension");
    // Extension mode but the extension is not installed (no version seen): sendSnapshot declines.
    expect(await pushListingSnapshot({ market: "tr-trendyol", id: "t1", title: "x" })).toBe(false);
  });
});
