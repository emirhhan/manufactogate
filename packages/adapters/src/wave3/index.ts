import type { RealMarketDef } from "../runtime";
import { makeDef } from "../wave2/generic";

/**
 * Wave-3 markets (beta): more source countries and target markets. All text-search,
 * generic card extraction; each gets calibrated from a captured fixture when it arrives.
 */

const USD = /US\s?\$\s?([\d.,]+)|\$\s?([\d.,]+)/;
const EUR = /([\d.]+,\d{2})\s?€|€\s?([\d.,]+)/;
const GBP = /£\s?([\d.,]+)/;
const INR = /₹\s?([\d,]+(?:\.\d+)?)|Rs\.?\s?([\d,]+)/;
const IDR = /Rp\s?([\d.]+)/;
const THB = /฿\s?([\d,]+)|([\d,]+)\s?บาท/;
const JPY = /([\d,]+)\s?円|¥\s?([\d,]+)/;
const KRW = /([\d,]+)\s?원/;
const RUB = /([\d\s]+)\s?₽|([\d\s]+)\s?руб/;
const AED = /AED\s?([\d,]+(?:\.\d+)?)|([\d,]+(?:\.\d+)?)\s?(?:AED|د\.إ)/;
const SOLD_EN = /((?:\d+(?:[.,]\d+)?)K?\+?)\s*(?:sold|orders?|bought)/i;

export const WAVE3_DEFS: RealMarketDef[] = [
  // Çin tedarik
  makeDef({ id: "cn-dhgate", name: "DHgate", country: "cn", currency: "USD", language: "en", role: "source", hosts: ["*.dhgate.com"],
    searchUrl: (q, p) => `https://www.dhgate.com/wholesale/search.do?searchkey=${encodeURIComponent(q)}${p > 1 ? `&pageNum=${p}` : ""}`,
    link: /dhgate\.com\/product\/[^"?#]*?\/(\d{6,})\.html/, detailUrl: (id) => `https://www.dhgate.com/product/-/${id}.html`, price: USD, sold: SOLD_EN, healthQuery: "bluetooth earbuds" }),
  makeDef({ id: "cn-madeinchina", name: "Made-in-China", country: "cn", currency: "USD", language: "en", role: "source", hosts: ["*.made-in-china.com"],
    searchUrl: (q, p) => `https://www.made-in-china.com/products-search/hot-china-products/${encodeURIComponent(q.replace(/\s+/g, "_"))}.html${p > 1 ? `?page=${p}` : ""}`,
    link: /made-in-china\.com\/product\/([A-Za-z0-9]{8,})\//, detailUrl: (id) => `https://www.made-in-china.com/product/${id}/`, price: USD, healthQuery: "bluetooth earbuds" }),
  makeDef({ id: "cn-globalsources", name: "Global Sources", country: "cn", currency: "USD", language: "en", role: "source", hosts: ["*.globalsources.com"],
    searchUrl: (q, p) => `https://www.globalsources.com/searchList/products?keyWord=${encodeURIComponent(q)}${p > 1 ? `&pageNum=${p}` : ""}`,
    link: /(?:globalsources\.com)?\/[^"?#]*?-(\d{8,})p\.htm/, detailUrl: (id) => `https://www.globalsources.com/p/p-${id}p.htm`, price: USD, healthQuery: "bluetooth earbuds" }),
  makeDef({ id: "cn-yiwugo", name: "Yiwugo", country: "cn", currency: "CNY", language: "zh", role: "source", hosts: ["*.yiwugo.com"],
    searchUrl: (q, p) => `https://www.yiwugo.com/search?q=${encodeURIComponent(q)}${p > 1 ? `&cpage=${p}` : ""}`,
    link: /(?:yiwugo\.com)?\/product\/detail\/(\d+)\.html/, detailUrl: (id) => `https://www.yiwugo.com/product/detail/${id}.html`, price: /[¥￥]\s?([\d.]+)/, healthQuery: "蓝牙耳机" }),
  // Diğer üretici ülkeler
  makeDef({ id: "in-indiamart", name: "IndiaMART", country: "in", currency: "INR", language: "en", role: "source", hosts: ["*.indiamart.com"],
    searchUrl: (q) => `https://export.indiamart.com/search.php?ss=${encodeURIComponent(q)}`,
    link: /(?:indiamart\.com)?\/proddetail\/[^"?#]*?-?(\d{8,})\.html/, detailUrl: (id) => `https://www.indiamart.com/proddetail/-${id}.html`, price: INR, healthQuery: "bluetooth earphones" }),
  makeDef({ id: "in-tradeindia", name: "TradeIndia", country: "in", currency: "INR", language: "en", role: "source", hosts: ["*.tradeindia.com"],
    searchUrl: (q, p) => `https://www.tradeindia.com/search.html?keyword=${encodeURIComponent(q)}${p > 1 ? `&page=${p}` : ""}`,
    link: /(?:tradeindia\.com)?\/products\/[^"?#]*?(\d{6,})\.html/, detailUrl: (id) => `https://www.tradeindia.com/products/-${id}.html`, price: INR, healthQuery: "bluetooth earphones" }),
  makeDef({ id: "id-tokopedia", name: "Tokopedia", country: "id", currency: "IDR", language: "id", role: "both", hosts: ["*.tokopedia.com"],
    searchUrl: (q, p) => `https://www.tokopedia.com/search?q=${encodeURIComponent(q)}${p > 1 ? `&page=${p}` : ""}`,
    link: /tokopedia\.com\/([a-z0-9-]+\/[a-z0-9-]+)(?:[?#]|$)/, detailUrl: (id) => `https://www.tokopedia.com/${id}`, price: IDR, sold: /((?:\d+(?:[.,]\d+)?)(?:rb)?\+?)\s*terjual/i, healthQuery: "earphone bluetooth" }),
  makeDef({ id: "id-shopee", name: "Shopee ID", country: "id", currency: "IDR", language: "id", role: "both", hosts: ["*.shopee.co.id"],
    searchUrl: (q, p) => `https://shopee.co.id/search?keyword=${encodeURIComponent(q)}${p > 1 ? `&page=${p - 1}` : ""}`,
    link: /shopee\.co\.id\/[^"?#]*?-i\.(\d+\.\d+)/, detailUrl: (id) => `https://shopee.co.id/product/${id.split(".")[0]}/${id.split(".")[1]}`, price: IDR, sold: /((?:\d+(?:[.,]\d+)?)(?:rb)?\+?)\s*terjual/i, healthQuery: "earphone bluetooth", captchaMarkers: ["verify", "captcha"] }),
  makeDef({ id: "th-lazada", name: "Lazada TH", country: "th", currency: "THB", language: "th", role: "both", hosts: ["*.lazada.co.th"],
    searchUrl: (q, p) => `https://www.lazada.co.th/catalog/?q=${encodeURIComponent(q)}${p > 1 ? `&page=${p}` : ""}`,
    link: /(?:lazada\.co\.th)?\/products\/[^"?#]*?-i(\d+)/, detailUrl: (id) => `https://www.lazada.co.th/products/-i${id}.html`, price: THB, healthQuery: "bluetooth earphone" }),
  // Doğu Asya nişleri
  makeDef({ id: "jp-rakuten", name: "Rakuten", country: "jp", currency: "JPY", language: "ja", role: "both", hosts: ["*.rakuten.co.jp"],
    searchUrl: (q, p) => `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(q)}/${p > 1 ? `?p=${p}` : ""}`,
    link: /item\.rakuten\.co\.jp\/([a-z0-9-]+\/[a-z0-9-]+)\//, detailUrl: (id) => `https://item.rakuten.co.jp/${id}/`, price: JPY, healthQuery: "ワイヤレスイヤホン" }),
  makeDef({ id: "jp-mercari", name: "Mercari", country: "jp", currency: "JPY", language: "ja", role: "both", hosts: ["*.mercari.com"],
    searchUrl: (q) => `https://www.mercari.com/search/?keyword=${encodeURIComponent(q)}`,
    link: /(?:mercari\.com)?\/(?:us\/)?item\/(m\d+)/, detailUrl: (id) => `https://www.mercari.com/us/item/${id}/`, price: JPY, healthQuery: "ワイヤレスイヤホン" }),
  makeDef({ id: "jp-yahooauctions", name: "Yahoo Auctions", country: "jp", currency: "JPY", language: "ja", role: "both", hosts: ["*.auctions.yahoo.co.jp"],
    searchUrl: (q, p) => `https://auctions.yahoo.co.jp/search/search?p=${encodeURIComponent(q)}${p > 1 ? `&b=${(p - 1) * 50 + 1}` : ""}`,
    link: /auctions\.yahoo\.co\.jp\/jp\/auction\/([a-z]\d+)/, detailUrl: (id) => `https://page.auctions.yahoo.co.jp/jp/auction/${id}`, price: JPY, healthQuery: "ワイヤレスイヤホン" }),
  makeDef({ id: "kr-coupang", name: "Coupang", country: "kr", currency: "KRW", language: "ko", role: "both", hosts: ["*.coupang.com"],
    searchUrl: (q, p) => `https://www.coupang.com/np/search?q=${encodeURIComponent(q)}${p > 1 ? `&page=${p}` : ""}`,
    link: /coupang\.com\/vp\/products\/(\d+)/, detailUrl: (id) => `https://www.coupang.com/vp/products/${id}`, price: KRW, healthQuery: "블루투스 이어폰" }),
  makeDef({ id: "kr-gmarket", name: "Gmarket", country: "kr", currency: "KRW", language: "ko", role: "both", hosts: ["*.gmarket.co.kr"],
    searchUrl: (q, p) => `https://browse.gmarket.co.kr/search?keyword=${encodeURIComponent(q)}${p > 1 ? `&p=${p}` : ""}`,
    link: /(?:gmarket\.co\.kr)?[^"?#]*?(?:goodscode|goodsCode)=(\d+)/, detailUrl: (id) => `https://item.gmarket.co.kr/Item?goodscode=${id}`, price: KRW, healthQuery: "블루투스 이어폰" }),
  // Satış pazarları
  makeDef({ id: "de-amazon", name: "Amazon DE", country: "de", currency: "EUR", language: "de", role: "target", hosts: ["*.amazon.de"],
    searchUrl: (q, p) => `https://www.amazon.de/s?k=${encodeURIComponent(q)}${p > 1 ? `&page=${p}` : ""}`,
    link: /\/dp\/([A-Z0-9]{10})/, detailUrl: (id) => `https://www.amazon.de/dp/${id}`, price: EUR, titleSelectors: ["h2 span", "h2"], healthQuery: "bluetooth kopfhörer", captchaMarkers: ["captcha", "api-services-support@amazon.com"] }),
  makeDef({ id: "us-amazon", name: "Amazon US", country: "us", currency: "USD", language: "en", role: "target", hosts: ["*.amazon.com"],
    searchUrl: (q, p) => `https://www.amazon.com/s?k=${encodeURIComponent(q)}${p > 1 ? `&page=${p}` : ""}`,
    link: /\/dp\/([A-Z0-9]{10})/, detailUrl: (id) => `https://www.amazon.com/dp/${id}`, price: USD, titleSelectors: ["h2 span", "h2"], healthQuery: "bluetooth earbuds", captchaMarkers: ["captcha", "api-services-support@amazon.com"] }),
  makeDef({ id: "gb-amazon", name: "Amazon UK", country: "gb", currency: "GBP", language: "en", role: "target", hosts: ["*.amazon.co.uk"],
    searchUrl: (q, p) => `https://www.amazon.co.uk/s?k=${encodeURIComponent(q)}${p > 1 ? `&page=${p}` : ""}`,
    link: /\/dp\/([A-Z0-9]{10})/, detailUrl: (id) => `https://www.amazon.co.uk/dp/${id}`, price: GBP, titleSelectors: ["h2 span", "h2"], healthQuery: "bluetooth earbuds", captchaMarkers: ["captcha", "api-services-support@amazon.com"] }),
  makeDef({ id: "us-ebay", name: "eBay", country: "us", currency: "USD", language: "en", role: "target", hosts: ["*.ebay.com"],
    searchUrl: (q, p) => `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}${p > 1 ? `&_pgn=${p}` : ""}`,
    link: /(?:ebay\.com)?\/itm\/(?:[^"?#]*?\/)?(\d{9,})/, detailUrl: (id) => `https://www.ebay.com/itm/${id}`, price: USD, sold: SOLD_EN, healthQuery: "bluetooth earbuds" }),
  makeDef({ id: "us-walmart", name: "Walmart", country: "us", currency: "USD", language: "en", role: "target", hosts: ["*.walmart.com"],
    searchUrl: (q, p) => `https://www.walmart.com/search?q=${encodeURIComponent(q)}${p > 1 ? `&page=${p}` : ""}`,
    link: /(?:walmart\.com)?\/ip\/[^"?#]*?\/(\d{6,})/, detailUrl: (id) => `https://www.walmart.com/ip/${id}`, price: USD, healthQuery: "bluetooth earbuds", captchaMarkers: ["Robot or human", "captcha"] }),
  makeDef({ id: "us-temu", name: "Temu", country: "us", currency: "USD", language: "en", role: "target", hosts: ["*.temu.com"],
    searchUrl: (q) => `https://www.temu.com/search_result.html?search_key=${encodeURIComponent(q)}`,
    link: /(?:temu\.com)?\/[^"?#]*?-g-(\d+)\.html/, detailUrl: (id) => `https://www.temu.com/g-${id}.html`, price: USD, sold: SOLD_EN, healthQuery: "bluetooth earbuds" }),
  makeDef({ id: "ae-noon", name: "Noon", country: "ae", currency: "AED", language: "en", role: "target", hosts: ["*.noon.com"],
    searchUrl: (q, p) => `https://www.noon.com/uae-en/search/?q=${encodeURIComponent(q)}${p > 1 ? `&page=${p}` : ""}`,
    link: /\/(N\d{6,}V)\/p\//, detailUrl: (id) => `https://www.noon.com/uae-en/${id}/p/`, price: AED, healthQuery: "bluetooth earbuds" }),
  makeDef({ id: "ru-ozon", name: "Ozon", country: "ru", currency: "RUB", language: "ru", role: "target", hosts: ["*.ozon.ru"],
    searchUrl: (q, p) => `https://www.ozon.ru/search/?text=${encodeURIComponent(q)}${p > 1 ? `&page=${p}` : ""}`,
    link: /(?:ozon\.ru)?\/product\/[^"?#]*?(\d{6,})\/?(?:[?#]|$)/, detailUrl: (id) => `https://www.ozon.ru/product/-${id}/`, price: RUB, healthQuery: "беспроводные наушники", captchaMarkers: ["Доступ ограничен", "captcha"] }),
  makeDef({ id: "ru-wildberries", name: "Wildberries", country: "ru", currency: "RUB", language: "ru", role: "target", hosts: ["*.wildberries.ru"],
    searchUrl: (q, p) => `https://www.wildberries.ru/catalog/0/search.aspx?search=${encodeURIComponent(q)}${p > 1 ? `&page=${p}` : ""}`,
    link: /(?:wildberries\.ru)?\/catalog\/(\d+)\/detail/, detailUrl: (id) => `https://www.wildberries.ru/catalog/${id}/detail.aspx`, price: RUB, healthQuery: "беспроводные наушники" }),
];
