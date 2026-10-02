# Tasarım Sistemi

Hedef: Avrupa standartlarında, sakin, veri yoğun, profesyonel bir araştırma aracı hissi.
Referans ton: Linear, Stripe Dashboard, Bloomberg'in sakinleştirilmiş hâli, Nordic bankacılık arayüzleri.

## 1. İlkeler

1. **Veri önce.** Her ekranın ana unsuru tablo veya kart; dekor yok.
2. **Her sayı birimiyle.** Para birimi, adet, yüzde, tarih her zaman görünür. Kaynak ve zaman damgası tooltip'te.
3. **Güven görünür.** Güven skorları, doğrulama etiketleri ve "tahmin" işaretleri tutarlı renk ve ikonla.
4. **Sessiz renk.** Nötr gri zemin, tek vurgu rengi, durum renkleri sadece durum için.
5. **Klavye öncelikli.** Arama, filtre, tablo gezintisi klavyeyle; komut paleti.
6. **Erişilebilir.** WCAG AA kontrast, odak halkaları, ekran okuyucu etiketleri, hareket azaltma.
7. **Yoğun ama nefes alan.** Satır yüksekliği 36 px tablo, 8 px grid, 4 ölçek boşluk sistemi.

## 2. Renk

| Jeton | Açık tema | Koyu tema | Kullanım |
|---|---|---|---|
| bg | #FAFAF9 | #0F1115 | Sayfa zemini |
| surface | #FFFFFF | #171A21 | Kart, tablo |
| border | #E6E4E0 | #262A33 | Kenarlık |
| text | #1A1A1A | #E8E8E6 | Ana metin |
| muted | #6B6B6B | #9A9A98 | İkincil metin |
| accent | #1F4FD8 | #5B8CFF | Vurgu, bağlantı, birincil düğme |
| success | #1E7F4F | #4CC38A | Doğrulanmış, yüksek güven |
| warning | #B7791F | #E0A84A | Orta güven, uyarı |
| danger | #B42318 | #F0665C | Hata, düşük güven, risk |

Tek vurgu rengi. Pazar logoları gri tonlu, hover'da renkli.

## 3. Tipografi

- Arayüz: Inter (değişken), 14 px taban, 1.5 satır yüksekliği.
- Sayılar: Inter tabular-nums; tablolarda sağa hizalı.
- Başlıklar: 20 / 16 / 14 px, ağırlık 600. Büyük başlık yok; ekran başlığı 20 px.
- Çince ve Japonca metin için sistem CJK yazı tipi yedeği.

## 4. Bileşenler

- **Arama alanı:** büyük, sürükle-bırak alanı; görsel, link, metin aynı kutuda; yapıştırınca tür otomatik algılanır.
- **Pazar ilerleme şeridi:** her pazar için küçük rozet: bekliyor, aranıyor, bitti, hata. Tıklanınca tanı.
- **Küme kartı:** sol ürün görseli, sağ pazar başına en iyi teklif satırları, altta güven ve tedarikçi sayısı.
- **Karşılaştırma tablosu:** sabit ilk sütun, sütun seçici, sıralama, sanal kaydırma, satır vurgusu, satır sonunda "Aç" bağlantısı.
- **Güven rozeti:** yüzde ve renk; tıklanınca "neden eşleşti" paneli.
- **Doğrulama etiketleri:** ikon artı kısa ad; hover'da pazarın orijinal etiketi ve açıklaması.
- **Fiyat merdiveni:** küçük basamak grafiği; kullanıcı adedi dikey çizgiyle.
- **Maliyet paneli:** kalem kalem liste; toplam ve marj altta büyük; her kalem düzenlenebilir.
- **Boş durumlar:** net cümle, bir sonraki adım düğmesi; illüstrasyon yok.
- **Hata durumları:** ne oldu, neden, ne yapmalı; teknik detay katlanabilir.

## 5. Yerleştirme

- Üst çubuk 48 px: logo, komut paleti, proje seçici, oturum durumu.
- Sol filtre paneli 280 px, katlanabilir.
- İçerik maksimum 1440 px, ortalanmış; geniş ekranda sağ panel 360 px.
- Mobil: eklenti açılır penceresi ve sonuç özeti; tam araştırma masaüstü için.

## 6. Dil ve ton

- Türkçe varsayılan; İngilizce, Almanca ikinci dalga.
- Kısa, kesin cümleler. "Bulunamadı" denir, "üzgünüz" denmez.
- Pazar adları orijinal; etiketler çevrilmiş artı orijinal.
- Tarihler yerel biçim; para birimi ISO kodu ile.

## 7. Kontrol listesi (her ekran için)

- [ ] Yükleniyor, boş, hata, kısmi sonuç durumları tasarlandı
- [ ] Klavye ile tüm eylemler yapılabiliyor
- [ ] Kontrast AA
- [ ] Her sayı birimli ve kaynaklı
- [ ] Koyu tema çalışıyor
- [ ] Çince ve uzun başlıklarda taşma yok
