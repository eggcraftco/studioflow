// Banking ▸ Payment links in the owner's reference design (4 Nov 2026), and the two fixes that came with it.
//
//   1. the design: a page header (title, subtitle, "Link for an order" + "New payment link"), ONE card with the
//      state tabs and their counts (a badge that keeps its place while the counts are unknown), the history
//      toolbar (search + filter), fixed-height placeholder rows while loading, a table whose rows become cards on
//      a phone (data-label on every cell), an order named "Order #N" (never its document id), the row menu
//   2. "sonradan beliriyor": the tab is drawn from the server's last answer on this device while the server is
//      asked again — only two booleans are kept, a failed read is not kept, and the server's answer wins
//   3. "Payment received" (SL-30): the bell row in the reader's language, and it opens Banking ▸ Payment links
//      (the drawer and the service worker)
//   4. every word the design added, in twelve languages, placeholders kept, never English
//
//   npx tsx scripts/check-payment-links-board.mts
import { readFileSync } from "node:fs";
import path from "node:path";
import { studioT, studioTranslationRow } from "../lib/studioflow/language";
import { localizeActivityNotification } from "../lib/studioflow/notificationText";
import type { StudioActivityNotification } from "../lib/studioflow/notifications";

const webRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (file: string) => readFileSync(path.join(webRoot, file), "utf8");
let checks = 0;
let failures = 0;
function expect(name: string, ok: boolean, detail = "") {
  checks += 1;
  if (ok) console.log(`ok   ${name}`);
  else { failures += 1; console.log(`FAIL ${name}${detail ? `  <- ${detail}` : ""}`); }
}
const region = (text: string, start: string, end: string) => {
  const from = text.indexOf(start);
  if (from < 0) return "";
  const to = text.indexOf(end, from + start.length);
  return to < 0 ? "" : text.slice(from, to);
};

// ---- 1. the design ---------------------------------------------------------------------------------------------
const panel = read("components/PaymentLinksPanel.tsx");
const css = read("components/PaymentLinksPanel.module.css");
function designProblems(source: string, sheet: string): string[] {
  const out: string[] = [];
  const header = region(source, "<header className={s.head}>", "</header>");
  if (!/<h2 className=\{s\.title\}>\{t\("Payment links"\)\}<\/h2>/.test(header)) out.push("no page title");
  if (!/t\("Create, manage and track payment requests in one place\."\)/.test(header)) out.push("no subtitle");
  if (!/className=\{s\.button\}[\s\S]*t\("Link for an order"\)[\s\S]*className=\{s\.primary\}[\s\S]*t\("New payment link"\)/.test(header)) out.push("the two buttons are not secondary then primary in the header");
  const card = region(source, "<div className={s.card}>", "{truncated ?");
  if (!/role="tablist"[\s\S]*className=\{`\$\{s\.tab\} \$\{tab === key \? s\.tabActive : ""\}`\}/.test(card)) out.push("the tabs are not in the card");
  if (!/<span className=\{`\$\{s\.badge\} \$\{rows \? "" : s\.badgeUnknown\}`\}>\{rows \? counts\[key\] \?\? 0 : 0\}<\/span>/.test(card)) out.push("the count badge does not keep its place while the counts are unknown");
  if (!/t\("Payment link history"\)/.test(card) || !/placeholder=\{t\("Search payments"\)\}/.test(card) || !/\{filterIcon\}\{t\("Filter"\)\}/.test(card)) out.push("no history toolbar with search and filter");
  if (!/aria-busy="true"[\s\S]*\[0, 1, 2\]\.map[\s\S]*className=\{s\.skeleton\}/.test(card)) out.push("loading does not keep the table's shape");
  const cells = card.match(/<td data-label=\{COLUMNS\[\d\]\}/g) || [];
  if (cells.length !== 7) out.push(`not every cell carries its column name for the phone layout (${cells.length}/7)`);
  if (!/@media \(max-width: 760px\)[\s\S]*\.table thead \{ display: none; \}[\s\S]*content: attr\(data-label\);/.test(sheet)) out.push("the table does not become cards on a phone");
  if (/>\{row\.orderId\}</.test(source)) out.push("a row shows the order's document id");
  if (!/const orderNumberOf = \(row: ListedRow\) => \(row\.projectNumber && row\.projectNumber > 0 \? `#\$\{row\.projectNumber\}` : orderReferenceOfRow\(row\)\);/.test(source)) out.push("the order is not named by its number");
  if (!/\{row\.addedToOrder \? <div className=\{s\.subOk\}>\{t\("Added to the customer's open order"\)\}<\/div> : null\}/.test(card)) out.push("SL-29's 'added to the open order' is not said");
  if (!/\(row\.possibleOrders \?\? \[\]\)\.length \?/.test(card)) out.push("SL-29's candidate orders are not named");
  if (!/const rowMenu = menuItems\.length \?/.test(source) || !/aria-label=\{t\("More actions"\)\}/.test(source)) out.push("no row menu");
  if (!/className=\{`\$\{s\.pill\} \$\{pillClass\(row\.publicStatus\)\}`\}/.test(card)) out.push("the status is not a pill");
  for (const token of ["var(--surface)", "var(--border)", "var(--muted)"]) if (!sheet.includes(token)) out.push(`the sheet ignores the theme (${token})`);
  return out;
}
const designMutants: Array<[string, string, string]> = [
  ["the badge disappears while unknown", panel.replace('<span className={`${s.badge} ${rows ? "" : s.badgeUnknown}`}>{rows ? counts[key] ?? 0 : 0}</span>', '{rows ? <span className={s.badge}>{counts[key] ?? 0}</span> : null}'), css],
  ["the document id comes back", panel.replace("{rowHeading(row)}", "{row.orderId}"), css],
  ["no phone layout", panel, css.replace("content: attr(data-label);", "")],
  ["no placeholders while loading", panel.replace("{[0, 1, 2].map((index) => (", "{[].map((index) => ("), css],
  ["a cell without its name", panel.replace("<td data-label={COLUMNS[1]}>", "<td>"), css],
];
for (const [name, source, sheet] of designMutants) {
  const problems = source === panel && sheet === css ? [] : designProblems(source, sheet);
  expect(`design rules catch the mutant: ${name}`, problems.length > 0, "the mutant did not apply, or passed");
}
const designReal = designProblems(panel, css);
expect("the panel follows the reference design", designReal.length === 0, designReal.join("; "));

// ---- 2. the tab is drawn at once --------------------------------------------------------------------------------
const lib = read("lib/studioflow/stripeConnect.ts");
const hook = read("lib/studioflow/usePaymentLinksAvailable.ts");
function rememberProblems(libSource: string, hookSource: string): string[] {
  const out: string[] = [];
  const access = region(libSource, "export function paymentLinksAccess(", "\n}\n");
  if (!/const answer = \{ available: view\.configured === true, planAllowed: view\.planAllowed \};\s*rememberPaymentLinksAccess\(id, answer\);/.test(access)) out.push("the server's answer is not remembered");
  const failed = region(access, ".catch(", "});");
  if (/rememberPaymentLinksAccess/.test(failed)) out.push("a failed read is remembered");
  const kept = region(libSource, "function rememberPaymentLinksAccess(", "\n}\n");
  if (!/JSON\.stringify\(\{ available: answer\.available, planAllowed: answer\.planAllowed \}\)/.test(kept)) out.push("something besides the two booleans is kept");
  if (!/try \{[\s\S]*localStorage[\s\S]*\} catch/.test(kept) || !/try \{[\s\S]*localStorage[\s\S]*\} catch/.test(region(libSource, "export function rememberedPaymentLinksAccess(", "\n}\n"))) out.push("storage that refuses breaks the page");
  if (!/return available \?\? \(remembered \? remembered\.available : null\);/.test(hookSource)) out.push("the tab waits for the server instead of drawing the last answer");
  if (!/void paymentLinksAvailable\(id\)\.then\(\(value\) => \{ if \(active\) setAvailable\(value\); \}\);/.test(hookSource)) out.push("the server is no longer asked");
  return out;
}
const rememberMutants: Array<[string, string, string]> = [
  ["a failed read remembered", lib.replace("      availability.delete(id);\n", "      availability.delete(id);\n      rememberPaymentLinksAccess(id, { available: false, planAllowed: null });\n"), hook],
  ["the server never asked", lib, hook.replace("void paymentLinksAvailable(id).then((value) => { if (active) setAvailable(value); });", "")],
  ["the remembered answer ignored", lib, hook.replace("return available ?? (remembered ? remembered.available : null);", "return available;")],
];
for (const [name, a, b] of rememberMutants) {
  const problems = a === lib && b === hook ? [] : rememberProblems(a, b);
  expect(`memory rules catch the mutant: ${name}`, problems.length > 0, "the mutant did not apply, or passed");
}
const rememberReal = rememberProblems(lib, hook);
expect("Banking draws Payment links from the last answer while the server is asked", rememberReal.length === 0, rememberReal.join("; "));

// ---- 3. "Payment received" --------------------------------------------------------------------------------------
const row = (paymentNotice: StudioActivityNotification["paymentNotice"]): StudioActivityNotification => ({
  id: "payment_received_x", companyId: "c", type: "payment_received", title: "Payment received", message: "1225.00 GBP · X · Order #101",
  route: "payment-links", orderId: "o", ticketId: "", ticketType: "", threadId: "", messageId: "", conversationId: "", focus: "", fileId: "",
  workSessionId: "", workDayId: "", channel: "", senderUid: "", senderName: "", senderEmail: "", senderPhotoURL: "", priority: "", status: "",
  source: "stripeConnectWebhook", recipientUids: ["u"], recipientEmails: [], readByMillis: {}, dismissedByMillis: {}, createdAtMillis: 1, paymentNotice,
});
const figures = { amountMinor: 122500, currency: "GBP", label: "Custom Dial Painting – Rest of Designs Fee", projectNumber: 101 };
const tr = localizeActivityNotification(row(figures), "Türkçe");
expect("a paid link's bell row is said in Turkish", tr.title === "Ödeme alındı" && /1\.225,00/.test(tr.message) && tr.message.includes("Sipariş #101") && tr.message.includes(figures.label), `${tr.title} | ${tr.message}`);
const de = localizeActivityNotification(row(figures), "Deutsch");
expect("and in German", de.title === "Zahlung erhalten" && de.message.includes("Auftrag #101"), `${de.title} | ${de.message}`);
const old = localizeActivityNotification(row(null), "Türkçe");
expect("a row without figures keeps the server's words", old.title === "Payment received" && old.message === "1225.00 GBP · X · Order #101");
const drawer = read("components/NotificationsDrawer.tsx");
const routeAt = drawer.indexOf('} else if (route === "payment-links") {');
expect("the bell opens Banking ▸ Payment links (before the order rule takes it)", routeAt > 0 && routeAt < drawer.indexOf('} else if (route === "order" || n.orderId.trim()) {')
  && /router\.push\("\/bank\?tab=payment-links"\);/.test(region(drawer, '} else if (route === "payment-links") {', "} else if")));
const worker = read("public/firebase-messaging-sw.js");
expect("so does the push (service worker), before the order rule", worker.indexOf('data.route === "payment-links"') > 0
  && worker.indexOf('data.route === "payment-links"') < worker.indexOf("else if (data.orderId)") && /targetUrl = "\/bank\?tab=payment-links";/.test(worker));
const access = read("lib/studioflow/notificationAccess.ts");
expect("a member without financial access does not see it (type payment_received rides financialInfo)", /payment\|refund\|invoice_paid/.test(access));

// ---- 5. a merged order leaves the list at once --------------------------------------------------------------------
const ordersPage = read("app/orders/page.tsx");
function mergeProblems(page: string): string[] {
  const out: string[] = [];
  const merge = region(page, "async function confirmMergeSelected() {", "\n  }\n");
  if (!/setMergedAwayIds\(current => new Set\(\[\.\.\.current, \.\.\.sourceIds\]\)\);/.test(merge)) out.push("a merge does not remember the merged orders");
  if (!/const live = mergedAwayIds\.size \? orders\.filter\(order => !mergedAwayIds\.has\(order\.id\)\) : orders;/.test(page)) out.push("the list does not leave merged orders out whatever a read returns");
  if (!/if \(mergedSet\.has\(requestedOrderIdRef\.current\)\) \{\s*setRequestedOrderId\(primaryId\);\s*router\.replace\(/.test(merge)) out.push("a merged order named by the address opens again");
  if (!/setSelectedOrder\(current => \(current && mergedSet\.has\(current\.id\) \? null : current\)\);/.test(merge)) out.push("a merged order stays open in the detail pane");
  const restore = region(page, "async function handleRestoreOrder(", "\n  }\n");
  if (!/next\.delete\(order\.id\);/.test(restore)) out.push("an order restored from the Trash stays hidden");
  return out;
}
const mergeMutants: Array<[string, string]> = [
  ["merged ids not remembered", ordersPage.replace("      setMergedAwayIds(current => new Set([...current, ...sourceIds]));\n", "")],
  ["the list ignores them", ordersPage.replace("const live = mergedAwayIds.size ? orders.filter(order => !mergedAwayIds.has(order.id)) : orders;", "const live = orders;")],
  ["restore keeps it hidden", ordersPage.replace("      next.delete(order.id);\n", "")],
];
for (const [name, mutant] of mergeMutants) {
  const problems = mutant === ordersPage ? [] : mergeProblems(mutant);
  expect(`merge rules catch the mutant: ${name}`, problems.length > 0, "the mutant did not apply, or passed");
}
const mergeReal = mergeProblems(ordersPage);
expect("a merged order leaves the Orders list at once and does not come back from an older read", mergeReal.length === 0, mergeReal.join("; "));

// ---- 4. twelve languages ----------------------------------------------------------------------------------------
const LANGS = ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português", "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"];
const used = new Set([...panel.matchAll(/\bt\("([^"]+)"\)/g)].map((m) => m[1]));
used.add("Payment received");
const placeholders = (text: string) => (text.match(/\{\w+\}/g) || []).sort().join(",");
let wordChecks = 0;
for (const key of used) {
  const translations = studioTranslationRow(key);
  const missing = LANGS.filter((lang) => !String(translations?.[lang as keyof typeof translations] ?? "").trim());
  // A word that is the same in that language is not English left behind (French "Actions", German "Filter").
  const SAME = new Set(["Actions|Français", "Filter|Deutsch", "Status|Deutsch", "Test|Deutsch", "Test|Türkçe", "Test|Français", "Test|Italiano"]);
  const english = LANGS.filter((lang) => studioT(key, lang) === key && !SAME.has(`${key}|${lang}`));
  const lost = LANGS.filter((lang) => placeholders(studioT(key, lang)) !== placeholders(key));
  wordChecks += 1;
  expect(`twelve languages: ${key.slice(0, 64)}`, missing.length === 0 && english.length === 0 && lost.length === 0,
    [missing.length ? `missing ${missing.join("/")}` : "", english.length ? `English in ${english.join("/")}` : "", lost.length ? `placeholder lost in ${lost.join("/")}` : ""].filter(Boolean).join("; "));
}
expect(`the panel's words were found (${wordChecks})`, wordChecks >= 60);

console.log(failures ? `${failures} of ${checks} payment-links-board checks FAILED` : `All ${checks} payment-links-board checks passed.`);
process.exit(failures ? 1 : 0);
