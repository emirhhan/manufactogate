/**
 * Cross-store supplier identity (PLAN §3.4 "Çapraz mağaza eşleme"): the same factory usually runs
 * one storefront per market (1688 in Chinese, Alibaba.com / Made-in-China in English, an AliExpress
 * "Official Store"). This module folds storefront names, reads locations in Chinese and Latin
 * script, and merges storefronts that agree on name, location and the model numbers they sell.
 * Pure core: no adapter dependency, no network.
 */
import { foldTr } from "../fingerprint/turkish";
import { modelNumbers } from "../fingerprint/text";
import { keyOf } from "../match/cluster";
import { unitPriceNormalized, type CurrencyCode, type MarketId, type NormalizedBadge, type RawListing, type RawSupplier } from "../model";
import { traceScore, type TraceResult } from "./trace";

/** One storefront: a supplier as seen on one market. */
export interface Storefront {
  key: string;
  market: MarketId;
  supplierId?: string;
  name?: string;
  folded: FoldedSupplierName;
  location?: FoldedLocation;
  listings: RawListing[];
  modelNumbers: string[];
}

/** Why two storefronts were merged. */
export interface MergeReason {
  /** Storefront keys that were joined. */
  pair: [string, string];
  /** 0..1 strength of the evidence. */
  confidence: number;
  /** Turkish, for the supplier card. */
  reasons: string[];
}

export interface SupplierIdentity {
  /** Stable key: the storefront key of the first (lowest market/id) member. */
  key: string;
  /** Distinct storefront names as the markets show them. */
  names: string[];
  markets: MarketId[];
  /** "market:id" keys of every listing the identity sells. */
  listingKeys: string[];
  /** Distinct locations as shown, plus the canonical city/province keys. */
  locations: string[];
  /** Per-currency unit price range across the identity's listings. */
  priceSpan: Record<CurrencyCode, { min: number; max: number }>;
  /** Best factory likelihood among the identity's listings. */
  bestTrace: TraceResult;
  storefronts: Storefront[];
  /** Evidence for every merge that formed this identity; empty for a single storefront. */
  merges: MergeReason[];
  /** 1 for a single storefront, otherwise the weakest merge confidence on the path. */
  confidence: number;
}

/* ---------------------------------------------------------------- names ---- */

export interface FoldedSupplierName {
  /** Whole folded name with legal form, city prefix and store suffix removed. */
  core: string;
  /** Distinctive latin tokens (brand-like words: not legal forms, not industry words, not cities). */
  tokens: string[];
  /** Distinctive CJK core (name without 市/有限公司/旗舰店…), empty when the name is latin. */
  cjk: string;
  /** City or province found inside the name ("深圳市…", "Shenzhen … Co., Ltd."). */
  placeKey?: string;
}

/** Legal forms and store suffixes (Chinese), stripped before comparing names. */
const LEGAL_CJK_RE = /股份有限公司|有限责任公司|有限公司|责任公司|集团公司|公司|工厂|厂|旗舰店|专营店|专卖店|直营店|官方店|企业店|网店|小店|店铺|店/g;

/** Legal forms and store suffixes (latin, already folded to ASCII lower case), bounded so "Texas" keeps its "as". */
const LEGAL_LATIN_RE = new RegExp(
  "(?<![a-z0-9])(?:" +
    [
      "co\\.?,?\\s*ltd\\.?", "co\\.?\\s*limited", "company limited", "limited liability company", "limited sirketi", "limited", "ltd\\.?\\s*sti\\.?", "ltd\\.?", "llc", "inc\\.?", "corp\\.?", "corporation", "gmbh", "s\\.?a\\.?s\\.?", "s\\.?a\\.?", "b\\.?v\\.?", "pvt\\.?", "private", "plc",
      "official store", "official shop", "flagship store", "online store", "store", "shop", "magazasi", "magaza",
      "a\\.?s\\.?", "san\\.?\\s*(?:ve|&)?\\s*tic\\.?", "sanayi\\s*(?:ve|&)?\\s*ticaret", "sanayi", "ticaret", "dis ticaret", "ithalat", "ihracat", "pazarlama",
    ].join("|") +
    ")(?![a-z0-9])",
  "g",
);

/** Industry words that say what a company does, not who it is. */
const GENERIC_TOKENS = new Set([
  "co", "ltd", "inc", "llc", "corp", "gmbh", "plc", "pvt", "sas",
  "technology", "technologies", "tech", "electronic", "electronics", "electric", "industrial", "industry", "industries", "trading", "trade", "international", "intl", "import", "export", "group", "manufacturing", "manufacture", "manufacturer", "products", "product", "supply", "supplies", "supplier", "development", "science", "hardware", "plastic", "plastics", "garment", "garments", "apparel", "textile", "textiles", "machinery", "machine", "equipment", "toys", "toy", "home", "household", "houseware", "housewares", "gifts", "gift", "crafts", "craft", "arts", "art", "commerce", "ecommerce", "commercial", "global", "world", "china", "official", "the", "and", "of", "new", "best", "top", "good", "digital", "smart", "sports", "sport", "outdoor", "fashion", "beauty", "cosmetics", "cosmetic", "packaging", "printing", "lighting", "optical", "medical", "auto", "automotive", "parts", "accessories", "accessory", "bags", "bag", "shoes", "shoe", "furniture", "kitchen", "pet", "baby", "jewelry", "jewellery", "watch", "watches",
  // Turkish
  "elektronik", "teknoloji", "tekstil", "giyim", "aksesuar", "ev", "yasam", "mobilya", "kozmetik", "ithalat", "ihracat", "ticaret", "sanayi", "pazarlama", "dis", "ic", "ve", "san", "tic", "ltd", "sti", "as", "limited", "sirketi", "grup", "market",
  // Chinese industry words (as whole-string pieces, see cjkCore)
]);

const ZH_INDUSTRY = ["科技", "电子", "实业", "贸易", "商贸", "工贸", "制品", "制造", "国际", "集团", "工业", "用品", "百货", "日用品", "服饰", "服装", "鞋业", "箱包", "塑料", "五金", "玩具", "电器", "照明", "家居", "包装", "进出口", "网络", "信息", "数码", "智能", "新材料", "材料", "机械", "设备", "汽车", "配件", "化妆品", "医疗", "器械", "礼品", "工艺品", "文具", "母婴", "宠物"];

/** Chinese ↔ pinyin table for provinces and manufacturing cities (enough for cross-script location agreement). */
const PLACES: { key: string; level: "city" | "province"; province?: string; forms: string[] }[] = [
  { key: "guangdong", level: "province", forms: ["广东", "guangdong", "canton"] },
  { key: "zhejiang", level: "province", forms: ["浙江", "zhejiang"] },
  { key: "jiangsu", level: "province", forms: ["江苏", "jiangsu"] },
  { key: "fujian", level: "province", forms: ["福建", "fujian"] },
  { key: "shandong", level: "province", forms: ["山东", "shandong"] },
  { key: "hebei", level: "province", forms: ["河北", "hebei"] },
  { key: "henan", level: "province", forms: ["河南", "henan"] },
  { key: "hubei", level: "province", forms: ["湖北", "hubei"] },
  { key: "hunan", level: "province", forms: ["湖南", "hunan"] },
  { key: "sichuan", level: "province", forms: ["四川", "sichuan"] },
  { key: "anhui", level: "province", forms: ["安徽", "anhui"] },
  { key: "jiangxi", level: "province", forms: ["江西", "jiangxi"] },
  { key: "shanghai", level: "province", forms: ["上海", "shanghai"] },
  { key: "beijing", level: "province", forms: ["北京", "beijing"] },
  { key: "tianjin", level: "province", forms: ["天津", "tianjin"] },
  { key: "chongqing", level: "province", forms: ["重庆", "chongqing"] },
  { key: "shenzhen", level: "city", province: "guangdong", forms: ["深圳", "shenzhen"] },
  { key: "dongguan", level: "city", province: "guangdong", forms: ["东莞", "dongguan"] },
  { key: "guangzhou", level: "city", province: "guangdong", forms: ["广州", "guangzhou"] },
  { key: "foshan", level: "city", province: "guangdong", forms: ["佛山", "foshan"] },
  { key: "zhongshan", level: "city", province: "guangdong", forms: ["中山", "zhongshan"] },
  { key: "huizhou", level: "city", province: "guangdong", forms: ["惠州", "huizhou"] },
  { key: "zhuhai", level: "city", province: "guangdong", forms: ["珠海", "zhuhai"] },
  { key: "jiangmen", level: "city", province: "guangdong", forms: ["江门", "jiangmen"] },
  { key: "shantou", level: "city", province: "guangdong", forms: ["汕头", "shantou"] },
  { key: "jieyang", level: "city", province: "guangdong", forms: ["揭阳", "jieyang"] },
  { key: "chaozhou", level: "city", province: "guangdong", forms: ["潮州", "chaozhou"] },
  { key: "zhaoqing", level: "city", province: "guangdong", forms: ["肇庆", "zhaoqing"] },
  { key: "yiwu", level: "city", province: "zhejiang", forms: ["义乌", "yiwu"] },
  { key: "jinhua", level: "city", province: "zhejiang", forms: ["金华", "jinhua"] },
  { key: "yongkang", level: "city", province: "zhejiang", forms: ["永康", "yongkang"] },
  { key: "hangzhou", level: "city", province: "zhejiang", forms: ["杭州", "hangzhou"] },
  { key: "ningbo", level: "city", province: "zhejiang", forms: ["宁波", "ningbo"] },
  { key: "cixi", level: "city", province: "zhejiang", forms: ["慈溪", "cixi"] },
  { key: "yuyao", level: "city", province: "zhejiang", forms: ["余姚", "yuyao"] },
  { key: "wenzhou", level: "city", province: "zhejiang", forms: ["温州", "wenzhou"] },
  { key: "taizhou", level: "city", province: "zhejiang", forms: ["台州", "taizhou"] },
  { key: "shaoxing", level: "city", province: "zhejiang", forms: ["绍兴", "shaoxing"] },
  { key: "jiaxing", level: "city", province: "zhejiang", forms: ["嘉兴", "jiaxing"] },
  { key: "huzhou", level: "city", province: "zhejiang", forms: ["湖州", "huzhou"] },
  { key: "suzhou", level: "city", province: "jiangsu", forms: ["苏州", "suzhou"] },
  { key: "nanjing", level: "city", province: "jiangsu", forms: ["南京", "nanjing"] },
  { key: "wuxi", level: "city", province: "jiangsu", forms: ["无锡", "wuxi"] },
  { key: "changzhou", level: "city", province: "jiangsu", forms: ["常州", "changzhou"] },
  { key: "nantong", level: "city", province: "jiangsu", forms: ["南通", "nantong"] },
  { key: "xuzhou", level: "city", province: "jiangsu", forms: ["徐州", "xuzhou"] },
  { key: "xiamen", level: "city", province: "fujian", forms: ["厦门", "xiamen"] },
  { key: "quanzhou", level: "city", province: "fujian", forms: ["泉州", "quanzhou"] },
  { key: "jinjiang", level: "city", province: "fujian", forms: ["晋江", "jinjiang"] },
  { key: "fuzhou", level: "city", province: "fujian", forms: ["福州", "fuzhou"] },
  { key: "putian", level: "city", province: "fujian", forms: ["莆田", "putian"] },
  { key: "qingdao", level: "city", province: "shandong", forms: ["青岛", "qingdao"] },
  { key: "jinan", level: "city", province: "shandong", forms: ["济南", "jinan"] },
  { key: "linyi", level: "city", province: "shandong", forms: ["临沂", "linyi"] },
  { key: "yantai", level: "city", province: "shandong", forms: ["烟台", "yantai"] },
  { key: "shijiazhuang", level: "city", province: "hebei", forms: ["石家庄", "shijiazhuang"] },
  { key: "baoding", level: "city", province: "hebei", forms: ["保定", "baoding"] },
  { key: "langfang", level: "city", province: "hebei", forms: ["廊坊", "langfang"] },
  { key: "zhengzhou", level: "city", province: "henan", forms: ["郑州", "zhengzhou"] },
  { key: "wuhan", level: "city", province: "hubei", forms: ["武汉", "wuhan"] },
  { key: "changsha", level: "city", province: "hunan", forms: ["长沙", "changsha"] },
  { key: "chengdu", level: "city", province: "sichuan", forms: ["成都", "chengdu"] },
  { key: "hefei", level: "city", province: "anhui", forms: ["合肥", "hefei"] },
  { key: "nanchang", level: "city", province: "jiangxi", forms: ["南昌", "nanchang"] },
  { key: "xian", level: "city", province: "shaanxi", forms: ["西安", "xian", "xi'an"] },
  { key: "shaanxi", level: "province", forms: ["陕西", "shaanxi"] },
  { key: "hongkong", level: "city", province: "hongkong", forms: ["香港", "hong kong", "hongkong", "hk"] },
  // Türkiye
  { key: "turkiye", level: "province", forms: ["türkiye", "turkiye", "turkey"] },
  { key: "istanbul", level: "city", province: "turkiye", forms: ["istanbul"] },
  { key: "izmir", level: "city", province: "turkiye", forms: ["izmir"] },
  { key: "ankara", level: "city", province: "turkiye", forms: ["ankara"] },
  { key: "bursa", level: "city", province: "turkiye", forms: ["bursa"] },
  { key: "denizli", level: "city", province: "turkiye", forms: ["denizli"] },
  { key: "gaziantep", level: "city", province: "turkiye", forms: ["gaziantep"] },
  { key: "konya", level: "city", province: "turkiye", forms: ["konya"] },
  { key: "kayseri", level: "city", province: "turkiye", forms: ["kayseri"] },
  { key: "antalya", level: "city", province: "turkiye", forms: ["antalya"] },
  // India
  { key: "india", level: "province", forms: ["india", "印度"] },
  { key: "delhi", level: "city", province: "india", forms: ["delhi", "new delhi"] },
  { key: "mumbai", level: "city", province: "india", forms: ["mumbai"] },
  { key: "surat", level: "city", province: "india", forms: ["surat"] },
  { key: "ahmedabad", level: "city", province: "india", forms: ["ahmedabad"] },
  { key: "jaipur", level: "city", province: "india", forms: ["jaipur"] },
  { key: "ludhiana", level: "city", province: "india", forms: ["ludhiana"] },
  { key: "tiruppur", level: "city", province: "india", forms: ["tiruppur", "tirupur"] },
];

const PLACE_BY_FORM = new Map<string, (typeof PLACES)[number]>();
for (const p of PLACES) for (const f of p.forms) PLACE_BY_FORM.set(f, p);
const PLACE_FORMS_CJK = PLACES.flatMap((p) => p.forms.filter((f) => /[㐀-鿿]/.test(f)).map((f) => ({ form: f, p })));
const PLACE_FORMS_LATIN_RE = new RegExp(
  `\\b(${PLACES.flatMap((p) => p.forms.filter((f) => !/[㐀-鿿]/.test(f))).map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).sort((a, b) => b.length - a.length).join("|")})\\b`,
  "g",
);

const CJK_RE = /[㐀-鿿]/;

/**
 * Folds a storefront name so that "深圳市奥鑫科技有限公司", "奥鑫科技旗舰店",
 * "Shenzhen Aoxin Technology Co., Ltd." and "AOXIN Official Store" become comparable.
 */
export function foldSupplierName(name: string): FoldedSupplierName {
  const raw = name.trim();
  if (!raw) return { core: "", tokens: [], cjk: "" };
  let placeKey: string | undefined;
  // Chinese: strip a leading place ("深圳市", "广东省东莞市"), legal forms and industry words.
  let cjk = "";
  if (CJK_RE.test(raw)) {
    let s = raw.replace(/[\s()（）【】[\]「」·•\-_,.，。]+/g, "");
    let moved = true;
    while (moved) {
      moved = false;
      for (const { form, p } of PLACE_FORMS_CJK) {
        if (s.startsWith(form)) {
          s = s.slice(form.length).replace(/^(省|市|区|县|镇)/, "");
          if (!placeKey || p.level === "city") placeKey = p.key;
          moved = true;
        }
      }
    }
    s = s.replace(LEGAL_CJK_RE, "");
    for (const w of ZH_INDUSTRY) s = s.split(w).join("");
    cjk = s.replace(/[a-z0-9]+/gi, "").trim();
  }
  // Latin: fold, drop legal forms, places and industry words.
  let latin = foldTr(raw).replace(/[㐀-鿿぀-ヿ가-힯]+/g, " ");
  latin = latin.replace(LEGAL_LATIN_RE, " ");
  latin = latin.replace(PLACE_FORMS_LATIN_RE, (m) => {
    const p = PLACE_BY_FORM.get(m);
    if (p && (!placeKey || p.level === "city")) placeKey = p.key;
    return " ";
  });
  const tokens = latin
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !GENERIC_TOKENS.has(t) && !/^\d+$/.test(t));
  const core = [...tokens, cjk].filter(Boolean).join(" ");
  return { core, tokens, cjk, ...(placeKey ? { placeKey } : {}) };
}

/* ------------------------------------------------------------ locations ---- */

export interface FoldedLocation {
  raw: string;
  city?: string;
  province?: string;
}

/** Reads "广东 深圳", "Shenzhen, Guangdong, China", "İstanbul / Türkiye" into canonical keys. */
export function foldLocation(location: string): FoldedLocation {
  const out: FoldedLocation = { raw: location.trim() };
  if (!out.raw) return out;
  // Chinese addresses go province → city → district (the last city wins); latin ones go city → province (the first wins).
  const hits: { p: (typeof PLACES)[number]; pos: number }[] = [];
  for (const { form, p } of PLACE_FORMS_CJK) {
    const i = location.indexOf(form);
    if (i >= 0) hits.push({ p, pos: -i });
  }
  const folded = foldTr(location);
  for (const m of folded.matchAll(PLACE_FORMS_LATIN_RE)) {
    const p = PLACE_BY_FORM.get(m[1]!);
    if (p) hits.push({ p, pos: m.index });
  }
  hits.sort((a, b) => a.pos - b.pos);
  for (const { p } of hits) {
    if (p.level === "city") {
      out.city ??= p.key;
      if (p.province) out.province ??= p.province;
    } else out.province ??= p.key;
  }
  return out;
}

export type LocationAgreement = "city" | "province" | "conflict" | "unknown";

export function locationAgreement(a: FoldedLocation | undefined, b: FoldedLocation | undefined): LocationAgreement {
  if (!a || !b) return "unknown";
  if (a.city && b.city) return a.city === b.city ? "city" : "conflict";
  if (a.province && b.province) {
    if (a.province !== b.province) return "conflict";
    return "province";
  }
  return "unknown";
}

/* --------------------------------------------------------------- merge ---- */

export type NameRelation = "exact" | "partial" | "none";

/** How two folded names relate: same core, a shared distinctive token (or CJK core containment), or nothing. */
export function nameRelation(a: FoldedSupplierName, b: FoldedSupplierName): NameRelation {
  if (!a.core || !b.core) return "none";
  if (a.core === b.core) return "exact";
  const cjkShared = a.cjk && b.cjk && a.cjk.length >= 2 && b.cjk.length >= 2 && (a.cjk.includes(b.cjk) || b.cjk.includes(a.cjk));
  const latinShared = a.tokens.filter((t) => b.tokens.includes(t));
  const distinctive = latinShared.filter((t) => t.length >= 3);
  if (cjkShared && (!a.tokens.length || !b.tokens.length || distinctive.length)) return "exact";
  // Every distinctive token of the shorter name appears in the longer one: "Aoxin Technology" ~ "AOXIN Store".
  // A lone shared token against a two-word name ("Aoxin Mingda") is only partial.
  const minTokens = Math.min(a.tokens.length, b.tokens.length);
  const maxTokens = Math.max(a.tokens.length, b.tokens.length);
  if (minTokens > 0 && distinctive.length === minTokens && (minTokens >= 2 || maxTokens === 1) && distinctive.join(" ").length >= 4) return "exact";
  if (distinctive.length >= 1 || cjkShared) return "partial";
  return "none";
}

/** Minimum confidence for a merge; weaker evidence leaves the storefronts apart. */
export const SUPPLIER_MERGE_THRESHOLD = 0.6;

export interface MergeEvidence {
  confidence: number;
  reasons: string[];
  name: NameRelation;
  location: LocationAgreement;
  sharedModels: string[];
}

/** Evidence that two storefronts belong to the same company. */
export function compareStorefronts(a: Storefront, b: Storefront): MergeEvidence {
  const name = nameRelation(a.folded, b.folded);
  const location = locationAgreement(a.location, b.location);
  const sharedModels = a.modelNumbers.filter((m) => b.modelNumbers.includes(m));
  const reasons: string[] = [];
  let confidence = 0;
  if (name === "exact") {
    confidence = location === "conflict" ? 0.55 : location === "unknown" ? 0.9 : 0.97;
    reasons.push(`mağaza adı aynı (${a.folded.core})`);
  } else if (name === "partial") {
    const shared = a.folded.tokens.filter((t) => b.folded.tokens.includes(t) && t.length >= 3);
    reasons.push(`mağaza adında ortak sözcük (${shared.length ? shared.join(", ") : a.folded.cjk || b.folded.cjk})`);
    if (location === "city") confidence = 0.85;
    else if (location === "province") confidence = 0.7;
    else if (location === "unknown") confidence = sharedModels.length ? 0.75 : 0.45;
    else confidence = 0.3;
  } else if (sharedModels.length >= 2 && location === "city" && a.market !== b.market) {
    confidence = 0.65;
  }
  if (location === "city") reasons.push(`konum aynı (${a.location?.city})`);
  else if (location === "province") reasons.push(`aynı bölge (${a.location?.province})`);
  else if (location === "conflict") reasons.push(`konum farklı (${a.location?.city ?? a.location?.province} / ${b.location?.city ?? b.location?.province})`);
  if (sharedModels.length) {
    reasons.push(`ortak model numarası (${sharedModels.slice(0, 3).join(", ")})${a.market !== b.market ? ", farklı pazarlarda" : ""}`);
    if (confidence > 0 && confidence < 0.97) confidence = Math.min(0.97, confidence + 0.05 * Math.min(sharedModels.length, 2));
  }
  if (confidence < SUPPLIER_MERGE_THRESHOLD) reasons.length = 0;
  return { confidence: Math.round(confidence * 100) / 100, reasons, name, location, sharedModels };
}

/** Groups listings into storefronts (one per market + supplier id, or per folded name when the market gives no id). */
export function storefrontsOf(listings: RawListing[]): Storefront[] {
  const map = new Map<string, Storefront>();
  for (const l of listings) {
    const name = l.supplierName?.trim();
    const folded = foldSupplierName(name ?? "");
    const idPart = l.supplierId?.trim() || (folded.core ? `name:${folded.core}` : `listing:${l.id}`);
    const key = `${l.market}:${idPart}`;
    let s = map.get(key);
    if (!s) {
      s = { key, market: l.market, ...(l.supplierId ? { supplierId: l.supplierId } : {}), ...(name ? { name } : {}), folded, listings: [], modelNumbers: [] };
      map.set(key, s);
    }
    s.listings.push(l);
    if (!s.name && name) {
      s.name = name;
      s.folded = folded;
    }
    const loc = l.location?.trim();
    if (loc && !s.location) s.location = foldLocation(loc);
    for (const m of modelNumbers(l.title)) if (!s.modelNumbers.includes(m)) s.modelNumbers.push(m);
  }
  for (const s of map.values()) {
    // A city inside the company name ("深圳市…", "Shenzhen … Co., Ltd.") stands in for a missing location.
    if (!s.location?.city && s.folded.placeKey) {
      const p = PLACES.find((x) => x.key === s.folded.placeKey);
      if (p) s.location = { raw: s.location?.raw ?? s.folded.placeKey, ...(p.level === "city" ? { city: p.key, ...(p.province ? { province: p.province } : {}) } : { province: p.key }) };
    }
  }
  return [...map.values()];
}

export interface MergeOptions {
  /** Badges per listing, for the identity's factory trace. */
  badges?: (l: RawListing) => NormalizedBadge[];
  supplier?: (l: RawListing) => RawSupplier | undefined;
  threshold?: number;
}

/**
 * Merges storefronts across markets into supplier identities. Union-find over pairwise evidence
 * (name, location, shared model numbers); every merge keeps its reasons so the UI can show why
 * "奥鑫科技旗舰店" and "Shenzhen Aoxin Technology Co., Ltd." are one company.
 */
export function mergeSuppliers(listings: RawListing[], opts: MergeOptions = {}): SupplierIdentity[] {
  const fronts = storefrontsOf(listings).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const threshold = opts.threshold ?? SUPPLIER_MERGE_THRESHOLD;
  const parent = fronts.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  const merges = new Map<number, MergeReason[]>();
  for (let i = 0; i < fronts.length; i++) {
    for (let j = i + 1; j < fronts.length; j++) {
      const ev = compareStorefronts(fronts[i]!, fronts[j]!);
      if (ev.confidence < threshold) continue;
      const ri = find(i);
      const rj = find(j);
      const reason: MergeReason = { pair: [fronts[i]!.key, fronts[j]!.key], confidence: ev.confidence, reasons: ev.reasons };
      if (ri === rj) {
        merges.get(ri)!.push(reason);
        continue;
      }
      const target = Math.min(ri, rj);
      const other = Math.max(ri, rj);
      parent[other] = target;
      const list = [...(merges.get(target) ?? []), ...(merges.get(other) ?? []), reason];
      merges.delete(other);
      merges.set(target, list);
    }
  }
  const groups = new Map<number, Storefront[]>();
  fronts.forEach((s, i) => {
    const r = find(i);
    (groups.get(r) ?? groups.set(r, []).get(r)!).push(s);
  });
  const out: SupplierIdentity[] = [];
  for (const [root, members] of groups) {
    const all = members.flatMap((m) => m.listings);
    const priceSpan: SupplierIdentity["priceSpan"] = {};
    let bestTrace: TraceResult = { factory: 0, reasons: [] };
    for (const l of all) {
      const p = unitPriceNormalized(l);
      if (p !== null) {
        const r = priceSpan[l.price.currency] ?? { min: p, max: p };
        r.min = Math.min(r.min, p);
        r.max = Math.max(r.max, p);
        priceSpan[l.price.currency] = r;
      }
      const t = traceScore(l, opts.badges?.(l) ?? [], opts.supplier?.(l));
      if (t.factory > bestTrace.factory || (t.factory === bestTrace.factory && t.reasons.length > bestTrace.reasons.length)) bestTrace = t;
    }
    const reasons = merges.get(root) ?? [];
    const locations = new Set<string>();
    for (const m of members) {
      if (m.location?.raw) locations.add(m.location.raw);
      if (m.location?.city) locations.add(m.location.city);
      else if (m.location?.province) locations.add(m.location.province);
    }
    out.push({
      key: members[0]!.key,
      names: [...new Set(members.map((m) => m.name).filter((n): n is string => !!n))],
      markets: [...new Set(members.map((m) => m.market))],
      listingKeys: all.map((l) => keyOf(l)),
      locations: [...locations],
      priceSpan,
      bestTrace,
      storefronts: members,
      merges: reasons,
      confidence: reasons.length ? Math.round(Math.min(...reasons.map((r) => r.confidence)) * 100) / 100 : 1,
    });
  }
  out.sort((a, b) => b.markets.length - a.markets.length || b.listingKeys.length - a.listingKeys.length || (a.key < b.key ? -1 : 1));
  return out;
}

/** The identity that sells a listing, when `identities` came from mergeSuppliers over it. */
export function identityOf(identities: SupplierIdentity[], listing: Pick<RawListing, "market" | "id">): SupplierIdentity | undefined {
  const k = keyOf(listing);
  return identities.find((i) => i.listingKeys.includes(k));
}
