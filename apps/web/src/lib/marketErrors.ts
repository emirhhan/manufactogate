import type { AdapterErrorType, MarketId, MarketStatus } from "@manufactogate/core";
import { REAL_DEF_BY_ID } from "@manufactogate/adapters";

export interface ErrorAction {
  label: string;
  href: string;
}
export interface ErrorDescription {
  /** Short chip label ("Giriş yok"). */
  title: string;
  /** One sentence: what happened and what to do. */
  hint: string;
  action?: ErrorAction;
  /** Retrying without a user action is pointless (selector broken, not found). */
  retryable: boolean;
}

const TEXT: Record<AdapterErrorType, { title: string; hint: string }> = {
  LoggedOut: { title: "Giriş yok", hint: "Bu pazara tarayıcıda giriş yap, sonra yeniden dene." },
  Captcha: { title: "Doğrulama", hint: "Pazar sekmesi açık bırakıldı; doğrulamayı tamamla, arama kendiliğinden sürer." },
  SelectorBroken: { title: "Pazar güncellendi", hint: "Sayfa beklenen yapıda değil. Eklenti açılır penceresinden sayfayı yakalayıp gönder; o zamana kadar bu pazarı karşılaştırmadan çıkarabilirsin." },
  RateLimited: { title: "Hız sınırı", hint: "Pazar istekleri yavaşlattı; kısa bir bekleme sonrası yeniden dene." },
  NotFound: { title: "Bulunamadı", hint: "Bu pazarda sorguya uyan ilan yok." },
  Network: { title: "Sayfa açılamadı", hint: "Bağlantı hatası, zaman aşımı veya pazarın boş hata sayfası. Pazarı bir kez elle açıp yüklendiğini gör, sonra yeniden dene." },
  Timeout: { title: "Zaman aşımı", hint: "Pazar süre içinde yanıt vermedi; yeniden dene ya da daha az pazarla ara." },
  Internal: { title: "İç hata", hint: "Bizim tarafımızda bir hata oluştu; tanı bölümündeki mesajı bildir." },
};

/** Search URL of a real market for a query, when the registry knows the market. */
export function marketSearchUrl(market: MarketId | string, query: string | undefined): string | null {
  const def = REAL_DEF_BY_ID[market as MarketId];
  if (!def) return null;
  try {
    return query ? def.searchUrl(query, 1) : (def.homeUrl ?? def.searchUrl(def.healthQuery, 1));
  } catch {
    return null;
  }
}

/** Describes a market failure with an actionable Turkish hint and, when possible, a link to act on. */
export function describeError(type: AdapterErrorType | string, message: string | undefined, market: MarketId | string, query?: string): ErrorDescription {
  const base = TEXT[type as AdapterErrorType] ?? { title: type, hint: message ?? "" };
  const def = REAL_DEF_BY_ID[market as MarketId];
  const msgUrl = message && /^https?:\/\/\S+$/.test(message.trim()) ? message.trim() : null;
  let action: ErrorAction | undefined;
  if (type === "LoggedOut") {
    const href = msgUrl ?? def?.meta.loginUrl ?? marketSearchUrl(market, query);
    if (href) action = { label: "Giriş yap", href };
  } else if (type === "Captcha") {
    const href = msgUrl ?? marketSearchUrl(market, query);
    if (href) action = { label: "Doğrula", href };
  } else if (type === "Network" || type === "Timeout" || type === "RateLimited" || type === "SelectorBroken") {
    const href = marketSearchUrl(market, query);
    if (href) action = { label: "Pazarda aç", href };
  }
  const retryable = type !== "SelectorBroken" && type !== "NotFound" && type !== "Internal";
  return { title: base.title, hint: base.hint, retryable, ...(action ? { action } : {}) };
}

/** Error title only (for compact chips and table cells). */
export function errorTitle(type: string): string {
  return TEXT[type as AdapterErrorType]?.title ?? type;
}

export interface MarketSummary {
  total: number;
  done: number;
  withResults: number;
  zero: number;
  errors: number;
  pending: number;
  running: number;
  byType: Partial<Record<AdapterErrorType, string[]>>;
  /** Markets that returned nothing (done with 0 listings). */
  zeroMarkets: string[];
  /** Markets with a user-fixable error (login, captcha). */
  needsUser: string[];
  /** Markets with a retryable error (network, timeout, rate limit). */
  retryable: string[];
  /** Broken selectors: retrying will not help. */
  broken: string[];
  /** One-line Turkish suggestions in priority order. */
  suggestions: string[];
}

/** Aggregates the per-market states into a diagnosis the empty/partial result states can show. */
export function summarizeMarkets(markets: Record<string, MarketStatus>, listings: Record<string, unknown[]> = {}, opts: { running?: boolean; beta?: (m: string) => boolean } = {}): MarketSummary {
  const s: MarketSummary = { total: 0, done: 0, withResults: 0, zero: 0, errors: 0, pending: 0, running: 0, byType: {}, zeroMarkets: [], needsUser: [], retryable: [], broken: [], suggestions: [] };
  for (const [m, st] of Object.entries(markets)) {
    s.total++;
    const n = listings[m]?.length ?? (st.state === "done" ? st.received : 0);
    if (st.state === "done") {
      s.done++;
      if (n > 0) s.withResults++;
      else {
        s.zero++;
        s.zeroMarkets.push(m);
      }
    } else if (st.state === "error") {
      s.errors++;
      (s.byType[st.type] ??= []).push(m);
      if (st.type === "LoggedOut" || st.type === "Captcha") s.needsUser.push(m);
      else if (st.type === "SelectorBroken" || st.type === "Internal") s.broken.push(m);
      else if (st.type !== "NotFound") s.retryable.push(m);
    } else if (st.state === "running") s.running++;
    else s.pending++;
  }
  if (s.needsUser.length) s.suggestions.push(`${s.needsUser.length} pazar giriş veya doğrulama bekliyor: sekmeleri aç, sonra "yeniden dene".`);
  if (s.retryable.length) s.suggestions.push(`${s.retryable.length} pazarda bağlantı/zaman aşımı: pazarı bir kez elle açıp tekrar dene.`);
  if (s.broken.length) s.suggestions.push(`${s.broken.length} pazarın sayfa yapısı değişmiş: eklentiden sayfa yakalaması gönder, bir sonraki karşılaştırmadan çıkar.`);
  const betaZero = opts.beta ? s.zeroMarkets.filter(opts.beta) : [];
  if (s.zero > 0) s.suggestions.push(`${s.zero} pazar boş döndü: sorguyu kısalt (marka + model + kategori) ya da pazar dilinde yaz.`);
  if (betaZero.length >= 3) s.suggestions.push(`${betaZero.length} beta pazar boş döndü; bir sonraki aramada beta pazarları kapatmak zaman kazandırır.`);
  if (!opts.running && s.pending + s.running > 0) s.suggestions.push(`${s.pending + s.running} pazar durduruldu; tamamlamak için yeniden dene.`);
  return s;
}
