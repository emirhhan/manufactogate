import { l2Normalize, type ClipProvider, type ImageInput } from "@manufactogate/core";

/**
 * In-browser CLIP (ViT-B/32, 8-bit) through transformers.js: image embeddings for visual similarity
 * and text embeddings for naming a product from its photo. The weights (~90 MB image half, ~60 MB
 * text half) are fetched from the Hugging Face hub once, only while "Görsel yapay zekâ" is on in
 * Settings, and are then served from the browser cache. WebGPU when available, WASM otherwise.
 */
const MODEL_ID = "Xenova/clip-vit-base-patch32";
/** Texts per text-model run; small batches keep each blocking step short. */
const TEXT_BATCH = 8;

type Pipeline = {
  processor: (img: unknown) => Promise<Record<string, unknown>>;
  model: (inputs: Record<string, unknown>) => Promise<{ image_embeds: { data: Float32Array } }>;
  RawImage: { fromURL(url: string): Promise<{ crop(box: [number, number, number, number]): Promise<unknown> | unknown; width: number; height: number }> };
};

type TextPipeline = {
  tokenizer: (texts: string[], opts: { padding: boolean; truncation: boolean }) => Record<string, unknown>;
  model: (inputs: Record<string, unknown>) => Promise<{ text_embeds: { data: Float32Array; dims: number[] } }>;
};

class TransformersClipProvider implements ClipProvider {
  readonly id = "clip-vit-b32-q8";
  readonly dimensions = 512;
  private pipe: Pipeline | null = null;
  private loading: Promise<boolean> | null = null;
  private text: TextPipeline | null = null;
  private textLoading: Promise<boolean> | null = null;
  /** One model run at a time: the runtime is not re-entrant and parallel runs only fight for the CPU/GPU. */
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
        const processor = await tf.AutoProcessor.from_pretrained(MODEL_ID);
        const model = await tf.CLIPVisionModelWithProjection.from_pretrained(MODEL_ID, { dtype: "q8", device: webgpu() ? "webgpu" : "wasm" }).catch(() =>
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

  /** Loads the text half (tokenizer + text encoder) on first use. */
  loadText(): Promise<boolean> {
    if (this.text) return Promise.resolve(true);
    this.textLoading ??= (async () => {
      try {
        const tf = await import("@huggingface/transformers");
        tf.env.allowLocalModels = false;
        const tokenizer = await tf.AutoTokenizer.from_pretrained(MODEL_ID);
        const model = await tf.CLIPTextModelWithProjection.from_pretrained(MODEL_ID, { dtype: "q8", device: webgpu() ? "webgpu" : "wasm" }).catch(() =>
          tf.CLIPTextModelWithProjection.from_pretrained(MODEL_ID, { dtype: "q8", device: "wasm" }),
        );
        this.text = { tokenizer: tokenizer as unknown as TextPipeline["tokenizer"], model: model as unknown as TextPipeline["model"] };
        return true;
      } catch {
        this.textLoading = null;
        return false;
      }
    })();
    return this.textLoading;
  }

  embed(image: ImageInput): Promise<Float32Array | null> {
    return this.serial(async () => {
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
    });
  }

  /** L2-normalised text embeddings in the image embeddings' space; null when the text half cannot load. */
  async embedTexts(texts: string[]): Promise<Float32Array[] | null> {
    if (!(await this.loadText())) return null;
    const out: Float32Array[] = [];
    for (let i = 0; i < texts.length; i += TEXT_BATCH) {
      const batch = texts.slice(i, i + TEXT_BATCH);
      const vecs = await this.serial(async () => {
        const t = this.text!;
        const r = await t.model(t.tokenizer(batch, { padding: true, truncation: true }));
        const dim = r.text_embeds.dims[1] ?? this.dimensions;
        return batch.map((_, j) => l2Normalize(r.text_embeds.data.slice(j * dim, (j + 1) * dim)));
      }).catch(() => null);
      if (!vecs) return null;
      out.push(...vecs);
      // Give the page a frame between batches.
      await new Promise((r) => setTimeout(r, 0));
    }
    return out;
  }

  private serial<T>(run: () => Promise<T>): Promise<T> {
    const next = this.chain.then(run, run);
    this.chain = next.catch(() => undefined);
    return next;
  }
}

function webgpu(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

export const clipProvider = new TransformersClipProvider();
