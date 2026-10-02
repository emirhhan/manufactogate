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

## Sprint 2: Taobao, Pinduoduo, kümeleme (hafta 5-6)

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
