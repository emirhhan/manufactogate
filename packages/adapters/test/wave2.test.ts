// @vitest-environment happy-dom
import { PAGE_EXTRACTORS, REAL_DEF_BY_ID, WAVE2_DEFS, type SearchItem } from "../src";

describe("wave-2 beta markets", () => {
  it("resolve product links", () => {
    expect(REAL_DEF_BY_ID["cn-alibaba"]!.resolveLink("https://www.alibaba.com/product-detail/TWS-Earbuds_1600123456789.html?spm=x")?.listingId).toBe("1600123456789");
    expect(REAL_DEF_BY_ID["cn-aliexpress"]!.resolveLink("https://www.aliexpress.com/item/1005006123456789.html")?.listingId).toBe("1005006123456789");
    expect(REAL_DEF_BY_ID["tr-hepsiburada"]!.resolveLink("https://www.hepsiburada.com/kask-p-HBC00001ABCD?magaza=x")?.listingId).toBe("HBC00001ABCD");
    expect(REAL_DEF_BY_ID["tr-n11"]!.resolveLink("https://www.n11.com/urun/motosiklet-kaski-123456789")?.listingId).toBe("123456789");
    expect(REAL_DEF_BY_ID["tr-amazon"]!.resolveLink("https://www.amazon.com.tr/dp/B0ABCDEFGH/ref=x")?.listingId).toBe("B0ABCDEFGH");
    expect(WAVE2_DEFS.every((d) => d.meta.version.includes("beta"))).toBe(true);
  });
  it("parse generic cards with USD and TL prices", () => {
    document.body.innerHTML = `
      <div><a href="https://www.alibaba.com/product-detail/TWS_1600000000001.html"><h2>TWS Earbuds</h2><img src="https://s.alicdn.com/a.jpg" width="200"></a><span>US $2.50</span><span>1,200 sold</span><span class="supplier">Shenzhen Co</span><span>Verified Supplier</span></div>`;
    const a = PAGE_EXTRACTORS["cn-alibaba"]!.search!(document) as SearchItem[];
    expect(a).toHaveLength(1);
    expect(a[0]!.price).toBe(2.5);
    expect(a[0]!.sold).toBe(1200);
    expect(a[0]!.badges).toEqual(["Verified Supplier"]);
    document.body.innerHTML = `<div><a href="/urun/kask-p-HBC00001ABCD"><h3>Kask</h3></a><span>1.299,90 TL</span><span>(345)</span></div>`;
    const h = PAGE_EXTRACTORS["tr-hepsiburada"]!.search!(document) as SearchItem[];
    expect(h[0]!.price).toBe(1299.9);
    expect(h[0]!.sold).toBe(345);
  });
});
