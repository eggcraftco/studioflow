/**
 * ETSY-E2E r2 (24 Oct 2026), K2: the Etsy panel says what Etsy says about getting
 * the order to the buyer — one honest line under the state. Shipped is never
 * "delivered"; a delivery is "reported by Etsy"; missing parts are left out.
 *
 * Run: npm run test:etsy-fulfilment   (npx tsx scripts/check-etsy-fulfilment.mts)
 */
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { studioT, SUPPORTED_STUDIO_LANGUAGES } from "../lib/studioflow/language";

let failed = 0; let passed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`ok   ${name}`); }
  catch (error) { failed += 1; console.log(`FAIL ${name}\n     ${(error as Error).message}`); }
}
const lib = await import("../lib/studioflow/etsyFulfilment").catch(() => ({})) as Record<string, any>;
const line = (source: unknown, language = "English") => {
  assert.equal(typeof lib.etsyFulfilmentLine, "function", "lib/studioflow/etsyFulfilment.ts: etsyFulfilmentLine missing");
  return lib.etsyFulfilmentLine(source, language);
};
// tsx compiles the app's JSX with the classic runtime; the app files rely on Next's automatic one.
(globalThis as Record<string, unknown>).React = React;
// The panel must load without a Firebase app (the client is imported on use).
const panelModule = await import("../app/orders/EtsySourcePanel").catch((error) => ({ loadError: error })) as Record<string, any>;
const EtsySourcePanel = panelModule.EtsySourcePanel ?? (() => { throw new Error(`EtsySourcePanel did not load: ${panelModule.loadError?.message}`); });
const NOON_20_OCT = Date.UTC(2026, 9, 20, 12, 0, 0);
const NOON_23_OCT = Date.UTC(2026, 9, 23, 12, 0, 0);
const items = [{ title: "Mug", listingId: "123", quantity: 1 }];
const render = (source: Record<string, unknown>, language = "English") => renderToStaticMarkup(React.createElement(EtsySourcePanel, {
  source: { receiptId: "9", isPaid: true, items, ...source }, photos: { photos: [], reason: "", loading: false }, language, showMoney: false
}));

check("shipped, tracked: date · carrier tracking, and 'Delivery not confirmed'", () => {
  const r = line({ isShipped: true, fulfilment: { state: "shipped", shippedAtMs: NOON_20_OCT, carrier: "Royal Mail", trackingCode: "RM123GB", basis: ["shipments"] } });
  assert.deepEqual(r, { text: "Shipped on Etsy · 20 Oct 2026 · Royal Mail RM123GB", muted: "Delivery not confirmed" });
});
check("shipped, untracked: no carrier → no carrier; 'no tracking number'", () => {
  assert.deepEqual(line({ isShipped: true, fulfilment: { state: "shipped", shippedAtMs: NOON_20_OCT, carrier: "", trackingCode: "" } }),
    { text: "Shipped on Etsy · 20 Oct 2026 · no tracking number", muted: "Delivery not confirmed" });
  assert.deepEqual(line({ isShipped: true, fulfilment: { state: "shipped", carrier: "Evri" } }),
    { text: "Shipped on Etsy · Evri · no tracking number", muted: "Delivery not confirmed" }, "no date → no date");
});
check("delivered: 'Delivered — reported by Etsy · date'", () => {
  assert.deepEqual(line({ isShipped: true, fulfilment: { state: "delivered", shippedAtMs: NOON_20_OCT, deliveredReportedAtMs: NOON_23_OCT, carrier: "Royal Mail", trackingCode: "RM1" } }),
    { text: "Delivered — reported by Etsy · 23 Oct 2026" });
});
check("legacy order (no fulfilment, isShipped): 'Shipped on Etsy · delivery not confirmed'", () => {
  assert.deepEqual(line({ isShipped: true }), { text: "Shipped on Etsy · delivery not confirmed" });
  assert.equal(line({ isShipped: false }), null);
});
check("completed without shipping; not shipped / cancelled say nothing extra", () => {
  assert.deepEqual(line({ fulfilment: { state: "completed_not_shipped" } }), { text: "Completed on Etsy · not marked as shipped" });
  assert.equal(line({ fulfilment: { state: "not_shipped" } }), null);
  assert.equal(line({ isCancelled: true, fulfilment: { state: "cancelled" } }), null);
});
check("Turkish: the line is translated, the carrier and tracking stay as Etsy wrote them", () => {
  const r = line({ fulfilment: { state: "shipped", shippedAtMs: NOON_20_OCT, carrier: "Royal Mail", trackingCode: "RM123GB" } }, "Türkçe");
  assert.match(r.text, /^Etsy'de kargoya verildi · .+ · Royal Mail RM123GB$/);
  assert.equal(r.muted, "Teslimat doğrulanmadı");
});
check("every new string has all 11 translations", () => {
  for (const key of ["Shipped on Etsy", "Delivery not confirmed", "no tracking number", "Delivered — reported by Etsy", "Completed on Etsy · not marked as shipped", "Shipped on Etsy · delivery not confirmed"]) {
    for (const language of SUPPORTED_STUDIO_LANGUAGES) {
      if (language !== "English") assert.notEqual(studioT(key, language), key, `${key} / ${language}`);
    }
  }
});
check("the panel draws the line under the state (tracked, untracked, delivered, legacy)", () => {
  const tracked = render({ isShipped: true, fulfilment: { state: "shipped", shippedAtMs: NOON_20_OCT, carrier: "Royal Mail", trackingCode: "RM123GB" } });
  assert.match(tracked, /data-etsy-fulfilment="">.*Shipped on Etsy · 20 Oct 2026 · Royal Mail RM123GB.*Delivery not confirmed/);
  assert.ok(tracked.indexOf("studio-pill") < tracked.indexOf("data-etsy-fulfilment"), "line comes after the state");
  assert.match(render({ isShipped: true, fulfilment: { state: "shipped", shippedAtMs: NOON_20_OCT } }), /no tracking number/);
  assert.match(render({ isShipped: true, fulfilment: { state: "delivered", deliveredReportedAtMs: NOON_23_OCT } }), /Delivered — reported by Etsy · 23 Oct 2026/);
  assert.doesNotMatch(render({ isShipped: true, fulfilment: { state: "delivered", deliveredReportedAtMs: NOON_23_OCT } }), /Delivery not confirmed/);
  assert.match(render({ isShipped: true }), /Shipped on Etsy · delivery not confirmed/);
  assert.doesNotMatch(render({ isShipped: false }), /data-etsy-fulfilment/);
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
