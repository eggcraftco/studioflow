import type { StudioLanguage } from "@/lib/studioflow/language";

// ---------------------------------------------------------------------------
// NivaDesk user guide (single-page overview)
//
// A short "what is it / where is it / how to use it" summary of every main
// menu. Written generally so it also fits the Mac, iPhone, iPad and Android
// apps — they share the same structure as the web app.
//
// Content is provided in English and Turkish. Other languages fall back to
// English. Page chrome (title, intro, "On this page") is localized to all 12.
//
// To extend: add an item to GUIDE_EN and the matching item to GUIDE_TR.
// ---------------------------------------------------------------------------

export type GuideItem = {
  id: string;
  title: string;
  body: string;
  points?: string[];
};

export const GUIDE_LAST_UPDATED = "June 2026";

const GUIDE_EN: GuideItem[] = [
  {
    id: "getting-started",
    title: "Getting started",
    body: "On first launch you pick your industry so NivaDesk can tailor the workflow to your craft. A Free Demo workspace lets you explore everything with sample data before you add your own."
  },
  {
    id: "dashboard",
    title: "Dashboard",
    body: "Your home overview. It shows active orders, what is due soon and quick stats. Start your day here to see what needs attention."
  },
  {
    id: "orders",
    title: "Orders",
    body: "The core list of every job. Use Add Project to create an order, then open it to manage the details. Move each order through its workflow stages as the work progresses."
  },
  {
    id: "order-detail",
    title: "Order detail",
    body: "Opening an order shows a set of cards you can show, hide and rearrange to suit how you work.",
    points: [
      "Workflow steps — stages tuned to your trade, with checkpoints like deposit cleared or client approved.",
      "Financials — see your real profit after platform fees and tax, not just the price.",
      "Client Files, Tasks, Notes and live Tracking, each in its own card."
    ]
  },
  {
    id: "client-files",
    title: "Client Files",
    body: "Attach PDFs and photos that belong to an order. It works offline — files are saved on the device and upload automatically when you are back online."
  },
  {
    id: "tasks",
    title: "To Do / Tasks",
    body: "A checklist on each order with due dates, priorities and assignments, so nothing gets forgotten and everyone knows who does what."
  },
  {
    id: "schedule",
    title: "Schedule & Alerts",
    body: "Set reminders with one-tap shortcuts (for example ‘ask for approval’ or ‘send invoice’). NivaDesk notifies you before something is due."
  },
  {
    id: "tracking",
    title: "Shipment tracking",
    body: "Add a tracking number to an order for live delivery status, so you always know where a shipment is without leaving the app."
  },
  {
    id: "quick-reply",
    title: "Quick Reply",
    body: "Saved message templates and channel buttons (such as WhatsApp or email) to contact clients quickly. Optional AI replies help you draft messages."
  },
  {
    id: "customers",
    title: "Customers",
    body: "Your client list and their details, linked to their orders so you can find history and contact information in one place."
  },
  {
    id: "messages",
    title: "Messages & Support",
    body: "Send an internal request to your workspace owner or admins, or open a support ticket to the NivaDesk team for app questions."
  },
  {
    id: "team",
    title: "Team Access",
    body: "Invite your team and give each person a role.",
    points: [
      "Roles: Member, View Only, Workflow Only, or your own custom role.",
      "Control exactly which menus, cards and settings each role can see.",
      "Assign specific projects to specific people."
    ]
  },
  {
    id: "settings",
    title: "Settings",
    body: "Where you tailor NivaDesk to your business.",
    points: [
      "Workflow Steps — edit stages and the industry description that shapes your workflow.",
      "Financial & tax rules, platform fee and currency.",
      "Safety & Uploads limits, WooCommerce sync, Data Management, Plan & Access and About."
    ]
  },
  {
    id: "plan",
    title: "Plan & Billing",
    body: "See your current plan and what each plan includes. You can review Free/Demo, Lite, Pro and Team options here."
  },
  {
    id: "language-theme",
    title: "Language & appearance",
    body: "Switch between 12 languages and choose light or dark mode from Settings. Your choice syncs across the apps."
  }
];

const GUIDE_TR: GuideItem[] = [
  {
    id: "getting-started",
    title: "Başlarken",
    body: "İlk açılışta iş kolunuzu seçersiniz; böylece NivaDesk iş akışını mesleğinize göre ayarlar. Ücretsiz Demo çalışma alanı, kendi verilerinizi eklemeden önce her şeyi örnek verilerle keşfetmenizi sağlar."
  },
  {
    id: "dashboard",
    title: "Panel (Dashboard)",
    body: "Ana özet ekranınız. Aktif siparişleri, yakında teslim edilecekleri ve hızlı istatistikleri gösterir. Güne buradan başlayıp neyin ilgi istediğini görün."
  },
  {
    id: "orders",
    title: "Siparişler (Orders)",
    body: "Tüm işlerinizin ana listesi. Add Project ile sipariş oluşturun, sonra açıp detayları yönetin. İş ilerledikçe her siparişi iş akışı aşamalarından geçirin."
  },
  {
    id: "order-detail",
    title: "Sipariş Detayı",
    body: "Bir siparişi açtığınızda, çalışma şeklinize göre gösterip gizleyebileceğiniz ve yeniden düzenleyebileceğiniz kartlar gelir.",
    points: [
      "İş akışı adımları — mesleğinize göre aşamalar; kapora alındı, müşteri onayladı gibi kontrol noktaları.",
      "Finans — sadece fiyatı değil, platform ücreti ve vergi sonrası gerçek kârınızı gösterir.",
      "Müşteri Dosyaları, Görevler, Notlar ve canlı Takip; her biri kendi kartında."
    ]
  },
  {
    id: "client-files",
    title: "Müşteri Dosyaları",
    body: "Bir siparişe ait PDF ve fotoğrafları ekleyin. Çevrimdışı çalışır — dosyalar cihaza kaydedilir ve bağlantı gelince otomatik yüklenir."
  },
  {
    id: "tasks",
    title: "Yapılacaklar / Görevler",
    body: "Her siparişte tarihli, öncelikli ve atanabilir bir kontrol listesi; böylece hiçbir şey unutulmaz ve kimin ne yapacağı bellidir."
  },
  {
    id: "schedule",
    title: "Plan ve Uyarılar",
    body: "Tek dokunuşla kısayollarla hatırlatıcı kurun (örneğin ‘onay iste’ veya ‘fatura gönder’). NivaDesk zamanı gelmeden sizi uyarır."
  },
  {
    id: "tracking",
    title: "Kargo Takibi",
    body: "Bir siparişe takip numarası ekleyerek canlı teslimat durumunu görün; uygulamadan çıkmadan kargonun nerede olduğunu bilin."
  },
  {
    id: "quick-reply",
    title: "Hızlı Yanıt (Quick Reply)",
    body: "Müşterilere hızlı ulaşmak için kayıtlı mesaj şablonları ve kanal butonları (WhatsApp, e-posta gibi). İsteğe bağlı AI yanıtları mesaj taslağı hazırlamaya yardım eder."
  },
  {
    id: "customers",
    title: "Müşteriler",
    body: "Müşteri listeniz ve bilgileri; siparişlerine bağlı olduğu için geçmiş ve iletişim bilgilerini tek yerde bulursunuz."
  },
  {
    id: "messages",
    title: "Mesajlar ve Destek",
    body: "Çalışma alanı sahibinize veya adminlere şirket içi istek gönderin ya da uygulama soruları için NivaDesk ekibine destek talebi açın."
  },
  {
    id: "team",
    title: "Ekip Erişimi (Team Access)",
    body: "Ekibinizi davet edin ve herkese bir rol verin.",
    points: [
      "Roller: Üye, Sadece Görüntüleme, Sadece İş Akışı veya kendi özel rolünüz.",
      "Her rolün hangi menü, kart ve ayarları göreceğini tam olarak kontrol edin.",
      "Belirli projeleri belirli kişilere atayın."
    ]
  },
  {
    id: "settings",
    title: "Ayarlar (Settings)",
    body: "NivaDesk'i işinize göre özelleştirdiğiniz yer.",
    points: [
      "İş Akışı Adımları — aşamaları ve iş akışınızı şekillendiren iş kolu açıklamasını düzenleyin.",
      "Finans ve vergi kuralları, platform ücreti ve para birimi.",
      "Güvenlik ve Yüklemeler limitleri, WooCommerce senkronu, Veri Yönetimi, Plan ve Erişim, Hakkında."
    ]
  },
  {
    id: "plan",
    title: "Plan ve Faturalandırma",
    body: "Mevcut planınızı ve her planın içeriğini görün. Free/Demo, Lite, Pro ve Team seçeneklerini buradan inceleyebilirsiniz."
  },
  {
    id: "language-theme",
    title: "Dil ve Görünüm",
    body: "Ayarlar'dan 12 dil arasında geçiş yapın ve açık/koyu temayı seçin. Tercihiniz uygulamalar arasında senkronlanır."
  }
];

type GuideChrome = {
  eyebrow: string;
  title: string;
  intro: string;
  onThisPage: string;
  lastUpdated: string;
};

const CHROME_FALLBACK: GuideChrome = {
  eyebrow: "User guide",
  title: "How to use NivaDesk",
  intro: "A short tour of every menu — where it is, what it does and how to use it. The apps share the same layout, so this works for Mac, iPhone, iPad, Android and web.",
  onThisPage: "On this page",
  lastUpdated: "Last updated"
};

const CHROME: Partial<Record<StudioLanguage, GuideChrome>> = {
  Türkçe: {
    eyebrow: "Kullanım kılavuzu",
    title: "NivaDesk nasıl kullanılır",
    intro: "Her menünün kısa turu — nerede, ne işe yarar ve nasıl kullanılır. Uygulamalar aynı düzeni paylaşır; bu kılavuz Mac, iPhone, iPad, Android ve web için geçerlidir.",
    onThisPage: "Bu sayfada",
    lastUpdated: "Son güncelleme"
  },
  Deutsch: {
    eyebrow: "Benutzerhandbuch",
    title: "So nutzen Sie NivaDesk",
    intro: "Eine kurze Tour durch jedes Menü — wo es ist, was es tut und wie man es nutzt. Die Apps teilen sich dasselbe Layout, daher gilt dies für Mac, iPhone, iPad, Android und Web.",
    onThisPage: "Auf dieser Seite",
    lastUpdated: "Zuletzt aktualisiert"
  },
  Français: {
    eyebrow: "Guide d'utilisation",
    title: "Comment utiliser NivaDesk",
    intro: "Un tour rapide de chaque menu — où il se trouve, à quoi il sert et comment l'utiliser. Les apps partagent la même structure, donc cela vaut pour Mac, iPhone, iPad, Android et web.",
    onThisPage: "Sur cette page",
    lastUpdated: "Dernière mise à jour"
  },
  Italiano: {
    eyebrow: "Guida utente",
    title: "Come usare NivaDesk",
    intro: "Un breve tour di ogni menu — dov'è, cosa fa e come si usa. Le app condividono lo stesso layout, quindi vale per Mac, iPhone, iPad, Android e web.",
    onThisPage: "In questa pagina",
    lastUpdated: "Ultimo aggiornamento"
  },
  "Español (Spanish)": {
    eyebrow: "Guía de uso",
    title: "Cómo usar NivaDesk",
    intro: "Un recorrido breve por cada menú: dónde está, qué hace y cómo usarlo. Las apps comparten el mismo diseño, así que sirve para Mac, iPhone, iPad, Android y web.",
    onThisPage: "En esta página",
    lastUpdated: "Última actualización"
  },
  Português: {
    eyebrow: "Guia do utilizador",
    title: "Como usar o NivaDesk",
    intro: "Um breve tour por cada menu — onde está, o que faz e como usar. As apps partilham o mesmo layout, por isso serve para Mac, iPhone, iPad, Android e web.",
    onThisPage: "Nesta página",
    lastUpdated: "Última atualização"
  },
  "Русский (Russian)": {
    eyebrow: "Руководство пользователя",
    title: "Как пользоваться NivaDesk",
    intro: "Краткий обзор каждого меню — где оно, что делает и как им пользоваться. Приложения имеют одинаковую структуру, поэтому это подходит для Mac, iPhone, iPad, Android и веба.",
    onThisPage: "На этой странице",
    lastUpdated: "Последнее обновление"
  },
  "日本語 (Japanese)": {
    eyebrow: "ユーザーガイド",
    title: "NivaDesk の使い方",
    intro: "各メニューの簡単なツアー — どこにあり、何をして、どう使うか。アプリは同じレイアウトなので、Mac、iPhone、iPad、Android、ウェブで共通です。",
    onThisPage: "このページの内容",
    lastUpdated: "最終更新日"
  },
  "中文 (Chinese)": {
    eyebrow: "用户指南",
    title: "如何使用 NivaDesk",
    intro: "每个菜单的简要导览——在哪里、有什么用、怎么用。各应用布局一致，因此适用于 Mac、iPhone、iPad、Android 和网页。",
    onThisPage: "本页内容",
    lastUpdated: "最后更新"
  },
  "العربية (Arabic)": {
    eyebrow: "دليل المستخدم",
    title: "كيفية استخدام NivaDesk",
    intro: "جولة قصيرة في كل قائمة — أين هي وما وظيفتها وكيفية استخدامها. تشترك التطبيقات في التخطيط نفسه، لذا ينطبق هذا على Mac وiPhone وiPad وAndroid والويب.",
    onThisPage: "في هذه الصفحة",
    lastUpdated: "آخر تحديث"
  },
  "हिन्दी (Hindi)": {
    eyebrow: "उपयोगकर्ता गाइड",
    title: "NivaDesk का उपयोग कैसे करें",
    intro: "हर मेन्यू का संक्षिप्त दौरा — कहाँ है, क्या करता है और कैसे उपयोग करें। ऐप्स एक ही लेआउट साझा करते हैं, इसलिए यह Mac, iPhone, iPad, Android और वेब पर लागू होता है।",
    onThisPage: "इस पेज पर",
    lastUpdated: "अंतिम अपडेट"
  }
};

export function getGuideItems(language: StudioLanguage | string | null | undefined): GuideItem[] {
  return (language as StudioLanguage) === "Türkçe" ? GUIDE_TR : GUIDE_EN;
}

export function getGuideChrome(language: StudioLanguage | string | null | undefined): GuideChrome {
  return CHROME[language as StudioLanguage] ?? CHROME_FALLBACK;
}
