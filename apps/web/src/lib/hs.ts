import { formatHs, HS_BY_GROUP, suggestHs, type HsSuggestInput, type HsSuggestion } from "@manufactogate/core";
import { getSetting, setSetting } from "./db";
import { classifyTitle } from "./realCatalog";

/**
 * Product-level GTİP/HS suggestion (PLAN §3.5): the core table by taxonomy leaf, then keywords of
 * the title, then the group chapter. User corrections are remembered per taxonomy leaf (or per
 * title when no leaf is known) so the same product gets the corrected code next time.
 */

/** Settings key of the remembered corrections: leaf key or title → digits. */
export const HS_OVERRIDES_KEY = "hsOverrides";
const MAX_OVERRIDES = 400;

export type HsOverrides = Record<string, string>;

/** Suggestion for a listing title (and optional group), with the leaf the classifier found. Pure apart from the classifier index. */
export function suggestHsForTitle(title: string, groupKey?: string | undefined, overrides?: HsOverrides): (HsSuggestion & { leafKey?: string; display: string }) | null {
  const leaf = title ? classifyTitle(title) : null;
  const group = groupKey ?? leaf?.group;
  const input: HsSuggestInput = {
    ...(leaf ? { leafKey: leaf.key } : {}),
    ...(group ? { groupKey: group } : {}),
    ...(title ? { title } : {}),
    ...(overrides ? { overrides } : {}),
  };
  const s = suggestHs(input);
  if (!s) return null;
  return { ...s, ...(leaf ? { leafKey: leaf.key } : {}), display: formatHs(s.hs) };
}

/** The key a correction is remembered under: the taxonomy leaf when known, else the title. */
export function hsMemoryKey(title: string, leafKey?: string | undefined): string {
  return leafKey ?? title.trim().slice(0, 160);
}

/** Label for the suggestion's provenance, for the "önerildi" line under the GTİP input. */
export function hsSourceLabel(source: HsSuggestion["source"]): string {
  switch (source) {
    case "user":
      return "önceki düzeltmen";
    case "leaf":
      return "kategoriden";
    case "keyword":
      return "başlıktaki anahtar kelimeden";
    case "group":
      return "ürün grubundan";
  }
}

export async function loadHsOverrides(): Promise<HsOverrides> {
  const raw = await getSetting<unknown>(HS_OVERRIDES_KEY, {});
  return sanitizeHsOverrides(raw);
}

/** Keeps only `key → 4-10 digit code` pairs, newest last; the map is capped so it cannot grow without bound. Pure. */
export function sanitizeHsOverrides(raw: unknown): HsOverrides {
  const out: HsOverrides = {};
  if (!raw || typeof raw !== "object") return out;
  const entries = Object.entries(raw as Record<string, unknown>).filter((e): e is [string, string] => typeof e[0] === "string" && !!e[0] && typeof e[1] === "string" && /^\d{4,10}$/.test(e[1].replace(/\D/g, "")));
  for (const [k, v] of entries.slice(-MAX_OVERRIDES)) out[k] = v.replace(/\D/g, "");
  return out;
}

/** Remembers (or with an empty code forgets) the user's GTİP for a product; returns the new map. */
export async function rememberHs(key: string, code: string): Promise<HsOverrides> {
  const cur = await loadHsOverrides();
  const digits = code.replace(/\D/g, "");
  const next: HsOverrides = { ...cur };
  delete next[key];
  if (digits.length >= 4) next[key] = digits;
  const trimmed = sanitizeHsOverrides(next);
  await setSetting(HS_OVERRIDES_KEY, trimmed);
  return trimmed;
}

/** Chapter-level options for the GTİP datalist (core group table). */
export const HS_GROUP_OPTIONS = Object.entries(HS_BY_GROUP).map(([group, [hs, label]]) => ({ group, hs, label }));
