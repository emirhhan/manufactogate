# Altın veri seti (PLAN §7.1 / §7.3)

`cases.json`, eşleştirme skorunun (`scoreMatch`) kalibrasyonu için elle etiketlenmiş çiftleri tutar.
Başlıklar gerçek fixture'lardan (Trendyol, 1688, Taobao, Pinduoduo kask aramaları) ve tipik
Amazon/eBay/AliExpress ilanlarından alınmıştır; kişisel veri içermez.

## Biçim

```json
{
  "id": "helmet-ls2-rapid",
  "query": { "title": "LS2 RAPID 2 ...", "altTitles": ["LS2 RAPID 2 头盔", "LS2 RAPID 2 helmet"], "phash": "…16 hex…", "category": "motosiklet-kaski" },
  "candidates": [
    { "title": "LS2 RAPID 2 摩托车头盔", "market": "cn-1688", "label": "same", "phash": "…", "category": "…", "note": "…" }
  ],
  "note": "serbest açıklama"
}
```

- `query.altTitles`: orkestratörün pazar dillerine çevirdiği sorgu basamakları (web `queryLadder`/`localizeQueryLadder` ile üretir).
- `label`: `same` (aynı ürün), `variant` (aynı seri, farklı model/kapasite/renk), `accessory` (ürünün kılıfı, vizörü, filtresi…), `different`.
- `phash`: görsel karşılaştırmayı sınamak için; aynı ürün için aynı değer, farklı ürün için farklı değer verilir.

## Ölçütler (`test/golden.test.ts`)

| Ölçüt | Hedef |
|---|---|
| precision(same) | ≥ 0,90 |
| precision(same + likely), `same`/`variant` doğru sayılır | ≥ 0,80 |
| recall(same) | ≥ 0,70 |
| aksesuar etiketli aday hiçbir zaman `likely` veya üstü | 0 ihlal |
| `different` etiketli aday hiçbir zaman `same` | 0 ihlal |
| kümülatif kalibrasyon: eşik yükseldikçe kesinlik düşmez (tolerans 0,05) | tekdüze |

## Rapor

```
node packages/core/scripts/golden-report.ts
```

Skor dilimlerine göre gözlenen kesinlik tablosunu ve kaçırılan çiftleri (gerekçeleriyle) basar.
Ağırlıklar `packages/core/src/match/score.ts` içinde değiştirildiğinde bu rapor yeniden okunmalıdır.
Yeni vaka eklerken en az bir tuzak (aksesuar veya aynı seriden farklı model) eklenmesi beklenir.
