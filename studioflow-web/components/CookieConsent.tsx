"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_ACCEPTED,
  DEFAULT_DECLINED,
  OPEN_COOKIE_PREFERENCES_EVENT,
  readCookieConsent,
  writeCookieConsent,
  type CookieConsent as CookieConsentRecord
} from "@/lib/cookieConsent";

type Strings = {
  title: string;
  body: string;
  accept: string;
  necessaryOnly: string;
  managePrefs: string;
  hidePrefs: string;
  save: string;
  policyLink: string;
  catNecessary: string;
  catNecessaryDesc: string;
  catFunctional: string;
  catFunctionalDesc: string;
  catAnalytics: string;
  catAnalyticsDesc: string;
  catMarketing: string;
  catMarketingDesc: string;
  alwaysOn: string;
  notUsed: string;
};

const EN: Strings = {
  title: "Cookies on NivaDesk",
  body: "We use only essential cookies and local storage to keep you signed in, secure and to remember your preferences. We don't use advertising or third-party analytics trackers.",
  accept: "Accept",
  necessaryOnly: "Necessary only",
  managePrefs: "Manage preferences",
  hidePrefs: "Hide preferences",
  save: "Save preferences",
  policyLink: "Cookie Policy",
  catNecessary: "Strictly necessary",
  catNecessaryDesc: "Login, security, session and payment checkout. Always active.",
  catFunctional: "Functional",
  catFunctionalDesc: "Remembers language, theme, workspace and display preferences.",
  catAnalytics: "Analytics",
  catAnalyticsDesc: "Not currently used. Reserved for future, consent-based usage insights.",
  catMarketing: "Marketing",
  catMarketingDesc: "Not currently used. We don't run advertising trackers.",
  alwaysOn: "Always on",
  notUsed: "Not used"
};

const TR: Strings = {
  title: "NivaDesk'te çerezler",
  body: "Seni oturumda ve güvende tutmak, tercihlerini hatırlamak için yalnızca zorunlu çerezler ve yerel depolama kullanırız. Reklam veya üçüncü taraf analitik izleyici kullanmıyoruz.",
  accept: "Kabul et",
  necessaryOnly: "Sadece zorunlu",
  managePrefs: "Tercihleri yönet",
  hidePrefs: "Tercihleri gizle",
  save: "Tercihleri kaydet",
  policyLink: "Çerez Politikası",
  catNecessary: "Kesinlikle zorunlu",
  catNecessaryDesc: "Giriş, güvenlik, oturum ve ödeme. Her zaman aktif.",
  catFunctional: "İşlevsel",
  catFunctionalDesc: "Dil, tema, workspace ve görünüm tercihlerini hatırlar.",
  catAnalytics: "Analitik",
  catAnalyticsDesc: "Şu an kullanılmıyor. Gelecekte onaya dayalı kullanım analizi için ayrıldı.",
  catMarketing: "Pazarlama",
  catMarketingDesc: "Şu an kullanılmıyor. Reklam izleyici çalıştırmıyoruz.",
  alwaysOn: "Her zaman açık",
  notUsed: "Kullanılmıyor"
};

function detectStrings(): Strings {
  if (typeof navigator === "undefined") return EN;
  const lang = (navigator.languages?.[0] || navigator.language || "en").toLowerCase();
  return lang.startsWith("tr") ? TR : EN;
}

export function CookieConsent() {
  const [open, setOpen] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const [strings, setStrings] = useState<Strings>(EN);
  const [functional, setFunctional] = useState(true);

  useEffect(() => {
    setStrings(detectStrings());
    const existing = readCookieConsent();
    if (!existing) {
      setOpen(true);
    } else {
      setFunctional(existing.functional);
    }
    const reopen = () => {
      const current = readCookieConsent();
      if (current) setFunctional(current.functional);
      setShowPrefs(true);
      setOpen(true);
    };
    window.addEventListener(OPEN_COOKIE_PREFERENCES_EVENT, reopen);
    return () => window.removeEventListener(OPEN_COOKIE_PREFERENCES_EVENT, reopen);
  }, []);

  const persist = useCallback((record: Omit<CookieConsentRecord, "version" | "decidedAt">) => {
    writeCookieConsent(record);
    setOpen(false);
    setShowPrefs(false);
  }, []);

  if (!open) return null;

  return (
    <div className="cookie-banner" role="dialog" aria-label={strings.title} aria-live="polite">
      <div className="cookie-banner-inner">
        <div className="cookie-banner-copy">
          <strong>{strings.title}</strong>
          <p>
            {strings.body}{" "}
            <a href="/cookies">{strings.policyLink}</a>
          </p>
        </div>

        {showPrefs ? (
          <div className="cookie-cats">
            <CookieCat title={strings.catNecessary} desc={strings.catNecessaryDesc} locked badge={strings.alwaysOn} checked />
            <CookieCat
              title={strings.catFunctional}
              desc={strings.catFunctionalDesc}
              checked={functional}
              onChange={setFunctional}
            />
            <CookieCat title={strings.catAnalytics} desc={strings.catAnalyticsDesc} locked badge={strings.notUsed} checked={false} />
            <CookieCat title={strings.catMarketing} desc={strings.catMarketingDesc} locked badge={strings.notUsed} checked={false} />
          </div>
        ) : null}

        <div className="cookie-banner-actions">
          <button type="button" className="cookie-link-btn" onClick={() => setShowPrefs(v => !v)}>
            {showPrefs ? strings.hidePrefs : strings.managePrefs}
          </button>
          {showPrefs ? (
            <button
              type="button"
              className="public-button secondary cookie-btn"
              onClick={() => persist({ ...DEFAULT_DECLINED, functional })}
            >
              {strings.save}
            </button>
          ) : (
            <button
              type="button"
              className="public-button secondary cookie-btn"
              onClick={() => persist(DEFAULT_DECLINED)}
            >
              {strings.necessaryOnly}
            </button>
          )}
          <button type="button" className="public-button cookie-btn" onClick={() => persist(DEFAULT_ACCEPTED)}>
            {strings.accept}
          </button>
        </div>
      </div>
    </div>
  );
}

function CookieCat({
  title,
  desc,
  checked,
  locked = false,
  badge,
  onChange
}: {
  title: string;
  desc: string;
  checked: boolean;
  locked?: boolean;
  badge?: string;
  onChange?: (value: boolean) => void;
}) {
  return (
    <div className="cookie-cat">
      <div className="cookie-cat-head">
        <span className="cookie-cat-title">{title}</span>
        {locked ? (
          <span className="cookie-cat-badge">{badge}</span>
        ) : (
          <label className="cookie-switch">
            <input type="checkbox" checked={checked} onChange={e => onChange?.(e.target.checked)} />
            <span className="cookie-switch-track" aria-hidden="true" />
          </label>
        )}
      </div>
      <p className="cookie-cat-desc">{desc}</p>
    </div>
  );
}
