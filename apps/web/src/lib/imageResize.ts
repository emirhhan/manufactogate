/**
 * Query-image preparation: a phone photo (4–12 MB) is shrunk before it is fingerprinted, sent
 * to every market and remembered in history. Pure sizing helpers are tested; the canvas path
 * runs only in a browser.
 */

/** Longest edge of the image sent to markets. */
export const QUERY_MAX_EDGE = 1024;
/** Longest edge of the history thumbnail. */
export const THUMB_MAX_EDGE = 96;
export const QUERY_JPEG_QUALITY = 0.86;
export const THUMB_JPEG_QUALITY = 0.7;

/** Target size that fits `maxEdge`, never upscaling. Pure. */
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number; scale: number } {
  if (width <= 0 || height <= 0) return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)), scale: 1 };
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), scale };
}

/** Approximate byte size of a base64 data URL. Pure. */
export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma === -1) return dataUrl.length;
  const b64 = dataUrl.length - comma - 1;
  const padding = dataUrl.endsWith("==") ? 2 : dataUrl.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((b64 * 3) / 4) - padding);
}

/** Whether a data URL needs shrinking before it travels to 30 markets. Pure. */
export function needsResize(bytes: number, width: number, height: number, maxEdge = QUERY_MAX_EDGE, maxBytes = 600_000): boolean {
  return bytes > maxBytes || Math.max(width, height) > maxEdge;
}

export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image decode failed"));
    img.src = url;
  });
}

async function drawToDataUrl(source: ImageBitmap | HTMLImageElement, width: number, height: number, quality: number): Promise<string> {
  if (typeof OffscreenCanvas !== "undefined") {
    const c = new OffscreenCanvas(width, height);
    const ctx = c.getContext("2d");
    if (ctx) {
      ctx.drawImage(source, 0, 0, width, height);
      const blob = await c.convertToBlob({ type: "image/jpeg", quality });
      return fileToDataUrl(blob);
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(source, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

export interface PreparedImage {
  /** Query image (≤ QUERY_MAX_EDGE), JPEG data URL. */
  dataUrl: string;
  /** History thumbnail (≤ THUMB_MAX_EDGE), JPEG data URL. */
  thumb: string;
  width: number;
  height: number;
  bytes: number;
  name: string;
}

/**
 * Decodes a file (EXIF orientation applied), shrinks it to the query size and makes a thumbnail.
 * Falls back to the original data URL when the browser cannot decode it (HEIC on Linux Chrome).
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  const original = await fileToDataUrl(file);
  try {
    let source: ImageBitmap | HTMLImageElement;
    let w: number;
    let h: number;
    if (typeof createImageBitmap === "function") {
      source = await createImageBitmap(file, { imageOrientation: "from-image" });
      w = source.width;
      h = source.height;
    } else {
      source = await loadImage(original);
      w = source.naturalWidth;
      h = source.naturalHeight;
    }
    const q = fitWithin(w, h, QUERY_MAX_EDGE);
    const t = fitWithin(w, h, THUMB_MAX_EDGE);
    const dataUrl = needsResize(dataUrlBytes(original), w, h) || !original.startsWith("data:image/jpeg") ? await drawToDataUrl(source, q.width, q.height, QUERY_JPEG_QUALITY) : original;
    const thumb = await drawToDataUrl(source, t.width, t.height, THUMB_JPEG_QUALITY);
    if ("close" in source) source.close();
    return { dataUrl, thumb, width: q.width, height: q.height, bytes: dataUrlBytes(dataUrl), name: file.name };
  } catch {
    return { dataUrl: original, thumb: original.length < 60_000 ? original : "", width: 0, height: 0, bytes: dataUrlBytes(original), name: file.name };
  }
}
