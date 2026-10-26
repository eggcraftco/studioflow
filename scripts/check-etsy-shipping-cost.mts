/**
 * ETSY-SHIP-2 (25 Oct 2026): an Etsy order whose shipping cost is what the buyer paid never reads as a final profit —
 * order card (with and without Corporation Tax) and Dashboard — and no figure changes (label only).
 *
 * Run: npm run test:etsy-shipping-cost   (npx tsx scripts/check-etsy-shipping-cost.mts)
 * Optional: ETSY_SHIP2_EVIDENCE=<evidence-treeR.json> also runs the helper over the server acceptance's real documents.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { studioT, SUPPORTED_STUDIO_LANGUAGES } from "../lib/studioflow/language";
import {
  etsyShippingCostUnknown, etsyShippingUnknownNote, etsyShippingUnknownCount,
  ETSY_SHIPPING_UNKNOWN_PAID, ETSY_SHIPPING_UNKNOWN_FREE, ETSY_SHIPPING_ENTER_HINT, ETSY_SHIPPING_UNKNOWN_FOOTNOTE
} from "../lib/studioflow/etsyShippingCost";
import { orderFinanceBlock } from "../lib/studioflow/finance";

let failed = 0; let passed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`ok   ${name}`); }
  catch (error) { failed += 1; console.log(`FAIL ${name}\n     ${(error as Error).message}`); }
}
const gbp = (v: number) => `£${v.toFixed(2)}`;
const id = (x: string) => x;
const card = readFileSync(new URL("../app/orders/OrderDetailContent.tsx", import.meta.url), "utf8");
const dash = readFileSync(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8");
const store = readFileSync(new URL("../lib/studioflow/firestore.ts", import.meta.url), "utf8");

check("a/d: buyer paid 3.95, order holds 3.95 → not known, note says what the buyer paid", () => {
  const s = etsyShippingCostUnknown({ deliveryCost: 3.95 }, { shipping: 3.95, deliveryCostSource: "buyer_paid_assumed" });
  assert.deepEqual(s, { buyerPaid: 3.95, free: false });
  assert.equal(etsyShippingUnknownNote(s!, id, gbp), "Shipping cost not known — buyer paid £3.95");
});
check("c: free shipping (0/0) → not known, 'postage cost not counted'", () => {
  const s = etsyShippingCostUnknown({ deliveryCost: 0 }, { shipping: 0 });
  assert.deepEqual(s, { buyerPaid: 0, free: true });
  assert.equal(etsyShippingUnknownNote(s!, id, gbp), "Free shipping — postage cost not known, not counted");
});
check("b: seller typed 5.20 (differs from Etsy's 3.95) → known, no note", () => {
  assert.equal(etsyShippingCostUnknown({ deliveryCost: 5.2 }, { shipping: 3.95 }), null);
});
check("server marker seller_entered → known even when equal", () => {
  assert.equal(etsyShippingCostUnknown({ deliveryCost: 3.95 }, { shipping: 3.95, deliveryCostSource: "seller_entered" }), null);
});
check("an order already on the screen before the server marker exists (no marker) still gets the note", () => {
  assert.ok(etsyShippingCostUnknown({ deliveryCost: 3.95 }, { shipping: 3.95 }));
});
check("not Etsy / no Etsy copy / no shipping figure → nothing", () => {
  assert.equal(etsyShippingCostUnknown({ deliveryCost: 3.95 }, null), null);
  assert.equal(etsyShippingCostUnknown({ deliveryCost: 3.95 }, {}), null);
});
check("label only: the engine block (profit, shipping) is the same with and without the Etsy copy", () => {
  const base = { id: "x", paymentDate: new Date(), paidAmount: 15.95, remainingAmount: 0, watchPurchasePrice: 5, paymentFee: 0, deliveryCost: 3.95, taxAmount: 0, customFields: { Source: "Etsy" }, customerName: "", designName: "", watchRef: "" };
  const a = orderFinanceBlock(base, null); const b = orderFinanceBlock({ ...base, etsyShipping: { shipping: 3.95, deliveryCostSource: "buyer_paid_assumed" } }, null);
  assert.deepEqual(a, b);
});
check("Dashboard count: only orders whose cost is the buyer's figure", () => {
  assert.equal(etsyShippingUnknownCount([
    { deliveryCost: 3.95, etsyShipping: { shipping: 3.95 } }, { deliveryCost: 0, etsyShipping: { shipping: 0 } },
    { deliveryCost: 5.2, etsyShipping: { shipping: 3.95 } }, { deliveryCost: 3.95, etsyShipping: { shipping: 3.95, deliveryCostSource: "seller_entered" } },
    { deliveryCost: 2.5, etsyShipping: null }, { deliveryCost: 2.5 }
  ]), 2);
});
check("order card: 'Estimated profit' when the Etsy shipping cost is not known, note in both branches (CT and not)", () => {
  assert.ok(card.includes("const etsyShippingUnknown = isEtsyOrder ? etsyShippingCostUnknown(order, etsySource) : null;"));
  assert.ok(card.includes(') : (orderFinance.directCost === 0 && orderFinance.otherExpenses === 0) || etsyShippingUnknown ? ('));
  assert.ok(card.includes('tone={(orderFinance.directCost === 0 && orderFinance.otherExpenses === 0) || etsyShippingUnknown ? undefined : "positive"}'));
  assert.equal((card.match(/data-testid="finance-etsy-shipping-unknown"/g) || []).length, 2);
});
check("Dashboard: footnote under the profit tile and the breakdown, tile not green", () => {
  assert.ok(dash.includes("etsyShippingUnknownCount(filteredCountingOrders)"));
  assert.ok(dash.includes('rangeEtsyShippingUnknown > 0 ? ETSY_SHIPPING_UNKNOWN_FOOTNOTE : ""'));
  assert.ok(dash.includes('data-testid="dashboard-etsy-shipping-unknown"'));
  assert.ok(dash.includes('tone={rangeCostsMissing > 0 || rangeEtsyShippingUnknown > 0 ? "blue" : "green"}'));
  assert.ok(store.includes("etsyShipping: data.etsySource && typeof data.etsySource === \"object\""));
});
check("the four sentences are translated in all 11 other languages; {amount} survives", () => {
  for (const lang of SUPPORTED_STUDIO_LANGUAGES) {
    if (lang === "English") continue;
    for (const key of [ETSY_SHIPPING_UNKNOWN_PAID, ETSY_SHIPPING_UNKNOWN_FREE, ETSY_SHIPPING_ENTER_HINT, ETSY_SHIPPING_UNKNOWN_FOOTNOTE]) {
      assert.notEqual(studioT(key, lang), key, `${lang}: ${key}`);
    }
    assert.ok(studioT(ETSY_SHIPPING_UNKNOWN_PAID, lang).includes("{amount}"), `${lang}: {amount}`);
  }
  assert.equal(studioT(ETSY_SHIPPING_UNKNOWN_PAID, "Türkçe").replace("{amount}", "£3.95"), "Kargo maliyeti bilinmiyor — alıcı £3.95 ödedi");
});
const ev = process.env.ETSY_SHIP2_EVIDENCE;
if (ev && existsSync(ev)) {
  const e = JSON.parse(readFileSync(ev, "utf8"));
  const label = (doc: { deliveryCost: number; shippingCharged: number; deliveryCostSource: string | null }) => {
    const s = etsyShippingCostUnknown({ deliveryCost: doc.deliveryCost }, { shipping: doc.shippingCharged, deliveryCostSource: doc.deliveryCostSource ?? undefined });
    return s ? etsyShippingUnknownNote(s, id, gbp) : "Final Profit";
  };
  const want: Record<string, [string, string]> = {
    a: ["Shipping cost not known — buyer paid £3.95", "Shipping cost not known — buyer paid £3.95"],
    b: ["Shipping cost not known — buyer paid £3.95", "Final Profit"],
    c: ["Free shipping — postage cost not known, not counted", "Final Profit"],
    d: ["Shipping cost not known — buyer paid £3.95", "Shipping cost not known — buyer paid £4.50"]
  };
  for (const k of Object.keys(want)) {
    check(`server evidence ${k}: imported → '${want[k][0]}', after seller entry + Etsy resync → '${want[k][1]}'`, () => {
      assert.equal(label(e.orders[k].imported), want[k][0]);
      assert.equal(label(e.orders[k].afterResync), want[k][1]);
    });
  }
}
console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
