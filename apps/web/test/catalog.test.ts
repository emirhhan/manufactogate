import { PAGE_SIZE, pageWindow, queryFeed } from "../src/lib/catalog";

describe("feed", () => {
  it("pages 30 at a time over 1000+ products", () => {
    const first = queryFeed({ page: 1 });
    expect(first.total).toBeGreaterThanOrEqual(1000);
    expect(first.items).toHaveLength(PAGE_SIZE);
    expect(first.pages).toBe(Math.ceil(first.total / PAGE_SIZE));
    const last = queryFeed({ page: 9999 });
    expect(last.page).toBe(first.pages);
    expect(last.items.length).toBeGreaterThan(0);
  });
  it("filters by leaf and group and searches within", () => {
    const shoes = queryFeed({ group: "shoes" });
    expect(shoes.items.every((i) => i.product.group === "shoes")).toBe(true);
    const leaf = queryFeed({ leaf: "spor-ayakkabi", q: "siyah" });
    expect(leaf.total).toBeGreaterThan(0);
    expect(leaf.items.every((i) => i.product.category === "spor-ayakkabi")).toBe(true);
  });
  it("sorts by price", () => {
    const asc = queryFeed({ sort: "price-asc" }).items.map((i) => i.sourceMinCny);
    expect([...asc].sort((a, b) => a - b)).toEqual(asc);
  });
  it("page window", () => {
    expect(pageWindow(1, 40)).toEqual([1, 2, 3, null, 40]);
    expect(pageWindow(20, 40)).toEqual([1, null, 18, 19, 20, 21, 22, null, 40]);
    expect(pageWindow(3, 3)).toEqual([1, 2, 3]);
  });
});
