// Language addresses of the public site (multilingual SEO, 4 Nov 2026; owner: "her dilin Google aramasında
// kendi çevrilmiş NivaDesk sayfasıyla bulunması").
//
// English stays where it always was (/, /pricing, …): those URLs carry today's search traffic, so none of them
// moves or redirects. Every other language gets its own crawlable prefix (/de, /de/pricing, /hi/faq, …) whose
// HTML is rendered in that language on the server — the language is never only a browser-side switch.
//
// Only pages whose body is translated in all twelve languages get a prefix. The legal pages (privacy and terms are
// English-only; the others are reviewed in English and carry drafts), the integrations directory (English by
// design), the changelog (entries in English), /login and the user guide (/guide: noindex and robots-blocked,
// never localized) stay single-language URLs.
//
// One table for the middleware, the root layout, the route files, metadata, the sitemap and the links. No import
// of the 2.1 MB language tables here: the middleware bundles this file.
import type { StudioLanguage } from "@/lib/studioflow/language";
import { CLAUDE_CONNECTOR_URL } from "@/lib/studioflow/claudeConnector";

export const PUBLIC_SITE_ORIGIN = "https://nivadesk.app";

// Set by middleware.ts on a prefixed request, read by app/layout.tsx for <html lang dir>.
export const PUBLIC_LOCALE_HEADER = "x-nivadesk-public-locale";

export type PublicSiteLocale = {
  language: StudioLanguage;
  // The URL prefix. English has none.
  code: string;
  // hreflang value: language only, no region — the pages are the same for every country (prices in GBP, one
  // English site for the UK, US and India alike), so de-DE or en-IN would only split one page into copies.
  hreflang: string;
  // <html lang>, the same tag the public site's provider writes after hydration.
  htmlLang: string;
  ogLocale: string;
  // The language's own name, for the language links.
  label: string;
};

export const PUBLIC_SITE_LOCALES: readonly PublicSiteLocale[] = [
  { language: "English", code: "en", hreflang: "en", htmlLang: "en", ogLocale: "en_GB", label: "English" },
  { language: "Türkçe", code: "tr", hreflang: "tr", htmlLang: "tr", ogLocale: "tr_TR", label: "Türkçe" },
  { language: "Deutsch", code: "de", hreflang: "de", htmlLang: "de", ogLocale: "de_DE", label: "Deutsch" },
  { language: "Français", code: "fr", hreflang: "fr", htmlLang: "fr", ogLocale: "fr_FR", label: "Français" },
  { language: "Italiano", code: "it", hreflang: "it", htmlLang: "it", ogLocale: "it_IT", label: "Italiano" },
  { language: "Español (Spanish)", code: "es", hreflang: "es", htmlLang: "es", ogLocale: "es_ES", label: "Español" },
  { language: "Português", code: "pt", hreflang: "pt", htmlLang: "pt", ogLocale: "pt_BR", label: "Português" },
  { language: "Русский (Russian)", code: "ru", hreflang: "ru", htmlLang: "ru", ogLocale: "ru_RU", label: "Русский" },
  { language: "日本語 (Japanese)", code: "ja", hreflang: "ja", htmlLang: "ja", ogLocale: "ja_JP", label: "日本語" },
  // The site's Chinese is Simplified (订单, 维修), so the hreflang names the script.
  { language: "中文 (Chinese)", code: "zh", hreflang: "zh-Hans", htmlLang: "zh", ogLocale: "zh_CN", label: "中文" },
  { language: "العربية (Arabic)", code: "ar", hreflang: "ar", htmlLang: "ar", ogLocale: "ar_AR", label: "العربية" },
  { language: "हिन्दी (Hindi)", code: "hi", hreflang: "hi", htmlLang: "hi", ogLocale: "hi_IN", label: "हिन्दी" }
];

export const DEFAULT_PUBLIC_LOCALE = PUBLIC_SITE_LOCALES[0];

// The prefixed languages, in table order: what app/[lang] accepts.
export const PREFIXED_PUBLIC_LOCALES = PUBLIC_SITE_LOCALES.filter(locale => locale !== DEFAULT_PUBLIC_LOCALE);

// The pages with a URL in every language, by the name metadata.ts and seoCopy.ts use for them.
export type LocalizedPublicPage =
  | "home"
  | "features"
  | "pricing"
  | "chatgpt"
  | "faq"
  | "signup"
  | "contact"
  | "security"
  | "amazon"
  | "shopify"
  | "claude";

export const LOCALIZED_PUBLIC_PAGE_PATHS: Record<LocalizedPublicPage, string> = {
  home: "/",
  features: "/features",
  pricing: "/pricing",
  chatgpt: "/chatgpt",
  faq: "/faq",
  signup: "/signup",
  contact: "/contact",
  security: "/security",
  amazon: "/integrations/amazon",
  shopify: "/integrations/shopify",
  claude: "/integrations/claude"
};

// /integrations/claude follows the sitemap and its own noindex: it has language versions only while the Claude
// endpoint's address is published.
export const LOCALIZED_PUBLIC_PATHS: readonly string[] = Object.entries(LOCALIZED_PUBLIC_PAGE_PATHS)
  .filter(([page]) => page !== "claude" || Boolean(CLAUDE_CONNECTOR_URL))
  .map(([, path]) => path);

export function publicLocaleByCode(code: string | null | undefined) {
  return PREFIXED_PUBLIC_LOCALES.find(locale => locale.code === code) ?? null;
}

export function publicLocaleByLanguage(language: StudioLanguage | string | null | undefined) {
  return PUBLIC_SITE_LOCALES.find(locale => locale.language === language) ?? DEFAULT_PUBLIC_LOCALE;
}

export function isLocalizedPublicPath(path: string) {
  return LOCALIZED_PUBLIC_PATHS.includes(path);
}

// "/de/pricing" → Deutsch + "/pricing"; "/de" → Deutsch + "/"; anything else → English + itself.
export function splitPublicLocalePath(pathname: string | null | undefined): { locale: PublicSiteLocale; path: string } {
  const value = pathname || "/";
  const match = value.match(/^\/([a-z]{2})(?=\/|$)(.*)$/);
  const locale = match ? publicLocaleByCode(match[1]) : null;
  if (!locale || !match) return { locale: DEFAULT_PUBLIC_LOCALE, path: value };
  return { locale, path: match[2] || "/" };
}

// The address of `path` in `language`. A page without language versions keeps its one address.
export function localizedPublicPath(path: string, language: StudioLanguage | string | null | undefined) {
  const locale = publicLocaleByLanguage(language);
  if (locale === DEFAULT_PUBLIC_LOCALE || !isLocalizedPublicPath(path)) return path;
  return path === "/" ? `/${locale.code}` : `/${locale.code}${path}`;
}

// Same, for an href that may carry ?query or #hash ("/features#shipping").
export function localizedPublicHref(href: string, language: StudioLanguage | string | null | undefined) {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  const cut = href.search(/[?#]/);
  const path = cut === -1 ? href : href.slice(0, cut);
  const rest = cut === -1 ? "" : href.slice(cut);
  return `${localizedPublicPath(path, language)}${rest}`;
}

export function absolutePublicUrl(path: string) {
  return path === "/" ? PUBLIC_SITE_ORIGIN : `${PUBLIC_SITE_ORIGIN}${path}`;
}

// The reciprocal hreflang set of one page: every language, plus x-default → the English address. The same map
// goes in every language version's <head> and in the sitemap, so the set is identical wherever Google reads it.
export function publicHreflangAlternates(path: string): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const locale of PUBLIC_SITE_LOCALES) {
    languages[locale.hreflang] = absolutePublicUrl(localizedPublicPath(path, locale.language));
  }
  languages["x-default"] = absolutePublicUrl(path);
  return languages;
}
