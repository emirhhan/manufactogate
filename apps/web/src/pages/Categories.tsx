import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getLeaves, leafCounts, TAXONOMY } from "@manufactogate/adapters";
import { matchesTr } from "@manufactogate/core";
import { Input, SkeletonLine, cn, usePageTitle } from "@/components/ui";
import { countsOf, loadRealCatalog } from "@/lib/realCatalog";
import { useExtension } from "@/store/extension";
import { useSettings } from "@/store/settings";

export function Categories() {
  usePageTitle("Kategoriler");
  const [q, setQ] = useState("");
  const [onlyFilled, setOnlyFilled] = useState(false);
  const real = useExtension((s) => s.dataSource) === "extension";
  const targetCountry = useSettings((s) => s.targetCountry);
  const mockCounts = useMemo(() => leafCounts(), []);
  const [realCounts, setRealCounts] = useState<{ leafCounts: Record<string, number>; groupCounts: Record<string, number>; classified: number; total: number } | null>(null);
  useEffect(() => {
    if (!real) return;
    let alive = true;
    void loadRealCatalog(targetCountry).then((items) => alive && setRealCounts(countsOf(items)));
    return () => {
      alive = false;
    };
  }, [real, targetCountry]);
  const loading = real && !realCounts;
  const counts = real ? (realCounts?.leafCounts ?? {}) : mockCounts;
  const leaves = getLeaves();
  const needle = q.trim();
  const filtered = needle ? leaves.filter((l) => matchesTr(`${l.tr} ${l.zh} ${l.en}`, needle)) : null;
  const totalLeaves = leaves.length;
  const totalProducts = real ? (realCounts?.classified ?? 0) : Object.values(counts).reduce((a, b) => a + b, 0);
  const byCount = (a: { key: string }, b: { key: string }) => (counts[b.key] ?? 0) - (counts[a.key] ?? 0);
  const visibleLeaves = (gKey: string) => {
    let ls = leaves.filter((l) => l.group === gKey);
    if (onlyFilled) ls = ls.filter((l) => (counts[l.key] ?? 0) > 0);
    return real ? [...ls].sort(byCount) : ls;
  };
  const groups = onlyFilled ? TAXONOMY.filter((g) => visibleLeaves(g.key).length > 0) : TAXONOMY;

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Kategoriler</h1>
          <div className="text-[12px] text-muted tnum">
            {loading ? (
              <SkeletonLine w="w-56" className="mt-1" />
            ) : real ? (
              `${TAXONOMY.length} ana grup · ${totalLeaves} kategori · ${totalProducts.toLocaleString("tr-TR")} gerçek ilan sınıflandırıldı${realCounts && realCounts.total > realCounts.classified ? ` (${(realCounts.total - realCounts.classified).toLocaleString("tr-TR")} sınıfsız)` : ""}`
            ) : (
              `${TAXONOMY.length} ana grup · ${totalLeaves} kategori · ${totalProducts.toLocaleString("tr-TR")} ürün`
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {real && (
            <label className="flex items-center gap-1.5 text-[13px] text-muted">
              <input type="checkbox" checked={onlyFilled} onChange={(e) => setOnlyFilled(e.target.checked)} className="accent-[var(--accent)]" />
              sadece dolu olanlar
            </label>
          )}
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Kategori ara (ör. kask, gözlük, fren)" aria-label="Kategori ara" className="w-72" />
        </div>
      </div>

      {loading ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border bg-surface p-3">
              <SkeletonLine w="w-32" h="h-4" />
              <div className="mt-3 space-y-2">
                <SkeletonLine /><SkeletonLine w="w-5/6" /><SkeletonLine w="w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered ? (
        <ul className="mt-5 grid gap-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {(real ? [...filtered].sort(byCount) : filtered).map((l) => (
            <li key={l.key}>
              <Link to={`/c/${l.group}/${l.key}`} className="flex items-center justify-between rounded-md border border-border bg-surface px-3 py-2 text-[13px] hover:bg-surface-2">
                <span>
                  {l.tr} <span className="text-muted">· {l.zh}</span>
                </span>
                <span className="text-[11px] text-muted tnum">{counts[l.key] ?? 0}</span>
              </Link>
            </li>
          ))}
          {filtered.length === 0 && <li className="text-muted">Eşleşen kategori yok.</li>}
        </ul>
      ) : (
        <div className="mt-5 columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4">
          {groups.map((g) => (
            <section key={g.key} className="mb-4 break-inside-avoid rounded-lg border border-border bg-surface p-3">
              <Link to={`/c/${g.key}`} className="flex items-baseline justify-between hover:underline">
                <span className="font-medium">{g.tr}</span>
                <span className="text-[11px] text-muted tnum">{real ? (realCounts?.groupCounts[g.key] ?? 0) : g.zh}</span>
              </Link>
              <ul className="mt-2 space-y-0.5 text-[13px]">
                {visibleLeaves(g.key).map((l) => (
                  <li key={l.key}>
                    <Link to={`/c/${g.key}/${l.key}`} className={cn("flex justify-between rounded px-1.5 py-0.5 hover:bg-surface-2 hover:text-text", (counts[l.key] ?? 0) > 0 ? "text-text" : "text-muted")}>
                      <span>{l.tr}</span>
                      <span className="text-[11px] tnum">{counts[l.key] ?? 0}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {groups.length === 0 && <div className="text-muted">Henüz sınıflandırılmış gerçek ilan yok.</div>}
        </div>
      )}
    </div>
  );
}
