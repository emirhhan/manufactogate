import { db } from "../src/lib/db";
import { getRate } from "../src/lib/fx";
import { DEFAULT_MARKETS, sanitizeMarkets, shippingKeyFor, useSettings } from "../src/store/settings";
import { clearDb } from "./helpers";

describe("sanitizeMarkets", () => {
  it("drops unknown ids and guarantees a market selling in the target country", () => {
    expect(sanitizeMarkets(["cn-1688", "xx-gone" as never, "cn-1688"], "tr")).toEqual(["cn-1688", "tr-trendyol"]);
    expect(sanitizeMarkets(["cn-1688", "tr-hepsiburada"], "tr")).toEqual(["cn-1688", "tr-hepsiburada"]);
    expect(sanitizeMarkets(["cn-1688"], "de")).toEqual(["cn-1688", "de-amazon"]);
    expect(sanitizeMarkets([], "tr")).toEqual([]);
    expect(DEFAULT_MARKETS).toContain("tr-trendyol");
  });
  it("shippingKeyFor keeps a valid key and falls back to the first option", () => {
    expect(shippingKeyFor("tr", "air")).toBe("air");
    expect(shippingKeyFor("us", "definitely-not-an-option")).not.toBe("definitely-not-an-option");
  });
});

describe("useSettings.hydrate", () => {
  beforeEach(async () => {
    await clearDb();
    vi.restoreAllMocks();
  });
  it("renders with defaults and a storageError when IndexedDB fails", async () => {
    vi.spyOn(db.settings, "get").mockRejectedValue(new Error("VersionError"));
    await useSettings.getState().hydrate();
    const s = useSettings.getState();
    expect(s.hydrated).toBe(true);
    expect(s.storageError).toContain("VersionError");
    expect(s.enabledMarkets.length).toBeGreaterThan(0);
  });
  it("sanitises stored markets and keeps CNY rate in step with fxRates", async () => {
    await db.settings.put({ key: "enabledMarkets", value: ["cn-1688", "gone-market"] });
    await db.settings.put({ key: "cost", value: { fxCnyTry: 5.1 } });
    await useSettings.getState().hydrate();
    const s = useSettings.getState();
    expect(s.enabledMarkets).toEqual(["cn-1688", "tr-trendyol"]);
    expect(s.fxRates.CNY).toBe(5.1);
    expect(getRate("CNY")).toBe(5.1);
    s.setCost({ fxCnyTry: 4.9 });
    expect(useSettings.getState().fxRates.CNY).toBe(4.9);
    expect(getRate("CNY")).toBe(4.9);
    s.setFxRate("CNY", 5.5);
    expect(useSettings.getState().cost.fxCnyTry).toBe(5.5);
    s.setFxRate("USD", 40);
    expect(getRate("USD")).toBe(40);
    s.setFxRate("USD", null);
    expect(getRate("USD")).not.toBe(40);
  });
  it("setTargetCountry repairs the shipping key", () => {
    const s = useSettings.getState();
    s.setCost({ shippingKey: "nope" });
    s.setTargetCountry("us");
    expect(useSettings.getState().cost.shippingKey).not.toBe("nope");
  });
});
