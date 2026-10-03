import type { CountryProfile } from "@manufactogate/core";
import { DE } from "./profiles/de";
import { TR } from "./profiles/tr";
import { AE, GB, NL, PL, RO, US } from "./profiles/more";

export const COUNTRY_PROFILES: Record<string, CountryProfile> = { tr: TR, de: DE, us: US, gb: GB, ae: AE, nl: NL, pl: PL, ro: RO };

export const COUNTRY_NAMES_TR: Record<string, string> = { tr: "Türkiye", de: "Almanya", us: "ABD", gb: "Birleşik Krallık", ae: "BAE", nl: "Hollanda", pl: "Polonya", ro: "Romanya" };

export function getCountryProfile(country: string): CountryProfile | undefined {
  return COUNTRY_PROFILES[country.toLowerCase()];
}

export { TR, DE, US, GB, AE, NL, PL, RO };
