import { localizeQuery, translateQueryToZh } from "../src";

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
