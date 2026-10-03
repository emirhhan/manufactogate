import type { ExtToWeb, WebToExt } from "@manufactogate/adapters";
import type { HealthResult, MarketId, SessionState } from "@manufactogate/core";
import { REAL_DEF_BY_ID, REAL_DEFS } from "@manufactogate/adapters";
import { MARKET_HOSTS } from "../shared";
const NAMES = Object.fromEntries(REAL_DEFS.map((d) => [d.id, d.meta.name])) as Record<MarketId, string>;
const LOGIN = Object.fromEntries(REAL_DEFS.map((d) => [d.id, d.meta.loginUrl ?? `https://${d.meta.hosts[0]?.replace("*.", "www.") ?? ""}/`])) as Record<MarketId, string>;

const LABEL: Record<SessionState, { text: string; cls: string }> = {
  "logged-in": { text: "giriş yapıldı", cls: "ok" },
  "logged-out": { text: "giriş yok", cls: "warn" },
  captcha: { text: "doğrulama bekliyor", cls: "bad" },
  unknown: { text: "giriş gerekmez", cls: "" },
};

function send<T extends ExtToWeb>(msg: WebToExt): Promise<T> {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, (r: T) => resolve(r)));
}
const $ = (id: string) => document.getElementById(id)!;

function renderMarkets(sessions: Partial<Record<MarketId, SessionState>>, health: Partial<Record<MarketId, HealthResult>>) {
  const ul = $("markets");
  ul.innerHTML = "";
  for (const id of REAL_DEFS.map((d) => d.id)) {
    const st = LABEL[sessions[id] ?? "unknown"];
    const h = health[id];
    const li = document.createElement("li");
    li.className = h ? (h.ok ? "ok" : "bad") : st.cls;
    const detail = h ? `${h.message ?? ""}` : st.text;
    const home = MARKET_HOSTS[id]?.host ?? REAL_DEF_BY_ID[id]?.meta.hosts[0]?.replace("*.", "www.") ?? "";
    li.innerHTML = `<i class="dot"></i><b>${NAMES[id]}</b><span title="${detail}">${detail}</span><a href="${sessions[id] === "logged-out" ? LOGIN[id] : `https://${home}`}" target="_blank" rel="noreferrer">${sessions[id] === "logged-out" ? "giriş yap" : "aç"} ↗</a>`;
    ul.appendChild(li);
  }
}

async function load() {
  const pong = await send<ExtToWeb & { type: "pong" }>({ type: "ping" });
  $("ver").textContent = `v${pong.version}`;
  const { sessions } = await send<ExtToWeb & { type: "sessions" }>({ type: "sessions" });
  const stored = ((await chrome.storage.local.get("health")).health as Partial<Record<MarketId, HealthResult>> | undefined) ?? {};
  renderMarkets(sessions, stored);
}

$("health").addEventListener("click", async () => {
  const btn = $("health") as HTMLButtonElement;
  btn.disabled = true;
  $("msg").textContent = "Her pazar için arama sayfası açılıyor, bu 1-2 dakika sürebilir…";
  const r = await send<ExtToWeb & { type: "health" }>({ type: "health" });
  const { sessions } = await send<ExtToWeb & { type: "sessions" }>({ type: "sessions" });
  renderMarkets(sessions, r.health);
  $("msg").textContent = "Sağlık kontrolü tamamlandı.";
  btn.disabled = false;
});

$("capture").addEventListener("click", async () => {
  $("msg").textContent = "Aktif sekme yakalanıyor…";
  const r = await send<ExtToWeb>({ type: "capture" });
  if (r.type !== "capture:result") {
    $("msg").textContent = r.type === "error" ? r.message : "Yakalama başarısız.";
    return;
  }
  const name = `${r.market ?? "unknown"}-${new Date().toISOString().replace(/[:.]/g, "-")}.html`;
  const url = URL.createObjectURL(new Blob([`<!-- ${r.url} -->\n${r.html}`], { type: "text/html" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  $("msg").textContent = `Kaydedildi: ${name}. Dosyayı packages/adapters/src/<pazar>/fixtures/ altına koy.`;
});

void load();
