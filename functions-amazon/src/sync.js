"use strict";

// The sync: every active connection, every 30 minutes, orders changed since
// the last look, split, enveloped, sent.
//
// Per connection, and every step fails on its own: one seller's revoked
// consent does not stop the next seller's sync, and one order the main project
// refuses does not stop the next order. The access token is fetched from the
// refresh token, used, and dropped — it is never stored and never logged.
//
// What is stored here is the SAFE half only. If the split finds anything
// personal — which in A1 it never should, because BUYER and RECIPIENT are not
// requested — the paths are logged as an anomaly and the values go nowhere.

const lwa = require("./amazon/oauth");
const { createAmazonClient, AmazonApiError } = require("./amazon/client");
const { splitAmazonOrder, scanForPii, taxIsKnown, INCLUDED_DATA_A1 } = require("./amazon/sanitize");
const { buildSafeEnvelope } = require("./envelope");

function createSync({ config, connections, egress, bridge, now = () => Date.now(), logger = console, clientFactory = createAmazonClient }) {
  const overlapMs = config.syncOverlapMinutes * 60 * 1000;

  async function syncConnection(connection) {
    const counts = { orders: 0, sent: 0, refused: 0, anomalies: 0, errors: 0 };
    const startedAt = now();

    let accessToken;
    try {
      const refreshToken = await connections.refreshTokenFor(connection.id);
      accessToken = (await lwa.accessTokenFromRefresh({
        refreshToken, clientId: config.lwaClientId, clientSecret: config.lwaClientSecret, fetchImpl: egress.fetch
      })).accessToken;
    } catch (error) {
      const cls = String(error && error.errorClass || "");
      if (cls === "auth") {
        await connections.markNeedsReauth(connection.id, String(error.code || "lwa_auth"));
        logger.warn(`sync connection=${connection.id} needs re-authorisation`);
      } else {
        logger.warn(`sync connection=${connection.id} token failed (${String(error && error.message || "").slice(0, 60)})`);
      }
      counts.errors += 1;
      return counts;
    }

    const marketplaces = (connection.marketplaces || []).filter((m) => m.participating !== false).map((m) => m.marketplaceId).filter(Boolean);
    if (!marketplaces.length) {
      logger.warn(`sync connection=${connection.id} has no marketplaces; skipping`);
      return counts;
    }
    const client = clientFactory({ marketplaceId: marketplaces[0], accessToken, fetchImpl: egress.fetch });

    const since = Math.max(0, (Number(connection.cursorMs) || 0) - overlapMs);
    // Amazon requires LastUpdatedAfter at least two minutes in the past.
    const until = now() - 2 * 60 * 1000;
    const lastUpdatedAfter = new Date(since || (until - 24 * 3600 * 1000)).toISOString();
    const lastUpdatedBefore = new Date(until).toISOString();
    let newestMs = Number(connection.cursorMs) || 0;
    let nextToken = null;

    do {
      let page;
      try {
        page = await client.searchOrders({ marketplaceIds: marketplaces, lastUpdatedAfter, lastUpdatedBefore, nextToken, includedData: INCLUDED_DATA_A1 });
      } catch (error) {
        counts.errors += 1;
        if (error instanceof AmazonApiError && error.errorClass === "auth") await connections.markNeedsReauth(connection.id, "sp_api_401");
        logger.warn(`sync connection=${connection.id} orders failed (${String(error && error.message || "").slice(0, 60)})`);
        break;
      }
      for (const rawOrder of page.orders) {
        if (counts.orders >= config.syncMaxOrdersPerRun) { nextToken = null; break; }
        counts.orders += 1;
        const amazonOrderId = String(rawOrder && rawOrder.AmazonOrderId || "");
        let rawItems = [];
        try {
          let itemsToken = null;
          do {
            const itemsPage = await client.getOrderItems(amazonOrderId, { nextToken: itemsToken });
            rawItems = rawItems.concat(itemsPage.items);
            itemsToken = itemsPage.nextToken;
          } while (itemsToken);
        } catch (error) {
          counts.errors += 1;
          logger.warn(`sync connection=${connection.id} items failed (${String(error && error.message || "").slice(0, 60)})`);
          continue;
        }

        const { safe, removed } = splitAmazonOrder(rawOrder, rawItems);
        const leftovers = scanForPii(safe);
        if (removed.length || leftovers.length) {
          // A1 asked for no person. Paths only, never values.
          counts.anomalies += 1;
          logger.error(`sync anomaly connection=${connection.id}: personal fields in an A1 response removed=${removed.length} leftover=${leftovers.length} paths=${[...removed, ...leftovers].slice(0, 8).join(",")}`);
          if (leftovers.length) continue;   // the split missed something: do not store, do not send
        }

        let envelope;
        try {
          envelope = buildSafeEnvelope({
            connectionId: connection.id, companyId: connection.companyId,
            marketplaceId: safe.order.MarketplaceId || marketplaces[0], syncedAtMs: now(),
            safe, removed, taxKnown: taxIsKnown(INCLUDED_DATA_A1)
          });
        } catch (error) {
          counts.refused += 1;
          logger.error(`sync connection=${connection.id}: envelope refused before sending (${String(error && error.message || "").slice(0, 120)})`);
          continue;
        }

        const delivery = await bridge(envelope);
        if (delivery.ok) {
          counts.sent += 1;
          await connections.saveSafeOrder(connection.id, safe.order, safe.items);
          const updated = Date.parse(String(rawOrder.LastUpdateDate || ""));
          if (Number.isFinite(updated) && updated > newestMs) newestMs = updated;
        } else {
          counts.refused += 1;
        }
      }
      nextToken = page.nextToken;
    } while (nextToken);

    // The cursor moves only as far as what was delivered; a refused order is
    // seen again next run.
    await connections.markSynced(connection.id, { cursorMs: counts.refused ? Number(connection.cursorMs) || 0 : newestMs, orders: counts.orders, errors: counts.errors });
    logger.log(`sync connection=${connection.id} orders=${counts.orders} sent=${counts.sent} refused=${counts.refused} anomalies=${counts.anomalies} errors=${counts.errors} ms=${now() - startedAt}`);
    return counts;
  }

  async function runOnce() {
    const totals = { connections: 0, orders: 0, sent: 0, refused: 0, anomalies: 0, errors: 0, sweptOrders: 0 };
    const active = await connections.listActive();
    for (const connection of active) {
      if (connection.needsReauth) continue;
      totals.connections += 1;
      try {
        const c = await syncConnection(connection);
        for (const k of ["orders", "sent", "refused", "anomalies", "errors"]) totals[k] += c[k];
      } catch (error) {
        totals.errors += 1;
        logger.error(`sync connection=${connection.id} crashed (${String(error && error.message || "").slice(0, 120)})`);
      }
    }
    try {
      totals.sweptOrders = (await connections.sweepOrders({ retentionDays: config.orderRetentionDays })).deleted;
    } catch (error) {
      logger.warn(`sync retention sweep failed (${String(error && error.message || "").slice(0, 80)})`);
    }
    logger.log(`sync run ${JSON.stringify(totals)}`);
    return totals;
  }

  return { runOnce, syncConnection };
}

module.exports = { createSync };
