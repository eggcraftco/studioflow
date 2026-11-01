// Delivery address on an order (1 Nov 2026): app/orders/OrderDeliveryAddress.tsx, lib/studioflow/deliveryAddress.ts,
// the Shipping & Tracking case of OrderDetailContent's renderCard.
//
// 1. Both views draw the block: renderCard("shipping") renders <OrderDeliveryAddress>, and renderCard is what the
//    Sections view body and the Cards view frames call.
// 2. A save sends exactly the seven shipping* keys (no other key), through updateWebOrder's details; address rows are
//    joined with ", " (the importers' form, which Royal Mail splits back into lines); the country is a code, and a
//    stored name of the same country is kept as it is.
// 3. Permissions: the block's edit right is canEditOrderFully (Owner/Admin/Member), not the details gate that also
//    admits Workflow Only (the server refuses Workflow Only); read-only roles get no buttons, and nothing when empty.
//    An eBay order whose address eBay keeps private gets no block.
// 4. A server without the delivery-address keys ("Unsupported order detail field.") gets a plain sentence, and the
//    form keeps the person's text.
// 5. Every word reads in all eleven other languages; the guide's Shipping & Tracking chapter has the bullet in EN, TR
//    and the ten GUIDE_T languages; the styles exist for light, dark and phone width.
// Each rule first runs against a known-bad mutant: a check that cannot fail is itself a failure.
//
//   npx tsx scripts/check-delivery-address.mts      (npm run test:delivery-address)
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { studioT } from "../lib/studioflow/language";
import {
  DELIVERY_ADDRESS_KEYS,
  addressRowsFromStreet,
  countryCodeFor,
  countryValueForSave,
  defaultCountryCode,
  deliveryAddressFrom,
  deliveryAddressPatch,
  draftFromAddress,
  streetFromAddressRows,
  type DeliveryAddress,
  type DeliveryAddressDraft
} from "../lib/studioflow/deliveryAddress";
import { getGuideTree } from "../lib/publicSite/guide";

const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const LANGS = ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português", "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"];
const TEN = LANGS.slice(1);

let checks = 0;
const failures: string[] = [];
function rule(name: string, test: () => boolean, mutant?: () => boolean) {
  checks += 1;
  let ok = false;
  try { ok = test(); } catch (error) { failures.push(`${name} (threw: ${(error as Error).message})`); return; }
  if (!ok) { failures.push(name); return; }
  if (mutant) {
    let caught = false;
    try { caught = !mutant(); } catch { caught = true; }
    if (!caught) failures.push(`${name} — the check passed a known-bad mutant`);
  }
}

const page = read("app/orders/OrderDetailContent.tsx");
const block = read("app/orders/OrderDeliveryAddress.tsx");
const css = read("app/globals.css");

// ---- 1. both views ---------------------------------------------------------------------------------------
function shippingCase(src: string): string {
  const fn = src.indexOf("  function renderCard(cardId: OrderDetailCardId) {");
  const at = src.indexOf('      case "shipping":', fn);
  const end = src.indexOf('      case "schedule":', at);
  return fn >= 0 && at > fn && end > at ? src.slice(at, end) : "";
}
const drawsBlock = (src: string) => {
  const c = shippingCase(src);
  return (c.match(/<OrderDeliveryAddress\b/g) ?? []).length === 1 && /onSave=\{saveDeliveryAddress\}/.test(c);
};
rule("renderCard(\"shipping\") draws the Delivery address block once", () => drawsBlock(page),
  () => drawsBlock(page.replace("<OrderDeliveryAddress", "<NotTheBlock")));
const bothViews = (src: string) => {
  const stack = src.indexOf('className="order-stack-body" data-stack-card={cardId}');
  const stackCalls = stack >= 0 && src.slice(stack, stack + 200).includes("{renderCard(cardId)}");
  const all = (src.match(/\{renderCard\(cardId\)\}/g) ?? []).length;
  return stackCalls && all >= 3; // the Sections body + the desktop and phone card frames
};
rule("the Sections view body and both Cards view frames render renderCard(cardId)", () => bothViews(page),
  () => bothViews(page.replace('className="order-stack-body" data-stack-card={cardId} hidden={!open}>\n          {renderCard(cardId)}', 'className="order-stack-body" data-stack-card={cardId} hidden={!open}>\n          {null}')));

// ---- 2. the save -----------------------------------------------------------------------------------------
const stored = deliveryAddressFrom({});
const draft: DeliveryAddressDraft = { name: " Alex  Carter ", company: "", rows: "Flat 3\n 12 Goldsmith Row \n\n", city: "London", postcode: "E2 8QA", country: "GB", phone: "" };
const exactKeys = (build: (d: DeliveryAddressDraft, s: DeliveryAddress) => Record<string, unknown>) =>
  JSON.stringify(Object.keys(build(draft, stored)).sort()) === JSON.stringify([...DELIVERY_ADDRESS_KEYS].sort())
  && DELIVERY_ADDRESS_KEYS.length === 7 && DELIVERY_ADDRESS_KEYS.every(k => k.startsWith("shipping"));
rule("a save's patch is exactly the seven shipping* keys", () => exactKeys(deliveryAddressPatch),
  () => exactKeys((d, s) => ({ ...deliveryAddressPatch(d, s), customerName: "x" })));
const joins = (toStreet: (rows: string) => string) => toStreet("Flat 3\n 12 Goldsmith Row \n\n") === "Flat 3, 12 Goldsmith Row";
rule("address rows are joined with \", \"", () => joins(streetFromAddressRows) && deliveryAddressPatch(draft, stored).shippingStreetAddress === "Flat 3, 12 Goldsmith Row",
  () => joins(rows => rows.split("\n").map(r => r.trim()).filter(Boolean).join("\n")));
// What updateWebOrder stores (cleanOrderText folds whitespace) and Royal Mail reads back as lines (contract.js).
const serverClean = (v: string) => v.replace(/\s+/g, " ").trim();
const rmLines = (street: string) => street.split(/\r?\n|,\s*/).map(l => l.trim()).filter(Boolean);
rule("the stored street comes back as the same rows (server clean + Royal Mail split)", () => {
  const street = serverClean(deliveryAddressPatch({ ...draft, rows: "Unit 4\nMill Lane\nHolbeck" }, stored).shippingStreetAddress);
  return JSON.stringify(rmLines(street)) === JSON.stringify(["Unit 4", "Mill Lane", "Holbeck"]) && addressRowsFromStreet(street) === "Unit 4\nMill Lane\nHolbeck";
}, () => JSON.stringify(rmLines(serverClean("Unit 4\nMill Lane\nHolbeck"))) === JSON.stringify(["Unit 4", "Mill Lane", "Holbeck"]));
rule("the name is cleaned like the server does", () => deliveryAddressPatch(draft, stored).shippingName === "Alex Carter");
rule("country: a code; a stored name of the chosen country is kept; another choice saves its code; an unknown name is kept",
  () => countryValueForSave("GB", "United Kingdom") === "United Kingdom" && countryValueForSave("GB", "") === "GB"
    && countryValueForSave("FR", "GB") === "FR" && countryValueForSave("Wakanda", "Wakanda") === "Wakanda"
    && countryCodeFor("uk") === "GB" && countryCodeFor("United States") === "US" && countryCodeFor("Ireland") === "IE" && countryCodeFor("Narnia") === "",
  () => countryValueForSave("GB", "United Kingdom") === "GB");
rule("the form starts on the workspace's country, else the UK", () => defaultCountryCode("TR") === "TR" && defaultCountryCode("") === "GB" && defaultCountryCode("OTHER") === "GB"
  && draftFromAddress(stored, "Manual Customer", "DE").country === "DE");
rule("prefill: stored fields; the customer's name when no recipient is stored; rows split like Royal Mail",
  () => {
    const d = draftFromAddress(deliveryAddressFrom({ shippingStreetAddress: "Flat 3, 12 Goldsmith Row", shippingCountry: "United Kingdom" }), "Manual Customer", "");
    return d.name === "Manual Customer" && d.rows === "Flat 3\n12 Goldsmith Row" && d.country === "GB";
  });
const sendsDetails = (src: string) => {
  const at = src.indexOf("async function saveDeliveryAddress(patch: DeliveryAddress)");
  const body = at >= 0 ? src.slice(at, src.indexOf("\n  }\n", at)) : "";
  return /await updateOrderFromWeb\(workspace, \{ orderId: order\.id, details: patch \}\);/.test(body) && /applyOptimisticDetailsPatch\(patch\)/.test(body) && /await onReloadOrder\(\)/.test(body);
};
rule("the save goes through updateWebOrder details (optimistic, reloaded on failure)", () => sendsDetails(page),
  () => sendsDetails(page.replace("details: patch }", "details: { ...patch, notes: \"\" } }")));
rule("the optimistic patch and the order type carry shippingCompany",
  () => /if \(typeof patch\.shippingCompany === "string"\) nextPatch\.shippingCompany = patch\.shippingCompany;/.test(page)
    && /shippingCompany\?: string;/.test(read("lib/studioflow/orders.ts"))
    && /shippingCompany: stringValue\(data\.shippingCompany, ""\)/.test(read("lib/studioflow/firestore.ts")));

// ---- 3. permissions and protections -------------------------------------------------------------------------
const gate = (src: string) => /<OrderDeliveryAddress[\s\S]*?canEdit=\{canEditOrderFully\}/.test(shippingCase(src)) && /if \(!canEditOrderFully\) return/.test(src);
rule("edit right = canEditOrderFully (Owner/Admin/Member); Workflow Only is not given it", () => gate(page),
  () => gate(page.replace("canEdit={canEditOrderFully}", "canEdit={canInlineEditFullDetails}")));
const ebayGuard = (src: string) => /order\.commerce\?\.provider === "ebay" && !String\(order\.shippingStreetAddress \|\| ""\)\.trim\(\) && !String\(order\.shippingPostalCode \|\| ""\)\.trim\(\) \? null : \(\s*<OrderDeliveryAddress/.test(shippingCase(src));
rule("no block on an eBay order whose address eBay keeps private", () => ebayGuard(page),
  () => ebayGuard(page.replace('order.commerce?.provider === "ebay" && !String(order.shippingStreetAddress || "").trim() && !String(order.shippingPostalCode || "").trim() ? null : (\n                <OrderDeliveryAddress', "(\n                <OrderDeliveryAddress")));

// The block is JSX compiled the classic way here (tsx), as the other render checks do.
(globalThis as Record<string, unknown>).React = React;
const blockModule = await import("../app/orders/OrderDeliveryAddress");
const { OrderDeliveryAddress, DeliveryAddressForm, deliveryAddressSaveError, DELIVERY_ADDRESS_SERVER_TOO_OLD } = blockModule as Record<string, any>;
const full = deliveryAddressFrom({ shippingName: "Alex Carter", shippingStreetAddress: "Flat 3, 12 Goldsmith Row", shippingCity: "London", shippingPostalCode: "E2 8QA", shippingCountry: "United Kingdom" });
const draw = (props: Record<string, unknown>) => renderToStaticMarkup(React.createElement(OrderDeliveryAddress, {
  address: stored, customerName: "Manual Customer", customerAddress: "", workspaceCountry: "GB", canEdit: true, language: "English",
  saving: false, onSave: async () => null, ...props
}));
rule("editor, empty order: Add address, and Use customer address when the customer has a free-text address", () => {
  const html = draw({ customerAddress: "12 Goldsmith Row, London E2 8QA" });
  return html.includes("data-delivery-address-add") && html.includes("data-delivery-use-customer-address") && html.includes("No delivery address yet.");
});
rule("no Use customer address when the customer has none", () => !draw({}).includes("data-delivery-use-customer-address"));
rule("read-only, empty: nothing at all", () => draw({ canEdit: false }) === "", () => draw({ canEdit: true }) === "");
rule("read-only, stored address: the lines, no buttons", () => {
  const html = draw({ canEdit: false, address: full });
  return html.includes("Alex Carter") && html.includes("12 Goldsmith Row") && html.includes("London E2 8QA") && html.includes("United Kingdom")
    && !html.includes("<button") && html.includes('data-delivery-address="read-only"');
});
rule("editor, stored address: Edit", () => draw({ address: full }).includes("data-delivery-address-edit"));
const formHtml = renderToStaticMarkup(React.createElement(DeliveryAddressForm, {
  draft: draftFromAddress(stored, "Manual Customer", "GB"), setDraft: () => {}, customerAddress: "12 Goldsmith Row, London E2 8QA",
  language: "English", saving: false, error: "", onSubmit: () => {}, onCancel: () => {}
}));
const formFields = (html: string) => DELIVERY_ADDRESS_KEYS.every(k => html.includes(`data-delivery-field="${k}"`)) && (html.match(/data-delivery-field=/g) ?? []).length === 7;
rule("the form has the seven fields (Name, Company, Address lines, City, Postcode, Country, Phone) and Save", () => formFields(formHtml) && formHtml.includes("data-delivery-address-save")
  && formHtml.includes("<textarea") && formHtml.includes('<select') && formHtml.includes('value="GB" selected') && formHtml.includes("data-delivery-use-customer-address"),
  () => formFields(formHtml.replace('data-delivery-field="shippingCompany"', "")));

// ---- 4. a server without the patch ---------------------------------------------------------------------------
rule("\"Unsupported order detail field.\" reads as the plain sentence, in the person's language",
  () => deliveryAddressSaveError("Unsupported order detail field.", "English") === DELIVERY_ADDRESS_SERVER_TOO_OLD
    && deliveryAddressSaveError("Unsupported order detail field.", "Türkçe") !== DELIVERY_ADDRESS_SERVER_TOO_OLD
    && deliveryAddressSaveError("Your current role is View Only and cannot edit this order.", "English").startsWith("Your current role"));
const keepsText = (src: string) => /const failure = await onSave\(deliveryAddressPatch\(draft, address\)\);\s*if \(failure === null\) \{\s*setDraft\(null\);\s*return;\s*\}\s*setError\(deliveryAddressSaveError\(failure, language\)\);/.test(src);
rule("a failed save keeps the form and the person's text (the draft is cleared only on success)", () => keepsText(block),
  () => keepsText(block.replace("if (failure === null) {\n      setDraft(null);\n      return;\n    }", "setDraft(null);\n    if (failure === null) {\n      return;\n    }")));

// ---- 5. words, guide, styles ---------------------------------------------------------------------------------
const words = [...new Set([...block.matchAll(/\bt\("((?:[^"\\]|\\.)*)"\)/g)].map(m => m[1]))];
words.push(DELIVERY_ADDRESS_SERVER_TOO_OLD);
// Words that are rightly the same as English in a language.
const SAME_ALLOWED: Record<string, string[]> = { "Name": ["Deutsch"] };
const missing = (dict: (w: string, l: string) => string) => words.filter(w => LANGS.some(l => dict(w, l) === w && !(SAME_ALLOWED[w] ?? []).includes(l)));
rule(`every word of the block reads in eleven languages (${words.length} words)`, () => words.length >= 18 && missing(studioT).length === 0,
  () => missing((w, l) => (w === "Address lines" ? w : studioT(w, l))).length === 0);
const EN_BULLET = "Delivery address: Add address (or Edit) sets the recipient that Royal Mail and DHL labels use";
function chapterText(language: string): string {
  const find = (nodes: any[]): any => { for (const n of nodes) { if (n.id === "card-shipping") return n; const c = find(n.children ?? []); if (c) return c; } return null; };
  const node = find(getGuideTree(language as any) as any[]);
  return JSON.stringify(node?.blocks ?? []);
}
rule("guide: the Shipping & Tracking chapter has the bullet in English and Turkish", () => chapterText("English").includes(EN_BULLET) && chapterText("Türkçe").includes("Teslimat adresi: Adres ekle"));
rule("guide: the bullet is translated in the ten other languages", () => TEN.every(l => !chapterText(l).includes(EN_BULLET) && chapterText(l).length > 0));
const styled = (src: string) => src.includes(".order-delivery-address {") && src.includes('html[data-studio-theme="dark"] .order-delivery-address {')
  && /@media \(max-width: 640px\) \{\s*\.order-delivery-address__form \{ grid-template-columns: minmax\(0, 1fr\); \}/.test(src)
  && src.includes("--da-label: var(--sec-label,");
rule("styles: section palette with fallbacks, dark theme, one column at phone width", () => styled(css),
  () => styled(css.replace('html[data-studio-theme="dark"] .order-delivery-address {', "")));

console.log(`${checks - failures.length}/${checks} delivery-address checks`);
for (const f of failures) console.log(`FAIL ${f}`);
if (failures.length) process.exit(1);
console.log("DELIVERY ADDRESS WEB OK");
