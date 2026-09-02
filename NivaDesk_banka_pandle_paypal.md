# Banka menüsü nasıl çalışıyor, Pandle ile ilişkisi ne — ve PayPal buraya nasıl girer

`NivaDesk_etsy_ve_yeni_baglantilar.md` ve `NivaDesk_shopify_woocommerce.md`
dosyalarının eşi. Kod 1 Eylül 2026 durumuna göre okundu; iddiaların tamamı
`functions/bankFeed.js` (1673 satır), `functions/pandle.js` (879 satır) ve dört
istemciden doğrulandı.

---

## 1. Tek fikir: bir doküman, iki katman

Banka modülünün tamamı tek bir tasarım kararının üstünde duruyor. Her para
hareketi **tek bir Firestore dokümanı** ve o doküman **iki katmandan** oluşuyor:

```
companies/{companyId}/bankTransactions/{accountId}_{transactionId}
├── BANKA KATMANI      → her senkronda baştan yazılır. Sahibi: sync.
└── ZENGİNLEŞTİRME     → yalnızca callable'lar dokunur. Sahibi: NivaDesk.
```

Sınır `ENRICHMENT_FIELDS` listesiyle çizilmiş (`bankFeed.js:57`):

```
category, vatCode, note, receiptPath, receiptName, receiptNotNeeded,
receiptFileRecordId, linkedOrderId, linkedOrderLabel, linkedPaymentId,
purchaseId, purchaseNumber, reviewStatus, reviewedAt, pandle,
splits, incomingKind
```

Bu Etsy'deki `INTEGRATION_SHOP_OWNED_FIELDS`'in banka karşılığı — aynı felsefe:
**kaynak parayı sahiplenir, NivaDesk kararı sahiplenir.** Bir senkron asla
kullanıcının kategorisini, fişini, sipariş bağını veya KDV kodunu ezmiyor.

> **PayPal açısından kritik olan cümle şu:** zenginleştirme katmanının tamamı
> `provider`, `connectionId` veya `accountId` alanlarını **hiç okumuyor**.
> Kurallar yalnızca `counterparty + description` üzerinde eşleşiyor, fiş
> puanlaması tutar/tarih/kelime üzerinden, tekrar tespiti counterparty+tarih+tutar
> üzerinden, Pandle eşleştirmesi tarih+tutar+metin üzerinden çalışıyor.
> **`{amount, bookingDate, counterparty, description, currency}` üreten herhangi
> bir kaynak, tüm değer katmanını bedavaya alıyor.**

---

## 2. Bağlantı — TrueLayer (Open Banking)

Sahip "Connect"e basıyor → `bankCreateRequisition` bir `crypto.randomUUID()`
üretiyor ve bu tek değer **üç işi birden** yapıyor: OAuth `state`, bağlantı
dokümanının kimliği, ve token dokümanının kimliği. Sonra TrueLayer'ın onay
adresine gidiliyor (`scope: info accounts balance transactions offline_access`,
`providers: uk-ob-all uk-oauth-all` — yani sadece UK kurumları).

Banka `https://nivadesk.app/bank?code=…&state=…` adresine dönüyor;
`bankFinalizeRequisition` kodu token'la takas ediyor, hesapları keşfediyor, iki
yıllık geçmişi çekiyor ve bağlantıyı `linked` yapıyor.

Dikkat çeken üç şey:

- **Access token hiç saklanmıyor.** Sadece refresh token, `bankTokens/{connectionId}`
  içinde ve **düz metin** (`bankFeed.js:409`). Etsy token'larını AES-256-GCM ile
  şifreliyor; banka tarafı şifrelemiyor, yalnızca Firestore kuralına güveniyor.
- **Sağlık gerçek bir sinyal.** `syncState` (`ok` / `needs_reconsent` / `error`)
  sunucuda hesaplanıyor. Token takasının reddi anında `needs_reconsent`;
  veri isteğinin 401/403'ü ilk seferde sarı `error`, **ikinci** üst üste hatada
  `needs_reconsent` — çünkü bazı bankalar (HSBC) müşteri yokken derin geçmişi
  vermiyor ve bu tek başına "izin bitti" demek değil.
- **`consentExpiresAt` bizim hesabımız**, TrueLayer'dan gelmiyor: `now + 90 gün`.

Bağlantı silme iki ayrı niyete bölünmüş: `disconnect` token'ı siliyor ama işlemleri
bırakıyor; `purge` işlemleri de siliyor.

**PSD2 kaynaklı sabitler** (PayPal'da hiçbirinin karşılığı yok):
`MIN_SYNC_INTERVAL_MS = 6 saat` (bankalar günde ~4 gözetimsiz çekime izin
veriyor), zamanlanmış senkron `every 8 hours`, iki-yıl-yoksa-89-gün pencere,
90 günlük onay saati.

---

## 3. Para hareketinin kanonik şekli

Alanları kim yazıyor:

| Alan | Kaynak | Not |
|---|---|---|
| `amount` | **TÜRETİLMİŞ** | İşaretli sayı; negatif = para çıkışı |
| `currency` | BANKA | Yoksa **`"GBP"` varsayılıyor** |
| `bookingDate` | TÜRETİLMİŞ | `timestamp`'ın ilk 10 karakteri — **saat bilgisi atılıyor** |
| `description` | BANKA | Aynen |
| `counterparty` | BANKA | `merchant_name` |
| `txType` | BANKA | TrueLayer'ın `transaction_category` enum'u |
| `status` | TÜRETİLMİŞ | `booked` / `pending` — **hangi uç cevap verdiyse** |
| `provider` | NIVADESK | Sabit string `"truelayer"` |
| `providerTransactionId` | BANKA | |
| `normalisedProviderId` | BANKA | pending→booked birleştirmenin **tek** anahtarı |
| `providerReference` | BANKA | |
| `accountId`, `connectionId` | NIVADESK | Bölümleme anahtarları |
| `categoryAuto`, `categoryAutoRule`, `vatCodeAuto` | TÜRETİLMİŞ | Kural eşleşmesinden |
| *(ENRICHMENT_FIELDS'in tamamı)* | NIVADESK | Yukarıdaki liste |

Doküman kimliği `{accountId}_{transactionId}`, `[A-Za-z0-9_-]` dışı karakterler
temizlenip 250'ye kırpılmış. Banka `transaction_id` vermezse `{timestamp, amount,
description}` sha1'i kullanılıyor. Yeniden senkron **upsert** ediyor, kopya
yaratmıyor.

**Repo'da tek bir sort code, IBAN, hesap numarası veya BIC yok.** Şekil gerçekten
kaynak-bağımsız; bağlı olan şey ingest yarısı.

---

## 4. Zenginleştirme katmanı

- **Kategoriler** (`bankCategories`): workspace'in kendi listesi. Her kaydın
  `mappings` alanı **muhasebe sağlayıcısı başına** ayrı: `{pandle:{nominalCode,
  taxCode}, quickbooks:{accountId}, xero:{accountCode}}`. Yani muhasebe tarafı
  tasarımdan çok-sağlayıcılı; **para kaynağı tarafı değil.**
- **Kurallar** (`bankRules`): anahtar kelime → kategori + KDV kodu, `appliesTo`
  ile yön kısıtı. En uzun anahtar kelime kazanıyor. Kural kaydedilince geriye
  dönük yeniden etiketleme yapılıyor — ama **en fazla 10 sayfa × 400 = 4000
  doküman**, sonra sessizce duruyor.
- **KDV**: on NivaDesk kodu (`ST, RR, ZR, EX, OS, NR, RC, NV, IM, MX`). Bunlar
  Pandle kodu **değil** — bağlayıcı push anında çeviriyor. `MX` (karışık) bilerek
  ayrı: bölünmeden muhasebeye gidemiyor.
- **Review durumu**: `unreviewed → needs_info → ready → synced → confirmed`,
  yanında `sync_error` ve `ignored`.
- **Bölme (splits)**: en az 2 satır, her satırda tutar+kategori, toplam mutlak
  tutara kuruşuna kadar eşit olmak zorunda (0.005 tolerans).
- **Sipariş bağı**: giden bir satır siparişin
  `customFields["financialExpense::Bank Spending"]` başlığına maliyet olarak
  ekleniyor (`amount >= 0` reddediliyor). Gelen bir satır ise **mevcut bir ödemeyle
  eşleştiriliyor** (`amount <= 0` reddediliyor) — körü körüne yeni ödeme
  yaratmıyor.
- **`incomingKind`**: gelen paranın ne olduğu — `order_payment, invoice, deposit,
  refund_received, owner_contribution, loan, transfer, other_income`. Hesaplar
  arası transfer ya da ortak katkısı **ciro değil**; yalnızca `order_payment` bir
  siparişin ödeme defterine dokunabiliyor.

---

## 5. Fişler

Fiş = Storage'daki bir dosya + işlem üzerinde iki alan (`receiptPath`,
`receiptName`). Google Vision OCR tutarı ve tarihi çıkarıyor,
`scoreReceiptCandidates` son 1500 satırı puanlıyor (tutar 60 + tarih 25 +
kelime 15 = 100). **Eşik: skor ≥ 75 ve ikinciyle arasında ≥ 20 fark.**

Ödemeden **önce** gelen fiş kayboluyor değil: `bankReceiptInbox` kuyruğunda
bekliyor ve **her senkrondan sonra yeniden puanlanıyor**; tek bir güvenli
eşleşme çıkınca kendiliğinden bağlanıyor ve bildirim gidiyor.

Fiş puanlayıcı **yalnızca giden satırlara bakıyor** (`amount >= 0` atlanıyor) ve
**para birimini hiç karşılaştırmıyor** — 40 €'luk bir fiş 40 £'lık bir ödemeye
güvenle bağlanabilir.

---

## 6. İçgörüler (Needs Attention)

`bankInsights.ts` (+ Swift ve Kotlin kopyaları) **istemcide** çalışıyor: tekrar
eden ödemeler, olası kopyalar, fiyat değişimi, muhtemelen iptal olmuşlar,
kategorisiz kalanlar, harcama dağılımı ve "£X of £Y accounted for" tutarlılık
satırı. Bu fonksiyonların hepsi `tx.amount >= 0` ile erken dönüyor — yani
**yapı gereği yalnızca gidene bakıyorlar.**

Ayrıca banka verisi görünürden fazla yere dokunuyor: Dashboard'da bir
**Bank Activity** kartı var ve `TaxSetAsideCard` **ayrılan KDV'yi banka
satırlarından okuduğu indirilebilir girdi KDV'siyle azaltıyor**. Home ekranında
`bank` birinci sınıf bir alan. ChatGPT/MCP tarafında üç araç var:
`get_bank_spending_summary`, `search_bank_transactions`, `attach_bank_receipt`.

---

## 7. Pandle ilişkisi

**Ne olduğunu tek cümlede:** Pandle aynı bankayı **Plaid ile kendisi çekiyor** ve
işlemleri "Check" kuyruğunda onaysız bekletiyor. NivaDesk zaten kategoriyi ve KDV
kodunu biliyor. Köprü, o kararı kullanarak Pandle'ın **zaten sahip olduğu** satırı
onaylıyor.

```
Banka ──TrueLayer──> NivaDesk ─┐
  │                            ├─ aynı ödeme, iki sistemde
  └────Plaid───────> Pandle ───┘
                       ▲
                       └── NivaDesk "bu satır şu nominal hesap + şu vergi kodu" diyor
```

On owner-only callable: `pandleConnectStart / ConnectFinish / Disconnect /
RefreshMeta / SelectBankAccount / SaveMappings / Preview / Push / ConfirmMatch /
RejectMatch`.

**Eşleştirme** (`matchFeeds`): önce elle onaylanmış çiftler bağlanıyor. Sonra
**kuruşuna kadar aynı tutar + aynı yön** sert kapı; 4 günden fazla tarih kayması
reddediliyor. Puan `100 - kayma*20 + min(ortak_kelime,3)*5 + (referans_tuttu ? 25 : 0)`,
otomatik hazır olmak için `>= 80`. Pratikte: **kayma 0-1 gün otomatik, 2 gün banka
referansı isterse geçiyor, 4 gün asla otomatik olamıyor.**

**Push**, Pandle satırını **yeniden okuyup** yön/tutar/tarihi tekrar doğruluyor,
sonra KDV'yi brütten çıkarıp (`tax = total - total/(1+rate)`) bir
`/confirmation` POST'u atıyor. Başarıda NivaDesk işlemine `pandle.status =
"confirmed"` ve `reviewStatus: "confirmed"` yazılıyor. `requestId` ile idempotent
(`pandleSyncRuns` defteri; aynı istek tekrarlanırsa sonuç replay ediliyor).

**Ne yapmıyor — bunları net söylemek lazım:**
- **Tek yön.** Pandle'ın defteri, bakiyeleri, faturaları hiç okunmuyor. Geriye
  yalnızca iki kimlik dönüyor.
- **Pandle'da işlem yaratmıyor.** Tek yazma fiili `/{importedId}/confirmation`.
  Pandle'da eşleşen satır yoksa NivaDesk işlemi önizlemede hiç görünmüyor.
- **Bölünmüş işlemler ve `MX` (karışık KDV) push edilemiyor.**
- **Zamanlayıcı yok, geri alma yok, toplu onay yok.** Hepsi elle.
- **`pandleDisconnect` OAuth iznini iptal etmiyor** — sadece yerel token'ı siliyor.

**Durum — dikkat, çelişkili:** on callable de **koşulsuz deploy edilmiş** ve
canlı. Onları durduran şey iki eksik: OAuth kimlik bilgileri placeholder, ve web
kartı `NEXT_PUBLIC_PANDLE_ENABLED === "1"` bayrağının arkasında — bu değişken
**hiçbir env dosyasında tanımlı değil**. Yani sunucu hazır, arayüz karanlık.

Kodun kendisi de hiç gerçek Pandle görmediğini itiraf ediyor: her alan iki isimle
birden okunuyor (`attr(row, "money-out", "money_out")`, `attr(row, "nominal-code",
"nominal_code", "code")`), vergi oranı için `rawRate > 1 ? rawRate/100 : rawRate`
tahmini var, ve push gövdesi **hem düz hem sarmalanmış** gönderiliyor
(`{...fields, imported_bank_transaction: fields}`) — "kopyası zararsızdır"
notuyla. Bunlar ancak ucu hiç yanıt verirken görmemiş biri tarafından yazılır.

Ayrıca `MATCH_DAY_TOLERANCE = 2` sabiti **ölü kod** — hiçbir yerde
kullanılmıyor; tek yürürlükteki sınır `MATCH_DAY_TOLERANCE_MAX = 4`.

---

## 8. Veri modeli ve güvenlik

On bir koleksiyonun tamamı `companies/{companyId}/` altında ve hepsi
`allow write: if false` — yazan tek şey Admin SDK.

| Yol | Erişim |
|---|---|
| `bankTransactions`, `bankConnections`, `bankCategories`, `bankRules`, `bankVendors`, `bankReceiptInbox`, `bankAuditLog` | `canReadBankFeed()` — sahip **veya** `bankFeed` alanı verilmiş üye |
| `bankTokens/{connectionId}` | İstemciye tamamen kapalı |
| `pandleConnection/main` | Sahibe okunur |
| `pandleTokens/main` | İstemciye tamamen kapalı |
| `pandleSyncRuns/{requestId}` | İstemciye tamamen kapalı |

Secret'lar: `NIVADESK_TL_CLIENT_ID`, `NIVADESK_TL_CLIENT_SECRET`,
`NIVADESK_PANDLE_CLIENT_ID`, `NIVADESK_PANDLE_CLIENT_SECRET`.

**İki not:** (1) `bankTokens` refresh token'ı, `pandleTokens` ise **hem access hem
refresh** token'ı düz metin tutuyor — koruma sadece Firestore kuralı, şifreleme
yok. (2) `bankAuditLog` bağlan/senkronla/sil izini **her `bankFeed` üyesine**
açık.

---

## 9. Platform durumu

| | Web | Mac / iPhone | Android |
|---|---|---|---|
| Beş sekme (Overview/Transactions/Recurring/Receipts/Rules) | ✅ | ✅ | ✅ |
| Kategori / KDV / not / sipariş bağı / fiş | ✅ | ✅ | ✅ |
| **Banka bağlama / yeniden bağlama** | ✅ | ❌ tarayıcı açıyor | ❌ tarayıcı açıyor |
| Senkronla / bağlantıyı sil | ✅ | ✅ | ✅ |
| **Pandle: bağla / eşle / önizle / push** | ✅ (bayrak kapalı) | ❌ | ❌ |
| Pandle durumunu görme | ✅ | ✅ salt okunur | ✅ salt okunur |

---

## 10. PayPal'ı buraya nasıl ekleriz

### Kolay olan kısım — modülün ~%90'ı bedava geliyor

Yeni bir para kaynağının yapması gereken **asgari sözleşme**, tek bir fonksiyonun
çıktısını taklit etmek: `normalizeTransaction` (`bankFeed.js:186`). Şu alanları
üretebiliyorsan kategoriler, kurallar, KDV, fişler, OCR eşleştirme, sipariş
bağları, bölmeler, review akışı, içgörüler, ChatGPT araçları ve Pandle
önizlemesi **hiçbir değişiklik olmadan** çalışıyor:

```
amount (işaretli)  bookingDate (YYYY-MM-DD)  counterparty  description
currency           accountId (opak)          + deterministik doküman kimliği
```

### Genelleştirilmesi gereken yerler (ingest yarısı)

| Yer | Sorun |
|---|---|
| `bankFeed.js:208` | `provider: "truelayer"` sabit string. **Bugün gerçek bir ayırıcı değil**: repo'da tek bir `where("provider", …)` sorgusu yok, tek okuyucusu web'deki detay satırı. PayPal satırları ayrı bir kaynak olarak filtrelenemez, toplamlardan çıkarılamaz. |
| `syncCompanyConnections` (`:555`) | `status == "linked"` her bağlantı için **koşulsuz TrueLayer refresh-token takası** yapıyor. Sağlayıcı dalı olmadan bir PayPal bağlantı dokümanı düşürmek mevcut banka senkronunu **bozar**, sadece PayPal'ı başarısız etmez. |
| `accessTokenForConnection` (`:224`) | `bankTokens` içinde refresh token yoksa fırlatıyor. |
| `normalisedProviderId` (`:210`) | pending→booked birleştirmenin **tek** anahtarı. Yerleşme sırasında sabit kalan bir kimlik vermeyen kaynak, her ödeme için kalıcı bir kopya satır biriktirir. |
| `status: booked \| pending` (`:276`) | Hangi ucun cevapladığından türüyor. PayPal'ın `PENDING/COMPLETED/ON_HOLD/DENIED/REVERSED` durumları iki değere sığmıyor. |
| İşaret düzeltmesi (`:187`) | `transaction_type === "DEBIT"` okuyor. **İşaretsiz tutar + farklı bir yön kelimesi gönderen kaynağın her satırı "gelen" olur** — sonra fiş puanlayıcı atlar, sipariş bağı reddeder, ciro sayılır. En sinsi tuzak bu. |
| `txType` | TrueLayer enum'u üç istemciye elle kopyalanmış. Eşleşmezse rozet çizilmiyor — kozmetik. |
| Web `/bank` yönlendirme (`page.tsx:513`) | `?code&state` görünce **koşulsuz** `bankFinalizeRequisition` çağırıyor. İki OAuth sağlayıcı aynı dönüş adresini paylaşamaz; ya ayrı yol ya `state` içine sağlayıcı işareti. |
| PSD2 sabitleri | 6 saat / 8 saat / 90 gün / iki yıl — PayPal'da anlamsız. |
| Hata sınıflandırması (`classifySyncError`) | "banka izni bitti" sözlüğü; bildirim metni "Open Banking ve yeniden bağlan" diyor. |
| Firestore kuralları | Deny-list mantığı: yeni bir `paypalTokens` koleksiyonu **iki listeye birden** eklenmezse her workspace üyesine açık olur. |

### Yapısal olan kısım — bağlayıcıyla çözülmeyen dört şey

1. **Çifte sayım (en önemlisi).** PayPal bankaya toplu bir yerleşme transferi
   olarak geçiyor ve TrueLayer feed'i o transferi **zaten** içeri alıyor. PayPal
   satırlarını eklemek her satışı ve her maliyeti iki kez sayar. Kodda transfer /
   yerleşme kavramı **hiç yok**: `transferOf` hâlâ yol haritasında planlı bir
   alan, ve bunu öngören tek yer (`squareConnector.js` içindeki `bankMatch`)
   uygulanmamış bir yer tutucu. **Bu ayrı bir faz olarak planlanmalı ve feed
   herkese açılmadan önce çözülmeli** — yoksa rakamlar sahibin hemen fark edeceği
   şekilde yanlış olur.
2. **Komisyonlar.** PayPal işlem başına ücret kesiyor. Bugünkü şema tek bir
   tutar taşıyor. Ya ikinci bir satır (o zaman her toplam bunu öğrenmeli) ya şema
   değişikliği gerekiyor.
3. **Çoklu para birimi.** Zaten kırık: `currency` dokuz yerde `"GBP"` varsayılıyor
   ve **her toplam workspace'i `transactions[0].currency` ile etiketliyor** —
   dört platformda birden. Farklı para birimli iki hesap toplanıp tek sembolle
   damgalanıyor. PayPal bunu görünür şekilde kırar.
4. **İade / itiraz / chargeback.** `incomingKind` içinde `refund_received` var ama
   bu elle konan bir etiket; "şu işlemi tersine çevirir" bağı yok.
   `bankMatchIncomingToOrder` `amount > 0` şartı koyduğu için bir chargeback
   siparişe **hiç yansıtılamıyor**.

### Pandle tarafı
PayPal satırları Pandle'a **banka satırı olarak gidemez** — push, seçilmiş **tek**
bir Pandle banka hesabının kuyruğuna karşı çalışıyor ve kuruşuna kadar tutar +
yön eşleşmesi istiyor; bir PayPal satırı banka tarafındaki toplu yerleşmeyle asla
eşleşmez. Doğrusu PayPal'ı **Pandle'da ayrı bir banka hesabı** olarak kurup
yerleşmeyi iki hesap arası transfer olarak modellemek — ki bu Pandle işi, NivaDesk
işi değil. Ayrıca push `conversion_rate: "1.0"` ve tek bir net/vergi/toplam üçlüsü
gönderiyor: brütten-komisyon-düşülmüş bir satırı ya da bir FX bacağını ifade
edemiyor.

### Repo kurallarının dayattığı bitirme listesi
Bir PayPal feed'i şunlar olmadan "bitti" sayılmıyor: rehberde EN+TR bölümler
(site botu yalnız paragraf bloklarını görüyor, madde işaretlerini değil);
entegrasyon kartının üç istemcide `planned` → `native` taşınması;
`resolveIntegrationState`'in PayPal bağlantısını banka bağlantısından ayırmayı
öğrenmesi; ChatGPT araç açıklamalarının "Open Banking" demeyi bırakması.

**Deploy uyarısı:** bu branch'te kör `firebase deploy --only functions` güvensiz.
Ayrıca `bankSyncTransactions` ve `scheduledBankSync` yeni secret'larla **yeniden
deploy edilmek zorunda** — yani canlı banka feed'ine dokunuluyor.

---

## 11. Bilinen boşluklar ve bir canlı bug

- **CANLI BUG — `firstImportedAt` her senkronda yeniden damgalanıyor.**
  `bankFeed.js:285-287` "hangi kimlikler zaten var" taramasını
  `.where(id, ">=", prefix).where(id, "<", prefix)` ile yapıyor — **aynı değer
  iki uçta, yani boş aralık.** `existingIds` her zaman boş kalıyor ve
  `firstImportedAt` her senkronda taze bir `serverTimestamp` alıyor. Hemen
  üstündeki yorum tam tersini iddia ediyor. "Bu satır ne zaman geldi" mantığı
  bugün anlamsız — `firstImportedAt` üstüne bir şey inşa etmeden önce düzeltilmeli.
- **`bookingDate` 10 karakterlik string** ve tek sıralama anahtarı (canlı
  dinleyici, fiş puanlayıcı ve Pandle önizlemesi hep onunla sıralıyor). Günde çok
  işlem üreten bir kaynakta gün içi sıra rastgele olur. Sayısal bir zaman damgası
  alanı **şimdi ucuz, sonra pahalı.**
- **Hacim tavanları:** fiş puanlayıcı 1500, Pandle önizleme ve MCP 3000 satır
  yüklüyor; web sayfası ise **tüm koleksiyona limitsiz** abone oluyor. İlk düşecek
  olan bu sonuncusu.
- **Kural yeniden etiketleme 4000 dokümanda sessizce duruyor** — sahibe uyarı yok.
- **Sağlayıcıdan kaybolan işlem silinmiyor**; hiçbir yerde "artık yok" yolu yok.
- **Fiş eşleştirme para birimi körü** (40 € ↔ 40 £).
- **Rehber, bayrağın gizlediği bir arayüzü anlatıyor:** `guide.ts` ücretli
  kullanıcıya "Pandle'ı Banking sayfasından bağlayın" diyor; entegrasyon panosu ve
  asistanın hazır cevabı ise "Pandle henüz yok" diyor.
- **Pandle köprüsünün kendi testi yok** — `matchFeeds`, `resolveMapping`, puan
  eşiği ve hiçbir HTTP çağrısı test edilmiyor.
- **İstemcilerin okuduğu dört ölü alan var:** `categoryId`, `receiptUrl`,
  `receiptFileId`, `reviewed` — sunucu hiçbirini yazmıyor.
