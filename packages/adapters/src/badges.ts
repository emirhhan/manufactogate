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
  品牌黑标: "official-store",
  官方旗舰: "official-store",
  "24小时发货": "fast-shipping",
};

export const BADGES_TRENDYOL: Record<string, NormalizedBadge> = {
  "Resmi Satıcı": "official-store",
  "Hızlı Teslimat": "fast-shipping",
  "Yüksek Puanlı Satıcı": "top-rated",
  "Çok Satan": "top-rated",
  "Kargo Bedava": "fast-shipping",
  "Ücretsiz Kargo": "fast-shipping",
};

/** B2B sourcing platforms (Alibaba, Global Sources, Made-in-China, IndiaMART, TradeIndia, Yiwugo). */
export const BADGES_B2B: Record<string, NormalizedBadge> = {
  "Verified Supplier": "verified-supplier",
  "Verified Manufacturer": "verified-factory",
  // Global Sources renders this misspelling in its image alt text.
  "Verified Maufacturer": "verified-factory",
  Verified: "verified-supplier",
  "Premier Supplier": "gold-supplier",
  "Gold Supplier": "gold-supplier",
  "Trade Assurance": "trade-assurance",
  Manufacturer: "verified-factory",
  "Audited Supplier": "on-site-verified",
  "Onsite Check": "on-site-verified",
  "Trusted Seller": "verified-supplier",
  "TI Verified": "verified-supplier",
  TrustSEAL: "verified-supplier",
  "GST Verified": "verified-supplier",
  "Verified Exporter": "cross-border-ready",
  Exporter: "cross-border-ready",
  "Analyst's Choice": "top-rated",
  高级会员: "gold-supplier",
  实力商家: "strength-merchant",
  诚信通: "verified-supplier",
  厂家直销: "verified-factory",
  实体店铺: "on-site-verified",
};

/** Retail marketplaces (Amazon, eBay, Walmart, Temu, Noon, Ozon, Wildberries, Lazada, Tokopedia, Shopee, Coupang, Gmarket, Rakuten, Mercari, Yahoo). */
export const BADGES_RETAIL: Record<string, NormalizedBadge> = {
  "Free shipping": "fast-shipping",
  "Free Shipping": "fast-shipping",
  "Free delivery": "fast-shipping",
  "Ücretsiz kargo": "fast-shipping",
  "Ücretsiz Kargo": "fast-shipping",
  "Ücretsiz Gönderim": "fast-shipping",
  Prime: "fast-shipping",
  "Amazon's Choice": "top-rated",
  "Best Seller": "top-rated",
  Bestseller: "top-rated",
  "Top Rated": "top-rated",
  "Top Rated Plus": "top-rated",
  "Official Store": "official-store",
  "Official store": "official-store",
  LazMall: "official-store",
  Mall: "official-store",
  "Star Seller": "top-rated",
  "Star+": "top-rated",
  "Power Merchant": "top-rated",
  Choice: "top-rated",
  Express: "fast-shipping",
  Оригинал: "official-store",
  "Бесплатная доставка": "fast-shipping",
  무료배송: "fast-shipping",
  로켓배송: "fast-shipping",
  로켓직구: "cross-border-ready",
  送料無料: "fast-shipping",
  "Gratis Ongkir": "fast-shipping",
  "Bebas Ongkir": "fast-shipping",
  "ส่งฟรี": "fast-shipping",
  "Express Delivery": "fast-shipping",
  "noon express": "fast-shipping",
  Fulfilled: "fast-shipping",
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
