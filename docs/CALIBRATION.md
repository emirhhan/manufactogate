# Adapter Kalibrasyonu

Gerçek adapter'lar (1688, Taobao, Pinduoduo, Trendyol) kullanıcının tarayıcısında, kendi
oturumuyla çalışır. Pazar sayfalarının HTML yapısı değişir; bu belge seçicilerin nasıl
doğrulanıp güncelleneceğini anlatır.

## Çıkarma stratejisi

Her pazar için sıralama aynıdır:

1. **Gömülü durum (embedded):** Sayfanın içine gömdüğü JSON okunur. Örnekler:
   1688 `window.__INIT_DATA`, Taobao `g_page_config`, Pinduoduo `window.rawData`,
   Trendyol `window.__SEARCH_APP_INITIAL_STATE__` ve `__PRODUCT_DETAIL_APP_INITIAL_STATE__`.
   Bu yol sınıf adlarından bağımsızdır ve en kararlı olanıdır.
2. **Kart sezgisi (cards):** Gömülü veri yoksa, ürün sayfasına giden linkler bulunur, her
   link için "tek ürün içeren en geniş kapsayıcı" kart kabul edilir ve fiyat, satış, mağaza,
   etiket bu kartın metninden regex ve aday seçicilerle okunur. Sınıf adı değişse de çalışır.
3. **Hiçbiri:** Sonuç yoksa adapter `SelectorBroken` hatası döner, uygulama "pazar
   güncellendi" der ve sağlık kaydına yazar.

## İlk kalibrasyon adımları

Sandbox ortamından pazar sitelerine erişilemediği için `fixtures/` altındaki HTML'ler
belgelenmiş yapılara göre elle yazılmıştır. Gerçek sayfalarla doğrulama şöyle yapılır:

1. `pnpm build` ve eklentiyi `apps/extension/dist` klasöründen yükle.
2. Tarayıcıda pazara giriş yap (1688, Taobao ve Pinduoduo giriş ister, Trendyol istemez).
3. Pazarın arama sayfasını aç, örneğin `s.1688.com/selloffer/offer_search.htm?keywords=蓝牙耳机`.
4. Eklenti açılır penceresinde **Fixture yakala** düğmesine bas. Sayfanın HTML'i
   `<pazar>-<tarih>.html` adıyla indirilir. Harici script'ler ve stiller çıkarılır, gömülü
   JSON korunur, çerez veya oturum bilgisi HTML'de bulunmaz.
5. Dosyayı `packages/adapters/src/<pazar>/fixtures/` altına koy, ilgili testte yükle ve
   `pnpm test` çalıştır. Alanlar boş geliyorsa `index.ts` içindeki yolları ve seçicileri düzelt.
6. Aynı işlemi ürün detay sayfası ve varsa mağaza sayfası için tekrarla.

## Sağlık kontrolü

Ayarlar sayfasında veya eklenti penceresinde **Sağlık kontrolü çalıştır**: her pazar için
bilinen bir sorgu arka planda açılır, oturum durumu, sonuç sayısı ve kullanılan strateji
raporlanır. Beklenen çıktı: `logged-in · N sonuç · embedded`. `cards` görülüyorsa gömülü
veri yolu değişmiş demektir; çalışır ama alanlar daha az güvenilirdir.

## Görselle arama

- 1688: `s.1688.com/youyuan/index.htm?tab=imageSearch` sayfasındaki dosya girişine görsel bırakılır.
- Taobao: `s.taobao.com/search?tab=all` sayfasındaki kamera simgesine bağlı dosya girişi.
- Pinduoduo ve Trendyol web'de görselle arama sunmaz; uygulama bu pazarlarda metin ve link kullanır.

Dosya girişi bulunamazsa adapter `SelectorBroken` döner. Bu durumda sayfadaki yükleme
düğmesinin seçicisi `apps/extension/src/extract/index.ts` içindeki `setImage` fonksiyonuna eklenir.

## Hız ve nezaket

Pazar başına en az 2,5 saniye aralık ve saatte en fazla 120 istek. Arka planda açılan
sekmeler iş bitince kapatılır. Kullanıcının hesabını riske atmamak için bu sınırlar
`packages/adapters/src/markets.ts` içinde tutulur ve düşürülmez.
