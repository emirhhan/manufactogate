import { cosineSimilarity, jaccard, modelNumbers, phashSimilarity, tokens } from "../fingerprint";
import type { Fingerprint } from "../fingerprint";

export interface MatchSignals {
  visualClip?: number;
  visualPhash?: number;
  textTokens?: number;
  modelNumberHit?: boolean;
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

/**
 * Weighted combination of visual and text signals.
 * Weights are provisional until calibrated on the golden dataset (PLAN.md §7.3).
 */
export function scoreMatch(query: Fingerprint, candidate: Fingerprint): MatchScore {
  const signals: MatchSignals = {};
  const reasons: string[] = [];
  let weighted = 0;
  let weightSum = 0;

  if (query.clip && candidate.clip) {
    const s = clamp01(cosineSimilarity(query.clip, candidate.clip));
    // CLIP cosine for unrelated images sits around 0.5; stretch 0.5..1 to 0..1.
    const stretched = clamp01((s - 0.5) / 0.5);
    signals.visualClip = stretched;
    weighted += stretched * 0.5;
    weightSum += 0.5;
    reasons.push(`görsel benzerlik %${Math.round(stretched * 100)}`);
  }
  if (query.phash && candidate.phash) {
    const s = phashSimilarity(query.phash, candidate.phash);
    // Hamming similarity below ~0.6 is noise; stretch 0.6..1 to 0..1.
    const stretched = clamp01((s - 0.6) / 0.4);
    signals.visualPhash = stretched;
    const w = query.clip && candidate.clip ? 0.2 : 0.5;
    weighted += stretched * w;
    weightSum += w;
    if (stretched > 0.9) reasons.push("görsel neredeyse birebir");
  }
  if (query.title && candidate.title) {
    const s = jaccard(tokens(query.title), tokens(candidate.title));
    signals.textTokens = s;
    weighted += s * 0.3;
    weightSum += 0.3;
    if (s > 0.3) reasons.push(`başlık örtüşmesi %${Math.round(s * 100)}`);
    const qm = query.modelNumbers ?? modelNumbers(query.title);
    const cm = candidate.modelNumbers ?? modelNumbers(candidate.title);
    const hit = qm.some((m) => cm.includes(m));
    signals.modelNumberHit = hit;
    if (hit) {
      reasons.unshift("model numarası eşleşti");
    }
  }

  let score = weightSum > 0 ? weighted / weightSum : 0;
  if (signals.modelNumberHit) score = Math.max(score, 0.7) + (1 - Math.max(score, 0.7)) * 0.5;
  return { score: clamp01(score), signals, reasons };
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
