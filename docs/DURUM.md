# NivaDesk — Durum Defteri

Amaç: yapılanlar ile yapılacakların birbirine karışmaması. Her büyük iş bittiğinde
buraya taşınır; yeni raporlar "SIRADA" bölümüne girer ve bitince yukarı çıkar.
Son güncelleme: 2 Eylül 2026.

---

## TAMAMLANANLAR (canlıda / kodda doğrulanmış)

### 1–2 Eylül — Commerce motoru, WooCommerce, Square: sandbox'tan production'a

Kaynak: `NivaDesk_Commerce_Integration_AI_Spec.md` (Faz 0–4) ve
`NivaDesk_Square_Integration_AI_Spec.md` (Faz 1–2). Rapor artifact'ı:
https://claude.ai/code/artifact/fe522b34-1611-4965-86fa-e42f48ffe7fe

- **Commerce Faz 1 (P0) + Faz 2 (ortak motor) CANLI.** `functions/commerce/`:
  zarf, sahiplik (NivaDesk'e ait 23 alan asla yazılmaz), motor, gölge
  karşılaştırma, Cloud Tasks işçisi, cursor/health/flags, inceleme kuyruğu
  (`commerceReviewQueue`, dört istemcide listele + Resolve). Shopify gölge
  modda (dev mağazası), Etsy adaptörü 0 fark. CI yeşil.
- **WooCommerce tam connector CANLI (2 Eyl):** 23 fonksiyon, wc-auth, şifreli
  REST kimlikleri, 10 webhook, önizleme/backfill/mutabakat, eksik-sipariş
  denetimi; taksit birleştirme kuralı aynen kaldı (kullanıcı kararı). EGGcraft
  mağazası EGGcraft workspace'ine bağlı; test7'deki kopya bağlantı kesildi.
- **Square Faz 1–2 CANLI ve PRODUCTION'DA (2 Eyl 14:06):** OAuth (read-first 7
  izin), uygulama-seviyesi webhook (URL+gövde HMAC), sipariş/ödeme/iade/payout,
  Events API ile kaçan-olay kurtarma (28 gün), 15 dk mutabakat, import
  politikası (`fulfillment_only` varsayılan), audit, payouts+entries, kanal
  şeridi her istemcide. Sandbox'ta uçtan uca 12 senaryo geçti; production'da
  gerçek hesapla: bağlantı, ilk Sync now, Console test olayı 200, £1 nakit API
  ödemesi → 5 webhook 4 sn'de 200 + kuyruk işçisi + ödeme/satış kaydı.
- **Bugün bulunup kapatılan iki gerçek bug (e916090):** Events API
  `EnableEvents` POST atıyordu (Square 404) → olaylar hiç aranabilir olmamıştı;
  doğrusu PUT. Zamanlanmış 15 dk sweep payout aralığında `unreconciled`
  alanı olmadan dönüyor, Firestore özet yazımını reddediyordu → her sweep işi
  yapıp kaydı düşüremiyordu. Reddedilen app token artık bağlantıda
  `app_token_rejected` (da4490e).
- **Kurallar (yaşayarak öğrenildi):** beş `SQUARE_*` secret aynı ortamdan
  olmalı (Console Credentials sayfası varsayılan olarak Production'da açılır —
  sandbox için Sandbox sekmesi); `secrets:set` sonrası "re-deploy…destroy
  stale version" sorusuna hep N, deploy isimle; secret sürümü deploy anında
  bağlanır (yeni sürüm = yeniden deploy); NivaDesk siparişleri kökteki
  `siparisler/square_{cid}_{orderId}` dokümanında.
- **Bilinçli dışarıda:** Square Faz 3+ (catalog/inventory/iki-yön), Square ile
  tahsilat (Faz 5), Shopify canlı parite ölçümü (dev mağazası bayrağı),
  16 Eyl SHOP-004 Faz B.

### 2 Eylül öğleden sonra — Faz 5 finans 1. parça + canlı banka bug'ı

- **Canlı bug kapandı (94c4c13):** `bankFeed.js` id taraması `>= prefix` ve
  `< prefix` ile boş aralık soruyordu; `existingIds` hep boş kalıyor,
  `firstImportedAt` her senkronda yeniden damgalanıyordu (brief §11'in
  bulgusu). Üst sınır `prefix + U+F8FF`; emülatör e2e'si iki senkronla pinliyor
  (kırmızı→yeşil doğrulandı). Üç banka fonksiyonu isimle deploy edildi.
- **Square payout ↔ banka satırı eşleştirmesi (6def492/c2e8f19 + e69f871 +
  native):** `commerce/settlements.js` saf puanlama (para girişi, kuruşuna
  kadar tutar, aynı para birimi, varış ±3 gün; gün kayması −15, sağlayıcı
  kelimesi +20, referans +25; otomatik ≥85 ve ikinciyle ≥15 fark) +
  `settlementMatch.js` orkestratör (payout `bankMatch` ↔ satır
  `settlement` + `incomingKind: payout`, iki taraflı batch; suggest/confirm/
  unlink). Üç tetik: Square reconcile payout geçişi, banka senkronu import
  sonrası, `matchSquarePayoutToBank` callable (owner). Kind'ı payout dışına
  çevirmek iki tarafı da boşaltır. `payout` kind'ı üç istemcide ciro dışı.
  Sunucu 7 fonksiyon CANLI. Web: payouts tablosunda Find bank row / Match /
  Unlink, Banking'de "Processor payout" seçeneği + brüt/ücret/net çipi;
  Mac/iPhone ve Android aynı (ayrı struct/composable). 13 string × 12 dil;
  rehberde "Payouts and your bank" paragrafı 12 dilde + corpus + 7 rehber
  fonksiyonu deploy. Testler: 8 birim + Square e2e 3 senaryo + banka e2e.
  Android BUILD SUCCESSFUL, macOS + iOS BUILD SUCCEEDED. Web "canlıya at"
  bekliyor.
- **Neden bu sıra:** `NivaDesk_banka_pandle_paypal.md` brief'i PayPal için en
  büyük engeli "yerleşme transferlerinin çifte sayımı" diye koyuyor; aynı
  settlement modeli PayPal payout'larına `PROVIDERS` haritasında bir satırla
  uzanır.

### 2 Eylül gece — QuickBooks Online muhasebe bağlayıcısı Faz 1–2 (kodda, deploy secret bekliyor)

**Kaynak:** `NivaDesk_QuickBooks_Online_Entegrasyon_Spesifikasyonu.md`; mühendislik okuması `docs/accounting-connector.md`. Intuit gerçekleri tarayıcıdan doğrulandı (WebFetch JS sayfaları boş döner): webhook gövdesi CloudEvents dizisi + `intuit-signature` HMAC, OAuth uç noktaları, 100 günlük kayan/rotasyonlu refresh token, `minorversion=75`.

**Sunucu (commit 125a6e9):** `functions/accounting/core` (adapter sözleşmesi, capability registry — QuickBooks For Review satırlarını hiç iddia etmez, Pandle confirm yeteneğini korur; posting state machine; fingerprint; `companies/{cid}/accounting*` deposu + tek-yazıcı kuralı), `functions/accounting/quickbooks` (saf client, OAuth, webhook parser eski+yeni şekil, normalize + eşleme/KDV önerileri + mükerrer müşteri adayları), `functions/accounting/pandle/adapter.js`, `functions/accountingFunctions.js` (13 fonksiyon; realm→workspace haritası kök `accountingRealms`). Rules: 11 alt koleksiyon üç yerde + kök state/realm blokları — **rules CANLI**. Testler: 10 saf + 9 e2e senaryo (sahte Intuit) geçti. **13 fonksiyon CANLI (2 Eyl gece):** kullanıcı 4 secret'ı girdi (`NIVADESK_QBO_CLIENT_ID/SECRET/WEBHOOK_VERIFIER/TOKEN_KEY`, Secret Manager'da 1'er etkin sürüm); canlı yoklama: imzasız webhook POST → 401, GET → 405, parametresiz callback → 302 `settings?section=quickbooks&quickbooks=error&reason=missing_code`.

**Web (kodda, tsc temiz):** Integrations kartı `native` + `quickbooks`; `QuickBooksIntegrationSection` 9 sekme (Overview, Setup adım 2–5: şirket doğrulama, muhasebe kaynağı/geçiş tarihi, çift-yazıcı kontrol listesi, kaynak başına posting modu; Mappings: hesap + KDV seçimleri, öneriler, mükerrer raporu; Sales/Purchases/Inventory dürüst "salt-okunur" panelleri; Reconciliation; Sync activity; Settings/Disconnect), `/quickbooks/callback` yönlendirici, `lib/studioflow/quickbooks.ts`; rehber paragrafı 12 dil; 181 metin 11 dile çevrildi. **Round 150 CANLI (8ee887c), 2 Eyl gece — settings chunk'ında "Double-writer check" doğrulandı.** Round 151 (6c46c96: geri dönüş mesajı ilk yüklemede silinmiyor) push edildi. **Canlı bağlantı testi — kaldığımız yer:** ilk deneme `quickbooks_realm_mismatch` ile düştü (CompanyInfo.Id realm DEĞİL — düzeltildi, callback yeniden deploy edildi, e2e fixture Intuit şekline çekildi); ikinci deneme Intuit "Please select your company" ekranında bekliyor → kullanıcı "Sandbox Company GB 5cdb"yi seçip Next/Connect'e basacak, dönüşte NivaDesk otomatik katalog içe alımı yapacak; ardından Mappings → Suggest → Confirm ve webhook/CDC gözlemi. Native yok (web-first, bilinçli).

**Intuit tarafı (2 Eyl gece, Chrome'da birlikte):** geliştirici hesabı + çalışma alanı "NivaDesk" (yasal şirket EGGcraft Limited, W9 1DN), uygulama **NivaDesk** App ID `1047180f-45b1-4a96-9996-1ba2a1b5a835`, Development redirect URI'ler (`…/quickbooksOAuthCallback` + `nivadesk.app/quickbooks/callback`), webhook endpoint `…/quickbooksWebhook` + **CloudEvents biçimi açık** + tüm varlıklar ("Subscription saved"), İngiltere sandbox şirketi "Sandbox Company GB 5cdb" (realm 9341457840593750) + varsayılan ABD sandbox. Tuzak: Intuit konsolunda Save düğmeleri 1075px genişlikte görünür alanın dışında kalıyor → pencereyi 1500px'e genişletmeden hiçbir kayıt tutmadı. Production anahtarları/URI/webhook ayrı sekmede (henüz yapılmadı; sandbox testi temiz olunca).

**Sıradaki fazlar:** 3 satış posting (Estimate/Invoice/SalesReceipt/Payment, preview + onay, detailed/daily summary), 4 purchases, 5 clearing/payout/awaiting bank match, 6 COGS journal, 7 otomasyon + conflict akışı.

### 2 Eylül 18:05–18:33 — Banking sayfası kesintisi (Round 147 → hotfix Round 149)

Round 147'deki sayfa geneli `item.amount < 0` → `isSpend(item)` değişimi, aynı betikte eklenen `isSpend` yardımcısının kendi gövdesini de değiştirdi → sonsuz özyineleme; `tsc` geçti, `/bank` canlıda açılışta çöktü (18:05'ten itibaren). Kullanıcı 18:30'da bildirdi; gövde düzeltildi, Round 149 (81cf450) 18:33'te canlı (`app/bank/page-6e4d…` chunk'ında `amount<0&&!outgoingKind` doğrulandı). Ders hafızada: toplu değişimden önce yardımcı tanımını hariç tut, deploy öncesi sayfayı tarayıcıda aç.

### 2 Eylül gece — İade/chargeback ↔ sipariş bağı (brief §10 yapısal #4) dört platformda

**Model.** Müşteriye geri dönen para harcama değildir. Giden bir banka/PayPal satırı `bankLinkRefundToOrder` (owner) ile siparişe bağlanır: `link` siparişin `payments[]` defterine `{amount: -X, method: "Refund"|"Chargeback", bankTransactionId, refund: true, createdByUid}` girdisi yazar, `paidAmount = max(0, paid − X)`, `refundedAmount += X`; satır `outgoingKind` (customer_refund | chargeback) + `linkedOrderId/Label/PaymentId` alır ve harcama toplamlarından çıkar. `unlink` girdiyi siler, tutarları geri alır, `outgoingKind`'ı düşürür. `suggest`: PayPal iadesi (`paypal_reference_id_type=TXN`) geri aldığı satışı adıyla bildirir → o satış bir siparişe eşleşmişse sipariş `hint` olarak döner (`reverses_paypal_payment`; eşleşmemişse `reverses_paypal_payment_unlinked`); tür tahmini T12xx / "chargeback|dispute" → chargeback, aksi customer_refund. Aynı satır ikinci girdi olmaz (`bankTransactionId` ile idempotent; sadece tür değişir). `bankLinkTransactionToOrder` (gider bağı) `outgoingKind` taşıyan satırı reddeder; gider olarak bağlı satıra iade yazılmaz ("önce çöz").

**Kod.** `functions/bankFeed.js` (`OUTGOING_KINDS`, ENRICHMENT_FIELDS += `outgoingKind`, callable), `commerce/paypal/normalize.js` (`paypalReferenceId`), e2e `bank-paypal-feed-emulator.test.js` (satış→sipariş, iade satırı, suggest ipucu, link → paid 0 / refunded 19.99 / negatif girdi, gider bağı reddi, tekrar link = already, unlink → geri). Web `app/bank/page.tsx`: `isSpend()` (amount<0 && !outgoingKind) tüm toplam/filtrelerde; çekmecede "↩ Refund or chargeback" bloğu (tür seçimi → sipariş seçimi → Record on the order; PayPal ipucu düğmesi; bağlıyken kırmızı durum + Remove from the order); gider "Linked order" seçicisi iade satırında gizli; listede ↩ işareti. Mac/iPhone: `BankRefundLinkSection` + `bankRefundLink` wrapper, `isOutgoing`/`isSpending` ayrımı (renk/işaret yöne, toplamlar harcamaya göre). Android: `RefundLinkSection`, `bankLinkRefundToOrder` repository, aynı ayrım. 14 yeni string 12 dilde üç tabloda; rehber Banking bölümüne "Refunds and chargebacks" paragrafı EN+TR+10 dil, corpus yeniden kuruldu.

**Refunded satırı (2 Eyl gece, ikinci parça).** Sipariş kartı finans özetinde Paid'in altında kırmızı, salt-okunur "Refunded" satırı (yalnız `refundedAmount > 0` iken): web (`FinanceInlineRow` disabled + PDF satırı + ödeme listesinde ↩ ve kırmızı eksi tutar), Mac/iPhone (`Siparis.refundedAmount: Double?` — Codable'a eklendi ki tam-doküman kaydı sunucu değerini silmesin; kart satırı, özet satırı, salt-okunur kart, PDF, yedek transferi; `PaymentEntry.bankTransactionId/refund` optional alanları da eklendi — bunlar olmadan Mac kaydı banka bağını düşürüyordu), Android (`StudioOrder.refundedAmount`, `StudioPaymentEntry.bankTransactionId/refund`, kart satırı, özet, PDF, yedek). **Silme tutarlılığı:** iade girdisini sipariş defterinden silmek (web/Android → `updateWebOrder deletePaymentId`) artık `paidAmount`'u geri yükler, `refundedAmount`'u düşürür, kalan bakiyeye dokunmaz ve banka satırını serbest bırakır (`freedBankRows`, işlem commit'inden sonra, yalnız satır hâlâ o girdiyi gösteriyorsa); `roundMoneyValue` negatifi sıfırladığı için ham tutar kullanılır. Mac'te iade girdisinin silinmesi yerel defter yazımı değil `bankLinkRefundToOrder unlink` çağrısıdır. E2E: PayPal süitine "defterden silme = unlink" senaryosu (test şirketi Pro plana alındı; `fail()` artık satır numarası basar). `updateWebOrder` deploy edildi. Web **CANLI — Round 148 (20d7163), 2 Eyl 18:28**; macOS/iOS/Android derlendi (mağaza sürümü bekliyor).

**Durum.** Sunucu CANLI: `bankLinkRefundToOrder` (yeni), `bankLinkTransactionToOrder`, `paypalConnect`, `bankSyncTransactions`, `scheduledBankSync` güncellendi; rehber 7 fn deploy'da. Web **CANLI — Round 147 (8ac7adb), 2 Eyl 18:05**, chunk `9589-…` doğrulandı. macOS + iOS derlendi, Android BUILD SUCCESSFUL. Bilinçli dışarıda: sipariş kartında ayrı "Refunded £X" satırı (girdi ödeme listesinde eksi olarak görünür; `refundedAmount` alanı hazır), tedarikçi iadesinin gider netlemesi (brief'te olası ek).

### 2 Eylül akşam — PayPal para feed'i (brief §10) dört platformda

- **Sunucu CANLI:** `commerce/paypal/client.js` + `normalize.js` (T-kod
  grupları; bankaya çekim satır değil payout kaydı; ücret brütün yanında),
  `bankFeed.js` PayPal dalı (`paypalConnect` owner callable: önce 1 günlük
  deneme sorgusu, secret AES-256-GCM `NIVADESK_PAYPAL_TOKEN_KEY` ile kutulu,
  180 gün içe alım; sweep'te provider dalı; purge payout'ları da siler;
  `bankListPayouts` + `matchPayoutToBank` generic). 6 birim + 6 emülatör
  senaryosu. Bug: `transaction_status` listesi PayPal'da 400 → tek değer / yok.
- **Web Round 145 CANLI (16:45):** Integrations → Banking & accounting →
  PayPal kartı (Live/Sandbox, Client ID, Secret, Sync now, çekimler + banka
  eşleştirme, bağlantı kesme); Banking'de PayPal satırında ücret/net.
- **Web Round 146 (kodda, "canlıya at" bekliyor):** Banking çok-kaynaklı:
  All/Bank/PayPal çipleri her liste ve toplamı daraltır, PayPal satırlarında P
  işareti, Add account → Banka (Open Banking) veya PayPal, bağlı PayPal'da
  Manage, kaynak yoksa iki bağlama düğmesi; toplamlar yalnız ana para birimini
  toplar ve dışarıda kalan satır sayısını söyler.
- **Mac/iPhone + Android:** hub kartı planned→native, PayPal ekranı
  (PayPalIntegrationView / PayPalDetail), banka satırında ücret, PayPal
  bağlantısının Reconnect'i PayPal kartına, Banking'de kaynak çipleri + P
  işareti. Rehber: Banking bölümüne "PayPal beside the bank" 12 dilde,
  corpus + 7 fonksiyon deploy. Kullanıcı 15:47'de LIVE hesabı bağladı.
- **Canlıda doğrulandı (16:33):** ikinci bug — bağlanırken düşen altı aylık
  ilk içe alım hiç yeniden denenmiyordu (Sync now 14 günü tarıyor, sweep
  aralığa takılıyordu). `historyImportedAt` yalnız tamamlanan tam içe alımda
  yazılır; yoksa bağlantı "borçlu" sayılır, aralık kısıtı uygulanmaz ve ilk
  başarılı senkron 180 günü alır (7fe009e, e2e senaryosu). Sonuç: 5 satır
  (4 satış + ücretler, 1 alım), GBP, Nis–Ağu; HSBC bağlantısı aynı
  workspace'te → gelecek çekimler eşleşecek. Web Round 146 CANLI (17:19).
- **Açık:** brief §10 #4 (iade/chargeback ↔ sipariş bağı), ChatGPT araç
  metinleri (OpenAI incelemesi bitene kadar tools/list sabit), Pandle'da
  PayPal'ın ayrı banka hesabı olarak modellenmesi (Pandle işi).


### 31 Ağustos — bir günde on iş, ve defterin kendisi yalan söylüyordu

Bu bölüm 173 commit sonra yazıldı. O boşlukta defter iki yönde birden yanlış
bilgi veriyordu: bittiğini söylediği şeyler bitmemişti, beklediğini söylediği
şeyler çoktan canlıydı. Aşağıdakiler ölçülerek yazıldı, hatırlanarak değil.

**Kasa kapalıydı.** iOS/macOS 1.3, App Store'da **22 Ağustos'tan beri satışta**
(defter "review'da" diyordu; public lookup API'si `trackId 6765475980` ile
teyit etti). Ama `verifyAppleSubscriptionPurchase` ve
`appleAppStoreServerNotification` canlıda `APPLE_ALLOW_PRODUCTION_BILLING=false`
ile koşuyor, yani doğrulayıcı sadece `["Sandbox"]` ile kuruluyor. StoreKit
parayı ÖNCE çekiyor. Günlükte hiç gerçek çağrı yok — kimse denememiş, yani
aktif zarar değil; ama ilk deneyen kaybedecekti. `.env` düzeltildi
(`APPLE_APP_STORE_ID=6765475980` + üretim açık); **deploy kullanıcıda kaldı.**

**Aktivasyon teşhisi değişti.** 23 Ağu'daki "37 workspace, 0 müşteri" sekiz gün
tekrar ölçülmemişti ve betiği commit edilmemişti. Şimdi
`functions/scripts/activation-audit.mjs`. 31 Ağu ölçümü, 47 dış workspace:
onboarding'i bitiren 3 (%6,4), **en az bir sipariş açan 19 (%40,4)**, müşteri
kaydı açan 4, deneme başlatan 4, **ödeyen 0**. Kohort: 23 Ağu öncesi %27 aktif,
sonrası %67. Yani "kimse aktive olmuyor" DOĞRU DEĞİL; sıkışma kasaya ulaşmakta.
(Ölçüm iki kez yanlış çıktı ve iki kez düzeltildi: `plan`/`subscriptionStatus`
diye alan yok — `billingPlan`/`billingStatus`; ve `lifetime_lite` ömürlük satın
alma değil, £9 Starter planının eski kimliği.)

**Üretimde kaynağı olmayan iki fonksiyon.** `pinMessageInThread` ve
`unpinMessageInThread` canlıydı, gönderilmiş Mac/iPhone/Android sürümleri
onları çağırıyordu, ve repoda hiçbir dosyada yoklardı. Tam bir deploy onları
silip mağazadaki uygulamalarda sabitlemeyi bozacaktı. İstemcilerin okuduğu
alanlardan yeniden yazıldı, 15 iddialık emülatör testiyle deploy edildi.

**Kural açığı: yetki yükseltmesi.** `companies/{cid}` wildcard'ı bir REDDETME
listesi ve beş alt koleksiyon atlanmıştı. En ciddisi `supportSettings/general`:
içindeki `supportManagerUids` her üyeye yazılabilirdi — bir üye tek `setDoc` ile
kendini destek yöneticisi yapabilirdi. Yanında `workspaceTickets`,
`notifications` (yazma), `wooMergedPayments`, `users`. Kurallar OR'landığı için
hem açık blok hem reddetme listesi gerekti; kontrol koşusunda reddetme listesi
kaldırılınca **13 iddia düştü**. Deploy edildi.

**Telefondan yüklenen dosyalar kütüphaneye girmiyordu.** Sipariş dosyasını
kütüphaneye sokan tek şey web Files sayfasındaki elle basılan indeksleme
düğmesiydi — zamanlanmış değil, native'de yok. Bu native'e özel bir eksik
DEĞİLDİ; web sipariş kartı da dahil her platformda böyleydi. Kayıt artık
sunucuda, `appendClientFile` içinde — yani **mağazadaki sürümler de düzeldi.**

**Mağaza dosyaları:** markalı müşteri linkleri artık native'de de
(`CustomerPortalLink.swift` / `CustomerLinks.kt`); web `clientPortalHost`
kullanırken Mac/iPhone/Android `nivadesk.app`'i sabit yazıyordu, yani markalı
alan adı için ödeyen atölye telefondan gönderdiğinde bizim adımızı veriyordu.
Uygulama içinde **RTL hiç uygulanmıyordu** — `dir` yalnızca pazarlama sitesinde
ayarlanıyordu, Arapça haftalardır soldan-sağa akıyordu. Android **0.1.9
(versionCode 10)** imzalı paketi hazır; yükleme kullanıcıda.

**Test altyapısı:** `npm test` 21 `.mjs` takımını sessizce atlıyordu — 19'u
kimsenin koşamadığı, 351 iddialık bir katmandı. Dört katman ayrıldı ve
adlandırıldı: `npm test` (birim, emülatörsüz) · `test:rules` · `test:e2e` ·
`test:integration`. Bugün toplam **24 takım, 403 iddia**, hepsi yeşil.

**Rehber:** Home ekranının hiç bölümü yoktu (dört platformda yayında) —
"Home kartlarımı nasıl düzenlerim?" sorusu Notes **widget** bölümünden
cevaplanıyordu. Files bölümü 26 Ağustos'ta değişen davranışı hâlâ eski hâliyle
anlatıyordu. Kurulum "dört soruluk" diyordu, `TOTAL_STEPS = 5`. Üçü de
düzeltildi; **yedi** asistan fonksiyonu deploy edildi — dört değil, çünkü
`createWebsiteChat` de corpus taşıyor ve ziyaretçinin İLK sorusunu o karşılıyor.

**Etsy:** OAuth turu **gerçek Etsy'de ilk kez çalıştı** (31 Ağu 19:17–19:24).
Jeton takası, PKCE, tek kullanımlık state, ve mağazasız hesabın doğru mesajla
geri çevrilmesi — hepsi geçti. Bağlantı yazılmadı çünkü o hesabın mağazası yok;
beklenen davranış. `reconcileEtsyConnections` **hiç sır bağlanmadan** deploy
edilmişti (`onSchedule` sarmalanmamıştı) — ilk mağaza bağlandığında sessizce
ölü olacaktı, düzeltildi. Anahtarlar ölçüldü: `openapi-ping` 200, yalnız
keystring 403 (birleşik biçimin kanıtı); bozuk v1/v3 sürümleri yok edildi.
Eşleyici Etsy'nin yayımlanmış OpenAPI şemasına karşı denetlendi — 28 makbuz +
7 işlem alanı, durum listesi, iade davranışı: **kusur yok**, ve artık test.

**Etsy hesap topolojisi netleşti:** Seller App mümkün değil (Etsy personeli:
"We do not allow users to have both Seller Apps and Personal/Commercial Apps").
Ayrı hesap koruma sağlamıyor (Etsy ilişkili hesapları askıya alma hakkını saklı
tutuyor, aynı vergi kimliği isteniyor) ve Developer Mode'u kaybettiriyor.
Mağaza gerekirse uygulamanın durduğu hesapta açılmalı. Ama mağaza artık acil
değil: OAuth yarısı geçti, `receipts` yarısı gerçek alıcı istiyor.

**Bu ay dördüncü kez bir test bug'ı sertifikaladı** (`guide-retrieval.test.js`
`/four-question/i` iddia ediyordu, yani rehberdeki YANLIŞ cümle testi yeşil
tutan tek şeydi). Çare her seferinde aynı: cevabı adlandırma, kaynaktan türet.

---

### Ana sayfa hero hizası — 28 Ağu, CANLI (Round 66)
Şikâyet: "orantısız, kayık, çizgilerin gösterdiği yerler tam görünmüyor". Ölçüm
üçünü de doğruladı; dört kart ile ekran görüntüsü viewport'a AYRI AYRI
sabitlenmişti ve birbirlerinden kaymışlardı.
- Şerit 636px / görsel 620px (16px taşma) → ikisi de 620, sol+sağ kenar birebir.
- Kartlarla görsel arası 78px boşluk ama kesikli çizgi 22px → boşluk = çizgi
  (tek değişken `--hero-connector`), artık yapı gereği ulaşıyor.
- Görsel blok metinden 126px yukarıdaydı → 28px.
- `rotateY(-3deg)` kaldırıldı ("kayık" olan buydu).
- Kartlar doğal genişlikte kalıp boşluğu paylaşıyor; hiçbir etiket sarmıyor.
- Şerit yalnız ≥1320px'de görünüyor (altında görsel ~571px kartı taşıyamıyor;
  eskiden şerit görselden 84px taşıp metnin üstüne giriyordu).
- **Yan bulgu:** `@media (max-width: 1180px)` yığılma kuralı, dosyada SONRA gelen
  iki koşulsuz kural tarafından eziliyordu (medya sorgusu özgüllük eklemez).
  Tablet/küçük dizüstünde hero 760px yükseklikte kalıyordu: başlık üstünde
  ~220px ölü boşluk, ekran görüntüsü katlamanın altında. 1100px'de başlık
  y=297 → y=171. Kural, ezenlerden sonra tekrar yazıldı.
- 1920/1400/1360/1320/1200/1100/768/700/375'te ölçüldü: hizalama tam, yatay
  taşma yok.

### Production menüsü (yeni özellik) — 28 Ağu, CANLI (Round 65)
Siparişler "ne istendi", Takvim "ne zaman"; eksik olan katman "hangi iş şu anda
nerede" idi. Yeni üst menü + Kanban.
- **İki seviye, spec'teki gibi:** Production Steps zaten siparişte var; Production
  Stage bunlardan HESAPLANIR, ayrıca saklanmaz — böylece pano ile sipariş çelişemez.
  Siparişe yalnız iki şey yazılır: elle geçersiz kılma + blokaj.
- Sütunlar workspace'in kendi kelimeleri; yalnız `kind` sabit (hangi şerit blokaj
  sebebi sorar, hangisi kapatır). Kuyumcu Döküm/Mıhlama/Cila yazabilir.
- WIP kapasitesi uyarır, engellemez (yeşil/sarı/kırmızı).
- Sürükle-bırak gerçek durumu yazar: History'ye eski→yeni, atanan kişiye (herkese
  değil) bildirim, ardından Undo. Blocked şeridine bırakınca sebep ZORUNLU.
- Board / List / Workload üç görünüm. Sipariş kartında da aynı tek satır özet.
- Sunucu: `functions/production.js` + 3 callable CANLI. Test:
  `test/qa/production-stage.test.js` (12 senaryo).
- 4 platform: web (/production), macOS+iOS (ProductionView), Android
  (ProductionScreen). Hepsi derleniyor; web emülatörde uçtan uca test edildi
  (taşıma, blokaj sebebi, Undo, sütun yeniden adlandırma).

### Envanter kategorileri artık atölyenin — 28 Ağu, CANLI (Round 65)
Kategoriler 10 sabit kelimeydi; kuyumcu yüzüğü "Watches" altına koymak zorundaydı.
- Envanter → Categories: yeniden adlandır / ikon / sırala / gizle / birleştir /
  varsayılan seç.
- **Tek merkezi ad:** ürün kategoriyi BAŞLIK olarak saklar (CSV okunur kalsın diye),
  bu yüzden yeniden adlandırma sunucuda ürünlere taşınır. Kenar çubuğu, filtre,
  ürün formu, satın alma kalemleri ve sayım seçicisi aynı listeyi okur.
- **Hiçbir ürün ortada kalmaz:** dolu kategori silinemez — nereye gidecekleri
  sorulur (başka kategori / Diğer / kategoriyi gizle). Listede olmayan kategoriye
  ait ürünler ekranın üstünde bildirilir.
- Sunucu: `functions/inventory.js` + 4 callable CANLI. Test:
  `test/qa/inventory-categories.test.js` (9 senaryo).
- 4 platform tamam; web emülatörde test edildi (rename → 3 ürün taşındı,
  Packaging silme → 12 ürün Diğer'e).

### Bu iki özellik için ev kuralları
- Rehber: guide.ts'e EN+TR "Production" düğümü + Envanter altına "Categories"
  bölümü eklendi, korpus yeniden üretildi (45 bölüm).
- Çeviri: 96 yeni dize × 12 dil, web + Android (TR_15) + Apple (chunk 10).
- Rehber/asistan 4 fonksiyonu da CANLI (kullanıcı reauth ettikten sonra).
- **Sonda bir gerileme buldu ve düzeltildi:** "hangi siparişler bloke?" sorusu
  Production'a değil Orders'ın alt kartlarına gidiyordu. Sebep: bölüm ALT
  BAŞLIKLARI gövde metnine gömülüydü, aramada tesadüfi bir kelime kadar ağırlık
  taşıyordu; Orders'ın 19 bölümü her "order" geçen soruda ilk 4 yuvayı
  dolduruyordu. `buildGuideCorpus.js` artık `headings` alanı üretiyor ve scorer
  onu başlık kadar (+2) ağırlıklandırıyor. Önce denenen "bölüm başına en çok 2"
  kapağı geri alındı — dosya paylaşımı sorusundan Client Files kartını
  düşürüyordu; başlık ağırlığı tek başına yetiyor.
  Regresyon: `test/qa/guide-retrieval.test.js`.
- Bilinen ESKİ eksik (bu işin sebebi değil, ayrı iş olarak işaretlendi): "how do
  I record a payment?" Orders › Financial card'a ulaşmıyor.

### Banka bağlantısı her sabah kopuyordu — 28 Ağu, CANLI
Şikâyet: "her gün bağlantı yenilemek zorunda kalıyorum". Normal değildi.
- **Kanıt (üretim, EGGcraft/HSBC):** bağlantı 26 Ağu 16:07'de kuruldu, 16:08'de BİR
  kez senkron oldu, sonraki her zamanlanmış senkron (22:47, 06:47, 14:47, 22:47)
  "Bank data request failed: Access denied" ile düştü. Token tazeleme hep başarılı;
  düşen yalnızca veri isteğiydi.
- **Sebep:** her gözetimsiz senkron 2 yıllık geçmiş istiyordu. PSD2 altında banka
  derin geçmişi yalnız müşteri huzurdayken (taze SCA) vermek zorunda; HSBC bunu
  uyguluyor ve reddediyor. Kod bu reddi "rıza öldü" diye okuyup her sabah yeniden
  bağlanmayı dayatıyordu.
- **Düzeltme (`functions/bankFeed.js`):** derin geçmiş yalnızca bağlanma anında;
  rutin senkron 90 gün. Geniş aralık 401/403 alırsa dar aralıkla tekrar denenir.
  Hatalar artık aşamayla etiketli (`tlStage` auth/data): yalnız auth-aşaması ve
  `invalid_grant` "reconnect" demek; veri reddi ilk seferde amber "Sync failing",
  ancak üst üste ikincide reconnect'e yükseliyor (gerçekten iptal edilmiş rıza
  saklanmasın diye).
- **Doğrulama:** düzeltme deploy edildikten sonra aynı bağlantıda gerçek gözetimsiz
  senkron çalıştırıldı → `synced: 1, imported: 145`, `syncState: ok`, hata yok.
  4 kez üst üste reddedilen bağlantı, biriken 145 işlemi de içeri aldı.
- Teşhis için kullanılan tek seferlik `nvBankHealthOnce` fonksiyonu silindi (uç 404).
- Regresyon: `functions/test/qa/bank-consent.test.js` (5 senaryo).

### Settings raporu (notes3) — 26 Ağu, CANLI
Tamamı: yedek v3 (kayıt-kimlikli eşleştirme + içe aktarma önizleme/atlama/geri alma),
teamChat izni (4 platform + sunucu kapısı), entegrasyon teslimat günlükleri + mağaza
test webhook'ları, PDF canlı önizleme (gerçek şablonlardan), web destek eklentileri,
bilgi bankası tek-slot geçmişi, özelleştirilebilir yükleme politikası metni, 10 gruplu
Settings IA (web+Mac+Android), ~200 string × 12 dil. 9 suite emülatör regresyonu yeşil.

### Envanter yeniden tasarımı (rapor 1-2. aşama) — 25-26 Ağu, CANLI
- Faz 1-5 + fotoğraf + QR: 4 platformda, uçtan uca test edilmiş.
- Ürün detay paneli 4 platformda; sunucu-birebir durum geçişleri; ledger'dan aylık
  KPI değişimi (dürüst bastırma ile); kenar çubuğu tek-gezinme; KPI tooltip'leri;
  konum/tedarikçi filtreleri; sayfalama; toplu seçim (taşı/arşivle/CSV); Linked
  Records kartı (purchase→bankTx join'leri).
- Bulunan gizli bug'lar: fotoğraf kaydetmede kısmi-payload veri kaybı (3 yerli
  platformda düzeltildi), Swift 2dp yuvarlama, geçiş haritası sapması.

### Merkezi Dosya Kütüphanesi (rapor §16-25) — 26 Ağu, CANLI
- Sunucu: `fileRecords` kayıt-üstü-depo (sha1 idempotent), 12 callable, kural
  istisnası (client SDK kapalı — owner bile 403). Üç kural testle sabit: dosya BİR
  kez kaydolur; bağlantı ≠ paylaşım; çöp-önce silme (yalnız library-kaynaklı depo
  nesnesi silinir).
- Web: üç panelli /files (ray görünümleri, kayıt paneli, Share with Order, sürümler,
  aktivite, çöp), classic Client & Orders korunarak. Sipariş sayfasında "From the
  Files library" şeridi (audience rozetli). Envanter panelinde Files sekmesi.
- Portal: paylaşılan dosya müşterinin /track sayfasında listelenir; paylaşımda
  storage objesine token URL mint edilir, sürüm değişince yenilenir. Emülatörde tam
  zincir kanıtlı (gerçek baytlarla indirme dahil).
- Karşıt-denetim düzeltmeleri: çöp/silme deleteClientFiles kapısına bağlandı
  (sunucu+UI+test), rename taslağı kayıt değişince sıfırlanır + Cancel, reload
  sıra-korumalı, Trash boş-durumu dürüst, Recent aramadan sonra kırpılır.
- Native: ürün panelinde Files sekmesi Mac+iPhone+Android (tam build'lerle).
- 73 string × 11 dil. Suite: `functions/test/qa/files-library.mjs` — 33 assert,
  kısıtlı-üye kapısı + portal zinciri dahil, TÜMÜ GEÇTİ.
- Web 4 yayın turu canlı chunk'ta doğrulandı; 18 fonksiyon deploy'u isimle yapıldı.

### Daha eski tamamlananlar
Bkz. bellek/commit geçmişi: KDV brüt düzeltmesi, webhook sertleştirme, Settings
bölüm düzeltmeleri, Quick Reply anahtar durumu, CSV export, fatura kalem-only,
banka akışı (TrueLayer), onarım kabul kartı, teklif/onay/imza, Twilio SMS, vb.

### Native kütüphane paritesi — 26 Ağu, KODDA TAMAM (mağaza sürümü bekler)
Mac/iPhone (ContentView'da Library modu + LibraryFileDetailSheet + Share sheet;
iki platformda xcodebuild BUILD SUCCEEDED) ve Android (ClientFilesScreen'de
Library sekmesi + detay + Share diyaloğu; BUILD SUCCESSFUL). Sipariş detayında
"From the Files library" şeridi 3 yerlide. Çöp/geri yükleme klasik silme
kapısıyla; kalıcı silme + sürüm yönetimi + indeksleme bilinçli web-only.
Çeviriler web tablosundan bayt-bayt.

### Üç yeni rapor — ilk büyük dalga, 26 Ağu, WEB CANLI(yolda)
**Schedule (3 doğrulanmış bug FIX + E2E):**
- Sağ tutamaç: bar, satırın gizli taşmasına kırpılıyordu → tutamaç ulaşılmazdı.
  Genişlik artık satır içine sığar; sürükleme scroll-telafili + kenarda
  oto-kaydırma + canlı tarih önizleme rozeti. Gerçek fareyle kanıtlı (+3 gün
  uzatma → 25 Aug-12 Oct, geri alındı).
- Çift "Sun 25 Oct"/eksik "Sat 31": addDays artık takvim adımı (setDate), 24h
  milisaniye değil. 92 hücre doğru.
- Created Date "kaydetmiyor": gerçek bug — toISOString(UTC) yazımı + yerel
  parse; BST'de bir gün geri gösteriyordu (sunucu doğru kaydediyordu).
  dateInputValue artık yerel gün. E2E: 11 Jul kaydedildi/gösterildi/geri alındı.
- Etiketler: "44d left", "Due £X", "Search Orders", Today + seçiliye-atla
  düğmeleri, "1 order" tekilleri.
**Customers (hızlı düzeltmeler):** "1 order/1 customer" tekil; kart tarihi
"Last contact:" etiketli; Total Spent → Total Order Value + Paid + Outstanding
kartları (totalPaid zaten hesaplanıyordu, hiç gösterilmiyordu); View All Orders
→ /orders?customerName=… (orders arası bağ çalışıyor, E2E'li); Shopify/Woo/API
kaynak rozetleri; Activity satırlarında saat+e-posta + Load more; mükerrer
e-posta/telefonda oluşturma onayı; Notes sekmesi → "Order Notes";
"Phone / WhatsApp" etiketi.
**Müşteri kimliği (sunucu):** upsertIntegrationCustomer artık
externalCustomerId saklıyor (5 webhook çağrı noktası) ve id → e-posta → isim
sırasıyla eşliyor. customer-identity.mjs emülatörde TÜMÜ GEÇTİ (isim değişse
de tek kayıt; guest aynı e-posta → mükerrer yok). 5 webhook CANLI (26 Ağu akşamı).
**Kart sistemi:** tek kart bileşeni 3 yoğunluk (container query; 460/380/290
kademeleri E2E'li); ayırıcı 22px görünmez tutma alanı + çift-tık varsayılan;
bulut genişliği artık EKRAN BAŞINA (schedule/customers kendi alanlarını yazar,
eski alan fallback; saveWorkspaceSidebarLayout deploy edildi); Schedule
varsayılanı 320px; kart resize'da canlı "384 × 497" rozeti; kilit tooltip'i
"yalnız bu cihazda" diyor; DESI/BOYA rozetlerinde tam-ad tooltip'i; Customers'ta
6'lı sıralama (Last contact/Last Order/Most Orders/Highest Value/Outstanding/
Alphabetical). 11+1+4 yeni string × 11 dil. Web canlı doğrulaması: 8 yayının
7'si servis edilen chunk/CSS'te teyitli, 8. poll'da.

## SONRAYA BIRAKILANLAR (bilinçli — kullanıcı onayıyla)

### Kart + Customers raporlarından kalan ürün maddeleri (27 Ağu kaydı)
- Kart: ~~sipariş türüne göre otomatik düzen~~ 27 Ağu gece 4'te TAMAM
  (typeWorkspaceSnapshotsJSON; owner 'Save as the repair-order layout' der,
  her repair siparişi herkes için o düzenle açılır; öncelik bağımsız-sipariş >
  tür > profil > paylaşılan; emülatör 7/7; web+sunucu canlı; NATIVE ÇÖZÜMLEME
  DE TAMAM — Swift'te activeWorkspaceLayoutIsTypeManaged muhafızı ile clobber
  koruması + logout cache hijyeni, Android'de jestler sipariş-bağımsız düzene
  yönlenir; Overview açıklaması + Purchase→Inventory satırı da iki native'de,
  gerçek navigasyonla). Kullanıcıya-özel düzen ZATEN VAR
  (workspaceUserProfilesJSON per-user profilleri) — ayrıca iş çıkmadı.
  (Görsel kararlar 1B/2B/3B DÖRT platformda TAMAM — web canlı-doğrulamalı,
  Mac+iPhone xcodebuild ve Android gradle build'leriyle commit'li, 27 Ağu.)
- Customers ürün — 27 Ağu gece 3'te üçü kapandı (web, canlı yolda; native
  ajan turu sırada): entegrasyon paneli (integrationSyncedAt + son payload
  webhook'ta damgalanıyor; resyncIntegrationCustomer mağaza-kazanır replay —
  emülatörde bozulan telefon geri döndü; Connected store/ID/Last synced/ham
  veri) + profil hızlı aksiyonları (Call/WhatsApp/Email/Instagram) + arama
  vurgusu ("⌕ Matched: Dup Band" kartta). Native paritesi de TAMAM (iki ajan;
  Swift BUILD SUCCEEDED ×2 — setData sunucu alanlarını artık ezmiyor;
  Android BUILD SUCCESSFUL). KALAN: segmentler/etiketler; Messages/AI Replies
  bağlantısı; Overview sekme düzeni. Segmentler de TAMAM (27 Ağu gece 5,
  web+sunucu canlı yolda; tags[] anahtar-varsa yazımı, chip editörü + filtre
  satırı + kart chip'leri; native segment UI'ı sonraki tur). İletişim
  tercihleri de TAMAM (27 Ağu gece 6, rapor §15): preferred channel /
  Do not contact (linkler söner) / marketing durumu / next follow-up +
  Messages(?q= derin bağlantı)/AI Reply kısayolları; cleanCustomerForm
  geçirgenlik bug'ı emülatörde yakalanıp düzeltildi. KALAN (Customers):
  Overview sekme düzeni (görsel yeniden düzen — kullanıcıyla bakmalı);
  AI Reply'a müşteri bağlamı prefill'i; native segment+tercih UI'ları.
- Envanter/Files 3. aşaması (aşağıdaki eski liste).
Envanter/Files raporunun 3. aşaması: partial reservation, partial purchase receipt,
maliyet katmanları, iade/hasar/kayıp/fire, BOM/reçete, Shopify/Woo stok senkronu,
sipariş kartında kullanılan-miktar/swap aksiyonları, hiyerarşik lokasyonlar,
import kopya-politikaları, Tags/Storage görünümleri, kütüphaneye özel storage yolu
(kural deploy'u artık açık — istenirse yapılır), 500-üstü sunucu sayfalaması.

## KULLANICIYA BAĞLI BEKLEYENLER
- ~~reauth~~ 26 Ağu akşamı çözüldü: 5 webhook (müşteri kimliği) + storage.rules
  CANLI — envanter fotoğraf yayını artık tamamen açık.
- **DÜZELTME (31 Ağu): iOS/macOS 1.3 review'da DEĞİL — 22 Ağustos'tan beri
  satışta.** Bekleyen, Apple üretim ödemesinin deploy'u (aşağıya bakın).
- Ana repo push (commit'ler hazır), mağaza sürümleri (Android 0.1.9 paketi hazır,
  Android 0.1.8; native kütüphane + Files sekmesi bir sonraki sürümle),
  VAPID anahtarı (+ App Check — Schedule raporu §17 de doğruladı),
  "Recalculate Taxes" düğmesi (mağaza sürümlerinden sonra).

---

## SIRADA — AKTİF KUYRUK: iki yeni rapor (27 Ağu)
Kaynaklar: NivaDesk_banking.md ve NivaDesk_notes.md (repo kökünde).
Talimat: iki özellik TEK TEK, detaylıca, TÜM platformlara.

### 1) BANKING (önce bu)
**Kritik 1-8 TAMAM (27 Ağu, sunucu+web CANLI):** kalıcı provider tx kimlikleri
(provider/providerTransactionId/normalisedProviderId/providerReference +
firstImportedAt) ve normalised id ile pending→booked hayalet mutabakatı;
Pandle kimlikleri (importedId/bankTransactionId + attempts/lastError izi);
deterministik doc-id = unique constraint; Pandle match sırası (manuel onay >
referans > tutar+tarih, ret listesi) + pandleConfirmMatch/pandleRejectMatch +
push'ta sunucu-tarafı eşleşme muhafızı (yön+kuruş+tarih toleransı);
requestId'li idempotent push (pandleSyncRuns defteri, tekrar = stored result);
provider-bağımsız model: 10 kodluk NivaDesk VAT listesi (ZR≠EX, MX=split
gerekir) + bankCategories kayıtları (rename kaskadı, aktif/pasif, Pandle/QB/
Xero mapping + tax fallback çevirisi); 7 review statüsü (tekli+toplu+otomatik
confirmed/sync_error geçişleri); drawer'da BANK DATA (salt-okunur) bölümü.
Ekstra kapanan Yüksek/Orta maddeler: kural formu VAT+appliesTo (vatCodeAuto
ile uygulanıyor; DOĞRULANMIŞ tutarsızlık kapandı), sync activity paneli
(drawer'da Pandle ID/hata/eşleşme durumu), pending/posted gösterimi, custom
kategoriler + mapping yönetimi (Rules sekmesi), review bulk. Emülatör:
banking-core.mjs 45 assert; web drawer/kategori/kural formu tarayıcıda
uçtan uca doğrulandı. 14 fonksiyon + firestore.rules deploy edildi; 51 yeni
anahtar × 11 dil. Native parite ajanları (Swift+Kotlin) bu dilim için çalıştı.
**Yüksek liste de TAMAM (27 Ağu, B2 dilimi, 4 platform):** split transaction
(bankSetTransactionSplits: toplam kuruşuna denk, ≤12 satır; Pandle push'ta
split engeli; web/Swift/Kotlin editörleri canlı toplam göstergeli);
incoming↔order payment eşleştirme (bankMatchIncomingToOrder:
suggest→link→create/unlink; mevcut payment bankTransactionId ile damgalanır,
create idempotent — asla çift kayıt); incomingKind ayrımı (transfer/owner
contribution/loan hasılat sayılmaz, Incoming KPI hariç tutar); receipt
Choose from Files (fileRecordId referansı, kopya yok, çöp korumalı, silme
yalnız bank_receipts yükünde); aranabilir sipariş seçici; çoklu hesap
filtresi. Emülatör: banking-links.mjs 29 assert. Native parite iki ajanla
(BUILD SUCCEEDED ×2 + BUILD SUCCESSFUL). Kalan: multi-currency alanları
(TrueLayer verisi geldikçe).
**Orta'dan kapananlar (27 Ağu gece, B3):** Accounting review kartı (dönem
bazlı 6 kutu → tıkla-filtrele, txReview çipi); rule priority (en uzun anahtar
kazanır) + categoryAutoRule izi; consent bitişi saklanıyor+gösteriliyor
(90 gün, ≤14 gün amber); Disconnect/veri silme AYRILDI (disconnect rızayı
keser veri kalır, purge ayrı onay; banking-b3.mjs 11 assert); receipt güven
% zaten OCR listesindeydi. 6 fonksiyon daha deploy edildi.
**Kalan Orta:** recurring güven/fiyat-değişimi alan zenginleştirmesi (temel
tespit+priceChange var); Supplier/Purchase/Inventory panel genişletmesi;
audit log (kural izi var, genel log yok); Overview soruları
(dönem/pending/transfer açıklamaları).
**Recurring zenginleştirme TAMAM (27 Ağu gece 3, 4 platform):** güven
derecesi (High/Medium/Low), tutar aralığı, ayın beklenen günü, "Detected from
N payments"; Upcoming'de "around <tarih>" + "Based on the last N monthly
payments" + "These are estimates, not booked payments." (§7+§22-23). Web'e
ayrıca Overview dönem açıklaması (§4) + drawer'da Purchase→Inventory zincir
satırı (§14) eklendi (bu iki metin native'e sonraki mikro-turda taşınabilir).
**B3 native paritesi de TAMAM (27 Ağu gece 2):** Swift'te Accounting review
kartı + txReview filtresi + native Disconnect/purge (onay metinli; Reconnect
web deep-link) + consent satırı + kural izi (BUILD SUCCEEDED ×2); Android'de
aynı yüzey, bağlantı yönetimi bilinçli web'de (BUILD SUCCESSFUL). BANKING
RAPORU 4 PLATFORMDA KAPANDI — kalan: recurring alan zenginleştirme,
Supplier/Purchase panel genişletme, genel audit log, multi-currency,
Overview açıklamaları.
**Dört kesin kural (uygulandı):** read-only scope; provider tx ID benzersiz;
Pandle'da mevcut hareket match edilir, yeniden yaratılmaz; kategori/VAT
hard-code değil mapping.

### 2) NOTES
**Yüksek TAMAM (27 Ağu, web + sunucu + NATIVE: Swift BUILD SUCCEEDED ×2,
Android BUILD SUCCESSFUL — evrensel editör, bağlı notlar, merkezi Reminders,
etiket yönetimi, workspace fan-out üç platformda):**
reminder bug'ı kökten kapandı (yerel tarih parse + NaN muhafızı, toISOString
UTC kayması yok, okuyucu {seconds}/ISO tanır, görsel yükleme ara kaydı
taslağı taşır, başarısız yazma sesli; mirror payload reminderDateMillis
kabul eder — sharePersonalNote deploy bekliyor); noteType
(Personal/Order/Customer/Team) + visibility (Only me/Workspace) ayrı
eksenler; evrensel form (aranabilir sipariş bağlama + müşteri adı; Project
sekmesinde + New Note order tipiyle açılır); workspace görünürlüğü mevcut
davet altyapısıyla üyelere fan-out; Project Notes sayacı = liste (8/6 bitti);
Reminders merkezi (not hatırlatıcıları + sipariş Schedule&Alerts tek liste).
**Orta TAMAM:** Customer Notes merkezi görünümü (müşteri Notes sekmesi bağlı
kayıtları listeler) + sipariş Notes kartında "From the Notes app" şeridi;
arama kapsamı (etiket + bağlı adlar) + aramaya/etikete özel boş durumlar;
label rename/sil (renk yok — bilinçli, not rengi zaten var).
**Kalan (sonraya):** client_portal görünürlüğü (portal fazı); collaborator
view/edit ayrımı (mirror sync sunucu işi); checklist; recurring
reminder/snooze; task'a dönüştürme; attachments↔Files; activity; kısayollar;
masonry/kronolojik akış kozmetikleri; created/updated by gösterimi; admin
insights notes sayacı (collectionGroup + index gerekir).
**Temel kural (uygulandı):** not BİR kez oluşturulur; Notes menüsü, Order
kartı ve Customer ekranı aynı kaydı kendi bağlamında gösterir.

---

## TAMAMLANAN raporlardan not (eski SIRADA)

### A. NivaDesk_schedule.md — kalan orta/iyileştirme
**26 Ağu akşamı eklendi:** hover eşleştirme (kart ↔ çubuk, iki yönlü),
haftalıktan uzun aralıklarda sticky ay şeridi (etiket yatayda da sabit),
range/seçim değişince seçili çubuk görünür alana getiriliyor — üçü de E2E'li.
**26 Ağu gece eklendi:** ortak toast/Undo altyapısı (StudioToastHost, AppShell'de
tek host) — schedule sürüklemesi tarih değişimini Undo'lu toast'la bildiriyor
(gerçek fareyle tam tur: sürükle → toast → Undo → tarihler geri, E2E'li), kart
taşıma "Card moved — Undo" veriyor; zoom % göstergesi preset seçici oldu
(75/100/125/150/Fit); iki ekranın alt başlığı ayrıştı ("Plan your orders" /
"Plan your team"). İlk-kullanım rehberi de eklendi (üç sürükleme jesti + Undo
notu, tarayıcı-başına bir kez). **SCHEDULE RAPORU TAMAM.**
(Not: Duration/Remaining ikili gösterimi bilinçli tek "Xd left" ile çözüldü.)

### B. NivaDesk_order_kart_sistemi.md — kalan iyileştirmeler
**26 Ağu gece eklendi:** "Kart taşındı — Undo" toast'u; kart menüsünde boyut
bölümü (Fit to content / Default / Match column / S-M-L, persistLayout
üstünden); Customize cards 6 kategoriye ayrıldı + panel içi arama; ROL
ŞABLONLARI (Owner/Designer/Finance/Workshop/Compact — yalnız görünürlük,
Undo'lu; Compact 19→5 kart E2E'li) — raporun 1 numaralı önceliği.
**27 Ağu gece eklendi (2):** kart menüsünde Move bölümü (↑↓←→, drag ile aynı
mutator'lar → aynı Undo'lu toast; telefon sırası yolu da toast'lu); ⋮ ayırıcı
tutamacı; Customers araması sipariş no + proje adını da tarar; Customize
panelindeki gereksiz "Save this order" kalktı (autosave zaten var).
Reset kapsam ayrımı da eklendi ("Reset this order" / "Reset shared layout" +
kapsam-açık onay); Customers ülke alanlarına ortak datalist (UK/United
Kingdom/GB kayması için yumuşak standardizasyon).
Actions menüsü de gruplandı (Header display / Documents / Card layout).
Kalan: sol durum şeridi + zemin ayrımı (görsel karar — birlikte bakalım);
renk+etiket anlam sistemi; sipariş türüne göre düzen; kullanıcıya özel düzen.
(Hızlı sekmeler: OrderQuickFilterBar zaten karşılıyor.)

### C. NivaDesk_customers.md — kalan kritik/orta/ürün
**26 Ağu gece eklendi:** iade/iptal bakiyesi düzeltildi — Outstanding artık
yalnız borç doğurabilen siparişleri sayıyor (Cancelled + Shopify-refunded
dışarıda; brüt Total Order Value ve gerçek Paid aynen; emülatörde £800'lük
iptal kalanı Outstanding'i £0 bıraktı, E2E'li). Outstanding sıralaması da aynı
alanı kullanıyor.
**26 Ağu akşamı eklendi:** duplicate birleştirme CANLI — profil seçilince aynı
e-posta/telefonlu ikiz için uyarı bandı + "Review and merge" diyaloğu (ana kayıt
seçimi, alan bazında isim/e-posta/telefon galibi, sipariş taşıma, sunucuda tam
anlık görüntü `customerMergeLog` — istemciye kapalı, 403 testli).
`mergeWebCustomers` deploy edildi; `customer-merge.mjs` 14 assert TÜMÜ GEÇTİ;
14+1 string × 11 dil.
**27 Ağu gece eklendi:** Primary Phone gerçek alanı (profil formu + yeni-müşteri
modalı + arama + mükerrer tespiti çapraz telefon + merge seçicisi + sunucu;
3 callable redeploy, emülatörde ayrı alan olarak kaydolduğu doğrulandı) ve
SYNC ÇATIŞMA POLİTİKASI: integrationCustomerSync ("store" varsayılan /
"nivadesk" = atölye düzenlemesi kazanır, mağaza yalnız boşluk doldurur) — 5
webhook'ta zorlanıyor, Woo+Shopify ayar bölümlerinde kart, suite'te iki yönlü
kanıt (atölye telefonu korundu + boş city doldu / store'da yeniden yazdı).
**27 Ağu gece eklendi (2):** GDPR — "Export data (JSON)" (profil+toplamlar+
siparişler+notlar+aktivite, istemci tarafında dosya) ve owner-only
"Anonymize (GDPR)": profil + TÜM siparişlerden kişisel alanlar silinir,
finansallar kalır, history'ye iz düşer, geri alınamaz (onay metni önce export
der). Emülatörde kanıtlı: 3 sipariş yeniden adlandı+temizlendi, tutarlar
korundu. `anonymizeWebCustomer` deploy edildi.
**Kritik kalan:**
telefon–WhatsApp gerçek alan ayrımı (şema işi); GDPR export/anonymize/delete
akışları (Shopify redact kısmen var); iade/refund'un müşteri değerine
yansıması. **Orta:** ek sıralamalar (Last Order/Highest Value/Outstanding…);
manuel form genişletme (shipping/company/consent); ülke standardizasyonu;
arama kapsamı (sipariş no/etiket/posta kodu). **Ürün:** segmentler/etiketler,
Messages/AI Replies bağı, hızlı aksiyonlar, Overview sekme düzeni, profil
entegrasyon paneli (last synced/resync/raw data).

## Inventory Faz 3 (NivaDesk_inventory_files.md haritasından) — 27 Ağu gecesi

**TAMAM — dört platformda:**
- I0 harita kusurları: "removed" tanınan statü + konum taşıması ledger'da
  "moved" izi (lastMovementAtMs'e dokunmaz).
- I1 dürüst rezervasyon: partiallyReserved statüsü, reservedValue gerçek
  rezerve miktarla, sipariş kartında "5 / 15 pcs · Vault Z", recordInventoryLoss
  (returned/damaged/lost/wastage — sebep ledger'da; rezerve stok korumalı).
- I2 tüketim+takas: consumeInventoryForOrder (kısmi/tam; ledger "used" ref=sipariş),
  swapInventoryForOrder (tek transaction bırak+tut); sipariş kartında
  "Use on the job" / "Swap…".
- I3 kısmi mal kabulü: receivePurchase satır+miktar bazlı, partiallyReceived
  statüsü, satırda receivedQuantity, ürün onHand=gelen/incoming=kalan;
  "Receive lines…" + "Receive the rest"; kısmen alınmış satın alma
  düzenlenemez/silinemez.
- I4 içe aktarma çift-kayıt: parse SKU/seri ön-taraması ("Already in stock"
  rozeti) + create/skip/update politikaları (update sayfayı gerçek yapar ama
  numara/statü/rezervasyona dokunmaz, rezervin altına çekemez); yeni sütun
  takma adları barcode/ean/upc→sku + ownership/condition/year/description.
- I5 sayfalama: listInventoryItems cursor+hasMore (çift DESC, indeks gerekmez);
  web/Mac/iPhone/Android'de "Load the next 500 items".
- Tedarikçi evrak alanları: code/address/vatNumber/currency (form+kart).
- Envanter etiketleri: items.tags (müşteri segment deseni), form chip editörü,
  detay paneli, aramada eşleşme.
- Test: functions/test/inventory 10 suite (hepsi düz node script) — 10/10.
- Yayın: round 14–19 canlıda chunk-doğrulamalı; fonksiyonlar isimle deploy edildi.

**Faz 3 kalan (büyük/dizayn işleri):**
- Hiyerarşik konumlar (yeni koleksiyon + kurallar + alt-ağaçla taşıma) — büyük.
- BOM / reçete (net-yeni) — büyük.
- Shopify/Woo stok senkronu — BLOKE: nivadesk-order-management/shopify.app.toml
  salt-okunur scope; kullanıcı kararı gerek (scope genişletme yeniden onay ister).
- Files kütüphanesi depolama yolu göçü — ayrı faz.
- Native parite: tedarikçi alanları + etiketler ajan turu 27 Ağu gecesi
  başlatıldı (Swift+Android; commit bekliyor olabilir — git log'a bak).

## Birikmiş işler dalgası — 27 Ağu gece (rounds 20–22, hepsi canlı chunk-doğrulamalı)

**Customers kalanları KAPANDI (round 20):** whatsappNumber gerçek alan
(payload/anonymize/merge/profil/modal/mükerrer tespiti/arama/GDPR export;
WhatsApp hızlı aksiyonu önce onu çevirir; eski sütun "Phone (from orders)"
olarak dürüst etiketlendi); company alanı aynı yollarda; Total Order Value
altında "incl. £X cancelled or refunded" alt satırı (yalnız öyle sipariş
varsa — countsTowardBalance); arama segment etiketlerini de tarar; AI Reply
kısayolu /quick-reply'a müşteri adını taşır. 4 müşteri fonksiyonu redeploy.
(Not: A3 sıralamalar, A4 shipping/consent, A5 ülke datalist, A6 sipariş-no
araması ZATEN kapanmıştı — DURUM'daki "kalan" listesi eskiydi.)

**Banking audit log KAPANDI (round 21):** her senkron (bağlantı başına,
başarıda import sayısı / hatada sınıflandırılmış sebep), connect, disconnect
ve purge bankAuditLog'a satır bırakır (best-effort); owner-only
bankListAuditLog callable; bağlı hesap barında "Activity" → Connection
activity listesi. 5 bank fonksiyonu deploy edildi.

**Hiyerarşik konumlar KAPANDI (round 22, faz-3 büyüklerinden ilki):**
inventoryLocations ağacı (path dizgileri, derinlik ≤4, döngü/kardeş-ad
muhafızları); rename/taşıma alt-ağacı VE içinde duran ürünlerin location
dizgilerini yeniden yazar (defter satırı yok); silme çocuk/stok varken
reddedilir; web Locations paneli (girintili liste + sayaçlar + Rename/Move +
parent seçici) + ürün formunda yol datalist'i. locations suite 15 assert;
3 callable deploy. Emülatörde uçtan uca: Kasa X/Çekmece 1 → ürün kondu →
Kasa Y rename → ürün dizgisi kendiliğinden izledi.

**Native birleşik parite turu:** iki ajan (Swift+Android) konum ağacı +
whatsapp/company + bank Activity için 27 Ağu gecesi başlatıldı; çeviriler
web language.ts'ten bayt-bayt talimatlı.

**Faz 3'te hâlâ açık:** BOM/reçete, maliyet katmanları, Files depolama yolu
göçü, Shopify/Woo stok senkronu (kullanıcı kararına bloke).

**Reçeteler (BOM) KAPANDI (round 23, faz-3 büyüklerinden ikincisi):**
inventoryRecipes CRUD (≤30 satır) + applyRecipeToOrder — çarpanlı (≤100),
TEK transaction, hepsi-ya-da-hiçbiri (kapasite/sahiplik/statü kontrolleri
yazımdan önce; sığmayan satır hiçbir şeyi rezerve ettirmez, hata mesajı
sığmayan parçayı adıyla söyler). Web: Manage → Recipes paneli + sipariş
kartında "Use a recipe…" (kaç işlik çarpanıyla). recipes suite 15 assert;
4 callable deploy; 23 anahtar × 11 dil. Emülatörde uçtan uca: 2 satırlık
reçete tek hamlede rezerve.
**Maliyet katmanları: TASARIM SONUCU — gerek yok.** Bu mimaride her satın
alma partisi zaten kendi maliyetini taşıyan AYRI ürün dokümanı; FIFO/katman
makinesi eklemek çözdüğü olmayan bir problemi çözerdi. (Aynı-SKU partileri
tek karta birleştirme istenirse o ayrı bir tasarım kararı — kullanıcıyla.)
**Native reçete paritesi:** birleşik parite turu (konumlar+whatsapp+bank
Activity) bittikten sonra ayrı turla.

**Birleşik native parite TAMAM (27 Ağu gece):** Swift 1c2ec0d (iki build
SUCCEEDED) + Android 197b848 (BUILD SUCCESSFUL) — konum ağacı sekmesi
(sayaçlar/Rename-Move/öneriler), müşteri WhatsApp+Company alanları
("Phone (from orders)" dürüst etiketi, WhatsApp aksiyonu doğru numarayı
çevirir, refund alt satırı iki platformda da VERİYLE yapıldı), bank
Connection activity listesi. İki ajan da birer gizli veri-kaybı yolu
yakalayıp kapattı: Android save-path'i web'de girilen primaryPhone'u
eziyordu (artık round-trip); Swift'te alanlar Codable tam-yazımlara girdi.
Reçete paritesi ajanları (Swift+Android) başlatıldı.
**Bekletilen tek kod işi:** Files depolama yolu göçü — canlı storage
nesnelerini taşıyan geri-dönüşsüz bir göç; kullanıcı onayıyla ayrı oturumda.

**Files depolama yolu göçü KAPANDI (27 Ağu sabahı, kullanıcı onayıyla):**
storage.rules'a companies/{id}/library/ bloğu (read+create only; nesneler
değişmez, silme sunucunun çöp-önce işi) deploy edildi; web yüklemeleri artık
kendi yoluna iniyor (round 24 canlı: yeni yol bundle'da, eski squat çıktı).
Üretim taraması (kuru + canlı, tüm şirketler): eski yolda SIFIR nesne —
kütüphane 1 günlük, göç fiilen no-op. Süpürme kalıcı araç olarak
functions/scripts/migrate-library-storage.mjs'te (idempotent: kopyala →
kayıt → portal-URL yeniden bas → orijinali sil). Tek seferlik anahtar-korumalı
HTTPS fonksiyonu işini bitirip üretimden silindi (404 teyitli), kaynağa hiç
commit'lenmedi.
**Reçete paritesi TAMAM:** Swift ad39d4a (BUILD SUCCEEDED ×2) + Android
e172d70 (BUILD SUCCESSFUL) — Recipes sekmesi + sipariş kartında "Use a
recipe…" iki native'de.
**FAZ 3 KOD İŞLERİ BİTTİ.** Kalan tek karar: Shopify/Woo stok senkronu
(salt-okunur scope → yazma izni mağaza yeniden-onayı ister — kullanıcıda).

---

## TAMAMLANDI — Chatbot/Support yeniden kurgusu (27 Ağu, round 25 CANLI)
Kaynak: repo kökünde `NivaDesk_chatbot 2.md` + kullanıcının vereceği "Ask
NivaDesk" tasarım görseli (koyu yeşil başlık, premium sade; referans ekran
görüldü). KULLANICI AYRI BİR GÖREVLE BAŞLATACAK — kendiliğinden başlama.

**Akış (görselle birebir):**
- Pencere açılınca form YOK; direkt sohbet: "Hi 👋 How can I help with
  NivaDesk today?" + 4 öneri çipi: Plans & pricing · Features · Migrating
  to NivaDesk · Talk to our team.
- Başlık: "Ask NivaDesk" / "Get an instant answer, or talk to our team if
  you need us." Alt bilgi: "Conversations are saved and secure · Privacy
  policy". Kullanıcı balonunda saat + çift tik; AI balonlarında sparkle
  avatar, insan cevabında FOTO + isim (örn. "Sarah · 10:47 AM") — AI mı
  insan mı HER ZAMAN belli.
- AI önce cevaplar (Knowledge Base arka planda; ayrıca "Search KB" düğmesi
  YOK). Emin değilse UYDURMAZ: "I'm not fully sure about this one. I can
  pass this conversation to the NivaDesk team." + [Send to team] [Keep
  chatting]. Handoff'ta şerit: "Handed to NivaDesk team"; sonrasında AI
  susar, ekip AYNI thread'e yazar. Küçük "Talk to a person" seçeneği her
  an erişilebilir. Thread asla forma dönmez/ölmez.
- Login'li NivaDesk kullanıcısından email/isim İSTENMEZ; destek tarafında
  bağlam görünür: "Gunes · EGGcraft Ltd / Orders: 42 · Plan: Pro / Current
  page: Banking → Transactions / Conversation: …".
- E-posta politikası: TÜM konuşmalar Support inbox'a; email bildirimi
  YALNIZ needs_human'da, kullanıcı "talk to team" dediğinde ve insan
  cevabından sonra kullanıcı tekrar yazdığında. AI'nın çözdüğü sorular
  için email yok; istenirse günlük özet ("Today: 23 AI conversations ·
  19 resolved · 4 need review").
- Mevcut "Leave your email and we'll come straight back to you" metni
  kalkar. Stocksmith'in üç büyük kartı ALINMAZ; yeşil premium tasarım
  korunur, gerçek chat arayüzüne dönüşür.
Mevcut altyapı notu: postWebsiteChatMessage canlı (23 Ağu), app-support
ticket→Hostinger SMTP maili var — bu kurgu o akışın üstünü yeniden yazar
(email spam'ini needs_human'a indirger).


**Chatbot kurgusu uygulandı (27 Ağu, round 25 canlı chunk-doğrulamalı):**
- Widget görselle birebir: form yok, "Hi 👋" + 4 çip, saat/çift-tik'li ziyaretçi
  balonu, sparkle-AI / isimli-insan avatarı, yuvarlak input + daire gönder,
  kilit+privacy alt bilgisi. 20 anahtar × 11 public dil YENİDEN çevrildi.
- Dürüstlük yolu: asistan JSON {reply, confident} döner; emin değilse spec
  cümlesini ziyaretçi dilinde söyler, widget [Send to team][Keep chatting]
  sunar; handoff "Handed to NivaDesk team" şeridi yazar, asistan kalıcı susar,
  AYNI thread insanla sürer; "Talk to a person" her an bir tık.
  websiteChatRequestHuman yeni callable.
- E-posta politikası: TÜM konuşmalar Support inbox'ta; mail YALNIZ handoff'ta
  ve insan devredeyken gelen ziyaretçi cevaplarında. AI'nın çözdükleri mail
  atmaz. (Günlük özet v1'de bilinçli yok.)
- Login'li kullanıcıdan e-posta hiç istenmez; createWebsiteChat sunucuda
  kimlik+workspace+plan+sayfa damgalar; Settings→Support→Website Chats'te
  bağlam kartı + "Asked for a person" bayrağı (6 anahtar × 11 dil).
- Bonus: website asistanı artık rehberden zeminleniyor (in-process corpus,
  top-3 bölüm) — "detay rehberde" derken rehbere kör olma çelişkisi bitti.
- Kanıt: emülatörde uçtan uca (çip→balon→handoff→divider; bilet dokümanında
  accountName "QA Review"/plan/needsHuman); ÜRETİMDE iki sonda — emin yol
  "£19 per month" (confident:true), emin-olmayan yol spec cümlesi
  (confident:false). 6 fonksiyon isimle deploy (websiteChatRequestHuman yeni).
- Native: destek kutusu bağlam kartı paritesi için iki ajan çalışıyor.

## KALICI SÜREÇ KURALI — "bot anlatabiliyor mu?" (27 Ağu, kullanıcı talimatı)
Her yeni özellik/modül ancak şunlarla KAPANIR:
1. guide.ts'e EN+TR rehber bölümü (kullanıcının yapacağı işler diliyle,
   menü-adım düzeyinde; diğer diller tasarım gereği İngilizce'ye düşer).
2. `node functions/assistant/buildGuideCorpus.js` + getUserGuide/askAppAssistant/
   createWebsiteChat/postWebsiteChatMessage deploy'u (JSON'lar fonksiyonla taşınır).
3. Üretim sondası: özelliğe dair bir nasıl-yapılır sorusu website asistanına
   sorulur — gerçek adımlarla confident:true beklenir; rehber kapsamıyorsa
   asistan confident:false + Send-to-team verir (blöf yasak, kural promptta).
4. Bot düzgün anlatamıyorsa özelliğin kendisi anlatılabilir hâle getirilir
   (adlandırma/akış sadeleştirme) — "gerekirse özellikleri botun anlatacağı
   şekle getirelim".
27 Ağu'da Banking + Envanter bölümleri bu kurala göre yazıldı (41→43 bölüm);
fiş sorusu üç aşamada kanıtlandı: dün blöf → sabah dürüst devir → şimdi
gerçek adımlar.

---

## SIRADA — İki yeni rapor (27 Ağu, "bu işlerden devam et")

### 1) NivaDesk_dashboard.md — Dashboard finans raporu (ÖNCE BU)
**Kritik:** üst menü Month/Year Net ≠ Dashboard Net Profit (üst menü VAT ve
Extra Spending düşmüyor — doğrulanmış; tek formüle bağla + hover'da formül);
finansal metrik adları tek merkezi tanıma; cash/accrual ayrımı (asgari:
Invoiced Revenue / Payments Received / Outstanding ayrı kartlar).
**Yüksek:** Growth işareti yanlış (+24.8% ↔ gerçek −24.8%); "Standard Tax
(Services/New)" kartı → Revenue (+alt notta vergi kuralı); Pending →
Outstanding Balance tanımıyla; refund/cancel/chargeback hesapları; Extra
Spending Summary dönem kapsamı (Year filtresinde all-time gösteriyor);
VAT set-aside'da input VAT/ödenmiş ayrımı.
**Orta:** Active orders/Due soon formül tooltip'i + tıklanabilir sayaçlar;
Bank Activity → "Net Cash Flow This Month" adı + bayat senkron uyarısı
("Last synced 4 days ago" + turuncu); grafik tooltip/drill-down; Customize
genişletme (sırala/boyut/preset/reset); store-channel filtreleri; çoklu para
birimi; Custom aralık preset'leri (Last 7/30, quarter, tax year) + CSV dosya
adına aralık; Start>End engeli.
**Ürün:** dashboard şablonları (Owner/Finance/Ecommerce), AOV, new/returning,
tıklanabilir KPI'lar, muhasebe modu seçimi.

### 2) NivaDesk_domain_link.md — Müşteri portalı özel domain
Model: varsayılan `workspace.nivadesk.app` + isteğe bağlı CNAME
`track.musteri.com` → `customers.nivadesk.app` (Dubsado/Plutio modeli;
Cloudflare for SaaS Custom Hostnames incelenecek). Entity adı genel:
`workspaceClientDomain` — yalnız tracking değil TÜM client-facing yüzeyler
(portal, estimate, invoice, pay, files). Branding ayrıları: logo, renk,
başlık, favicon, iletişim, Powered by NivaDesk ON/OFF. URL'lerde yalnız
yüksek-entropi token (sıralı ID asla — mevcut /e/<token> zaten böyle).
Domain değişince eskiler 301 ile yenisine; kaldırılınca fallback çalışır.
Plan: Pro'da dahil (Seçenek A), Team'de + custom sending email.
**Altyapı notu:** *.nivadesk.app wildcard DNS + Cloudflare for SaaS kurulumu
KULLANICI tarafında; kodda host-çözümleme + doğrulama + branding ben yaparım.

---

## 27 Ağu — Dashboard raporu S1+S2 KAPANDI, Domain-link D1 CANLI

### Dashboard finans raporu — Kritik+Yüksek tamam, 4 platform
- Kritik'lerin ikisi rapor yazılmadan HEAD'de zaten çözülmüştü (üst menü
  "Margin" adı 881b33c'te, Growth işareti de düzeltilmiş) — rapor eski
  sürüme bakıyordu.
- Web S1 (tur 27): Revenue kartı + accrual hint, YENİ Payments Received
  kartı (totals.received), Outstanding Balance, Cost/VAT/Net Profit
  formül tooltip'leri, üst pill'ler tıklanabilir (/orders, /customers),
  bank tile'ları "Spent this month/year" + bayat senkron metni
  ("N days ago" >12sa), Extra Spending dönem kapsamı sayfa filtresine bağlı.
- Web S2 (tur 28): Custom aralık preset'leri (Last 7/30 days, This/Last
  quarter, UK tax year 6-Nisan), start>end sessiz takas + min/max,
  toISOString UTC kayması düzeltildi (BST'de gün kayıyordu — yerel
  YYYY-MM-DD formatla).
- MCP kâr sapması: expectedRevenue = totalPrice || (paid+remaining+custom).
- Native parite: Swift 1c03264 + Android af75195 (ikisi de push'lu, iki
  platform da derlenip doğrulandı). Android'de financialShowBaseCost
  kapısı KPI/grafik/YoY/widget köprüsüne kadar işlendi.
- **Takip:** Android Cost kartı extra spending'i hâlâ dışlıyor (web'in
  dashboardCostTotal'ı dahil ediyor) — ayrı bir tur ister. Android'de
  custom aralık seçici, bank tile'ları, Active/Due-soon sayaçları bilinçli
  atlandı.
- Kalan (Orta/Ürün): grafik tooltip/drill-down, Customize genişletme,
  store-channel filtreleri, çoklu para birimi, refund/chargeback dökümü,
  VAT set-aside input-VAT ayrımı, CSV dosya adına aralık, şablonlar.

### Domain-link D1 — kayıt defteri + Settings UI CANLI
- functions/clientDomains.js (e1c7c57): tek `clientDomains` koleksiyonu,
  host → workspace tek okumada; 6 callable deploy edildi
  (getClientDomainConfig/setClientSubdomain/requestClientDomain/
  verifyClientDomain/removeClientDomain/resolveClientDomain).
  Slug rezerve listesi + transactional devir; custom host Pro/Team kapılı,
  apex ve path reddi ("yourdomain.com/track" açıklamalı); doğrulama DNS'in
  GERÇEKTEN döndürdüğünü raporluyor. 20 assert'lik suite yeşil.
- Web (512da92, yayın turu 29 CANLI): Settings → "Customer Portal Domain"
  (design grubu, yalnız owner). Subdomain claim + custom domain
  bağla/doğrula/kaldır, CNAME talimatı kod bloğu, dürüst doğrulama geri
  bildirimi. 32 string 12 dilde.
- Dev E2E: "my-studio-qa" slug alındı; track.eggcraft.co.uk eklendi,
  Verify dürüstçe "No CNAME record found yet" döndü.
- **Kalan (D2+):** Next.js middleware host-rewrite, portal branding
  (logo/renk/başlık/favicon/poweredBy), spoof-guard (token'ın workspace'i
  servis eden host'a sahip mi), eski link 301.
- **KULLANICI tarafı:** *.nivadesk.app wildcard DNS + Cloudflare for SaaS
  custom-hostname servisi kurulmadan custom host'lar yalnız rezerve edilir,
  servis edilmez (UI bunu dürüstçe söylüyor).

---

## 27 Ağu gece — Rehber kuralı ilk uygulama + Android Cost + Website raporu (tur 29-31)

### Rehber + bot (ayakta duran kuralın ilk rutin uygulaması)
- guide.ts: Dashboard bölümüne "Para kartlarını okumak" (Revenue vs Payments
  Received vs Outstanding, Net Profit formülü, dönem preset'leri) + Settings
  altına "Customer Portal Domain" (set-client-domain) EN+TR eklendi.
- Korpus 43→44 bölüm; 4 fonksiyon deploy edildi; üretim probu GEÇTİ
  (track.mysite.com sorusuna gerçek adımlar, confident:true).
- Not: probe sırasında support inbox'a 1 QA sohbeti düştü (hello + domain
  sorusu) — silinebilir.

### Android Cost kartı sapması KAPANDI (a6fea64)
- dashboardSummaryCards rolledCost'a stats.extraSpending eklendi — web'in
  dashboardCostTotal bileşimiyle birebir (base cost kapılı, extra spending
  koşulsuz). Diğer yüzeyler (grafik/YoY/CT/widget köprüsü) zaten doğruydu.
  BUILD SUCCESSFUL, push'landı.

### NivaDesk_global_website.md — İLK İKİ GEÇİŞ CANLI (tur 30+31)
Kullanıcı talimatı (27 Ağu gece): dosya kuyruğa, yeni özellikler siteye
eklensin, amaç kullanıcının ürünü ANLAMASI; her şey sormadan yapılsın.
**Yapıldı (Yüksek öncelik 8/8'in 7'si + orta birkaçı):**
- Terminoloji: Open Portal → "Open NivaDesk", Login → "Log in"; footer
  support sütununa Log in eklendi; CTA seti standardize.
- Ana sayfa yeniden sıralandı: Hero → hikâye → özelleştirme → sipariş
  kartları → ChatGPT → YENİ "Beyond the order board" bölümü → platformlar
  → CTA. Yeni bölüm 6 kart: Inventory, Bank Spending, Estimates &
  approvals, Repairs intake, Files library, Your own domain.
- Dürüstlük: IMG_2056.zip → approved-design.pdf; "perfect sync" →
  senkron cümlesi; "secure ChatGPT support" → "the secure NivaDesk
  ChatGPT app"; platform durumları Available/Planned'a indirildi.
- Hero eyebrow/body genişletildi (custom orders, repairs and service
  work); heroChip Finance → "Payments & Profit"; project→order taraması
  (schedule.f1.body, plan.pro.note, aiPage.ask.q10).
- Header: Security üst menüde (masaüstü+mobil); dil seçici 🌐 + yalnız
  yerel adlar; footer yılı dinamik; chat düğmesi "Ask NivaDesk".
- ChatGPT bölümüne "Learn about security and permissions" → /security.
- Tüm değişen/yeni string'ler (26+4) 12 dilde; TR dev-preview'da doğrulandı;
  tur 30 ve 31 canlıda chunk-doğrulamalı.
**Kalan (rapor Orta/Görsel):**
- Ürün screenshot okunabilirliği (zoom/tam ekran önizleme, floating kart
  bağlantı çizgileri) — tasarım dokunuşu ister.
- Platform bölümünde Windows kartını soluklaştırma; QR modal klavye/mobil
  davranışları; içerik tekrarını azaltma (editoryal); footer'a store/status
  bağlantıları; erişilebilirlik listesi (skip-link, focus, RTL, 200% zoom);
  demo video caption/fallback; dil değişiminde tarih/para/story localization
  taraması. Rapor Home dışı sayfaları (Features/Pricing/FAQ) ayrıca
  inceleyecekti — o raporlar gelince devam.

---

## 27 Ağu sabah — Website görsel geçiş + Dashboard Orta + D2 adım 1 (tur 32)

### Website raporu görsel maddeler (CANLI)
- Hero screenshot'a "See it full size" düğmesi → tam ekran önizleme
  (Escape kapatır, scroll kilitlenir; dev'de tam tur test edildi).
- Skip-to-content bağlantısı tüm public sayfalarda; Planned (Windows)
  platform kartı soluk + kesikli çerçeve; telefonda QR yerine doğrudan
  mağaza rozeti; demo video yüklenemezse doğrudan bağlantı; footer'a
  App Store + Google Play. 3 yeni string 12 dilde.

### Dashboard Orta maddeleri (ajan, da482b7, CANLI)
- Vergi kartı "Set aside this calendar year" + 1 Oca–31 Ara tooltip'i
  (hesap gerçekten takvim yılı — kod doğrulandı).
- Extra Spending CSV dosya adı aktif aralığı taşıyor
  (extra-spending-this-month.csv / -2026-01-01_2026-03-31.csv); satır
  tarihlerindeki toISOString UTC kayması da düzeltildi.
- Grafik tooltip'i workspace para birimiyle (formatStudioMoney), sağ
  kenarda sola çevriliyor; grafik etiketleri t()'ye taşındı.
- Customize'a "Reset layout" (varsayılanla eşleşince pasif; E2E'li).
- 11 yeni string 12 dilde (language.ts).

### Domain-link D2 adım 1 (web CANLI, fonksiyon deploy BEKLİYOR)
- middleware.ts: /r/<token> → /track/<token> rewrite, her host'ta;
  üretimde doğrulandı (nivadesk.app/r/... track sayfasını veriyor).
- Portal + Estimate sayfaları serving host'u gönderiyor;
  assertHostMayServeCompany: kayıtlı bir client domain'de sunulan token
  sayfası o domain'in workspace'ine ait değilse permission-denied.
  Kayıtsız/birincil host'lar dokunulmadan geçer.
- **DEPLOY EDİLDİ (27 Ağu sabah, reauth sonrası):** getPortalForVisitor,
  getEstimateForVisitor + Notes'tan kalan sharePersonalNoteWithWorkspaceMember
  (raporlardaki "sharePersonalNote" kısaltmasının gerçek adı buydu).
  Deploy sonrası bozuk token temiz NOT_FOUND dönüyor; spoof-guard canlı.
  Not: guard yalnız KAYITLI bir domain'de host≠workspace olduğunda devreye
  girer; kayıtlı iki domain de bizim workspace'te olduğundan mevcut linkler
  etkilenmez.

---

## 27 Ağu öğle — Domain 4 platformda + Portal branding (tur 33)

### Customer Portal Domain native parite TAMAM
- Swift 5e6fb16: ClientDomainSettingsView (Workspace Design grubunda,
  Branding-PDF arası, yalnız owner), 5 callable, DilMotoru'da 25 anahtar
  12 dilde; macOS + iOS Simulator BUILD SUCCEEDED.
- Android f615631: repository + SettingsScreen ClientDomainDetail,
  TR_13 çeviri bloğu web'den bire bir çıkarıldı; BUILD SUCCESSFUL.
- Bölüm artık 4 platformda; native'de status/error satırları BAŞTAN görünür.

### Portal branding (web+server CANLI, native ajanları çalışıyor)
- saveClientPortalBranding (YENİ, deploy edildi): owner-only; hex #rrggbb
  doğrulaması; Powered by gizleme Pro/Team kapılı. getClientDomainConfig
  branding'i okur; portal VE estimate public view'ları
  accentColor/showPoweredBy taşır (getPortalForVisitor +
  getEstimateForVisitor yeniden deploy).
- Web: bölüme "Customer page branding" kartı (renk seçici + varsayılana
  dön + Powered by anahtarı + Save); portal sayfası --portal-accent
  değişkeniyle durum yazısı + ilerleme noktalarını boyar; credit satırı
  koşullu. 9 string 12 dilde. Suite 27 assert yeşil. Tur 33 canlı.
- **Gizli bug bulundu+düzeltildi:** ClientDomainSection status/error
  state'lerini D1'den beri hiç render etmiyordu — "That subdomain is
  already taken." gibi sunucu mesajları sessizdi.
- Rehber: set-client-domain bölümüne markalama alt başlığı (EN+TR),
  korpus yeniden kuruldu, 4 asistan fonksiyonu deploy, üretim probu
  GEÇTİ (confident:true). Probe support inbox'a 1 QA sohbeti bıraktı.

### ÖNEMLİ KEŞİF — dev web TAM emülatör stack'inde
- localhost:3000 functions(5001)+Firestore(8080)+auth+storage
  emülatörlerine bağlı; dünkü "dev E2E" domain claim'leri emülatör
  sandbox'ındaydı. ÜRETİM clientDomains koleksiyonu TEMİZ/BOŞ —
  temizlik gerekmez, ama kullanıcının gerçek alt alan adı üretimde
  HENÜZ CLAIM EDİLMEDİ (nivadesk.app/settings'ten yapılabilir).
- Üretim kanıtı curl ile europe-west2 URL'lerine; hafızaya kaydedildi.

### Portal branding native parite TAMAM (27 Ağu öğleden sonra)
- Swift 00bbefc: brandingCard (ColorPicker + sRGB hex dönüşümü, boşken
  #2563eb; "Use the default colour" yalnız renk seçiliyken), Powered by
  Toggle, 9 anahtar DilMotoru'da web'le bayt-bayt aynı; macOS + iOS
  Simulator BUILD SUCCEEDED.
- Android 2a02f26: ClientPortalBranding + saveClientPortalBranding
  wrapper; renk kontrolü OrderDetail'in CardColorSwatch desenini
  yeniden kullanan 11 swatch'lık FlowRow (web varsayılanı #2563eb +
  sunucu örneği #2f6f6d dahil); SettingSwitch + Save; TR_13'e 9 anahtar
  web'den bire bir; BUILD SUCCESSFUL.
- Branding artık 4 platformda; mağaza sürümleriyle kullanıcıya ulaşır.

---

## 27 Ağu — Pandle konusu yeniden açıldı (araya girme; sonra kuyruğa dönülecek)

Pandle destek (Lily) app kaydı için HTTPS redirect URL'ini sordu (ilk mailde
vardı ama yeniden istediler). Altyapı denetimi:
- **Callback CANLI:** https://nivadesk.app/pandle/callback → 200 (parametreli de).
- **Secret'lar kayıtlı:** NIVADESK_PANDLE_CLIENT_ID / _SECRET v1 ENABLED
  (gerçek kimlikler gelene kadar yer tutucu).
- **Fonksiyonlar:** MD "canlıya bağlı" diyordu ama yalnız 4'ü canlıymış
  (Preview/Push/ConfirmMatch/RejectMatch) — kısmi eski deploy. 27 Ağu'da
  10'u birden isimle deploy edildi (7 create + 3 update); anonim probe
  temiz UNAUTHENTICATED dönüyor (owner kapısı çalışıyor).
- **Kimlikler gelince yapılacak:** `firebase functions:secrets:set` ile iki
  secret'a gerçek değerler + secret bağlayan fonksiyonları yeniden deploy
  (ConnectStart/ConnectFinish/RefreshMeta/Preview/Push — bağlayanlar) →
  /bank'taki PandleCard'dan Connect ile uçtan uca üretim testi.

---

## 27 Ağu akşam — Dashboard finans paketi + erişilebilirlik + ANA SAYFA v2 (tur 35)

### Dashboard finans paketi (ajan, 794be02)
- **BULGU:** iptal/iade siparişler dashboard'ın HER rakamına giriyordu
  (KPI/grafik/YoY/set-aside) — Outstanding hint'i tersini iddia ederken.
  Fix: orderCountsTowardBalance paylaşıldı; her yer dışlıyor; Financial
  Breakdown'a "Cancelled or refunded (n)" satırı.
- VAT set-aside dürüstleşti: input VAT (ST %20 / RR %5 giden ödemeler,
  split satırlar dahil) düşülür → set-aside = net VAT + CT; ödendi barı
  yeni toplama göre. vatFromGross sunucudaki formülün aynası.
  Bilinen sapma: kategori-varsayılanından gelen VAT kodu sayılmaz.
- Grafik: noktaya tıkla → panel o döneme zoom (Custom range, yerel tarih).
- AppShell üst şerit Margin'i de iptalleri dışlıyor (benim fix'im).
- 8 string 12 dilde; rehbere 3 yeni madde (iptal/netVAT/drill-down),
  korpus + 4 fonksiyon deploy, bot probu ↑ bu koşuda.

### Erişilebilirlik geçişi (ajan, 0234ff7)
- :focus-visible halkası tüm public etkileşimlilerde (modallar dahil,
  koyu zeminde beyaz); modallara autoFocus; reduced-motion boşlukları
  (platform stagger, guideFade, hover lift'ler); başlık sırası fix'leri
  (pricing h3→h2, footer h3→h2); alt/aria düzeltmeleri; 44px dokunma
  hedefleri (hamburger, footer linkleri, chat kapat/gönder, QR kapat);
  QR modal + demo video zoom/kısa ekran taşma korumaları.

### NivaDesk_global_website_home_menu.md — ANA SAYFA v2 CANLI
Rapor: önceki önerilerin ~%75-80'i uygulanmış; kalan ana sorun sıralama
(Shipping çok erken) + 12.595px uzunluk. Yapılanlar:
- **Yeni sıra birebir önerilen akış:** Hero → Everything stays connected
  (5 kategori etiketli 19 kart: Customer/Work/Order/Money/Items&records)
  → Customisation → ChatGPT (köprü cümlesi + "You control access" izin
  özeti ✓✓✓✕) → Back office → Shipping (bağlam satırı: "From the order
  board to the customer's door.") → Platforms → 3 satırlık pricing özeti
  → 3 FAQ bağlantısı → CTA.
- **Uzunluk 12.595 → ~9.376px** (pricing+FAQ eklenmişken): story
  3085→1879 (54→38vh adım, 24→10vh gap, hızlı+az kaybolan reveal),
  order-flow 2385→1665 (265→185vh).
- Metin dürüstlüğü: "no refresh" → otomatik+manuel; teslimatı kart
  işaretler (sipariş değil); "never needs a second tool" → savunulabilir
  cümle; Bank Spending → Banking preparation; one-at-a-time → review
  imported records; summarize→summarise; Web Portal → Web App;
  "…and Web."; chat notu "securely stored to provide support".
- Mobil: chat launcher 52px ikon-rozet + safe-area; panel ≤75vh.
  Customisation ikinci CTA'sı /features#customisation'a (anchor eklendi).
  Hero tam-boyut modalına altyazı satırı.
- 36 string 12 dilde (154 değiştirme + 22 yeni anahtar).
- **Bilinçli atlanan/ertelenen:** H1 alt-satırı (eyebrow zaten kapsıyor),
  floating kart bağlantı çizgileri + mobil carousel (tasarım riski),
  Windows waitlist CTA (e-posta toplama → privacy kararı kullanıcıda),
  header kırpılması (pane'de yeniden üretilemedi; nav'da transform/
  overflow yok — gerçek cihazda görülürse tekrar), scroll-story adım
  aktivasyonu pane'de test edilemiyor (programatik scroll artefaktı —
  üretimde de aynı, gerçek kullanıcıda çalışıyor).
- Pandle: destek PS-3869 referansıyla geliştirmeye iletti; kimlik bekleniyor.

---

## 27 Ağu gece — Kanal filtresi (tur 36) + iptal-dışlama 3 PLATFORMDA

### Web: mağaza-kanal filtresi CANLI (tur 36)
- Dashboard'da dönem seçicinin altında kanal pilleri (yalnız Shopify/Woo
  siparişi varsa görünür): All channels / Shopify / WooCommerce / Manual.
  customFields.Source'tan türetilir; aynı memo zincirini beslediği için
  KPI/grafik/YoY/döküm hepsi uyumlu. Dev E2E: £785 = Woo £385 + Manual
  £400. 3 string 12 dilde; rehber dashboard bölümüne madde; korpus + 4
  asistan fonksiyonu deploy.

### Dashboard finans düzeltmeleri NATIVE PARITE TAMAM
- **Android d594653:** iptal siparişler orada da sayılıyormuş —
  DashboardStats.from + WidgetSummaryBridge dahil tüm toplama noktaları
  countsTowardBalance'a bağlandı; dökümde "Cancelled or refunded (N)"
  satırı + Revenue hint cümlesi; vergi kartı Android'de yok → net-VAT
  bilinçli atlandı. BUILD SUCCESSFUL.
- **Swift 6a7871d:** aynı bulgu; Siparis.countsTowardBalance paylaşılan
  predicate oldu (MusterilerView'daki özel kopya silindi), DashboardView
  tüm toplamlar + grafik/YoY + WidgetSummaryBridge düzeltildi; döküm
  satırı + hint; vergi kartı Swift'te de yok → atlandı. macOS + iOS
  BUILD SUCCEEDED.
- Extra Spending her platformda bilinçli olarak filtrelenmedi (web ile
  aynı: harcama listesi, mutabakat değil).
- Net-VAT şu an yalnız web'de ÇÜNKÜ vergi kenara-ayır kartı yalnız
  web'de var — native'e kart gelirse net-VAT'la birlikte gelmeli (not).

---

## 27 Ağu gece 2 — Çoklu para birimi (dürüst dilim) + grid hotfix (tur 37)

### Çoklu para birimi — dönüştürmeden görünürlük CANLI
- Rapor #20 tam dönüşümün kur kararları istediğini söylüyor (hangi kur,
  hangi tarih, refund kuru) — bunlar SAHİBİN kararı, tahmin edilmedi.
- Yapılan dürüst dilim: yabancı kurlu siparişler (Shopify/WooCommerce/
  Currency customField'ı workspace sembolünün ISO karşılığından farklıysa)
  Financial Breakdown'da kendi satırlarında: "USD (çevrilmedi) (3)" +
  tutar kendi para biriminde; Revenue hint'ine açıklama cümlesi.
  Toplamlar değişmedi. 2 string 12 dilde; rehber kuralı: "NivaDesk parayı
  asla sessizce çevirmez". SYMBOL→ISO haritası settings'teki 9 sembol.
- **AÇIK KARAR (kullanıcıya):** gerçek kur dönüşümü istenirse kur
  kaynağı/tarihi/refund kuru kararları gerekiyor.

### HOTFIX tur 37 — gruplu kartlar ezilmişti
- Kullanıcı bildirdi: "Everything stays connected" bölümü bozuk.
  Neden: gruplama grid'in çocuklarını 19 slottan 5 blok'a çevirdi ama
  konteyner 210px auto-fit'te kaldı → gruplar 226px şeride, çipler
  108px'e ezildi (tur 35-36'da canlıya böyle çıkmış). Fix: blok grid'i
  2 gerçek kolon (telefonda 1), çipler 286px'e döndü. Dev'de geometri
  doğrulandı, tur 37 canlıda CSS+JS marker'larıyla teyitli.
- Ders: yapısal DOM değişikliği yapınca konteynerin ESKİ layout
  varsayımlarını da elden geçir; yalnız yeni sınıfların CSS'ini ekleme.

---

## 27 Ağu gece 3 — ANA SAYFA v3: kullanıcının mock'u (tur 38 CANLI)

Kullanıcı görsel mock verdi; talimatlar: mock tasarımı uygula, ChatGPT
bölümünü ve platform bölümünü KORU, kargo hikâyesini Features'a taşı,
fiyatlar gerçek rakamlarla.

**Uygulanan:**
- Hero: eyebrow ve chip'ler gitti; ekran görüntüsünün üstünde 4 stat
  kartı (3 orders / £2,450 / 2 in transit / 4 tasks); CTA'lar Start Free
  + Watch the demo + View Pricing→ (metin bağlantısı); hero.body mock'un
  3 kısa cümlesi. "See it full size" korunud.
- "Everything stays connected" → hub diyagramı: ortada Order kartı
  (Custom Leather Duffle Bag, In Progress, Timeline/Files/Notes çipleri),
  çevresinde Customer/Work/Money/Items kartları, kesikli bağlantılar.
  19 kartlık detay grid'i Features sayfasında yaşamaya devam ediyor.
- Customisation: mini kanban kartı (4 kolon + sürüklenen "Edge
  Finishing" hayaleti) + "Your studio. Your rules." altyazısı.
- ChatGPT bölümü OLDUĞU GİBİ korundu (talimat).
- Back office: 6 tıklanabilir ikon karosu, başlık "Powerful back-office
  features for your studio."; açıklamalar title tooltip'inde.
- Kargo: 4 ekranlık scroll hikâyesi /features'a taşındı (#shipping
  çapası); ana sayfada tek satırlık "Keep customers informed" şeridi +
  "See how tracking works →".
- Platform bölümü OLDUĞU GİBİ korundu (talimat).
- Fiyatlar GERÇEK: Free £0 Süresiz / Pro £19/ay (Recommended rozeti —
  mevcut çevrili anahtar) / Team £49/ay — mock'taki £24/£59 ve yanlış
  "per user" ibaresi KULLANILMADI. Compare plans → /pricing.
- FAQ: 3 soruluk akordeon (içe aktarma/güvenlik/iptal) dürüst kısa
  cevaplarla; mock'taki soru seti mevcut çevrili sorularla eşlendi.
- Kapanış: "Ready to run a calmer, more organised studio?" + Start Free
  + "No credit card required." — mock'taki "Join thousands of makers"
  iddiası YALAN olurdu (37 workspace), bilinçli atlandı.
- Footer mock'a çevrilmedi (yasal bağlantılar korunmalı; mock'ta yok).
- Sayfa yüksekliği ~7.204px (12.595→9.376→7.204). 37 yeni string +
  hero.body 12 dilde. Tur 38 canlıda 5 marker'la doğrulandı.

### 27 Ağu gece 3b — Mock DETAY geçişi (tur 39 CANLI)
Kullanıcı yakın-plan kırpımlarla detayları istedi:
- Hero: ekran görüntüsü DÜZ (perspektif kalktı), demo düğmesi sade
  play-pill (thumbnail+süre kalktı), gövde metni ilk cümleden sonra
  satır kırıyor (çok-dil güvenli regex: .。؟!), stat kartlarından
  görsele kesikli çizgi sarkıyor; in-transit mavi, tasks mor ton.
- Bağlantı diyagramı: 4 kıvrımlı SVG çizgi kartların arkasında; merkez
  Order kartında GERÇEK çanta fotoğrafı (hero görselinden sips ile
  kırpıldı → public/order-bag-thumb.jpg 18KB), çanta ikonlu başlık,
  YEŞİL In Progress çipi, noktalı mini çipler.
- Back-office karoları: pastel kare yerine mock'un çıplak indigo
  ikonları (#4f63d2).
- Kargo şeridi mock düzeni: yeşil çizgi ÜSTÜNDE beyaz daire ikonlar
  (pano/kamyon/kurye/koli), etiket + yeşil tik ALTA.
- Tur 39 canlı: JS'te asset referansı + CSS'te connected-lines + JPEG
  bayt kontrolüyle doğrulandı.

---

## 27 Ağu gece 4 — NivaDesk_settings_update.md İLK DALGA

Kullanıcı Settings raporu + ortak şablon mock'u verdi ("burdan devam").

### Dalga 1a — Settings chrome (commit'li, yayın Financial ajanıyla birlikte)
- Kenar çubuğuna ARAMA ("Search settings...") — bölüm başlığı+açıklaması+
  kullanıcının gerçekte yazdığı kelimeler (VAT, logo, password, Shopify,
  file size, role...) üzerinden; dev'de "vat"→PDF+Financial doğrulandı.
- Kompakt menü (açıklamalar gizli, sıkı satırlar); gruplar mock'la eşitlendi:
  Workspace, Files & Data (Data Management, Safety & Uploads ile birleşti).
- "Quick Reply Settings" → "AI Reply Settings" (rapor 9, ürün adıyla aynı).
- İçerik altında yapışkan durum çipi: ✓ No unsaved changes / ● Unsaved.
- Dürüst metinler: "Rule 1/2" → "Tax rule label — calculated on revenue /
  eligible profit"; yedek açıklaması artık dosyaları İÇERMEDİĞİNİ söylüyor
  (rapor kritik #3). 8 string 12 dilde.

### Sunucu kritikleri (deploy edildi)
- **Woo imza doğrulaması (kritik #2):** X-WC-Webhook-Signature desteği.
  saveWooSignatureSecret (owner-only, YENİ) secret'ı integrationSecrets'a
  yazar; secret kayıtlı + header mevcutken YANLIŞ imza geçerli token'la
  bile reddedilir (forgery de misconfig de sesli düşmeli). Karar tek
  helper'da, 6 assert'lik suite yeşil; teslimat günlüğü authMethod yazar.
  Secret yoksa davranış aynen eski. UI alanı Financial ajanı inince
  Woo bölümüne eklenecek.
- **Shopify resmi/manuel karşılıklı dışlama (kritik #6):** workspace'te
  AKTİF resmi mağaza bağlantısı varken manuel webhook 409 + açıklama
  döner (çift içe aktarma teknik olarak engellendi); Pause/Remove yolu
  yeniden açar.

### Bilinçli ertelenen kritikler
- #1 Malware taraması: kendi fazını ister (GCS tarama servisi/quarantine
  altyapısı) — planlanacak.
- #4 Çoklu-mağaza kimliği (store ID + external order ID): bugünkü model
  workspace başına TEK bağlantı; doc-id değişikliği mevcut siparişlerin
  dedup'unu kırar — çoklu-mağaza modeliyle birlikte ele alınmalı.
- #5 Inbound para birimi metni: settings sayfası ajandayken metin
  düzeltmesi bekliyor; sunucu tarafı zaten kaynak Currency'yi saklıyor ve
  dashboard artık karışık kurları dönüştürmeden gösteriyor.

### Dalga 1 KAPANIŞ (tur 40 CANLI, 5/5 marker — "·" unicode-escape dersiyle)
- Financial Settings mock şablonunda (ajan, 5b82556): sticky başlık
  (breadcrumb + "Workspace · Owner managed" rozeti + Discard/Save),
  iki kolon, canlı "Current workspace calculation" paneli, kırmızı
  "Existing order tools" bölgesi (mevcut önizleme/typed-confirm/undo
  akışları aynen), CT değerine "Estimated — planlama rakamı" satırı.
  Dirty takibi ve kenar çubuğu noktası bozulmadan.
- Woo İMZA UI'ı: entegrasyon ekranında "Signature check" kartı (Secret
  yapıştır → kaydet; Turn off → yalnız token, dürüst mesajla); güvenlik
  cümlesi sunucunun gerçekten yaptığını anlatıyor.
- Inbound para birimi metni (kritik #5) dürüstleşti: "workspace
  currency'de gösterilir" iddiası gitti — sipariş kendi kurunu korur.
- Rehber: Settings araması + Woo imza kurulumu EN+TR; korpus yeniden;
  4 asistan fonksiyonu deploy; üretim botu Woo imza sorusuna doğru
  adımlarla confident:true yanıt verdi.
- 25 yeni string 12 dilde (16 şablon + 9 Woo/inbound; "Turn off" zaten
  vardı, atlandı).

---

## 27 Ağu gece 5 — CLOUDFLARE GEÇİŞİ TAMAM + Settings dalga 2 (tur 41)

### nivadesk.app artık Cloudflare DNS'te (kesintisiz geçiş)
- Kullanıcı Cloudflare hesabı açtı (contact@eggcraft.co.uk, account
  9f0543bf...); zone Free planda eklendi.
- Tarama 17 kaydı buldu; dig envanteriyle birebir doğrulandı. Taramanın
  KAÇIRDIĞI mcp CNAME'i (nivadesk-mcp.web.app — canlı ChatGPT MCP!)
  elle eklendi; SaaS hazırlığı için customers A 76.13.132.222 eklendi.
- 19 kaydın TAMAMI bilinçli olarak DNS-only (gri bulut) — sıfır davranış
  değişikliği; proxy/SaaS katmanı sonra adım adım.
- Hostinger'da nameserver'lar değişti: artemis/hermes.dns-parking.com →
  jarred/virginia.ns.cloudflare.com (kullanıcı girişli, ben uyguladım).
- Yayılma dakikalar içinde tamamlandı (1.1.1.1 + 8.8.8.8 CF NS dönüyor).
  Doğrulamalar: site 200; mcp.nivadesk.app → Firebase aynı hedef,
  POST /chatgptMcp 200 + OAuth metadata 200 (OpenAI entegrasyonu
  KESİNTİSİZ); MX/SPF/TXT zone'dan birebir; customers çözülüyor;
  tur 41 marker'ları CF DNS üzerinden canlı.
- **SIRADAKİ CF adımları (ayrı oturum):** SSL/TLS mode kararı + kök/www
  proxy'sini bilinçli açma → SSL for SaaS (fallback origin
  customers.nivadesk.app) → CF API token'ıyla custom hostname
  otomasyonu (verifyClientDomain'e bağlanacak) → *.nivadesk.app
  wildcard için CNAME. Cloudflare 29 Ağu 09:00-10:00 UTC bakım
  penceresinde zone-config değişikliği yapma.

### Settings dalga 2 (tur 41 CANLI)
- Domain kurulum akışı: 4 adım (Enter domain → Add the DNS record →
  Verify ownership → Serving rollout), dürüst pil (Not configured /
  DNS required / Verifying... / Domain verified), tek dokunuş Copy,
  "Check again"; accent'e hex girişi + açık-zemin kontrast uyarısı.
- Yetki matrisi (ajan, fb01c0d): 12 satır × (Owner + 3 taban + legacy
  Admin koşullu + özel roller) — hepsi GERÇEK yaptırım noktalarından
  türetildi (orders.ts/canEdit..., memberAccess bayrakları, settings
  sayacı n/11); yapışkan ilk kolon, üye sayaçlı başlıklar, "Bu rolü
  düzenlemek N üyeyi etkiler" dipnotları. Ajan mevcut bir bug'ı da
  bayrakladı (TeamAccess re-render döngüsü — task chip).
- 13+11 string 12 dilde; rehber: domain adımları + matris + ayar
  araması; korpus deploy'ları yapıldı.

---

## 27 Ağu gece 6 — Domain her yüzeyde: Settings + public + SEO/AEO (tur 42)

Kullanıcı isteği: domain ayarları Settings'te eksiksiz, public'te anlatım,
Google SEO + AI motorları (AEO) için özellikler ön planda, bot da
üyelere menü yoluyla anlatsın.
- **Settings:** bölüme "Your customer links" kartı — canlı örnek kısa
  bağlantı (https://<slug>.nivadesk.app/r/…); takip+teklif sayfalarının
  bu adı izlediği cümlesi. (Bölümde artık: subdomain, custom domain
  4-adımlı akış, kopyalanabilir DNS, branding, link önizleme.)
- **Public:** /features'a "Your links, your name" bölümü
  (#customer-portal, 3 kart: subdomain/own domain/branding); ana sayfa
  domain karosu artık bu çapaya derin-link; /faq'a görünür soru:
  "Can customer links use my own domain?" (+FAQ JSON-LD aynası).
- **SEO/AEO:** llms.txt SIFIRDAN yazıldı (gerçek ürün: markalı linkler,
  envanter, banking preparation, e-imzalı teklif, onarım kabul, files,
  dürüst finans kuralları, 12 dil; BAYAT Free limiti 5/3→gerçek 10/10
  düzeltildi); SoftwareApplication şemasına 10 yeni featureList satırı +
  güncel açıklama; home/features meta description'ları özellik-öncelikli.
- Tur 42 canlı: llms/JSON-LD/meta/FAQ/features hepsi doğrulandı
  (features marker'ları iki ayrı chunk'a bölünmüştü — tek-chunk arama
  yanılgısı; ders: marker'ları chunk-bağımsız topla).
- Bot probu: "hangi menüden?" sorusuna confident:true, birebir doğru:
  "Settings ▸ Customer Portal Domain… 'Your customer links' kartı."
- 13 string 12 dilde (11 public + 2 settings).

---

## 27/28 Ağu gece — AKTİVASYON dalga 1 (tur 43 CANLI)

23 Ağu teşhisinin yeniden incelemesi:
- Yönlendirme yarısı ZATEN çözÜLMÜŞ: signup VE login /orders'a iniyor;
  Orders boş durumu create-first-order akışıyla düzgün. Teşhisin açık
  kalan yarısı yön göstericiydi.
- **YENİ: Dashboard "Getting started" listesi** — genç workspace'lerde
  en üstte 5 adım: ilk sipariş / ilk müşteri / ChatGPT ile içe aktarım /
  mağaza bağla / müşteri-bağlantısı adını al. İlk ikisi canlı
  sayaçlardan kendiliğinden işaretlenir; diğerleri tıklanınca
  (per-workspace localStorage) ve doğru ekrana derin-link
  (settings?section=... ön-seçili). 5/5 olunca veya Hide ile kaybolur.
- Dev E2E: 2/5 canlı tik + tık→settings(Woo) + tik kalıcılığı doğrulandı.
- 8 string 12 dilde; rehberin Dashboard bölümü listeyi anlatıyor;
  4 asistan fonksiyonu deploy. Tur 43 canlı (3 marker).
- Mobil tarafı: masaüstü kart-turu telefonda bilinçli kapalı; bu liste
  telefonda da çalışarak o boşluğu dolduruyor.
- Native parite: sonraki mağaza sürümü dalgasına not (Swift/Android
  dashboard'una aynı kart).
- **Cloudflare SaaS mimari notu:** Hostinger keyfi Host başlığı kabul
  etmez → custom hostname servisinde fallback origin Hostinger OLAMAZ;
  doğru yol CF Worker: SaaS hostname + *.nivadesk.app rotalarını
  Worker karşılar, nivadesk.app origin'ine proxy'ler (tarayıcı adres
  çubuğu müşteri domain'inde kalır, spoof-guard client-side host'u
  zaten gönderiyor). Sonraki odaklı faz bu Worker + SSL for SaaS +
  verifyClientDomain'e CF API otomasyonu.

---

## 27 Ağu akşam — Worker fazı: *.nivadesk.app müşteri sayfaları CANLI (tur 44)

- **CF Worker "wild-sunset-2fbb"** (hedef ad nivadesk-customer-pages,
  rename kozmetik/bekliyor) deploy edildi; rota `*.nivadesk.app/*`.
  Kod: scratchpad nivadesk-customer-pages-worker.js — /r/, /track/,
  /e/, /_next/, /brand/ + favicon/robots proxy'lenir
  (X-NivaDesk-Client-Host başlığıyla), gerisi 301 → nivadesk.app.
  /_next/static/ immutable cache.
- **DNS:** `*` A 192.0.2.1 PROXIED eklendi; `customers` A 76.13.132.222
  PROXIED'e çevrildi. mcp + www + apex grey-cloud → Worker'a girmiyor.
- **Uçtan uca test GEÇTİ:** customers.nivadesk.app/track/qa-check →
  200 + "Track your order" (cf-ray'li); foo.nivadesk.app → 301
  nivadesk.app; mcp.nivadesk.app/chatgptMcp POST → 200 (bozulmadı);
  www + apex 200. Yani HERKESİN ücretsiz alt alan adı
  (studio.nivadesk.app/r/<token>) ŞU AN çalışıyor.
- **SSL for SaaS (müşterinin KENDİ domain'i için):** Enable düğmesi
  fatura adresi formu açıyor ($0/ay, kullanım bazlı) — kişisel/fatura
  bilgisini BEN giremem; sekme kullanıcıya açık bırakıldı. Kullanıcı
  formu doldurunca: fallback origin customers.nivadesk.app + Worker
  rotasına `*/*` eklenmeli (custom hostname isteği *.nivadesk.app
  desenine uymaz) + CF API token (kullanıcı kendisi secrets:set yapar)
  → verifyClientDomain otomasyonu.
- **TeamAccess düzeltmesi (6734240) tur 43'le zaten çıkmış**; tur 44
  eksik olan 2 hata string'inin 12-dil çevirisini ekledi
  (language.ts, kaynak commit 9ed9a5a).

---

## 27 Ağu gece — SaaS tam devre + PDF ön ayarları (tur 45-46)

- **Cloudflare for SaaS AKTİF** (kullanıcı fatura profilini doldurdu; 100
  custom hostname ücretsiz, $0/ay taban). Fallback origin
  customers.nivadesk.app → Active. Worker rotasına `*/*` eklendi
  (custom hostname isteği *.nivadesk.app desenine uymadığı için şart).
  Regresyon testi: customers/foo/mcp/www/apex hepsi temiz.
- **verifyClientDomain CF otomasyonu:** NIVADESK_CF_API_TOKEN secret'ı
  (v1 placeholder) + clientDomains.js'e cfEnsureCustomHostname /
  cfDeleteCustomHostname; DNS doğrulanınca custom hostname otomatik
  açılır, Remove'da edge kaydı da silinir. Token placeholder iken
  otomasyon kapalı, davranış eskisi gibi DNS-only. verify+remove deploy
  edildi. KALAN: kullanıcı gerçek token'ı kendisi oluşturup
  `firebase functions:secrets:set NIVADESK_CF_API_TOKEN` yapacak
  (Zone → SSL and Certificates → Edit, yalnız nivadesk.app), sonra
  verify+remove yeniden deploy.
- **Settings UI:** adım akışı "Serving rollout" → "Certificate";
  sertifika pending/active/error durumları Check again ile yenileniyor;
  "rollout" metinleri canlı gerçeğe çevrildi (6 yeni string 12 dilde).
- **PDF ön ayarları (settings raporu High #7):** 4 chip — Müşteri
  faturası / İç iş emri / Teklif / İrsaliye + Custom göstergesi;
  hiçbir preset Internal Financials'ı açmaz; workflow-only rol yalnız
  görebildiği anahtarları değiştirir. 12 toggle etiketi + bölüm başlığı
  dahil 20 string 12 dile çevrildi (PDF bölümü artık tam yerelleşmiş).
  Dev E2E: chip tıkla→12 toggle doğru, elle değişince Custom'a dönüş.
- Rehber: set-pdf Presets alt bölümü + set-client-domain sertifika
  akışı (EN+TR), corpus 2 kez yeniden kuruldu, 4 asistan fonksiyonu
  2 kez deploy; bot sondası confident:true (Delivery note cevabı doğru).
- Rapor High kalanları: #9 backup dry-run + import raporu,
  #10 settings audit history. Workflow template preview (#5) zaten
  önceki dalgada yapılmış çıktı.

---

## 27 Ağu gece 2 — İLK GERÇEK MARKALI DOMAIN CANLI + linkler markayı giydi (tur 47)

- **Uçtan uca KANITLANDI:** kullanıcı gerçek token'ı girdi (v3; v1
  placeholder + v2 yanlışlıkla girilen Global API Key İMHA edildi),
  verify+remove v3'le deploy. Hostinger'da track.eggcraft.co.uk →
  customers.nivadesk.app CNAME'i eklendi (anında yayıldı). Settings'te
  Connect → Check again: Domain verified + CF custom hostname API ile
  otomatik açıldı, sertifika ~2 dk'da aktif, kart **Live**.
  curl https://track.eggcraft.co.uk/track/qa-check → 200 "Track your
  order"; kök → 301 nivadesk.app. Otomasyonun ilk gerçek koşusu temiz.
- **Link üretimi markalı host'a geçti:** clientPortalBaseUrl(companyId)
  (custom > slug.nivadesk.app > nivadesk.app) — createOrderPortalLink,
  sendOrderEstimate, notifyCustomerOnStatusChange (SMS) + web'de
  portalUrlForToken(token, workspace.clientPortalHost) ve
  WorkspaceContext.clientPortalHost. verifyClientDomain doğrulanan
  custom'ı company.clientPortalCustomHost'a yazar (Check again ile
  EGGcraft backfill edildi); Remove eşleşiyorsa temizler.
  "Your customer links" önizlemesi aktif custom domain'i önceler.
- 9 fonksiyon tek deploy'da; rehber bulleti (EN+TR) + corpus + bot
  sondası confident:True ("SMS ve teklif linkleri markalı adresi
  kullanır" doğru cevap). Tur 47 push (76de99c).
- **Native parite notu (mağaza dalgasına):** Swift/Kotlin portal veya
  teklif linkini İSTEMCİDE yeniden kurmamalı — callable'ın döndürdüğü
  url alanını göstersin; yeniden kuruyorsa clientPortalCustomHost/
  clientPortalSlug'u okusun.

---

## 28 Ağu — Rapor High #9 KAPANDI (çoğu zaten vardı) + cila (tur 48)

- Workflow taraması gösterdi: dry-run önizleme, sayaçlar, duplicate
  atlama, 500-cap uyarıları, sonuç raporu ve Undo 26 Ağu notes3
  dalgasında ZATEN yapılmış (importWorkspaceBackup dryRun:true +
  financeBulkRuns/undo). Rapor maddesi kapalı sayıldı; bu tur 5 cila:
  1) Bozuk JSON'da ham SyntaxError yerine dostane mesaj (12 dilde).
  2) İndirmede not edilen SHA-256 artık import'ta GERÇEKTEN kontrol
     ediliyor — önizleme "son indirdiğin yedeğin birebir aynısı" veya
     yumuşak "eski/başka cihaz yedeği olabilir" satırı gösteriyor.
  3) Önizlemeye gelen ama gösterilmeyen alanlar eklendi: mevcut müşteri
     sayısı + "Includes settings" Yes/No (bare Yes/No sözlüğe girdi).
  4) importWorkspaceBackup + undo'ya saatlik hız limiti (30/saat/uid,
     websiteChatCheckRate'e mesaj parametresi eklendi).
  5) Run-kaydı yazılamazsa Undo zaten vaat edilmiyordu — teyit edildi.
- Dev E2E: sentetik File+DataTransfer ile diyalog satırları ve dostane
  JSON hatası doğrulandı. 6 fonksiyon deploy; rehber set-data "Importing
  a backup" alt bölümü EN+TR; bot sondası confident:True (SHA-256
  cevabı doğru). Tur 48: bu + Live-domain tazelik fixi.
- Kalan tek High: #10 settings audit history (keşif workflow'u açıldı).
- Not (okuyucu bulgusu, ayrı faz): /export sayfası indirmeleri "Last
  backup" kaydını güncellemiyor; web-archive workspaceSettings ham
  dökümü allowlist'siz; clientFiles URL'leri import'ta doğrulanmıyor.

---

## 28 Ağu — Rapor High #10 KAPANDI: Settings audit history (tur 49)

- **Mimari:** onDocumentWritten(companySettings/{id}) trigger'ı
  (functions/settingsAudit.js, clientDomains gibi factory) her kaydı
  alan-bazlı diff'e çevirip companies/{id}/settingsAuditLog'a yazar —
  4 platformun doğrudan yazdıkları dahil. Bookkeeping-only kayıtlar
  atlanır; secret/JSON değerleri asla yazılmaz (anahtar adı yeter);
  openAIKeyRotatedAtMs işaretiyle anahtar DEĞİŞTİRME de görünür
  (raporun açık isteği). 90 günden eski girdiler trigger içinde küçük
  batch'lerle silinir (zamanlayıcı yok).
- **Aktör:** agent 17 callable'a lastSettingsWriteByUid damgası ekledi
  (saveSwiftWorkspaceCardProfile'dan saveWorkspaceSmsSettings'e; tam
  liste commit 4a6adf4). Trigger damga yoksa delta'daki *ByUid
  alanlarını tarar; hiçbiri yoksa "Workspace member".
- **Okuma:** getSettingsAuditLog (owner-only; auditLogEnabled
  entitlement'ı İLK KEZ kullanıldı → Pro/Team görür, kayıt her planda
  sürer). Web: Data Management'ta "Change history" kartı (owner'a),
  Load history/Refresh, insan-diline çevrilmiş anahtar adları,
  from → to satırları. 18 string 12 dilde.
- **Rules:** settingsAuditLog İKİ catch-all istisna listesine eklendi
  (server-only) ve rules DEPLOY edildi.
- **Test:** settings-audit.test.js 6 senaryo yeşil; dev emülatör E2E:
  PDF kaydı → girdi (13 anahtar, area PDF, byUid damgası aktı) → UI
  kartında "Owner · PDF · tarih" listelendi. 23 fonksiyon tek deploy
  (2 yeni + 17 damgalı + 4 asistan); bot sondası confident:True.
- **Native parite (mağaza dalgası):** Swift/Kotlin companySettings
  yazarken lastSettingsWriteByUid: uid eklemeli — yoksa girdileri
  "Workspace member" görünür (kayıt yine tutulur).
- Settings raporunun TÜM High maddeleri artık kapalı (1-10).

---

## 28 Ağu — Audit review düzeltmeleri (3 mercekli hasım inceleme; tur 50)

İnceleme kararları: döngü YOK, log gerçekten server-only, 19 damga
hunk'ının hepsi doğru yerde. Bulunan ve düzeltilenler:
- **HIGH atıf kaybı:** damga yalnız DEĞİŞİNCE imzalıyordu → aynı kişinin
  ikinci kaydı anonim kalıyordu. Çözüm: 18 damgaya eş
  lastSettingsWriteAtMs (her kayıtta değişir) + trigger ikisinden birini
  kabul eder; bayat damga yine imzalamaz (test 6-7).
- **HIGH sahte imza:** rules artık istemcinin lastSettingsWriteByUid'i
  yalnız KENDİ uid'i olarak yazmasına izin veriyor (diff/affectedKeys
  deseniyle; merge'te miras kalan eski damga serbest). Rules deploy.
- **MED gürültü:** sidebar/kart sürüklemeleri — aynı kişi + aynı anahtar
  seti 15 dk içinde → önceki girdi güncellenir (yeni doc değil); sidebar
  genişlikleri ve workspaceUserProfiles/typeWorkspaceSnapshots artık
  "Workflow & cards" alanına düşüyor. Okuyucuya 90 gün kesimi eklendi
  (kartın vaadi artık doğru). Trigger yazımı event.id ile idempotent.
- **MED Test API Connection:** openAIKeyCheckedAtMs + migratedat
  bookkeeping sayılıyor — test tıklaması artık girdi üretmiyor
  (openAIKeyWorks değişirse o hâlâ görünür).
- **LOW:** aynı anahtarı yeniden kaydetmek rotasyon sayılmıyor (secret
  ile karşılaştırma); "— → —" satırları atılıyor; SILENT_VALUE_KEY
  json$/base64'e daraltıldı (orderCardShowPreviewImage değeri görünür);
  ölü özel-durum bloğu kaldırıldı. Web: OrderDetailContent'in 2 doğrudan
  yazması artık imzalı (kural gereği yalnız kendi uid'i).
- 9 test bloğu yeşil; rules + 19 fonksiyon deploy; tur 50 push.
- Kabul edilen sınırlar: native yazmalar mağaza dalgasına kadar anonim;
  kayıt her planda sürer (bilinçli); aiKnowledgeBase 57 karakter önizleme
  yalnız owner'a görünür.

---

## 28 Ağu — Dashboard Ürün: AOV + Yeni/Dönen müşteriler (tur 51)

- Financial Breakdown'a iki ekleme: **Average order value (n)** —
  hasılat ÷ sayılan sipariş, Revenue ile aynı istisnalar (iptal/iade
  hariç, yabancı para nominal + mevcut açıklama notu) — ve
  **New/Returning customers** kırılımı: ilk siparişi aralıkta olan
  müşteri yeni; ilk-sipariş geçmişi BİLEREK tüm kanallara bakar (kanal
  filtresi açıkken bile mağazadan eski müşteri "dönen" kalır);
  hideNumbers sayıları da gizler. Altta tek cümlelik açıklama.
- Dev E2E: AOV £93.50 = 935/10 birebir; 7 yeni / 0 dönen doğru.
  4 string 12 dilde. Tur 51 canlı-doğrulandı (dashboard chunk'ları).
- Rehber: Dashboard bulleti + Customers bölümüne çapraz referans
  (ilk sonda yeni/dönen kısmını ıskaladı → çapraz bullet sonrası
  hedefli soru confident:True). Corpus 2 kez, 4 fonksiyon 2 kez deploy.
- Notes'un bekleyen deploy'u da kapandı: sharePersonalNoteWithWorkspaceMember
  (reminderDateMillis mirror fix'i) CANLIDA.
- "Templates" ürün maddesinin kaynak raporu elimizde değil — orijinal
  dashboard raporu bulunursa netleştirilecek.
- Native parite (mağaza dalgası): AOV + yeni/dönen satırları
  Swift/Kotlin dashboard'una taşınacak.

---

## 28 Ağu — Dosya linkleri markayı giydi (kullanıcı sorusu; tur 52-53)

Soru: Client Files linki ham firebasestorage URL'si görünüyor — yeni
domain sistemiyle değişir mi? CEVAP: EVET, uçtan uca yapıldı.
- **Portal (müşteri):** getPortalForVisitor dosya URL'lerini artık
  GÖRELİ /f/ maskesiyle döner (maskedPortalFileUrl) — müşteri hangi
  host'ta açtıysa orada kalır. Fotoğraf embed'leri bilinçli ham (bayt).
- **Uygulama içi (personel):** fileMask brandedHost öğrendi;
  OrderDetailContent (3 site) + FilesLibraryView.openFile (ham
  window.open'dı!) + /files sayfasının 2 ham <a>'sı artık
  workspace.clientPortalHost ile maskeli. Maske yoksa nivadesk.app.
- **Worker:** SERVE_PREFIXES += "/f/" (dashboard'dan deploy).
- **Beyaz-etiket:** /f/ route + nvViewSharedFile kendi domain'de
  "· NivaDesk" başlığını atar. KRİTİK DÜZELTME: route gerçek host'u
  Host'tan DEĞİL X-NivaDesk-Client-Host'tan okumalı (Worker origin'e
  nivadesk.app Host'uyla gider) — ilk doğrulama bunu yakaladı.
- Kanıt: kullanıcının verdiği gerçek PNG maskeli linkle
  track.eggcraft.co.uk'de 200 + başlıkta yalnız dosya adı + sayfada
  0 "NivaDesk"; nivadesk.app'te marka duruyor. Tur 52+53 canlı.
- Bilinen sınırlar: eski kopyalanmış ham linkler geçerli kalır (token
  rotasyonu ayrı iş); embed baytları Firebase'den gelir (adres çubuğu
  değil, ancak sağ-tık/inspect görür); viewer Download düğmesi custom
  domain'de CORS yüzünden ham linke düşebilir (bucket CORS genişletme
  ayrı karar). Native paylaşım yolları mağaza dalgasında.
- Rehber: set-client-domain "File links follow your name too" (EN+TR),
  corpus + 4 fonksiyon deploy (ilk denemede guide string'i kırıldı —
  python [:-1] kapanış tırnağını yemişti; düzeltilip yeniden kuruldu).

---

## 28 Ağu — İndirme düğmesi sızıntısı da kapandı (tur 54)

Kullanıcı talimatı: "tüm kullanıcıları etkileyecekse onu da kapat."
- İlk deneme (bucket CORS'u * yapmak) İKİ engele takıldı: functions
  servis hesabında storage.buckets.get/update yok (one-off fonksiyon
  403 aldı; silindi) ve Cloud Shell gunes.gocmen@gmail.com ile açılıyor
  — o hesapta da bucket izni yok. IAM genişletmeye GEREK KALMADI:
- **Çözüm: proxy indirme.** /f/ route'una ?dl=1 modu — baytları sunucu
  çeker, content-disposition: attachment ile akıtır. Yol-modu doğrudan;
  kısa-link modu nvViewSharedFile'ın yeni meta=1 JSON'uyla çözülür.
  Viewer'daki Download düğmeleri (FAB + generic) artık AYNI host'ta
  kalan göreli ?dl=1 linkleri; kısa-link viewer'ın CORS'lu blob script'i
  ve ham-URL fallback'i tamamen kaldırıldı. CORS'a hiç ihtiyaç yok →
  HER domain'de HER kullanıcı için çalışır.
- Kanıt (kullanıcının gerçek PNG'i, track.eggcraft.co.uk): ?dl=1 → 200 +
  attachment başlığı; viewer HTML'inde indirme çapası göreli /f/…,
  ham firebasestorage indirme çapası 0. (Görüntünün <img> baytları
  bilinçli olarak hâlâ doğrudan Firebase'den gelir.)
- Not: indirme baytları artık origin üzerinden akar (markalı hostlarda
  CF Worker + Hostinger; nivadesk.app'te Hostinger) — indirme tıklama
  bazlı olduğundan bant maliyeti ihmal edilebilir; sorun olursa Worker
  doğrudan storage'a fetch edecek şekilde optimize edilebilir.

---

## 28 Ağu — Block customisation paneli 4 PLATFORMDA + geniş sayfalar (tur 55-56)

Kullanıcı mock'u birebir uygulandı (kartların ... menüsü):
- **Web (tur 55 canlı-doğrulandı):** renderCardMenu → "Block
  customisation" paneli: başlık+grip+X, ikonlu eylemler (Export
  history/to-do PDF ilgili kartlarda), Position (etiketli oklar +
  "sürükleyebilirsin" ipucu), Width (Fit content/Match column), Card
  size S/M/L (aktif olan türetilir: 220/380/560/fit yükseklik eşleşmesi),
  2 sütun renk kartları, Manage colour labels, Reset/Done. Escape +
  backdrop kapatma eklendi (eskiden yoktu). Telefonda bottom-sheet.
  Reset = yükseklik+renk temizle (konum bilinçli korunur).
- **YENİ: renk anlam etiketleri düzenlenebilir** — companySettings.
  cardColorMeaningsJSON ({Red:"...",...}; boş=çipi gizle, yok=varsayılan);
  web'de editör modalı (owner-value yazımı lastSettingsWrite damgalı,
  audit'e düşer), üç platform da OKUR. Dev E2E: Red→"Acil is" kartta
  ve menüde anında.
- **Swift (c6b7583, mac+iOS BUILD SUCCEEDED, ayrı DerivedData):**
  S/M/L + Fit content + Match column (sütun üyelerine bildirim
  köprüsüyle) + kart-başına Reset + paylaşılan etiketler (FirebaseManager
  companySettings sync + logout cache temizliği AuthViewModel'de);
  DilMotoru 12 dil; alt-view'lar ayrı struct (gerçek-iPhone stack kuralı).
- **Android (1e05a0e, BUILD SUCCESSFUL):** menüye Move up/down (+
  masaüstünde left/right), S/M/L, Fit content, Match column, Reset,
  paylaşılan etiketler (StudioModels+Repository read-back), TR_14 çeviri
  haritası VE eksik olan **Export History Log PDF** (sayfalı PdfDocument,
  mevcut exporter deseni). Not: history girdilerinde yazar alanı hiçbir
  platformda yok — PDF mevcut alanları basar.
- 35 string 12 dilde (workflow fan-out, 11 ajan 20 sn); rehber Orders
  bölümü güncellendi; bot sondası confident:True (etiket yeniden
  adlandırma + S/M/L cevabı doğru).
- **Geniş sayfalar (tur 56):** AppShell wideWorkspace listesine
  /inventory, /bank, /admin eklendi; bank sayfasının kendi 1180/1320px
  iç kısıtı kaldırıldı. Dev'de shell-container-wide üçünde doğrulandı.
- Kaynak push b86748b (native commit'ler dahil); mağaza sürümü notu:
  bu parite 1.4/0.1.9 paketine girer.

---

## 28 Ağu — Giriş flaşı + Customers başlık düzeni (tur 57, 3 platform)

**1) "Yeni üye" kartlarının bir anlık flaşı (kullanıcı bildirimi) ÇÖZÜLDÜ:**
AppShell'de yeni-kullanıcı yüzeylerinin kapısı `financeOrders.length === 0`
idi; siparişler HENÜZ YÜKLENMEDEN de bu koşul doğru olduğundan her
girişte workspace-onboarding ekranı + "ilk projeni ekle" rehberi bir kare
görünüp kayboluyordu. Yeni `financeOrdersLoaded` bayrağı eklendi (cache'li
açılışta true; başarısız yüklemede de doğru set edilir) ve iki koşula da
kondu — artık yalnız "gerçekten yüklendi VE gerçekten sıfır" halinde
çıkıyor.

**2) Customers başlığı (kullanıcı isteği), 3 platformda:**
- Web: Messages + AI Reply hızlı-aksiyon düğmeleri kaldırıldı (deep-link
  okuyucuları /messages?q= ve /quick-reply?customer= bilerek DURUYOR —
  başka yerden gelen bağlantılar çalışsın); isim başlığına hover/focus'ta
  beliren kalem ikonu + "Click to rename this customer" ipucu; Customer
  details formunun İLK alanı artık "Customer name" (aynı kaydı yazar —
  dev'de test: formdan değiştir → başlık anında güncellendi).
- Mac/iOS (78795e7, macOS + iOS BUILD SUCCEEDED): Messages ve AI Reply
  chip'leri kaldırıldı; başlıkta pencil (macOS hover-reveal, iOS hep
  hafif; tıklayınca alana odaklanır); Contact Info'ya "Customer name"
  satırı — heading ile AYNI draft+commit yolu (iki alan birbirini
  ezemez), harici snapshot güncellemesi ikisinden biri yazarken taslağı
  bozmaz.
- Android (b68fddd, BUILD SUCCESSFUL): AI Reply chip'i + arkasındaki
  onOpenQuickReply pass-through zinciri + yalnız ona ait çeviri anahtarı
  silindi (nav'daki "AI Replies" ayrı anahtar, duruyor); Contact Info'ya
  editable.name'e bağlı "Customer Name" alanı (aynı debounce'lu autosave).
  Android'de zaten Messages chip'i yoktu.
- İsim HER ÜÇ PLATFORMDA da tek alan (`name`); first/last ayrımı yalnız
  Woo/Shopify webhook'unda parse edilip birleştiriliyor — değişiklik yok.
- 1 yeni string 12 dilde; agent'lar Fable 5 limitine takıldı, build+commit
  Opus ile elle tamamlandı (Android APK zaman damgası kaynaktan yeni →
  değişiklikler gerçekten derlendi).

---

## 28 Ağu — Proje notu okuduğun yerde düzenlenir (tur 58, 3 platform)

İstek: Notes menüsündeki Project Notes kayıtları da düzenlenebilsin.
Bulgu: o listede İKİ tür kayıt var — siparişe bağlı uygulama notları
(zaten tıklanınca açılıyordu) ve **siparişin KENDİ notu** (order doc'un
`notes` alanı) — düzenlenemeyen buydu.
- **Web (tur 58 canlı):** ProjectNotesView'da order-note girdisi artık
  OrderNoteEntry: tıkla→textarea, Save/Cancel, Escape iptal; kayıt
  updateOrderFromWeb({details:{notes}}) ile SİPARİŞ dokümanına gider
  (kopya yok), sonra orders yeniden okunur. Rol kapısı
  canEditOrderDetailsForRole. Dev E2E: emülatörde QA-ORDER-1'e not
  yazıldı → menüden düzenlendi → order doc'ta yeni metin doğrulandı.
- **Android (bfe41cf, BUILD SUCCESSFUL):** aynı davranış; save yolu
  onUpdateOrderFields → updateWebOrder callable (web ile AYNI sunucu
  fonksiyonu); liste canlı akıştan geldiği için yeniden okuma bile
  gerekmedi; rol kapısı order ekranının canEditWorkflow kuralının aynısı.
- **Mac/iOS (271fd01, macOS + iOS BUILD SUCCEEDED):** düzenleme modal
  sheet'ten YERİNDE editöre taşındı (TextEditor + Save/Cancel, Escape
  = cancelAction); save yolu firebaseManager.updateSiparis — sipariş
  ekranının autosave'iyle aynı. **GÜVENLİK BULGUSU (agent yakaladı):**
  Swift'teki eski sheet'in HİÇ rol kapısı yoktu — sipariş detayını
  düzenleyemeyen roller bile Notes menüsünden sipariş notunu
  değiştirebiliyordu; artık canEditOrderNotes (order ekranıyla birebir)
  hem editörü hem kaydı koruyor. 1 yeni string 12 dilde.
- Ek küçük düzeltme: ContentView'daki "projectNotes" (camelCase) anahtarı
  hiçbir zaman eşleşmiyordu (her yerde "projectnotes"), bu yüzden
  "New note" düğmesi Project Notes'ta da görünüyordu — düzeltildi.
- Rehber: Notes bölümü EN+TR bulleti (aynı metin, kopya değil vurgusu);
  corpus + 4 fonksiyon deploy; bot sondası confident:True.

---

## 28 Ağu — Envanter fotoğrafı ekleme anında + yardım paneli okunur (tur 59-60)

**1) "Add item ekranından fotoğraf yüklenemiyor" (kullanıcı bildirimi):**
Sebep: envanter fotoğraf yolu ÜRÜN KİMLİĞİNE göre kuruluyor
(companies/<c>/inventory_photos/<itemId>/...), ürün yokken yükleyecek
yer yok — o yüzden ancak listeden, kayıt sonrası izin veriyordu.
- Web (tur 59 canlı): Add/Edit formuna "Photos" satırı — dosyalar
  YEREL sahnelenir (önizleme + × ile çıkar, 12 sınırı mevcut fotoğrafları
  sayar), Save'de sıra: ürünü kaydet → dönen itemId → fotoğrafları o
  kimliğe yükle → ürünü photos ile tekrar kaydet. Yükleme başarısızsa
  ürün KAYBOLMAZ, dürüst mesaj çıkar. Dev E2E: gerçek PNG ile yeni ürün
  → photos dizisinde storage yolu doğrulandı.
- Android (c3ed821, BUILD SUCCESSFUL): aynı akış; PickMultipleVisualMedia
  + Coil önizleme; ItemPhotosDialog'un ta kendisi olan upload yolu
  yeniden kullanıldı. Yan bulgu: repository inventorySaveItem sunucunun
  döndürdüğü itemId'yi ATIYORDU — artık döndürüyor (bu olmadan
  kayıt-sonrası yükleme mümkün değildi). 12 sınırı ortak sabite alındı.
- Mac/iOS (8023948, macOS + iOS BUILD SUCCEEDED): aynı akış; PhotosPicker
  ile sahneleme + ImageIO ile 320px küçük önizleme (12 tam çözünürlüklü
  görsel telefonda bellek yükü), upload yolu ItemPhotosSheet'in ta kendisi.
  Swift'te de saveInventoryItem sunucunun itemId'sini ATIYORDU — artık
  döndürüyor (Android'dekiyle aynı sessiz eksik). 12 sınırı sabite alındı.
  İki bilinçli sapma (ikisi de daha güvenli): küçültülmüş önizleme ve
  kısmi hatadan sonra ikinci Save AYNI ürünü düzenler (web'de yeni kayıt
  oluşurdu) — createdItemId ile.

**2) "How do I…?" yardım paneli saydam görünüyor (kullanıcı bildirimi):**
Panel saydam DEĞİLDİ — hiç arka planı yoktu: CSS'te hiçbir yerde
tanımlanmamış `var(--card)` kullanılmış (tasarım sisteminde token
`--surface`). Yazı kutusu da tanımsız `--bg, #fff` ile koyu temada
beyaz kalıyordu. İkisi de gerçek token'lara bağlandı; dev'de ölçüldü:
koyu rgb(31,31,31), açık rgb(255,255,255) — tam opak.
**Aynı aileden 22 sessiz hata daha taranıp düzeltildi:** --studio-surface
/--studio-text/--studio-border (dashboard tarih alanı, Extra Spending
grupları, sipariş notu başlıkları), --plan-accent/--plan-accent-soft
(public fiyatlandırma öne çıkan kart, rozet, ikon zemini), --primary
(roller paneli). Tur 60 yayında.

---

## 28 Ağu — ChatGPT ile fotoğraftan envanter (KODLANDI, BAYRAK KAPALI)

İstek: fotoğraf çek → ChatGPT ne olduğunu tahmin etsin → kullanıcı
onaylasın (adet/fiyat konuşulsun) → envantere eklensin; fatura akışıyla
KARIŞMASIN.
- **Kısıt (kullanıcının kendi kararı):** 1.1.1 OpenAI incelemesindeyken
  yayınlanan tools/list DEĞİŞMEMELİ. Bu yüzden e-posta fişlerindeki
  desenin aynısı kullanıldı: yeni araçlar `NIVADESK_MCP_INVENTORY`
  bayrağının arkasında. Bayrak KAPALI deploy edildi ve canlı tools/list
  deploy öncesi/sonrası **byte-byte aynı** olarak doğrulandı (19 araç).
- **Yeni araçlar (bayrak açılınca görünür):** `search_inventory`
  (salt-okunur; önce ara ki kopya üretilmesin) ve `create_inventory_item`
  (yazar). İkincisi `confirmed:true` olmadan REDDEDER — ChatGPT önce
  okuduğunu (ad/kategori/marka/durum) kullanıcıya gösterip adet ve alış
  fiyatını sormak zorunda. Fotoğraf `photo` dosya parametresiyle gelir,
  SSRF-korumalı indirilip inventory_photos/<itemId>/ altına yazılır ve
  ürüne bağlanır (uygulamalardaki yolun aynısı).
- **Karışma koruması:** fatura/fiş sözcükleri (invoice, receipt, fatura,
  fiş, makbuz, irsaliye, Rechnung, facture, subtotal, total due…) ad/not/
  dosya adında geçerse araç ekleme YAPMAZ, kullanıcıyı
  attach_bank_receipt'e yönlendirir. Ters yönde de attach_bank_receipt'in
  açıklamasına "fotoğraf bir eşyaysa create_inventory_item kullan" cümlesi
  eklenir (o da bayrağa bağlı).
- Yazma yolu ORTAK: inventory.js'ten saveItemForWorkspace çıkarıldı;
  callable ve MCP aynı transaction'ı (numaralandırma, hareket defteri,
  rezervasyonlar) kullanıyor — ikinci bir ince yol yok.
- Test: test/qa/mcp-inventory.test.js 3 senaryo yeşil (bayrak kapalıyken
  liste değişmiyor; açıkken tam olarak 2 araç ekleniyor ve sıra korunuyor;
  fiş/fatura reddi ile gerçek ürün ayrımı).
- **Bayrak açılınca yapılacaklar:** NIVADESK_MCP_INVENTORY=1 →
  chatgptMcp deploy → rehbere ChatGPT bölümü (EN+TR) + corpus + 4 asistan
  deploy + bot sondası → OpenAI'ye yeni sürümde iki aracı bildir.

---

## 28 Ağu — Schedule düzeni 3 PLATFORMDA (tur 63 + native)

- **Web (tur 63 canlı):** araç çubuğu tek satır (arama/durum/sıralama →
  ‹ dönem › + Today → − N days + ↺ Fit → Week|Month|3M|6M|Year segmenti);
  etiket sütunları kalktı, "Range" açılır menüsü segmente dönüştü; zoom
  yüzdesi yerine ekrana sığan GÜN sayısı (ResizeObserver ile ölçülür);
  Team bandı + "Three ways to move" tek sessiz satırda (ⓘ ile açılır);
  dönem başlığı + "N orders · N late · N ready to ship" kaydırıcının
  DIŞINDA sabit (eskiden sağa kayıp kayboluyordu); bugün = dolu daire +
  dikey çizgi; team mini takvimi ferahlatıldı (268px sütun, 32px kare
  hücre, bugün dolu daire). 9 string 12 dilde.
- **Mac/iOS (7c0b443, macOS + iOS BUILD SUCCEEDED):** altı maddenin
  TAMAMI uygulandı (mini takvim Apple'da VAR); dokuz yeni alt-view ayrı
  file-private struct (gerçek-iPhone kuralı); 16 anahtar 12 dilde, metin
  web'den birebir kopyalandı; sürükle/boyutlandır/undo ve plan kapıları
  ellenmedi.
- **Android (ea2fb8a, BUILD SUCCESSFUL):** beş madde uygulandı; mini
  takvim Android'de YOK (parite değil yeni özellik olurdu, yapılmadı).
  Team ekranı hiç olmayan arama alanını kazandı. 27 çeviri girdisi.
  İki not: Android'in dört sıralama modu korundu (adları web'e
  uyarlandı) ve 3M/6M/Year plan kapısı Android'de hiç yoktu — dokunulmadı.
- Ayrıca aynı turda: kart panelinin kendi kaydırma çubuğu kaldırıldı
  (772→657px içerik), ana kabuktaki GEREKSİZ dış kaydırma çubuğu
  düzeltildi (11 yerde `calc(100vh - 104px)` sabiti gerçek yükseklikten
  81px büyüktü → paneller alana tam oturuyor) ve ana sayfadaki
  "Everything stays connected" diyagramı düzeldi (bağlantı SVG'sinin
  position:absolute'unu SONRAKİ bir kural eziyordu; SVG bir ızgara
  sütunu işgal edip kartları alt satıra atıyordu — kural :not() ile
  daraltıldı, üretimde ölçülerek doğrulandı).

## Settings yeniden tasarımı — `NivaDesk-Settings-AI-Design-Handoff.pdf` (2 Eyl 2026 gece)

**Durum:** 17 ekranın tamamı web'de handoff'un onaylı yönüne göre yeniden kuruldu; kodda, commit'li (`d10f266`, `ed7be73`, `c84e301` + devamı). **Round 152 ile CANLI** (3 Eyl 00:31, chunk `page-9e1aca72701bdaa3.js` doğrulandı).

**Faz A (kabuk):** `.settings-workspace` içine scoped token'lar (canvas #F3F5F9, surface #FFF, text #141827, muted #667085, accent #5865E8, success #2F9A55, caution #D97706, danger #D64545); 275px kenar çubuğu, katlanabilir gruplar (localStorage `nivadesk-settings-collapsed-groups`), 44px satır + 20px çizgi ikon, periwinkle aktif satır; tek sayfa başlığı `app/settings/pageHeader.tsx` (`SettingsPageHeader`, `SettingsStatusPill`, `SettingsCardHead`, `useSettingsHeaderActions` — bölüm kendi düğmelerini context ile başlığa yerleştirir; Financial/PDF/AI Reply/Integrations/Plan/Team bunu kullanır). Kartlar radius 12, gölgesiz; `.button.danger`, `.settings-switch`, `.settings-segmented`, `.settings-status-band`, `.settings-notice`, `.settings-facts` ortak parçalar. Koyu tema aynı token setiyle.

**Faz B (ekranlar):** Profile & Security (tek profil kartı + kimlik şeridi + Danger zone), Preferences (tema önizleme kartları + tek Save), About, Branding (canlı header önizlemesi), Customer Portal Domain (portal adresi/özel alan adı/link önizleme/görünüm), PDF Export (sol ayarlar + sağ **canlı iframe önizleme** — `invoicePreviewHtml` ResizeObserver ile ölçeklenir; varsayılan şirket numarası satırları artık sabit id'li → yanlış "Unsaved" yok), Workflow Steps (şablon önizleme + satır taşıma ↑↓ + iki sütun), AI Reply (motor seçim kartları), Customer SMS (durum bandı + anahtar satırları), Financial (anchor sekmeler + hesaplama önizlemesi + amber araç paneli), Team Access (koltuk çipi + sekmeler + üye listesi), Message Settings (izinler + genel bakış), Safety & Uploads (özet kartları + akordeon), Data Management (yedek/dışa aktarma satırları + silme kartı), Plan & Access (plan kahramanı + karşılaştırma tablosu), Integrations (duruma göre gruplama), Support (seçim kartları + form/inbox iki sütun + arama/filtre).

**Tuzaklar:** (1) Chrome, dev sunucusunun `page.js` chunk'ını önbellekten sunar — HMR sonrası eski görünüm; `fetch(url,{cache:"reload"})` ile temizleyip yeniden yükle. (2) `useSettingsHeaderActions` deps'ine ebeveynden gelen callback koyma (her render yeni fonksiyon → "Maximum update depth"); ref üzerinden çağır. (3) Doğrulama ortamı: `firebase emulators:start --only auth,firestore,functions` (JAVA_HOME önce export) + `node test/qa/seed-qa.js` + `review@nivadesk.app` şifresi admin SDK ile + `preview_start web-emulator`.

**Kalan:** mobil/koyu tema ince ayar; native (Mac/iPhone/Android) bu handoff'un kapsamı dışında.

## QuickBooks sandbox bağlantısı canlıda doğrulandı (3 Eyl 00:30)

Kullanıcı Intuit'te "Sandbox Company GB 5cdb"yi seçip bağladı → web'de **Connected · Read-only · 9341457840593750 · Sandbox**, katalog ve CDC okumaları "Just now", Needs attention 0, webhook henüz yok. Mappings sekmesinde "Suggest mappings" canlı çalıştı; ilk sonuçlar: ZR→"0.0% ECG", Bespoke→"Commission Income", fee'ler boş → `functions/accounting/quickbooks/normalize.js` kuralları düzeltildi (EC/RC kodlarına `avoid`, "usual UK code" tercihi, Services > Commission, "Merchant Account Fees" generic fee fallback); `accountingMappingSuggestions` yeniden deploy edildi (8187ace). **Devam (00:45):** kullanıcı Confirm'e bastı; eski öneriyle kalan üç satır (ZR→0.0% Z, RC→20.0% RC, Bespoke→Services, Product sales→Sales of Product Income) düzeltilip yeniden Confirm edildi ("Mappings confirmed."). Webhook testi için sandbox QBO arayüzünde "NivaDesk Webhook Test" müşterisi (nameId 68) oluşturuldu; "Last webhook" bekleniyor. **Kalan:** webhook teyidi; Production keys/URI/webhook; spec Faz 3–7.

## Gece devamı (2 Eyl 21:30–22:10 BST)

- **Round 152 CANLI** (Settings yeniden tasarımı), **Round 153 push edildi** (Settings kabuğu 1380px'e genişletildi — kullanıcı canlıda dar buldu; canlı doğrulama watcher'da).
- **QuickBooks:** Mappings düzeltildi ve Confirm edildi. **CDC uçtan uca doğrulandı:** sandbox arayüzünde oluşturulan "NivaDesk Webhook Test" müşterisi "Sync now" ile okundu ("198 catalogue rows, 1 changes since the last check"). **Webhook henüz gelmedi:** oluşturma + düzenleme olaylarından ~20 dk sonra Cloud Run istek günlüğünde Intuit'ten hiç istek yok; Intuit dokümanı "ilk bildirim 5 dk sürebilir" diyor, başka ön koşul yok. Tasarım gereği CDC (Sync now + 6 saatlik reconcile) kaçan webhook'ları kapatıyor. Takip: yarın "Last webhook" dolmuş mu bak; dolmadıysa Intuit konsolunda webhook aboneliğini kaydet-yeniden-kaydet ve sandbox şirketini yeniden bağla.
- **Mac uygulaması açılış çökmesi:** `DilMotoru.swift` `_make_studioFlowFeatureTranslations_1` içinde "Syncing…" anahtarı iki kez → Swift sözlük literal'i açılışta abort eder. Enjekte edilen ikinci satır silindi (70c9d44), xcodebuild BUILD SUCCEEDED; kullanıcı Xcode'dan yeniden derleyip açmalı.
- Kök dizinde yeni dosya: `NivaDesk_Xero_AI_Accounting_Entegrasyon_Spesifikasyonu.md` (kullanıcı ekledi; henüz okunmadı).

## Xero bağlayıcısı — analiz ve plan (3 Eyl 2026, 22:15)

Spec `NivaDesk_Xero_AI_Accounting_Entegrasyon_Spesifikasyonu.md` okundu; §28 gereği kod öncesi analiz `docs/xero-connector.md`'ye yazıldı (doğrulanmış Xero gerçekleri: granular scope'lar, 30 dk access / 60 gün rotating refresh, `/connections` tenant seçimi, webhook ITR kuralı ve yalnız Contact/Invoice/CreditNote/Overpayment/Prepayment event'leri, Starter 5 bağlantı + 1.000 çağrı/gün). Kullanıcı kararları: Xero app + 3 secret, tier, primary provider (Pandle kalır, Xero shadow_read), test org, scope seti. Faz 1 (core'da provider registry, QuickBooks davranışı değişmez) + Faz 2 (Xero read-only: oauth/client/webhook/normalize/adapter, tenant seçimi, sync, ITR-doğru webhook, web bölümü generic) planı hazır.

## Xero Faz 1–2 KODDA (3 Eyl 2026, 01:40)

Kullanıcı "onay, faz 1 ve 2'ye geç" dedi. **Faz 1:** `accountingFunctions.js` provider registry'ye (`PROVIDER_MODULES`: quickbooks_online + xero) geçti; ortak yollar `connection.provider` okur, `secretsFor` kovaları sayesinde QuickBooks/core fonksiyonları Xero secret'ları yokken de deploy oluyor (12 fonksiyon gece yeniden deploy edildi, `scheduledAccountingReconcile` iki seti birden bağladığı için Xero secret'ları girilene kadar deploy EDİLMEZ). QuickBooks davranışı değişmedi (QA 15/15, QBO e2e 9/9). **Faz 2:** `functions/accounting/xero/*` + 7 fonksiyon (`xeroConnectStart/OAuthCallback/ListTenants/SelectTenant/SyncNow/Webhook/Disconnect`); token'lar consent başına `accountingTokens/xero_grant__<authEventId>` (birden çok organizasyon paylaşır, refresh her seferinde döner), tenant seçimi sunucuda (state doc 15 dk), webhook ITR 200/401, If-Modified-Since reconciliation, disconnect'te `DELETE /connections` + son organizasyonda revoke. Xero e2e 9/9. **Web:** QuickBooks bölümü generic `AccountingProviderSection` oldu ({provider} şablonlu 60 çeviri anahtarı, 11 dil), Xero kartı native + durum, `/xero/callback` sayfası; emülatörde Xero ekranı açılıyor. **Kullanıcıda:** Xero app (redirect URI'ler + webhook URL) → 3 secret → `NIVADESK_XERO_SECRETS_READY=1` ile Xero fonksiyonlarını isimle deploy (bayraksız CLI hiçbir deploy'a izin vermiyor: "no value for the secret") → Demo Company'yi bağla. Ayrıntı `docs/xero-connector.md` §7.

**Kullanıcı isteği (3 Eyl 01:10):** web'deki yeni Settings tasarımı Mac / iPhone / Android'e henüz uygulanmadı — Xero işi bitince SIRADAKİ iş.

## Xero canlıda: app + secret'lar + ITR OK (3 Eyl 2026, 01:30 BST / 22:27 UTC)

Kullanıcı Xero developer hesabı açtı; app "NivaDesk" (14bf723b-…) benim tarafımdan kuruldu: iki redirect URI, webhook (Contacts/Invoices/Credit notes/Prepayments/Overpayments), AI kullanımı "No", güvenlik gereksinimleri kullanıcı tarafından onaylandı. Üç secret girildi. **Tuzak:** CLI'nin fonksiyon keşfi ne kabuk ortamını ne `functions/.env`'i okuyor → env bayrağıyla iki deploy Xero secret'larını bağlamadı (webhook her isteğe 401 verdi, ITR düştü). Çözüm `functions/.xero-secrets-ready` işaret dosyası; üçüncü deploy'da 8 fonksiyon secret'larla bağlandı, ITR **OK** (22:26:54 UTC). Kalan: web deploy ("canlıya at"), Demo Company'yi my.xero.com'dan açıp Settings → Integrations → Xero'dan bağlamak.

## Round 154 CANLI (3 Eyl 2026, 02:11 BST)

"canlıya at" → Round 154 (yayın deposu 9300e88): Xero kartı + provider-generic Accounting bölümü + `/xero/callback`; 01:11 UTC'de settings chunk'ında `xeroConnectStart` görüldü. Sırada: kullanıcı nivadesk.app → Settings → Integrations → Xero → Connect; Xero izin ekranında Demo Company seçimi (yeni login'de organizasyon yok, "Add your business" duvarında demo bağlantısı yok — izin ekranından bekleniyor).

## Settings tasarımı native'e taşınıyor (3 Eyl 2026, 03:00–04:00 BST)

Kullanıcı isteği (01:10). Mac/iPhone: yeni `EGGcraft/SettingsDesignSystem.swift` (NDSettings token'ları: canvas/surface/border/text/muted/accent #5865E8, success/caution/danger; NDSettingsPageHeader, NDStatusPill, NDSettingsCardHead, NDSettingsSurface, NDDangerCard, NDSaveBar, NDSettingsSidebarRow 44pt + accent kenar, NDSettingsGroupHeader katlanır, NDSettingsSearchField, NDSettingsListRow, NDThemePreviewTile, NDFactRow, NDSecondaryButton, `.ndSettingsCard()` modifier). `AyarlarView`: kenar çubuğu 275pt beyaz + arama + katlanır gruplar (web ile aynı 9 grup: Workspace ve Files & Data adları eşitlendi), içerik alanında sayfa başlığı kartı, telefon listesi gruplu bordürlü satırlar; `SettingsCard` 12pt/1px kart; Preferences = tema önizleme kutucukları + dil; About = ürün kartı + çalışma alanı bilgileri (Company ID kopyala); Profile & Security (`AccountProfileView`) kart zincirleri `.ndSettingsCard`, başlık kartı kaldırıldı (sayfa başlığı var), hesap silme Danger zone; Branding = kimlik kartı + header önizleme. Android: `SettingsDesign.kt` (aynı token/bileşenler) + `SettingsScreen.kt` kabuğu (275dp kenar çubuğu, arama, katlanır gruplar, sayfa başlığı, DetailCard 12dp/1dp), Preferences kutucukları, About, Danger zone. Çeviriler: web tablosundan kopyalayan `scratchpad/sync-translations.py` + 11 el çevirisi. Mac xcodebuild ve Android compileDebugKotlin YEŞİL (3 tur). Kalan: iPhone simülatöründe görsel doğrulama; Workflow/PDF/Financial/Team gibi uzun formlarda handoff'a özgü yeniden gruplama (kabuk+kart stili zaten uygulandı); mağaza sürümleri.

**iPhone simülatöründe doğrulandı (3 Eyl 03:22):** imzalı simülatör derlemesi (`CODE_SIGN_IDENTITY="-"`; imzasız pakette Firebase keychain hatası) + kullanıcının test hesabıyla giriş: Settings listesi (başlık, arama, katlanır PERSONAL/WORKSPACE/WORKFLOW grupları, bordürlü satır grupları), Preferences (System/Light/Dark önizleme kutucukları, seçili olan vurgu çerçeveli), About (ürün kartı + Up to date + Current workspace bilgi satırları + Copy), Profile & Security (kart başlıkları, güvenlik kartı, kırmızı çerçeveli Danger zone) handoff ile uyumlu görünüyor. Mac penceresi kullanıcı Xcode'dan bakacak; Android görsel kontrolü emülatörde yapılmadı (derleme yeşil).

## Settings native: uzun formlar handoff'a göre yeniden gruplandı (3 Eyl 2026, 04:00–04:40 BST)

Mac/iPhone + Android: **Financial Settings** (Currency & formatting | Defaults for new orders; Tax calculation = iki seçim kartı + canlı £1.000 hesaplama önizlemesi; Effective dates & corporation tax | Invoice footer (Android) / Current workspace calculation; amber "Existing order tools" = Recalculate + Remove VAT; Android'de Save satırı), **PDF Export** (Visible sections: Customer details / Operations / Payments gruplu anahtar satırları; Company invoice numbers kartı; Invoice footer kartı), **AI Reply** (ana anahtar kendi satırında, motor seçimi üç seçim kartı: On-device / OpenAI Online / Offline template; stil ve motor ayarları ayrı kartlarda), **Team Access** (ekran içi tekrar başlık kaldırıldı; iki sütun 640dp'de), **Customer SMS** (durum kartı → renk+metinli durum bandı, Mac'te ekran içi başlık sadeleştirildi). Yeni ortak bileşenler: NDChoiceCard, NDToolRow, NDOutlinedAction (Android), NDSaveRow (Android), NDField, NDTwoColumns (Android), ndTwoColumns/ndField (Mac), ndMoney. Workflow, Customer Portal Domain, Message Settings, Safety & Uploads, Data Management, Plan & Access, Integrations, Support, Legal: kabuk + 12pt kart stiliyle güncel, handoff'a özgü yeniden gruplama yapılmadı. Derlemeler: Mac 7 tur, Android 6 tur yeşil.

## Dış göz denetim raporu: ilk dalga düzeltmeler (3 Eyl 2026 gecesi)

Kaynak: `NivaDesk_Dis_Goz_Denetim_Raporu_20260902.md` (43+80+54+62+52+53 madde).

**Kurallar (CANLI — deploy edildi 3 Eyl).** `users/{uid}/workspaceAccess` artık yalnız sunucu yazar (kendine üyelik kanıtı yazıp başka alanın dosyalarına erişme yolu kapandı, S#1); `paypalPayouts`/`squarePayouts`/`trackingResults` joker kuraldan çıkarıldı, ödemeler `canReadBankFeed` ile okunur ve istemci yazamaz (S#3, S#50); `companySettings`'te SMS alanları owner-only, finans alanları owner/admin — yalnız DEĞİŞEN anahtar için (S#4); `memberAccess` okumaları `.get()` varsayılanıyla, eksik `assignedProjectsOnly` artık üyeyi kilitlemiyor (Elle #17); şirket dokümanı istemciden silinemez (S#48). Storage: `trialLapsed` eklendi, biten deneme artık Pro depolamayı açmıyor (S#17); `support_files` sahibine + owner'a kısıtlandı (S#49). Regresyon paketi: `functions/test/qa/audit-rules-hardening.test.mjs` (28 kontrol), tüm kural paketleri 78 PASS.

**Sunucu (kodda, DEPLOY EDİLMEDİ).** Hatırlatmalar artık `test_studio_123` yerine tüm çalışma alanları için çalışıyor + route (S#2); çöpe atılan sipariş workflow view'ından siliniyor (S#5); `mergeOrders` rol kapısı (S#7); `deleteMyAccount` companySettings/quickReplySecrets/portalLinks/estimateLinks/fileShares/join request'leri ve eski üyelerin `activeCompanyId`'sini de topluyor (S#8, S#38); üyelikten çıkarılanın aktif alanı kendi alanına dönüyor (S#9); e-posta yazım hatasında eski adrese dönüş 10 günlük soğumaya takılmıyor (S#12); ödeme defteri artık Free/Starter'da da kaydediliyor (S#13); müşteriye giden ad `appSubtitle` boşsa çalışma alanı adına düşüyor, stok slogan yok (S#14); `deleteWorkspaceData` owner-only + 540 sn (S#15); admin kapıları `email_verified` istiyor (S#16); kısmi tam-düzenleme parayı sıfırlamıyor (S#18); müşteri süpürmeleri 400'lük chunk'larda (S#19); "orders" → "siparisler" (S#21); ölü cihaz token'ları siliniyor, pencere 500 (S#22); yedek içe aktarma AKTİF sipariş sayar (S#25); doğrulanmamış hesap temizliği envanter/not/banka/dosya/ödeyen planı da sayıyor, recursiveDelete (S#27); ağır callable'lara 300 sn/512 MiB (S#29); onarım işi koltuk limitine uyuyor (S#34); süresi biten teklif linki kartta "expired" (S#36); geri çekilen link doğru mesajı veriyor (S#37); aynı durum ikinci kez müşteriye duyurulmuyor (S#40); demo yanıtı denemeyi söylüyor (S#42); limit mesajı "teslim edildi işaretleyin" diyor (S#53). Stripe: deneme damgası checkout AÇILINCA değil ABONELİK BAŞLAYINCA (S#11), sıra dışı gelen abonelik olayı uygulanmıyor (S#28). Envanter: fotoğraf güncellemesi diğer alanları silmiyor (Web #2). QA paketi 37/37 yeşil.

**Mac/iPhone.** Tam-doküman `setData(from:)` gitti: sipariş ve müşteri kayıtları merge + model alanları için açık silme, `commerce`/`etsySource`/`createdAt`/portal alanları hayatta (iOS #1, #3, Parite #1, #2, S#24); siparişi açıp kapatmak artık yazmıyor (iOS #2); kurtarma decoder'ı repair/estimate/portal/production alanlarını taşıyor (iOS #5, Parite #3); `customFields` FieldPath ile anahtar anahtar, banka ve web'in yazdıkları ezilmiyor (Parite #9); alt-kayıt id'leri String (web'in ürettiği id dizinin tamamını çöpe atıyordu, iOS #4); virgüllü ondalık `nvParseAmount` ile (iOS #15); komisyon/KDV 2 haneye yuvarlanıyor (Parite #23); ödeme yöntemi sözlüğü web/Android ile aynı (Parite #28); giriş ekranında "Forgot password?" + 11 dilde eşlenmiş Firebase hataları (iOS #34, #35); müşteri silme onay soruyor (iOS #10); pencere min 1180 pt, 13" Mac'e sığıyor (iOS #23); biten deneme cihazda da Free (Parite #15); `secilenDil` yazım hatası (Parite #39); plan varsayılanı `.demo` (Parite #35); iki çökme guard'ı (iOS #21); kayıt artık `initializeFreeDemoWorkspace` çağırıyor → 14 günlük deneme (S#10).

**Android.** Ondalık virgül, dinleyici dayanıklılığı + geri çekilme, bozuk dokümanda çökmeme, rememberSaveable taslaklar, geri tuşu, çıkışta yerel veri temizliği, yıkıcı işlem onayları, giriş ekranında şifre sıfırlama, 66 ham hata mesajı → anlaşılır metin, `users/{uid}` ezme durdu, Play abonelik yönetimi bağlantısı, ham durum değerleri + 22'lik havuz, `activeStatuses` varsayılanı 5, `upload_preview_image` doğrulaması kaldırıldı, `deliveryTime` varsayılanı 45, FragmentActivity + biyometrik, bildirim kanalları + ikon, Play faturalama (proration/pending/acknowledge/restore), kayıtta deneme (S#10).

**SIRADAKİ / KARAR BEKLEYEN:** functions deploy (isimle) yapılmadı — sabah. Ürün kararı gereken 5 madde sabahki özette.

## Deploy günü: canlıya alındı + deploy öncesi inceleme (3 Eyl 2026, öğleden sonra)

**Deploy öncesi adversarial inceleme.** 3300 satırlık denetim diff'inin yarısını alt ajanlar yazmıştı ve okunmamıştı; canlıya basmadan önce diff 18 dilime bölünüp paralel incelendi, her bulgu üç bağımsız çürütücüden geçirildi (120 ajan, 12,6M token). **23 bulgu doğrulandı, 4'ü blocker.** İnceleme kendi düzeltmelerimizin dördünü kurtardı:

- **Canlı kurallarda 3 regresyon** (gece deploy edilmişti, ÜRETİM BOZUKTU): `users/{uid}/workspaceAccess` write:false → Mac/iPhone Team Access rol değişimini komple kilitliyordu (batch geri dönüyor); `support_files/{userId}` aslında `{ticketId}` → her destek eki yüklemesi reddediliyordu; finans anahtarı kapısı callable'dan katıydı → izinli üye Financial Settings kaydedemiyordu. Üçü de düzeltilip yeniden deploy edildi, regresyon testleri 82 PASS.
- **Swift'te 2 blocker:** `updateSiparis` atlama koruması, sipariş ekranının binding'i `siparisler` dizisini yerinde değiştirdiği için HER düzenlemeyi sessizce yutuyordu (base cost, ödeme, durum — hiçbiri sunucuya gitmiyordu). Artık sunucudan görülen son kopyayla karşılaştırıyor. `clearOfflineCacheFromDisk()` her soğuk açılışta ve her otomatik kilitte çalışıp kuyruktaki çevrimdışı yazımları siliyordu; yalnızca gerçek çıkışta çalışıyor.
- **Web'de para:** `parseAmountInput` baştaki sıfırı binlik ayracı sanıyordu ("0.750" → 750, tr/de/pt) ve ayraçları 1234.5'ten türetiyordu — es/it bu sayıyı gruplamadığı için virgül ondalıkları ters dönüyordu. İkisi de düzeltildi, 17 vaka elle doğrulandı.
- **/bank kapısı** sayfanın tamamını kapatıyordu: denemede banka bağlamış sonra Free'ye düşmüş bir alan verisine de bağlantıyı kesme düğmesine de ulaşamıyordu. Kapı sayfadan bağlanma eylemine taşındı.
- Ayrıca: zamanlı not hatırlatıcısı gün sonuna kayıyordu; Empty Trash not başına ayrı onay soruyordu; sipariş bildirimi Orders'tayken siparişi açmıyordu; Stripe sıra koruması `canceled_at` bir kez yazıldıktan sonra sonraki tüm yazımları KALICI olarak düşürüyordu (artık webhook olayının kendi zamanına bakıyor); durum duyurusu bir daha asla gönderilemiyordu (artık 24 saatlik pencere).

**Canlıya alınanlar:**
- `firestore.rules` + `storage.rules` — düzeltilmiş haliyle CANLI.
- **48 Cloud Function** isimle deploy edildi (3 parti, hepsi başarılı). Kör deploy yapılmadı, prune olmadı.
- **Web Round 155** (`03e246d`) yayın deposuna gönderildi.

**1. ürün kararı uygulandı:** müşteri profili silinince siparişlerdeki ad ve geçmiş KORUNUYOR; "New Project"e döndürme kaldırıldı (sunucu + Mac). Kişisel veriyi silmek ayrı işlem olarak Anonymise'da kalıyor.

**Sıradaki (kullanıcı kararları, `NivaDesk_Urun_Kararlari_20260903.md`):** Archive/Delete Profile/Erase Personal Data ayrımı; merkezi server-side Finance Engine (Gross Margin / Net Profit / VAT Due, Standard + Margin Scheme, UI görünürlüğü hesabı değiştirmez); "+ Add Project" Quick Create mini formu; plan düşüşünde fazla üyelerin Suspended/No Access olması + Restore; e-posta ile ekip daveti. Bunlar dört platforma dokunan ayrı iş programları.

## Merkezi Finance Engine — sunucu + dört ayna CANLI (3 Eyl 2026, akşam)

Kaynak karar: `NivaDesk_Urun_Kararlari_20260903.md` §2. Sözleşme: `docs/finance-engine.md`.
Survey: `docs/finance-engine-findings.md`.

**Neyi düzeltti.** Aynı sipariş için **beş ayrı kâr tanımı** vardı (web araç çubuğu, web pano,
`Siparis.netKar`, `OrderProfit`, Android `netProfit`) ve özel tutar toplamada **dört ayrı kural**
(web'in kendi içinde ikisi). Sunucu negatif tutarları 0'a kırpıyordu, istemciler kırpmıyordu.
`financialShowBaseCost` kapalıyken web ve Swift base cost'u kârdan da çıkarıyordu. `refundedAmount`
hiçbir platformda kârdan düşülmüyordu. Marj rejimi komisyon/kargo/gider de düşüyordu, yani KDV'yi
olduğundan az hesaplıyordu.

**Mimari.** `functions/finance/engine.js` saf modül (Firestore/saat/dil bilmez). Cevabı bir
tetikleyici her siparişe `finance` bloğu olarak damgalıyor — her yazıcıyı tek tek değiştirmek
yerine, çünkü yazıcıların bir kısmı bizim elimizde değil (Pro/Team Mac doğrudan yazıyor, beş
entegrasyon, ödeme defteri, banka iadesi). Mevcut siparişler için 20 dakikada bir süpürme işi;
bitirdiği sürümü kaydedip duruyor, sürüm artınca yeniden başlıyor. Dört platformun aynası da var
(kullanıcı yazarken önizleme) ve **dördü de sunucunun aynı `vectors.json` dosyasını koşuyor**.

**Testler:** motor 19 vektör + 12 kural; damga 16 birim + 8 gerçek Firestore (döngü koruması on
geçiş boyunca hiçbir şey yazmıyor); web/Swift/Kotlin aynaları 19'ar vektör; sunucu paketi 39/39;
kural paketleri 86 PASS.

**Yeni ayarlar** (kararın istediği): `vatRegistered`, `pricesIncludeVat`, `vatMethod`
(standard/margin/none). Sunucuda saklanıyor, kurallarda vergi oranıyla aynı kapıda, web'de arayüzü
var. Üçü de bugünkü davranışa eşit varsayılanla geliyor.

**Canlıda:** `firestore.rules`, 12 fonksiyon, web Round 156 (`afd09c6`, chunk'ta teyit edildi).

**KALAN:** Mac ve Android Settings'te üç VAT ayarının arayüzü; native mağaza sürümleri.

## Finance Engine: VAT ayarları dört platformda TAMAM (3 Eyl 2026, gece)

Motor + damga + süpürme zaten canlıydı; bu tur eksik olan arayüz tamamlandı.

**Üç ayar artık her yerde:** `vatRegistered`, `pricesIncludeVat`, `vatMethod` (standard/margin/none).
Web (Round 156), Mac, iPhone ve Android'de kart var. Üç yöntem kartı artık **tek değer** yazıyor —
motor `vatMethod` okuyor, kartlar `taxCalculationType` vurguluyordu; biri seçilip sonra öbürü
seçilince ikisi çelişiyordu ve motor kimsenin göremediği alanı takip ediyordu.

**Cihaza yansıma:** `FirebaseManager` ayar dinleyicisi üçünü de UserDefaults'a aynalıyor, Android
`workspaceSettings` modeli ve repository okuyor. Bu olmadan web'den yapılan bir değişiklik cihaza
hiç ulaşmıyordu ve uygulamanın kendi önizlemesi eski varsayılanla cevap veriyordu.

**Üye kapısı:** Mac'in toplu ayar yazımında üç anahtar da owner/admin listesinde; kurallarda da
vergi oranıyla aynı kapıda (86 kural testi).

**Çeviri:** 12 metin 11 dilde. `sync-translations.py` düzeltildi — çok satırlı web girdilerini
sessizce atlıyordu, artık süslü parantez eşleyerek okuyor.

**Süpürme canlıda doğrulandı:** 444 sipariş sürüm ikiye taşındı, iş sonra boşa geçti
(`financeSweep finished { engineVersion: 2 }`).

**Canlıda:** web Round 157. **KALAN:** native mağaza sürümleri.

---

## Quick Create — dört platformda, inceleme sonrası (3 Eylül 2026)

**Karar §3 uygulandı.** "+ Add Project" artık önce küçük bir form açıyor; **Create'e basılana
kadar hiçbir şey yazılmıyor**. Müşteri ana alan ama zorunlu değil (kullanıcı kararı: müşterisiz de
açılabilsin). Proje adı boş bırakılırsa sunucu `John Smith · Project #1042` — müşteri yoksa
`Project #1042` — üretiyor. Oluşturduktan sonra "Project created · Undo": beş dakika içinde,
yalnızca oluşturan kişi, yalnızca dokunulmamış siparişi geri alabiliyor.

**Proje numarası (kullanıcı kararı).** Her projeye oluşturulduğu anda benzersiz ve değişmeyen bir
numara veriliyor, ayrı alan olarak saklanıyor (`projectNumber`), sayaç workspace'te
(`projectCounter`). Bu turda sadece otomatik proje adında kullanılıyor; arama/filtre/faturaya basma
sonraki faz. **Numara geri verilmiyor** — geri alma bile sayacı düşürmüyor, çünkü sayaç sipariş
sayısını değil verilmiş numaraları sayıyor. Sayaç ilk kullanımda mevcut sipariş sayısından
tohumlanıyor, sonra tohum yok sayılıyor.

**İnceleme on bulgu buldu, hepsi kapandı.**

*Sunucu:* Firestore iptal edilen bir işlemin **aynı closure'ını yeniden çağırıyor**. İlk sürüm adı
`if (!projectName)` ile koruyordu, yani ikinci deneme birinci denemenin numarasını adın içinde
taşıyıp yanına yenisini basıyordu — kendine #302 diyen bir #303 siparişi, hem de faturaların ve
muhasebe bağlantılarının okuduğu metinde. Artık her değer her denemede sıfırdan türetiliyor ve
dışarıya ancak yazımdan sonra yayınlanıyor. Ayrıca işlem içindeki **her okuma her yazımdan önce**
olmak zorunda; bu sıra `index.js` kaynağını okuyan bir testle çivilendi.

*Mac/iPhone:* Çevrimdışı oluşturulan proje yalnızca kuyrukta bir işken cihazdaki başka yazma
yolları o dokümana doğrudan uzanabiliyordu — Firestore SDK'sı dokümanı kendi kuyruğundan yaratıyor,
sonra tekrar oynatılan create `already-exists` ile ölüyordu; hem de numarası hiç verilmemiş bir
doküman üzerinde. Artık **doküman başına tek ray**: create kuyruktayken düzenlemeler o işin içine
katlanıyor, `already-exists` cevabı işi save'e çeviriyor (kuyruk başını sonsuza kadar tıkamak
yerine), ve bozuk bir iş diğerlerini durdurmuyor. Geri alma işi gerçekten kuyruktan çıkarıyor;
havadaysa sunucu onaylar onaylamaz çöp kutusuna gidiyor. **Silme de aynı sebeple düzeltildi:** yumuşak
silme yaması var olmayan dokümana yapılıyordu, düşüyordu ve proje bağlantı gelince geri geliyordu.

*Android:* Reddedilen bir create diyaloğu kapatıp yazılan her şeyi götürüyordu. Form artık cevabı
bekliyor ve reddi sunucunun kendi cümlesiyle, alanlar yerinde dururken gösteriyor.

*Web:* Yüklü sayfanın dışındaki bir projeye derin bağlantı artık çözülüyor; Add'e ikinci kez basmak
açık formu silmiyor; takvimden oluşturulan proje orada seçiliyor, kişi sipariş listesine atılmıyor.

**Teslim tarihi tabanı.** Sipariş kendi teslim tarihini taşımıyor: ödeme tarihinden sonraki gün
sayısını taşıyor ve **sıfır zaten "teslim tarihi yok" demek**. Yani şemanın ifade edebildiği en
erken tarih yarın, ve bugün seçilince sessizce yarına kayıyordu. Üç seçici de artık bugünü
sunmuyor — görünen bir taban, kaydettikten sonra kayan bir tarihten iyidir. Bugüne ev bulmak
siparişe gerçek bir teslim tarihi alanı eklemek demek; o ayrı bir iş.

**Canlıda:** `createWebOrder`, `createSwiftOrder`, `saveSwiftOrder`, `undoOrderCreate` (yeni),
`purgeWebOrders`. **KALAN:** web Round'u (kullanıcının sözünü bekliyor) ve native mağaza sürümleri.

---

## Koltuk askıya alma — plandan düşünce ne oluyor (3 Eylül 2026)

**Karar §4 uygulandı.** Küçük plana geçen bir çalışma alanı **hiç kimseyi silmiyor**: üye kaydı,
rolü, sipariş atamaları ve yazdığı her geçmiş kaydı olduğu gibi kalıyor. Limitin üzerindeki üyeler
erişimlerini kaybediyor — hepsini. *Salt-okunur bırakmak bilinçli olarak reddedildi:* ayrılmış bir
çalışanın müşteri kayıtlarını, faturaları ve dosyaları okumaya devam etmesi güvenlik sorunudur.

**Kim gidiyor, tek yerde:** `functions/team/seats.js`. Kural üç ayrı yerde birebir aynı olmak
zorunda — plan değişimine tepki veren tetikleyici, sahibin başka türlü seçmesini sağlayan callable,
ve testler. Sahip asla düşmüyor. Geri kalanlar arasında **en eski gelenler kalıyor**; sahibin önden
kestirebileceği ve itiraz edebileceği bir sıra, "haritada önce hangisi listelendiyse" değil.
Katılma tarihi damgalanmadan önce gelen üyeler **sona** sıralanıyor: ne zaman geldiğini bilmemek,
"hep buradaydı" demek değil.

**Neden tetikleyici:** plan dört ayrı raydan küçülebiliyor — Stripe, Apple, Google ve aboneliğin
bittiğine karar veren çözümleyici. Dördüncü raydan gelen düşüş de birincisi kadar sızdırır. Her
şirket yazımı tetikleyiciye ulaşıyor (her proje oluşturmadaki sayaç dahil), o yüzden en ucuz soru
ilk sorulup neredeyse her çağrı orada bitiyor.

**Bayrağın yeri kritik:** askıya alma `members` haritasının İÇİNDE değil, ayrı bir üst düzey
`suspendedMembers` alanında. Kurallar bir üst düzey alanı mutlak olarak sunucuya kapatabiliyor;
`members`'ın tek bir alt anahtarını kapatamıyor — ve Team planında `members` zaten sahibin
yazabildiği bir alan. Kayıt içinde saklansaydı sahip tarayıcı konsolundan çevirirdi: beş koltuk
parası, yedi kişi. **Kural testi tam bunu iddia ediyor ve alan taşınana kadar kırmızıydı.**

**Yükseltme kimseyi kendiliğinden geri almıyor.** Sahip `Restore Access`'e basıyor; koltuk doluysa
sunucu sabit bir cümleyle reddediyor (sayı cümlenin içinde değil, hata ayrıntısında — istemciler
hatayı birebir metin eşleyerek çeviriyor).

**Dört platform:** web (ekip ekranı, satır sönük + "No access" + açıklama + Restore Access),
Mac/iPhone (Manage menüsünde Remove Access / Restore Access) ve Android. Sayaç her yerde artık
**koltuk** sayıyor, kişi değil — "3 / 2" sahibe aşmadığı bir limiti aştığını söylüyordu.

**Askıdaki kişinin kendi ekranı:** çalışma alanı seçicide "No access" olarak görünüyor ve girmeye
çalışınca "erişimin durduruldu, sahibinden geri vermesini iste" diyor. **KALAN:** aktif çalışma
alanı elinden alınırsa web sessizce kendi kişisel alanına düşürüyor; oraya bir açıklama şeridi
gerekiyor. Native'lerde de aynı şerit yok.

**Doğrulama:** 14 koltuk kuralı testi + 27 kural testi emülatörde; mevcut altı kural takımı hâlâ
yeşil; üç kasıtlı bozma (sahip koruması, sıralı dizim, varsayılansız okuma) da yakalanıyor.
Sonuncusu en önemlisi: üretimde hiçbir çalışma alanında bu alan yok, varsayılansız okuma hepsini
birden kilitlerdi.

**KALAN:** sunucu + kurallar **deploy edilmedi**, web Round'u da bekliyor — ikisi de kullanıcının
sözünü bekliyor. Native'ler bütünün sonundaki mağaza sürümüyle.

---

## E-posta ile ekip daveti (3 Eylül 2026)

**Karar §5 uygulandı.** Eski akış tersten işliyordu: sahip Şirket Kimliğini okuyor, karşı taraf
yazıyor, katılma isteği gönderiyor, sahip onaylıyor — üç adım ve kimsenin akılda tutamayacağı bir
numara, yanlış sırayla ve yanlış kişi tarafından. Artık sahip (veya Ekip Erişimi olan bir yönetici)
bir adres yazıyor, rolü seçiyor ve gönderiyor. **Şirket Kimliği / katılma isteği ikincil yol olarak
duruyor** — kararın istediği de buydu.

**Tehlikeli fikir tek:** e-postadaki bağlantı bir kimlik bilgisidir. Her şey bunu dar tutmak için:
- Jeton 32 rastgele bayt; Firestore'da **jetonun kendisi değil SHA-256'sı** duruyor ve o aynı
  zamanda doküman kimliği. Yani bir yedekten, bir konsol oturumundan ya da bir veri dökümünden
  çalışan davet çıkarılamaz; arama da sorgu değil doğrudan okuma.
- Koleksiyon istemcilere **kapalı** — hem yakalayıcı kural hem de açıkça yazılmış bir kural ile.
- Davet **yalnızca gönderildiği adresi** oturtur. İnsanlar e-postayı yönlendirir; bu kontrol
  olmasa yönlendirilen davet, sahibin hiç yazmadığı bir isimle yanlış kişiyi koltuğa oturturdu.
- İki hafta yaşıyor. Aynı adrese ikinci davet birincisini geri çekiyor, iki posta kutusunda iki
  çalışan anahtar kalmasın diye.
- **Koltuk iki kez kontrol ediliyor ve bağlayıcı olan kabul anındaki.** Plan o iki hafta içinde
  küçülebilir. Bir test, kontrolün üyelik yazımından ÖNCE olduğunu kaynaktan doğruluyor.

**Yazarken bulunan iki kusur** (sonradan değil): e-posta alanı olmayan bir kayıt bağlantıyı açan
herkesi içeri alıyordu — karşılaştırılacak adres boş olunca kontrol atlanıyordu — ve bir dizi
"bu bir davet mi" kapısından geçiyordu. İkisi de kapandı, ikisinin de testi var.

**Web:** ekip ekranında davet formu + bekleyen davetler kartı (Withdraw ile), ve `/invite/<token>`
oturumsuz sayfası. Sayfa üç kapılı: giriş yap, hesap aç, ya da "bu adres senin değil". Hesap açan
yola kişinin kendi çalışma alanı da kuruluyor, her hesap aynı şekilde olsun diye.

**Tarayıcıda bulunan bir kusur daha:** sayfa, az önce başarıyla katılan kişiye "bu davet zaten
kullanılmış" diyordu — önizleme etkisi çevirmene bağlıydı, çalışma alanının dili gelince çevirmen
değişiyor ve etki ikinci kez koşup kendi sebep olduğu "accepted" durumunu okuyordu. Artık yalnızca
jetona bağlı, bir kez koşuyor; katılmak da geri dönülemez bir durum.

**Emülatörle uçtan uca doğrulandı:** kayıt oluştu (içinde jeton yok), e-posta dışarı-çıkış kapısıyla
bastırıldı ve konusu kararın yazdığı gibiydi, yanlış-hesap kapısı çıktı, doğru adresle giriş kabul
kapısını açtı, kabul üyeliği yazdı ve kişi çalışma alanının içinde `/orders`'a düştü.

**KALAN:** native (Mac/iPhone/Android) davet arayüzü; sunucu + kurallar + web deploy'u kullanıcının
sözünü bekliyor.

---

## Entegrasyon denetimi — 32 iddianın 17'si kapandı (3-4 Eylül 2026)

**Önce doğrulama.** Rapor kendi içinde bir alt-denetiminin yanlış çıktığını söylüyordu, o yüzden
düzeltmeye geçmeden önce 32 başlığın her biri kaynaktan doğrulatıldı: madde başına bir doğrulayıcı,
ayakta kalanlara iki ayrı açıdan (doğruluk / gerçek etki) birer şüpheci. **31'i ayakta, 1'i düştü**
(#26 Cloudflare sertifikası — koddaki "placeholder" kontrolü 27 Ağustos'tan kalma bir kalıntıymış).

**Kapanan 17:** #1 OAuth yönlendirme · #2 MCP jeton iptali · #3 MCP izinleri · #5 kimliksiz istek ·
#8 mağaza iadeleri · #9 Etsy iptali · #10 komisyonlar · #11 PayPal çifte sayım · #12 Pandle/PayPal ·
#13 asistan banka rakamı · #14 pano kanalları · #17 anahtar rotasyonu · #22 iletişim tercihi ·
#23 kargo gaspı · #24 kargo süpürmesi · #25 paylaşım bağlantıları · #27 Apple sıralama · #32 park
edilmiş veri.

**En önemli üçü:**

*#1* — `chatgptOAuthRegister` Firestore'a hiçbir şey yazmıyordu, yani karşılaştırılacak liste yoktu;
`approve` hedefi POST gövdesinden alıp kodu oraya yolluyordu; token adımı da saldırganın kendi
yazdığı kopyayla karşılaştırdığı için hep geçiyordu. Emülatörde kapıyı kaldırıp koştuğumda kurban
gerçek nivadesk.app onay sayfasına `redirect_uri=https://evil.example/steal` ile gidiyordu. Artık
kayıt gerçekten yazılıyor, eşleşme kanonik biçimde **tam**, ve düz `http` yalnız loopback'te.

*#8* — beş kanalda iade kaydı hiç tutulmuyordu. Banka tarafı aynı aritmetiği aylardır doğru
yapıyordu; şekil oradan alındı. "Kalan" hâlâ **ödenene** göre ölçülüyor, yoksa kapanmış bir iade
müşteriye tekrar borç yazardı.

*#10* — **motordan başlandı.** İki ajan bunu bağlayıcıdan başlayarak denedi, ikisi de geri alındı:
motor `paymentFee` alanını hiç okumuyordu, yani yazılan gerçek komisyon hiçbir kârı değiştirmiyor,
sadece aynı maliyetin ikinci ve çelişen tanımını üretiyordu. `platformFeeKnown` bayrağı gerçek sıfırı
boş alandan ayırıyor; motor sürümü **3**, süpürme tüm siparişleri yeniden damgalıyor; dört ayna 23
vektörde hemfikir; ücreti ezen dört yazıcı susturuldu; hiç bilmediği bir sayıyı yazan beş bağlayıcı
`paymentFee: 0` yazmayı bıraktı.

**Ajan işinin üç grubu geri alındı** — hepsi incelemeyle: komisyonlar (Square ücreti izin listesinde
olmadığı için hiç yazılmıyordu, banka kopar-bağla eklenmemiş ücreti düşüyordu, PayPal testleri kodu
kapattığımda bile geçiyordu), Etsy ücret+iptal (her `unsupported` sebebini serbest bırakıyor, ödenmiş
siparişi ödenmemiş yazıyordu), bağlayıcı sahipliği (reddin sebebi hiçbir ekrana ulaşmıyor, zaten
çift-bağlı workspace'in iki tarafı birden reddediliyordu).

**İki test dersi:** kaynak-şekli testleri `if (false)` sarmalamasına karşı zayıf — kargo testlerim üç
bozmadan ikisini kaçırdı, kararları saf işlevlere çıkarıp gerçek davranışı test ettim. Ve fikstür
zorlamıyorsa test yeşil kalır — Etsy iptal testim "iptal ama hâlâ ödenmiş" fikstürüyle parayı hiç
oynatmıyordu.

**Canlıda:** kurallar + 58 fonksiyon (finans motoru, OAuth/MCP, kargo, entegrasyon webhook'ları,
sipariş para yazıcıları, muhasebe, Pandle, Apple) + web Round 159.

**KALAN:** #4 düz metin anahtarlar · #6 OAuth testleri (üçü yazıldı, kısmen) · #15 Etsy kotası ·
#16 aynı mağaza iki workspace · #18 QBO webhook rozeti · #19 banka bağlantısı sessizliği ·
#20 410 uçları · #21 muhasebe defter yazımı · #28 bağlayıcı denetim kaydı · #29 Woo adres kontrolü ·
#30 genel webhook motoru · #31 kaldırılmış Shopify rozeti · #7 banka planı sunucu kapısı.

### Denetim kapandı — 31/32 (4 Eylül 2026)

Yukarıdaki "kalan" listesinin tamamı kapandı. Sırasıyla: #4 (eski `openAIKey` günlük süpürmeyle
taşınıp siliniyor) · #30 (genel kanal artık aynı parmak izi + teslimat anahtarı korumasında) ·
#15 ve #31 · #7 ve #19 · #16 (Etsy webhook'u Square gibi bütün sahiplere dağıtıyor) · #29 (Woo ana
makinesi her istekte, çözülen **her** adres için kontrol ediliyor) · ve son dört: #28, #6, #18, #20.

**#20'nin cevabı yazma tarafında değil.** 410 dönen uç hiçbir şey yazmıyor ve öyle kalmalı: kontrol
edecek jetonu yok, yani yazdığı her şey herkese açık bir URL'den okunan `companyId`'ye güvenmek olur
ve yabancı biri istediği çalışma alanının kartlarını kırmızıya boyayabilirdi — yani #5'in kapattığı
delik. Haber verme **okuma tarafına** taşındı: emekli yöntemin jetonunu hâlâ tutan çalışma alanına,
zaten oturum açmış ve üyeliği kanıtlanmış olan sahibi hub'ı açtığında söyleniyor. Test dosyası bu
kararı da koruyor — stub'a bir yazıcı eklenirse kırmızıya dönüyor.

**Canlıya çıkış (4 Eylül 2026).** Kurallar + **52 fonksiyon** (50 güncelleme, 2 yeni:
`listRetiredIntegrationHolds` ve `scheduledQuickReplyKeySweep`) + web **Round 160**.

Liste körlemesine değil, değişikliğin ulaştığı yerden çıkarıldı: her değişen dosya bir ajana
haritalandırıldı, her haritaya ayrı bir şüpheci bakıp *kaçırılan* bir isim aradı. Sonuç 52 isim —
banka akışının 30'u (paylaşılan `requireOwner` değiştiği için hepsi; alt küme deploy etmek planı
düşmüş bir çalışma alanını kendi akışını kapatamaz hâlde bırakırdı), Etsy 6, Woo/Square/commerce 12,
index.js 4. Şüpheciler dört isim ekletti (dört bağlayıcının `disconnect`'i, çapraz dilim), bir isim
bile "her ihtimale karşı" listeye girmedi.

Deploy sırasında bir alan silindi: `integrationStatusPayload`'ın `retired` bayrağı hiçbir zaman
`true` olamıyordu (okuduğu dokümanda `kind` alanı yok, `retiredMethod`'u kimse yazmıyor, ve emekli
türlerin jeton okuyucuları zaten cevap vermeden reddediyor). Hiçbir şey söylemeyen ikinci bir sinyal,
bu denetimin bir hafta boyunca aradığı şeyin ta kendisi.

**Tek gerçek kalan #21'in ikinci yarısı:** muhasebe bağlayıcılarında defter yazımı. O, QuickBooks ve
Xero spesifikasyonlarının Faz 3-7'si — kendi dosyaları var, sıradaki iş orası. (#26 rapor yanlıştı.)

---

## Gece bloğu — motor 4, iki pazaryeri, ve aktivasyonun ölçülmesi (4 Eylül 2026)

**Finance Engine v4.** Kanal siparişlerinde KDV £0 görünüyordu: her mapper `taxRate: 0` yazıyor (hiçbir
mağaza API'si oran döndürmüyor) ve motor KDV'yi orana bağlıyordu, gerçek tutar `taxAmount`'ta okunmadan
duruyordu. Tutara inanmak ters yönde yanlış olurdu — pazaryeri toplayıp kendi beyan ediyorsa o KDV
işletmenin değil. Kullanıcı kararı: **sipariş bazında** `merchant | platform | unknown`. Kendi mağazaları
(Shopify/Woo/Square) merchant; Etsy `unknown` çünkü bazı ülkelerde Etsy topluyor bazılarında satıcı
sorumlu. Aynı sürümde kalemsiz siparişte **iade iki kez** düşülüyordu (her yazıcı hem `paidAmount`'ı
düşürüp hem `refundedAmount`'ı yükselttiği için) — düzeltildi. 36 altın vektör, dört uygulama hemfikir.
İnceleme üç sessiz ayrışma daha buldu: bilinen komisyonun iki platformda yuvarlanıp ikisinde
yuvarlanmaması, boş `vatMethod`'un sunucuda düşüp Swift/Kotlin'de düşmemesi, ve yer tutucu sıfır oranın
marj şemasını sıfırlaması. **Vektör koşucuları da kusurluydu**: ikisi parayı yalnız JSON sayısı olarak
okuyordu, biri metin `lineTotal`'lı kalemi düşürüyordu, biri `1`'i boolean sayıyordu, Kotlin'in 15'lik
tabanı 17 vektörün sessizce atlanmasına izin verirdi.

**Amazon + eBay bağlayıcılarının saf yarısı.** Hesap/OAuth gerekmeyen her şey: iki adaptör, pazaryeri
tabloları (id → ülke/kur/bölge/uç nokta), iki katmanlı capability kaydı, dashboard kanalları, üç
platformda eBay kartı. Testleri adaptörleri görmemiş biri **spesifikasyondan** yazdı ve **on** kusur
buldu; dört düşmanca geçiş **altı** tane daha, beşi para. Sonra API-sadakat geçişi en önemlisini buldu:
**eBay'de `collectedBy` diye bir alan yok** — cevap `ebayCollectAndRemitTaxes[]` dizisinin varlığında.
Yani ilk vergi kuralı hiç var olmayan bir alanı okuyordu ve testler de aynı kurguyu doğruluyordu; ikisi
de yeşildi.

**Aktivasyon ölçümü (Native Onboarding Faz 1).** Ürün yalnız iki durumu ayırt edebiliyordu: kaydoldu ve
kullanıyor. 37 dış çalışma alanı kaydoldu, hiçbiri müşteri kaydı oluşturmadı. Artık: bildirilmiş anlamlı
olay kaydı (bildirilmemiş olay hiçbir şey saymaz), yedi aktivasyon yolu (bir jeweller'ın Etsy bağlaması
ile bir stüdyonun ilk işini yazması aynı tanıma sığmaz), ve "bağlamak aktivasyon değildir" kuralı —
mutabakatı yapılmamış banka akışı değer değil, çekilmemiş stok bir tablo, açılmış AI ekranı bir soru
değil. Mesaj bastırma kuralları da: **"İlk mağazanı bağla" mesajı mağazasını bağlayan birine gitmez** —
şartnamenin zorunlu kıldığı kural, ve ürünün dinlemediğini gösteren tek mesaj öncesindeki her iyi mesajı
siler.

### Gecenin ikinci yarısı — aktivasyon görünür oldu

`functions/lifecycle/` altında altı saf modül: olay kaydı, aktivasyon/lifecycle, mesaj bastırma, risk
ve feedback skorları, **türetme**, ve kişiselleştirilmiş kurulum listesi.

**Türetme kararı önemli.** Olayları kaydetmeye başlayıp haftalarca beklemek yerine, çoğu cevap zaten
diskte: `commerce` damgalı sipariş = içe aktarılmış mağaza siparişi; `linkedOrderId` taşıyan banka
satırı = birinin yaptığı eşleştirme. Geriye dönük çalışıyor, hiçbir yeni yazma yolu yok — **aylar önce
kaydolmuş 37 çalışma alanı bu gece ölçülebiliyor.** Türetilemeyenler de açıkça listeleniyor (bağlantı
ekranını açıp vazgeçen kullanıcı hiçbir dokümana iz bırakmıyor — ve bu sistemin en çok ihtiyaç
duyduğu sinyal tam olarak o).

**Görünen iki yüzey:** admin panelinde *Activation* sayfası (kaç çalışma alanı, kaçı değer gördü,
nerede durdular, risk sırasına göre liste, sebebi hover'da) ve dashboard'daki karşılama kartı. Kart
eskiden herkese aynı beş adımı gösteriyor ve **bir sayfayı açmayı ilerleme sayıyordu**; artık
onboarding'de seçilen hedeften geliyor ve tik "yapıldı" demek. Kaldırılamayan bir tuzak da kapatıldı:
mağaza siparişini `commerce.provider` ile sorgulamak bileşik indeks ister, indeks yoksa sorgu "hiç
sipariş yok" diye başarısız olur — yani 200 Etsy satışı olan atölyeye "ilk siparişini içe aktar"
denirdi. Kanıt artık `externalEntities` (tek eşitlik, indekssiz).

**Sonraki:** QBO/Xero Faz 3 defter yazımı (denetimin kalan tek maddesi), Amazon/eBay için hesap +
OAuth (kullanıcıyla), Native Onboarding'in geri kalanı (feedback döngüsü, mesaj gönderimi, native
ekranlar).

## eBay — hesap yarısı başladı (6 Eyl 2026, 02:35 UTC)

- eBay Developers Program hesabı `nivadesk` (5 Eyl'de açıldı, hoş geldin maili var; onay süreci yok, hesap anında aktif).
- **Sandbox keyset "NivaDesk" oluşturuldu** (6 Eyl ~02:34 UTC, birincil iletişim: EGGCRAFT LIMITED / Business). App ID (Client ID): `EGGCRAFT-NivaDesk-SBX-05fd51f72-0f019961`. Dev ID ve Cert ID kaydedilmedi; Cert ID'yi kullanıcı Secret Manager'a girecek (`EBAY_CLIENT_SECRET`), App ID `EBAY_CLIENT_ID`, kutu anahtarı `EBAY_TOKEN_KEY`.
- Kod: `ebay-connector` dalı, ayrı worktree `/Users/gocmen/Developer/studioflow-ebay` (ana ağaç functions batch deploy'ları sırasında dokunulmaz). İş akışı `ebay-connector-build`: OAuth (RuName), token kutusu, Fulfillment API senkronu (engine üzerinden), marketplace account deletion challenge uç noktası, flag kapalı; web kartı + Mac/iPhone + Android kartları + testler.
- Sırada: tasarım çıkınca eBay portalında RuName (redirect URL) kaydı; Sandbox test hesabı; production keyset (anında verilir) ve Application Growth Check yalnız hacim büyüyünce.
