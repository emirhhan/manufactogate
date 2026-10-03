import { localizeQuery, queryLadder, titleToQuery, translateQueryToZh, translateTitleToTr } from "../src";

describe("query translation", () => {
  it("maps category names to Chinese", () => {
    expect(translateQueryToZh("kask")).toBe("头盔");
    expect(translateQueryToZh("motosiklet kaskı")).toBe("摩托车头盔");
    expect(translateQueryToZh("kablosuz kulaklık")).toBe("无线耳机");
    expect(translateQueryToZh("Güneş gözlüğü")).toBe("太阳镜");
  });
  it("keeps model codes and Chinese input", () => {
    expect(translateQueryToZh("kulaklık TWS-X15")).toBe("耳机 TWS-X15");
    expect(translateQueryToZh("蓝牙耳机")).toBe("蓝牙耳机");
  });
  it("falls back to the original when nothing matches", () => {
    expect(translateQueryToZh("zxqv")).toBe("zxqv");
    expect(localizeQuery("kask", "tr")).toBe("kask");
  });
});

describe("title to query", () => {
  it("shortens Chinese titles for Chinese markets", () => {
    expect(titleToQuery("意大利KASK UTOPIA Y乌托邦破风气动公路车骑行头盔自行车安全帽", "zh")).toBe("KASK UTOPIA 骑行头盔");
  });
  it("turns Chinese titles into Turkish queries", () => {
    expect(translateTitleToTr("Arai RX7 摩托车头盔女男机车全盔")).toBe("Arai RX7 Motosiklet Kaskı");
    expect(titleToQuery("TWS无线蓝牙耳机", "tr")).toBe("TWS Kulaklık");
  });
});

describe("query ladder", () => {
  it("goes from specific to category only", () => {
    expect(queryLadder("国产Arai Rx7x 红芳贺纪行摩托车机车安全头盔男女骑士四季通用", "zh")).toEqual(["Arai Rx7x 头盔", "Arai 头盔", "头盔"]);
    expect(queryLadder("国产Arai Rx7x 摩托车头盔", "tr")).toEqual(["Arai Rx7x Motosiklet Kaskı", "Arai Motosiklet Kaskı", "Motosiklet Kaskı"]);
  });
});
