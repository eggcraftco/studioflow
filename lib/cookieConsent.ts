// Cookie consent storage (hybrid model).
//
// The site currently sets ONLY strictly-necessary + first-party functional
// storage (Firebase auth/session, language, theme, UI preferences) and NO
// analytics or marketing trackers. The banner therefore presents a lightweight
// essential-cookies notice today, but the consent record is already category
// based so a full consent manager can be enabled the moment analytics or
// marketing tools are introduced — without changing the storage schema.

export const COOKIE_CONSENT_KEY = "studioflow-cookie-consent";
export const COOKIE_CONSENT_VERSION = 1;

export type CookieCategory = "necessary" | "functional" | "analytics" | "marketing";

export type CookieConsent = {
  version: number;
  necessary: true; // always granted; required for the service to work
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
  decidedAt: string; // ISO timestamp
};

export const DEFAULT_DECLINED: Omit<CookieConsent, "version" | "decidedAt"> = {
  necessary: true,
  functional: false,
  analytics: false,
  marketing: false
};

export const DEFAULT_ACCEPTED: Omit<CookieConsent, "version" | "decidedAt"> = {
  necessary: true,
  functional: true,
  analytics: false, // not used yet; flip default when analytics ships
  marketing: false
};

export function readCookieConsent(): CookieConsent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CookieConsent>;
    if (!parsed || parsed.version !== COOKIE_CONSENT_VERSION) return null;
    return {
      version: COOKIE_CONSENT_VERSION,
      necessary: true,
      functional: Boolean(parsed.functional),
      analytics: Boolean(parsed.analytics),
      marketing: Boolean(parsed.marketing),
      decidedAt: typeof parsed.decidedAt === "string" ? parsed.decidedAt : new Date().toISOString()
    };
  } catch {
    return null;
  }
}

export function writeCookieConsent(choice: Omit<CookieConsent, "version" | "decidedAt">): CookieConsent {
  const record: CookieConsent = {
    version: COOKIE_CONSENT_VERSION,
    necessary: true,
    functional: Boolean(choice.functional),
    analytics: Boolean(choice.analytics),
    marketing: Boolean(choice.marketing),
    decidedAt: new Date().toISOString()
  };
  try {
    window.localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(record));
    window.dispatchEvent(new CustomEvent("studioflow-cookie-consent-changed", { detail: record }));
  } catch {
    /* storage unavailable — banner still works for the session */
  }
  return record;
}

export function hasCookieDecision(): boolean {
  return readCookieConsent() !== null;
}

// Event other components (e.g. the footer link) dispatch to reopen the banner.
export const OPEN_COOKIE_PREFERENCES_EVENT = "studioflow-open-cookie-preferences";

export function openCookiePreferences() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OPEN_COOKIE_PREFERENCES_EVENT));
}
