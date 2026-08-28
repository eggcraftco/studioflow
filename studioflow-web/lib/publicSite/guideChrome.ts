import type { StudioLanguage } from "@/lib/studioflow/language";

// ---------------------------------------------------------------------------
// User guide: page chrome only.
//
// Split out from guide.ts on purpose. The guide content itself is paid-only and
// is served from the server, so the client must never import guide.ts — doing so
// would ship the whole tree (and its 12-language dictionary) in the bundle to
// anyone who opens the page. Chrome is generic labels, safe to ship.
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

// --- Localized page chrome --------------------------------------------------

type GuideChrome = {
  eyebrow: string;
  title: string;
  intro: string;
  menuLabel: string;
  searchPlaceholder: string;
  lastUpdated: string;
};

const CHROME_FALLBACK: GuideChrome = {
  eyebrow: "User guide",
  title: "How to use NivaDesk",
  intro: "Pick a menu on the left to see what it does and how to use it, step by step. The apps share the same layout, so this works for Mac, iPhone, iPad, Android and web.",
  menuLabel: "Menus",
  searchPlaceholder: "Search the guide…",
  lastUpdated: "Last updated"
};

const CHROME: Partial<Record<StudioLanguage, GuideChrome>> = {
  Türkçe: {
    eyebrow: "Kullanım kılavuzu",
    title: "NivaDesk nasıl kullanılır",
    intro: "Soldan bir menü seçin; ne işe yaradığını ve nasıl kullanılacağını adım adım görün. Uygulamalar aynı düzeni paylaşır; bu kılavuz Mac, iPhone, iPad, Android ve web için geçerlidir.",
    menuLabel: "Menüler",
    searchPlaceholder: "Kılavuzda ara…",
    lastUpdated: "Son güncelleme"
  },
  Deutsch: {
    eyebrow: "Benutzerhandbuch",
    title: "So nutzen Sie NivaDesk",
    intro: "Wählen Sie links ein Menü, um zu sehen, was es tut und wie man es Schritt für Schritt nutzt. Die Apps teilen sich dasselbe Layout: für Mac, iPhone, iPad, Android und Web.",
    menuLabel: "Menüs",
    searchPlaceholder: "Im Handbuch suchen…",
    lastUpdated: "Zuletzt aktualisiert"
  },
  Français: {
    eyebrow: "Guide d'utilisation",
    title: "Comment utiliser NivaDesk",
    intro: "Choisissez un menu à gauche pour voir à quoi il sert et comment l'utiliser, étape par étape. Les apps partagent la même structure: pour Mac, iPhone, iPad, Android et web.",
    menuLabel: "Menus",
    searchPlaceholder: "Rechercher dans le guide…",
    lastUpdated: "Dernière mise à jour"
  },
  Italiano: {
    eyebrow: "Guida utente",
    title: "Come usare NivaDesk",
    intro: "Scegli un menu a sinistra per vedere cosa fa e come si usa, passo dopo passo. Le app condividono lo stesso layout: per Mac, iPhone, iPad, Android e web.",
    menuLabel: "Menu",
    searchPlaceholder: "Cerca nella guida…",
    lastUpdated: "Ultimo aggiornamento"
  },
  "Español (Spanish)": {
    eyebrow: "Guía de uso",
    title: "Cómo usar NivaDesk",
    intro: "Elige un menú a la izquierda para ver qué hace y cómo usarlo, paso a paso. Las apps comparten el mismo diseño: para Mac, iPhone, iPad, Android y web.",
    menuLabel: "Menús",
    searchPlaceholder: "Buscar en la guía…",
    lastUpdated: "Última actualización"
  },
  Português: {
    eyebrow: "Guia do utilizador",
    title: "Como usar o NivaDesk",
    intro: "Escolha um menu à esquerda para ver o que faz e como usar, passo a passo. As apps partilham o mesmo layout: para Mac, iPhone, iPad, Android e web.",
    menuLabel: "Menus",
    searchPlaceholder: "Pesquisar no guia…",
    lastUpdated: "Última atualização"
  },
  "Русский (Russian)": {
    eyebrow: "Руководство пользователя",
    title: "Как пользоваться NivaDesk",
    intro: "Выберите меню слева, чтобы увидеть, что оно делает и как им пользоваться, шаг за шагом. Приложения имеют одинаковую структуру: для Mac, iPhone, iPad, Android и веба.",
    menuLabel: "Меню",
    searchPlaceholder: "Поиск по руководству…",
    lastUpdated: "Последнее обновление"
  },
  "日本語 (Japanese)": {
    eyebrow: "ユーザーガイド",
    title: "NivaDesk の使い方",
    intro: "左のメニューを選ぶと、その機能と使い方を順を追って確認できます。アプリは同じレイアウトなので、Mac、iPhone、iPad、Android、ウェブで共通です。",
    menuLabel: "メニュー",
    searchPlaceholder: "ガイドを検索…",
    lastUpdated: "最終更新日"
  },
  "中文 (Chinese)": {
    eyebrow: "用户指南",
    title: "如何使用 NivaDesk",
    intro: "在左侧选择一个菜单，逐步了解它的用途和用法。各应用布局一致，因此适用于 Mac、iPhone、iPad、Android 和网页。",
    menuLabel: "菜单",
    searchPlaceholder: "搜索指南…",
    lastUpdated: "最后更新"
  },
  "العربية (Arabic)": {
    eyebrow: "دليل المستخدم",
    title: "كيفية استخدام NivaDesk",
    intro: "اختر قائمة من اليسار لترى وظيفتها وكيفية استخدامها خطوة بخطوة. تشترك التطبيقات في التخطيط نفسه: لنظام Mac وiPhone وiPad وAndroid والويب.",
    menuLabel: "القوائم",
    searchPlaceholder: "ابحث في الدليل…",
    lastUpdated: "آخر تحديث"
  },
  "हिन्दी (Hindi)": {
    eyebrow: "उपयोगकर्ता गाइड",
    title: "NivaDesk का उपयोग कैसे करें",
    intro: "बाईं ओर एक मेन्यू चुनें और देखें कि वह क्या करता है और चरण-दर-चरण कैसे उपयोग करें। ऐप्स एक ही लेआउट साझा करते हैं: Mac, iPhone, iPad, Android और वेब के लिए।",
    menuLabel: "मेन्यू",
    searchPlaceholder: "गाइड में खोजें…",
    lastUpdated: "अंतिम अपडेट"
  }
};

export function getGuideChrome(language: StudioLanguage | string | null | undefined): GuideChrome {
  return CHROME[language as StudioLanguage] ?? CHROME_FALLBACK;
}
