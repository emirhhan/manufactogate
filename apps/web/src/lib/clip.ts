import type { ClipProvider, ImageInput } from "@manufactogate/core";

/**
 * In-browser CLIP image embeddings (ViT-B/32, 8-bit) through transformers.js. The weights (~90 MB)
 * are fetched from the Hugging Face hub once, only after the user enabled "Görsel yapay zekâ" in
 * Settings, and are then served from the browser cache. WebGPU when available, WASM otherwise.
 */
const MODEL_ID = "Xenova/clip-vit-base-patch32";

type Pipeline = {
  processor: (img: unknown) => Promise<Record<string, unknown>>;
  model: (inputs: Record<string, unknown>) => Promise<{ image_embeds: { data: Float32Array } }>;
  RawImage: { fromURL(url: string): Promise<{ crop(box: [number, number, number, number]): Promise<unknown> | unknown; width: number; height: number }> };
};

class TransformersClipProvider implements ClipProvider {
  readonly id = "clip-vit-b32-q8";
  readonly dimensions = 512;
  private pipe: Pipeline | null = null;
  private loading: Promise<boolean> | null = null;
  /** One embedding at a time: the model is not re-entrant and parallel runs only fight for the CPU/GPU. */
  private chain: Promise<unknown> = Promise.resolve();

  isReady(): boolean {
    return this.pipe !== null;
  }

  load(): Promise<boolean> {
    if (this.pipe) return Promise.resolve(true);
    this.loading ??= (async () => {
      try {
        const tf = await import("@huggingface/transformers");
        tf.env.allowLocalModels = false;
        const webgpu = typeof navigator !== "undefined" && "gpu" in navigator;
        const processor = await tf.AutoProcessor.from_pretrained(MODEL_ID);
        const model = await tf.CLIPVisionModelWithProjection.from_pretrained(MODEL_ID, { dtype: "q8", device: webgpu ? "webgpu" : "wasm" }).catch(() =>
          tf.CLIPVisionModelWithProjection.from_pretrained(MODEL_ID, { dtype: "q8", device: "wasm" }),
        );
        this.pipe = { processor: processor as unknown as Pipeline["processor"], model: model as unknown as Pipeline["model"], RawImage: tf.RawImage as unknown as Pipeline["RawImage"] };
        return true;
      } catch {
        this.loading = null;
        return false;
      }
    })();
    return this.loading;
  }

  embed(image: ImageInput): Promise<Float32Array | null> {
    const run = async () => {
      const p = this.pipe;
      if (!p) return null;
      try {
        let img: unknown = await p.RawImage.fromURL(image.dataUrl);
        const r = image.region;
        if (r) {
          const raw = img as { width: number; height: number; crop(box: [number, number, number, number]): unknown };
          img = await raw.crop([Math.round(r.x * raw.width), Math.round(r.y * raw.height), Math.round((r.x + r.w) * raw.width) - 1, Math.round((r.y + r.h) * raw.height) - 1]);
        }
        const inputs = await p.processor(img);
        const out = await p.model(inputs);
        return new Float32Array(out.image_embeds.data);
      } catch {
        return null;
      }
    };
    const next = this.chain.then(run, run);
    this.chain = next;
    return next;
  }
}

export const clipProvider = new TransformersClipProvider();
