// Settings → PDF Export Settings: the preview follows every switch and the
// viewer's permissions (8 Oct 2026).
//
// 1. The settings→render mapping. lib/studioflow/pdfDocumentOptions.ts is
//    compiled with the tree's own TypeScript and run: every one of the twelve
//    switches moves exactly its own section, a missing switch takes its
//    default, and the three money sections obey the permission mask whatever
//    the stored value says (Financial Info off → no Paid/Remaining, no Payment
//    Method, no Internal Financials; advanced finance off → no Payment Method,
//    no Internal Financials). pdfViewerAccess derives both flags the way the
//    order screen did (financialInfo !== false; advanced = plan feature AND
//    finance). The preview sequencer lets only the newest token publish.
// 2. One source of truth, read from the sources: the job sheet renderer and the
//    invoice renderer read their sections from resolvePdfDocumentOptions and
//    keep no `settings?.pdfShow…` of their own; the order screen and the
//    Settings preview derive the viewer's access through the same helper; the
//    preview passes that access to the job sheet and never hard-codes full
//    access; the invoice preview is withheld from a viewer without Financial
//    Info; every generation takes a sequencer token and checks it before
//    publishing; the loader resolves personal PDF switches before the shared
//    ones for the nine finance-free keys only.
// 3. The strings the new states and tags show have all eleven translations,
//    probed through the real studioT (deep merge, Mac table, late merges).
//
//   node scripts/check-pdf-export-preview.mjs
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath, pathToFileURL } from "url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
let checks = 0;
const expect = (name, actual, wanted) => {
  checks += 1;
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) failures.push(`${name}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(wanted)}`);
};
const has = (name, text, pattern) => {
  checks += 1;
  if (!pattern.test(text)) failures.push(`${name}: ${pattern} not found`);
};
const hasNot = (name, text, pattern) => {
  checks += 1;
  if (pattern.test(text)) failures.push(`${name}: ${pattern} is still there`);
};
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pdf-export-preview-"));
const compile = (rel, name) => {
  const js = ts.transpileModule(read(rel), { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText
    .replace(/from "\.\/(\w+)"/g, 'from "./$1.mjs"');
  fs.writeFileSync(path.join(tmp, `${name}.mjs`), js);
};
compile("lib/studioflow/pdfDocumentOptions.ts", "pdfDocumentOptions");
for (const name of ["language", "macTranslations", "settingsContentTranslations", "shippingTranslations"]) compile(`lib/studioflow/${name}.ts`, name);
const options = await import(pathToFileURL(path.join(tmp, "pdfDocumentOptions.mjs")).href);
const { studioT, SUPPORTED_STUDIO_LANGUAGES } = await import(pathToFileURL(path.join(tmp, "language.mjs")).href);
const {
  PDF_TOGGLE_KEYS, PDF_TOGGLE_DEFAULTS, PDF_TOGGLE_DOCUMENTS, PDF_FINANCE_TOGGLE_KEYS, PDF_FULL_ACCESS,
  resolvePdfDocumentOptions, pdfViewerAccess, canViewInvoiceDocument, pdfToggleMaskReason,
  pdfPreviewKindAfterToggle, pdfRenderSettings, createPdfPreviewSequencer
} = options;

// ---- 1a. every switch moves exactly its own section
const SECTION_FOR_KEY = {
  pdfShowCustomer: "showCustomer", pdfShowContact: "showContact", pdfShowPreview: "showPreview",
  pdfShowMaterials: "showMaterials", pdfShowPriority: "showPriority", pdfShowFinCustomer: "showFinCustomer",
  pdfShowPaymentMethod: "showPaymentMethod", pdfShowFinInternal: "showFinInternal", pdfShowStatus: "showStatus",
  pdfShowShipping: "showShipping", pdfShowAddress: "showAddress", pdfShowShippingAddress: "showShippingAddress"
};
expect("twelve switches", [...PDF_TOGGLE_KEYS].sort(), Object.keys(SECTION_FOR_KEY).sort());
const allOn = Object.fromEntries(PDF_TOGGLE_KEYS.map((key) => [key, true]));
const full = PDF_FULL_ACCESS;
for (const key of PDF_TOGGLE_KEYS) {
  const section = SECTION_FOR_KEY[key];
  const on = resolvePdfDocumentOptions(allOn, full);
  const off = resolvePdfDocumentOptions({ ...allOn, [key]: false }, full);
  expect(`${key} on → ${section}`, on[section], true);
  expect(`${key} off → ${section}`, off[section], false);
  // Only its own section changes — except Paid & Remaining, which also carries Payment Method.
  const expectedOthers = Object.keys(on).filter((name) => name !== section && !(key === "pdfShowFinCustomer" && name === "showPaymentMethod"));
  expect(`${key} off changes nothing else`, expectedOthers.filter((name) => on[name] !== off[name]), []);
}
expect("Payment Method rides on Paid & Remaining", resolvePdfDocumentOptions({ ...allOn, pdfShowFinCustomer: false }, full).showPaymentMethod, false);

// ---- 1b. defaults when nothing is stored
const defaults = resolvePdfDocumentOptions(null, full);
for (const key of PDF_TOGGLE_KEYS) expect(`default ${key}`, defaults[SECTION_FOR_KEY[key]], PDF_TOGGLE_DEFAULTS[key]);
expect("Internal Financials default off", PDF_TOGGLE_DEFAULTS.pdfShowFinInternal, false);
expect("undefined settings = defaults", resolvePdfDocumentOptions(undefined, full), defaults);
expect("a non-boolean stored value takes the default", resolvePdfDocumentOptions({ pdfShowCustomer: "yes" }, full).showCustomer, true);

// ---- 1c. the permission mask beats every stored value
const noFinance = { canSeeFinance: false, canSeeAdvancedFinance: false };
const basicFinance = { canSeeFinance: true, canSeeAdvancedFinance: false };
const masked = resolvePdfDocumentOptions(allOn, noFinance);
expect("no Financial Info: Paid & Remaining hidden", masked.showFinCustomer, false);
expect("no Financial Info: Payment Method hidden", masked.showPaymentMethod, false);
expect("no Financial Info: Internal Financials hidden", masked.showFinInternal, false);
expect("no Financial Info: the other nine sections untouched",
  Object.keys(masked).filter((name) => !["showFinCustomer", "showPaymentMethod", "showFinInternal"].includes(name)).every((name) => masked[name] === true), true);
const basic = resolvePdfDocumentOptions(allOn, basicFinance);
expect("Financial Info without the plan feature: Paid & Remaining shown", basic.showFinCustomer, true);
expect("Financial Info without the plan feature: Payment Method hidden", basic.showPaymentMethod, false);
expect("Financial Info without the plan feature: Internal Financials hidden", basic.showFinInternal, false);
expect("advanced flag alone (inconsistent input) still needs Financial Info",
  resolvePdfDocumentOptions(allOn, { canSeeFinance: false, canSeeAdvancedFinance: true }).showFinCustomer, false);
expect("finance switch keys", [...PDF_FINANCE_TOGGLE_KEYS].sort(), ["pdfShowFinCustomer", "pdfShowFinInternal", "pdfShowPaymentMethod"]);

// ---- 1d. the viewer's access, as the order screen derived it
expect("owner-like access", pdfViewerAccess({ financialInfo: true }, { financial_advanced: true }), { canSeeFinance: true, canSeeAdvancedFinance: true });
expect("financialInfo false", pdfViewerAccess({ financialInfo: false }, { financial_advanced: true }), { canSeeFinance: false, canSeeAdvancedFinance: false });
expect("financialInfo missing counts as allowed", pdfViewerAccess({}, { financial_advanced: true }), { canSeeFinance: true, canSeeAdvancedFinance: true });
expect("no member access object", pdfViewerAccess(undefined, { financial_advanced: false }), { canSeeFinance: true, canSeeAdvancedFinance: false });
expect("plan without advanced finance", pdfViewerAccess({ financialInfo: true }, { financial_advanced: false }), { canSeeFinance: true, canSeeAdvancedFinance: false });
expect("no features object", pdfViewerAccess({ financialInfo: true }, null), { canSeeFinance: true, canSeeAdvancedFinance: false });
expect("invoice withheld without Financial Info", canViewInvoiceDocument(noFinance), false);
expect("invoice allowed with Financial Info", canViewInvoiceDocument(basicFinance), true);

// ---- 1e. why a switch is tagged on the Settings page
expect("mask reason: non-finance switch", pdfToggleMaskReason("pdfShowCustomer", noFinance), "none");
expect("mask reason: Paid & Remaining without Financial Info", pdfToggleMaskReason("pdfShowFinCustomer", noFinance), "permission");
expect("mask reason: Internal Financials without Financial Info", pdfToggleMaskReason("pdfShowFinInternal", noFinance), "permission");
expect("mask reason: Payment Method with Financial Info but no plan feature", pdfToggleMaskReason("pdfShowPaymentMethod", basicFinance), "plan");
expect("mask reason: Paid & Remaining with Financial Info but no plan feature", pdfToggleMaskReason("pdfShowFinCustomer", basicFinance), "none");
expect("mask reason: full access", PDF_TOGGLE_KEYS.map((key) => pdfToggleMaskReason(key, full)).every((reason) => reason === "none"), true);

// ---- 1f. which document a switch changes, and where the preview goes
expect("address switches reach the invoice", PDF_TOGGLE_KEYS.filter((key) => PDF_TOGGLE_DOCUMENTS[key].includes("invoice")).sort(), ["pdfShowAddress", "pdfShowShippingAddress"]);
expect("every switch reaches the job sheet", PDF_TOGGLE_KEYS.every((key) => PDF_TOGGLE_DOCUMENTS[key].includes("jobsheet")), true);
expect("materials flipped while the invoice is shown → job sheet", pdfPreviewKindAfterToggle("invoice", "pdfShowMaterials"), "jobsheet");
expect("address flipped while the invoice is shown → stays", pdfPreviewKindAfterToggle("invoice", "pdfShowAddress"), "invoice");
expect("anything flipped while the job sheet is shown → stays", PDF_TOGGLE_KEYS.every((key) => pdfPreviewKindAfterToggle("jobsheet", key) === "jobsheet"), true);

// ---- 1g. the render settings object and the latest-wins sequencer
expect("draft wins over stored", pdfRenderSettings({ a: 1, pdfShowCustomer: true }, { pdfShowCustomer: false }), { a: 1, pdfShowCustomer: false });
expect("no draft = stored", pdfRenderSettings({ a: 1 }, null), { a: 1 });
const sequencer = createPdfPreviewSequencer();
const first = sequencer.next();
const second = sequencer.next();
expect("older token is stale", sequencer.isCurrent(first), false);
expect("newest token is current", sequencer.isCurrent(second), true);
sequencer.cancel();
expect("cancel invalidates the newest token", sequencer.isCurrent(second), false);
expect("tokens never repeat", sequencer.next() > second, true);

// ---- 2. one source of truth, from the sources
const detail = read("app/orders/OrderDetailContent.tsx");
const settings = read("app/settings/page.tsx");
const loader = read("lib/studioflow/firestore.ts");
const jobSheet = detail.slice(detail.indexOf("function orderPdfHtml("), detail.indexOf("function openOrderPdfPrint("));
const invoice = detail.slice(detail.indexOf("function invoiceHtml("), detail.indexOf("function openInvoicePrint("));
has("job sheet renderer reads the shared mapping", jobSheet, /resolvePdfDocumentOptions\(settings, \{ canSeeFinance: options\.canSeeFinance, canSeeAdvancedFinance: options\.canSeeAdvancedFinance \}\)/);
hasNot("job sheet renderer keeps no pdfShow mapping of its own", jobSheet, /settings\?\.pdfShow/);
has("invoice renderer reads the shared mapping", invoice, /resolvePdfDocumentOptions\(settings, PDF_FULL_ACCESS\)/);
hasNot("invoice renderer keeps no pdfShow mapping of its own", invoice, /settings\?\.pdfShow/);
has("order screen derives access through pdfViewerAccess", detail, /pdfViewerAccess\(workspace\.memberAccess, workspace\.entitlements\.features\)/);
has("Settings preview derives access through pdfViewerAccess", settings, /pdfViewerAccess\(workspace\.memberAccess, workspace\.entitlements\.features\)/);
const jobSheetPreview = detail.slice(detail.indexOf("export function jobSheetPreviewHtml("), detail.indexOf("export function jobSheetPreviewHtml(") + 900);
has("job sheet preview takes the viewer's access", jobSheetPreview, /access: PdfViewerAccess/);
has("job sheet preview passes canSeeFinance through", jobSheetPreview, /canSeeFinance: access\.canSeeFinance/);
has("job sheet preview passes canSeeAdvancedFinance through", jobSheetPreview, /canSeeAdvancedFinance: access\.canSeeAdvancedFinance/);
hasNot("job sheet preview no longer hard-codes full access", jobSheetPreview, /canSeeFinance: true/);
const section = settings.slice(settings.indexOf("function PdfExportSettingsSection("), settings.indexOf("function PdfExportSettingsSection(") + 20000);
has("Settings preview renders the job sheet with the viewer's access", section, /renderers\.jobsheet\(renderSettings, workspace\.name, viewerAccess\)/);
has("Settings preview renders from one settings object", section, /const renderSettings = pdfRenderSettings\(settings, draft\)/);
has("invoice preview is gated on Financial Info", section, /const canPreviewInvoice = canViewInvoiceDocument\(viewerAccess\)/);
has("preview kind falls back to the job sheet without Financial Info", section, /canPreviewInvoice \? previewKind : "jobsheet"/);
has("every generation takes a token", section, /const token = sequencer\.next\(\);/);
has("a stale result is dropped before publishing", section, /if \(!sequencer\.isCurrent\(token\)\) return;\s*const html/);
has("a stale error is dropped too", section, /\.catch\(previewError => \{\s*if \(!sequencer\.isCurrent\(token\)\) return;/);
has("unmount cancels outstanding tokens", section, /return \(\) => sequencer\.cancel\(\);/);
has("the preview has a loading state", section, /preview\.status === "loading"/);
has("the preview has an error state with Retry", section, /preview\.status === "error"[\s\S]{0,600}t\("Retry"\)/);
has("a failed module load is forgotten so Retry imports again", settings, /pdfPreviewRenderersPromise = null;\s*throw loadError;/);
has("a flipped switch moves the preview to a document it changes", section, /pdfPreviewKindAfterToggle\(effectivePreviewKind, key as SharedPdfToggleKey\)/);
has("switch rows use the preview-aware handler", section, /onChange=\{event => updatePdfToggle\(key, event\.target\.checked\)\}/);
hasNot("no switch row bypasses it", section, /onChange=\{event => updateBoolean\(key, event\.target\.checked\)\}/);
has("masked finance switches are tagged", section, /pdfToggleMaskReason\(key as SharedPdfToggleKey, viewerAccess\) === "permission"/);
has("job-sheet-only switches are tagged", section, /PDF_TOGGLE_DOCUMENTS\[key as SharedPdfToggleKey\]\.includes\("invoice"\)/);
// The loader: personal before shared for the nine finance-free keys, shared only for the three money keys.
const overview = loader.slice(loader.indexOf("export async function loadWorkspaceSettingsOverview("), loader.indexOf("export async function loadWorkspaceSettingsOverview(") + 6000);
for (const key of ["pdfShowCustomer", "pdfShowContact", "pdfShowPreview", "pdfShowMaterials", "pdfShowPriority", "pdfShowStatus", "pdfShowShipping", "pdfShowAddress", "pdfShowShippingAddress"]) {
  has(`loader: personal ${key} before shared`, overview, new RegExp(`${key}: booleanValue\\(personalData\\.${key} \\?\\? data\\.${key}, true\\)`));
}
for (const key of ["pdfShowFinCustomer", "pdfShowPaymentMethod"]) has(`loader: ${key} shared only`, overview, new RegExp(`${key}: booleanValue\\(data\\.${key}, true\\)`));
has("loader: pdfShowFinInternal shared only, default off", overview, /pdfShowFinInternal: booleanValue\(data\.pdfShowFinInternal, false\)/);
hasNot("loader: no personal money switch", overview, /personalData\.pdfShowFin|personalData\.pdfShowPaymentMethod/);

// ---- 3. the new strings, in all eleven languages
const KEYS = [
  "Hidden by your permissions", "Hidden by your plan", "Job sheet only",
  "Your permissions hide this section from every PDF you print, so the preview does not show it.",
  "This section needs the advanced finance feature of your plan, so your PDFs and the preview do not show it.",
  "This section is printed on the job sheet; the invoice bills line items only.",
  "The preview could not be generated.",
  "The invoice prints every price, so it is not available to your role; the job sheet preview follows your permissions.",
  "Retry", "Loading...", "Preview invoice", "Preview job sheet", "PDF preview"
];
const languages = SUPPORTED_STUDIO_LANGUAGES.filter((language) => language !== "English");
expect("eleven languages besides English", languages.length, 11);
for (const key of KEYS) {
  const missing = languages.filter((language) => studioT(key, language) === key);
  expect(`"${key.slice(0, 48)}" translated everywhere`, missing, []);
  has(`"${key.slice(0, 48)}" is passed through t() on the Settings page`, settings, new RegExp(`t\\(${JSON.stringify(key).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)`));
}

if (failures.length) {
  console.error(`check-pdf-export-preview: ${failures.length} of ${checks} checks failed`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`check-pdf-export-preview: ${checks} checks passed`);
