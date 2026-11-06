"use client";

// studioT for the hosts the root layout mounts on every page — the toast stack, the two-step verification prompt
// and the session lock. They used to import lib/studioflow/language.ts, which put the app's whole dictionary
// (about 2 MB compressed, twelve languages) on every public page, the Google Ads landing page included, although
// none of them shows anything until a signed-in person needs it.
//
// The translation itself is unchanged: it is language.ts's own studioT. On an app screen the dictionary is already
// loaded (the screen imports it, and language.ts registers studioT in studioTranslateRegistry), so the text is
// translated from the first render. On a page without it, English needs nothing; another language loads the
// dictionary the first time a host has something to show, and the host re-renders in that language when it lands.

import { useCallback, useSyncExternalStore } from "react";
import { normalizeStudioLanguage } from "@/lib/studioflow/languageCore";
import {
  registeredStudioTranslate,
  subscribeStudioTranslate,
  type StudioTranslate
} from "@/lib/studioflow/studioTranslateRegistry";

let dictionaryLoad: Promise<void> | null = null;

/** Loads lib/studioflow/language.ts (it registers studioT as it evaluates). One request, however many callers. */
export function loadStudioDictionary(): Promise<void> {
  if (registeredStudioTranslate()) return Promise.resolve();
  if (!dictionaryLoad) {
    dictionaryLoad = import("@/lib/studioflow/language").then(
      () => undefined,
      error => {
        dictionaryLoad = null; // a failed chunk load may be retried by the next text
        throw error;
      }
    );
  }
  return dictionaryLoad;
}

// The server never renders these hosts' text (they show nothing until the browser asks), so it has no translator.
const serverSnapshot = (): StudioTranslate | null => null;

export function useStudioT(language: string | null | undefined): (text: string) => string {
  const translate = useSyncExternalStore(subscribeStudioTranslate, registeredStudioTranslate, serverSnapshot);
  const english = normalizeStudioLanguage(language) === "English";
  return useCallback((text: string) => {
    if (english) return text;
    if (translate) return translate(text, language);
    // Shown before the dictionary is here: English now, the reader's language when it lands.
    loadStudioDictionary().catch(() => undefined);
    return text;
  }, [english, language, translate]);
}
