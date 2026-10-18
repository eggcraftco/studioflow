import type { StudioLanguage } from "@/lib/studioflow/language";

/**
 * The public setup page for the NivaDesk connector for Claude (/integrations/claude),
 * 17 October 2026. Modelled on /integrations/shopify: public, no sign-in, every
 * sentence states what the live server does. Evidence, claim by claim, read on
 * 17 October 2026 from the live chatgptMcp source (the archive deployed as
 * chatgptMcp; nivadesk-deploy-2026-10-15/workflow-paths/M01/live-function-source-chatgptMcp.zip)
 * and the live tools/list (21 tools, prod-tools-list.json):
 *
 *   - Plans: no plan check on the connection (PLAN_ENTITLEMENTS: chatgptAppEnabled true
 *     on demo, lifetime_lite, pro_monthly, team_monthly; nothing reads it). Money depth
 *     follows advancedFinanceEnabled (Free/Starter: basic totals; Pro/Team: shipping,
 *     platform fee, VAT/tax, custom costs) — the get_dashboard_summary and
 *     get_extra_spending_overview descriptions say the same. bankFeedEnabled: Pro and
 *     Team only, so bank tools return "no bank feed is connected" elsewhere.
 *     create_order passes assertOrderSlotInTransaction (the plan's order limit).
 *     NOTHING here about trials: membership decisions K2–K6 are open (karar paketi 17 Eki).
 *   - Roles: nvRequireWriteAccess (owner/admin/member/workflowOnly; view-only cannot),
 *     nvRequireOrdersArea (the Orders switch), nvRequireWorkflowAssignedOrder
 *     (workflow-only: assigned orders only), nvRequireFinancialAccess,
 *     nvRequireDashboardAccess, nvRequireBankFeedAccess (owner or Bank Spending access;
 *     attach is owner-only).
 *   - Notes: companies/{id}/personal_notes/{uid}/notes — the caller's own notes, which
 *     include accepted shared notes (the server writes each collaborator a copy;
 *     docs/notes-sharing-contract-2026-10-14.md).
 *   - Status changes run notifyCustomerOnStatusChange (e-mail when the order's
 *     portalAutoUpdates allow it). No tool deletes anything; no tool moves money.
 *   - Disconnect in NivaDesk: revokeChatGPTConnection, owner-only, immediate; grants
 *     last 30 days (NV_CHATGPT_OAUTH_ACCESS_TOKEN_TTL_MS).
 *     Release (17 Oct 2026, claude-endpoint README, web 11d622a2): connections are per
 *     client (ChatGPT / Claude / Claude Code do not end each other); Settings lists each
 *     with Disconnect plus a separate Disconnect all; Claude gets a 90-day rotating
 *     refresh token (access tokens still 30 days); Claude's attach_bank_receipt returns
 *     a 15-minute single-use upload link to /bank?receiptUpload=… and receives no file.
 *   - Logging: piiAccessLog row per personal-data read (tool, who, when; no tool
 *     results); tool results are returned to Claude and are not stored by NivaDesk.
 *
 * Tool names stay in English (they are the names Claude shows). Plan names are product
 * names and stay untranslated. Labels shared with /integrations/amazon (legal links,
 * contact labels, company line) come from that page's table.
 */

type Pair = readonly [title: string, body: string];
type ToolLine = readonly [toolName: string, what: string];

export type ClaudeToolGroup = {
  title: string;
  intro: string;
  tools: readonly ToolLine[];
  examples: readonly string[];
};

export type ClaudeHelpCopy = {
  eyebrow: string;
  heroTitle: string;
  heroIntro: string;
  ctaConnect: string;
  ctaTools: string;
  heroFacts: readonly [string, string, string];
  mockLabel: string;
  mockCaption: string;
  mockPrompt: string;
  mockTool: string;
  mockReply: string;
  statusTitle: string;
  statusLabel: string;
  statusBody: string;
  whoTitle: string;
  whoIntro: string;
  who: readonly [Pair, Pair, Pair, Pair];
  connectTitle: string;
  connectSteps: readonly [Pair, Pair, Pair, Pair, Pair];
  urlLabel: string;
  urlPending: string;
  connectNotes: readonly [string, string];
  toolsTitle: string;
  toolsIntro: string;
  modeRead: string;
  modeWrite: string;
  modeDestructive: string;
  examplesLabel: string;
  groups: readonly [ClaudeToolGroup, ClaudeToolGroup, ClaudeToolGroup, ClaudeToolGroup, ClaudeToolGroup];
  safetyTitle: string;
  safetyIntro: string;
  safety: readonly [Pair, Pair, Pair, Pair, Pair];
  dataTitle: string;
  data: readonly [Pair, Pair, Pair, Pair];
  disconnectTitle: string;
  disconnect: readonly [Pair, Pair];
  disconnectNote: string;
  disconnectLink: string;
  faqTitle: string;
  faq: readonly Pair[];
  contactTitle: string;
  contactBody: string;
  trademark: string;
};

const EN: ClaudeHelpCopy = {
  eyebrow: "Claude connector · Setup guide",
  heroTitle: "NivaDesk for Claude: ask about your orders, notes and numbers",
  heroIntro: "The NivaDesk connector lets Claude, Anthropic's AI assistant, work with your NivaDesk workspace. You sign in with your own NivaDesk account; Claude can then look up orders, notes, stock and the figures your role is allowed to see, and, when you ask, create an order, add a note or move an order to a new status. This page covers who can use it, how to connect, what each tool does, the safety rules and how to disconnect.",
  ctaConnect: "Connection steps",
  ctaTools: "What you can ask",
  heroFacts: [
    "Your own NivaDesk sign-in: no shared keys, no public data",
    "Your plan, role and workspace permissions apply to every answer",
    "Each tool declares whether it reads, adds or changes data"
  ],
  mockLabel: "Illustration: a Claude conversation using the NivaDesk connector",
  mockCaption: "Illustration with example data. Not a real workspace.",
  mockPrompt: "Which orders are due this week?",
  mockTool: "NivaDesk · Search orders",
  mockReply: "Three orders are due this week: the engraved ring (Thursday), the framed print (Friday) and the cake topper (Saturday). The ring is still in progress.",
  statusTitle: "Availability",
  statusLabel: "Live",
  statusBody: "The NivaDesk connector is live. Add it to Claude as a custom connector with the address below. A listing in Anthropic's Connectors Directory is being prepared; this page will say when it is there.",
  whoTitle: "Who can use it",
  whoIntro: "\"Public\" means anyone can add the connector. It never means anyone can read data: every call runs as the NivaDesk user who signed in, inside the one workspace they chose.",
  who: [
    ["A NivaDesk account", "You connect with the e-mail and password (or Google / Apple sign-in) you use for NivaDesk. Without an account there is nothing to connect to; you can create one at nivadesk.app."],
    ["Any NivaDesk plan", "The connector works on every plan. What it can return follows your plan, as in the app: on Free and Starter the money figures are the basic totals (Received, Base Cost, Basic Balance); Pro and Team add shipping, platform fees, VAT / tax and other costs. Plan limits apply too, so an order Claude creates counts towards the Free plan's active-order limit."],
    ["Your role in the workspace", "Owners, admins and members can read and change what their access allows. View-only members can read but cannot create or change orders. Workflow-only members see only the orders assigned to them, and no money figures. If the owner has switched Orders, Dashboard, Financial info or Bank Spending off for you, the connector is refused the same thing."],
    ["A Claude account that can add connectors", "Which Claude plans and apps can add connectors, and who in a Claude organisation may add them, is decided by Anthropic and by your Claude administrator, not by NivaDesk."]
  ],
  connectTitle: "Connect NivaDesk to Claude",
  connectSteps: [
    ["Open Connectors in Claude", "In Claude, open Settings › Connectors."],
    ["Find NivaDesk", "Search the directory for NivaDesk. Until the listing is live, choose Add custom connector and paste the connector address shown below."],
    ["Sign in to NivaDesk", "Claude opens NivaDesk's sign-in page. Sign in with your NivaDesk account. NivaDesk never shows your password to Claude; Claude receives an access grant, not your credentials."],
    ["Choose the workspace", "If you belong to more than one workspace, pick the one Claude may use. Every call is limited to that workspace; to use another one, disconnect and connect again."],
    ["Ask", "Back in Claude, ask in plain language. Claude chooses the NivaDesk tool it needs and shows you which one it is calling."]
  ],
  urlLabel: "Connector address",
  urlPending: "Not published yet. The address will appear here when the Claude endpoint is live.",
  connectNotes: [
    "You stay connected: Claude renews its access in the background. You sign in again only if the connection was disconnected, your access to the workspace changed, or it went unused for 90 days.",
    "Connections are independent. Connecting Claude does not disconnect ChatGPT or Claude Code, and disconnecting one leaves the others working. Each person connects with their own account and gets the access of their own role."
  ],
  toolsTitle: "What Claude can do with NivaDesk",
  toolsIntro: "The connector has 21 tools. Each one declares whether it only reads, adds something new, or changes or overwrites existing records (marked destructive). Whether Claude asks you before running a tool depends on Claude's own settings and your choices there; NivaDesk's permissions (plan, role, workspace access) are enforced on its servers on every call either way.",
  modeRead: "Read",
  modeWrite: "Write",
  modeDestructive: "Destructive",
  examplesLabel: "Try asking",
  groups: [
    {
      title: "Orders",
      intro: "Your workspace's orders and their workflow, plus orders that came in from connected sales channels.",
      tools: [
        ["search_orders", "Find orders by customer, e-mail, item, status, order ID or any keyword."],
        ["get_order_detail", "Read one order in full: customer, item, dates, status, payments your role may see, and its history."],
        ["search_commerce_orders", "Find orders from any connected channel and see the channel's own payment and fulfilment status beside NivaDesk's workflow status. No amounts."],
        ["create_order", "Create a new order with the customer, item, brief, price and due date you give."],
        ["add_order_note", "Add an internal note to an order's history."],
        ["update_order_status", "Change an order's status or design status. Your workspace's notification rules run on the change, so the customer may get an e-mail."]
      ],
      examples: [
        "Which orders are overdue, and who are they for?",
        "Create an order for Sam Lee: a framed print, £85, £20 paid today, due 14 November.",
        "Move the engraved ring order to Ready to Collect."
      ]
    },
    {
      title: "Personal notes",
      intro: "Your own Notes in NivaDesk, including notes others shared with you that you accepted. Not other people's notes, and not order notes.",
      tools: [
        ["search_notes", "Search your notes by text or label; archived and deleted ones only if you ask."],
        ["get_note_detail", "Read one note in full."],
        ["create_note", "Create a note with a title, text, labels, links and colour."],
        ["append_note", "Add text to the end of an existing note."],
        ["update_note", "Replace a note's title, text, labels, links or colour."],
        ["pin_note", "Pin or unpin a note."],
        ["archive_note", "Archive or unarchive a note. Nothing is deleted."]
      ],
      examples: [
        "Find my note about the supplier visit and summarise it.",
        "Add \"order more walnut blanks\" to my shopping list note."
      ]
    },
    {
      title: "Money",
      intro: "Figures from your orders, only where your role includes financial info and only at the depth your plan has.",
      tools: [
        ["get_dashboard_summary", "The dashboard in numbers: active and due orders, and the finance totals you may see."],
        ["get_order_financials", "One order's Financial Info: price, paid, remaining and, on Pro and Team, costs and tax."],
        ["get_financial_overview", "Workspace totals: received, still to be paid, costs and estimated profit."],
        ["get_extra_spending_overview", "Costs for this month, this year, all time or a date range: base cost, and on Pro and Team shipping, platform fees, VAT / tax and custom costs."]
      ],
      examples: [
        "How much is still to be paid on open orders?",
        "What did I spend on shipping and platform fees this year?"
      ]
    },
    {
      title: "Bank spending",
      intro: "Your business bank feed, when the workspace has one connected (a Pro and Team feature). The owner, and members given Bank Spending access, can read it.",
      tools: [
        ["get_bank_spending_summary", "Spending for a month or a year: totals, change on the previous period, categories, top merchants and subscriptions."],
        ["search_bank_transactions", "List transactions by merchant, date, category, amount or missing receipt."],
        ["attach_bank_receipt", "Gives you a single-use NivaDesk link, valid for 15 minutes, to upload a receipt for one transaction. You choose and upload the file on NivaDesk's Bank page while signed in; no file passes through Claude. Owner only."]
      ],
      examples: [
        "How much did I spend in September, and on what?",
        "Which card payments this month have no receipt yet?"
      ]
    },
    {
      title: "Inventory",
      intro: "Your stock as NivaDesk records it.",
      tools: [
        ["search_inventory", "Search stock by name, SKU, serial number, brand, model, category or location; filter by status, low stock or reserved."]
      ],
      examples: [
        "What is running low?",
        "Do we have any 18 mm leather straps in the workshop?"
      ]
    }
  ],
  safetyTitle: "Permissions and safety",
  safetyIntro: "The connector does what you could do yourself in NivaDesk with the same account, and nothing more.",
  safety: [
    ["Same rules as the app", "Every call is checked on NivaDesk's servers against your role, your access switches and your plan before anything is read or written. Claude cannot see another workspace or another member's personal notes."],
    ["Tool types and confirmations", "Each tool declares whether it only reads, adds something new, or changes or overwrites existing data (changing an order's status, adding a note to an order, adding to, editing, pinning or archiving a note). Whether Claude asks before running a tool depends on Claude's own settings and the choices you make there; NivaDesk does not control that. NivaDesk's own permissions — your plan, your role and your workspace access — are enforced on its servers on every call, whatever Claude's settings."],
    ["Messages to customers", "Changing an order's status can send your customer an e-mail if your workspace's notifications are on for that order. Claude is told this, and it is the same message the app would send."],
    ["Nothing is deleted, no money moves", "No tool deletes orders, notes, customers or bank data; archiving a note can be undone. The connector cannot make payments, refunds or transfers."],
    ["Limits", "Searches return a bounded number of results, and what Claude reads is the data your answer needs, not a copy of your workspace."]
  ],
  dataTitle: "Your data",
  data: [
    ["What Claude receives", "Only the results of the tools Claude calls for you: for example the orders that match a search. Those results become part of your Claude conversation and are handled by Anthropic under your agreement with Anthropic and its privacy policy."],
    ["What NivaDesk receives", "The tool calls themselves: which tool, with what details (for example the search text or the new order's fields). NivaDesk does not receive your conversation with Claude, your Claude memory or your files in Claude. Receipts never travel through Claude: you upload them on NivaDesk's own page."],
    ["What NivaDesk keeps", "Orders, notes and receipts you create through Claude are saved in your workspace like any other. NivaDesk records which tool read personal data, who called it and when, without the results, and keeps technical request logs for a limited time for security."],
    ["Not used for advertising", "NivaDesk does not sell data from the connector or use it to advertise. The Privacy Policy explains retention, your rights and how to contact us."]
  ],
  disconnectTitle: "Disconnect",
  disconnect: [
    ["In Claude", "Open Settings › Connectors, choose NivaDesk and disconnect. Claude stops calling NivaDesk for you."],
    ["In NivaDesk (workspace owner)", "Open Settings › Integrations › Claude. Every Claude and Claude Code connection is listed there. Disconnect ends that one connection; Disconnect all ends every Claude connection to the workspace, and ChatGPT connections are not affected. Either works at once."]
  ],
  disconnectNote: "Disconnecting does not delete anything you created through Claude: those orders and notes stay in your workspace until you delete them in NivaDesk.",
  disconnectLink: "Open Settings › Integrations",
  faqTitle: "Questions",
  faq: [
    ["Is my data public because the connector is public?", "No. Anyone can add the connector, but it shows nothing until someone signs in with their own NivaDesk account, and then only what that account may see in the workspace they chose."],
    ["Does it work on the Free plan?", "Yes. On Free and Starter the money tools return the basic totals only, and the bank tools have no data because a bank feed is a Pro and Team feature."],
    ["Can my team use it?", "Yes, each person with their own NivaDesk login. Each gets the access of their own role: a workflow-only member sees only their assigned orders and no money figures."],
    ["Does connecting Claude disconnect ChatGPT?", "No. Each assistant has its own connection. Connecting, renewing or disconnecting Claude does not touch a ChatGPT or Claude Code connection, unless you choose Disconnect all."],
    ["Can Claude delete orders?", "No. There is no delete tool. Claude can create orders, add notes and change status; changing a status is declared as a destructive tool. Whether Claude asks before running it depends on your Claude settings."],
    ["Will my customers be contacted?", "Only through your own NivaDesk notification rules, when Claude changes an order's status and that order has notifications on. Claude does not send messages any other way."],
    ["Which language can I use?", "Ask Claude in any language it understands. NivaDesk's data comes back as it is stored in your workspace."],
    ["Something went wrong", "Tool errors say what was refused and why, for example that your role cannot update orders. If it is not clear, contact support with the time and what you asked."]
  ],
  contactTitle: "Support",
  contactBody: "Questions about the connector, a problem with an answer, or a security concern: open a ticket from inside NivaDesk, or write to us. Tell us roughly when it happened and what you asked Claude; please do not send passwords.",
  trademark: "Claude is a trademark of Anthropic, PBC. NivaDesk is an independent product of EGGCRAFT LIMITED and is not affiliated with or endorsed by Anthropic."
};

const TR: ClaudeHelpCopy = {
  eyebrow: "Claude bağlayıcısı · Kurulum rehberi",
  heroTitle: "Claude için NivaDesk: siparişlerinizi, notlarınızı ve rakamlarınızı sorun",
  heroIntro: "NivaDesk bağlayıcısı, Anthropic'in yapay zekâ asistanı Claude'un NivaDesk çalışma alanınızla çalışmasını sağlar. Kendi NivaDesk hesabınızla giriş yaparsınız; ardından Claude siparişlere, notlara, stoğa ve rolünüzün görmesine izin verilen rakamlara bakabilir, siz istediğinizde de sipariş oluşturabilir, not ekleyebilir ya da bir siparişi yeni bir duruma taşıyabilir. Bu sayfa kimlerin kullanabileceğini, nasıl bağlanılacağını, her aracın ne yaptığını, güvenlik kurallarını ve bağlantının nasıl kesileceğini anlatır.",
  ctaConnect: "Bağlantı adımları",
  ctaTools: "Neler sorabilirsiniz",
  heroFacts: [
    "Kendi NivaDesk girişiniz: paylaşılan anahtar yok, herkese açık veri yok",
    "Planınız, rolünüz ve çalışma alanı izinleriniz her yanıtta geçerlidir",
    "Her araç okuyup okumadığını, ekleyip eklemediğini ya da değiştirip değiştirmediğini bildirir"
  ],
  mockLabel: "Görsel: NivaDesk bağlayıcısını kullanan bir Claude sohbeti",
  mockCaption: "Örnek verilerle görsel. Gerçek bir çalışma alanı değildir.",
  mockPrompt: "Bu hafta teslimi olan siparişler hangileri?",
  mockTool: "NivaDesk · Siparişleri ara",
  mockReply: "Bu hafta üç siparişin teslimi var: gravürlü yüzük (perşembe), çerçeveli baskı (cuma) ve pasta süsü (cumartesi). Yüzük hâlâ yapım aşamasında.",
  statusTitle: "Durum",
  statusLabel: "Yayında",
  statusBody: "NivaDesk bağlayıcısı yayında. Aşağıdaki adresle Claude'a özel bağlayıcı (custom connector) olarak ekleyin. Anthropic'in Connectors Directory listesi hazırlanıyor; listelendiğinde bu sayfa söyleyecek.",
  whoTitle: "Kimler kullanabilir",
  whoIntro: "\"Herkese açık\", bağlayıcıyı herkesin ekleyebileceği anlamına gelir. Verileri herkesin okuyabileceği anlamına asla gelmez: her çağrı giriş yapan NivaDesk kullanıcısı adına ve yalnızca onun seçtiği çalışma alanında çalışır.",
  who: [
    ["Bir NivaDesk hesabı", "NivaDesk'te kullandığınız e-posta ve parolayla (ya da Google / Apple ile girişle) bağlanırsınız. Hesap yoksa bağlanacak bir şey de yoktur; nivadesk.app'te hesap açabilirsiniz."],
    ["Her NivaDesk planı", "Bağlayıcı her planda çalışır. Neler döndürebileceği, uygulamada olduğu gibi planınıza bağlıdır: Free ve Starter'da para rakamları temel toplamlardır (Alınan, Temel Maliyet, Temel Bakiye); Pro ve Team kargo, platform ücreti, KDV / vergi ve diğer maliyetleri ekler. Plan sınırları da geçerlidir; Claude'un oluşturduğu sipariş Free planın aktif sipariş sınırına sayılır."],
    ["Çalışma alanındaki rolünüz", "Sahipler, yöneticiler ve üyeler erişimlerinin izin verdiğini okuyup değiştirebilir. Yalnız görüntüleme üyeleri okuyabilir ama sipariş oluşturamaz veya değiştiremez. Yalnız iş akışı üyeleri yalnızca kendilerine atanan siparişleri görür, para rakamlarını görmez. Sahip sizin için Siparişler, Pano, Finansal bilgi veya Banka Harcamaları'nı kapattıysa bağlayıcıya da aynısı reddedilir."],
    ["Bağlayıcı ekleyebilen bir Claude hesabı", "Hangi Claude planlarının ve uygulamalarının bağlayıcı ekleyebileceğine, bir Claude kuruluşunda kimin ekleyebileceğine NivaDesk değil, Anthropic ve Claude yöneticiniz karar verir."]
  ],
  connectTitle: "NivaDesk'i Claude'a bağlayın",
  connectSteps: [
    ["Claude'da Connectors'ı açın", "Claude'da Settings › Connectors'ı açın."],
    ["NivaDesk'i bulun", "Dizinde NivaDesk'i arayın. Liste yayına girene kadar Add custom connector'ı seçip aşağıdaki bağlayıcı adresini yapıştırın."],
    ["NivaDesk'e giriş yapın", "Claude NivaDesk'in giriş sayfasını açar. NivaDesk hesabınızla giriş yapın. NivaDesk parolanızı Claude'a hiçbir zaman göstermez; Claude bilgilerinizi değil, bir erişim izni alır."],
    ["Çalışma alanını seçin", "Birden fazla çalışma alanındaysanız Claude'un kullanabileceği alanı seçin. Her çağrı o alanla sınırlıdır; başka bir alan için bağlantıyı kesip yeniden bağlanın."],
    ["Sorun", "Claude'a dönüp doğal bir dille sorun. Claude ihtiyaç duyduğu NivaDesk aracını seçer ve hangisini çağırdığını size gösterir."]
  ],
  urlLabel: "Bağlayıcı adresi",
  urlPending: "Henüz yayımlanmadı. Claude uç noktası yayına girdiğinde adres burada görünecek.",
  connectNotes: [
    "Bağlı kalırsınız: Claude erişimini arka planda yeniler. Yalnızca bağlantı kesildiyse, çalışma alanı erişiminiz değiştiyse ya da 90 gün kullanılmadıysa yeniden giriş yaparsınız.",
    "Bağlantılar birbirinden bağımsızdır. Claude'u bağlamak ChatGPT'yi ya da Claude Code'u koparmaz, birini kesmek diğerlerini çalışır bırakır. Herkes kendi hesabıyla bağlanır ve kendi rolünün erişimini alır."
  ],
  toolsTitle: "Claude NivaDesk ile neler yapabilir",
  toolsIntro: "Bağlayıcının 21 aracı var. Her araç yalnızca okuyup okumadığını, yeni bir şey ekleyip eklemediğini ya da mevcut kayıtları değiştirip değiştirmediğini (yıkıcı olarak işaretlenir) bildirir. Claude'un bir aracı çalıştırmadan önce size sorup sormayacağı Claude'un kendi ayarlarına ve oradaki seçimlerinize bağlıdır; NivaDesk izinleri (plan, rol, çalışma alanı erişimi) her durumda her çağrıda sunucularında uygulanır.",
  modeRead: "Okuma",
  modeWrite: "Yazma",
  modeDestructive: "Yıkıcı",
  examplesLabel: "Şunu sorun",
  groups: [
    {
      title: "Siparişler",
      intro: "Çalışma alanınızın siparişleri ve iş akışları, ayrıca bağlı satış kanallarından gelen siparişler.",
      tools: [
        ["search_orders", "Siparişleri müşteri, e-posta, ürün, durum, sipariş kimliği ya da herhangi bir sözcükle bulur."],
        ["get_order_detail", "Tek bir siparişi tamamen okur: müşteri, ürün, tarihler, durum, rolünüzün görebildiği ödemeler ve geçmişi."],
        ["search_commerce_orders", "Bağlı her kanaldan siparişleri bulur ve kanalın kendi ödeme ve gönderim durumunu NivaDesk iş akışı durumunun yanında gösterir. Tutar yok."],
        ["create_order", "Verdiğiniz müşteri, ürün, açıklama, fiyat ve teslim tarihiyle yeni sipariş oluşturur."],
        ["add_order_note", "Bir siparişin geçmişine iç not ekler."],
        ["update_order_status", "Bir siparişin durumunu ya da tasarım durumunu değiştirir. Çalışma alanınızın bildirim kuralları değişiklikte çalışır; müşteri e-posta alabilir."]
      ],
      examples: [
        "Geciken siparişler hangileri ve kimin için?",
        "Sam Lee için sipariş oluştur: çerçeveli baskı, 85 £, bugün 20 £ ödendi, teslim 14 Kasım.",
        "Gravürlü yüzük siparişini Ready to Collect durumuna taşı."
      ]
    },
    {
      title: "Kişisel notlar",
      intro: "NivaDesk'teki kendi Notlarınız; başkalarının sizinle paylaştığı ve kabul ettiğiniz notlar dahil. Başkalarının notları ve sipariş notları değil.",
      tools: [
        ["search_notes", "Notlarınızı metne veya etikete göre arar; arşivlenmiş ve silinmiş olanlar yalnızca isterseniz."],
        ["get_note_detail", "Tek bir notu tamamen okur."],
        ["create_note", "Başlık, metin, etiket, bağlantı ve renkle not oluşturur."],
        ["append_note", "Mevcut bir notun sonuna metin ekler."],
        ["update_note", "Bir notun başlığını, metnini, etiketlerini, bağlantılarını veya rengini değiştirir."],
        ["pin_note", "Notu sabitler ya da sabitlemeyi kaldırır."],
        ["archive_note", "Notu arşivler ya da arşivden çıkarır. Hiçbir şey silinmez."]
      ],
      examples: [
        "Tedarikçi ziyaretiyle ilgili notumu bul ve özetle.",
        "Alışveriş listesi notuma \"ceviz blok sipariş et\" ekle."
      ]
    },
    {
      title: "Para",
      intro: "Siparişlerinizden rakamlar; yalnızca rolünüz finansal bilgiyi içeriyorsa ve yalnızca planınızın derinliğinde.",
      tools: [
        ["get_dashboard_summary", "Rakamlarla pano: aktif ve teslimi gelen siparişler, görebildiğiniz finans toplamları."],
        ["get_order_financials", "Bir siparişin Finansal Bilgisi: fiyat, ödenen, kalan; Pro ve Team'de maliyetler ve vergi."],
        ["get_financial_overview", "Çalışma alanı toplamları: alınan, ödenecek, maliyetler ve tahmini kâr."],
        ["get_extra_spending_overview", "Bu ay, bu yıl, tüm zamanlar ya da bir tarih aralığı için maliyetler: temel maliyet; Pro ve Team'de kargo, platform ücreti, KDV / vergi ve özel maliyetler."]
      ],
      examples: [
        "Açık siparişlerde ne kadar ödeme kaldı?",
        "Bu yıl kargo ve platform ücretlerine ne harcadım?"
      ]
    },
    {
      title: "Banka harcamaları",
      intro: "Çalışma alanına bağlı bir banka akışı varsa işletme banka akışınız (Pro ve Team özelliği). Sahip ve Banka Harcamaları erişimi verilen üyeler okuyabilir.",
      tools: [
        ["get_bank_spending_summary", "Bir ayın ya da yılın harcaması: toplamlar, önceki döneme göre değişim, kategoriler, en çok harcanan yerler ve abonelikler."],
        ["search_bank_transactions", "İşlemleri satıcıya, tarihe, kategoriye, tutara ya da eksik fişe göre listeler."],
        ["attach_bank_receipt", "Tek bir işlem için fiş yüklemeniz için 15 dakika geçerli, tek kullanımlık bir NivaDesk bağlantısı verir. Dosyayı giriş yapmışken NivaDesk'in Banka sayfasında siz seçip yüklersiniz; hiçbir dosya Claude'dan geçmez. Yalnızca sahip."]
      ],
      examples: [
        "Eylülde ne kadar ve neye harcadım?",
        "Bu ay hangi kart ödemelerinin henüz fişi yok?"
      ]
    },
    {
      title: "Envanter",
      intro: "NivaDesk'in kaydettiği stoğunuz.",
      tools: [
        ["search_inventory", "Stoğu ad, SKU, seri numarası, marka, model, kategori ya da konuma göre arar; duruma, azalan stoğa ya da rezerveye göre süzer."]
      ],
      examples: [
        "Neler azalıyor?",
        "Atölyede 18 mm deri kayış var mı?"
      ]
    }
  ],
  safetyTitle: "İzinler ve güvenlik",
  safetyIntro: "Bağlayıcı, aynı hesapla NivaDesk'te sizin yapabileceğinizi yapar, fazlasını değil.",
  safety: [
    ["Uygulamayla aynı kurallar", "Her çağrı, bir şey okunmadan ya da yazılmadan önce NivaDesk sunucularında rolünüze, erişim ayarlarınıza ve planınıza göre denetlenir. Claude başka bir çalışma alanını ya da başka bir üyenin kişisel notlarını göremez."],
    ["Araç türleri ve onaylar", "Her araç yalnızca okuyup okumadığını, yeni bir şey ekleyip eklemediğini ya da mevcut veriyi değiştirip değiştirmediğini bildirir (sipariş durumunu değiştirme, siparişe not ekleme, bir nota ekleme, notu düzenleme, sabitleme ya da arşivleme). Claude'un bir aracı çalıştırmadan önce sorup sormayacağı Claude'un kendi ayarlarına ve oradaki seçimlerinize bağlıdır; bunu NivaDesk belirlemez. NivaDesk'in kendi izinleri — planınız, rolünüz ve çalışma alanı erişiminiz — Claude ayarları ne olursa olsun her çağrıda sunucularında uygulanır."],
    ["Müşterilere giden mesajlar", "Bir siparişin durumunu değiştirmek, çalışma alanınızda o sipariş için bildirimler açıksa müşterinize e-posta gönderebilir. Claude'a bu söylenir; giden mesaj uygulamanın göndereceği mesajın aynısıdır."],
    ["Hiçbir şey silinmez, para hareket etmez", "Hiçbir araç sipariş, not, müşteri ya da banka verisi silmez; notu arşivlemek geri alınabilir. Bağlayıcı ödeme, iade ya da transfer yapamaz."],
    ["Sınırlar", "Aramalar sınırlı sayıda sonuç döndürür; Claude'un okuduğu, yanıtınızın gerektirdiği veridir, çalışma alanınızın bir kopyası değil."]
  ],
  dataTitle: "Verileriniz",
  data: [
    ["Claude ne alır", "Yalnızca Claude'un sizin için çağırdığı araçların sonuçlarını: örneğin bir aramayla eşleşen siparişleri. Bu sonuçlar Claude sohbetinizin parçası olur ve Anthropic tarafından Anthropic ile aranızdaki sözleşme ve onun gizlilik politikası kapsamında işlenir."],
    ["NivaDesk ne alır", "Araç çağrılarının kendisini: hangi araç, hangi ayrıntılarla (örneğin arama metni ya da yeni siparişin alanları). NivaDesk, Claude ile sohbetinizi, Claude belleğinizi ya da Claude'daki dosyalarınızı almaz. Fişler hiçbir zaman Claude'dan geçmez: onları NivaDesk'in kendi sayfasında yüklersiniz."],
    ["NivaDesk ne saklar", "Claude üzerinden oluşturduğunuz siparişler, notlar ve fişler diğerleri gibi çalışma alanınıza kaydedilir. NivaDesk hangi aracın kişisel veri okuduğunu, kimin ve ne zaman çağırdığını sonuçlar olmadan kaydeder; güvenlik için teknik istek kayıtlarını sınırlı bir süre tutar."],
    ["Reklam için kullanılmaz", "NivaDesk bağlayıcıdan gelen veriyi satmaz ve reklam için kullanmaz. Saklama süreleri, haklarınız ve bize nasıl ulaşacağınız Gizlilik Politikası'nda anlatılır."]
  ],
  disconnectTitle: "Bağlantıyı kesme",
  disconnect: [
    ["Claude'da", "Settings › Connectors'ı açın, NivaDesk'i seçin ve bağlantıyı kesin. Claude sizin adınıza NivaDesk'i çağırmayı bırakır."],
    ["NivaDesk'te (çalışma alanı sahibi)", "Ayarlar › Entegrasyonlar › Claude bölümünü açın. Tüm Claude ve Claude Code bağlantıları orada listelenir. Disconnect yalnızca o bağlantıyı, Disconnect all çalışma alanının tüm Claude bağlantılarını sonlandırır; ChatGPT bağlantıları etkilenmez. İkisi de hemen etkili olur."]
  ],
  disconnectNote: "Bağlantıyı kesmek Claude üzerinden oluşturduğunuz hiçbir şeyi silmez: o siparişler ve notlar siz NivaDesk'te silene kadar çalışma alanınızda kalır.",
  disconnectLink: "Ayarlar › Entegrasyonlar'ı aç",
  faqTitle: "Sorular",
  faq: [
    ["Bağlayıcı herkese açık olduğu için verilerim herkese açık mı?", "Hayır. Bağlayıcıyı herkes ekleyebilir ama biri kendi NivaDesk hesabıyla giriş yapana kadar hiçbir şey göstermez; sonra da yalnızca o hesabın seçtiği çalışma alanında görebileceklerini."],
    ["Free planda çalışır mı?", "Evet. Free ve Starter'da para araçları yalnızca temel toplamları döndürür; banka araçlarında veri yoktur çünkü banka akışı bir Pro ve Team özelliğidir."],
    ["Ekibim kullanabilir mi?", "Evet, herkes kendi NivaDesk girişiyle. Herkes kendi rolünün erişimini alır: yalnız iş akışı üyesi yalnızca kendisine atanan siparişleri görür, para rakamlarını görmez."],
    ["Claude'u bağlamak ChatGPT'yi koparır mı?", "Hayır. Her asistanın kendi bağlantısı var. Claude'u bağlamak, yenilemek ya da kesmek, Disconnect all'ı seçmediğiniz sürece ChatGPT ya da Claude Code bağlantısına dokunmaz."],
    ["Claude sipariş silebilir mi?", "Hayır. Silme aracı yok. Claude sipariş oluşturabilir, not ekleyebilir ve durum değiştirebilir; durum değiştirme yıkıcı bir araç olarak bildirilir. Claude'un onu çalıştırmadan önce sorup sormayacağı Claude ayarlarınıza bağlıdır."],
    ["Müşterilerimle iletişime geçilir mi?", "Yalnızca kendi NivaDesk bildirim kurallarınızla: Claude bir siparişin durumunu değiştirdiğinde ve o siparişte bildirimler açıksa. Claude başka bir yolla mesaj göndermez."],
    ["Hangi dili kullanabilirim?", "Claude'a anladığı herhangi bir dilde sorun. NivaDesk verileri çalışma alanınızda nasıl kayıtlıysa öyle gelir."],
    ["Bir şeyler ters gitti", "Araç hataları neyin neden reddedildiğini söyler; örneğin rolünüzün sipariş güncelleyemediğini. Açık değilse saati ve ne sorduğunuzu yazarak destekle iletişime geçin."]
  ],
  contactTitle: "Destek",
  contactBody: "Bağlayıcı hakkında sorular, bir yanıttaki sorun ya da güvenlik endişesi için NivaDesk içinden ticket açın ya da bize yazın. Yaklaşık ne zaman olduğunu ve Claude'a ne sorduğunuzu belirtin; lütfen parola göndermeyin.",
  trademark: "Claude, Anthropic, PBC'nin ticari markasıdır. NivaDesk, EGGCRAFT LIMITED'in bağımsız bir ürünüdür; Anthropic ile bağlantılı değildir ve Anthropic tarafından onaylanmamıştır."
};

const DE: ClaudeHelpCopy = {
  eyebrow: "Claude-Connector · Einrichtung",
  heroTitle: "NivaDesk für Claude: Fragen zu Aufträgen, Notizen und Zahlen",
  heroIntro: "Mit dem NivaDesk-Connector arbeitet Claude, der KI-Assistent von Anthropic, mit Ihrem NivaDesk-Workspace. Sie melden sich mit Ihrem eigenen NivaDesk-Konto an; danach kann Claude Aufträge, Notizen, Bestand und die Zahlen nachschlagen, die Ihre Rolle sehen darf, und auf Ihren Wunsch einen Auftrag anlegen, eine Notiz hinzufügen oder einen Auftrag in einen neuen Status setzen. Diese Seite erklärt, wer den Connector nutzen kann, wie Sie verbinden, was jedes Tool tut, die Sicherheitsregeln und wie Sie die Verbindung trennen.",
  ctaConnect: "Schritte zur Verbindung",
  ctaTools: "Was Sie fragen können",
  heroFacts: [
    "Ihre eigene NivaDesk-Anmeldung: keine geteilten Schlüssel, keine öffentlichen Daten",
    "Ihr Plan, Ihre Rolle und Ihre Workspace-Rechte gelten für jede Antwort",
    "Jedes Tool gibt an, ob es liest, hinzufügt oder Daten ändert"
  ],
  mockLabel: "Illustration: ein Claude-Gespräch mit dem NivaDesk-Connector",
  mockCaption: "Illustration mit Beispieldaten. Kein echter Workspace.",
  mockPrompt: "Welche Aufträge sind diese Woche fällig?",
  mockTool: "NivaDesk · Aufträge suchen",
  mockReply: "Diese Woche sind drei Aufträge fällig: der gravierte Ring (Donnerstag), der gerahmte Druck (Freitag) und der Tortenaufsatz (Samstag). Der Ring ist noch in Arbeit.",
  statusTitle: "Verfügbarkeit",
  statusLabel: "Live",
  statusBody: "Der NivaDesk-Connector ist live. Fügen Sie ihn mit der Adresse unten als Custom Connector zu Claude hinzu. Ein Eintrag im Connectors Directory von Anthropic wird vorbereitet; diese Seite sagt, wenn er dort ist.",
  whoTitle: "Wer ihn nutzen kann",
  whoIntro: "„Öffentlich“ heißt, dass jeder den Connector hinzufügen kann. Es heißt nie, dass jeder Daten lesen kann: Jeder Aufruf läuft als der angemeldete NivaDesk-Nutzer und nur in dem einen Workspace, den er gewählt hat.",
  who: [
    ["Ein NivaDesk-Konto", "Sie verbinden sich mit der E-Mail-Adresse und dem Passwort (oder der Google- / Apple-Anmeldung), die Sie für NivaDesk nutzen. Ohne Konto gibt es nichts zu verbinden; ein Konto erstellen Sie auf nivadesk.app."],
    ["Jeder NivaDesk-Plan", "Der Connector funktioniert in jedem Plan. Was er zurückgeben kann, richtet sich wie in der App nach Ihrem Plan: In Free und Starter sind die Geldzahlen die Basissummen (Erhalten, Basiskosten, Basissaldo); Pro und Team ergänzen Versand, Plattformgebühren, MwSt. / Steuer und weitere Kosten. Planlimits gelten ebenfalls: Ein Auftrag, den Claude anlegt, zählt zum Limit aktiver Aufträge im Free-Plan."],
    ["Ihre Rolle im Workspace", "Inhaber, Admins und Mitglieder können lesen und ändern, was ihr Zugriff erlaubt. Nur-Ansicht-Mitglieder können lesen, aber keine Aufträge anlegen oder ändern. Workflow-Mitglieder sehen nur die ihnen zugewiesenen Aufträge und keine Geldzahlen. Hat der Inhaber für Sie Aufträge, Dashboard, Finanzinfos oder Bankausgaben abgeschaltet, wird dem Connector dasselbe verweigert."],
    ["Ein Claude-Konto, das Connectors hinzufügen darf", "Welche Claude-Pläne und -Apps Connectors hinzufügen können und wer in einer Claude-Organisation das darf, entscheiden Anthropic und Ihr Claude-Administrator, nicht NivaDesk."]
  ],
  connectTitle: "NivaDesk mit Claude verbinden",
  connectSteps: [
    ["Connectors in Claude öffnen", "Öffnen Sie in Claude Settings › Connectors."],
    ["NivaDesk finden", "Suchen Sie im Verzeichnis nach NivaDesk. Bis der Eintrag live ist, wählen Sie Add custom connector und fügen die unten angezeigte Connector-Adresse ein."],
    ["Bei NivaDesk anmelden", "Claude öffnet die Anmeldeseite von NivaDesk. Melden Sie sich mit Ihrem NivaDesk-Konto an. NivaDesk zeigt Claude Ihr Passwort nie; Claude erhält eine Zugriffsfreigabe, nicht Ihre Zugangsdaten."],
    ["Workspace wählen", "Gehören Sie zu mehreren Workspaces, wählen Sie den, den Claude nutzen darf. Jeder Aufruf ist auf diesen Workspace beschränkt; für einen anderen trennen und neu verbinden."],
    ["Fragen", "Zurück in Claude fragen Sie in normaler Sprache. Claude wählt das passende NivaDesk-Tool und zeigt Ihnen, welches es aufruft."]
  ],
  urlLabel: "Connector-Adresse",
  urlPending: "Noch nicht veröffentlicht. Die Adresse erscheint hier, sobald der Claude-Endpunkt live ist.",
  connectNotes: [
    "Sie bleiben verbunden: Claude erneuert den Zugriff im Hintergrund. Neu anmelden müssen Sie sich nur, wenn die Verbindung getrennt wurde, sich Ihr Zugriff auf den Workspace geändert hat oder sie 90 Tage ungenutzt war.",
    "Verbindungen sind unabhängig. Claude zu verbinden trennt weder ChatGPT noch Claude Code, und das Trennen einer Verbindung lässt die anderen weiterlaufen. Jede Person verbindet sich mit ihrem eigenen Konto und erhält den Zugriff ihrer eigenen Rolle."
  ],
  toolsTitle: "Was Claude mit NivaDesk tun kann",
  toolsIntro: "Der Connector hat 21 Tools. Jedes gibt an, ob es nur liest, etwas Neues hinzufügt oder bestehende Datensätze ändert oder überschreibt (als destruktiv markiert). Ob Claude vor einem Tool nachfragt, hängt von Claudes eigenen Einstellungen und Ihren Entscheidungen dort ab; die Berechtigungen von NivaDesk (Plan, Rolle, Workspace-Zugriff) werden in jedem Fall bei jedem Aufruf auf den Servern von NivaDesk durchgesetzt.",
  modeRead: "Lesen",
  modeWrite: "Schreiben",
  modeDestructive: "Destruktiv",
  examplesLabel: "Fragen Sie zum Beispiel",
  groups: [
    {
      title: "Aufträge",
      intro: "Die Aufträge Ihres Workspaces und ihr Ablauf, dazu Aufträge aus verbundenen Verkaufskanälen.",
      tools: [
        ["search_orders", "Aufträge nach Kunde, E-Mail, Artikel, Status, Auftrags-ID oder Stichwort finden."],
        ["get_order_detail", "Einen Auftrag vollständig lesen: Kunde, Artikel, Termine, Status, Zahlungen, die Ihre Rolle sehen darf, und Verlauf."],
        ["search_commerce_orders", "Aufträge aus jedem verbundenen Kanal finden, mit dem Zahlungs- und Versandstatus des Kanals neben dem NivaDesk-Status. Keine Beträge."],
        ["create_order", "Einen neuen Auftrag mit Kunde, Artikel, Beschreibung, Preis und Fälligkeitsdatum anlegen."],
        ["add_order_note", "Dem Verlauf eines Auftrags eine interne Notiz hinzufügen."],
        ["update_order_status", "Status oder Designstatus eines Auftrags ändern. Die Benachrichtigungsregeln Ihres Workspaces laufen mit, der Kunde kann also eine E-Mail erhalten."]
      ],
      examples: [
        "Welche Aufträge sind überfällig, und für wen?",
        "Lege einen Auftrag für Sam Lee an: gerahmter Druck, 85 £, heute 20 £ bezahlt, fällig am 14. November.",
        "Setze den Auftrag mit dem gravierten Ring auf Ready to Collect."
      ]
    },
    {
      title: "Persönliche Notizen",
      intro: "Ihre eigenen Notizen in NivaDesk, auch mit Ihnen geteilte Notizen, die Sie angenommen haben. Nicht die Notizen anderer, keine Auftragsnotizen.",
      tools: [
        ["search_notes", "Ihre Notizen nach Text oder Label durchsuchen; archivierte und gelöschte nur auf Wunsch."],
        ["get_note_detail", "Eine Notiz vollständig lesen."],
        ["create_note", "Eine Notiz mit Titel, Text, Labels, Links und Farbe anlegen."],
        ["append_note", "Text am Ende einer bestehenden Notiz anfügen."],
        ["update_note", "Titel, Text, Labels, Links oder Farbe einer Notiz ersetzen."],
        ["pin_note", "Eine Notiz anheften oder lösen."],
        ["archive_note", "Eine Notiz archivieren oder zurückholen. Nichts wird gelöscht."]
      ],
      examples: [
        "Finde meine Notiz zum Lieferantenbesuch und fasse sie zusammen.",
        "Füge „Nussbaum-Rohlinge nachbestellen“ zu meiner Einkaufslisten-Notiz hinzu."
      ]
    },
    {
      title: "Geld",
      intro: "Zahlen aus Ihren Aufträgen, nur wenn Ihre Rolle Finanzinfos umfasst und nur in der Tiefe Ihres Plans.",
      tools: [
        ["get_dashboard_summary", "Das Dashboard in Zahlen: aktive und fällige Aufträge und die Finanzsummen, die Sie sehen dürfen."],
        ["get_order_financials", "Die Finanzinfos eines Auftrags: Preis, bezahlt, offen und in Pro und Team Kosten und Steuer."],
        ["get_financial_overview", "Workspace-Summen: erhalten, noch offen, Kosten und geschätzter Gewinn."],
        ["get_extra_spending_overview", "Kosten für diesen Monat, dieses Jahr, insgesamt oder einen Zeitraum: Basiskosten und in Pro und Team Versand, Plattformgebühren, MwSt. / Steuer und eigene Kosten."]
      ],
      examples: [
        "Wie viel ist bei offenen Aufträgen noch zu zahlen?",
        "Was habe ich dieses Jahr für Versand und Plattformgebühren ausgegeben?"
      ]
    },
    {
      title: "Bankausgaben",
      intro: "Ihr Geschäftskonto-Feed, wenn der Workspace einen verbunden hat (eine Pro- und Team-Funktion). Lesen dürfen der Inhaber und Mitglieder mit Zugriff auf Bankausgaben.",
      tools: [
        ["get_bank_spending_summary", "Ausgaben eines Monats oder Jahres: Summen, Veränderung zum Vorzeitraum, Kategorien, wichtigste Händler und Abos."],
        ["search_bank_transactions", "Buchungen nach Händler, Datum, Kategorie, Betrag oder fehlendem Beleg auflisten."],
        ["attach_bank_receipt", "Gibt Ihnen einen einmaligen NivaDesk-Link, 15 Minuten gültig, um einen Beleg für eine Buchung hochzuladen. Die Datei wählen und laden Sie angemeldet auf der Bank-Seite von NivaDesk hoch; keine Datei läuft über Claude. Nur Inhaber."]
      ],
      examples: [
        "Wie viel habe ich im September ausgegeben, und wofür?",
        "Welche Kartenzahlungen diesen Monat haben noch keinen Beleg?"
      ]
    },
    {
      title: "Bestand",
      intro: "Ihr Bestand, wie NivaDesk ihn erfasst.",
      tools: [
        ["search_inventory", "Bestand nach Name, SKU, Seriennummer, Marke, Modell, Kategorie oder Lagerort suchen; nach Status, Mindestbestand oder Reservierung filtern."]
      ],
      examples: [
        "Was geht zur Neige?",
        "Haben wir 18-mm-Lederarmbänder in der Werkstatt?"
      ]
    }
  ],
  safetyTitle: "Berechtigungen und Sicherheit",
  safetyIntro: "Der Connector tut, was Sie mit demselben Konto selbst in NivaDesk tun könnten, und nicht mehr.",
  safety: [
    ["Dieselben Regeln wie in der App", "Jeder Aufruf wird auf den Servern von NivaDesk gegen Ihre Rolle, Ihre Zugriffsschalter und Ihren Plan geprüft, bevor etwas gelesen oder geschrieben wird. Claude sieht keinen anderen Workspace und keine persönlichen Notizen anderer Mitglieder."],
    ["Tool-Arten und Bestätigungen", "Jedes Tool gibt an, ob es nur liest, etwas Neues hinzufügt oder bestehende Daten ändert oder überschreibt (Auftragsstatus ändern, eine Notiz zu einem Auftrag hinzufügen, eine Notiz ergänzen, bearbeiten, anheften oder archivieren). Ob Claude vor einem Tool nachfragt, hängt von Claudes eigenen Einstellungen und Ihren Entscheidungen dort ab; das steuert nicht NivaDesk. Die eigenen Berechtigungen von NivaDesk — Ihr Plan, Ihre Rolle und Ihr Workspace-Zugriff — werden bei jedem Aufruf auf den Servern durchgesetzt, unabhängig von Claudes Einstellungen."],
    ["Nachrichten an Kunden", "Eine Statusänderung kann Ihrem Kunden eine E-Mail senden, wenn die Benachrichtigungen Ihres Workspaces für diesen Auftrag aktiv sind. Claude wird darauf hingewiesen; es ist dieselbe Nachricht, die auch die App senden würde."],
    ["Nichts wird gelöscht, kein Geld bewegt", "Kein Tool löscht Aufträge, Notizen, Kunden oder Bankdaten; das Archivieren einer Notiz lässt sich rückgängig machen. Der Connector kann keine Zahlungen, Erstattungen oder Überweisungen auslösen."],
    ["Grenzen", "Suchen liefern eine begrenzte Zahl an Ergebnissen; Claude liest die Daten, die Ihre Antwort braucht, keine Kopie Ihres Workspaces."]
  ],
  dataTitle: "Ihre Daten",
  data: [
    ["Was Claude erhält", "Nur die Ergebnisse der Tools, die Claude für Sie aufruft, etwa die Aufträge, die zu einer Suche passen. Diese Ergebnisse werden Teil Ihres Claude-Gesprächs und von Anthropic gemäß Ihrer Vereinbarung mit Anthropic und dessen Datenschutzerklärung verarbeitet."],
    ["Was NivaDesk erhält", "Die Tool-Aufrufe selbst: welches Tool mit welchen Angaben (etwa der Suchtext oder die Felder des neuen Auftrags). NivaDesk erhält weder Ihr Gespräch mit Claude noch Ihr Claude-Gedächtnis oder Ihre Dateien in Claude. Belege laufen nie über Claude: Sie laden sie auf der eigenen Seite von NivaDesk hoch."],
    ["Was NivaDesk speichert", "Aufträge, Notizen und Belege, die Sie über Claude anlegen, werden wie alle anderen in Ihrem Workspace gespeichert. NivaDesk protokolliert, welches Tool personenbezogene Daten gelesen hat, wer es aufrief und wann, ohne die Ergebnisse, und bewahrt technische Anfrageprotokolle zur Sicherheit für begrenzte Zeit auf."],
    ["Keine Werbung", "NivaDesk verkauft keine Daten aus dem Connector und nutzt sie nicht für Werbung. Die Datenschutzerklärung erläutert Aufbewahrung, Ihre Rechte und wie Sie uns erreichen."]
  ],
  disconnectTitle: "Verbindung trennen",
  disconnect: [
    ["In Claude", "Öffnen Sie Settings › Connectors, wählen Sie NivaDesk und trennen Sie die Verbindung. Claude ruft NivaDesk dann nicht mehr für Sie auf."],
    ["In NivaDesk (Workspace-Inhaber)", "Öffnen Sie Einstellungen › Integrationen › Claude. Dort steht jede Verbindung von Claude und Claude Code. Disconnect beendet diese eine Verbindung; Disconnect all beendet jede Claude-Verbindung zum Workspace, ChatGPT-Verbindungen bleiben unberührt. Beides wirkt sofort."]
  ],
  disconnectNote: "Das Trennen löscht nichts, was Sie über Claude angelegt haben: Diese Aufträge und Notizen bleiben in Ihrem Workspace, bis Sie sie in NivaDesk löschen.",
  disconnectLink: "Einstellungen › Integrationen öffnen",
  faqTitle: "Fragen",
  faq: [
    ["Sind meine Daten öffentlich, weil der Connector öffentlich ist?", "Nein. Jeder kann den Connector hinzufügen, aber er zeigt nichts, bis sich jemand mit seinem eigenen NivaDesk-Konto anmeldet, und dann nur, was dieses Konto im gewählten Workspace sehen darf."],
    ["Funktioniert er im Free-Plan?", "Ja. In Free und Starter liefern die Geld-Tools nur die Basissummen, und die Bank-Tools haben keine Daten, weil ein Bank-Feed eine Pro- und Team-Funktion ist."],
    ["Kann mein Team ihn nutzen?", "Ja, jede Person mit ihrer eigenen NivaDesk-Anmeldung und dem Zugriff ihrer eigenen Rolle: Ein Workflow-Mitglied sieht nur die ihm zugewiesenen Aufträge und keine Geldzahlen."],
    ["Trennt das Verbinden von Claude ChatGPT?", "Nein. Jeder Assistent hat seine eigene Verbindung. Claude zu verbinden, zu erneuern oder zu trennen berührt keine ChatGPT- oder Claude-Code-Verbindung, außer Sie wählen Disconnect all."],
    ["Kann Claude Aufträge löschen?", "Nein. Es gibt kein Lösch-Tool. Claude kann Aufträge anlegen, Notizen hinzufügen und den Status ändern; eine Statusänderung ist als destruktives Tool angegeben. Ob Claude vorher nachfragt, hängt von Ihren Claude-Einstellungen ab."],
    ["Werden meine Kunden kontaktiert?", "Nur über Ihre eigenen NivaDesk-Benachrichtigungsregeln, wenn Claude den Status eines Auftrags ändert und dieser Auftrag Benachrichtigungen aktiv hat. Auf anderem Weg sendet Claude keine Nachrichten."],
    ["Welche Sprache kann ich verwenden?", "Fragen Sie Claude in jeder Sprache, die es versteht. Die Daten aus NivaDesk kommen so zurück, wie sie in Ihrem Workspace gespeichert sind."],
    ["Etwas hat nicht geklappt", "Tool-Fehler sagen, was abgelehnt wurde und warum, etwa dass Ihre Rolle keine Aufträge ändern darf. Ist es unklar, kontaktieren Sie den Support mit Uhrzeit und Ihrer Frage."]
  ],
  contactTitle: "Support",
  contactBody: "Fragen zum Connector, ein Problem mit einer Antwort oder ein Sicherheitsanliegen: Öffnen Sie ein Ticket in NivaDesk oder schreiben Sie uns. Nennen Sie ungefähr den Zeitpunkt und was Sie Claude gefragt haben; bitte senden Sie keine Passwörter.",
  trademark: "Claude ist eine Marke von Anthropic, PBC. NivaDesk ist ein unabhängiges Produkt der EGGCRAFT LIMITED und weder mit Anthropic verbunden noch von Anthropic unterstützt."
};

const FR: ClaudeHelpCopy = {
  eyebrow: "Connecteur Claude · Guide d'installation",
  heroTitle: "NivaDesk pour Claude : interrogez vos commandes, vos notes et vos chiffres",
  heroIntro: "Le connecteur NivaDesk permet à Claude, l'assistant IA d'Anthropic, de travailler avec votre espace de travail NivaDesk. Vous vous connectez avec votre propre compte NivaDesk ; Claude peut ensuite consulter les commandes, les notes, le stock et les chiffres que votre rôle peut voir et, à votre demande, créer une commande, ajouter une note ou faire passer une commande à un nouveau statut. Cette page explique qui peut l'utiliser, comment se connecter, ce que fait chaque outil, les règles de sécurité et comment se déconnecter.",
  ctaConnect: "Étapes de connexion",
  ctaTools: "Ce que vous pouvez demander",
  heroFacts: [
    "Votre propre connexion NivaDesk : pas de clé partagée, pas de données publiques",
    "Votre forfait, votre rôle et vos droits s'appliquent à chaque réponse",
    "Chaque outil indique s'il lit, ajoute ou modifie des données"
  ],
  mockLabel: "Illustration : une conversation Claude utilisant le connecteur NivaDesk",
  mockCaption: "Illustration avec des données d'exemple. Pas un véritable espace de travail.",
  mockPrompt: "Quelles commandes sont à livrer cette semaine ?",
  mockTool: "NivaDesk · Rechercher des commandes",
  mockReply: "Trois commandes sont dues cette semaine : la bague gravée (jeudi), le tirage encadré (vendredi) et la décoration de gâteau (samedi). La bague est encore en cours.",
  statusTitle: "Disponibilité",
  statusLabel: "En ligne",
  statusBody: "Le connecteur NivaDesk est en ligne. Ajoutez-le à Claude comme connecteur personnalisé (custom connector) avec l'adresse ci-dessous. Une fiche dans le Connectors Directory d'Anthropic est en préparation ; cette page l'indiquera quand elle y sera.",
  whoTitle: "Qui peut l'utiliser",
  whoIntro: "« Public » signifie que tout le monde peut ajouter le connecteur. Cela ne signifie jamais que tout le monde peut lire des données : chaque appel s'exécute au nom de l'utilisateur NivaDesk connecté, dans le seul espace de travail qu'il a choisi.",
  who: [
    ["Un compte NivaDesk", "Vous vous connectez avec l'e-mail et le mot de passe (ou la connexion Google / Apple) que vous utilisez pour NivaDesk. Sans compte, il n'y a rien à connecter ; vous pouvez en créer un sur nivadesk.app."],
    ["Tous les forfaits NivaDesk", "Le connecteur fonctionne avec tous les forfaits. Ce qu'il peut renvoyer suit votre forfait, comme dans l'application : en Free et Starter, les montants sont les totaux de base (Reçu, Coût de base, Solde de base) ; Pro et Team ajoutent l'expédition, les frais de plateforme, la TVA / taxe et les autres coûts. Les limites du forfait s'appliquent aussi : une commande créée par Claude compte dans la limite de commandes actives du forfait Free."],
    ["Votre rôle dans l'espace de travail", "Propriétaires, administrateurs et membres peuvent lire et modifier ce que leur accès autorise. Les membres en lecture seule peuvent lire mais ne peuvent ni créer ni modifier de commandes. Les membres flux de travail ne voient que les commandes qui leur sont attribuées, sans aucun montant. Si le propriétaire a désactivé pour vous Commandes, Tableau de bord, Infos financières ou Dépenses bancaires, le connecteur se voit refuser la même chose."],
    ["Un compte Claude qui peut ajouter des connecteurs", "Les forfaits et applications Claude qui peuvent ajouter des connecteurs, et qui peut les ajouter dans une organisation Claude, sont décidés par Anthropic et votre administrateur Claude, pas par NivaDesk."]
  ],
  connectTitle: "Connecter NivaDesk à Claude",
  connectSteps: [
    ["Ouvrez Connectors dans Claude", "Dans Claude, ouvrez Settings › Connectors."],
    ["Trouvez NivaDesk", "Cherchez NivaDesk dans l'annuaire. Tant que la fiche n'est pas en ligne, choisissez Add custom connector et collez l'adresse du connecteur indiquée ci-dessous."],
    ["Connectez-vous à NivaDesk", "Claude ouvre la page de connexion de NivaDesk. Connectez-vous avec votre compte NivaDesk. NivaDesk ne montre jamais votre mot de passe à Claude ; Claude reçoit une autorisation d'accès, pas vos identifiants."],
    ["Choisissez l'espace de travail", "Si vous appartenez à plusieurs espaces de travail, choisissez celui que Claude peut utiliser. Chaque appel est limité à cet espace ; pour en utiliser un autre, déconnectez-vous puis reconnectez-vous."],
    ["Demandez", "De retour dans Claude, posez votre question simplement. Claude choisit l'outil NivaDesk nécessaire et vous montre lequel il appelle."]
  ],
  urlLabel: "Adresse du connecteur",
  urlPending: "Pas encore publiée. L'adresse apparaîtra ici quand le point d'accès Claude sera en ligne.",
  connectNotes: [
    "Vous restez connecté : Claude renouvelle son accès en arrière-plan. Vous ne vous reconnectez que si la connexion a été coupée, si votre accès à l'espace a changé ou si elle n'a pas servi pendant 90 jours.",
    "Les connexions sont indépendantes. Connecter Claude ne déconnecte ni ChatGPT ni Claude Code, et en déconnecter une laisse les autres fonctionner. Chacun se connecte avec son propre compte et obtient l'accès de son propre rôle."
  ],
  toolsTitle: "Ce que Claude peut faire avec NivaDesk",
  toolsIntro: "Le connecteur compte 21 outils. Chacun indique s'il lit seulement, s'il ajoute quelque chose de nouveau ou s'il modifie ou écrase des enregistrements existants (marqué destructif). Que Claude vous demande ou non avant de lancer un outil dépend des réglages de Claude et de vos choix ; les autorisations de NivaDesk (forfait, rôle, accès à l'espace) sont appliquées sur ses serveurs à chaque appel dans tous les cas.",
  modeRead: "Lecture",
  modeWrite: "Écriture",
  modeDestructive: "Destructif",
  examplesLabel: "Essayez de demander",
  groups: [
    {
      title: "Commandes",
      intro: "Les commandes de votre espace et leur flux de travail, ainsi que les commandes arrivées des canaux de vente connectés.",
      tools: [
        ["search_orders", "Trouver des commandes par client, e-mail, article, statut, identifiant ou mot-clé."],
        ["get_order_detail", "Lire une commande en entier : client, article, dates, statut, paiements que votre rôle peut voir et historique."],
        ["search_commerce_orders", "Trouver des commandes de tout canal connecté, avec le statut de paiement et d'expédition du canal à côté du statut NivaDesk. Aucun montant."],
        ["create_order", "Créer une commande avec le client, l'article, la description, le prix et la date d'échéance que vous donnez."],
        ["add_order_note", "Ajouter une note interne à l'historique d'une commande."],
        ["update_order_status", "Changer le statut ou le statut de design d'une commande. Les règles de notification de votre espace s'appliquent, le client peut donc recevoir un e-mail."]
      ],
      examples: [
        "Quelles commandes sont en retard, et pour qui ?",
        "Crée une commande pour Sam Lee : un tirage encadré, 85 £, 20 £ payés aujourd'hui, à livrer le 14 novembre.",
        "Passe la commande de la bague gravée en Ready to Collect."
      ]
    },
    {
      title: "Notes personnelles",
      intro: "Vos propres Notes dans NivaDesk, y compris les notes partagées avec vous que vous avez acceptées. Pas les notes des autres, ni les notes de commande.",
      tools: [
        ["search_notes", "Rechercher vos notes par texte ou étiquette ; archivées et supprimées seulement si vous le demandez."],
        ["get_note_detail", "Lire une note en entier."],
        ["create_note", "Créer une note avec titre, texte, étiquettes, liens et couleur."],
        ["append_note", "Ajouter du texte à la fin d'une note existante."],
        ["update_note", "Remplacer le titre, le texte, les étiquettes, les liens ou la couleur d'une note."],
        ["pin_note", "Épingler ou désépingler une note."],
        ["archive_note", "Archiver ou désarchiver une note. Rien n'est supprimé."]
      ],
      examples: [
        "Trouve ma note sur la visite du fournisseur et résume-la.",
        "Ajoute « commander des ébauches en noyer » à ma note de liste d'achats."
      ]
    },
    {
      title: "Argent",
      intro: "Des chiffres issus de vos commandes, seulement si votre rôle inclut les infos financières et au niveau de détail de votre forfait.",
      tools: [
        ["get_dashboard_summary", "Le tableau de bord en chiffres : commandes actives et à échéance, et les totaux financiers que vous pouvez voir."],
        ["get_order_financials", "Les infos financières d'une commande : prix, payé, restant et, en Pro et Team, coûts et taxes."],
        ["get_financial_overview", "Totaux de l'espace : reçu, reste à payer, coûts et bénéfice estimé."],
        ["get_extra_spending_overview", "Les coûts du mois, de l'année, depuis le début ou sur une période : coût de base et, en Pro et Team, expédition, frais de plateforme, TVA / taxe et coûts personnalisés."]
      ],
      examples: [
        "Combien reste-t-il à payer sur les commandes ouvertes ?",
        "Combien ai-je dépensé en expédition et en frais de plateforme cette année ?"
      ]
    },
    {
      title: "Dépenses bancaires",
      intro: "Le flux de votre compte professionnel, si l'espace en a un connecté (fonction Pro et Team). Le propriétaire et les membres ayant l'accès Dépenses bancaires peuvent le lire.",
      tools: [
        ["get_bank_spending_summary", "Les dépenses d'un mois ou d'une année : totaux, évolution par rapport à la période précédente, catégories, principaux marchands et abonnements."],
        ["search_bank_transactions", "Lister les transactions par marchand, date, catégorie, montant ou justificatif manquant."],
        ["attach_bank_receipt", "Vous donne un lien NivaDesk à usage unique, valable 15 minutes, pour téléverser le justificatif d'une transaction. Vous choisissez et téléversez le fichier sur la page Banque de NivaDesk, connecté ; aucun fichier ne passe par Claude. Propriétaire uniquement."]
      ],
      examples: [
        "Combien ai-je dépensé en septembre, et pour quoi ?",
        "Quels paiements par carte de ce mois n'ont pas encore de justificatif ?"
      ]
    },
    {
      title: "Stock",
      intro: "Votre stock tel que NivaDesk l'enregistre.",
      tools: [
        ["search_inventory", "Chercher dans le stock par nom, SKU, numéro de série, marque, modèle, catégorie ou emplacement ; filtrer par statut, stock bas ou réservé."]
      ],
      examples: [
        "Qu'est-ce qui commence à manquer ?",
        "Avons-nous des bracelets en cuir de 18 mm à l'atelier ?"
      ]
    }
  ],
  safetyTitle: "Autorisations et sécurité",
  safetyIntro: "Le connecteur fait ce que vous pourriez faire vous-même dans NivaDesk avec le même compte, et rien de plus.",
  safety: [
    ["Les mêmes règles que l'application", "Chaque appel est vérifié sur les serveurs de NivaDesk selon votre rôle, vos accès et votre forfait avant toute lecture ou écriture. Claude ne voit ni un autre espace de travail ni les notes personnelles d'un autre membre."],
    ["Types d'outils et confirmations", "Chaque outil indique s'il lit seulement, s'il ajoute quelque chose de nouveau ou s'il modifie ou écrase des données existantes (changer le statut d'une commande, ajouter une note à une commande, compléter, modifier, épingler ou archiver une note). Que Claude demande ou non avant de lancer un outil dépend des réglages de Claude et de vos choix ; NivaDesk ne le contrôle pas. Les autorisations propres à NivaDesk — votre forfait, votre rôle et votre accès à l'espace — sont appliquées sur ses serveurs à chaque appel, quels que soient les réglages de Claude."],
    ["Messages aux clients", "Changer le statut d'une commande peut envoyer un e-mail à votre client si les notifications de votre espace sont activées pour cette commande. Claude en est informé ; c'est le même message que l'application enverrait."],
    ["Rien n'est supprimé, aucun argent ne circule", "Aucun outil ne supprime de commandes, de notes, de clients ou de données bancaires ; l'archivage d'une note est réversible. Le connecteur ne peut faire ni paiement, ni remboursement, ni virement."],
    ["Limites", "Les recherches renvoient un nombre limité de résultats ; Claude lit les données dont votre réponse a besoin, pas une copie de votre espace."]
  ],
  dataTitle: "Vos données",
  data: [
    ["Ce que reçoit Claude", "Uniquement les résultats des outils que Claude appelle pour vous, par exemple les commandes correspondant à une recherche. Ces résultats font partie de votre conversation Claude et sont traités par Anthropic selon votre accord avec Anthropic et sa politique de confidentialité."],
    ["Ce que reçoit NivaDesk", "Les appels d'outils eux-mêmes : quel outil, avec quels détails (par exemple le texte recherché ou les champs de la nouvelle commande). NivaDesk ne reçoit ni votre conversation avec Claude, ni votre mémoire Claude, ni vos fichiers dans Claude. Les justificatifs ne passent jamais par Claude : vous les téléversez sur la page de NivaDesk."],
    ["Ce que conserve NivaDesk", "Les commandes, notes et justificatifs créés via Claude sont enregistrés dans votre espace comme les autres. NivaDesk enregistre quel outil a lu des données personnelles, qui l'a appelé et quand, sans les résultats, et conserve des journaux techniques de requêtes pendant une durée limitée pour la sécurité."],
    ["Pas de publicité", "NivaDesk ne vend pas les données du connecteur et ne les utilise pas pour la publicité. La Politique de confidentialité explique la conservation, vos droits et comment nous contacter."]
  ],
  disconnectTitle: "Déconnexion",
  disconnect: [
    ["Dans Claude", "Ouvrez Settings › Connectors, choisissez NivaDesk et déconnectez-le. Claude cesse d'appeler NivaDesk pour vous."],
    ["Dans NivaDesk (propriétaire de l'espace)", "Ouvrez Paramètres › Intégrations › Claude. Chaque connexion Claude et Claude Code y est listée. Disconnect met fin à cette connexion ; Disconnect all met fin à toutes les connexions Claude à l'espace de travail, sans toucher aux connexions ChatGPT. Les deux prennent effet immédiatement."]
  ],
  disconnectNote: "La déconnexion ne supprime rien de ce que vous avez créé via Claude : ces commandes et notes restent dans votre espace jusqu'à ce que vous les supprimiez dans NivaDesk.",
  disconnectLink: "Ouvrir Paramètres › Intégrations",
  faqTitle: "Questions",
  faq: [
    ["Mes données sont-elles publiques parce que le connecteur l'est ?", "Non. Tout le monde peut ajouter le connecteur, mais il n'affiche rien tant que quelqu'un ne s'est pas connecté avec son propre compte NivaDesk, et ensuite seulement ce que ce compte peut voir dans l'espace choisi."],
    ["Fonctionne-t-il avec le forfait Free ?", "Oui. En Free et Starter, les outils financiers ne renvoient que les totaux de base, et les outils bancaires n'ont pas de données car le flux bancaire est une fonction Pro et Team."],
    ["Mon équipe peut-elle l'utiliser ?", "Oui, chacun avec sa propre connexion NivaDesk et l'accès de son propre rôle : un membre flux de travail ne voit que ses commandes attribuées, sans montants."],
    ["Connecter Claude déconnecte-t-il ChatGPT ?", "Non. Chaque assistant a sa propre connexion. Connecter, renouveler ou déconnecter Claude ne touche pas une connexion ChatGPT ou Claude Code, sauf si vous choisissez Disconnect all."],
    ["Claude peut-il supprimer des commandes ?", "Non. Il n'existe pas d'outil de suppression. Claude peut créer des commandes, ajouter des notes et changer un statut ; un changement de statut est déclaré comme outil destructif. Que Claude demande ou non avant de le lancer dépend de vos réglages Claude."],
    ["Mes clients seront-ils contactés ?", "Seulement via vos propres règles de notification NivaDesk, quand Claude change le statut d'une commande dont les notifications sont activées. Claude n'envoie de message par aucun autre moyen."],
    ["Quelle langue puis-je utiliser ?", "Demandez à Claude dans n'importe quelle langue qu'il comprend. Les données NivaDesk reviennent telles qu'elles sont enregistrées dans votre espace."],
    ["Quelque chose n'a pas marché", "Les erreurs d'outil disent ce qui a été refusé et pourquoi, par exemple que votre rôle ne peut pas modifier les commandes. Si ce n'est pas clair, contactez le support avec l'heure et votre question."]
  ],
  contactTitle: "Assistance",
  contactBody: "Une question sur le connecteur, un problème avec une réponse ou un souci de sécurité : ouvrez un ticket depuis NivaDesk ou écrivez-nous. Indiquez à peu près quand cela s'est produit et ce que vous avez demandé à Claude ; n'envoyez pas de mot de passe.",
  trademark: "Claude est une marque d'Anthropic, PBC. NivaDesk est un produit indépendant d'EGGCRAFT LIMITED ; il n'est ni affilié à Anthropic ni approuvé par Anthropic."
};

const IT: ClaudeHelpCopy = {
  eyebrow: "Connettore Claude · Guida all'installazione",
  heroTitle: "NivaDesk per Claude: chiedi di ordini, note e numeri",
  heroIntro: "Il connettore NivaDesk permette a Claude, l'assistente IA di Anthropic, di lavorare con il tuo spazio di lavoro NivaDesk. Accedi con il tuo account NivaDesk; poi Claude può consultare ordini, note, magazzino e i numeri che il tuo ruolo può vedere e, quando lo chiedi, creare un ordine, aggiungere una nota o portare un ordine a un nuovo stato. Questa pagina spiega chi può usarlo, come collegarlo, cosa fa ogni strumento, le regole di sicurezza e come scollegarlo.",
  ctaConnect: "Passaggi di collegamento",
  ctaTools: "Cosa puoi chiedere",
  heroFacts: [
    "Il tuo accesso NivaDesk: nessuna chiave condivisa, nessun dato pubblico",
    "Piano, ruolo e permessi dello spazio valgono per ogni risposta",
    "Ogni strumento dichiara se legge, aggiunge o modifica dati"
  ],
  mockLabel: "Illustrazione: una conversazione Claude che usa il connettore NivaDesk",
  mockCaption: "Illustrazione con dati di esempio. Non è uno spazio di lavoro reale.",
  mockPrompt: "Quali ordini scadono questa settimana?",
  mockTool: "NivaDesk · Cerca ordini",
  mockReply: "Questa settimana scadono tre ordini: l'anello inciso (giovedì), la stampa incorniciata (venerdì) e il cake topper (sabato). L'anello è ancora in lavorazione.",
  statusTitle: "Disponibilità",
  statusLabel: "Online",
  statusBody: "Il connettore NivaDesk è online. Aggiungilo a Claude come connettore personalizzato (custom connector) con l'indirizzo qui sotto. Una scheda nel Connectors Directory di Anthropic è in preparazione; questa pagina lo dirà quando sarà lì.",
  whoTitle: "Chi può usarlo",
  whoIntro: "\"Pubblico\" significa che chiunque può aggiungere il connettore. Non significa mai che chiunque possa leggere dati: ogni chiamata viene eseguita come l'utente NivaDesk che ha effettuato l'accesso, nell'unico spazio di lavoro che ha scelto.",
  who: [
    ["Un account NivaDesk", "Ti colleghi con l'e-mail e la password (o l'accesso Google / Apple) che usi per NivaDesk. Senza account non c'è nulla da collegare; puoi crearne uno su nivadesk.app."],
    ["Qualsiasi piano NivaDesk", "Il connettore funziona con tutti i piani. Ciò che può restituire segue il tuo piano, come nell'app: con Free e Starter gli importi sono i totali di base (Incassato, Costo base, Saldo base); Pro e Team aggiungono spedizione, commissioni della piattaforma, IVA / imposte e altri costi. Valgono anche i limiti del piano: un ordine creato da Claude conta nel limite di ordini attivi del piano Free."],
    ["Il tuo ruolo nello spazio di lavoro", "Proprietari, amministratori e membri possono leggere e modificare ciò che il loro accesso consente. I membri in sola visualizzazione possono leggere ma non creare o modificare ordini. I membri solo flusso di lavoro vedono solo gli ordini assegnati a loro e nessun importo. Se il proprietario ha disattivato per te Ordini, Dashboard, Informazioni finanziarie o Spese bancarie, al connettore viene negata la stessa cosa."],
    ["Un account Claude che può aggiungere connettori", "Quali piani e app di Claude possono aggiungere connettori, e chi può farlo in un'organizzazione Claude, lo decidono Anthropic e il tuo amministratore Claude, non NivaDesk."]
  ],
  connectTitle: "Collega NivaDesk a Claude",
  connectSteps: [
    ["Apri Connectors in Claude", "In Claude apri Settings › Connectors."],
    ["Trova NivaDesk", "Cerca NivaDesk nella directory. Finché la scheda non è online, scegli Add custom connector e incolla l'indirizzo del connettore indicato sotto."],
    ["Accedi a NivaDesk", "Claude apre la pagina di accesso di NivaDesk. Accedi con il tuo account NivaDesk. NivaDesk non mostra mai la tua password a Claude; Claude riceve un'autorizzazione di accesso, non le tue credenziali."],
    ["Scegli lo spazio di lavoro", "Se appartieni a più spazi di lavoro, scegli quello che Claude può usare. Ogni chiamata è limitata a quello spazio; per usarne un altro, scollega e ricollega."],
    ["Chiedi", "Tornato in Claude, chiedi con parole tue. Claude sceglie lo strumento NivaDesk che serve e ti mostra quale sta chiamando."]
  ],
  urlLabel: "Indirizzo del connettore",
  urlPending: "Non ancora pubblicato. L'indirizzo comparirà qui quando l'endpoint per Claude sarà online.",
  connectNotes: [
    "Resti collegato: Claude rinnova l'accesso in background. Accedi di nuovo solo se il collegamento è stato interrotto, se il tuo accesso allo spazio è cambiato o se è rimasto inutilizzato per 90 giorni.",
    "I collegamenti sono indipendenti. Collegare Claude non scollega ChatGPT né Claude Code, e scollegarne uno lascia funzionare gli altri. Ognuno si collega con il proprio account e ottiene l'accesso del proprio ruolo."
  ],
  toolsTitle: "Cosa può fare Claude con NivaDesk",
  toolsIntro: "Il connettore ha 21 strumenti. Ognuno dichiara se legge soltanto, se aggiunge qualcosa di nuovo o se modifica o sovrascrive dati esistenti (segnato come distruttivo). Se Claude ti chiede conferma prima di usare uno strumento dipende dalle impostazioni di Claude e dalle tue scelte; i permessi di NivaDesk (piano, ruolo, accesso allo spazio) vengono comunque applicati sui suoi server a ogni chiamata.",
  modeRead: "Lettura",
  modeWrite: "Scrittura",
  modeDestructive: "Distruttivo",
  examplesLabel: "Prova a chiedere",
  groups: [
    {
      title: "Ordini",
      intro: "Gli ordini del tuo spazio e il loro flusso, più gli ordini arrivati dai canali di vendita collegati.",
      tools: [
        ["search_orders", "Trova ordini per cliente, e-mail, articolo, stato, ID ordine o parola chiave."],
        ["get_order_detail", "Leggi un ordine per intero: cliente, articolo, date, stato, pagamenti che il tuo ruolo può vedere e cronologia."],
        ["search_commerce_orders", "Trova ordini da qualsiasi canale collegato, con lo stato di pagamento e di evasione del canale accanto allo stato NivaDesk. Nessun importo."],
        ["create_order", "Crea un nuovo ordine con cliente, articolo, descrizione, prezzo e scadenza che indichi."],
        ["add_order_note", "Aggiungi una nota interna alla cronologia di un ordine."],
        ["update_order_status", "Cambia lo stato o lo stato del design di un ordine. Le regole di notifica del tuo spazio si applicano, quindi il cliente può ricevere un'e-mail."]
      ],
      examples: [
        "Quali ordini sono in ritardo, e per chi?",
        "Crea un ordine per Sam Lee: una stampa incorniciata, 85 £, 20 £ pagate oggi, consegna il 14 novembre.",
        "Porta l'ordine dell'anello inciso a Ready to Collect."
      ]
    },
    {
      title: "Note personali",
      intro: "Le tue Note in NivaDesk, comprese quelle condivise con te che hai accettato. Non le note degli altri, né le note degli ordini.",
      tools: [
        ["search_notes", "Cerca le tue note per testo o etichetta; archiviate ed eliminate solo se lo chiedi."],
        ["get_note_detail", "Leggi una nota per intero."],
        ["create_note", "Crea una nota con titolo, testo, etichette, link e colore."],
        ["append_note", "Aggiungi testo alla fine di una nota esistente."],
        ["update_note", "Sostituisci titolo, testo, etichette, link o colore di una nota."],
        ["pin_note", "Fissa o sblocca una nota."],
        ["archive_note", "Archivia o ripristina una nota. Non viene eliminato nulla."]
      ],
      examples: [
        "Trova la mia nota sulla visita al fornitore e riassumila.",
        "Aggiungi \"ordinare grezzi di noce\" alla mia nota della lista acquisti."
      ]
    },
    {
      title: "Soldi",
      intro: "Numeri dai tuoi ordini, solo se il tuo ruolo include le informazioni finanziarie e solo al livello del tuo piano.",
      tools: [
        ["get_dashboard_summary", "La dashboard in numeri: ordini attivi e in scadenza e i totali finanziari che puoi vedere."],
        ["get_order_financials", "Le informazioni finanziarie di un ordine: prezzo, pagato, residuo e, con Pro e Team, costi e imposte."],
        ["get_financial_overview", "Totali dello spazio: incassato, ancora da pagare, costi e profitto stimato."],
        ["get_extra_spending_overview", "Costi di questo mese, di quest'anno, di sempre o di un periodo: costo base e, con Pro e Team, spedizione, commissioni, IVA / imposte e costi personalizzati."]
      ],
      examples: [
        "Quanto resta da pagare sugli ordini aperti?",
        "Quanto ho speso quest'anno in spedizioni e commissioni della piattaforma?"
      ]
    },
    {
      title: "Spese bancarie",
      intro: "Il feed del tuo conto aziendale, se lo spazio ne ha uno collegato (funzione Pro e Team). Possono leggerlo il proprietario e i membri con accesso a Spese bancarie.",
      tools: [
        ["get_bank_spending_summary", "Spese di un mese o di un anno: totali, variazione sul periodo precedente, categorie, principali esercenti e abbonamenti."],
        ["search_bank_transactions", "Elenca movimenti per esercente, data, categoria, importo o ricevuta mancante."],
        ["attach_bank_receipt", "Ti dà un link NivaDesk monouso, valido 15 minuti, per caricare la ricevuta di un movimento. Scegli e carichi il file nella pagina Banca di NivaDesk dopo l'accesso; nessun file passa per Claude. Solo proprietario."]
      ],
      examples: [
        "Quanto ho speso a settembre, e per cosa?",
        "Quali pagamenti con carta di questo mese non hanno ancora la ricevuta?"
      ]
    },
    {
      title: "Magazzino",
      intro: "Il tuo magazzino come lo registra NivaDesk.",
      tools: [
        ["search_inventory", "Cerca nel magazzino per nome, SKU, numero di serie, marca, modello, categoria o posizione; filtra per stato, scorta bassa o riservato."]
      ],
      examples: [
        "Cosa sta per finire?",
        "Abbiamo cinturini in pelle da 18 mm in laboratorio?"
      ]
    }
  ],
  safetyTitle: "Permessi e sicurezza",
  safetyIntro: "Il connettore fa ciò che potresti fare tu in NivaDesk con lo stesso account, e niente di più.",
  safety: [
    ["Le stesse regole dell'app", "Ogni chiamata viene verificata sui server di NivaDesk in base a ruolo, accessi e piano prima di leggere o scrivere qualsiasi cosa. Claude non vede altri spazi di lavoro né le note personali di altri membri."],
    ["Tipi di strumento e conferme", "Ogni strumento dichiara se legge soltanto, se aggiunge qualcosa di nuovo o se modifica o sovrascrive dati esistenti (cambiare lo stato di un ordine, aggiungere una nota a un ordine, aggiungere testo a una nota, modificarla, fissarla o archiviarla). Se Claude chiede conferma prima di usare uno strumento dipende dalle impostazioni di Claude e dalle tue scelte; NivaDesk non lo controlla. I permessi di NivaDesk — il tuo piano, il tuo ruolo e il tuo accesso allo spazio — vengono applicati sui suoi server a ogni chiamata, qualunque siano le impostazioni di Claude."],
    ["Messaggi ai clienti", "Cambiare lo stato di un ordine può inviare un'e-mail al cliente se le notifiche del tuo spazio sono attive per quell'ordine. Claude ne è informato; è lo stesso messaggio che invierebbe l'app."],
    ["Nulla viene eliminato, nessun denaro si muove", "Nessuno strumento elimina ordini, note, clienti o dati bancari; archiviare una nota si può annullare. Il connettore non può fare pagamenti, rimborsi o bonifici."],
    ["Limiti", "Le ricerche restituiscono un numero limitato di risultati; Claude legge i dati che servono alla risposta, non una copia del tuo spazio."]
  ],
  dataTitle: "I tuoi dati",
  data: [
    ["Cosa riceve Claude", "Solo i risultati degli strumenti che Claude chiama per te, per esempio gli ordini che corrispondono a una ricerca. Questi risultati entrano nella tua conversazione con Claude e sono trattati da Anthropic secondo il tuo accordo con Anthropic e la sua informativa sulla privacy."],
    ["Cosa riceve NivaDesk", "Le chiamate agli strumenti: quale strumento e con quali dettagli (per esempio il testo cercato o i campi del nuovo ordine). NivaDesk non riceve la tua conversazione con Claude, la memoria di Claude o i tuoi file in Claude. Le ricevute non passano mai per Claude: le carichi sulla pagina di NivaDesk."],
    ["Cosa conserva NivaDesk", "Ordini, note e ricevute creati tramite Claude vengono salvati nel tuo spazio come tutti gli altri. NivaDesk registra quale strumento ha letto dati personali, chi l'ha chiamato e quando, senza i risultati, e conserva per un periodo limitato i registri tecnici delle richieste per la sicurezza."],
    ["Nessuna pubblicità", "NivaDesk non vende i dati del connettore e non li usa per pubblicità. L'Informativa sulla privacy spiega conservazione, diritti e come contattarci."]
  ],
  disconnectTitle: "Scollegare",
  disconnect: [
    ["In Claude", "Apri Settings › Connectors, scegli NivaDesk e scollegalo. Claude smette di chiamare NivaDesk per te."],
    ["In NivaDesk (proprietario dello spazio)", "Apri Impostazioni › Integrazioni › Claude. Lì è elencato ogni collegamento Claude e Claude Code. Disconnect termina quel collegamento; Disconnect all termina ogni collegamento Claude allo spazio di lavoro, senza toccare i collegamenti ChatGPT. Entrambi hanno effetto immediato."]
  ],
  disconnectNote: "Scollegare non elimina nulla di ciò che hai creato tramite Claude: quegli ordini e quelle note restano nel tuo spazio finché non li elimini in NivaDesk.",
  disconnectLink: "Apri Impostazioni › Integrazioni",
  faqTitle: "Domande",
  faq: [
    ["I miei dati sono pubblici perché il connettore è pubblico?", "No. Chiunque può aggiungere il connettore, ma non mostra nulla finché qualcuno non accede con il proprio account NivaDesk, e poi solo ciò che quell'account può vedere nello spazio scelto."],
    ["Funziona con il piano Free?", "Sì. Con Free e Starter gli strumenti finanziari restituiscono solo i totali di base, e gli strumenti bancari non hanno dati perché il feed bancario è una funzione Pro e Team."],
    ["Il mio team può usarlo?", "Sì, ognuno con il proprio accesso NivaDesk e l'accesso del proprio ruolo: un membro solo flusso di lavoro vede solo gli ordini assegnati e nessun importo."],
    ["Collegare Claude scollega ChatGPT?", "No. Ogni assistente ha il proprio collegamento. Collegare, rinnovare o scollegare Claude non tocca un collegamento ChatGPT o Claude Code, a meno che tu non scelga Disconnect all."],
    ["Claude può eliminare ordini?", "No. Non esiste uno strumento di eliminazione. Claude può creare ordini, aggiungere note e cambiare stato; il cambio di stato è dichiarato come strumento distruttivo. Se Claude chiede conferma prima di usarlo dipende dalle tue impostazioni di Claude."],
    ["I miei clienti verranno contattati?", "Solo tramite le tue regole di notifica NivaDesk, quando Claude cambia lo stato di un ordine con le notifiche attive. Claude non invia messaggi in nessun altro modo."],
    ["Che lingua posso usare?", "Chiedi a Claude in qualsiasi lingua che capisce. I dati NivaDesk tornano così come sono salvati nel tuo spazio."],
    ["Qualcosa non ha funzionato", "Gli errori degli strumenti dicono cosa è stato rifiutato e perché, per esempio che il tuo ruolo non può modificare gli ordini. Se non è chiaro, contatta l'assistenza indicando l'ora e cosa hai chiesto."]
  ],
  contactTitle: "Assistenza",
  contactBody: "Domande sul connettore, un problema con una risposta o un dubbio di sicurezza: apri un ticket da NivaDesk o scrivici. Indica più o meno quando è successo e cosa hai chiesto a Claude; non inviare password.",
  trademark: "Claude è un marchio di Anthropic, PBC. NivaDesk è un prodotto indipendente di EGGCRAFT LIMITED e non è affiliato né approvato da Anthropic."
};

const ES: ClaudeHelpCopy = {
  eyebrow: "Conector de Claude · Guía de configuración",
  heroTitle: "NivaDesk para Claude: pregunta por tus pedidos, notas y cifras",
  heroIntro: "El conector de NivaDesk permite que Claude, el asistente de IA de Anthropic, trabaje con tu espacio de trabajo de NivaDesk. Inicias sesión con tu propia cuenta de NivaDesk; después Claude puede consultar pedidos, notas, inventario y las cifras que tu rol puede ver y, cuando se lo pidas, crear un pedido, añadir una nota o pasar un pedido a un nuevo estado. Esta página explica quién puede usarlo, cómo conectarlo, qué hace cada herramienta, las reglas de seguridad y cómo desconectarlo.",
  ctaConnect: "Pasos para conectar",
  ctaTools: "Qué puedes preguntar",
  heroFacts: [
    "Tu propio inicio de sesión de NivaDesk: sin claves compartidas ni datos públicos",
    "Tu plan, tu rol y tus permisos se aplican a cada respuesta",
    "Cada herramienta declara si lee, añade o cambia datos"
  ],
  mockLabel: "Ilustración: una conversación de Claude con el conector de NivaDesk",
  mockCaption: "Ilustración con datos de ejemplo. No es un espacio de trabajo real.",
  mockPrompt: "¿Qué pedidos vencen esta semana?",
  mockTool: "NivaDesk · Buscar pedidos",
  mockReply: "Esta semana vencen tres pedidos: el anillo grabado (jueves), la lámina enmarcada (viernes) y el adorno de tarta (sábado). El anillo sigue en curso.",
  statusTitle: "Disponibilidad",
  statusLabel: "Disponible",
  statusBody: "El conector de NivaDesk está disponible. Añádelo a Claude como conector personalizado (custom connector) con la dirección de abajo. Se está preparando una ficha en el Connectors Directory de Anthropic; esta página lo indicará cuando esté allí.",
  whoTitle: "Quién puede usarlo",
  whoIntro: "\"Público\" significa que cualquiera puede añadir el conector. Nunca significa que cualquiera pueda leer datos: cada llamada se ejecuta como el usuario de NivaDesk que inició sesión, dentro del único espacio de trabajo que eligió.",
  who: [
    ["Una cuenta de NivaDesk", "Te conectas con el correo y la contraseña (o el inicio de sesión con Google / Apple) que usas en NivaDesk. Sin cuenta no hay nada que conectar; puedes crear una en nivadesk.app."],
    ["Cualquier plan de NivaDesk", "El conector funciona en todos los planes. Lo que puede devolver depende de tu plan, como en la app: en Free y Starter las cifras de dinero son los totales básicos (Recibido, Coste base, Saldo básico); Pro y Team añaden envío, comisiones de plataforma, IVA / impuestos y otros costes. Los límites del plan también se aplican: un pedido que cree Claude cuenta para el límite de pedidos activos del plan Free."],
    ["Tu rol en el espacio de trabajo", "Propietarios, administradores y miembros pueden leer y cambiar lo que su acceso permite. Los miembros de solo lectura pueden leer pero no crear ni cambiar pedidos. Los miembros de solo flujo de trabajo ven solo los pedidos que tienen asignados y ninguna cifra de dinero. Si el propietario te ha desactivado Pedidos, Panel, Información financiera o Gastos bancarios, al conector se le niega lo mismo."],
    ["Una cuenta de Claude que pueda añadir conectores", "Qué planes y apps de Claude pueden añadir conectores, y quién puede hacerlo en una organización de Claude, lo deciden Anthropic y tu administrador de Claude, no NivaDesk."]
  ],
  connectTitle: "Conecta NivaDesk a Claude",
  connectSteps: [
    ["Abre Connectors en Claude", "En Claude, abre Settings › Connectors."],
    ["Busca NivaDesk", "Busca NivaDesk en el directorio. Hasta que la ficha esté publicada, elige Add custom connector y pega la dirección del conector que aparece abajo."],
    ["Inicia sesión en NivaDesk", "Claude abre la página de inicio de sesión de NivaDesk. Entra con tu cuenta de NivaDesk. NivaDesk nunca muestra tu contraseña a Claude; Claude recibe un permiso de acceso, no tus credenciales."],
    ["Elige el espacio de trabajo", "Si perteneces a varios espacios de trabajo, elige el que Claude puede usar. Cada llamada se limita a ese espacio; para usar otro, desconecta y vuelve a conectar."],
    ["Pregunta", "De vuelta en Claude, pregunta con tus palabras. Claude elige la herramienta de NivaDesk que necesita y te muestra cuál está llamando."]
  ],
  urlLabel: "Dirección del conector",
  urlPending: "Aún no publicada. La dirección aparecerá aquí cuando el punto de acceso para Claude esté activo.",
  connectNotes: [
    "Sigues conectado: Claude renueva su acceso en segundo plano. Solo vuelves a iniciar sesión si la conexión se desconectó, cambió tu acceso al espacio o no se usó durante 90 días.",
    "Las conexiones son independientes. Conectar Claude no desconecta ChatGPT ni Claude Code, y desconectar una deja funcionando las demás. Cada persona se conecta con su propia cuenta y obtiene el acceso de su propio rol."
  ],
  toolsTitle: "Qué puede hacer Claude con NivaDesk",
  toolsIntro: "El conector tiene 21 herramientas. Cada una declara si solo lee, si añade algo nuevo o si cambia o sobrescribe registros existentes (marcada como destructiva). Que Claude te pregunte antes de usar una herramienta depende de la configuración de Claude y de tus elecciones allí; los permisos de NivaDesk (plan, rol, acceso al espacio) se aplican en sus servidores en cada llamada de todos modos.",
  modeRead: "Lectura",
  modeWrite: "Escritura",
  modeDestructive: "Destructiva",
  examplesLabel: "Prueba a preguntar",
  groups: [
    {
      title: "Pedidos",
      intro: "Los pedidos de tu espacio y su flujo de trabajo, más los pedidos que llegan de los canales de venta conectados.",
      tools: [
        ["search_orders", "Busca pedidos por cliente, correo, artículo, estado, ID de pedido o palabra clave."],
        ["get_order_detail", "Lee un pedido completo: cliente, artículo, fechas, estado, pagos que tu rol puede ver e historial."],
        ["search_commerce_orders", "Busca pedidos de cualquier canal conectado y muestra el estado de pago y de envío del canal junto al estado de NivaDesk. Sin importes."],
        ["create_order", "Crea un pedido nuevo con el cliente, artículo, descripción, precio y fecha de entrega que indiques."],
        ["add_order_note", "Añade una nota interna al historial de un pedido."],
        ["update_order_status", "Cambia el estado o el estado de diseño de un pedido. Las reglas de notificación de tu espacio se aplican, así que el cliente puede recibir un correo."]
      ],
      examples: [
        "¿Qué pedidos están atrasados y para quién son?",
        "Crea un pedido para Sam Lee: una lámina enmarcada, 85 £, 20 £ pagadas hoy, entrega el 14 de noviembre.",
        "Pasa el pedido del anillo grabado a Ready to Collect."
      ]
    },
    {
      title: "Notas personales",
      intro: "Tus propias Notas en NivaDesk, incluidas las que otros compartieron contigo y aceptaste. No las notas de otras personas ni las notas de pedido.",
      tools: [
        ["search_notes", "Busca tus notas por texto o etiqueta; archivadas y eliminadas solo si lo pides."],
        ["get_note_detail", "Lee una nota completa."],
        ["create_note", "Crea una nota con título, texto, etiquetas, enlaces y color."],
        ["append_note", "Añade texto al final de una nota existente."],
        ["update_note", "Sustituye el título, texto, etiquetas, enlaces o color de una nota."],
        ["pin_note", "Fija o desfija una nota."],
        ["archive_note", "Archiva o desarchiva una nota. No se elimina nada."]
      ],
      examples: [
        "Busca mi nota sobre la visita al proveedor y resúmela.",
        "Añade \"pedir tacos de nogal\" a mi nota de la lista de compras."
      ]
    },
    {
      title: "Dinero",
      intro: "Cifras de tus pedidos, solo si tu rol incluye información financiera y solo al nivel de tu plan.",
      tools: [
        ["get_dashboard_summary", "El panel en cifras: pedidos activos y por vencer, y los totales financieros que puedes ver."],
        ["get_order_financials", "La información financiera de un pedido: precio, pagado, pendiente y, en Pro y Team, costes e impuestos."],
        ["get_financial_overview", "Totales del espacio: recibido, pendiente de cobro, costes y beneficio estimado."],
        ["get_extra_spending_overview", "Costes de este mes, este año, todo el tiempo o un rango de fechas: coste base y, en Pro y Team, envío, comisiones de plataforma, IVA / impuestos y costes propios."]
      ],
      examples: [
        "¿Cuánto queda por cobrar en los pedidos abiertos?",
        "¿Cuánto he gastado este año en envíos y comisiones de plataforma?"
      ]
    },
    {
      title: "Gastos bancarios",
      intro: "El movimiento de tu cuenta de empresa, si el espacio tiene una conectada (función de Pro y Team). Pueden leerlo el propietario y los miembros con acceso a Gastos bancarios.",
      tools: [
        ["get_bank_spending_summary", "Gasto de un mes o un año: totales, cambio respecto al periodo anterior, categorías, principales comercios y suscripciones."],
        ["search_bank_transactions", "Lista movimientos por comercio, fecha, categoría, importe o justificante pendiente."],
        ["attach_bank_receipt", "Te da un enlace de NivaDesk de un solo uso, válido 15 minutos, para subir el justificante de un movimiento. Eliges y subes el archivo en la página Banco de NivaDesk con tu sesión iniciada; ningún archivo pasa por Claude. Solo el propietario."]
      ],
      examples: [
        "¿Cuánto gasté en septiembre y en qué?",
        "¿Qué pagos con tarjeta de este mes no tienen justificante todavía?"
      ]
    },
    {
      title: "Inventario",
      intro: "Tu inventario tal como lo registra NivaDesk.",
      tools: [
        ["search_inventory", "Busca en el inventario por nombre, SKU, número de serie, marca, modelo, categoría o ubicación; filtra por estado, stock bajo o reservado."]
      ],
      examples: [
        "¿Qué se está acabando?",
        "¿Tenemos correas de piel de 18 mm en el taller?"
      ]
    }
  ],
  safetyTitle: "Permisos y seguridad",
  safetyIntro: "El conector hace lo que tú podrías hacer en NivaDesk con la misma cuenta, y nada más.",
  safety: [
    ["Las mismas reglas que la app", "Cada llamada se comprueba en los servidores de NivaDesk según tu rol, tus accesos y tu plan antes de leer o escribir nada. Claude no puede ver otro espacio de trabajo ni las notas personales de otro miembro."],
    ["Tipos de herramienta y confirmaciones", "Cada herramienta declara si solo lee, si añade algo nuevo o si cambia o sobrescribe datos existentes (cambiar el estado de un pedido, añadir una nota a un pedido, añadir texto a una nota, editarla, fijarla o archivarla). Que Claude pregunte antes de usar una herramienta depende de la configuración de Claude y de tus elecciones; NivaDesk no lo controla. Los permisos propios de NivaDesk — tu plan, tu rol y tu acceso al espacio — se aplican en sus servidores en cada llamada, sea cual sea la configuración de Claude."],
    ["Mensajes a clientes", "Cambiar el estado de un pedido puede enviar un correo a tu cliente si las notificaciones de tu espacio están activas para ese pedido. Claude lo sabe; es el mismo mensaje que enviaría la app."],
    ["No se borra nada, no se mueve dinero", "Ninguna herramienta elimina pedidos, notas, clientes ni datos bancarios; archivar una nota se puede deshacer. El conector no puede hacer pagos, reembolsos ni transferencias."],
    ["Límites", "Las búsquedas devuelven un número limitado de resultados; Claude lee los datos que necesita tu respuesta, no una copia de tu espacio."]
  ],
  dataTitle: "Tus datos",
  data: [
    ["Qué recibe Claude", "Solo los resultados de las herramientas que Claude llama por ti, por ejemplo los pedidos que coinciden con una búsqueda. Esos resultados pasan a formar parte de tu conversación con Claude y Anthropic los trata según tu acuerdo con Anthropic y su política de privacidad."],
    ["Qué recibe NivaDesk", "Las propias llamadas a herramientas: qué herramienta y con qué datos (por ejemplo, el texto buscado o los campos del pedido nuevo). NivaDesk no recibe tu conversación con Claude, tu memoria de Claude ni tus archivos en Claude. Los justificantes nunca pasan por Claude: los subes en la propia página de NivaDesk."],
    ["Qué guarda NivaDesk", "Los pedidos, notas y justificantes que creas mediante Claude se guardan en tu espacio como cualquier otro. NivaDesk registra qué herramienta leyó datos personales, quién la llamó y cuándo, sin los resultados, y guarda registros técnicos de solicitudes durante un tiempo limitado por seguridad."],
    ["Sin publicidad", "NivaDesk no vende datos del conector ni los usa para publicidad. La Política de privacidad explica la conservación, tus derechos y cómo contactarnos."]
  ],
  disconnectTitle: "Desconectar",
  disconnect: [
    ["En Claude", "Abre Settings › Connectors, elige NivaDesk y desconéctalo. Claude deja de llamar a NivaDesk por ti."],
    ["En NivaDesk (propietario del espacio)", "Abre Ajustes › Integraciones › Claude. Allí aparece cada conexión de Claude y Claude Code. Disconnect termina esa conexión; Disconnect all termina todas las conexiones de Claude con el espacio de trabajo, sin afectar a las de ChatGPT. Ambas surten efecto al instante."]
  ],
  disconnectNote: "Desconectar no elimina nada de lo que creaste mediante Claude: esos pedidos y notas siguen en tu espacio hasta que los elimines en NivaDesk.",
  disconnectLink: "Abrir Ajustes › Integraciones",
  faqTitle: "Preguntas",
  faq: [
    ["¿Mis datos son públicos porque el conector es público?", "No. Cualquiera puede añadir el conector, pero no muestra nada hasta que alguien inicia sesión con su propia cuenta de NivaDesk, y entonces solo lo que esa cuenta puede ver en el espacio elegido."],
    ["¿Funciona con el plan Free?", "Sí. En Free y Starter las herramientas de dinero devuelven solo los totales básicos, y las bancarias no tienen datos porque el movimiento bancario es una función de Pro y Team."],
    ["¿Puede usarlo mi equipo?", "Sí, cada persona con su propio inicio de sesión de NivaDesk y el acceso de su rol: un miembro de solo flujo de trabajo ve solo sus pedidos asignados y ninguna cifra de dinero."],
    ["¿Conectar Claude desconecta ChatGPT?", "No. Cada asistente tiene su propia conexión. Conectar, renovar o desconectar Claude no toca una conexión de ChatGPT o Claude Code, salvo que elijas Disconnect all."],
    ["¿Puede Claude eliminar pedidos?", "No. No hay herramienta de eliminación. Claude puede crear pedidos, añadir notas y cambiar estados; cambiar un estado está declarado como herramienta destructiva. Que Claude pregunte antes de usarla depende de tu configuración de Claude."],
    ["¿Se contactará a mis clientes?", "Solo mediante tus propias reglas de notificación de NivaDesk, cuando Claude cambia el estado de un pedido que tiene las notificaciones activas. Claude no envía mensajes de ninguna otra forma."],
    ["¿Qué idioma puedo usar?", "Pregunta a Claude en cualquier idioma que entienda. Los datos de NivaDesk llegan tal como están guardados en tu espacio."],
    ["Algo ha fallado", "Los errores de herramienta dicen qué se rechazó y por qué, por ejemplo que tu rol no puede actualizar pedidos. Si no está claro, contacta con soporte indicando la hora y lo que preguntaste."]
  ],
  contactTitle: "Soporte",
  contactBody: "Preguntas sobre el conector, un problema con una respuesta o una duda de seguridad: abre un ticket desde NivaDesk o escríbenos. Indica más o menos cuándo ocurrió y qué le preguntaste a Claude; no envíes contraseñas.",
  trademark: "Claude es una marca de Anthropic, PBC. NivaDesk es un producto independiente de EGGCRAFT LIMITED y no está afiliado a Anthropic ni respaldado por Anthropic."
};

const PT: ClaudeHelpCopy = {
  eyebrow: "Conector do Claude · Guia de configuração",
  heroTitle: "NivaDesk para o Claude: pergunte pelas suas encomendas, notas e números",
  heroIntro: "O conector do NivaDesk permite que o Claude, o assistente de IA da Anthropic, trabalhe com o seu espaço de trabalho NivaDesk. Inicia sessão com a sua própria conta NivaDesk; depois o Claude pode consultar encomendas, notas, inventário e os números que a sua função pode ver e, quando pedir, criar uma encomenda, adicionar uma nota ou passar uma encomenda para um novo estado. Esta página explica quem o pode usar, como ligar, o que faz cada ferramenta, as regras de segurança e como desligar.",
  ctaConnect: "Passos para ligar",
  ctaTools: "O que pode perguntar",
  heroFacts: [
    "O seu próprio início de sessão NivaDesk: sem chaves partilhadas, sem dados públicos",
    "O seu plano, função e permissões aplicam-se a cada resposta",
    "Cada ferramenta declara se lê, acrescenta ou altera dados"
  ],
  mockLabel: "Ilustração: uma conversa no Claude com o conector do NivaDesk",
  mockCaption: "Ilustração com dados de exemplo. Não é um espaço de trabalho real.",
  mockPrompt: "Que encomendas têm entrega esta semana?",
  mockTool: "NivaDesk · Procurar encomendas",
  mockReply: "Esta semana há três encomendas para entregar: o anel gravado (quinta), a impressão emoldurada (sexta) e o topo de bolo (sábado). O anel ainda está em produção.",
  statusTitle: "Disponibilidade",
  statusLabel: "Disponível",
  statusBody: "O conector do NivaDesk está disponível. Adicione-o ao Claude como conector personalizado (custom connector) com o endereço abaixo. Está a ser preparada uma ficha no Connectors Directory da Anthropic; esta página indicará quando estiver lá.",
  whoTitle: "Quem o pode usar",
  whoIntro: "\"Público\" significa que qualquer pessoa pode adicionar o conector. Nunca significa que qualquer pessoa possa ler dados: cada chamada é feita como o utilizador NivaDesk que iniciou sessão, dentro do único espaço de trabalho que escolheu.",
  who: [
    ["Uma conta NivaDesk", "Liga-se com o e-mail e a palavra-passe (ou o início de sessão Google / Apple) que usa no NivaDesk. Sem conta não há nada para ligar; pode criar uma em nivadesk.app."],
    ["Qualquer plano NivaDesk", "O conector funciona em todos os planos. O que pode devolver segue o seu plano, como na aplicação: no Free e no Starter os valores são os totais básicos (Recebido, Custo base, Saldo básico); o Pro e o Team acrescentam envio, taxas de plataforma, IVA / impostos e outros custos. Os limites do plano também se aplicam: uma encomenda criada pelo Claude conta para o limite de encomendas ativas do plano Free."],
    ["A sua função no espaço de trabalho", "Proprietários, administradores e membros podem ler e alterar o que o seu acesso permite. Membros só de visualização podem ler mas não criar nem alterar encomendas. Membros só de fluxo de trabalho veem apenas as encomendas que lhes estão atribuídas e nenhum valor. Se o proprietário lhe desativou Encomendas, Painel, Informação financeira ou Despesas bancárias, o conector recebe a mesma recusa."],
    ["Uma conta Claude que possa adicionar conectores", "Que planos e aplicações do Claude podem adicionar conectores, e quem o pode fazer numa organização Claude, é decidido pela Anthropic e pelo seu administrador do Claude, não pelo NivaDesk."]
  ],
  connectTitle: "Ligar o NivaDesk ao Claude",
  connectSteps: [
    ["Abra Connectors no Claude", "No Claude, abra Settings › Connectors."],
    ["Encontre o NivaDesk", "Procure NivaDesk no diretório. Até a ficha estar publicada, escolha Add custom connector e cole o endereço do conector indicado abaixo."],
    ["Inicie sessão no NivaDesk", "O Claude abre a página de início de sessão do NivaDesk. Entre com a sua conta NivaDesk. O NivaDesk nunca mostra a sua palavra-passe ao Claude; o Claude recebe uma autorização de acesso, não as suas credenciais."],
    ["Escolha o espaço de trabalho", "Se pertence a vários espaços de trabalho, escolha o que o Claude pode usar. Cada chamada fica limitada a esse espaço; para usar outro, desligue e volte a ligar."],
    ["Pergunte", "De volta ao Claude, pergunte por palavras suas. O Claude escolhe a ferramenta NivaDesk de que precisa e mostra-lhe qual está a chamar."]
  ],
  urlLabel: "Endereço do conector",
  urlPending: "Ainda não publicado. O endereço aparecerá aqui quando o ponto de acesso para o Claude estiver ativo.",
  connectNotes: [
    "Fica ligado: o Claude renova o acesso em segundo plano. Só volta a iniciar sessão se a ligação tiver sido desligada, se o seu acesso ao espaço tiver mudado ou se não tiver sido usada durante 90 dias.",
    "As ligações são independentes. Ligar o Claude não desliga o ChatGPT nem o Claude Code, e desligar uma deixa as outras a funcionar. Cada pessoa liga-se com a sua própria conta e recebe o acesso da sua função."
  ],
  toolsTitle: "O que o Claude pode fazer com o NivaDesk",
  toolsIntro: "O conector tem 21 ferramentas. Cada uma declara se apenas lê, se acrescenta algo novo ou se altera ou substitui registos existentes (marcada como destrutiva). Se o Claude lhe pergunta antes de usar uma ferramenta depende das definições do Claude e das suas escolhas; as permissões do NivaDesk (plano, função, acesso ao espaço) são aplicadas nos seus servidores em cada chamada de qualquer forma.",
  modeRead: "Leitura",
  modeWrite: "Escrita",
  modeDestructive: "Destrutiva",
  examplesLabel: "Experimente perguntar",
  groups: [
    {
      title: "Encomendas",
      intro: "As encomendas do seu espaço e o seu fluxo de trabalho, mais as encomendas vindas dos canais de venda ligados.",
      tools: [
        ["search_orders", "Encontra encomendas por cliente, e-mail, artigo, estado, ID da encomenda ou palavra-chave."],
        ["get_order_detail", "Lê uma encomenda completa: cliente, artigo, datas, estado, pagamentos que a sua função pode ver e histórico."],
        ["search_commerce_orders", "Encontra encomendas de qualquer canal ligado e mostra o estado de pagamento e de envio do canal ao lado do estado NivaDesk. Sem valores."],
        ["create_order", "Cria uma nova encomenda com o cliente, artigo, descrição, preço e data de entrega que indicar."],
        ["add_order_note", "Adiciona uma nota interna ao histórico de uma encomenda."],
        ["update_order_status", "Altera o estado ou o estado de design de uma encomenda. As regras de notificação do seu espaço aplicam-se, por isso o cliente pode receber um e-mail."]
      ],
      examples: [
        "Que encomendas estão atrasadas e para quem são?",
        "Cria uma encomenda para Sam Lee: uma impressão emoldurada, 85 £, 20 £ pagas hoje, entrega a 14 de novembro.",
        "Passa a encomenda do anel gravado para Ready to Collect."
      ]
    },
    {
      title: "Notas pessoais",
      intro: "As suas próprias Notas no NivaDesk, incluindo as que outros partilharam consigo e que aceitou. Não as notas de outras pessoas nem as notas de encomenda.",
      tools: [
        ["search_notes", "Procura as suas notas por texto ou etiqueta; arquivadas e eliminadas só se pedir."],
        ["get_note_detail", "Lê uma nota completa."],
        ["create_note", "Cria uma nota com título, texto, etiquetas, ligações e cor."],
        ["append_note", "Acrescenta texto ao fim de uma nota existente."],
        ["update_note", "Substitui o título, texto, etiquetas, ligações ou cor de uma nota."],
        ["pin_note", "Fixa ou desafixa uma nota."],
        ["archive_note", "Arquiva ou desarquiva uma nota. Nada é eliminado."]
      ],
      examples: [
        "Encontra a minha nota sobre a visita ao fornecedor e resume-a.",
        "Acrescenta \"encomendar blocos de nogueira\" à minha nota da lista de compras."
      ]
    },
    {
      title: "Dinheiro",
      intro: "Números das suas encomendas, apenas se a sua função incluir informação financeira e apenas ao nível do seu plano.",
      tools: [
        ["get_dashboard_summary", "O painel em números: encomendas ativas e a vencer, e os totais financeiros que pode ver."],
        ["get_order_financials", "A informação financeira de uma encomenda: preço, pago, em falta e, no Pro e no Team, custos e impostos."],
        ["get_financial_overview", "Totais do espaço: recebido, por receber, custos e lucro estimado."],
        ["get_extra_spending_overview", "Custos deste mês, deste ano, de sempre ou de um intervalo de datas: custo base e, no Pro e no Team, envio, taxas de plataforma, IVA / impostos e custos personalizados."]
      ],
      examples: [
        "Quanto falta receber nas encomendas em aberto?",
        "Quanto gastei este ano em envios e taxas de plataforma?"
      ]
    },
    {
      title: "Despesas bancárias",
      intro: "Os movimentos da sua conta empresarial, se o espaço tiver uma ligada (funcionalidade Pro e Team). Podem lê-los o proprietário e os membros com acesso a Despesas bancárias.",
      tools: [
        ["get_bank_spending_summary", "Despesas de um mês ou de um ano: totais, variação face ao período anterior, categorias, principais comerciantes e subscrições."],
        ["search_bank_transactions", "Lista movimentos por comerciante, data, categoria, valor ou recibo em falta."],
        ["attach_bank_receipt", "Dá-lhe uma ligação NivaDesk de utilização única, válida 15 minutos, para carregar o recibo de um movimento. Escolhe e carrega o ficheiro na página Banco do NivaDesk com sessão iniciada; nenhum ficheiro passa pelo Claude. Apenas o proprietário."]
      ],
      examples: [
        "Quanto gastei em setembro e em quê?",
        "Que pagamentos com cartão deste mês ainda não têm recibo?"
      ]
    },
    {
      title: "Inventário",
      intro: "O seu inventário tal como o NivaDesk o regista.",
      tools: [
        ["search_inventory", "Procura no inventário por nome, SKU, número de série, marca, modelo, categoria ou localização; filtra por estado, stock baixo ou reservado."]
      ],
      examples: [
        "O que está a acabar?",
        "Temos braceletes de pele de 18 mm na oficina?"
      ]
    }
  ],
  safetyTitle: "Permissões e segurança",
  safetyIntro: "O conector faz o que poderia fazer no NivaDesk com a mesma conta, e nada mais.",
  safety: [
    ["As mesmas regras da aplicação", "Cada chamada é verificada nos servidores do NivaDesk em função da sua função, acessos e plano antes de qualquer leitura ou escrita. O Claude não vê outro espaço de trabalho nem as notas pessoais de outro membro."],
    ["Tipos de ferramenta e confirmações", "Cada ferramenta declara se apenas lê, se acrescenta algo novo ou se altera ou substitui dados existentes (alterar o estado de uma encomenda, adicionar uma nota a uma encomenda, acrescentar texto a uma nota, editá-la, fixá-la ou arquivá-la). Se o Claude pergunta antes de usar uma ferramenta depende das definições do Claude e das suas escolhas; o NivaDesk não controla isso. As permissões do próprio NivaDesk — o seu plano, a sua função e o seu acesso ao espaço — são aplicadas nos seus servidores em cada chamada, sejam quais forem as definições do Claude."],
    ["Mensagens para clientes", "Alterar o estado de uma encomenda pode enviar um e-mail ao seu cliente se as notificações do seu espaço estiverem ativas para essa encomenda. O Claude é informado disso; é a mesma mensagem que a aplicação enviaria."],
    ["Nada é eliminado, nenhum dinheiro se move", "Nenhuma ferramenta elimina encomendas, notas, clientes ou dados bancários; arquivar uma nota pode ser desfeito. O conector não pode fazer pagamentos, reembolsos ou transferências."],
    ["Limites", "As pesquisas devolvem um número limitado de resultados; o Claude lê os dados de que a resposta precisa, não uma cópia do seu espaço."]
  ],
  dataTitle: "Os seus dados",
  data: [
    ["O que o Claude recebe", "Apenas os resultados das ferramentas que o Claude chama por si, por exemplo as encomendas que correspondem a uma pesquisa. Esses resultados passam a fazer parte da sua conversa com o Claude e são tratados pela Anthropic nos termos do seu acordo com a Anthropic e da respetiva política de privacidade."],
    ["O que o NivaDesk recebe", "As próprias chamadas às ferramentas: que ferramenta e com que dados (por exemplo, o texto pesquisado ou os campos da nova encomenda). O NivaDesk não recebe a sua conversa com o Claude, a memória do Claude nem os seus ficheiros no Claude. Os recibos nunca passam pelo Claude: carrega-os na própria página do NivaDesk."],
    ["O que o NivaDesk guarda", "As encomendas, notas e recibos criados através do Claude ficam guardados no seu espaço como quaisquer outros. O NivaDesk regista que ferramenta leu dados pessoais, quem a chamou e quando, sem os resultados, e guarda registos técnicos de pedidos durante um período limitado, por segurança."],
    ["Sem publicidade", "O NivaDesk não vende dados do conector nem os usa para publicidade. A Política de Privacidade explica a conservação, os seus direitos e como nos contactar."]
  ],
  disconnectTitle: "Desligar",
  disconnect: [
    ["No Claude", "Abra Settings › Connectors, escolha NivaDesk e desligue. O Claude deixa de chamar o NivaDesk por si."],
    ["No NivaDesk (proprietário do espaço)", "Abra Configurações › Integrações › Claude. Aí aparece cada ligação Claude e Claude Code. Disconnect termina essa ligação; Disconnect all termina todas as ligações Claude ao espaço de trabalho, sem afetar as ligações ChatGPT. Ambas têm efeito imediato."]
  ],
  disconnectNote: "Desligar não elimina nada do que criou através do Claude: essas encomendas e notas ficam no seu espaço até as eliminar no NivaDesk.",
  disconnectLink: "Abrir Configurações › Integrações",
  faqTitle: "Perguntas",
  faq: [
    ["Os meus dados são públicos porque o conector é público?", "Não. Qualquer pessoa pode adicionar o conector, mas ele não mostra nada até alguém iniciar sessão com a sua própria conta NivaDesk, e depois só o que essa conta pode ver no espaço escolhido."],
    ["Funciona no plano Free?", "Sim. No Free e no Starter as ferramentas de dinheiro devolvem apenas os totais básicos, e as bancárias não têm dados porque os movimentos bancários são uma funcionalidade Pro e Team."],
    ["A minha equipa pode usá-lo?", "Sim, cada pessoa com o seu próprio início de sessão NivaDesk e o acesso da sua função: um membro só de fluxo de trabalho vê apenas as encomendas atribuídas e nenhum valor."],
    ["Ligar o Claude desliga o ChatGPT?", "Não. Cada assistente tem a sua própria ligação. Ligar, renovar ou desligar o Claude não toca numa ligação do ChatGPT ou do Claude Code, a menos que escolha Disconnect all."],
    ["O Claude pode eliminar encomendas?", "Não. Não existe ferramenta de eliminação. O Claude pode criar encomendas, adicionar notas e alterar estados; alterar um estado está declarado como ferramenta destrutiva. Se o Claude pergunta antes de a usar depende das suas definições do Claude."],
    ["Os meus clientes serão contactados?", "Apenas através das suas próprias regras de notificação do NivaDesk, quando o Claude altera o estado de uma encomenda com notificações ativas. O Claude não envia mensagens de nenhuma outra forma."],
    ["Que língua posso usar?", "Pergunte ao Claude em qualquer língua que ele entenda. Os dados do NivaDesk chegam tal como estão guardados no seu espaço."],
    ["Algo correu mal", "Os erros das ferramentas dizem o que foi recusado e porquê, por exemplo que a sua função não pode atualizar encomendas. Se não for claro, contacte o suporte com a hora e o que perguntou."]
  ],
  contactTitle: "Suporte",
  contactBody: "Perguntas sobre o conector, um problema com uma resposta ou uma questão de segurança: abra um pedido de suporte no NivaDesk ou escreva-nos. Indique aproximadamente quando aconteceu e o que perguntou ao Claude; não envie palavras-passe.",
  trademark: "Claude é uma marca da Anthropic, PBC. O NivaDesk é um produto independente da EGGCRAFT LIMITED e não é afiliado nem apoiado pela Anthropic."
};

const RU: ClaudeHelpCopy = {
  eyebrow: "Коннектор для Claude · Руководство по настройке",
  heroTitle: "NivaDesk для Claude: спрашивайте о заказах, заметках и цифрах",
  heroIntro: "Коннектор NivaDesk позволяет Claude, ИИ-ассистенту компании Anthropic, работать с вашим рабочим пространством NivaDesk. Вы входите со своей учётной записью NivaDesk; после этого Claude может искать заказы, заметки, складские позиции и цифры, которые разрешено видеть вашей роли, а по вашей просьбе — создать заказ, добавить заметку или перевести заказ в новый статус. На этой странице описано, кто может пользоваться коннектором, как подключиться, что делает каждый инструмент, правила безопасности и как отключиться.",
  ctaConnect: "Шаги подключения",
  ctaTools: "Что можно спросить",
  heroFacts: [
    "Ваш собственный вход в NivaDesk: никаких общих ключей и публичных данных",
    "Ваш тариф, роль и права в пространстве действуют для каждого ответа",
    "Каждый инструмент сообщает, читает ли он, добавляет или меняет данные"
  ],
  mockLabel: "Иллюстрация: разговор в Claude с использованием коннектора NivaDesk",
  mockCaption: "Иллюстрация с примерными данными. Не настоящее рабочее пространство.",
  mockPrompt: "Какие заказы нужно сдать на этой неделе?",
  mockTool: "NivaDesk · Поиск заказов",
  mockReply: "На этой неделе срок у трёх заказов: кольцо с гравировкой (четверг), принт в рамке (пятница) и топпер для торта (суббота). Кольцо ещё в работе.",
  statusTitle: "Доступность",
  statusLabel: "Работает",
  statusBody: "Коннектор NivaDesk работает. Добавьте его в Claude как пользовательский коннектор (custom connector) по адресу ниже. Карточка в Connectors Directory компании Anthropic готовится; эта страница сообщит, когда она там появится.",
  whoTitle: "Кто может пользоваться",
  whoIntro: "«Публичный» значит, что коннектор может добавить любой. Это никогда не значит, что любой может читать данные: каждый вызов выполняется от имени вошедшего пользователя NivaDesk и только в одном выбранном им рабочем пространстве.",
  who: [
    ["Учётная запись NivaDesk", "Вы подключаетесь с той же почтой и паролем (или входом через Google / Apple), что и в NivaDesk. Без учётной записи подключать нечего; создать её можно на nivadesk.app."],
    ["Любой тариф NivaDesk", "Коннектор работает на всех тарифах. Что он может вернуть, зависит от тарифа, как и в приложении: на Free и Starter денежные данные — это базовые итоги (Получено, Базовая стоимость, Базовый баланс); Pro и Team добавляют доставку, комиссии площадок, НДС / налог и прочие расходы. Лимиты тарифа тоже действуют: заказ, созданный Claude, учитывается в лимите активных заказов тарифа Free."],
    ["Ваша роль в пространстве", "Владельцы, администраторы и участники могут читать и изменять то, что разрешает их доступ. Участники только для просмотра могут читать, но не могут создавать или менять заказы. Участники только рабочего процесса видят лишь назначенные им заказы и никаких сумм. Если владелец отключил вам Заказы, Панель, Финансовую информацию или Банковские расходы, коннектору будет отказано в том же."],
    ["Учётная запись Claude, которая может добавлять коннекторы", "Какие тарифы и приложения Claude могут добавлять коннекторы и кто может это делать в организации Claude, решают Anthropic и ваш администратор Claude, а не NivaDesk."]
  ],
  connectTitle: "Подключите NivaDesk к Claude",
  connectSteps: [
    ["Откройте Connectors в Claude", "В Claude откройте Settings › Connectors."],
    ["Найдите NivaDesk", "Найдите NivaDesk в каталоге. Пока карточка не опубликована, выберите Add custom connector и вставьте адрес коннектора, указанный ниже."],
    ["Войдите в NivaDesk", "Claude откроет страницу входа NivaDesk. Войдите со своей учётной записью NivaDesk. NivaDesk никогда не показывает ваш пароль Claude; Claude получает разрешение на доступ, а не ваши учётные данные."],
    ["Выберите рабочее пространство", "Если вы состоите в нескольких пространствах, выберите то, которым может пользоваться Claude. Каждый вызов ограничен этим пространством; чтобы использовать другое, отключитесь и подключитесь снова."],
    ["Спрашивайте", "Вернитесь в Claude и спрашивайте обычными словами. Claude сам выберет нужный инструмент NivaDesk и покажет, какой из них вызывает."]
  ],
  urlLabel: "Адрес коннектора",
  urlPending: "Ещё не опубликован. Адрес появится здесь, когда точка подключения для Claude заработает.",
  connectNotes: [
    "Подключение не обрывается: Claude обновляет доступ в фоне. Войти снова нужно, только если подключение было отключено, изменился ваш доступ к пространству или им не пользовались 90 дней.",
    "Подключения независимы. Подключение Claude не отключает ChatGPT или Claude Code, а отключение одного оставляет остальные работать. Каждый подключается со своей учётной записью и получает доступ своей роли."
  ],
  toolsTitle: "Что Claude может делать с NivaDesk",
  toolsIntro: "У коннектора 21 инструмент. Каждый сообщает, только ли он читает, добавляет ли что-то новое или меняет и перезаписывает существующие записи (отмечается как деструктивный). Спросит ли Claude перед запуском инструмента, зависит от настроек Claude и вашего выбора в них; права NivaDesk (тариф, роль, доступ к пространству) в любом случае проверяются на его серверах при каждом вызове.",
  modeRead: "Чтение",
  modeWrite: "Запись",
  modeDestructive: "Деструктивный",
  examplesLabel: "Попробуйте спросить",
  groups: [
    {
      title: "Заказы",
      intro: "Заказы вашего пространства и их ход работы, а также заказы из подключённых каналов продаж.",
      tools: [
        ["search_orders", "Находит заказы по клиенту, почте, изделию, статусу, ID заказа или ключевому слову."],
        ["get_order_detail", "Показывает заказ целиком: клиент, изделие, даты, статус, платежи, видимые вашей роли, и история."],
        ["search_commerce_orders", "Находит заказы из любого подключённого канала и показывает статус оплаты и отправки канала рядом со статусом NivaDesk. Без сумм."],
        ["create_order", "Создаёт новый заказ с клиентом, изделием, описанием, ценой и сроком, которые вы укажете."],
        ["add_order_note", "Добавляет внутреннюю заметку в историю заказа."],
        ["update_order_status", "Меняет статус или статус дизайна заказа. Срабатывают правила уведомлений вашего пространства, поэтому клиент может получить письмо."]
      ],
      examples: [
        "Какие заказы просрочены и для кого они?",
        "Создай заказ для Sam Lee: принт в рамке, 85 £, сегодня оплачено 20 £, срок 14 ноября.",
        "Переведи заказ с кольцом с гравировкой в Ready to Collect."
      ]
    },
    {
      title: "Личные заметки",
      intro: "Ваши собственные Заметки в NivaDesk, включая принятые вами заметки, которыми с вами поделились. Не чужие заметки и не заметки к заказам.",
      tools: [
        ["search_notes", "Ищет ваши заметки по тексту или метке; архивные и удалённые — только по запросу."],
        ["get_note_detail", "Показывает заметку целиком."],
        ["create_note", "Создаёт заметку с заголовком, текстом, метками, ссылками и цветом."],
        ["append_note", "Дописывает текст в конец существующей заметки."],
        ["update_note", "Заменяет заголовок, текст, метки, ссылки или цвет заметки."],
        ["pin_note", "Закрепляет или открепляет заметку."],
        ["archive_note", "Архивирует заметку или возвращает её из архива. Ничего не удаляется."]
      ],
      examples: [
        "Найди мою заметку о визите к поставщику и кратко перескажи её.",
        "Добавь «заказать ореховые заготовки» в мою заметку со списком покупок."
      ]
    },
    {
      title: "Деньги",
      intro: "Цифры по вашим заказам — только если ваша роль включает финансовую информацию и только в объёме вашего тарифа.",
      tools: [
        ["get_dashboard_summary", "Панель в цифрах: активные заказы и заказы со сроком, а также доступные вам финансовые итоги."],
        ["get_order_financials", "Финансовая информация заказа: цена, оплачено, остаток, а на Pro и Team — расходы и налог."],
        ["get_financial_overview", "Итоги пространства: получено, осталось получить, расходы и оценка прибыли."],
        ["get_extra_spending_overview", "Расходы за этот месяц, этот год, за всё время или за период: базовая стоимость, а на Pro и Team — доставка, комиссии площадок, НДС / налог и свои статьи расходов."]
      ],
      examples: [
        "Сколько ещё должны заплатить по открытым заказам?",
        "Сколько я потратил в этом году на доставку и комиссии площадок?"
      ]
    },
    {
      title: "Банковские расходы",
      intro: "Лента вашего бизнес-счёта, если она подключена к пространству (функция Pro и Team). Читать её могут владелец и участники с доступом к Банковским расходам.",
      tools: [
        ["get_bank_spending_summary", "Расходы за месяц или год: итоги, изменение к прошлому периоду, категории, главные получатели и подписки."],
        ["search_bank_transactions", "Список операций по получателю, дате, категории, сумме или отсутствующему чеку."],
        ["attach_bank_receipt", "Даёт одноразовую ссылку NivaDesk, действующую 15 минут, чтобы загрузить чек для одной операции. Файл вы выбираете и загружаете на странице «Банк» в NivaDesk, войдя в систему; через Claude файлы не проходят. Только владелец."]
      ],
      examples: [
        "Сколько я потратил в сентябре и на что?",
        "Для каких оплат картой в этом месяце ещё нет чека?"
      ]
    },
    {
      title: "Склад",
      intro: "Ваши складские запасы в том виде, в каком их ведёт NivaDesk.",
      tools: [
        ["search_inventory", "Ищет на складе по названию, SKU, серийному номеру, бренду, модели, категории или месту хранения; фильтрует по статусу, малому остатку или резерву."]
      ],
      examples: [
        "Что заканчивается?",
        "Есть ли в мастерской кожаные ремешки 18 мм?"
      ]
    }
  ],
  safetyTitle: "Права и безопасность",
  safetyIntro: "Коннектор делает то, что вы могли бы сделать в NivaDesk с той же учётной записью, и не больше.",
  safety: [
    ["Те же правила, что в приложении", "Каждый вызов проверяется на серверах NivaDesk по вашей роли, настройкам доступа и тарифу до того, как что-либо будет прочитано или записано. Claude не видит другое пространство и личные заметки других участников."],
    ["Типы инструментов и подтверждения", "Каждый инструмент сообщает, только ли он читает, добавляет ли что-то новое или меняет и перезаписывает существующие данные (смена статуса заказа, добавление заметки к заказу, дополнение, правка, закрепление или архивирование заметки). Спросит ли Claude перед запуском инструмента, зависит от настроек Claude и вашего выбора; NivaDesk этим не управляет. Собственные права NivaDesk — ваш тариф, роль и доступ к пространству — проверяются на его серверах при каждом вызове, какими бы ни были настройки Claude."],
    ["Сообщения клиентам", "Смена статуса заказа может отправить клиенту письмо, если для этого заказа в вашем пространстве включены уведомления. Claude об этом знает; это то же сообщение, которое отправило бы приложение."],
    ["Ничего не удаляется, деньги не двигаются", "Ни один инструмент не удаляет заказы, заметки, клиентов или банковские данные; архивирование заметки можно отменить. Коннектор не может совершать платежи, возвраты или переводы."],
    ["Ограничения", "Поиск возвращает ограниченное число результатов; Claude читает данные, нужные для ответа, а не копию вашего пространства."]
  ],
  dataTitle: "Ваши данные",
  data: [
    ["Что получает Claude", "Только результаты инструментов, которые Claude вызывает для вас, например заказы, подходящие под поиск. Эти результаты становятся частью вашего разговора с Claude и обрабатываются Anthropic в соответствии с вашим соглашением с Anthropic и её политикой конфиденциальности."],
    ["Что получает NivaDesk", "Сами вызовы инструментов: какой инструмент и с какими данными (например, текст поиска или поля нового заказа). NivaDesk не получает ваш разговор с Claude, память Claude или ваши файлы в Claude. Чеки никогда не проходят через Claude: вы загружаете их на странице NivaDesk."],
    ["Что хранит NivaDesk", "Заказы, заметки и чеки, созданные через Claude, сохраняются в вашем пространстве, как и любые другие. NivaDesk записывает, какой инструмент читал персональные данные, кто и когда его вызвал, без самих результатов, и ограниченное время хранит технические журналы запросов для безопасности."],
    ["Не для рекламы", "NivaDesk не продаёт данные из коннектора и не использует их для рекламы. Сроки хранения, ваши права и способы связаться с нами описаны в Политике конфиденциальности."]
  ],
  disconnectTitle: "Отключение",
  disconnect: [
    ["В Claude", "Откройте Settings › Connectors, выберите NivaDesk и отключите его. Claude перестанет обращаться к NivaDesk от вашего имени."],
    ["В NivaDesk (владелец пространства)", "Откройте Настройки › Интеграции › Claude. Там указано каждое подключение Claude и Claude Code. Disconnect отключает это подключение; Disconnect all отключает все подключения Claude к рабочему пространству, подключения ChatGPT не затрагиваются. Оба действия срабатывают сразу."]
  ],
  disconnectNote: "Отключение ничего не удаляет из созданного через Claude: эти заказы и заметки остаются в пространстве, пока вы не удалите их в NivaDesk.",
  disconnectLink: "Открыть Настройки › Интеграции",
  faqTitle: "Вопросы",
  faq: [
    ["Мои данные публичны, раз коннектор публичный?", "Нет. Добавить коннектор может любой, но он ничего не показывает, пока кто-то не войдёт со своей учётной записью NivaDesk, и затем только то, что этой учётной записи видно в выбранном пространстве."],
    ["Работает ли он на тарифе Free?", "Да. На Free и Starter денежные инструменты возвращают только базовые итоги, а у банковских инструментов нет данных, потому что банковская лента — функция Pro и Team."],
    ["Может ли им пользоваться моя команда?", "Да, каждый со своим входом в NivaDesk и доступом своей роли: участник только рабочего процесса видит лишь назначенные ему заказы и никаких сумм."],
    ["Отключит ли подключение Claude ChatGPT?", "Нет. У каждого ассистента своё подключение. Подключение, обновление или отключение Claude не затрагивает подключение ChatGPT или Claude Code, если вы не выберете Disconnect all."],
    ["Может ли Claude удалять заказы?", "Нет. Инструмента удаления нет. Claude может создавать заказы, добавлять заметки и менять статус; смена статуса объявлена как деструктивный инструмент. Спросит ли Claude перед её запуском, зависит от ваших настроек Claude."],
    ["Свяжутся ли с моими клиентами?", "Только через ваши собственные правила уведомлений NivaDesk, когда Claude меняет статус заказа с включёнными уведомлениями. Другим способом Claude сообщений не отправляет."],
    ["На каком языке можно спрашивать?", "На любом языке, который понимает Claude. Данные NivaDesk возвращаются в том виде, в каком они хранятся в пространстве."],
    ["Что-то пошло не так", "Ошибки инструментов говорят, в чём отказано и почему, например что ваша роль не может менять заказы. Если непонятно, напишите в поддержку, указав время и ваш вопрос."]
  ],
  contactTitle: "Поддержка",
  contactBody: "Вопросы о коннекторе, проблема с ответом или вопрос безопасности: откройте тикет в NivaDesk или напишите нам. Укажите примерное время и что вы спросили у Claude; пожалуйста, не присылайте пароли.",
  trademark: "Claude — товарный знак Anthropic, PBC. NivaDesk — независимый продукт EGGCRAFT LIMITED, не связанный с Anthropic и не одобренный ею."
};

const JA: ClaudeHelpCopy = {
  eyebrow: "Claude コネクタ · セットアップガイド",
  heroTitle: "Claude 向け NivaDesk：注文・メモ・数字を質問",
  heroIntro: "NivaDesk コネクタを使うと、Anthropic の AI アシスタント Claude が NivaDesk のワークスペースと連携できます。ご自身の NivaDesk アカウントでサインインすると、Claude は注文、メモ、在庫、そしてあなたのロールで閲覧できる数字を調べられます。依頼すれば、注文の作成、メモの追加、注文のステータス変更も行います。このページでは、利用できる人、接続方法、各ツールの役割、安全のルール、接続解除の方法を説明します。",
  ctaConnect: "接続手順",
  ctaTools: "質問できること",
  heroFacts: [
    "ご自身の NivaDesk サインイン：共有キーも公開データもありません",
    "プラン・ロール・ワークスペース権限がすべての回答に適用されます",
    "各ツールは読み取り・追加・変更のどれを行うかを宣言します"
  ],
  mockLabel: "イラスト：NivaDesk コネクタを使う Claude の会話",
  mockCaption: "サンプルデータによるイラストです。実際のワークスペースではありません。",
  mockPrompt: "今週納期の注文はどれ？",
  mockTool: "NivaDesk · 注文を検索",
  mockReply: "今週納期の注文は3件です：刻印リング（木曜）、額装プリント（金曜）、ケーキトッパー（土曜）。リングはまだ制作中です。",
  statusTitle: "提供状況",
  statusLabel: "提供中",
  statusBody: "NivaDesk コネクタは提供中です。下のアドレスでカスタムコネクタ（custom connector）として Claude に追加してください。Anthropic の Connectors Directory への掲載を準備中で、掲載されたらこのページでお知らせします。",
  whoTitle: "利用できる人",
  whoIntro: "「公開」とは、誰でもコネクタを追加できるという意味です。誰でもデータを読めるという意味ではありません。すべての呼び出しはサインインした NivaDesk ユーザーとして、その人が選んだ1つのワークスペース内でのみ実行されます。",
  who: [
    ["NivaDesk アカウント", "NivaDesk で使っているメールアドレスとパスワード（または Google / Apple サインイン）で接続します。アカウントがなければ接続先もありません。nivadesk.app で作成できます。"],
    ["すべての NivaDesk プラン", "コネクタはすべてのプランで動作します。返せる内容はアプリと同じくプランに従います。Free と Starter では金額は基本合計（受取額、基本原価、基本残高）、Pro と Team では送料、プラットフォーム手数料、VAT / 税、その他の費用が加わります。プランの上限も適用され、Claude が作成した注文は Free プランのアクティブ注文の上限に数えられます。"],
    ["ワークスペースでのロール", "オーナー、管理者、メンバーはアクセス権で許された範囲を閲覧・変更できます。閲覧のみのメンバーは閲覧できますが、注文の作成や変更はできません。ワークフローのみのメンバーは自分に割り当てられた注文だけを見られ、金額は見られません。オーナーがあなたの注文、ダッシュボード、財務情報、銀行支出をオフにしている場合、コネクタも同じく拒否されます。"],
    ["コネクタを追加できる Claude アカウント", "どの Claude プランやアプリでコネクタを追加できるか、Claude の組織内で誰が追加できるかは、NivaDesk ではなく Anthropic と Claude の管理者が決めます。"]
  ],
  connectTitle: "NivaDesk を Claude に接続する",
  connectSteps: [
    ["Claude で Connectors を開く", "Claude で Settings › Connectors を開きます。"],
    ["NivaDesk を探す", "ディレクトリで NivaDesk を検索します。掲載前は Add custom connector を選び、下に表示されるコネクタのアドレスを貼り付けます。"],
    ["NivaDesk にサインイン", "Claude が NivaDesk のサインインページを開きます。NivaDesk アカウントでサインインしてください。NivaDesk がパスワードを Claude に見せることはありません。Claude が受け取るのは認証情報ではなくアクセス許可です。"],
    ["ワークスペースを選ぶ", "複数のワークスペースに所属している場合は、Claude が使えるものを1つ選びます。すべての呼び出しはそのワークスペースに限られます。別のものを使うには、接続を解除して接続し直します。"],
    ["質問する", "Claude に戻り、普段の言葉で質問します。Claude は必要な NivaDesk ツールを選び、どれを呼び出しているかを表示します。"]
  ],
  urlLabel: "コネクタのアドレス",
  urlPending: "まだ公開されていません。Claude 用エンドポイントが稼働すると、ここにアドレスが表示されます。",
  connectNotes: [
    "接続は維持されます：Claude がバックグラウンドでアクセスを更新します。再サインインが必要なのは、接続が解除された場合、ワークスペースへのアクセスが変わった場合、または90日間使われなかった場合だけです。",
    "接続はそれぞれ独立しています。Claude を接続しても ChatGPT や Claude Code の接続は切れず、1つを解除しても他は動き続けます。各自が自分のアカウントで接続し、そのロールのアクセス権が適用されます。"
  ],
  toolsTitle: "Claude が NivaDesk でできること",
  toolsIntro: "コネクタには21のツールがあります。各ツールは、読み取りのみか、新しいものを追加するか、既存の記録を変更・上書きするか（破壊的とマーク）を宣言します。Claude がツール実行前に確認するかどうかは、Claude 自身の設定とそこでのあなたの選択によります。NivaDesk の権限（プラン、ロール、ワークスペースへのアクセス）は、いずれの場合も呼び出しのたびにサーバー側で適用されます。",
  modeRead: "読み取り",
  modeWrite: "書き込み",
  modeDestructive: "破壊的",
  examplesLabel: "質問の例",
  groups: [
    {
      title: "注文",
      intro: "ワークスペースの注文とその作業の流れ、そして接続済みの販売チャネルから届いた注文。",
      tools: [
        ["search_orders", "顧客、メール、商品、ステータス、注文 ID、キーワードで注文を探します。"],
        ["get_order_detail", "1件の注文をすべて読みます：顧客、商品、日付、ステータス、ロールで見られる支払い、履歴。"],
        ["search_commerce_orders", "接続済みのどのチャネルの注文も探し、チャネル側の支払い・発送ステータスを NivaDesk のステータスと並べて表示します。金額は含みません。"],
        ["create_order", "指定した顧客、商品、概要、価格、納期で新しい注文を作成します。"],
        ["add_order_note", "注文の履歴に社内メモを追加します。"],
        ["update_order_status", "注文のステータスまたはデザインステータスを変更します。ワークスペースの通知ルールが動くため、顧客にメールが届くことがあります。"]
      ],
      examples: [
        "遅れている注文はどれで、誰の注文？",
        "Sam Lee の注文を作成して：額装プリント、85ポンド、今日20ポンド支払い済み、納期は11月14日。",
        "刻印リングの注文を Ready to Collect にして。"
      ]
    },
    {
      title: "個人メモ",
      intro: "NivaDesk のあなた自身のメモ。共有されて承認したメモも含みます。他の人のメモや注文メモは含みません。",
      tools: [
        ["search_notes", "テキストやラベルでメモを検索します。アーカイブ済み・削除済みは依頼した場合のみ。"],
        ["get_note_detail", "1件のメモをすべて読みます。"],
        ["create_note", "タイトル、本文、ラベル、リンク、色を指定してメモを作成します。"],
        ["append_note", "既存のメモの末尾にテキストを追加します。"],
        ["update_note", "メモのタイトル、本文、ラベル、リンク、色を置き換えます。"],
        ["pin_note", "メモをピン留め・解除します。"],
        ["archive_note", "メモをアーカイブ・解除します。削除はされません。"]
      ],
      examples: [
        "仕入れ先訪問のメモを探して要約して。",
        "買い物リストのメモに「ウォールナット材を発注」を追加して。"
      ]
    },
    {
      title: "お金",
      intro: "注文から得られる数字。ロールに財務情報が含まれる場合のみ、プランの範囲で表示されます。",
      tools: [
        ["get_dashboard_summary", "ダッシュボードの数字：進行中・納期の近い注文と、閲覧できる財務合計。"],
        ["get_order_financials", "1件の注文の財務情報：価格、支払済み、残額。Pro と Team では費用と税も。"],
        ["get_financial_overview", "ワークスペースの合計：受取額、未回収額、費用、推定利益。"],
        ["get_extra_spending_overview", "今月、今年、全期間、指定期間の費用：基本原価。Pro と Team では送料、プラットフォーム手数料、VAT / 税、独自の費用も。"]
      ],
      examples: [
        "未完了の注文で未回収はいくら？",
        "今年、送料とプラットフォーム手数料にいくら使った？"
      ]
    },
    {
      title: "銀行支出",
      intro: "ワークスペースに接続された事業用口座のフィード（Pro と Team の機能）。オーナーと、銀行支出へのアクセスを与えられたメンバーが閲覧できます。",
      tools: [
        ["get_bank_spending_summary", "月または年の支出：合計、前期比、カテゴリ、主な取引先、サブスクリプション。"],
        ["search_bank_transactions", "取引先、日付、カテゴリ、金額、領収書未添付で取引を一覧表示します。"],
        ["attach_bank_receipt", "1件の取引の領収書をアップロードするための、15分間有効な使い切りの NivaDesk リンクを発行します。ファイルはサインインした状態で NivaDesk の銀行ページから選んでアップロードします。ファイルが Claude を経由することはありません。オーナーのみ。"]
      ],
      examples: [
        "9月にいくら、何に使った？",
        "今月のカード払いで領収書がまだないものは？"
      ]
    },
    {
      title: "在庫",
      intro: "NivaDesk に記録された在庫。",
      tools: [
        ["search_inventory", "名前、SKU、シリアル番号、ブランド、モデル、カテゴリ、保管場所で在庫を検索し、ステータス、在庫僅少、引当済みで絞り込みます。"]
      ],
      examples: [
        "残りが少ないものは？",
        "工房に 18 mm の革ストラップはある？"
      ]
    }
  ],
  safetyTitle: "権限と安全",
  safetyIntro: "コネクタができるのは、同じアカウントであなたが NivaDesk でできることだけです。",
  safety: [
    ["アプリと同じルール", "すべての呼び出しは、読み書きの前に NivaDesk のサーバーでロール、アクセス設定、プランに照らして確認されます。Claude は他のワークスペースや他のメンバーの個人メモを見られません。"],
    ["ツールの種類と確認", "各ツールは、読み取りのみか、新しいものを追加するか、既存のデータを変更・上書きするか（注文ステータスの変更、注文へのメモ追加、メモへの追記・編集・ピン留め・アーカイブ）を宣言します。Claude がツール実行前に確認するかどうかは Claude 自身の設定とあなたの選択によるもので、NivaDesk が制御するものではありません。NivaDesk 自身の権限（プラン、ロール、ワークスペースへのアクセス）は、Claude の設定にかかわらず呼び出しのたびにサーバー側で適用されます。"],
    ["顧客へのメッセージ", "注文のステータス変更は、その注文でワークスペースの通知がオンなら顧客にメールを送ることがあります。Claude はこれを知らされており、送られるのはアプリが送るものと同じメッセージです。"],
    ["削除なし、お金の移動なし", "注文、メモ、顧客、銀行データを削除するツールはありません。メモのアーカイブは元に戻せます。コネクタは支払い、返金、送金を行えません。"],
    ["上限", "検索結果の件数には上限があります。Claude が読むのは回答に必要なデータで、ワークスペースのコピーではありません。"]
  ],
  dataTitle: "あなたのデータ",
  data: [
    ["Claude が受け取るもの", "Claude があなたのために呼び出したツールの結果だけです（例：検索に一致した注文）。これらの結果は Claude の会話の一部となり、あなたと Anthropic との契約および Anthropic のプライバシーポリシーに基づいて Anthropic が扱います。"],
    ["NivaDesk が受け取るもの", "ツール呼び出しそのもの：どのツールを、どんな内容で（例：検索語や新しい注文の項目）。NivaDesk は Claude との会話、Claude のメモリ、Claude 内のファイルを受け取りません。領収書が Claude を経由することはなく、NivaDesk のページで直接アップロードします。"],
    ["NivaDesk が保存するもの", "Claude 経由で作成した注文、メモ、領収書は、他と同じくワークスペースに保存されます。NivaDesk は、どのツールが個人データを読んだか、誰がいつ呼び出したかを結果なしで記録し、セキュリティのために技術的なリクエストログを一定期間保存します。"],
    ["広告には使いません", "NivaDesk はコネクタのデータを販売せず、広告にも使いません。保存期間、あなたの権利、連絡方法はプライバシーポリシーをご覧ください。"]
  ],
  disconnectTitle: "接続を解除する",
  disconnect: [
    ["Claude で", "Settings › Connectors を開き、NivaDesk を選んで接続を解除します。Claude はあなたのために NivaDesk を呼び出さなくなります。"],
    ["NivaDesk で（ワークスペースのオーナー）", "設定 › 連携 › Claude を開きます。Claude と Claude Code の接続がすべて表示されます。Disconnect はその接続だけを、Disconnect all はワークスペースへの Claude の接続をすべて終了します（ChatGPT の接続には影響しません）。どちらもすぐに反映されます。"]
  ],
  disconnectNote: "接続を解除しても、Claude 経由で作成したものは削除されません。それらの注文やメモは、NivaDesk で削除するまでワークスペースに残ります。",
  disconnectLink: "設定 › 連携 を開く",
  faqTitle: "よくある質問",
  faq: [
    ["コネクタが公開されているので、データも公開されますか？", "いいえ。コネクタは誰でも追加できますが、誰かが自分の NivaDesk アカウントでサインインするまで何も表示しません。その後も、選んだワークスペースでそのアカウントが見られるものだけです。"],
    ["Free プランでも使えますか？", "はい。Free と Starter ではお金のツールは基本合計のみを返し、銀行フィードは Pro と Team の機能なので銀行ツールにはデータがありません。"],
    ["チームで使えますか？", "はい。各自が自分の NivaDesk ログインで、それぞれのロールのアクセス権で使います。ワークフローのみのメンバーは割り当てられた注文だけを見られ、金額は見られません。"],
    ["Claude を接続すると ChatGPT が切れますか？", "いいえ。アシスタントごとに接続は別です。Claude の接続・更新・解除は、Disconnect all を選ばない限り ChatGPT や Claude Code の接続に影響しません。"],
    ["Claude は注文を削除できますか？", "いいえ。削除ツールはありません。Claude は注文の作成、メモの追加、ステータス変更ができます。ステータス変更は破壊的なツールとして宣言されています。実行前に Claude が確認するかどうかは Claude の設定によります。"],
    ["顧客に連絡が行きますか？", "Claude が通知オンの注文のステータスを変えたときに、あなた自身の NivaDesk 通知ルールを通じてのみです。Claude がそれ以外の方法でメッセージを送ることはありません。"],
    ["どの言語で使えますか？", "Claude が理解できる言語なら何でも構いません。NivaDesk のデータはワークスペースに保存されているとおりに返ります。"],
    ["うまくいかないとき", "ツールのエラーは、何がなぜ拒否されたかを示します（例：あなたのロールでは注文を更新できない）。分かりにくい場合は、時刻と質問内容を添えてサポートにご連絡ください。"]
  ],
  contactTitle: "サポート",
  contactBody: "コネクタについての質問、回答の問題、セキュリティの懸念は、NivaDesk 内でチケットを作成するか、メールでご連絡ください。おおよその日時と Claude に尋ねた内容をお知らせください。パスワードは送らないでください。",
  trademark: "Claude は Anthropic, PBC の商標です。NivaDesk は EGGCRAFT LIMITED の独立した製品であり、Anthropic との提携や Anthropic による承認はありません。"
};

const ZH: ClaudeHelpCopy = {
  eyebrow: "Claude 连接器 · 设置指南",
  heroTitle: "NivaDesk for Claude：询问您的订单、笔记和数字",
  heroIntro: "NivaDesk 连接器让 Anthropic 的 AI 助手 Claude 能够使用您的 NivaDesk 工作区。您用自己的 NivaDesk 账户登录；之后 Claude 可以查找订单、笔记、库存以及您的角色有权查看的数字，并在您要求时创建订单、添加笔记或把订单改为新状态。本页说明谁可以使用、如何连接、每个工具的作用、安全规则以及如何断开连接。",
  ctaConnect: "连接步骤",
  ctaTools: "可以问什么",
  heroFacts: [
    "使用您自己的 NivaDesk 登录：没有共享密钥，没有公开数据",
    "您的套餐、角色和工作区权限适用于每一次回答",
    "每个工具都会声明它是读取、新增还是更改数据"
  ],
  mockLabel: "示意图：使用 NivaDesk 连接器的 Claude 对话",
  mockCaption: "示例数据示意图，并非真实工作区。",
  mockPrompt: "本周有哪些订单到期？",
  mockTool: "NivaDesk · 搜索订单",
  mockReply: "本周有三个订单到期：刻字戒指（周四）、装框印刷品（周五）和蛋糕插牌（周六）。戒指仍在制作中。",
  statusTitle: "可用性",
  statusLabel: "已上线",
  statusBody: "NivaDesk 连接器已上线。请使用下方地址，将其作为自定义连接器（custom connector）添加到 Claude。Anthropic Connectors Directory 中的条目正在准备，上架后本页会说明。",
  whoTitle: "谁可以使用",
  whoIntro: "“公开”是指任何人都可以添加该连接器，绝不意味着任何人都能读取数据：每次调用都以登录的 NivaDesk 用户身份运行，并且只在其选择的那一个工作区内。",
  who: [
    ["一个 NivaDesk 账户", "使用您在 NivaDesk 使用的邮箱和密码（或 Google / Apple 登录）进行连接。没有账户就没有可连接的内容；您可以在 nivadesk.app 创建账户。"],
    ["任何 NivaDesk 套餐", "连接器适用于所有套餐。它能返回的内容与应用一样取决于您的套餐：Free 和 Starter 的金额为基础合计（已收款、基础成本、基础余额）；Pro 和 Team 还包括运费、平台费用、增值税 / 税费和其他成本。套餐限制同样适用：Claude 创建的订单计入 Free 套餐的活跃订单上限。"],
    ["您在工作区中的角色", "所有者、管理员和成员可以读取和更改其访问权限允许的内容。仅查看成员可以读取，但不能创建或更改订单。仅工作流成员只能看到分配给自己的订单，看不到任何金额。如果所有者为您关闭了订单、仪表板、财务信息或银行支出，连接器同样会被拒绝。"],
    ["可以添加连接器的 Claude 账户", "哪些 Claude 套餐和应用可以添加连接器，以及 Claude 组织中谁可以添加，由 Anthropic 和您的 Claude 管理员决定，而不是 NivaDesk。"]
  ],
  connectTitle: "将 NivaDesk 连接到 Claude",
  connectSteps: [
    ["在 Claude 中打开 Connectors", "在 Claude 中打开 Settings › Connectors。"],
    ["找到 NivaDesk", "在目录中搜索 NivaDesk。上架之前，请选择 Add custom connector 并粘贴下方显示的连接器地址。"],
    ["登录 NivaDesk", "Claude 会打开 NivaDesk 的登录页面。请用您的 NivaDesk 账户登录。NivaDesk 绝不会向 Claude 显示您的密码；Claude 获得的是访问授权，而不是您的凭据。"],
    ["选择工作区", "如果您属于多个工作区，请选择允许 Claude 使用的那个。每次调用都仅限于该工作区；要使用其他工作区，请断开后重新连接。"],
    ["提问", "回到 Claude，用平常的话提问。Claude 会选择所需的 NivaDesk 工具，并向您显示它正在调用哪个工具。"]
  ],
  urlLabel: "连接器地址",
  urlPending: "尚未公布。Claude 端点上线后，地址将显示在这里。",
  connectNotes: [
    "连接会保持：Claude 会在后台续期访问权限。只有在连接被断开、您对工作区的访问发生变化，或 90 天未使用时，才需要重新登录。",
    "各连接相互独立。连接 Claude 不会断开 ChatGPT 或 Claude Code，断开其中一个也不影响其他连接。每个人都用自己的账户连接，并获得各自角色的访问权限。"
  ],
  toolsTitle: "Claude 可以用 NivaDesk 做什么",
  toolsIntro: "连接器有 21 个工具。每个工具都会声明它是只读、新增内容，还是更改或覆盖现有记录（标记为破坏性）。Claude 在运行工具前是否询问您，取决于 Claude 自身的设置以及您在其中的选择；无论如何，NivaDesk 的权限（套餐、角色、工作区访问）都会在每次调用时由其服务器执行。",
  modeRead: "读取",
  modeWrite: "写入",
  modeDestructive: "破坏性",
  examplesLabel: "试着问",
  groups: [
    {
      title: "订单",
      intro: "您工作区的订单及其工作流程，以及来自已连接销售渠道的订单。",
      tools: [
        ["search_orders", "按客户、邮箱、物品、状态、订单 ID 或任意关键词查找订单。"],
        ["get_order_detail", "完整读取一个订单：客户、物品、日期、状态、您的角色可见的付款以及历史记录。"],
        ["search_commerce_orders", "查找来自任何已连接渠道的订单，并在 NivaDesk 状态旁显示渠道自己的付款和发货状态。不含金额。"],
        ["create_order", "按您提供的客户、物品、说明、价格和截止日期创建新订单。"],
        ["add_order_note", "在订单历史中添加内部备注。"],
        ["update_order_status", "更改订单状态或设计状态。工作区的通知规则会随之运行，因此客户可能会收到邮件。"]
      ],
      examples: [
        "哪些订单逾期了，是谁的？",
        "为 Sam Lee 创建订单：装框印刷品，85 英镑，今天已付 20 英镑，11 月 14 日交付。",
        "把刻字戒指的订单改为 Ready to Collect。"
      ]
    },
    {
      title: "个人笔记",
      intro: "您在 NivaDesk 中自己的笔记，包括他人与您共享且您已接受的笔记。不包括他人的笔记，也不包括订单备注。",
      tools: [
        ["search_notes", "按文字或标签搜索您的笔记；已归档和已删除的仅在您要求时包含。"],
        ["get_note_detail", "完整读取一条笔记。"],
        ["create_note", "创建带标题、正文、标签、链接和颜色的笔记。"],
        ["append_note", "在现有笔记末尾追加文字。"],
        ["update_note", "替换笔记的标题、正文、标签、链接或颜色。"],
        ["pin_note", "置顶或取消置顶笔记。"],
        ["archive_note", "归档或取消归档笔记。不会删除任何内容。"]
      ],
      examples: [
        "找到我关于拜访供应商的笔记并总结一下。",
        "在我的购物清单笔记里加上“订购胡桃木坯料”。"
      ]
    },
    {
      title: "资金",
      intro: "来自订单的数字，仅当您的角色包含财务信息时提供，并且只到您的套餐所允许的深度。",
      tools: [
        ["get_dashboard_summary", "以数字呈现的仪表板：进行中和即将到期的订单，以及您可查看的财务合计。"],
        ["get_order_financials", "一个订单的财务信息：价格、已付、未付；在 Pro 和 Team 中还有成本和税费。"],
        ["get_financial_overview", "工作区合计：已收款、待收款、成本和预估利润。"],
        ["get_extra_spending_overview", "本月、本年、全部时间或某一日期范围的成本：基础成本；在 Pro 和 Team 中还有运费、平台费用、增值税 / 税费和自定义成本。"]
      ],
      examples: [
        "未完成订单还有多少待收款？",
        "今年我在运费和平台费用上花了多少？"
      ]
    },
    {
      title: "银行支出",
      intro: "工作区已连接的企业银行流水（Pro 和 Team 功能）。所有者和获得银行支出权限的成员可以读取。",
      tools: [
        ["get_bank_spending_summary", "某月或某年的支出：合计、与上一期相比的变化、类别、主要商家和订阅。"],
        ["search_bank_transactions", "按商家、日期、类别、金额或缺少收据列出交易。"],
        ["attach_bank_receipt", "为一笔交易生成一个 15 分钟内有效、仅可使用一次的 NivaDesk 上传链接。您在登录状态下于 NivaDesk 的银行页面选择并上传文件；任何文件都不经过 Claude。仅限所有者。"]
      ],
      examples: [
        "我九月花了多少钱，花在哪些方面？",
        "本月哪些刷卡付款还没有收据？"
      ]
    },
    {
      title: "库存",
      intro: "NivaDesk 记录的库存。",
      tools: [
        ["search_inventory", "按名称、SKU、序列号、品牌、型号、类别或位置搜索库存；按状态、低库存或已预留筛选。"]
      ],
      examples: [
        "哪些东西快用完了？",
        "工作室里有 18 毫米的皮表带吗？"
      ]
    }
  ],
  safetyTitle: "权限与安全",
  safetyIntro: "连接器能做的，就是您用同一账户在 NivaDesk 中自己能做的，仅此而已。",
  safety: [
    ["与应用相同的规则", "每次调用在读取或写入任何内容之前，都会在 NivaDesk 服务器上按您的角色、访问开关和套餐进行检查。Claude 看不到其他工作区，也看不到其他成员的个人笔记。"],
    ["工具类型与确认", "每个工具都会声明它是只读、新增内容，还是更改或覆盖现有数据（更改订单状态、给订单添加备注、追加、编辑、置顶或归档笔记）。Claude 在运行工具前是否询问，取决于 Claude 自身的设置和您的选择；这不由 NivaDesk 控制。NivaDesk 自身的权限——您的套餐、角色和工作区访问——无论 Claude 如何设置，都会在每次调用时由其服务器执行。"],
    ["发给客户的消息", "如果您的工作区为该订单开启了通知，更改订单状态可能会给客户发送邮件。Claude 已被告知这一点；发送的消息与应用会发送的相同。"],
    ["不删除任何内容，不转移资金", "没有任何工具会删除订单、笔记、客户或银行数据；归档笔记可以撤销。连接器无法进行付款、退款或转账。"],
    ["限制", "搜索返回的结果数量有限；Claude 读取的是回答所需的数据，而不是您工作区的副本。"]
  ],
  dataTitle: "您的数据",
  data: [
    ["Claude 收到什么", "仅 Claude 为您调用的工具的结果，例如与搜索匹配的订单。这些结果会成为您 Claude 对话的一部分，由 Anthropic 根据您与 Anthropic 的协议及其隐私政策处理。"],
    ["NivaDesk 收到什么", "工具调用本身：哪个工具、带哪些内容（例如搜索文字或新订单的字段）。NivaDesk 不会收到您与 Claude 的对话、Claude 的记忆或您在 Claude 中的文件。收据从不经过 Claude：您在 NivaDesk 自己的页面上传。"],
    ["NivaDesk 保存什么", "通过 Claude 创建的订单、笔记和收据会像其他内容一样保存在您的工作区。NivaDesk 会记录哪个工具读取了个人数据、谁在何时调用（不含结果），并出于安全原因在有限时间内保留技术请求日志。"],
    ["不用于广告", "NivaDesk 不出售来自连接器的数据，也不将其用于广告。隐私政策说明了保留期限、您的权利以及联系方式。"]
  ],
  disconnectTitle: "断开连接",
  disconnect: [
    ["在 Claude 中", "打开 Settings › Connectors，选择 NivaDesk 并断开连接。Claude 将不再为您调用 NivaDesk。"],
    ["在 NivaDesk 中（工作区所有者）", "打开 设置 › 集成 › Claude。这里列出每个 Claude 和 Claude Code 连接。Disconnect 只结束该连接；Disconnect all 结束此工作区的所有 Claude 连接，不影响 ChatGPT 连接。两者都会立即生效。"]
  ],
  disconnectNote: "断开连接不会删除您通过 Claude 创建的任何内容：这些订单和笔记会保留在您的工作区，直到您在 NivaDesk 中删除它们。",
  disconnectLink: "打开 设置 › 集成",
  faqTitle: "常见问题",
  faq: [
    ["连接器是公开的，我的数据也会公开吗？", "不会。任何人都可以添加连接器，但在有人用自己的 NivaDesk 账户登录之前它不会显示任何内容，登录后也只显示该账户在所选工作区中可查看的内容。"],
    ["Free 套餐可以用吗？", "可以。在 Free 和 Starter 中，资金工具只返回基础合计；银行工具没有数据，因为银行流水是 Pro 和 Team 功能。"],
    ["我的团队可以使用吗？", "可以，每个人用自己的 NivaDesk 登录，并获得各自角色的访问权限：仅工作流成员只能看到分配给自己的订单，看不到金额。"],
    ["连接 Claude 会断开 ChatGPT 吗？", "不会。每个助手都有自己的连接。连接、续期或断开 Claude 不会影响 ChatGPT 或 Claude Code 的连接，除非您选择 Disconnect all。"],
    ["Claude 能删除订单吗？", "不能。没有删除工具。Claude 可以创建订单、添加备注和更改状态；更改状态被声明为破坏性工具。Claude 在运行它之前是否询问，取决于您的 Claude 设置。"],
    ["会联系我的客户吗？", "只会通过您自己的 NivaDesk 通知规则：当 Claude 更改一个已开启通知的订单状态时。Claude 不会以其他任何方式发送消息。"],
    ["可以用什么语言？", "用 Claude 能理解的任何语言提问。NivaDesk 的数据会按照工作区中保存的原样返回。"],
    ["出了问题", "工具错误会说明拒绝了什么以及原因，例如您的角色不能更新订单。如果不清楚，请联系支持并说明时间和您的问题。"]
  ],
  contactTitle: "支持",
  contactBody: "关于连接器的问题、某个回答的问题或安全方面的顾虑：请在 NivaDesk 内提交工单，或给我们发邮件。请告诉我们大致的时间以及您问了 Claude 什么；请不要发送密码。",
  trademark: "Claude 是 Anthropic, PBC 的商标。NivaDesk 是 EGGCRAFT LIMITED 的独立产品，与 Anthropic 无关联，也未获 Anthropic 认可。"
};

const AR: ClaudeHelpCopy = {
  eyebrow: "موصّل Claude · دليل الإعداد",
  heroTitle: "NivaDesk لـ Claude: اسأل عن طلباتك وملاحظاتك وأرقامك",
  heroIntro: "يتيح موصّل NivaDesk لـ Claude، مساعد الذكاء الاصطناعي من Anthropic، العمل مع مساحة عملك في NivaDesk. تسجّل الدخول بحسابك الخاص في NivaDesk، ثم يستطيع Claude البحث في الطلبات والملاحظات والمخزون والأرقام التي يُسمح لدورك برؤيتها، وعندما تطلب ذلك يمكنه إنشاء طلب أو إضافة ملاحظة أو نقل طلب إلى حالة جديدة. تشرح هذه الصفحة من يمكنه استخدامه، وكيفية الاتصال، وما تفعله كل أداة، وقواعد الأمان، وكيفية قطع الاتصال.",
  ctaConnect: "خطوات الاتصال",
  ctaTools: "ما يمكنك أن تسأله",
  heroFacts: [
    "تسجيل دخولك الخاص إلى NivaDesk: لا مفاتيح مشتركة ولا بيانات عامة",
    "خطتك ودورك وصلاحيات مساحة العمل تنطبق على كل إجابة",
    "تعلن كل أداة ما إذا كانت تقرأ أو تضيف أو تغيّر البيانات"
  ],
  mockLabel: "رسم توضيحي: محادثة في Claude تستخدم موصّل NivaDesk",
  mockCaption: "رسم توضيحي ببيانات مثال. ليست مساحة عمل حقيقية.",
  mockPrompt: "ما الطلبات المستحقة هذا الأسبوع؟",
  mockTool: "NivaDesk · البحث في الطلبات",
  mockReply: "هناك ثلاثة طلبات مستحقة هذا الأسبوع: الخاتم المنقوش (الخميس)، والطبعة المؤطّرة (الجمعة)، وزينة الكعكة (السبت). الخاتم ما زال قيد التنفيذ.",
  statusTitle: "التوفر",
  statusLabel: "متاح الآن",
  statusBody: "موصّل NivaDesk متاح الآن. أضفه إلى Claude كموصّل مخصّص (custom connector) باستخدام العنوان أدناه. يجري إعداد صفحة في Connectors Directory من Anthropic، وستذكر هذه الصفحة ذلك عند إدراجه.",
  whoTitle: "من يمكنه استخدامه",
  whoIntro: "\"عام\" تعني أن أي شخص يمكنه إضافة الموصّل، ولا تعني أبدًا أن أي شخص يمكنه قراءة البيانات: كل استدعاء يعمل باسم مستخدم NivaDesk الذي سجّل الدخول، وداخل مساحة العمل الوحيدة التي اختارها.",
  who: [
    ["حساب NivaDesk", "تتصل بالبريد الإلكتروني وكلمة المرور (أو تسجيل الدخول عبر Google / Apple) التي تستخدمها في NivaDesk. من دون حساب لا يوجد ما يمكن الاتصال به؛ يمكنك إنشاء حساب على nivadesk.app."],
    ["أي خطة من خطط NivaDesk", "يعمل الموصّل مع كل الخطط. وما يمكنه إرجاعه يتبع خطتك كما في التطبيق: في Free وStarter تكون الأرقام المالية هي الإجماليات الأساسية (المستلَم، التكلفة الأساسية، الرصيد الأساسي)؛ وتضيف Pro وTeam الشحن ورسوم المنصّات وضريبة القيمة المضافة / الضرائب والتكاليف الأخرى. وتنطبق حدود الخطة أيضًا، فالطلب الذي ينشئه Claude يُحتسب ضمن حد الطلبات النشطة في خطة Free."],
    ["دورك في مساحة العمل", "يمكن للمالكين والمسؤولين والأعضاء قراءة وتغيير ما يسمح به وصولهم. يمكن لأعضاء العرض فقط القراءة لكن لا يمكنهم إنشاء الطلبات أو تغييرها. ويرى أعضاء سير العمل فقط الطلبات المسندة إليهم فقط ولا يرون أي أرقام مالية. وإذا أوقف المالك لك الطلبات أو لوحة المعلومات أو المعلومات المالية أو المصروفات البنكية، يُرفض الموصّل بالطريقة نفسها."],
    ["حساب Claude يمكنه إضافة الموصّلات", "تحدد Anthropic ومسؤول Claude لديك، وليس NivaDesk، أي خطط وتطبيقات Claude يمكنها إضافة الموصّلات ومن يمكنه إضافتها داخل مؤسسة Claude."]
  ],
  connectTitle: "اربط NivaDesk بـ Claude",
  connectSteps: [
    ["افتح Connectors في Claude", "في Claude، افتح Settings › Connectors."],
    ["ابحث عن NivaDesk", "ابحث عن NivaDesk في الدليل. وإلى أن تُنشر الصفحة، اختر Add custom connector والصق عنوان الموصّل المعروض أدناه."],
    ["سجّل الدخول إلى NivaDesk", "يفتح Claude صفحة تسجيل الدخول في NivaDesk. سجّل الدخول بحسابك في NivaDesk. لا يُظهر NivaDesk كلمة مرورك لـ Claude أبدًا؛ يحصل Claude على إذن وصول، لا على بيانات دخولك."],
    ["اختر مساحة العمل", "إذا كنت عضوًا في أكثر من مساحة عمل، فاختر المساحة التي يمكن لـ Claude استخدامها. كل استدعاء مقصور على تلك المساحة؛ ولاستخدام مساحة أخرى اقطع الاتصال ثم اتصل مجددًا."],
    ["اسأل", "عد إلى Claude واسأل بلغة عادية. يختار Claude أداة NivaDesk التي يحتاجها ويعرض لك الأداة التي يستدعيها."]
  ],
  urlLabel: "عنوان الموصّل",
  urlPending: "لم يُنشر بعد. سيظهر العنوان هنا عندما تصبح نقطة اتصال Claude متاحة.",
  connectNotes: [
    "تبقى متصلًا: يجدّد Claude وصوله في الخلفية. لا تحتاج إلى تسجيل الدخول مجددًا إلا إذا قُطع الاتصال، أو تغيّر وصولك إلى مساحة العمل، أو لم يُستخدم لمدة 90 يومًا.",
    "الاتصالات مستقلة. ربط Claude لا يقطع ChatGPT ولا Claude Code، وقطع أحدها يترك البقية تعمل. يتصل كل شخص بحسابه الخاص ويحصل على وصول دوره."
  ],
  toolsTitle: "ما يمكن لـ Claude فعله مع NivaDesk",
  toolsIntro: "للموصّل 21 أداة. تعلن كل أداة ما إذا كانت تقرأ فقط، أو تضيف شيئًا جديدًا، أو تغيّر سجلات موجودة أو تستبدلها (مصنّفة إتلافية). أما ما إذا كان Claude يسألك قبل تشغيل أداة فيعتمد على إعدادات Claude نفسه واختياراتك فيها؛ وفي كل الأحوال تُطبَّق صلاحيات NivaDesk (الخطة والدور والوصول إلى مساحة العمل) على خوادمه في كل استدعاء.",
  modeRead: "قراءة",
  modeWrite: "كتابة",
  modeDestructive: "إتلافية",
  examplesLabel: "جرّب أن تسأل",
  groups: [
    {
      title: "الطلبات",
      intro: "طلبات مساحة عملك وسير عملها، إضافة إلى الطلبات الواردة من قنوات البيع المتصلة.",
      tools: [
        ["search_orders", "يعثر على الطلبات حسب العميل أو البريد الإلكتروني أو المنتج أو الحالة أو معرّف الطلب أو أي كلمة."],
        ["get_order_detail", "يقرأ طلبًا كاملًا: العميل والمنتج والتواريخ والحالة والمدفوعات التي يمكن لدورك رؤيتها والسجل."],
        ["search_commerce_orders", "يعثر على الطلبات من أي قناة متصلة ويعرض حالة الدفع والشحن الخاصة بالقناة بجانب حالة NivaDesk. بلا مبالغ."],
        ["create_order", "ينشئ طلبًا جديدًا بالعميل والمنتج والوصف والسعر وتاريخ الاستحقاق الذي تحدده."],
        ["add_order_note", "يضيف ملاحظة داخلية إلى سجل الطلب."],
        ["update_order_status", "يغيّر حالة الطلب أو حالة التصميم. تعمل قواعد الإشعارات في مساحة عملك عند التغيير، لذا قد يتلقى العميل بريدًا إلكترونيًا."]
      ],
      examples: [
        "ما الطلبات المتأخرة، ولمن هي؟",
        "أنشئ طلبًا لـ Sam Lee: طبعة مؤطّرة، 85 جنيهًا إسترلينيًا، دُفع 20 اليوم، والتسليم في 14 نوفمبر.",
        "انقل طلب الخاتم المنقوش إلى Ready to Collect."
      ]
    },
    {
      title: "الملاحظات الشخصية",
      intro: "ملاحظاتك الخاصة في NivaDesk، بما فيها الملاحظات التي شاركها الآخرون معك وقبلتها. ليست ملاحظات الآخرين وليست ملاحظات الطلبات.",
      tools: [
        ["search_notes", "يبحث في ملاحظاتك حسب النص أو الوسم؛ المؤرشفة والمحذوفة فقط إذا طلبت ذلك."],
        ["get_note_detail", "يقرأ ملاحظة كاملة."],
        ["create_note", "ينشئ ملاحظة بعنوان ونص ووسوم وروابط ولون."],
        ["append_note", "يضيف نصًا إلى نهاية ملاحظة موجودة."],
        ["update_note", "يستبدل عنوان الملاحظة أو نصها أو وسومها أو روابطها أو لونها."],
        ["pin_note", "يثبّت الملاحظة أو يلغي تثبيتها."],
        ["archive_note", "يؤرشف الملاحظة أو يعيدها من الأرشيف. لا يُحذف شيء."]
      ],
      examples: [
        "ابحث عن ملاحظتي حول زيارة المورّد ولخّصها.",
        "أضف \"اطلب قطع خشب الجوز\" إلى ملاحظة قائمة المشتريات."
      ]
    },
    {
      title: "المال",
      intro: "أرقام من طلباتك، فقط إذا كان دورك يشمل المعلومات المالية، وفقط بالعمق الذي تتيحه خطتك.",
      tools: [
        ["get_dashboard_summary", "لوحة المعلومات بالأرقام: الطلبات النشطة والمستحقة، والإجماليات المالية التي يمكنك رؤيتها."],
        ["get_order_financials", "المعلومات المالية لطلب واحد: السعر والمدفوع والمتبقي، وفي Pro وTeam التكاليف والضرائب."],
        ["get_financial_overview", "إجماليات مساحة العمل: المستلَم والمتبقي للتحصيل والتكاليف والربح التقديري."],
        ["get_extra_spending_overview", "تكاليف هذا الشهر أو هذا العام أو كل الوقت أو نطاق تاريخي: التكلفة الأساسية، وفي Pro وTeam الشحن ورسوم المنصّات وضريبة القيمة المضافة / الضرائب والتكاليف المخصّصة."]
      ],
      examples: [
        "كم يتبقى للتحصيل على الطلبات المفتوحة؟",
        "كم أنفقت هذا العام على الشحن ورسوم المنصّات؟"
      ]
    },
    {
      title: "المصروفات البنكية",
      intro: "حركة حسابك البنكي التجاري، إذا كانت مساحة العمل متصلة بحساب (ميزة في Pro وTeam). يمكن للمالك وللأعضاء الذين مُنحوا وصول المصروفات البنكية قراءتها.",
      tools: [
        ["get_bank_spending_summary", "الإنفاق لشهر أو لعام: الإجماليات، والتغيّر عن الفترة السابقة، والفئات، وأهم التجّار، والاشتراكات."],
        ["search_bank_transactions", "يسرد المعاملات حسب التاجر أو التاريخ أو الفئة أو المبلغ أو غياب الإيصال."],
        ["attach_bank_receipt", "يمنحك رابط NivaDesk صالحًا لمرة واحدة ولمدة 15 دقيقة لرفع إيصال لمعاملة واحدة. تختار الملف وترفعه في صفحة البنك في NivaDesk وأنت مسجّل الدخول؛ لا يمر أي ملف عبر Claude. للمالك فقط."]
      ],
      examples: [
        "كم أنفقت في سبتمبر، وعلى ماذا؟",
        "أي مدفوعات البطاقة هذا الشهر لا يوجد لها إيصال بعد؟"
      ]
    },
    {
      title: "المخزون",
      intro: "مخزونك كما يسجّله NivaDesk.",
      tools: [
        ["search_inventory", "يبحث في المخزون حسب الاسم أو SKU أو الرقم التسلسلي أو العلامة التجارية أو الطراز أو الفئة أو الموقع، ويصفّي حسب الحالة أو انخفاض المخزون أو الحجز."]
      ],
      examples: [
        "ما الذي يوشك على النفاد؟",
        "هل لدينا أحزمة جلدية بعرض 18 مم في الورشة؟"
      ]
    }
  ],
  safetyTitle: "الصلاحيات والأمان",
  safetyIntro: "يفعل الموصّل ما يمكنك أنت فعله في NivaDesk بالحساب نفسه، ولا شيء أكثر.",
  safety: [
    ["القواعد نفسها كما في التطبيق", "يُفحص كل استدعاء على خوادم NivaDesk وفق دورك ومفاتيح وصولك وخطتك قبل قراءة أو كتابة أي شيء. لا يستطيع Claude رؤية مساحة عمل أخرى ولا الملاحظات الشخصية لعضو آخر."],
    ["أنواع الأدوات والتأكيدات", "تعلن كل أداة ما إذا كانت تقرأ فقط، أو تضيف شيئًا جديدًا، أو تغيّر بيانات موجودة أو تستبدلها (تغيير حالة طلب، إضافة ملاحظة إلى طلب، الإضافة إلى ملاحظة أو تعديلها أو تثبيتها أو أرشفتها). أما ما إذا كان Claude يسأل قبل تشغيل أداة فيعتمد على إعدادات Claude واختياراتك، ولا يتحكم NivaDesk في ذلك. وتُطبَّق صلاحيات NivaDesk نفسه — خطتك ودورك ووصولك إلى مساحة العمل — على خوادمه في كل استدعاء أيًا كانت إعدادات Claude."],
    ["رسائل إلى العملاء", "قد يؤدي تغيير حالة الطلب إلى إرسال بريد إلكتروني إلى عميلك إذا كانت إشعارات مساحة عملك مفعّلة لذلك الطلب. يُبلَّغ Claude بذلك، وهي الرسالة نفسها التي كان التطبيق سيرسلها."],
    ["لا حذف ولا تحريك للأموال", "لا توجد أداة تحذف الطلبات أو الملاحظات أو العملاء أو البيانات البنكية، ويمكن التراجع عن أرشفة الملاحظة. لا يستطيع الموصّل إجراء مدفوعات أو استردادات أو تحويلات."],
    ["الحدود", "تُرجع عمليات البحث عددًا محدودًا من النتائج، وما يقرؤه Claude هو البيانات التي تحتاجها إجابتك، لا نسخة من مساحة عملك."]
  ],
  dataTitle: "بياناتك",
  data: [
    ["ما يتلقاه Claude", "نتائج الأدوات التي يستدعيها Claude لأجلك فقط، مثل الطلبات المطابقة لبحث ما. تصبح هذه النتائج جزءًا من محادثتك مع Claude وتعالجها Anthropic وفق اتفاقك مع Anthropic وسياسة الخصوصية الخاصة بها."],
    ["ما يتلقاه NivaDesk", "استدعاءات الأدوات نفسها: أي أداة وبأي تفاصيل (مثل نص البحث أو حقول الطلب الجديد). لا يتلقى NivaDesk محادثتك مع Claude ولا ذاكرة Claude ولا ملفاتك في Claude. لا تمر الإيصالات عبر Claude أبدًا: ترفعها في صفحة NivaDesk نفسها."],
    ["ما يحتفظ به NivaDesk", "تُحفظ الطلبات والملاحظات والإيصالات التي تنشئها عبر Claude في مساحة عملك مثل غيرها. يسجّل NivaDesk أي أداة قرأت بيانات شخصية ومن استدعاها ومتى، من دون النتائج، ويحتفظ بسجلات الطلبات التقنية لمدة محدودة لأغراض الأمان."],
    ["لا يُستخدم للإعلانات", "لا يبيع NivaDesk بيانات الموصّل ولا يستخدمها للإعلان. توضّح سياسة الخصوصية مدة الاحتفاظ وحقوقك وكيفية التواصل معنا."]
  ],
  disconnectTitle: "قطع الاتصال",
  disconnect: [
    ["في Claude", "افتح Settings › Connectors واختر NivaDesk واقطع الاتصال. يتوقف Claude عن استدعاء NivaDesk نيابة عنك."],
    ["في NivaDesk (مالك مساحة العمل)", "افتح الإعدادات › التكاملات › Claude. يظهر هناك كل اتصال Claude وClaude Code. يُنهي Disconnect ذلك الاتصال وحده، ويُنهي Disconnect all كل اتصالات Claude بمساحة العمل دون أن يمس اتصالات ChatGPT. كلاهما يسري فورًا."]
  ],
  disconnectNote: "قطع الاتصال لا يحذف أي شيء أنشأته عبر Claude: تبقى تلك الطلبات والملاحظات في مساحة عملك حتى تحذفها في NivaDesk.",
  disconnectLink: "افتح الإعدادات › التكاملات",
  faqTitle: "أسئلة",
  faq: [
    ["هل بياناتي عامة لأن الموصّل عام؟", "لا. يمكن لأي شخص إضافة الموصّل، لكنه لا يعرض شيئًا حتى يسجّل أحدهم الدخول بحسابه الخاص في NivaDesk، ثم يعرض فقط ما يمكن لذلك الحساب رؤيته في مساحة العمل التي اختارها."],
    ["هل يعمل مع خطة Free؟", "نعم. في Free وStarter تُرجع أدوات المال الإجماليات الأساسية فقط، ولا توجد بيانات في الأدوات البنكية لأن حركة الحساب البنكي ميزة في Pro وTeam."],
    ["هل يمكن لفريقي استخدامه؟", "نعم، كل شخص بتسجيل دخوله الخاص إلى NivaDesk وبوصول دوره: عضو سير العمل فقط يرى الطلبات المسندة إليه فقط ولا يرى أي أرقام مالية."],
    ["هل يقطع ربط Claude اتصال ChatGPT؟", "لا. لكل مساعد اتصاله الخاص. ربط Claude أو تجديده أو قطعه لا يمس اتصال ChatGPT أو Claude Code، إلا إذا اخترت Disconnect all."],
    ["هل يستطيع Claude حذف الطلبات؟", "لا. لا توجد أداة حذف. يمكن لـ Claude إنشاء الطلبات وإضافة الملاحظات وتغيير الحالة؛ وتغيير الحالة مُعلَن كأداة إتلافية. أما ما إذا كان Claude يسأل قبل تشغيلها فيعتمد على إعدادات Claude لديك."],
    ["هل سيُتواصل مع عملائي؟", "فقط من خلال قواعد الإشعارات الخاصة بك في NivaDesk، عندما يغيّر Claude حالة طلب مفعّلة إشعاراته. لا يرسل Claude رسائل بأي طريقة أخرى."],
    ["بأي لغة يمكنني السؤال؟", "اسأل Claude بأي لغة يفهمها. تعود بيانات NivaDesk كما هي محفوظة في مساحة عملك."],
    ["حدث خطأ ما", "توضّح أخطاء الأدوات ما الذي رُفض ولماذا، مثل أن دورك لا يمكنه تحديث الطلبات. وإن لم يكن الأمر واضحًا، تواصل مع الدعم مع ذكر الوقت وما سألته."]
  ],
  contactTitle: "الدعم",
  contactBody: "أسئلة حول الموصّل، أو مشكلة في إجابة، أو مخاوف أمنية: افتح تذكرة من داخل NivaDesk أو راسلنا. أخبرنا تقريبًا متى حدث ذلك وما الذي سألت عنه Claude، ولا ترسل كلمات مرور.",
  trademark: "Claude علامة تجارية لشركة Anthropic, PBC. NivaDesk منتج مستقل لشركة EGGCRAFT LIMITED، وليس تابعًا لـ Anthropic ولا معتمدًا منها."
};

const HI: ClaudeHelpCopy = {
  eyebrow: "Claude कनेक्टर · सेटअप गाइड",
  heroTitle: "Claude के लिए NivaDesk: अपने ऑर्डर, नोट्स और आंकड़ों के बारे में पूछें",
  heroIntro: "NivaDesk कनेक्टर से Anthropic का AI सहायक Claude आपके NivaDesk वर्कस्पेस के साथ काम कर सकता है। आप अपने NivaDesk खाते से साइन इन करते हैं; इसके बाद Claude ऑर्डर, नोट्स, स्टॉक और वे आंकड़े देख सकता है जिन्हें देखने की अनुमति आपकी भूमिका को है, और आपके कहने पर ऑर्डर बना सकता है, नोट जोड़ सकता है या किसी ऑर्डर को नई स्थिति में ले जा सकता है। यह पेज बताता है कि इसे कौन इस्तेमाल कर सकता है, कैसे जोड़ें, हर टूल क्या करता है, सुरक्षा नियम क्या हैं और कनेक्शन कैसे हटाएं।",
  ctaConnect: "जोड़ने के चरण",
  ctaTools: "आप क्या पूछ सकते हैं",
  heroFacts: [
    "आपका अपना NivaDesk साइन-इन: कोई साझा कुंजी नहीं, कोई सार्वजनिक डेटा नहीं",
    "आपका प्लान, भूमिका और वर्कस्पेस अनुमतियां हर जवाब पर लागू होती हैं",
    "हर टूल बताता है कि वह पढ़ता है, जोड़ता है या डेटा बदलता है"
  ],
  mockLabel: "चित्रण: NivaDesk कनेक्टर का उपयोग करती Claude बातचीत",
  mockCaption: "उदाहरण डेटा वाला चित्रण। यह असली वर्कस्पेस नहीं है।",
  mockPrompt: "इस हफ्ते किन ऑर्डर की डिलीवरी है?",
  mockTool: "NivaDesk · ऑर्डर खोजें",
  mockReply: "इस हफ्ते तीन ऑर्डर देय हैं: नक्काशीदार अंगूठी (गुरुवार), फ्रेम किया प्रिंट (शुक्रवार) और केक टॉपर (शनिवार)। अंगूठी अभी बन रही है।",
  statusTitle: "उपलब्धता",
  statusLabel: "लाइव",
  statusBody: "NivaDesk कनेक्टर लाइव है। नीचे दिए पते से इसे Claude में कस्टम कनेक्टर (custom connector) के रूप में जोड़ें। Anthropic की Connectors Directory में सूची तैयार की जा रही है; वहां आने पर यह पेज बताएगा।",
  whoTitle: "कौन इस्तेमाल कर सकता है",
  whoIntro: "\"सार्वजनिक\" का मतलब है कि कोई भी कनेक्टर जोड़ सकता है। इसका मतलब कभी यह नहीं कि कोई भी डेटा पढ़ सकता है: हर कॉल साइन इन किए गए NivaDesk उपयोगकर्ता के रूप में, केवल उसके चुने हुए एक वर्कस्पेस में चलती है।",
  who: [
    ["एक NivaDesk खाता", "आप उसी ईमेल और पासवर्ड (या Google / Apple साइन-इन) से जुड़ते हैं जो आप NivaDesk में इस्तेमाल करते हैं। खाते के बिना जोड़ने को कुछ नहीं है; आप nivadesk.app पर खाता बना सकते हैं।"],
    ["कोई भी NivaDesk प्लान", "कनेक्टर हर प्लान पर काम करता है। यह क्या लौटा सकता है, यह ऐप की तरह आपके प्लान पर निर्भर है: Free और Starter पर रकम बुनियादी कुल होती हैं (प्राप्त, मूल लागत, मूल बैलेंस); Pro और Team में शिपिंग, प्लेटफ़ॉर्म शुल्क, VAT / टैक्स और अन्य लागतें जुड़ती हैं। प्लान की सीमाएं भी लागू होती हैं: Claude का बनाया ऑर्डर Free प्लान की सक्रिय ऑर्डर सीमा में गिना जाता है।"],
    ["वर्कस्पेस में आपकी भूमिका", "मालिक, एडमिन और सदस्य वही पढ़ और बदल सकते हैं जिसकी अनुमति उनकी पहुंच देती है। केवल-देखने वाले सदस्य पढ़ सकते हैं, पर ऑर्डर बना या बदल नहीं सकते। केवल-वर्कफ़्लो सदस्य सिर्फ़ अपने को सौंपे गए ऑर्डर देखते हैं और कोई रकम नहीं देखते। अगर मालिक ने आपके लिए ऑर्डर, डैशबोर्ड, वित्तीय जानकारी या बैंक खर्च बंद किए हैं, तो कनेक्टर को भी वही मना किया जाता है।"],
    ["कनेक्टर जोड़ सकने वाला Claude खाता", "कौन-से Claude प्लान और ऐप कनेक्टर जोड़ सकते हैं, और किसी Claude संगठन में कौन जोड़ सकता है, यह NivaDesk नहीं बल्कि Anthropic और आपका Claude एडमिन तय करते हैं।"]
  ],
  connectTitle: "NivaDesk को Claude से जोड़ें",
  connectSteps: [
    ["Claude में Connectors खोलें", "Claude में Settings › Connectors खोलें।"],
    ["NivaDesk खोजें", "डायरेक्टरी में NivaDesk खोजें। सूची लाइव होने तक Add custom connector चुनें और नीचे दिखाया कनेक्टर पता पेस्ट करें।"],
    ["NivaDesk में साइन इन करें", "Claude NivaDesk का साइन-इन पेज खोलता है। अपने NivaDesk खाते से साइन इन करें। NivaDesk आपका पासवर्ड कभी Claude को नहीं दिखाता; Claude को एक्सेस की अनुमति मिलती है, आपकी लॉगिन जानकारी नहीं।"],
    ["वर्कस्पेस चुनें", "अगर आप एक से ज़्यादा वर्कस्पेस में हैं, तो वह चुनें जिसे Claude इस्तेमाल कर सकता है। हर कॉल उसी वर्कस्पेस तक सीमित रहती है; दूसरे के लिए कनेक्शन हटाकर फिर से जोड़ें।"],
    ["पूछें", "Claude में लौटकर सामान्य भाषा में पूछें। Claude ज़रूरी NivaDesk टूल चुनता है और दिखाता है कि वह कौन-सा टूल चला रहा है।"]
  ],
  urlLabel: "कनेक्टर का पता",
  urlPending: "अभी प्रकाशित नहीं। Claude एंडपॉइंट लाइव होने पर पता यहां दिखेगा।",
  connectNotes: [
    "आप जुड़े रहते हैं: Claude पृष्ठभूमि में अपनी पहुंच नवीनीकृत करता है। दोबारा साइन इन तभी करना होता है जब कनेक्शन हटाया गया हो, वर्कस्पेस में आपकी पहुंच बदली हो, या 90 दिन तक इस्तेमाल न हुआ हो।",
    "कनेक्शन एक-दूसरे से स्वतंत्र हैं। Claude जोड़ने से ChatGPT या Claude Code नहीं हटते, और एक हटाने से बाकी चलते रहते हैं। हर व्यक्ति अपने खाते से जुड़ता है और उसे अपनी भूमिका की पहुंच मिलती है।"
  ],
  toolsTitle: "Claude NivaDesk के साथ क्या कर सकता है",
  toolsIntro: "कनेक्टर में 21 टूल हैं। हर टूल बताता है कि वह सिर्फ़ पढ़ता है, कुछ नया जोड़ता है, या मौजूदा रिकॉर्ड बदलता या उनकी जगह लिखता है (विनाशकारी चिह्नित)। टूल चलाने से पहले Claude आपसे पूछेगा या नहीं, यह Claude की अपनी सेटिंग्स और वहां आपके चुनावों पर निर्भर है; NivaDesk की अनुमतियां (प्लान, भूमिका, वर्कस्पेस पहुंच) हर हाल में हर कॉल पर उसके सर्वर पर लागू होती हैं।",
  modeRead: "पढ़ना",
  modeWrite: "लिखना",
  modeDestructive: "विनाशकारी",
  examplesLabel: "पूछकर देखें",
  groups: [
    {
      title: "ऑर्डर",
      intro: "आपके वर्कस्पेस के ऑर्डर और उनका वर्कफ़्लो, साथ ही जुड़े हुए बिक्री चैनलों से आए ऑर्डर।",
      tools: [
        ["search_orders", "ग्राहक, ईमेल, आइटम, स्थिति, ऑर्डर ID या किसी भी शब्द से ऑर्डर खोजता है।"],
        ["get_order_detail", "एक ऑर्डर पूरा पढ़ता है: ग्राहक, आइटम, तारीखें, स्थिति, आपकी भूमिका को दिखने वाले भुगतान और इतिहास।"],
        ["search_commerce_orders", "किसी भी जुड़े चैनल के ऑर्डर खोजता है और NivaDesk स्थिति के साथ चैनल की अपनी भुगतान और डिलीवरी स्थिति दिखाता है। कोई रकम नहीं।"],
        ["create_order", "आपके दिए ग्राहक, आइटम, विवरण, कीमत और नियत तारीख के साथ नया ऑर्डर बनाता है।"],
        ["add_order_note", "ऑर्डर के इतिहास में आंतरिक नोट जोड़ता है।"],
        ["update_order_status", "ऑर्डर की स्थिति या डिज़ाइन स्थिति बदलता है। बदलाव पर आपके वर्कस्पेस के सूचना नियम चलते हैं, इसलिए ग्राहक को ईमेल जा सकता है।"]
      ],
      examples: [
        "कौन-से ऑर्डर देर से चल रहे हैं, और किसके हैं?",
        "Sam Lee के लिए ऑर्डर बनाओ: फ्रेम किया प्रिंट, £85, आज £20 भुगतान, डिलीवरी 14 नवंबर।",
        "नक्काशीदार अंगूठी वाले ऑर्डर को Ready to Collect में ले जाओ।"
      ]
    },
    {
      title: "निजी नोट्स",
      intro: "NivaDesk में आपके अपने नोट्स, जिनमें दूसरों के साझा किए और आपके स्वीकार किए नोट्स भी शामिल हैं। दूसरों के नोट्स या ऑर्डर नोट्स नहीं।",
      tools: [
        ["search_notes", "टेक्स्ट या लेबल से आपके नोट्स खोजता है; संग्रहित और हटाए गए सिर्फ़ आपके कहने पर।"],
        ["get_note_detail", "एक नोट पूरा पढ़ता है।"],
        ["create_note", "शीर्षक, टेक्स्ट, लेबल, लिंक और रंग के साथ नोट बनाता है।"],
        ["append_note", "मौजूदा नोट के अंत में टेक्स्ट जोड़ता है।"],
        ["update_note", "नोट का शीर्षक, टेक्स्ट, लेबल, लिंक या रंग बदलता है।"],
        ["pin_note", "नोट को पिन या अनपिन करता है।"],
        ["archive_note", "नोट को संग्रहित करता है या वापस लाता है। कुछ भी हटाया नहीं जाता।"]
      ],
      examples: [
        "सप्लायर विज़िट वाला मेरा नोट ढूंढो और उसका सार बताओ।",
        "मेरी खरीदारी सूची वाले नोट में \"अखरोट की लकड़ी के ब्लैंक मंगाओ\" जोड़ो।"
      ]
    },
    {
      title: "पैसा",
      intro: "आपके ऑर्डर से आंकड़े, केवल तब जब आपकी भूमिका में वित्तीय जानकारी शामिल हो और केवल आपके प्लान की गहराई तक।",
      tools: [
        ["get_dashboard_summary", "आंकड़ों में डैशबोर्ड: सक्रिय और देय ऑर्डर, और वे वित्तीय कुल जो आप देख सकते हैं।"],
        ["get_order_financials", "एक ऑर्डर की वित्तीय जानकारी: कीमत, भुगतान, बाकी, और Pro व Team में लागत और टैक्स।"],
        ["get_financial_overview", "वर्कस्पेस के कुल: प्राप्त, बकाया, लागत और अनुमानित मुनाफ़ा।"],
        ["get_extra_spending_overview", "इस महीने, इस साल, अब तक या किसी तारीख सीमा की लागत: मूल लागत, और Pro व Team में शिपिंग, प्लेटफ़ॉर्म शुल्क, VAT / टैक्स और कस्टम लागत।"]
      ],
      examples: [
        "खुले ऑर्डर पर कितना भुगतान बाकी है?",
        "इस साल मैंने शिपिंग और प्लेटफ़ॉर्म शुल्क पर कितना खर्च किया?"
      ]
    },
    {
      title: "बैंक खर्च",
      intro: "आपके व्यवसाय बैंक खाते की फ़ीड, अगर वर्कस्पेस से जुड़ी है (Pro और Team सुविधा)। मालिक और बैंक खर्च की पहुंच वाले सदस्य इसे पढ़ सकते हैं।",
      tools: [
        ["get_bank_spending_summary", "एक महीने या साल का खर्च: कुल, पिछली अवधि से बदलाव, श्रेणियां, मुख्य व्यापारी और सदस्यताएं।"],
        ["search_bank_transactions", "व्यापारी, तारीख, श्रेणी, रकम या गायब रसीद के आधार पर लेनदेन की सूची देता है।"],
        ["attach_bank_receipt", "एक लेनदेन की रसीद अपलोड करने के लिए 15 मिनट तक मान्य, एक बार इस्तेमाल होने वाला NivaDesk लिंक देता है। फ़ाइल आप साइन इन रहते हुए NivaDesk के बैंक पेज पर चुनकर अपलोड करते हैं; कोई फ़ाइल Claude से होकर नहीं जाती। केवल मालिक।"]
      ],
      examples: [
        "सितंबर में मैंने कितना और किस पर खर्च किया?",
        "इस महीने के किन कार्ड भुगतानों की अभी रसीद नहीं है?"
      ]
    },
    {
      title: "इन्वेंटरी",
      intro: "आपका स्टॉक, जैसा NivaDesk में दर्ज है।",
      tools: [
        ["search_inventory", "नाम, SKU, सीरियल नंबर, ब्रांड, मॉडल, श्रेणी या स्थान से स्टॉक खोजता है; स्थिति, कम स्टॉक या आरक्षित के आधार पर छांटता है।"]
      ],
      examples: [
        "क्या खत्म होने वाला है?",
        "क्या वर्कशॉप में 18 mm के चमड़े के स्ट्रैप हैं?"
      ]
    }
  ],
  safetyTitle: "अनुमतियां और सुरक्षा",
  safetyIntro: "कनेक्टर वही करता है जो आप उसी खाते से NivaDesk में खुद कर सकते हैं, उससे ज़्यादा कुछ नहीं।",
  safety: [
    ["ऐप जैसे ही नियम", "कुछ भी पढ़ने या लिखने से पहले हर कॉल NivaDesk सर्वर पर आपकी भूमिका, पहुंच सेटिंग्स और प्लान के अनुसार जांची जाती है। Claude कोई दूसरा वर्कस्पेस या किसी दूसरे सदस्य के निजी नोट्स नहीं देख सकता।"],
    ["टूल के प्रकार और पुष्टि", "हर टूल बताता है कि वह सिर्फ़ पढ़ता है, कुछ नया जोड़ता है, या मौजूदा डेटा बदलता या उसकी जगह लिखता है (ऑर्डर की स्थिति बदलना, ऑर्डर में नोट जोड़ना, नोट में जोड़ना, उसे बदलना, पिन या संग्रहित करना)। टूल चलाने से पहले Claude पूछेगा या नहीं, यह Claude की अपनी सेटिंग्स और आपके चुनावों पर निर्भर है; इसे NivaDesk नियंत्रित नहीं करता। NivaDesk की अपनी अनुमतियां — आपका प्लान, आपकी भूमिका और वर्कस्पेस पहुंच — Claude की सेटिंग्स चाहे जो हों, हर कॉल पर उसके सर्वर पर लागू होती हैं।"],
    ["ग्राहकों को संदेश", "ऑर्डर की स्थिति बदलने पर ग्राहक को ईमेल जा सकता है, अगर उस ऑर्डर के लिए आपके वर्कस्पेस की सूचनाएं चालू हैं। Claude को यह बताया जाता है; यह वही संदेश है जो ऐप भेजता।"],
    ["कुछ भी हटाया नहीं जाता, पैसा नहीं चलता", "कोई भी टूल ऑर्डर, नोट्स, ग्राहक या बैंक डेटा नहीं हटाता; नोट का संग्रह वापस किया जा सकता है। कनेक्टर भुगतान, रिफ़ंड या ट्रांसफ़र नहीं कर सकता।"],
    ["सीमाएं", "खोज सीमित संख्या में नतीजे लौटाती है; Claude वही डेटा पढ़ता है जो जवाब के लिए ज़रूरी है, आपके वर्कस्पेस की प्रति नहीं।"]
  ],
  dataTitle: "आपका डेटा",
  data: [
    ["Claude को क्या मिलता है", "सिर्फ़ उन टूल के नतीजे जो Claude आपके लिए चलाता है, जैसे किसी खोज से मेल खाते ऑर्डर। ये नतीजे आपकी Claude बातचीत का हिस्सा बनते हैं और Anthropic उन्हें Anthropic के साथ आपके समझौते और उसकी गोपनीयता नीति के तहत संभालता है।"],
    ["NivaDesk को क्या मिलता है", "खुद टूल कॉल: कौन-सा टूल और किन विवरणों के साथ (जैसे खोज का टेक्स्ट या नए ऑर्डर के फ़ील्ड)। NivaDesk को Claude के साथ आपकी बातचीत, Claude की मेमोरी या Claude में आपकी फ़ाइलें नहीं मिलतीं। रसीदें कभी Claude से होकर नहीं जातीं: आप उन्हें NivaDesk के अपने पेज पर अपलोड करते हैं।"],
    ["NivaDesk क्या रखता है", "Claude से बनाए गए ऑर्डर, नोट्स और रसीदें बाकी सबकी तरह आपके वर्कस्पेस में सहेजी जाती हैं। NivaDesk दर्ज करता है कि किस टूल ने निजी डेटा पढ़ा, किसने और कब चलाया, नतीजों के बिना, और सुरक्षा के लिए तकनीकी अनुरोध लॉग सीमित समय तक रखता है।"],
    ["विज्ञापन के लिए नहीं", "NivaDesk कनेक्टर का डेटा नहीं बेचता और विज्ञापन के लिए इस्तेमाल नहीं करता। रखने की अवधि, आपके अधिकार और संपर्क का तरीका गोपनीयता नीति में बताया गया है।"]
  ],
  disconnectTitle: "कनेक्शन हटाएं",
  disconnect: [
    ["Claude में", "Settings › Connectors खोलें, NivaDesk चुनें और कनेक्शन हटाएं। Claude आपके लिए NivaDesk को कॉल करना बंद कर देता है।"],
    ["NivaDesk में (वर्कस्पेस मालिक)", "सेटिंग्स › इंटीग्रेशन › Claude खोलें। वहाँ हर Claude और Claude Code कनेक्शन दिखता है। Disconnect सिर्फ़ उस कनेक्शन को, और Disconnect all वर्कस्पेस के सभी Claude कनेक्शन को खत्म करता है; ChatGPT कनेक्शन पर असर नहीं पड़ता। दोनों तुरंत लागू होते हैं।"]
  ],
  disconnectNote: "कनेक्शन हटाने से Claude के ज़रिए बनाई कोई चीज़ नहीं हटती: वे ऑर्डर और नोट्स आपके वर्कस्पेस में तब तक रहते हैं जब तक आप उन्हें NivaDesk में नहीं हटाते।",
  disconnectLink: "सेटिंग्स › इंटीग्रेशन खोलें",
  faqTitle: "सवाल",
  faq: [
    ["कनेक्टर सार्वजनिक है, तो क्या मेरा डेटा भी सार्वजनिक है?", "नहीं। कोई भी कनेक्टर जोड़ सकता है, पर जब तक कोई अपने NivaDesk खाते से साइन इन नहीं करता, यह कुछ नहीं दिखाता, और फिर भी सिर्फ़ वही जो उस खाते को चुने हुए वर्कस्पेस में दिखता है।"],
    ["क्या यह Free प्लान पर चलता है?", "हां। Free और Starter पर पैसे वाले टूल सिर्फ़ बुनियादी कुल लौटाते हैं, और बैंक टूल में डेटा नहीं होता क्योंकि बैंक फ़ीड Pro और Team सुविधा है।"],
    ["क्या मेरी टीम इसे इस्तेमाल कर सकती है?", "हां, हर व्यक्ति अपने NivaDesk लॉगिन से और अपनी भूमिका की पहुंच के साथ: केवल-वर्कफ़्लो सदस्य सिर्फ़ अपने सौंपे गए ऑर्डर देखता है और कोई रकम नहीं।"],
    ["क्या Claude जोड़ने से ChatGPT हट जाता है?", "नहीं। हर सहायक का अपना कनेक्शन है। Claude को जोड़ना, नवीनीकृत करना या हटाना ChatGPT या Claude Code कनेक्शन को नहीं छूता, जब तक आप Disconnect all न चुनें।"],
    ["क्या Claude ऑर्डर हटा सकता है?", "नहीं। हटाने का कोई टूल नहीं है। Claude ऑर्डर बना सकता है, नोट जोड़ सकता है और स्थिति बदल सकता है; स्थिति बदलना विनाशकारी टूल के रूप में घोषित है। Claude उसे चलाने से पहले पूछेगा या नहीं, यह आपकी Claude सेटिंग्स पर निर्भर है।"],
    ["क्या मेरे ग्राहकों से संपर्क होगा?", "सिर्फ़ आपके अपने NivaDesk सूचना नियमों के ज़रिए, जब Claude ऐसे ऑर्डर की स्थिति बदले जिसकी सूचनाएं चालू हैं। Claude किसी और तरीके से संदेश नहीं भेजता।"],
    ["मैं कौन-सी भाषा इस्तेमाल कर सकता हूं?", "Claude से उसकी समझी जाने वाली किसी भी भाषा में पूछें। NivaDesk का डेटा वैसा ही लौटता है जैसा आपके वर्कस्पेस में सहेजा है।"],
    ["कुछ गड़बड़ हुई", "टूल की त्रुटियां बताती हैं कि क्या और क्यों मना हुआ, जैसे कि आपकी भूमिका ऑर्डर अपडेट नहीं कर सकती। स्पष्ट न हो तो समय और अपना सवाल बताकर सपोर्ट से संपर्क करें।"]
  ],
  contactTitle: "सहायता",
  contactBody: "कनेक्टर के बारे में सवाल, किसी जवाब में समस्या या सुरक्षा की चिंता: NivaDesk के अंदर से टिकट खोलें या हमें लिखें। लगभग कब हुआ और आपने Claude से क्या पूछा, यह बताएं; कृपया पासवर्ड न भेजें।",
  trademark: "Claude, Anthropic, PBC का ट्रेडमार्क है। NivaDesk, EGGCRAFT LIMITED का एक स्वतंत्र उत्पाद है और Anthropic से संबद्ध या उसके द्वारा समर्थित नहीं है।"
};

export const CLAUDE_HELP_COPY: Partial<Record<StudioLanguage, ClaudeHelpCopy>> & { English: ClaudeHelpCopy } = {
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
