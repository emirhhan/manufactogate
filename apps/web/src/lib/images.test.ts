import { beforeEach, describe, expect, it } from "vitest";
import { cachedImageToDataUrl, clearImageCache, createSemaphore, imageCacheSize } from "./images";

beforeEach(() => clearImageCache());

describe("images", () => {
  it("semaphore limits concurrency and preserves order", async () => {
    const sem = createSemaphore(2);
    let active = 0;
    let peak = 0;
    const order: number[] = [];
    const task = (i: number) => async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      order.push(i);
      active--;
      return i;
    };
    const res = await Promise.all([0, 1, 2, 3, 4].map((i) => sem.run(task(i))));
    expect(res).toEqual([0, 1, 2, 3, 4]);
    expect(peak).toBe(2);
    expect(order[0]).toBeLessThan(2);
  });
  it("cached fetch dedupes identical URLs and caps the cache", async () => {
    let calls = 0;
    const fetcher = async (u: string) => {
      calls++;
      return `data:${u}`;
    };
    const a = cachedImageToDataUrl("https://cdn/x.jpg", fetcher);
    const b = cachedImageToDataUrl("https://cdn/x.jpg", fetcher);
    expect(a).toBe(b);
    expect(await a).toBe("data:https://cdn/x.jpg");
    expect(calls).toBe(1);
    for (let i = 0; i < 700; i++) void cachedImageToDataUrl(`https://cdn/${i}.jpg`, fetcher);
    expect(imageCacheSize()).toBeLessThanOrEqual(600);
  });
  it("a failing fetcher resolves null instead of throwing", async () => {
    const v = await cachedImageToDataUrl("https://cdn/bad.jpg", async () => {
      throw new Error("boom");
    });
    expect(v).toBeNull();
  });
});
