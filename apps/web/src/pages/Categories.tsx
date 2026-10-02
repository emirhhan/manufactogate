import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getLeaves, leafCounts, TAXONOMY } from "@manufactogate/adapters";
import { matchesTr } from "@manufactogate/core";

export function Categories() {
  const [q, setQ] = useState("");
  const counts = useMemo(() => leafCounts(), []);
  const leaves = getLeaves();
  const needle = q.trim();
  const filtered = needle ? leaves.filter((l) => matchesTr(`${l.tr} ${l.zh}`, needle)) : null;
  const totalLeaves = leaves.length;
  const totalProducts = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Kategoriler</h1>
          <div className="text-[12px] text-muted tnum">
            {TAXONOMY.length} ana grup · {totalLeaves} kategori · {totalProducts.toLocaleString("tr-TR")} ürün
          </div>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Kategori ara (ör. kask, gözlük, fren)"
          className="h-9 w-72 rounded-md border border-border bg-bg px-3 text-[13px] outline-none placeholder:text-muted focus:border-accent"
        />
      </div>

      {filtered ? (
        <ul className="mt-5 grid gap-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((l) => (
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
          {TAXONOMY.map((g) => (
            <section key={g.key} className="mb-4 break-inside-avoid rounded-lg border border-border bg-surface p-3">
              <Link to={`/c/${g.key}`} className="flex items-baseline justify-between hover:underline">
                <span className="font-medium">{g.tr}</span>
                <span className="text-[11px] text-muted">{g.zh}</span>
              </Link>
              <ul className="mt-2 space-y-0.5 text-[13px]">
                {leaves
                  .filter((l) => l.group === g.key)
                  .map((l) => (
                    <li key={l.key}>
                      <Link to={`/c/${g.key}/${l.key}`} className="flex justify-between rounded px-1.5 py-0.5 text-muted hover:bg-surface-2 hover:text-text">
                        <span>{l.tr}</span>
                        <span className="text-[11px] tnum">{counts[l.key] ?? 0}</span>
                      </Link>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
