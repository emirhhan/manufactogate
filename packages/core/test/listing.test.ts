import { monthlySalesEstimate, ratingOutOf5, unitPriceNormalized } from "../src";

describe("listing helpers", () => {
  it("estimates monthly sales from different counters", () => {
    expect(monthlySalesEstimate({ sold: 120, soldPeriod: "30d" })).toBe(120);
    expect(monthlySalesEstimate({ sold: 2400, soldPeriod: "total" })).toBe(100);
    expect(monthlySalesEstimate({ sold: 50, soldPeriod: "reviews" })).toBe(400);
    expect(monthlySalesEstimate({ sold: 2400 })).toBe(100);
    expect(monthlySalesEstimate({ reviewCount: 10 })).toBe(80);
    expect(monthlySalesEstimate({})).toBeNull();
  });
  it("normalises ratings to five stars", () => {
    expect(ratingOutOf5({ rating: 4.5 })).toBe(4.5);
    expect(ratingOutOf5({ rating: 96, ratingMax: 100 })).toBe(4.8);
    expect(ratingOutOf5({ rating: 90 })).toBe(4.5);
    expect(ratingOutOf5({})).toBeNull();
  });
  it("divides pack prices by pack quantity", () => {
    expect(unitPriceNormalized({ price: { currency: "CNY", tiers: [{ minQty: 1, unitPrice: 15 }] }, packQty: 10 })).toBe(1.5);
    expect(unitPriceNormalized({ price: { currency: "CNY", tiers: [{ minQty: 1, unitPrice: 12 }, { minQty: 100, unitPrice: 8 }] } })).toBe(8);
    expect(unitPriceNormalized({ price: { currency: "CNY", tiers: [{ minQty: 1, unitPrice: 12 }, { minQty: 100, unitPrice: 8 }] } }, 0)).toBe(12);
    expect(unitPriceNormalized({ price: { currency: "CNY", tiers: [] } })).toBeNull();
  });
});
