/**
 * K5 r3 (26 Oct 2026): whose shipping cost a WooCommerce / Shopify / inbound order holds, on the order screen.
 * (a) the state/label table of lib/studioflow/channelShippingCost.ts (pure), (b) the order screen's wiring (source
 * pins), (c) every new text translated in every app language.
 *
 * Run: npm run test:k5-channel-shipping   (npx tsx scripts/check-k5-channel-shipping.mts)
 * Control: npx tsx scripts/check-k5-channel-shipping.mts --helper <mutated copy of channelShippingCost.ts> -> must FAIL.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { studioT, SUPPORTED_STUDIO_LANGUAGES } from "../lib/studioflow/language";

const helperArg = process.argv.indexOf("--helper");
const helperPath = helperArg > 0 ? path.resolve(process.argv[helperArg + 1]) : path.resolve(new URL("../lib/studioflow/channelShippingCost.ts", import.meta.url).pathname);
const H = await import(pathToFileURL(helperPath).href);

let failed = 0; let passed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`ok   ${name}`); }
  catch (error) { failed += 1; console.log(`FAIL ${name}\n     ${(error as Error).message}`); }
}
const rec = (over: Record<string, unknown>) => H.parseDeliveryCostOwner({
  owner: "channel", ownerSource: "sync", channel: "woocommerce", channelSent: 4, channelSentKnown: true, channelHistory: [4],
  channelPending: null, channelPendingAtMs: null, keptValue: null, manualValue: null, manualAtMs: null, needsReview: false, reviewReason: null, ...over
});
const S = (order: Record<string, unknown>) => H.channelShippingState({ id: "woo_ws_1", ...order });
const kinds = (state: { actions: Array<{ kind: string }> } | null) => (state ? state.actions.map((a) => a.kind).join(",") : "null");
const en = (text: string) => text;
const money = (v: number) => `£${v.toFixed(2)}`;

// ---------------------------------------------------------------- (a) the table
check("not a channel order (manual / Etsy) -> null, nothing changes", () => {
  assert.equal(H.channelShippingState({ id: "abc", deliveryCost: 0 }), null);
  assert.equal(H.channelShippingState({ id: "etsy_x", deliveryCost: 0, commerce: { provider: "etsy" } }), null);
});
check("channel from the record, the commerce stamp, or the id prefix", () => {
  assert.equal(H.channelOfOrder({ id: "x", commerce: { provider: "shopify" } }), "shopify");
  assert.equal(H.channelOfOrder({ id: "inbound_ws_IN1" }), "inbound");
  assert.equal(H.channelOfOrder({ id: "x", deliveryCostOwner: rec({ channel: "inbound" }) }), "inbound");
});
check("no record, cost 4 -> Final Profit (as today)", () => { const s = S({ deliveryCost: 4 }); assert.equal(s.estimate, false); assert.equal(s.note, null); assert.equal(s.manualEditPath, false); });
check("no record, cost 0 -> estimate, 'not entered'", () => { const s = S({ deliveryCost: 0 }); assert.equal(s.estimate, true); assert.equal(s.note.key, "not_entered"); });
check("no record, deliveryCost absent -> estimate, 'not entered'", () => { const s = S({ deliveryCost: 0, deliveryCostPresent: false }); assert.equal(s.estimate, true); assert.equal(s.note.key, "not_entered"); });
check("channel 4 = cost 4 -> estimate 'buyer paid £4.00', status channel, manual edit path", () => {
  const s = S({ deliveryCost: 4, deliveryCostOwner: rec({}) });
  assert.equal(s.estimate, true); assert.equal(s.note.key, "buyer_paid"); assert.equal(s.note.amount, 4); assert.equal(s.status, "channel"); assert.equal(s.manualEditPath, true); assert.equal(kinds(s), "");
});
check("channel reported real free shipping (0, known) -> estimate 'free shipping'", () => {
  const s = S({ deliveryCost: 0, deliveryCostOwner: rec({ channelSent: 0, channelHistory: [0] }) });
  assert.equal(s.note.key, "free"); assert.equal(s.status, "channel_free"); assert.equal(s.estimate, true);
});
check("channel did NOT report a figure, cost 0 -> 'not entered' + Confirm £0", () => {
  const s = S({ deliveryCost: 0, deliveryCostOwner: rec({ channelSent: null, channelSentKnown: false, channelHistory: [] }) });
  assert.equal(s.note.key, "not_entered"); assert.equal(kinds(s), "confirm_zero");
});
check("seller/manual £0 -> Final Profit (an explicit choice), status 'your value'", () => {
  const s = S({ deliveryCost: 0, deliveryCostOwner: rec({ owner: "seller", ownerSource: "manual", manualValue: 0 }) });
  assert.equal(s.estimate, false); assert.equal(s.status, "your_value"); assert.equal(kinds(s), "use_channel");
});
check("seller/manual 7.77 with the channel's 4 known -> final + 'Use WooCommerce's value (£4.00)'", () => {
  const s = S({ deliveryCost: 7.77, deliveryCostOwner: rec({ owner: "seller", ownerSource: "manual", manualValue: 7.77 }) });
  assert.equal(s.estimate, false); assert.equal(kinds(s), "use_channel");
  assert.equal(H.channelShippingActionLabel(s.actions[0], s.channel, en, money), "Use WooCommerce's value (£4.00)");
});
check("seller/inferred 0 (an old client wrote 0) -> estimate 'not entered' + Confirm £0 + use channel", () => {
  const s = S({ deliveryCost: 0, deliveryCostOwner: rec({ owner: "seller", ownerSource: "inferred" }) });
  assert.equal(s.estimate, true); assert.equal(s.note.key, "not_entered"); assert.equal(kinds(s), "confirm_zero,use_channel");
});
check("seller/inferred 7.77 -> Final Profit", () => { const s = S({ deliveryCost: 7.77, deliveryCostOwner: rec({ owner: "seller", ownerSource: "inferred" }) }); assert.equal(s.estimate, false); });
check("unknown (pre-K5 conflict): estimate, review box, Keep my value + Use channel's pending £5.50", () => {
  const s = S({ deliveryCost: 4, deliveryCostOwner: rec({ owner: "unknown", channelSent: 5.5, channelHistory: [5.5], channelPending: 5.5, keptValue: 4, needsReview: true, reviewReason: "pre_k5_conflict" }) });
  assert.equal(s.estimate, true); assert.equal(s.status, "review"); assert.equal(s.note.key, "review_conflict"); assert.equal(kinds(s), "keep,use_channel");
  assert.equal(H.channelShippingNoteText(s.note, s.channel, en, money), "WooCommerce says £5.50, this order has £4.00");
  assert.equal(H.channelShippingActionLabel(s.actions[0], s.channel, en, money), "Keep my value");
});
check("changed outside the editor: estimate, 'was £7.77, now £4.00', Keep £4.00 + Restore £7.77", () => {
  const s = S({ deliveryCost: 4, deliveryCostOwner: rec({ owner: "seller", ownerSource: "manual", manualValue: 7.77, needsReview: true, reviewReason: "changed_outside_manual_path" }) });
  assert.equal(s.estimate, true); assert.equal(s.note.key, "review_outside"); assert.equal(kinds(s), "keep,restore");
  assert.equal(H.channelShippingNoteText(s.note, s.channel, en, money), "Changed outside the shipping cost editor: was £7.77, now £4.00");
});
check("stale echo of an older channel figure (4 in history, channel now 5.50) -> still the channel's, estimate", () => {
  const s = S({ deliveryCost: 4, deliveryCostOwner: rec({ channelSent: 5.5, channelHistory: [4, 5.5] }) });
  assert.equal(s.status, "channel"); assert.equal(s.estimate, true);
});
check("old client typed 6.25 since the last sync (none of the channel's) -> final, 'your value', use channel £5.50", () => {
  const s = S({ deliveryCost: 6.25, deliveryCostOwner: rec({ channelSent: 5.5, channelHistory: [4, 5.5] }) });
  assert.equal(s.estimate, false); assert.equal(s.status, "your_value"); assert.equal(kinds(s), "use_channel");
});
check("an r2 record (no ownerSource) reads as seller/inferred", () => {
  const r = H.parseDeliveryCostOwner({ owner: "seller", channel: "shopify", channelSent: 4, channelHistory: [4], needsReview: false });
  assert.equal(r.ownerSource, "inferred"); assert.equal(r.channelSentKnown, true);
});
check("a malformed record is ignored", () => { assert.equal(H.parseDeliveryCostOwner({ owner: "x", channel: "woocommerce" }), null); assert.equal(H.parseDeliveryCostOwner({ owner: "seller", channel: "etsy" }), null); });

// ---------------------------------------------------------------- (b) wiring
const card = readFileSync(new URL("../app/orders/OrderDetailContent.tsx", import.meta.url), "utf8");
const orders = readFileSync(new URL("../lib/studioflow/orders.ts", import.meta.url), "utf8");
const fsrc = readFileSync(new URL("../lib/studioflow/firestore.ts", import.meta.url), "utf8");
check("Shipping Cost: with a record the edit goes through setDeliveryCostManual with the value shown as expected", () => {
  assert.ok(card.includes('onSave={value => (channelShipping?.manualEditPath ? saveDeliveryCostManual(value) : saveMoneyFinanceValue("deliveryCost", value, "Shipping Cost"))}'));
  assert.ok(card.includes("expectedDeliveryCost: order.deliveryCostPresent === false ? null : order.deliveryCost"));
});
check("a stale edit is reported, never overwritten (aborted -> message with the current value)", () => {
  assert.ok(orders.includes('code === "functions/aborted"') && orders.includes("return { ok: false, stale: true };"));
  assert.ok(card.includes("if (!result.ok) setDeliveryCostStale(true);") && card.includes('data-testid="k5-shipping-stale"'));
});
check("callable names match the server contract", () => {
  assert.ok(orders.includes('httpsCallable<Record<string, unknown>, { ok?: boolean; deliveryCost?: number }>(functions, "setDeliveryCostManual")'));
  assert.ok(orders.includes('(functions, "returnDeliveryCostToChannel")'));
});
check("review box + actions only when the order carries the record", () => {
  assert.ok(card.includes("{channelShipping?.hasRecord ? (") && card.includes('data-testid="k5-shipping-review"') && card.includes("runChannelShippingAction(action)"));
});
// On the ETSY-SHIP-2 base (143f2f61) one rule decides the label for every order: orderProfitIsEstimate (K1), K5 included.
check("profit: the one estimate rule (SHIP-2 K1) includes the channel shipping estimate; CT row not green then", () => {
  assert.ok(card.includes("const orderProfitIsEstimate = orderCostsMissing || (isEtsyOrder && etsyOrderProfitIsEstimate(orderFinance, etsyShippingUnknown)) || channelShippingEstimate;"));
  assert.ok(card.includes('tone={orderProfitIsEstimate ? undefined : "positive"}'));
});
check("profit: non-CT branch reads 'Estimated profit' for a channel shipping estimate", () => {
  assert.ok(card.includes(") : orderProfitIsEstimate ? ("));
  assert.equal((card.match(/data-testid="finance-channel-shipping"/g) || []).length, 2);
});
check("PDF says what the screen says", () => {
  assert.ok(card.includes("} else if ((pdfFinance.directCost === 0 && pdfFinance.otherExpenses === 0) || options.profitIsEstimate) {") && card.includes("profitIsEstimate: orderProfitIsEstimate"));
});
check("the order loader carries the record and whether deliveryCost exists", () => {
  assert.ok(fsrc.includes("deliveryCostOwner: parseDeliveryCostOwner(data.deliveryCostOwner),") && fsrc.includes('deliveryCostPresent: typeof data.deliveryCost === "number"'));
});

// ---------------------------------------------------------------- (c) texts
const KEYS = Object.entries(H).filter(([k, v]) => k.startsWith("K5_") && typeof v === "string").map(([, v]) => v as string);
check(`every new text (${KEYS.length}) is translated in every app language (drafts)`, () => {
  assert.ok(KEYS.length >= 21, `only ${KEYS.length} keys`);
  const missing: string[] = [];
  for (const key of KEYS) for (const lang of SUPPORTED_STUDIO_LANGUAGES) {
    if (lang === "English") continue;
    if (studioT(key, lang) === key) missing.push(`${lang}: ${key}`);
  }
  assert.equal(missing.length, 0, missing.slice(0, 5).join(" | "));
});
check("placeholders survive translation ({channel}, {amount}, …)", () => {
  const bad: string[] = [];
  for (const key of KEYS) {
    const holes = (key.match(/\{[a-zA-Z]+\}/g) || []).sort().join(",");
    for (const lang of SUPPORTED_STUDIO_LANGUAGES) {
      const tr = studioT(key, lang);
      if ((tr.match(/\{[a-zA-Z]+\}/g) || []).sort().join(",") !== holes) bad.push(`${lang}: ${key}`);
    }
  }
  assert.equal(bad.length, 0, bad.slice(0, 5).join(" | "));
});
check("Turkish probe through the merged table", () => {
  assert.equal(studioT("Shipping cost not entered — profit is an estimate", "Türkçe"), "Kargo maliyeti girilmedi — kâr tahminidir");
  assert.equal(studioT("Website", "Türkçe"), "Web sitesi");
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
