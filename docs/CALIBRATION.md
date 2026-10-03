# Adapter Kalibrasyonu

Gerçek adapter'lar kullanıcının tarayıcısında, kendi oturumuyla çalışır; sandbox'tan hiçbir
pazara erişilemez. Bu belge, 33 pazarın (4 ana + 5 ikinci dalga + 24 beta) sayfa okuma
stratejisini, hangi pazarın hangi kanıta göre kalibre edildiğini ve yeni bir sayfa yakalandığında
izlenecek adımları anlatır. Güncelleme: 2026-10-03.

## 1. Çıkarma stratejisi

Her pazar için sıralama aynıdır (`packages/adapters/src/wave2/generic.ts` → `makeDef`):

1. **Gömülü durum (embedded).** Sayfanın içine gömdüğü JSON okunur. 1688 `window.context`,
   Taobao sayfa durumu, Pinduoduo `window.rawData`, Trendyol `window["__single-search-result__PROPS"]`,
   IndiaMART `self.__next_f` (React Server Components akışı), TradeIndia `#__NEXT_DATA__`.
   Bu yol sınıf adlarından bağımsızdır; kart metni boş (`text: ""`) döner, strateji `embedded` olarak etiketlenir.
2. **Kart sezgisi (cards).** Ürün sayfasına giden linkler bulunur, her link için "tek ürün içeren en geniş
   kapsayıcı" kart kabul edilir. Aynı ürüne giden tüm linkler toplanır (Ozon'da ilk link yalnız görsel
   taşır, başlık ikinci linktedir). Alanlar sırayla okunur:
   - **Başlık:** pazarın seçicileri → link `title`/`aria-label` → kartın yaprak metinleri arasından ürün
     URL'sindeki slug ile en çok kelime paylaşan → görsel `alt` → link metni. Fiyat/rozet/erişilebilirlik
     etiketleri (`price`, `badge`, `a11y`, `coupon`…) başlık adayı olamaz (Gmarket "쿠폰적용가" sorunu).
   - **Fiyat:** pazarın `priceSelectors`'ı (regex, eşleşmezse çıplak sayı: Noon "509") → kart metni.
     Üstü çizili/eski fiyatlar (`del`, `s`, `*strike*`, `*oldPrice*`, `*origin-price*`) hiçbir zaman
     güncel fiyat sayılmaz. Regex'in tüm yakalama grupları birleştirilir (Yiwugo "58" + ".00").
     Para birimi metinden tanınır (`parseMoney`): Temu TR "333,86 TL" → TRY, "US$ 14.49 - 14.99" → USD + üst sınır.
   - **Satış:** pazarın `sold` regex'i; varsayılan yalnız "sold/已售/terjual/купили/판매" gibi satış
     kelimelerini kabul eder, değerlendirme sayıları (`ratingCount`) ayrı tutulur.
   - **MOQ, yıl, rozet, mağaza, konum, puan:** pazar başına seçici/regex. Rozetler kart metninde ve
     görsel `alt`/`title` özniteliklerinde aranır (Global Sources "Verified Supplier" görseli).
   - **Görsel:** ürün linkinin içindeki ilk kullanılabilir görsel; `data:` URI, rozet/bayrak/ikon/placeholder
     görselleri (`made-in-india.png`, `*badge*`, `.svg`) atlanır; yalnız http(s) adresler saklanır.
3. **Sayfa sinyalleri (probe).** `PageExtractor.probe(doc)` sayfanın bütününe bakar:
   `noResults` (pazarın "sonuç yok" metni), `total` (ilan edilen sonuç sayısı), `resultsPage`
   (adres sonuç sayfası desenine uyuyor mu), `blocked` (Pinduoduo'nun güvensiz oturuma verdiği boş liste).
   Eklenti bunları `searchPayloadFor(extractor, document)` ile tek çağrıda alır.

Metin birleştirme (`textOf`): kardeş öğeler arasına boşluk konur ("¥129.00" ile "3000+" yapışmaz) ama
`<font>`, `<b>`, `<mark>`, vurgu `<span class="highlight">` gibi satır içi biçimlendirme ile bölünmüş
metin tek kelime olarak okunur (Yiwugo "S m a r t W a t c h" → "SmartWatch").

### Fiyatsız B2B ilanları

"Ask for a Quote", "Negotiable", "面议" gösteren tedarikçi ilanları atılmaz: kaynak (B2B) pazarlarda
`price.tiers` boş döner ve `SearchItem.priceOnRequest` işaretlenir. Perakende pazarlarda fiyatsız kart
yine elenir. Web tarafı boş `tiers`'ı "teklif iste" olarak göstermelidir (`Math.min(...[])` tüketicileri
web alanının sorumluluğundadır).

## 2. Oturum ve duvar tespiti

`detectSession` ham HTML'e bakmaz; adres, başlık, görünür metin (script/style/gizli öğeler atılır,
200 KB üst sınır) ve seçici sondaları kullanır. Sinyaller belge başına en çok 1,5 s önbelleklenir;
eklentinin 700 ms'lik yoklamaları 1,5 MB'lık sayfaları her seferinde serileştirmez.

- **Captcha:** adres deseni (`psnl_verification`, `punish`, `_____tmd_____`), başlık deseni
  (`captcha`, `Robot or human`, `Доступ ограничен`, `安全验证`…), ortak seçiciler
  (`form[action*='validateCaptcha']`, `#px-captcha`, `iframe[src*='hcaptcha.com']`, `.nc_wrapper`,
  `#baxia-punish`…) ve pazarın kendi metin işaretleri. **"captcha" / "verify" alt dizgileri işaret değildir:**
  Mercari, Noon ve Walmart ana sayfaları görünmez reCAPTCHA rozeti ve CSP meta'sı taşır; bunlar artık
  "captcha" sayılmaz (`test/wave3.test.ts`).
- **Giriş duvarı:** giriş adresleri + görünür "密码登录 / 扫码登录" gibi metinler + `#login-form`,
  `#fm-login-id` seçicileri. Beta pazarlarda yanlış "çıkış yapılmış" sinyali aramayı durduracağından
  yalnız adres deseni kullanılır.
- **Giriş yapılmış:** çıkış linki (`a[href*='logout']`), "Hesabım / 退出 / 로그아웃" metinleri; 1688, Taobao ve
  Pinduoduo için sayfa durumundaki `"loginId"`, `"nick"`, `ssrListData` gibi script işaretleri (400 KB üst sınır).

## 3. Arama yolu ve sayfalama

- **Varsayılan: arama URL'si.** Deterministik ve tek sekmelidir.
- **İnsan benzeri yazma yalnız opt-in:** Shopee ID, Temu, Coupang (`humanSearch: true`). Arama kutusu
  bulunamazsa (`SelectorBroken: arama kutusu…`) veya yazılan sorgu sayfayı değiştirmezse (adres
  `resultsUrlPattern`'a uymaz) adapter aynı sorguyu arama URL'si ile tekrar dener; ana sayfanın promosyon
  kartları asla sonuç olarak dönmez.
- **Sonuç sayfası deseni:** her tanımda `resultsUrlPattern` vardır (verilmezse arama URL'sinden türetilir).
  URL yolu bir sonuç sayfasına ulaşmazsa `Network: arama sayfasına yönlendirmedi` hatası döner.
- **Sayfalama:** bir sayfa hiç yeni kimlik getirmezse veya yeni kimlik oranı %30'un altındaysa
  (sayfalama parametresi etkisiz, aynı sayfa) durulur; `total` biliniyorsa ona ulaşınca durulur.
  Sayfa sayısı: 1688/Taobao/Trendyol/Amazon/eBay 3, Pinduoduo/IndiaMART/Temu/Mercari 1, diğerleri 2.
  Pinduoduo `search_result.html` kaydırmayla XHR üzerinden sayfalar; `page=2` aynı sayfayı verir, bu yüzden 1.
- **Doğrulanmamış sayfalama parametreleri** (ilk canlı turda teyit edilmeli): Noon `page`, Ozon `page`,
  Wildberries `page`, Walmart `page`, Global Sources `pageNum`, DHgate `pageNum`, Shopee `page=n-1`,
  Yahoo `b=` ofseti, Gmarket `p`, Coupang `page`, Lazada `page`, Tokopedia `page`, Made-in-China `page`.
  Yanlış parametre artık ek sekme maliyeti dışında zarar vermez (aynı sayfa tespiti).

## 4. Sağlık kontrolü ve oturum sondası

`healthCheck()` artık tam arama yapmaz: `kind: "health"`, `quick: true`, 8 s. Oturum + sonuç sayfası
deseni + (eklenti `healthPayloadFor` kullanıyorsa) hazır kartların sayısı ve `noResults`/`total`
raporlanır. Captcha bekleme ve kaydırma yapılmaz; 33 pazar ardışık koşulsa bile servis çalışanının
bütçesi aşılmaz. `session()` pazarın ana sayfasını (`homeUrl`) aynı hızlı modda açar.

Mesaj biçimi: `logged-in; 12 sonuç; strateji cards; toplam 43655` veya `unknown; sonuç sayfası açılmadı`.

## 5. Pazar tablosu

Kaynak: **canlı** = kullanıcının tarayıcısında çalıştığı görüldü; **fixture** = yakalanan sayfa ile kalibre;
**yok** = seçiciler belgelenmiş yapıya göre tahmin. `CALIBRATION_STATUS` (`packages/adapters/src/real.ts`)
aynı bilgiyi koda verir.

| Pazar | Arama | Detay | Görsel | Kaynak | Not |
|---|---|---|---|---|---|
| 1688 | i18n grid, `data-complete-offer-id` | `window.context` regex | CDN görseli / yükleme | canlı | Başlıklar tarayıcı diline çevrilir; `titleLang` işaretlenir. Çince arayüzle bir yakalama istenir |
| Taobao | `item_id_*` kartları, bölünmüş fiyat | satır içi durum | yapıştırma | canlı | — |
| Pinduoduo | `rawData.ssrListData.list` | `rawData` / metin yapısı | yok | fixture | Boş SSR listesi = risk kontrolü → `RateLimited`; web "Doğrulama gerekli" + giriş linki gösterir; `psnl_verification` = captcha. `window.rawData` MAIN dünyasından okunur (eklenti). `maxPages: 1` (kaydırmalı XHR) |
| Trendyol | `__single-search-result__PROPS` | MFE props / legacy state / JSON-LD / metin | yok | canlı | `merchantId` linkte korunur; `fetchListing(id, { url, supplierId })` satıcıya özel sayfayı açar (`SELLER_PARAM`); ürün sayfası yakalaması istenir |
| Alibaba.com | kart | — | yok | yok | USD/TRY/EUR fiyat; yakalama istenir |
| AliExpress | kart | — | yok | yok | TR oturumunda TL fiyat; yakalama istenir |
| Hepsiburada | kart | — | yok | canlı | "(345)" değerlendirme sayısıdır, satış değil |
| n11 | kart | — | yok | yok | yakalama istenir |
| Amazon TR/DE/US/UK | ortak `amazonDef`: `.a-price .a-offscreen`, `#twotabsearchtextbox` | — | yok | TR canlı, diğerleri yok | `validateCaptcha` / "Continue shopping" ara sayfası captcha olarak raporlanır |
| DHgate | kart | — | yok | canlı (3 sonuç) | — |
| Made-in-China | kart, "Negotiable" fiyatsız ilanlar korunur | — | yok | yok | yakalama istenir |
| Global Sources | `li.item.card-box`: `.product-name`, `.price-box .price` (aralık), `Min. order`, `.link-el`, görsel rozetler, "N results from M suppliers" | — | yok | fixture | Kenar çubuğu/reklam kartları filtrelenir |
| Yiwugo | `.tile-item`: `<font>` vurguları birleşir, "58 .00 元", `起购` MOQ, `.year`, `高级会员`, `.address-info` | — | yok | fixture | — |
| IndiaMART | `self.__next_f` → `initialProducts` (+`moreResults`): fiyat/₹ Lakh, MOQ, firma, eyalet, yıl, TrustSEAL/GST/IEC | — | yok | fixture | export.indiamart.com |
| TradeIndia | `#__NEXT_DATA__` listing satırları: `price`, `member_since`, `ifmanu`, `has_trust_stamp`, şehir | — | yok | fixture | Yazılan arama `/manufacturers/<slug>.html` sayfasına iner; desen bunu kabul eder |
| Tokopedia | kart; yalnız `<mağaza>/<ürün>` yolları ürün sayılır; "10rb+ terjual" | — | yok | fixture (ana sayfa) | — |
| Shopee ID | kart; insan benzeri yazma | — | yok | yok | giriş duvarı adresi tanınır |
| Lazada TH | kart; flash-sale fiyatı, eski fiyat atlanır | — | yok | canlı (80) + fixture | — |
| Rakuten | kart | — | yok | yok | "Frame is showing error page" büyük olasılıkla Akamai 403 (boş gövde); yakalama istenir |
| Mercari | kart; `ProductThumbItemPrice` | — | yok | fixture (ana sayfa) | Oturum **Mercari US**'e düşer: USD, `www.mercari.com`. Kimlik `us-mercari` (eski `jp-mercari` ayarları açılışta taşınır) |
| Yahoo Auctions | kart; `円` fiyat | — | yok | fixture (ana sayfa) | Ana sayfa `auctions.yahoo.co.jp` (çıplak host); `www.` host yok |
| Coupang | kart; insan benzeri yazma | — | yok | yok | yakalama istenir |
| Gmarket | `.text__name`, `span.text__price` (üstü çizili değil) | — | yok | fixture (ana sayfa) | sonuç sayfası `browse.gmarket.co.kr` yakalaması istenir |
| eBay | `.s-item__price`/`su-item-card__price`, üstü çizili atlanır | JSON-LD | yok | canlı (120) + fixture | — |
| Walmart | `aria-label="Price $ 10.99"`, `product-title`, "Rollback," öneki atılır | — | yok | fixture (ana sayfa) | PerimeterX duvarı `#px-captcha` / "Press & Hold" |
| Temu | `[data-type='price']` TL/US$/€, `h3 > span` (rozet atılır); insan benzeri yazma | — | yok | fixture (ana sayfa) | temu.com/tr |
| Noon | `[data-qa='product-box-name']`, `strong._amount_` çıplak sayı → AED | — | yok | fixture (ana sayfa) | — |
| Ozon | ikinci link başlığı, `tsHeadline500Medium` fiyat, puan | — | yok | fixture (ana sayfa) | "2 325 ₽" boşluklu binlik |
| Wildberries | `aria-label` başlık, `ins[data-testid='product-card-current-price']`, `#searchInput` | — | yok | fixture (ana sayfa) | module-federation kabuğu; kutu geç bağlanır |

Beta pazarlarda **detay** genel okuyucudur: yalnız adres/canonical ürün linki desenine uyuyorsa çalışır,
JSON-LD `Product` → `h1` + fiyat seçicisi → görünür metin; aksi halde `null` (ana sayfa/hata sayfası
asla "ürün" olarak dönmez).

## 6. Fixture yakalama kontrol listesi

Yakalanan 28 sayfanın 12'si ana sayfa, 4'ü uygulamanın kendisiydi; aşağıdaki liste bunu önler.

**Ne yakalanmalı**

1. **Sonuç sayfası:** pazarın arama kutusuna sorguyu yaz, Enter'a bas, sonuçlar yüklendikten sonra
   (sayfayı bir kez aşağı kaydır) **Fixture yakala**. Adres çubuğunda arama parametresi görünmeli
   (`?q=`, `?keyword=`, `/sr?q=`…). Ana sayfa, kategori sayfası veya Manufactogate sekmesi yakalanmaz.
2. **Ürün detay sayfası:** aynı sorgudan bir ürünü aç, yakala (Trendyol için `?merchantId=` içeren adresle).
3. **Duvar sayfaları:** giriş isteyen veya captcha gösteren sayfa görürsen onu da yakala; adını
   `<pazar>-login-…` / `<pazar>-captcha-…` olarak değiştir.
4. **İstenen eksikler:** Alibaba.com, AliExpress, n11, Amazon US/UK/DE, Made-in-China, Shopee ID,
   Rakuten, Coupang, Gmarket (sonuç sayfası), Trendyol ürün sayfası, 1688 Çince arayüz sonuç sayfası,
   Pinduoduo doğrulama sayfası.

**Temizleme ve saklama** (`packages/adapters/src/<pazar>/fixtures/real-*.html`)

- Yalnız ilgili işaretleme: başlık + 3–6 kart (veya gömülü JSON'un 5 kayıtlık kesiti); 300 KB altı.
- `csrf`, `token`, `pvid`, `utparam-url`, `_trkparms`, `athAsset`, `scm`, `clickTrackInfo`, `at=` gibi
  izleme parametreleri, `srcset` imzaları (`x-signature`), kullanıcı kimlikleri (`uid`, `glusrid`, `userid`),
  e-posta ve ad soyad silinir. Yakalama aracı çerez yazmaz; yine de `grep -i "csrf\|token\|@"` ile kontrol et.
- Her fixture için `test/wave3.test.ts` (beta) veya `test/real-fixtures.test.ts` (ana pazarlar) içine
  kimlik, fiyat, para birimi, başlık ve "sayfa ana sayfa mı / captcha mı" beklentileri eklenir.
  Olumsuz beklenti de yazılır: ana sayfa yakalamaları `resultsPage: false` ve `session !== "captcha"` olmalı.
- Yerel doğrulama: `pnpm vitest run --project adapters`.

## 7. Görselle arama

- 1688: `s.1688.com/youyuan/index.htm?tab=imageSearch` dosya girişi; kendi CDN görseliyle yüklemesiz arama.
- Taobao: `s.taobao.com/search?tab=all` kamera girişi veya yapıştırma.
- **Diğer 31 pazar görselle arama sunmaz** (`capabilities.imageSearch: false`); uygulama başlıkla metin
  araması yapar. Trendyol'un eski "yükleme sayfası" kaldırıldı: her görsel karşılaştırmada sekme açıp
  ~6 s boşa bekleyen yol buydu.

## 8. Diğer alanlarla bağlantı (bu turda kapananlar)

- **Eklenti:** `searchPayloadFor` / `healthPayloadFor` strateji ve sonda sinyallerini üretir; `ExtractRequest.searchBox`,
  `expectUrl`, `quick` kullanılır; sağlık için `healthRequestFor(def, quick)` (`background/health.ts`). `cancel` mesajı
  sıradaki ve açık sekmeleri kapatır; `run:progress` zarfı pazar aşamasını web'e taşır (docs/ADAPTER_SPEC.md 4b).
- **Core/Web:** `fetchListing(id, hint)` ile Trendyol `merchantId` taşınır (Listing sayfası; `watch.ts` henüz değil);
  boş `tiers` "Fiyat teklifle" olarak gösterilir; `RawListing.titleLang`, `priceMax`, `priceOnRequest`, `reviewCount`,
  `soldPeriod`, `supplier{years, verified, businessType, rating}` `enrichListing` ile her pazarda dolar ve
  Listing/SupplierPanel/`traceScore` bunları okur. `packQty`, `unitLabel`, `shipFrom`, `variantCount` ve
  `supplier.key` (çapraz mağaza kimlik tohumu) için bkz. § 10.
- **Süre bütçesi:** tek kaynak `TIMING` (`runtime/protocol.ts`); sağlık turu 3 paralel × 8 s, arama 120 s etkin /
  600 s üst sınır. Buradaki pazar başına sayfa sayıları (`maxPages`) bu bütçeye göre seçilmiştir.

## 9. Hız ve nezaket

Pazar başına en az 2,5–3 s aralık ve saatte en fazla 100–120 istek. Arka planda açılan sekmeler iş bitince
kapatılır. Sınırlar `packages/adapters/src/markets.ts` ve `wave2/generic.ts` içinde tutulur ve düşürülmez.

## 10. Kart alanları: paket adedi, birim, gönderim yeri, varyant sayısı, tedarikçi anahtarı

`SearchItem`/`CardData` dört yeni alan taşır: `packQty` (fiyatın kapsadığı birim sayısı), `unitLabel`
(fiyatın/MOQ'nun birimi), `shipFrom` (ISO alpha-2 gönderim ülkesi), `variantCount` (kartta ilan edilen
varyant sayısı). `enrichListing()` bunları her pazarda `RawListing`'e taşır; `enrichDetail()` aynı işi
detay yükü için yapar (`unitLabel`, `variantCount`, `shippingFrom` yer metni, `shipFrom` ülke/yer).
`toListing`/`toDetail` bu alanları elle kopyalamaz.

Saf ayrıştırıcılar (`packages/adapters/src/dom/fields.ts`):

- `parsePack(text)` → `{ qty, unit }`: "2件装", "5件套", "10 adet", "10'lu", "6’lı", "3 çift", "Set of 4",
  "4-pack", "12 pcs", "2 pairs", "52 шт", "10個入り", "3개입", "x5" / "5x". **Pakete sayılmayanlar:** MOQ
  ("Min. order: 200 Pieces", "500个起购", "minimum sipariş miktarı 1"), satış sayaçları ("1.234 adet satıldı"),
  aralıklar ("50-300pcs"), model adları ("i60套装"), boyutlar ("10x20cm"), tek birim ("1件装"). Aralık 2–500.
- `parseUnitLabel(text)`: "N个起购/起批/起订" → 个; "元/件", "₹ 48,000/Piece", "12,50 TL / adet", "per pair";
  "Min. order: 200 Pieces" → `pcs`; "Unit of Price: Piece/Pieces" → `pcs`. Latin birimler kanonikleştirilir
  (`normalizeUnit`: piece/pieces/pc → `pcs`, pair(s) → `pair`, set(s) → `set`, pack(s) → `pack`, kg, g, m, adet, шт…);
  CJK sayaçlar olduğu gibi kalır (件 套 个 双 副 …). Paket ifadesi kendi birimini de verir ("2件装" → 件).
- `parseShipFrom(text)`: yalnız açık işaretle ("Ships from", "Located in", "Gönderim yeri", "发货地", "発送元",
  "Отправка из", "Dikirim dari", "free shipping from China"); **"Ships to …" hedeftir, sayılmaz.**
  `countryOfPlace()` Çin il/şehir adlarını (浙江, 广东 佛山, 陕西西安, Shenzhen…) `cn`'ye, ülke adlarını
  (Türkiye, Almanya, 日本, Китай…) ve alpha-2 kodları koda çevirir; bilinmeyen yer → `null`.
- `parseVariantCount(text)`: "5 colors", "+3 renk" (= 4), "2 Farklı Renk", "12 Renk Seçeneği", "4色", "6 цветов".
  Tek seçenek ("1 color") ve yıl/model sayıları sayılmaz.

Tedarikçi kimlik tohumu (`packages/adapters/src/dom/supplier.ts`): `supplierKey({ name, country })` firma adını
katlar — 有限公司/股份/集团/商贸/贸易/实业/科技/旗舰店/专营店, Co., Ltd., Inc, LLC, GmbH, A.Ş., Ltd. Şti., Sanayi,
Ticaret, Trading, Technology, Store… atılır; büyük/küçük harf, Türkçe İ/ı, aksan ve noktalama silinir — ve
ülkeyi önüne koyar: "深圳市示例电子有限公司" → `cn:深圳市示例电子`, "Shenzhen Shili Electronics Co., Ltd." =
"SHENZHEN SHILI ELECTRONICS CO.,LTD" → `cn:shenzhenshilielectronics`, "Örnek Dış Ticaret Ltd. Şti." → `tr:ornek`.
`enrichListing`/`enrichDetail` anahtarı `RawListing.supplier.key`'e yazar (ülke: `shipFrom` varsa o, yoksa pazarın
ülkesi). Adsız kartlarda (yalnız `merchantId`/`mall_id`) anahtar üretilmez; detay sayfası adı getirince dolar.
Çekirdek `ListingSupplierInfo` tipinde `key` yoktur; adapter `SupplierInfoKeyed` ile yapısal olarak genişletir.

**Pazar başına kanıt** (fixture = yakalanan sayfa; "yok" = sayfada bu bilgi gösterilmiyor, alan boş kalır):

| Pazar | packQty | unitLabel | shipFrom | variantCount | Kaynak / not |
|---|---|---|---|---|---|
| 1688 arama (i18n grid) | başlıktan ("2件装") | yok (hücrede "minimum sipariş miktarı 1", birim yok) | yok | yok | fixture `real-search-i18n` |
| 1688 detay | başlıktan | `"unit":"个"` (`window.context`) | `location` "浙江省金华市" → `cn`, `shippingFrom` yer metni | `skuMap` uzunluğu (12) | fixture `real-detail` |
| Taobao arama | başlıktan | yok | `procity` "广东 佛山" → `cn` (48/48 kart) | yok | fixture `real-search` |
| Taobao detay | başlıktan | yok | `deliveryVO.deliveryFromAddr` "陕西西安" → `cn` | `skuBase.skus` uzunluğu (2) | fixture `real-detail` |
| Pinduoduo arama | başlıktan | yok | yok (sayfadaki "商品发货地" bir filtre, kart alanı değil) | yok | fixture `real-search` |
| Pinduoduo detay | başlıktan | `input[aria-label="当前数量为1件"]` → 件 | yok | `.sku-specs-key` grupları × seçenek (39 renk × 4 beden = 156) | fixture `real-detail`; `rawData` dolu gelirse `goods.skus` uzunluğu (doğrulanmadı) |
| Trendyol arama | başlıktan ("10'lu") | yok | yok: yakalamada "Yurt Dışından" etiketi yok; görülürse ülke verilmediği için ham rozet olarak saklanır, `shipFrom` boş kalır | `variants` dizisi (API alanı; **yakalamada yok**, `null`) | fixture `real-search` |
| Trendyol detay | başlıktan | yok | yok | `product.variants` uzunluğu (doğrulanmadı, ürün sayfası yakalaması istenir) | — |
| Global Sources | — (200 MOQ'dur) | "Min. order: 200 Pieces" → `pcs` | yok | yok | fixture |
| Yiwugo | — ("i60套装" model adı) | "500个起购" → 个, "1副起购" → 副 | yok | yok | fixture |
| IndiaMART | — | `"unit":"Piece"` → `pcs` | yok | yok | fixture (RSC) |
| TradeIndia | — | satır `"unit":"Piece/Pieces"` / "Unit of Price" → `pcs`, `pack` | yok | yok | fixture (`__NEXT_DATA__`) |
| Temu TR (ana sayfa) | "15'li" → 15 adet | adet | yok (kartta "Gönderim yeri" metni yok) | yok | fixture ana sayfa; sonuç sayfası yakalaması istenir |
| Ozon (ana sayfa) | "52 шт" → 52 | шт | yok | yok | fixture ana sayfa |
| Mercari (ana sayfa) | "15 pack" → 15 | pack | yok | yok | fixture ana sayfa |
| Lazada (ana sayfa) | — ("50-300pcs" aralık) | yok | yok | yok | fixture ana sayfa |
| AliExpress, DHgate, eBay, Walmart, Amazon*, Noon, Wildberries, Gmarket, Yahoo, Tokopedia, Shopee, Coupang, Rakuten, Made-in-China, n11, Hepsiburada | başlıktan | kart metninden (genel ayrıştırıcı) | kart metninde "Ships from / Located in / Gönderim yeri" varsa | "N colors / +N renk" varsa | sonuç sayfası yakalaması yok; genel kart okuyucu + metin ayrıştırıcı, **doğrulanmadı** |

Beta pazarların detay okuyucusu (`wave2/generic.ts`) görünür metinden `shipFrom` ve `variantCount` dener;
bunlar da yakalama bekler.

### Pinduoduo ikinci sayfa

`maxPages: 1` kalır. Yakalanan `search_result.html` gövdesinde **hiç `<a>` yok** (0) ve kart metni DOM'da
yer almıyor: liste yalnız `window.rawData.stores.store.data.ssrListData.list` içinde (20 kayıt). Sonraki sayfa,
kaydırmada `flip` imleci (`"flip":"0;0;0;0;…"`, `"page":2`) ile XHR üzerinden gelir ve React, bağlantısız
(`onClick`) kartlar olarak ekler; `rawData` güncellenmez. Eklentinin kaydırma geçişinden sonra DOM'dan okunacak
ne bir ürün linki ne de `data-goods-id` özniteliği var; `extractCards` fallback'i (`LINK_PDD`) bu yüzden
boş döner. XHR'ı kendimizin çağırması "kendi ağ isteği yok" kuralına aykırıdır. Kaydırma sonrası sayfanın
bir yakalaması (kartların işaretlemesi) gelirse ikinci sayfa stratejisi eklenir; o zamana kadar tek sayfa.

