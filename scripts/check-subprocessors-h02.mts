// Legal register H-02 (narrow fix, separate from the v2 rewrite): the Subprocessors page must list the providers
// NivaDesk uses today, with a location for each, and must not carry the generic rows for tools NivaDesk does not use.
// The list below is the inventory of 6 Nov 2026 (main repository docs/legal/H02-ALT-ISLEYEN-ENVANTERI-2026-11-06.md):
//   group "5"   — our subprocessors for workspace data       (English section "5. Subprocessors for the data …")
//   group "5A"  — service providers for NivaDesk's own work  (English section "5A. …")
//   group "5B"  — services a workspace connects itself        (English section "5B. …")
//   group "NONE" — must not appear on the page in any language (unused, closed, or no personal data).
// "token" (when set) must appear in every one of the 11 translated summaries too.
//
//   npx tsx scripts/check-subprocessors-h02.mts [--publish-date "6 November 2026"] [--narrow-release]
//                                               [--inventory <path to the inventory .md>]
// --publish-date: the shown date must be exactly that day (run it on release day; the owner's commands pass today's
//                 London date). --narrow-release: also asserts the DPA, Terms, Privacy and page section 11 are untouched
//                 (this package changes only the list). --inventory: the inventory table and this list must match.
import fs from "fs";
import { SUPPORTED_STUDIO_LANGUAGES } from "../lib/studioflow/language";
import { getSubprocessorsSections, SUBPROCESSORS_LAST_UPDATED, SUBPROCESSORS_SECTIONS } from "../lib/publicSite/subprocessors";
import type { PrivacyPolicySection } from "../lib/publicSite/privacyPolicy";

type Group = "5" | "5A" | "5B" | "NONE";
type Row = { name: string; group: Group; token: string | null };

const INVENTORY: Row[] = [
  { name: "Google Cloud and Firebase", group: "5", token: "Firebase" },
  { name: "Google Cloud Vision", group: "5", token: "Google Cloud Vision" },
  { name: "Google document viewer", group: "5", token: "Android" },
  { name: "Hostinger", group: "5", token: "Hostinger" },
  { name: "Cloudflare", group: "5", token: "Cloudflare" },
  { name: "17TRACK", group: "5", token: "17TRACK" },
  { name: "Twilio", group: "5", token: "Twilio" },
  { name: "WhatsApp Business Platform", group: "5", token: "WhatsApp" },
  { name: "Google Analytics for Firebase", group: "5A", token: "Google Analytics for Firebase" },
  { name: "Google reCAPTCHA", group: "5A", token: "reCAPTCHA" },
  { name: "OpenAI", group: "5A", token: "OpenAI" },
  { name: "Stripe", group: "5A", token: "Stripe" },
  { name: "Apple", group: "5A", token: "Apple" },
  { name: "Google Play", group: "5A", token: "Google Play" },
  { name: "Shopify", group: "5A", token: "Shopify" },
  { name: "Etsy", group: "5B", token: null },
  { name: "eBay", group: "5B", token: null },
  { name: "WooCommerce", group: "5B", token: null },
  { name: "Square", group: "5B", token: null },
  { name: "QuickBooks", group: "5B", token: "QuickBooks" },
  { name: "Xero", group: "5B", token: "Xero" },
  { name: "TrueLayer", group: "5B", token: "TrueLayer" },
  { name: "PayPal", group: "5B", token: "PayPal" },
  { name: "Stripe Connect", group: "5B", token: "Stripe Connect" },
  { name: "DHL Express", group: "5B", token: "DHL Express" },
  { name: "Royal Mail", group: "5B", token: "Royal Mail" },
  { name: "Google Calendar", group: "5B", token: null },
  { name: "Google Drive", group: "5B", token: null },
  { name: "Microsoft Outlook calendar", group: "5B", token: null },
  { name: "Instagram", group: "5B", token: "Instagram" },
  { name: "OpenAI API key for Quick Reply", group: "5B", token: null },
  { name: "ChatGPT", group: "5B", token: "ChatGPT" },
  { name: "Claude", group: "5B", token: "Claude" },
  { name: "Google Ads", group: "NONE", token: null },
  { name: "Trendyol", group: "NONE", token: null },
  { name: "Pandle", group: "NONE", token: null },
  { name: "Amazon", group: "NONE", token: null },
  { name: "Dropbox", group: "NONE", token: null },
  { name: "OneDrive", group: "NONE", token: null },
  { name: "Sentry", group: "NONE", token: null },
  { name: "Crashlytics", group: "NONE", token: null },
  { name: "Crash/error monitoring provider", group: "NONE", token: null },
  { name: "Customer support provider", group: "NONE", token: null },
  { name: "Analytics provider", group: "NONE", token: null },
  { name: "Email delivery provider", group: "NONE", token: null },
  { name: "UK Trade Tariff", group: "NONE", token: null }
];

const failures: string[] = [];
let checks = 0;
const ok = (name: string, condition: unknown) => {
  checks += 1;
  if (!condition) failures.push(name);
};
const arg = (flag: string) => {
  const i = process.argv.indexOf(flag);
  return i > 0 ? process.argv[i + 1] : undefined;
};

const flattenSection = (section: PrivacyPolicySection) =>
  [
    section.title,
    ...(section.paragraphs ?? []),
    ...(section.bullets ?? []),
    ...(section.subsections ?? []).flatMap(sub => [sub.title, ...(sub.paragraphs ?? []), ...(sub.bullets ?? [])])
  ].join("\n");
const flatten = (sections: PrivacyPolicySection[]) => sections.map(flattenSection).join("\n");
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const has = (text: string, name: string) => new RegExp(`(^|[^A-Za-z0-9])${escapeRe(name)}([^A-Za-z0-9]|$)`).test(text);

const english = SUBPROCESSORS_SECTIONS;
const englishText = flatten(english);
const sectionByPrefix = (prefix: string) => english.find(s => s.title.startsWith(prefix));
const sectionText: Record<Exclude<Group, "NONE">, string> = {
  "5": flattenSection(sectionByPrefix("5. ") ?? { title: "" }),
  "5A": flattenSection(sectionByPrefix("5A. ") ?? { title: "" }),
  "5B": flattenSection(sectionByPrefix("5B. ") ?? { title: "" })
};

// ---------- structure: the three groups exist, under the right headings ----------
ok('English: section "5. Subprocessors for the data you keep in NivaDesk" exists', sectionByPrefix("5. ")?.title === "5. Subprocessors for the data you keep in NivaDesk");
ok("English: section \"5A. Service providers for NivaDesk's own activities\" exists", sectionByPrefix("5A. ")?.title === "5A. Service providers for NivaDesk's own activities");
ok('English: section "5B. Services your workspace connects" exists', sectionByPrefix("5B. ")?.title === "5B. Services your workspace connects");
ok('English: no "Current and expected subprocessors" heading', !englishText.includes("Current and expected subprocessors"));

// ---------- every inventory row: listed in its group (English) and, with a token, in all 11 translations ----------
const translated = SUPPORTED_STUDIO_LANGUAGES.filter(l => l !== "English");
for (const row of INVENTORY) {
  if (row.group === "NONE") {
    const hits = SUPPORTED_STUDIO_LANGUAGES.filter(l => has(flatten(getSubprocessorsSections(l)), row.name));
    ok(`NONE "${row.name}": not on the page in any language${hits.length ? " — found in: " + hits.join(", ") : ""}`, hits.length === 0);
    continue;
  }
  ok(`${row.group} "${row.name}": listed in English section ${row.group}`, has(sectionText[row.group], row.name));
  if (row.token) {
    const token = row.token;
    const missing = translated.filter(l => !has(flatten(getSubprocessorsSections(l)), token));
    ok(`${row.group} "${row.name}": "${token}" in all 11 translations${missing.length ? " — missing in: " + missing.join(", ") : ""}`, missing.length === 0);
  }
}

// ---------- every provider entry in sections 5 and 5A says where it operates ----------
for (const prefix of ["5. ", "5A. "]) {
  for (const sub of sectionByPrefix(prefix)?.subsections ?? []) {
    const paragraphs = sub.paragraphs ?? [];
    const pointer = paragraphs.length === 1 && /as in section 5/.test(paragraphs[0]);
    ok(`${prefix.trim()} "${sub.title}": has a "Location:" line`, pointer || paragraphs.some(p => /^Location: \S/.test(p)));
  }
}
ok('section 5: the London region is named for the database', /London region \(europe-west2\)/.test(sectionText["5"]));
ok('section 5: "on trial" providers are explained', /marked "on trial" processes data only for the workspaces where we have turned that feature on/.test(sectionText["5"]));

// ---------- stale rows and words are gone, in every language ----------
const STALE = /crash|monitoring|expected subprocessors|beklenen|erwartete|attendus|previsti|previstos|esperados|ожидаемые|想定|预期|المتوقع/i;
for (const language of SUPPORTED_STUDIO_LANGUAGES) {
  const text = flatten(getSubprocessorsSections(language));
  const m = STALE.exec(text);
  ok(`${language}: no crash-reporting / "expected subprocessors" wording${m ? ` — found "${m[0]}"` : ""}`, !m);
  ok(`${language}: no advertising tag (Google Ads / gtag)`, !/Google Ads|googletagmanager|AW-\d/.test(text));
}

// ---------- registered office (5 Nov 2026) ----------
ok('English: "141d Randolph Avenue" shown', englishText.includes("141d Randolph Avenue"));
ok('all languages: no "141 Randolph" without the "d"', SUPPORTED_STUDIO_LANGUAGES.every(l => !/141 Randolph/.test(flatten(getSubprocessorsSections(l)))));

// ---------- the date: a real day, not before this change (6 Nov 2026); exactly the publish day when given ----------
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const parseDay = (label: string) => {
  const m = /^(\d{1,2}) ([A-Z][a-z]+) (\d{4})$/.exec(label.trim());
  if (!m || !months.includes(m[2])) return null;
  return Date.UTC(Number(m[3]), months.indexOf(m[2]), Number(m[1]));
};
const shown = parseDay(SUBPROCESSORS_LAST_UPDATED);
ok(`"Last updated" is a real date written "d Month yyyy" (now "${SUBPROCESSORS_LAST_UPDATED}")`, shown !== null);
ok(`"Last updated" is not earlier than 6 November 2026, the day of this list (now "${SUBPROCESSORS_LAST_UPDATED}")`, shown !== null && shown >= Date.UTC(2026, 10, 6));
const publishDate = arg("--publish-date") ?? process.env.LEGAL_PUBLISH_DATE;
if (publishDate) {
  ok(`"Last updated" equals the publish day "${publishDate}" (now "${SUBPROCESSORS_LAST_UPDATED}")`, parseDay(publishDate) !== null && parseDay(publishDate) === shown);
}

// ---------- narrow release: nothing but the list changes (no DPA, Terms or notice-period change) ----------
if (process.argv.includes("--narrow-release")) {
  const { DATA_PROCESSING_AGREEMENT_LAST_UPDATED, getDataProcessingAgreementSections } = await import("../lib/publicSite/dataProcessingAgreement");
  const { TERMS_POLICY_LAST_UPDATED } = await import("../lib/publicSite/termsPolicy");
  const { PRIVACY_POLICY_LAST_UPDATED } = await import("../lib/publicSite/privacyPolicy");
  ok(`narrow: DPA date unchanged "13 May 2026" (now "${DATA_PROCESSING_AGREEMENT_LAST_UPDATED}")`, DATA_PROCESSING_AGREEMENT_LAST_UPDATED === "13 May 2026");
  ok(`narrow: Terms date unchanged "28 September 2026" (now "${TERMS_POLICY_LAST_UPDATED}")`, TERMS_POLICY_LAST_UPDATED === "28 September 2026");
  ok(`narrow: Privacy date unchanged "5 November 2026" (now "${PRIVACY_POLICY_LAST_UPDATED}")`, PRIVACY_POLICY_LAST_UPDATED === "5 November 2026");
  const dpa = flatten(getDataProcessingAgreementSections("English"));
  ok("narrow: DPA section 12 still the live text (reasonable notice; no fixed notice period)", dpa.includes("Where required by Applicable Data Protection Laws, NivaDesk will provide reasonable notice of material Subprocessor changes, for example by updating a Subprocessors page, sending notice, or providing in-app notice."));
  const s11 = english.find(s => s.title === "11. Changes to subprocessors");
  ok("narrow: page section 11 is the live text, word for word", JSON.stringify(s11?.paragraphs) === JSON.stringify([
    "NivaDesk may add, replace, or remove subprocessors as our service develops.",
    "We will update this page when material subprocessors change. Business customers that have a Data Processing Agreement with us may have additional notification rights as described in that agreement.",
    "If you have concerns about a new subprocessor, contact us at contact@nivadesk.co.uk."
  ]));
  ok("narrow: the page makes no new notice-period promise (no \"30 days\")", !/30 days|thirty days/i.test(englishText));
}

// ---------- the inventory file and this list are the same list ----------
const inventoryPath = arg("--inventory");
if (inventoryPath) {
  const md = fs.readFileSync(inventoryPath, "utf8");
  const block = /<!-- h02-inventory:start -->([\s\S]*?)<!-- h02-inventory:end -->/.exec(md)?.[1] ?? "";
  const rows = block
    .split("\n")
    .filter(line => line.startsWith("|") && !/^\|\s*-/.test(line) && !/Sayfadaki ad/.test(line))
    .map(line => line.split("|").slice(1, 4).map(c => c.trim()))
    .map(([name, group, token]) => `${name}|${group === "YOK" ? "NONE" : group}|${token === "—" ? "" : token}`);
  const mine = INVENTORY.map(r => `${r.name}|${r.group}|${r.token ?? ""}`);
  const onlyInFile = rows.filter(r => !mine.includes(r));
  const onlyHere = mine.filter(r => !rows.includes(r));
  ok(`inventory file has rows (${rows.length})`, rows.length > 0);
  ok(`inventory file = this list${onlyInFile.length ? " — only in the file: " + onlyInFile.join("; ") : ""}${onlyHere.length ? " — only in the check: " + onlyHere.join("; ") : ""}`, onlyInFile.length === 0 && onlyHere.length === 0);
}

if (failures.length) {
  console.error(`subprocessors-h02: ${checks - failures.length}/${checks} passed\n` + failures.map(f => `  FAIL ${f}`).join("\n"));
  process.exit(1);
}
console.log(`subprocessors-h02: ${checks}/${checks} passed`);
