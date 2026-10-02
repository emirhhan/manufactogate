// @vitest-environment happy-dom
import { extractCards, extractJsonAfter, parseCount, parsePrice, readEmbedded } from "../src";

describe("text parsing", () => {
  it("prices in CN and TR formats", () => {
    expect(parsePrice("¥12.50")).toBe(12.5);
    expect(parsePrice("12.5元")).toBe(12.5);
    expect(parsePrice("₺1.299,90")).toBe(1299.9);
    expect(parsePrice("1,299.00")).toBe(1299);
    expect(parsePrice("¥ 1.2万")).toBe(12000);
    expect(parsePrice("no price")).toBeNull();
  });
  it("counts", () => {
    expect(parseCount("1.2万+人付款")).toBe(12000);
    expect(parseCount("已售 3000+")).toBe(3000);
    expect(parseCount("(12.4K)")).toBe(12400);
    expect(parseCount("2.345 Değerlendirme")).toBe(2345);
  });
  it("balanced json after marker", () => {
    const src = 'window.__X__ = {"a":{"b":[1,2,{"c":"}"}]},"d":"x"};window.y=1';
    expect(JSON.parse(extractJsonAfter(src, "window.__X__")!)).toEqual({ a: { b: [1, 2, { c: "}" }] }, d: "x" });
  });
});

describe("card extraction", () => {
  it("finds cards by product link and reads fields", () => {
    document.body.innerHTML = `
      <div class="list">
        <div class="card"><a href="https://detail.1688.com/offer/111.html" title="A ürünü"><img data-src="//img.example/a.jpg" width="200"></a>
          <div class="p">¥12.50</div><div class="s">成交 1.2万件</div><div class="shop">深圳市甲公司</div><span>源头工厂</span></div>
        <div class="card"><a href="//detail.1688.com/offer/222.html">B ürünü</a><div>¥3.80</div><div>已售 300+</div></div>
        <a href="https://detail.1688.com/offer/111.html">dup</a>
      </div>`;
    const cards = extractCards(document, { link: /detail\.1688\.com\/offer\/(\d+)\.html/, shopSelectors: [".shop"], badgeWords: ["源头工厂"] }, "https://s.1688.com/");
    expect(cards).toHaveLength(2);
    const a = cards.find((c) => c.id === "111")!;
    expect(a.title).toBe("A ürünü");
    expect(a.image).toBe("https://img.example/a.jpg");
    expect(a.price).toBe(12.5);
    expect(a.sold).toBe(12000);
    expect(a.shop).toBe("深圳市甲公司");
    expect(a.badges).toEqual(["源头工厂"]);
    const b = cards.find((c) => c.id === "222")!;
    expect(b.price).toBe(3.8);
    expect(b.sold).toBe(300);
    expect(b.url).toBe("https://detail.1688.com/offer/222.html");
  });
  it("reads embedded window state", () => {
    document.body.innerHTML = `<script>var x=1;</script><script>window.__STATE__ = {"products":[{"id":1}]};</script>`;
    expect(readEmbedded(document, ["window.__STATE__", "__STATE__"])).toEqual({ products: [{ id: 1 }] });
    expect(readEmbedded(document, ["window.__NOPE__"])).toBeNull();
  });
});
