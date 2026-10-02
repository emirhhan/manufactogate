export * from "./phash";
export * from "./vector";
export * from "./text";
export * from "./turkish";

export interface Fingerprint {
  phash?: string;
  clip?: Float32Array;
  title?: string;
  modelNumbers?: string[];
  /** The market's own image search returned this candidate for the query image. */
  viaImageSearch?: boolean;
}
