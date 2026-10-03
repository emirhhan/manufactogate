import { parseQueries } from "../src/lib/csv";
import { dataUrlBytes, fitWithin, needsResize } from "../src/lib/imageResize";
import { marginRatio } from "../src/lib/margin";
import { regionOf } from "../src/lib/registry";
import { pendingRows, resetFailed, summarize } from "../src/store/bulk";
import { countByProject } from "../src/store/projects";
import { useToast } from "../src/store/toast";
import { onboardingSteps } from "../src/components/Onboarding";
import { modeOf } from "../src/components/SearchBox";
import { formatBytes, responseRate } from "../src/pages/Dashboard";
import { filterSearches, statusOf } from "../src/pages/History";
import { projectToCsv } from "../src/pages/Projects";
import { presetMarkets, sessionLabel } from "../src/pages/Settings";
import { listing } from "./helpers";

describe("csv parseQueries", () => {
  it("splits lines and semicolons, takes the first CSV column, skips a header and duplicates", () => {
    expect(parseQueries("ürün\nkask\nkask; kulaklık\n\"airfryer 5L\",x\n")).toEqual(["kask", "kulaklık", "airfryer 5L"]);
    expect(parseQueries("a\nb\nc", 2)).toEqual(["a", "b"]);
  });
});

describe("imageResize math", () => {
  it("fits within the edge without upscaling", () => {
    expect(fitWithin(4000, 3000, 1024)).toEqual({ width: 1024, height: 768, scale: 0.256 });
    expect(fitWithin(500, 300, 1024).scale).toBe(1);
    expect(dataUrlBytes("data:image/png;base64,AAAA")).toBe(3);
    expect(needsResize(100, 2000, 100)).toBe(true);
    expect(needsResize(100, 800, 600)).toBe(false);
    expect(needsResize(900_000, 100, 100)).toBe(true);
  });
});

describe("marginRatio", () => {
  it("converts to the target currency and bounds the band", () => {
    const src = listing("cn-1688", "s", { price: { currency: "CNY", tiers: [{ minQty: 1, unitPrice: 10 }] } });
    const ok = listing("tr-trendyol", "t", { price: { currency: "TRY", tiers: [{ minQty: 1, unitPrice: 200 }] } });
    const r = marginRatio(src, ok)!;
    expect(r).toBeGreaterThan(2);
    expect(marginRatio(src, listing("tr-trendyol", "x", { price: { currency: "TRY", tiers: [{ minQty: 1, unitPrice: 20 }] } }))).toBeNull();
    expect(marginRatio(src, listing("tr-trendyol", "x", { price: { currency: "XXX", tiers: [{ minQty: 1, unitPrice: 20 }] } }))).toBeNull();
    expect(marginRatio(src, listing("tr-trendyol", "x", { price: { currency: "TRY", tiers: [] } }))).toBeNull();
  });
});

describe("bulk helpers", () => {
  it("transitions rows and summarises per market", () => {
    const rows = pendingRows(["a", "b"]);
    expect(rows.every((r) => r.status === "bekliyor")).toBe(true);
    const failed = resetFailed([{ ...rows[0]!, status: "hata", error: "x" }, { ...rows[1]!, status: "bitti" }]);
    expect(failed.map((r) => r.status)).toEqual(["bekliyor", "bitti"]);
    const s = summarize([listing("cn-1688", "1"), listing("cn-1688", "2", { price: { currency: "CNY", tiers: [{ minQty: 1, unitPrice: 3 }] } }), listing("tr-trendyol", "3", { price: { currency: "TRY", tiers: [] } })]);
    expect(s.count).toBe(3);
    expect(s.perMarket).toEqual({ "cn-1688": 2, "tr-trendyol": 1 });
    expect(s.minDisplay).toBeGreaterThan(0);
  });
});

describe("misc pure helpers", () => {
  it("countByProject, regionOf, formatBytes, responseRate", () => {
    expect(countByProject([{ projectId: "a" }, { projectId: "a" }, { projectId: "b" }])).toEqual({ a: 2, b: 1 });
    expect(regionOf("cn")).toBe("cn");
    expect(regionOf("DE")).toBe("west");
    expect(regionOf("zz")).toBe("global");
    expect(formatBytes(1536)).toBe("2 KB");
    expect(formatBytes(5 * 1024 ** 2)).toBe("5.0 MB");
    expect(responseRate([])).toBeNull();
    expect(responseRate([{ market: "a", runs: 4, ok: 3, errors: {} }])).toBe(0.75);
  });
  it("toast store expires entries", async () => {
    const id = useToast.getState().push("x", { ttlMs: 10 });
    expect(useToast.getState().toasts.some((t) => t.id === id)).toBe(true);
    await new Promise((r) => setTimeout(r, 30));
    expect(useToast.getState().toasts.some((t) => t.id === id)).toBe(false);
  });
  it("onboardingSteps", () => {
    const base = { installed: true, orphaned: false, enabledCount: 3, loggedIn: 2, loggedOut: 0, searches: 1, hasTarget: true };
    expect(onboardingSteps(base).allDone).toBe(true);
    expect(onboardingSteps({ ...base, installed: false }).extension).toBe("todo");
    expect(onboardingSteps({ ...base, orphaned: true }).extension).toBe("warning");
    expect(onboardingSteps({ ...base, loggedOut: 1 }).login).toBe("warning");
    expect(onboardingSteps({ ...base, hasTarget: false }).settings).toBe("warning");
  });
  it("search box modes", () => {
    expect(modeOf("", false, () => true)).toBe("empty");
    expect(modeOf("", true, () => true)).toBe("image");
    expect(modeOf("https://detail.1688.com/offer/1.html", false, () => true)).toBe("link");
    expect(modeOf("https://example.com/x", false, () => false)).toBe("unknown-link");
    expect(modeOf("kask", false, () => false)).toBe("text");
  });
  it("history helpers", () => {
    const rec = (over: object) => ({ id: "1", input: { kind: "text" as const, query: "Kask" }, markets: ["cn-1688"], startedAt: "", clusterCount: 0, ...over });
    expect(statusOf(rec({ status: "error" })).label).toBe("hata");
    expect(statusOf(rec({ status: "cancelled" })).label).toBe("durduruldu");
    expect(statusOf(rec({ finishedAt: "x" })).label).toBe("bitti");
    expect(statusOf(rec({})).label).toBe("yarım kaldı");
    const rows = [rec({}), rec({ id: "2", input: { kind: "image" as const, image: { dataUrl: "" }, title: "foto" }, markets: ["tr-trendyol"] })];
    expect(filterSearches(rows, { kind: "image", market: "", text: "" }).map((r) => r.id)).toEqual(["2"]);
    expect(filterSearches(rows, { kind: "all", market: "cn-1688", text: "kas" }).map((r) => r.id)).toEqual(["1"]);
  });
  it("settings helpers", () => {
    expect(sessionLabel(undefined, true)).toBe("bilinmiyor");
    expect(sessionLabel(undefined, false)).toBe("giriş gerekmez");
    expect(sessionLabel("logged-out", true)).toBe("giriş yok");
    const all = [
      { id: "cn-1688" as const, meta: { country: "cn", role: "source" as const, version: "1.0.0" } },
      { id: "tr-trendyol" as const, meta: { country: "tr", role: "target" as const, version: "1.0.0" } },
      { id: "tr-n11" as const, meta: { country: "tr", role: "target" as const, version: "0.1.0-beta" } },
    ] as never;
    expect(presetMarkets("target", all, {}, "tr")).toEqual(["tr-trendyol", "tr-n11"]);
    expect(presetMarkets("verified", all, {}, "tr")).toEqual(["cn-1688", "tr-trendyol"]);
    expect(presetMarkets("working", all, { "tr-n11": { ok: true, checkedAt: "" } }, "tr")).toEqual(["tr-n11"]);
    expect(presetMarkets("working", all, {}, "tr")).toEqual(["cn-1688", "tr-trendyol"]);
    expect(presetMarkets("none", all, {}, "tr")).toEqual([]);
  });
  it("project csv includes notes and status", () => {
    const csv = projectToCsv([{ key: "p:cn-1688:1", projectId: "p", listingKey: "cn-1688:1", note: "iyi, \"A\" firması", status: "numune", addedAt: "", listing: listing("cn-1688", "1") }], (m) => m, "TRY");
    expect(csv.split("\n")).toHaveLength(2);
    expect(csv).toContain("numune");
    expect(csv).toContain('"iyi, ""A"" firması"');
  });
});
