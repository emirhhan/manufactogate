import type { ExtToWeb } from "@manufactogate/adapters";
import { extensionVersion, sendToExtension } from "./bridge";

/** Extension round-trip budget per image; a CDN that blocks us should fail fast, not in 15 s. */
export const IMAGE_TIMEOUT_MS = 6000;
/** How many extension image fetches may be in flight at once (the extension serialises market tabs). */
export const IMAGE_CONCURRENCY = 3;
const CACHE_MAX = 600;

/** Turns a market image URL into a data URL, through the extension when installed (CORS-free). Uncached. */
export async function imageToDataUrl(url: string, timeoutMs = IMAGE_TIMEOUT_MS): Promise<string | null> {
  if (url.startsWith("data:")) return url;
  if (extensionVersion()) {
    try {
      const r = await sendToExtension<ExtToWeb & { type: "image:result" }>({ type: "image", url }, timeoutMs);
      if (r.dataUrl) return r.dataUrl;
    } catch {
      /* fall through */
    }
  }
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Tiny semaphore: at most `limit` tasks run concurrently, the rest wait in FIFO order. */
export function createSemaphore(limit: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  const release = () => {
    active--;
    const next = queue.shift();
    if (next) next();
  };
  return {
    async run<T>(task: () => Promise<T>): Promise<T> {
      if (active >= limit) await new Promise<void>((r) => queue.push(r));
      active++;
      try {
        return await task();
      } finally {
        release();
      }
    },
    get pending() {
      return queue.length;
    },
    get active() {
      return active;
    },
  };
}

const sem = createSemaphore(IMAGE_CONCURRENCY);
const cache = new Map<string, Promise<string | null>>();

/**
 * Cached + rate-limited variant for thumbnails: the same URL in a result card, a cluster row and the
 * gallery is fetched once; hundreds of broken images queue instead of flooding the extension.
 */
export function cachedImageToDataUrl(url: string, fetcher: (u: string) => Promise<string | null> = imageToDataUrl): Promise<string | null> {
  const hit = cache.get(url);
  if (hit) return hit;
  const p = sem.run(() => fetcher(url)).catch(() => null);
  if (cache.size >= CACHE_MAX) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  cache.set(url, p);
  // Failures are remembered only briefly, so a transient extension hiccup does not pin a placeholder.
  void p.then((d) => {
    if (d === null) setTimeout(() => { if (cache.get(url) === p) cache.delete(url); }, 30_000);
  });
  return p;
}

/** Test/diagnostic hook. */
export function clearImageCache(): void {
  cache.clear();
}
export function imageCacheSize(): number {
  return cache.size;
}
