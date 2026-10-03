/**
 * End-to-end check of the extension plumbing without touching real markets.
 * Loads the built extension into Chromium and drives it from a host page served by e2e/server.mjs
 * on 127.0.0.1:5173 (stop the Vite dev server first, or set MG_WEB to an already running host that
 * serves the same routes). Run: PW_CHROMIUM=/opt/pw-browsers/chromium pnpm --filter @manufactogate/extension e2e
 */
import { chromium } from "playwright";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./server.mjs";

const ext = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const base = process.env.MG_WEB ?? "http://127.0.0.1:5173";
const launch = { headless: true, args: ["--no-sandbox", `--disable-extensions-except=${ext}`, `--load-extension=${ext}`] };
if (process.env.PW_CHROMIUM) launch.executablePath = process.env.PW_CHROMIUM;

let server = null;
if (!process.env.MG_WEB) {
  try {
    server = await startServer();
  } catch (e) {
    console.error("e2e server could not bind 127.0.0.1:5173 (is `pnpm dev` running? stop it or set MG_WEB):", e.message);
    process.exit(2);
  }
}

const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "mg-ext-")), launch);
const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker", { timeout: 15000 }));
console.log("service worker:", sw.url());
// The chrome namespace fills in shortly after the worker starts.
for (let i = 0; i < 50 && (await sw.evaluate(() => typeof chrome.storage)) !== "object"; i++) await new Promise((r) => setTimeout(r, 100));
// Short captcha wait so the captcha scenarios finish quickly.
await sw.evaluate(() => chrome.storage.local.set({ settings: { captchaWaitMs: 8000, notifications: false } }));

async function openHost() {
  const p = await context.newPage();
  await p.goto(base, { waitUntil: "load" });
  await p.waitForFunction(() => document.documentElement.hasAttribute("data-manufactogate-ext"), null, { timeout: 10000 });
  return p;
}
const page = await openHost();

const askOn = (p, payload, timeout = 60000) =>
  p.evaluate(
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
const ask = (payload, timeout) => askOn(page, payload, timeout);
const run = (req, timeout) => ask({ type: "run", req }, timeout).then((r) => r.result);
const marketPages = () => context.pages().filter((p) => p.url().startsWith(base) && p.url() !== `${base}/`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const timed = async (fn) => {
  const t0 = Date.now();
  const r = await fn();
  return { r, ms: Date.now() - t0 };
};

const checks = [];
const expect = (name, cond, detail) => {
  checks.push({ name, ok: !!cond });
  if (!cond) console.log("  ->", name, detail !== undefined ? JSON.stringify(detail).slice(0, 400) : "");
};

try {
  // 0. Plumbing: version from the manifest, unknown requests get a typed error, status reply.
  const pong = await ask({ type: "ping" });
  expect("ping carries the manifest version", pong.type === "pong" && /^\d+\.\d+\.\d+$/.test(pong.version), pong);
  const unknown = await ask({ type: "nonsense" });
  expect("unknown request type answers with an error payload", unknown?.type === "error" && typeof unknown.message === "string", unknown);
  const st0 = await ask({ type: "status" });
  expect("status reply has runner fields", st0.type === "status" && Array.isArray(st0.status.queued) && st0.status.maxParallelTabs === 3, st0);

  // 1. Fixture extraction (URL path).
  const t = await run({ market: "tr-trendyol", kind: "search", url: `${base}/fixtures/trendyol-search.html`, want: 2, timeoutMs: 8000 });
  expect("trendyol embedded search", t?.ok && t.data.strategy === "embedded" && t.data.items.length === 2, t);
  const s = await run({ market: "cn-1688", kind: "search", url: `${base}/fixtures/1688-search.html`, want: 2, timeoutMs: 8000 });
  expect("1688 card search", s?.ok && s.data.strategy === "cards" && s.data.items[0]?.price === 25.8, s);
  const d = await run({ market: "cn-1688", kind: "detail", url: `${base}/fixtures/1688-detail.html`, timeoutMs: 8000 });
  expect("1688 detail ladder", d?.ok && d.data.detail?.tiers?.length === 3, d);

  // 2. Typed search on a home page whose search box mounts late (SPA hydration). Progress envelopes travel
  //    under a separate key (progressFor) so the request/reply bridge never mistakes them for the result.
  await page.evaluate(() => {
    window.__mgProgress = [];
    window.addEventListener("message", (ev) => {
      const d = ev.data;
      if (d && d.source === "manufactogate-ext" && d.progressFor) window.__mgProgress.push(d.payload.stage);
    });
  });
  const typed = await timed(() => run({ market: "cn-1688", kind: "search", url: `${base}/home.html?delay=1500`, typeQuery: "bluetooth kulaklik", want: 5, timeoutMs: 15000 }, 60000));
  expect("typed search waits for a late search box and lands on results", typed.r?.ok && typed.r.finalUrl.includes("/results?q=bluetooth") && typed.r.data.items.length >= 5, typed.r);
  expect("typed search does not report the home page's promo cards", typed.r?.ok && typed.r.data.items.every((i) => !/推广/.test(i.title)), typed.r?.data?.items?.slice(0, 3));
  const stages = await page.evaluate(() => window.__mgProgress);
  expect("progress envelopes report the typing and settling stages", stages.includes("typing") && stages.includes("settling") && stages.includes("done"), stages);

  // 3. Search box without a form and a swallowed Enter: the submit button is pressed instead.
  const noform = await run({ market: "cn-1688", kind: "search", url: `${base}/home-noform.html`, typeQuery: "kulaklik", want: 5, timeoutMs: 15000 }, 60000);
  expect("swallowed Enter falls back to the search button", noform?.ok && noform.finalUrl.includes("/results?q=kulaklik") && noform.data.items.length >= 5, noform);

  // 4. No search box at all: the runner falls back to the market's search URL (unreachable offline),
  //    which must surface as a Network failure with a Turkish message, never as SelectorBroken.
  const nobox = await timed(() => run({ market: "cn-1688", kind: "search", url: `${base}/home-nobox.html`, typeQuery: "x", want: 5, timeoutMs: 10000 }, 90000));
  expect("missing search box is not SelectorBroken", nobox.r && nobox.r.ok === false && nobox.r.error === "Network" && !/Frame with ID|showing error page/.test(nobox.r.message), nobox.r);
  await ask({ type: "retry", market: "cn-1688" }); // network failures count towards a cooldown; reset between scenarios

  // 5. Chrome error page on a permitted host: retried with backoff, then a fast Network failure, translated, tab closed.
  const err = await timed(() => run({ market: "cn-1688", kind: "search", url: `${base}/reset`, want: 5, timeoutMs: 25000 }, 60000));
  expect("error page returns Network quickly with a Turkish message", err.r && err.r.ok === false && err.r.error === "Network" && /yüklenemedi/.test(err.r.message) && err.ms < 20000, { r: err.r, ms: err.ms });
  await sleep(300);
  expect("error page tab is closed", !context.pages().some((p) => p.url().includes("/reset")), context.pages().map((p) => p.url()));
  await ask({ type: "retry", market: "cn-1688" });
  // 5b. A host outside the permission list is reported in Turkish, not as Chrome's English text.
  const noperm = await run({ market: "cn-1688", kind: "search", url: "http://127.0.0.1:1/", want: 5, timeoutMs: 25000 }, 60000);
  expect("undeclared host is reported in Turkish", noperm && noperm.ok === false && noperm.error === "Network" && /izin yok/.test(noperm.message) && !/Cannot access/.test(noperm.message), noperm);
  await ask({ type: "retry", market: "cn-1688" });

  // 6. Genuinely empty page settles fast instead of burning the whole timeout.
  const empty = await timed(() => run({ market: "cn-1688", kind: "search", url: `${base}/empty.html`, want: 30, timeoutMs: 25000 }, 60000));
  expect("empty page settles in under 14 s", empty.r?.ok && empty.r.data.items.length === 0 && empty.ms < 14000, { ms: empty.ms, r: empty.r });

  // 7. Slow SPA grid: results that appear after 2.5 s are still collected.
  const slow = await run({ market: "cn-1688", kind: "search", url: `${base}/slow-results?delay=2500`, want: 30, timeoutMs: 25000 }, 60000);
  expect("late-rendered results are collected", slow?.ok && slow.data.items.length === 12, slow?.data?.items?.length);

  // 8. Infinite scroll: the adaptive scroll pass harvests far more than the first screen.
  const inf = await run({ market: "cn-1688", kind: "search", url: `${base}/infinite`, want: 60, timeoutMs: 25000 }, 60000);
  expect("adaptive scroll harvests an infinite grid", inf?.ok && inf.data.items.length >= 40, inf?.data?.items?.length);

  // 9. Detail page whose embedded state script arrives late: settle budget starts after load.
  const late = await run({ market: "cn-1688", kind: "detail", url: `${base}/detail-late.html?delay=3000`, timeoutMs: 8000 }, 60000);
  expect("late detail state is parsed", late?.ok && late.data.detail?.tiers?.length === 3, late);

  // 10. Invisible captcha marker on a usable page: results win, session is not "captcha".
  const hidden = await run({ market: "cn-1688", kind: "search", url: `${base}/captcha-hidden.html`, want: 5, timeoutMs: 15000 }, 60000);
  expect("invisible captcha markup does not block a usable page", hidden?.ok && hidden.data.items.length >= 5 && hidden.data.session !== "captcha", hidden);

  // 11. Visible captcha: the tab is brought forward, the user solves it, extraction continues.
  const captchaRun = run({ market: "cn-1688", kind: "search", url: `${base}/captcha.html`, want: 5, timeoutMs: 15000 }, 90000);
  let wall = null;
  for (let i = 0; i < 60 && !wall; i++) {
    await sleep(250);
    wall = context.pages().find((p) => p.url().includes("/captcha.html"));
  }
  expect("captcha tab is opened", !!wall);
  if (wall) {
    await sleep(2500); // let the runner notice the wall and start waiting
    await wall.evaluate(() => {
      document.getElementById("nocaptcha")?.remove();
      document.title = "results";
      document.getElementById("grid").innerHTML = Array.from({ length: 6 }, (_, i) => `<div class="sm-offer-item"><a href="https://detail.1688.com/offer/${7000 + i}.html" title="solved ${i}">x</a><div class="price">¥ 12.00</div></div>`).join("");
    });
  }
  const solved = await captchaRun;
  expect("extraction continues after the captcha is solved", solved?.ok && solved.data.items.length >= 5 && solved.data.session !== "captcha", solved);

  // 12. Login wall (generic market, /login/ path): tab kept in the background, not focused, cooldown set.
  const hostActiveBefore = await page.evaluate(() => document.visibilityState);
  const lo = await run({ market: "us-ebay", kind: "search", url: `${base}/login/`, want: 2, timeoutMs: 8000 }, 60000);
  expect("login wall reported with loginUrl and kept tab", lo?.ok && lo.data.session === "logged-out" && typeof lo.data.loginUrl === "string" && typeof lo.data.keptTabId === "number", lo);
  const loginPage = context.pages().find((p) => p.url().includes("/login/"));
  expect("login tab stays open in the background", !!loginPage && hostActiveBefore === "visible" && (await page.evaluate(() => document.visibilityState)) === "visible");
  const st1 = await ask({ type: "status" });
  expect("login cooldown and kept tab visible in status", st1.status.cooldowns["us-ebay"]?.kind === "logged-out" && st1.status.keptTabs["us-ebay"]?.session === "logged-out", st1.status);
  const lo2 = await timed(() => run({ market: "us-ebay", kind: "search", url: `${base}/login/`, want: 2, timeoutMs: 8000 }, 60000));
  expect("second request during cooldown answers instantly without a tab", lo2.r?.ok && lo2.r.data.session === "logged-out" && lo2.ms < 1500 && context.pages().filter((p) => p.url().includes("/login/")).length === 1, { ms: lo2.ms, r: lo2.r });
  const retry = await ask({ type: "retry", market: "us-ebay" });
  const st2 = await ask({ type: "status" });
  expect("retry clears the cooldown", retry.type === "ok" && !st2.status.cooldowns["us-ebay"], st2.status.cooldowns);

  // 13. Image search: decoy review photos are ignored, the real file input is used, navigation is followed.
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  const img = await run({ market: "tr-trendyol", kind: "search", url: `${base}/image.html`, imageDataUrl: png, want: 2, timeoutMs: 15000 }, 60000);
  expect("image upload navigates to results", img?.ok && img.finalUrl.includes("/results-trendyol") && img.data.items.length === 2, img);
  const imgNone = await timed(() => run({ market: "cn-aliexpress", kind: "search", url: `${base}/image-none.html`, imageDataUrl: png, want: 2, timeoutMs: 15000 }, 60000));
  expect("missing upload widget fails fast as NotFound", imgNone.r && imgNone.r.ok === false && imgNone.r.error === "NotFound" && imgNone.ms < 15000, { ms: imgNone.ms, r: imgNone.r });

  // 14. Fan-out: 10 concurrent runs never exceed the parallel-tab cap and all answer.
  let maxOpen = 0;
  const poll = setInterval(() => (maxOpen = Math.max(maxOpen, marketPages().filter((p) => !p.url().includes("/login/")).length)), 100);
  const fan = await Promise.all(Array.from({ length: 10 }, (_, i) => run({ market: "cn-1688", kind: "search", url: `${base}/results?q=fan${i}`, want: 5, timeoutMs: 15000 }, 120000)));
  clearInterval(poll);
  expect("fan-out respects the parallel tab cap", maxOpen <= 3, { maxOpen });
  expect("all fan-out requests answer with results", fan.every((r) => r?.ok && r.data.items.length >= 5), fan.map((r) => r?.ok));
  await sleep(500);
  expect("no market tabs remain after the fan-out (login tab aside)", marketPages().filter((p) => !p.url().includes("/login/") && p.url() !== "about:blank").length === 0, marketPages().map((p) => p.url()));

  // 15. Cancellation: closing the asking page cancels queued and in-flight runs and closes their tabs.
  const second = await openHost();
  for (let i = 0; i < 6; i++) void askOn(second, { type: "run", req: { market: "cn-1688", kind: "search", url: `${base}/slow-results?delay=9000&n=${i}`, want: 30, timeoutMs: 25000 } }, 120000).catch(() => undefined);
  await sleep(2500);
  const st3 = await ask({ type: "status" });
  expect("runs are queued/active before cancel", st3.status.active.length + st3.status.queued.length >= 5, st3.status);
  await second.close();
  await sleep(2500);
  const st4 = await ask({ type: "status" });
  expect("closing the page cancels its runs", st4.status.active.length === 0 && st4.status.queued.length === 0, st4.status);
  expect("cancelled runs leave no slow-results tabs", !context.pages().some((p) => p.url().includes("/slow-results")), context.pages().map((p) => p.url()));

  // 15b. Explicit cancel message from a connection drops its own runs.
  const third = await openHost();
  for (let i = 0; i < 4; i++) void askOn(third, { type: "run", req: { market: "cn-1688", kind: "search", url: `${base}/slow-results?delay=9000&c=${i}`, want: 30, timeoutMs: 25000 } }, 120000).catch(() => undefined);
  await sleep(2000);
  const cancelled = await askOn(third, { type: "cancel" });
  await sleep(1500);
  const st5 = await ask({ type: "status" });
  expect("cancel message drops the connection's runs", cancelled.type === "ok" && st5.status.active.length === 0 && st5.status.queued.length === 0, st5.status);
  await third.close();

  // 16. Close-all from the popup path closes the kept login tab too.
  const closed = await ask({ type: "closeTabs" });
  await sleep(500);
  expect("closeTabs closes kept tabs", closed.type === "ok" && !context.pages().some((p) => p.url().includes("/login/")), context.pages().map((p) => p.url()));
} finally {
  await context.close();
  server?.close();
}
for (const c of checks) console.log(c.ok ? "PASS" : "FAIL", c.name);
if (checks.some((c) => !c.ok)) process.exit(1);
