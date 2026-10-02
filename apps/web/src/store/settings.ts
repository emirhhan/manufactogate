import { create } from "zustand";
import type { MarketId } from "@manufactogate/core";
import { getSetting, setSetting } from "@/lib/db";

export type Theme = "system" | "light" | "dark";
export type DataSourcePref = "auto" | "mock" | "extension";

interface SettingsState {
  theme: Theme;
  enabledMarkets: MarketId[];
  targetCountry: string;
  dataSource: DataSourcePref;
  hydrated: boolean;
  hydrate(): Promise<void>;
  setTheme(t: Theme): void;
  toggleMarket(m: MarketId): void;
  setTargetCountry(c: string): void;
  setDataSource(d: DataSourcePref): void;
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
  hydrated: false,
  async hydrate() {
    const theme = await getSetting<Theme>("theme", "system");
    const enabledMarkets = await getSetting<MarketId[]>("enabledMarkets", DEFAULT_MARKETS);
    const targetCountry = await getSetting<string>("targetCountry", "tr");
    const dataSource = await getSetting<DataSourcePref>("dataSource", "auto");
    applyTheme(theme);
    set({ theme, enabledMarkets, targetCountry, dataSource, hydrated: true });
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
}));
