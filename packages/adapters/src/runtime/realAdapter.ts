import {
  AdapterError,
  type HealthResult,
  type ImageInput,
  type LinkInfo,
  type MarketAdapter,
  type MarketId,
  type MarketMeta,
  type NormalizedBadge,
  type RawListing,
  type RawListingDetail,
  type RawSupplier,
  type SearchOptions,
  type SessionState,
} from "@manufactogate/core";
import type { CardData } from "../dom";
import type { ExtractFailure, ExtractResult, PageExtractor, PageRunner } from "./runner";

/** What a market's page-side search extractor returns per item. Must be JSON-serializable. */
export interface SearchItem extends CardData {
  currency?: string;
  moq?: number | null;
  tiers?: { minQty: number; unitPrice: number }[];
  rating?: number | null;
  supplierId?: string | null;
}

export interface SearchPayload {
  session: SessionState;
  items: SearchItem[];
  /** Which strategy produced the items: "embedded" (page JSON) or "cards" (DOM heuristic). */
  strategy: "embedded" | "cards" | "none";
  pageTitle: string;
}

export interface DetailPayload {
  session: SessionState;
  strategy: "embedded" | "dom" | "none";
  detail: Record<string, unknown> | null;
}

export interface SupplierPayload {
  session: SessionState;
  strategy: "embedded" | "dom" | "none";
  supplier: Record<string, unknown> | null;
}

export interface RealMarketDef {
  id: MarketId;
  meta: MarketMeta;
  badgeMap: Record<string, NormalizedBadge>;
  searchUrl(query: string): string;
  /** Page for image search. `upload: false` means the URL already carries the image (no file injection). */
  imageSearchUrl?: (input: ImageInput) => { url: string; upload: boolean };
  detailUrl(id: string): string;
  supplierUrl?: (id: string) => string;
  resolveLink(url: string): LinkInfo | null;
  /** Page-side routines, bundled into the extension. */
  extractor: PageExtractor;
  toListing(item: SearchItem, fetchedAt: string): RawListing | null;
  toDetail(detail: Record<string, unknown>, id: string, fetchedAt: string): RawListingDetail | null;
  toSupplier?: (supplier: Record<string, unknown>, id: string) => RawSupplier | null;
  /** Known-good query for health checks. */
  healthQuery: string;
}

function fail(def: RealMarketDef, r: ExtractFailure): never {
  throw new AdapterError(r.error, def.id, r.message);
}

function assertSession(def: RealMarketDef, s: SessionState, url?: string) {
  if (s === "logged-out") throw new AdapterError("LoggedOut", def.id, url);
  if (s === "captcha") throw new AdapterError("Captcha", def.id, url);
}

/** Builds a MarketAdapter from a market definition and a PageRunner (the extension). */
export function createRealAdapter(def: RealMarketDef, runner: PageRunner): MarketAdapter {
  const now = () => new Date().toISOString();

  async function* search(url: string, imageDataUrl: string | undefined, o?: SearchOptions): AsyncIterable<RawListing> {
    const req = { market: def.id, kind: "search" as const, url, want: o?.maxResults ?? 30, ...(imageDataUrl ? { imageDataUrl } : {}) };
    const r = await runner.run<SearchPayload>(req);
    if (!r.ok) fail(def, r);
    assertSession(def, r.data.session, r.finalUrl);
    if (r.data.strategy === "none" && r.data.items.length === 0) {
      throw new AdapterError("SelectorBroken", def.id, `no results parsed on ${r.finalUrl}`);
    }
    const fetchedAt = now();
    let n = 0;
    for (const item of r.data.items) {
      if (o?.signal?.aborted) return;
      const l = def.toListing(item, fetchedAt);
      if (!l) continue;
      yield l;
      if (++n >= (o?.maxResults ?? 30)) return;
    }
  }

  return {
    id: def.id,
    meta: def.meta,
    badgeMap: def.badgeMap,

    async session(): Promise<SessionState> {
      const r = await runner.run<{ session: SessionState }>({ market: def.id, kind: "health", url: def.searchUrl(def.healthQuery), timeoutMs: 8000 });
      return r.ok ? r.data.session : "unknown";
    },

    resolveLink: def.resolveLink,

    searchByImage(input: ImageInput, o?: SearchOptions) {
      if (!def.imageSearchUrl) throw new AdapterError("NotFound", def.id, "bu pazar görselle arama desteklemiyor");
      const target = def.imageSearchUrl(input);
      return search(target.url, target.upload ? input.dataUrl : undefined, o);
    },
    searchByText(query: string, o?: SearchOptions) {
      return search(def.searchUrl(query), undefined, o);
    },

    async fetchListing(id: string): Promise<RawListingDetail> {
      const r = await runner.run<DetailPayload>({ market: def.id, kind: "detail", url: def.detailUrl(id) });
      if (!r.ok) fail(def, r);
      assertSession(def, r.data.session, r.finalUrl);
      const d = r.data.detail && def.toDetail(r.data.detail, id, now());
      if (!d) throw new AdapterError("SelectorBroken", def.id, `detail not parsed on ${r.finalUrl}`);
      return d;
    },

    async fetchSupplier(id: string): Promise<RawSupplier> {
      if (!def.supplierUrl || !def.toSupplier) throw new AdapterError("NotFound", def.id, "tedarikçi profili desteklenmiyor");
      const r = await runner.run<SupplierPayload>({ market: def.id, kind: "supplier", url: def.supplierUrl(id) });
      if (!r.ok) fail(def, r);
      assertSession(def, r.data.session, r.finalUrl);
      const s = r.data.supplier && def.toSupplier(r.data.supplier, id);
      if (!s) throw new AdapterError("SelectorBroken", def.id, `supplier not parsed on ${r.finalUrl}`);
      return s;
    },

    async healthCheck(): Promise<HealthResult> {
      const t0 = Date.now();
      try {
        const r = (await runner.run<SearchPayload>({ market: def.id, kind: "search", url: def.searchUrl(def.healthQuery), want: 5, timeoutMs: 15000 })) as
          | ExtractResult<SearchPayload>
          | ExtractFailure;
        if (!r.ok) return { ok: false, checkedAt: now(), durationMs: Date.now() - t0, message: `${r.error}: ${r.message}` };
        const n = r.data.items.length;
        return {
          ok: r.data.session !== "captcha" && n > 0,
          checkedAt: now(),
          durationMs: Date.now() - t0,
          message: `${r.data.session}; ${n} sonuç; strateji ${r.data.strategy}`,
        };
      } catch (e) {
        return { ok: false, checkedAt: now(), durationMs: Date.now() - t0, message: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}

/** Shared session heuristics for page extractors. */
export function detectSession(
  doc: Document,
  opts: { loginHosts: RegExp; captchaMarkers: string[]; loggedInMarkers: string[]; loggedOutMarkers?: string[] },
): SessionState {
  const href = doc.location?.href ?? "";
  if (opts.loginHosts.test(href)) return "logged-out";
  const html = doc.documentElement?.outerHTML ?? "";
  if (opts.captchaMarkers.some((m) => html.includes(m))) return "captcha";
  if (opts.loggedOutMarkers?.some((m) => html.includes(m))) return "logged-out";
  if (opts.loggedInMarkers.some((m) => html.includes(m))) return "logged-in";
  return "unknown";
}
