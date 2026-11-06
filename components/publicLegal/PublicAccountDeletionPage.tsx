"use client";

// Account deletion page, split out of components/PublicMarketing.tsx on 6 Nov 2026 (site speed): its policy text
// (lib/publicSite/accountDeletionPolicy.ts, every language's summary) is now downloaded on this page only, not on every public page.
// The component below is the one that lived in PublicMarketing.tsx, unchanged.
import { PublicShell } from "@/components/PublicMarketing";
import { PublicLegalLanguageNotice, PublicLegalSection } from "@/components/publicLegal/PublicLegalDocument";
import { usePublicSiteLanguage } from "@/lib/publicSite/i18n";
import {
  ACCOUNT_DELETION_POLICY_LAST_UPDATED,
  ACCOUNT_DELETION_POLICY_SECTIONS,
  getAccountDeletionPolicyLastUpdatedLabel,
  getAccountDeletionPolicySections
} from "@/lib/publicSite/accountDeletionPolicy";

function PublicAccountDeletionPageContent() {
  const { language, t } = usePublicSiteLanguage();
  const accountDeletionPolicySections = getAccountDeletionPolicySections(language);
  return (
    <>
      <section className="public-page-hero public-info-hero">
        <div className="public-shell">
          <span className="public-eyebrow">{t("accountDeletion.eyebrow")}</span>
          <h1>{t("accountDeletion.title")}</h1>
          <p>{t("accountDeletion.body")}</p>
          <p className="public-legal-updated">
            {getAccountDeletionPolicyLastUpdatedLabel(language)}: {ACCOUNT_DELETION_POLICY_LAST_UPDATED}
          </p>
        </div>
      </section>

      <section className="public-section">
        <div className="public-shell public-legal-document">
          <PublicLegalLanguageNotice language={language} translated={accountDeletionPolicySections !== ACCOUNT_DELETION_POLICY_SECTIONS} />
          {accountDeletionPolicySections.map(section => (
            <PublicLegalSection key={section.title} section={section} />
          ))}
        </div>
      </section>
    </>
  );
}

export function PublicAccountDeletionPage() {

  return (
    <PublicShell>
      <PublicAccountDeletionPageContent />
    </PublicShell>
  );
}
