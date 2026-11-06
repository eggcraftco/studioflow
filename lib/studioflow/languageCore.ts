// The language list and the dictionary-free helpers around it.
//
// lib/studioflow/language.ts holds the app's translation tables — about 7 MB of source in twelve languages —
// and every module that imported even one helper from it shipped all of it. The root layout (AuthProvider,
// the <html dir> of a language address) and the public site's provider need only these few lines, so they
// live here and language.ts re-exports them: an app screen still imports everything from language.ts, and a
// public page never loads the app's dictionary (scripts/check-public-bundle.mts reads the built chunks).
//
// No imports on purpose: several check scripts transpile language.ts together with the sibling modules it
// imports into a temporary folder.

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

export function normalizeStudioLanguage(value: string | null | undefined): StudioLanguage {
  const cleaned = String(value || "").trim();
  return SUPPORTED_STUDIO_LANGUAGES.includes(cleaned as StudioLanguage) ? cleaned as StudioLanguage : "English";
}

/**
 * The app's supported language name best matching a BCP 47 locale tag (e.g.
 * navigator.language). Used as the default when neither the personal nor the
 * workspace language has been chosen yet, so a first visit opens in the
 * user's own language (a stored choice wins).
 */
export function studioLanguageForLocaleTag(tag: string | null | undefined): StudioLanguage {
  const code = String(tag || "").trim().toLowerCase().split("-")[0];
  switch (code) {
    case "tr": return "Türkçe";
    case "de": return "Deutsch";
    case "fr": return "Français";
    case "it": return "Italiano";
    case "es": return "Español (Spanish)";
    case "pt": return "Português";
    case "ru": return "Русский (Russian)";
    case "ja": return "日本語 (Japanese)";
    case "zh": return "中文 (Chinese)";
    case "ar": return "العربية (Arabic)";
    case "hi": return "हिन्दी (Hindi)";
    default: return "English";
  }
}
