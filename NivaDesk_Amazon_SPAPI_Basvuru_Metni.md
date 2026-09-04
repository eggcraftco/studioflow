# Amazon SP-API — Solution Provider başvuru paketi

**Durum: METİN HAZIR, GÖNDERİM HAZIR DEĞİL.** Gerekçe §3'te, kanıtıyla.
Hazırlayan: kod tabanından doğrulanmış (4 Eylül 2026). Doğrulama yöntemi §4.

---

## 1. Başvuru metni (İngilizce, 396 kelime — Amazon'un sınırı 500)

> Amazon özgün metin istiyor ve politika belgelerinden kopyalanmış cümleleri eliyor.
> Aşağıdaki metinde tek bir alıntı yok.

NivaDesk is order-management software for small manufacturing workshops — jewellers,
ceramicists, furniture makers and similar bespoke trades, mostly in the United Kingdom. A
workshop uses NivaDesk to follow a piece of work from the order through production to
dispatch: who it is for, what stage it is at, what it cost to make, and what has been paid.

Most of these workshops sell in more than one place. The same maker takes commissions
directly, lists on Etsy, runs a Shopify or WooCommerce shop, and sells over the counter
through Square. NivaDesk connects to those today, and its customers ask for Amazon next. The
problem it solves is not selling; it is that a maker with four sales channels has four
inboxes, four spreadsheets, and no single answer to "what am I making this week, and did it
pay".

What we intend to do with SP-API is narrow. When a seller connects their Amazon account,
NivaDesk will import their orders and keep them in step: the order and its line items,
quantities, prices, tax, the fulfilment channel, and the delivery address needed to post the
item. Each order becomes a job on the workshop's production board alongside its Etsy and
Shopify work. Information flows back to Amazon only as fulfilment — dispatch confirmation and
tracking. We will not create listings, set prices, run advertising, or contact buyers.

Each seller authorises their own Amazon account through Login with Amazon, and can disconnect
from inside NivaDesk at any time, which stops every background job for that connection.
NivaDesk is our own product, sold directly to the workshops that use it. We do not act on
another company's behalf, and we do not resell, pool or re-license seller data.

Roles requested, and why each is needed:

- **Inventory and Order Tracking** — to read orders and their line items. This is the
  integration itself.
- **Direct-to-Consumer Shipping** — the workshop physically makes and posts the item, so it
  needs the buyer's name and delivery address in order to fulfil the order. This is the only
  restricted role we ask for.
- **Finance and Accounting** — to reconcile settlements against the seller's own bank feed and
  accounting system, so that a payout is never counted as a second sale.
- **Amazon Fulfillment** — read-only FBA inventory, so that NivaDesk does not reserve a
  workshop's own stock for an order Amazon has already shipped.

We are not requesting Product Listing, Pricing or Advertising roles.

---

## 2. Güvenlik sorularına DOĞRU cevaplar

Her satır koddan doğrulandı. "HAYIR" yazanları olduğu gibi bırakıyorum — Amazon'a yanlış
beyan vermek, reddedilmekten çok daha ağır bir sorundur.

### Şifreleme (at rest)

**EVET, ama kısmi.** Etsy, WooCommerce, Square, QuickBooks, Xero ve PayPal kimlik bilgileri
**AES-256-GCM** ile şifrelenir: kayıt başına rastgele 96-bit IV, 128-bit GCM doğrulama
etiketi. Anahtarlar Google Secret Manager'da (Functions v2 `defineSecret`), yalnız çalışma
anında fonksiyonun belleğine iniyor. Bozulmuş ya da yanlış anahtarla açılmaya çalışılan kayıt
çözülmez, hata verir.

**Şu an şifresiz duran dört yer var** ve bunları "hepsi şifreli" diye beyan edemeyiz:
- TrueLayer banka yenileme jetonları (`functions/bankFeed.js:446`)
- Pandle erişim/yenileme jetonları
- Müşterinin kendi OpenAI API anahtarı
- Shopify erişim jetonunun düz metin kopyası — şifreli kopyanın yanında **hâlâ yazılıyor**
  (`SHOPIFY_TOKEN_DUAL_WRITE = true`, `functions/index.js:31542`; Faz B 16 Eylül'de kalkacak)

### Anahtar yönetimi ve rotasyon

**HAYIR.** Rotasyon mekanizması yok. Anahtar sürümü, çift-anahtar okuma penceresi ve yeniden
şifreleme işi yok; bir anahtar değişirse o sağlayıcının tüm bağlantıları kalıcı olarak
okunamaz hâle gelir ve her satıcının yeniden yetkilendirmesi gerekir. KMS/HSM yok, envelope
encryption yok, CMEK yok — anahtarlar Secret Manager'dan gelen düz 32 baytlık değerler.
Ayrıca QuickBooks ve Xero **aynı anahtarı** paylaşıyor.

### Aktarımda şifreleme

**EVET, sağlayıcı seviyesinde.** Tüm uç noktalar Google Cloud üzerinde HTTPS (Cloud Functions
v2, europe-west2); TLS sonlandırma ve sertifikalar Google tarafından yönetiliyor. Veritabanı da
aynı bölgede: `firestore:databases:get`, `(default)` için `Location: europe-west2` döndürüyor
(4 Eyl 2026'da doğrulandı). Amazon Information'ı işleyen ve saklayan her şey tek bölgede —
Londra. Başka bölge yok.
**Ama:** kodda ya da barındırma yapılandırmasında bir TLS taban sürümü, HSTS ya da CSP
başlığı tanımlı değil. "TLS 1.2 ve üzeri zorunlu kılıyoruz" diyemeyiz.

### Gelen isteklerin doğrulanması

**EVET, biri hariç.** Shopify, WooCommerce, Square, Etsy, QuickBooks ve Xero webhook'ları ham
gövde üzerinden HMAC-SHA256 ile, zaman-sabit karşılaştırmayla doğrulanıyor.
**İstisna:** `track17Webhook`, `TRACK17_WEBHOOK_TOKEN` tanımlı değilse doğrulamayı **atlıyor
ve isteği kabul ediyor** (`functions/index.js:21345-21355`). Bu, Amazon'dan bağımsız olarak
düzeltilmesi gereken gerçek bir açık.
**Tekrar (replay) koruması:** yalnız Etsy imzaya zaman damgası bağlıyor. Diğerlerinde savunma
olay-kimliğiyle idempotency, imza tazeliği değil.

### Erişim kontrolü ve kiracı ayrımı

**EVET, mantıksal ayrım.** Kimlik bilgisi tutan her koleksiyon istemci SDK'sına tamamen
kapalı; erişim yalnız sunucu tarafından. Rol ve alan bazlı izinler callable katmanında
zorunlu. Ancak: ayrım tek bir Firestore veritabanı içinde `companyId` alanıyla; kiracı başına
ayrı veritabanı ya da ayrı şifreleme anahtarı yok. Alan bazlı izinler (ör. finansal bilgi)
güvenlik kurallarında değil, API katmanında zorlanıyor.

### Denetim kaydı

**KISMEN — ve Amazon'un istediği türden DEĞİL.** Elimizdeki kayıtlar *değişiklik* kayıtları:
ayar değişiklikleri (90 gün), banka bağlantısı yaşam döngüsü, bağlayıcıyı kimin kopardığı,
webhook teslimat günlüğü (son 9 kayıt).
**Kişisel veriye ya da kimlik bilgisine ERİŞİM hiçbir yerde kaydedilmiyor.** "Hangi operatör
hangi müşterinin verisini ne zaman okudu" sorusunun cevabı yok. Amazon'un Veri Koruma
Politikası bunu doğrudan istiyor.

### Kişisel verinin saklanması ve silinmesi

**HAYIR — ve bu en ağır madde.** Amazon'un DPP'si, alıcı kişisel verisinin **teslimden sonra
30 gün içinde silinmesini** şart koşuyor (vergi/hukuki kayıtlar hariç). NivaDesk sipariş ve
müşteri kayıtlarını **süresiz** tutuyor: `siparisler` ve `musteriler` koleksiyonlarında
`expireAt` yok, TTL yok, teslimat tarihine bağlı hiçbir temizleme işi yok.
Ayrıca silme talebi uçtan uca tamamlanmıyor: anonimleştirmeden sonra bile alıcının adı ve
iletişim bilgisi siparişin `historyLog`'unda, `integrationLastPayload`'da ve teklif
kayıtlarında kalıyor.

### Personel erişimi

**KISMEN.** Destek yöneticisi erişimi üç sabit e-posta adresine ve doğrulanmış e-postaya
bağlı. Uygulama içinde MFA zorlaması, oturum süresi sınırı, kullanım başına onay ya da
zamana bağlı yükseltme yok; ve yönetici erişiminin denetim kaydı yok.

### Olay müdahalesi

**HAYIR.** Yazılı bir olay müdahale planı yok. Amazon, güvenlik olayında **24 saat içinde**
Amazon Security'ye bildirim taahhüdü istiyor. Log uyarısı/anomali tespiti katmanı da yok.

---

## 3. Neden bugün göndermemeliyiz

Amazon'un Veri Koruma Politikası bir anket değil, taahhüt. Yukarıdaki "HAYIR"ların üçü,
Amazon'un açıkça şart koştuğu kontroller:

1. **Teslimden 30 gün sonra alıcı verisinin silinmesi** — DPP'nin zorunlu maddesi. Bugün
   hiç uygulanmıyor.
2. **Kimlik bilgisi ve kişisel veriye erişimin loglanması** — DPP doğrudan istiyor. Yok.
3. **Anahtar rotasyonu** — DPP rotasyon periyodu soruyor. Mekanizma yok; rotasyon bugün
   veriyi kalıcı olarak okunamaz yapıyor.

Bunları "var" diye işaretlemek yanlış beyan olur. "Yok" diye işaretlemek muhtemelen ret
getirir — ve Etsy'de gördüğümüz gibi ret, ikinci başvuruyu zorlaştırıyor.

**Amazon'dan bağımsız olarak zaten düzeltilmesi gereken ikisi:**
- `track17Webhook` jeton tanımlı değilken açık kapı bırakıyor.
- Shopify jetonunun düz metin kopyası hâlâ yazılıyor (Faz B planı 16 Eylül).

## 4. Bu belge nasıl doğrulandı

Beş güvenlik boyutu (şifreleme, sır yönetimi, erişim kontrolü, veri saklama/silme, aktarım ve
denetim) kod tabanından ayrı ayrı çıkarıldı; her boyutun sonucu ikinci bir incelemeciye
"abartılmış iddiayı bul" göreviyle verildi. İncelemeciler 15 abartma yakaladı ve hepsi
yumuşatıldı — örneğin "tüm kimlik bilgileri şifreli" iddiası dört istisnayla düzeltildi,
"her gelen istek doğrulanıyor" iddiası `track17Webhook` istisnasıyla düzeltildi.

Metindeki hiçbir cümle doğrulanmamış değil. "Yapmıyoruz" diyen her satır da aynı şekilde
kanıtlı.
