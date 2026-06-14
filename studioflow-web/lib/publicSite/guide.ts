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
      { kind: "para", text: "Your home overview. It shows active orders, what is due soon and quick stats. Start your day here to see what needs attention." }
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
      }
    ]
  },
  {
    id: "client-files",
    title: "Client Files",
    blocks: [
      { kind: "para", text: "Attach PDFs and photos that belong to an order. It works offline — files are saved on the device and upload automatically when you are back online." }
    ]
  },
  {
    id: "tasks",
    title: "To Do / Tasks",
    blocks: [
      { kind: "para", text: "A checklist on each order with due dates, priorities and assignments, so nothing gets forgotten and everyone knows who does what." }
    ]
  },
  {
    id: "schedule",
    title: "Schedule & Alerts",
    blocks: [
      { kind: "para", text: "Set reminders with one-tap shortcuts (for example ‘ask for approval’ or ‘send invoice’). NivaDesk notifies you before something is due." }
    ]
  },
  {
    id: "tracking",
    title: "Shipment tracking",
    blocks: [
      { kind: "para", text: "Add a tracking number to an order for live delivery status, so you always know where a shipment is without leaving the app." }
    ]
  },
  {
    id: "quick-reply",
    title: "Quick Reply",
    blocks: [
      { kind: "para", text: "Saved message templates and channel buttons (such as WhatsApp or email) to contact clients quickly. Optional AI replies help you draft messages." }
    ]
  },
  {
    id: "customers",
    title: "Customers",
    blocks: [
      { kind: "para", text: "Your client list and their details, linked to their orders so you can find history and contact information in one place." }
    ]
  },
  {
    id: "messages",
    title: "Messages & Support",
    blocks: [
      { kind: "para", text: "Send an internal request to your workspace owner or admins, or open a support ticket to the NivaDesk team for app questions." }
    ]
  },
  {
    id: "team",
    title: "Team Access",
    blocks: [
      { kind: "para", text: "Invite your team and give each person a role." },
      { kind: "bullets", items: [
        "Roles: Member, View Only, Workflow Only, or your own custom role.",
        "Control exactly which menus, cards and settings each role can see.",
        "Assign specific projects to specific people."
      ] }
    ]
  },
  {
    id: "settings",
    title: "Settings",
    blocks: [
      { kind: "para", text: "Where you tailor NivaDesk to your business." },
      { kind: "bullets", items: [
        "Workflow Steps — edit stages and the industry description that shapes your workflow.",
        "Financial & tax rules, platform fee and currency.",
        "Safety & Uploads limits, WooCommerce sync, Data Management, Plan & Access and About."
      ] }
    ]
  },
  {
    id: "plan",
    title: "Plan & Billing",
    blocks: [
      { kind: "para", text: "See your current plan and what each plan includes. You can review Free/Demo, Lite, Pro and Team options here." }
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
      { kind: "para", text: "Ana özet ekranınız. Aktif siparişleri, yakında teslim edilecekleri ve hızlı istatistikleri gösterir. Güne buradan başlayıp neyin ilgi istediğini görün." }
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
      }
    ]
  },
  {
    id: "client-files",
    title: "Müşteri Dosyaları",
    blocks: [
      { kind: "para", text: "Bir siparişe ait PDF ve fotoğrafları ekleyin. Çevrimdışı çalışır — dosyalar cihaza kaydedilir ve bağlantı gelince otomatik yüklenir." }
    ]
  },
  {
    id: "tasks",
    title: "Yapılacaklar / Görevler",
    blocks: [
      { kind: "para", text: "Her siparişte tarihli, öncelikli ve atanabilir bir kontrol listesi; böylece hiçbir şey unutulmaz ve kimin ne yapacağı bellidir." }
    ]
  },
  {
    id: "schedule",
    title: "Plan ve Uyarılar",
    blocks: [
      { kind: "para", text: "Tek dokunuşla kısayollarla hatırlatıcı kurun (örneğin ‘onay iste’ veya ‘fatura gönder’). NivaDesk zamanı gelmeden sizi uyarır." }
    ]
  },
  {
    id: "tracking",
    title: "Kargo Takibi",
    blocks: [
      { kind: "para", text: "Bir siparişe takip numarası ekleyerek canlı teslimat durumunu görün; uygulamadan çıkmadan kargonun nerede olduğunu bilin." }
    ]
  },
  {
    id: "quick-reply",
    title: "Hızlı Yanıt (Quick Reply)",
    blocks: [
      { kind: "para", text: "Müşterilere hızlı ulaşmak için kayıtlı mesaj şablonları ve kanal butonları (WhatsApp, e-posta gibi). İsteğe bağlı AI yanıtları mesaj taslağı hazırlamaya yardım eder." }
    ]
  },
  {
    id: "customers",
    title: "Müşteriler",
    blocks: [
      { kind: "para", text: "Müşteri listeniz ve bilgileri; siparişlerine bağlı olduğu için geçmiş ve iletişim bilgilerini tek yerde bulursunuz." }
    ]
  },
  {
    id: "messages",
    title: "Mesajlar ve Destek",
    blocks: [
      { kind: "para", text: "Çalışma alanı sahibinize veya adminlere şirket içi istek gönderin ya da uygulama soruları için NivaDesk ekibine destek talebi açın." }
    ]
  },
  {
    id: "team",
    title: "Ekip Erişimi (Team Access)",
    blocks: [
      { kind: "para", text: "Ekibinizi davet edin ve herkese bir rol verin." },
      { kind: "bullets", items: [
        "Roller: Üye, Sadece Görüntüleme, Sadece İş Akışı veya kendi özel rolünüz.",
        "Her rolün hangi menü, kart ve ayarları göreceğini tam olarak kontrol edin.",
        "Belirli projeleri belirli kişilere atayın."
      ] }
    ]
  },
  {
    id: "settings",
    title: "Ayarlar (Settings)",
    blocks: [
      { kind: "para", text: "NivaDesk'i işinize göre özelleştirdiğiniz yer." },
      { kind: "bullets", items: [
        "İş Akışı Adımları — aşamaları ve iş akışınızı şekillendiren iş kolu açıklamasını düzenleyin.",
        "Finans ve vergi kuralları, platform ücreti ve para birimi.",
        "Güvenlik ve Yüklemeler limitleri, WooCommerce senkronu, Veri Yönetimi, Plan ve Erişim, Hakkında."
      ] }
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
