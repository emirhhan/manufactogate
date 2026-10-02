import type { CountryCode, CurrencyCode, PriceTier } from "../model";

export interface TaxLine {
  key: string;
  label: string;
  /** Rate as a fraction (0.2 = 20%). */
  rate: number;
  /** Base the rate applies to. "cif" = goods+freight+insurance; "cif+duty" = after customs duty. */
  base: "cif" | "cif+duty" | "cif+duty+extra";
}

export interface ShippingOption {
  key: string;
  label: string;
  mode: "air" | "sea" | "rail" | "express";
  /** Cost per kilogram in profile currency. */
  perKg: number;
  minCharge: number;
  transitDays: [number, number];
}

export interface CountryProfile {
  country: CountryCode;
  currency: CurrencyCode;
  /** When the figures were last verified, ISO date. */
  asOf: string;
  sources: string[];
  /** Customs duty by HS/GTİP prefix; "default" applies when no prefix matches. */
  dutyByHs: Record<string, number>;
  /** Additional lines applied in order. */
  taxes: TaxLine[];
  /** Value below which no duty/tax applies for commercial import, if any. */
  deMinimis?: number;
  /** Customs broker and handling, flat per shipment. */
  brokerFee: number;
  /** Last-mile delivery per unit. */
  domesticShippingPerUnit: number;
  shipping: ShippingOption[];
  /** Marketplace selling commissions by marketplace id. */
  commissions: Record<string, number>;
}

export interface CostInput {
  quantity: number;
  tiers: PriceTier[];
  /** Exchange rate: 1 unit of listing currency = fxRate units of profile currency. */
  fxRate: number;
  unitWeightKg: number;
  shippingKey: string;
  hsCode?: string;
  insuranceRate?: number;
  /** Extra per-unit costs the user adds (packaging, labels). */
  extraPerUnit?: number;
}

export interface CostLine {
  key: string;
  label: string;
  amount: number;
  perUnit: number;
}

export interface CostResult {
  currency: CurrencyCode;
  tierUsed: PriceTier;
  lines: CostLine[];
  total: number;
  perUnit: number;
}

export function pickTier(tiers: PriceTier[], quantity: number): PriceTier {
  const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);
  let chosen = sorted[0]!;
  for (const t of sorted) if (quantity >= t.minQty) chosen = t;
  return chosen;
}

export function dutyRateFor(profile: CountryProfile, hsCode?: string): number {
  if (hsCode) {
    const keys = Object.keys(profile.dutyByHs)
      .filter((k) => k !== "default" && hsCode.startsWith(k))
      .sort((a, b) => b.length - a.length);
    if (keys[0]) return profile.dutyByHs[keys[0]]!;
  }
  return profile.dutyByHs["default"] ?? 0;
}

export function computeLandedCost(profile: CountryProfile, input: CostInput): CostResult {
  const q = Math.max(1, Math.floor(input.quantity));
  const tier = pickTier(input.tiers, q);
  const goods = tier.unitPrice * q * input.fxRate;
  const ship = profile.shipping.find((s) => s.key === input.shippingKey) ?? profile.shipping[0];
  if (!ship) throw new Error("profile has no shipping options");
  const freight = Math.max(ship.minCharge, ship.perKg * input.unitWeightKg * q);
  const insurance = goods * (input.insuranceRate ?? 0.005);
  const cif = goods + freight + insurance;

  const lines: CostLine[] = [];
  const push = (key: string, label: string, amount: number) =>
    lines.push({ key, label, amount, perUnit: amount / q });

  push("goods", "Ürün bedeli", goods);
  push("freight", `Navlun (${ship.label})`, freight);
  push("insurance", "Sigorta", insurance);

  let duty = 0;
  let extra = 0;
  if (profile.deMinimis === undefined || cif > profile.deMinimis) {
    duty = cif * dutyRateFor(profile, input.hsCode);
    push("duty", "Gümrük vergisi", duty);
    for (const t of profile.taxes) {
      const base =
        t.base === "cif" ? cif : t.base === "cif+duty" ? cif + duty : cif + duty + extra;
      const amt = base * t.rate;
      if (t.key !== "vat") extra += amt;
      push(t.key, t.label, amt);
    }
  }
  push("broker", "Gümrük müşaviri ve işlem", profile.brokerFee);
  push("domestic", "Yurt içi kargo", profile.domesticShippingPerUnit * q);
  if (input.extraPerUnit) push("extra", "Ek birim maliyet", input.extraPerUnit * q);

  const total = lines.reduce((s, l) => s + l.amount, 0);
  return { currency: profile.currency, tierUsed: tier, lines, total, perUnit: total / q };
}

export interface MarginInput {
  sellPrice: number;
  marketplaceId: string;
  /** Advertising/returns allowance as fraction of sell price. */
  overheadRate?: number;
  /** Outbound shipping to the customer per unit, if seller pays. */
  outboundShipping?: number;
}

export interface MarginResult {
  commission: number;
  overhead: number;
  outboundShipping: number;
  netPerUnit: number;
  marginRate: number;
}

export function computeMargin(
  profile: CountryProfile,
  landedPerUnit: number,
  input: MarginInput,
): MarginResult {
  const commissionRate = profile.commissions[input.marketplaceId] ?? 0;
  const commission = input.sellPrice * commissionRate;
  const overhead = input.sellPrice * (input.overheadRate ?? 0);
  const outboundShipping = input.outboundShipping ?? 0;
  const netPerUnit = input.sellPrice - commission - overhead - outboundShipping - landedPerUnit;
  return {
    commission,
    overhead,
    outboundShipping,
    netPerUnit,
    marginRate: input.sellPrice > 0 ? netPerUnit / input.sellPrice : 0,
  };
}
