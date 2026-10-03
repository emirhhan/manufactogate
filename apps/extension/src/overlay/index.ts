/**
 * Overlay on market product pages: a small floating card that opens the product in
 * Manufactogate for cross-market comparison and, when the app has stored a price snapshot
 * for this listing, shows "bu ürün şu pazarlarda şu fiyattan var". Classic script (no imports).
 *
 * The background decides whether the URL is a product page (every market's resolveLink) and
 * whether this tab belongs to the runner (then nothing is mounted). Only visible tabs mount.
 */
(() => {
  const DEFAULT_APP = "http://localhost:5173";
  const ID = "mg-overlay";
  interface Link {
    market: string;
    listingId: string;
    canonicalUrl: string;
    name: string;
  }
  interface Offer {
    market: string;
    name?: string;
    price: number;
    currency: string;
    url?: string;
  }
  interface Snapshot {
    at: string;
    offers: Offer[];
  }
  interface Resolved {
    type: string;
    link: Link | null;
    runnerTab: boolean;
  }

  let appOrigin = DEFAULT_APP;
  let enabled = true;
  let last = location.href;
  let timer: ReturnType<typeof setInterval> | null = null;
  const dismissed = new Set<string>();

  function send<T>(msg: unknown): Promise<T | null> {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (r: T) => {
          void chrome.runtime.lastError;
          resolve(r ?? null);
        });
      } catch {
        resolve(null);
      }
    });
  }

  function fmt(n: number, cur: string): string {
    try {
      return new Intl.NumberFormat("tr-TR", { style: "currency", currency: cur, maximumFractionDigits: 2 }).format(n);
    } catch {
      return `${n} ${cur}`;
    }
  }

  function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function render(link: Link, snap: Snapshot | null): void {
    if (document.getElementById(ID)) return;
    const root = el("div");
    root.id = ID;
    const style = el("style");
    style.textContent = `
      #${ID}{position:fixed;right:16px;bottom:16px;z-index:2147483647;font:13px/1.4 Inter,system-ui,sans-serif;color:#1a1a1a}
      #${ID} .mg-card{background:#fff;border:1px solid #e6e4e0;border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.18);min-width:220px;max-width:300px;overflow:hidden}
      #${ID} .mg-head{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#0f5fd6;color:#fff;font-weight:600}
      #${ID} .mg-head i{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:6px;background:#fff;color:#0f5fd6;font-style:normal;font-weight:700;font-size:12px}
      #${ID} .mg-head button{margin-left:auto;width:20px;height:20px;border-radius:50%;border:0;background:rgba(255,255,255,.25);color:#fff;font-size:12px;cursor:pointer}
      #${ID} ul{list-style:none;margin:0;padding:6px 12px}
      #${ID} li{display:flex;justify-content:space-between;gap:12px;padding:4px 0;border-bottom:1px solid #f0efec}
      #${ID} li:last-child{border-bottom:0}
      #${ID} li b{font-weight:500}
      #${ID} li a{color:#0f5fd6;text-decoration:none}
      #${ID} .mg-foot{padding:8px 12px;border-top:1px solid #e6e4e0;display:flex;align-items:center;justify-content:space-between;gap:8px}
      #${ID} .mg-foot small{color:#6b6b6b}
      #${ID} .mg-cta{display:inline-block;background:#0f5fd6;color:#fff;text-decoration:none;padding:7px 12px;border-radius:999px;font-weight:600}
      #${ID} .mg-cta:hover{background:#0b4db0}`;
    root.appendChild(style);
    const card = el("div", "mg-card");
    const head = el("div", "mg-head");
    head.appendChild(el("i", undefined, "M"));
    head.appendChild(el("span", undefined, snap ? "Diğer pazarlarda" : "Manufactogate"));
    const close = el("button", undefined, "×");
    close.title = "Kapat";
    close.setAttribute("aria-label", "Kapat");
    close.addEventListener("click", () => {
      dismissed.add(location.href);
      root.remove();
    });
    head.appendChild(close);
    card.appendChild(head);
    if (snap && snap.offers.length) {
      const ul = el("ul");
      for (const o of snap.offers.slice(0, 6)) {
        const li = el("li");
        li.appendChild(el("b", undefined, o.name ?? o.market));
        if (o.url) {
          const a = el("a", undefined, fmt(o.price, o.currency));
          a.href = o.url;
          a.target = "_blank";
          a.rel = "noreferrer noopener";
          li.appendChild(a);
        } else li.appendChild(el("span", undefined, fmt(o.price, o.currency)));
        ul.appendChild(li);
      }
      card.appendChild(ul);
    }
    const foot = el("div", "mg-foot");
    foot.appendChild(el("small", undefined, snap ? `${new Date(snap.at).toLocaleDateString("tr-TR")} itibarıyla` : `${link.name} ürünü`));
    const cta = el("a", "mg-cta", snap ? "Tam karşılaştırma ↗" : "Diğer pazarlarda karşılaştır");
    cta.href = `${appOrigin}/?link=${encodeURIComponent(location.href)}`;
    cta.target = "_blank";
    cta.rel = "noreferrer noopener";
    foot.appendChild(cta);
    card.appendChild(foot);
    root.appendChild(card);
    document.body.appendChild(root);
  }

  async function snapshotFor(link: Link): Promise<Snapshot | null> {
    try {
      const { snapshots } = await chrome.storage.local.get("snapshots");
      const s = (snapshots as Record<string, Snapshot> | undefined)?.[`${link.market}:${link.listingId}`];
      return s && Array.isArray(s.offers) ? s : null;
    } catch {
      return null;
    }
  }

  async function mount(): Promise<void> {
    if (!enabled || document.visibilityState !== "visible" || dismissed.has(location.href)) return;
    if (document.getElementById(ID)) return;
    const r = await send<Resolved>({ type: "resolve", url: location.href });
    if (!r || r.type !== "resolve:result" || !r.link || r.runnerTab) return;
    if (location.href !== last) return; // navigated meanwhile
    render(r.link, await snapshotFor(r.link));
  }

  function watch(): void {
    if (timer || document.visibilityState !== "visible") return;
    timer = setInterval(() => {
      if (location.href !== last) {
        last = location.href;
        document.getElementById(ID)?.remove();
        void mount();
      }
    }, 1500);
  }

  function unwatch(): void {
    if (timer) clearInterval(timer);
    timer = null;
  }

  async function init(): Promise<void> {
    try {
      const { settings } = await chrome.storage.local.get("settings");
      const s = settings as { appOrigin?: string; overlay?: boolean } | undefined;
      if (s?.appOrigin && /^https?:\/\//.test(s.appOrigin)) appOrigin = s.appOrigin.replace(/\/$/, "");
      if (s?.overlay === false) enabled = false;
    } catch {
      /* defaults */
    }
    if (!enabled) return;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        watch();
        void mount();
      } else unwatch();
    });
    watch();
    void mount();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => void init());
  else void init();
})();
