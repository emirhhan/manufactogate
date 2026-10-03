/**
 * Golden dataset calibration (PLAN §7.1 / §7.3).
 *
 * Dataset: packages/core/golden/cases.json = 44 hand-written cases + 266 generated from
 * golden/products.ts (`node packages/core/scripts/golden-build.ts`), 310 cases / 2107 labelled
 * pairs across all 25 taxonomy groups, titles in zh / tr / en.
 *
 * Measured with the scorer as of this file (packages/core/src/match/score.ts, fingerprint/text.ts),
 * `GOLDEN_REPORT=1 pnpm vitest run --project core test/golden.test.ts` prints the table:
 *
 *   band     threshold  precision  recall   positives counted
 *   same     ≥ 0.85     94.7 %     70.2 %   label same
 *   likely   ≥ 0.60     99.2 %     77.0 %   label same | variant
 *   similar  ≥ 0.35     87.7 %     66.9 %   label same | variant | accessory
 *   accessory ≥ likely: 0 violations · different ≥ same: 0 violations
 *   cumulative precision of same|variant: ≥0.3 80 %, ≥0.5 93 %, ≥0.6 99 %, ≥0.7 100 %, ≥0.9 100 %
 *
 * Floors below are the measured values minus a small margin (3–5 points), so a scorer change
 * that silently loses precision or recall fails here. Recall at "same" is bounded by design:
 * a query without a model number or numbered brand phrase ("Birkenstock Arizona Sandalet") can
 * only reach "likely" from text (TEXT_ONLY_CEILING), which is why the floor is 0.66, not 0.85.
 * When the scorer is retuned, re-measure and move the floors up, never down without a reason
 * written here.
 */
import rawCases from "../golden/cases.json";
import { BAND_POSITIVES, evaluateGolden, formatReport, type GoldenCase, type ThresholdMetric } from "../golden/evaluate";
import { buildGoldenCases } from "../golden/products";

const cases = rawCases as GoldenCase[];

/** Measured 2026-10 (see header); floors sit a few points under the measured numbers. */
const FLOORS: Record<ThresholdMetric["band"], { precision: number; recall: number }> = {
  same: { precision: 0.9, recall: 0.66 },
  likely: { precision: 0.95, recall: 0.73 },
  similar: { precision: 0.83, recall: 0.63 },
};

describe("golden dataset (PLAN §7.1/7.3)", () => {
  const m = evaluateGolden(cases);
  if ((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.["GOLDEN_REPORT"]) console.log(formatReport(m));
  it("is well formed: ≥300 cases, ≥1500 pairs, unique ids, valid labels", () => {
    expect(cases.length).toBeGreaterThanOrEqual(300);
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
    for (const c of cases) {
      expect(c.candidates.length).toBeGreaterThan(0);
      for (const cand of c.candidates) expect(["same", "variant", "accessory", "different"]).toContain(cand.label);
    }
    expect(m.pairs.length).toBeGreaterThanOrEqual(1500);
  });
  it("covers at least 20 taxonomy groups and every label", () => {
    const groups = Object.keys(m.groups).filter((g) => g !== "-");
    expect(groups.length).toBeGreaterThanOrEqual(20);
    for (const label of ["same", "variant", "accessory", "different"] as const) expect(m.pairs.filter((p) => p.label === label).length).toBeGreaterThanOrEqual(100);
    // Hard negatives of every kind are present: lookalikes, other models of the same brand, other pack sizes.
    expect(m.pairs.filter((p) => p.label === "different" && /replika|replica|benzeri|tarz|style|1:1|high copy/i.test(p.title)).length).toBeGreaterThanOrEqual(20);
    expect(cases.filter((c) => c.id.endsWith("-pack")).length).toBeGreaterThanOrEqual(20);
    expect(cases.filter((c) => c.id.endsWith("-img")).length).toBeGreaterThanOrEqual(50);
  });
  it("cases.json is in sync with the generator (golden/products.ts)", () => {
    const generated = buildGoldenCases();
    const byId = new Map(cases.map((c) => [c.id, c]));
    expect(generated.length).toBeGreaterThanOrEqual(250);
    for (const g of generated) {
      const stored = byId.get(g.id);
      expect(stored, `${g.id}: run node packages/core/scripts/golden-build.ts`).toBeDefined();
      expect(stored, `${g.id}: run node packages/core/scripts/golden-build.ts`).toEqual(g);
    }
  });
  it("meets the calibration floors (precision / recall at the same, likely and similar thresholds)", () => {
    const report = formatReport(m);
    for (const t of m.thresholds) {
      const floor = FLOORS[t.band];
      expect(t.positives).toEqual(BAND_POSITIVES[t.band]);
      expect(t.precision, `${t.band} precision\n${report}`).toBeGreaterThanOrEqual(floor.precision);
      expect(t.recall, `${t.band} recall\n${report}`).toBeGreaterThanOrEqual(floor.recall);
      expect(t.predicted).toBe(t.falsePositives.length + Math.round(t.precision * t.predicted));
    }
    expect(m.precisionSame, report).toBeGreaterThanOrEqual(FLOORS.same.precision);
    expect(m.precisionLikelyOrBetter, report).toBeGreaterThanOrEqual(FLOORS.likely.precision);
    expect(m.recallSame, report).toBeGreaterThanOrEqual(FLOORS.same.recall);
  });
  it("never promotes an accessory to likely, nor a different product to same", () => {
    const report = formatReport(m);
    expect(m.accessoryViolations.map((p) => `${p.caseId}: ${p.title}`), report).toEqual([]);
    expect(m.differentAsSame.map((p) => `${p.caseId}: ${p.title}`), report).toEqual([]);
    expect(["hidden", "similar"]).toContain(m.accessoryMaxBand);
  });
  it("scores are monotonically calibrated: precision never drops as the threshold rises", () => {
    const steps = m.cumulative.filter((c) => c.count >= 5);
    expect(steps.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]!.precision + 0.05, formatReport(m)).toBeGreaterThanOrEqual(steps[i - 1]!.precision);
    }
    // The "same" band must be markedly purer than the "similar" band.
    const same = m.cumulative.find((c) => c.threshold === 0.9)!;
    const similar = m.cumulative.find((c) => c.threshold === 0.4)!;
    expect(same.precision).toBeGreaterThan(similar.precision);
    expect(same.precision).toBeGreaterThanOrEqual(0.97);
  });
  it("the image path: an identical hash makes a same-labelled pair 'same', a far hash never does", () => {
    const img = cases.filter((c) => c.id.endsWith("-img") && c.query.phash);
    expect(img.length).toBeGreaterThanOrEqual(50);
    const pairs = m.pairs.filter((p) => img.some((c) => c.id === p.caseId));
    const sameWithHash = pairs.filter((p) => p.label === "same");
    expect(sameWithHash.filter((p) => p.band === "same").length / sameWithHash.length).toBeGreaterThanOrEqual(0.9);
    expect(pairs.filter((p) => p.label === "different" && p.band === "same")).toEqual([]);
  });
});
