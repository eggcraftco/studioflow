"use strict";

// The main project's half of the Amazon bridge.
//
// Three things cross the boundary, each in one direction, each with one
// identity:
//
//   ingestAmazonEnvelope   ← amazon-sync@nivadesk-amazon, carrying a sanitized
//                            envelope. Verified by OIDC against that exact
//                            email and this function's URL as audience, then
//                            validated against the allowlist contract before a
//                            byte of it is believed, then normalised by the
//                            existing adapter and handed to the commerce engine.
//   amazonConnectStart     → mints the signed connect intent a workspace owner
//                            carries to the Amazon zone's /oauth/start.
//   amazonStatus/Disconnect → calls the zone's /admin/* as amazon-caller@.
//
// Every dependency is injected; index.js does the wiring.

const { validateSafeEnvelope } = require("./envelope");
const { mintIntent } = require("./intent");
const { splitAmazonOrder, scanForPii } = require("./sanitize");
const { normalizeAmazonOrder } = require("../adapters/amazon");
const { idempotencyKey } = require("../events");

const SYNC_IDENTITY = "amazon-sync@nivadesk-amazon.iam.gserviceaccount.com";
const OAUTH_START_URL = "https://amazon.nivadesk.app/oauth/start";
const ADMIN_BASE_URL = "https://amazon.nivadesk.app/admin";

function json(status, body) { return { status, body }; }

/**
 * The inbound side. `verifyIdToken(token)` resolves to the token's payload
 * or throws; `applyEnvelope(db, envelope, ctx)` is the commerce engine;
 * `normalize(order, ctx)` is the Amazon adapter; `contextFor(companyId)`
 * resolves the workspace's settings into engine context.
 */
function createAmazonIngest({
  db,
  applyEnvelope,
  normalize = normalizeAmazonOrder,
  contextFor,
  verifyIdToken,
  audience,
  allowedEmail = SYNC_IDENTITY,
  now = () => Date.now(),
  logger = console
}) {
  if (!audience) throw new Error("amazon ingest: audience required");
  const email = String(allowedEmail).toLowerCase();

  async function authenticate(headers = {}) {
    const header = String(headers.authorization || headers.Authorization || "");
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    if (!match) return { ok: false, reason: "no_bearer" };
    let payload;
    try { payload = await verifyIdToken(match[1]); } catch { return { ok: false, reason: "invalid_token" }; }
    if (!payload || payload.email_verified !== true || String(payload.email || "").toLowerCase() !== email) return { ok: false, reason: "wrong_identity" };
    if (String(payload.aud || "") !== audience) return { ok: false, reason: "wrong_audience" };
    return { ok: true };
  }

  async function ingest(body, headers) {
    const auth = await authenticate(headers);
    if (!auth.ok) {
      logger.warn(`ingestAmazonEnvelope refused: ${auth.reason}`);
      return json(403, { error: "forbidden" });
    }

    const { ok, violations } = validateSafeEnvelope(body);
    if (!ok) {
      // Paths only. The values are the thing we are refusing.
      logger.error(`ingestAmazonEnvelope refused an unsafe envelope: ${violations.slice(0, 5).join("; ")}`);
      return json(422, { error: "unsafe_envelope", violations: violations.slice(0, 20) });
    }

    // The allowlist has already refused every field known to carry a person.
    // The split runs anyway: the rule that nothing reaches the adapter except
    // through it holds on both sides of the boundary. Anything the scan still
    // finds under a name neither layer knows is refused outright.
    const { safe, restricted, removed } = splitAmazonOrder(body.order, body.items);
    const leftovers = scanForPii(safe);
    if (leftovers.length) {
      logger.error(`ingestAmazonEnvelope refused a personal field neither layer knew: ${leftovers.slice(0, 5).join("; ")}`);
      return json(422, { error: "unsafe_envelope", violations: leftovers.slice(0, 20) });
    }

    const companyId = String(body.companyId);
    const ctxBase = await contextFor(companyId);
    if (!ctxBase) return json(404, { error: "unknown_workspace" });

    // Access control policy §5: a marketplace buyer's details live ONLY in the
    // server-only restrictedCustomer document, never on the order. In phase A1
    // this branch is unreachable — BUYER and RECIPIENT are never requested and
    // the allowlist refuses their fields before this line — but the day a later
    // phase admits them, this is where they go, and the order document is not.
    if (Object.keys(restricted).length) {
      const orderId = ctxBase.orderIdFor({ identity: { external_id: String(safe.order.AmazonOrderId) } });
      await db.collection("companies").doc(companyId).collection("restrictedCustomer").doc(orderId).set({
        provider: "amazon", connectionId: String(body.connectionId), fields: restricted, paths: removed, updatedAtMs: now()
      }, { merge: true });
      logger.warn(`ingestAmazonEnvelope diverted ${removed.length} personal field(s) to restrictedCustomer for ${orderId}`);
    }

    const envelope = normalize(safe.order, {
      items: safe.items,
      connectionId: body.connectionId,
      marketplaceId: body.marketplaceId,
      eventOrigin: "provider",
      taxKnown: body.taxKnown === true
    });
    const eventKey = idempotencyKey({
      provider: "amazon", connectionId: body.connectionId, entityType: "order",
      externalId: String(body.order.AmazonOrderId), eventType: String(body.order.LastUpdateDate || "")
    });
    const outcome = await applyEnvelope(db, envelope, { ...ctxBase, companyId, source: "amazon", mode: "apply", eventKey, now: now() });
    logger.log(`ingestAmazonEnvelope company=${companyId} connection=${body.connectionId} result=${outcome && outcome.result}`);
    return json(200, { ok: true, result: outcome && outcome.result, reason: outcome && outcome.reason });
  }

  return { ingest, authenticate };
}

/** The outbound intent: minted for the owner who clicked Connect, ten minutes, single use. */
function createAmazonConnect({ hmacKeyHex, now = () => Date.now(), startUrl = OAUTH_START_URL }) {
  const hex = String(hmacKeyHex || "").trim();
  if (!/^[0-9a-f]{64,}$/i.test(hex)) throw new Error("amazon connect: signing key must be hex, at least 32 bytes");
  const key = Buffer.from(hex, "hex");
  return {
    startUrlFor({ companyId, ownerUid }) {
      const intent = mintIntent({ companyId, ownerUid, key, now });
      return `${startUrl}?intent=${encodeURIComponent(intent)}`;
    }
  };
}

/** The outbound admin calls, as amazon-caller@ (the function runs as that account). */
function createAmazonAdminClient({ identityToken, fetchImpl = globalThis.fetch, baseUrl = ADMIN_BASE_URL, timeoutMs = 15000 }) {
  async function call(method, path, body) {
    const bearer = await identityToken();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${baseUrl}${path}`, {
        method, headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined, signal: controller.signal
      });
      let data = {};
      try { data = await response.json(); } catch { data = {}; }
      return { status: response.status, data };
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    status: (companyId) => call("GET", `/status?companyId=${encodeURIComponent(companyId)}`),
    disconnect: (companyId, connectionId) => call("POST", "/disconnect", { companyId, connectionId })
  };
}

module.exports = { createAmazonIngest, createAmazonConnect, createAmazonAdminClient, SYNC_IDENTITY, OAUTH_START_URL, ADMIN_BASE_URL };
