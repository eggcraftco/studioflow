"use client";

// Subprocessors page, split out of components/PublicMarketing.tsx on 6 Nov 2026 (site speed): its policy text
// (lib/publicSite/subprocessors.ts, every language's summary) is now downloaded on this page only, not on every public page.
// The component below is the one that lived in PublicMarketing.tsx, unchanged.
import { PublicShell } from "@/components/PublicMarketing";
import { PublicLegalLanguageNotice, PublicLegalSection } from "@/components/publicLegal/PublicLegalDocument";
import { usePublicSiteLanguage } from "@/lib/publicSite/i18n";
import {
  getSubprocessorsLastUpdatedLabel,
  getSubprocessorsSections,
  SUBPROCESSORS_LAST_UPDATED,
  SUBPROCESSORS_SECTIONS
} from "@/lib/publicSite/subprocessors";

function PublicSubprocessorsPageContent() {
  const { language, t } = usePublicSiteLanguage();
  const subprocessorsSections = getSubprocessorsSections(language);
  return (
    <>
      <section className="public-page-hero public-info-hero">
        <div className="public-shell">
          <span className="public-eyebrow">{t("subprocessors.eyebrow")}</span>
          <h1>{t("subprocessors.title")}</h1>
          <p>{t("subprocessors.body")}</p>
          <p className="public-legal-updated">
            {getSubprocessorsLastUpdatedLabel(language)}: {SUBPROCESSORS_LAST_UPDATED}
          </p>
        </div>
      </section>

      <section className="public-section">
        <div className="public-shell public-legal-document">
          <PublicLegalLanguageNotice language={language} translated={subprocessorsSections !== SUBPROCESSORS_SECTIONS} />
          {subprocessorsSections.map(section => (
            <PublicLegalSection key={section.title} section={section} />
          ))}
        </div>
      </section>
    </>
  );
}

export function PublicSubprocessorsPage() {

  return (
    <PublicShell>
      <PublicSubprocessorsPageContent />
    </PublicShell>
  );
}
