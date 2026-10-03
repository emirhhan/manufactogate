import { clusterCandidates, confidenceBand, IncrementalClusterer, scoreMatch, type Fingerprint, type RawListing } from "../src";

const listing = (id: string, market: string, title: string, extra: Partial<RawListing> = {}): RawListing => ({
  market: market as RawListing["market"],
  id,
  url: `https://example/${id}`,
  title,
  images: [],
  price: { currency: "CNY", tiers: [{ minQty: 1, unitPrice: 10 }] },
  badges: [],
  fetchedAt: "2026-01-01T00:00:00Z",
  ...extra,
});
const band = (a: Fingerprint, b: Fingerprint) => confidenceBand(scoreMatch(a, b).score);
const t = (title: string, extra: Partial<Fingerprint> = {}): Fingerprint => ({ title, ...extra });

describe("scoreMatch", () => {
  it("identical phash and title scores as same", () => {
    const fp = { phash: "ffff0000ffff0000", title: "Wireless earbuds TWS-X15" };
    const m = scoreMatch(fp, { ...fp });
    expect(m.score).toBeGreaterThanOrEqual(0.85);
    expect(confidenceBand(m.score)).toBe("same");
    expect(m.reasons[0]).toBe("model numarası eşleşti");
  });
  it("unrelated hash and title is hidden", () => {
    const m = scoreMatch({ phash: "ffff0000ffff0000", title: "Wireless earbuds" }, { phash: "0f0f0f0f0f0f0f0f", title: "Garden hose 20m" });
    expect(confidenceBand(m.score)).toBe("hidden");
  });
  it("clip similarity is stretched from 0.5..1", () => {
    const q = { clip: new Float32Array([1, 0]) };
    expect(scoreMatch(q, { clip: new Float32Array([1, 0]) }).signals.visualClip).toBeCloseTo(1);
    expect(scoreMatch(q, { clip: new Float32Array([0, 1]) }).signals.visualClip).toBe(0);
  });
  it("a short query contained in a long title is likely, not hidden (overlap coefficient)", () => {
    expect(band(t("kablosuz kulaklık"), t("Xiaomi Redmi Buds 4 Pro Kablosuz Kulaklık Bluetooth 5.3 Siyah Orijinal Garantili"))).toBe("likely");
    expect(band(t("wireless earbuds"), t("Soundcore by Anker P20i True Wireless Earbuds, 10mm Drivers with Big Bass, Bluetooth 5.3"))).toBe("likely");
    expect(band(t("motosiklet kaskı"), t("LS2 RAPID 2 RACE MAT SİYAH KASK"))).toBe("similar");
  });
  it("text alone never reaches 'same' without a model or phrase match", () => {
    const m = scoreMatch(t("kablosuz kulaklık"), t("kablosuz kulaklık"));
    expect(m.score).toBeLessThan(0.85);
  });
  it("cross-language: altTitles bridge Turkish query and Chinese title", () => {
    expect(band(t("kablosuz kulaklık"), t("无线蓝牙耳机"))).toBe("hidden");
    expect(band(t("kablosuz kulaklık", { altTitles: ["无线耳机"] }), t("无线蓝牙耳机"))).toBe("similar");
    expect(band(t("Xiaomi Redmi Buds 4 Pro"), t("小米 Redmi Buds 4 Pro 无线蓝牙耳机"))).toBe("same");
  });
  it("category keys lift or cut the score", () => {
    const up = scoreMatch(t("kablosuz kulaklık", { category: "kablosuz-kulaklik", altTitles: ["无线耳机"] }), t("无线蓝牙耳机", { category: "kablosuz-kulaklik" }));
    expect(up.signals.categoryMatch).toBe(true);
    expect(confidenceBand(up.score)).toBe("likely");
    const down = scoreMatch(t("kask", { category: "kask" }), t("kask çantası", { category: "canta" }));
    expect(down.signals.categoryMatch).toBe(false);
    expect(down.reasons).toContain("farklı kategori");
  });
  it("accessories of the queried product are penalised, even with a model hit", () => {
    const a = scoreMatch(t("Redmi Buds 4 Pro"), t("Redmi Buds 4 Pro kılıf"));
    expect(a.signals.accessory).toBe(true);
    expect(["hidden", "similar"]).toContain(confidenceBand(a.score));
    expect(a.reasons).toContain("aksesuar/parça görünüyor");
    expect(["hidden", "similar"]).toContain(band(t("LS2 RAPID 2 kask"), t("LS2 RAPID 2 vizör")));
    expect(["hidden", "similar"]).toContain(band(t("Philips Airfryer HD9252"), t("HD9252 filtre")));
    // Both sides accessories: no penalty.
    expect(scoreMatch(t("iphone 15 kılıf"), t("iPhone 15 Kılıf Şeffaf")).signals.accessory).toBeUndefined();
  });
  it("unit tokens are not model numbers and attribute mismatches halve the score", () => {
    const same = scoreMatch(t("Xiaomi powerbank 20000mAh"), t("Anker powerbank 20000mAh"));
    expect(same.signals.modelNumberHit).toBe(false);
    expect(confidenceBand(same.score)).not.toBe("same");
    const diff = scoreMatch(t("termos 500ml"), t("termos 1000ml"));
    expect(diff.signals.attributeMismatch).toBe(true);
    expect(diff.reasons.some((r) => r.startsWith("kapasite farklı"))).toBe(true);
    expect(confidenceBand(diff.score)).not.toBe("same");
    const agree = scoreMatch(t("Stanley Quencher 1.18L"), t("Stanley Quencher 40oz tumbler"));
    expect(agree.signals.attributeAgree).toBe(true);
  });
  it("brand+model phrase: exact lifts, variant caps at likely", () => {
    const exact = scoreMatch(t("Xiaomi Redmi Buds 4 Pro"), t("Redmi Buds 4 Pro Kablosuz Kulaklık"));
    expect(exact.signals.phrase).toBe("exact");
    expect(exact.reasons[0]).toBe("marka ve model birebir");
    const variant = scoreMatch(t("Nike Air Max 270"), t("Nike Air Max 270 React"));
    expect(variant.signals.phrase).toBe("variant");
    expect(variant.reasons).toContain("varyant olabilir");
    expect(confidenceBand(variant.score)).toBe("likely");
  });
  it("a model hit with a contradicting image is only likely", () => {
    const m = scoreMatch({ title: "Philips HD9252", phash: "ffff0000ffff0000" }, { title: "Philips HD9252 airfryer", phash: "0000ffff0000ffff" });
    expect(confidenceBand(m.score)).toBe("likely");
    expect(m.reasons[0]).toBe("model numarası eşleşti, görsel farklı");
  });
  it("symmetric mode has no image-search floor and is order independent", () => {
    const a = scoreMatch({ title: "a b" }, { title: "c d", viaImageSearch: true });
    expect(a.score).toBe(0.6);
    const s1 = scoreMatch({ title: "a b" }, { title: "c d", viaImageSearch: true }, { symmetric: true }).score;
    const s2 = scoreMatch({ title: "c d", viaImageSearch: true }, { title: "a b" }, { symmetric: true }).score;
    expect(s1).toBe(0);
    expect(s2).toBe(s1);
    expect(scoreMatch({ title: "a b" }, { title: "c d", viaImageSearch: true }, { symmetric: true }).reasons).not.toContain("pazarın görsel araması eşleştirdi");
  });
  it("tolerates hash length mismatch instead of throwing", () => {
    expect(() => scoreMatch({ phash: "ffff0000ffff0000", title: "x" }, { phash: "ffff0000", title: "x" })).not.toThrow();
    const m = scoreMatch({ phash: "ffff0000ffff0000", title: "x" }, { phash: "ffff0000", title: "x" });
    expect(m.signals.visualPhash).toBeUndefined();
  });
  it("caches tokens on the fingerprint object", () => {
    const fp: Fingerprint = { title: "Xiaomi Redmi Buds 4 Pro" };
    scoreMatch(fp, { title: "x" });
    expect(fp.tokens).toBeDefined();
    expect(fp.phrase).toBe("xiaomi redmi buds 4 pro");
  });
});

describe("image-search floor", () => {
  it("lifts market image-search hits to likely when our signals are weak", () => {
    const m = scoreMatch({ title: "x" }, { title: "完全不同的标题", viaImageSearch: true });
    expect(confidenceBand(m.score)).toBe("likely");
    expect(m.reasons).toContain("pazarın görsel araması eşleştirdi");
  });
  it("does not lift accessories", () => {
    const m = scoreMatch({ title: "LS2 kask" }, { title: "LS2 kask vizör", viaImageSearch: true });
    expect(confidenceBand(m.score)).not.toBe("likely");
  });
});

describe("clusterCandidates", () => {
  it("groups near-identical candidates and separates similar ones", () => {
    const q = { phash: "ffff0000ffff0000", title: "Wireless earbuds TWS-X15" };
    const { clusters, similar } = clusterCandidates(q, [
      { listing: listing("a", "cn-1688", "TWS-X15 wireless earbuds"), fingerprint: { ...q } },
      { listing: listing("b", "cn-taobao", "TWS-X15 earbuds wireless"), fingerprint: { ...q } },
      { listing: listing("c", "cn-pinduoduo", "earbuds wireless TWS-X10"), fingerprint: { phash: "ffff0000f0f00f0f", title: "earbuds wireless TWS-X10" } },
      { listing: listing("d", "cn-1688", "garden hose"), fingerprint: { phash: "0f0f0f0f0f0f0f0f", title: "garden hose" } },
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.members.map((m) => m.listing.id).sort()).toEqual(["a", "b"]);
    expect(clusters[0]!.markets.sort()).toEqual(["cn-1688", "cn-taobao"]);
    expect(similar.map((s) => s.listing.id)).toEqual(["c"]);
  });
  it("normalises pack quantities in the price range", () => {
    const q = { title: "usb kablo" };
    const { clusters } = clusterCandidates(q, [
      { listing: listing("a", "cn-1688", "usb kablo", { price: { currency: "CNY", tiers: [{ minQty: 1, unitPrice: 2 }] } }), fingerprint: { title: "usb kablo" } },
      { listing: listing("b", "cn-taobao", "10 adet usb kablo", { packQty: 10, price: { currency: "CNY", tiers: [{ minQty: 1, unitPrice: 15 }] } }), fingerprint: { title: "10 adet usb kablo" } },
    ]);
    expect(clusters[0]!.priceRange["CNY"]).toEqual({ min: 1.5, max: 2 });
  });
});

describe("IncrementalClusterer", () => {
  const q = { phash: "ffff0000ffff0000", title: "Wireless earbuds TWS-X15" };
  it("keeps the cluster id anchored to the earliest member while the representative changes", () => {
    const c = new IncrementalClusterer(q);
    c.add({ listing: listing("a", "cn-1688", "X15 earbuds"), fingerprint: { title: "X15 earbuds", phash: "ffff0000ffff00f0" } }, 0);
    const first = c.snapshot();
    expect(first.clusters[0]!.id).toBe("cn-1688:a");
    c.add({ listing: listing("b", "cn-taobao", "Wireless earbuds TWS-X15"), fingerprint: { ...q } }, 1);
    const second = c.snapshot();
    expect(second.clusters).toHaveLength(1);
    expect(second.clusters[0]!.id).toBe("cn-1688:a");
    expect(second.clusters[0]!.representativeKey).toBe("cn-taobao:b");
    expect(second.clusters[0]!.representative.listing.id).toBe("b");
  });
  it("re-scores a candidate whose fingerprint changed in place", () => {
    const c = new IncrementalClusterer(q);
    const fp: Fingerprint = { title: "完全不同的标题" };
    c.add({ listing: listing("z", "cn-1688", "完全不同的标题"), fingerprint: fp }, 0);
    expect(c.snapshot().clusters).toHaveLength(0);
    fp.phash = q.phash;
    c.markDirty(0);
    expect(c.snapshot().clusters).toHaveLength(1);
  });
  it("groups similar candidates by category key", () => {
    const c = new IncrementalClusterer({ title: "motosiklet kaskı" });
    c.add({ listing: listing("a", "tr-trendyol", "LS2 RAPID 2 MAT SİYAH KASK"), fingerprint: { title: "LS2 RAPID 2 MAT SİYAH KASK", category: "kask" } }, 0);
    c.add({ listing: listing("b", "tr-trendyol", "Boks Eldiveni"), fingerprint: { title: "Boks Eldiveni" } }, 1);
    const snap = c.snapshot();
    expect(snap.similarByCategory["kask"]?.map((s) => s.listing.id)).toEqual(["a"]);
  });
});
