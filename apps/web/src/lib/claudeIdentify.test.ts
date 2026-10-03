import { describe, expect, it } from "vitest";
import { identifyWithClaude, verifyClaudeKey } from "./claudeIdentify";

const PHOTO = { dataUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRg==" };

const NAMED = {
  recognized: true,
  brand: "Hermès",
  model: "Kelly",
  product_tr: "Hermès Kelly siyah deri çanta",
  queries: { tr: "Hermes Kelly çanta", zh: "爱马仕 凯莉包", en: "Hermes Kelly bag", ja: "エルメス ケリー", ko: "에르메스 켈리백", ru: "сумка Hermes Kelly", de: "Hermes Kelly Tasche", id: "tas Hermes Kelly", th: "กระเป๋า Hermes Kelly" },
};

function message(model: string, content: unknown[], stop_reason = "end_turn") {
  return { id: "msg_test", type: "message", role: "assistant", model, content, stop_reason, stop_sequence: null, usage: { input_tokens: 1500, output_tokens: 120 } };
}

/** Records the request and answers with a canned Messages API response; no network, no cost. */
function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; headers: Headers; body: Record<string, unknown> }[] = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), headers: new Headers(init?.headers), body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {} });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "request-id": "req_test" } });
  }) as typeof fetch;
  return { f, calls };
}

describe("naming a product with Claude (optional, user's key)", () => {
  it("sends the photo with low effort and default fallbacks, and reads the structured answer", async () => {
    const { f, calls } = fakeFetch(200, message("claude-opus-5-5", [{ type: "text", text: JSON.stringify(NAMED) }]));
    const id = await identifyWithClaude(PHOTO, { apiKey: "sk-ant-test", model: "claude-opus-5-5" }, undefined, f);
    expect(id).toEqual({ title: "Hermès Kelly siyah deri çanta", queries: NAMED.queries, source: "claude" });
    const req = calls[0]!;
    expect(req.url).toContain("/v1/messages");
    expect(req.headers.get("x-api-key")).toBe("sk-ant-test");
    expect(req.headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    expect(req.headers.get("anthropic-dangerous-direct-browser-access")).toBe("true");
    expect(req.body).toMatchObject({ model: "claude-opus-5-5", fallbacks: "default", output_config: { effort: "low", format: { type: "json_schema" } } });
    const content = (req.body.messages as { content: { type: string; source?: { media_type: string } }[] }[])[0]!.content;
    expect(content[0]).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/jpeg" } });
  });

  it("Haiku gets neither effort nor fallbacks", async () => {
    const { f, calls } = fakeFetch(200, message("claude-haiku-4-5", [{ type: "text", text: JSON.stringify(NAMED) }]));
    await identifyWithClaude(PHOTO, { apiKey: "k", model: "claude-haiku-4-5" }, undefined, f);
    expect(calls[0]!.body.fallbacks).toBeUndefined();
    expect((calls[0]!.body.output_config as { effort?: string }).effort).toBeUndefined();
    expect(calls[0]!.headers.get("anthropic-beta") ?? "").not.toContain("server-side-fallback");
  });

  it("returns null for a declined request, a photo with no product, or an image format Claude cannot take", async () => {
    const refused = fakeFetch(200, message("claude-opus-5-5", [], "refusal"));
    expect(await identifyWithClaude(PHOTO, { apiKey: "k", model: "claude-opus-5-5" }, undefined, refused.f)).toBeNull();
    const none = fakeFetch(200, message("claude-opus-5-5", [{ type: "text", text: JSON.stringify({ ...NAMED, recognized: false }) }]));
    expect(await identifyWithClaude(PHOTO, { apiKey: "k", model: "claude-opus-5-5" }, undefined, none.f)).toBeNull();
    const avif = fakeFetch(200, {});
    expect(await identifyWithClaude({ dataUrl: "data:image/avif;base64,AAAA" }, { apiKey: "k", model: "claude-opus-5-5" }, undefined, avif.f)).toBeNull();
    expect(avif.calls).toHaveLength(0);
  });

  it("checks a key through the Models API and explains a bad one", async () => {
    const good = fakeFetch(200, { id: "claude-opus-5-5", type: "model", display_name: "Claude Opus 5.5", created_at: "2026-01-01T00:00:00Z" });
    expect(await verifyClaudeKey({ apiKey: "k", model: "claude-opus-5-5" }, good.f)).toEqual({ ok: true });
    expect(good.calls[0]!.url).toContain("/v1/models/claude-opus-5-5");
    const bad = fakeFetch(401, { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } });
    expect(await verifyClaudeKey({ apiKey: "wrong", model: "claude-opus-5-5" }, bad.f)).toEqual({ ok: false, reason: "Anahtar geçersiz" });
  });
});
