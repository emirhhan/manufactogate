import { hammingDistance, phashFromGray, phashSimilarity } from "../src";

function gradient(size: number, noise = 0): Float64Array {
  const g = new Float64Array(size * size);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648 - 0.5) * 2;
  // Photo-like synthetic: a few blobs over a soft gradient, so low frequencies carry structure.
  const blobs = [
    [8, 8, 5, 180],
    [22, 10, 4, -120],
    [14, 24, 6, 150],
    [26, 26, 3, -90],
  ] as const;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let v = 80 + x * 2 + y * 1.5;
      for (const [cx, cy, r, amp] of blobs) v += amp * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * r * r));
      g[y * size + x] = Math.max(0, Math.min(255, v + rnd() * noise));
    }
  return g;
}
function checker(size: number): Float64Array {
  const g = new Float64Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) g[y * size + x] = ((x >> 2) + (y >> 2)) % 2 ? 255 : 0;
  return g;
}

describe("phash", () => {
  it("is deterministic and 16 hex chars", () => {
    const h = phashFromGray(gradient(32));
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    expect(phashFromGray(gradient(32))).toBe(h);
  });
  it("is stable under noise and brightness, different for different images", () => {
    const a = phashFromGray(gradient(32));
    const b = phashFromGray(gradient(32, 20));
    const bright = phashFromGray(gradient(32).map((v) => v * 1.3 + 15));
    const c = phashFromGray(checker(32));
    expect(hammingDistance(a, b)).toBeLessThan(12);
    expect(hammingDistance(a, bright)).toBeLessThan(4);
    expect(hammingDistance(a, c)).toBeGreaterThan(16);
    expect(phashSimilarity(a, a)).toBe(1);
  });
  it("rejects wrong sample count", () => {
    expect(() => phashFromGray(new Float64Array(10))).toThrow();
  });
});
