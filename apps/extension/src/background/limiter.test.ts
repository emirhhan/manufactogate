import { describe, expect, it } from "vitest";
import { cooldownMessage, MarketLimiter } from "./limiter";

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, tick: (ms: number) => (t += ms) };
}

describe("MarketLimiter", () => {
  it("measures the interval from the tab opening, not from enqueue", () => {
    const c = clock();
    const l = new MarketLimiter(c.now);
    expect(l.intervalWait("cn-pinduoduo", 2500)).toBe(0);
    l.stamp("cn-pinduoduo");
    expect(l.intervalWait("cn-pinduoduo", 2500)).toBe(2500);
    c.tick(1000);
    expect(l.intervalWait("cn-pinduoduo", 2500)).toBe(1500);
    c.tick(2000);
    expect(l.intervalWait("cn-pinduoduo", 2500)).toBe(0);
  });

  it("enforces maxPerHour with a sliding window", () => {
    const c = clock();
    const l = new MarketLimiter(c.now);
    for (let i = 0; i < 3; i++) {
      l.stamp("cn-taobao");
      c.tick(60000);
    }
    expect(l.hourlyCount("cn-taobao")).toBe(3);
    const block = l.hourlyBlock("cn-taobao", 3);
    expect(block?.count).toBe(3);
    expect(block?.retryInMs).toBe(3600000 - 3 * 60000);
    expect(l.hourlyBlock("cn-taobao", 4)).toBeNull();
    c.tick(3600000);
    expect(l.hourlyBlock("cn-taobao", 3)).toBeNull();
    expect(l.hourlyCount("cn-taobao")).toBe(0);
  });

  it("cooldowns expire, clear and survive a snapshot round trip", () => {
    const c = clock();
    const l = new MarketLimiter(c.now);
    l.setCooldown("cn-pinduoduo", "captcha", 60000, "https://mobile.yangkeduo.com/");
    expect(l.cooldown("cn-pinduoduo")?.kind).toBe("captcha");
    const l2 = new MarketLimiter(c.now);
    l2.restore(l.snapshot());
    expect(l2.cooldown("cn-pinduoduo")?.url).toBe("https://mobile.yangkeduo.com/");
    c.tick(60001);
    expect(l2.cooldown("cn-pinduoduo")).toBeNull();
    l.setCooldown("cn-1688", "logged-out");
    expect(l.clearCooldown("cn-1688")).toBe(true);
    expect(l.cooldown("cn-1688")).toBeNull();
  });

  it("puts a market on cooldown after two network failures inside five minutes", () => {
    const c = clock();
    const l = new MarketLimiter(c.now);
    expect(l.networkFailure("jp-rakuten")).toBeNull();
    c.tick(6 * 60000);
    expect(l.networkFailure("jp-rakuten")).toBeNull();
    c.tick(1000);
    expect(l.networkFailure("jp-rakuten")?.kind).toBe("network");
    l.success("jp-rakuten");
    expect(l.cooldown("jp-rakuten")).toBeNull();
  });

  it("formats Turkish cooldown messages with a countdown", () => {
    const now = 0;
    expect(cooldownMessage("Pinduoduo", { kind: "captcha", until: 4 * 60000 }, now)).toContain("4 dk");
    expect(cooldownMessage("Shopee ID", { kind: "logged-out", until: 30000 }, now)).toContain("giriş");
    expect(cooldownMessage("Rakuten", { kind: "network", until: 90000 }, now)).toContain("ulaşılamadı");
  });
});
