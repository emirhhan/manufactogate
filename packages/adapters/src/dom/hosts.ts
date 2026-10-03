/** Host matching shared by adapters (link resolution) and the extension (tab routing, capture). Pure. */

/**
 * Matches a hostname against a market host pattern.
 *  - "*.amazon.com" matches "amazon.com" and "www.amazon.com", never "amazon.com.tr" or "notamazon.com"
 *  - "auctions.yahoo.co.jp" matches only that host (and "www." prefixed variants are NOT implied)
 */
export function hostMatches(hostname: string, pattern: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  const p = pattern.toLowerCase().trim();
  if (!h || !p) return false;
  if (p.startsWith("*.")) {
    const base = p.slice(2);
    return h === base || h.endsWith(`.${base}`);
  }
  return h === p;
}

/** Hostname of a URL (or a bare host string), lower-cased; "" when unparsable. */
export function hostOf(url: string): string {
  try {
    return new URL(url.startsWith("//") ? `https:${url}` : url).hostname.toLowerCase();
  } catch {
    return /^[a-z0-9.-]+$/i.test(url) ? url.toLowerCase() : "";
  }
}

/** True when the URL's host matches any of the market's host patterns. */
export function urlOnHosts(url: string, hosts: readonly string[]): boolean {
  const h = hostOf(url);
  return !!h && hosts.some((p) => hostMatches(h, p));
}

/** The literal home origin for a market: wildcard patterns are turned into "www." hosts only when asked. */
export function homeOriginFor(hosts: readonly string[], searchUrl: string): string {
  try {
    return `${new URL(searchUrl).origin}/`;
  } catch {
    const first = hosts[0] ?? "";
    return `https://${first.startsWith("*.") ? `www.${first.slice(2)}` : first}/`;
  }
}
