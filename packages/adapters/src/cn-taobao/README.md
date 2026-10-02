# Taobao / Tmall adapter

- Arama: `s.taobao.com/search?q=&tab=all`. Önce gömülü `g_page_config.mods.itemlist.data.auctions` veya yeni sayfa durumundaki `itemsArray`, yoksa `item.htm?id=` linkleri üzerinden kart sezgisi.
- Görselle arama: aynı arama sayfasındaki kamera simgesine bağlı dosya girişi.
- Detay: `item.taobao.com/item.htm?id=` ve `detail.tmall.com/item.htm?id=`; başlık, fiyat, satış, görseller DOM'dan.
- Etiketler: 天猫, 旗舰店, 金牌卖家, 48小时发货.
- Oturum: login.taobao.com yönlendirmesi "giriş yok"; punish/nocaptcha "doğrulama".

Taobao arama sayfası giriş yapılmamış kullanıcıyı login'e yönlendirir; eklenti bunu "Giriş yok" olarak raporlar.
Seçiciler canlı kalibre edilmedi; fixture yakalama ile güncellenecek.
