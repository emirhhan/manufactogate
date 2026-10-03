/**
 * Local market stand-in for the extension e2e. Serves the app host page (so the content script
 * injects) and synthetic market pages that reproduce the situations the runner must handle:
 * late-mounted search boxes, swallowed submits, error pages, captcha walls, login walls,
 * slow SPA result grids, late detail state and image upload widgets.
 *
 * Everything lives on 127.0.0.1:5173 because that is the only local origin in host_permissions.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "..", "..", "web", "public", "fixtures");

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** 1688-style result cards (card strategy of the 1688 extractor). */
export function cards(n, q = "耳机", offset = 0) {
  let out = '<div class="sm-offer-list">';
  for (let i = 0; i < n; i++) {
    const id = 9000 + offset + i;
    out += `<div class="sm-offer-item"><a href="https://detail.1688.com/offer/${id}.html" title="${esc(q)} 批发 ${i + 1}"><img src="//cbu01.alicdn.com/img/${id}.jpg" width="220"></a>
      <div class="price">¥ ${(10 + i).toFixed(2)}</div><div class="sale">成交 ${100 + i}件</div><div class="company-name">工厂 ${i + 1}</div><span>2件起批</span></div>`;
  }
  return out + "</div>";
}

const promo = () =>
  `<section class="promo">${cards(4, "推广", 500)}</section>`;

const page = (title, body, head = "") => `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>${head}</head><body>${body}</body></html>`;

function detailLateScript(delay) {
  const fx = readFileSync(join(fixturesDir, "1688-detail.html"), "utf8");
  const m = /<script>([\s\S]*?)<\/script>/.exec(fx);
  const body = fx.replace(/[\s\S]*<body>/, "").replace(/<\/body>[\s\S]*/, "").replace(/<script>[\s\S]*?<\/script>/, "");
  return page(
    "TWS蓝牙耳机-阿里巴巴",
    `<div id="late"></div>${body}<script>setTimeout(() => { const s = document.createElement("script"); s.textContent = ${JSON.stringify(m ? m[1] : "")}; document.body.appendChild(s); }, ${delay});</script>`,
  );
}

export function routes(url) {
  const u = new URL(url, "http://127.0.0.1:5173");
  const p = u.pathname;
  const q = u.searchParams.get("q") ?? "";
  const delay = Number(u.searchParams.get("delay") ?? 1500);
  if (p === "/") return page("Manufactogate e2e host", "<h1>Manufactogate</h1><p>e2e host page</p>");
  if (p.startsWith("/fixtures/")) {
    const f = join(fixturesDir, p.slice("/fixtures/".length).replace(/[^a-z0-9.-]/gi, ""));
    return existsSync(f) ? readFileSync(f, "utf8") : null;
  }
  if (p === "/home.html")
    return page(
      "Home",
      `<header id="hdr"><nav>Home</nav></header>${promo()}<div>我的阿里</div>
      <script>setTimeout(() => { const h = document.getElementById("hdr"); h.insertAdjacentHTML("beforeend", '<form action="/results" method="get" class="search-form"><input name="q" type="text" placeholder="Search products" style="width:400px"><button type="submit">Ara</button></form>'); }, ${delay});</script>`,
    );
  if (p === "/home-nobox.html") return page("Home", `<header><nav>Home</nav></header>${promo()}<div>我的阿里</div>`);
  if (p === "/home-noform.html")
    return page(
      "Home",
      `<header><div class="search-box"><input id="sb" type="text" placeholder="Search products" style="width:400px"><span role="button" class="search-btn" id="go">🔍</span></div></header>${promo()}<div>我的阿里</div>
      <script>document.getElementById("sb").addEventListener("keydown", (e) => { if (e.key === "Enter") e.preventDefault(); });
      document.getElementById("go").addEventListener("click", () => { location.href = "/results?q=" + encodeURIComponent(document.getElementById("sb").value); });</script>`,
    );
  if (p === "/results") return page(`${q} - 阿里巴巴`, `<h1>${esc(q)}</h1>${cards(12, q)}<div>我的阿里</div>`);
  if (p === "/results-trendyol") return readFileSync(join(fixturesDir, "trendyol-search.html"), "utf8");
  if (p === "/slow-results")
    return page("slow", `<div id="grid"></div><div>我的阿里</div><script>setTimeout(() => { document.getElementById("grid").innerHTML = ${JSON.stringify(cards(12, "slow"))}; }, ${delay});</script>`);
  if (p === "/infinite")
    return page(
      "infinite",
      `<div id="grid">${cards(10, "inf", 0)}</div><div style="height:3000px"></div><div>我的阿里</div>
      <script>let n = 10; window.addEventListener("scroll", () => { if (n < 60 && window.scrollY > 0) { n += 10; document.getElementById("grid").insertAdjacentHTML("beforeend", ${JSON.stringify(cards(10, "inf", 0)).replace("9000", "9000")}.replace(/offer\\/(\\d+)/g, (m, id) => "offer/" + (Number(id) + n))); } });</script>`,
    );
  if (p === "/empty.html") return page("empty", `<h1>Sonuç yok</h1><div>我的阿里</div>`);
  if (p === "/captcha.html")
    return page("安全验证", `<div id="nocaptcha" style="width:320px;height:90px;border:1px solid #999">请完成滑动验证 nocaptcha</div><div id="grid"></div>`);
  if (p === "/captcha-hidden.html")
    return page("results", `<div id="nocaptcha" style="display:none">nocaptcha</div><textarea class="g-recaptcha-response" style="display:none"></textarea>${cards(12, "ok")}<div>我的阿里</div>`);
  if (p === "/login/" || p === "/login/index.html") return page("Sign in", `<form><input name="email" type="email"><input name="password" type="password"><button>Sign in</button></form>`);
  if (p === "/detail-late.html") return detailLateScript(delay);
  if (p === "/image.html")
    return page(
      "image",
      `<header><div class="search-bar"><input name="q" type="text" placeholder="Ara"><button class="image-upload-button-camera" aria-label="Görselle ara"></button><input id="f" type="file" accept="image/*" style="display:none"></div></header>
      <div class="reviews">${'<img class="review-photo" alt="r">'.repeat(6)}</div><div>Hesabım</div>
      <script>document.getElementById("f").addEventListener("change", () => { document.body.insertAdjacentHTML("beforeend", "<p>uploading…</p><p>…</p><p>…</p><p>…</p><p>…</p><p>…</p>"); setTimeout(() => (location.href = "/results-trendyol"), 300); });</script>`,
    );
  if (p === "/image-none.html") return page("image", `<header><div class="search-bar"><input name="q" type="text" placeholder="Ara"></div></header><div class="reviews">${'<img class="review-photo" alt="r">'.repeat(6)}</div><div>Hesabım</div>`);
  return null;
}

export function startServer(port = 5173, host = "127.0.0.1") {
  const server = createServer((req, res) => {
    if ((req.url ?? "").startsWith("/reset")) {
      // Chrome renders net::ERR_EMPTY_RESPONSE as an error page: the DNS/transient failure case on a permitted host.
      res.socket?.destroy();
      return;
    }
    const body = routes(req.url ?? "/");
    if (body === null) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    res.end(body);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve(server));
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await startServer();
  console.log("e2e server on http://127.0.0.1:5173");
}
