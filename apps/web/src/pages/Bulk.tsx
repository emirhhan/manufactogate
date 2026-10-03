import { useState } from "react";
import { Link } from "react-router-dom";
import type { MarketId, RawListing } from "@manufactogate/core";
import { runSearch } from "@manufactogate/core";
import { localizeQuery } from "@manufactogate/adapters";
import { Button, Card, Empty } from "@/components/ui";
import { db } from "@/lib/db";
import { download, listingsToCsv } from "@/lib/export";
import { browserFingerprinter } from "@/lib/fingerprinter";
import { money } from "@/lib/format";
import { toTry } from "@/lib/fx";
import { getRegistry } from "@/lib/registry";
import { useSettings } from "@/store/settings";

interface Row {
  query: string;
  status: "bekliyor" | "aranıyor" | "bitti" | "hata";
  count: number;
  minTry: number | null;
  searchId?: string;
  listings: RawListing[];
}

/** Bulk research: paste or upload one query per line; searched one after another with pauses. */
export function Bulk() {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const enabled = useSettings((s) => s.enabledMarkets);
  const reg = getRegistry();

  const run = async () => {
    const queries = text.split(/\r?\n|;/).map((q) => q.trim()).filter(Boolean).slice(0, 200);
    const init: Row[] = queries.map((query) => ({ query, status: "bekliyor", count: 0, minTry: null, listings: [] }));
    setRows(init);
    setRunning(true);
    for (let i = 0; i < init.length; i++) {
      const q = init[i]!.query;
      setRows((r) => r.map((x, j) => (j === i ? { ...x, status: "aranıyor" } : x)));
      const adapters = enabled.map((m) => reg.get(m)).filter((a): a is NonNullable<typeof a> => !!a);
      const perMarket: Partial<Record<MarketId, string[]>> = {};
      for (const a of adapters) {
        const lq = localizeQuery(q, a.meta.language);
        if (lq !== q) perMarket[a.id] = [lq, q];
      }
      const id = crypto.randomUUID();
      await db.searches.put({ id, input: { kind: "text", query: q, perMarket }, markets: enabled, startedAt: new Date().toISOString(), clusterCount: 0 });
      const got: RawListing[] = [];
      try {
        for await (const ev of runSearch({ kind: "text", query: q, perMarket }, adapters, browserFingerprinter, { maxPerMarket: 40 })) {
          if (ev.type === "listing") {
            got.push(ev.listing);
            void db.listings.put({ ...ev.listing, key: `${ev.market}:${ev.listing.id}`, searchId: id });
          }
        }
        await db.searches.update(id, { finishedAt: new Date().toISOString(), clusterCount: 0 });
        const prices = got.map((l) => toTry(Math.min(...l.price.tiers.map((t) => t.unitPrice)), l.price.currency)).filter((n): n is number => n !== null);
        setRows((r) => r.map((x, j) => (j === i ? { ...x, status: "bitti", count: got.length, minTry: prices.length ? Math.min(...prices) : null, searchId: id, listings: got } : x)));
      } catch {
        setRows((r) => r.map((x, j) => (j === i ? { ...x, status: "hata" } : x)));
      }
      await new Promise((r) => setTimeout(r, 2500 + Math.random() * 2500));
    }
    setRunning(false);
  };

  const all = rows.flatMap((r) => r.listings);
  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8">
      <h1 className="text-xl font-semibold tracking-tight">Toplu araştırma</h1>
      <p className="mt-1 text-muted">Her satıra bir ürün. Sırayla, aralarında bekleyerek aranır; sonuçlar geçmişe ve projelere eklenebilir.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder={"motosiklet kaskı\nkablosuz kulaklık\nairfryer 5L"} className="w-full rounded-md border border-border bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent" />
        <div className="flex flex-col gap-2">
          <Button variant="primary" onClick={() => void run()} disabled={running || !text.trim()}>{running ? "Aranıyor…" : "Başlat"}</Button>
          <label className="chip cursor-pointer justify-center">
            CSV yükle
            <input type="file" accept=".csv,.txt" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); }} />
          </label>
          <Button onClick={() => download(`toplu-${Date.now()}.csv`, listingsToCsv(all, (m) => reg.get(m as MarketId)?.meta.name ?? m))} disabled={all.length === 0}>Tümünü CSV indir</Button>
        </div>
      </div>
      <div className="mt-5">
        {rows.length === 0 ? (
          <Empty title="Henüz liste yok" hint="Ürün adlarını yapıştır ve Başlat'a bas." />
        ) : (
          <Card className="divide-y divide-border">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                <span className="w-6 text-muted tnum">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate">{r.query}</span>
                <span className="w-20 text-muted">{r.status}</span>
                <span className="w-16 text-right tnum">{r.count || ""}</span>
                <span className="w-28 text-right tnum">{r.minTry !== null ? money(r.minTry, "TRY") : ""}</span>
                {r.searchId ? <Link to={`/search/${r.searchId}`} className="text-accent hover:underline">Aç →</Link> : <span className="w-8" />}
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
