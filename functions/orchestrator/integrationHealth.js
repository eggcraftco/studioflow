"use strict";

/**
 * get_integration_health (§11) — "is anything wrong with my connections?"
 *
 * Three things this module refuses to do, each because the honest answer is
 * different from the convenient one:
 *
 *  - **Etsy's freshness does not come from `commerceHealth`.** Etsy never writes
 *    that document, so `healthView` reports "never" for a connector that is
 *    syncing perfectly well. Its freshness comes from the connection document's
 *    own `lastSuccessAtMs`, and pairing the two is mandatory.
 *  - **Amazon's status is `not_visible`, not `disconnected`.** The connection
 *    lives in the hardened `nivadesk-amazon` project and is readable only as
 *    `amazon-caller@`, which this function is not. A status nobody can read is
 *    not a status of "broken" — and it does not make the Amazon SALES invisible
 *    either: the commerce capability still counts those orders.
 *  - **No token, ever.** The loader projects connection documents down to the
 *    fields their own `publicView` helpers expose, and nothing here reads a
 *    field whose name looks like a credential.
 */

const envelope = require("./envelope");
const freshness = require("./freshness");
const health = require("../commerce/health");
const channelModule = require("./channel");
const untrusted = require("./untrusted");

/**
 * A connection's ACCOUNT is the shop's own name for itself — a Shopify store
 * name, a WooCommerce site URL, a bank's institution name, a QuickBooks company
 * name. All four are chosen outside NivaDesk, and this row goes into `data`,
 * which a model reads exactly the way it reads a summary line, so the same
 * bound applies here as everywhere else (untrusted.js). 80 characters, the same
 * bound `envelope.entityRef` puts on a label, since that is what this becomes.
 */
const accountLabel = (value) => untrusted.safeText(value, { max: 80 });

/** A provider key written by a bank or accounting document rather than by us. */
const providerKey = (value, fallback) => untrusted.safeText(value, { max: 40 }) || fallback;

const AUTH_STATUSES = Object.freeze(["ok", "reconnect_required", "pending", "disconnected", "not_visible"]);

const RECONNECT_STATUSES = new Set([
  "reconnect_required", "needs_reconnect", "needsreauth", "uninstalled", "revoked", "invalid_grant"
]);

function authStatusOf(connection) {
  const raw = String((connection || {}).status || "").toLowerCase();
  if (!raw) return "pending";
  if (RECONNECT_STATUSES.has(raw)) return "reconnect_required";
  if (raw === "disconnected") return "disconnected";
  if (raw === "pending") return "pending";
  if (raw === "connected" || raw === "linked" || raw === "active" || raw === "ok") return "ok";
  return "pending";
}

/** read_only / limited / full, from what the provider's capability registry says. */
function modeOf(provider, connection) {
  const caps = require("../commerce/capabilities").getCapabilities(provider) || {};
  const writes = Object.values(caps).some((entry) => entry && entry.write === true);
  if (String((connection || {}).mode || "") === "read_only") return "read_only";
  if (!writes) return "read_only";
  const scopes = Array.isArray((connection || {}).scopes) ? connection.scopes : [];
  return scopes.length > 0 ? "full" : "limited";
}

function healthRowFor(snapshot, provider, connectionId) {
  const rows = Array.isArray(snapshot.commerceHealth) ? snapshot.commerceHealth : [];
  return rows.find((row) => String(row.provider || "") === provider
    && (!connectionId || String(row.connectionId || "") === String(connectionId))) || null;
}

function freshnessBlock(entityView, { fallbackMs = 0, nowMs, kind = "commerce" }) {
  const staleAfterMs = freshness.STALE_AFTER_MS[kind];
  if (entityView && entityView.state === "unsupported") return { state: "unsupported", lastSuccessAt: null, lagMs: null, staleAfterMs: null };
  const last = Number((entityView || {}).lastSuccessAtMs || 0) || Number(fallbackMs || 0);
  if (!last) return { state: "never", lastSuccessAt: null, lagMs: null, staleAfterMs };
  const lagMs = Math.max(0, nowMs - last);
  return {
    state: lagMs > staleAfterMs ? "stale" : "fresh",
    lastSuccessAt: new Date(last).toISOString(),
    lagMs,
    staleAfterMs
  };
}

const heldProviderOf = (row) => String((row || {}).provider || "").toLowerCase();

/**
 * The review counts for one connection.
 *
 * `held` used to be non-zero only for providers "manual" and "inbound", and
 * this function is never called with either: the commerce loop covers
 * shopify/woocommerce/etsy/square, Amazon passes "amazon", and the eBay row
 * hardcodes zero. So `heldIntegrationOrders` — up to 200 documents, read on
 * every call because this capability declares the "review" domain — could not
 * reach the answer at all, while the tool description promises "orders held for
 * review". The documents carry their own `provider` (holdIntegrationOrder
 * writes it), so they are attributed by it; the ones belonging to no connection
 * row are counted at the top of the answer rather than dropped.
 */
function reviewCountsFor(snapshot, provider, connectionId) {
  const queue = (snapshot.reviewQueue || []).filter((row) => String(row.provider || "") === provider
    && (!connectionId || !row.connectionId || String(row.connectionId) === String(connectionId)));
  const wanted = String(provider || "").toLowerCase();
  const held = (snapshot.heldOrders || []).filter((row) => heldProviderOf(row) === wanted);
  return { queue: queue.length, held: held.length };
}

function integrationHealth(snapshot, args = {}, ctx = {}, { nowMs = Date.now() } = {}) {
  const wanted = String(args.provider || "").toLowerCase();
  // `heldForReview.total` is stated as a headline number over a read that is
  // capped at 200 documents. If that read was cut off, the number is a floor
  // and the answer has to say so.
  const warnings = [...envelope.capWarnings(snapshot)];
  const rows = [];
  const sources = [];
  const connections = snapshot.connections || {};

  const commerceProviders = ["shopify", "woocommerce", "etsy", "square"];
  for (const provider of commerceProviders) {
    if (wanted && wanted !== provider) continue;
    const list = Array.isArray(connections[provider]) ? connections[provider] : [];
    if (list.length === 0) {
      rows.push({
        provider,
        connectionId: null,
        account: null,
        // A channel this workspace has never connected. The row exists so the
        // reader can see it was considered; it is not a connection, and
        // `connectionKnown` is what keeps it out of the headline count.
        connectionKnown: false,
        authStatus: "disconnected",
        availability: channelModule.channelAvailability(provider, { hasOrders: false, connection: null }),
        ordersFreshness: { state: "never", lastSuccessAt: null, lagMs: null, staleAfterMs: freshness.STALE_AFTER_MS.commerce },
        inventoryFreshness: { state: "unsupported", lastSuccessAt: null, lagMs: null, staleAfterMs: null },
        financeFreshness: { state: "unsupported", lastSuccessAt: null, lagMs: null, staleAfterMs: null },
        retries: 0,
        deadLetters: 0,
        reviewCount: { queue: 0, held: 0 },
        lastSuccessfulSync: null,
        reconnectRequired: false,
        mode: modeOf(provider, null)
      });
      continue;
    }
    for (const connection of list) {
      const healthDoc = healthRowFor(snapshot, provider, connection.id);
      const view = healthDoc ? health.healthView(healthDoc.doc || healthDoc, provider, { now: nowMs, staleAfterMs: freshness.STALE_AFTER_MS.commerce }) : {};
      // Etsy writes no commerceHealth document; its own connection carries the
      // last success, and without this fallback a working Etsy sync reports
      // "never".
      const fallbackMs = Number(connection.lastSuccessAtMs || connection.lastSyncAtMs || 0);
      const ordersFreshness = freshnessBlock(view.orders, { fallbackMs, nowMs });
      const authStatus = authStatusOf(connection);
      rows.push({
        provider,
        connectionId: String(connection.id || ""),
        account: accountLabel(connection.account || connection.storeName || connection.shopName || connection.siteUrl || connection.host || ""),
        connectionKnown: true,
        authStatus,
        availability: channelModule.channelAvailability(provider, { hasOrders: true, connection }),
        ordersFreshness,
        inventoryFreshness: freshnessBlock(view.inventory, { fallbackMs: 0, nowMs }),
        financeFreshness: freshnessBlock(view.finance, { fallbackMs: 0, nowMs }),
        retries: Number((view.orders || {}).pendingRetries || 0),
        deadLetters: Number((view.orders || {}).deadLetters || 0),
        reviewCount: reviewCountsFor(snapshot, provider, connection.id),
        lastSuccessfulSync: ordersFreshness.lastSuccessAt,
        reconnectRequired: authStatus === "reconnect_required",
        mode: modeOf(provider, connection)
      });
      sources.push(freshness.sourceRow({
        provider,
        connectionId: connection.id,
        entity: "orders",
        kind: "commerce",
        lastSuccessAtMs: Number((view.orders || {}).lastSuccessAtMs || fallbackMs || 0),
        contributed: true,
        nowMs
      }));
      if (authStatus === "reconnect_required") {
        warnings.push(envelope.warning("channel_excluded_auth", `${provider} needs reconnecting before it can sync again.`, { channel: provider, connectionId: connection.id }));
      }
    }
  }

  // Amazon: orders arrive, the connection status does not.
  if (!wanted || wanted === "amazon") {
    const hasAmazonOrders = (snapshot.orders || []).some((order) => String((order.commerce || {}).provider || "").toLowerCase() === "amazon");
    rows.push({
      provider: "amazon",
      connectionId: null,
      account: null,
      // The connection document is in the hardened project and cannot be read
      // from here, so its orders are the only evidence that it exists. No
      // orders is no evidence, and an assumed Amazon connection would be one
      // more imaginary connection in the count.
      connectionKnown: hasAmazonOrders,
      authStatus: "not_visible",
      availability: channelModule.channelAvailability("amazon", { hasOrders: hasAmazonOrders, connection: null }),
      ordersFreshness: { state: hasAmazonOrders ? "not_visible" : "never", lastSuccessAt: null, lagMs: null, staleAfterMs: freshness.STALE_AFTER_MS.commerce },
      inventoryFreshness: { state: "unsupported", lastSuccessAt: null, lagMs: null, staleAfterMs: null },
      financeFreshness: { state: "not_visible", lastSuccessAt: null, lagMs: null, staleAfterMs: null },
      retries: 0,
      deadLetters: 0,
      reviewCount: reviewCountsFor(snapshot, "amazon", null),
      lastSuccessfulSync: null,
      reconnectRequired: false,
      mode: "read_only"
    });
    warnings.push(envelope.warning(
      "status_not_visible_from_this_surface",
      "Amazon's connection status lives in a separate hardened project this connection cannot read. Amazon orders already in NivaDesk are still counted.",
      { channel: "amazon" }
    ));
  }

  // eBay: adapter code, no runtime.
  if (!wanted || wanted === "ebay") {
    const hasEbayOrders = (snapshot.orders || []).some((order) => String((order.commerce || {}).provider || "").toLowerCase() === "ebay");
    rows.push({
      provider: "ebay",
      connectionId: null,
      account: null,
      // Adapter code with no runtime: there is no eBay connection to have.
      connectionKnown: false,
      authStatus: "disconnected",
      availability: hasEbayOrders ? "data_only" : "adapter_only",
      ordersFreshness: { state: "never", lastSuccessAt: null, lagMs: null, staleAfterMs: freshness.STALE_AFTER_MS.commerce },
      inventoryFreshness: { state: "unsupported", lastSuccessAt: null, lagMs: null, staleAfterMs: null },
      financeFreshness: { state: "unsupported", lastSuccessAt: null, lagMs: null, staleAfterMs: null },
      retries: 0,
      deadLetters: 0,
      // Counted, not hardcoded — like the Amazon row above it. A held order
      // carrying provider "ebay" lands in `heldForReview.total`, and
      // `reportedProviders` is built from these rows, so "ebay" is in it and
      // the order counts as attributed: total 1, unattributed 0, and with a
      // hardcoded zero here, no row showing it. That is the exact shape of the
      // defect finding 8 was written about, one provider along. Not reachable
      // today (holdIntegrationOrder writes shopify, woocommerce and inbound,
      // and there is no eBay connector), which is why it is a trap laid for
      // the connector rather than a fact about it.
      reviewCount: reviewCountsFor(snapshot, "ebay", null),
      lastSuccessfulSync: null,
      reconnectRequired: false,
      mode: "read_only"
    });
    if (!hasEbayOrders) {
      warnings.push(envelope.warning("channel_adapter_only", "eBay has adapter code but no live connector yet, so there is nothing to report on it.", { channel: "ebay" }));
    }
  }

  // Banking and accounting rows are permission-gated separately from commerce.
  if (ctx.areas && ctx.areas.bankFeed) {
    for (const connection of (connections.bank || [])) {
      const syncState = String(connection.syncState || "");
      rows.push({
        provider: providerKey(connection.provider, "bank"),
        connectionId: String(connection.id || ""),
        account: accountLabel(connection.institutionName || connection.accountLabel || ""),
        connectionKnown: true,
        authStatus: ["needs_reconsent", "disconnected"].includes(syncState) ? "reconnect_required" : (syncState === "error" ? "pending" : "ok"),
        availability: "connected",
        ordersFreshness: { state: "unsupported", lastSuccessAt: null, lagMs: null, staleAfterMs: null },
        inventoryFreshness: { state: "unsupported", lastSuccessAt: null, lagMs: null, staleAfterMs: null },
        financeFreshness: freshnessBlock(null, { fallbackMs: Number(connection.lastSyncedAtMs || 0), nowMs, kind: "bank" }),
        retries: Number(connection.syncFailures || 0),
        deadLetters: 0,
        reviewCount: { queue: 0, held: 0 },
        lastSuccessfulSync: connection.lastSyncedAtMs ? new Date(Number(connection.lastSyncedAtMs)).toISOString() : null,
        reconnectRequired: ["needs_reconsent", "disconnected"].includes(syncState),
        mode: "read_only"
      });
      sources.push(freshness.sourceRow({
        provider: String(connection.provider || "bank"),
        connectionId: connection.id,
        entity: "finance",
        kind: "bank",
        lastSuccessAtMs: Number(connection.lastSyncedAtMs || 0),
        contributed: true,
        nowMs
      }));
    }
  } else {
    warnings.push(envelope.warning("section_not_permitted", "Bank connections are not included for your role.", { section: "banking" }));
  }

  if (ctx.accountingReader) {
    for (const connection of (connections.accounting || [])) {
      rows.push({
        provider: providerKey(connection.provider, "accounting"),
        connectionId: String(connection.id || ""),
        account: accountLabel(connection.companyName || connection.realmName || ""),
        connectionKnown: true,
        authStatus: authStatusOf(connection),
        availability: "connected",
        ordersFreshness: { state: "unsupported", lastSuccessAt: null, lagMs: null, staleAfterMs: null },
        inventoryFreshness: { state: "unsupported", lastSuccessAt: null, lagMs: null, staleAfterMs: null },
        financeFreshness: freshnessBlock(null, { fallbackMs: Number(connection.lastSyncAtMs || 0), nowMs, kind: "accounting" }),
        retries: 0,
        deadLetters: 0,
        reviewCount: { queue: 0, held: 0 },
        lastSuccessfulSync: connection.lastSyncAtMs ? new Date(Number(connection.lastSyncAtMs)).toISOString() : null,
        reconnectRequired: authStatusOf(connection) === "reconnect_required",
        mode: String(connection.mode || "read_only")
      });
    }
  } else {
    warnings.push(envelope.warning("section_not_permitted", "Accounting connections are not included for your role.", { section: "accounting" }));
  }

  // The headline number counts CONNECTIONS, not rows. Four commerce providers
  // with no connection, plus the Amazon and eBay rows, are six rows on a
  // workspace that has connected nothing — and "6 connection(s) checked; 0 need
  // reconnecting" is a summary of six connections that do not exist. The
  // per-row availability words were always honest; the count was not.
  //
  // `considered` keeps what the old number was actually measuring: how many
  // channels this answer looked at. Both are reported, because they answer two
  // different questions.
  const connected = rows.filter((row) => row.connectionKnown === true);

  // Orders parked by the plan-limit gate, which the loader reads for this
  // capability and which had no way into the answer. Some belong to a provider
  // with a row (shopify, woocommerce); the generic inbound path has no
  // connection to attribute them to, and those are real held sales too — so
  // they are counted here rather than dropped.
  const heldRows = (snapshot.heldOrders || []).filter((row) => !wanted || heldProviderOf(row) === wanted);
  const reportedProviders = new Set(rows.map((row) => String(row.provider || "").toLowerCase()));
  const heldForReview = {
    total: heldRows.length,
    unattributed: heldRows.filter((row) => !reportedProviders.has(heldProviderOf(row))).length
  };

  return {
    data: {
      connections: rows,
      count: connected.length,
      considered: rows.length,
      needsReconnect: rows.filter((row) => row.reconnectRequired).length,
      heldForReview
    },
    warnings,
    sources,
    entityRefs: rows.filter((row) => row.connectionId).slice(0, 20)
      .map((row) => envelope.entityRef("connection", row.connectionId, `${row.provider} ${row.account || ""}`.trim()))
  };
}

module.exports = { AUTH_STATUSES, authStatusOf, modeOf, integrationHealth };
