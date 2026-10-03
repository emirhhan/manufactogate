import { useState } from "react";
import type { ListingVariant, MarketId } from "@manufactogate/core";
import { COPY } from "@/lib/copy";
import { describeError } from "@/lib/marketErrors";
import { DetailSkeleton } from "@/components/Skeletons";

export type DetailStatus = "idle" | "loading" | "done" | "error";
export type DetailView = DetailStatus | "empty";

/** Typed market error line for a failed detail fetch, with the market's own action (login, verify) when there is one. */
export function DetailErrorLine({ market, message }: { market: MarketId | undefined; message: string }) {
  const m = /^(LoggedOut|Captcha|SelectorBroken|RateLimited|NotFound|Network|Timeout|Internal)\b/.exec(message);
  const d = market ? describeError(m?.[1] ?? "Network", message, market) : null;
  return (
    <div className="mt-2 text-[12px] text-danger">
      {d ? `${d.title}: ${d.hint}` : message}
      {d?.action && (
        <a href={d.action.href} target="_blank" rel="noreferrer noopener" className="ml-2 text-accent hover:underline">
          {d.action.label} ↗
        </a>
      )}
      <details className="mt-0.5 text-muted">
        <summary className="cursor-pointer select-none">teknik ayrıntı</summary>
        <code className="font-mono text-[11px]">{message}</code>
      </details>
    </div>
  );
}

export function AttributeTable({ attrs }: { attrs: Record<string, string> }) {
  const [all, setAll] = useState(false);
  const entries = Object.entries(attrs);
  const shown = all ? entries : entries.slice(0, 24);
  return (
    <div className="mt-4">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted">Ürün özellikleri · {entries.length}</div>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-[13px]">
        {shown.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="break-words">{v}</dd>
          </div>
        ))}
      </dl>
      {entries.length > 24 && (
        <button onClick={() => setAll((v) => !v)} className="mt-1 text-[12px] text-accent hover:underline">{all ? "Daha az göster" : `Tümünü göster (${entries.length})`}</button>
      )}
    </div>
  );
}

export function VariantList({ variants, count }: { variants: ListingVariant[] | undefined; count: number | undefined }) {
  if (!variants?.length) {
    return count && count > 1 ? <div className="mt-4 text-[12px] text-muted">{count} varyant · detay çekilince seçenekler görünür</div> : null;
  }
  return (
    <div className="mt-4">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted">Varyantlar</div>
      <dl className="mt-1 space-y-1 text-[13px]">
        {variants.map((v) => (
          <div key={v.name} className="flex flex-wrap items-baseline gap-2">
            <dt className="text-muted">{v.name}</dt>
            <dd className="flex flex-wrap gap-1">
              {v.options.slice(0, 24).map((o) => (
                <span key={o} className="rounded border border-border px-1.5 py-0.5 text-[12px]">{o}</span>
              ))}
              {v.options.length > 24 && <span className="text-[12px] text-muted">+{v.options.length - 24}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Detail fetch state: skeleton, attribute table, "no extra attributes", the idle call-to-action or the typed error with retry. */
export function DetailBlock({ status, market, attrs, error, canFetch, onFetch }: { status: DetailView; market: MarketId | undefined; attrs: Record<string, string> | undefined; error: string; canFetch: boolean; onFetch: () => void }) {
  if (status === "loading") return <DetailSkeleton />;
  if (status === "done" && attrs) return <AttributeTable attrs={attrs} />;
  if (status === "empty" && canFetch) return <div className="mt-4 text-[12px] text-muted">{COPY.detail.empty}</div>;
  if (status === "idle" && canFetch)
    return (
      <div className="mt-4 text-[12px] text-muted">
        {COPY.detail.idle}{" "}
        <button onClick={onFetch} className="text-accent hover:underline">Detayı çek</button>
      </div>
    );
  if (status === "error")
    return (
      <div className="mt-4 text-[12px]">
        <DetailErrorLine market={market} message={error} />
        <button onClick={onFetch} className="text-accent hover:underline">Yeniden dene</button>
      </div>
    );
  return null;
}
