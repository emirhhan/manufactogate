import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { db } from "@/lib/db";
import { getRegistry } from "@/lib/registry";
import { useExtension } from "@/store/extension";
import { useSettings } from "@/store/settings";
import { Button, Card, Checklist, Step, cn, type StepState } from "./ui";

export interface OnboardingFacts {
  installed: boolean;
  orphaned: boolean;
  enabledCount: number;
  loggedIn: number;
  loggedOut: number;
  searches: number;
  hasTarget: boolean;
}

/** Step states from the facts; pure so the checklist logic is testable. */
export function onboardingSteps(f: OnboardingFacts): { extension: StepState; login: StepState; search: StepState; settings: StepState; allDone: boolean } {
  const extension: StepState = f.installed && !f.orphaned ? "done" : f.installed ? "warning" : "todo";
  const login: StepState = !f.installed ? "todo" : f.loggedOut > 0 ? "warning" : f.loggedIn > 0 ? "done" : "todo";
  const search: StepState = f.searches > 0 ? "done" : "todo";
  const settings: StepState = f.hasTarget && f.enabledCount > 0 ? "done" : "warning";
  return { extension, login, search, settings, allDone: extension === "done" && login === "done" && search === "done" && settings === "done" };
}

/** First-run checklist: extension, market logins, first search, target country. Hides itself when everything is done or dismissed. */
export function Onboarding({ className }: { className?: string }) {
  const info = useExtension((s) => s.info);
  const enabled = useSettings((s) => s.enabledMarkets);
  const targetCountry = useSettings((s) => s.targetCountry);
  const dismissedAt = useSettings((s) => s.onboardingDismissedAt);
  const dismiss = useSettings((s) => s.dismissOnboarding);
  const [searches, setSearches] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    db.searches
      .count()
      .then((n) => alive && setSearches(n))
      .catch(() => alive && setSearches(0));
    return () => {
      alive = false;
    };
  }, []);
  if (dismissedAt || searches === null) return null;
  const reg = getRegistry();
  const enabledAdapters = enabled.map((m) => reg.get(m)).filter((a): a is NonNullable<typeof a> => !!a);
  const loggedIn = enabledAdapters.filter((a) => info.sessions[a.id] === "logged-in").length;
  const loggedOutAdapters = enabledAdapters.filter((a) => info.sessions[a.id] === "logged-out" || info.sessions[a.id] === "captcha");
  const facts: OnboardingFacts = {
    installed: info.installed,
    orphaned: !!info.orphaned,
    enabledCount: enabled.length,
    loggedIn,
    loggedOut: loggedOutAdapters.length,
    searches,
    hasTarget: enabledAdapters.some((a) => a.meta.country === targetCountry && a.meta.role !== "source"),
  };
  const st = onboardingSteps(facts);
  if (st.allDone) return null;
  return (
    <Card className={cn("p-4 sm:p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-accent">Başlangıç</div>
          <h2 className="mt-1 text-base font-semibold tracking-tight">Gerçek pazarlarda aramak için dört adım</h2>
        </div>
        <Button size="sm" variant="ghost" onClick={dismiss} aria-label="Başlangıç listesini gizle">Gizle</Button>
      </div>
      <Checklist className="mt-2">
        <Step
          state={st.extension}
          title="Eklenti kurulu"
          hint={
            st.extension === "done"
              ? `Manufactogate v${info.version ?? ""} bu sekmeye bağlı.`
              : st.extension === "warning"
                ? "Eklenti yenilendi; bu sekmeyi yenile (F5)."
                : "Chrome → Uzantılar → Geliştirici modu → “Paketlenmemiş öğe yükle” → apps/extension/dist klasörü. Sonra bu sayfayı yenile."
          }
          action={st.extension === "warning" ? <Button size="sm" onClick={() => location.reload()}>Yenile</Button> : <Link to="/settings" className="text-[12px] text-accent hover:underline">Ayarlar</Link>}
        />
        <Step
          state={st.login}
          title="Pazarlara giriş"
          hint={
            !info.installed
              ? "Eklenti bağlanınca açık pazarların oturum durumu burada görünür."
              : loggedOutAdapters.length
                ? `${loggedOutAdapters.length} pazarda giriş yok: ${loggedOutAdapters.map((a) => a.meta.name).slice(0, 4).join(", ")}`
                : `${loggedIn}/${enabledAdapters.length} açık pazarda giriş var.`
          }
          action={
            loggedOutAdapters[0]?.meta.loginUrl ? (
              <a href={loggedOutAdapters[0].meta.loginUrl} target="_blank" rel="noreferrer noopener" className="text-[12px] text-accent hover:underline">
                {loggedOutAdapters[0].meta.name} giriş ↗
              </a>
            ) : undefined
          }
        />
        <Step state={st.search} title="İlk arama" hint={searches > 0 ? `${searches} arama yapıldı.` : "Yukarıdaki kutuya bir ürün adı yaz, link yapıştır ya da görsel bırak."} />
        <Step
          state={st.settings}
          title="Hedef ülke ve pazarlar"
          hint={facts.hasTarget ? `${enabled.length} pazar açık; hedef ülkede satan pazar var.` : enabled.length ? "Hedef ülkede satan bir pazar açık değil; satılabilirlik analizi boş kalır." : "Hiç pazar açık değil."}
          action={<Link to="/settings" className="text-[12px] text-accent hover:underline">Ayarlar</Link>}
        />
      </Checklist>
    </Card>
  );
}
