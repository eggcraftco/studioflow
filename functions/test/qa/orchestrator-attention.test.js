// "What should I look at today?" — the detectors, the grouping, and the two
// rules that decide whether an alert can be trusted twice (§11, §12, §40, §51).
//
// The failures this guards against are the ones that make an assistant's alerts
// worse than useless: three items for one late order, a new id for the same
// group every morning (so nothing can ever be dismissed), and an item stamped
// "now" that cannot say how long it has been true.
//
// Run: node test/qa/orchestrator-attention.test.js
const assert = require("assert");
const attention = require("../../orchestrator/attention");
const insights = require("../../bank/insights");
const fixtures = require("../fixtures/orchestrator");

let failures = 0;
const check = (name, run) => {
  try { run(); console.log("PASS ", name); }
  catch (error) { failures++; console.error("FAIL ", name, "\n      ", error.message); }
};

const ctx = fixtures.ownerContext();
const DAY = fixtures.DAY;
const run = (snapshot, args = {}, context = ctx) => attention.businessAttentionSummary(snapshot, args, context, { nowMs: snapshot.nowMs });
const itemFor = (result, orderNumber) => result.data.items.find((item) => item.title.includes(orderNumber));

check("one late order is ONE item carrying every reason, at the highest severity", () => {
  const snapshot = fixtures.attentionSnapshot();
  const result = run(snapshot);
  const late = result.data.items.filter((item) => item.title.includes("1001"));
  assert.strictEqual(late.length, 1, "an order that is overdue, unpaid and ready to ship is one problem, not three");
  assert.deepStrictEqual(
    late[0].reasons.sort(),
    ["order_overdue", "payment_outstanding", "shipping_waiting"],
    "every reason has to survive the merge"
  );
  assert.strictEqual(late[0].severity, "critical", "nine days overdue escalates");
});

check("an order with no due date appears in neither overdue nor due-soon", () => {
  const snapshot = fixtures.attentionSnapshot();
  const result = run(snapshot);
  assert.strictEqual(itemFor(result, "1003"), undefined,
    "deliveryTime 0 means the workspace never set a date; it does not mean the order was due on the day it was created");
});

check("an estimate waiting five days or more escalates", () => {
  const snapshot = fixtures.attentionSnapshot();
  const result = run(snapshot);
  const waiting = itemFor(result, "1004");
  assert.ok(waiting, "an estimate sent and unanswered is something to look at");
  assert.deepStrictEqual(waiting.reasons, ["approval_waiting"]);
  assert.strictEqual(waiting.severity, "high", "six days waiting escalates past medium");
});

check("a shop that says fulfilled while NivaDesk has not dispatched is raised", () => {
  const snapshot = fixtures.attentionSnapshot();
  const mismatch = itemFor(run(snapshot), "1005");
  assert.ok(mismatch);
  assert.deepStrictEqual(mismatch.reasons, ["platform_fulfilment_mismatch"]);
  assert.strictEqual(mismatch.severity, "high");
});

check("createdAt is the time of the fact, never the time of the question", () => {
  const snapshot = fixtures.attentionSnapshot();
  const result = run(snapshot);
  const late = itemFor(result, "1001");
  // A merged item takes the OLDEST of the facts behind it — here the order's
  // own creation, because it has been sitting ready to ship since then.
  assert.strictEqual(late.createdAt, new Date(snapshot.nowMs - 30 * DAY).toISOString().slice(0, 10) + "T00:00:00.000Z",
    "an item stamped with the request time cannot answer \"how long has this been true\"");
  assert.notStrictEqual(late.createdAt, new Date(snapshot.nowMs).toISOString());

  // The single-reason items prove the rule per detector: the due date for a
  // delivery, the estimate's send date for an approval.
  assert.strictEqual(itemFor(result, "1002").createdAt, new Date(snapshot.nowMs + 2 * DAY).toISOString().slice(0, 10) + "T00:00:00.000Z");
  assert.strictEqual(itemFor(result, "1004").createdAt, new Date(snapshot.nowMs - 6 * DAY).toISOString());
});

check("row-level findings are grouped, with a count and per-currency amounts", () => {
  const snapshot = fixtures.attentionSnapshot();
  const receipts = run(snapshot).data.items.find((item) => item.type === "receipt_missing");
  assert.ok(receipts, "missing receipts must be reported");
  assert.strictEqual(receipts.facts.find((fact) => fact.key === "count").value, 3);
  const amounts = receipts.facts.filter((fact) => fact.key === "amount");
  assert.ok(amounts.length === 2, "two currencies, two amounts");
  assert.ok(amounts.every((fact) => Boolean(fact.currency)), "a money fact without its currency is not a figure");
  const total = amounts.reduce((acc, fact) => acc + fact.value, 0);
  assert.notStrictEqual(amounts[0].value, total, "the currencies must not have been summed into one number");
});

check("a group keeps its id when nothing changed, and moves only its hash when a member is added", () => {
  // Without this, WhatsApp alert de-duplication, "already notified?" and "do not
  // reopen a dismissed item" have nothing to key on: the same eight missing
  // receipts would be a brand-new alert every morning.
  const monday = fixtures.attentionSnapshot();
  const tuesday = fixtures.attentionSnapshot({ nowMs: fixtures.NOW + DAY });
  const first = run(monday).data.items.find((item) => item.type === "receipt_missing");
  const second = run(tuesday).data.items.find((item) => item.type === "receipt_missing");
  assert.strictEqual(first.attentionId, second.attentionId, "a day passing must not mint a new alert id");
  assert.strictEqual(first.contentHash, second.contentHash);

  const grown = fixtures.attentionSnapshot();
  grown.bankRows = [...grown.bankRows, { id: "b9", amount: -20, currency: "GBP", bookingDate: "2026-09-10", counterparty: "New Supplier", description: "NEW", hasReceipt: false, category: "Materials" }];
  const third = run(grown).data.items.find((item) => item.type === "receipt_missing");
  assert.strictEqual(third.attentionId, first.attentionId, "the group is the same group");
  assert.notStrictEqual(third.contentHash, first.contentHash, "but its contents changed, and that has to be visible");
});

check("uncategorised transactions have no invented urgency", () => {
  const snapshot = fixtures.attentionSnapshot();
  const item = run(snapshot).data.items.find((entry) => entry.type === "transaction_uncategorised");
  assert.strictEqual(item.severity, "low",
    "nothing in the data distinguishes an urgent uncategorised row; a count threshold would be a fabricated signal");
});

check("sections a role cannot see are named and empty, not silently missing", () => {
  const snapshot = fixtures.attentionSnapshot();
  const noBank = fixtures.ownerContext({ isOwner: false, areas: { orders: true, dashboard: true, customers: true, bankFeed: false } });
  const result = run(snapshot, {}, noBank);
  const banking = result.data.sections.find((row) => row.id === "banking");
  assert.strictEqual(banking.status, "not_permitted");
  assert.strictEqual(banking.itemCount, 0);
  assert.ok(result.warnings.some((row) => row.code === "section_not_permitted" && row.section === "banking"));
  assert.ok(!result.data.items.some((item) => item.type === "receipt_missing"), "no banking item may leak through");
});

check("a signal with no data model behind it is declared unsupported, not invented", () => {
  // §40 asks for customer follow-up SLA breaches. There is no SLA field
  // anywhere, and a made-up threshold would look exactly like a real finding.
  const result = run(fixtures.attentionSnapshot());
  assert.ok(result.warnings.some((row) => row.code === "unsupported_metric" && /SLA/.test(row.message)));
});

check("the horizon parameter actually moves the window", () => {
  const snapshot = fixtures.attentionSnapshot();
  const narrow = run(snapshot, { horizonDays: 1 });
  assert.strictEqual(itemFor(narrow, "1002"), undefined, "a delivery two days out is outside a one-day horizon");
  const wide = run(snapshot, { horizonDays: 7 });
  assert.ok(itemFor(wide, "1002"), "and inside a seven-day one");
});

check("a workflow-only member sees only their own orders", () => {
  const snapshot = fixtures.attentionSnapshot();
  snapshot.orders = snapshot.orders.map((order) => (order.id === "o_late" ? { ...order, assignedToUid: "u_other" } : order));
  const workflow = fixtures.ownerContext({
    isOwner: false, workflowOnly: true, uid: "u_me", financialInfo: false,
    areas: { orders: true, dashboard: false, customers: false, bankFeed: false }
  });
  const result = run(snapshot, {}, workflow);
  assert.strictEqual(itemFor(result, "1001"), undefined, "somebody else's order is not this member's to see");
});

/* ------------------------------------------------------------- who, and when */

/** A monthly standing order to a private individual, whose price just moved. */
function personToPersonSnapshot() {
  const snapshot = fixtures.attentionSnapshot();
  const row = (id, amount, bookingDate) => ({
    id, amount: -amount, currency: "GBP", bookingDate,
    counterparty: "Margaret Ellison", description: "STANDING ORDER",
    hasReceipt: true, category: "Rent"
  });
  snapshot.bankRows = [
    row("t_1", 400, "2026-06-01"), row("t_2", 400, "2026-07-01"),
    row("t_3", 400, "2026-08-01"), row("t_4", 450, "2026-09-01")
  ];
  return snapshot;
}

check("the cross-domain read names no person, because it declares none and logs none", () => {
  // The registry says pii: [] and piiAccessLogged: false for this capability,
  // and it is not in MCP_ACTIONS_READING_PII — so an answer that carried a
  // counterparty's name would be a declaration that does not match the runtime,
  // which is the class of defect this branch exists to remove. assertRegistry
  // cannot catch it: pii:[] with piiAccessLogged:false is internally consistent.
  const snapshot = personToPersonSnapshot();
  const result = run(snapshot);
  const recurring = result.data.items.find((item) => item.type === "recurring_price_changed");
  assert.ok(recurring, "the finding itself must still be reported — silence is not privacy");
  assert.ok(
    !JSON.stringify(result).includes("Margaret Ellison"),
    "a counterparty's name reached the capability that files no access-log row"
  );
  // Told WHICH, so the caller can ask WHO through the capability that records it.
  assert.deepStrictEqual(recurring.entityRefs.map((ref) => ref.id), ["t_4"]);
  assert.strictEqual(recurring.entityRefs[0].type, "bankTransaction");
});

check("the banking read does name them, and is the one that declares and records it", () => {
  const snapshot = personToPersonSnapshot();
  const result = attention.bankingAttentionSummary(snapshot, {}, ctx, { nowMs: snapshot.nowMs });
  const recurring = result.data.items.find((item) => item.type === "recurring_price_changed");
  assert.ok(recurring);
  assert.strictEqual(recurring.entityRefs[0].label, "Margaret Ellison");

  const registry = require("../../orchestrator/registry");
  assert.deepStrictEqual(registry.entryFor("get_banking_attention_summary").pii, ["name"]);
  assert.strictEqual(registry.entryFor("get_banking_attention_summary").piiAccessLogged, true);
  assert.deepStrictEqual(registry.entryFor("get_business_attention_summary").pii, []);
  assert.strictEqual(registry.entryFor("get_business_attention_summary").piiAccessLogged, false);
});

/* --------------------------------------------------------------- banking */

check("the banking summary answers §12's list and reports the connection's own state", () => {
  const snapshot = fixtures.attentionSnapshot();
  const result = attention.bankingAttentionSummary(snapshot, {}, ctx, { nowMs: snapshot.nowMs });
  const types = result.data.items.map((item) => item.type);
  assert.ok(types.includes("receipt_missing"));
  assert.ok(types.includes("transaction_uncategorised"));
  assert.strictEqual(result.data.connection.syncState, "ok");
  assert.ok(result.data.connection.lastSyncedAt, "a banking answer has to say how old the feed is");
});

check("a bank connection that needs re-consent is critical", () => {
  const snapshot = fixtures.attentionSnapshot();
  snapshot.bankConnection = { ...snapshot.bankConnection, syncState: "needs_reconsent" };
  const result = attention.bankingAttentionSummary(snapshot, {}, ctx, { nowMs: snapshot.nowMs });
  const item = result.data.items.find((entry) => entry.type === "bank_connection_attention");
  assert.ok(item);
  assert.strictEqual(item.severity, "critical");
  assert.strictEqual(result.state, "needs_attention");
});

/* ------------------------------------------------------ the banking rules */

check("duplicates are the same merchant, the same amount, within two days", () => {
  const rows = [
    { id: "a", amount: -50, currency: "GBP", bookingDate: "2026-09-01", counterparty: "Screwfix", description: "SCREWFIX" },
    { id: "b", amount: -50, currency: "GBP", bookingDate: "2026-09-02", counterparty: "Screwfix", description: "SCREWFIX" },
    { id: "c", amount: -50, currency: "GBP", bookingDate: "2026-09-20", counterparty: "Screwfix", description: "SCREWFIX" }
  ];
  const flagged = insights.detectPossibleDuplicates(rows);
  assert.deepStrictEqual([...flagged].sort(), ["a", "b"], "the pair nineteen days apart is not a duplicate");
});

check("an unusual charge is measured within one currency, never across two", () => {
  const base = (id, amount, currency, date) => ({ id, amount: -amount, currency, bookingDate: date, counterparty: "Supplier", description: "SUPPLIER" });
  const rows = [
    base("1", 100, "GBP", "2026-09-01"), base("2", 100, "GBP", "2026-09-02"),
    base("3", 100, "GBP", "2026-09-03"), base("4", 900, "GBP", "2026-09-04"),
    base("5", 100, "USD", "2026-09-05")
  ];
  const unusual = insights.detectUnusualCharges(rows);
  assert.deepStrictEqual(unusual.map((row) => row.id), ["4"]);
  assert.strictEqual(unusual[0].currency, "GBP", "a 3x test across currencies measures the exchange rate, not the charge");
});

check("a recurring payment reports a price change and whether it has stopped", () => {
  const rows = [
    { id: "1", amount: -20, currency: "GBP", bookingDate: "2026-05-01", counterparty: "Adobe", description: "ADOBE" },
    { id: "2", amount: -20, currency: "GBP", bookingDate: "2026-06-01", counterparty: "Adobe", description: "ADOBE" },
    { id: "3", amount: -20, currency: "GBP", bookingDate: "2026-07-01", counterparty: "Adobe", description: "ADOBE" },
    { id: "4", amount: -26, currency: "GBP", bookingDate: "2026-08-01", counterparty: "Adobe", description: "ADOBE" }
  ];
  const [recurring] = insights.detectRecurringSpends(rows, [], { now: Date.UTC(2026, 7, 20) });
  assert.strictEqual(recurring.cadence, "monthly");
  assert.deepStrictEqual(recurring.priceChange, { previous: 20, current: 26 });
  assert.strictEqual(recurring.active, true);
  const [stopped] = insights.detectRecurringSpends(rows, [], { now: Date.UTC(2026, 10, 20) });
  assert.strictEqual(stopped.active, false, "three months of silence on a monthly charge reads as cancelled");
});

check("a transfer between the owner's own accounts is a pair, not income", () => {
  const pairs = insights.detectPossibleTransfers([
    { id: "out", amount: -500, currency: "GBP", bookingDate: "2026-09-01", accountId: "acc_a" },
    { id: "in", amount: 500, currency: "GBP", bookingDate: "2026-09-02", accountId: "acc_b" }
  ]);
  assert.strictEqual(pairs.length, 1);
  assert.strictEqual(pairs[0].amount, 500);
  const sameAccount = insights.detectPossibleTransfers([
    { id: "out", amount: -500, currency: "GBP", bookingDate: "2026-09-01", accountId: "acc_a" },
    { id: "in", amount: 500, currency: "GBP", bookingDate: "2026-09-02", accountId: "acc_a" }
  ]);
  assert.strictEqual(sameAccount.length, 0, "one account cannot transfer to itself");
});

console.log(failures === 0 ? "\nAll attention checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
