import { CATEGORIES, getCatalog, getLeaves, leafCounts, listingFor, searchCatalog } from "../src";

describe("taxonomy", () => {
  it("has 300 to 450 leaf categories with unique keys and every leaf has products", () => {
    const leaves = getLeaves();
    expect(leaves.length).toBeGreaterThanOrEqual(300);
    expect(leaves.length).toBeLessThanOrEqual(450);
    expect(new Set(leaves.map((l) => l.key)).size).toBe(leaves.length);
    const counts = leafCounts();
    for (const l of leaves) expect(counts[l.key]).toBeGreaterThan(0);
  });
});

describe("catalog", () => {
  it("has at least 1000 products with unique ids, across all categories", () => {
    const all = getCatalog();
    expect(all.length).toBeGreaterThanOrEqual(1000);
    expect(new Set(all.map((p) => p.id)).size).toBe(all.length);
    for (const c of CATEGORIES) expect(all.some((p) => p.group === c.key)).toBe(true);
  });
  it("is deterministic", () => {
    const a = getCatalog()[123]!;
    const l1 = listingFor(a, "cn-1688");
    const l2 = listingFor(a, "cn-1688");
    expect(l1).toEqual(l2);
    expect(l1!.price.tiers).toHaveLength(3);
    expect(listingFor(a, "tr-trendyol")!.price.currency).toBe("TRY");
  });
  it("search matches across languages and models", () => {
    expect(searchCatalog("kulaklık").length).toBeGreaterThan(0);
    expect(searchCatalog("无线耳机").length).toBeGreaterThan(0);
    expect(searchCatalog("", { leaf: "spor-ayakkabi" }).length).toBe(9);
    expect(searchCatalog("siyah", { group: "shoes" }).every((p) => p.group === "shoes")).toBe(true);
    expect(searchCatalog("zzzz-not-there")).toHaveLength(0);
  });
});
