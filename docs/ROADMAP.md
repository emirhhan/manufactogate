# Yol Haritası

İki haftalık sprintler. Her sprintin çıktısı çalışan bir şey ve geçen testlerdir.

## Sprint 0: Temel (hafta 1-2)

- Monorepo, lint, test, CI.
- `packages/core` veri modeli ve adapter arayüzü.
- `apps/web` iskelet: arama alanı, boş durumlar, tasarım jetonları, koyu tema.
- `apps/extension` iskelet: port mesajlaşması, oturum tespiti, sağlık kaydı.
- Sahte adapter ile uçtan uca akış: görsel yükle, sahte sonuç, küme kartı.

Çıktı: Tıklanabilir, sahte verili ama gerçek mimarili uygulama.

## Sprint 1: Gerçek adapter'lar (hafta 3-4) — kod tamam, kalibrasyon bekliyor

- 1688, Taobao, Pinduoduo, Trendyol adapter'ları: URL'ler, link çözme, gömülü JSON ve
  DOM kart sezgisi, görselle arama (1688, Taobao), fixture testleri.
- Eklenti: arka plan sekmesi çalıştırıcı, hız sınırı, sağlık kontrolü, fixture yakalama.
- Web: eklenti destekli kayıt defteri, veri kaynağı seçimi, giriş yönlendirmesi.
- Kalan: canlı sayfalardan fixture alıp seçicileri doğrulamak (docs/CALIBRATION.md),
  tarayıcıda CLIP embedding.

## Durum (2026-10-03, bütünleştirme turu sonrası)

| Sprint | Kapsam | Durum |
|---|---|---|
| 0 | Monorepo, çekirdek, sahte adapter, web ve eklenti iskeleti | Tamam |
| 1 | Gerçek adapter'lar (1688, Taobao, Pinduoduo, Trendyol), eklenti çalıştırıcı | Tamam; 1688/Taobao/Trendyol canlı doğrulandı, Pinduoduo fixture |
| 2 | Ana sayfa araması, gerçek ürün sayfası, pazarlar arası karşılaştırma, görsel arama tabanı | Tamam; görselle arama (1688 yükleme) canlı teyit bekliyor, Taobao yapıştırma doğrulandı |
| 3 | Projeler, notlar, izleme listesi, CSV dışa aktarma, maliyet varsayımları | Tamam |
| 4 | Sorgu yerelleştirme (Türkçe → pazar dili merdiveni: zh/en/ja/ko/ru/de/id/th), görsel arama başarısızlığında başlıkla arama | Tamam; merdiven pazar başına gönderilir, "Ne arandı?" panelinde görünür |
| 4b | Beta pazarlar: Alibaba.com, AliExpress, Hepsiburada, n11, Amazon TR | Tamam, beta; Hepsiburada ve Amazon TR canlı, diğer üçünün yakalaması yok |
| 4c | Karşılaştırma kalitesi: sorgu merdiveni, benzerlik filtresi, sayfalama, görsel yedek, captcha sonrası otomatik devam | Tamam |
| 4d | Dalga 3 beta pazarlar (DHgate … Wildberries, 24 pazar) | Tamam, beta; DHgate, Tokopedia, Lazada TH, eBay canlı; 11'i fixture; Made-in-China, Shopee, Rakuten, Coupang, Amazon DE/US/UK yakalama bekliyor |
| 4e | Ülke profilleri TR, DE, US, GB, AE, NL, PL, RO; ülke başına maliyet ve marj tablosu | Tamam; kullanıcı oranları (KDV, gümrük, komisyon, aracı, yurt içi kargo) düzenlenebilir |
| 4f | Bütünleştirme: uçtan uca iptal, canlı aşama zarfları, tek süre bütçesi (`TIMING`), satıcıya özel detay, yeni ilan alanları, overlay anlık görüntü, hızlı sağlık turu, pazar başına hız sınırı, 4173 kökeni, Mercari → `us-mercari` | Tamam (bkz. docs/STATUS.md "Bu turda kapanan açıklar") |
| 5 | Tedarikçi zekâsı: fabrika mı aracı mı skoru (`traceScore`), üreticiye izleme sıralaması, kart sinyalleri, risk bayrakları | Büyük ölçüde tamam; çapraz mağaza birleştirme ve yorum temaları açık |
| 6 | Kalite: altın veri seti (44/300), güven kalibrasyonu, CLIP, kaynak skoru ağırlıkları, bölge seçerek arama, LLM çeviri (isteğe bağlı anahtar) | Sırada |

### Bilinen açık noktalar

- 9 pazarın hiç gerçek sayfa yakalaması yok (Alibaba.com, AliExpress, n11, Amazon US/UK/DE, Made-in-China,
  Shopee ID, Rakuten, Coupang); seçiciler ilk canlı turda kırılabilir. Yakalama listesi docs/STATUS.md'de.
- Görselle arama 1688 yükleme yolunda canlı doğrulanmadı; başarısız olursa başlık merdivenine düşer ve pazar
  7 gün boyunca görseli atlar (`capabilityMemo`).
- Çeviri sözlüğü kategori adlarına dayanır; sözlük dışı kelimeler İngilizce basamakta kalır veya son çare Türkçe gider.
  Basamaklar görünür ama arayüzde düzenlenemez.
- İzleme listesi fiyatları elle yenilenir; arka plan alarmı yok; `watch.ts` satıcı ipucu geçirmez.
- Kur tablosu gösterge niteliğindedir (`REFERENCE_FX`, 7 günden eski ise uyarı); canlı kur yok.
- Pinduoduo risk kontrolü sık; "Doğrulama gerekli" ile giriş sayfasına yönlendirilir, sekme açık bırakılır.

## Sprint 2 (başladı): Ürün sayfası ve pazarlar arası karşılaştırma

- Ana sayfada büyük arama kutusu (görsel, link, metin).
- Gerçek ilan için ürün sayfası: galeri, fiyat merdiveni, satıcı, özellikler, Türkiye'ye maliyet.
- "Diğer pazarlarda bul ve karşılaştır": ilanın görseliyle 1688 ve Taobao görsel araması,
  diğerlerinde başlıkla arama; pazar başına en düşük fiyat tablosu, güven skoru.
- Pazarın görsel araması eşleştirdiği sonuçlar "büyük olasılıkla aynı" bandına yükselir.
- Kalan: sorguyu pazar diline çevirme, CLIP ile görsel doğrulama, Taobao detay kalibrasyonu.

## Sprint 2 (eski plan): Taobao, Pinduoduo, kümeleme (hafta 5-6)

- Taobao ve Pinduoduo adapter'ları.
- Üç pazar paralel; kademeli dolan ekran.
- Kümeleme ve güven skoru v1; "neden eşleşti" paneli.
- Altın veri seti ilk 100 ürün; ölçüt panosu.

Çıktı: Üç pazarda aynı ürün kümeleri, güven skorlu.

## Sprint 3: Tedarikçi ve detay (hafta 7-8)

- Ürün detayı: fiyat kademeleri, MOQ, varyantlar.
- Tedarikçi profili: etiketler, yıl, tekrar alım; etiket sözlüğü.
- Fabrika mı aracı mı sınıflandırma v1.
- Üreticiye izleme sıralaması.

Çıktı: Küme detayında tedarikçi kartları ve "muhtemel üretici".

## Sprint 4: Maliyet ve Trendyol (hafta 9-10)

- Ülke profilleri: Türkiye ve Almanya; tarihli, kaynaklı.
- Maliyet motoru: kalem kalem, düzenlenebilir.
- Trendyol adapter; link yapıştırma akışı; fiyat zinciri.
- GTİP önerisi v1.

Çıktı: "Bu ürünü Trendyol'da satınca net marj" ekranı.

## Sprint 5: Araştırma yönetimi (hafta 11-12)

- Projeler, geçmiş, notlar.
- Dışa aktarma: CSV, XLSX, PDF.
- İzleme ve alarm.
- Yedekleme ve geri yükleme.

Çıktı: Günlük kullanılabilir araç.

## Sprint 6: Kalite ve cila (hafta 13-14)

- Altın veri seti 300 ürün; kalibrasyon; ölçüt hedefleri.
- Hata durumları, tanı ekranları, günlük duman testleri.
- Tasarım sistemi kontrol listesi tüm ekranlarda.
- Performans: ilk sonuç 8 saniye altı.

Çıktı: Sürüm 1.0 adayı.

## Sonraki dalgalar

- Dalga 2 pazarlar: Alibaba.com, AliExpress, DHgate, Yiwugo.
- Dalga 3: Hindistan, Endonezya, Japonya, Kore pazarları; yeni ülke profilleri.
- Dalga 4: Avrupa, ABD, Orta Doğu, Rusya hedef pazarları; arbitraj bulucu.
- Overlay, toplu araştırma, iletişim asistanı, ekip paylaşımı.
- Masaüstü paketi (Tauri) ve isteğe bağlı topluluk indeksi.
