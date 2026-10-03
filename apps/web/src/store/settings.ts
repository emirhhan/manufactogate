import { create } from "zustand";
import type { MarketId } from "@manufactogate/core";
import { getSetting, setSetting } from "@/lib/db";
import { setDisplayCurrency, type DisplayCurrency } from "@/lib/fx";

export type Theme = "system" | "light" | "dark";
export type DataSourcePref = "auto" | "mock" | "extension";
export interface CostSettings {
  fxCnyTry: number;
  shippingKey: string;
  defaultWeightKg: number;
  overheadRate: number;
}
export const DEFAULT_COST: CostSettings = { fxCnyTry: 4.7, shippingKey: "air", defaultWeightKg: 0.5, overheadRate: 0.08 };

interface SettingsState {
  theme: Theme;
  enabledMarkets: MarketId[];
  targetCountry: string;
  dataSource: DataSourcePref;
  cost: CostSettings;
  displayCurrency: DisplayCurrency;
  hydrated: boolean;
  hydrate(): Promise<void>;
  setTheme(t: Theme): void;
  toggleMarket(m: MarketId): void;
  setTargetCountry(c: string): void;
  setDataSource(d: DataSourcePref): void;
  setCost(c: Partial<CostSettings>): void;
  setDisplayCurrency(c: DisplayCurrency): void;
}

const DEFAULT_MARKETS: MarketId[] = ["cn-1688", "cn-taobao", "cn-pinduoduo"];

function applyTheme(t: Theme) {
  const el = document.documentElement;
  if (t === "system") el.removeAttribute("data-theme");
  else el.setAttribute("data-theme", t);
}

export const useSettings = create<SettingsState>((set, get) => ({
  theme: "system",
  enabledMarkets: DEFAULT_MARKETS,
  targetCountry: "tr",
  dataSource: "auto",
  cost: DEFAULT_COST,
  displayCurrency: "TRY",
  hydrated: false,
  async hydrate() {
    const theme = await getSetting<Theme>("theme", "system");
    const enabledMarkets = await getSetting<MarketId[]>("enabledMarkets", DEFAULT_MARKETS);
    const targetCountry = await getSetting<string>("targetCountry", "tr");
    const dataSource = await getSetting<DataSourcePref>("dataSource", "auto");
    const cost = { ...DEFAULT_COST, ...(await getSetting<Partial<CostSettings>>("cost", {})) };
    const displayCurrency = await getSetting<DisplayCurrency>("displayCurrency", "TRY");
    setDisplayCurrency(displayCurrency);
    applyTheme(theme);
    set({ theme, enabledMarkets, targetCountry, dataSource, cost, displayCurrency, hydrated: true });
  },
  setTheme(theme) {
    applyTheme(theme);
    set({ theme });
    void setSetting("theme", theme);
  },
  toggleMarket(m) {
    const cur = get().enabledMarkets;
    const next = cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m];
    set({ enabledMarkets: next });
    void setSetting("enabledMarkets", next);
  },
  setTargetCountry(c) {
    set({ targetCountry: c });
    void setSetting("targetCountry", c);
  },
  setDataSource(d) {
    set({ dataSource: d });
    void setSetting("dataSource", d);
  },
  setDisplayCurrency(c) {
    setDisplayCurrency(c);
    set({ displayCurrency: c });
    void setSetting("displayCurrency", c);
  },
  setCost(c) {
    const cost = { ...get().cost, ...c };
    set({ cost });
    void setSetting("cost", cost);
  },
}));
