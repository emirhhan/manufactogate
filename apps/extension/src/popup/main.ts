import { REAL_DEFS, WAVE1_IDS, type ExtToWeb } from "@manufactogate/adapters";
import type { HealthResult, MarketId, SessionState } from "@manufactogate/core";
import { formatAge, formatRemaining, loadSettings, marketHost, saveSettings, type AnyReply, type AnyRequest, type HealthMap, type RunnerStatus, type Settings } from "../shared";

/**
 * Popup: every market with its session, last health reading, cooldown countdown and kept tab,
 * live runner status, bulk login opener, fixture capture and settings. Rows are built with DOM
 * APIs (never innerHTML) because health messages embed page/Chrome error text.
 */

const DEFS = REAL_DEFS;
const BY_ID = Object.fromEntries(DEFS.map((d) => [d.id, d])) as Record<MarketId, (typeof DEFS)[number]>;

const SESSION_LABEL: Record<SessionState, { text: string; cls: string }> = {
  "logged-in": { text: "giriş yapıldı", cls: "ok" },
  "logged-out": { text: "giriş yok", cls: "warn" },
  captcha: { text: "doğrulama bekliyor", cls: "bad" },
  unknown: { text: "bilinmiyor", cls: "" },
};
const STAGE_LABEL: Record<string, string> = { queued: "kuyrukta", opening: "sekme açılıyor", loading: "yükleniyor", typing: "arama yazılıyor", image: "görsel yükleniyor", settling: "sonuçlar okunuyor", captcha: "doğrulama bekleniyor", done: "bitti" };
const KIND_LABEL: Record<string, string> = { search: "arama", detail: "detay", supplier: "tedarikçi", health: "sağlık" };

function loginUrlOf(id: MarketId): string {
  const d = BY_ID[id];
  return d?.meta.loginUrl ?? d?.humanSearchHome ?? `https://www.${marketHost(id, d?.meta.hosts ?? [])}/`;
}
function homeUrlOf(id: MarketId): string {
  const d = BY_ID[id];
  return d?.humanSearchHome ?? `https://www.${marketHost(id, d?.meta.hosts ?? [])}/`;
}

/** Long operations go over a port so the service worker is not reaped mid-way; one retry covers a cold worker. */
function send<T extends AnyReply>(msg: AnyRequest, retry = true): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const port = chrome.runtime.connect({ name: "mg" });
    const id = crypto.randomUUID();
    port.onMessage.addListener((m: { id: string; payload: T; progress?: unknown }) => {
      if (m.id !== id || m.progress) return;
      settled = true;
      port.disconnect();
      resolve(m.payload);
    });
    port.onDisconnect.addListener(() => {
      if (settled) return;
      if (retry) {
        setTimeout(() => send<T>(msg, false).then(resolve, reject), 300);
        return;
      }
      reject(new Error("Eklenti arka planına bağlanılamadı; popup'ı kapatıp tekrar aç"));
    });
    port.postMessage({ id, payload: msg });
  });
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

interface View {
  sessions: Partial<Record<MarketId, SessionState>>;
  health: HealthMap;
  status: RunnerStatus | null;
  settings: Settings;
}
const view: View = { sessions: {}, health: {}, status: null, settings: await loadSettings() };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function link(text: string, href: string): HTMLAnchorElement {
  const a = el("a", undefined, text);
  a.href = href;
  a.target = "_blank";
  a.rel = "noreferrer noopener";
  return a;
}

function action(text: string, onClick: () => void, title?: string): HTMLButtonElement {
  const b = el("button", "link", text);
  if (title) b.title = title;
  b.addEventListener("click", onClick);
  return b;
}

function describe(id: MarketId): { cls: string; text: string; title: string; actions: HTMLElement[] } {
  const d = BY_ID[id];
  const sess = view.sessions[id] ?? "unknown";
  const st = view.status;
  const h = view.health[id];
  const actions: HTMLElement[] = [];
  const now = Date.now();
  const needsLogin = sess === "logged-out" || st?.cooldowns[id]?.kind === "logged-out";
  const kept = st?.keptTabs[id];

  let cls = "";
  let text = "";
  let title = "";
  const active = st?.active.find((a) => a.market === id);
  const queued = st?.queued.find((q) => q.market === id);
  const cd = st?.cooldowns[id];
  if (active) {
    cls = "busy";
    text = `${KIND_LABEL[active.kind] ?? active.kind}: ${STAGE_LABEL[active.stage] ?? active.stage}`;
    title = text;
  } else if (queued) {
    cls = "busy";
    text = `kuyrukta (${formatRemaining(queued.waitedMs)} bekledi)`;
    title = text;
  } else if (cd) {
    cls = cd.kind === "captcha" ? "bad" : cd.kind === "logged-out" ? "warn" : "warn";
    const what = cd.kind === "captcha" ? "doğrulama bekliyor" : cd.kind === "logged-out" ? "giriş gerekiyor" : cd.kind === "rate" ? "saatlik sınır" : "ağ hatası";
    text = `${what} · ${formatRemaining(cd.until - now)}`;
    title = cd.message;
    actions.push(action("şimdi dene", () => void retry(id), "Bekleme süresini sıfırla; sonraki arama hemen denenir"));
  } else if (h) {
    cls = h.ok ? "ok" : "bad";
    text = `${h.message ?? (h.ok ? "sağlıklı" : "sorun")} · ${formatAge(h.checkedAt)}`;
    title = `${h.message ?? ""}\n${new Date(h.checkedAt).toLocaleString("tr-TR")}${h.durationMs ? ` · ${Math.round(h.durationMs / 1000)} sn` : ""}`;
  } else {
    const lbl = SESSION_LABEL[sess];
    cls = lbl.cls;
    text = sess === "unknown" && d?.meta.role === "target" && !d.meta.loginUrl ? "giriş gerekmez" : lbl.text;
    title = text;
  }
  if (kept) {
    text = `${kept.session === "captcha" ? "doğrulama" : "giriş"} sekmesi açık · ${text}`;
    actions.push(action("sekmeye git", () => void send({ type: "focusTab", tabId: kept.tabId })));
  }
  actions.push(needsLogin ? link("giriş yap", loginUrlOf(id)) : link("aç", homeUrlOf(id)));
  actions.push(action("sağlık", () => void healthOne(id), "Bu pazarda gerçek arama yolunu dene"));
  return { cls, text, title, actions };
}

function renderList(ul: HTMLUListElement, ids: MarketId[], filter: string) {
  ul.replaceChildren();
  for (const id of ids) {
    const d = BY_ID[id];
    if (!d) continue;
    const name = d.meta.name;
    if (filter && !`${name} ${id} ${d.meta.country}`.toLowerCase().includes(filter)) continue;
    const info = describe(id);
    const li = el("li", info.cls);
    li.appendChild(el("i", "dot"));
    const b = el("b", undefined, name);
    b.title = `${name} · ${d.meta.country.toUpperCase()} · ${d.meta.version}`;
    li.appendChild(b);
    const span = el("span", undefined, info.text);
    span.title = info.title;
    li.appendChild(span);
    const acts = el("div", "acts");
    for (const a of info.actions) acts.appendChild(a);
    li.appendChild(acts);
    ul.appendChild(li);
  }
}

function render() {
  const filter = ($<HTMLInputElement>("filter").value ?? "").trim().toLowerCase();
  const ids = DEFS.map((d) => d.id);
  renderList($<HTMLUListElement>("main"), ids.filter((m) => WAVE1_IDS.has(m)), filter);
  renderList($<HTMLUListElement>("beta"), ids.filter((m) => !WAVE1_IDS.has(m)), filter);
  const st = view.status;
  if (st) {
    const parts = [`${st.active.length} çalışıyor`, `${st.queued.length} kuyrukta`, `${st.runnerTabs} sekme`];
    const cds = Object.keys(st.cooldowns).length;
    if (cds) parts.push(`${cds} beklemede`);
    $("statusText").replaceChildren(...parts.flatMap((p, i) => (i ? [document.createTextNode(" · "), el("b", undefined, p)] : [el("b", undefined, p)])));
  }
}

async function refreshStatus() {
  try {
    const r = await send<AnyReply & { type: "status" }>({ type: "status" }, false);
    if (r.type === "status") view.status = r.status;
  } catch {
    /* worker busy; keep the last status */
  }
  render();
}

async function refreshSessions() {
  const { sessions } = await send<ExtToWeb & { type: "sessions" }>({ type: "sessions" });
  view.sessions = sessions;
  view.health = ((await chrome.storage.local.get("health")).health as HealthMap | undefined) ?? {};
  render();
}

async function retry(id: MarketId) {
  await send({ type: "retry", market: id });
  $("msg").textContent = `${BY_ID[id]?.meta.name ?? id} için bekleme kaldırıldı; bir sonraki arama hemen denenir.`;
  await refreshStatus();
}

async function healthOne(id: MarketId) {
  $("msg").textContent = `${BY_ID[id]?.meta.name ?? id} için arama sayfası açılıyor…`;
  try {
    const r = await send<ExtToWeb & { type: "health" }>({ type: "health", market: id });
    view.health = r.health;
    const h: HealthResult | undefined = r.health[id];
    $("msg").textContent = h ? `${BY_ID[id]?.meta.name}: ${h.ok ? "sağlıklı" : "sorun"} · ${h.message ?? ""}` : "Sağlık kontrolü tamamlandı.";
  } catch (e) {
    $("msg").textContent = e instanceof Error ? e.message : String(e);
  }
  await refreshSessions();
}

async function load() {
  try {
    const pong = await send<ExtToWeb & { type: "pong" }>({ type: "ping" });
    $("ver").textContent = `v${pong.version}`;
  } catch (e) {
    $("ver").textContent = chrome.runtime.getManifest().version;
    $("msg").textContent = e instanceof Error ? e.message : String(e);
  }
  await refreshSessions();
  await refreshStatus();
  bindSettings();
}

$("health").addEventListener("click", async () => {
  const btn = $<HTMLButtonElement>("health");
  btn.disabled = true;
  $("msg").textContent = "Dört ana pazarda gerçek arama yolu deneniyor; 1-2 dakika sürebilir…";
  try {
    const r = await send<ExtToWeb & { type: "health" }>({ type: "health" });
    view.health = r.health;
    const bad = Object.entries(r.health).filter(([, h]) => !h?.ok).map(([m]) => BY_ID[m as MarketId]?.meta.name ?? m);
    $("msg").textContent = bad.length ? `Sağlık kontrolü bitti; sorunlu: ${bad.join(", ")}.` : "Sağlık kontrolü bitti; ana pazarlar sağlıklı.";
  } catch (e) {
    $("msg").textContent = e instanceof Error ? e.message : String(e);
  }
  btn.disabled = false;
  await refreshSessions();
});

$("openLogins").addEventListener("click", async () => {
  const btn = $<HTMLButtonElement>("openLogins");
  btn.disabled = true;
  try {
    const r = await send<AnyReply & { type: "openLogins:result" }>({ type: "openLogins" });
    const names = r.type === "openLogins:result" ? r.opened.map((m) => BY_ID[m]?.meta.name ?? m) : [];
    $("msg").textContent = names.length ? `Giriş sayfası açıldı: ${names.join(", ")}. Giriş yapınca aramalar kendiliğinden sürer.` : "Giriş bekleyen pazar yok.";
  } catch (e) {
    $("msg").textContent = e instanceof Error ? e.message : String(e);
  }
  btn.disabled = false;
  await refreshStatus();
});

$("closeTabs").addEventListener("click", async () => {
  await send({ type: "closeTabs" });
  $("msg").textContent = "Eklentinin açtığı pazar sekmeleri kapatıldı; bekleyen istekler iptal edildi.";
  await refreshStatus();
});

$("capture").addEventListener("click", async () => {
  $("msg").textContent = "Aktif sekme yakalanıyor…";
  try {
    const r = await send<ExtToWeb>({ type: "capture" });
    if (r.type !== "capture:result") {
      $("msg").textContent = r.type === "error" ? r.message : "Yakalama başarısız.";
      return;
    }
    const name = `${r.market ?? "unknown"}-${new Date().toISOString().replace(/[:.]/g, "-")}.html`;
    const url = URL.createObjectURL(new Blob([r.html], { type: "text/html" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    const warn = r.market ? "" : "\nPazar tanınmadı; dosya adı unknown-… oldu. Pazar sekmesinde olduğundan emin ol.";
    $("msg").textContent = `Kaydedildi: ${name}. Dosyayı packages/adapters/src/<pazar>/fixtures/ altına koy.${warn}`;
  } catch (e) {
    $("msg").textContent = e instanceof Error ? e.message : String(e);
  }
});

$("filter").addEventListener("input", render);

function bindSettings() {
  const s = view.settings;
  const maxTabs = $<HTMLSelectElement>("maxTabs");
  const sep = $<HTMLInputElement>("separateWindow");
  const tempo = $<HTMLSelectElement>("tempo");
  const captcha = $<HTMLSelectElement>("captchaWait");
  const notif = $<HTMLInputElement>("notifications");
  const overlay = $<HTMLInputElement>("overlay");
  const origin = $<HTMLInputElement>("appOrigin");
  maxTabs.value = String(s.maxParallelTabs);
  sep.checked = s.separateWindow;
  tempo.value = String(s.tempo);
  captcha.value = [60000, 120000, 300000, 0].includes(s.captchaWaitMs) ? String(s.captchaWaitMs) : "120000";
  notif.checked = s.notifications;
  overlay.checked = s.overlay;
  origin.value = s.appOrigin;
  $<HTMLAnchorElement>("appLink").href = s.appOrigin;
  const save = async (patch: Partial<Settings>) => {
    view.settings = await saveSettings(patch);
    $<HTMLAnchorElement>("appLink").href = view.settings.appOrigin;
    $("msg").textContent = "Ayar kaydedildi.";
  };
  maxTabs.addEventListener("change", () => void save({ maxParallelTabs: Number(maxTabs.value) }));
  sep.addEventListener("change", () => void save({ separateWindow: sep.checked }));
  tempo.addEventListener("change", () => void save({ tempo: Number(tempo.value) }));
  captcha.addEventListener("change", () => void save({ captchaWaitMs: Number(captcha.value) }));
  notif.addEventListener("change", () => void save({ notifications: notif.checked }));
  overlay.addEventListener("change", () => void save({ overlay: overlay.checked }));
  origin.addEventListener("change", () => void save({ appOrigin: origin.value.trim() }));
}

void load();
setInterval(() => void refreshStatus(), 1500);
