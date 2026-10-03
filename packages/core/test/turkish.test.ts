import { countMatchesTr, foldTr, matchesTr, stemCandidatesTr, stemTr, termVariants, wordsTr } from "../src";

describe("turkish search folding", () => {
  it("folds diacritics and dotted/dotless i", () => {
    expect(foldTr("Güneş Gözlüğü İstanbul")).toBe("gunes gozlugu istanbul");
  });
  it("softens final consonants", () => {
    expect(termVariants("gözlük")).toContain("gozlug");
    expect(termVariants("kitap")).toContain("kitab");
    // No truncated variants any more ("kılıf" must never become "kili").
    expect(termVariants("kılıf")).not.toContain("kili");
  });
  it("stems plural, possessive and accusative suffixes", () => {
    expect(stemTr("kaski")).toBe("kask");
    expect(stemCandidatesTr("gozlugu")).toEqual(expect.arrayContaining(["gozlug", "gozluk"]));
    expect(stemCandidatesTr("termosu")).toContain("termos");
    expect(stemCandidatesTr("kapisini")).toContain("kapi");
    expect(stemCandidatesTr("kulakliklari")).toEqual(expect.arrayContaining(["kulaklik"]));
    expect(stemTr("kamera")).toBe("kamera");
    expect(stemTr("elbise")).toBe("elbise");
    expect(stemTr("s24")).toBe("s24");
  });
  it("matches inflected category names", () => {
    expect(matchesTr("Güneş Gözlüğü 太阳镜", "gözlük")).toBe(true);
    expect(matchesTr("Yüzücü Gözlüğü", "GÖZLÜK")).toBe(true);
    expect(matchesTr("Motosiklet Kaskı", "kask")).toBe(true);
    expect(matchesTr("Motosiklet Kaskı", "kask pro")).toBe(false);
    expect(matchesTr("Kablosuz Kulaklık", "kulak")).toBe(true);
  });
  it("matches whole words only: 'kılıf' is not 'kilit', 'mat' is not 'matkap'", () => {
    expect(matchesTr("Akıllı Kilit", "kılıf")).toBe(false);
    expect(matchesTr("Şarjlı Matkap", "mat")).toBe(false);
    expect(matchesTr("Kablosuz Süpürge", "kablo")).toBe(false);
    expect(matchesTr("Telefon Kılıfı", "kılıf")).toBe(true);
  });
  it("an empty query matches nothing", () => {
    expect(matchesTr("anything", "")).toBe(false);
    expect(matchesTr("anything", "   ")).toBe(false);
    expect(matchesTr("", "x")).toBe(false);
  });
  it("matches non-latin terms by substring", () => {
    expect(matchesTr("TWS-100 无线蓝牙耳机 Kulaklık", "无线")).toBe(true);
    expect(matchesTr("TWS-100 无线蓝牙耳机", "耳机 tws")).toBe(true);
    expect(matchesTr("TWS-100 无线蓝牙耳机", "头盔")).toBe(false);
  });
  it("counts matched terms and splits words", () => {
    expect(countMatchesTr("Spor Ayakkabı Erkek", "erkek spor ayakkabı")).toBe(3);
    expect(countMatchesTr("Spor Çantası", "erkek spor ayakkabı")).toBe(1);
    expect(wordsTr("Güneş Gözlüğü, 2 adet!")).toEqual(["gunes", "gozlugu", "2", "adet"]);
  });
});
