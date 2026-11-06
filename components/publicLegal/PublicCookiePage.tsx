"use client";

// Cookie Policy page, split out of components/PublicMarketing.tsx on 6 Nov 2026 (site speed): its policy text
// (lib/publicSite/cookiePolicy.ts, every language's summary) is now downloaded on this page only, not on every public page.
// The component below is the one that lived in PublicMarketing.tsx, unchanged.
import { PublicShell } from "@/components/PublicMarketing";
import { PublicLegalLanguageNotice, PublicLegalSection } from "@/components/publicLegal/PublicLegalDocument";
import { usePublicSiteLanguage } from "@/lib/publicSite/i18n";
import {
  COOKIE_POLICY_LAST_UPDATED,
  COOKIE_POLICY_SECTIONS,
  getCookiePolicyLastUpdatedLabel,
  getCookiePolicySections
} from "@/lib/publicSite/cookiePolicy";

function PublicCookiePageContent() {
  const { language, t } = usePublicSiteLanguage();
  const cookiePolicySections = getCookiePolicySections(language);
  return (
    <>
      <section className="public-page-hero public-info-hero">
        <div className="public-shell">
          <span className="public-eyebrow">{t("cookies.eyebrow")}</span>
          <h1>{t("cookies.title")}</h1>
          <p>{t("cookies.body")}</p>
          <p className="public-legal-updated">
            {getCookiePolicyLastUpdatedLabel(language)}: {COOKIE_POLICY_LAST_UPDATED}
          </p>
        </div>
      </section>

      <section className="public-section">
        <div className="public-shell public-legal-document">
          <PublicLegalLanguageNotice language={language} translated={cookiePolicySections !== COOKIE_POLICY_SECTIONS} />
          {cookiePolicySections.map(section => (
            <PublicLegalSection key={section.title} section={section} />
          ))}
        </div>
      </section>
    </>
  );
}

export function PublicCookiePage() {

  return (
    <PublicShell>
      <PublicCookiePageContent />
    </PublicShell>
  );
}
