# Trendyol adapter

- Arama: `trendyol.com/sr?q=`. Sayfa `window.__SEARCH_APP_INITIAL_STATE__` içinde `products` dizisini gömer: id, name, brand, url, images, price.sellingPrice, ratingScore, merchantId. Yoksa `-p-<id>` linkleri üzerinden kart sezgisi.
- Detay: ürün sayfası `window.__PRODUCT_DETAIL_APP_INITIAL_STATE__.product` gömer: fiyat, satıcı, görseller, özellikler, puan.
- Satış sinyali olarak değerlendirme sayısı kullanılır (Trendyol satış adedini açık vermez).
- Etiketler: Resmi Satıcı, Hızlı Teslimat, Yüksek Puanlı Satıcı.
- Giriş gerekmez; Cloudflare doğrulaması görülürse "doğrulama" raporlanır.
