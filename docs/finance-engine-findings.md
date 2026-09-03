# Finance Engine — doğrudan kaynaktan teyit edilen iki gerçek (3 Eyl 2026)

## 1. KDV fiyatın İÇİNDE (bu doğru ve karara uyuyor)
`functions/index.js:11862 vatFromGrossAmount(gross, rate) = round2(gross * rate / (100 + rate))`
£1.450 %20 → KDV £241,67, alt toplam £1.208,33. Kararın Standard VAT örneği
(£120 × 20/120 = £20) ile birebir aynı. Yasal KDV faturası için gereken de bu.
Test: `functions/test/qa/vat-math.mjs`.

## 2. Bugünkü "Profit" vergi tipi, kararın Margin Scheme'i DEĞİL
Bugün (`functions/index.js:11884`):
    taxableProfit = max(orderValue − watchPurchasePrice − customExpenseTotal
                        − paymentFee − deliveryCost, 0)
    VAT = taxableProfit × rate/(100+rate)

Karar (`NivaDesk_Urun_Kararlari_20260903.md`):
    VATable Margin = Selling Price − Eligible Purchase Price
    VAT Due = Margin × 1/6

Fark: bugünkü kod marjdan komisyonu, kargoyu ve özel giderleri de düşüyor.
Kararın (ve UK ikinci-el marj rejiminin) düştüğü tek şey alış fiyatı.

Örnek — alış 1500, satış 2000, komisyon %3 (60), kargo 20:
    karar:  marj 500        → KDV 83,33
    bugün:  marj 500−60−20  → KDV 70,00

Yani bugünkü kod KDV'yi olduğundan AZ hesaplıyor. Motor kararı uygulayacak;
geçmiş siparişlerin yeniden hesaplanması beyan edilmiş KDV'yi değiştirir —
bu kullanıcının (ve muhasebecisinin) kararı.

## 3. Negatif tutarlar sunucuda sıfırlanıyor
`roundMoneyValue` ≤0 için 0 döner (`index.js:11846`), `parseFinancialAmountValue`
onu kullanır. İstemciler −50'yi olduğu gibi topluyor. Parite #7 bu.

## 4. financialShowBaseCost bir KART AYARI, muhasebe ayarı değil
`blockHeadingSettings` içinde, workspace geneli, varsayılan true
(`index.js:7366`). Karar da bunun yalnızca görünürlük olmasını istiyor.

## 5. Kararın istediği ama BUGÜN OLMAYAN ayarlar
- VAT Registered: Yes/No
- Prices: VAT Inclusive / VAT Exclusive  (bugün her zaman inclusive, sabit)
- Default VAT Method: Standard / Margin Scheme / No VAT  (bugün taxCalculationType Revenue|Profit)
- Sipariş bazında method override
