import type { MarketId } from "@manufactogate/core";
import type { CooldownKind } from "../shared";
import { formatRemaining } from "../shared";
import { TR } from "./errors";

/**
 * Per-market pacing, pure and clock-injectable so it can be unit-tested:
 *  - minimum interval between two tab openings (stamped when the tab opens, not at enqueue)
 *  - sliding one-hour window against `maxPerHour`
 *  - cooldowns after captcha / logged-out / rate-limit / repeated network failures
 * The whole state can be mirrored to chrome.storage.session and restored after a worker restart.
 */

export interface Cooldown {
  kind: CooldownKind;
  until: number;
  /** URL of the kept tab or login page, when the UI can offer a link. */
  url?: string;
}

export interface LimiterSnapshot {
  lastRun: [MarketId, number][];
  hits: [MarketId, number[]][];
  cooldowns: [MarketId, Cooldown][];
  netFails: [MarketId, number[]][];
}

const HOUR = 3600000;
export const COOLDOWN_MS: Record<CooldownKind, number> = { captcha: 5 * 60000, "logged-out": 5 * 60000, rate: 0, network: 2 * 60000 };
/** Two network failures inside this window put the market on a cooldown. */
const NET_WINDOW_MS = 5 * 60000;

export class MarketLimiter {
  private lastRun = new Map<MarketId, number>();
  private hits = new Map<MarketId, number[]>();
  private cooldowns = new Map<MarketId, Cooldown>();
  private netFails = new Map<MarketId, number[]>();

  constructor(private readonly now: () => number = Date.now) {}

  /** Milliseconds to wait before this market may open another tab. */
  intervalWait(market: MarketId, minIntervalMs: number): number {
    const prev = this.lastRun.get(market);
    if (prev === undefined) return 0;
    return Math.max(0, minIntervalMs - (this.now() - prev));
  }

  /** Call right before the tab is opened. */
  stamp(market: MarketId): void {
    const t = this.now();
    this.lastRun.set(market, t);
    const arr = this.prune(this.hits.get(market) ?? [], HOUR);
    arr.push(t);
    this.hits.set(market, arr);
  }

  /** Hits inside the last hour. */
  hourlyCount(market: MarketId): number {
    const arr = this.prune(this.hits.get(market) ?? [], HOUR);
    this.hits.set(market, arr);
    return arr.length;
  }

  /** When the hourly cap is reached: how many hits and how long until the oldest one leaves the window. */
  hourlyBlock(market: MarketId, maxPerHour: number): { count: number; retryInMs: number } | null {
    if (maxPerHour <= 0) return null;
    const arr = this.prune(this.hits.get(market) ?? [], HOUR);
    this.hits.set(market, arr);
    if (arr.length < maxPerHour) return null;
    const oldest = arr[0] ?? this.now();
    return { count: arr.length, retryInMs: Math.max(1000, oldest + HOUR - this.now()) };
  }

  setCooldown(market: MarketId, kind: CooldownKind, ms = COOLDOWN_MS[kind], url?: string): Cooldown {
    const cd: Cooldown = { kind, until: this.now() + ms, ...(url ? { url } : {}) };
    this.cooldowns.set(market, cd);
    return cd;
  }

  /** Active cooldown, or null (expired entries are dropped). */
  cooldown(market: MarketId): Cooldown | null {
    const cd = this.cooldowns.get(market);
    if (!cd) return null;
    if (cd.until <= this.now()) {
      this.cooldowns.delete(market);
      return null;
    }
    return cd;
  }

  clearCooldown(market: MarketId): boolean {
    this.netFails.delete(market);
    return this.cooldowns.delete(market);
  }

  allCooldowns(): Map<MarketId, Cooldown> {
    for (const m of [...this.cooldowns.keys()]) this.cooldown(m);
    return new Map(this.cooldowns);
  }

  /** Records a network failure; returns the cooldown when the second failure inside the window triggers it. */
  networkFailure(market: MarketId): Cooldown | null {
    const arr = this.prune(this.netFails.get(market) ?? [], NET_WINDOW_MS);
    arr.push(this.now());
    this.netFails.set(market, arr);
    if (arr.length >= 2) {
      this.netFails.delete(market);
      return this.setCooldown(market, "network");
    }
    return null;
  }

  /** A successful request clears the failure counter and any cooldown. */
  success(market: MarketId): void {
    this.netFails.delete(market);
    this.cooldowns.delete(market);
  }

  snapshot(): LimiterSnapshot {
    return {
      lastRun: [...this.lastRun],
      hits: [...this.hits],
      cooldowns: [...this.cooldowns],
      netFails: [...this.netFails],
    };
  }

  restore(s: Partial<LimiterSnapshot> | undefined | null): void {
    if (!s) return;
    const t = this.now();
    for (const [m, v] of s.lastRun ?? []) if (typeof v === "number" && v <= t) this.lastRun.set(m, v);
    for (const [m, v] of s.hits ?? []) if (Array.isArray(v)) this.hits.set(m, this.prune(v.filter((x) => typeof x === "number"), HOUR));
    for (const [m, v] of s.cooldowns ?? []) if (v && typeof v.until === "number" && v.until > t) this.cooldowns.set(m, v);
    for (const [m, v] of s.netFails ?? []) if (Array.isArray(v)) this.netFails.set(m, this.prune(v, NET_WINDOW_MS));
  }

  private prune(arr: number[], windowMs: number): number[] {
    const min = this.now() - windowMs;
    return arr.filter((x) => x > min);
  }
}

/** Turkish message for an active cooldown. */
export function cooldownMessage(name: string, cd: Cooldown, now = Date.now()): string {
  const left = formatRemaining(cd.until - now);
  switch (cd.kind) {
    case "captcha":
      return TR.cooldownCaptcha(name, left);
    case "logged-out":
      return TR.cooldownLoggedOut(name, left);
    case "network":
      return TR.cooldownNetwork(name, left);
    case "rate":
      return `${name} için saatlik sınır doldu; ${left} sonra tekrar dene`;
  }
}
