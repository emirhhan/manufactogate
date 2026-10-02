import { foldTr, matchesTr, termVariants } from "../src";

describe("turkish search folding", () => {
  it("folds diacritics and dotted/dotless i", () => {
    expect(foldTr("Güneş Gözlüğü İstanbul")).toBe("gunes gozlugu istanbul");
  });
  it("softens final consonants", () => {
    expect(termVariants("gözlük")).toContain("gozlug");
    expect(termVariants("kitap")).toContain("kitab");
  });
  it("matches inflected category names", () => {
    expect(matchesTr("Güneş Gözlüğü 太阳镜", "gözlük")).toBe(true);
    expect(matchesTr("Yüzücü Gözlüğü", "GÖZLÜK")).toBe(true);
    expect(matchesTr("Motosiklet Kaskı", "kask")).toBe(true);
    expect(matchesTr("Motosiklet Kaskı", "kask pro")).toBe(false);
  });
});
