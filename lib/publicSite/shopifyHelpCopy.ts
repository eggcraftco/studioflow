import type { StudioLanguage } from "@/lib/studioflow/language";

/**
 * The public help page for the Shopify app (/integrations/shopify), 15 October 2026.
 *
 * It is the page the App Store listing links as its Tutorial and FAQ: no sign-in, no
 * paid plan (the /guide is paid-only and server-served, so a merchant who has just
 * installed the app cannot read it). Every sentence states what the live product does;
 * the evidence, claim by claim, read on 15 October 2026 from the live sources:
 *
 *   - Scopes read_orders, read_customers, read_products, read_fulfillments only
 *     (shopify.app.toml = Shopify's active version 5); afterAuth reads shop name, e-mail
 *     and currency (Cloud Run nivadesk-connect-00011-ln4, app/shopify.server.ts).
 *   - Paid orders only unless "importUnpaid" (index.js applyShopifyOrderEventLive); filters
 *     include/exclude products, collections, tags; starting stage, task template, assignee
 *     (embedded app.settings.tsx); order updates patch Shopify's own fields only.
 *   - Webhooks HMAC-checked and claimed once per event id; shopifyReconcileOrders every
 *     15 minutes; Sync history with Retry (app.history.tsx).
 *   - Connect: Connection → "Connect existing NivaDesk account" / "Create a NivaDesk
 *     account" → /connect/shopify (nonce, 15 minutes) → sign in / sign up → owner picks the
 *     workspace → "Connect store"; the embedded page polls itself to Connected.
 *   - Plans: SHOPIFY_BILLING_PLANS Starter 12 / Pro 25 / Team 65 USD, EVERY_30_DAYS;
 *     shopifyTrialDaysFor: up to 14 days, once per workspace, website-trial days carried;
 *     uninstall ends the Shopify plan (endShopifyPlansForShop); billed-elsewhere workspaces
 *     keep their plan; tills and add-ons refused for Shopify-billed workspaces
 *     (stripeBilling.js refuseTillForShopifyWorkspace, "add-ons are not for sale").
 *   - Free: 10 active orders (isDelivered / isDeleted don't count), new orders parked in
 *     heldIntegrationOrders for 90 days, released oldest first from the web Orders screen
 *     (releaseHeldIntegrationOrders); updates never take a place (commerce/capacity.js);
 *     Import goes through the same path (manualImport).
 *   - Import: 30 / 90 / 365 days, custom range, selected IDs (max 250); Preview count;
 *     created / skipped / failed; "Sync now" = last 24 hours (app._index.tsx).
 *   - Privacy topics: data requests recorded, customers/redact anonymises the customer on
 *     Shopify-sourced orders (totals kept), shop/redact removes the store record.
 *
 * Plan names are product names and stay untranslated; the app's own button labels stay in
 * English because the app inside Shopify admin is English-only. Screen names in NivaDesk
 * (Orders, Import, Settings › Integrations) use the web app's own translations.
 * Labels this page shares with /integrations/amazon (legal links, contact labels, company
 * line, plan "Free", "per month", the order-list mock's words) come from that table.
 */

type Pair = readonly [title: string, body: string];

export type ShopifyHelpCopy = {
  eyebrow: string;
  heroTitle: string;
  heroIntro: string;
  ctaInstall: string;
  ctaSteps: string;
  heroFacts: readonly [string, string, string];
  mockLabel: string;
  mockCaption: string;
  mockItems: readonly [string, string, string];
  mockStatusDispatched: string;
  statusTitle: string;
  statusLabel: string;
  statusBody: string;
  jobsTitle: string;
  jobsIntro: string;
  jobs: readonly [Pair, Pair, Pair, Pair];
  directionTitle: string;
  readsTitle: string;
  reads: readonly string[];
  writesTitle: string;
  writes: readonly string[];
  directionNote: string;
  syncTitle: string;
  syncFacts: readonly [Pair, Pair, Pair];
  connectTitle: string;
  connectSteps: readonly [Pair, Pair, Pair, Pair, Pair, Pair];
  connectNotes: readonly [string, string];
  pricingTitle: string;
  pricingIntro: string;
  perPeriod: string;
  planNotes: { free: string; starter: string; pro: string; team: string };
  trialNote: string;
  billingFacts: readonly [Pair, Pair, Pair, Pair];
  limitTitle: string;
  limitIntro: string;
  limitPoints: readonly [Pair, Pair, Pair];
  importTitle: string;
  importIntro: string;
  importSteps: readonly [Pair, Pair, Pair];
  importNote: string;
  dataTitle: string;
  data: readonly [Pair, Pair, Pair, Pair];
  faqTitle: string;
  faq: readonly Pair[];
  contactTitle: string;
  contactBody: string;
  trademark: string;
};

const EN: ShopifyHelpCopy = {
  eyebrow: "Shopify app · Setup guide",
  heroTitle: "NivaDesk for Shopify: store orders become production jobs",
  heroIntro: "NivaDesk Order Management is NivaDesk's app on the Shopify App Store. It brings your store's paid orders into your NivaDesk workspace as jobs, with the starting stage, task checklist and assignee you choose, and keeps them up to date as things change in Shopify. This page covers what the app does, how to install and connect it, how plans are billed, the Free plan's limit, importing past orders and where to get help.",
  ctaInstall: "Install from the Shopify App Store",
  ctaSteps: "Setup steps",
  heroFacts: [
    "Read-only access: nothing in your store is changed",
    "Plans are chosen and billed in Shopify",
    "Free plan available; paid plans start with a free trial"
  ],
  mockLabel: "Illustration: the NivaDesk order list with orders from a Shopify store",
  mockCaption: "Illustration with example items. Not real orders.",
  mockItems: ["Custom cake topper", "Engraved ring", "Framed print"],
  mockStatusDispatched: "Dispatched",
  statusTitle: "Availability",
  statusLabel: "Live on the Shopify App Store",
  statusBody: "Published on 12 October 2026 as “NivaDesk Order Management” (developer: EGGcraft Limited). Any Shopify store can install it; connecting needs a NivaDesk account, which you can create for free during setup.",
  jobsTitle: "What the app does",
  jobsIntro: "Only what is listed here. Everything happens in your NivaDesk workspace; your Shopify store is read, never changed.",
  jobs: [
    ["New paid orders become jobs", "Each new paid order arrives with the customer, line items and totals, matched to your existing customer records. Unpaid orders are skipped unless you switch on importing them; an order comes in once Shopify reports it paid."],
    ["Your workflow on every order", "In the app's Sync settings, choose the stage new orders start in, a task checklist to create on each order and a default assignee from your workspace."],
    ["Changes follow from Shopify", "Payment status, fulfilments with courier and tracking number, refunds and cancellations update the job. These updates change the Shopify details only; your notes and tasks stay as they are."],
    ["Choose which orders sync", "Sync every order, or only orders with selected products or collections, and include or leave out orders by tag."]
  ],
  directionTitle: "What it reads, and what it never changes",
  readsTitle: "Reads, with read-only permissions",
  reads: [
    "Orders and their fulfilments",
    "Customers on those orders: name, e-mail, phone and addresses",
    "Products and collections, to apply your filters",
    "Your store's name, e-mail and currency"
  ],
  writesTitle: "Never changed in Shopify",
  writes: ["Products, prices and stock", "Orders, fulfilments and tracking numbers", "Customers", "Your theme and storefront"],
  directionNote: "The app asks Shopify for read permissions only (orders, customers, products, fulfilments), so it has no way to change your store. Tracking numbers are not sent back to Shopify.",
  syncTitle: "How syncing works",
  syncFacts: [
    ["Webhooks", "Shopify tells NivaDesk about new and changed orders as they happen; each delivery is checked against its signature and applied once."],
    ["Catch-up check", "Every 15 minutes NivaDesk also asks your store for orders a webhook may have missed."],
    ["Sync history", "The app's Sync history lists every event with its result; a failed one can be retried from there."]
  ],
  connectTitle: "Install and connect",
  connectSteps: [
    ["Install the app", "Open NivaDesk Order Management on the Shopify App Store, press Install, pick your store and approve the read permissions. The app opens inside your Shopify admin."],
    ["Press Connect", "In the app, open Connection and press “Connect existing NivaDesk account” or “Create a NivaDesk account”. A NivaDesk page opens in a new tab with a one-time code for your store."],
    ["Sign in or sign up", "Sign in to NivaDesk, or create an account with your name, a workspace name, your e-mail and a password. You return to the connect page straight away."],
    ["Choose the workspace", "Pick the workspace this store should sync into and press “Connect store”. Only a workspace owner can connect a store."],
    ["Back to Shopify", "The Connection page in Shopify switches to Connected by itself. From now on, new paid orders sync automatically."],
    ["Settings and past orders", "Optionally set filters, a starting stage, tasks and an assignee in Sync settings, then bring in past orders from Import orders."]
  ],
  connectNotes: [
    "The one-time code is valid for 15 minutes. If it has expired, press Connect again in Shopify.",
    "Already signed in to NivaDesk with a different account? Use “switch account” on the connect page before choosing a workspace."
  ],
  pricingTitle: "Plans, billed by Shopify",
  pricingIntro: "A workspace connected from the Shopify app is billed by Shopify, on your Shopify invoice, in US dollars, every 30 days. Choose or change the plan on the Plans page of the NivaDesk app in your Shopify admin; Shopify asks you to approve each charge.",
  perPeriod: "billed every 30 days",
  planNotes: {
    free: "Up to 10 active orders at a time, unlimited customers, 1 user.",
    starter: "Unlimited orders and customers, 1 user; timeline, notes and history.",
    pro: "Everything in Starter, plus 10 GB of Client Files and advanced finance.",
    team: "Everything in Pro, with 5 users, team messages and roles; 50 GB of Client Files."
  },
  trialNote: "Paid plans start with a free trial of up to 14 days, once per workspace. If your workspace already started a NivaDesk trial on the website, the days left carry over. Nothing is charged until the trial ends.",
  billingFacts: [
    ["Changing plan", "Choose another plan on the Plans page; Shopify shows the new charge for you to approve."],
    ["Cancelling", "Uninstalling the app from Settings › Apps in your Shopify admin cancels its charges. The workspace returns to Free and keeps the orders already in it."],
    ["One way to pay", "A Shopify-billed workspace cannot also buy a plan on nivadesk.app, the App Store or Google Play, and extra seats and storage add-ons are not available for it. A workspace that already pays NivaDesk directly keeps that plan when it connects a store; nothing is charged through Shopify."],
    ["Prices on nivadesk.app", "The prices in pounds on our pricing page are for workspaces billed directly by NivaDesk."]
  ],
  limitTitle: "The Free plan's active-order limit",
  limitIntro: "On Free, up to 10 orders can be active at a time. Delivered and deleted orders don't count, and paid plans have no order limit.",
  limitPoints: [
    ["When the limit is full", "New Shopify orders are not lost. NivaDesk keeps them waiting, for up to 90 days, and shows them at the top of the Orders screen on the web."],
    ["Making room", "Mark finished work as delivered, or choose a paid plan in Shopify, then press Import on the Orders screen. Waiting orders come in oldest first, as far as there is room."],
    ["Updates don't count", "A change to an order that is already in NivaDesk never uses a place. The limit applies to automatic sync and to Import alike."]
  ],
  importTitle: "Import past orders",
  importIntro: "Open Import orders in the app.",
  importSteps: [
    ["Choose what to import", "Last 30 days, last 90 days, last 12 months, a custom date range, or Selected orders only: up to 250 order IDs, the number at the end of an order's address in your Shopify admin."],
    ["Preview", "Press Preview count to see how many orders match."],
    ["Start", "Press Start import. The page shows progress: created, skipped and failed, with the reason for each failure."]
  ],
  importNote: "Orders already in NivaDesk are skipped, your filters apply, and unpaid orders are skipped unless you allow them. Import also works when automatic sync is off. “Sync now” on the app's Home page re-checks the last 24 hours.",
  dataTitle: "Disconnecting, uninstalling and your data",
  data: [
    ["Disconnect", "Connection › Disconnect in the app stops syncing. Nothing already imported is deleted. In NivaDesk, Settings › Integrations shows the connected store and lets the owner pause or remove it."],
    ["Uninstall", "Uninstalling stops syncing and Shopify withdraws the app's access. A plan billed by Shopify ends and the workspace returns to Free; imported orders stay in your workspace."],
    ["Customer privacy requests", "NivaDesk records Shopify's customer data requests, and on a customer redaction request it anonymises that customer's details on orders from your store, keeping the totals. After an uninstall, Shopify's shop redaction request removes the store's connection record."],
    ["Security", "The store's access token is stored encrypted and used only by NivaDesk's servers. Every webhook from Shopify is checked against its signature."]
  ],
  faqTitle: "Questions merchants ask",
  faq: [
    ["Do I need a NivaDesk account?", "Yes. If you don't have one, create it on the connect page during setup; it takes about a minute."],
    ["Which languages does it support?", "The app inside your Shopify admin is in English. NivaDesk itself, on the web, iPhone, iPad, Mac and Android, can be used in 12 languages."],
    ["Why are the prices in US dollars?", "Plans for workspaces installed from Shopify are charged by Shopify, which bills app plans in US dollars."],
    ["Does NivaDesk send tracking numbers back to Shopify?", "No. It reads fulfilments, courier and tracking number from Shopify and never writes to your store."],
    ["An order didn't arrive. What should I check?", "Open Sync history in the app: each event shows its result, and failed ones can be retried. Unpaid orders, orders outside your filters and orders waiting for room on Free are skipped or held on purpose. You can also bring in a single order with Import orders › Selected orders only."],
    ["Can I use NivaDesk on my phone?", "Yes. The same workspace works on the web, iPhone, iPad, Mac and Android. For a workspace billed by Shopify, plan changes are made in the NivaDesk app inside your Shopify admin."]
  ],
  contactTitle: "Help and support",
  contactBody: "Write to us with your store's address (your-store.myshopify.com) and what you see. We usually reply within one business day.",
  trademark: "Shopify is a trademark of Shopify Inc. NivaDesk is an independent product and is not affiliated with or endorsed by Shopify."
};

const TR: ShopifyHelpCopy = {
  eyebrow: "Shopify uygulaması · Kurulum rehberi",
  heroTitle: "Shopify için NivaDesk: mağaza siparişleri üretim işine dönüşür",
  heroIntro: "NivaDesk Order Management, NivaDesk'in Shopify App Store'daki uygulamasıdır. Mağazanızın ödenmiş siparişlerini, seçtiğiniz başlangıç aşaması, görev listesi ve sorumluyla birlikte NivaDesk çalışma alanınıza iş olarak getirir ve Shopify'da bir şey değiştikçe güncel tutar. Bu sayfa uygulamanın ne yaptığını, nasıl kurulup bağlandığını, planların nasıl faturalandığını, Free planın sınırını, geçmiş siparişlerin içe aktarılmasını ve nereden yardım alacağınızı anlatır.",
  ctaInstall: "Shopify App Store'dan yükle",
  ctaSteps: "Kurulum adımları",
  heroFacts: [
    "Salt okuma erişimi: mağazanızda hiçbir şey değiştirilmez",
    "Planlar Shopify'da seçilir ve Shopify tarafından faturalanır",
    "Free plan mevcut; ücretli planlar ücretsiz denemeyle başlar"
  ],
  mockLabel: "Örnek: Shopify mağazasından gelen siparişlerle NivaDesk sipariş listesi",
  mockCaption: "Örnek ürünlerle çizim. Gerçek siparişler değildir.",
  mockItems: ["Kişiye özel pasta süsü", "Gravürlü yüzük", "Çerçeveli baskı"],
  mockStatusDispatched: "Kargolandı",
  statusTitle: "Durum",
  statusLabel: "Shopify App Store'da yayında",
  statusBody: "12 Ekim 2026'da “NivaDesk Order Management” adıyla yayımlandı (geliştirici: EGGcraft Limited). Her Shopify mağazası yükleyebilir; bağlamak için bir NivaDesk hesabı gerekir, kurulum sırasında ücretsiz açabilirsiniz.",
  jobsTitle: "Uygulama ne yapar",
  jobsIntro: "Yalnızca burada yazanları. Her şey NivaDesk çalışma alanınızda olur; Shopify mağazanız okunur, asla değiştirilmez.",
  jobs: [
    ["Yeni ödenmiş siparişler işe dönüşür", "Her yeni ödenmiş sipariş müşteri, ürün satırları ve tutarlarla gelir ve mevcut müşteri kayıtlarınızla eşleştirilir. Ödenmemiş siparişler, içe aktarılmalarını açmadıkça atlanır; Shopify siparişi ödendi olarak bildirdiğinde gelir."],
    ["Her siparişte sizin iş akışınız", "Uygulamanın Sync settings ekranında yeni siparişlerin başlayacağı aşamayı, her siparişte oluşturulacak görev listesini ve çalışma alanınızdan varsayılan sorumluyu seçin."],
    ["Değişiklikler Shopify'dan gelir", "Ödeme durumu, kargo firması ve takip numarasıyla gönderimler, iadeler ve iptaller işi günceller. Bu güncellemeler yalnızca Shopify bilgilerini değiştirir; notlarınız ve görevleriniz olduğu gibi kalır."],
    ["Hangi siparişlerin geleceğini seçin", "Tüm siparişleri ya da yalnızca seçili ürün veya koleksiyonları içeren siparişleri eşitleyin; etikete göre sipariş dahil edin veya dışarıda bırakın."]
  ],
  directionTitle: "Neyi okur, neyi asla değiştirmez",
  readsTitle: "Okur (salt okuma izinleriyle)",
  reads: [
    "Siparişler ve gönderimleri",
    "Bu siparişlerdeki müşteriler: ad, e-posta, telefon ve adresler",
    "Filtrelerinizi uygulamak için ürünler ve koleksiyonlar",
    "Mağazanızın adı, e-postası ve para birimi"
  ],
  writesTitle: "Shopify'da asla değiştirilmez",
  writes: ["Ürünler, fiyatlar ve stok", "Siparişler, gönderimler ve takip numaraları", "Müşteriler", "Temanız ve vitrininiz"],
  directionNote: "Uygulama Shopify'dan yalnızca okuma izinleri ister (siparişler, müşteriler, ürünler, gönderimler); bu yüzden mağazanızı değiştirmesinin bir yolu yoktur. Takip numaraları Shopify'a geri gönderilmez.",
  syncTitle: "Eşitleme nasıl çalışır",
  syncFacts: [
    ["Webhook'lar", "Shopify yeni ve değişen siparişleri olduğu anda NivaDesk'e bildirir; her teslimatın imzası doğrulanır ve bir kez uygulanır."],
    ["Telafi kontrolü", "NivaDesk ayrıca 15 dakikada bir mağazanıza, bir webhook'un kaçırmış olabileceği siparişleri sorar."],
    ["Sync history", "Uygulamanın Sync history ekranı her olayı sonucuyla listeler; başarısız olanı oradan yeniden deneyebilirsiniz."]
  ],
  connectTitle: "Kurulum ve bağlantı",
  connectSteps: [
    ["Uygulamayı yükleyin", "Shopify App Store'da NivaDesk Order Management'ı açın, Install'a basın, mağazanızı seçin ve okuma izinlerini onaylayın. Uygulama Shopify yönetici panelinizin içinde açılır."],
    ["Connect'e basın", "Uygulamada Connection'ı açın ve “Connect existing NivaDesk account” ya da “Create a NivaDesk account” düğmesine basın. Yeni bir sekmede, mağazanıza özel tek kullanımlık kodla bir NivaDesk sayfası açılır."],
    ["Giriş yapın veya kaydolun", "NivaDesk'e giriş yapın ya da adınız, bir çalışma alanı adı, e-postanız ve bir parolayla hesap oluşturun. Hemen bağlantı sayfasına dönersiniz."],
    ["Çalışma alanını seçin", "Bu mağazanın siparişlerinin gideceği çalışma alanını seçin ve “Connect store”a basın. Mağazayı yalnızca çalışma alanı sahibi bağlayabilir."],
    ["Shopify'a dönün", "Shopify'daki Connection sayfası kendiliğinden Connected olur. Bundan sonra yeni ödenmiş siparişler otomatik eşitlenir."],
    ["Ayarlar ve geçmiş siparişler", "İsterseniz Sync settings'te filtreleri, başlangıç aşamasını, görevleri ve sorumluyu ayarlayın, ardından geçmiş siparişleri Import orders'tan getirin."]
  ],
  connectNotes: [
    "Tek kullanımlık kod 15 dakika geçerlidir. Süresi dolduysa Shopify'da Connect'e yeniden basın.",
    "NivaDesk'te başka bir hesapla mı oturum açıksınız? Çalışma alanını seçmeden önce bağlantı sayfasındaki “switch account” bağlantısını kullanın."
  ],
  pricingTitle: "Planlar, Shopify tarafından faturalanır",
  pricingIntro: "Shopify uygulamasından bağlanan bir çalışma alanı Shopify tarafından, Shopify faturanızda, ABD doları cinsinden ve 30 günde bir faturalanır. Planı Shopify yönetici panelinizdeki NivaDesk uygulamasının Plans sayfasında seçer veya değiştirirsiniz; Shopify her ücreti onayınıza sunar.",
  perPeriod: "30 günde bir faturalanır",
  planNotes: {
    free: "Aynı anda en fazla 10 aktif sipariş, sınırsız müşteri, 1 kullanıcı.",
    starter: "Sınırsız sipariş ve müşteri, 1 kullanıcı; zaman çizelgesi, notlar ve geçmiş.",
    pro: "Starter'daki her şey, ayrıca 10 GB Client Files ve gelişmiş finans.",
    team: "Pro'daki her şey; 5 kullanıcı, ekip mesajları ve roller; 50 GB Client Files."
  },
  trialNote: "Ücretli planlar, çalışma alanı başına bir kez, en fazla 14 günlük ücretsiz denemeyle başlar. Çalışma alanınız web sitesinde bir NivaDesk denemesi başlattıysa kalan günler aktarılır. Deneme bitene kadar ücret alınmaz.",
  billingFacts: [
    ["Plan değiştirme", "Plans sayfasında başka bir plan seçin; Shopify yeni ücreti onayınıza sunar."],
    ["İptal", "Uygulamayı Shopify yönetici panelinizde Settings › Apps'ten kaldırmak ücretlerini iptal eder. Çalışma alanı Free'ye döner ve içindeki siparişleri korur."],
    ["Tek ödeme yolu", "Shopify'la faturalanan bir çalışma alanı nivadesk.app, App Store veya Google Play'den ayrıca plan alamaz; ek kullanıcı ve depolama eklentileri de bu alan için sunulmaz. Zaten doğrudan NivaDesk'e ödeyen bir çalışma alanı mağaza bağladığında planını korur; Shopify üzerinden ücret alınmaz."],
    ["nivadesk.app'teki fiyatlar", "Fiyat sayfamızdaki sterlin fiyatları, NivaDesk tarafından doğrudan faturalanan çalışma alanları içindir."]
  ],
  limitTitle: "Free planın aktif sipariş sınırı",
  limitIntro: "Free'de aynı anda en fazla 10 sipariş aktif olabilir. Teslim edilen ve silinen siparişler sayılmaz; ücretli planlarda sipariş sınırı yoktur.",
  limitPoints: [
    ["Sınır dolduğunda", "Yeni Shopify siparişleri kaybolmaz. NivaDesk onları en fazla 90 gün bekletir ve web'deki Siparişler ekranının üstünde gösterir."],
    ["Yer açmak", "Biten işleri teslim edildi olarak işaretleyin ya da Shopify'da ücretli bir plan seçin, sonra Siparişler ekranında İçe aktar'a basın. Bekleyen siparişler en eskiden başlayarak, yer olduğu kadar gelir."],
    ["Güncellemeler sayılmaz", "NivaDesk'te zaten bulunan bir siparişteki değişiklik asla yer kullanmaz. Sınır otomatik eşitlemeye de içe aktarmaya da aynı şekilde uygulanır."]
  ],
  importTitle: "Geçmiş siparişleri içe aktarın",
  importIntro: "Uygulamada Import orders'ı açın.",
  importSteps: [
    ["Neyin geleceğini seçin", "Son 30 gün, son 90 gün, son 12 ay, özel bir tarih aralığı ya da Selected orders only: en fazla 250 sipariş kimliği, yani Shopify yönetici panelinde siparişin adresinin sonundaki sayı."],
    ["Önizleyin", "Kaç siparişin eşleştiğini görmek için Preview count'a basın."],
    ["Başlatın", "Start import'a basın. Sayfa ilerlemeyi gösterir: oluşturulan, atlanan ve başarısız olanlar, her hatanın nedeniyle."]
  ],
  importNote: "NivaDesk'te zaten olan siparişler atlanır, filtreleriniz uygulanır ve izin vermedikçe ödenmemiş siparişler atlanır. İçe aktarma, otomatik eşitleme kapalıyken de çalışır. Uygulamanın Home sayfasındaki “Sync now” son 24 saati yeniden kontrol eder.",
  dataTitle: "Bağlantıyı kesmek, kaldırmak ve verileriniz",
  data: [
    ["Bağlantıyı kesme", "Uygulamada Connection › Disconnect eşitlemeyi durdurur. İçe aktarılmış hiçbir şey silinmez. NivaDesk'te Ayarlar › Entegrasyonlar bağlı mağazayı gösterir; sahip onu oradan duraklatabilir veya kaldırabilir."],
    ["Kaldırma", "Kaldırmak eşitlemeyi durdurur ve Shopify uygulamanın erişimini geri alır. Shopify'la faturalanan plan sona erer ve çalışma alanı Free'ye döner; içe aktarılan siparişler çalışma alanınızda kalır."],
    ["Müşteri gizlilik talepleri", "NivaDesk, Shopify'ın müşteri veri taleplerini kayda alır; bir müşteri silme talebinde o müşterinin mağazanızdan gelen siparişlerdeki bilgilerini, tutarları koruyarak anonimleştirir. Kaldırmadan sonra Shopify'ın mağaza silme talebi mağazanın bağlantı kaydını siler."],
    ["Güvenlik", "Mağazanın erişim anahtarı şifreli saklanır ve yalnızca NivaDesk sunucuları tarafından kullanılır. Shopify'dan gelen her webhook imzasıyla doğrulanır."]
  ],
  faqTitle: "Satıcıların sorduğu sorular",
  faq: [
    ["NivaDesk hesabına ihtiyacım var mı?", "Evet. Hesabınız yoksa kurulum sırasında bağlantı sayfasında oluşturun; yaklaşık bir dakika sürer."],
    ["Hangi dilleri destekliyor?", "Shopify yönetici panelinizdeki uygulama İngilizcedir. NivaDesk'in kendisi web'de, iPhone, iPad, Mac ve Android'de Türkçe dahil 12 dilde kullanılabilir."],
    ["Fiyatlar neden ABD doları?", "Shopify'dan kurulan çalışma alanlarının planlarını Shopify tahsil eder; Shopify uygulama planlarını ABD doları ile faturalar."],
    ["NivaDesk takip numaralarını Shopify'a geri gönderir mi?", "Hayır. Gönderimleri, kargo firmasını ve takip numarasını Shopify'dan okur, mağazanıza asla yazmaz."],
    ["Bir sipariş gelmedi. Neye bakmalıyım?", "Uygulamada Sync history'yi açın: her olay sonucunu gösterir, başarısız olanlar yeniden denenebilir. Ödenmemiş siparişler, filtrelerinizin dışında kalanlar ve Free'de yer bekleyenler bilerek atlanır veya bekletilir. Tek bir siparişi Import orders › Selected orders only ile de getirebilirsiniz."],
    ["NivaDesk'i telefonda kullanabilir miyim?", "Evet. Aynı çalışma alanı web'de, iPhone, iPad, Mac ve Android'de çalışır. Shopify'la faturalanan bir çalışma alanında plan değişiklikleri Shopify yönetici panelinizdeki NivaDesk uygulamasında yapılır."]
  ],
  contactTitle: "Yardım ve destek",
  contactBody: "Mağazanızın adresini (magazaniz.myshopify.com) ve ne gördüğünüzü yazarak bize ulaşın. Genellikle bir iş günü içinde yanıt veririz.",
  trademark: "Shopify, Shopify Inc.'in ticari markasıdır. NivaDesk bağımsız bir üründür; Shopify ile bağlantılı değildir ve Shopify tarafından onaylanmamıştır."
};

const DE: ShopifyHelpCopy = {
  eyebrow: "Shopify-App · Einrichtung",
  heroTitle: "NivaDesk für Shopify: Shop-Bestellungen werden Produktionsaufträge",
  heroIntro: "NivaDesk Order Management ist die App von NivaDesk im Shopify App Store. Sie holt die bezahlten Bestellungen deines Shops als Aufträge in deinen NivaDesk-Arbeitsbereich, mit der Startphase, Aufgabenliste und zuständigen Person, die du festlegst, und hält sie aktuell, wenn sich in Shopify etwas ändert. Diese Seite erklärt, was die App macht, wie du sie installierst und verbindest, wie Tarife abgerechnet werden, das Limit des Free-Tarifs, den Import früherer Bestellungen und wo du Hilfe bekommst.",
  ctaInstall: "Aus dem Shopify App Store installieren",
  ctaSteps: "Schritte zur Einrichtung",
  heroFacts: [
    "Nur Lesezugriff: In deinem Shop wird nichts geändert",
    "Tarife werden in Shopify gewählt und von Shopify abgerechnet",
    "Free-Tarif verfügbar; bezahlte Tarife beginnen mit einer kostenlosen Testphase"
  ],
  mockLabel: "Illustration: die NivaDesk-Auftragsliste mit Bestellungen aus einem Shopify-Shop",
  mockCaption: "Illustration mit Beispielartikeln. Keine echten Bestellungen.",
  mockItems: ["Individueller Tortenaufsatz", "Gravierter Ring", "Gerahmter Druck"],
  mockStatusDispatched: "Versendet",
  statusTitle: "Verfügbarkeit",
  statusLabel: "Live im Shopify App Store",
  statusBody: "Am 12. Oktober 2026 als „NivaDesk Order Management“ veröffentlicht (Entwickler: EGGcraft Limited). Jeder Shopify-Shop kann die App installieren; zum Verbinden brauchst du ein NivaDesk-Konto, das du bei der Einrichtung kostenlos anlegen kannst.",
  jobsTitle: "Was die App macht",
  jobsIntro: "Nur das, was hier steht. Alles passiert in deinem NivaDesk-Arbeitsbereich; dein Shopify-Shop wird gelesen, nie verändert.",
  jobs: [
    ["Neue bezahlte Bestellungen werden Aufträge", "Jede neue bezahlte Bestellung kommt mit Kunde, Positionen und Summen an und wird deinen bestehenden Kundendatensätzen zugeordnet. Unbezahlte Bestellungen werden übersprungen, außer du lässt ihren Import zu; eine Bestellung kommt, sobald Shopify sie als bezahlt meldet."],
    ["Dein Ablauf bei jeder Bestellung", "Lege in den Sync settings der App fest, in welcher Phase neue Bestellungen starten, welche Aufgabenliste bei jeder Bestellung entsteht und wer aus deinem Arbeitsbereich standardmäßig zuständig ist."],
    ["Änderungen kommen aus Shopify", "Zahlungsstatus, Sendungen mit Versanddienst und Sendungsnummer, Erstattungen und Stornierungen aktualisieren den Auftrag. Dabei ändern sich nur die Shopify-Angaben; deine Notizen und Aufgaben bleiben, wie sie sind."],
    ["Wähle, welche Bestellungen kommen", "Synchronisiere alle Bestellungen oder nur solche mit ausgewählten Produkten oder Kollektionen, und nimm Bestellungen per Tag auf oder lass sie weg."]
  ],
  directionTitle: "Was die App liest – und was sie nie ändert",
  readsTitle: "Liest, mit reinen Leseberechtigungen",
  reads: [
    "Bestellungen und ihre Sendungen",
    "Kunden dieser Bestellungen: Name, E-Mail, Telefon und Adressen",
    "Produkte und Kollektionen, um deine Filter anzuwenden",
    "Name, E-Mail und Währung deines Shops"
  ],
  writesTitle: "Wird in Shopify nie geändert",
  writes: ["Produkte, Preise und Lagerbestand", "Bestellungen, Sendungen und Sendungsnummern", "Kunden", "Dein Theme und deine Storefront"],
  directionNote: "Die App fragt bei Shopify nur Leseberechtigungen an (Bestellungen, Kunden, Produkte, Sendungen) und kann deinen Shop daher nicht verändern. Sendungsnummern werden nicht an Shopify zurückgeschickt.",
  syncTitle: "So funktioniert die Synchronisierung",
  syncFacts: [
    ["Webhooks", "Shopify meldet neue und geänderte Bestellungen sofort an NivaDesk; jede Zustellung wird über ihre Signatur geprüft und genau einmal angewendet."],
    ["Nachholprüfung", "Alle 15 Minuten fragt NivaDesk deinen Shop zusätzlich nach Bestellungen, die ein Webhook verpasst haben könnte."],
    ["Sync history", "Die Sync history der App listet jedes Ereignis mit seinem Ergebnis; ein fehlgeschlagenes kannst du dort erneut ausführen."]
  ],
  connectTitle: "Installieren und verbinden",
  connectSteps: [
    ["App installieren", "Öffne NivaDesk Order Management im Shopify App Store, drücke Install, wähle deinen Shop und bestätige die Leseberechtigungen. Die App öffnet sich in deinem Shopify-Adminbereich."],
    ["Connect drücken", "Öffne in der App Connection und drücke „Connect existing NivaDesk account“ oder „Create a NivaDesk account“. In einem neuen Tab öffnet sich eine NivaDesk-Seite mit einem einmaligen Code für deinen Shop."],
    ["Anmelden oder registrieren", "Melde dich bei NivaDesk an oder lege ein Konto mit deinem Namen, einem Namen für den Arbeitsbereich, deiner E-Mail und einem Passwort an. Du landest direkt wieder auf der Verbindungsseite."],
    ["Arbeitsbereich wählen", "Wähle den Arbeitsbereich, in den dieser Shop synchronisieren soll, und drücke „Connect store“. Nur die Inhaberin oder der Inhaber des Arbeitsbereichs kann einen Shop verbinden."],
    ["Zurück zu Shopify", "Die Connection-Seite in Shopify springt von selbst auf Connected. Ab jetzt werden neue bezahlte Bestellungen automatisch synchronisiert."],
    ["Einstellungen und frühere Bestellungen", "Lege bei Bedarf in den Sync settings Filter, Startphase, Aufgaben und zuständige Person fest und hole dann frühere Bestellungen über Import orders."]
  ],
  connectNotes: [
    "Der einmalige Code gilt 15 Minuten. Ist er abgelaufen, drücke in Shopify erneut Connect.",
    "Du bist bei NivaDesk mit einem anderen Konto angemeldet? Nutze auf der Verbindungsseite zuerst „switch account“, bevor du einen Arbeitsbereich wählst."
  ],
  pricingTitle: "Tarife, abgerechnet von Shopify",
  pricingIntro: "Ein über die Shopify-App verbundener Arbeitsbereich wird von Shopify abgerechnet: auf deiner Shopify-Rechnung, in US-Dollar, alle 30 Tage. Du wählst oder wechselst den Tarif auf der Plans-Seite der NivaDesk-App in deinem Shopify-Adminbereich; Shopify legt dir jede Belastung zur Bestätigung vor.",
  perPeriod: "Abrechnung alle 30 Tage",
  planNotes: {
    free: "Bis zu 10 aktive Aufträge gleichzeitig, unbegrenzt Kunden, 1 Person.",
    starter: "Unbegrenzt Aufträge und Kunden, 1 Person; Zeitleiste, Notizen und Verlauf.",
    pro: "Alles aus Starter, dazu 10 GB Client Files und erweiterte Finanzen.",
    team: "Alles aus Pro, mit 5 Personen, Teamnachrichten und Rollen; 50 GB Client Files."
  },
  trialNote: "Bezahlte Tarife beginnen mit einer kostenlosen Testphase von bis zu 14 Tagen, einmal pro Arbeitsbereich. Hat dein Arbeitsbereich auf der Website schon eine NivaDesk-Testphase begonnen, werden die verbleibenden Tage übernommen. Bis zum Ende der Testphase wird nichts berechnet.",
  billingFacts: [
    ["Tarif wechseln", "Wähle auf der Plans-Seite einen anderen Tarif; Shopify zeigt dir die neue Belastung zur Bestätigung."],
    ["Kündigen", "Wenn du die App in deinem Shopify-Adminbereich unter Settings › Apps deinstallierst, enden ihre Belastungen. Der Arbeitsbereich wechselt zu Free und behält die Aufträge, die schon darin sind."],
    ["Ein Zahlungsweg", "Ein über Shopify abgerechneter Arbeitsbereich kann nicht zusätzlich auf nivadesk.app, im App Store oder bei Google Play einen Tarif kaufen; zusätzliche Plätze und Speicher-Add-ons gibt es dafür nicht. Ein Arbeitsbereich, der NivaDesk schon direkt bezahlt, behält seinen Tarif, wenn er einen Shop verbindet; über Shopify wird nichts berechnet."],
    ["Preise auf nivadesk.app", "Die Pfund-Preise auf unserer Preisseite gelten für Arbeitsbereiche, die direkt von NivaDesk abgerechnet werden."]
  ],
  limitTitle: "Das Auftragslimit im Free-Tarif",
  limitIntro: "Im Free-Tarif können bis zu 10 Aufträge gleichzeitig aktiv sein. Gelieferte und gelöschte Aufträge zählen nicht, und bezahlte Tarife haben kein Auftragslimit.",
  limitPoints: [
    ["Wenn das Limit erreicht ist", "Neue Shopify-Bestellungen gehen nicht verloren. NivaDesk lässt sie bis zu 90 Tage warten und zeigt sie oben auf dem Bildschirm Aufträge im Web."],
    ["Platz schaffen", "Markiere fertige Arbeiten als geliefert oder wähle in Shopify einen bezahlten Tarif und drücke dann auf dem Bildschirm Aufträge auf Importieren. Wartende Bestellungen kommen, die älteste zuerst, so weit Platz ist."],
    ["Änderungen zählen nicht", "Eine Änderung an einer Bestellung, die schon in NivaDesk ist, belegt nie einen Platz. Das Limit gilt für die automatische Synchronisierung und den Import gleichermaßen."]
  ],
  importTitle: "Frühere Bestellungen importieren",
  importIntro: "Öffne in der App Import orders.",
  importSteps: [
    ["Auswahl festlegen", "Letzte 30 Tage, letzte 90 Tage, letzte 12 Monate, ein eigener Zeitraum oder Selected orders only: bis zu 250 Bestell-IDs, also die Zahl am Ende der Adresse einer Bestellung in deinem Shopify-Adminbereich."],
    ["Vorschau", "Drücke Preview count, um zu sehen, wie viele Bestellungen passen."],
    ["Starten", "Drücke Start import. Die Seite zeigt den Fortschritt: angelegt, übersprungen und fehlgeschlagen, jeweils mit Grund."]
  ],
  importNote: "Bestellungen, die schon in NivaDesk sind, werden übersprungen, deine Filter gelten, und unbezahlte Bestellungen werden übersprungen, außer du lässt sie zu. Der Import funktioniert auch bei ausgeschalteter automatischer Synchronisierung. „Sync now“ auf der Home-Seite der App prüft die letzten 24 Stunden erneut.",
  dataTitle: "Trennen, deinstallieren und deine Daten",
  data: [
    ["Trennen", "Connection › Disconnect in der App beendet die Synchronisierung. Bereits Importiertes wird nicht gelöscht. In NivaDesk zeigt Einstellungen › Integrationen den verbundenen Shop; die Inhaberin oder der Inhaber kann ihn dort pausieren oder entfernen."],
    ["Deinstallieren", "Die Deinstallation beendet die Synchronisierung, und Shopify entzieht der App den Zugriff. Ein über Shopify abgerechneter Tarif endet, und der Arbeitsbereich wechselt zu Free; importierte Aufträge bleiben in deinem Arbeitsbereich."],
    ["Datenschutzanfragen von Kunden", "NivaDesk protokolliert Shopifys Anfragen zu Kundendaten und anonymisiert bei einer Löschanfrage die Angaben dieses Kunden in den Aufträgen aus deinem Shop, wobei die Beträge erhalten bleiben. Nach einer Deinstallation entfernt Shopifys Shop-Löschanfrage den Verbindungsdatensatz des Shops."],
    ["Sicherheit", "Das Zugriffstoken des Shops wird verschlüsselt gespeichert und nur von den Servern von NivaDesk verwendet. Jeder Webhook von Shopify wird anhand seiner Signatur geprüft."]
  ],
  faqTitle: "Fragen von Händlern",
  faq: [
    ["Brauche ich ein NivaDesk-Konto?", "Ja. Wenn du noch keins hast, legst du es bei der Einrichtung auf der Verbindungsseite an; das dauert etwa eine Minute."],
    ["In welchen Sprachen gibt es die App?", "Die App in deinem Shopify-Adminbereich ist auf Englisch. NivaDesk selbst kannst du im Web, auf iPhone, iPad, Mac und Android in 12 Sprachen nutzen, auch auf Deutsch."],
    ["Warum sind die Preise in US-Dollar?", "Tarife für über Shopify installierte Arbeitsbereiche berechnet Shopify, und Shopify rechnet App-Tarife in US-Dollar ab."],
    ["Schickt NivaDesk Sendungsnummern an Shopify zurück?", "Nein. NivaDesk liest Sendungen, Versanddienst und Sendungsnummer aus Shopify und schreibt nie in deinen Shop."],
    ["Eine Bestellung ist nicht angekommen. Was prüfe ich?", "Öffne die Sync history der App: Jedes Ereignis zeigt sein Ergebnis, fehlgeschlagene kannst du erneut ausführen. Unbezahlte Bestellungen, Bestellungen außerhalb deiner Filter und Bestellungen, die im Free-Tarif auf Platz warten, werden absichtlich übersprungen oder zurückgehalten. Eine einzelne Bestellung holst du über Import orders › Selected orders only."],
    ["Kann ich NivaDesk auf dem Handy nutzen?", "Ja. Derselbe Arbeitsbereich läuft im Web, auf iPhone, iPad, Mac und Android. Bei einem über Shopify abgerechneten Arbeitsbereich änderst du den Tarif in der NivaDesk-App in deinem Shopify-Adminbereich."]
  ],
  contactTitle: "Hilfe und Support",
  contactBody: "Schreib uns mit der Adresse deines Shops (dein-shop.myshopify.com) und dem, was du siehst. Wir antworten in der Regel innerhalb eines Werktags.",
  trademark: "Shopify ist eine Marke von Shopify Inc. NivaDesk ist ein unabhängiges Produkt, steht in keiner Verbindung zu Shopify und wird nicht von Shopify unterstützt."
};

const FR: ShopifyHelpCopy = {
  eyebrow: "App Shopify · Guide d'installation",
  heroTitle: "NivaDesk pour Shopify : les commandes de la boutique deviennent des travaux de production",
  heroIntro: "NivaDesk Order Management est l'application NivaDesk du Shopify App Store. Elle importe les commandes payées de votre boutique dans votre espace de travail NivaDesk sous forme de travaux, avec l'étape de départ, la liste de tâches et la personne responsable de votre choix, et les tient à jour quand quelque chose change dans Shopify. Cette page explique ce que fait l'application, comment l'installer et la connecter, comment les forfaits sont facturés, la limite du forfait Free, l'import des commandes passées et où obtenir de l'aide.",
  ctaInstall: "Installer depuis le Shopify App Store",
  ctaSteps: "Étapes d'installation",
  heroFacts: [
    "Accès en lecture seule : rien n'est modifié dans votre boutique",
    "Les forfaits sont choisis et facturés dans Shopify",
    "Forfait Free disponible ; les forfaits payants commencent par un essai gratuit"
  ],
  mockLabel: "Illustration : la liste des commandes NivaDesk avec des commandes d'une boutique Shopify",
  mockCaption: "Illustration avec des exemples. Pas de vraies commandes.",
  mockItems: ["Décor de gâteau personnalisé", "Bague gravée", "Tirage encadré"],
  mockStatusDispatched: "Expédiée",
  statusTitle: "Disponibilité",
  statusLabel: "En ligne sur le Shopify App Store",
  statusBody: "Publiée le 12 octobre 2026 sous le nom « NivaDesk Order Management » (développeur : EGGcraft Limited). Toute boutique Shopify peut l'installer ; la connexion demande un compte NivaDesk, que vous pouvez créer gratuitement pendant l'installation.",
  jobsTitle: "Ce que fait l'application",
  jobsIntro: "Uniquement ce qui est indiqué ici. Tout se passe dans votre espace de travail NivaDesk ; votre boutique Shopify est lue, jamais modifiée.",
  jobs: [
    ["Les nouvelles commandes payées deviennent des travaux", "Chaque nouvelle commande payée arrive avec le client, les lignes d'articles et les totaux, et elle est associée à vos fiches clients existantes. Les commandes non payées sont ignorées, sauf si vous autorisez leur import ; une commande arrive dès que Shopify l'indique payée."],
    ["Votre processus sur chaque commande", "Dans les Sync settings de l'application, choisissez l'étape de départ des nouvelles commandes, la liste de tâches créée sur chaque commande et la personne responsable par défaut dans votre espace."],
    ["Les changements viennent de Shopify", "Le statut de paiement, les expéditions avec transporteur et numéro de suivi, les remboursements et les annulations mettent le travail à jour. Ces mises à jour ne changent que les informations Shopify ; vos notes et vos tâches restent telles quelles."],
    ["Choisissez les commandes synchronisées", "Synchronisez toutes les commandes, ou seulement celles qui contiennent des produits ou collections choisis, et incluez ou excluez des commandes par tag."]
  ],
  directionTitle: "Ce qu'elle lit, et ce qu'elle ne modifie jamais",
  readsTitle: "Lit, avec des autorisations en lecture seule",
  reads: [
    "Les commandes et leurs expéditions",
    "Les clients de ces commandes : nom, e-mail, téléphone et adresses",
    "Les produits et collections, pour appliquer vos filtres",
    "Le nom, l'e-mail et la devise de votre boutique"
  ],
  writesTitle: "Jamais modifié dans Shopify",
  writes: ["Produits, prix et stock", "Commandes, expéditions et numéros de suivi", "Clients", "Votre thème et votre vitrine"],
  directionNote: "L'application ne demande à Shopify que des autorisations de lecture (commandes, clients, produits, expéditions) : elle n'a donc aucun moyen de modifier votre boutique. Les numéros de suivi ne sont pas renvoyés à Shopify.",
  syncTitle: "Comment fonctionne la synchronisation",
  syncFacts: [
    ["Webhooks", "Shopify signale à NivaDesk les commandes nouvelles et modifiées dès qu'elles arrivent ; chaque envoi est vérifié par sa signature et appliqué une seule fois."],
    ["Vérification de rattrapage", "Toutes les 15 minutes, NivaDesk demande aussi à votre boutique les commandes qu'un webhook aurait pu manquer."],
    ["Sync history", "La page Sync history de l'application liste chaque événement avec son résultat ; un événement en échec peut y être relancé."]
  ],
  connectTitle: "Installer et connecter",
  connectSteps: [
    ["Installez l'application", "Ouvrez NivaDesk Order Management sur le Shopify App Store, appuyez sur Install, choisissez votre boutique et acceptez les autorisations de lecture. L'application s'ouvre dans votre admin Shopify."],
    ["Appuyez sur Connect", "Dans l'application, ouvrez Connection et appuyez sur « Connect existing NivaDesk account » ou « Create a NivaDesk account ». Une page NivaDesk s'ouvre dans un nouvel onglet avec un code à usage unique pour votre boutique."],
    ["Connectez-vous ou inscrivez-vous", "Connectez-vous à NivaDesk, ou créez un compte avec votre nom, un nom d'espace de travail, votre e-mail et un mot de passe. Vous revenez aussitôt sur la page de connexion de la boutique."],
    ["Choisissez l'espace de travail", "Choisissez l'espace dans lequel cette boutique doit se synchroniser et appuyez sur « Connect store ». Seul le propriétaire de l'espace peut connecter une boutique."],
    ["Retour dans Shopify", "La page Connection de Shopify passe d'elle-même à Connected. Dès lors, les nouvelles commandes payées se synchronisent automatiquement."],
    ["Réglages et commandes passées", "Si vous le souhaitez, définissez filtres, étape de départ, tâches et responsable dans Sync settings, puis importez les commandes passées depuis Import orders."]
  ],
  connectNotes: [
    "Le code à usage unique est valable 15 minutes. S'il a expiré, appuyez à nouveau sur Connect dans Shopify.",
    "Déjà connecté à NivaDesk avec un autre compte ? Utilisez « switch account » sur la page de connexion de la boutique avant de choisir un espace de travail."
  ],
  pricingTitle: "Forfaits facturés par Shopify",
  pricingIntro: "Un espace de travail connecté depuis l'application Shopify est facturé par Shopify, sur votre facture Shopify, en dollars américains, tous les 30 jours. Vous choisissez ou changez de forfait sur la page Plans de l'application NivaDesk dans votre admin Shopify ; Shopify vous demande d'approuver chaque débit.",
  perPeriod: "facturé tous les 30 jours",
  planNotes: {
    free: "Jusqu'à 10 commandes actives à la fois, clients illimités, 1 utilisateur.",
    starter: "Commandes et clients illimités, 1 utilisateur ; chronologie, notes et historique.",
    pro: "Tout Starter, plus 10 Go de Client Files et la finance avancée.",
    team: "Tout Pro, avec 5 utilisateurs, messages d'équipe et rôles ; 50 Go de Client Files."
  },
  trialNote: "Les forfaits payants commencent par un essai gratuit de 14 jours maximum, une fois par espace de travail. Si votre espace avait déjà commencé un essai NivaDesk sur le site, les jours restants sont repris. Rien n'est facturé avant la fin de l'essai.",
  billingFacts: [
    ["Changer de forfait", "Choisissez un autre forfait sur la page Plans ; Shopify vous présente le nouveau débit à approuver."],
    ["Résilier", "Désinstaller l'application depuis Settings › Apps dans votre admin Shopify met fin à ses débits. L'espace repasse en Free et garde les commandes qu'il contient déjà."],
    ["Un seul moyen de paiement", "Un espace facturé par Shopify ne peut pas acheter en plus un forfait sur nivadesk.app, l'App Store ou Google Play, et les places supplémentaires et options de stockage ne lui sont pas proposées. Un espace qui paie déjà NivaDesk directement garde son forfait lorsqu'il connecte une boutique ; rien n'est facturé via Shopify."],
    ["Prix sur nivadesk.app", "Les prix en livres sterling de notre page tarifs concernent les espaces facturés directement par NivaDesk."]
  ],
  limitTitle: "La limite de commandes actives du forfait Free",
  limitIntro: "Avec Free, jusqu'à 10 commandes peuvent être actives à la fois. Les commandes livrées et supprimées ne comptent pas, et les forfaits payants n'ont pas de limite de commandes.",
  limitPoints: [
    ["Quand la limite est atteinte", "Les nouvelles commandes Shopify ne sont pas perdues. NivaDesk les met en attente, jusqu'à 90 jours, et les affiche en haut de l'écran Commandes sur le web."],
    ["Faire de la place", "Marquez le travail terminé comme livré, ou choisissez un forfait payant dans Shopify, puis appuyez sur Importer dans l'écran Commandes. Les commandes en attente arrivent de la plus ancienne à la plus récente, dans la limite de la place disponible."],
    ["Les mises à jour ne comptent pas", "Une modification d'une commande déjà présente dans NivaDesk n'utilise jamais de place. La limite s'applique de la même façon à la synchronisation automatique et à l'import."]
  ],
  importTitle: "Importer les commandes passées",
  importIntro: "Ouvrez Import orders dans l'application.",
  importSteps: [
    ["Choisissez quoi importer", "Les 30 derniers jours, les 90 derniers jours, les 12 derniers mois, une période personnalisée, ou Selected orders only : jusqu'à 250 identifiants de commande, c'est-à-dire le nombre à la fin de l'adresse d'une commande dans votre admin Shopify."],
    ["Aperçu", "Appuyez sur Preview count pour voir combien de commandes correspondent."],
    ["Lancez", "Appuyez sur Start import. La page affiche la progression : créées, ignorées et en échec, avec la raison de chaque échec."]
  ],
  importNote: "Les commandes déjà dans NivaDesk sont ignorées, vos filtres s'appliquent et les commandes non payées sont ignorées sauf si vous les autorisez. L'import fonctionne aussi quand la synchronisation automatique est désactivée. « Sync now » sur la page Home de l'application revérifie les dernières 24 heures.",
  dataTitle: "Déconnexion, désinstallation et vos données",
  data: [
    ["Déconnecter", "Connection › Disconnect dans l'application arrête la synchronisation. Rien de ce qui a été importé n'est supprimé. Dans NivaDesk, Paramètres › Intégrations affiche la boutique connectée et permet au propriétaire de la mettre en pause ou de la retirer."],
    ["Désinstaller", "La désinstallation arrête la synchronisation et Shopify retire l'accès de l'application. Un forfait facturé par Shopify prend fin et l'espace repasse en Free ; les commandes importées restent dans votre espace."],
    ["Demandes de confidentialité des clients", "NivaDesk enregistre les demandes de données clients envoyées par Shopify et, lors d'une demande d'effacement d'un client, anonymise ses informations sur les commandes de votre boutique en conservant les montants. Après une désinstallation, la demande d'effacement de boutique de Shopify supprime l'enregistrement de connexion de la boutique."],
    ["Sécurité", "Le jeton d'accès de la boutique est stocké chiffré et utilisé uniquement par les serveurs de NivaDesk. Chaque webhook de Shopify est vérifié grâce à sa signature."]
  ],
  faqTitle: "Questions des marchands",
  faq: [
    ["Ai-je besoin d'un compte NivaDesk ?", "Oui. Si vous n'en avez pas, créez-le sur la page de connexion pendant l'installation ; cela prend environ une minute."],
    ["Dans quelles langues ?", "L'application dans votre admin Shopify est en anglais. NivaDesk lui-même, sur le web, iPhone, iPad, Mac et Android, s'utilise en 12 langues, dont le français."],
    ["Pourquoi les prix sont-ils en dollars américains ?", "Les forfaits des espaces installés depuis Shopify sont facturés par Shopify, qui facture les forfaits d'applications en dollars américains."],
    ["NivaDesk renvoie-t-il les numéros de suivi à Shopify ?", "Non. Il lit les expéditions, le transporteur et le numéro de suivi dans Shopify et n'écrit jamais dans votre boutique."],
    ["Une commande n'est pas arrivée. Que vérifier ?", "Ouvrez Sync history dans l'application : chaque événement indique son résultat et ceux en échec peuvent être relancés. Les commandes non payées, hors de vos filtres ou en attente de place avec Free sont ignorées ou retenues volontairement. Vous pouvez aussi importer une seule commande via Import orders › Selected orders only."],
    ["Puis-je utiliser NivaDesk sur mon téléphone ?", "Oui. Le même espace fonctionne sur le web, iPhone, iPad, Mac et Android. Pour un espace facturé par Shopify, le forfait se change dans l'application NivaDesk de votre admin Shopify."]
  ],
  contactTitle: "Aide et assistance",
  contactBody: "Écrivez-nous en indiquant l'adresse de votre boutique (votre-boutique.myshopify.com) et ce que vous voyez. Nous répondons généralement sous un jour ouvré.",
  trademark: "Shopify est une marque de Shopify Inc. NivaDesk est un produit indépendant, ni affilié à Shopify ni approuvé par Shopify."
};

const IT: ShopifyHelpCopy = {
  eyebrow: "App Shopify · Guida alla configurazione",
  heroTitle: "NivaDesk per Shopify: gli ordini del negozio diventano lavori di produzione",
  heroIntro: "NivaDesk Order Management è l'app di NivaDesk sullo Shopify App Store. Porta gli ordini pagati del tuo negozio nel tuo spazio di lavoro NivaDesk come lavori, con la fase iniziale, la lista di attività e il responsabile che scegli, e li tiene aggiornati quando qualcosa cambia in Shopify. Questa pagina spiega cosa fa l'app, come installarla e collegarla, come vengono fatturati i piani, il limite del piano Free, l'importazione degli ordini passati e dove trovare assistenza.",
  ctaInstall: "Installa dallo Shopify App Store",
  ctaSteps: "Passaggi di configurazione",
  heroFacts: [
    "Accesso in sola lettura: nel tuo negozio non viene modificato nulla",
    "I piani si scelgono e si pagano in Shopify",
    "Piano Free disponibile; i piani a pagamento iniziano con una prova gratuita"
  ],
  mockLabel: "Illustrazione: l'elenco ordini di NivaDesk con ordini da un negozio Shopify",
  mockCaption: "Illustrazione con articoli di esempio. Non sono ordini reali.",
  mockItems: ["Cake topper personalizzato", "Anello inciso", "Stampa incorniciata"],
  mockStatusDispatched: "Spedito",
  statusTitle: "Disponibilità",
  statusLabel: "Disponibile sullo Shopify App Store",
  statusBody: "Pubblicata il 12 ottobre 2026 come “NivaDesk Order Management” (sviluppatore: EGGcraft Limited). Qualsiasi negozio Shopify può installarla; per collegarla serve un account NivaDesk, che puoi creare gratis durante la configurazione.",
  jobsTitle: "Cosa fa l'app",
  jobsIntro: "Solo ciò che è scritto qui. Tutto avviene nel tuo spazio di lavoro NivaDesk; il tuo negozio Shopify viene letto, mai modificato.",
  jobs: [
    ["I nuovi ordini pagati diventano lavori", "Ogni nuovo ordine pagato arriva con cliente, righe articolo e totali, abbinato alle schede cliente che hai già. Gli ordini non pagati vengono saltati, a meno che tu non ne consenta l'importazione; un ordine arriva quando Shopify lo segnala come pagato."],
    ["Il tuo flusso su ogni ordine", "Nelle Sync settings dell'app scegli la fase iniziale dei nuovi ordini, la lista di attività da creare su ogni ordine e il responsabile predefinito del tuo spazio."],
    ["Le modifiche arrivano da Shopify", "Stato del pagamento, spedizioni con corriere e numero di tracciamento, rimborsi e annullamenti aggiornano il lavoro. Questi aggiornamenti cambiano solo i dati Shopify; le tue note e le tue attività restano come sono."],
    ["Scegli quali ordini sincronizzare", "Sincronizza tutti gli ordini, oppure solo quelli con prodotti o collezioni selezionati, e includi o escludi ordini per tag."]
  ],
  directionTitle: "Cosa legge e cosa non modifica mai",
  readsTitle: "Legge, con permessi di sola lettura",
  reads: [
    "Ordini e relative spedizioni",
    "Clienti di quegli ordini: nome, e-mail, telefono e indirizzi",
    "Prodotti e collezioni, per applicare i tuoi filtri",
    "Nome, e-mail e valuta del tuo negozio"
  ],
  writesTitle: "Mai modificato in Shopify",
  writes: ["Prodotti, prezzi e scorte", "Ordini, spedizioni e numeri di tracciamento", "Clienti", "Il tuo tema e la tua vetrina"],
  directionNote: "L'app chiede a Shopify solo permessi di lettura (ordini, clienti, prodotti, spedizioni), quindi non ha modo di modificare il tuo negozio. I numeri di tracciamento non vengono rimandati a Shopify.",
  syncTitle: "Come funziona la sincronizzazione",
  syncFacts: [
    ["Webhook", "Shopify segnala a NivaDesk gli ordini nuovi e modificati appena succede; ogni invio viene verificato tramite la sua firma e applicato una sola volta."],
    ["Controllo di recupero", "Ogni 15 minuti NivaDesk chiede anche al tuo negozio gli ordini che un webhook potrebbe aver perso."],
    ["Sync history", "La pagina Sync history dell'app elenca ogni evento con il suo esito; uno non riuscito si può riprovare da lì."]
  ],
  connectTitle: "Installare e collegare",
  connectSteps: [
    ["Installa l'app", "Apri NivaDesk Order Management sullo Shopify App Store, premi Install, scegli il tuo negozio e approva i permessi di lettura. L'app si apre nel pannello di controllo di Shopify."],
    ["Premi Connect", "Nell'app apri Connection e premi “Connect existing NivaDesk account” o “Create a NivaDesk account”. In una nuova scheda si apre una pagina NivaDesk con un codice monouso per il tuo negozio."],
    ["Accedi o registrati", "Accedi a NivaDesk, oppure crea un account con il tuo nome, un nome per lo spazio di lavoro, la tua e-mail e una password. Torni subito alla pagina di collegamento."],
    ["Scegli lo spazio di lavoro", "Scegli lo spazio in cui sincronizzare questo negozio e premi “Connect store”. Solo il proprietario dello spazio può collegare un negozio."],
    ["Torna a Shopify", "La pagina Connection in Shopify passa da sola a Connected. Da qui in poi i nuovi ordini pagati si sincronizzano automaticamente."],
    ["Impostazioni e ordini passati", "Se vuoi, imposta filtri, fase iniziale, attività e responsabile in Sync settings, poi importa gli ordini passati da Import orders."]
  ],
  connectNotes: [
    "Il codice monouso vale 15 minuti. Se è scaduto, premi di nuovo Connect in Shopify.",
    "Hai già effettuato l'accesso a NivaDesk con un altro account? Usa “switch account” nella pagina di collegamento prima di scegliere lo spazio."
  ],
  pricingTitle: "Piani fatturati da Shopify",
  pricingIntro: "Uno spazio di lavoro collegato dall'app Shopify viene fatturato da Shopify, sulla tua fattura Shopify, in dollari statunitensi, ogni 30 giorni. Scegli o cambi il piano nella pagina Plans dell'app NivaDesk nel pannello di controllo di Shopify; Shopify ti chiede di approvare ogni addebito.",
  perPeriod: "fatturato ogni 30 giorni",
  planNotes: {
    free: "Fino a 10 ordini attivi alla volta, clienti illimitati, 1 utente.",
    starter: "Ordini e clienti illimitati, 1 utente; cronologia, note e storico.",
    pro: "Tutto di Starter, più 10 GB di Client Files e finanza avanzata.",
    team: "Tutto di Pro, con 5 utenti, messaggi del team e ruoli; 50 GB di Client Files."
  },
  trialNote: "I piani a pagamento iniziano con una prova gratuita fino a 14 giorni, una volta per spazio di lavoro. Se il tuo spazio aveva già iniziato una prova NivaDesk sul sito, i giorni rimasti vengono riportati. Non viene addebitato nulla prima della fine della prova.",
  billingFacts: [
    ["Cambiare piano", "Scegli un altro piano nella pagina Plans; Shopify ti mostra il nuovo addebito da approvare."],
    ["Annullare", "Disinstallare l'app da Settings › Apps nel pannello di controllo di Shopify annulla i suoi addebiti. Lo spazio torna a Free e conserva gli ordini che contiene già."],
    ["Un solo modo di pagare", "Uno spazio fatturato da Shopify non può acquistare in più un piano su nivadesk.app, sull'App Store o su Google Play, e per esso non sono disponibili utenti aggiuntivi né spazio di archiviazione extra. Uno spazio che paga già NivaDesk direttamente mantiene il suo piano quando collega un negozio; tramite Shopify non viene addebitato nulla."],
    ["Prezzi su nivadesk.app", "I prezzi in sterline della nostra pagina prezzi valgono per gli spazi fatturati direttamente da NivaDesk."]
  ],
  limitTitle: "Il limite di ordini attivi del piano Free",
  limitIntro: "Con Free possono essere attivi fino a 10 ordini alla volta. Gli ordini consegnati ed eliminati non contano, e i piani a pagamento non hanno limiti di ordini.",
  limitPoints: [
    ["Quando il limite è pieno", "I nuovi ordini Shopify non vanno persi. NivaDesk li tiene in attesa, fino a 90 giorni, e li mostra in cima alla schermata Ordini sul web."],
    ["Fare spazio", "Segna come consegnati i lavori finiti, oppure scegli un piano a pagamento in Shopify, poi premi Importa nella schermata Ordini. Gli ordini in attesa arrivano dal più vecchio, finché c'è spazio."],
    ["Gli aggiornamenti non contano", "Una modifica a un ordine già presente in NivaDesk non occupa mai un posto. Il limite vale allo stesso modo per la sincronizzazione automatica e per l'importazione."]
  ],
  importTitle: "Importare gli ordini passati",
  importIntro: "Apri Import orders nell'app.",
  importSteps: [
    ["Scegli cosa importare", "Ultimi 30 giorni, ultimi 90 giorni, ultimi 12 mesi, un intervallo di date personalizzato, oppure Selected orders only: fino a 250 ID ordine, cioè il numero alla fine dell'indirizzo di un ordine nel pannello di controllo di Shopify."],
    ["Anteprima", "Premi Preview count per vedere quanti ordini corrispondono."],
    ["Avvia", "Premi Start import. La pagina mostra l'avanzamento: creati, saltati e non riusciti, con il motivo di ogni errore."]
  ],
  importNote: "Gli ordini già presenti in NivaDesk vengono saltati, i tuoi filtri si applicano e gli ordini non pagati vengono saltati a meno che tu non li consenta. L'importazione funziona anche con la sincronizzazione automatica disattivata. “Sync now” nella pagina Home dell'app ricontrolla le ultime 24 ore.",
  dataTitle: "Scollegare, disinstallare e i tuoi dati",
  data: [
    ["Scollegare", "Connection › Disconnect nell'app interrompe la sincronizzazione. Nulla di ciò che è stato importato viene eliminato. In NivaDesk, Impostazioni › Integrazioni mostra il negozio collegato e permette al proprietario di metterlo in pausa o rimuoverlo."],
    ["Disinstallare", "La disinstallazione interrompe la sincronizzazione e Shopify revoca l'accesso dell'app. Un piano fatturato da Shopify termina e lo spazio torna a Free; gli ordini importati restano nel tuo spazio."],
    ["Richieste di privacy dei clienti", "NivaDesk registra le richieste di dati dei clienti inviate da Shopify e, su una richiesta di cancellazione, rende anonimi i dati di quel cliente negli ordini del tuo negozio, mantenendo gli importi. Dopo una disinstallazione, la richiesta di cancellazione del negozio inviata da Shopify rimuove il record di collegamento del negozio."],
    ["Sicurezza", "Il token di accesso del negozio è salvato cifrato e usato solo dai server di NivaDesk. Ogni webhook di Shopify viene verificato tramite la sua firma."]
  ],
  faqTitle: "Domande dei commercianti",
  faq: [
    ["Mi serve un account NivaDesk?", "Sì. Se non ce l'hai, crealo nella pagina di collegamento durante la configurazione; ci vuole circa un minuto."],
    ["In quali lingue è disponibile?", "L'app nel pannello di controllo di Shopify è in inglese. NivaDesk, sul web, su iPhone, iPad, Mac e Android, si usa in 12 lingue, italiano compreso."],
    ["Perché i prezzi sono in dollari statunitensi?", "I piani degli spazi installati da Shopify sono addebitati da Shopify, che fattura i piani delle app in dollari statunitensi."],
    ["NivaDesk rimanda i numeri di tracciamento a Shopify?", "No. Legge spedizioni, corriere e numero di tracciamento da Shopify e non scrive mai nel tuo negozio."],
    ["Un ordine non è arrivato. Cosa controllo?", "Apri Sync history nell'app: ogni evento mostra il suo esito e quelli non riusciti si possono riprovare. Gli ordini non pagati, fuori dai tuoi filtri o in attesa di spazio con Free vengono saltati o trattenuti di proposito. Puoi anche importare un singolo ordine con Import orders › Selected orders only."],
    ["Posso usare NivaDesk sul telefono?", "Sì. Lo stesso spazio funziona sul web, su iPhone, iPad, Mac e Android. Per uno spazio fatturato da Shopify, il piano si cambia nell'app NivaDesk del pannello di controllo di Shopify."]
  ],
  contactTitle: "Aiuto e assistenza",
  contactBody: "Scrivici indicando l'indirizzo del tuo negozio (tuo-negozio.myshopify.com) e cosa vedi. Di solito rispondiamo entro un giorno lavorativo.",
  trademark: "Shopify è un marchio di Shopify Inc. NivaDesk è un prodotto indipendente, non affiliato a Shopify né approvato da Shopify."
};

const ES: ShopifyHelpCopy = {
  eyebrow: "App de Shopify · Guía de configuración",
  heroTitle: "NivaDesk para Shopify: los pedidos de tu tienda se convierten en trabajos de producción",
  heroIntro: "NivaDesk Order Management es la app de NivaDesk en la Shopify App Store. Lleva los pedidos pagados de tu tienda a tu espacio de trabajo de NivaDesk como trabajos, con la etapa inicial, la lista de tareas y la persona responsable que elijas, y los mantiene al día cuando algo cambia en Shopify. Esta página explica qué hace la app, cómo instalarla y conectarla, cómo se facturan los planes, el límite del plan Free, la importación de pedidos anteriores y dónde pedir ayuda.",
  ctaInstall: "Instalar desde la Shopify App Store",
  ctaSteps: "Pasos de configuración",
  heroFacts: [
    "Acceso de solo lectura: no se cambia nada en tu tienda",
    "Los planes se eligen y se pagan en Shopify",
    "Plan Free disponible; los planes de pago empiezan con una prueba gratuita"
  ],
  mockLabel: "Ilustración: la lista de pedidos de NivaDesk con pedidos de una tienda Shopify",
  mockCaption: "Ilustración con artículos de ejemplo. No son pedidos reales.",
  mockItems: ["Adorno de tarta personalizado", "Anillo grabado", "Lámina enmarcada"],
  mockStatusDispatched: "Enviado",
  statusTitle: "Disponibilidad",
  statusLabel: "Publicada en la Shopify App Store",
  statusBody: "Publicada el 12 de octubre de 2026 como “NivaDesk Order Management” (desarrollador: EGGcraft Limited). Cualquier tienda Shopify puede instalarla; para conectarla necesitas una cuenta de NivaDesk, que puedes crear gratis durante la configuración.",
  jobsTitle: "Qué hace la app",
  jobsIntro: "Solo lo que se indica aquí. Todo ocurre en tu espacio de trabajo de NivaDesk; tu tienda Shopify se lee, nunca se modifica.",
  jobs: [
    ["Los nuevos pedidos pagados se convierten en trabajos", "Cada nuevo pedido pagado llega con el cliente, las líneas de artículos y los totales, y se asocia a tus fichas de clientes existentes. Los pedidos sin pagar se omiten, salvo que permitas importarlos; un pedido llega cuando Shopify lo marca como pagado."],
    ["Tu flujo en cada pedido", "En Sync settings de la app, elige la etapa en la que empiezan los pedidos nuevos, la lista de tareas que se crea en cada pedido y la persona responsable por defecto de tu espacio."],
    ["Los cambios llegan desde Shopify", "El estado del pago, los envíos con transportista y número de seguimiento, los reembolsos y las cancelaciones actualizan el trabajo. Estas actualizaciones solo cambian los datos de Shopify; tus notas y tareas se quedan como están."],
    ["Elige qué pedidos se sincronizan", "Sincroniza todos los pedidos, o solo los que incluyen productos o colecciones seleccionados, e incluye o excluye pedidos por etiqueta."]
  ],
  directionTitle: "Qué lee y qué nunca cambia",
  readsTitle: "Lee, con permisos de solo lectura",
  reads: [
    "Pedidos y sus envíos",
    "Los clientes de esos pedidos: nombre, correo, teléfono y direcciones",
    "Productos y colecciones, para aplicar tus filtros",
    "El nombre, el correo y la moneda de tu tienda"
  ],
  writesTitle: "Nunca se cambia en Shopify",
  writes: ["Productos, precios y stock", "Pedidos, envíos y números de seguimiento", "Clientes", "Tu tema y tu escaparate"],
  directionNote: "La app solo pide a Shopify permisos de lectura (pedidos, clientes, productos, envíos), así que no tiene forma de cambiar tu tienda. Los números de seguimiento no se envían de vuelta a Shopify.",
  syncTitle: "Cómo funciona la sincronización",
  syncFacts: [
    ["Webhooks", "Shopify avisa a NivaDesk de los pedidos nuevos y modificados en cuanto ocurren; cada envío se verifica con su firma y se aplica una sola vez."],
    ["Comprobación de recuperación", "Cada 15 minutos NivaDesk también pregunta a tu tienda por los pedidos que un webhook pudo haberse perdido."],
    ["Sync history", "La página Sync history de la app muestra cada evento con su resultado; uno fallido se puede reintentar desde ahí."]
  ],
  connectTitle: "Instalar y conectar",
  connectSteps: [
    ["Instala la app", "Abre NivaDesk Order Management en la Shopify App Store, pulsa Install, elige tu tienda y aprueba los permisos de lectura. La app se abre dentro de tu administrador de Shopify."],
    ["Pulsa Connect", "En la app, abre Connection y pulsa “Connect existing NivaDesk account” o “Create a NivaDesk account”. Se abre una página de NivaDesk en una pestaña nueva con un código de un solo uso para tu tienda."],
    ["Inicia sesión o regístrate", "Inicia sesión en NivaDesk o crea una cuenta con tu nombre, un nombre de espacio de trabajo, tu correo y una contraseña. Vuelves enseguida a la página de conexión."],
    ["Elige el espacio de trabajo", "Elige el espacio en el que se sincronizará esta tienda y pulsa “Connect store”. Solo el propietario del espacio puede conectar una tienda."],
    ["Vuelve a Shopify", "La página Connection de Shopify cambia sola a Connected. Desde ese momento, los pedidos pagados nuevos se sincronizan automáticamente."],
    ["Ajustes y pedidos anteriores", "Si quieres, define filtros, etapa inicial, tareas y responsable en Sync settings, y después trae los pedidos anteriores desde Import orders."]
  ],
  connectNotes: [
    "El código de un solo uso vale 15 minutos. Si ha caducado, vuelve a pulsar Connect en Shopify.",
    "¿Ya has iniciado sesión en NivaDesk con otra cuenta? Usa “switch account” en la página de conexión antes de elegir el espacio."
  ],
  pricingTitle: "Planes facturados por Shopify",
  pricingIntro: "Un espacio de trabajo conectado desde la app de Shopify lo factura Shopify, en tu factura de Shopify, en dólares estadounidenses, cada 30 días. Eliges o cambias el plan en la página Plans de la app de NivaDesk en tu administrador de Shopify; Shopify te pide aprobar cada cargo.",
  perPeriod: "facturado cada 30 días",
  planNotes: {
    free: "Hasta 10 pedidos activos a la vez, clientes ilimitados, 1 usuario.",
    starter: "Pedidos y clientes ilimitados, 1 usuario; cronología, notas e historial.",
    pro: "Todo lo de Starter, más 10 GB de Client Files y finanzas avanzadas.",
    team: "Todo lo de Pro, con 5 usuarios, mensajes de equipo y roles; 50 GB de Client Files."
  },
  trialNote: "Los planes de pago empiezan con una prueba gratuita de hasta 14 días, una vez por espacio de trabajo. Si tu espacio ya había empezado una prueba de NivaDesk en la web, se conservan los días que quedan. No se cobra nada hasta que termina la prueba.",
  billingFacts: [
    ["Cambiar de plan", "Elige otro plan en la página Plans; Shopify te muestra el nuevo cargo para que lo apruebes."],
    ["Cancelar", "Desinstalar la app desde Settings › Apps en tu administrador de Shopify cancela sus cargos. El espacio vuelve a Free y conserva los pedidos que ya tiene."],
    ["Una sola forma de pago", "Un espacio facturado por Shopify no puede comprar además un plan en nivadesk.app, la App Store o Google Play, y no tiene disponibles puestos adicionales ni ampliaciones de almacenamiento. Un espacio que ya paga a NivaDesk directamente mantiene su plan al conectar una tienda; no se cobra nada a través de Shopify."],
    ["Precios en nivadesk.app", "Los precios en libras de nuestra página de precios son para los espacios que factura NivaDesk directamente."]
  ],
  limitTitle: "El límite de pedidos activos del plan Free",
  limitIntro: "Con Free puede haber hasta 10 pedidos activos a la vez. Los pedidos entregados y eliminados no cuentan, y los planes de pago no tienen límite de pedidos.",
  limitPoints: [
    ["Cuando el límite está lleno", "Los pedidos nuevos de Shopify no se pierden. NivaDesk los deja en espera, hasta 90 días, y los muestra arriba en la pantalla Pedidos de la web."],
    ["Hacer sitio", "Marca como entregado el trabajo terminado, o elige un plan de pago en Shopify, y luego pulsa Importar en la pantalla Pedidos. Los pedidos en espera entran del más antiguo al más reciente, mientras haya sitio."],
    ["Las actualizaciones no cuentan", "Un cambio en un pedido que ya está en NivaDesk nunca ocupa un hueco. El límite se aplica igual a la sincronización automática y a la importación."]
  ],
  importTitle: "Importar pedidos anteriores",
  importIntro: "Abre Import orders en la app.",
  importSteps: [
    ["Elige qué importar", "Últimos 30 días, últimos 90 días, últimos 12 meses, un rango de fechas personalizado, o Selected orders only: hasta 250 ID de pedido, es decir, el número al final de la dirección de un pedido en tu administrador de Shopify."],
    ["Vista previa", "Pulsa Preview count para ver cuántos pedidos coinciden."],
    ["Empieza", "Pulsa Start import. La página muestra el progreso: creados, omitidos y fallidos, con el motivo de cada fallo."]
  ],
  importNote: "Los pedidos que ya están en NivaDesk se omiten, se aplican tus filtros y los pedidos sin pagar se omiten salvo que los permitas. La importación funciona también con la sincronización automática desactivada. “Sync now” en la página Home de la app vuelve a revisar las últimas 24 horas.",
  dataTitle: "Desconectar, desinstalar y tus datos",
  data: [
    ["Desconectar", "Connection › Disconnect en la app detiene la sincronización. No se borra nada de lo ya importado. En NivaDesk, Ajustes › Integraciones muestra la tienda conectada y permite al propietario pausarla o quitarla."],
    ["Desinstalar", "Al desinstalar se detiene la sincronización y Shopify retira el acceso de la app. Un plan facturado por Shopify termina y el espacio vuelve a Free; los pedidos importados se quedan en tu espacio."],
    ["Solicitudes de privacidad de clientes", "NivaDesk registra las solicitudes de datos de clientes de Shopify y, ante una solicitud de borrado de un cliente, anonimiza sus datos en los pedidos de tu tienda y conserva los importes. Tras una desinstalación, la solicitud de borrado de tienda de Shopify elimina el registro de conexión de la tienda."],
    ["Seguridad", "El token de acceso de la tienda se guarda cifrado y solo lo usan los servidores de NivaDesk. Cada webhook de Shopify se verifica con su firma."]
  ],
  faqTitle: "Preguntas de comerciantes",
  faq: [
    ["¿Necesito una cuenta de NivaDesk?", "Sí. Si no tienes una, créala en la página de conexión durante la configuración; tarda alrededor de un minuto."],
    ["¿En qué idiomas está?", "La app dentro de tu administrador de Shopify está en inglés. NivaDesk, en la web, iPhone, iPad, Mac y Android, se puede usar en 12 idiomas, incluido el español."],
    ["¿Por qué los precios están en dólares estadounidenses?", "Los planes de los espacios instalados desde Shopify los cobra Shopify, que factura los planes de apps en dólares estadounidenses."],
    ["¿NivaDesk envía los números de seguimiento a Shopify?", "No. Lee los envíos, el transportista y el número de seguimiento de Shopify y nunca escribe en tu tienda."],
    ["Un pedido no ha llegado. ¿Qué reviso?", "Abre Sync history en la app: cada evento muestra su resultado y los fallidos se pueden reintentar. Los pedidos sin pagar, fuera de tus filtros o en espera de sitio con Free se omiten o se retienen a propósito. También puedes traer un solo pedido con Import orders › Selected orders only."],
    ["¿Puedo usar NivaDesk en el móvil?", "Sí. El mismo espacio funciona en la web, iPhone, iPad, Mac y Android. En un espacio facturado por Shopify, el plan se cambia en la app de NivaDesk de tu administrador de Shopify."]
  ],
  contactTitle: "Ayuda y soporte",
  contactBody: "Escríbenos con la dirección de tu tienda (tu-tienda.myshopify.com) y lo que ves. Normalmente respondemos en un día laborable.",
  trademark: "Shopify es una marca comercial de Shopify Inc. NivaDesk es un producto independiente y no está afiliado a Shopify ni respaldado por Shopify."
};

const PT: ShopifyHelpCopy = {
  eyebrow: "App Shopify · Guia de configuração",
  heroTitle: "NivaDesk para Shopify: os pedidos da loja tornam-se trabalhos de produção",
  heroIntro: "O NivaDesk Order Management é a aplicação do NivaDesk na Shopify App Store. Traz os pedidos pagos da tua loja para o teu espaço de trabalho NivaDesk como trabalhos, com a etapa inicial, a lista de tarefas e o responsável que escolheres, e mantém-nos atualizados quando algo muda na Shopify. Esta página explica o que a aplicação faz, como a instalar e ligar, como os planos são faturados, o limite do plano Free, a importação de pedidos anteriores e onde obter ajuda.",
  ctaInstall: "Instalar a partir da Shopify App Store",
  ctaSteps: "Passos de configuração",
  heroFacts: [
    "Acesso só de leitura: nada é alterado na tua loja",
    "Os planos escolhem-se e pagam-se na Shopify",
    "Plano Free disponível; os planos pagos começam com uma avaliação gratuita"
  ],
  mockLabel: "Ilustração: a lista de pedidos do NivaDesk com pedidos de uma loja Shopify",
  mockCaption: "Ilustração com artigos de exemplo. Não são pedidos reais.",
  mockItems: ["Topo de bolo personalizado", "Anel gravado", "Impressão emoldurada"],
  mockStatusDispatched: "Enviado",
  statusTitle: "Disponibilidade",
  statusLabel: "Publicada na Shopify App Store",
  statusBody: "Publicada a 12 de outubro de 2026 como “NivaDesk Order Management” (programador: EGGcraft Limited). Qualquer loja Shopify a pode instalar; para a ligar precisas de uma conta NivaDesk, que podes criar gratuitamente durante a configuração.",
  jobsTitle: "O que a aplicação faz",
  jobsIntro: "Apenas o que está aqui. Tudo acontece no teu espaço de trabalho NivaDesk; a tua loja Shopify é lida, nunca alterada.",
  jobs: [
    ["Os novos pedidos pagos tornam-se trabalhos", "Cada novo pedido pago chega com o cliente, as linhas de artigos e os totais, associado às fichas de clientes que já tens. Os pedidos por pagar são ignorados, a não ser que permitas importá-los; um pedido chega quando a Shopify o indica como pago."],
    ["O teu fluxo em cada pedido", "Em Sync settings na aplicação, escolhe a etapa em que começam os novos pedidos, a lista de tarefas criada em cada pedido e o responsável predefinido do teu espaço."],
    ["As alterações vêm da Shopify", "O estado do pagamento, os envios com transportadora e número de seguimento, os reembolsos e os cancelamentos atualizam o trabalho. Estas atualizações só mudam os dados da Shopify; as tuas notas e tarefas ficam como estão."],
    ["Escolhe que pedidos sincronizar", "Sincroniza todos os pedidos, ou só os que têm produtos ou coleções selecionados, e inclui ou exclui pedidos por etiqueta."]
  ],
  directionTitle: "O que lê e o que nunca altera",
  readsTitle: "Lê, com permissões só de leitura",
  reads: [
    "Pedidos e os respetivos envios",
    "Os clientes desses pedidos: nome, e-mail, telefone e moradas",
    "Produtos e coleções, para aplicar os teus filtros",
    "O nome, o e-mail e a moeda da tua loja"
  ],
  writesTitle: "Nunca alterado na Shopify",
  writes: ["Produtos, preços e stock", "Pedidos, envios e números de seguimento", "Clientes", "O teu tema e a tua montra"],
  directionNote: "A aplicação só pede à Shopify permissões de leitura (pedidos, clientes, produtos, envios), por isso não tem forma de alterar a tua loja. Os números de seguimento não são enviados de volta para a Shopify.",
  syncTitle: "Como funciona a sincronização",
  syncFacts: [
    ["Webhooks", "A Shopify avisa o NivaDesk dos pedidos novos e alterados assim que acontecem; cada envio é verificado pela sua assinatura e aplicado uma única vez."],
    ["Verificação de recuperação", "A cada 15 minutos, o NivaDesk pergunta também à tua loja pelos pedidos que um webhook possa ter perdido."],
    ["Sync history", "A página Sync history da aplicação lista cada evento com o resultado; um que tenha falhado pode ser repetido a partir dali."]
  ],
  connectTitle: "Instalar e ligar",
  connectSteps: [
    ["Instala a aplicação", "Abre o NivaDesk Order Management na Shopify App Store, carrega em Install, escolhe a tua loja e aprova as permissões de leitura. A aplicação abre-se dentro do admin da Shopify."],
    ["Carrega em Connect", "Na aplicação, abre Connection e carrega em “Connect existing NivaDesk account” ou “Create a NivaDesk account”. Abre-se uma página do NivaDesk num novo separador, com um código de utilização única para a tua loja."],
    ["Inicia sessão ou regista-te", "Inicia sessão no NivaDesk ou cria uma conta com o teu nome, um nome para o espaço de trabalho, o teu e-mail e uma palavra-passe. Voltas logo à página de ligação."],
    ["Escolhe o espaço de trabalho", "Escolhe o espaço para onde esta loja deve sincronizar e carrega em “Connect store”. Só o proprietário do espaço pode ligar uma loja."],
    ["Volta à Shopify", "A página Connection na Shopify muda sozinha para Connected. A partir daí, os novos pedidos pagos sincronizam automaticamente."],
    ["Definições e pedidos anteriores", "Se quiseres, define filtros, etapa inicial, tarefas e responsável em Sync settings e depois traz os pedidos anteriores em Import orders."]
  ],
  connectNotes: [
    "O código de utilização única é válido durante 15 minutos. Se tiver expirado, carrega outra vez em Connect na Shopify.",
    "Já tens sessão iniciada no NivaDesk com outra conta? Usa “switch account” na página de ligação antes de escolher o espaço."
  ],
  pricingTitle: "Planos faturados pela Shopify",
  pricingIntro: "Um espaço de trabalho ligado a partir da aplicação Shopify é faturado pela Shopify, na tua fatura Shopify, em dólares americanos, a cada 30 dias. Escolhes ou mudas de plano na página Plans da aplicação NivaDesk no admin da Shopify; a Shopify pede-te que aproves cada cobrança.",
  perPeriod: "faturado a cada 30 dias",
  planNotes: {
    free: "Até 10 pedidos ativos de cada vez, clientes ilimitados, 1 utilizador.",
    starter: "Pedidos e clientes ilimitados, 1 utilizador; cronologia, notas e histórico.",
    pro: "Tudo do Starter, mais 10 GB de Client Files e finanças avançadas.",
    team: "Tudo do Pro, com 5 utilizadores, mensagens de equipa e funções; 50 GB de Client Files."
  },
  trialNote: "Os planos pagos começam com uma avaliação gratuita de até 14 dias, uma vez por espaço de trabalho. Se o teu espaço já tinha começado uma avaliação do NivaDesk no site, os dias que faltam passam para a Shopify. Nada é cobrado antes do fim da avaliação.",
  billingFacts: [
    ["Mudar de plano", "Escolhe outro plano na página Plans; a Shopify mostra-te a nova cobrança para aprovares."],
    ["Cancelar", "Desinstalar a aplicação em Settings › Apps no admin da Shopify cancela as suas cobranças. O espaço volta ao Free e mantém os pedidos que já tem."],
    ["Uma só forma de pagar", "Um espaço faturado pela Shopify não pode comprar também um plano em nivadesk.app, na App Store ou no Google Play, e não tem lugares extra nem extensões de armazenamento disponíveis. Um espaço que já paga diretamente ao NivaDesk mantém o seu plano ao ligar uma loja; nada é cobrado através da Shopify."],
    ["Preços em nivadesk.app", "Os preços em libras da nossa página de preços são para espaços faturados diretamente pelo NivaDesk."]
  ],
  limitTitle: "O limite de pedidos ativos do plano Free",
  limitIntro: "No Free podem estar ativos até 10 pedidos de cada vez. Os pedidos entregues e eliminados não contam, e os planos pagos não têm limite de pedidos.",
  limitPoints: [
    ["Quando o limite está cheio", "Os novos pedidos da Shopify não se perdem. O NivaDesk deixa-os em espera, até 90 dias, e mostra-os no topo do ecrã Pedidos na web."],
    ["Abrir espaço", "Marca como entregue o trabalho terminado, ou escolhe um plano pago na Shopify, e depois carrega em Importar no ecrã Pedidos. Os pedidos em espera entram do mais antigo para o mais recente, enquanto houver espaço."],
    ["As atualizações não contam", "Uma alteração a um pedido que já está no NivaDesk nunca ocupa um lugar. O limite aplica-se da mesma forma à sincronização automática e à importação."]
  ],
  importTitle: "Importar pedidos anteriores",
  importIntro: "Abre Import orders na aplicação.",
  importSteps: [
    ["Escolhe o que importar", "Últimos 30 dias, últimos 90 dias, últimos 12 meses, um intervalo de datas à tua escolha, ou Selected orders only: até 250 IDs de pedido, ou seja, o número no fim do endereço de um pedido no admin da Shopify."],
    ["Pré-visualizar", "Carrega em Preview count para ver quantos pedidos correspondem."],
    ["Começar", "Carrega em Start import. A página mostra o progresso: criados, ignorados e com falha, com o motivo de cada falha."]
  ],
  importNote: "Os pedidos que já estão no NivaDesk são ignorados, os teus filtros aplicam-se e os pedidos por pagar são ignorados a não ser que os permitas. A importação funciona mesmo com a sincronização automática desligada. “Sync now” na página Home da aplicação volta a verificar as últimas 24 horas.",
  dataTitle: "Desligar, desinstalar e os teus dados",
  data: [
    ["Desligar", "Connection › Disconnect na aplicação para a sincronização. Nada do que já foi importado é apagado. No NivaDesk, Configurações › Integrações mostra a loja ligada e permite ao proprietário pausá-la ou removê-la."],
    ["Desinstalar", "Desinstalar para a sincronização e a Shopify retira o acesso da aplicação. Um plano faturado pela Shopify termina e o espaço volta ao Free; os pedidos importados ficam no teu espaço."],
    ["Pedidos de privacidade dos clientes", "O NivaDesk regista os pedidos de dados de clientes da Shopify e, num pedido de eliminação de um cliente, anonimiza os dados desse cliente nos pedidos da tua loja, mantendo os valores. Depois de uma desinstalação, o pedido de eliminação da loja enviado pela Shopify remove o registo de ligação da loja."],
    ["Segurança", "O token de acesso da loja é guardado cifrado e só é usado pelos servidores do NivaDesk. Cada webhook da Shopify é verificado pela sua assinatura."]
  ],
  faqTitle: "Perguntas dos comerciantes",
  faq: [
    ["Preciso de uma conta NivaDesk?", "Sim. Se não tiveres, cria-a na página de ligação durante a configuração; demora cerca de um minuto."],
    ["Em que línguas está disponível?", "A aplicação no admin da Shopify está em inglês. O NivaDesk, na web, iPhone, iPad, Mac e Android, pode ser usado em 12 línguas, incluindo o português."],
    ["Porque é que os preços estão em dólares americanos?", "Os planos dos espaços instalados a partir da Shopify são cobrados pela Shopify, que fatura os planos de aplicações em dólares americanos."],
    ["O NivaDesk envia os números de seguimento para a Shopify?", "Não. Lê os envios, a transportadora e o número de seguimento da Shopify e nunca escreve na tua loja."],
    ["Um pedido não chegou. O que verifico?", "Abre Sync history na aplicação: cada evento mostra o resultado e os que falharam podem ser repetidos. Pedidos por pagar, fora dos teus filtros ou à espera de espaço no Free são ignorados ou retidos de propósito. Também podes trazer um único pedido com Import orders › Selected orders only."],
    ["Posso usar o NivaDesk no telemóvel?", "Sim. O mesmo espaço funciona na web, iPhone, iPad, Mac e Android. Num espaço faturado pela Shopify, o plano muda-se na aplicação NivaDesk do admin da Shopify."]
  ],
  contactTitle: "Ajuda e suporte",
  contactBody: "Escreve-nos com o endereço da tua loja (a-tua-loja.myshopify.com) e o que estás a ver. Normalmente respondemos no prazo de um dia útil.",
  trademark: "Shopify é uma marca comercial da Shopify Inc. O NivaDesk é um produto independente e não é afiliado nem endossado pela Shopify."
};

const RU: ShopifyHelpCopy = {
  eyebrow: "Приложение для Shopify · Настройка",
  heroTitle: "NivaDesk для Shopify: заказы магазина становятся производственными задачами",
  heroIntro: "NivaDesk Order Management — приложение NivaDesk в Shopify App Store. Оно переносит оплаченные заказы вашего магазина в рабочее пространство NivaDesk в виде задач — с выбранным вами начальным этапом, списком дел и ответственным — и обновляет их, когда что-то меняется в Shopify. На этой странице: что делает приложение, как его установить и подключить, как оплачиваются тарифы, лимит тарифа Free, импорт прошлых заказов и где получить помощь.",
  ctaInstall: "Установить из Shopify App Store",
  ctaSteps: "Шаги настройки",
  heroFacts: [
    "Доступ только для чтения: в магазине ничего не меняется",
    "Тариф выбирается и оплачивается в Shopify",
    "Есть тариф Free; платные тарифы начинаются с бесплатного пробного периода"
  ],
  mockLabel: "Иллюстрация: список заказов NivaDesk с заказами из магазина Shopify",
  mockCaption: "Иллюстрация с примерами. Это не настоящие заказы.",
  mockItems: ["Именной топпер для торта", "Кольцо с гравировкой", "Принт в рамке"],
  mockStatusDispatched: "Отправлен",
  statusTitle: "Доступность",
  statusLabel: "Опубликовано в Shopify App Store",
  statusBody: "Опубликовано 12 октября 2026 года под названием «NivaDesk Order Management» (разработчик: EGGcraft Limited). Установить его может любой магазин Shopify; для подключения нужен аккаунт NivaDesk, который можно бесплатно создать во время настройки.",
  jobsTitle: "Что делает приложение",
  jobsIntro: "Только то, что перечислено здесь. Всё происходит в вашем рабочем пространстве NivaDesk; магазин Shopify только читается и никогда не изменяется.",
  jobs: [
    ["Новые оплаченные заказы становятся задачами", "Каждый новый оплаченный заказ приходит с клиентом, позициями и суммами и связывается с вашими существующими карточками клиентов. Неоплаченные заказы пропускаются, если вы не разрешили их импорт; заказ приходит, когда Shopify отмечает его оплаченным."],
    ["Ваш процесс для каждого заказа", "В разделе Sync settings приложения выберите этап, с которого начинаются новые заказы, список дел, создаваемый в каждом заказе, и ответственного по умолчанию из вашего пространства."],
    ["Изменения приходят из Shopify", "Статус оплаты, отправки со службой доставки и трек-номером, возвраты и отмены обновляют задачу. Эти обновления меняют только данные Shopify; ваши заметки и дела остаются как есть."],
    ["Выберите, какие заказы синхронизировать", "Синхронизируйте все заказы или только заказы с выбранными товарами или коллекциями, а также включайте или исключайте заказы по тегам."]
  ],
  directionTitle: "Что приложение читает и что никогда не меняет",
  readsTitle: "Читает — с правами только на чтение",
  reads: [
    "Заказы и их отправки",
    "Клиентов этих заказов: имя, e-mail, телефон и адреса",
    "Товары и коллекции — чтобы применять ваши фильтры",
    "Название, e-mail и валюту вашего магазина"
  ],
  writesTitle: "Никогда не меняется в Shopify",
  writes: ["Товары, цены и остатки", "Заказы, отправки и трек-номера", "Клиенты", "Тема и витрина магазина"],
  directionNote: "Приложение запрашивает у Shopify только права на чтение (заказы, клиенты, товары, отправки), поэтому изменить ваш магазин оно не может. Трек-номера не передаются обратно в Shopify.",
  syncTitle: "Как работает синхронизация",
  syncFacts: [
    ["Вебхуки", "Shopify сообщает NivaDesk о новых и изменённых заказах сразу же; каждая доставка проверяется по подписи и применяется один раз."],
    ["Проверка пропущенного", "Каждые 15 минут NivaDesk дополнительно запрашивает у магазина заказы, которые вебхук мог пропустить."],
    ["Sync history", "Раздел Sync history в приложении показывает каждое событие и его результат; неудачное можно повторить оттуда."]
  ],
  connectTitle: "Установка и подключение",
  connectSteps: [
    ["Установите приложение", "Откройте NivaDesk Order Management в Shopify App Store, нажмите Install, выберите магазин и подтвердите права на чтение. Приложение откроется в админке Shopify."],
    ["Нажмите Connect", "В приложении откройте Connection и нажмите «Connect existing NivaDesk account» или «Create a NivaDesk account». В новой вкладке откроется страница NivaDesk с одноразовым кодом для вашего магазина."],
    ["Войдите или зарегистрируйтесь", "Войдите в NivaDesk или создайте аккаунт: имя, название рабочего пространства, e-mail и пароль. Вы сразу вернётесь на страницу подключения."],
    ["Выберите рабочее пространство", "Выберите пространство, в которое будет синхронизироваться магазин, и нажмите «Connect store». Подключить магазин может только владелец пространства."],
    ["Вернитесь в Shopify", "Страница Connection в Shopify сама переключится на Connected. С этого момента новые оплаченные заказы синхронизируются автоматически."],
    ["Настройки и прошлые заказы", "При желании задайте в Sync settings фильтры, начальный этап, дела и ответственного, а затем перенесите прошлые заказы через Import orders."]
  ],
  connectNotes: [
    "Одноразовый код действует 15 минут. Если он истёк, снова нажмите Connect в Shopify.",
    "Вы уже вошли в NivaDesk под другим аккаунтом? Перед выбором пространства нажмите «switch account» на странице подключения."
  ],
  pricingTitle: "Тарифы, оплачиваемые через Shopify",
  pricingIntro: "Рабочее пространство, подключённое из приложения Shopify, оплачивается через Shopify — в вашем счёте Shopify, в долларах США, раз в 30 дней. Тариф выбирается и меняется на странице Plans приложения NivaDesk в админке Shopify; каждое списание Shopify просит подтвердить.",
  perPeriod: "списание раз в 30 дней",
  planNotes: {
    free: "До 10 активных заказов одновременно, неограниченно клиентов, 1 пользователь.",
    starter: "Неограниченно заказов и клиентов, 1 пользователь; хронология, заметки и история.",
    pro: "Всё из Starter, плюс 10 ГБ Client Files и расширенные финансы.",
    team: "Всё из Pro: 5 пользователей, командные сообщения и роли; 50 ГБ Client Files."
  },
  trialNote: "Платные тарифы начинаются с бесплатного пробного периода до 14 дней — один раз на рабочее пространство. Если пространство уже начинало пробный период NivaDesk на сайте, оставшиеся дни переносятся. До конца пробного периода ничего не списывается.",
  billingFacts: [
    ["Смена тарифа", "Выберите другой тариф на странице Plans; Shopify покажет новое списание для подтверждения."],
    ["Отмена", "Удаление приложения в разделе Settings › Apps админки Shopify отменяет его списания. Пространство возвращается на Free и сохраняет уже имеющиеся заказы."],
    ["Один способ оплаты", "Пространство, оплачиваемое через Shopify, не может дополнительно купить тариф на nivadesk.app, в App Store или Google Play; дополнительные места и хранилище для него недоступны. Пространство, которое уже платит NivaDesk напрямую, сохраняет свой тариф при подключении магазина; через Shopify ничего не списывается."],
    ["Цены на nivadesk.app", "Цены в фунтах на нашей странице тарифов действуют для пространств, оплачиваемых напрямую NivaDesk."]
  ],
  limitTitle: "Лимит активных заказов на тарифе Free",
  limitIntro: "На Free одновременно может быть активно до 10 заказов. Доставленные и удалённые заказы не считаются, а у платных тарифов лимита заказов нет.",
  limitPoints: [
    ["Когда лимит заполнен", "Новые заказы из Shopify не теряются. NivaDesk держит их в ожидании до 90 дней и показывает вверху экрана «Заказы» в веб-версии."],
    ["Освободить место", "Отметьте готовую работу как доставленную или выберите платный тариф в Shopify, затем нажмите «Импортировать» на экране «Заказы». Ожидающие заказы поступают начиная с самого старого, пока есть место."],
    ["Обновления не считаются", "Изменение заказа, который уже есть в NivaDesk, никогда не занимает место. Лимит одинаково действует для автоматической синхронизации и импорта."]
  ],
  importTitle: "Импорт прошлых заказов",
  importIntro: "Откройте Import orders в приложении.",
  importSteps: [
    ["Выберите, что импортировать", "Последние 30 дней, последние 90 дней, последние 12 месяцев, свой диапазон дат или Selected orders only: до 250 ID заказов — это число в конце адреса заказа в админке Shopify."],
    ["Предпросмотр", "Нажмите Preview count, чтобы увидеть, сколько заказов подходит."],
    ["Запуск", "Нажмите Start import. Страница показывает ход: создано, пропущено и с ошибкой — с причиной каждой ошибки."]
  ],
  importNote: "Заказы, которые уже есть в NivaDesk, пропускаются, ваши фильтры применяются, а неоплаченные заказы пропускаются, если вы их не разрешили. Импорт работает и при выключенной автоматической синхронизации. «Sync now» на странице Home приложения заново проверяет последние 24 часа.",
  dataTitle: "Отключение, удаление и ваши данные",
  data: [
    ["Отключение", "Connection › Disconnect в приложении останавливает синхронизацию. Уже импортированное не удаляется. В NivaDesk раздел «Настройки › Интеграции» показывает подключённый магазин; владелец может приостановить или удалить его там."],
    ["Удаление приложения", "Удаление останавливает синхронизацию, и Shopify отзывает доступ приложения. Тариф, оплачиваемый через Shopify, заканчивается, пространство возвращается на Free; импортированные заказы остаются в нём."],
    ["Запросы клиентов о данных", "NivaDesk фиксирует запросы Shopify о данных клиентов, а по запросу на удаление обезличивает данные этого клиента в заказах из вашего магазина, сохраняя суммы. После удаления приложения запрос Shopify на удаление данных магазина стирает запись о подключении магазина."],
    ["Безопасность", "Токен доступа магазина хранится в зашифрованном виде и используется только серверами NivaDesk. Каждый вебхук от Shopify проверяется по подписи."]
  ],
  faqTitle: "Вопросы продавцов",
  faq: [
    ["Нужен ли аккаунт NivaDesk?", "Да. Если его нет, создайте его на странице подключения во время настройки — это займёт около минуты."],
    ["На каких языках работает?", "Приложение в админке Shopify — на английском. Сам NivaDesk в вебе, на iPhone, iPad, Mac и Android доступен на 12 языках, включая русский."],
    ["Почему цены в долларах США?", "Тарифы для пространств, установленных из Shopify, списывает Shopify, а Shopify выставляет счета за приложения в долларах США."],
    ["Передаёт ли NivaDesk трек-номера в Shopify?", "Нет. NivaDesk читает из Shopify отправки, службу доставки и трек-номер и никогда ничего не записывает в магазин."],
    ["Заказ не пришёл. Что проверить?", "Откройте Sync history в приложении: у каждого события виден результат, неудачные можно повторить. Неоплаченные заказы, заказы вне фильтров и заказы, ожидающие места на Free, пропускаются или удерживаются намеренно. Отдельный заказ можно перенести через Import orders › Selected orders only."],
    ["Можно ли пользоваться NivaDesk с телефона?", "Да. Одно и то же пространство работает в вебе, на iPhone, iPad, Mac и Android. Для пространства, оплачиваемого через Shopify, тариф меняется в приложении NivaDesk в админке Shopify."]
  ],
  contactTitle: "Помощь и поддержка",
  contactBody: "Напишите нам, указав адрес магазина (ваш-магазин.myshopify.com) и что вы видите. Обычно мы отвечаем в течение одного рабочего дня.",
  trademark: "Shopify — товарный знак Shopify Inc. NivaDesk — независимый продукт, не связанный с Shopify и не одобренный Shopify."
};

const JA: ShopifyHelpCopy = {
  eyebrow: "Shopify アプリ · 設定ガイド",
  heroTitle: "Shopify 向け NivaDesk：ストアの注文を制作ジョブに",
  heroIntro: "NivaDesk Order Management は、Shopify App Store で公開している NivaDesk のアプリです。ストアの支払い済み注文を、選んだ開始ステージ・タスクリスト・担当者付きのジョブとして NivaDesk のワークスペースに取り込み、Shopify で変更があれば最新の状態に保ちます。このページでは、アプリでできること、インストールと接続の方法、プランの請求方法、Free プランの上限、過去の注文の取り込み、サポート窓口を説明します。",
  ctaInstall: "Shopify App Store からインストール",
  ctaSteps: "設定手順",
  heroFacts: [
    "読み取り専用のアクセス：ストアの内容は一切変更しません",
    "プランは Shopify で選び、Shopify が請求します",
    "Free プランあり。有料プランは無料トライアルから始まります"
  ],
  mockLabel: "イラスト：Shopify ストアの注文が並ぶ NivaDesk の注文一覧",
  mockCaption: "例を使ったイラストです。実際の注文ではありません。",
  mockItems: ["名入れケーキトッパー", "刻印入りリング", "額装プリント"],
  mockStatusDispatched: "発送済み",
  statusTitle: "提供状況",
  statusLabel: "Shopify App Store で公開中",
  statusBody: "2026年10月12日に「NivaDesk Order Management」として公開されました（開発元：EGGcraft Limited）。どの Shopify ストアでもインストールできます。接続には NivaDesk アカウントが必要で、設定中に無料で作成できます。",
  jobsTitle: "アプリでできること",
  jobsIntro: "ここに書いてあることだけです。すべて NivaDesk のワークスペースで行われ、Shopify ストアは読み取るだけで変更しません。",
  jobs: [
    ["新しい支払い済み注文がジョブになる", "新しい支払い済み注文は、顧客、商品明細、合計とともに届き、既存の顧客レコードと照合されます。未払いの注文は、取り込みを許可しない限りスキップされ、Shopify で支払い済みになった時点で届きます。"],
    ["すべての注文にあなたのワークフロー", "アプリの Sync settings で、新しい注文の開始ステージ、注文ごとに作るタスクリスト、ワークスペースの既定の担当者を選べます。"],
    ["変更は Shopify から反映", "支払い状況、配送業者と追跡番号付きの発送、返金、キャンセルがジョブを更新します。更新されるのは Shopify の情報だけで、メモやタスクはそのまま残ります。"],
    ["同期する注文を選ぶ", "すべての注文を同期するか、選んだ商品やコレクションを含む注文だけにするか、タグで注文を含めたり除外したりできます。"]
  ],
  directionTitle: "読み取るもの、決して変更しないもの",
  readsTitle: "読み取り専用の権限で読み取るもの",
  reads: [
    "注文とその発送",
    "それらの注文の顧客：名前、メール、電話番号、住所",
    "フィルターに使う商品とコレクション",
    "ストア名、メールアドレス、通貨"
  ],
  writesTitle: "Shopify で決して変更しないもの",
  writes: ["商品、価格、在庫", "注文、発送、追跡番号", "顧客", "テーマとストアフロント"],
  directionNote: "アプリが Shopify に求めるのは読み取り権限（注文、顧客、商品、発送）だけなので、ストアを変更する手段がありません。追跡番号を Shopify に書き戻すこともありません。",
  syncTitle: "同期のしくみ",
  syncFacts: [
    ["Webhook", "Shopify は新しい注文や変更された注文をすぐに NivaDesk に通知します。各通知は署名で検証され、一度だけ反映されます。"],
    ["取りこぼしチェック", "さらに 15 分ごとに、Webhook が取りこぼした可能性のある注文をストアに問い合わせます。"],
    ["Sync history", "アプリの Sync history にはすべてのイベントと結果が表示され、失敗したものはそこから再試行できます。"]
  ],
  connectTitle: "インストールと接続",
  connectSteps: [
    ["アプリをインストール", "Shopify App Store で NivaDesk Order Management を開き、Install を押してストアを選び、読み取り権限を承認します。アプリは Shopify 管理画面の中で開きます。"],
    ["Connect を押す", "アプリで Connection を開き、「Connect existing NivaDesk account」または「Create a NivaDesk account」を押します。ストア専用のワンタイムコード付きの NivaDesk のページが新しいタブで開きます。"],
    ["ログインまたは登録", "NivaDesk にログインするか、名前、ワークスペース名、メールアドレス、パスワードでアカウントを作成します。すぐに接続ページに戻ります。"],
    ["ワークスペースを選ぶ", "このストアの注文を同期するワークスペースを選び、「Connect store」を押します。ストアを接続できるのはワークスペースのオーナーだけです。"],
    ["Shopify に戻る", "Shopify の Connection ページが自動で Connected に変わります。以降、新しい支払い済み注文は自動で同期されます。"],
    ["設定と過去の注文", "必要に応じて Sync settings でフィルター、開始ステージ、タスク、担当者を設定し、Import orders から過去の注文を取り込みます。"]
  ],
  connectNotes: [
    "ワンタイムコードの有効期限は 15 分です。期限切れの場合は Shopify でもう一度 Connect を押してください。",
    "別のアカウントで NivaDesk にログインしている場合は、ワークスペースを選ぶ前に接続ページの「switch account」を使ってください。"
  ],
  pricingTitle: "Shopify が請求するプラン",
  pricingIntro: "Shopify アプリから接続したワークスペースは、Shopify の請求書で、米ドル建てで 30 日ごとに Shopify から請求されます。プランは Shopify 管理画面の NivaDesk アプリの Plans ページで選択・変更でき、請求のたびに Shopify が承認を求めます。",
  perPeriod: "30 日ごとの請求",
  planNotes: {
    free: "同時に最大 10 件のアクティブな注文、顧客数無制限、1 ユーザー。",
    starter: "注文と顧客は無制限、1 ユーザー。タイムライン、メモ、履歴。",
    pro: "Starter のすべてに加え、10 GB の Client Files と高度な財務機能。",
    team: "Pro のすべてに加え、5 ユーザー、チームメッセージ、役割。Client Files 50 GB。"
  },
  trialNote: "有料プランは最大 14 日間の無料トライアルから始まります（ワークスペースごとに 1 回）。ワークスペースがウェブサイトで NivaDesk のトライアルをすでに始めていた場合は、残りの日数が引き継がれます。トライアルが終わるまで請求はありません。",
  billingFacts: [
    ["プランの変更", "Plans ページで別のプランを選ぶと、Shopify が新しい請求を表示して承認を求めます。"],
    ["解約", "Shopify 管理画面の Settings › Apps からアプリをアンインストールすると、その請求は取り消されます。ワークスペースは Free に戻り、すでにある注文はそのまま残ります。"],
    ["支払い方法は 1 つ", "Shopify で請求されるワークスペースは、nivadesk.app、App Store、Google Play で別途プランを購入できず、追加シートやストレージのアドオンも利用できません。すでに NivaDesk に直接支払っているワークスペースは、ストアを接続してもそのプランのままで、Shopify 経由の請求は発生しません。"],
    ["nivadesk.app の価格", "料金ページのポンド建て価格は、NivaDesk が直接請求するワークスペース向けです。"]
  ],
  limitTitle: "Free プランのアクティブ注文の上限",
  limitIntro: "Free では、同時にアクティブにできる注文は最大 10 件です。配達済みと削除済みの注文は数えません。有料プランには注文数の上限はありません。",
  limitPoints: [
    ["上限に達したとき", "新しい Shopify の注文が失われることはありません。NivaDesk が最大 90 日間待機させ、ウェブ版の注文画面の上部に表示します。"],
    ["空きを作る", "完了した作業を配達済みにするか、Shopify で有料プランを選んでから、注文画面で［取り込む］を押します。待機中の注文は古いものから、空きの範囲で取り込まれます。"],
    ["更新は数えない", "すでに NivaDesk にある注文の変更が枠を使うことはありません。上限は自動同期にも取り込みにも同じように適用されます。"]
  ],
  importTitle: "過去の注文を取り込む",
  importIntro: "アプリで Import orders を開きます。",
  importSteps: [
    ["取り込む範囲を選ぶ", "過去 30 日、過去 90 日、過去 12 か月、任意の期間、または Selected orders only（最大 250 件の注文 ID。Shopify 管理画面で注文のアドレスの末尾にある数字）を選べます。"],
    ["プレビュー", "Preview count を押すと、該当する注文の件数が表示されます。"],
    ["開始", "Start import を押します。作成、スキップ、失敗の件数と、失敗ごとの理由が表示されます。"]
  ],
  importNote: "すでに NivaDesk にある注文はスキップされ、フィルターが適用されます。未払いの注文は、許可しない限りスキップされます。自動同期がオフでも取り込みは使えます。アプリの Home ページの「Sync now」は直近 24 時間を再確認します。",
  dataTitle: "接続解除、アンインストールとデータ",
  data: [
    ["接続解除", "アプリの Connection › Disconnect で同期が止まります。取り込み済みのものは削除されません。NivaDesk では［設定 › 連携］に接続中のストアが表示され、オーナーが一時停止や削除を行えます。"],
    ["アンインストール", "アンインストールすると同期が止まり、Shopify がアプリのアクセスを取り消します。Shopify で請求されるプランは終了し、ワークスペースは Free に戻ります。取り込んだ注文はワークスペースに残ります。"],
    ["顧客のプライバシーリクエスト", "NivaDesk は Shopify からの顧客データリクエストを記録し、顧客の削除リクエストでは、ストアからの注文にあるその顧客の情報を、金額を残したまま匿名化します。アンインストール後、Shopify のストア削除リクエストによってストアの接続記録が削除されます。"],
    ["セキュリティ", "ストアのアクセストークンは暗号化して保存され、NivaDesk のサーバーだけが使用します。Shopify からのすべての Webhook は署名で検証されます。"]
  ],
  faqTitle: "マーチャントからのよくある質問",
  faq: [
    ["NivaDesk のアカウントは必要ですか？", "はい。お持ちでない場合は、設定中に接続ページで作成できます。1 分ほどで完了します。"],
    ["対応言語は？", "Shopify 管理画面内のアプリは英語です。NivaDesk 本体は、ウェブ、iPhone、iPad、Mac、Android で日本語を含む 12 言語に対応しています。"],
    ["価格が米ドルなのはなぜですか？", "Shopify からインストールしたワークスペースのプランは Shopify が請求し、Shopify はアプリのプランを米ドルで請求するためです。"],
    ["NivaDesk は追跡番号を Shopify に送り返しますか？", "いいえ。発送、配送業者、追跡番号を Shopify から読み取るだけで、ストアに書き込むことはありません。"],
    ["注文が届きません。何を確認すればよいですか？", "アプリの Sync history を開いてください。各イベントの結果が表示され、失敗したものは再試行できます。未払いの注文、フィルター対象外の注文、Free で空き待ちの注文は、意図的にスキップまたは保留されます。Import orders › Selected orders only で 1 件だけ取り込むこともできます。"],
    ["スマートフォンでも使えますか？", "はい。同じワークスペースをウェブ、iPhone、iPad、Mac、Android で使えます。Shopify で請求されるワークスペースのプラン変更は、Shopify 管理画面の NivaDesk アプリで行います。"]
  ],
  contactTitle: "ヘルプとサポート",
  contactBody: "ストアのアドレス（your-store.myshopify.com）と表示されている内容を添えてご連絡ください。通常 1 営業日以内に返信します。",
  trademark: "Shopify は Shopify Inc. の商標です。NivaDesk は独立した製品であり、Shopify と提携しておらず、Shopify による推奨を受けていません。"
};

const ZH: ShopifyHelpCopy = {
  eyebrow: "Shopify 应用 · 设置指南",
  heroTitle: "Shopify 版 NivaDesk：店铺订单变成生产任务",
  heroIntro: "NivaDesk Order Management 是 NivaDesk 在 Shopify App Store 上的应用。它把店铺的已付款订单作为任务带入你的 NivaDesk 工作区，并附上你选择的起始阶段、任务清单和负责人；Shopify 中有变化时也会同步更新。本页介绍应用能做什么、如何安装和连接、套餐如何计费、Free 套餐的上限、导入历史订单以及如何获得帮助。",
  ctaInstall: "从 Shopify App Store 安装",
  ctaSteps: "设置步骤",
  heroFacts: [
    "只读访问：不会更改你店铺中的任何内容",
    "套餐在 Shopify 中选择，由 Shopify 计费",
    "提供 Free 套餐；付费套餐从免费试用开始"
  ],
  mockLabel: "示意图：NivaDesk 订单列表中来自 Shopify 店铺的订单",
  mockCaption: "使用示例商品的示意图，并非真实订单。",
  mockItems: ["定制蛋糕插牌", "刻字戒指", "装裱印刷品"],
  mockStatusDispatched: "已发货",
  statusTitle: "上线情况",
  statusLabel: "已在 Shopify App Store 上线",
  statusBody: "2026 年 10 月 12 日以“NivaDesk Order Management”之名发布（开发者：EGGcraft Limited）。任何 Shopify 店铺都可以安装；连接需要 NivaDesk 账户，可在设置过程中免费创建。",
  jobsTitle: "应用能做什么",
  jobsIntro: "仅限这里列出的内容。一切都在你的 NivaDesk 工作区中进行；你的 Shopify 店铺只被读取，从不被修改。",
  jobs: [
    ["新的已付款订单变成任务", "每个新的已付款订单都会带着客户、商品明细和合计进入，并与你现有的客户记录匹配。未付款订单会被跳过，除非你允许导入；当 Shopify 标记为已付款时订单才会进入。"],
    ["每个订单都按你的流程", "在应用的 Sync settings 中，选择新订单的起始阶段、在每个订单上创建的任务清单，以及工作区中的默认负责人。"],
    ["变化来自 Shopify", "付款状态、带承运商和运单号的发货、退款和取消都会更新任务。这些更新只改变 Shopify 信息；你的备注和待办保持不变。"],
    ["选择同步哪些订单", "同步所有订单，或只同步包含所选商品或系列的订单，并按标签包含或排除订单。"]
  ],
  directionTitle: "读取什么，绝不更改什么",
  readsTitle: "以只读权限读取",
  reads: [
    "订单及其发货",
    "这些订单的客户：姓名、邮箱、电话和地址",
    "商品和系列，用于应用你的筛选条件",
    "店铺名称、邮箱和币种"
  ],
  writesTitle: "绝不在 Shopify 中更改",
  writes: ["商品、价格和库存", "订单、发货和运单号", "客户", "主题和店面"],
  directionNote: "应用只向 Shopify 申请读取权限（订单、客户、商品、发货），因此无法更改你的店铺。运单号不会回传到 Shopify。",
  syncTitle: "同步如何运作",
  syncFacts: [
    ["Webhook", "Shopify 会在订单新增或变更时立即通知 NivaDesk；每次推送都会校验签名，并且只处理一次。"],
    ["补漏检查", "NivaDesk 还会每 15 分钟向你的店铺查询 Webhook 可能遗漏的订单。"],
    ["Sync history", "应用的 Sync history 列出每个事件及其结果；失败的事件可以在那里重试。"]
  ],
  connectTitle: "安装和连接",
  connectSteps: [
    ["安装应用", "在 Shopify App Store 打开 NivaDesk Order Management，点击 Install，选择你的店铺并批准读取权限。应用会在 Shopify 后台中打开。"],
    ["点击 Connect", "在应用中打开 Connection，点击“Connect existing NivaDesk account”或“Create a NivaDesk account”。新标签页会打开一个 NivaDesk 页面，带有你店铺的一次性代码。"],
    ["登录或注册", "登录 NivaDesk，或用你的姓名、工作区名称、邮箱和密码创建账户。完成后会立即回到连接页面。"],
    ["选择工作区", "选择这个店铺要同步到的工作区，然后点击“Connect store”。只有工作区所有者可以连接店铺。"],
    ["回到 Shopify", "Shopify 中的 Connection 页面会自动变为 Connected。从此，新的已付款订单会自动同步。"],
    ["设置和历史订单", "如有需要，在 Sync settings 中设置筛选、起始阶段、任务和负责人，然后通过 Import orders 导入历史订单。"]
  ],
  connectNotes: [
    "一次性代码 15 分钟内有效。过期后，请在 Shopify 中再次点击 Connect。",
    "已经用另一个账户登录了 NivaDesk？请先在连接页面使用“switch account”，再选择工作区。"
  ],
  pricingTitle: "由 Shopify 计费的套餐",
  pricingIntro: "从 Shopify 应用连接的工作区由 Shopify 计费：费用列在你的 Shopify 账单中，以美元计价，每 30 天收取一次。在 Shopify 后台 NivaDesk 应用的 Plans 页面选择或更改套餐；每笔费用 Shopify 都会请你确认。",
  perPeriod: "每 30 天计费",
  planNotes: {
    free: "最多同时 10 个进行中的订单，客户不限，1 位用户。",
    starter: "订单和客户不限，1 位用户；时间线、备注和历史记录。",
    pro: "包含 Starter 的全部功能，另有 10 GB Client Files 和高级财务。",
    team: "包含 Pro 的全部功能，5 位用户、团队消息和角色；50 GB Client Files。"
  },
  trialNote: "付费套餐从最长 14 天的免费试用开始，每个工作区一次。如果你的工作区已在网站上开始过 NivaDesk 试用，剩余天数会延续过来。试用结束前不会收费。",
  billingFacts: [
    ["更改套餐", "在 Plans 页面选择其他套餐；Shopify 会显示新的费用请你确认。"],
    ["取消", "在 Shopify 后台的 Settings › Apps 中卸载应用即可取消其费用。工作区会回到 Free，并保留其中已有的订单。"],
    ["只有一种付款方式", "由 Shopify 计费的工作区不能再在 nivadesk.app、App Store 或 Google Play 购买套餐，也无法购买额外席位和存储附加项。已经直接向 NivaDesk 付费的工作区在连接店铺后保留原套餐，不会通过 Shopify 收费。"],
    ["nivadesk.app 上的价格", "我们价格页面上的英镑价格适用于由 NivaDesk 直接计费的工作区。"]
  ],
  limitTitle: "Free 套餐的进行中订单上限",
  limitIntro: "在 Free 套餐中，最多可以同时有 10 个进行中的订单。已交付和已删除的订单不计入，付费套餐没有订单上限。",
  limitPoints: [
    ["达到上限时", "新的 Shopify 订单不会丢失。NivaDesk 会让它们等待（最长 90 天），并显示在网页版订单页面的顶部。"],
    ["腾出空间", "把完成的工作标记为已交付，或在 Shopify 中选择付费套餐，然后在订单页面点击“导入”。等待中的订单按从旧到新的顺序进入，直到没有空位。"],
    ["更新不占名额", "对已在 NivaDesk 中的订单进行更改，永远不会占用名额。该上限同样适用于自动同步和导入。"]
  ],
  importTitle: "导入历史订单",
  importIntro: "在应用中打开 Import orders。",
  importSteps: [
    ["选择导入范围", "最近 30 天、最近 90 天、最近 12 个月、自定义日期范围，或 Selected orders only：最多 250 个订单 ID，即 Shopify 后台中订单地址末尾的数字。"],
    ["预览", "点击 Preview count，查看有多少订单符合条件。"],
    ["开始", "点击 Start import。页面会显示进度：已创建、已跳过和失败，以及每个失败的原因。"]
  ],
  importNote: "已在 NivaDesk 中的订单会被跳过，你的筛选条件会生效；未付款订单会被跳过，除非你允许导入。即使关闭了自动同步，导入也能使用。应用 Home 页面上的“Sync now”会重新检查最近 24 小时。",
  dataTitle: "断开连接、卸载与你的数据",
  data: [
    ["断开连接", "在应用中点击 Connection › Disconnect 会停止同步，已导入的内容不会被删除。在 NivaDesk 中，“设置 › 集成”会显示已连接的店铺，所有者可以在那里暂停或移除它。"],
    ["卸载", "卸载会停止同步，Shopify 会收回应用的访问权限。由 Shopify 计费的套餐随之结束，工作区回到 Free；已导入的订单保留在你的工作区中。"],
    ["客户隐私请求", "NivaDesk 会记录 Shopify 的客户数据请求；收到客户删除请求时，会将该客户在你店铺订单中的信息匿名化，并保留金额。卸载后，Shopify 的店铺删除请求会移除该店铺的连接记录。"],
    ["安全", "店铺的访问令牌经加密存储，只由 NivaDesk 的服务器使用。来自 Shopify 的每个 Webhook 都会校验签名。"]
  ],
  faqTitle: "商家常见问题",
  faq: [
    ["需要 NivaDesk 账户吗？", "需要。如果还没有，可以在设置过程中的连接页面创建，大约一分钟即可完成。"],
    ["支持哪些语言？", "Shopify 后台中的应用为英文。NivaDesk 本身在网页、iPhone、iPad、Mac 和 Android 上支持包括中文在内的 12 种语言。"],
    ["为什么价格是美元？", "从 Shopify 安装的工作区的套餐由 Shopify 收费，而 Shopify 以美元收取应用套餐费用。"],
    ["NivaDesk 会把运单号回传到 Shopify 吗？", "不会。它只从 Shopify 读取发货、承运商和运单号，从不写入你的店铺。"],
    ["有订单没有进来，应该检查什么？", "打开应用中的 Sync history：每个事件都显示结果，失败的可以重试。未付款的订单、不符合筛选条件的订单，以及在 Free 套餐中等待空位的订单，会被有意跳过或保留。你也可以通过 Import orders › Selected orders only 单独导入某个订单。"],
    ["可以在手机上使用 NivaDesk 吗？", "可以。同一个工作区可在网页、iPhone、iPad、Mac 和 Android 上使用。由 Shopify 计费的工作区，需要在 Shopify 后台的 NivaDesk 应用中更改套餐。"]
  ],
  contactTitle: "帮助与支持",
  contactBody: "请写信给我们，附上你的店铺地址（your-store.myshopify.com）和你看到的情况。我们通常在一个工作日内回复。",
  trademark: "Shopify 是 Shopify Inc. 的商标。NivaDesk 是独立产品，与 Shopify 无关联，也未获得 Shopify 的认可。"
};

const AR: ShopifyHelpCopy = {
  eyebrow: "تطبيق Shopify · دليل الإعداد",
  heroTitle: "NivaDesk لـ Shopify: طلبات المتجر تصبح أعمال إنتاج",
  heroIntro: "NivaDesk Order Management هو تطبيق NivaDesk على Shopify App Store. يجلب الطلبات المدفوعة من متجرك إلى مساحة عمل NivaDesk كأعمال، مع مرحلة البداية وقائمة المهام والشخص المسؤول التي تختارها، ويُبقيها محدَّثة عندما يتغيّر شيء في Shopify. تشرح هذه الصفحة ما يفعله التطبيق، وكيف تثبّته وتربطه، وكيف تُحتسب الخطط، وحدّ خطة Free، واستيراد الطلبات السابقة، وأين تجد المساعدة.",
  ctaInstall: "التثبيت من Shopify App Store",
  ctaSteps: "خطوات الإعداد",
  heroFacts: [
    "وصول للقراءة فقط: لا يتغيّر أي شيء في متجرك",
    "تُختار الخطط وتُدفع في Shopify",
    "خطة Free متاحة؛ والخطط المدفوعة تبدأ بفترة تجربة مجانية"
  ],
  mockLabel: "رسم توضيحي: قائمة طلبات NivaDesk مع طلبات من متجر Shopify",
  mockCaption: "رسم توضيحي بمنتجات على سبيل المثال، وليست طلبات حقيقية.",
  mockItems: ["زينة كعكة مخصّصة", "خاتم محفور", "مطبوعة في إطار"],
  mockStatusDispatched: "تم الشحن",
  statusTitle: "التوفر",
  statusLabel: "متاح على Shopify App Store",
  statusBody: "نُشر في 12 أكتوبر 2026 باسم «NivaDesk Order Management» (المطوّر: EGGcraft Limited). يمكن لأي متجر Shopify تثبيته؛ ويحتاج الربط إلى حساب NivaDesk يمكنك إنشاؤه مجانًا أثناء الإعداد.",
  jobsTitle: "ما الذي يفعله التطبيق",
  jobsIntro: "ما هو مذكور هنا فقط. كل شيء يحدث في مساحة عمل NivaDesk الخاصة بك؛ يُقرأ متجر Shopify ولا يُعدَّل أبدًا.",
  jobs: [
    ["الطلبات المدفوعة الجديدة تصبح أعمالًا", "يصل كل طلب مدفوع جديد مع العميل وبنود المنتجات والإجماليات، ويُطابَق مع سجلات العملاء الموجودة لديك. تُتخطّى الطلبات غير المدفوعة ما لم تسمح باستيرادها؛ ويصل الطلب عندما يُبلغ Shopify بأنه مدفوع."],
    ["سير عملك على كل طلب", "في Sync settings داخل التطبيق، اختر المرحلة التي تبدأ بها الطلبات الجديدة، وقائمة المهام التي تُنشأ في كل طلب، والشخص المسؤول الافتراضي من مساحة عملك."],
    ["التغييرات تأتي من Shopify", "تُحدِّث حالةُ الدفع، والشحناتُ مع شركة الشحن ورقم التتبّع، والمبالغُ المستردّة، والإلغاءاتُ العملَ. لا تغيّر هذه التحديثات إلا بيانات Shopify؛ وتبقى ملاحظاتك ومهامك كما هي."],
    ["اختر الطلبات التي تُزامَن", "زامن كل الطلبات، أو فقط الطلبات التي تحتوي على منتجات أو مجموعات مختارة، وأدرج الطلبات أو استبعدها حسب الوسم."]
  ],
  directionTitle: "ما الذي يقرؤه، وما الذي لا يغيّره أبدًا",
  readsTitle: "يقرأ، بأذونات القراءة فقط",
  reads: [
    "الطلبات وشحناتها",
    "عملاء تلك الطلبات: الاسم والبريد الإلكتروني والهاتف والعناوين",
    "المنتجات والمجموعات، لتطبيق عوامل التصفية",
    "اسم متجرك وبريده الإلكتروني وعملته"
  ],
  writesTitle: "لا يتغيّر أبدًا في Shopify",
  writes: ["المنتجات والأسعار والمخزون", "الطلبات والشحنات وأرقام التتبّع", "العملاء", "القالب وواجهة المتجر"],
  directionNote: "لا يطلب التطبيق من Shopify إلا أذونات القراءة (الطلبات والعملاء والمنتجات والشحنات)، لذلك لا يملك أي وسيلة لتعديل متجرك. ولا تُرسَل أرقام التتبّع إلى Shopify.",
  syncTitle: "كيف تعمل المزامنة",
  syncFacts: [
    ["Webhooks", "يُخطر Shopify تطبيقَ NivaDesk بالطلبات الجديدة والمعدّلة فور حدوثها؛ ويُتحقَّق من توقيع كل إرسال ويُطبَّق مرة واحدة فقط."],
    ["فحص التعويض", "كل 15 دقيقة يسأل NivaDesk متجرك أيضًا عن الطلبات التي ربما فاتت أحد الـ webhooks."],
    ["Sync history", "تعرض صفحة Sync history في التطبيق كل حدث ونتيجته؛ ويمكن إعادة محاولة الحدث الفاشل من هناك."]
  ],
  connectTitle: "التثبيت والربط",
  connectSteps: [
    ["ثبّت التطبيق", "افتح NivaDesk Order Management على Shopify App Store، واضغط Install، واختر متجرك، ووافق على أذونات القراءة. يفتح التطبيق داخل لوحة إدارة Shopify."],
    ["اضغط Connect", "في التطبيق افتح Connection واضغط «Connect existing NivaDesk account» أو «Create a NivaDesk account». تفتح صفحة NivaDesk في علامة تبويب جديدة مع رمز لمرة واحدة لمتجرك."],
    ["سجّل الدخول أو أنشئ حسابًا", "سجّل الدخول إلى NivaDesk، أو أنشئ حسابًا باسمك واسم لمساحة العمل وبريدك الإلكتروني وكلمة مرور. تعود فورًا إلى صفحة الربط."],
    ["اختر مساحة العمل", "اختر مساحة العمل التي ستُزامَن إليها طلبات هذا المتجر واضغط «Connect store». لا يستطيع ربط المتجر إلا مالك مساحة العمل."],
    ["عُد إلى Shopify", "تتحوّل صفحة Connection في Shopify تلقائيًا إلى Connected. ومن الآن تُزامَن الطلبات المدفوعة الجديدة تلقائيًا."],
    ["الإعدادات والطلبات السابقة", "إن أردت، اضبط عوامل التصفية ومرحلة البداية والمهام والمسؤول في Sync settings، ثم استورد الطلبات السابقة من Import orders."]
  ],
  connectNotes: [
    "الرمز صالح لمدة 15 دقيقة. إذا انتهت صلاحيته، اضغط Connect مرة أخرى في Shopify.",
    "هل سجّلت الدخول إلى NivaDesk بحساب آخر؟ استخدم «switch account» في صفحة الربط قبل اختيار مساحة العمل."
  ],
  pricingTitle: "خطط يحتسبها Shopify",
  pricingIntro: "مساحة العمل المرتبطة من تطبيق Shopify يحتسبها Shopify، على فاتورة Shopify الخاصة بك، بالدولار الأمريكي، كل 30 يومًا. تختار الخطة أو تغيّرها من صفحة Plans في تطبيق NivaDesk داخل لوحة إدارة Shopify؛ ويطلب منك Shopify الموافقة على كل رسم.",
  perPeriod: "يُحتسب كل 30 يومًا",
  planNotes: {
    free: "حتى 10 طلبات نشطة في الوقت نفسه، عملاء بلا حدود، مستخدم واحد.",
    starter: "طلبات وعملاء بلا حدود، مستخدم واحد؛ الخط الزمني والملاحظات والسجل.",
    pro: "كل ما في Starter، بالإضافة إلى 10 GB من Client Files والمالية المتقدمة.",
    team: "كل ما في Pro، مع 5 مستخدمين ورسائل الفريق والأدوار؛ 50 GB من Client Files."
  },
  trialNote: "تبدأ الخطط المدفوعة بفترة تجربة مجانية تصل إلى 14 يومًا، مرة واحدة لكل مساحة عمل. إذا كانت مساحة عملك قد بدأت تجربة NivaDesk على الموقع، تنتقل الأيام المتبقية. لا يُحتسب أي شيء قبل انتهاء التجربة.",
  billingFacts: [
    ["تغيير الخطة", "اختر خطة أخرى في صفحة Plans؛ يعرض عليك Shopify الرسم الجديد للموافقة عليه."],
    ["الإلغاء", "يؤدي إلغاء تثبيت التطبيق من Settings › Apps في لوحة إدارة Shopify إلى إلغاء رسومه. تعود مساحة العمل إلى Free وتحتفظ بالطلبات الموجودة فيها."],
    ["طريقة دفع واحدة", "لا يمكن لمساحة عمل يحتسبها Shopify شراء خطة إضافية من nivadesk.app أو App Store أو Google Play، ولا تتوفر لها مقاعد إضافية أو إضافات تخزين. أما مساحة العمل التي تدفع لـ NivaDesk مباشرة فتحتفظ بخطتها عند ربط متجر، ولا يُحتسب شيء عبر Shopify."],
    ["الأسعار على nivadesk.app", "الأسعار بالجنيه الإسترليني في صفحة الأسعار لدينا مخصّصة لمساحات العمل التي يحتسبها NivaDesk مباشرة."]
  ],
  limitTitle: "حدّ الطلبات النشطة في خطة Free",
  limitIntro: "في Free يمكن أن يكون حتى 10 طلبات نشطة في الوقت نفسه. لا تُحتسب الطلبات المُسلَّمة والمحذوفة، ولا يوجد حدّ للطلبات في الخطط المدفوعة.",
  limitPoints: [
    ["عند امتلاء الحدّ", "لا تضيع طلبات Shopify الجديدة. يُبقيها NivaDesk في الانتظار حتى 90 يومًا، ويعرضها أعلى شاشة الطلبات على الويب."],
    ["إفساح المجال", "علّم العمل المنتهي كمُسلَّم، أو اختر خطة مدفوعة في Shopify، ثم اضغط «استيراد» في شاشة الطلبات. تدخل الطلبات المنتظرة من الأقدم إلى الأحدث بقدر ما تتسع المساحة."],
    ["التحديثات لا تُحتسب", "تغيير طلب موجود بالفعل في NivaDesk لا يشغل مكانًا أبدًا. ويسري الحدّ على المزامنة التلقائية والاستيراد على حدّ سواء."]
  ],
  importTitle: "استيراد الطلبات السابقة",
  importIntro: "افتح Import orders في التطبيق.",
  importSteps: [
    ["اختر ما تستورده", "آخر 30 يومًا، أو آخر 90 يومًا، أو آخر 12 شهرًا، أو نطاق تواريخ مخصّص، أو Selected orders only: حتى 250 معرّف طلب، وهو الرقم في نهاية عنوان الطلب في لوحة إدارة Shopify."],
    ["المعاينة", "اضغط Preview count لترى عدد الطلبات المطابقة."],
    ["البدء", "اضغط Start import. تعرض الصفحة التقدّم: ما أُنشئ وما تُخطّي وما فشل، مع سبب كل فشل."]
  ],
  importNote: "تُتخطّى الطلبات الموجودة بالفعل في NivaDesk، وتُطبَّق عوامل التصفية، وتُتخطّى الطلبات غير المدفوعة ما لم تسمح بها. يعمل الاستيراد حتى عند إيقاف المزامنة التلقائية. ويعيد «Sync now» في صفحة Home بالتطبيق فحص آخر 24 ساعة.",
  dataTitle: "فصل الربط وإلغاء التثبيت وبياناتك",
  data: [
    ["فصل الربط", "يوقف Connection › Disconnect في التطبيق المزامنة. لا يُحذف أي شيء تم استيراده. وفي NivaDesk تعرض «الإعدادات › التكاملات» المتجر المرتبط، ويمكن للمالك إيقافه مؤقتًا أو إزالته من هناك."],
    ["إلغاء التثبيت", "يوقف إلغاء التثبيت المزامنة ويسحب Shopify وصول التطبيق. تنتهي الخطة التي يحتسبها Shopify وتعود مساحة العمل إلى Free؛ وتبقى الطلبات المستوردة في مساحة عملك."],
    ["طلبات خصوصية العملاء", "يسجّل NivaDesk طلبات بيانات العملاء الواردة من Shopify، وعند طلب حذف بيانات عميل يُخفي هوية ذلك العميل في الطلبات الواردة من متجرك مع الإبقاء على المبالغ. وبعد إلغاء التثبيت، يزيل طلب حذف بيانات المتجر من Shopify سجلّ ربط المتجر."],
    ["الأمان", "يُخزَّن رمز الوصول الخاص بالمتجر مشفّرًا ولا تستخدمه إلا خوادم NivaDesk. ويُتحقَّق من توقيع كل webhook يصل من Shopify."]
  ],
  faqTitle: "أسئلة يطرحها التجّار",
  faq: [
    ["هل أحتاج إلى حساب NivaDesk؟", "نعم. إن لم يكن لديك حساب، أنشئه من صفحة الربط أثناء الإعداد؛ يستغرق ذلك نحو دقيقة."],
    ["ما اللغات المتاحة؟", "التطبيق داخل لوحة إدارة Shopify باللغة الإنجليزية. أما NivaDesk نفسه على الويب وiPhone وiPad وMac وAndroid فيعمل بـ 12 لغة، منها العربية."],
    ["لماذا الأسعار بالدولار الأمريكي؟", "خطط مساحات العمل المثبّتة من Shopify يحتسبها Shopify، وهو يحتسب خطط التطبيقات بالدولار الأمريكي."],
    ["هل يرسل NivaDesk أرقام التتبّع إلى Shopify؟", "لا. يقرأ الشحنات وشركة الشحن ورقم التتبّع من Shopify ولا يكتب شيئًا في متجرك أبدًا."],
    ["لم يصل أحد الطلبات. ماذا أتحقق؟", "افتح Sync history في التطبيق: يعرض كل حدث نتيجته، ويمكن إعادة محاولة الأحداث الفاشلة. الطلبات غير المدفوعة، والطلبات خارج عوامل التصفية، والطلبات التي تنتظر مكانًا في Free، تُتخطّى أو تُحتجز عمدًا. ويمكنك أيضًا استيراد طلب واحد عبر Import orders › Selected orders only."],
    ["هل يمكنني استخدام NivaDesk على الهاتف؟", "نعم. تعمل مساحة العمل نفسها على الويب وiPhone وiPad وMac وAndroid. وفي مساحة العمل التي يحتسبها Shopify، تُغيَّر الخطة من تطبيق NivaDesk داخل لوحة إدارة Shopify."]
  ],
  contactTitle: "المساعدة والدعم",
  contactBody: "راسلنا مع عنوان متجرك (your-store.myshopify.com) وما تراه. نردّ عادةً خلال يوم عمل واحد.",
  trademark: "Shopify علامة تجارية لشركة Shopify Inc. أما NivaDesk فمنتج مستقل غير تابع لـ Shopify ولا يحظى بتأييدها."
};

const HI: ShopifyHelpCopy = {
  eyebrow: "Shopify ऐप · सेटअप गाइड",
  heroTitle: "Shopify के लिए NivaDesk: स्टोर के ऑर्डर बनते हैं प्रोडक्शन जॉब",
  heroIntro: "NivaDesk Order Management, Shopify App Store पर NivaDesk का ऐप है। यह आपके स्टोर के भुगतान हो चुके ऑर्डर को आपके NivaDesk वर्कस्पेस में जॉब के रूप में लाता है, आपकी चुनी हुई शुरुआती स्टेज, टास्क चेकलिस्ट और ज़िम्मेदार व्यक्ति के साथ, और Shopify में कुछ बदलने पर उन्हें अपडेट रखता है। इस पेज पर बताया गया है कि ऐप क्या करता है, उसे कैसे इंस्टॉल और कनेक्ट करें, प्लान का बिल कैसे बनता है, Free प्लान की सीमा, पुराने ऑर्डर इम्पोर्ट करना और मदद कहाँ मिलेगी।",
  ctaInstall: "Shopify App Store से इंस्टॉल करें",
  ctaSteps: "सेटअप के चरण",
  heroFacts: [
    "केवल-पढ़ने की पहुँच: आपके स्टोर में कुछ नहीं बदला जाता",
    "प्लान Shopify में चुने जाते हैं और उनका बिल Shopify बनाता है",
    "Free प्लान उपलब्ध; पेड प्लान मुफ़्त ट्रायल से शुरू होते हैं"
  ],
  mockLabel: "चित्रण: Shopify स्टोर के ऑर्डर के साथ NivaDesk की ऑर्डर सूची",
  mockCaption: "उदाहरण आइटम वाला चित्रण। ये असली ऑर्डर नहीं हैं।",
  mockItems: ["पर्सनलाइज़्ड केक टॉपर", "नक्काशीदार अंगूठी", "फ़्रेम किया हुआ प्रिंट"],
  mockStatusDispatched: "भेजा गया",
  statusTitle: "उपलब्धता",
  statusLabel: "Shopify App Store पर लाइव",
  statusBody: "12 अक्टूबर 2026 को “NivaDesk Order Management” नाम से प्रकाशित (डेवलपर: EGGcraft Limited)। कोई भी Shopify स्टोर इसे इंस्टॉल कर सकता है; कनेक्ट करने के लिए NivaDesk खाता चाहिए, जिसे आप सेटअप के दौरान मुफ़्त में बना सकते हैं।",
  jobsTitle: "ऐप क्या करता है",
  jobsIntro: "सिर्फ़ वही जो यहाँ लिखा है। सब कुछ आपके NivaDesk वर्कस्पेस में होता है; आपका Shopify स्टोर केवल पढ़ा जाता है, कभी बदला नहीं जाता।",
  jobs: [
    ["नए भुगतान वाले ऑर्डर जॉब बनते हैं", "हर नया भुगतान वाला ऑर्डर ग्राहक, आइटम और कुल राशि के साथ आता है और आपके मौजूदा ग्राहक रिकॉर्ड से मिलाया जाता है। बिना भुगतान वाले ऑर्डर तब तक छोड़े जाते हैं जब तक आप उनका इम्पोर्ट चालू न करें; Shopify जब ऑर्डर को भुगतान हो चुका बताता है, तब वह आता है।"],
    ["हर ऑर्डर पर आपका वर्कफ़्लो", "ऐप की Sync settings में चुनें कि नए ऑर्डर किस स्टेज से शुरू हों, हर ऑर्डर पर कौन-सी टास्क चेकलिस्ट बने, और आपके वर्कस्पेस से डिफ़ॉल्ट ज़िम्मेदार व्यक्ति कौन हो।"],
    ["बदलाव Shopify से आते हैं", "भुगतान की स्थिति, कूरियर और ट्रैकिंग नंबर के साथ फ़ुलफ़िलमेंट, रिफ़ंड और रद्दीकरण जॉब को अपडेट करते हैं। ये अपडेट सिर्फ़ Shopify की जानकारी बदलते हैं; आपके नोट्स और टास्क जैसे हैं वैसे रहते हैं।"],
    ["चुनें कि कौन-से ऑर्डर सिंक हों", "सभी ऑर्डर सिंक करें, या सिर्फ़ चुने हुए प्रोडक्ट या कलेक्शन वाले ऑर्डर, और टैग के आधार पर ऑर्डर शामिल करें या बाहर रखें।"]
  ],
  directionTitle: "क्या पढ़ता है और क्या कभी नहीं बदलता",
  readsTitle: "पढ़ता है, केवल-पढ़ने की अनुमतियों से",
  reads: [
    "ऑर्डर और उनके फ़ुलफ़िलमेंट",
    "उन ऑर्डर के ग्राहक: नाम, ईमेल, फ़ोन और पते",
    "आपके फ़िल्टर लागू करने के लिए प्रोडक्ट और कलेक्शन",
    "आपके स्टोर का नाम, ईमेल और मुद्रा"
  ],
  writesTitle: "Shopify में कभी नहीं बदला जाता",
  writes: ["प्रोडक्ट, कीमतें और स्टॉक", "ऑर्डर, फ़ुलफ़िलमेंट और ट्रैकिंग नंबर", "ग्राहक", "आपकी थीम और स्टोरफ़्रंट"],
  directionNote: "ऐप Shopify से सिर्फ़ पढ़ने की अनुमतियाँ माँगता है (ऑर्डर, ग्राहक, प्रोडक्ट, फ़ुलफ़िलमेंट), इसलिए उसके पास आपका स्टोर बदलने का कोई तरीका नहीं है। ट्रैकिंग नंबर Shopify को वापस नहीं भेजे जाते।",
  syncTitle: "सिंक कैसे काम करता है",
  syncFacts: [
    ["वेबहुक", "Shopify नए और बदले हुए ऑर्डर की सूचना तुरंत NivaDesk को देता है; हर डिलीवरी उसके सिग्नेचर से जाँची जाती है और सिर्फ़ एक बार लागू होती है।"],
    ["छूटे ऑर्डर की जाँच", "हर 15 मिनट में NivaDesk आपके स्टोर से वे ऑर्डर भी पूछता है जो किसी वेबहुक से छूट गए हों।"],
    ["Sync history", "ऐप की Sync history हर इवेंट और उसका नतीजा दिखाती है; विफल इवेंट को वहीं से दोबारा चलाया जा सकता है।"]
  ],
  connectTitle: "इंस्टॉल और कनेक्ट करें",
  connectSteps: [
    ["ऐप इंस्टॉल करें", "Shopify App Store पर NivaDesk Order Management खोलें, Install दबाएँ, अपना स्टोर चुनें और पढ़ने की अनुमतियाँ मंज़ूर करें। ऐप आपके Shopify एडमिन के अंदर खुलता है।"],
    ["Connect दबाएँ", "ऐप में Connection खोलें और “Connect existing NivaDesk account” या “Create a NivaDesk account” दबाएँ। नए टैब में आपके स्टोर के एक-बार वाले कोड के साथ NivaDesk का पेज खुलता है।"],
    ["साइन इन या साइन अप करें", "NivaDesk में साइन इन करें, या अपने नाम, वर्कस्पेस के नाम, ईमेल और पासवर्ड से खाता बनाएँ। आप तुरंत कनेक्ट पेज पर लौट आते हैं।"],
    ["वर्कस्पेस चुनें", "वह वर्कस्पेस चुनें जिसमें यह स्टोर सिंक होना चाहिए और “Connect store” दबाएँ। स्टोर सिर्फ़ वर्कस्पेस का मालिक कनेक्ट कर सकता है।"],
    ["Shopify पर लौटें", "Shopify का Connection पेज अपने-आप Connected हो जाता है। अब से नए भुगतान वाले ऑर्डर अपने-आप सिंक होते हैं।"],
    ["सेटिंग्स और पुराने ऑर्डर", "चाहें तो Sync settings में फ़िल्टर, शुरुआती स्टेज, टास्क और ज़िम्मेदार व्यक्ति सेट करें, फिर Import orders से पुराने ऑर्डर लाएँ।"]
  ],
  connectNotes: [
    "एक-बार वाला कोड 15 मिनट तक मान्य है। समय निकल गया हो तो Shopify में फिर से Connect दबाएँ।",
    "किसी दूसरे खाते से NivaDesk में साइन इन हैं? वर्कस्पेस चुनने से पहले कनेक्ट पेज पर “switch account” इस्तेमाल करें।"
  ],
  pricingTitle: "प्लान, जिनका बिल Shopify बनाता है",
  pricingIntro: "Shopify ऐप से कनेक्ट किए गए वर्कस्पेस का बिल Shopify बनाता है — आपके Shopify इनवॉइस पर, अमेरिकी डॉलर में, हर 30 दिन में। प्लान आप अपने Shopify एडमिन में NivaDesk ऐप के Plans पेज पर चुनते या बदलते हैं; हर शुल्क के लिए Shopify आपकी मंज़ूरी माँगता है।",
  perPeriod: "हर 30 दिन में बिल",
  planNotes: {
    free: "एक साथ अधिकतम 10 सक्रिय ऑर्डर, असीमित ग्राहक, 1 उपयोगकर्ता।",
    starter: "असीमित ऑर्डर और ग्राहक, 1 उपयोगकर्ता; टाइमलाइन, नोट्स और इतिहास।",
    pro: "Starter का सब कुछ, साथ में 10 GB Client Files और एडवांस्ड फ़ाइनेंस।",
    team: "Pro का सब कुछ, 5 उपयोगकर्ता, टीम मैसेज और रोल; 50 GB Client Files।"
  },
  trialNote: "पेड प्लान अधिकतम 14 दिन के मुफ़्त ट्रायल से शुरू होते हैं, हर वर्कस्पेस के लिए एक बार। अगर आपके वर्कस्पेस ने वेबसाइट पर NivaDesk ट्रायल पहले ही शुरू किया था, तो बचे हुए दिन आगे जुड़ जाते हैं। ट्रायल ख़त्म होने तक कोई शुल्क नहीं लिया जाता।",
  billingFacts: [
    ["प्लान बदलना", "Plans पेज पर दूसरा प्लान चुनें; Shopify नया शुल्क मंज़ूरी के लिए दिखाता है।"],
    ["रद्द करना", "अपने Shopify एडमिन में Settings › Apps से ऐप अनइंस्टॉल करने पर उसके शुल्क रद्द हो जाते हैं। वर्कस्पेस Free पर लौट आता है और उसमें पहले से मौजूद ऑर्डर बने रहते हैं।"],
    ["भुगतान का एक ही तरीका", "जिस वर्कस्पेस का बिल Shopify बनाता है, वह nivadesk.app, App Store या Google Play से अलग से प्लान नहीं खरीद सकता, और उसके लिए अतिरिक्त सीटें और स्टोरेज ऐड-ऑन उपलब्ध नहीं हैं। जो वर्कस्पेस पहले से NivaDesk को सीधे भुगतान करता है, वह स्टोर कनेक्ट करने पर अपना प्लान बनाए रखता है; Shopify के ज़रिए कुछ नहीं लिया जाता।"],
    ["nivadesk.app पर कीमतें", "हमारे प्राइसिंग पेज पर पाउंड में दी गई कीमतें उन वर्कस्पेस के लिए हैं जिनका बिल सीधे NivaDesk बनाता है।"]
  ],
  limitTitle: "Free प्लान में सक्रिय ऑर्डर की सीमा",
  limitIntro: "Free में एक साथ अधिकतम 10 ऑर्डर सक्रिय हो सकते हैं। डिलीवर और डिलीट किए गए ऑर्डर नहीं गिने जाते, और पेड प्लान में ऑर्डर की कोई सीमा नहीं है।",
  limitPoints: [
    ["सीमा भर जाने पर", "नए Shopify ऑर्डर खोते नहीं हैं। NivaDesk उन्हें अधिकतम 90 दिन तक इंतज़ार में रखता है और वेब पर “आदेश” स्क्रीन के ऊपर दिखाता है।"],
    ["जगह बनाना", "पूरा हुआ काम डिलीवर के रूप में चिह्नित करें, या Shopify में पेड प्लान चुनें, फिर “आदेश” स्क्रीन पर “आयात करें” दबाएँ। इंतज़ार वाले ऑर्डर सबसे पुराने से शुरू होकर, जितनी जगह हो उतने आते हैं।"],
    ["अपडेट नहीं गिने जाते", "NivaDesk में पहले से मौजूद ऑर्डर में बदलाव कभी जगह नहीं लेता। यह सीमा अपने-आप सिंक और इम्पोर्ट दोनों पर एक जैसी लागू होती है।"]
  ],
  importTitle: "पुराने ऑर्डर इम्पोर्ट करें",
  importIntro: "ऐप में Import orders खोलें।",
  importSteps: [
    ["क्या इम्पोर्ट करना है, चुनें", "पिछले 30 दिन, पिछले 90 दिन, पिछले 12 महीने, अपनी चुनी तारीख़ों की अवधि, या Selected orders only: अधिकतम 250 ऑर्डर ID, यानी आपके Shopify एडमिन में ऑर्डर के पते के आख़िर में लिखा नंबर।"],
    ["प्रीव्यू", "कितने ऑर्डर मेल खाते हैं, यह देखने के लिए Preview count दबाएँ।"],
    ["शुरू करें", "Start import दबाएँ। पेज प्रगति दिखाता है: बनाए गए, छोड़े गए और विफल, हर विफलता के कारण के साथ।"]
  ],
  importNote: "NivaDesk में पहले से मौजूद ऑर्डर छोड़ दिए जाते हैं, आपके फ़िल्टर लागू होते हैं, और बिना भुगतान वाले ऑर्डर तब तक छोड़े जाते हैं जब तक आप अनुमति न दें। अपने-आप सिंक बंद होने पर भी इम्पोर्ट काम करता है। ऐप के Home पेज पर “Sync now” पिछले 24 घंटे दोबारा जाँचता है।",
  dataTitle: "डिस्कनेक्ट, अनइंस्टॉल और आपका डेटा",
  data: [
    ["डिस्कनेक्ट", "ऐप में Connection › Disconnect सिंक रोक देता है। जो पहले इम्पोर्ट हो चुका है, वह डिलीट नहीं होता। NivaDesk में “सेटिंग्स › इंटीग्रेशन” कनेक्ट किया गया स्टोर दिखाता है, जहाँ मालिक उसे रोक या हटा सकता है।"],
    ["अनइंस्टॉल", "अनइंस्टॉल करने से सिंक रुक जाता है और Shopify ऐप की पहुँच वापस ले लेता है। Shopify से बिल होने वाला प्लान ख़त्म हो जाता है और वर्कस्पेस Free पर लौट आता है; इम्पोर्ट किए गए ऑर्डर आपके वर्कस्पेस में रहते हैं।"],
    ["ग्राहकों के प्राइवेसी अनुरोध", "NivaDesk, Shopify के ग्राहक-डेटा अनुरोधों को दर्ज करता है, और किसी ग्राहक के डेटा हटाने के अनुरोध पर आपके स्टोर से आए ऑर्डर में उस ग्राहक की जानकारी को राशियाँ बनाए रखते हुए गुमनाम कर देता है। अनइंस्टॉल के बाद, Shopify का स्टोर डेटा हटाने का अनुरोध स्टोर का कनेक्शन रिकॉर्ड हटा देता है।"],
    ["सुरक्षा", "स्टोर का एक्सेस टोकन एन्क्रिप्ट करके रखा जाता है और सिर्फ़ NivaDesk के सर्वर उसका उपयोग करते हैं। Shopify से आने वाला हर वेबहुक उसके सिग्नेचर से जाँचा जाता है।"]
  ],
  faqTitle: "मर्चेंट जो पूछते हैं",
  faq: [
    ["क्या मुझे NivaDesk खाते की ज़रूरत है?", "हाँ। अगर नहीं है, तो सेटअप के दौरान कनेक्ट पेज पर बना लें; इसमें लगभग एक मिनट लगता है।"],
    ["यह किन भाषाओं में है?", "Shopify एडमिन के अंदर का ऐप अंग्रेज़ी में है। NivaDesk ख़ुद वेब, iPhone, iPad, Mac और Android पर हिन्दी समेत 12 भाषाओं में इस्तेमाल किया जा सकता है।"],
    ["कीमतें अमेरिकी डॉलर में क्यों हैं?", "Shopify से इंस्टॉल किए गए वर्कस्पेस के प्लान का शुल्क Shopify लेता है, और Shopify ऐप प्लान का बिल अमेरिकी डॉलर में बनाता है।"],
    ["क्या NivaDesk ट्रैकिंग नंबर Shopify को वापस भेजता है?", "नहीं। यह Shopify से फ़ुलफ़िलमेंट, कूरियर और ट्रैकिंग नंबर पढ़ता है और आपके स्टोर में कभी कुछ नहीं लिखता।"],
    ["कोई ऑर्डर नहीं आया। मैं क्या जाँचूँ?", "ऐप में Sync history खोलें: हर इवेंट अपना नतीजा दिखाता है और विफल इवेंट दोबारा चलाए जा सकते हैं। बिना भुगतान वाले ऑर्डर, आपके फ़िल्टर से बाहर के ऑर्डर और Free में जगह का इंतज़ार कर रहे ऑर्डर जान-बूझकर छोड़े या रोके जाते हैं। आप Import orders › Selected orders only से एक ऑर्डर अलग से भी ला सकते हैं।"],
    ["क्या मैं फ़ोन पर NivaDesk इस्तेमाल कर सकता हूँ?", "हाँ। वही वर्कस्पेस वेब, iPhone, iPad, Mac और Android पर चलता है। जिस वर्कस्पेस का बिल Shopify बनाता है, उसका प्लान Shopify एडमिन के अंदर NivaDesk ऐप में बदला जाता है।"]
  ],
  contactTitle: "मदद और सपोर्ट",
  contactBody: "अपने स्टोर का पता (your-store.myshopify.com) और जो दिख रहा है, वह लिखकर हमें भेजें। हम आम तौर पर एक कार्यदिवस के भीतर जवाब देते हैं।",
  trademark: "Shopify, Shopify Inc. का ट्रेडमार्क है। NivaDesk एक स्वतंत्र उत्पाद है और Shopify से संबद्ध या Shopify द्वारा समर्थित नहीं है।"
};

export const SHOPIFY_HELP_COPY: Record<StudioLanguage, ShopifyHelpCopy> = {
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
 * What a Shopify-installed workspace is charged (functions/index.js SHOPIFY_BILLING_PLANS,
 * USD, EVERY_30_DAYS; read from the live shopifyAppBridge archive 15 Oct 2026). Display
 * only: the charge itself is priced on the server and approved on Shopify's own screen.
 */
export const SHOPIFY_PLAN_PRICES_USD = [
  { id: "free", name: null, monthly: "$0" },
  { id: "starter", name: "Starter", monthly: "$12" },
  { id: "pro", name: "Pro", monthly: "$25" },
  { id: "team", name: "Team", monthly: "$65" }
] as const;
