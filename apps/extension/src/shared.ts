import type { HealthResult, MarketId, SessionState } from "@manufactogate/core";

/** Messages between popup/content and the background worker. */
export type BgRequest =
  | { type: "sessions" }
  | { type: "health" }
  | { type: "ping" };

export type BgResponse =
  | { type: "sessions"; sessions: Partial<Record<MarketId, SessionState>> }
  | { type: "health"; health: Partial<Record<MarketId, HealthResult>> }
  | { type: "pong"; version: string };

export const EXT_VERSION = "0.1.0";

/** Market hosts used to detect open sessions via existing tabs and cookies (Sprint 0 heuristic). */
export const MARKET_HOSTS: Record<MarketId, { host: string; loginCookie?: string }> = {
  "cn-1688": { host: "1688.com", loginCookie: "cookie2" },
  "cn-taobao": { host: "taobao.com", loginCookie: "cookie2" },
  "cn-pinduoduo": { host: "pinduoduo.com", loginCookie: "PDDAccessToken" },
  "tr-trendyol": { host: "trendyol.com" },
};
