import { getLeaves, glossaryName, photoTerms, productFromTitles, type GlossaryTerm, type Leaf } from "@manufactogate/adapters";
import { l2Normalize, type Fingerprint, type ImageInput, type ProductIdentity } from "@manufactogate/core";
import { clipProvider } from "./clip";
import { getSetting, setSetting } from "./db";
import { identifyWithClaude, type ClaudeConfig } from "./claudeIdentify";

/**
 * Names the product in a photo so markets that only search by text get a real query instead of a
 * borrowed seller title. Free path: the in-browser CLIP model compares the photo with the category
 * glossary (≈450 leaves), colours, materials and well-known brands. Optional path: Claude, only
 * when the user entered an API key in Settings.
 */

export interface Brand {
  name: string;
  /** Chinese name shoppers type on Taobao/1688; Latin name when omitted. */
  zh?: string;
}

/** Brands CLIP can recognise from a logo or a signature design. */
export const BRANDS: Brand[] = [
  // Fashion and luxury
  { name: "Hermès", zh: "爱马仕" }, { name: "Chanel", zh: "香奈儿" }, { name: "Louis Vuitton", zh: "路易威登" }, { name: "Gucci", zh: "古驰" },
  { name: "Prada", zh: "普拉达" }, { name: "Dior", zh: "迪奥" }, { name: "Fendi", zh: "芬迪" }, { name: "Burberry", zh: "博柏利" },
  { name: "Balenciaga", zh: "巴黎世家" }, { name: "Versace", zh: "范思哲" }, { name: "Coach", zh: "蔻驰" }, { name: "Michael Kors", zh: "迈克高仕" },
  { name: "Longchamp", zh: "珑骧" }, { name: "Saint Laurent", zh: "圣罗兰" }, { name: "Celine", zh: "思琳" }, { name: "Bottega Veneta", zh: "葆蝶家" },
  { name: "Loewe", zh: "罗意威" }, { name: "Goyard", zh: "戈雅" }, { name: "Givenchy", zh: "纪梵希" }, { name: "Valentino", zh: "华伦天奴" },
  { name: "Chloé", zh: "蔻依" }, { name: "Miu Miu", zh: "缪缪" }, { name: "Armani", zh: "阿玛尼" }, { name: "Kate Spade", zh: "凯特丝蓓" },
  { name: "Tory Burch", zh: "汤丽柏琦" }, { name: "Furla", zh: "芙拉" }, { name: "MCM" }, { name: "Calvin Klein" }, { name: "Tommy Hilfiger" },
  { name: "Ralph Lauren" }, { name: "Lacoste" }, { name: "Levi's", zh: "李维斯" }, { name: "Zara" }, { name: "Uniqlo", zh: "优衣库" },
  { name: "Cartier", zh: "卡地亚" }, { name: "Rolex", zh: "劳力士" }, { name: "Omega", zh: "欧米茄" }, { name: "Tiffany", zh: "蒂芙尼" },
  { name: "Swarovski", zh: "施华洛世奇" }, { name: "Pandora", zh: "潘多拉" }, { name: "Montblanc", zh: "万宝龙" }, { name: "Ray-Ban", zh: "雷朋" },
  { name: "Moncler", zh: "盟可睐" }, { name: "Canada Goose", zh: "加拿大鹅" }, { name: "The North Face", zh: "北面" }, { name: "Rimowa", zh: "日默瓦" },
  { name: "Samsonite", zh: "新秀丽" }, { name: "Tumi", zh: "途明" }, { name: "Fjällräven", zh: "北极狐" }, { name: "Herschel" },
  // Sport
  { name: "Nike", zh: "耐克" }, { name: "Adidas", zh: "阿迪达斯" }, { name: "Puma", zh: "彪马" }, { name: "New Balance", zh: "新百伦" },
  { name: "Converse", zh: "匡威" }, { name: "Vans", zh: "万斯" }, { name: "ASICS", zh: "亚瑟士" }, { name: "Reebok", zh: "锐步" },
  { name: "Under Armour", zh: "安德玛" }, { name: "Skechers", zh: "斯凯奇" }, { name: "Fila", zh: "斐乐" }, { name: "Crocs", zh: "卡骆驰" },
  { name: "Birkenstock", zh: "勃肯" }, { name: "Timberland", zh: "添柏岚" }, { name: "UGG" }, { name: "Salomon", zh: "萨洛蒙" },
  { name: "Columbia", zh: "哥伦比亚" }, { name: "Lululemon", zh: "露露乐蒙" },
  // Helmets and moto gear
  { name: "AGV" }, { name: "Shoei" }, { name: "Arai" }, { name: "HJC" }, { name: "LS2" }, { name: "Shark" }, { name: "Bell" },
  { name: "Nolan" }, { name: "X-Lite" }, { name: "Scorpion" }, { name: "KYT" }, { name: "Caberg" }, { name: "Schuberth" },
  { name: "Alpinestars" }, { name: "Dainese" }, { name: "Fox Racing" }, { name: "Oakley" },
  // Electronics
  { name: "Apple", zh: "苹果" }, { name: "Samsung", zh: "三星" }, { name: "Xiaomi", zh: "小米" }, { name: "Huawei", zh: "华为" },
  { name: "Honor", zh: "荣耀" }, { name: "OnePlus", zh: "一加" }, { name: "OPPO" }, { name: "Sony", zh: "索尼" }, { name: "JBL" },
  { name: "Bose" }, { name: "Marshall", zh: "马歇尔" }, { name: "Beats" }, { name: "Anker", zh: "安克" }, { name: "Baseus", zh: "倍思" },
  { name: "Ugreen", zh: "绿联" }, { name: "Logitech", zh: "罗技" }, { name: "Lenovo", zh: "联想" }, { name: "Dell", zh: "戴尔" },
  { name: "HP", zh: "惠普" }, { name: "Asus", zh: "华硕" }, { name: "Microsoft", zh: "微软" }, { name: "Canon", zh: "佳能" },
  { name: "Nikon", zh: "尼康" }, { name: "DJI", zh: "大疆" }, { name: "GoPro" }, { name: "Garmin", zh: "佳明" }, { name: "Nintendo", zh: "任天堂" },
  { name: "Casio", zh: "卡西欧" }, { name: "Seiko", zh: "精工" }, { name: "Philips", zh: "飞利浦" }, { name: "Dyson", zh: "戴森" },
  { name: "Bosch", zh: "博世" }, { name: "Panasonic", zh: "松下" },
  // Home, kitchen, toys
  { name: "Stanley" }, { name: "YETI" }, { name: "Hydro Flask" }, { name: "Thermos", zh: "膳魔师" }, { name: "Zojirushi", zh: "象印" },
  { name: "Tupperware", zh: "特百惠" }, { name: "Tefal", zh: "特福" }, { name: "Le Creuset", zh: "酷彩" }, { name: "De'Longhi", zh: "德龙" },
  { name: "Nespresso" }, { name: "IKEA", zh: "宜家" }, { name: "Starbucks", zh: "星巴克" }, { name: "LEGO", zh: "乐高" },
  { name: "Disney", zh: "迪士尼" }, { name: "Hello Kitty", zh: "凯蒂猫" }, { name: "Sanrio", zh: "三丽鸥" }, { name: "Pokémon", zh: "宝可梦" },
  { name: "Barbie", zh: "芭比" },
];

/** Prompts that stand for "no brand"; a brand must beat all of them to be named. */
const NO_BRAND = ["a photo of an unbranded product", "a photo of a generic product without a logo", "a photo of a plain product"];

/** Market languages a named product is spelled out in. */
export const QUERY_LANGUAGES = ["tr", "zh", "en", "ja", "ko", "ru", "de", "id", "th"] as const;

/** CLIP's own logit scale: cosine × 100 before the softmax. */
const LOGIT_SCALE = 100;
/** Below this the category guess is too weak to search by; the search borrows a title instead. */
export const MIN_CATEGORY_PROB = 0.15;
/** A colour or material is named only when the model is this sure (and twice as sure as of the runner-up). */
export const MIN_ATTRIBUTE_PROB = 0.5;
/** A brand is named only when it beats every "no brand" prompt and reaches this probability. */
export const MIN_BRAND_PROB = 0.5;

export interface LabelBank {
  categories: { leaf: Leaf; vec: Float32Array }[];
  colors: { term: GlossaryTerm; vec: Float32Array }[];
  materials: { term: GlossaryTerm; vec: Float32Array }[];
  brands: { brand: Brand; vec: Float32Array }[];
  noBrand: Float32Array[];
}

/** Every prompt the bank embeds, in a fixed order (the cache key is derived from it). */
export function labelPrompts(): { categories: string[]; colors: string[]; materials: string[]; brands: string[]; noBrand: string[] } {
  const { colors, materials } = photoTerms();
  return {
    categories: getLeaves().map((l) => `a photo of a ${l.en}`),
    colors: colors.map((c) => `a photo of a ${c.en} product`),
    materials: materials.map((m) => `a photo of a ${m.en} product`),
    brands: BRANDS.map((b) => `a photo of a ${b.name} product`),
    noBrand: NO_BRAND,
  };
}

function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i]! * b[i]!;
  return s;
}

/** Softmax of CLIP similarities; returns probabilities in input order. */
export function softmax(sims: number[]): number[] {
  if (!sims.length) return [];
  const logits = sims.map((s) => s * LOGIT_SCALE);
  const max = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

function best<T>(items: T[], probs: number[]): { item: T; p: number; runnerUp: number } | null {
  let i = -1;
  for (let j = 0; j < probs.length; j++) if (i < 0 || probs[j]! > probs[i]!) i = j;
  if (i < 0) return null;
  const runnerUp = Math.max(0, ...probs.filter((_, j) => j !== i));
  return { item: items[i]!, p: probs[i]!, runnerUp };
}

/** Sure enough to name: above the floor and at least twice as likely as the next option (no coin flips). */
function clear(hit: { p: number; runnerUp: number } | null, floor: number): boolean {
  return !!hit && hit.p >= floor && hit.p >= 2 * hit.runnerUp;
}

/**
 * Names the product in an image from its CLIP embedding (L2-normalised). Pure: the label bank is
 * passed in. Null when no category is likely enough to search by.
 */
export function nameProduct(image: Float32Array, bank: LabelBank): ProductIdentity | null {
  const cat = best(bank.categories, softmax(bank.categories.map((c) => dot(image, c.vec))));
  if (!cat || cat.p < MIN_CATEGORY_PROB) return null;
  const color = best(bank.colors, softmax(bank.colors.map((c) => dot(image, c.vec))));
  const material = best(bank.materials, softmax(bank.materials.map((m) => dot(image, m.vec))));
  const brandProbs = softmax([...bank.brands.map((b) => dot(image, b.vec)), ...bank.noBrand.map((v) => dot(image, v))]);
  const brandHit = best(bank.brands, brandProbs.slice(0, bank.brands.length));
  const noBrandMax = Math.max(0, ...brandProbs.slice(bank.brands.length));
  const brand = brandHit && clear(brandHit, MIN_BRAND_PROB) && brandHit.p > noBrandMax ? brandHit.item.brand : null;
  const leaf = cat.item.leaf;
  const colorTerm = color && clear(color, MIN_ATTRIBUTE_PROB) ? color.item.term : null;
  // A material already in the category name ("Paslanmaz Çelik Termos") is not repeated.
  const materialTerm = material && clear(material, MIN_ATTRIBUTE_PROB) && !leaf.tr.toLocaleLowerCase("tr").includes(material.item.term.tr) ? material.item.term : null;

  // Queries spell brands the way shoppers type them ("Hermes"); the title keeps the accents.
  const plain = (name: string) => name.normalize("NFD").replace(/\p{M}/gu, "");
  const brandIn = (lang: string) => (brand ? (lang === "zh" ? (brand.zh ?? plain(brand.name)) : plain(brand.name)) : "");
  const queries: Partial<Record<string, string>> = {};
  for (const lang of QUERY_LANGUAGES) {
    const parts = [brandIn(lang), colorTerm ? glossaryName(colorTerm, lang) : "", materialTerm ? glossaryName(materialTerm, lang) : "", glossaryName(leaf, lang)];
    queries[lang] = parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }
  const lower = (s: string) => s.toLocaleLowerCase("tr");
  const title = [brand?.name ?? "", colorTerm ? lower(colorTerm.tr) : "", materialTerm ? lower(materialTerm.tr) : "", lower(leaf.tr)].filter(Boolean).join(" ");
  return { title, queries, source: "local", confidence: Math.round(cat.p * 100) / 100, categoryKey: leaf.key };
}

const plainName = (name: string) => name.normalize("NFD").replace(/\p{M}/gu, "");

/**
 * The name a photo-only search gets from its image-search results: the brand and model several
 * result titles agree on ("AGV PISTA GP RR …" → AGV Pista GP RR) with the product type the titles
 * (or else the photo) name. Null when the titles share no brand or model: the search then keeps
 * searching by the most typical result title, which is more specific than a type alone.
 */
export function identityFromResults(titles: string[], photo: ProductIdentity | null): ProductIdentity | null {
  const found = productFromTitles(titles, BRANDS);
  if (!found.brand && !found.models.length) return null;
  const photoLeaf = photo?.categoryKey ? (getLeaves().find((l) => l.key === photo.categoryKey) ?? null) : null;
  const category: Leaf | GlossaryTerm | null = found.category ?? photoLeaf;
  const brandZh = BRANDS.find((b) => b.name === found.brand)?.zh;
  const queries: Partial<Record<string, string>> = {};
  for (const lang of QUERY_LANGUAGES) {
    const brand = found.brand ? (lang === "zh" && brandZh ? brandZh : plainName(found.brand)) : "";
    queries[lang] = [brand, ...found.models, category ? glossaryName(category, lang) : ""].filter(Boolean).join(" ");
  }
  const title = [found.brand, ...found.models, category ? category.tr.toLocaleLowerCase("tr") : ""].filter(Boolean).join(" ");
  return { title, queries, source: "local", fromResults: true, ...(category && "key" in category ? { categoryKey: category.key } : {}) };
}

/* ------------------------------------------------------------------------------------------ */
/* Label bank: text embeddings computed once per model, then kept in IndexedDB                  */
/* ------------------------------------------------------------------------------------------ */

function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

interface StoredBank {
  dim: number;
  vectors: Float32Array;
}

let bankPromise: Promise<LabelBank | null> | null = null;

/** The label bank, embedding the prompts on first use (≈600 short texts) and caching them. */
export function labelBank(): Promise<LabelBank | null> {
  bankPromise ??= (async () => {
    const p = labelPrompts();
    const all = [...p.categories, ...p.colors, ...p.materials, ...p.brands, ...p.noBrand];
    const key = `clip-labels:${clipProvider.id}:${hash(all.join("\n"))}`;
    let vecs: Float32Array[] | null = null;
    const stored = await getSetting<StoredBank | null>(key, null);
    if (stored && stored.vectors.length === stored.dim * all.length) {
      vecs = all.map((_, i) => stored.vectors.slice(i * stored.dim, (i + 1) * stored.dim));
    } else {
      vecs = await clipProvider.embedTexts(all);
      if (!vecs || vecs.length !== all.length) return null;
      const dim = vecs[0]!.length;
      const flat = new Float32Array(dim * vecs.length);
      vecs.forEach((v, i) => flat.set(v, i * dim));
      await setSetting(key, { dim, vectors: flat } satisfies StoredBank).catch(() => undefined);
    }
    const { colors, materials } = photoTerms();
    const leaves = getLeaves();
    let i = 0;
    const take = () => vecs![i++]!;
    return {
      categories: leaves.map((leaf) => ({ leaf, vec: take() })),
      colors: colors.map((term) => ({ term, vec: take() })),
      materials: materials.map((term) => ({ term, vec: take() })),
      brands: BRANDS.map((brand) => ({ brand, vec: take() })),
      noBrand: NO_BRAND.map(() => take()),
    };
  })().then((bank) => {
    // A failed build (model unreachable) is retried on the next search.
    if (!bank) bankPromise = null;
    return bank;
  });
  return bankPromise;
}

/** Test hook: forgets the in-memory label bank (the IndexedDB copy stays). */
export function resetLabelBankForTests(): void {
  bankPromise = null;
}

/** Starts building the label bank in the background (after the image model is up). */
export function warmLabelBank(): void {
  if (import.meta.env.MODE === "test") return;
  void labelBank().catch(() => undefined);
}

/* ------------------------------------------------------------------------------------------ */
/* Entry point used by the search                                                              */
/* ------------------------------------------------------------------------------------------ */

export interface IdentifyConfig {
  /** The free in-browser model may be used ("Görsel yapay zekâ" on). */
  local: boolean;
  /** Claude, only when the user entered a key. */
  claude?: ClaudeConfig | undefined;
}

/**
 * Names the product of a photo-only search: Claude first when a key is set (falling back to the
 * free model on any failure), otherwise the free model. Null when neither can name it.
 */
export async function identifyProduct(image: ImageInput, queryFp: Fingerprint, cfg: IdentifyConfig, signal?: AbortSignal): Promise<ProductIdentity | null> {
  if (cfg.claude?.apiKey.trim()) {
    const named = await identifyWithClaude(image, cfg.claude, signal).catch(() => null);
    if (named) return named;
  }
  if (!cfg.local || signal?.aborted) return null;
  const raw = queryFp.clip ?? (clipProvider.isReady() ? await clipProvider.embed(image) : null);
  if (!raw) return null;
  const vec = l2Normalize(raw);
  const bank = await labelBank();
  return bank ? nameProduct(vec, bank) : null;
}

/** `identityFromResults`, never throwing: a bad title must not stop the search. */
export function identifyFromResultsOrNull(titles: string[], photo: ProductIdentity | null): ProductIdentity | null {
  try {
    return identityFromResults(titles, photo);
  } catch {
    return null;
  }
}
