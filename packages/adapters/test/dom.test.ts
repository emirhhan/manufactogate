// @vitest-environment happy-dom
import { detectLang, extractCards, extractJsonAfter, hostMatches, homeOriginFor, parseCount, parseMoney, parsePrice, readEmbedded, readJsonScript, readNextFlight, textOf, urlOnHosts, visibleText } from "../src";

describe("text parsing", () => {
  it("prices in CN and TR formats", () => {
    expect(parsePrice("¥12.50")).toBe(12.5);
    expect(parsePrice("12.5元")).toBe(12.5);
    expect(parsePrice("₺1.299,90")).toBe(1299.9);
    expect(parsePrice("1,299.00")).toBe(1299);
    expect(parsePrice("¥ 1.2万")).toBe(12000);
    expect(parsePrice("no price")).toBeNull();
  });
  it("prices with space / NBSP thousands separators (RU, FR, PL) and Indian lakh", () => {
    expect(parsePrice("2 325 ₽")).toBe(2325);
    expect(parsePrice("2\u00a0325\u00a0₽")).toBe(2325);
    expect(parsePrice("1 299,00 ₽")).toBe(1299);
    expect(parsePrice("10 000 000 ₽")).toBe(10_000_000);
    expect(parsePrice("12 €")).toBe(12);
    expect(parsePrice("7\u00a0300\u00a0₽")).toBe(7300);
    expect(parsePrice("333,86 TL")).toBe(333.86);
    expect(parsePrice("₹ 2.25 Lakh/Piece")).toBe(225000);
    expect(parsePrice("₹ 48,000.00")).toBe(48000);
    expect(parsePrice("Rp113.070")).toBe(113070);
    expect(parsePrice("29,610 원")).toBe(29610);
    expect(parsePrice("US$ 14.49 - 14.99")).toBe(14.49);
  });
  it("counts", () => {
    expect(parseCount("1.2万+人付款")).toBe(12000);
    expect(parseCount("已售 3000+")).toBe(3000);
    expect(parseCount("(12.4K)")).toBe(12400);
    expect(parseCount("2.345 Değerlendirme")).toBe(2345);
  });
  it("counts with Korean, Russian, Thai and Indonesian multipliers", () => {
    expect(parseCount("2.3천")).toBe(2300);
    expect(parseCount("1.5만")).toBe(15000);
    expect(parseCount("1,2 тыс.")).toBe(1200);
    expect(parseCount("5 тыс купили")).toBe(5000);
    expect(parseCount("1.2 พัน")).toBe(1200);
    expect(parseCount("10rb+")).toBe(10000);
    expect(parseCount("1,5jt")).toBe(1_500_000);
    expect(parseCount("本店已拼1.5万件")).toBe(15000);
    // A capital letter that starts a word is not a multiplier.
    expect(parseCount("1.234 Bewertungen")).toBe(1234);
    expect(parseCount("3 Beğeni")).toBe(3);
    expect(parseCount("15 pack")).toBe(15);
  });
  it("money with currency detection and ranges", () => {
    expect(parseMoney("US$ 14.49 - 14.99")).toEqual({ amount: 14.49, currency: "USD", max: 14.99 });
    expect(parseMoney("333,86 TL")).toEqual({ amount: 333.86, currency: "TRY" });
    expect(parseMoney("2 325 ₽")).toEqual({ amount: 2325, currency: "RUB" });
    expect(parseMoney("1,000円", { yenAs: "JPY" })).toEqual({ amount: 1000, currency: "JPY" });
    expect(parseMoney("¥58.00")).toEqual({ amount: 58, currency: "CNY" });
    expect(parseMoney("¥1,000", { yenAs: "JPY" })).toEqual({ amount: 1000, currency: "JPY" });
    expect(parseMoney("509", { fallback: "AED" })).toEqual({ amount: 509, currency: "AED" });
    expect(parseMoney("150 INR (Approx.)")).toEqual({ amount: 150, currency: "INR" });
    expect(parseMoney("no digits")).toBeNull();
  });
  it("guesses the script language of a title", () => {
    expect(detectLang("摩托车头盔女男机车全盔")).toBe("zh");
    expect(detectLang("Çelik cetvel kalınlaşmış paslanmaz çelik cetvel")).toBe("tr");
    expect(detectLang("كبسولات غسل الأطباق")).toBe("ar");
    expect(detectLang("Капсулы для стирки белья")).toBe("ru");
    expect(detectLang("Wireless earbuds with ANC")).toBe("en");
    expect(detectLang("ワイヤレスイヤホン")).toBe("ja");
    expect(detectLang("")).toBeNull();
  });
  it("balanced json after marker", () => {
    const src = 'window.__X__ = {"a":{"b":[1,2,{"c":"}"}]},"d":"x"};window.y=1';
    expect(JSON.parse(extractJsonAfter(src, "window.__X__")!)).toEqual({ a: { b: [1, 2, { c: "}" }] }, d: "x" });
  });
});

describe("host matching", () => {
  it("matches wildcard patterns to the base host and subdomains only", () => {
    expect(hostMatches("www.amazon.com", "*.amazon.com")).toBe(true);
    expect(hostMatches("amazon.com", "*.amazon.com")).toBe(true);
    expect(hostMatches("www.amazon.com.tr", "*.amazon.com")).toBe(false);
    expect(hostMatches("notamazon.com", "*.amazon.com")).toBe(false);
    expect(hostMatches("auctions.yahoo.co.jp", "auctions.yahoo.co.jp")).toBe(true);
    expect(hostMatches("auctions.yahoo.co.jp", "*.auctions.yahoo.co.jp")).toBe(true);
    expect(hostMatches("page.auctions.yahoo.co.jp", "*.auctions.yahoo.co.jp")).toBe(true);
    expect(urlOnHosts("https://www.amazon.com.tr/dp/B0ABCDEFGH", ["*.amazon.com"])).toBe(false);
    expect(urlOnHosts("//detail.1688.com/offer/1.html", ["*.1688.com"])).toBe(true);
    expect(urlOnHosts("/relative/path", ["*.1688.com"])).toBe(false);
  });
  it("derives a literal home origin from the search URL, never from a wildcard host", () => {
    expect(homeOriginFor(["*.auctions.yahoo.co.jp"], "https://auctions.yahoo.co.jp/search/search?p=x")).toBe("https://auctions.yahoo.co.jp/");
    expect(homeOriginFor(["*.alibaba.com"], "https://www.alibaba.com/trade/search?SearchText=x")).toBe("https://www.alibaba.com/");
  });
});

describe("textOf", () => {
  it("keeps sibling values apart but joins inline highlights", () => {
    document.body.innerHTML = `<div id="a"><span>¥129.00</span><span>3000+</span></div>
      <div id="b"><span>全球通 s<font color="red">m</font><font color="red">a</font>rt<font color="red">W</font>atch 手表</span></div>
      <div id="c"><b>Price</b> <span>$10</span></div>
      <div id="d"><span class="highlight">头盔</span>男女</div>`;
    expect(textOf(document.getElementById("a"))).toBe("¥129.00 3000+");
    expect(textOf(document.getElementById("b"))).toBe("全球通 smartWatch 手表");
    expect(textOf(document.getElementById("c"))).toBe("Price $10");
    expect(textOf(document.getElementById("d"))).toBe("头盔男女");
  });
  it("skips strike-through prices when asked and hidden/script nodes in visibleText", () => {
    document.body.innerHTML = `<div id="p"><ins>795 ₽</ins><del>7 300 ₽</del></div><script>var x="SECRET"</script><div style="display:none">hidden text</div><p>shown</p>`;
    expect(textOf(document.getElementById("p"), { skip: "del" })).toBe("795 ₽");
    const vis = visibleText(document);
    expect(vis).toContain("shown");
    expect(vis).not.toContain("SECRET");
    expect(vis).not.toContain("hidden text");
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
    expect(a.priceCurrency).toBe("CNY");
    expect(a.sold).toBe(12000);
    expect(a.shop).toBe("深圳市甲公司");
    expect(a.badges).toEqual(["源头工厂"]);
    const b = cards.find((c) => c.id === "222")!;
    expect(b.price).toBe(3.8);
    expect(b.sold).toBe(300);
    expect(b.url).toBe("https://detail.1688.com/offer/222.html");
  });
  it("takes the title from a second anchor when the first is image-only (Ozon pattern)", () => {
    document.body.innerHTML = `
      <div class="tile"><a href="/product/noski-3569085408/"><img src="https://img/x.jpg"></a>
        <span class="tsHeadline500Medium">606 ₽</span><span>1 200 ₽</span>
        <a href="/product/noski-3569085408/"><span class="tsBody500Medium">Носки мужские, 10 пар</span></a></div>`;
    const cards = extractCards(document, { link: /\/product\/[^"?#]*?(\d{6,})\/?(?:[?#]|$)/, price: /(\d[\d ]*)\s?₽/, priceSelectors: [".tsHeadline500Medium"] }, "https://www.ozon.ru/");
    expect(cards).toHaveLength(1);
    expect(cards[0]!.title).toBe("Носки мужские, 10 пар");
    expect(cards[0]!.price).toBe(606);
    expect(cards[0]!.priceCurrency).toBe("RUB");
  });
  it("reads the current price from a selector, ignores strike-through and badge images, strips badge prefixes", () => {
    document.body.innerHTML = `
      <article><a href="https://www.wildberries.ru/catalog/1354389476/detail.aspx" aria-label="ботинки зимние"></a>
        <img src="https://cdn/badge-icon.png" width="20" alt="icon"><img src="data:image/png;base64,AAAA" alt="placeholder"><img src="https://cdn/vol1/1354389476/1.webp" alt="ботинки зимние">
        <span class="text__price-title for-a11y">쿠폰적용가</span>
        <ins data-testid="product-card-current-price">2&nbsp;325&nbsp;₽</ins><del>7&nbsp;300&nbsp;₽</del>
        <h3><span class="badge">Popüler seçimler</span> Kaymaz Uç Seti</h3></article>`;
    const [c] = extractCards(
      document,
      { link: /\/catalog\/(\d+)\/detail/, price: /(\d[\d ]*)\s?₽/, priceSelectors: ["ins[data-testid='product-card-current-price']"], titleSelectors: ["h3"], titlePrefixes: ["Popüler seçimler"] },
      "https://www.wildberries.ru/",
    );
    expect(c!.price).toBe(2325);
    expect(c!.priceText).toContain("2 325");
    expect(c!.image).toBe("https://cdn/vol1/1354389476/1.webp");
    expect(c!.title).toBe("Kaymaz Uç Seti");
  });
  it("does not pick an a11y price label as the title and falls back to a bare number price", () => {
    document.body.innerHTML = `
      <li><a href="https://item.gmarket.co.kr/Item?goodscode=4814731104"><div class="text__name">크리넥스 3겹 데코</div>
        <div class="box__price--coupon"><span class="text__item--title"><span class="text__price-title for-a11y">쿠폰적용가</span></span><del class="text__price">30,000</del><span class="text__price">29,610</span><span class="text__unit">원</span></div></a></li>
      <div data-qa="plp-product-box"><a href="/uae-en/x/N70371876V/p/"><h2 data-qa="product-box-name" title="Google Fitbit Air">Google Fitbit Air</h2><strong class="_amount_x">509</strong></a></div>`;
    const g = extractCards(document, { link: /goodscode=(\d+)/i, price: /([\d,]+)\s?원/, priceSelectors: ["span.text__price"], titleSelectors: ["[class*='title' i]", ".text__name"] }, "https://www.gmarket.co.kr/");
    expect(g[0]!.title).toBe("크리넥스 3겹 데코");
    expect(g[0]!.price).toBe(29610);
    const n = extractCards(document, { link: /\/(N\d{6,}V)\/p\//, price: /AED\s?([\d,]+)/, priceSelectors: ["strong[class*='_amount_']"], currency: "AED" }, "https://www.noon.com/");
    expect(n[0]!.price).toBe(509);
    expect(n[0]!.priceCurrency).toBe("AED");
    expect(n[0]!.title).toBe("Google Fitbit Air");
  });
  it("concatenates split price groups and reads MOQ, years and rating counts", () => {
    document.body.innerHTML = `<div class="tile-item"><a href="/product/detail/967840030.html"><div class="product-name">智能手表</div>
      <div class="price"><span class="f18">58</span> <span class="f12">.00</span> <span>元</span> <span class="start-number">500个起购</span></div></a><span class="year">2年</span><span>(345)</span></div>`;
    const [c] = extractCards(
      document,
      { link: /\/product\/detail\/(\d+)\.html/, price: /(\d+)\s*(\.\d{1,2})?\s*元/, priceSelectors: [".price"], moq: /(\d+)\s*个起购/, years: /(?<!\d)(\d{1,2})年/, ratingCount: /\((\d+)\)/ },
      "https://www.yiwugo.com/",
    );
    expect(c!.price).toBe(58);
    expect(c!.moq).toBe(500);
    expect(c!.supplierYears).toBe(2);
    expect(c!.ratingCount).toBe(345);
    expect(c!.sold).toBeNull();
  });
  it("reads embedded window state, JSON scripts and RSC flight chunks", () => {
    document.body.innerHTML = `<script>var x=1;</script><script>window.__STATE__ = {"products":[{"id":1}]};</script>
      <script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"n":2}}}</script>
      <script>self.__next_f.push([1,"12:[\\"$\\",{\\"initialProducts\\":[{\\"id\\":7}]}]\\n"])</script>`;
    expect(readEmbedded(document, ["window.__STATE__", "__STATE__"])).toEqual({ products: [{ id: 1 }] });
    expect(readEmbedded(document, ["window.__NOPE__"])).toBeNull();
    expect(readJsonScript(document, "#__NEXT_DATA__")).toEqual({ props: { pageProps: { n: 2 } } });
    const flight = readNextFlight(document);
    expect(flight).toContain('"initialProducts":[{"id":7}]');
    expect(JSON.parse(extractJsonAfter(flight, '"initialProducts":')!)).toEqual([{ id: 7 }]);
  });
});
