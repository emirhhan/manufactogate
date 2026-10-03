import { TIMING, type ExtractFailure, type ExtractRequest, type ExtractResult, type RealMarketDef } from "@manufactogate/adapters";
import type { HealthResult, SessionState } from "@manufactogate/core";

/**
 * Health probes, pure so they can be unit-tested without chrome APIs.
 *  - full: mirrors the real search path (typed query on the home page when the adapter uses it), 15 s settle;
 *  - quick: the 8 s probe the web's health round uses (search URL, first reading, no captcha wait, no scrolling),
 *    identical to what the real adapter's own healthCheck() asks for.
 */
export function healthRequestFor(def: RealMarketDef, quick: boolean): ExtractRequest {
  const base: ExtractRequest = {
    market: def.id,
    kind: "search",
    url: def.searchUrl(def.healthQuery),
    want: 5,
    timeoutMs: 15000,
    ...(def.resultsUrlPattern ? { expectUrl: def.resultsUrlPattern.source } : {}),
  };
  if (quick) return { ...base, kind: "health", timeoutMs: TIMING.quickProbeMs, quick: true };
  return def.humanSearchHome ? { ...base, url: def.humanSearchHome, typeQuery: def.healthQuery, ...(def.searchBoxSelectors ? { searchBox: def.searchBoxSelectors } : {}) } : base;
}

/** Turns a run outcome into the health reading the popup and the web show. */
export function healthResultFrom(def: RealMarketDef, r: ExtractResult | ExtractFailure, durationMs: number): HealthResult {
  const checkedAt = new Date().toISOString();
  if (!r.ok) return { ok: false, checkedAt, durationMs, message: r.message };
  const d = r.data as { session: SessionState; items?: unknown[]; strategy?: string; noResults?: boolean; total?: number; resultsPage?: boolean | null; note?: string };
  const n = d.items?.length ?? 0;
  const sessionOk = d.session !== "captcha" && d.session !== "logged-out";
  const resultsPage = d.resultsPage ?? (def.resultsUrlPattern ? def.resultsUrlPattern.test(r.finalUrl) : null);
  const parts: string[] = [d.session === "logged-in" ? "giriş var" : d.session === "logged-out" ? "giriş yok" : d.session === "captcha" ? "doğrulama" : "oturum bilinmiyor"];
  if (resultsPage === false) parts.push("sonuç sayfası açılmadı");
  else parts.push(`${n} sonuç`, `strateji ${d.strategy ?? "none"}`);
  if (d.noResults) parts.push("pazar: sonuç yok");
  if (typeof d.total === "number") parts.push(`toplam ${d.total}`);
  if (d.note) parts.push(d.note);
  const ok = sessionOk && resultsPage !== false && (n > 0 || d.noResults === true);
  return { ok, checkedAt, durationMs, message: parts.join(" · ") };
}
