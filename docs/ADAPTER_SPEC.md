# Pazar Adapter Sözleşmesi

Her pazar bir adapter'dır. Adapter, bir pazarın arama ve ürün sayfalarını okuyup
Manufactogate'in ortak veri modeline çevirir. Çekirdek motor hiçbir pazarı tanımaz;
sadece bu sözleşmeyi tanır.

## 1. Adapter'ın sorumlulukları

1. **Kimlik:** pazar kimliği, ülke, para birimi, dil, desteklenen giriş türleri.
2. **Oturum:** kullanıcının giriş yapıp yapmadığını tespit etmek; giriş sayfasına yönlendirmek.
3. **Arama:** görselle, metinle veya link ile arama başlatmak ve sonuç listesini ayrıştırmak.
4. **Ürün detayı:** ürün sayfasından fiyat kademeleri, MOQ, varyantlar, galeri, tedarikçi bilgisi çıkarmak.
5. **Tedarikçi profili:** mağaza sayfasından etiketler, yıl, konum, tekrar alım oranı çıkarmak.
6. **Link çözme:** bir URL'nin bu pazara ait olup olmadığını ve ürün kimliğini tespit etmek.
7. **Sağlık:** kendi seçicilerinin hâlâ çalıştığını doğrulayan duman testi.

## 2. Arayüz

Kaynak: `packages/core/src/model/adapter.ts`.

```ts
interface MarketAdapter {
  id: MarketId;                       // "cn-1688", "tr-trendyol", "us-mercari" …
  meta: MarketMeta;                   // name, country, currency, language, role, capabilities, rateLimit, version, hosts, loginUrl?
  badgeMap: Record<string, NormalizedBadge>;

  session(): Promise<SessionState>;   // "logged-in" | "logged-out" | "captcha" | "unknown"
  resolveLink(url: string): LinkInfo | null;

  searchByImage(input: ImageInput, opts?: SearchOptions): AsyncIterable<RawListing>;
  searchByText(query: string, opts?: SearchOptions): AsyncIterable<RawListing>;

  /** `hint` ile satıcıya özel sayfa açılır (Trendyol merchantId); yoksa alıcı kutusu satıcısı döner. */
  fetchListing(id: string, hint?: ListingHint): Promise<RawListingDetail>;
  fetchSupplier(id: string): Promise<RawSupplier>;

  healthCheck(): Promise<HealthResult>;
}

interface SearchOptions {
  maxResults?: number;
  /** İptal: sayfalar arası döngüyü değil, açık sayfa isteğini de durdurur (çalıştırıcıya iletilir). */
  signal?: AbortSignal;
  /** Canlı aşama: queued | opening | loading | typing | image | settling | captcha | done (+ sayfa no). */
  onProgress?: (p: AdapterProgress) => void;
}

interface ListingHint { url?: string; supplierId?: string }
```

`AsyncIterable` kullanılır çünkü sonuçlar sayfa sayfa gelir ve arayüz kademeli dolar.

**Detay ipucu sırası** (`detailUrlFor`, `runtime/realAdapter.ts`): pazar tanımının `detailUrlFor(id, hint)` kancası →
`hint.url`'nin `resolveLink` ile kanonik hâli (satıcı parametreleri korunur) → `SELLER_PARAM` (Trendyol `merchantId`)
ile `detailUrl(id)` → düz `detailUrl(id)`. Web tarafı `listingHint(listing)` (`apps/web/src/lib/listingFields.ts`) ile
`{ url, supplierId }` geçirir.

**İptal sözleşmesi:** `signal` tetiklenince adapter `AbortError` fırlatır, asla `AdapterError` değil; orkestratör
pazarı "iptal" sayar ve hata şeridinde göstermez.

## 3. Normalize kayıtlar

Kaynak: `packages/core/src/model/listing.ts`.

```ts
interface RawListing {
  market: MarketId;
  id: string;
  url: string;                        // her zaman gerçek ürün sayfası
  title: string;                      // sayfadaki dil
  titleLang?: string;                 // pazar başlığı tarayıcı diline çevirdiyse ("tr", "en"); 1688 i18n
  images: string[];                   // ana görsel ilk sırada
  price: PriceInfo;                   // tek fiyat = tek kademe; fiyatsız B2B ilanında tiers: []
  priceMax?: number;                  // "US$ 14.49 - 14.99" üst sınırı; tiers alt sınırı taşır
  priceOnRequest?: boolean;           // "Ask for a Quote", "Negotiable", "面议"
  moq?: number;
  sold?: number;
  soldPeriod?: "30d" | "total" | "reviews";   // 1688 30 gün, Taobao toplam, Trendyol yorum sayısı
  rating?: number;
  ratingMax?: 5 | 100;                // yüzde puan (Taobao/Tmall "98%") için 100
  reviewCount?: number;               // SearchItem.ratingCount buradan gelir
  packQty?: number;                   // "10 adet", "x3", "10pcs": fiyatın kapsadığı birim sayısı
  unitLabel?: string;                 // 件, 套, adet, pair
  shipFrom?: CountryCode;
  variantCount?: number;
  supplierId?: string;
  supplierName?: string;
  supplier?: ListingSupplierInfo;     // karttan okunan tedarikçi sinyalleri
  location?: string;
  badges: string[];                   // pazarın kendi etiketleri, ham haliyle
  fetchedAt: string;                  // ISO zaman
}

interface ListingSupplierInfo {
  years?: number;                     // "16 Years", "7+ yrs", "2年"
  verified?: boolean;                 // Verified / TrustSEAL / 实力商家
  businessType?: "factory" | "trading" | "unknown";
  rating?: number;                    // mağaza puanı, ratingMax ölçeğinde
  ratingCount?: number;
}

interface PriceInfo {
  currency: CurrencyCode;
  tiers: { minQty: number; unitPrice: number }[];
}

interface RawSupplier {
  market: MarketId; id: string; url: string; name: string;
  location?: string; yearsOnPlatform?: number; badges: string[];
  repeatPurchaseRate?: number; responseRate?: number; responseTime?: string;
  mainCategories?: string[]; businessType?: "factory" | "trading" | "unknown";
}
```

Pazar tanımlarının `toListing` fonksiyonu yalnız temel alanları doldurur; `enrichListing(def, item, listing)`
(`runtime/realAdapter.ts`, `readItems` içinde her pazar için çağrılır) `SearchItem`'daki `ratingCount → reviewCount`,
`priceMax`, `priceOnRequest`, `titleLang`, `soldPeriod` (def `soldPeriod` → `SOLD_PERIOD` tablosu → "reviews" eğer
`sold` `ratingCount`'tan geldiyse → "total"), `ratingMax` (puan > 5 ise 100) ve `supplier` bloğunu
(`supplierYears`, `supplierVerified`, `businessType`, `supplierRating`) ekler. Yeni bir pazar tanımı bu alanları
elle kopyalamaz.

Yardımcılar: `monthlySalesEstimate()` (`sold`/`soldPeriod`/`reviewCount` → aylık tahmin), `ratingOutOf5()`,
`unitPriceNormalized()` (`packQty`'ye bölünmüş birim fiyat).

Çekirdek motor `badges` dizisini adapter başına bir sözlükle anlamlandırır:
1688'in "源头工厂" etiketi "verified-factory" normalize etiketine, Alibaba.com'un
"Verified Supplier" etiketi "verified-supplier" etiketine gider.

## 4. Hata sözleşmesi

Adapter asla sessizce boş dönmez. Her hata tiplidir (`AdapterError.type`):

| Tip | Anlamı | Arayüz davranışı (`apps/web/src/lib/marketErrors.ts`) |
|---|---|---|
| `LoggedOut` | Oturum yok | "Giriş yap" düğmesi, `meta.loginUrl` |
| `Captcha` | Doğrulama istendi | Sekme öne getirilir; çözülünce otomatik devam |
| `SelectorBroken` | Sayfa yapısı değişti | "Pazar güncellendi" ve sağlık kaydı |
| `RateLimited` | Çok hızlı istek | Kısa bekleme; mesaj doğrulama/risk kontrolü içeriyorsa (Pinduoduo) "Doğrulama gerekli" + "Doğrula / Giriş yap" |
| `NotFound` | Ürün/link yok | Normal boş sonuç |
| `Network` | Ağ hatası, sonuç sayfasına yönlendirmedi | Yeniden deneme |
| `Timeout` | Pazar etkin süre bütçesinde (120 s) cevap vermedi | Yeniden deneme; sırada beklerken üst sınır (600 s) aşıldıysa "eklenti sekme açamadı" |
| `Internal` | Bizim tarafımızda hata (TypeError, decode) | Tanı paneli |

İptal (`AbortError`) hata değildir; pazar `done { cancelled: true }` olur.

## 4b. Çalıştırıcı ve eklenti protokolü

Gerçek adapter'lar ağa dokunmaz; `PageRunner` (eklenti) pazar sayfasını kullanıcının oturumunda açar ve sayfa içi
çıkarma rutinini (`PageExtractor`) çalıştırır. Kaynak: `packages/adapters/src/runtime/runner.ts` ve `protocol.ts`.

```ts
interface ExtractRequest {
  market: MarketId;
  kind: "search" | "detail" | "supplier" | "health";
  url: string;
  imageDataUrl?: string;      // görselle arama: sayfanın dosya girişine verilir
  typeQuery?: string;         // insan benzeri arama: kutuya yazılır, Enter
  searchBox?: string[];       // pazarın arama kutusu seçicileri (genel listeden önce denenir)
  expectUrl?: string;         // sonuç sayfası regex'i; uymazsa Network hatası / URL yoluna düşüş
  timeoutMs?: number;         // settle bütçesi (TIMING.settleMs[kind] varsayılan)
  want?: number;              // kaç sonuç yeter
  quick?: boolean;            // 8 s hızlı sonda: captcha bekleme yok, kaydırma yok, ilk okuma
}
interface RunnerOptions { signal?: AbortSignal; onProgress?: (p: AdapterProgress) => void }
interface PageRunner { run<T>(req: ExtractRequest, opts?: RunnerOptions): Promise<ExtractResult<T> | ExtractFailure> }

interface PageExtractor {
  session(doc): SessionState;
  search?(doc): unknown[];
  probe?(doc): PageProbe;     // { noResults, total, resultsPage, blocked? }
  detail?(doc): unknown | null;
  supplier?(doc): unknown | null;
  imageInput?(doc): HTMLInputElement | null;
}
```

- **Gömülü kancalar:** pazar tanımı (`RealMarketDef`) `humanSearchHome`, `searchBoxSelectors`, `resultsUrlPattern`,
  `noResultsMarkers`, `resultCountRegex`, `imageSearchUrl`, `detailUrlFor`, `soldPeriod`, `maxPages`, `healthQuery`,
  `calibration` taşır. Eklenti `searchPayloadFor(extractor, document)` / `healthPayloadFor(...)` ile öğeler + sonda
  sinyallerini tek yükte üretir (`SearchPayload`: `session`, `items`, `strategy: embedded|cards|none`, `pageTitle`,
  `noResults`, `total`, `resultsPage`, `blocked`).
- **Sağlık sondası:** `healthCheck()` ve web sağlık turu `{ type: "health", market, quick: true }` gönderir; eklenti
  `healthRequestFor(def, quick)` ile `kind: "health"`, `timeoutMs: 8000`, `quick: true` kurar. Mesaj biçimi
  `giriş var · 12 sonuç · strateji cards · toplam 43655`.

**Web ⇄ eklenti mesajları** (`WebToExt` / `ExtToWeb`, `window.postMessage`, kaynak `manufactogate-web` /
`manufactogate-ext`, içerik betiği "mg" portuyla arka plana iletir):

| Web → eklenti | Yanıt |
|---|---|
| `ping` | `pong { version }` |
| `sessions` | `sessions { [market]: SessionState }` |
| `health { market?, quick? }` | `health { [market]: HealthResult }` |
| `run { req: ExtractRequest }` | `run:result { result }`; arada `progressFor` zarfları |
| `cancel { id? }` | `ok` — `id` verilen isteği, yoksa bağlantının tüm isteklerini durdurur (sıradaki + açık sekmeler) |
| `image { url }` | `image:result { dataUrl }` |
| `capture` | `capture:result { html, url, market }` |
| `snapshot { snapshot: PriceSnapshot }` | `ok` — `chrome.storage.local.snapshots[market:listingId]` (300 kayıt, 12 teklif) |

Üç zarf biçimi (`ExtEnvelope`): `{ replyTo, payload: ExtToWeb }` yanıt; `{ progressFor, payload: RunProgress
{ market, stage } }` canlı aşama; `{ event: { type: "sessions:changed", market, session } }` istenmemiş olay
(giriş/çıkış). Web köprüsü (`apps/web/src/lib/bridge.ts`) tek dinleyiciyle dağıtır: `onProgress`, `onExtensionEvent`,
`onSessionsChanged`.

**Süre bütçesi** (`TIMING`, `protocol.ts`): settle arama 25 s / detay 20 s / tedarikçi 20 s / sağlık 8 s; çalıştırıcı
payı 45 s; kuyruk bütçesi 240 s; captcha 120 s (açılır pencerede 5 dk'ya çıkarılabilir); çekirdek pazar başına
120 s **etkin** süre (aşama `queued` iken saat durur) ve 600 s mutlak üst sınır; köprü `requestBudgetMs(req)` kadar
bekler (kalp atışı kopuk portu daha erken yakalar). Sağlık turu: 3 paralel, 0,6 s ara. Kural: sayılar yalnız bu
tablodan okunur; bir katman kendi sabitini tutmaz.

## 5. Test zorunlulukları

Bugünkü düzen (`packages/adapters`):

- `src/<ülke>-<pazar>/fixtures/real-*.html` : gerçek sayfalardan alınmış, kişisel veri ve izleme parametreleri
  temizlenmiş, 300 KB altı örnekler (sonuç sayfası, ürün detayı, giriş yapılmamış hâl, captcha hâli). Ana sayfa
  yakalaması yalnız oturum/duvar tespitini kanıtlar, seçicileri değil.
- `test/real-fixtures.test.ts` (dalga 1), `test/wave2.test.ts`, `test/wave3.test.ts` (beta): her fixture için alan alan
  beklentiler ve olumsuz beklentiler (`resultsPage: false`, `session !== "captcha"`).
- `test/runtime.test.ts` : çalıştırıcı sözleşmesi (iptal, ilerleme, detay ipucu, `enrichListing`, süre bütçesi tutarlılığı).
- `test/real-adapters.test.ts` : her tanımın `resolveLink`, `searchUrl`, `resultsUrlPattern` ve `healthQuery` tutarlılığı.
- Canlı duman testi yoktur (sandbox'tan pazar erişimi yok); yerine `healthCheck()` kullanıcının tarayıcısında çalışır
  ve sonucu `settings.health` altında saklanır. Pazarın `calibration` alanı (`live | fixture | synthetic | none`)
  kanıtın türünü söyler ve docs/CALIBRATION.md ile aynı olmalıdır.

Adapter ayrıştırma testleri geçmeden ana dala giremez.

## 6. Yeni pazar ekleme kontrol listesi

1. Dalga 1 tarzı özel adapter için `packages/adapters/src/<ülke>-<pazar>/index.ts`; genel kart okuyucu yetiyorsa
   `wave2/index.ts` veya `wave3/index.ts` içine `makeDef({...})` (Amazon siteleri için `amazonDef`).
2. `meta` (hosts, loginUrl, rateLimit, capabilities) doldur, `resolveLink`, `searchUrl`, `detailUrl`,
   `resultsUrlPattern`, `noResultsMarkers`, `healthQuery` yaz; gerekiyorsa `humanSearchHome` + `searchBoxSelectors`,
   `detailUrlFor`, `soldPeriod`, `maxPages`.
3. Sonuç sayfası fixture'ı topla (bölüm 5), `toListing`/`toDetail` ve testleri geçir; `calibration` alanını ayarla.
4. Etiket sözlüğünü (`badgeMap`, `badges.ts`) ekle.
5. Hız sınırını pazarın gerçek davranışına göre belirle (en az 2,5–3 s, saatte ≤ 120); `markets.ts`'e ekle.
6. Eklenti: `public/manifest.json` `host_permissions` ve overlay `content_scripts.matches`'e host'u ekle;
   `shared.ts` `MARKET_HOSTS` içine giriş çerezi varsa yaz; `pnpm --filter @manufactogate/extension build`.
7. Web: `lib/markets.ts` ton/kısa ad tabloları, Ayarlar'da bölge grubu; ülke profili yoksa `packages/country-profiles/`.
8. docs/CALIBRATION.md tablosuna satır ekle.

## 7. Dalga 1 adapter notları

**1688:** Görselle arama kullanıcının oturumuyla çalışır (CDN görseli varsa yüklemesiz). Fiyat kademeleri ve MOQ ürün
sayfasında. Etiketler: 源头工厂, 深度验厂, 实地认证, 实力商家, 跨境专供. Mağaza sayfasında tekrar alım oranı ve yıl
bilgisi var (`fetchSupplier`). `sold` 30 günlük sayaçtır; i18n arayüzde başlık çevrilir ve `titleLang` işaretlenir.

**Taobao:** Perakende pazar. Görselle arama yapıştırmayla. Satış adedi (toplam) ve mağaza puanı ayrıştırılır.
Tmall mağazaları aynı adapter altında işaretlenir.

**Pinduoduo:** Mobil odaklı; web sürümü sınırlı, görselle arama yok. `window.rawData` MAIN dünyasından okunur;
boş SSR listesi risk kontrolüdür (`RateLimited` + "Doğrulama gerekli"), `psnl_verification` captcha. Sayfalama
kaydırmalı XHR olduğundan `maxPages: 1`.

**Trendyol:** Hedef pazar. Ürün sayfası, fiyat, satıcı sayısı, yorum sayısı (`soldPeriod: "reviews"`) ayrıştırılır.
Link yapıştırma ana giriş yoludur; `merchantId` linkte korunur ve `fetchListing(id, { url, supplierId })` satıcıya
özel sayfayı açar. Komisyon oranları ülke profiline bağlanır.
