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
import {
  normalizeStudioLanguage,
  SUPPORTED_STUDIO_LANGUAGES,
  type StudioLanguage
} from "@/lib/studioflow/language";
import {
  PUBLIC_SITE_EN,
  PUBLIC_SITE_TRANSLATIONS,
  type PublicSiteTranslationKey
} from "@/lib/publicSite/translations";

export const PUBLIC_SITE_LANGUAGE_STORAGE_KEY = "studioflow-public-language";

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

export function publicSiteT(key: PublicSiteTranslationKey, language: StudioLanguage | string | null | undefined) {
  const normalized = normalizeStudioLanguage(language);
  return PUBLIC_SITE_TRANSLATIONS[normalized]?.[key] ?? PUBLIC_SITE_EN[key] ?? key;
}

export function publicLanguageDir(language: StudioLanguage) {
  return language === "العربية (Arabic)" ? "rtl" : "ltr";
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

function getInitialPublicSiteLanguage() {
  try {
    const storedLanguage = window.localStorage.getItem(PUBLIC_SITE_LANGUAGE_STORAGE_KEY);
    if (storedLanguage && SUPPORTED_STUDIO_LANGUAGES.includes(storedLanguage as StudioLanguage)) {
      return storedLanguage as StudioLanguage;
    }

    const browserLanguages = window.navigator.languages?.length
      ? window.navigator.languages
      : [window.navigator.language];

    return languageFromBrowserLocales(browserLanguages);
  } catch {
    return "English";
  }
}

export function PublicSiteLanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<StudioLanguage>("English");

  useEffect(() => {
    setLanguageState(getInitialPublicSiteLanguage());
  }, []);

  const setLanguage = useCallback((nextLanguage: StudioLanguage | string) => {
    const normalized = normalizeStudioLanguage(nextLanguage);
    setLanguageState(normalized);
    try {
      window.localStorage.setItem(PUBLIC_SITE_LANGUAGE_STORAGE_KEY, normalized);
    } catch {
      // The selector still works for the current session if storage is unavailable.
    }
  }, []);

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
    t: key => publicSiteT(key, language),
    dir,
    locale
  }), [dir, language, locale, setLanguage]);

  return (
    <PublicSiteLanguageContext.Provider value={value}>
      {children}
    </PublicSiteLanguageContext.Provider>
  );
}

export function usePublicSiteLanguage() {
  const context = useContext(PublicSiteLanguageContext);
  if (!context) {
    throw new Error("usePublicSiteLanguage must be used inside PublicSiteLanguageProvider");
  }
  return context;
}
