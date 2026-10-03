import { formatHs, HS_BY_GROUP, HS_BY_LEAF, suggestHs } from "../src";

describe("hs suggestion", () => {
  it("prefers user corrections, then leaf, keyword, group", () => {
    expect(suggestHs({ leafKey: "powerbank" })).toEqual({ hs: "850760", label: "Lityum-iyon akümülatör", confidence: 0.9, source: "leaf" });
    expect(suggestHs({ leafKey: "kablosuz-kulaklik" })!.hs).toBe("851830");
    expect(suggestHs({ leafKey: "akilli-saat" })!.hs).toBe("851762");
    expect(suggestHs({ leafKey: "unknown-leaf", title: "Xiaomi powerbank 20000mAh" })).toMatchObject({ hs: "850760", source: "keyword", confidence: 0.6 });
    expect(suggestHs({ groupKey: "electronics" })).toMatchObject({ hs: "8517", source: "group", confidence: 0.5 });
    expect(suggestHs({ leafKey: "powerbank", overrides: { powerbank: "850780" } })).toMatchObject({ hs: "850780", source: "user", confidence: 1 });
    expect(suggestHs({ title: "zzz" })).toBeNull();
  });
  it("gives phone cases a different code from phones", () => {
    expect(suggestHs({ title: "iPhone 15 kılıf" })!.hs).toBe("392690");
    expect(suggestHs({ title: "iPhone 15 Pro Max 256GB" })!.hs).toBe("851713");
  });
  it("covers at least 120 leaves and every group, with 4- or 6-digit codes", () => {
    expect(Object.keys(HS_BY_LEAF).length).toBeGreaterThanOrEqual(120);
    for (const [hs] of Object.values(HS_BY_LEAF)) expect(hs).toMatch(/^\d{4}(\d{2})?$/);
    for (const g of ["electronics", "computer", "home", "kitchen", "appliances", "fashion-women", "fashion-men", "shoes", "bags", "accessories", "beauty", "health", "sports", "motorcycle", "auto", "tools", "garden", "toys", "baby", "pet", "office", "industrial"]) expect(HS_BY_GROUP[g]).toBeDefined();
  });
  it("formats codes as GTİP", () => {
    expect(formatHs("851713")).toBe("8517.13");
    expect(formatHs("8517")).toBe("8517");
    expect(formatHs("85171300")).toBe("8517.13.00");
  });
});
