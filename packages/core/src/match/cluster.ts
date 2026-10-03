import type { Fingerprint } from "../fingerprint";
import { unitPriceNormalized, type CurrencyCode, type RawListing } from "../model";
import { CONFIDENCE_THRESHOLDS, confidenceBand, scoreMatch, type ConfidenceBand, type MatchScore } from "./score";

export interface ScoredListing {
  listing: RawListing;
  fingerprint: Fingerprint;
  match: MatchScore;
  band: ConfidenceBand;
}

export interface Cluster {
  /** Stable id: the key of the earliest-arrived member; changes only when two formed clusters merge. */
  id: string;
  /** Key ("market:id") of the highest-scoring member, for the cluster's title and image. */
  representativeKey: string;
  /** Highest-scoring listing, used for the cluster's title and image. */
  representative: ScoredListing;
  members: ScoredListing[];
  confidence: number;
  band: ConfidenceBand;
  markets: string[];
  /** Per-currency unit price range across members (pack quantities normalised). */
  priceRange: Record<CurrencyCode, { min: number; max: number }>;
}

export interface ClusterSnapshot {
  clusters: Cluster[];
  similar: ScoredListing[];
  /** Similar candidates grouped by category key, for "satan var mı" when the exact product is missing. */
  similarByCategory: Record<string, ScoredListing[]>;
}

export interface Candidate {
  listing: RawListing;
  fingerprint: Fingerprint;
}

export const keyOf = (l: Pick<RawListing, "market" | "id">): string => `${l.market}:${l.id}`;

interface Entry {
  index: number;
  key: string;
  candidate: Candidate;
  scored: ScoredListing | null;
  group: number | null;
}

interface Group {
  anchorIndex: number;
  members: Set<number>;
  /** Cached probe members; cleared whenever membership changes. */
  probes: Entry[] | null;
}

/** How many members of a group a newcomer is compared with (the representative plus the most recent). */
const PROBE_MEMBERS = 3;

/**
 * Incremental single-linkage clusterer. Candidates are scored against the query once when
 * added (or re-scored when their fingerprint changes), and linked to existing groups by
 * comparing with a few representatives instead of every pair. Cluster ids are anchored to
 * the earliest member so that UI state keyed by id survives reclustering.
 */
export class IncrementalClusterer {
  private entries = new Map<number, Entry>();
  private groups = new Map<number, Group>();
  private nextGroup = 0;
  private dirty = true;
  private cache: ClusterSnapshot | null = null;

  constructor(
    private readonly query: Fingerprint,
    private readonly linkThreshold: number = CONFIDENCE_THRESHOLDS.likely,
  ) {}

  get size(): number {
    return this.entries.size;
  }

  /** Adds (or replaces) a candidate at a stable arrival index. */
  add(candidate: Candidate, index?: number): number {
    const i = index ?? this.entries.size;
    const existing = this.entries.get(i);
    if (existing) this.detach(existing);
    const e: Entry = { index: i, key: keyOf(candidate.listing), candidate, scored: null, group: null };
    this.entries.set(i, e);
    this.place(e);
    this.dirty = true;
    return i;
  }

  /** Re-scores a candidate whose fingerprint was updated in place (image hash arrived). */
  markDirty(index: number): void {
    const e = this.entries.get(index);
    if (!e) return;
    this.detach(e);
    this.place(e);
    this.dirty = true;
  }

  private detach(e: Entry) {
    if (e.group !== null) {
      const g = this.groups.get(e.group);
      if (g) {
        g.members.delete(e.index);
        g.probes = null;
        if (g.members.size === 0) this.groups.delete(e.group);
        else g.anchorIndex = Math.min(...g.members);
      }
      e.group = null;
    }
    e.scored = null;
  }

  private place(e: Entry) {
    const match = scoreMatch(this.query, e.candidate.fingerprint);
    const band = confidenceBand(match.score);
    if (band === "hidden") return;
    e.scored = { ...e.candidate, match, band };
    if (band === "similar") return;
    // Link against existing groups.
    const linked: number[] = [];
    for (const [gid, g] of this.groups) {
      if (this.linksTo(e, g)) linked.push(gid);
    }
    if (linked.length === 0) {
      const gid = this.nextGroup++;
      this.groups.set(gid, { anchorIndex: e.index, members: new Set([e.index]), probes: null });
      e.group = gid;
      return;
    }
    // Merge every linked group into the one with the lowest anchor.
    linked.sort((a, b) => this.groups.get(a)!.anchorIndex - this.groups.get(b)!.anchorIndex);
    const target = this.groups.get(linked[0]!)!;
    for (const gid of linked.slice(1)) {
      const g = this.groups.get(gid)!;
      for (const m of g.members) {
        target.members.add(m);
        const me = this.entries.get(m);
        if (me) me.group = linked[0]!;
      }
      this.groups.delete(gid);
    }
    target.members.add(e.index);
    target.probes = null;
    target.anchorIndex = Math.min(target.anchorIndex, e.index);
    e.group = linked[0]!;
  }

  private linksTo(e: Entry, g: Group): boolean {
    const probes = this.probeMembers(g);
    for (const p of probes) {
      const s = scoreMatch(p.candidate.fingerprint, e.candidate.fingerprint, { symmetric: true }).score;
      if (s >= this.linkThreshold) return true;
    }
    return false;
  }

  private probeMembers(g: Group): Entry[] {
    if (g.probes) return g.probes;
    const members = [...g.members].map((i) => this.entries.get(i)!).filter((m) => m.scored);
    members.sort((a, b) => b.scored!.match.score - a.scored!.match.score);
    const out: Entry[] = members.slice(0, 1);
    const recent = members.slice(1).sort((a, b) => b.index - a.index).slice(0, PROBE_MEMBERS - 1);
    g.probes = [...out, ...recent];
    return g.probes;
  }

  snapshot(): ClusterSnapshot {
    if (!this.dirty && this.cache) return this.cache;
    const clusters: Cluster[] = [];
    for (const g of this.groups.values()) {
      const members = [...g.members].map((i) => this.entries.get(i)!.scored!).filter(Boolean);
      if (!members.length) continue;
      members.sort((a, b) => b.match.score - a.match.score);
      const rep = members[0]!;
      const anchor = this.entries.get(g.anchorIndex)!;
      const priceRange: Cluster["priceRange"] = {};
      for (const m of members) {
        const p = unitPriceNormalized(m.listing);
        if (p === null) continue;
        const cur = m.listing.price.currency;
        const r = priceRange[cur] ?? { min: p, max: p };
        r.min = Math.min(r.min, p);
        r.max = Math.max(r.max, p);
        priceRange[cur] = r;
      }
      clusters.push({
        id: anchor.key,
        representativeKey: keyOf(rep.listing),
        representative: rep,
        members,
        confidence: rep.match.score,
        band: rep.band,
        markets: [...new Set(members.map((m) => m.listing.market))],
        priceRange,
      });
    }
    clusters.sort((a, b) => b.confidence - a.confidence);
    const similar: ScoredListing[] = [];
    const similarByCategory: Record<string, ScoredListing[]> = {};
    const ordered = [...this.entries.values()].sort((a, b) => a.index - b.index);
    for (const e of ordered) {
      if (!e.scored || e.scored.band !== "similar") continue;
      similar.push(e.scored);
      const cat = e.candidate.fingerprint.category;
      if (cat) (similarByCategory[cat] ??= []).push(e.scored);
    }
    similar.sort((a, b) => b.match.score - a.match.score);
    this.cache = { clusters, similar, similarByCategory };
    this.dirty = false;
    return this.cache;
  }
}

/**
 * Scores every candidate against the query, drops hidden ones, and groups the rest into
 * clusters by mutual similarity. Convenience wrapper over IncrementalClusterer.
 */
export function clusterCandidates(query: Fingerprint, candidates: Candidate[], linkThreshold: number = CONFIDENCE_THRESHOLDS.likely): ClusterSnapshot {
  const c = new IncrementalClusterer(query, linkThreshold);
  candidates.forEach((cand, i) => c.add(cand, i));
  return c.snapshot();
}
