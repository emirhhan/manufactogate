import { useState } from "react";
import type { RawListing } from "@manufactogate/core";
import { supplierScore } from "@/lib/analysis";
import { Card, cn } from "./ui";

/** Factory-vs-trader estimate and ready-to-send supplier messages (Chinese and English). */
export function SupplierPanel({ listing }: { listing: RawListing }) {
  const s = supplierScore(listing);
  const [lang, setLang] = useState<"zh" | "en">("zh");
  const [qty, setQty] = useState(listing.price.tiers[1]?.minQty ?? Math.max(listing.moq ?? 1, 100));
  const [copied, setCopied] = useState("");
  const name = listing.supplierName ?? "";
  const templates: Record<string, { zh: string; en: string }> = {
    quote: {
      zh: `您好${name ? `，${name}` : ""}！我是来自土耳其的采购商，对贵司的「${listing.title.slice(0, 40)}」很感兴趣。请问 ${qty} 件的最优单价是多少？是否可以提供 FOB 价格、交货周期和包装规格？另外请问贵司是生产厂家还是贸易公司？谢谢！`,
      en: `Hello${name ? ` ${name}` : ""}, I am a buyer from Turkey interested in your "${listing.title.slice(0, 40)}". What is your best unit price for ${qty} pcs? Could you share FOB price, lead time and packaging details? Also, are you the manufacturer or a trading company? Thank you.`,
    },
    sample: {
      zh: `您好！在下大单前我们想先订购样品。请问样品价格、样品制作时间以及发往土耳其伊斯坦布尔的运费是多少？样品费用可以在正式订单中抵扣吗？`,
      en: `Hello! Before placing a bulk order we would like to order samples. What is the sample price, sample lead time and shipping cost to Istanbul, Turkey? Can the sample cost be deducted from the bulk order?`,
    },
    custom: {
      zh: `您好！我们希望定制此产品：加印我们的 logo 并使用定制包装。请问起订量是多少？定制是否有额外费用？能否提供产品的 CE/3C 等认证文件？`,
      en: `Hello! We would like to customise this product with our logo and custom packaging. What is the MOQ for customisation and is there an extra charge? Could you also share CE/3C or other certification documents?`,
    },
  };
  const copy = async (key: string) => {
    await navigator.clipboard.writeText(templates[key]![lang]);
    setCopied(key);
    setTimeout(() => setCopied(""), 1500);
  };
  const pct = Math.round(s.factory * 100);
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted">Tedarikçi</div>
        <div className="flex items-center gap-2 text-[12px]">
          <span className="text-muted">Fabrika olasılığı</span>
          <span className={cn("rounded-full px-2 py-0.5 font-medium tnum", pct >= 65 ? "bg-success/10 text-success" : pct >= 40 ? "bg-warning/10 text-warning" : "bg-surface-2 text-muted")}>{pct}%</span>
        </div>
      </div>
      <div className="mt-1 text-[13px]">
        <span className="font-medium">{name || "Satıcı adı okunamadı"}</span>
        {listing.location && <span className="text-muted"> · {listing.location}</span>}
      </div>
      {s.reasons.length > 0 && <div className="mt-1 text-[12px] text-muted">{s.reasons.join(" · ")}</div>}

      <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px]">
        <span className="text-muted">Mesaj taslağı</span>
        <button onClick={() => setLang("zh")} className={cn("chip h-7", lang === "zh" && "chip-on")}>中文</button>
        <button onClick={() => setLang("en")} className={cn("chip h-7", lang === "en" && "chip-on")}>English</button>
        <label className="ml-auto flex items-center gap-1 text-muted">
          adet
          <input type="number" value={qty} onChange={(e) => setQty(Number(e.target.value) || 1)} className="h-7 w-20 rounded border border-border bg-bg px-2 text-right tnum outline-none focus:border-accent" />
        </label>
      </div>
      <div className="mt-2 grid gap-2 md:grid-cols-3">
        {(["quote", "sample", "custom"] as const).map((k) => (
          <div key={k} className="rounded-md border border-border bg-surface-2/50 p-2 text-[12px]">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-medium">{k === "quote" ? "Fiyat teklifi" : k === "sample" ? "Numune" : "Özelleştirme"}</span>
              <button onClick={() => void copy(k)} className="text-accent hover:underline">{copied === k ? "Kopyalandı ✓" : "Kopyala"}</button>
            </div>
            <p className="line-clamp-5 leading-relaxed text-muted">{templates[k]![lang]}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
