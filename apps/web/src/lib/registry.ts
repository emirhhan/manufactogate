import { createMockRegistry, type AdapterRegistry } from "@manufactogate/adapters";

let registry: AdapterRegistry | null = null;

/** Sprint 0: mock registry. Sprint 1 swaps in extension-backed adapters per market. */
export function getRegistry(): AdapterRegistry {
  if (!registry) registry = createMockRegistry({ "cn-1688": { latencyMs: 180 }, "cn-taobao": { latencyMs: 260 }, "cn-pinduoduo": { latencyMs: 320 } });
  return registry;
}
