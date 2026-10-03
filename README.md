# Manufactogate

Tek ekrandan çok pazarlı ticari ürün araştırma platformu.

Bir ürünün görselini, adını veya linkini verirsin; Manufactogate aynı ürünü 1688, Taobao,
Pinduoduo ve diğer ülkelerin pazaryerlerinde bulur, tedarikçileri doğrular, hedef ülkeye
indirilmiş maliyeti hesaplar ve en uygun kaynağı tek bir karşılaştırma ekranında gösterir.

Sunucu yok, API ücreti yok: aramalar tarayıcı eklentisi üzerinden kullanıcının kendi
oturumuyla çalışır, veriler kullanıcının makinesinde kalır.

## Belgeler

- Ürün planı ve mimari: [docs/PLAN.md](docs/PLAN.md)
- Pazar adapter sözleşmesi: [docs/ADAPTER_SPEC.md](docs/ADAPTER_SPEC.md)
- Tasarım sistemi: [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md)
- Yol haritası: [docs/ROADMAP.md](docs/ROADMAP.md)
- Adapter kalibrasyonu: [docs/CALIBRATION.md](docs/CALIBRATION.md)
- Plan ile gerçek durum: [docs/STATUS.md](docs/STATUS.md)

## Durum

Sprint 0–4f tamamlandı (ayrıntı: [docs/STATUS.md](docs/STATUS.md)). 33 pazar adapter'ı: 1688, Taobao, Trendyol,
Hepsiburada, Amazon TR, DHgate, Tokopedia, Lazada TH ve eBay kullanıcının tarayıcısında canlı doğrulandı; Pinduoduo ve
14 beta pazar gerçek sayfa fixture'ları ile kalibre; 9 pazar yakalama bekliyor ([docs/CALIBRATION.md](docs/CALIBRATION.md)).
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

## Hızlı başlangıç

Gereksinimler: Node 22, pnpm 10. Sunucu, API anahtarı ve ücretli servis yoktur.

```bash
pnpm install
pnpm --filter @manufactogate/web dev        # web: http://localhost:5173
pnpm --filter @manufactogate/extension build  # eklenti: apps/extension/dist
```

Eklentiyi yüklemek için Chrome'da `chrome://extensions` → "Geliştirici modu" → "Paketlenmemiş öğe yükle" →
`apps/extension/dist`. Eklenti, uygulamayı `http://localhost:5173` ve `http://127.0.0.1:5173` (geliştirme) ile
`:4173` (`pnpm --filter @manufactogate/web preview`) adreslerinde tanır; başka bir köken kullanılacaksa açılır
pencerede "Uygulama adresi" değiştirilir. Web uygulaması açıkken üst çubukta "Gerçek veri · eklenti" görünür;
eklenti yoksa uygulama sahte veri modunda çalışır. Ayarlar sayfasından veri kaynağı elle seçilebilir, pazar
sağlık turu çalıştırılabilir (33 pazar ≈ 2–4 dk) ve ülke oranları düzenlenebilir.

İlk kullanım: hedeflenen pazarlara (1688, Taobao, Trendyol…) tarayıcıda giriş yap; eklenti oturumu algılar ve
uygulamadaki pazar haritasını kendiliğinden yeniler.

## Geliştirme ve doğrulama

```bash
pnpm typecheck                                    # tüm paketler
pnpm lint
pnpm vitest run                                   # core, adapters, country-profiles, web (happy-dom + fake-indexeddb)
pnpm vitest run --project web                     # tek proje
pnpm --filter @manufactogate/extension test       # eklenti birim testleri
pnpm --filter @manufactogate/web build            # web derlemesi (preview: port 4173)
pnpm --filter @manufactogate/extension build
PW_CHROMIUM=/path/to/chromium pnpm --filter @manufactogate/extension e2e   # Playwright; 5173 portu boş olmalı
```

Eklenti e2e testi yerel bir sahte pazar sunucusu (`apps/extension/e2e/server.mjs`) ile 5173 portunu kullanır;
çalışan bir dev sunucusu varsa önce kapatılmalıdır. Gerçek pazar sayfaları yalnız kullanıcının tarayıcısında
okunur; seçici kalibrasyonu için [docs/CALIBRATION.md](docs/CALIBRATION.md) bölüm 6'daki yakalama adımları izlenir.
