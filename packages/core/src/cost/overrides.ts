import type { CountryProfile, TaxLine } from "./engine";

/**
 * User-editable figures of a country profile (PLAN §3.5 "kullanıcı düzenleyebilir"). Every
 * field is optional: an absent field keeps the dated reference value. Rates are fractions
 * (0.2 = %20). Stored per target country by the app; applied with `applyCountryOverrides`.
 */
export interface CountryOverrides {
  /** Import and sales VAT (KDV) rate. Replaces the "vat" tax line rate for every HS code and `salesVatRate`. */
  vatRate?: number;
  /** Customs duty for goods whose HS/GTİP code has no specific entry (`dutyByHs.default`). */
  dutyDefaultRate?: number;
  /** Marketplace commission overrides by registry id; an overridden marketplace ignores its category table. */
  commissions?: Record<string, number>;
  /** Customs broker and handling per shipment, in profile currency (also overrides per-mode broker fees). */
  brokerFee?: number;
  /** Last-mile delivery per unit, in profile currency. */
  domesticShippingPerUnit?: number;
  /** Preferred shipping option key for this country (consumed by the app, not by the engine). */
  shippingKey?: string;
}

export const COUNTRY_OVERRIDE_KEYS = ["vatRate", "dutyDefaultRate", "commissions", "brokerFee", "domesticShippingPerUnit", "shippingKey"] as const satisfies readonly (keyof CountryOverrides)[];

function validRate(r: unknown): r is number {
  return typeof r === "number" && Number.isFinite(r) && r >= 0 && r < 1;
}
function validAmount(r: unknown): r is number {
  return typeof r === "number" && Number.isFinite(r) && r >= 0;
}

/**
 * Drops invalid or empty fields so a stored override never breaks the engine: rates must be in
 * [0, 1), amounts non-negative, commissions a map of valid rates. Returns `{}` when nothing survives. Pure.
 */
export function sanitizeCountryOverrides(o: CountryOverrides | null | undefined): CountryOverrides {
  const out: CountryOverrides = {};
  if (!o || typeof o !== "object") return out;
  if (validRate(o.vatRate)) out.vatRate = o.vatRate;
  if (validRate(o.dutyDefaultRate)) out.dutyDefaultRate = o.dutyDefaultRate;
  if (validAmount(o.brokerFee)) out.brokerFee = o.brokerFee;
  if (validAmount(o.domesticShippingPerUnit)) out.domesticShippingPerUnit = o.domesticShippingPerUnit;
  if (typeof o.shippingKey === "string" && o.shippingKey.trim()) out.shippingKey = o.shippingKey.trim();
  if (o.commissions && typeof o.commissions === "object") {
    const c: Record<string, number> = {};
    for (const [k, v] of Object.entries(o.commissions)) if (k && validRate(v)) c[k] = v;
    if (Object.keys(c).length) out.commissions = c;
  }
  return out;
}

/** True when the overrides change at least one engine figure (the shipping preference alone does not). */
export function hasCountryOverrides(o: CountryOverrides | null | undefined): boolean {
  const s = sanitizeCountryOverrides(o);
  return s.vatRate !== undefined || s.dutyDefaultRate !== undefined || s.brokerFee !== undefined || s.domesticShippingPerUnit !== undefined || !!s.commissions;
}

/**
 * A copy of the profile with the user's figures applied. The reference profile is never
 * mutated; `sources` gains a "user" marker so the UI can say the figures are edited. Pure.
 */
export function applyCountryOverrides(profile: CountryProfile, overrides: CountryOverrides | null | undefined): CountryProfile {
  const o = sanitizeCountryOverrides(overrides);
  if (!hasCountryOverrides(o)) return profile;
  const taxes: TaxLine[] = profile.taxes.map((t) => {
    if (t.key !== "vat" || o.vatRate === undefined) return t;
    // A user-entered KDV applies uniformly: the HS-specific reduced rates of the reference are dropped.
    const next: TaxLine = { ...t, rate: o.vatRate };
    delete next.rateByHs;
    return next;
  });
  const commissions = { ...profile.commissions, ...(o.commissions ?? {}) };
  let commissionsByGroup = profile.commissionsByGroup;
  if (o.commissions && commissionsByGroup) {
    commissionsByGroup = { ...commissionsByGroup };
    for (const id of Object.keys(o.commissions)) delete commissionsByGroup[id];
  }
  const shipping = o.brokerFee === undefined ? profile.shipping : profile.shipping.map((s) => (s.brokerFee === undefined ? s : { ...s, brokerFee: o.brokerFee! }));
  return {
    ...profile,
    dutyByHs: o.dutyDefaultRate === undefined ? profile.dutyByHs : { ...profile.dutyByHs, default: o.dutyDefaultRate },
    taxes,
    commissions,
    ...(commissionsByGroup ? { commissionsByGroup } : {}),
    ...(o.vatRate !== undefined ? { salesVatRate: o.vatRate } : {}),
    ...(o.brokerFee !== undefined ? { brokerFee: o.brokerFee } : {}),
    ...(o.domesticShippingPerUnit !== undefined ? { domesticShippingPerUnit: o.domesticShippingPerUnit } : {}),
    shipping,
    sources: [...profile.sources, "user"],
  };
}

/** Reference figures of a profile in override shape, for "varsayılana dön" and for showing the defaults next to the inputs. Pure. */
export function referenceOverrides(profile: CountryProfile): Required<Pick<CountryOverrides, "vatRate" | "dutyDefaultRate" | "commissions" | "brokerFee" | "domesticShippingPerUnit">> {
  const vat = profile.taxes.find((t) => t.key === "vat");
  return {
    vatRate: profile.salesVatRate ?? vat?.rate ?? 0,
    dutyDefaultRate: profile.dutyByHs["default"] ?? 0,
    commissions: { ...profile.commissions },
    brokerFee: profile.brokerFee,
    domesticShippingPerUnit: profile.domesticShippingPerUnit,
  };
}
