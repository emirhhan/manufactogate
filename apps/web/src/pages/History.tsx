import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, Empty } from "@/components/ui";
import { db, type SearchRecord } from "@/lib/db";
import { relTime } from "@/lib/format";

export function History() {
  const [rows, setRows] = useState<SearchRecord[]>([]);
  const refresh = () => void db.searches.orderBy("startedAt").reverse().toArray().then(setRows);
  useEffect(refresh, []);

  const clear = async () => {
    if (!confirm("Tüm arama geçmişi silinsin mi?")) return;
    await db.transaction("rw", db.searches, db.listings, db.clusters, async () => {
      await db.searches.clear();
      await db.listings.clear();
      await db.clusters.clear();
    });
    refresh();
  };

  return (
    <div className="mx-auto max-w-[960px] px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Geçmiş</h1>
        {rows.length > 0 && (
          <Button variant="danger" size="sm" onClick={() => void clear()}>
            Geçmişi temizle
          </Button>
        )}
      </div>
      <div className="mt-4">
        {rows.length === 0 ? (
          <Empty title="Henüz arama yok" hint="Aramalar bu cihazda saklanır, sunucuya gönderilmez." />
        ) : (
          <Card className="divide-y divide-border">
            {rows.map((r) => (
              <Link key={r.id} to={`/search/${r.id}`} className="flex items-center gap-3 px-3 py-2 text-[13px] hover:bg-surface-2">
                <div className="h-8 w-8 shrink-0 overflow-hidden rounded border border-border bg-surface-2">
                  {r.thumb && <img src={r.thumb} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1 truncate">
                  {r.input.kind === "image" ? (r.input.title ?? "Görsel araması") : r.input.kind === "link" ? r.input.url : r.input.query}
                </div>
                <div className="text-muted tnum">{r.clusterCount} küme</div>
                <div className="w-24 text-right text-muted">{relTime(r.startedAt)}</div>
              </Link>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
