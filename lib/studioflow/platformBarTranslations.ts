import type { StudioLanguage } from "./language";

// UX-010 / UX-006 (28 Oct 2026): the quick platform bar at the top of the order list (components/OrderPlatformBar.tsx).
// Its other words already have rows in every language and are reused: "All", "All sources", "Added by hand", "Source",
// "Website". Only the short button word for orders added by hand is new. Every language in one table, keyed by
// source text; merged last in language.ts (a key no other table has, so its place in the order changes nothing).
export const PLATFORM_BAR_TRANSLATIONS: Record<string, Partial<Record<StudioLanguage, string>>> = {
  "By hand": { "Türkçe": "Elle eklenen", "Deutsch": "Manuell", "Français": "À la main", "Italiano": "A mano", "Español (Spanish)": "A mano", "Português": "À mão", "Русский (Russian)": "Вручную", "日本語 (Japanese)": "手動", "中文 (Chinese)": "手动", "العربية (Arabic)": "يدويًا", "हिन्दी (Hindi)": "हाथ से" }
};
