"use strict";

// What a bank row counts as.
//
// A positive amount is not automatically income and a negative one is not
// automatically an expense. Moving money between the owner's own accounts,
// putting money in, a loan, a card processor's payout of sales already counted
// when they happened — all arrive as positive rows and none of them is revenue.
// A refund or a chargeback leaves as a negative row and neither is an expense;
// the money is a sale reversing, which the order it belongs to accounts for.
//
// Every human-facing surface already knew this: the web bank panel, the Mac and
// iPhone insights, the Android screen. The assistant did not, and answered "what
// came in this month" by adding up every positive number — so an owner who moved
// £5,000 between their own accounts was told they had earned it.
//
// Its own module so the server has one copy. The three clients still hold their
// own; keep them in step (studioflow-web/app/bank/page.tsx,
// EGGcraft/BankInsights.swift, studioflow-android/.../BankInsights.kt).

/** Incoming rows that are movements rather than earnings. */
const NON_REVENUE_INCOMING_KINDS = new Set(["transfer", "owner_contribution", "loan", "payout"]);

/** Money that came in and is genuinely revenue. */
function isRevenueRow(row = {}) {
  const amount = Number(row && row.amount);
  if (!Number.isFinite(amount) || amount <= 0) return false;
  return !NON_REVENUE_INCOMING_KINDS.has(String(row.incomingKind || "").trim());
}

/**
 * Money that went out and is genuinely an expense.
 *
 * Any outgoingKind at all disqualifies a row, rather than a list of them: the
 * field is only ever stamped on a refund or a chargeback, and the contract the
 * bank module writes down is that a row leaves the spending totals the moment
 * it carries one. A new kind should inherit that, not need adding here.
 */
function isSpendRow(row = {}) {
  const amount = Number(row && row.amount);
  if (!Number.isFinite(amount) || amount >= 0) return false;
  return !String(row.outgoingKind || "").trim();
}

/** Rows that are neither, kept apart so a total can explain itself. */
function isExcludedRow(row = {}) {
  const amount = Number(row && row.amount);
  if (!Number.isFinite(amount) || amount === 0) return false;
  return amount > 0 ? !isRevenueRow(row) : !isSpendRow(row);
}

function round2(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100) / 100;
}

/** Revenue, spending and the net of the two, over any list of rows. */
function summarizeRows(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  let revenue = 0;
  let spent = 0;
  let excluded = 0;
  for (const row of list) {
    if (isRevenueRow(row)) revenue += Number(row.amount);
    else if (isSpendRow(row)) spent += Math.abs(Number(row.amount));
    else if (isExcludedRow(row)) excluded += Math.abs(Number(row.amount));
  }
  return {
    incoming: round2(revenue),
    totalSpent: round2(spent),
    net: round2(revenue - spent),
    excluded: round2(excluded)
  };
}

module.exports = {
  NON_REVENUE_INCOMING_KINDS,
  isRevenueRow,
  isSpendRow,
  isExcludedRow,
  summarizeRows
};
