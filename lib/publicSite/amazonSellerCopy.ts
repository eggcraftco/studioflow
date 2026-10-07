import type { StudioLanguage } from "@/lib/studioflow/language";

/**
 * The public page for Amazon sellers (/integrations/amazon), written for the
 * Selling Partner Appstore review (case 22144456961, 5 October 2026: "a website
 * URL that provides details about the services your app offers to Amazon
 * Sellers … pricing, functions details, and other features").
 *
 * Every sentence states something the code does today; the commit that adds
 * this file lists the evidence claim by claim. When the
 * connector changes — Amazon publishes the app (SP_API_DRAFT goes away), a new
 * regional sign-in is switched on, a new dataset is requested — change this
 * file on the same day.
 *
 *   - Status "Access under review": the zone runs with SP_API_DRAFT=1, so a
 *     third-party seller cannot finish Amazon's consent screen
 *     (functions-amazon/deploy/service-oauth.yaml; web AmazonIntegrationSection
 *     keeps Connect disabled until the server reports "published").
 *   - Read-only: the SP-API client sends GET requests only
 *     (functions-amazon/src/amazon/client.js).
 *   - No buyer data: BUYER and RECIPIENT are never requested
 *     (functions-amazon/src/amazon/sanitize.js INCLUDED_DATA_A1).
 *   - Region: consent starts at sellercentral-europe.amazon.com and reads the
 *     Europe-region API (service-oauth.yaml SELLER_CENTRAL_HOST, SP_API_REGION).
 *   - Pricing: no plan gate on amazonConnectStart; plans from
 *     lib/studioflow/plans.ts.
 *
 * Its own table, keyed by language, rather than ~70 more keys in
 * translations.ts: the Record type makes a missing language a compile error,
 * and nothing here is split across tables (see translation-merge-order).
 * Brand names (NivaDesk, Amazon, Seller Central, Google Cloud) stay untranslated.
 */

type Pair = readonly [title: string, body: string];

export type AmazonSellerCopy = {
  eyebrow: string;
  title: string;
  intro: string;
  ctaPricing: string;
  ctaContact: string;
  statusLabel: string;
  statusTitle: string;
  statusBody: string;
  doesTitle: string;
  does: readonly Pair[];
  doesNotTitle: string;
  doesNot: readonly string[];
  connectTitle: string;
  connectSteps: readonly Pair[];
  connectDisconnect: string;
  connectAppstore: string;
  marketsTitle: string;
  marketsIntro: string;
  regionEurope: string;
  regionNorthAmerica: string;
  regionFarEast: string;
  marketsNote: string;
  marketsSignInLive: string;
  marketsSignInLater: string;
  pricingTitle: string;
  pricingIntro: string;
  pricingTrial: string;
  planFree: string;
  perMonth: string;
  perYear: string;
  planFreeNote: string;
  planStarterNote: string;
  planProNote: string;
  planTeamNote: string;
  extraSeat: string;
  includesAmazon: string;
  pricingLink: string;
  dataTitle: string;
  data: readonly Pair[];
  legalTitle: string;
  linkPrivacy: string;
  linkTerms: string;
  linkSecurity: string;
  linkSubprocessors: string;
  linkDeletion: string;
  contactTitle: string;
  contactBody: string;
  contactEmailLabel: string;
  contactPage: string;
  company: string;
  trademark: string;
};

const EN: AmazonSellerCopy = {
  eyebrow: "NivaDesk for Amazon sellers",
  title: "Your Amazon orders, in the same place as the work behind them.",
  intro: "NivaDesk is order management software for custom-order, repair and service businesses. The NivaDesk Amazon connection reads your Amazon orders into your NivaDesk workspace, next to the orders from your other sales channels, so you can plan, make and dispatch them in one place.",
  ctaPricing: "See pricing",
  ctaContact: "Contact us",
  statusLabel: "Access under review",
  statusTitle: "Current status",
  statusBody: "The NivaDesk app is waiting for Amazon's approval and is still in Draft status at Amazon. Until Amazon approves it, sellers cannot complete the connection. Once it is approved, the Connect button in NivaDesk becomes available on its own; there is nothing to install.",
  doesTitle: "What the Amazon connection does",
  does: [
    ["Read-only order import", "NivaDesk reads your Amazon orders: order number, marketplace, order status, payment status, order total, shipping and discounts, and the title and quantity of each item."],
    ["Regular updates", "New and changed orders are checked every 30 minutes, including cancellations."],
    ["One order list for every channel", "Amazon orders appear in your NivaDesk order list next to orders from your other channels and the ones you add yourself, with Amazon shown as their source."],
    ["Production tracking", "Each Amazon order becomes a NivaDesk order with its own production status, due date, notes and dispatch details, so you can see what to make and send next."],
    ["Profit per order", "Amazon orders count in NivaDesk's finance figures like any other sale. Amazon's fees and tax amounts are not imported, so profit uses the fee percentage and tax settings in your workspace."]
  ],
  doesNotTitle: "What it does not do",
  doesNot: [
    "It never changes your Amazon listings, prices or stock. NivaDesk only sends read requests to Amazon; nothing is written back to your Amazon account.",
    "It does not request buyer or recipient data such as names, addresses, email addresses or phone numbers. If a response contains any, it is removed and that order is not stored.",
    "It does not import Amazon fees, settlements, FBA inventory or your product catalogue.",
    "It does not message your buyers or take any action on Amazon for you."
  ],
  connectTitle: "How connecting works",
  connectSteps: [
    ["The workspace owner starts it", "In NivaDesk, open Settings › Integrations › Amazon. Only the workspace owner can connect or disconnect Amazon; team members can see whether the connection is working."],
    ["You approve on Amazon", "NivaDesk sends you to Amazon's own consent page in Seller Central. NivaDesk never sees your Amazon password."],
    ["Orders arrive", "NivaDesk finds the marketplaces your account sells in and starts bringing in your orders."]
  ],
  connectDisconnect: "You can disconnect at any time from the same screen: syncing stops and the stored Amazon authorisation is deleted. Orders already imported stay in your workspace.",
  connectAppstore: "The connection is started from NivaDesk. If you arrive from the Amazon Appstore, sign in or create a free workspace, then connect from Settings › Integrations.",
  marketsTitle: "Amazon marketplaces",
  marketsIntro: "NivaDesk recognises orders from these 18 Amazon marketplaces, grouped by Amazon's API region. Amazon authorises an app per region, so each NivaDesk connection covers the marketplaces of one region.",
  regionEurope: "Europe region",
  regionNorthAmerica: "North America region",
  regionFarEast: "Far East region",
  marketsNote: "Today the connection signs in through Seller Central Europe (sellercentral-europe.amazon.com) and reads from Amazon's Europe-region API. Other marketplaces in this list are recognised in orders from an account connected this way; signing in through their own regional Seller Central is not switched on yet.",
  marketsSignInLive: "Sign-in through Seller Central Europe",
  marketsSignInLater: "Regional sign-in not switched on yet",
  pricingTitle: "Pricing",
  pricingIntro: "The Amazon connection has no separate price and is not limited to a plan: it is included on every NivaDesk plan, including Free. Prices are in pounds sterling (GBP).",
  pricingTrial: "Every paid plan can start with a 14-day free trial, with no card required.",
  planFree: "Free",
  perMonth: "per month",
  perYear: "per year",
  planFreeNote: "10 active orders (delivered and deleted don't count) · unlimited customers · 1 user",
  planStarterNote: "Unlimited orders and customers · 250 MB storage · 1 user",
  planProNote: "Everything in Starter, plus advanced finance, Client Files and bank feed · 10 GB storage · 1 user",
  planTeamNote: "Everything in Pro, plus team access with 5 seats included (up to 10) · 50 GB storage",
  extraSeat: "Extra Team seat: £5 per month or £50 per year.",
  includesAmazon: "Amazon connection included",
  pricingLink: "See full plan details",
  dataTitle: "Data and security",
  data: [
    ["What NivaDesk reads", "Order data only: order and item details, amounts, statuses and dates, plus the list of marketplaces your account sells in. Buyer and recipient data is not requested."],
    ["Where it is kept", "Amazon data is handled in a separate Google Cloud project used only for the Amazon connection, in London (europe-west2). Your Amazon authorisation is kept in Google Secret Manager."],
    ["How it is protected", "Connections use HTTPS (TLS), and Google Cloud encrypts stored data at rest. The Amazon service can only call Amazon's own endpoints and NivaDesk's import endpoint, and only fields on a fixed allowlist are passed into your workspace."],
    ["Who can see it", "Imported orders are visible only to members of your workspace. Team members can see whether the connection is working, but not its details."],
    ["Deleting it", "Disconnecting deletes the stored Amazon authorisation. You can delete imported orders, or your whole account, at any time."]
  ],
  legalTitle: "Policies",
  linkPrivacy: "Privacy Policy",
  linkTerms: "Terms of Service",
  linkSecurity: "Security overview",
  linkSubprocessors: "Subprocessors",
  linkDeletion: "Account deletion",
  contactTitle: "Questions and support",
  contactBody: "Write to us by email or through the contact page, and we will reply.",
  contactEmailLabel: "Email",
  contactPage: "Contact page",
  company: "NivaDesk is made by EGGCRAFT LIMITED, registered in England and Wales, company number 16566512.",
  trademark: "Amazon and Seller Central are trademarks of Amazon.com, Inc. or its affiliates. NivaDesk is an independent product and is not affiliated with or endorsed by Amazon."
};

const TR: AmazonSellerCopy = {
  eyebrow: "Amazon satıcıları için NivaDesk",
  title: "Amazon siparişleriniz, arkasındaki işle aynı yerde.",
  intro: "NivaDesk; özel sipariş, onarım ve hizmet işletmeleri için sipariş yönetimi yazılımıdır. NivaDesk Amazon bağlantısı, Amazon siparişlerinizi diğer satış kanallarınızdan gelen siparişlerin yanına, NivaDesk çalışma alanınıza okur; böylece onları tek yerde planlayabilir, üretebilir ve gönderebilirsiniz.",
  ctaPricing: "Fiyatları gör",
  ctaContact: "Bize ulaşın",
  statusLabel: "Erişim inceleniyor",
  statusTitle: "Güncel durum",
  statusBody: "NivaDesk uygulaması Amazon'un onayını bekliyor ve Amazon'da hâlâ Taslak (Draft) durumunda. Amazon onaylayana kadar satıcılar bağlantıyı tamamlayamaz. Onaylandığında NivaDesk'teki Bağlan düğmesi kendiliğinden kullanılabilir olur; kurulacak bir şey yoktur.",
  doesTitle: "Amazon bağlantısı ne yapar",
  does: [
    ["Salt okunur sipariş aktarımı", "NivaDesk Amazon siparişlerinizi okur: sipariş numarası, pazar yeri, sipariş durumu, ödeme durumu, sipariş toplamı, kargo ve indirimler ile her ürünün adı ve adedi."],
    ["Düzenli güncelleme", "Yeni ve değişen siparişler, iptaller dahil, her 30 dakikada bir kontrol edilir."],
    ["Tüm kanallar için tek sipariş listesi", "Amazon siparişleri, NivaDesk sipariş listenizde diğer kanallarınızdan gelen ve kendi eklediğiniz siparişlerin yanında, kaynağı Amazon olarak görünür."],
    ["Üretim takibi", "Her Amazon siparişi; kendi üretim durumu, teslim tarihi, notları ve gönderim bilgileri olan bir NivaDesk siparişine dönüşür. Böylece sırada neyi üretip göndereceğinizi görürsünüz."],
    ["Sipariş başına kâr", "Amazon siparişleri, NivaDesk'in finans rakamlarında diğer satışlar gibi sayılır. Amazon ücretleri ve vergi tutarları aktarılmaz; bu yüzden kâr, çalışma alanınızdaki ücret yüzdesi ve vergi ayarlarıyla hesaplanır."]
  ],
  doesNotTitle: "Ne yapmaz",
  doesNot: [
    "Amazon ilanlarınızı, fiyatlarınızı veya stokunuzu asla değiştirmez. NivaDesk Amazon'a yalnızca okuma istekleri gönderir; Amazon hesabınıza hiçbir şey geri yazılmaz.",
    "Ad, adres, e-posta adresi veya telefon numarası gibi alıcı ya da teslim alan verisi istemez. Bir yanıtta böyle bir veri gelirse çıkarılır ve o sipariş saklanmaz.",
    "Amazon ücretlerini, hesap kesimlerini, FBA envanterini veya ürün kataloğunuzu aktarmaz.",
    "Alıcılarınıza mesaj göndermez ve sizin adınıza Amazon'da hiçbir işlem yapmaz."
  ],
  connectTitle: "Bağlantı nasıl kurulur",
  connectSteps: [
    ["Çalışma alanı sahibi başlatır", "NivaDesk'te Ayarlar › Entegrasyonlar › Amazon'u açın. Amazon'u yalnızca çalışma alanı sahibi bağlayabilir veya bağlantısını kesebilir; ekip üyeleri bağlantının çalışıp çalışmadığını görebilir."],
    ["Amazon'da onaylarsınız", "NivaDesk sizi Seller Central'daki Amazon'un kendi onay sayfasına yönlendirir. NivaDesk Amazon şifrenizi hiçbir zaman görmez."],
    ["Siparişler gelir", "NivaDesk hesabınızın satış yaptığı pazar yerlerini bulur ve siparişlerinizi getirmeye başlar."]
  ],
  connectDisconnect: "Bağlantıyı aynı ekrandan istediğiniz zaman kesebilirsiniz: eşitleme durur ve saklanan Amazon yetkisi silinir. Daha önce aktarılan siparişler çalışma alanınızda kalır.",
  connectAppstore: "Bağlantı NivaDesk'ten başlatılır. Amazon Appstore'dan geldiyseniz giriş yapın veya ücretsiz bir çalışma alanı oluşturun, ardından Ayarlar › Entegrasyonlar'dan bağlanın.",
  marketsTitle: "Amazon pazar yerleri",
  marketsIntro: "NivaDesk, Amazon'un API bölgelerine göre gruplanmış bu 18 Amazon pazar yerinden gelen siparişleri tanır. Amazon bir uygulamayı bölge bazında yetkilendirir; bu yüzden her NivaDesk bağlantısı tek bir bölgenin pazar yerlerini kapsar.",
  regionEurope: "Avrupa bölgesi",
  regionNorthAmerica: "Kuzey Amerika bölgesi",
  regionFarEast: "Uzak Doğu bölgesi",
  marketsNote: "Bugün bağlantı Seller Central Europe (sellercentral-europe.amazon.com) üzerinden oturum açar ve Amazon'un Avrupa bölgesi API'sinden okur. Listedeki diğer pazar yerleri, bu şekilde bağlanan bir hesabın siparişlerinde tanınır; kendi bölgesel Seller Central'ları üzerinden oturum açma henüz açılmadı.",
  marketsSignInLive: "Seller Central Europe üzerinden oturum açma",
  marketsSignInLater: "Bölgesel oturum açma henüz açılmadı",
  pricingTitle: "Fiyatlandırma",
  pricingIntro: "Amazon bağlantısının ayrı bir ücreti yoktur ve bir plana bağlı değildir: Free dahil her NivaDesk planında vardır. Fiyatlar İngiliz sterlini (GBP) cinsindendir.",
  pricingTrial: "Her ücretli plan, kart gerekmeden 14 günlük ücretsiz denemeyle başlayabilir.",
  planFree: "Free",
  perMonth: "aylık",
  perYear: "yıllık",
  planFreeNote: "10 aktif sipariş (teslim edilen ve silinenler sayılmaz) · sınırsız müşteri · 1 kullanıcı",
  planStarterNote: "Sınırsız sipariş ve müşteri · 250 MB depolama · 1 kullanıcı",
  planProNote: "Starter'daki her şey, artı gelişmiş finans, Client Files ve banka akışı · 10 GB depolama · 1 kullanıcı",
  planTeamNote: "Pro'daki her şey, artı 5 koltuk dahil ekip erişimi (10'a kadar) · 50 GB depolama",
  extraSeat: "Ek Team koltuğu: aylık £5 veya yıllık £50.",
  includesAmazon: "Amazon bağlantısı dahil",
  pricingLink: "Plan ayrıntılarının tamamını gör",
  dataTitle: "Veri ve güvenlik",
  data: [
    ["NivaDesk neyi okur", "Yalnızca sipariş verisi: sipariş ve ürün ayrıntıları, tutarlar, durumlar ve tarihler, ayrıca hesabınızın satış yaptığı pazar yerlerinin listesi. Alıcı ve teslim alan verisi istenmez."],
    ["Nerede tutulur", "Amazon verisi, yalnızca Amazon bağlantısı için kullanılan ayrı bir Google Cloud projesinde, Londra'da (europe-west2) işlenir. Amazon yetkiniz Google Secret Manager'da tutulur."],
    ["Nasıl korunur", "Bağlantılar HTTPS (TLS) kullanır ve Google Cloud saklanan verileri bekleme sırasında şifreler. Amazon hizmeti yalnızca Amazon'un kendi uç noktalarını ve NivaDesk'in aktarım uç noktasını çağırabilir; çalışma alanınıza yalnızca sabit bir izin listesindeki alanlar geçer."],
    ["Kim görebilir", "Aktarılan siparişleri yalnızca çalışma alanınızın üyeleri görebilir. Ekip üyeleri bağlantının çalışıp çalışmadığını görür, ayrıntılarını görmez."],
    ["Silme", "Bağlantıyı kesmek saklanan Amazon yetkisini siler. Aktarılan siparişleri veya hesabınızın tamamını istediğiniz zaman silebilirsiniz."]
  ],
  legalTitle: "Politikalar",
  linkPrivacy: "Gizlilik Politikası",
  linkTerms: "Hizmet Koşulları",
  linkSecurity: "Güvenlik özeti",
  linkSubprocessors: "Alt işleyiciler",
  linkDeletion: "Hesap silme",
  contactTitle: "Sorular ve destek",
  contactBody: "Bize e-postayla veya iletişim sayfasından yazın, yanıt verelim.",
  contactEmailLabel: "E-posta",
  contactPage: "İletişim sayfası",
  company: "NivaDesk, İngiltere ve Galler'de 16566512 şirket numarasıyla kayıtlı EGGCRAFT LIMITED tarafından geliştirilir.",
  trademark: "Amazon ve Seller Central, Amazon.com, Inc. veya bağlı şirketlerinin ticari markalarıdır. NivaDesk bağımsız bir üründür; Amazon ile bağlantılı değildir ve Amazon tarafından onaylanmamıştır."
};

const DE: AmazonSellerCopy = {
  eyebrow: "NivaDesk für Amazon-Verkäufer",
  title: "Ihre Amazon-Bestellungen am selben Ort wie die Arbeit dahinter.",
  intro: "NivaDesk ist eine Auftragsverwaltung für Betriebe mit Sonderanfertigungen, Reparaturen und Dienstleistungen. Die NivaDesk-Amazon-Verbindung liest Ihre Amazon-Bestellungen in Ihren NivaDesk-Workspace ein, neben die Bestellungen Ihrer anderen Verkaufskanäle, damit Sie sie an einem Ort planen, fertigen und versenden können.",
  ctaPricing: "Preise ansehen",
  ctaContact: "Kontakt",
  statusLabel: "Zugang wird geprüft",
  statusTitle: "Aktueller Stand",
  statusBody: "Die NivaDesk-App wartet auf die Freigabe durch Amazon und hat bei Amazon noch den Status „Draft“ (Entwurf). Bis Amazon sie freigibt, können Verkäufer die Verbindung nicht abschließen. Nach der Freigabe wird die Schaltfläche „Verbinden“ in NivaDesk von selbst verfügbar; es muss nichts installiert werden.",
  doesTitle: "Was die Amazon-Verbindung tut",
  does: [
    ["Bestellimport nur lesend", "NivaDesk liest Ihre Amazon-Bestellungen: Bestellnummer, Marktplatz, Bestellstatus, Zahlungsstatus, Bestellsumme, Versand und Rabatte sowie Titel und Menge jedes Artikels."],
    ["Regelmäßige Aktualisierung", "Neue und geänderte Bestellungen werden alle 30 Minuten geprüft, einschließlich Stornierungen."],
    ["Eine Bestellliste für alle Kanäle", "Amazon-Bestellungen erscheinen in Ihrer NivaDesk-Bestellliste neben den Bestellungen aus Ihren anderen Kanälen und den selbst angelegten, mit Amazon als Quelle."],
    ["Produktionsverfolgung", "Jede Amazon-Bestellung wird zu einer NivaDesk-Bestellung mit eigenem Produktionsstatus, Fälligkeitsdatum, Notizen und Versanddaten, sodass Sie sehen, was als Nächstes gefertigt und verschickt wird."],
    ["Gewinn pro Bestellung", "Amazon-Bestellungen zählen in den Finanzzahlen von NivaDesk wie jeder andere Verkauf. Amazon-Gebühren und Steuerbeträge werden nicht importiert; der Gewinn verwendet daher den Gebührenprozentsatz und die Steuereinstellungen Ihres Workspace."]
  ],
  doesNotTitle: "Was sie nicht tut",
  doesNot: [
    "Sie ändert niemals Ihre Amazon-Angebote, Preise oder Bestände. NivaDesk sendet nur Leseanfragen an Amazon; in Ihr Amazon-Konto wird nichts zurückgeschrieben.",
    "Sie fordert keine Käufer- oder Empfängerdaten wie Namen, Adressen, E-Mail-Adressen oder Telefonnummern an. Enthält eine Antwort solche Daten, werden sie entfernt und diese Bestellung wird nicht gespeichert.",
    "Sie importiert keine Amazon-Gebühren, Abrechnungen, FBA-Bestände und nicht Ihren Produktkatalog.",
    "Sie schreibt Ihren Käufern keine Nachrichten und führt keine Aktionen auf Amazon für Sie aus."
  ],
  connectTitle: "So funktioniert das Verbinden",
  connectSteps: [
    ["Der Workspace-Inhaber startet", "Öffnen Sie in NivaDesk Einstellungen › Integrationen › Amazon. Nur der Workspace-Inhaber kann Amazon verbinden oder trennen; Teammitglieder sehen, ob die Verbindung funktioniert."],
    ["Sie bestätigen bei Amazon", "NivaDesk leitet Sie zur eigenen Zustimmungsseite von Amazon in Seller Central. NivaDesk sieht Ihr Amazon-Passwort nie."],
    ["Bestellungen kommen an", "NivaDesk ermittelt die Marktplätze, auf denen Ihr Konto verkauft, und beginnt, Ihre Bestellungen zu übernehmen."]
  ],
  connectDisconnect: "Sie können die Verbindung jederzeit auf demselben Bildschirm trennen: Die Synchronisierung stoppt und die gespeicherte Amazon-Autorisierung wird gelöscht. Bereits importierte Bestellungen bleiben in Ihrem Workspace.",
  connectAppstore: "Die Verbindung wird in NivaDesk gestartet. Wenn Sie aus dem Amazon Appstore kommen, melden Sie sich an oder erstellen Sie einen kostenlosen Workspace und verbinden Sie dann unter Einstellungen › Integrationen.",
  marketsTitle: "Amazon-Marktplätze",
  marketsIntro: "NivaDesk erkennt Bestellungen aus diesen 18 Amazon-Marktplätzen, gruppiert nach Amazons API-Region. Amazon autorisiert eine App pro Region, daher deckt jede NivaDesk-Verbindung die Marktplätze einer Region ab.",
  regionEurope: "Region Europa",
  regionNorthAmerica: "Region Nordamerika",
  regionFarEast: "Region Fernost",
  marketsNote: "Derzeit meldet sich die Verbindung über Seller Central Europe (sellercentral-europe.amazon.com) an und liest aus Amazons API für die Region Europa. Andere Marktplätze dieser Liste werden in Bestellungen eines so verbundenen Kontos erkannt; die Anmeldung über deren eigenes regionales Seller Central ist noch nicht freigeschaltet.",
  marketsSignInLive: "Anmeldung über Seller Central Europe",
  marketsSignInLater: "Regionale Anmeldung noch nicht freigeschaltet",
  pricingTitle: "Preise",
  pricingIntro: "Die Amazon-Verbindung kostet nichts extra und ist an keinen Tarif gebunden: Sie ist in jedem NivaDesk-Tarif enthalten, auch in Free. Preise in britischen Pfund (GBP).",
  pricingTrial: "Jeder kostenpflichtige Tarif kann mit einer 14-tägigen kostenlosen Testphase beginnen, ohne Karte.",
  planFree: "Free",
  perMonth: "pro Monat",
  perYear: "pro Jahr",
  planFreeNote: "10 aktive Bestellungen (gelieferte und gelöschte zählen nicht) · unbegrenzt Kunden · 1 Nutzer",
  planStarterNote: "Unbegrenzte Bestellungen und Kunden · 250 MB Speicher · 1 Nutzer",
  planProNote: "Alles aus Starter, dazu erweiterte Finanzen, Client Files und Bank-Feed · 10 GB Speicher · 1 Nutzer",
  planTeamNote: "Alles aus Pro, dazu Teamzugang mit 5 enthaltenen Plätzen (bis zu 10) · 50 GB Speicher",
  extraSeat: "Zusätzlicher Team-Platz: £5 pro Monat oder £50 pro Jahr.",
  includesAmazon: "Amazon-Verbindung enthalten",
  pricingLink: "Alle Tarifdetails ansehen",
  dataTitle: "Daten und Sicherheit",
  data: [
    ["Was NivaDesk liest", "Nur Bestelldaten: Bestell- und Artikeldetails, Beträge, Status und Daten sowie die Liste der Marktplätze, auf denen Ihr Konto verkauft. Käufer- und Empfängerdaten werden nicht angefordert."],
    ["Wo sie liegen", "Amazon-Daten werden in einem separaten Google-Cloud-Projekt verarbeitet, das nur für die Amazon-Verbindung genutzt wird, in London (europe-west2). Ihre Amazon-Autorisierung liegt in Google Secret Manager."],
    ["Wie sie geschützt sind", "Verbindungen nutzen HTTPS (TLS), und Google Cloud verschlüsselt gespeicherte Daten im Ruhezustand. Der Amazon-Dienst kann nur Amazons eigene Endpunkte und den Import-Endpunkt von NivaDesk aufrufen, und nur Felder einer festen Positivliste gelangen in Ihren Workspace."],
    ["Wer sie sieht", "Importierte Bestellungen sind nur für Mitglieder Ihres Workspace sichtbar. Teammitglieder sehen, ob die Verbindung funktioniert, aber nicht deren Details."],
    ["Löschen", "Das Trennen löscht die gespeicherte Amazon-Autorisierung. Importierte Bestellungen oder Ihr gesamtes Konto können Sie jederzeit löschen."]
  ],
  legalTitle: "Richtlinien",
  linkPrivacy: "Datenschutzerklärung",
  linkTerms: "Nutzungsbedingungen",
  linkSecurity: "Sicherheitsübersicht",
  linkSubprocessors: "Unterauftragsverarbeiter",
  linkDeletion: "Kontolöschung",
  contactTitle: "Fragen und Support",
  contactBody: "Schreiben Sie uns per E-Mail oder über die Kontaktseite, wir antworten Ihnen.",
  contactEmailLabel: "E-Mail",
  contactPage: "Kontaktseite",
  company: "NivaDesk wird von EGGCRAFT LIMITED entwickelt, eingetragen in England und Wales, Firmennummer 16566512.",
  trademark: "Amazon und Seller Central sind Marken von Amazon.com, Inc. oder seinen verbundenen Unternehmen. NivaDesk ist ein unabhängiges Produkt und steht in keiner Verbindung zu Amazon und wird nicht von Amazon unterstützt."
};

const FR: AmazonSellerCopy = {
  eyebrow: "NivaDesk pour les vendeurs Amazon",
  title: "Vos commandes Amazon, au même endroit que le travail qu'elles demandent.",
  intro: "NivaDesk est un logiciel de gestion des commandes pour les activités de commande sur mesure, de réparation et de service. La connexion Amazon de NivaDesk importe vos commandes Amazon dans votre espace de travail NivaDesk, à côté des commandes de vos autres canaux de vente, pour les planifier, les fabriquer et les expédier au même endroit.",
  ctaPricing: "Voir les tarifs",
  ctaContact: "Nous contacter",
  statusLabel: "Accès en cours d'examen",
  statusTitle: "Statut actuel",
  statusBody: "L'application NivaDesk attend l'approbation d'Amazon et est encore au statut Draft (brouillon) chez Amazon. Tant qu'Amazon ne l'a pas approuvée, les vendeurs ne peuvent pas finaliser la connexion. Une fois approuvée, le bouton Connecter de NivaDesk devient disponible de lui-même ; il n'y a rien à installer.",
  doesTitle: "Ce que fait la connexion Amazon",
  does: [
    ["Import des commandes en lecture seule", "NivaDesk lit vos commandes Amazon : numéro de commande, place de marché, statut de la commande, statut du paiement, total de la commande, livraison et remises, ainsi que le titre et la quantité de chaque article."],
    ["Mises à jour régulières", "Les commandes nouvelles et modifiées sont vérifiées toutes les 30 minutes, annulations comprises."],
    ["Une seule liste pour tous les canaux", "Les commandes Amazon apparaissent dans votre liste de commandes NivaDesk à côté de celles de vos autres canaux et de celles que vous ajoutez vous-même, avec Amazon comme source."],
    ["Suivi de production", "Chaque commande Amazon devient une commande NivaDesk avec son propre statut de production, sa date d'échéance, ses notes et ses informations d'expédition, pour voir ce qu'il faut fabriquer et envoyer ensuite."],
    ["Bénéfice par commande", "Les commandes Amazon comptent dans les chiffres financiers de NivaDesk comme toute autre vente. Les frais Amazon et les montants de taxe ne sont pas importés : le bénéfice utilise le pourcentage de frais et les réglages de taxe de votre espace."]
  ],
  doesNotTitle: "Ce qu'elle ne fait pas",
  doesNot: [
    "Elle ne modifie jamais vos annonces, prix ou stocks Amazon. NivaDesk n'envoie que des requêtes de lecture à Amazon ; rien n'est réécrit dans votre compte Amazon.",
    "Elle ne demande aucune donnée d'acheteur ou de destinataire, comme les noms, adresses, adresses e-mail ou numéros de téléphone. Si une réponse en contient, elles sont supprimées et cette commande n'est pas enregistrée.",
    "Elle n'importe ni les frais Amazon, ni les règlements, ni le stock FBA, ni votre catalogue de produits.",
    "Elle n'envoie aucun message à vos acheteurs et n'effectue aucune action sur Amazon à votre place."
  ],
  connectTitle: "Comment se connecter",
  connectSteps: [
    ["Le propriétaire de l'espace lance la connexion", "Dans NivaDesk, ouvrez Paramètres › Intégrations › Amazon. Seul le propriétaire de l'espace peut connecter ou déconnecter Amazon ; les membres de l'équipe voient si la connexion fonctionne."],
    ["Vous approuvez sur Amazon", "NivaDesk vous envoie vers la page de consentement d'Amazon dans Seller Central. NivaDesk ne voit jamais votre mot de passe Amazon."],
    ["Les commandes arrivent", "NivaDesk repère les places de marché sur lesquelles votre compte vend et commence à importer vos commandes."]
  ],
  connectDisconnect: "Vous pouvez vous déconnecter à tout moment depuis le même écran : la synchronisation s'arrête et l'autorisation Amazon enregistrée est supprimée. Les commandes déjà importées restent dans votre espace.",
  connectAppstore: "La connexion se lance depuis NivaDesk. Si vous arrivez depuis l'Amazon Appstore, connectez-vous ou créez un espace gratuit, puis connectez Amazon depuis Paramètres › Intégrations.",
  marketsTitle: "Places de marché Amazon",
  marketsIntro: "NivaDesk reconnaît les commandes de ces 18 places de marché Amazon, regroupées par région d'API Amazon. Amazon autorise une application par région ; chaque connexion NivaDesk couvre donc les places de marché d'une seule région.",
  regionEurope: "Région Europe",
  regionNorthAmerica: "Région Amérique du Nord",
  regionFarEast: "Région Extrême-Orient",
  marketsNote: "Aujourd'hui, la connexion passe par Seller Central Europe (sellercentral-europe.amazon.com) et lit l'API Amazon de la région Europe. Les autres places de marché de cette liste sont reconnues dans les commandes d'un compte connecté de cette façon ; la connexion via leur propre Seller Central régional n'est pas encore activée.",
  marketsSignInLive: "Connexion via Seller Central Europe",
  marketsSignInLater: "Connexion régionale pas encore activée",
  pricingTitle: "Tarifs",
  pricingIntro: "La connexion Amazon n'a pas de prix séparé et n'est réservée à aucune offre : elle est incluse dans toutes les offres NivaDesk, y compris Free. Prix en livres sterling (GBP).",
  pricingTrial: "Chaque offre payante peut commencer par un essai gratuit de 14 jours, sans carte.",
  planFree: "Free",
  perMonth: "par mois",
  perYear: "par an",
  planFreeNote: "10 commandes actives (livrées et supprimées non comptées) · clients illimités · 1 utilisateur",
  planStarterNote: "Commandes et clients illimités · 250 Mo de stockage · 1 utilisateur",
  planProNote: "Tout Starter, plus finances avancées, Client Files et flux bancaire · 10 Go de stockage · 1 utilisateur",
  planTeamNote: "Tout Pro, plus l'accès équipe avec 5 places incluses (jusqu'à 10) · 50 Go de stockage",
  extraSeat: "Place Team supplémentaire : 5 £ par mois ou 50 £ par an.",
  includesAmazon: "Connexion Amazon incluse",
  pricingLink: "Voir le détail des offres",
  dataTitle: "Données et sécurité",
  data: [
    ["Ce que NivaDesk lit", "Uniquement des données de commande : détails des commandes et des articles, montants, statuts et dates, ainsi que la liste des places de marché où votre compte vend. Les données d'acheteur et de destinataire ne sont pas demandées."],
    ["Où elles sont conservées", "Les données Amazon sont traitées dans un projet Google Cloud distinct, utilisé uniquement pour la connexion Amazon, à Londres (europe-west2). Votre autorisation Amazon est conservée dans Google Secret Manager."],
    ["Comment elles sont protégées", "Les connexions utilisent HTTPS (TLS) et Google Cloud chiffre les données stockées au repos. Le service Amazon ne peut appeler que les points d'accès d'Amazon et le point d'import de NivaDesk, et seuls les champs d'une liste autorisée fixe arrivent dans votre espace."],
    ["Qui peut les voir", "Les commandes importées ne sont visibles que par les membres de votre espace. Les membres de l'équipe voient si la connexion fonctionne, mais pas ses détails."],
    ["Suppression", "La déconnexion supprime l'autorisation Amazon enregistrée. Vous pouvez supprimer les commandes importées, ou tout votre compte, à tout moment."]
  ],
  legalTitle: "Politiques",
  linkPrivacy: "Politique de confidentialité",
  linkTerms: "Conditions d'utilisation",
  linkSecurity: "Présentation de la sécurité",
  linkSubprocessors: "Sous-traitants",
  linkDeletion: "Suppression du compte",
  contactTitle: "Questions et assistance",
  contactBody: "Écrivez-nous par e-mail ou via la page de contact, nous vous répondrons.",
  contactEmailLabel: "E-mail",
  contactPage: "Page de contact",
  company: "NivaDesk est édité par EGGCRAFT LIMITED, société immatriculée en Angleterre et au pays de Galles sous le numéro 16566512.",
  trademark: "Amazon et Seller Central sont des marques d'Amazon.com, Inc. ou de ses sociétés affiliées. NivaDesk est un produit indépendant, ni affilié à Amazon ni approuvé par Amazon."
};

const IT: AmazonSellerCopy = {
  eyebrow: "NivaDesk per i venditori Amazon",
  title: "I tuoi ordini Amazon, nello stesso posto del lavoro che richiedono.",
  intro: "NivaDesk è un software di gestione ordini per attività su commissione, di riparazione e di servizi. La connessione Amazon di NivaDesk legge i tuoi ordini Amazon nel tuo spazio di lavoro NivaDesk, accanto agli ordini degli altri canali di vendita, così puoi pianificarli, realizzarli e spedirli in un unico posto.",
  ctaPricing: "Vedi i prezzi",
  ctaContact: "Contattaci",
  statusLabel: "Accesso in revisione",
  statusTitle: "Stato attuale",
  statusBody: "L'app NivaDesk è in attesa dell'approvazione di Amazon ed è ancora in stato Draft (bozza) presso Amazon. Finché Amazon non la approva, i venditori non possono completare la connessione. Una volta approvata, il pulsante Connetti in NivaDesk diventa disponibile da solo; non c'è nulla da installare.",
  doesTitle: "Cosa fa la connessione Amazon",
  does: [
    ["Importazione ordini in sola lettura", "NivaDesk legge i tuoi ordini Amazon: numero d'ordine, marketplace, stato dell'ordine, stato del pagamento, totale dell'ordine, spedizione e sconti, e il titolo e la quantità di ogni articolo."],
    ["Aggiornamenti regolari", "Gli ordini nuovi e modificati vengono controllati ogni 30 minuti, comprese le cancellazioni."],
    ["Un solo elenco per tutti i canali", "Gli ordini Amazon compaiono nel tuo elenco ordini NivaDesk accanto a quelli degli altri canali e a quelli che aggiungi tu, con Amazon indicato come origine."],
    ["Monitoraggio della produzione", "Ogni ordine Amazon diventa un ordine NivaDesk con il proprio stato di produzione, data di scadenza, note e dati di spedizione, così vedi cosa realizzare e spedire dopo."],
    ["Profitto per ordine", "Gli ordini Amazon contano nei dati finanziari di NivaDesk come qualsiasi altra vendita. Commissioni Amazon e importi delle imposte non vengono importati, quindi il profitto usa la percentuale di commissione e le impostazioni fiscali del tuo spazio."]
  ],
  doesNotTitle: "Cosa non fa",
  doesNot: [
    "Non modifica mai le tue inserzioni, i prezzi o le scorte su Amazon. NivaDesk invia ad Amazon solo richieste di lettura; nulla viene riscritto nel tuo account Amazon.",
    "Non richiede dati di acquirenti o destinatari come nomi, indirizzi, indirizzi email o numeri di telefono. Se una risposta ne contiene, vengono rimossi e quell'ordine non viene salvato.",
    "Non importa commissioni Amazon, liquidazioni, inventario FBA né il tuo catalogo prodotti.",
    "Non invia messaggi ai tuoi acquirenti e non compie azioni su Amazon al posto tuo."
  ],
  connectTitle: "Come funziona la connessione",
  connectSteps: [
    ["La avvia il proprietario dello spazio", "In NivaDesk apri Impostazioni › Integrazioni › Amazon. Solo il proprietario dello spazio può connettere o disconnettere Amazon; i membri del team vedono se la connessione funziona."],
    ["Approvi su Amazon", "NivaDesk ti porta alla pagina di consenso di Amazon in Seller Central. NivaDesk non vede mai la tua password Amazon."],
    ["Arrivano gli ordini", "NivaDesk individua i marketplace in cui vende il tuo account e inizia a portare i tuoi ordini."]
  ],
  connectDisconnect: "Puoi disconnetterti in qualsiasi momento dalla stessa schermata: la sincronizzazione si ferma e l'autorizzazione Amazon salvata viene eliminata. Gli ordini già importati restano nel tuo spazio.",
  connectAppstore: "La connessione si avvia da NivaDesk. Se arrivi dall'Amazon Appstore, accedi o crea uno spazio gratuito, poi connettiti da Impostazioni › Integrazioni.",
  marketsTitle: "Marketplace Amazon",
  marketsIntro: "NivaDesk riconosce gli ordini di questi 18 marketplace Amazon, raggruppati per regione API di Amazon. Amazon autorizza un'app per regione, quindi ogni connessione NivaDesk copre i marketplace di una sola regione.",
  regionEurope: "Regione Europa",
  regionNorthAmerica: "Regione Nord America",
  regionFarEast: "Regione Estremo Oriente",
  marketsNote: "Oggi la connessione accede tramite Seller Central Europe (sellercentral-europe.amazon.com) e legge dall'API Amazon della regione Europa. Gli altri marketplace dell'elenco vengono riconosciuti negli ordini di un account connesso in questo modo; l'accesso tramite il loro Seller Central regionale non è ancora attivo.",
  marketsSignInLive: "Accesso tramite Seller Central Europe",
  marketsSignInLater: "Accesso regionale non ancora attivo",
  pricingTitle: "Prezzi",
  pricingIntro: "La connessione Amazon non ha un prezzo separato e non è limitata a un piano: è inclusa in ogni piano NivaDesk, compreso Free. Prezzi in sterline britanniche (GBP).",
  pricingTrial: "Ogni piano a pagamento può iniziare con una prova gratuita di 14 giorni, senza carta.",
  planFree: "Free",
  perMonth: "al mese",
  perYear: "all'anno",
  planFreeNote: "10 ordini attivi (consegnati ed eliminati non contano) · clienti illimitati · 1 utente",
  planStarterNote: "Ordini e clienti illimitati · 250 MB di spazio · 1 utente",
  planProNote: "Tutto di Starter, più finanza avanzata, Client Files e feed bancario · 10 GB di spazio · 1 utente",
  planTeamNote: "Tutto di Pro, più accesso del team con 5 posti inclusi (fino a 10) · 50 GB di spazio",
  extraSeat: "Posto Team aggiuntivo: £5 al mese o £50 all'anno.",
  includesAmazon: "Connessione Amazon inclusa",
  pricingLink: "Vedi tutti i dettagli dei piani",
  dataTitle: "Dati e sicurezza",
  data: [
    ["Cosa legge NivaDesk", "Solo dati degli ordini: dettagli di ordini e articoli, importi, stati e date, più l'elenco dei marketplace in cui vende il tuo account. I dati di acquirenti e destinatari non vengono richiesti."],
    ["Dove sono conservati", "I dati Amazon sono trattati in un progetto Google Cloud separato, usato solo per la connessione Amazon, a Londra (europe-west2). La tua autorizzazione Amazon è conservata in Google Secret Manager."],
    ["Come sono protetti", "Le connessioni usano HTTPS (TLS) e Google Cloud cifra i dati archiviati a riposo. Il servizio Amazon può chiamare solo gli endpoint di Amazon e l'endpoint di importazione di NivaDesk, e nel tuo spazio passano solo i campi di un elenco consentito fisso."],
    ["Chi può vederli", "Gli ordini importati sono visibili solo ai membri del tuo spazio. I membri del team vedono se la connessione funziona, ma non i suoi dettagli."],
    ["Eliminazione", "La disconnessione elimina l'autorizzazione Amazon salvata. Puoi eliminare gli ordini importati, o l'intero account, in qualsiasi momento."]
  ],
  legalTitle: "Informative",
  linkPrivacy: "Informativa sulla privacy",
  linkTerms: "Termini di servizio",
  linkSecurity: "Panoramica sulla sicurezza",
  linkSubprocessors: "Sub-responsabili",
  linkDeletion: "Eliminazione dell'account",
  contactTitle: "Domande e assistenza",
  contactBody: "Scrivici via email o dalla pagina contatti e ti risponderemo.",
  contactEmailLabel: "Email",
  contactPage: "Pagina contatti",
  company: "NivaDesk è realizzato da EGGCRAFT LIMITED, registrata in Inghilterra e Galles, numero di società 16566512.",
  trademark: "Amazon e Seller Central sono marchi di Amazon.com, Inc. o delle sue affiliate. NivaDesk è un prodotto indipendente, non affiliato ad Amazon né approvato da Amazon."
};

const ES: AmazonSellerCopy = {
  eyebrow: "NivaDesk para vendedores de Amazon",
  title: "Tus pedidos de Amazon, en el mismo lugar que el trabajo que hay detrás.",
  intro: "NivaDesk es un software de gestión de pedidos para negocios de encargos personalizados, reparaciones y servicios. La conexión de Amazon de NivaDesk lee tus pedidos de Amazon en tu espacio de trabajo de NivaDesk, junto a los pedidos de tus otros canales de venta, para que los planifiques, fabriques y envíes en un solo lugar.",
  ctaPricing: "Ver precios",
  ctaContact: "Contáctanos",
  statusLabel: "Acceso en revisión",
  statusTitle: "Estado actual",
  statusBody: "La aplicación NivaDesk está esperando la aprobación de Amazon y todavía está en estado Draft (borrador) en Amazon. Hasta que Amazon la apruebe, los vendedores no pueden completar la conexión. Una vez aprobada, el botón Conectar de NivaDesk se activará por sí solo; no hay nada que instalar.",
  doesTitle: "Qué hace la conexión con Amazon",
  does: [
    ["Importación de pedidos de solo lectura", "NivaDesk lee tus pedidos de Amazon: número de pedido, marketplace, estado del pedido, estado del pago, total del pedido, envío y descuentos, y el título y la cantidad de cada artículo."],
    ["Actualizaciones periódicas", "Los pedidos nuevos y modificados se comprueban cada 30 minutos, incluidas las cancelaciones."],
    ["Una sola lista para todos los canales", "Los pedidos de Amazon aparecen en tu lista de pedidos de NivaDesk junto a los de tus otros canales y los que añades tú, con Amazon como origen."],
    ["Seguimiento de producción", "Cada pedido de Amazon se convierte en un pedido de NivaDesk con su propio estado de producción, fecha de entrega, notas y datos de envío, para que veas qué fabricar y enviar a continuación."],
    ["Beneficio por pedido", "Los pedidos de Amazon cuentan en las cifras financieras de NivaDesk como cualquier otra venta. Las comisiones de Amazon y los importes de impuestos no se importan, así que el beneficio usa el porcentaje de comisión y los ajustes de impuestos de tu espacio."]
  ],
  doesNotTitle: "Qué no hace",
  doesNot: [
    "Nunca cambia tus anuncios, precios ni existencias de Amazon. NivaDesk solo envía solicitudes de lectura a Amazon; no se escribe nada en tu cuenta de Amazon.",
    "No solicita datos de compradores ni destinatarios, como nombres, direcciones, correos electrónicos o teléfonos. Si una respuesta contiene alguno, se elimina y ese pedido no se guarda.",
    "No importa comisiones de Amazon, liquidaciones, inventario FBA ni tu catálogo de productos.",
    "No envía mensajes a tus compradores ni realiza acciones en Amazon por ti."
  ],
  connectTitle: "Cómo funciona la conexión",
  connectSteps: [
    ["La inicia el propietario del espacio", "En NivaDesk, abre Ajustes › Integraciones › Amazon. Solo el propietario del espacio puede conectar o desconectar Amazon; los miembros del equipo pueden ver si la conexión funciona."],
    ["Lo apruebas en Amazon", "NivaDesk te lleva a la página de consentimiento de Amazon en Seller Central. NivaDesk nunca ve tu contraseña de Amazon."],
    ["Llegan los pedidos", "NivaDesk detecta los marketplaces en los que vende tu cuenta y empieza a traer tus pedidos."]
  ],
  connectDisconnect: "Puedes desconectar en cualquier momento desde la misma pantalla: la sincronización se detiene y se elimina la autorización de Amazon guardada. Los pedidos ya importados se quedan en tu espacio.",
  connectAppstore: "La conexión se inicia desde NivaDesk. Si llegas desde la Amazon Appstore, inicia sesión o crea un espacio gratuito y conecta desde Ajustes › Integraciones.",
  marketsTitle: "Marketplaces de Amazon",
  marketsIntro: "NivaDesk reconoce pedidos de estos 18 marketplaces de Amazon, agrupados por región de la API de Amazon. Amazon autoriza una aplicación por región, así que cada conexión de NivaDesk cubre los marketplaces de una región.",
  regionEurope: "Región Europa",
  regionNorthAmerica: "Región Norteamérica",
  regionFarEast: "Región Lejano Oriente",
  marketsNote: "Hoy la conexión inicia sesión a través de Seller Central Europe (sellercentral-europe.amazon.com) y lee de la API de Amazon de la región Europa. Los demás marketplaces de esta lista se reconocen en los pedidos de una cuenta conectada así; el inicio de sesión a través de su propio Seller Central regional aún no está activado.",
  marketsSignInLive: "Inicio de sesión mediante Seller Central Europe",
  marketsSignInLater: "Inicio de sesión regional aún no activado",
  pricingTitle: "Precios",
  pricingIntro: "La conexión con Amazon no tiene precio aparte ni está limitada a un plan: está incluida en todos los planes de NivaDesk, también en Free. Precios en libras esterlinas (GBP).",
  pricingTrial: "Todos los planes de pago pueden empezar con una prueba gratuita de 14 días, sin tarjeta.",
  planFree: "Free",
  perMonth: "al mes",
  perYear: "al año",
  planFreeNote: "10 pedidos activos (entregados y eliminados no cuentan) · clientes ilimitados · 1 usuario",
  planStarterNote: "Pedidos y clientes ilimitados · 250 MB de almacenamiento · 1 usuario",
  planProNote: "Todo lo de Starter, más finanzas avanzadas, Client Files y feed bancario · 10 GB de almacenamiento · 1 usuario",
  planTeamNote: "Todo lo de Pro, más acceso de equipo con 5 plazas incluidas (hasta 10) · 50 GB de almacenamiento",
  extraSeat: "Plaza adicional de Team: £5 al mes o £50 al año.",
  includesAmazon: "Conexión con Amazon incluida",
  pricingLink: "Ver todos los detalles de los planes",
  dataTitle: "Datos y seguridad",
  data: [
    ["Qué lee NivaDesk", "Solo datos de pedidos: detalles de pedidos y artículos, importes, estados y fechas, además de la lista de marketplaces en los que vende tu cuenta. No se solicitan datos de compradores ni destinatarios."],
    ["Dónde se guardan", "Los datos de Amazon se tratan en un proyecto de Google Cloud independiente, usado solo para la conexión con Amazon, en Londres (europe-west2). Tu autorización de Amazon se guarda en Google Secret Manager."],
    ["Cómo se protegen", "Las conexiones usan HTTPS (TLS) y Google Cloud cifra los datos almacenados en reposo. El servicio de Amazon solo puede llamar a los endpoints de Amazon y al endpoint de importación de NivaDesk, y a tu espacio solo pasan los campos de una lista permitida fija."],
    ["Quién puede verlos", "Los pedidos importados solo son visibles para los miembros de tu espacio. Los miembros del equipo ven si la conexión funciona, pero no sus detalles."],
    ["Eliminación", "Desconectar elimina la autorización de Amazon guardada. Puedes eliminar los pedidos importados, o toda tu cuenta, en cualquier momento."]
  ],
  legalTitle: "Políticas",
  linkPrivacy: "Política de privacidad",
  linkTerms: "Términos del servicio",
  linkSecurity: "Resumen de seguridad",
  linkSubprocessors: "Subencargados",
  linkDeletion: "Eliminación de la cuenta",
  contactTitle: "Preguntas y soporte",
  contactBody: "Escríbenos por correo electrónico o desde la página de contacto y te responderemos.",
  contactEmailLabel: "Correo electrónico",
  contactPage: "Página de contacto",
  company: "NivaDesk es un producto de EGGCRAFT LIMITED, registrada en Inglaterra y Gales con el número de sociedad 16566512.",
  trademark: "Amazon y Seller Central son marcas comerciales de Amazon.com, Inc. o sus filiales. NivaDesk es un producto independiente y no está afiliado a Amazon ni respaldado por Amazon."
};

const PT: AmazonSellerCopy = {
  eyebrow: "NivaDesk para vendedores da Amazon",
  title: "Os seus pedidos da Amazon, no mesmo lugar que o trabalho por trás deles.",
  intro: "O NivaDesk é um software de gestão de pedidos para negócios de encomendas personalizadas, reparações e serviços. A ligação Amazon do NivaDesk lê os seus pedidos da Amazon para o seu espaço de trabalho NivaDesk, ao lado dos pedidos dos seus outros canais de venda, para os planear, produzir e enviar num só lugar.",
  ctaPricing: "Ver preços",
  ctaContact: "Fale connosco",
  statusLabel: "Acesso em análise",
  statusTitle: "Estado atual",
  statusBody: "A aplicação NivaDesk aguarda a aprovação da Amazon e ainda está no estado Draft (rascunho) na Amazon. Até a Amazon a aprovar, os vendedores não conseguem concluir a ligação. Depois de aprovada, o botão Ligar no NivaDesk fica disponível automaticamente; não há nada para instalar.",
  doesTitle: "O que a ligação Amazon faz",
  does: [
    ["Importação de pedidos só de leitura", "O NivaDesk lê os seus pedidos da Amazon: número do pedido, marketplace, estado do pedido, estado do pagamento, total do pedido, envio e descontos, e o título e a quantidade de cada artigo."],
    ["Atualizações regulares", "Os pedidos novos e alterados são verificados a cada 30 minutos, incluindo cancelamentos."],
    ["Uma lista para todos os canais", "Os pedidos da Amazon aparecem na sua lista de pedidos do NivaDesk ao lado dos pedidos dos outros canais e dos que adiciona manualmente, com a Amazon indicada como origem."],
    ["Acompanhamento da produção", "Cada pedido da Amazon torna-se um pedido NivaDesk com o seu próprio estado de produção, data de entrega, notas e dados de envio, para ver o que produzir e enviar a seguir."],
    ["Lucro por pedido", "Os pedidos da Amazon contam nos números financeiros do NivaDesk como qualquer outra venda. As taxas da Amazon e os valores de impostos não são importados, por isso o lucro usa a percentagem de taxa e as definições fiscais do seu espaço."]
  ],
  doesNotTitle: "O que não faz",
  doesNot: [
    "Nunca altera os seus anúncios, preços ou stock na Amazon. O NivaDesk só envia pedidos de leitura à Amazon; nada é escrito de volta na sua conta Amazon.",
    "Não pede dados de compradores ou destinatários, como nomes, moradas, endereços de e-mail ou números de telefone. Se uma resposta contiver algum, é removido e esse pedido não é guardado.",
    "Não importa taxas da Amazon, liquidações, inventário FBA nem o seu catálogo de produtos.",
    "Não envia mensagens aos seus compradores nem executa ações na Amazon por si."
  ],
  connectTitle: "Como funciona a ligação",
  connectSteps: [
    ["O proprietário do espaço inicia", "No NivaDesk, abra Definições › Integrações › Amazon. Só o proprietário do espaço pode ligar ou desligar a Amazon; os membros da equipa podem ver se a ligação está a funcionar."],
    ["Aprova na Amazon", "O NivaDesk encaminha-o para a página de consentimento da própria Amazon no Seller Central. O NivaDesk nunca vê a sua palavra-passe da Amazon."],
    ["Os pedidos chegam", "O NivaDesk identifica os marketplaces onde a sua conta vende e começa a trazer os seus pedidos."]
  ],
  connectDisconnect: "Pode desligar a qualquer momento no mesmo ecrã: a sincronização para e a autorização da Amazon guardada é eliminada. Os pedidos já importados ficam no seu espaço.",
  connectAppstore: "A ligação é iniciada no NivaDesk. Se chegar a partir da Amazon Appstore, inicie sessão ou crie um espaço gratuito e depois ligue em Definições › Integrações.",
  marketsTitle: "Marketplaces da Amazon",
  marketsIntro: "O NivaDesk reconhece pedidos destes 18 marketplaces da Amazon, agrupados por região da API da Amazon. A Amazon autoriza uma aplicação por região, por isso cada ligação NivaDesk cobre os marketplaces de uma região.",
  regionEurope: "Região Europa",
  regionNorthAmerica: "Região América do Norte",
  regionFarEast: "Região Extremo Oriente",
  marketsNote: "Hoje a ligação inicia sessão através do Seller Central Europe (sellercentral-europe.amazon.com) e lê a API da Amazon da região Europa. Os outros marketplaces desta lista são reconhecidos nos pedidos de uma conta ligada desta forma; o início de sessão através do Seller Central regional deles ainda não está ativado.",
  marketsSignInLive: "Início de sessão através do Seller Central Europe",
  marketsSignInLater: "Início de sessão regional ainda não ativado",
  pricingTitle: "Preços",
  pricingIntro: "A ligação Amazon não tem preço separado nem está limitada a um plano: está incluída em todos os planos NivaDesk, incluindo o Free. Preços em libras esterlinas (GBP).",
  pricingTrial: "Todos os planos pagos podem começar com uma avaliação gratuita de 14 dias, sem cartão.",
  planFree: "Free",
  perMonth: "por mês",
  perYear: "por ano",
  planFreeNote: "10 encomendas ativas (entregues e eliminadas não contam) · clientes ilimitados · 1 utilizador",
  planStarterNote: "Pedidos e clientes ilimitados · 250 MB de armazenamento · 1 utilizador",
  planProNote: "Tudo do Starter, mais finanças avançadas, Client Files e feed bancário · 10 GB de armazenamento · 1 utilizador",
  planTeamNote: "Tudo do Pro, mais acesso de equipa com 5 lugares incluídos (até 10) · 50 GB de armazenamento",
  extraSeat: "Lugar Team adicional: £5 por mês ou £50 por ano.",
  includesAmazon: "Ligação Amazon incluída",
  pricingLink: "Ver todos os detalhes dos planos",
  dataTitle: "Dados e segurança",
  data: [
    ["O que o NivaDesk lê", "Apenas dados de pedidos: detalhes de pedidos e artigos, valores, estados e datas, mais a lista de marketplaces onde a sua conta vende. Não são pedidos dados de compradores nem de destinatários."],
    ["Onde são guardados", "Os dados da Amazon são tratados num projeto Google Cloud separado, usado apenas para a ligação Amazon, em Londres (europe-west2). A sua autorização da Amazon é guardada no Google Secret Manager."],
    ["Como são protegidos", "As ligações usam HTTPS (TLS) e o Google Cloud encripta os dados armazenados em repouso. O serviço Amazon só pode chamar os endpoints da própria Amazon e o endpoint de importação do NivaDesk, e só os campos de uma lista permitida fixa passam para o seu espaço."],
    ["Quem pode ver", "Os pedidos importados só são visíveis para os membros do seu espaço. Os membros da equipa veem se a ligação está a funcionar, mas não os seus detalhes."],
    ["Eliminação", "Desligar elimina a autorização da Amazon guardada. Pode eliminar os pedidos importados, ou toda a sua conta, a qualquer momento."]
  ],
  legalTitle: "Políticas",
  linkPrivacy: "Política de Privacidade",
  linkTerms: "Termos de Serviço",
  linkSecurity: "Resumo de segurança",
  linkSubprocessors: "Subcontratantes",
  linkDeletion: "Eliminação de conta",
  contactTitle: "Perguntas e suporte",
  contactBody: "Escreva-nos por e-mail ou através da página de contacto e responderemos.",
  contactEmailLabel: "E-mail",
  contactPage: "Página de contacto",
  company: "O NivaDesk é desenvolvido pela EGGCRAFT LIMITED, registada em Inglaterra e no País de Gales, com o número de empresa 16566512.",
  trademark: "Amazon e Seller Central são marcas comerciais da Amazon.com, Inc. ou das suas afiliadas. O NivaDesk é um produto independente e não é afiliado nem endossado pela Amazon."
};

const RU: AmazonSellerCopy = {
  eyebrow: "NivaDesk для продавцов Amazon",
  title: "Ваши заказы Amazon — там же, где и работа над ними.",
  intro: "NivaDesk — программа для управления заказами для бизнеса, который работает на заказ, занимается ремонтом или оказывает услуги. Подключение NivaDesk к Amazon загружает ваши заказы Amazon в рабочее пространство NivaDesk рядом с заказами из других каналов продаж, чтобы планировать, изготавливать и отправлять их в одном месте.",
  ctaPricing: "Посмотреть цены",
  ctaContact: "Связаться с нами",
  statusLabel: "Доступ на проверке",
  statusTitle: "Текущий статус",
  statusBody: "Приложение NivaDesk ожидает одобрения Amazon и пока находится в статусе Draft (черновик). Пока Amazon его не одобрит, продавцы не могут завершить подключение. После одобрения кнопка «Подключить» в NivaDesk станет доступна сама; ничего устанавливать не нужно.",
  doesTitle: "Что делает подключение к Amazon",
  does: [
    ["Импорт заказов только для чтения", "NivaDesk считывает ваши заказы Amazon: номер заказа, маркетплейс, статус заказа, статус оплаты, сумму заказа, доставку и скидки, а также название и количество каждого товара."],
    ["Регулярные обновления", "Новые и изменённые заказы проверяются каждые 30 минут, включая отмены."],
    ["Один список для всех каналов", "Заказы Amazon появляются в списке заказов NivaDesk рядом с заказами из других каналов и добавленными вами вручную, с указанием Amazon как источника."],
    ["Отслеживание производства", "Каждый заказ Amazon становится заказом NivaDesk со своим статусом производства, сроком, заметками и данными об отправке, чтобы было видно, что изготовить и отправить дальше."],
    ["Прибыль по заказу", "Заказы Amazon учитываются в финансовых показателях NivaDesk, как любые другие продажи. Комиссии Amazon и суммы налогов не импортируются, поэтому прибыль рассчитывается по проценту комиссии и налоговым настройкам вашего пространства."]
  ],
  doesNotTitle: "Чего оно не делает",
  doesNot: [
    "Никогда не изменяет ваши объявления, цены или остатки на Amazon. NivaDesk отправляет в Amazon только запросы на чтение; в ваш аккаунт Amazon ничего не записывается.",
    "Не запрашивает данные покупателей и получателей: имена, адреса, адреса электронной почты или номера телефонов. Если они всё же придут в ответе, они удаляются, а такой заказ не сохраняется.",
    "Не импортирует комиссии Amazon, выплаты, запасы FBA и ваш каталог товаров.",
    "Не пишет вашим покупателям и не выполняет действий на Amazon от вашего имени."
  ],
  connectTitle: "Как работает подключение",
  connectSteps: [
    ["Начинает владелец пространства", "В NivaDesk откройте Настройки › Интеграции › Amazon. Подключать и отключать Amazon может только владелец рабочего пространства; участники команды видят, работает ли подключение."],
    ["Вы подтверждаете в Amazon", "NivaDesk направляет вас на страницу согласия самого Amazon в Seller Central. NivaDesk никогда не видит ваш пароль Amazon."],
    ["Заказы поступают", "NivaDesk определяет маркетплейсы, на которых продаёт ваш аккаунт, и начинает загружать заказы."]
  ],
  connectDisconnect: "Отключиться можно в любой момент на том же экране: синхронизация останавливается, а сохранённая авторизация Amazon удаляется. Уже импортированные заказы остаются в вашем пространстве.",
  connectAppstore: "Подключение начинается в NivaDesk. Если вы пришли из Amazon Appstore, войдите или создайте бесплатное пространство, затем подключитесь в разделе Настройки › Интеграции.",
  marketsTitle: "Маркетплейсы Amazon",
  marketsIntro: "NivaDesk распознаёт заказы с этих 18 маркетплейсов Amazon, сгруппированных по регионам API Amazon. Amazon авторизует приложение отдельно для каждого региона, поэтому одно подключение NivaDesk охватывает маркетплейсы одного региона.",
  regionEurope: "Регион «Европа»",
  regionNorthAmerica: "Регион «Северная Америка»",
  regionFarEast: "Регион «Дальний Восток»",
  marketsNote: "Сейчас вход выполняется через Seller Central Europe (sellercentral-europe.amazon.com), а данные читаются из API Amazon для региона «Европа». Остальные маркетплейсы из списка распознаются в заказах аккаунта, подключённого таким образом; вход через их собственный региональный Seller Central пока не включён.",
  marketsSignInLive: "Вход через Seller Central Europe",
  marketsSignInLater: "Региональный вход пока не включён",
  pricingTitle: "Цены",
  pricingIntro: "Подключение к Amazon не оплачивается отдельно и не привязано к тарифу: оно входит во все тарифы NivaDesk, включая Free. Цены указаны в фунтах стерлингов (GBP).",
  pricingTrial: "Любой платный тариф можно начать с 14-дневного бесплатного пробного периода без карты.",
  planFree: "Free",
  perMonth: "в месяц",
  perYear: "в год",
  planFreeNote: "10 активных заказов (доставленные и удалённые не учитываются) · неограниченно клиентов · 1 пользователь",
  planStarterNote: "Неограниченные заказы и клиенты · 250 МБ хранилища · 1 пользователь",
  planProNote: "Всё из Starter, а также расширенные финансы, Client Files и банковская лента · 10 ГБ хранилища · 1 пользователь",
  planTeamNote: "Всё из Pro, а также командный доступ с 5 местами (до 10) · 50 ГБ хранилища",
  extraSeat: "Дополнительное место в Team: £5 в месяц или £50 в год.",
  includesAmazon: "Подключение к Amazon включено",
  pricingLink: "Подробнее о тарифах",
  dataTitle: "Данные и безопасность",
  data: [
    ["Что считывает NivaDesk", "Только данные заказов: сведения о заказах и товарах, суммы, статусы и даты, а также список маркетплейсов, где продаёт ваш аккаунт. Данные покупателей и получателей не запрашиваются."],
    ["Где они хранятся", "Данные Amazon обрабатываются в отдельном проекте Google Cloud, который используется только для подключения к Amazon, в Лондоне (europe-west2). Ваша авторизация Amazon хранится в Google Secret Manager."],
    ["Как они защищены", "Соединения используют HTTPS (TLS), а Google Cloud шифрует хранимые данные. Сервис Amazon может обращаться только к конечным точкам самого Amazon и к точке импорта NivaDesk, а в ваше пространство попадают только поля из фиксированного разрешённого списка."],
    ["Кто их видит", "Импортированные заказы видны только участникам вашего пространства. Участники команды видят, работает ли подключение, но не его подробности."],
    ["Удаление", "Отключение удаляет сохранённую авторизацию Amazon. Импортированные заказы или весь аккаунт можно удалить в любое время."]
  ],
  legalTitle: "Документы",
  linkPrivacy: "Политика конфиденциальности",
  linkTerms: "Условия использования",
  linkSecurity: "Обзор безопасности",
  linkSubprocessors: "Субобработчики",
  linkDeletion: "Удаление аккаунта",
  contactTitle: "Вопросы и поддержка",
  contactBody: "Напишите нам по электронной почте или через страницу контактов — мы ответим.",
  contactEmailLabel: "Эл. почта",
  contactPage: "Страница контактов",
  company: "NivaDesk создан компанией EGGCRAFT LIMITED, зарегистрированной в Англии и Уэльсе под номером 16566512.",
  trademark: "Amazon и Seller Central — товарные знаки Amazon.com, Inc. или её аффилированных лиц. NivaDesk — независимый продукт, не связанный с Amazon и не одобренный Amazon."
};

const JA: AmazonSellerCopy = {
  eyebrow: "Amazon セラー向け NivaDesk",
  title: "Amazon の注文を、その裏にある作業と同じ場所で。",
  intro: "NivaDesk は、オーダーメイド・修理・サービス業向けの注文管理ソフトウェアです。NivaDesk の Amazon 連携は、Amazon の注文を NivaDesk のワークスペースに読み込み、他の販売チャネルの注文と並べて表示します。計画・制作・発送を一か所で行えます。",
  ctaPricing: "料金を見る",
  ctaContact: "お問い合わせ",
  statusLabel: "アクセス審査中",
  statusTitle: "現在の状況",
  statusBody: "NivaDesk アプリは Amazon の承認待ちで、Amazon 上ではまだ Draft（下書き）状態です。Amazon が承認するまで、セラーは連携を完了できません。承認されると、NivaDesk の「接続」ボタンが自動的に使えるようになります。インストールは不要です。",
  doesTitle: "Amazon 連携でできること",
  does: [
    ["読み取り専用の注文取り込み", "NivaDesk は Amazon の注文を読み取ります：注文番号、マーケットプレイス、注文ステータス、支払いステータス、注文合計、配送料と割引、各商品の名前と数量。"],
    ["定期的な更新", "新規・変更された注文は、キャンセルを含めて 30 分ごとに確認されます。"],
    ["すべてのチャネルを一つの注文リストに", "Amazon の注文は、他のチャネルの注文やご自身で追加した注文と並んで NivaDesk の注文リストに表示され、取得元として Amazon が示されます。"],
    ["制作の進捗管理", "Amazon の各注文は、制作ステータス・期日・メモ・発送情報を持つ NivaDesk の注文になるので、次に何を作り何を送るかがわかります。"],
    ["注文ごとの利益", "Amazon の注文は、他の売上と同じように NivaDesk の財務数値に含まれます。Amazon の手数料と税額は取り込まれないため、利益はワークスペースで設定した手数料率と税設定で計算されます。"]
  ],
  doesNotTitle: "できないこと",
  doesNot: [
    "Amazon の出品・価格・在庫を変更することはありません。NivaDesk が Amazon に送るのは読み取りリクエストだけで、Amazon アカウントには何も書き戻しません。",
    "氏名、住所、メールアドレス、電話番号などの購入者・受取人データを要求しません。応答に含まれていた場合は削除され、その注文は保存されません。",
    "Amazon の手数料、精算、FBA 在庫、商品カタログは取り込みません。",
    "購入者へのメッセージ送信や、Amazon 上での代理操作は行いません。"
  ],
  connectTitle: "連携の仕組み",
  connectSteps: [
    ["ワークスペースのオーナーが開始", "NivaDesk で 設定 › 連携 › Amazon を開きます。Amazon の接続・切断ができるのはワークスペースのオーナーだけです。チームメンバーは連携が動作しているかを確認できます。"],
    ["Amazon で承認", "NivaDesk が Seller Central にある Amazon 自身の同意ページへご案内します。NivaDesk が Amazon のパスワードを見ることはありません。"],
    ["注文が届く", "NivaDesk がアカウントの販売先マーケットプレイスを検出し、注文の取り込みを始めます。"]
  ],
  connectDisconnect: "同じ画面からいつでも切断できます。同期が止まり、保存されている Amazon の認可は削除されます。取り込み済みの注文はワークスペースに残ります。",
  connectAppstore: "連携は NivaDesk から開始します。Amazon Appstore から来た場合は、ログインするか無料のワークスペースを作成し、設定 › 連携 から接続してください。",
  marketsTitle: "Amazon マーケットプレイス",
  marketsIntro: "NivaDesk は、Amazon の API リージョン別にまとめた次の 18 のマーケットプレイスの注文を認識します。Amazon はアプリをリージョンごとに認可するため、NivaDesk の各連携は一つのリージョンのマーケットプレイスを対象とします。",
  regionEurope: "ヨーロッパ リージョン",
  regionNorthAmerica: "北米リージョン",
  regionFarEast: "極東リージョン",
  marketsNote: "現在、連携は Seller Central Europe（sellercentral-europe.amazon.com）経由でサインインし、Amazon のヨーロッパ リージョン API から読み取ります。この一覧の他のマーケットプレイスは、この方法で接続したアカウントの注文内で認識されます。各リージョンの Seller Central 経由のサインインはまだ有効になっていません。",
  marketsSignInLive: "Seller Central Europe 経由でサインイン",
  marketsSignInLater: "リージョン別サインインはまだ未対応",
  pricingTitle: "料金",
  pricingIntro: "Amazon 連携に別料金はなく、プランによる制限もありません。Free を含むすべての NivaDesk プランに含まれています。料金は英ポンド（GBP）です。",
  pricingTrial: "すべての有料プランは、カード不要の 14 日間無料トライアルから始められます。",
  planFree: "Free",
  perMonth: "月額",
  perYear: "年額",
  planFreeNote: "進行中の注文 10 件（納品済み・削除済みは数えません）・顧客数無制限・ユーザー 1 名",
  planStarterNote: "注文・顧客無制限 · ストレージ 250 MB · ユーザー 1 名",
  planProNote: "Starter のすべてに加え、高度な財務機能、Client Files、銀行フィード · ストレージ 10 GB · ユーザー 1 名",
  planTeamNote: "Pro のすべてに加え、5 席込みのチームアクセス（最大 10 席） · ストレージ 50 GB",
  extraSeat: "Team の追加席：月額 £5 または年額 £50。",
  includesAmazon: "Amazon 連携を含む",
  pricingLink: "プランの詳細を見る",
  dataTitle: "データとセキュリティ",
  data: [
    ["NivaDesk が読み取るもの", "注文データのみ：注文と商品の詳細、金額、ステータス、日付、そしてアカウントが販売しているマーケットプレイスの一覧です。購入者・受取人データは要求しません。"],
    ["保管場所", "Amazon のデータは、Amazon 連携専用の独立した Google Cloud プロジェクト内、ロンドン（europe-west2）で処理されます。Amazon の認可は Google Secret Manager に保管されます。"],
    ["保護の方法", "通信には HTTPS（TLS）を使用し、保存データは Google Cloud によって暗号化されます。Amazon サービスが呼び出せるのは Amazon 自身のエンドポイントと NivaDesk の取り込みエンドポイントだけで、ワークスペースに渡るのは固定の許可リストにある項目のみです。"],
    ["閲覧できる人", "取り込んだ注文は、ワークスペースのメンバーだけが閲覧できます。チームメンバーは連携が動作しているかを確認できますが、詳細は見られません。"],
    ["削除", "切断すると、保存されている Amazon の認可が削除されます。取り込んだ注文やアカウント全体はいつでも削除できます。"]
  ],
  legalTitle: "ポリシー",
  linkPrivacy: "プライバシーポリシー",
  linkTerms: "利用規約",
  linkSecurity: "セキュリティの概要",
  linkSubprocessors: "サブプロセッサー",
  linkDeletion: "アカウントの削除",
  contactTitle: "ご質問とサポート",
  contactBody: "メールまたはお問い合わせページからご連絡ください。お返事いたします。",
  contactEmailLabel: "メール",
  contactPage: "お問い合わせページ",
  company: "NivaDesk は、イングランドおよびウェールズで登録された EGGCRAFT LIMITED（会社番号 16566512）が提供しています。",
  trademark: "Amazon および Seller Central は、Amazon.com, Inc. またはその関連会社の商標です。NivaDesk は独立した製品であり、Amazon と提携しておらず、Amazon による推奨を受けていません。"
};

const ZH: AmazonSellerCopy = {
  eyebrow: "面向 Amazon 卖家的 NivaDesk",
  title: "您的 Amazon 订单，与其背后的工作在同一处。",
  intro: "NivaDesk 是面向定制订单、维修和服务类企业的订单管理软件。NivaDesk 的 Amazon 连接会将您的 Amazon 订单读取到 NivaDesk 工作区，与其他销售渠道的订单放在一起，让您在一处完成计划、制作和发货。",
  ctaPricing: "查看价格",
  ctaContact: "联系我们",
  statusLabel: "访问权限审核中",
  statusTitle: "当前状态",
  statusBody: "NivaDesk 应用正在等待 Amazon 批准，目前在 Amazon 仍处于 Draft（草稿）状态。在 Amazon 批准之前，卖家无法完成连接。批准后，NivaDesk 中的“连接”按钮会自动可用，无需安装任何内容。",
  doesTitle: "Amazon 连接能做什么",
  does: [
    ["只读订单导入", "NivaDesk 读取您的 Amazon 订单：订单号、商城站点、订单状态、付款状态、订单总额、运费和折扣，以及每件商品的标题和数量。"],
    ["定期更新", "每 30 分钟检查一次新订单和已变更的订单，包括取消。"],
    ["所有渠道一个订单列表", "Amazon 订单会出现在 NivaDesk 订单列表中，与其他渠道的订单以及您手动添加的订单并列，并标明来源为 Amazon。"],
    ["生产跟踪", "每个 Amazon 订单都会成为一个 NivaDesk 订单，拥有自己的生产状态、截止日期、备注和发货信息，方便您了解接下来要制作和发出什么。"],
    ["每单利润", "Amazon 订单与其他销售一样计入 NivaDesk 的财务数据。Amazon 的费用和税额不会导入，因此利润按您工作区中设置的费用比例和税务设置计算。"]
  ],
  doesNotTitle: "它不做什么",
  doesNot: [
    "绝不更改您在 Amazon 上的商品信息、价格或库存。NivaDesk 只向 Amazon 发送读取请求，不会向您的 Amazon 账户写入任何内容。",
    "不请求买家或收件人数据，例如姓名、地址、电子邮件地址或电话号码。如果响应中包含此类数据，会被移除，且该订单不会被保存。",
    "不导入 Amazon 费用、结算、FBA 库存或您的商品目录。",
    "不会向您的买家发送消息，也不会代您在 Amazon 上执行任何操作。"
  ],
  connectTitle: "如何连接",
  connectSteps: [
    ["由工作区所有者发起", "在 NivaDesk 中打开 设置 › 集成 › Amazon。只有工作区所有者可以连接或断开 Amazon；团队成员可以看到连接是否正常。"],
    ["在 Amazon 上授权", "NivaDesk 会将您带到 Seller Central 中 Amazon 自己的授权页面。NivaDesk 永远看不到您的 Amazon 密码。"],
    ["订单到达", "NivaDesk 会识别您的账户所销售的商城站点，并开始导入您的订单。"]
  ],
  connectDisconnect: "您可以随时在同一页面断开连接：同步会停止，已保存的 Amazon 授权会被删除。已导入的订单仍保留在您的工作区中。",
  connectAppstore: "连接需从 NivaDesk 发起。如果您从 Amazon Appstore 进入，请先登录或创建免费工作区，然后在 设置 › 集成 中连接。",
  marketsTitle: "Amazon 商城站点",
  marketsIntro: "NivaDesk 可识别来自以下 18 个 Amazon 商城站点的订单，按 Amazon 的 API 区域分组。Amazon 按区域授权应用，因此每个 NivaDesk 连接只覆盖一个区域的商城站点。",
  regionEurope: "欧洲区域",
  regionNorthAmerica: "北美区域",
  regionFarEast: "远东区域",
  marketsNote: "目前连接通过 Seller Central Europe（sellercentral-europe.amazon.com）登录，并从 Amazon 欧洲区域 API 读取数据。列表中的其他商城站点会在以此方式连接的账户订单中被识别；通过它们各自区域的 Seller Central 登录尚未开通。",
  marketsSignInLive: "通过 Seller Central Europe 登录",
  marketsSignInLater: "区域登录尚未开通",
  pricingTitle: "价格",
  pricingIntro: "Amazon 连接不单独收费，也不限定套餐：所有 NivaDesk 套餐（包括 Free）都包含此功能。价格以英镑（GBP）计。",
  pricingTrial: "每个付费套餐都可以先享受 14 天免费试用，无需绑定银行卡。",
  planFree: "Free",
  perMonth: "每月",
  perYear: "每年",
  planFreeNote: "10 个进行中的订单（已交付和已删除的不计入）· 客户不限 · 1 位用户",
  planStarterNote: "订单和客户不限 · 250 MB 存储 · 1 位用户",
  planProNote: "包含 Starter 全部功能，另有高级财务、Client Files 和银行流水 · 10 GB 存储 · 1 位用户",
  planTeamNote: "包含 Pro 全部功能，另有团队访问，含 5 个席位（最多 10 个） · 50 GB 存储",
  extraSeat: "额外 Team 席位：每月 £5 或每年 £50。",
  includesAmazon: "包含 Amazon 连接",
  pricingLink: "查看完整套餐详情",
  dataTitle: "数据与安全",
  data: [
    ["NivaDesk 读取什么", "仅订单数据：订单和商品详情、金额、状态和日期，以及您的账户所销售的商城站点列表。不请求买家和收件人数据。"],
    ["存放在哪里", "Amazon 数据在一个仅用于 Amazon 连接的独立 Google Cloud 项目中处理，位于伦敦（europe-west2）。您的 Amazon 授权保存在 Google Secret Manager 中。"],
    ["如何保护", "连接使用 HTTPS（TLS），Google Cloud 会对存储的数据进行静态加密。Amazon 服务只能调用 Amazon 自己的端点和 NivaDesk 的导入端点，且只有固定允许列表中的字段会进入您的工作区。"],
    ["谁能看到", "导入的订单仅对您工作区的成员可见。团队成员可以看到连接是否正常，但看不到其详细信息。"],
    ["删除", "断开连接会删除已保存的 Amazon 授权。您可以随时删除导入的订单或整个账户。"]
  ],
  legalTitle: "政策",
  linkPrivacy: "隐私政策",
  linkTerms: "服务条款",
  linkSecurity: "安全概览",
  linkSubprocessors: "子处理者",
  linkDeletion: "删除账户",
  contactTitle: "问题与支持",
  contactBody: "请通过电子邮件或联系页面与我们联系，我们会回复您。",
  contactEmailLabel: "电子邮件",
  contactPage: "联系页面",
  company: "NivaDesk 由 EGGCRAFT LIMITED 开发，该公司在英格兰和威尔士注册，公司编号 16566512。",
  trademark: "Amazon 和 Seller Central 是 Amazon.com, Inc. 或其关联公司的商标。NivaDesk 是独立产品，与 Amazon 无关联，也未获得 Amazon 的认可。"
};

const AR: AmazonSellerCopy = {
  eyebrow: "NivaDesk لبائعي Amazon",
  title: "طلبات Amazon الخاصة بك، في المكان نفسه الذي يجري فيه العمل عليها.",
  intro: "NivaDesk برنامج لإدارة الطلبات للأعمال التي تعمل بالطلبات المخصصة والإصلاح والخدمات. يقرأ اتصال NivaDesk مع Amazon طلباتك على Amazon إلى مساحة عملك في NivaDesk، بجانب الطلبات الواردة من قنوات البيع الأخرى، لتخطّط لها وتنفّذها وتشحنها من مكان واحد.",
  ctaPricing: "عرض الأسعار",
  ctaContact: "تواصل معنا",
  statusLabel: "الوصول قيد المراجعة",
  statusTitle: "الحالة الحالية",
  statusBody: "تطبيق NivaDesk بانتظار موافقة Amazon، ولا يزال في حالة Draft (مسودة) لدى Amazon. إلى أن توافق Amazon عليه، لا يستطيع البائعون إكمال الاتصال. وبعد الموافقة يصبح زر «اتصال» في NivaDesk متاحًا تلقائيًا، ولا حاجة إلى تثبيت أي شيء.",
  doesTitle: "ما الذي يفعله اتصال Amazon",
  does: [
    ["استيراد الطلبات للقراءة فقط", "يقرأ NivaDesk طلباتك على Amazon: رقم الطلب، والمتجر، وحالة الطلب، وحالة الدفع، وإجمالي الطلب، والشحن والخصومات، واسم كل منتج وكميته."],
    ["تحديثات منتظمة", "يتم التحقق من الطلبات الجديدة والمعدّلة كل 30 دقيقة، بما في ذلك الإلغاءات."],
    ["قائمة طلبات واحدة لكل القنوات", "تظهر طلبات Amazon في قائمة طلباتك في NivaDesk بجانب طلبات قنواتك الأخرى والطلبات التي تضيفها بنفسك، مع ذكر Amazon مصدرًا لها."],
    ["متابعة الإنتاج", "يصبح كل طلب من Amazon طلبًا في NivaDesk له حالة إنتاج وتاريخ استحقاق وملاحظات وبيانات شحن خاصة به، لترى ما الذي ستصنعه وترسله بعد ذلك."],
    ["الربح لكل طلب", "تُحتسب طلبات Amazon في الأرقام المالية لـ NivaDesk مثل أي بيع آخر. لا يتم استيراد رسوم Amazon ومبالغ الضرائب، لذلك يُحسب الربح باستخدام نسبة الرسوم وإعدادات الضريبة في مساحة عملك."]
  ],
  doesNotTitle: "ما الذي لا يفعله",
  doesNot: [
    "لا يغيّر أبدًا قوائم منتجاتك أو أسعارك أو مخزونك على Amazon. يرسل NivaDesk إلى Amazon طلبات قراءة فقط، ولا يُكتب أي شيء في حسابك على Amazon.",
    "لا يطلب بيانات المشترين أو المستلمين مثل الأسماء أو العناوين أو عناوين البريد الإلكتروني أو أرقام الهاتف. وإذا احتوت استجابة على شيء منها، تتم إزالته ولا يُحفظ ذلك الطلب.",
    "لا يستورد رسوم Amazon أو التسويات أو مخزون FBA أو كتالوج منتجاتك.",
    "لا يراسل المشترين ولا ينفّذ أي إجراء على Amazon نيابةً عنك."
  ],
  connectTitle: "كيف يتم الاتصال",
  connectSteps: [
    ["يبدأه مالك مساحة العمل", "في NivaDesk افتح الإعدادات › التكاملات › Amazon. يستطيع مالك مساحة العمل وحده توصيل Amazon أو فصله، ويرى أعضاء الفريق ما إذا كان الاتصال يعمل."],
    ["توافق على Amazon", "ينقلك NivaDesk إلى صفحة الموافقة الخاصة بـ Amazon في Seller Central. لا يرى NivaDesk كلمة مرور Amazon الخاصة بك أبدًا."],
    ["تصل الطلبات", "يتعرّف NivaDesk على المتاجر التي يبيع فيها حسابك ويبدأ في جلب طلباتك."]
  ],
  connectDisconnect: "يمكنك قطع الاتصال في أي وقت من الشاشة نفسها: تتوقف المزامنة ويُحذف تفويض Amazon المحفوظ. تبقى الطلبات المستوردة سابقًا في مساحة عملك.",
  connectAppstore: "يبدأ الاتصال من NivaDesk. إذا وصلت من Amazon Appstore، فسجّل الدخول أو أنشئ مساحة عمل مجانية، ثم اتصل من الإعدادات › التكاملات.",
  marketsTitle: "متاجر Amazon",
  marketsIntro: "يتعرّف NivaDesk على الطلبات من متاجر Amazon الثمانية عشر التالية، مجمّعة حسب منطقة واجهة برمجة Amazon. تمنح Amazon التفويض للتطبيق لكل منطقة على حدة، لذلك يغطي كل اتصال في NivaDesk متاجر منطقة واحدة.",
  regionEurope: "منطقة أوروبا",
  regionNorthAmerica: "منطقة أمريكا الشمالية",
  regionFarEast: "منطقة الشرق الأقصى",
  marketsNote: "حاليًا يتم تسجيل الدخول عبر Seller Central Europe (sellercentral-europe.amazon.com) وتُقرأ البيانات من واجهة برمجة Amazon لمنطقة أوروبا. يتم التعرّف على المتاجر الأخرى في هذه القائمة ضمن طلبات حساب متصل بهذه الطريقة، أما تسجيل الدخول عبر Seller Central الإقليمي الخاص بها فلم يُفعَّل بعد.",
  marketsSignInLive: "تسجيل الدخول عبر Seller Central Europe",
  marketsSignInLater: "تسجيل الدخول الإقليمي لم يُفعَّل بعد",
  pricingTitle: "الأسعار",
  pricingIntro: "لا يوجد سعر منفصل لاتصال Amazon وهو غير مقصور على خطة معيّنة: فهو مشمول في كل خطط NivaDesk، بما فيها Free. الأسعار بالجنيه الإسترليني (GBP).",
  pricingTrial: "يمكن بدء كل خطة مدفوعة بتجربة مجانية لمدة 14 يومًا دون الحاجة إلى بطاقة.",
  planFree: "Free",
  perMonth: "شهريًا",
  perYear: "سنويًا",
  planFreeNote: "10 طلبات نشطة (المُسلَّمة والمحذوفة لا تُحتسب) · عملاء بلا حدود · مستخدم واحد",
  planStarterNote: "طلبات وعملاء بلا حدود · مساحة تخزين 250 ميغابايت · مستخدم واحد",
  planProNote: "كل ما في Starter، بالإضافة إلى المالية المتقدمة وClient Files وموجز البنك · مساحة تخزين 10 غيغابايت · مستخدم واحد",
  planTeamNote: "كل ما في Pro، بالإضافة إلى وصول الفريق مع 5 مقاعد مشمولة (حتى 10) · مساحة تخزين 50 غيغابايت",
  extraSeat: "مقعد Team إضافي: ‎£5 شهريًا أو ‎£50 سنويًا.",
  includesAmazon: "اتصال Amazon مشمول",
  pricingLink: "عرض تفاصيل الخطط كاملة",
  dataTitle: "البيانات والأمان",
  data: [
    ["ما الذي يقرؤه NivaDesk", "بيانات الطلبات فقط: تفاصيل الطلبات والمنتجات، والمبالغ، والحالات، والتواريخ، بالإضافة إلى قائمة المتاجر التي يبيع فيها حسابك. لا تُطلب بيانات المشترين أو المستلمين."],
    ["أين تُحفظ", "تُعالَج بيانات Amazon في مشروع Google Cloud منفصل مخصّص لاتصال Amazon فقط، في لندن (europe-west2). ويُحفظ تفويض Amazon الخاص بك في Google Secret Manager."],
    ["كيف تُحمى", "تستخدم الاتصالات بروتوكول HTTPS (TLS)، وتشفّر Google Cloud البيانات المخزّنة. لا تستطيع خدمة Amazon الاتصال إلا بنقاط Amazon نفسها ونقطة الاستيراد في NivaDesk، ولا يصل إلى مساحة عملك إلا الحقول الموجودة في قائمة سماح ثابتة."],
    ["من يمكنه رؤيتها", "الطلبات المستوردة مرئية لأعضاء مساحة عملك فقط. يرى أعضاء الفريق ما إذا كان الاتصال يعمل، دون تفاصيله."],
    ["الحذف", "يؤدي قطع الاتصال إلى حذف تفويض Amazon المحفوظ. ويمكنك حذف الطلبات المستوردة أو حسابك بالكامل في أي وقت."]
  ],
  legalTitle: "السياسات",
  linkPrivacy: "سياسة الخصوصية",
  linkTerms: "شروط الخدمة",
  linkSecurity: "نظرة عامة على الأمان",
  linkSubprocessors: "المعالجون الفرعيون",
  linkDeletion: "حذف الحساب",
  contactTitle: "الأسئلة والدعم",
  contactBody: "راسلنا عبر البريد الإلكتروني أو من خلال صفحة التواصل، وسنرد عليك.",
  contactEmailLabel: "البريد الإلكتروني",
  contactPage: "صفحة التواصل",
  company: "يُطوَّر NivaDesk بواسطة EGGCRAFT LIMITED، المسجّلة في إنجلترا وويلز برقم الشركة 16566512.",
  trademark: "Amazon وSeller Central علامتان تجاريتان لشركة Amazon.com, Inc. أو الشركات التابعة لها. NivaDesk منتج مستقل وغير تابع لـ Amazon ولا يحظى بتأييدها."
};

const HI: AmazonSellerCopy = {
  eyebrow: "Amazon विक्रेताओं के लिए NivaDesk",
  title: "आपके Amazon ऑर्डर, उनके पीछे के काम के साथ एक ही जगह पर।",
  intro: "NivaDesk कस्टम-ऑर्डर, रिपेयर और सर्विस व्यवसायों के लिए ऑर्डर प्रबंधन सॉफ़्टवेयर है। NivaDesk का Amazon कनेक्शन आपके Amazon ऑर्डर को आपके NivaDesk वर्कस्पेस में, आपके दूसरे बिक्री चैनलों के ऑर्डर के साथ पढ़ता है, ताकि आप उन्हें एक ही जगह योजना बना सकें, तैयार कर सकें और भेज सकें।",
  ctaPricing: "कीमतें देखें",
  ctaContact: "हमसे संपर्क करें",
  statusLabel: "एक्सेस की समीक्षा जारी",
  statusTitle: "मौजूदा स्थिति",
  statusBody: "NivaDesk ऐप Amazon की स्वीकृति का इंतज़ार कर रहा है और Amazon पर अभी Draft (ड्राफ़्ट) स्थिति में है। जब तक Amazon इसे स्वीकृत नहीं करता, विक्रेता कनेक्शन पूरा नहीं कर सकते। स्वीकृति मिलते ही NivaDesk में Connect बटन अपने-आप उपलब्ध हो जाएगा; कुछ भी इंस्टॉल नहीं करना है।",
  doesTitle: "Amazon कनेक्शन क्या करता है",
  does: [
    ["केवल-पढ़ने वाला ऑर्डर इम्पोर्ट", "NivaDesk आपके Amazon ऑर्डर पढ़ता है: ऑर्डर नंबर, मार्केटप्लेस, ऑर्डर स्थिति, भुगतान स्थिति, ऑर्डर कुल, शिपिंग और छूट, और हर आइटम का नाम और मात्रा।"],
    ["नियमित अपडेट", "नए और बदले हुए ऑर्डर, रद्दीकरण सहित, हर 30 मिनट में जाँचे जाते हैं।"],
    ["हर चैनल के लिए एक ऑर्डर सूची", "Amazon ऑर्डर आपकी NivaDesk ऑर्डर सूची में आपके दूसरे चैनलों के ऑर्डर और खुद जोड़े गए ऑर्डर के साथ दिखते हैं, और उनका स्रोत Amazon बताया जाता है।"],
    ["प्रोडक्शन ट्रैकिंग", "हर Amazon ऑर्डर एक NivaDesk ऑर्डर बन जाता है, जिसकी अपनी प्रोडक्शन स्थिति, नियत तारीख, नोट्स और डिस्पैच विवरण होते हैं, ताकि आप देख सकें कि आगे क्या बनाना और भेजना है।"],
    ["हर ऑर्डर पर मुनाफ़ा", "Amazon ऑर्डर NivaDesk के वित्तीय आँकड़ों में किसी भी दूसरी बिक्री की तरह गिने जाते हैं। Amazon की फ़ीस और टैक्स राशि इम्पोर्ट नहीं होती, इसलिए मुनाफ़ा आपके वर्कस्पेस में सेट फ़ीस प्रतिशत और टैक्स सेटिंग्स से निकाला जाता है।"]
  ],
  doesNotTitle: "यह क्या नहीं करता",
  doesNot: [
    "यह आपकी Amazon लिस्टिंग, कीमतें या स्टॉक कभी नहीं बदलता। NivaDesk Amazon को केवल पढ़ने के अनुरोध भेजता है; आपके Amazon खाते में कुछ भी वापस नहीं लिखा जाता।",
    "यह नाम, पता, ईमेल पता या फ़ोन नंबर जैसा खरीदार या प्राप्तकर्ता का डेटा नहीं माँगता। अगर किसी जवाब में ऐसा कुछ आए, तो उसे हटा दिया जाता है और वह ऑर्डर सहेजा नहीं जाता।",
    "यह Amazon फ़ीस, सेटलमेंट, FBA इन्वेंटरी या आपका प्रोडक्ट कैटलॉग इम्पोर्ट नहीं करता।",
    "यह आपके खरीदारों को संदेश नहीं भेजता और आपकी ओर से Amazon पर कोई कार्रवाई नहीं करता।"
  ],
  connectTitle: "कनेक्ट कैसे करें",
  connectSteps: [
    ["वर्कस्पेस का मालिक शुरू करता है", "NivaDesk में Settings › Integrations › Amazon खोलें। केवल वर्कस्पेस का मालिक Amazon को कनेक्ट या डिस्कनेक्ट कर सकता है; टीम के सदस्य देख सकते हैं कि कनेक्शन काम कर रहा है या नहीं।"],
    ["आप Amazon पर स्वीकृति देते हैं", "NivaDesk आपको Seller Central में Amazon के अपने सहमति पेज पर भेजता है। NivaDesk आपका Amazon पासवर्ड कभी नहीं देखता।"],
    ["ऑर्डर आने लगते हैं", "NivaDesk पता लगाता है कि आपका खाता किन मार्केटप्लेस में बेचता है और आपके ऑर्डर लाना शुरू करता है।"]
  ],
  connectDisconnect: "आप उसी स्क्रीन से कभी भी डिस्कनेक्ट कर सकते हैं: सिंक रुक जाता है और सहेजा गया Amazon प्राधिकरण हटा दिया जाता है। पहले से इम्पोर्ट हुए ऑर्डर आपके वर्कस्पेस में बने रहते हैं।",
  connectAppstore: "कनेक्शन NivaDesk से शुरू होता है। अगर आप Amazon Appstore से आए हैं, तो साइन इन करें या मुफ़्त वर्कस्पेस बनाएँ, फिर Settings › Integrations से कनेक्ट करें।",
  marketsTitle: "Amazon मार्केटप्लेस",
  marketsIntro: "NivaDesk इन 18 Amazon मार्केटप्लेस के ऑर्डर पहचानता है, जिन्हें Amazon के API क्षेत्र के अनुसार समूहित किया गया है। Amazon हर क्षेत्र के लिए ऐप को अलग से अधिकृत करता है, इसलिए हर NivaDesk कनेक्शन एक क्षेत्र के मार्केटप्लेस को कवर करता है।",
  regionEurope: "यूरोप क्षेत्र",
  regionNorthAmerica: "उत्तरी अमेरिका क्षेत्र",
  regionFarEast: "सुदूर पूर्व क्षेत्र",
  marketsNote: "आज कनेक्शन Seller Central Europe (sellercentral-europe.amazon.com) के ज़रिए साइन इन करता है और Amazon के यूरोप क्षेत्र API से पढ़ता है। इस सूची के दूसरे मार्केटप्लेस इस तरह कनेक्ट हुए खाते के ऑर्डर में पहचाने जाते हैं; उनके अपने क्षेत्रीय Seller Central से साइन इन अभी चालू नहीं है।",
  marketsSignInLive: "Seller Central Europe से साइन इन",
  marketsSignInLater: "क्षेत्रीय साइन इन अभी चालू नहीं",
  pricingTitle: "कीमतें",
  pricingIntro: "Amazon कनेक्शन की कोई अलग कीमत नहीं है और यह किसी प्लान तक सीमित नहीं है: यह Free सहित हर NivaDesk प्लान में शामिल है। कीमतें ब्रिटिश पाउंड (GBP) में हैं।",
  pricingTrial: "हर पेड प्लान बिना कार्ड के 14 दिन के मुफ़्त ट्रायल से शुरू हो सकता है।",
  planFree: "Free",
  perMonth: "प्रति माह",
  perYear: "प्रति वर्ष",
  planFreeNote: "10 सक्रिय ऑर्डर (डिलीवर और डिलीट किए गए नहीं गिने जाते) · असीमित ग्राहक · 1 उपयोगकर्ता",
  planStarterNote: "असीमित ऑर्डर और ग्राहक · 250 MB स्टोरेज · 1 उपयोगकर्ता",
  planProNote: "Starter की हर सुविधा, साथ में एडवांस्ड फ़ाइनेंस, Client Files और बैंक फ़ीड · 10 GB स्टोरेज · 1 उपयोगकर्ता",
  planTeamNote: "Pro की हर सुविधा, साथ में 5 सीटों वाला टीम एक्सेस (10 तक) · 50 GB स्टोरेज",
  extraSeat: "अतिरिक्त Team सीट: £5 प्रति माह या £50 प्रति वर्ष।",
  includesAmazon: "Amazon कनेक्शन शामिल",
  pricingLink: "प्लान का पूरा विवरण देखें",
  dataTitle: "डेटा और सुरक्षा",
  data: [
    ["NivaDesk क्या पढ़ता है", "केवल ऑर्डर डेटा: ऑर्डर और आइटम का विवरण, राशियाँ, स्थितियाँ और तारीखें, साथ में उन मार्केटप्लेस की सूची जहाँ आपका खाता बेचता है। खरीदार और प्राप्तकर्ता का डेटा नहीं माँगा जाता।"],
    ["यह कहाँ रखा जाता है", "Amazon डेटा एक अलग Google Cloud प्रोजेक्ट में संसाधित होता है, जो केवल Amazon कनेक्शन के लिए है और लंदन (europe-west2) में है। आपका Amazon प्राधिकरण Google Secret Manager में रखा जाता है।"],
    ["इसकी सुरक्षा कैसे होती है", "कनेक्शन HTTPS (TLS) का उपयोग करते हैं, और Google Cloud संग्रहीत डेटा को एन्क्रिप्ट करता है। Amazon सेवा केवल Amazon के अपने एंडपॉइंट और NivaDesk के इम्पोर्ट एंडपॉइंट को कॉल कर सकती है, और आपके वर्कस्पेस में केवल एक तय अनुमत सूची के फ़ील्ड पहुँचते हैं।"],
    ["इसे कौन देख सकता है", "इम्पोर्ट किए गए ऑर्डर केवल आपके वर्कस्पेस के सदस्यों को दिखते हैं। टीम के सदस्य देख सकते हैं कि कनेक्शन काम कर रहा है, पर उसका विवरण नहीं।"],
    ["हटाना", "डिस्कनेक्ट करने से सहेजा गया Amazon प्राधिकरण हट जाता है। आप इम्पोर्ट किए गए ऑर्डर या अपना पूरा खाता कभी भी हटा सकते हैं।"]
  ],
  legalTitle: "नीतियाँ",
  linkPrivacy: "गोपनीयता नीति",
  linkTerms: "सेवा की शर्तें",
  linkSecurity: "सुरक्षा का सारांश",
  linkSubprocessors: "सब-प्रोसेसर",
  linkDeletion: "खाता हटाना",
  contactTitle: "सवाल और सहायता",
  contactBody: "हमें ईमेल से या संपर्क पेज के ज़रिए लिखें, हम जवाब देंगे।",
  contactEmailLabel: "ईमेल",
  contactPage: "संपर्क पेज",
  company: "NivaDesk को EGGCRAFT LIMITED ने बनाया है, जो इंग्लैंड और वेल्स में कंपनी नंबर 16566512 के साथ पंजीकृत है।",
  trademark: "Amazon और Seller Central, Amazon.com, Inc. या उसकी सहयोगी कंपनियों के ट्रेडमार्क हैं। NivaDesk एक स्वतंत्र उत्पाद है और Amazon से संबद्ध या Amazon द्वारा समर्थित नहीं है।"
};

export const AMAZON_SELLER_COPY: Record<StudioLanguage, AmazonSellerCopy> = {
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

/**
 * The marketplace table, as the connector holds it
 * (functions-amazon/src/amazon/marketplaces.js AMAZON_MARKETPLACES — 18 rows,
 * Turkey added 18 September 2026). Country names come from Intl.DisplayNames in
 * the visitor's language; the code is the fallback.
 */
export const AMAZON_SELLER_MARKETPLACES: ReadonlyArray<{ region: "eu" | "na" | "fe"; countries: readonly string[] }> = [
  { region: "eu", countries: ["GB", "DE", "FR", "IT", "ES", "NL", "SE", "PL", "TR", "AE", "IN"] },
  { region: "na", countries: ["US", "CA", "MX", "BR"] },
  { region: "fe", countries: ["JP", "AU", "SG"] }
];

