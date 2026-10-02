import type { MarketMeta } from "@manufactogate/core";

const RL = { minIntervalMs: 2500, maxPerHour: 120 };

export const META_1688: MarketMeta = {
  name: "1688",
  country: "cn",
  currency: "CNY",
  language: "zh",
  role: "source",
  capabilities: { imageSearch: true, textSearch: true, linkResolve: true, supplierProfile: true, priceTiers: true },
  rateLimit: RL,
  version: "0.0.1-mock",
  hosts: ["*.1688.com"],
  loginUrl: "https://login.1688.com/member/signin.htm",
};

export const META_TAOBAO: MarketMeta = {
  name: "Taobao",
  country: "cn",
  currency: "CNY",
  language: "zh",
  role: "source",
  capabilities: { imageSearch: true, textSearch: true, linkResolve: true, supplierProfile: true, priceTiers: false },
  rateLimit: RL,
  version: "0.0.1-mock",
  hosts: ["*.taobao.com", "*.tmall.com"],
  loginUrl: "https://login.taobao.com/member/login.jhtml",
};

export const META_PINDUODUO: MarketMeta = {
  name: "Pinduoduo",
  country: "cn",
  currency: "CNY",
  language: "zh",
  role: "source",
  capabilities: { imageSearch: false, textSearch: true, linkResolve: true, supplierProfile: false, priceTiers: false },
  rateLimit: RL,
  version: "0.0.1-mock",
  hosts: ["*.pinduoduo.com", "*.yangkeduo.com"],
  loginUrl: "https://mobile.yangkeduo.com/login.html",
};

export const META_TRENDYOL: MarketMeta = {
  name: "Trendyol",
  country: "tr",
  currency: "TRY",
  language: "tr",
  role: "target",
  capabilities: { imageSearch: false, textSearch: true, linkResolve: true, supplierProfile: false, priceTiers: false },
  rateLimit: RL,
  version: "0.0.1-mock",
  hosts: ["*.trendyol.com"],
};
