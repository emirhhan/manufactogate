import type { Fingerprint } from "../fingerprint";
import type { RawListing } from "../model";
import { confidenceBand, scoreMatch, type ConfidenceBand, type MatchScore } from "./score";

export interface ScoredListing {
  listing: RawListing;
  fingerprint: Fingerprint;
  match: MatchScore;
  band: ConfidenceBand;
}

export interface Cluster {
  id: string;
  /** Highest-scoring listing, used for the cluster's title and image. */
  representative: ScoredListing;
  members: ScoredListing[];
  confidence: number;
  band: ConfidenceBand;
  markets: string[];
}

/**
 * Scores every candidate against the query, drops hidden ones, and groups the rest into
 * clusters by mutual similarity. Sprint 0 implementation: single-linkage with a fixed
 * threshold on candidate-to-candidate visual+text similarity.
 */
export function clusterCandidates(
  query: Fingerprint,
  candidates: { listing: RawListing; fingerprint: Fingerprint }[],
  linkThreshold = 0.7,
): { clusters: Cluster[]; similar: ScoredListing[] } {
  const scored: ScoredListing[] = [];
  for (const c of candidates) {
    const match = scoreMatch(query, c.fingerprint);
    const band = confidenceBand(match.score);
    if (band === "hidden") continue;
    scored.push({ ...c, match, band });
  }
  scored.sort((a, b) => b.match.score - a.match.score);

  const main = scored.filter((s) => s.band !== "similar");
  const similar = scored.filter((s) => s.band === "similar");

  const parent = main.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  for (let i = 0; i < main.length; i++) {
    for (let j = i + 1; j < main.length; j++) {
      const s = scoreMatch(main[i]!.fingerprint, main[j]!.fingerprint).score;
      if (s >= linkThreshold) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, ScoredListing[]>();
  main.forEach((s, i) => {
    const r = find(i);
    const g = groups.get(r) ?? [];
    g.push(s);
    groups.set(r, g);
  });

  const clusters: Cluster[] = [...groups.values()].map((members) => {
    members.sort((a, b) => b.match.score - a.match.score);
    const rep = members[0]!;
    return {
      id: `${rep.listing.market}:${rep.listing.id}`,
      representative: rep,
      members,
      confidence: rep.match.score,
      band: rep.band,
      markets: [...new Set(members.map((m) => m.listing.market))],
    };
  });
  clusters.sort((a, b) => b.confidence - a.confidence);
  return { clusters, similar };
}
