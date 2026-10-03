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
| Toplu arama (CSV) | Yapılmadı |

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
| En uygun kaynak skoru, ayarlanabilir ağırlıklar | Kısmen: benzerlik ve fiyat; ağırlık ayarı yok |

## 3.4 Tedarikçi zekâsı

| Madde | Durum |
|---|---|
| Tedarikçi kartı | Kısmen: ad, konum, etiketler; yıl, tekrar alım, yanıt süresi için mağaza sayfası okuma yok |
| Fabrika mı aracı mı | Yapılmadı (Sprint 5) |
| Üreticiye izleme | Yapılmadı (Sprint 5) |
| Çapraz mağaza eşleme, risk özeti | Yapılmadı (Sprint 5) |

## 3.5 Maliyet ve ülke motoru

| Madde | Durum |
|---|---|
| Ülke profili | 8 ülke, yaklaşık ve tarihli oranlar; kullanıcı düzenlemesi yok |
| İndirilmiş maliyet, marj | Yapıldı |
| GTİP önerisi | Yapılmadı |
| Çok ülke karşılaştırma | Yapıldı (ürün sayfası tablosu) |
| Para birimi | Gösterge kur tablosu; canlı kur yok |

## 3.6 Araştırma yönetimi

| Madde | Durum |
|---|---|
| Projeler, geçmiş | Yapıldı |
| İzleme ve alarm | İzleme yapıldı; otomatik alarm yok (elle yenileme) |
| Dışa aktarma | CSV yapıldı; XLSX ve PDF yok |
| İletişim asistanı | Yapılmadı |

## 3.7 Eklenti

| Madde | Durum |
|---|---|
| Oturum tespiti | Yapıldı (çerez sezgisi + sayfa okuması) |
| Overlay | Yapılmadı |
| Sağlık izleme | Yapıldı; ana 4 pazar ve sıralı kalibrasyon turu |
| Hız sınırı | Yapıldı (pazar başına aralık, sıralı tur) |
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
