import { describe, expect, it } from "vitest";
import { suspiciousPrices } from "./priceCheck";

const l = (id: string, amount: number, market = "cn-1688", currency = "CNY") => ({ market, id, price: { currency, tiers: [{ minQty: 1, unitPrice: amount }] } }) as never;

describe("suspiciousPrices", () => {
  it("flags a price far from the market's median and a zero price, not normal spread", () => {
    const rows = [l("a", 40), l("b", 45), l("c", 52), l("d", 38), l("e", 60), l("f", 1000), l("g", 2), l("h", 0)];
    expect([...suspiciousPrices(rows)].sort()).toEqual(["cn-1688:f", "cn-1688:g", "cn-1688:h"]);
  });
  it("needs a sample before judging and never compares across currencies", () => {
    expect(suspiciousPrices([l("a", 10), l("b", 900)]).size).toBe(0);
    const mixed = [l("a", 40), l("b", 45), l("c", 50), l("d", 42), l("e", 48), l("x", 900, "cn-1688", "USD")];
    expect(suspiciousPrices(mixed).size).toBe(0);
  });
});
