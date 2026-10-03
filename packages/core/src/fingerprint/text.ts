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

const UNIT_RE = /^\d+(?:[.,]\d+)?(ml|l|lt|mm|cm|m|kg|g|gr|mg|w|kw|v|va|kva|a|ah|wh|mah|oz|gb|tb|mb|p|k|hz|khz|ghz|mhz|inch|in|inc|mp|fps|lm|db|pcs|pc|adet|x|rpm|psi|bar|pa|kpa|cc|mps|kmh|nm|dpi|ppi|ms|s|h|m2|m3|cm2|cm3|l\/min|lb|lbs|ft|qt|btu|hp|mbps|gbps|kcal|ohm|awg|ct)$/i;
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
  let prevDigits: string | null = null;
  for (const rawChunk0 of src.split(/\s+/)) {
    // "Men's" → "men", "Levi's" → "levi": the possessive adds nothing and would leave a stray "s".
    const rawChunk = rawChunk0.replace(/['’]s$/i, "");
    if (!rawChunk) continue;
    const plain = foldTr(rawChunk).replace(/[^a-z0-9]/g, "");
    // "Flip 6" → "flip6", "K 2" → "k2", so spaced and glued spellings meet.
    if (prevShortAlpha && /^\d{1,3}$/.test(plain)) push(prevShortAlpha + plain);
    // "16 GB" → "16gb", so a spaced unit matches the glued spelling.
    if (prevDigits && /^[a-z]{1,4}$/.test(plain) && isUnitToken(prevDigits + plain)) push(prevDigits + plain);
    prevShortAlpha = /^[a-z]{1,4}$/.test(plain) && !STOP.has(plain) ? plain : null;
    prevDigits = /^\d{1,5}$/.test(plain) ? plain : null;
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
            // "flip6" → "flip" + "6", so the glued spelling meets "Flip 6".
            const glued = w.match(/^([a-z]{2,4})(\d{1,3})$/);
            if (glued && !isUnitToken(w)) {
              push(glued[1]!);
              push(glued[2]!);
            }
            continue;
          }
          // "usb-c", "pro-ceramic": hyphenated words (no digits, so codes like TWS-X15 stay whole) also yield their parts.
          if (w.includes("-")) for (const part of w.split("-")) if (part.length >= 2 && !STOP.has(part)) push(part);
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
/**
 * Codes that look like model numbers but name a standard, not a product: lamp sockets, car bulb
 * types, ordinals, "7-in-1", interface versions.
 */
const NOT_A_MODEL = /^(?:E14|E27|B22|GU10|G9|G4|MR16|T5|T8|H1|H3|H4|H7|H8|H11|HB3|HB4|USB\d|HDMI\d|WIFI\d|BLUETOOTH\d|SPF\d+|UV\d+|IPX?\d+|PD\d(?:\.\d)?|QC\d(?:\.\d)?|BT\d(?:\.\d)?|DP\d|DDR\d|PCIE\d|H26\d|\dK\d+|\d+(?:ST|ND|RD|TH)|(?:IN|AND|OR|TO|BY)-\d+|\d+-IN-\d+)$/i;

export function modelNumbers(title: string): string[] {
  const found = new Set<string>();
  const cleaned = title.replace(/[【】[\]()（）,，。!！?？:：;；|"“”‘’]+/g, " ");
  const re = /(^|[^a-z0-9])(?=[a-z0-9-]*\d)(?=[a-z0-9-]*[a-z])([a-z0-9]{2,}(?:-[a-z0-9]+)*)(?![a-z0-9])/gi;
  for (const m of cleaned.matchAll(re)) {
    const raw = m[2]!;
    const s = raw.toUpperCase();
    if (isUnitToken(raw)) continue;
    if (/^\d+X\d+$/i.test(raw)) continue;
    if (NOT_A_MODEL.test(raw)) continue;
    if (s.length >= 4) found.add(s);
    else if (s.length === 3 && /[A-Z]/.test(s) && /\d/.test(s)) {
      const before = cleaned.slice(0, m.index! + m[1]!.length).trimEnd();
      if (/[A-Za-z]{2,}$/.test(before) && !isUnitToken(before.split(/\s+/).at(-1) ?? "")) found.add(s);
    }
  }
  return [...found];
}

/**
 * Two codes name the same product when they are equal or one only adds a regional / kit suffix:
 * "AF300" ~ "AF300EU", "DHP484" ~ "DHP484Z", "SM-SA48" ~ "SM-SA48-BA", "MU-PC1T0T" ~ "MU-PC1T0T/WW".
 */
export function sameModelCode(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length < 3 || !long.startsWith(short)) return false;
  const rest = long.slice(short.length);
  return /^[-/]/.test(rest) || /^[A-Z]{1,2}\d{0,2}$/.test(rest);
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
  /** Who the item is for: m (erkek/men), f (kadın/women), k (çocuk/kids). Numeric comparisons ignore it. */
  audience?: number;
}

/** Audience codes stored in `TitleAttributes.audience`. */
export const AUDIENCE = { men: 1, women: 2, kids: 3 } as const;
export const AUDIENCE_LABELS_TR: Record<number, string> = { 1: "erkek", 2: "kadın", 3: "çocuk" };
const AUDIENCE_RE = /(?:^|[^a-z])(?:erkek|men|mens|man|male|herren|男士|男款|男子|男)(?![a-z])|(?:^|[^a-z])(?:kadin|women|womens|woman|female|ladies|damen|女士|女款|女子|女)(?![a-z])|(?:^|[^a-z])(?:cocuk|kids|kid|child|children|boys|girls|junior|儿童|童|大童|小童)(?![a-z])/;

const NUM = "(\\d+(?:[.,]\\d+)?)";
const ATTR_RE = new RegExp(`(?:^|[^a-z0-9-])${NUM}\\s*(mah|ml|lt|l|litre|liter|oz|mm|cm|m|metre|meter|kg|gr|g|w|kw|v|gb|tb|inch|inç|in|")(?![a-z])`, "gi");
const PACK_RE = /(?:^|[^a-z0-9])(\d{1,3})\s*(?:'?l[iıuü]|adet|adetli|pcs|pc|pack|pair|çift|cift|件|个|套|双(?!人)|入|个装|pieces|piece|set|li paket)(?![a-z])|(?:^|[^a-z0-9])x\s*(\d{1,3})(?![a-z0-9])|(?:^|[^a-z0-9])(\d{1,3})\s*x(?![a-z0-9])|(\d{1,3})\s*(?:adet|pcs)/gi;

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
      // RAM + storage ("8GB+128GB"): the larger figure is the storage.
      case "gb": out.storageGb = Math.max(out.storageGb ?? 0, n); break;
      case "tb": out.storageGb = Math.max(out.storageGb ?? 0, n * 1024); break;
    }
  }
  for (const m of title.matchAll(PACK_RE)) {
    const q = parseInt(m[1] ?? m[2] ?? m[3] ?? m[4] ?? "", 10);
    if (Number.isFinite(q) && q >= 2 && q <= 500) {
      out.packQty = q;
      break;
    }
  }
  const aud = AUDIENCE_RE.exec(t) ?? AUDIENCE_RE.exec(title);
  if (aud) {
    const word = aud[0].replace(/^[^a-z\u3400-\u9fff]+/, "");
    out.audience = /^(?:erkek|men|mens|man|male|herren|男)/.test(word) ? AUDIENCE.men : /^(?:kadin|women|womens|woman|female|ladies|damen|女)/.test(word) ? AUDIENCE.women : AUDIENCE.kids;
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
  audience: "hedef kitle",
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
    case "audience": return AUDIENCE_LABELS_TR[value] ?? String(value);
  }
}

/**
 * Accessory / spare-part markers in a title (zh, tr, en). Forms meaning "with X"
 * ("vizörlü", "kılıflı") are not accessories. Parenthesised remarks are ignored.
 */
const ACCESSORY_RE = /配件|支架|尾翼|贴纸|贴膜|保护壳|保护套|手机壳|手机套|平板壳|镜片|内衬|滤芯|滤网|表带|数据线|充电线|替换装|替换|适用于|适用|专用|改装|零件|配套|\b(?:kilif|kılıf)(?:i|lari|leri)?\b(?!l[iıuü])|\bvizor(?!l[iıuü])|\bvizör(?!l[iıuü])|\baparat|\baksesuar|\byedek\b|\bparca(?:si|lari)?\b|\bparça(?:sı|ları)?\b|\bfiltre(?:si)?\b|\bkordon(?:u)?\b|\btutucu\b|\bsticker\b|\bspoiler\b|\betiket\b|\buyumlu\b|\bicin\b|\biçin\b|\btasima cantasi\b|\btaşıma çantası\b|\bkoruma cantasi\b|\bkoruma çantası\b|\bsarj kutusu\b|\bşarj kutusu\b|\bekran koruyucu\b|\bcam koruyucu\b|\bkablosu\b|\bbagcik|\bbağcık|\bbagcigi|\bbağcığı|\byagmurlugu\b|\bkanca|\bkazik|\bkazık|\bkazigi|\bkazığı|\bpipet|\baski\b|\baskı\b|\baskisi\b|\baskısı\b|\btasima\b|\btaşıma\b|\bastar|\bkagidi\b|\bkağıdı\b|\bucu\b|\bucu seti\b|\bbaslik\b|\bbaşlık\b|\bbasligi\b|\bbaşlığı\b|\bvitrin|\bkeycap|\bmouse ?pad\b|鞋带|吸管|键帽|鼠标垫|雨罩|钻头|\b(?:case|cover|strap|visor|filter|holder|mount|replacement|spare|sticker|decal|protector|skin|pouch|charging case|compatible with|for iphone|for samsung|for xiaomi|for galaxy|for airpods|lens|liner|bracket|stand|shoelace|laces|straw|hook|rain cover|stake|pegs?|drill bits?|keycaps?|display case)\b/i;

/** Extra accessory markers (folded spelling); "charger" is a product on its own and is not one. */
const ACCESSORY_EXTRA_RE = /\bgrass box\b|\bgrass catcher\b|\btoplama sepeti\b|\baltligi\b|\bkopuk tabancasi\b|\bonlugu\b|\bonluk\b|\bcarsaf(?:i)?\b|\bbib\b|\b(?:bag|case|cover|stand|holder|mount|strap|sleeve|skin|pouch|cable|adapter|dock|kit|filter|battery|box|lid|tray|rack|hose|nozzle|brush|liner|mat|pad|clip|hook) for\b|\bpervane(?:si|leri)?\b|\bbilek destegi\b|\bwrist rest\b|\bkapak\b|\bkapagi\b|\battachments?\b|\bassembly\b|\bportafilter\b|\btamper\b|\b(?:ear|cheek|kulak|yanak) ?pad[is]?\b|\bgaskets?\b|\bconta(?:si)?\b|\bmanset(?:i)?\b|\bcuffs?\b|\blancets?\b|\bjibbitz\b|\bcharms\b|\bfootprint\b|\bzemin ortusu\b|\bortusu\b|\btabanlik\b|\bkayis(?:i)?\b|\bklips(?:i)?\b|\bconnectors?\b|\bkonektor(?:u)?\b|\bspatula(?:si)?\b|\bliners\b|\bpropellers?\b|\bstand[iı]\b|\bcarrying case\b|\bhard case\b|\bbilek bandi\b|\byedek (?:bicak|batarya|aku|filtre|kapak|tel|uc)\b|\breplacement\b|\brefill\b|\bkartus(?:u)?\b|\bcartridges?\b/;
/** Matches of the base list that are not accessories: "Alexa uyumlu" (compatible with a standard), "ciltler için" (for a group), duvet covers, watch straps, stand mixers. */
const ACCESSORY_EXCEPTION_RE = /(?:^|\s)(?:alexa|google|siri|homekit|android|ios|windows|mac|bluetooth|wifi|wi-fi|usb|hdmi|nfc|qi|pd|magsafe|airplay|chromecast|matter|zigbee|pc|ps5|ps4|xbox|switch|tv) uyumlu\b|\b\w+l[ae]r(?:[iıu]|in)? icin\b|\b(?:ofis|ev|mutfak|arac|yatak odasi|salon) icin\b|\bduvet cover\b|\bcover set\b|\b(?:resin|leather|nylon|silicone|metal|steel|rubber|fabric|canvas) strap\b|\bstand mixer\b|\bstand fan\b|\bcharger\b|\bcharging cable\b|\bwith (?:\w+ ){0,2}(?:case|cover|strap|stand|holder|bag|pouch)\b|\bdahil\b/g;

export function accessoryTerms(title: string): string[] {
  const t = title.replace(/\([^)]*\)|\[[^\]]*\]|（[^）]*）|【[^】]*】/g, " ");
  const out = new Set<string>();
  // Folded text only: ASCII word boundaries would otherwise split "standı" into "stand" + suffix.
  const folded = foldTr(t).replace(ACCESSORY_EXCEPTION_RE, " ");
  const re = new RegExp(ACCESSORY_RE.source, "gi");
  for (const m of folded.matchAll(re)) out.add(m[0]);
  const extra = new RegExp(ACCESSORY_EXTRA_RE.source, "g");
  for (const m of folded.matchAll(extra)) out.add(m[0]);
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
  "wireless", "cordless", "portable", "electric", "smart", "siyah", "beyaz", "tumbler", "styler", "multi-styler", "edition", "version",
  "global", "international", "original", "unlocked", "garantili", "fiyat", "indirim", "kampanya", "stok", "hizli", "kargo",
  "nesil", "generation", "gen", "series", "seri", "serisi", "model", "unisex", "adult", "yetiskin",
]);

/** Series qualifiers: a phrase extended by one of these (or by a number) is another model, not a longer description. */
const SERIES_WORDS = new Set(["pro", "max", "plus", "ultra", "mini", "lite", "air", "se", "fe", "neo", "prime", "edge", "note", "fold", "flip", "gt", "go", "elite", "evo", "nova", "turbo", "slim", "x", "s", "xl", "xxl", "xs", "react", "next", "ii", "iii", "iv", "v2", "v3", "titan", "shield", "mirror", "lined", "carbon"]);

/** True when a phrase token changes the model: a number ("270", "k8") or a series word ("react", "pro"). */
export function isModelQualifier(token: string): boolean {
  // Ratings and classes ("ip67", "ax3000", "spf50", "1080p") describe, they do not name a model.
  if (NOT_A_MODEL.test(token) || /^(?:ax|ac|be)\d{3,4}$/.test(token) || isUnitToken(token)) return false;
  return /\d/.test(token) || SERIES_WORDS.has(token) || /[a-z]\+$/.test(token);
}

/**
 * The ordered brand + series + number phrase of a title: folded latin tokens from the first
 * brand-like token up to the first unit, attribute or generic word (at most five tokens).
 */
const REVISION_WORDS = new Set(["version", "ver", "wi-fi", "wifi", "bluetooth", "usb", "hdmi", "gen", "generation", "nesil", "series", "seri", "nesli"]);

export function brandModelPhrase(title: string): string {
  const cleaned = title
    .replace(/\([^)]*\)|\[[^\]]*\]|（[^）]*）|【[^】]*】/g, " ")
    // "QP2520/30", "MU-PC1T0T/WW": sub-SKU after a slash does not change the model.
    .replace(/(?<=[A-Za-z0-9])\/[A-Za-z0-9]{1,3}(?![A-Za-z0-9])/g, "");
  // Any Latin-script word (Turkish, German, Scandinavian letters included) or a CJK run.
  const raw = cleaned.match(/[\p{Script=Latin}\p{N}][\p{Script=Latin}\p{N}_\-+.]*|[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]+/gu) ?? [];
  const out: string[] = [];
  let started = false;
  let dropNext = false;
  for (let i = 0; i < raw.length; i++) {
    const tok = raw[i]!;
    const isAscii = /^[\p{Script=Latin}\p{N}_\-+.]+$/u.test(tok);
    let f = foldTr(tok).replace(/\.+$/g, "");
    // "max+" keeps its plus (Q7 Max+ is not Q7 Max); "l.12.12" → "l1212"; "2nd" → "2".
    f = /[a-z]\+$/.test(f) ? f.replace(/\++$/, "+") : f.replace(/\++$/, "");
    if (/[a-z]/.test(f) && /\d/.test(f)) f = f.replace(/\./g, "");
    f = f.replace(/^(\d+)(?:st|nd|rd|th)$/, "$1");
    if (!started) {
      if (isAscii && /^\p{Script=Latin}/u.test(tok) && tok.length >= 2 && !PHRASE_STOP.has(f) && !STOP.has(f)) {
        started = true;
        out.push(f);
      }
      continue;
    }
    if (!isAscii) break;
    // A year ("2022 Series") is skipped; any other unit ("1.18L", "100W") ends the phrase.
    if (YEAR_RE.test(f)) continue;
    if (isUnitToken(f)) break;
    // "480 ml": a number followed by a unit word is an attribute, not a model token.
    const next = raw[i + 1];
    if (/^\d+(?:[.,]\d+)?$/.test(f) && next && isUnitToken(f + foldTr(next))) break;
    // "Version 2", "Wi-Fi 6", "USB 3", "11. Nesil": the number belongs to a standard or revision, not to the model.
    if (REVISION_WORDS.has(f)) {
      dropNext = true;
      continue;
    }
    if (dropNext && /^\d{1,2}$/.test(f)) {
      dropNext = false;
      continue;
    }
    dropNext = false;
    // Generic words inside the phrase ("Smart", "Kablosuz") are skipped, not terminal: "Xiaomi Smart Band 8" → "xiaomi band 8".
    if (PHRASE_STOP.has(f) || STOP.has(f)) continue;
    if (f.length === 1 && /[a-z]/.test(f)) continue;
    const prev = out[out.length - 1];
    if (prev && /^[a-z]{1,3}$/.test(prev) && /^\d{1,3}$/.test(f) && out.length >= 2) out[out.length - 1] = prev + f;
    else out.push(f);
    if (out.length >= 5) break;
  }
  return out.join(" ");
}

/** Accessory families, so a case and a screen protector of the same phone are not "the same accessory". */
const ACCESSORY_KINDS: [RegExp, string][] = [
  [/kilif|^case$|hard case|carrying case|cover|手机壳|手机套|保护壳|保护套|平板壳|pouch|tasima cantasi|koruma cantasi/, "case"],
  [/ekran koruyucu|cam koruyucu|protector|贴膜|skin/, "protector"],
  [/kordon|strap|表带|kayis|bilek bandi/, "strap"],
  [/vizor|visor|镜片|lens/, "visor"],
  [/filtre|filter|滤芯|滤网/, "filter"],
  [/sticker|decal|贴纸|etiket/, "sticker"],
  [/tutucu|holder|mount|stand|bracket|支架|aski|tripod/, "holder"],
  [/sarj kutusu|charging case/, "charging-case"],
  [/kablosu|cable|数据线|充电线/, "cable"],
  [/yedek|replacement|spare|refill|替换|kartus|cartridge|lancet|bicak|blade/, "spare"],
  [/pervane|propeller/, "propeller"],
  [/bagcik|laces|shoelace|鞋带/, "laces"],
  [/pad|pedi/, "pad"],
  [/kapak|kapagi|gasket|conta/, "lid"],
  [/bilek destegi|wrist rest/, "wrist-rest"],
  [/keycap|键帽/, "keycap"],
  [/mouse ?pad|鼠标垫/, "mousepad"],
];

/** Family of an accessory term ("kilif" → "case"), or undefined for terms that only mark an accessory ("icin", "uyumlu"). */
export function accessoryKind(term: string): string | undefined {
  const t = foldTr(term);
  for (const [re, kind] of ACCESSORY_KINDS) if (re.test(t)) return kind;
  return undefined;
}

/** Lookalike / replica markers: the listing imitates the queried product rather than being it. */
const LOOKALIKE_RE = /\breplika\b|\breplica\b|\b1:1\b|\ba\+ ?kalite\b|\bhigh copy\b|\bclone\b|\bbenzeri\b|\btarzi\b|\bmuadil(?:i)?\b|\bsame style\b|\bstyle\b(?!\s+\S*\d)|\binspired\b|\bcompatible\b(?!\s+with)|\bimitation\b|\bknock ?off\b|高仿|仿品|a货|复刻版/;

/** Lookalike markers in a title (folded spelling): "replika", "benzeri", "574 style", "1:1", "高仿". */
export function lookalikeTerms(title: string): string[] {
  const re = new RegExp(LOOKALIKE_RE.source, "g");
  return [...new Set([...foldTr(title).matchAll(re)].map((m) => m[0]))];
}

export type PhraseRelation = "none" | "exact" | "variant" | "conflict";

/** Phrase tokens are equal when identical or when one is the other's regional / kit code ("af300" ~ "af300eu"). */
function tokEq(a: string, b: string): boolean {
  return a === b || (/\d/.test(a) && /\d/.test(b) && sameModelCode(a.toUpperCase(), b.toUpperCase()));
}

/** How two brand+model phrases relate: exact, one is a prefix/contains the other (variant), or none. */
export function phraseRelation(a: string, b: string): PhraseRelation {
  if (!a || !b) return "none";
  const ta = a.split(" ");
  const tb = b.split(" ");
  // A lone word ("stanley") or a bare brand + line ("philips hue") is not a model phrase.
  if (a === b) return ta.length >= 3 || /\d/.test(a) ? "exact" : "none";
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  // Same series, different number ("nike air max 270" vs "nike air max 90"): a model conflict.
  let common = 0;
  while (common < short.length && common < long.length && tokEq(short[common]!, long[common]!)) common++;
  const brandFirst = /^[a-z][a-z.-]+$/.test(short[0]!);
  if (common >= (brandFirst ? 1 : 2) && common < short.length && /\d/.test(short[common]!) && /\d/.test(long[common]!)) return "conflict";
  if (short.length < 2 || !short.some((t) => /\d/.test(t))) return "none";
  // Contiguous token sub-sequence.
  for (let i = 0; i + short.length <= long.length; i++) {
    let ok = true;
    for (let j = 0; j < short.length; j++) if (!tokEq(long[i + j]!, short[j]!)) { ok = false; break; }
    if (ok) {
      // Extra tokens only on the left (brand prepended) → effectively the same phrase.
      if (i + short.length === long.length) return "exact";
      // Trailing descriptors ("race", "diamond", "kulak ustu") do not change the model; a number or series word does.
      const extra = long.slice(i + short.length);
      return extra.some(isModelQualifier) ? "variant" : "exact";
    }
  }
  // Both continue after a shared numbered prefix ("xiaomi humidifier 2 nemlendirici" vs "xiaomi humidifier 2 lite").
  if (common >= 2 && short.slice(0, common).some((t) => /\d/.test(t))) {
    const qa = new Set(short.slice(common).filter(isModelQualifier));
    const qb = new Set(long.slice(common).filter(isModelQualifier));
    const onlyA = [...qa].filter((t) => !qb.has(t));
    const onlyB = [...qb].filter((t) => !qa.has(t));
    if (onlyA.length && onlyB.length) return "conflict";
    if (onlyA.length || onlyB.length) return "variant";
    return "exact";
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
