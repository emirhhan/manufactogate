import type { ImageInput } from "@manufactogate/core";
import { setRegistryForTests } from "../src/lib/registry";
import { db } from "../src/lib/db";
import { resetSearchSession, useSearch } from "../src/store/search";
import { useSettings } from "../src/store/settings";
import { clearDb, fakeAdapter, registryOf, waitFor } from "./helpers";

const named = vi.hoisted(() => ({ calls: 0 }));
vi.mock("../src/lib/identify", () => ({
  identifyProduct: vi.fn(async () => {
    named.calls++;
    return { title: "termos", queries: { zh: "保温杯" }, source: "local", confidence: 0.9 };
  }),
  warmLabelBank: () => undefined,
}));

const photo: ImageInput = { dataUrl: "data:image/jpeg;base64,AAAA" };

beforeEach(async () => {
  await clearDb();
  resetSearchSession();
  named.calls = 0;
  useSettings.setState({ hydrated: true, search: { maxPerMarket: 150, visualAi: true } });
});
afterEach(() => setRegistryForTests(null));

describe("photo search: naming the product in the store", () => {
  it("names the photo once, searches text markets with the name, saves it with the search, and a retry reuses it", async () => {
    const zh = fakeAdapter("cn-pinduoduo", { language: "zh" });
    setRegistryForTests(registryOf(zh));
    const id = await useSearch.getState().start({ kind: "image", image: photo }, ["cn-pinduoduo"]);
    await waitFor(() => !useSearch.getState().running);
    expect(named.calls).toBe(1);
    expect(useSearch.getState().identity).toMatchObject({ title: "termos", source: "local" });
    expect(zh.calls[0]).toBe("保温杯");
    expect((await db.searches.get(id))?.identity?.title).toBe("termos");

    await useSearch.getState().retryMarket("cn-pinduoduo");
    await waitFor(() => useSearch.getState().retrying.length === 0);
    expect(named.calls).toBe(1);
    expect(zh.calls.filter((q) => q === "保温杯").length).toBe(2);
  });
});
