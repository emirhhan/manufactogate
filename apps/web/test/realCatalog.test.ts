import { classifyTitle, countsOf, queryRealCatalog, type Classified } from "../src/lib/realCatalog";
import { listing } from "./helpers";

describe("classifyTitle", () => {
  it("matches Turkish, Chinese and English titles to the same leaf", () => {
    expect(classifyTitle("Kablosuz Kulaklık Bluetooth 5.3")?.key).toBe("kablosuz-kulaklik");
    expect(classifyTitle("无线蓝牙耳机 入耳式")?.key).toBe("kablosuz-kulaklik");
    expect(classifyTitle("TWS Wireless Earbuds with Charging Case")?.key).toBe("kablosuz-kulaklik");
    expect(classifyTitle("Kabellose Kopfhörer Bluetooth 5.3")?.key).toBe("kablosuz-kulaklik");
  });
  it("prefers the most specific label and handles suffixes", () => {
    expect(classifyTitle("Motosiklet Kaskı Full Face ECE")?.key).toBe("motosiklet-kaski");
    expect(classifyTitle("Erkek Kask Siyah")?.key).toBe("kask");
    expect(classifyTitle("Gözlüğü güneş polarize")?.key).toBe("gunes-gozlugu");
    expect(classifyTitle("Robot Vacuum Cleaner with Mop")?.key).toBe("robot-supurge");
  });
  it("does not file accessories under the main product", () => {
    expect(classifyTitle("Kask askısı duvar tipi")?.key).not.toBe("kask");
    expect(classifyTitle("Motosiklet kaskı vizörü şeffaf")).toBeNull();
    expect(classifyTitle("iPhone 15 telefon kılıfı silikon")?.key).toBe("telefon-kilifi");
    expect(classifyTitle("Phone case for Samsung S24")?.key).toBe("telefon-kilifi");
  });
  it("returns null for unknown or empty titles", () => {
    expect(classifyTitle("")).toBeNull();
    expect(classifyTitle("zzzz qqqq")).toBeNull();
  });
  it("classifies 2000 titles well under a second", () => {
    const titles = ["Kablosuz Kulaklık Bluetooth", "无线蓝牙耳机 入耳式", "Wireless Earbuds TWS", "Motosiklet Kaskı Full Face", "Airfryer 5L dijital", "Yoga Matı 6mm kaymaz", "Köpek tasması deri", "Smart Watch Men Waterproof", "Робот-пылесос с влажной уборкой", "ノートパソコン スタンド"];
    const t0 = performance.now();
    let n = 0;
    for (let i = 0; i < 2000; i++) if (classifyTitle(`${titles[i % titles.length]} ${i}`)) n++;
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(n).toBeGreaterThan(1500);
  });
});

describe("countsOf / queryRealCatalog", () => {
  const items: Classified[] = [
    { listing: listing("cn-1688", "a", { title: "a", sold: 5 }), leaf: { key: "kask", group: "moto", tr: "Kask", zh: "头盔", en: "helmet" }, margin: { sourceKey: "cn-1688:a", targetKey: "tr-trendyol:t", ratio: 3.2, matchScore: 0.9, targetPrice: 900, targetCurrency: "TRY" } },
    { listing: listing("cn-1688", "b", { title: "b", sold: 50 }), leaf: { key: "kask", group: "moto", tr: "Kask", zh: "头盔", en: "helmet" } },
    { listing: listing("cn-taobao", "c", { title: "c", sold: 1 }), leaf: null },
  ];
  it("counts groups and leaves", () => {
    expect(countsOf(items)).toEqual({ groupCounts: { moto: 2 }, leafCounts: { kask: 2 }, classified: 2, total: 3 });
  });
  it("margin sort puts matched listings first and reports how many have a ratio", () => {
    const page = queryRealCatalog(items, { sort: "margin" });
    expect(page.items.map((l) => l.id)[0]).toBe("a");
    expect(page.withMargin).toBe(1);
    expect(page.margins["cn-1688:a"]?.ratio).toBe(3.2);
    expect(queryRealCatalog(items, { sort: "popular" }).items.map((l) => l.id)).toEqual(["b", "a", "c"]);
    expect(queryRealCatalog(items, { leaf: "kask" }).total).toBe(2);
  });
});
