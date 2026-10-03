import type { LinkInfo, MarketMeta, NormalizedBadge, RawListing, RawListingDetail } from "@manufactogate/core";
import { canonicalUrl, clean, extractCards, homeOriginFor, parseMoney, parsePrice, readJsonLd, urlOnHosts, visibleText } from "../dom";
import { detectSession, pageProbe, type CalibrationStatus, type PageExtractor, type RealMarketDef, type SearchItem } from "../runtime";

/** Generic text-search market definition built on card extraction; used by all beta markets. */
const RL = { minIntervalMs: 3000, maxPerHour: 100 };

/** Visible-text phrases that only a bot wall shows. Bare "captcha"/"verify" are NOT markers (reCAPTCHA badges). */
export const GENERIC_CAPTCHA_MARKERS: readonly string[] = [
  "Robot olmadığınızı",
  "robot check",
  "Robot or human",
  "Erişim engellendi",
  "unusual traffic",
  "Доступ ограничен",
  "Access Denied",
  "请完成验证",
  "滑动验证",
  "Type the characters you see",
  "Enter the characters you see below",
  "Verify you are human",
  "Press & Hold",
];

/** "No results" wordings across markets; a market may pass a tighter list. */
export const GENERIC_NO_RESULTS_MARKERS: readonly string[] = [
  "No results for",
  "No exact matches found",
  "No results found",
  "Sorry, we couldn't find",
  "için sonuç bulunamadı",
  "Sonuç bulunamadı",
  "Aradığınız ürün bulunamadı",
  "Keine Ergebnisse",
  "没有找到",
  "没有搜索到",
  "検索結果がありません",
  "見つかりませんでした",
  "검색 결과가 없습니다",
  "검색결과가 없습니다",
  "Tidak ada hasil",
  "tidak ditemukan",
  "ไม่พบสินค้า",
  "ничего не нашлось",
  "ничего не найдено",
  "لم يتم العثور",
  "0 results from",
];

/** Cheap logged-in signals shared by beta markets: an explicit sign-out link or "my account" wording. */
const GENERIC_LOGGED_IN_SELECTORS: readonly string[] = ["a[href*='logout' i]", "a[href*='signout' i]", "a[href*='sign-out' i]", "a[href*='/cikis' i]"];
const GENERIC_LOGGED_IN_MARKERS: readonly string[] = ["Hesabım", "Çıkış Yap", "Sign Out", "Sign out", "Log out", "Logout", "Выйти", "ログアウト", "로그아웃", "Keluar", "ออกจากระบบ", "退出登录"];

const PRICE_ON_REQUEST = /ask for (?:a )?quote|get (?:best|latest) (?:quote|price)|negotiable|contact supplier|request (?:a )?quote|询价|面议|价格面议|teklif iste/i;

export interface GenericDef {
  id: `${string}-${string}`;
  name: string;
  country: string;
  currency: string;
  language: string;
  role: MarketMeta["role"];
  hosts: string[];
  searchUrl: (q: string, page: number) => string;
  link: RegExp;
  detailUrl: (id: string) => string;
  price: RegExp;
  /** How a bare "¥" on this market is read. */
  yenAs?: "CNY" | "JPY";
  sold?: RegExp;
  moq?: RegExp;
  years?: RegExp;
  /** Number of ratings/reviews; kept apart from sales counts. */
  ratingCount?: RegExp;
  priceSelectors?: string[];
  soldSelectors?: string[];
  titleSelectors?: string[];
  shopSelectors?: string[];
  locationSelectors?: string[];
  ratingSelectors?: string[];
  imageSelectors?: string[];
  badgeMap?: Record<string, NormalizedBadge>;
  /** Extra raw badge words to detect (kept on the listing, not normalized). */
  badgeWords?: string[];
  titlePrefixes?: string[];
  cardFilter?: (card: Element, text: string) => boolean;
  healthQuery: string;
  captchaMarkers?: string[];
  captchaSelectors?: string[];
  captchaHosts?: RegExp;
  loginHosts?: RegExp;
  loggedInMarkers?: string[];
  loggedInSelectors?: string[];
  /** Home page (session probes; the human-like search when `humanSearch` is on). */
  homeUrl?: string;
  /** Search by typing into the home page's search box instead of opening the search URL (opt-in). */
  humanSearch?: boolean;
  searchBoxSelectors?: string[];
  resultsUrlPattern?: RegExp;
  noResultsMarkers?: string[];
  resultCountRegex?: RegExp;
  maxPages?: number;
  /** Reads listings from embedded page state before the card heuristic runs. */
  embedded?: (doc: Document) => SearchItem[] | null;
  /** Keep listings that show no price ("Ask for a Quote"); default: source (B2B) markets only. */
  keepPriceless?: boolean;
  calibration?: CalibrationStatus;
}

/** Results-URL pattern derived from the search URL: its path (query placeholder wildcarded) or its first query key. */
export function resultsPatternFor(searchUrl: (q: string, page: number) => string): RegExp {
  const probe = "mgqzz";
  try {
    const u = new URL(searchUrl(probe, 1));
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const path = esc(u.pathname).replace(new RegExp(esc(probe), "g"), "[^/?#]+");
    const firstKey = [...u.searchParams.keys()][0];
    const alts = [`${esc(u.origin)}${path}`];
    if (firstKey) alts.push(`${esc(u.hostname)}[^?#]*[?&]${esc(firstKey)}=`);
    return new RegExp(`^(?:${alts.join("|")})`, "i");
  } catch {
    return /./;
  }
}

export function makeDef(g: GenericDef): RealMarketDef {
  const badgeWords = [...new Set([...Object.keys(g.badgeMap ?? {}), ...(g.badgeWords ?? [])])];
  const keepPriceless = g.keepPriceless ?? g.role === "source";
  const resultsUrlPattern = g.resultsUrlPattern ?? resultsPatternFor(g.searchUrl);
  const noResultsMarkers = g.noResultsMarkers ?? [...GENERIC_NO_RESULTS_MARKERS];
  const titleSelectors = g.titleSelectors ?? ["h2", "h3", "[class*='title' i]", "[class*='name' i]", "[data-testid*='title' i]", "[data-testid*='name' i]", "a[title]"];
  const shopSelectors = g.shopSelectors ?? ["[class*='supplier' i]", "[class*='seller' i]", "[class*='merchant' i]", "[class*='shop-name' i]", "[class*='shopName' i]", "[class*='store-name' i]", "[class*='storeName' i]", "[class*='company' i]"];
  const priceSelectors = g.priceSelectors ?? ["[class*='price' i]", "[data-testid*='price' i]", ".a-offscreen"];

  const session = (doc: Document) =>
    detectSession(doc, {
      loginHosts: g.loginHosts ?? /\/login\b|\/signin\b|\/sign-in\b|passport|\/giris\b|\/account\/login|\/buyer\/login/i,
      ...(g.captchaHosts ? { captchaHosts: g.captchaHosts } : {}),
      captchaMarkers: g.captchaMarkers ?? [...GENERIC_CAPTCHA_MARKERS],
      ...(g.captchaSelectors ? { captchaSelectors: g.captchaSelectors } : {}),
      loggedInMarkers: g.loggedInMarkers ?? [...GENERIC_LOGGED_IN_MARKERS],
      loggedInSelectors: g.loggedInSelectors ?? [...GENERIC_LOGGED_IN_SELECTORS],
    });

  const extractor: PageExtractor = {
    session,
    probe(doc) {
      return pageProbe(doc, { noResultsMarkers, resultsUrlPattern, ...(g.resultCountRegex ? { resultCountRegex: g.resultCountRegex } : {}) });
    },
    search(doc): SearchItem[] {
      const embedded = g.embedded?.(doc);
      if (embedded && embedded.length) return embedded;
      return extractCards(doc, {
        link: g.link,
        price: g.price,
        priceSelectors,
        currency: g.currency,
        ...(g.yenAs ? { yenAs: g.yenAs } : {}),
        ...(g.sold ? { sold: g.sold } : {}),
        ...(g.soldSelectors ? { soldSelectors: g.soldSelectors } : {}),
        ...(g.moq ? { moq: g.moq } : {}),
        ...(g.years ? { years: g.years } : {}),
        ...(g.ratingCount ? { ratingCount: g.ratingCount } : {}),
        titleSelectors,
        shopSelectors,
        ...(g.locationSelectors ? { locationSelectors: g.locationSelectors } : {}),
        ...(g.ratingSelectors ? { ratingSelectors: g.ratingSelectors } : {}),
        ...(g.imageSelectors ? { imageSelectors: g.imageSelectors } : {}),
        badgeWords,
        ...(g.titlePrefixes ? { titlePrefixes: g.titlePrefixes } : {}),
        ...(g.cardFilter ? { cardFilter: g.cardFilter } : {}),
      }).map((c) => ({
        ...c,
        currency: c.priceCurrency ?? g.currency,
        ...(c.price === null && (keepPriceless || PRICE_ON_REQUEST.test(c.text)) ? { priceOnRequest: true } : {}),
      }));
    },
    detail(doc) {
      // Only a product page of this market counts; a home/error/redirect page returns null instead of garbage.
      const where = `${doc.location?.href ?? ""} ${canonicalUrl(doc)}`;
      if (!g.link.test(where)) return null;
      const ld = readJsonLd(doc, "Product")[0];
      const ldOffer = ld && ((Array.isArray(ld["offers"]) ? ld["offers"][0] : ld["offers"]) as Record<string, unknown> | undefined);
      const title =
        clean(doc.querySelector("h1")?.textContent) ||
        clean(typeof ld?.["name"] === "string" ? (ld["name"] as string) : "") ||
        clean(doc.querySelector("meta[property='og:title']")?.getAttribute("content")) ||
        clean(doc.title);
      let price: number | null = null;
      let currency: string | null = null;
      if (ldOffer && (typeof ldOffer["price"] === "number" || typeof ldOffer["price"] === "string")) {
        price = parsePrice(String(ldOffer["price"]));
        currency = typeof ldOffer["priceCurrency"] === "string" ? (ldOffer["priceCurrency"] as string) : null;
      }
      if (price === null) {
        const main = doc.querySelector("main, #main, [role='main'], #content, body") ?? doc.body;
        for (const sel of priceSelectors) {
          const el = main?.querySelector(sel);
          const t = clean(el?.getAttribute("content") || el?.getAttribute("aria-label") || el?.textContent);
          const m = t ? g.price.exec(t) : null;
          if (m) {
            price = parsePrice(m.slice(1).filter(Boolean).join("") || m[0]);
            currency = parseMoney(m[0], { ...(g.yenAs ? { yenAs: g.yenAs } : {}) })?.currency ?? null;
            if (price !== null) break;
          }
        }
      }
      if (price === null) {
        const text = visibleText(doc, 80_000);
        const m = g.price.exec(text);
        if (m) {
          price = parsePrice(m.slice(1).filter(Boolean).join("") || m[0]);
          currency = parseMoney(m[0], { ...(g.yenAs ? { yenAs: g.yenAs } : {}) })?.currency ?? null;
        }
      }
      if (!title || (price === null && !keepPriceless)) return null;
      const og = doc.querySelector("meta[property='og:image']")?.getAttribute("content") ?? "";
      const ldImages = Array.isArray(ld?.["image"]) ? (ld!["image"] as unknown[]).filter((x): x is string => typeof x === "string") : typeof ld?.["image"] === "string" ? [ld["image"] as string] : [];
      const domImages = [...doc.querySelectorAll<HTMLImageElement>("img")]
        .map((i) => i.getAttribute("src") ?? "")
        .filter((u) => /^https?:/.test(u) && !/\.svg|sprite|icon|logo|badge|flag/i.test(u));
      const images = [...new Set([...(og && /^https?:/.test(og) ? [og] : []), ...ldImages, ...domImages])].slice(0, 8);
      const brand = ld && typeof ld["brand"] === "object" && ld["brand"] ? clean(String((ld["brand"] as Record<string, unknown>)["name"] ?? "")) : "";
      return { strategy: "dom", title, price, currency: currency ?? g.currency, images, badges: [], ...(brand ? { attributes: { Marka: brand } } : {}) };
    },
  };
  const detailUrl = g.detailUrl;
  const humanSearchHome = g.humanSearch ? (g.homeUrl ?? homeOriginFor(g.hosts, g.searchUrl("x", 1))) : undefined;
  return {
    id: g.id,
    meta: {
      name: g.name,
      country: g.country,
      currency: g.currency,
      language: g.language,
      role: g.role,
      capabilities: { imageSearch: false, textSearch: true, linkResolve: true, supplierProfile: false, priceTiers: false },
      rateLimit: RL,
      version: "0.2.0-beta",
      hosts: g.hosts,
    },
    badgeMap: g.badgeMap ?? {},
    healthQuery: g.healthQuery,
    searchUrl: (q, page = 1) => g.searchUrl(q, page),
    maxPages: g.maxPages ?? 2,
    homeUrl: g.homeUrl ?? homeOriginFor(g.hosts, g.searchUrl("x", 1)),
    ...(humanSearchHome ? { humanSearchHome } : {}),
    ...(g.searchBoxSelectors ? { searchBoxSelectors: g.searchBoxSelectors } : {}),
    resultsUrlPattern,
    noResultsMarkers,
    ...(g.resultCountRegex ? { resultCountRegex: g.resultCountRegex } : {}),
    calibration: g.calibration ?? "none",
    detailUrl,
    resolveLink(url): LinkInfo | null {
      if (!urlOnHosts(url, g.hosts)) return null;
      const m = g.link.exec(url);
      return m?.[1] ? { market: g.id, listingId: m[1], canonicalUrl: detailUrl(m[1]) } : null;
    },
    extractor,
    toListing(item, fetchedAt): RawListing | null {
      if (!item.id || !item.title) return null;
      const priceless = item.price === null;
      if (priceless && !(item.priceOnRequest || keepPriceless)) return null;
      const currency = item.currency ?? item.priceCurrency ?? g.currency;
      const tiers = item.tiers?.length ? item.tiers : priceless ? [] : [{ minQty: item.moq ?? 1, unitPrice: item.price! }];
      const badges = [...item.badges];
      if (item.supplierVerified && !badges.some((b) => /verified/i.test(b))) badges.push("Verified Supplier");
      if (item.businessType === "factory" && !badges.includes("Manufacturer")) badges.push("Manufacturer");
      if (item.supplierYears && !badges.some((b) => /\byıl\b/.test(b))) badges.push(`${item.supplierYears} yıl`);
      return {
        market: g.id,
        id: item.id,
        url: item.url,
        title: item.title,
        images: item.image ? [item.image] : [],
        price: { currency, tiers },
        ...(item.moq ? { moq: item.moq } : {}),
        ...(item.sold !== null && item.sold !== undefined ? { sold: item.sold } : {}),
        ...(typeof item.rating === "number" ? { rating: item.rating } : typeof item.supplierRating === "number" ? { rating: item.supplierRating } : {}),
        ...(item.supplierId ? { supplierId: item.supplierId } : {}),
        ...(item.shop ? { supplierName: item.shop } : {}),
        ...(item.location ? { location: item.location } : {}),
        badges,
        fetchedAt,
      };
    },
    toDetail(d, id, fetchedAt): RawListingDetail | null {
      if (!d["title"]) return null;
      const price = typeof d["price"] === "number" ? (d["price"] as number) : null;
      if (price === null && !keepPriceless) return null;
      const currency = typeof d["currency"] === "string" ? (d["currency"] as string) : g.currency;
      return {
        market: g.id,
        id,
        url: detailUrl(id),
        title: String(d["title"]),
        images: (d["images"] as string[]) ?? [],
        price: { currency, tiers: price === null ? [] : [{ minQty: 1, unitPrice: price }] },
        badges: (d["badges"] as string[]) ?? [],
        fetchedAt,
        ...(d["attributes"] ? { attributes: d["attributes"] as Record<string, string> } : {}),
      };
    },
  };
}
