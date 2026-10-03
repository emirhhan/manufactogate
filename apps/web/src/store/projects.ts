import { create } from "zustand";
import type { RawListing } from "@manufactogate/core";
import { db, type ProjectItemRecord, type ProjectRecord } from "@/lib/db";

interface ProjectsState {
  projects: ProjectRecord[];
  loaded: boolean;
  load(): Promise<void>;
  create(name: string): Promise<ProjectRecord>;
  rename(id: string, name: string): Promise<void>;
  setNotes(id: string, notes: string): Promise<void>;
  remove(id: string): Promise<void>;
  addListing(projectId: string, listing: RawListing, note?: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  items(projectId: string): Promise<(ProjectItemRecord & { listing: RawListing | undefined })[]>;
}

const now = () => new Date().toISOString();

export const useProjects = create<ProjectsState>((set, get) => ({
  projects: [],
  loaded: false,
  async load() {
    const projects = await db.projects.orderBy("updatedAt").reverse().toArray();
    set({ projects, loaded: true });
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
    if (!existing) await db.listings.put({ ...listing, key: listingKey, searchId: "project" });
    await db.projectItems.put({ key: `${projectId}:${listingKey}`, projectId, listingKey, note, addedAt: now() });
    await db.projects.update(projectId, { updatedAt: now() });
    await get().load();
  },
  async removeItem(key) {
    await db.projectItems.delete(key);
  },
  async items(projectId) {
    const rows = await db.projectItems.where("projectId").equals(projectId).toArray();
    const listings = await db.listings.bulkGet(rows.map((r) => r.listingKey));
    return rows.map((r, i) => ({ ...r, listing: listings[i] }));
  },
}));
