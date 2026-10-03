# Altın veri seti (PLAN §7.1 / §7.3)

`cases.json`, eşleştirme skorunun (`scoreMatch`) kalibrasyonu için elle etiketlenmiş çiftleri tutar:
**310 vaka, 2107 çift, 25 taksonomi grubu** (elektronik, bilgisayar, ev, mutfak, beyaz eşya, kadın/erkek/çocuk
giyim, ayakkabı, çanta, aksesuar, kozmetik, sağlık, spor, motosiklet, oto, hırdavat, bahçe, oyuncak, bebek,
evcil hayvan, ofis, endüstriyel, ev tekstili, mobilya). Başlıklar zh / tr / en; gerçek fixture'lardan
(Trendyol, 1688, Taobao, Pinduoduo) ve tipik Amazon / eBay / AliExpress / Alibaba / Made-in-China
ilanlarından alınmıştır; kişisel veri içermez.

## Biçim

```json
{
  "id": "buds-anker-p20i",
  "group": "electronics",
  "query": { "title": "Anker Soundcore P20i Kablosuz Kulaklık", "altTitles": ["Anker Soundcore P20i 真无线蓝牙耳机", "Anker Soundcore P20i true wireless earbuds"], "phash": "…16 hex…", "category": "kablosuz-kulaklik" },
  "candidates": [
    { "title": "安克 Soundcore P20i 真无线蓝牙耳机 黑色", "market": "cn-1688", "label": "same", "phash": "…", "category": "…", "note": "…" }
  ],
  "note": "serbest açıklama"
}
```

- `group`: taksonomi grubu anahtarı (`packages/adapters/src/mock/taxonomy.ts`); kapsama sayımı için.
- `query.altTitles`: orkestratörün pazar dillerine çevirdiği sorgu basamakları (web `queryLadder`/`localizeQueryLadder` ile üretir).
- `label`: `same` (aynı ürün), `variant` (aynı seri/marka; farklı model, kapasite, renk, **paket adedi**, hedef kitle),
  `accessory` (ürünün kılıfı, vizörü, filtresi, yedek parçası…), `different` (başka ürün; aynı kategoriden başka marka,
  **replika / "tarzı" / "style" / 1:1** ilanlar, aynı model koduna sahip başka marka).
- `phash`: görsel karşılaştırmayı sınamak için; aynı ürün için aynı değer, farklı ürün için uzak (32 bit farklı) değer.
- `category`: yalnız o yapraktaki ürünlerde (`same`/`variant`); aksesuar ve başka ürün yaprak anahtarı taşımaz.

## İki kaynak: elle yazılan ve üretilen vakalar

- İlk 44 vaka elle yazılmıştır ve doğrudan `cases.json` içinde düzenlenir.
- Kalan vakalar `products.ts` tablosundan üretilir: her ürün için Türkçe sorgu, zh/en basamakları ve etiketli adaylar;
  `img: true` olan ürün ayrıca bir görsel vakası (`<id>-img`), `pack` olan ürün bir paket adedi vakası (`<id>-pack`) üretir.
  Pazar, başlığın alfabesinden atanır (CJK → Çin perakende, Türkçe harf → Türk pazarları, diğer → İngilizce pazarlar).
- Tabloyu değiştirdikten sonra:

  ```
  node packages/core/scripts/golden-build.ts
  ```

  `cases.json` yeniden yazılır (elle yazılan vakalar korunur). `test/golden.test.ts` JSON ile tablo ayrışırsa başarısız olur.
- Yeni ürün eklerken en az bir tuzak (aksesuar, aynı seriden farklı model, farklı paket adedi veya replika başlık) beklenir.

## Ölçütler ve tabanlar (`test/golden.test.ts`)

Her bant için "skor ≥ eşik" kesinlik ve kapsama ölçülür. Pozitif sayılan etiketler: `same` bandında yalnız `same`;
`likely` bandında `same|variant`; `similar` bandında `same|variant|accessory`.

| Bant | Eşik | Ölçülen kesinlik | Ölçülen kapsama | Taban (kesinlik / kapsama) |
|---|---|---|---|---|
| same | ≥ 0,85 | %94,7 | %70,2 | 0,90 / 0,66 |
| likely | ≥ 0,60 | %99,2 | %77,0 | 0,95 / 0,73 |
| similar | ≥ 0,35 | %87,7 | %66,9 | 0,83 / 0,63 |

Ek kurallar: aksesuar etiketli aday hiçbir zaman `likely` veya üstü (0 ihlal); `different` etiketli aday hiçbir zaman
`same` (0 ihlal); kümülatif kalibrasyon tekdüze (eşik yükseldikçe kesinlik düşmez, tolerans 0,05); ≥0,9 dilimi ≥ %97 saf;
görsel vakalarında aynı hash'li `same` çiftlerin ≥ %90'ı `same`.

`same` kapsamasının %70'te kalması tasarım gereğidir: model numarası veya numaralı marka ifadesi olmayan bir sorgu
("Birkenstock Arizona Sandalet") yalnız metinle en çok `likely` olur (`TEXT_ONLY_CEILING`). Skorlayıcı yeniden
ayarlandığında ölçümler tekrarlanır ve tabanlar yukarı taşınır; aşağı çekmek için test dosyası başlığına gerekçe yazılır.

## Rapor

```
GOLDEN_REPORT=1 pnpm vitest run --project core --reporter=verbose test/golden.test.ts
node packages/core/scripts/golden-report.ts
```

Bant tablosunu, skor dilimlerine göre gözlenen kesinliği ve kaçırılan çiftleri (gerekçeleriyle) basar.
`packages/core/src/match/score.ts` veya `fingerprint/text.ts` değiştiğinde bu rapor yeniden okunmalıdır.

## CLIP sağlayıcısı (ileride, otomatik indirme olmadan)

Skor `Fingerprint.clip` alanını isteğe bağlı kullanır (`packages/core/src/fingerprint/clip.ts`):

- `ClipProvider` arayüzü: `id`, `dimensions`, `isReady()`, isteğe bağlı `load()`, `embed(image, signal)`.
- Bugün `NoopClipProvider` takılıdır: hiçbir zaman hazır değildir, hiçbir şey indirmez; metin + pHash sinyalleri çalışır.
- Tarayıcı sağlayıcısı eklemek için web tarafı `ClipProvider`'ı transformers.js (WebGPU/WASM) ile uygular ve
  `attachClip(fingerprint, provider, image)` ile sorgu ve aday parmak izlerine vektör ekler. Kural: model ağırlıkları
  **kullanıcının açıkça seçtiği dosyadan veya daha önce onayladığı tarayıcı önbelleğinden** yüklenir; `load()` ağdan
  kendi başına indirme yapmaz, ağırlık yoksa `false` döner ve uygulama CLIP'siz devam eder.
- Sağlayıcı değişince (`id` farklı) önbellekteki vektörler karşılaştırılmaz (`clipCompatible`), yeniden hesaplanır.
- Altın sette CLIP vakası yoktur; sağlayıcı geldiğinde `-img` vakalarına `clip` dizileri eklenerek aynı tablo CLIP
  için de kalibre edilir (fixture'lardan, ağ erişimi olmadan).
