import { computeLandedCost, computeMargin, type CountryProfile, type MarginResult, type RawListing } from "@manufactogate/core";
import { buildChain, marketplaceFor, pickQty, rateFor, shippingKeyFor, type ChainStep, type Scenario } from "./analysis";
import { minOf } from "./fx";
import type { CostSettings } from "@/store/settings";

export interface EconomicsInput {
  /** True when the listing sells on a supply market (1688 etc.); false for a target-country listing. */
  isSource: boolean;
  /** Target country profile with the user's overrides applied. */
  profile: CountryProfile;
  listing: RawListing;
  /** Best near match on the target country's markets (for a source listing). */
  bestTarget: RawListing | undefined;
  /** Best near match on the supply markets (for a target listing). */
  bestSource: RawListing | undefined;
  /** The cost calculator's scenario for a source listing. */
  scenario: Scenario | null;
  /** The calculator's inputs (quantity, shipping, weight, GTİP) reused for a target listing. */
  calc: { qty: number | null; shippingKey: string; weightKg: number; hsCode: string } | null;
  cost: CostSettings;
  marketName: (m: RawListing["market"]) => string;
}

export interface Economics {
  landed: number;
  qty: number;
  /** Sell price in the profile currency, null when no target match converts. */
  sell: number | null;
  sellFrom: RawListing | undefined;
  margin: MarginResult | null;
  chain: ChainStep[];
  sourceListing: RawListing;
  marketplaceId: string;
}

/**
 * Price chain and VAT-aware margin for the listing page (B01). Source listing: this listing →
 * landed → best target match. Target listing: best source match → landed → this listing's price.
 * The landed `CostResult` is handed to `computeMargin` so the import VAT inside it is recovered
 * for a registered seller. Pure.
 */
export function listingEconomics(input: EconomicsInput): Economics | null {
  const { profile, listing, cost } = input;
  const cur = profile.currency;
  const toCur = (l: RawListing) => {
    const m = minOf(l);
    const r = m === null ? null : rateFor(l.price.currency, cur, cost.fxCnyTry);
    return m !== null && r !== null ? m * r : null;
  };
  if (input.isSource) {
    const sc = input.scenario;
    if (!sc) return null;
    const bestTarget = input.bestTarget;
    const sell = bestTarget ? toCur(bestTarget) : null;
    const mp = marketplaceFor(profile, bestTarget?.market);
    const margin = sell ? computeMargin(profile, sc.cost, { sellPrice: sell, marketplaceId: mp, overheadRate: cost.overheadRate }) : null;
    const chain = buildChain({
      sourceLabel: `${input.marketName(listing.market)} birim (${sc.qty} adet)`,
      sourceUnit: sc.cost.tierUsed.unitPrice,
      sourceCurrency: listing.price.currency,
      landedPerUnit: sc.cost.perUnit,
      sell: sell && bestTarget ? { label: `${input.marketName(bestTarget.market)} en ucuz benzer`, price: sell } : null,
      net: margin?.netPerUnit ?? null,
      currency: cur,
      cnyTry: cost.fxCnyTry,
    });
    return { landed: sc.cost.perUnit, qty: sc.qty, sell, sellFrom: bestTarget, margin, chain, sourceListing: listing, marketplaceId: mp };
  }
  const bestSource = input.bestSource;
  if (!bestSource) return null;
  const m = minOf(bestSource);
  const fx = rateFor(bestSource.price.currency, cur, cost.fxCnyTry);
  if (m === null || fx === null) return null;
  const qty = pickQty(bestSource.price.tiers, bestSource.moq, input.calc?.qty ?? null);
  const shipKey = shippingKeyFor(profile, input.calc?.shippingKey ?? cost.shippingKey);
  const landedRes = computeLandedCost(profile, {
    quantity: qty,
    tiers: bestSource.price.tiers,
    fxRate: fx,
    unitWeightKg: input.calc?.weightKg ?? cost.defaultWeightKg,
    shippingKey: shipKey,
    ...(bestSource.packQty && bestSource.packQty > 1 ? { packQty: bestSource.packQty } : {}),
    ...(input.calc?.hsCode ? { hsCode: input.calc.hsCode } : {}),
  });
  const sell = toCur(listing);
  const mp = marketplaceFor(profile, listing.market);
  const margin = sell ? computeMargin(profile, landedRes, { sellPrice: sell, marketplaceId: mp, overheadRate: cost.overheadRate }) : null;
  const chain = buildChain({
    sourceLabel: `${input.marketName(bestSource.market)} birim (${qty} adet)`,
    sourceUnit: landedRes.tierUsed.unitPrice,
    sourceCurrency: bestSource.price.currency,
    landedPerUnit: landedRes.perUnit,
    sell: sell ? { label: `${input.marketName(listing.market)} bu ilan`, price: sell } : null,
    net: margin?.netPerUnit ?? null,
    currency: cur,
    cnyTry: cost.fxCnyTry,
  });
  return { landed: landedRes.perUnit, qty, sell, sellFrom: listing, margin, chain, sourceListing: bestSource, marketplaceId: mp };
}
