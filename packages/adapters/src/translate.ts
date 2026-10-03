import { matchesTr, foldTr } from "@manufactogate/core";
import { getLeaves } from "./mock/taxonomy";

/**
 * Query localisation without a paid service: the category taxonomy doubles as a
 * Turkish → Chinese glossary (430 product nouns). A query that names a category is
 * sent to Chinese markets as that category's Chinese name; the rest of the words are
 * dropped unless they look like a model code. Falls back to the original query.
 */
const EXTRA: Record<string, string> = {
  kask: "头盔", kulaklık: "耳机", telefon: "手机", şarj: "充电器", kablo: "数据线", çanta: "包", ayakkabı: "鞋",
  saat: "手表", gözlük: "眼镜", bardak: "杯子", termos: "保温杯", lamba: "灯", oyuncak: "玩具", bebek: "婴儿",
  kedi: "猫", köpek: "狗", bisiklet: "自行车", motosiklet: "摩托车", araba: "汽车", oto: "汽车", kamera: "摄像头",
  hoparlör: "音箱", klavye: "键盘", mouse: "鼠标", fare: "鼠标", tişört: "T恤", elbise: "连衣裙", mont: "外套",
  pantolon: "裤子", şapka: "帽子", eldiven: "手套", çorap: "袜子", havlu: "毛巾", yastık: "枕头", battaniye: "毛毯",
  bıçak: "刀", tava: "锅", tencere: "锅", matkap: "电钻", tornavida: "螺丝刀", el: "手", feneri: "手电筒", fener: "手电筒",
  powerbank: "移动电源", drone: "无人机", valiz: "行李箱", cüzdan: "钱包", kemer: "皮带", parfüm: "香水", maske: "面膜",
};

export function translateQueryToZh(query: string): string {
  const q = query.trim();
  if (!q) return q;
  if (/[\u3400-\u9fff]/.test(q)) return q; // already Chinese
  const codes = q.match(/\b[A-Za-z]{1,5}(?:-[A-Za-z]{0,3})?\d{2,6}[A-Za-z]?\b/g) ?? [];
  const bare = q.replace(/\b[A-Za-z]{1,5}(?:-[A-Za-z]{0,3})?\d{2,6}[A-Za-z]?\b/g, " ").trim();
  // 1) exact category name; 2) single-word glossary; 3) shortest category that contains the phrase.
  const exact = getLeaves().find((l) => foldTr(l.tr) === foldTr(bare));
  let zh = exact?.zh ?? "";
  const words = foldTr(bare).split(/\s+/).filter(Boolean);
  if (!zh && words.length === 1) {
    const hit = Object.entries(EXTRA).find(([k]) => foldTr(k) === words[0]);
    if (hit) zh = hit[1];
  }
  if (!zh) {
    const leaves = getLeaves().filter((l) => matchesTr(l.tr, bare) || matchesTr(bare, l.tr));
    leaves.sort((a, b) => a.tr.length - b.tr.length);
    zh = leaves[0]?.zh ?? "";
  }
  if (!zh) {
    const parts: string[] = [];
    for (const w of words) {
      const hit = Object.entries(EXTRA).find(([k]) => foldTr(k) === w || foldTr(k).startsWith(w.replace(/[ıi]$/, "")));
      if (hit) parts.push(hit[1]);
      else {
        const leaf = getLeaves().find((l) => matchesTr(l.tr, w) && l.tr.split(" ").length === 1);
        if (leaf) parts.push(leaf.zh);
      }
    }
    zh = [...new Set(parts)].join("");
  }
  if (!zh) return q;
  return [zh, ...codes].join(" ");
}

/** Chinese listing title → short Turkish query: brand/model tokens plus the category name found in the title. */
export function translateTitleToTr(title: string): string {
  const t = title.trim();
  if (!/[\u3400-\u9fff]/.test(t)) return t;
  const latin = (t.match(/[A-Za-z][A-Za-z0-9-]{1,}/g) ?? []).filter((w) => w.length >= 2).slice(0, 3);
  const cat = categoryIn(t, "tr");
  const out = [...latin, cat].filter(Boolean).join(" ");
  return out || t;
}

/** The product category named in a title, in the requested language ("" when none is recognised). */
export function categoryIn(title: string, language: "zh" | "tr"): string {
  const t = title.trim();
  const f = foldTr(t);
  const leaves = getLeaves().filter((l) => t.includes(l.zh) || f.includes(foldTr(l.tr))).sort((a, b) => b.zh.length - a.zh.length);
  if (leaves[0]) return language === "zh" ? leaves[0].zh : leaves[0].tr;
  // In Chinese titles the head noun comes last ("摩托车头盔": helmet, not motorcycle), so prefer the latest hit.
  const pos = ([k, zh]: [string, string]) => Math.max(t.lastIndexOf(zh), f.lastIndexOf(foldTr(k)));
  const extra = Object.entries(EXTRA)
    .filter(([k, zh]) => t.includes(zh) || f.includes(foldTr(k)))
    .sort((a, b) => pos(b) - pos(a))[0];
  if (!extra) return "";
  return language === "zh" ? extra[1] : extra[0].charAt(0).toUpperCase() + extra[0].slice(1);
}

/** Shorten a long listing title into a searchable query for the given market language. */
export function titleToQuery(title: string, language: string): string {
  const t = title.trim();
  if (language === "zh") {
    if (/[\u3400-\u9fff]/.test(t)) {
      // Keep brand/model tokens and the category; long titles return nothing on PDD.
      const latin = (t.match(/[A-Za-z][A-Za-z0-9-]{1,}/g) ?? []).slice(0, 2);
      const cat = categoryIn(t, "zh") || t.replace(/[^\u3400-\u9fff]/g, "").slice(0, 6);
      return [...latin, cat].filter(Boolean).join(" ");
    }
    return translateQueryToZh(t);
  }
  return translateTitleToTr(title);
}

/** Per-market query: Chinese markets get the glossary translation, others the original. */
export function localizeQuery(query: string, language: string): string {
  return language === "zh" ? translateQueryToZh(query) : query;
}

/** Query ladder for a listing title: most specific first, broadest (category only) last. */
export function queryLadder(title: string, language: string): string[] {
  const t = title.trim();
  const latin = (t.match(/[A-Za-z][A-Za-z0-9-]{1,}/g) ?? []).filter((w) => w.length >= 2);
  const specific = titleToQuery(t, language);
  const cat = categoryIn(t, language === "zh" ? "zh" : "tr");
  const brandCat = latin[0] && cat ? `${latin[0]} ${cat}` : "";
  return [...new Set([specific, brandCat, cat].filter(Boolean))];
}
