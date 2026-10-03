import { beforeEach, describe, expect, it } from "vitest";
import type { MarketId } from "@manufactogate/core";
import { COMPARE_CAP, COMPARE_MARKETS_KEY, defaultCompareSet, getCompareMarkets, setCompareMarkets } from "./comparePrefs";
import { db } from "./db";

const W1: MarketId[] = ["cn-1688", "cn-taobao", "cn-pinduoduo", "tr-trendyol"];
const VERIFIED: MarketId[] = ["tr-hepsiburada", "tr-amazon", "cn-dhgate", "id-tokopedia", "th-lazada", "us-ebay"];

beforeEach(async () => {
  await db.settings.clear();
});

describe("compare defaults with verified and target-country markets", () => {
  it("preselects source, wave-1, verified beta and target-country markets before anything unproven", () => {
    const enabled: MarketId[] = ["cn-1688", "jp-rakuten", "kr-coupang", "us-temu", "ru-ozon", "de-amazon", "gb-amazon", "us-amazon", "id-shopee", "ae-noon", "cn-alibaba"];
    const set = defaultCompareSet({ wave1: W1, enabled, proven: [], source: "cn-alibaba", verified: VERIFIED, targetMarkets: ["tr-trendyol", "tr-hepsiburada", "tr-n11"] });
    expect(set[0]).toBe("cn-alibaba");
    expect(set.slice(1, 5)).toEqual(W1);
    for (const m of VERIFIED) expect(set).toContain(m);
    expect(set).toContain("tr-n11");
    expect(set.length).toBeLessThanOrEqual(COMPARE_CAP);
    // 1 + 4 + 6 + 1 = 12 preferred: no slot left for unproven beta markets.
    expect(set).not.toContain("jp-rakuten");
    expect(new Set(set).size).toBe(set.length);
  });
  it("verified markets count as preferred even past the beta fill limit, proven markets fill the tail", () => {
    const enabled: MarketId[] = ["us-temu", "ru-ozon", "de-amazon"];
    const set = defaultCompareSet({ wave1: W1, enabled, proven: ["ru-ozon"], source: "tr-trendyol", verified: ["us-ebay", "th-lazada"], cap: 8 });
    // 6 preferred, then the proven market; the unproven beta market finds no slot past the fill limit (max(6, cap-4)).
    expect(set).toEqual(["tr-trendyol", "cn-1688", "cn-taobao", "cn-pinduoduo", "us-ebay", "th-lazada", "ru-ozon"]);
  });
  it("without the new inputs the old behaviour holds", () => {
    expect(defaultCompareSet({ wave1: W1, enabled: [], proven: [], source: "us-ebay" })).toEqual(["us-ebay", ...W1]);
  });
  it("stored compare markets are migrated from legacy ids on read", async () => {
    await db.settings.put({ key: COMPARE_MARKETS_KEY, value: ["jp-mercari", "cn-1688", "us-mercari", 5] });
    expect(await getCompareMarkets()).toEqual(["us-mercari", "cn-1688"]);
    await setCompareMarkets(null);
    expect(await getCompareMarkets()).toBeNull();
    await db.settings.put({ key: COMPARE_MARKETS_KEY, value: "garbage" });
    expect(await getCompareMarkets()).toBeNull();
  });
});
