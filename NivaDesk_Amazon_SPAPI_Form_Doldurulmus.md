# Amazon Solution Provider Profile — girilen değerler

Form **tarayıcıda dolduruldu ama kaydedilemedi**: "Save as draft" de zorunlu alanları
istiyor (telefon + yedi güvenlik cevabı). Sekme kapanırsa gider — buradan yapıştır.

Doğrulama notu: aşağıdaki her cümle 4 Eylül 2026'da kod tabanından kontrol edildi.
Kullanıcının yakaladığı üç hata düzeltildi (bkz. §5).

---

## 1. Contact Information

| Alan | Değer |
|---|---|
| Organization name | `NivaDesk` |
| Organization website | `https://nivadesk.app` |
| Organization home country | United Kingdom |
| Primary contact name | Gunes Gocmen *(hazır geliyordu)* |
| Contact email | contact@eggcraft.co.uk *(hazır geliyordu)* |
| Contact country code / phone | **senin gireceğin** |

## 2. Data Access

**Public Solution Provider** — "I build application(s) that are publicly available to other
organizations and are authorized by sellers or vendors using OAuth."

> Form varsayılan olarak **Private** geliyor; bizim için yanlış. Müşterilerimiz kendi
> Amazon hesaplarını kendileri bağlıyor.

### Explain your primary business activity (500 KARAKTER — kelime değil)

```
NivaDesk is order-management software for small UK workshops - jewellers, ceramicists, furniture makers - who sell in several places at once. Sellers connect their own Amazon account by OAuth. We import their orders and line items so each becomes a job on their production board beside their Etsy and Shopify work, reconcile settlements so a payout is not counted as a second sale, and send fulfilment and tracking back. We do not list products, set prices, advertise or contact buyers.
```
*(486 karakter)*

## 3. Roles

İşaretlenen üç kısıtsız rol:

- **Inventory and Order Tracking** — siparişler ve kalemler; entegrasyonun kendisi
- **Finance and Accounting** — payout'un ikinci satış sayılmaması için mutabakat
- **Amazon Fulfillment** — salt okunur FBA stoğu; atölyenin kendi rafıyla karışmasın

**Direct-to-Consumer Shipping (Restricted) bilerek İSTENMEDİ.** Alıcı adresi paketi
göndermek için gerçekten gerekli, ama kısıtlı roller ek güvenlik incelemesi tetikliyor
ve üç güvenlik cevabımız şu an "Hayır". Use case metninde bunu açıkça yazdık; sonradan
ek başvuruyla istenecek.

### Use Cases — "Describe the application or feature(s)" (5000 karakter)

```
NivaDesk is a production and order management system used by small manufacturing workshops in the United Kingdom - jewellers, ceramicists, furniture and leather makers - who take bespoke commissions and also sell through online marketplaces. It already connects to Etsy, Shopify, WooCommerce and Square. Sellers repeatedly ask for Amazon, because a maker selling in four places currently has four inboxes and no single view of what they are making this week.

What we intend to build, role by role:

Inventory and Order Tracking. When a seller connects their own Amazon account through Login with Amazon, we retrieve their orders and order items and turn each one into a job on the workshop's production board, next to their Etsy and Shopify work. We keep the order in step as it changes. We read order status, line items with SKU and ASIN, quantities, prices, tax amounts and the fulfilment channel. We use the fulfilment channel to avoid a specific mistake: stock held by Amazon under FBA must never be reserved against a workshop's own shelf, because that piece has already left the building.

Amazon Fulfillment. Read-only visibility of FBA inventory, for the same reason. A workshop that keeps some stock with Amazon and some on its own shelf needs both numbers to be true, and NivaDesk must not double-count them.

Finance and Accounting. We reconcile Amazon settlements against the seller's bank feed and, where the seller has connected one, their accounting system. The purpose is to stop a payout being recorded as a second sale. A single Amazon payout covers many orders, minus fees and refunds, and a workshop that books both the orders and the deposit has overstated its revenue. This is a problem we have already solved for Square and PayPal in NivaDesk and would extend to Amazon.

What we send back to Amazon is limited to fulfilment: dispatch confirmation and tracking numbers for orders the workshop has made and posted.

What we will not do: we will not create or edit listings, set or automate prices, run advertising, solicit feedback, or message buyers. We have not requested those roles.

On restricted roles: fulfilling an order requires the buyer's delivery address, and we expect to request Direct-to-Consumer Shipping in a later amendment. We have deliberately not requested it in this application. We would rather complete our incident response documentation and formal access policies first, and request access to buyer personal information only once those are in place, than hold restricted data ahead of the controls that ought to protect it.

Each seller authorises their own account and can disconnect at any time from inside NivaDesk, which stops every background job for that connection immediately. NivaDesk is our own product, sold directly to the workshops that use it. We do not act on another company's behalf, and we do not resell, pool or re-license seller data.
```

### "Describe how your application will benefit authorized users" (500 karakter)

```
A workshop selling on Amazon, Etsy, Shopify and over the counter currently keeps four inboxes and no single answer to what it is making this week. NivaDesk puts every order on one production board, so a maker sees the work rather than the channel. Settlements are reconciled against their bank, so a payout is not counted as a second sale and their profit figure is true. FBA stock is kept separate from the shelf, so nothing is promised twice.
```
*(444 karakter)*

## 4. Security Controls — BOŞ BIRAKILDI

Yedi cevap da senin beyanın. Bugünkü **doğru** cevaplar:

| Soru | Doğru cevap bugün (4 Eyl 2026 güncellemesi) |
|---|---|
| Erişim iş rolüne göre kısıtlı mı? | **Yes** — `docs/security/access-control-policy.md`; kurallarda üç sunucu-zorunlu katman |
| Aktarımda şifreleme? | **Yes** |
| Kimlik bilgileri güvenli saklanıyor mu? | **Yes** — 4 Eyl'de gerçek oldu. Öncesinde TrueLayer ve Pandle token'ları düz metindi; ikisi de AES-256-GCM zarfına alındı, "hiçbir bağlayıcı düz metin yazmıyor" testi süitte |
| Ağ kontrolleri (firewall/IDS/anti-virüs/segmentasyon)? | sınırda — sunucusuz GCP, kontroller Google'ın |
| Olay müdahale planı (roller, 6 ay, 24 saat)? | **Yes** — `docs/security/incident-response-plan.md`; roller §3, 6 aylık döngü §11, 24 saat §6-§7 |
| Plan security@amazon.com'a 24 saatte bildiriyor mu? | **Yes** — §7, "farkına varıldıktan sonraki 24 saat içinde" |
| Parola: 12+, özel karakter, MFA, 365 gün, yıllık rotasyon? | **No — hâlâ.** Politika yazıldı (§6) ama hesaplar tek tek denetlenmedi. Denetim tablosu `password-and-mfa-policy.md` §8'de; her satır işaretlenip §7'ye kaydedilene kadar cevap No |

**Neden son satır hâlâ No:** belgenin var olması kontrolün uygulandığı anlamına gelmiyor. §8'deki altı hesabın her biri 12 karakter, özel karakter, benzersizlik, MFA ve 365 günlük yaş şartını fiilen karşıladığı doğrulanana kadar Yes demek, tam da bu politikanın önlemek için var olduğu hatayı yapmak olur.

### 4 Eylül 2026'da konsoldan doğrulananlar

| Ne | Bulunan | Yapılan |
|---|---|---|
| Firebase Auth parola politikası | enforcement **Notify**, tüm karakter şartları kapalı, minimum **6** | **Require** + numeric şartı + minimum **8** olarak ayarlandı. "Force upgrade on sign-in" bilinçli olarak kapalı bırakıldı (mevcut her kullanıcıya parola değiştirtirdi) |
| Identity Platform | zaten **etkin** | e-posta hesapları için MFA'nın önündeki engel sanılandan küçük: kalan iş dört istemcideki kayıt/doğrulama akışı |
| Firestore konumu | **europe-west2** (Londra) | başvuruda "Ireland and London" varsayımı yerine artık doğrulanmış tek bölge yazılabilir |
| Point-in-time recovery | **etkin**, 7 gün (604800s) | plana yazıldı |
| Yedek zamanlaması | **günlük**, 14 gün (1209600s) | plana yazıldı |
| Firestore delete protection | **KAPALI** | plan §8'de açıkça yazıldı, §11 "Outstanding actions"a alındı — açılması gerekiyor |

### "List all outside parties…"

```
Google Cloud Platform acts as our cloud infrastructure provider and hosts the NivaDesk application, database and associated backend services. Amazon Information retrieved through the Selling Partner API is processed and stored within this infrastructure solely to provide the services requested by the authorized seller.

We do not sell, license, pool, disclose or use Amazon Information for advertising, profiling or data-broker purposes. We do not share Amazon Information with third parties for our own independent purposes.

Any future onward transfer of Amazon Information to a seller-connected third-party service will occur only when expressly initiated or enabled by that seller, for the purpose of providing the functionality requested by the seller, and subject to the applicable Amazon data protection requirements.
```

### "List all external (non-Amazon) sources…"

```
None. Amazon Information is retrieved only from Amazon's Selling Partner API using authorization granted by the seller through Amazon's authorization process. We do not obtain Amazon Information from data brokers, scrapers, aggregators, other developers or any other non-Amazon source.
```

## 5. İlk taslakta düzeltilen üç hata

Hepsi kullanıcı tarafından yakalandı ve koddan doğrulandı:

1. **"a seller who connects QuickBooks Online or Xero directs us to post their accounting
   entries there"** — bugün YANLIŞ. Üç muhasebe adaptörü de `posting_not_available_yet`
   fırlatıyor (`functions/accounting/{quickbooks,xero}/adapter.js`). Defter yazımı Faz 3 ve
   henüz yok. Gelecek zamanlı ve koşullu ifadeyle değiştirildi.
2. **"Ireland and London regions"** — doğrulanmamış varsayım. Cloud Functions `europe-west2`
   ama Firestore'un konumu depoda tanımlı değil ve `firebase projects:list` "Not specified"
   diyor. Region iddiası tamamen kaldırıldı.
3. **ChatGPT/MCP yolu listelenmemişti.** `nvChatGPTSearchOrders` siparişleri **yalnız
   `companyId`** ile süzüyor — hiçbir sağlayıcı filtresi yok. Amazon siparişleri aynı
   koleksiyona girerse asistan üzerinden OpenAI'ye gidebilirdi. §6'daki izolasyon işi
   bitmeden "Google Cloud only" demek doğru olmaz.

## 6. Göndermeden önce yapılacaklar

1. **Amazon Information'ı teknik olarak izole et** — MCP/ChatGPT, AI Quick Replies,
   SMS/e-posta ve analitiğe Amazon PII'si gitmesin. Bu bitmeden §4'teki "outside parties"
   cevabı tam doğru olmaz.
2. **Olay müdahale planı** — roller, 6 aylık gözden geçirme, security@amazon.com'a 24 saat.
   Belge işi, kod değil.
3. **Parola/MFA politikası** — yazılı politika + hesaplarda MFA.
4. Sonra yedi cevabı dürüstçe doldur, sözleşmeyi onayla, gönder.
