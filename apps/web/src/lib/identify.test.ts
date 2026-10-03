import { describe, expect, it } from "vitest";
import { getLeaves, photoTerms } from "@manufactogate/adapters";
import { BRANDS, labelPrompts, MIN_CATEGORY_PROB, nameProduct, softmax, type LabelBank } from "./identify";

const DIM = 64;
/** Unit vector along one axis. */
function axis(i: number): Float32Array {
  const v = new Float32Array(DIM);
  v[i % DIM] = 1;
  return v;
}
/** Normalised mix of axes with weights. */
function mix(parts: [number, number][]): Float32Array {
  const v = new Float32Array(DIM);
  for (const [i, w] of parts) v[i % DIM]! += w;
  let n = 0;
  for (const x of v) n += x * x;
  return v.map((x) => x / Math.sqrt(n));
}

/**
 * A tiny bank on separate axes: category k on axis k, colours on 20+, materials on 40+, brands on
 * 50+, "no brand" on 60+. Similarities are 0 or 1 apart, so CLIP's ×100 logit scale makes clear winners.
 */
function bank(): LabelBank {
  const leaves = getLeaves();
  const bag = leaves.find((l) => l.tr === "Çapraz Çanta")!;
  const thermos = leaves.find((l) => l.tr === "Termos")!;
  const { colors, materials } = photoTerms();
  return {
    categories: [
      { leaf: bag, vec: axis(1) },
      { leaf: thermos, vec: axis(2) },
    ],
    colors: colors.slice(0, 3).map((term, i) => ({ term, vec: axis(20 + i) })),
    materials: materials.filter((m) => m.tr === "deri" || m.tr === "plastik").map((term, i) => ({ term, vec: axis(40 + i) })),
    brands: BRANDS.filter((b) => b.name === "Hermès" || b.name === "Stanley").map((brand, i) => ({ brand, vec: axis(50 + i) })),
    noBrand: [axis(60)],
  };
}

describe("naming a product from its photo (free model)", () => {
  it("names category, colour, material and brand, and spells the query per market language", () => {
    const b = bank();
    const black = b.colors.find((c) => c.term.tr === "siyah")!;
    const leather = b.materials.find((m) => m.term.tr === "deri")!;
    const hermes = b.brands.find((x) => x.brand.name === "Hermès")!;
    const blackAxis = b.colors.indexOf(black) + 20;
    const leatherAxis = b.materials.indexOf(leather) + 40;
    const hermesAxis = b.brands.indexOf(hermes) + 50;
    const id = nameProduct(mix([[1, 1], [blackAxis, 1], [leatherAxis, 1], [hermesAxis, 1]]), b)!;
    expect(id.source).toBe("local");
    expect(id.title).toBe("Hermès siyah deri çapraz çanta");
    expect(id.queries?.zh).toBe("爱马仕 黑色 皮革 斜挎包");
    expect(id.queries?.en).toBe("Hermes black leather crossbody bag");
    expect(id.queries?.tr).toBe("Hermes Siyah Deri Çapraz Çanta");
    expect(id.confidence).toBeGreaterThan(0.9);
  });

  it("leaves the brand out when the photo looks unbranded, and attributes out when unsure", () => {
    const b = bank();
    // Thermos axis, "no brand" axis; colours and materials all equally (un)likely.
    const id = nameProduct(mix([[2, 1], [60, 1]]), b)!;
    expect(id.title).toBe("termos");
    expect(id.queries?.zh).toBe("保温杯");
  });

  it("gives up (so the search borrows a title instead) when no category stands out", () => {
    const b = bank();
    // Equal pull towards both categories and nothing else: 50/50 is above the floor, so add noise categories.
    const many: LabelBank = { ...b, categories: getLeaves().slice(0, 40).map((leaf, i) => ({ leaf, vec: axis(i) })) };
    const flat = mix(Array.from({ length: 40 }, (_, i) => [i, 1] as [number, number]));
    expect(nameProduct(flat, many)).toBeNull();
    expect(1 / 40).toBeLessThan(MIN_CATEGORY_PROB);
  });

  it("softmax is stable and sums to one", () => {
    const p = softmax([0.31, 0.29, 0.1]);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    expect(p[0]).toBeGreaterThan(p[1]!);
    expect(softmax([])).toEqual([]);
  });

  it("asks the model about every category, colour, material and brand in a fixed order", () => {
    const p = labelPrompts();
    expect(p.categories.length).toBe(getLeaves().length);
    expect(p.categories[0]).toMatch(/^a photo of a /);
    expect(p.brands.length).toBe(BRANDS.length);
    expect(p.colors.length).toBeGreaterThanOrEqual(10);
    expect(new Set(BRANDS.map((b) => b.name)).size).toBe(BRANDS.length);
  });
});

describe("naming a photo from its image-search results (brand + model + type)", () => {
  it("AGV Pista image results → 'AGV Pista GP RR kask', spelled per market", async () => {
    const { identityFromResults } = await import("./identify");
    const id = identityFromResults(
      ["AGV PISTA GP RR碳纤维全盔赛道头盔男摩托车", "意大利AGV PISTA GPRR 罗西限量版 头盔", "AGV Pista GP RR 头盔 碳纤维 全盔", "正品AGV PISTA GP RR mono carbon 摩托车头盔", "摩托车头盔男全盔 3C认证 ABS"],
      { title: "kask", source: "local", categoryKey: "kask" },
    )!;
    expect(id).toMatchObject({ title: "AGV Pista GP RR kask", source: "local", fromResults: true });
    expect(id.queries).toMatchObject({ tr: "AGV Pista GP RR Kask", zh: "AGV Pista GP RR 头盔", en: "AGV Pista GP RR helmet" });
  });

  it("results that share no brand or model give no name (the search keeps the typical result title)", async () => {
    const { identityFromResults } = await import("./identify");
    expect(identityFromResults(["摩托车头盔男全盔 3C认证 ABS", "电动车头盔 四季通用 3C认证", "机车头盔 复古 半盔"], { title: "kask", source: "local" })).toBeNull();
  });
});
