import type { CountryProfile, MarketId } from "@manufactogate/core";
import { DE } from "./profiles/de";
import { TR } from "./profiles/tr";
import { AE, ES, FR, GB, ID, IN, IT, JP, KR, NL, PL, RO, RU, SA, TH, US } from "./profiles/more";

export const COUNTRY_PROFILES: Record<string, CountryProfile> = {
  tr: TR, de: DE, us: US, gb: GB, ae: AE, nl: NL, pl: PL, ro: RO, fr: FR, it: IT, es: ES, ru: RU, jp: JP, kr: KR, id: ID, th: TH, in: IN, sa: SA,
};

export const COUNTRY_NAMES_TR: Record<string, string> = {
  tr: "Türkiye", de: "Almanya", us: "ABD", gb: "Birleşik Krallık", ae: "BAE", nl: "Hollanda", pl: "Polonya", ro: "Romanya", fr: "Fransa", it: "İtalya", es: "İspanya",
  ru: "Rusya", jp: "Japonya", kr: "Güney Kore", id: "Endonezya", th: "Tayland", in: "Hindistan", sa: "Suudi Arabistan", cn: "Çin",
};

export function getCountryProfile(country: string): CountryProfile | undefined {
  return COUNTRY_PROFILES[country.toLowerCase()];
}

/** Profiles whose marketplaces include the given registry id (a market may sell in several countries). */
export function profilesForMarket(marketId: MarketId): CountryProfile[] {
  return Object.values(COUNTRY_PROFILES).filter((p) => (p.marketplaces ?? Object.keys(p.commissions)).includes(marketId));
}

/** Marketplaces that sell in a profile's country, in commission order; the first is the default for margin analysis. */
export function marketplacesOf(profile: CountryProfile): MarketId[] {
  return (profile.marketplaces ?? Object.keys(profile.commissions)) as MarketId[];
}

export { REFERENCE_FX } from "./fx";
export { EU_DUTY } from "./profiles/eu";
export { TR, DE, US, GB, AE, NL, PL, RO, FR, IT, ES, RU, JP, KR, ID, TH, IN, SA };
