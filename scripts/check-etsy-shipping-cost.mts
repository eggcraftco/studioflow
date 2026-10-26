/**
 * ETSY-SHIP-2 (25 Oct 2026) + owner decisions K1–K3 (26 Oct 2026). An Etsy order whose shipping cost is what the buyer
 * paid never reads as a final profit; entering the real postage removes only that reason (K1) — an estimated Etsy fee or
 * no costs keep "Estimated profit". Texts are the owner's ESC-03/04 (K2) + ESC-05 detail; the two note sentences join
 * with the language's own punctuation (K3). No figure changes (labels only).
 *
 * Run: npm run test:etsy-shipping-cost   (npx tsx scripts/check-etsy-shipping-cost.mts)
 * Optional: ETSY_SHIP2_EVIDENCE=<evidence-treeR.json> also runs the rule over the server acceptance's real documents.
 * Optional: ETSY_K123_SPEC=<spec-k123.json> checks every English + translated sentence against the shared spec byte for byte.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { studioT, SUPPORTED_STUDIO_LANGUAGES } from "../lib/studioflow/language";
import {
  etsyShippingCostUnknown, etsyShippingNoteText, etsyShippingUnknownCount, etsyOrderProfitIsEstimate, etsyNoteSentenceJoin,
  ETSY_SHIPPING_UNKNOWN_PAID, ETSY_SHIPPING_UNKNOWN_FREE, ETSY_SHIPPING_ENTER_HINT, ETSY_SHIPPING_UNKNOWN_FOOTNOTE, ETSY_SHIPPING_UNKNOWN_DETAIL
} from "../lib/studioflow/etsyShippingCost";
import { orderFinanceBlock } from "../lib/studioflow/finance";

let failed = 0; let passed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`ok   ${name}`); }
  catch (error) { failed += 1; console.log(`FAIL ${name}\n     ${(error as Error).message}`); }
}
const gbp = (v: number) => `£${v.toFixed(2)}`;
const card = readFileSync(new URL("../app/orders/OrderDetailContent.tsx", import.meta.url), "utf8");
const dash = readFileSync(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8");
const store = readFileSync(new URL("../lib/studioflow/firestore.ts", import.meta.url), "utf8");
const note = (s: { buyerPaid: number; free: boolean }, lang = "English") => etsyShippingNoteText(s, lang, (x) => studioT(x, lang), gbp);

check("a/d: buyer paid 3.95, order holds 3.95 → not known, note says what the buyer paid + how to improve the estimate", () => {
  const s = etsyShippingCostUnknown({ deliveryCost: 3.95 }, { shipping: 3.95, deliveryCostSource: "buyer_paid_assumed" });
  assert.deepEqual(s, { buyerPaid: 3.95, free: false });
  assert.equal(note(s!), "Shipping cost not known — buyer paid £3.95. Enter your actual postage cost in Shipping Cost to improve this profit estimate.");
});
check("c: free shipping (0/0) → not known, 'postage cost not counted'", () => {
  const s = etsyShippingCostUnknown({ deliveryCost: 0 }, { shipping: 0 });
  assert.deepEqual(s, { buyerPaid: 0, free: true });
  assert.equal(note(s!), "Free shipping — postage cost not known, not counted. Enter your actual postage cost in Shipping Cost to improve this profit estimate.");
});
check("K3: Japanese/Chinese join with 。, Hindi with ।, Arabic with ، and an isolated amount; others with '. '", () => {
  const s = { buyerPaid: 3.95, free: false };
  assert.equal(note(s, "日本語 (Japanese)"), "送料の実費は不明 — 購入者の支払額 £3.95。実際の郵送費を送料欄に入力すると、この利益の推定がより正確になります。");
  assert.ok(note(s, "中文 (Chinese)").includes("£3.95。在“运费”"));
  assert.ok(note(s, "हिन्दी (Hindi)").includes("£3.95 चुकाए। इस लाभ"));
  assert.equal(note(s, "العربية (Arabic)"), "تكلفة الشحن غير معروفة — دفع المشتري \u2066£3.95\u2069، أدخل تكلفة البريد الفعلية في تكلفة الشحن لتحسين تقدير الربح هذا.");
  assert.equal(note(s, "Türkçe"), "Kargo maliyeti bilinmiyor — alıcı £3.95 ödedi. Bu kâr tahminini iyileştirmek için gerçek posta maliyetinizi Kargo Maliyeti alanına girin.");
  for (const lang of ["日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)"]) assert.ok(!note(s, lang).includes(". "), `${lang}: no ASCII '. '`);
  assert.equal(etsyNoteSentenceJoin("Deutsch"), ". ");
});
check("K1: 'Final Profit' only when shipping, fee and costs are all known", () => {
  const ship = { buyerPaid: 3.95, free: false };
  const known = { directCost: 5, otherExpenses: 0, commissionEstimated: false, platformFeeKnown: true };
  assert.equal(etsyOrderProfitIsEstimate(known, ship), true, "postage is the buyer's figure");
  assert.equal(etsyOrderProfitIsEstimate({ ...known, commissionEstimated: true, platformFeeKnown: false }, null), true, "postage entered, Etsy fee estimated");
  assert.equal(etsyOrderProfitIsEstimate({ directCost: 5, otherExpenses: 0, platformFeeKnown: false }, null), true, "old stamp: platformFeeKnown false");
  assert.equal(etsyOrderProfitIsEstimate({ ...known, directCost: 0 }, null), true, "no costs entered");
  assert.equal(etsyOrderProfitIsEstimate(known, null), false, "everything known → Final Profit");
  assert.equal(etsyOrderProfitIsEstimate({ directCost: 0, otherExpenses: 2, platformFeeKnown: true }, null), false, "other expenses count as a cost");
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
check("order card: one estimate rule (orderProfitIsEstimate) for the label, the CT tone and the PDF; note in both branches", () => {
  assert.ok(card.includes("const etsyShippingUnknown = isEtsyOrder ? etsyShippingCostUnknown(order, etsySource) : null;"));
  // K5 (26 Oct 2026) extends the same one rule with the WooCommerce / Shopify / inbound shipping estimate.
  assert.ok(card.includes("const orderProfitIsEstimate = orderCostsMissing || (isEtsyOrder && etsyOrderProfitIsEstimate(orderFinance, etsyShippingUnknown));")
    || card.includes("const orderProfitIsEstimate = orderCostsMissing || (isEtsyOrder && etsyOrderProfitIsEstimate(orderFinance, etsyShippingUnknown)) || channelShippingEstimate;"));
  assert.ok(card.includes(") : orderProfitIsEstimate ? ("));
  assert.ok(card.includes('tone={orderProfitIsEstimate ? undefined : "positive"}'));
  assert.ok(card.includes("profitIsEstimate: orderProfitIsEstimate"));
  assert.ok(card.includes("|| options.profitIsEstimate) {"));
  assert.equal((card.match(/etsyShippingNoteText\(etsyShippingUnknown, detailLanguage, t,/g) || []).length, 2);
  assert.equal((card.match(/data-testid="finance-etsy-shipping-unknown"/g) || []).length, 2);
  assert.ok(!card.includes("}. {t(ETSY_SHIPPING_ENTER_HINT)}"), "no ASCII '. ' join left on the card");
});
check("Dashboard: ONE short line on the profit card, every reason + the Etsy detail in the breakdown, tile not green", () => {
  assert.ok(dash.includes("etsyShippingUnknownCount(filteredCountingOrders)"));
  assert.ok(dash.includes('rangeEtsyShippingUnknown > 0 ? ETSY_SHIPPING_UNKNOWN_FOOTNOTE : ""'));
  assert.ok(dash.includes('const profitCardFootnote = [...profitFootnoteKeys].reverse()[0] ?? "";'));
  assert.equal((dash.match(/sub=\{profitCardFootnote \? t\(profitCardFootnote\) : undefined\}/g) || []).length, 2);
  assert.ok(!dash.includes('profitFootnoteKeys.map(key => t(key)).join(" · ")'), "the card no longer joins every footnote");
  assert.ok(dash.includes('data-testid="dashboard-etsy-shipping-unknown"'));
  assert.ok(dash.includes('data-testid="dashboard-etsy-shipping-detail"'));
  assert.ok(dash.includes('tone={rangeCostsMissing > 0 || rangeEtsyShippingUnknown > 0 ? "blue" : "green"}'));
  assert.ok(store.includes("etsyShipping: data.etsySource && typeof data.etsySource === \"object\""));
});
check("the five sentences are translated in all 11 other languages; {amount} survives", () => {
  for (const lang of SUPPORTED_STUDIO_LANGUAGES) {
    if (lang === "English") continue;
    for (const key of [ETSY_SHIPPING_UNKNOWN_PAID, ETSY_SHIPPING_UNKNOWN_FREE, ETSY_SHIPPING_ENTER_HINT, ETSY_SHIPPING_UNKNOWN_FOOTNOTE, ETSY_SHIPPING_UNKNOWN_DETAIL]) {
      assert.notEqual(studioT(key, lang), key, `${lang}: ${key}`);
    }
    assert.ok(studioT(ETSY_SHIPPING_UNKNOWN_PAID, lang).includes("{amount}"), `${lang}: {amount}`);
  }
  assert.equal(ETSY_SHIPPING_ENTER_HINT, "Enter your actual postage cost in Shipping Cost to improve this profit estimate.");
  assert.equal(ETSY_SHIPPING_UNKNOWN_FOOTNOTE, "Profit is estimated for Etsy orders with unconfirmed postage costs.");
});
const spec = process.env.ETSY_K123_SPEC;
if (spec && existsSync(spec)) {
  const sj = JSON.parse(readFileSync(spec, "utf8"));
  const byConst: Record<string, string> = { "ESC-03": ETSY_SHIPPING_ENTER_HINT, "ESC-04": ETSY_SHIPPING_UNKNOWN_FOOTNOTE, "ESC-05": ETSY_SHIPPING_UNKNOWN_DETAIL };
  check("spec-k123.json: English + 11 translations of ESC-03/04/05 identical byte for byte", () => {
    for (const k of Object.keys(byConst)) {
      assert.equal(byConst[k], sj.strings[k].en, `${k} en`);
      for (const [lang, text] of Object.entries(sj.strings[k].tr as Record<string, string>)) assert.equal(studioT(byConst[k], lang), text, `${k} ${lang}`);
    }
  });
}
const ev = process.env.ETSY_SHIP2_EVIDENCE;
if (ev && existsSync(ev)) {
  const e = JSON.parse(readFileSync(ev, "utf8"));
  // Server evidence: costs entered (5.00), Etsy fee = the workspace 3% estimate (fee switch off).
  const label = (doc: { deliveryCost: number; shippingCharged: number; deliveryCostSource: string | null; finance: { directCost: number } }) => {
    const s = etsyShippingCostUnknown({ deliveryCost: doc.deliveryCost }, { shipping: doc.shippingCharged, deliveryCostSource: doc.deliveryCostSource ?? undefined });
    const estimate = etsyOrderProfitIsEstimate({ directCost: doc.finance.directCost, otherExpenses: 0, platformFeeKnown: false }, s);
    return `${estimate ? "Estimated profit" : "Final Profit"}${s ? " + shipping note" : ""}`;
  };
  const want: Record<string, [string, string]> = {
    a: ["Estimated profit + shipping note", "Estimated profit + shipping note"],
    b: ["Estimated profit + shipping note", "Estimated profit"],
    c: ["Estimated profit + shipping note", "Estimated profit"],
    d: ["Estimated profit + shipping note", "Estimated profit + shipping note"]
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
