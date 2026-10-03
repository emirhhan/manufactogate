import { useMemo } from "react";
import { create } from "zustand";
import { applyCountryOverrides, sanitizeCountryOverrides, type CountryOverrides, type CountryProfile, type MarketId } from "@manufactogate/core";
import { REAL_DEF_BY_ID } from "@manufactogate/adapters";
import { COUNTRY_PROFILES } from "@manufactogate/country-profiles";
import { getSettingStrict, setSetting } from "@/lib/db";
import { FX_TO_TRY, setDisplayCurrency, setRateOverride, type DisplayCurrency } from "@/lib/fx";
import { migrateMarketIds } from "@/lib/markets";

export type Theme = "system" | "light" | "dark";
export type DataSourcePref = "auto" | "mock" | "extension";
export interface CostSettings {
  fxCnyTry: number;
  shippingKey: string;
  defaultWeightKg: number;
  overheadRate: number;
}
/** The CNY pin defaults to the dated reference table (core REFERENCE_FX via FX_TO_TRY) so a fresh install is not stuck on an old hand-typed rate. */
const REFERENCE_CNY_TRY = Math.round((FX_TO_TRY["CNY"] ?? 4.7) * 100) / 100;
export const DEFAULT_COST: CostSettings = { fxCnyTry: REFERENCE_CNY_TRY, shippingKey: "air", defaultWeightKg: 0.5, overheadRate: 0.08 };

/** Results requested per market; the extension walks result pages until it has that many. */
export const MAX_PER_MARKET_OPTIONS = [150, 300, 600] as const;
export type MaxPerMarket = (typeof MAX_PER_MARKET_OPTIONS)[number];
export interface SearchSettings {
  maxPerMarket: MaxPerMarket;
}
export const DEFAULT_SEARCH: SearchSettings = { maxPerMarket: 150 };

/** Currencies whose TRY rate the user can override in Settings (the rest keep the dated table). */
export const EDITABLE_FX = ["CNY", "USD", "EUR", "GBP"] as const;
export type FxRates = Partial<Record<string, number>>;

/** Mirror of the theme for the inline bootstrap in index.html (no flash of the wrong theme). */
export const THEME_STORAGE_KEY = "mg-theme";

/** Wave-1 markets: the four adapters with hand-calibrated selectors (not generic card reading). */
export const WAVE1_MARKETS: MarketId[] = ["cn-1688", "cn-taobao", "cn-pinduoduo", "tr-trendyol"];

/**
 * Markets the user saw returning results live in their own browser (2026-10 calibration round):
 * 1688, Taobao, Trendyol, Hepsiburada, Amazon TR, DHgate, Tokopedia, Lazada TH, eBay. The
 * "Çalışanlar" preset in Settings falls back to this list when no health round has run yet.
 */
export const VERIFIED_MARKETS: MarketId[] = ["cn-1688", "cn-taobao", "tr-trendyol", "tr-hepsiburada", "tr-amazon", "cn-dhgate", "id-tokopedia", "th-lazada", "us-ebay"];

/**
 * Enabled set of a fresh install: wave-1 plus every verified market, in that order, so the first
 * search already pairs Chinese sources with Turkish targets ("pazarda satılır mı") and the
 * verified beta markets. Pinduoduo is in because it is wave-1; its fragile login is explained
 * per market in Settings and the user can switch it off there.
 */
export const DEFAULT_MARKETS: MarketId[] = [...new Set([...WAVE1_MARKETS, ...VERIFIED_MARKETS])];

/** Per-country user figures (KDV, duty default, commissions, broker/domestic, preferred shipping). */
export type CountryOverridesMap = Record<string, CountryOverrides>;
/** Patch for `setCountryOverrides`: `null` removes a field; a `null` commission removes that marketplace's override. */
export interface CountryOverridesPatch {
  vatRate?: number | null;
  dutyDefaultRate?: number | null;
  brokerFee?: number | null;
  domesticShippingPerUnit?: number | null;
  shippingKey?: string | null;
  commissions?: Record<string, number | null> | null;
}

interface SettingsState {
  theme: Theme;
  enabledMarkets: MarketId[];
  targetCountry: string;
  dataSource: DataSourcePref;
  cost: CostSettings;
  displayCurrency: DisplayCurrency;
  search: SearchSettings;
  fxRates: FxRates;
  /** User-edited cost figures by target country; absent fields keep the dated reference profile. */
  countryOverrides: CountryOverridesMap;
  onboardingDismissedAt: string | null;
  hydrated: boolean;
  /** Set when IndexedDB could not be read; the app still renders with defaults. */
  storageError: string | null;
  hydrate(): Promise<void>;
  setTheme(t: Theme): void;
  toggleMarket(m: MarketId): void;
  setEnabledMarkets(ids: MarketId[]): void;
  setTargetCountry(c: string): void;
  setDataSource(d: DataSourcePref): void;
  setCost(c: Partial<CostSettings>): void;
  setDisplayCurrency(c: DisplayCurrency): void;
  setSearch(s: Partial<SearchSettings>): void;
  setFxRate(code: string, rate: number | null): void;
  /** Merges a patch into a country's overrides; `null` on a field removes that override. */
  setCountryOverrides(country: string, patch: CountryOverridesPatch): void;
  /** Drops every override of a country (back to the dated reference profile). */
  resetCountryOverrides(country: string): void;
  dismissOnboarding(): void;
}

function applyTheme(t: Theme) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  if (t === "system") el.removeAttribute("data-theme");
  else el.setAttribute("data-theme", t);
  try {
    if (t === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, t);
  } catch {
    /* storage blocked */
  }
}

function applyFx(rates: FxRates) {
  for (const code of EDITABLE_FX) setRateOverride(code, rates[code] ?? null);
}

/** Known market ids (the real definitions cover every market, whatever the data source). */
export function knownMarketIds(): Set<MarketId> {
  return new Set(Object.keys(REAL_DEF_BY_ID) as MarketId[]);
}

/** The market to add when a list has no seller in the target country, by preference. */
const TARGET_PREFERENCE: MarketId[] = ["tr-trendyol", "tr-hepsiburada", "tr-amazon", "de-amazon", "us-amazon", "gb-amazon", "ae-noon", "ru-ozon", "jp-rakuten", "kr-coupang", "id-tokopedia", "th-lazada", "in-indiamart"];

/**
 * Drops ids the registry no longer knows and guarantees at least one market that sells in the
 * target country, so sellability analysis has target data. Pure.
 */
export function sanitizeMarkets(ids: readonly string[], targetCountry: string, known = knownMarketIds()): MarketId[] {
  const migrated = migrateMarketIds(ids);
  const out = migrated.filter((id, i) => known.has(id) && migrated.indexOf(id) === i);
  const sellsIn = (id: MarketId) => {
    const d = REAL_DEF_BY_ID[id];
    return !!d && d.meta.country === targetCountry && d.meta.role !== "source";
  };
  if (out.length && !out.some(sellsIn)) {
    const best = TARGET_PREFERENCE.find((id) => known.has(id) && sellsIn(id)) ?? (Object.keys(REAL_DEF_BY_ID) as MarketId[]).find(sellsIn);
    if (best) out.push(best);
  }
  return out;
}

/**
 * The shipping key to keep after a country change: the country's saved preference when it exists
 * in the profile, else the current one when the profile offers it, else its first option. Pure.
 */
export function shippingKeyFor(country: string, current: string, preferred?: string): string {
  const opts = COUNTRY_PROFILES[country]?.shipping ?? [];
  if (preferred && opts.some((o) => o.key === preferred)) return preferred;
  if (!opts.length || opts.some((o) => o.key === current)) return current;
  return opts[0]!.key;
}

/** Sanitizes every stored country override map entry; unknown countries and empty entries are dropped. Pure. */
export function sanitizeCountryOverridesMap(raw: unknown): CountryOverridesMap {
  const out: CountryOverridesMap = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [country, o] of Object.entries(raw as Record<string, unknown>)) {
    if (!COUNTRY_PROFILES[country]) continue;
    const s = sanitizeCountryOverrides(o as CountryOverrides);
    if (Object.keys(s).length) out[country] = s;
  }
  return out;
}

/**
 * The profile the cost and margin code should use for a country: the dated reference with the
 * user's overrides applied (falls back to Türkiye for unknown countries). Pure.
 */
export function effectiveProfile(country: string, overrides: CountryOverridesMap): CountryProfile {
  const ref = COUNTRY_PROFILES[country] ?? COUNTRY_PROFILES["tr"]!;
  return applyCountryOverrides(ref, overrides[ref.country]);
}

export const useSettings = create<SettingsState>((set, get) => ({
  theme: "system",
  enabledMarkets: DEFAULT_MARKETS,
  targetCountry: "tr",
  dataSource: "auto",
  cost: DEFAULT_COST,
  displayCurrency: "TRY",
  search: DEFAULT_SEARCH,
  fxRates: {},
  countryOverrides: {},
  onboardingDismissedAt: null,
  hydrated: false,
  storageError: null,
  async hydrate() {
    let storageError: string | null = null;
    const read = async <T,>(key: string, fallback: T): Promise<T> => {
      try {
        return await getSettingStrict<T>(key, fallback);
      } catch (e) {
        storageError ??= e instanceof Error ? e.message : String(e);
        return fallback;
      }
    };
    try {
      const theme = await read<Theme>("theme", "system");
      const targetCountry = await read<string>("targetCountry", "tr");
      const storedMarkets = await read<MarketId[]>("enabledMarkets", DEFAULT_MARKETS);
      const enabledMarkets = sanitizeMarkets(storedMarkets, targetCountry);
      const dataSource = await read<DataSourcePref>("dataSource", "auto");
      const countryOverrides = sanitizeCountryOverridesMap(await read<unknown>("countryOverrides", {}));
      const cost = { ...DEFAULT_COST, ...(await read<Partial<CostSettings>>("cost", {})) };
      cost.shippingKey = shippingKeyFor(targetCountry, cost.shippingKey, countryOverrides[targetCountry]?.shippingKey);
      const displayCurrency = await read<DisplayCurrency>("displayCurrency", "TRY");
      const search = { ...DEFAULT_SEARCH, ...(await read<Partial<SearchSettings>>("search", {})) };
      const fxRates: FxRates = { CNY: cost.fxCnyTry, ...(await read<FxRates>("fxRates", {})) };
      if (fxRates.CNY !== cost.fxCnyTry) cost.fxCnyTry = fxRates.CNY ?? cost.fxCnyTry;
      const onboardingDismissedAt = await read<string | null>("onboardingDismissedAt", null);
      setDisplayCurrency(displayCurrency);
      applyFx(fxRates);
      applyTheme(theme);
      set({ theme, enabledMarkets, targetCountry, dataSource, cost, displayCurrency, search, fxRates, countryOverrides, onboardingDismissedAt, hydrated: true, storageError });
      if (enabledMarkets.length !== storedMarkets.length || enabledMarkets.some((m, i) => m !== storedMarkets[i])) void setSetting("enabledMarkets", enabledMarkets).catch(() => undefined);
    } catch (e) {
      // Even a failing database must not leave a blank page: render with defaults and say why.
      applyTheme(get().theme);
      set({ hydrated: true, storageError: e instanceof Error ? e.message : String(e) });
    }
  },
  setTheme(theme) {
    applyTheme(theme);
    set({ theme });
    void setSetting("theme", theme).catch(() => undefined);
  },
  toggleMarket(m) {
    const cur = get().enabledMarkets;
    get().setEnabledMarkets(cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]);
  },
  setEnabledMarkets(ids) {
    const known = knownMarketIds();
    const migrated = migrateMarketIds(ids);
    const next = migrated.filter((id, i) => known.has(id) && migrated.indexOf(id) === i);
    set({ enabledMarkets: next });
    void setSetting("enabledMarkets", next).catch(() => undefined);
  },
  setTargetCountry(c) {
    const cost = { ...get().cost, shippingKey: shippingKeyFor(c, get().cost.shippingKey, get().countryOverrides[c]?.shippingKey) };
    set({ targetCountry: c, cost });
    void setSetting("targetCountry", c).catch(() => undefined);
    void setSetting("cost", cost).catch(() => undefined);
  },
  setDataSource(d) {
    set({ dataSource: d });
    void setSetting("dataSource", d).catch(() => undefined);
  },
  setDisplayCurrency(c) {
    setDisplayCurrency(c);
    set({ displayCurrency: c });
    void setSetting("displayCurrency", c).catch(() => undefined);
  },
  setCost(c) {
    const cost = { ...get().cost, ...c };
    let fxRates = get().fxRates;
    if (c.fxCnyTry !== undefined && Number.isFinite(c.fxCnyTry) && c.fxCnyTry > 0) {
      fxRates = { ...fxRates, CNY: c.fxCnyTry };
      applyFx(fxRates);
      void setSetting("fxRates", fxRates).catch(() => undefined);
    }
    set({ cost, fxRates });
    void setSetting("cost", cost).catch(() => undefined);
    // The shipping method is remembered per target country so switching countries and back keeps it.
    if (c.shippingKey !== undefined && c.shippingKey !== get().countryOverrides[get().targetCountry]?.shippingKey) get().setCountryOverrides(get().targetCountry, { shippingKey: c.shippingKey });
  },
  setSearch(s) {
    const search = { ...get().search, ...s };
    set({ search });
    void setSetting("search", search).catch(() => undefined);
  },
  setFxRate(code, rate) {
    const fxRates = { ...get().fxRates };
    if (rate === null || !Number.isFinite(rate) || rate <= 0) delete fxRates[code];
    else fxRates[code] = rate;
    applyFx(fxRates);
    const cost = code === "CNY" ? { ...get().cost, fxCnyTry: fxRates.CNY ?? FX_TO_TRY.CNY ?? DEFAULT_COST.fxCnyTry } : get().cost;
    set({ fxRates, cost });
    void setSetting("fxRates", fxRates).catch(() => undefined);
    if (code === "CNY") void setSetting("cost", cost).catch(() => undefined);
  },
  setCountryOverrides(country, patch) {
    const cur: Record<string, unknown> = { ...(get().countryOverrides[country] ?? {}) };
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === undefined) delete cur[k];
      else if (k === "commissions") cur[k] = { ...((cur[k] as Record<string, number> | undefined) ?? {}), ...(v as Record<string, number>) };
      else cur[k] = v;
    }
    if (cur["commissions"]) {
      // A `null` commission inside the patch removes that marketplace's override.
      const c = Object.fromEntries(Object.entries(cur["commissions"] as Record<string, number | null>).filter(([, r]) => r !== null && r !== undefined)) as Record<string, number>;
      if (Object.keys(c).length) cur["commissions"] = c;
      else delete cur["commissions"];
    }
    const next = { ...get().countryOverrides };
    const clean = sanitizeCountryOverrides(cur as CountryOverrides);
    if (Object.keys(clean).length) next[country] = clean;
    else delete next[country];
    const prevCost = get().cost;
    const cost = country === get().targetCountry && clean.shippingKey && clean.shippingKey !== prevCost.shippingKey ? { ...prevCost, shippingKey: shippingKeyFor(country, prevCost.shippingKey, clean.shippingKey) } : prevCost;
    set({ countryOverrides: next, cost });
    void setSetting("countryOverrides", next).catch(() => undefined);
    if (cost !== prevCost) void setSetting("cost", cost).catch(() => undefined);
  },
  resetCountryOverrides(country) {
    const next = { ...get().countryOverrides };
    delete next[country];
    set({ countryOverrides: next });
    void setSetting("countryOverrides", next).catch(() => undefined);
  },
  dismissOnboarding() {
    const at = new Date().toISOString();
    set({ onboardingDismissedAt: at });
    void setSetting("onboardingDismissedAt", at).catch(() => undefined);
  },
}));

/** Hook: the target country's profile with the user's cost overrides applied (reactive). */
export function useCostProfile(): CountryProfile {
  const country = useSettings((s) => s.targetCountry);
  const overrides = useSettings((s) => s.countryOverrides);
  return useMemo(() => effectiveProfile(country, overrides), [country, overrides]);
}

/** Rate the app displays for a currency: the user's override, else the dated table. */
export function effectiveRate(code: string, rates: FxRates): number | undefined {
  return rates[code] ?? FX_TO_TRY[code];
}
