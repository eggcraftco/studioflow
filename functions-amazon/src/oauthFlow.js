"use strict";

// Connecting a workspace to Amazon: two browser-facing handlers.
//
//   /oauth/start?intent=…   verifies the intent the main project minted,
//                           records a pending connection, sends the seller
//                           to Login with Amazon.
//   /oauth/callback?…       matches Amazon's redirect to the pending
//                           connection by `state`, exchanges the code, stores
//                           the refresh token in Secret Manager, discovers the
//                           marketplaces, and sends the browser back to the
//                           main app with a status word — never a token, never
//                           an error detail.
//
// Handlers are framework-free: they take a small request object and return
// {status, headers, body}, so server.js renders them and the suite calls them
// directly.

const { verifyIntent, stateFor } = require("./intent");
const lwa = require("./amazon/oauth");
const { createAmazonClient } = require("./amazon/client");

const REDIRECT = (location) => ({ status: 302, headers: { Location: location, "Cache-Control": "no-store" }, body: "" });

function createOauthFlow({ config, connections, egress, now = () => Date.now(), logger = console, clientFactory = createAmazonClient }) {
  const key = config.intentHmacKey;
  if (!key) throw new Error("oauthFlow: intent key missing");

  function backToApp(params) {
    const url = new URL(config.mainAppReturnUrl);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    return url.toString();
  }

  async function start(req) {
    const token = String((req.query && req.query.intent) || "");
    const result = verifyIntent(token, { key, now, seenNonce: () => false });
    if (!result.ok) {
      logger.warn(`oauth/start refused: ${result.reason}`);
      return { status: 400, headers: { "Content-Type": "text/plain" }, body: "This connection link is not valid. Please start again from NivaDesk." };
    }
    // Single use: the nonce is claimed with create(), so a second browser
    // carrying the same link loses.
    const claimed = await connections.recordNonce(result.payload.nonce, { companyId: result.payload.companyId });
    if (!claimed) {
      logger.warn("oauth/start refused: replayed");
      return { status: 400, headers: { "Content-Type": "text/plain" }, body: "This connection link has already been used." };
    }
    const state = stateFor(result.payload.nonce, key);
    await connections.createPending({ companyId: result.payload.companyId, ownerUid: result.payload.ownerUid, nonce: result.payload.nonce, state });
    return REDIRECT(lwa.consentUrl({
      sellerCentralHost: config.sellerCentralHost,
      applicationId: config.spApiApplicationId,
      state,
      draft: config.draftApplication
    }));
  }

  async function callback(req) {
    const q = req.query || {};
    const state = String(q.state || "");
    const code = String(q.spapi_oauth_code || "");
    const sellerId = String(q.selling_partner_id || "");

    const pending = state ? await connections.findPendingByState(state, config.pendingConnectionTtlMs) : null;
    if (!pending) {
      logger.warn("oauth/callback refused: unknown or expired state");
      return REDIRECT(backToApp({ amazon: "error", reason: "state" }));
    }
    if (!code) {
      await connections.discardPending(pending.id);
      return REDIRECT(backToApp({ amazon: "error", reason: "denied" }));
    }

    let tokens;
    try {
      tokens = await lwa.exchangeAuthorizationCode({
        code, clientId: config.lwaClientId, clientSecret: config.lwaClientSecret,
        redirectUri: config.redirectUri, fetchImpl: egress.fetch
      });
    } catch (error) {
      logger.warn(`oauth/callback exchange failed: ${String(error && error.code || error && error.message || "").slice(0, 60)}`);
      await connections.discardPending(pending.id);
      return REDIRECT(backToApp({ amazon: "error", reason: "exchange" }));
    }

    // Marketplace discovery with the access token we just got and will not keep.
    let marketplaces = [];
    try {
      const client = clientFactory({ region: config.defaultRegion, accessToken: tokens.accessToken, fetchImpl: egress.fetch });
      marketplaces = (await client.getMarketplaceParticipations()).filter((m) => m.participating);
    } catch (error) {
      logger.warn(`oauth/callback discovery failed: ${String(error && error.code || error && error.message || "").slice(0, 60)}`);
      // Not fatal: the connection is real; the sync will retry discovery.
    }

    const connectionId = await connections.activate({
      pendingId: pending.id, companyId: pending.companyId, ownerUid: pending.ownerUid,
      sellerId, marketplaces, refreshToken: tokens.refreshToken
    });
    logger.log(`oauth/callback connected company=${pending.companyId} marketplaces=${marketplaces.length}`);
    return REDIRECT(backToApp({ amazon: "connected", connection: connectionId }));
  }

  return { start, callback };
}

module.exports = { createOauthFlow };
