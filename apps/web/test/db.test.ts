import Dexie from "dexie";
import type { RawListing } from "@manufactogate/core";
import { ManufactogateDb, deleteSearches, exportAll, importAll, listingsForSearch, orphanKeys, parseBackup, persistClusters, persistListings, pruneLargeThumbs, db } from "../src/lib/db";

const listing = (market: string, id: string, extra: Partial<RawListing> = {}): RawListing => ({
  market: market as RawListing["market"],
  id,
  url: `https://x/${id}`,
  title: `title ${id}`,
  images: [],
  price: { currency: "CNY", tiers: [{ minQty: 1, unitPrice: 10 }] },
  badges: [],
  fetchedAt: "2026-10-01T00:00:00Z",
  ...extra,
});

describe("db v3 upgrade", () => {
  it("turns legacy searchId rows into searchItems and keeps pseudo-search rows canonical", async () => {
    const name = `mg-upgrade-${Math.random()}`;
    // Write a v2 database the old way.
    const old = new Dexie(name);
    old.version(2).stores({
      searches: "id, startedAt",
      listings: "key, searchId, market",
      clusters: "key, searchId",
      settings: "key",
      projects: "id, updatedAt",
      projectItems: "key, projectId, listingKey",
      watches: "listingKey, lastCheckedAt",
    });
    await old.open();
    await old.table("searches").bulkPut([
      { id: "s1", input: { kind: "text", query: "a" }, markets: ["cn-1688"], startedAt: "2026-10-01T00:00:00Z", clusterCount: 0 },
      { id: "s2", input: { kind: "text", query: "b" }, markets: ["cn-1688"], startedAt: "2026-10-02T00:00:00Z", clusterCount: 0 },
    ]);
    await old.table("listings").bulkPut([
      { ...listing("cn-1688", "1"), key: "cn-1688:1", searchId: "s1" },
      { ...listing("cn-1688", "2"), key: "cn-1688:2", searchId: "s2" },
      { ...listing("tr-trendyol", "9"), key: "tr-trendyol:9", searchId: "watch" },
    ]);
    old.close();

    const next = new ManufactogateDb(name);
    await next.open();
    expect(next.verno).toBe(3);
    const items = await next.searchItems.toArray();
    expect(items.map((i) => `${i.searchId}:${i.key}`).sort()).toEqual(["s1:cn-1688:1", "s2:cn-1688:2"]);
    const rows = await next.listings.toArray();
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.searchId === undefined)).toBe(true);
    next.close();
  });
});

describe("persistListings / listingsForSearch", () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });
  it("keeps one canonical row per listing and remembers every search that returned it, in order", async () => {
    await persistListings("s1", [
      { listing: listing("cn-1688", "b"), order: 0 },
      { listing: listing("cn-1688", "a"), order: 1 },
    ]);
    await persistListings("s2", [{ listing: listing("cn-1688", "a", { title: "newer", fetchedAt: "2026-10-02T00:00:00Z" }), order: 0 }]);
    expect(await db.listings.count()).toBe(2);
    expect((await listingsForSearch("s1")).map((l) => l.id)).toEqual(["b", "a"]);
    expect((await listingsForSearch("s2")).map((l) => l.title)).toEqual(["newer"]);
    // The older search still has both of its listings (nothing shrank).
    expect((await listingsForSearch("s1"))[1]?.title).toBe("newer");
  });
  it("deleteSearches keeps listings referenced by other searches, projects and watches", async () => {
    await db.searches.bulkPut([
      { id: "s1", input: { kind: "text", query: "a" }, markets: [], startedAt: "2026-10-01T00:00:00Z", clusterCount: 0 },
      { id: "s2", input: { kind: "text", query: "b" }, markets: [], startedAt: "2026-10-02T00:00:00Z", clusterCount: 0 },
    ]);
    await persistListings("s1", [{ listing: listing("cn-1688", "shared"), order: 0 }, { listing: listing("cn-1688", "only1"), order: 1 }, { listing: listing("cn-1688", "inProject"), order: 2 }, { listing: listing("cn-1688", "watched"), order: 3 }]);
    await persistListings("s2", [{ listing: listing("cn-1688", "shared"), order: 0 }]);
    await db.projectItems.put({ key: "p:cn-1688:inProject", projectId: "p", listingKey: "cn-1688:inProject", note: "", addedAt: "" });
    await db.watches.put({ listingKey: "cn-1688:watched", market: "cn-1688", listingId: "watched", title: "", currency: "CNY", firstPrice: 1, lastPrice: 1, lastCheckedAt: "", history: [] });
    const r = await deleteSearches(["s1"]);
    expect(r).toEqual({ searches: 1, listings: 1 });
    expect((await db.listings.toCollection().primaryKeys()).sort()).toEqual(["cn-1688:inProject", "cn-1688:shared", "cn-1688:watched"]);
    expect(await db.searches.count()).toBe(1);
    const all = await deleteSearches("all");
    expect(all.searches).toBe(1);
    expect((await db.listings.toCollection().primaryKeys()).sort()).toEqual(["cn-1688:inProject", "cn-1688:watched"]);
  });
  it("persistClusters writes slim match rows", async () => {
    const l1 = listing("cn-1688", "1");
    const l2 = listing("tr-trendyol", "2");
    const member = (l: RawListing, score: number) => ({ listing: l, fingerprint: {}, match: { score } as never, band: "same" as const });
    await persistClusters("s1", [{ id: "c1", representativeKey: "cn-1688:1", representative: member(l1, 1), members: [member(l1, 1), member(l2, 0.9)], confidence: 0.9, band: "same", markets: ["cn-1688", "tr-trendyol"], priceRange: {} }]);
    const m = await db.matches.get("s1:c1");
    expect(m?.members.map((x) => `${x.key}@${x.score}`)).toEqual(["cn-1688:1@1", "tr-trendyol:2@0.9"]);
  });
  it("export / import round-trips and replace mode clears", async () => {
    await db.settings.put({ key: "theme", value: "dark" });
    await persistListings("s1", [{ listing: listing("cn-1688", "1"), order: 0 }]);
    const json = await exportAll();
    const backup = parseBackup(json);
    expect(backup.tables.listings).toHaveLength(1);
    await db.listings.clear();
    await db.settings.clear();
    const r = await importAll(backup, "replace");
    expect(r.tables.listings).toBe(1);
    expect((await db.settings.get("theme"))?.value).toBe("dark");
    expect(() => parseBackup("{}")).toThrow(/Manufactogate yedeği değil/);
    expect(() => parseBackup("nope")).toThrow(/JSON/);
  });
  it("pruneLargeThumbs drops only oversized thumbs", async () => {
    await db.searches.bulkPut([
      { id: "a", input: { kind: "text", query: "a" }, markets: [], startedAt: "", clusterCount: 0, thumb: "x".repeat(10) },
      { id: "b", input: { kind: "text", query: "b" }, markets: [], startedAt: "", clusterCount: 0, thumb: "x".repeat(500) },
    ]);
    expect(await pruneLargeThumbs(100)).toBe(1);
    expect((await db.searches.get("a"))?.thumb).toHaveLength(10);
    expect((await db.searches.get("b"))?.thumb).toBeUndefined();
  });
});

describe("orphanKeys", () => {
  it("returns keys nothing references, deduplicated", () => {
    expect(orphanKeys(["a", "b", "a", "c"], new Set(["b"]))).toEqual(["a", "c"]);
  });
});
