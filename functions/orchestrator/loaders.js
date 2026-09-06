"use strict";

/**
 * The ONLY module here that touches Firestore, and it only ever reads.
 *
 * Everything else in `functions/orchestrator/` is snapshot-in, data-out, which
 * is what lets the capabilities be tested with hand-built fixtures instead of a
 * fake database. Two consequences are enforced by test/qa/orchestrator-purity:
 * no other orchestrator file imports firebase-admin, and no orchestrator file at
 * all imports `openAttention`, `resolveAttention`, `recordAudit` or
 * `settlementMatch` — the first two and the last are WRITERS, and a capability
 * annotated `readOnlyHint: true` that bumps an attention document on every read
 * is exactly the annotation mismatch OpenAI rejected 1.1.1 over.
 *
 * Reads are single-field by construction: `where("companyId","==",cid)` on root
 * collections, plain subcollection reads, at most one equality on a
 * subcollection, and everything else filtered in memory.
 * `firestore.indexes.json` has no composite index for `siparisler`,
 * `bankTransactions` or `inventoryItems`, and a composite `where` returns
 * nothing SILENTLY — which would look like an empty workspace rather than an
 * error.
 *
 * PII: `siparisler` is read HERE and nowhere else, and every order goes through
 * `redactForChannel(order, "assistant")` before it leaves this file. Rows the
 * policy restricts also lose `notes` and `historyLog`: a row that will not name
 * the buyer must not carry the buyer's own sentence either — engine orders store
 * `notes: buyer_note`, and the assistant reads it back verbatim.
 */

const outbound = require("../privacy/outbound");
const production = require("../production");

/**
 * Caps. Hitting one sets `<name>Capped` on the snapshot, which becomes a
 * `loader_cap_reached` warning and `partial: true` in the answer
 * (envelope.CAP_WARNINGS, envelope.finish). Four of these used to be silent:
 * `bankCapped` was written and read by nobody, and the payout, review,
 * attention and inbox reads carried no flag at all, so a truncated answer said
 * it was complete. The flag name is the cap's name plus "Capped", and a test
 * pins the two sets against each other.
 */
const CAPS = Object.freeze({ orders: 1000, bank: 3000, inventory: 2000, payouts: 500, review: 200, attention: 100, inbox: 100 });

/** What each capability declares it needs; the loader reads nothing else. */
const DOMAINS = Object.freeze([
  "settings", "orders", "production", "inventory", "bank", "payouts", "connections",
  "commerceHealth", "review", "accounting", "receiptInbox"
]);

const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

/** Connection documents, projected to what their own publicView helpers expose. */
function projectCommerceConnection(id, data, provider) {
  return {
    id,
    provider,
    account: String(data.shopDomain || data.storeName || data.shopName || data.siteUrl || data.host || data.merchantName || ""),
    status: String(data.status || ""),
    mode: String(data.mode || ""),
    scopes: Array.isArray(data.scopes) ? data.scopes.map(String) : [],
    lastSyncAtMs: num(data.lastSyncAtMs),
    lastSuccessAtMs: num(data.lastSuccessAtMs),
    lastErrorCode: String(data.lastErrorCode || "")
  };
}

/**
 * One order, as the assistant is allowed to see it.
 *
 * Pure, and exported, so the unit tests can build their snapshots through the
 * same redaction the loader applies instead of approximating it — a fixture
 * that skips this would be testing a row that never reaches a capability.
 *
 * `onDecision` is how the third rule of privacy/outbound.js reaches this
 * surface: "THE DECISION IS RECORDED ... a block nobody can see is
 * indistinguishable from a feature that quietly does not work." This function
 * stays pure — it hands the decision to the caller and writes nothing — and the
 * caller that has a database (`run()` in orchestrator/index.js, through the
 * injected recordPiiBlock) files it.
 */
function projectOrderForAssistant(raw = {}, onDecision = null) {
  const { record, verdict, removed } = outbound.redactForChannel(raw, "assistant");
  const restricted = !verdict.allow || verdict.minimal;
  if (typeof onDecision === "function" && outbound.decisionNeedsAudit(verdict)) {
    onDecision({ verdict, removedCount: removed.length, orderId: String(raw.id || "") });
  }
  const projected = { ...record, __piiRestricted: restricted };
  if (restricted) {
    // Buyer-authored free text is PII by another route: engine orders store
    // `notes: buyer_note`, and a row that will not name the buyer must not
    // carry the buyer's own sentence either.
    delete projected.notes;
    delete projected.historyLog;
  }
  return projected;
}

/**
 * One bank transaction, as a capability sees it.
 *
 * Exported, and used by the tests, for the reason `projectOrderForAssistant` is:
 * a fixture that approximates this shape is a fixture of a row that never
 * reaches a capability. `splits` is the field that proved it — the document
 * holds an array, this projection keeps its LENGTH, and accountingStatus.js
 * tested `Array.isArray(row.splits)`, which a number never satisfies, so every
 * split transaction scored as ready to be prepared and `notReady.split` was
 * always 0. The unit test passed because it built the row by hand, with the
 * array.
 */
function projectBankRow(id, data = {}) {
  return {
    id,
    amount: num(data.amount),
    currency: String(data.currency || "GBP").toUpperCase(),
    bookingDate: String(data.bookingDate || "").slice(0, 10),
    description: String(data.description || "").slice(0, 200),
    counterparty: String(data.counterparty || "").slice(0, 160),
    category: String(data.category || data.categoryAuto || "").slice(0, 60),
    categoryAuto: Boolean(data.categoryAuto) && !data.category,
    txType: String(data.txType || ""),
    hasReceipt: Boolean(data.receiptPath),
    receiptNotNeeded: data.receiptNotNeeded === true,
    reviewStatus: String(data.reviewStatus || ""),
    accountId: String(data.accountId || ""),
    provider: String(data.provider || ""),
    incomingKind: String(data.incomingKind || ""),
    outgoingKind: String(data.outgoingKind || ""),
    linkedOrderId: String(data.linkedOrderId || ""),
    settlement: data.settlement ? { payoutId: String(data.settlement.payoutId || ""), provider: String(data.settlement.provider || "") } : null,
    // A COUNT, not the array: the split rows themselves carry categories and
    // notes nothing here reports, and a capability only ever needs to know
    // whether this transaction is split.
    splits: Array.isArray(data.splits) ? data.splits.length : 0
  };
}

/**
 * The decisions of one read, as access-log rows — one per provider and reason,
 * not one per order.
 *
 * The live path (nvSafeOrderForChatGPT) files a row per order because it
 * projects the handful of orders a search returned. This loader projects up to
 * a thousand, and a thousand identical rows for one question is an audit trail
 * nobody can read and a write bill nobody expected. `recordCount` is the field
 * accessLog.js added for exactly this — "one access to four hundred customers
 * and one access to a single customer are not the same event".
 *
 * `categories` is what the policy WITHHELD, declared the same way the live path
 * declares it, so an auditor querying "every Amazon decision" gets one shape
 * rather than two.
 */
function piiBlockRows(decisions = []) {
  const grouped = new Map();
  for (const decision of decisions) {
    const verdict = (decision && decision.verdict) || {};
    const key = `${verdict.provider || ""}|${verdict.reason || ""}|${verdict.minimal ? "minimal" : "blocked"}`;
    const row = grouped.get(key) || {
      provider: String(verdict.provider || ""),
      reason: String(verdict.reason || ""),
      minimal: verdict.minimal === true,
      allowed: verdict.allow === true,
      orders: 0,
      fieldsRemoved: 0
    };
    row.orders += 1;
    row.fieldsRemoved += Number(decision && decision.removedCount) || 0;
    grouped.set(key, row);
  }
  return [...grouped.values()];
}

/**
 * Whether this caller may see a domain at all.
 *
 * Two conditions decide a read, not one: the capability must have DECLARED the
 * domain, and the caller must be allowed the data. The declaration is the
 * contract; this is the permission, and a read nobody may see is a read that
 * should not happen — it costs the workspace documents, and it puts data in a
 * process that was refused it, one line away from an answer.
 *
 * `bank` is the union of two predicates because the domain is declared by
 * capabilities behind two different gates: the banking ones ask for the
 * bankFeed AREA, and get_accounting_sync_status asks for the accounting reader,
 * which the area does NOT imply — a member on a custom role reads their access
 * from that role's map, so the explicit `memberAccess[uid].bankFeed` grant the
 * accounting callables ask for can be true while the area map says no
 * (accounting/core/access.js). Anything not named here is readable by anyone
 * the capability's own gate let through.
 */
function readableDomain(domain, ctx = {}) {
  const areas = (ctx && ctx.areas) || {};
  switch (domain) {
    case "bank": return areas.bankFeed === true || ctx.accountingReader === true;
    case "receiptInbox": return areas.bankFeed === true;
    case "inventory": return ctx.inventoryAccess === true;
    case "accounting": return ctx.accountingReader === true;
    default: return true;
  }
}

function createLoaders({ db, now = () => Date.now() }) {
  const company = (companyId) => db().collection("companies").doc(String(companyId));

  async function readCollection(ref, limit) {
    const snap = await ref.limit(limit).get();
    return { rows: snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) })), capped: snap.size >= limit };
  }

  /**
   * The company document, read for THIS request. A cached snapshot would keep
   * serving a member whose access was revoked a minute ago.
   */
  async function loadCompany(companyId) {
    const snap = await company(companyId).get();
    if (!snap.exists) return null;
    const companyData = snap.data() || {};
    companyData.__workspaceId = String(companyId);
    const settingsSnap = await db().collection("companySettings").doc(String(companyId)).get();
    return { companyData, settings: settingsSnap.exists ? settingsSnap.data() || {} : {} };
  }

  async function loadOrders(companyId, ctx) {
    const snap = await db().collection("siparisler").where("companyId", "==", String(companyId)).limit(CAPS.orders).get();
    const rows = [];
    const decisions = [];
    for (const doc of snap.docs) {
      const raw = { id: doc.id, ...(doc.data() || {}) };
      // A workflow-only member sees their own work and nothing else, here as
      // everywhere else in the product.
      if (ctx && ctx.workflowOnly && String(raw.assignedToUid || "") !== ctx.uid) continue;
      rows.push(projectOrderForAssistant(raw, (decision) => decisions.push(decision)));
    }
    return { rows, capped: snap.size >= CAPS.orders, piiBlocks: piiBlockRows(decisions) };
  }

  async function loadBank(companyId) {
    const snap = await company(companyId).collection("bankTransactions").orderBy("bookingDate", "desc").limit(CAPS.bank).get();
    const rows = snap.docs.map((doc) => projectBankRow(doc.id, doc.data() || {}));
    return { rows, capped: snap.size >= CAPS.bank };
  }

  /**
   * The payout collections, each provider's rows under its own key — INCLUDING
   * the empty ones.
   *
   * Writing a key only when rows existed left the readers unable to tell "read
   * it, found none" from "never read", and both of them took a missing key as
   * proof of a missing connection. An empty array is a fact: we looked, there
   * were none. Whether the provider is connected is a question about the
   * connection, and `payouts.payoutFeedState` asks it there.
   */
  async function loadPayouts(companyId) {
    const out = {};
    let capped = false;
    for (const [provider, collection] of [["square", "squarePayouts"], ["paypal", "paypalPayouts"]]) {
      const read = await readCollection(company(companyId).collection(collection), CAPS.payouts);
      out[provider] = read.rows;
      // `readCollection` has always returned this and this function used to
      // drop it on the floor, so a workspace whose payout history is longer
      // than the cap was told how many payouts are unmatched over a list that
      // had been cut off, with nothing said.
      capped = capped || read.capped;
    }
    return { payouts: out, capped };
  }

  async function loadConnections(companyId, ctx) {
    const cid = String(companyId);
    const connections = { shopify: [], etsy: [], woocommerce: [], square: [], bank: [], accounting: [] };
    const rootReads = [
      ["shopify", "shopifyStores"],
      ["etsy", "etsyConnections"],
      ["woocommerce", "wooConnections"],
      ["square", "squareConnections"]
    ];
    for (const [provider, collection] of rootReads) {
      const snap = await db().collection(collection).where("companyId", "==", cid).limit(25).get();
      connections[provider] = snap.docs.map((doc) => projectCommerceConnection(doc.id, doc.data() || {}, provider));
    }
    if (ctx && ctx.areas && ctx.areas.bankFeed) {
      const { rows } = await readCollection(company(cid).collection("bankConnections"), 25);
      connections.bank = rows.map((row) => ({
        id: row.id,
        provider: String(row.provider || "bank"),
        institutionName: String(row.institutionName || row.bankName || ""),
        syncState: String(row.syncState || ""),
        syncFailures: num(row.syncFailures),
        lastSyncedAtMs: num(row.lastSyncedAtMs) || Date.parse(String(row.lastSyncedAt || "")) || 0,
        consentExpiresAt: row.consentExpiresAt || null
      }));
    }
    if (ctx && ctx.accountingReader) {
      const { rows } = await readCollection(company(cid).collection("accountingConnections"), 25);
      connections.accounting = rows.map((row) => ({
        id: row.id,
        provider: String(row.provider || ""),
        companyName: String(row.companyName || row.realmName || ""),
        mode: String(row.mode || "read_only"),
        status: String(row.status || ""),
        writeBoundaryDate: String(row.writeBoundaryDate || ""),
        lastSyncAtMs: num(row.lastSyncAtMs)
      }));
    }
    return connections;
  }

  async function loadCommerceHealth(companyId) {
    const snap = await db().collection("commerceHealth").where("companyId", "==", String(companyId)).limit(50).get();
    return snap.docs.map((doc) => {
      const data = doc.data() || {};
      return {
        provider: String(data.provider || ""),
        connectionId: String(data.connectionId || ""),
        doc: data,
        ordersLastSuccessAtMs: num((data.orders || {}).lastSuccessAtMs),
        financeLastSuccessAtMs: num((data.finance || {}).lastSuccessAtMs)
      };
    });
  }

  async function loadReview(companyId) {
    const cid = String(companyId);
    const queueSnap = await db().collection("commerceReviewQueue").where("companyId", "==", cid).limit(CAPS.review).get();
    // These documents carry `customerName`. It is projected away here so no
    // pure module can emit it by accident.
    const queue = queueSnap.docs.map((doc) => {
      const data = doc.data() || {};
      return { id: doc.id, provider: String(data.provider || ""), connectionId: String(data.connectionId || ""), reason: String(data.reason || "") };
    });
    // `provider` is what makes these rows reportable: holdIntegrationOrder
    // writes it (shopify, woocommerce, inbound), and without it the health
    // answer could read 200 documents and attribute none of them. The raw
    // provider payload on the same document — name, email, address — is not
    // projected, and nothing here reads it.
    const heldSnap = await company(cid).collection("heldIntegrationOrders").limit(CAPS.review).get();
    const held = heldSnap.docs.map((doc) => {
      const data = doc.data() || {};
      return { id: doc.id, provider: String(data.provider || ""), reason: String(data.reason || "") };
    });
    // `heldForReview.total` is a headline number in get_integration_health, so
    // a truncated read of either collection has to be sayable.
    return { queue, held, capped: queueSnap.size >= CAPS.review || heldSnap.size >= CAPS.review };
  }

  async function loadAccountingAttention(companyId) {
    // The READER on the attention collection. `store.openAttention` writes; it
    // is never called from this module or any other under orchestrator/.
    const snap = await company(companyId).collection("accountingAttention")
      .where("status", "==", "open").limit(CAPS.attention).get();
    const rows = snap.docs.map((doc) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        provider: String(data.provider || ""),
        connectionId: String(data.connectionId || ""),
        kind: String(data.kind || ""),
        severity: String(data.severity || ""),
        message: String(data.message || "").slice(0, 200),
        firstSeenAtMs: num(data.firstSeenAtMs),
        entityRefs: Array.isArray(data.entityRefs) ? data.entityRefs.slice(0, 5) : []
      };
    });
    return { rows, capped: snap.size >= CAPS.attention };
  }

  /**
   * The NivaDesk-category → ledger-account map, from the one document it lives
   * in: `pandleConnection/main.mappings`, `[{category, nominalCode, taxCode}]`.
   *
   * Not the accounting connection — that document has no mappings field, and
   * QuickBooks/Xero mappings (`accountingMappings/{connId}`) are keyed by
   * semantic account rather than by bank category, so they cannot answer "is
   * this bank row's category mapped?" at all. Null means the workspace has
   * confirmed no map of its own and the default one applies, which the answer
   * then says out loud.
   */
  async function loadCategoryMappings(companyId) {
    const snap = await company(companyId).collection("pandleConnection").doc("main").get();
    const rows = snap.exists ? (snap.data() || {}).mappings : null;
    if (!Array.isArray(rows)) return null;
    return rows
      .map((row) => ({
        category: String((row || {}).category || ""),
        nominalCode: String((row || {}).nominalCode || ""),
        taxCode: String((row || {}).taxCode || "")
      }))
      .filter((row) => row.category);
  }

  /**
   * The bank rows covering the settlement windows of the unmatched payouts, in
   * one pass. `settlementMatch.suggestForPayout` would do this with a Firestore
   * query per payout, from inside a module this design declares pure.
   */
  function bankRowsForPayoutWindows(bankRows, payouts) {
    const settlements = require("../commerce/settlements");
    const windows = [];
    for (const provider of Object.keys(payouts || {})) {
      for (const payout of payouts[provider] || []) {
        if (payout.bankMatch && payout.bankMatch.transactionId) continue;
        const window = settlements.settlementWindow(payout);
        if (window) windows.push(window);
      }
    }
    if (windows.length === 0) return [];
    const from = windows.map((w) => w.from).sort()[0];
    const to = windows.map((w) => w.to).sort().slice(-1)[0];
    return bankRows.filter((row) => row.bookingDate >= from && row.bookingDate <= to && row.amount > 0);
  }

  /** Read exactly what the capability declared, and nothing else. */
  async function snapshotFor(domainNeeds = [], ctx, { settings = {}, companyData = {} } = {}) {
    const declared = new Set(domainNeeds.filter((name) => DOMAINS.includes(name)));
    // Declared AND permitted. `loadConnections` has always gated its bank and
    // accounting sub-reads this way; the top-level branches did not, so three
    // thousand bank rows were read for a member whose banking section the
    // answer then reports as not_permitted.
    const needs = new Set([...declared].filter((name) => readableDomain(name, ctx)));
    const companyId = ctx.companyId;
    const snapshot = { companyId, nowMs: now(), settings, companyDataHint: companyData };

    if (needs.has("orders")) {
      const { rows, capped, piiBlocks } = await loadOrders(companyId, ctx);
      snapshot.orders = rows;
      snapshot.ordersCapped = capped;
      // Not part of any answer: `run()` files these and nothing renders them.
      snapshot.piiBlocks = piiBlocks;
    } else {
      snapshot.orders = [];
      snapshot.piiBlocks = [];
    }

    if (needs.has("production")) {
      snapshot.production = {
        stages: production.productionStagesFromSettings(settings),
        steps: (Array.isArray(settings.customSteps) ? settings.customSteps : [])
          .map((step) => ({ id: String((step || {}).id || "").trim(), title: String((step || {}).title || "").trim() }))
          .filter((step) => Boolean(step.title))
      };
    }

    if (needs.has("inventory")) {
      const { rows, capped } = await readCollection(company(companyId).collection("inventoryItems"), CAPS.inventory);
      snapshot.inventoryItems = rows;
      snapshot.inventoryCapped = capped;
    }

    if (needs.has("bank")) {
      const { rows, capped } = await loadBank(companyId);
      snapshot.bankRows = rows;
      snapshot.bankCapped = capped;
      const { rows: vendors } = await readCollection(company(companyId).collection("bankVendors"), 200);
      snapshot.bankVendors = vendors.map((row) => ({
        id: row.id,
        name: String(row.name || ""),
        keys: Array.isArray(row.keys) ? row.keys.map(String) : [],
        cadence: String(row.cadence || "") || null
      }));
    }

    if (needs.has("receiptInbox")) {
      const snap = await company(companyId).collection("bankReceiptInbox").where("status", "==", "waiting").limit(CAPS.inbox).get();
      snapshot.receiptInbox = snap.docs.map((doc) => ({ id: doc.id, status: "waiting", createdAtMs: num((doc.data() || {}).createdAtMs) }));
      snapshot.inboxCapped = snap.size >= CAPS.inbox;
    }

    // Connections BEFORE payouts: the payout answer asks the connection whether
    // a feed exists (payouts.payoutFeedState), so it reads what this branch
    // loaded rather than fetching a second copy of the same documents.
    if (needs.has("connections")) {
      snapshot.connections = await loadConnections(companyId, ctx);
      snapshot.bankConnection = (snapshot.connections.bank || [])[0] || null;
    }

    if (needs.has("payouts")) {
      const payoutRead = await loadPayouts(companyId);
      snapshot.payouts = payoutRead.payouts;
      snapshot.payoutsCapped = payoutRead.capped;
      // Bank rows come from the `bank` domain or not at all.
      //
      // This branch used to call loadBank() unconditionally — up to three
      // thousand documents out of companies/{cid}/bankTransactions for
      // get_commerce_overview and get_channel_performance, neither of which
      // declares the bank domain and neither of which is behind the bankFeed
      // gate. Nothing leaked, because payoutBankRows is only consumed by
      // payouts.js, but it broke this module's own contract and the
      // domainNeeds guarantee in registry.js, and one future line reading
      // payoutBankRows from a commerce capability would have turned a contract
      // violation into a bank-data leak to a member without Banking.
      snapshot.payoutBankRows = Array.isArray(snapshot.bankRows)
        ? bankRowsForPayoutWindows(snapshot.bankRows, snapshot.payouts)
        : [];
    }

    if (needs.has("commerceHealth")) snapshot.commerceHealth = await loadCommerceHealth(companyId);
    if (needs.has("review")) {
      const { queue, held, capped } = await loadReview(companyId);
      snapshot.reviewQueue = queue;
      snapshot.heldOrders = held;
      snapshot.reviewCapped = capped;
    }
    if (needs.has("accounting")) {
      const attention = await loadAccountingAttention(companyId);
      snapshot.accountingAttention = attention.rows;
      snapshot.attentionCapped = attention.capped;
      // The readiness figure is measured against this map; the accounting
      // reader is the only caller allowed to see it, and the only one that
      // reports readiness.
      snapshot.categoryMappings = ctx && ctx.accountingReader ? await loadCategoryMappings(companyId) : null;
    }

    return snapshot;
  }

  return { CAPS, DOMAINS, loadCompany, snapshotFor, bankRowsForPayoutWindows };
}

module.exports = { createLoaders, CAPS, DOMAINS, readableDomain, piiBlockRows, projectCommerceConnection, projectOrderForAssistant, projectBankRow };
