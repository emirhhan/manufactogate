import { db } from "../src/lib/db";
import { setDataSource, setRegistryForTests } from "../src/lib/registry";
import { applyPriceCheck, computeAlerts, staleWatches, useWatch, WATCH_MOCK_NOTICE } from "../src/store/watch";
import { clearDb, fakeAdapter, listing, registryOf } from "./helpers";
import type { WatchRecord } from "../src/lib/db";

const w = (extra: Partial<WatchRecord> = {}): WatchRecord => ({ listingKey: "cn-1688:1", market: "cn-1688", listingId: "1", title: "t", currency: "CNY", firstPrice: 10, lastPrice: 10, lastCheckedAt: "2026-10-01T00:00:00Z", history: [{ at: "2026-10-01T00:00:00Z", price: 10 }], ...extra });

describe("applyPriceCheck", () => {
  it("appends only when the price changes and always bumps lastCheckedAt", () => {
    const same = applyPriceCheck(w(), 10, "2026-10-02T00:00:00Z");
    expect(same.history).toHaveLength(1);
    expect(same.lastCheckedAt).toBe("2026-10-02T00:00:00Z");
    const moved = applyPriceCheck(w(), 8, "2026-10-02T00:00:00Z");
    expect(moved.history).toHaveLength(2);
    expect(moved.lastPrice).toBe(8);
    expect(moved.lastOkAt).toBe("2026-10-02T00:00:00Z");
  });
});

describe("computeAlerts", () => {
  it("flags drops and reached targets, and respects alertSeenAt", () => {
    const drop = w({ lastPrice: 8, history: [{ at: "2026-10-01T00:00:00Z", price: 10 }, { at: "2026-10-02T00:00:00Z", price: 8 }] });
    const target = w({ listingKey: "cn-1688:2", lastPrice: 10, targetPrice: 12 });
    const seen = w({ listingKey: "cn-1688:3", lastPrice: 8, alertSeenAt: "2026-10-03T00:00:00Z", history: [{ at: "2026-10-01T00:00:00Z", price: 10 }, { at: "2026-10-02T00:00:00Z", price: 8 }] });
    const rise = w({ listingKey: "cn-1688:4", lastPrice: 12, history: [{ at: "2026-10-01T00:00:00Z", price: 10 }, { at: "2026-10-02T00:00:00Z", price: 12 }] });
    const alerts = computeAlerts([drop, target, seen, rise]);
    expect(alerts.map((a) => `${a.watch.listingKey}:${a.kind}`)).toEqual(["cn-1688:1:drop", "cn-1688:2:target"]);
    expect(alerts[0]!.delta).toBe(-2);
  });
  it("staleWatches picks records older than 12h", () => {
    const now = Date.parse("2026-10-02T00:00:00Z");
    expect(staleWatches([w(), w({ listingKey: "x", lastCheckedAt: "2026-10-01T20:00:00Z" })], now).map((x) => x.listingKey)).toEqual(["cn-1688:1"]);
  });
});

describe("useWatch.refresh", () => {
  beforeEach(async () => {
    await clearDb();
    useWatch.setState({ watches: [], checking: false, notice: null });
  });
  afterEach(() => {
    setRegistryForTests(null);
    setDataSource("mock");
  });
  it("refuses in mock mode with a notice", async () => {
    setDataSource("mock");
    await useWatch.getState().refresh();
    expect(useWatch.getState().notice).toBe(WATCH_MOCK_NOTICE);
  });
  it("records a point only on change, keeps errors and removes cleanly", async () => {
    setDataSource("extension");
    await db.watches.put(w());
    await db.watches.put(w({ listingKey: "cn-1688:err", listingId: "err" }));
    setRegistryForTests(registryOf(fakeAdapter("cn-1688", { detail: (id) => { if (id === "err") throw new Error("captcha"); return { ...listing("cn-1688", id, { price: { currency: "CNY", tiers: [{ minQty: 1, unitPrice: 7 }] } }), attributes: {} }; } })));
    useWatch.setState({ watches: await db.watches.toArray() });
    await useWatch.getState().refresh();
    const [ok, err] = (await db.watches.toArray()).sort((a, b) => a.listingKey.localeCompare(b.listingKey));
    expect(ok!.history).toHaveLength(2);
    expect(ok!.lastPrice).toBe(7);
    expect(ok!.lastError).toBeUndefined();
    expect(err!.lastError).toBe("captcha");
    expect(err!.history).toHaveLength(1);
    expect(await db.listings.get("cn-1688:1")).toBeTruthy();
    await useWatch.getState().remove("cn-1688:1");
    expect(await db.watches.count()).toBe(1);
  });
});
