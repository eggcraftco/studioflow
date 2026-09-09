# Stripe billing hotfix — trial-leak HIGH karar notu (9 Eylül 2026)

Kaynaklar: `docs/security/evidence/stripe-webhook-investigation-2026-09-07.md` (Addendum 6 ve 7),
`functions/stripeBilling.js` (dal: `d0c7f431`; canlı: `0ad2a2aa`), `functions/index.js`,
`functions/test/qa/stripe-invoice-api-drift.test.js`. Bu notta kod değiştirilmedi, deploy yapılmadı.
"Kanıt yok" yazan yerler ölçülmemiş noktalardır; webhook teslimatının 200 dönmesi veya Stripe panelinde
%0 hata görünmesi bu bulgu için kanıt **değildir** (bulgu teslimat değil, uygulama sırası ile ilgilidir).

## 1. Bulgu nedir, gerçek davranışı ve etkisi

**Ne:** Hotfix commit'i `d0c7f431` ("A stale event now decides nothing") ile `applySubscription`,
sırası geçmiş (stale) bir olayda hiçbir şey yazmadan `{ skipped: true, reason: "stale_subscription_event",
workspaceId }` döner (`stripeBilling.js:1199-1207`). `checkout.session.completed` rayında bunu çağıran
`applyCompletedSubscriptionCheckout`, workspace'e "bu workspace 14 günlük denemeyi kullandı" damgasını
(`billingTrialUsedAt`) **yalnız `result.updated` iken** yazar (`:1125-1132`). Fix'ten sonra stale bir
checkout olayı `updated` taşımadığı için damga hiç yazılmaz; fix'ten önce skip sonucu atıldığı için
`{updated:true}` dönüyor ve damga yazılıyordu.

**Etki:** Deneme kapısı üç yerde okunur — Stripe checkout `hasUsedTrial` (`stripeBilling.js:1813-1814`),
`workspaceHasUsedTrial` (`index.js:2268-2270`), Shopify (`index.js:31880`). Kapı **iki koldan** oluşur:
`billingTrialUsedAt` **veya** dolu bir `billingSubscriptionId`. Sızıntının gerçekleşmesi için ikisinin de
boş olması gerekir. Somut senaryo:

1. Workspace'in daha önce yazılmış bir `billingTrialUsedAt`'ı **yok** (signup/otomatik deneme damgası
   `trialGrantAtSignup` `index.js:10258`, otomatik deneme `:2329` ve Shopify `:32029` aynı alanı yazar —
   bu yollardan geçmiş workspace'ler **etkilenmez**);
2. `checkout.session.completed` olayı, aynı aboneliğin daha yeni bir `customer.subscription.*` olayından
   **sonra** teslim edilir (eşit saniye stale sayılmaz; yalnız daha eski `event.created`);
3. abonelik yaşarken `billingSubscriptionId` dolu olduğu için kapı tutar; abonelik **iptal edilip**
   Free'ye düşünce recompute `billingSubscriptionId: ""` yazar (`stripeBilling.js:950`) ve kapının tek
   dayanağı hiç yazılmamış olan `billingTrialUsedAt` kalır;
4. workspace yeniden abone olur → checkout tekrar `trial_period_days = 14` ve kartsız başlangıç verir.

Yani etki **gelir sızıntısı** (bir workspace birden fazla ücretsiz 14 gün alabilir); durum bozulması
değil, kullanıcıya görünür bir hata değil. Nüfus: signup denemesi öncesi açılmış ve damgası olmayan
workspace'ler. Sayısı bu adımda **ölçülmedi** (kanıt yok).

## 2. Canlıda mevcut mu? Gözlenen ve olası etki ayrımı

- **Trial-leak canlıda YOK.** Canlı `stripeWebhook` sürümü 2026-09-06T01:48Z'de deploy edildi ve
  `stripeBilling.js`'in o tarihteki son commit'i `0ad2a2aa`'dır (3 Eylül). Canlı kodda stale checkout
  `{updated:true}` döndüğü için damga yazılır (`0ad2a2aa` satır 1067-1076). Sızıntı **yalnız `d0c7f431`
  deploy edilirse** ortaya çıkar; regresyondur, Addendum 7 bunu açıkça "not a pre-existing bug" olarak
  kaydeder.
- **Canlıda BAŞKA bir HIGH var (Addendum 6):** `customer.subscription.*` rayında stale bir olay, ledger
  satırı korunsa da `storage_addon`/`team_seat_addon` dallarında şirket dokümanını **stale payload'dan
  yazar** ve resolver'a ulaşmadan döner (`0ad2a2aa` 1103-1150: ledger dönüşü atılır, dallar doğrudan
  `workspace.ref.set`). Sonuç: iptal edilmiş depolama eklentisi veya satın alınmış koltuklar geri gelir;
  bir sonraki `invoice.paid` bunu onarmaz ("durable and self-sustaining"). Bu, `ce1fb764` (3 Eylül)
  ile gelen sıralama koruması yüzünden **bugün canlıda mevcuttur**; d0c7f431 bunu düzeltir.
- **Gözlenen etki:** Üretim verisinde bir workspace'in bu yollardan etkilendiğine dair ölçüm bu adımda
  **yapılmadı** (kanıt yok). Ledger'da 30 günde 42 doğrulanmış olay ve 6×200 / 18×400 teslimat vardır;
  400'ler ikinci endpoint'in imza hatasıdır (rapor §"Bottom line"), bulguyla ilgisi yoktur.
- **Olası etki:** canlı add-on geri gelmesi = ücretsiz depolama/koltuk (gelir + kota); trial-leak (yalnız
  fix deploy edilirse) = ikinci ücretsiz 14 gün.

## 3. Dört hotfix commit'i ne düzeltiyor; HIGH içlerinde çözülmüş mü?

| Commit | Ne düzeltir | Trial-leak'e etkisi |
|---|---|---|
| `3b4e1761` | Fatura işleyicileri Stripe'ın artık gönderdiği alanları okur (`invoice.parent.subscription_details.subscription`, `items[].current_period_end`) | yok |
| `1a2aabee` | İşleyiciler gerçek çalıştırılarak kanıtlanır; üç iddia düzeltilir; `applyInvoicePaymentFailed` retrieve hatasında yeniden denenebilir kalır | yok |
| `9a08cda6` | Yenileme kendi tarihini koruyan watermark'ı yükseltir; başarısız retrieve yeniden denenir | yok |
| `d0c7f431` | Stale olay hiçbir şey yazmaz; uygulanan Stripe'ın güncel durumudur (canonical retrieve); dört değişmez tutar (Addendum 7 tablosu) | **regresyonu bu commit üretir** |

**HIGH çözülmedi; açık.** Dört commit dört değişmezi tutar (1218 PASS, exit 0 — 7 Eylül), fakat
`billingTrialUsedAt` damgasını stale yolda düşürür. Test süitinde (`stripe-invoice-api-drift.test.js`,
43 kontrol) `billingTrialUsedAt`'ı adıyla doğrulayan **hiç kontrol yok** — regresyon bu yüzden süitte
görünmez kaldı ve odaklı yeniden incelemede bulundu.

## 4. STOP kararının gerekçesi ve kaldırılma koşulu

Gerekçe: operatörün kapısı "odaklı inceleme yeni bir HIGH/istismar edilebilir doğruluk engeli bulursa
DUR ve raporla; yeni bir onarım/inceleme döngüsüne girme" idi. Addendum 6 (add-on geri gelmesi, canlı)
ve Addendum 7 (trial-leak, regresyon) art arda iki HIGH buldu; ikincisinde durduruldu.

Kaldırılma koşulu — operatörün üç seçeneğinden biri:

- **(A) Dar düzeltmeyi onayla** (§5), davranış testleriyle kanıtla, sonra hotfix'i adıyla deploy et.
- **(B) d0c7f431'i olduğu gibi deploy et**, sızıntıyı bilinçli kabul et (önerilmez).
- **(C) Dondurmayı sürdür**: canlı add-on geri gelme yolu (Addendum 6) ve fatura alan kayması düzeltilmeden
  kalır; onboarding backend wiring de kilitli kalır.

## 5. Beklenen karar ve önerim

**Karar:** `billingTrialUsedAt`'ın "stale olay hiçbir şey yazmaz" değişmezinin **tek istisnası** olarak
tanımlanmasını onaylamak. Bu bir durum alanı değil, tek yönlü (monotonik) bir olgudur: "bu workspace bir
deneme başlattı" geç gelen bir olayla yanlışa dönmez. Addendum 7 bunu "the shape of the right answer,
noted and NOT implemented" diye kaydetmişti; karar operatörün.

**Önerim: (A).** Gerekçe: (i) sızıntı yalnız fix'le doğar, fix olmadan canlıdaki add-on yolu açık kalır;
(ii) düzeltme tek fonksiyonda, ~6 satır; (iii) dört değişmez "durum" için korunur, istisna açıkça adlandırılır
ve testle pinlenir.

## 6. Onboarding backend wiring neden buna bağlı?

Sizin 9 Eylül kararınız: "Stripe billing hotfix kapanmadan `functions/index.js` veya production
lifecycle wiring'e dokunma". Teknik nedeni: `functions/index.js` (34.779 satır) tek deploy birimidir;
hotfix, temiz ana checkout'tan adıyla deploy edilecek. Aynı dosyaya başka dallardan eş zamanlı değişiklik
girmesi (a) hotfix inceleme odağını bulandırır, (b) deploy anında hangi ağacın canlıya gittiğini
belirsizleştirir — `functions-deploy-branch-divergence` notundaki "kör deploy 7 bayat fonksiyon itti"
olayı bunun kaydıdır. `getSetupChecklist` teknik olarak Stripe fonksiyonlarından bağımsızdır; bağ,
paylaşılan dosya ve sıralama kuralıdır, kod bağımlılığı değildir.

## 7. Web Round 168 bu engelden bağımsız mı?

**Evet.** `onboarding-round-168` (yayın deposu `f765d0e`) 12 dosya değiştirir, hepsi `studioflow-web/`
altındadır; sunucu kodu yoktur. Diff'te Stripe/billing/checkout referansı yok; iki `plan`/
`recommendedTrialPlan` satırı sihirbazın **mevcut** deneme-planı cevabını localStorage'dan geri yükler ve
canlıdaki `setTrialPlan` (`nivadesk_trial`, Stripe değil) çağrısını değiştirmez. `getSetupChecklist`
canlı sürümüyle (6 Eylül) konuşur. Deploy'u Stripe hotfix'inin sırasına bağlamak için teknik bir neden yok;
tek bağ sizin "canlıya at" onayınız.

## 8. En dar güvenli düzeltme, testler, deploy kapsamı, geri dönüş

**Düzeltme (yalnız `applyCompletedSubscriptionCheckout`, `stripeBilling.js:1125-1133`):**
`applySubscription` stale dönüşü zaten `workspaceId` taşır (`:1203`). Damgayı `result.updated` kapısından
çıkar: `result.workspaceId` varsa ve alınan abonelik deneme taşıyorsa (`status === "trialing"` veya
`trial_end > 0`), `billingTrialUsedAt` **yalnız henüz yazılmamışsa** yazılır (mevcut damganın tarihi
oynatılmaz); `billingCheckoutSessionId` / `billingCheckoutCompletedAt` **yine `updated` kapısında kalır**
(stale bir oturum kimliği yeni olanı ezmemeli). Başka hiçbir rail, hiçbir alan değişmez.

**Gerekli davranış testleri** (`stripe-invoice-api-drift.test.js`'e, sahte Firestore + sahte Stripe ile,
kaynak-metin iddiası olmadan):
1. stale checkout, denemeli abonelik, damgasız workspace → `billingTrialUsedAt` yazılır; **başka hiçbir alan**
   değişmez (tam depo anlık görüntüsü karşılaştırması — 1. değişmezin istisnası tek alan);
2. stale checkout, damga zaten var → damga ve tarihi **aynı kalır**;
3. stale checkout, denemesiz abonelik → damga yok, hiçbir yazma yok;
4. güncel (stale olmayan) checkout → mevcut davranış birebir (session id + completedAt + damga);
5. checkout guard uçtan uca: damgalı workspace için `createStripeCheckoutSession` `trial_period_days`
   **göndermez**; iptal sonrası (`billingSubscriptionId: ""`) yeniden abone olan damgalı workspace de göndermez;
6. mevcut 43 kontrol + emülatör webhook tekrar oynatması yeşil.

**Deploy kapsamı:** yalnız `stripeBilling.js`'in işleyicilerini barındıran fonksiyonlar, adıyla
(`firebase deploy --only "functions:stripeWebhook,…"`; tam liste hotfix deploy planından teyit edilmeli —
aday: `stripeWebhook`, `resyncStripeWorkspaceEntitlements`, `createStripeCheckoutSession`). Asla
`--only functions`. Deploy temiz ana checkout'tan (`functions/.env` orada).

**Geri dönüş:** Cloud Run'da önceki revizyona trafik (`stripewebhook-00071` vb., deploy öncesi
kaydedilecek) — ledger satırları ek niteliklidir, geri alınmaz; yazılmış `billingTrialUsedAt` damgası
kalır ve zararsızdır (kapı zaten "kullanıldı" der). Deploy sonrası izleme: 24 saat boyunca
`processingStatus: "skipped"` olayları ve 5xx; Stripe panelinde teslimat durumu bu bulgu için kanıt sayılmaz.

## 9. Kanıt bulunamayan / ölçülmeyen noktalar

- Sızıntıdan etkilenebilecek workspace sayısı (damgasız + Stripe'a abone olmuş) — ölçülmedi.
- Canlı add-on geri gelme yolunun gerçekten bir workspace'te tetiklenip tetiklenmediği — ölçülmedi.
- Hotfix deploy planındaki kesin fonksiyon listesi — bu notta teyit edilmedi.
