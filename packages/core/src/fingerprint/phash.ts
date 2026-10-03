/**
 * Perceptual hashes over a grayscale image, pure TypeScript.
 * Input: grayscale samples already resized to size x size (default 32).
 * pHash: 64-bit hash as a 16-char hex string from the low-frequency DCT block (DC term excluded).
 * dHash: 64-bit gradient hash, robust to crops and padding differences.
 */

const DEFAULT_SIZE = 32;
const LOW = 8;
/** Rows of the low block: one extra so that 64 AC coefficients remain after dropping DC. */
const LOW_V = 9;

function dct2d(gray: Float64Array, n: number): Float64Array {
  const out = new Float64Array(LOW_V * LOW);
  const cos = new Float64Array(n * n);
  for (let u = 0; u < n; u++) {
    for (let x = 0; x < n; x++) {
      cos[u * n + x] = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * n));
    }
  }
  // Row pass then column pass, only the LOW_V x LOW block is needed.
  const tmp = new Float64Array(n * LOW);
  for (let y = 0; y < n; y++) {
    for (let u = 0; u < LOW; u++) {
      let s = 0;
      for (let x = 0; x < n; x++) s += gray[y * n + x]! * cos[u * n + x]!;
      tmp[y * LOW + u] = s;
    }
  }
  for (let v = 0; v < LOW_V; v++) {
    for (let u = 0; u < LOW; u++) {
      let s = 0;
      for (let y = 0; y < n; y++) s += tmp[y * LOW + u]! * cos[v * n + y]!;
      out[v * LOW + u] = s;
    }
  }
  return out;
}

function bitsToHex(bits: string): string {
  let hex = "";
  for (let i = 0; i < bits.length; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

export function phashFromGray(gray: Float64Array | number[], size = DEFAULT_SIZE): string {
  const n = size;
  if (gray.length !== n * n) throw new Error(`expected ${n * n} samples, got ${gray.length}`);
  const g = gray instanceof Float64Array ? gray : Float64Array.from(gray);
  const d = dct2d(g, n);
  // 64 AC coefficients: indices 1..64 of the 9x8 block (DC at index 0 is skipped, so every bit carries information).
  const vals: number[] = [];
  for (let i = 1; i <= LOW * LOW; i++) vals.push(d[i]!);
  const sorted = [...vals].sort((a, b) => a - b);
  const median = (sorted[31]! + sorted[32]!) / 2;
  let bits = "";
  for (const v of vals) bits += v > median ? "1" : "0";
  return bitsToHex(bits);
}

/** Difference hash: compares horizontally adjacent pixels on a 9x8 downsample. */
export function dhashFromGray(gray: Float64Array | number[], size = DEFAULT_SIZE): string {
  const n = size;
  if (gray.length !== n * n) throw new Error(`expected ${n * n} samples, got ${gray.length}`);
  const g = gray instanceof Float64Array ? gray : Float64Array.from(gray);
  const cell = (x: number, y: number): number => {
    // Average over the block of the size x size image that maps to the 9x8 grid cell.
    const x0 = Math.floor((x * n) / 9);
    const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * n) / 9));
    const y0 = Math.floor((y * n) / 8);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * n) / 8));
    let s = 0;
    let c = 0;
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { s += g[yy * n + xx]!; c++; }
    return s / c;
  };
  let bits = "";
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += cell(x + 1, y) > cell(x, y) ? "1" : "0";
  return bitsToHex(bits);
}

/**
 * Converts RGBA pixel data (already size x size) to grayscale luma samples. Transparent
 * pixels are composited over `background` (white by default) so cut-out PNGs hash like
 * the white-background JPEGs most marketplaces serve.
 */
export function rgbaToGray(rgba: Uint8ClampedArray | Uint8Array, size = DEFAULT_SIZE, background = 255): Float64Array {
  const out = new Float64Array(size * size);
  for (let i = 0; i < size * size; i++) {
    const r = rgba[i * 4]!;
    const g = rgba[i * 4 + 1]!;
    const b = rgba[i * 4 + 2]!;
    const a = (rgba[i * 4 + 3] ?? 255) / 255;
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    out[i] = luma * a + background * (1 - a);
  }
  return out;
}

/**
 * Trims near-uniform borders (white padding, letterboxing) and resamples the remaining
 * region back to size x size, so differently padded product shots hash alike.
 * `threshold` is the max deviation from the border colour for a row/column to count as padding.
 */
export function autocropGray(gray: Float64Array, size = DEFAULT_SIZE, threshold = 12): Float64Array {
  const n = size;
  const at = (x: number, y: number) => gray[y * n + x]!;
  const border = (at(0, 0) + at(n - 1, 0) + at(0, n - 1) + at(n - 1, n - 1)) / 4;
  const rowUniform = (y: number) => { for (let x = 0; x < n; x++) if (Math.abs(at(x, y) - border) > threshold) return false; return true; };
  const colUniform = (x: number) => { for (let y = 0; y < n; y++) if (Math.abs(at(x, y) - border) > threshold) return false; return true; };
  let top = 0, bottom = n - 1, left = 0, right = n - 1;
  while (top < bottom && rowUniform(top)) top++;
  while (bottom > top && rowUniform(bottom)) bottom--;
  while (left < right && colUniform(left)) left++;
  while (right > left && colUniform(right)) right--;
  const w = right - left + 1;
  const h = bottom - top + 1;
  // Nothing to crop, or the crop would be degenerate (flat image).
  if ((top === 0 && left === 0 && right === n - 1 && bottom === n - 1) || w < 4 || h < 4) return gray;
  const out = new Float64Array(n * n);
  for (let y = 0; y < n; y++) {
    const sy = top + ((y + 0.5) * h) / n - 0.5;
    const y0 = Math.max(top, Math.min(bottom, Math.floor(sy)));
    const y1 = Math.min(bottom, y0 + 1);
    const fy = Math.min(1, Math.max(0, sy - y0));
    for (let x = 0; x < n; x++) {
      const sx = left + ((x + 0.5) * w) / n - 0.5;
      const x0 = Math.max(left, Math.min(right, Math.floor(sx)));
      const x1 = Math.min(right, x0 + 1);
      const fx = Math.min(1, Math.max(0, sx - x0));
      const v = at(x0, y0) * (1 - fx) * (1 - fy) + at(x1, y0) * fx * (1 - fy) + at(x0, y1) * (1 - fx) * fy + at(x1, y1) * fx * fy;
      out[y * n + x] = v;
    }
  }
  return out;
}

/**
 * Hamming distance between two hex hashes. Hashes of different length are compared over the
 * common prefix and every missing nibble counts as four differing bits, so a stray hash never throws.
 */
export function hammingDistance(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let d = 0;
  for (let i = 0; i < n; i++) {
    let x = parseInt(a[i]!, 16) ^ parseInt(b[i]!, 16);
    if (Number.isNaN(x)) x = 15;
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  d += Math.abs(a.length - b.length) * 4;
  return d;
}

/** 0..1 similarity from the hamming distance over the longer hash's bit length. */
export function phashSimilarity(a: string, b: string): number {
  const bits = Math.max(a.length, b.length) * 4;
  if (bits === 0) return 0;
  return 1 - hammingDistance(a, b) / bits;
}
