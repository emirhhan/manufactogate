# Manufactogate

Tek ekrandan çok pazarlı ticari ürün araştırma platformu.

Bir ürünün görselini, adını veya linkini verirsin; Manufactogate aynı ürünü 1688, Taobao,
Pinduoduo ve diğer ülkelerin pazaryerlerinde bulur, tedarikçileri doğrular, hedef ülkeye
indirilmiş maliyeti hesaplar ve en uygun kaynağı tek bir karşılaştırma ekranında gösterir.

Sunucu yok, API ücreti yok: aramalar tarayıcı eklentisi üzerinden kullanıcının kendi
oturumuyla çalışır, veriler kullanıcının makinesinde kalır.


## Durum

Sprint 0–4f tamamlandı . 33 pazar adapter'ı: 1688, Taobao, Trendyol,
Hepsiburada, Amazon TR, DHgate, Tokopedia, Lazada TH ve eBay kullanıcının tarayıcısında canlı doğrulandı; Pinduoduo ve
14 beta pazar gerçek sayfa fixture'ları ile kalibre; 9 pazar yakalama bekliyor .
Aramalar eklenti üzerinden kullanıcının kendi oturumuyla çalışır: paralel çok pazar arama, Türkçe → pazar dili sorgu
merdiveni, aynı ürün kümeleme, gerçek ürün sayfası, satıcıya özel detay, fiyat zinciri, 8 ülke için indirilmiş maliyet
ve KDV'ye duyarlı marj (kullanıcı oranları düzenlenebilir), GTİP önerisi, tedarikçi skoru, projeler, izleme listesi,
toplu CSV arama, CSV/Excel/PDF dışa aktarma, overlay fiyat kutusu. Sahte veri modunda 22 ana grup, 430 kategori ve
3.800'den fazla ürünlük bir katalog vardır.

## Repo yapısı

```
apps/web                  React 19 arayüzü (Vite, Tailwind v4, react-router, zustand, Dexie)
apps/extension            Chrome eklentisi (Manifest V3, v0.8.0): arka plan sekme çalıştırıcı, overlay, açılır pencere
packages/core             veri modeli, adapter arayüzü, pHash, kümeleme, güven skoru, maliyet/kur/GTİP motoru, tedarikçi skoru, orkestratör
packages/adapters         33 pazar adapter'ı, kayıt defteri, etiket sözlüğü, çeviri merdiveni, çalıştırıcı protokolü (TIMING)
packages/country-profiles ülke vergi ve kargo profilleri (TR, DE, NL, GB, AE, US, PL, RO)
docs/                     plan, durum, adapter sözleşmesi, kalibrasyon, tasarım sistemi
```
---

## 🔒 Kaynak kod

Kaynak kod bu depoda **AES-256 ile şifrelenmiş** olarak durur (`kaynak.tar.gz.enc`). API anahtarları, mağaza kimlikleri ve iş ortaklarının bilgileri şifrelemeden önce koddan temizlendi.

Kodu incelemek isteyen işverenler ve ekipler şifreyi doğrudan benden alabilir:
**[LinkedIn](https://www.linkedin.com/in/emirhanterzi/)** · **[Profil](https://www.motogate.com.tr/emirhan-terzi/)**

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 300000 -in kaynak.tar.gz.enc | tar xz
```

© Emirhan Terzi. Tüm hakları saklıdır. Kod lisanslı değildir; izinsiz kopyalanamaz, kullanılamaz.
