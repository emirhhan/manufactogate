import { useEffect, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { TopBar } from "@/components/TopBar";
import { detectExtension, type ExtensionInfo } from "@/lib/bridge";
import { Categories } from "@/pages/Categories";
import { Feed } from "@/pages/Feed";
import { History } from "@/pages/History";
import { Product } from "@/pages/Product";
import { Results } from "@/pages/Results";
import { Settings } from "@/pages/Settings";
import { useSettings } from "@/store/settings";

export function App() {
  const hydrate = useSettings((s) => s.hydrate);
  const hydrated = useSettings((s) => s.hydrated);
  const [ext, setExt] = useState<ExtensionInfo>({ installed: false, sessions: {} });
  useEffect(() => {
    void hydrate();
    void detectExtension().then(setExt);
  }, [hydrate]);
  if (!hydrated) return null;
  return (
    <BrowserRouter>
      <TopBar extension={ext} />
      <Routes>
        <Route path="/" element={<Feed />} />
        <Route path="/c/:group" element={<Feed />} />
        <Route path="/c/:group/:leaf" element={<Feed />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/p/:id" element={<Product />} />
        <Route path="/search/:id" element={<Results />} />
        <Route path="/history" element={<History />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </BrowserRouter>
  );
}
