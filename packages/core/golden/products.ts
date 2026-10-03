/**
 * Source table for the generated part of the golden dataset (PLAN §7.1). Every entry is a real
 * product with its Turkish query, the zh/en ladder rungs the orchestrator would send, and labelled
 * candidate titles as the markets list them. `buildGoldenCases()` turns the table into cases in the
 * same shape as the hand-written ones in cases.json; `scripts/golden-build.ts` writes them there.
 *
 * Labels: same = identical product (rephrased, other language, other market); variant = same brand
 * or series, different model / capacity / colour / pack size; accessory = part, case, filter … of
 * the product; different = another product (other brand, lookalike, replica, generic of the same
 * category). Titles carry no personal data.
 */
import type { GoldenCandidate, GoldenCase, GoldenLabel } from "./evaluate";

export interface GoldenProduct {
  /** Case id stem; "<id>" is the text case, "<id>-img" the image case, "<id>-pack" the pack-size case. */
  id: string;
  /** Taxonomy group key (packages/adapters/src/mock/taxonomy.ts). */
  group: string;
  /** Taxonomy leaf key, when the query is generic (category-level) rather than a branded product. */
  category?: string;
  /** Turkish query as the user types it. */
  q: string;
  /** Ladder rungs: Chinese and English renderings of the query. */
  zh?: string;
  en?: string;
  same?: string[];
  variant?: string[];
  accessory?: string[];
  different?: string[];
  /** Also emit an image case: same candidates share the query hash, others get a far hash. */
  img?: boolean;
  /** Pack-size case: [title with the same pack, title with another pack (variant)]. */
  pack?: [string, string];
  note?: string;
}

const CN_MARKETS = ["cn-1688", "cn-taobao", "cn-pinduoduo"];
const TR_MARKETS = ["tr-trendyol", "tr-hepsiburada", "tr-n11", "tr-amazon"];
const EN_MARKETS = ["cn-alibaba", "us-amazon", "cn-aliexpress", "us-ebay", "gb-amazon", "cn-madeinchina", "cn-dhgate"];
const TR_WORDS = /\b(ve|ile|adet|siyah|beyaz|kablosuz|orijinal|paket|erkek|kadın|çocuk|set|lü|li|lu|lı)\b/i;

/** Market for a candidate title: Chinese script → China retail, Turkish letters → Turkish markets, else English-language markets. */
export function marketFor(title: string, i: number): string {
  if (/[㐀-鿿]/.test(title)) return CN_MARKETS[i % CN_MARKETS.length]!;
  if (/[çğıöşüÇĞİÖŞÜ]/.test(title) || TR_WORDS.test(title)) return TR_MARKETS[i % TR_MARKETS.length]!;
  return EN_MARKETS[i % EN_MARKETS.length]!;
}

/** Deterministic 64-bit hex hash of a string (FNV-1a over two halves). */
export function fakePhash(seed: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < seed.length; i++) {
    const c = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (c * 31), 0x811c9dc5) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

/** A hash that differs from `hash` in 32 of 64 bits (Hamming similarity 0.5: clearly another image). */
export function farPhash(hash: string): string {
  const a = (parseInt(hash.slice(0, 8), 16) ^ 0xa5a5a5a5) >>> 0;
  const b = (parseInt(hash.slice(8), 16) ^ 0x5a5a5a5a) >>> 0;
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

function candidates(p: GoldenProduct, labels: GoldenLabel[], withHash?: string): GoldenCandidate[] {
  const out: GoldenCandidate[] = [];
  let i = 0;
  for (const label of labels) {
    for (const title of p[label] ?? []) {
      const c: GoldenCandidate = { title, market: marketFor(title, i++), label };
      // Only products of the leaf carry its key; an accessory or another product is not in that leaf.
      if (p.category && (label === "same" || label === "variant")) c.category = p.category;
      if (withHash) c.phash = label === "same" ? withHash : farPhash(fakePhash(`${p.id}:${title}`));
      out.push(c);
    }
  }
  return out;
}

/** Cases generated from one product: text (always), image (`img`), pack size (`pack`). */
export function casesOf(p: GoldenProduct): GoldenCase[] {
  const alt = [p.zh, p.en].filter((x): x is string => !!x);
  const base = { title: p.q, ...(alt.length ? { altTitles: alt } : {}), ...(p.category ? { category: p.category } : {}) };
  const out: GoldenCase[] = [];
  out.push({ id: p.id, group: p.group, query: base, candidates: candidates(p, ["same", "variant", "accessory", "different"]), ...(p.note ? { note: p.note } : {}) });
  if (p.img) {
    const hash = fakePhash(p.id);
    out.push({ id: `${p.id}-img`, group: p.group, query: { ...base, phash: hash }, candidates: candidates(p, ["same", "accessory", "different"], hash), note: "görsel: aynı ürün aynı hash, diğerleri uzak hash" });
  }
  if (p.pack) {
    const [samePack, otherPack] = p.pack;
    const others = (p.different ?? []).slice(0, 1);
    out.push({
      id: `${p.id}-pack`,
      group: p.group,
      query: { title: p.q, ...(alt.length ? { altTitles: alt } : {}) },
      candidates: [
        { title: samePack, market: marketFor(samePack, 0), label: "same" },
        { title: otherPack, market: marketFor(otherPack, 1), label: "variant", note: "farklı paket adedi" },
        ...others.map((t, i): GoldenCandidate => ({ title: t, market: marketFor(t, i + 2), label: "different" })),
      ],
      note: "paket adedi: aynı paket = same, farklı paket = variant",
    });
  }
  return out;
}

export function buildGoldenCases(products: GoldenProduct[] = PRODUCTS): GoldenCase[] {
  return products.flatMap(casesOf);
}

/* ----------------------------------------------------------------------------------------------- */

export const PRODUCTS: GoldenProduct[] = [
  // ───────────────────────────── electronics ─────────────────────────────
  {
    id: "buds-anker-p20i", group: "electronics", img: true,
    q: "Anker Soundcore P20i Kablosuz Kulaklık", zh: "Anker Soundcore P20i 真无线蓝牙耳机", en: "Anker Soundcore P20i true wireless earbuds",
    same: ["Soundcore by Anker P20i True Wireless Earbuds, 10mm Drivers, Bluetooth 5.3, 30H Playtime", "安克 Soundcore P20i 真无线蓝牙耳机 黑色 跨境", "Anker Soundcore P20i TWS Bluetooth Kulaklık Siyah"],
    variant: ["Anker Soundcore P30i Kablosuz Kulaklık ANC", "Soundcore by Anker Life P2 Mini TWS Earbuds"],
    accessory: ["Soundcore P20i Silikon Kılıf Karabinalı", "Replacement charging case for Anker Soundcore P20i"],
    different: ["JBL Tune 230NC TWS Kablosuz Kulaklık", "Pro 2 Style TWS Earbuds ANC 1:1 Replica Wireless Headset"],
  },
  {
    id: "speaker-jbl-flip6", group: "electronics", img: true,
    q: "JBL Flip 6 Bluetooth Hoparlör", zh: "JBL Flip 6 蓝牙音箱", en: "JBL Flip 6 portable bluetooth speaker",
    same: ["JBL Flip 6 Portable Bluetooth Speaker, Waterproof IP67, Black", "JBL FLIP6 音乐万花筒6代 便携式蓝牙音箱 防水", "JBL Flip 6 Taşınabilir Su Geçirmez Bluetooth Hoparlör Siyah"],
    variant: ["JBL Flip 5 Bluetooth Hoparlör Mavi", "JBL Charge 5 Taşınabilir Hoparlör"],
    accessory: ["JBL Flip 6 Taşıma Çantası Sert Kılıf", "Silicone case for JBL Flip 6 speaker with strap"],
    different: ["Anker Soundcore Motion+ Bluetooth Speaker", "Flip 6 tarzı taşınabilir bluetooth hoparlör A+ kalite replika"],
  },
  {
    id: "band-xiaomi-8", group: "electronics", img: true,
    q: "Xiaomi Mi Band 8 Akıllı Bileklik", zh: "小米手环8", en: "Xiaomi Smart Band 8 fitness tracker",
    same: ["Xiaomi Smart Band 8 Global Version Fitness Tracker AMOLED", "小米手环8 NFC版 运动健康智能手环 血氧", "Xiaomi Mi Band 8 Akıllı Bileklik Siyah Global"],
    variant: ["Xiaomi Smart Band 8 Pro Akıllı Bileklik", "Xiaomi Mi Band 7 Akıllı Bileklik"],
    accessory: ["Mi Band 8 Silikon Kordon Renkli", "Tempered glass screen protector for Xiaomi Band 8"],
    different: ["Huawei Band 8 Akıllı Bileklik", "Fitbit Inspire 3 Fitness Tracker"],
  },
  {
    id: "phone-samsung-a54", group: "electronics", img: true,
    q: "Samsung Galaxy A54 5G 128GB", zh: "三星 Galaxy A54 5G 128GB", en: "Samsung Galaxy A54 5G 128GB smartphone",
    same: ["Samsung Galaxy A54 5G 128 GB 8 GB Ram Siyah Cep Telefonu", "Samsung Galaxy A54 5G A546 128GB Awesome Graphite Unlocked", "三星 Galaxy A54 5G 8GB+128GB 全网通手机"],
    variant: ["Samsung Galaxy A54 5G 256GB Mor", "Samsung Galaxy A34 5G 128GB Siyah"],
    accessory: ["Samsung Galaxy A54 Kılıf Şeffaf Silikon", "Galaxy A54 5G tempered glass screen protector 2 pack"],
    different: ["Xiaomi Redmi Note 12 Pro 5G 128GB", "iPhone 13 128GB Yenilenmiş"],
  },
  {
    id: "pb-baseus-blade", group: "electronics", img: true,
    q: "Baseus Blade 20000mAh 100W Powerbank", zh: "倍思 Blade 20000mAh 100W 移动电源", en: "Baseus Blade 20000mAh 100W power bank",
    same: ["Baseus Blade 100W 20000mAh Laptop Power Bank PD3.0 USB-C", "倍思 Blade 刀锋 100W 20000毫安 笔记本移动电源", "Baseus Blade Serisi 20000 mAh 100W Hızlı Şarj Powerbank"],
    variant: ["Baseus Blade HD 20000mAh 65W Powerbank", "Baseus Bipow 10000mAh 20W Powerbank"],
    accessory: ["Baseus 100W USB-C to USB-C Kablo 1m", "Powerbank taşıma kılıfı 20000mAh uyumlu"],
    different: ["Anker 737 PowerCore 24K 140W Powerbank", "Xiaomi 20000mAh 50W Powerbank"],
  },
  {
    id: "charger-ugreen-100w", group: "electronics", img: true,
    q: "Ugreen Nexode 100W GaN Şarj Adaptörü", zh: "绿联 Nexode 100W 氮化镓充电器", en: "Ugreen Nexode 100W GaN charger 4 port",
    same: ["UGREEN Nexode 100W USB C Charger 4-Port GaN Fast Charger", "绿联 100W 氮化镓充电器 四口 Nexode 多口快充", "Ugreen Nexode 100W GaN 4 Portlu Hızlı Şarj Cihazı"],
    variant: ["Ugreen Nexode 65W GaN Şarj Adaptörü 3 Port", "Ugreen Nexode 140W GaN Charger"],
    accessory: ["Ugreen 100W USB-C Kablo 2m", "Ugreen GaN şarj cihazı seyahat kılıfı"],
    different: ["Baseus GaN5 Pro 100W Şarj Adaptörü", "Anker 736 Nano II 100W Charger"],
  },
  {
    id: "cam-tapo-c200", group: "electronics", img: true,
    q: "TP-Link Tapo C200 IP Kamera", zh: "TP-Link Tapo C200 家用摄像头", en: "TP-Link Tapo C200 pan tilt home security camera",
    same: ["TP-Link Tapo C200 1080P Pan/Tilt Home Security Wi-Fi Camera", "TP-LINK Tapo C200 云台无线监控摄像头 1080P", "TP-Link Tapo C200 Full HD Wi-Fi Hareketli Güvenlik Kamerası"],
    variant: ["TP-Link Tapo C210 3MP IP Kamera", "TP-Link Tapo C100 Sabit Kamera"],
    accessory: ["Tapo C200 Duvar Montaj Aparatı", "64GB microSD card for Tapo camera"],
    different: ["Xiaomi Mi 360 Home Security Camera 2K", "Ezviz C6N IP Kamera"],
  },
  {
    id: "hp-sony-xm5", group: "electronics", img: true,
    q: "Sony WH-1000XM5 Kulak Üstü Kulaklık", zh: "索尼 WH-1000XM5 头戴式降噪耳机", en: "Sony WH-1000XM5 noise cancelling headphones",
    same: ["Sony WH-1000XM5 Wireless Industry Leading Noise Canceling Headphones Black", "索尼 WH-1000XM5 头戴式无线降噪耳机 黑色 国行", "Sony WH-1000XM5 Kablosuz Gürültü Önleyici Kulaklık Siyah"],
    variant: ["Sony WH-1000XM4 Kablosuz Kulaklık", "Sony WF-1000XM5 Kulak İçi Kulaklık"],
    accessory: ["Sony WH-1000XM5 Kulak Pedi Yedek", "Hard case for Sony WH-1000XM5 headphones"],
    different: ["Bose QuietComfort 45 Kulaklık", "XM5 style wireless headphones ANC high copy"],
  },
  {
    id: "webcam-logi-c920", group: "electronics", img: true,
    q: "Logitech C920 HD Pro Webcam", zh: "罗技 C920 高清网络摄像头", en: "Logitech C920 HD Pro webcam 1080p",
    same: ["Logitech C920 HD Pro Webcam, Full HD 1080p/30fps Video Calling", "罗技 C920 PRO 高清网络摄像头 1080P 直播", "Logitech C920 HD Pro 1080p Webcam Siyah"],
    variant: ["Logitech C922 Pro Stream Webcam", "Logitech C270 HD Webcam"],
    accessory: ["Logitech C920 Gizlilik Kapağı", "Tripod stand for Logitech C920 webcam"],
    different: ["Razer Kiyo Pro Webcam", "Full HD 1080p USB Webcam Mikrofonlu"],
  },
  {
    id: "usb-kingston-exodia", group: "electronics", pack: ["Kingston DataTraveler Exodia 64GB USB 3.2 Flash Bellek Tekli", "Kingston DataTraveler Exodia 64GB USB Bellek 3'lü Paket"],
    q: "Kingston DataTraveler Exodia 64GB USB Bellek", zh: "金士顿 DataTraveler Exodia 64GB U盘", en: "Kingston DataTraveler Exodia 64GB USB 3.2 flash drive",
    same: ["Kingston DataTraveler Exodia DTX/64GB USB 3.2 Flash Drive", "金士顿 DTX 64GB USB3.2 U盘 Exodia", "Kingston DTX/64GB DataTraveler Exodia USB 3.2 Flash Bellek"],
    variant: ["Kingston DataTraveler Exodia 128GB USB Bellek", "Kingston DataTraveler Exodia M 64GB"],
    accessory: ["USB bellek koruma kılıfı 10'lu"],
    different: ["SanDisk Ultra Flair 64GB USB 3.0", "Samsung BAR Plus 64GB USB 3.1"],
  },
  {
    id: "ssd-samsung-t7", group: "electronics", img: true,
    q: "Samsung T7 1TB Taşınabilir SSD", zh: "三星 T7 1TB 移动固态硬盘", en: "Samsung T7 1TB portable SSD",
    same: ["SAMSUNG T7 Portable SSD 1TB USB 3.2 Gen 2 External Solid State Drive MU-PC1T0T", "三星 T7 1TB 移动固态硬盘 PSSD USB3.2", "Samsung T7 1TB USB 3.2 Taşınabilir SSD Gri MU-PC1T0T/WW"],
    variant: ["Samsung T7 2TB Taşınabilir SSD", "Samsung T7 Shield 1TB Taşınabilir SSD"],
    accessory: ["Samsung T7 SSD Kılıf Silikon", "USB-C cable for Samsung T7 SSD"],
    different: ["SanDisk Extreme 1TB Portable SSD", "Crucial X9 1TB Taşınabilir SSD"],
  },
  {
    id: "watch-amazfit-gts4", group: "electronics", img: true,
    q: "Amazfit GTS 4 Akıllı Saat", zh: "华米 Amazfit GTS 4 智能手表", en: "Amazfit GTS 4 smart watch",
    same: ["Amazfit GTS 4 Smart Watch for Android iPhone, Alexa Built-in, GPS", "Amazfit GTS 4 跃我 智能手表 运动 血氧 GPS", "Amazfit GTS 4 Akıllı Saat Siyah Alexa"],
    variant: ["Amazfit GTS 4 Mini Akıllı Saat", "Amazfit GTR 4 Akıllı Saat"],
    accessory: ["Amazfit GTS 4 Silikon Kordon 20mm", "Amazfit GTS 4 ekran koruyucu film"],
    different: ["Huawei Watch Fit 2 Akıllı Saat", "Xiaomi Redmi Watch 3"],
  },
  {
    id: "drone-dji-mini4", group: "electronics", img: true,
    q: "DJI Mini 4 Pro Drone", zh: "大疆 DJI Mini 4 Pro 无人机", en: "DJI Mini 4 Pro drone fly more combo",
    same: ["DJI Mini 4 Pro Fly More Combo with DJI RC 2 Drone 4K", "大疆 DJI Mini 4 Pro 迷你航拍无人机 畅飞套装", "DJI Mini 4 Pro Fly More Combo RC 2 Drone"],
    variant: ["DJI Mini 3 Pro Drone", "DJI Mini 4K Drone"],
    accessory: ["DJI Mini 4 Pro Pervane Seti 2 Çift", "ND filter set for DJI Mini 4 Pro"],
    different: ["Autel EVO Nano+ Drone", "Mini 4 Pro benzeri katlanabilir 4K drone GPS"],
  },
  {
    id: "speaker-jbl-go3", group: "electronics", pack: ["JBL Go 3 Bluetooth Hoparlör Siyah 1 Adet", "JBL Go 3 Bluetooth Hoparlör 2'li Paket"],
    q: "JBL Go 3 Bluetooth Hoparlör", zh: "JBL GO3 蓝牙音箱", en: "JBL Go 3 portable speaker",
    same: ["JBL Go 3: Portable Speaker with Bluetooth, Waterproof, Black", "JBL GO3 音乐金砖三代 便携蓝牙音箱", "JBL Go 3 Taşınabilir Bluetooth Hoparlör Siyah"],
    variant: ["JBL Go 2 Bluetooth Hoparlör", "JBL Clip 4 Bluetooth Hoparlör"],
    accessory: ["JBL Go 3 Karabina Kılıf", "Carrying case for JBL Go 3"],
    different: ["Sony SRS-XB13 Bluetooth Hoparlör", "Go 3 same style mini bluetooth speaker OEM"],
  },
  {
    id: "bulb-hue-e27", group: "electronics", pack: ["Philips Hue White and Color Ambiance E27 Akıllı Ampul Tekli", "Philips Hue White & Color Ambiance E27 Smart Bulb 3 Pack"],
    q: "Philips Hue White and Color Ambiance E27 Akıllı Ampul", zh: "飞利浦 Hue 彩光智能灯泡 E27", en: "Philips Hue white and color ambiance E27 smart bulb",
    same: ["Philips Hue White and Color Ambiance E27 Smart LED Bulb 1100 Lumen", "飞利浦 Hue 彩光智能灯泡 E27 1100流明 蓝牙", "Philips Hue White and Color Ambiance E27 Akıllı LED Ampul Bluetooth"],
    variant: ["Philips Hue White Ambiance E27 Akıllı Ampul", "Philips Hue White and Color Ambiance GU10 Spot"],
    accessory: ["Philips Hue Bridge", "Philips Hue Dimmer Switch"],
    different: ["Xiaomi Yeelight Smart LED Bulb E27 1S", "Wiz Connected E27 Akıllı Ampul"],
  },
  {
    id: "ereader-kindle-pw", group: "electronics",
    q: "Amazon Kindle Paperwhite 11. Nesil 16GB", zh: "亚马逊 Kindle Paperwhite 11代 16GB 电子书", en: "Kindle Paperwhite 11th gen 16GB e-reader",
    same: ["Kindle Paperwhite (16 GB) 6.8\" display, adjustable warm light, 11th Generation", "Kindle Paperwhite 5 第11代 16GB 6.8英寸 电子书阅读器", "Amazon Kindle Paperwhite 11. Nesil 6.8\" 16GB E-Kitap Okuyucu"],
    variant: ["Kindle Paperwhite Signature Edition 32GB", "Amazon Kindle 11. Nesil 16GB 6\""],
    accessory: ["Kindle Paperwhite 11. Nesil Kılıf Mavi", "Screen protector for Kindle Paperwhite 6.8"],
    different: ["Kobo Clara 2E E-Kitap Okuyucu", "PocketBook Verse Pro"],
  },
  // ───────────────────────────── computer ─────────────────────────────
  {
    id: "router-tplink-ax55", group: "computer", img: true,
    q: "TP-Link Archer AX55 Wi-Fi 6 Router", zh: "TP-Link Archer AX55 WiFi6 路由器", en: "TP-Link Archer AX55 AX3000 WiFi 6 router",
    same: ["TP-Link AX3000 WiFi 6 Router Archer AX55 Dual Band Gigabit", "TP-LINK Archer AX55 AX3000 双频千兆 WiFi6 无线路由器", "TP-Link Archer AX55 AX3000 Mbps Wi-Fi 6 Router"],
    variant: ["TP-Link Archer AX53 AX3000 Router", "TP-Link Archer AX73 AX5400 Router"],
    accessory: ["Archer AX55 Duvar Montaj Aparatı", "Cat6 ethernet cable 2m for router"],
    different: ["ASUS RT-AX58U Wi-Fi 6 Router", "Xiaomi AX3000 Router"],
  },
  {
    id: "hub-anker-7in1", group: "computer", img: true,
    q: "Anker 7-in-1 USB-C Hub", zh: "Anker 安克 七合一 USB-C 扩展坞", en: "Anker 7 in 1 USB C hub adapter",
    same: ["Anker USB C Hub, 7-in-1 Adapter with 4K HDMI, 100W PD, SD Card Reader", "安克 Anker 七合一 Type-C 扩展坞 4K HDMI 100W PD", "Anker PowerExpand 7-in-1 USB-C Hub 4K HDMI"],
    variant: ["Anker 5-in-1 USB-C Hub", "Anker 341 USB-C Hub 7 in 1 A8346"],
    accessory: ["USB-C hub taşıma çantası"],
    different: ["Ugreen 7-in-1 USB-C Hub 4K HDMI", "Baseus 8-in-1 Type-C Docking Station"],
  },
  {
    id: "mouse-mx-master-3s", group: "computer", img: true,
    q: "Logitech MX Master 3S Kablosuz Mouse", zh: "罗技 MX Master 3S 无线鼠标", en: "Logitech MX Master 3S wireless mouse",
    same: ["Logitech MX Master 3S Wireless Performance Mouse, Ergo, 8K DPI, Quiet Clicks, Graphite", "罗技 MX Master 3S 无线蓝牙鼠标 办公 静音 石墨黑", "Logitech MX Master 3S Kablosuz Performans Mouse Grafit 910-006559"],
    variant: ["Logitech MX Master 3 Kablosuz Mouse", "Logitech MX Anywhere 3S Mouse"],
    accessory: ["Logitech MX Master 3S Mouse Pad", "Logi Bolt USB receiver"],
    different: ["Razer Pro Click Kablosuz Mouse", "MX Master 3S style ergonomic wireless mouse OEM"],
  },
  {
    id: "keyboard-keychron-k8", group: "computer", img: true,
    q: "Keychron K8 Mekanik Klavye", zh: "Keychron K8 机械键盘", en: "Keychron K8 wireless mechanical keyboard",
    same: ["Keychron K8 Tenkeyless Wireless Mechanical Keyboard Gateron Brown RGB Hot-swappable", "Keychron K8 无线机械键盘 87键 热插拔 RGB", "Keychron K8 TKL Kablosuz Mekanik Klavye Gateron Brown"],
    variant: ["Keychron K8 Pro Mekanik Klavye QMK", "Keychron K2 Mekanik Klavye"],
    accessory: ["Keychron K8 Ahşap Bilek Desteği", "Keycap set PBT for Keychron K8"],
    different: ["Royal Kludge RK87 Mekanik Klavye", "Logitech G Pro X TKL Klavye"],
  },
  {
    id: "tablet-wacom-ctl4100", group: "computer", img: true,
    q: "Wacom Intuos S Grafik Tablet", zh: "Wacom Intuos S 数位板 CTL-4100", en: "Wacom Intuos Small graphics tablet CTL-4100",
    same: ["Wacom Intuos Small Graphics Drawing Tablet CTL4100 Black", "Wacom Intuos S 数位板 CTL-4100 手绘板 电脑绘画", "Wacom Intuos S CTL-4100 Grafik Tablet Siyah"],
    variant: ["Wacom Intuos M CTL-6100WL Grafik Tablet", "Wacom One by Wacom CTL-472"],
    accessory: ["Wacom Intuos Yedek Uç Seti 5'li", "Wacom Pen 4K LP1100K replacement"],
    different: ["XP-Pen Deco 01 V2 Grafik Tablet", "Huion H640P Drawing Tablet"],
  },
  {
    id: "ups-apc-650", group: "computer", img: true,
    q: "APC Back-UPS BX650MI 650VA", zh: "APC Back-UPS BX650MI 650VA 不间断电源", en: "APC Back-UPS BX650MI 650VA UPS",
    same: ["APC Back-UPS 650VA UPS Battery Backup BX650MI-GR 4 Schuko", "APC BX650MI-GR 650VA 后备式 UPS 不间断电源", "APC Back-UPS BX650MI-GR 650VA 325W Kesintisiz Güç Kaynağı"],
    variant: ["APC Back-UPS BX950MI 950VA", "APC Easy UPS BV650I"],
    accessory: ["APC RBC17 Yedek Akü", "UPS replacement battery 12V 7Ah"],
    different: ["Eaton 3S 700VA UPS", "CyberPower UT650EG 650VA"],
  },
  {
    id: "projector-xgimi-elfin", group: "computer", img: true,
    q: "XGIMI Elfin Projeksiyon Cihazı", zh: "极米 XGIMI Elfin 投影仪", en: "XGIMI Elfin 1080p projector",
    same: ["XGIMI Elfin Mini Projector 1080P Full HD 800 ANSI Lumens Android TV", "极米 XGIMI Elfin 投影仪 1080P 家用 便携 智能", "XGIMI Elfin 800 ANSI Lümen 1080p Mini Projeksiyon Cihazı"],
    variant: ["XGIMI Horizon Pro 4K Projeksiyon", "XGIMI MoGo 2 Pro Projeksiyon"],
    accessory: ["XGIMI Elfin Taşıma Çantası", "Projector tripod stand for XGIMI"],
    different: ["Anker Nebula Capsule 3 Projeksiyon", "Elfin benzeri 1080p mini projektör Android"],
  },
  {
    id: "laptop-stand-generic", group: "computer", category: "laptop-standi",
    q: "alüminyum laptop standı", zh: "铝合金笔记本支架", en: "aluminum laptop stand",
    variant: ["Ayarlanabilir Alüminyum Laptop Standı Katlanabilir 10-17 inç", "铝合金笔记本电脑支架 可折叠 升降 散热 便携", "Adjustable aluminum laptop stand foldable ergonomic riser"],
    accessory: ["Laptop standı taşıma çantası"],
    different: ["Monitör Yükseltici Ahşap Masa Rafı", "Laptop Soğutucu Altlık 5 Fanlı RGB"],
  },
  // ───────────────────────────── home ─────────────────────────────
  {
    id: "thermos-zojirushi-sm", group: "home", img: true,
    q: "Zojirushi SM-SA48 480ml Termos", zh: "象印 SM-SA48 480ml 保温杯", en: "Zojirushi SM-SA48 stainless mug 480ml",
    same: ["Zojirushi SM-SA48-BA Stainless Steel Mug, 16-Ounce, Black", "象印 SM-SA48 保温杯 480ml 不锈钢 黑色", "Zojirushi SM-SA48 480 ml Paslanmaz Çelik Termos Bardak Siyah"],
    variant: ["Zojirushi SM-SA36 360ml Termos", "Zojirushi SM-SF60 600ml Termos"],
    accessory: ["Zojirushi SM-SA48 Yedek Kapak Seti", "Replacement gasket for Zojirushi SM-SA48"],
    different: ["Thermos FUNtainer 470ml", "Stanley Classic 470ml Termos"],
  },
  {
    id: "box-locknlock-glass", group: "home", pack: ["Lock&Lock Cam Saklama Kabı 1 L Tekli", "Lock&Lock Oven Glass Saklama Kabı 1 L 3'lü Set"],
    q: "Lock&Lock Oven Glass Cam Saklama Kabı 1 L", zh: "乐扣乐扣 耐热玻璃保鲜盒 1L", en: "Lock & Lock oven glass food container 1L",
    same: ["LocknLock Oven Glass Rectangular Food Container 1L LLG445", "乐扣乐扣 耐热玻璃保鲜盒 长方形 1000ml LLG445", "Lock&Lock LLG445 Oven Glass Dikdörtgen Cam Saklama Kabı 1000 ml"],
    variant: ["Lock&Lock Oven Glass Cam Saklama Kabı 2 L", "Lock&Lock Classic Plastik Saklama Kabı 1 L"],
    accessory: ["Lock&Lock LLG445 Yedek Kapak"],
    different: ["Pyrex Cook&Go Cam Saklama Kabı 1 L", "Borosilikat cam saklama kabı 1000 ml bambu kapaklı"],
  },
  {
    id: "pan-tefal-titanium-28", group: "home", img: true,
    q: "Tefal Titanium Excellence 28 cm Tava", zh: "特福 Titanium Excellence 28cm 不粘锅", en: "Tefal Titanium Excellence frying pan 28 cm",
    same: ["Tefal Titanium Excellence 28 cm Yapışmaz Tava Thermo-Spot", "Tefal G2690672 Titanium Excellence Frying Pan 28cm Non-stick", "特福 Tefal 钛合金 Titanium Excellence 28cm 平底煎锅 不粘"],
    variant: ["Tefal Titanium Excellence 24 cm Tava", "Tefal Titanium Fusion 28 cm Tava"],
    accessory: ["Tefal 28 cm Cam Tava Kapağı", "Silicone handle cover for Tefal pan"],
    different: ["Karaca Bio Granit 28 cm Tava", "Ballarini Parma 28 cm Tava"],
  },
  {
    id: "humidifier-xiaomi-smart2", group: "home", img: true,
    q: "Xiaomi Smart Humidifier 2 Nemlendirici", zh: "小米 米家智能加湿器2", en: "Xiaomi Smart Humidifier 2",
    same: ["Xiaomi Smart Humidifier 2 4L Ultrasonic Mist Maker App Control", "米家智能加湿器2 4L 大容量 卧室 静音", "Xiaomi Smart Humidifier 2 4 L Hava Nemlendirici Beyaz"],
    variant: ["Xiaomi Smart Humidifier 2 Lite", "Xiaomi Smart Antibacterial Humidifier"],
    accessory: ["Xiaomi Smart Humidifier 2 Filtre", "Replacement cotton swab for Xiaomi humidifier"],
    different: ["Levoit Classic 300S Nemlendirici", "Philips HU2510 Nemlendirici"],
  },
  {
    id: "ledstrip-govee-h6159", group: "home", pack: ["Govee H6159 RGB LED Şerit 5 m Tek Rulo", "Govee H6159 RGB LED Strip 10m 2 Rolls Pack"],
    q: "Govee H6159 RGB LED Şerit 5 m", zh: "Govee H6159 RGB 灯带 5米", en: "Govee H6159 RGB LED strip lights 5m",
    same: ["Govee RGB LED Strip Lights 16.4ft Wi-Fi App Control H6159", "Govee H6159 智能RGB灯带 5米 WiFi 蓝牙 语音控制", "Govee H6159 Wi-Fi RGB LED Şerit 5 m Alexa Uyumlu"],
    variant: ["Govee H6163 RGBIC LED Şerit 5 m", "Govee H6159 LED Şerit 10 m"],
    accessory: ["LED şerit bağlantı konektörü 4 pin 10'lu", "LED strip corner connector 4 pin"],
    different: ["Philips Hue Lightstrip Plus 2 m", "WiFi RGB LED şerit 5 m 5050 akıllı"],
  },
  {
    id: "lamp-xiaomi-1s", group: "home", img: true,
    q: "Xiaomi Mi Smart LED Desk Lamp 1S", zh: "米家 LED 智能台灯 1S", en: "Xiaomi Mi Smart LED Desk Lamp 1S",
    same: ["Xiaomi Mi Smart LED Desk Lamp 1S Dimmable Eye Care 4 Modes", "米家 LED 智能台灯1S 护眼 学生 读写 可调色温", "Xiaomi Mi Smart LED Masa Lambası 1S Beyaz"],
    variant: ["Xiaomi Mi Smart LED Desk Lamp Pro", "Xiaomi Mijia Desk Lamp Lite"],
    accessory: ["Masa lambası kelepçe tutucu"],
    different: ["Baseus Smart Eye LED Masa Lambası", "Philips LED Masa Lambası Ayarlanabilir"],
  },
  {
    id: "vacuum-bag-generic", group: "home", category: "vakumlu-saklama-poseti",
    q: "vakumlu saklama poşeti", zh: "真空压缩袋", en: "vacuum storage bags",
    variant: ["Vakumlu Saklama Poşeti 6'lı Set Pompalı 60x80", "真空压缩袋 收纳袋 棉被 衣物 6件套 送泵", "Vacuum Storage Bags 6 Pack with Hand Pump for Comforters"],
    accessory: ["Vakum poşeti el pompası"],
    different: ["Kutu Tipi Hurç Saklama Çantası 3'lü", "Yorgan saklama çantası şeffaf"],
  },
  {
    id: "diffuser-generic", group: "home", category: "aroma-difuzoru",
    q: "aroma difüzörü 300 ml", zh: "香薰机 300ml", en: "aroma diffuser 300ml",
    variant: ["Ultrasonik Aroma Difüzörü 300 ml Ahşap Desenli 7 Renk LED", "香薰机 300ml 超声波 加湿 七彩夜灯 木纹", "300ml Essential Oil Diffuser Wood Grain Ultrasonic 7 LED Colors"],
    accessory: ["Lavanta Uçucu Yağ 10 ml Difüzör İçin", "Essential oil set 6 x 10ml for diffuser"],
    different: ["Hava Nemlendirici 4 L Ultrasonik", "Mum Isıtıcı Lamba Aroma"],
  },
  {
    id: "clock-generic", group: "home", category: "duvar-saati",
    q: "sessiz duvar saati 30 cm", zh: "静音挂钟 30cm", en: "silent wall clock 30 cm",
    variant: ["Sessiz Akar Mekanizma Duvar Saati 30 cm Siyah", "北欧 静音挂钟 30cm 客厅 简约 石英钟", "Silent Non Ticking Wall Clock 12 inch Modern Black"],
    accessory: ["Duvar saati akar mekanizması yedek"],
    different: ["Dijital Masa Saati Alarm LED", "Çalar Saat Pilli Klasik"],
  },
  {
    id: "pillow-generic", group: "home", category: "yastik",
    q: "visco yastık 50x70", zh: "记忆棉枕头 50x70", en: "memory foam pillow 50x70",
    variant: ["Visco Yastık 50x70 Ortopedik Boyun Destekli", "记忆棉枕头 50x70 慢回弹 护颈 单人", "Memory Foam Pillow 50x70 cm Orthopedic Neck Support"],
    accessory: ["Yastık Kılıfı 50x70 Pamuk 2'li"],
    different: ["Kaz Tüyü Yastık 50x70", "Boyun Yastığı Seyahat U Şekli"],
  },
  // ───────────────────────────── kitchen ─────────────────────────────
  {
    id: "airfryer-ninja-af300", group: "kitchen", img: true,
    q: "Ninja Foodi AF300 Dual Zone Airfryer", zh: "Ninja AF300 双锅空气炸锅", en: "Ninja Foodi Dual Zone AF300 air fryer",
    same: ["Ninja Foodi Dual Zone Air Fryer AF300UK 7.6L 2 Drawers", "Ninja AF300 双锅空气炸锅 7.6L 两个独立烹饪区", "Ninja Foodi AF300EU Dual Zone 7.6 L Çift Hazneli Airfryer"],
    variant: ["Ninja Foodi AF400 Dual Zone 9.5 L Airfryer", "Ninja AF100 Airfryer 3.8 L"],
    accessory: ["Ninja AF300 Silikon Sepet Astarı 2'li", "Air fryer liners for Ninja Dual Zone"],
    different: ["Philips Airfryer XXL HD9650", "Tefal Easy Fry Dual 8.3 L Airfryer"],
  },
  {
    id: "coffee-nespresso-vertuo-pop", group: "kitchen", img: true,
    q: "Nespresso Vertuo Pop Kahve Makinesi", zh: "Nespresso Vertuo Pop 胶囊咖啡机", en: "Nespresso Vertuo Pop coffee machine",
    same: ["Nespresso Vertuo Pop Coffee and Espresso Machine by De'Longhi ENV90", "雀巢 Nespresso Vertuo Pop 胶囊咖啡机 ENV90", "Nespresso Vertuo Pop ENV90 Kapsül Kahve Makinesi Siyah"],
    variant: ["Nespresso Vertuo Next Kahve Makinesi", "Nespresso Essenza Mini Kahve Makinesi"],
    accessory: ["Nespresso Vertuo Kapsül 30'lu", "Descaling kit for Nespresso Vertuo"],
    different: ["Dolce Gusto Piccolo XS Kahve Makinesi", "Tchibo Cafissimo Pure"],
  },
  {
    id: "kettle-tefal-ki730", group: "kitchen", img: true,
    q: "Tefal Includeo KI730 Su Isıtıcı", zh: "特福 Includeo KI730 电热水壶", en: "Tefal Includeo KI730 kettle 1.7L",
    same: ["Tefal Includeo KI730D 1.7 L Paslanmaz Çelik Kettle", "Tefal Includeo KI730D30 Kettle 1.7L Stainless Steel 2400W", "特福 Tefal KI730D 不锈钢电热水壶 1.7L"],
    variant: ["Tefal Includeo KI732 Cam Kettle", "Tefal Express KI170 Kettle"],
    accessory: ["Kettle kireç filtresi yedek", "Kettle için kireç çözücü 250 ml"],
    different: ["Arzum Çaycı Heptaze Çay Makinesi", "Philips HD9350 Kettle 1.7 L"],
  },
  {
    id: "ricecooker-xiaomi-c1", group: "kitchen", img: true,
    q: "Xiaomi Mijia Pirinç Pişirici C1 3L", zh: "米家电饭煲 C1 3L", en: "Xiaomi Mijia rice cooker C1 3L",
    same: ["Xiaomi Mijia Rice Cooker C1 3L Multifunction Smart App", "米家电饭煲C1 3L 智能 预约 家用 多功能", "Xiaomi Mijia C1 3 L Akıllı Pirinç Pişirici"],
    variant: ["Xiaomi Mijia Pirinç Pişirici C1 4L", "Xiaomi Mijia IH Rice Cooker 3L"],
    accessory: ["Pirinç pişirici iç hazne 3 L yedek"],
    different: ["Zojirushi NS-ZCC10 Rice Cooker", "Arzum Pilavcı Pirinç Pişirici"],
  },
  {
    id: "blender-ninja-bn495", group: "kitchen", img: true,
    q: "Ninja Blender BN495 Pro", zh: "Ninja BN495 破壁机", en: "Ninja BN495 Nutri Pro blender",
    same: ["Ninja BN495 Nutri Pro Compact Personal Blender 1000W", "Ninja BN495 便携榨汁机 破壁机 1000W", "Ninja Nutri Pro BN495EU 1000W Kişisel Blender"],
    variant: ["Ninja BN800 Foodi Power Blender", "Ninja BN300 Blender"],
    accessory: ["Ninja BN495 Yedek Bardak 700 ml", "Blade assembly for Ninja BN495"],
    different: ["Nutribullet 600 Blender", "Arzum Shake'n Take Blender"],
  },
  {
    id: "coffee-delonghi-dedica", group: "kitchen", img: true,
    q: "De'Longhi Dedica EC685 Espresso Makinesi", zh: "德龙 Dedica EC685 半自动咖啡机", en: "De'Longhi Dedica EC685 espresso machine",
    same: ["De'Longhi Dedica Style EC685.M Pump Espresso Machine Metal", "德龙 Delonghi EC685 Dedica 半自动咖啡机 家用 意式", "Delonghi Dedica EC685.M Espresso ve Cappuccino Makinesi"],
    variant: ["De'Longhi Dedica Arte EC885 Espresso Makinesi", "De'Longhi Stilosa EC260 Espresso"],
    accessory: ["Dedica EC685 Bottomless Portafilter 51 mm", "Tamper 51mm for De'Longhi Dedica"],
    different: ["Sage Bambino Plus Espresso Machine", "Gaggia Classic Pro Espresso"],
  },
  {
    id: "mixer-bosch-mum5", group: "kitchen", img: true,
    q: "Bosch MUM5 Mutfak Robotu", zh: "博世 MUM5 厨师机", en: "Bosch MUM5 kitchen machine",
    same: ["Bosch MUM58720 MUM5 Stand Mixer 1000W Kitchen Machine", "博世 Bosch MUM58720 厨师机 1000W 家用 和面", "Bosch MUM58720 MUM5 1000 W Mutfak Robotu Gri"],
    variant: ["Bosch MUM4 Mutfak Robotu MUM4405", "Bosch Serie 8 OptiMUM MUM9 Mutfak Şefi"],
    accessory: ["Bosch MUM5 Kıyma Aparatı MUZ5FW1", "Bosch MUM5 pasta attachment"],
    different: ["KitchenAid Artisan 4.8 L Stand Mixer", "Kenwood Chef KVC3100"],
  },
  {
    id: "scale-generic", group: "kitchen", category: "mutfak-tartisi",
    q: "dijital mutfak tartısı 5 kg", zh: "电子厨房秤 5kg", en: "digital kitchen scale 5kg",
    variant: ["Dijital Mutfak Tartısı 5 kg 1 g Hassasiyet Paslanmaz", "厨房秤 电子秤 5kg/1g 烘焙 家用 高精度", "Digital Kitchen Scale 5kg/1g Stainless Steel Tare"],
    accessory: ["Mutfak tartısı pili CR2032 2'li"],
    different: ["Baskül Dijital 180 kg Cam", "Mutfak Zamanlayıcısı Dijital"],
  },
  // ───────────────────────────── appliances ─────────────────────────────
  {
    id: "vacuum-dyson-v12", group: "appliances", img: true,
    q: "Dyson V12 Detect Slim Kablosuz Süpürge", zh: "戴森 V12 Detect Slim 无线吸尘器", en: "Dyson V12 Detect Slim cordless vacuum",
    same: ["Dyson V12 Detect Slim Absolute Cordless Vacuum Cleaner", "戴森 Dyson V12 Detect Slim 无线吸尘器 激光探测", "Dyson V12 Detect Slim Absolute Kablosuz Süpürge"],
    variant: ["Dyson V15 Detect Absolute Kablosuz Süpürge", "Dyson V8 Absolute Kablosuz Süpürge"],
    accessory: ["Dyson V12 Yedek Filtre", "Dyson V12 Detect Slim replacement battery"],
    different: ["Dreame V12 Kablosuz Süpürge", "Samsung Jet 75 Kablosuz Süpürge"],
    note: "Dyson V12 vs Dreame V12: aynı model kodu, farklı marka",
  },
  {
    id: "robot-roborock-q7max", group: "appliances", img: true,
    q: "Roborock Q7 Max Robot Süpürge", zh: "石头 Roborock Q7 Max 扫地机器人", en: "Roborock Q7 Max robot vacuum",
    same: ["Roborock Q7 Max Robot Vacuum and Mop Cleaner 4200Pa LiDAR", "石头科技 Roborock Q7 Max 扫拖一体 扫地机器人 4200Pa", "Roborock Q7 Max Robot Süpürge ve Paspas 4200Pa Beyaz"],
    variant: ["Roborock Q7 Max+ Robot Süpürge Otomatik Boşaltma", "Roborock S7 Robot Süpürge"],
    accessory: ["Roborock Q7 Max Yedek Fırça ve Filtre Seti", "Mop cloths for Roborock Q7 Max 4 pack"],
    different: ["Xiaomi Robot Vacuum X10+", "Dreame D10 Plus Robot Süpürge"],
  },
  {
    id: "iron-philips-dst5030", group: "appliances", img: true,
    q: "Philips DST5030 Buharlı Ütü", zh: "飞利浦 DST5030 蒸汽熨斗", en: "Philips DST5030 steam iron 2400W",
    same: ["Philips 5000 Series DST5030/20 Steam Iron 2400W SteamGlide Plus", "飞利浦 DST5030 蒸汽熨斗 2400W 家用 电熨斗", "Philips 5000 Serisi DST5030/20 2400 W Buharlı Ütü"],
    variant: ["Philips DST3030 Buharlı Ütü 2200W", "Philips PerfectCare GC7840 Buhar Kazanlı Ütü"],
    accessory: ["Ütü masası kılıfı 140x50", "Ütü için kireç önleyici kartuş"],
    different: ["Tefal FV5718 Turbo Pro Buharlı Ütü", "Arzum AR5047 Buharlı Ütü"],
  },
  {
    id: "fan-xiaomi-smart-standing", group: "appliances", img: true,
    q: "Xiaomi Smart Standing Fan 2 Vantilatör", zh: "米家直流变频落地扇2", en: "Xiaomi Smart Standing Fan 2",
    same: ["Xiaomi Smart Standing Fan 2 DC Inverter Floor Fan 15W", "米家直流变频落地扇2 智能 静音 自然风", "Xiaomi Smart Standing Fan 2 Akıllı Vantilatör Beyaz"],
    variant: ["Xiaomi Smart Standing Fan 2 Pro", "Xiaomi Smart Tower Fan"],
    accessory: ["Vantilatör kafes yedek 40 cm"],
    different: ["Dyson Pure Cool TP07 Vantilatör", "Arzum Ayaklı Vantilatör 45 cm"],
  },
  {
    id: "dryer-dyson-supersonic", group: "appliances", img: true,
    q: "Dyson Supersonic Saç Kurutma Makinesi", zh: "戴森 Supersonic 吹风机 HD08", en: "Dyson Supersonic hair dryer HD08",
    same: ["Dyson Supersonic Hair Dryer HD08 Iron/Fuchsia", "戴森 Dyson Supersonic HD08 吹风机 紫红色 负离子", "Dyson Supersonic HD08 Saç Kurutma Makinesi Fuşya"],
    variant: ["Dyson Supersonic Origin HD07", "Dyson Airwrap Multi-Styler"],
    accessory: ["Dyson Supersonic Difüzör Başlığı", "Dyson Supersonic flyaway attachment"],
    different: ["Laifen Swift Saç Kurutma Makinesi", "Supersonic benzeri iyonik saç kurutma makinesi 1600W"],
  },
  {
    id: "purifier-philips-ac0820", group: "appliances", img: true,
    q: "Philips AC0820 Hava Temizleyici", zh: "飞利浦 AC0820 空气净化器", en: "Philips AC0820 air purifier",
    same: ["Philips 800 Series AC0820/10 Air Purifier HEPA 49 m²", "飞利浦 AC0820 空气净化器 家用 HEPA 除甲醛", "Philips 800 Serisi AC0820/10 Hava Temizleyici HEPA"],
    variant: ["Philips AC1715 Hava Temizleyici", "Philips AC0850 Hava Temizleyici"],
    accessory: ["Philips FY0194 HEPA Filtre AC0820 İçin", "Replacement filter for Philips AC0820"],
    different: ["Xiaomi Smart Air Purifier 4 Compact", "Levoit Core 300 Hava Temizleyici"],
  },
  {
    id: "handheld-vacuum-generic", group: "appliances", category: "el-supurgesi",
    q: "kablosuz el süpürgesi araç", zh: "车载无线手持吸尘器", en: "cordless handheld car vacuum",
    variant: ["Kablosuz El Süpürgesi Şarjlı Araç İçin 12000Pa", "车载吸尘器 无线 手持 大吸力 12000Pa 家车两用", "Cordless Handheld Vacuum 12000Pa Car Vacuum Cleaner Rechargeable"],
    accessory: ["El süpürgesi HEPA filtre yedek 2'li"],
    different: ["Dikey Kablosuz Süpürge 2'si 1 Arada", "Araç oto kokusu"],
  },
  // ───────────────────────────── fashion-women ─────────────────────────────
  {
    id: "jeans-levis-721", group: "fashion-women", img: true,
    q: "Levi's 721 High Rise Skinny Kadın Jean", zh: "李维斯 Levi's 721 女士高腰紧身牛仔裤", en: "Levi's 721 high rise skinny women's jeans",
    same: ["Levi's Women's 721 High Rise Skinny Jeans Dark Indigo", "Levi's 李维斯 721 女士 高腰紧身 牛仔裤 深蓝", "Levi's 721 High Rise Skinny Kadın Kot Pantolon Koyu Mavi"],
    variant: ["Levi's 711 Skinny Kadın Jean", "Levi's 724 High Rise Straight Kadın Jean"],
    accessory: ["Kadın Deri Kemer İnce Jean Kemeri"],
    different: ["Mavi Serenay Yüksek Bel Skinny Kadın Jean", "Zara Yüksek Bel Skinny Jean Kadın"],
  },
  {
    id: "leggings-nike-one", group: "fashion-women", img: true,
    q: "Nike One Dri-FIT Kadın Tayt", zh: "耐克 Nike One Dri-FIT 女子紧身裤", en: "Nike One Dri-FIT women's mid-rise leggings",
    same: ["Nike One Women's Mid-Rise Leggings Dri-FIT Black DD0252-010", "耐克 Nike One Dri-FIT 女子中腰紧身训练裤 黑色 DD0252", "Nike One Dri-FIT Mid-Rise Kadın Tayt Siyah DD0252-010"],
    variant: ["Nike Pro 365 Kadın Tayt", "Nike One Dri-FIT Kadın Şort Tayt 7 inç"],
    accessory: ["Spor Çorabı 3'lü Kadın"],
    different: ["Adidas Techfit Kadın Tayt", "Nike One style high waist leggings yoga pants OEM"],
  },
  {
    id: "polo-lacoste-pf7839", group: "fashion-women",
    q: "Lacoste Kadın Slim Fit Polo PF7839", zh: "鳄鱼 Lacoste 女士修身 Polo 衫 PF7839", en: "Lacoste women's slim fit polo PF7839",
    same: ["Lacoste Women's Slim Fit Stretch Cotton Piqué Polo PF7839 White", "LACOSTE 法国鳄鱼 女士 修身 短袖 Polo PF7839 白色", "Lacoste Kadın Slim Fit Pike Polo Yaka T-shirt Beyaz PF7839"],
    variant: ["Lacoste Kadın Regular Fit Polo PF5462", "Lacoste Erkek L1212 Polo"],
    accessory: ["Polo yaka için gömlek yaka balinası 10'lu"],
    different: ["Ralph Lauren Kadın Slim Fit Polo", "Tommy Hilfiger Kadın Polo"],
  },
  {
    id: "hoodie-adidas-essentials", group: "fashion-women",
    q: "Adidas Essentials Kadın Kapüşonlu Sweatshirt", zh: "阿迪达斯 Essentials 女款连帽卫衣", en: "adidas Essentials women's fleece hoodie",
    same: ["adidas Women's Essentials 3-Stripes Fleece Hoodie Black HZ2904", "阿迪达斯 adidas Essentials 女子 三条纹 连帽卫衣 黑色 HZ2904", "Adidas Essentials 3 Bantlı Kadın Kapüşonlu Sweatshirt Siyah HZ2904"],
    variant: ["Adidas Essentials Kadın Fermuarlı Sweatshirt", "Adidas Essentials Erkek Kapüşonlu Sweatshirt"],
    accessory: [],
    different: ["Nike Sportswear Club Fleece Kadın Sweatshirt", "Puma Essentials Kadın Hoodie"],
  },
  {
    id: "dress-generic-linen", group: "fashion-women", category: "elbise",
    q: "keten elbise kadın yazlık", zh: "亚麻连衣裙 女 夏季", en: "women's linen summer dress",
    variant: ["Kadın Keten Görünümlü Yazlık Midi Elbise Beyaz", "女装 亚麻 连衣裙 夏季 宽松 长裙 白色", "Women's Linen Midi Dress Summer Casual Short Sleeve"],
    accessory: ["Elbise askısı 10'lu kadife", "Elbise kemeri hasır"],
    different: ["Kadın Mini Abiye Elbise Payetli", "Erkek Keten Gömlek Yazlık"],
  },
  // ───────────────────────────── fashion-men ─────────────────────────────
  {
    id: "jeans-levis-501", group: "fashion-men", img: true,
    q: "Levi's 501 Original Fit Erkek Jean", zh: "李维斯 Levi's 501 男士经典直筒牛仔裤", en: "Levi's 501 Original Fit men's jeans",
    same: ["Levi's Men's 501 Original Fit Jeans Stonewash 00501-0193", "Levi's 李维斯 501 男士 经典 直筒 牛仔裤 00501", "Levi's 501 Original Fit Erkek Kot Pantolon 00501-0193"],
    variant: ["Levi's 502 Taper Erkek Jean", "Levi's 511 Slim Fit Erkek Jean"],
    accessory: ["Erkek Deri Kemer Jean Kemeri 4 cm"],
    different: ["Wrangler Texas Straight Erkek Jean", "501 style straight leg denim jeans men wholesale"],
  },
  {
    id: "polo-lacoste-l1212", group: "fashion-men", img: true,
    q: "Lacoste L.12.12 Erkek Polo", zh: "鳄鱼 Lacoste L1212 男士 Polo 衫", en: "Lacoste L.12.12 classic fit men's polo",
    same: ["Lacoste Men's Classic Fit L.12.12 Petit Piqué Polo Shirt Navy", "LACOSTE 鳄鱼 L1212 男士 经典 短袖 Polo衫 藏青", "Lacoste L1212 Classic Fit Erkek Polo Yaka Tişört Lacivert"],
    variant: ["Lacoste Slim Fit PH4012 Erkek Polo", "Lacoste L1212 Uzun Kollu Erkek Polo"],
    accessory: [],
    different: ["Polo Ralph Lauren Classic Fit Mesh Polo", "Lacoste style pique polo shirt men custom logo"],
  },
  {
    id: "jacket-nike-tech-fleece", group: "fashion-men",
    q: "Nike Tech Fleece Erkek Kapüşonlu Üst", zh: "耐克 Tech Fleece 男子连帽夹克", en: "Nike Sportswear Tech Fleece men's full-zip hoodie",
    same: ["Nike Sportswear Tech Fleece Men's Full-Zip Hoodie Black FB7921-010", "耐克 Nike Tech Fleece 男子 全长拉链 连帽衫 黑色 FB7921", "Nike Sportswear Tech Fleece Erkek Fermuarlı Kapüşonlu Üst Siyah FB7921-010"],
    variant: ["Nike Tech Fleece Erkek Jogger Eşofman Altı", "Nike Tech Fleece Windrunner Erkek"],
    accessory: [],
    different: ["Adidas Z.N.E. Erkek Kapüşonlu Üst", "Tech fleece set tracksuit men high quality replica"],
  },
  {
    id: "jacket-columbia-watertight", group: "fashion-men", img: true,
    q: "Columbia Watertight II Erkek Yağmurluk", zh: "哥伦比亚 Columbia Watertight II 男款防水夹克", en: "Columbia Watertight II men's rain jacket",
    same: ["Columbia Men's Watertight II Rain Jacket Black RM2433", "哥伦比亚 Columbia Watertight II 男子 防水 冲锋衣 RM2433", "Columbia Watertight II Erkek Yağmurluk Ceket Siyah RM2433"],
    variant: ["Columbia Watertight II Kadın Yağmurluk", "Columbia Glennaker Lake Erkek Yağmurluk"],
    accessory: ["Yağmurluk için su itici sprey 300 ml"],
    different: ["The North Face Resolve 2 Erkek Ceket", "Jack Wolfskin Stormy Point Erkek Ceket"],
  },
  {
    id: "tshirt-generic-oversize", group: "fashion-men", category: "erkek-t-shirt",
    q: "oversize basic erkek tişört", zh: "宽松 纯色 男士 T恤", en: "men's oversized basic t-shirt",
    variant: ["Oversize Basic Erkek Tişört %100 Pamuk Siyah", "男士 宽松 oversize 纯棉 短袖 T恤 黑色 纯色", "Men's Oversized Heavyweight Basic Tee 100% Cotton Black"],
    accessory: [],
    different: ["Erkek Polo Yaka Tişört Slim Fit", "Kadın Crop Tişört Oversize"],
  },
  // ───────────────────────────── fashion-kids ─────────────────────────────
  {
    id: "kids-tee-nike-futura", group: "fashion-kids",
    q: "Nike Futura Çocuk Tişört", zh: "耐克 Nike Futura 儿童 T恤", en: "Nike Sportswear Futura kids t-shirt",
    same: ["Nike Sportswear Big Kids' Futura T-Shirt White AR5254-100", "耐克 Nike Futura 大童 短袖 T恤 白色 AR5254", "Nike Sportswear Futura Çocuk Tişört Beyaz AR5254-100"],
    variant: ["Nike Futura Çocuk Eşofman Takımı", "Nike Futura Yetişkin Tişört"],
    accessory: [],
    different: ["Adidas Essentials Çocuk Tişört", "Puma Essentials Çocuk Tişört"],
  },
  {
    id: "kids-raincoat-generic", group: "fashion-kids", category: "cocuk-t-shirt",
    q: "çocuk yağmurluk dinozor", zh: "儿童雨衣 恐龙", en: "kids dinosaur raincoat",
    variant: ["Çocuk Yağmurluk Dinozor Desenli Kapüşonlu 3-6 Yaş", "儿童雨衣 恐龙 卡通 男童 幼儿园 带书包位", "Kids Dinosaur Raincoat Hooded Waterproof 3-6 Years"],
    accessory: ["Çocuk Yağmur Botu Dinozor"],
    different: ["Çocuk Kışlık Mont Şişme", "Yetişkin Yağmurluk Poncho"],
  },
  {
    id: "kids-pajama-generic", group: "fashion-kids", category: "cocuk-t-shirt",
    q: "çocuk pijama takımı pamuklu", zh: "儿童睡衣套装 纯棉", en: "kids cotton pajama set",
    variant: ["Çocuk Pijama Takımı %100 Pamuk Uzun Kollu Uzay Desenli", "儿童睡衣 套装 纯棉 长袖 春秋 男童 家居服", "Kids Pajama Set 100% Cotton Long Sleeve Space Print"],
    accessory: [],
    different: ["Bebek Tulum Zıbın 5'li", "Kadın Pijama Takımı Saten"],
  },
  // ───────────────────────────── shoes ─────────────────────────────
  {
    id: "shoes-adidas-samba-og", group: "shoes", img: true,
    q: "Adidas Samba OG Beyaz Spor Ayakkabı", zh: "阿迪达斯 Samba OG 白色 板鞋", en: "adidas Samba OG white sneakers",
    same: ["adidas Samba OG Shoes Cloud White/Core Black B75806", "阿迪达斯 adidas Samba OG 三叶草 经典 板鞋 白黑 B75806", "Adidas Samba OG Unisex Beyaz Spor Ayakkabı B75806"],
    variant: ["Adidas Samba OG Siyah Spor Ayakkabı B75807", "Adidas Gazelle Beyaz Spor Ayakkabı"],
    accessory: ["Adidas Samba Bağcık Beyaz Düz 120 cm", "Shoe trees cedar for sneakers"],
    different: ["Puma Palermo Beyaz Spor Ayakkabı", "Samba OG replika A+ kalite beyaz siyah ayakkabı"],
  },
  {
    id: "shoes-nb-574", group: "shoes", img: true,
    q: "New Balance 574 Erkek Spor Ayakkabı", zh: "新百伦 New Balance 574 男款 运动鞋", en: "New Balance 574 men's sneakers",
    same: ["New Balance Men's 574 Core Sneaker Grey ML574EVG", "New Balance NB 574 男鞋 复古 休闲 跑步鞋 灰色 ML574EVG", "New Balance 574 Erkek Günlük Spor Ayakkabı Gri ML574EVG"],
    variant: ["New Balance 574 Kadın Spor Ayakkabı", "New Balance 530 Erkek Spor Ayakkabı"],
    accessory: ["New Balance Tabanlık Erkek", "Shoe cleaner kit for sneakers"],
    different: ["Nike Air Max 90 Erkek Spor Ayakkabı", "574 style retro running shoes men wholesale"],
  },
  {
    id: "shoes-asics-kayano-30", group: "shoes", img: true,
    q: "Asics Gel-Kayano 30 Erkek Koşu Ayakkabısı", zh: "亚瑟士 Asics Gel-Kayano 30 男子跑鞋", en: "ASICS Gel-Kayano 30 men's running shoes",
    same: ["ASICS Men's Gel-Kayano 30 Running Shoes Black/Glow Yellow 1011B548", "亚瑟士 ASICS GEL-KAYANO 30 男子 稳定支撑 跑步鞋 1011B548", "Asics Gel-Kayano 30 Erkek Koşu Ayakkabısı Siyah 1011B548-003"],
    variant: ["Asics Gel-Kayano 29 Erkek Koşu Ayakkabısı", "Asics Gel-Nimbus 25 Erkek Koşu Ayakkabısı"],
    accessory: ["Koşu çorabı 3'lü erkek", "Koşu ayakkabısı bağcığı elastik"],
    different: ["Brooks Adrenaline GTS 23 Erkek Koşu Ayakkabısı", "Saucony Guide 16 Erkek"],
  },
  {
    id: "shoes-crocs-classic", group: "shoes", img: true,
    q: "Crocs Classic Clog Terlik", zh: "卡骆驰 Crocs Classic 经典洞洞鞋", en: "Crocs Classic Clog unisex",
    same: ["Crocs Unisex-Adult Classic Clogs Black 10001-001", "卡骆驰 Crocs Classic Clog 经典 洞洞鞋 男女 黑色 10001", "Crocs Classic Clog Unisex Terlik Siyah 10001-001"],
    variant: ["Crocs Classic Lined Clog Polarlı", "Crocs Classic Clog Çocuk"],
    accessory: ["Crocs Jibbitz Rozet Seti 10'lu", "Crocs charms 20 pcs pack"],
    different: ["Skechers Foamies Terlik", "Classic clog style EVA garden shoes wholesale"],
  },
  {
    id: "shoes-birkenstock-arizona", group: "shoes",
    q: "Birkenstock Arizona Sandalet", zh: "勃肯 Birkenstock Arizona 凉鞋", en: "Birkenstock Arizona sandals",
    same: ["Birkenstock Arizona Birko-Flor Sandals Black 051791", "Birkenstock 勃肯 Arizona 双扣 凉鞋 黑色 051791", "Birkenstock Arizona Birko-Flor Unisex Sandalet Siyah 051791"],
    variant: ["Birkenstock Arizona Oiled Leather Sandalet", "Birkenstock Gizeh Parmak Arası Sandalet"],
    accessory: ["Birkenstock Bakım Seti", "Cork sealer for Birkenstock"],
    different: ["Teva Original Universal Sandalet", "Arizona benzeri çift tokalı mantar tabanlı sandalet"],
  },
  {
    id: "boots-drmartens-1460", group: "shoes", img: true,
    q: "Dr. Martens 1460 Siyah Bot", zh: "马汀博士 Dr. Martens 1460 黑色 8孔 靴子", en: "Dr. Martens 1460 smooth leather boots black",
    same: ["Dr. Martens 1460 Smooth Leather Lace Up Boots Black 11822006", "Dr.Martens 马汀博士 1460 经典 8孔 马丁靴 黑色 11822006", "Dr. Martens 1460 Smooth Unisex Siyah Bot 11822006"],
    variant: ["Dr. Martens 1461 Siyah Ayakkabı", "Dr. Martens 1460 Pascal Virginia Bot"],
    accessory: ["Dr. Martens Wonder Balsam Bakım Kremi", "Dr. Martens boot laces 140 cm"],
    different: ["Timberland 6 Inch Premium Bot", "1460 style 8 eye leather boots wholesale"],
  },
  {
    id: "shoes-converse-chuck70", group: "shoes", img: true,
    q: "Converse Chuck 70 High Siyah", zh: "匡威 Converse Chuck 70 高帮 黑色", en: "Converse Chuck 70 high top black",
    same: ["Converse Chuck 70 High Top Black 162050C", "匡威 Converse Chuck 70 1970s 高帮 帆布鞋 黑色 162050C", "Converse Chuck 70 Hi Unisex Siyah Sneaker 162050C"],
    variant: ["Converse Chuck Taylor All Star High Siyah", "Converse Chuck 70 Low Siyah"],
    accessory: ["Converse Bağcık Beyaz Düz", "Converse tabanlık"],
    different: ["Vans Sk8-Hi Siyah", "Chuck 70 style high top canvas shoes"],
  },
  // ───────────────────────────── bags ─────────────────────────────
  {
    id: "luggage-samsonite-sline", group: "bags", img: true,
    q: "Samsonite S'Cure Spinner 55 Kabin Valizi", zh: "新秀丽 Samsonite S'Cure 55cm 登机箱", en: "Samsonite S'Cure spinner 55 cabin suitcase",
    same: ["Samsonite S'Cure Spinner 55/20 Cabin Luggage Black 10U*09001", "新秀丽 Samsonite S'Cure 20寸 登机箱 黑色 10U", "Samsonite S'Cure 55 cm Kabin Boy Valiz Siyah 10U-09001"],
    variant: ["Samsonite S'Cure Spinner 69 Orta Boy Valiz", "Samsonite Magnum Eco Spinner 55"],
    accessory: ["Valiz Kılıfı 55 cm Kabin Boy", "Luggage strap with TSA lock"],
    different: ["American Tourister Soundbox Spinner 55", "Delsey Belfort Plus 55 Kabin"],
  },
  {
    id: "backpack-herschel-la", group: "bags",
    q: "Herschel Little America Sırt Çantası", zh: "Herschel Little America 双肩包", en: "Herschel Little America backpack",
    same: ["Herschel Little America Backpack Black 10014-00001", "Herschel Little America 双肩包 黑色 25L 10014", "Herschel Little America Sırt Çantası Siyah 10014-00001"],
    variant: ["Herschel Little America Mid Sırt Çantası", "Herschel Classic XL Sırt Çantası"],
    accessory: ["Sırt çantası yağmur kılıfı 30 L"],
    different: ["Fjällräven Kanken Sırt Çantası", "Little America style backpack 25L OEM"],
  },
  {
    id: "backpack-osprey-talon22", group: "bags", img: true,
    q: "Osprey Talon 22 Sırt Çantası", zh: "Osprey 小鹰 Talon 22 背包", en: "Osprey Talon 22 hiking backpack",
    same: ["Osprey Talon 22 Men's Hiking Backpack Black", "Osprey 小鹰 Talon 22 魔爪 徒步 骑行 背包 黑色", "Osprey Talon 22 Erkek Outdoor Sırt Çantası Siyah"],
    variant: ["Osprey Talon 33 Sırt Çantası", "Osprey Tempest 20 Kadın Sırt Çantası"],
    accessory: ["Osprey Talon 22 Yağmurluk Kılıfı", "Hydration bladder 2L for Osprey"],
    different: ["Deuter Speed Lite 21 Sırt Çantası", "Gregory Nano 22"],
  },
  {
    id: "backpack-kanken-classic", group: "bags", img: true,
    q: "Fjällräven Kanken Classic Sırt Çantası", zh: "北极狐 Fjallraven Kanken 经典 双肩包", en: "Fjallraven Kanken Classic backpack",
    same: ["Fjällräven Kanken Classic Backpack 16L Navy F23510", "北极狐 Fjallraven Kanken 经典款 双肩包 16L 藏青 F23510", "Fjallraven Kanken Classic Sırt Çantası Lacivert F23510"],
    variant: ["Fjällräven Kanken Mini Sırt Çantası", "Fjällräven Kanken Laptop 15 Sırt Çantası"],
    accessory: ["Kanken Yağmurluk Kılıfı", "Kanken shoulder pads"],
    different: ["Herschel Classic Sırt Çantası", "Kanken replika sırt çantası A kalite"],
  },
  {
    id: "wallet-generic-rfid", group: "bags", category: "cuzdan",
    q: "erkek deri cüzdan RFID", zh: "男士真皮钱包 RFID", en: "men's leather RFID wallet",
    variant: ["Erkek Hakiki Deri Cüzdan RFID Korumalı Kahverengi", "男士 真皮 钱包 RFID 防盗刷 短款 棕色", "Men's Genuine Leather Bifold Wallet RFID Blocking Brown"],
    accessory: ["Cüzdan hediye kutusu"],
    different: ["Kadın Uzun Cüzdan Fermuarlı", "Kartlık Metal RFID"],
  },
  {
    id: "lunchbag-generic", group: "bags", category: "beslenme-cantasi",
    q: "termal beslenme çantası", zh: "保温饭袋", en: "insulated lunch bag",
    variant: ["Termal Beslenme Çantası Yalıtımlı Ofis Piknik 8 L", "保温饭袋 便当包 铝箔 加厚 上班族 8L", "Insulated Lunch Bag Leakproof Cooler Tote 8L"],
    accessory: ["Buz aküsü 2'li beslenme çantası için"],
    different: ["Sefer Tası Paslanmaz 3 Katlı", "Soğutucu Çanta 20 L Kamp"],
  },
  // ───────────────────────────── accessories ─────────────────────────────
  {
    id: "watch-casio-f91w", group: "accessories", img: true, pack: ["Casio F-91W-1 Dijital Kol Saati Tekli", "Casio F-91W Dijital Saat 2'li Set"],
    q: "Casio F-91W Dijital Kol Saati", zh: "卡西欧 Casio F-91W 电子表", en: "Casio F-91W digital watch",
    same: ["Casio Men's F91W-1 Classic Resin Strap Digital Sport Watch", "卡西欧 CASIO F-91W-1 小方块 电子表 复古", "Casio F-91W-1DG Unisex Dijital Kol Saati Siyah"],
    variant: ["Casio A158WA-1 Dijital Kol Saati", "Casio F-91WG-9 Altın Kadran"],
    accessory: ["Casio F-91W Kordon Yedek Silikon", "Casio F-91W kayış pimi"],
    different: ["Timex Ironman Dijital Saat", "F-91W style LED digital watch wholesale"],
  },
  {
    id: "sunglasses-oakley-holbrook", group: "accessories",
    q: "Oakley Holbrook Güneş Gözlüğü", zh: "欧克利 Oakley Holbrook 太阳镜", en: "Oakley Holbrook sunglasses OO9102",
    same: ["Oakley Men's OO9102 Holbrook Sunglasses Matte Black Prizm", "欧克利 Oakley Holbrook OO9102 太阳镜 哑光黑 Prizm", "Oakley Holbrook OO9102 Güneş Gözlüğü Mat Siyah Prizm"],
    variant: ["Oakley Holbrook XL OO9417", "Oakley Frogskins OO9013"],
    accessory: ["Oakley Holbrook Yedek Cam Polarize", "Oakley gözlük kılıfı"],
    different: ["Ray-Ban Wayfarer RB2140", "Holbrook style polarized sunglasses TR90"],
  },
  {
    id: "watch-garmin-fr55", group: "accessories", img: true,
    q: "Garmin Forerunner 55 GPS Koşu Saati", zh: "佳明 Garmin Forerunner 55 GPS 跑步手表", en: "Garmin Forerunner 55 GPS running watch",
    same: ["Garmin Forerunner 55 GPS Running Watch Black 010-02562-00", "佳明 Garmin Forerunner 55 GPS 跑步 运动 手表 黑色", "Garmin Forerunner 55 GPS Koşu Saati Siyah 010-02562-00"],
    variant: ["Garmin Forerunner 165 GPS Saat", "Garmin Forerunner 45 GPS Saat"],
    accessory: ["Garmin Forerunner 55 Kordon 20mm", "Garmin charging cable"],
    different: ["Coros Pace 3 GPS Saat", "Polar Pacer GPS Saat"],
  },
  {
    id: "bracelet-pandora-moments", group: "accessories",
    q: "Pandora Moments Yılan Zincirli Bileklik", zh: "潘多拉 Pandora Moments 蛇骨链 手链", en: "Pandora Moments snake chain bracelet",
    same: ["Pandora Moments Snake Chain Bracelet Sterling Silver 590702HV", "潘多拉 Pandora Moments 蛇骨链 手链 925银 590702HV", "Pandora Moments Yılan Zincirli Gümüş Bileklik 590702HV"],
    variant: ["Pandora Moments Kalp Klipsli Bileklik 590719", "Pandora Moments Bangle Bileklik"],
    accessory: ["Pandora Charm Gümüş Kalp", "Charm beads for Pandora bracelet 10 pcs"],
    different: ["Swarovski Tennis Bileklik", "Pandora benzeri 925 ayar gümüş yılan zincir bileklik"],
  },
  {
    id: "belt-generic-leather", group: "accessories", category: "kemer",
    q: "erkek deri kemer otomatik tokalı", zh: "男士 真皮 自动扣 皮带", en: "men's leather belt automatic buckle",
    variant: ["Erkek Hakiki Deri Kemer Otomatik Tokalı Siyah 3.5 cm", "男士 皮带 真皮 自动扣 商务 腰带 黑色 3.5cm", "Men's Genuine Leather Ratchet Belt Automatic Buckle Black"],
    accessory: ["Kemer tokası yedek otomatik"],
    different: ["Kadın İnce Kemer Deri", "Erkek Spor Kemer Örgü"],
  },
  {
    id: "earrings-generic-hoop", group: "accessories", category: "kupe",
    q: "halka küpe gümüş 925", zh: "925银 圆环 耳环", en: "925 silver hoop earrings",
    variant: ["925 Ayar Gümüş Halka Küpe 20 mm", "S925 纯银 圆圈 耳环 女 20mm", "Sterling Silver 925 Hoop Earrings 20mm Women"],
    accessory: ["Küpe arkalığı silikon 20'li"],
    different: ["Çelik Halka Küpe Altın Kaplama", "Gümüş Kolye Zincir 45 cm"],
  },
  // ───────────────────────────── beauty ─────────────────────────────
  {
    id: "shaver-philips-oneblade", group: "beauty", img: true, pack: ["Philips OneBlade QP2520/30 Tıraş Makinesi Tekli", "Philips OneBlade QP2520 Tıraş Makinesi 2'li Avantaj Paketi"],
    q: "Philips OneBlade QP2520 Tıraş Makinesi", zh: "飞利浦 OneBlade QP2520 剃须刀", en: "Philips OneBlade QP2520 hybrid trimmer",
    same: ["Philips OneBlade Hybrid Electric Trimmer and Shaver QP2520/30", "飞利浦 OneBlade QP2520 小刀锋 剃须刀 造型器", "Philips OneBlade QP2520/30 Hibrit Tıraş Makinesi"],
    variant: ["Philips OneBlade Pro QP6530", "Philips OneBlade 360 QP2730"],
    accessory: ["Philips OneBlade Yedek Bıçak QP210 2'li", "OneBlade replacement blades 4 pack"],
    different: ["Braun Series 3 Tıraş Makinesi", "OneBlade benzeri hibrit tıraş makinesi"],
  },
  {
    id: "shaver-braun-s9", group: "beauty",
    q: "Braun Series 9 Pro 9477cc Tıraş Makinesi", zh: "博朗 Braun 9系 Pro 9477cc 电动剃须刀", en: "Braun Series 9 Pro 9477cc electric shaver",
    same: ["Braun Series 9 Pro 9477cc Electric Razor with Clean & Charge Station", "博朗 Braun 9系 Pro 9477cc 电动剃须刀 清洁充电座", "Braun Series 9 Pro 9477cc Islak Kuru Tıraş Makinesi"],
    variant: ["Braun Series 9 9390cc Tıraş Makinesi", "Braun Series 7 7071cc Tıraş Makinesi"],
    accessory: ["Braun Series 9 94M Yedek Başlık", "Braun Clean & Renew kartuş 4'lü"],
    different: ["Philips Series 9000 S9985 Tıraş Makinesi", "Panasonic ES-LV97"],
  },
  {
    id: "cream-cerave-moisturizing", group: "beauty", pack: ["CeraVe Nemlendirici Krem 454 g Tek Kavanoz", "CeraVe Moisturizing Cream 454 g 2'li Paket"],
    q: "CeraVe Nemlendirici Krem 454 g", zh: "适乐肤 CeraVe 保湿面霜 454g", en: "CeraVe Moisturizing Cream 454g",
    same: ["CeraVe Moisturizing Cream 16 oz Body and Face Moisturizer with Hyaluronic Acid", "适乐肤 CeraVe C霜 保湿面霜 454g 神经酰胺", "CeraVe Nemlendirici Krem 454 g Kuru Ciltler İçin"],
    variant: ["CeraVe Nemlendirici Krem 340 g", "CeraVe Nemlendirici Losyon 473 ml"],
    accessory: ["Krem spatulası 5'li"],
    different: ["La Roche-Posay Lipikar Baume AP+M 400 ml", "Nivea Soft Nemlendirici Krem 200 ml"],
  },
  {
    id: "sunscreen-lrp-anthelios", group: "beauty",
    q: "La Roche-Posay Anthelios UVMune 400 SPF50+ 50 ml", zh: "理肤泉 Anthelios UVMune 400 防晒 SPF50+ 50ml", en: "La Roche-Posay Anthelios UVMune 400 SPF50+ 50ml",
    same: ["La Roche-Posay Anthelios UVMune 400 Invisible Fluid SPF50+ 50ml", "理肤泉 Anthelios UVMune 400 隐形 防晒乳 SPF50+ 50ml", "La Roche-Posay Anthelios UVMune 400 Invisible Fluid SPF 50+ 50 ml"],
    variant: ["La Roche-Posay Anthelios UVMune 400 SPF50+ 150 ml", "La Roche-Posay Anthelios Oil Correct SPF50+ 50 ml"],
    accessory: [],
    different: ["Bioderma Photoderm Max SPF50+ 40 ml", "Beauty of Joseon Relief Sun SPF50+ 50 ml"],
  },
  {
    id: "toothbrush-oralb-io9", group: "beauty",
    q: "Oral-B iO 9 Elektrikli Diş Fırçası", zh: "欧乐B Oral-B iO9 电动牙刷", en: "Oral-B iO Series 9 electric toothbrush",
    same: ["Oral-B iO Series 9 Electric Toothbrush Black Onyx with Charging Travel Case", "欧乐B Oral-B iO9 云感刷 电动牙刷 黑色", "Oral-B iO 9 Siyah Elektrikli Diş Fırçası"],
    variant: ["Oral-B iO 6 Elektrikli Diş Fırçası", "Oral-B iO 9 Beyaz"],
    accessory: ["Oral-B iO Yedek Başlık 4'lü", "Oral-B iO travel case"],
    different: ["Philips Sonicare DiamondClean 9000", "Xiaomi Mi Electric Toothbrush T500"],
  },
  {
    id: "straightener-remington-s5525", group: "beauty",
    q: "Remington S5525 Saç Düzleştirici", zh: "雷明登 Remington S5525 直发器", en: "Remington S5525 Pro-Ceramic Ultra hair straightener",
    same: ["Remington S5525 Pro-Ceramic Ultra Hair Straightener 230°C", "雷明登 Remington S5525 陶瓷 直发器 230度", "Remington S5525 Pro Ceramic Ultra Saç Düzleştirici"],
    variant: ["Remington S8598 Keratin Protect Saç Düzleştirici", "Remington S5520 Saç Düzleştirici"],
    accessory: ["Saç düzleştirici ısıya dayanıklı mat"],
    different: ["ghd Gold Styler Saç Düzleştirici", "Babyliss ST480E Saç Düzleştirici"],
  },
  {
    id: "serum-ordinary-niacinamide", group: "beauty", pack: ["The Ordinary Niacinamide 10% + Zinc 1% 30 ml Tekli", "The Ordinary Niacinamide 10% + Zinc 1% 30 ml 2'li Set"],
    q: "The Ordinary Niacinamide 10% + Zinc 1% 30 ml", zh: "The Ordinary 烟酰胺 10% + 锌 1% 精华 30ml", en: "The Ordinary Niacinamide 10% + Zinc 1% serum 30ml",
    same: ["The Ordinary Niacinamide 10% + Zinc 1% High Strength Vitamin and Mineral Blemish Formula 30ml", "The Ordinary 烟酰胺 10% + 锌 1% 精华液 30ml 控油", "The Ordinary Niacinamide %10 + Zinc %1 Serum 30 ml"],
    variant: ["The Ordinary Niacinamide 10% + Zinc 1% 60 ml", "The Ordinary Hyaluronic Acid 2% + B5 30 ml"],
    accessory: [],
    different: ["Paula's Choice 10% Niacinamide Booster 20 ml", "Niacinamide %10 Serum 30 ml muadil"],
  },
  {
    id: "perfume-generic-oud", group: "beauty", category: "parfum",
    q: "oud erkek parfüm 100 ml", zh: "沉香 男士 香水 100ml", en: "oud men's perfume 100ml",
    variant: ["Erkek Parfüm Oud 100 ml EDP Odunsu", "沉香 乌木 男士 香水 100ml 持久 淡香精", "Men's Oud Wood Eau de Parfum 100ml Long Lasting"],
    accessory: ["Parfüm doldurulabilir şişe 10 ml"],
    different: ["Kadın Parfüm Çiçeksi 50 ml EDT", "Oda Kokusu Oud 500 ml"],
  },
  // ───────────────────────────── health ─────────────────────────────
  {
    id: "bp-omron-m3", group: "health", img: true,
    q: "Omron M3 Comfort Tansiyon Aleti", zh: "欧姆龙 Omron M3 Comfort 电子血压计", en: "Omron M3 Comfort blood pressure monitor",
    same: ["OMRON M3 Comfort Upper Arm Blood Pressure Monitor HEM-7155-E", "欧姆龙 OMRON M3 Comfort 上臂式 电子血压计 HEM-7155", "Omron M3 Comfort HEM-7155-E Üst Koldan Tansiyon Aleti"],
    variant: ["Omron M2 Basic Tansiyon Aleti", "Omron M7 Intelli IT Tansiyon Aleti"],
    accessory: ["Omron Intelli Wrap Manşet 22-42 cm", "Omron AC adapter for M3"],
    different: ["Beurer BM 28 Tansiyon Aleti", "Xiaomi iHealth Tansiyon Aleti"],
  },
  {
    id: "scale-xiaomi-s400", group: "health", img: true,
    q: "Xiaomi Body Composition Scale S400 Akıllı Tartı", zh: "小米体脂秤 S400", en: "Xiaomi Body Composition Scale S400",
    same: ["Xiaomi Body Composition Scale S400 Smart Scale 25 Body Metrics", "小米 体脂秤 S400 智能 家用 精准 25项身体数据", "Xiaomi Body Composition Scale S400 Akıllı Vücut Analiz Tartısı"],
    variant: ["Xiaomi Mi Body Composition Scale 2", "Xiaomi Smart Scale S200"],
    accessory: ["Tartı pili AAA 4'lü"],
    different: ["Withings Body+ Akıllı Tartı", "Huawei Scale 3"],
  },
  {
    id: "massager-theragun-mini", group: "health", img: true,
    q: "Theragun Mini 2. Nesil Masaj Tabancası", zh: "Theragun Mini 2代 筋膜枪", en: "Theragun Mini 2nd generation massage gun",
    same: ["Theragun Mini 2nd Generation Portable Percussion Massage Gun Black", "Therabody Theragun Mini 2.0 便携 筋膜枪 黑色 第二代", "Therabody Theragun Mini 2. Nesil Taşınabilir Masaj Tabancası Siyah"],
    variant: ["Theragun Prime Masaj Tabancası", "Theragun Mini 1. Nesil"],
    accessory: ["Theragun Mini Başlık Seti 3'lü", "Theragun Mini carrying case"],
    different: ["Hypervolt Go 2 Masaj Tabancası", "Mini masaj tabancası 4 başlık 6 kademe"],
  },
  {
    id: "glucometer-accuchek-guide", group: "health", pack: ["Accu-Chek Guide Şeker Ölçüm Stribi 50'li 1 Kutu", "Accu-Chek Guide Test Strips 100 Count 2 Boxes"],
    q: "Accu-Chek Guide Şeker Ölçüm Cihazı", zh: "罗氏 Accu-Chek Guide 血糖仪", en: "Accu-Chek Guide blood glucose meter",
    same: ["Accu-Chek Guide Blood Glucose Monitoring System Kit", "罗氏 Accu-Chek Guide 智航 血糖仪 套装", "Accu-Chek Guide Kan Şekeri Ölçüm Cihazı Seti"],
    variant: ["Accu-Chek Instant Şeker Ölçüm Cihazı", "Accu-Chek Guide Me"],
    accessory: ["Accu-Chek Guide Strip 50'li", "Accu-Chek Softclix lancets 200"],
    different: ["Contour Plus Şeker Ölçüm Cihazı", "OneTouch Verio Reflect"],
  },
  {
    id: "thermometer-generic-ir", group: "health", category: "ates-olcer",
    q: "temassız ateş ölçer kızılötesi", zh: "非接触 红外 额温枪", en: "non-contact infrared forehead thermometer",
    variant: ["Temassız Kızılötesi Ateş Ölçer Alından Dijital", "红外线 额温枪 非接触 婴儿 家用 电子体温计", "Non-Contact Infrared Forehead Thermometer Digital for Adults Baby"],
    accessory: ["Ateş ölçer pili AAA 2'li"],
    different: ["Dijital Koltuk Altı Termometre", "Oda Termometresi Dijital Nem Ölçer"],
  },
  // ───────────────────────────── sports ─────────────────────────────
  {
    id: "tent-naturehike-cloudup2", group: "sports", img: true,
    q: "Naturehike Cloud Up 2 Kamp Çadırı", zh: "挪客 Naturehike 云尚2 帐篷", en: "Naturehike Cloud Up 2 ultralight tent",
    same: ["Naturehike Cloud-Up 2 Person Ultralight Backpacking Tent 20D", "挪客 Naturehike 云尚2 双人 超轻 20D 帐篷 户外 露营", "Naturehike Cloud Up 2 Kişilik Ultralight 20D Kamp Çadırı"],
    variant: ["Naturehike Cloud Up 3 Kamp Çadırı", "Naturehike Mongar 2 Kamp Çadırı"],
    accessory: ["Naturehike Cloud Up 2 Footprint Zemin Örtüsü", "Tent stakes aluminum 10 pack"],
    different: ["MSR Hubba Hubba NX 2 Çadır", "Cloud Up 2 benzeri 2 kişilik ultralight çadır"],
  },
  {
    id: "ball-wilson-evo-nxt", group: "sports", img: true,
    q: "Wilson Evo NXT Basketbol Topu 7 Numara", zh: "威尔胜 Wilson Evo NXT 7号 篮球", en: "Wilson Evo NXT basketball size 7",
    same: ["Wilson Evo NXT Game Basketball Size 7 WTB0965", "威尔胜 Wilson Evo NXT 7号 比赛 篮球 室内 WTB0965", "Wilson Evo NXT 7 No Basketbol Topu WTB0965XB"],
    variant: ["Wilson Evo NXT 6 Numara Basketbol Topu", "Wilson NBA DRV Basketbol Topu 7"],
    accessory: ["Basketbol Topu Pompası İğneli", "Ball bag for 2 basketballs"],
    different: ["Spalding TF-1000 Basketbol Topu 7", "Molten BG4500 Basketbol Topu"],
  },
  {
    id: "goggles-speedo-biofuse", group: "sports",
    q: "Speedo Biofuse 2.0 Yüzücü Gözlüğü", zh: "速比涛 Speedo Biofuse 2.0 泳镜", en: "Speedo Biofuse 2.0 swimming goggles",
    same: ["Speedo Biofuse 2.0 Swimming Goggles Adult Blue 8-00233214502", "速比涛 Speedo Biofuse 2.0 成人 泳镜 防雾 蓝色", "Speedo Biofuse 2.0 Yetişkin Yüzücü Gözlüğü Mavi"],
    variant: ["Speedo Biofuse 2.0 Mirror Yüzücü Gözlüğü", "Speedo Futura Biofuse Flexiseal"],
    accessory: ["Yüzücü Gözlüğü Kılıfı", "Anti-fog spray for goggles"],
    different: ["Arena Cobra Ultra Swipe Yüzücü Gözlüğü", "TYR Special Ops 3.0"],
  },
  {
    id: "cooler-coleman-48qt", group: "sports",
    q: "Coleman 48 Quart Soğutucu Kutu", zh: "科勒曼 Coleman 48QT 保温箱", en: "Coleman 48 Quart Performance Cooler",
    same: ["Coleman 48 Quart Performance Cooler Blue 3000000148", "科勒曼 Coleman 48QT 45L 保温箱 户外 露营 蓝色", "Coleman 48 Qt Performance Soğutucu Kutu 45 L Mavi"],
    variant: ["Coleman 28 Quart Soğutucu Kutu", "Coleman 54 Quart Steel Belted Cooler"],
    accessory: ["Buz Aküsü 4'lü Büyük", "Cooler drain plug replacement"],
    different: ["Igloo Island Breeze 48 Qt Cooler", "Thermos 45 L Soğutucu Kutu"],
  },
  {
    id: "dumbbell-bowflex-552", group: "sports", img: true,
    q: "Bowflex SelectTech 552 Ayarlanabilir Dambıl", zh: "Bowflex SelectTech 552 可调节哑铃", en: "Bowflex SelectTech 552 adjustable dumbbells",
    same: ["Bowflex SelectTech 552 Adjustable Dumbbells Pair 5-52.5 lbs", "Bowflex SelectTech 552 可调节 哑铃 一对 2-24kg", "Bowflex SelectTech 552 Ayarlanabilir Dambıl Çifti 2-24 kg"],
    variant: ["Bowflex SelectTech 1090 Dambıl", "Bowflex SelectTech 560"],
    accessory: ["Bowflex 552 Dambıl Standı", "Bowflex SelectTech stand"],
    different: ["PowerBlock Elite EXP Dambıl", "SelectTech style adjustable dumbbell 24kg pair"],
  },
  {
    id: "pool-intex-easyset", group: "sports",
    q: "Intex Easy Set 305x76 Havuz", zh: "Intex Easy Set 305x76cm 充气游泳池", en: "Intex Easy Set pool 305x76 cm",
    same: ["Intex 28120 Easy Set Pool 305 x 76 cm Blue", "Intex 28120 Easy Set 305x76cm 家庭 充气 游泳池", "Intex 28120 Easy Set 305x76 cm Şişme Havuz"],
    variant: ["Intex Easy Set 366x76 Havuz 28130", "Intex Prism Frame 305x76 Havuz"],
    accessory: ["Intex 28603 Havuz Filtre Pompası", "Intex pool cover 305 cm"],
    different: ["Bestway Fast Set 305x76 Havuz", "Şişme Çocuk Havuzu 3 Halkalı"],
  },
  {
    id: "kettlebell-generic-16", group: "sports", category: "kettlebell",
    q: "16 kg kettlebell dökme demir", zh: "16kg 壶铃 铸铁", en: "16 kg cast iron kettlebell",
    variant: ["Kettlebell 16 kg Dökme Demir Neopren Kaplı", "壶铃 16kg 铸铁 健身 家用 男士", "Cast Iron Kettlebell 16 kg Powder Coated"],
    accessory: ["Kettlebell bilek koruyucu", "Kettlebell standı 3 katlı"],
    different: ["Dambıl Seti 20 kg Vinil", "Sağlık Topu 5 kg"],
  },
  {
    id: "bike-light-generic", group: "sports", category: "bisiklet-isigi",
    q: "USB şarjlı bisiklet far seti", zh: "USB充电 自行车 前灯 尾灯 套装", en: "USB rechargeable bike light set",
    variant: ["USB Şarjlı Bisiklet Ön Arka Far Seti Su Geçirmez", "自行车灯 USB充电 前灯 尾灯 套装 防水 夜骑", "USB Rechargeable Bike Lights Set Front and Rear Waterproof"],
    accessory: ["Bisiklet far tutucu silikon"],
    different: ["Kafa Lambası USB Şarjlı", "Bisiklet Kilidi Şifreli"],
  },
  // ───────────────────────────── motorcycle ─────────────────────────────
  {
    id: "helmet-shoei-nxr2", group: "motorcycle", img: true,
    q: "Shoei NXR2 Kask", zh: "SHOEI NXR2 全盔", en: "Shoei NXR2 full face helmet",
    same: ["Shoei NXR2 Full Face Motorcycle Helmet Matt Black", "SHOEI NXR2 全盔 摩托车头盔 哑光黑 日本", "Shoei NXR2 Mat Siyah Kapalı Kask"],
    variant: ["Shoei NXR Kask", "Shoei GT-Air 2 Kask"],
    accessory: ["Shoei NXR2 CWR-F2 Vizör Füme", "Shoei NXR2 cheek pads 35mm"],
    different: ["Arai Quantic Kask", "HJC RPHA 11 Kask"],
  },
  {
    id: "oil-motul-7100", group: "motorcycle", img: true, pack: ["Motul 7100 10W40 4T Motor Yağı 1 L Tek", "Motul 7100 10W40 4T Motor Yağı 4 x 1 L"],
    q: "Motul 7100 10W40 4T Motor Yağı 1 L", zh: "摩特 Motul 7100 10W40 摩托车 机油 1L", en: "Motul 7100 10W40 4T synthetic motorcycle oil 1L",
    same: ["Motul 7100 4T 10W-40 Fully Synthetic Ester Motorcycle Oil 1 Litre", "摩特 MOTUL 7100 10W40 全合成 摩托车 机油 1L", "Motul 7100 4T 10W-40 Tam Sentetik Motosiklet Yağı 1 Lt"],
    variant: ["Motul 7100 10W50 4T Motor Yağı 1 L", "Motul 5100 10W40 4T Motor Yağı 1 L"],
    accessory: ["Yağ Filtresi HF204", "Yağ huni seti 3'lü"],
    different: ["Castrol Power1 10W40 4T Motor Yağı 1 L", "Liqui Moly Street 10W40 1 L"],
  },
  {
    id: "topcase-givi-e300", group: "motorcycle",
    q: "Givi E300 Monolock Arka Çanta 30 L", zh: "Givi E300 Monolock 尾箱 30L", en: "Givi E300 Monolock top case 30L",
    same: ["GIVI E300NT2 Monolock Top Case 30L Black with Plate", "GIVI E300 Monolock 尾箱 30L 摩托车 后备箱 黑色", "Givi E300NT2 Monolock 30 L Arka Çanta Siyah Taban Dahil"],
    variant: ["Givi E340 Vision Monolock 34 L", "Givi B32 Bold Monolock 32 L"],
    accessory: ["Givi E300 Yedek Anahtar Seti", "Givi Monolock plate M5"],
    different: ["Shad SH29 Arka Çanta 29 L", "Kappa K30N Arka Çanta"],
  },
  {
    id: "gloves-alpinestars-smx1", group: "motorcycle", img: true,
    q: "Alpinestars SMX-1 Air V2 Eldiven", zh: "A星 Alpinestars SMX-1 Air V2 手套", en: "Alpinestars SMX-1 Air V2 gloves",
    same: ["Alpinestars SMX-1 Air V2 Motorcycle Gloves Black", "Alpinestars A星 SMX-1 Air V2 摩托车 骑行 手套 黑色 夏季", "Alpinestars SMX-1 Air V2 Motosiklet Eldiveni Siyah"],
    variant: ["Alpinestars SMX-2 Air Carbon V2 Eldiven", "Alpinestars SP-8 V3 Eldiven"],
    accessory: ["Eldiven kurutucu", "Motosiklet eldiveni iç astar"],
    different: ["Dainese Mig 3 Eldiven", "Rev'it Sand 4 Eldiven"],
  },
  {
    id: "helmet-hjc-rpha11", group: "motorcycle", img: true,
    q: "HJC RPHA 11 Kask", zh: "HJC RPHA 11 全盔", en: "HJC RPHA 11 Pro full face helmet",
    same: ["HJC RPHA 11 Pro Carbon Full Face Helmet Solid Black", "HJC RPHA 11 全盔 碳纤维 摩托车 头盔 黑色", "HJC RPHA 11 Solid Mat Siyah Kask"],
    variant: ["HJC RPHA 12 Kask", "HJC RPHA 71 Kask"],
    accessory: ["HJC RPHA 11 HJ-26 Vizör Füme", "HJC RPHA 11 Pinlock lens"],
    different: ["AGV K6 S Kask", "RPHA 11 replika kask carbon görünümlü"],
  },
  // ───────────────────────────── auto ─────────────────────────────
  {
    id: "wiper-bosch-aerotwin", group: "auto", pack: ["Bosch Aerotwin A863S Silecek Takımı Tek Set", "Bosch Aerotwin A863S Silecek 2 Set Paketi"],
    q: "Bosch Aerotwin A863S Silecek Takımı", zh: "博世 Bosch Aerotwin A863S 雨刷 一对", en: "Bosch Aerotwin A863S wiper blade set",
    same: ["Bosch Aerotwin A863S Wiper Blade Set 650/450 mm 3397007863", "博世 Bosch Aerotwin A863S 无骨 雨刷 650/450 3397007863", "Bosch Aerotwin A863S 650/450 mm Silecek Takımı 3397007863"],
    variant: ["Bosch Aerotwin A555S Silecek Takımı", "Bosch Aerotwin A863S Arka Silecek"],
    accessory: ["Silecek adaptörü multi-clip", "Cam suyu konsantre 250 ml"],
    different: ["Valeo Silencio X.TRM VM365 Silecek", "Aerotwin tipi muz silecek 650/450 muadil"],
  },
  {
    id: "carcharger-baseus-pd", group: "auto", img: true,
    q: "Baseus Araç Şarj Cihazı 65W PD", zh: "倍思 65W PD 车载充电器", en: "Baseus 65W PD car charger",
    same: ["Baseus 65W USB C Car Charger PD3.0 QC4.0 Dual Port Fast Charging", "倍思 65W 车载充电器 PD 快充 双口 Type-C 点烟器", "Baseus 65W PD Çift Çıkışlı Hızlı Araç Şarj Cihazı"],
    variant: ["Baseus Araç Şarj Cihazı 30W", "Baseus 160W Araç Şarj Cihazı"],
    accessory: ["Baseus 100W USB-C Kablo 1 m", "Araç içi kablo düzenleyici"],
    different: ["Ugreen 69W Araç Şarj Cihazı", "Anker PowerDrive III 65W Car Charger"],
  },
  {
    id: "inflator-xiaomi-2", group: "auto", img: true,
    q: "Xiaomi Taşınabilir Hava Pompası 2", zh: "小米 米家充气宝2", en: "Xiaomi Portable Electric Air Compressor 2",
    same: ["Xiaomi Portable Electric Air Compressor 2 150PSI Tire Inflator", "小米 米家 充气宝2 车载 充气泵 150PSI 数显", "Xiaomi Mijia Taşınabilir Elektrikli Hava Pompası 2 150 PSI"],
    variant: ["Xiaomi Taşınabilir Hava Pompası 1S", "Xiaomi Air Compressor 2 Lite"],
    accessory: ["Xiaomi Hava Pompası Taşıma Çantası", "Presta valve adapter"],
    different: ["Baseus Super Mini Hava Pompası", "Kablosuz Lastik Şişirme Pompası Dijital 150 PSI"],
  },
  {
    id: "roofbox-thule-motion", group: "auto",
    q: "Thule Motion XT L Portbagaj Kutusu", zh: "拓乐 Thule Motion XT L 车顶箱", en: "Thule Motion XT L roof box",
    same: ["Thule Motion XT L 450 L Roof Box Black Glossy 629701", "拓乐 Thule Motion XT L 车顶箱 450L 亮黑 629701", "Thule Motion XT L 450 L Portbagaj Kutusu Parlak Siyah 629701"],
    variant: ["Thule Motion XT XL 500 L Portbagaj", "Thule Force XT L"],
    accessory: ["Thule Portbagaj Kilidi 4'lü Aynı Anahtar", "Thule roof box lid lifter"],
    different: ["Hapro Trivor 440 Portbagaj Kutusu", "Menabo Mania 460 L"],
  },
  {
    id: "bulb-osram-nb-h7", group: "auto", pack: ["Osram Night Breaker Laser H7 Tekli Ampul", "Osram Night Breaker Laser H7 Duo Box 2 Ampul"],
    q: "Osram Night Breaker Laser H7 Ampul", zh: "欧司朗 Osram Night Breaker Laser H7 车灯", en: "Osram Night Breaker Laser H7 headlight bulb",
    same: ["OSRAM NIGHT BREAKER LASER H7 Next Generation +150% 64210NL", "欧司朗 OSRAM 夜行者 激光 Night Breaker Laser H7 +150% 64210NL", "Osram Night Breaker Laser H7 +%150 Far Ampulü 64210NL"],
    variant: ["Osram Night Breaker Laser H4 Ampul", "Osram Night Breaker Silver H7"],
    accessory: ["H7 ampul tutucu soket", "Far ampulü montaj eldiveni"],
    different: ["Philips RacingVision GT200 H7", "Bosch Plus 90 H7 Ampul"],
  },
  {
    id: "carmat-generic", group: "auto", category: "oto-paspasi",
    q: "havuzlu oto paspası 3D", zh: "3D 汽车脚垫 全包围", en: "3D car floor mats all weather",
    variant: ["Havuzlu 3D Oto Paspası Üniversal Siyah 5 Parça", "3D 汽车脚垫 全包围 TPE 通用 5件套 黑色", "All Weather 3D Car Floor Mats Universal TPE 5 Piece"],
    accessory: ["Paspas sabitleme klipsi 4'lü"],
    different: ["Bagaj Havuzu Üniversal", "Araç Koltuk Kılıfı Seti"],
  },
  // ───────────────────────────── tools ─────────────────────────────
  {
    id: "drill-dewalt-dcd771", group: "tools", img: true,
    q: "DeWalt DCD771 Şarjlı Matkap 18V", zh: "得伟 DeWalt DCD771 18V 充电 电钻", en: "DeWalt DCD771C2 20V MAX cordless drill",
    same: ["DEWALT DCD771C2 20V MAX Cordless Drill/Driver Kit 2 Batteries", "得伟 DEWALT DCD771 18V 锂电 充电 手电钻 双电", "DeWalt DCD771C2 18V 1.3Ah Çift Akülü Şarjlı Matkap"],
    variant: ["DeWalt DCD791 Fırçasız Şarjlı Matkap", "DeWalt DCD776 Darbeli Şarjlı Matkap"],
    accessory: ["DeWalt DCB184 5.0Ah Akü 18V", "Drill bit set 100 pcs for DeWalt"],
    different: ["Makita DHP453 Şarjlı Matkap 18V", "Bosch GSB 18V-21 Şarjlı Matkap"],
  },
  {
    id: "drill-makita-dhp484", group: "tools", img: true,
    q: "Makita DHP484 Darbeli Şarjlı Matkap", zh: "牧田 Makita DHP484 无刷 冲击钻", en: "Makita DHP484 brushless combi drill",
    same: ["Makita DHP484Z 18V LXT Brushless Combi Drill Body Only", "牧田 MAKITA DHP484 18V 无刷 锂电 冲击 电钻 裸机", "Makita DHP484Z 18V Fırçasız Darbeli Şarjlı Matkap Gövde"],
    variant: ["Makita DHP485 Darbeli Şarjlı Matkap", "Makita DDF484 Şarjlı Matkap Darbesiz"],
    accessory: ["Makita BL1850B 5.0Ah Akü", "Makita Makpac 2 Taşıma Çantası"],
    different: ["DeWalt DCD796 Darbeli Matkap", "Milwaukee M18 FPD2 Darbeli Matkap"],
  },
  {
    id: "tape-stanley-fatmax-8m", group: "tools", pack: ["Stanley FatMax 8 m Şerit Metre Tekli", "Stanley FatMax 8 m Şerit Metre 2'li Paket"],
    q: "Stanley FatMax 8 m Şerit Metre", zh: "史丹利 Stanley FatMax 8米 卷尺", en: "Stanley FatMax 8m tape measure",
    same: ["STANLEY FATMAX Tape Measure 8m/26ft 32mm Blade 0-33-728", "史丹利 STANLEY FatMax 8米 卷尺 32mm 加宽 0-33-728", "Stanley FatMax 8 m x 32 mm Şerit Metre 0-33-728"],
    variant: ["Stanley FatMax 5 m Şerit Metre", "Stanley Tylon 8 m Şerit Metre"],
    accessory: ["Şerit metre kemer klipsi"],
    different: ["Bosch Şerit Metre 8 m", "Lazer Metre 50 m Dijital"],
  },
  {
    id: "washer-karcher-k2", group: "tools", img: true,
    q: "Kärcher K2 Basınçlı Yıkama Makinesi", zh: "卡赫 Karcher K2 高压清洗机", en: "Karcher K2 pressure washer",
    same: ["Kärcher K2 Universal Edition Pressure Washer 110 bar", "卡赫 Karcher K2 高压清洗机 洗车机 家用 110bar", "Kärcher K2 Universal Edition 110 Bar Basınçlı Yıkama Makinesi"],
    variant: ["Kärcher K3 Basınçlı Yıkama Makinesi", "Kärcher K2 Power Control"],
    accessory: ["Kärcher K2 Köpük Tabancası", "Karcher K2 replacement hose 6m"],
    different: ["Bosch EasyAquatak 120 Basınçlı Yıkama", "Black+Decker BXPW1500E Basınçlı Yıkama"],
  },
  {
    id: "laser-bosch-glm50", group: "tools", img: true,
    q: "Bosch GLM 50-27 CG Lazer Metre", zh: "博世 Bosch GLM 50-27 CG 激光测距仪", en: "Bosch GLM 50-27 CG laser measure",
    same: ["Bosch GLM 50-27 CG Laser Measure 50m Bluetooth Green Laser", "博世 Bosch GLM 50-27 CG 绿光 激光测距仪 50米 蓝牙", "Bosch GLM 50-27 CG 50 m Yeşil Lazer Metre Bluetooth"],
    variant: ["Bosch GLM 50-27 C Lazer Metre Kırmızı", "Bosch GLM 100-25 C"],
    accessory: ["Lazer metre kılıfı", "Bosch BT 150 tripod"],
    different: ["Leica Disto D2 Lazer Metre", "Lazer metre 50 m dijital şarjlı"],
  },
  {
    id: "screwdriver-wera-kk", group: "tools",
    q: "Wera Kraftform Kompakt 20 Tool Finder", zh: "维拉 Wera Kraftform Kompakt 20 螺丝刀 套装", en: "Wera Kraftform Kompakt 20 Tool Finder 2",
    same: ["Wera 05051016001 Kraftform Kompakt 20 Tool Finder 2 with Pouch 13 Pieces", "维拉 Wera Kraftform Kompakt 20 Tool Finder 2 13件 螺丝批套装 05051016001", "Wera Kraftform Kompakt 20 Tool Finder 2 13 Parça Tornavida Seti 05051016001"],
    variant: ["Wera Kraftform Kompakt 60 Tornavida Seti", "Wera Tool-Check Plus"],
    accessory: ["Wera Bits 25 mm 10'lu PH2", "Wera Rapidaptor bit holder"],
    different: ["Bosch 43 Parça Tornavida Seti", "Stanley Tornavida Seti 6 Parça"],
  },
  {
    id: "toolset-generic-108", group: "tools", category: "el-aleti-seti",
    q: "108 parça el aleti seti çantalı", zh: "108件 家用 工具箱 套装", en: "108 piece household tool kit with case",
    variant: ["108 Parça El Aleti Seti Çantalı Krom Vanadyum", "108件 家用 工具 套装 五金 工具箱 维修", "108 Piece Household Tool Kit with Carrying Case"],
    accessory: ["Takım çantası boş 16 inç"],
    different: ["Lokma Seti 46 Parça 1/4", "Şarjlı Tornavida Seti 3.6V"],
  },
  // ───────────────────────────── garden ─────────────────────────────
  {
    id: "hose-gardena-flex", group: "garden",
    q: "Gardena Flex Bahçe Hortumu 1/2 20 m", zh: "嘉丁拿 Gardena Flex 1/2 20米 花园水管", en: "Gardena Flex garden hose 1/2 inch 20m",
    same: ["GARDENA Flex Hose 13 mm (1/2\") 20 m 18033-20", "嘉丁拿 GARDENA Flex 花园 水管 13mm 1/2 20米 18033", "Gardena Flex Hortum 13 mm 1/2\" 20 m 18033-20"],
    variant: ["Gardena Flex Bahçe Hortumu 1/2 50 m", "Gardena Classic Hortum 1/2 20 m"],
    accessory: ["Gardena Hortum Bağlantı Seti 1/2", "Gardena spray nozzle"],
    different: ["Hozelock Tricoflex 1/2 20 m Hortum", "Genişleyen Bahçe Hortumu 30 m"],
  },
  {
    id: "trimmer-bosch-ahs50", group: "garden",
    q: "Bosch AHS 50-20 LI Çit Budama Makinesi", zh: "博世 Bosch AHS 50-20 LI 充电 绿篱机", en: "Bosch AHS 50-20 LI cordless hedge trimmer",
    same: ["Bosch AHS 50-20 LI Cordless Hedge Cutter 18V 50 cm", "博世 Bosch AHS 50-20 LI 18V 锂电 绿篱机 50cm", "Bosch AHS 50-20 LI 18V 50 cm Akülü Çit Budama Makinesi"],
    variant: ["Bosch AHS 55-20 LI Çit Budama", "Bosch EasyHedgeCut 18-45"],
    accessory: ["Bosch 18V 2.5Ah Akü PBA", "Hedge trimmer blade oil"],
    different: ["Black+Decker GTC18452PC Çit Budama", "Einhell GE-CH 1846 Çit Budama"],
  },
  {
    id: "grill-weber-kettle-57", group: "garden", img: true,
    q: "Weber Original Kettle 57 cm Mangal", zh: "韦伯 Weber Original Kettle 57cm 烧烤炉", en: "Weber Original Kettle 57 cm charcoal grill",
    same: ["Weber Original Kettle Charcoal Grill 57 cm Black 1341004", "韦伯 Weber Original Kettle 57cm 木炭 烧烤炉 黑色 1341004", "Weber Original Kettle 57 cm Kömürlü Mangal Siyah 1341004"],
    variant: ["Weber Master-Touch 57 cm Mangal", "Weber Original Kettle 47 cm Mangal"],
    accessory: ["Weber 57 cm Mangal Örtüsü", "Weber chimney starter"],
    different: ["Napoleon Pro 22 Kettle Mangal", "Kettle style 57cm charcoal grill OEM"],
  },
  {
    id: "solar-lamp-generic", group: "garden", category: "solar-bahce-lambasi",
    q: "solar bahçe lambası kazıklı", zh: "太阳能 草坪灯 插地", en: "solar garden stake lights",
    variant: ["Solar Bahçe Lambası Kazıklı 8'li Set Sıcak Beyaz", "太阳能 草坪灯 插地灯 户外 防水 8个装 暖光", "Solar Garden Lights Outdoor Pathway Stake 8 Pack Warm White"],
    accessory: ["Solar lamba yedek pil AA 1.2V 4'lü"],
    different: ["Solar Duvar Lambası Sensörlü", "Bahçe Aplik Siyah E27"],
  },
  // ───────────────────────────── toys ─────────────────────────────
  {
    id: "lego-10281", group: "toys", img: true,
    q: "LEGO 10281 Bonsai Ağacı", zh: "乐高 10281 盆景树", en: "LEGO Botanical Collection 10281 Bonsai Tree",
    same: ["LEGO Icons Bonsai Tree 10281 Building Kit 878 Pieces", "乐高 LEGO 10281 盆景树 创意 百变 高手 积木", "LEGO Icons 10281 Bonsai Ağacı Yapım Seti 878 Parça"],
    variant: ["LEGO 10280 Çiçek Buketi", "LEGO 10309 Sukulentler"],
    accessory: ["LEGO 10281 Bonsai Vitrin Kutusu", "Acrylic display case for LEGO 10281"],
    different: ["Mould King Bonsai Ağacı Yapı Blokları", "10281 compatible bonsai tree building blocks 878 pcs"],
  },
  {
    id: "hotwheels-track-generic", group: "toys",
    q: "Hot Wheels Track Builder Unlimited Pist Seti", zh: "风火轮 Hot Wheels 轨道 套装 Track Builder", en: "Hot Wheels Track Builder Unlimited set",
    same: ["Hot Wheels Track Builder Unlimited Ultra Stackable Booster Box GWT44", "风火轮 Hot Wheels 轨道 大师 无限 加速器 套装 GWT44", "Hot Wheels Track Builder Unlimited Ultra Boost Kutusu GWT44"],
    variant: ["Hot Wheels Track Builder Loop Kit", "Hot Wheels City Pist Seti"],
    accessory: ["Hot Wheels Araba 5'li Paket", "Hot Wheels track connectors 20 pcs"],
    different: ["Carrera Go Yarış Pisti", "Oyuncak Araba Pisti 300 Parça Esnek"],
  },
  {
    id: "nerf-elite-2-commander", group: "toys",
    q: "Nerf Elite 2.0 Commander RD-6", zh: "孩之宝 Nerf 精英 2.0 指挥官 RD-6", en: "Nerf Elite 2.0 Commander RD-6 blaster",
    same: ["NERF Elite 2.0 Commander RD-6 Blaster 12 Official Darts E9485", "孩之宝 NERF 精英 2.0 指挥官 RD-6 发射器 12发 E9485", "Nerf Elite 2.0 Commander RD-6 12 Dartlı E9485"],
    variant: ["Nerf Elite 2.0 Echo CS-10", "Nerf Elite 2.0 Phoenix CS-6"],
    accessory: ["Nerf Elite Dart 30'lu", "Nerf tactical vest"],
    different: ["X-Shot Excel Hawk Eye", "Köpük Dart Tabancası 20 Dartlı"],
  },
  {
    id: "doll-barbie-dreamhouse", group: "toys", img: true,
    q: "Barbie Rüya Evi Dreamhouse 2023", zh: "芭比 Barbie 梦想豪宅 2023", en: "Barbie Dreamhouse 2023 playset",
    same: ["Barbie Dreamhouse 2023 Pool Party Doll House with 3-Story Slide HMX10", "芭比 Barbie 梦想豪宅 2023 泳池派对 3层 滑梯 HMX10", "Barbie Rüya Evi 2023 Havuz Partisi 3 Katlı HMX10"],
    variant: ["Barbie Malibu Evi Oyun Seti", "Barbie Dreamhouse 2021 GRG93"],
    accessory: ["Barbie Bebek Kıyafet Seti 10 Parça", "Barbie doll shoes pack"],
    different: ["KidKraft Ahşap Oyuncak Bebek Evi", "Dreamhouse style 3 storey doll house wooden"],
  },
  {
    id: "cube-gan-356m", group: "toys",
    q: "GAN 356 M Manyetik Zeka Küpü", zh: "GAN 356 M 磁力 三阶 魔方", en: "GAN 356 M magnetic speed cube 3x3",
    same: ["GAN 356 M 3x3 Magnetic Speed Cube Stickerless Lite", "GAN 356 M 磁力版 三阶 魔方 比赛 专用 顺滑", "GAN 356 M 3x3 Manyetik Speed Cube Stickersız"],
    variant: ["GAN 356 RS Zeka Küpü", "GAN 11 M Pro Zeka Küpü"],
    accessory: ["GAN Küp Yağı 10 ml", "Cube bag for GAN 356"],
    different: ["MoYu RS3M 2020 Zeka Küpü", "QiYi Warrior S 3x3"],
  },
  {
    id: "playdoh-generic-pack", group: "toys", pack: ["Play-Doh 4'lü Oyun Hamuru Seti Tek Paket", "Play-Doh Oyun Hamuru 20'li Paket"],
    q: "Play-Doh 4'lü Oyun Hamuru", zh: "培乐多 Play-Doh 彩泥 4罐装", en: "Play-Doh 4 pack modeling compound",
    same: ["Play-Doh 4-Pack of Colors 4-Ounce Cans B5517", "培乐多 Play-Doh 彩泥 4色装 4罐 B5517", "Play-Doh 4'lü Oyun Hamuru Seti B5517"],
    variant: ["Play-Doh Kitchen Creations Seti", "Play-Doh 10'lu Oyun Hamuru"],
    accessory: ["Oyun Hamuru Kalıp Seti 24 Parça"],
    different: ["Kinetik Kum 1 kg", "Oyun Hamuru 12 Renk Jumbo"],
  },
  {
    id: "train-generic-wooden", group: "toys", category: "ahsap-tren-seti",
    q: "ahşap tren seti çocuk", zh: "儿童 木质 火车 轨道 玩具", en: "wooden train set for kids",
    variant: ["Ahşap Tren Seti 80 Parça Çocuk Oyuncak Raylı", "儿童 木质 火车 轨道 玩具 80件 套装 益智", "Wooden Train Set 80 Pieces Toddler Railway Toy"],
    accessory: ["Ahşap tren rayı ek parça 20'li"],
    different: ["Elektrikli Tren Seti Pilli", "Ahşap Yapı Blokları 100 Parça"],
  },
  // ───────────────────────────── baby ─────────────────────────────
  {
    id: "bottle-avent-natural", group: "baby", pack: ["Philips Avent Natural Response 260 ml Biberon Tekli", "Philips Avent Natural Response 260 ml Biberon 2'li"],
    q: "Philips Avent Natural Response 260 ml Biberon", zh: "飞利浦 新安怡 Natural Response 260ml 奶瓶", en: "Philips Avent Natural Response baby bottle 260ml",
    same: ["Philips Avent Natural Response Baby Bottle 9oz/260ml SCY903/01", "飞利浦 新安怡 Avent 自然 顺应 奶瓶 260ml SCY903", "Philips Avent Natural Response 260 ml Biberon SCY903/01"],
    variant: ["Philips Avent Natural Response 125 ml Biberon", "Philips Avent Anti-colic 260 ml Biberon"],
    accessory: ["Philips Avent Natural Response Emzik Akış 3 2'li", "Avent bottle brush"],
    different: ["Mam Easy Start 260 ml Biberon", "Nuk First Choice 300 ml Biberon"],
  },
  {
    id: "diapers-pampers-premium", group: "baby", pack: ["Pampers Premium Care 4 Numara 52'li Tek Paket", "Pampers Premium Care 4 Numara Aylık Paket 174'lü"],
    q: "Pampers Premium Care 4 Numara Bebek Bezi", zh: "帮宝适 Pampers 一级帮 4号 纸尿裤", en: "Pampers Premium Care size 4 diapers",
    same: ["Pampers Premium Care Diapers Size 4 9-14 kg 52 Count", "帮宝适 Pampers Premium Care 一级帮 纸尿裤 4号 9-14kg 52片", "Pampers Premium Care 4 Beden 9-14 kg 52 Adet Bebek Bezi"],
    variant: ["Pampers Premium Care 3 Numara Bebek Bezi", "Pampers Baby-Dry 4 Numara Bebek Bezi"],
    accessory: ["Islak Mendil 56'lı Bebek", "Bez kovası"],
    different: ["Huggies Elite Soft 4 Numara", "Molfix 4 Numara Bebek Bezi"],
  },
  {
    id: "crib-chicco-next2me", group: "baby", img: true,
    q: "Chicco Next2Me Magic Anne Yanı Beşik", zh: "智高 Chicco Next2Me Magic 床边床", en: "Chicco Next2Me Magic bedside crib",
    same: ["Chicco Next2Me Magic Evo Bedside Crib Grey", "智高 Chicco Next2Me Magic 婴儿 床边床 灰色", "Chicco Next2Me Magic Evo Anne Yanı Beşik Gri"],
    variant: ["Chicco Next2Me Pop Up Anne Yanı Beşik", "Chicco Next2Me Air"],
    accessory: ["Chicco Next2Me Çarşaf 2'li", "Next2Me mattress protector"],
    different: ["Kinderkraft Neste Up Anne Yanı Beşik", "Next2Me benzeri anne yanı beşik salıncaklı"],
  },
  {
    id: "pacifier-nuk-space", group: "baby", pack: ["NUK Space Emzik 0-6 Ay 2'li", "NUK Space Emzik 0-6 Ay 4'lü Paket"],
    q: "NUK Space Emzik 0-6 Ay 2'li", zh: "NUK Space 安抚奶嘴 0-6个月", en: "NUK Space pacifier 0-6 months",
    same: ["NUK Space Soother 0-6 Months Silicone 2 Pack", "NUK Space 安抚奶嘴 硅胶 0-6个月 2只装", "NUK Space Silikon Emzik 0-6 Ay 2'li"],
    variant: ["NUK Space Emzik 6-18 Ay", "NUK Genius Emzik 0-6 Ay"],
    accessory: ["Emzik Zinciri Ahşap Boncuk", "NUK soother box"],
    different: ["Philips Avent Ultra Air Emzik 0-6 Ay", "MAM Air Emzik 0-6 Ay"],
  },
  {
    id: "carrier-ergobaby-omni360", group: "baby",
    q: "Ergobaby Omni 360 Kanguru", zh: "Ergobaby Omni 360 婴儿背带", en: "Ergobaby Omni 360 baby carrier",
    same: ["Ergobaby Omni 360 All-Position Baby Carrier Cool Air Mesh Pearl Grey", "Ergobaby Omni 360 全阶段 婴儿 背带 透气 珍珠灰", "Ergobaby Omni 360 Cool Air Mesh Kanguru İnci Gri"],
    variant: ["Ergobaby Omni Breeze Kanguru", "Ergobaby Embrace Kanguru"],
    accessory: ["Ergobaby Omni 360 Ağız Salyası Önlüğü", "Ergobaby winter cover"],
    different: ["BabyBjörn Mini Kanguru", "Omni 360 benzeri ergonomik kanguru 4 pozisyon"],
  },
  // ───────────────────────────── pet ─────────────────────────────
  {
    id: "brush-furminator-l", group: "pet",
    q: "Furminator Büyük Köpek Tüy Alma Tarağı", zh: "Furminator 大型犬 去毛 梳 L", en: "FURminator large dog deshedding tool",
    same: ["FURminator Undercoat deShedding Tool for Large Dogs Long Hair", "FURminator 大型犬 长毛 去毛 梳 脱毛 梳子 L", "Furminator Büyük Boy Uzun Tüylü Köpek Tüy Alma Tarağı L"],
    variant: ["Furminator Orta Boy Köpek Tüy Alma Tarağı M", "Furminator Kedi Tüy Alma Tarağı"],
    accessory: ["Köpek tırnak makası"],
    different: ["Köpek Tüy Alma Fırçası Furminator Benzeri", "Pet Slicker Brush Kedi Köpek"],
  },
  {
    id: "tracker-tractive-gps-dog", group: "pet",
    q: "Tractive GPS Köpek Takip Cihazı", zh: "Tractive GPS 狗狗 定位器", en: "Tractive GPS dog tracker",
    same: ["Tractive GPS Tracker for Dogs Waterproof Location & Activity", "Tractive GPS 宠物 定位器 狗狗 防水 活动监测", "Tractive GPS Köpek Takip Cihazı Su Geçirmez"],
    variant: ["Tractive GPS Kedi Takip Cihazı", "Tractive GPS Dog XL"],
    accessory: ["Tractive Tasma Klipsi Yedek", "Tractive charging cable"],
    different: ["Apple AirTag Köpek Tasması", "Köpek GPS Takip Cihazı 4G Mini"],
  },
  {
    id: "fountain-petkit-eversweet3", group: "pet",
    q: "Petkit Eversweet 3 Pro Kedi Su Pınarı", zh: "小佩 Petkit Eversweet 3 Pro 宠物 饮水机", en: "Petkit Eversweet 3 Pro pet water fountain",
    same: ["PETKIT Eversweet 3 Pro Wireless Pump Cat Water Fountain 1.8L", "小佩 PETKIT Eversweet 3 Pro 无线 水泵 猫咪 饮水机 1.8L", "Petkit Eversweet 3 Pro Kablosuz Pompalı Kedi Su Pınarı 1.8 L"],
    variant: ["Petkit Eversweet Solo 2 Su Pınarı", "Petkit Eversweet 3 Su Pınarı"],
    accessory: ["Petkit Eversweet 3 Filtre 5'li", "Petkit Eversweet 3 pump replacement"],
    different: ["Catit Flower Kedi Su Pınarı", "Kedi Su Pınarı 2 L Paslanmaz"],
  },
  {
    id: "toy-kong-classic-l", group: "pet", pack: ["KONG Classic Köpek Oyuncağı L Tekli", "KONG Classic Köpek Oyuncağı L 2'li Paket"],
    q: "KONG Classic Köpek Oyuncağı L", zh: "KONG Classic 狗狗 耐咬 玩具 L", en: "KONG Classic dog toy large",
    same: ["KONG Classic Dog Toy Large Red Natural Rubber", "KONG Classic 经典 狗狗 漏食 耐咬 橡胶 玩具 L 红色", "KONG Classic Kauçuk Köpek Oyuncağı L Kırmızı"],
    variant: ["KONG Classic Köpek Oyuncağı M", "KONG Extreme Köpek Oyuncağı L"],
    accessory: ["KONG Easy Treat Dolgu Macunu", "KONG stuff'n paste"],
    different: ["Chuckit! Ultra Ball M", "Kauçuk Köpek Oyuncağı Konik Dolgulu"],
  },
  // ───────────────────────────── office ─────────────────────────────
  {
    id: "marker-stabilo-boss", group: "office", pack: ["Stabilo Boss Original Fosforlu Kalem 4'lü", "Stabilo Boss Original Fosforlu Kalem 8'li Set"],
    q: "Stabilo Boss Original Fosforlu Kalem 4'lü", zh: "思笔乐 Stabilo Boss 荧光笔 4色装", en: "Stabilo Boss Original highlighter 4 pack",
    same: ["STABILO BOSS ORIGINAL Highlighter Wallet of 4 Assorted Colours", "思笔乐 STABILO BOSS 荧光笔 4色 套装 德国", "Stabilo Boss Original Fosforlu Kalem 4 Renk Set"],
    variant: ["Stabilo Boss Original Pastel 6'lı", "Stabilo Boss Mini Fosforlu Kalem"],
    accessory: ["Kalemlik Masaüstü Metal"],
    different: ["Faber-Castell Textliner 4'lü", "Fosforlu Kalem 6 Renk Set Pastel"],
  },
  {
    id: "pen-pilot-g2-07", group: "office", pack: ["Pilot G-2 07 Jel Kalem Siyah Tekli", "Pilot G-2 07 Jel Kalem Siyah 12'li Kutu"],
    q: "Pilot G-2 07 Jel Kalem Siyah", zh: "百乐 Pilot G-2 0.7 中性笔 黑色", en: "Pilot G2 07 gel pen black",
    same: ["Pilot G2 Premium Gel Ink Pen Fine Point 0.7mm Black", "百乐 PILOT G-2 0.7mm 按动 中性笔 黑色", "Pilot G-2 0.7 mm Jel Kalem Siyah BL-G2-7"],
    variant: ["Pilot G-2 05 Jel Kalem Siyah", "Pilot G-2 07 Jel Kalem Mavi"],
    accessory: ["Pilot G-2 Yedek Jel Kalem İçi 0.7 Siyah 2'li"],
    different: ["Uni-ball Signo 207 0.7 Siyah", "Zebra Sarasa 0.7 Jel Kalem"],
  },
  {
    id: "notebook-moleskine-classic-l", group: "office",
    q: "Moleskine Classic Defter Large Çizgili Siyah", zh: "Moleskine 经典 笔记本 大型 横线 黑色", en: "Moleskine Classic notebook large ruled black",
    same: ["Moleskine Classic Notebook Hard Cover Large 13x21 cm Ruled Black QP060", "Moleskine 经典 硬面 笔记本 大型 13x21cm 横线 黑色 QP060", "Moleskine Classic Sert Kapak Large 13x21 cm Çizgili Siyah Defter QP060"],
    variant: ["Moleskine Classic Defter Pocket Çizgili", "Moleskine Classic Defter Large Kareli"],
    accessory: ["Moleskine Kalem Tutucu Klips", "Moleskine notebook cover"],
    different: ["Leuchtturm1917 Medium A5 Çizgili Defter", "Classic hardcover notebook A5 ruled black OEM"],
  },
  {
    id: "postit-3m-654", group: "office", pack: ["Post-it 654 76x76 mm Sarı Not Kağıdı Tek Blok", "Post-it 654 76x76 mm Sarı 12 Blok"],
    q: "Post-it 654 76x76 mm Sarı Not Kağıdı", zh: "3M Post-it 654 便利贴 76x76mm 黄色", en: "Post-it Notes 654 3x3 canary yellow",
    same: ["Post-it Notes 3x3 in Canary Yellow 654 100 Sheets", "3M Post-it 654 报事贴 便利贴 76x76mm 黄色 100页", "Post-it 654 76x76 mm Sarı Yapışkanlı Not Kağıdı 100 Yaprak"],
    variant: ["Post-it 655 76x127 mm Sarı Not Kağıdı", "Post-it Super Sticky 654 Neon"],
    accessory: ["Not kağıdı tutucu akrilik"],
    different: ["Yapışkanlı Not Kağıdı 76x76 Sarı 100 Yaprak Muadil", "Index Tab Ayraç 5 Renk"],
  },
  {
    id: "stapler-generic", group: "office", category: "zimba",
    q: "zımba makinesi 24/6", zh: "订书机 24/6", en: "stapler 24/6",
    variant: ["Zımba Makinesi 24/6 Metal 25 Sayfa Siyah", "订书机 24/6 金属 办公 25页 黑色", "Desktop Stapler 24/6 Metal 25 Sheets Black"],
    accessory: ["Zımba Teli 24/6 1000'li", "Zımba sökücü"],
    different: ["Delgeç 2 Delikli 25 Sayfa", "Tel Zımba 10 Mini"],
  },
  // ───────────────────────────── industrial ─────────────────────────────
  {
    id: "gloves-nitrile-generic", group: "industrial", category: "nitril-eldiven", pack: ["Nitril Eldiven Pudrasız Mavi M 100'lü Tek Kutu", "Nitril Eldiven Pudrasız Mavi M 1000'lü 10 Kutu"],
    q: "nitril eldiven pudrasız mavi M 100'lü", zh: "丁腈手套 无粉 蓝色 M 100只", en: "nitrile gloves powder free blue medium 100 count",
    variant: ["Nitril Muayene Eldiveni Pudrasız Mavi M 100 Adet", "一次性 丁腈手套 无粉 蓝色 M码 100只装", "Disposable Nitrile Gloves Powder Free Blue Medium 100 Pcs"],
    accessory: ["Eldiven kutusu duvar askısı"],
    different: ["Lateks Eldiven Pudralı M 100'lü", "İş Eldiveni Nitril Kaplı 10 Çift"],
  },
  {
    id: "stretchfilm-generic", group: "industrial", category: "stretch-film",
    q: "palet streç film 50 cm 17 mikron", zh: "拉伸 缠绕膜 50cm 17微米", en: "pallet stretch film 50cm 17 micron",
    variant: ["Palet Streç Film 50 cm 17 Mikron 2.5 kg Şeffaf", "PE 拉伸 缠绕膜 50cm 17μm 打包膜 托盘 透明", "Pallet Stretch Wrap Film 500mm 17 Micron Clear"],
    accessory: ["Streç film sarma aparatı", "Stretch film dispenser handle"],
    different: ["Koli Bandı 45x100 Şeffaf", "Balonlu Naylon 100 cm 10 m"],
  },
  {
    id: "cableties-generic", group: "industrial", category: "kablo-bagi", pack: ["Kablo Bağı 2.5x200 mm Siyah 100'lü Tek Paket", "Kablo Bağı 2.5x200 mm Siyah 1000'lü"],
    q: "kablo bağı 2.5x200 mm siyah 100'lü", zh: "尼龙扎带 2.5x200mm 黑色 100根", en: "nylon cable ties 2.5x200mm black 100 pcs",
    variant: ["Kablo Bağı 2.5x200 mm Siyah UV Dayanımlı 100 Adet", "尼龙扎带 2.5x200mm 黑色 自锁式 100根 抗UV", "Nylon Cable Ties 2.5x200mm Black UV Resistant 100 Pack"],
    accessory: ["Kablo bağı sıkma tabancası"],
    different: ["Cırt Cırtlı Kablo Toplayıcı 5 m", "Kablo Spiral 10 mm 10 m"],
  },
  {
    id: "zipbag-generic", group: "industrial", category: "kilitli-poset",
    q: "kilitli poşet 10x15 cm 100'lü", zh: "自封袋 10x15cm 100个", en: "zip lock bags 10x15 cm 100 pcs",
    variant: ["Kilitli Poşet 10x15 cm Şeffaf 100 Adet", "PE 自封袋 10x15cm 透明 加厚 100个", "Resealable Zip Lock Bags 10x15 cm Clear 100 Count"],
    accessory: [],
    different: ["Vakum Poşeti 20x30 cm 100'lü", "Kilitli Poşet 20x30 cm 100'lü"],
  },
  // ───────────────────────────── textile ─────────────────────────────
  {
    id: "duvet-generic-cotton", group: "textile", category: "yorgan",
    q: "çift kişilik pamuk yorgan 195x215", zh: "双人 棉花被 195x215", en: "double cotton duvet 195x215",
    variant: ["Çift Kişilik Pamuk Yorgan 195x215 Dört Mevsim", "全棉 双人 被子 195x215 四季 被芯", "Double Size Cotton Duvet 195x215 cm All Season"],
    accessory: ["Yorgan Saklama Çantası Şeffaf"],
    different: ["Tek Kişilik Mikro Yorgan 155x215", "Çift Kişilik Nevresim Takımı Pamuk"],
  },
  {
    id: "bedding-tac-ranforce", group: "textile",
    q: "Taç Ranforce Çift Kişilik Nevresim Takımı", zh: "Taç Ranforce 双人 四件套", en: "Tac Ranforce double bedding set",
    same: ["Taç Ranforce Çift Kişilik Nevresim Takımı Loren Mavi", "Tac Ranforce Double Duvet Cover Set Loren Blue 100% Cotton", "Taç Ranforce 纯棉 双人 四件套 Loren 蓝色"],
    variant: ["Taç Ranforce Tek Kişilik Nevresim Takımı Loren", "Taç Saten Çift Kişilik Nevresim Takımı"],
    accessory: ["Nevresim Klipsi 8'li"],
    different: ["Karaca Home Çift Kişilik Nevresim Takımı", "Özdilek Ranforce Nevresim Takımı"],
  },
  // ───────────────────────────── furniture ─────────────────────────────
  {
    id: "chair-secretlab-titan-evo", group: "furniture", img: true,
    q: "Secretlab Titan Evo 2022 Oyuncu Koltuğu", zh: "Secretlab Titan Evo 2022 电竞椅", en: "Secretlab Titan Evo 2022 gaming chair",
    same: ["Secretlab TITAN Evo 2022 Series Gaming Chair Regular Black SoftWeave Plus", "Secretlab TITAN Evo 2022 电竞椅 人体工学 黑色 织物 R码", "Secretlab Titan Evo 2022 Regular Siyah SoftWeave Oyuncu Koltuğu"],
    variant: ["Secretlab Titan Evo 2022 XL", "Secretlab Omega 2020"],
    accessory: ["Secretlab Titan Evo Bel Yastığı", "Secretlab armrest top replacement"],
    different: ["DXRacer Formula Oyuncu Koltuğu", "Titan Evo style ergonomic gaming chair OEM"],
  },
  {
    id: "desk-generic-standing", group: "furniture", category: "yukseklik-ayarli-masa",
    q: "elektrikli yükseklik ayarlı masa 120x60", zh: "电动 升降桌 120x60", en: "electric standing desk 120x60",
    variant: ["Elektrikli Yükseklik Ayarlı Çalışma Masası 120x60 Siyah", "电动 升降桌 120x60 站立 办公桌 黑色", "Electric Height Adjustable Standing Desk 120x60 cm Black"],
    accessory: ["Masa altı kablo düzenleyici tepsi"],
    different: ["Sabit Çalışma Masası 120x60 Ahşap", "Laptop Standı Ayarlanabilir"],
  },
  // ───────────────────────────── extra: thin groups ─────────────────────────────
  {
    id: "chair-ikea-poang", group: "furniture", img: true,
    q: "IKEA POÄNG Koltuk Huş Kaplama", zh: "宜家 POÄNG 波昂 扶手椅 桦木", en: "IKEA POANG armchair birch veneer",
    same: ["IKEA POÄNG Armchair Birch Veneer Knisa Light Beige 492.407.98", "宜家 IKEA POÄNG 波昂 扶手椅 桦木贴面 米色 492.407.98", "IKEA POÄNG Koltuk Huş Kaplama Knisa Açık Bej 492.407.98"],
    variant: ["IKEA POÄNG Sallanan Koltuk Huş", "IKEA POÄNG Ayak Uzatma Taburesi"],
    accessory: ["POÄNG Koltuk Minderi Yedek Kılıf", "Replacement cushion for IKEA POANG armchair"],
    different: ["Rattan Sallanan Koltuk Bahçe", "Poang style bentwood armchair OEM"],
  },
  {
    id: "bookshelf-generic", group: "furniture", category: "kitaplik",
    q: "5 raflı kitaplık beyaz", zh: "五层 书架 白色", en: "5 tier bookshelf white",
    variant: ["5 Raflı Kitaplık Beyaz Mdf 170 cm", "书架 五层 落地 置物架 白色 简约", "5 Tier Bookshelf White Wooden Bookcase 170 cm"],
    accessory: ["Kitaplık devrilme önleyici duvar bağlantısı"],
    different: ["3 Raflı Ayakkabılık Beyaz", "Duvar Rafı Seti 3'lü"],
  },
  {
    id: "pike-generic", group: "textile", category: "pike",
    q: "çift kişilik pamuk pike 200x220", zh: "双人 全棉 夏凉被 200x220", en: "double cotton summer blanket 200x220",
    variant: ["Çift Kişilik %100 Pamuk Pike 200x220 Bej", "全棉 夏凉被 双人 200x220 空调被", "Double Size 100% Cotton Summer Blanket 200x220 cm"],
    accessory: [],
    different: ["Tek Kişilik Polar Battaniye 150x200", "Çift Kişilik Yorgan Kışlık"],
  },
  {
    id: "towel-generic-bamboo", group: "textile", category: "havlu", pack: ["Bambu Banyo Havlusu 70x140 Tekli", "Bambu Banyo Havlusu 70x140 4'lü Set"],
    q: "bambu banyo havlusu 70x140", zh: "竹纤维 浴巾 70x140", en: "bamboo bath towel 70x140",
    variant: ["Bambu Banyo Havlusu 70x140 Gri Yumuşak", "竹纤维 浴巾 70x140 柔软 吸水 灰色", "Bamboo Bath Towel 70x140 cm Soft Absorbent Grey"],
    accessory: ["Havlu askısı paslanmaz"],
    different: ["El Havlusu 50x90 Pamuk 2'li", "Plaj Havlusu 90x170"],
  },
  {
    id: "kids-sneakers-generic", group: "fashion-kids", category: "cocuk-ayakkabisi",
    q: "ışıklı çocuk spor ayakkabı", zh: "儿童 发光 运动鞋", en: "kids light up sneakers",
    variant: ["Işıklı Çocuk Spor Ayakkabı Cırt Cırtlı Mavi", "儿童 发光鞋 LED 运动鞋 男童 魔术贴", "Kids LED Light Up Sneakers Boys Hook and Loop Blue"],
    accessory: ["Çocuk ayakkabı tabanlığı ortopedik"],
    different: ["Çocuk Yağmur Botu", "Yetişkin Koşu Ayakkabısı"],
  },
  {
    id: "kids-jacket-generic", group: "fashion-kids", category: "cocuk-mont",
    q: "çocuk şişme mont kapüşonlu", zh: "儿童 羽绒服 连帽", en: "kids puffer jacket hooded",
    variant: ["Çocuk Şişme Mont Kapüşonlu Su Geçirmez Lacivert", "儿童 羽绒服 连帽 加厚 男童 女童 藏青", "Kids Hooded Puffer Jacket Water Resistant Navy"],
    accessory: ["Çocuk bere atkı eldiven seti"],
    different: ["Çocuk Yağmurluk Dinozor", "Kadın Şişme Mont Uzun"],
  },
  {
    id: "mower-bosch-rotak32", group: "garden", img: true,
    q: "Bosch Rotak 32 Çim Biçme Makinesi", zh: "博世 Bosch Rotak 32 割草机", en: "Bosch Rotak 32 electric lawnmower",
    same: ["Bosch Rotak 32 Electric Rotary Lawnmower 1200W 32cm", "博世 Bosch Rotak 32 电动 割草机 1200W 32cm", "Bosch Rotak 32 1200 W Elektrikli Çim Biçme Makinesi"],
    variant: ["Bosch Rotak 37 Çim Biçme Makinesi", "Bosch EasyRotak 36-550"],
    accessory: ["Bosch Rotak 32 Yedek Bıçak", "Bosch Rotak 32 grass box"],
    different: ["Black+Decker BEMW351 Çim Biçme", "Einhell GC-EM 1032 Çim Biçme"],
  },
  {
    id: "planter-generic", group: "garden", category: "saksi",
    q: "kendinden sulamalı saksı 25 cm", zh: "自动吸水 花盆 25cm", en: "self watering planter 25 cm",
    variant: ["Kendinden Sulamalı Saksı 25 cm Beyaz Plastik", "懒人 自动 吸水 花盆 25cm 白色 塑料", "Self Watering Planter Pot 25 cm White Plastic"],
    accessory: ["Saksı altlığı 25 cm"],
    different: ["Seramik Saksı 15 cm", "Dikey Bahçe Saksı Seti 3 Katlı"],
  },
  {
    id: "litter-generic-bentonite", group: "pet", category: "kedi-kumu", pack: ["Bentonit Kedi Kumu 10 L Tek Paket", "Bentonit Kedi Kumu 10 L 2'li Paket"],
    q: "bentonit kedi kumu 10 L topaklanan", zh: "膨润土 猫砂 10L 结团", en: "bentonite clumping cat litter 10L",
    variant: ["Bentonit Kedi Kumu 10 L Topaklanan Kokusuz", "膨润土 猫砂 10L 结团 除臭 无尘", "Bentonite Clumping Cat Litter 10L Unscented"],
    accessory: ["Kedi Kumu Küreği Plastik"],
    different: ["Silika Kedi Kumu 5 L", "Kedi Tuvaleti Kapalı Filtreli"],
  },
  {
    id: "leash-flexi-classic-m", group: "pet", img: true,
    q: "Flexi New Classic M 5 m Otomatik Tasma", zh: "Flexi New Classic M 5米 自动 伸缩 牵引绳", en: "Flexi New Classic M 5m retractable leash",
    same: ["Flexi New Classic Retractable Dog Leash Tape M 5m up to 25kg Black", "Flexi New Classic 伸缩 牵引绳 M 5米 带式 25kg 黑色", "Flexi New Classic M 5 m Şerit Otomatik Köpek Tasması 25 kg Siyah"],
    variant: ["Flexi New Classic S 5 m Otomatik Tasma", "Flexi Giant M 8 m Otomatik Tasma"],
    accessory: ["Flexi Multi Box Ödül Kutusu", "Flexi LED lighting system"],
    different: ["Trixie Otomatik Tasma M 5 m", "Classic style retractable dog leash 5m OEM"],
  },
];
