import type { ImageInput, ProductIdentity } from "@manufactogate/core";

/**
 * Optional, paid: names the product in a photo with Claude, using the user's own API key. Nothing
 * here runs unless a key was entered in Settings; the free in-browser model covers everyone else.
 * The SDK and zod are loaded on demand so the app bundle does not carry them.
 */

export type ClaudeModel = "claude-opus-5-5" | "claude-sonnet-5-5" | "claude-haiku-4-5";

export const CLAUDE_MODELS: { id: ClaudeModel; label: string; note: string }[] = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5", note: "en isabetli · ≈0,02–0,04 $ / fotoğraf" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", note: "≈ yarı fiyat" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", note: "en ucuz · ≈ dörtte bir fiyat" },
];

export interface ClaudeConfig {
  apiKey: string;
  model: ClaudeModel;
}

const LANGS = ["tr", "zh", "en", "ja", "ko", "ru", "de", "id", "th"] as const;

const PROMPT = `Name the product in this shopping photo so it can be searched on marketplaces (Taobao, 1688, Trendyol, Amazon and others).
- recognized: false when the photo shows no product someone could buy.
- brand: only when a logo or label is visible, or the design is unmistakable (for example a Hermès Kelly bag); otherwise "".
- model: the model name or number when it is readable or unmistakable; otherwise "".
- product_tr: the short Turkish name a shopper would type: brand (if any) + product type + at most two visible attributes such as colour or material. Lowercase except the brand.
- queries: the same search written for each market language - tr Turkish, zh Simplified Chinese as typed on Taobao/1688 (use the brand's Chinese name when it has a well-known one), en English, ja Japanese, ko Korean, ru Russian, de German, id Indonesian, th Thai. Two to six words each, no punctuation.`;

type MediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";
const MEDIA_TYPES: MediaType[] = ["image/jpeg", "image/png", "image/gif", "image/webp"];

function base64Of(dataUrl: string): { mediaType: MediaType; data: string } | null {
  const m = /^data:([^;,]+);base64,(.+)$/.exec(dataUrl);
  const mediaType = m?.[1] as MediaType | undefined;
  return m && mediaType && MEDIA_TYPES.includes(mediaType) ? { mediaType, data: m[2]! } : null;
}

async function client(cfg: ClaudeConfig, fetchImpl?: typeof fetch) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  // Browser use is deliberate: the key is the user's own, kept in this browser only.
  return new Anthropic({ apiKey: cfg.apiKey.trim(), dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 30_000, ...(fetchImpl ? { fetch: fetchImpl } : {}) });
}

/**
 * The product in the photo as Claude names it, or null when the photo shows no product, the model
 * declined, or the image format cannot be sent. API errors (bad key, rate limit, network) throw.
 */
export async function identifyWithClaude(image: ImageInput, cfg: ClaudeConfig, signal?: AbortSignal, fetchImpl?: typeof fetch): Promise<ProductIdentity | null> {
  const photo = base64Of(image.dataUrl);
  if (!photo) return null;
  const [anthropic, { z }, { betaZodOutputFormat }] = await Promise.all([client(cfg, fetchImpl), import("zod"), import("@anthropic-ai/sdk/helpers/beta/zod")]);
  const Named = z.object({
    recognized: z.boolean(),
    brand: z.string(),
    model: z.string(),
    product_tr: z.string(),
    queries: z.object({ tr: z.string(), zh: z.string(), en: z.string(), ja: z.string(), ko: z.string(), ru: z.string(), de: z.string(), id: z.string(), th: z.string() }),
  });
  const messages = [
    {
      role: "user" as const,
      content: [
        { type: "image" as const, source: { type: "base64" as const, media_type: photo.mediaType, data: photo.data } },
        { type: "text" as const, text: PROMPT },
      ],
    },
  ];
  const format = betaZodOutputFormat(Named);
  // Haiku 4.5 takes neither effort nor server-side fallbacks; the 5.5 models get both.
  const response =
    cfg.model === "claude-haiku-4-5"
      ? await anthropic.beta.messages.parse({ model: cfg.model, max_tokens: 16000, output_config: { format }, messages }, { signal })
      : await anthropic.beta.messages.parse(
          {
            model: cfg.model,
            max_tokens: 16000,
            output_config: { effort: "low", format },
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            messages,
          },
          { signal },
        );
  if (response.stop_reason === "refusal") return null;
  const out = response.parsed_output;
  const title = out?.product_tr.trim() ?? "";
  if (!out || !out.recognized || !title) return null;
  const queries: Partial<Record<string, string>> = {};
  for (const lang of LANGS) {
    const q = out.queries[lang].replace(/\s+/g, " ").trim();
    if (q) queries[lang] = q;
  }
  return { title, queries, source: "claude" };
}

/** Checks the key without spending anything: reads the chosen model's entry from the Models API. */
export async function verifyClaudeKey(cfg: ClaudeConfig, fetchImpl?: typeof fetch): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const anthropic = await client(cfg, fetchImpl);
    await anthropic.models.retrieve(cfg.model);
    return { ok: true };
  } catch (e) {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, reason: "Anahtar geçersiz" };
    if (e instanceof Anthropic.PermissionDeniedError) return { ok: false, reason: "Bu anahtarın bu modele izni yok" };
    if (e instanceof Anthropic.NotFoundError) return { ok: false, reason: "Model bu hesapta bulunamadı" };
    if (e instanceof Anthropic.RateLimitError) return { ok: false, reason: "Hız sınırına takıldı, biraz sonra dene" };
    if (e instanceof Anthropic.APIConnectionError) return { ok: false, reason: "Anthropic'e bağlanılamadı" };
    if (e instanceof Anthropic.APIError) return { ok: false, reason: `Anthropic hatası (${e.status ?? "?"})` };
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
