import { createMockRegistry, createRealRegistry, type AdapterRegistry } from "@manufactogate/adapters";
import { ExtensionRunner } from "./bridge";

export type DataSource = "mock" | "extension";

let mode: DataSource = "mock";
let mock: AdapterRegistry | null = null;
let real: AdapterRegistry | null = null;
let override: AdapterRegistry | null = null;
const listeners = new Set<(m: DataSource) => void>();

/** Switches which registry getRegistry() returns. The extension store sets this from settings + detection. */
export function setDataSource(next: DataSource) {
  if (mode === next) return;
  mode = next;
  for (const cb of listeners) cb(next);
}
export function getDataSource(): DataSource {
  return mode;
}
/** Notifies when the data source flips; React code should subscribe through `useExtension` instead. */
export function onDataSourceChange(cb: (m: DataSource) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getRegistry(): AdapterRegistry {
  if (override) return override;
  if (mode === "extension") {
    if (!real) real = createRealRegistry(new ExtensionRunner());
    return real;
  }
  if (!mock) mock = createMockRegistry({ "cn-1688": { latencyMs: 180 }, "cn-taobao": { latencyMs: 260 }, "cn-pinduoduo": { latencyMs: 320 } });
  return mock;
}

/** The mock registry is always available for the catalog feed, whatever the data source. */
export function getMockRegistry(): AdapterRegistry {
  if (!mock) mock = createMockRegistry();
  return mock;
}

/** Test hook: makes getRegistry() return a hand-built registry (null restores normal behaviour). */
export function setRegistryForTests(reg: AdapterRegistry | null): void {
  override = reg;
}

/** Coarse region of a market's country, for grouping and identity hues. Pure. */
export type Region = "cn" | "tr" | "asia" | "jpkr" | "west" | "me" | "ru" | "global";
export const REGION_LABELS_TR: Record<Region, string> = {
  cn: "Çin",
  tr: "Türkiye",
  asia: "Güney ve Güneydoğu Asya",
  jpkr: "Japonya ve Kore",
  west: "Avrupa ve Amerika",
  me: "Orta Doğu",
  ru: "Rusya",
  global: "Küresel",
};
export const REGION_ORDER: Region[] = ["cn", "tr", "west", "asia", "jpkr", "me", "ru", "global"];
export function regionOf(country: string): Region {
  switch (country.toLowerCase()) {
    case "cn":
    case "hk":
    case "tw":
      return "cn";
    case "tr":
      return "tr";
    case "in":
    case "id":
    case "th":
    case "vn":
    case "my":
    case "ph":
    case "sg":
    case "pk":
    case "bd":
      return "asia";
    case "jp":
    case "kr":
      return "jpkr";
    case "us":
    case "gb":
    case "de":
    case "fr":
    case "it":
    case "es":
    case "nl":
    case "pl":
    case "ro":
    case "ca":
    case "au":
    case "br":
    case "mx":
      return "west";
    case "ae":
    case "sa":
    case "eg":
      return "me";
    case "ru":
    case "kz":
    case "ua":
      return "ru";
    default:
      return "global";
  }
}
