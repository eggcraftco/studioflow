// PR-P2 precondition — provider-verified payment evidence that a client cannot
// rewrite, and the rule that keeps one economic transaction counted once.
//
// The problem this exists for, proven in docs/storage-s0-audit and
// docs/stripe-p0-audit: `siparisler/{orderId}.payments[]` is an ARRAY ON THE
// ORDER DOCUMENT. firestore.rules never names `payments`, the order's update
// rule admits any member with write access, and the rules file itself records
// that the Apple apps replace the whole document on save with no merge. So the
// array is a display surface, not a record, and a Stripe payment written only
// there is a claim.
//
// The split this module defines:
//
//   companies/{cid}/paymentLedger/{provider}:{externalPaymentId}
//       server-only, denied to clients in both directions, one IMMUTABLE row
//       per external payment identity. This is the evidence.
//
//   siparisler/{orderId}.payments[]
//       unchanged in shape, still what every client renders. Provider rows are
//       MIRRORS carrying `externalPaymentId` and `source`; rows without an
//       externalPaymentId are manual and belong to whoever typed them.
//
//   order.paidAmount / refundedAmount / remainingAmount
//       the only money finance v4 reads (functions/finance/engine.js reads
//       these, the custom receivable/expense fields and the invoice lines — it
//       never reads payments[]). So the single-count rule is simple and does
//       not need the engine to change: each ledger row moves these fields
//       exactly once, keyed by its identity, and the engine keeps counting the
//       fields.
//
// Everything here is pure. The transaction that writes it lives in the server
// module; this file decides WHAT should be true, so both the writer and the
// reconciler derive it from one place and cannot drift.

const PROVIDER_SOURCES = Object.freeze(["stripe_connect"]);
const ENTRY_TYPES = Object.freeze(["payment", "refund"]);
const SCHEMA_VERSION = 1;

function text(value) {
  return String(value == null ? "" : value).trim();
}

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

/**
 * The ledger document id, and therefore the idempotency key.
 *
 * Deterministic on purpose: a webhook delivered ten times computes the same id
 * ten times, and `create()` on an id that exists is the whole of the
 * exactly-once guarantee. It is NOT the Stripe event id — one payment arrives
 * as two events (checkout.session.completed and payment_intent.succeeded), and
 * keying on the event would write that payment twice. The identity is the
 * PaymentIntent or the refund, which is what externalPaymentId carries
 * (see payments/eventBoundary.js externalPaymentId()).
 */
function ledgerEntryId(provider, externalPaymentId) {
  const p = text(provider) || "stripe";
  const e = text(externalPaymentId).replace(/[^A-Za-z0-9_:.-]/g, "");
  return e ? `${p}:${e}` : "";
}

/**
 * Build an immutable ledger row. Returns null when the row would not identify
 * an economic event — a row we cannot key is a row we cannot apply once.
 */
function entryFrom(input) {
  const source = text(input && input.source) || "stripe_connect";
  const externalPaymentId = text(input && input.externalPaymentId);
  const type = text(input && input.type);
  const amountMinor = Number(input && input.amountMinor);
  if (!PROVIDER_SOURCES.includes(source)) return null;
  if (!externalPaymentId) return null;
  if (!ENTRY_TYPES.includes(type)) return null;
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return null;
  const currency = text(input && input.currency).toUpperCase();
  if (currency.length !== 3) return null;
  const orderId = text(input && input.orderId);
  if (!orderId) return null;

  return Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    source,
    provider: text(input.provider) || "stripe",
    externalPaymentId,
    paymentRequestId: text(input.paymentRequestId),
    connectedAccountId: text(input.connectedAccountId),
    orderId,
    type,
    amountMinor,
    currency,
    // The provider's own time for the money moving, not ours. Two events for
    // one payment carry the same one, so a redelivery cannot move the date.
    receivedAtMs: Number.isFinite(Number(input.receivedAtMs)) ? Number(input.receivedAtMs) : 0,
    recordedBy: "webhook"
  });
}

/** The display row a client renders, carrying the identity back to the ledger. */
function mirrorRowFor(entry, { id = "" } = {}) {
  if (!entry) return null;
  const major = entry.amountMinor / 100;
  return {
    // A deterministic id, so re-mirroring after a client wiped the array does
    // not append a second visible row for the same money.
    id: id || `pv_${ledgerEntryId(entry.provider, entry.externalPaymentId).replace(/[^A-Za-z0-9_-]/g, "_")}`,
    amount: entry.type === "refund" ? -money(major) : money(major),
    method: entry.type === "refund" ? "Refund" : "Card",
    note: "",
    createdByUid: "",
    createdByEmail: "",
    // The two fields that make this row provider-owned. A row without an
    // externalPaymentId is manual, whoever wrote it.
    source: entry.source,
    externalPaymentId: entry.externalPaymentId,
    ...(entry.type === "refund" ? { refund: true } : {})
  };
}

/** Provider rows in the order array, keyed by identity; manual rows separately. */
function splitOrderPayments(payments) {
  const rows = Array.isArray(payments) ? payments.filter((row) => row && typeof row === "object") : [];
  const provider = new Map();
  const manual = [];
  const duplicates = [];
  for (const row of rows) {
    const identity = text(row.externalPaymentId);
    if (!identity) { manual.push(row); continue; }
    if (provider.has(identity)) { duplicates.push(identity); continue; }
    provider.set(identity, row);
  }
  return { provider, manual, duplicateIdentities: duplicates };
}

/**
 * What the order's money fields SHOULD be, given the ledger and the manual rows.
 *
 * The single-count rule, in one expression: provider money is counted from the
 * LEDGER (once per identity, because the ledger is keyed by identity), manual
 * money from the array rows that carry no identity, and nothing is counted from
 * both. A mirror row in the array never adds to the total — it is a rendering
 * of a ledger row, and counting it as well is precisely the double-count this
 * module exists to prevent.
 */
function expectedTotals(order, entries) {
  const rows = Array.isArray(entries) ? entries.filter(Boolean) : [];
  const seen = new Set();
  let providerPaidMinor = 0;
  let providerRefundedMinor = 0;
  for (const entry of rows) {
    const key = ledgerEntryId(entry.provider, entry.externalPaymentId);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (entry.type === "payment") providerPaidMinor += Number(entry.amountMinor || 0);
    if (entry.type === "refund") providerRefundedMinor += Number(entry.amountMinor || 0);
  }

  const { manual } = splitOrderPayments(order && order.payments);
  let manualPaid = 0;
  let manualRefunded = 0;
  for (const row of manual) {
    const amount = money(row.amount);
    if (row.refund === true || amount < 0) manualRefunded += Math.abs(amount);
    else manualPaid += amount;
  }

  const providerPaid = providerPaidMinor / 100;
  const providerRefunded = providerRefundedMinor / 100;
  const paidAmount = money(Math.max(0, manualPaid + providerPaid - manualRefunded - providerRefunded));
  const refundedAmount = money(manualRefunded + providerRefunded);

  return {
    paidAmount,
    refundedAmount,
    // What was TAKEN, before anything was given back. `remainingAmount` moves
    // with this and not with `paidAmount`: a refund lowers what the customer
    // has paid, but it does not put the balance back on their bill — they are
    // not being asked for that money a second time. This is exactly what the
    // bank-feed refund path already does (functions/bankFeed.js lowers
    // paidAmount and raises refundedAmount, and leaves remainingAmount alone).
    grossPaid: money(manualPaid + providerPaid),
    providerPaid: money(providerPaid),
    providerRefunded: money(providerRefunded),
    manualPaid: money(manualPaid),
    manualRefunded: money(manualRefunded)
  };
}

/**
 * Compare the order as it stands against the evidence.
 *
 * This is what runs after a client has written the order document — including
 * an old Apple build that replaced it whole. The ledger cannot be touched by
 * that write, so everything below is recoverable from it.
 *
 * `suspectedDuplicates` is deliberately a REPORT and never an action. A manual
 * row and a provider row for the same amount on the same day may be one payment
 * entered twice, or a deposit and a balance that happen to match. Only a person
 * knows which, so this names them and changes nothing.
 */
function reconcile(order, entries, { duplicateWindowMs = 48 * 60 * 60 * 1000 } = {}) {
  const expected = expectedTotals(order, entries);
  const { provider: mirrored, manual, duplicateIdentities } = splitOrderPayments(order && order.payments);
  const rows = Array.isArray(entries) ? entries.filter(Boolean) : [];

  const missingMirrors = rows.filter((entry) => !mirrored.has(entry.externalPaymentId));
  const orphanMirrors = [...mirrored.keys()].filter(
    (identity) => !rows.some((entry) => entry.externalPaymentId === identity)
  );

  const currentPaid = money(order && order.paidAmount);
  const currentRefunded = money(order && order.refundedAmount);
  const paidDrift = money(expected.paidAmount - currentPaid);
  const refundedDrift = money(expected.refundedAmount - currentRefunded);

  // A manual row that looks like a provider row. Named, never merged.
  const suspectedDuplicates = [];
  for (const entry of rows) {
    if (entry.type !== "payment") continue;
    const entryMajor = money(entry.amountMinor / 100);
    for (const row of manual) {
      if (money(row.amount) !== entryMajor) continue;
      const rowMs = timestampMs(row.date);
      if (!rowMs || !entry.receivedAtMs) continue;
      if (Math.abs(rowMs - entry.receivedAtMs) > duplicateWindowMs) continue;
      suspectedDuplicates.push({ externalPaymentId: entry.externalPaymentId, manualPaymentId: text(row.id), amount: entryMajor });
    }
  }

  return {
    expected,
    currentPaid,
    currentRefunded,
    paidDrift,
    refundedDrift,
    // The client wiped or never had the mirror rows. Re-adding them is safe:
    // mirror ids are deterministic, so it cannot append a second copy.
    missingMirrorIds: missingMirrors.map((entry) => entry.externalPaymentId),
    // A mirror row whose ledger entry does not exist. The array is the only
    // place it lives, so it is a client-authored claim wearing a provider's
    // clothes, and it must not be trusted as provider money.
    orphanMirrorIds: orphanMirrors,
    duplicateMirrorIds: duplicateIdentities,
    suspectedDuplicates,
    // True when the order document tells the truth about provider money.
    consistent: paidDrift === 0 && refundedDrift === 0 && missingMirrors.length === 0
      && orphanMirrors.length === 0 && duplicateIdentities.length === 0
  };
}

function timestampMs(value) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value.toMillis === "function") return Number(value.toMillis()) || 0;
  if (typeof value.seconds === "number") return value.seconds * 1000;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * The order patch that makes the document agree with the evidence.
 *
 * Returns null when nothing needs writing, so a reconciler that runs on every
 * order does not touch documents that are already right.
 *
 * `remainingAmount` moves with `paidAmount` and never below zero, which is what
 * the existing manual path does (functions/index.js recordPayment). The order's
 * VALUE is not touched: revenue is the engine's business, and it reads
 * paidAmount + remainingAmount + receivables + refunded, so restoring those
 * three restores the sale without a second definition of what a sale is worth.
 */
function repairPatch(order, entries) {
  const state = reconcile(order, entries);
  if (state.consistent) return null;

  const patch = {};
  if (state.paidDrift !== 0) {
    patch.paidAmount = state.expected.paidAmount;
    // The balance moves by the GROSS drift, never by the net one. Using
    // paidDrift here put a refund back on the customer's bill and then the
    // engine counted it as revenue still owed: a £1,000 sale refunded £200 came
    // out as a £1,200 sale. The test caught it; the arithmetic is the same one
    // the engine's own comment warns about, seen from the other side.
    const currentGross = money(money(order && order.paidAmount) + money(order && order.refundedAmount));
    const grossDrift = money(state.expected.grossPaid - currentGross);
    if (grossDrift !== 0) {
      patch.remainingAmount = money(Math.max(0, money(order && order.remainingAmount) - grossDrift));
    }
  }
  if (state.refundedDrift !== 0) patch.refundedAmount = state.expected.refundedAmount;

  if (state.missingMirrorIds.length || state.duplicateMirrorIds.length) {
    const { manual } = splitOrderPayments(order && order.payments);
    const rows = Array.isArray(entries) ? entries.filter(Boolean) : [];
    const byIdentity = new Map();
    for (const entry of rows) if (!byIdentity.has(entry.externalPaymentId)) byIdentity.set(entry.externalPaymentId, entry);
    // Manual rows first, in the order the workspace wrote them, then exactly
    // one mirror per ledger entry. Rebuilt rather than patched, because a
    // duplicated mirror cannot be fixed by appending.
    patch.payments = manual.concat([...byIdentity.values()].map((entry) => mirrorRowFor(entry)));
  }
  return Object.keys(patch).length ? patch : null;
}

module.exports = {
  PROVIDER_SOURCES,
  ENTRY_TYPES,
  SCHEMA_VERSION,
  ledgerEntryId,
  entryFrom,
  mirrorRowFor,
  splitOrderPayments,
  expectedTotals,
  reconcile,
  repairPatch
};
