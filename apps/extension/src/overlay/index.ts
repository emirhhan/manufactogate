/**
 * Overlay on market product pages: a small floating button that opens the product in
 * Manufactogate for cross-market comparison. Classic script (no imports).
 */
const APP = "http://localhost:5173";
const PRODUCT_PATTERNS = [
  /detail\.1688\.com\/offer\/\d+/, /item\.taobao\.com\/item\.htm/, /detail\.tmall\.com\/item\.htm/, /yangkeduo\.com\/goods\d*\.html/,
  /trendyol\.com\/.*-p-\d+/, /hepsiburada\.com\/.*-p-[A-Z0-9]+/, /n11\.com\/urun\//, /amazon\.[a-z.]+\/.*\/dp\/[A-Z0-9]{10}/, /aliexpress\.[a-z]+\/item\/\d+/,
  /alibaba\.com\/product-detail\//, /dhgate\.com\/product\//, /ebay\.com\/itm\//, /walmart\.com\/ip\//, /temu\.com\/.*-g-\d+\.html/,
];

function mount() {
  if (!PRODUCT_PATTERNS.some((p) => p.test(location.href))) return;
  if (document.getElementById("mg-overlay")) return;
  const el = document.createElement("div");
  el.id = "mg-overlay";
  el.innerHTML = `<style>
    #mg-overlay{position:fixed;right:16px;bottom:16px;z-index:2147483647;font:13px/1.4 Inter,system-ui,sans-serif}
    #mg-overlay a{display:flex;align-items:center;gap:8px;background:#0f5fd6;color:#fff;text-decoration:none;padding:10px 14px;border-radius:999px;box-shadow:0 8px 24px rgba(0,0,0,.25)}
    #mg-overlay a:hover{background:#0b4db0}
    #mg-overlay i{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:6px;background:#fff;color:#0f5fd6;font-style:normal;font-weight:700;font-size:12px}
    #mg-overlay button{position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;border:0;background:#333;color:#fff;font-size:11px;cursor:pointer}
  </style>
  <a href="${APP}/?link=${encodeURIComponent(location.href)}" target="_blank" rel="noreferrer"><i>M</i> Diğer pazarlarda karşılaştır</a>
  <button title="Kapat" aria-label="Kapat">×</button>`;
  el.querySelector("button")!.addEventListener("click", () => el.remove());
  document.body.appendChild(el);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
else mount();
// SPA navigations
let last = location.href;
setInterval(() => {
  if (location.href !== last) {
    last = location.href;
    document.getElementById("mg-overlay")?.remove();
    mount();
  }
}, 1500);
