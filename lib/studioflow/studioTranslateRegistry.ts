// Who can translate an app text right now. lib/studioflow/language.ts registers its studioT here when it loads
// (an app screen imports it); lib/studioflow/useStudioT.ts reads it, so the hosts mounted in the root layout
// translate without importing the dictionary themselves — a public page that never shows them never loads it.
//
// No imports on purpose: check scripts transpile language.ts with the sibling modules it imports.

export type StudioTranslate = (text: string, language: string | null | undefined) => string;

let current: StudioTranslate | null = null;
const listeners = new Set<() => void>();

export function registerStudioTranslate(translate: StudioTranslate) {
  current = translate;
  for (const listener of Array.from(listeners)) listener();
}

export function registeredStudioTranslate(): StudioTranslate | null {
  return current;
}

export function subscribeStudioTranslate(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
