import { create } from "zustand";
import { TIMING, type ExtToWeb, type RunStage } from "@manufactogate/adapters";
import type { HealthResult, MarketId, SessionState } from "@manufactogate/core";
import { detectExtension, onBridgeEvent, onProgress, onSessionsChanged, sendToExtension, type ExtensionInfo } from "@/lib/bridge";
import { getSetting, setSetting } from "@/lib/db";
import { setDataSource, type DataSource } from "@/lib/registry";
import type { DataSourcePref } from "@/store/settings";

export type HealthMap = Partial<Record<MarketId, HealthResult>>;
export const HEALTH_SETTING_KEY = "health";
/** A health result older than this is shown as stale. */
export const HEALTH_STALE_MS = 24 * 3600 * 1000;
/** Wait per quick probe in the health round: queue + 8 s probe + slack, well under the old 120 s. */
export const HEALTH_PROBE_WAIT_MS = 60_000;

/** Live stage of a market request inside the extension, as the Results/MarketPanel UI shows it. */
export interface LiveMarketPhase {
  stage: RunStage;
  /** Envelope id of the request the stage belongs to (one market may have several: ladder rungs, pages). */
  requestId: string;
  /** When the stage was reported (ms since epoch). */
  at: number;
}

/** Turkish labels for the extension's stages. */
export const STAGE_LABELS_TR: Record<RunStage, string> = {
  queued: "sırada",
  opening: "sekme açılıyor",
  loading: "sayfa yükleniyor",
  typing: "arama yazılıyor",
  image: "görsel yükleniyor",
  settling: "sonuçlar okunuyor",
  captcha: "doğrulama bekleniyor",
  done: "bitti",
};

/** Progress of a health round, for a progress bar. */
export interface RoundProgress {
  done: number;
  total: number;
  /** Markets being probed right now. */
  active: MarketId[];
}

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
  round?: RoundProgress | undefined;
  /** Live stage per market while the extension works on this tab's requests (cleared on "done"). */
  live: Partial<Record<MarketId, LiveMarketPhase>>;
  abort?: AbortController | undefined;

  set(info: ExtensionInfo): void;
  setSessions(sessions: Partial<Record<MarketId, SessionState>>): void;
  applyPref(pref: DataSourcePref): void;
  /** Probes the extension; retries briefly because the content script may mark the page after first paint. */
  detect(opts?: { retries?: number; delayMs?: number }): Promise<ExtensionInfo>;
  loadHealth(): Promise<void>;
  /** Re-reads the session map from the extension (also runs by itself after a login/logout event). */
  refreshSessions(): Promise<void>;
  /** Quick-probes the given markets, a few at a time (8 s budget each); a 33-market round takes minutes, not an hour. */
  runRound(ids: MarketId[]): Promise<void>;
  /** The extension's own full check (real search path) over the four wave-1 markets. */
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

/** Folds one progress envelope into the live map: "done" clears the market, anything else replaces it. Pure. */
export function applyLiveProgress(live: Partial<Record<MarketId, LiveMarketPhase>>, p: { market: MarketId; stage: RunStage; requestId: string }, at = Date.now()): Partial<Record<MarketId, LiveMarketPhase>> {
  const next = { ...live };
  if (p.stage === "done") {
    // Only the request that owns the entry may clear it (a ladder rung finishing must not hide the next rung's stage).
    const cur = next[p.market];
    if (cur && cur.requestId !== p.requestId) return live;
    delete next[p.market];
    return next;
  }
  next[p.market] = { stage: p.stage, requestId: p.requestId, at };
  return next;
}

/**
 * Runs `work` over `ids` with at most `concurrency` in flight, FIFO; stops handing out new ids once
 * `signal` fires. Resolves when every started item finished. Pure scheduling, exported for tests.
 */
export async function runLimited<T>(ids: T[], concurrency: number, work: (id: T) => Promise<void>, signal?: AbortSignal): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < ids.length && !signal?.aborted) {
      const id = ids[next++]!;
      await work(id);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, ids.length)) }, worker));
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
  // A login/logout the extension noticed: apply it at once, then re-read the whole map shortly after
  // (several cookies change in a burst; one round trip covers them).
  let sessionRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  onSessionsChanged((market, session) => {
    get().setSessions({ [market]: session });
    if (sessionRefreshTimer) clearTimeout(sessionRefreshTimer);
    sessionRefreshTimer = setTimeout(() => {
      sessionRefreshTimer = null;
      void refreshSessions();
    }, 1500);
  });
  onProgress((p) => set((s) => ({ live: applyLiveProgress(s.live, p) })));
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
    live: {},

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

    refreshSessions,

    async runRound(ids) {
      if (get().checking || !ids.length) return;
      const abort = new AbortController();
      const total = ids.length;
      let done = 0;
      const active = new Set<MarketId>();
      const report = () => set({ round: { done, total, active: [...active] }, progress: `${done}/${total}${active.size ? ` · ${[...active].join(", ")}` : ""}` });
      set({ checking: true, abort });
      report();
      try {
        await runLimited(
          ids,
          TIMING.healthConcurrency,
          async (id) => {
            active.add(id);
            report();
            try {
              const r = await sendToExtension<ExtToWeb & { type: "health" }>({ type: "health", market: id, quick: true }, HEALTH_PROBE_WAIT_MS, { signal: abort.signal });
              mergeHealth(r.health);
            } catch (e) {
              if (!abort.signal.aborted) mergeHealth({ [id]: { ok: false, checkedAt: new Date().toISOString(), message: e instanceof Error ? e.message : String(e) } });
            }
            active.delete(id);
            done++;
            report();
            if (!abort.signal.aborted) await sleep(TIMING.healthPauseMs + Math.random() * TIMING.healthPauseMs, abort.signal);
          },
          abort.signal,
        );
        await refreshSessions();
      } finally {
        set({ checking: false, progress: "", round: undefined, abort: undefined });
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
