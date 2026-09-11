// A Sales line stays attached to an order line only while the evidence holds.
// The shipped iOS/Mac 1.3 rewrites whole order documents and Android sends lines
// without ids, so the server mints new ones: a link must never follow array
// order, a name or a SKU on its own, and only an exact, unchanged match may move
// stock.
const assert = require("assert");
const { linkState, allowsStockAction, fingerprintOf, SALES_LINK_STATES } = require("../../sales/links");

let failures = 0;
function check(name, fn) { try { fn(); console.log("PASS ", name); } catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).replace(/\s+/g, " ").slice(0, 300)); } }

const line = (id, name, quantity, unitPrice) => ({ id, name, quantity, unitPrice, lineTotal: quantity * unitPrice });
const dial = line("l-dial", "Enamel dial blank 38 mm", 1, 90);
const paint = line("l-paint", "Hand-painted dial design", 1, 450);
const link = { lineId: "l-dial", fingerprint: fingerprintOf(dial), productId: "p-dial", inventoryItemId: "inv-dial-001" };

check("the key matches and nothing moved: linked, and only this state may touch stock", () => {
  const out = linkState(link, { lineItems: [dial, paint] });
  assert.deepStrictEqual({ state: out.state, stock: out.allowsStockAction }, { state: SALES_LINK_STATES.LINKED, stock: true });
  for (const state of Object.values(SALES_LINK_STATES)) {
    assert.strictEqual(allowsStockAction(state), state === SALES_LINK_STATES.LINKED, `${state} must not act on stock`);
  }
});

check("reordering the lines changes nothing: position is never the key", () => {
  const out = linkState(link, { lineItems: [paint, dial] });
  assert.strictEqual(out.state, SALES_LINK_STATES.LINKED);
});

check("the line is still there but its numbers moved: changed, and stock is frozen", () => {
  const out = linkState(link, { lineItems: [{ ...dial, unitPrice: 120 }] });
  assert.deepStrictEqual({ state: out.state, stock: out.allowsStockAction, reason: out.reason }, { state: SALES_LINK_STATES.CHANGED, stock: false, reason: "line_changed" });
});

check("the id was reminted and one line still looks identical: a proposal, never a match", () => {
  const out = linkState(link, { lineItems: [{ ...dial, id: "new-uuid" }, paint] });
  assert.deepStrictEqual(
    { state: out.state, stock: out.allowsStockAction, candidate: out.candidateLineId },
    { state: SALES_LINK_STATES.SUGGESTED, stock: false, candidate: "new-uuid" }
  );
});

check("two identical lines after a remint: ambiguous, and nobody guesses", () => {
  const out = linkState(link, { lineItems: [{ ...dial, id: "a" }, { ...dial, id: "b" }] });
  assert.deepStrictEqual({ state: out.state, stock: out.allowsStockAction, candidate: out.candidateLineId }, { state: SALES_LINK_STATES.AMBIGUOUS, stock: false, candidate: "" });
});

check("the same product name at a different price is not the same line", () => {
  const out = linkState(link, { lineItems: [{ id: "x", name: "Enamel dial blank 38 mm", quantity: 1, unitPrice: 150 }] });
  assert.strictEqual(out.state, SALES_LINK_STATES.MISSING);
});

check("a SKU alone never matches: the fingerprint is name, quantity and price", () => {
  const skuOnly = { lineId: "l-dial", fingerprint: fingerprintOf(dial), sku: "DIAL-38" };
  const out = linkState(skuOnly, { lineItems: [{ id: "other", name: "Something else", quantity: 1, unitPrice: 90, sku: "DIAL-38" }] });
  assert.strictEqual(out.state, SALES_LINK_STATES.MISSING);
});

check("the line was deleted: missing; the order was trashed: orphaned", () => {
  assert.strictEqual(linkState(link, { lineItems: [paint] }).state, SALES_LINK_STATES.MISSING);
  assert.strictEqual(linkState(link, { lineItems: [dial], isDeleted: true }).state, SALES_LINK_STATES.ORPHANED);
  assert.strictEqual(linkState(link, null).state, SALES_LINK_STATES.ORPHANED);
});

check("a restored order comes back to linked only when the line is identical again", () => {
  const trashed = { lineItems: [dial], isDeleted: true };
  assert.strictEqual(linkState(link, trashed).state, SALES_LINK_STATES.ORPHANED);
  assert.strictEqual(linkState(link, { lineItems: [dial] }).state, SALES_LINK_STATES.LINKED);
  assert.strictEqual(linkState(link, { lineItems: [{ ...dial, quantity: 2 }] }).state, SALES_LINK_STATES.CHANGED);
});

console.log(failures === 0 ? "\n✅ SALES LINKS GEÇTİ" : `\n❌ ${failures} failing`);
process.exit(failures === 0 ? 0 : 1);
