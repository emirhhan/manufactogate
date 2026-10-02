import { createMockRegistry, createRealRegistry, type AdapterRegistry } from "@manufactogate/adapters";
import { ExtensionRunner } from "./bridge";

export type DataSource = "mock" | "extension";

let mode: DataSource = "mock";
let mock: AdapterRegistry | null = null;
let real: AdapterRegistry | null = null;

/** Switches which registry getRegistry() returns. The App sets this from settings + extension detection. */
export function setDataSource(next: DataSource) {
  mode = next;
}
export function getDataSource(): DataSource {
  return mode;
}

export function getRegistry(): AdapterRegistry {
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
