import {
  ATTRIBUTE_LABELS_TR,
  attributeAgreements,
  attributeMismatches,
  cosineSimilarity,
  enrichFingerprint,
  formatAttribute,
  jaccard,
  overlap,
  phraseRelation,
  phashSimilarity,
} from "../fingerprint";
import type { Fingerprint } from "../fingerprint";

export interface MatchSignals {
  visualClip?: number;
  visualPhash?: number;
  visualDhash?: number;
  textTokens?: number;
  modelNumberHit?: boolean;
  /** Candidate looks like an accessory or spare part of the queried product. */
  accessory?: boolean;
  /** Both titles state the same attribute kind with different values (500 ml vs 1 L). */
  attributeMismatch?: boolean;
  /** Both titles agree on at least one measured attribute. */
  attributeAgree?: boolean;
  /** Brand+model phrase relation. */
  phrase?: "exact" | "variant" | "conflict";
  /** Category keys compared when both sides carry one. */
  categoryMatch?: boolean;
}

export interface MatchScore {
  score: number;
  signals: MatchSignals;
  /** Short human-readable reasons, in the order they contributed. */
  reasons: string[];
}

export type ConfidenceBand = "same" | "likely" | "similar" | "hidden";

export const CONFIDENCE_THRESHOLDS = { same: 0.85, likely: 0.6, similar: 0.35 } as const;

export function confidenceBand(score: number): ConfidenceBand {
  if (score >= CONFIDENCE_THRESHOLDS.same) return "same";
  if (score >= CONFIDENCE_THRESHOLDS.likely) return "likely";
  if (score >= CONFIDENCE_THRESHOLDS.similar) return "similar";
  return "hidden";
}

export interface ScoreOptions {
  /**
   * Candidate-to-candidate comparison: symmetric text measure (Jaccard), no image-search
   * floor, no accessory asymmetry. Used by the clusterer for pairwise linking.
   */
  symmetric?: boolean;
}

/** Text-only scores top out here: a title alone never proves identity without a model or phrase match. */
const TEXT_ONLY_CEILING = 0.8;

/**
 * Weighted combination of visual and text signals.
 * Weights are provisional until calibrated on the golden dataset (PLAN.md §7.3).
 */
export function scoreMatch(query: Fingerprint, candidate: Fingerprint, opts: ScoreOptions = {}): MatchScore {
  const signals: MatchSignals = {};
  const reasons: string[] = [];
  let weighted = 0;
  let weightSum = 0;
  const symmetric = opts.symmetric === true;

  enrichFingerprint(query);
  enrichFingerprint(candidate);

  if (query.clip && candidate.clip && query.clip.length === candidate.clip.length) {
    const s = clamp01(cosineSimilarity(query.clip, candidate.clip));
    // CLIP cosine for unrelated images sits around 0.5; stretch 0.5..1 to 0..1.
    const stretched = clamp01((s - 0.5) / 0.5);
    signals.visualClip = stretched;
    weighted += stretched * 0.5;
    weightSum += 0.5;
    reasons.push(`görsel benzerlik %${Math.round(stretched * 100)}`);
  }
  if (query.phash && candidate.phash && query.phash.length === candidate.phash.length) {
    let s = phashSimilarity(query.phash, candidate.phash);
    // A dhash agreement rescues crops/padding differences that shift the DCT hash.
    if (query.dhash && candidate.dhash && query.dhash.length === candidate.dhash.length) {
      const d = phashSimilarity(query.dhash, candidate.dhash);
      signals.visualDhash = clamp01((d - 0.6) / 0.4);
      s = Math.max(s, (s + d) / 2);
    }
    // Hamming similarity below ~0.6 is noise; stretch 0.6..1 to 0..1.
    const stretched = clamp01((s - 0.6) / 0.4);
    signals.visualPhash = stretched;
    const w = signals.visualClip !== undefined ? 0.2 : 0.5;
    weighted += stretched * w;
    weightSum += w;
    if (stretched > 0.9) reasons.push("görsel neredeyse birebir");
  }
  const hasVisual = weightSum > 0;

  const qTokens = query.tokens;
  const cTokens = candidate.tokens;
  if (qTokens && cTokens) {
    let s: number;
    if (symmetric) {
      // Candidate ↔ candidate: Jaccard blended with overlap so a short title still links to a long one.
      s = 0.5 * jaccard(qTokens, cTokens) + 0.5 * overlap(qTokens, cTokens);
    } else {
      s = overlap(qTokens, cTokens);
      for (const alt of query.altTokens ?? []) s = Math.max(s, overlap(alt, cTokens));
    }
    signals.textTokens = s;
    const w = 0.3;
    weighted += s * w;
    weightSum += w;
    if (s > 0.3) reasons.push(`başlık örtüşmesi %${Math.round(s * 100)}`);
  }

  let score = weightSum > 0 ? weighted / weightSum : 0;
  if (!hasVisual && signals.textTokens !== undefined) score = signals.textTokens * TEXT_ONLY_CEILING;
  // A near-identical image is the strongest "same" evidence we have.
  const visualIdentical = signals.visualPhash !== undefined && signals.visualPhash >= 0.9 && (signals.visualDhash === undefined || signals.visualDhash >= 0.5) && (signals.visualClip === undefined || signals.visualClip >= 0.5);
  if (visualIdentical) score = Math.max(score, CONFIDENCE_THRESHOLDS.same);

  // Category keys: a shared key lifts weak text, a different one halves everything.
  if (query.category && candidate.category) {
    if (query.category === candidate.category) {
      signals.categoryMatch = true;
      score = Math.min(Math.max(score + 0.15, 0.5), hasVisual ? 1 : TEXT_ONLY_CEILING);
      reasons.push("aynı kategori");
    } else {
      signals.categoryMatch = false;
      score *= 0.6;
      reasons.push("farklı kategori");
    }
  }

  // Brand + model phrase.
  const rel = phraseRelation(query.phrase ?? "", candidate.phrase ?? "");
  if (rel === "exact") {
    signals.phrase = "exact";
    score = Math.min(1, score + 0.3);
    reasons.unshift("marka ve model birebir");
  } else if (rel === "variant") {
    signals.phrase = "variant";
    // A longer model phrase (270 → 270 React) is a different variant: never "same" on text alone.
    score = Math.min(hasVisual ? 1 : TEXT_ONLY_CEILING, score + 0.1);
    reasons.push("varyant olabilir");
  } else if (rel === "conflict") {
    signals.phrase = "conflict";
    score *= 0.6;
    reasons.push("model numarası farklı");
  }

  // Model numbers: a shared code counts unless both sides also carry different codes (A800S vs A500S).
  const qm = query.modelNumbers ?? [];
  const cm = candidate.modelNumbers ?? [];
  const shared = qm.filter((m) => cm.includes(m));
  const codeConflict = shared.length > 0 && qm.some((m) => !shared.includes(m)) && cm.some((m) => !shared.includes(m));
  const hit = shared.length > 0 && !codeConflict && rel !== "conflict";
  if (query.title && candidate.title) signals.modelNumberHit = hit;
  if (codeConflict) reasons.push("model numarası farklı");

  // Accessory asymmetry: one side is a part/accessory of the other's product.
  let accessoryPenalty = false;
  if (!symmetric) {
    const cAcc = candidate.accessory ?? [];
    const qAcc = query.accessory ?? [];
    const qAltAcc = query.altTitles?.some((t) => accessoryTermsCached(t).length > 0) ?? false;
    const queryIsAccessory = qAcc.length > 0 || qAltAcc;
    if ((cAcc.length > 0) !== queryIsAccessory && (query.title || query.altTitles?.length)) {
      accessoryPenalty = true;
      signals.accessory = true;
    }
  }

  // Attributes (capacity, power, storage …).
  let attrMismatch = false;
  if (query.attrs && candidate.attrs) {
    const mism = attributeMismatches(query.attrs, candidate.attrs);
    if (mism.length) {
      attrMismatch = true;
      signals.attributeMismatch = true;
      const m = mism[0]!;
      reasons.push(`${ATTRIBUTE_LABELS_TR[m.kind]} farklı (${formatAttribute(m.kind, m.a)} vs ${formatAttribute(m.kind, m.b)})`);
    } else {
      const agree = attributeAgreements(query.attrs, candidate.attrs);
      if (agree.length) {
        signals.attributeAgree = true;
        reasons.push(`${ATTRIBUTE_LABELS_TR[agree[0]!]} aynı (${formatAttribute(agree[0]!, query.attrs[agree[0]!]!)})`);
      }
    }
  }

  const visualContradicts =
    signals.visualPhash !== undefined && signals.visualPhash < 0.25 && (signals.visualClip === undefined || signals.visualClip < 0.25) && (signals.visualDhash === undefined || signals.visualDhash < 0.25);

  if (hit) {
    if (accessoryPenalty) {
      reasons.push("model numarası eşleşti ama aksesuar görünüyor");
    } else if (attrMismatch) {
      reasons.push("model numarası eşleşti ama özellikler farklı");
      score = Math.max(score, CONFIDENCE_THRESHOLDS.similar);
    } else if (visualContradicts) {
      reasons.unshift("model numarası eşleşti, görsel farklı");
      score = Math.max(score, CONFIDENCE_THRESHOLDS.likely);
    } else if (rel === "variant") {
      reasons.unshift("model numarası eşleşti, varyant olabilir");
      score = Math.max(score, CONFIDENCE_THRESHOLDS.likely);
    } else {
      reasons.unshift("model numarası eşleşti");
      score = Math.max(score, 0.7) + (1 - Math.max(score, 0.7)) * 0.5;
    }
  }
  if (attrMismatch) score *= 0.5;
  else if (signals.attributeAgree) score = Math.min(1, score + 0.05);
  // Text alone (no image, no exact model) never proves identity.
  if (!hasVisual && !hit && rel !== "exact") score = Math.min(score, TEXT_ONLY_CEILING);
  if (accessoryPenalty) {
    score *= 0.35;
    reasons.push("aksesuar/parça görünüyor");
  }
  if (rel === "variant" && !visualIdentical) score = Math.min(score, CONFIDENCE_THRESHOLDS.same - 0.01);

  if (!symmetric && candidate.viaImageSearch && score < CONFIDENCE_THRESHOLDS.likely && !visualContradicts && !accessoryPenalty) {
    // The market's visual engine already matched this item; treat as "likely" unless our own signals say more.
    score = CONFIDENCE_THRESHOLDS.likely;
    reasons.push("pazarın görsel araması eşleştirdi");
  }
  return { score: clamp01(score), signals, reasons };
}

const accCache = new Map<string, string[]>();
function accessoryTermsCached(title: string): string[] {
  let v = accCache.get(title);
  if (!v) {
    v = enrichFingerprint({ title }).accessory ?? [];
    if (accCache.size > 2000) accCache.clear();
    accCache.set(title, v);
  }
  return v;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
