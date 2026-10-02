# Pinduoduo adapter

- Web erişimi mobil site üzerinden: `mobile.yangkeduo.com`. Giriş yapılmış tarayıcıda sunucu tarafı render edilen sayfa `window.rawData` içinde arama ve ürün verisini taşır.
- Arama: `search_result.html?search_key=`. Önce `rawData` içindeki `goods` listesi, yoksa `goods.html?goods_id=` linkleri üzerinden kart sezgisi.
- Detay: `goods.html?goods_id=`; `rawData.store.initDataObj.goods` içinden ad, fiyat (fen cinsinden, 100'e bölünür), satış, galeri, mağaza.
- Görselle arama web'de yok; uygulama bu pazar için metin ve link aramasını kullanır.
- Risk: Pinduoduo anti-bot kontrolleri web'de sıktır; "风控/安全验证" görülürse "doğrulama" raporlanır ve kullanıcıdan sayfada doğrulamayı tamamlaması istenir.
