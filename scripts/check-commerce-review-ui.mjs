// The commerce "Needs review" list, S-B client (28 Oct 2026 — CUST-005, CUST-006, UX).
//
// The S-B server package (commerce-sb-server-2026-10-27) stops NivaDesk from merging two different
// buyers into one customer because their names match: it keeps the existing card, opens a new card
// and puts a "possible duplicate customer" item (kind customer_duplicate, reason
// possible_duplicate_customer, id custdup_<new customer>) into commerceReviewQueue.
// resolveCommerceReview takes decision "same" | "different". This checks the web side:
//
// 1. lib/studioflow/commerceReview.ts, compiled with the tree's own TypeScript:
//    - decision payloads: an engine row resolves exactly as before ({ companyId, orderId }); a customer
//      row names itself (reviewId) and carries "same" / "different"; an older list shape (no kind)
//      gets no decision at all (that server would ignore it);
//    - every reason code the server's adapters write reads as words, never the code; an unknown code
//      reads "Needs a check"; the inbound channel's pill reads "Website";
//    - "Open order" only with a real order id (an engine row's orderId, a customer row's sourceOrderId),
//      else "Open Customer" (/customers?customerId=<new card>), else no link;
//    - what conflicts / agrees and why, in words; the card facts; which fields differ.
// 2. app/settings/CommerceReviewItems.tsx rendered with react-dom/server: the duplicate item (title, both
//    cards side by side, conflicts, Same person / Different people, confirmation before the merge), the
//    engine row with its Resolve, the owner-only gate, the inbound row, a Turkish render; no raw code.
// 3. The wiring, read from source: every channel card uses the shared list; the inbound settings
//    section has its own review card; resolveCommerceReview is called with the payload builder;
//    no hard-coded English text in the new components.
// 4. Every sentence the list can show, in all eleven other languages (studioT's merged table), and the
//    new table overwrites no older translation.
//
//   node scripts/check-commerce-review-ui.mjs
// Control: the same script on the live tree (e2c75207) must fail.
import fs from "fs";
import path from "path";
import os from "os";
import { createRequire } from "module";
import { fileURLToPath, pathToFileURL } from "url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const failures = [];
let checks = 0;
const expect = (name, actual, wanted) => {
  checks += 1;
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) failures.push(`${name}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(wanted)}`);
};
const fail = (name, why) => { checks += 1; failures.push(`${name}: ${why}`); };
const exists = (rel) => fs.existsSync(path.join(root, rel));
const read = (rel) => (exists(rel) ? fs.readFileSync(path.join(root, rel), "utf8") : "");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "commerce-review-ui-check-"));

// ---- compiling the tree's modules (the same approach as check-order-source-links.mjs)
const FAKES = {
  "firebase/functions": `export function httpsCallable() { return async () => ({ data: {} }); }`,
  "firebase/firestore": `export function doc() { return {}; } export async function getDoc() { return { exists: () => false, data: () => null }; }`,
  "@/lib/firebase/client": `export const auth = { currentUser: null }; export const db = {}; export const functions = {};`
};
for (const [name, source] of Object.entries(FAKES)) fs.writeFileSync(path.join(tmp, `${name.replace(/[^a-z]/gi, "_")}.mjs`), source);
const reactUrl = pathToFileURL(require.resolve("react")).href;
const compile = (rel, { source, outName } = {}) => {
  const out = path.join(tmp, `${outName || path.basename(rel).replace(/\.tsx?$/, "")}.mjs`);
  if (fs.existsSync(out)) return out;
  const text = source ?? read(rel);
  if (!text) throw new Error(`${rel} is missing`);
  const tsx = rel.endsWith(".tsx");
  let js = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020,
    ...(tsx ? { jsx: ts.JsxEmit.React, jsxFactory: "__h", jsxFragmentFactory: "__F" } : {}) } }).outputText;
  if (tsx) js = `import __React from ${JSON.stringify(reactUrl)};\nconst __h = __React.createElement; const __F = __React.Fragment;\n${js}`;
  js = js.replace(/from "([^"]+)"/g, (whole, spec) => {
    if (FAKES[spec]) return `from "./${spec.replace(/[^a-z]/gi, "_")}.mjs"`;
    if (spec.startsWith("@/lib/studioflow/")) return `from "./${spec.slice("@/lib/studioflow/".length)}.mjs"`;
    if (spec.startsWith("@/components/")) return `from "./${spec.slice("@/components/".length)}.mjs"`;
    if (spec.startsWith("./")) return `from "${spec}.mjs"`;
    if (spec === "react") return `from ${JSON.stringify(reactUrl)}`;
    return whole;
  });
  fs.writeFileSync(out, js);
  for (const m of js.matchAll(/from "\.\/([A-Za-z]+)\.mjs"/g)) {
    if (fs.existsSync(path.join(tmp, `${m[1]}.mjs`))) continue;
    const dirOf = path.dirname(rel);
    for (const candidate of [`${dirOf}/${m[1]}.ts`, `${dirOf}/${m[1]}.tsx`, `lib/studioflow/${m[1]}.ts`, `components/${m[1]}.tsx`]) {
      if (exists(candidate)) { compile(candidate); break; }
    }
  }
  return out;
};
const load = async (rel, opts) => import(pathToFileURL(compile(rel, opts)).href);
async function section(name, body) {
  try { await body(); } catch (error) { fail(name, `could not run — ${String(error && error.message || error).split("\n")[0]}`); }
}

// The reasons the server writes into commerceReviewQueue (functions/commerce/adapters/{woocommerce,shopify,square,
// ebay,amazon,etsy}.js `reasons.push(...)`, commerce/customerMatch.js REVIEW_REASON) plus the older label table's own.
const SERVER_REASONS = ["ad_hoc_line_item", "no_line_items", "missing_total", "missing_external_id", "tax_responsibility_unknown",
  "buyer_data_restricted", "currency_mismatch", "no_buyer_id", "test_order", "unresolved_variation", "possible_duplicate_customer"];
const SERVER_SENTENCES = ["The customer to keep is no longer in this workspace.", "No such review item in this workspace."];

// Fixtures in the shapes listCommerceReviewQueue returns (engine row as before; customer row = customerMatch.listRowView).
const engineRow = { orderId: "ord_engine_1", provider: "woocommerce", providerDisplayName: "WooCommerce", connectionId: "c1", externalId: "1042", orderNumber: "1042",
  customerName: "Ada Lovelace", grandTotal: "45.00", currency: "GBP", reasons: ["ad_hoc_line_item", "missing_external_id"], resolved: false, updatedAtMs: 2 };
const wooDup = { orderId: "ord_woo_2", provider: "woocommerce", providerDisplayName: "WooCommerce", connectionId: "", externalId: "", orderNumber: "1043",
  customerName: "John Smith", grandTotal: null, currency: null, reasons: ["possible_duplicate_customer"], resolved: false, updatedAtMs: 3,
  kind: "customer_duplicate", reviewId: "custdup_newJohn", sourceOrderId: "ord_woo_2", newCustomerId: "newJohn", existingCustomerId: "oldJohn",
  candidateCustomerIds: ["oldJohn"], match: { reason: "conflict", conflicts: ["email", "phone"], agrees: [], incomingHasSignal: true, existingHasSignal: true }, resolution: null };
const inboundDup = { orderId: "custdup_newJane", provider: "inbound", providerDisplayName: "Inbound webhook", connectionId: "", externalId: "", orderNumber: "",
  customerName: "Jane Doe", grandTotal: null, currency: null, reasons: ["possible_duplicate_customer"], resolved: false, updatedAtMs: 4,
  kind: "customer_duplicate", reviewId: "custdup_newJane", sourceOrderId: null, newCustomerId: "newJane", existingCustomerId: "oldJane",
  candidateCustomerIds: ["oldJane"], match: { reason: "cannot_compare", conflicts: [], agrees: [], incomingHasSignal: true, existingHasSignal: false }, resolution: null };
// What a server rolled back to the live list would hand out for the same item: no kind, the row's own id as orderId.
const oldShapeDup = { orderId: "custdup_newJane", provider: "inbound", providerDisplayName: "Inbound webhook", connectionId: "", externalId: "", orderNumber: "",
  customerName: "Jane Doe", grandTotal: null, currency: null, reasons: ["possible_duplicate_customer"], resolved: false, updatedAtMs: 4 };
const cardData = {
  oldJohn: { companyId: "ws", name: "John Smith", email: "john.a@example.test", phone: "+44 7700 900111", city: "Manchester" },
  newJohn: { companyId: "ws", name: "John Smith", email: "john.b@example.test", phone: "07700 900222", city: "London" },
  oldJane: { companyId: "ws", name: "Jane Doe", email: "", primaryPhone: "", city: "Leeds" },
  newJane: { companyId: "ws", name: "Jane Doe", email: "jane@example.test", phone: "", shippingCity: "York" }
};

let review = null;
// ---- 1. the pure rules
await section("1 commerceReview.ts", async () => {
  review = await load("lib/studioflow/commerceReview.ts");
  const r = review;
  // decision payloads
  expect("payload: an engine row resolves exactly as before", r.resolveReviewPayload("ws", engineRow), { companyId: "ws", orderId: "ord_engine_1" });
  expect("payload: an engine row ignores a decision", r.resolveReviewPayload("ws", engineRow, "same"), { companyId: "ws", orderId: "ord_engine_1" });
  expect("payload: Same person", r.resolveReviewPayload("ws", wooDup, "same"), { companyId: "ws", orderId: "ord_woo_2", reviewId: "custdup_newJohn", decision: "same" });
  expect("payload: Different people", r.resolveReviewPayload("ws", wooDup, "different"), { companyId: "ws", orderId: "ord_woo_2", reviewId: "custdup_newJohn", decision: "different" });
  expect("payload: a customer row without a decision is 'different' (the server's plain-Resolve meaning)", r.resolveReviewPayload("ws", inboundDup).decision, "different");
  expect("payload: anything but 'same' is 'different'", r.resolveReviewPayload("ws", inboundDup, "SAME").decision, "different");
  expect("payload: an older list shape (no kind) gets no decision", r.resolveReviewPayload("ws", oldShapeDup, "same"), { companyId: "ws", orderId: "custdup_newJane" });
  expect("decide: offered for the S-B shape", [r.canDecideDuplicate(wooDup), r.canDecideDuplicate(inboundDup)], [true, true]);
  expect("decide: not for an engine row or the older shape", [r.canDecideDuplicate(engineRow), r.canDecideDuplicate(oldShapeDup)], [false, false]);
  expect("kind: duplicate by kind, by reason; engine row is not", [r.isDuplicateCustomerRow(wooDup), r.isDuplicateCustomerRow(oldShapeDup), r.isDuplicateCustomerRow(engineRow)], [true, true, false]);
  expect("keys: a customer row by review id, an engine row by order — never the same key", [r.reviewRowKey(wooDup), r.reviewRowKey({ ...engineRow, orderId: "ord_woo_2" })], ["customer:custdup_newJohn", "order:ord_woo_2"]);
  // labels per reason, never raw
  for (const code of SERVER_REASONS) {
    const label = r.reviewReasonLabel(code);
    checks += 1;
    if (!label || label === code || /_/.test(label) || label === r.UNKNOWN_REVIEW_REASON_LABEL) failures.push(`reason ${code}: label ${JSON.stringify(label)} is not words of its own`);
  }
  expect("reason: an unknown code reads 'Needs a check'", [r.reviewReasonLabel("some_new_code"), r.reviewReasonLabel(""), r.reviewReasonLabel(undefined)], ["Needs a check", "Needs a check", "Needs a check"]);
  expect("reason: the duplicate item's words", r.reviewReasonLabel("possible_duplicate_customer"), "Possible duplicate customer");
  expect("reasons: repeats fold", r.reviewReasonLabels({ reasons: ["x_1", "x_2", "missing_total"] }), ["Needs a check", "Missing total"]);
  expect("provider: inbound reads 'Website', a store keeps its name", [r.reviewProviderLabel(inboundDup), r.reviewProviderLabel(wooDup), r.reviewProviderLabel({ provider: "ebay", providerDisplayName: "" })], ["Website", "WooCommerce", "ebay"]);
  // links: Open order only with a real order id
  expect("link: engine row opens its order", r.reviewRowLink(engineRow), { kind: "order", href: "/orders/ord_engine_1", label: "Open order" });
  expect("link: a customer row opens the order that brought the buyer (sourceOrderId)", r.reviewRowLink({ ...wooDup, orderId: "custdup_newJohn" }), { kind: "order", href: "/orders/ord_woo_2", label: "Open order" });
  expect("link: no order → Open Customer (the new card)", r.reviewRowLink(inboundDup), { kind: "customer", href: "/customers?customerId=newJane", label: "Open Customer" });
  expect("link: the older shape never opens /orders/custdup_…", r.reviewRowLink(oldShapeDup), { kind: "customer", href: "/customers?customerId=newJane", label: "Open Customer" });
  expect("link: no order and no Customers access → no link", r.reviewRowLink(inboundDup, { canSeeCustomers: false }), null);
  expect("link: an engine row without an order id → no link", r.reviewRowLink({ ...engineRow, orderId: "" }), null);
  expect("link: no Orders access → no order link", r.reviewRowLink(engineRow, { canSeeOrders: false }), null);
  // what conflicts, why
  expect("conflicts in words", r.duplicateConflictLabels(wooDup.match), ["Email differs", "Phone differs"]);
  expect("agreements in words", r.duplicateAgreementLabels({ agrees: ["phone", "external_id"] }), ["Same phone", "Same store customer ID"]);
  expect("unknown signal reads 'Needs a check'", r.duplicateConflictLabels({ conflicts: ["zzz"] }), ["Needs a check"]);
  expect("why, per server reason", ["conflict", "unconfirmed_signal", "cannot_compare", undefined].map((reason) => r.duplicateMatchSummary(reason ? { reason } : null)),
    ["Same name, but their details differ.", "Same name and phone, but this order brings new details.", "Same name, but one of them has no email or phone to compare.", "Same name as an existing customer."]);
  // cards
  expect("card: the four facts, phone and city fall back as the customer page does", [r.reviewCustomerCard("oldJane", cardData.oldJane), r.reviewCustomerCard("newJane", cardData.newJane)],
    [{ id: "oldJane", exists: true, name: "Jane Doe", email: "", phone: "", city: "Leeds" }, { id: "newJane", exists: true, name: "Jane Doe", email: "jane@example.test", phone: "", city: "York" }]);
  expect("card: unreadable / merged away", r.reviewCustomerCard("gone", null), { id: "gone", exists: false, name: "", email: "", phone: "", city: "" });
  expect("card: nothing masked (full email and phone)", r.reviewCustomerCard("oldJohn", cardData.oldJohn).email + " " + r.reviewCustomerCard("oldJohn", cardData.oldJohn).phone, "john.a@example.test +44 7700 900111");
  expect("differs: email, phone, city", r.differingCardFields(r.reviewCustomerCard("a", cardData.oldJohn), r.reviewCustomerCard("b", cardData.newJohn)), ["email", "phone", "city"]);
  expect("differs: same phone in two spellings is not a difference", r.differingCardFields(r.reviewCustomerCard("a", { phone: "+44 7700 900111" }), r.reviewCustomerCard("b", { phone: "07700 900111" })), []);
  expect("ids to read: both cards of every duplicate row, once", r.duplicateCustomerIdsToLoad([engineRow, wooDup, inboundDup, oldShapeDup]), ["oldJohn", "newJohn", "oldJane", "newJane"]);
  expect("rows per channel", r.reviewRowsForProvider([engineRow, wooDup, inboundDup, { ...engineRow, provider: "inbound", resolved: true }], "inbound").map((row) => row.orderId), ["custdup_newJane"]);
  expect("order number: one '#', never '##'", [r.reviewOrderNumberText("1043"), r.reviewOrderNumberText("#IN-7104"), r.reviewOrderNumberText("  "), r.reviewOrderNumberText(null)], ["#1043", "#IN-7104", "", ""]);
  expect("notice per decision", [r.decisionNotice("same"), r.decisionNotice("different")], ["Merged into the existing card.", "Kept as two customers."]);
});

// ---- 2. the rendered list
let studio = null;
await section("2 CommerceReviewItems render", async () => {
  if (!review) throw new Error("commerceReview.ts did not load");
  const React = (await import(reactUrl)).default;
  const { renderToStaticMarkup } = await import(pathToFileURL(require.resolve("react-dom/server")).href);
  const { CommerceReviewItems } = await load("app/settings/CommerceReviewItems.tsx");
  const cards = Object.fromEntries(Object.entries(cardData).map(([id, data]) => [id, review.reviewCustomerCard(id, data)]));
  const base = { cards, t: (s) => s, isOwner: true, canSeeOrders: true, canSeeMoney: true, canSeeCustomers: true, busyKey: "", confirmKey: "",
    onResolve() {}, onDecide() {}, onAskSame() {}, onCancelSame() {} };
  const render = (props) => renderToStaticMarkup(React.createElement(CommerceReviewItems, { ...base, ...props }));
  const blocks = (html) => {
    const out = {};
    const re = /data-review-kind="([a-z_]+)" data-review-key="([^"]+)"/g; let m; const starts = [];
    while ((m = re.exec(html))) starts.push({ key: m[2], at: m.index });
    starts.forEach((s, i) => { out[s.key] = html.slice(s.at, i + 1 < starts.length ? starts[i + 1].at : html.length); });
    return out;
  };
  const html = render({ rows: [engineRow, wooDup, inboundDup] });
  const b = blocks(html);
  const woo = b["customer:custdup_newJohn"] || ""; const inb = b["customer:custdup_newJane"] || ""; const eng = b["order:ord_engine_1"] || "";
  expect("render: three rows, two kinds", [Boolean(eng), Boolean(woo), Boolean(inb)], [true, true, true]);
  expect("render: no raw reason code anywhere", SERVER_REASONS.filter((code) => html.includes(code)), []);
  expect("render: the duplicate item says what it is", woo.includes(">Possible duplicate customer<"), true);
  expect("render: both cards side by side (wrapping grid) with name/email/phone/city", woo.includes('data-review-cards="1"') && /grid-template-columns:repeat\(auto-fit, ?minmax\(min\(100%, ?200px\), ?1fr\)\)/.test(woo)
    && woo.includes('data-review-card="existing"') && woo.includes('data-review-card="new"') && ["john.a@example.test", "john.b@example.test", "Manchester", "London", "+44 7700 900111", "07700 900222"].every((v) => woo.includes(v)), true);
  expect("render: the differing fields are marked", (woo.match(/data-review-differs="1"/g) || []).length, 6);
  expect("render: what conflicts", woo.includes(">Email differs<") && woo.includes(">Phone differs<") && woo.includes(">Same name, but their details differ.<"), true);
  expect("render: the two answers, and no plain Resolve on a duplicate", [woo.includes('data-review-action="same"') && woo.includes(">Same person<"), woo.includes('data-review-action="different"') && woo.includes(">Different people<"), woo.includes('data-review-action="resolve"')], [true, true, false]);
  expect("render: Woo duplicate opens the order that brought the buyer", /href="\/orders\/ord_woo_2"[^>]*data-review-link="order"/.test(woo), true);
  expect("render: inbound duplicate (no order) opens the customer instead", /href="\/customers\?customerId=newJane"[^>]*data-review-link="customer"/.test(inb) && !inb.includes("/orders/"), true);
  const hashed = render({ rows: [{ ...wooDup, orderNumber: "#IN-7104" }] });
  expect("render: a store's own '#' is not doubled", [hashed.includes("#IN-7104"), hashed.includes("##")], [true, false]);
  expect("render: inbound pill reads Website, not the server's phrase", inb.includes(">Website<") && !inb.includes("Inbound webhook"), true);
  expect("render: engine row keeps Open order + Resolve, reasons in words", eng.includes('href="/orders/ord_engine_1"') && eng.includes('data-review-action="resolve"') && eng.includes("Item not in the catalogue, No order number from the store"), true);
  const confirm = blocks(render({ rows: [wooDup], confirmKey: "customer:custdup_newJohn" }))["customer:custdup_newJohn"] || "";
  expect("render: Same person asks first (merge text, Yes, merge, Cancel; the two answers hidden)", [confirm.includes('data-review-confirm="1"'), confirm.includes(">Yes, merge<"), confirm.includes(">Cancel<"), confirm.includes('data-review-action="same"')], [true, true, true, false]);
  const member = render({ rows: [engineRow, wooDup], isOwner: false });
  expect("render: a member sees no answer buttons and is told who decides", [/data-review-action="(same|different|resolve|confirm-same)"/.test(member), member.includes(">Only the workspace owner can decide.<")], [false, true]);
  const noCustomers = render({ rows: [inboundDup], canSeeCustomers: false });
  expect("render: without Customers access, no cards and no customer link", [noCustomers.includes('data-review-cards="1"'), noCustomers.includes("/customers?")], [false, false]);
  const older = render({ rows: [oldShapeDup] });
  expect("render: the older list shape keeps today's Resolve, never /orders/custdup_", [older.includes('data-review-action="resolve"'), older.includes("/orders/custdup_"), older.includes('data-review-action="same"')], [true, false, false]);
  const loading = render({ rows: [wooDup], cards: {} });
  expect("render: cards not read yet say Loading…", (loading.match(/>Loading…</g) || []).length, 2);
  const gone = render({ rows: [wooDup], cards: { oldJohn: review.reviewCustomerCard("oldJohn", cardData.oldJohn), newJohn: review.reviewCustomerCard("newJohn", null) } });
  expect("render: a card that is gone says so", gone.includes(">This card is no longer there.<"), true);
  studio = await load("lib/studioflow/language.ts");
  const tr = render({ rows: [wooDup, inboundDup], t: (s) => studio.studioT(s, "Türkçe") });
  expect("render: Turkish", ["Olası mükerrer müşteri", "Aynı kişi", "Farklı kişiler", "Mevcut kart", "Yeni kart", "E-posta farklı", "Web sitesi", "Müşteriyi Aç", "Siparişi aç"].filter((w) => !tr.includes(w)), []);
});

// ---- 3. the wiring
await section("3 wiring", async () => {
  const health = read("app/settings/CommerceSyncHealthCard.tsx");
  expect("health card: the shared list renders the rows", health.includes("<CommerceReviewList rows={review} workspace={workspace} language={language} onChanged={load} />"), true);
  expect("health card: rows per channel through the shared filter", health.includes("setReview(reviewRowsForProvider(queue.data?.items, provider));"), true);
  expect("health card: no raw-code fallback and no order link of its own", [/REVIEW_REASON_LABELS\[r\] \|\| r/.test(health), /href=\{`\/orders\/\$\{encodeURIComponent\(row\.orderId\)\}`\}/.test(health)], [false, false]);
  const list = read("app/settings/CommerceReviewList.tsx");
  expect("list: decisions and Resolve go through the payload builder", list.includes('(functions, "resolveCommerceReview")(payload)') && list.includes("resolveReviewPayload(companyId, row, decision)") && list.includes("resolveReviewPayload(companyId, row)"), true);
  expect("list: owner-only answers (the server's gate), Customers gate for the cards", list.includes('const isOwner = workspace.role === "owner";') && list.includes('workspaceAccessAllows(workspace.memberAccess, "customers")'), true);
  expect("list: the cards are read as the customer page reads them", list.includes('getDoc(doc(db, "musteriler", id))'), true);
  expect("list: the inbound card loads the queue and keeps its channel", list.includes('(functions, "listCommerceReviewQueue")') && list.includes("reviewRowsForProvider(await loadCommerceReviewRows(companyId), provider)"), true);
  expect("list: the inbound card follows the list's own Orders gate (no card, not a refusal)", list.includes('const canSeeOrders = workspaceAccessAllows(workspace.memberAccess, "orders");') && list.includes("if (!canSeeOrders) return null;"), true);
  const page = read("app/settings/page.tsx");
  const inbound = page.slice(page.indexOf("function InboundWebhookSection("), page.indexOf("function CopyableIntegrationValue("));
  expect("inbound: the review card sits in the inbound settings section", /<CommerceReviewCard\s+workspace=\{workspace\}\s+language=\{language\}\s+provider="inbound"/.test(inbound), true);
  expect("inbound: reached from Settings ▸ Integrations (manage=inbound)", page.includes('{managing === "inbound" ? <InboundWebhookSection workspace={workspace} language={language} /> : null}'), true);
  // No hard-coded English: JSX text nodes in the new components are symbols only; every word goes through t().
  for (const rel of ["app/settings/CommerceReviewItems.tsx", "app/settings/CommerceReviewList.tsx"]) {
    const src = read(rel);
    const texts = [...src.matchAll(/(?<![=-])>\s*([A-Za-z][A-Za-z ,.'’]{2,})\s*</g)].map((m) => m[1]);
    expect(`${rel}: no hard-coded English text node`, src ? texts : ["(missing)"], []);
    const attrs = [...src.matchAll(/(?:title|aria-label|placeholder)="([A-Za-z][^"]*)"/g)].map((m) => m[1]);
    expect(`${rel}: no hard-coded English attribute`, attrs, []);
  }
});

// ---- 4. the sentences, in eleven languages
await section("4 translations", async () => {
  studio = studio || await load("lib/studioflow/language.ts");
  if (!review) throw new Error("commerceReview.ts did not load");
  const { SUPPORTED_STUDIO_LANGUAGES, studioTranslationRow, studioT } = studio;
  const others = SUPPORTED_STUDIO_LANGUAGES.filter((lang) => lang !== "English");
  expect("twelve web languages", SUPPORTED_STUDIO_LANGUAGES.length, 12);
  const sentences = [...new Set([...review.COMMERCE_REVIEW_SCREEN_TEXTS, ...SERVER_SENTENCES, "Loading…", "Resolved."])];
  for (const sentence of sentences) {
    const row = studioTranslationRow(sentence) || {};
    const missing = others.filter((lang) => !String(row[lang] || "").trim());
    expect(`translated everywhere: ${sentence}`, missing, []);
  }
  const { COMMERCE_REVIEW_TRANSLATIONS } = await load("lib/studioflow/commerceReviewTranslations.ts");
  for (const [key, langs] of Object.entries(COMMERCE_REVIEW_TRANSLATIONS)) {
    expect(`table row complete: ${key.slice(0, 50)}`, others.filter((lang) => !String(langs[lang] || "").trim()), []);
    expect(`merged table carries it: ${key.slice(0, 50)}`, others.filter((lang) => studioT(key, lang) !== langs[lang]), []);
  }
  // Without this table, none of its keys exists: it overwrites no older translation.
  const without = read("lib/studioflow/language.ts")
    .replace(/^import \{ COMMERCE_REVIEW_TRANSLATIONS \} from "\.\/commerceReviewTranslations";\n/m, "")
    .replace(/^mergeIntoTranslations\(COMMERCE_REVIEW_TRANSLATIONS\);\n/m, "");
  const base = await load("lib/studioflow/language.ts", { source: without, outName: "languageWithoutCommerceReview" });
  expect("the new table adds keys only", Object.keys(COMMERCE_REVIEW_TRANSLATIONS).filter((key) => base.studioTranslationRow(key)), []);
  expect("Turkish probe", studioT("Same person", "Türkçe"), "Aynı kişi");
  expect("Arabic probe", studioT("Different people", "العربية (Arabic)"), "أشخاص مختلفون");
});

fs.rmSync(tmp, { recursive: true, force: true });
if (failures.length) {
  console.error(`check-commerce-review-ui: ${failures.length} of ${checks} checks failed`);
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log(`check-commerce-review-ui: ${checks} checks passed`);
