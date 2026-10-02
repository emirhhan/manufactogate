import type { MarketId, SessionState } from "@manufactogate/core";
import { MARKET_HOSTS, type BgRequest, type BgResponse } from "../shared";

const NAMES: Record<MarketId, string> = { "cn-1688": "1688", "cn-taobao": "Taobao", "cn-pinduoduo": "Pinduoduo", "tr-trendyol": "Trendyol" };
const LABEL: Record<SessionState, { text: string; cls: string }> = {
  "logged-in": { text: "giriş yapıldı", cls: "ok" },
  "logged-out": { text: "giriş yok", cls: "warn" },
  captcha: { text: "doğrulama bekliyor", cls: "bad" },
  unknown: { text: "bilinmiyor", cls: "" },
};

function send<T extends BgResponse>(msg: BgRequest): Promise<T> {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, (r: T) => resolve(r)));
}

async function render() {
  const pong = await send<BgResponse & { type: "pong" }>({ type: "ping" });
  document.getElementById("ver")!.textContent = `v${pong.version}`;
  const { sessions } = await send<BgResponse & { type: "sessions" }>({ type: "sessions" });
  const ul = document.getElementById("markets")!;
  ul.innerHTML = "";
  for (const id of Object.keys(MARKET_HOSTS) as MarketId[]) {
    const st = LABEL[sessions[id] ?? "unknown"];
    const li = document.createElement("li");
    li.className = st.cls;
    const host = MARKET_HOSTS[id]?.host ?? "";
    li.innerHTML = `<i class="dot"></i><b>${NAMES[id]}</b><span>${st.text}</span><a href="https://${host}" target="_blank" rel="noreferrer">aç ↗</a>`;
    ul.appendChild(li);
  }
}
void render();
