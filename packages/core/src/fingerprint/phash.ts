/**
 * Perceptual hash (pHash) over a grayscale image, pure TypeScript.
 * Input: grayscale samples already resized to size x size (default 32).
 * Output: 64-bit hash as a 16-char hex string, from the low 8x8 DCT block.
 */

const DEFAULT_SIZE = 32;
const LOW = 8;

function dct2d(gray: Float64Array, n: number): Float64Array {
  const out = new Float64Array(n * n);
  const cos = new Float64Array(n * n);
  for (let u = 0; u < n; u++) {
    for (let x = 0; x < n; x++) {
      cos[u * n + x] = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * n));
    }
  }
  // Row pass then column pass, only the LOW x LOW block is needed.
  const tmp = new Float64Array(n * LOW);
  for (let y = 0; y < n; y++) {
    for (let u = 0; u < LOW; u++) {
      let s = 0;
      for (let x = 0; x < n; x++) s += gray[y * n + x]! * cos[u * n + x]!;
      tmp[y * LOW + u] = s;
    }
  }
  for (let v = 0; v < LOW; v++) {
    for (let u = 0; u < LOW; u++) {
      let s = 0;
      for (let y = 0; y < n; y++) s += tmp[y * LOW + u]! * cos[v * n + y]!;
      out[v * LOW + u] = s;
    }
  }
  return out;
}

export function phashFromGray(gray: Float64Array | number[], size = DEFAULT_SIZE): string {
  const n = size;
  if (gray.length !== n * n) throw new Error(`expected ${n * n} samples, got ${gray.length}`);
  const g = gray instanceof Float64Array ? gray : Float64Array.from(gray);
  const d = dct2d(g, n);
  // Median of the low block excluding DC term.
  const vals: number[] = [];
  for (let i = 1; i < LOW * LOW; i++) vals.push(d[i]!);
  const sorted = [...vals].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  let bits = "";
  for (let i = 0; i < LOW * LOW; i++) bits += d[i]! > median ? "1" : "0";
  let hex = "";
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

/** Converts RGBA pixel data (already size x size) to grayscale luma samples. */
export function rgbaToGray(rgba: Uint8ClampedArray | Uint8Array, size = DEFAULT_SIZE): Float64Array {
  const out = new Float64Array(size * size);
  for (let i = 0; i < size * size; i++) {
    const r = rgba[i * 4]!;
    const g = rgba[i * 4 + 1]!;
    const b = rgba[i * 4 + 2]!;
    out[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  return out;
}

export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) throw new Error("hash length mismatch");
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i]!, 16) ^ parseInt(b[i]!, 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

/** 0..1 similarity from a 64-bit hamming distance. */
export function phashSimilarity(a: string, b: string): number {
  return 1 - hammingDistance(a, b) / 64;
}
