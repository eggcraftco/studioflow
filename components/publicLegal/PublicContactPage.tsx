"use client";

// Contact (support contact) page, split out of components/PublicMarketing.tsx on 6 Nov 2026 (site speed): its policy text
// (lib/publicSite/supportContact.ts, every language's summary) is now downloaded on this page only, not on every public page.
// The component below is the one that lived in PublicMarketing.tsx, unchanged.
import { PublicShell } from "@/components/PublicMarketing";
import { PublicLegalLanguageNotice, PublicLegalSection } from "@/components/publicLegal/PublicLegalDocument";
import { usePublicSiteLanguage } from "@/lib/publicSite/i18n";
import {
  getSupportContactLastUpdatedLabel,
  getSupportContactSections,
  SUPPORT_CONTACT_LAST_UPDATED,
  SUPPORT_CONTACT_SECTIONS
} from "@/lib/publicSite/supportContact";

function PublicContactPageContent() {
  const { language, t } = usePublicSiteLanguage();
  const supportContactSections = getSupportContactSections(language);
  return (
    <>
      <section className="public-page-hero public-info-hero">
        <div className="public-shell">
          <span className="public-eyebrow">{t("contact.eyebrow")}</span>
          <h1>{t("contact.title")}</h1>
          <p>{t("contact.body")}</p>
          <p className="public-legal-updated">
            {getSupportContactLastUpdatedLabel(language)}: {SUPPORT_CONTACT_LAST_UPDATED}
          </p>
        </div>
      </section>

      <section className="public-section">
        <div className="public-shell public-legal-document">
          <PublicLegalLanguageNotice language={language} translated={supportContactSections !== SUPPORT_CONTACT_SECTIONS} />
          {supportContactSections.map(section => (
            <PublicLegalSection key={section.title} section={section} />
          ))}
        </div>
      </section>
    </>
  );
}

export function PublicContactPage() {

  return (
    <PublicShell>
      <PublicContactPageContent />
    </PublicShell>
  );
}
