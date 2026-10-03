/** Text signals used for matching: normalized tokens, model numbers, attributes, accessory terms. */
import { foldTr, stemCandidatesTr } from "./turkish";

/** Marketing words common in Chinese listing titles; stripped before tokenizing and category detection. */
export const ZH_STOP: string[] = [
  "一件代发", "厂家直销", "跨境新款", "跨境", "批发", "新款", "包邮", "厂家", "直销", "热卖", "爆款", "现货", "定制", "源头", "工厂",
  "正品", "特价", "促销", "爆品", "热销", "新品", "直供", "代发", "优质", "高品质", "同款", "外贸", "出口", "专供", "官方", "旗舰店",
];

const STOP = new Set([
  "the", "and", "for", "with", "new", "hot", "sale", "free", "shipping", "wholesale", "of", "to", "in", "a", "an",
  "ve", "ile", "icin", "yeni", "ucretsiz", "kargo", "toptan", "orijinal", "orjinal", "adet",
  ...ZH_STOP,
]);

const KO_PARTICLES = ["으로", "에서", "을", "를", "은", "는", "의", "와", "과", "도", "로"];
const JA_PARTICLES = ["の", "と", "で", "が", "を", "に", "は", "へ", "も", "や"];

const UNIT_RE = /^\d+(?:[.,]\d+)?(ml|l|lt|mm|cm|m|kg|g|gr|w|kw|v|a|ah|wh|mah|oz|gb|tb|mb|p|k|hz|khz|ghz|mhz|inch|in|inc|mp|fps|lm|db|pcs|pc|adet|x|rpm|psi|bar|cc|mps|kmh|nm|dpi|ppi|ms|s|h|m2|m3|cm2|cm3|l\/min|lb|lbs|ft)$/i;
const YEAR_RE = /^(19|20)\d\d$/;

export function isUnitToken(token: string): boolean {
  return UNIT_RE.test(token) || YEAR_RE.test(token);
}

/** Strips marketing filler and years from a Chinese title. */
export function stripZhMarketing(title: string): string {
  let t = title;
  for (const w of ZH_STOP) t = t.split(w).join(" ");
  return t.replace(/\b(19|20)\d\d\b/g, " ").replace(/\s+/g, " ").trim();
}

export function normalizeTitle(title: string): string {
  return foldTr(title)
    .replace(/[【】[\]()（）。!！?？:：;；/\\|"'“”‘’·•+&*#@~`^_=<>{}，]+/g, " ")
    // Dots and commas are separators except inside a decimal number (1.18L, 2,5 kg).
    .replace(/(?<!\d)[.,]|[.,](?!\d)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const CJK = /[぀-ヿ㐀-鿿가-힯]/;
const RUN_RE = /[a-z0-9][a-z0-9\-'.]*|[぀-ヿ㐀-鿿가-힯]+/g;

function stripParticles(run: string): string {
  let r = run;
  const chars = [...r];
  if (chars.length <= 2) return r;
  for (const p of KO_PARTICLES) if (r.endsWith(p) && [...r].length - [...p].length >= 2) { r = r.slice(0, -p.length); break; }
  for (const p of JA_PARTICLES) if (r.endsWith(p) && [...r].length - 1 >= 2) { r = r.slice(0, -1); break; }
  return r;
}

function bigrams(run: string, out: string[]) {
  const chars = [...run];
  if (chars.length === 1) {
    out.push(chars[0]!);
    return;
  }
  for (let i = 0; i < chars.length - 1; i++) out.push(chars[i]! + chars[i + 1]!);
}

/**
 * Tokens for set-overlap scoring. Latin words are folded (Turkish diacritics removed) and
 * emitted with their light stem; CJK, kana and hangul runs are split into character bigrams
 * after dropping grammatical particles. Marketing filler is removed.
 */
export function tokens(title: string): string[] {
  const src = /[㐀-鿿]/.test(title) ? stripZhMarketing(title) : title;
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (t: string) => {
    if (!seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  };
  let prevShortAlpha: string | null = null;
  for (const rawChunk of src.split(/\s+/)) {
    if (!rawChunk) continue;
    const plain = foldTr(rawChunk).replace(/[^a-z0-9]/g, "");
    if (prevShortAlpha && /^\d{1,3}$/.test(plain)) push(prevShortAlpha + plain);
    prevShortAlpha = /^[a-z]{1,3}$/.test(plain) && !STOP.has(plain) ? plain : null;
    const turkishLetters = /[çğıöşüÇĞİÖŞÜ]/.test(rawChunk);
    const norm = normalizeTitle(rawChunk);
    for (const chunk of norm.split(" ")) {
      if (!chunk) continue;
      const runs = chunk.match(RUN_RE) ?? [];
      for (const run of runs) {
        if (CJK.test(run)) {
          const cleaned = stripParticles(run);
          const tmp: string[] = [];
          bigrams(cleaned, tmp);
          for (const b of tmp) push(b);
        } else {
          const w = run.replace(/^['.]+|['.]+$/g, "");
          if (!w || STOP.has(w)) continue;
          if (/\d/.test(w)) {
            push(w);
            continue;
          }
          const stems = stemCandidatesTr(w);
          if (stems.length === 1 && stems[0] === w) {
            if (!turkishLetters && w.length >= 4 && /[^s]s$/.test(w) && !/(us|is|ss)$/.test(w)) push(w.slice(0, -1));
            else push(w);
          } else {
            // Hardened forms replace their softened originals ("kulaklig" → "kulaklik").
            for (const st of stems) {
              const last = st.at(-1);
              if (last && (last === "g" || last === "b" || last === "d") && stems.includes(st.slice(0, -1) + ({ g: "k", b: "p", d: "t" })[last])) continue;
              push(st);
            }
          }
        }
      }
    }
  }
  return out;
}

/**
 * Model-number candidates: alphanumeric codes with digits and letters. Units ("500ML", "20000MAH"),
 * years and resolutions are not codes. Three-character codes (S24, V15) count when a latin word
 * precedes them.
 */
export function modelNumbers(title: string): string[] {
  const found = new Set<string>();
  const cleaned = title.replace(/[【】[\]()（）,，。!！?？:：;；|"“”‘’]+/g, " ");
  const re = /(^|[^a-z0-9])(?=[a-z0-9-]*\d)(?=[a-z0-9-]*[a-z])([a-z0-9]{2,}(?:-[a-z0-9]+)*)(?![a-z0-9])/gi;
  for (const m of cleaned.matchAll(re)) {
    const raw = m[2]!;
    const s = raw.toUpperCase();
    if (isUnitToken(raw)) continue;
    if (/^\d+X\d+$/i.test(raw)) continue;
    if (s.length >= 4) found.add(s);
    else if (s.length === 3 && /[A-Z]/.test(s) && /\d/.test(s)) {
      const before = cleaned.slice(0, m.index! + m[1]!.length).trimEnd();
      if (/[A-Za-z]{2,}$/.test(before) && !isUnitToken(before.split(/\s+/).at(-1) ?? "")) found.add(s);
    }
  }
  return [...found];
}

export interface TitleAttributes {
  capacityMl?: number;
  powerW?: number;
  voltageV?: number;
  batteryMah?: number;
  storageGb?: number;
  lengthMm?: number;
  weightG?: number;
  packQty?: number;
}

const NUM = "(\\d+(?:[.,]\\d+)?)";
const ATTR_RE = new RegExp(`(?:^|[^a-z0-9])${NUM}\\s*(mah|ml|lt|l|litre|liter|oz|mm|cm|m|metre|meter|kg|gr|g|w|kw|v|gb|tb|inch|inç|in|")(?![a-z])`, "gi");
const PACK_RE = /(?:^|[^a-z0-9])(\d{1,3})\s*(?:'?l[iıuü]|adet|adetli|pcs|pc|pack|pair|çift|cift|件|个|套|双|入|个装|pieces|piece|set|li paket)(?![a-z])|(?:^|[^a-z0-9])x\s*(\d{1,3})(?![a-z0-9])|(?:^|[^a-z0-9])(\d{1,3})\s*x(?![a-z0-9])|(\d{1,3})\s*(?:adet|pcs)/gi;

function num(s: string): number {
  return parseFloat(s.replace(",", "."));
}

/** Normalised quantities from a title: capacities in ml, power in W, lengths in mm, weights in g, pack size. */
export function attributes(title: string): TitleAttributes {
  const out: TitleAttributes = {};
  const t = foldTr(title);
  for (const m of t.matchAll(ATTR_RE)) {
    const n = num(m[1]!);
    const unit = m[2]!.toLowerCase();
    if (!Number.isFinite(n) || n <= 0) continue;
    switch (unit) {
      case "mah": out.batteryMah ??= n; break;
      case "ml": out.capacityMl ??= n; break;
      case "l": case "lt": case "litre": case "liter": out.capacityMl ??= n * 1000; break;
      case "oz": out.capacityMl ??= Math.round(n * 29.57); break;
      case "mm": out.lengthMm ??= n; break;
      case "cm": out.lengthMm ??= n * 10; break;
      case "m": case "metre": case "meter": out.lengthMm ??= n * 1000; break;
      case "inch": case "inç": case "in": case "\"": out.lengthMm ??= Math.round(n * 25.4); break;
      case "kg": out.weightG ??= n * 1000; break;
      case "g": case "gr": if (n >= 20) out.weightG ??= n; break;
      case "w": out.powerW ??= n; break;
      case "kw": out.powerW ??= n * 1000; break;
      case "v": out.voltageV ??= n; break;
      case "gb": out.storageGb ??= n; break;
      case "tb": out.storageGb ??= n * 1024; break;
    }
  }
  for (const m of title.matchAll(PACK_RE)) {
    const q = parseInt(m[1] ?? m[2] ?? m[3] ?? m[4] ?? "", 10);
    if (Number.isFinite(q) && q >= 2 && q <= 500) {
      out.packQty = q;
      break;
    }
  }
  return out;
}

/** Attribute kinds present on both sides whose values differ by more than `tolerance` (fraction). */
export function attributeMismatches(a: TitleAttributes, b: TitleAttributes, tolerance = 0.08): { kind: keyof TitleAttributes; a: number; b: number }[] {
  const out: { kind: keyof TitleAttributes; a: number; b: number }[] = [];
  const kinds: (keyof TitleAttributes)[] = ["capacityMl", "powerW", "voltageV", "batteryMah", "storageGb", "lengthMm", "weightG"];
  for (const k of kinds) {
    const x = a[k];
    const y = b[k];
    if (x === undefined || y === undefined) continue;
    const diff = Math.abs(x - y) / Math.max(x, y);
    if (diff > tolerance) out.push({ kind: k, a: x, b: y });
  }
  return out;
}

/** Attribute kinds present on both sides with equal (within tolerance) values. */
export function attributeAgreements(a: TitleAttributes, b: TitleAttributes, tolerance = 0.08): (keyof TitleAttributes)[] {
  const out: (keyof TitleAttributes)[] = [];
  const kinds: (keyof TitleAttributes)[] = ["capacityMl", "powerW", "voltageV", "batteryMah", "storageGb", "lengthMm", "weightG"];
  for (const k of kinds) {
    const x = a[k];
    const y = b[k];
    if (x === undefined || y === undefined) continue;
    if (Math.abs(x - y) / Math.max(x, y) <= tolerance) out.push(k);
  }
  return out;
}

export const ATTRIBUTE_LABELS_TR: Record<keyof TitleAttributes, string> = {
  capacityMl: "kapasite",
  powerW: "güç",
  voltageV: "voltaj",
  batteryMah: "pil",
  storageGb: "hafıza",
  lengthMm: "boyut",
  weightG: "ağırlık",
  packQty: "paket adedi",
};

export function formatAttribute(kind: keyof TitleAttributes, value: number): string {
  switch (kind) {
    case "capacityMl": return value >= 1000 ? `${+(value / 1000).toFixed(2)} L` : `${Math.round(value)} ml`;
    case "powerW": return `${Math.round(value)} W`;
    case "voltageV": return `${+value.toFixed(1)} V`;
    case "batteryMah": return `${Math.round(value)} mAh`;
    case "storageGb": return value >= 1024 ? `${+(value / 1024).toFixed(1)} TB` : `${Math.round(value)} GB`;
    case "lengthMm": return value >= 1000 ? `${+(value / 1000).toFixed(2)} m` : value >= 10 ? `${+(value / 10).toFixed(1)} cm` : `${Math.round(value)} mm`;
    case "weightG": return value >= 1000 ? `${+(value / 1000).toFixed(2)} kg` : `${Math.round(value)} g`;
    case "packQty": return `${value} adet`;
  }
}

/**
 * Accessory / spare-part markers in a title (zh, tr, en). Forms meaning "with X"
 * ("vizörlü", "kılıflı") are not accessories. Parenthesised remarks are ignored.
 */
const ACCESSORY_RE = /配件|支架|尾翼|贴纸|贴膜|保护壳|保护套|手机壳|手机套|平板壳|镜片|内衬|滤芯|滤网|表带|数据线|充电线|充电器|替换装|替换|适用于|适用|专用|改装|零件|配套|\b(?:kilif|kılıf)(?!l[iıuü])\b|\bvizor(?!l[iıuü])|\bvizör(?!l[iıuü])|\baparat|\baksesuar|\byedek\b|\bparca(?:si|lari)?\b|\bparça(?:sı|ları)?\b|\bfiltre(?:si)?\b|\bkordon(?:u)?\b|\btutucu\b|\bsticker\b|\bspoiler\b|\betiket\b|\buyumlu\b|\bicin\b|\biçin\b|\btasima cantasi\b|\btaşıma çantası\b|\bkoruma cantasi\b|\bkoruma çantası\b|\bsarj kutusu\b|\bşarj kutusu\b|\bekran koruyucu\b|\bcam koruyucu\b|\bkablosu\b|\bbagcik|\bbağcık|\bbagcigi|\bbağcığı|\byagmurluk|\byağmurluk|\byagmurlugu|\byağmurluğu|\bkanca|\bkazik|\bkazık|\bkazigi|\bkazığı|\bpipet|\baski\b|\baskı\b|\baskisi\b|\baskısı\b|\btasima\b|\btaşıma\b|\bastar|\bkagidi\b|\bkağıdı\b|\bucu\b|\bucu seti\b|\bbaslik\b|\bbaşlık\b|\bbasligi\b|\bbaşlığı\b|\bvitrin|\bkeycap|\bmouse ?pad\b|鞋带|吸管|键帽|鼠标垫|雨罩|钻头|\b(?:case|cover|strap|visor|filter|holder|mount|replacement|spare|sticker|decal|protector|skin|pouch|charger|charging case|compatible with|for iphone|for samsung|for xiaomi|for galaxy|for airpods|lens|liner|bracket|stand|shoelace|laces|straw|hook|rain cover|stake|pegs?|drill bits?|keycaps?|display case)\b/i;

export function accessoryTerms(title: string): string[] {
  const t = title.replace(/\([^)]*\)|\[[^\]]*\]|（[^）]*）|【[^】]*】/g, " ");
  const out = new Set<string>();
  const folded = foldTr(t);
  for (const src of [t, folded]) {
    const re = new RegExp(ACCESSORY_RE.source, "gi");
    for (const m of src.matchAll(re)) out.add(foldTr(m[0]));
  }
  return [...out];
}

const PHRASE_STOP = new Set([
  "siyah", "beyaz", "kirmizi", "mavi", "yesil", "gri", "sari", "pembe", "mor", "turuncu", "kahverengi", "lacivert", "renk", "mat", "parlak",
  "kask", "kulaklik", "kilif", "telefon", "erkek", "kadin", "cocuk", "adet", "set", "orijinal", "orjinal", "yeni", "uyumlu", "ve", "ile", "icin",
  "black", "white", "red", "blue", "green", "grey", "gray", "matte", "gloss", "wireless", "bluetooth", "case", "for", "with", "and", "the", "new",
  "kablosuz", "sarjli", "tasinabilir", "elektrikli", "akilli", "men", "mens", "women", "womens", "kids", "boys", "girls", "unisex", "size",
  "shoes", "shoe", "sneakers", "sneaker", "helmet", "earbuds", "headphones", "headset", "smartphone", "tumbler", "bottle", "bag", "backpack", "cover",
  "mekanik", "klavye", "mouse", "fare", "saat", "supurge", "termos", "bardak", "canta", "ayakkabi", "elbise", "tisort", "kamera", "hoparlor", "sarj", "kablo", "matkap", "lamba", "oyuncak",
  "gozluk", "kemer", "cuzdan", "valiz", "airfryer", "fritoz", "blender", "powerbank", "tablet", "laptop", "monitor", "televizyon", "kulaklik", "kask", "kilif", "tutucu", "stand", "kordon",
  "keyboard", "vacuum", "cleaner", "speaker", "charger", "cable", "drill", "lamp", "toy", "glasses", "sunglasses", "belt", "wallet", "suitcase", "thermos", "mug", "cup", "jacket", "dress", "pants",
  "wireless", "cordless", "portable", "electric", "smart", "mini", "siyah", "beyaz", "tumbler", "styler", "multi-styler", "edition", "version",
]);

/**
 * The ordered brand + series + number phrase of a title: folded latin tokens from the first
 * brand-like token up to the first unit, attribute or generic word (at most five tokens).
 */
export function brandModelPhrase(title: string): string {
  const cleaned = title.replace(/\([^)]*\)|\[[^\]]*\]|（[^）]*）|【[^】]*】/g, " ");
  const raw = cleaned.match(/[A-Za-z0-9ÇĞİÖŞÜçğıöşü][\wÇĞİÖŞÜçğıöşü\-+.]*/g) ?? [];
  const out: string[] = [];
  let started = false;
  for (const tok of raw) {
    const isAscii = /^[A-Za-z0-9\-+.]+$/.test(tok);
    const f = foldTr(tok).replace(/[.+]+$/g, "");
    if (!started) {
      if (isAscii && /^[A-Za-z]/.test(tok) && tok.length >= 2 && !PHRASE_STOP.has(f) && !STOP.has(f)) {
        started = true;
        out.push(f);
      }
      continue;
    }
    if (!isAscii || isUnitToken(f) || PHRASE_STOP.has(f) || STOP.has(f)) break;
    const prev = out[out.length - 1];
    if (prev && /^[a-z]{1,3}$/.test(prev) && /^\d{1,3}$/.test(f) && out.length >= 2) out[out.length - 1] = prev + f;
    else out.push(f);
    if (out.length >= 5) break;
  }
  return out.join(" ");
}

export type PhraseRelation = "none" | "exact" | "variant" | "conflict";

/** How two brand+model phrases relate: exact, one is a prefix/contains the other (variant), or none. */
export function phraseRelation(a: string, b: string): PhraseRelation {
  if (!a || !b) return "none";
  const ta = a.split(" ");
  const tb = b.split(" ");
  // A lone word ("stanley", "kulaklik") is not a model phrase.
  if (a === b) return ta.length >= 2 || /\d/.test(a) ? "exact" : "none";
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  // Same series, different number ("nike air max 270" vs "nike air max 90"): a model conflict.
  let common = 0;
  while (common < short.length && common < long.length && short[common] === long[common]) common++;
  if (common >= 2 && common < short.length && /\d/.test(short[common]!) && /\d/.test(long[common]!)) return "conflict";
  if (short.length < 2 || !short.some((t) => /\d/.test(t))) return "none";
  const idx = long.join(" ").indexOf(short.join(" "));
  if (idx < 0) return "none";
  // Check contiguous token sub-sequence.
  for (let i = 0; i + short.length <= long.length; i++) {
    let ok = true;
    for (let j = 0; j < short.length; j++) if (long[i + j] !== short[j]) { ok = false; break; }
    if (ok) {
      // Extra tokens only on the left (brand prepended) → effectively the same phrase.
      if (i + short.length === long.length) return "exact";
      return "variant";
    }
  }
  return "none";
}

export function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  return inter / (sa.size + sb.size - inter);
}

/** Overlap coefficient |a∩b| / min(|a|,|b|): tolerant of length asymmetry (short query vs long title). */
export function overlap(a: string[], b: string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  return inter / Math.min(sa.size, sb.size);
}
