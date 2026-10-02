import type { MarketAdapter, MarketId } from "@manufactogate/core";

export class AdapterRegistry {
  private readonly map = new Map<MarketId, MarketAdapter>();

  register(adapter: MarketAdapter): this {
    if (this.map.has(adapter.id)) throw new Error(`adapter already registered: ${adapter.id}`);
    this.map.set(adapter.id, adapter);
    return this;
  }
  get(id: MarketId): MarketAdapter | undefined {
    return this.map.get(id);
  }
  all(): MarketAdapter[] {
    return [...this.map.values()];
  }
  sources(): MarketAdapter[] {
    return this.all().filter((a) => a.meta.role !== "target");
  }
  targets(): MarketAdapter[] {
    return this.all().filter((a) => a.meta.role !== "source");
  }
  /** Finds the adapter that owns a URL, if any. */
  resolve(url: string): { adapter: MarketAdapter; listingId: string } | null {
    for (const a of this.map.values()) {
      const info = a.resolveLink(url);
      if (info) return { adapter: a, listingId: info.listingId };
    }
    return null;
  }
}
