/**
 * Regenerates the generated part of the golden dataset from golden/products.ts and writes
 * golden/cases.json. Hand-written cases (ids the table does not produce) are kept as they are and
 * stay first; generated cases follow in table order. Run after editing products.ts:
 *
 *   node packages/core/scripts/golden-build.ts
 *
 * test/golden.test.ts fails when cases.json and the table disagree, so the JSON never drifts.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGoldenCases } from "../golden/products.ts";
import type { GoldenCase } from "../golden/evaluate.ts";

const golden = join(dirname(fileURLToPath(import.meta.url)), "..", "golden");
const file = join(golden, "cases.json");
const existing = JSON.parse(readFileSync(file, "utf8")) as GoldenCase[];
const generated = buildGoldenCases();
const generatedIds = new Set(generated.map((c) => c.id));
const kept = existing.filter((c) => !generatedIds.has(c.id));
const out = [...kept, ...generated];
const ids = new Set<string>();
for (const c of out) {
  if (ids.has(c.id)) throw new Error(`duplicate golden case id: ${c.id}`);
  ids.add(c.id);
}
writeFileSync(file, JSON.stringify(out, null, 1) + "\n");
console.log(`golden: ${kept.length} hand-written + ${generated.length} generated = ${out.length} cases, ${out.reduce((s, c) => s + c.candidates.length, 0)} pairs`);
