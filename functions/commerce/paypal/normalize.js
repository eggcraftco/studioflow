"use strict";
// A PayPal transaction becomes a bank-feed row of the canonical shape
// ({amount signed, currency, bookingDate, description, counterparty, …}) —
// or a payout record, or nothing. The event code says which.
//
// PayPal's T-codes, in the groups this feed cares about:
//   T00xx payments (sign says received or sent)     → sale / purchase row
//   T01xx non-payment fees                            → fee row (money out)
//   T04xx withdrawals to a bank, T17xx to non-bank    → PAYOUT record, no row (the bank feed has that money)
//   T05xx debit card, T10xx bill pay                  → purchase row
//   T08xx bonus, T09xx incentives, T14xx dividends    → income row
//   T11xx reversals/refunds (the money-moving ones)   → refund row
//   T12xx adjustments/chargebacks, T19xx corrections  → adjustment row
//   T02 conversion, T03 funding from bank, T06/T07 card funding, T13 auth, T15/T21/T22 holds,
//   T16/T18 buyer credit, T20 PayPal-to-PayPal transfer, T30/T50/T97-T99 → nothing (no money left the account)

const EVENT_GROUPS = Object.freeze({
  T00: "payment", T01: "fee", T02: "skip", T03: "skip", T04: "payout", T05: "purchase", T06: "skip", T07: "skip",
  T08: "income", T09: "income", T10: "purchase", T11: "refund", T12: "adjustment", T13: "skip", T14: "income",
  T15: "skip", T16: "skip", T17: "payout", T18: "skip", T19: "adjustment", T20: "skip", T21: "skip", T22: "skip",
  T30: "skip", T50: "skip", T97: "skip", T98: "skip", T99: "skip"
});
/** Reversal codes that move no money on their own (holds and their releases). */
const SILENT_REVERSALS = new Set(["T1105", "T1110", "T1111", "T1116", "T1120", "T1121"]);

const clean = (v, max = 300) => String(v ?? "").trim().slice(0, max);
const num = (money) => { const n = Number(money?.value); return Number.isFinite(n) ? n : null; };
const round2 = (n) => Math.round(n * 100) / 100;

function classifyPayPalTransaction(t) {
  const info = t?.transaction_info || {};
  const code = clean(info.transaction_event_code, 8).toUpperCase();
  const status = clean(info.transaction_status, 2).toUpperCase();
  if (!code) return { kind: "skip", reason: "no_event_code" };
  if (status === "D") return { kind: "skip", reason: "denied" };
  if (status === "V") return { kind: "skip", reason: "reversed" };
  const group = EVENT_GROUPS[code.slice(0, 3)] || "skip";
  if (group === "skip") return { kind: "skip", reason: `group_${code.slice(0, 3)}` };
  if (group === "refund" && SILENT_REVERSALS.has(code)) return { kind: "skip", reason: "hold" };
  const amount = num(info.transaction_amount);
  if (amount === null || amount === 0) return { kind: "skip", reason: "no_amount" };
  if (group === "payout") return { kind: "payout" };
  if (group === "payment") return { kind: amount > 0 ? "sale" : "purchase" };
  return { kind: group };
}

const LABELS = Object.freeze({ sale: "PayPal payment received", purchase: "PayPal payment sent", fee: "PayPal fee", refund: "PayPal refund", adjustment: "PayPal adjustment", income: "PayPal credit" });

function payerName(t) {
  const p = t?.payer_info || {}; const n = p.payer_name || {};
  return clean(n.alternate_full_name, 160) || clean(`${clean(n.given_name, 80)} ${clean(n.surname, 80)}`.trim(), 160) || clean(p.email_address, 160);
}

/**
 * The canonical row, or null when the event is not a row. `accountId` and
 * `connectionId` partition the feed exactly as a bank account does.
 */
function normalizePayPalTransaction(t, { accountId, connectionId }) {
  const cls = classifyPayPalTransaction(t);
  if (cls.kind === "skip" || cls.kind === "payout") return null;
  const info = t.transaction_info || {};
  const id = clean(info.transaction_id, 160);
  if (!id) return null;
  const amount = round2(num(info.transaction_amount));
  const fee = num(info.fee_amount);
  const currency = clean(info.transaction_amount?.currency_code, 8).toUpperCase() || null;
  const initiated = clean(info.transaction_initiation_date, 40);
  const bookedAtMs = Date.parse(initiated) || null;
  const bookingDate = initiated.slice(0, 10);
  const item = Array.isArray(t.cart_info?.item_details) ? clean(t.cart_info.item_details[0]?.item_name, 160) : "";
  const subject = clean(info.transaction_subject, 200) || clean(info.transaction_note, 200) || item;
  const who = payerName(t);
  const description = cls.kind === "fee" ? `${LABELS.fee}${subject ? ` · ${subject}` : ""}` : (subject || LABELS[cls.kind]);
  const counterparty = cls.kind === "fee" || cls.kind === "adjustment" || cls.kind === "income" ? (who || "PayPal") : (who || "PayPal");
  const row = {
    accountId, connectionId,
    status: clean(info.transaction_status, 2).toUpperCase() === "P" ? "pending" : "booked",
    amount, currency: currency || "GBP",
    bookingDate, bookedAtMs,
    description, counterparty,
    txType: `PAYPAL_${cls.kind.toUpperCase()}`,
    provider: "paypal",
    providerTransactionId: id,
    normalisedProviderId: id,
    providerReference: clean(info.invoice_id, 200) || clean(info.paypal_reference_id, 200) || "",
    paypalEventCode: clean(info.transaction_event_code, 8).toUpperCase(),
    // A refund or chargeback names the transaction it reverses (paypal_reference_id of type TXN): the bridge to the order it was paid into.
    paypalReferenceId: clean(info.paypal_reference_id_type, 8).toUpperCase() === "TXN" ? clean(info.paypal_reference_id, 160) : "",
    payerEmail: clean(t.payer_info?.email_address, 160) || "",
    feeAmount: fee === null ? null : round2(fee),
    netAmount: fee === null ? amount : round2(amount + fee)
  };
  if (!row.currency) row.currency = "GBP";
  return row;
}

/** A withdrawal to the bank: what the settlement matcher looks for on the statement. */
function payoutOfPayPalTransaction(t, { connectionId }) {
  const cls = classifyPayPalTransaction(t);
  if (cls.kind !== "payout") return null;
  const info = t.transaction_info || {};
  const id = clean(info.transaction_id, 160);
  const amount = num(info.transaction_amount);
  if (!id || amount === null) return null;
  const initiated = clean(info.transaction_initiation_date, 40);
  return {
    provider: "paypal", connectionId, externalId: id,
    amount: Math.abs(round2(amount)).toFixed(2), currency: clean(info.transaction_amount?.currency_code, 8).toUpperCase() || null,
    arrivalDate: initiated.slice(0, 10), status: "PAID",
    payoutType: clean(info.transaction_event_code, 8).toUpperCase(),
    totals: { gross: Math.abs(round2(amount)).toFixed(2), fee: fee0(info), net: Math.abs(round2(amount)).toFixed(2), refunds: "0.00" },
    externalCreatedAt: initiated || null, externalUpdatedAt: clean(info.transaction_updated_date, 40) || null
  };
}
function fee0(info) { const f = num(info.fee_amount); return f === null ? "0.00" : round2(f).toFixed(2); }

module.exports = { classifyPayPalTransaction, normalizePayPalTransaction, payoutOfPayPalTransaction, EVENT_GROUPS, SILENT_REVERSALS };
