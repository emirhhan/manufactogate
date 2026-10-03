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

## Durum

Sprint 0 tamamlandı: monorepo, çekirdek motor, sahte adapter'lar, web uygulaması ve
eklenti iskeleti. Web uygulaması e-ticaret görünümünde bir ürün feed'i sunar: 22 ana grup,
430 kategori, 3.800'den fazla ürün, sayfa başına 30 ürün, kategori ve metin araması, ürün
sayfasında fiyat zinciri ve Türkiye'ye indirilmiş maliyet.

Sprint 1-4: dört pazar için gerçek adapter'lar (1688, Taobao, Pinduoduo, Trendyol) gerçek
sayfalarla kalibre edildi. Aramalar eklenti üzerinden kullanıcının kendi oturumuyla çalışır.
Gerçek ürün sayfası, pazarlar arası karşılaştırma, Türkiye'ye indirilmiş maliyet, projeler,
izleme listesi, CSV dışa aktarma ve Türkçe → Çince sorgu yerelleştirme hazır.
Durum tablosu [docs/ROADMAP.md](docs/ROADMAP.md), kalibrasyon [docs/CALIBRATION.md](docs/CALIBRATION.md).

## Repo yapısı

```
apps/web                  React arayüzü (Vite, Tailwind)
apps/extension            Tarayıcı eklentisi (Manifest V3)
packages/core             veri modeli, adapter arayüzü, pHash, kümeleme, güven skoru, maliyet motoru, orkestratör
packages/adapters         pazar adapter'ları, kayıt defteri, etiket sözlüğü (şimdilik sahte)
packages/country-profiles ülke vergi ve kargo profilleri (TR, DE)
docs/                     plan belgeleri
```

## Geliştirme

Gereksinimler: Node 22, pnpm 10.

```bash
pnpm install
pnpm dev          # web: http://localhost:5173
pnpm test         # birim testleri
pnpm typecheck
pnpm lint
pnpm build        # web ve eklenti derlemesi
```

Eklentiyi yüklemek için: `pnpm build` sonrası Chrome'da `chrome://extensions`, "Geliştirici modu",
"Paketlenmemiş öğe yükle" ile `apps/extension/dist` klasörünü seç. Web uygulaması açıkken üst
çubukta "Gerçek veri · eklenti" görünür; eklenti yoksa uygulama sahte veri modunda çalışır.
Ayarlar sayfasından veri kaynağı elle seçilebilir ve pazar sağlık kontrolü çalıştırılabilir.
