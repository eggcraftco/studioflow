"use strict";

// The accounting connector's Cloud Functions: QuickBooks Online read-only
// (phases 1–2 of the spec) on top of the generic core in functions/accounting/.
// Owner-only writes; reading follows the bank feed's access key. Every function
// is exported by name from index.js, never by blanket assign, so the deployed
// surface stays greppable.

const crypto = require("crypto");
const core = require("./accounting/core/adapter");
const store = require("./accounting/core/store");
const qboOAuth = require("./accounting/quickbooks/oauth");
const qboWebhook = require("./accounting/quickbooks/webhook");
const qboNormalize = require("./accounting/quickbooks/normalize");
const { createQuickBooksAdapter } = require("./accounting/quickbooks/adapter");
const { createPandleAdapter, describeFromPandleDoc, IMPLICIT_CONNECTION_ID } = require("./accounting/pandle/adapter");
const events = require("./commerce/events");

const REGION = "europe-west2";
const PROVIDER = "quickbooks_online";
const STATE_TTL_MS = 10 * 60 * 1000;
const TOKEN_REFRESH_AHEAD_MS = 5 * 60 * 1000;
const TOKEN_REFRESH_LOCK_MS = 60 * 1000;
const CDC_MAX_LOOKBACK_MS = 29 * 24 * 60 * 60 * 1000;
const CDC_ENTITIES = qboWebhook.SUBSCRIBED_ENTITIES.filter((name) => name !== "Preferences" && name !== "CompanyInfo");
const CATALOG_CAPS = { accounts: 2000, taxCodes: 400, taxRates: 400, items: 600, customers: 5000, vendors: 3000 };
const WEBHOOK_INLINE_LIMIT = 40;
const ROOT_REALMS = "accountingRealms";

function cleanText(value, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}
function isoDate(value) {
  const text = cleanText(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function createAccountingFunctions(deps) {
  const {
    admin, onCall, onRequest, onSchedule, HttpsError, uidIsCompanyOwner, encryptToken, decryptToken,
    qboClientId, qboClientSecret, qboWebhookVerifier, qboTokenKey, appReturnUrl, functionsBaseUrl,
    createClient, oauth = qboOAuth, fetchImpl = globalThis.fetch, now = Date.now, listLocalCustomers = async () => []
  } = deps;
  const db = () => admin.firestore();
  const FieldValue = admin.firestore.FieldValue;
  const box = (plain) => encryptToken(plain, qboTokenKey());
  const unbox = (b) => (b && typeof b === "object" ? decryptToken(b, qboTokenKey()) : "");
  const redirectUri = () => `${functionsBaseUrl()}/quickbooksOAuthCallback`;

  // ---- access -----------------------------------------------------------------
  async function companyFor(companyId) {
    const snap = await db().collection("companies").doc(companyId).get();
    if (!snap.exists) throw new HttpsError("not-found", "Workspace not found.");
    return snap.data() || {};
  }
  async function requireOwner(request) {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "You must be signed in.");
    const companyId = cleanText(request.data?.companyId, 120);
    if (!companyId) throw new HttpsError("invalid-argument", "companyId is required.");
    const companyData = await companyFor(companyId);
    if (!uidIsCompanyOwner(companyData, uid)) throw new HttpsError("permission-denied", "Accounting connections are managed by the workspace owner.");
    return { uid, email: cleanText(request.auth?.token?.email, 160), companyId, companyData };
  }
  async function requireReader(request) {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "You must be signed in.");
    const companyId = cleanText(request.data?.companyId, 120);
    if (!companyId) throw new HttpsError("invalid-argument", "companyId is required.");
    const companyData = await companyFor(companyId);
    const allowed = uidIsCompanyOwner(companyData, uid) || companyData.memberAccess?.[uid]?.bankFeed === true;
    if (!allowed) throw new HttpsError("permission-denied", "Accounting is visible to the owner and members with bank access.");
    return { uid, companyId, companyData };
  }

  // ---- tokens -----------------------------------------------------------------
  async function refreshTokenWithLock(companyId, connectionId, { force = false } = {}) {
    const r = store.refs(db(), companyId);
    const tokenRef = r.tokens.doc(connectionId);
    const connRef = r.connections.doc(connectionId);
    const claimed = await db().runTransaction(async (tx) => {
      const snap = await tx.get(tokenRef);
      if (!snap.exists) return null;
      const row = snap.data() || {};
      if (Number(row.tokenRefreshLockUntilMs || 0) > now()) return { locked: true, row };
      if (!force && Number(row.tokenExpiresAtMs || 0) - now() > TOKEN_REFRESH_AHEAD_MS) return { fresh: true, row };
      tx.update(tokenRef, { tokenRefreshLockUntilMs: now() + TOKEN_REFRESH_LOCK_MS });
      return { row };
    });
    if (!claimed) return "";
    if (claimed.locked || claimed.fresh) return unbox(claimed.row.accessTokenEncrypted);
    const refreshToken = unbox(claimed.row.refreshTokenEncrypted);
    if (!refreshToken) {
      await connRef.set({ status: "reconnect_required", syncState: "needs_reconnect", lastError: "refresh_token_missing", updatedAtMs: now() }, { merge: true });
      await tokenRef.set({ tokenRefreshLockUntilMs: 0 }, { merge: true });
      return "";
    }
    try {
      const tokens = await oauth.refreshTokens({ clientId: qboClientId(), clientSecret: qboClientSecret(), refreshToken, fetchImpl, now });
      // Intuit may rotate the refresh token: the latest one is the only valid one.
      await tokenRef.set({
        accessTokenEncrypted: box(tokens.accessToken), refreshTokenEncrypted: box(tokens.refreshToken),
        tokenExpiresAtMs: tokens.expiresAtMs, refreshExpiresAtMs: tokens.refreshExpiresAtMs, tokenRefreshedAtMs: now(), tokenRefreshLockUntilMs: 0
      }, { merge: true });
      await connRef.set({ status: "linked", syncState: "ok", lastError: "", updatedAtMs: now() }, { merge: true });
      return tokens.accessToken;
    } catch (error) {
      const cls = error?.errorClass || events.classifyError(error);
      await tokenRef.set({ tokenRefreshLockUntilMs: 0 }, { merge: true });
      await connRef.set(cls === "auth" || cls === "permission" || cls === "validation"
        ? { status: "reconnect_required", syncState: "needs_reconnect", lastError: `token_refresh_${cls}`, updatedAtMs: now() }
        : { syncState: "error", lastError: "token_refresh_transient", updatedAtMs: now() }, { merge: true });
      return "";
    }
  }

  async function connectionDoc(companyId, connectionId) {
    const snap = await store.refs(db(), companyId).connections.doc(connectionId).get();
    if (!snap.exists) throw new HttpsError("not-found", "Accounting connection not found.");
    return { ref: snap.ref, data: snap.data() || {} };
  }

  async function clientForConnection(companyId, connection) {
    const accessToken = await refreshTokenWithLock(companyId, connection.connectionId);
    if (!accessToken) {
      const error = new Error("quickbooks_reconnect_required");
      error.errorClass = "auth";
      throw error;
    }
    return createClient({ environment: connection.environment, realmId: connection.externalCompanyId, accessToken, fetchImpl });
  }

  function adapterFor(companyId, connection) {
    return createQuickBooksAdapter({
      clientFor: () => clientForConnection(companyId, connection),
      profile: connection.profile || null,
      connect: async () => { throw new HttpsError("failed-precondition", "Connect through quickbooksConnectStart."); },
      disconnect: async () => disconnectQuickBooks(companyId, connection.connectionId, { actorUid: "", purge: false })
    });
  }

  const pandleAdapter = createPandleAdapter({ readPandleConnection: async () => ({}) });

  // ---- connections view (all providers, incl. the implicit Pandle one) --------------
  async function readPandleDescription(companyId) {
    const r = store.refs(db(), companyId);
    const [pandleSnap, modeSnap] = await Promise.all([
      r.company.collection("pandleConnection").doc("main").get(),
      r.connections.doc(IMPLICIT_CONNECTION_ID).get()
    ]);
    return describeFromPandleDoc(pandleSnap.exists ? pandleSnap.data() || {} : {}, modeSnap.exists ? modeSnap.data() || {} : null);
  }
  async function listConnections(companyId) {
    const r = store.refs(db(), companyId);
    const snap = await r.connections.get();
    const rows = snap.docs.filter((doc) => doc.id !== IMPLICIT_CONNECTION_ID).map((doc) => ({ connectionId: doc.id, ...(doc.data() || {}) }));
    const pandle = await readPandleDescription(companyId);
    if (pandle.status === "linked" || pandle.mode !== "disabled") rows.push(pandle);
    return rows;
  }
  function publicConnection(row) {
    if (!row) return null;
    const { profile, ...rest } = row;
    return { ...rest, profile: profile || null };
  }

  // ---- 1. connect: state + authorize URL -------------------------------------------
  const quickbooksConnectStart = onCall({ region: REGION }, async (request) => {
    const { uid, companyId } = await requireOwner(request);
    const environment = cleanText(request.data?.environment, 12).toLowerCase() === "sandbox" ? "sandbox" : "production";
    const state = crypto.randomBytes(24).toString("base64url");
    const r = store.refs(db(), companyId);
    await r.connectStates.doc(state).set({
      companyId, uid, provider: PROVIDER, environment, used: false, createdAt: FieldValue.serverTimestamp(),
      expiresAt: now() + STATE_TTL_MS, expireAt: admin.firestore.Timestamp.fromMillis(now() + STATE_TTL_MS)
    });
    return { ok: true, state, environment, authorizeUrl: oauth.authorizeUrl({ clientId: qboClientId(), redirectUri: redirectUri(), state }) };
  });

  function connectRedirect(res, params) {
    const url = new URL(appReturnUrl());
    url.searchParams.set("section", "quickbooks");
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    res.redirect(302, url.toString());
  }

  // ---- 2. callback: Intuit sends the owner's browser back with code + realmId ----------
  const quickbooksOAuthCallback = onRequest({ region: REGION, timeoutSeconds: 120 }, async (req, res) => {
    const state = cleanText(req.query?.state, 200);
    const code = cleanText(req.query?.code, 600);
    const realmId = cleanText(req.query?.realmId, 60);
    const denied = cleanText(req.query?.error, 60);
    if (denied) { connectRedirect(res, { quickbooks: "cancelled" }); return; }
    if (!state || !code || !realmId) { connectRedirect(res, { quickbooks: "error", reason: "missing_code" }); return; }
    let stateData = null;
    try {
      stateData = await db().runTransaction(async (tx) => {
        const ref = db().collection(store.ROOT_COLLECTIONS.connectStates).doc(state);
        const snap = await tx.get(ref);
        if (!snap.exists) return null;
        const row = snap.data() || {};
        if (row.used === true || Number(row.expiresAt || 0) < now() || row.provider !== PROVIDER) return null;
        tx.update(ref, { used: true, usedAt: FieldValue.serverTimestamp() });
        return row;
      });
    } catch (error) { console.error("quickbooksOAuthCallback state failed:", error?.message || error); }
    if (!stateData) { connectRedirect(res, { quickbooks: "error", reason: "state" }); return; }
    const companyId = cleanText(stateData.companyId, 120);
    const environment = stateData.environment === "sandbox" ? "sandbox" : "production";
    try {
      const tokens = await oauth.exchangeCode({ clientId: qboClientId(), clientSecret: qboClientSecret(), code, redirectUri: redirectUri(), fetchImpl, now });
      // The company is whoever the token can read, not whatever the query said.
      const client = createClient({ environment, realmId, accessToken: tokens.accessToken, fetchImpl });
      const [info, prefs] = await Promise.all([client.companyInfo(), client.preferences()]);
      const profile = qboNormalize.normalizeCompanyProfile(info, prefs);
      if (profile.externalCompanyId && profile.externalCompanyId !== realmId) throw Object.assign(new Error("quickbooks_realm_mismatch"), { errorClass: "validation" });
      const connectionId = store.connectionDocId(PROVIDER, realmId);
      const r = store.refs(db(), companyId);
      const existingSnap = await r.connections.doc(connectionId).get();
      const existing = existingSnap.exists ? existingSnap.data() || {} : {};
      const capabilities = { ...core.defaultCapabilities(PROVIDER), multiCurrency: { enabled: profile.multiCurrencyEnabled } };
      const batch = db().batch();
      batch.set(r.tokens.doc(connectionId), {
        provider: PROVIDER, realmId, environment, accessTokenEncrypted: box(tokens.accessToken), refreshTokenEncrypted: box(tokens.refreshToken),
        tokenExpiresAtMs: tokens.expiresAtMs, refreshExpiresAtMs: tokens.refreshExpiresAtMs, tokenRefreshLockUntilMs: 0, tokenRefreshedAtMs: now(), updatedAtMs: now()
      });
      batch.set(r.connections.doc(connectionId), {
        companyId, provider: PROVIDER, externalCompanyId: realmId, companyName: profile.companyName, environment, status: "linked", syncState: "ok", lastError: "",
        mode: core.CONNECTION_MODES.includes(existing.mode) ? existing.mode : "shadow_read", writeBoundaryDate: existing.writeBoundaryDate || "", writeUntilDate: existing.writeUntilDate || "",
        homeCurrency: profile.homeCurrency, countryCode: profile.country, capabilities, profile,
        setupState: existing.setupState === "ready" ? "ready" : "importing", counts: existing.counts || {},
        linkedAtMs: existing.linkedAtMs || now(), linkedByUid: cleanText(stateData.uid, 128), reconnectedAtMs: existing.linkedAtMs ? now() : 0,
        lastWebhookAtMs: existing.lastWebhookAtMs || 0, lastReconciliationAtMs: existing.lastReconciliationAtMs || 0, lastCatalogAtMs: existing.lastCatalogAtMs || 0,
        updatedAtMs: now()
      }, { merge: true });
      batch.set(db().collection(ROOT_REALMS).doc(`${PROVIDER}__${realmId}`), { provider: PROVIDER, realmId, environment, companyId, connectionId, updatedAtMs: now() });
      batch.set(r.connectStates.doc(state), { connectionId }, { merge: true });
      await batch.commit();
      await store.recordAudit(db(), companyId, { connectionId, provider: PROVIDER, action: existing.linkedAtMs ? "reconnected" : "connected", actorUid: cleanText(stateData.uid, 128), summary: `${profile.companyName || realmId} (${environment}) connected` }, { now: now() });
      connectRedirect(res, { quickbooks: "connected", connection: connectionId });
    } catch (error) {
      console.error("quickbooksOAuthCallback failed:", String(error?.message || error).slice(0, 200));
      const cls = error?.errorClass || events.classifyError(error);
      connectRedirect(res, { quickbooks: "error", reason: cls === "auth" ? "token" : cls === "validation" && String(error?.message || "").includes("realm") ? "company" : "exchange" });
    }
  });

  // ---- catalogue import -----------------------------------------------------------------
  async function writeIdentities(companyId, connection, entityType, snapshots, { batchSize = 400 } = {}) {
    const r = store.refs(db(), companyId);
    let batch = db().batch();
    let pending = 0;
    let written = 0;
    for (const snapshot of snapshots) {
      if (!snapshot?.externalId) continue;
      const id = store.identityDocId(PROVIDER, connection.connectionId, entityType, snapshot.externalId);
      batch.set(r.identities.doc(id), {
        companyId, provider: PROVIDER, connectionId: connection.connectionId, entityType, externalId: snapshot.externalId,
        externalSyncToken: snapshot.syncToken || "", externalUpdatedAt: snapshot.updatedAt || "", snapshot, deletedAtMs: 0, lastSeenAtMs: now()
      }, { merge: true });
      pending += 1;
      written += 1;
      if (pending >= batchSize) { await batch.commit(); batch = db().batch(); pending = 0; }
    }
    if (pending) await batch.commit();
    return written;
  }

  async function importCatalog(companyId, connection) {
    const adapter = adapterFor(companyId, connection);
    const r = store.refs(db(), companyId);
    const profile = await adapter.getCompanyProfile();
    const accounts = (await adapter.getAccounts()).items;
    const taxes = await adapter.getTaxCodes();
    const customers = (await adapter.getCustomers()).items;
    const vendors = (await adapter.getVendors()).items;
    const items = (await adapter.getItems()).items;
    const counts = {
      accounts: accounts.length, taxCodes: taxes.items.length, taxRates: (taxes.rates || []).length,
      customers: customers.length, vendors: vendors.length, items: items.length
    };
    await writeIdentities(companyId, connection, "Account", accounts);
    await writeIdentities(companyId, connection, "TaxCode", taxes.items);
    await writeIdentities(companyId, connection, "TaxRate", taxes.rates || []);
    await writeIdentities(companyId, connection, "Customer", customers);
    await writeIdentities(companyId, connection, "Vendor", vendors);
    await writeIdentities(companyId, connection, "Item", items);
    const slim = (rows, cap, pick) => rows.slice(0, cap).map(pick);
    await r.catalog.doc(connection.connectionId).set({
      companyId, provider: PROVIDER, connectionId: connection.connectionId, importedAtMs: now(), counts,
      accounts: slim(accounts, CATALOG_CAPS.accounts, (a) => ({ externalId: a.externalId, name: a.name, fullyQualifiedName: a.fullyQualifiedName, accountType: a.accountType, accountSubType: a.accountSubType, classification: a.classification, currency: a.currency, active: a.active })),
      taxCodes: slim(taxes.items, CATALOG_CAPS.taxCodes, (t) => ({ externalId: t.externalId, name: t.name, description: t.description, active: t.active, hidden: t.hidden, effectiveSalesRate: t.effectiveSalesRate, effectivePurchaseRate: t.effectivePurchaseRate })),
      taxRates: slim(taxes.rates || [], CATALOG_CAPS.taxRates, (t) => ({ externalId: t.externalId, name: t.name, rateValue: t.rateValue, active: t.active })),
      items: slim(items, CATALOG_CAPS.items, (i) => ({ externalId: i.externalId, name: i.name, sku: i.sku, type: i.type, incomeAccountId: i.incomeAccountId, expenseAccountId: i.expenseAccountId, assetAccountId: i.assetAccountId, active: i.active }))
    });
    await r.catalog.doc(`${connection.connectionId}__contacts`).set({
      companyId, provider: PROVIDER, connectionId: connection.connectionId, importedAtMs: now(),
      customers: slim(customers, CATALOG_CAPS.customers, (c) => ({ externalId: c.externalId, displayName: c.displayName, companyName: c.companyName, email: c.email, currency: c.currency, balance: c.balance, active: c.active })),
      vendors: slim(vendors, CATALOG_CAPS.vendors, (v) => ({ externalId: v.externalId, displayName: v.displayName, companyName: v.companyName, email: v.email, currency: v.currency, balance: v.balance, active: v.active }))
    });
    // Cursors start now: anything older is in the catalogue already.
    const cursorBatch = db().batch();
    for (const entity of CDC_ENTITIES) {
      const ref = r.cursors.doc(store.cursorDocId(connection.connectionId, entity));
      const snap = await ref.get();
      if (!snap.exists) cursorBatch.set(ref, { connectionId: connection.connectionId, entity, changedSinceMs: now() - 5 * 60 * 1000, updatedAtMs: now() });
    }
    await cursorBatch.commit();
    await r.connections.doc(connection.connectionId).set({
      companyName: profile.companyName || connection.companyName || "", profile, homeCurrency: profile.homeCurrency, countryCode: profile.country,
      capabilities: { ...(connection.capabilities || core.defaultCapabilities(PROVIDER)), multiCurrency: { enabled: profile.multiCurrencyEnabled } },
      counts, setupState: "ready", lastCatalogAtMs: now(), syncState: "ok", lastError: "", updatedAtMs: now()
    }, { merge: true });
    return { counts, profile };
  }

  // ---- reconciliation (CDC): catches what webhooks missed -------------------------------
  async function applyChange(companyId, connection, change, { source = "cdc" } = {}) {
    const r = store.refs(db(), companyId);
    const id = store.identityDocId(PROVIDER, connection.connectionId, change.entityType, change.externalId);
    const ref = r.identities.doc(id);
    const snap = await ref.get();
    const existing = snap.exists ? snap.data() || {} : null;
    if (change.deleted) {
      await ref.set({ companyId, provider: PROVIDER, connectionId: connection.connectionId, entityType: change.entityType, externalId: change.externalId, deletedAtMs: now(), lastSeenAtMs: now(), lastSource: source }, { merge: true });
      if (existing && existing.nivadeskEntityId) {
        await store.openAttention(db(), companyId, { connectionId: connection.connectionId, provider: PROVIDER, kind: "deleted_in_quickbooks", severity: "warning", entityRef: `${change.entityType}:${change.externalId}`, entityRefs: [`${change.entityType}:${change.externalId}`], message: `${change.entityType} ${change.externalId} was deleted or voided in QuickBooks after NivaDesk posted it.`, options: ["review", "ignore"] }, { now: now() });
      }
      return "deleted";
    }
    const snapshot = change.snapshot || {};
    const tokenMoved = existing && existing.externalSyncToken && snapshot.syncToken && existing.externalSyncToken !== snapshot.syncToken;
    await ref.set({
      companyId, provider: PROVIDER, connectionId: connection.connectionId, entityType: change.entityType, externalId: change.externalId,
      externalSyncToken: snapshot.syncToken || "", externalUpdatedAt: snapshot.updatedAt || "", snapshot, deletedAtMs: 0, lastSeenAtMs: now(), lastSource: source
    }, { merge: true });
    // A document NivaDesk posted was changed by someone else: never overwrite, always say so (§15).
    if (tokenMoved && existing.nivadeskEntityId) {
      await store.openAttention(db(), companyId, { connectionId: connection.connectionId, provider: PROVIDER, kind: "changed_in_quickbooks", severity: "warning", entityRef: `${change.entityType}:${change.externalId}`, entityRefs: [`${change.entityType}:${change.externalId}`, `${existing.nivadeskEntityType}:${existing.nivadeskEntityId}`], message: `${change.entityType} ${change.externalId} was changed in QuickBooks (SyncToken ${existing.externalSyncToken} → ${snapshot.syncToken}).`, options: ["keep_quickbooks", "review"] }, { now: now() });
      return "changed";
    }
    return existing ? "updated" : "created";
  }

  async function reconcileConnection(companyId, connection) {
    const r = store.refs(db(), companyId);
    const adapter = adapterFor(companyId, connection);
    const cursorSnaps = await Promise.all(CDC_ENTITIES.map((entity) => r.cursors.doc(store.cursorDocId(connection.connectionId, entity)).get()));
    const since = cursorSnaps.reduce((acc, snap) => {
      const ms = snap.exists ? Number((snap.data() || {}).changedSinceMs || 0) : 0;
      return acc === null ? ms : Math.min(acc, ms);
    }, null) || now() - 24 * 60 * 60 * 1000;
    const changedSinceMs = Math.max(since, now() - CDC_MAX_LOOKBACK_MS);
    const startedAt = now();
    const summary = { scanned: 0, created: 0, updated: 0, changed: 0, deleted: 0, failed: 0, changedSince: new Date(changedSinceMs).toISOString() };
    try {
      const { changes } = await adapter.reconcile({ entities: CDC_ENTITIES, changedSince: new Date(changedSinceMs).toISOString() });
      for (const change of changes) {
        summary.scanned += 1;
        if (!change.externalId) continue;
        try { summary[await applyChange(companyId, connection, change, { source: "cdc" })] += 1; } catch (error) { summary.failed += 1; console.error("cdc apply failed:", error?.message || error); }
      }
      if (summary.failed === 0) {
        const batch = db().batch();
        for (const entity of CDC_ENTITIES) batch.set(r.cursors.doc(store.cursorDocId(connection.connectionId, entity)), { connectionId: connection.connectionId, entity, changedSinceMs: startedAt, updatedAtMs: now() }, { merge: true });
        await batch.commit();
      }
      await r.connections.doc(connection.connectionId).set({ lastReconciliationAtMs: now(), lastReconciliation: summary, syncState: "ok", lastError: "", updatedAtMs: now() }, { merge: true });
    } catch (error) {
      const cls = error?.errorClass || events.classifyError(error);
      await r.connections.doc(connection.connectionId).set({ lastReconciliationAtMs: now(), lastReconciliation: { ...summary, error: cls }, syncState: cls === "auth" || cls === "permission" ? "needs_reconnect" : "error", lastError: String(error?.message || error).slice(0, 200), updatedAtMs: now() }, { merge: true });
      summary.error = cls;
    }
    return summary;
  }

  // ---- 3. sync now: catalogue + CDC ------------------------------------------------------
  const quickbooksSyncNow = onCall({ region: REGION, timeoutSeconds: 540, memory: "512MiB" }, async (request) => {
    const { uid, companyId } = await requireOwner(request);
    const connectionId = cleanText(request.data?.connectionId, 130);
    const { data } = await connectionDoc(companyId, connectionId);
    const connection = { connectionId, ...data };
    if (connection.provider !== PROVIDER) throw new HttpsError("failed-precondition", "Only QuickBooks connections sync here.");
    try {
      const catalog = await importCatalog(companyId, connection);
      const reconcile = await reconcileConnection(companyId, { ...connection, capabilities: connection.capabilities });
      await store.recordAudit(db(), companyId, { connectionId, provider: PROVIDER, action: "sync", actorUid: uid, summary: `Catalogue ${Object.values(catalog.counts).reduce((a, b) => a + b, 0)} rows, ${reconcile.scanned} changes read`, details: { counts: catalog.counts, reconcile } }, { now: now() });
      return { ok: true, counts: catalog.counts, reconcile };
    } catch (error) {
      const cls = error?.errorClass || events.classifyError(error);
      await store.refs(db(), companyId).connections.doc(connectionId).set({ syncState: cls === "auth" ? "needs_reconnect" : "error", lastError: String(error?.message || error).slice(0, 200), updatedAtMs: now() }, { merge: true });
      if (cls === "auth") throw new HttpsError("failed-precondition", "QuickBooks no longer accepts this connection. Connect again.");
      throw new HttpsError("unavailable", `QuickBooks could not be read: ${cleanText(error?.detail || error?.message, 200)}`);
    }
  });

  // ---- 4. webhook ------------------------------------------------------------------------
  async function processWebhookEvents(parsedEvents, { source = "webhook" } = {}) {
    let processed = 0;
    let duplicates = 0;
    let unknownRealm = 0;
    let failed = 0;
    let deferred = 0;
    for (const [index, event] of parsedEvents.entries()) {
      const realmSnap = await db().collection(ROOT_REALMS).doc(`${PROVIDER}__${event.realmId}`).get();
      if (!realmSnap.exists) { unknownRealm += 1; continue; }
      const { companyId, connectionId } = realmSnap.data() || {};
      const r = store.refs(db(), companyId);
      const inboxRef = r.inbox.doc(store.safeId(`qbo__${event.eventId}`, 200));
      try {
        await inboxRef.create({ companyId, provider: PROVIDER, connectionId, eventId: event.eventId, realmId: event.realmId, entityType: event.entity, externalId: event.externalId, operation: event.operation, occurredAt: event.occurredAt, format: event.format, data: event.data || {}, status: "received", receivedAtMs: now(), source });
      } catch (error) {
        if (String(error?.code) === "6" || /already exists/i.test(String(error?.message || ""))) { duplicates += 1; continue; }
        throw error;
      }
      await r.connections.doc(connectionId).set({ lastWebhookAtMs: now(), updatedAtMs: now() }, { merge: true });
      if (index >= WEBHOOK_INLINE_LIMIT) { deferred += 1; continue; }
      try {
        await processInboxEvent(companyId, connectionId, inboxRef);
        processed += 1;
      } catch (error) {
        failed += 1;
        await inboxRef.set({ status: "failed", error: String(error?.message || error).slice(0, 200), updatedAtMs: now() }, { merge: true });
      }
    }
    return { processed, duplicates, unknownRealm, failed, deferred };
  }

  async function processInboxEvent(companyId, connectionId, inboxRef) {
    const inboxSnap = await inboxRef.get();
    const event = inboxSnap.data() || {};
    const { data: connData } = await connectionDoc(companyId, connectionId);
    const connection = { connectionId, ...connData };
    if (connection.status !== "linked") { await inboxRef.set({ status: "ignored", reason: "connection_not_linked", updatedAtMs: now() }, { merge: true }); return "ignored"; }
    // The console subscribes to every entity by default; only the ones the
    // engine understands are fetched, the rest are kept but marked ignored.
    if (!qboWebhook.SUBSCRIBED_ENTITIES.includes(event.entityType)) { await inboxRef.set({ status: "ignored", reason: "entity_not_tracked", updatedAtMs: now() }, { merge: true }); return "ignored"; }
    const adapter = adapterFor(companyId, connection);
    let outcome = "";
    if (event.operation === "Delete" || event.operation === "Void") {
      outcome = await applyChange(companyId, connection, { entityType: event.entityType, externalId: event.externalId, deleted: true }, { source: "webhook" });
    } else if (event.operation === "Merge" && event.data?.deletedid) {
      await applyChange(companyId, connection, { entityType: event.entityType, externalId: String(event.data.deletedid), deleted: true }, { source: "webhook" });
      const fetched = await adapter.fetchEntity({ entityType: event.entityType, externalId: event.externalId });
      outcome = await applyChange(companyId, connection, { entityType: event.entityType, externalId: event.externalId, deleted: fetched.deleted, snapshot: fetched.snapshot }, { source: "webhook" });
    } else if (event.entityType === "Preferences" || event.entityType === "CompanyInfo") {
      const profile = await adapter.getCompanyProfile();
      await store.refs(db(), companyId).connections.doc(connectionId).set({ profile, companyName: profile.companyName, homeCurrency: profile.homeCurrency, updatedAtMs: now() }, { merge: true });
      outcome = "profile";
    } else {
      const fetched = await adapter.fetchEntity({ entityType: event.entityType, externalId: event.externalId });
      outcome = await applyChange(companyId, connection, { entityType: event.entityType, externalId: event.externalId, deleted: fetched.deleted, snapshot: fetched.snapshot }, { source: "webhook" });
    }
    await inboxRef.set({ status: "processed", outcome, processedAtMs: now(), updatedAtMs: now() }, { merge: true });
    return outcome;
  }

  const quickbooksWebhook = onRequest({ region: REGION, timeoutSeconds: 60 }, async (req, res) => {
    if (req.method !== "POST") { res.status(405).json({ ok: false, error: "method" }); return; }
    const rawBody = req.rawBody || Buffer.from(typeof req.body === "string" ? req.body : JSON.stringify(req.body || {}), "utf8");
    const header = String(req.headers["intuit-signature"] || "");
    if (!qboWebhook.verifySignature({ rawBody, header, verifier: qboWebhookVerifier() })) { res.status(401).json({ ok: false, error: "invalid_signature" }); return; }
    const parsed = qboWebhook.parseNotifications(rawBody);
    if (parsed.format === "unknown") {
      // Keep what we could not read; a person can look, the sweep still runs.
      await db().collection(ROOT_REALMS).doc("_unparsed").collection("payloads").add({ receivedAtMs: now(), body: rawBody.toString("utf8").slice(0, 20000) }).catch(() => undefined);
      res.status(200).json({ ok: true, format: "unknown" });
      return;
    }
    try {
      const result = await processWebhookEvents(parsed.events);
      res.status(200).json({ ok: true, format: parsed.format, received: parsed.events.length, ...result });
    } catch (error) {
      console.error("quickbooksWebhook failed:", String(error?.message || error).slice(0, 200));
      res.status(200).json({ ok: false, error: "processing" });
    }
  });

  // ---- 5. scheduled sweep: every linked realm, every 6 hours ----------------------------
  async function sweep() {
    const realms = await db().collection(ROOT_REALMS).where("provider", "==", PROVIDER).limit(300).get();
    const summary = { connections: 0, reconciled: 0, inboxProcessed: 0, errors: 0 };
    for (const realmDoc of realms.docs) {
      const { companyId, connectionId } = realmDoc.data() || {};
      if (!companyId || !connectionId) continue;
      summary.connections += 1;
      try {
        const { data } = await connectionDoc(companyId, connectionId);
        if (data.status !== "linked") continue;
        const connection = { connectionId, ...data };
        const r = store.refs(db(), companyId);
        const pending = await r.inbox.where("status", "==", "received").limit(50).get();
        for (const doc of pending.docs) {
          try { await processInboxEvent(companyId, connectionId, doc.ref); summary.inboxProcessed += 1; } catch (error) { await doc.ref.set({ status: "failed", error: String(error?.message || error).slice(0, 200), updatedAtMs: now() }, { merge: true }); }
        }
        await reconcileConnection(companyId, connection);
        summary.reconciled += 1;
      } catch (error) {
        summary.errors += 1;
        console.error("accounting sweep failed:", connectionId, String(error?.message || error).slice(0, 200));
      }
    }
    console.log("accounting sweep:", JSON.stringify(summary));
    return summary;
  }
  const scheduledAccountingReconcile = onSchedule({ schedule: "every 6 hours", timeZone: "Europe/London", region: REGION, timeoutSeconds: 540 }, async () => { await sweep(); });

  // ---- 6. disconnect --------------------------------------------------------------------
  async function disconnectQuickBooks(companyId, connectionId, { actorUid = "", purge = false } = {}) {
    const r = store.refs(db(), companyId);
    const tokenSnap = await r.tokens.doc(connectionId).get();
    const tokens = tokenSnap.exists ? tokenSnap.data() || {} : {};
    let revoked = false;
    const refreshToken = unbox(tokens.refreshTokenEncrypted);
    if (refreshToken) {
      try { revoked = await oauth.revokeToken({ clientId: qboClientId(), clientSecret: qboClientSecret(), token: refreshToken, fetchImpl }); } catch (error) { console.warn("quickbooks revoke failed:", error?.message || error); }
    }
    const connSnap = await r.connections.doc(connectionId).get();
    const realmId = connSnap.exists ? String((connSnap.data() || {}).externalCompanyId || "") : "";
    const batch = db().batch();
    batch.delete(r.tokens.doc(connectionId));
    batch.set(r.connections.doc(connectionId), { status: "disconnected", mode: "disabled", syncState: "disconnected", disconnectedAtMs: now(), revoked, updatedAtMs: now() }, { merge: true });
    if (realmId) batch.delete(db().collection(ROOT_REALMS).doc(`${PROVIDER}__${realmId}`));
    await batch.commit();
    if (purge) {
      for (const collection of [r.identities, r.inbox, r.attention, r.cursors]) {
        const snap = await collection.where("connectionId", "==", connectionId).limit(5000).get();
        let b = db().batch();
        let n = 0;
        for (const doc of snap.docs) { b.delete(doc.ref); n += 1; if (n >= 400) { await b.commit(); b = db().batch(); n = 0; } }
        if (n) await b.commit();
      }
      await r.catalog.doc(connectionId).delete().catch(() => undefined);
      await r.catalog.doc(`${connectionId}__contacts`).delete().catch(() => undefined);
      await r.mappings.doc(connectionId).delete().catch(() => undefined);
      await r.connections.doc(connectionId).delete().catch(() => undefined);
    }
    await store.recordAudit(db(), companyId, { connectionId, provider: PROVIDER, action: purge ? "disconnected_purged" : "disconnected", actorUid, summary: revoked ? "Access revoked at Intuit" : "Tokens forgotten (revoke not confirmed)" }, { now: now() });
    return { ok: true, revoked };
  }
  const quickbooksDisconnect = onCall({ region: REGION, timeoutSeconds: 120 }, async (request) => {
    const { uid, companyId } = await requireOwner(request);
    const connectionId = cleanText(request.data?.connectionId, 130);
    await connectionDoc(companyId, connectionId);
    return disconnectQuickBooks(companyId, connectionId, { actorUid: uid, purge: request.data?.purge === true });
  });

  // ---- 7. mode and the one-writer rule ---------------------------------------------------
  async function writersFor(companyId) {
    return (await listConnections(companyId)).map((row) => ({ connectionId: row.connectionId, provider: row.provider, companyName: row.companyName, mode: row.mode, writeBoundaryDate: row.writeBoundaryDate || "", writeUntilDate: row.writeUntilDate || "" }));
  }
  async function setMode(companyId, connectionId, { mode, writeBoundaryDate = "", writeUntilDate = "" }, actor) {
    if (!core.CONNECTION_MODES.includes(mode)) throw new HttpsError("invalid-argument", "mode must be primary_write, shadow_read, migration_read or disabled.");
    const boundary = isoDate(writeBoundaryDate);
    const until = isoDate(writeUntilDate);
    if (mode === "primary_write" && !boundary) throw new HttpsError("invalid-argument", "A primary accounting provider needs the date its books start (writeBoundaryDate).");
    const r = store.refs(db(), companyId);
    const isPandle = connectionId === IMPLICIT_CONNECTION_ID;
    if (!isPandle) await connectionDoc(companyId, connectionId);
    const conflict = store.primaryWriterConflict(await writersFor(companyId), { connectionId, mode, writeBoundaryDate: boundary });
    if (conflict) throw new HttpsError("failed-precondition", conflict.message, conflict);
    await r.connections.doc(connectionId).set({
      ...(isPandle ? { companyId, provider: "pandle", implicit: true } : {}),
      mode, writeBoundaryDate: boundary, writeUntilDate: until, modeChangedAtMs: now(), modeChangedByUid: actor.uid, updatedAtMs: now()
    }, { merge: true });
    await store.recordAudit(db(), companyId, { connectionId, provider: isPandle ? "pandle" : PROVIDER, action: "mode", actorUid: actor.uid, summary: `${mode}${boundary ? ` from ${boundary}` : ""}${until ? ` until ${until}` : ""}` }, { now: now() });
  }
  const accountingSetMode = onCall({ region: REGION }, async (request) => {
    const actor = await requireOwner(request);
    const connectionId = cleanText(request.data?.connectionId, 130);
    await setMode(actor.companyId, connectionId, { mode: cleanText(request.data?.mode, 20), writeBoundaryDate: request.data?.writeBoundaryDate, writeUntilDate: request.data?.writeUntilDate }, actor);
    return { ok: true, connections: (await listConnections(actor.companyId)).map(publicConnection) };
  });

  // "Migrate to QuickBooks from a date": Pandle keeps the books until the day
  // before, QuickBooks takes them from the boundary — written as one decision.
  const accountingPlanMigration = onCall({ region: REGION }, async (request) => {
    const actor = await requireOwner(request);
    const connectionId = cleanText(request.data?.connectionId, 130);
    const boundary = isoDate(request.data?.boundaryDate);
    if (!boundary) throw new HttpsError("invalid-argument", "boundaryDate (YYYY-MM-DD) is required.");
    const dayBefore = new Date(`${boundary}T12:00:00Z`);
    dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
    const until = dayBefore.toISOString().slice(0, 10);
    const pandle = await readPandleDescription(actor.companyId);
    if (pandle.status === "linked") await setMode(actor.companyId, IMPLICIT_CONNECTION_ID, { mode: "migration_read", writeBoundaryDate: "", writeUntilDate: until }, actor);
    await setMode(actor.companyId, connectionId, { mode: "primary_write", writeBoundaryDate: boundary }, actor);
    return { ok: true, boundaryDate: boundary, pandleUntil: pandle.status === "linked" ? until : "", connections: (await listConnections(actor.companyId)).map(publicConnection) };
  });

  // ---- 8. mappings, policies, the double-writer checklist --------------------------------
  const ACCOUNT_KEYS = new Set(core.ACCOUNT_MAPPING_KEYS.map((row) => row.key));
  const TAX_KEYS = new Set(core.TAX_MAPPING_KEYS.map((row) => row.key));
  const CHECKLIST_KEYS = ["paypalAppActive", "squareAppActive", "salesAppWrites", "bankFeedConnected", "inventoryAppWritesCogs"];

  const accountingSaveMappings = onCall({ region: REGION }, async (request) => {
    const actor = await requireOwner(request);
    const connectionId = cleanText(request.data?.connectionId, 130);
    await connectionDoc(actor.companyId, connectionId);
    const r = store.refs(db(), actor.companyId);
    const catalogSnap = await r.catalog.doc(connectionId).get();
    const catalog = catalogSnap.exists ? catalogSnap.data() || {} : {};
    const accountsById = new Map((catalog.accounts || []).map((a) => [a.externalId, a]));
    const taxById = new Map((catalog.taxCodes || []).map((t) => [t.externalId, t]));
    const patch = { connectionId, provider: PROVIDER, companyId: actor.companyId, updatedAtMs: now(), updatedByUid: actor.uid };
    const summary = [];
    if (request.data?.accounts && typeof request.data.accounts === "object") {
      const accounts = {};
      for (const [key, externalId] of Object.entries(request.data.accounts)) {
        if (!ACCOUNT_KEYS.has(key)) throw new HttpsError("invalid-argument", `Unknown account mapping ${key}.`);
        const id = cleanText(externalId, 40);
        if (!id) { accounts[key] = FieldValue.delete(); continue; }
        const account = accountsById.get(id);
        if (!account) throw new HttpsError("failed-precondition", `Account ${id} is not in the imported chart of accounts. Sync first.`);
        accounts[key] = { externalId: id, name: account.fullyQualifiedName || account.name, accountType: account.accountType, confirmedAtMs: now(), confirmedByUid: actor.uid };
      }
      patch.accounts = accounts;
      summary.push(`${Object.keys(accounts).length} account mappings`);
    }
    if (request.data?.taxes && typeof request.data.taxes === "object") {
      const taxes = {};
      for (const [key, externalId] of Object.entries(request.data.taxes)) {
        if (!TAX_KEYS.has(key)) throw new HttpsError("invalid-argument", `Unknown VAT mapping ${key}.`);
        const id = cleanText(externalId, 40);
        if (!id) { taxes[key] = FieldValue.delete(); continue; }
        const code = taxById.get(id);
        if (!code) throw new HttpsError("failed-precondition", `Tax code ${id} is not in the imported list. Sync first.`);
        taxes[key] = { externalId: id, name: code.name, rate: code.effectiveSalesRate, confirmedAtMs: now(), confirmedByUid: actor.uid };
      }
      patch.taxes = taxes;
      summary.push(`${Object.keys(taxes).length} VAT mappings`);
    }
    if (request.data?.policies && typeof request.data.policies === "object") {
      const input = request.data.policies;
      const policies = {};
      if (input.sources && typeof input.sources === "object") {
        policies.sources = {};
        for (const [source, mode] of Object.entries(input.sources)) {
          if (!core.SALES_SOURCES.includes(source)) throw new HttpsError("invalid-argument", `Unknown sales source ${source}.`);
          if (!core.POSTING_MODES.includes(mode)) throw new HttpsError("invalid-argument", `Unknown posting mode ${mode}.`);
          policies.sources[source] = mode;
        }
      }
      if (input.bespoke !== undefined) {
        if (!core.BESPOKE_POLICIES.includes(input.bespoke)) throw new HttpsError("invalid-argument", "Unknown bespoke policy.");
        policies.bespoke = input.bespoke;
      }
      if (input.inventory !== undefined) {
        if (!core.INVENTORY_POLICIES.includes(input.inventory)) throw new HttpsError("invalid-argument", "Unknown inventory policy.");
        policies.inventory = input.inventory;
      }
      if (input.estimatesToQuickBooks !== undefined) policies.estimatesToQuickBooks = input.estimatesToQuickBooks === true;
      if (input.effectiveFrom !== undefined) {
        const from = isoDate(input.effectiveFrom);
        if (!from) throw new HttpsError("invalid-argument", "effectiveFrom must be YYYY-MM-DD.");
        policies.effectiveFrom = from;
      }
      patch.policies = policies;
      summary.push("posting policies");
    }
    if (request.data?.checklist && typeof request.data.checklist === "object") {
      const checklist = {};
      for (const key of CHECKLIST_KEYS) if (typeof request.data.checklist[key] === "boolean") checklist[key] = request.data.checklist[key];
      checklist.confirmedAtMs = now();
      checklist.confirmedByUid = actor.uid;
      patch.checklist = checklist;
      summary.push("double-writer checklist");
    }
    await r.mappings.doc(connectionId).set(patch, { merge: true });
    await store.recordAudit(db(), actor.companyId, { connectionId, provider: PROVIDER, action: "mappings", actorUid: actor.uid, actorEmail: actor.email, summary: summary.join(", ") || "no change" }, { now: now() });
    const saved = await r.mappings.doc(connectionId).get();
    return { ok: true, mappings: saved.exists ? saved.data() : null };
  });

  const accountingMappingSuggestions = onCall({ region: REGION, timeoutSeconds: 120 }, async (request) => {
    const { companyId } = await requireOwner(request);
    const connectionId = cleanText(request.data?.connectionId, 130);
    const r = store.refs(db(), companyId);
    const [catalogSnap, contactsSnap] = await Promise.all([r.catalog.doc(connectionId).get(), r.catalog.doc(`${connectionId}__contacts`).get()]);
    if (!catalogSnap.exists) throw new HttpsError("failed-precondition", "Sync the QuickBooks catalogue first.");
    const catalog = catalogSnap.data() || {};
    const contacts = contactsSnap.exists ? contactsSnap.data() || {} : {};
    const local = await listLocalCustomers(companyId);
    return {
      ok: true,
      accounts: qboNormalize.suggestAccountMappings(catalog.accounts || []),
      taxes: qboNormalize.suggestTaxMappings(catalog.taxCodes || []),
      duplicates: qboNormalize.duplicateContactCandidates(local, contacts.customers || [], { limit: 200 }),
      localCustomerCount: local.length,
      remoteCustomerCount: (contacts.customers || []).length
    };
  });

  // ---- 9. reading: overview, attention, activity -----------------------------------------
  const accountingOverview = onCall({ region: REGION }, async (request) => {
    const { companyId } = await requireReader(request);
    const r = store.refs(db(), companyId);
    const connections = await listConnections(companyId);
    const [attentionSnap, auditSnap] = await Promise.all([
      r.attention.where("status", "==", "open").limit(200).get(),
      r.audit.orderBy("createdAtMs", "desc").limit(20).get()
    ]);
    const mappings = {};
    for (const row of connections) {
      if (row.provider !== PROVIDER) continue;
      const snap = await r.mappings.doc(row.connectionId).get();
      mappings[row.connectionId] = snap.exists ? snap.data() : null;
    }
    return {
      ok: true,
      connections: connections.map(publicConnection),
      attention: attentionSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) })),
      mappings,
      audit: auditSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) })),
      // Phase 2: nothing is posted yet, so these are honest zeros, not placeholders.
      postings: { readyToPost: 0, awaitingReview: 0, awaitingBankMatch: 0, syncedToday: 0, phase: "read_only" }
    };
  });

  const accountingAttentionResolve = onCall({ region: REGION }, async (request) => {
    const actor = await requireOwner(request);
    const id = cleanText(request.data?.id, 200);
    const action = cleanText(request.data?.action, 20) || "resolve";
    if (!["resolve", "ignore"].includes(action)) throw new HttpsError("invalid-argument", "action must be resolve or ignore.");
    const reason = cleanText(request.data?.reason, 300);
    if (action === "ignore" && !reason) throw new HttpsError("invalid-argument", "Ignoring needs a reason.");
    await store.resolveAttention(db(), actor.companyId, id, { status: action === "ignore" ? "ignored" : "resolved", reason, actorUid: actor.uid, now: now() });
    await store.recordAudit(db(), actor.companyId, { action: `attention_${action}`, actorUid: actor.uid, summary: `${id}${reason ? `: ${reason}` : ""}` }, { now: now() });
    return { ok: true };
  });

  const accountingSyncActivity = onCall({ region: REGION }, async (request) => {
    const { companyId } = await requireReader(request);
    const r = store.refs(db(), companyId);
    const limit = Math.min(200, Math.max(10, Number(request.data?.limit) || 60));
    const [inboxSnap, auditSnap] = await Promise.all([
      r.inbox.orderBy("receivedAtMs", "desc").limit(limit).get(),
      r.audit.orderBy("createdAtMs", "desc").limit(limit).get()
    ]);
    return {
      ok: true,
      inbox: inboxSnap.docs.map((doc) => { const d = doc.data() || {}; return { id: doc.id, entityType: d.entityType, externalId: d.externalId, operation: d.operation, status: d.status, outcome: d.outcome || "", error: d.error || "", occurredAt: d.occurredAt, receivedAtMs: d.receivedAtMs, format: d.format }; }),
      audit: auditSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }))
    };
  });

  return {
    quickbooksConnectStart, quickbooksOAuthCallback, quickbooksSyncNow, quickbooksWebhook, quickbooksDisconnect,
    scheduledAccountingReconcile, accountingSetMode, accountingPlanMigration, accountingSaveMappings, accountingMappingSuggestions,
    accountingOverview, accountingAttentionResolve, accountingSyncActivity,
    _internal: { importCatalog, reconcileConnection, processWebhookEvents, processInboxEvent, refreshTokenWithLock, listConnections, sweep, disconnectQuickBooks, setMode, adapterFor, pandleAdapter, store, PROVIDER, ROOT_REALMS, CDC_ENTITIES }
  };
}

module.exports = { createAccountingFunctions, REGION, PROVIDER, ROOT_REALMS };
