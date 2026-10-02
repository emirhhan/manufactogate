import { create } from "zustand";
import type { MarketId } from "@manufactogate/core";
import { getSetting, setSetting } from "@/lib/db";

export type Theme = "system" | "light" | "dark";

interface SettingsState {
  theme: Theme;
  enabledMarkets: MarketId[];
  targetCountry: string;
  hydrated: boolean;
  hydrate(): Promise<void>;
  setTheme(t: Theme): void;
  toggleMarket(m: MarketId): void;
  setTargetCountry(c: string): void;
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
  hydrated: false,
  async hydrate() {
    const theme = await getSetting<Theme>("theme", "system");
    const enabledMarkets = await getSetting<MarketId[]>("enabledMarkets", DEFAULT_MARKETS);
    const targetCountry = await getSetting<string>("targetCountry", "tr");
    applyTheme(theme);
    set({ theme, enabledMarkets, targetCountry, hydrated: true });
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
}));
