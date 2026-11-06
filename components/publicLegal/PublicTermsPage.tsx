"use client";

// Terms of Service page, split out of components/PublicMarketing.tsx on 6 Nov 2026 (site speed): its policy text
// (lib/publicSite/termsPolicy.ts, every language's summary) is now downloaded on this page only, not on every public page.
// The component below is the one that lived in PublicMarketing.tsx, unchanged.
import { PublicShell } from "@/components/PublicMarketing";
import { PublicLegalLanguageNotice, PublicLegalSection } from "@/components/publicLegal/PublicLegalDocument";
import { usePublicSiteLanguage } from "@/lib/publicSite/i18n";
import {
  getTermsPolicyLastUpdatedLabel,
  getTermsPolicySections,
  TERMS_POLICY_LAST_UPDATED,
  TERMS_POLICY_SECTIONS
} from "@/lib/publicSite/termsPolicy";

function PublicTermsPageContent() {
  const { language, t } = usePublicSiteLanguage();
  const termsPolicySections = getTermsPolicySections(language);
  return (
    <>
      <section className="public-page-hero public-info-hero">
        <div className="public-shell">
          <span className="public-eyebrow">{t("terms.eyebrow")}</span>
          <h1>{t("terms.title")}</h1>
          <p>{t("terms.body")}</p>
          <p className="public-legal-updated">
            {getTermsPolicyLastUpdatedLabel(language)}: {TERMS_POLICY_LAST_UPDATED}
          </p>
        </div>
      </section>

      <section className="public-section">
        <div className="public-shell public-legal-document">
          <PublicLegalLanguageNotice language={language} translated={termsPolicySections !== TERMS_POLICY_SECTIONS} />
          {termsPolicySections.map(section => (
            <PublicLegalSection key={section.title} section={section} />
          ))}
        </div>
      </section>
    </>
  );
}

export function PublicTermsPage() {

  return (
    <PublicShell>
      <PublicTermsPageContent />
    </PublicShell>
  );
}
