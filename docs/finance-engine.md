# NivaDesk Finance Engine — specification

Karar: `NivaDesk_Urun_Kararlari_20260903.md` §2. Bulgular: `docs/finance-engine-findings.md`.
Bu doküman motorun sözleşmesidir. Dört platform da bu sonucu GÖSTERİR, kendi hesabını yapmaz.

---

## 0. Bugün ne var (survey, koddan okundu)

Aynı sipariş için **beş ayrı kâr tanımı** ve özel tutar toplamada **dört ayrı kural** var.

### Kâr

| Nerede | Formül |
|---|---|
| `finance.ts orderGrossMargin` (web araç çubuğu) | satış − alış − komisyon − kargo |
| `finance.ts adjustedDashboardNetProfit` (web pano) | satış − alış(showBaseCost) − giderler − komisyon − kargo − KDV |
| `Siparis.netKar` (Swift) | komisyon ve kargodan sonra durur; gider ve KDV yok |
| `OrderProfit.adjustedNetProfit` (Swift pano) | web panosuyla aynı şekil |
| `StudioModels.netProfit` (Android, Home) | sipariş değeri − alış − komisyon − kargo − KDV; **giderleri hiç saymaz** |

### Özel tutar toplama (`financialRemaining::` / `financialExpense::`)

| Nerede | Hangi anahtarlar sayılır | Negatif |
|---|---|---|
| Sunucu `orderCustomFinancialTotal` | siparişin kendi başlık listesi varsa onlar, yoksa **tüm anahtarlar** | **0'a kırpılır** |
| Web `orderCustomRemainingTotal` (ayarsız) | kendi listesi varsa onlar, yoksa **tüm anahtarlar** | korunur |
| Web `customPendingTotal` (ayarlı) | kendi listesi varsa onlar, yoksa **workspace şablonu** | korunur |
| Swift `OrderProfit.customExpenseTotal` | kendi listesi varsa onlar, yoksa **workspace şablonu** | korunur |
| Android `customRemainingTotal` | **her zaman tüm anahtarlar** | korunur |

### Diğerleri

- **Base cost**: sunucu her zaman düşer; web ve Swift `showBaseCost` kapalıyken **düşmez**; Android `netProfit` her zaman düşer ama panosu `showBaseCost`'a uyar.
- **KDV**: tek kural, brütten çıkarma — `gross × rate / (100 + rate)`, 2 haneye yuvarlanır. Doğru ve kararla uyumlu.
- **Profit vergi tipi**: marjdan komisyon, kargo ve özel giderleri de düşer. Kararın Margin Scheme'i yalnızca alış fiyatını düşer.
- **İade**: `refundedAmount` alan olarak var, ama **hiçbir platform kârdan düşmüyor**. Karar düşülmesini istiyor.

---

## 1. Sözlük

Motor bir siparişi ve çalışma alanı ayarlarını alır, aşağıdaki büyüklükleri üretir.
Girdi olan alanlar kullanıcının/entegrasyonun yazdığıdır; türetilmiş olanlar yalnız motorun.

### Girdi alanları (motor asla üzerine yazmaz)

| Alan | Anlamı |
|---|---|
| `paidAmount` | tahsil edilmiş tutar |
| `remainingAmount` | klasik kalan alacak |
| `customFields["financialRemaining::<başlık>"]` | ek alacak satırları |
| `watchPurchasePrice` | **Base Cost** — malın alış fiyatı |
| `customFields["financialExpense::<başlık>"]` | ek gider satırları |
| `deliveryCost` | kargo |
| `taxRate` | siparişe uygulanan KDV oranı (%) |
| `taxType` | siparişin KDV yöntemi override'ı (boşsa çalışma alanı varsayılanı) |
| `refundedAmount` | iade edilmiş tutar |
| `lineItems[]` | fatura kalemleri (varsa TOPLAM bunlardan gelir, bkz. §4) |

### Türetilmiş alanlar (yalnız motor yazar, `order.finance` bloğu)

| Alan | Tanım |
|---|---|
| `revenue` | §3 |
| `directCost` | base cost |
| `grossMargin` | `revenue − directCost` |
| `platformFee` | `revenue × feePercentage / 100` |
| `otherExpenses` | özel gider satırlarının toplamı |
| `vatBase` | KDV'nin hesaplandığı taban, yönteme göre |
| `vatDue` | `vatBase × taxRate / (100 + taxRate)` |
| `netProfit` | §5 |
| `method` | uygulanan KDV yöntemi |
| `computedAtMs`, `engineVersion` | damga |

---

## 2. Ayarlar

### Bugün var olanlar (korunur)

`seciliParaBirimi`, `seciliOndalik`, `feePercentage` (varsayılan 3), `defaultTaxRate` (varsayılan 20),
`taxCalculationType` (`Revenue` | `Profit`), `taxMilestoneEnabled` + `taxMilestoneDate`,
`corporationTaxEnabled` + `corporationTaxRate`, `taxRuleNameRevenue`, `taxRuleNameProfit`.

### Yeni (kararın istediği)

| Ayar | Değerler | Varsayılan | Neden |
|---|---|---|---|
| `vatRegistered` | true / false | **true** | KDV mükellefi değilse `vatDue` her zaman 0 |
| `pricesIncludeVat` | true / false | **true** | bugünkü davranış inclusive; exclusive için §6 |
| `vatMethod` | `standard` \| `margin` \| `none` | `taxCalculationType`'dan türetilir | kararın üç yöntemi |

`taxCalculationType` → `vatMethod` eşlemesi: `Revenue` → `standard`, `Profit` → `margin`.
Eski alan okunmaya devam eder, yeni alan yazılır. Sipariş bazında override: `taxType`
(`Revenue`/`Profit`/`Standard`/`Margin`/`None` kabul edilir, normalize edilir).

---

## 3. Revenue

```
revenue = paidAmount + remainingAmount + Σ financialRemaining::*
```

**Karar (motorun kuralı): saklanan HER `financialRemaining::` anahtarı sayılır.**
Başlık listesi yalnızca sıralamayı ve etiketi belirler, tutarın sayılıp sayılmayacağını belirlemez.

Gerekçe: tutarı kullanıcı yazdı. Başlık listesinden düşmüş bir anahtarı toplamdan sessizce
çıkarmak parayı kaybetmek olur, ve bugün beş katmandan üçü zaten böyle sayıyor. Listede
olmayan anahtarlar `finance.orphanKeys` içinde bildirilir, arayüz bunları "başlıksız tutar"
olarak gösterebilir. Sessiz kayıp yok.

`lineItems` doluysa revenue **kalemlerden** gelir (bkz. §4).

---

## 4. Fatura kalemleri

Sipariş kalem taşıyorsa fatura TOPLAMI kalemlerin toplamıdır (mevcut kural, `invoice-line-items-only`).
Motor bunu korur:

```
lineItemsTotal = Σ lineItems[].lineTotal
revenue = lineItems boş ? (paid + remaining + Σ remaining::) : lineItemsTotal
```

---

## 5. Kâr

```
directCost   = watchPurchasePrice                     // showBaseCost'a BAKMAZ
grossMargin  = revenue − directCost
otherExpenses = Σ financialExpense::*
platformFee  = round2(revenue × feePercentage / 100)

netProfit = revenue
          − vatDue
          − directCost
          − platformFee
          − deliveryCost
          − otherExpenses
          − refundedAmount
```

**`financialShowBaseCost` yalnızca arayüz ayarıdır.** Motor onu hiç okumaz. Karar bunu
açıkça söylüyor: görünürlük muhasebeyi değiştirmez.

**`refundedAmount` kârdan düşülür.** Bugün hiçbir platform düşmüyor; karar düşülmesini istiyor.

---

## 6. KDV

```
vatDue = vatRegistered && rate > 0 ? round2(vatBase × rate / (100 + rate)) : 0
```

`vatBase`, yönteme göre:

| Yöntem | `vatBase` |
|---|---|
| `standard` | `revenue` |
| `margin` | `max(revenue − directCost, 0)` |
| `none` | 0 |

**`margin` yalnızca alış fiyatını düşer.** Komisyon, kargo ve özel giderler marjdan
düşmez — UK ikinci-el marj rejimi böyle ve karar da öyle diyor. Bugünkü `Profit` tipi
bunları da düşüyor, yani KDV'yi olduğundan az hesaplıyor; motor bunu düzeltir.

Kararın örneği: alış 1500, satış 2000 → marj 500 → `500 × 20/120 = 83,33`. ✔

`pricesIncludeVat = false` olduğunda fiyat KDV hariç girilmiştir, dolayısıyla:

```
vatDue = round2(vatBase × rate / 100)
```

ve müşterinin ödeyeceği toplam `revenue + vatDue` olur. Varsayılan `true` olduğu için
bu yol bugünkü hiçbir çalışma alanını değiştirmez.

`taxMilestoneEnabled` ise sipariş tarihi milestone'dan önceyse eski oran, sonraysa yeni
oran uygulanır (mevcut `financialTaxTypeForPaymentDate` mantığı korunur).

---

## 7. İşaret ve yuvarlama

- Saklanan her tutar **tam hassasiyetle** okunur; ara toplamlarda yuvarlama yok.
- **Negatif tutarlar korunur.** Negatif gider bir alacak, negatif alacak bir indirimdir.
  Bugün sunucu bunları 0'a kırpıyor (`roundMoneyValue` ≤0 → 0) ve istemciler kırpmıyor;
  motor kırpmaz. Kırpma parayı sessizce değiştiriyordu.
- Yuvarlama **yalnızca çıktıda**, her büyüklük için bir kez, 2 haneye (half-up).
- `vatBase` marj yönteminde negatifse 0'dır: zararına satışta iade edilecek KDV doğmaz.

---

## 8. Motor nerede yaşar, sonuç nasıl dağılır

**Kaynak:** `functions/finance/engine.js` — saf, I/O'suz modül. Girdi: `(order, settings)`.
Çıktı: `finance` bloğu. Firestore, Firebase, tarih saati bilmez; test edilebilir.

**Dağıtım:** sunucu bir siparişi her yazdığında `order.finance` bloğunu damgalar.
İstemciler o bloğu **okur**, hesaplamaz:

- Pano, Home, araç çubuğu, raporlar, CSV: `order.finance.*` toplar.
- Sipariş detayı: `order.finance.*` gösterir.
- Kullanıcı yazarken istemci iyimser bir önizleme gösterebilir; bu önizleme motorun
  aynası olmalı ve yazım tamamlanınca sunucunun değeriyle değiştirilmelidir.

**Aynaların dürüst kalması:** `functions/test/finance/vectors.json` altın vektörlerdir.
Sunucu testi bu vektörleri motora karşı koşar; her platformun aynası da aynı vektörleri
kendi testinde koşar. Bir platform sapınca test kırılır, kullanıcı değil.

---

## 9. Geçiş

Kullanıcı kararı (3 Eyl 2026): **tüm siparişler yeni sisteme uyarlanır**, geçmiş dondurulmaz.
Muhasebeciye bu sistemden veri gönderilmemiş.

1. Motor + vektörler + test.
2. Sunucu yazma yollarına damga.
3. Tüm siparişler için toplu yeniden hesaplama (mevcut `financeBulkRuns` altyapısı).
4. İstemciler damgalanmış bloğu okumaya geçer; kendi formülleri silinir.
5. Donmuş `estimateRecords`'a **DOKUNULMAZ** — `documentSha256` bozulursa bekleyen
   onay linkleri geçersiz olur (bkz. `vat-inclusive-fix` notu).

Beklenen etki: `margin` yöntemindeki siparişlerin KDV'si **artar** (bugün fazladan
düşülüyordu), `refundedAmount` taşıyan siparişlerin net kârı **azalır**, `showBaseCost`
kapalı çalışma alanlarında net kâr **azalır** (base cost artık her zaman düşülüyor).

---

## 10. Sürüm

`engineVersion: 2`. Sürüm 2 bloğa `receivablesTotal` ekledi. Süpürme işi bitirdiği sürümü
kaydeder, sürüm artınca yürüyüşe yeniden başlar — yani formül değişikliği bir migration
script'i değil, bir deploy.

---

## 11. Ne kuruldu (3 Eyl 2026)

| Parça | Yer | Test |
|---|---|---|
| Motor (saf) | `functions/finance/engine.js` | 19 vektör + 12 kural |
| Altın vektörler | `functions/finance/vectors.json` | dört uygulamanın ortak sözleşmesi |
| Damga (tetikleyici) | `functions/finance/stamp.js` | 16 birim + 8 gerçek Firestore |
| Toplu iş + süpürme | aynı dosya | süpürme sonlanıyor, sonra boşta |
| Web aynası | `studioflow-web/lib/studioflow/financeEngine.ts` | `npm run test:finance` |
| Swift aynası | `EGGcraft/FinanceEngine.swift` (+ `FinanceEngineBridge.swift`) | `scripts/check-finance-vectors-swift.sh` |
| Kotlin aynası | `.../finance/FinanceEngine.kt` | `FinanceEngineVectorsTest` |

**Motoru okuyanlar.** Web: `finance.ts` içindeki her yardımcı (36 çağrı yeri dokunulmadı) +
müşteriler yükleyicisi. Swift: `Siparis.netKar`/`brutMarj`/`customRemainingTotal`,
`OrderProfit`'in üçü, sipariş detayının `financeBlock`'u ve `otomatikKesintiHesapla`.
Kotlin: `StudioModels.netProfit`/`grossMargin`/`customRemainingTotal`.

**Ayarlar.** Üç yeni ayar sunucuda saklanıyor, kurallarda vergi oranıyla aynı kapıda ve
web'de arayüzü var. **Mac ve Android'de arayüzü henüz yok** — motor onları okuyor, sadece
oradan değiştirilemiyor.

**Canlıda:** kurallar, 12 fonksiyon (motor + damga + süpürme + finans ayarları + sipariş
yazıcıları), web Round 156.
