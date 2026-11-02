import type { StudioLanguage } from "./language";

// UX-010 / UX-006 (28 Oct 2026): the quick platform bar at the top of the order list (components/OrderPlatformBar.tsx).
// Its other words already have rows in every language and are reused: "All", "All sources", "Added by hand", "Source",
// "Website". Only the short button word for orders added by hand is new. Every language in one table, keyed by
// source text; merged last in language.ts (a key no other table has, so its place in the order changes nothing).
// WOO-STORES (2 Nov 2026): the "store unknown" choice beside one button per WooCommerce store — its full name (menu row,
// tooltip, filter summary) and its short bar word. Store names themselves are proper names and are never translated.
export const PLATFORM_BAR_TRANSLATIONS: Record<string, Partial<Record<StudioLanguage, string>>> = {
  "By hand": { "Türkçe": "Elle eklenen", "Deutsch": "Manuell", "Français": "À la main", "Italiano": "A mano", "Español (Spanish)": "A mano", "Português": "À mão", "Русский (Russian)": "Вручную", "日本語 (Japanese)": "手動", "中文 (Chinese)": "手动", "العربية (Arabic)": "يدويًا", "हिन्दी (Hindi)": "हाथ से" },
  "WooCommerce (store unknown)": { "Türkçe": "WooCommerce (mağaza bilinmiyor)", "Deutsch": "WooCommerce (Shop unbekannt)", "Français": "WooCommerce (boutique inconnue)", "Italiano": "WooCommerce (negozio sconosciuto)", "Español (Spanish)": "WooCommerce (tienda desconocida)", "Português": "WooCommerce (loja desconhecida)", "Русский (Russian)": "WooCommerce (магазин неизвестен)", "日本語 (Japanese)": "WooCommerce（ストア不明）", "中文 (Chinese)": "WooCommerce（店铺未知）", "العربية (Arabic)": "WooCommerce (متجر غير معروف)", "हिन्दी (Hindi)": "WooCommerce (स्टोर अज्ञात)" },
  "Store unknown": { "Türkçe": "Mağaza bilinmiyor", "Deutsch": "Shop unbekannt", "Français": "Boutique inconnue", "Italiano": "Negozio sconosciuto", "Español (Spanish)": "Tienda desconocida", "Português": "Loja desconhecida", "Русский (Russian)": "Магазин неизвестен", "日本語 (Japanese)": "ストア不明", "中文 (Chinese)": "店铺未知", "العربية (Arabic)": "متجر غير معروف", "हिन्दी (Hindi)": "स्टोर अज्ञात" }
};
