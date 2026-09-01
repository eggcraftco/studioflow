import { normalizeStudioLanguage, type StudioLanguage } from "@/lib/studioflow/language";

/**
 * Which way a language reads, and the BCP-47 tag that goes with it.
 *
 * Arabic has shipped in the app since the store localisation work, but nothing
 * inside the app ever set `dir` — only the marketing site's provider did. So an
 * Arabic-speaking jeweller got Arabic words in a left-to-right layout, labels on
 * the wrong side of their fields, and the `[dir="rtl"]` rules already sitting in
 * globals.css never reached a single app screen.
 *
 * Its own module rather than a few more lines in language.ts: that file is
 * 2.1 MB of translation tables, and both the app shell and the public site's
 * provider need these two functions during render.
 */
export const RTL_STUDIO_LANGUAGES: readonly StudioLanguage[] = ["العربية (Arabic)"];

export function studioLanguageDir(language: string | null | undefined): "ltr" | "rtl" {
  return RTL_STUDIO_LANGUAGES.includes(normalizeStudioLanguage(language)) ? "rtl" : "ltr";
}

export const STUDIO_LANGUAGE_LOCALES: Record<StudioLanguage, string> = {
  "English": "en",
  "Türkçe": "tr",
  "Deutsch": "de",
  "Français": "fr",
  "Italiano": "it",
  "Español (Spanish)": "es",
  "Português": "pt",
  "Русский (Russian)": "ru",
  "日本語 (Japanese)": "ja",
  "中文 (Chinese)": "zh",
  "العربية (Arabic)": "ar",
  "हिन्दी (Hindi)": "hi"
};

export function studioLanguageLocale(language: string | null | undefined): string {
  return STUDIO_LANGUAGE_LOCALES[normalizeStudioLanguage(language)] || "en";
}
