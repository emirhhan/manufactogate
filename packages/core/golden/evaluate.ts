/**
 * Golden dataset evaluation (PLAN §7.1/7.3): scores every labelled pair and reports precision,
 * recall per band plus a score-decile calibration table. Shared by the test and the report script.
 */
import { CONFIDENCE_THRESHOLDS, confidenceBand, scoreMatch, type ConfidenceBand, type Fingerprint } from "../src";

export type GoldenLabel = "same" | "variant" | "accessory" | "different";

export interface GoldenCandidate {
  title: string;
  market: string;
  label: GoldenLabel;
  phash?: string;
  category?: string;
  note?: string;
}

export interface GoldenCase {
  id: string;
  /** Taxonomy group key (packages/adapters/src/mock/taxonomy.ts), for coverage counting. */
  group?: string;
  query: { title: string; altTitles?: string[]; phash?: string; category?: string };
  candidates: GoldenCandidate[];
  note?: string;
}

/** Precision / recall of "score ≥ threshold" for one confidence band (PLAN §4.3 thresholds). */
export interface ThresholdMetric {
  band: "same" | "likely" | "similar";
  threshold: number;
  /** Labels counted as positive at this band. */
  positives: GoldenLabel[];
  precision: number;
  recall: number;
  /** Pairs at or above the threshold. */
  predicted: number;
  /** Pairs carrying a positive label. */
  actual: number;
  /** Predicted pairs whose label is not positive. */
  falsePositives: PairResult[];
  /** Positive pairs under the threshold. */
  falseNegatives: PairResult[];
}

export interface PairResult {
  caseId: string;
  title: string;
  label: GoldenLabel;
  score: number;
  band: ConfidenceBand;
  reasons: string[];
}

export interface Metrics {
  pairs: PairResult[];
  precisionSame: number;
  precisionLikelyOrBetter: number;
  recallSame: number;
  accessoryMaxBand: ConfidenceBand;
  accessoryViolations: PairResult[];
  differentAsSame: PairResult[];
  /** Score decile → [observed precision for label same|variant, count]. */
  calibration: { bucket: string; precision: number; count: number }[];
  /** Precision of "score ≥ threshold" for thresholds 0.3..0.9: must not decrease as the threshold rises. */
  cumulative: { threshold: number; precision: number; count: number }[];
  /** Precision / recall at the same (0.85), likely (0.60) and similar (0.35) thresholds. */
  thresholds: ThresholdMetric[];
  /** Cases per taxonomy group (cases without a group count under "-"). */
  groups: Record<string, number>;
}

/** What counts as a true positive at each band: "same" must be the same product, "likely" tolerates a variant, "similar" anything related. */
export const BAND_POSITIVES: Record<ThresholdMetric["band"], GoldenLabel[]> = {
  same: ["same"],
  likely: ["same", "variant"],
  similar: ["same", "variant", "accessory"],
};

const BAND_RANK: Record<ConfidenceBand, number> = { hidden: 0, similar: 1, likely: 2, same: 3 };

export function evaluateGolden(cases: GoldenCase[]): Metrics {
  const pairs: PairResult[] = [];
  for (const c of cases) {
    const q: Fingerprint = { title: c.query.title, ...(c.query.altTitles ? { altTitles: c.query.altTitles } : {}), ...(c.query.phash ? { phash: c.query.phash } : {}), ...(c.query.category ? { category: c.query.category } : {}) };
    for (const cand of c.candidates) {
      const fp: Fingerprint = { title: cand.title, ...(cand.phash ? { phash: cand.phash } : {}), ...(cand.category ? { category: cand.category } : {}) };
      const m = scoreMatch(q, fp);
      pairs.push({ caseId: c.id, title: cand.title, label: cand.label, score: m.score, band: confidenceBand(m.score), reasons: m.reasons });
    }
  }
  const scoredSame = pairs.filter((p) => p.band === "same");
  const scoredLikely = pairs.filter((p) => BAND_RANK[p.band] >= 2);
  const labelSame = pairs.filter((p) => p.label === "same");
  const precisionSame = scoredSame.length ? scoredSame.filter((p) => p.label === "same").length / scoredSame.length : 1;
  const precisionLikelyOrBetter = scoredLikely.length ? scoredLikely.filter((p) => p.label === "same" || p.label === "variant").length / scoredLikely.length : 1;
  const recallSame = labelSame.length ? labelSame.filter((p) => p.band === "same").length / labelSame.length : 1;
  const accessories = pairs.filter((p) => p.label === "accessory");
  const accessoryViolations = accessories.filter((p) => BAND_RANK[p.band] >= 2);
  const accessoryMaxBand = accessories.reduce<ConfidenceBand>((b, p) => (BAND_RANK[p.band] > BAND_RANK[b] ? p.band : b), "hidden");
  const differentAsSame = pairs.filter((p) => p.label === "different" && p.band === "same");
  const calibration: Metrics["calibration"] = [];
  for (let d = 0; d < 10; d++) {
    const lo = d / 10;
    const hi = (d + 1) / 10;
    const inBucket = pairs.filter((p) => p.score >= lo && (d === 9 ? p.score <= hi : p.score < hi));
    const pos = inBucket.filter((p) => p.label === "same" || p.label === "variant").length;
    calibration.push({ bucket: `${lo.toFixed(1)}–${hi.toFixed(1)}`, precision: inBucket.length ? pos / inBucket.length : NaN, count: inBucket.length });
  }
  const cumulative: Metrics["cumulative"] = [];
  for (const threshold of [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]) {
    const above = pairs.filter((p) => p.score >= threshold);
    const pos = above.filter((p) => p.label === "same" || p.label === "variant").length;
    cumulative.push({ threshold, precision: above.length ? pos / above.length : NaN, count: above.length });
  }
  const thresholds: ThresholdMetric[] = (["same", "likely", "similar"] as const).map((band) => {
    const threshold = CONFIDENCE_THRESHOLDS[band];
    const positives = BAND_POSITIVES[band];
    const isPos = (p: PairResult) => positives.includes(p.label);
    const predictedPairs = pairs.filter((p) => p.score >= threshold);
    const actualPairs = pairs.filter(isPos);
    const tp = predictedPairs.filter(isPos).length;
    return {
      band,
      threshold,
      positives,
      precision: predictedPairs.length ? tp / predictedPairs.length : 1,
      recall: actualPairs.length ? tp / actualPairs.length : 1,
      predicted: predictedPairs.length,
      actual: actualPairs.length,
      falsePositives: predictedPairs.filter((p) => !isPos(p)),
      falseNegatives: actualPairs.filter((p) => p.score < threshold),
    };
  });
  const groups: Record<string, number> = {};
  for (const c of cases) groups[c.group ?? "-"] = (groups[c.group ?? "-"] ?? 0) + 1;
  return { pairs, precisionSame, precisionLikelyOrBetter, recallSame, accessoryMaxBand, accessoryViolations, differentAsSame, calibration, cumulative, thresholds, groups };
}

export function formatReport(m: Metrics): string {
  const lines: string[] = [];
  lines.push(`pairs: ${m.pairs.length}`);
  lines.push(`precision(same) = ${(m.precisionSame * 100).toFixed(1)}%`);
  lines.push(`precision(same+likely) = ${(m.precisionLikelyOrBetter * 100).toFixed(1)}%`);
  lines.push(`recall(same) = ${(m.recallSame * 100).toFixed(1)}%`);
  lines.push(`accessory max band = ${m.accessoryMaxBand} (${m.accessoryViolations.length} violations)`);
  lines.push(`groups: ${Object.keys(m.groups).filter((g) => g !== "-").length} (${Object.entries(m.groups).map(([g, n]) => `${g}=${n}`).join(", ")})`);
  lines.push("thresholds (score ≥ t → precision / recall of the band's positive labels):");
  for (const t of m.thresholds) lines.push(`  ${t.band.padEnd(7)} ≥${t.threshold.toFixed(2)}  P=${(t.precision * 100).toFixed(1)}%  R=${(t.recall * 100).toFixed(1)}%  predicted=${t.predicted} actual=${t.actual} fp=${t.falsePositives.length} fn=${t.falseNegatives.length}`);
  lines.push("calibration (score bucket → precision of same|variant, n):");
  for (const b of m.calibration) lines.push(`  ${b.bucket}  ${Number.isNaN(b.precision) ? "   -  " : `${(b.precision * 100).toFixed(0).padStart(4)}%`}  n=${b.count}`);
  lines.push("cumulative (score ≥ t → precision of same|variant, n):");
  for (const c of m.cumulative) lines.push(`  ≥${c.threshold.toFixed(1)}  ${Number.isNaN(c.precision) ? "   -  " : `${(c.precision * 100).toFixed(0).padStart(4)}%`}  n=${c.count}`);
  const wrong = m.pairs.filter((p) => (p.label === "same" && p.band !== "same") || (p.label === "accessory" && BAND_RANK[p.band] >= 2) || (p.label === "different" && BAND_RANK[p.band] >= 2) || (p.label === "variant" && p.band === "same"));
  if (wrong.length) {
    lines.push("misses:");
    for (const p of wrong) lines.push(`  [${p.caseId}] ${p.label} → ${p.band} ${p.score.toFixed(2)} "${p.title}" (${p.reasons.join("; ")})`);
  }
  return lines.join("\n");
}
