import type { RealMarketDef } from "../runtime";
import { makeDef } from "./generic";

/**
 * Amazon storefronts share one page structure: `/s?k=` results, `[data-asin]` cards with the
 * price in `.a-price .a-offscreen`, `#twotabsearchtextbox` search box and a bot interstitial
 * ("Continue shopping" / validateCaptcha form) for sessions it does not trust.
 */
export interface AmazonSite {
  id: `${string}-${string}`;
  name: string;
  country: string;
  currency: string;
  language: string;
  host: string;
  price: RegExp;
  healthQuery: string;
  noResults: string[];
  /** Which calibration the market has; TR is verified live, the rest wait for a capture. */
  calibration?: "live" | "fixture" | "synthetic" | "none";
}

export const AMAZON_CAPTCHA_MARKERS = [
  "api-services-support@amazon.com",
  "Robot olmadığınızı",
  "Sorry, we just need to make sure you're not a robot",
  "Type the characters you see in this image",
  "Enter the characters you see below",
  "Geben Sie die angezeigten Zeichen",
  "Continue shopping",
  "Alışverişe devam et",
  "Weiter einkaufen",
];

export function amazonDef(site: AmazonSite): RealMarketDef {
  const base = `https://www.${site.host}`;
  return makeDef({
    id: site.id,
    name: site.name,
    country: site.country,
    currency: site.currency,
    language: site.language,
    role: "target",
    hosts: [`*.${site.host}`],
    homeUrl: `${base}/`,
    searchUrl: (q, page) => `${base}/s?k=${encodeURIComponent(q)}${page > 1 ? `&page=${page}` : ""}`,
    link: /\/dp\/([A-Z0-9]{10})/,
    detailUrl: (id) => `${base}/dp/${id}`,
    price: site.price,
    priceSelectors: [".a-price .a-offscreen", "[data-a-color='price'] .a-offscreen", ".a-price", ".a-color-price"],
    titleSelectors: ["h2 a span", "h2 span", "h2", "[data-cy='title-recipe'] span"],
    sold: /(\d[\d.,]*\s?[Kk]?\+?)\s*(?:bought in past month|adet satın alındı|Mal im letzten Monat gekauft)/i,
    ratingSelectors: [".a-icon-alt", "[aria-label*='out of 5' i]", "[aria-label*='üzerinden' i]"],
    ratingCount: /\(?(\d+(?:[.,]\d{3})*)\)?\s*(?:değerlendirme|yorum|ratings?|reviews?|Bewertungen|Sternebewertungen)/i,
    badgeMap: { "Amazon's Choice": "top-rated", "Amazon Seçimi": "top-rated", "Prime": "fast-shipping", "Best Seller": "top-rated", "Çok Satan": "top-rated", "Bestseller": "top-rated" },
    titlePrefixes: ["Sponsorlu", "Sponsored", "Gesponsert"],
    healthQuery: site.healthQuery,
    captchaMarkers: AMAZON_CAPTCHA_MARKERS,
    captchaSelectors: ["form[action*='validateCaptcha']", "#captchacharacters", "input[name='amzn-captcha-submit']"],
    searchBoxSelectors: ["#twotabsearchtextbox", "input[name='field-keywords']", "#nav-bb-search"],
    resultsUrlPattern: new RegExp(`^https://www\\.${site.host.replace(/\./g, "\\.")}/s(?:[/?]|$)`),
    noResultsMarkers: site.noResults,
    resultCountRegex: /(?:of|üzerinden|von)\s+(?:over\s+|fazla\s+|über\s+)?([\d.,]+)\s*(?:results|sonuç|Ergebnisse)/i,
    maxPages: 3,
    calibration: site.calibration ?? "none",
  });
}
