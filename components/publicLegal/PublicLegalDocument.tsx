// The blocks every legal/policy page is built from (components/publicLegal/Public*Page.tsx), moved verbatim out of
// components/PublicMarketing.tsx on 6 Nov 2026 so the policy texts load only on their own pages.
import type { StudioLanguage } from "@/lib/studioflow/languageCore";
import type { PrivacyPolicySection, PrivacyPolicySubsection } from "@/lib/publicSite/privacyPolicy";
import { getLegalLanguageNotice } from "@/lib/publicSite/legalLanguageNotice";

function PublicLegalParagraph({ text }: { text: string }) {
  return <p className={text.includes("\n") ? "public-legal-preline" : undefined}>{text}</p>;
}

function PublicLegalSubsection({ subsection }: { subsection: PrivacyPolicySubsection }) {
  return (
    <div className="public-legal-subsection">
      {subsection.title ? <h3>{subsection.title}</h3> : null}
      {subsection.paragraphs?.map(paragraph => (
        <PublicLegalParagraph key={paragraph} text={paragraph} />
      ))}
      {subsection.bullets ? (
        <ul>
          {subsection.bullets.map(item => <li key={item}>{item}</li>)}
        </ul>
      ) : null}
    </div>
  );
}

// NIVADESK_HUKUK.md H-07: every legal page tells a non-English reader, in their language, that the English text
// governs — `translated` when the page below is a translated summary, otherwise that it is shown in English.
// H-06: the Privacy page adds how to complain (to us, or to the Information Commission, which may ask whether it was raised with us first).
// Copy and its English source: lib/publicSite/legalLanguageNotice.ts.
export function PublicLegalLanguageNotice({
  language,
  translated,
  complaints = false
}: {
  language: StudioLanguage;
  translated: boolean;
  complaints?: boolean;
}) {
  if (language === "English") return null;
  const notice = getLegalLanguageNotice(language);

  return (
    <article className="public-card public-legal-card">
      <h2>{notice.title}</h2>
      <p>{translated ? notice.summary : notice.english}</p>
      {complaints ? <p>{notice.complaints}</p> : null}
    </article>
  );
}

export function PublicLegalSection({ section }: { section: PrivacyPolicySection }) {
  return (
    <article className="public-card public-legal-card">
      <h2>{section.title}</h2>
      {section.paragraphs?.map(paragraph => (
        <PublicLegalParagraph key={paragraph} text={paragraph} />
      ))}
      {section.bullets ? (
        <ul>
          {section.bullets.map(item => <li key={item}>{item}</li>)}
        </ul>
      ) : null}
      {section.subsections?.map((subsection, index) => (
        <PublicLegalSubsection
          key={`${section.title}-${subsection.title || index}`}
          subsection={subsection}
        />
      ))}
    </article>
  );
}
