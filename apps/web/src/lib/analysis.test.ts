import { describe, expect, it } from "vitest";
import { hsSuggest, median, quantile } from "./analysis";

describe("analysis helpers", () => {
  it("median handles odd/even/empty", () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });
  it("quantile clamps", () => {
    expect(quantile([10, 20, 30, 40], 0.25)).toBe(20);
    expect(quantile([5], 0.9)).toBe(5);
  });
  it("hs suggestion by group", () => {
    expect(hsSuggest("motorcycle")?.hs).toBe("6506");
    expect(hsSuggest("nope")).toBeNull();
    expect(hsSuggest(undefined)).toBeNull();
  });
});
