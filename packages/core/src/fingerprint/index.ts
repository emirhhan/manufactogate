export * from "./phash";
export * from "./vector";
export * from "./text";

export interface Fingerprint {
  phash?: string;
  clip?: Float32Array;
  title?: string;
  modelNumbers?: string[];
}
