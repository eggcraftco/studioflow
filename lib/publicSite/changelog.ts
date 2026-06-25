import type { StudioLanguage } from "@/lib/studioflow/language";

// ---------------------------------------------------------------------------
// NivaDesk public changelog
//
// HOW TO ADD A RELEASE (for the team):
//   1. Add a new object to the TOP of CHANGELOG below (newest first).
//   2. Set `version` (match the app version), `date` (e.g. "14 June 2026").
//   3. Optionally set `highlight`: one short headline sentence.
//   4. List `changes`, each tagged "new" | "improved" | "fixed".
//   5. Update CHANGELOG_LAST_UPDATED to the same date.
//
// Release text is written in English (the source of truth). The page chrome
// (titles, tags, labels) is localized to all 12 languages automatically.
// ---------------------------------------------------------------------------

export type ChangeTag = "new" | "improved" | "fixed";

export type ChangelogChange = {
  tag: ChangeTag;
  text: string;
};

export type ChangelogEntry = {
  version: string;
  date: string;
  highlight?: string;
  changes: ChangelogChange[];
};

export const CHANGELOG_LAST_UPDATED = "14 June 2026";

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.1.3",
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
