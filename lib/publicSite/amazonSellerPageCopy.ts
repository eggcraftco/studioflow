import type { StudioLanguage } from "@/lib/studioflow/language";

/**
 * The sections of /integrations/amazon added on 7 October 2026. Merged with
 * amazonSellerCopy.ts (status, connecting, pricing, data handling, contact),
 * which carries the rest of the page; a field lives in exactly one file.
 *
 * Every sentence states what the connector does today. Evidence, by claim
 * (paths in studioflow-amazon-deploy unless marked "web"):
 *
 *   - Fields read: functions-amazon/src/amazon/fromOrders2026.js maps exactly
 *     the order fields (orderId, createdTime, lastUpdatedTime, marketplace,
 *     fulfillmentStatus, fulfilledBy, fulfillmentServiceLevel, grandTotal) and
 *     item fields (orderItemId, ASIN, seller SKU, title, quantity ordered and
 *     fulfilled, ITEM/SHIPPING/DISCOUNT/COD_FEE proceeds, condition, promotion
 *     ids) listed here; nothing is spread, and src/envelope.js is an allowlist.
 *   - Not read: sanitize.js INCLUDED_DATA_A1 has no BUYER, RECIPIENT or TAX;
 *     ORDER_PII_FIELDS/ITEM_PII_FIELDS strip addresses and gift messages.
 *   - Read-only: src/amazon/client.js — every SP-API request is "GET".
 *   - Every 30 minutes: deploy/scheduler.sh amazon-sync-tick "*\/30 * * * *"
 *     Europe/London (live job read 7 Oct 2026, ENABLED).
 *   - First check looks back 24 hours: src/sync.js — cursorMs starts at 0
 *     (src/connections.js), so lastUpdatedAfter = now − 2 min − 24 h; later
 *     passes start 15 minutes before the cursor (SYNC_OVERLAP_MINUTES=15).
 *   - Up to 500 orders per check, the rest next time: SYNC_MAX_ORDERS_PER_RUN
 *     500 and the cursor is not advanced on a truncated run (src/sync.js).
 *   - Same order updated, no duplicate: functions/index.js amazonOrderDocId is
 *     deterministic per Amazon order id; commerce/engine.js updates in place.
 *   - Cancellation → Cancelled + history: commerce/engine.js (status
 *     "Cancelled", historyEntry "Order cancelled"), syncCancellations: true in
 *     functions/index.js amazonContextFor.
 *   - Your work is not overwritten: commerce/ownership.js
 *     NIVADESK_OWNED_FIELDS (status, deliveryTime, notes, assignment,
 *     isDelivered …) are never written by a sync.
 *   - "Amazon Customer", no address: commerce/envelopeToOrder.js
 *     `${display} Customer` when the envelope has no buyer name.
 *   - Link to Seller Central: commerce/adapters/amazon.js external_admin_url
 *     (…/orders-v3/order/<id> on the marketplace's Seller Central host), shown
 *     by web app/orders/OrderDetailContent.tsx channel strip.
 *   - Reauthorisation notice: src/sync.js markNeedsReauth; web
 *     app/settings/AmazonIntegrationSection.tsx shows the renew message.
 *   - Europe region only: live amazon-oauth env SELLER_CENTRAL_HOST
 *     sellercentral-europe.amazon.com, SP_API_REGION eu.
 *   - Appstore-started authorisation unsupported: /oauth/start requires a
 *     NivaDesk-sealed intent (src/intent.js, src/oauthFlow.js).
 *   - Owner only: functions/index.js amazonConnectStart
 *     requireWorkspaceForBilling(request, true).
 *
 * The illustration uses example items and masked order numbers. It shows no
 * prices, counts or results.
 */

type Pair = readonly [title: string, body: string];

export type AmazonSellerPageCopy = {
  heroTitle: string;
  heroIntro: string;
  ctaStart: string;
  heroFacts: readonly string[];
  mockLabel: string;
  mockCaption: string;
  mockOrdersTitle: string;
  mockItems: readonly [string, string, string];
  mockManual: string;
  mockStatusNew: string;
  mockStatusMaking: string;
  mockStatusCancelled: string;
  mockPlatformStatus: string;
  mockPayment: string;
  mockProduction: string;
  mockOpen: string;
  jobsTitle: string;
  jobsIntro: string;
  jobs: readonly Pair[];
  fieldsTitle: string;
  fieldsIntro: string;
  fieldsOrderTitle: string;
  fieldsOrder: readonly string[];
  fieldsItemTitle: string;
  fieldsItem: readonly string[];
  fieldsNotTitle: string;
  fieldsNot: readonly string[];
  fieldsShown: string;
  syncTitle: string;
  syncIntro: string;
  syncNodes: readonly [Pair, Pair, Pair];
  syncArrowRead: string;
  syncArrowSend: string;
  syncFacts: readonly Pair[];
  directionTitle: string;
  readsTitle: string;
  reads: readonly string[];
  writesTitle: string;
  writes: readonly string[];
  directionNote: string;
  limitsTitle: string;
  limits: readonly Pair[];
  marketsIntro: string;
  marketsNote: string;
  faqTitle: string;
  faq: readonly Pair[];
};

const EN: AmazonSellerPageCopy = {
  heroTitle: "Amazon orders, turned into work you can plan.",
  heroIntro: "NivaDesk is order management for made-to-order, handmade and repair businesses. The Amazon connection brings your Amazon orders into the same list as the rest of your work, so each sale becomes a job with a status, a due date and notes — without retyping it from Seller Central.",
  ctaStart: "Create a free workspace",
  heroFacts: ["Read-only: nothing is written to Amazon", "Checked every 30 minutes", "Included on every plan, including Free"],
  mockLabel: "Illustration: the NivaDesk order list with an imported Amazon order, and the Amazon details shown on that order.",
  mockCaption: "Illustration with example items. Not real orders.",
  mockOrdersTitle: "Orders",
  mockItems: ["Personalised walnut keepsake box", "Engraved brass pet tag", "Watch strap replacement"],
  mockManual: "Added by hand",
  mockStatusNew: "New",
  mockStatusMaking: "In production",
  mockStatusCancelled: "Cancelled",
  mockPlatformStatus: "Platform status",
  mockPayment: "Payment",
  mockProduction: "Your status",
  mockOpen: "Open in Seller Central",
  jobsTitle: "What it makes easier",
  jobsIntro: "For small workshops that sell some of their work on Amazon and make, personalise or repair it themselves.",
  jobs: [
    ["Made-to-order items reach the bench", "An Amazon sale arrives as a NivaDesk order with its item titles and quantities, a due date from your usual lead time, and room for production notes."],
    ["One list for every way you sell", "Amazon orders sit next to the orders you add yourself, each marked with where it came from, so you plan the week from one list instead of two tabs."],
    ["Cancellations before you start", "When a buyer cancels on Amazon, the next check moves the NivaDesk order to Cancelled and records it in the order's history, so you do not make something nobody will collect."],
    ["Back to Amazon in one click", "Each imported order keeps its Amazon order number and a link that opens the same order in Seller Central, where the delivery details are."]
  ],
  fieldsTitle: "What NivaDesk reads from each order",
  fieldsIntro: "These are the only fields NivaDesk takes from Amazon. Everything else in Amazon's response is dropped before it leaves the separate NivaDesk Amazon service.",
  fieldsOrderTitle: "Order",
  fieldsOrder: [
    "Amazon order ID",
    "Marketplace (for example Amazon.co.uk)",
    "Order date and last update",
    "Order status: pending, unshipped, shipped, cancelled …",
    "Fulfilled by Amazon or by you",
    "Shipping service level",
    "Order total and currency"
  ],
  fieldsItemTitle: "Each item",
  fieldsItem: [
    "Product title",
    "ASIN and your seller SKU",
    "Quantity ordered and quantity shipped",
    "Item price, shipping price and promotion discount",
    "Cash-on-delivery fee, where Amazon reports one",
    "Condition and condition note",
    "Promotion IDs"
  ],
  fieldsNotTitle: "Not read",
  fieldsNot: [
    "Buyer name, email address and phone number",
    "Delivery and billing addresses",
    "Gift messages and gift-wrap details",
    "Amazon's tax details",
    "Amazon fees, settlements and payouts",
    "Stock levels, FBA inventory and your product catalogue"
  ],
  fieldsShown: "In NivaDesk each imported order shows an Amazon badge, the Amazon order number, Amazon's status and payment state, the total, and a link to the order in Seller Central. The customer appears as “Amazon Customer”.",
  syncTitle: "How syncing works",
  syncIntro: "Orders travel in one direction only: from Amazon to your workspace.",
  syncNodes: [
    ["Amazon", "Your orders in Seller Central"],
    ["NivaDesk Amazon service", "A separate Google Cloud project in London. It asks Amazon for orders and removes anything personal."],
    ["Your workspace", "Orders appear in your order list"]
  ],
  syncArrowRead: "Orders read every 30 minutes",
  syncArrowSend: "Order fields only",
  syncFacts: [
    ["Every 30 minutes", "NivaDesk checks for orders that are new or changed since the last check, day and night. A new Amazon order normally appears within about half an hour."],
    ["The first check", "When you connect, the first check looks back 24 hours. Older orders that have not changed since then are not brought in."],
    ["Updates, not duplicates", "When Amazon updates an order, the same NivaDesk order is updated. A cancellation moves it to Cancelled."],
    ["Your work stays yours", "A sync never overwrites the status, due date, notes, assignment or delivered mark you set in NivaDesk. A cancellation is the only Amazon change that sets the status."],
    ["Busy days", "Each check brings in up to 500 orders per connected account; anything beyond that comes in on the next check."],
    ["If access lapses", "If Amazon stops accepting NivaDesk's authorisation, the Amazon card in Settings says so and asks you to reconnect. Orders already imported stay."]
  ],
  directionTitle: "Reads from Amazon. Never writes to it.",
  readsTitle: "Reads from Amazon",
  reads: [
    "Your orders and their items — the fields listed above",
    "Order status changes, including cancellations",
    "Which marketplaces your seller account sells in"
  ],
  writesTitle: "Never writes to Amazon",
  writes: [
    "No changes to listings, prices or stock",
    "No shipping confirmations or tracking numbers",
    "No messages to buyers",
    "No refunds, cancellations or any other action on your account"
  ],
  directionNote: "Every request NivaDesk sends to Amazon's Selling Partner API is a read (GET) request.",
  limitsTitle: "Current limitations",
  limits: [
    ["Access under review", "The NivaDesk app is in Draft status at Amazon and awaiting approval. Until then, sellers cannot complete the connection."],
    ["Europe region only", "The connection signs in through Seller Central Europe and reads Amazon's Europe-region API. Marketplaces in other regions are not available yet."],
    ["Orders only", "No fees, settlements, stock, FBA inventory or product catalogue."],
    ["No buyer details", "Buyer and recipient data is not requested, so orders arrive without a name or address. Delivery details stay in Seller Central."],
    ["Started from NivaDesk", "Authorising from the Amazon Appstore is not supported yet. Sign in to NivaDesk and connect from Settings › Integrations."],
    ["Owner only", "Only the workspace owner can connect or disconnect Amazon."]
  ],
  marketsIntro: "One connection covers the Europe-region marketplaces your seller account sells in. Amazon tells NivaDesk which ones those are when you connect.",
  marketsNote: "Marketplaces outside the Europe region are not available yet.",
  faqTitle: "Questions sellers ask",
  faq: [
    ["Does NivaDesk change anything in my Amazon account?", "No. Every request NivaDesk sends to Amazon's Selling Partner API is a read request. It never changes listings, prices or stock, never confirms shipments and never messages buyers."],
    ["How quickly do new Amazon orders appear?", "NivaDesk checks every 30 minutes, so a new order normally appears within about half an hour. The first check after you connect looks back 24 hours."],
    ["What happens when a buyer cancels?", "At the next check the matching NivaDesk order is moved to Cancelled and the change is recorded in its history. Nothing is deleted."],
    ["Will Amazon overwrite the status I set?", "No. Your status, due date, notes, assignment and the delivered mark are never changed by a sync. A cancellation on Amazon is the one exception: it sets the order to Cancelled."],
    ["Why don't I see the buyer's name and address?", "NivaDesk does not request Amazon's buyer and recipient data, so imported orders show “Amazon Customer” without an address. Use the link on the order to open it in Seller Central, where the delivery details are."],
    ["Does the Amazon connection cost extra?", "No. It is included on every NivaDesk plan, including Free. You pay only for the plan you choose."],
    ["Why can't I connect yet?", "Amazon is still reviewing the NivaDesk app, which is in Draft status. Until Amazon approves it, other sellers cannot complete Amazon's consent screen. After approval, the Connect button in Settings › Integrations switches on by itself."],
    ["Which marketplaces are supported?", "The Europe-region marketplaces: United Kingdom, Germany, France, Italy, Spain, Netherlands, Sweden, Poland, Türkiye, United Arab Emirates and India. Marketplaces in other regions are not available yet."]
  ]
};

const TR: AmazonSellerPageCopy = {
  heroTitle: "Amazon siparişleri, planlayabileceğiniz işe dönüşür.",
  heroIntro: "NivaDesk; siparişe özel üretim, el yapımı ürün ve tamir işletmeleri için sipariş yönetimidir. Amazon bağlantısı Amazon siparişlerinizi diğer işlerinizle aynı listeye getirir; her satış durumu, teslim tarihi ve notları olan bir işe dönüşür — Seller Central'dan yeniden yazmadan.",
  ctaStart: "Ücretsiz workspace oluştur",
  heroFacts: ["Salt okunur: Amazon'a hiçbir şey yazılmaz", "30 dakikada bir kontrol edilir", "Free dahil her planda var"],
  mockLabel: "Örnek görsel: içe aktarılmış bir Amazon siparişi bulunan NivaDesk sipariş listesi ve o siparişte gösterilen Amazon bilgileri.",
  mockCaption: "Örnek ürünlerle hazırlanmış görsel. Gerçek sipariş değildir.",
  mockOrdersTitle: "Siparişler",
  mockItems: ["Kişiye özel ceviz hatıra kutusu", "Gravürlü pirinç evcil hayvan künyesi", "Saat kayışı değişimi"],
  mockManual: "Elle eklendi",
  mockStatusNew: "Yeni",
  mockStatusMaking: "Üretimde",
  mockStatusCancelled: "İptal edildi",
  mockPlatformStatus: "Platform durumu",
  mockPayment: "Ödeme",
  mockProduction: "Sizin durumunuz",
  mockOpen: "Seller Central'da aç",
  jobsTitle: "Neyi kolaylaştırır",
  jobsIntro: "İşlerinin bir kısmını Amazon'da satan ve ürünlerini kendisi yapan, kişiselleştiren ya da tamir eden küçük atölyeler için.",
  jobs: [
    ["Siparişe özel ürünler tezgâha ulaşır", "Amazon satışı; ürün adları ve adetleri, her zamanki teslim sürenize göre bir teslim tarihi ve üretim notları için yerle NivaDesk siparişi olarak gelir."],
    ["Tüm satış kanallarınız için tek liste", "Amazon siparişleri elle eklediğiniz siparişlerin yanında, her biri nereden geldiği işaretlenmiş olarak durur; haftayı iki sekme yerine tek listeden planlarsınız."],
    ["Başlamadan önce iptaller", "Alıcı Amazon'da iptal ettiğinde bir sonraki kontrol NivaDesk siparişini İptal edildi'ye taşır ve sipariş geçmişine yazar; kimsenin almayacağı bir şeyi yapmazsınız."],
    ["Tek tıkla Amazon'a dönüş", "İçe aktarılan her sipariş Amazon sipariş numarasını ve aynı siparişi teslimat bilgilerinin bulunduğu Seller Central'da açan bir bağlantıyı taşır."]
  ],
  fieldsTitle: "NivaDesk her siparişten neyi okur",
  fieldsIntro: "NivaDesk'in Amazon'dan aldığı alanlar yalnızca bunlardır. Amazon yanıtındaki diğer her şey, ayrı NivaDesk Amazon servisinden çıkmadan önce atılır.",
  fieldsOrderTitle: "Sipariş",
  fieldsOrder: [
    "Amazon sipariş kimliği",
    "Pazar yeri (örneğin Amazon.co.uk)",
    "Sipariş tarihi ve son güncelleme",
    "Sipariş durumu: beklemede, gönderilmedi, gönderildi, iptal …",
    "Amazon tarafından mı sizin tarafınızdan mı gönderildiği",
    "Kargo hizmet düzeyi",
    "Sipariş toplamı ve para birimi"
  ],
  fieldsItemTitle: "Her ürün",
  fieldsItem: [
    "Ürün adı",
    "ASIN ve satıcı SKU'nuz",
    "Sipariş edilen ve gönderilen adet",
    "Ürün fiyatı, kargo ücreti ve promosyon indirimi",
    "Amazon bildiriyorsa kapıda ödeme ücreti",
    "Ürün durumu ve durum notu",
    "Promosyon kimlikleri"
  ],
  fieldsNotTitle: "Okunmayanlar",
  fieldsNot: [
    "Alıcının adı, e-posta adresi ve telefon numarası",
    "Teslimat ve fatura adresleri",
    "Hediye mesajları ve hediye paketi bilgileri",
    "Amazon'un vergi bilgileri",
    "Amazon ücretleri, hesap kesimleri ve ödemeler",
    "Stok seviyeleri, FBA envanteri ve ürün kataloğunuz"
  ],
  fieldsShown: "NivaDesk'te içe aktarılan her sipariş bir Amazon rozeti, Amazon sipariş numarası, Amazon'daki durumu ve ödeme durumu, toplam tutar ve Seller Central'daki siparişe giden bir bağlantıyla görünür. Müşteri “Amazon Customer” olarak görünür.",
  syncTitle: "Senkronizasyon nasıl çalışır",
  syncIntro: "Siparişler yalnızca tek yönde ilerler: Amazon'dan workspace'inize.",
  syncNodes: [
    ["Amazon", "Seller Central'daki siparişleriniz"],
    ["NivaDesk Amazon servisi", "Londra'da ayrı bir Google Cloud projesi. Amazon'dan siparişleri ister ve kişisel olan her şeyi çıkarır."],
    ["Workspace'iniz", "Siparişler sipariş listenizde görünür"]
  ],
  syncArrowRead: "Siparişler 30 dakikada bir okunur",
  syncArrowSend: "Yalnızca sipariş alanları",
  syncFacts: [
    ["30 dakikada bir", "NivaDesk gece gündüz, son kontrolden bu yana yeni veya değişmiş siparişlere bakar. Yeni bir Amazon siparişi genellikle yarım saat içinde görünür."],
    ["İlk kontrol", "Bağlandığınızda ilk kontrol son 24 saate bakar. O zamandan beri değişmemiş eski siparişler getirilmez."],
    ["Güncelleme, kopya değil", "Amazon bir siparişi güncellediğinde aynı NivaDesk siparişi güncellenir. İptal, siparişi İptal edildi'ye taşır."],
    ["Sizin işiniz sizde kalır", "Senkronizasyon NivaDesk'te belirlediğiniz durumu, teslim tarihini, notları, atamayı veya teslim edildi işaretini asla ezmez. Durumu değiştiren tek Amazon değişikliği iptaldir."],
    ["Yoğun günler", "Her kontrol bağlı hesap başına en fazla 500 sipariş getirir; fazlası bir sonraki kontrolde gelir."],
    ["Erişim sona ererse", "Amazon NivaDesk'in yetkisini kabul etmeyi bırakırsa Settings'teki Amazon kartı bunu söyler ve yeniden bağlanmanızı ister. Daha önce aktarılan siparişler kalır."]
  ],
  directionTitle: "Amazon'dan okur. Amazon'a asla yazmaz.",
  readsTitle: "Amazon'dan okur",
  reads: [
    "Siparişleriniz ve ürünleri — yukarıda listelenen alanlar",
    "İptaller dahil sipariş durumu değişiklikleri",
    "Satıcı hesabınızın hangi pazar yerlerinde satış yaptığı"
  ],
  writesTitle: "Amazon'a asla yazmaz",
  writes: [
    "İlanlarda, fiyatlarda veya stokta değişiklik yok",
    "Kargo onayı veya takip numarası gönderimi yok",
    "Alıcılara mesaj yok",
    "İade, iptal veya hesabınızda başka hiçbir işlem yok"
  ],
  directionNote: "NivaDesk'in Amazon Selling Partner API'sine gönderdiği her istek bir okuma (GET) isteğidir.",
  limitsTitle: "Mevcut sınırlamalar",
  limits: [
    ["Erişim incelemede", "NivaDesk uygulaması Amazon'da Draft durumunda ve onay bekliyor. O zamana kadar satıcılar bağlantıyı tamamlayamaz."],
    ["Yalnızca Avrupa bölgesi", "Bağlantı Seller Central Europe üzerinden oturum açar ve Amazon'un Avrupa bölgesi API'sinden okur. Diğer bölgelerdeki pazar yerleri henüz kullanılamıyor."],
    ["Yalnızca siparişler", "Ücretler, hesap kesimleri, stok, FBA envanteri veya ürün kataloğu yok."],
    ["Alıcı bilgisi yok", "Alıcı ve teslim alan verisi istenmez; siparişler ad ve adres olmadan gelir. Teslimat bilgileri Seller Central'da kalır."],
    ["NivaDesk'ten başlatılır", "Amazon Appstore'dan yetkilendirme henüz desteklenmiyor. NivaDesk'e giriş yapın ve Settings › Integrations'tan bağlanın."],
    ["Yalnızca sahip", "Amazon'u yalnızca workspace sahibi bağlayabilir veya bağlantısını kesebilir."]
  ],
  marketsIntro: "Tek bağlantı, satıcı hesabınızın satış yaptığı Avrupa bölgesi pazar yerlerini kapsar. Bağlandığınızda bunların hangileri olduğunu Amazon NivaDesk'e bildirir.",
  marketsNote: "Avrupa bölgesi dışındaki pazar yerleri henüz kullanılamıyor.",
  faqTitle: "Satıcıların sorduğu sorular",
  faq: [
    ["NivaDesk Amazon hesabımda bir şey değiştirir mi?", "Hayır. NivaDesk'in Amazon Selling Partner API'sine gönderdiği her istek bir okuma isteğidir. İlanları, fiyatları veya stoku asla değiştirmez, gönderim onaylamaz ve alıcılara mesaj atmaz."],
    ["Yeni Amazon siparişleri ne kadar hızlı görünür?", "NivaDesk 30 dakikada bir kontrol eder; yeni bir sipariş genellikle yarım saat içinde görünür. Bağlandıktan sonraki ilk kontrol son 24 saate bakar."],
    ["Alıcı iptal ederse ne olur?", "Bir sonraki kontrolde eşleşen NivaDesk siparişi İptal edildi'ye taşınır ve değişiklik geçmişine yazılır. Hiçbir şey silinmez."],
    ["Amazon belirlediğim durumu ezer mi?", "Hayır. Durumunuz, teslim tarihiniz, notlarınız, atama ve teslim edildi işareti senkronizasyonla asla değişmez. Tek istisna Amazon'daki iptaldir: siparişi İptal edildi yapar."],
    ["Alıcının adını ve adresini neden görmüyorum?", "NivaDesk Amazon'un alıcı ve teslim alan verisini istemez; bu yüzden içe aktarılan siparişler adres olmadan “Amazon Customer” olarak görünür. Teslimat bilgilerinin bulunduğu Seller Central'da açmak için siparişteki bağlantıyı kullanın."],
    ["Amazon bağlantısı ek ücretli mi?", "Hayır. Free dahil her NivaDesk planında vardır. Yalnızca seçtiğiniz planın ücretini ödersiniz."],
    ["Neden henüz bağlanamıyorum?", "Amazon, Draft durumundaki NivaDesk uygulamasını hâlâ inceliyor. Amazon onaylayana kadar diğer satıcılar Amazon'un onay ekranını tamamlayamaz. Onaydan sonra Settings › Integrations'taki Connect düğmesi kendiliğinden açılır."],
    ["Hangi pazar yerleri destekleniyor?", "Avrupa bölgesi pazar yerleri: Birleşik Krallık, Almanya, Fransa, İtalya, İspanya, Hollanda, İsveç, Polonya, Türkiye, Birleşik Arap Emirlikleri ve Hindistan. Diğer bölgelerdeki pazar yerleri henüz kullanılamıyor."]
  ]
};

const DE: AmazonSellerPageCopy = {
  heroTitle: "Amazon-Bestellungen, aus denen planbare Arbeit wird.",
  heroIntro: "NivaDesk ist Auftragsverwaltung für Betriebe, die auf Bestellung fertigen, von Hand herstellen oder reparieren. Die Amazon-Verbindung holt Ihre Amazon-Bestellungen in dieselbe Liste wie den Rest Ihrer Arbeit – jeder Verkauf wird zu einem Auftrag mit Status, Fälligkeitsdatum und Notizen, ohne Abtippen aus Seller Central.",
  ctaStart: "Kostenlosen Workspace erstellen",
  heroFacts: ["Nur lesend: Nichts wird zu Amazon geschrieben", "Alle 30 Minuten geprüft", "In jedem Tarif enthalten, auch in Free"],
  mockLabel: "Illustration: die NivaDesk-Auftragsliste mit einer importierten Amazon-Bestellung und den Amazon-Angaben zu dieser Bestellung.",
  mockCaption: "Illustration mit Beispielartikeln. Keine echten Bestellungen.",
  mockOrdersTitle: "Aufträge",
  mockItems: ["Personalisierte Erinnerungsbox aus Walnuss", "Gravierte Hundemarke aus Messing", "Uhrarmband-Austausch"],
  mockManual: "Von Hand angelegt",
  mockStatusNew: "Neu",
  mockStatusMaking: "In Produktion",
  mockStatusCancelled: "Storniert",
  mockPlatformStatus: "Plattformstatus",
  mockPayment: "Zahlung",
  mockProduction: "Ihr Status",
  mockOpen: "In Seller Central öffnen",
  jobsTitle: "Was es einfacher macht",
  jobsIntro: "Für kleine Werkstätten, die einen Teil ihrer Arbeit auf Amazon verkaufen und selbst fertigen, personalisieren oder reparieren.",
  jobs: [
    ["Auftragsfertigung landet an der Werkbank", "Ein Amazon-Verkauf kommt als NivaDesk-Auftrag mit Artikelbezeichnungen und Mengen an, mit einem Fälligkeitsdatum aus Ihrer üblichen Lieferzeit und Platz für Produktionsnotizen."],
    ["Eine Liste für alle Verkaufswege", "Amazon-Bestellungen stehen neben den Aufträgen, die Sie selbst anlegen, jeweils mit ihrer Herkunft markiert – Sie planen die Woche aus einer Liste statt aus zwei Tabs."],
    ["Stornos, bevor Sie anfangen", "Storniert ein Käufer auf Amazon, setzt die nächste Prüfung den NivaDesk-Auftrag auf Storniert und vermerkt es im Verlauf – Sie fertigen nichts, was niemand abholt."],
    ["Mit einem Klick zurück zu Amazon", "Jeder importierte Auftrag behält seine Amazon-Bestellnummer und einen Link, der dieselbe Bestellung in Seller Central öffnet, wo die Lieferdaten stehen."]
  ],
  fieldsTitle: "Was NivaDesk aus jeder Bestellung liest",
  fieldsIntro: "Nur diese Felder übernimmt NivaDesk von Amazon. Alles andere in Amazons Antwort wird verworfen, bevor es den separaten NivaDesk-Amazon-Dienst verlässt.",
  fieldsOrderTitle: "Bestellung",
  fieldsOrder: [
    "Amazon-Bestellnummer (Order ID)",
    "Marktplatz (zum Beispiel Amazon.de)",
    "Bestelldatum und letzte Änderung",
    "Bestellstatus: ausstehend, nicht versandt, versandt, storniert …",
    "Versand durch Amazon oder durch Sie",
    "Versandservicestufe",
    "Bestellsumme und Währung"
  ],
  fieldsItemTitle: "Jeder Artikel",
  fieldsItem: [
    "Produkttitel",
    "ASIN und Ihre Verkäufer-SKU",
    "Bestellte und versandte Menge",
    "Artikelpreis, Versandpreis und Aktionsrabatt",
    "Nachnahmegebühr, sofern Amazon eine meldet",
    "Zustand und Zustandshinweis",
    "Aktions-IDs"
  ],
  fieldsNotTitle: "Nicht gelesen",
  fieldsNot: [
    "Name, E-Mail-Adresse und Telefonnummer des Käufers",
    "Liefer- und Rechnungsadressen",
    "Geschenknachrichten und Geschenkverpackung",
    "Amazons Steuerangaben",
    "Amazon-Gebühren, Abrechnungen und Auszahlungen",
    "Lagerbestände, FBA-Bestand und Ihr Produktkatalog"
  ],
  fieldsShown: "In NivaDesk zeigt jeder importierte Auftrag ein Amazon-Abzeichen, die Amazon-Bestellnummer, Amazons Status und Zahlungsstatus, die Summe und einen Link zur Bestellung in Seller Central. Als Kunde erscheint „Amazon Customer“.",
  syncTitle: "So funktioniert die Synchronisierung",
  syncIntro: "Bestellungen fließen nur in eine Richtung: von Amazon in Ihren Workspace.",
  syncNodes: [
    ["Amazon", "Ihre Bestellungen in Seller Central"],
    ["NivaDesk-Amazon-Dienst", "Ein separates Google-Cloud-Projekt in London. Es fragt Amazon nach Bestellungen und entfernt alles Persönliche."],
    ["Ihr Workspace", "Bestellungen erscheinen in Ihrer Auftragsliste"]
  ],
  syncArrowRead: "Bestellungen, alle 30 Minuten gelesen",
  syncArrowSend: "Nur Bestellfelder",
  syncFacts: [
    ["Alle 30 Minuten", "NivaDesk prüft rund um die Uhr auf Bestellungen, die seit der letzten Prüfung neu sind oder sich geändert haben. Eine neue Amazon-Bestellung erscheint normalerweise innerhalb von etwa einer halben Stunde."],
    ["Die erste Prüfung", "Nach dem Verbinden schaut die erste Prüfung 24 Stunden zurück. Ältere Bestellungen, die sich seitdem nicht geändert haben, werden nicht übernommen."],
    ["Aktualisieren statt verdoppeln", "Ändert Amazon eine Bestellung, wird derselbe NivaDesk-Auftrag aktualisiert. Ein Storno setzt ihn auf Storniert."],
    ["Ihre Arbeit bleibt Ihre", "Eine Synchronisierung überschreibt nie Status, Fälligkeitsdatum, Notizen, Zuweisung oder die Geliefert-Markierung, die Sie in NivaDesk setzen. Ein Storno ist die einzige Amazon-Änderung, die den Status setzt."],
    ["Viel los", "Jede Prüfung übernimmt bis zu 500 Bestellungen pro verbundenem Konto; der Rest kommt bei der nächsten Prüfung."],
    ["Wenn der Zugriff endet", "Akzeptiert Amazon die Autorisierung von NivaDesk nicht mehr, zeigt die Amazon-Karte in den Einstellungen das an und bittet Sie, neu zu verbinden. Bereits importierte Aufträge bleiben."]
  ],
  directionTitle: "Liest von Amazon. Schreibt nie zu Amazon.",
  readsTitle: "Liest von Amazon",
  reads: [
    "Ihre Bestellungen und ihre Artikel – die oben genannten Felder",
    "Statusänderungen, einschließlich Stornos",
    "Auf welchen Marktplätzen Ihr Verkäuferkonto verkauft"
  ],
  writesTitle: "Schreibt nie zu Amazon",
  writes: [
    "Keine Änderungen an Angeboten, Preisen oder Bestand",
    "Keine Versandbestätigungen oder Sendungsnummern",
    "Keine Nachrichten an Käufer",
    "Keine Erstattungen, Stornos oder sonstigen Aktionen in Ihrem Konto"
  ],
  directionNote: "Jede Anfrage, die NivaDesk an Amazons Selling Partner API sendet, ist eine Leseanfrage (GET).",
  limitsTitle: "Aktuelle Einschränkungen",
  limits: [
    ["Zugang in Prüfung", "Die NivaDesk-App ist bei Amazon im Status Draft und wartet auf die Freigabe. Bis dahin können Verkäufer die Verbindung nicht abschließen."],
    ["Nur Region Europa", "Die Verbindung meldet sich über Seller Central Europe an und liest Amazons API für die Region Europa. Marktplätze anderer Regionen sind noch nicht verfügbar."],
    ["Nur Bestellungen", "Keine Gebühren, Abrechnungen, Bestände, FBA-Bestand oder Produktkatalog."],
    ["Keine Käuferdaten", "Käufer- und Empfängerdaten werden nicht angefordert; Bestellungen kommen ohne Namen und Adresse an. Die Lieferdaten bleiben in Seller Central."],
    ["Start in NivaDesk", "Eine Autorisierung aus dem Amazon Appstore wird noch nicht unterstützt. Melden Sie sich bei NivaDesk an und verbinden Sie unter Settings › Integrations."],
    ["Nur der Inhaber", "Nur der Workspace-Inhaber kann Amazon verbinden oder trennen."]
  ],
  marketsIntro: "Eine Verbindung deckt die Marktplätze der Region Europa ab, auf denen Ihr Verkäuferkonto verkauft. Welche das sind, teilt Amazon NivaDesk beim Verbinden mit.",
  marketsNote: "Marktplätze außerhalb der Region Europa sind noch nicht verfügbar.",
  faqTitle: "Fragen von Verkäufern",
  faq: [
    ["Ändert NivaDesk etwas in meinem Amazon-Konto?", "Nein. Jede Anfrage, die NivaDesk an Amazons Selling Partner API sendet, ist eine Leseanfrage. NivaDesk ändert nie Angebote, Preise oder Bestand, bestätigt keine Sendungen und schreibt keinen Käufern."],
    ["Wie schnell erscheinen neue Amazon-Bestellungen?", "NivaDesk prüft alle 30 Minuten; eine neue Bestellung erscheint normalerweise innerhalb von etwa einer halben Stunde. Die erste Prüfung nach dem Verbinden schaut 24 Stunden zurück."],
    ["Was passiert, wenn ein Käufer storniert?", "Bei der nächsten Prüfung wird der passende NivaDesk-Auftrag auf Storniert gesetzt und die Änderung im Verlauf vermerkt. Es wird nichts gelöscht."],
    ["Überschreibt Amazon den Status, den ich setze?", "Nein. Status, Fälligkeitsdatum, Notizen, Zuweisung und die Geliefert-Markierung ändert eine Synchronisierung nie. Die einzige Ausnahme ist ein Storno auf Amazon: Es setzt den Auftrag auf Storniert."],
    ["Warum sehe ich Namen und Adresse des Käufers nicht?", "NivaDesk fordert Amazons Käufer- und Empfängerdaten nicht an; importierte Aufträge zeigen daher „Amazon Customer“ ohne Adresse. Öffnen Sie die Bestellung über den Link in Seller Central, wo die Lieferdaten stehen."],
    ["Kostet die Amazon-Verbindung extra?", "Nein. Sie ist in jedem NivaDesk-Tarif enthalten, auch in Free. Sie zahlen nur den Tarif, den Sie wählen."],
    ["Warum kann ich noch nicht verbinden?", "Amazon prüft die NivaDesk-App noch; sie ist im Status Draft. Bis Amazon sie freigibt, können andere Verkäufer Amazons Zustimmungsseite nicht abschließen. Nach der Freigabe wird die Schaltfläche Connect unter Settings › Integrations von selbst aktiv."],
    ["Welche Marktplätze werden unterstützt?", "Die Marktplätze der Region Europa: Vereinigtes Königreich, Deutschland, Frankreich, Italien, Spanien, Niederlande, Schweden, Polen, Türkei, Vereinigte Arabische Emirate und Indien. Marktplätze anderer Regionen sind noch nicht verfügbar."]
  ]
};

const FR: AmazonSellerPageCopy = {
  heroTitle: "Vos commandes Amazon, transformées en travail planifiable.",
  heroIntro: "NivaDesk est un outil de gestion des commandes pour les entreprises de fabrication sur commande, d'artisanat et de réparation. La connexion Amazon place vos commandes Amazon dans la même liste que le reste de votre travail : chaque vente devient un travail avec un statut, une date d'échéance et des notes, sans recopier Seller Central.",
  ctaStart: "Créer un espace gratuit",
  heroFacts: ["Lecture seule : rien n'est écrit sur Amazon", "Vérifié toutes les 30 minutes", "Inclus dans chaque forfait, Free compris"],
  mockLabel: "Illustration : la liste des commandes NivaDesk avec une commande Amazon importée, et les informations Amazon affichées sur cette commande.",
  mockCaption: "Illustration avec des articles d'exemple. Pas de vraies commandes.",
  mockOrdersTitle: "Commandes",
  mockItems: ["Boîte souvenir en noyer personnalisée", "Médaille pour animal en laiton gravée", "Remplacement de bracelet de montre"],
  mockManual: "Ajoutée à la main",
  mockStatusNew: "Nouvelle",
  mockStatusMaking: "En production",
  mockStatusCancelled: "Annulée",
  mockPlatformStatus: "Statut plateforme",
  mockPayment: "Paiement",
  mockProduction: "Votre statut",
  mockOpen: "Ouvrir dans Seller Central",
  jobsTitle: "Ce que cela simplifie",
  jobsIntro: "Pour les petits ateliers qui vendent une partie de leur travail sur Amazon et le fabriquent, le personnalisent ou le réparent eux-mêmes.",
  jobs: [
    ["Le sur-mesure arrive à l'établi", "Une vente Amazon arrive comme commande NivaDesk avec les intitulés et quantités des articles, une date d'échéance tirée de votre délai habituel et de la place pour vos notes de production."],
    ["Une seule liste pour tous vos canaux", "Les commandes Amazon côtoient celles que vous ajoutez vous-même, chacune marquée de sa provenance : vous planifiez la semaine depuis une liste, pas deux onglets."],
    ["Les annulations avant de commencer", "Quand un acheteur annule sur Amazon, la vérification suivante passe la commande NivaDesk en Annulée et l'inscrit dans son historique : vous ne fabriquez pas ce que personne ne viendra chercher."],
    ["Retour sur Amazon en un clic", "Chaque commande importée garde son numéro de commande Amazon et un lien qui ouvre la même commande dans Seller Central, où se trouvent les informations de livraison."]
  ],
  fieldsTitle: "Ce que NivaDesk lit dans chaque commande",
  fieldsIntro: "Ce sont les seuls champs que NivaDesk prend chez Amazon. Tout le reste de la réponse d'Amazon est écarté avant de quitter le service Amazon distinct de NivaDesk.",
  fieldsOrderTitle: "Commande",
  fieldsOrder: [
    "Numéro de commande Amazon",
    "Place de marché (par exemple Amazon.fr)",
    "Date de commande et dernière mise à jour",
    "Statut : en attente, non expédiée, expédiée, annulée …",
    "Expédiée par Amazon ou par vous",
    "Niveau de service d'expédition",
    "Total de la commande et devise"
  ],
  fieldsItemTitle: "Chaque article",
  fieldsItem: [
    "Titre du produit",
    "ASIN et votre SKU vendeur",
    "Quantité commandée et quantité expédiée",
    "Prix de l'article, frais de port et remise promotionnelle",
    "Frais de paiement à la livraison, si Amazon en indique",
    "État et note sur l'état",
    "Identifiants de promotion"
  ],
  fieldsNotTitle: "Non lus",
  fieldsNot: [
    "Nom, adresse e-mail et téléphone de l'acheteur",
    "Adresses de livraison et de facturation",
    "Messages cadeau et emballage cadeau",
    "Les informations fiscales d'Amazon",
    "Frais Amazon, règlements et versements",
    "Niveaux de stock, stock FBA et votre catalogue produits"
  ],
  fieldsShown: "Dans NivaDesk, chaque commande importée affiche un badge Amazon, le numéro de commande Amazon, le statut et l'état de paiement côté Amazon, le total et un lien vers la commande dans Seller Central. Le client apparaît comme « Amazon Customer ».",
  syncTitle: "Comment fonctionne la synchronisation",
  syncIntro: "Les commandes circulent dans un seul sens : d'Amazon vers votre espace.",
  syncNodes: [
    ["Amazon", "Vos commandes dans Seller Central"],
    ["Service Amazon de NivaDesk", "Un projet Google Cloud distinct à Londres. Il demande les commandes à Amazon et retire tout ce qui est personnel."],
    ["Votre espace", "Les commandes apparaissent dans votre liste"]
  ],
  syncArrowRead: "Commandes lues toutes les 30 minutes",
  syncArrowSend: "Champs de commande uniquement",
  syncFacts: [
    ["Toutes les 30 minutes", "NivaDesk recherche jour et nuit les commandes nouvelles ou modifiées depuis la dernière vérification. Une nouvelle commande Amazon apparaît normalement en une demi-heure environ."],
    ["La première vérification", "À la connexion, la première vérification remonte 24 heures en arrière. Les commandes plus anciennes qui n'ont pas changé depuis ne sont pas importées."],
    ["Des mises à jour, pas de doublons", "Quand Amazon modifie une commande, la même commande NivaDesk est mise à jour. Une annulation la passe en Annulée."],
    ["Votre travail reste le vôtre", "La synchronisation n'écrase jamais le statut, la date d'échéance, les notes, l'attribution ou la marque « livrée » que vous fixez dans NivaDesk. L'annulation est le seul changement Amazon qui modifie le statut."],
    ["Jours chargés", "Chaque vérification importe jusqu'à 500 commandes par compte connecté ; le reste arrive à la vérification suivante."],
    ["Si l'accès expire", "Si Amazon n'accepte plus l'autorisation de NivaDesk, la carte Amazon des paramètres l'indique et vous invite à reconnecter. Les commandes déjà importées restent."]
  ],
  directionTitle: "Lit depuis Amazon. N'écrit jamais sur Amazon.",
  readsTitle: "Lit depuis Amazon",
  reads: [
    "Vos commandes et leurs articles — les champs listés ci-dessus",
    "Les changements de statut, annulations comprises",
    "Les places de marché sur lesquelles votre compte vend"
  ],
  writesTitle: "N'écrit jamais sur Amazon",
  writes: [
    "Aucune modification des offres, prix ou stocks",
    "Aucune confirmation d'expédition ni numéro de suivi",
    "Aucun message aux acheteurs",
    "Aucun remboursement, annulation ou autre action sur votre compte"
  ],
  directionNote: "Chaque requête que NivaDesk envoie à la Selling Partner API d'Amazon est une requête de lecture (GET).",
  limitsTitle: "Limites actuelles",
  limits: [
    ["Accès en cours d'examen", "L'app NivaDesk est au statut Draft chez Amazon et attend son approbation. D'ici là, les vendeurs ne peuvent pas finaliser la connexion."],
    ["Région Europe uniquement", "La connexion passe par Seller Central Europe et lit l'API de la région Europe d'Amazon. Les places de marché des autres régions ne sont pas encore disponibles."],
    ["Commandes uniquement", "Ni frais, ni règlements, ni stock, ni stock FBA, ni catalogue produits."],
    ["Pas de données acheteur", "Les données de l'acheteur et du destinataire ne sont pas demandées : les commandes arrivent sans nom ni adresse. Les informations de livraison restent dans Seller Central."],
    ["Lancée depuis NivaDesk", "L'autorisation depuis l'Amazon Appstore n'est pas encore prise en charge. Connectez-vous à NivaDesk puis à Amazon depuis Settings › Integrations."],
    ["Propriétaire uniquement", "Seul le propriétaire de l'espace peut connecter ou déconnecter Amazon."]
  ],
  marketsIntro: "Une connexion couvre les places de marché de la région Europe sur lesquelles votre compte vendeur vend. Amazon indique lesquelles à NivaDesk lors de la connexion.",
  marketsNote: "Les places de marché hors de la région Europe ne sont pas encore disponibles.",
  faqTitle: "Questions des vendeurs",
  faq: [
    ["NivaDesk modifie-t-il quelque chose dans mon compte Amazon ?", "Non. Chaque requête que NivaDesk envoie à la Selling Partner API d'Amazon est une requête de lecture. NivaDesk ne modifie jamais les offres, les prix ou le stock, ne confirme pas d'expéditions et n'écrit pas aux acheteurs."],
    ["En combien de temps les nouvelles commandes apparaissent-elles ?", "NivaDesk vérifie toutes les 30 minutes : une nouvelle commande apparaît normalement en une demi-heure environ. La première vérification après la connexion remonte 24 heures en arrière."],
    ["Que se passe-t-il si un acheteur annule ?", "À la vérification suivante, la commande NivaDesk correspondante passe en Annulée et le changement est inscrit dans son historique. Rien n'est supprimé."],
    ["Amazon écrase-t-il le statut que je fixe ?", "Non. Votre statut, la date d'échéance, les notes, l'attribution et la marque « livrée » ne sont jamais modifiés par une synchronisation. Seule exception : une annulation sur Amazon passe la commande en Annulée."],
    ["Pourquoi ne vois-je pas le nom et l'adresse de l'acheteur ?", "NivaDesk ne demande pas les données d'acheteur et de destinataire d'Amazon : les commandes importées affichent « Amazon Customer » sans adresse. Utilisez le lien de la commande pour l'ouvrir dans Seller Central, où se trouvent les informations de livraison."],
    ["La connexion Amazon est-elle payante ?", "Non. Elle est incluse dans chaque forfait NivaDesk, Free compris. Vous ne payez que le forfait choisi."],
    ["Pourquoi ne puis-je pas encore me connecter ?", "Amazon examine encore l'app NivaDesk, au statut Draft. Tant qu'Amazon ne l'a pas approuvée, les autres vendeurs ne peuvent pas finaliser l'écran de consentement d'Amazon. Après l'approbation, le bouton Connect de Settings › Integrations s'active tout seul."],
    ["Quelles places de marché sont prises en charge ?", "Celles de la région Europe : Royaume-Uni, Allemagne, France, Italie, Espagne, Pays-Bas, Suède, Pologne, Turquie, Émirats arabes unis et Inde. Les places de marché des autres régions ne sont pas encore disponibles."]
  ]
};

const IT: AmazonSellerPageCopy = {
  heroTitle: "Gli ordini Amazon diventano lavoro da pianificare.",
  heroIntro: "NivaDesk è la gestione ordini per chi produce su ordinazione, crea a mano o ripara. Il collegamento Amazon porta i tuoi ordini Amazon nella stessa lista del resto del lavoro: ogni vendita diventa un lavoro con stato, scadenza e note, senza ricopiarlo da Seller Central.",
  ctaStart: "Crea uno spazio gratuito",
  heroFacts: ["Sola lettura: nulla viene scritto su Amazon", "Controllato ogni 30 minuti", "Incluso in ogni piano, anche Free"],
  mockLabel: "Illustrazione: la lista ordini di NivaDesk con un ordine Amazon importato e i dati Amazon mostrati su quell'ordine.",
  mockCaption: "Illustrazione con articoli di esempio. Non sono ordini reali.",
  mockOrdersTitle: "Ordini",
  mockItems: ["Scatola ricordo in noce personalizzata", "Medaglietta per animali in ottone incisa", "Sostituzione cinturino dell'orologio"],
  mockManual: "Aggiunto a mano",
  mockStatusNew: "Nuovo",
  mockStatusMaking: "In produzione",
  mockStatusCancelled: "Annullato",
  mockPlatformStatus: "Stato piattaforma",
  mockPayment: "Pagamento",
  mockProduction: "Il tuo stato",
  mockOpen: "Apri in Seller Central",
  jobsTitle: "Cosa rende più semplice",
  jobsIntro: "Per i piccoli laboratori che vendono parte del proprio lavoro su Amazon e lo realizzano, personalizzano o riparano da soli.",
  jobs: [
    ["Il su misura arriva al banco", "Una vendita Amazon arriva come ordine NivaDesk con titoli e quantità degli articoli, una scadenza basata sui tuoi tempi abituali e spazio per le note di produzione."],
    ["Una lista per ogni canale di vendita", "Gli ordini Amazon stanno accanto a quelli che aggiungi tu, ciascuno con la sua provenienza: pianifichi la settimana da una lista sola invece che da due schede."],
    ["Gli annullamenti prima di iniziare", "Quando un acquirente annulla su Amazon, il controllo successivo porta l'ordine NivaDesk su Annullato e lo registra nella cronologia: non realizzi qualcosa che nessuno ritirerà."],
    ["Di nuovo su Amazon con un clic", "Ogni ordine importato conserva il numero d'ordine Amazon e un link che apre lo stesso ordine in Seller Central, dove si trovano i dati di consegna."]
  ],
  fieldsTitle: "Cosa legge NivaDesk da ogni ordine",
  fieldsIntro: "Sono gli unici campi che NivaDesk prende da Amazon. Tutto il resto della risposta di Amazon viene scartato prima di lasciare il servizio Amazon separato di NivaDesk.",
  fieldsOrderTitle: "Ordine",
  fieldsOrder: [
    "ID ordine Amazon",
    "Marketplace (ad esempio Amazon.it)",
    "Data dell'ordine e ultimo aggiornamento",
    "Stato: in sospeso, non spedito, spedito, annullato …",
    "Spedito da Amazon o da te",
    "Livello del servizio di spedizione",
    "Totale dell'ordine e valuta"
  ],
  fieldsItemTitle: "Ogni articolo",
  fieldsItem: [
    "Titolo del prodotto",
    "ASIN e il tuo SKU venditore",
    "Quantità ordinata e quantità spedita",
    "Prezzo dell'articolo, costo di spedizione e sconto promozionale",
    "Commissione per contrassegno, se Amazon la indica",
    "Condizione e nota sulla condizione",
    "ID delle promozioni"
  ],
  fieldsNotTitle: "Non letti",
  fieldsNot: [
    "Nome, email e telefono dell'acquirente",
    "Indirizzi di consegna e di fatturazione",
    "Messaggi regalo e confezione regalo",
    "I dati fiscali di Amazon",
    "Commissioni Amazon, regolamenti e pagamenti",
    "Livelli di stock, inventario FBA e catalogo prodotti"
  ],
  fieldsShown: "In NivaDesk ogni ordine importato mostra un badge Amazon, il numero d'ordine Amazon, lo stato e lo stato di pagamento su Amazon, il totale e un link all'ordine in Seller Central. Il cliente compare come «Amazon Customer».",
  syncTitle: "Come funziona la sincronizzazione",
  syncIntro: "Gli ordini viaggiano in una sola direzione: da Amazon al tuo spazio.",
  syncNodes: [
    ["Amazon", "I tuoi ordini in Seller Central"],
    ["Servizio Amazon di NivaDesk", "Un progetto Google Cloud separato a Londra. Chiede gli ordini ad Amazon e rimuove tutto ciò che è personale."],
    ["Il tuo spazio", "Gli ordini compaiono nella tua lista"]
  ],
  syncArrowRead: "Ordini letti ogni 30 minuti",
  syncArrowSend: "Solo campi dell'ordine",
  syncFacts: [
    ["Ogni 30 minuti", "NivaDesk cerca giorno e notte gli ordini nuovi o modificati dall'ultimo controllo. Un nuovo ordine Amazon di solito compare entro circa mezz'ora."],
    ["Il primo controllo", "Quando ti colleghi, il primo controllo guarda alle ultime 24 ore. Gli ordini più vecchi che non sono cambiati da allora non vengono importati."],
    ["Aggiornamenti, non doppioni", "Quando Amazon aggiorna un ordine, viene aggiornato lo stesso ordine NivaDesk. Un annullamento lo porta su Annullato."],
    ["Il tuo lavoro resta tuo", "La sincronizzazione non sovrascrive mai stato, scadenza, note, assegnazione o il segno di consegnato che imposti in NivaDesk. L'annullamento è l'unica modifica Amazon che cambia lo stato."],
    ["Giorni intensi", "Ogni controllo importa fino a 500 ordini per account collegato; il resto arriva al controllo successivo."],
    ["Se l'accesso scade", "Se Amazon non accetta più l'autorizzazione di NivaDesk, la scheda Amazon nelle impostazioni lo segnala e ti chiede di ricollegarti. Gli ordini già importati restano."]
  ],
  directionTitle: "Legge da Amazon. Non scrive mai su Amazon.",
  readsTitle: "Legge da Amazon",
  reads: [
    "I tuoi ordini e i loro articoli — i campi elencati sopra",
    "I cambi di stato, annullamenti compresi",
    "I marketplace in cui vende il tuo account"
  ],
  writesTitle: "Non scrive mai su Amazon",
  writes: [
    "Nessuna modifica a inserzioni, prezzi o stock",
    "Nessuna conferma di spedizione né numero di tracciamento",
    "Nessun messaggio agli acquirenti",
    "Nessun rimborso, annullamento o altra azione sul tuo account"
  ],
  directionNote: "Ogni richiesta che NivaDesk invia alla Selling Partner API di Amazon è una richiesta di lettura (GET).",
  limitsTitle: "Limiti attuali",
  limits: [
    ["Accesso in revisione", "L'app NivaDesk è in stato Draft presso Amazon e attende l'approvazione. Fino ad allora i venditori non possono completare il collegamento."],
    ["Solo regione Europa", "Il collegamento accede tramite Seller Central Europe e legge l'API della regione Europa di Amazon. I marketplace di altre regioni non sono ancora disponibili."],
    ["Solo ordini", "Nessuna commissione, regolamento, stock, inventario FBA o catalogo prodotti."],
    ["Nessun dato dell'acquirente", "I dati di acquirente e destinatario non vengono richiesti: gli ordini arrivano senza nome né indirizzo. I dati di consegna restano in Seller Central."],
    ["Avviato da NivaDesk", "L'autorizzazione dall'Amazon Appstore non è ancora supportata. Accedi a NivaDesk e collega da Settings › Integrations."],
    ["Solo il proprietario", "Solo il proprietario dello spazio può collegare o scollegare Amazon."]
  ],
  marketsIntro: "Un collegamento copre i marketplace della regione Europa in cui vende il tuo account venditore. Amazon comunica a NivaDesk quali sono al momento del collegamento.",
  marketsNote: "I marketplace fuori dalla regione Europa non sono ancora disponibili.",
  faqTitle: "Domande dei venditori",
  faq: [
    ["NivaDesk modifica qualcosa nel mio account Amazon?", "No. Ogni richiesta che NivaDesk invia alla Selling Partner API di Amazon è di sola lettura. Non modifica mai inserzioni, prezzi o stock, non conferma spedizioni e non scrive agli acquirenti."],
    ["Quanto ci mettono a comparire i nuovi ordini?", "NivaDesk controlla ogni 30 minuti: un nuovo ordine di solito compare entro circa mezz'ora. Il primo controllo dopo il collegamento guarda alle ultime 24 ore."],
    ["Cosa succede se un acquirente annulla?", "Al controllo successivo l'ordine NivaDesk corrispondente passa su Annullato e la modifica viene registrata nella cronologia. Non viene eliminato nulla."],
    ["Amazon sovrascrive lo stato che imposto?", "No. Stato, scadenza, note, assegnazione e il segno di consegnato non vengono mai cambiati da una sincronizzazione. L'unica eccezione è un annullamento su Amazon, che porta l'ordine su Annullato."],
    ["Perché non vedo nome e indirizzo dell'acquirente?", "NivaDesk non richiede i dati di acquirente e destinatario di Amazon: gli ordini importati mostrano «Amazon Customer» senza indirizzo. Usa il link sull'ordine per aprirlo in Seller Central, dove si trovano i dati di consegna."],
    ["Il collegamento Amazon costa di più?", "No. È incluso in ogni piano NivaDesk, anche Free. Paghi solo il piano che scegli."],
    ["Perché non posso ancora collegarmi?", "Amazon sta ancora esaminando l'app NivaDesk, che è in stato Draft. Finché Amazon non la approva, gli altri venditori non possono completare la schermata di consenso di Amazon. Dopo l'approvazione il pulsante Connect in Settings › Integrations si attiva da solo."],
    ["Quali marketplace sono supportati?", "Quelli della regione Europa: Regno Unito, Germania, Francia, Italia, Spagna, Paesi Bassi, Svezia, Polonia, Turchia, Emirati Arabi Uniti e India. I marketplace di altre regioni non sono ancora disponibili."]
  ]
};

const ES: AmazonSellerPageCopy = {
  heroTitle: "Tus pedidos de Amazon, convertidos en trabajo que puedes planificar.",
  heroIntro: "NivaDesk es gestión de pedidos para negocios de fabricación por encargo, artesanía y reparación. La conexión con Amazon lleva tus pedidos de Amazon a la misma lista que el resto de tu trabajo: cada venta se convierte en un trabajo con estado, fecha de entrega y notas, sin volver a escribirlo desde Seller Central.",
  ctaStart: "Crear un espacio gratis",
  heroFacts: ["Solo lectura: no se escribe nada en Amazon", "Se comprueba cada 30 minutos", "Incluida en todos los planes, también Free"],
  mockLabel: "Ilustración: la lista de pedidos de NivaDesk con un pedido de Amazon importado y los datos de Amazon que muestra ese pedido.",
  mockCaption: "Ilustración con artículos de ejemplo. No son pedidos reales.",
  mockOrdersTitle: "Pedidos",
  mockItems: ["Caja de recuerdo de nogal personalizada", "Chapa de latón grabada para mascota", "Cambio de correa de reloj"],
  mockManual: "Añadido a mano",
  mockStatusNew: "Nuevo",
  mockStatusMaking: "En producción",
  mockStatusCancelled: "Cancelado",
  mockPlatformStatus: "Estado en la plataforma",
  mockPayment: "Pago",
  mockProduction: "Tu estado",
  mockOpen: "Abrir en Seller Central",
  jobsTitle: "Qué te facilita",
  jobsIntro: "Para pequeños talleres que venden parte de su trabajo en Amazon y lo fabrican, personalizan o reparan ellos mismos.",
  jobs: [
    ["Lo hecho por encargo llega al banco de trabajo", "Una venta de Amazon llega como pedido de NivaDesk con los títulos y cantidades de los artículos, una fecha de entrega según tu plazo habitual y espacio para notas de producción."],
    ["Una lista para todos tus canales", "Los pedidos de Amazon están junto a los que añades tú, cada uno marcado con su origen: planificas la semana desde una lista y no desde dos pestañas."],
    ["Las cancelaciones antes de empezar", "Cuando un comprador cancela en Amazon, la siguiente comprobación pasa el pedido de NivaDesk a Cancelado y lo anota en su historial: no fabricas algo que nadie va a recoger."],
    ["Vuelve a Amazon con un clic", "Cada pedido importado conserva su número de pedido de Amazon y un enlace que abre el mismo pedido en Seller Central, donde están los datos de entrega."]
  ],
  fieldsTitle: "Qué lee NivaDesk de cada pedido",
  fieldsIntro: "Son los únicos campos que NivaDesk toma de Amazon. Todo lo demás de la respuesta de Amazon se descarta antes de salir del servicio de Amazon independiente de NivaDesk.",
  fieldsOrderTitle: "Pedido",
  fieldsOrder: [
    "ID de pedido de Amazon",
    "Tienda (por ejemplo Amazon.es)",
    "Fecha del pedido y última actualización",
    "Estado: pendiente, no enviado, enviado, cancelado …",
    "Enviado por Amazon o por ti",
    "Nivel de servicio de envío",
    "Total del pedido y moneda"
  ],
  fieldsItemTitle: "Cada artículo",
  fieldsItem: [
    "Título del producto",
    "ASIN y tu SKU de vendedor",
    "Cantidad pedida y cantidad enviada",
    "Precio del artículo, gastos de envío y descuento promocional",
    "Cargo por contra reembolso, si Amazon lo indica",
    "Estado y nota sobre el estado",
    "ID de promociones"
  ],
  fieldsNotTitle: "No se leen",
  fieldsNot: [
    "Nombre, correo electrónico y teléfono del comprador",
    "Direcciones de entrega y de facturación",
    "Mensajes y envoltorio de regalo",
    "Los datos fiscales de Amazon",
    "Tarifas de Amazon, liquidaciones y pagos",
    "Niveles de stock, inventario FBA y tu catálogo de productos"
  ],
  fieldsShown: "En NivaDesk cada pedido importado muestra una insignia de Amazon, el número de pedido de Amazon, el estado y el estado de pago en Amazon, el total y un enlace al pedido en Seller Central. El cliente aparece como «Amazon Customer».",
  syncTitle: "Cómo funciona la sincronización",
  syncIntro: "Los pedidos viajan en un solo sentido: de Amazon a tu espacio.",
  syncNodes: [
    ["Amazon", "Tus pedidos en Seller Central"],
    ["Servicio de Amazon de NivaDesk", "Un proyecto de Google Cloud independiente en Londres. Pide los pedidos a Amazon y elimina todo lo personal."],
    ["Tu espacio", "Los pedidos aparecen en tu lista"]
  ],
  syncArrowRead: "Pedidos leídos cada 30 minutos",
  syncArrowSend: "Solo campos del pedido",
  syncFacts: [
    ["Cada 30 minutos", "NivaDesk busca de día y de noche pedidos nuevos o modificados desde la última comprobación. Un pedido nuevo de Amazon suele aparecer en una media hora."],
    ["La primera comprobación", "Al conectar, la primera comprobación mira las últimas 24 horas. Los pedidos más antiguos que no han cambiado desde entonces no se importan."],
    ["Actualizaciones, no duplicados", "Cuando Amazon actualiza un pedido, se actualiza el mismo pedido de NivaDesk. Una cancelación lo pasa a Cancelado."],
    ["Tu trabajo sigue siendo tuyo", "La sincronización nunca sobrescribe el estado, la fecha de entrega, las notas, la asignación ni la marca de entregado que pones en NivaDesk. La cancelación es el único cambio de Amazon que fija el estado."],
    ["Días con mucho trabajo", "Cada comprobación trae hasta 500 pedidos por cuenta conectada; el resto llega en la siguiente."],
    ["Si el acceso caduca", "Si Amazon deja de aceptar la autorización de NivaDesk, la tarjeta de Amazon en los ajustes lo indica y te pide volver a conectar. Los pedidos ya importados se quedan."]
  ],
  directionTitle: "Lee de Amazon. Nunca escribe en Amazon.",
  readsTitle: "Lee de Amazon",
  reads: [
    "Tus pedidos y sus artículos: los campos indicados arriba",
    "Los cambios de estado, incluidas las cancelaciones",
    "En qué tiendas vende tu cuenta de vendedor"
  ],
  writesTitle: "Nunca escribe en Amazon",
  writes: [
    "Ningún cambio en anuncios, precios o stock",
    "Ninguna confirmación de envío ni número de seguimiento",
    "Ningún mensaje a compradores",
    "Ningún reembolso, cancelación ni otra acción en tu cuenta"
  ],
  directionNote: "Cada solicitud que NivaDesk envía a la Selling Partner API de Amazon es una solicitud de lectura (GET).",
  limitsTitle: "Limitaciones actuales",
  limits: [
    ["Acceso en revisión", "La app de NivaDesk está en estado Draft en Amazon y espera aprobación. Hasta entonces los vendedores no pueden completar la conexión."],
    ["Solo región Europa", "La conexión inicia sesión mediante Seller Central Europe y lee la API de la región Europa de Amazon. Las tiendas de otras regiones aún no están disponibles."],
    ["Solo pedidos", "Sin tarifas, liquidaciones, stock, inventario FBA ni catálogo de productos."],
    ["Sin datos del comprador", "No se solicitan datos del comprador ni del destinatario: los pedidos llegan sin nombre ni dirección. Los datos de entrega se quedan en Seller Central."],
    ["Se inicia desde NivaDesk", "La autorización desde la Amazon Appstore aún no es compatible. Inicia sesión en NivaDesk y conecta desde Settings › Integrations."],
    ["Solo el propietario", "Solo el propietario del espacio puede conectar o desconectar Amazon."]
  ],
  marketsIntro: "Una conexión cubre las tiendas de la región Europa en las que vende tu cuenta de vendedor. Amazon indica a NivaDesk cuáles son al conectar.",
  marketsNote: "Las tiendas fuera de la región Europa aún no están disponibles.",
  faqTitle: "Preguntas de vendedores",
  faq: [
    ["¿NivaDesk cambia algo en mi cuenta de Amazon?", "No. Cada solicitud que NivaDesk envía a la Selling Partner API de Amazon es de lectura. Nunca cambia anuncios, precios ni stock, no confirma envíos y no escribe a los compradores."],
    ["¿Cuánto tardan en aparecer los pedidos nuevos?", "NivaDesk comprueba cada 30 minutos, así que un pedido nuevo suele aparecer en una media hora. La primera comprobación tras conectar mira las últimas 24 horas."],
    ["¿Qué pasa si un comprador cancela?", "En la siguiente comprobación el pedido de NivaDesk correspondiente pasa a Cancelado y el cambio se anota en su historial. No se elimina nada."],
    ["¿Amazon sobrescribe el estado que pongo?", "No. Tu estado, la fecha de entrega, las notas, la asignación y la marca de entregado nunca cambian con una sincronización. La única excepción es una cancelación en Amazon: pasa el pedido a Cancelado."],
    ["¿Por qué no veo el nombre y la dirección del comprador?", "NivaDesk no solicita los datos de comprador y destinatario de Amazon, así que los pedidos importados muestran «Amazon Customer» sin dirección. Usa el enlace del pedido para abrirlo en Seller Central, donde están los datos de entrega."],
    ["¿La conexión con Amazon cuesta más?", "No. Está incluida en todos los planes de NivaDesk, también en Free. Solo pagas el plan que elijas."],
    ["¿Por qué todavía no puedo conectar?", "Amazon sigue revisando la app de NivaDesk, que está en estado Draft. Hasta que Amazon la apruebe, otros vendedores no pueden completar la pantalla de consentimiento de Amazon. Tras la aprobación, el botón Connect de Settings › Integrations se activa solo."],
    ["¿Qué tiendas se admiten?", "Las de la región Europa: Reino Unido, Alemania, Francia, Italia, España, Países Bajos, Suecia, Polonia, Turquía, Emiratos Árabes Unidos e India. Las tiendas de otras regiones aún no están disponibles."]
  ]
};

const PT: AmazonSellerPageCopy = {
  heroTitle: "As suas encomendas Amazon, transformadas em trabalho que pode planear.",
  heroIntro: "O NivaDesk é gestão de encomendas para negócios de produção por encomenda, artesanato e reparação. A ligação à Amazon traz as suas encomendas Amazon para a mesma lista que o resto do trabalho: cada venda torna-se um trabalho com estado, prazo e notas, sem voltar a escrevê-la a partir do Seller Central.",
  ctaStart: "Criar um espaço gratuito",
  heroFacts: ["Só leitura: nada é escrito na Amazon", "Verificado a cada 30 minutos", "Incluída em todos os planos, incluindo o Free"],
  mockLabel: "Ilustração: a lista de encomendas do NivaDesk com uma encomenda Amazon importada e os dados Amazon mostrados nessa encomenda.",
  mockCaption: "Ilustração com artigos de exemplo. Não são encomendas reais.",
  mockOrdersTitle: "Encomendas",
  mockItems: ["Caixa de recordações em nogueira personalizada", "Medalha de latão gravada para animal", "Substituição de bracelete de relógio"],
  mockManual: "Adicionada à mão",
  mockStatusNew: "Nova",
  mockStatusMaking: "Em produção",
  mockStatusCancelled: "Cancelada",
  mockPlatformStatus: "Estado na plataforma",
  mockPayment: "Pagamento",
  mockProduction: "O seu estado",
  mockOpen: "Abrir no Seller Central",
  jobsTitle: "O que fica mais fácil",
  jobsIntro: "Para pequenas oficinas que vendem parte do trabalho na Amazon e o fazem, personalizam ou reparam elas próprias.",
  jobs: [
    ["O feito por encomenda chega à bancada", "Uma venda Amazon chega como encomenda NivaDesk com os títulos e quantidades dos artigos, um prazo baseado no seu tempo habitual e espaço para notas de produção."],
    ["Uma lista para todos os canais", "As encomendas Amazon ficam ao lado das que adiciona à mão, cada uma marcada com a origem: planeia a semana a partir de uma lista e não de dois separadores."],
    ["Cancelamentos antes de começar", "Quando um comprador cancela na Amazon, a verificação seguinte passa a encomenda NivaDesk para Cancelada e regista-o no histórico: não faz algo que ninguém vai levantar."],
    ["De volta à Amazon num clique", "Cada encomenda importada mantém o número de encomenda Amazon e uma ligação que abre a mesma encomenda no Seller Central, onde estão os dados de entrega."]
  ],
  fieldsTitle: "O que o NivaDesk lê de cada encomenda",
  fieldsIntro: "São os únicos campos que o NivaDesk recebe da Amazon. Tudo o resto da resposta da Amazon é descartado antes de sair do serviço Amazon separado do NivaDesk.",
  fieldsOrderTitle: "Encomenda",
  fieldsOrder: [
    "ID da encomenda Amazon",
    "Marketplace (por exemplo Amazon.es)",
    "Data da encomenda e última atualização",
    "Estado: pendente, não enviada, enviada, cancelada …",
    "Enviada pela Amazon ou por si",
    "Nível do serviço de envio",
    "Total da encomenda e moeda"
  ],
  fieldsItemTitle: "Cada artigo",
  fieldsItem: [
    "Título do produto",
    "ASIN e o seu SKU de vendedor",
    "Quantidade encomendada e quantidade enviada",
    "Preço do artigo, portes e desconto promocional",
    "Taxa de pagamento na entrega, se a Amazon a indicar",
    "Estado do artigo e nota sobre o estado",
    "IDs de promoções"
  ],
  fieldsNotTitle: "Não lido",
  fieldsNot: [
    "Nome, email e telefone do comprador",
    "Moradas de entrega e de faturação",
    "Mensagens e embrulho de presente",
    "Os dados fiscais da Amazon",
    "Taxas da Amazon, liquidações e pagamentos",
    "Níveis de stock, inventário FBA e o seu catálogo de produtos"
  ],
  fieldsShown: "No NivaDesk cada encomenda importada mostra um selo Amazon, o número de encomenda Amazon, o estado e o estado de pagamento na Amazon, o total e uma ligação para a encomenda no Seller Central. O cliente aparece como «Amazon Customer».",
  syncTitle: "Como funciona a sincronização",
  syncIntro: "As encomendas viajam num só sentido: da Amazon para o seu espaço.",
  syncNodes: [
    ["Amazon", "As suas encomendas no Seller Central"],
    ["Serviço Amazon do NivaDesk", "Um projeto Google Cloud separado em Londres. Pede as encomendas à Amazon e remove tudo o que é pessoal."],
    ["O seu espaço", "As encomendas aparecem na sua lista"]
  ],
  syncArrowRead: "Encomendas lidas a cada 30 minutos",
  syncArrowSend: "Só campos da encomenda",
  syncFacts: [
    ["A cada 30 minutos", "O NivaDesk procura, dia e noite, encomendas novas ou alteradas desde a última verificação. Uma nova encomenda Amazon aparece normalmente em cerca de meia hora."],
    ["A primeira verificação", "Ao ligar, a primeira verificação olha para as últimas 24 horas. Encomendas mais antigas que não mudaram desde então não são trazidas."],
    ["Atualizações, não duplicados", "Quando a Amazon atualiza uma encomenda, a mesma encomenda NivaDesk é atualizada. Um cancelamento passa-a para Cancelada."],
    ["O seu trabalho continua seu", "A sincronização nunca substitui o estado, o prazo, as notas, a atribuição ou a marca de entregue que define no NivaDesk. O cancelamento é a única alteração da Amazon que define o estado."],
    ["Dias movimentados", "Cada verificação traz até 500 encomendas por conta ligada; o resto chega na verificação seguinte."],
    ["Se o acesso expirar", "Se a Amazon deixar de aceitar a autorização do NivaDesk, o cartão Amazon nas definições indica-o e pede para voltar a ligar. As encomendas já importadas ficam."]
  ],
  directionTitle: "Lê da Amazon. Nunca escreve na Amazon.",
  readsTitle: "Lê da Amazon",
  reads: [
    "As suas encomendas e os artigos — os campos indicados acima",
    "Alterações de estado, incluindo cancelamentos",
    "Em que marketplaces a sua conta de vendedor vende"
  ],
  writesTitle: "Nunca escreve na Amazon",
  writes: [
    "Nenhuma alteração a anúncios, preços ou stock",
    "Nenhuma confirmação de envio nem número de seguimento",
    "Nenhuma mensagem a compradores",
    "Nenhum reembolso, cancelamento ou outra ação na sua conta"
  ],
  directionNote: "Cada pedido que o NivaDesk envia à Selling Partner API da Amazon é um pedido de leitura (GET).",
  limitsTitle: "Limitações atuais",
  limits: [
    ["Acesso em análise", "A app NivaDesk está em estado Draft na Amazon e aguarda aprovação. Até lá, os vendedores não conseguem concluir a ligação."],
    ["Só a região Europa", "A ligação inicia sessão através do Seller Central Europe e lê a API da região Europa da Amazon. Os marketplaces de outras regiões ainda não estão disponíveis."],
    ["Só encomendas", "Sem taxas, liquidações, stock, inventário FBA nem catálogo de produtos."],
    ["Sem dados do comprador", "Os dados do comprador e do destinatário não são pedidos: as encomendas chegam sem nome nem morada. Os dados de entrega ficam no Seller Central."],
    ["Iniciada no NivaDesk", "A autorização a partir da Amazon Appstore ainda não é suportada. Inicie sessão no NivaDesk e ligue em Settings › Integrations."],
    ["Só o proprietário", "Só o proprietário do espaço pode ligar ou desligar a Amazon."]
  ],
  marketsIntro: "Uma ligação cobre os marketplaces da região Europa onde a sua conta de vendedor vende. A Amazon indica ao NivaDesk quais são quando liga.",
  marketsNote: "Os marketplaces fora da região Europa ainda não estão disponíveis.",
  faqTitle: "Perguntas dos vendedores",
  faq: [
    ["O NivaDesk altera alguma coisa na minha conta Amazon?", "Não. Cada pedido que o NivaDesk envia à Selling Partner API da Amazon é de leitura. Nunca altera anúncios, preços ou stock, não confirma envios e não escreve a compradores."],
    ["Quanto tempo demoram a aparecer novas encomendas?", "O NivaDesk verifica a cada 30 minutos, por isso uma nova encomenda aparece normalmente em cerca de meia hora. A primeira verificação depois de ligar olha para as últimas 24 horas."],
    ["O que acontece se um comprador cancelar?", "Na verificação seguinte a encomenda NivaDesk correspondente passa para Cancelada e a alteração fica registada no histórico. Nada é apagado."],
    ["A Amazon substitui o estado que eu defino?", "Não. O seu estado, prazo, notas, atribuição e a marca de entregue nunca são alterados por uma sincronização. A única exceção é um cancelamento na Amazon, que passa a encomenda para Cancelada."],
    ["Porque não vejo o nome e a morada do comprador?", "O NivaDesk não pede os dados de comprador e destinatário da Amazon, por isso as encomendas importadas mostram «Amazon Customer» sem morada. Use a ligação na encomenda para a abrir no Seller Central, onde estão os dados de entrega."],
    ["A ligação à Amazon custa mais?", "Não. Está incluída em todos os planos NivaDesk, incluindo o Free. Paga apenas o plano que escolher."],
    ["Porque ainda não consigo ligar?", "A Amazon ainda está a analisar a app NivaDesk, que está em estado Draft. Até a Amazon a aprovar, outros vendedores não conseguem concluir o ecrã de consentimento da Amazon. Depois da aprovação, o botão Connect em Settings › Integrations fica ativo sozinho."],
    ["Que marketplaces são suportados?", "Os da região Europa: Reino Unido, Alemanha, França, Itália, Espanha, Países Baixos, Suécia, Polónia, Turquia, Emirados Árabes Unidos e Índia. Os marketplaces de outras regiões ainda não estão disponíveis."]
  ]
};

const RU: AmazonSellerPageCopy = {
  heroTitle: "Заказы Amazon превращаются в работу, которую можно планировать.",
  heroIntro: "NivaDesk — система управления заказами для мастерских, которые работают на заказ, делают вещи вручную или ремонтируют. Подключение Amazon переносит ваши заказы Amazon в тот же список, что и остальную работу: каждая продажа становится задачей со статусом, сроком и заметками — без перепечатывания из Seller Central.",
  ctaStart: "Создать бесплатное пространство",
  heroFacts: ["Только чтение: в Amazon ничего не записывается", "Проверка каждые 30 минут", "Входит в каждый тариф, включая Free"],
  mockLabel: "Иллюстрация: список заказов NivaDesk с импортированным заказом Amazon и данные Amazon, показанные в этом заказе.",
  mockCaption: "Иллюстрация с примерами товаров. Это не настоящие заказы.",
  mockOrdersTitle: "Заказы",
  mockItems: ["Именная шкатулка из ореха", "Гравированный латунный жетон для питомца", "Замена ремешка часов"],
  mockManual: "Добавлен вручную",
  mockStatusNew: "Новый",
  mockStatusMaking: "В работе",
  mockStatusCancelled: "Отменён",
  mockPlatformStatus: "Статус на площадке",
  mockPayment: "Оплата",
  mockProduction: "Ваш статус",
  mockOpen: "Открыть в Seller Central",
  jobsTitle: "Что становится проще",
  jobsIntro: "Для небольших мастерских, которые продают часть своих изделий на Amazon и сами их делают, персонализируют или ремонтируют.",
  jobs: [
    ["Заказ попадает прямо на верстак", "Продажа на Amazon приходит как заказ NivaDesk с названиями и количеством товаров, сроком по вашему обычному времени изготовления и местом для производственных заметок."],
    ["Один список для всех каналов", "Заказы Amazon стоят рядом с заказами, которые вы добавляете сами, и у каждого отмечено, откуда он пришёл, — неделя планируется по одному списку, а не по двум вкладкам."],
    ["Отмены — до начала работы", "Когда покупатель отменяет заказ на Amazon, следующая проверка переводит заказ NivaDesk в «Отменён» и записывает это в историю — вы не делаете то, что никто не заберёт."],
    ["Обратно в Amazon одним щелчком", "Каждый импортированный заказ хранит номер заказа Amazon и ссылку, которая открывает этот заказ в Seller Central, где находятся данные доставки."]
  ],
  fieldsTitle: "Что NivaDesk читает из каждого заказа",
  fieldsIntro: "Это единственные поля, которые NivaDesk берёт из Amazon. Всё остальное в ответе Amazon отбрасывается, прежде чем покинет отдельный сервис NivaDesk для Amazon.",
  fieldsOrderTitle: "Заказ",
  fieldsOrder: [
    "Номер заказа Amazon",
    "Площадка (например, Amazon.de)",
    "Дата заказа и последнего изменения",
    "Статус: ожидает, не отправлен, отправлен, отменён …",
    "Отправляет Amazon или вы",
    "Уровень службы доставки",
    "Сумма заказа и валюта"
  ],
  fieldsItemTitle: "Каждый товар",
  fieldsItem: [
    "Название товара",
    "ASIN и ваш SKU продавца",
    "Заказанное и отправленное количество",
    "Цена товара, стоимость доставки и скидка по акции",
    "Сбор за наложенный платёж, если Amazon его указывает",
    "Состояние и примечание о состоянии",
    "Идентификаторы акций"
  ],
  fieldsNotTitle: "Не читается",
  fieldsNot: [
    "Имя, email и телефон покупателя",
    "Адреса доставки и выставления счёта",
    "Подарочные сообщения и подарочная упаковка",
    "Налоговые данные Amazon",
    "Комиссии Amazon, расчёты и выплаты",
    "Остатки, запасы FBA и ваш каталог товаров"
  ],
  fieldsShown: "В NivaDesk каждый импортированный заказ показывает значок Amazon, номер заказа Amazon, статус и состояние оплаты на Amazon, сумму и ссылку на заказ в Seller Central. Клиент отображается как «Amazon Customer».",
  syncTitle: "Как работает синхронизация",
  syncIntro: "Заказы движутся только в одну сторону: из Amazon в ваше пространство.",
  syncNodes: [
    ["Amazon", "Ваши заказы в Seller Central"],
    ["Сервис NivaDesk для Amazon", "Отдельный проект Google Cloud в Лондоне. Он запрашивает заказы у Amazon и удаляет всё личное."],
    ["Ваше пространство", "Заказы появляются в вашем списке"]
  ],
  syncArrowRead: "Заказы читаются каждые 30 минут",
  syncArrowSend: "Только поля заказа",
  syncFacts: [
    ["Каждые 30 минут", "NivaDesk круглосуточно ищет заказы, новые или изменённые с прошлой проверки. Новый заказ Amazon обычно появляется примерно в течение получаса."],
    ["Первая проверка", "После подключения первая проверка смотрит на последние 24 часа. Более старые заказы, которые с тех пор не менялись, не переносятся."],
    ["Обновления, а не дубли", "Когда Amazon меняет заказ, обновляется тот же заказ NivaDesk. Отмена переводит его в «Отменён»."],
    ["Ваша работа остаётся вашей", "Синхронизация никогда не перезаписывает статус, срок, заметки, назначение или отметку о доставке, которые вы ставите в NivaDesk. Отмена — единственное изменение Amazon, которое меняет статус."],
    ["Загруженные дни", "Каждая проверка переносит до 500 заказов на подключённый аккаунт; остальные придут при следующей проверке."],
    ["Если доступ истёк", "Если Amazon перестанет принимать авторизацию NivaDesk, карточка Amazon в настройках сообщит об этом и попросит переподключиться. Уже импортированные заказы остаются."]
  ],
  directionTitle: "Читает из Amazon. Никогда не пишет в Amazon.",
  readsTitle: "Читает из Amazon",
  reads: [
    "Ваши заказы и их товары — поля, перечисленные выше",
    "Изменения статуса, включая отмены",
    "На каких площадках продаёт ваш аккаунт продавца"
  ],
  writesTitle: "Никогда не пишет в Amazon",
  writes: [
    "Никаких изменений в объявлениях, ценах или остатках",
    "Никаких подтверждений отправки и трек-номеров",
    "Никаких сообщений покупателям",
    "Никаких возвратов, отмен или других действий в вашем аккаунте"
  ],
  directionNote: "Каждый запрос, который NivaDesk отправляет в Selling Partner API Amazon, — это запрос на чтение (GET).",
  limitsTitle: "Текущие ограничения",
  limits: [
    ["Доступ на проверке", "Приложение NivaDesk находится у Amazon в статусе Draft и ждёт одобрения. До этого продавцы не могут завершить подключение."],
    ["Только регион Европа", "Подключение выполняет вход через Seller Central Europe и читает API Amazon для региона Европа. Площадки других регионов пока недоступны."],
    ["Только заказы", "Никаких комиссий, расчётов, остатков, запасов FBA или каталога товаров."],
    ["Без данных покупателя", "Данные покупателя и получателя не запрашиваются, поэтому заказы приходят без имени и адреса. Данные доставки остаются в Seller Central."],
    ["Запуск из NivaDesk", "Авторизация из Amazon Appstore пока не поддерживается. Войдите в NivaDesk и подключитесь в Settings › Integrations."],
    ["Только владелец", "Подключать и отключать Amazon может только владелец пространства."]
  ],
  marketsIntro: "Одно подключение охватывает площадки региона Европа, на которых продаёт ваш аккаунт продавца. Какие именно, Amazon сообщает NivaDesk при подключении.",
  marketsNote: "Площадки за пределами региона Европа пока недоступны.",
  faqTitle: "Вопросы продавцов",
  faq: [
    ["Меняет ли NivaDesk что-нибудь в моём аккаунте Amazon?", "Нет. Каждый запрос NivaDesk к Selling Partner API Amazon — это запрос на чтение. NivaDesk никогда не меняет объявления, цены или остатки, не подтверждает отправки и не пишет покупателям."],
    ["Как быстро появляются новые заказы Amazon?", "NivaDesk проверяет каждые 30 минут, поэтому новый заказ обычно появляется примерно в течение получаса. Первая проверка после подключения смотрит на последние 24 часа."],
    ["Что будет, если покупатель отменит заказ?", "При следующей проверке соответствующий заказ NivaDesk переводится в «Отменён», а изменение записывается в историю. Ничего не удаляется."],
    ["Перезапишет ли Amazon статус, который я поставил?", "Нет. Статус, срок, заметки, назначение и отметка о доставке никогда не меняются синхронизацией. Единственное исключение — отмена на Amazon: она переводит заказ в «Отменён»."],
    ["Почему я не вижу имя и адрес покупателя?", "NivaDesk не запрашивает данные покупателя и получателя Amazon, поэтому импортированные заказы показывают «Amazon Customer» без адреса. Откройте заказ по ссылке в Seller Central — там находятся данные доставки."],
    ["Подключение Amazon стоит дополнительно?", "Нет. Оно входит в каждый тариф NivaDesk, включая Free. Вы платите только за выбранный тариф."],
    ["Почему я пока не могу подключиться?", "Amazon ещё проверяет приложение NivaDesk, которое находится в статусе Draft. Пока Amazon его не одобрит, другие продавцы не могут завершить экран согласия Amazon. После одобрения кнопка Connect в Settings › Integrations станет доступна сама."],
    ["Какие площадки поддерживаются?", "Площадки региона Европа: Великобритания, Германия, Франция, Италия, Испания, Нидерланды, Швеция, Польша, Турция, Объединённые Арабские Эмираты и Индия. Площадки других регионов пока недоступны."]
  ]
};

const JA: AmazonSellerPageCopy = {
  heroTitle: "Amazon の注文を、計画できる仕事に。",
  heroIntro: "NivaDesk は、受注制作・ハンドメイド・修理の事業者のための注文管理ツールです。Amazon 連携は Amazon の注文を他の仕事と同じ一覧に取り込み、各販売をステータス・期日・メモのある仕事にします。Seller Central から書き写す必要はありません。",
  ctaStart: "無料のワークスペースを作成",
  heroFacts: ["読み取り専用：Amazon には何も書き込みません", "30 分ごとに確認", "Free を含むすべてのプランに付属"],
  mockLabel: "イラスト：取り込まれた Amazon 注文を含む NivaDesk の注文一覧と、その注文に表示される Amazon の情報。",
  mockCaption: "サンプル商品によるイラストです。実際の注文ではありません。",
  mockOrdersTitle: "注文",
  mockItems: ["名入れウォールナットのメモリアルボックス", "刻印入り真鍮ペットタグ", "時計ベルトの交換"],
  mockManual: "手動で追加",
  mockStatusNew: "新規",
  mockStatusMaking: "制作中",
  mockStatusCancelled: "キャンセル",
  mockPlatformStatus: "プラットフォームのステータス",
  mockPayment: "支払い",
  mockProduction: "あなたのステータス",
  mockOpen: "Seller Central で開く",
  jobsTitle: "楽になること",
  jobsIntro: "作品の一部を Amazon で販売し、自ら制作・名入れ・修理を行う小さな工房のために。",
  jobs: [
    ["受注制作の品がそのまま作業台へ", "Amazon の販売は、商品名と数量、いつもの制作日数にもとづく期日、制作メモの欄を備えた NivaDesk の注文として届きます。"],
    ["すべての販売経路を一つの一覧に", "Amazon の注文は自分で追加した注文と並び、それぞれに入手元が表示されます。2 つのタブではなく 1 つの一覧で 1 週間を計画できます。"],
    ["作り始める前にキャンセルを把握", "購入者が Amazon でキャンセルすると、次の確認で NivaDesk の注文がキャンセルに移り、注文履歴に記録されます。誰も受け取らない物を作らずに済みます。"],
    ["ワンクリックで Amazon へ", "取り込んだ注文には Amazon の注文番号と、配送情報がある Seller Central で同じ注文を開くリンクが残ります。"]
  ],
  fieldsTitle: "NivaDesk が各注文から読み取るもの",
  fieldsIntro: "NivaDesk が Amazon から受け取るのは以下の項目だけです。Amazon の応答に含まれるそれ以外の情報は、独立した NivaDesk Amazon サービスを出る前に破棄されます。",
  fieldsOrderTitle: "注文",
  fieldsOrder: [
    "Amazon 注文 ID",
    "マーケットプレイス（例：Amazon.co.uk）",
    "注文日と最終更新日",
    "注文ステータス：保留中、未出荷、出荷済み、キャンセル …",
    "Amazon 出荷か自社出荷か",
    "配送サービスレベル",
    "注文合計と通貨"
  ],
  fieldsItemTitle: "各商品",
  fieldsItem: [
    "商品名",
    "ASIN と出品者 SKU",
    "注文数と出荷数",
    "商品価格、配送料、プロモーション割引",
    "代金引換手数料（Amazon が報告する場合）",
    "コンディションとコンディション説明",
    "プロモーション ID"
  ],
  fieldsNotTitle: "読み取らないもの",
  fieldsNot: [
    "購入者の氏名、メールアドレス、電話番号",
    "配送先と請求先の住所",
    "ギフトメッセージとギフト包装",
    "Amazon の税情報",
    "Amazon の手数料、決済、入金",
    "在庫数、FBA 在庫、商品カタログ"
  ],
  fieldsShown: "NivaDesk では、取り込んだ各注文に Amazon バッジ、Amazon 注文番号、Amazon 上のステータスと支払い状況、合計、Seller Central の注文へのリンクが表示されます。顧客は「Amazon Customer」と表示されます。",
  syncTitle: "同期のしくみ",
  syncIntro: "注文の流れは一方向だけです：Amazon からあなたのワークスペースへ。",
  syncNodes: [
    ["Amazon", "Seller Central にあるあなたの注文"],
    ["NivaDesk Amazon サービス", "ロンドンにある独立した Google Cloud プロジェクト。Amazon に注文を問い合わせ、個人情報をすべて取り除きます。"],
    ["あなたのワークスペース", "注文が注文一覧に表示されます"]
  ],
  syncArrowRead: "30 分ごとに注文を読み取り",
  syncArrowSend: "注文の項目のみ",
  syncFacts: [
    ["30 分ごと", "NivaDesk は昼夜を問わず、前回の確認以降に新しく入った、または変更された注文を確認します。新しい Amazon 注文は通常 30 分ほどで表示されます。"],
    ["最初の確認", "連携すると、最初の確認は過去 24 時間をさかのぼります。それ以降変更のない古い注文は取り込まれません。"],
    ["重複ではなく更新", "Amazon が注文を更新すると、同じ NivaDesk の注文が更新されます。キャンセルされた注文はキャンセルに移ります。"],
    ["あなたの作業はあなたのもの", "同期が、NivaDesk で設定したステータス、期日、メモ、担当、納品済みの印を上書きすることはありません。ステータスを変える Amazon 側の変更はキャンセルだけです。"],
    ["忙しい日", "1 回の確認で、連携アカウントごとに最大 500 件の注文を取り込みます。残りは次の確認で届きます。"],
    ["アクセスが切れたとき", "Amazon が NivaDesk の認可を受け付けなくなると、設定の Amazon カードにその旨が表示され、再連携を求めます。取り込み済みの注文は残ります。"]
  ],
  directionTitle: "Amazon から読み取り、Amazon には書き込みません。",
  readsTitle: "Amazon から読み取るもの",
  reads: [
    "注文とその商品（上記の項目）",
    "キャンセルを含むステータスの変更",
    "出品者アカウントが販売しているマーケットプレイス"
  ],
  writesTitle: "Amazon に書き込まないもの",
  writes: [
    "出品、価格、在庫の変更はしません",
    "出荷通知や追跡番号の送信はしません",
    "購入者へのメッセージは送りません",
    "返金、キャンセル、その他アカウント上の操作は一切しません"
  ],
  directionNote: "NivaDesk が Amazon の Selling Partner API に送るリクエストはすべて読み取り（GET）リクエストです。",
  limitsTitle: "現在の制限",
  limits: [
    ["アクセス審査中", "NivaDesk アプリは Amazon で Draft ステータスにあり、承認待ちです。それまで出品者は連携を完了できません。"],
    ["ヨーロッパ地域のみ", "連携は Seller Central Europe でサインインし、Amazon のヨーロッパ地域 API から読み取ります。他の地域のマーケットプレイスはまだ利用できません。"],
    ["注文のみ", "手数料、決済、在庫、FBA 在庫、商品カタログは扱いません。"],
    ["購入者情報なし", "購入者と受取人のデータは要求しないため、注文は氏名や住所なしで届きます。配送情報は Seller Central にあります。"],
    ["NivaDesk から開始", "Amazon Appstore からの認可にはまだ対応していません。NivaDesk にサインインし、Settings › Integrations から連携してください。"],
    ["オーナーのみ", "Amazon の連携と解除ができるのはワークスペースのオーナーだけです。"]
  ],
  marketsIntro: "1 つの連携で、出品者アカウントが販売しているヨーロッパ地域のマーケットプレイスをカバーします。どれが対象かは、連携時に Amazon が NivaDesk に伝えます。",
  marketsNote: "ヨーロッパ地域以外のマーケットプレイスはまだ利用できません。",
  faqTitle: "出品者からのよくある質問",
  faq: [
    ["NivaDesk は Amazon アカウントの何かを変更しますか？", "いいえ。NivaDesk が Amazon の Selling Partner API に送るリクエストはすべて読み取りです。出品、価格、在庫を変更したり、出荷を確定したり、購入者にメッセージを送ったりすることはありません。"],
    ["新しい Amazon 注文はどのくらいで表示されますか？", "NivaDesk は 30 分ごとに確認するため、新しい注文は通常 30 分ほどで表示されます。連携後の最初の確認は過去 24 時間をさかのぼります。"],
    ["購入者がキャンセルするとどうなりますか？", "次の確認で該当する NivaDesk の注文がキャンセルに移り、変更が履歴に記録されます。削除されるものはありません。"],
    ["自分で設定したステータスを Amazon が上書きしますか？", "いいえ。ステータス、期日、メモ、担当、納品済みの印が同期で変わることはありません。唯一の例外は Amazon でのキャンセルで、注文がキャンセルに移ります。"],
    ["購入者の名前や住所が見えないのはなぜですか？", "NivaDesk は Amazon の購入者・受取人データを要求しないため、取り込んだ注文は住所なしの「Amazon Customer」と表示されます。注文のリンクから Seller Central で開くと配送情報を確認できます。"],
    ["Amazon 連携に追加料金はかかりますか？", "いいえ。Free を含むすべての NivaDesk プランに含まれています。お支払いは選んだプランの料金だけです。"],
    ["まだ連携できないのはなぜですか？", "Amazon が Draft ステータスの NivaDesk アプリを審査中です。Amazon が承認するまで、他の出品者は Amazon の同意画面を完了できません。承認後は Settings › Integrations の Connect ボタンが自動的に使えるようになります。"],
    ["対応しているマーケットプレイスは？", "ヨーロッパ地域のマーケットプレイスです：イギリス、ドイツ、フランス、イタリア、スペイン、オランダ、スウェーデン、ポーランド、トルコ、アラブ首長国連邦、インド。他の地域のマーケットプレイスはまだ利用できません。"]
  ]
};

const ZH: AmazonSellerPageCopy = {
  heroTitle: "把 Amazon 订单变成可以安排的工作。",
  heroIntro: "NivaDesk 是为定制生产、手工制作和维修类商家打造的订单管理工具。Amazon 连接会把你的 Amazon 订单带进与其他工作相同的列表，每一笔销售都成为带有状态、交付日期和备注的工作——无需从 Seller Central 重新录入。",
  ctaStart: "创建免费工作区",
  heroFacts: ["只读：不会向 Amazon 写入任何内容", "每 30 分钟检查一次", "包含在每个套餐中，包括 Free"],
  mockLabel: "示意图：NivaDesk 订单列表中的一条导入的 Amazon 订单，以及该订单上显示的 Amazon 信息。",
  mockCaption: "使用示例商品的示意图，并非真实订单。",
  mockOrdersTitle: "订单",
  mockItems: ["定制胡桃木纪念盒", "刻字黄铜宠物牌", "更换表带"],
  mockManual: "手动添加",
  mockStatusNew: "新订单",
  mockStatusMaking: "生产中",
  mockStatusCancelled: "已取消",
  mockPlatformStatus: "平台状态",
  mockPayment: "付款",
  mockProduction: "你的状态",
  mockOpen: "在 Seller Central 中打开",
  jobsTitle: "它让什么变得更简单",
  jobsIntro: "适合在 Amazon 上销售部分作品、并亲自制作、定制或维修的小作坊。",
  jobs: [
    ["定制商品直接上工作台", "Amazon 的销售会以 NivaDesk 订单的形式到来，带有商品名称和数量、按你惯常制作周期计算的交付日期，以及填写生产备注的位置。"],
    ["所有销售渠道一个列表", "Amazon 订单与你手动添加的订单并列，每条都标明来源，你可以在一个列表里安排一周，而不是在两个标签页之间切换。"],
    ["开工前就知道取消", "买家在 Amazon 上取消后，下一次检查会把 NivaDesk 订单改为“已取消”并记入订单历史，你不会去做没人要的东西。"],
    ["一键回到 Amazon", "每个导入的订单都保留 Amazon 订单号，以及在 Seller Central 中打开同一订单的链接，配送信息就在那里。"]
  ],
  fieldsTitle: "NivaDesk 从每个订单读取什么",
  fieldsIntro: "这些是 NivaDesk 从 Amazon 获取的全部字段。Amazon 响应中的其他内容在离开独立的 NivaDesk Amazon 服务之前就被丢弃。",
  fieldsOrderTitle: "订单",
  fieldsOrder: [
    "Amazon 订单 ID",
    "站点（例如 Amazon.co.uk）",
    "下单日期和最后更新时间",
    "订单状态：待处理、未发货、已发货、已取消 …",
    "由 Amazon 配送还是由你配送",
    "配送服务级别",
    "订单总额和币种"
  ],
  fieldsItemTitle: "每件商品",
  fieldsItem: [
    "商品标题",
    "ASIN 和你的卖家 SKU",
    "订购数量和已发货数量",
    "商品价格、运费和促销折扣",
    "货到付款费（如 Amazon 提供）",
    "商品状况及状况说明",
    "促销 ID"
  ],
  fieldsNotTitle: "不读取",
  fieldsNot: [
    "买家姓名、电子邮件和电话",
    "收货地址和账单地址",
    "礼品留言和礼品包装",
    "Amazon 的税务信息",
    "Amazon 费用、结算和付款",
    "库存数量、FBA 库存和你的商品目录"
  ],
  fieldsShown: "在 NivaDesk 中，每个导入的订单都会显示 Amazon 标识、Amazon 订单号、Amazon 上的状态和付款状态、总额，以及指向 Seller Central 中该订单的链接。客户显示为“Amazon Customer”。",
  syncTitle: "同步如何运作",
  syncIntro: "订单只朝一个方向流动：从 Amazon 到你的工作区。",
  syncNodes: [
    ["Amazon", "你在 Seller Central 中的订单"],
    ["NivaDesk Amazon 服务", "位于伦敦的独立 Google Cloud 项目。它向 Amazon 请求订单，并去除所有个人信息。"],
    ["你的工作区", "订单出现在你的订单列表中"]
  ],
  syncArrowRead: "每 30 分钟读取一次订单",
  syncArrowSend: "仅订单字段",
  syncFacts: [
    ["每 30 分钟", "NivaDesk 全天候检查自上次检查以来新增或变更的订单。新的 Amazon 订单通常会在半小时左右出现。"],
    ["首次检查", "连接后，首次检查会回看过去 24 小时。此后没有变化的更早订单不会被导入。"],
    ["更新而不是重复", "当 Amazon 更新订单时，更新的是同一个 NivaDesk 订单。取消会把它改为“已取消”。"],
    ["你的工作由你决定", "同步绝不会覆盖你在 NivaDesk 中设置的状态、交付日期、备注、负责人或已交付标记。取消是唯一会改变状态的 Amazon 变更。"],
    ["繁忙的日子", "每次检查每个已连接账户最多导入 500 个订单，其余的在下一次检查中导入。"],
    ["如果访问失效", "如果 Amazon 不再接受 NivaDesk 的授权，设置中的 Amazon 卡片会提示并请你重新连接。已导入的订单会保留。"]
  ],
  directionTitle: "从 Amazon 读取，从不向 Amazon 写入。",
  readsTitle: "从 Amazon 读取",
  reads: [
    "你的订单及其商品——即上面列出的字段",
    "订单状态变化，包括取消",
    "你的卖家账户在哪些站点销售"
  ],
  writesTitle: "从不向 Amazon 写入",
  writes: [
    "不更改商品信息、价格或库存",
    "不发送发货确认或跟踪号",
    "不给买家发消息",
    "不进行退款、取消或账户上的任何其他操作"
  ],
  directionNote: "NivaDesk 发送到 Amazon Selling Partner API 的每个请求都是读取（GET）请求。",
  limitsTitle: "当前限制",
  limits: [
    ["访问审核中", "NivaDesk 应用在 Amazon 处于 Draft 状态，正在等待批准。在此之前，卖家无法完成连接。"],
    ["仅限欧洲区域", "连接通过 Seller Central Europe 登录，并读取 Amazon 欧洲区域 API。其他区域的站点暂不可用。"],
    ["仅限订单", "不包括费用、结算、库存、FBA 库存或商品目录。"],
    ["没有买家信息", "不请求买家和收件人数据，因此订单到达时没有姓名和地址。配送信息保留在 Seller Central 中。"],
    ["从 NivaDesk 发起", "暂不支持从 Amazon Appstore 发起授权。请登录 NivaDesk，并在 Settings › Integrations 中连接。"],
    ["仅限所有者", "只有工作区所有者可以连接或断开 Amazon。"]
  ],
  marketsIntro: "一个连接覆盖你的卖家账户所销售的欧洲区域站点。连接时，Amazon 会告诉 NivaDesk 是哪些站点。",
  marketsNote: "欧洲区域以外的站点暂不可用。",
  faqTitle: "卖家常见问题",
  faq: [
    ["NivaDesk 会更改我 Amazon 账户里的内容吗？", "不会。NivaDesk 发送到 Amazon Selling Partner API 的每个请求都是读取请求。它从不更改商品信息、价格或库存，不确认发货，也不给买家发消息。"],
    ["新的 Amazon 订单多快出现？", "NivaDesk 每 30 分钟检查一次，新订单通常在半小时左右出现。连接后的首次检查会回看过去 24 小时。"],
    ["买家取消订单会怎样？", "下一次检查时，对应的 NivaDesk 订单会改为“已取消”，变更会记入订单历史。不会删除任何内容。"],
    ["Amazon 会覆盖我设置的状态吗？", "不会。你的状态、交付日期、备注、负责人和已交付标记绝不会被同步更改。唯一的例外是 Amazon 上的取消：它会把订单设为“已取消”。"],
    ["为什么看不到买家的姓名和地址？", "NivaDesk 不请求 Amazon 的买家和收件人数据，因此导入的订单显示为没有地址的“Amazon Customer”。请通过订单上的链接在 Seller Central 中打开，配送信息就在那里。"],
    ["Amazon 连接需要额外付费吗？", "不需要。它包含在每个 NivaDesk 套餐中，包括 Free。你只需支付所选套餐的费用。"],
    ["为什么我现在还不能连接？", "Amazon 仍在审核处于 Draft 状态的 NivaDesk 应用。在 Amazon 批准之前，其他卖家无法完成 Amazon 的授权页面。批准后，Settings › Integrations 中的 Connect 按钮会自动启用。"],
    ["支持哪些站点？", "欧洲区域站点：英国、德国、法国、意大利、西班牙、荷兰、瑞典、波兰、土耳其、阿拉伯联合酋长国和印度。其他区域的站点暂不可用。"]
  ]
};

const AR: AmazonSellerPageCopy = {
  heroTitle: "طلبات Amazon، تتحول إلى عمل يمكنك التخطيط له.",
  heroIntro: "NivaDesk هو نظام لإدارة الطلبات للأعمال التي تصنع حسب الطلب أو يدويًا أو تقدم خدمات الإصلاح. يجلب اتصال Amazon طلباتك من Amazon إلى القائمة نفسها مع بقية عملك، فتصبح كل عملية بيع مهمة لها حالة وموعد تسليم وملاحظات — دون إعادة كتابتها من Seller Central.",
  ctaStart: "أنشئ مساحة عمل مجانية",
  heroFacts: ["للقراءة فقط: لا يُكتب أي شيء في Amazon", "يُفحص كل 30 دقيقة", "مضمّن في كل الخطط، بما فيها Free"],
  mockLabel: "رسم توضيحي: قائمة طلبات NivaDesk مع طلب مستورد من Amazon، وبيانات Amazon المعروضة على ذلك الطلب.",
  mockCaption: "رسم توضيحي بمنتجات أمثلة. ليست طلبات حقيقية.",
  mockOrdersTitle: "الطلبات",
  mockItems: ["صندوق تذكارات من خشب الجوز مخصّص", "قلادة نحاسية محفورة لحيوان أليف", "استبدال سوار ساعة"],
  mockManual: "أُضيف يدويًا",
  mockStatusNew: "جديد",
  mockStatusMaking: "قيد الإنتاج",
  mockStatusCancelled: "ملغى",
  mockPlatformStatus: "حالة المنصة",
  mockPayment: "الدفع",
  mockProduction: "حالتك",
  mockOpen: "فتح في Seller Central",
  jobsTitle: "ما الذي يصبح أسهل",
  jobsIntro: "للورش الصغيرة التي تبيع جزءًا من أعمالها على Amazon وتصنعها أو تخصصها أو تصلحها بنفسها.",
  jobs: [
    ["المنتجات حسب الطلب تصل إلى طاولة العمل", "تصل عملية البيع على Amazon كطلب في NivaDesk يحمل أسماء المنتجات وكمياتها، وموعد تسليم حسب مدة التنفيذ المعتادة لديك، ومكانًا لملاحظات الإنتاج."],
    ["قائمة واحدة لكل طرق البيع", "تظهر طلبات Amazon بجانب الطلبات التي تضيفها بنفسك، وعلى كل منها مصدره، فتخطط لأسبوعك من قائمة واحدة بدلًا من تبويبين."],
    ["الإلغاءات قبل أن تبدأ", "عندما يلغي المشتري على Amazon، ينقل الفحص التالي طلب NivaDesk إلى «ملغى» ويسجّل ذلك في سجل الطلب، فلا تصنع شيئًا لن يستلمه أحد."],
    ["العودة إلى Amazon بنقرة", "يحتفظ كل طلب مستورد برقم طلب Amazon ورابط يفتح الطلب نفسه في Seller Central حيث توجد بيانات التوصيل."]
  ],
  fieldsTitle: "ما يقرؤه NivaDesk من كل طلب",
  fieldsIntro: "هذه هي الحقول الوحيدة التي يأخذها NivaDesk من Amazon. يُحذف كل ما عداها في رد Amazon قبل أن يغادر خدمة NivaDesk المستقلة الخاصة بـ Amazon.",
  fieldsOrderTitle: "الطلب",
  fieldsOrder: [
    "معرّف طلب Amazon",
    "المتجر (مثل Amazon.ae)",
    "تاريخ الطلب وآخر تحديث",
    "حالة الطلب: قيد الانتظار، لم يُشحن، تم الشحن، ملغى …",
    "الشحن عبر Amazon أو بواسطتك",
    "مستوى خدمة الشحن",
    "إجمالي الطلب والعملة"
  ],
  fieldsItemTitle: "كل منتج",
  fieldsItem: [
    "اسم المنتج",
    "رقم ASIN ورمز SKU الخاص بك",
    "الكمية المطلوبة والكمية المشحونة",
    "سعر المنتج وسعر الشحن وخصم العرض",
    "رسوم الدفع عند الاستلام إن أبلغت عنها Amazon",
    "الحالة وملاحظة الحالة",
    "معرّفات العروض"
  ],
  fieldsNotTitle: "لا يُقرأ",
  fieldsNot: [
    "اسم المشتري وبريده الإلكتروني ورقم هاتفه",
    "عناوين التوصيل والفوترة",
    "رسائل الهدايا وتغليف الهدايا",
    "البيانات الضريبية من Amazon",
    "رسوم Amazon والتسويات والمدفوعات",
    "مستويات المخزون ومخزون FBA وكتالوج منتجاتك"
  ],
  fieldsShown: "في NivaDesk يظهر كل طلب مستورد بشارة Amazon ورقم طلب Amazon وحالته وحالة الدفع على Amazon والإجمالي ورابط إلى الطلب في Seller Central. ويظهر العميل باسم «Amazon Customer».",
  syncTitle: "كيف تعمل المزامنة",
  syncIntro: "تنتقل الطلبات في اتجاه واحد فقط: من Amazon إلى مساحة عملك.",
  syncNodes: [
    ["Amazon", "طلباتك في Seller Central"],
    ["خدمة NivaDesk الخاصة بـ Amazon", "مشروع Google Cloud مستقل في لندن. يطلب الطلبات من Amazon ويزيل كل ما هو شخصي."],
    ["مساحة عملك", "تظهر الطلبات في قائمة طلباتك"]
  ],
  syncArrowRead: "تُقرأ الطلبات كل 30 دقيقة",
  syncArrowSend: "حقول الطلب فقط",
  syncFacts: [
    ["كل 30 دقيقة", "يبحث NivaDesk ليلًا ونهارًا عن الطلبات الجديدة أو التي تغيّرت منذ آخر فحص. يظهر طلب Amazon الجديد عادةً خلال نصف ساعة تقريبًا."],
    ["الفحص الأول", "عند الاتصال، يعود الفحص الأول 24 ساعة إلى الوراء. الطلبات الأقدم التي لم تتغير منذ ذلك الحين لا تُستورد."],
    ["تحديثات لا نسخ مكررة", "عندما تحدّث Amazon طلبًا، يُحدَّث طلب NivaDesk نفسه. والإلغاء ينقله إلى «ملغى»."],
    ["عملك يبقى لك", "لا تستبدل المزامنة أبدًا الحالة أو موعد التسليم أو الملاحظات أو التكليف أو علامة التسليم التي تضعها في NivaDesk. الإلغاء هو التغيير الوحيد من Amazon الذي يغيّر الحالة."],
    ["الأيام المزدحمة", "يجلب كل فحص حتى 500 طلب لكل حساب متصل؛ ويصل الباقي في الفحص التالي."],
    ["إذا انتهى الوصول", "إذا توقفت Amazon عن قبول تفويض NivaDesk، تُظهر بطاقة Amazon في الإعدادات ذلك وتطلب منك إعادة الاتصال. تبقى الطلبات المستوردة سابقًا."]
  ],
  directionTitle: "يقرأ من Amazon. ولا يكتب فيها أبدًا.",
  readsTitle: "يقرأ من Amazon",
  reads: [
    "طلباتك ومنتجاتها — الحقول المذكورة أعلاه",
    "تغييرات حالة الطلب، بما فيها الإلغاء",
    "المتاجر التي يبيع فيها حساب البائع الخاص بك"
  ],
  writesTitle: "لا يكتب في Amazon أبدًا",
  writes: [
    "لا تغييرات على العروض أو الأسعار أو المخزون",
    "لا تأكيدات شحن ولا أرقام تتبع",
    "لا رسائل إلى المشترين",
    "لا استردادات ولا إلغاءات ولا أي إجراء آخر في حسابك"
  ],
  directionNote: "كل طلب يرسله NivaDesk إلى Selling Partner API من Amazon هو طلب قراءة (GET).",
  limitsTitle: "القيود الحالية",
  limits: [
    ["الوصول قيد المراجعة", "تطبيق NivaDesk في حالة Draft لدى Amazon وينتظر الموافقة. حتى ذلك الحين لا يستطيع البائعون إكمال الاتصال."],
    ["منطقة أوروبا فقط", "يسجّل الاتصال الدخول عبر Seller Central Europe ويقرأ من واجهة Amazon البرمجية لمنطقة أوروبا. متاجر المناطق الأخرى غير متاحة بعد."],
    ["الطلبات فقط", "لا رسوم ولا تسويات ولا مخزون ولا مخزون FBA ولا كتالوج منتجات."],
    ["لا بيانات للمشتري", "لا تُطلب بيانات المشتري والمستلم، لذا تصل الطلبات دون اسم أو عنوان. تبقى بيانات التوصيل في Seller Central."],
    ["يبدأ من NivaDesk", "التفويض من Amazon Appstore غير مدعوم بعد. سجّل الدخول إلى NivaDesk واتصل من Settings › Integrations."],
    ["للمالك فقط", "لا يستطيع ربط Amazon أو فصله إلا مالك مساحة العمل."]
  ],
  marketsIntro: "يغطي اتصال واحد متاجر منطقة أوروبا التي يبيع فيها حساب البائع الخاص بك. تخبر Amazon نظام NivaDesk بها عند الاتصال.",
  marketsNote: "المتاجر خارج منطقة أوروبا غير متاحة بعد.",
  faqTitle: "أسئلة يطرحها البائعون",
  faq: [
    ["هل يغيّر NivaDesk أي شيء في حسابي على Amazon؟", "لا. كل طلب يرسله NivaDesk إلى Selling Partner API من Amazon هو طلب قراءة. لا يغيّر العروض أو الأسعار أو المخزون أبدًا، ولا يؤكد الشحنات، ولا يراسل المشترين."],
    ["كم تستغرق طلبات Amazon الجديدة لتظهر؟", "يفحص NivaDesk كل 30 دقيقة، لذا يظهر الطلب الجديد عادةً خلال نصف ساعة تقريبًا. يعود الفحص الأول بعد الاتصال 24 ساعة إلى الوراء."],
    ["ماذا يحدث إذا ألغى المشتري؟", "في الفحص التالي يُنقل طلب NivaDesk المطابق إلى «ملغى» ويُسجَّل التغيير في سجله. لا يُحذف شيء."],
    ["هل تستبدل Amazon الحالة التي أضعها؟", "لا. لا تغيّر المزامنة أبدًا حالتك أو موعد التسليم أو الملاحظات أو التكليف أو علامة التسليم. الاستثناء الوحيد هو الإلغاء على Amazon: فهو ينقل الطلب إلى «ملغى»."],
    ["لماذا لا أرى اسم المشتري وعنوانه؟", "لا يطلب NivaDesk بيانات المشتري والمستلم من Amazon، لذا تظهر الطلبات المستوردة باسم «Amazon Customer» دون عنوان. استخدم الرابط على الطلب لفتحه في Seller Central حيث توجد بيانات التوصيل."],
    ["هل لاتصال Amazon تكلفة إضافية؟", "لا. إنه مضمّن في كل خطط NivaDesk، بما فيها Free. تدفع فقط ثمن الخطة التي تختارها."],
    ["لماذا لا أستطيع الاتصال بعد؟", "لا تزال Amazon تراجع تطبيق NivaDesk الموجود في حالة Draft. وحتى توافق Amazon عليه، لا يستطيع البائعون الآخرون إكمال صفحة الموافقة لدى Amazon. بعد الموافقة يُفعَّل زر Connect في Settings › Integrations تلقائيًا."],
    ["ما المتاجر المدعومة؟", "متاجر منطقة أوروبا: المملكة المتحدة وألمانيا وفرنسا وإيطاليا وإسبانيا وهولندا والسويد وبولندا وتركيا والإمارات العربية المتحدة والهند. متاجر المناطق الأخرى غير متاحة بعد."]
  ]
};

const HI: AmazonSellerPageCopy = {
  heroTitle: "Amazon ऑर्डर, ऐसे काम में बदलें जिसकी योजना बनाई जा सके।",
  heroIntro: "NivaDesk ऑर्डर पर बनाने, हाथ से बनाने और रिपेयर करने वाले व्यवसायों के लिए ऑर्डर मैनेजमेंट है। Amazon कनेक्शन आपके Amazon ऑर्डर को आपके बाकी काम वाली सूची में ही ले आता है, ताकि हर बिक्री स्थिति, नियत तारीख और नोट्स वाला काम बन जाए — Seller Central से दोबारा टाइप किए बिना।",
  ctaStart: "मुफ़्त वर्कस्पेस बनाएँ",
  heroFacts: ["केवल पढ़ना: Amazon में कुछ भी नहीं लिखा जाता", "हर 30 मिनट में जाँच", "Free सहित हर प्लान में शामिल"],
  mockLabel: "चित्रण: NivaDesk की ऑर्डर सूची जिसमें एक इम्पोर्ट किया गया Amazon ऑर्डर है, और उस ऑर्डर पर दिखने वाली Amazon जानकारी।",
  mockCaption: "उदाहरण उत्पादों वाला चित्रण। ये असली ऑर्डर नहीं हैं।",
  mockOrdersTitle: "ऑर्डर",
  mockItems: ["अखरोट की लकड़ी का पर्सनलाइज़्ड यादगार बॉक्स", "उत्कीर्ण पीतल का पालतू टैग", "घड़ी का स्ट्रैप बदलना"],
  mockManual: "हाथ से जोड़ा गया",
  mockStatusNew: "नया",
  mockStatusMaking: "उत्पादन में",
  mockStatusCancelled: "रद्द",
  mockPlatformStatus: "प्लेटफ़ॉर्म स्थिति",
  mockPayment: "भुगतान",
  mockProduction: "आपकी स्थिति",
  mockOpen: "Seller Central में खोलें",
  jobsTitle: "यह क्या आसान बनाता है",
  jobsIntro: "उन छोटी वर्कशॉप के लिए जो अपने काम का कुछ हिस्सा Amazon पर बेचती हैं और उसे खुद बनाती, पर्सनलाइज़ करती या रिपेयर करती हैं।",
  jobs: [
    ["ऑर्डर पर बना सामान सीधे वर्कबेंच तक", "Amazon की बिक्री एक NivaDesk ऑर्डर के रूप में आती है, जिसमें आइटम के नाम और मात्रा, आपके सामान्य समय के अनुसार नियत तारीख और प्रोडक्शन नोट्स की जगह होती है।"],
    ["बिक्री के हर तरीके के लिए एक सूची", "Amazon ऑर्डर आपके खुद जोड़े गए ऑर्डर के साथ दिखते हैं, हर एक पर लिखा होता है कि वह कहाँ से आया — आप दो टैब के बजाय एक सूची से हफ़्ते की योजना बनाते हैं।"],
    ["काम शुरू करने से पहले रद्दीकरण", "जब खरीदार Amazon पर ऑर्डर रद्द करता है, अगली जाँच NivaDesk ऑर्डर को रद्द में ले जाती है और ऑर्डर के इतिहास में दर्ज करती है — आप ऐसी चीज़ नहीं बनाते जिसे कोई नहीं लेगा।"],
    ["एक क्लिक में वापस Amazon पर", "हर इम्पोर्ट किया गया ऑर्डर अपना Amazon ऑर्डर नंबर और एक लिंक रखता है जो वही ऑर्डर Seller Central में खोलता है, जहाँ डिलीवरी की जानकारी होती है।"]
  ],
  fieldsTitle: "NivaDesk हर ऑर्डर से क्या पढ़ता है",
  fieldsIntro: "NivaDesk Amazon से केवल यही फ़ील्ड लेता है। Amazon के जवाब की बाकी हर चीज़ अलग NivaDesk Amazon सेवा से बाहर जाने से पहले हटा दी जाती है।",
  fieldsOrderTitle: "ऑर्डर",
  fieldsOrder: [
    "Amazon ऑर्डर ID",
    "मार्केटप्लेस (जैसे Amazon.in)",
    "ऑर्डर की तारीख और आखिरी अपडेट",
    "ऑर्डर स्थिति: लंबित, शिप नहीं हुआ, शिप हुआ, रद्द …",
    "Amazon द्वारा भेजा गया या आपके द्वारा",
    "शिपिंग सेवा स्तर",
    "ऑर्डर का कुल और मुद्रा"
  ],
  fieldsItemTitle: "हर आइटम",
  fieldsItem: [
    "उत्पाद का नाम",
    "ASIN और आपका सेलर SKU",
    "ऑर्डर की गई और शिप की गई मात्रा",
    "आइटम की कीमत, शिपिंग कीमत और प्रमोशन छूट",
    "कैश-ऑन-डिलीवरी शुल्क, अगर Amazon बताता है",
    "कंडीशन और कंडीशन नोट",
    "प्रमोशन ID"
  ],
  fieldsNotTitle: "नहीं पढ़ा जाता",
  fieldsNot: [
    "खरीदार का नाम, ईमेल पता और फ़ोन नंबर",
    "डिलीवरी और बिलिंग पते",
    "गिफ़्ट संदेश और गिफ़्ट रैप",
    "Amazon की टैक्स जानकारी",
    "Amazon शुल्क, सेटलमेंट और भुगतान",
    "स्टॉक स्तर, FBA इन्वेंट्री और आपका प्रोडक्ट कैटलॉग"
  ],
  fieldsShown: "NivaDesk में हर इम्पोर्ट किए गए ऑर्डर पर Amazon बैज, Amazon ऑर्डर नंबर, Amazon पर उसकी स्थिति और भुगतान की स्थिति, कुल राशि और Seller Central में ऑर्डर का लिंक दिखता है। ग्राहक “Amazon Customer” के रूप में दिखता है।",
  syncTitle: "सिंक कैसे काम करता है",
  syncIntro: "ऑर्डर केवल एक दिशा में जाते हैं: Amazon से आपके वर्कस्पेस में।",
  syncNodes: [
    ["Amazon", "Seller Central में आपके ऑर्डर"],
    ["NivaDesk Amazon सेवा", "लंदन में एक अलग Google Cloud प्रोजेक्ट। यह Amazon से ऑर्डर माँगता है और हर निजी जानकारी हटा देता है।"],
    ["आपका वर्कस्पेस", "ऑर्डर आपकी ऑर्डर सूची में दिखते हैं"]
  ],
  syncArrowRead: "हर 30 मिनट में ऑर्डर पढ़े जाते हैं",
  syncArrowSend: "केवल ऑर्डर फ़ील्ड",
  syncFacts: [
    ["हर 30 मिनट", "NivaDesk दिन-रात पिछली जाँच के बाद आए नए या बदले हुए ऑर्डर देखता है। नया Amazon ऑर्डर आमतौर पर लगभग आधे घंटे में दिख जाता है।"],
    ["पहली जाँच", "कनेक्ट करने पर पहली जाँच पिछले 24 घंटे देखती है। उसके बाद से न बदले पुराने ऑर्डर नहीं लाए जाते।"],
    ["अपडेट, डुप्लिकेट नहीं", "जब Amazon किसी ऑर्डर को अपडेट करता है, तो वही NivaDesk ऑर्डर अपडेट होता है। रद्दीकरण उसे रद्द में ले जाता है।"],
    ["आपका काम आपका रहता है", "सिंक कभी भी NivaDesk में आपकी तय की गई स्थिति, नियत तारीख, नोट्स, असाइनमेंट या डिलीवर का निशान नहीं बदलता। स्थिति बदलने वाला Amazon का एकमात्र बदलाव रद्दीकरण है।"],
    ["व्यस्त दिन", "हर जाँच प्रति कनेक्टेड खाते 500 तक ऑर्डर लाती है; बाकी अगली जाँच में आते हैं।"],
    ["अगर एक्सेस खत्म हो जाए", "अगर Amazon NivaDesk का प्राधिकरण स्वीकार करना बंद कर दे, तो Settings में Amazon कार्ड यह बताता है और दोबारा कनेक्ट करने को कहता है। पहले से इम्पोर्ट हुए ऑर्डर बने रहते हैं।"]
  ],
  directionTitle: "Amazon से पढ़ता है। Amazon में कभी नहीं लिखता।",
  readsTitle: "Amazon से पढ़ता है",
  reads: [
    "आपके ऑर्डर और उनके आइटम — ऊपर बताए गए फ़ील्ड",
    "रद्दीकरण सहित ऑर्डर स्थिति के बदलाव",
    "आपका सेलर खाता किन मार्केटप्लेस में बेचता है"
  ],
  writesTitle: "Amazon में कभी नहीं लिखता",
  writes: [
    "लिस्टिंग, कीमत या स्टॉक में कोई बदलाव नहीं",
    "कोई शिपिंग पुष्टि या ट्रैकिंग नंबर नहीं",
    "खरीदारों को कोई संदेश नहीं",
    "आपके खाते पर कोई रिफ़ंड, रद्दीकरण या अन्य कार्रवाई नहीं"
  ],
  directionNote: "NivaDesk द्वारा Amazon के Selling Partner API को भेजा गया हर अनुरोध पढ़ने (GET) का अनुरोध है।",
  limitsTitle: "मौजूदा सीमाएँ",
  limits: [
    ["एक्सेस की समीक्षा जारी", "NivaDesk ऐप Amazon पर Draft स्थिति में है और मंज़ूरी का इंतज़ार कर रहा है। तब तक सेलर कनेक्शन पूरा नहीं कर सकते।"],
    ["केवल यूरोप क्षेत्र", "कनेक्शन Seller Central Europe से साइन इन करता है और Amazon के यूरोप क्षेत्र API से पढ़ता है। दूसरे क्षेत्रों के मार्केटप्लेस अभी उपलब्ध नहीं हैं।"],
    ["केवल ऑर्डर", "शुल्क, सेटलमेंट, स्टॉक, FBA इन्वेंट्री या प्रोडक्ट कैटलॉग नहीं।"],
    ["खरीदार की जानकारी नहीं", "खरीदार और प्राप्तकर्ता का डेटा नहीं माँगा जाता, इसलिए ऑर्डर बिना नाम और पते के आते हैं। डिलीवरी की जानकारी Seller Central में रहती है।"],
    ["NivaDesk से शुरू", "Amazon Appstore से प्राधिकरण अभी समर्थित नहीं है। NivaDesk में साइन इन करें और Settings › Integrations से कनेक्ट करें।"],
    ["केवल मालिक", "केवल वर्कस्पेस का मालिक Amazon को कनेक्ट या डिस्कनेक्ट कर सकता है।"]
  ],
  marketsIntro: "एक कनेक्शन उन यूरोप क्षेत्र के मार्केटप्लेस को कवर करता है जहाँ आपका सेलर खाता बेचता है। कनेक्ट करते समय Amazon NivaDesk को बताता है कि वे कौन-से हैं।",
  marketsNote: "यूरोप क्षेत्र के बाहर के मार्केटप्लेस अभी उपलब्ध नहीं हैं।",
  faqTitle: "सेलर जो पूछते हैं",
  faq: [
    ["क्या NivaDesk मेरे Amazon खाते में कुछ बदलता है?", "नहीं। NivaDesk द्वारा Amazon के Selling Partner API को भेजा गया हर अनुरोध पढ़ने का अनुरोध है। यह कभी लिस्टिंग, कीमत या स्टॉक नहीं बदलता, शिपमेंट की पुष्टि नहीं करता और खरीदारों को संदेश नहीं भेजता।"],
    ["नए Amazon ऑर्डर कितनी जल्दी दिखते हैं?", "NivaDesk हर 30 मिनट में जाँच करता है, इसलिए नया ऑर्डर आमतौर पर लगभग आधे घंटे में दिखता है। कनेक्ट करने के बाद पहली जाँच पिछले 24 घंटे देखती है।"],
    ["अगर खरीदार ऑर्डर रद्द कर दे तो क्या होता है?", "अगली जाँच में मेल खाने वाला NivaDesk ऑर्डर रद्द में चला जाता है और बदलाव उसके इतिहास में दर्ज होता है। कुछ भी डिलीट नहीं होता।"],
    ["क्या Amazon मेरी तय की गई स्थिति बदल देगा?", "नहीं। आपकी स्थिति, नियत तारीख, नोट्स, असाइनमेंट और डिलीवर का निशान सिंक से कभी नहीं बदलते। एकमात्र अपवाद Amazon पर रद्दीकरण है: वह ऑर्डर को रद्द कर देता है।"],
    ["मुझे खरीदार का नाम और पता क्यों नहीं दिखता?", "NivaDesk Amazon का खरीदार और प्राप्तकर्ता डेटा नहीं माँगता, इसलिए इम्पोर्ट किए गए ऑर्डर बिना पते के “Amazon Customer” दिखाते हैं। ऑर्डर पर दिए लिंक से उसे Seller Central में खोलें, जहाँ डिलीवरी की जानकारी है।"],
    ["क्या Amazon कनेक्शन के लिए अलग से भुगतान करना होता है?", "नहीं। यह Free सहित हर NivaDesk प्लान में शामिल है। आप केवल अपने चुने हुए प्लान का भुगतान करते हैं।"],
    ["मैं अभी कनेक्ट क्यों नहीं कर सकता?", "Amazon अभी भी NivaDesk ऐप की समीक्षा कर रहा है, जो Draft स्थिति में है। जब तक Amazon इसे मंज़ूरी नहीं देता, दूसरे सेलर Amazon की सहमति स्क्रीन पूरी नहीं कर सकते। मंज़ूरी के बाद Settings › Integrations में Connect बटन अपने आप चालू हो जाता है।"],
    ["कौन-से मार्केटप्लेस समर्थित हैं?", "यूरोप क्षेत्र के मार्केटप्लेस: यूनाइटेड किंगडम, जर्मनी, फ़्रांस, इटली, स्पेन, नीदरलैंड, स्वीडन, पोलैंड, तुर्की, संयुक्त अरब अमीरात और भारत। दूसरे क्षेत्रों के मार्केटप्लेस अभी उपलब्ध नहीं हैं।"]
  ]
};

export const AMAZON_SELLER_PAGE_COPY: Record<StudioLanguage, AmazonSellerPageCopy> = {
  English: EN,
  Türkçe: TR,
  Deutsch: DE,
  Français: FR,
  Italiano: IT,
  "Español (Spanish)": ES,
  Português: PT,
  "Русский (Russian)": RU,
  "日本語 (Japanese)": JA,
  "中文 (Chinese)": ZH,
  "العربية (Arabic)": AR,
  "हिन्दी (Hindi)": HI
};
