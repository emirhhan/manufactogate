import { clusterCandidates, confidenceBand, scoreMatch, type RawListing } from "../src";

const listing = (id: string, market: string, title: string): RawListing => ({
  market: market as RawListing["market"],
  id,
  url: `https://example/${id}`,
  title,
  images: [],
  price: { currency: "CNY", tiers: [{ minQty: 1, unitPrice: 10 }] },
  badges: [],
  fetchedAt: "2026-01-01T00:00:00Z",
});

describe("scoreMatch", () => {
  it("identical phash and title scores as same", () => {
    const fp = { phash: "ffff0000ffff0000", title: "Wireless earbuds TWS-X15" };
    const m = scoreMatch(fp, { ...fp });
    expect(m.score).toBeGreaterThanOrEqual(0.85);
    expect(confidenceBand(m.score)).toBe("same");
    expect(m.reasons[0]).toBe("model numarası eşleşti");
  });
  it("unrelated hash and title is hidden", () => {
    const m = scoreMatch(
      { phash: "ffff0000ffff0000", title: "Wireless earbuds" },
      { phash: "0f0f0f0f0f0f0f0f", title: "Garden hose 20m" },
    );
    expect(confidenceBand(m.score)).toBe("hidden");
  });
  it("clip similarity is stretched from 0.5..1", () => {
    const q = { clip: new Float32Array([1, 0]) };
    expect(scoreMatch(q, { clip: new Float32Array([1, 0]) }).signals.visualClip).toBeCloseTo(1);
    expect(scoreMatch(q, { clip: new Float32Array([0, 1]) }).signals.visualClip).toBe(0);
  });
});

describe("clusterCandidates", () => {
  it("groups near-identical candidates and separates similar ones", () => {
    const q = { phash: "ffff0000ffff0000", title: "Wireless earbuds TWS-X15" };
    const { clusters, similar } = clusterCandidates(q, [
      { listing: listing("a", "cn-1688", "TWS-X15 wireless earbuds"), fingerprint: { ...q } },
      { listing: listing("b", "cn-taobao", "TWS-X15 earbuds wireless"), fingerprint: { ...q } },
      {
        listing: listing("c", "cn-pinduoduo", "earbuds case only"),
        fingerprint: { phash: "ffff0000ffff00ff", title: "earbuds case only" },
      },
      {
        listing: listing("d", "cn-1688", "garden hose"),
        fingerprint: { phash: "0f0f0f0f0f0f0f0f", title: "garden hose" },
      },
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.members.map((m) => m.listing.id).sort()).toEqual(["a", "b"]);
    expect(clusters[0]!.markets.sort()).toEqual(["cn-1688", "cn-taobao"]);
    expect(similar.map((s) => s.listing.id)).toEqual(["c"]);
  });
});
