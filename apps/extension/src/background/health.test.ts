import { describe, expect, it } from "vitest";
import { REAL_DEF_BY_ID, TIMING } from "@manufactogate/adapters";
import { healthRequestFor, healthResultFrom } from "./health";

describe("health probes", () => {
  it("quick probes use the 8 s health budget on the search URL, without the typed home-page path", () => {
    const def = REAL_DEF_BY_ID["us-temu"]!;
    const quick = healthRequestFor(def, true);
    expect(quick).toMatchObject({ kind: "health", quick: true, timeoutMs: TIMING.quickProbeMs, url: def.searchUrl(def.healthQuery), want: 5 });
    expect(quick.typeQuery).toBeUndefined();
    const full = healthRequestFor(def, false);
    expect(full).toMatchObject({ kind: "search", timeoutMs: 15000, url: def.humanSearchHome, typeQuery: def.healthQuery });
    expect(full.quick).toBeUndefined();
  });
  it("reads ok only when the session is usable, the results page opened and something was found", () => {
    const def = REAL_DEF_BY_ID["tr-hepsiburada"]!;
    const url = def.searchUrl(def.healthQuery);
    expect(healthResultFrom(def, { ok: true, data: { session: "logged-in", items: [{}, {}], strategy: "cards", total: 40 }, finalUrl: url, tookMs: 1 }, 1200)).toMatchObject({ ok: true, durationMs: 1200, message: "giriş var · 2 sonuç · strateji cards · toplam 40" });
    expect(healthResultFrom(def, { ok: true, data: { session: "captcha", items: [] }, finalUrl: url, tookMs: 1 }, 1).ok).toBe(false);
    expect(healthResultFrom(def, { ok: true, data: { session: "unknown", items: [] }, finalUrl: "https://www.hepsiburada.com/", tookMs: 1 }, 1).message).toContain("sonuç sayfası açılmadı");
    expect(healthResultFrom(def, { ok: true, data: { session: "unknown", items: [], noResults: true }, finalUrl: url, tookMs: 1 }, 1).ok).toBe(true);
    expect(healthResultFrom(def, { ok: false, error: "Network", message: "Sayfa yüklenemedi" }, 1)).toMatchObject({ ok: false, message: "Sayfa yüklenemedi" });
  });
});
