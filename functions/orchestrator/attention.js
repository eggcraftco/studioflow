"use strict";

/**
 * "What should I look at today?" — deterministic detectors, no model anywhere
 * (§40: deterministic first, AI second).
 *
 * Three rules make this module different from a list of alerts:
 *
 * 1. **One item per thing, not one per rule.** An order that is overdue AND
 *    waiting to ship AND unpaid is ONE item carrying three reasons and the
 *    highest severity. Three separate items would make a busy workshop look
 *    like a crisis and would be read as three problems.
 * 2. **`attentionId` is content-stable.** An entity item is keyed on
 *    type+entity, a grouped item on type+company — NOT on the day. Keying a
 *    group on the day mints a fresh id for "8 receipts missing" every morning,
 *    which leaves alert de-duplication, "already notified?", and "do not reopen
 *    a dismissed item" with nothing to key on. What changed rides in
 *    `contentHash` instead, so an unchanged group keeps both, and a group that
 *    gains a member keeps its id and moves its hash.
 * 3. **`createdAt` is the time of the fact, never the time of the request.** An
 *    item stamped `now` cannot answer "how long has this been true".
 */

const crypto = require("crypto");
const envelope = require("./envelope");
const orderView = require("./orderView");
const insights = require("../bank/insights");
const classification = require("../bank/classification");
const contextModule = require("./context");

const DAY_MS = 24 * 60 * 60 * 1000;
const SEVERITIES = Object.freeze(["critical", "high", "medium", "low"]);
const SEVERITY_RANK = Object.freeze({ critical: 4, high: 3, medium: 2, low: 1 });

const DOMAINS = Object.freeze([
  "orders", "shipping", "payments", "inventory", "banking", "payouts", "accounting", "integrations"
]);

const sha1 = (value) => crypto.createHash("sha1").update(String(value)).digest("hex");
const round2 = (value) => Math.round(((Number(value) || 0) + Number.EPSILON) * 100) / 100;

function highest(lhs, rhs) {
  return SEVERITY_RANK[lhs] >= SEVERITY_RANK[rhs] ? lhs : rhs;
}

/* ------------------------------------------------------------------ *
 * Order-level detectors. Every one returns { type, severity, reason,
 * createdAtMs } for one order; the merge below turns them into items.
 * ------------------------------------------------------------------ */

function orderDetectors(view, { nowMs, horizonDays, sections }) {
  const found = [];
  const open = !view.completed && !view.cancelled;

  if (sections.orders && open && view.dueDateMs) {
    const overdueBy = nowMs - view.dueDateMs;
    if (overdueBy > 0 && !view.isDispatched) {
      found.push({
        type: "order_overdue",
        severity: overdueBy > 7 * DAY_MS ? "critical" : "high",
        reason: `Due ${new Date(view.dueDateMs).toISOString().slice(0, 10)} and not dispatched.`,
        createdAtMs: view.dueDateMs
      });
    } else if (overdueBy <= 0 && Math.abs(overdueBy) <= horizonDays * DAY_MS && !view.isDispatched) {
      found.push({
        type: "order_due_soon",
        severity: Math.abs(overdueBy) <= 3 * DAY_MS ? "high" : "medium",
        reason: `Due ${new Date(view.dueDateMs).toISOString().slice(0, 10)}.`,
        createdAtMs: view.dueDateMs
      });
    }
  }

  if (sections.payments && open && view.remainingAmount > 0) {
    const dueSoon = view.dueDateMs !== null && view.dueDateMs - nowMs <= horizonDays * DAY_MS;
    if (view.isDispatched || dueSoon) {
      const overdueBy = view.dueDateMs ? nowMs - view.dueDateMs : 0;
      found.push({
        type: "payment_outstanding",
        severity: view.isDispatched && overdueBy > 14 * DAY_MS ? "critical" : "high",
        reason: `${round2(view.remainingAmount)} ${view.currency} still outstanding.`,
        createdAtMs: view.dueDateMs || view.createdAtMs || nowMs
      });
    }
  }

  if (sections.orders && open && view.estimateWaitingSinceMs) {
    const waitingDays = (nowMs - view.estimateWaitingSinceMs) / DAY_MS;
    found.push({
      type: "approval_waiting",
      severity: waitingDays >= 5 ? "high" : "medium",
      reason: `An estimate has been waiting for the customer's answer for ${Math.floor(waitingDays)} day(s).`,
      createdAtMs: view.estimateWaitingSinceMs
    });
  }

  // Ready to ship and not gone. The stage is computed from the order's own
  // steps (production.resolveProductionStage), never read from a stored field.
  if (sections.shipping && open && view.stage && view.stage.kind === "shipready" && !view.isDispatched) {
    const overdueBy = view.dueDateMs ? nowMs - view.dueDateMs : null;
    found.push({
      type: "shipping_waiting",
      severity: overdueBy !== null && overdueBy > 0 ? "critical" : (overdueBy !== null && overdueBy > -3 * DAY_MS ? "high" : "medium"),
      reason: "The work is finished and the order has not been dispatched.",
      createdAtMs: view.updatedAtMs || view.createdAtMs || nowMs
    });
  }

  if (sections.shipping && open && view.isDispatched === false && view.fulfillmentStatus === "fulfilled") {
    found.push({
      type: "platform_fulfilment_mismatch",
      severity: "high",
      reason: "The shop says this order is fulfilled; NivaDesk has not dispatched it.",
      createdAtMs: view.lastSyncAtMs || view.updatedAtMs || view.createdAtMs || nowMs
    });
  }

  if (sections.orders && open && ["refunded", "partially_refunded", "voided"].includes(view.paymentStatus) && view.paidAmount > 0) {
    found.push({
      type: "provider_state_conflict",
      severity: !view.isDispatched && view.remainingAmount <= 0 ? "critical" : "high",
      reason: `The provider reports this order as ${view.paymentStatus} while NivaDesk still shows it open and paid.`,
      createdAtMs: view.lastSyncAtMs || view.updatedAtMs || view.createdAtMs || nowMs
    });
  }

  if (sections.shipping && view.isDispatched && !view.trackingNumber) {
    const since = view.updatedAtMs || view.createdAtMs || nowMs;
    found.push({
      type: "shipped_without_tracking",
      severity: nowMs - since > 2 * DAY_MS ? "medium" : "low",
      reason: "Dispatched with no tracking number recorded.",
      createdAtMs: since
    });
  }

  if (sections.orders && view.reviewRequired) {
    found.push({
      type: "order_review_required",
      severity: "high",
      reason: "The import engine held this order for review.",
      createdAtMs: view.lastSyncAtMs || view.createdAtMs || nowMs
    });
  }

  if (sections.payments && view.finance.taxNeedsReview) {
    found.push({
      type: "order_tax_unknown",
      severity: "medium",
      reason: "The channel does not say whether it collected the sales tax on this order.",
      createdAtMs: view.createdAtMs || nowMs
    });
  }

  return found;
}

/** One item per order, carrying every reason found for it. */
function mergeOrderItems(views, options) {
  const items = [];
  for (const view of views) {
    const found = orderDetectors(view, options);
    if (found.length === 0) continue;
    const severity = found.reduce((acc, row) => highest(acc, row.severity), "low");
    const oldest = Math.min(...found.map((row) => row.createdAtMs || options.nowMs));
    const label = view.orderNumber || view.projectNumber || view.id;
    items.push({
      attentionId: sha1(`order_attention|order|${view.id}`),
      contentHash: sha1(found.map((row) => row.type).sort().join(",")),
      type: found[0].type,
      reasons: found.map((row) => row.type),
      severity,
      // The title names the order, never the customer: the assistant is told
      // WHICH order and asks before it is told WHO.
      title: `Order ${label} needs attention`,
      reason: found.map((row) => row.reason).join(" "),
      entityRefs: [envelope.entityRef("order", view.id, label)],
      facts: [{ key: "reasons", value: found.length }],
      freshness: { source: view.channel, lastSuccessAt: view.lastSyncAtMs ? new Date(view.lastSyncAtMs).toISOString() : null, state: view.lastSyncAtMs ? "fresh" : "unsupported" },
      suggestedActions: [{ capability: "get_order_detail", args: { orderId: view.id }, label: "Open this order", riskClass: "A", requiresApproval: false }],
      requiresApproval: false,
      createdAt: new Date(oldest).toISOString(),
      resolvedAt: null
    });
  }
  return items;
}

/** One grouped item per row-level type, with per-currency amounts. */
function groupedItem({ companyId, type, severity, title, rows, amountsByCurrency = null, entityType = "bankTransaction", oldestMs, suggested = [] }) {
  const facts = [{ key: "count", value: rows.length }];
  if (amountsByCurrency) {
    for (const [currency, amount] of Object.entries(amountsByCurrency)) {
      facts.push({ key: "amount", value: round2(amount), currency });
    }
  }
  return {
    // NOT keyed on the day: a group that has not changed keeps its id.
    attentionId: sha1(`${type}|${companyId}`),
    contentHash: sha1(rows.map((row) => String(row.id || "")).sort().join(",")),
    type,
    reasons: [type],
    severity,
    title,
    reason: title,
    entityRefs: rows.slice(0, 20).map((row) => envelope.entityRef(entityType, String(row.id || ""), String(row.label || ""))),
    facts,
    freshness: null,
    suggestedActions: suggested,
    requiresApproval: false,
    createdAt: new Date(oldestMs).toISOString(),
    resolvedAt: null
  };
}

function bookingMs(row) {
  const parsed = insights.parseDay(row && row.bookingDate);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function amountsByCurrency(rows) {
  const out = {};
  for (const row of rows) {
    const currency = String(row.currency || "GBP").toUpperCase();
    out[currency] = (out[currency] || 0) + Math.abs(Number(row.amount) || 0);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Banking detectors (§12), shared by both attention capabilities.
 * ------------------------------------------------------------------ */

/**
 * `revealCounterparty` is the difference between them, and it is a PII decision
 * rather than a presentation one. A recurring-spend group is titled with the
 * merchant, and a merchant is a person whenever the payment was person to
 * person — which is why get_banking_attention_summary declares `pii: ["name"]`
 * and is listed in MCP_ACTIONS_READING_PII, so the read is recorded.
 * get_business_attention_summary is the broad "what should I look at today?"
 * read, declares no PII and writes no access-log row, so it asks for the same
 * findings WITHOUT the names: it says which transactions, and the caller asks
 * the banking capability who — the same rule the order items follow, where the
 * title names the order and never the customer.
 */
function bankingItems(snapshot, { nowMs, companyId, limitRows = 20, revealCounterparty = true }) {
  const rows = Array.isArray(snapshot.bankRows) ? snapshot.bankRows : [];
  const items = [];
  // The one place a counterparty becomes a label. Off, it never becomes one.
  const counterparty = (value) => (revealCounterparty ? String(value || "") : "");
  const spend = rows.filter((row) => classification.isSpendRow(row));

  const missingReceipt = spend.filter((row) => !row.hasReceipt && row.receiptNotNeeded !== true);
  if (missingReceipt.length > 0) {
    const oldest = Math.min(...missingReceipt.map(bookingMs));
    items.push(groupedItem({
      companyId,
      type: "receipt_missing",
      severity: nowMs - oldest > 60 * DAY_MS ? "medium" : "low",
      title: `${missingReceipt.length} transaction(s) have no receipt attached`,
      rows: missingReceipt.slice(0, limitRows),
      amountsByCurrency: amountsByCurrency(missingReceipt),
      oldestMs: oldest,
      suggested: [{ capability: "attach_bank_receipt", args: {}, label: "Attach a receipt", riskClass: "C", requiresApproval: true }]
    }));
  }

  const uncategorised = spend.filter((row) => !row.category || row.categoryAuto === true);
  if (uncategorised.length > 0) {
    items.push(groupedItem({
      companyId,
      // No escalation: nothing in the data distinguishes an urgent uncategorised
      // row from a quiet one, and a made-up count threshold would be a
      // fabricated signal.
      type: "transaction_uncategorised",
      severity: "low",
      title: `${uncategorised.length} transaction(s) are not categorised yet`,
      rows: uncategorised.slice(0, limitRows),
      amountsByCurrency: amountsByCurrency(uncategorised),
      oldestMs: Math.min(...uncategorised.map(bookingMs))
    }));
  }

  const duplicateIds = insights.detectPossibleDuplicates(rows);
  const duplicates = rows.filter((row) => duplicateIds.has(String(row.id)));
  if (duplicates.length > 0) {
    items.push(groupedItem({
      companyId,
      type: "possible_duplicate",
      severity: "medium",
      title: `${duplicates.length} transaction(s) look like duplicate charges`,
      rows: duplicates.slice(0, limitRows),
      amountsByCurrency: amountsByCurrency(duplicates),
      oldestMs: Math.min(...duplicates.map(bookingMs))
    }));
  }

  const unusual = insights.detectUnusualCharges(rows);
  if (unusual.length > 0) {
    items.push(groupedItem({
      companyId,
      type: "unusual_charge",
      severity: "medium",
      title: `${unusual.length} charge(s) are much larger than usual for that supplier`,
      rows: unusual.map((row) => ({ id: row.id, currency: row.currency, amount: row.amount, bookingDate: row.bookingDate })),
      amountsByCurrency: amountsByCurrency(unusual),
      oldestMs: Math.min(...unusual.map((row) => insights.parseDay(row.bookingDate) || nowMs))
    }));
  }

  const recurring = insights.detectRecurringSpends(rows, snapshot.bankVendors || [], { now: nowMs });
  const priceChanged = recurring.filter((row) => row.priceChange);
  if (priceChanged.length > 0) {
    items.push(groupedItem({
      companyId,
      type: "recurring_price_changed",
      severity: "medium",
      title: `${priceChanged.length} recurring payment(s) changed price`,
      rows: priceChanged.map((row) => ({ id: row.transactionIds[row.transactionIds.length - 1] || row.key, label: counterparty(row.merchant), currency: row.currency, amount: row.typicalAmount, bookingDate: row.lastDate })),
      amountsByCurrency: null,
      oldestMs: Math.min(...priceChanged.map((row) => insights.parseDay(row.lastDate) || nowMs))
    }));
  }
  const stopped = recurring.filter((row) => !row.active);
  if (stopped.length > 0) {
    items.push(groupedItem({
      companyId,
      type: "possible_cancelled_subscription",
      severity: "low",
      title: `${stopped.length} recurring payment(s) have stopped arriving`,
      rows: stopped.map((row) => ({ id: row.transactionIds[row.transactionIds.length - 1] || row.key, label: counterparty(row.merchant), currency: row.currency, amount: row.typicalAmount, bookingDate: row.lastDate })),
      amountsByCurrency: null,
      oldestMs: Math.min(...stopped.map((row) => insights.parseDay(row.lastDate) || nowMs))
    }));
  }

  const transfers = insights.detectPossibleTransfers(rows);
  if (transfers.length > 0) {
    items.push(groupedItem({
      companyId,
      type: "possible_transfer",
      severity: "low",
      title: `${transfers.length} pair(s) of rows look like a transfer between your own accounts`,
      rows: transfers.map((row) => ({ id: row.outId, currency: row.currency, amount: row.amount, bookingDate: row.bookingDate })),
      amountsByCurrency: amountsByCurrency(transfers),
      oldestMs: Math.min(...transfers.map((row) => insights.parseDay(row.bookingDate) || nowMs))
    }));
  }

  const waiting = Array.isArray(snapshot.receiptInbox) ? snapshot.receiptInbox.filter((row) => String(row.status || "") === "waiting") : [];
  if (waiting.length > 0) {
    items.push(groupedItem({
      companyId,
      type: "receipts_waiting",
      severity: "low",
      title: `${waiting.length} receipt(s) are waiting for a matching bank transaction`,
      rows: waiting.slice(0, limitRows),
      amountsByCurrency: null,
      oldestMs: Math.min(...waiting.map((row) => Number(row.createdAtMs) || nowMs))
    }));
  }

  return items;
}

/** Bank connection state is its own item: a dead feed makes every other figure old. */
function bankConnectionItems(snapshot, { nowMs, companyId }) {
  const connection = snapshot.bankConnection;
  if (!connection) return [];
  const syncState = String(connection.syncState || "");
  if (!["error", "needs_reconsent", "disconnected"].includes(syncState)) return [];
  return [groupedItem({
    companyId,
    type: "bank_connection_attention",
    severity: ["needs_reconsent", "disconnected"].includes(syncState) ? "critical" : "high",
    title: syncState === "error" ? "The bank feed is failing to sync" : "The bank connection needs to be re-authorised",
    rows: [{ id: String(connection.id || "bank"), label: String(connection.institutionName || "") }],
    entityType: "connection",
    oldestMs: Number(connection.lastSyncedAtMs) || nowMs
  })];
}

/* ------------------------------------------------------------------ *
 * The capability
 * ------------------------------------------------------------------ */

function businessAttentionSummary(snapshot, args = {}, ctx = {}, { nowMs = Date.now() } = {}) {
  const horizonDays = Math.min(30, Math.max(1, Number(args.horizonDays) || 7));
  const limit = Math.min(50, Math.max(1, Number(args.limit) || 20));
  const wantedDomains = Array.isArray(args.domains) && args.domains.length
    ? new Set(args.domains.map((value) => String(value)))
    : new Set(DOMAINS);

  const sections = contextModule.sectionAccess(ctx);
  const warnings = [];
  const settings = snapshot.settings || {};
  const workspace = require("./money").workspaceCurrency(settings);
  const companyId = String(snapshot.companyId || ctx.companyId || "");

  const production = snapshot.production || null;
  const views = (snapshot.orders || [])
    .map((order) => orderView.buildOrderView(order, { settings, workspace, nowMs, production }))
    .filter((view) => (ctx.workflowOnly ? view.assignedToUid === ctx.uid : true));

  let items = [];
  if (wantedDomains.has("orders") || wantedDomains.has("shipping") || wantedDomains.has("payments")) {
    items = items.concat(mergeOrderItems(views, { nowMs, horizonDays, sections }));
  }

  if (sections.inventory && wantedDomains.has("inventory")) {
    const metrics = require("./inventoryMetrics");
    const low = metrics.lowStockItems(snapshot.inventoryItems || [], { limit: 20 });
    if (low.length > 0) {
      items.push(groupedItem({
        companyId,
        type: "stock_low",
        severity: low.some((row) => row.onHand === 0) ? "high" : "medium",
        title: `${low.length} inventory item(s) are at or below their low-stock level`,
        rows: low.map((row) => ({ id: row.itemId, label: row.name })),
        entityType: "inventoryItem",
        oldestMs: nowMs
      }));
    }
  }

  if (sections.banking && wantedDomains.has("banking")) {
    // No counterparty names: this capability declares no PII and files no
    // access-log row, so it must not be the one that hands over a person.
    items = items.concat(bankingItems(snapshot, { nowMs, companyId, revealCounterparty: false }));
    items = items.concat(bankConnectionItems(snapshot, { nowMs, companyId }));
  }

  if (sections.payouts && wantedDomains.has("payouts")) {
    const payouts = require("./payouts");
    const unmatched = [];
    for (const provider of ["square", "paypal"]) {
      for (const payout of ((snapshot.payouts || {})[provider] || [])) {
        if (payouts.matchState(payout) === "unmatched") {
          unmatched.push({ id: String(payout.id || ""), label: `${provider} payout`, amount: payout.amount, currency: payout.currency, bookingDate: payout.arrivalDate });
        }
      }
    }
    if (unmatched.length > 0) {
      const oldest = Math.min(...unmatched.map((row) => insights.parseDay(row.bookingDate) || nowMs));
      items.push(groupedItem({
        companyId,
        type: "payout_unmatched",
        severity: nowMs - oldest > 14 * DAY_MS ? "high" : "medium",
        title: `${unmatched.length} marketplace payout(s) have not been matched with a bank line`,
        rows: unmatched,
        entityType: "payout",
        amountsByCurrency: amountsByCurrency(unmatched),
        oldestMs: oldest
      }));
    }
  }

  if (sections.accounting && wantedDomains.has("accounting")) {
    const open = (snapshot.accountingAttention || []);
    if (open.length > 0) {
      const severityMap = require("./accountingStatus").SEVERITY_FROM_STORED;
      const severity = open.reduce((acc, row) => highest(acc, severityMap[String(row.severity || "")] || "low"), "low");
      items.push(groupedItem({
        companyId,
        type: "accounting_attention",
        severity,
        title: `${open.length} accounting item(s) need attention`,
        rows: open.map((row) => ({ id: String(row.id || ""), label: String(row.kind || "") })),
        entityType: "attention",
        oldestMs: Math.min(...open.map((row) => Number(row.firstSeenAtMs) || nowMs))
      }));
    }
  }

  if (wantedDomains.has("integrations") && sections.integrations) {
    const health = require("./integrationHealth");
    const rows = health.integrationHealth(snapshot, {}, ctx, { nowMs }).data.connections;
    const reconnect = rows.filter((row) => row.reconnectRequired);
    if (reconnect.length > 0) {
      items.push(groupedItem({
        companyId,
        type: "integration_reconnect",
        severity: "critical",
        title: `${reconnect.length} connection(s) need reconnecting`,
        rows: reconnect.map((row) => ({ id: String(row.connectionId || row.provider), label: row.provider })),
        entityType: "connection",
        oldestMs: nowMs
      }));
    }
    const stale = rows.filter((row) => row.ordersFreshness && row.ordersFreshness.state === "stale");
    if (stale.length > 0) {
      items.push(groupedItem({
        companyId,
        type: "integration_stale",
        severity: stale.some((row) => (row.ordersFreshness.lagMs || 0) > 24 * 60 * 60 * 1000) ? "high" : "medium",
        title: `${stale.length} connection(s) have not synced recently`,
        rows: stale.map((row) => ({ id: String(row.connectionId || row.provider), label: row.provider })),
        entityType: "connection",
        oldestMs: nowMs
      }));
    }
  }

  // Sections the role cannot see are NAMED and empty. Silence would read as
  // "nothing to report".
  const sectionRows = DOMAINS.map((id) => {
    const permitted = sections[id] !== false;
    const status = !wantedDomains.has(id) ? "unavailable" : (permitted ? "ok" : "not_permitted");
    return { id, status, itemCount: items.filter((item) => domainOf(item.type) === id).length };
  });
  for (const row of sectionRows) {
    if (row.status === "not_permitted") {
      warnings.push(envelope.warning("section_not_permitted", `${row.id} items are not included for your role.`, { section: row.id }));
    }
  }
  // §40 asks for a customer follow-up SLA signal. No SLA field exists anywhere
  // in the data model, so it is declared unsupported rather than invented.
  warnings.push(envelope.warning("unsupported_metric", "Customer follow-up SLA breaches are not reported: NivaDesk stores no response-time target to measure them against."));

  items.sort((lhs, rhs) => SEVERITY_RANK[rhs.severity] - SEVERITY_RANK[lhs.severity] || String(lhs.createdAt).localeCompare(String(rhs.createdAt)));
  const limited = items.slice(0, limit);
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const item of items) counts[item.severity] += 1;

  return {
    data: { counts, sections: sectionRows, items: limited, totalItems: items.length, horizonDays },
    warnings,
    sources: require("./commerce").commerceSources(snapshot, views, { nowMs }),
    entityRefs: limited.flatMap((item) => item.entityRefs).slice(0, 25),
    state: items.some((item) => item.severity === "critical") ? "needs_attention" : "completed"
  };
}

/** §12: the same detectors, banking only, with the connection state beside them. */
function bankingAttentionSummary(snapshot, args = {}, ctx = {}, { nowMs = Date.now() } = {}) {
  const companyId = String(snapshot.companyId || ctx.companyId || "");
  const limit = Math.min(50, Math.max(1, Number(args.limit) || 20));
  const items = [
    ...bankingItems(snapshot, { nowMs, companyId }),
    ...bankConnectionItems(snapshot, { nowMs, companyId })
  ].sort((lhs, rhs) => SEVERITY_RANK[rhs.severity] - SEVERITY_RANK[lhs.severity]);

  const warnings = [];
  if (ctx.entitlements && ctx.entitlements.bankFeedEnabled === false) {
    warnings.push(envelope.warning("plan_limited", "Live bank syncing is not included in this plan; the rows already imported are still reported."));
  }

  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const item of items) counts[item.severity] += 1;

  const connection = snapshot.bankConnection || null;
  const freshness = require("./freshness");
  return {
    data: {
      counts,
      totalItems: items.length,
      items: items.slice(0, limit),
      connection: connection ? {
        syncState: String(connection.syncState || ""),
        lastSyncedAt: connection.lastSyncedAtMs ? new Date(Number(connection.lastSyncedAtMs)).toISOString() : null,
        consentExpiresAt: connection.consentExpiresAt || null
      } : null
    },
    warnings,
    sources: [freshness.sourceRow({
      provider: String((connection || {}).provider || "bank"),
      entity: "finance",
      kind: "bank",
      lastSuccessAtMs: Number((connection || {}).lastSyncedAtMs || 0),
      state: connection ? null : "never",
      contributed: true,
      nowMs
    })],
    entityRefs: items.slice(0, 10).flatMap((item) => item.entityRefs).slice(0, 25),
    state: items.some((item) => item.severity === "critical") ? "needs_attention" : "completed"
  };
}

/** Which section an item type belongs to. */
function domainOf(type) {
  if (["order_overdue", "order_due_soon", "provider_state_conflict", "order_review_required", "order_attention"].includes(type)) return "orders";
  if (["shipping_waiting", "shipped_without_tracking", "platform_fulfilment_mismatch"].includes(type)) return "shipping";
  if (["payment_outstanding", "order_tax_unknown"].includes(type)) return "payments";
  if (["stock_low", "stock_reserved_conflict"].includes(type)) return "inventory";
  if (["receipt_missing", "transaction_uncategorised", "possible_duplicate", "unusual_charge", "recurring_price_changed", "possible_cancelled_subscription", "possible_transfer", "receipts_waiting", "bank_connection_attention"].includes(type)) return "banking";
  if (["payout_unmatched"].includes(type)) return "payouts";
  if (["accounting_attention", "accounting_not_ready"].includes(type)) return "accounting";
  if (["integration_reconnect", "integration_stale"].includes(type)) return "integrations";
  return "orders";
}

module.exports = {
  SEVERITIES,
  SEVERITY_RANK,
  DOMAINS,
  domainOf,
  orderDetectors,
  mergeOrderItems,
  bankingItems,
  bankConnectionItems,
  businessAttentionSummary,
  bankingAttentionSummary
};
