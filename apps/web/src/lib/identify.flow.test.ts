import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clipProvider } from "./clip";
import { clearData } from "./db";
import { identifyProduct, labelBank, labelPrompts, resetLabelBankForTests } from "./identify";

vi.mock("./claudeIdentify", () => ({
  identifyWithClaude: vi.fn(async () => {
    throw new Error("401 invalid x-api-key");
  }),
}));

/** Stand-in for the CLIP text model: prompt i becomes the unit vector on axis i (no overlap between labels). */
const DIM = 1024;
function fakeEmbedTexts(texts: string[]): Promise<Float32Array[]> {
  return Promise.resolve(
    texts.map((_, i) => {
      const v = new Float32Array(DIM);
      v[i] = 1;
      return v;
    }),
  );
}
function promptVector(prompt: string): Float32Array {
  const p = labelPrompts();
  const all = [...p.categories, ...p.colors, ...p.materials, ...p.brands, ...p.noBrand];
  const v = new Float32Array(DIM);
  v[all.indexOf(prompt)] = 1;
  return v;
}

beforeEach(async () => {
  await clearData("settings");
  resetLabelBankForTests();
});
afterEach(() => vi.restoreAllMocks());

describe("free product namer, end to end with a stand-in model", () => {
  it("embeds every label once, then reuses the copy kept in IndexedDB", async () => {
    const spy = vi.spyOn(clipProvider, "embedTexts").mockImplementation(fakeEmbedTexts);
    const bank = await labelBank();
    const p = labelPrompts();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![0]).toHaveLength(p.categories.length + p.colors.length + p.materials.length + p.brands.length + p.noBrand.length);
    expect(bank!.categories).toHaveLength(p.categories.length);
    resetLabelBankForTests();
    const again = await labelBank();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(again!.categories[5]!.vec).toEqual(bank!.categories[5]!.vec);
  });

  it("names the product of a photo from its embedding, and falls back to the free model when Claude fails", async () => {
    vi.spyOn(clipProvider, "embedTexts").mockImplementation(fakeEmbedTexts);
    const photo = promptVector("a photo of a thermos");
    const id = await identifyProduct({ dataUrl: "data:image/jpeg;base64,AAAA" }, { clip: photo }, { local: true, claude: { apiKey: "sk-bad", model: "claude-opus-5-5" } });
    expect(id).toMatchObject({ title: "termos", source: "local", queries: { zh: "保温杯", en: "thermos" } });
  });

  it("stays silent when the free model is off and there is no key, or when the text model cannot load", async () => {
    vi.spyOn(clipProvider, "embedTexts").mockImplementation(fakeEmbedTexts);
    expect(await identifyProduct({ dataUrl: "data:," }, { clip: promptVector("a photo of a thermos") }, { local: false })).toBeNull();
    resetLabelBankForTests();
    await clearData("settings");
    vi.spyOn(clipProvider, "embedTexts").mockResolvedValue(null);
    expect(await identifyProduct({ dataUrl: "data:," }, { clip: promptVector("a photo of a thermos") }, { local: true })).toBeNull();
  });
});
