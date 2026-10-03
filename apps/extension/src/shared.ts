import type { MarketId } from "@manufactogate/core";

export const EXT_VERSION = "0.5.0";

/** Login-cookie heuristics for quick session display in the popup (no tab needed). */
export const MARKET_HOSTS: Partial<Record<MarketId, { host: string; loginCookie?: string }>> = {
  "cn-1688": { host: "1688.com", loginCookie: "cookie2" },
  "cn-taobao": { host: "taobao.com", loginCookie: "cookie2" },
  "cn-pinduoduo": { host: "yangkeduo.com", loginCookie: "PDDAccessToken" },
  "tr-trendyol": { host: "trendyol.com" },
  "cn-alibaba": { host: "alibaba.com" },
  "cn-aliexpress": { host: "aliexpress.com" },
  "tr-hepsiburada": { host: "hepsiburada.com" },
  "tr-n11": { host: "n11.com" },
  "tr-amazon": { host: "amazon.com.tr" },
};
