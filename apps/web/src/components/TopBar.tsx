import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { db } from "@/lib/db";
import { getRegistry } from "@/lib/registry";
import { useExtension } from "@/store/extension";
import { useSearch } from "@/store/search";
import { useSettings, type Theme } from "@/store/settings";
import { computeAlerts, useWatch } from "@/store/watch";
import { IconButton, Kbd, cn } from "./ui";

const NAV: [string, string][] = [
  ["/", "Ürünler"],
  ["/categories", "Kategoriler"],
  ["/dashboard", "Panel"],
  ["/history", "Aramalarım"],
  ["/bulk", "Toplu"],
  ["/projects", "Projeler"],
  ["/watchlist", "İzleme"],
  ["/settings", "Ayarlar"],
];

const THEMES: { key: Theme; label: string; icon: string }[] = [
  { key: "system", label: "Sistem teması", icon: "◐" },
  { key: "light", label: "Açık tema", icon: "☀" },
  { key: "dark", label: "Koyu tema", icon: "☾" },
];

/** Four-state data-source chip: real, orphaned, wanted-but-missing, mock. */
export function StatusChip({ compact = false }: { compact?: boolean }) {
  const info = useExtension((s) => s.info);
  const dataSource = useExtension((s) => s.dataSource);
  const wanted = useExtension((s) => s.wanted);
  const state = info.installed && info.orphaned ? "orphaned" : dataSource === "extension" ? "real" : wanted ? "wanted" : info.installed ? "mock-installed" : "mock";
  const dot = { real: "bg-success", orphaned: "bg-danger", wanted: "bg-warning", "mock-installed": "bg-accent", mock: "bg-warning" }[state];
  const text = {
    real: "Gerçek veri · eklenti",
    orphaned: "Eklenti bağlantısı koptu · sayfayı yenile",
    wanted: "Eklenti bulunamadı · sahte veri",
    "mock-installed": "Sahte veri · eklenti bağlı",
    mock: "Sahte veri modu",
  }[state];
  const title = {
    real: `Eklenti v${info.version ?? ""} bağlı; aramalar kendi oturumunla pazarlarda çalışır`,
    orphaned: "Eklenti yenilendi veya güncellendi. Bu sekmeyi yenile (F5), aramayı tekrar başlat.",
    wanted: "Gerçek pazarlar seçili ama eklenti bu sekmede bulunamadı. Ayarlar'da kurulum adımları var.",
    "mock-installed": "Eklenti bağlı ama veri kaynağı sahte veri seçili",
    mock: "Eklenti kurulu değil; katalog ve aramalar sahte veriyle çalışır. Ayarlar'da kurulum adımları var.",
  }[state];
  return (
    <Link to="/settings" className="flex items-center gap-1.5 text-[12px] text-muted hover:text-text" title={title} aria-label={text}>
      <span className={cn("inline-block h-2 w-2 rounded-full", dot, state === "orphaned" && "motion-safe:animate-pulse")} />
      {!compact && <span className="hidden md:inline">{text}</span>}
    </Link>
  );
}

function ThemeSwitch() {
  const theme = useSettings((s) => s.theme);
  const setTheme = useSettings((s) => s.setTheme);
  return (
    <div className="flex items-center rounded-md border border-border p-0.5" role="group" aria-label="Tema">
      {THEMES.map((t) => (
        <button
          key={t.key}
          type="button"
          aria-pressed={theme === t.key}
          aria-label={t.label}
          title={t.label}
          onClick={() => setTheme(t.key)}
          className={cn("grid h-6 w-7 place-items-center rounded text-[12px]", theme === t.key ? "bg-surface-2 text-text" : "text-muted hover:text-text")}
        >
          {t.icon}
        </button>
      ))}
    </div>
  );
}

/** Global search with a mode menu: local catalog filter (Enter), live market search (Ctrl+Enter), open a pasted listing URL. */
function GlobalSearch({ inputRef, onDone }: { inputRef: React.RefObject<HTMLInputElement | null>; onDone?: () => void }) {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const running = useSearch((s) => s.running);
  const start = useSearch((s) => s.start);
  const enabled = useSettings((s) => s.enabledMarkets);
  const dataSource = useExtension((s) => s.dataSource);
  const wrap = useRef<HTMLFormElement>(null);
  const v = q.trim();
  const isUrl = /^https?:\/\/\S+$/i.test(v);
  const linkHit = useMemo(() => (isUrl ? getRegistry().resolve(v) : null), [isUrl, v]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void db.searches
      .orderBy("startedAt")
      .reverse()
      .limit(40)
      .toArray()
      .then((rows) => {
        if (!alive) return;
        const seen = new Set<string>();
        const out: string[] = [];
        for (const r of rows) {
          const t = r.input.kind === "text" ? r.input.query : r.input.kind === "image" ? r.input.title : undefined;
          if (!t || seen.has(t)) continue;
          seen.add(t);
          out.push(t);
          if (out.length >= 8) break;
        }
        setRecent(out);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const finish = () => {
    setOpen(false);
    onDone?.();
  };
  const local = (text = v) => {
    if (!text) return;
    nav(`/?q=${encodeURIComponent(text)}`);
    finish();
  };
  const live = async (text = v) => {
    if (!text || running || !enabled.length) return;
    const id = await start({ kind: "text", query: text }, enabled);
    nav(`/search/${id}`);
    finish();
  };
  const openLink = () => {
    if (!isUrl) return;
    nav(`/l/resolve/${encodeURIComponent(v)}?compare=1`);
    finish();
  };
  const suggestions = v ? recent.filter((r) => r.toLowerCase().includes(v.toLowerCase()) && r !== v) : recent;

  return (
    <form
      ref={wrap}
      className="relative w-full max-w-[560px]"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (linkHit) openLink();
        else local();
      }}
    >
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            (e.target as HTMLInputElement).blur();
          } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void live();
          }
        }}
        placeholder={dataSource === "extension" ? "Katalogda süz · Ctrl+Enter ile pazarlarda ara · link yapıştır" : "Katalogda ara: ürün, kategori, model…"}
        aria-label="Ara"
        className="field h-9 rounded-full pl-9 pr-9"
      />
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden>⌕</span>
      <span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 text-muted lg:inline" aria-hidden><Kbd>/</Kbd></span>
      {open && (v || suggestions.length > 0) && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-border bg-surface text-[13px] shadow-[var(--shadow-md)]">
          {v && (
            <ul className="divide-y divide-border">
              {linkHit && (
                <li>
                  <button type="button" onClick={openLink} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-2">
                    <span className="text-accent">↗</span>
                    <span className="min-w-0 flex-1 truncate">{linkHit.adapter.meta.name} ilanını aç ve karşılaştır</span>
                    <Kbd>Enter</Kbd>
                  </button>
                </li>
              )}
              <li>
                <button type="button" onClick={() => local()} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-2">
                  <span className="text-muted">⌕</span>
                  <span className="min-w-0 flex-1 truncate">Katalogda süz: “{v}”</span>
                  {!linkHit && <Kbd>Enter</Kbd>}
                </button>
              </li>
              <li>
                <button type="button" onClick={() => void live()} disabled={running || !enabled.length} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-2 disabled:opacity-50">
                  <span className="text-success">●</span>
                  <span className="min-w-0 flex-1 truncate">{running ? "Bir arama sürüyor…" : !enabled.length ? "Pazarlarda ara (önce Ayarlar'dan pazar aç)" : `Pazarlarda canlı ara: “${v}” · ${enabled.length} pazar`}</span>
                  <span className="flex gap-0.5"><Kbd>Ctrl</Kbd><Kbd>Enter</Kbd></span>
                </button>
              </li>
            </ul>
          )}
          {suggestions.length > 0 && (
            <div className="border-t border-border">
              <div className="px-3 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted">Son aramalar</div>
              <ul className="pb-1">
                {suggestions.slice(0, 6).map((s) => (
                  <li key={s}>
                    <button type="button" onClick={() => { setQ(s); void live(s); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-2">
                      <span className="text-muted">↻</span>
                      <span className="min-w-0 flex-1 truncate">{s}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </form>
  );
}

export function TopBar() {
  const [menu, setMenu] = useState(false);
  const [mobileSearch, setMobileSearch] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const watches = useWatch((s) => s.watches);
  const alerts = useMemo(() => computeAlerts(watches).length, [watches]);

  // "/" focuses the global search anywhere outside a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      e.preventDefault();
      if (window.innerWidth < 768) setMobileSearch(true);
      setTimeout(() => searchRef.current?.focus(), 0);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-12 max-w-[1440px] items-center gap-3 px-4 lg:gap-5">
        <Link to="/" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight" onClick={() => setMenu(false)}>
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-[13px] font-bold text-accent-fg" aria-hidden>M</span>
          <span className="hidden sm:inline">Manufactogate</span>
        </Link>
        <div className="hidden min-w-0 flex-1 md:flex">
          <GlobalSearch inputRef={searchRef} />
        </div>
        <nav className="hidden items-center gap-0.5 overflow-x-auto text-[13px] lg:flex" aria-label="Ana menü">
          {NAV.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => cn("relative whitespace-nowrap rounded-md px-2.5 py-1.5 text-muted hover:bg-surface-2 hover:text-text", isActive && "bg-surface-2 text-text")}>
              {label}
              {to === "/watchlist" && alerts > 0 && (
                <span className="ml-1 inline-flex min-w-4 items-center justify-center rounded-full bg-success px-1 text-[10px] font-semibold text-white tnum" title={`${alerts} fiyat alarmı`}>{alerts}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <IconButton label="Ara" className="md:hidden" onClick={() => { setMobileSearch((v) => !v); setTimeout(() => searchRef.current?.focus(), 0); }}>⌕</IconButton>
          <StatusChip />
          <div className="hidden lg:block">
            <ThemeSwitch />
          </div>
          <IconButton label={menu ? "Menüyü kapat" : "Menü"} className="lg:hidden" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
            {menu ? "✕" : "☰"}
          </IconButton>
        </div>
      </div>
      {mobileSearch && (
        <div className="border-t border-border px-4 py-2 md:hidden">
          <GlobalSearch inputRef={searchRef} onDone={() => setMobileSearch(false)} />
        </div>
      )}
      {menu && (
        <nav className="border-t border-border px-4 py-2 lg:hidden" aria-label="Menü">
          <ul className="grid grid-cols-2 gap-1 text-[13px] sm:grid-cols-4">
            {NAV.map(([to, label]) => (
              <li key={to}>
                <NavLink to={to} end={to === "/"} onClick={() => setMenu(false)} className={({ isActive }) => cn("flex items-center justify-between rounded-md px-3 py-2 text-muted hover:bg-surface-2 hover:text-text", isActive && "bg-surface-2 text-text")}>
                  {label}
                  {to === "/watchlist" && alerts > 0 && <span className="rounded-full bg-success px-1.5 text-[10px] font-semibold text-white tnum">{alerts}</span>}
                </NavLink>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-[12px] text-muted">
            <span>Tema</span>
            <ThemeSwitch />
          </div>
        </nav>
      )}
    </header>
  );
}
