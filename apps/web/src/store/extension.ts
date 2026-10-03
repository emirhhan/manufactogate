import { create } from "zustand";
import type { ExtToWeb } from "@manufactogate/adapters";
import type { HealthResult, MarketId, SessionState } from "@manufactogate/core";
import { detectExtension, onBridgeEvent, sendToExtension, type ExtensionInfo } from "@/lib/bridge";
import { getSetting, setSetting } from "@/lib/db";
import { setDataSource, type DataSource } from "@/lib/registry";
import type { DataSourcePref } from "@/store/settings";

export type HealthMap = Partial<Record<MarketId, HealthResult>>;
export const HEALTH_SETTING_KEY = "health";
/** A health result older than this is shown as stale. */
export const HEALTH_STALE_MS = 24 * 3600 * 1000;

interface ExtensionState {
  info: ExtensionInfo;
  /** User preference mirrored from settings. */
  pref: DataSourcePref;
  /** Effective data source: what getRegistry() serves right now. */
  dataSource: DataSource;
  /** The user chose the extension but it is not installed: mock data with a warning. */
  wanted: boolean;
  detecting: boolean;
  health: HealthMap;
  healthLoaded: boolean;
  checking: boolean;
  progress: string;
  abort?: AbortController | undefined;

  set(info: ExtensionInfo): void;
  setSessions(sessions: Partial<Record<MarketId, SessionState>>): void;
  applyPref(pref: DataSourcePref): void;
  /** Probes the extension; retries briefly because the content script may mark the page after first paint. */
  detect(opts?: { retries?: number; delayMs?: number }): Promise<ExtensionInfo>;
  loadHealth(): Promise<void>;
  /** Checks the given markets one after another with a human pause. */
  runRound(ids: MarketId[]): Promise<void>;
  /** The extension's own quick check over the four wave-1 markets. */
  runHealth(): Promise<void>;
  checkMarket(id: MarketId): Promise<void>;
  stop(): void;
}

/** Which registry to serve for a preference and the detected extension state. Pure. */
export function computeEffective(pref: DataSourcePref, installed: boolean): { dataSource: DataSource; wanted: boolean } {
  if (pref === "mock") return { dataSource: "mock", wanted: false };
  if (installed) return { dataSource: "extension", wanted: false };
  return { dataSource: "mock", wanted: pref === "extension" };
}

/** True when a health result is older than a day. */
export function isStaleHealth(h: HealthResult | undefined, now = Date.now()): boolean {
  if (!h) return false;
  return now - new Date(h.checkedAt).getTime() > HEALTH_STALE_MS;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    }, { once: true });
  });

export const useExtension = create<ExtensionState>((set, get) => {
  const apply = (info: ExtensionInfo, pref = get().pref) => {
    const eff = computeEffective(pref, info.installed);
    setDataSource(eff.dataSource);
    set({ info, pref, ...eff });
  };
  const mergeHealth = (patch: HealthMap) => {
    const health = { ...get().health, ...patch };
    set({ health });
    void setSetting(HEALTH_SETTING_KEY, health).catch(() => undefined);
  };
  const refreshSessions = async () => {
    try {
      const sess = await sendToExtension<ExtToWeb & { type: "sessions" }>({ type: "sessions" }, 3000);
      get().setSessions(sess.sessions);
    } catch {
      /* the round's results stand on their own */
    }
  };
  onBridgeEvent((e) => {
    const info = get().info;
    if (e.type === "orphaned" && !info.orphaned) set({ info: { ...info, orphaned: true } });
    else if (e.type === "alive" && info.orphaned) set({ info: { ...info, orphaned: false, version: e.version, lastSeenAt: new Date().toISOString() } });
  });
  return {
    info: { installed: false, sessions: {} },
    pref: "auto",
    dataSource: "mock",
    wanted: false,
    detecting: false,
    health: {},
    healthLoaded: false,
    checking: false,
    progress: "",

    set: (info) => apply(info),
    setSessions: (sessions) => set((s) => ({ info: { ...s.info, sessions: { ...s.info.sessions, ...sessions } } })),
    applyPref: (pref) => apply(get().info, pref),

    async detect(opts = {}) {
      const retries = opts.retries ?? 5;
      const delayMs = opts.delayMs ?? 300;
      set({ detecting: true });
      try {
        let info = await detectExtension();
        for (let i = 0; i < retries && !info.installed; i++) {
          await sleep(delayMs);
          info = await detectExtension();
        }
        apply(info);
        return info;
      } finally {
        set({ detecting: false });
      }
    },

    async loadHealth() {
      const health = await getSetting<HealthMap>(HEALTH_SETTING_KEY, {});
      set({ health, healthLoaded: true });
    },

    async runRound(ids) {
      if (get().checking) return;
      const abort = new AbortController();
      set({ checking: true, abort });
      try {
        for (let i = 0; i < ids.length; i++) {
          if (abort.signal.aborted) break;
          const id = ids[i]!;
          set({ progress: `${i + 1}/${ids.length} · ${id}` });
          try {
            const r = await sendToExtension<ExtToWeb & { type: "health" }>({ type: "health", market: id }, 120000);
            mergeHealth(r.health);
          } catch (e) {
            mergeHealth({ [id]: { ok: false, checkedAt: new Date().toISOString(), message: e instanceof Error ? e.message : String(e) } });
          }
          if (i < ids.length - 1) await sleep(3000 + Math.random() * 2000, abort.signal);
        }
        await refreshSessions();
      } finally {
        set({ checking: false, progress: "", abort: undefined });
      }
    },

    async runHealth() {
      if (get().checking) return;
      set({ checking: true, progress: "ana pazarlar" });
      try {
        const r = await sendToExtension<ExtToWeb & { type: "health" }>({ type: "health" }, 180000);
        mergeHealth(r.health);
        await refreshSessions();
      } catch (e) {
        set({ progress: e instanceof Error ? e.message : String(e) });
      } finally {
        set({ checking: false, progress: "" });
      }
    },

    async checkMarket(id) {
      if (get().checking) return;
      set({ checking: true, progress: id });
      try {
        const r = await sendToExtension<ExtToWeb & { type: "health" }>({ type: "health", market: id }, 90000);
        mergeHealth(r.health);
      } catch (e) {
        mergeHealth({ [id]: { ok: false, checkedAt: new Date().toISOString(), message: e instanceof Error ? e.message : String(e) } });
      } finally {
        set({ checking: false, progress: "" });
      }
    },

    stop() {
      get().abort?.abort();
    },
  };
});
