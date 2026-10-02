# 1688 adapter

- Arama: `s.1688.com/selloffer/offer_search.htm?keywords=`. Önce gömülü `__INIT_DATA` içindeki `offerList`, yoksa `detail.1688.com/offer/<id>.html` linkleri üzerinden kart sezgisi.
- Görselle arama: `s.1688.com/youyuan/index.htm?tab=imageSearch`. Eklenti sayfadaki dosya girişine görseli bırakır, sonuç kartlarını okur.
- Detay: `detail.1688.com/offer/<id>.html`, `window.__INIT_DATA` içinden başlık, fiyat merdiveni (`skuRangePrices`), görseller, firma adı ve konum.
- Etiketler: 源头工厂, 深度验厂, 实地认证, 实力商家, 跨境专供.
- Oturum: login.1688.com yönlendirmesi "giriş yok", punish/nocaptcha "doğrulama".

Seçiciler canlı sayfadan henüz kalibre edilmedi. `fixtures/` altındaki örnekler belgelenmiş yapılara göre
elle yazıldı. Eklentinin "Fixture yakala" düğmesiyle gerçek sayfa alınıp buraya konur, testler güncellenir.
