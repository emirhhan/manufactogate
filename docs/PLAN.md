# Manufactogate: Ürün ve Mimari Planı

Sürüm 0.1, planlama aşaması. Bu belge ürünün ne olduğunu, kimin için olduğunu,
nasıl çalıştığını ve "herhangi bir ürünü hatasız bulma" hedefinin nasıl garanti
edileceğini tanımlar. Kod bu belgeye göre yazılır; belgeyle kod ayrışırsa belge güncellenir.

---

## 1. Vizyon ve ilkeler

**Tek cümle:** Bir ticari alıcının, aklındaki herhangi bir ürünü dünyadaki pazaryerlerinde
tek ekrandan arayıp, en uygun tedarikçiyi doğrulanmış verilerle ve hedef ülkeye indirilmiş
maliyetle seçebildiği profesyonel araştırma platformu.

**Kullanıcı için değer:** Saatler süren, on sekme arasında geçen, Çince sayfalarda kaybolan
araştırmayı tek, güvenilir ve karşılaştırılabilir bir rapora indirir.

**Ürün ilkeleri:**

1. **Gerçek veri, gerçek link.** Her sonuç gerçek bir ürün sayfasına gider. Tahmin edilen
   hiçbir alan gerçek alanmış gibi gösterilmez; güven derecesi her zaman görünür.
2. **Hatasız değil, dürüst.** Bulunamayan ürün "bulunamadı" der, yanlış eşleşme göstermez.
   Her eşleşmenin bir güven skoru ve "neden eşleşti" açıklaması vardır.
3. **Sıfır işletme maliyeti.** Arama kullanıcının kendi tarayıcısında ve kendi hesabıyla
   çalışır. Sunucuya bağımlılık yok, API ücreti yok.
4. **Avrupa profesyonel standardı.** Sakin, yoğun ama okunur, veri odaklı arayüz. Reklam
   yok, karanlık desen yok, her sayı birimiyle ve kaynağıyla.
5. **Pazar bağımsız çekirdek.** Yeni bir ülke veya pazar eklemek yeni bir adapter dosyası
   yazmaktır. Çekirdek motor hiçbir pazarı bilmez.
6. **Yerel öncelikli.** Veri kullanıcının makinesinde. İnternet kesilse bile geçmiş
   araştırmalar açılır.

---

## 2. Kullanıcılar ve senaryolar

### 2.1 Personalar

| Persona | Hedef | Kritik ihtiyaç |
|---|---|---|
| Pazaryeri satıcısı (Trendyol, Amazon) | Kârlı ürün bulup ithal etmek | Landed cost ve marj, güvenilir tedarikçi |
| Küçük ithalatçı / toptancı | Üreticiye doğrudan ulaşmak | Fabrika mı aracı mı ayrımı, MOQ fiyat merdiveni |
| Tedarik uzmanı (kurumsal) | Çok ürünlü karşılaştırma raporu | Toplu arama, dışa aktarma, ekip paylaşımı |
| Dropshipper | Düşük MOQ, hızlı kargo | Kargo süresi, tek adet fiyat, stok |
| Arbitrajcı | Ülkeler arası fiyat farkı | Çok ülke fiyat zinciri, para birimi normalizasyonu |

### 2.2 Ana kullanıcı yolculukları

**Yolculuk A: "Bu ürünü nereden alırım?"**
1. Kullanıcı bir görsel yükler, bir Trendyol linki yapıştırır veya ürün adını yazar.
2. Sistem ürün parmak izini çıkarır ve seçili pazarlarda paralel arama başlatır.
3. Sonuçlar "aynı ürün" kümelerine toplanır; her kümede pazar başına en iyi teklif görünür.
4. Kullanıcı adet ve hedef ülke seçer; indirilmiş maliyet ve marj anında hesaplanır.
5. Tedarikçi kartlarında doğrulama etiketleri, yıl, tekrar alım oranı ve risk özeti vardır.
6. Kullanıcı karşılaştırmayı projeye kaydeder, dışa aktarır veya tedarikçiye mesaj taslağı üretir.

**Yolculuk B: "Bu ürün satmaya değer mi?"**
1. Kullanıcı hedef pazardaki ürün linkini yapıştırır.
2. Sistem kaynağı bulur, fiyat zincirini çıkarır, hedef pazardaki rakip sayısı ve satış sinyalini gösterir.
3. Marj, doygunluk ve risk tek bir "fırsat kartı"na iner.

**Yolculuk C: "Yüz ürünü aynı anda araştır."**
1. CSV veya görsel klasörü yüklenir.
2. Eklenti sırayla pazarları tarar, ilerleme çubuğu gösterir, hata olanları tekrar dener.
3. Sonuç bir tablo ve projedir; filtrelenir, sıralanır, dışa aktarılır.

**Yolculuk D: Gezinirken araştırma.**
Kullanıcı herhangi bir ürün sayfasındayken eklenti köşede "bu ürün şu pazarlarda şu fiyattan var"
kutusu gösterir; tıklayınca tam karşılaştırma açılır.

---

## 3. Özellik kapsamı

Her özellik için kabul kriteri yazılmıştır. "Yapıldı" demek bu kriterlerin otomatik testle
geçmesi demektir.

### 3.1 Arama girişi

| Özellik | Kabul kriteri |
|---|---|
| Görsel yükleme (sürükle, yapıştır, dosya, kamera) | JPG, PNG, WEBP, HEIC kabul edilir; 20 MB'a kadar; otomatik yeniden boyutlandırma. |
| Bölge seçerek arama | Kullanıcı görselde bir alan çizer; sadece o alan aranır. |
| Link yapıştırma | Desteklenen her pazarın ürün linki çözülür, ana görsel ve başlık otomatik alınır. |
| Metin arama | Türkçe yazılan sorgu pazar diline çevrilir; çeviri kullanıcıya gösterilir ve düzenlenebilir. |
| Toplu arama | CSV ve klasör yükleme; satır başına durum; başarısızlar yeniden denenir. |

### 3.2 Arama motoru

| Özellik | Kabul kriteri |
|---|---|
| Paralel çok pazar arama | Seçili tüm pazarlar aynı anda sorgulanır; her biri ayrı ayrı tamamlanır ve ekrana düşer. |
| Aynı ürün kümeleme | Görsel benzerlik, başlık ve model numarasıyla kümeleme; her kümenin güven skoru 0 ile 1 arası. |
| Güven skoru ve açıklaması | Her eşleşme "görsel %94, başlık %71, model no eşleşti" gibi açıklanır. |
| Düşük güven ayrımı | Güven eşiği altındakiler "benzer olabilir" bölümünde ayrı listelenir, ana sonuca karışmaz. |
| Bulunamadı durumu | Hiç güvenilir eşleşme yoksa açık bir "bulunamadı" ekranı ve öneriler gösterilir. |
| Yeniden deneme ve tanı | Pazar hata verirse neden (giriş yok, captcha, seçici değişti) açıkça yazılır ve tek tıkla yeniden denenir. |

### 3.3 Sonuç ve karşılaştırma

| Özellik | Kabul kriteri |
|---|---|
| Küme kartı | Pazar başına en iyi teklif, fiyat aralığı, MOQ, tedarikçi sayısı. |
| Karşılaştırma tablosu | Sütunlar seçilebilir, sıralanabilir, sabitlenebilir; aynı para birimi; birim fiyat seçilen adette. |
| Fiyat merdiveni | MOQ kademeleri grafik ve tablo olarak; kullanıcı adedi girince hangi kademeye düştüğü vurgulanır. |
| Fiyat zinciri | Fabrika, toptancı, perakende, hedef pazar fiyatı yan yana; marj yüzdeleri. |
| Gerçek ürün sayfası | Her satırda orijinal link; yeni sekmede açılır; link ölüyse işaretlenir. |
| En uygun kaynak skoru | Fiyat, MOQ, kargo, doğrulama, tekrar alım, teslim süresi ağırlıklı; ağırlıklar kullanıcı tarafından ayarlanır. |

### 3.4 Tedarikçi zekâsı

| Özellik | Kabul kriteri |
|---|---|
| Tedarikçi kartı | Şirket adı, konum, yıl, doğrulama etiketleri, tekrar alım oranı, yanıt süresi, ana ürün grupları. |
| Fabrika mı aracı mı | Pazar etiketleri artı sinyaller (ürün çeşitliliği, fiyat seviyesi, özelleştirme desteği) ile sınıflandırma ve güven. |
| Üreticiye izleme | Aynı ürün kümesindeki tedarikçiler fiyat, etiket ve lokasyonla sıralanır; "muhtemel üretici" işaretlenir. |
| Çapraz mağaza eşleme | Aynı şirketin farklı pazarlardaki mağazaları birleştirilir. |
| Risk özeti | Negatif yorum temaları, yeni mağaza, tutarsız fiyat gibi uyarılar. |

### 3.5 Maliyet ve ülke motoru

| Özellik | Kabul kriteri |
|---|---|
| Ülke profili | Her hedef ülke için vergi tablosu, de minimis, KDV, ilave vergiler, tipik kargo seçenekleri; tarihli ve kaynaklı. |
| İndirilmiş maliyet | Ürün bedeli, kargo, sigorta, gümrük, ilave vergi, KDV, ÖTV, aracı ücreti, yurt içi kargo; kalem kalem. |
| GTİP önerisi | Ürün başlığından GTİP önerisi ve güven; kullanıcı düzeltebilir; düzeltmeler hatırlanır. |
| Marj hesabı | Hedef pazar satış fiyatı, komisyon, kargo ve reklam payı düşülerek net marj. |
| Çok ülke karşılaştırma | Aynı ürün için birden fazla hedef ülkede marj yan yana. |
| Para birimi | Günlük kur; kullanıcı kuru sabitleyebilir. |

### 3.6 Araştırma yönetimi

| Özellik | Kabul kriteri |
|---|---|
| Projeler | Ürün başına çalışma alanı; aramalar, notlar, karar. |
| Geçmiş | Her arama saklanır; aynı görsel tekrar aranınca önce yerel sonuç gelir. |
| İzleme ve alarm | Takip edilen ürün için fiyat değişince bildirim (eklenti açıkken). |
| Dışa aktarma | CSV, XLSX, PDF rapor; marka sız, profesyonel düzen. |
| İletişim asistanı | Teklif, numune ve pazarlık mesajı taslağı; pazar dilinde; gelen mesajın çevirisi. |

### 3.7 Eklenti

| Özellik | Kabul kriteri |
|---|---|
| Oturum tespiti | Her pazar için giriş durumu gösterilir; giriş yoksa yönlendirme. |
| Overlay | Desteklenen ürün sayfalarında köşe kutusu; kapatılabilir; site başına açık/kapalı. |
| Sağlık izleme | Her adapter için son başarılı çalışma zamanı; seçici kırılınca kullanıcıya ve geliştiriciye sinyal. |
| Hız sınırı | Pazar başına nazik tempo; kullanıcının hesabını riske atmayan aralıklar. |

---

## 4. Mimari

### 4.1 Bileşenler

```
┌──────────────────────────────────────────────────────────────────┐
│  Tarayıcı Eklentisi (Chrome, Edge, Firefox)                       │
│  ├─ Site adapter'ları (1688, Taobao, Pinduoduo, Trendyol, ...)    │
│  ├─ Oturum ve sağlık izleyici                                     │
│  ├─ Overlay                                                       │
│  └─ Arka plan görev kuyruğu (hız sınırlı)                         │
└───────────────▲──────────────────────────────┬───────────────────┘
                │ mesajlaşma (port)             │ normalize sonuçlar
┌───────────────┴──────────────────────────────▼───────────────────┐
│  Uygulama (web arayüzü, yerel çalışır)                            │
│  ├─ Arama orkestratörü                                            │
│  ├─ Parmak izi (pHash, CLIP tarayıcıda)                           │
│  ├─ Kümeleme ve güven skoru                                       │
│  ├─ Tedarikçi zekâsı                                              │
│  ├─ Maliyet ve ülke motoru                                        │
│  ├─ Projeler, geçmiş, dışa aktarma                                │
│  └─ Yerel veri (IndexedDB; masaüstünde SQLite)                    │
└──────────────────────────────────────────────────────────────────┘
```

Sunucu yok. İleride isteğe bağlı "topluluk indeksi" eklenirse ayrı bir servis olur ve
uygulama onsuz da tam çalışır.

### 4.2 Arama akışı

1. Giriş normalize edilir: görsel ise yeniden boyutlandırılır, link ise adapter ile çözülür.
2. Parmak izi: pHash (hızlı, tam kopya tespiti) ve CLIP vektörü (anlamsal benzerlik), tarayıcıda.
3. Yerel indeks kontrolü: aynı parmak izi daha önce aranmışsa sonuç anında gösterilir, arka planda tazelenir.
4. Orkestratör seçili pazarlar için görev üretir; eklenti kuyruğuna gönderir.
5. Her adapter kendi pazarında arama yapar, sonuç sayfasını ayrıştırır, normalize kayıt döner.
6. Her sonuç için görsel indirilip parmak izi çıkarılır; kümeleme çalışır.
7. Güven skoru hesaplanır; eşik altı sonuçlar ayrı bölüme düşer.
8. Tedarikçi zekâsı ve maliyet motoru kümeleri zenginleştirir.
9. Ekran kademeli dolar; her pazar bitince kendi bölümü güncellenir.

### 4.3 Kümeleme ve güven skoru

Her aday eşleşme için üç sinyal:

- **Görsel:** CLIP kosinüs benzerliği ve pHash Hamming mesafesi. Ana görselle birlikte
  galeri görselleri de karşılaştırılır; en yüksek değer alınır.
- **Metin:** Başlık, çevrilmiş başlık ve çıkarılan model numarası, marka, boyut, malzeme
  özellikleri. Model numarası eşleşmesi güçlü sinyaldir.
- **Yapısal:** Fiyat aralığının mantıklı olması (aynı ürünün perakende fiyatının fabrika
  fiyatının altında olması şüphelidir), kategori uyumu.

Skor ağırlıklı toplamdır ve kalibre edilir (bkz. bölüm 7). Eşikler:

| Güven | Gösterim |
|---|---|
| 0.85 ve üstü | "Aynı ürün", ana sonuç |
| 0.60 ile 0.85 | "Büyük olasılıkla aynı", ana sonuçta işaretli |
| 0.35 ile 0.60 | "Benzer olabilir", ayrı bölüm |
| 0.35 altı | Gösterilmez |

### 4.4 Yerel veri modeli

```
Product            kanonik ürün (parmak izi, kanonik başlık, kategori)
Listing            pazar başına ilan (platform, url, başlık, görseller, fiyat kademeleri, MOQ, stok, satış, puan, güncellenme)
Supplier           tedarikçi (platform, ad, konum, yıl, etiketler, tekrar alım, yanıt süresi)
SupplierIdentity   aynı tedarikçinin farklı pazarlardaki mağazaları
Match              Product ile Listing arası eşleşme (skor, sinyaller, açıklama)
Search             bir arama oturumu (giriş, pazarlar, zaman, durum)
Project            kullanıcı çalışma alanı (aramalar, notlar, karar)
CostScenario       adet, hedef ülke, kargo seçeneği, hesaplanan kalemler
CountryProfile     vergi tablosu, de minimis, kargo seçenekleri, kaynak ve tarih
Watch              izlenen listing ve son fiyat
AdapterHealth      adapter başına son başarı, hata sayısı, versiyon
```

Tüm kayıtlar yerelde; dışa aktarma ve yedekleme JSON olarak tek dosya.

### 4.5 Teknik yığın

| Katman | Seçim | Neden |
|---|---|---|
| Uygulama | React + TypeScript + Vite | Hızlı, eklentiyle aynı dil, statik dosya olarak dağıtılır |
| Arayüz | Tailwind + shadcn/ui + Radix | Erişilebilir, yoğun veri arayüzüne uygun |
| Durum | TanStack Query + Zustand | Kademeli dolan sonuçlar için uygun |
| Tablo | TanStack Table | Sıralama, sütun seçimi, sanal kaydırma |
| Yerel veri | Dexie (IndexedDB) | Vektör ve kayıtlar için yeterli; masaüstünde SQLite'a geçilebilir |
| Görsel ML | transformers.js, CLIP küçük model, WebGPU/WASM | Tarayıcıda, ücretsiz |
| Eklenti | WXT veya Plasmo, Manifest V3 | Çoklu tarayıcı, TypeScript |
| Masaüstü (sonra) | Tauri | Hafif, SQLite, yerel dosya erişimi |
| Çeviri | Tarayıcıda küçük çeviri modeli; isteğe bağlı kullanıcı API anahtarı | Sıfır maliyet, yükseltilebilir |
| Test | Vitest, Playwright, altın veri seti | Bkz. bölüm 7 |
| Monorepo | pnpm workspaces | apps/web, apps/extension, packages/core, packages/adapters |

---

## 5. Pazar kapsamı ve ülkeler

Her pazar bir adapter'dır (bkz. docs/ADAPTER_SPEC.md). Öncelik sırası:

**Dalga 1, çekirdek:** 1688, Taobao, Pinduoduo, Trendyol (hedef pazar karşılaştırması).

**Dalga 2, Çin genişleme:** Alibaba.com, AliExpress, DHgate, Yiwugo, Made-in-China.

**Dalga 3, diğer üretici ülkeler:** IndiaMART, TradeIndia (Hindistan); Tokopedia, Shopee (Endonezya);
Lazada (Tayland, Vietnam); Rakuten, Mercari (Japonya); Coupang, Gmarket (Kore).

**Dalga 4, hedef pazarlar:** Hepsiburada, n11 (Türkiye); Amazon ülke siteleri, eBay (Avrupa, ABD);
Noon (Orta Doğu); Ozon, Wildberries (Rusya); Temu, Walmart (ABD).

**Ülke profilleri:** Türkiye, Almanya, Hollanda, Birleşik Krallık, BAE, ABD, Polonya, Romanya ile
başlanır. Her profil tarihli ve kaynaklı; kullanıcı kendi oranlarını girebilir.

---

## 6. Ekranlar

1. **Başlangıç:** Büyük arama alanı (görsel, link, metin), son aramalar, projeler, pazar oturum durumu.
2. **Arama sonuçları:** Üstte giriş özeti ve pazar ilerleme şeridi. Solda filtreler (pazar, fiyat,
   MOQ, doğrulama, konum, güven). Ortada küme kartları. Sağda seçili küme için hızlı maliyet paneli.
3. **Küme detayı:** Tüm listingler karşılaştırma tablosunda; fiyat merdiveni; fiyat zinciri;
   tedarikçi kartları; "neden eşleşti" açıklamaları; gerçek linkler.
4. **Tedarikçi profili:** Mağazalar, ürün grupları, etiketler, risk özeti, iletişim taslağı.
5. **Maliyet senaryosu:** Adet, ülke, kargo; kalem kalem maliyet; marj; çok ülke karşılaştırma.
6. **Proje:** Aramalar, notlar, karar, dışa aktarma.
7. **Toplu araştırma:** Yükleme, ilerleme, sonuç tablosu.
8. **Ayarlar:** Pazarlar, ülke profilleri, para birimi, dil, ağırlıklar, çeviri sağlayıcı, yedekleme.
9. **Eklenti açılır penceresi:** Oturum durumu, adapter sağlığı, hızlı arama, overlay ayarı.

---

## 7. "Herhangi bir ürünü hatasız bulma" kalite sistemi

Bu hedef bir vaat değil bir ölçüm programıdır.

### 7.1 Altın veri seti

- En az 300 ürünlük test seti: kategori çeşitliliği (elektronik, tekstil, ev, oyuncak, kozmetik,
  otomotiv parça, hobi), zorluk çeşitliliği (markalı, markasız, jenerik, varyantlı).
- Her ürün için doğrulanmış "aynı ürün" listingleri ve "benzer ama farklı" tuzaklar elle işaretlenir.
- Set repoda tutulur, her sürümde çalışır.

### 7.2 Ölçütler

| Ölçüt | Hedef |
|---|---|
| Doğruluk (ana sonuçta yanlış ürün oranı) | %3 altı |
| Kapsama (gerçek eşleşmelerden bulunan oranı) | %85 üstü |
| Bulunamadı dürüstlüğü (eşleşme yokken boş dönme oranı) | %95 üstü |
| Adapter başarı oranı (hatasız tamamlanan arama) | %97 üstü |
| İlk sonuç süresi | 8 saniye altı |

### 7.3 Kalibrasyon

Güven skoru altın veri setinde kalibre edilir: skor 0.85 diyorsa gerçekten yüz eşleşmeden
seksen beşi doğru olmalı. Eşikler bu kalibrasyona göre ayarlanır, elle değil.

### 7.4 Adapter dayanıklılığı

- Her adapter için sabit HTML örnekleri (fixture) ve ayrıştırma testleri.
- Canlı duman testi: her gün bir kez bilinen bir ürün aranır; başarısızsa uyarı.
- Seçici kırılınca kullanıcıya "pazar güncellendi, düzeltme yolda" mesajı; uygulama çökmez.
- Adapter'lar sürümlüdür ve uygulamadan bağımsız güncellenebilir.

### 7.5 Kullanıcı geri bildirimi

Her eşleşmede "doğru / yanlış" düğmesi. Yanlış işaretler yerel kalibrasyonu besler ve anonim,
isteğe bağlı olarak altın veri setine aday olur.

---

## 8. Güvenlik, gizlilik, hukuk

- Kullanıcı hesap bilgileri uygulamaya asla girmez; eklenti sadece tarayıcının mevcut oturumunu kullanır.
- Hiçbir veri sunucuya gitmez. Yedekleme kullanıcı tarafından dışa aktarılır.
- Pazar sayfalarının tam kopyası saklanmaz; sadece normalize alanlar ve küçük görsel önizlemeleri.
- Pazar başına nazik hız sınırı; kullanıcı hesabını riske atmayan tempo.
- Her listing orijinal kaynağa link verir; içerik yeniden yayınlanmaz.
- Açık lisans, açık kaynak adapter'lar; topluluk katkısı için sözleşme.

---

## 9. Riskler ve karşılıklar

| Risk | Karşılık |
|---|---|
| Pazar HTML değişikliği adapter'ı kırar | Fixture testleri, günlük duman testi, sürümlü adapter, kibar hata |
| Görselle arama sonuçları zayıf çıkar | Metin aramayla birleşik sorgu, galeri görselleri, bölge seçimi |
| Tarayıcıda CLIP yavaş | Küçük model, WebGPU, önbellek, ilk çalıştırmada model indirme göstergesi |
| Çeviri kalitesi düşük | Küçük model varsayılan, kullanıcı anahtarıyla yükseltme |
| Kullanıcı eklenti kurmak istemez | Link ve metinle sınırlı "eklentisiz mod"; değer gösterilip kurulum istenir |
| Vergi tabloları eskir | Tarihli, kaynaklı, kullanıcı düzenlenebilir profiller |

---

## 10. Repo yapısı

```
apps/
  web/              React arayüzü
  extension/        Tarayıcı eklentisi
packages/
  core/             parmak izi, kümeleme, güven, maliyet motoru, veri modeli
  adapters/         pazar adapter'ları, her biri kendi klasöründe
  country-profiles/ ülke vergi ve kargo tabloları (JSON, tarihli)
  ui/               paylaşılan arayüz bileşenleri ve tasarım sistemi
  golden/           altın veri seti ve kalibrasyon araçları
docs/               bu belgeler
```

Tanım: "Bitti" = kabul kriterleri otomatik testle geçer, altın veri seti ölçütleri hedefin
altına düşmemiştir, tasarım sistemi kontrol listesi tamamdır.
