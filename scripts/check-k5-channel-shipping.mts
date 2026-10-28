/**
 * K5 r3/r4 (26 Oct 2026): whose shipping cost a WooCommerce / Shopify / inbound order holds, on the order screen.
 * r4: the pilot's on/off state (D3), the true review reason (D4), the owner's text fixes, ESC-01..03 reused.
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
const S = (order: Record<string, unknown>, protectionOn: boolean | null = true) => H.channelShippingState({ id: "woo_ws_1", ...order }, protectionOn);
const kinds = (state: { actions: Array<{ kind: string }> } | null) => (state ? state.actions.map((a) => a.kind).join(",") : "null");
const en = (text: string) => text;
const money = (v: number) => `£${v.toFixed(2)}`;

// ---------------------------------------------------------------- (a) the table
check("not a channel order (manual / Etsy) -> null, nothing changes", () => {
  assert.equal(H.channelShippingState({ id: "abc", deliveryCost: 0 }, true), null);
  assert.equal(H.channelShippingState({ id: "etsy_x", deliveryCost: 0, commerce: { provider: "etsy" } }, true), null);
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
check("changed after it was saved (cause unknown): estimate, neutral 'was £7.77, now £4.00', Keep £4.00 + Restore £7.77", () => {
  const s = S({ deliveryCost: 4, deliveryCostOwner: rec({ owner: "seller", ownerSource: "manual", manualValue: 7.77, needsReview: true, reviewReason: "changed_outside_manual_path" }) });
  assert.equal(s.estimate, true); assert.equal(s.note.key, "review_outside"); assert.equal(kinds(s), "keep,restore");
  assert.equal(H.channelShippingNoteText(s.note, s.channel, en, money), "Shipping cost changed after it was saved as your value: was £7.77, now £4.00");
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

// ---------------------------------------------------------------- (a2) r4: the pilot switched off (D3), the true review reason (D4)
const card4 = readFileSync(new URL("../app/orders/OrderDetailContent.tsx", import.meta.url), "utf8");
const orders4 = readFileSync(new URL("../lib/studioflow/orders.ts", import.meta.url), "utf8");
const manualRec = () => rec({ owner: "seller", ownerSource: "manual", manualValue: 7.77 });
const pausedRec = () => rec({ channelSent: 4.5, channelHistory: [4, 4.5], needsReview: true, reviewReason: "synced_while_paused", pausedValue: 7.77, pausedAtMs: 1000 });
check("D3: protection OFF - channel / inferred / unknown / paused records read as before K5 (no K5 label, live edit path)", () => {
  for (const r of [rec({}), rec({ owner: "seller", ownerSource: "inferred" }), rec({ owner: "unknown", channelPending: 5.5, keptValue: 4, needsReview: true, reviewReason: "pre_k5_conflict" }), pausedRec()]) {
    const s = S({ deliveryCost: 4, deliveryCostOwner: r }, false);
    assert.equal(s.hasRecord, false); assert.equal(s.manualEditPath, false); assert.equal(s.status, "none"); assert.equal(kinds(s), ""); assert.equal(s.estimate, false);
  }
});
check("D3: protection state not known yet (null) = off for a record that is not explicit manual", () => {
  const s = S({ deliveryCost: 4, deliveryCostOwner: rec({}) }, null); assert.equal(s.hasRecord, false); assert.equal(s.manualEditPath, false);
});
check("D3: explicit manual keeps its labels and edit path with the protection OFF (the server protects it either way)", () => {
  const s = S({ deliveryCost: 7.77, deliveryCostOwner: manualRec() }, false);
  assert.equal(s.hasRecord, true); assert.equal(s.manualEditPath, true); assert.equal(s.status, "your_value"); assert.equal(s.yoursExplicit, true);
  assert.equal(H.channelShippingStatusText(s, { id: "woo_ws_1", deliveryCost: 7.77 }, en, money), "Your value — WooCommerce syncs don't replace it unless you choose WooCommerce's value");
  assert.equal(H.needsDeliveryCostProtectionState(manualRec()), false); assert.equal(H.needsDeliveryCostProtectionState(rec({})), true); assert.equal(H.needsDeliveryCostProtectionState(null), false);
});
check("D3 wiring: the screen asks the server, passes the answer, and falls back to the live save on a pilot_off refusal", () => {
  assert.ok(card4.includes("getDeliveryCostOwnershipStateFromWeb(workspace).then(") && card4.includes("const channelShipping = channelShippingState(order, deliveryCostProtection);"));
  assert.ok(card4.includes('() => saveMoneyFinanceValue("deliveryCost", parsed, "Shipping Cost")') && card4.includes('if (!result.ok && "pilotOff" in result) {'));
  assert.ok(orders4.includes('e?.details?.reason === "pilot_off"') && orders4.includes("return { ok: false, pilotOff: true };") && orders4.includes('(functions, "getDeliveryCostOwnershipState")'));
});
check("D4: a value the channel replaced while protection was off is named as a SYSTEM change; Restore £7.77 / Keep £4.50; no-repair hint", () => {
  const s = S({ deliveryCost: 4.5, deliveryCostOwner: pausedRec() }, true);
  assert.equal(s.status, "review"); assert.equal(s.note.key, "review_paused"); assert.equal(kinds(s), "restore,accept_channel"); assert.equal(s.estimate, true);
  assert.equal(H.channelShippingNoteText(s.note, s.channel, en, money), "WooCommerce sync replaced £7.77 with £4.50 while shipping cost protection was off");
  assert.equal(H.channelShippingReviewHint(s.note, en), "Turning protection back on did not change it back. Choose which figure to keep.");
  assert.equal(H.channelShippingActionLabel(s.actions[0], s.channel, en, money), "Restore £7.77");
  assert.equal(H.channelShippingActionLabel(s.actions[1], s.channel, en, money), "Keep £4.50");
});
check("D4: the paused review names the figure the SYNC wrote, even if the order was edited after it (3.90 typed later)", () => {
  const s = S({ deliveryCost: 3.9, deliveryCostOwner: pausedRec() }, true);
  assert.equal(H.channelShippingNoteText(s.note, s.channel, en, money), "WooCommerce sync replaced £7.77 with £4.50 while shipping cost protection was off");
  assert.equal(kinds(s), "restore,keep,use_channel");
  assert.equal(H.channelShippingActionLabel(s.actions[1], s.channel, en, money), "Keep £3.90");
});
check("D4: the 'changed after it was saved' text names no cause (no device / editor / person)", () => {
  assert.ok(!/device|editor|you changed|someone|another/i.test(H.K5_REVIEW_OUTSIDE), H.K5_REVIEW_OUTSIDE);
});
// ---------------------------------------------------------------- (c2) r4 texts
check("#5/#6/#7 ARE ETSY-SHIP-2's ESC-01..03 (#7 exactly the approved ESC-03), not repeated in K5's table", () => {
  assert.equal(H.K5_ENTER_HINT, "Enter your actual postage cost in Shipping Cost to improve this profit estimate.");
  assert.equal(H.K5_NOTE_BUYER_PAID, "Shipping cost not known — buyer paid {amount}"); assert.equal(H.K5_NOTE_FREE, "Free shipping — postage cost not known, not counted");
  for (const shared of [H.K5_ENTER_HINT, H.K5_NOTE_BUYER_PAID, H.K5_NOTE_FREE]) assert.ok(!(shared in H.CHANNEL_SHIPPING_COST_TRANSLATIONS), shared);
  assert.ok(card4.includes("channelShippingProfitNote(channelShipping.note, channelShipping.channel, detailLanguage, t, channelShippingMoney)"));
});
check("#2 says the buyer paid no shipping (not that the postage cost is zero)", () => {
  const s = S({ deliveryCost: 0, deliveryCostOwner: rec({ channelSent: 0, channelHistory: [0] }) });
  assert.equal(H.channelShippingStatusText(s, { id: "woo_ws_1", deliveryCost: 0 }, en, money), "From WooCommerce: the buyer paid no shipping");
});
check("#3 states when syncs do not change it: explicit manual (until you choose the channel's) vs while protection is on", () => {
  const inferred = S({ deliveryCost: 7.77, deliveryCostOwner: rec({ owner: "seller", ownerSource: "inferred" }) }, true);
  assert.equal(inferred.yoursExplicit, false);
  assert.equal(H.channelShippingStatusText(inferred, { id: "woo_ws_1", deliveryCost: 7.77 }, en, money), "Your value — WooCommerce syncs don't replace it while shipping cost protection is on");
});
check("#9 says the figure's source could not be confirmed (no 'ownership')", () => {
  assert.ok(/could not confirm where this figure came from/i.test(H.K5_REVIEW_CONFLICT_HINT) && !/ownership/i.test(H.K5_REVIEW_CONFLICT_HINT));
});
check("#19/#20 say what the server did: the channel's figure set now, or the value stays until a sync", () => {
  assert.equal(H.channelShippingReturnedText(true, "woocommerce", "£4.00", en), "Shipping cost set to WooCommerce's figure, £4.00.");
  assert.equal(H.channelShippingReturnedText(false, "woocommerce", "£6.66", en), "Shipping cost handed back to WooCommerce. It stays £6.66 until a WooCommerce sync sets a new figure.");
  assert.ok(card4.includes("channelShippingReturnedText(applied, channel, channelShippingMoney(applied && deliveryCost !== null ? deliveryCost : (expected ?? 0)), t)"));
});
check("profit note joins the two sentences with the language's punctuation (SHIP-2 K3), amount isolated in Arabic", () => {
  const note = { key: "buyer_paid", amount: 4 };
  assert.ok(H.channelShippingProfitNote(note, "woocommerce", "English", en, money).includes("£4.00. Enter your actual postage cost"));
  assert.ok(H.channelShippingProfitNote(note, "woocommerce", "日本語 (Japanese)", en, money).includes("£4.00。Enter"));
  assert.ok(H.channelShippingProfitNote(note, "woocommerce", "العربية (Arabic)", en, money).includes("⁦£4.00⁩، "));
});

// ---------------------------------------------------------------- (b) wiring
const card = readFileSync(new URL("../app/orders/OrderDetailContent.tsx", import.meta.url), "utf8");
const orders = readFileSync(new URL("../lib/studioflow/orders.ts", import.meta.url), "utf8");
const fsrc = readFileSync(new URL("../lib/studioflow/firestore.ts", import.meta.url), "utf8");
check("Shipping Cost: with a record the edit goes through setDeliveryCostManual with the value shown as expected", () => {
  assert.ok(card.includes('onSave={(value, meta) => (channelShipping?.manualEditPath ? saveDeliveryCostManual(value, meta) : saveMoneyFinanceValue("deliveryCost", value, "Shipping Cost"))}'));
  assert.ok(card.includes("setDeliveryCostManualFromWeb(workspace, { orderId: order.id, deliveryCost: parsed, expectedDeliveryCost })"));
});
// r3 real-use acceptance (26 Oct 2026), two defects seen on screen in the production build:
check("expected = the figure shown when the editor OPENED, not the live value under an open editor (two tabs)", () => {
  assert.ok(card.includes("onEditStart={noteDeliveryCostEditStart}"));
  assert.ok(card.includes("deliveryCostShownRef.current = order.deliveryCostPresent === false ? null : order.deliveryCost;"));
  assert.ok(card.includes("const expectedDeliveryCost = shown !== undefined ? shown : (order.deliveryCostPresent === false ? null : order.deliveryCost);"));
  assert.ok(card.includes("editedRef.current = false;\n    onEditStart?.();"));
});
check("opening the Shipping Cost editor and leaving it without typing makes no call (ownership unchanged)", () => {
  assert.ok(card.includes("onChange={event => { editedRef.current = true; setDraft(event.target.value); }}"));
  assert.ok(card.includes("await onSave(parsed, { edited: editedRef.current });"));
  assert.ok(card.includes("if (meta && !meta.edited) return;"));
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
