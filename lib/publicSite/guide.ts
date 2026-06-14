import type { StudioLanguage } from "@/lib/studioflow/language";

// ---------------------------------------------------------------------------
// NivaDesk user guide (interactive, menu-by-menu)
//
// The guide is a docs-style tree: the left column lists every menu (and, for
// Orders, every detail card). Selecting an entry shows its detailed content on
// the right. We build it out menu by menu.
//
// Content is provided in English and Turkish; other languages fall back to
// English. Page chrome is localized to all 12 languages.
//
// Each node's `blocks` render in order. Block kinds:
//   { kind: "para",    text }        a paragraph
//   { kind: "sub",     text }        a small sub-heading
//   { kind: "bullets", items: [] }   a bullet list
//   { kind: "steps",   items: [] }   a numbered list
// A node may have `children` (e.g. Orders → its cards), shown nested in the nav.
// ---------------------------------------------------------------------------

export type GuideBlock =
  | { kind: "para"; text: string }
  | { kind: "sub"; text: string }
  | { kind: "bullets"; items: string[] }
  | { kind: "steps"; items: string[] };

export type GuideNode = {
  id: string;
  title: string;
  blocks: GuideBlock[];
  children?: GuideNode[];
};

export const GUIDE_LAST_UPDATED = "June 2026";

// --- English tree ----------------------------------------------------------

const TREE_EN: GuideNode[] = [
  {
    id: "getting-started",
    title: "Getting started",
    blocks: [
      { kind: "para", text: "On first launch you pick your industry so NivaDesk can tailor the workflow to your craft. A Free Demo workspace lets you explore everything with sample data before you add your own." }
    ]
  },
  {
    id: "dashboard",
    title: "Dashboard",
    blocks: [
      { kind: "para", text: "Your home overview. Start your day here to see what needs attention before you dive into individual orders." },
      { kind: "bullets", items: [
        "Quick stats on active orders, what is due soon and recent activity.",
        "Spot overdue or at-risk jobs early so they don't slip.",
        "Jump straight to an order that needs you."
      ] }
    ]
  },
  {
    id: "orders",
    title: "Orders",
    blocks: [
      { kind: "para", text: "Orders is the heart of NivaDesk — the list of every job you are working on. From here you create orders, find them quickly and open one to manage all of its details." },
      { kind: "sub", text: "The orders list" },
      { kind: "bullets", items: [
        "Add Project — create a new order. You give it a customer, a title and the basics; you can fill in the rest inside the order.",
        "Search — type a customer name, order number or keyword to jump straight to an order.",
        "Quick filters — narrow the list (for example only your assigned orders, or by stage) without losing the others.",
        "Sort — order the list by smart priority, newest, due date and more.",
        "Status badges — small colored tags on each card show production status at a glance; you can turn them off in settings.",
        "Open an order — tap a card to open its detail workspace."
      ] },
      { kind: "sub", text: "The order detail workspace" },
      { kind: "para", text: "Opening an order shows a set of cards — Preview, Order Summary, Financial Info, Client Files and more. Each card covers one part of the job. You decide which cards you see and how they are arranged." },
      { kind: "bullets", items: [
        "Show or hide any card so you only see what matters to you.",
        "Drag a card to reorder it; drag its edge to resize the height.",
        "Give a card a color (8 options) to make it stand out.",
        "Your layout is saved to your own user as a card profile — your teammates keep their own layouts, while the order content stays shared.",
        "Some cards let you Edit headings to rename, add or remove their sections and fields (covered on each card below)."
      ] },
      { kind: "para", text: "Select a card on the left to see exactly what it does and what you can change in it." }
    ],
    children: [
      {
        id: "card-preview",
        title: "Preview card",
        blocks: [
          { kind: "para", text: "The Preview card is the visual header of the order. It shows the order image and your business logo, giving you and your client an instant sense of the job." },
          { kind: "sub", text: "What you can do" },
          { kind: "bullets", items: [
            "Add or replace the order preview image (for example a photo of the product, design or repair).",
            "The image also appears next to the order in the Orders list and on the exported PDF, so it is worth adding a clear photo.",
            "Preview images accept standard image files (JPG, PNG, HEIC and similar)."
          ] },
          { kind: "para", text: "Tip: a good preview photo makes orders far easier to recognize at a glance in a busy list." }
        ]
      },
      {
        id: "card-summary",
        title: "Order Summary card",
        blocks: [
          { kind: "para", text: "The Order Summary card is your at-a-glance status panel — the key numbers, stages and dates you check most often, all in one place." },
          { kind: "sub", text: "What it shows" },
          { kind: "bullets", items: [
            "Order Value — the total value of the order. If your role cannot see finances it shows ‘Hidden’ instead.",
            "Two status steps — the two most important stages of the job (for example design and production), each with a colored badge that reflects its current status.",
            "Placed On — the date the order was started.",
            "Delivery In — a live countdown to the delivery date that turns red when the order is due soon or overdue."
          ] },
          { kind: "sub", text: "What you can change" },
          { kind: "bullets", items: [
            "Use Edit headings to choose which two status steps appear here and rename their labels to match your own workflow.",
            "The status badges and the Delivery In color update automatically as the order progresses, so the card always reflects the real state."
          ] }
        ]
      },
      {
        id: "card-customer",
        title: "Customer & Communication card",
        blocks: [
          { kind: "para", text: "This card holds who the order is for and how to reach them — the customer's details and your communication channels, all editable in place." },
          { kind: "sub", text: "What it shows" },
          { kind: "bullets", items: [
            "Customer Name and Design Name.",
            "Any custom fields you add — for example a reference number, an Instagram handle or a project code.",
            "A Communication section with Telephone, Email and Address.",
            "Channel buttons such as Instagram, WhatsApp or TikTok for quick contact."
          ] },
          { kind: "para", text: "Tap any value to edit it in place (if your role can edit order details)." },
          { kind: "sub", text: "What you can change" },
          { kind: "bullets", items: [
            "Use Edit headings to add, rename or remove your own custom fields.",
            "Show or hide Telephone, Email and Address.",
            "Add, rename or remove channel buttons. Telephone and Email stay as their own fields and can be shown or hidden separately."
          ] }
        ]
      },
      {
        id: "card-materials",
        title: "Materials & Inventory card",
        blocks: [
          { kind: "para", text: "Track the parts and materials a job needs — whether each one is sourced, received and ready — so you never start work missing something." },
          { kind: "sub", text: "What it shows" },
          { kind: "bullets", items: [
            "A yes/no checklist of material steps. The default labels come from your workspace Inventory Labels (set in Settings), for example ‘Dial Sourced’, ‘Dial Received’ or ‘Materials Ready’.",
            "Optional extra yes/no toggles for anything else you want to track on this order.",
            "A Notes / Supplier field for supplier details or a quick note."
          ] },
          { kind: "para", text: "Tap a row to flip it between yes and no as materials arrive." },
          { kind: "sub", text: "What you can change" },
          { kind: "bullets", items: [
            "Use Edit headings to add, rename or remove checklist items and extra toggles.",
            "Show or hide the Notes / Supplier field and rename its label.",
            "The default checklist labels follow your workspace Inventory Labels in Settings, so changing them there updates every order."
          ] }
        ]
      },
      {
        id: "card-priority",
        title: "Priority / Risk card",
        blocks: [
          { kind: "para", text: "Flag how urgent an order is and whether anything is holding it up, so the team can focus on what matters and spot stuck jobs early." },
          { kind: "sub", text: "What it shows" },
          { kind: "bullets", items: [
            "Priority — Low, Normal, High or Urgent. High and Urgent stand out in the Orders list so they are easy to catch.",
            "Risk — None, Waiting, Blocked or Overdue, to mark a job that cannot move forward right now.",
            "Risk reason — appears once Risk is set to anything other than None. Choose why, for example Waiting for customer, Waiting for payment or Waiting for material."
          ] },
          { kind: "para", text: "Pick a value from each dropdown and it saves instantly. Priority and risk also feed the smart sort and the status badges in the Orders list, so flagged jobs rise to the top." }
        ]
      },
      {
        id: "card-delivery",
        title: "Timeline & Delivery card",
        blocks: [
          { kind: "para", text: "See the order's timeline at a glance and keep the delivery date front and center, so nothing is delivered late." },
          { kind: "sub", text: "What it shows" },
          { kind: "bullets", items: [
            "Created Date and Delivery Due, shown as two clear date cards.",
            "Time Remaining — the days left until delivery, color-coded so a tight or overdue deadline stands out.",
            "Add to Calendar — downloads an all-day calendar file spanning the created date to the delivery date, so the order appears in your calendar app (available from NivaDesk Lite)."
          ] },
          { kind: "sub", text: "What you can edit" },
          { kind: "bullets", items: [
            "Delivery Time (in days), the Delivery Due date and the Created Date — tap to change any of them.",
            "Time Remaining and all the colors recalculate automatically as soon as you change a date."
          ] }
        ]
      },
      {
        id: "card-notes",
        title: "Notes card",
        blocks: [
          { kind: "para", text: "Keep written notes about the order — instructions, decisions and reminders — in one place the whole workspace can see." },
          { kind: "sub", text: "What it shows" },
          { kind: "bullets", items: [
            "The main Customer Notes, which stays linked to the customer's profile.",
            "One or more Special Notes sections beneath it for anything specific to this order."
          ] },
          { kind: "sub", text: "What you can do" },
          { kind: "bullets", items: [
            "Type into any section — it saves automatically.",
            "Use the + button to add a note field to this order only, give it a title, and remove it when you no longer need it.",
            "Use Edit headings to add, rename or remove the Special Notes sections that appear on every order across the workspace."
          ] }
        ]
      },
      {
        id: "card-clientfiles",
        title: "Client Files card",
        blocks: [
          { kind: "para", text: "Attach the documents and images that belong to this order — proofs, designs, receipts, reference photos — so everything for the job lives with it." },
          { kind: "sub", text: "What you can do" },
          { kind: "bullets", items: [
            "Upload File — pick PDF, image, PSD or PSB files. You can also drag and drop files straight onto the card.",
            "Tap a file to preview it, or use Download all to grab everything at once.",
            "Delete a file if your role is allowed to.",
            "Works offline — files are saved on the device and upload automatically when you are back online."
          ] },
          { kind: "sub", text: "Safety" },
          { kind: "bullets", items: [
            "The maximum file size and the upload policy come from Settings ▸ Safety & Uploads.",
            "Where required, you tick to accept the upload policy on this browser before uploading."
          ] }
        ]
      },
      {
        id: "card-todo",
        title: "To Do card",
        blocks: [
          { kind: "para", text: "A task checklist for this specific order — break the job into steps, assign them and track what is done." },
          { kind: "sub", text: "What you can do" },
          { kind: "bullets", items: [
            "Add a task with the input, then give it a due date, a priority, an assignee and an optional note.",
            "Filter the list by All, Mine, Open, Overdue or Done to focus on what matters now.",
            "Mark a task Done or Reopen it, and delete tasks you no longer need."
          ] },
          { kind: "sub", text: "Good to know" },
          { kind: "bullets", items: [
            "The Overdue filter surfaces any task past its due date, so nothing slips.",
            "If your role is view-only, you can see tasks but cannot edit them."
          ] }
        ]
      },
      {
        id: "card-worktime",
        title: "Work Time card",
        blocks: [
          { kind: "para", text: "Track how much time you spend on an order, so you can see the real effort per job and price future work more accurately." },
          { kind: "sub", text: "What you can do" },
          { kind: "bullets", items: [
            "Give the work a title and start a timed session — the card shows ‘Running now’ while it counts.",
            "Stop a session when you pause, and Continue it later to keep adding to the same task.",
            "See the Total Work Time for the order, plus a list of every session.",
            "Delete a session you no longer need."
          ] }
        ]
      },
      {
        id: "card-financial",
        title: "Financial Info card",
        blocks: [
          { kind: "para", text: "The full money picture for the order — what was charged, what it costs you, the tax, and the real profit left over." },
          { kind: "sub", text: "What it shows" },
          { kind: "bullets", items: [
            "Order Value, Paid / Received and the Remaining balance, plus the payment method.",
            "Your costs: Base Cost, Platform Fee and Shipping Cost.",
            "Tax: VAT Rule, VAT Rate and VAT Amount, following the tax rules you set in Settings.",
            "Profit: Profit after VAT, Net Profit after Corporation Tax, and the Final Profit."
          ] },
          { kind: "sub", text: "What you can change" },
          { kind: "bullets", items: [
            "Use Edit headings to customize the Spending / Cost headings so they match how you track costs.",
            "The tax rate, rule and transition date come from Settings ▸ Financial and apply across your orders."
          ] },
          { kind: "para", text: "This card only appears for roles allowed to see finances; for everyone else the order's money stays hidden." }
        ]
      },
      {
        id: "card-status",
        title: "Production Status card",
        blocks: [
          { kind: "para", text: "Track where the order is in production — each stage of your workflow with its own status, so anyone can see progress at a glance." },
          { kind: "sub", text: "What it shows" },
          { kind: "bullets", items: [
            "One row per workflow step (for example Design, Production or Finishing), each set to a status such as Not Yet, In Progress, Done or Cancelled.",
            "The available status options come from your workspace and can be customized in Settings."
          ] },
          { kind: "sub", text: "What you can change" },
          { kind: "bullets", items: [
            "Use Edit headings to add, rename or remove the status steps so they match your craft's workflow.",
            "Changing a step here updates the colored status badges in the Orders list and the Order Summary card."
          ] }
        ]
      },
      {
        id: "card-shipping",
        title: "Shipping & Tracking card",
        blocks: [
          { kind: "para", text: "Manage delivery for the order — the courier, the tracking number, and live status updates, all without leaving the app." },
          { kind: "sub", text: "What you can do" },
          { kind: "bullets", items: [
            "Set the Courier (Auto Detect, Royal Mail, DHL, FedEx or UPS) and enter the Tracking number.",
            "Mark the order Dispatched and Delivered as it moves.",
            "Refresh live status to pull the latest delivery progress from 17TRACK, so you always know where a parcel is."
          ] },
          { kind: "sub", text: "Good to know" },
          { kind: "bullets", items: [
            "If the courier cannot be auto-detected, choose it manually and refresh again.",
            "Live tracking support depends on the courier; the system retries automatically and you can still check the courier's own website."
          ] }
        ]
      },
      {
        id: "card-schedule",
        title: "Schedule & Alerts card",
        blocks: [
          { kind: "para", text: "Set reminders tied to this order so important follow-ups — approvals, payments, client updates — never get forgotten." },
          { kind: "sub", text: "What you can do" },
          { kind: "bullets", items: [
            "Pick a Quick Reminder shortcut (for example Ask for approval, Send design update or Check payment) or type your own title.",
            "Set the date & time, a priority (Normal, High or Urgent) and an optional note. Turn on Notify to get a notification when it is due.",
            "See Upcoming reminders and Recently completed ones; Mark Done, or Snooze by 1 hour or 1 day."
          ] },
          { kind: "sub", text: "What you can change" },
          { kind: "bullets", items: [
            "Use Edit headings to customize the Quick Reminder shortcuts and their default timing so they match how you follow up."
          ] }
        ]
      },
      {
        id: "card-history",
        title: "History / Log card",
        blocks: [
          { kind: "para", text: "An automatic audit trail of the order — what changed and when — so you can always see how it reached its current state." },
          { kind: "sub", text: "What it shows" },
          { kind: "bullets", items: [
            "A list of recent important changes, newest first.",
            "Each entry shows what changed, the date and time, and the old value → the new value."
          ] },
          { kind: "sub", text: "Good to know" },
          { kind: "bullets", items: [
            "The log is read-only; it fills in automatically as people edit the order.",
            "History cards are available from NivaDesk Lite."
          ] }
        ]
      }
    ]
  },
  {
    id: "schedule",
    title: "Schedule",
    blocks: [
      { kind: "para", text: "A calendar-style view of everything that is due across the workspace — delivery dates and reminders from all your orders in one place." },
      { kind: "bullets", items: [
        "See upcoming deliveries and alerts together, so you can plan the week at a glance.",
        "Open any item to jump straight to its order.",
        "Reminders you set on an order's Schedule & Alerts card appear here too."
      ] }
    ]
  },
  {
    id: "notes",
    title: "Notes",
    blocks: [
      { kind: "para", text: "A single place to browse the notes attached to your orders, so you can find an instruction or decision without opening each order." },
      { kind: "bullets", items: [
        "Review customer notes and special notes across orders.",
        "Use it as a quick reference while you work."
      ] }
    ]
  },
  {
    id: "customers",
    title: "Customers",
    blocks: [
      { kind: "para", text: "Your client directory — every customer with their contact details and the orders linked to them." },
      { kind: "bullets", items: [
        "Add and edit customers, and keep their contact channels in one record.",
        "Open a customer to see their order history.",
        "Customer notes stay with the customer and show on each of their orders."
      ] }
    ]
  },
  {
    id: "files",
    title: "Files",
    blocks: [
      { kind: "para", text: "A library of every client file across all your orders — proofs, designs, PDFs and photos — in one searchable place." },
      { kind: "bullets", items: [
        "Browse, preview and download files without opening each order.",
        "Uploads follow the same size limit and upload policy set in Settings ▸ Safety & Uploads.",
        "Each order also has its own Client Files card for files that belong only to it."
      ] }
    ]
  },
  {
    id: "messages",
    title: "Messages",
    blocks: [
      { kind: "para", text: "Where you raise and track requests — both inside your workspace and to NivaDesk support." },
      { kind: "bullets", items: [
        "Workspace tickets — send a request to your workspace owner or admins (project questions, approvals, missing details).",
        "NivaDesk support tickets — report app bugs, billing or account questions to the NivaDesk team.",
        "Track replies and status on your own tickets in one list."
      ] }
    ]
  },
  {
    id: "quick-reply",
    title: "AI Replies / Quick Reply",
    blocks: [
      { kind: "para", text: "Build a library of ready-made messages so you can answer clients quickly and consistently." },
      { kind: "bullets", items: [
        "Save message templates for the things you send most often.",
        "Optional AI replies help you draft a message in your tone.",
        "Channel buttons (such as WhatsApp or email) let you reach a client straight from an order."
      ] }
    ]
  },
  {
    id: "team",
    title: "Team Access",
    blocks: [
      { kind: "para", text: "Invite your team and control exactly what each person can see and do. Reached from Settings ▸ Team Access." },
      { kind: "bullets", items: [
        "Give each member a role: Member, View Only, Workflow Only, or your own custom role.",
        "Control which menus, order cards and settings each role can see.",
        "Assign specific projects to specific people, and appoint support managers to handle workspace tickets."
      ] }
    ]
  },
  {
    id: "settings",
    title: "Settings",
    blocks: [
      { kind: "para", text: "Where you tailor NivaDesk to your business. The main sections:" },
      { kind: "bullets", items: [
        "Workflow Steps — your industry, its workflow description and the production stages.",
        "Financial — currency, platform fee, tax rules, rate and the VAT transition date.",
        "Safety & Uploads — maximum upload size, allowed file types and the upload policy.",
        "AI Replies, PDF Export and WooCommerce sync options.",
        "Data Management, Plan & Access, Team Access, Account and About."
      ] },
      { kind: "para", text: "Some settings are protected and only the owner or admins can change them." }
    ]
  },
  {
    id: "insights",
    title: "Insights",
    blocks: [
      { kind: "para", text: "A high-level view of how your workspace is doing — overview stats about orders, revenue and activity to help you spot trends." }
    ]
  },
  {
    id: "plan",
    title: "Plan & Billing",
    blocks: [
      { kind: "para", text: "See your current plan and what each plan includes. You can review the Free/Demo, Lite, Pro and Team options here." }
    ]
  },
  {
    id: "language-theme",
    title: "Language & appearance",
    blocks: [
      { kind: "para", text: "Switch between 12 languages and choose light or dark mode from Settings. Your choice syncs across the apps." }
    ]
  }
];

// --- Turkish tree -----------------------------------------------------------

const TREE_TR: GuideNode[] = [
  {
    id: "getting-started",
    title: "Başlarken",
    blocks: [
      { kind: "para", text: "İlk açılışta iş kolunuzu seçersiniz; böylece NivaDesk iş akışını mesleğinize göre ayarlar. Ücretsiz Demo çalışma alanı, kendi verilerinizi eklemeden önce her şeyi örnek verilerle keşfetmenizi sağlar." }
    ]
  },
  {
    id: "dashboard",
    title: "Panel (Dashboard)",
    blocks: [
      { kind: "para", text: "Ana özet ekranınız. Tek tek siparişlere dalmadan önce neyin ilgi istediğini görmek için güne buradan başlayın." },
      { kind: "bullets", items: [
        "Aktif siparişler, yakında teslim edilecekler ve son etkinlik hakkında hızlı istatistikler.",
        "Geciken veya riskli işleri erkenden fark edin; kaçmasınlar.",
        "Sizi bekleyen bir siparişe doğrudan gidin."
      ] }
    ]
  },
  {
    id: "orders",
    title: "Siparişler (Orders)",
    blocks: [
      { kind: "para", text: "Siparişler, NivaDesk'in kalbidir — üzerinde çalıştığınız tüm işlerin listesi. Buradan sipariş oluşturur, hızlıca bulur ve birini açıp tüm detaylarını yönetirsiniz." },
      { kind: "sub", text: "Sipariş listesi" },
      { kind: "bullets", items: [
        "Add Project — yeni sipariş oluşturur. Müşteri, başlık ve temel bilgileri verirsiniz; gerisini siparişin içinde doldurabilirsiniz.",
        "Arama — müşteri adı, sipariş numarası veya anahtar kelime yazarak doğrudan siparişe gidin.",
        "Hızlı filtreler — listeyi daraltın (örneğin yalnızca size atanan siparişler ya da aşamaya göre), diğerlerini kaybetmeden.",
        "Sıralama — listeyi akıllı önceliğe, en yeniye, teslim tarihine ve daha fazlasına göre sıralayın.",
        "Durum etiketleri — her kartta üretim durumunu bir bakışta gösteren küçük renkli etiketler; ayarlardan kapatabilirsiniz.",
        "Siparişi aç — bir karta dokunarak detay çalışma alanını açın."
      ] },
      { kind: "sub", text: "Sipariş detay çalışma alanı" },
      { kind: "para", text: "Bir siparişi açtığınızda Preview, Order Summary, Financial Info, Client Files ve daha fazlası gibi kartlar gelir. Her kart işin bir bölümünü kapsar. Hangi kartları göreceğinize ve nasıl dizileceğine siz karar verirsiniz." },
      { kind: "bullets", items: [
        "Herhangi bir kartı gösterin veya gizleyin; yalnızca size gerekenleri görün.",
        "Bir kartı sürükleyerek yerini değiştirin; kenarından sürükleyerek yüksekliğini ayarlayın.",
        "Bir karta renk verin (8 seçenek) ki öne çıksın.",
        "Yerleşiminiz kendi kullanıcınıza bir kart profili olarak kaydedilir — ekip arkadaşlarınız kendi yerleşimlerini korur, sipariş içeriği ise ortak kalır.",
        "Bazı kartlarda Başlıkları Düzenle ile bölümleri ve alanları yeniden adlandırabilir, ekleyebilir veya kaldırabilirsiniz (aşağıda her kartta anlatılıyor)."
      ] },
      { kind: "para", text: "Soldan bir kart seçin; tam olarak ne işe yaradığını ve içinde neleri değiştirebileceğinizi görün." }
    ],
    children: [
      {
        id: "card-preview",
        title: "Preview kartı",
        blocks: [
          { kind: "para", text: "Preview kartı, siparişin görsel başlığıdır. Sipariş görselini ve işletme logonuzu gösterir; hem size hem müşterinize işe dair anında bir fikir verir." },
          { kind: "sub", text: "Neler yapabilirsiniz" },
          { kind: "bullets", items: [
            "Sipariş önizleme görselini ekleyin veya değiştirin (örneğin ürünün, tasarımın ya da tamirin fotoğrafı).",
            "Görsel ayrıca Siparişler listesinde siparişin yanında ve dışa aktarılan PDF'te görünür; bu yüzden net bir fotoğraf eklemekte fayda var.",
            "Önizleme görselleri standart görsel dosyalarını kabul eder (JPG, PNG, HEIC ve benzeri)."
          ] },
          { kind: "para", text: "İpucu: iyi bir önizleme fotoğrafı, kalabalık bir listede siparişleri bir bakışta tanımayı çok kolaylaştırır." }
        ]
      },
      {
        id: "card-summary",
        title: "Order Summary kartı",
        blocks: [
          { kind: "para", text: "Order Summary (Sipariş Özeti) kartı, bir bakışta durum panelinizdir — en sık kontrol ettiğiniz temel rakamlar, aşamalar ve tarihler tek yerde." },
          { kind: "sub", text: "Neler gösterir" },
          { kind: "bullets", items: [
            "Order Value (Sipariş Değeri) — siparişin toplam değeri. Rolünüz finansı göremiyorsa bunun yerine ‘Hidden’ (Gizli) yazar.",
            "İki durum adımı — işin en önemli iki aşaması (örneğin tasarım ve üretim); her biri mevcut durumu yansıtan renkli bir rozetle.",
            "Placed On — siparişin başlatıldığı tarih.",
            "Delivery In — teslim tarihine canlı geri sayım; sipariş yaklaştığında veya geciktiğinde kırmızıya döner."
          ] },
          { kind: "sub", text: "Neleri değiştirebilirsiniz" },
          { kind: "bullets", items: [
            "Başlıkları Düzenle ile burada hangi iki durum adımının görüneceğini seçin ve etiketlerini kendi iş akışınıza göre yeniden adlandırın.",
            "Durum rozetleri ve Delivery In rengi sipariş ilerledikçe otomatik güncellenir; böylece kart her zaman gerçek durumu yansıtır."
          ] }
        ]
      },
      {
        id: "card-customer",
        title: "Customer & Communication kartı",
        blocks: [
          { kind: "para", text: "Bu kart, siparişin kime ait olduğunu ve müşteriye nasıl ulaşacağınızı tutar — müşteri bilgileri ve iletişim kanallarınız; hepsi yerinde düzenlenebilir." },
          { kind: "sub", text: "Neler gösterir" },
          { kind: "bullets", items: [
            "Customer Name (Müşteri Adı) ve Design Name (Tasarım Adı).",
            "Eklediğiniz özel alanlar — örneğin bir referans numarası, Instagram kullanıcı adı veya proje kodu.",
            "Telephone, Email ve Address içeren bir İletişim (Communication) bölümü.",
            "Hızlı iletişim için Instagram, WhatsApp veya TikTok gibi kanal butonları."
          ] },
          { kind: "para", text: "Herhangi bir değere dokunarak yerinde düzenleyin (rolünüz sipariş detaylarını düzenleyebiliyorsa)." },
          { kind: "sub", text: "Neleri değiştirebilirsiniz" },
          { kind: "bullets", items: [
            "Başlıkları Düzenle ile kendi özel alanlarınızı ekleyin, yeniden adlandırın veya kaldırın.",
            "Telephone, Email ve Address'i gösterin veya gizleyin.",
            "Kanal butonları ekleyin, yeniden adlandırın veya kaldırın. Telephone ve Email kendi alanları olarak kalır ve ayrıca gösterilip gizlenebilir."
          ] }
        ]
      },
      {
        id: "card-materials",
        title: "Materials & Inventory kartı",
        blocks: [
          { kind: "para", text: "Bir işin ihtiyaç duyduğu parça ve malzemeleri takip edin — her birinin tedarik edildi mi, geldi mi, hazır mı — böylece işe eksikle başlamazsınız." },
          { kind: "sub", text: "Neler gösterir" },
          { kind: "bullets", items: [
            "Malzeme adımlarının evet/hayır kontrol listesi. Varsayılan etiketler çalışma alanınızın Inventory Labels (Envanter Etiketleri) ayarından gelir; örneğin ‘Dial Sourced’, ‘Dial Received’ veya ‘Materials Ready’.",
            "Bu siparişte takip etmek istediğiniz başka her şey için isteğe bağlı ekstra evet/hayır geçişleri.",
            "Tedarikçi bilgisi veya kısa bir not için Notes / Supplier alanı."
          ] },
          { kind: "para", text: "Malzemeler geldikçe bir satıra dokunarak evet/hayır arasında değiştirin." },
          { kind: "sub", text: "Neleri değiştirebilirsiniz" },
          { kind: "bullets", items: [
            "Başlıkları Düzenle ile kontrol listesi öğelerini ve ekstra geçişleri ekleyin, yeniden adlandırın veya kaldırın.",
            "Notes / Supplier alanını gösterin veya gizleyin ve etiketini yeniden adlandırın.",
            "Varsayılan kontrol listesi etiketleri Settings'teki Envanter Etiketleri'ni izler; orada değiştirmek tüm siparişleri günceller."
          ] }
        ]
      },
      {
        id: "card-priority",
        title: "Priority / Risk kartı",
        blocks: [
          { kind: "para", text: "Bir siparişin ne kadar acil olduğunu ve onu bekleten bir şey olup olmadığını işaretleyin; böylece ekip önemli olana odaklanır ve takılan işleri erkenden fark eder." },
          { kind: "sub", text: "Neler gösterir" },
          { kind: "bullets", items: [
            "Priority (Öncelik) — Low, Normal, High veya Urgent. High ve Urgent, Siparişler listesinde öne çıkar; kolayca yakalanır.",
            "Risk — None, Waiting, Blocked veya Overdue; şu an ilerleyemeyen bir işi işaretlemek için.",
            "Risk reason (Risk nedeni) — Risk, None dışında bir şeye ayarlanınca görünür. Nedenini seçin; örneğin Waiting for customer, Waiting for payment veya Waiting for material."
          ] },
          { kind: "para", text: "Her açılır menüden bir değer seçin, anında kaydedilir. Öncelik ve risk ayrıca akıllı sıralamayı ve Siparişler listesindeki durum rozetlerini besler; işaretlenen işler en üste çıkar." }
        ]
      },
      {
        id: "card-delivery",
        title: "Timeline & Delivery kartı",
        blocks: [
          { kind: "para", text: "Siparişin zaman çizelgesini bir bakışta görün ve teslim tarihini hep ön planda tutun; böylece hiçbir şey geç teslim edilmez." },
          { kind: "sub", text: "Neler gösterir" },
          { kind: "bullets", items: [
            "Created Date (Oluşturulma) ve Delivery Due (Teslim Tarihi); iki net tarih kartı olarak.",
            "Time Remaining (Kalan Süre) — teslime kalan gün sayısı; sıkışık veya geçmiş bir son tarih öne çıksın diye renk kodlu.",
            "Add to Calendar — oluşturulma tarihinden teslim tarihine kadar uzanan tüm-gün bir takvim dosyası indirir; böylece sipariş takvim uygulamanızda görünür (NivaDesk Lite'tan itibaren)."
          ] },
          { kind: "sub", text: "Neleri düzenleyebilirsiniz" },
          { kind: "bullets", items: [
            "Delivery Time (gün olarak), Delivery Due tarihi ve Created Date — herhangi birine dokunup değiştirin.",
            "Bir tarihi değiştirir değiştirmez Kalan Süre ve tüm renkler otomatik yeniden hesaplanır."
          ] }
        ]
      },
      {
        id: "card-notes",
        title: "Notes kartı",
        blocks: [
          { kind: "para", text: "Sipariş hakkındaki yazılı notları — talimatlar, kararlar ve hatırlatmalar — tüm çalışma alanının görebileceği tek bir yerde tutun." },
          { kind: "sub", text: "Neler gösterir" },
          { kind: "bullets", items: [
            "Müşterinin profiline bağlı kalan ana Customer Notes (Müşteri Notu).",
            "Altında, bu siparişe özel her şey için bir veya daha fazla Special Notes (Özel Not) bölümü."
          ] },
          { kind: "sub", text: "Neler yapabilirsiniz" },
          { kind: "bullets", items: [
            "Herhangi bir bölüme yazın — otomatik kaydedilir.",
            "+ butonuyla yalnızca bu siparişe özel bir not alanı ekleyin, başlık verin ve gerek kalmayınca kaldırın.",
            "Başlıkları Düzenle ile çalışma alanındaki her siparişte görünen Special Notes bölümlerini ekleyin, yeniden adlandırın veya kaldırın."
          ] }
        ]
      },
      {
        id: "card-clientfiles",
        title: "Client Files kartı",
        blocks: [
          { kind: "para", text: "Bu siparişe ait belge ve görselleri — provalar, tasarımlar, fişler, referans fotoğraflar — ekleyin; böylece işe dair her şey onunla birlikte durur." },
          { kind: "sub", text: "Neler yapabilirsiniz" },
          { kind: "bullets", items: [
            "Upload File — PDF, görsel, PSD veya PSB dosyaları seçin. Dosyaları doğrudan kartın üzerine sürükleyip bırakabilirsiniz.",
            "Önizlemek için bir dosyaya dokunun veya Download all ile hepsini tek seferde indirin.",
            "Rolünüz izin veriyorsa bir dosyayı silin.",
            "Çevrimdışı çalışır — dosyalar cihaza kaydedilir ve bağlantı gelince otomatik yüklenir."
          ] },
          { kind: "sub", text: "Güvenlik" },
          { kind: "bullets", items: [
            "Maksimum dosya boyutu ve upload politikası Settings ▸ Safety & Uploads'tan gelir.",
            "Gerektiğinde, yüklemeden önce bu tarayıcıda upload politikasını kabul etmek için işaretlersiniz."
          ] }
        ]
      },
      {
        id: "card-todo",
        title: "To Do kartı",
        blocks: [
          { kind: "para", text: "Bu siparişe özel bir görev kontrol listesi — işi adımlara bölün, atayın ve neyin yapıldığını takip edin." },
          { kind: "sub", text: "Neler yapabilirsiniz" },
          { kind: "bullets", items: [
            "Giriş alanıyla bir görev ekleyin; sonra ona bitiş tarihi, öncelik, bir sorumlu ve isteğe bağlı bir not verin.",
            "Listeyi All, Mine, Open, Overdue veya Done'a göre filtreleyip şu an önemli olana odaklanın.",
            "Bir görevi Mark Done ile tamamlayın veya Reopen ile yeniden açın; gerekmeyen görevleri silin."
          ] },
          { kind: "sub", text: "Bilmekte fayda var" },
          { kind: "bullets", items: [
            "Overdue filtresi bitiş tarihini geçen görevleri öne çıkarır; böylece hiçbir şey kaçmaz.",
            "Rolünüz salt-görüntülemeyse görevleri görebilir ama düzenleyemezsiniz."
          ] }
        ]
      },
      {
        id: "card-worktime",
        title: "Work Time kartı",
        blocks: [
          { kind: "para", text: "Bir siparişe ne kadar zaman harcadığınızı takip edin; böylece iş başına gerçek emeği görür ve gelecekteki işleri daha doğru fiyatlandırırsınız." },
          { kind: "sub", text: "Neler yapabilirsiniz" },
          { kind: "bullets", items: [
            "Çalışmaya bir başlık verip zamanlı bir oturum başlatın — sayarken kartta ‘Running now’ görünür.",
            "Ara verdiğinizde oturumu Stop ile durdurun, sonra Continue ile aynı işe eklemeye devam edin.",
            "Sipariş için Total Work Time toplamını ve her oturumun listesini görün.",
            "Gerekmeyen bir oturumu silin."
          ] }
        ]
      },
      {
        id: "card-financial",
        title: "Financial Info kartı",
        blocks: [
          { kind: "para", text: "Siparişin tam para tablosu — ne tahsil edildi, size maliyeti ne, vergi ne kadar ve geriye kalan gerçek kâr." },
          { kind: "sub", text: "Neler gösterir" },
          { kind: "bullets", items: [
            "Order Value, Paid / Received ve kalan Remaining bakiyesi, ayrıca ödeme yöntemi.",
            "Maliyetleriniz: Base Cost, Platform Fee ve Shipping Cost.",
            "Vergi: Settings'te belirlediğiniz vergi kurallarına göre VAT Rule, VAT Rate ve VAT Amount.",
            "Kâr: Profit after VAT, Kurumlar Vergisi sonrası Net Profit ve Final Profit."
          ] },
          { kind: "sub", text: "Neleri değiştirebilirsiniz" },
          { kind: "bullets", items: [
            "Başlıkları Düzenle ile Spending / Cost başlıklarını maliyetleri izleme şeklinize göre özelleştirin.",
            "Vergi oranı, kuralı ve geçiş tarihi Settings ▸ Financial'dan gelir ve tüm siparişlerinize uygulanır."
          ] },
          { kind: "para", text: "Bu kart yalnızca finansı görmeye izinli rollerde görünür; diğer herkes için siparişin parası gizli kalır." }
        ]
      },
      {
        id: "card-status",
        title: "Production Status kartı",
        blocks: [
          { kind: "para", text: "Siparişin üretimde nerede olduğunu takip edin — iş akışınızın her aşaması kendi durumuyla; böylece herkes ilerlemeyi bir bakışta görür." },
          { kind: "sub", text: "Neler gösterir" },
          { kind: "bullets", items: [
            "İş akışındaki her adım için bir satır (örneğin Tasarım, Üretim veya Sonlandırma); her biri Not Yet, In Progress, Done veya Cancelled gibi bir duruma ayarlı.",
            "Kullanılabilir durum seçenekleri çalışma alanınızdan gelir ve Settings'ten özelleştirilebilir."
          ] },
          { kind: "sub", text: "Neleri değiştirebilirsiniz" },
          { kind: "bullets", items: [
            "Başlıkları Düzenle ile durum adımlarını mesleğinizin iş akışına uyacak şekilde ekleyin, yeniden adlandırın veya kaldırın.",
            "Buradan bir adımı değiştirmek, Siparişler listesindeki renkli durum rozetlerini ve Order Summary kartını günceller."
          ] }
        ]
      },
      {
        id: "card-shipping",
        title: "Shipping & Tracking kartı",
        blocks: [
          { kind: "para", text: "Siparişin teslimatını yönetin — kurye, takip numarası ve canlı durum güncellemeleri; hepsi uygulamadan çıkmadan." },
          { kind: "sub", text: "Neler yapabilirsiniz" },
          { kind: "bullets", items: [
            "Courier'i ayarlayın (Auto Detect, Royal Mail, DHL, FedEx veya UPS) ve Tracking numarasını girin.",
            "Sipariş ilerledikçe Dispatched ve Delivered olarak işaretleyin.",
            "Refresh live status ile 17TRACK'ten en güncel teslimat ilerlemesini çekin; böylece kargonun nerede olduğunu her zaman bilin."
          ] },
          { kind: "sub", text: "Bilmekte fayda var" },
          { kind: "bullets", items: [
            "Kurye otomatik algılanamazsa elle seçip tekrar yenileyin.",
            "Canlı takip desteği kuryeye bağlıdır; sistem otomatik tekrar dener, ayrıca kuryenin kendi sitesinden de kontrol edebilirsiniz."
          ] }
        ]
      },
      {
        id: "card-schedule",
        title: "Schedule & Alerts kartı",
        blocks: [
          { kind: "para", text: "Bu siparişe bağlı hatırlatıcılar kurun; böylece önemli takipler — onaylar, ödemeler, müşteri güncellemeleri — asla unutulmaz." },
          { kind: "sub", text: "Neler yapabilirsiniz" },
          { kind: "bullets", items: [
            "Bir Quick Reminder kısayolu seçin (örneğin Ask for approval, Send design update veya Check payment) ya da kendi başlığınızı yazın.",
            "Tarih & saat, bir öncelik (Normal, High veya Urgent) ve isteğe bağlı bir not belirleyin. Zamanı gelince bildirim almak için Notify'ı açın.",
            "Upcoming (yaklaşan) ve Recently completed (son tamamlanan) hatırlatıcıları görün; Mark Done yapın veya 1 saat ya da 1 gün Snooze edin."
          ] },
          { kind: "sub", text: "Neleri değiştirebilirsiniz" },
          { kind: "bullets", items: [
            "Başlıkları Düzenle ile Quick Reminder kısayollarını ve varsayılan zamanlamalarını, takip etme şeklinize uyacak biçimde özelleştirin."
          ] }
        ]
      },
      {
        id: "card-history",
        title: "History / Log kartı",
        blocks: [
          { kind: "para", text: "Siparişin otomatik bir değişiklik kaydı — neyin ne zaman değiştiği — böylece mevcut duruma nasıl geldiğini her zaman görebilirsiniz." },
          { kind: "sub", text: "Neler gösterir" },
          { kind: "bullets", items: [
            "Son önemli değişikliklerin listesi, en yeni en üstte.",
            "Her kayıt; neyin değiştiğini, tarih ve saati, ve eski değer → yeni değeri gösterir."
          ] },
          { kind: "sub", text: "Bilmekte fayda var" },
          { kind: "bullets", items: [
            "Kayıt salt-okunurdur; insanlar siparişi düzenledikçe otomatik dolar.",
            "History kartları NivaDesk Lite'tan itibaren kullanılabilir."
          ] }
        ]
      }
    ]
  },
  {
    id: "schedule",
    title: "Schedule (Takvim)",
    blocks: [
      { kind: "para", text: "Çalışma alanındaki tüm teslimleri ve hatırlatıcıları tek yerde gösteren takvim tarzı bir görünüm." },
      { kind: "bullets", items: [
        "Yaklaşan teslimatları ve uyarıları birlikte görün; haftayı bir bakışta planlayın.",
        "Herhangi bir öğeyi açıp doğrudan siparişine gidin.",
        "Bir siparişin Schedule & Alerts kartında kurduğunuz hatırlatıcılar burada da görünür."
      ] }
    ]
  },
  {
    id: "notes",
    title: "Notes (Notlar)",
    blocks: [
      { kind: "para", text: "Siparişlerinize ekli notları tek yerden gözden geçirin; bir talimatı veya kararı her siparişi açmadan bulun." },
      { kind: "bullets", items: [
        "Siparişler genelinde müşteri notlarını ve özel notları inceleyin.",
        "Çalışırken hızlı bir başvuru olarak kullanın."
      ] }
    ]
  },
  {
    id: "customers",
    title: "Customers (Müşteriler)",
    blocks: [
      { kind: "para", text: "Müşteri rehberiniz — her müşteri, iletişim bilgileri ve ona bağlı siparişlerle birlikte." },
      { kind: "bullets", items: [
        "Müşteri ekleyip düzenleyin ve iletişim kanallarını tek kayıtta tutun.",
        "Bir müşteriyi açıp sipariş geçmişini görün.",
        "Müşteri notları müşteriyle kalır ve onun her siparişinde görünür."
      ] }
    ]
  },
  {
    id: "files",
    title: "Files (Dosyalar)",
    blocks: [
      { kind: "para", text: "Tüm siparişlerinizdeki müşteri dosyalarının kütüphanesi — provalar, tasarımlar, PDF'ler ve fotoğraflar — tek aranabilir yerde." },
      { kind: "bullets", items: [
        "Dosyaları her siparişi açmadan tarayın, önizleyin ve indirin.",
        "Yüklemeler Settings ▸ Safety & Uploads'taki boyut limiti ve upload politikasını izler.",
        "Her siparişin ayrıca yalnızca kendisine ait dosyalar için kendi Client Files kartı vardır."
      ] }
    ]
  },
  {
    id: "messages",
    title: "Messages (Mesajlar)",
    blocks: [
      { kind: "para", text: "İstekleri açıp takip ettiğiniz yer — hem çalışma alanı içinde hem de NivaDesk desteğine." },
      { kind: "bullets", items: [
        "Workspace ticket — çalışma alanı sahibinize veya adminlere istek gönderin (proje soruları, onaylar, eksik bilgiler).",
        "NivaDesk support ticket — uygulama hataları, ödeme veya hesap sorularını NivaDesk ekibine bildirin.",
        "Kendi ticketlarınızdaki yanıtları ve durumu tek listede takip edin."
      ] }
    ]
  },
  {
    id: "quick-reply",
    title: "AI Replies / Quick Reply",
    blocks: [
      { kind: "para", text: "Müşterilere hızlı ve tutarlı yanıt vermek için hazır mesaj kütüphanesi oluşturun." },
      { kind: "bullets", items: [
        "En sık gönderdiğiniz şeyler için mesaj şablonları kaydedin.",
        "İsteğe bağlı AI yanıtları, kendi üslubunuzda mesaj taslağı hazırlamaya yardım eder.",
        "Kanal butonları (WhatsApp veya e-posta gibi) müşteriye doğrudan siparişten ulaşmanızı sağlar."
      ] }
    ]
  },
  {
    id: "team",
    title: "Team Access (Ekip Erişimi)",
    blocks: [
      { kind: "para", text: "Ekibinizi davet edin ve herkesin tam olarak neyi görüp yapabileceğini kontrol edin. Settings ▸ Team Access'ten erişilir." },
      { kind: "bullets", items: [
        "Her üyeye bir rol verin: Üye, Sadece Görüntüleme, Sadece İş Akışı veya kendi özel rolünüz.",
        "Her rolün hangi menü, sipariş kartı ve ayarları göreceğini kontrol edin.",
        "Belirli projeleri belirli kişilere atayın ve çalışma alanı ticketlarını yönetmek için support yöneticileri belirleyin."
      ] }
    ]
  },
  {
    id: "settings",
    title: "Settings (Ayarlar)",
    blocks: [
      { kind: "para", text: "NivaDesk'i işinize göre özelleştirdiğiniz yer. Ana bölümler:" },
      { kind: "bullets", items: [
        "Workflow Steps — iş kolunuz, iş akışı açıklaması ve üretim aşamaları.",
        "Financial — para birimi, platform ücreti, vergi kuralları, oran ve KDV geçiş tarihi.",
        "Safety & Uploads — maksimum yükleme boyutu, izin verilen dosya türleri ve upload politikası.",
        "AI Replies, PDF Export ve WooCommerce senkron seçenekleri.",
        "Data Management, Plan & Access, Team Access, Account ve About."
      ] },
      { kind: "para", text: "Bazı ayarlar korumalıdır ve yalnızca owner veya adminler değiştirebilir." }
    ]
  },
  {
    id: "insights",
    title: "Insights",
    blocks: [
      { kind: "para", text: "Çalışma alanınızın nasıl gittiğine dair üst düzey bir görünüm — siparişler, ciro ve etkinlik hakkında trendleri yakalamanıza yardımcı özet istatistikler." }
    ]
  },
  {
    id: "plan",
    title: "Plan ve Faturalandırma",
    blocks: [
      { kind: "para", text: "Mevcut planınızı ve her planın içeriğini görün. Free/Demo, Lite, Pro ve Team seçeneklerini buradan inceleyebilirsiniz." }
    ]
  },
  {
    id: "language-theme",
    title: "Dil ve Görünüm",
    blocks: [
      { kind: "para", text: "Ayarlar'dan 12 dil arasında geçiş yapın ve açık/koyu temayı seçin. Tercihiniz uygulamalar arasında senkronlanır." }
    ]
  }
];

// --- Localized page chrome --------------------------------------------------

type GuideChrome = {
  eyebrow: string;
  title: string;
  intro: string;
  menuLabel: string;
  lastUpdated: string;
};

const CHROME_FALLBACK: GuideChrome = {
  eyebrow: "User guide",
  title: "How to use NivaDesk",
  intro: "Pick a menu on the left to see what it does and how to use it, step by step. The apps share the same layout, so this works for Mac, iPhone, iPad, Android and web.",
  menuLabel: "Menus",
  lastUpdated: "Last updated"
};

const CHROME: Partial<Record<StudioLanguage, GuideChrome>> = {
  Türkçe: {
    eyebrow: "Kullanım kılavuzu",
    title: "NivaDesk nasıl kullanılır",
    intro: "Soldan bir menü seçin; ne işe yaradığını ve nasıl kullanılacağını adım adım görün. Uygulamalar aynı düzeni paylaşır; bu kılavuz Mac, iPhone, iPad, Android ve web için geçerlidir.",
    menuLabel: "Menüler",
    lastUpdated: "Son güncelleme"
  },
  Deutsch: {
    eyebrow: "Benutzerhandbuch",
    title: "So nutzen Sie NivaDesk",
    intro: "Wählen Sie links ein Menü, um zu sehen, was es tut und wie man es Schritt für Schritt nutzt. Die Apps teilen sich dasselbe Layout — für Mac, iPhone, iPad, Android und Web.",
    menuLabel: "Menüs",
    lastUpdated: "Zuletzt aktualisiert"
  },
  Français: {
    eyebrow: "Guide d'utilisation",
    title: "Comment utiliser NivaDesk",
    intro: "Choisissez un menu à gauche pour voir à quoi il sert et comment l'utiliser, étape par étape. Les apps partagent la même structure — pour Mac, iPhone, iPad, Android et web.",
    menuLabel: "Menus",
    lastUpdated: "Dernière mise à jour"
  },
  Italiano: {
    eyebrow: "Guida utente",
    title: "Come usare NivaDesk",
    intro: "Scegli un menu a sinistra per vedere cosa fa e come si usa, passo dopo passo. Le app condividono lo stesso layout — per Mac, iPhone, iPad, Android e web.",
    menuLabel: "Menu",
    lastUpdated: "Ultimo aggiornamento"
  },
  "Español (Spanish)": {
    eyebrow: "Guía de uso",
    title: "Cómo usar NivaDesk",
    intro: "Elige un menú a la izquierda para ver qué hace y cómo usarlo, paso a paso. Las apps comparten el mismo diseño — para Mac, iPhone, iPad, Android y web.",
    menuLabel: "Menús",
    lastUpdated: "Última actualización"
  },
  Português: {
    eyebrow: "Guia do utilizador",
    title: "Como usar o NivaDesk",
    intro: "Escolha um menu à esquerda para ver o que faz e como usar, passo a passo. As apps partilham o mesmo layout — para Mac, iPhone, iPad, Android e web.",
    menuLabel: "Menus",
    lastUpdated: "Última atualização"
  },
  "Русский (Russian)": {
    eyebrow: "Руководство пользователя",
    title: "Как пользоваться NivaDesk",
    intro: "Выберите меню слева, чтобы увидеть, что оно делает и как им пользоваться, шаг за шагом. Приложения имеют одинаковую структуру — для Mac, iPhone, iPad, Android и веба.",
    menuLabel: "Меню",
    lastUpdated: "Последнее обновление"
  },
  "日本語 (Japanese)": {
    eyebrow: "ユーザーガイド",
    title: "NivaDesk の使い方",
    intro: "左のメニューを選ぶと、その機能と使い方を順を追って確認できます。アプリは同じレイアウトなので、Mac、iPhone、iPad、Android、ウェブで共通です。",
    menuLabel: "メニュー",
    lastUpdated: "最終更新日"
  },
  "中文 (Chinese)": {
    eyebrow: "用户指南",
    title: "如何使用 NivaDesk",
    intro: "在左侧选择一个菜单，逐步了解它的用途和用法。各应用布局一致，因此适用于 Mac、iPhone、iPad、Android 和网页。",
    menuLabel: "菜单",
    lastUpdated: "最后更新"
  },
  "العربية (Arabic)": {
    eyebrow: "دليل المستخدم",
    title: "كيفية استخدام NivaDesk",
    intro: "اختر قائمة من اليسار لترى وظيفتها وكيفية استخدامها خطوة بخطوة. تشترك التطبيقات في التخطيط نفسه — لنظام Mac وiPhone وiPad وAndroid والويب.",
    menuLabel: "القوائم",
    lastUpdated: "آخر تحديث"
  },
  "हिन्दी (Hindi)": {
    eyebrow: "उपयोगकर्ता गाइड",
    title: "NivaDesk का उपयोग कैसे करें",
    intro: "बाईं ओर एक मेन्यू चुनें और देखें कि वह क्या करता है और चरण-दर-चरण कैसे उपयोग करें। ऐप्स एक ही लेआउट साझा करते हैं — Mac, iPhone, iPad, Android और वेब के लिए।",
    menuLabel: "मेन्यू",
    lastUpdated: "अंतिम अपडेट"
  }
};

export function getGuideTree(language: StudioLanguage | string | null | undefined): GuideNode[] {
  return (language as StudioLanguage) === "Türkçe" ? TREE_TR : TREE_EN;
}

export function getGuideChrome(language: StudioLanguage | string | null | undefined): GuideChrome {
  return CHROME[language as StudioLanguage] ?? CHROME_FALLBACK;
}
