"use client";

// Acceptable Use Policy page, split out of components/PublicMarketing.tsx on 6 Nov 2026 (site speed): its policy text
// (lib/publicSite/acceptableUsePolicy.ts, every language's summary) is now downloaded on this page only, not on every public page.
// The component below is the one that lived in PublicMarketing.tsx, unchanged.
import { PublicShell } from "@/components/PublicMarketing";
import { PublicLegalLanguageNotice, PublicLegalSection } from "@/components/publicLegal/PublicLegalDocument";
import { usePublicSiteLanguage } from "@/lib/publicSite/i18n";
import {
  ACCEPTABLE_USE_POLICY_LAST_UPDATED,
  ACCEPTABLE_USE_POLICY_SECTIONS,
  getAcceptableUsePolicyLastUpdatedLabel,
  getAcceptableUsePolicySections
} from "@/lib/publicSite/acceptableUsePolicy";

function PublicAcceptableUsePageContent() {
  const { language, t } = usePublicSiteLanguage();
  const acceptableUsePolicySections = getAcceptableUsePolicySections(language);
  return (
    <>
      <section className="public-page-hero public-info-hero">
        <div className="public-shell">
          <span className="public-eyebrow">{t("acceptableUse.eyebrow")}</span>
          <h1>{t("acceptableUse.title")}</h1>
          <p>{t("acceptableUse.body")}</p>
          <p className="public-legal-updated">
            {getAcceptableUsePolicyLastUpdatedLabel(language)}: {ACCEPTABLE_USE_POLICY_LAST_UPDATED}
          </p>
        </div>
      </section>

      <section className="public-section">
        <div className="public-shell public-legal-document">
          <PublicLegalLanguageNotice language={language} translated={acceptableUsePolicySections !== ACCEPTABLE_USE_POLICY_SECTIONS} />
          {acceptableUsePolicySections.map(section => (
            <PublicLegalSection key={section.title} section={section} />
          ))}
        </div>
      </section>
    </>
  );
}

export function PublicAcceptableUsePage() {

  return (
    <PublicShell>
      <PublicAcceptableUsePageContent />
    </PublicShell>
  );
}
