/** Market identifiers follow "<country>-<market>", e.g. "cn-1688". */
export type MarketId = `${string}-${string}`;
export type CountryCode = string; // ISO 3166-1 alpha-2, lower case: "cn", "tr", "de"
export type CurrencyCode = string; // ISO 4217: "CNY", "TRY", "EUR", "USD"
export type LanguageCode = string; // BCP 47 primary: "zh", "tr", "en"

export type IsoDateTime = string;
