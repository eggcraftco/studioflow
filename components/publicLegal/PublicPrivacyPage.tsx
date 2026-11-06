"use client";

// Privacy Policy page, split out of components/PublicMarketing.tsx on 6 Nov 2026 (site speed): its policy text
// (lib/publicSite/privacyPolicy.ts, every language's summary) is now downloaded on this page only, not on every public page.
// The component below is the one that lived in PublicMarketing.tsx, unchanged.
import { PublicShell } from "@/components/PublicMarketing";
import { PublicLegalLanguageNotice, PublicLegalSection } from "@/components/publicLegal/PublicLegalDocument";
import { usePublicSiteLanguage } from "@/lib/publicSite/i18n";
import {
  getPrivacyPolicyLastUpdatedLabel,
  getPrivacyPolicySections,
  PRIVACY_POLICY_LAST_UPDATED,
  PRIVACY_POLICY_SECTIONS
} from "@/lib/publicSite/privacyPolicy";

function PublicPrivacyPageContent() {
  const { language, t } = usePublicSiteLanguage();
  const privacyPolicySections = getPrivacyPolicySections(language);
  return (
    <>
      <section className="public-page-hero public-info-hero">
        <div className="public-shell">
          <span className="public-eyebrow">{t("privacy.eyebrow")}</span>
          <h1>{t("privacy.title")}</h1>
          <p>{t("privacy.body")}</p>
          <p className="public-legal-updated">
            {getPrivacyPolicyLastUpdatedLabel(language)}: {PRIVACY_POLICY_LAST_UPDATED}
          </p>
        </div>
      </section>

      <section className="public-section">
        <div className="public-shell public-legal-document">
          <PublicLegalLanguageNotice
            language={language}
            translated={privacyPolicySections !== PRIVACY_POLICY_SECTIONS}
            complaints
          />
          {privacyPolicySections.map(section => (
            <PublicLegalSection key={section.title} section={section} />
          ))}
        </div>
      </section>
    </>
  );
}

export function PublicPrivacyPage() {

  return (
    <PublicShell>
      <PublicPrivacyPageContent />
    </PublicShell>
  );
}
