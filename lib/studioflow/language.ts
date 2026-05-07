export const SUPPORTED_STUDIO_LANGUAGES = [
  "English",
  "Türkçe",
  "Deutsch",
  "Français",
  "Italiano",
  "Español (Spanish)",
  "Português",
  "Русский (Russian)",
  "日本語 (Japanese)",
  "中文 (Chinese)",
  "العربية (Arabic)",
  "हिन्दी (Hindi)"
] as const;

export type StudioLanguage = (typeof SUPPORTED_STUDIO_LANGUAGES)[number];

type TranslationTable = Record<string, Partial<Record<StudioLanguage, string>>>;

const WEB_TRANSLATIONS: TranslationTable = {
  Settings: {
    Türkçe: "Ayarlar",
    Deutsch: "Einstellungen",
    Français: "Paramètres",
    Italiano: "Impostazioni",
    "Español (Spanish)": "Ajustes",
    Português: "Configurações",
    "Русский (Russian)": "Настройки",
    "日本語 (Japanese)": "設定",
    "中文 (Chinese)": "设置",
    "العربية (Arabic)": "الإعدادات",
    "हिन्दी (Hindi)": "सेटिंग्स"
  },
  Orders: {
    Türkçe: "Siparişler",
    Deutsch: "Bestellungen",
    Français: "Commandes",
    Italiano: "Ordini",
    "Español (Spanish)": "Pedidos",
    Português: "Pedidos",
    "Русский (Russian)": "Заказы",
    "日本語 (Japanese)": "注文",
    "中文 (Chinese)": "订单",
    "العربية (Arabic)": "الطلبات",
    "हिन्दी (Hindi)": "आदेश"
  },
  Dashboard: {
    Türkçe: "Panel",
    Deutsch: "Dashboard",
    Français: "Tableau de bord",
    Italiano: "Pannello",
    "Español (Spanish)": "Panel",
    Português: "Painel",
    "Русский (Russian)": "Панель",
    "日本語 (Japanese)": "ダッシュボード",
    "中文 (Chinese)": "仪表板",
    "العربية (Arabic)": "لوحة القيادة",
    "हिन्दी (Hindi)": "डैशबोर्ड"
  },
  Schedule: {
    Türkçe: "Planlama",
    Deutsch: "Planung",
    Français: "Planning",
    Italiano: "Pianificazione",
    "Español (Spanish)": "Planificación",
    Português: "Planeamento",
    "Русский (Russian)": "Планирование",
    "日本語 (Japanese)": "スケジュール",
    "中文 (Chinese)": "计划",
    "العربية (Arabic)": "الجدول",
    "हिन्दी (Hindi)": "शेड्यूल"
  },
  Customers: {
    Türkçe: "Müşteriler",
    Deutsch: "Kunden",
    Français: "Clients",
    Italiano: "Clienti",
    "Español (Spanish)": "Clientes",
    Português: "Clientes",
    "Русский (Russian)": "Клиенты",
    "日本語 (Japanese)": "顧客",
    "中文 (Chinese)": "客户",
    "العربية (Arabic)": "العملاء",
    "हिन्दी (Hindi)": "ग्राहक"
  },
  "Quick Reply": {
    Türkçe: "Hızlı Yanıt",
    Deutsch: "Schnellantwort",
    Français: "Réponse Rapide",
    Italiano: "Risposta Rapida",
    "Español (Spanish)": "Respuesta Rápida",
    Português: "Resposta Rápida",
    "Русский (Russian)": "Быстрый Ответ",
    "日本語 (Japanese)": "クイック返信",
    "中文 (Chinese)": "快捷回复",
    "العربية (Arabic)": "رد سريع",
    "हिन्दी (Hindi)": "त्वरित उत्तर"
  },
  "Add Order": {
    Türkçe: "Sipariş Ekle",
    Deutsch: "Bestellung hinzufügen",
    Français: "Ajouter une commande",
    Italiano: "Aggiungi ordine",
    "Español (Spanish)": "Añadir pedido",
    Português: "Adicionar pedido",
    "Русский (Russian)": "Добавить заказ",
    "日本語 (Japanese)": "注文を追加",
    "中文 (Chinese)": "添加订单",
    "العربية (Arabic)": "إضافة طلب",
    "हिन्दी (Hindi)": "ऑर्डर जोड़ें"
  },
  "Month Net": { Türkçe: "Ay Net" },
  "Year Net": { Türkçe: "Yıl Net" },
  Hidden: { Türkçe: "Gizli" },
  "Creating...": { Türkçe: "Oluşturuluyor..." },
  Account: { Türkçe: "Hesap" },
  Theme: { Türkçe: "Tema" },
  "Theme selector": { Türkçe: "Tema seçici" },
  System: { Türkçe: "Sistem" },
  Light: { Türkçe: "Açık" },
  Dark: { Türkçe: "Koyu" },
  Branding: { Türkçe: "Marka" },
  "Theme & Branding": { Türkçe: "Tema ve Marka" },
  "Theme & Brand": { Türkçe: "Tema ve Marka" },
  "Brand Subtitle": { Türkçe: "Marka Alt Başlığı" },
  "Save Theme & Branding": { Türkçe: "Tema ve Markayı Kaydet" },
  "Theme & Branding settings saved.": { Türkçe: "Tema ve marka ayarları kaydedildi." },
  "Theme & Branding settings could not be saved.": { Türkçe: "Tema ve marka ayarları kaydedilemedi." },
  "Theme & Branding is read-only": { Türkçe: "Tema ve Marka salt okunur" },
  "Your current workspace role cannot edit Theme & Branding.": { Türkçe: "Mevcut workspace rolünüz Tema ve Marka bölümünü düzenleyemez." },
  "Workspace logo is managed from Account > Workspace Logo.": { Türkçe: "Workspace logosu Hesap > Workspace Logo bölümünden yönetilir." },
  "Language & Labels": { Türkçe: "Dil ve Etiketler" },
  "Workflow Steps": { Türkçe: "İş Akışı Adımları" },
  "PDF Export Settings": { Türkçe: "PDF Çıktı Ayarları" },
  "Quick Reply Settings": { Türkçe: "Hızlı Yanıt Ayarları" },
  "Financial Settings": { Türkçe: "Finansal Ayarlar" },
  "WooCommerce Integration": { Türkçe: "WooCommerce Entegrasyonu" },
  "Safety & Uploads": { Türkçe: "Güvenlik ve Yüklemeler" },
  "Data Management": { Türkçe: "Veri Yönetimi" },
  "Plan & Access": { Türkçe: "Plan ve Erişim" },
  "Team Access": { Türkçe: "Ekip Erişimi" },
  About: { Türkçe: "Hakkında" },
  "Choose a section to edit.": { Türkçe: "Düzenlemek için bir bölüm seçin." },
  "Logo, theme and branding.": { Türkçe: "Logo, tema ve marka." },
  "Language, currency and label text.": { Türkçe: "Dil, para birimi ve etiket metinleri." },
  "Order steps and custom fields.": { Türkçe: "Sipariş adımları ve özel alanlar." },
  "Invoice and PDF export options.": { Türkçe: "Fatura ve PDF çıktı seçenekleri." },
  "Quick reply templates.": { Türkçe: "Hızlı yanıt şablonları." },
  "Fees, tax and calculations.": { Türkçe: "Ücretler, vergi ve hesaplamalar." },
  "Live website orders and webhook setup.": { Türkçe: "Canlı web siparişleri ve webhook kurulumu." },
  "Upload rules, file limits and audit protection.": { Türkçe: "Yükleme kuralları, dosya limitleri ve denetim koruması." },
  "Import, export and backup.": { Türkçe: "İçe aktar, dışa aktar ve yedekle." },
  "Profile and sign-in security.": { Türkçe: "Profil ve giriş güvenliği." },
  "Billing, limits and feature access.": { Türkçe: "Faturalama, limitler ve özellik erişimi." },
  "Members, roles and workspace requests.": { Türkçe: "Üyeler, roller ve workspace istekleri." },
  "App information.": { Türkçe: "Uygulama bilgileri." },
  "Select Language": { Türkçe: "Dil Seç" },
  Language: { Türkçe: "Dil" },
  "Save Language Settings": { Türkçe: "Dil Ayarlarını Kaydet" },
  Saving: { Türkçe: "Kaydediliyor" },
  "Saving...": { Türkçe: "Kaydediliyor..." },
  "Language settings saved.": { Türkçe: "Dil ayarları kaydedildi." },
  "Language settings could not be saved.": { Türkçe: "Dil ayarları kaydedilemedi." },
  "Language settings are read-only": { Türkçe: "Dil ayarları salt okunur" },
  Locked: { Türkçe: "Kilitli" },
  "Your current workspace role cannot edit Language & Labels.": { Türkçe: "Mevcut workspace rolünüz Dil ve Etiketler bölümünü düzenleyemez." },
  "This saves to the same app-compatible language key used by StudioFlow: seciliDil.": {
    Türkçe: "Bu ayar StudioFlow app ile aynı dil anahtarına kaydedilir: seciliDil."
  },
  "Settings error": { Türkçe: "Ayar hatası" },
  "Could not load workspace settings": { Türkçe: "Workspace ayarları yüklenemedi" },
  "Workspace is still loading. Please try again in a moment.": { Türkçe: "Workspace hâlâ yükleniyor. Birazdan tekrar deneyin." },
  "View Only and Workflow Only roles cannot create full orders.": { Türkçe: "View Only ve Workflow Only rolleri tam sipariş oluşturamaz." },
  "Creating orders is not available on this workspace plan.": { Türkçe: "Bu workspace planında sipariş oluşturma yok." },
  "Could not create the order. Please try again.": { Türkçe: "Sipariş oluşturulamadı. Lütfen tekrar deneyin." },
  "Show financial totals": { Türkçe: "Finansal toplamları göster" },
  "Hide financial totals": { Türkçe: "Finansal toplamları gizle" },
  "Offline mode": { Türkçe: "Offline mod" },
  "Syncing changes": { Türkçe: "Değişiklikler senkronlanıyor" },
  "Saving to cloud": { Türkçe: "Buluta kaydediliyor" },
  "Saved to cloud": { Türkçe: "Buluta kaydedildi" },
  "Cloud sync issue": { Türkçe: "Bulut senkron sorunu" },
  "Connecting to cloud": { Türkçe: "Buluta bağlanıyor" },
  "Offline. Showing saved local data.": { Türkçe: "Offline. Kaydedilmiş yerel veri gösteriliyor." },
  "Your latest changes are being sent to the cloud.": { Türkçe: "Son değişiklikler buluta gönderiliyor." },
  "Saved. Last sync:": { Türkçe: "Kaydedildi. Son senkron:" },
  "Saved. You can open the same workspace on Mac, iPad and iPhone.": {
    Türkçe: "Kaydedildi. Aynı workspace'i Mac, iPad ve iPhone'da açabilirsiniz."
  },
  "There was a problem syncing your changes.": { Türkçe: "Değişiklikler senkronlanırken sorun oluştu." },
  "Checking cloud connection for shared layout and settings.": { Türkçe: "Paylaşılan yerleşim ve ayarlar için bulut bağlantısı kontrol ediliyor." }
};

export function normalizeStudioLanguage(value: string | null | undefined): StudioLanguage {
  const cleaned = String(value || "").trim();
  return SUPPORTED_STUDIO_LANGUAGES.includes(cleaned as StudioLanguage) ? cleaned as StudioLanguage : "English";
}

export function studioT(text: string, language: string | null | undefined) {
  const normalized = normalizeStudioLanguage(language);
  if (normalized === "English") return text;
  return WEB_TRANSLATIONS[text]?.[normalized] ?? text;
}
