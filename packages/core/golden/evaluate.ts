/**
 * Golden dataset evaluation (PLAN §7.1/7.3): scores every labelled pair and reports precision,
 * recall per band plus a score-decile calibration table. Shared by the test and the report script.
 */
import { confidenceBand, scoreMatch, type ConfidenceBand, type Fingerprint } from "../src";

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
  query: { title: string; altTitles?: string[]; phash?: string; category?: string };
  candidates: GoldenCandidate[];
  note?: string;
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
}

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
  return { pairs, precisionSame, precisionLikelyOrBetter, recallSame, accessoryMaxBand, accessoryViolations, differentAsSame, calibration, cumulative };
}

export function formatReport(m: Metrics): string {
  const lines: string[] = [];
  lines.push(`pairs: ${m.pairs.length}`);
  lines.push(`precision(same) = ${(m.precisionSame * 100).toFixed(1)}%`);
  lines.push(`precision(same+likely) = ${(m.precisionLikelyOrBetter * 100).toFixed(1)}%`);
  lines.push(`recall(same) = ${(m.recallSame * 100).toFixed(1)}%`);
  lines.push(`accessory max band = ${m.accessoryMaxBand} (${m.accessoryViolations.length} violations)`);
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
