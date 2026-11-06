"use client";

// Refund and cancellation page, split out of components/PublicMarketing.tsx on 6 Nov 2026 (site speed): its policy text
// (lib/publicSite/refundCancellationPolicy.ts, every language's summary) is now downloaded on this page only, not on every public page.
// The component below is the one that lived in PublicMarketing.tsx, unchanged.
import { PublicShell } from "@/components/PublicMarketing";
import { PublicLegalLanguageNotice, PublicLegalSection } from "@/components/publicLegal/PublicLegalDocument";
import { usePublicSiteLanguage } from "@/lib/publicSite/i18n";
import {
  getRefundCancellationPolicyLastUpdatedLabel,
  getRefundCancellationPolicySections,
  REFUND_CANCELLATION_POLICY_LAST_UPDATED,
  REFUND_CANCELLATION_POLICY_SECTIONS
} from "@/lib/publicSite/refundCancellationPolicy";

function PublicRefundCancellationPageContent() {
  const { language, t } = usePublicSiteLanguage();
  const refundCancellationPolicySections = getRefundCancellationPolicySections(language);
  return (
    <>
      <section className="public-page-hero public-info-hero">
        <div className="public-shell">
          <span className="public-eyebrow">{t("refundCancellation.eyebrow")}</span>
          <h1>{t("refundCancellation.title")}</h1>
          <p>{t("refundCancellation.body")}</p>
          <p className="public-legal-updated">
            {getRefundCancellationPolicyLastUpdatedLabel(language)}: {REFUND_CANCELLATION_POLICY_LAST_UPDATED}
          </p>
        </div>
      </section>

      <section className="public-section">
        <div className="public-shell public-legal-document">
          <PublicLegalLanguageNotice
            language={language}
            translated={refundCancellationPolicySections !== REFUND_CANCELLATION_POLICY_SECTIONS}
          />
          {refundCancellationPolicySections.map(section => (
            <PublicLegalSection key={section.title} section={section} />
          ))}
        </div>
      </section>
    </>
  );
}

export function PublicRefundCancellationPage() {

  return (
    <PublicShell>
      <PublicRefundCancellationPageContent />
    </PublicShell>
  );
}
