import { describe, expect, it } from "vitest";
import type { MarketStatus } from "@manufactogate/core";
import { describeError, errorTitle, marketSearchUrl, needsVerification, summarizeMarkets } from "./marketErrors";

const PDD_RISK = "Pinduoduo bu oturuma boş liste döndürdü (risk kontrolü). Pazarda kendi hesabınızla bir arama yapıp doğrulamayı geçin, sonra tekrar deneyin.";

describe("describeError", () => {
  it("gives actionable links for login/captcha/network/selector", () => {
    const lo = describeError("LoggedOut", undefined, "cn-1688", "耳机");
    expect(lo.title).toBe("Giriş yok");
    expect(lo.action?.href).toContain("1688.com");
    const cap = describeError("Captcha", "https://www.taobao.com/verify", "cn-taobao");
    expect(cap.action).toEqual({ label: "Doğrula", href: "https://www.taobao.com/verify" });
    const net = describeError("Network", "Frame with ID 0 is showing error page", "jp-rakuten", "helmet");
    expect(net.title).toBe("Sayfa açılamadı");
    expect(net.action?.label).toBe("Pazarda aç");
    expect(net.action?.href).toContain("rakuten");
    expect(net.retryable).toBe(true);
    const sel = describeError("SelectorBroken", "no cards", "tr-n11", "kask");
    expect(sel.title).toBe("Pazar güncellendi");
    expect(sel.hint).toContain("Eklenti");
    expect(sel.retryable).toBe(false);
    expect(sel.action?.href).toContain("n11.com");
  });
  it("Pinduoduo risk control (RateLimited) asks the user to verify, with the market's login URL", () => {
    const d = describeError("RateLimited", PDD_RISK, "cn-pinduoduo", "耳机");
    expect(d.title).toBe("Doğrulama gerekli");
    expect(d.hint).toContain("giriş yap");
    expect(d.hint).toContain("doğrulamayı tamamla");
    expect(d.action).toEqual({ label: "Doğrula / Giriş yap", href: "https://mobile.yangkeduo.com/login.html" });
    expect(d.retryable).toBe(true);
    // Any type whose message mentions verification gets the same guidance (English too); a market without a login URL falls back to its search page.
    const n = describeError("Network", "verification required by the market", "jp-rakuten", "helmet");
    expect(n.action?.label).toBe("Doğrula / Giriş yap");
    expect(n.action?.href).toContain("rakuten");
    expect(needsVerification("Timeout", "slider captcha shown")).toBe(true);
    expect(needsVerification("Captcha", undefined)).toBe(true);
    expect(needsVerification("LoggedOut", "doğrulama")).toBe(false);
    expect(needsVerification("NotFound", "doğrulama")).toBe(false);
  });
  it("generic rate limits stay a cooldown message with 'Pazarda aç'", () => {
    const d = describeError("RateLimited", "429 too many requests", "cn-taobao", "耳机");
    expect(d.title).toBe("Hız sınırı");
    expect(d.hint).toContain("bekleme");
    expect(d.action?.label).toBe("Pazarda aç");
    expect(describeError("RateLimited", undefined, "cn-taobao").title).toBe("Hız sınırı");
    // Captcha keeps its own "Doğrula" link (the message URL) and is not rewritten.
    expect(describeError("Captcha", "https://www.taobao.com/verify", "cn-taobao").action?.label).toBe("Doğrula");
  });
  it("unknown market or type degrades gracefully", () => {
    const d = describeError("Weird", "msg", "zz-nope");
    expect(d.title).toBe("Weird");
    expect(d.action).toBeUndefined();
    expect(errorTitle("Timeout")).toBe("Zaman aşımı");
    expect(marketSearchUrl("zz-nope", "x")).toBeNull();
  });
});

describe("summarizeMarkets", () => {
  const markets: Record<string, MarketStatus> = {
    "cn-1688": { state: "done", received: 10, durationMs: 1000 },
    "tr-trendyol": { state: "done", received: 0, durationMs: 900 },
    "us-amazon": { state: "done", received: 0, durationMs: 900 },
    "jp-rakuten": { state: "error", type: "Network", message: "frame", retryable: true },
    "us-mercari": { state: "error", type: "Captcha", message: "", retryable: true },
    "tr-n11": { state: "error", type: "SelectorBroken", message: "", retryable: false },
    "cn-pinduoduo": { state: "error", type: "RateLimited", message: PDD_RISK, retryable: true },
    "kr-coupang": { state: "pending" },
  };
  it("classifies outcomes and proposes actions", () => {
    const s = summarizeMarkets(markets, { "cn-1688": new Array(10) }, { running: false, beta: (m) => m !== "cn-1688" && m !== "tr-trendyol" });
    expect(s.total).toBe(8);
    expect(s.withResults).toBe(1);
    expect(s.zero).toBe(2);
    expect(s.errors).toBe(4);
    expect(s.pending).toBe(1);
    // Pinduoduo's risk-control "rate limit" is a user action, not a retry.
    expect(s.needsUser).toEqual(["us-mercari", "cn-pinduoduo"]);
    expect(s.retryable).toEqual(["jp-rakuten"]);
    expect(s.broken).toEqual(["tr-n11"]);
    expect(s.byType.Network).toEqual(["jp-rakuten"]);
    expect(s.suggestions.length).toBeGreaterThanOrEqual(4);
    expect(s.suggestions.some((t) => t.includes("durduruldu"))).toBe(true);
  });
  it("suggests disabling beta markets only when several are empty", () => {
    const three: Record<string, MarketStatus> = { a: { state: "done", received: 0, durationMs: 1 }, b: { state: "done", received: 0, durationMs: 1 }, c: { state: "done", received: 0, durationMs: 1 } };
    expect(summarizeMarkets(three, {}, { beta: () => true }).suggestions.some((t) => t.includes("beta pazar"))).toBe(true);
    expect(summarizeMarkets(three, {}, { beta: () => false }).suggestions.some((t) => t.includes("beta pazar"))).toBe(false);
  });
});
