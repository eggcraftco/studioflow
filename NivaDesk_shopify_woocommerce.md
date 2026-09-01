# Shopify ve WooCommerce nasıl çalışıyor

`NivaDesk_etsy_ve_yeni_baglantilar.md` dosyasının eşi. Etsy dosyası "bir sağlayıcı
nasıl olmalı"yı anlatıyordu; bu dosya **bugün gerçekten ne olduğunu** anlatıyor —
ve ikisi arasındaki farklar, yeni bir platform eklerken hangi tuzaklara
düşülmemesi gerektiğinin listesi.

Kod 1 Eylül 2026 durumuna göre okundu.

---

## 1. Bir bakışta: dört kanal, iki mimari

NivaDesk'e sipariş dört yoldan giriyor ve bunlar **aynı şey değil**:

| Kanal | Mimari | Kurulum |
|---|---|---|
| **WooCommerce** | Push-only webhook | Satıcı WordPress'te bir webhook açıyor, hazır URL'i yapıştırıyor |
| **Shopify — manuel katman** | Push-only webhook (Woo'nun klonu) | Satıcı Shopify admin'de webhook açıyor |
| **Shopify — resmi uygulama** | OAuth + gömülü admin + push + backfill | App Store'dan kuruluyor |
| **Inbound (genel)** | Push-only webhook | Zapier / Make / Wix / Squarespace hepsi bu tek kanalı kullanıyor |

Etsy bunların hiçbiri değil: OAuth + **polling**. Yani NivaDesk'te bugün üç
farklı entegrasyon felsefesi bir arada yaşıyor.

> **Kritik nokta:** WooCommerce'ta ve manuel Shopify katmanında **hiç API
> istemcisi yok**. Repo'da tek satır WooCommerce API çağrısı bulunmuyor.
> Bu iki kanal sadece kendilerine gönderileni alabiliyor.

---

## 2. WooCommerce

### Kurulum
Sahip Settings → Integrations → WooCommerce açıyor. `getWooCommerceWebhookToken`
(index.js:18353) bir token basıyor ve **tokenı geri döndürmüyor** — sadece hazır
teslimat URL'ini:

```
.../woocommerceOrderWebhook?companyId=<cid>&token=<token>
```

Satıcı bunu WooCommerce > Settings > Advanced > Webhooks içine yapıştırıyor,
konu `Order created`. Tek yapıştırılan değer bu; hiçbir yere token yazmıyor.

### Kimlik doğrulama — üç dallı tek karar
`wooWebhookAuthDecision` (index.js:18396) ayrı bir fonksiyon ve kendi testi var
(`test/qa/woo-signature.test.js`) — bu kanaldaki tek birim testi:

1. Workspace bir **imza secret'ı** kaydettiyse **ve** `X-WC-Webhook-Signature`
   başlığı geldiyse → imza belirleyici. Yanlış imza, token doğru olsa bile
   reddedilir. (Yanlış imza ya sahtecilik ya yanlış yapılandırma; ikisi de sesli
   olmalı.)
2. Başlık yoksa → URL'deki token karar veriyor (`nvTimingSafeEqual`).
3. Hiçbiri tutmuyorsa → 401.

İmza secret'ı ikinci faktör; opsiyonel. **Bu, dört kanalın hiçbirinde olmayan bir
şey** — Shopify manuel katmanının HMAC'i yok.

### Akış
Workspace `?companyId` / `x-studioflow-company-id` başlığı / order meta'sından
çözülüyor. `nivadeskTest:true` gövdesi kısa devre yapıyor (hiçbir şey yaratmıyor).
Sadece `WOO_PAID_STATUSES = {processing, completed}` sipariş yaratıyor. Doküman
kimliği `siparisler/woo_<companyId>_<wooOrderId>` — **tekilleştirmenin tamamı bu**.
Yeniden teslimat aynı kimliğe düşüyor, `isNew=false` ile eşleyici tekrar koşuyor ve
`integrationOrderUpdate` yazımı mağaza-sahipli alanlara daraltıyor.

### Woo'ya özel iki şey
- **Taksit birleştirme** (`wooCombineInstallments`, varsayılan **açık**): yeni bir
  Woo siparişi geldiğinde müşterinin tek bir açık Woo siparişi varsa, ikinci
  sipariş yaratılmıyor — ödeme o siparişe taksit olarak ekleniyor.
  `companies/{cid}/wooMergedPayments/{wooOrderId}` idempotency işareti.
- **Workspace teslim süresi**: `resolveDefaultDeliveryTime` çağrılıyor. (Manuel
  Shopify katmanı bunu yapmıyor — `deliveryTime: 45` sabit yazıyor.)

Her teslimat — yetkili olsun olmasın — `integrationSecrets/woocommerce` içindeki
**dokuz kayıtlık** halka tampona yazılıyor. Arayüzdeki "bağlı mı" cevabı bu.

---

## 3. Shopify — iki katman

### 3a. Manuel katman (eski)
`shopifyOrderWebhook` (index.js:18932). Woo akışının bilinçli bir klonu; kod
yorumu da bunu söylüyor (index.js:18693). Farklar:
- **HMAC yok.** Sadece workspace token'ı. Woo'nun ikinci faktörü buraya
  kopyalanmadı.
- `deliveryTime: 45` sabit.
- Taksit birleştirme yok.

**Ve bir tanesi Shopify'a özel:** sipariş işine başlamadan önce `shopifyStores`
koleksiyonuna bakıyor; bu workspace'in `status === "active"` bir mağazası varsa
teslimatı **HTTP 409 `official_app_active`** ile reddediyor (index.js:18987).
Resmi uygulama kurulduysa eski kanal kendiliğinden çekiliyor.

### 3b. Resmi App Store uygulaması
İki sunucu var:

| Ne | Nerede |
|---|---|
| Gömülü Polaris/App-Bridge arayüzü + OAuth kurulumu | **Cloud Run** — `nivadesk-order-management/` (React Router SSR), europe-west2 |
| Webhook alımı, iş mantığı, faturalandırma kataloğu | **Cloud Functions** — `functions/index.js` |

Cloud Run'da **iş mantığı yok**. Her ekran tek bir HTTP ucunu çağırıyor:
`shopifyAppBridge` (index.js:28991), sunucudan sunucuya paylaşılan bir secret'la
(`x-nivadesk-bridge-secret`).

**Kurulum ve token:** kurulum sonrası `afterAuth` kancası bridge'in `upsertStore`
dalını çağırıyor; offline access token `shopifyStores/{shop}.accessToken` içine
yazılıyor ve **sunucudan hiç çıkmıyor**. Oturumlar `shopifySessions` içinde
(Cloud Run stateless olduğu için Prisma yerine `FirestoreSessionStorage`).

**Mağaza → workspace bağlama (nonce el sıkışma).** Firebase Auth üçüncü-taraf
depolama kısıtlı iframe'lerde güvenilir çalışmadığı için bağlama Shopify
iframe'inin **dışına** çıkıyor:
1. Gömülü ekran bridge'den `beginConnect` istiyor → sunucu 15 dakikalık bir nonce
   basıyor ve `https://nivadesk.app/connect/shopify?shop=…&nonce=…` döndürüyor.
2. Bu URL `window.open` ile **üst seviye yeni sekmede** açılıyor. Gömülü ekran
   4 saniyede bir kendini yeniliyor, bağlanınca kendiliğinden "Connected"a dönüyor.
3. Web sayfası kullanıcının workspace'lerini listeliyor (sahip olmayan satırlar
   pasif) ve `shopifyCompleteConnect` çağırıyor — **owner-only**, nonce'u
   `nvTimingSafeEqual` ile doğruluyor, süresini kontrol ediyor, sonra siliyor.

**Webhook'lar Cloud Run'a hiç uğramıyor.** `shopify.app.toml` on iki konuyu +
üç GDPR ucunu doğrudan `shopifyAppWebhook`'a (index.js:29889) yönlendiriyor.
Orada sırasıyla: HMAC doğrulama (`SHOPIFY_APP_SECRET`) → GDPR kısa devresi →
**tekilleştirme** (`shopifyStores/{shop}/webhookEvents/{event-id}` `create()` ile,
`expireAt` 7 gün) → `routeShopifyAppTopic`, ki o da mağaza `active` ve `companyId`
dolu değilse hiçbir şey yapmıyor.

**Sipariş yaratma yolu** manuel katmanla aynı eşleyiciyi ve aynı doküman kimliğini
kullanıyor — ama üstüne bu katmana özel dört şey ekliyor:
- **Filtreler**: `excludeTags` → `includeTags` → `filterMode`
  (`include_products` / `exclude_products` / `include_collections`). Koleksiyon
  filtresi `collectionCache` (24 saat tazelik) üzerinden GraphQL sorguyor ve
  token/HTTP hatasında **fırlatıyor** — sipariş satıcının filtresine rağmen
  sessizce içeri girmesin diye.
- **İş akışı kuralları** (`productWorkflows`): ürün id'si veya etiketle eşleşen ilk
  kural siparişin `status`'ünü ve `todoItems`'ını belirliyor, atanan kişiyi
  yazıyor.
- **Ödeme kapısı**: `SHOPIFY_APP_PAID_STATUSES = {paid, partially_paid, partially_refunded}`.
- İki ek özel alan: `Shopify Store` ve `Shopify Domain` (ikincisi "View in Shopify"
  bağlantısını besliyor).

**Güncelleme yolu eşleyiciyi hiç çalıştırmıyor** (index.js:29632). Dar bir yama
kuruyor: finansal durum değiştiyse `Shopify Status`, toplam değiştiyse
`Shopify Total`, iptalde `status:"Cancelled"`. Ayrıca kargo olayları
`isDispatched` + `trackingNumber` + `courier` yazıyor, iade olayları
`Shopify Status:"refunded"`.

**Sync log + retry:** her teslimat `shopifyStores/{shop}/syncLog` içine bir satır
yazıyor. Hata satırı ham payload'ı da taşıyor (180 KB'a kadar) ve
`webhookEvents` iddiasını **siliyor** ki Shopify'ın yeniden denemesi çalışsın.
Gömülü arayüzdeki Retry düğmesi o payload'ı tekrar boru hattına sokuyor.

**Backfill:** `shopifyImportOrders` (index.js:30170) Shopify GraphQL'den okuyup her
düğümü REST webhook şekline çeviriyor (`shopifyGraphQLOrderToRest`) ve **aynı**
`applyShopifyOrderEvent`'ten geçiriyor — yani filtreler, ödeme kapısı ve
tekilleştirme geçmiş içe aktarımda da aynen geçerli.

**GDPR:** üç zorunlu uç karşılanıyor. `shop/redact` mağaza ağacını siliyor;
`customers/redact` `siparisler` ve `musteriler` üzerinde **sadece kaynağı Shopify
olan** kayıtları anonimleştiriyor, finansal toplamlara dokunmuyor.

### 3c. Shopify faturalandırma rayı
Shopify'ın 1.2.1 kuralı App Store uygulamasının **Shopify'ın Billing API'si**
üzerinden ücretlendirmesini zorunlu kılıyor; merchant'ı Stripe Checkout'a
göndermek listelemeyi durdurmuştu (index.js:28667 yorumu).

- Katalog sunucuda: `SHOPIFY_BILLING_PLANS` — Starter **$12**, Pro **$25**,
  Team **$65**, hepsi `EVERY_30_DAYS`, para birimi USD'ye sabit (Partner listeleme
  formunda para birimi seçici yok). Gömülü uygulama hiçbir fiyatı sabitlemiyor,
  sunucudan teklif istiyor.
- **Test ücreti bir bayraktan değil, mağazadan** anlaşılıyor:
  `shop { plan { partnerDevelopment } }`.
- Yetki tek bir idempotent yazıcıdan geçiyor: `applyShopifySubscription`
  (index.js:28814), hem onay dönüşünden hem `app_subscriptions/update`
  webhook'undan çağrılıyor.
- **Çifte ücretlendirme iki yönde de engelli**: `workspaceBilledOutsideShopify()`
  Stripe/Apple/Google ile ödeyen bir workspace'e Shopify'dan satmıyor;
  `refuseSecondTill()` tersini engelliyor.
- **Yükseltme yarışı düzeltmesi**: Shopify aboneliği yerinde değiştirmiyor —
  yenisini aktive edip eskisini iptal ediyor ve iki webhook'u 144 ms arayla
  gönderiyor. Çözüm bir Firestore transaction + geçersiz kılınmış aboneliğin
  iptalini yok sayan `heldGid` kontrolü.
- **Uninstall planı düşürmüyor.** Mağaza `uninstalled` işaretleniyor, token ve
  oturumlar siliniyor; gerçek iptal `app_subscriptions/update` ile geliyor.

> Bu rayın Etsy/Woo/Amazon'da **karşılığı yok** ve olması da gerekmiyor —
> pazaryeri-zorunlu faturalandırma sadece Shopify'ın kuralı.

---

## 4. Inbound — paylaşılan ray

Zapier, Make, Wix, Squarespace **ayrı sağlayıcı değil**; hepsi tek bir `inbound`
kanalını kullanıyor. Tasarımın amacı bu.

Alt katman provider'dan bağımsız bir **webhook-token rayı**: `INTEGRATION_KINDS`
(index.js:18084) bugün üç tür tanımlıyor (`woocommerce`, `shopify`, `inbound`) ve
her tür bedavaya şunları alıyor:
- `companies/{cid}/integrationSecrets/{kind}` altında sunucuya özel token
- Eski company-dokümanı alanından kendiliğinden göç
- Basma / döndürme döngüsü
- Dokuz kayıtlık teslimat halkası ("gerçekten bağlı mı" sorusunun cevabı)

Üst katman `inboundOrderWebhook` + `mapGenericInboundOrderToSiparis`: geniş anahtar
toleranslı normalize bir sipariş JSON'u kabul ediyor. İki dürüstlük aracı var:
`sendTestInboundWebhook` (workspace'in kendi URL'ine basıyor, hiçbir şey
yaratmıyor) ve `validateInboundOrderPayload` (yapıştırılan payload'ı gerçek
eşleyiciden geçiriyor, ağ yok, yazma yok).

**Yeni bir push sağlayıcı `INTEGRATION_KINDS`'e tek satır ekleyerek bunların
hepsini alıyor.**

---

## 5. Dört kanalın buluştuğu yer

| Paylaşılan yardımcı | Woo | Shopify manuel | Shopify app | Inbound | Etsy |
|---|:--:|:--:|:--:|:--:|:--:|
| `orderDocRef` + deterministik doküman kimliği | ✅ | ✅ | ✅ | ✅ | ✅ |
| `integrationOrderUpdate` (alan sahipliği) | ✅ | ✅ | ❌ | ✅ | ✅ |
| `integrationOrderCapacity` + `holdIntegrationOrder` (plan limiti) | ✅ | ✅ | ❌ | ❌ | ✅ |
| `upsertIntegrationCustomer` (müşteri aynası) | ✅ | ✅ | ✅ | ✅ | ✅ |
| `reconcileLineItems`, `cleanWooText`, `wooNumber`, `wooDate` | ✅ | ✅ | ✅ | ✅ | kendi primitifleri |

İki satırın boşlukları önemli:

- **Resmi Shopify uygulaması plan limitini de `integrationOrderUpdate`'i de
  atlıyor.** Kendi güncelleme kuralları var (dar yama). Yani "mağaza parayı,
  stüdyo işi sahiplenir" kuralı bu katmanda başka bir mekanizmayla sağlanıyor —
  aynı kural değil, aynı sonucu veren ikinci bir uygulama.
- **Inbound plan limitini hiç kontrol etmiyor.** Sipariş her koşulda yazılıyor.

Müşteri çakışma anahtarı hepsinde ortak: `companySettings.integrationCustomerSync`
— değeri `"nivadesk"` ise stüdyonun değeri kazanıyor, mağaza sadece boşluk
doldurabiliyor. (Yazan tek callable `saveIntegrationSyncSettings`.)

---

## 6. Etsy vs Shopify/WooCommerce — asimetriler

Yeni bir platform eklerken asıl bakılacak tablo bu.

### Etsy'de var, Shopify/Woo'da yok
| Yetenek | Neden önemli |
|---|---|
| **Onay kapısı** (`importState !== "done"` → hiçbir şey içeri girmez) | Satıcı ne alacağını seçmeden geçmiş boşalmıyor |
| **Bayatlık koruması** (`externalUpdatedAtMs`) | Sırasız/tekrarlanan teslimat eski anlık görüntüyü yazamıyor |
| **Dış sipariş indeks satırı** (`etsyExternalOrders`) | Dış kimlik ↔ iç kimlik + senkron durumu tek yerde |
| **Zamanlanmış mutabakat** (15 dk, kota-duyarlı) | Kaçan teslimat kendiliğinden yakalanıyor |
| **İnsan onaylı müşteri eşleştirme** + kalıcı bağ | Belirsiz eşleşme sessizce yanlış müşteriye yazılmıyor |
| **Relay e-posta koruması** | Anonim alıcı adresleri müşteri birleştirmeyi bozmuyor |
| **Şifreli token** (AES-256-GCM) | Shopify'ın `accessToken`'ı Firestore'da **düz metin** |

### Shopify resmi uygulamasında var, Etsy/Woo'da yok
Mağaza başına filtreler + iş akışı kuralları, gömülü admin arayüzü, GraphQL
backfill, satır-satır Retry'lı sync log, event-id tekilleştirme, GDPR uç üçlüsü,
faturalandırma rayı.

### Woo'da var, Shopify/Etsy'de yok
İkinci kimlik faktörü (imza secret'ı), taksit birleştirme, workspace teslim
süresi, meta ile `designName`/`watchRef` geçersiz kılma.

### En büyük yapısal fark
> **WooCommerce ve manuel Shopify katmanı push-only ve hiçbir mutabakat yolu yok.**
> Etsy 15 dakikada bir tarıyor; Shopify resmi uygulaması istek üzerine backfill
> yapabiliyor. Woo veya manuel Shopify'ın teslim edemediği (ya da bizim 500
> verdiğimiz ve mağazanın vazgeçtiği) bir sipariş **kalıcı olarak kayıp** — API
> istemcisi yok, polling yok, yeniden çekme yok. `recentDeliveries` dokuz kayıtta
> kapalı ve token döndürüldüğünde tamamen siliniyor. Satıcının eksik siparişten
> haberdar olmasının tek yolu, o siparişin yokluğunu fark etmek.

---

## 7. Platform durumu

| | Web | Mac / iPhone | Android |
|---|---|---|---|
| WooCommerce kurulumu | ✅ | ✅ | ✅ |
| Shopify manuel kurulumu | ✅ | ✅ | ✅ |
| Resmi Shopify mağazalarını yönetme (duraklat/kaldır/log) | ✅ | ✅ | ✅ |
| **Resmi Shopify bağlantısını tamamlama** | ✅ | ❌ | ❌ |
| Token döndürme | ✅ | ❌ | ❌ |
| Test teslimatı gönderme | ✅ | ❌ | ❌ |
| Teslimat geçmişini görme | ✅ | ❌ | ❌ |
| Woo imza secret'ı | ✅ | ❌ | ❌ |
| Siparişte Shopify kaynak şeridi | ✅ | ✅ | ✅ |
| Siparişte Woo/inbound kaynak şeridi | ❌ | ❌ | ❌ |

Son üç satırdaki eksikler **sunucu eksiği değil**: native istemcilerin zaten
çağırdığı callable'lar (`getWooCommerceWebhookToken` vb.) `recentDeliveries`,
`lastDeliveryError` ve `tokenCreatedAtMs` alanlarını aynı yanıtta döndürüyor —
iki istemci de yanıttan yalnızca üç boolean/sayı çözüyor.

---

## 8. Veri modeli ve güvenlik

| Yol | Ne | Erişim |
|---|---|---|
| `companies/{cid}/integrationSecrets/{woocommerce\|shopify\|inbound}` | Workspace token'ı, imza secret'ı, dokuz teslimat kaydı | Deny-list'te, sunucuya özel |
| `shopifyStores/{shop}` | **Düz metin offline access token**, `companyId`, `settings`, `stats` | `allow read, write: if false` |
| `shopifyStores/{shop}/{webhookEvents,syncLog,imports,collectionCache,privacyRequests}` | Tekilleştirme, log, backfill ilerlemesi, koleksiyon önbelleği, GDPR denetimi | aynı |
| `shopifySessions/{sessionId}` | Cloud Run oturumları — token'ın ikinci kopyası | `allow read, write: if false` |
| `companies/{cid}/heldIntegrationOrders/{provider}_{externalId}` | Plan limitinde park etmiş ham payload | Deny-list'te |

Platform secret'ları yalnızca ikisi: `SHOPIFY_APP_SECRET` ve
`SHOPIFY_BRIDGE_SECRET`. **WooCommerce'ın hiç `defineSecret`'ı yok** — kimlik
doğrulaması tamamen workspace başına.

**Saklama zayıf yarı.** `webhookEvents` üzerine 7 günlük `expireAt` yazılıyor ama
repoda **hiçbir TTL politikası tanımlı değil**. `syncLog` (hata satırı başına
180 KB'a kadar ham JSON), `imports`, `privacyRequests`, `collectionCache` ve
`heldIntegrationOrders` için hiç son kullanma yok.

---

## 9. Test durumu

Etsy'nin 13 özel test dosyası var (OAuth, token şifreleme, webhook imza/replay,
eşleyici, şema kayması, müşteri eşleştirme, kota, timeout, Firestore kuralları,
bağlantı kesme saklama). Shopify + WooCommerce'ın karşılığı dört kopuk dilim:

- `test/e2e/shop-mappers-emulator.test.js` — 10 test (4 Shopify, 4 Woo, 2 inbound).
  Eşleyiciyi doğrudan çağırıp sonucu Firestore'a yazıyor ve geri okuyor.
- `woo-signature.test.js` — Woo kimlik kararı.
- `integration-secrets.mjs`, `webhook-protocol.mjs` — gerçek HTTP uçları,
  yalnızca token/döndürme/test payload davranışı.
- `shopify-billing.test.js`, `entitlement-shopify.test.js` — faturalandırma, sipariş değil.

**En büyük iki boşluk:**
1. Resmi Shopify uygulamasının sipariş senkron katmanının (`applyShopifyOrderEvent`,
   `applyShopifyFulfilmentEvent`, `applyShopifyRefundEvent`, `shopifyAppHmacValid`)
   **hiç testi yok** — kendi güncelleme kurallarına sahip ikinci bir alım yolu bu.
2. Gerçek bir HTTP teslimattan sonra Shopify/Woo sipariş dokümanının **ne içerdiğini**
   hiçbir test iddia etmiyor; sadece eşleyicinin izole çıktısı doğrulanıyor.

Ayrıca `npm test` bunların neredeyse hiçbirini koşmuyor — mapper spec'i
`test:e2e`'de, HTTP suite'leri `test:integration`'da.

---

## 10. Bilinen boşluklar

- **Entegrasyonlar panosundaki Shopify kartı manuel katmanı görmüyor.**
  `loadIntegrationSignals` `getShopifyIntegrationsForWorkspace` + Woo + inbound
  kanal sinyallerini çekiyor, ama `shopify` kanal sinyalini hiç sormuyor. Yalnızca
  manuel webhook kullanan bir workspace'e teslimatlar düşerken kart sonsuza kadar
  "bağlı değil" diyor.
- **Resmi Shopify katmanının rehber bölümü yok.** `guide.ts` yalnızca WooCommerce
  ve *manuel* Shopify webhook'unu anlatıyor. Kurulum, nonce el sıkışma, mağaza
  ayarları/filtreler, backfill, sync geçmişi, Shopify faturalandırma — hiçbiri
  corpus'ta yok. Proje kuralına göre bu özellik kapanmış sayılmaz.
- **`resyncIntegrationCustomer` müşteri çakışma anahtarını yok sayıyor.**
  `integrationCustomerSync` ne olursa olsun 13 alanı koşulsuz eziyor, yani
  "NivaDesk kazanır" politikası Customers arayüzünden atlatılabiliyor.
- **Inbound gönderen kaynak etiketini kendisi seçiyor.** `payload.source` ile
  `"shopify"` yazıp gerçek Shopify müşteri kayıtlarıyla çakışabiliyor. Diğer üç
  kanal sabit bir literal geçiyor.
- **Park etmiş sipariş serbest bırakma yalnızca web'de.** Mac ve Android
  "N sipariş yer bekliyor" diyebiliyor ama serbest bırakamıyor.
- **`releaseHeldIntegrationOrders`'ın `else` dalı siliyor, atlamıyor.** Bugün
  ulaşılamaz (yalnızca üç sağlayıcı park ediyor) ama bu dal daha önce bir kez Etsy
  siparişlerini yemiş.
- **Pazarlama sitesi ve dashboard Etsy'yi hâlâ yanlış anlatıyor.**
  `structuredData.tsx` Etsy'yi "genel webhook / Zapier ile bağlanır" diye
  listeliyor (11 dilde), `dashboardOrderChannel` ise Etsy siparişlerini
  **"manual"** kovasına atıyor — Etsy cirosu kanal olarak görünmüyor.
