// The rules behind the eBay screens (1 Oct 2026, package E3), in a module that
// imports nothing so scripts/check-ebay-screens.mjs can execute them.
//
// Three screens read these: the Settings → Integrations → eBay card, the Orders
// list's source filter and the order page's eBay block. Every number here comes
// from a field the SERVER writes (the connection's public view, the commerce
// health record, the review queue, the parked queue, the order's `commerce`
// stamp); nothing is counted or guessed on the client. When the server has no
// field for something, the screen says so instead of inventing one.

// ---- what the server hands the card -------------------------------------
export type EbayConnectionFacts = {
  status: string;
  specStatus: string;
  lastErrorCode: string;
  lastErrorAtMs: number;
  importState: string;
  importCounters: { created: number; updated: number; held: number; skipped: number; failed: number };
  importCursor: { complete: boolean; failedCount: number } | null;
  connectedAtMs: number;
  lastSyncAtMs: number;
  lastSuccessAtMs: number;
  lastVerifiedAtMs: number;
  /** Written by the server on the row (`importFinishedAtMs`); the public view does not expose it yet (E2). */
  importFinishedAtMs?: number;
  quota: { today: number; share: number };
  recentEvents: { atMs: number; type: string }[];
  /** When the 18-month authorisation should be renewed by (publicView `reauthorizeByMs`). 0 = unknown. */
  reauthorizeByMs?: number;
};

/** The `orders` entity of commerceHealth/ebay__<connectionId>, as getCommerceHealth returns it. */
export type EbayHealthFacts = {
  lastSuccessAtMs?: number | null;
  lastAttemptAtMs?: number | null;
  pendingRetries?: number;
  deadLetters?: number;
} | null | undefined;

const n = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0);

// ---- the two times ----------------------------------------------------------
// "Last successful sync" on the card read `lastSuccessAtMs`, which only a
// completed SYNC pass sets; the Sync health card below it read the health
// record, which the connect flow itself stamps as a "success". On the real
// connection the two disagreed on one screen ("—" above, "19 minutes ago"
// below) and neither was the import that had actually brought the order in.
// The card now shows two separately named times, both from the connection row.

/** Events the connector logs when a pass that reads orders finished cleanly. */
const ORDER_SYNC_SUCCESS_EVENTS: ReadonlySet<string> = new Set(["sync_completed", "catch_up_completed", "nightly_completed", "import_finished"]);

/** When eBay's orders were last read successfully: a sync pass, a catch-up, the nightly check or the import. 0 = never. */
export function ebayLastOrderSyncAtMs(facts: EbayConnectionFacts): number {
  let latest = Math.max(n(facts.lastSuccessAtMs), n(facts.importFinishedAtMs));
  for (const event of facts.recentEvents || []) {
    if (ORDER_SYNC_SUCCESS_EVENTS.has(String(event?.type || ""))) latest = Math.max(latest, n(event?.atMs));
  }
  return latest;
}

/** When the connection itself was last proven to work: connect, "Check now", or a completed sync pass. 0 = never. */
export function ebayLastConnectionCheckAtMs(facts: EbayConnectionFacts): number {
  return Math.max(n(facts.lastVerifiedAtMs), n(facts.connectedAtMs));
}

// ---- the first import ------------------------------------------------------
// The STATE only. The row's `importCounters` are written by the import pass and
// never by the separate Retry (retryEbayImportFailures): on the real connection
// the order came in on a Retry and the counters still read 0 created, 1 failed.
// The card's "Imported" count comes from the orders themselves (see ebay.ts
// countEbayOrders) until the server keeps a running total (hand-back, E2).
export type EbayFirstImport = { state: "none" | "running" | "paused" | "done" };

/**
 * `importState` is "running" both while the callable executes and while a
 * paused, resumable import waits for the owner — the server does not tell them
 * apart, so the screen passes whether IT is importing right now.
 */
export function ebayFirstImport(facts: EbayConnectionFacts, importingNow = false): EbayFirstImport {
  const state = String(facts.importState || "none");
  if (state === "done") return { state: "done" };
  if (state === "running") return { state: importingNow ? "running" : "paused" };
  return { state: "none" };
}

// ---- the counts ------------------------------------------------------------
export type EbayCounts = {
  /** eBay orders in this workspace: a server-side count over the orders the connector wrote (`commerce.provider == "ebay"`). null = not readable. */
  imported: number | null;
  /** Events waiting for a retry (health record). null = not readable. */
  pending: number | null;
  /** Orders parked because the plan is full (the parked queue, this provider only). null = not readable. */
  parked: number | null;
  /** Orders in the review queue (this provider only). null = not readable. */
  needsReview: number | null;
  /** Orders still failing: the import cursor's failed ids plus the health record's dead letters. */
  failed: number | null;
  /** The two halves of `failed`, because each has its own remedy (Retry here, Retry on the event in Sync health). */
  importFailed: number;
  deadLetters: number;
};

/** `undefined` (not read yet) and `null` (could not be read) both come back as null: the tile shows a dash, never a 0. */
export function ebayCounts(input: {
  connection: EbayConnectionFacts;
  health: EbayHealthFacts;
  importedCount: number | null | undefined;
  reviewCount: number | null | undefined;
  heldCount: number | null | undefined;
}): EbayCounts {
  const c = input.connection;
  const known = (value: number | null | undefined) => (typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : null);
  const h = input.health === undefined || input.health === null ? null : input.health;
  const importFailed = n(c.importCursor?.failedCount);
  const deadLetters = n(h?.deadLetters);
  return {
    imported: known(input.importedCount),
    pending: h ? n(h.pendingRetries) : null,
    parked: known(input.heldCount),
    needsReview: known(input.reviewCount),
    failed: h || importFailed > 0 ? importFailed + deadLetters : null,
    importFailed,
    deadLetters
  };
}

// ---- what needs attention, and what to do about it ----------------------------
export type EbayAttentionKind = "environment" | "reconnect" | "quota" | "failed" | "events" | "transient" | "plan_full" | "review";
export type EbayAttentionAction = "disconnect" | "reconnect" | "wait" | "retry" | "health" | "parked" | "review";
/** `date` fills a "{date}" in `text`; `count` is shown before it. */
export type EbayAttention = { kind: EbayAttentionKind; text: string; action: EbayAttentionAction; count?: number; date?: number };

/** Codes that mean the stored authorisation is no good any more. */
const RECONNECT_CODES: ReadonlySet<string> = new Set(["credentials_rejected", "token_unreadable", "permission_missing", "refresh_token_expiring"]);
/** Codes NivaDesk's side has to fix, or eBay has to come back from: nothing for the seller to do. */
const TRANSIENT_CODES: ReadonlySet<string> = new Set(["app_credentials_invalid", "token_request_invalid", "provider_unavailable"]);

/**
 * One line per thing that needs a look, most serious first. Each carries the
 * sentence (English; the screen translates it — every one is also a sentence
 * of ebay.ts's ERROR_TEXT or has its own eleven translations) and the one
 * action that resolves it, so the card puts the right button next to it.
 */
export function ebayAttention(input: { connection: EbayConnectionFacts; counts: EbayCounts }): EbayAttention[] {
  const c = input.connection;
  const code = String(c.lastErrorCode || "");
  const counts = input.counts;
  const out: EbayAttention[] = [];
  if (code === "environment_mismatch") {
    out.push({ kind: "environment", text: "This eBay connection belongs to the sandbox. Disconnect it and connect your live account.", action: "disconnect" });
  }
  if (c.specStatus === "reauthorization_required" || c.status === "reconnect_required" || RECONNECT_CODES.has(code)) {
    const by = n(c.reauthorizeByMs);
    out.push(code === "permission_missing"
      ? { kind: "reconnect", text: "eBay refused a permission. Reconnect and approve every permission.", action: "reconnect" }
      : code === "refresh_token_expiring"
        ? (by > 0
          ? { kind: "reconnect", text: "Reconnect eBay before {date} to keep syncing.", action: "reconnect", date: by }
          : { kind: "reconnect", text: "Reconnect eBay to keep syncing.", action: "reconnect" })
        : { kind: "reconnect", text: "eBay no longer accepts this connection. Reconnect to continue syncing.", action: "reconnect" });
  }
  if (code === "rate_limited") {
    out.push({ kind: "quota", text: "eBay is rate-limiting this account. Sync resumes automatically.", action: "wait" });
  } else if (n(c.quota?.share) > 0 && n(c.quota?.today) >= n(c.quota?.share)) {
    out.push({ kind: "quota", text: "Today's call budget for this connection is used up. Sync resumes tomorrow.", action: "wait" });
  }
  if (counts.importFailed > 0) {
    out.push({ kind: "failed", text: "Some eBay orders could not be imported. Retry brings them in.", action: "retry", count: counts.importFailed });
  }
  if (counts.deadLetters > 0 || (code === "partial_pass" && counts.importFailed === 0)) {
    out.push({ kind: "events", text: "Some eBay orders could not be imported. See Sync health.", action: "health", ...(counts.deadLetters > 0 ? { count: counts.deadLetters } : {}) });
  }
  if (TRANSIENT_CODES.has(code)) {
    out.push({ kind: "transient", text: code === "provider_unavailable" ? "eBay could not be reached. Sync retries automatically." : "eBay sync is temporarily unavailable. NivaDesk has been notified.", action: "wait" });
  }
  if (n(counts.parked) > 0) {
    out.push({ kind: "plan_full", text: "Your plan is full, so these eBay orders are parked rather than imported. Make room or choose a plan.", action: "parked", count: n(counts.parked) });
  }
  if (n(counts.needsReview) > 0) {
    out.push({ kind: "review", text: "These eBay orders came in but need a look before you rely on their figures.", action: "review", count: n(counts.needsReview) });
  }
  return out;
}

// ---- the order's link back to eBay ----------------------------------------------
// Built from the order's own id and nothing else. The stored `externalAdminUrl`
// is a string the server wrote from provider data; only its HOST is consulted,
// and only when that host is one of eBay's own sites — never its path, never
// free text. Anything that is not an eBay order id gets no link at all.
const EBAY_HOSTS: ReadonlySet<string> = new Set([
  "www.ebay.co.uk", "www.ebay.com", "www.ebay.de", "www.ebay.fr", "www.ebay.it", "www.ebay.es", "www.ebay.nl",
  "www.ebay.ie", "www.ebay.at", "www.ebay.be", "www.ebay.ch", "www.ebay.pl", "www.ebay.ca", "www.ebay.com.au"
]);
const EBAY_ORDER_ID = /^[A-Za-z0-9][A-Za-z0-9-]{3,62}$/;

export function ebayOrderLink(externalId: string, storedAdminUrl = ""): string {
  const id = String(externalId || "").trim();
  if (!EBAY_ORDER_ID.test(id)) return "";
  let host = "www.ebay.co.uk";
  const stored = String(storedAdminUrl || "").trim();
  const match = /^https:\/\/([a-z0-9.-]+)\//i.exec(stored);
  if (match && EBAY_HOSTS.has(match[1].toLowerCase())) host = match[1].toLowerCase();
  return `https://${host}/sh/ord/details?orderid=${encodeURIComponent(id)}`;
}

// ---- eBay's own statuses, kept apart from NivaDesk's ------------------------------
// The adapter writes platformStatus (cancelled, or eBay's payment word lowercased),
// paymentStatus (money) and fulfillmentStatus (eBay's shipping). They are what
// eBay says. NivaDesk's production stage and its own shipping card say what the
// workshop did, and neither side overwrites the other.
export type EbayStamp = {
  provider: string; externalId: string; orderNumber: string; externalAdminUrl: string;
  platformStatus: string; paymentStatus: string; fulfillmentStatus: string;
  currency: string; grandTotal: string; lastAppliedAtMs: number; reviewRequired: boolean; reviewReasons: string[];
  connectionDisplayName: string;
  /** `commerce.money` (E1, 1 Oct 2026): eBay's money one concept per field, decimal strings in the order's currency. */
  money?: Record<string, unknown> | null;
};

const PLATFORM_STATUS_TEXT: Record<string, string> = {
  cancelled: "Cancelled on eBay", paid: "Paid", pending: "Payment pending", failed: "Payment failed",
  fully_refunded: "Fully refunded", partially_refunded: "Partially refunded"
};
const PAYMENT_STATUS_TEXT: Record<string, string> = {
  paid: "Paid", partially_paid: "Partially paid", unpaid: "Not paid", partially_refunded: "Partially refunded", refunded: "Refunded", voided: "Voided"
};
const FULFILMENT_STATUS_TEXT: Record<string, string> = {
  unfulfilled: "Not shipped on eBay", partial: "Partly shipped on eBay", fulfilled: "Shipped on eBay"
};
const REVIEW_REASON_TEXT: Record<string, string> = {
  tax_responsibility_unknown: "Who collects the tax is unknown", missing_external_id: "Missing eBay order id",
  no_line_items: "No line items", missing_total: "Missing total", ad_hoc_line_item: "Item not in the catalogue", unresolved_variation: "Unresolved variation"
};

/** Own-property lookup (a table is not a map — ebayScreenRules RULE 3), with the raw word tidied as the fallback. */
function wordOf(table: Record<string, string>, key: string): string {
  const clean = String(key || "").trim().toLowerCase();
  if (!clean) return "";
  if (Object.prototype.hasOwnProperty.call(table, clean) && typeof table[clean] === "string" && table[clean]) return table[clean];
  return clean.replace(/_/g, " ");
}

export type EbaySourceStatus = {
  platform: string; payment: string; fulfilment: string;
  cancelled: boolean;
  /** Any money went back (fully or partly). */
  refunded: boolean;
  /** Cancelled, or refunded in full: eBay has closed the sale. A PARTIAL refund leaves the order open. */
  closed: boolean;
  reviewReasons: string[];
};

export function ebaySourceStatus(stamp: EbayStamp): EbaySourceStatus {
  const platform = String(stamp.platformStatus || "").toLowerCase();
  const payment = String(stamp.paymentStatus || "").toLowerCase();
  const cancelled = platform === "cancelled";
  const fullyRefunded = payment === "refunded" || platform === "fully_refunded";
  return {
    platform: wordOf(PLATFORM_STATUS_TEXT, platform),
    payment: wordOf(PAYMENT_STATUS_TEXT, payment),
    fulfilment: wordOf(FULFILMENT_STATUS_TEXT, stamp.fulfillmentStatus),
    cancelled,
    refunded: fullyRefunded || payment === "partially_refunded" || platform === "partially_refunded",
    closed: cancelled || fullyRefunded,
    reviewReasons: (stamp.reviewReasons || []).map((reason) => wordOf(REVIEW_REASON_TEXT, reason)).filter(Boolean)
  };
}

// ---- what the order page's eBay block shows -------------------------------------
// Everything the block prints, decided here so a test can hold it to the gates:
// eBay's money only with Financial Info, and never the buyer — the block has no
// field for one. `null` = the order is not an eBay order.
//
// The money is eBay's own, one concept per line, as the server states it in
// `commerce.money` (package E1): what the buyer was charged, what eBay received,
// refunds completed and pending, what is left collected, what is still due, the
// tax eBay collected and remitted, and eBay's fee as information only. Nothing is
// worked out here: the seller's payout is "not known" until the server knows it
// (eBay's Finances are not read), and a line whose figure the server did not
// state is left out rather than shown as 0.
export type EbayMoneyLine = { key: string; label: string; amount: string; currency: string; info: boolean };
export type EbayOrderBlockView = {
  connection: string; number: string; syncedAtMs: number; link: string;
  status: EbaySourceStatus; note: "closed" | "open";
  /** eBay's money, one concept per line; empty without Financial Info. */
  money: EbayMoneyLine[];
  /** "unknown" while the server does not know eBay's payout to the seller; "" without Financial Info or without stated money. */
  payout: "unknown" | "";
  /** Payments or refunds eBay made in another currency, listed as eBay states them; empty without Financial Info. */
  otherCurrency: { amount: string; currency: string }[];
};

/** A decimal the server stated, as a string; null for anything else (a missing figure is never a 0). */
function decimalOf(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return value.toFixed(2);
  const text = String(value ?? "").trim();
  return /^-?\d+(\.\d+)?$/.test(text) ? text : null;
}
const positive = (value: string | null) => value !== null && Number(value) > 0;

const MONEY_LINES: ReadonlyArray<{ key: string; label: string; when: "stated" | "positive"; info?: boolean }> = [
  { key: "gross_sale", label: "Sale total", when: "stated" },
  { key: "payments_received", label: "Received", when: "stated" },
  { key: "payments_pending", label: "Payments pending", when: "positive" },
  { key: "refunds_completed", label: "Refunds completed", when: "positive" },
  { key: "refunds_pending", label: "Refunds pending", when: "positive" },
  { key: "net_collected", label: "Net collected", when: "stated" },
  { key: "balance_due", label: "Balance due", when: "stated" },
  { key: "platform_collected_tax", label: "Tax collected by eBay", when: "positive" },
  { key: "marketplace_fee", label: "eBay fee (information only)", when: "stated", info: true },
  { key: "fee_basis", label: "Fee basis (information only)", when: "stated", info: true }
];

export function ebayOrderBlockView(stamp: EbayStamp | null | undefined, access: { canSeeFinance: boolean }): EbayOrderBlockView | null {
  if (!stamp || String(stamp.provider || "") !== "ebay") return null;
  const status = ebaySourceStatus(stamp);
  const finance = access.canSeeFinance === true;
  const stated = stamp.money && typeof stamp.money === "object" && !Array.isArray(stamp.money) ? stamp.money : null;
  const currency = String((stated && stated.currency) || stamp.currency || "").trim().toUpperCase();
  const money: EbayMoneyLine[] = [];
  let payout: "unknown" | "" = "";
  const otherCurrency: { amount: string; currency: string }[] = [];
  if (finance && stated) {
    for (const line of MONEY_LINES) {
      const amount = decimalOf(Object.prototype.hasOwnProperty.call(stated, line.key) ? stated[line.key] : null);
      if (amount === null || (line.when === "positive" && !positive(amount))) continue;
      money.push({ key: line.key, label: line.label, amount, currency, info: line.info === true });
    }
    const payoutAmount = decimalOf(stated.seller_payout);
    if (stated.seller_payout_known === true && payoutAmount !== null) money.push({ key: "seller_payout", label: "Seller payout", amount: payoutAmount, currency, info: false });
    else payout = "unknown";
    for (const entry of Array.isArray(stated.other_currency) ? stated.other_currency : []) {
      const row = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
      const amount = decimalOf(row.amount);
      const code = String(row.currency || "").trim().toUpperCase();
      if (amount !== null && /^[A-Z]{3}$/.test(code)) otherCurrency.push({ amount, currency: code });
    }
  } else if (finance) {
    // An order applied before the server stated its money: the platform's total, as before.
    const total = decimalOf(stamp.grandTotal);
    if (total !== null) money.push({ key: "gross_sale", label: "Sale total", amount: total, currency, info: false });
  }
  return {
    connection: String(stamp.connectionDisplayName || "").trim(),
    number: String(stamp.orderNumber || stamp.externalId || "").trim(),
    syncedAtMs: n(stamp.lastAppliedAtMs),
    link: ebayOrderLink(stamp.externalId, stamp.externalAdminUrl),
    status, note: status.closed ? "closed" : "open",
    money, payout, otherCurrency
  };
}

/** Every sentence a status table can produce, for the translation check. */
export const EBAY_SCREEN_SENTENCES: readonly string[] = Object.freeze([
  ...Object.values(PLATFORM_STATUS_TEXT), ...Object.values(PAYMENT_STATUS_TEXT), ...Object.values(FULFILMENT_STATUS_TEXT), ...Object.values(REVIEW_REASON_TEXT),
  ...MONEY_LINES.map((line) => line.label), "Seller payout"
]);
