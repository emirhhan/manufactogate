import { foldTr, jaccard, modelNumbers, tokens, type RawListing } from "@manufactogate/core";
import { getLeaves } from "@manufactogate/adapters";

/**
 * How closely a candidate listing resembles a source title, from text alone (0..1).
 *
 * Signals, each computed once per title and cached:
 *  - latin tokens shared with the source (brand, series, model words; colours/sizes/filler removed),
 *    weighted so brand and code-like tokens count double;
 *  - CJK bigram overlap for Chinese ↔ Chinese pairs;
 *  - product category, bridged across scripts (zh / tr / en) through the taxonomy and a glossary,
 *    so "无线蓝牙耳机" and "Kablosuz Kulaklık" agree on "kulaklık";
 *  - model-number hit (FF353, X9-Pro) as a strong bonus;
 *  - accessory penalty (visors, cases, stickers are not the product).
 */

/** Words that never identify a product: colours, sizes, marketing filler, units. */
const STOP = new Set(
  (
    "ve ile icin the and for with new hot sale free shipping wholesale orijinal orjinal original yeni ucretsiz kargo set adet " +
    "pcs pc pack pair cift takim unisex erkek kadin cocuk women men kids mat matte parlak glossy renk color colour " +
    "siyah beyaz kirmizi mavi yesil gri sari pembe mor turuncu kahverengi lacivert bej bordo black white red blue green grey gray yellow pink purple orange brown navy beige " +
    "xs xxs xxl xxxl 2xl 3xl 4xl small medium large kucuk orta buyuk mini maxi plus " +
    "cm mm kg gr ml lt inch adetli li lu lik luk model marka brand quality kalite premium lux luxury super top best ucuz cheap"
  ).split(/\s+/),
);
const SIZE_RE = /^(?:\d+(?:[.,]\d+)?(?:cm|mm|m|kg|g|gr|ml|l|lt|w|v|mah|ah|inch|in|gb|tb|mb|hz|mp|k|x)|[sml]|xl)$/;
const CJK = /[㐀-鿿]/;
const ACCESSORY = /配件|支架|尾翼|贴纸|贴膜|保护壳|保护套|镜片|内衬|改装|零件|aparat|aksesuar|kılıf|kilif|yedek|parça|parca|vizör|vizor|sticker|tutucu|bağlantı|baglanti|spoiler|iç astar|lens|\bcam\b|\bcase\b|\bcover\b|\bholder\b|\bmount\b|\bstand\b|\bstrap\b|\bvisor\b|\bbag for\b|\bfor\s+\w+\s+(?:case|cover|holder)/i;

/** Category glossary: one row per concept, with Turkish/Chinese/English surface forms. Folded Turkish is the key. */
const GLOSS: [tr: string, zh: string[], en: string[]][] = [
  ["motosiklet kaskı", ["摩托车头盔", "摩托头盔", "全盔", "半盔", "揭面盔"], ["motorcycle helmet", "motorbike helmet", "full face helmet", "modular helmet", "open face helmet"]],
  ["bisiklet kaskı", ["骑行头盔", "自行车头盔"], ["bike helmet", "bicycle helmet", "cycling helmet"]],
  ["kask", ["头盔"], ["helmet"]],
  ["kablosuz kulaklık", ["无线耳机", "蓝牙耳机", "tws耳机", "入耳式耳机"], ["wireless earbuds", "bluetooth earbuds", "wireless earphones", "tws earbuds", "earbuds"]],
  ["kulak üstü kulaklık", ["头戴式耳机"], ["over-ear headphones", "headphones", "headset"]],
  ["kulaklık", ["耳机", "耳麦"], ["earphones", "earphone", "headphone"]],
  ["akıllı saat", ["智能手表", "智能手环"], ["smart watch", "smartwatch", "fitness tracker", "smart band"]],
  ["saat", ["手表", "腕表"], ["watch", "wristwatch"]],
  ["telefon kılıfı", ["手机壳", "保护壳"], ["phone case", "phone cover"]],
  ["telefon", ["手机"], ["phone", "smartphone"]],
  ["şarj kablosu", ["数据线", "充电线"], ["charging cable", "usb cable"]],
  ["şarj", ["充电器", "充电头"], ["charger", "power adapter"]],
  ["powerbank", ["移动电源", "充电宝"], ["power bank", "powerbank"]],
  ["hoparlör", ["音箱", "音响", "扬声器"], ["speaker", "bluetooth speaker"]],
  ["klavye", ["键盘"], ["keyboard"]],
  ["mouse", ["鼠标"], ["mouse"]],
  ["kamera", ["摄像头", "相机"], ["camera", "webcam"]],
  ["drone", ["无人机"], ["drone", "quadcopter"]],
  ["projeksiyon", ["投影仪"], ["projector"]],
  ["lamba", ["灯", "台灯", "吊灯"], ["lamp", "light"]],
  ["çanta", ["包", "背包", "手提包"], ["bag", "handbag", "backpack"]],
  ["valiz", ["行李箱", "拉杆箱"], ["suitcase", "luggage"]],
  ["cüzdan", ["钱包"], ["wallet"]],
  ["kemer", ["皮带", "腰带"], ["belt"]],
  ["ayakkabı", ["鞋", "运动鞋", "球鞋"], ["shoes", "sneakers", "trainers"]],
  ["bot", ["靴子", "靴"], ["boots"]],
  ["terlik", ["拖鞋"], ["slippers", "slides"]],
  ["tişört", ["t恤", "短袖"], ["t-shirt", "tee", "tshirt"]],
  ["elbise", ["连衣裙", "裙子"], ["dress"]],
  ["mont", ["外套", "夹克", "羽绒服"], ["jacket", "coat", "parka"]],
  ["pantolon", ["裤子", "牛仔裤"], ["pants", "trousers", "jeans"]],
  ["şapka", ["帽子", "帽"], ["hat", "cap", "beanie"]],
  ["eldiven", ["手套"], ["gloves"]],
  ["çorap", ["袜子", "袜"], ["socks"]],
  ["havlu", ["毛巾"], ["towel"]],
  ["yastık", ["枕头", "抱枕"], ["pillow", "cushion"]],
  ["battaniye", ["毛毯", "毯子"], ["blanket", "throw"]],
  ["bardak", ["杯子", "水杯"], ["cup", "mug", "tumbler"]],
  ["termos", ["保温杯", "保温壶"], ["thermos", "vacuum flask", "insulated bottle"]],
  ["oyuncak", ["玩具"], ["toy", "toys"]],
  ["bebek arabası", ["婴儿车", "推车"], ["stroller", "pram", "pushchair"]],
  ["bisiklet", ["自行车", "单车"], ["bicycle", "bike"]],
  ["scooter", ["滑板车", "电动滑板车"], ["scooter", "e-scooter"]],
  ["matkap", ["电钻"], ["drill"]],
  ["tornavida", ["螺丝刀", "起子"], ["screwdriver"]],
  ["el feneri", ["手电筒", "手电"], ["flashlight", "torch"]],
  ["airfryer", ["空气炸锅"], ["air fryer", "airfryer"]],
  ["blender", ["搅拌机", "破壁机"], ["blender"]],
  ["kahve makinesi", ["咖啡机"], ["coffee maker", "coffee machine", "espresso machine"]],
  ["su ısıtıcı", ["电热水壶", "烧水壶"], ["kettle"]],
  ["robot süpürge", ["扫地机器人"], ["robot vacuum"]],
  ["süpürge", ["吸尘器"], ["vacuum cleaner", "vacuum"]],
  ["ütü", ["熨斗", "挂烫机"], ["iron", "steamer"]],
  ["saç kurutma", ["吹风机"], ["hair dryer"]],
  ["saç düzleştirici", ["直发器", "夹板"], ["hair straightener", "flat iron"]],
  ["tıraş makinesi", ["剃须刀", "理发器"], ["shaver", "trimmer", "clipper"]],
  ["diş fırçası", ["牙刷", "电动牙刷"], ["toothbrush"]],
  ["masaj", ["按摩器", "筋膜枪"], ["massager", "massage gun"]],
  ["parfüm", ["香水"], ["perfume", "fragrance"]],
  ["güneş gözlüğü", ["太阳镜", "墨镜"], ["sunglasses"]],
  ["gözlük", ["眼镜"], ["glasses", "eyeglasses"]],
  ["kolye", ["项链"], ["necklace"]],
  ["bilezik", ["手链", "手镯"], ["bracelet", "bangle"]],
  ["yüzük", ["戒指"], ["ring"]],
  ["küpe", ["耳环", "耳钉"], ["earrings"]],
  ["yoga matı", ["瑜伽垫"], ["yoga mat"]],
  ["dambıl", ["哑铃"], ["dumbbell"]],
  ["çadır", ["帐篷"], ["tent"]],
  ["uyku tulumu", ["睡袋"], ["sleeping bag"]],
  ["köpek tasması", ["狗绳", "狗项圈"], ["dog collar", "dog leash"]],
  ["kedi kumu", ["猫砂"], ["cat litter"]],
  ["akvaryum", ["鱼缸", "水族箱"], ["aquarium", "fish tank"]],
  ["saksı", ["花盆"], ["flower pot", "planter"]],
  ["telefon tutucu", ["手机支架", "车载支架"], ["phone holder", "phone mount"]],
  ["araç kamerası", ["行车记录仪"], ["dash cam", "dashcam"]],
  ["silecek", ["雨刮"], ["wiper blade"]],
  ["akü", ["电瓶", "蓄电池"], ["car battery"]],
  ["monitör", ["显示器"], ["monitor"]],
  ["laptop", ["笔记本电脑", "笔记本"], ["laptop", "notebook"]],
  ["tablet", ["平板电脑", "平板"], ["tablet"]],
  ["akıllı priz", ["智能插座"], ["smart plug"]],
  ["akıllı ampul", ["智能灯泡"], ["smart bulb"]],
  ["güneş paneli", ["太阳能板"], ["solar panel"]],
  ["kalem", ["笔", "钢笔"], ["pen"]],
  ["defter", ["笔记本", "本子"], ["notebook"]],
  ["ambalaj", ["包装袋", "包装盒"], ["packaging", "packaging box"]],
];

/** Normalised category key: folded Turkish label ("motosiklet kaski"). */
interface CatEntry {
  key: string;
  zh: string[];
  tr: string;
  en: string[];
}
let CAT_INDEX: CatEntry[] | null = null;
function catIndex(): CatEntry[] {
  if (CAT_INDEX) return CAT_INDEX;
  const map = new Map<string, CatEntry>();
  const add = (tr: string, zh: string[], en: string[]) => {
    const key = foldTr(tr).trim();
    const cur = map.get(key);
    if (cur) {
      for (const z of zh) if (z && !cur.zh.includes(z)) cur.zh.push(z);
      for (const e of en) if (e && !cur.en.includes(e)) cur.en.push(e);
    } else map.set(key, { key, tr: key, zh: zh.filter(Boolean), en: en.map((e) => e.toLowerCase()).filter(Boolean) });
  };
  try {
    for (const l of getLeaves()) add(l.tr, [l.zh], []);
  } catch {
    /* taxonomy unavailable in exotic test setups */
  }
  for (const [tr, zh, en] of GLOSS) add(tr, zh, en);
  // Longest keys first, so "motosiklet kaski" wins over "kask" when both appear.
  CAT_INDEX = [...map.values()].sort((a, b) => b.key.length - a.key.length);
  return CAT_INDEX;
}

function wordHit(folded: string, needle: string): boolean {
  // Word-boundary match that tolerates Turkish suffixes ("kaski", "kulakligi").
  let i = folded.indexOf(needle);
  while (i !== -1) {
    const before = i === 0 ? " " : folded[i - 1]!;
    if (!/[a-z0-9]/.test(before)) {
      const after = folded[i + needle.length];
      if (after === undefined || !/[a-z0-9]/.test(after) || /^[a-z]{0,3}(?![a-z])/.test(folded.slice(i + needle.length))) return true;
    }
    i = folded.indexOf(needle, i + 1);
  }
  return false;
}

/** Category keys named in a title, most specific first. */
export function categoryKeys(title: string): string[] {
  const raw = title;
  const f = " " + foldTr(title).replace(/[^a-z0-9㐀-鿿]+/g, " ") + " ";
  const out: string[] = [];
  for (const c of catIndex()) {
    let hit = false;
    for (const z of c.zh) if (raw.includes(z)) { hit = true; break; }
    if (!hit && wordHit(f, c.tr)) hit = true;
    if (!hit) for (const e of c.en) if (wordHit(f, e)) { hit = true; break; }
    if (hit) out.push(c.key);
  }
  return out;
}

export interface TitleSignals {
  latin: Map<string, number>;
  latinWeight: number;
  cjk: string[];
  models: string[];
  cats: string[];
  accessory: boolean;
  hasCjk: boolean;
}

/** Turkish possessive/plural suffix stripping so "kaskı" ≈ "kask", "kulaklığı" ≈ "kulaklik". */
function stem(w: string): string {
  if (w.length < 5) return w;
  let s = w;
  s = s.replace(/(lari|leri)$/, "");
  if (s.length >= 5) s = s.replace(/(si|su|sı|sü|lar|ler|ini|ini|unu)$/, "");
  if (s.length >= 5) s = s.replace(/[iıuü]$/, "");
  if (s.length >= 5) s = s.replace(/g$/, "k").replace(/b$/, "p").replace(/d$/, "t");
  return s.length >= 3 ? s : w;
}

function latinOf(title: string): { tokens: Map<string, number>; weight: number } {
  const f = foldTr(title).replace(/[【】[\]()（）,，.。!！?？:：;；/\\|"'“”‘’+&]+/g, " ");
  const raw = f.match(/[a-z0-9][a-z0-9-]*/g) ?? [];
  const map = new Map<string, number>();
  let weight = 0;
  let brandSeen = false;
  for (const t0 of raw) {
    const t = t0.replace(/^-+|-+$/g, "");
    if (!t) continue;
    if (STOP.has(t) || SIZE_RE.test(t)) continue;
    if (/^\d+$/.test(t) && t.length > 4) continue; // long bare numbers are ids/EANs, not product words
    if (t.length < 2 && !/^\d$/.test(t)) continue;
    const code = /\d/.test(t) && /[a-z]/.test(t);
    const isWord = /^[a-z]+$/.test(t);
    const key = isWord ? stem(t) : t;
    let w = 1;
    if (code) w = 2;
    else if (isWord && !brandSeen && t.length >= 2) {
      // First plain word is the likely brand.
      w = 2;
      brandSeen = true;
    }
    if (!map.has(key)) {
      map.set(key, w);
      weight += w;
    }
  }
  return { tokens: map, weight };
}

const SIG_CACHE = new Map<string, TitleSignals>();
const SIG_MAX = 5000;

/** Per-title signals, memoised (bounded). */
export function titleSignals(title: string): TitleSignals {
  const hit = SIG_CACHE.get(title);
  if (hit) return hit;
  const { tokens: latin, weight } = latinOf(title);
  const hasCjk = CJK.test(title);
  const cjk = hasCjk ? tokens(title).filter((t) => CJK.test(t)) : [];
  const sig: TitleSignals = { latin, latinWeight: weight, cjk, models: modelNumbers(title), cats: categoryKeys(title), accessory: ACCESSORY.test(title), hasCjk };
  if (SIG_CACHE.size >= SIG_MAX) SIG_CACHE.clear();
  SIG_CACHE.set(title, sig);
  return sig;
}

/** 1 same category, 0.8 one is a specialisation of the other, 0 both known and different, 0.5 unknown on either side. */
export function categoryAgreement(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0.5;
  let best = 0;
  for (const x of a) {
    for (const y of b) {
      if (x === y) return 1;
      const xs = x.split(" ");
      const ys = y.split(" ");
      const head = (ws: string[]) => ws[ws.length - 1]!;
      if (head(xs) === head(ys) || x.includes(y) || y.includes(x)) best = Math.max(best, 0.8);
    }
  }
  return best;
}

export interface RelevanceDetail {
  score: number;
  tokenCoverage: number;
  cjkOverlap: number;
  category: number;
  modelHit: boolean;
  accessory: boolean;
  reasons: string[];
}

/** Scores candidate signals against source signals; pure and fast (set lookups only). */
export function scoreSignals(src: TitleSignals, cand: TitleSignals): RelevanceDetail {
  const reasons: string[] = [];
  // Latin coverage: how much of the source's identifying vocabulary the candidate repeats.
  let shared = 0;
  for (const [t, w] of src.latin) if (cand.latin.has(t)) shared += w;
  const tokenCoverage = src.latinWeight ? shared / src.latinWeight : 0;
  // Weight grows with how much latin vocabulary the source actually has (a lone "TWS" is weak evidence).
  const wt = 0.55 * Math.min(1, src.latin.size / 3);
  const bothCjk = src.hasCjk && cand.hasCjk;
  const cjkOverlap = bothCjk ? jaccard(src.cjk, cand.cjk) : 0;
  const wc = bothCjk ? 0.45 : 0;
  const category = categoryAgreement(src.cats, cand.cats);
  const wk = src.cats.length && cand.cats.length ? 0.45 : 0.3;
  const sum = wt + wc + wk;
  let score = sum > 0 ? (wt * tokenCoverage + wc * cjkOverlap + wk * category) / sum : 0;
  if (tokenCoverage >= 0.5) reasons.push(`başlık örtüşmesi %${Math.round(tokenCoverage * 100)}`);
  if (bothCjk && cjkOverlap >= 0.3) reasons.push(`Çince başlık örtüşmesi %${Math.round(cjkOverlap * 100)}`);
  if (category === 1) reasons.push("aynı kategori");
  else if (category === 0.8) reasons.push("yakın kategori");
  else if (category === 0) reasons.push("farklı kategori");
  const modelHit = src.models.length > 0 && src.models.some((m) => cand.models.includes(m));
  if (modelHit) {
    score = Math.max(score, 0.7) + (1 - Math.max(score, 0.7)) * 0.5;
    reasons.unshift("model numarası eşleşti");
  } else if (src.models.length && cand.models.length) {
    // Both carry codes and none agree: likely a different model of the same family.
    score *= 0.85;
  }
  // Same category but none of the source's words: generic item, keep it below "yakın".
  if (!modelHit && src.latin.size >= 2 && cand.latin.size >= 2 && shared === 0 && !bothCjk) score = Math.min(score, 0.62);
  const accessory = cand.accessory && !src.accessory;
  if (accessory) {
    score *= 0.35;
    reasons.push("aksesuar");
  }
  return { score: Math.max(0, Math.min(1, score)), tokenCoverage, cjkOverlap, category, modelHit, accessory, reasons };
}

export function relevanceDetail(sourceTitle: string, candidateTitle: string): RelevanceDetail {
  return scoreSignals(titleSignals(sourceTitle), titleSignals(candidateTitle));
}

export function relevance(sourceTitle: string, candidate: Pick<RawListing, "title">): number {
  return relevanceDetail(sourceTitle, candidate.title).score;
}

/**
 * Picks the "best" listing among candidates: rank by score band (≥0.8, ≥0.65, ≥0.5) and take the
 * cheapest within the highest non-empty band. Candidates below 0.5 never win.
 */
export function pickBest<T>(items: { item: T; score: number; price: number | null }[]): T | undefined {
  for (const floor of [0.8, 0.65, 0.5]) {
    const band = items.filter((x) => x.score >= floor && x.price !== null);
    if (band.length) return band.sort((a, b) => a.price! - b.price!)[0]!.item;
  }
  return undefined;
}

/** Test/diagnostic hook. */
export function clearRelevanceCache(): void {
  SIG_CACHE.clear();
}
