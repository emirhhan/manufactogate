export * from "./phash";
export * from "./vector";
export * from "./text";
export * from "./turkish";

import { accessoryTerms, attributes, brandModelPhrase, modelNumbers, tokens, type TitleAttributes } from "./text";

export interface Fingerprint {
  phash?: string;
  /** Difference hash, when the fingerprinter computed one. */
  dhash?: string;
  clip?: Float32Array;
  title?: string;
  /** Other renderings of the same query (per-market translations, ladder rungs). */
  altTitles?: string[];
  modelNumbers?: string[];
  /** Language-neutral category key (taxonomy leaf) when known. */
  category?: string;
  /** The market's own image search returned this candidate for the query image. */
  viaImageSearch?: boolean;
  /** Cached text signals, filled by enrichFingerprint. */
  tokens?: string[];
  altTokens?: string[][];
  attrs?: TitleAttributes;
  accessory?: string[];
  phrase?: string;
  /** Whether the image signals (phash/dhash/clip) are still being computed. */
  imagePending?: boolean;
}

/**
 * Fills the cached text signals (tokens, model numbers, attributes, accessory terms, phrase)
 * from the title when they are missing. Mutates and returns the same object so that repeated
 * scoring never re-tokenises.
 */
export function enrichFingerprint(fp: Fingerprint): Fingerprint {
  if (fp.title !== undefined) {
    if (!fp.tokens) fp.tokens = tokens(fp.title);
    if (!fp.modelNumbers) fp.modelNumbers = modelNumbers(fp.title);
    if (!fp.attrs) fp.attrs = attributes(fp.title);
    if (!fp.accessory) fp.accessory = accessoryTerms(fp.title);
    if (fp.phrase === undefined) fp.phrase = brandModelPhrase(fp.title);
  }
  if (fp.altTitles && (!fp.altTokens || fp.altTokens.length !== fp.altTitles.length)) {
    fp.altTokens = fp.altTitles.map((t) => tokens(t));
  }
  return fp;
}
