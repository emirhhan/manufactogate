import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { SearchInput } from "@manufactogate/core";
import { SearchBox } from "@/components/SearchBox";
import { Card } from "@/components/ui";
import { db, type SearchRecord } from "@/lib/db";
import { relTime } from "@/lib/format";
import { getRegistry } from "@/lib/registry";
import { useSearch } from "@/store/search";
import { useSettings } from "@/store/settings";

function describe(i: SearchInput): string {
  return i.kind === "image" ? (i.title ? `Görsel · ${i.title}` : "Görsel araması") : i.kind === "link" ? i.url : i.query;
}

export function Home() {
  const nav = useNavigate();
  const start = useSearch((s) => s.start);
  const running = useSearch((s) => s.running);
  const enabled = useSettings((s) => s.enabledMarkets);
  const [recent, setRecent] = useState<SearchRecord[]>([]);
  useEffect(() => {
    void db.searches.orderBy("startedAt").reverse().limit(6).toArray().then(setRecent);
  }, []);

  const reg = getRegistry();
  return (
    <div className="mx-auto max-w-[960px] px-4 py-10">
      <h1 className="text-xl font-semibold tracking-tight">Ürünü bul, kaynağına in, maliyetini gör.</h1>
      <p className="mt-1 text-muted">
        Bir görsel, bir link veya bir ürün adı. Seçili pazarlarda aynı ürün aranır, tedarikçiler karşılaştırılır.
      </p>
      <div className="mt-6">
        <SearchBox
          busy={running}
          onSubmit={async (input, thumb) => {
            const id = await start(input, enabled, thumb);
            nav(`/search/${id}`);
          }}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-muted">
        <span>Pazarlar:</span>
        {enabled.map((m) => (
          <span key={m} className="rounded border border-border bg-surface px-1.5 py-0.5">
            {reg.get(m)?.meta.name ?? m}
          </span>
        ))}
        <Link to="/settings" className="text-accent hover:underline">
          değiştir
        </Link>
      </div>

      {recent.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-muted">Son aramalar</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {recent.map((r) => (
              <Link key={r.id} to={`/search/${r.id}`}>
                <Card className="flex items-center gap-3 p-3 hover:bg-surface-2">
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded border border-border bg-surface-2">
                    {r.thumb && <img src={r.thumb} alt="" className="h-full w-full object-cover" />}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium">{describe(r.input)}</div>
                    <div className="text-[12px] text-muted">
                      {r.clusterCount} küme · {r.markets.length} pazar · {relTime(r.startedAt)}
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
