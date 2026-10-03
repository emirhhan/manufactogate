# Plan ile Gerçek Durumun Karşılaştırması

Bu belge docs/PLAN.md'deki her kapsam maddesini bugünkü koda karşı tek tek değerlendirir.
Güncelleme: 2026-10-03. "Doğrulandı" = kullanıcının tarayıcısında gerçek pazarda çalıştığı görüldü.

## 3.1 Arama girişi

| Madde | Durum |
|---|---|
| Görsel yükleme (sürükle, yapıştır, dosya) | Yapıldı; kamera girişi mobil için sonraki adım |
| Bölge seçerek arama | Yapılmadı |
| Link yapıştırma | Yapıldı; 33 pazarın linki çözülür |
| Metin arama ve pazar diline çeviri | Yapıldı; Türkçe → Çince sözlükle, model kodları korunur. Japonca/Korece/Rusça için çeviri yok |
| Toplu arama (CSV) | Yapıldı (/bulk: satır başına sorgu, aralıklı sıralı arama, CSV indir) |

## 3.2 Arama motoru

| Madde | Durum |
|---|---|
| Paralel çok pazar arama | Yapıldı, doğrulandı (1688, Taobao, Trendyol) |
| Aynı ürün kümeleme ve güven skoru | Yapıldı; pHash + başlık + pazarın görsel eşleşmesi. CLIP yok |
| Düşük güven ayrımı | Yapıldı ("benzer olabilir" ve "filtrelenenler") |
| Bulunamadı durumu | Yapıldı |
| Yeniden deneme ve tanı | Yapıldı; tipli hatalar, Tanı paneli, captcha sonrası otomatik devam |

## 3.3 Sonuç ve karşılaştırma

| Madde | Durum |
|---|---|
| Küme kartı, karşılaştırma tablosu, sıralama | Yapıldı |
| Fiyat merdiveni | Yapıldı (1688 detay) |
| Fiyat zinciri | Yapıldı (ürün sayfası, pazar başına en düşük) |
| Gerçek ürün sayfası linki | Yapıldı |
| En uygun kaynak skoru, ayarlanabilir ağırlıklar | Kısmen: "En yakın eşleşme" sıralaması, satılabilirlik skoru (marj, talep, bulunabilirlik, rekabet); ağırlık ayarı yok |
| Pazarda satılır mı / satan var mı | Yapıldı: sonuç sayfasında analiz kartı (tedarik min, hedef medyan/satıcı sayısı, indirilmiş maliyet, net marj, 0-100 skor) |
| Filtre paneli | Yapıldı: pazarlar (tedarik/hedef), fiyat üst sınırı, sadece yakın eşleşmeler, sadece görselli; 60'arlık sayfalama |

## 3.4 Tedarikçi zekâsı

| Madde | Durum |
|---|---|
| Tedarikçi kartı | Kısmen: ad, konum, etiketler; yıl, tekrar alım, yanıt süresi için mağaza sayfası okuma yok |
| Fabrika mı aracı mı | Sezgisel skor (etiket, firma adı, MOQ, kademeli fiyat) ürün sayfasında |
| Üreticiye izleme | Yapılmadı (Sprint 5) |
| Çapraz mağaza eşleme, risk özeti | Yapılmadı (Sprint 5) |

## 3.5 Maliyet ve ülke motoru

| Madde | Durum |
|---|---|
| Ülke profili | 8 ülke, yaklaşık ve tarihli oranlar; kullanıcı düzenlemesi yok |
| İndirilmiş maliyet, marj | Yapıldı |
| GTİP önerisi | Kategori grubundan HS faslı önerisi (lib/analysis hsSuggest); ürün bazlı değil |
| Çok ülke karşılaştırma | Yapıldı (ürün sayfası tablosu) |
| Para birimi | Gösterge kur tablosu; canlı kur yok |

## 3.6 Araştırma yönetimi

| Madde | Durum |
|---|---|
| Projeler, geçmiş | Yapıldı |
| İzleme ve alarm | İzleme yapıldı; otomatik alarm yok (elle yenileme) |
| Dışa aktarma | CSV, Excel (.xls SpreadsheetML) ve yazdır/PDF |
| İletişim asistanı | Yapıldı: Çince/İngilizce teklif, numune ve özelleştirme taslakları, adet alanlı |

## 3.7 Eklenti

| Madde | Durum |
|---|---|
| Oturum tespiti | Yapıldı (çerez sezgisi + sayfa okuması) |
| Overlay | Yapıldı: pazar ürün sayfalarında "Diğer pazarlarda karşılaştır" düğmesi |
| Sağlık izleme | Yapıldı; ana 4 pazar ve sıralı kalibrasyon turu |
| Hız sınırı | Yapıldı (pazar başına aralık, en çok 3 eşzamanlı sekme) |
| İnsan benzeri arama | Beta pazarlarda arama kutusuna yazıp Enter; kademeli kaydırma |

## Pazar kalibrasyonu

| Pazar | Arama | Detay | Görselle arama |
|---|---|---|---|
| 1688 | Doğrulandı (119 sonuç) | Doğrulandı | CDN görseliyle; canlı teyit bekliyor |
| Taobao | Doğrulandı (52 sonuç) | Fixture ile kalibre | Yapıştırmayla doğrulandı |
| Pinduoduo | Fixture ile kalibre; canlıda kırılgan | Fixture ile kalibre | Web'de yok |
| Trendyol | Doğrulandı (87 sonuç) | Fixture ile kalibre | Kamera yolu; canlı teyit bekliyor |
| 28 beta pazar | Genel kart okuma, doğrulanmadı | Genel | Yok |

## Sonraki üç adım, sırayla

1. **Kalibrasyon turu geri bildirimi:** Beta pazarların kaçı sonuç verdi, hangileri captcha/giriş istedi.
   Boş dönenler için fixture. Bu tur bitmeden yeni pazar eklenmeyecek.
2. **Sprint 5, tedarikçi zekâsı:** 1688 mağaza sayfası okuma (yıl, tekrar alım, yanıt), fabrika/aracı skoru,
   üreticiye izleme sıralaması, risk özeti.
3. **Sprint 6, kalite:** 300 ürünlük altın veri seti, güven kalibrasyonu, tarayıcıda CLIP, GTİP önerisi,
   XLSX/PDF dışa aktarma, bölge seçerek arama, toplu CSV arama, overlay.

## Ana sayfa (gerçek veri modu)

Keşfet feed'i cihazdaki gerçek ilanlardan kurulur: marj adayları (tedarik ile hedef pazar benzeri arasında ≥2× fark),
öne çıkanlar (tazelik, satış, puan, pazar çeşitliliği), kullanıcının kategorileri, çok satanlar, son aramalar ve izlenenler.
Sunucu yok; algoritma apps/web/src/lib/feed.ts.

## Web kabuğu notları (2026-10-03, kabuk/feed/ayarlar turu)

- **Yerel veri şeması v3**: `listings` artık `market:id` başına tek kanonik satır; bir ilanın hangi aramalardan geldiği `searchItems` (`[searchId+key]`, `order`) tablosunda. Geçmişten açılan aramalar küçülmez, sıralama korunur. Küme eşleşmelerinin ince kopyası `matches` tablosunda; ana sayfa feed'i parmak izi yüklemeden oradan okur. Yazımlar `persistListings(searchId, batch)` / `persistClusters` üzerinden (lib/db.ts); `Listing.tsx` ve diğer sayfalar aynı yardımcıları kullanabilir (`searchId` alanı artık okunmaz).
- **Arama deposu (store/search.ts)**: `error`, `storageNote`, `warning`, `cancelled`, `retrying`, `retryRemaining()` alanları eklendi. `cancel()` arama kaydını `status: "cancelled"` ile kapatır ve bitmemiş pazarları `done { cancelled: true }` yapar; Results bu durumda "Durduruldu" ve "Kalanları yeniden dene" (`retryRemaining`) gösterebilir. `SearchRecord` artık `status`, `resultCount`, `durationMs`, `marketStatus`, `error` taşır ve `load()` bunları geri yükler.
- **Link yapıştırma**: SearchBox tanınan bir ilan linkini `/l/resolve/<url>?compare=1` ile açar (Listing sayfası `compare=1` ile karşılaştırmayı kendisi başlatır); tek sonuçlu "link araması" yalnızca tanınmayan linklerde metin olarak çalışır.
- **Eklenti canlılığı**: `lib/bridge.ts` `ping()`, `ensureAlive()` (5 sn önbellek) ve kalp atışı ile kopan içerik betiğini saniyeler içinde yakalar; `ExtensionInfo.orphaned` + üst şerit uyarısı. Veri kaynağı artık `useExtension().dataSource` (reaktif); `getDataSource()` yalnızca React dışı kod için.
- **Ayarlar**: pazarlar bölgeye göre gruplu, hazır seçimler (Çalışanlar/Doğrulananlar/Hedef ülke/Hepsi/Hiçbiri), sağlık sonuçları `settings.health` altında kalıcı, arama derinliği (150/300/600), kur tablosu (CNY/USD/EUR/GBP), yedek al/yükle ve türüne göre silme.
- **Yeni sayfalar/bileşenler**: `/dashboard` (Panel), başlangıç listesi (Onboarding), toast, iskelet ve form primitifleri (`components/ui.tsx`), gerçek katalog sınıflandırıcısı için İngilizce/Almanca/Rusça/Japonca/Korece eş anlamlılar (`lib/categorySynonyms.ts`).
- **Testler**: apps/web artık happy-dom + fake-indexeddb ile çalışır (`apps/web/test/*`): şema yükseltme, arama deposu (iptal/yeniden dene/depolama hatası), feed, sınıflandırıcı, izleme, ayarlar, köprü canlılığı.
