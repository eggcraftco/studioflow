// A refunded sale must stop counting as profit.
//
// Every store channel carried the refund and every one of them dropped it. A
// £120 Square sale refunded in full stored orderValue 120, paidAmount 120,
// remainingAmount 0 and line items summing to 120; the refund existed only as
// a display string. The finance engine subtracts `refundedAmount` from net
// profit — a field no store connector wrote — so the order kept its whole
// revenue AND its whole profit, on all four channels at once.
//
// The bank side has always done this arithmetic correctly, so the model was
// never the problem. These check that the store adapters now use it, and that
// the number survives the resync that used to strip it.
const assert = require("assert");
const path = require("path");
const fs = require("fs");

const { shopOwnedFields } = require("../../commerce/envelopeToOrder");
const { INTEGRATION_SHOP_OWNED_FIELDS } = require("../../integrationOrderFields");
const financeEngine = require("../../finance/engine");

let failures = 0;
const checks = [];
function check(name, run) { checks.push({ name, run }); }

/** The smallest envelope shopOwnedFields will accept. */
function envelope({ total, paymentStatus, refunds = [] }) {
  return {
    identity: { provider: "square", external_id: "sq-1" },
    source: { provider_metadata: {}, provider_display_name: "Square" },
    order: { grand_total: String(total), payment_status: paymentStatus, placed_at: "2026-09-01T10:00:00.000Z", currency: "GBP" },
    customer: { name: "Jane", email: "jane@example.com", phone: "", billing_address: {}, shipping_address: {} },
    line_items: [{ name: "Ring", sku: "R1", quantity: 1, unit_price: String(total), total: String(total) }],
    refunds
  };
}

check("a fully refunded sale records the refund and shows nothing as paid", () => {
  const fields = shopOwnedFields(
    envelope({ total: 120, paymentStatus: "refunded", refunds: [{ amount: "120.00" }] }),
    { companyId: "acme" }
  );
  assert.strictEqual(fields.refundedAmount, 120);
  assert.strictEqual(fields.paidAmount, 0);
  assert.strictEqual(fields.orderValue, 120);
});

check("and does not put the refund back on the customer as a balance due", () => {
  // Measuring "remaining" against what is left after the refund would say the
  // customer still owes £120 on an order that is settled.
  const fields = shopOwnedFields(
    envelope({ total: 120, paymentStatus: "refunded", refunds: [{ amount: "120.00" }] }),
    { companyId: "acme" }
  );
  assert.strictEqual(fields.remainingAmount, 0);
});

check("a part refund takes only its own share", () => {
  const fields = shopOwnedFields(
    envelope({ total: 120, paymentStatus: "partially_refunded", refunds: [{ amount: "30.00" }] }),
    { companyId: "acme" }
  );
  assert.strictEqual(fields.refundedAmount, 30);
  assert.strictEqual(fields.paidAmount, 90);
  assert.strictEqual(fields.remainingAmount, 0);
});

check("several refunds on one order add up", () => {
  const fields = shopOwnedFields(
    envelope({ total: 120, paymentStatus: "partially_refunded", refunds: [{ amount: "30.00" }, { amount: "15.50" }] }),
    { companyId: "acme" }
  );
  assert.strictEqual(fields.refundedAmount, 45.5);
  assert.strictEqual(fields.paidAmount, 74.5);
});

check("a refund written as a negative is still a refund", () => {
  const fields = shopOwnedFields(
    envelope({ total: 120, paymentStatus: "refunded", refunds: [{ amount: "-120.00" }] }),
    { companyId: "acme" }
  );
  assert.strictEqual(fields.refundedAmount, 120);
  assert.strictEqual(fields.paidAmount, 0);
});

check("an unrefunded sale is exactly what it was before", () => {
  const fields = shopOwnedFields(envelope({ total: 120, paymentStatus: "paid" }), { companyId: "acme" });
  assert.strictEqual(fields.refundedAmount, 0);
  assert.strictEqual(fields.paidAmount, 120);
  assert.strictEqual(fields.remainingAmount, 0);
  const unpaid = shopOwnedFields(envelope({ total: 120, paymentStatus: "unpaid" }), { companyId: "acme" });
  assert.strictEqual(unpaid.paidAmount, 0);
  assert.strictEqual(unpaid.remainingAmount, 120);
  assert.strictEqual(unpaid.refundedAmount, 0);
});

check("nonsense in the refund list cannot poison the total", () => {
  const fields = shopOwnedFields(
    envelope({ total: 120, paymentStatus: "refunded", refunds: [{ amount: "abc" }, {}, null, { amount: null }] }),
    { companyId: "acme" }
  );
  assert.strictEqual(fields.refundedAmount, 0);
  assert.strictEqual(fields.paidAmount, 120);
});

// ---- the number has to survive the shop sending the order again -----------
check("a refund is not stripped from a resync patch", () => {
  // Shop-owned fields are the only ones a redelivery may overwrite. Without
  // refundedAmount on that list the first delivery would carry the refund and
  // the second would silently take it away again — worse than never computing
  // it, because the figure would move on its own.
  assert.ok(INTEGRATION_SHOP_OWNED_FIELDS.has("refundedAmount"));
  assert.ok(INTEGRATION_SHOP_OWNED_FIELDS.has("paidAmount"), "the pair travels together");
});

// ---- what the engine then does with it ------------------------------------
check("the finance engine takes the refund off profit, and only off profit", () => {
  // The product decision is explicit: Net Profit = Revenue − VAT Due − Base
  // Cost − Fees − Shipping − Other Expenses − Refunds. Revenue is turnover and
  // stays gross. This asserts the decision, so a future change to it is a
  // deliberate one rather than a side effect.
  const settings = { feePercentage: 0, defaultTaxRate: 0, vatRegistered: false };
  // `lineTotal` is the key the engine reads — the connectors write it too.
  const line = [{ name: "Ring", quantity: 1, unitPrice: 120, lineTotal: 120 }];
  const sold = financeEngine.computeOrderFinance({ lineItems: line, paidAmount: 120 }, settings);
  const refunded = financeEngine.computeOrderFinance(
    { lineItems: line, paidAmount: 0, refundedAmount: 120 }, settings
  );
  assert.strictEqual(sold.netProfit, 120);
  assert.strictEqual(refunded.netProfit, 0, "a fully refunded sale must earn nothing");
  assert.strictEqual(refunded.revenue, 120, "revenue is turnover and stays gross");
  assert.strictEqual(refunded.refunded, 120);
});

// ---- the four legacy mappers that never reach the shared projection --------
const INDEX = fs.readFileSync(path.join(__dirname, "..", "..", "index.js"), "utf8");
const ETSY = fs.readFileSync(path.join(__dirname, "..", "..", "etsy.js"), "utf8");

function mapperBody(source, marker, length = 2600) {
  const at = source.indexOf(marker);
  assert.ok(at > 0, `${marker} is where it was`);
  return source.slice(at, at + length);
}

check("every live mapper writes the field, not just the shared one", () => {
  // Etsy and Shopify never reach shopOwnedFields — they have their own mappers,
  // which is exactly why the hole was in four places rather than one.
  const paths = [
    ["Etsy", mapperBody(ETSY, "orderValue: grand.value,", 700)],
    ["Shopify", mapperBody(INDEX, "customerName: shopifyCustomerName(order),", 500)],
    ["WooCommerce (legacy)", mapperBody(INDEX, "customerName: wooBillingFullName(order),", 500)],
  ];
  for (const [name, body] of paths) {
    assert.ok(/refundedAmount/.test(body), `${name} does not write refundedAmount`);
  }
});

check("the Shopify refund webhook stores its amount instead of only logging it", () => {
  const body = mapperBody(INDEX, "async function applyShopifyRefundEvent(", 2200);
  assert.ok(/refundedAmount: nextRefunded/.test(body), "the computed amount is written");
  assert.ok(/priorRefunded/.test(body), "a second part-refund adds to the first rather than replacing it");
  assert.ok(/historyLog/.test(body), "the history line stays");
});

(async () => {
  for (const { name, run } of checks) {
    try { await run(); console.log("PASS ", name); }
    catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).split("\n")[0].slice(0, 200)); }
  }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log("\n✅ STORE REFUNDS GEÇTİ");
})();
