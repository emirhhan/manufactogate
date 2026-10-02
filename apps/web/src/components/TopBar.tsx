import { Link, NavLink } from "react-router-dom";
import { useSettings } from "@/store/settings";
import { cn } from "./ui";

export function TopBar({ extension, dataSource }: { extension: { installed: boolean; version?: string }; dataSource: "mock" | "extension" }) {
  const theme = useSettings((s) => s.theme);
  const setTheme = useSettings((s) => s.setTheme);
  const next = theme === "dark" ? "light" : theme === "light" ? "system" : "dark";
  return (
    <header className="sticky top-0 z-20 h-12 border-b border-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-full max-w-[1440px] items-center gap-6 px-4">
        <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="inline-block h-4 w-4 rounded-sm bg-accent" aria-hidden />
          Manufactogate
        </Link>
        <nav className="flex items-center gap-1 text-[13px]">
          {[
            ["/", "Ürünler"],
            ["/categories", "Kategoriler"],
            ["/history", "Aramalarım"],
            ["/settings", "Ayarlar"],
          ].map(([to, label]) => (
            <NavLink
              key={to}
              to={to!}
              end={to === "/"}
              className={({ isActive }) =>
                cn("rounded-md px-2.5 py-1.5 text-muted hover:bg-surface-2 hover:text-text", isActive && "bg-surface-2 text-text")
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-[12px] text-muted">
          <Link
            to="/settings"
            className="flex items-center gap-1.5 hover:text-text"
            title={extension.installed ? `Eklenti v${extension.version} · veri kaynağı: ${dataSource === "extension" ? "gerçek pazarlar" : "sahte"}` : "Eklenti kurulu değil; sahte veri modu"}
          >
            <span className={cn("inline-block h-2 w-2 rounded-full", dataSource === "extension" ? "bg-success" : extension.installed ? "bg-accent" : "bg-warning")} />
            {dataSource === "extension" ? "Gerçek veri · eklenti" : extension.installed ? "Sahte veri · eklenti bağlı" : "Sahte veri modu"}
          </Link>
          <button onClick={() => setTheme(next)} className="rounded-md border border-border px-2 py-1 hover:bg-surface-2" title="Tema">
            {theme === "system" ? "Sistem" : theme === "dark" ? "Koyu" : "Açık"}
          </button>
        </div>
      </div>
    </header>
  );
}
