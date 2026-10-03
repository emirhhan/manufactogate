import type { MarketId } from "@manufactogate/core";

export const EXT_VERSION = "0.4.0";

/** Login-cookie heuristics for quick session display in the popup (no tab needed). */
export const MARKET_HOSTS: Record<MarketId, { host: string; loginCookie?: string }> = {
  "cn-1688": { host: "1688.com", loginCookie: "cookie2" },
  "cn-taobao": { host: "taobao.com", loginCookie: "cookie2" },
  "cn-pinduoduo": { host: "yangkeduo.com", loginCookie: "PDDAccessToken" },
  "tr-trendyol": { host: "trendyol.com" },
};
