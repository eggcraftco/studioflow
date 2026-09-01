# Etsy nasıl çalışıyor — ve yeni bir mağaza bağlantısı (Shopify, Amazon) nasıl çalışmalı

Bu doküman iki iş yapıyor: (1) Etsy'nin bugün dört platformda uçtan uca nasıl
çalıştığını anlatıyor, (2) o çalışan modelden yeni bir sağlayıcının uyması
gereken **sözleşmeyi** çıkarıyor. Kod 1 Eylül 2026 tarihli `main`/
`macbook-save-before-macstudio-2026-06-01` durumuna göre okundu.

---

## 1. Tek cümlede

Satıcı bir kez Etsy'de onay veriyor; sunucu o andan sonra siparişleri kendisi
çekiyor, NivaDesk siparişine çeviriyor ve **mağazanın parayı, stüdyonun işi**
sahiplendiği bir birleştirme kuralıyla yazıyor. İstemcilerin (web, Mac, iPhone,
Android) hiçbiri Etsy ile konuşmuyor — hepsi aynı 11 Cloud Function'ı çağırıyor.

---

## 2. Uçtan uca akış

### a) Bağlanma (bir kez, sadece workspace sahibi)
1. İstemci `beginEtsyConnect` çağırıyor. Sunucu bir PKCE `code_verifier` ve bir
   `state` üretip **Firestore'da** `etsyOAuthStates/{state}` dokümanına yazıyor
   (verifier şifreli, TTL 10 dk, `used:false`). Geriye sadece `authorizeUrl`
   dönüyor — tarayıcı hiçbir zaman token, verifier veya secret görmüyor.
   **Çerez yok**; CSRF koruması bu dokümanın kendisi.
2. Satıcı Etsy onay ekranını görüyor. Dönüş adresi `https://nivadesk.app/etsy/callback`
   — bu bilerek kendi alan adımız: Etsy'nin onay ekranı, hedef kayıtlı alan adı
   değilse sarı bir uyarı basıyor ve satıcı bunu tam mağazasını devrederken
   phishing sanıyor. O route hiçbir şey yapmıyor, parametreleri olduğu gibi
   `etsyOAuthCallback` fonksiyonuna 302'liyor.
3. `etsyOAuthCallback` state'i **transaction içinde** tüketiyor (tekrar oynatılan
   bir callback "used" buluyor), kodu token'la takas ediyor, mağazayı
   `/users/{id}/shops` → `/users/me` sırasıyla **soruyor** (URL'den güvenmiyor),
   ve bağlantıyı `etsyConnections/{companyId}_{shopId}` dokümanına yazıyor.
   Doküman kimliği deterministik: aynı mağazayı yeniden bağlamak aynı satırı
   günceller, `connectedAt` ve `importState` korunur.
4. Tarayıcı `nivadesk.app/settings?section=etsy&etsy=connected&shop=…` adresine
   düşüyor; web paneli bunu okuyup yeni mağazayı seçiyor ve canlı sağlık
   kontrolünü kendiliğinden çalıştırıyor.

### b) İlk içe aktarım (satıcı onaylamadan tek sipariş girmez)
Satıcı tarih aralığını (30/90/365 gün) ve dört filtreyi seçiyor
(`includeCompleted / includeUnpaid / includeCancelled / includeDigital`),
**`previewEtsyImport`** kuru bir prova yapıyor — hiçbir şey yazmıyor, her makbuzu
`ready / review / unsupported` diye adlandırılmış bir gerekçeyle sınıflıyor.
Onaylanınca **`runEtsyImport`** aynı pencereyi gerçekten yazıyor ve bağlantıya
`importState:"done"` damgasını vuruyor.

> Bu damga bir kapı: `importState !== "done"` olduğu sürece otomatik yollar
> (süpürme, webhook) **hiçbir sipariş yazmıyor**. Satıcı ne alacağını seçmeden
> geçmişi içeri boşaltmıyoruz.

### c) Sürekli akış — beş kapı, tek fonksiyon
| Kapı | Ne | Tetik |
|---|---|---|
| `etsyWebhook` | Etsy haber veriyor | Etsy push (imzalı) |
| `reconcileEtsyConnections` | Emniyet ağı | 15 dakikada bir (zamanlanmış) |
| `syncEtsyNow` | "Şimdi senkronla" | Satıcı |
| `runEtsyImport` | Toplu içe aktarım | Satıcı |
| `releaseHeldIntegrationOrders` | Plan limitinde park etmiş siparişler | Satıcı |

Beşi de **tek bir fonksiyona** giriyor: `applyReceipt()` (`functions/etsySync.js`).
"Bu makbuz bende var mı, elimdeki daha mı yeni?" sorusunun tek cevap yeri orası.

Etsy'nin webhook'u içeriği taşımıyor — sadece `{event_type, shop_id, resource_url}`.
İmza (Standard Webhooks, ham gövde üzerinden) doğrulanıyor, `webhook-id` ile
tekilleştiriliyor, workspace **istekten değil** `etsyConnections`'tan çözülüyor ve
gerçek makbuz satıcının kendi token'ıyla çekiliyor.

### d) Siparişin yazılması
`normalizeEtsyReceipt` makbuzu `{order, customer, source, review}` zarfına
çeviriyor. Sonra:
- **Tekillik yapısal**: sipariş kimliği `etsy_<companyId>_<shopId>_<receiptId>`,
  dış kayıt kimliği `etsyExternalOrders/<companyId>_<shopId>_<receiptId>`. İki
  yarışan işçi iki satır yaratamaz.
- **Sıra dışı teslimat reddediliyor**: kayıtlı `externalUpdatedAtMs` gelenden
  büyükse `{status:"stale"}`.
- **Plan kapasitesi**: yer yoksa sipariş yazılmıyor, ham veri
  `heldIntegrationOrders`'a **park ediliyor** ve sahibine günde en fazla bir kez
  haber veriliyor.
- **Yazım**: `integrationOrderUpdate(...)` ile — aşağıdaki 3. bölümün kalbi.
- `etsySource` bloğu **ayrı** bir merge ile yazılıyor: "Etsy ne diyor"un salt
  okunur aynası, stüdyonun alanlarına karışmıyor.

---

## 3. Ortak boru hattı mı, Etsy'ye özel mi?

Asıl anlatılması gereken tablo bu. Sol sütun yeni sağlayıcıda **aynen** çalışır;
sağ sütun her sağlayıcıda yeniden yazılır.

| Ortak (bugün Etsy + Shopify + Woo + inbound kullanıyor) | Etsy'ye özel |
|---|---|
| `integrationOrderUpdate` + `INTEGRATION_SHOP_OWNED_FIELDS` — resync'te kimin neyi yazabildiği | OAuth + PKCE + token şifreleme + tek-uçuşlu yenileme kilidi |
| `integrationOrderCapacity` / `holdIntegrationOrder` / `releaseHeldIntegrationOrders` — plan limiti | Poller: `reconcileWatermarkMs`, `RECONCILE_OVERLAP_MS`, "sadece temiz taramada ilerlet" |
| `upsertIntegrationCustomer` — müşteri aynası | Kota yöneticisi: `etsyQuota`, 220 ms çağrı aralığı, %75'te süpürmeyi durdurma |
| `reconcileLineItems`, `resolveDefaultDeliveryTime`, `orderDocRef` ve `woo*` önekli genel yardımcılar | Eşleyici: `{amount, divisor, currency_code}` para tuzağı, `question_id` ile kişiselleştirme ayıklama |
| `shop-mappers-emulator.test.js` uyum testleri | Alıcı kimliği: relay e-posta alan adları, `buyer_user_id` tek otomatik sinyal |
| Webhook token rayı (`INTEGRATION_KINDS`, `readIntegrationSecret`) — **ama push kanalı için** | İmza doğrulama biçimi (Standard Webhooks vs Shopify HMAC) |

**Doğru şablon ama henüz genelleştirilmemiş:** `createEtsyConnectFunctions(deps)` /
`createEtsySyncFunctions(deps)` / `createEtsyWebhookFunction(deps)` üçlüsü. Bağımlılık
listesi zaten sağlayıcıdan bağımsız; sadece `etsy` modülü ve dışa verilen isimler
sabit. Bu, `createMarketplaceSyncFunctions(provider, deps)` olmaktan bir yeniden
adlandırma uzakta.

**En büyük eksik:** ortak bir "normalize sipariş zarfı" yok. `normalizeEtsyReceipt`
`{order, customer, source, review}` dönerken diğer üç eşleyici düz bir sipariş
dönüyor ve müşteri nesnesini her çağrı yerinde ayrı ayrı kuruyor. Bir sağlayıcı
kaydı (registry) yazılacaksa ilk iş bu zarfı hepsine dayatmak.

---

## 4. Değişmez kurallar (yeni platformda birebir geçerli)

1. **Mağaza parayı ve müşteriyi sahiplenir, stüdyo işi sahiplenir.**
   `INTEGRATION_SHOP_OWNED_FIELDS` listesindeki alanlar resync'te yazılır;
   `status`, `designStatus`, `trackingNumber`, `courier`, `priority`, `todoItems`,
   `assignedToUid`, `paymentDate` **asla** yazılmaz. Bu liste bir kez ihlal edildi
   ve satıcıların takip numaralarını silmişti.
2. **Sessizlik bir talimat değildir.** Boş gelen bir değer dolu bir değeri asla
   ezmez; sadece boşluğu doldurabilir.
3. **Not eklenir, değiştirilmez.** Alıcının notu zaten oradaysa tekrar yazılmaz;
   gerçekten değiştiyse alt satıra eklenir. Tezgâhın yazdığı hiçbir şey silinmez.
4. **Eşleyicinin uydurduğu sabitler yazılmaz.** Dört kanal da `taxRate: 0`
   gönderiyor çünkü hiçbir API oranı vermiyor. `UNKNOWN_ON_UPDATE_BY_SOURCE`
   tablosuna sağlayıcı adıyla bir satır eklenmezse elle girilen KDV oranı her
   senkronda sıfırlanır.
5. **Tekillik kimlikte olmalı, sorguda değil.** Doküman kimliği
   `<provider>_<companyId>_<shopId>_<externalId>` biçiminde deterministik olsun —
   **shopId segmenti şart**: bugün sadece Etsy'de var, yani aynı workspace'te aynı
   sağlayıcının iki mağazasına dayanan tek kanal o.
6. **Tenant istekten çözülmez.** Hangi workspace olduğu her zaman bağlantı
   dokümanından okunur, gelen payload'dan değil.
7. **Durum varsayılmaz, ölçülür.** Arayüzdeki "Connected" rozeti gerçek bir
   sinyalden gelir (`etsyConnections` satır sayısı). Etsy branch'i eklenmeden önce
   bağlı bir Etsy mağazası "Available" görünüyordu, alakasız bir inbound teslimat
   ise Etsy'yi "Connected" gösteriyordu.
8. **Token istemciye asla ulaşmaz.** Altı `etsy*` koleksiyonu da
   `allow read, write: if false`. İstemci sadece `publicConnectionView()` görüyor.

---

## 5. Veri modeli (hepsi kök seviyede, hepsi sunucuya özel)

| Koleksiyon | Ne tutuyor |
|---|---|
| `etsyConnections/{companyId}_{shopId}` | Mağaza + AES-256-GCM şifreli access/refresh token, `importState`, `reconcileWatermarkMs`, alt koleksiyon `syncLog` |
| `etsyOAuthStates/{state}` | Tek kullanımlık OAuth state + şifreli PKCE verifier (10 dk) |
| `etsyExternalOrders/{companyId}_{shopId}_{receiptId}` | Dış kimlik ↔ iç kimlik haritası + `externalUpdatedAtMs` (sıra dışı koruması) |
| `etsyCustomerLinks/{companyId}_{shopId}_{buyerId}` | İnsanın verdiği "bu alıcı bu müşteridir" kararı, kalıcı |
| `etsyWebhookEvents/{webhook-id}` | Webhook tekilleştirme defteri |
| `etsyQuota/{YYYY-MM-DD}` | **Uygulama geneli** günlük çağrı sayacı (5.000, tüm satıcılar ortak) |

Secret'lar: `ETSY_KEYSTRING` (client_id), `ETSY_SHARED_SECRET`, `ETSY_TOKEN_KEY`
(token şifreleme anahtarı), `ETSY_WEBHOOK_SECRET`. Hiçbiri Firestore'a yazılmıyor.
`x-api-key` başlığı `keystring:shared_secret` biçiminde — Etsy'nin belgelemediği
bir birleşim, tek başına keystring her yerde 403 veriyor.

---

## 6. Platform durumu

| | Web | Mac / iPhone | Android |
|---|---|---|---|
| Bağlan / kes | ✅ | ✅ (tarayıcıya devrediyor) | ✅ (tarayıcıya devrediyor) |
| Önizleme + seçerek içe aktarım | ✅ | ✅ | ✅ |
| Müşteri eşleştirme kararı | ✅ | ✅ | ✅ |
| OAuth dönüşünde kendiliğinden yenileme | ✅ | ❌ ekrandan çıkıp girmek gerekiyor | ❌ deep link yok |
| Siparişte "Etsy'den geldi" paneli | ❌ | ❌ | ❌ |
| Park etmiş siparişi serbest bırakma | ✅ | ❌ | ❌ |

Üçü de aynı sekiz callable'ı çağırıyor ve sunucunun owner/member rol kapılarını
birebir yansıtıyor. Fark uçlarda: dönüş yolu ve siparişteki görünürlük.

---

## 7. Yeni bir sağlayıcı eklerken asgari sözleşme

Amazon'u örnek alarak — bugün repoda Amazon adına **sadece** üç istemci
kataloğuna elle kopyalanmış `kind:"planned"` bir kart var, tek satır SP-API kodu yok.

Yeni sağlayıcının getirmesi gerekenler:

1. **Kimlik doğrulama.** Push mu pull mu? Amazon SP-API pull + LWA OAuth, yani
   Woo/Shopify'ın paylaşılan webhook-token rayı **yanlış şekil**; ihtiyacı olan
   şey Etsy'nin OAuth+şifreli token+yenileme kilidi yığını — ki o yığın bugün
   `etsy.js`'in içinden çağrılamıyor.
2. **Sipariş çekme.** Sayfalama biçimi (Etsy offset, Shopify cursor, Woo sayfa
   numarası) + hız sınırı yönetimi. Amazon'un operasyon başına token-bucket'ı
   Etsy'nin tek günlük sayacından daha zor.
3. **Eşleyici.** `{order, customer, source, review}` zarfını döndürmeli.
   `functions/test/e2e/shop-mappers-emulator.test.js`'e bir DOLU + bir SEYREK
   fikstür eklemek zorunlu — testler gerçek Firestore'a karşı koşuyor.
4. **Tekillik anahtarı.** `<provider>_<companyId>_<shopId>_<externalId>`.
5. **Bayatlık koruması.** Bir `externalUpdatedAtMs` eşdeğeri. Bugün bu koruma
   sadece Etsy'de ve Shopify app katmanında var; Woo ve inbound'da hiç yok.
6. **`UNKNOWN_ON_UPDATE_BY_SOURCE`'a bir satır.** Tek satır, ama atlanırsa elle
   girilen KDV oranı sessizce sıfırlanır.
7. **Durum sinyali + üç istemci kataloğu.** `integrations.ts`,
   `NivaDeskIntegrations.swift`, `IntegrationsHub.kt` — üçünde de kendi branch'i.
   `else` dalına düşerse inbound kanalının durumunu gösterir (bu bug bir kez
   yaşandı).
8. **Rehber bölümü.** `guide.ts`'e EN+TR bölüm + `buildGuideCorpus` + dört
   asistan fonksiyonunun deploy'u. Proje kuralı: bot anlatamıyorsa özellik bitmemiş
   sayılıyor.
9. **Sıfırlama.** Bağlantı kesildiğinde alıcı kimliklerini silmek (Etsy'de
   `etsyCustomerLinks` siliniyor, `etsyExternalOrders` bilerek kalıyor — çifte
   içe aktarımı önlüyor ve kişisel veri taşımıyor).

---

## 8. Bilinen boşluklar (bunlar sağlayıcıdan bağımsız, önce bunlar kapanmalı)

- **`etsySource`'u hiçbir istemci okumuyor.** Sunucu her siparişe yazıyor, dört
  platformun hiçbirinde gösterilmiyor. Shopify'ın aynısı üç yerde çizilmiş
  (`ShopifyOrderSourceStrip`), Etsy'nin branch'i yok.
- **macOS/iOS sipariş kaydı `etsySource`'u siliyor** — `setData(from:)` merge'süz
  yazıyor ve `Siparis` struct'ında bu alan yok. Sadece açıp kapatmak yetiyor.
  Panel bunun üstüne inşa edilirse ilk keşfedilecek şey bu olur.
- **Dashboard Etsy'yi "manual" sayıyor.** `dashboardOrderChannel` sadece
  `shopify` / `woocommerce` biliyor; `dashboardOrderCurrency` de `"Etsy Currency"`
  anahtarını okumuyor. Etsy cirosu kanal olarak görünmüyor.
- **Rol kapısı gevşek.** `previewEtsyImport` ve `syncEtsyNow` sadece
  `requireWorkspaceMember` ile korunuyor; `requireWorkspaceAreaAccess` çağırmıyor.
  Finans göremeyen bir üye önizlemeden alıcı adı ve tutar okuyabiliyor.
- **`admin` rolü mağaza bağlayamıyor.** Kod yorumu "owner/admin" diyor ama
  `requireWorkspaceOwner` yalnızca `ownerUid` kabul ediyor.
- **Hesap silme Etsy satırlarını bırakıyor.** `deleteMyAccount` altı kök
  koleksiyona dokunmuyor; satıcı önce bağlantıyı kesmediyse şifreli refresh token
  hesap silindikten sonra da duruyor.
- **Pazarlama sitesi hâlâ Etsy'yi "Zapier ile bağlanır" diye anlatıyor** — 11
  dilde ve FAQ JSON-LD'de. Uygulama içi bot güncellendi, site güncellenmedi.
