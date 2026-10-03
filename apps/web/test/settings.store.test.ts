import { db } from "../src/lib/db";
import { getRate } from "../src/lib/fx";
import { COUNTRY_PROFILES } from "@manufactogate/country-profiles";
import { DEFAULT_MARKETS, effectiveProfile, sanitizeCountryOverridesMap, sanitizeMarkets, shippingKeyFor, useSettings, VERIFIED_MARKETS, WAVE1_MARKETS } from "../src/store/settings";
import { clearDb } from "./helpers";

describe("sanitizeMarkets", () => {
  it("drops unknown ids and guarantees a market selling in the target country", () => {
    expect(sanitizeMarkets(["cn-1688", "xx-gone" as never, "cn-1688"], "tr")).toEqual(["cn-1688", "tr-trendyol"]);
    expect(sanitizeMarkets(["cn-1688", "tr-hepsiburada"], "tr")).toEqual(["cn-1688", "tr-hepsiburada"]);
    expect(sanitizeMarkets(["cn-1688"], "de")).toEqual(["cn-1688", "de-amazon"]);
    expect(sanitizeMarkets([], "tr")).toEqual([]);
    expect(DEFAULT_MARKETS).toContain("tr-trendyol");
  });
  it("migrates the legacy jp-mercari id to us-mercari without duplicates", () => {
    expect(sanitizeMarkets(["jp-mercari", "cn-1688", "us-mercari"], "tr")).toEqual(["us-mercari", "cn-1688", "tr-trendyol"]);
  });
  it("fresh-install defaults are wave-1 plus the verified markets; the verified list is the user's nine", () => {
    expect(VERIFIED_MARKETS).toEqual(["cn-1688", "cn-taobao", "tr-trendyol", "tr-hepsiburada", "tr-amazon", "cn-dhgate", "id-tokopedia", "th-lazada", "us-ebay"]);
    expect(DEFAULT_MARKETS).toEqual([...new Set([...WAVE1_MARKETS, ...VERIFIED_MARKETS])]);
    expect(DEFAULT_MARKETS).toContain("cn-pinduoduo");
    expect(new Set(DEFAULT_MARKETS).size).toBe(DEFAULT_MARKETS.length);
    expect(sanitizeMarkets(DEFAULT_MARKETS, "tr")).toEqual(DEFAULT_MARKETS);
  });
  it("shippingKeyFor keeps a valid key and falls back to the first option, preferring the saved key", () => {
    expect(shippingKeyFor("tr", "air")).toBe("air");
    expect(shippingKeyFor("us", "definitely-not-an-option")).not.toBe("definitely-not-an-option");
    expect(shippingKeyFor("tr", "air", "sea")).toBe("sea");
    expect(shippingKeyFor("tr", "air", "nope")).toBe("air");
  });
  it("effectiveProfile applies only sanitized overrides of known countries", () => {
    expect(effectiveProfile("tr", {})).toBe(COUNTRY_PROFILES["tr"]);
    expect(effectiveProfile("zz", {})).toBe(COUNTRY_PROFILES["tr"]);
    const p = effectiveProfile("tr", { tr: { vatRate: 0.1, commissions: { "tr-trendyol": 0.3 } } });
    expect(p.salesVatRate).toBe(0.1);
    expect(p.commissions["tr-trendyol"]).toBe(0.3);
    expect(p.commissionsByGroup?.["tr-trendyol"]).toBeUndefined();
    expect(p.commissionsByGroup?.["tr-hepsiburada"]).toBeDefined();
    expect(sanitizeCountryOverridesMap({ tr: { vatRate: 0.18 }, zz: { vatRate: 0.1 }, de: { vatRate: 7 }, us: "x" })).toEqual({ tr: { vatRate: 0.18 } });
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
  it("hydrate maps a stored jp-mercari to us-mercari and persists the repaired list", async () => {
    await db.settings.put({ key: "enabledMarkets", value: ["cn-1688", "jp-mercari", "tr-trendyol"] });
    await useSettings.getState().hydrate();
    expect(useSettings.getState().enabledMarkets).toEqual(["cn-1688", "us-mercari", "tr-trendyol"]);
    await flushDb();
    expect((await db.settings.get("enabledMarkets"))?.value).toEqual(["cn-1688", "us-mercari", "tr-trendyol"]);
  });
  it("country overrides: patch, remove with null, reset, persist and rehydrate", async () => {
    const s = useSettings.getState();
    s.setTargetCountry("tr");
    s.setCountryOverrides("tr", { vatRate: 0.1, commissions: { "tr-trendyol": 0.25, "tr-n11": 0.2 } });
    expect(useSettings.getState().countryOverrides["tr"]).toEqual({ vatRate: 0.1, commissions: { "tr-trendyol": 0.25, "tr-n11": 0.2 } });
    s.setCountryOverrides("tr", { commissions: { "tr-n11": null }, vatRate: null, dutyDefaultRate: 0.05 });
    expect(useSettings.getState().countryOverrides["tr"]).toEqual({ dutyDefaultRate: 0.05, commissions: { "tr-trendyol": 0.25 } });
    // Invalid figures never land in the store.
    s.setCountryOverrides("tr", { brokerFee: -5, vatRate: 2 });
    expect(useSettings.getState().countryOverrides["tr"]).toEqual({ dutyDefaultRate: 0.05, commissions: { "tr-trendyol": 0.25 } });
    await flushDb();
    expect((await db.settings.get("countryOverrides"))?.value).toEqual({ tr: { dutyDefaultRate: 0.05, commissions: { "tr-trendyol": 0.25 } } });
    useSettings.setState({ countryOverrides: {} });
    await useSettings.getState().hydrate();
    expect(useSettings.getState().countryOverrides["tr"]).toEqual({ dutyDefaultRate: 0.05, commissions: { "tr-trendyol": 0.25 } });
    s.resetCountryOverrides("tr");
    expect(useSettings.getState().countryOverrides["tr"]).toBeUndefined();
    await flushDb();
    expect((await db.settings.get("countryOverrides"))?.value).toEqual({});
  });
  it("remembers the shipping method per target country", async () => {
    const s = useSettings.getState();
    s.setTargetCountry("tr");
    s.setCost({ shippingKey: "sea" });
    expect(useSettings.getState().countryOverrides["tr"]?.shippingKey).toBe("sea");
    s.setTargetCountry("de");
    const deKey = useSettings.getState().cost.shippingKey;
    expect(COUNTRY_PROFILES["de"]!.shipping.some((o) => o.key === deKey)).toBe(true);
    s.setTargetCountry("tr");
    expect(useSettings.getState().cost.shippingKey).toBe("sea");
    // Editing the current country's preference moves the live key too.
    s.setCountryOverrides("tr", { shippingKey: "air" });
    expect(useSettings.getState().cost.shippingKey).toBe("air");
    await flushDb();
    expect((await db.settings.get("cost"))?.value).toMatchObject({ shippingKey: "air" });
  });
});

/** Store writes are fire-and-forget; let the queued Dexie puts settle. */
const flushDb = () => new Promise((r) => setTimeout(r, 20));
