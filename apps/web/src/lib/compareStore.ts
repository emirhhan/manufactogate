import { useSyncExternalStore } from "react";
import type { RawListing } from "@manufactogate/core";

/**
 * Side-by-side compare selection (up to 4 listings across markets). A tiny module store with
 * useSyncExternalStore: shared by result cards, cluster rows and the drawer, outside store/*.
 */
export const COMPARE_MAX = 4;
export const keyOf = (l: Pick<RawListing, "market" | "id">) => `${l.market}:${l.id}`;

let items: RawListing[] = [];
let open = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const compareStore = {
  items: () => items,
  isOpen: () => open,
  has: (l: Pick<RawListing, "market" | "id">) => items.some((x) => keyOf(x) === keyOf(l)),
  /** Adds the listing; returns false when the drawer is full. */
  add(l: RawListing): boolean {
    if (compareStore.has(l)) return true;
    if (items.length >= COMPARE_MAX) return false;
    items = [...items, l];
    emit();
    return true;
  },
  remove(l: Pick<RawListing, "market" | "id">) {
    items = items.filter((x) => keyOf(x) !== keyOf(l));
    emit();
  },
  toggle(l: RawListing): boolean {
    if (compareStore.has(l)) {
      compareStore.remove(l);
      return true;
    }
    return compareStore.add(l);
  },
  clear() {
    items = [];
    open = false;
    emit();
  },
  setOpen(v: boolean) {
    open = v;
    emit();
  },
};

const snapshot = () => items;
const openSnapshot = () => open;
export function useCompareItems(): RawListing[] {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
export function useCompareOpen(): boolean {
  return useSyncExternalStore(subscribe, openSnapshot, openSnapshot);
}
