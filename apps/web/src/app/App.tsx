import { Component, useEffect, useState, type ReactNode } from "react";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { TopBar } from "@/components/TopBar";
import { Button, Toaster } from "@/components/ui";
import { pruneLargeThumbs, subscribeDb, type DbEvent } from "@/lib/db";
import { useExtension } from "@/store/extension";
import { useSettings } from "@/store/settings";
import { staleWatches, useWatch } from "@/store/watch";
import { Bulk } from "@/pages/Bulk";
import { Categories } from "@/pages/Categories";
import { Dashboard } from "@/pages/Dashboard";
import { Feed } from "@/pages/Feed";
import { History } from "@/pages/History";
import { Listing } from "@/pages/Listing";
import { Projects } from "@/pages/Projects";
import { Watchlist } from "@/pages/Watchlist";
import { Product } from "@/pages/Product";
import { Results } from "@/pages/Results";
import { Settings } from "@/pages/Settings";

/** Catches render errors so a broken page shows a message and a way back instead of a white screen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override componentDidCatch(error: Error) {
    console.error("render", error);
  }
  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto max-w-[720px] px-4 py-16">
        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-danger">Bir şeyler ters gitti</div>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">Sayfa çizilirken hata oluştu</h1>
        <p className="mt-2 text-muted">Verilerin bu cihazda duruyor. Sayfayı yenilemek çoğu zaman yeter; sorun sürerse Ayarlar'dan yedek alıp geçmişi temizleyebilirsin.</p>
        <pre className="mt-3 overflow-x-auto rounded-md border border-border bg-surface-2 p-3 text-[12px] text-muted">{this.state.error.message}</pre>
        <div className="mt-4 flex gap-2">
          <Button variant="primary" onClick={() => location.reload()}>Sayfayı yenile</Button>
          <a href="/" className="inline-flex h-9 items-center rounded-md border border-border px-3.5 text-sm hover:bg-surface-2">Ana sayfa</a>
        </div>
      </div>
    );
  }
}

function NotFound() {
  return (
    <div className="mx-auto max-w-[720px] px-4 py-16">
      <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">404</div>
      <h1 className="mt-2 text-xl font-semibold tracking-tight">Böyle bir sayfa yok</h1>
      <p className="mt-2 text-muted">Adres yanlış yazılmış ya da sayfa taşınmış olabilir.</p>
      <Link to="/" className="mt-4 inline-flex h-9 items-center rounded-md bg-accent px-3.5 text-sm font-medium text-accent-fg">Ana sayfa</Link>
    </div>
  );
}

function Banner({ tone, children }: { tone: "warning" | "danger"; children: ReactNode }) {
  const cls = tone === "danger" ? "border-danger/40 bg-danger/10 text-danger" : "border-warning/40 bg-warning/10 text-warning";
  return (
    <div className={`border-b ${cls}`} role="status">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-[13px]">{children}</div>
    </div>
  );
}

export function App() {
  const hydrate = useSettings((s) => s.hydrate);
  const hydrated = useSettings((s) => s.hydrated);
  const storageError = useSettings((s) => s.storageError);
  const pref = useSettings((s) => s.dataSource);
  const displayCurrency = useSettings((s) => s.displayCurrency);
  const detect = useExtension((s) => s.detect);
  const applyPref = useExtension((s) => s.applyPref);
  const loadHealth = useExtension((s) => s.loadHealth);
  const info = useExtension((s) => s.info);
  const dataSource = useExtension((s) => s.dataSource);
  const [dbEvent, setDbEvent] = useState<DbEvent | null>(null);

  useEffect(() => {
    void hydrate();
    void loadHealth();
    void detect();
    // Re-probe when the tab comes back: the extension may have been installed, reloaded or updated meanwhile.
    const onVisible = () => {
      if (document.visibilityState === "visible") void detect({ retries: 1 });
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    const unsub = subscribeDb((e) => setDbEvent(e));
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      unsub();
    };
  }, [hydrate, detect, loadHealth]);
  useEffect(() => applyPref(pref), [pref, applyPref]);

  // One-off housekeeping after hydrate: drop oversized history thumbs, refresh stale watches in the background.
  useEffect(() => {
    if (!hydrated) return;
    const t = setTimeout(() => {
      void pruneLargeThumbs().catch(() => undefined);
    }, 4000);
    return () => clearTimeout(t);
  }, [hydrated]);
  useEffect(() => {
    if (!hydrated || dataSource !== "extension") return;
    const t = setTimeout(() => {
      void (async () => {
        const w = useWatch.getState();
        await w.load();
        if (staleWatches(w.watches).length) await w.refresh(undefined, { onlyStale: true });
      })().catch(() => undefined);
    }, 8000);
    return () => clearTimeout(t);
  }, [hydrated, dataSource]);

  if (!hydrated) return <div className="mx-auto max-w-[1440px] px-4 py-6"><div className="skeleton h-12 w-full" /><div className="skeleton mt-4 h-40 w-full" /></div>;
  return (
    <BrowserRouter>
      <a href="#main" className="skip-link">İçeriğe atla</a>
      <TopBar />
      {storageError && (
        <Banner tone="warning">
          <span className="font-medium">Yerel depolama açılamadı.</span>
          <span>Geçmiş, projeler ve ayarlar bu oturumda kaydedilmeyecek (gizli pencere veya engellenmiş site verisi). Hata: {storageError}</span>
        </Banner>
      )}
      {dbEvent && dbEvent.type !== "blocked" && (
        <Banner tone="warning">
          <span className="font-medium">Veritabanı başka bir sekmede güncellendi.</span>
          <span>Bu sekmeyi yenile; aksi halde kayıtlar yazılamaz.</span>
          <Button size="sm" onClick={() => location.reload()}>Yenile</Button>
        </Banner>
      )}
      {info.installed && info.orphaned && (
        <Banner tone="danger">
          <span className="font-medium">Eklenti bağlantısı koptu.</span>
          <span>Eklenti yenilendi veya güncellendi; bu sekme eski betiği taşıyor. Sayfayı yenile ve aramayı tekrar başlat.</span>
          <Button size="sm" onClick={() => location.reload()}>Yenile</Button>
        </Banner>
      )}
      <div id="main" className="min-h-[calc(100vh-48px)]">
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Feed />} />
            <Route path="/c/:group" element={<Feed />} />
            <Route path="/c/:group/:leaf" element={<Feed />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/p/:id" element={<Product />} />
            <Route path="/l/:market/:id" element={<Listing />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/:id" element={<Projects />} />
            <Route path="/watchlist" element={<Watchlist />} />
            <Route path="/search/:id" element={<Results />} />
            <Route path="/history" element={<History />} />
            <Route path="/bulk" element={<Bulk />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </ErrorBoundary>
      </div>
      <footer className="mt-10 border-t border-border py-6 text-[12px] text-muted">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-6 gap-y-2 px-4">
          <span className="font-medium text-text">Manufactogate</span>
          <span>Veriler bu cihazda kalır. Pazarlara kendi hesabınla bağlanırsın.</span>
          <span className="ml-auto">Fiyatlar pazarların kendi para biriminde, ≈ {displayCurrency} gösterge kurla.</span>
        </div>
      </footer>
      <Toaster />
    </BrowserRouter>
  );
}
