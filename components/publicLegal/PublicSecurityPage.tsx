"use client";

// Security overview page, split out of components/PublicMarketing.tsx on 6 Nov 2026 (site speed): its policy text
// (lib/publicSite/securityOverview.ts, every language's summary) is now downloaded on this page only, not on every public page.
// The component below is the one that lived in PublicMarketing.tsx, unchanged.
import { PublicShell } from "@/components/PublicMarketing";
import { PublicLegalLanguageNotice, PublicLegalSection } from "@/components/publicLegal/PublicLegalDocument";
import { usePublicSiteLanguage } from "@/lib/publicSite/i18n";
import {
  getSecurityOverviewLastUpdatedLabel,
  getSecurityOverviewSections,
  SECURITY_OVERVIEW_LAST_UPDATED,
  SECURITY_OVERVIEW_SECTIONS
} from "@/lib/publicSite/securityOverview";

function PublicSecurityPageContent() {
  const { language, t } = usePublicSiteLanguage();
  const securityOverviewSections = getSecurityOverviewSections(language);
  return (
    <>
      <section className="public-page-hero public-info-hero">
        <div className="public-shell">
          <span className="public-eyebrow">{t("security.eyebrow")}</span>
          <h1>{t("security.title")}</h1>
          <p>{t("security.body")}</p>
          <p className="public-legal-updated">
            {getSecurityOverviewLastUpdatedLabel(language)}: {SECURITY_OVERVIEW_LAST_UPDATED}
          </p>
        </div>
      </section>

      <section className="public-section">
        <div className="public-shell public-legal-document">
          <PublicLegalLanguageNotice language={language} translated={securityOverviewSections !== SECURITY_OVERVIEW_SECTIONS} />
          {securityOverviewSections.map(section => (
            <PublicLegalSection key={section.title} section={section} />
          ))}
        </div>
      </section>
    </>
  );
}

export function PublicSecurityPage() {

  return (
    <PublicShell>
      <PublicSecurityPageContent />
    </PublicShell>
  );
}
