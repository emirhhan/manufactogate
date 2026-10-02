import type { ExtToWeb } from "@manufactogate/adapters";
import { extensionVersion, sendToExtension } from "./bridge";

/** Turns a market image URL into a data URL, through the extension when installed (CORS-free). */
export async function imageToDataUrl(url: string): Promise<string | null> {
  if (url.startsWith("data:")) return url;
  if (extensionVersion()) {
    try {
      const r = await sendToExtension<ExtToWeb & { type: "image:result" }>({ type: "image", url }, 15000);
      return r.dataUrl;
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
