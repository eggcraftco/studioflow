// The order's link back to its shop, and the folded list's rail (8 Oct 2026).
//
// 1. lib/studioflow/orderSourceLink.ts, compiled with the tree's own TypeScript and run on
//    every source an order can have — WooCommerce (engine stamp; legacy import without a
//    stamp), Shopify (stamp; legacy fields), Etsy, eBay, Amazon, Square, a manual order and a
//    public-form order: the link comes from the server's stamp alone, is https on a host the
//    provider (or the workspace's own connection) owns and names this order; anything else
//    earns no link and a reason. The preview field is not even an input.
// 2. lib/studioflow/orderRail.ts: the square's photo-or-initials rule, the status colour, the
//    tooltip's three facts, and that a pasted shop link is not treated as a photo.
// 3. components/OrderListRail.tsx rendered to HTML with react-dom: a listbox, one option per
//    order, aria-selected and a ring on the selected one, the tooltip on each, the photo where
//    there is one and the initials where there is not.
// 4. The pages and the stylesheet, read from the source: the strip no longer falls back to the
//    preview link; its link opens in a new tab with rel="noopener noreferrer"; the preview card's
//    own action says "Open preview image"; Orders and Schedule render the rail while folded and
//    keep the list's scroll offset; the rail's corner dot uses a logical inset (RTL).
// 5. Every new sentence in all eleven other languages, through the app's studioT.
//
//   node scripts/check-order-source-links.mjs
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
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "order-source-links-check-"));

// ---- compiling the tree's modules
const FAKES = {
  "firebase/functions": `export function httpsCallable() { return async () => ({ data: [] }); }`,
  "@/lib/firebase/client": `export const auth = { currentUser: null }; export const db = {}; export const functions = {};`
};
for (const [name, source] of Object.entries(FAKES)) fs.writeFileSync(path.join(tmp, `${name.replace(/[^a-z]/gi, "_")}.mjs`), source);
const reactUrl = pathToFileURL(require.resolve("react")).href;
const compile = (rel) => {
  const out = path.join(tmp, `${path.basename(rel).replace(/\.tsx?$/, "")}.mjs`);
  if (fs.existsSync(out)) return out;
  const tsx = rel.endsWith(".tsx");
  let js = ts.transpileModule(read(rel), { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020,
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
    const dirOf = rel.startsWith("components/") ? "components" : "lib/studioflow";
    for (const candidate of [`${dirOf}/${m[1]}.ts`, `${dirOf}/${m[1]}.tsx`, `lib/studioflow/${m[1]}.ts`, `components/${m[1]}.tsx`]) {
      if (fs.existsSync(path.join(root, candidate))) { compile(candidate); break; }
    }
  }
  return out;
};
const load = async (rel) => import(pathToFileURL(compile(rel)).href);

// ---- 1. the link builder, one case per source
const { orderSourceLink, orderSourceLinkReasonText } = await load("lib/studioflow/orderSourceLink.ts");
const woo = (over = {}) => ({ provider: "woocommerce", providerDisplayName: "WooCommerce", externalId: "4821", externalAdminUrl: "https://shop.example.co.uk/wp-admin/post.php?post=4821&action=edit", ...over });
const HOSTS = ["shop.example.co.uk"];

expect("woo: the stamp's admin address on the connected host is the link", orderSourceLink({ commerce: woo(), customFields: { Source: "WooCommerce" }, connectedHosts: HOSTS }),
  { kind: "link", href: "https://shop.example.co.uk/wp-admin/post.php?post=4821&action=edit", provider: "woocommerce", source: "WooCommerce" });
expect("woo: the preview field is not an input (a photo cannot become the link)", Object.keys(orderSourceLink({ commerce: woo(), customFields: {}, connectedHosts: HOSTS, designLink: "https://firebasestorage.googleapis.com/v0/b/x/o/preview.jpg" })).includes("designLink"), false);
expect("woo: a host the workspace did not connect earns no link", orderSourceLink({ commerce: woo({ externalAdminUrl: "https://other-shop.example.com/wp-admin/post.php?post=4821&action=edit" }), connectedHosts: HOSTS }).reason, "host-mismatch");
expect("woo: connections not loaded yet = the link waits", orderSourceLink({ commerce: woo(), connectedHosts: null }).reason, "loading");
expect("woo: loaded and none = refused", orderSourceLink({ commerce: woo(), connectedHosts: [] }).reason, "host-mismatch");
expect("woo: http is not opened", orderSourceLink({ commerce: woo({ externalAdminUrl: "http://shop.example.co.uk/wp-admin/post.php?post=4821&action=edit" }), connectedHosts: HOSTS }).reason, "unsafe");
expect("woo: javascript: is not opened", orderSourceLink({ commerce: woo({ externalAdminUrl: "javascript:alert(1)" }), connectedHosts: HOSTS }).reason, "unsafe");
expect("woo: data: is not opened", orderSourceLink({ commerce: woo({ externalAdminUrl: "data:text/html,hi" }), connectedHosts: HOSTS }).reason, "unsafe");
expect("woo: credentials in the address are not opened", orderSourceLink({ commerce: woo({ externalAdminUrl: "https://user:pw@shop.example.co.uk/wp-admin/post.php?post=4821&action=edit" }), connectedHosts: HOSTS }).reason, "unsafe");
expect("woo: an address that names another order earns no link", orderSourceLink({ commerce: woo({ externalAdminUrl: "https://shop.example.co.uk/wp-admin/post.php?post=9999&action=edit" }), connectedHosts: HOSTS }).reason, "wrong-order");
expect("woo: the shop's front page is not the order", orderSourceLink({ commerce: woo({ externalAdminUrl: "https://shop.example.co.uk/" }), connectedHosts: HOSTS }).reason, "unsafe");
expect("woo: a stamp without an address", orderSourceLink({ commerce: woo({ externalAdminUrl: "" }), connectedHosts: HOSTS }).reason, "no-address");
expect("woo legacy import (no stamp, Source field only): no address, named as WooCommerce", orderSourceLink({ commerce: null, customFields: { Source: "WooCommerce", "WooCommerce Order ID": "77" }, connectedHosts: HOSTS }),
  { kind: "none", reason: "no-address", provider: "woocommerce", source: "WooCommerce" });

expect("shopify legacy fields: the admin address is built, never read", orderSourceLink({ commerce: null, customFields: { Source: "Shopify", "Shopify Domain": "eggcraft.myshopify.com", "Shopify Order ID": "5551234" } }).href,
  "https://admin.shopify.com/store/eggcraft/orders/5551234");
expect("shopify legacy fields: a handle that is not a handle earns no link", orderSourceLink({ commerce: null, customFields: { Source: "Shopify", "Shopify Domain": "evil.com/x", "Shopify Order ID": "1" } }).reason, "no-address");
expect("shopify stamp: the store's own admin address", orderSourceLink({ commerce: { provider: "shopify", providerDisplayName: "Shopify", externalId: "5551234", externalAdminUrl: "https://eggcraft.myshopify.com/admin/orders/5551234" } }).href,
  "https://eggcraft.myshopify.com/admin/orders/5551234");
expect("shopify stamp: another host is refused", orderSourceLink({ commerce: { provider: "shopify", externalId: "1", externalAdminUrl: "https://eggcraft.example.com/admin/orders/1" } }).reason, "host-mismatch");

expect("etsy: the server writes no seller address, so no link", orderSourceLink({ commerce: { provider: "etsy", providerDisplayName: "Etsy", externalId: "3344", externalAdminUrl: "" } }), { kind: "none", reason: "no-address", provider: "etsy", source: "Etsy" });
expect("ebay: built from the order id through the eBay builder", orderSourceLink({ commerce: { provider: "ebay", providerDisplayName: "eBay", externalId: "12-34567-89012", externalAdminUrl: "https://www.ebay.de/mesh/ord/details?orderid=12-34567-89012" } }).href,
  "https://www.ebay.de/sh/ord/details?orderid=12-34567-89012");
expect("amazon: Seller Central on a marketplace host", orderSourceLink({ commerce: { provider: "amazon", providerDisplayName: "Amazon", externalId: "026-1234567-1234567", externalAdminUrl: "https://sellercentral.amazon.co.uk/orders-v3/order/026-1234567-1234567" } }).href,
  "https://sellercentral.amazon.co.uk/orders-v3/order/026-1234567-1234567");
expect("amazon: a look-alike host is refused", orderSourceLink({ commerce: { provider: "amazon", externalId: "026-1234567-1234567", externalAdminUrl: "https://sellercentral.amazon.co.uk.evil.com/orders-v3/order/026-1234567-1234567" } }).reason, "host-mismatch");
expect("square: the dashboard address (production)", orderSourceLink({ commerce: { provider: "square", providerDisplayName: "Square", externalId: "ORD_abc123", externalAdminUrl: "https://app.squareup.com/dashboard/orders/overview/ORD_abc123" } }).href,
  "https://app.squareup.com/dashboard/orders/overview/ORD_abc123");
expect("square: sandbox host is its own", orderSourceLink({ commerce: { provider: "square", externalId: "ORD_abc123", externalAdminUrl: "https://app.squareupsandbox.com/dashboard/orders/overview/ORD_abc123" } }).kind, "link");
expect("square: any other host is refused", orderSourceLink({ commerce: { provider: "square", externalId: "ORD_abc123", externalAdminUrl: "https://squareup.com.example/dashboard/orders/overview/ORD_abc123" } }).reason, "host-mismatch");
expect("manual order: no source, so nothing to link", orderSourceLink({ commerce: null, customFields: {} }), { kind: "none", reason: "no-source", provider: "", source: "" });
expect("public form order: no source, so nothing to link", orderSourceLink({ commerce: null, customFields: { Source: "Website" } }).reason, "no-source");
for (const reason of ["no-address", "host-mismatch", "unsafe", "wrong-order", "loading"]) expect(`reason text: ${reason}`, orderSourceLinkReasonText(reason).length > 0, true);
expect("reason text: no-source keeps the strip silent", orderSourceLinkReasonText("no-source"), "");

// ---- 2. the rail's rules
const rail = await load("lib/studioflow/orderRail.ts");
expect("rail: a shop permalink is not a photo", rail.orderRailImageUrl("https://shop.example.co.uk/checkout/order-received/4821/?key=wc_order_x"), "");
expect("rail: an uploaded photo is", rail.orderRailImageUrl("https://firebasestorage.googleapis.com/v0/b/x.appspot.com/o/companies%2Fc%2Fpreview.jpg?alt=media&token=t"), "https://firebasestorage.googleapis.com/v0/b/x.appspot.com/o/companies%2Fc%2Fpreview.jpg?alt=media&token=t");
expect("rail: a pasted image link is", rail.orderRailImageUrl("https://cdn.example.com/a/b/photo.webp?w=400"), "https://cdn.example.com/a/b/photo.webp?w=400");
expect("rail: initials of the customer", rail.orderRailFallbackText({ id: "1", customerName: "Jane Doe", designName: "Ring", status: "Not Yet", previewImageUrl: "" }), "JD");
expect("rail: the project number when there is no customer", rail.orderRailFallbackText({ id: "1", customerName: "", designName: "Ring", status: "Not Yet", previewImageUrl: "", projectNumber: 42 }), "#42");
expect("rail: the design's initials as the last resort", rail.orderRailFallbackText({ id: "1", customerName: "", designName: "Gold Ring", status: "Not Yet", previewImageUrl: "" }), "GR");
expect("rail: tooltip = number · customer · status", rail.orderRailTooltip({ id: "1", customerName: "Jane Doe", designName: "Ring", status: "In Progress", previewImageUrl: "", projectNumber: 12 }, "Yapılıyor"), "#12 · Jane Doe · Yapılıyor");
expect("rail: tooltip without a number", rail.orderRailTooltip({ id: "1", customerName: "Jane Doe", designName: "Ring", status: "In Progress", previewImageUrl: "" }, "In Progress"), "Jane Doe · In Progress");
expect("rail: tones", ["Done", "Not Yet", "Cancelled", "In Progress"].map(s => rail.orderRailTone(s)), ["success", "danger", "neutral", "warning"]);
expect("rail: a dispatched order reads as success whatever its step says", rail.orderRailTone("In Progress", true), "success");

// ---- 3. the rail rendered
const React = (await import(reactUrl)).default;
const { renderToStaticMarkup } = await import(pathToFileURL(require.resolve("react-dom/server")).href);
const { OrderListRail } = await load("components/OrderListRail.tsx");
const orders = [
  { id: "a", customerName: "Jane Doe", designName: "Ring", status: "In Progress", previewImageUrl: "https://cdn.example.com/photo.jpg", projectNumber: 12 },
  { id: "b", customerName: "Ali Veli", designName: "Cake", status: "Done", previewImageUrl: "https://shop.example.co.uk/checkout/order-received/4821/", projectNumber: 13 }
];
const html = renderToStaticMarkup(React.createElement(OrderListRail, { orders, selectedId: "b", onSelect: () => {}, label: "Collapsed order list", statusText: (s) => s, idPrefix: "orders-rail-order" }));
expect("rail html: a listbox with the given name", html.includes('role="listbox"') && html.includes('aria-label="Collapsed order list"'), true);
expect("rail html: one option per order", (html.match(/role="option"/g) || []).length, 2);
expect("rail html: the selected order is marked", html.includes('aria-selected="true"') && html.includes('class="orders-rail-item is-selected"'), true);
expect("rail html: the unselected one is not", (html.match(/aria-selected="false"/g) || []).length, 1);
expect("rail html: the tooltip carries number, customer, status", html.includes('title="#12 · Jane Doe · In Progress"'), true);
expect("rail html: the photo where there is one", html.includes('src="https://cdn.example.com/photo.jpg"'), true);
expect("rail html: the shop permalink is not shown as a photo", html.includes("order-received"), false);
expect("rail html: initials where there is no photo", html.includes(">AV<"), true);
expect("rail html: the status colour on each square", html.includes('data-rail-tone="warning"') && html.includes('data-rail-tone="success"'), true);
expect("rail html: the selected square is the one in the tab order", html.includes('tabindex="0"') && (html.match(/tabindex="-1"/g) || []).length === 1, true);

// ---- 4. the pages and the stylesheet
const detail = read("app/orders/OrderDetailContent.tsx");
expect("strip: the preview link is no longer a fallback for the shop link", detail.includes("order.designLink) ? order.designLink : \"\")"), false);
expect("strip: the link comes from the builder", detail.includes("orderSourceLink({ commerce: stamp, customFields: cf, connectedHosts })"), true);
expect("strip: a link that cannot be offered says so, with the reason as the tooltip", detail.includes('data-order-source-link="unavailable"') && detail.includes("title={t(linkReason)}"), true);
expect("strip: the link opens in a new tab and leaks no opener", /data-order-source-link="1"[\s\S]{0,40}/.test(detail) && detail.includes('href={sourceLink.href} target="_blank" rel="noopener noreferrer"'), true);
expect("strip: WooCommerce asks for the workspace's connected hosts", detail.includes('useConnectedStoreHosts(order.companyId || "", (stamp?.provider || source).toLowerCase() === "woocommerce")'), true);
expect("preview card: opening the photo is its own, named action", detail.includes('{t("Open preview image")}') && detail.includes('data-preview-open-link="1"'), true);
const ordersPage = read("app/orders/page.tsx");
const schedulePage = read("app/schedule/page.tsx");
for (const [name, src, prefix] of [["orders", ordersPage, "orders-rail-order"], ["schedule", schedulePage, "schedule-rail-order"]]) {
  expect(`${name}: the rail renders while the list is folded`, src.includes("{sidebar.collapsed ? (\n            <OrderListRail") && src.includes(`idPrefix="${prefix}"`), true);
  expect(`${name}: the rail shows the filtered list and the page's selection`, src.includes("orders={filteredOrders}") && src.includes("selectedId={selectedOrderId}"), true);
  expect(`${name}: the list's scroll offset is kept across the fold`, src.includes("ScrollTopRef.current = event.currentTarget.scrollTop") && src.includes("}, [sidebar.collapsed]);"), true);
  expect(`${name}: the rail's name is translated`, src.includes('label={t("Collapsed order list")}'), true);
}
expect("schedule: hovering a square lights the timeline row as the card does", schedulePage.includes("onHoverChange={setHoveredOrderId}"), true);
const css = read("app/globals.css");
expect("css: the rail exists and hides horizontal overflow", css.includes(".orders-rail {") && /\.orders-rail \{[^}]*overflow-x: hidden/.test(css), true);
expect("css: the corner dot uses a logical inset so Arabic mirrors it", /\.orders-rail-dot \{[^}]*inset-inline-end: 3px/.test(css), true);
expect("css: the unavailable link is styled as text, not a button", css.includes(".shopify-source-link.is-unavailable {"), true);
expect("css: the folded sidebar still hides the full list (the rail replaces it, not joins it)", /\.is-sidebar-collapsed \.orders-list,/.test(css), true);

// ---- 5. the sentences, in eleven languages
const { studioT, SUPPORTED_STUDIO_LANGUAGES } = await load("lib/studioflow/language.ts");
const sentences = [
  "Order link not available", "The store did not provide a link to this order.", "The stored link points to a store that is not connected to this workspace.",
  "The stored link is not a secure web address.", "The stored link does not name this order.", "Checking the connected store...", "Open preview image", "Collapsed order list"
];
for (const sentence of sentences) {
  const missing = SUPPORTED_STUDIO_LANGUAGES.filter(lang => lang !== "English" && studioT(sentence, lang) === sentence);
  expect(`translated everywhere: ${sentence}`, missing, []);
}
expect("Turkish probe", studioT("Collapsed order list", "Türkçe"), "Daraltılmış sipariş listesi");

fs.rmSync(tmp, { recursive: true, force: true });
if (failures.length) {
  console.error(`check-order-source-links: ${failures.length} of ${checks} checks failed`);
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log(`check-order-source-links: ${checks} checks passed`);
