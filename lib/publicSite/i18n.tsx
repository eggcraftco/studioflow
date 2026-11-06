"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { useRouter } from "next/navigation";
import {
  normalizeStudioLanguage,
  SUPPORTED_STUDIO_LANGUAGES,
  type StudioLanguage
} from "@/lib/studioflow/languageCore";
import { studioLanguageDir } from "@/lib/studioflow/languageDirection";
// English only. The other eleven languages never ride in a chunk: a language address gets its table from the server
// (app/[lang]/layout.tsx → PublicRouteLanguage), and a one-address page in another language fetches that one table
// (app/api/public-site-text). translations.ts builds the other tables with pure calls, so the minifier drops them from
// this bundle; scripts/check-public-bundle.mts reads the built chunks and fails if another language comes back.
import {
  PUBLIC_SITE_EN,
  type PublicSiteTextTable,
  type PublicSiteTranslationKey
} from "@/lib/publicSite/translations";
import {
  isLocalizedPublicPath,
  localizedPublicHref,
  publicLocaleByLanguage,
  splitPublicLocalePath
} from "@/lib/publicSite/locales";

export const PUBLIC_SITE_LANGUAGE_STORAGE_KEY = "studioflow-public-language";
// The language of the last language-prefixed page read in this tab (/de/…). A page with one address reached
// from it — /privacy from the German footer — stays German. Tab-scoped; a pick in the selector is the key above.
const PUBLIC_SITE_READING_LANGUAGE_KEY = "studioflow-public-reading-language";

const PUBLIC_LANGUAGE_LOCALES: Record<StudioLanguage, string> = {
  English: "en",
  Türkçe: "tr",
  Deutsch: "de",
  Français: "fr",
  Italiano: "it",
  "Español (Spanish)": "es",
  Português: "pt",
  "Русский (Russian)": "ru",
  "日本語 (Japanese)": "ja",
  "中文 (Chinese)": "zh",
  "العربية (Arabic)": "ar",
  "हिन्दी (Hindi)": "hi"
};

const PUBLIC_BROWSER_LANGUAGE_ALIASES: Record<string, StudioLanguage> = {
  ar: "العربية (Arabic)",
  de: "Deutsch",
  en: "English",
  es: "Español (Spanish)",
  fr: "Français",
  hi: "हिन्दी (Hindi)",
  it: "Italiano",
  ja: "日本語 (Japanese)",
  pt: "Português",
  ru: "Русский (Russian)",
  tr: "Türkçe",
  zh: "中文 (Chinese)"
};

type PublicSiteText = (key: PublicSiteTranslationKey) => string;

type PublicSiteLanguageContextValue = {
  language: StudioLanguage;
  languages: typeof SUPPORTED_STUDIO_LANGUAGES;
  setLanguage: (language: StudioLanguage | string) => void;
  t: PublicSiteText;
  dir: "ltr" | "rtl";
  locale: string;
};

const PublicSiteLanguageContext = createContext<PublicSiteLanguageContextValue | null>(null);

// A language's own text, or the English text where that language has none (the same fallback as before the split).
function publicSiteTextLookup(table: PublicSiteTextTable): PublicSiteText {
  return (key: PublicSiteTranslationKey) => table[key] ?? PUBLIC_SITE_EN[key] ?? key;
}

// The tables this tab already has (English is in the bundle). A language address adds its own (PublicRouteLanguage),
// so a German reader who goes from /de to /privacy reads the German header and footer without another request.
const publicSiteTexts = new Map<StudioLanguage, PublicSiteTextTable>([["English", PUBLIC_SITE_EN]]);
const publicSiteTextLoads = new Map<StudioLanguage, Promise<PublicSiteTextTable>>();

function loadPublicSiteText(language: StudioLanguage): Promise<PublicSiteTextTable> {
  const known = publicSiteTexts.get(language);
  if (known) return Promise.resolve(known);
  let load = publicSiteTextLoads.get(language);
  if (!load) {
    const code = publicLocaleByLanguage(language).code;
    load = fetch(`/api/public-site-text/${code}`, { credentials: "omit" })
      .then(response => {
        if (!response.ok) throw new Error(`public site text ${code}: ${response.status}`);
        return response.json() as Promise<PublicSiteTextTable>;
      })
      .then(table => {
        publicSiteTexts.set(language, table);
        return table;
      })
      .finally(() => publicSiteTextLoads.delete(language));
    publicSiteTextLoads.set(language, load);
  }
  return load;
}

export function publicLanguageDir(language: StudioLanguage) {
  // One definition, in lib/studioflow/language.ts. The app and the marketing
  // site disagreeing about which languages read right-to-left is not a thing
  // that should be possible.
  return studioLanguageDir(language);
}

function languageFromBrowserLocales(locales: readonly string[] | undefined) {
  for (const locale of locales ?? []) {
    const normalizedLocale = locale.trim().toLowerCase();
    if (!normalizedLocale) continue;

    const languageCode = normalizedLocale.split("-")[0];
    const matchedLanguage = PUBLIC_BROWSER_LANGUAGE_ALIASES[languageCode];
    if (matchedLanguage) return matchedLanguage;
  }

  return "English";
}

function storedPublicSiteLanguage(read: () => string | null) {
  try {
    const stored = read();
    if (!stored) return null;
    const normalized = normalizeStudioLanguage(stored);
    return SUPPORTED_STUDIO_LANGUAGES.includes(normalized) ? normalized : null;
  } catch {
    return null;
  }
}

function getInitialPublicSiteLanguage() {
  // The language this tab was last reading on a language address wins, then a language the visitor picked
  // manually (it persists across every page load and navigation until they choose another). Only when neither
  // exists do we fall back to the browser/device language (default English). Never the visitor's country.
  const reading = storedPublicSiteLanguage(() => window.sessionStorage.getItem(PUBLIC_SITE_READING_LANGUAGE_KEY));
  if (reading) return reading;
  const stored = storedPublicSiteLanguage(() => window.localStorage.getItem(PUBLIC_SITE_LANGUAGE_STORAGE_KEY));
  if (stored) return stored;
  try {
    const browserLanguages = window.navigator.languages?.length
      ? window.navigator.languages
      : [window.navigator.language];

    return languageFromBrowserLocales(browserLanguages);
  } catch {
    return "English";
  }
}

function rememberReadingLanguage(language: StudioLanguage) {
  try {
    window.sessionStorage.setItem(PUBLIC_SITE_READING_LANGUAGE_KEY, language);
  } catch {
    // Without storage a one-address page falls back to the stored or browser language.
  }
}

// A language the visitor chose: the selector, or one of the language links.
export function rememberPublicSiteLanguage(language: StudioLanguage) {
  rememberReadingLanguage(language);
  try {
    window.localStorage.setItem(PUBLIC_SITE_LANGUAGE_STORAGE_KEY, language);
  } catch {
    // The selector still works for the current session if storage is unavailable.
  }
}

// app/[lang] pins its subtree to the address's language: /de/… is German for everyone, Googlebot included, and
// the server renders it German.
const PublicRouteLanguageContext = createContext<StudioLanguage | null>(null);
// …and hands down that language's table, which the server put in the page (the only language this page loads).
const PublicRouteTextContext = createContext<PublicSiteTextTable | null>(null);

export function PublicRouteLanguage({
  language,
  text,
  children
}: {
  language: StudioLanguage;
  text: PublicSiteTextTable;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!publicSiteTexts.has(language)) publicSiteTexts.set(language, text);
  }, [language, text]);
  return (
    <PublicRouteLanguageContext.Provider value={language}>
      <PublicRouteTextContext.Provider value={text}>{children}</PublicRouteTextContext.Provider>
    </PublicRouteLanguageContext.Provider>
  );
}

export function PublicSiteLanguageProvider({
  children,
  lockLanguage
}: {
  children: ReactNode;
  // When set, the whole subtree is pinned to this language: no browser/stored
  // auto-detection and the selector's setLanguage is a no-op. Used by the
  // paid-ads landing page, whose body copy is English-only — so the header must
  // stay English too rather than auto-translating for non-English browsers.
  lockLanguage?: StudioLanguage;
}) {
  const routeLanguage = useContext(PublicRouteLanguageContext);
  const routeText = useContext(PublicRouteTextContext);
  const router = useRouter();
  const [chosenLanguage, setLanguageState] = useState<StudioLanguage>("English");
  // Bumped when a fetched table lands (publicSiteTexts is outside React).
  const [, setTextsLoaded] = useState(0);
  // A language address decides its language; elsewhere it is the reader's (see getInitialPublicSiteLanguage).
  const requestedLanguage = lockLanguage ?? routeLanguage ?? chosenLanguage;
  const requestedText = requestedLanguage === routeLanguage && routeText ? routeText : publicSiteTexts.get(requestedLanguage);
  // Until the reader's table is here the page stays in English — the words, <html lang> and dir together.
  const language: StudioLanguage = requestedText ? requestedLanguage : "English";
  const text = requestedText ?? PUBLIC_SITE_EN;

  useEffect(() => {
    if (requestedText) return;
    // A page with language versions is about to move to that language's address, which brings its table.
    if (!routeLanguage && isLocalizedPublicPath(window.location.pathname)) return;
    let cancelled = false;
    loadPublicSiteText(requestedLanguage)
      .then(() => {
        if (!cancelled) setTextsLoaded(count => count + 1);
      })
      .catch(() => undefined); // stays English, as on a page that never loaded the table
    return () => {
      cancelled = true;
    };
  }, [requestedLanguage, requestedText, routeLanguage]);

  useEffect(() => {
    if (lockLanguage) return;
    if (routeLanguage) {
      rememberReadingLanguage(routeLanguage);
      return;
    }
    const preferred = getInitialPublicSiteLanguage();
    setLanguageState(preferred);
    // A page that has language versions shows another language at that language's address, never inside the
    // English one — the English address stays English for every reader and every crawler.
    const path = window.location.pathname;
    if (preferred !== "English" && isLocalizedPublicPath(path)) {
      router.replace(`${localizedPublicHref(path, preferred)}${window.location.search}${window.location.hash}`);
    }
  }, [lockLanguage, routeLanguage, router]);

  const setLanguage = useCallback((nextLanguage: StudioLanguage | string) => {
    if (lockLanguage) return;
    const normalized = normalizeStudioLanguage(nextLanguage);
    setLanguageState(normalized);
    rememberPublicSiteLanguage(normalized);
    // A page with language versions goes to the chosen language's address; a one-address page switches in place.
    const { path } = splitPublicLocalePath(window.location.pathname);
    if (!routeLanguage && !isLocalizedPublicPath(path)) return;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const target = `${localizedPublicHref(path, normalized)}${window.location.search}${window.location.hash}`;
    if (target !== current) router.push(target);
  }, [lockLanguage, routeLanguage, router]);

  const dir = publicLanguageDir(language);
  const locale = PUBLIC_LANGUAGE_LOCALES[language];

  useEffect(() => {
    const previousLang = document.documentElement.lang;
    const previousDir = document.documentElement.dir;
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;

    return () => {
      document.documentElement.lang = previousLang || "en";
      document.documentElement.dir = previousDir || "ltr";
    };
  }, [dir, locale]);

  const value = useMemo<PublicSiteLanguageContextValue>(() => ({
    language,
    languages: SUPPORTED_STUDIO_LANGUAGES,
    setLanguage,
    t: publicSiteTextLookup(text),
    dir,
    locale
  }), [dir, language, locale, setLanguage, text]);

  return (
    <PublicSiteLanguageContext.Provider value={value}>
      {children}
    </PublicSiteLanguageContext.Provider>
  );
}

// For pieces that may render outside the public site's provider (the locale-aware Link).
export function usePublicSiteLanguageOptional() {
  return useContext(PublicSiteLanguageContext);
}

export function usePublicSiteLanguage() {
  const context = useContext(PublicSiteLanguageContext);
  if (!context) {
    throw new Error("usePublicSiteLanguage must be used inside PublicSiteLanguageProvider");
  }
  return context;
}
