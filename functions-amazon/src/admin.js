"use strict";

// What the main project may ask this zone: status, disconnect, sync now.
//
// Every request carries an OIDC token for one exact identity — the main
// project's amazon-caller account — and nothing about a connection is
// returned that a workspace should not see: no seller id beyond its own, no
// token, no order. Framework-free handlers, like oauthFlow.js.

function json(status, body) {
  return { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(body) };
}

function createAdmin({ connections, verifyCaller, sync = null, logger = console }) {
  async function guard(req) {
    const auth = await verifyCaller(req.headers || {});
    if (!auth.ok) {
      logger.warn(`admin refused: ${auth.reason}`);
      return json(403, { error: "forbidden" });
    }
    return null;
  }

  const publicView = (c) => ({
    connectionId: c.id,
    companyId: c.companyId,
    status: c.status,
    needsReauth: c.needsReauth === true,
    marketplaces: (c.marketplaces || []).map((m) => ({ marketplaceId: m.marketplaceId, countryCode: m.countryCode, participating: m.participating })),
    consentedAtMs: c.consentedAtMs || 0,
    lastSyncAtMs: c.lastSyncAtMs || 0,
    lastSyncOrders: c.lastSyncOrders || 0,
    lastSyncErrors: c.lastSyncErrors || 0
  });

  async function status(req) {
    const refused = await guard(req); if (refused) return refused;
    const companyId = String((req.query && req.query.companyId) || "").trim();
    if (!companyId) return json(400, { error: "companyId required" });
    const rows = await connections.listForCompany(companyId);
    return json(200, { connections: rows.map(publicView) });
  }

  async function disconnect(req) {
    const refused = await guard(req); if (refused) return refused;
    const body = req.body || {};
    const companyId = String(body.companyId || "").trim();
    const connectionId = String(body.connectionId || "").trim();
    if (!companyId || !connectionId) return json(400, { error: "companyId and connectionId required" });
    const connection = await connections.get(connectionId);
    // A workspace may only disconnect its own connection, whoever is asking.
    if (!connection || connection.companyId !== companyId) return json(404, { error: "not found" });
    await connections.disconnect(connectionId);
    logger.log(`admin disconnected connection=${connectionId} company=${companyId}`);
    return json(200, { ok: true });
  }

  async function syncNow(req) {
    const refused = await guard(req); if (refused) return refused;
    if (!sync) return json(501, { error: "sync not available on this service" });
    const body = req.body || {};
    const companyId = String(body.companyId || "").trim();
    const connectionId = String(body.connectionId || "").trim();
    const connection = await connections.get(connectionId);
    if (!connection || connection.companyId !== companyId) return json(404, { error: "not found" });
    if (connection.status !== "active") return json(409, { error: "not active" });
    const counts = await sync.syncConnection(connection);
    return json(200, { ok: true, counts });
  }

  return { status, disconnect, syncNow };
}

module.exports = { createAdmin };
