import { autocropGray, dhashFromGray, hammingDistance, phashFromGray, phashSimilarity, rgbaToGray } from "../src";

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
/** The gradient image shrunk into the middle of a white canvas (padding of `pad` px). */
function padded(size: number, pad: number): Float64Array {
  const src = gradient(size);
  const out = new Float64Array(size * size).fill(255);
  const inner = size - 2 * pad;
  for (let y = 0; y < inner; y++)
    for (let x = 0; x < inner; x++) {
      const sx = Math.floor((x * size) / inner);
      const sy = Math.floor((y * size) / inner);
      out[(y + pad) * size + (x + pad)] = src[sy * size + sx]!;
    }
  return out;
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
  it("uses all 64 bits (the DC term is excluded, so bit 0 is not constant)", () => {
    const flat = new Float64Array(32 * 32).fill(100);
    const bit0 = (h: string) => parseInt(h[0]!, 16) >> 3;
    const bits = new Set([bit0(phashFromGray(gradient(32))), bit0(phashFromGray(checker(32))), bit0(phashFromGray(flat)), bit0(phashFromGray(gradient(32).map((v) => 255 - v)))]);
    expect(bits.size).toBe(2);
  });
  it("rejects wrong sample count", () => {
    expect(() => phashFromGray(new Float64Array(10))).toThrow();
  });
  it("composites transparent pixels over white", () => {
    const rgba = new Uint8ClampedArray(32 * 32 * 4);
    for (let i = 0; i < 32 * 32; i++) {
      rgba[i * 4] = 0;
      rgba[i * 4 + 1] = 0;
      rgba[i * 4 + 2] = 0;
      rgba[i * 4 + 3] = i < 512 ? 0 : 255; // top half transparent, bottom half black
    }
    const g = rgbaToGray(rgba, 32);
    expect(g[0]).toBe(255);
    expect(g[1023]).toBe(0);
    expect(rgbaToGray(rgba, 32, 0)[0]).toBe(0);
  });
  it("autocrop makes a padded product shot hash like the full one", () => {
    const full = gradient(32);
    const pad = padded(32, 6);
    const before = hammingDistance(phashFromGray(full), phashFromGray(pad));
    const after = hammingDistance(phashFromGray(autocropGray(full)), phashFromGray(autocropGray(pad)));
    expect(after).toBeLessThan(before);
    expect(after).toBeLessThanOrEqual(10);
    // A flat image is returned unchanged.
    const flat = new Float64Array(32 * 32).fill(200);
    expect(autocropGray(flat)).toBe(flat);
  });
  it("dhash is 16 hex chars, deterministic and separates images", () => {
    const a = dhashFromGray(gradient(32));
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(dhashFromGray(gradient(32, 10))).not.toBe(dhashFromGray(checker(32)));
    expect(hammingDistance(a, dhashFromGray(gradient(32, 10)))).toBeLessThan(12);
  });
  it("hamming distance tolerates length mismatch", () => {
    expect(hammingDistance("ff", "ff00")).toBe(8);
    expect(phashSimilarity("ffff", "ffff0000")).toBeCloseTo(0.5);
    expect(() => hammingDistance("abc", "abcdef")).not.toThrow();
  });
});
