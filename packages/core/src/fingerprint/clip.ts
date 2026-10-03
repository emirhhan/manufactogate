/**
 * CLIP embedding slot (PLAN §4.2/4.3). `Fingerprint.clip` is optional: scoreMatch only uses it when
 * both sides carry a vector of the same length. This file defines the provider contract the web
 * app can fulfil later with a browser model (transformers.js, WebGPU/WASM) and a no-op provider so
 * the pipeline runs today without any model. Nothing here downloads anything: a real provider must
 * load weights the user placed or approved explicitly (see packages/core/golden/README.md).
 */
import type { ImageInput } from "../model";
import type { Fingerprint } from "./index";
import { l2Normalize } from "./vector";

export interface ClipProvider {
  /** Stable id ("noop", "clip-vit-b32-wasm"); stored next to cached vectors so providers never mix. */
  readonly id: string;
  /** Embedding length (512 for ViT-B/32). 0 for a provider that never embeds. */
  readonly dimensions: number;
  /** True when the model is loaded and `embed` can answer. Must not trigger a load. */
  isReady(): boolean;
  /**
   * Loads the model from where the host put it (user-chosen files, the browser cache). Resolves
   * false when the weights are not available. Must never fetch weights from the network on its own.
   */
  load?(signal?: AbortSignal): Promise<boolean>;
  /** Embedding of an image (optionally cropped to `image.region`), or null when the provider cannot embed it. */
  embed(image: ImageInput, signal?: AbortSignal): Promise<Float32Array | null>;
}

/** Provider used until a browser model is plugged in: never ready, never embeds. */
export class NoopClipProvider implements ClipProvider {
  readonly id = "noop";
  readonly dimensions = 0;
  isReady(): boolean {
    return false;
  }
  async load(): Promise<boolean> {
    return false;
  }
  async embed(): Promise<Float32Array | null> {
    return null;
  }
}

export const noopClipProvider: ClipProvider = new NoopClipProvider();

/** Two vectors can be compared only when they come from the same provider (same length). */
export function clipCompatible(a: ArrayLike<number> | undefined, b: ArrayLike<number> | undefined): boolean {
  return !!a && !!b && a.length > 0 && a.length === b.length;
}

/**
 * Asks the provider for the image's embedding and stores it (L2-normalised) on the fingerprint.
 * Returns true when a vector was attached; a not-ready provider or a null embedding leaves the
 * fingerprint untouched so text and pHash signals keep working.
 */
export async function attachClip(fp: Fingerprint, provider: ClipProvider, image: ImageInput, signal?: AbortSignal): Promise<boolean> {
  if (!provider.isReady()) return false;
  const v = await provider.embed(image, signal);
  if (!v || v.length === 0 || (provider.dimensions > 0 && v.length !== provider.dimensions)) return false;
  fp.clip = l2Normalize(v);
  return true;
}
