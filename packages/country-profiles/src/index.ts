import type { CountryProfile } from "@manufactogate/core";
import { DE } from "./profiles/de";
import { TR } from "./profiles/tr";

export const COUNTRY_PROFILES: Record<string, CountryProfile> = { tr: TR, de: DE };

export function getCountryProfile(country: string): CountryProfile | undefined {
  return COUNTRY_PROFILES[country.toLowerCase()];
}

export { TR, DE };
