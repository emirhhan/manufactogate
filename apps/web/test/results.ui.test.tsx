import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { MarketStatus, RawListing } from "@manufactogate/core";
import { ListingActions, copyText } from "../src/components/ListingActions";
import { MarketPanel, marketRowLabel } from "../src/components/MarketPanel";
import { Results } from "../src/pages/Results";
import { setRegistryForTests } from "../src/lib/registry";
import type { SearchRecord } from "../src/lib/db";
import { useExtension } from "../src/store/extension";
import { resetSearchSession, useSearch } from "../src/store/search";
import { useSettings } from "../src/store/settings";
import { useToast } from "../src/store/toast";
import { useWatch } from "../src/store/watch";
import { clearDb, fakeAdapter, flush, listing, registryOf, waitFor } from "./helpers";

let root: Root | null = null;
let host: HTMLElement;
function mount(node: React.ReactNode, entry = "/") {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/search/:id" element={node} />
          <Route path="*" element={node} />
        </Routes>
      </MemoryRouter>,
    );
  });
}
const text = () => host.textContent ?? "";
const click = (el: Element | null) => {
  if (!el) throw new Error("element not found");
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

beforeEach(async () => {
  await clearDb();
  resetSearchSession();
  window.scrollTo = () => undefined;
  useToast.setState({ toasts: [] });
  useExtension.setState({ live: {} });
  setRegistryForTests(registryOf(fakeAdapter("cn-1688", { name: "1688" }), fakeAdapter("cn-taobao", { name: "Taobao" }), fakeAdapter("tr-trendyol", { name: "Trendyol", country: "tr", role: "target", language: "tr" })));
  useSettings.setState({ enabledMarkets: ["cn-1688", "cn-taobao", "tr-trendyol"], hydrated: true, targetCountry: "tr" });
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  setRegistryForTests(null);
});

describe("marketRowLabel", () => {
  const running = (extra: Partial<Extract<MarketStatus, { state: "running" }>>): MarketStatus => ({ state: "running", received: 0, ...extra });
  it("mirrors the extension stage, page and ladder rung", () => {
    expect(marketRowLabel({ state: "pending" }, 0)).toBe("sırada");
    expect(marketRowLabel({ state: "pending" }, 0, { live: { stage: "opening", requestId: "r", at: 1 } })).toBe("sekme açılıyor");
    expect(marketRowLabel(running({ phase: "text", stage: "typing" }), 0)).toBe("arama yazılıyor");
    expect(marketRowLabel(running({ phase: "text", stage: "loading" }), 0)).toBe("sayfa yükleniyor");
    expect(marketRowLabel(running({ phase: "text", stage: "settling", page: 2, received: 37 }), 37)).toBe("sonuçlar okunuyor · sayfa 2 · 37");
    expect(marketRowLabel(running({ phase: "text", rung: 1, received: 3 }), 3)).toBe("aranıyor · 2. sorgu · 3");
    expect(marketRowLabel(running({ phase: "image", stage: "image" }), 0)).toBe("görselle · görsel yükleniyor");
    expect(marketRowLabel(running({ phase: "detail" }), 0)).toBe("ilan okunuyor");
    // The live map only fills in while the orchestrator has no stage of its own.
    expect(marketRowLabel(running({ phase: "text", stage: "typing" }), 0, { live: { stage: "settling", requestId: "r", at: 1 } })).toBe("arama yazılıyor");
    expect(marketRowLabel(running({ phase: "text" }), 0, { live: { stage: "settling", requestId: "r", at: 1 } })).toBe("sonuçlar okunuyor");
  });
  it("done, cancelled, retrying and error states", () => {
    expect(marketRowLabel({ state: "done", received: 12, durationMs: 4200 }, 12)).toBe("12 sonuç · 4 sn");
    expect(marketRowLabel({ state: "done", received: 2, durationMs: 0, cancelled: true }, 2)).toBe("2 sonuç · 0 sn · durduruldu");
    expect(marketRowLabel({ state: "pending" }, 0, { retrying: true })).toBe("yeniden deneniyor");
    expect(marketRowLabel({ state: "error", type: "Network", message: "boom", retryable: true }, 0, { errorTitle: "Ağ hatası" })).toBe("Ağ hatası");
    expect(marketRowLabel({ state: "error", type: "Network", message: "boom", retryable: true }, 0, { retrying: true, errorTitle: "Ağ hatası" })).toBe("Ağ hatası");
  });
});

describe("MarketPanel (happy-dom)", () => {
  it("shows live phases, retrying rows, cancelled rows with a retry button and the queries sent", () => {
    useExtension.setState({ live: { "cn-taobao": { stage: "typing", requestId: "r1", at: Date.now() } } });
    const markets: Record<string, MarketStatus> = {
      "cn-1688": { state: "running", received: 5, phase: "text", rung: 1, stage: "settling", page: 2 },
      "cn-taobao": { state: "pending" },
      "tr-trendyol": { state: "done", received: 0, durationMs: 0, cancelled: true },
    };
    const onRetry = vi.fn();
    const input = { kind: "text" as const, query: "kablosuz kulaklık", perMarket: { "cn-1688": ["无线耳机", "wireless earbuds"] } };
    mount(<MarketPanel markets={markets} listings={{ "cn-1688": [1, 2, 3, 4, 5] }} onRetry={onRetry} running={false} retrying={["cn-taobao"]} trace={{ "cn-1688": { phases: ["text"], rung: 1, codes: [] } }} input={input} defaultOpen />);
    const label = (m: string) => host.querySelector(`[data-market-row="${m}"] [data-market-label]`)?.textContent;
    expect(label("cn-1688")).toBe("sonuçlar okunuyor · sayfa 2 · 2. sorgu · 5");
    expect(label("cn-taobao")).toBe("yeniden deneniyor");
    expect(label("tr-trendyol")).toBe("0 sonuç · 0 sn · durduruldu");
    expect(host.querySelector('[data-market-row="cn-1688"]')?.getAttribute("title")).toContain("sorgu: 无线耳机 → wireless earbuds");
    expect(text()).toContain("1 yeniden deneniyor");
    expect(text()).toContain("1 durduruldu");
    const retryBtn = host.querySelector('[data-market-row="tr-trendyol"] button');
    expect(retryBtn?.textContent).toBe("yeniden");
    click(retryBtn);
    expect(onRetry).toHaveBeenCalledWith("tr-trendyol");
    // A pending market with no orchestrator stage falls back to the extension's live stage.
    useExtension.setState({ live: { "cn-taobao": { stage: "opening", requestId: "r1", at: Date.now() } } });
    act(() => root?.render(<MemoryRouter><MarketPanel markets={markets} onRetry={onRetry} running={false} defaultOpen /></MemoryRouter>));
    expect(label("cn-taobao")).toBe("sekme açılıyor");
  });
});

/** A finished search with `n` listings spread over the three fake markets, set straight into the store. */
function seedResults(n: number, extra: Partial<ReturnType<typeof useSearch.getState>> = {}): SearchRecord {
  const ids = ["cn-1688", "cn-taobao", "tr-trendyol"] as const;
  const listings: Record<string, RawListing[]> = { "cn-1688": [], "cn-taobao": [], "tr-trendyol": [] };
  for (let i = 0; i < n; i++) {
    const m = ids[i % 3]!;
    listings[m]!.push(listing(m, `l${i}`, { title: `Kablosuz kulaklık model ${i} bluetooth ${i % 7 === 0 ? "pro" : "lite"}`, price: { currency: m === "tr-trendyol" ? "TRY" : "CNY", tiers: [{ minQty: 1, unitPrice: 10 + (i % 50) }] }, ...(i % 2 ? { images: ["https://img/x.jpg"] } : {}), ...(i % 5 === 0 ? { sold: i * 3 } : {}) }));
  }
  const markets: Record<string, MarketStatus> = {};
  for (const m of ids) markets[m] = { state: "done", received: listings[m]!.length, durationMs: 3000 };
  const input = { kind: "text" as const, query: "kablosuz kulaklık", perMarket: { "cn-1688": ["无线耳机"], "cn-taobao": ["无线耳机"] } };
  const current: SearchRecord = { id: "s1", input, markets: [...ids], startedAt: new Date(Date.now() - 5000).toISOString(), finishedAt: new Date().toISOString(), clusterCount: 0, status: "done", resultCount: n, durationMs: 5000 };
  useSearch.setState({ current, input, effective: input, listings, markets, clusters: [], similar: [], running: false, cancelled: false, retrying: [], error: undefined, storageNote: undefined, warning: undefined, notes: {}, noteCodes: {}, trace: { "cn-1688": { phases: ["text"], rung: 0, codes: [] } }, fingerprintPending: 0, ...extra });
  return current;
}

describe("Results page (happy-dom)", () => {
  it("renders 650 listings paged (60 cards first) within budget and memoises relevance", () => {
    seedResults(650);
    const t0 = performance.now();
    mount(<Results />, "/search/s1");
    const first = performance.now() - t0;
    console.info(`Results first render with 650 listings: ${first.toFixed(0)} ms`);
    expect(host.querySelectorAll("[data-card]").length).toBe(60);
    expect(text()).toContain("650 sonuç");
    expect(text()).toContain("Daha fazla göster (590)");
    // Budget: well under what a user would notice; the 60-card grid plus analysis must not scale with 650.
    expect(first).toBeLessThan(4000);
    // Paging in another 60 cards is a small incremental render.
    const more = [...host.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Daha fazla göster"));
    const t1 = performance.now();
    click(more ?? null);
    const second = performance.now() - t1;
    expect(host.querySelectorAll("[data-card]").length).toBe(120);
    expect(second).toBeLessThan(first + 500);
  });

  it("shows the cancelled state with 'Kalanları yeniden dene', the storage note, a warning and the search-level error", async () => {
    seedResults(6, {
      cancelled: true,
      storageNote: "Yerel kayıt başarısız: sonuçlar bu sekmede görünür ama geçmişe yazılamadı.",
      warning: "sorgu parmak izi çıkarılamadı",
      markets: { "cn-1688": { state: "done", received: 2, durationMs: 1000 }, "cn-taobao": { state: "done", received: 0, durationMs: 0, cancelled: true }, "tr-trendyol": { state: "error", type: "Network", message: "x", retryable: true } },
    });
    const retryRemaining = vi.fn(async () => undefined);
    useSearch.setState({ retryRemaining });
    mount(<Results />, "/search/s1");
    expect(host.querySelector('[data-banner="cancelled"]')?.textContent).toContain("Arama durduruldu.");
    expect(host.querySelector('[data-banner="cancelled"]')?.textContent).toContain("2 pazar tamamlanmadı.");
    expect(host.querySelector('[data-banner="storage"]')?.textContent).toContain("Yerel kayıt başarısız");
    expect(host.querySelector('[data-banner="warning"]')?.textContent).toContain("parmak izi");
    const btn = [...host.querySelectorAll("button")].find((b) => b.textContent === "Kalanları yeniden dene (2)");
    expect(btn).toBeTruthy();
    click(btn ?? null);
    expect(retryRemaining).toHaveBeenCalledTimes(1);
    // While retrying the button is disabled and the header names the markets.
    act(() => useSearch.setState({ retrying: ["cn-taobao"] }));
    const busy = [...host.querySelectorAll("button")].find((b) => b.textContent === "Yeniden deneniyor…");
    expect(busy?.hasAttribute("disabled")).toBe(true);
    expect(text()).toContain("yeniden deneniyor: Taobao");
    // Search-level error.
    act(() => useSearch.setState({ error: "Hiç pazar seçili değil.", cancelled: false, retrying: [] }));
    const err = host.querySelector('[data-banner="error"]')?.textContent ?? "";
    expect(err).toContain("Arama tamamlanamadı");
    expect(err).toContain("Hiç pazar seçili değil.");
    expect(err).toContain("Yeni arama");
    expect(host.querySelector('[data-banner="cancelled"]')).toBeNull();
    await flush(0);
  });

  it("'Ne arandı?' lists the rungs actually sent per market, dimming the ones that were not needed", () => {
    const input = { kind: "text" as const, query: "kablosuz kulaklık", perMarket: { "cn-1688": ["无线耳机", "wireless earbuds"], "cn-taobao": ["无线耳机", "wireless earbuds"] } };
    seedResults(3, { input, effective: input, trace: { "cn-1688": { phases: ["text"], rung: 1, codes: ["ladder-next"] }, "cn-taobao": { phases: ["text"], rung: 0, codes: [] } }, fingerprintPending: 2 });
    mount(<Results />, "/search/s1");
    const row = (m: string) => host.querySelector(`[data-query-row="${m}"]`);
    expect(row("cn-1688")?.querySelectorAll("[data-tried]").length).toBe(2);
    expect(row("cn-1688")?.querySelectorAll("[data-untried]").length).toBe(0);
    expect(row("cn-taobao")?.querySelectorAll("[data-tried]").length).toBe(1);
    expect(row("cn-taobao")?.querySelector("[data-untried]")?.textContent).toContain("wireless earbuds");
    // Turkish market searched the query as typed.
    expect(row("tr-trendyol")?.textContent).toContain("kablosuz kulaklık");
    expect(text()).toContain("görsel karşılaştırma: 2 ilan bekliyor");
  });

  it("a resolved link search shows the resolved listing and the fan-out ladder", () => {
    const linkInput = { kind: "link" as const, url: "https://www.trendyol.com/x/kask-p-1" };
    const effective = { kind: "text" as const, query: "Stanley termos", perMarket: { "cn-1688": ["Stanley 保温杯"] } };
    const current = seedResults(2, { input: linkInput, effective, resolved: { market: "tr-trendyol", listing: { ...listing("tr-trendyol", "1", { title: "Stanley termos" }), attributes: {} } }, trace: {} });
    useSearch.setState({ current: { ...current, input: linkInput } });
    mount(<Results />, "/search/s1");
    expect(host.querySelector("h1")?.textContent).toBe("Stanley termos");
    expect(host.querySelector("[data-what-searched]")?.textContent).toContain("Bağlantı çözüldü: Trendyol · Stanley termos");
    expect(host.querySelector('[data-query-row="cn-1688"]')?.textContent).toContain("Stanley 保温杯");
  });
});

describe("ListingActions toasts (happy-dom)", () => {
  it("watch toggle and copy confirm with a toast", async () => {
    const l = listing("cn-1688", "w1", { url: "https://detail.1688.com/offer/w1.html" });
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    mount(<ListingActions listing={l} />);
    await waitFor(() => !!host.querySelector("button[aria-pressed]"));
    click(host.querySelector("button[aria-pressed]"));
    await waitFor(() => useToast.getState().toasts.length === 1);
    expect(useToast.getState().toasts[0]).toMatchObject({ text: "İzlemeye alındı", tone: "success", action: { label: "İzleme listesi", to: "/watchlist" } });
    expect(useWatch.getState().has("cn-1688:w1")).toBe(true);
    click(host.querySelector("button[aria-pressed]"));
    await waitFor(() => useToast.getState().toasts.length === 2);
    expect(useToast.getState().toasts[1]?.text).toBe("İzleme kaldırıldı");
    click(host.querySelector('button[aria-label="Bağlantıyı kopyala"]'));
    await waitFor(() => useToast.getState().toasts.length === 3);
    expect(writeText).toHaveBeenCalledWith("https://detail.1688.com/offer/w1.html");
    expect(useToast.getState().toasts[2]?.text).toBe("Bağlantı kopyalandı");
  });
  it("copyText reports a refused clipboard instead of throwing", async () => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async () => { throw new Error("denied"); } }, configurable: true });
    expect(await copyText("x")).toBe(false);
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    expect(await copyText("x")).toBe(false);
  });
});
