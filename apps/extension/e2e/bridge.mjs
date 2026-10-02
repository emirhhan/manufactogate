/**
 * End-to-end check of the extension plumbing without touching real markets:
 * loads the built extension into Chromium, opens the web app (pnpm dev must be running on
 * 127.0.0.1:5173), and asks the extension to extract local fixture pages served from
 * apps/web/public/fixtures. Run: pnpm --filter @manufactogate/extension e2e
 */
import { chromium } from "playwright";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ext = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const base = process.env.MG_WEB ?? "http://127.0.0.1:5173";
const launch = { headless: true, args: ["--no-sandbox", `--disable-extensions-except=${ext}`, `--load-extension=${ext}`] };
if (process.env.PW_CHROMIUM) launch.executablePath = process.env.PW_CHROMIUM;

const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "mg-ext-")), launch);
const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker", { timeout: 15000 }));
console.log("service worker:", sw.url());
const page = await context.newPage();
await page.goto(base, { waitUntil: "networkidle" });
await page.waitForFunction(() => document.documentElement.hasAttribute("data-manufactogate-ext"), null, { timeout: 10000 });

const ask = (payload, timeout = 30000) =>
  page.evaluate(
    ({ payload, timeout }) =>
      new Promise((resolve, reject) => {
        const id = crypto.randomUUID();
        const t = setTimeout(() => reject(new Error("timeout")), timeout);
        window.addEventListener("message", function h(ev) {
          const d = ev.data;
          if (!d || d.source !== "manufactogate-ext" || d.replyTo !== id) return;
          clearTimeout(t);
          window.removeEventListener("message", h);
          resolve(d.payload);
        });
        window.postMessage({ source: "manufactogate-web", id, payload }, "*");
      }),
    { payload, timeout },
  );

const checks = [];
const expect = (name, cond) => checks.push({ name, ok: !!cond });
const pong = await ask({ type: "ping" });
expect("ping", pong.type === "pong");
const t = await ask({ type: "run", req: { market: "tr-trendyol", kind: "search", url: `${base}/fixtures/trendyol-search.html`, want: 2, timeoutMs: 8000 } });
expect("trendyol embedded search", t.result?.ok && t.result.data.strategy === "embedded" && t.result.data.items.length === 2);
const s = await ask({ type: "run", req: { market: "cn-1688", kind: "search", url: `${base}/fixtures/1688-search.html`, want: 2, timeoutMs: 8000 } });
expect("1688 card search", s.result?.ok && s.result.data.strategy === "cards" && s.result.data.items[0]?.price === 25.8);
const d = await ask({ type: "run", req: { market: "cn-1688", kind: "detail", url: `${base}/fixtures/1688-detail.html`, timeoutMs: 8000 } });
expect("1688 detail ladder", d.result?.ok && d.result.data.detail?.tiers?.length === 3);
const lo = await ask({ type: "run", req: { market: "cn-1688", kind: "search", url: `${base}/fixtures/1688-loggedout.html`, want: 2, timeoutMs: 8000 } });
expect("logged-out detection", lo.result?.ok && lo.result.data.session === "logged-out");
expect("tabs closed", context.pages().length <= 2);
await context.close();
for (const c of checks) console.log(c.ok ? "PASS" : "FAIL", c.name);
if (checks.some((c) => !c.ok)) process.exit(1);
