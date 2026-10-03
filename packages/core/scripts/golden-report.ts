/**
 * Prints the golden-dataset calibration table (score buckets → observed precision) for tuning
 * scoreMatch weights. Runs the golden test with GOLDEN_REPORT=1 so the report is printed even
 * when every target passes.
 *
 *   node packages/core/scripts/golden-report.ts
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkg = join(dirname(fileURLToPath(import.meta.url)), "..");
const r = spawnSync("pnpm", ["vitest", "run", "--project", "core", "--reporter=verbose", "test/golden.test.ts"], {
  cwd: pkg,
  stdio: "inherit",
  env: { ...process.env, GOLDEN_REPORT: "1" },
});
process.exit(r.status ?? 1);
