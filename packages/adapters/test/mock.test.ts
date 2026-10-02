import { normalizeBadges, runSearch, type Fingerprint, type RawListing, type SearchEvent } from "@manufactogate/core";
import { createMockRegistry } from "../src";

const fp = {
  async forQuery(): Promise<Fingerprint> {
    return { title: "Kablosuz Kulaklık", phash: "ffff0000ffff0000" };
  },
  async forListing(l: RawListing): Promise<Fingerprint> {
    return { title: l.title, phash: l.id.startsWith("kablosuz-kulaklik") ? "ffff0000ffff0000" : "0f0f0f0f0f0f0f0f" };
  },
};

describe("mock registry", () => {
  it("registers four markets and resolves links", () => {
    const r = createMockRegistry();
    expect(r.all().map((a) => a.id).sort()).toEqual(["cn-1688", "cn-pinduoduo", "cn-taobao", "tr-trendyol"]);
    expect(r.resolve("https://cn-1688.example/item/kablosuz-kulaklik-1")?.listingId).toBe("kablosuz-kulaklik-1");
    expect(r.resolve("https://nowhere.example/x")).toBeNull();
    expect(r.sources()).toHaveLength(3);
  });

  it("normalizes badges", () => {
    const a = createMockRegistry().get("cn-1688")!;
    expect(normalizeBadges(a, ["源头工厂", "unknown", "实力商家"])).toEqual(["verified-factory", "strength-merchant"]);
  });

  it("end-to-end search clusters the earbuds across markets", async () => {
    const r = createMockRegistry({ "cn-1688": { latencyMs: 1 }, "cn-taobao": { latencyMs: 1 }, "cn-pinduoduo": { latencyMs: 1 } });
    const events: SearchEvent[] = [];
    for await (const e of runSearch({ kind: "text", query: "kablosuz kulaklık" }, r.sources(), fp, { maxPerMarket: 3 })) events.push(e);
    const last = [...events].reverse().find((e) => e.type === "clusters");
    expect(last?.type).toBe("clusters");
    if (last?.type !== "clusters") return;
    expect(last.clusters.length).toBeGreaterThanOrEqual(1);
    expect(last.clusters[0]!.markets.sort()).toEqual(["cn-1688", "cn-pinduoduo", "cn-taobao"]);
    expect(events.at(-1)?.type).toBe("finished");
    const done = events.filter((e) => e.type === "market" && e.status.state === "done");
    expect(done).toHaveLength(3);
  });

  it("reports typed errors per market without failing the run", async () => {
    const r = createMockRegistry({ "cn-taobao": { session: "logged-out" }, "cn-1688": { latencyMs: 1 }, "cn-pinduoduo": { latencyMs: 1 } });
    const errors: SearchEvent[] = [];
    for await (const e of runSearch({ kind: "text", query: "kablosuz kulaklık" }, r.sources(), fp, { maxPerMarket: 2 }))
      if (e.type === "market" && e.status.state === "error") errors.push(e);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.type === "market" && errors[0]!.status.state === "error" && errors[0]!.status.type).toBe("LoggedOut");
  });
});
