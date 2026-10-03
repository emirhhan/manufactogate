import { describe, expect, it } from "vitest";
import type { MarketId } from "@manufactogate/core";
import { COMPARE_CAP, defaultCompareSet, withoutMarkets } from "./comparePrefs";

const W1: MarketId[] = ["cn-1688", "cn-taobao", "cn-pinduoduo", "tr-trendyol"];

describe("comparePrefs", () => {
  it("default set: source first, wave-1, proven, then a few unproven, capped", () => {
    const enabled: MarketId[] = ["cn-1688", "cn-taobao", "cn-pinduoduo", "us-ebay", "th-lazada", "jp-rakuten", "kr-coupang", "us-temu", "ae-noon", "ru-ozon", "de-amazon", "gb-amazon", "us-amazon", "id-shopee"];
    const set = defaultCompareSet({ wave1: W1, enabled, proven: ["us-ebay", "th-lazada"], source: "tr-trendyol" });
    expect(set[0]).toBe("tr-trendyol");
    expect(set.length).toBeLessThanOrEqual(COMPARE_CAP);
    expect(set).toContain("us-ebay");
    expect(set).toContain("th-lazada");
    expect(set.filter((m) => !W1.includes(m) && !["us-ebay", "th-lazada"].includes(m)).length).toBeLessThanOrEqual(4);
    expect(new Set(set).size).toBe(set.length);
  });
  it("source market is included even when not enabled", () => {
    const set = defaultCompareSet({ wave1: W1, enabled: [], proven: [], source: "us-ebay" });
    expect(set).toEqual(["us-ebay", ...W1]);
  });
  it("withoutMarkets removes from stored or automatic set", () => {
    expect(withoutMarkets(null, W1, ["cn-pinduoduo"])).toEqual(["cn-1688", "cn-taobao", "tr-trendyol"]);
    expect(withoutMarkets(["us-ebay", "tr-n11"], W1, ["tr-n11"])).toEqual(["us-ebay"]);
  });
});
