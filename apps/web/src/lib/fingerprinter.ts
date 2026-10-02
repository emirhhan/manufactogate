import {
  modelNumbers,
  phashFromGray,
  rgbaToGray,
  type Fingerprint,
  type Fingerprinter,
  type RawListing,
  type SearchInput,
} from "@manufactogate/core";

const SIZE = 32;

/** Loads an image (data URL or http URL) and returns its 32x32 grayscale pHash. Browser only. */
export async function phashFromUrl(url: string, region?: { x: number; y: number; w: number; h: number }): Promise<string | undefined> {
  if (typeof document === "undefined") return undefined;
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return undefined;
    const sx = region ? region.x * img.naturalWidth : 0;
    const sy = region ? region.y * img.naturalHeight : 0;
    const sw = region ? region.w * img.naturalWidth : img.naturalWidth;
    const sh = region ? region.h * img.naturalHeight : img.naturalHeight;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, SIZE, SIZE);
    const data = ctx.getImageData(0, 0, SIZE, SIZE).data;
    return phashFromGray(rgbaToGray(data, SIZE), SIZE);
  } catch {
    // Cross-origin images without CORS headers taint the canvas; we degrade to text-only matching.
    return undefined;
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!url.startsWith("data:")) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = url;
  });
}

const cache = new Map<string, Promise<string | undefined>>();
function cachedPhash(url: string): Promise<string | undefined> {
  let p = cache.get(url);
  if (!p) {
    p = phashFromUrl(url);
    cache.set(url, p);
  }
  return p;
}

/** Sprint 0 fingerprinter: pHash in the browser plus title signals. CLIP arrives in Sprint 1. */
export const browserFingerprinter: Fingerprinter = {
  async forQuery(input: SearchInput): Promise<Fingerprint> {
    const fp: Fingerprint = {};
    if (input.kind === "image") {
      const h = await phashFromUrl(input.image.dataUrl, input.image.region);
      if (h) fp.phash = h;
      if (input.title) {
        fp.title = input.title;
        fp.modelNumbers = modelNumbers(input.title);
      }
    } else if (input.kind === "text") {
      fp.title = input.query;
      fp.modelNumbers = modelNumbers(input.query);
    } else {
      fp.title = input.url;
    }
    return fp;
  },
  async forListing(listing: RawListing): Promise<Fingerprint> {
    const fp: Fingerprint = { title: listing.title, modelNumbers: modelNumbers(listing.title) };
    const first = listing.images[0];
    if (first) {
      const h = await cachedPhash(first);
      if (h) fp.phash = h;
    }
    return fp;
  },
};
