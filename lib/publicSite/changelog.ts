import type { StudioLanguage } from "@/lib/studioflow/language";

// ---------------------------------------------------------------------------
// NivaDesk public changelog — https://nivadesk.app/changelog (no sign-in)
//
// HOW TO ADD A RELEASE (for the team) — part of docs/release-checklist-platforms.md
// in the app repository ("Release notes" step), done for EVERY store release:
//   1. Add a new object to the TOP of CHANGELOG below (newest first), one per
//      platform family that shipped: `platformKey` "apple" (iPhone, iPad, Mac —
//      one App Store record) or "android"; "all" only for a release that went
//      to every platform at once.
//   2. Set `version` to the app's own version string (Apple
//      CFBundleShortVersionString / Android versionName) — the apps link to
//      #<platformKey>-<version>, so a mismatch lands on the top of the page.
//   3. `date` is the day the store release STARTED (a phased or staged rollout
//      says so in `highlight`), never the day it was submitted.
//   4. List only what reached that platform's users: not candidate work, not
//      features behind a server switch, not web-only changes. Copy from the
//      store notes that were actually entered (ASC What's New / Play notes).
//   5. Update CHANGELOG_LAST_UPDATED to the same date.
//   6. After the web deploy, read back https://nivadesk.app/changelog#<anchor>
//      and check the app's "NivaDesk updated — see what's new" link opens it.
//
// The web app has no version of its own (it is replaced on every deploy), so
// Settings ▸ About on the web shows the build it is running instead of an
// entry from this list.
//
// Release text is written in English (the source of truth). The page chrome
// (titles, tags, labels) is localized to all 12 languages automatically.
// ---------------------------------------------------------------------------

export type ChangeTag = "new" | "improved" | "fixed";

export type ChangelogChange = {
  tag: ChangeTag;
  text: string;
};

export type ChangelogPlatformKey = "apple" | "android" | "all";

export type ChangelogEntry = {
  version: string;
  /** Which app this entry is for; with `version` it makes the entry's anchor
   *  (#apple-2.1), which is what the apps' "see what's new" link opens. */
  platformKey: ChangelogPlatformKey;
  // Optional platform this release targets (e.g. "Android", "Mac & iPhone",
  // "Web"). Shown as a small pill so staggered per-platform releases read
  // clearly. Omit for a cross-platform entry.
  platform?: string;
  date: string;
  highlight?: string;
  changes: ChangelogChange[];
};

/** The entry's anchor on /changelog: "<platformKey>-<version>", e.g. "android-2.1". */
export function changelogAnchor(entry: Pick<ChangelogEntry, "platformKey" | "version">): string {
  return `${entry.platformKey}-${String(entry.version).trim()}`.toLowerCase().replace(/[^a-z0-9.-]/g, "-");
}

/** True for the newest entry of its platform (each platform's own "Latest"). */
export function isLatestForPlatform(entry: ChangelogEntry, list: ChangelogEntry[] = CHANGELOG): boolean {
  return list.find((item) => item.platformKey === entry.platformKey) === entry;
}

export const CHANGELOG_LAST_UPDATED = "29 October 2026";

export const CHANGELOG: ChangelogEntry[] = [
  // 2.3 — from the store notes that were entered (App Store "What's New" read back from the live App Store page on
  // 29 Oct 2026; Play notes ~/Developer/nivadesk-deploy-2026-10-28/store/play-notes-2.3.txt) for native-unified-2026-10-28
  // @66ccd292, Apple 2.3 (33) / Android vc21. Server-gated or pilot features are left out on purpose.
  {
    version: "2.3",
    platformKey: "apple",
    platform: "iPhone, iPad & Mac",
    date: "29 October 2026",
    highlight: "Filter your orders by shop in one tap, Etsy orders with their own card, and Scan receipt from the app icon. Released to the App Store on 29 October 2026.",
    changes: [
      { tag: "new", text: "Orders: a platform bar above the list filters by shop in one tap (Etsy, WooCommerce, Shopify, By hand …), and each order carries a small badge for the shop it came from." },
      { tag: "new", text: "Etsy orders: the order page shows a \"From Etsy\" card with the items, personalisation (with Copy), buyer note and Etsy's own totals. Profit is marked as estimated until the postage cost is known." },
      { tag: "improved", text: "Etsy: when your plan is full, new Etsy orders wait safely and a banner tells you how many; once you make room, import them in one tap. The customer portal stays folded for Etsy orders, with automatic updates off." },
      { tag: "new", text: "Scan receipt: press and hold the app icon, or open Banking ▸ Receipts, to photograph a receipt or pick a photo or PDF. NivaDesk attaches it to the matching bank payment, or keeps it waiting until the payment arrives (Pro and Team plans with a connected bank)." },
      { tag: "improved", text: "WooCommerce: switch between your connected stores in Settings, and the Integrations card now shows them as connected." },
      { tag: "new", text: "Work time: owners and admins can correct or delete a timer session." },
      { tag: "fixed", text: "Open tracking goes straight to the carrier's own page — DHL, Royal Mail, Parcelforce, UPS, FedEx, Evri and DPD — never to a broken link." },
      { tag: "fixed", text: "iPad: the window controls no longer cover the banner, the menu title or the Settings logo. Files: tapping a file opens its preview again." },
      { tag: "fixed", text: "Smaller fixes and translations." },
    ],
  },
  {
    version: "2.3",
    platformKey: "android",
    platform: "Android",
    date: "28 October 2026",
    highlight: "Filter your orders by shop in one tap, Etsy orders with their own card, and Scan receipt. Released on Google Play on 28 October 2026 to everyone at once.",
    changes: [
      { tag: "new", text: "Orders: filter by shop in one tap; each order shows its shop badge." },
      { tag: "new", text: "Etsy orders show items, personalisation, buyer note and Etsy totals; profit is marked estimated until postage is known." },
      { tag: "new", text: "Scan receipt from the app icon or Banking ▸ Receipts (Pro and Team plans with a connected bank)." },
      { tag: "improved", text: "WooCommerce: switch between connected stores." },
      { tag: "new", text: "Work time: owners and admins can correct or delete sessions." },
      { tag: "fixed", text: "Open tracking goes to the carrier's own page." },
      { tag: "fixed", text: "Fixes and translations." },
    ],
  },
  // 2.2 — from the store notes entered for native-candidate-34-2026-10-22 (docs/store/release-2.2/notes-final.json,
  // §5 of notes-final.md). Server-gated or pilot features (customer inbox, DHL, payment links) are left out on purpose.
  // Apple: released to the App Store on 23 October 2026 (owner, 29 Oct; not readable from the public page, which lists
  // only the newest version).
  {
    version: "2.2",
    platformKey: "apple",
    platform: "iPhone, iPad & Mac",
    date: "23 October 2026",
    highlight: "Choose how your order list loads, a Getting started list that takes you to the real work, and all your notifications in one place. Released to the App Store on 23 October 2026.",
    changes: [
      { tag: "improved", text: "Orders: choose how the list loads — Load more, Page by page or Show all (10 to 100 per page). On iPad and Mac a folded list keeps a rail of order squares beside the open order." },
      { tag: "improved", text: "Getting started: each step opens the real first task and ticks itself off once you have done it." },
      { tag: "new", text: "Settings ▸ Notifications: all your notifications in one place. Owners can choose to be told when a member uploads a file or saves work time on an order assigned to them (off until you switch it on)." },
      { tag: "fixed", text: "Order profit counts every payment recorded on the order, with the same figures as on the web. The order PDF no longer takes VAT off twice, and a platform fee the shop did not report is marked as an estimate." },
      { tag: "improved", text: "Inventory: members without financial access see stock cost as hidden instead of 0." },
      { tag: "fixed", text: "On iPad and Mac, an order opened from a notification or from Getting started opens on the right card." },
      { tag: "new", text: "Files: select every file in a list at once, and drop files onto an order (iPad and Mac)." },
      { tag: "new", text: "Notes: see who a note is shared with." },
      { tag: "new", text: "Settings ▸ About: your version, a check for updates, and what's new after an update." },
      { tag: "improved", text: "Settings ▸ Integrations: separate ChatGPT and Claude cards." },
      { tag: "fixed", text: "Smaller fixes and translations." },
    ],
  },
  {
    version: "2.2",
    platformKey: "android",
    platform: "Android",
    date: "22 October 2026",
    highlight: "Choose how your order list loads, a Getting started list that takes you to the real work, and owner notices for members' uploads and work time. Released on Google Play on 22 October 2026 as a staged rollout to 20% of users, then to everyone on 28 October 2026.",
    changes: [
      { tag: "improved", text: "Orders: Load more, Page by page or Show all." },
      { tag: "improved", text: "Getting started opens the real first task and ticks itself off." },
      { tag: "new", text: "Settings ▸ Notifications: owners can be told when a member uploads a file or saves work time." },
      { tag: "fixed", text: "Order profit counts every payment, as on the web; unreported shop fees are estimated." },
      { tag: "improved", text: "Members without financial access see stock cost as hidden, not 0." },
      { tag: "fixed", text: "Team Access: Delete client files and Bank Spending now apply." },
      { tag: "new", text: "Files: select all, drop on an order, trash or restore several." },
    ],
  },
  // 2.1 — from the store notes that were entered (docs/store/release-2.1/:
  // app-store-whats-new.en-GB.txt, play-release-notes.en-GB.txt) for the code
  // tagged store-2.1-30-apple / store-2.1-vc18-android (3d690eeb). Server-gated
  // features (customer inbox, DHL, payment links, eBay inventory) are left out
  // on purpose: they are not on for everybody.
  {
    version: "2.1",
    platformKey: "apple",
    platform: "iPhone, iPad & Mac",
    date: "17 October 2026",
    highlight: "A new layout, team access that follows each member, and shared notes. Released to the App Store on 17 October 2026 as a phased release over seven days; you can update by hand in the App Store at any time.",
    changes: [
      { tag: "new", text: "New layout: a collapsible sidebar on iPad and Mac, a menu drawer on iPhone. Settings is under your name in the menu." },
      { tag: "improved", text: "Team roles: screens and notifications follow each member's current access; if a team change is refused, you see why." },
      { tag: "improved", text: "Improved privacy of finance information for team members." },
      { tag: "new", text: "Notes: share with a person from your member list. View Only members can read shared notes but not edit them." },
      { tag: "new", text: "Work Time: log a full or half day on an order, kept separate from timer hours. The owner can correct entries." },
      { tag: "improved", text: "New orders start from your default delivery time and keep the due date you pick." },
      { tag: "improved", text: "Dashboard rows now add up to Net Profit, with a Refunds row." },
      { tag: "new", text: "Live PDF export preview, and tracking email preview before sending." },
      { tag: "improved", text: "Upload progress for each file, with Cancel and Retry. Delete several client files at once." },
      { tag: "improved", text: "Clearer Plan & Access, including for workspaces billed through Shopify." },
      { tag: "improved", text: "If you use Sign in with Apple, deleting your account also disconnects your Apple ID from NivaDesk." },
      { tag: "fixed", text: "Better layouts on small screens, more translations and bug fixes." },
    ],
  },
  {
    version: "2.1",
    platformKey: "android",
    platform: "Android",
    date: "17 October 2026",
    highlight: "A new layout, team access that follows each member, and shared notes. Rolled out on Google Play from 17 October 2026, to everybody from 18 October.",
    changes: [
      { tag: "new", text: "New layout: sidebar on tablets, menu drawer on phones." },
      { tag: "improved", text: "Improved privacy of finance information for team members; screens and alerts follow each member's access." },
      { tag: "new", text: "Notes: share with a team member; View Only members can only read." },
      { tag: "new", text: "Work Time: log full or half days." },
      { tag: "improved", text: "Dashboard rows add up to Net Profit; new orders keep the date you pick." },
      { tag: "new", text: "PDF and tracking email previews; upload progress for each file." },
      { tag: "fixed", text: "Clearer Plan & Access, more translations, fixes." },
    ],
  },
  {
    version: "1.1",
    platformKey: "apple",
    platform: "Mac & iPhone",
    date: "5 July 2026",
    highlight: "Widgets arrive: your net profit and deliveries, right on the Home Screen and desktop.",
    changes: [
      { tag: "new", text: "Widgets for the iPhone Home Screen and Mac desktop: Net Profit (weekly, monthly or yearly, with trend), Monthly Net Profit month by month, and Deliveries at a glance." },
      { tag: "new", text: "Financial Breakdown on the dashboard: revenue, costs, fees, VAT and profit in one clear section." },
      { tag: "improved", text: "Custom “Remaining” amounts now count into the order value, profit and every dashboard total." },
      { tag: "improved", text: "Clearer VAT labels throughout, and auto-calculated fields are easier to read." },
      { tag: "new", text: "After sign-up, a reminder to verify your email now stays until your address is confirmed." },
      { tag: "fixed", text: "iPhone: long customer names no longer hide the order amount in lists." },
    ],
  },
  {
    version: "0.1.7",
    platformKey: "android",
    platform: "Android",
    date: "5 July 2026",
    highlight: "Home-screen widgets and a full Financial Breakdown.",
    changes: [
      { tag: "new", text: "Home-screen widgets: Net Profit (weekly, monthly or yearly — switch the period right on the widget), Monthly Net Profit month by month, and Deliveries." },
      { tag: "new", text: "Financial Breakdown on the dashboard: revenue, costs, fees, VAT and profit in one clear section." },
      { tag: "improved", text: "Custom “Remaining” amounts now count into the order value, profit and every dashboard total." },
      { tag: "improved", text: "Clearer VAT labels throughout, and auto-calculated fields are easier to read." },
      { tag: "improved", text: "Chart tooltips now show comparison-year values." },
      { tag: "fixed", text: "Phone: tapping the logo returns to the order list, and long names no longer hide amounts." },
    ],
  },
  {
    version: "0.1.6",
    platformKey: "android",
    platform: "Android",
    date: "2 July 2026",
    highlight: "Clearer email verification and a tidier default order layout.",
    changes: [
      { tag: "new", text: "After sign-up, a reminder to verify your email now stays until your address is confirmed — with one-tap resend — so your account stays active." },
      { tag: "improved", text: "New orders open with a cleaner default card layout, with the Production Status card shown by default." },
    ],
  },
  {
    version: "0.1.3",
    platformKey: "all",
    date: "June 2026",
    highlight: "Welcome to NivaDesk: this is our first release, and we're just getting started.",
    changes: [
      { tag: "new", text: "First release of NivaDesk: run your studio, orders, client files, tasks and team from one place across Mac, iPhone, iPad, Android and web." },
      { tag: "improved", text: "NivaDesk is under active development. We're improving it continuously and listening to early feedback." },
      { tag: "new", text: "From here on, the specific new features, improvements and fixes in each update will be listed on this page." },
    ],
  },
];

// --- Localized page chrome -------------------------------------------------

type ChangelogLabels = {
  eyebrow: string;
  title: string;
  intro: string;
  latest: string;
  versionWord: string;
  lastUpdated: string;
  tags: Record<ChangeTag, string>;
};

const FALLBACK: ChangelogLabels = {
  eyebrow: "Product updates",
  title: "What's new in NivaDesk",
  intro: "Every release of NivaDesk, with what changed and when. Newest updates appear first.",
  latest: "Latest",
  versionWord: "Version",
  lastUpdated: "Last updated",
  tags: { new: "New", improved: "Improved", fixed: "Fixed" },
};

const LABELS: Partial<Record<StudioLanguage, ChangelogLabels>> = {
  Türkçe: {
    eyebrow: "Ürün güncellemeleri",
    title: "NivaDesk'te neler yeni",
    intro: "NivaDesk'in her sürümü; nelerin ne zaman değiştiğiyle birlikte. En yeni güncellemeler en üstte.",
    latest: "En yeni",
    versionWord: "Sürüm",
    lastUpdated: "Son güncelleme",
    tags: { new: "Yeni", improved: "İyileştirildi", fixed: "Düzeltildi" },
  },
  Deutsch: {
    eyebrow: "Produkt-Updates",
    title: "Was ist neu in NivaDesk",
    intro: "Jede Version von NivaDesk mit Änderungen und Datum. Die neuesten Updates stehen oben.",
    latest: "Neueste",
    versionWord: "Version",
    lastUpdated: "Zuletzt aktualisiert",
    tags: { new: "Neu", improved: "Verbessert", fixed: "Behoben" },
  },
  Français: {
    eyebrow: "Mises à jour du produit",
    title: "Nouveautés de NivaDesk",
    intro: "Chaque version de NivaDesk, avec les changements et la date. Les dernières mises à jour en premier.",
    latest: "Dernière",
    versionWord: "Version",
    lastUpdated: "Dernière mise à jour",
    tags: { new: "Nouveau", improved: "Amélioré", fixed: "Corrigé" },
  },
  Italiano: {
    eyebrow: "Aggiornamenti del prodotto",
    title: "Novità di NivaDesk",
    intro: "Ogni versione di NivaDesk, con cosa è cambiato e quando. Gli aggiornamenti più recenti in alto.",
    latest: "Più recente",
    versionWord: "Versione",
    lastUpdated: "Ultimo aggiornamento",
    tags: { new: "Novità", improved: "Migliorato", fixed: "Corretto" },
  },
  "Español (Spanish)": {
    eyebrow: "Novedades del producto",
    title: "Novedades de NivaDesk",
    intro: "Cada versión de NivaDesk, con lo que cambió y cuándo. Las actualizaciones más recientes aparecen primero.",
    latest: "Más reciente",
    versionWord: "Versión",
    lastUpdated: "Última actualización",
    tags: { new: "Nuevo", improved: "Mejorado", fixed: "Corregido" },
  },
  Português: {
    eyebrow: "Atualizações do produto",
    title: "Novidades do NivaDesk",
    intro: "Cada versão do NivaDesk, com o que mudou e quando. As atualizações mais recentes aparecem primeiro.",
    latest: "Mais recente",
    versionWord: "Versão",
    lastUpdated: "Última atualização",
    tags: { new: "Novo", improved: "Melhorado", fixed: "Corrigido" },
  },
  "Русский (Russian)": {
    eyebrow: "Обновления продукта",
    title: "Что нового в NivaDesk",
    intro: "Каждая версия NivaDesk с описанием изменений и датой. Новые обновления: сверху.",
    latest: "Последнее",
    versionWord: "Версия",
    lastUpdated: "Последнее обновление",
    tags: { new: "Новое", improved: "Улучшено", fixed: "Исправлено" },
  },
  "日本語 (Japanese)": {
    eyebrow: "製品アップデート",
    title: "NivaDesk の新機能",
    intro: "NivaDesk の各リリースと、その変更内容・日付。最新のアップデートが上に表示されます。",
    latest: "最新",
    versionWord: "バージョン",
    lastUpdated: "最終更新日",
    tags: { new: "新機能", improved: "改善", fixed: "修正" },
  },
  "中文 (Chinese)": {
    eyebrow: "产品更新",
    title: "NivaDesk 新功能",
    intro: "NivaDesk 的每个版本，及其更改内容和日期。最新更新显示在最上方。",
    latest: "最新",
    versionWord: "版本",
    lastUpdated: "最后更新",
    tags: { new: "新增", improved: "改进", fixed: "修复" },
  },
  "العربية (Arabic)": {
    eyebrow: "تحديثات المنتج",
    title: "ما الجديد في NivaDesk",
    intro: "كل إصدار من NivaDesk مع ما تغيّر وتاريخه. تظهر أحدث التحديثات أولاً.",
    latest: "الأحدث",
    versionWord: "الإصدار",
    lastUpdated: "آخر تحديث",
    tags: { new: "جديد", improved: "تحسين", fixed: "إصلاح" },
  },
  "हिन्दी (Hindi)": {
    eyebrow: "उत्पाद अपडेट",
    title: "NivaDesk में नया क्या है",
    intro: "NivaDesk का हर रिलीज़, क्या बदला और कब, के साथ। सबसे नए अपडेट सबसे ऊपर दिखते हैं।",
    latest: "नवीनतम",
    versionWord: "संस्करण",
    lastUpdated: "अंतिम अपडेट",
    tags: { new: "नया", improved: "बेहतर", fixed: "ठीक किया" },
  },
};

export function getChangelogLabels(language: StudioLanguage | string | null | undefined): ChangelogLabels {
  return LABELS[language as StudioLanguage] ?? FALLBACK;
}
