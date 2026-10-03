import {
  attachClip,
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

import { extensionVersion, sendToExtension } from "./bridge";
import { clipProvider } from "./clip";
import type { ExtToWeb } from "@manufactogate/adapters";

/** A listing image as a same-origin data URL (market CDNs rarely send CORS headers; the extension can fetch them). */
const dataUrls = new Map<string, Promise<string>>();
function readableImage(url: string): Promise<string> {
  let p = dataUrls.get(url);
  if (!p) {
    p = (async () => {
      if (extensionVersion() && /^https?:/.test(url)) {
        try {
          const r = await sendToExtension<ExtToWeb & { type: "image:result" }>({ type: "image", url }, 15000);
          if (r.dataUrl) return r.dataUrl;
        } catch {
          /* fall through to direct load */
        }
      }
      return url;
    })();
    if (dataUrls.size > 2000) dataUrls.clear();
    dataUrls.set(url, p);
  }
  return p;
}

const cache = new Map<string, Promise<string | undefined>>();
function cachedPhash(url: string): Promise<string | undefined> {
  let p = cache.get(url);
  if (!p) {
    p = readableImage(url).then(async (src) => (await phashFromUrl(src)) ?? (src !== url ? phashFromUrl(url) : undefined));
    cache.set(url, p);
  }
  return p;
}

/** Turns the visual model on for this session (loads it on first use); off by the user's setting. */
let clipWanted = false;
export function setVisualAi(on: boolean): void {
  clipWanted = on;
  // Unit tests never pull the model.
  if (on && import.meta.env.MODE !== "test") void clipProvider.load();
}
/** The query waits a little for a model still loading; listings never wait (they keep pHash only). */
async function clipReady(waitMs: number): Promise<boolean> {
  if (!clipWanted) return false;
  if (clipProvider.isReady()) return true;
  if (waitMs <= 0) return false;
  return Promise.race([clipProvider.load(), new Promise<boolean>((r) => setTimeout(() => r(false), waitMs))]);
}

/** Browser fingerprinter: pHash, CLIP embeddings when the visual model is on, and title signals. */
export const browserFingerprinter: Fingerprinter = {
  async forQuery(input: SearchInput): Promise<Fingerprint> {
    const fp: Fingerprint = {};
    if (input.kind === "image") {
      const h = await phashFromUrl(input.image.dataUrl, input.image.region);
      if (h) fp.phash = h;
      if (await clipReady(30_000)) await attachClip(fp, clipProvider, input.image);
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
      if (await clipReady(0)) await attachClip(fp, clipProvider, { dataUrl: await readableImage(first) });
    }
    return fp;
  },
};
