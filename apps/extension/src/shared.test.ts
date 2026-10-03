import { describe, expect, it } from "vitest";
import { formatAge, formatRemaining, hostMatches, marketForUrl, normalizeSettings, overlayAllowed } from "./shared";

describe("hostMatches", () => {
  it("accepts the bare host and subdomains of a wildcard pattern", () => {
    expect(hostMatches("auctions.yahoo.co.jp", "*.auctions.yahoo.co.jp")).toBe(true);
    expect(hostMatches("page.auctions.yahoo.co.jp", "*.auctions.yahoo.co.jp")).toBe(true);
    expect(hostMatches("shopee.co.id", "*.shopee.co.id")).toBe(true);
    expect(hostMatches("1688.com", "*.1688.com")).toBe(true);
    expect(hostMatches("detail.1688.com", "1688.com")).toBe(true);
  });
  it("rejects look-alike hosts", () => {
    expect(hostMatches("not1688.com", "*.1688.com")).toBe(false);
    expect(hostMatches("1688.com.evil.io", "*.1688.com")).toBe(false);
    expect(hostMatches("global.wildberries.ru", "*.wildberries.by")).toBe(false);
  });
  it("ignores ports and case", () => {
    expect(hostMatches("WWW.Trendyol.com:443", "*.trendyol.com")).toBe(true);
  });
});

describe("marketForUrl", () => {
  const hosts = { "jp-yahooauctions": ["*.auctions.yahoo.co.jp"], "cn-1688": ["*.1688.com"] };
  it("finds the market for a bare host", () => {
    expect(marketForUrl("https://auctions.yahoo.co.jp/", hosts)).toBe("jp-yahooauctions");
    expect(marketForUrl("https://detail.1688.com/offer/1.html", hosts)).toBe("cn-1688");
    expect(marketForUrl("https://example.com/", hosts)).toBeNull();
    expect(marketForUrl("not a url", hosts)).toBeNull();
  });
});

describe("settings and formatting", () => {
  it("clamps and defaults settings", () => {
    const s = normalizeSettings({ maxParallelTabs: 99, tempo: 3, appOrigin: "ftp://x", captchaWaitMs: -5 });
    expect(s.maxParallelTabs).toBe(6);
    expect(s.tempo).toBe(1);
    expect(s.appOrigin).toBe("http://localhost:5173");
    expect(s.captchaWaitMs).toBe(0);
    expect(normalizeSettings(undefined).separateWindow).toBe(true);
    expect(normalizeSettings({ appOrigin: "https://mg.example/" }).appOrigin).toBe("https://mg.example");
  });
  it("sanitises per-market rate limits and per-site overlay switches", () => {
    const s = normalizeSettings({ rateLimit: { "cn-1688": { minIntervalMs: 12000, maxPerHour: 40 }, "tr-trendyol": { minIntervalMs: -1 }, "us-ebay": "x" }, overlaySites: { "trendyol.com": false, "1688.com": true, "bad host": false } });
    expect(s.rateLimit).toEqual({ "cn-1688": { minIntervalMs: 12000, maxPerHour: 40 } });
    expect(s.overlaySites).toEqual({ "trendyol.com": false });
    expect(normalizeSettings(undefined).overlaySites).toEqual({});
  });
  it("overlayAllowed honours the global switch and per-site switches with subdomains", () => {
    expect(overlayAllowed("www.trendyol.com", { overlay: true, overlaySites: {} })).toBe(true);
    expect(overlayAllowed("www.trendyol.com", { overlay: false, overlaySites: {} })).toBe(false);
    expect(overlayAllowed("www.trendyol.com", { overlay: true, overlaySites: { "trendyol.com": false } })).toBe(false);
    expect(overlayAllowed("detail.1688.com", { overlay: true, overlaySites: { "trendyol.com": false } })).toBe(true);
  });
  it("formats countdowns and ages in Turkish", () => {
    expect(formatRemaining(35000)).toBe("35 sn");
    expect(formatRemaining(4 * 60000)).toBe("4 dk");
    expect(formatRemaining(90 * 60000)).toBe("1 sa 30 dk");
    const now = Date.parse("2026-10-03T12:00:00Z");
    expect(formatAge("2026-10-03T11:59:50Z", now)).toBe("az önce");
    expect(formatAge("2026-10-03T11:30:00Z", now)).toBe("30 dk önce");
    expect(formatAge("2026-10-03T09:00:00Z", now)).toBe("3 sa önce");
  });
});
