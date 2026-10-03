import { act } from "react";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { Feed } from "../src/pages/Feed";
import { priceRangeText } from "../src/pages/Product";
import { amountOrNull, pctToRate, presetMarkets } from "../src/pages/Settings";
import { LEGACY_MARKET_IDS, linkRoute, migrateMarketIds, resolveAnyMarket } from "../src/lib/markets";
import { getRegistry, setRegistryForTests } from "../src/lib/registry";
import { useSearch } from "../src/store/search";
import { useSettings, VERIFIED_MARKETS } from "../src/store/settings";
import { fakeAdapter, flush, registryOf, waitFor } from "./helpers";

const TY = "https://www.trendyol.com/endro/kask-p-963258390?boutiqueId=61&merchantId=1033437";

describe("link routing (overlay → app)", () => {
  it("linkRoute: recognised listing → /l/resolve with compare, other URLs → text search, non-URLs → null", () => {
    const resolve = (u: string) => (u.includes("trendyol") ? { adapter: { id: "tr-trendyol" as const } } : null);
    expect(linkRoute(TY, resolve)).toEqual({ kind: "listing", to: `/l/resolve/${encodeURIComponent(TY)}?compare=1`, market: "tr-trendyol" });
    expect(linkRoute("https://example.org/x", resolve)).toEqual({ kind: "text", query: "https://example.org/x" });
    expect(linkRoute("kask", resolve)).toBeNull();
    expect(linkRoute("  " + TY + " ", resolve)?.kind).toBe("listing");
  });
  it("resolveAnyMarket falls back to the real market definitions before the extension is detected", () => {
    const none = { resolve: () => null };
    expect(resolveAnyMarket(TY, none)?.adapter.id).toBe("tr-trendyol");
    expect(resolveAnyMarket("https://www.mercari.com/us/item/m29966601812/", none)?.adapter.id).toBe("us-mercari");
    expect(resolveAnyMarket("https://example.org/x", none)).toBeNull();
    const live = { resolve: () => ({ adapter: { id: "cn-1688" as const } }) };
    expect(resolveAnyMarket("https://example.org/x", live)?.adapter.id).toBe("cn-1688");
  });
  it("migrates legacy ids", () => {
    expect(LEGACY_MARKET_IDS["jp-mercari"]).toBe("us-mercari");
    expect(migrateMarketIds(["jp-mercari", "us-mercari", "cn-1688"])).toEqual(["us-mercari", "cn-1688"]);
  });
});

describe("Feed ?link= hand-off (happy-dom)", () => {
  let root: Root | null = null;
  let host: HTMLElement;
  let path = "";
  function Probe() {
    const loc = useLocation();
    path = loc.pathname + loc.search;
    return null;
  }
  const mount = (entry: string) => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root!.render(
        createElement(
          MemoryRouter,
          { initialEntries: [entry] },
          createElement(Probe),
          createElement(Routes, null, createElement(Route, { path: "/", element: createElement(Feed) }), createElement(Route, { path: "/l/:market/:id", element: createElement("div", { "data-testid": "listing" }, "listing") }), createElement(Route, { path: "/search/:id", element: createElement("div", { "data-testid": "results" }, "results") })),
        ),
      );
    });
  };
  beforeEach(() => {
    window.scrollTo = () => undefined;
    setRegistryForTests(registryOf(fakeAdapter("cn-1688"), fakeAdapter("tr-trendyol", { country: "tr", role: "target" })));
    useSettings.setState({ enabledMarkets: ["cn-1688", "tr-trendyol"], hydrated: true });
  });
  afterEach(() => {
    act(() => root?.unmount());
    host.remove();
    setRegistryForTests(null);
  });
  it("a recognised listing link is forwarded to /l/resolve/<url>?compare=1", async () => {
    mount(`/?link=${encodeURIComponent(TY)}`);
    await waitFor(() => path.startsWith("/l/resolve/"));
    expect(path).toBe(`/l/resolve/${encodeURIComponent(TY)}?compare=1`);
    expect(host.querySelector("[data-testid=listing]")).not.toBeNull();
  });
  it("an unknown link starts a text search with the URL and lands on the results page", async () => {
    const start = vi.fn(async () => "sid-1");
    useSearch.setState({ start, running: false });
    mount(`/?link=${encodeURIComponent("https://example.org/some-product")}`);
    await waitFor(() => path.startsWith("/search/"));
    expect(start).toHaveBeenCalledWith({ kind: "text", query: "https://example.org/some-product" }, ["cn-1688", "tr-trendyol"]);
    expect(path).toBe("/search/sid-1");
  });
  it("a non-URL link parameter is dropped and the feed renders", async () => {
    mount("/?link=kask");
    await flush(20);
    expect(path).toBe("/");
    expect(getRegistry().all().length).toBe(2);
  });
});

describe("Product price guard", () => {
  it("never yields Infinity for price-on-request listings", () => {
    expect(priceRangeText({ currency: "USD", tiers: [] })).toBe("Fiyat teklifle");
    expect(priceRangeText({ currency: "CNY", tiers: [{ minQty: 1, unitPrice: 10 }] })).not.toContain("Infinity");
    expect(priceRangeText({ currency: "CNY", tiers: [{ minQty: 1, unitPrice: 10 }, { minQty: 100, unitPrice: 8 }] })).toContain(" – ");
  });
});

describe("Settings helpers", () => {
  it("percent and amount inputs map to override patches, empty clears", () => {
    expect(pctToRate("18")).toBe(0.18);
    expect(pctToRate("12,5")).toBe(0.125);
    expect(pctToRate("")).toBeNull();
    expect(pctToRate("100")).toBeNull();
    expect(pctToRate("-1")).toBeNull();
    expect(amountOrNull("4000")).toBe(4000);
    expect(amountOrNull("")).toBeNull();
    expect(amountOrNull("abc")).toBeNull();
  });
  it("'Çalışanlar' preset falls back to the verified nine when no health round ran", () => {
    const all = VERIFIED_MARKETS.concat(["cn-pinduoduo", "us-mercari"]).map((id) => ({ id, meta: { version: id === "cn-1688" ? "1.0.0" : "0.1.0-beta", country: "cn", role: "source" as const } })) as never;
    expect(presetMarkets("working", all, {}, "tr")).toEqual(VERIFIED_MARKETS);
    expect(presetMarkets("working", all, { "us-mercari": { ok: true, checkedAt: "" } }, "tr")).toEqual(["us-mercari"]);
  });
});
