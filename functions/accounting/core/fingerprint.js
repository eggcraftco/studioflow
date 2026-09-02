"use strict";

// §12.3 — the posting fingerprint. The same economic event may arrive again
// through a webhook, a reconciliation pass or a manual import; the fingerprint
// is what makes a second posting impossible. Names, SKUs, DocNumbers and memos
// are never part of it.

const crypto = require("crypto");

function part(value) {
  return String(value ?? "").trim();
}

// One economic event = one key, built from stable identities only.
//   kind: sale | customer_payment | provider_fee | refund | dispute | payout |
//         supplier_bill | bank_transaction | inventory_journal
function economicEventKey({ kind, provider, connectionId, externalId, suffix = "" }) {
  const base = [part(kind), part(provider), part(connectionId), part(externalId)].join(":");
  return suffix ? `${base}#${part(suffix)}` : base;
}

// "2026-09" — accounting period of an ISO date, in the company's own calendar.
function accountingPeriodOf(dateIso) {
  const text = part(dateIso);
  const match = /^(\d{4})-(\d{2})/.exec(text);
  return match ? `${match[1]}-${match[2]}` : "";
}

function postingFingerprint({ workspaceId, sourceProvider, sourceConnectionId, economicEventKey: key, postingPolicy, accountingPeriod }) {
  const material = [
    part(workspaceId), part(sourceProvider), part(sourceConnectionId), part(key), part(postingPolicy), part(accountingPeriod)
  ].join("|");
  return crypto.createHash("sha256").update(material).digest("hex");
}

// §10.3 — one journal per period, currency, valuation method and journal type.
function journalFingerprint({ workspaceId, externalCompanyId, period, currency, valuationMethod, journalType }) {
  const material = [part(workspaceId), part(externalCompanyId), part(period), part(currency), part(valuationMethod), part(journalType)].join("|");
  return crypto.createHash("sha256").update(material).digest("hex");
}

module.exports = { economicEventKey, accountingPeriodOf, postingFingerprint, journalFingerprint };
