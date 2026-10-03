import { create } from "zustand";
import type { MarketId } from "@manufactogate/core";
import { REAL_DEF_BY_ID } from "@manufactogate/adapters";
import { COUNTRY_PROFILES } from "@manufactogate/country-profiles";
import { getSettingStrict, setSetting } from "@/lib/db";
import { FX_TO_TRY, setDisplayCurrency, setRateOverride, type DisplayCurrency } from "@/lib/fx";

export type Theme = "system" | "light" | "dark";
export type DataSourcePref = "auto" | "mock" | "extension";
export interface CostSettings {
  fxCnyTry: number;
  shippingKey: string;
  defaultWeightKg: number;
  overheadRate: number;
}
export const DEFAULT_COST: CostSettings = { fxCnyTry: 4.7, shippingKey: "air", defaultWeightKg: 0.5, overheadRate: 0.08 };

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

/**
 * Markets confirmed working in the user's own browser: two Chinese sources plus the Turkish
 * targets, so the first search already yields a "pazarda satılır mı" answer. Pinduoduo stays
 * off by default (fragile login) but is one click away in Settings.
 */
export const DEFAULT_MARKETS: MarketId[] = ["cn-1688", "cn-taobao", "tr-trendyol", "tr-hepsiburada", "tr-amazon"];

/** Markets the user reported as returning results live (presets in Settings fall back to this). */
export const VERIFIED_MARKETS: MarketId[] = ["cn-1688", "cn-taobao", "tr-trendyol", "tr-hepsiburada", "tr-amazon", "cn-dhgate", "id-tokopedia", "th-lazada", "us-ebay"];

interface SettingsState {
  theme: Theme;
  enabledMarkets: MarketId[];
  targetCountry: string;
  dataSource: DataSourcePref;
  cost: CostSettings;
  displayCurrency: DisplayCurrency;
  search: SearchSettings;
  fxRates: FxRates;
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
export function sanitizeMarkets(ids: MarketId[], targetCountry: string, known = knownMarketIds()): MarketId[] {
  const out = ids.filter((id, i) => known.has(id) && ids.indexOf(id) === i);
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

/** The shipping key to keep after a country change: the current one when the profile offers it, else its first option. Pure. */
export function shippingKeyFor(country: string, current: string): string {
  const opts = COUNTRY_PROFILES[country]?.shipping ?? [];
  if (!opts.length || opts.some((o) => o.key === current)) return current;
  return opts[0]!.key;
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
      const cost = { ...DEFAULT_COST, ...(await read<Partial<CostSettings>>("cost", {})) };
      cost.shippingKey = shippingKeyFor(targetCountry, cost.shippingKey);
      const displayCurrency = await read<DisplayCurrency>("displayCurrency", "TRY");
      const search = { ...DEFAULT_SEARCH, ...(await read<Partial<SearchSettings>>("search", {})) };
      const fxRates: FxRates = { CNY: cost.fxCnyTry, ...(await read<FxRates>("fxRates", {})) };
      if (fxRates.CNY !== cost.fxCnyTry) cost.fxCnyTry = fxRates.CNY ?? cost.fxCnyTry;
      const onboardingDismissedAt = await read<string | null>("onboardingDismissedAt", null);
      setDisplayCurrency(displayCurrency);
      applyFx(fxRates);
      applyTheme(theme);
      set({ theme, enabledMarkets, targetCountry, dataSource, cost, displayCurrency, search, fxRates, onboardingDismissedAt, hydrated: true, storageError });
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
    const next = ids.filter((id, i) => known.has(id) && ids.indexOf(id) === i);
    set({ enabledMarkets: next });
    void setSetting("enabledMarkets", next).catch(() => undefined);
  },
  setTargetCountry(c) {
    const cost = { ...get().cost, shippingKey: shippingKeyFor(c, get().cost.shippingKey) };
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
  dismissOnboarding() {
    const at = new Date().toISOString();
    set({ onboardingDismissedAt: at });
    void setSetting("onboardingDismissedAt", at).catch(() => undefined);
  },
}));

/** Rate the app displays for a currency: the user's override, else the dated table. */
export function effectiveRate(code: string, rates: FxRates): number | undefined {
  return rates[code] ?? FX_TO_TRY[code];
}
