import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { MarketId, RawListing, RawSupplier } from "@manufactogate/core";
import { COUNTRY_NAMES_TR } from "@manufactogate/country-profiles";
import { rankManufacturers, supplierRisk, supplierScore, traceContextOf } from "@/lib/analysis";
import { db, getSetting, setSetting } from "@/lib/db";
import { money, pct } from "@/lib/format";
import { minOf } from "@/lib/fx";
import { supplierSignals } from "@/lib/listingFields";
import { marketTone, sellerDisplayName, storeUrl } from "@/lib/markets";
import { getRegistry } from "@/lib/registry";
import { useSettings } from "@/store/settings";
import { Badge, Card, cn } from "./ui";

/** Chinese country names for the supplier message templates. */
const COUNTRY_ZH: Record<string, string> = { tr: "土耳其", de: "德国", us: "美国", gb: "英国", ae: "阿联酋", nl: "荷兰", pl: "波兰", ro: "罗马尼亚" };
const COUNTRY_EN: Record<string, string> = { tr: "Turkey", de: "Germany", us: "the United States", gb: "the United Kingdom", ae: "the UAE", nl: "the Netherlands", pl: "Poland", ro: "Romania" };
const CITY: Record<string, { zh: string; en: string }> = { tr: { zh: "伊斯坦布尔", en: "Istanbul" }, de: { zh: "汉堡", en: "Hamburg" }, us: { zh: "洛杉矶", en: "Los Angeles" }, gb: { zh: "伦敦", en: "London" }, ae: { zh: "迪拜", en: "Dubai" }, nl: { zh: "鹿特丹", en: "Rotterdam" }, pl: { zh: "华沙", en: "Warsaw" }, ro: { zh: "布加勒斯特", en: "Bucharest" } };

const PROFILE_TTL_MS = 7 * 24 * 3600 * 1000;
interface CachedProfile {
  at: number;
  profile: RawSupplier | null;
  error?: string;
}

/** Cached supplier profile fetch (db.settings `supplier:<market>:<id>`), 7-day TTL. */
export async function loadSupplierProfile(market: MarketId, id: string, force = false): Promise<CachedProfile> {
  const key = `supplier:${market}:${id}`;
  if (!force) {
    const hit = await getSetting<CachedProfile | null>(key, null);
    if (hit && Date.now() - hit.at < PROFILE_TTL_MS) return hit;
  }
  const adapter = getRegistry().get(market);
  if (!adapter || !adapter.meta.capabilities.supplierProfile) return { at: Date.now(), profile: null, error: "bu pazar mağaza profili vermiyor" };
  try {
    const profile = await adapter.fetchSupplier(id);
    const rec = { at: Date.now(), profile };
    await setSetting(key, rec);
    return rec;
  } catch (e) {
    return { at: Date.now(), profile: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Supplier intelligence: factory-vs-trader estimate, store profile (years, repeat purchase, response),
 * other listings of the same seller on this device, risk flags, "muhtemel üretici" ranking among peers,
 * and ready-to-send messages (Chinese and English) addressed from the user's target country.
 */
export function SupplierPanel({ listing, peers = [] }: { listing: RawListing; peers?: RawListing[] }) {
  const targetCountry = useSettings((x) => x.targetCountry);
  const reg = getRegistry();
  const adapter = reg.get(listing.market);
  const [lang, setLang] = useState<"zh" | "en">("zh");
  const [qty, setQty] = useState(listing.price.tiers[1]?.minQty ?? Math.max(listing.moq ?? 1, 100));
  const [copied, setCopied] = useState("");
  const [profileState, setProfileState] = useState<{ status: "idle" | "loading" | "done" | "error" | "unsupported"; profile: RawSupplier | null; error?: string }>({ status: "idle", profile: null });
  const [others, setOthers] = useState<RawListing[]>([]);
  const key = `${listing.market}:${listing.id}`;
  const supplierKey = listing.supplierId ?? listing.supplierName ?? "";

  useEffect(() => {
    setProfileState({ status: "idle", profile: null });
    setOthers([]);
    setCopied("");
    setQty(listing.price.tiers[1]?.minQty ?? Math.max(listing.moq ?? 1, 100));
  }, [key, listing]);

  // Store profile through the adapter (mock registry today; the real 1688 path needs a captured shop-page fixture).
  useEffect(() => {
    if (!adapter || !listing.supplierId) return;
    if (!adapter.meta.capabilities.supplierProfile) {
      setProfileState({ status: "unsupported", profile: null });
      return;
    }
    let alive = true;
    setProfileState({ status: "loading", profile: null });
    void loadSupplierProfile(listing.market, listing.supplierId).then((r) => {
      if (!alive) return;
      setProfileState(r.profile ? { status: "done", profile: r.profile } : { status: "error", profile: null, ...(r.error ? { error: r.error } : {}) });
    });
    return () => {
      alive = false;
    };
  }, [adapter, listing.market, listing.supplierId]);

  // Other listings from this seller already on this device (offline, db.listings market index).
  useEffect(() => {
    if (!supplierKey) return;
    let alive = true;
    void db.listings
      .where("market")
      .equals(listing.market)
      .filter((l) => (l.supplierId ? l.supplierId === listing.supplierId : l.supplierName === listing.supplierName) && l.id !== listing.id)
      .limit(12)
      .toArray()
      .then((rows) => {
        if (!alive) return;
        const seen = new Set<string>();
        setOthers(rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true))));
      });
    return () => {
      alive = false;
    };
  }, [listing.market, listing.supplierId, listing.supplierName, listing.id, supplierKey]);

  const profile = profileState.profile;
  // Core trace scorer: badges + shop profile (or the card's own years/verified/business type) + price position among peers.
  const s = useMemo(() => supplierScore(listing, profile, traceContextOf([listing, ...peers], listing.price.currency)), [listing, profile, peers]);
  const risks = useMemo(() => supplierRisk(listing, profile, peers), [listing, profile, peers]);
  const cardSignals = useMemo(() => supplierSignals(listing, profile), [listing, profile]);
  const ranking = useMemo(() => {
    const pool = peers.filter((p) => !(p.market === listing.market && p.id === listing.id));
    if (pool.length < 2) return [];
    return rankManufacturers([listing, ...pool]).slice(0, 5);
  }, [listing, peers]);

  const name = sellerDisplayName(listing) ?? profile?.name ?? "";
  const country = COUNTRY_NAMES_TR[targetCountry] ?? targetCountry.toUpperCase();
  const zhCountry = COUNTRY_ZH[targetCountry] ?? country;
  const enCountry = COUNTRY_EN[targetCountry] ?? country;
  const city = CITY[targetCountry] ?? { zh: zhCountry, en: enCountry };
  const short = listing.title.slice(0, 40);
  const templates: Record<string, { zh: string; en: string }> = {
    quote: {
      zh: `您好${name ? `，${name}` : ""}！我是来自${zhCountry}的采购商，对贵司的「${short}」很感兴趣。请问 ${qty} 件的最优单价是多少？是否可以提供 FOB 价格、交货周期和包装规格？另外请问贵司是生产厂家还是贸易公司？谢谢！`,
      en: `Hello${name ? ` ${name}` : ""}, I am a buyer from ${enCountry} interested in your "${short}". What is your best unit price for ${qty} pcs? Could you share FOB price, lead time and packaging details? Also, are you the manufacturer or a trading company? Thank you.`,
    },
    sample: {
      zh: `您好！在下大单前我们想先订购样品。请问样品价格、样品制作时间以及发往${zhCountry}${city.zh}的运费是多少？样品费用可以在正式订单中抵扣吗？`,
      en: `Hello! Before placing a bulk order we would like to order samples. What is the sample price, sample lead time and shipping cost to ${city.en}, ${enCountry}? Can the sample cost be deducted from the bulk order?`,
    },
    custom: {
      zh: `您好！我们希望定制此产品：加印我们的 logo 并使用定制包装。请问起订量是多少？定制是否有额外费用？能否提供产品的 CE/3C 等认证文件？`,
      en: `Hello! We would like to customise this product with our logo and custom packaging. What is the MOQ for customisation and is there an extra charge? Could you also share CE/3C or other certification documents?`,
    },
  };
  const copy = async (k: string) => {
    try {
      await navigator.clipboard.writeText(templates[k]![lang]);
      setCopied(k);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      setCopied("");
    }
  };
  const factoryPct = Math.round(s.factory * 100);
  const store = storeUrl(listing.market, listing.supplierId) ?? profile?.url ?? null;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted">Tedarikçi</div>
        <div className="flex items-center gap-2 text-[12px]">
          <span className="text-muted">Fabrika olasılığı</span>
          <span className={cn("rounded-full px-2 py-0.5 font-medium tnum", factoryPct >= 65 ? "bg-success/10 text-success" : factoryPct >= 40 ? "bg-warning/10 text-warning" : "bg-surface-2 text-muted")}>%{factoryPct}</span>
        </div>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px]">
        <span className="font-medium">{name || "Satıcı adı okunamadı"}</span>
        {(listing.location ?? profile?.location) && <span className="text-muted">· {listing.location ?? profile?.location}</span>}
        {store && (
          <a href={store} target="_blank" rel="noreferrer noopener" className="text-[12px] text-accent hover:underline">
            Mağaza ↗
          </a>
        )}
      </div>
      {cardSignals.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {cardSignals.map((x) => (
            <Badge key={x.key} tone={x.tone === "success" ? "success" : x.tone === "warning" ? "warning" : "neutral"}>{x.label}</Badge>
          ))}
        </div>
      )}
      {s.reasons.length > 0 && <div className="mt-1 text-[12px] text-muted">{s.reasons.join(" · ")}</div>}

      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr]">
        <div className="rounded-md border border-border bg-surface-2/40 p-3 text-[12px]">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-medium">Mağaza profili</span>
            <span className="text-muted">
              {profileState.status === "loading" ? "okunuyor…" : profileState.status === "done" ? "pazardan" : profileState.status === "unsupported" ? "bu pazarda yok" : profileState.status === "error" ? "okunamadı" : listing.supplierId ? "" : "satıcı kimliği yok"}
            </span>
          </div>
          {profile ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 tnum">
              {profile.yearsOnPlatform !== undefined && (<><dt className="text-muted">Pazarda</dt><dd>{profile.yearsOnPlatform} yıl</dd></>)}
              {profile.businessType && profile.businessType !== "unknown" && (<><dt className="text-muted">Tür</dt><dd>{profile.businessType === "factory" ? "Üretici" : "Ticaret"}</dd></>)}
              {profile.repeatPurchaseRate !== undefined && (<><dt className="text-muted">Tekrar alım</dt><dd>{pct(profile.repeatPurchaseRate)}</dd></>)}
              {profile.responseRate !== undefined && (<><dt className="text-muted">Yanıt oranı</dt><dd>{pct(profile.responseRate)}{profile.responseTime ? ` · ${profile.responseTime}` : ""}</dd></>)}
              {profile.mainCategories?.length ? (<><dt className="text-muted">Ana gruplar</dt><dd>{profile.mainCategories.join(", ")}</dd></>) : null}
              {profile.badges.length > 0 && (<><dt className="text-muted">Etiketler</dt><dd className="flex flex-wrap gap-1">{profile.badges.map((b) => <Badge key={b}>{b}</Badge>)}</dd></>)}
            </dl>
          ) : listing.supplier && Object.keys(listing.supplier).length ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 tnum">
              {listing.supplier.years !== undefined && (<><dt className="text-muted">Pazarda</dt><dd>{listing.supplier.years} yıl</dd></>)}
              {listing.supplier.businessType && listing.supplier.businessType !== "unknown" && (<><dt className="text-muted">Tür</dt><dd>{listing.supplier.businessType === "factory" ? "Üretici" : "Ticaret"}</dd></>)}
              {listing.supplier.verified && (<><dt className="text-muted">Doğrulama</dt><dd>Pazar tarafından doğrulanmış</dd></>)}
              {listing.supplier.rating !== undefined && (<><dt className="text-muted">Mağaza puanı</dt><dd>{(listing.supplier.rating > 5 ? listing.supplier.rating / 20 : listing.supplier.rating).toFixed(1)}{listing.supplier.ratingCount ? ` (${listing.supplier.ratingCount.toLocaleString("tr-TR")})` : ""}</dd></>)}
              <dt className="text-muted">Kaynak</dt><dd className="text-muted">ilan kartı{adapter?.meta.capabilities.supplierProfile ? "; mağaza sayfası okunursa güncellenir" : ""}</dd>
            </dl>
          ) : (
            <p className="text-muted">
              {profileState.status === "error" ? profileState.error : adapter?.meta.capabilities.supplierProfile ? "Mağaza sayfası okunduğunda yıl, tekrar alım ve yanıt oranı burada görünür." : "Bu pazar mağaza profili sunmuyor; sinyaller ilan kartından türetildi."}
            </p>
          )}
        </div>
        <div className="rounded-md border border-border bg-surface-2/40 p-3 text-[12px]">
          <div className="mb-1 font-medium">Risk özeti</div>
          {risks.length ? (
            <ul className="flex flex-wrap gap-1.5">
              {risks.map((r, i) => (
                <li key={i}><Badge tone={r.tone === "danger" ? "danger" : r.tone === "warning" ? "warning" : r.tone === "success" ? "success" : "neutral"}>{r.text}</Badge></li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">Belirgin bir risk sinyali yok.</p>
          )}
        </div>
      </div>

      {ranking.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">Muhtemel üretici · aynı üründeki tedarikçiler</div>
          <ol className="divide-y divide-border rounded-md border border-border text-[12px]">
            {ranking.map((c, i) => {
              const a = reg.get(c.listing.market);
              const m = minOf(c.listing);
              const isThis = c.listing.market === listing.market && c.listing.id === listing.id;
              return (
                <li key={`${c.listing.market}:${c.listing.id}`} className={cn("flex items-center gap-2 px-2 py-1.5", isThis && "bg-accent/5")}>
                  <span className="w-4 text-muted tnum">{i + 1}.</span>
                  <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium text-white", marketTone(c.listing.market))}>{a?.meta.name ?? c.listing.market}</span>
                  <Link to={`/l/${c.listing.market}/${c.listing.id}`} className="min-w-0 flex-1 truncate hover:underline" title={c.listing.title}>
                    {sellerDisplayName(c.listing) ?? c.listing.title}
                  </Link>
                  <span className="text-muted tnum">{m === null ? "teklif" : money(m, c.listing.price.currency)}</span>
                  {c.pricePosition !== null && <span className="text-[11px] text-muted tnum" title="medyana göre fiyat">{c.pricePosition < 1 ? `-${Math.round((1 - c.pricePosition) * 100)}%` : `+${Math.round((c.pricePosition - 1) * 100)}%`}</span>}
                  <span className={cn("rounded-full px-1.5 py-0.5 text-[11px] font-medium tnum", c.factory >= 0.65 ? "bg-success/10 text-success" : c.factory >= 0.4 ? "bg-warning/10 text-warning" : "bg-surface-2 text-muted")} title={c.reasons.join(" · ")}>
                    fabrika %{Math.round(c.factory * 100)}
                  </span>
                  {i === 0 && c.factory >= 0.5 && <Badge tone="success">muhtemel üretici</Badge>}
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {others.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">Bu satıcının diğer ilanları (cihazda kayıtlı)</div>
          <ul className="flex flex-wrap gap-1.5 text-[12px]">
            {others.map((o) => (
              <li key={o.id}>
                <Link to={`/l/${o.market}/${o.id}`} className="chip h-7 max-w-[260px] truncate" title={o.title}>
                  {o.title.slice(0, 40)}
                  {minOf(o) !== null ? ` · ${money(minOf(o)!, o.price.currency)}` : ""}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px]">
        <span className="text-muted">Mesaj taslağı · {country}'den alıcı olarak</span>
        <button onClick={() => setLang("zh")} className={cn("chip h-7", lang === "zh" && "chip-on")}>中文</button>
        <button onClick={() => setLang("en")} className={cn("chip h-7", lang === "en" && "chip-on")}>English</button>
        <label className="ml-auto flex items-center gap-1 text-muted">
          adet
          <input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value) || 1)} className="h-7 w-20 rounded border border-border bg-bg px-2 text-right tnum outline-none focus:border-accent" />
        </label>
      </div>
      <div className="mt-2 grid gap-2 md:grid-cols-3">
        {(["quote", "sample", "custom"] as const).map((k) => (
          <div key={k} className="rounded-md border border-border bg-surface-2/50 p-2 text-[12px]">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-medium">{k === "quote" ? "Fiyat teklifi" : k === "sample" ? "Numune" : "Özelleştirme"}</span>
              <button onClick={() => void copy(k)} className="text-accent hover:underline">{copied === k ? "Kopyalandı ✓" : "Kopyala"}</button>
            </div>
            <p className="line-clamp-5 leading-relaxed text-muted">{templates[k]![lang]}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
