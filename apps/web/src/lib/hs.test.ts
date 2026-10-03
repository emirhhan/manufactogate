import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { HS_GROUP_OPTIONS, hsMemoryKey, hsSourceLabel, loadHsOverrides, rememberHs, sanitizeHsOverrides, suggestHsForTitle } from "./hs";

beforeEach(async () => {
  await db.settings.clear();
});

describe("product-level GTİP suggestion", () => {
  it("finds the taxonomy leaf of a Turkish title and returns the 6-digit code with its provenance", () => {
    const s = suggestHsForTitle("Kablosuz Kulaklık Bluetooth 5.3 TWS")!;
    expect(s.hs).toBe("851830");
    expect(s.source).toBe("leaf");
    expect(s.leafKey).toBe("kablosuz-kulaklik");
    expect(s.display).toBe("8518.30");
    expect(s.confidence).toBeGreaterThanOrEqual(0.9);
  });
  it("falls back to title keywords, then the group chapter", () => {
    const kw = suggestHsForTitle("头盔 motosiklet için")!;
    expect(kw.hs).toBe("650610");
    expect(["leaf", "keyword"]).toContain(kw.source);
    const grp = suggestHsForTitle("Zxqv 1234", "toys")!;
    expect(grp.hs).toBe("9503");
    expect(grp.source).toBe("group");
    expect(suggestHsForTitle("Zxqv 1234")).toBeNull();
  });
  it("remembers the user's correction per leaf and prefers it next time", async () => {
    const first = suggestHsForTitle("Kablosuz Kulaklık")!;
    const key = hsMemoryKey("Kablosuz Kulaklık", first.leafKey);
    expect(key).toBe("kablosuz-kulaklik");
    await rememberHs(key, "8518.29");
    const stored = await loadHsOverrides();
    expect(stored[key]).toBe("851829");
    const again = suggestHsForTitle("Kablosuz Kulaklık", undefined, stored)!;
    expect(again.hs).toBe("851829");
    expect(again.source).toBe("user");
    expect(hsSourceLabel(again.source)).toBe("önceki düzeltmen");
    // An empty code forgets the correction.
    await rememberHs(key, "");
    expect((await loadHsOverrides())[key]).toBeUndefined();
  });
  it("memory key falls back to the title when no leaf is known", () => {
    expect(hsMemoryKey("  Zxqv 1234 ")).toBe("Zxqv 1234");
  });
  it("sanitizeHsOverrides drops junk and caps the map", () => {
    expect(sanitizeHsOverrides(null)).toEqual({});
    expect(sanitizeHsOverrides({ a: "8517.13", b: "12", c: 5, "": "851713" })).toEqual({ a: "851713" });
    const big: Record<string, string> = {};
    for (let i = 0; i < 450; i++) big[`k${i}`] = "851713";
    expect(Object.keys(sanitizeHsOverrides(big))).toHaveLength(400);
  });
  it("group options come from the core chapter table", () => {
    expect(HS_GROUP_OPTIONS.find((o) => o.group === "electronics")).toEqual({ group: "electronics", hs: "8517", label: "Elektronik cihazlar ve aksesuarları" });
  });
});
