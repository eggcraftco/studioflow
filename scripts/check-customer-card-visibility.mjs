// The order card layout and the money gates on the order screen (28 Sep 2026).
//
// 1. A card's own id decides whether it shows. iOS writes its whole visibility map on every save,
//    `communication: true` included (an id the web folds into "customer"), and the web applied the
//    legacy ids LAST, so a Customer card hidden on the Mac or iPhone came back on the web — through
//    the owner's or the member's saved layout (companySettings.workspaceUserProfilesJSON, read by the
//    settings listener) and through an order's own layout (customFields.__workspaceLayoutV1). The
//    layout helpers are compiled with the web tree's own TypeScript and run.
// 2. Nothing on the order screen prints money for a member without Financial Info. The Invoice PDF
//    prints every price, the VAT and the total, so both of its buttons follow Financial Info, not the
//    Customer permission the Invoice Items card rides on. Read from the screen's source.
//
//   node scripts/check-customer-card-visibility.mjs
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

// ---- 1. the layout helpers, compiled and run
const layoutSource = fs.readFileSync(path.join(root, "lib/studioflow/cardLayouts.ts"), "utf8");
const from = layoutSource.indexOf("export const ORDER_WORKSPACE_LAYOUT_KEY");
const to = layoutSource.indexOf("function friendlyCardLayoutError");
if (from < 0 || to < 0 || to <= from) {
  console.error("cardLayouts.ts: the pure layout section (ORDER_WORKSPACE_LAYOUT_KEY .. friendlyCardLayoutError) was not found");
  process.exit(1);
}
const js = ts.transpileModule(`${layoutSource.slice(from, to)}\nexport { layoutFromWorkspaceSettings, LEGACY_CARD_ID_MAP };\n`,
  { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "customer-card-visibility-")), "layouts.mjs");
fs.writeFileSync(tmp, js);
const { normalizeOrderDetailCardLayout, layoutFromOrderWorkspaceSnapshotJSON, layoutFromWorkspaceSettings, LEGACY_CARD_ID_MAP, ORDER_DETAIL_CARD_IDS } =
  await import(pathToFileURL(tmp).href);
const legacyPairs = Object.entries(LEGACY_CARD_ID_MAP);
if (legacyPairs.length === 0 || !legacyPairs.some(([legacy, card]) => legacy === "communication" && card === "customer")) {
  failures.push("LEGACY_CARD_ID_MAP no longer folds communication into customer: this check would prove nothing, update it");
}
const visibility = (map) => normalizeOrderDetailCardLayout({ visibility: map }).visibility;

// The map iOS writes (SiparisDetayView.captureWorkspaceLayout): every KartTipi key.
const ios = (overrides = {}) => ({
  preview: true, summary: true, customer: true, delivery: true, communication: true, notes: true, financial: true,
  status: true, shipping: true, schedule: true, historyLog: true, clientFiles: true, todo: true, workTime: true,
  customerNotes: false, materials: true, priority: true, invoiceItems: true, repairIntake: true, estimate: true,
  customerPortal: true, ...overrides
});
expect("iOS map, Customer hidden: customer", visibility(ios({ customer: false })).customer, false);
expect("iOS map, Customer hidden: every other card unchanged",
  ORDER_DETAIL_CARD_IDS.filter((id) => id !== "customer").every((id) => visibility(ios({ customer: false }))[id] === true), true);
expect("iOS map, all on: customer", visibility(ios()).customer, true);
for (const [legacy, card] of legacyPairs) {
  expect(`${card} hidden, ${legacy} on: ${card} stays hidden`, visibility({ [card]: false, [legacy]: true })[card], false);
  expect(`${card} shown, ${legacy} off: ${card} stays shown`, visibility({ [card]: true, [legacy]: false })[card], true);
  expect(`only ${legacy} off (an old layout): ${card} hidden`, visibility({ [legacy]: false })[card], false);
}
expect("no map: every card on", ORDER_DETAIL_CARD_IDS.every((id) => visibility(undefined)[id] === true), true);
expect("not a map: every card on", ORDER_DETAIL_CARD_IDS.every((id) => visibility(["customer"])[id] === true), true);
expect("a non-boolean value is ignored", visibility({ customer: "false", communication: true }).customer, true);

// The two ways a stored layout reaches the screen without the server's normaliser.
const COLUMNS = [["preview", "summary"], ["customer", "invoiceItems"], ["financial", "status"]];
const snapshot = (map) => JSON.stringify({ kartYerlesimi: COLUMNS, phoneKartSirasi: COLUMNS.flat(), visibility: map });
expect("an order's own layout (iOS map, Customer hidden)", layoutFromOrderWorkspaceSnapshotJSON(snapshot(ios({ customer: false })), "O-1").visibility.customer, false);
const settings = {
  workspaceUserProfilesJSON: JSON.stringify([
    { userId: "owner", snapshotJSON: snapshot(ios()) },
    { userId: "member-a", snapshotJSON: snapshot(ios({ customer: false })) }
  ])
};
expect("the member's own saved layout (iOS map, Customer hidden)", layoutFromWorkspaceSettings(settings, "member-a", "owner", "O-1", "").visibility.customer, false);
expect("a member with no layout of their own follows the owner's", layoutFromWorkspaceSettings(settings, "member-b", "owner", "O-1", "").visibility.customer, true);
const ownerHid = { workspaceUserProfilesJSON: JSON.stringify([{ userId: "owner", snapshotJSON: snapshot(ios({ customer: false })) }]) };
expect("the owner's layout hid it: a member without one does not see it", layoutFromWorkspaceSettings(ownerHid, "member-b", "owner", "O-1", "").visibility.customer, false);
const typeHid = { typeWorkspaceSnapshotsJSON: JSON.stringify({ repair: JSON.parse(snapshot(ios({ customer: false }))) }) };
expect("a repair-type layout hid it", layoutFromWorkspaceSettings(typeHid, "member-b", "owner", "O-1", "repair").visibility.customer, false);

// ---- 2. the money gates on the order screen, read from its source
const screen = fs.readFileSync(path.join(root, "app/orders/OrderDetailContent.tsx"), "utf8");
const has = (name, re) => { checks += 1; if (!re.test(screen)) failures.push(`OrderDetailContent.tsx: ${name}`); };
const count = (re) => (screen.match(re) || []).length;
has("Customer, Invoice Items and Customer Portal must ride cardCustomer",
  /customerPortal: "cardCustomer",[\s\S]{0,80}customer: "cardCustomer",\s*invoiceItems: "cardCustomer",/);
has("canShowOrderCard must ask the card's access key before anything else",
  /function canShowOrderCard\(cardId: OrderDetailCardId\) \{\s*if \(!workspaceAccessAllows\(workspace\.memberAccess, CARD_ACCESS_KEYS\[cardId\]\)\) return false;\s*if \(cardId === "financial"\) return canSeeFinance;/);
has("the Invoice Items editor must hide prices without Financial Info", /showMoney=\{canSeeFinance\}\s*onSave=\{items => saveDetailsPatch\(\{ lineItems: items \}, "Invoice items"\)\}/);
has("the Invoice Items card's Invoice PDF button must be inside canSeeFinance",
  /\{canSeeFinance \? \(\s*<button\s*type="button"\s*onClick=\{\(\) => void handleExportInvoice\(\)\}/);
has("the Actions menu's Invoice PDF must be inside canSeeFinance",
  /\{canSeeFinance \? \(\s*<button\s*type="button"\s*onClick=\{\(\) => \{\s*setOrderActionsOpen\(false\);\s*void handleExportInvoice\(\);/);
has("handleExportInvoice must refuse a member without Financial Info before it assigns a number",
  /async function handleExportInvoice\(\) \{[\s\S]{0,400}?if \(!canSeeFinance\) return;[\s\S]{0,200}?assignInvoiceNumberFromWeb/);
expect("handleExportInvoice is called from exactly two places (the card and the Actions menu)", count(/handleExportInvoice\(\)/g) - count(/async function handleExportInvoice\(\)/g), 2);
expect("the invoice document is opened only by handleExportInvoice", count(/openInvoicePrint\(\{ \.\.\.order, invoiceNumber \}, moneySettings\)/g), 1);
has("the Financial card's body must be inside canSeeFinance", /case "financial":\s*return \(\s*<section key=\{cardId\} className="card order-detail-card">\s*\{renderCardTitle\(cardId\)\}\s*\{canSeeFinance \? \(/);
has("the Estimate card must say it is hidden without Financial Info", /\{!canSeeFinance \? \(\s*<p className="estimate-card-note">\{t\("Hidden on this workspace role\."\)\}<\/p>/);
has("the Summary card's Order Value must be hidden without Financial Info", /<strong>\{canSeeFinance \? money\(order\.paidAmount \+ order\.remainingAmount \+ orderCustomRemainingTotal\(order\), hideNumbers\) : t\("Hidden"\)\}<\/strong>/);

if (failures.length) {
  console.error(`${failures.length} of ${checks} check(s) failed:`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`${checks} checks: a card's own id decides its visibility (iOS's communication:true no longer brings a hidden Customer card back, on the saved-layout, order-layout and order-type paths), and the order screen's money — Invoice PDF, prices, Financial, Estimate, Order Value — follows Financial Info.`);
