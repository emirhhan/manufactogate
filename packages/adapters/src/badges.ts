import type { NormalizedBadge } from "@manufactogate/core";

/** Raw badge labels seen on each market, mapped to normalized badges. */
export const BADGES_1688: Record<string, NormalizedBadge> = {
  源头工厂: "verified-factory",
  深度验厂: "deep-factory-audit",
  实地认证: "on-site-verified",
  实力商家: "strength-merchant",
  跨境专供: "cross-border-ready",
  "1688严选": "top-rated",
};

export const BADGES_TAOBAO: Record<string, NormalizedBadge> = {
  天猫: "official-store",
  旗舰店: "official-store",
  金牌卖家: "gold-supplier",
  "48小时发货": "fast-shipping",
};

export const BADGES_PINDUODUO: Record<string, NormalizedBadge> = {
  品牌: "official-store",
  旗舰店: "official-store",
  "48小时发货": "fast-shipping",
  百亿补贴: "top-rated",
};

export const BADGES_TRENDYOL: Record<string, NormalizedBadge> = {
  "Resmi Satıcı": "official-store",
  "Hızlı Teslimat": "fast-shipping",
  "Yüksek Puanlı Satıcı": "top-rated",
};

export const BADGE_LABELS_TR: Record<NormalizedBadge, string> = {
  "verified-factory": "Kaynak fabrika",
  "deep-factory-audit": "Derin fabrika denetimi",
  "on-site-verified": "Yerinde doğrulandı",
  "strength-merchant": "Güçlü satıcı",
  "cross-border-ready": "Sınır ötesi hazır",
  "verified-supplier": "Doğrulanmış tedarikçi",
  "trade-assurance": "Ticaret güvencesi",
  "gold-supplier": "Altın tedarikçi",
  "top-rated": "Yüksek puanlı",
  "fast-shipping": "Hızlı kargo",
  "official-store": "Resmi mağaza",
};
