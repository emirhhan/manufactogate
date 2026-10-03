# Plan ile Gerçek Durumun Karşılaştırması

Bu belge docs/PLAN.md'deki her kapsam maddesini **bugünkü koda** karşı değerlendirir; eski metne değil,
dosya ve fonksiyon adlarına dayanır. Güncelleme: 2026-10-03 (bütünleştirme turu sonrası).

Terimler: **Yapıldı** = kabul kriteri otomatik testle geçiyor. **Kısmen** = çalışıyor ama kriterin bir parçası eksik.
**Yapılmadı** = kod yok. **Doğrulandı** = kullanıcının tarayıcısında gerçek pazarda çalıştığı görüldü.

Doğrulama durumu (bu turun sonunda): typecheck ve lint temiz; Vitest 460 test (core, adapters, country-profiles, web),
eklenti birim 45 test, eklenti e2e 42 kontrol (17 senaryo, Playwright + Chromium); web ve eklenti derlemesi geçiyor.
Sandbox'tan hiçbir pazara ağ erişimi yoktur; "canlı" ibaresi yalnız kullanıcının raporuna dayanır.

## 3.1 Arama girişi

| Madde | Durum | Kod |
|---|---|---|
| Görsel yükleme (sürükle, yapıştır, dosya, kamera) | Kısmen: sürükle/yapıştır/dosya; yeniden boyutlandırma var; kamera girişi yok | `components/SearchBox.tsx`, `lib/imageResize.ts` |
| Bölge seçerek arama | Yapılmadı (`ImageInput.region` modelde var, arayüzde çizim yok) | `core/model/adapter.ts` |
| Link yapıştırma | Yapıldı: 33 pazarın ürün linki çözülür, `/l/resolve/<url>?compare=1` ile açılır; overlay'in `/?link=<url>` yolu da aynı yere iner (tanınmayan link metin araması olur) | `pages/Feed.tsx`, `lib/markets.ts` `linkRoute()` |
| Metin arama ve pazar diline çeviri | Kısmen: `localizeQueryLadder` basamakları (pazar dili → İngilizce → yalnız sözlük dışıysa Türkçe) pazar başına gönderilir; ja/ko/ru/de/id/th sözlükleri var; gönderilen sorgular "Ne arandı?" panelinde görünür ama **düzenlenemez** | `adapters/translate.ts`, `store/search.ts` `ladderOf()`, `pages/Results.tsx` |
| Toplu arama | Kısmen: CSV (satır başına sorgu, sıralı arama, CSV indir); klasör yükleme yok | `pages/Bulk.tsx` |

## 3.2 Arama motoru

| Madde | Durum | Kod |
|---|---|---|
| Paralel çok pazar arama | Yapıldı, doğrulandı. Öncelik: dalga 1 → doğrulanmış → diğerleri; eşzamanlılık 6 (web) / 3 sekme (eklenti) | `core/orchestrator/search.ts`, `store/search.ts` `marketPriority()` |
| Süre bütçesi | Yapıldı: tek `TIMING` tablosu; çekirdek pazar saati yalnız **etkin** sürede işler (eklenti "sırada" derken durur), 120 s etkin / 600 s mutlak üst sınır; eklenti kuyruğu 240 s; köprü `requestBudgetMs(req)` bekler | `adapters/runtime/protocol.ts` |
| Durdurma | Yapıldı: "Durdur" → `AbortSignal` → köprü `cancel` mesajı → eklenti sıradaki ve açık sekmeleri kapatır (~200 ms); çekirdek pazarı "iptal" sayar, hata değil | `lib/bridge.ts`, `extension/background/runner.ts` `cancelRequest()` |
| Canlı aşama | Yapıldı: `run:progress` zarfı → `MarketStatus.stage/page` ve `useExtension().live`; pazar şeridinde "arama yazılıyor", "sonuçlar okunuyor · sayfa 2 · 2. sorgu" | `components/MarketPanel.tsx` `marketRowLabel()` |
| Aynı ürün kümeleme ve güven skoru | Kısmen: pHash + başlık/model no + pazarın görsel eşleşmesi; CLIP alanı skorda var (`query.clip`) ama tarayıcıda model yok | `core/match/score.ts`, `core/fingerprint` |
| Güven açıklaması | Yapıldı ("görsel, başlık, model no" sinyalleri kartta) | `components/ClusterCard.tsx` |
| Düşük güven ayrımı | Yapıldı ("benzer olabilir", "filtrelenenler") | `pages/Results.tsx` |
| Bulunamadı durumu | Yapıldı | `pages/Results.tsx` |
| Yeniden deneme ve tanı | Yapıldı: tipli hatalar, Türkçe açıklama ve eylem (giriş yap / doğrula / pazarda aç), pazar başına yeniden dene, "Kalanları yeniden dene (N)", captcha sonrası otomatik devam, Pinduoduo risk kontrolü "Doğrulama gerekli" | `lib/marketErrors.ts` `needsVerification()` |
| Görsel arama yedeği | Yapıldı: görsel arama başarısız olan pazar 7 gün başlık merdivenine düşer (`capabilityMemo`), açık yeniden deneme hafızayı atlar | `store/search.ts` `capabilityOverridesFrom()` |

## 3.3 Sonuç ve karşılaştırma

| Madde | Durum | Kod |
|---|---|---|
| Küme kartı | Yapıldı | `components/ClusterCard.tsx` |
| Karşılaştırma tablosu | Kısmen: sıralama, pazar/fiyat/eşleşme/görsel filtreleri, 60'arlık sayfalama, tek para birimi; sütun seçme ve sabitleme yok | `pages/Results.tsx`, `components/CompareDrawer.tsx` |
| Fiyat merdiveni | Yapıldı (1688 detay; adet girilince kademe vurgusu) | `components/CostCalculator.tsx` |
| Fiyat zinciri | Yapıldı (ürün sayfası; pazar başına en düşük) | `components/PriceChain.tsx` |
| Gerçek ürün sayfası | Yapıldı; link ölü tespiti yok | `components/ListingActions.tsx` (kopyala, izle, projeye ekle; toast) |
| En uygun kaynak skoru | Kısmen: "en yakın eşleşme" sıralaması ve satılabilirlik skoru (marj, talep, bulunabilirlik, rekabet); **ağırlıklar kullanıcı tarafından ayarlanamaz** | `lib/analysis.ts` |
| Pazarda satılır mı / satan var mı | Yapıldı: analiz kartı (tedarik min, hedef medyan, satıcı sayısı, indirilmiş maliyet, KDV ve komisyon düşülmüş net marj, 0-100) | `components/MarketAnalysis.tsx` |
| Fiyatsız B2B ilanlar | Yapıldı: boş `tiers` "Fiyat teklifle" olarak gösterilir, maliyete girmez (`Math.min` koruması) | `pages/Product.tsx` `priceRangeText()`, `lib/listingFields.ts` |

## 3.4 Tedarikçi zekâsı

| Madde | Durum | Kod |
|---|---|---|
| Tedarikçi kartı | Kısmen: ad, konum, etiketler + karttan okunan yıl / doğrulanmış / fabrika-aracı / mağaza puanı (`RawListing.supplier`); 1688 mağaza sayfasından tekrar alım ve yanıt süresi `fetchSupplier` ile okunur, diğer pazarlarda yok | `adapters/runtime/realAdapter.ts` `enrichListing()`, `components/SupplierPanel.tsx` |
| Fabrika mı aracı mı | Yapıldı (sezgisel): çekirdek `traceScore` (etiket, firma adı, MOQ, kademeli fiyat, kart sinyalleri, küme fiyat bağlamı) | `core/supplier/trace.ts`, `lib/analysis.ts` `supplierScore()` |
| Üreticiye izleme | Yapıldı: `rankManufacturers` ile "muhtemel üretici" sıralaması | `core/supplier/trace.ts`, `components/SupplierPanel.tsx` |
| Çapraz mağaza eşleme | Yapılmadı (`SupplierIdentity` tablosu yok) | — |
| Risk özeti | Kısmen: yeni mağaza, doğrulanmamış, tutarsız fiyat uyarıları (`supplierRisk`); yorum temaları yok | `lib/analysis.ts` |

## 3.5 Maliyet ve ülke motoru

| Madde | Durum | Kod |
|---|---|---|
| Ülke profili | Yapıldı: 8 ülke (TR, DE, NL, GB, AE, US, PL, RO), tarihli ve kaynaklı; **kullanıcı oranları düzenlenebilir** (KDV, varsayılan gümrük, komisyonlar, aracı ücreti, yurt içi kargo, kargo tercihi), ülke başına kalıcı, "Referansa dön" | `core/cost/overrides.ts`, `store/settings.ts` `useCostProfile()`, `pages/Settings.tsx` "Ülke oranları" |
| İndirilmiş maliyet | Yapıldı, kalem kalem; kullanıcı oranları Listing, CostCalculator, CountryCompare, CompareDrawer ve `analyzeResults` içinde uygulanır | `core/cost/engine.ts` `computeLandedCost` |
| GTİP önerisi | Yapıldı: ürün başlığı → katalog yaprağı → `HS_BY_LEAF` (yoksa anahtar kelime / grup), güven ve kaynak etiketi; kullanıcı düzeltmesi `hsOverrides` altında hatırlanır | `core/cost/hs.ts` `suggestHs`, `lib/hs.ts` |
| Marj hesabı | Yapıldı: KDV'ye duyarlı `computeMargin` (ithalat KDV'si mahsup edilir), komisyon, kargo; "Satış fiyatı dene" önizlemesi | `core/cost/engine.ts`, `lib/listingEconomics.ts` |
| Çok ülke karşılaştırma | Yapıldı; kullanıcı oranı olan ülkeler "senin oranların" ile işaretli | `components/CountryCompare.tsx` |
| Para birimi | Kısmen: çekirdek `REFERENCE_FX` tablosu (USD taban, tarihli), kullanıcı sabitlemesi `withOverrides`, 7 günden eski tablo için "kur güncel olmayabilir" uyarısı; **canlı kur yok** | `core/cost/fx.ts`, `lib/fx.ts` `fxStaleness()` |

Bilinen tutarsızlık: `DEFAULT_COST.fxCnyTry` (4.7) açılışta kullanıcı sabitlemesi olarak uygulanır; `REFERENCE_FX`
türetilmiş CNY/TRY ≈ 5.9'dur. Kullanıcı Ayarlar'da kuru silene kadar 4.7 geçerlidir.

## 3.6 Araştırma yönetimi

| Madde | Durum | Kod |
|---|---|---|
| Projeler | Yapıldı | `pages/Projects.tsx` |
| Geçmiş | Yapıldı: aramalar durum/sayı/süre ile saklanır; aynı girdinin yerel sonucu önce gösterilmez (tekrar aranır) | `pages/History.tsx`, `lib/db.ts` (şema v3) |
| İzleme ve alarm | Kısmen: izleme listesi, "Fiyatları yenile" elle; arka plan alarmı yok; `watch.ts` detayı satıcı ipucu olmadan çeker (Trendyol'da alıcı kutusu satıcısı) | `store/watch.ts` |
| Dışa aktarma | Yapıldı: CSV, Excel (.xls SpreadsheetML), yazdır/PDF | `lib/export.ts` |
| İletişim asistanı | Kısmen: Çince/İngilizce teklif, numune, özelleştirme taslakları; gelen mesaj çevirisi yok | `components/SupplierPanel.tsx` |

## 3.7 Eklenti (v0.8.0)

| Madde | Durum | Kod |
|---|---|---|
| Oturum tespiti | Yapıldı: çerez sezgisi + sayfa okuması; giriş/çıkış olayında `sessions:changed` yayını, web 1,5 s sonra oturum haritasını yeniler | `extension/background/index.ts`, `store/extension.ts` `refreshSessions()` |
| Overlay | Yapıldı: ürün sayfasında "Diğer pazarlarda karşılaştır" + fiyat anlık görüntüsü (web `sendSnapshot` → `chrome.storage.local.snapshots`, 300 kayıt / 12 teklif); genel ve **site başına** anahtar | `extension/overlay/index.ts`, `extension/background/snapshots.ts`, `lib/snapshots.ts` |
| Sağlık izleme | Yapıldı: 8 s hızlı sonda (`kind: "health"`, `quick: true`), web turunda 3 pazar paralel, ilerleme `{done,total,active}`; 33 pazar ≈ 2-4 dk; sonuçlar `settings.health` altında kalıcı | `extension/background/health.ts`, `store/extension.ts` `runRound()` |
| Hız sınırı | Yapıldı: pazar başına aralık ve saatlik üst sınır, açılır pencerede "Pazar ayarları" ile düzenlenir (`settings.rateLimit[market]`); en çok 3 eşzamanlı sekme | `extension/popup/main.ts`, `extension/shared.ts` `normalizeRateLimit` |
| Uygulama kökeni | 5173 (dev) ve 4173 (preview) portlarında localhost/127.0.0.1 | `public/manifest.json`, `shared.ts` `APP_ORIGIN_PATTERNS` |
| İnsan benzeri arama | Shopee ID, Temu, Coupang'da arama kutusuna yazma; kutu yoksa URL'ye düşer | `wave3/index.ts` `humanSearch` |

## Pazar kalibrasyonu (33 pazar)

Kaynak `CALIBRATION_STATUS` (`packages/adapters/src/real.ts`): **canlı** = kullanıcı tarayıcısında sonuç döndü;
**fixture** = yakalanan gerçek sayfa ile kalibre (ana sayfa yakalaması yalnız oturum/duvar tespitini kanıtlar);
**yok** = seçiciler belgelenmiş yapıya göre tahmin, hiç yakalama yok.

| Pazar | Kimlik | Arama | Detay | Görsel | Fixture dosyaları |
|---|---|---|---|---|---|
| 1688 | cn-1688 | canlı (119 sonuç) | canlı | CDN görseli / yükleme; canlı teyit bekliyor | real-search-i18n, real-detail, logged-out |
| Taobao | cn-taobao | canlı (52) | fixture | yapıştırma, doğrulandı | real-search, real-detail, logged-out |
| Pinduoduo | cn-pinduoduo | fixture; canlıda risk kontrolü sık | fixture | yok | real-search, real-detail, captcha |
| Trendyol | tr-trendyol | canlı (87) | fixture; `merchantId` ile satıcıya özel sayfa (`fetchListing(id, {url, supplierId})`) | yok | real-search (ürün sayfası yakalaması istenir) |
| Alibaba.com | cn-alibaba | **yok** | genel | yok | — |
| AliExpress | cn-aliexpress | **yok** | genel | yok | — |
| Hepsiburada | tr-hepsiburada | canlı | genel | yok | — |
| n11 | tr-n11 | **yok** | genel | yok | — |
| Amazon TR | tr-amazon | canlı | genel | yok | — |
| Amazon DE / US / UK | de-amazon, us-amazon, gb-amazon | **yok** (TR ile ortak `amazonDef`) | genel | yok | — |
| DHgate | cn-dhgate | canlı (3) | genel | yok | — |
| Made-in-China | cn-madeinchina | **yok** | genel | yok | — |
| Global Sources | cn-globalsources | fixture (sonuç sayfası) | genel | yok | real-search |
| Yiwugo | cn-yiwugo | fixture (sonuç sayfası) | genel | yok | real-search |
| IndiaMART | in-indiamart | fixture (sonuç sayfası, RSC akışı) | genel | yok | real-search |
| TradeIndia | in-tradeindia | fixture (sonuç sayfası, `__NEXT_DATA__`) | genel | yok | real-search |
| Tokopedia | id-tokopedia | canlı | genel | yok | real-home |
| Shopee ID | id-shopee | **yok** (insan benzeri yazma) | genel | yok | — |
| Lazada TH | th-lazada | canlı (80) | genel | yok | real-home |
| Rakuten | jp-rakuten | **yok**; "error page" büyük olasılıkla Akamai 403 | genel | yok | — |
| Mercari (US) | us-mercari | fixture (ana sayfa) | genel | yok | real-home |
| Yahoo Auctions | jp-yahooauctions | fixture (ana sayfa) | genel | yok | real-home |
| Coupang | kr-coupang | **yok** (insan benzeri yazma) | genel | yok | — |
| Gmarket | kr-gmarket | fixture (ana sayfa) | genel | yok | real-home |
| eBay | us-ebay | canlı (120) | JSON-LD | yok | real-home |
| Walmart | us-walmart | fixture (ana sayfa; PerimeterX duvarı) | genel | yok | real-home |
| Temu | us-temu | fixture (ana sayfa; insan benzeri yazma) | genel | yok | real-home |
| Noon | ae-noon | fixture (ana sayfa) | genel | yok | real-home |
| Ozon | ru-ozon | fixture (ana sayfa) | genel | yok | real-home |
| Wildberries | ru-wildberries | fixture (ana sayfa) | genel | yok | real-home |

Özet: 9 pazar canlı doğrulandı (`VERIFIED_MARKETS`: 1688, Taobao, Trendyol, Hepsiburada, Amazon TR, DHgate, Tokopedia,
Lazada TH, eBay), 15 pazar fixture ile kalibre (bunların 10'u yalnız ana sayfa), **9 pazarın hiç yakalaması yok**:
Alibaba.com, AliExpress, n11, Amazon US/UK/DE, Made-in-China, Shopee ID, Rakuten, Coupang. Mercari'nin kimliği
`us-mercari`dir (ABD, USD); eski `jp-mercari` ayarları açılışta taşınır, `db.listings` satırları taşınmaz.

### Kullanıcının sırayla yakalaması gerekenler

1. **Sonuç sayfası** (arama kutusuna yaz, Enter, bir kez kaydır, "Fixture yakala"): Alibaba.com, AliExpress, n11,
   Made-in-China, Shopee ID, Rakuten, Coupang, Amazon US/UK/DE, Gmarket (`browse.gmarket.co.kr`).
2. **Ürün sayfası:** Trendyol (`?merchantId=` içeren adresle), 1688 Çince arayüz.
3. **Duvar sayfaları:** Pinduoduo doğrulama sayfası, Walmart "Press & Hold", Rakuten hata gövdesi.
4. **Görselle arama canlı teyidi:** 1688 (CDN görseli ve yükleme), Taobao yapıştırma.

Ayrıntı ve temizleme kuralları: docs/CALIBRATION.md bölüm 6.

## Bu turda kapanan açıklar (kritik raporu)

| Açık | Durum |
|---|---|
| P0-1 overlay → uygulama (`/?link=`) | Kapandı: `Feed.tsx` → `/l/resolve/<url>?compare=1` |
| P0-2 çeviri merdiveni, öncelik, kapasite hafızası, link kancaları, `resolved`/`fingerprinting`/`note.code` | Kapandı: `store/search.ts` `searchRunOptions()` |
| P0-3 iptal eklentiye ulaşmıyor | Kapandı: `WebToExt cancel`, `RunnerOptions.signal` |
| P0-4 süre bütçeleri | Kapandı: `TIMING`, etkin süre kuralı |
| P0-5 canlı durum zarfları | Kapandı: `RunProgress`, `ExtEvent`, `onProgress/onSessionsChanged` |
| P0-6 kabuk alanları gösterilmiyor | Kapandı: hata/iptal/depolama/uyarı şeritleri, "Ne arandı?", toast'lar |
| P0-7 Trendyol satıcıya özel detay | Kapandı (Listing); `watch.ts` hâlâ ipuçsuz |
| P1-1 `Math.min` boş kademeler | Kapandı |
| P1-2 / P1-3 yeni `RawListing` alanları | Kapandı: `enrichListing` her pazara uygulanır; `supplier` bloğu |
| P1-4 çekirdek maliyet eklentileri | Kapandı: `computeMargin`, `suggestHs`, `REFERENCE_FX`, `traceScore` web'de |
| P1-5 anlık görüntü paneli | Kapandı: `sendSnapshot` → `snapshots` |
| P1-6 4173 kökeni | Kapandı |
| P1-7 Mercari kimliği | Kapandı (`us-mercari`) |
| P1-8 pazar başına hız sınırı ve site başına overlay | Kapandı (açılır pencere) |
| P1-9 sağlık turu süresi | Kapandı (hızlı sonda, 3 paralel) |
| P1-10 Pinduoduo risk kontrolü | Kapandı ("Doğrulama gerekli" + giriş linki); `maxPages: 1` bilinçli (kaydırmalı XHR sayfalama) |
| P2-1 belgeler | Bu belge, ADAPTER_SPEC, ROADMAP, README |
| P2-2 ağırlıklar, çapraz mağaza, bölge seçimi, CLIP, ≥300 altın örnek | **Açık**; kullanıcı oranları kapandı |
| P2-3 yakalaması olmayan 9 pazar | **Açık**; kullanıcıya bağlı (yukarıdaki liste) |

## Bilinen küçük açıklar

- `store/watch.ts` `fetchListing(id)`'yi ipuçsuz çağırır; `listingHint()` (`lib/listingFields.ts`) geçirilmeli.
- `components/listing/CompareSection.tsx` `MarketPanel`'e `retrying/trace/input` geçirmez; Listing karşılaştırmasında
  sorgu ipucu ve "yeniden deneniyor" satırları görünmez.
- Orkestratörün son notu `notes[market]`'ı ezer; tam geçmiş yalnız `trace[market].codes` içindedir.
- Kapasite hafızası (`capabilityMemo`) eklentinin sağlık hafızasından bağımsızdır.
- Altın veri seti 44 örnek (`packages/core/golden/cases.json`); PLAN hedefi ≥300.

## Sonraki üç adım, sırayla

1. **Yakalama turu (kullanıcı):** yukarıdaki 9 pazarın sonuç sayfası + Trendyol ürün sayfası + Pinduoduo doğrulama
   sayfası. Her yakalama için `test/wave3.test.ts` / `test/real-fixtures.test.ts` içine beklenti yazılır ve
   `CALIBRATION_STATUS` güncellenir. Bu tur bitmeden yeni pazar eklenmez.
2. **Küçük bütünleştirme kalıntıları (kod):** `watch.ts` ipucu, `CompareSection` → `MarketPanel` prop'ları,
   `db.listings` için `migrateMarketIds`, `DEFAULT_COST.fxCnyTry`'ı `REFERENCE_FX` ile hizalama, çeviri basamaklarını
   "Ne arandı?" panelinde düzenlenebilir yapma.
3. **Kalite (Sprint 6):** altın veri setini 300'e çıkarma ve güven kalibrasyonu, kaynak skoru ağırlıkları (3.3),
   çapraz mağaza tedarikçi birleştirme (3.4), bölge seçerek arama, tarayıcıda CLIP (`query.clip` yuvası hazır).

## Ana sayfa (gerçek veri modu)

Keşfet feed'i cihazdaki gerçek ilanlardan kurulur: marj adayları (tedarik ile hedef pazar benzeri arasında ≥2× fark),
öne çıkanlar (tazelik, satış, puan, pazar çeşitliliği), kullanıcının kategorileri, çok satanlar, son aramalar ve izlenenler.
Sunucu yok; algoritma `apps/web/src/lib/feed.ts`.

## Web kabuğu notları

- **Yerel veri şeması v3**: `listings` `market:id` başına tek kanonik satır; bir ilanın hangi aramalardan geldiği
  `searchItems` tablosunda; küme eşleşmelerinin ince kopyası `matches` tablosunda (feed oradan okur).
- **Arama deposu (`store/search.ts`)**: `effective` (gerçekten dağıtılan girdi), `resolved` (link çözümü),
  `noteCodes`, `trace` (pazar başına aşama/basamak/kodlar), `fingerprintPending`, `capabilityMemo`; `error`,
  `storageNote`, `warning`, `cancelled`, `retrying`, `retryRemaining()`. `cancel()` eklentiyi de durdurur.
- **Eklenti deposu (`store/extension.ts`)**: `live[market]` (canlı aşama), `round` (sağlık turu ilerlemesi),
  `refreshSessions()`, `STAGE_LABELS_TR`.
- **Köprü (`lib/bridge.ts`)**: `sendToExtension(payload, timeoutMs, {signal, onProgress})`, `onProgress`,
  `onExtensionEvent`, `onSessionsChanged`, `cancelExtensionRuns()`, `sendSnapshot()`, `ping/ensureAlive` + kalp atışı.
- **Ayarlar**: pazarlar bölgeye göre gruplu; hazır seçimler (Çalışanlar = sağlık turu, yoksa `VERIFIED_MARKETS`;
  Doğrulananlar, Hedef ülke, Hepsi, Hiçbiri); `DEFAULT_MARKETS` = dalga 1 + doğrulanmış 9; ülke oranları; kur
  tablosu (CNY/USD/EUR/GBP sabitleme); yedek al/yükle.
- **Testler**: `apps/web/test/*` happy-dom + fake-indexeddb (şema, arama deposu, köprü iptal/ilerleme/olay/anlık
  görüntü, kabuk, sonuç arayüzü 650 ilan ≈ 470 ms); `apps/web/src/lib/*.test.ts` saf yardımcılar.
