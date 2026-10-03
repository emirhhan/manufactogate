import { BADGES_B2B, BADGES_RETAIL } from "../badges";
import { absUrl, clean, extractJsonAfter, get, normalizeUnit, parseMoney, parsePrice, readJsonScript, readNextFlight, tryJson } from "../dom";
import type { RealMarketDef, SearchItem } from "../runtime";
import { amazonDef } from "../wave2/amazon";
import { makeDef } from "../wave2/generic";

/**
 * Wave-3 markets (beta): more source countries and target markets. Text search over the
 * market's results page; selectors are calibrated from the user's captured pages where one
 * exists (see docs/CALIBRATION.md for the per-market status).
 */

const USD = /US\s?\$\s?([\d.,]+)|\$\s?([\d.,]+)/;
const EUR = /([\d.]+(?:,\d{2})?)\s?€|€\s?([\d.,]+)|EUR\s?([\d.,]+)/;
const GBP = /£\s?([\d.,]+)/;
const INR = /₹\s?([\d,]+(?:\.\d+)?(?:\s*(?:Lakh|Crore))?)|Rs\.?\s?([\d,]+(?:\.\d+)?)|([\d,.]+)\s*INR\b/;
const IDR = /Rp\s?([\d.]+)/;
const THB = /฿\s?([\d,.]+)|([\d,.]+)\s?บาท/;
const JPY = /([\d,]+)\s?円|¥\s?([\d,]+)/;
const KRW = /([\d,]+)\s?원/;
/** Russian prices use spaces as thousands separators ("2 325 ₽"); the group must start with a digit. */
const RUB = /(\d[\d ]*(?:[.,]\d{2})?)\s?₽|(\d[\d ]*)\s?руб/;
const AED = /AED\s?([\d,]+(?:\.\d+)?)|([\d,]+(?:\.\d+)?)\s?(?:AED|د\.إ)/;
/** Temu / AliExpress localise prices for the session: TL, US$, €. */
const LOCALISED = /([\d.]+(?:,\d{2})?)\s*TL\b|US\s?\$\s?([\d.,]+)|\$\s?([\d.,]+)|€\s?([\d.,]+)|([\d.]+(?:,\d{2})?)\s?€/;
/** "sold" / "bought" counts with the number right before the word; "pre-orders" and pack sizes do not match. */
const SOLD_EN = /\b((?:\d+(?:[.,]\d+)?)\s?[Kk]?\+?)\s*(?:sold|bought)\b/i;
const SOLD_ID = /((?:\d+(?:[.,]\d+)?)\s?(?:rb|jt)?\+?)\s*terjual/i;
const SOLD_TH = /ขายแล้ว\s*((?:\d+(?:[.,]\d+)?)\s?(?:พัน|หมื่น|แสน)?\+?)/;
const SOLD_RU = /((?:\d+(?:[.,]\d+)?)\s?(?:тыс\.?|млн\.?)?\+?)\s*(?:купили|продано)/i;
const SOLD_KO = /(?:구매|판매)\s*((?:\d+(?:[.,]\d+)?)\s?(?:천|만)?\+?)/;
const SOLD_TR = /((?:\d+(?:[.,]\d+)?)\s?[Kk]?\+?)\s*satıldı/i;

/* ------------------------------------------------------------------------------------------------
 * Embedded-state readers for markets whose listings are not in the DOM
 * ---------------------------------------------------------------------------------------------- */

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

/** IndiaMART export search: listings live in the RSC flight payload under "initialProducts". */
export function indiamartEmbedded(doc: Document): SearchItem[] | null {
  const flight = readNextFlight(doc);
  if (!flight.includes('"initialProducts"')) return null;
  const arr = tryJson<Record<string, unknown>[]>(extractJsonAfter(flight, '"initialProducts":'));
  if (!Array.isArray(arr) || !arr.length) return null;
  const items: SearchItem[] = [];
  const push = (p: Record<string, unknown>, parent: Record<string, unknown>) => {
    const id = String(p["displayid"] ?? p["id"] ?? "");
    if (!/^\d+$/.test(id)) return;
    const name = clean(String(p["name"] ?? ""));
    if (!name) return;
    const money = parseMoney(String(p["priceFormatted"] ?? p["indiaPriceFormat"] ?? ""));
    const price = typeof p["price"] === "number" && p["price"] > 0 ? (p["price"] as number) : (money?.amount ?? null);
    const currency = String(p["currency"] ?? parent["currency"] ?? money?.currency ?? "INR");
    const yearsM = /(\d{1,2})\+?\s*yrs?/i.exec(String(parent["exportSinceDisplay"] ?? ""));
    const nature = String(parent["natureOfBusiness"] ?? "");
    const badges: string[] = [];
    if (parent["isTrustSeal"]) badges.push("TrustSEAL");
    if (parent["isVerified"]) badges.push("Verified Exporter");
    if (parent["isGSTVerified"]) badges.push("GST Verified");
    if (/manufacturer/i.test(nature)) badges.push("Manufacturer");
    if (/exporter/i.test(nature) || parent["exportsTo"]) badges.push("Exporter");
    const moq = Number(p["moq"] ?? parent["moq"] ?? NaN);
    const rating = Number(parent["supplier_rating"] ?? NaN);
    const ratingCount = Number(parent["rating_count"] ?? NaN);
    items.push({
      id,
      url: `https://www.indiamart.com/proddetail/${slug(name)}-${id}.html`,
      title: name,
      image: typeof p["image"] === "string" && p["image"] ? String(p["image"]).replace(/^http:/, "https:") : null,
      price,
      priceText: price !== null ? String(p["priceFormatted"] ?? price) : null,
      priceCurrency: currency,
      sold: null,
      shop: clean(String(parent["company"] ?? "")) || null,
      location: clean(String(parent["state"] ?? "")) || null,
      badges,
      text: "",
      currency,
      ...(Number.isFinite(moq) && moq > 0 ? { moq } : {}),
      supplierId: typeof parent["companyalias"] === "string" ? (parent["companyalias"] as string) : null,
      ...(yearsM ? { supplierYears: Number(yearsM[1]) } : {}),
      supplierVerified: !!(parent["isTrustSeal"] || parent["isVerified"]),
      businessType: /manufacturer/i.test(nature) ? "factory" : /trader|wholesaler|distributor/i.test(nature) ? "trading" : "unknown",
      ...(Number.isFinite(rating) ? { supplierRating: rating } : {}),
      ...(Number.isFinite(ratingCount) ? { ratingCount } : {}),
      ...(price === null ? { priceOnRequest: true } : {}),
      // "unit":"Piece" is the counter the price is quoted per ("₹ 48,000/Piece").
      unitLabel: normalizeUnit(typeof p["unit"] === "string" ? (p["unit"] as string) : null),
    });
  };
  for (const p of arr) {
    push(p, p);
    for (const m of (p["moreResults"] as Record<string, unknown>[] | undefined) ?? []) push(m, p);
  }
  return items.length ? items : null;
}

/** TradeIndia: `#__NEXT_DATA__` holds listing rows (manufacturers page and product search) with prices, years and factory flags. */
export function tradeindiaEmbedded(doc: Document): SearchItem[] | null {
  const next = readJsonScript<Record<string, unknown>>(doc, "#__NEXT_DATA__");
  const state = get(next, "props.pageProps.initialState") ?? get(next, "props.pageProps");
  if (!state || typeof state !== "object") return null;
  const rows: Record<string, unknown>[] = [];
  const seen = new Set<unknown>();
  const walk = (o: unknown, depth: number) => {
    if (!o || typeof o !== "object" || depth > 10 || seen.has(o)) return;
    seen.add(o);
    if (Array.isArray(o)) {
      if (o.length && o.every((x) => x && typeof x === "object" && "product_id" in (x as object))) {
        for (const r of o) rows.push(r as Record<string, unknown>);
        return;
      }
      for (const x of o) walk(x, depth + 1);
      return;
    }
    for (const v of Object.values(o as Record<string, unknown>)) walk(v, depth + 1);
  };
  walk(state, 0);
  if (!rows.length) return null;
  const items: SearchItem[] = [];
  const ids = new Set<string>();
  for (const r of rows) {
    const id = String(r["product_id"] ?? "");
    if (!/^\d+$/.test(id) || ids.has(id)) continue;
    const title = clean(String(r["long_tail_prod_name"] ?? r["product_name"] ?? r["product_description"] ?? ""));
    if (!title) continue;
    ids.add(id);
    const priceText = clean(String(r["price"] ?? r["price_range"] ?? ""));
    const money = parseMoney(priceText.replace(/\(Approx\.\)/i, ""));
    const price = money?.amount ?? null;
    const moqRow = ((get(r, "custom_field_data_meta_info.Price_And_Quantity") as { label_name?: string; value?: string }[] | undefined) ?? []).find((x) => /minimum order/i.test(x.label_name ?? ""));
    const moq = moqRow ? parsePrice(moqRow.value ?? "") : null;
    const unitRow = ((get(r, "custom_field_data_meta_info.Price_And_Quantity") as { label_name?: string; value?: string }[] | undefined) ?? []).find((x) => /unit of (?:price|measure)/i.test(x.label_name ?? ""));
    const badges: string[] = [];
    if (r["has_trust_stamp"]) badges.push("Trusted Seller");
    if (r["has_ti_verified"]) badges.push("TI Verified");
    if (r["ifmanu"]) badges.push("Manufacturer");
    if (r["ifexporter"]) badges.push("Exporter");
    const years = Number(r["member_since"] ?? NaN);
    const url = typeof r["prod_url"] === "string" ? absUrl(r["prod_url"] as string, "https://www.tradeindia.com/") : `https://www.tradeindia.com/products/-c${id}.html`;
    items.push({
      id,
      url,
      title,
      image: typeof r["product_image"] === "string" ? (r["product_image"] as string) : null,
      price,
      priceText: priceText || null,
      priceCurrency: money?.currency ?? "INR",
      ...(money?.max !== undefined ? { priceMax: money.max } : {}),
      sold: null,
      shop: clean(String(r["co_name"] ?? r["company_name"] ?? "")) || null,
      location: [r["city"], r["state"]].map((x) => clean(String(x ?? ""))).filter(Boolean).join(", ") || null,
      badges,
      text: "",
      currency: money?.currency ?? "INR",
      ...(moq ? { moq } : {}),
      supplierId: typeof r["profile_url"] === "string" ? (r["profile_url"] as string).replace(/^\/|\/$/g, "") : null,
      ...(Number.isFinite(years) && years > 0 ? { supplierYears: years } : {}),
      supplierVerified: !!(r["has_trust_stamp"] || r["has_ti_verified"]),
      businessType: r["ifmanu"] ? "factory" : r["iftrader"] || r["ifdistributor"] ? "trading" : "unknown",
      ...(price === null ? { priceOnRequest: true } : {}),
      // "unit":"Piece/Pieces" on the row, else the "Unit of Price" label of the price block.
      unitLabel: normalizeUnit(typeof r["unit"] === "string" ? (r["unit"] as string) : (unitRow?.value ?? null)),
    });
  }
  return items.length ? items : null;
}

/* ------------------------------------------------------------------------------------------------
 * Market definitions
 * ---------------------------------------------------------------------------------------------- */

export const WAVE3_DEFS: RealMarketDef[] = [
  // Çin tedarik
  makeDef({
    id: "cn-dhgate", name: "DHgate", country: "cn", currency: "USD", language: "en", role: "source", hosts: ["*.dhgate.com"],
    searchUrl: (q, p) => `https://www.dhgate.com/wholesale/search.do?searchkey=${encodeURIComponent(q)}${p > 1 ? `&pageNum=${p}` : ""}`,
    link: /dhgate\.com\/product\/[^"?#]*?\/(\d{6,})\.html/, detailUrl: (id) => `https://www.dhgate.com/product/-/${id}.html`,
    price: USD, sold: SOLD_EN, moq: /(?:Min\.?\s*Order|MOQ):?\s*([\d,]+)/i,
    badgeMap: BADGES_B2B,
    resultsUrlPattern: /dhgate\.com\/wholesale\//i,
    noResultsMarkers: ["No results found", "Sorry, we couldn't find"],
    resultCountRegex: /([\d,]+)\s*(?:results|items)/i,
    healthQuery: "bluetooth earbuds", calibration: "live",
  }),
  makeDef({
    id: "cn-madeinchina", name: "Made-in-China", country: "cn", currency: "USD", language: "en", role: "source", hosts: ["*.made-in-china.com"],
    searchUrl: (q, p) => `https://www.made-in-china.com/products-search/hot-china-products/${encodeURIComponent(q.replace(/\s+/g, "_"))}.html${p > 1 ? `?page=${p}` : ""}`,
    link: /made-in-china\.com\/product\/([A-Za-z0-9-]{8,})\//, detailUrl: (id) => `https://www.made-in-china.com/product/${id}/`,
    price: USD, moq: /(?:Min\.?\s*Order|MOQ):?\s*([\d,]+)/i, years: /(\d{1,2})\s*(?:yrs?|years?)\b/i,
    titleSelectors: [".prod-name a", ".prod-name", "h2 a", "h2", "[class*='title' i]"],
    shopSelectors: [".company-name a", ".company-name", "[class*='company' i]"],
    badgeMap: BADGES_B2B, badgeWords: ["Diamond Member", "Gold Member", "Audited Supplier"],
    resultsUrlPattern: /made-in-china\.com\/(?:products-search\/|[^?#]*\/search|.*\?word=)/i,
    noResultsMarkers: ["No results found", "Sorry, no products"],
    resultCountRegex: /([\d,]+)\s*(?:products|results)/i,
    healthQuery: "bluetooth earbuds", calibration: "none",
  }),
  makeDef({
    id: "cn-globalsources", name: "Global Sources", country: "cn", currency: "USD", language: "en", role: "source", hosts: ["*.globalsources.com"],
    searchUrl: (q, p) => `https://www.globalsources.com/searchList/products?keyWord=${encodeURIComponent(q)}${p > 1 ? `&pageNum=${p}` : ""}`,
    link: /(?:globalsources\.com)?\/[^"?#]*?-(\d{8,})p\.htm/, detailUrl: (id) => `https://www.globalsources.com/p/p-${id}p.htm`,
    price: USD, moq: /Min\.?\s*order:?\s*([\d,]+)/i,
    priceSelectors: [".price-box .price", ".price-box", ".price"],
    titleSelectors: [".product-name", ".tit .product-name", "img.img[alt]"],
    shopSelectors: [".link-el", ".name.o2o-name", "[class*='supplier' i]"],
    badgeMap: BADGES_B2B, badgeWords: ["Premier Supplier", "O2O Supported", "Hot Picks"],
    cardFilter: (card) => !!card.querySelector(".product-name, .mod-prod-info, .price-box"),
    searchBoxSelectors: ["input.el-input__inner[label='Search']", "input[placeholder*='Search' i]", ".search-input input"],
    resultsUrlPattern: /globalsources\.com\/searchList\//i,
    noResultsMarkers: ["0 results from", "No results found"],
    resultCountRegex: /([\d,]+)\s*results from/i,
    healthQuery: "bluetooth earbuds", calibration: "fixture",
  }),
  makeDef({
    id: "cn-yiwugo", name: "Yiwugo", country: "cn", currency: "CNY", language: "zh", role: "source", hosts: ["*.yiwugo.com"],
    searchUrl: (q, p) => `https://www.yiwugo.com/search?q=${encodeURIComponent(q)}${p > 1 ? `&cpage=${p}` : ""}`,
    link: /(?:yiwugo\.com)?\/product\/detail\/(\d+)\.html/, detailUrl: (id) => `https://www.yiwugo.com/product/detail/${id}.html`,
    price: /(\d+)\s*(\.\d{1,2})?\s*元|[¥￥]\s?([\d.]+)/, yenAs: "CNY",
    priceSelectors: [".price", ".start-price"],
    moq: /(\d+)\s*[个件套双条台只箱盒包副对卷]\s*起(?:购|批|订)/,
    years: /(?<!\d)(\d{1,2})年/,
    titleSelectors: [".product-name", ".product-title", "[class*='product-name' i]"],
    shopSelectors: ["a.name", ".shop_name .name", ".shopInfo a", "[class*='shop' i] a"],
    locationSelectors: [".address-info", "[class*='address' i]"],
    badgeMap: BADGES_B2B, badgeWords: ["高级会员", "实体店铺", "诚信通"],
    resultsUrlPattern: /yiwugo\.com\/search/i,
    noResultsMarkers: ["没有找到", "暂无相关"],
    healthQuery: "蓝牙耳机", calibration: "fixture",
  }),
  // Diğer üretici ülkeler
  makeDef({
    id: "in-indiamart", name: "IndiaMART", country: "in", currency: "INR", language: "en", role: "source", hosts: ["*.indiamart.com"],
    searchUrl: (q) => `https://export.indiamart.com/search.php?ss=${encodeURIComponent(q)}`,
    link: /(?:indiamart\.com)?\/proddetail\/[^"?#]*?-?(\d{8,})\.html/, detailUrl: (id) => `https://www.indiamart.com/proddetail/-${id}.html`,
    price: INR, years: /(\d{1,2})\+?\s*yrs?\b/i,
    embedded: indiamartEmbedded,
    badgeMap: BADGES_B2B,
    resultsUrlPattern: /export\.indiamart\.com\/search\.php|indiamart\.com\/(?:impcat|search)/i,
    noResultsMarkers: ["No results found", "did not match any"],
    maxPages: 1,
    healthQuery: "bluetooth earphones", calibration: "fixture",
  }),
  makeDef({
    id: "in-tradeindia", name: "TradeIndia", country: "in", currency: "INR", language: "en", role: "source", hosts: ["*.tradeindia.com"],
    searchUrl: (q, p) => `https://www.tradeindia.com/search.html?keyword=${encodeURIComponent(q)}${p > 1 ? `&page=${p}` : ""}`,
    link: /(?:tradeindia\.com)?\/products\/[^"?#]*?-c(\d{5,})\.html/, detailUrl: (id) => `https://www.tradeindia.com/products/-c${id}.html`,
    price: INR, years: /(\d{1,2})\s*Years?\b/,
    priceSelectors: [".price-text", "[class*='price' i]"],
    titleSelectors: [".h2-title a", "h2 a.title-url", "h2", "[class*='title' i]"],
    shopSelectors: [".supplier-details h3 a", "a.company-url", "[class*='company' i]"],
    embedded: tradeindiaEmbedded,
    badgeMap: BADGES_B2B,
    resultsUrlPattern: /tradeindia\.com\/(?:search\.html|manufacturers\/|products\/|[^/?#]*-suppliers)/i,
    noResultsMarkers: ["No results found", "No Products Found"],
    resultCountRegex: /([\d,]+)\s*(?:products|results)\s*(?:found|available)/i,
    healthQuery: "bluetooth earphones", calibration: "fixture",
  }),
  makeDef({
    id: "id-tokopedia", name: "Tokopedia", country: "id", currency: "IDR", language: "id", role: "both", hosts: ["*.tokopedia.com"],
    searchUrl: (q, p) => `https://www.tokopedia.com/search?q=${encodeURIComponent(q)}${p > 1 ? `&page=${p}` : ""}`,
    // Only "<shop>/<product>" paths are products; category, discovery, help and search paths are not.
    link: /tokopedia\.com\/(?!(?:discovery|p|find|s|help|promo|about|blog|cart|user|login|register|wishlist|search|deals|voucher|voucher-game|mobile-apps|pulsa|paket-data|hotel|reksa-dana|pinjaman-online|official-store|category|c|edu|seller|play|events|tiket)(?:\/|[?#]|$))([a-z0-9-]+\/[a-z0-9-]+)(?:[?#]|$)/,
    detailUrl: (id) => `https://www.tokopedia.com/${id}`,
    price: IDR, sold: SOLD_ID,
    ratingSelectors: ["[class*='rating' i] + span", "img[alt='rating'] + span", "[data-testid*='rating' i]"],
    shopSelectors: ["[data-testid='spnSRPProdTabShopName']", "[data-testid*='ShopName' i]", "[class*='shop' i]"],
    locationSelectors: ["[data-testid='spnSRPProdTabShopLoc']", "[data-testid*='ShopLoc' i]"],
    badgeMap: BADGES_RETAIL, badgeWords: ["Power Merchant", "Official Store", "Bisa COD"],
    resultsUrlPattern: /tokopedia\.com\/search/i,
    noResultsMarkers: ["Tidak ada hasil", "tidak ditemukan", "Oops, produk tidak ditemukan"],
    healthQuery: "earphone bluetooth", calibration: "live",
  }),
  makeDef({
    id: "id-shopee", name: "Shopee ID", country: "id", currency: "IDR", language: "id", role: "both", hosts: ["*.shopee.co.id"],
    searchUrl: (q, p) => `https://shopee.co.id/search?keyword=${encodeURIComponent(q)}${p > 1 ? `&page=${p - 1}` : ""}`,
    link: /shopee\.co\.id\/[^"?#]*?-i\.(\d+\.\d+)/, detailUrl: (id) => `https://shopee.co.id/product/${id.split(".")[0]}/${id.split(".")[1]}`,
    price: IDR, sold: SOLD_ID,
    badgeMap: BADGES_RETAIL, badgeWords: ["Star Seller", "Star+", "Mall"],
    humanSearch: true, homeUrl: "https://shopee.co.id/",
    searchBoxSelectors: ["input.shopee-searchbar-input__input", "input[placeholder*='Cari' i]", "input[type='search']"],
    loginHosts: /shopee\.co\.id\/(?:buyer\/)?login|\/signup/i,
    captchaMarkers: ["Verifikasi", "Verify your identity", "Konfirmasi bahwa Anda bukan robot"],
    captchaHosts: /shopee\.co\.id\/verify|\/verification/i,
    resultsUrlPattern: /shopee\.co\.id\/search/i,
    noResultsMarkers: ["Tidak ada hasil", "tidak ditemukan"],
    healthQuery: "earphone bluetooth", calibration: "none",
  }),
  makeDef({
    id: "th-lazada", name: "Lazada TH", country: "th", currency: "THB", language: "th", role: "both", hosts: ["*.lazada.co.th"],
    searchUrl: (q, p) => `https://www.lazada.co.th/catalog/?q=${encodeURIComponent(q)}${p > 1 ? `&page=${p}` : ""}`,
    link: /(?:lazada\.co\.th)?\/products\/[^"?#]*?-i(\d+)/, detailUrl: (id) => `https://www.lazada.co.th/products/-i${id}.html`,
    price: THB, sold: SOLD_TH,
    priceSelectors: [".fs-card-price", ".ooOxS", "[class*='price' i]:not([class*='origin' i])", ".price"],
    titleSelectors: [".RfADt a", ".RfADt", "[class*='title' i]", "a[title]"],
    badgeMap: BADGES_RETAIL, badgeWords: ["LazMall", "ส่งฟรี"],
    resultsUrlPattern: /lazada\.co\.th\/(?:catalog|tag)\//i,
    noResultsMarkers: ["ไม่พบสินค้า", "ไม่พบผลการค้นหา"],
    healthQuery: "bluetooth earphone", calibration: "live",
  }),
  // Doğu Asya nişleri
  makeDef({
    id: "jp-rakuten", name: "Rakuten", country: "jp", currency: "JPY", language: "ja", role: "both", hosts: ["*.rakuten.co.jp"],
    searchUrl: (q, p) => `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(q)}/${p > 1 ? `?p=${p}` : ""}`,
    link: /item\.rakuten\.co\.jp\/([a-z0-9-]+\/[a-z0-9-]+)\//, detailUrl: (id) => `https://item.rakuten.co.jp/${id}/`,
    price: JPY, yenAs: "JPY",
    priceSelectors: ["[class*='price--' i]", "[class*='price' i]"],
    titleSelectors: ["[class*='title--' i] a", "[class*='title' i]", "h2 a", "h2"],
    shopSelectors: ["[class*='merchant' i]", "[class*='shop' i]"],
    badgeMap: BADGES_RETAIL, badgeWords: ["送料無料"],
    homeUrl: "https://www.rakuten.co.jp/",
    resultsUrlPattern: /search\.rakuten\.co\.jp\/search\/mall\//i,
    noResultsMarkers: ["検索結果がありません", "見つかりませんでした"],
    resultCountRegex: /([\d,]+)件/,
    healthQuery: "ワイヤレスイヤホン", calibration: "none",
  }),
  // The capture shows the user's session lands on Mercari US (www.mercari.com, USD); jp.mercari.com is a separate CSR-only site.
  makeDef({
    id: "us-mercari", name: "Mercari (US)", country: "us", currency: "USD", language: "en", role: "both", hosts: ["*.mercari.com"],
    searchUrl: (q) => `https://www.mercari.com/search/?keyword=${encodeURIComponent(q)}`,
    link: /(?:mercari\.com)?\/(?:us\/)?item\/(m\d+)/, detailUrl: (id) => `https://www.mercari.com/us/item/${id}/`,
    price: USD,
    priceSelectors: ["[data-testid='ProductThumbItemPrice']", "[data-testid*='Price' i]", "[class*='price' i]"],
    titleSelectors: ["[data-testid='ItemName']", "[data-testid*='Name' i]", "img[alt]"],
    badgeMap: BADGES_RETAIL,
    homeUrl: "https://www.mercari.com/",
    resultsUrlPattern: /mercari\.com\/search/i,
    noResultsMarkers: ["No results found", "We couldn't find"],
    maxPages: 1,
    healthQuery: "wireless earbuds", calibration: "fixture",
  }),
  makeDef({
    id: "jp-yahooauctions", name: "Yahoo Auctions", country: "jp", currency: "JPY", language: "ja", role: "both", hosts: ["auctions.yahoo.co.jp", "*.auctions.yahoo.co.jp"],
    homeUrl: "https://auctions.yahoo.co.jp/",
    searchUrl: (q, p) => `https://auctions.yahoo.co.jp/search/search?p=${encodeURIComponent(q)}${p > 1 ? `&b=${(p - 1) * 50 + 1}` : ""}`,
    link: /auctions\.yahoo\.co\.jp\/jp\/auction\/([a-z]\d+)/, detailUrl: (id) => `https://page.auctions.yahoo.co.jp/jp/auction/${id}`,
    price: /([\d,]+)\s?円/, yenAs: "JPY",
    priceSelectors: [".Product__priceValue", "[class*='PriceValue' i]", "[class*='Price__value' i]", "[class*='price' i]"],
    titleSelectors: [".Product__titleLink", "[class*='Product__title' i]", "[class*='Title-sc' i]", "h3 a", "h3"],
    badgeMap: BADGES_RETAIL, badgeWords: ["送料無料", "新品"],
    searchBoxSelectors: ["#yschsp", "input[name='p']", "#mhdSearchBoxInput"],
    resultsUrlPattern: /auctions\.yahoo\.co\.jp\/search\//i,
    noResultsMarkers: ["に一致する商品はありません", "見つかりませんでした"],
    resultCountRegex: /([\d,]+)件/,
    healthQuery: "ワイヤレスイヤホン", calibration: "fixture",
  }),
  makeDef({
    id: "kr-coupang", name: "Coupang", country: "kr", currency: "KRW", language: "ko", role: "both", hosts: ["*.coupang.com"],
    searchUrl: (q, p) => `https://www.coupang.com/np/search?q=${encodeURIComponent(q)}${p > 1 ? `&page=${p}` : ""}`,
    link: /coupang\.com\/vp\/products\/(\d+)/, detailUrl: (id) => `https://www.coupang.com/vp/products/${id}`,
    price: KRW, sold: SOLD_KO,
    priceSelectors: [".price-value", "[class*='price-value' i]", "[class*='price' i]"],
    titleSelectors: [".name", "[class*='name' i]", "[class*='title' i]"],
    ratingSelectors: [".rating", "[class*='rating' i]"],
    badgeMap: BADGES_RETAIL, badgeWords: ["로켓배송", "로켓직구", "무료배송"],
    humanSearch: true, homeUrl: "https://www.coupang.com/",
    searchBoxSelectors: ["#headerSearchKeyword", "input[name='q']"],
    resultsUrlPattern: /coupang\.com\/np\/search/i,
    noResultsMarkers: ["검색결과가 없습니다", "검색 결과가 없습니다"],
    healthQuery: "블루투스 이어폰", calibration: "none",
  }),
  makeDef({
    id: "kr-gmarket", name: "Gmarket", country: "kr", currency: "KRW", language: "ko", role: "both", hosts: ["*.gmarket.co.kr"],
    searchUrl: (q, p) => `https://browse.gmarket.co.kr/search?keyword=${encodeURIComponent(q)}${p > 1 ? `&p=${p}` : ""}`,
    link: /(?:gmarket\.co\.kr)?[^"?#]*?(?:goodscode|goodsCode|ItemId)=(\d+)/, detailUrl: (id) => `https://item.gmarket.co.kr/Item?goodscode=${id}`,
    price: KRW, sold: SOLD_KO,
    priceSelectors: ["span.text__price", ".box__price-seller .text__value", ".text__value", "[class*='price' i] strong"],
    titleSelectors: [".text__name", ".box__item-title .text__item", ".text__item", "[class*='text__name' i]", "[class*='item-title' i]"],
    shopSelectors: [".text__seller", "[class*='seller' i]"],
    badgeMap: BADGES_RETAIL, badgeWords: ["무료배송", "스마일배송"],
    resultsUrlPattern: /browse\.gmarket\.co\.kr\/search/i,
    noResultsMarkers: ["검색결과가 없습니다", "검색 결과가 없습니다"],
    resultCountRegex: /총\s*([\d,]+)\s*개/,
    healthQuery: "블루투스 이어폰", calibration: "fixture",
  }),
  // Satış pazarları
  amazonDef({ id: "de-amazon", name: "Amazon DE", country: "de", currency: "EUR", language: "de", host: "amazon.de", price: EUR, healthQuery: "bluetooth kopfhörer", noResults: ["Keine Ergebnisse für", "Keine Ergebnisse", "No results for"] }),
  amazonDef({ id: "us-amazon", name: "Amazon US", country: "us", currency: "USD", language: "en", host: "amazon.com", price: USD, healthQuery: "bluetooth earbuds", noResults: ["No results for", "did not match any products"] }),
  amazonDef({ id: "gb-amazon", name: "Amazon UK", country: "gb", currency: "GBP", language: "en", host: "amazon.co.uk", price: GBP, healthQuery: "bluetooth earbuds", noResults: ["No results for", "did not match any products"] }),
  makeDef({
    id: "us-ebay", name: "eBay", country: "us", currency: "USD", language: "en", role: "target", hosts: ["*.ebay.com"],
    searchUrl: (q, p) => `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}${p > 1 ? `&_pgn=${p}` : ""}`,
    link: /(?:ebay\.com)?\/itm\/(?:[^"?#]*?\/)?(\d{9,})/, detailUrl: (id) => `https://www.ebay.com/itm/${id}`,
    price: USD, sold: SOLD_EN,
    priceSelectors: [".s-item__price", ".su-item-card__price", ".s-card__price", "[class*='price' i]"],
    titleSelectors: [".s-item__title", ".su-item-card__title", ".s-card__title", "[role='heading']", "h3"],
    shopSelectors: [".s-item__seller-info-text", "[class*='seller' i]"],
    badgeMap: BADGES_RETAIL, badgeWords: ["Top Rated Plus", "Top Rated", "Free shipping", "Free delivery"],
    resultsUrlPattern: /ebay\.com\/sch\//i,
    noResultsMarkers: ["No exact matches found", "0 results for"],
    resultCountRegex: /([\d,]+)\+?\s*results/i,
    maxPages: 3,
    healthQuery: "bluetooth earbuds", calibration: "live",
  }),
  makeDef({
    id: "us-walmart", name: "Walmart", country: "us", currency: "USD", language: "en", role: "target", hosts: ["*.walmart.com"],
    searchUrl: (q, p) => `https://www.walmart.com/search?q=${encodeURIComponent(q)}${p > 1 ? `&page=${p}` : ""}`,
    link: /(?:walmart\.com)?\/ip\/[^"?#]*?\/(\d{6,})/, detailUrl: (id) => `https://www.walmart.com/ip/${id}`,
    price: USD,
    priceSelectors: ["[data-testid='unified-global-product-price']", "[data-automation-id='product-price']", "[data-testid='ugpp-main-price']", "[class*='price' i]"],
    titleSelectors: ["[data-automation-id='product-title']", "[data-test-id='gpt-global-product-title']", "h3", "[class*='title' i]"],
    badgeMap: BADGES_RETAIL, badgeWords: ["Best seller", "Rollback", "Free shipping"],
    titlePrefixes: ["Rollback,", "Rollback", "Best seller,", "Sponsored"],
    captchaMarkers: ["Robot or human?", "Press & Hold", "Activate and hold the button"],
    captchaSelectors: ["#px-captcha", "[class*='px-captcha']"],
    resultsUrlPattern: /walmart\.com\/search/i,
    noResultsMarkers: ["There were no search results for", "No results for"],
    resultCountRegex: /([\d,]+)\+?\s*results/i,
    healthQuery: "bluetooth earbuds", calibration: "fixture",
  }),
  makeDef({
    id: "us-temu", name: "Temu", country: "us", currency: "USD", language: "en", role: "target", hosts: ["*.temu.com"],
    searchUrl: (q) => `https://www.temu.com/search_result.html?search_key=${encodeURIComponent(q)}`,
    link: /(?:temu\.com)?\/[^"?#]*?-g-(\d+)\.html/, detailUrl: (id) => `https://www.temu.com/g-${id}.html`,
    price: LOCALISED, sold: new RegExp(`${SOLD_EN.source}|${SOLD_TR.source}`, "i"),
    priceSelectors: ["[data-type='price'] > span:first-child", "[data-type='price']", "[class*='price' i]"],
    titleSelectors: ["h3 > span:first-of-type", "[data-tooltip^='goodName-']", "h3", "h2"],
    titlePrefixes: ["Popüler seçimler", "Best Seller", "Çok satan", "En çok satan", "Yerel", "Local"],
    badgeMap: BADGES_RETAIL, badgeWords: ["Ücretsiz Gönderim", "Free shipping"],
    humanSearch: true, homeUrl: "https://www.temu.com/",
    searchBoxSelectors: ["#searchInput", "input[placeholder*='Ara' i]", "input[placeholder*='Search' i]"],
    resultsUrlPattern: /temu\.com\/(?:[a-z]{2}\/)?search_result\.html/i,
    noResultsMarkers: ["No results found", "Sonuç bulunamadı"],
    maxPages: 1,
    healthQuery: "bluetooth earbuds", calibration: "fixture",
  }),
  makeDef({
    id: "ae-noon", name: "Noon", country: "ae", currency: "AED", language: "en", role: "target", hosts: ["*.noon.com"],
    searchUrl: (q, p) => `https://www.noon.com/uae-en/search/?q=${encodeURIComponent(q)}${p > 1 ? `&page=${p}` : ""}`,
    link: /\/(N\d{6,}V)\/p\//, detailUrl: (id) => `https://www.noon.com/uae-en/${id}/p/`,
    price: AED,
    // The currency is drawn by CSS; the amount is a bare number in <strong class="_amount_…">.
    priceSelectors: ["[data-qa='product-box-price'] strong", "strong[class*='_amount_']", "[class*='_sellingPrice_'] strong", "[class*='_amount_']"],
    titleSelectors: ["[data-qa='product-box-name']", "h2[class*='_title_']", "[data-qa*='name' i]", "h2"],
    ratingSelectors: ["[class*='_ratingValue_' i]", "[class*='rating' i] strong"],
    badgeMap: BADGES_RETAIL, badgeWords: ["noon express", "Express", "Fulfilled"],
    resultsUrlPattern: /noon\.com\/[a-z-]+\/search/i,
    noResultsMarkers: ["No results found", "did not match any products"],
    resultCountRegex: /([\d,]+)\s*results/i,
    healthQuery: "bluetooth earbuds", calibration: "fixture",
  }),
  makeDef({
    id: "ru-ozon", name: "Ozon", country: "ru", currency: "RUB", language: "ru", role: "target", hosts: ["*.ozon.ru"],
    searchUrl: (q, p) => `https://www.ozon.ru/search/?text=${encodeURIComponent(q)}${p > 1 ? `&page=${p}` : ""}`,
    link: /(?:ozon\.ru)?\/product\/[^"?#]*?(\d{6,})\/?(?:[?#]|$)/, detailUrl: (id) => `https://www.ozon.ru/product/-${id}/`,
    price: RUB, sold: SOLD_RU,
    priceSelectors: ["span.tsHeadline500Medium", "[class*='tsHeadline' i]", "[class*='price' i]"],
    titleSelectors: ["span.tsBody500Medium", "[class*='tsBody500Medium' i]", "[class*='title' i]"],
    ratingSelectors: ["[style*='textPremium']", "[class*='rating' i]"],
    badgeMap: BADGES_RETAIL, badgeWords: ["Оригинал", "Бесплатная доставка"],
    captchaMarkers: ["Доступ ограничен", "Подтвердите, что вы не робот", "Антибот"],
    resultsUrlPattern: /ozon\.ru\/(?:search|category)\//i,
    noResultsMarkers: ["По вашему запросу ничего не нашлось", "ничего не нашлось", "ничего не найдено"],
    resultCountRegex: /([\d\s]+)\s*(?:товар|результат)/i,
    healthQuery: "беспроводные наушники", calibration: "fixture",
  }),
  makeDef({
    id: "ru-wildberries", name: "Wildberries", country: "ru", currency: "RUB", language: "ru", role: "target", hosts: ["*.wildberries.ru"],
    searchUrl: (q, p) => `https://www.wildberries.ru/catalog/0/search.aspx?search=${encodeURIComponent(q)}${p > 1 ? `&page=${p}` : ""}`,
    link: /(?:wildberries\.ru)?\/catalog\/(\d+)\/detail/, detailUrl: (id) => `https://www.wildberries.ru/catalog/${id}/detail.aspx`,
    price: RUB, sold: SOLD_RU,
    priceSelectors: ["ins[data-testid='product-card-current-price']", "ins.price__lower-price", "[class*='price__lower' i]", "ins[class*='price' i]", "[class*='price' i]"],
    titleSelectors: ["a[data-testid='product-card-link']", "[data-testid='productName']", ".product-card__name", "[class*='productName' i]", "[class*='goods-name' i]"],
    shopSelectors: ["[data-testid='brandName']", ".product-card__brand", "[class*='brandName' i]"],
    badgeMap: BADGES_RETAIL, badgeWords: ["Оригинал", "Хорошая цена"],
    searchBoxSelectors: ["#searchInput", "input[data-testid='searchInput']", "input[name='search']"],
    captchaMarkers: ["Доступ ограничен", "Подтвердите, что вы не робот"],
    resultsUrlPattern: /wildberries\.ru\/catalog\/\d+\/search\.aspx/i,
    noResultsMarkers: ["ничего не найдено"],
    healthQuery: "беспроводные наушники", calibration: "fixture",
  }),
];
