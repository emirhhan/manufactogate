# Pazar Adapter Sözleşmesi

Her pazar bir adapter'dır. Adapter, bir pazarın arama ve ürün sayfalarını okuyup
Manufactogate'in ortak veri modeline çevirir. Çekirdek motor hiçbir pazarı tanımaz;
sadece bu sözleşmeyi tanır.

## 1. Adapter'ın sorumlulukları

1. **Kimlik:** pazar kimliği, ülke, para birimi, dil, desteklenen giriş türleri.
2. **Oturum:** kullanıcının giriş yapıp yapmadığını tespit etmek; giriş sayfasına yönlendirmek.
3. **Arama:** görselle, metinle veya link ile arama başlatmak ve sonuç listesini ayrıştırmak.
4. **Ürün detayı:** ürün sayfasından fiyat kademeleri, MOQ, varyantlar, galeri, tedarikçi bilgisi çıkarmak.
5. **Tedarikçi profili:** mağaza sayfasından etiketler, yıl, konum, tekrar alım oranı çıkarmak.
6. **Link çözme:** bir URL'nin bu pazara ait olup olmadığını ve ürün kimliğini tespit etmek.
7. **Sağlık:** kendi seçicilerinin hâlâ çalıştığını doğrulayan duman testi.

## 2. Arayüz

```ts
interface MarketAdapter {
  id: MarketId;                       // "cn-1688", "cn-taobao", "cn-pinduoduo", "tr-trendyol"
  meta: {
    name: string;
    country: CountryCode;
    currency: CurrencyCode;
    language: LanguageCode;
    role: "source" | "target" | "both";  // tedarik pazarı mı, satış pazarı mı
    capabilities: {
      imageSearch: boolean;
      textSearch: boolean;
      linkResolve: boolean;
      supplierProfile: boolean;
      priceTiers: boolean;
    };
    rateLimit: { minIntervalMs: number; maxPerHour: number };
    version: string;                  // adapter sürümü, uygulamadan bağımsız
  };

  session(): Promise<SessionState>;   // "logged-in" | "logged-out" | "captcha" | "unknown"
  resolveLink(url: string): LinkInfo | null;

  searchByImage(input: ImageInput, opts: SearchOptions): AsyncIterable<RawListing>;
  searchByText(query: string, opts: SearchOptions): AsyncIterable<RawListing>;

  fetchListing(id: string): Promise<RawListingDetail>;
  fetchSupplier(id: string): Promise<RawSupplier>;

  healthCheck(): Promise<HealthResult>;
}
```

`AsyncIterable` kullanılır çünkü sonuçlar sayfa sayfa gelir ve arayüz kademeli dolar.

## 3. Normalize kayıtlar

```ts
interface RawListing {
  market: MarketId;
  id: string;
  url: string;                        // her zaman gerçek ürün sayfası
  title: string;                      // orijinal dil
  images: string[];                   // ana görsel ilk sırada
  price: PriceInfo;                   // tek fiyat veya kademeler
  moq?: number;
  sold?: number;                      // satış adedi veya "30 günde satılan"
  rating?: number;
  supplierId?: string;
  supplierName?: string;
  location?: string;
  badges: string[];                   // pazarın kendi etiketleri, ham haliyle
  fetchedAt: string;                  // ISO zaman
}

interface PriceInfo {
  currency: CurrencyCode;
  tiers: { minQty: number; unitPrice: number }[];   // tek fiyat için tek kademe
}

interface RawSupplier {
  market: MarketId;
  id: string;
  url: string;
  name: string;
  location?: string;
  yearsOnPlatform?: number;
  badges: string[];                   // "源头工厂", "深度验厂", "实地认证", "实力商家" gibi
  repeatPurchaseRate?: number;
  responseRate?: number;
  responseTime?: string;
  mainCategories?: string[];
  businessType?: "factory" | "trading" | "unknown";   // pazar bunu söylüyorsa
}
```

Çekirdek motor `badges` dizisini adapter başına bir sözlükle anlamlandırır:
1688'in "源头工厂" etiketi "verified-factory" normalize etiketine, Alibaba.com'un
"Verified Supplier" etiketi "verified-supplier" etiketine gider.

## 4. Hata sözleşmesi

Adapter asla sessizce boş dönmez. Her hata tiplidir:

| Tip | Anlamı | Arayüz davranışı |
|---|---|---|
| `LoggedOut` | Oturum yok | "Giriş yap" düğmesi, pazar sayfasına yönlendirme |
| `Captcha` | Doğrulama istendi | "Doğrulamayı tamamla, sonra yeniden dene" |
| `SelectorBroken` | Sayfa yapısı değişti | "Pazar güncellendi, adapter düzeltme bekliyor" ve sağlık kaydı |
| `RateLimited` | Çok hızlı istek | Otomatik bekleme ve yeniden deneme |
| `NotFound` | Ürün/link yok | Normal boş sonuç |
| `Network` | Ağ hatası | Yeniden deneme |

## 5. Test zorunlulukları

Her adapter klasöründe:

- `fixtures/` : gerçek sayfalardan alınmış, kişisel veri temizlenmiş HTML örnekleri
  (arama sonucu, ürün detayı, mağaza sayfası, giriş yapılmamış hâl, captcha hâli).
- `parse.test.ts` : her fixture için ayrıştırma testi; alan alan beklenen değerler.
- `smoke.ts` : canlı duman testi; bilinen bir ürünü arar, en az bir sonuç bekler.
- `README.md` : pazarın özellikleri, bilinen kısıtlar, seçici notları.

Adapter ayrıştırma testleri geçmeden ana dala giremez.

## 6. Yeni pazar ekleme kontrol listesi

1. `packages/adapters/<country>-<market>/` klasörü aç.
2. `meta` doldur, `resolveLink` yaz, fixture topla.
3. Arama ve detay ayrıştırıcılarını yaz, testleri geçir.
4. Etiket sözlüğünü ekle.
5. Hız sınırını pazarın gerçek davranışına göre belirle.
6. Duman testini çalıştır, sağlık kaydını doğrula.
7. Ülke profili yoksa `packages/country-profiles/` altına ekle.

## 7. Dalga 1 adapter notları

**1688:** Görselle arama kullanıcının oturumuyla çalışır. Fiyat kademeleri ve MOQ ürün
sayfasında. Etiketler: 源头工厂, 深度验厂, 实地认证, 实力商家, 跨境专供. Mağaza sayfasında
tekrar alım oranı ve yıl bilgisi var.

**Taobao:** Perakende pazar. Görselle arama var. Satış adedi ve mağaza puanı ayrıştırılır.
Tmall mağazaları aynı adapter altında işaretlenir.

**Pinduoduo:** Mobil odaklı; web sürümü sınırlı. Görselle arama uygulamada güçlü, web'de
kısıtlı; metin arama ve link çözme ile başlanır, görsel arama kapasitesi ayrıca değerlendirilir.

**Trendyol:** Hedef pazar. Ürün sayfası, fiyat, satıcı sayısı, yorum sayısı ayrıştırılır.
Link yapıştırma ana giriş yoludur. Komisyon oranları ülke profiline bağlanır.
