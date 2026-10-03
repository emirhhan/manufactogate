import rawCases from "../golden/cases.json";
import { evaluateGolden, formatReport, type GoldenCase } from "../golden/evaluate";

const cases = rawCases as GoldenCase[];

describe("golden dataset (PLAN §7.1/7.3)", () => {
  const m = evaluateGolden(cases);
  if ((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.["GOLDEN_REPORT"]) console.log(formatReport(m));
  it("is well formed", () => {
    expect(cases.length).toBeGreaterThanOrEqual(40);
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
    for (const c of cases) {
      expect(c.candidates.length).toBeGreaterThan(0);
      for (const cand of c.candidates) expect(["same", "variant", "accessory", "different"]).toContain(cand.label);
    }
    expect(m.pairs.length).toBeGreaterThanOrEqual(150);
  });
  it("meets the calibration targets", () => {
    const report = formatReport(m);
    expect(m.precisionSame, report).toBeGreaterThanOrEqual(0.9);
    expect(m.precisionLikelyOrBetter, report).toBeGreaterThanOrEqual(0.8);
    expect(m.recallSame, report).toBeGreaterThanOrEqual(0.7);
    expect(m.accessoryViolations.map((p) => `${p.caseId}: ${p.title}`), report).toEqual([]);
    expect(m.differentAsSame.map((p) => `${p.caseId}: ${p.title}`), report).toEqual([]);
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
  });
});
