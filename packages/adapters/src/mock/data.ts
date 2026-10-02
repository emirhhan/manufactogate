import type { MarketId, PriceTier, RawListing, RawSupplier } from "@manufactogate/core";

/**
 * Deterministic fake catalog used until real adapters land. Products share titles and
 * model numbers across markets so the clustering pipeline has something real to chew on.
 */
export interface MockProduct {
  key: string;
  titles: Record<string, string>; // per language
  model: string;
  image: string;
  baseCny: number;
  weightKg: number;
}

export const MOCK_PRODUCTS: MockProduct[] = [
  {
    key: "earbuds",
    titles: { zh: "TWS-X15 无线蓝牙耳机 降噪 长续航", tr: "TWS-X15 Kablosuz Bluetooth Kulaklık ANC", en: "TWS-X15 Wireless Bluetooth Earbuds ANC" },
    model: "TWS-X15",
    image: "https://picsum.photos/seed/earbuds/400/400",
    baseCny: 28,
    weightKg: 0.08,
  },
  {
    key: "bottle",
    titles: { zh: "SB-750 不锈钢保温杯 750ml 户外运动水壶", tr: "SB-750 Paslanmaz Çelik Termos 750ml", en: "SB-750 Stainless Steel Thermos Bottle 750ml" },
    model: "SB-750",
    image: "https://picsum.photos/seed/bottle/400/400",
    baseCny: 19,
    weightKg: 0.35,
  },
  {
    key: "lamp",
    titles: { zh: "LD-20 LED 台灯 触摸调光 USB 充电", tr: "LD-20 LED Masa Lambası Dokunmatik USB", en: "LD-20 LED Desk Lamp Touch Dimming USB" },
    model: "LD-20",
    image: "https://picsum.photos/seed/lamp/400/400",
    baseCny: 34,
    weightKg: 0.6,
  },
];

const MARKET_PROFILE: Record<string, { lang: string; currency: string; mult: number; moq: number; tiers: boolean }> = {
  "cn-1688": { lang: "zh", currency: "CNY", mult: 1, moq: 50, tiers: true },
  "cn-taobao": { lang: "zh", currency: "CNY", mult: 1.9, moq: 1, tiers: false },
  "cn-pinduoduo": { lang: "zh", currency: "CNY", mult: 1.5, moq: 1, tiers: false },
  "tr-trendyol": { lang: "tr", currency: "TRY", mult: 5 * 3.2, moq: 1, tiers: false },
};

function tiersFor(base: number, moq: number, withTiers: boolean): PriceTier[] {
  if (!withTiers) return [{ minQty: moq, unitPrice: round(base) }];
  return [
    { minQty: moq, unitPrice: round(base) },
    { minQty: moq * 10, unitPrice: round(base * 0.88) },
    { minQty: moq * 40, unitPrice: round(base * 0.78) },
  ];
}
const round = (n: number) => Math.round(n * 100) / 100;

export function mockListings(market: MarketId, variants = 3): RawListing[] {
  const p = MARKET_PROFILE[market];
  if (!p) return [];
  const out: RawListing[] = [];
  for (const prod of MOCK_PRODUCTS) {
    for (let v = 0; v < variants; v++) {
      const id = `${prod.key}-${v + 1}`;
      const price = prod.baseCny * p.mult * (1 + v * 0.07);
      const isFactory = market === "cn-1688" && v === 0;
      out.push({
        market,
        id,
        url: `https://${market}.example/item/${id}`,
        title: v === 0 ? prod.titles[p.lang]! : `${prod.titles[p.lang]!} ${v === 1 ? "升级款" : "套装"}`,
        images: [prod.image],
        price: { currency: p.currency, tiers: tiersFor(price, p.moq, p.tiers) },
        moq: p.moq,
        sold: Math.round(1200 / (v + 1)),
        rating: round(4.9 - v * 0.2),
        supplierId: `${market}-sup-${prod.key}-${v}`,
        supplierName: isFactory ? `${prod.key} 源头工厂` : `${prod.key} 商贸 ${v}`,
        location: isFactory ? "广东 深圳" : "浙江 义乌",
        badges: isFactory ? ["源头工厂", "深度验厂", "实力商家"] : v === 1 ? ["实力商家"] : [],
        fetchedAt: new Date().toISOString(),
      });
    }
  }
  return out;
}

export function mockSupplier(market: MarketId, id: string): RawSupplier {
  const factory = id.endsWith("-0") && market === "cn-1688";
  return {
    market,
    id,
    url: `https://${market}.example/shop/${id}`,
    name: factory ? "深圳市示例电子有限公司" : "义乌市示例商贸有限公司",
    location: factory ? "广东 深圳" : "浙江 义乌",
    yearsOnPlatform: factory ? 9 : 3,
    badges: factory ? ["源头工厂", "深度验厂", "实力商家"] : ["实力商家"],
    repeatPurchaseRate: factory ? 0.42 : 0.21,
    responseRate: 0.96,
    responseTime: "1 saat içinde",
    mainCategories: ["消费电子", "家居用品"],
    businessType: factory ? "factory" : "trading",
  };
}
