// Legal register H-06 and H-07 (owner approved 5 Nov 2026, as a narrow fix ahead of the "Privacy v2" rewrite).
//   H-06 — since 19 Jun 2026 (DPA 2018 s.164A) the privacy notice must say people can complain to us, and we must
//          acknowledge a complaint within 30 days; since 30 Sep 2026 the regulator is the Information Commission.
//          The text must not make complaining to us a precondition for going to the regulator.
//   H-07 — no drafting note on any rendered legal page in any language, and every legal page tells a non-English
//          reader, in their language, that the English text governs (translations are convenience summaries).
// The policy texts are imported and rendered for all 12 site languages; the page wiring is read from source.
//
//   npx tsx scripts/check-legal-h06-h07.mts [--publish-date "6 November 2026"]
// With --publish-date (or LEGAL_PUBLISH_DATE) the shown privacy date must be exactly that day: run it on release day.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { SUPPORTED_STUDIO_LANGUAGES } from "../lib/studioflow/language";
import { getPrivacyPolicySections, PRIVACY_POLICY_LAST_UPDATED } from "../lib/publicSite/privacyPolicy";
import { getSubprocessorsSections } from "../lib/publicSite/subprocessors";
import { getCookiePolicySections } from "../lib/publicSite/cookiePolicy";
import { getAccountDeletionPolicySections } from "../lib/publicSite/accountDeletionPolicy";
import { getSecurityOverviewSections } from "../lib/publicSite/securityOverview";
import { getDataProcessingAgreementSections } from "../lib/publicSite/dataProcessingAgreement";
import { getAcceptableUsePolicySections } from "../lib/publicSite/acceptableUsePolicy";
import { getSupportContactSections } from "../lib/publicSite/supportContact";
import { getTermsPolicySections } from "../lib/publicSite/termsPolicy";
import { getRefundCancellationPolicySections } from "../lib/publicSite/refundCancellationPolicy";
import type { PrivacyPolicySection } from "../lib/publicSite/privacyPolicy";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures: string[] = [];
let checks = 0;
const ok = (name: string, condition: unknown) => {
  checks += 1;
  if (!condition) failures.push(name);
};

const flatten = (sections: PrivacyPolicySection[]) =>
  sections
    .flatMap(section => [
      section.title,
      ...(section.paragraphs ?? []),
      ...(section.bullets ?? []),
      ...(section.subsections ?? []).flatMap(sub => [sub.title, ...(sub.paragraphs ?? []), ...(sub.bullets ?? [])])
    ])
    .join("\n");

// ---------- H-06: the English privacy text (the only text shown, in every language) ----------
const privacyEn = flatten(getPrivacyPolicySections("English"));
// The old name may appear only as "(formerly the Information Commissioner's Office".
const bareOldName = (text: string) => text.replace(/formerly the Information Commissioner's Office/g, "").includes("Information Commissioner's Office");
ok("privacy: the regulator is named the Information Commission (old name only as \"formerly ...\")", privacyEn.includes("the Information Commission (formerly the Information Commissioner's Office") && !bareOldName(privacyEn));
ok("privacy: registration reference ZC019612 kept", privacyEn.includes("registration reference ZC019612"));
ok("privacy: complaints are named among the reasons to e-mail us (section 1)", /questions, data requests, complaints, or account deletion requests/.test(privacyEn));
ok("privacy: right to complain to us is listed (section 19)", privacyEn.includes("complain to us, and to a data protection authority."));
ok("privacy: how to complain to us (contact@nivadesk.co.uk, no account needed)", /you can complain to us at contact@nivadesk\.co\.uk; you do not need to be signed in or have an account/.test(privacyEn));
ok("privacy: acknowledgement within 30 days", /acknowledge your complaint within 30 days/.test(privacyEn));
ok("privacy: investigation, progress updates and outcome without undue delay", /investigate it, keep you informed of progress and tell you the outcome without undue delay/.test(privacyEn));
ok("privacy: the Information Commission directly, at any time", /complain to the UK's data protection regulator, the Information Commission \(ico\.org\.uk[^)]*\), at any time; you do not have to complete our complaints process first/.test(privacyEn));
ok("privacy: no \"contact us first\" precondition", !/(contact|complain to|write to) us first|must (first )?(contact|complain to) us/i.test(privacyEn));
ok("privacy: 30 days is not promised as a resolution time", !/(resolve|outcome|decision)[^.]{0,40}within 30 days/i.test(privacyEn));
for (const language of SUPPORTED_STUDIO_LANGUAGES) {
  ok(`privacy (${language}): no bare "Information Commissioner's Office" on the rendered page`, !bareOldName(flatten(getPrivacyPolicySections(language))));
}

// The shown date: a real day, not before this change was made (5 Nov 2026); exact on release day when given.
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const parseDay = (label: string) => {
  const m = /^(\d{1,2}) ([A-Z][a-z]+) (\d{4})$/.exec(label.trim());
  if (!m || !months.includes(m[2])) return null;
  return Date.UTC(Number(m[3]), months.indexOf(m[2]), Number(m[1]));
};
const shown = parseDay(PRIVACY_POLICY_LAST_UPDATED);
ok(`privacy: "Last updated" is a real date written "d Month yyyy" (now "${PRIVACY_POLICY_LAST_UPDATED}")`, shown !== null);
ok(`privacy: "Last updated" is not earlier than 5 November 2026, the day of this change (now "${PRIVACY_POLICY_LAST_UPDATED}")`, shown !== null && shown >= Date.UTC(2026, 10, 5));
const argDate = process.argv.indexOf("--publish-date");
const publishDate = argDate > 0 ? process.argv[argDate + 1] : process.env.LEGAL_PUBLISH_DATE;
if (publishDate) {
  ok(`privacy: "Last updated" equals the publish day "${publishDate}" (now "${PRIVACY_POLICY_LAST_UPDATED}")`, parseDay(publishDate) !== null && parseDay(publishDate) === shown);
}

// ---------- H-07: no drafting notes on any rendered legal page, in any language ----------
const draftNote = /before publi|confirm(ed)? before|yayından önce|netleştirilmeli|vor Veröffentlichung|avant publication|prima della pubblicazione|antes de publicar|antes da publicação|до публикации|公開前|发布前|قبل النشر|publication से पहले|प्रकाशन से पहले/i;
const rendered: Array<[string, (language: never) => PrivacyPolicySection[]]> = [
  ["subprocessors", getSubprocessorsSections],
  ["privacy", getPrivacyPolicySections],
  ["terms", getTermsPolicySections],
  ["cookies", getCookiePolicySections],
  ["account deletion", getAccountDeletionPolicySections],
  ["refunds", getRefundCancellationPolicySections],
  ["security", getSecurityOverviewSections],
  ["data processing agreement", getDataProcessingAgreementSections],
  ["acceptable use", getAcceptableUsePolicySections],
  ["support and contact", getSupportContactSections]
];
for (const [name, getSections] of rendered) {
  const hits = SUPPORTED_STUDIO_LANGUAGES.filter(language => draftNote.test(flatten(getSections(language as never))));
  ok(`${name}: no drafting note ("confirm before publication") in any language${hits.length ? " — found in: " + hits.join(", ") : ""}`, hits.length === 0);
}

// ---------- H-07: the governing-language notice, in every non-English language ----------
type NoticeCopy = { title: string; english: string; summary: string; complaints: string };
let noticeModule: { LEGAL_LANGUAGE_NOTICE_EN: NoticeCopy; getLegalLanguageNotice: (language: string) => NoticeCopy } | null = null;
try {
  noticeModule = await import("../lib/publicSite/legalLanguageNotice");
} catch {
  noticeModule = null;
}
ok("lib/publicSite/legalLanguageNotice.ts exists (the notice in the reader's language)", noticeModule !== null);
if (noticeModule) {
  const en = noticeModule.LEGAL_LANGUAGE_NOTICE_EN;
  ok("notice (English source): a translated page says it is a summary for convenience and English governs", /summary translation provided for convenience\. The English version is the current, governing text/.test(en.summary));
  ok("notice (English source): an English-only page says the English version governs", /The English version is the current, governing text/.test(en.english));
  ok("notice (English source): complaints — us, 30-day acknowledgement, Information Commission at any time", /contact@nivadesk\.co\.uk/.test(en.complaints) && /acknowledge complaints within 30 days/.test(en.complaints) && /Information Commission \(ico\.org\.uk\), at any time/.test(en.complaints));
  for (const language of SUPPORTED_STUDIO_LANGUAGES) {
    if (language === "English") continue;
    const copy = noticeModule.getLegalLanguageNotice(language);
    const translated = copy !== en && copy.title !== en.title && copy.english !== en.english && copy.summary !== en.summary && copy.complaints !== en.complaints;
    ok(`notice (${language}): translated, not the English source`, translated && copy.title && copy.english && copy.summary && copy.complaints);
    ok(`notice (${language}): complaint line keeps the address, 30 days and the regulator's name`, copy.complaints.includes("contact@nivadesk.co.uk") && /30/.test(copy.complaints) && copy.complaints.includes("Information Commission") && copy.complaints.includes("ico.org.uk") && !copy.complaints.includes("Commissioner"));
  }
}

// ---------- H-07: every legal page renders the notice (read from source) ----------
const marketing = fs.readFileSync(path.join(root, "components", "PublicMarketing.tsx"), "utf8");
const body = (name: string) => {
  const start = marketing.indexOf(`function ${name}(`);
  if (start < 0) return "";
  const next = marketing.slice(start + 1).search(/\n(export )?function /);
  return next < 0 ? marketing.slice(start) : marketing.slice(start, start + 1 + next);
};
const notice = body("PublicLegalLanguageNotice");
ok("PublicLegalLanguageNotice uses the reader's language (getLegalLanguageNotice), no hard-coded English", notice.includes("getLegalLanguageNotice(language)") && !notice.includes("The current authoritative version"));
ok("PublicLegalLanguageNotice shows the summary text for a translated page and the English-text notice otherwise", /translated \? notice\.summary : notice\.english/.test(notice));
const pages: Array<[string, string, string]> = [
  ["PublicPrivacyPageContent", "privacyPolicySections", "PRIVACY_POLICY_SECTIONS"],
  ["PublicTermsPageContent", "termsPolicySections", "TERMS_POLICY_SECTIONS"],
  ["PublicCookiePageContent", "cookiePolicySections", "COOKIE_POLICY_SECTIONS"],
  ["PublicAccountDeletionPageContent", "accountDeletionPolicySections", "ACCOUNT_DELETION_POLICY_SECTIONS"],
  ["PublicRefundCancellationPageContent", "refundCancellationPolicySections", "REFUND_CANCELLATION_POLICY_SECTIONS"],
  ["PublicSecurityPageContent", "securityOverviewSections", "SECURITY_OVERVIEW_SECTIONS"],
  ["PublicSubprocessorsPageContent", "subprocessorsSections", "SUBPROCESSORS_SECTIONS"],
  ["PublicDataProcessingAgreementPageContent", "dataProcessingAgreementSections", "DATA_PROCESSING_AGREEMENT_SECTIONS"],
  ["PublicAcceptableUsePageContent", "acceptableUsePolicySections", "ACCEPTABLE_USE_POLICY_SECTIONS"],
  ["PublicContactPageContent", "supportContactSections", "SUPPORT_CONTACT_SECTIONS"]
];
for (const [name, shownVar, englishConst] of pages) {
  const page = body(name);
  const wired = new RegExp(`<PublicLegalLanguageNotice[\\s\\S]{0,120}translated=\\{${shownVar} !== ${englishConst}\\}`).test(page);
  ok(`${name}: renders the language notice and tells a translated summary from the English text`, page !== "" && wired);
}
ok("PublicPrivacyPageContent: the notice includes how to complain", /<PublicLegalLanguageNotice[\s\S]{0,160}complaints\s*\n?\s*\/>/.test(body("PublicPrivacyPageContent")));

if (failures.length) {
  console.error(`legal-h06-h07: ${checks - failures.length}/${checks} passed\n` + failures.map(f => `  FAIL ${f}`).join("\n"));
  process.exit(1);
}
console.log(`legal-h06-h07: ${checks}/${checks} passed`);
