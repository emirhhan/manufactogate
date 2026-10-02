import { jaccard, modelNumbers, tokens } from "../src";

describe("text signals", () => {
  it("tokenizes latin and CJK", () => {
    expect(tokens("Wireless Earbuds TWS X15 Pro")).toEqual(["wireless", "earbuds", "tws", "x15", "pro"]);
    expect(tokens("无线蓝牙耳机")).toEqual(["无线", "线蓝", "蓝牙", "牙耳", "耳机"]);
  });
  it("extracts model numbers", () => {
    expect(modelNumbers("Bluetooth kulaklık TWS-X15 Pro ANC 2024")).toEqual(["TWS-X15"]);
    expect(modelNumbers("Model A1B2 and XK-900")).toEqual(["A1B2", "XK-900"]);
    expect(modelNumbers("no codes here")).toEqual([]);
  });
  it("jaccard", () => {
    expect(jaccard(["a", "b"], ["b", "c"])).toBeCloseTo(1 / 3);
    expect(jaccard([], [])).toBe(0);
  });
});
