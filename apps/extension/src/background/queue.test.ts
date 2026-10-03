import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SlotQueue } from "./queue";

describe("SlotQueue", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("hands out slots up to max and queues the rest", async () => {
    const q = new SlotQueue(2);
    expect(await q.acquire()).toBe("ok");
    expect(await q.acquire()).toBe("ok");
    let third: string | null = null;
    void q.acquire({ label: "c" }).then((o) => (third = o));
    await Promise.resolve();
    expect(third).toBeNull();
    expect(q.stats()).toMatchObject({ active: 2, queued: [{ label: "c" }] });
    q.release();
    await Promise.resolve();
    expect(third).toBe("ok");
    expect(q.stats().active).toBe(2);
  });

  it("serves lower priority numbers first, FIFO within a priority", async () => {
    const q = new SlotQueue(1);
    await q.acquire();
    const order: string[] = [];
    void q.acquire({ priority: 2, label: "beta-1" }).then(() => order.push("beta-1"));
    void q.acquire({ priority: 2, label: "beta-2" }).then(() => order.push("beta-2"));
    void q.acquire({ priority: 0, label: "detail" }).then(() => order.push("detail"));
    void q.acquire({ priority: 1, label: "wave1" }).then(() => order.push("wave1"));
    for (let i = 0; i < 4; i++) {
      q.release();
      await Promise.resolve();
    }
    expect(order).toEqual(["detail", "wave1", "beta-1", "beta-2"]);
  });

  it("expires a waiter whose budget runs out without a slot", async () => {
    const q = new SlotQueue(1);
    await q.acquire();
    const p = q.acquire({ budgetMs: 5000, label: "late" });
    vi.advanceTimersByTime(5001);
    expect(await p).toBe("expired");
    expect(q.stats().queued).toHaveLength(0);
    // The slot is still held by the first acquirer.
    expect(q.stats().active).toBe(1);
  });

  it("aborts a waiter through its AbortSignal and on cancelWhere", async () => {
    const q = new SlotQueue(1);
    await q.acquire();
    const ac = new AbortController();
    const p = q.acquire({ signal: ac.signal, label: "owner:a" });
    const p2 = q.acquire({ label: "owner:b" });
    ac.abort();
    expect(await p).toBe("aborted");
    expect(q.cancelWhere((l) => l.startsWith("owner:b"))).toBe(1);
    expect(await p2).toBe("aborted");
    expect(q.stats().queued).toHaveLength(0);
    // An already-aborted signal never queues.
    expect(await q.acquire({ signal: ac.signal })).toBe("aborted");
  });

  it("raising max releases queued waiters immediately", async () => {
    const q = new SlotQueue(1);
    await q.acquire();
    let got: string | null = null;
    void q.acquire().then((o) => (got = o));
    q.setMax(2);
    await Promise.resolve();
    expect(got).toBe("ok");
  });
});
