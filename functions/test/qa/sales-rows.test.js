// What a Sales row may say, and what it must refuse to say: no guessed
// classification, no money from a stale stamp, no marketplace buyer, and no
// field the order screen would not show a member of this workspace.
const assert = require("assert");
const rows = require("../../sales/rows");
const { ENGINE_VERSION } = require("../../finance/engine");
const { PROVIDER_PII_POLICY } = require("../../privacy/outbound");

let failures = 0;
function check(name, fn) { try { fn(); console.log("PASS ", name); } catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).replace(/\s+/g, " ").slice(0, 300)); } }

const stamp = (extra = {}) => ({ engineVersion: ENGINE_VERSION, revenue: 1200, ...extra });
const order = (extra = {}) => ({
  id: "o1", companyId: "c1", customerName: "Alex Morgan", lineItems: [{ id: "l1", name: "Seamaster 300", quantity: 1, unitPrice: 1200, lineTotal: 1200 }],
  paidAmount: 1200, remainingAmount: 0, paymentDate: { toMillis: () => 1757600000000 }, finance: stamp(), ...extra
});
const row = (extra = {}, options = {}) => rows.salesRowFromOrder(order(extra), { financeVisible: true, currency: "£", engineVersion: ENGINE_VERSION, ...options });

check("the restricted provider list comes from the privacy policy, not from a copy", () => {
  const fromPolicy = Object.entries(PROVIDER_PII_POLICY).filter(([, policy]) => policy.restricted === true).map(([name]) => name).sort();
  assert.deepStrictEqual([...rows.SALES_RESTRICTED_PROVIDERS], fromPolicy);
  assert.ok(fromPolicy.includes("amazon") && fromPolicy.includes("ebay"), "amazon and eBay are restricted today");
});

check("a repair intake is bespoke work on the customer's own item, never stock", () => {
  const out = row({ orderType: "repair", repairIntake: { customerOwned: true } });
  assert.deepStrictEqual(
    { kind: out.kind, source: out.classificationSource, work: out.workRequired, own: out.customerOwnedItem },
    { kind: "bespoke_work", source: "repair_intake", work: true, own: true }
  );
});

check("without a product link nothing is guessed: the order waits for review", () => {
  const out = row();
  assert.strictEqual(out.kind, "needs_review");
  assert.strictEqual(out.classificationSource, "unclassified");
  assert.ok(out.attentionReasons.includes("classify"));
});

check("the channel comes from the stamps the existing paths write", () => {
  assert.strictEqual(row().channel, "manual");
  assert.strictEqual(row({ commerce: { provider: "woocommerce", externalId: "1042" } }).channel, "woocommerce");
  assert.strictEqual(row({ etsySource: { listingId: "9" } }).channel, "etsy");
  assert.strictEqual(row({ orderSource: "inbound" }).channel, "inbound");
});

check("a marketplace buyer never reaches the row", () => {
  const out = row({ commerce: { provider: "amazon", externalId: "026-123" }, customerName: "Real Buyer Name" });
  assert.strictEqual(out.customerLabel, "");
  assert.strictEqual(out.customerLabelWithheld, true);
  assert.ok(!JSON.stringify(out).includes("Real Buyer Name"));
});

check("money only from a current stamp, and only for a member who may see money", () => {
  assert.deepStrictEqual({ r: row().revenue, c: row().currency, s: row().financeState }, { r: 1200, c: "£", s: "current" });
  const stale = row({ finance: stamp({ engineVersion: ENGINE_VERSION - 1 }) });
  assert.deepStrictEqual({ r: stale.revenue, s: stale.financeState }, { r: null, s: "stale" });
  assert.ok(stale.attentionReasons.includes("finance_stale"));
  const missing = row({ finance: undefined });
  assert.deepStrictEqual({ r: missing.revenue, s: missing.financeState }, { r: null, s: "missing" });
  const hidden = row({}, { financeVisible: false });
  assert.deepStrictEqual({ r: hidden.revenue, c: hidden.currency }, { r: null, c: null });
});

check("payment and delivery are separate axes", () => {
  assert.strictEqual(row().paymentState, "paid");
  assert.strictEqual(row({ paidAmount: 300, remainingAmount: 900 }).paymentState, "partially_paid");
  assert.strictEqual(row({ paidAmount: 0, remainingAmount: 1200 }).paymentState, "unpaid");
  assert.strictEqual(row({ paidAmount: 0, remainingAmount: 0, refundedAmount: 1200 }).paymentState, "refunded");
  assert.strictEqual(row().deliveryState, "in_progress");
  assert.strictEqual(row({ isDispatched: true }).deliveryState, "dispatched");
  assert.strictEqual(row({ isDelivered: true }).deliveryState, "delivered");
});

check("the row carries no contact detail, no notes and no cost figure", () => {
  const out = row({
    customerEmail: "buyer@example.invalid", customerPhone: "+44 7000 000000", address: "1 Test Street",
    notes: "private note", customFields: { secretField: "x" }, payments: [{ amount: 1200 }],
    watchPurchasePrice: 800, additionalExpenses: 40
  });
  const serialized = JSON.stringify(out);
  for (const forbidden of ["buyer@example.invalid", "+44 7000", "1 Test Street", "private note", "secretField", "800", "payments"]) {
    assert.ok(!serialized.includes(forbidden), `row leaked ${forbidden}`);
  }
  assert.deepStrictEqual(Object.keys(out).sort(), [
    "attentionReasons", "cancelled", "channel", "classificationSource", "countsAsActiveOrder", "createdAtMs", "currency",
    "customerLabel", "customerLabelWithheld", "customerOwnedItem", "deliveryState", "externalOrderId", "financeState",
    "itemCount", "kind", "needsAttention", "orderDateMs", "orderId", "paymentState", "revenue", "summary", "workRequired"
  ]);
});

check("the demo-quota rule the plan asked for, and how today's counter differs", () => {
  assert.strictEqual(rows.salesCountsAsActiveOrder(order()), true);
  assert.strictEqual(rows.salesCountsAsActiveOrder(order({ isDelivered: true })), false);
  assert.strictEqual(rows.salesCountsAsActiveOrder(order({ isDeleted: true })), false);
  assert.strictEqual(rows.salesCountsAsActiveOrder(order({ status: "Cancelled" })), false);
  assert.strictEqual(rows.salesCountsAsActiveOrder(order({ salesCommercialState: "draft" })), false);
  // Today's countActiveOrders() counts everything that is neither deleted nor
  // delivered, so a cancelled order still holds a demo slot. Pinned here so the
  // difference is visible before anyone changes the limit engine.
  const todaysCounter = (o) => o.isDeleted !== true && o.isDelivered !== true;
  assert.strictEqual(todaysCounter(order({ status: "Cancelled" })), true);
  assert.notStrictEqual(rows.salesCountsAsActiveOrder(order({ status: "Cancelled" })), todaysCounter(order({ status: "Cancelled" })));
});

console.log(failures === 0 ? "\n✅ SALES ROWS GEÇTİ" : `\n❌ ${failures} failing`);
process.exit(failures === 0 ? 0 : 1);
