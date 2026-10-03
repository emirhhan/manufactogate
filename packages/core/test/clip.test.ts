import { attachClip, clipCompatible, cosineSimilarity, noopClipProvider, NoopClipProvider, scoreMatch, type ClipProvider, type Fingerprint, type ImageInput } from "../src";

const image: ImageInput = { dataUrl: "data:image/png;base64,AAAA" };

describe("ClipProvider slot", () => {
  it("the noop provider is never ready and never embeds", async () => {
    const p = new NoopClipProvider();
    expect(p.id).toBe("noop");
    expect(p.dimensions).toBe(0);
    expect(p.isReady()).toBe(false);
    expect(await p.load()).toBe(false);
    expect(await p.embed()).toBeNull();
    const fp: Fingerprint = { title: "x" };
    expect(await attachClip(fp, noopClipProvider, image)).toBe(false);
    expect(fp.clip).toBeUndefined();
  });
  it("a ready provider attaches an L2-normalised vector that scoreMatch uses", async () => {
    const fake: ClipProvider = {
      id: "fake-2d",
      dimensions: 2,
      isReady: () => true,
      embed: async (img) => (img.region ? new Float32Array([0, 3]) : new Float32Array([3, 4])),
    };
    const a: Fingerprint = { title: "x" };
    const b: Fingerprint = { title: "x" };
    expect(await attachClip(a, fake, image)).toBe(true);
    expect(await attachClip(b, fake, { ...image, region: { x: 0, y: 0, w: 0.5, h: 0.5 } })).toBe(true);
    expect(Array.from(a.clip!)).toEqual([0.6000000238418579, 0.800000011920929]);
    expect(clipCompatible(a.clip, b.clip)).toBe(true);
    expect(cosineSimilarity(a.clip!, b.clip!)).toBeCloseTo(0.8);
    expect(scoreMatch(a, { ...a }).signals.visualClip).toBeCloseTo(1);
    expect(scoreMatch(a, b).signals.visualClip).toBeCloseTo(0.6);
  });
  it("rejects vectors of the wrong length or empty, and respects the abort signal argument", async () => {
    const wrong: ClipProvider = { id: "w", dimensions: 4, isReady: () => true, embed: async () => new Float32Array([1, 2]) };
    const fp: Fingerprint = {};
    expect(await attachClip(fp, wrong, image)).toBe(false);
    const empty: ClipProvider = { id: "e", dimensions: 0, isReady: () => true, embed: async () => new Float32Array([]) };
    expect(await attachClip(fp, empty, image)).toBe(false);
    let seen: AbortSignal | undefined;
    const spy: ClipProvider = { id: "s", dimensions: 1, isReady: () => true, embed: async (_i, signal) => { seen = signal; return new Float32Array([2]); } };
    const ac = new AbortController();
    expect(await attachClip(fp, spy, image, ac.signal)).toBe(true);
    expect(seen).toBe(ac.signal);
    expect(Array.from(fp.clip!)).toEqual([1]);
    expect(clipCompatible(fp.clip, undefined)).toBe(false);
    expect(clipCompatible(new Float32Array([1]), new Float32Array([1, 2]))).toBe(false);
  });
});
