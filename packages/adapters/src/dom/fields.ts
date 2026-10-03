/**
 * Card-level fields beyond price and title: pack quantity, unit label, ship-from country and
 * variant count. Pure text parsing shared by the card heuristic, the embedded readers and
 * `enrichListing()`. Calibrated against the captured pages listed in docs/CALIBRATION.md § 10.
 */
import { normalizeSpaces } from "./text";

/* ------------------------------------------------------------------------------------------------
 * Units
 * ---------------------------------------------------------------------------------------------- */

/** Single-character CJK counters a price or MOQ is quoted per ("2件装", "500个起购", "1副起购"). */
const CJK_UNIT = "件个只支片双对副套包条瓶盒卷张粒颗箱台把枚袋罐桶组打本根块串";

/** Latin / Cyrillic / Turkish unit words, canonical token second. Longer forms first. */
const UNIT_WORDS: [RegExp, string][] = [
  [/^(?:pieces|piece|pcs|pc)$/i, "pcs"],
  [/^(?:pairs|pair|çift|cift)$/i, "pair"],
  [/^(?:sets|set|takım|takim)$/i, "set"],
  [/^(?:units|unit)$/i, "unit"],
  [/^(?:packs|pack|paket)$/i, "pack"],
  [/^(?:boxes|box|kutu)$/i, "box"],
  [/^(?:cartons|carton|koli)$/i, "carton"],
  [/^(?:bags|bag)$/i, "bag"],
  [/^(?:rolls|roll|rulo)$/i, "roll"],
  [/^(?:dozens|dozen|düzine)$/i, "dozen"],
  [/^(?:kilograms?|kgs?)$/i, "kg"],
  [/^(?:grams?|gr|g)$/i, "g"],
  [/^(?:tons?|tonnes?)$/i, "ton"],
  [/^(?:meters?|metres?|m)$/i, "m"],
  [/^(?:liters?|litres?|l|lt)$/i, "l"],
  [/^(?:adet|adetli|adetlik)$/i, "adet"],
  [/^(?:шт\.?|штук|штуки)$/i, "шт"],
  [/^(?:упак\.?|упаковка|упаковки)$/i, "упак"],
];

/** Canonical unit token for a unit word, or null when the word is not a unit. */
export function normalizeUnit(word: string | null | undefined): string | null {
  const w = (word ?? "").trim().replace(/[.:]+$/, "");
  if (!w) return null;
  if (w.length === 1 && CJK_UNIT.includes(w)) return w;
  // "Piece/Pieces", "Pack/Packs" (TradeIndia) → first alternative.
  const first = w.split("/")[0]!.trim();
  for (const [re, token] of UNIT_WORDS) if (re.test(first)) return token;
  if (/^(?:개|매|팩|個|枚|本|ชิ้น|คู่|pcs|buah|pasang|lusin)$/i.test(first)) return first.toLowerCase();
  return null;
}

const UNIT_WORD_SRC = String.raw`(?:pieces?|pcs|pc|pairs?|sets?|units?|packs?|boxes|box|cartons?|bags?|rolls?|dozens?|kgs?|kilograms?|grams?|tons?|tonnes?|meters?|metres?|liters?|litres?|adet|adetli|çift|takım|paket|kutu|koli|rulo|шт\.?|штук|упак\.?)`;

/**
 * Unit the price or minimum order is quoted per: "Min. order: 200 Pieces" → "pcs",
 * "500个起购" → "个", "₹ 48,000/Piece" → "pcs", "58.00 元/件" → "件", "12 TL / adet" → "adet".
 * Returns null when the text carries no explicit unit.
 */
export function parseUnitLabel(text: string | null | undefined): string | null {
  if (!text) return null;
  const t = normalizeSpaces(text).replace(/\s+/g, " ");
  // "N<unit>起购 / 起批 / 起订 / 起售" and "起订量 N<unit>" (1688, Yiwugo).
  const cjkMoq = new RegExp(String.raw`\d+\s*([${CJK_UNIT}])\s*起(?:购|批|订|售)|起(?:订|批|购)量?[:：]?\s*\d+\s*([${CJK_UNIT}])(?![\p{Script=Han}])`, "u").exec(t);
  if (cjkMoq) return (cjkMoq[1] ?? cjkMoq[2]) as string;
  // "元/件", "¥12.5/套", "/Piece", "per pair", "/ adet", "/kg".
  const perUnit = new RegExp(String.raw`(?:元|[¥￥$€£₺₹₽]|\d|TL|TRY|USD|EUR|GBP|INR|RUB|CNY|RMB|JPY|KRW|IDR|THB|AED)\s*(?:\/|／|\bper\b)\s*([${CJK_UNIT}]|${UNIT_WORD_SRC})(?![\p{L}])`, "iu").exec(t);
  if (perUnit) return normalizeUnit(perUnit[1]);
  // "Min. order: 200 Pieces", "MOQ: 10 pairs", "Minimum Order Quantity 50 Piece/Pieces".
  const moq = new RegExp(String.raw`(?:min(?:imum)?\.?\s*order(?:\s*quantity)?|moq)\s*[:：]?\s*[\d,.]+\s*(${UNIT_WORD_SRC}(?:\/${UNIT_WORD_SRC})?)(?![\p{L}])`, "iu").exec(t);
  if (moq) return normalizeUnit(moq[1]);
  // "Unit of Price: Piece/Pieces" (TradeIndia rows).
  const labelled = /unit(?: of (?:price|measure))?\s*[:：]\s*([A-Za-z]+(?:\/[A-Za-z]+)?)/i.exec(t);
  if (labelled) return normalizeUnit(labelled[1]);
  return null;
}

/* ------------------------------------------------------------------------------------------------
 * Pack quantity
 * ---------------------------------------------------------------------------------------------- */

export interface PackInfo {
  qty: number;
  /** Unit of the pack members when the wording names one ("2件装" → "件", "10 adet" → "adet"). */
  unit: string | null;
}

/** A number that is the upper end of a range ("50-300pcs") is not a pack size. */
const RANGE_BEFORE = String.raw`(?<!\d\s?[-~–]\s?)`;

const PACK_PATTERNS: { re: RegExp; qty: number; unit?: number | string }[] = [
  // CJK: "2件装", "10个装", "3双入", "5件套", "12支装", "4只装", "2件套装"
  { re: new RegExp(String.raw`${RANGE_BEFORE}(?<![A-Za-z\d.])(\d{1,3})\s*([${CJK_UNIT}])\s*(?:套装|装|入|套)(?![\p{Script=Han}]*起)`, "u"), qty: 1, unit: 2 },
  // "一盒10个", "每套4件" style: unit after count
  { re: new RegExp(String.raw`(?:每|一)(?:盒|包|套|箱|袋)\s*(\d{1,3})\s*([${CJK_UNIT}])`, "u"), qty: 1, unit: 2 },
  // Latin: "Set of 4", "Pack of 12", "Box of 24"
  { re: /\b(?:set|pack|box|case|bag|lot)\s+of\s+(\d{1,3})\b/i, qty: 1, unit: "set" },
  // "4-pack", "12 pack", "10pcs", "2 pairs", "6-piece", "24 count", "50 ct"
  { re: new RegExp(String.raw`${RANGE_BEFORE}(?<![\d.,])(\d{1,3})\s?-?\s?(pieces?|pcs|pc|pairs?|packs?|count|ct|sets?)(?![\p{L}])`, "iu"), qty: 1, unit: 2 },
  // Turkish: "10 adet", "10'lu", "10 lu paket", "5 adetli", "2'li"
  { re: new RegExp(String.raw`${RANGE_BEFORE}(?<![\d.,])(\d{1,3})\s?(?:adetli|adetlik|adet|['’]?\s?l[iıuü]k?)(?![\p{L}])`, "iu"), qty: 1, unit: "adet" },
  // Turkish pairs: "3 çift"
  { re: new RegExp(String.raw`${RANGE_BEFORE}(?<![\d.,])(\d{1,3})\s?(?:çift|cift)(?![\p{L}])`, "iu"), qty: 1, unit: "pair" },
  // Russian: "52 шт", "10 штук"; Indonesian "12 pcs" is covered above
  { re: new RegExp(String.raw`${RANGE_BEFORE}(?<![\d.,])(\d{1,3})\s?(?:шт\.?|штук)(?![\p{L}])`, "iu"), qty: 1, unit: "шт" },
  // Japanese / Korean: "10個入り", "5個セット", "12枚入", "3개입", "2팩"
  { re: new RegExp(String.raw`(?<![\d.,])(\d{1,3})\s?(個|枚|本|개)\s?(?:入り|入|セット|입)`, "u"), qty: 1, unit: 2 },
  // "x5" / "5x" multipliers that are not dimensions ("10x20cm")
  { re: /(?:^|[\s,(])x\s?(\d{1,3})(?![\d.,]|\s?(?:cm|mm|m|inch|in|"|')\b)(?=$|[\s,).])/i, qty: 1 },
  { re: /(?:^|[\s,(])(\d{1,3})x(?=$|[\s,).](?!\s?\d))/i, qty: 1 },
];

/** Minimum-order and sales phrases whose numbers are not pack sizes ("Min. order: 200 Pieces", "500个起购", "1.234 adet satıldı"). */
const NOT_PACK = new RegExp(
  String.raw`(?:min(?:imum)?\.?\s*order(?:\s*quantity)?|moq|起订量|起批量|最小起订量?|minimum sipariş miktarı)\s*[:：]?\s*[\d,.]+\s*\p{L}*|\d+\s*[${CJK_UNIT}]\s*起(?:购|批|订|售)|[\d,.]+\s*(?:adet|pcs|pieces?|шт\.?)\s*(?:satıldı|sold|продано|terjual)`,
  "giu",
);

/** Pack size and unit from a title or card text; null when the text does not describe a pack. */
export function parsePack(text: string | null | undefined): PackInfo | null {
  if (!text) return null;
  const t = normalizeSpaces(text).replace(/\s+/g, " ").replace(NOT_PACK, " ");
  for (const p of PACK_PATTERNS) {
    const m = p.re.exec(t);
    if (!m) continue;
    const qty = parseInt(m[p.qty] ?? "", 10);
    if (!Number.isFinite(qty) || qty < 2 || qty > 500) continue;
    const unit = typeof p.unit === "number" ? normalizeUnit(m[p.unit]) : (p.unit ?? null);
    return { qty, unit };
  }
  return null;
}

/** "2件装" → 2, "Set of 4" → 4, "x5" → 5, "10 adet" → 10; null for single items and ranges ("50-300pcs"). */
export function parsePackQty(text: string | null | undefined): number | null {
  return parsePack(text)?.qty ?? null;
}

/* ------------------------------------------------------------------------------------------------
 * Ship-from country
 * ---------------------------------------------------------------------------------------------- */

/** Chinese provinces, municipalities and manufacturing cities (any script) → "cn". */
const CN_PLACES = /中国|中国大陆|大陆|北京|天津|上海|重庆|河北|山西|辽宁|吉林|黑龙江|江苏|浙江|安徽|福建|江西|山东|河南|湖北|湖南|广东|海南|四川|贵州|云南|陕西|甘肃|青海|内蒙古|广西|西藏|宁夏|新疆|深圳|东莞|义乌|佛山|温州|宁波|苏州|中山|广州|杭州|金华|厦门|泉州|汕头|揭阳|潮州|南京|武汉|成都|西安|青岛|\bChina\b|Mainland|Guangdong|Zhejiang|Jiangsu|Fujian|Shandong|Shenzhen|Dongguan|Yiwu|Foshan|Wenzhou|Ningbo|Suzhou|Zhongshan|Guangzhou|Hangzhou|Jinhua|Xiamen|Quanzhou|Shanghai|Beijing|Çin|Китай|Китая|Tiongkok|Cina|จีน|中国本土/iu;

const COUNTRY_NAMES: [RegExp, string][] = [
  [/香港|Hong ?Kong|Hongkong|Гонконг/i, "hk"],
  [/台湾|臺灣|Taiwan|Tayvan/i, "tw"],
  [/澳门|Macau|Macao/i, "mo"],
  [/Türkiye|Turkiye|Turkey|土耳其|Турция|Турции/i, "tr"],
  [/United States|USA|U\.S\.A?\.?|ABD|美国|США|Amerika Birleşik/i, "us"],
  [/United Kingdom|\bUK\b|Great Britain|England|İngiltere|英国|Великобритания/i, "gb"],
  [/Germany|Deutschland|Almanya|德国|Германия/i, "de"],
  [/Japan|Japonya|日本|Япония/i, "jp"],
  [/South Korea|Korea|Güney Kore|韩国|韓国|대한민국|한국|Корея/i, "kr"],
  [/India|Hindistan|印度|Индия/i, "in"],
  [/Indonesia|Endonezya|印尼|印度尼西亚|Индонезия/i, "id"],
  [/Thailand|Tayland|泰国|ไทย|Таиланд/i, "th"],
  [/Vietnam|Viet Nam|越南|Вьетнам/i, "vn"],
  [/Malaysia|Malezya|马来西亚/i, "my"],
  [/Singapore|Singapur|新加坡/i, "sg"],
  [/Pakistan|巴基斯坦/i, "pk"],
  [/Russia|Rusya|俄罗斯|Россия|России/i, "ru"],
  [/United Arab Emirates|UAE|BAE|Dubai|阿联酋|ОАЭ/i, "ae"],
  [/Saudi Arabia|Suudi|沙特/i, "sa"],
  [/France|Fransa|法国|Франция/i, "fr"],
  [/Italy|Italia|İtalya|意大利|Италия/i, "it"],
  [/Spain|España|İspanya|西班牙|Испания/i, "es"],
  [/Netherlands|Hollanda|荷兰|Нидерланды/i, "nl"],
  [/Belgium|Belçika|比利时|Бельгия/i, "be"],
  [/Poland|Polonya|波兰|Польша/i, "pl"],
  [/Czech|Çekya|捷克|Чехия/i, "cz"],
  [/Brazil|Brasil|Brezilya|巴西|Бразилия/i, "br"],
  [/Mexico|México|Meksika|墨西哥|Мексика/i, "mx"],
  [/Canada|Kanada|加拿大|Канада/i, "ca"],
  [/Australia|Avustralya|澳大利亚|Австралия/i, "au"],
  [/Kazakhstan|Kazakistan|Казахстан/i, "kz"],
  [/Belarus|Беларусь|Беларуси/i, "by"],
];

/** ISO alpha-2 country for a place name (country, Chinese province or city, or an alpha-2 code); null when unknown. */
export function countryOfPlace(place: string | null | undefined): string | null {
  const p = normalizeSpaces(place ?? "").trim();
  if (!p) return null;
  if (/^[A-Za-z]{2}$/.test(p)) {
    const code = p.toLowerCase();
    return code === "uk" ? "gb" : code;
  }
  for (const [re, code] of COUNTRY_NAMES) if (re.test(p)) return code;
  if (CN_PLACES.test(p)) return "cn";
  return null;
}

/** "Ships from", "Gönderim yeri", "发货地", "Отправка из", "Dikirim dari", "Located in" … followed by the place. */
const SHIP_FROM_MARKERS = /(?:ships?\s+from|shipped\s+from|dispatch(?:ed|es)?\s+from|delivery\s+from|located\s+in|item\s+location|gönderim\s+yeri|gönderildiği\s+yer|发货地|发货地址|发货地区|所在地|発送元|発送地|발송지|отправка\s+из|доставка\s+из|dikirim\s+dari|จัดส่งจาก)\s*[:：]?\s*([^·|,;()\n]{2,40})/iu;
/** Bare "from China" / "из Китая" with a known country name (eBay "Free shipping from China"). */
const FROM_COUNTRY = /(?<![\p{L}])(?:from|из|dari|aus)\s+(China|Hong Kong|Türkiye|Turkey|United States|USA|Germany|Japan|Korea|India|Indonesia|Thailand|Vietnam|Malaysia|Singapore|Pakistan|Russia|UAE|Китая|Турции|Германии|Tiongkok)(?![\p{L}])/iu;

/**
 * Ship-from country from card or page text: "Ships from China" → "cn", "Gönderim yeri: Türkiye" → "tr",
 * "发货地 浙江" → "cn". "Ships to …" is a destination and never counts. Null without an explicit marker.
 */
export function parseShipFrom(text: string | null | undefined): string | null {
  if (!text) return null;
  const t = normalizeSpaces(text).replace(/\s+/g, " ");
  const m = SHIP_FROM_MARKERS.exec(t);
  if (m) {
    const place = m[1]!.trim();
    // First one or two words carry the place ("China · 5 colors" was cut at the dot already).
    const direct = countryOfPlace(place) ?? countryOfPlace(place.split(/\s+/).slice(0, 2).join(" ")) ?? countryOfPlace(place.split(/\s+/)[0]);
    if (direct) return direct;
  }
  const f = FROM_COUNTRY.exec(t);
  return f ? countryOfPlace(f[1]) : null;
}

/* ------------------------------------------------------------------------------------------------
 * Variant count
 * ---------------------------------------------------------------------------------------------- */

const VARIANT_RE = /(?<![\d.,])(\d{1,3})\s*(?:colou?rs?|variants?|variations?|options?|sizes?|styles?|(?:farklı\s+)?renk(?:\s+seçeneği)?|varyant|seçenek|beden|boyut|Farben|种颜色|个颜色|款式|色展開|色|가지\s*색상|цвета?|цветов|вариант[аов]*|warna|variasi|สี)(?![\p{L}])/iu;
const PLUS_VARIANT_RE = /\+\s?(\d{1,3})\s*(?:colou?rs?|sizes?|more|renk|boyut|beden|ebat|seçenek|options?|variants?|色|款)/iu;

/** "5 colors", "+3 renk", "2 Farklı Renk", "4色" → number of variants shown on the card; null when absent. */
export function parseVariantCount(text: string | null | undefined): number | null {
  if (!text) return null;
  const t = normalizeSpaces(text).replace(/\s+/g, " ");
  const plus = PLUS_VARIANT_RE.exec(t);
  if (plus) {
    const n = parseInt(plus[1]!, 10);
    // "+3 renk" means three more besides the shown one.
    if (Number.isFinite(n) && n > 0) return n + 1;
  }
  const m = VARIANT_RE.exec(t);
  if (!m) return null;
  const n = parseInt(m[1]!, 10);
  return Number.isFinite(n) && n >= 2 && n <= 999 ? n : null;
}
