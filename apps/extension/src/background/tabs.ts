import type { MarketId, SessionState } from "@manufactogate/core";

/**
 * Registry of the tabs the runner opened. Mirrored to chrome.storage.session so a restarted
 * service worker can find and close orphans (its in-memory state is gone after Chrome kills it).
 * Market tabs live in a dedicated, unfocused window when the setting allows, so they never mix
 * into the user's own tab strip. One kept tab per market for login/captcha hand-off.
 */

export interface TabRecord {
  tabId: number;
  market: MarketId;
  kind: string;
  openedAt: number;
  kept: boolean;
  windowId: number | null;
  url: string;
  owner: string | null;
  session?: SessionState;
}

const KEY_TABS = "mgTabs";
const KEY_WINDOW = "mgWindow";
/** A blank tab parks the dedicated window between requests so it is not created and destroyed per request. */
const PLACEHOLDER = "placeholder";
const PLACEHOLDER_IDLE_MS = 3 * 60000;

export class TabRegistry {
  readonly tabs = new Map<number, TabRecord>();
  windowId: number | null = null;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  /** Reads the mirror, verifies every tab still exists and closes orphans that were not kept for the user. */
  async restore(): Promise<{ closed: number; kept: number }> {
    let closed = 0;
    let kept = 0;
    let stored: { [KEY_TABS]?: TabRecord[]; [KEY_WINDOW]?: number | null } = {};
    try {
      stored = (await chrome.storage.session.get([KEY_TABS, KEY_WINDOW])) as typeof stored;
    } catch {
      return { closed, kept };
    }
    const win = stored[KEY_WINDOW];
    if (typeof win === "number") {
      const ok = await chrome.windows.get(win).then(() => true, () => false);
      this.windowId = ok ? win : null;
    }
    for (const rec of stored[KEY_TABS] ?? []) {
      if (!rec || typeof rec.tabId !== "number") continue;
      const tab = await chrome.tabs.get(rec.tabId).catch(() => null);
      if (!tab) continue;
      if (rec.kept) {
        this.tabs.set(rec.tabId, rec);
        kept++;
      } else {
        await chrome.tabs.remove(rec.tabId).catch(() => undefined);
        closed++;
      }
    }
    this.persist();
    return { closed, kept };
  }

  persist(): void {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void chrome.storage.session.set({ [KEY_TABS]: [...this.tabs.values()], [KEY_WINDOW]: this.windowId }).catch(() => undefined);
    }, 50);
  }

  has(tabId: number): boolean {
    return this.tabs.has(tabId);
  }

  get(tabId: number): TabRecord | undefined {
    return this.tabs.get(tabId);
  }

  /** Runner tabs that hold a page (placeholders excluded). */
  count(): number {
    let n = 0;
    for (const r of this.tabs.values()) if (r.kind !== PLACEHOLDER) n++;
    return n;
  }

  keptFor(market: MarketId): TabRecord | undefined {
    for (const r of this.tabs.values()) if (r.kept && r.market === market) return r;
    return undefined;
  }

  keptAll(): TabRecord[] {
    return [...this.tabs.values()].filter((r) => r.kept);
  }

  /** Opens a background tab for a request; in the dedicated window when asked and possible. */
  async open(url: string, market: MarketId, kind: string, opts: { separateWindow: boolean; owner?: string | null }): Promise<number> {
    let tabId: number | undefined;
    let windowId: number | null = null;
    if (opts.separateWindow) {
      if (this.windowId !== null) {
        const exists = await chrome.windows.get(this.windowId).then(() => true, () => false);
        if (!exists) this.windowId = null;
      }
      if (this.windowId !== null) {
        const parked = [...this.tabs.values()].find((r) => r.kind === PLACEHOLDER && r.windowId === this.windowId);
        if (parked) {
          const ok = await chrome.tabs.update(parked.tabId, { url, active: false }).then(() => true, () => false);
          if (ok) {
            tabId = parked.tabId;
            windowId = this.windowId;
          } else this.tabs.delete(parked.tabId);
        }
        if (tabId === undefined) {
          const tab = await chrome.tabs.create({ url, active: false, windowId: this.windowId }).catch(() => null);
          if (tab?.id !== undefined) {
            tabId = tab.id;
            windowId = this.windowId;
          }
        }
      } else {
        const win = await chrome.windows.create({ url, focused: false, type: "normal", width: 1280, height: 900 }).catch(() => null);
        if (win?.id !== undefined) {
          this.windowId = win.id;
          windowId = win.id;
          tabId = win.tabs?.[0]?.id;
          if (tabId === undefined) {
            const [t] = await chrome.tabs.query({ windowId: win.id }).catch(() => []);
            tabId = t?.id;
          }
        }
      }
    }
    if (tabId === undefined) {
      const tab = await chrome.tabs.create({ url, active: false });
      tabId = tab.id;
      windowId = tab.windowId ?? null;
    }
    if (tabId === undefined) throw new Error("tab-open-failed");
    this.tabs.set(tabId, { tabId, market, kind, openedAt: Date.now(), kept: false, windowId, url, owner: opts.owner ?? null });
    this.persist();
    return tabId;
  }

  async close(tabId: number): Promise<void> {
    const rec = this.tabs.get(tabId);
    if (rec && rec.kind !== PLACEHOLDER && this.windowId !== null && rec.windowId === this.windowId) {
      // Last tab of the dedicated window: park it instead of letting the window vanish and reappear.
      const siblings = await chrome.tabs.query({ windowId: this.windowId }).catch(() => []);
      if (siblings.length <= 1) {
        const ok = await chrome.tabs.update(tabId, { url: "about:blank", active: false }).then(() => true, () => false);
        if (ok) {
          this.tabs.set(tabId, { ...rec, kind: PLACEHOLDER, kept: false, openedAt: Date.now(), url: "about:blank", owner: null });
          this.persist();
          return;
        }
      }
    }
    this.tabs.delete(tabId);
    this.persist();
    await chrome.tabs.remove(tabId).catch(() => undefined);
  }

  /** Keeps a tab for the user (login/captcha); the market's previous kept tab is closed. */
  async keep(tabId: number, market: MarketId, session: SessionState, url: string): Promise<void> {
    for (const r of [...this.tabs.values()]) {
      if (r.kept && r.market === market && r.tabId !== tabId) await this.close(r.tabId);
    }
    const rec = this.tabs.get(tabId);
    if (rec) {
      rec.kept = true;
      rec.session = session;
      rec.url = url;
    } else this.tabs.set(tabId, { tabId, market, kind: "kept", openedAt: Date.now(), kept: true, windowId: null, url, owner: null, session });
    this.persist();
  }

  /** Hands a tab over to the user: it leaves the registry without being closed. */
  release(tabId: number): void {
    this.tabs.delete(tabId);
    this.persist();
  }

  onRemoved(tabId: number): void {
    if (this.tabs.delete(tabId)) this.persist();
  }

  onWindowRemoved(windowId: number): void {
    if (this.windowId === windowId) this.windowId = null;
    for (const [id, r] of [...this.tabs]) if (r.windowId === windowId) this.tabs.delete(id);
    this.persist();
  }

  /** Removes a tab outright (no parking). */
  private async remove(tabId: number): Promise<void> {
    this.tabs.delete(tabId);
    this.persist();
    await chrome.tabs.remove(tabId).catch(() => undefined);
  }

  /** Closes runner tabs (placeholders included); kept ones only when asked. */
  async closeAll(opts: { includeKept: boolean; except?: Set<number> }): Promise<number> {
    let n = 0;
    for (const r of [...this.tabs.values()]) {
      if (!opts.includeKept && r.kept) continue;
      if (opts.except?.has(r.tabId)) continue;
      await this.remove(r.tabId);
      if (r.kind !== PLACEHOLDER) n++;
    }
    return n;
  }

  /** Closes non-kept tabs older than `maxAgeMs` that no request is using any more (leaks after a crash). */
  async sweep(maxAgeMs: number, inUse: Set<number>): Promise<number> {
    const now = Date.now();
    let n = 0;
    for (const r of [...this.tabs.values()]) {
      if (r.kept || inUse.has(r.tabId)) continue;
      if (r.kind === PLACEHOLDER) {
        if (inUse.size === 0 && now - r.openedAt >= PLACEHOLDER_IDLE_MS) await this.remove(r.tabId);
        continue;
      }
      if (now - r.openedAt < maxAgeMs) continue;
      await this.close(r.tabId);
      n++;
    }
    for (const r of [...this.tabs.values()]) {
      const exists = await chrome.tabs.get(r.tabId).then(() => true, () => false);
      if (!exists) this.tabs.delete(r.tabId);
    }
    this.persist();
    return n;
  }

  /** Brings a tab (and its window) to the front; returns the tab the user was on, to go back to. */
  async focus(tabId: number): Promise<number | null> {
    const [prev] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }).catch(() => []);
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) return null;
    if (tab.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true, state: "normal" }).catch(() => undefined);
    await chrome.tabs.update(tabId, { active: true }).catch(() => undefined);
    return prev?.id !== undefined && prev.id !== tabId ? prev.id : null;
  }

  /** Returns the user to the tab they were on before `focus`; a no-op when that tab is gone. */
  async back(prevTabId: number | null): Promise<void> {
    if (prevTabId === null) return;
    const tab = await chrome.tabs.get(prevTabId).catch(() => null);
    if (!tab) return;
    if (tab.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true }).catch(() => undefined);
    await chrome.tabs.update(prevTabId, { active: true }).catch(() => undefined);
  }
}
