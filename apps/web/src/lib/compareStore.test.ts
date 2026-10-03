import { beforeEach, describe, expect, it } from "vitest";
import type { RawListing } from "@manufactogate/core";
import { COMPARE_MAX, compareStore } from "./compareStore";

const L = (id: string): RawListing => ({ market: "cn-1688", id, url: "", title: id, images: [], price: { currency: "CNY", tiers: [] }, badges: [], fetchedAt: "" });

beforeEach(() => compareStore.clear());

describe("compareStore", () => {
  it("adds up to the cap, toggles and removes", () => {
    for (let i = 0; i < COMPARE_MAX; i++) expect(compareStore.add(L(String(i)))).toBe(true);
    expect(compareStore.add(L("extra"))).toBe(false);
    expect(compareStore.items()).toHaveLength(COMPARE_MAX);
    expect(compareStore.has(L("0"))).toBe(true);
    expect(compareStore.toggle(L("0"))).toBe(true);
    expect(compareStore.has(L("0"))).toBe(false);
    expect(compareStore.add(L("0"))).toBe(true); // re-adding an existing is idempotent
    expect(compareStore.add(L("0"))).toBe(true);
    compareStore.remove(L("1"));
    expect(compareStore.items().map((x) => x.id)).toEqual(["2", "3", "0"]);
  });
  it("open state and clear", () => {
    compareStore.setOpen(true);
    expect(compareStore.isOpen()).toBe(true);
    compareStore.clear();
    expect(compareStore.isOpen()).toBe(false);
    expect(compareStore.items()).toEqual([]);
  });
});
