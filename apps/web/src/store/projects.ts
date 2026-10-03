import { create } from "zustand";
import type { RawListing } from "@manufactogate/core";
import { db, upsertListing, type ProjectItemRecord, type ProjectItemStatus, type ProjectRecord } from "@/lib/db";

export type ProjectItem = ProjectItemRecord & { listing: RawListing | undefined };

export const ITEM_STATUS_TR: Record<ProjectItemStatus, string> = { aday: "aday", numune: "numune", secildi: "seçildi", elendi: "elendi" };
export const ITEM_STATUSES: ProjectItemStatus[] = ["aday", "numune", "secildi", "elendi"];

interface ProjectsState {
  projects: ProjectRecord[];
  counts: Record<string, number>;
  loaded: boolean;
  /** Increments on every write so pages can refetch items without depending on the projects array identity. */
  version: number;
  load(): Promise<void>;
  create(name: string): Promise<ProjectRecord>;
  rename(id: string, name: string): Promise<void>;
  setNotes(id: string, notes: string): Promise<void>;
  setDecision(id: string, decision: string): Promise<void>;
  remove(id: string): Promise<void>;
  addListing(projectId: string, listing: RawListing, note?: string): Promise<void>;
  addListings(projectId: string, listings: RawListing[]): Promise<number>;
  removeItem(key: string): Promise<void>;
  setItemNote(key: string, note: string): Promise<void>;
  setItemStatus(key: string, status: ProjectItemStatus | null): Promise<void>;
  items(projectId: string): Promise<ProjectItem[]>;
}

const now = () => new Date().toISOString();

/** Items per project id. Pure. */
export function countByProject(items: Pick<ProjectItemRecord, "projectId">[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items) out[it.projectId] = (out[it.projectId] ?? 0) + 1;
  return out;
}

export const useProjects = create<ProjectsState>((set, get) => ({
  projects: [],
  counts: {},
  loaded: false,
  version: 0,
  async load() {
    const projects = await db.projects.orderBy("updatedAt").reverse().toArray();
    const counts = countByProject(await db.projectItems.toArray());
    set((s) => ({ projects, counts, loaded: true, version: s.version + 1 }));
  },
  async create(name) {
    const p: ProjectRecord = { id: crypto.randomUUID(), name: name.trim() || "Yeni proje", notes: "", createdAt: now(), updatedAt: now() };
    await db.projects.put(p);
    await get().load();
    return p;
  },
  async rename(id, name) {
    await db.projects.update(id, { name, updatedAt: now() });
    await get().load();
  },
  async setNotes(id, notes) {
    await db.projects.update(id, { notes, updatedAt: now() });
    await get().load();
  },
  async setDecision(id, decision) {
    await db.projects.update(id, { decision, updatedAt: now() });
    await get().load();
  },
  async remove(id) {
    await db.transaction("rw", db.projects, db.projectItems, async () => {
      await db.projectItems.where("projectId").equals(id).delete();
      await db.projects.delete(id);
    });
    await get().load();
  },
  async addListing(projectId, listing, note = "") {
    const listingKey = `${listing.market}:${listing.id}`;
    const existing = await db.listings.get(listingKey);
    if (!existing) await upsertListing(listing);
    await db.projectItems.put({ key: `${projectId}:${listingKey}`, projectId, listingKey, note, addedAt: now() });
    await db.projects.update(projectId, { updatedAt: now() });
    await get().load();
  },
  async addListings(projectId, listings) {
    let added = 0;
    await db.transaction("rw", db.listings, db.projectItems, db.projects, async () => {
      for (const listing of listings) {
        const listingKey = `${listing.market}:${listing.id}`;
        const key = `${projectId}:${listingKey}`;
        if (await db.projectItems.get(key)) continue;
        if (!(await db.listings.get(listingKey))) await db.listings.put({ ...listing, key: listingKey });
        await db.projectItems.put({ key, projectId, listingKey, note: "", addedAt: now() });
        added++;
      }
      await db.projects.update(projectId, { updatedAt: now() });
    });
    await get().load();
    return added;
  },
  async removeItem(key) {
    const row = await db.projectItems.get(key);
    await db.projectItems.delete(key);
    if (row) await db.projects.update(row.projectId, { updatedAt: now() });
    await get().load();
  },
  async setItemNote(key, note) {
    await db.projectItems.update(key, { note });
    set((s) => ({ version: s.version + 1 }));
  },
  async setItemStatus(key, status) {
    if (status === null) await db.projectItems.where("key").equals(key).modify((it) => { delete it.status; });
    else await db.projectItems.update(key, { status });
    set((s) => ({ version: s.version + 1 }));
  },
  async items(projectId) {
    const rows = await db.projectItems.where("projectId").equals(projectId).toArray();
    rows.sort((a, b) => (a.addedAt < b.addedAt ? 1 : -1));
    const listings = await db.listings.bulkGet(rows.map((r) => r.listingKey));
    return rows.map((r, i) => ({ ...r, listing: listings[i] }));
  },
}));
