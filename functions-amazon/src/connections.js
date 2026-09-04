"use strict";

// Connections, and the one secret each one owns.
//
// A connection document says which workspace consented, to which seller, for
// which marketplaces, and when. It never contains a token. The refresh token
// lives in Secret Manager as `amazon-refresh-<connectionId>`, read at use by
// the sync service and destroyed on disconnect. The access token that comes
// from it lasts an hour and is never written anywhere.
//
// Amazon Information stored here is the sanitizer's SAFE half only. Phase A1
// asks Amazon for no buyer or recipient data, so there is nothing personal to
// store; if a response carried some anyway, the split removes it and the sync
// logs the paths — never the values — as an anomaly.
//
// Firestore and Secret Manager are injected, so the suite drives this with
// fakes and the emulator drives it with the real Firestore.

const crypto = require("crypto");

const CONNECTIONS = "connections";
const PENDING = "pendingConnections";
const NONCES = "intentNonces";
const ORDERS = "orders";

const secretNameFor = (connectionId) => `amazon-refresh-${String(connectionId).replace(/[^A-Za-z0-9_-]/g, "")}`;

function createConnections({ admin, secrets, projectId, region = "europe-west2", now = () => Date.now(), logger = console }) {
  const db = () => admin.firestore();
  const parent = `projects/${projectId}`;

  // ── the connect flow ──────────────────────────────────────────────────

  async function nonceSeen(nonce) {
    const snap = await db().collection(NONCES).doc(String(nonce)).get();
    return Boolean(snap.exists);
  }

  /** Records a nonce as used. create() so that two racing starts cannot both win. */
  async function recordNonce(nonce, meta = {}) {
    try {
      await db().collection(NONCES).doc(String(nonce)).create({ usedAtMs: now(), ...meta });
      return true;
    } catch {
      return false;
    }
  }

  async function createPending({ companyId, ownerUid, nonce, state }) {
    const id = crypto.randomBytes(12).toString("hex");
    await db().collection(PENDING).doc(id).set({
      companyId: String(companyId), ownerUid: String(ownerUid), nonce: String(nonce), state: String(state),
      createdAtMs: now()
    });
    return id;
  }

  async function findPendingByState(state, ttlMs) {
    const snap = await db().collection(PENDING).where("state", "==", String(state || "")).limit(1).get();
    if (snap.empty) return null;
    const doc = snap.docs[0];
    const data = doc.data() || {};
    if (now() - (Number(data.createdAtMs) || 0) > ttlMs) return null;
    return { id: doc.id, ...data };
  }

  async function discardPending(id) {
    await db().collection(PENDING).doc(String(id)).delete().catch(() => undefined);
  }

  // ── the refresh token ────────────────────────────────────────────────

  async function storeRefreshToken(connectionId, refreshToken) {
    const secretId = secretNameFor(connectionId);
    const name = `${parent}/secrets/${secretId}`;
    try {
      await secrets.createSecret({
        parent, secretId,
        secret: { replication: { userManaged: { replicas: [{ location: region }] } }, labels: { boundary: "amazon", kind: "refresh-token" } }
      });
    } catch (error) {
      // Already exists (a re-consent): a new version is added below.
      if (Number(error && error.code) !== 6 && !/already exists/i.test(String(error && error.message))) throw error;
    }
    await secrets.addSecretVersion({ parent: name, payload: { data: Buffer.from(String(refreshToken), "utf8") } });
    return secretId;
  }

  async function refreshTokenFor(connectionId) {
    const name = `${parent}/secrets/${secretNameFor(connectionId)}/versions/latest`;
    const [version] = await secrets.accessSecretVersion({ name });
    const data = version && version.payload && version.payload.data;
    const token = data ? Buffer.from(data).toString("utf8") : "";
    if (!token) throw new Error("refresh_token_missing");
    return token;
  }

  async function destroyRefreshToken(connectionId) {
    const name = `${parent}/secrets/${secretNameFor(connectionId)}`;
    try {
      await secrets.deleteSecret({ name });
    } catch (error) {
      if (Number(error && error.code) !== 5 && !/not found/i.test(String(error && error.message))) throw error;
    }
  }

  // ── the connection ───────────────────────────────────────────────────

  async function activate({ pendingId, companyId, ownerUid, sellerId = "", marketplaces = [], refreshToken }) {
    const connectionId = crypto.randomBytes(12).toString("hex");
    await storeRefreshToken(connectionId, refreshToken);
    await db().collection(CONNECTIONS).doc(connectionId).set({
      companyId: String(companyId), ownerUid: String(ownerUid),
      sellerId: String(sellerId || "").slice(0, 80),
      marketplaces: marketplaces.map((m) => ({
        marketplaceId: String(m.marketplaceId), countryCode: String(m.countryCode || ""),
        currencyCode: String(m.currencyCode || ""), participating: m.participating === true
      })).slice(0, 40),
      status: "active",
      consentedAtMs: now(),
      createdAtMs: now(),
      lastSyncAtMs: 0,
      cursorMs: 0,
      needsReauth: false
    });
    if (pendingId) await discardPending(pendingId);
    return connectionId;
  }

  async function get(connectionId) {
    const snap = await db().collection(CONNECTIONS).doc(String(connectionId)).get();
    return snap.exists ? { id: snap.id, ...(snap.data() || {}) } : null;
  }

  async function listActive(limit = 200) {
    const snap = await db().collection(CONNECTIONS).where("status", "==", "active").limit(limit).get();
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
  }

  async function listForCompany(companyId) {
    const snap = await db().collection(CONNECTIONS).where("companyId", "==", String(companyId)).limit(20).get();
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
  }

  async function markSynced(connectionId, { cursorMs, orders = 0, errors = 0 }) {
    await db().collection(CONNECTIONS).doc(String(connectionId)).set({
      lastSyncAtMs: now(), cursorMs: Number(cursorMs) || 0, lastSyncOrders: orders, lastSyncErrors: errors
    }, { merge: true });
  }

  async function markNeedsReauth(connectionId, reason = "") {
    await db().collection(CONNECTIONS).doc(String(connectionId)).set({
      needsReauth: true, needsReauthReason: String(reason).slice(0, 80), needsReauthAtMs: now()
    }, { merge: true });
  }

  async function disconnect(connectionId) {
    await destroyRefreshToken(connectionId);
    await db().collection(CONNECTIONS).doc(String(connectionId)).set({
      status: "disconnected", disconnectedAtMs: now()
    }, { merge: true });
  }

  // ── the zone's own copy of an order: the SAFE half only ──────────────

  async function saveSafeOrder(connectionId, safeOrder, safeItems) {
    const orderId = String(safeOrder && safeOrder.AmazonOrderId || "").replace(/[^A-Za-z0-9-]/g, "");
    if (!orderId) return;
    await db().collection(ORDERS).doc(String(connectionId)).collection("orders").doc(orderId).set({
      order: safeOrder, items: safeItems, updatedAtMs: now()
    });
  }

  /** Orders older than the retention window are deleted; only a count is returned. */
  async function sweepOrders({ retentionDays = 90, limit = 300 } = {}) {
    const cutoff = now() - retentionDays * 24 * 60 * 60 * 1000;
    const snap = await db().collectionGroup("orders").where("updatedAtMs", "<", cutoff).limit(limit).get();
    let deleted = 0;
    for (const doc of snap.docs) { await doc.ref.delete(); deleted += 1; }
    return { deleted };
  }

  return {
    nonceSeen, recordNonce, createPending, findPendingByState, discardPending,
    activate, get, listActive, listForCompany, markSynced, markNeedsReauth, disconnect,
    refreshTokenFor, saveSafeOrder, sweepOrders,
    _internal: { secretNameFor, CONNECTIONS, PENDING, NONCES, ORDERS }
  };
}

module.exports = { createConnections, secretNameFor };
