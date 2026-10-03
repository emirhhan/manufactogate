import { describe, expect, it } from "vitest";
import { queryLadder } from "./translate";

describe("queryLadder", () => {
  const title = "LS2 RAPID 2 RACE MAT SİYAH KASK (siyah vizörlü + Spoıler)";
  it("Turkish title → Chinese market: brand + Chinese category", () => {
    const l = queryLadder(title, "zh");
    expect(l.some((q) => q.includes("头盔"))).toBe(true);
    expect(l.join(" ")).not.toContain("vizörlü");
  });
  it("Turkish title → Turkish market: brand, model and category, not the marketing title", () => {
    const l = queryLadder(title, "tr");
    expect(l[0]).toMatch(/^LS2 RAPID 2 /);
    expect(l[0]!.toLowerCase()).toContain("kask");
    expect(l[0]!.length).toBeLessThan(30);
  });
  it("Turkish title → English market: brand + model + English category", () => {
    const l = queryLadder(title, "en");
    expect(l[0]).toBe("LS2 RAPID 2 helmet");
    expect(l).toContain("helmet");
  });
  it("Chinese title → English market: latin tokens only", () => {
    expect(queryLadder("摩托车头盔 ABC-100 四季通用", "en")[0]).toBe("ABC-100");
  });
});
