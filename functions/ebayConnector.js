// The eBay connector — the ACCOUNT half (docs/ebay-connector-design.md).
//
// A seller's eBay account becomes one commerce connection on the common
// engine, read-only:
//
//   * Connecting is eBay's authorization-code grant for a server-held client
//     with a RuName redirect (§5). The state is a single-use document consumed
//     in a transaction and BOUND TO THE BROWSER that began the flow through a
//     nonce whose hash sits on the state doc; the code is exchanged server to
//     server; the seller is whoever the Identity API says, never the URL.
//   * Credentials live in their own server-only document, boxed under
//     EBAY_TOKEN_KEY (§4.2, §6), refreshed ahead of expiry behind a per-
//     connection lock, and classified BY BODY when the token endpoint refuses:
//     invalid_grant is the seller's problem (reconnect); invalid_client is our
//     keyset and never marks anybody reconnect_required.
//   * Buyer details are split off BEFORE the adapter (commerce/ebay/sanitize.js,
//     §8): the order document carries the buyer's username; the person lives in
//     companies/{cid}/restrictedCustomer and is revealed on demand through
//     revealRestrictedCustomer with an access-log line written first.
//   * Sync is polling on the common cursor with an overlap, BISECTED when a
//     window does not fit the page budget because eBay's page order is
//     unspecified (§7.1), a nightly lookback with a fulfilment follow-up (§7.6),
//     and a forced catch-up after a reconnect or a flag flip.
//   * Every path — sweep, Sync now, import, queue, held release — lands an
//     order through ONE applyEbayOrder and the engine's applyEnvelope (MERGE-006).
//   * The Marketplace Account Deletion endpoint answers eBay's challenge without
//     a secret and anonymises a buyer on a task that bypasses every gate (§9).
//     Its ledger dedups on COMPLETION: only a row that already says `done` is
//     answered `duplicate`, anything else is re-driven, and reconcileEbayDeletions
//     reads the ledger back every ten minutes so nothing is left waiting on eBay.
//   * Everything else ships gated off: a secrets marker, a runtime switch and a
//     Firestore connector flag, none of which gates deletion compliance (§2).
const crypto = require("crypto");
const engine = require("./commerce/engine");
const cursors = require("./commerce/cursors");
const health = require("./commerce/health");
const events = require("./commerce/events");
const worker = require("./commerce/worker");
const flagsModule = require("./commerce/flags");
const { normalizeEbayOrder } = require("./commerce/adapters/ebay");
const { ebayMarketplace } = require("./commerce/marketplaces");
const { EBAY_DEFAULTS, proveEbay } = require("./commerce/connectionCapabilities");
// The envelope's event origins. A nightly or catch-up pass is a reconciliation
// to the engine; the finer word stays in the sync log.
const EVENT_ORIGINS_LIST = ["provider", "import", "reconcile", "retry", "manual"];
const ebayOAuth = require("./commerce/ebay/oauth");
const ebayClientModule = require("./commerce/ebay/client");
const sanitize = require("./commerce/ebay/sanitize");
const notification = require("./commerce/ebay/notification");
const statusModule = require("./commerce/ebay/status");
const quota = require("./commerce/ebay/quota");
const cursorPlan = require("./commerce/ebay/cursorPlan");
const hashing = require("./commerce/ebay/hashing");
const { keyListOf } = require("./commerce/ebay/keys");
const reveal = require("./privacy/reveal");
const retention = require("./privacy/retention");
const { tokenNeedsRebox } = require("./security/tokenBox");

const CONNECTION_COLLECTION = "ebayConnections";
const STATE_COLLECTION = "ebayConnectStates";
const BUYER_INDEX_COLLECTION = "ebayBuyers";
const DELETION_LEDGER_COLLECTION = "ebayDeletionRequests";
const QUOTA_COLLECTION = "ebayQuota";
const KEY_CACHE_COLLECTION = "ebayNotificationKeys";
const RESTRICTED_SUBCOLLECTION = "restrictedCustomer";
const CREDENTIALS_SUBCOLLECTION = "credentials";
const CREDENTIALS_DOC = "current";
const REVEAL_COUNTERS_SUBCOLLECTION = "revealCounters";

const STATE_TTL_MS = 10 * 60 * 1000;
const DELIVERY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const LEDGER_TTL_MS = 400 * 24 * 60 * 60 * 1000;
const TOKEN_REFRESH_AHEAD_MS = 10 * 60 * 1000;          // eBay access tokens live ~2 h
const TOKEN_REFRESH_LOCK_MS = 90 * 1000;                // outlasts one refresh attempt chain
const REFRESH_TOKEN_WARN_MS = 14 * 24 * 60 * 60 * 1000; // §73: reconnect before the 18 months run out
const MAX_CONNECTIONS_PER_SWEEP = 25;
const RECONCILE_MAX_PAGES = 4;
const PAGE_SIZE = ebayClientModule.MAX_PAGE_SIZE;        // 200, eBay's documented maximum
const SYNC_LOCK_MS = 3 * 60 * 1000;
const IMPORT_LOCK_MS = 10 * 60 * 1000;
const PASS_BUDGET_MS = 400 * 1000;
const IMPORT_BUDGET_MS = 480 * 1000;
const PREVIEW_BUDGET_MS = 120 * 1000;
const PREVIEW_MAX_PAGES = 20;
const IMPORT_SLICE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FAILED_IDS = 500;
const STAND_DOWN_CATCH_UP_MS = 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const KEY_CACHE_MEMORY_MS = 60 * 60 * 1000;
const KEY_CACHE_DOC_MS = 24 * 60 * 60 * 1000;
const UNKNOWN_KID_NEGATIVE_MS = 6 * 60 * 60 * 1000;
const MAX_DELETION_ATTEMPTS = 6;
// The deletion ledger is a WORK LIST, not a receipt. A row is claimed with a
// lease so two deliveries of the same notification do not both drive it, and
// the lease expires so a process that died mid-anonymisation does not park the
// row forever. `reconcileEbayDeletions` re-drives whatever is still queued or
// failed once the lease is out and the backoff has passed (§9).
const DELETION_LEASE_MS = 5 * 60 * 1000;
const DELETION_RETRY_AFTER_MS = 5 * 60 * 1000;
const DELETION_MAX_BACKOFF_MS = 6 * 60 * 60 * 1000;
const DELETION_RECONCILE_LIMIT = 50;
const CONNECTION_ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;
// The callback transport (§5.4). eBay lands the seller's browser on the web
// route; the web route relays the code as a SIGNED POST, because Cloud Run
// writes httpRequest.requestUrl — query string included — into Cloud Logging on
// every request, and a code or a nonce in a query string is a code or a nonce in
// the log. The body cap is checked BEFORE the HMAC, so it bounds the work the
// signature check does; the state shape is checked BEFORE states().doc(), so a
// path-shaped state can never reach Firestore's argument validator, whose error
// message embeds the rejected path.
const CALLBACK_MAX_BODY_BYTES = 8192;
const CALLBACK_SKEW_MS = 5 * 60 * 1000;
const CALLBACK_KEY_MIN_LENGTH = 32;
const CALLBACK_MAX_CODE_LENGTH = 4096;
const CALLBACK_MAX_NONCE_LENGTH = 200;
const CALLBACK_RID_PATTERN = /^[0-9a-f]{16}$/;
const CALLBACK_STATE_PATTERN = /^[A-Za-z0-9_-]{20,120}$/;

function safeIdPart(value) { return String(value || "").replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 120); }
function connectionDocId(companyId, sellerUserId) { return `${safeIdPart(companyId)}__${safeIdPart(sellerUserId)}`; }
function ebayOrderDocId(companyId, orderId) { return `ebay_${safeIdPart(companyId)}_${safeIdPart(orderId)}`; }
function sha256hex(value) { return crypto.createHash("sha256").update(String(value || "")).digest("hex"); }
function chunk(list, size) { const out = []; for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size)); return out; }
const n = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

function createEbayConnectorFunctions(deps) {
  const {
    admin, HttpsError, onCall, onRequest, onSchedule = null, onTaskDispatched = null,
    clientId, clientSecret, tokenKey, hashKey, callbackKey = () => "", environment = () => "sandbox", ruName = () => "",
    deletionToken = () => "", deletionEndpointUrl = () => "", dailyCap = () => quota.DEFAULT_DAILY_CAP,
    connectorEnabled = () => false,
    encryptToken, decryptToken,
    requireWorkspaceOwner, requireWorkspaceMember, isWorkspaceOwner = (companyData, uid) => String(companyData?.ownerUid || "") === String(uid || ""),
    isWorkflowOnlyMember = (companyData, uid) => /^workflow/i.test(String(companyData?.members?.[uid]?.role || "")),
    appReturnUrl, functionsBaseUrl,
    orderDocRef, integrationOrderCapacity, holdIntegrationOrder, sendPushNotificationToCompany = async () => {},
    reconcileLineItems, resolveDefaultDeliveryTime, companySettingsDocRef,
    enqueue = null, recordPiiAccess = async () => {},
    createClient = ebayClientModule.createEbayClient, oauth = ebayOAuth, notificationVerifier = notification.verifyNotification,
    fetchImpl = globalThis.fetch, now = () => Date.now()
  } = deps;

  const db = () => admin.firestore();
  const connections = () => db().collection(CONNECTION_COLLECTION);
  const states = () => db().collection(STATE_COLLECTION);
  const buyers = () => db().collection(BUYER_INDEX_COLLECTION);
  const ledgerRows = () => db().collection(DELETION_LEDGER_COLLECTION);
  const FieldValue = admin.firestore.FieldValue;
  const env = () => ebayOAuth.ebayEnvironment(environment());
  const configured = () => Boolean(String(clientId() || "").trim());
  const connectorOn = () => connectorEnabled() === true;
  const tokenKeys = () => keyListOf(tokenKey());
  const hashKeys = () => keyListOf(hashKey());
  const limits = { importSliceBudget: Infinity, passBudgetMs: PASS_BUDGET_MS, importBudgetMs: IMPORT_BUDGET_MS, refreshWaitPolls: 120 };
  const ledger = () => quota.createQuotaLedger({ db: db(), FieldValue, perDay: Number(dailyCap()) || quota.DEFAULT_DAILY_CAP, now, collection: QUOTA_COLLECTION });
  const credentialsRef = (ref) => ref.collection(CREDENTIALS_SUBCOLLECTION).doc(CREDENTIALS_DOC);
  const restrictedRef = (companyId, orderDocId) => db().collection("companies").doc(companyId).collection(RESTRICTED_SUBCOLLECTION).doc(orderDocId);

  // ---- secrets at rest --------------------------------------------------------
  const box = (plain) => encryptToken(plain, tokenKeys());
  const unbox = (b) => (b && typeof b === "object" ? decryptToken(b, tokenKeys()) : "");

  function classedError(message, errorClass, code, extra = {}) {
    const error = new Error(message); error.errorClass = errorClass; error.code = code; Object.assign(error, extra); return error;
  }

  async function flagsNow() { return flagsModule.readCommerceFlags(db(), { now: now() }); }
  async function flagOn(connectionId) { return flagsModule.flagEnabled(await flagsNow(), "connectors", "ebay", connectionId); }
  async function providerFlagOn() { const flags = await flagsNow(); const section = flags.connectors || {}; if (section.providers && Object.prototype.hasOwnProperty.call(section.providers, "ebay")) return section.providers.ebay === true; return section.enabled === true; }

  async function writeSyncEvent(ref, event) {
    try { await ref.collection("syncLog").add({ ts: FieldValue.serverTimestamp(), atMs: now(), ...event }); }
    catch (error) { console.warn("ebay syncLog write failed:", error?.message || error); }
  }

  // ---- whitelists (§4.11): nothing reaches set(merge) unshaped ----------------
  function settingsOf(data) {
    const s = (data && data.settings) || {};
    return { autoSync: s.autoSync !== false, includeUnpaid: s.includeUnpaid === true, includeCancelled: s.includeCancelled !== false };
  }
  function marketplaceRows(data) {
    return (Array.isArray(data?.marketplaces) ? data.marketplaces : []).filter((m) => m && typeof m === "object" && m.marketplace)
      .map((m) => ({ marketplace: String(m.marketplace).toUpperCase(), enabled: m.enabled !== false, currency: String(m.currency || "") }));
  }
  function marketplacesOf(existing, patch) {
    const rows = marketplaceRows({ marketplaces: existing });
    if (!Array.isArray(patch)) return rows;
    const known = new Map(rows.map((r) => [r.marketplace, r]));
    for (const entry of patch) {
      const id = String(entry?.marketplace || "").toUpperCase();
      const row = known.get(id);
      if (!row || typeof entry.enabled !== "boolean" || !ebayMarketplace(id)) throw new HttpsError("invalid-argument", "Unknown eBay marketplace for this account.");
      if (entry.currency !== undefined && String(entry.currency) !== row.currency) throw new HttpsError("invalid-argument", "Unknown eBay marketplace for this account.");
      row.enabled = entry.enabled;
    }
    return [...known.values()];
  }
  function clampSinceDays(value) { return Math.min(Math.max(Number(value) || 90, 1), 90); }
  function cleanConnectionId(value) {
    const id = String(value || "").trim();
    if (!CONNECTION_ID_PATTERN.test(id)) throw new HttpsError("invalid-argument", "connectionId is required.");
    return id;
  }

  // ---- the public view (§11.3): never a token, a box, a hash or a nonce hash --
  function publicView(id, data, { flagOn: on = true, quotaDoc = null, recentEvents = [] } = {}) {
    const importCursor = data.importCursor && typeof data.importCursor === "object" ? data.importCursor : null;
    const specStatus = statusModule.specStatusOf(data, { flagOn: on, now: now() });
    const refreshExpiresAt = n(data.refreshTokenExpiresAtMs);
    return {
      id, provider: "ebay", environment: String(data.environment || "sandbox"),
      sellerUsername: String(data.sellerUsername || ""), sellerUserId: String(data.sellerUserId || ""), displayName: String(data.displayName || data.sellerUsername || ""),
      registrationMarketplaceId: String(data.registrationMarketplaceId || ""), marketplaces: marketplaceRows(data),
      status: String(data.status || "connecting"), specStatus, readOnly: true,
      scopes: Array.isArray(data.scopes) ? data.scopes.map(String) : [],
      capabilities: data.capabilities && typeof data.capabilities === "object" ? { ...data.capabilities } : proveEbay(EBAY_DEFAULTS, { "orders.read": true }),
      settings: settingsOf(data), importState: String(data.importState || "none"),
      importCounters: data.importCounters && typeof data.importCounters === "object" ? { created: n(data.importCounters.created), updated: n(data.importCounters.updated), held: n(data.importCounters.held), skipped: n(data.importCounters.skipped), failed: n(data.importCounters.failed) } : { created: 0, updated: 0, held: 0, skipped: 0, failed: 0 },
      importCursor: importCursor ? { complete: String(data.importState || "") === "done", failedCount: Array.isArray(importCursor.failedIds) ? importCursor.failedIds.length : 0 } : null,
      connectedAtMs: n(data.connectedAtMs), lastSyncAtMs: n(data.lastSyncAtMs), lastSuccessAtMs: n(data.lastSuccessAtMs), lastVerifiedAtMs: n(data.lastVerifiedAtMs), lastFullReconciliationAtMs: n(data.lastFullReconciliationAtMs),
      lastErrorCode: String(data.lastErrorCode || ""), lastErrorAtMs: n(data.lastErrorAtMs),
      reauthorizeByMs: refreshExpiresAt > 0 ? refreshExpiresAt - REFRESH_TOKEN_WARN_MS : 0,
      needsReconnect: specStatus === "reauthorization_required", paused: specStatus === "suspended",
      quota: quota.quotaView(quotaDoc, id, Number(dailyCap()) || quota.DEFAULT_DAILY_CAP),
      lastReconcile: data.lastReconcile && typeof data.lastReconcile === "object" ? data.lastReconcile : null,
      recentEvents
    };
  }

  async function loadOwnedConnection(companyId, connectionId) {
    const id = cleanConnectionId(connectionId);
    const snap = await connections().doc(id).get();
    const data = snap.exists ? (snap.data() || {}) : null;
    if (!data) throw new HttpsError("not-found", "No such eBay connection.");
    if (String(data.companyId || "") !== companyId) throw new HttpsError("permission-denied", "This eBay connection belongs to another workspace.");
    return { ref: snap.ref, data };
  }

  // ---- the callback's transport (§5.4) ---------------------------------------
  // The function answers JSON and never redirects: the seller's browser does not
  // meet this host at all, and the web route turns an answer into a redirect.
  function answerCallback(res, status, payload) {
    if (typeof res.set === "function") res.set("cache-control", "no-store");
    res.status(status).json(payload);
  }
  // HMAC-SHA256(key, "v1." + timestamp + "." + rawBody), over the bytes Cloud Run
  // received — never over a re-serialisation of req.body, which would silently
  // break an exact-bytes signature.
  function callbackDigest(key, timestamp, rawBody) {
    return crypto.createHmac("sha256", key).update(`v1.${timestamp}.`, "utf8").update(rawBody).digest("hex");
  }
  function signatureAccepted(key, headers, rawBody) {
    const timestamp = String(headers["x-nivadesk-timestamp"] || "");
    if (!/^\d{1,15}$/.test(timestamp)) return false;
    if (Math.abs(now() - Number(timestamp)) > CALLBACK_SKEW_MS) return false;   // stale AND future
    const presented = String(headers["x-nivadesk-signature"] || "");
    if (!presented.startsWith("v1=")) return false;
    const offered = Buffer.from(presented.slice(3), "utf8");
    const expected = Buffer.from(callbackDigest(key, timestamp, rawBody), "utf8");
    // timingSafeEqual throws on unequal lengths, so the length is guarded first;
    // the length of a hex digest is public, and the comparison itself is constant time.
    if (offered.length !== expected.length) return false;
    return crypto.timingSafeEqual(offered, expected);
  }

  // ---- token failures, classified by body (§6) -------------------------------
  async function recordTokenFailure(ref, error) {
    const cls = String(error?.errorClass || events.classifyError(error));
    const code = String(error?.code || "");
    const atMs = now();
    if (cls === "auth") {
      const lastErrorCode = code === "token_unreadable" ? "token_unreadable" : "credentials_rejected";
      await ref.set({ status: "reconnect_required", lastErrorCode, lastErrorAtMs: atMs, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await writeSyncEvent(ref, { type: "reauthorization_required", error: lastErrorCode });
      return lastErrorCode;
    }
    if (cls === "permission" && code === "app_credentials_invalid") {
      console.error("ebay: application credentials rejected", ref.id);
      await ref.set({ lastErrorCode: "app_credentials_invalid", lastErrorAtMs: atMs, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await writeSyncEvent(ref, { type: "app_credentials_invalid" });
      return "app_credentials_invalid";
    }
    if (cls === "permission") {
      await ref.set({ lastErrorCode: "permission_missing", lastErrorAtMs: atMs, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return "permission_missing";
    }
    if (cls === "validation") {
      console.error("ebay: token request rejected as malformed", ref.id);
      await ref.set({ lastErrorCode: "token_request_invalid", lastErrorAtMs: atMs, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await writeSyncEvent(ref, { type: "token_refresh_failed", error: "token_request_invalid" });
      return "token_request_invalid";
    }
    const lastErrorCode = code === "rate_limited" || Number(error?.status) === 429 ? "rate_limited" : "provider_unavailable";
    await ref.set({ lastErrorCode, lastErrorAtMs: atMs, ...(lastErrorCode === "rate_limited" ? { rateLimitedUntilMs: atMs + (events.parseRetryAfter(error?.retryAfter) || 900) * 1000 } : {}), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await writeSyncEvent(ref, { type: lastErrorCode === "rate_limited" ? "rate_limited" : "token_refresh_failed", error: lastErrorCode });
    return lastErrorCode;
  }

  async function storeCredentials(ref, tokens, { grantedAtMs }) {
    const accessToken = String(tokens?.access_token || "");
    const refresh = String(tokens?.refresh_token || "");
    if (!accessToken || !refresh) throw classedError("ebay_token_incomplete", "validation", "token_request_invalid");
    const expiry = ebayOAuth.tokenExpiryOf(tokens, now());
    await credentialsRef(ref).set({
      accessTokenEncrypted: box(accessToken), refreshTokenEncrypted: box(refresh),
      accessTokenExpiresAtMs: expiry.accessTokenExpiresAtMs, refreshTokenExpiresAtMs: expiry.refreshTokenExpiresAtMs,
      refreshLockUntilMs: 0, refreshedAtMs: 0, grantedAtMs, updatedAt: FieldValue.serverTimestamp()
    });
    return expiry;
  }

  /** One refresh per connection at a time; the loser waits for the winner, then refuses an expired token rather than racing. */
  async function refreshWithLock(ref, data, { force = false } = {}) {
    const credRef = credentialsRef(ref);
    const claim = async () => db().runTransaction(async (tx) => {
      const snap = await tx.get(credRef);
      if (!snap.exists) return { missing: true };
      const row = snap.data() || {};
      if (n(row.refreshLockUntilMs) > now()) return { locked: true, row };
      if (!force && n(row.accessTokenExpiresAtMs) - now() > TOKEN_REFRESH_AHEAD_MS) return { fresh: true, row };
      tx.update(credRef, { refreshLockUntilMs: now() + TOKEN_REFRESH_LOCK_MS });
      return { row };
    });
    let claimed = await claim();
    if (claimed.missing) { const e = classedError("ebay_credentials_missing", "auth", "token_unreadable"); await recordTokenFailure(ref, e); throw e; }
    if (claimed.locked) {
      // The winner is refreshing; wait for it (bounded in polls, not only in
      // clock time, so a frozen test clock cannot spin forever), then read what
      // it wrote.
      const until = now() + TOKEN_REFRESH_LOCK_MS;
      let polls = 0;
      while (claimed.locked && now() < until && polls < limits.refreshWaitPolls) {
        polls += 1;
        await new Promise((resolve) => setTimeout(resolve, 25));
        claimed = await claim();
      }
      if (claimed.locked) throw new HttpsError("unavailable", "The eBay connection is being refreshed. Try again shortly.");
      if (claimed.fresh || (claimed.row && n(claimed.row.accessTokenExpiresAtMs) > now() + 5000)) return unbox(claimed.row.accessTokenEncrypted);
      if (!claimed.row) throw new HttpsError("unavailable", "The eBay connection is being refreshed. Try again shortly.");
    }
    if (claimed.fresh) return unbox(claimed.row.accessTokenEncrypted);
    let refresh = "";
    try { refresh = unbox(claimed.row.refreshTokenEncrypted); } catch { refresh = ""; }
    if (!refresh) { await credRef.set({ refreshLockUntilMs: 0 }, { merge: true }); const e = classedError("ebay_refresh_token_unreadable", "auth", "token_unreadable"); await recordTokenFailure(ref, e); throw e; }
    try {
      const tokens = await oauth.refreshToken({ environment: env(), clientId: clientId(), clientSecret: clientSecret(), refreshToken: refresh, scopes: Array.isArray(data?.scopes) && data.scopes.length ? data.scopes : ebayOAuth.SCOPES, fetchImpl });
      const accessToken = String(tokens?.access_token || "");
      if (!accessToken) throw classedError("ebay_refresh_incomplete", "transient", "provider_unavailable");
      const expiry = ebayOAuth.tokenExpiryOf(tokens, now());
      const patch = { accessTokenEncrypted: box(accessToken), accessTokenExpiresAtMs: expiry.accessTokenExpiresAtMs, refreshedAtMs: now(), refreshLockUntilMs: 0, updatedAt: FieldValue.serverTimestamp() };
      const mirror = { accessTokenExpiresAtMs: expiry.accessTokenExpiresAtMs, updatedAt: FieldValue.serverTimestamp() };
      if (tokens?.refresh_token) { patch.refreshTokenEncrypted = box(String(tokens.refresh_token)); patch.refreshTokenExpiresAtMs = expiry.refreshTokenExpiresAtMs; mirror.refreshTokenExpiresAtMs = expiry.refreshTokenExpiresAtMs; }
      await credRef.set(patch, { merge: true });
      await ref.set(mirror, { merge: true });
      return accessToken;
    } catch (error) {
      await credRef.set({ refreshLockUntilMs: 0 }, { merge: true }).catch(() => undefined);
      await recordTokenFailure(ref, error);
      throw error;
    }
  }

  async function clientFor(ref, data, { priority = "people" } = {}) {
    const credSnap = await credentialsRef(ref).get();
    const cred = credSnap.exists ? (credSnap.data() || {}) : null;
    if (!cred) { const e = classedError("ebay_credentials_missing", "auth", "token_unreadable"); await recordTokenFailure(ref, e); throw e; }
    let accessToken = "";
    try { accessToken = unbox(cred.accessTokenEncrypted); } catch { accessToken = ""; }
    if (!accessToken) { const e = classedError("ebay_token_unreadable", "auth", "token_unreadable"); await recordTokenFailure(ref, e); throw e; }
    // Secret rotation finishes by itself: a box on the old key is re-sealed on its next read (§6).
    if (tokenNeedsRebox(cred.accessTokenEncrypted, tokenKeys()) || tokenNeedsRebox(cred.refreshTokenEncrypted, tokenKeys())) {
      try {
        const refresh = unbox(cred.refreshTokenEncrypted);
        await credentialsRef(ref).set({ accessTokenEncrypted: box(accessToken), ...(refresh ? { refreshTokenEncrypted: box(refresh) } : {}), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      } catch (error) { console.warn("ebay rebox failed:", ref.id, error?.message || error); }
    }
    if (n(cred.accessTokenExpiresAtMs) - now() < TOKEN_REFRESH_AHEAD_MS) accessToken = await refreshWithLock(ref, data);
    return createClient({
      environment: env(), accessToken, fetchImpl,
      onUnauthorized: () => refreshWithLock(ref, data, { force: true }).catch(() => ""),
      quota: { charge: ({ family }) => ledger().charge({ connectionId: ref.id, family, priority }) }
    });
  }

  // ---- 1. begin: the owner presses Connect eBay (§5) --------------------------
  const beginEbayConnect = onCall({ region: "europe-west2", timeoutSeconds: 60 }, async (request) => {
    const { uid, companyId } = await requireWorkspaceOwner(request);
    if (!connectorOn()) throw new HttpsError("failed-precondition", "eBay is not enabled on this server yet.");
    if (!configured() || !String(ruName() || "").trim()) throw new HttpsError("failed-precondition", "eBay is not configured on this server yet.");
    if (!(await providerFlagOn())) throw new HttpsError("failed-precondition", "eBay is not enabled on this server yet.");
    const origin = String(request.data?.origin || "") === "native" ? "native" : "web";
    const state = crypto.randomBytes(32).toString("base64url");
    const nonce = crypto.randomBytes(24).toString("base64url");
    const scopes = ebayOAuth.SCOPES.slice();
    await states().doc(state).set({
      companyId, uid, environment: env(), redirectRuName: String(ruName()), scopes, nonceHash: sha256hex(nonce), origin, claimedAtMs: 0,
      createdAt: FieldValue.serverTimestamp(), expiresAt: now() + STATE_TTL_MS, expireAt: admin.firestore.Timestamp.fromMillis(now() + STATE_TTL_MS), used: false
    });
    const authorizeUrl = oauth.authorizeUrl({ environment: env(), clientId: clientId(), ruName: ruName(), state, scopes });
    // A native app cannot set the browser cookie, so it gets no nonce and no URL to open directly (§5.2).
    if (origin === "native") return { ok: true, state, scopes, environment: env(), startUrl: `${appReturnUrl().replace(/\/settings.*$/, "")}/ebay/start?state=${encodeURIComponent(state)}` };
    return { ok: true, authorizeUrl, state, nonce, scopes, environment: env() };
  });

  /** §5.2 — the web start page, signed in as the uid that began the flow, claims the nonce once. */
  const claimEbayConnectState = onCall({ region: "europe-west2", timeoutSeconds: 60 }, async (request) => {
    const uid = String(request.auth?.uid || "");
    if (!uid) throw new HttpsError("unauthenticated", "Sign in to continue connecting eBay.");
    if (!connectorOn()) throw new HttpsError("failed-precondition", "eBay is not enabled on this server yet.");
    const state = String(request.data?.state || "").trim();
    if (!/^[A-Za-z0-9_-]{20,120}$/.test(state)) throw new HttpsError("invalid-argument", "state is required.");
    const nonce = crypto.randomBytes(24).toString("base64url");
    const claimed = await db().runTransaction(async (tx) => {
      const ref = states().doc(state);
      const snap = await tx.get(ref);
      if (!snap.exists) return { error: "not-found" };
      const row = snap.data() || {};
      if (String(row.uid || "") !== uid) return { error: "permission-denied" };
      if (row.used === true || n(row.expiresAt) < now()) return { error: "expired" };
      if (n(row.claimedAtMs) > 0) return { error: "claimed" };
      tx.update(ref, { claimedAtMs: now(), nonceHash: sha256hex(nonce) });
      return { row };
    });
    if (claimed.error === "permission-denied") throw new HttpsError("permission-denied", "This eBay connection was started by a different NivaDesk user.");
    if (claimed.error) throw new HttpsError("failed-precondition", "The eBay sign-in link has expired or was already used. Start again.");
    const row = claimed.row;
    return { ok: true, nonce, authorizeUrl: oauth.authorizeUrl({ environment: env(), clientId: clientId(), ruName: ruName(), state, scopes: Array.isArray(row.scopes) && row.scopes.length ? row.scopes : ebayOAuth.SCOPES }) };
  });

  // ---- 2. callback: the web route relays eBay's code as a signed POST (§5.4) --
  // The transport moved; not one decision did. eBay still sends the seller's
  // browser to nivadesk.app, and everything after that is a server-to-server
  // POST whose body is signed with EBAY_CALLBACK_KEY. GET answers 405: there is
  // no live caller to keep working, and a GET would reopen the very hole this
  // closes — a query string that Cloud Run copies into the log.
  //
  // The order is: method ▸ query ▸ rawBody ▸ key ▸ signature ▸ parse ▸ rid ▸
  // gate ▸ presence ▸ shapes ▸ state transaction (the burn) ▸ exchange. The
  // connector gate sits AFTER the signature on purpose: whether the connector is
  // switched on is not a fact an unauthenticated caller may read.
  //
  // Nothing from the body reaches a log line on any path, error paths included.
  // Two traps make that fail silently unless they are named: a caught error's
  // message can carry the value that threw (JSON.parse echoes the body's first
  // ten characters; Firestore's .doc() embeds the rejected path), and an UNCAUGHT
  // throw is logged by the platform with its message and stack — the one channel
  // these rules cannot govern. Hence: no error message, stack or object is ever
  // passed to console.*, and the whole body sits inside one outermost try.
  const ebayOAuthCallback = onRequest({ region: "europe-west2", timeoutSeconds: 120, maxInstances: 10 }, async (req, res) => {
    let answered = false;
    const answer = (status, payload) => { answered = true; answerCallback(res, status, payload); };
    let rid = "";
    let state = "";
    let code = "";
    let nonce = "";
    try {
    if (String(req.method || "").toUpperCase() !== "POST") { answer(405, { ok: false }); return; }
    // Nothing in this contract puts a value in a URL. The parsed query object is
    // deliberately never read — Firebase's Express layer always populates it, so
    // its emptiness proves nothing, and reading it is the habit that leaked the
    // code into Cloud Logging in the first place. The raw URL is the mechanism.
    if (String(req.originalUrl || req.url || "").includes("?")) { console.warn("ebay callback: query string refused"); answer(400, { ok: false }); return; }
    const rawBody = req.rawBody;
    // A request with no raw bytes cannot be authenticated. It is never guessed at
    // by re-serialising req.body: that breaks an exact-bytes HMAC silently.
    if (!Buffer.isBuffer(rawBody)) { console.warn("ebay callback: rejected unsigned request"); answer(401, { ok: false }); return; }
    if (rawBody.length > CALLBACK_MAX_BODY_BYTES) { console.warn("ebay callback: body refused", rawBody.length); answer(400, { ok: false }); return; }
    const key = String(callbackKey() || "");
    // Fails closed — and closes it with the SAME status a wrong key gets, so the
    // answer cannot be used as an unauthenticated oracle for whether the secret
    // exists. The distinction lives only in this ops line (§5.4, "no 503").
    if (key.length < CALLBACK_KEY_MIN_LENGTH) { console.error("ebay callback: EBAY_CALLBACK_KEY not configured"); answer(401, { ok: false }); return; }
    if (!signatureAccepted(key, req.headers || {}, rawBody)) { console.warn("ebay callback: rejected unsigned request"); answer(401, { ok: false }); return; }
    let body = null;
    try { body = JSON.parse(rawBody.toString("utf8")); } catch { body = null; }
    // The parse error's message quotes the body back; the byte length is all the log gets.
    if (!body || typeof body !== "object" || Array.isArray(body) || Number(body.v) !== 1) { console.warn("ebay callback: body refused", rawBody.length); answer(400, { ok: false }); return; }
    // rid is caller-controlled: a signer could otherwise set it to the code and
    // have us write that into the log under a field this design pre-approved for
    // logging. It is shaped BEFORE it is logged, echoed or used in any way.
    if (!CALLBACK_RID_PATTERN.test(String(body.rid || ""))) { console.warn("ebay callback: rid refused"); answer(400, { ok: false }); return; }
    rid = String(body.rid);
    if (!connectorOn()) { answer(200, { ok: false, outcome: "error", reason: "disabled", rid }); return; }
    state = String(body.state || "");
    code = String(body.code || "");
    nonce = typeof body.nonce === "string" ? body.nonce : "";
    // Absence is a seller-facing outcome and stays one; malformation is a
    // protocol error. The web route checks both too, but this side is authoritative.
    if (!state || !code) { answer(200, { ok: false, outcome: "error", reason: "missing_code", rid }); return; }
    // The state shape is a security control, not tidiness: Firestore's argument
    // validation puts the rejected path INTO the error message, and a document id
    // may be 1500 bytes, so neither .doc() nor a length check is a filter.
    if (!CALLBACK_STATE_PATTERN.test(state)) { console.warn(`ebay callback: field shape refused rid=${rid}`, "state"); answer(400, { ok: false, rid }); return; }
    if (code.length > CALLBACK_MAX_CODE_LENGTH) { console.warn(`ebay callback: field shape refused rid=${rid}`, "code"); answer(400, { ok: false, rid }); return; }
    if (typeof body.nonce !== "undefined" && (typeof body.nonce !== "string" || body.nonce.length > CALLBACK_MAX_NONCE_LENGTH)) { console.warn(`ebay callback: field shape refused rid=${rid}`, "nonce"); answer(400, { ok: false, rid }); return; }
    let verdict = { reason: "state", row: null };
    try {
      verdict = await db().runTransaction(async (tx) => {
        const ref = states().doc(state);
        const snap = await tx.get(ref);
        if (!snap.exists) return { reason: "state" };
        const row = snap.data() || {};
        if (row.used === true || n(row.expiresAt) < now()) return { reason: "state" };
        // Burned whatever the answer: a second attempt with the right nonce cannot follow a wrong one (§4.5).
        tx.update(ref, { used: true, usedAt: FieldValue.serverTimestamp() });
        if (!nonce || sha256hex(nonce) !== String(row.nonceHash || "")) return { reason: "browser" };
        if (String(row.environment || "sandbox") !== env()) return { reason: "environment" };
        return { reason: "", row };
      });
      // A fixed string, the validated rid and the numeric gRPC status — never
      // error.message, which for an argument error carries the path that threw.
    } catch (error) { console.error(`ebay callback: state transaction failed rid=${rid} code=${Number(error?.code) || 0}`); verdict = { reason: "state" }; }
    if (verdict.reason) { answer(200, { ok: false, outcome: "error", reason: verdict.reason, rid }); return; }
    const stateData = verdict.row;
    try {
      const tokens = await oauth.exchangeCode({ environment: env(), clientId: clientId(), clientSecret: clientSecret(), code, ruName: String(stateData.redirectRuName || ruName()), fetchImpl });
      const accessToken = String(tokens?.access_token || "");
      if (!accessToken || !String(tokens?.refresh_token || "")) throw classedError("ebay_token_incomplete", "validation", "token_request_invalid");
      let identity;
      try { identity = await oauth.fetchIdentity({ environment: env(), accessToken, fetchImpl }); }
      catch (error) { if (error?.code === "no_seller" || Number(error?.status) === 403) { answer(200, { ok: false, outcome: "error", reason: "no_seller", rid }); return; } throw error; }
      if (!identity || !identity.userId) { answer(200, { ok: false, outcome: "error", reason: "no_seller", rid }); return; }
      const companyId = String(stateData.companyId || "");
      const id = connectionDocId(companyId, identity.userId);
      const ref = connections().doc(id);
      const existingSnap = await ref.get();
      const existing = existingSnap.exists ? (existingSnap.data() || {}) : null;
      const granted = String(tokens?.scope || "").split(/\s+/).filter(Boolean);
      const scopes = granted.length ? granted : (Array.isArray(stateData.scopes) && stateData.scopes.length ? stateData.scopes.map(String) : ebayOAuth.SCOPES.slice());
      const registration = String(identity.registrationMarketplaceId || "").toUpperCase();
      const knownMarket = ebayMarketplace(registration);
      const marketplaces = existing ? marketplaceRows(existing) : [];
      if (knownMarket && !marketplaces.some((m) => m.marketplace === registration)) marketplaces.push({ marketplace: registration, enabled: true, currency: knownMarket.currency });
      const expiry = await storeCredentials(ref, tokens, { grantedAtMs: now() });
      const patch = {
        companyId, provider: "ebay", environment: env(),
        sellerUserId: identity.userId, sellerUserIdHash: hashing.userIdHash(hashKeys()[0], identity.userId),
        sellerUsername: identity.username, displayName: identity.username || identity.userId, accountType: identity.accountType, registrationMarketplaceId: registration,
        marketplaces, status: "connected", readOnly: true, scopes,
        capabilities: proveEbay(EBAY_DEFAULTS, { "orders.read": true }),
        settings: existing ? settingsOf(existing) : settingsOf({}),
        hasCredentials: true, accessTokenExpiresAtMs: expiry.accessTokenExpiresAtMs, refreshTokenExpiresAtMs: expiry.refreshTokenExpiresAtMs,
        importState: existing ? String(existing.importState || "none") : "none",
        connectedAtMs: existing && n(existing.connectedAtMs) ? n(existing.connectedAtMs) : now(), connectedByUid: String(stateData.uid || ""), reconnectedAtMs: existing ? now() : 0,
        lastErrorCode: "", lastErrorAtMs: 0, rateLimitedUntilMs: 0, syncLockUntilMs: 0,
        disconnectedAtMs: 0, disconnectedByUid: "", disconnectReason: "",
        notificationSubscriptionId: existing ? String(existing.notificationSubscriptionId || "") : "",
        updatedAt: FieldValue.serverTimestamp()
      };
      if (existing) {
        // The gap since the last successful pass is read again on the next pass (§7.6).
        const cursor = await cursors.readCursor(db(), "ebay", id, "order");
        const from = n(cursor?.watermarkMs) || n(existing.lastSuccessAtMs) || n(existing.connectedAtMs) || now();
        patch.catchUpDueFromMs = n(existing.catchUpDueFromMs) > 0 ? Math.min(n(existing.catchUpDueFromMs), from) : from;
      } else { patch.catchUpDueFromMs = 0; patch.lastSyncAtMs = 0; patch.lastSuccessAtMs = 0; patch.lastVerifiedAtMs = now(); patch.lastFullReconciliationAtMs = 0; }
      await ref.set(patch, { merge: true });
      await states().doc(state).set({ connectionId: id }, { merge: true });
      await writeSyncEvent(ref, { type: existing ? "reconnected" : "connected", actor: String(stateData.uid || "") });
      await health.touchHealth(db(), { provider: "ebay", connectionId: id, companyId, kind: "success", now: now(), FieldValue }).catch(() => undefined);
      answer(200, { ok: true, outcome: "connected", rid });
    } catch (error) {
      // §5.4's one logging exception, applied at exactly its stated width.
      // §14.1 pins the MESSAGE of an EbayOAuthError to eBay's own error /
      // error_description, and pins nothing else — but the try above is far
      // wider than the two oauth calls: storeCredentials, the connection read
      // and write, the state merge, the cursor read and the health touch all
      // land here too, and none of their messages is pinned by anything. A
      // future throw built by interpolating the code, the state or a token into
      // its message would otherwise ship straight into Cloud Logging past every
      // pin in the suite — the pins constrain this line, not what reaches it. So the
      // message is logged ONLY for the pinned class — matched by `name`, not
      // `instanceof`, because `oauth` is an injected dep and a second copy of
      // the module (or a subclass) would slip an identity check — and every
      // other throw is a fixed string plus its classification word, which comes
      // from a closed vocabulary and can carry no value.
      const cls = String(error?.errorClass || events.classifyError(error) || "");
      const errorClass = events.ERROR_CLASSES.has(cls) ? cls : "unknown";
      if (error?.name === "EbayOAuthError") console.error("ebayOAuthCallback failed:", String(error?.message || "").slice(0, 200));
      else console.error(`ebayOAuthCallback failed: rid=${rid} class=${errorClass}`);
      answer(200, { ok: false, outcome: "error", reason: errorClass === "auth" ? "token" : "exchange", rid });
    }
    } catch {
      // The backstop, not a control: every expected condition is answered above
      // it. A fixed string with no arguments — an unexpected throw is exactly the
      // case where the message is most likely to be carrying the value.
      console.error("ebay callback: refused");
      if (!answered) answerCallback(res, 400, { ok: false });
    }
  });

  // ---- 3. reading and managing a connection -----------------------------------
  const getEbayConnections = onCall({ region: "europe-west2", timeoutSeconds: 60 }, async (request) => {
    const { companyId } = await requireWorkspaceMember(request);
    const snap = await connections().where("companyId", "==", companyId).get();
    const flags = await flagsNow();
    let quotaDoc = null;
    try { quotaDoc = await ledger().read(); } catch { quotaDoc = null; }
    const rows = [];
    for (const doc of snap.docs) {
      const data = doc.data() || {};
      let recentEvents = [];
      try {
        const log = await doc.ref.collection("syncLog").orderBy("ts", "desc").limit(9).get();
        recentEvents = log.docs.map((row) => { const e = row.data() || {}; return { atMs: n(e.atMs), type: String(e.type || ""), error: String(e.error || "").slice(0, 200), orderId: String(e.orderId || ""), reason: String(e.reason || "").slice(0, 60) }; });
      } catch { recentEvents = []; }
      const on = connectorOn() && flagsModule.flagEnabled(flags, "connectors", "ebay", doc.id);
      rows.push(publicView(doc.id, data, { flagOn: on, quotaDoc, recentEvents }));
    }
    return { ok: true, connections: rows, configured: configured() && connectorOn(), environment: env() };
  });

  const verifyEbayConnection = onCall({ region: "europe-west2", timeoutSeconds: 60 }, async (request) => {
    const { companyId } = await requireWorkspaceMember(request);
    const { ref, data } = await loadOwnedConnection(companyId, request.data?.connectionId);
    if (String(data.status) !== "connected") return { ok: true, healthy: false, reason: data.status === "reconnect_required" ? String(data.lastErrorCode || "credentials_rejected") : "disconnected" };
    if (String(data.environment || "sandbox") !== env()) return { ok: true, healthy: false, reason: "environment_mismatch" };
    try {
      const client = await clientFor(ref, data, { priority: "people" });
      await client.getOrders({ lastModifiedFromMs: now() - DAY_MS, lastModifiedToMs: now(), limit: 1 });   // proves orders.read, never a write
      await ref.set({ lastVerifiedAtMs: now(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return { ok: true, healthy: true, reason: "" };
    } catch (error) {
      if (error instanceof HttpsError) return { ok: true, healthy: false, reason: "provider_unavailable" };
      const code = String(error?.code || "");
      const reason = ["token_unreadable", "app_credentials_invalid", "token_request_invalid", "rate_limited", "permission_missing"].includes(code) ? code
        : (String(error?.errorClass || events.classifyError(error)) === "auth" ? "credentials_rejected" : (String(error?.errorClass || events.classifyError(error)) === "permission" ? "permission_missing" : (Number(error?.status) === 429 ? "rate_limited" : "provider_unavailable")));
      await writeSyncEvent(ref, { type: "verify_failed", error: reason });
      return { ok: true, healthy: false, reason };
    }
  });

  const updateEbayConnectionSettings = onCall({ region: "europe-west2", timeoutSeconds: 60 }, async (request) => {
    const { companyId } = await requireWorkspaceOwner(request);
    const { ref, data } = await loadOwnedConnection(companyId, request.data?.connectionId);
    const input = request.data || {};
    const patch = { updatedAt: FieldValue.serverTimestamp() };
    if (input.settings !== undefined) patch.settings = settingsOf({ settings: { ...settingsOf(data), ...(input.settings && typeof input.settings === "object" ? input.settings : {}) } });
    if (input.marketplaces !== undefined) patch.marketplaces = marketplacesOf(data.marketplaces, input.marketplaces);
    await ref.set(patch, { merge: true });
    const fresh = (await ref.get()).data() || {};
    return { ok: true, settings: settingsOf(fresh), marketplaces: marketplaceRows(fresh) };
  });

  /** eBay has no revoke endpoint: disconnect deletes our boxes and stops every job (§6). Never gated. */
  const disconnectEbay = onCall({ region: "europe-west2", timeoutSeconds: 60 }, async (request) => {
    const { uid, companyId } = await requireWorkspaceOwner(request);
    const { ref } = await loadOwnedConnection(companyId, request.data?.connectionId);
    await credentialsRef(ref).delete().catch(() => undefined);
    await ref.set({
      status: "disconnected", hasCredentials: false, accessTokenExpiresAtMs: 0, refreshTokenExpiresAtMs: 0, syncLockUntilMs: 0, catchUpDueFromMs: 0,
      disconnectedAtMs: now(), disconnectedByUid: uid, disconnectReason: "owner", updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    await writeSyncEvent(ref, { type: "disconnected", actor: uid });
    return { ok: true, ordersKept: true, revoked: false };
  });

  // ---- 4. the one apply path every route uses (§7.1 step 5, MERGE-006) ---------
  async function noteMarketplace(ref, data, marketplaceId, currency) {
    const id = String(marketplaceId || "").toUpperCase();
    if (!id || !ebayMarketplace(id)) return marketplaceRows(data);
    const rows = marketplaceRows(data);
    if (rows.some((m) => m.marketplace === id)) return rows;
    rows.push({ marketplace: id, enabled: true, currency: String(currency || ebayMarketplace(id).currency || "") });
    await ref.set({ marketplaces: rows, updatedAt: FieldValue.serverTimestamp() }, { merge: true }).catch(() => undefined);
    return rows;
  }

  /**
   * The deletion index (§9): which orders carry this buyer's handle, under the
   * keyed hash. Written whenever the order names the buyer — NOT only when the
   * restricted half has content. The adapter stamps the handle onto
   * `customerName`, `shippingName` and `customFields["eBay Buyer"]` on every
   * order, address or no address; a digital sale, a collect-in-person sale and
   * an old order eBay has already stripped all carry the username and nothing
   * else. `processEbayBuyerDeletion` finds orders through this index alone, so
   * an order missing from it keeps the buyer's eBay username forever after eBay
   * has told us to erase them. The handle is an identifier — this file treats
   * it as one everywhere else — and eBay's Marketplace Account Deletion
   * obligation is that nothing identifying the buyer remains.
   */
  async function indexBuyer(companyId, orderDocId, username) {
    const handle = String(username || "");
    if (!handle) return;
    const hash = hashing.usernameHash(hashKeys()[0], handle);
    await buyers().doc(`${safeIdPart(companyId)}__${hash}`).set({ companyId, provider: "ebay", usernameHash: hash, orderIds: FieldValue.arrayUnion(orderDocId), updatedAtMs: now() }, { merge: true });
  }

  /**
   * The parked copy of an order the workspace had no room for. Built exactly
   * the way `holdIntegrationOrder` builds it, because that is the writer.
   */
  function heldOrderRef(companyId, externalId) {
    const id = `ebay_${String(externalId || "").replace(/[^A-Za-z0-9_-]/g, "_")}`.slice(0, 180);
    return db().collection("companies").doc(String(companyId)).collection("heldIntegrationOrders").doc(id);
  }

  /**
   * A parked order that has now landed. The row exists only because the order
   * could not be created yet, so once it is created the row is a stale second
   * copy of a sale that is already in the workspace — and the release path
   * (§7.3) needs exactly this, because it hands the row to the queue and never
   * sees the outcome itself.
   */
  async function clearHeldOrder(companyId, externalId) {
    if (!companyId || !externalId) return;
    const ref = heldOrderRef(companyId, externalId);
    const snap = await ref.get().catch(() => null);
    if (snap && snap.exists) await ref.delete().catch(() => undefined);
  }

  async function writeRestrictedCustomer(companyId, orderDocId, ref, safe, restricted, removed, envelope) {
    const username = String(safe?.buyer?.username || "");
    await restrictedRef(companyId, orderDocId).set({
      provider: "ebay", connectionId: ref.id, orderId: orderDocId, externalId: String(envelope.identity.external_id), buyerUsername: username,
      fields: restricted, paths: removed.slice(0, 200),
      customerType: "unknown", externalIdentities: [{ provider: "ebay", connectionId: ref.id, externalId: username }],
      dataOrigin: "ebay", piiPolicy: "provider_restricted", mergeStatus: "unreviewed", updatedAtMs: now()
    }, { merge: true });
  }

  async function applyEbayOrder(ref, data, order, { eventKey = null, eventOrigin = "reconcile", client = null, fulfillments = null, includeUnpaid = null, includeCancelled = null } = {}) {
    // Re-read, not the caller's snapshot: a disconnect mid-pass stops writes.
    const liveSnap = await ref.get();
    const live = liveSnap.exists ? (liveSnap.data() || {}) : null;
    if (!live || String(live.status) !== "connected") return { result: "skipped", reason: `connection_${live ? String(live.status || "unknown") : "missing"}` };
    const companyId = String(live.companyId || "");
    const settings = settingsOf(live);
    const orderId = String(order?.orderId || "");
    if (!orderId) return { result: "invalid", problems: ["missing_external_id"] };
    let shipments = fulfillments;
    if (!Array.isArray(shipments)) {
      shipments = String(order?.orderFulfillmentStatus || "").toUpperCase() === "NOT_STARTED" || !client ? [] : await client.getShippingFulfillments(orderId);
    }
    const { safe, restricted, removed } = sanitize.splitEbayOrder(order, shipments);
    const leak = sanitize.scanForPii(safe);
    if (leak.length) {
      console.error("ebay: personal data survived the split; order not applied", ref.id, leak.slice(0, 10).join(", "));
      return { result: "invalid", problems: ["pii_in_safe_half", ...leak.slice(0, 10)] };
    }
    const marketplaceId = String(safe?.lineItems?.[0]?.listingMarketplaceId || live.registrationMarketplaceId || "").toUpperCase();
    const envelopeOrigin = EVENT_ORIGINS_LIST.includes(eventOrigin) ? eventOrigin : "reconcile";
    const envelope = normalizeEbayOrder(safe, { connectionId: ref.id, accountName: live.sellerUsername, marketplaceId, eventOrigin: envelopeOrigin, rawSnapshotRef: eventKey, fulfillments: safe.fulfillments });
    const externalId = envelope.identity.external_id;
    if (!externalId) return { result: "invalid", problems: ["missing_external_id"] };
    const marketplaces = await noteMarketplace(ref, live, marketplaceId, envelope.order.currency);
    const docId = ebayOrderDocId(companyId, externalId);
    const existing = await orderDocRef(docId).get();
    if (!existing.exists) {
      const unpaidOk = includeUnpaid === null ? settings.includeUnpaid : includeUnpaid === true;
      const cancelledOk = includeCancelled === null ? settings.includeCancelled : includeCancelled !== false;
      if (!settings.autoSync && eventOrigin !== "import") return { result: "skipped", reason: "auto_sync_off" };
      if (String(order?.orderPaymentStatus || "").toUpperCase() === "PENDING" && !unpaidOk) return { result: "skipped", reason: "awaiting_payment" };
      if (envelope.order.platform_status === "cancelled" && !cancelledOk) return { result: "skipped", reason: "cancelled_not_imported" };
      const market = marketplaces.find((m) => m.marketplace === marketplaceId);
      if (market && market.enabled === false) return { result: "skipped", reason: "marketplace_disabled" };
      if (String(live.importState || "none") !== "done" && eventOrigin !== "import") return { result: "skipped", reason: "awaiting_first_import" };
    }
    const settingsSnap = await companySettingsDocRef(companyId).get();
    const outcome = await engine.applyEnvelope(db(), envelope, {
      companyId, mode: "apply", source: "ebay", eventKey,
      orderIdFor: () => docId,
      defaultDeliveryTime: resolveDefaultDeliveryTime(settingsSnap.data()),
      defaultStatus: "Not Yet", syncCancellations: true, reconcileLineItems,
      capacity: async () => { const c = await db().collection("companies").doc(companyId).get(); return integrationOrderCapacity(companyId, c.data() || {}); },
      // The held payload is the SAFE half: it carries no address, and the release path fetches fresh anyway (§7.3).
      hold: async (env2, capacity) => holdIntegrationOrder(companyId, "ebay", env2.identity.external_id, safe, capacity, { ebayConnectionId: ref.id, eventType: eventOrigin })
    });
    if (["created", "updated", "noop"].includes(outcome.result)) {
      // The index first, and independently: it is what an account-deletion
      // notice follows, and an order whose buyer had no address still names the
      // buyer. The restricted document only exists when there is a person to
      // put in it (a replay from a stored safe payload must not blank a real
      // address — §7.3).
      await indexBuyer(companyId, docId, safe?.buyer?.username);
      if (Object.keys(restricted).length) await writeRestrictedCustomer(companyId, docId, ref, safe, restricted, removed, envelope);
      // A held row can only exist for an order that was never created, so a
      // `created` is the moment it goes stale; a release (`retry`) is handed to
      // the queue and its held row is this path's to clear whatever the verdict
      // was. Every other apply skips the read.
      if (outcome.result === "created" || eventOrigin === "retry") await clearHeldOrder(companyId, externalId);
    }
    if (outcome.result === "created") {
      await writeSyncEvent(ref, { type: "order_imported", orderId: outcome.orderId || docId, externalId });
      await sendPushNotificationToCompany(companyId, { title: "New eBay order", body: `${externalId} · ${envelope.order.currency || ""} ${envelope.order.grand_total || ""}`.trim(), orderId: outcome.orderId || docId, type: "ebay_order" }).catch(() => undefined);
    }
    if (["created", "updated"].includes(outcome.result) && envelope.review.required) await writeSyncEvent(ref, { type: "order_needs_review", orderId: outcome.orderId || docId, reason: envelope.review.reasons.join(",").slice(0, 60) });
    return outcome;
  }

  // ---- 5. reconciliation on the common cursor, bisected (§7.1) -----------------
  async function readOneSubWindow(ref, data, client, sub, audit, { maxPages, pageSize, eventOrigin, deadlineMs }) {
    const companyId = String(data.companyId || "");
    let offset = 0; let pages = 0; let truncated = false; let failed = 0; let stop = null;
    for (;;) {
      let page;
      try { page = await client.getOrders({ lastModifiedFromMs: sub.fromMs, lastModifiedToMs: sub.toMs, limit: pageSize, offset }); }
      catch (error) {
        const cls = String(error?.errorClass || events.classifyError(error));
        if (cls === "auth" || (cls === "permission" && error?.code === "app_credentials_invalid")) throw error;
        if (Number(error?.status) === 429 || error?.code === "rate_limited") {
          audit.rateLimited = true;
          await ref.set({ rateLimitedUntilMs: now() + (events.parseRetryAfter(error?.retryAfter) || 900) * 1000, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
          await writeSyncEvent(ref, { type: "rate_limited", reason: String(error?.reason || "429").slice(0, 60) });
        } else if (cls === "permission") { audit.errorCode = "permission_missing"; }
        else { audit.errorCode = "provider_unavailable"; }
        stop = cls; break;
      }
      pages += 1;
      for (const order of page.orders) {
        audit.scanned += 1;
        const externalId = String(order?.orderId || "");
        try {
          const eventKey = events.idempotencyKey({ provider: "ebay", connectionId: ref.id, externalId, eventType: `${eventOrigin}@${order?.lastModifiedDate || ""}` });
          const outcome = await applyEbayOrder(ref, data, order, { eventKey, eventOrigin, client });
          const r = outcome.result;
          if (r === "created") audit.created += 1; else if (r === "updated") audit.updated += 1; else if (r === "noop" || r === "duplicate") audit.noop += 1;
          else if (r === "held") audit.held += 1; else if (r === "stale") audit.stale += 1; else if (r === "invalid") { audit.failed += 1; failed += 1; await writeSyncEvent(ref, { type: "order_import_failed", externalId, error: (outcome.problems || []).join(",").slice(0, 200) }); }
          else { audit.skipped += 1; if (outcome.reason && /^connection_/.test(String(outcome.reason))) { audit.aborted = String(outcome.reason); stop = "aborted"; break; } }
        } catch (error) {
          audit.failed += 1; failed += 1;
          await writeSyncEvent(ref, { type: "order_import_failed", externalId, error: events.safeMessage(events.classifyError(error), error).slice(0, 200) });
        }
      }
      if (stop) break;
      if (!page.next || page.orders.length === 0) break;
      offset += page.orders.length;
      if (pages >= maxPages) { truncated = true; break; }
      if (now() > deadlineMs) { truncated = true; break; }
    }
    const complete = !truncated && failed === 0 && !stop;
    if (complete) await cursors.recordPass(db(), { provider: "ebay", connectionId: ref.id, entityType: "order", companyId, fromMs: sub.fromMs, toMs: sub.toMs, complete: true, scanned: audit.scanned, applied: audit.created + audit.updated, failed: audit.failed, truncated: false, now: now() });
    return { complete, truncated, failed, stopped: stop };
  }

  async function reconcileConnection(ref, data, { force = false, lookbackMs = null, maxPages = RECONCILE_MAX_PAGES, pageSize = PAGE_SIZE, eventOrigin = "reconcile", priority = "sweep", moveCursor = true, windows = null } = {}) {
    const companyId = String(data.companyId || "");
    if (String(data.environment || "sandbox") !== env()) {
      await ref.set({ lastErrorCode: "environment_mismatch", lastErrorAtMs: now(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await writeSyncEvent(ref, { type: "environment_mismatch" });
      return { skipped: "environment_mismatch", complete: false, scanned: 0 };
    }
    const client = await clientFor(ref, data, { priority });
    const cursor = await cursors.readCursor(db(), "ebay", ref.id, "order");
    const plan = windows ? { slices: windows, catchUp: false, fromMs: windows[0].fromMs, toMs: windows[windows.length - 1].toMs, reason: "nightly" } : cursorPlan.catchUpWindow(cursor, data, now(), { force, lookbackMs: lookbackMs || undefined });
    const audit = { scanned: 0, created: 0, updated: 0, noop: 0, skipped: 0, held: 0, failed: 0, stale: 0, truncated: false, subWindows: 0, bisections: 0, rateLimited: false, errorCode: "", aborted: "", window: { fromMs: plan.fromMs, toMs: plan.toMs, reason: plan.reason, catchUp: plan.catchUp === true } };
    const deadlineMs = now() + limits.passBudgetMs;
    let lastCompleted = null; let stopped = false;
    for (const slice of plan.slices) {
      if (stopped) break;
      const walk = await cursorPlan.walkWindow(slice, (sub) => readOneSubWindow(ref, data, client, sub, audit, { maxPages, pageSize, eventOrigin, deadlineMs }), { deadlineMs, now });
      audit.subWindows += walk.subWindows; audit.bisections += walk.bisections;
      if (walk.completed.length) lastCompleted = walk.completed[walk.completed.length - 1];
      if (walk.truncatedAt) {
        stopped = true;
        if (walk.truncatedAt.reason === "budget") audit.truncated = true;
        if (moveCursor) await cursors.recordPass(db(), { provider: "ebay", connectionId: ref.id, entityType: "order", companyId, fromMs: walk.truncatedAt.fromMs, toMs: walk.truncatedAt.toMs, complete: false, scanned: audit.scanned, applied: audit.created + audit.updated, failed: audit.failed, truncated: audit.truncated, error: audit.failed ? `${audit.failed} order(s) failed` : (audit.errorCode || null), now: now() });
      }
    }
    if (!moveCursor && lastCompleted) { /* nightly: the sweep's cursor is not this pass's to move */ }
    const complete = !stopped && !audit.rateLimited && audit.failed === 0 && !audit.aborted;
    if (audit.bisections > 0) await writeSyncEvent(ref, { type: "sync_bisected", reason: `${audit.subWindows} windows` });
    await health.touchHealth(db(), { provider: "ebay", connectionId: ref.id, companyId, entity: "orders", kind: complete ? "success" : "attempt", now: now(), FieldValue }).catch(() => undefined);
    const live = (await ref.get()).data() || {};
    if (String(live.status) !== "connected") return { ...audit, complete: false, aborted: audit.aborted || "connection_disconnected" };
    const lastErrorCode = complete ? "" : (audit.failed ? "partial_pass" : (audit.rateLimited ? "rate_limited" : (audit.errorCode || (audit.aborted ? "partial_pass" : "truncated"))));
    const catchUp = plan.catchUp === true ? (complete ? { catchUpDueFromMs: 0 } : (lastCompleted ? { catchUpDueFromMs: lastCompleted.toMs } : {})) : {};
    await ref.set({
      lastSyncAtMs: now(), lastFlagState: true,
      ...(complete ? { lastSuccessAtMs: now(), lastVerifiedAtMs: now(), lastErrorCode: "" } : { lastErrorCode, lastErrorAtMs: now() }),
      ...(lastErrorCode === "truncated" ? { lastSuccessAtMs: now() } : {}),
      ...catchUp,
      lastReconcile: { orders: { scanned: n(audit.scanned), created: n(audit.created), updated: n(audit.updated), noop: n(audit.noop), skipped: n(audit.skipped), held: n(audit.held), failed: n(audit.failed), stale: n(audit.stale) }, truncated: audit.truncated === true, subWindows: n(audit.subWindows), atMs: now() },
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    await writeSyncEvent(ref, { type: complete ? "sync_completed" : "sync_partial", reason: complete ? `${audit.scanned} scanned` : lastErrorCode });
    if (plan.catchUp === true && complete) await writeSyncEvent(ref, { type: "catch_up_completed" });
    return { ...audit, complete, lastErrorCode };
  }

  /** §7.6 — a night's lookback (24 h slices, the sweep's cursor untouched) plus a fulfilment follow-up on unfulfilled orders. */
  async function reconcileConnectionNightly(ref, data) {
    const companyId = String(data.companyId || "");
    const window = cursorPlan.nightlyWindow(now(), data.lastFullReconciliationAtMs);
    const slices = cursorPlan.sliceWindow(window, DAY_MS, cursors.DEFAULT_OVERLAP_MS);
    const pass = await reconcileConnection(ref, data, { windows: slices, eventOrigin: "reconcile", priority: "nightly", moveCursor: false });
    let followUps = 0;
    if (pass.complete) {
      try {
        const client = await clientFor(ref, data, { priority: "nightly" });
        const since = now() - 30 * DAY_MS;
        const snap = await db().collection(engine.ORDER_COLLECTION).where("commerce.connectionId", "==", ref.id).limit(500).get();
        const ids = snap.docs.map((d) => d.data() || {}).filter((o) => o.commerce && o.commerce.provider === "ebay" && String(o.commerce.fulfillmentStatus || "") !== "fulfilled" && n(o.createdAtMs) >= since).map((o) => String(o.commerce.externalId || "")).filter(Boolean);
        for (const batch of chunk(ids, ebayClientModule.MAX_IDS_PER_CALL)) {
          const orders = await client.getOrdersByIds(batch);
          for (const order of orders) {
            const fulfillments = String(order?.orderFulfillmentStatus || "").toUpperCase() === "NOT_STARTED" ? [] : await client.getShippingFulfillments(String(order.orderId));
            const eventKey = events.idempotencyKey({ provider: "ebay", connectionId: ref.id, externalId: String(order.orderId), eventType: `nightly@${now()}` });
            try { await applyEbayOrder(ref, data, order, { eventKey, eventOrigin: "nightly", client, fulfillments }); followUps += 1; }
            catch (error) { console.warn("ebay nightly follow-up failed:", ref.id, error?.message || error); }
          }
        }
      } catch (error) { console.warn("ebay nightly follow-up aborted:", ref.id, error?.message || error); }
      await ref.set({ lastFullReconciliationAtMs: now(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await writeSyncEvent(ref, { type: "nightly_completed", reason: `${pass.scanned} scanned, ${followUps} follow-ups` });
    }
    return { ...pass, followUps };
  }

  /** The eligibility filter both sweeps share; writes the flag state and the catch-up marker as a side effect (§7.6). */
  async function eligibleRows(kind) {
    const snap = await connections().where("status", "==", "connected").get();
    const flags = await flagsNow();
    const rows = [];
    for (const doc of snap.docs) {
      const data = doc.data() || {};
      const ref = doc.ref;
      if (String(data.environment || "sandbox") !== env()) {
        if (String(data.lastErrorCode || "") !== "environment_mismatch") { await ref.set({ lastErrorCode: "environment_mismatch", lastErrorAtMs: now(), updatedAt: FieldValue.serverTimestamp() }, { merge: true }); await writeSyncEvent(ref, { type: "environment_mismatch" }); }
        continue;
      }
      if (!data.sellerUserIdHash && data.sellerUserId) await ref.set({ sellerUserIdHash: hashing.userIdHash(hashKeys()[0], data.sellerUserId), updatedAt: FieldValue.serverTimestamp() }, { merge: true }).catch(() => undefined);
      const on = flagsModule.flagEnabled(flags, "connectors", "ebay", doc.id);
      const patch = {};
      if (data.lastFlagState !== on) patch.lastFlagState = on;
      if (on && data.lastFlagState === false) patch.catchUpDueFromMs = n(data.catchUpDueFromMs) > 0 ? n(data.catchUpDueFromMs) : (n(data.lastSuccessAtMs) || n(data.connectedAtMs) || now());
      if (!on) { if (Object.keys(patch).length) await ref.set({ ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true }); continue; }
      // §73: warn two weeks before the 18-month refresh token lapses.
      if (n(data.refreshTokenExpiresAtMs) > 0 && n(data.refreshTokenExpiresAtMs) - now() < REFRESH_TOKEN_WARN_MS) {
        await ref.set({ status: "reconnect_required", lastErrorCode: "refresh_token_expiring", lastErrorAtMs: now(), ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        await writeSyncEvent(ref, { type: "refresh_token_expiring" });
        continue;
      }
      if (!settingsOf(data).autoSync) { if (Object.keys(patch).length) await ref.set({ ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true }); continue; }
      if (n(data.rateLimitedUntilMs) > now() || n(data.syncLockUntilMs) > now()) { if (Object.keys(patch).length) await ref.set({ ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true }); continue; }
      // (c) a long stand-down that just ended owes a catch-up.
      if (!patch.catchUpDueFromMs && n(data.lastSuccessAtMs) > 0 && now() - n(data.lastSuccessAtMs) > STAND_DOWN_CATCH_UP_MS && n(data.catchUpDueFromMs) === 0 && ["rate_limited", "environment_mismatch"].includes(String(data.lastErrorCode || ""))) patch.catchUpDueFromMs = n(data.lastSuccessAtMs);
      if (Object.keys(patch).length) await ref.set({ ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      rows.push({ ref, data: { ...data, ...patch } });
    }
    const key = kind === "nightly" ? "lastFullReconciliationAtMs" : "lastSyncAtMs";
    return { total: snap.size, rows: rows.sort((a, b) => n(a.data[key]) - n(b.data[key])).slice(0, MAX_CONNECTIONS_PER_SWEEP) };
  }

  async function runSweep(kind) {
    if (!connectorOn()) { console.log(`ebay reconcile sweep${kind === "nightly" ? " (nightly)" : ""}: connector off`); return { swept: 0, failed: 0, total: 0, off: true }; }
    const { rows, total } = await eligibleRows(kind);
    let swept = 0; let failed = 0;
    for (const row of rows) {
      try {
        if (kind === "nightly") await reconcileConnectionNightly(row.ref, row.data); else await reconcileConnection(row.ref, row.data, { priority: "sweep" });
        swept += 1;
      } catch (error) {
        failed += 1;
        console.warn("ebay reconcile failed:", row.ref.id, String(error?.message || error).slice(0, 200));
        if (error?.code === "app_credentials_invalid") { console.error("ebay reconcile sweep: application credentials rejected; stopping after one connection"); break; }
      }
    }
    console.log(`ebay reconcile sweep${kind === "nightly" ? " (nightly)" : ""}: ${swept} connection(s), ${failed} failed, ${total} connected`);
    return { swept, failed, total, off: false };
  }

  const reconcileEbayConnections = onSchedule ? onSchedule({ schedule: "every 15 minutes", timeZone: "Europe/London", region: "europe-west2", timeoutSeconds: 540 }, async () => { await runSweep("sweep"); }) : null;
  const reconcileEbayConnectionsNightly = onSchedule ? onSchedule({ schedule: "every day 02:40", timeZone: "Europe/London", region: "europe-west2", timeoutSeconds: 540 }, async () => { await runSweep("nightly"); }) : null;

  async function withSyncLock(ref, data, lockMs, fn) {
    if (n(data.syncLockUntilMs) > now()) throw new HttpsError("failed-precondition", "A sync is already running for this account.");
    await ref.set({ syncLockUntilMs: now() + lockMs }, { merge: true });
    try { return await fn(); }
    finally { await ref.set({ syncLockUntilMs: 0 }, { merge: true }).catch(() => undefined); }
  }

  async function requireLive(companyId, connectionId) {
    const { ref, data } = await loadOwnedConnection(companyId, connectionId);
    if (!connectorOn()) throw new HttpsError("failed-precondition", "eBay is not enabled on this server yet.");
    if (!(await flagOn(ref.id))) throw new HttpsError("failed-precondition", "eBay sync is paused on this server.");
    if (String(data.status) !== "connected") throw new HttpsError("failed-precondition", "This eBay account is not connected.");
    if (String(data.environment || "sandbox") !== env()) throw new HttpsError("failed-precondition", "This eBay connection belongs to a different environment.");
    return { ref, data };
  }

  const syncEbayNow = onCall({ region: "europe-west2", timeoutSeconds: 300 }, async (request) => {
    const { companyId } = await requireWorkspaceMember(request);
    const { ref, data } = await requireLive(companyId, request.data?.connectionId);
    return withSyncLock(ref, data, SYNC_LOCK_MS, async () => {
      const audit = await reconcileConnection(ref, data, { force: true, lookbackMs: DAY_MS, priority: "people", eventOrigin: "reconcile" });
      return { ok: true, outcome: { created: n(audit.created), updated: n(audit.updated), noop: n(audit.noop), held: n(audit.held), skipped: n(audit.skipped), failed: n(audit.failed), stale: n(audit.stale) }, scanned: n(audit.scanned), complete: audit.complete === true, truncated: audit.truncated === true, subWindows: n(audit.subWindows) };
    });
  });

  // ---- 6. backfill: preview and a resumable import in 7-day slices (§7.2) -------
  async function* creationSlices(client, sinceMs, untilMs, { fromSliceMs = null, fromOffset = 0, maxPages = Infinity, deadlineMs = Infinity, pageSize = PAGE_SIZE } = {}) {
    let sliceFrom = fromSliceMs !== null && fromSliceMs > 0 ? fromSliceMs : sinceMs;
    let offset = fromOffset;
    while (sliceFrom < untilMs) {
      const sliceTo = Math.min(sliceFrom + IMPORT_SLICE_MS, untilMs);
      let pages = 0;
      for (;;) {
        const page = await client.getOrders({ creationFromMs: sliceFrom, creationToMs: sliceTo, limit: pageSize, offset });
        pages += 1;
        yield { kind: "page", sliceFromMs: sliceFrom, sliceToMs: sliceTo, offset, orders: page.orders, last: !page.next || page.orders.length === 0 };
        if (!page.next || page.orders.length === 0) break;
        offset += page.orders.length;
        if (pages >= maxPages || now() > deadlineMs) { yield { kind: "truncated", sliceFromMs: sliceFrom, sliceToMs: sliceTo, offset }; return; }
      }
      yield { kind: "slice_done", sliceFromMs: sliceFrom, sliceToMs: sliceTo };
      sliceFrom = sliceTo; offset = 0;
    }
  }

  const previewEbayImport = onCall({ region: "europe-west2", timeoutSeconds: 300 }, async (request) => {
    const { companyId } = await requireWorkspaceOwner(request);
    const { ref, data } = await requireLive(companyId, request.data?.connectionId);
    const sinceDays = clampSinceDays(request.data?.sinceDays);
    return withSyncLock(ref, data, SYNC_LOCK_MS, async () => {
      const client = await clientFor(ref, data, { priority: "people" });
      const summary = { ok: true, sinceDays, ordersFound: 0, duplicatesPrevented: 0, unpaid: 0, cancelled: 0, marketplaces: [], truncated: false, windowsScanned: 0 };
      const seen = new Set();
      const deadlineMs = now() + PREVIEW_BUDGET_MS;
      for await (const step of creationSlices(client, now() - sinceDays * DAY_MS, now(), { maxPages: PREVIEW_MAX_PAGES, deadlineMs })) {
        if (step.kind === "truncated") { summary.truncated = true; break; }
        if (step.kind === "slice_done") { summary.windowsScanned += 1; continue; }
        for (const order of step.orders) {
          const externalId = String(order?.orderId || "");
          if (!externalId) continue;
          summary.ordersFound += 1;
          if (String(order?.orderPaymentStatus || "").toUpperCase() === "PENDING") summary.unpaid += 1;
          const cancelState = String(order?.cancelStatus?.cancelState || "").toUpperCase();
          if (cancelState === "CANCELED" || cancelState === "CANCELLED") summary.cancelled += 1;
          const market = String(order?.lineItems?.[0]?.listingMarketplaceId || "").toUpperCase();
          if (market && !seen.has(market)) { seen.add(market); summary.marketplaces.push(market); }
          const identity = await db().collection(engine.ENTITY_COLLECTION).doc(`ebay__${safeIdPart(ref.id)}__order__${safeIdPart(externalId)}`).get();
          if (identity.exists) summary.duplicatesPrevented += 1;
        }
      }
      await writeSyncEvent(ref, { type: "import_preview", reason: `${summary.ordersFound} found` });
      return summary;
    });
  });

  async function importRun(ref, data, { sinceDays, includeUnpaid, includeCancelled, resume }) {
    const companyId = String(data.companyId || "");
    const client = await clientFor(ref, data, { priority: "import" });
    const existing = data.importCursor && typeof data.importCursor === "object" ? data.importCursor : null;
    const resuming = resume && existing && String(data.importState || "") === "running" && n(existing.untilMs) > 0;
    const cursor = resuming ? { ...existing } : {
      sinceMs: now() - sinceDays * DAY_MS, untilMs: now(), sliceFromMs: 0, sliceToMs: 0, offset: 0,
      includeUnpaid: includeUnpaid === true, includeCancelled: includeCancelled !== false, failedIds: []
    };
    if (!resuming) { cursor.sliceFromMs = cursor.sinceMs; cursor.sliceToMs = Math.min(cursor.sinceMs + IMPORT_SLICE_MS, cursor.untilMs); }
    const importStartMs = resuming && n(existing.startedAtMs) > 0 ? n(existing.startedAtMs) : cursor.untilMs;
    cursor.startedAtMs = importStartMs;
    const counters = resuming && existing.counters ? { ...existing.counters } : { created: 0, updated: 0, noop: 0, held: 0, skipped: 0, failed: 0, stale: 0 };
    await ref.set({ importState: "running", importStartedAtMs: n(data.importStartedAtMs) || now(), importCursor: { ...cursor, counters }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await writeSyncEvent(ref, { type: resuming ? "import_resumed" : "import_started", reason: `${sinceDays} days` });
    const deadlineMs = now() + limits.importBudgetMs;
    let complete = false; let slicesThisCall = 0;
    for await (const step of creationSlices(client, cursor.sinceMs, cursor.untilMs, { fromSliceMs: cursor.sliceFromMs, fromOffset: n(cursor.offset), deadlineMs })) {
      if (step.kind === "truncated") { cursor.sliceFromMs = step.sliceFromMs; cursor.sliceToMs = step.sliceToMs; cursor.offset = step.offset; break; }
      if (step.kind === "slice_done") {
        cursor.sliceFromMs = step.sliceToMs; cursor.sliceToMs = Math.min(step.sliceToMs + IMPORT_SLICE_MS, cursor.untilMs); cursor.offset = 0;
        await ref.set({ importCursor: { ...cursor, counters }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        slicesThisCall += 1;
        if (cursor.sliceFromMs >= cursor.untilMs) { complete = true; break; }
        if (slicesThisCall >= limits.importSliceBudget) break;
        continue;
      }
      for (const order of step.orders) {
        const externalId = String(order?.orderId || "");
        try {
          const eventKey = events.idempotencyKey({ provider: "ebay", connectionId: ref.id, externalId, eventType: `import@${order?.lastModifiedDate || ""}` });
          const outcome = await applyEbayOrder(ref, data, order, { eventKey, eventOrigin: "import", client, includeUnpaid: cursor.includeUnpaid, includeCancelled: cursor.includeCancelled });
          const r = outcome.result;
          if (r === "created") counters.created += 1; else if (r === "updated") counters.updated += 1; else if (r === "held") counters.held += 1; else if (r === "stale") counters.stale += 1; else if (r === "noop" || r === "duplicate") counters.noop += 1;
          else if (r === "invalid") { counters.failed += 1; if (cursor.failedIds.length < MAX_FAILED_IDS && externalId) cursor.failedIds.push(externalId); }
          else counters.skipped += 1;
        } catch (error) {
          counters.failed += 1;
          if (cursor.failedIds.length < MAX_FAILED_IDS && externalId && !cursor.failedIds.includes(externalId)) cursor.failedIds.push(externalId);
          console.warn("ebay import: order failed", ref.id, externalId, error?.message || error);
        }
      }
      cursor.offset = step.offset + step.orders.length;
      await ref.set({ importCursor: { ...cursor, counters }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    if (complete && cursor.failedIds.length) {
      // One retry of what failed, by id; what fails again stays on the card.
      const retried = await retryFailedIds(ref, data, client, cursor);
      counters.failed = Math.max(0, counters.failed - retried.recovered); counters.created += retried.created; counters.updated += retried.updated;
    }
    const done = complete && cursor.failedIds.length === 0;
    if (done) {
      await cursors.recordPass(db(), { provider: "ebay", connectionId: ref.id, entityType: "order", companyId, fromMs: importStartMs - cursors.DEFAULT_OVERLAP_MS, toMs: importStartMs, complete: true, scanned: 0, applied: 0, failed: 0, now: now() });
      await ref.set({ importState: "done", importFinishedAtMs: now(), importCounters: { created: counters.created, updated: counters.updated, held: counters.held, skipped: counters.skipped, failed: counters.failed }, importCursor: { ...cursor, counters }, lastErrorCode: "", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await writeSyncEvent(ref, { type: "import_finished", reason: `${counters.created} created, ${counters.updated} updated` });
    } else {
      await ref.set({ importState: "running", importCursor: { ...cursor, counters }, ...(complete && cursor.failedIds.length ? { lastErrorCode: "partial_pass", lastErrorAtMs: now() } : {}), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    return { ok: true, outcome: { created: n(counters.created), updated: n(counters.updated), noop: n(counters.noop), held: n(counters.held), skipped: n(counters.skipped), failed: n(counters.failed), stale: n(counters.stale) }, complete: done, resumeFromMs: done ? 0 : n(cursor.sliceFromMs), failures: cursor.failedIds.slice(0, 25) };
  }

  async function retryFailedIds(ref, data, client, cursor) {
    const out = { recovered: 0, created: 0, updated: 0 };
    const ids = cursor.failedIds.slice();
    const still = [];
    for (const batch of chunk(ids, ebayClientModule.MAX_IDS_PER_CALL)) {
      let orders = [];
      try { orders = await client.getOrdersByIds(batch); } catch { still.push(...batch); continue; }
      const byId = new Map(orders.map((o) => [String(o?.orderId || ""), o]));
      for (const id of batch) {
        const order = byId.get(id);
        if (!order) { still.push(id); continue; }
        try {
          const outcome = await applyEbayOrder(ref, data, order, { eventKey: events.idempotencyKey({ provider: "ebay", connectionId: ref.id, externalId: id, eventType: `import-retry@${order?.lastModifiedDate || ""}` }), eventOrigin: "import", client, includeUnpaid: cursor.includeUnpaid, includeCancelled: cursor.includeCancelled });
          if (outcome.result === "invalid") still.push(id); else { out.recovered += 1; if (outcome.result === "created") out.created += 1; if (outcome.result === "updated") out.updated += 1; }
        } catch { still.push(id); }
      }
    }
    cursor.failedIds = still;
    return out;
  }

  const runEbayImport = onCall({ region: "europe-west2", timeoutSeconds: 540 }, async (request) => {
    const { companyId } = await requireWorkspaceOwner(request);
    const { ref, data } = await requireLive(companyId, request.data?.connectionId);
    const sinceDays = clampSinceDays(request.data?.sinceDays);
    return withSyncLock(ref, data, IMPORT_LOCK_MS, () => importRun(ref, data, { sinceDays, includeUnpaid: request.data?.includeUnpaid === true, includeCancelled: request.data?.includeCancelled !== false, resume: true }));
  });

  const retryEbayImportFailures = onCall({ region: "europe-west2", timeoutSeconds: 300 }, async (request) => {
    const { companyId } = await requireWorkspaceOwner(request);
    const { ref, data } = await requireLive(companyId, request.data?.connectionId);
    const cursor = data.importCursor && typeof data.importCursor === "object" ? { ...data.importCursor, failedIds: Array.isArray(data.importCursor.failedIds) ? data.importCursor.failedIds.slice() : [] } : null;
    if (!cursor || !cursor.failedIds.length) return { ok: true, remaining: 0, recovered: 0 };
    return withSyncLock(ref, data, SYNC_LOCK_MS, async () => {
      const client = await clientFor(ref, data, { priority: "import" });
      const out = await retryFailedIds(ref, data, client, cursor);
      const finished = cursor.failedIds.length === 0 && n(cursor.sliceFromMs) >= n(cursor.untilMs);
      if (finished) {
        const importStartMs = n(cursor.startedAtMs) || n(cursor.untilMs) || now();
        await cursors.recordPass(db(), { provider: "ebay", connectionId: ref.id, entityType: "order", companyId, fromMs: importStartMs - cursors.DEFAULT_OVERLAP_MS, toMs: importStartMs, complete: true, now: now() });
        await ref.set({ importState: "done", importFinishedAtMs: now(), importCursor: cursor, lastErrorCode: "", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        await writeSyncEvent(ref, { type: "import_finished", reason: "after retry" });
      } else await ref.set({ importCursor: cursor, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return { ok: true, remaining: cursor.failedIds.length, recovered: out.recovered, complete: finished };
    });
  });

  // ---- 7. the queue path: ORDER_CONFIRMATION tasks and buyer deletions (§7.5, §9) --
  async function recordSkipped(task, reason) {
    await worker.eventRef(db(), task.key).set({ status: "skipped", safe_message: String(reason).slice(0, 300), finished_at: new Date(now()).toISOString(), attempt: Number(task.attempt || 1) }, { merge: true }).catch(() => undefined);
    return { status: "skipped", outcome: { result: "skipped", reason } };
  }

  async function processEbayCommerceTask(task) {
    if (String(task?.entityType || "") === "buyer_deletion") return processEbayBuyerDeletion(task);   // never gated, no connection, no health
    const snap = await connections().doc(String(task?.connectionId || "")).get();
    const data = snap.exists ? (snap.data() || {}) : null;
    if (!data || String(data.status) !== "connected") throw classedError(data ? `connection_${data.status}` : "connection_missing", data && data.status === "reconnect_required" ? "auth" : "validation", "connection");
    if (!connectorOn() || !(await flagOn(snap.id))) return recordSkipped(task, "connector_off");
    if (String(data.environment || "sandbox") !== env()) return recordSkipped(task, "environment_mismatch");
    const client = await clientFor(snap.ref, data, { priority: "people" });
    return worker.processCommerceEvent(db(), task, {
      fetchLatest: async () => {
        const order = await client.getOrder(String(task.externalId || ""));
        if (!order) return null;
        const fulfillments = String(order?.orderFulfillmentStatus || "").toUpperCase() === "NOT_STARTED" ? [] : await client.getShippingFulfillments(String(order.orderId));
        return { order, fulfillments };
      },
      normalize: (raw) => raw,
      apply: (raw) => applyEbayOrder(snap.ref, data, raw.order, { eventKey: task.key, eventOrigin: task.eventOrigin || "provider", client, fulfillments: raw.fulfillments }),
      retryAfterOf: (error) => events.parseRetryAfter(error?.retryAfter), now
    });
  }

  /** The patch that removes the person from an order on a deletion request: the sweep's field list, applied whether or not the order was delivered. */
  function deletionPatch(order) {
    const patch = {};
    for (const [field, replacement] of Object.entries(retention.PII_FIELDS)) {
      const current = order[field];
      if (current === undefined || current === null || current === "") continue;
      if (current === replacement) continue;
      patch[field] = replacement;
    }
    patch.customerName = "Buyer details removed";
    patch.piiScrubbedAtMs = now();
    patch.piiScrubbedReason = "ebay_account_deletion";
    return patch;
  }

  async function processEbayBuyerDeletion(task) {
    const ledgerRef = ledgerRows().doc(safeIdPart(String(task.notificationId || task.key || "").replace(/^ebay\|deletion\|/, "")));
    const hashes = [...new Set([...(Array.isArray(task.usernameHashes) ? task.usernameHashes : []), ...(Array.isArray(task.userIdHashes) ? task.userIdHashes : []), task.usernameHash, task.userIdHash].map((h) => String(h || "")).filter(Boolean))];
    const counters = { ordersScrubbed: 0, restrictedDocsDeleted: 0, connectionsDisconnected: 0, indexRowsDeleted: 0 };
    try {
      const touched = new Map();   // connectionId → count
      for (const hash of hashes) {
        const rows = await buyers().where("usernameHash", "==", hash).get();
        for (const row of rows.docs) {
          const data = row.data() || {};
          const companyId = String(data.companyId || "");
          for (const orderId of Array.isArray(data.orderIds) ? data.orderIds : []) {
            const orderRef = orderDocRef(String(orderId));
            const orderSnap = await orderRef.get();
            if (orderSnap.exists) {
              const order = orderSnap.data() || {};
              await orderRef.set({ ...deletionPatch(order), customFields: { ...(order.customFields && typeof order.customFields === "object" ? order.customFields : {}), "eBay Buyer": "" }, commerce: { ...(order.commerce || {}), buyerRemovedAtMs: now() } }, { merge: true });
              counters.ordersScrubbed += 1;
              const connId = String(order.commerce?.connectionId || "");
              if (connId) touched.set(connId, (touched.get(connId) || 0) + 1);
              const externalId = String(order.commerce?.externalId || "");
              if (externalId && companyId) {
                const heldRef = heldOrderRef(companyId, externalId);
                const held = await heldRef.get();
                if (held.exists) { const payload = (held.data() || {}).payload || {}; await heldRef.set({ payload: { ...payload, buyer: { ...(payload.buyer || {}), username: "" } } }, { merge: true }); }
              }
              const reviewRef = db().collection(engine.REVIEW_COLLECTION).doc(String(orderId));
              if ((await reviewRef.get()).exists) await reviewRef.set({ customerName: null }, { merge: true });
            }
            if (companyId) {
              const rRef = restrictedRef(companyId, String(orderId));
              if ((await rRef.get()).exists) { await rRef.delete(); counters.restrictedDocsDeleted += 1; }
            }
            await recordPiiAccess({ companyId, actorUid: "", actorEmail: "", action: "erased", source: "server", subject: { kind: "order", id: String(orderId), provider: "ebay" }, categories: ["name", "email", "phone", "address", "note"], note: "ebay_account_deletion" }).catch(() => undefined);
          }
          await row.ref.delete(); counters.indexRowsDeleted += 1;
        }
        // The seller side: a deleted eBay account that was connected here.
        const sellers = await connections().where("sellerUserIdHash", "==", hash).get();
        for (const doc of sellers.docs) {
          const data = doc.data() || {};
          if (String(data.status) === "disconnected" && String(data.disconnectReason) === "ebay_account_deleted") continue;
          await credentialsRef(doc.ref).delete().catch(() => undefined);
          await doc.ref.set({ status: "disconnected", disconnectReason: "ebay_account_deleted", sellerUsername: "", displayName: "eBay account (deleted)", hasCredentials: false, accessTokenExpiresAtMs: 0, refreshTokenExpiresAtMs: 0, syncLockUntilMs: 0, disconnectedAtMs: now(), disconnectedByUid: "ebay", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
          await writeSyncEvent(doc.ref, { type: "disconnected", reason: "ebay_account_deleted" });
          counters.connectionsDisconnected += 1;
        }
      }
      for (const [connId, count] of touched) await writeSyncEvent(connections().doc(connId), { type: "buyer_deleted", reason: `${count} order(s)` });
      // `status:"done"` is the ONE state the gateway answers `duplicate` to, so
      // it is written only here, after the work. The lease goes with it.
      await ledgerRef.set({ status: "done", finishedAtMs: now(), attempts: FieldValue.increment(1), leaseUntilMs: 0, ...counters, sanitizedError: "" }, { merge: true }).catch(() => undefined);
      return { status: "applied", outcome: { result: "applied", ...counters } };
    } catch (error) {
      const attempt = Number(task.attempt || 1);
      const dead = attempt >= MAX_DELETION_ATTEMPTS;
      const safeMessage = events.safeMessage("transient", error);
      // A dead row drops its lease at once so the reconciliation pass can take
      // it; a retrying one keeps a lease for the worker's own next attempt, and
      // that lease expires if the worker never comes back.
      await ledgerRef.set({ status: dead ? "failed" : "queued", attempts: FieldValue.increment(1), sanitizedError: safeMessage.slice(0, 200), lastAttemptAtMs: now(), leaseUntilMs: dead ? 0 : now() + DELETION_LEASE_MS }, { merge: true }).catch(() => undefined);
      console.error("ebay buyer deletion failed:", safeMessage);
      return dead ? { status: "dead", errorClass: "transient", safeMessage } : { status: "retrying", nextRetryInMs: events.retryDelayMs("transient", attempt) || 60000, errorClass: "transient", safeMessage };
    }
  }

  function deletionTaskOf(notificationId, { usernameHashes = [], userIdHashes = [], eventOrigin = "provider" } = {}) {
    return {
      key: `ebay|deletion|${notificationId}`, notificationId, provider: "ebay", connectionId: "", companyId: "",
      entityType: "buyer_deletion", externalId: "", eventType: notification.TOPICS.ACCOUNT_DELETION,
      attempt: 1, eventOrigin, correlationId: events.newCorrelationId(), usernameHashes, userIdHashes
    };
  }

  /** Hand the task to the eBay queue; run it inline (bounded) when there is no queue, and leave the row re-drivable if that fails too. */
  async function driveDeletion(task, ledgerRef) {
    try { if (!enqueue) throw new Error("no_queue"); await enqueue(task, 0); return { queued: true }; }
    catch (error) {
      console.warn("ebay deletion enqueue failed, running inline:", String(error?.message || error).slice(0, 120));
      const inline = await Promise.race([processEbayBuyerDeletion(task), new Promise((resolve) => setTimeout(() => resolve({ status: "timeout" }), 40 * 1000))]);
      if (inline.status !== "applied") {
        // The lease is dropped, not held: whatever went wrong here, the row is
        // now the reconciliation pass's to pick up.
        await ledgerRef.set({ status: "failed", leaseUntilMs: 0, lastAttemptAtMs: now(), sanitizedError: String(inline.safeMessage || inline.status || "").slice(0, 200) }, { merge: true }).catch(() => undefined);
      }
      return { queued: false, status: inline.status };
    }
  }

  /**
   * Claim one notification (§9). eBay's own redelivery is the only safety net
   * behind this endpoint, and the first version of it neutralised that net: the
   * row was created BEFORE the work and any create() failure answered
   * `duplicate`, whatever the stored row said. A row left `failed` (six
   * attempts spent, or the inline fallback losing its 40-second race) or
   * stranded `queued` (enqueue threw and the fallback failed too) meant the
   * anonymisation never happened — and every redelivery of that notificationId
   * got a cheerful 200.
   *
   * `duplicate` is now answered for exactly one state: the stored row says
   * `done`. Anything else is re-driven, unless another delivery is holding the
   * lease right now.
   */
  async function claimDeletion(ledgerRef, { eventDateMs, usernameHashes, userIdHashes }) {
    return db().runTransaction(async (tx) => {
      const snap = await tx.get(ledgerRef);
      const row = snap.exists ? (snap.data() || {}) : null;
      if (row && String(row.status) === "done") return { verdict: "duplicate" };
      if (row && n(row.leaseUntilMs) > now()) return { verdict: "in_progress" };
      const claim = { status: "queued", leaseUntilMs: now() + DELETION_LEASE_MS, usernameHash: usernameHashes[0] || "", userIdHash: userIdHashes[0] || "", usernameHashes, userIdHashes };
      if (row) tx.set(ledgerRef, { ...claim, redeliveries: FieldValue.increment(1), lastRedeliveryAtMs: now() }, { merge: true });
      else {
        tx.set(ledgerRef, {
          receivedAtMs: now(), eventDate: new Date(eventDateMs).toISOString(), ...claim, attempts: 0, redeliveries: 0,
          ordersScrubbed: 0, restrictedDocsDeleted: 0, connectionsDisconnected: 0, finishedAtMs: 0, sanitizedError: "",
          expireAt: admin.firestore.Timestamp.fromMillis(now() + LEDGER_TTL_MS)
        });
      }
      return { verdict: "claimed", first: !row };
    });
  }

  /**
   * The pass that reads the ledger back (§9). Nothing else does: without it a
   * failed anonymisation is a console line and a row that expires silently
   * after 400 days. Ungated, like the rest of the deletion path — no connector
   * switch, no per-connection flag, no connection at all.
   */
  async function reconcileDeletionRequests({ limit = DELETION_RECONCILE_LIMIT } = {}) {
    const out = { scanned: 0, redriven: 0, waiting: 0, stuck: 0 };
    for (const status of ["queued", "failed"]) {
      let snap;
      try { snap = await ledgerRows().where("status", "==", status).limit(limit).get(); }
      catch (error) { console.error("ebay deletion reconciliation could not read the ledger:", String(error?.message || error).slice(0, 200)); return out; }
      for (const doc of snap.docs) {
        const row = doc.data() || {};
        out.scanned += 1;
        if (n(row.leaseUntilMs) > now()) { out.waiting += 1; continue; }
        const attempts = n(row.attempts);
        const since = Math.max(n(row.lastAttemptAtMs), n(row.lastRedeliveryAtMs), n(row.receivedAtMs));
        const backoffMs = Math.min(DELETION_RETRY_AFTER_MS * Math.max(1, attempts), DELETION_MAX_BACKOFF_MS);
        if (since > 0 && now() - since < backoffMs) { out.waiting += 1; continue; }
        const usernameHashes = (Array.isArray(row.usernameHashes) ? row.usernameHashes : [row.usernameHash]).map((h) => String(h || "")).filter(Boolean);
        const userIdHashes = (Array.isArray(row.userIdHashes) ? row.userIdHashes : [row.userIdHash]).map((h) => String(h || "")).filter(Boolean);
        if (!usernameHashes.length && !userIdHashes.length) {
          // Nothing to match on. Say so loudly rather than retry a row forever.
          out.stuck += 1;
          console.error("ebay deletion", doc.id, "carries no hashes and cannot be retried; eBay must redeliver it");
          continue;
        }
        if (attempts >= MAX_DELETION_ATTEMPTS * 2) {
          out.stuck += 1;
          console.error(`ebay deletion ${doc.id} has not completed after ${attempts} attempts: ${String(row.sanitizedError || "").slice(0, 120)}`);
        }
        await doc.ref.set({ leaseUntilMs: now() + DELETION_LEASE_MS, lastRedeliveryAtMs: now(), reconciledAtMs: now() }, { merge: true }).catch(() => undefined);
        await driveDeletion(deletionTaskOf(doc.id, { usernameHashes, userIdHashes, eventOrigin: "reconcile" }), doc.ref);
        out.redriven += 1;
      }
    }
    if (out.redriven || out.stuck) console.log(`ebay deletion reconciliation: ${out.scanned} unfinished, ${out.redriven} re-driven, ${out.waiting} waiting, ${out.stuck} stuck`);
    return out;
  }

  const reconcileEbayDeletions = onSchedule
    ? onSchedule({ schedule: "every 10 minutes", timeZone: "Europe/London", region: "europe-west2", timeoutSeconds: 300 }, async () => { await reconcileDeletionRequests(); })
    : null;

  // ---- 8. the notification gateway (§9) ----------------------------------------
  let appTokenCache = { token: "", expiresAtMs: 0 };
  const keyCache = new Map();   // kid → { key, algorithm, digest, at, unknown }
  async function appAccessToken() {
    if (appTokenCache.token && appTokenCache.expiresAtMs - now() > 60 * 1000) return appTokenCache.token;
    const data = await oauth.appToken({ environment: env(), clientId: clientId(), clientSecret: clientSecret(), fetchImpl });
    const token = String(data?.access_token || "");
    if (!token) throw classedError("ebay_app_token_missing", "transient", "provider_unavailable");
    appTokenCache = { token, expiresAtMs: now() + (Number(data?.expires_in) > 0 ? Number(data.expires_in) : 7200) * 1000 };
    return token;
  }
  function resetCaches() { appTokenCache = { token: "", expiresAtMs: 0 }; keyCache.clear(); }

  /** The signing key for a kid: memory (1 h) → Firestore (24 h) → eBay. null = eBay does not know it; throws = could not find out. */
  async function signingKeyFor(kid) {
    const cached = keyCache.get(kid);
    if (cached && now() - cached.at < (cached.unknown ? UNKNOWN_KID_NEGATIVE_MS : KEY_CACHE_MEMORY_MS)) return cached.unknown ? null : cached;
    const docRef = db().collection(KEY_CACHE_COLLECTION).doc(safeIdPart(kid));
    const snap = await docRef.get();
    const stored = snap.exists ? (snap.data() || {}) : null;
    if (stored && stored.status === "unknown" && now() - n(stored.at) < UNKNOWN_KID_NEGATIVE_MS) { keyCache.set(kid, { unknown: true, at: n(stored.at) }); return null; }
    if (stored && stored.key && now() - n(stored.fetchedAtMs) < KEY_CACHE_DOC_MS) { const entry = { key: String(stored.key), algorithm: String(stored.algorithm || ""), digest: String(stored.digest || ""), at: now() }; keyCache.set(kid, entry); return entry; }
    const budget = await ledger().noteUnknownKid();
    if (!budget.allowed) { console.error("ebay notifications: unknown-kid budget spent"); throw classedError("unknown_kid_budget", "transient", "budget"); }
    const client = createClient({ environment: env(), accessToken: await appAccessToken(), fetchImpl, quota: { charge: ({ family }) => ledger().charge({ family, priority: "people" }) } });
    const fetched = await client.publicKey(kid);
    if (!fetched) { keyCache.set(kid, { unknown: true, at: now() }); await docRef.set({ status: "unknown", at: now() }, { merge: true }).catch(() => undefined); return null; }
    const entry = { ...fetched, at: now() };
    keyCache.set(kid, entry);
    await docRef.set({ status: "known", key: fetched.key, algorithm: fetched.algorithm, digest: fetched.digest, fetchedAtMs: now() }, { merge: true }).catch(() => undefined);
    return entry;
  }

  async function handleNotificationRequest(req, res) {
    try {
      const method = String(req.method || "GET").toUpperCase();
      if (method === "GET") {
        const challengeCode = String(req.query?.challenge_code || "");
        if (!challengeCode) { res.status(200).type("text/plain").send("eBay notification endpoint"); return; }
        const token = String(deletionToken() || "");
        const endpoint = String(deletionEndpointUrl() || "");
        if (!notification.isValidVerificationToken(token) || !endpoint) { res.status(503).json({ ok: false }); return; }
        res.status(200).type("application/json").send(JSON.stringify({ challengeResponse: notification.challengeResponse({ challengeCode, verificationToken: token, endpointUrl: endpoint }) }));
        return;
      }
      if (method !== "POST") { res.status(405).json({ ok: false }); return; }
      const rawBody = req.rawBody || Buffer.from(typeof req.body === "string" ? req.body : JSON.stringify(req.body || {}));
      if (rawBody.length > notification.MAX_BODY_BYTES) { res.status(413).json({ ok: false }); return; }
      let body = req.body;
      if (typeof body === "string" || !body) { try { body = JSON.parse(rawBody.toString("utf8")); } catch { res.status(400).json({ ok: false, error: "body" }); return; } }
      if (!body || typeof body !== "object" || Array.isArray(body)) { res.status(400).json({ ok: false, error: "body" }); return; }
      const header = notification.parseSignatureHeader(req.headers?.["x-ebay-signature"]);
      if (!header || !notification.isValidKid(header.kid)) { res.status(401).json({ ok: false, error: "invalid_signature" }); return; }
      if (!configured()) { console.error("ebay notifications: deletion received without secrets"); res.status(503).json({ ok: false, error: "verification_unavailable" }); return; }
      let key = null;
      try { key = await signingKeyFor(header.kid); }
      catch (error) { console.error("ebay notifications: key fetch failed:", String(error?.message || error).slice(0, 120)); res.status(503).json({ ok: false, error: "verification_unavailable" }); return; }
      if (!key) { res.status(401).json({ ok: false, error: "invalid_signature" }); return; }
      if (!notificationVerifier({ body, signature: header.signature, publicKey: key.key })) { res.status(401).json({ ok: false, error: "invalid_signature" }); return; }
      const verifiedBudget = await ledger().noteVerified();
      if (!verifiedBudget.allowed) { res.status(503).json({ ok: false, error: "busy" }); return; }
      const shape = notification.validateNotificationBody(body, now());
      if (!shape.ok) { res.status(400).json({ ok: false, error: shape.error }); return; }

      if (shape.topic === notification.TOPICS.ACCOUNT_DELETION) {
        // Hashes are computed here; the raw username, userId and eiasToken never leave this handler.
        const usernameHashes = hashing.hashesUnderEveryKey(hashKey(), hashing.normalizeUsername(shape.data.username));
        const userIdHashes = hashing.hashesUnderEveryKey(hashKey(), hashing.normalizeUserId(shape.data.userId));
        const ledgerRef = ledgerRows().doc(safeIdPart(shape.notificationId));
        // Dedup on COMPLETION, never on receipt: a redelivery of a notification
        // whose anonymisation failed is eBay handing us the work again, and
        // answering it `duplicate` would throw the only remaining safety net.
        let claim;
        try { claim = await claimDeletion(ledgerRef, { eventDateMs: shape.eventDateMs, usernameHashes, userIdHashes }); }
        catch (error) { console.error("ebay deletion ledger unavailable:", String(error?.message || error).slice(0, 120)); res.status(503).json({ ok: false, error: "busy" }); return; }
        if (claim.verdict !== "claimed") { res.status(200).json({ ok: true, result: claim.verdict }); return; }
        res.status(200).json({ ok: true, result: claim.first ? "queued" : "requeued" });
        await driveDeletion(deletionTaskOf(shape.notificationId, { usernameHashes, userIdHashes, eventOrigin: "provider" }), ledgerRef);
        return;
      }

      if (shape.topic === notification.TOPICS.ORDER_CONFIRMATION) {
        const subscriptionId = String(shape.data.subscriptionId || body?.metadata?.subscriptionId || "");
        const targets = subscriptionId ? (await connections().where("notificationSubscriptionId", "==", subscriptionId).get()).docs : [];
        if (!targets.length) { console.warn("ebay notifications: unknown subscription"); res.status(200).json({ ok: true, result: "skipped", reason: "unknown_subscription" }); return; }
        if (!connectorOn()) { res.status(200).json({ ok: true, result: "received" }); return; }
        const results = [];
        for (const doc of targets) {
          const data = doc.data() || {};
          const orderId = String(shape.data.orderId || "");
          if (!orderId) { results.push({ connection: doc.id, result: "skipped", reason: "no_order_id" }); continue; }
          const claim = doc.ref.collection("deliveries").doc(safeIdPart(shape.notificationId));
          try { await claim.create({ topic: shape.topic, receivedAtMs: now(), via: "gateway", expireAt: admin.firestore.Timestamp.fromMillis(now() + DELIVERY_TTL_MS) }); }
          catch { results.push({ connection: doc.id, result: "duplicate" }); continue; }
          await health.touchHealth(db(), { provider: "ebay", connectionId: doc.id, companyId: String(data.companyId || ""), kind: "webhook", now: now(), FieldValue }).catch(() => undefined);
          if (!(await flagOn(doc.id))) { results.push({ connection: doc.id, result: "received" }); continue; }
          const task = { key: events.idempotencyKey({ provider: "ebay", connectionId: doc.id, eventId: shape.notificationId, externalId: orderId, eventType: shape.topic }), provider: "ebay", connectionId: doc.id, companyId: String(data.companyId || ""), entityType: "order", externalId: orderId, eventType: shape.topic, attempt: 1, eventOrigin: "provider", correlationId: events.newCorrelationId() };
          await worker.recordReceived(db(), task, { status: enqueue ? "queued" : "received", now: now() }).catch(() => undefined);
          let queued = false;
          if (enqueue) { try { await enqueue(task, 0); queued = true; } catch (error) { console.error("ebay notifications enqueue failed, applying inline:", String(error?.message || error).slice(0, 120)); } }
          if (queued) { results.push({ connection: doc.id, result: "queued" }); continue; }
          try { const outcome = await processEbayCommerceTask(task); results.push({ connection: doc.id, result: outcome.outcome?.result || outcome.status }); }
          catch (error) { await claim.delete().catch(() => undefined); throw error; }
        }
        res.status(200).json({ ok: true, results });
        return;
      }
      console.warn("ebay notifications: ignored topic", String(shape.topic).slice(0, 60));
      res.status(200).json({ ok: true, result: "ignored_topic" });
    } catch (error) {
      console.error("ebayNotifications error:", String(error?.message || error).slice(0, 200));
      if (!res.headersSent) res.status(500).json({ ok: false });
    }
  }

  const ebayNotifications = onRequest({ region: "europe-west2", timeoutSeconds: 30 }, handleNotificationRequest);

  // ---- 9. the reveal (§3.3): provider-agnostic, log first, then return ---------
  const revealRestrictedCustomer = onCall({ region: "europe-west2", timeoutSeconds: 60 }, async (request) => {
    const { uid, companyId, companyData } = await requireWorkspaceMember(request);
    const orderId = String(request.data?.orderId || "").trim();
    if (!/^[A-Za-z0-9_.-]{1,200}$/.test(orderId)) throw new HttpsError("invalid-argument", "orderId is required.");
    const orderSnap = await orderDocRef(orderId).get();
    const order = orderSnap.exists ? (orderSnap.data() || {}) : null;
    if (!order || String(order.companyId || "") !== companyId) throw new HttpsError("not-found", "No protected buyer details for this order.");
    const mirrored = companyData?.memberAccess && typeof companyData.memberAccess === "object" ? (companyData.memberAccess[uid] || {}) : {};
    // The workflow-only tier is the member's ROLE; the mirrored access map may not carry it as a key.
    const access = { ...mirrored, workflowOnly: mirrored.workflowOnly === true || isWorkflowOnlyMember(companyData, uid) === true };
    const suspended = Boolean(companyData?.suspendedMembers && companyData.suspendedMembers[uid] === true);
    const verdict = reveal.revealAllowed({ isOwner: isWorkspaceOwner(companyData, uid), access, order, uid, suspended });
    if (!verdict.allowed) throw new HttpsError("permission-denied", "You do not have access to protected buyer details.");
    const counterRef = db().collection("companies").doc(companyId).collection(REVEAL_COUNTERS_SUBCOLLECTION).doc(uid);
    const budget = await db().runTransaction(async (tx) => {
      const snap = await tx.get(counterRef);
      const out = reveal.revealBudget(snap.exists ? snap.data() : null, now());
      if (out.allowed) tx.set(counterRef, { ...out.next, updatedAtMs: now() }, { merge: true });
      return out;
    });
    if (!budget.allowed) throw new HttpsError("resource-exhausted", "Too many address reveals. Try again later.");
    const restrictedSnap = await restrictedRef(companyId, orderId).get();
    const restricted = restrictedSnap.exists ? (restrictedSnap.data() || {}) : null;
    if (!restricted || !reveal.revealHasContent(restricted)) throw new HttpsError("not-found", "No protected buyer details for this order.");
    const payload = reveal.revealPayloadOf(restricted, { now: now() });
    const logged = await recordPiiAccess({
      companyId, actorUid: uid, actorEmail: String(request.auth?.token?.email || ""), action: "restricted_resource_accessed", source: String(request.data?.source || "web"),
      subject: { kind: "order", id: orderId, provider: String(restricted.provider || ""), externalId: String(restricted.externalId || "") },
      categories: reveal.revealCategoriesOf(payload), note: "reveal"
    }).then(() => true).catch(() => false);
    if (!logged) throw new HttpsError("unavailable", "The access log could not be written; the details were not revealed.");
    return { ok: true, ...payload };
  });

  return {
    beginEbayConnect, claimEbayConnectState, ebayOAuthCallback, getEbayConnections, verifyEbayConnection, updateEbayConnectionSettings,
    previewEbayImport, runEbayImport, retryEbayImportFailures, syncEbayNow, disconnectEbay,
    reconcileEbayConnections, reconcileEbayConnectionsNightly, reconcileEbayDeletions, ebayNotifications, revealRestrictedCustomer,
    _internal: {
      applyEbayOrder, reconcileConnection, reconcileConnectionNightly, runSweep, eligibleRows, clientFor, refreshWithLock, recordTokenFailure, storeCredentials, credentialsRef,
      processEbayCommerceTask, processEbayBuyerDeletion, reconcileDeletionRequests, handleNotificationRequest, signingKeyFor, resetCaches,
      publicView, settingsOf, marketplacesOf, clampSinceDays, connectionDocId, ebayOrderDocId, deletionPatch, limits,
      CONNECTION_COLLECTION, STATE_COLLECTION, BUYER_INDEX_COLLECTION, DELETION_LEDGER_COLLECTION, QUOTA_COLLECTION, KEY_CACHE_COLLECTION, RESTRICTED_SUBCOLLECTION, REVEAL_COUNTERS_SUBCOLLECTION
    }
  };
}

module.exports = {
  createEbayConnectorFunctions, connectionDocId, ebayOrderDocId, safeIdPart,
  CONNECTION_COLLECTION, STATE_COLLECTION, BUYER_INDEX_COLLECTION, DELETION_LEDGER_COLLECTION, QUOTA_COLLECTION, KEY_CACHE_COLLECTION, RESTRICTED_SUBCOLLECTION, REVEAL_COUNTERS_SUBCOLLECTION,
  STATE_TTL_MS, TOKEN_REFRESH_AHEAD_MS, TOKEN_REFRESH_LOCK_MS, REFRESH_TOKEN_WARN_MS, MAX_CONNECTIONS_PER_SWEEP, RECONCILE_MAX_PAGES, IMPORT_SLICE_MS
};
