import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { MarketId } from "@manufactogate/core";
import { enrichListing, PAGE_EXTRACTORS, REAL_DEF_BY_ID, type SearchItem } from "@manufactogate/adapters";

const manifest = JSON.parse(readFileSync(join(__dirname, "..", "public", "manifest.json"), "utf8")) as { host_permissions: string[] };
const FIXTURES = join(__dirname, "..", "..", "..", "packages", "adapters", "src");

/** Whether a "*://*.example.com/*" style match pattern covers the host. */
function covered(host: string): boolean {
  return manifest.host_permissions.some((p) => {
    const m = /^\*:\/\/(\*\.)?([^/]+)\/\*$/.exec(p);
    if (!m) return false;
    const base = m[2]!;
    return host === base || (!!m[1] && host.endsWith(`.${base}`));
  });
}

describe("manifest host permissions", () => {
  it("cover every image host the markets' result pages use, so the extension can fetch images a CDN refuses to the page", () => {
    const missing = new Map<string, string>();
    let images = 0;
    for (const market of readdirSync(FIXTURES)) {
      const def = REAL_DEF_BY_ID[market as MarketId];
      const search = PAGE_EXTRACTORS[market as MarketId]?.search;
      if (!def || !search) continue;
      let files: string[] = [];
      try {
        files = readdirSync(join(FIXTURES, market, "fixtures")).filter((f) => /^real-(search|home)/.test(f));
      } catch {
        continue;
      }
      for (const f of files) {
        const doc = new DOMParser().parseFromString(readFileSync(join(FIXTURES, market, "fixtures", f), "utf8"), "text/html");
        Object.defineProperty(doc, "location", { value: new URL(def.searchUrl(def.healthQuery)), configurable: true });
        for (const item of search(doc) as SearchItem[]) {
          const l = def.toListing(item, "2026-10-03T00:00:00Z");
          for (const src of l ? enrichListing(def, item, l).images : []) {
            images++;
            const host = new URL(src, "https://x.invalid/").hostname;
            if (!covered(host)) missing.set(host, `${market}/${f}`);
          }
        }
      }
    }
    expect(images).toBeGreaterThan(100);
    expect(Object.fromEntries(missing)).toEqual({});
  });
});
