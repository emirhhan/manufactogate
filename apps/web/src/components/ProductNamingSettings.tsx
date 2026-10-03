import { useEffect, useState } from "react";
import { Button, Card, Input, Select } from "@/components/ui";
import { CLAUDE_MODELS, verifyClaudeKey, type ClaudeModel } from "@/lib/claudeIdentify";
import { useSettings } from "@/store/settings";

/**
 * Settings → "Ürün tanıma": the free in-browser namer (always on with "Görsel yapay zekâ") and the
 * optional Claude namer, which only runs once the user saves their own API key.
 */
export function ProductNamingSettings() {
  const claude = useSettings((s) => s.claude);
  const setClaude = useSettings((s) => s.setClaude);
  const visualAi = useSettings((s) => s.search.visualAi);
  const [key, setKey] = useState(claude.apiKey);
  const [check, setCheck] = useState<{ ok: boolean; text: string } | null>(null);
  const [checking, setChecking] = useState(false);
  useEffect(() => setKey(claude.apiKey), [claude.apiKey]);

  const verify = async () => {
    setChecking(true);
    const r = await verifyClaudeKey({ apiKey: key.trim(), model: claude.model });
    setChecking(false);
    setCheck(r.ok ? { ok: true, text: "Anahtar çalışıyor" } : { ok: false, text: r.reason });
    if (r.ok && key.trim() !== claude.apiKey) setClaude({ apiKey: key.trim() });
  };

  return (
    <section className="mt-6">
      <h2 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-muted">Ürün tanıma</h2>
      <Card className="p-4 text-[13px]">
        <p className="text-[12px] text-muted">
          Sadece fotoğrafla aradığında ürünün ne olduğu bulunur ve görselle arama yapamayan pazarlarda bu adla aranır. Sonuç sayfasında "Fotoğraftaki ürün" olarak görünür; yanlışsa düzeltip yeniden aratabilirsin.
        </p>
        <div className="mt-3">
          <span className="font-medium">Ücretsiz model</span>
          <span className="text-muted"> · {visualAi ? "açık" : "kapalı (yukarıdaki Görsel yapay zekâ kapalı)"}</span>
          <span className="block text-[12px] text-muted">Tarayıcında çalışır, fotoğraf bilgisayarından çıkmaz. Ürün tipini, rengi, malzemeyi ve bilinen markaları tanır; ilk kullanımda ~60 MB daha iner.</span>
        </div>
        <div className="mt-4 border-t border-border pt-3">
          <span className="font-medium">Claude</span>
          <span className="text-muted"> · isteğe bağlı, ücretli</span>
          <span className="block text-[12px] text-muted">
            Daha isabetli: markayı, modeli ve etiketteki yazıyı da tanır. Yalnızca buraya kendi Anthropic API anahtarını kaydedersen kullanılır; anahtar yoksa hiçbir ücret oluşmaz. Kullanıldığında fotoğraf Anthropic'e gönderilir. Anahtar yalnızca bu tarayıcıda saklanır. API kullanımı Claude aboneliğinden ayrı faturalanır.
          </span>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Input
              type="password"
              size="sm"
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                setCheck(null);
              }}
              placeholder="sk-ant-…"
              aria-label="Anthropic API anahtarı"
              autoComplete="off"
              className="w-72 max-w-full"
            />
            <Button size="sm" onClick={() => setClaude({ apiKey: key.trim() })} disabled={key.trim() === claude.apiKey}>
              Kaydet
            </Button>
            <Button size="sm" onClick={() => void verify()} disabled={!key.trim() || checking}>
              {checking ? "Deneniyor…" : "Anahtarı dene (ücretsiz)"}
            </Button>
            {claude.apiKey && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setClaude({ apiKey: "" });
                  setKey("");
                  setCheck(null);
                }}
              >
                Anahtarı sil
              </Button>
            )}
          </div>
          {check && <div className={`mt-1 text-[12px] ${check.ok ? "text-success" : "text-danger"}`}>{check.text}</div>}
          <label className="mt-2 flex flex-wrap items-center gap-2">
            <span>Model</span>
            <Select size="sm" value={claude.model} onChange={(e) => setClaude({ model: e.target.value as ClaudeModel })}>
              {CLAUDE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} — {m.note}
                </option>
              ))}
            </Select>
          </label>
          <p className="mt-2 text-[12px] text-muted">
            Durum: {claude.apiKey ? "anahtar kayıtlı — fotoğraflı aramalarda Claude kullanılır, bir hata olursa ücretsiz modele geçilir." : "anahtar yok — yalnızca ücretsiz model kullanılır."}
          </p>
        </div>
      </Card>
    </section>
  );
}
