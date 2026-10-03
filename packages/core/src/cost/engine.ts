import type { CountryCode, CurrencyCode, MarketId, PriceTier } from "../model";
import { fxRate, type FxTable } from "./fx";

export interface TaxLine {
  key: string;
  label: string;
  /** Rate as a fraction (0.2 = 20%). */
  rate: number;
  /** Base the rate applies to. "cif" = goods+freight+insurance; "cif+duty" = after customs duty. */
  base: "cif" | "cif+duty" | "cif+duty+extra";
  /** Only for goods originating in these countries (lower-case ISO codes). */
  origins?: CountryCode[];
  /** Only for these HS prefixes (digits). When present, other codes skip the line. */
  hsPrefixes?: string[];
  /** Never for these HS prefixes. */
  excludeHsPrefixes?: string[];
  /** Rate overrides by HS prefix (digits; longest match wins); 0 disables the line for that prefix. */
  rateByHs?: Record<string, number>;
  /** The line applies only when the import is paid on deferred terms (e.g. KKDF). */
  deferredPaymentOnly?: boolean;
  /** Estimated rather than verified. */
  approximate?: boolean;
}

export interface ShippingOption {
  key: string;
  label: string;
  mode: "air" | "sea" | "rail" | "express";
  /** Cost per kilogram in profile currency. */
  perKg: number;
  minCharge: number;
  transitDays: [number, number];
  /** Volumetric divisor for air/express (cm³ per kg): 5000 express, 6000 air. */
  volumetricDivisor?: number;
  /** Price per cubic metre for sea/rail. */
  perCbm?: number;
  /** Broker/handling for this mode, overriding the profile default (couriers include brokerage for DDP). */
  brokerFee?: number;
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
  /** @deprecated Use dutyDeMinimis / vatDeMinimis. Kept for older profiles: applies to both. */
  deMinimis?: number;
  /** Consignment value (CIF) at or below which no customs duty is charged on courier/express shipments. */
  dutyDeMinimis?: number;
  /** Consignment value at or below which no import VAT is charged (rare since 2021). */
  vatDeMinimis?: number;
  /** Customs broker and handling, flat per shipment. */
  brokerFee: number;
  /** Last-mile delivery per unit. */
  domesticShippingPerUnit: number;
  shipping: ShippingOption[];
  /** Marketplace selling commissions by marketplace id. */
  commissions: Record<string, number>;
  /** Category-specific commission overrides: marketplace id → taxonomy group key → rate. */
  commissionsByGroup?: Record<string, Record<string, number>>;
  /** Standard VAT/sales tax rate on consumer prices (TR 0.20, DE 0.19, US 0 — sales tax is added at checkout). */
  salesVatRate?: number;
  /** VAT charged on marketplace commissions and fees (TR 0.20). */
  commissionVatRate?: number;
  /** Marketplaces that sell in this country (registry ids). */
  marketplaces?: MarketId[];
  /** Human notes about assumptions (shown in the UI as "varsayımlar"). */
  notes?: string[];
  /** True when duty rates are rough estimates. */
  dutyApproximate?: boolean;
}

export interface CostInput {
  quantity: number;
  tiers: PriceTier[];
  /** Exchange rate: 1 unit of listing currency = fxRate units of profile currency. */
  fxRate?: number;
  /** Alternative to fxRate: let the engine derive the rate from a dated table. */
  fx?: { listingCurrency: CurrencyCode; table: FxTable };
  unitWeightKg: number;
  /** Packed volume per unit in cubic metres (for volumetric weight and sea CBM pricing). */
  unitVolumeM3?: number;
  shippingKey: string;
  hsCode?: string;
  insuranceRate?: number;
  /** Extra per-unit costs the user adds (packaging, labels). */
  extraPerUnit?: number;
  /** Origin of the goods (lower-case ISO). Defaults to "cn". */
  originCountry?: CountryCode;
  /** Courier/express consignment where de minimis thresholds may apply. Default: true for express mode. */
  consignment?: boolean;
  /** Paid on deferred terms (triggers KKDF-style lines). */
  deferredPayment?: boolean;
  /** Units per listed price when the tier price is for a pack. */
  packQty?: number;
}

export interface CostLine {
  key: string;
  label: string;
  amount: number;
  perUnit: number;
  approximate?: boolean;
}

export interface CostResult {
  currency: CurrencyCode;
  tierUsed: PriceTier;
  lines: CostLine[];
  total: number;
  perUnit: number;
  /** Quantity the figures were computed for (raised to the MOQ when the request was below it). */
  effectiveQuantity: number;
  moq: number;
  warnings: string[];
  /** Any line is an estimate. */
  approximate: boolean;
  /** Exchange rate used (listing → profile currency) and its date when it came from a table. */
  fxUsed: number;
  fxAsOf?: string;
  dutyRate: number;
  cif: number;
  /** Import VAT per unit (recoverable input VAT for registered sellers). */
  vatPerUnit: number;
  /** Landed cost per unit excluding import VAT. */
  landedExVatPerUnit: number;
}

export class CostError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CostError";
  }
}

export interface TierPick {
  tier: PriceTier;
  belowMoq: boolean;
  effectiveQuantity: number;
  moq: number;
}

/** Picks the tier for a quantity, raising the quantity to the MOQ when it is below every tier. */
export function pickTierInfo(tiers: PriceTier[], quantity: number): TierPick {
  if (!tiers.length) throw new CostError("no price tiers");
  const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);
  const moq = Math.max(1, sorted[0]!.minQty);
  let q = Math.floor(quantity);
  if (!Number.isFinite(q) || q < 1) q = 1;
  const belowMoq = q < moq;
  if (belowMoq) q = moq;
  let chosen = sorted[0]!;
  for (const t of sorted) if (q >= t.minQty) chosen = t;
  return { tier: chosen, belowMoq, effectiveQuantity: q, moq };
}

export function pickTier(tiers: PriceTier[], quantity: number): PriceTier {
  return pickTierInfo(tiers, quantity).tier;
}

export function hsDigits(code: string): string {
  return code.replace(/\D/g, "");
}

function longestPrefix(table: Record<string, number>, hs: string): string | undefined {
  const keys = Object.keys(table)
    .filter((k) => k !== "default" && hs.startsWith(hsDigits(k)) && hsDigits(k).length > 0)
    .sort((a, b) => hsDigits(b).length - hsDigits(a).length);
  return keys[0];
}

export function dutyRateFor(profile: CountryProfile, hsCode?: string): number {
  if (hsCode) {
    const hs = hsDigits(hsCode);
    const k = longestPrefix(profile.dutyByHs, hs);
    if (k !== undefined) return profile.dutyByHs[k]!;
  }
  return profile.dutyByHs["default"] ?? 0;
}

/** Effective rate of a tax line for an HS code and origin; null when the line does not apply. */
export function taxLineRate(line: TaxLine, input: { hsCode?: string; originCountry?: CountryCode; deferredPayment?: boolean }): number | null {
  const origin = (input.originCountry ?? "cn").toLowerCase();
  if (line.origins && !line.origins.map((o) => o.toLowerCase()).includes(origin)) return null;
  if (line.deferredPaymentOnly && !input.deferredPayment) return null;
  const hs = input.hsCode ? hsDigits(input.hsCode) : "";
  if (line.hsPrefixes && !line.hsPrefixes.some((p) => hs.startsWith(hsDigits(p)))) return null;
  if (line.excludeHsPrefixes && hs && line.excludeHsPrefixes.some((p) => hs.startsWith(hsDigits(p)))) return null;
  if (line.rateByHs && hs) {
    const k = longestPrefix(line.rateByHs, hs);
    if (k !== undefined) {
      const r = line.rateByHs[k]!;
      return r > 0 ? r : null;
    }
  }
  return line.rate > 0 ? line.rate : null;
}

export function resolveFxRate(input: Pick<CostInput, "fxRate" | "fx">, profile: Pick<CountryProfile, "currency">): { rate: number; asOf?: string } {
  if (input.fx) {
    const r = fxRate(input.fx.listingCurrency, profile.currency, input.fx.table);
    if (r !== null) return { rate: r, asOf: input.fx.table.asOf };
    if (input.fxRate !== undefined) return { rate: input.fxRate };
    throw new CostError(`no exchange rate for ${input.fx.listingCurrency} → ${profile.currency}`);
  }
  if (input.fxRate === undefined || !Number.isFinite(input.fxRate) || input.fxRate <= 0) throw new CostError("fxRate or fx table required");
  return { rate: input.fxRate };
}

export function computeLandedCost(profile: CountryProfile, input: CostInput): CostResult {
  const warnings: string[] = [];
  const pick = pickTierInfo(input.tiers, input.quantity);
  const q = pick.effectiveQuantity;
  if (pick.belowMoq) warnings.push(`MOQ ${pick.moq}: hesap ${pick.moq} adet için yapıldı`);
  if (Math.floor(input.quantity) < 1) warnings.push("Adet 1 olarak alındı");
  const tier = pick.tier;
  const fx = resolveFxRate(input, profile);
  const pack = input.packQty && input.packQty > 0 ? input.packQty : 1;
  const unitListing = tier.unitPrice / pack;
  const goods = unitListing * q * fx.rate;

  const ship = profile.shipping.find((s) => s.key === input.shippingKey) ?? profile.shipping[0];
  if (!ship) throw new CostError("profile has no shipping options");
  const actualKg = input.unitWeightKg * q;
  const cbm = (input.unitVolumeM3 ?? 0) * q;
  let freight: number;
  if (ship.mode === "air" || ship.mode === "express") {
    const divisor = ship.volumetricDivisor ?? (ship.mode === "express" ? 5000 : 6000);
    const volumetricKg = cbm > 0 ? (cbm * 1_000_000) / divisor : 0;
    const chargeable = Math.max(actualKg, volumetricKg);
    if (volumetricKg > actualKg * 1.05) warnings.push(`Hacimsel ağırlık (${volumetricKg.toFixed(1)} kg) gerçek ağırlığı aşıyor`);
    freight = Math.max(ship.minCharge, ship.perKg * chargeable);
  } else {
    const byCbm = ship.perCbm && cbm > 0 ? ship.perCbm * cbm : 0;
    freight = Math.max(ship.minCharge, byCbm, ship.perKg * actualKg);
  }
  const insuranceRate = input.insuranceRate ?? 0.005;
  const insurance = (goods + freight) * 1.1 * insuranceRate;
  const cif = goods + freight + insurance;

  const lines: CostLine[] = [];
  const push = (key: string, label: string, amount: number, approximate?: boolean) =>
    lines.push({ key, label, amount, perUnit: amount / q, ...(approximate ? { approximate: true } : {}) });

  push("goods", "Ürün bedeli", goods);
  push("freight", `Navlun (${ship.label})`, freight);
  push("insurance", "Sigorta", insurance);

  const consignment = input.consignment ?? ship.mode === "express";
  const dutyDm = profile.dutyDeMinimis ?? profile.deMinimis;
  const vatDm = profile.vatDeMinimis ?? profile.deMinimis;
  const dutyFree = consignment && dutyDm !== undefined && cif <= dutyDm;
  const vatFree = consignment && vatDm !== undefined && cif <= vatDm;
  if (dutyFree) warnings.push(`Gönderi değeri ${dutyDm} ${profile.currency} eşiğinin altında: gümrük vergisi uygulanmadı`);

  const dutyRate = dutyFree ? 0 : dutyRateFor(profile, input.hsCode);
  const duty = cif * dutyRate;
  push("duty", "Gümrük vergisi", duty, profile.dutyApproximate);
  let extra = 0;
  let vat = 0;
  for (const t of profile.taxes) {
    const rate = taxLineRate(t, input);
    if (rate === null) continue;
    const isVat = t.key === "vat";
    if (isVat && vatFree) continue;
    if (!isVat && dutyFree) continue;
    const base = t.base === "cif" ? cif : t.base === "cif+duty" ? cif + duty : cif + duty + extra;
    const amt = base * rate;
    if (isVat) vat += amt;
    else extra += amt;
    push(t.key, t.label, amt, t.approximate);
  }
  const brokerFee = ship.brokerFee ?? profile.brokerFee;
  push("broker", "Gümrük müşaviri ve işlem", brokerFee);
  push("domestic", "Yurt içi kargo", profile.domesticShippingPerUnit * q);
  if (input.extraPerUnit) push("extra", "Ek birim maliyet", input.extraPerUnit * q);

  const total = lines.reduce((s, l) => s + l.amount, 0);
  const approximate = lines.some((l) => l.approximate);
  return {
    currency: profile.currency,
    tierUsed: tier,
    lines,
    total,
    perUnit: total / q,
    effectiveQuantity: q,
    moq: pick.moq,
    warnings,
    approximate,
    fxUsed: fx.rate,
    ...(fx.asOf ? { fxAsOf: fx.asOf } : {}),
    dutyRate,
    cif,
    vatPerUnit: vat / q,
    landedExVatPerUnit: (total - vat) / q,
  };
}

export interface MarginInput {
  sellPrice: number;
  marketplaceId: string;
  /** Advertising/returns allowance as fraction of sell price. */
  overheadRate?: number;
  /** Outbound shipping to the customer per unit, if seller pays. */
  outboundShipping?: number;
  /** The sell price includes VAT (marketplace consumer prices do). Default true. */
  sellPriceIncludesVat?: boolean;
  /** Seller is VAT-registered: output VAT is remitted and import VAT is recovered. Default true. */
  vatRegistered?: boolean;
  /** Fixed marketplace fee per order (Trendyol hizmet bedeli etc.). */
  fixedFeePerOrder?: number;
  /** Taxonomy group key for category-specific commission rates. */
  groupKey?: string;
  /** Override the commission rate entirely. */
  commissionRate?: number;
}

export interface MarginResult {
  commission: number;
  overhead: number;
  outboundShipping: number;
  netPerUnit: number;
  marginRate: number;
  lines: {
    grossPrice: number;
    netPrice: number;
    outputVat: number;
    commission: number;
    commissionVat: number;
    fees: number;
    overhead: number;
    outboundShipping: number;
    landedExVat: number;
    net: number;
  };
  commissionRate: number;
}

/**
 * Net margin per unit at a marketplace price. Consumer prices include VAT which the seller
 * remits; marketplace commissions carry VAT too; import VAT inside the landed cost is
 * recoverable input VAT for a registered seller.
 */
export function computeMargin(profile: CountryProfile, landed: number | CostResult, input: MarginInput): MarginResult {
  const landedPerUnit = typeof landed === "number" ? landed : landed.perUnit;
  const landedVat = typeof landed === "number" ? 0 : landed.vatPerUnit;
  const includesVat = input.sellPriceIncludesVat ?? true;
  const registered = input.vatRegistered ?? true;
  const vatRate = profile.salesVatRate ?? 0;
  const commissionVatRate = profile.commissionVatRate ?? 0;
  const commissionRate =
    input.commissionRate ??
    (input.groupKey ? profile.commissionsByGroup?.[input.marketplaceId]?.[input.groupKey] : undefined) ??
    profile.commissions[input.marketplaceId] ??
    0;

  const gross = input.sellPrice;
  const net = includesVat && registered ? gross / (1 + vatRate) : gross;
  const outputVat = gross - net;
  // Commissions are charged on the gross (customer-paid) price by most marketplaces.
  const commission = gross * commissionRate;
  const commissionVat = registered ? 0 : commission * commissionVatRate; // recoverable when registered
  const fees = input.fixedFeePerOrder ?? 0;
  const overhead = gross * (input.overheadRate ?? 0);
  const outboundShipping = input.outboundShipping ?? 0;
  const landedExVat = registered ? landedPerUnit - landedVat : landedPerUnit;
  const netPerUnit = net - commission - commissionVat - fees - overhead - outboundShipping - landedExVat;
  return {
    commission,
    overhead,
    outboundShipping,
    netPerUnit,
    marginRate: gross > 0 ? netPerUnit / gross : 0,
    commissionRate,
    lines: { grossPrice: gross, netPrice: net, outputVat, commission, commissionVat, fees, overhead, outboundShipping, landedExVat, net: netPerUnit },
  };
}
