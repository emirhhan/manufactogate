import { useEffect, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { TopBar } from "@/components/TopBar";
import { detectExtension } from "@/lib/bridge";
import { setDataSource } from "@/lib/registry";
import { useExtension } from "@/store/extension";
import { Bulk } from "@/pages/Bulk";
import { Categories } from "@/pages/Categories";
import { Feed } from "@/pages/Feed";
import { History } from "@/pages/History";
import { Listing } from "@/pages/Listing";
import { Projects } from "@/pages/Projects";
import { Watchlist } from "@/pages/Watchlist";
import { Product } from "@/pages/Product";
import { Results } from "@/pages/Results";
import { Settings } from "@/pages/Settings";
import { useSettings } from "@/store/settings";

export function App() {
  const hydrate = useSettings((s) => s.hydrate);
  const hydrated = useSettings((s) => s.hydrated);
  const ext = useExtension((s) => s.info);
  const setExt = useExtension((s) => s.set);
  const pref = useSettings((s) => s.dataSource);
  useEffect(() => {
    void hydrate();
    // The content script may mark the document slightly after first paint; retry briefly.
    let tries = 0;
    const tick = async () => {
      const info = await detectExtension();
      setExt(info);
      if (!info.installed && tries++ < 5) setTimeout(tick, 300);
    };
    void tick();
  }, [hydrate, setExt]);
  const effective = pref === "mock" ? "mock" : pref === "extension" ? "extension" : ext.installed ? "extension" : "mock";
  useEffect(() => setDataSource(effective), [effective]);
  const [, force] = useState(0);
  useEffect(() => force((n) => n + 1), [effective]);
  if (!hydrated) return null;
  return (
    <BrowserRouter>
      <TopBar extension={ext} dataSource={effective} />
      <div className="min-h-[calc(100vh-48px)]">
      <Routes>
        <Route path="/" element={<Feed />} />
        <Route path="/c/:group" element={<Feed />} />
        <Route path="/c/:group/:leaf" element={<Feed />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/p/:id" element={<Product />} />
        <Route path="/l/:market/:id" element={<Listing />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/:id" element={<Projects />} />
        <Route path="/watchlist" element={<Watchlist />} />
        <Route path="/search/:id" element={<Results />} />
        <Route path="/history" element={<History />} />
        <Route path="/bulk" element={<Bulk />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
      </div>
      <footer className="mt-10 border-t border-border py-6 text-[12px] text-muted">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-6 gap-y-2 px-4">
          <span className="font-medium text-text">Manufactogate</span>
          <span>Veriler bu cihazda kalır. Pazarlara kendi hesabınla bağlanırsın.</span>
          <span className="ml-auto">Fiyatlar pazarların kendi para biriminde, ≈ TRY gösterge kurla.</span>
        </div>
      </footer>
    </BrowserRouter>
  );
}
