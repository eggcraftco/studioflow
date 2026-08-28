"use strict";

// Bank spending feed via TrueLayer (Open Banking AIS, UK + EU).
// TrueLayer is the FCA-regulated AISP; NivaDesk only consumes their Data API,
// so the user's bank credentials never touch our servers. Read-only account
// information — no payment initiation anywhere in this module.
//
// Data model (all server-written):
//   companies/{companyId}/bankConnections/{connectionId}   (connectionId = our auth state)
//     providerName, providerLogo, status (pending|linked), accounts:
//     [{id, name, currency}], createdAt, linkedAt, lastSyncedAt
//     — owner-readable (rules), NO tokens here.
//   companies/{companyId}/bankTokens/{connectionId}
//     refreshToken — never client-readable (rules deny all client access).
//   companies/{companyId}/bankTransactions/{docId}
//     Two layers on one doc, and the split is what makes re-syncs safe:
//     BANK DATA (sync-owned, rewritten on every sync): accountId, connectionId,
//       amount (Number, signed), currency, bookingDate, description,
//       counterparty, txType, status (booked|pending), provider,
//       providerTransactionId, normalisedProviderId, providerReference,
//       firstImportedAt (first sync only), importedAt (= last synced).
//     NIVADESK ENRICHMENT (only written by the enrichment callables):
//       category, vatCode, note, receiptPath/receiptName, receiptNotNeeded,
//       linkedOrderId/Label, purchaseId/Number, reviewStatus, pandle{…}.
//   companies/{companyId}/bankCategories/{id}
//     Workspace-defined category records: name, type, defaultVatCode, active,
//     reportingGroup, mappings {pandle|quickbooks|xero} — owner-readable.
//
// Secrets: NIVADESK_TL_CLIENT_ID / NIVADESK_TL_CLIENT_SECRET (TrueLayer
// Console → NivaDesk app → Settings, LIVE environment).

const crypto = require("node:crypto");
const { defineSecret } = require("firebase-functions/params");

const TL_CLIENT_ID = defineSecret("NIVADESK_TL_CLIENT_ID");
const TL_CLIENT_SECRET = defineSecret("NIVADESK_TL_CLIENT_SECRET");

const TL_AUTH_BASE = "https://auth.truelayer.com";
const TL_API_BASE = "https://api.truelayer.com";
const REGION = "europe-west2";
const REDIRECT_URL = "https://nivadesk.app/bank";
// Banks rate-limit PSD2 unattended data fetches (typically 4/day), so a sync
// younger than this is served from Firestore instead of re-fetching.
const MIN_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;

// One VAT list for every write path. Zero-rated (ZR) and exempt (EX) are
// different VAT-return boxes, so they are separate codes on purpose; MX marks
// a mixed receipt that can only reach an accounting provider after a split.
const BANK_VAT_CODES = ["ST", "RR", "ZR", "EX", "OS", "NR", "RC", "NV", "IM", "MX"];

// Where a transaction stands on its way to the accountant. "unreviewed" is
// the absent-field default; sync_error and ignored sit outside the happy path.
const BANK_REVIEW_STATUSES = ["unreviewed", "needs_info", "ready", "synced", "confirmed", "sync_error", "ignored"];

// The enrichment layer: everything the workspace adds on top of the bank's
// own data. Carried across when a pending row books under a new provider id.
const ENRICHMENT_FIELDS = [
  "category", "vatCode", "note", "receiptPath", "receiptName", "receiptNotNeeded",
  "receiptFileRecordId", "linkedOrderId", "linkedOrderLabel", "linkedPaymentId",
  "purchaseId", "purchaseNumber", "reviewStatus", "reviewedAt", "pandle",
  "splits", "incomingKind"
];

// What an incoming payment actually is — a transfer between the owner's own
// accounts or an owner contribution is not revenue, and only an explicit
// order_payment may touch an order's payment ledger.
const INCOMING_KINDS = [
  "order_payment", "invoice", "deposit", "refund_received",
  "owner_contribution", "loan", "transfer", "other_income"
];

function createBankFeedFunctions({ admin, onCall, onSchedule, HttpsError, uidIsCompanyOwner, notifyCompany, clearNotification }) {
  const db = () => admin.firestore();
  const receiptInboxRef = (companyId) =>
    db().collection("companies").doc(companyId).collection("bankReceiptInbox");
  const vendorsRef = (companyId) =>
    db().collection("companies").doc(companyId).collection("bankVendors");

  const connectionsRef = (companyId) =>
    db().collection("companies").doc(companyId).collection("bankConnections");
  const tokensRef = (companyId) =>
    db().collection("companies").doc(companyId).collection("bankTokens");
  const transactionsRef = (companyId) =>
    db().collection("companies").doc(companyId).collection("bankTransactions");
  const rulesRef = (companyId) =>
    db().collection("companies").doc(companyId).collection("bankRules");

  // Categorisation rules: "if the counterparty/description contains <keyword>,
  // auto-categorise as <category> (optionally with a VAT treatment)". Auto
  // results live in `categoryAuto`/`vatCodeAuto`; manual choices live in
  // `category`/`vatCode` and always win on the client, so a re-sync can safely
  // recompute the auto pair without touching manual picks. appliesTo scopes a
  // rule to money out ("out", the default), money in ("in") or both.
  async function loadRules(companyId) {
    const snap = await rulesRef(companyId).limit(200).get();
    return snap.docs.map((doc) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        keyword: String(data.keyword || "").toLowerCase(),
        category: String(data.category || ""),
        vatCode: String(data.vatCode || "").toUpperCase(),
        appliesTo: ["out", "in", "both"].includes(String(data.appliesTo)) ? String(data.appliesTo) : "out"
      };
    }).filter((rule) => rule.keyword && rule.category);
  }

  // Most specific rule wins: candidates are tried longest-keyword-first, so
  // "google workspace" beats "google" instead of whichever was created first.
  function matchRule(rules, tx) {
    const haystack = `${tx.counterparty || ""} ${tx.description || ""}`.toLowerCase();
    const direction = Number(tx.amount) >= 0 ? "in" : "out";
    return [...rules].sort((a, b) => b.keyword.length - a.keyword.length).find((rule) =>
      (rule.appliesTo === "both" || rule.appliesTo === direction) && haystack.includes(rule.keyword)
    ) || null;
  }

  async function requireOwner(request) {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "You must be signed in.");
    const companyId = String(request.data?.companyId || "").trim();
    if (!companyId) throw new HttpsError("invalid-argument", "companyId is required.");
    const snap = await db().collection("companies").doc(companyId).get();
    if (!snap.exists) throw new HttpsError("not-found", "Workspace not found.");
    const companyData = snap.data() || {};
    if (!uidIsCompanyOwner(companyData, uid)) {
      throw new HttpsError("permission-denied", "Bank connections are managed by the workspace owner.");
    }
    return { uid, companyId, companyData };
  }

  function credentials() {
    const clientId = TL_CLIENT_ID.value().trim();
    const clientSecret = TL_CLIENT_SECRET.value().trim();
    if (!clientId || !clientSecret) {
      throw new HttpsError("failed-precondition", "Bank data secrets are not configured yet.");
    }
    return { clientId, clientSecret };
  }

  async function tlToken(body) {
    const res = await fetch(`${TL_AUTH_BASE}/connect/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body)
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.access_token) {
      const detail = json?.error_description || json?.error || `HTTP ${res.status}`;
      const authError = new HttpsError("internal", `Bank data auth failed: ${detail}`);
      // Which stage failed decides what we tell the owner: a refused consent
      // is a reconnect, a refused request is a retry.
      authError.tlStage = "auth";
      authError.tlStatus = res.status;
      throw authError;
    }
    return json;
  }

  async function tlData(accessToken, path) {
    const res = await fetch(`${TL_API_BASE}${path}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` }
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const detail = json?.error_description || json?.error || `HTTP ${res.status}`;
      const err = new HttpsError(res.status === 429 ? "resource-exhausted" : "internal", `Bank data request failed: ${detail}`);
      err.tlStatus = res.status;
      err.tlStage = "data";
      throw err;
    }
    return json;
  }

  const cleanText = (value, max = 300) => String(value || "").trim().slice(0, max);

  // Transaction doc id must be deterministic so re-syncs upsert instead of
  // duplicating. TrueLayer ids can carry characters Firestore ids reject.
  function transactionDocId(accountId, tx) {
    const rawId = cleanText(tx.transaction_id, 160) || crypto.createHash("sha1").update(JSON.stringify({
      t: tx.timestamp, a: tx.amount, d: tx.description
    })).digest("hex");
    return `${accountId}_${rawId}`.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 250);
  }

  function normalizeTransaction(accountId, connectionId, tx, status, rules = []) {
    const raw = Math.abs(Number(tx.amount)) || 0;
    const type = cleanText(tx.transaction_type, 20).toUpperCase();
    const signedFromType = type === "DEBIT" ? -raw : raw;
    // TrueLayer amounts are usually already signed; trust an explicit negative.
    const amount = Number(tx.amount) < 0 ? Number(tx.amount) : signedFromType;
    const normalized = {
      accountId,
      connectionId,
      status,
      amount,
      currency: cleanText(tx.currency, 8) || "GBP",
      bookingDate: cleanText(tx.timestamp, 10),
      description: cleanText(tx.description, 300),
      counterparty: cleanText(tx.merchant_name || tx.meta?.provider_merchant_name, 160),
      // How the money moved: PURCHASE / DIRECT_DEBIT / STANDING_ORDER /
      // TRANSFER / BILL_PAYMENT / ATM / … straight from TrueLayer.
      txType: cleanText(tx.transaction_category, 40).toUpperCase(),
      // Permanent provider identity. The doc id is derived from these, but
      // they live as fields too: the identity survives the id sanitisation,
      // can be shown in the detail panel and queried, and the normalised id
      // is stable across the pending→booked flip when the raw id is not.
      provider: "truelayer",
      providerTransactionId: cleanText(tx.transaction_id, 160),
      normalisedProviderId: cleanText(tx.normalised_provider_transaction_id || tx.meta?.normalised_provider_transaction_id, 160),
      providerReference: cleanText(tx.meta?.provider_reference, 200),
      importedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    const auto = matchRule(rules, normalized);
    if (auto) {
      normalized.categoryAuto = cleanText(auto.category, 60);
      // The audit trail: which rule made this decision.
      normalized.categoryAutoRule = cleanText(auto.keyword, 120);
      if (auto.vatCode) normalized.vatCodeAuto = cleanText(auto.vatCode, 4);
    }
    return normalized;
  }

  async function accessTokenForConnection(companyId, connectionId) {
    const tokenDoc = await tokensRef(companyId).doc(connectionId).get();
    const refreshToken = cleanText((tokenDoc.data() || {}).refreshToken, 2000);
    if (!refreshToken) throw new HttpsError("failed-precondition", "This bank connection has no stored consent — reconnect the bank.");
    const { clientId, clientSecret } = credentials();
    const token = await tlToken({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken
    });
    // TrueLayer may rotate the refresh token.
    if (token.refresh_token && token.refresh_token !== refreshToken) {
      await tokensRef(companyId).doc(connectionId).set({ refreshToken: cleanText(token.refresh_token, 2000) }, { merge: true });
    }
    return token.access_token;
  }

  async function syncAccountTransactions(companyId, connectionId, accountId, accessToken, rules = [], { fullHistory = false } = {}) {
    // Under PSD2 a bank only has to serve deep history while the customer is
    // actually present (fresh SCA). An unattended sync asking for two years is
    // answered with 403 Access denied by banks that enforce it — HSBC does —
    // which looked exactly like a dead consent and sent people to reconnect
    // every morning. So: the wide window right after authorisation, a 90-day
    // window afterwards (everything older is already imported and kept), and a
    // narrow retry before believing the connection is broken.
    const to = new Date();
    const wideFrom = new Date(to.getFullYear() - 2, to.getMonth(), to.getDate());
    const recentFrom = new Date(to.getTime() - 89 * 24 * 60 * 60 * 1000);
    const rangeFor = (from) => `from=${from.toISOString().slice(0, 10)}&to=${to.toISOString().slice(0, 10)}`;

    let payload;
    if (fullHistory) {
      try {
        payload = await tlData(accessToken, `/data/v1/accounts/${accountId}/transactions?${rangeFor(wideFrom)}`);
      } catch (error) {
        const status = Number(error?.tlStatus) || 0;
        if (status !== 401 && status !== 403) throw error;
        console.warn("bank sync: deep history refused, falling back to 90 days", accountId, error?.message || error);
        payload = await tlData(accessToken, `/data/v1/accounts/${accountId}/transactions?${rangeFor(recentFrom)}`);
      }
    } else {
      payload = await tlData(accessToken, `/data/v1/accounts/${accountId}/transactions?${rangeFor(recentFrom)}`);
    }
    const booked = Array.isArray(payload?.results) ? payload.results : [];
    let pending = [];
    try {
      const pendingPayload = await tlData(accessToken, `/data/v1/accounts/${accountId}/transactions/pending`);
      pending = Array.isArray(pendingPayload?.results) ? pendingPayload.results : [];
    } catch { /* not all providers expose pending transactions */ }

    const writes = [];
    for (const tx of booked) writes.push({ id: transactionDocId(accountId, tx), data: normalizeTransaction(accountId, connectionId, tx, "booked", rules) });
    for (const tx of pending) writes.push({ id: transactionDocId(accountId, tx), data: normalizeTransaction(accountId, connectionId, tx, "pending", rules) });

    // Which of these ids already exist? One id-only query per account, so a
    // brand-new row gets a firstImportedAt that later syncs never touch
    // (importedAt is rewritten every sync and doubles as "last updated").
    const existingIds = new Set();
    try {
      const prefix = `${accountId}_`.replace(/[^A-Za-z0-9_-]/g, "-");
      const idField = admin.firestore.FieldPath.documentId();
      const idSnap = await transactionsRef(companyId)
        .where(idField, ">=", prefix)
        .where(idField, "<", `${prefix}`)
        .select()
        .get();
      idSnap.docs.forEach((doc) => existingIds.add(doc.id));
    } catch (error) {
      console.warn("bank sync id scan failed:", error?.message || error);
    }

    for (let i = 0; i < writes.length; i += 450) {
      const batch = db().batch();
      for (const { id, data } of writes.slice(i, i + 450)) {
        if (!existingIds.has(id)) data.firstImportedAt = admin.firestore.FieldValue.serverTimestamp();
        batch.set(transactionsRef(companyId).doc(id), data, { merge: true });
      }
      await batch.commit();
    }

    try {
      await reconcilePendingToBooked(companyId, accountId, writes.filter((write) => write.data.status === "booked"));
    } catch (error) {
      console.warn("bank sync pending reconcile failed:", error?.message || error);
    }
    return writes.length;
  }

  // Banks often re-issue a different transaction_id when a pending payment
  // books, which would leave a ghost "pending" doc next to the booked one.
  // TrueLayer's normalised provider id is stable across that flip, so any
  // pending doc whose normalised id now belongs to a booked doc under another
  // id has its enrichment carried over and is then removed.
  async function reconcilePendingToBooked(companyId, accountId, bookedWrites) {
    const bookedByNorm = new Map();
    for (const write of bookedWrites) {
      const norm = cleanText(write.data.normalisedProviderId, 160);
      if (norm) bookedByNorm.set(norm, write.id);
    }
    if (!bookedByNorm.size) return 0;
    const pendingSnap = await transactionsRef(companyId)
      .where("accountId", "==", accountId)
      .where("status", "==", "pending")
      .limit(500)
      .get();
    let moved = 0;
    for (const doc of pendingSnap.docs) {
      const data = doc.data() || {};
      const targetId = bookedByNorm.get(cleanText(data.normalisedProviderId, 160));
      if (!targetId || targetId === doc.id) continue;
      const targetRef = transactionsRef(companyId).doc(targetId);
      const target = (await targetRef.get()).data() || {};
      const carry = {};
      for (const field of ENRICHMENT_FIELDS) {
        if (data[field] !== undefined && target[field] === undefined) carry[field] = data[field];
      }
      if (Object.keys(carry).length) await targetRef.set(carry, { merge: true });
      await doc.ref.delete();
      moved += 1;
    }
    return moved;
  }

  // Builds the TrueLayer consent link. TrueLayer's own auth dialog contains the
  // bank picker, so no institution list is needed on our side.
  const bankCreateRequisition = onCall({ region: REGION, secrets: [TL_CLIENT_ID, TL_CLIENT_SECRET] }, async (request) => {
    const { uid, companyId } = await requireOwner(request);
    const { clientId } = credentials();

    // Our own random state doubles as the connection id and lets the redirect
    // back from the bank find the matching pending connection.
    const state = crypto.randomUUID();
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      scope: "info accounts balance transactions offline_access",
      redirect_uri: REDIRECT_URL,
      state,
      providers: "uk-ob-all uk-oauth-all"
    });

    await connectionsRef(companyId).doc(state).set({
      providerName: "",
      providerLogo: "",
      status: "pending",
      accounts: [],
      createdByUid: uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { requisitionId: state, link: `${TL_AUTH_BASE}/?${params.toString()}` };
  });

  const bankFinalizeRequisition = onCall({ region: REGION, secrets: [TL_CLIENT_ID, TL_CLIENT_SECRET], timeoutSeconds: 180 }, async (request) => {
    const { companyId } = await requireOwner(request);
    const state = cleanText(request.data?.requisitionId, 120);
    const code = cleanText(request.data?.code, 2000);
    if (!state || !code) throw new HttpsError("invalid-argument", "requisitionId and code are required.");
    const connectionDoc = await connectionsRef(companyId).doc(state).get();
    if (!connectionDoc.exists) throw new HttpsError("not-found", "Bank connection not found.");
    if ((connectionDoc.data() || {}).status === "linked") {
      return { status: "linked", accounts: (connectionDoc.data() || {}).accounts || [], imported: 0 };
    }

    const { clientId, clientSecret } = credentials();
    const token = await tlToken({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URL,
      code
    });

    const accountsPayload = await tlData(token.access_token, "/data/v1/accounts");
    const accounts = (Array.isArray(accountsPayload?.results) ? accountsPayload.results : []).map((account) => ({
      id: cleanText(account.account_id, 120),
      name: cleanText(account.display_name || account.account_type, 120),
      currency: cleanText(account.currency, 8)
    })).filter((account) => account.id);
    if (accounts.length === 0) {
      throw new HttpsError("internal", "The bank returned no accounts for this consent.");
    }
    const provider = accountsPayload.results[0]?.provider || {};

    await tokensRef(companyId).doc(state).set({
      refreshToken: cleanText(token.refresh_token, 2000),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    let imported = 0;
    const rules = await loadRules(companyId);
    for (const account of accounts) {
      try {
        imported += await syncAccountTransactions(companyId, state, account.id, token.access_token, rules, { fullHistory: true });
      } catch (error) {
        console.warn("bankFinalizeRequisition initial sync failed:", account.id, error?.message || error);
      }
    }

    await connectionsRef(companyId).doc(state).set({
      status: "linked",
      providerName: cleanText(provider.display_name, 120),
      providerLogo: cleanText(provider.logo_uri, 500),
      accounts,
      linkedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
      // Open Banking consent runs 90 days from authorisation; storing the
      // deadline lets every client show "renew by" before the feed dies.
      consentExpiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 90 * 24 * 60 * 60 * 1000)
    }, { merge: true });

    // Registers the workspace for the scheduled background sync.
    await db().collection("companies").doc(companyId).set({ bankFeedEnabled: true }, { merge: true });

    // Reconnecting the same bank: retire older connections that cover the same
    // accounts so the page does not show two HSBC rows. Transactions are keyed
    // by account id, so they were merged already; just re-point connectionId.
    let replaced = 0;
    try {
      const accountIds = new Set(accounts.map((account) => account.id));
      const others = await connectionsRef(companyId).where("status", "==", "linked").get();
      for (const other of others.docs) {
        if (other.id === state) continue;
        const otherAccounts = Array.isArray(other.get("accounts")) ? other.get("accounts") : [];
        if (!otherAccounts.some((account) => accountIds.has(account?.id))) continue;
        let cursor = null;
        for (let page = 0; page < 20; page += 1) {
          let queryRef = transactionsRef(companyId).where("connectionId", "==", other.id).orderBy("__name__").limit(400);
          if (cursor) queryRef = queryRef.startAfter(cursor);
          const txSnap = await queryRef.get();
          if (txSnap.empty) break;
          const batch = db().batch();
          txSnap.docs.forEach((txDoc) => batch.set(txDoc.ref, { connectionId: state }, { merge: true }));
          await batch.commit();
          cursor = txSnap.docs[txSnap.docs.length - 1];
          if (txSnap.size < 400) break;
        }
        await tokensRef(companyId).doc(other.id).delete().catch(() => {});
        await other.ref.delete();
        replaced += 1;
      }
    } catch (error) {
      console.warn("bankFinalizeRequisition replace failed:", error?.message || error);
    }

    await logBankAudit(companyId, {
      kind: "connected",
      ok: true,
      accounts: Array.isArray(accounts) ? accounts.length : 0,
      imported
    });
    return { status: "linked", accounts, imported, replaced };
  });

  // The bank can stop serving data while our stored consent still says
  // "linked" (90-day Open Banking consent lapses, bank-side revocation,
  // re-authentication demanded). Classify the failure so the clients can show
  // "Reconnect needed" instead of a green Connected dot, and tell the owner once.
  function classifySyncError(error) {
    const message = String(error?.message || error || "");
    const status = Number(error?.tlStatus) || 0;
    const stage = String(error?.tlStage || "");
    if (status === 429) return { kind: "rate_limited", message };
    // The consent itself was refused: only the token exchange can prove that.
    if (stage === "auth" || /invalid_grant/i.test(message)) {
      return { kind: "needs_reconsent", message: message.slice(0, 300) };
    }
    // A refused data request might be the bank narrowing what it serves while
    // the customer is away. Report it as an error first; two in a row are
    // treated as a dead consent by recordSyncFailure.
    if (status === 401 || status === 403 || /access denied|access_denied|consent|unauthori[sz]ed|reconnect/i.test(message)) {
      return { kind: "data_denied", message: message.slice(0, 300) };
    }
    return { kind: "error", message: message.slice(0, 300) };
  }

  // The report's §"audit" ask: refresh and connection events leave a trail a
  // person can read later — who/what connected, which syncs failed and why.
  // Best-effort: an audit line must never break the sync it describes.
  async function logBankAudit(companyId, entry) {
    try {
      await db().collection("companies").doc(String(companyId)).collection("bankAuditLog").add({
        atMs: Date.now(),
        ...entry
      });
    } catch (error) {
      console.warn("bank audit log write failed:", error?.message || error);
    }
  }

  async function recordSyncFailure(companyId, doc, failure) {
    const data = doc.data() || {};
    const failures = (Number(data.syncFailures) || 0) + 1;
    // One-off blips stay "ok"; a consent problem flips straight away, anything
    // else after two consecutive failures.
    const nextState = failure.kind === "needs_reconsent"
      ? "needs_reconsent"
      : failure.kind === "data_denied"
        ? (failures >= 2 ? "needs_reconsent" : "error")
        : failures >= 2 ? "error" : (data.syncState || "ok");
    await doc.ref.set({
      syncState: nextState,
      syncFailures: failures,
      lastSyncError: failure.message,
      lastSyncErrorAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    await logBankAudit(companyId, {
      kind: "sync",
      ok: false,
      connectionId: doc.id,
      bank: cleanText(data.providerName, 80) || "Bank",
      state: nextState,
      error: failure.message.slice(0, 300)
    });
    if (nextState !== "ok" && data.syncState !== nextState && typeof notifyCompany === "function") {
      const bank = cleanText(data.providerName, 80) || "Bank";
      await notifyCompany(companyId, {
        id: `bankSync_${doc.id}`,
        type: "bank_connection_attention",
        title: nextState === "needs_reconsent" ? "Bank connection needs reconnecting" : "Bank sync is failing",
        message: nextState === "needs_reconsent"
          ? `${bank}: the bank stopped sharing data (consent expired or revoked). Open Banking and reconnect to keep the feed flowing.`
          : `${bank}: the last ${failures} syncs failed (${failure.message.slice(0, 120)}).`,
        route: "bank",
        source: "bankSync"
      }).catch((error) => console.warn("bank sync notification failed:", error?.message || error));
    }
  }

  // Shared by the manual Refresh callable and the scheduled background sync.
  async function syncCompanyConnections(companyId, { force = false } = {}) {
    const snap = await connectionsRef(companyId).where("status", "==", "linked").get();
    if (snap.empty) return { synced: 0, skipped: 0, imported: 0 };

    let synced = 0;
    let skipped = 0;
    let imported = 0;
    const now = Date.now();
    const rules = await loadRules(companyId);

    for (const doc of snap.docs) {
      const data = doc.data() || {};
      const last = data.lastSyncedAt?.toMillis ? data.lastSyncedAt.toMillis() : 0;
      if (!force && now - last < MIN_SYNC_INTERVAL_MS) {
        skipped += 1;
        continue;
      }
      let ok = false;
      let failure = null; // { kind: "needs_reconsent" | "error" | "rate_limited", message }
      let importedForConnection = 0;
      try {
        const accessToken = await accessTokenForConnection(companyId, doc.id);
        const accounts = Array.isArray(data.accounts) ? data.accounts : [];
        for (const account of accounts) {
          try {
            const importedForAccount = await syncAccountTransactions(companyId, doc.id, account.id, accessToken, rules, { fullHistory: false });
            imported += importedForAccount;
            importedForConnection += importedForAccount;
            ok = true;
          } catch (error) {
            console.warn("bank sync account failed:", account.id, error?.message || error);
            if (error?.tlStatus === 429) skipped += 1;
            if (!failure || failure.kind === "rate_limited") failure = classifySyncError(error);
          }
        }
      } catch (error) {
        console.warn("bank sync connection failed:", doc.id, error?.message || error);
        failure = classifySyncError(error);
      }
      if (ok) {
        synced += 1;
        if (data.syncState && data.syncState !== "ok" && typeof clearNotification === "function") {
          await clearNotification(companyId, `bankSync_${doc.id}`).catch((error) =>
            console.warn("bank sync alert clear failed:", doc.id, error?.message || error));
        }
        await doc.ref.set({
          lastSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
          syncState: "ok",
          syncFailures: 0,
          lastSyncError: admin.firestore.FieldValue.delete(),
          lastSyncErrorAt: admin.firestore.FieldValue.delete()
        }, { merge: true });
        await logBankAudit(companyId, {
          kind: "sync",
          ok: true,
          connectionId: doc.id,
          bank: cleanText(data.providerName, 80) || "Bank",
          imported: importedForConnection
        });
      } else if (failure && failure.kind !== "rate_limited") {
        await recordSyncFailure(companyId, doc, failure);
      }
    }

    if (imported > 0) {
      try {
        const matched = await matchWaitingReceipts(companyId);
        if (matched) console.log("bank sync matched waiting receipts", companyId, matched);
      } catch (error) {
        console.warn("matchWaitingReceipts failed:", companyId, error?.message || error);
      }
    }

    return { synced, skipped, imported };
  }

  const bankSyncTransactions = onCall({ region: REGION, secrets: [TL_CLIENT_ID, TL_CLIENT_SECRET], timeoutSeconds: 300 }, async (request) => {
    const { companyId } = await requireOwner(request);
    return syncCompanyConnections(companyId, { force: request.data?.force === true });
  });

  // Background refresh so spending shows up without anyone pressing Refresh.
  // Every 8 hours ≈ 3 unattended fetches/day — inside the PSD2 allowance.
  // Companies are found via the `bankFeedEnabled` flag the finalize step sets
  // (kept a plain single-field query so no composite index is needed).
  const scheduledBankSync = onSchedule({
    schedule: "every 8 hours",
    timeZone: "Europe/London",
    region: REGION,
    secrets: [TL_CLIENT_ID, TL_CLIENT_SECRET],
    timeoutSeconds: 540
  }, async () => {
    const companies = await db().collection("companies").where("bankFeedEnabled", "==", true).limit(300).get();
    for (const companyDoc of companies.docs) {
      try {
        const result = await syncCompanyConnections(companyDoc.id);
        if (result.synced > 0 || result.imported > 0) {
          console.log("scheduledBankSync", companyDoc.id, JSON.stringify(result));
        }
      } catch (error) {
        console.warn("scheduledBankSync company failed:", companyDoc.id, error?.message || error);
      }
    }
  });

  // Two different intents, kept apart on purpose (the report's rule):
  // "disconnect" only revokes the consent — the transaction history stays,
  // nothing already imported is touched. "purge" is the destructive path that
  // also removes every imported transaction of this connection.
  const bankDeleteConnection = onCall({ region: REGION, secrets: [TL_CLIENT_ID, TL_CLIENT_SECRET], timeoutSeconds: 180 }, async (request) => {
    const { companyId } = await requireOwner(request);
    const connectionId = cleanText(request.data?.requisitionId, 120);
    if (!connectionId) throw new HttpsError("invalid-argument", "requisitionId is required.");
    const connectionDoc = await connectionsRef(companyId).doc(connectionId).get();
    if (!connectionDoc.exists) throw new HttpsError("not-found", "Bank connection not found.");

    const mode = cleanText(request.data?.mode, 12) === "purge" ? "purge" : "disconnect";
    if (mode === "disconnect") {
      await tokensRef(companyId).doc(connectionId).delete();
      await connectionsRef(companyId).doc(connectionId).set({
        status: "disconnected",
        syncState: "disconnected",
        disconnectedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      const stillLinked = await connectionsRef(companyId).where("status", "==", "linked").limit(1).get();
      if (stillLinked.empty) {
        await db().collection("companies").doc(companyId).set({ bankFeedEnabled: false }, { merge: true });
      }
      await logBankAudit(companyId, { kind: "disconnected", ok: true, connectionId, kept: true });
      return { disconnected: true, kept: true };
    }

    // Drop the stored consent first so no further data can be fetched, then
    // remove this connection's transactions in pages.
    await tokensRef(companyId).doc(connectionId).delete();
    for (;;) {
      const page = await transactionsRef(companyId).where("connectionId", "==", connectionId).limit(400).get();
      if (page.empty) break;
      const batch = db().batch();
      page.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
      if (page.size < 400) break;
    }

    await connectionsRef(companyId).doc(connectionId).delete();

    // Last linked bank gone → drop out of the scheduled background sync.
    const remaining = await connectionsRef(companyId).where("status", "==", "linked").limit(1).get();
    if (remaining.empty) {
      await db().collection("companies").doc(companyId).set({ bankFeedEnabled: false }, { merge: true });
    }

    await logBankAudit(companyId, { kind: "purged", ok: true, connectionId });
    return { deleted: true };
  });

  // Reads the trail the hooks above leave. Owner-only like the rest of the
  // connection surface; served by a callable so no client rule is needed.
  const bankListAuditLog = onCall({ region: REGION }, async (request) => {
    const { companyId } = await requireOwner(request);
    const limit = Math.min(Math.max(Number(request.data?.limit) || 20, 1), 50);
    const snap = await db().collection("companies").doc(String(companyId))
      .collection("bankAuditLog").orderBy("atMs", "desc").limit(limit).get();
    return { ok: true, entries: snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) })) };
  });

  // Records (or clears) the receipt/invoice attached to a transaction. Two
  // sources: a fresh upload under companies/{id}/bank_receipts/{txId}/, or an
  // EXISTING file from the central Files library (fileRecordId) — the same
  // invoice already sitting on a Purchase is referenced, never re-uploaded.
  // Cleanup only ever deletes bank_receipts uploads; a library file referenced
  // here is shared and must survive the receipt being swapped or cleared.
  const bankSetTransactionReceipt = onCall({ region: REGION, timeoutSeconds: 60 }, async (request) => {
    const { companyId } = await requireOwner(request);
    const transactionId = cleanText(request.data?.transactionId, 250);
    if (!transactionId) throw new HttpsError("invalid-argument", "transactionId is required.");
    const txRef = transactionsRef(companyId).doc(transactionId);
    const txDoc = await txRef.get();
    if (!txDoc.exists) throw new HttpsError("not-found", "Transaction not found.");

    let storagePath = cleanText(request.data?.storagePath, 500);
    let fileName = cleanText(request.data?.fileName, 200);
    const fileRecordId = cleanText(request.data?.fileRecordId, 80);
    const previousPath = cleanText((txDoc.data() || {}).receiptPath, 500);
    const ownUploadPrefix = `companies/${companyId}/bank_receipts/`;

    if (fileRecordId) {
      const recordDoc = await db().collection("companies").doc(companyId).collection("fileRecords").doc(fileRecordId).get();
      const record = recordDoc.data();
      if (!record) throw new HttpsError("not-found", "That file was not found in the library.");
      if ((Number(record.trashedAtMs) || 0) > 0) throw new HttpsError("failed-precondition", "That file is in the library trash.");
      storagePath = cleanText(record.storagePath, 500);
      fileName = cleanText(record.displayName || record.fileName, 200) || fileName;
      if (!storagePath) throw new HttpsError("failed-precondition", "That library file has no stored object.");
      await txRef.set({
        receiptPath: storagePath,
        receiptName: fileName || storagePath.split("/").pop() || "receipt",
        receiptFileRecordId: fileRecordId
      }, { merge: true });
    } else if (storagePath) {
      const expectedPrefix = `${ownUploadPrefix}${transactionId}/`;
      if (!storagePath.startsWith(expectedPrefix)) {
        throw new HttpsError("invalid-argument", "storagePath does not belong to this transaction.");
      }
      await txRef.set({
        receiptPath: storagePath,
        receiptName: fileName || storagePath.split("/").pop() || "receipt",
        receiptFileRecordId: admin.firestore.FieldValue.delete()
      }, { merge: true });
    } else {
      await txRef.set({ receiptPath: "", receiptName: "", receiptFileRecordId: admin.firestore.FieldValue.delete() }, { merge: true });
    }

    // Best-effort cleanup of a replaced/removed file — bank uploads only.
    if (previousPath && previousPath !== storagePath && previousPath.startsWith(ownUploadPrefix)) {
      try { await admin.storage().bucket().file(previousPath).delete(); } catch { /* already gone */ }
    }

    return { ok: true };
  });

  const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
  const BANK_EXPENSE_TITLE = "Bank Spending";

  // Links a spending transaction to an order as a real expense: the amount is
  // added to the order's "Bank Spending" custom expense heading, so it flows
  // into the order's final-profit maths on every platform. Calling again on a
  // linked transaction unlinks it (amount is subtracted back).
  const bankLinkTransactionToOrder = onCall({ region: REGION, timeoutSeconds: 60 }, async (request) => {
    const { companyId } = await requireOwner(request);
    const transactionId = cleanText(request.data?.transactionId, 250);
    if (!transactionId) throw new HttpsError("invalid-argument", "transactionId is required.");
    const txRef = transactionsRef(companyId).doc(transactionId);
    const txDoc = await txRef.get();
    if (!txDoc.exists) throw new HttpsError("not-found", "Transaction not found.");
    const tx = txDoc.data() || {};
    const spend = round2(Math.abs(Number(tx.amount) || 0));
    if (!(spend > 0) || Number(tx.amount) >= 0) {
      throw new HttpsError("failed-precondition", "Only outgoing transactions can be linked as expenses.");
    }

    const alreadyLinkedOrderId = cleanText(tx.linkedOrderId, 120);
    const orderId = alreadyLinkedOrderId || cleanText(request.data?.orderId, 120);
    if (!orderId) throw new HttpsError("invalid-argument", "orderId is required.");

    const orderRef = db().collection("siparisler").doc(orderId);
    const orderDoc = await orderRef.get();
    if (!orderDoc.exists) throw new HttpsError("not-found", "Order not found.");
    const orderData = orderDoc.data() || {};
    if (cleanText(orderData.companyId, 120) !== companyId) {
      throw new HttpsError("permission-denied", "The order belongs to a different workspace.");
    }

    const fields = orderData.customFields && typeof orderData.customFields === "object" && !Array.isArray(orderData.customFields)
      ? { ...orderData.customFields }
      : {};
    const expenseKey = `financialExpense::${BANK_EXPENSE_TITLE}`;
    const current = round2(String(fields[expenseKey] || "").replace(/,/g, ""));

    if (alreadyLinkedOrderId) {
      // Unlink: subtract the amount back out and clear the marker. A zeroed
      // heading value is removed with FieldValue.delete() — merge alone never
      // drops map keys.
      const next = round2(Math.max(0, current - spend));
      await orderRef.set({
        customFields: { [expenseKey]: next > 0 ? String(next) : admin.firestore.FieldValue.delete() }
      }, { merge: true });
      await txRef.set({ linkedOrderId: "", linkedOrderLabel: "" }, { merge: true });
      return { linked: false };
    }

    // Ensure the "Bank Spending" heading exists in the order's expense list so
    // every platform renders the row. Only the touched keys are written (merge
    // unions map keys), so concurrent edits to other custom fields survive.
    const patch = { [expenseKey]: String(round2(current + spend)) };
    let headings = [];
    try { headings = JSON.parse(String(fields.orderExpenseItemsJSON || "[]")); } catch { headings = []; }
    if (!Array.isArray(headings)) headings = [];
    if (!headings.some((item) => cleanText(item?.title, 120) === BANK_EXPENSE_TITLE)) {
      headings.push({ id: crypto.randomUUID(), title: BANK_EXPENSE_TITLE });
      patch.orderExpenseItemsJSON = JSON.stringify(headings);
    }
    await orderRef.set({ customFields: patch }, { merge: true });

    const orderLabel = cleanText(orderData.designName, 80) || cleanText(orderData.customerName, 80) || orderId;
    await txRef.set({ linkedOrderId: orderId, linkedOrderLabel: orderLabel }, { merge: true });
    return { linked: true, orderLabel };
  });

  // One payment, several purposes: an Amazon charge can be part Materials for
  // one order, part Packaging for another, part plain office expense. Splits
  // are enrichment lines on top of the untouched bank amount, and their total
  // must equal that amount to the penny. Order references on split lines are
  // annotations; the money-level order expense still flows through
  // bankLinkTransactionToOrder so it is never counted twice.
  const bankSetTransactionSplits = onCall({ region: REGION, timeoutSeconds: 60 }, async (request) => {
    const { companyId } = await requireOwner(request);
    const transactionId = cleanText(request.data?.transactionId, 250);
    if (!transactionId) throw new HttpsError("invalid-argument", "transactionId is required.");
    const txRef = transactionsRef(companyId).doc(transactionId);
    const txDoc = await txRef.get();
    if (!txDoc.exists) throw new HttpsError("not-found", "Transaction not found.");
    const tx = txDoc.data() || {};

    const raw = Array.isArray(request.data?.splits) ? request.data.splits.slice(0, 12) : [];
    if (!raw.length) {
      await txRef.set({ splits: admin.firestore.FieldValue.delete(), reviewedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return { ok: true, cleared: true };
    }

    const splits = [];
    for (const item of raw) {
      const amount = round2(Math.abs(Number(item?.amount) || 0));
      const category = cleanText(item?.category, 60);
      if (!(amount > 0)) throw new HttpsError("invalid-argument", "Every split line needs an amount.");
      if (!category) throw new HttpsError("invalid-argument", "Every split line needs a category.");
      const vatCode = cleanText(item?.vatCode, 4).toUpperCase();
      if (vatCode && !BANK_VAT_CODES.includes(vatCode)) throw new HttpsError("invalid-argument", "Unknown VAT code.");
      const split = { amount, category };
      if (vatCode) split.vatCode = vatCode;
      const note = cleanText(item?.note, 200);
      if (note) split.note = note;
      const orderId = cleanText(item?.orderId, 120);
      if (orderId) {
        const orderDoc = await db().collection("siparisler").doc(orderId).get();
        const orderData = orderDoc.data();
        if (!orderData || cleanText(orderData.companyId, 120) !== companyId) {
          throw new HttpsError("not-found", "A split line points at an order that is not in this workspace.");
        }
        split.orderId = orderId;
        split.orderLabel = cleanText(orderData.designName, 80) || cleanText(orderData.customerName, 80) || orderId;
      }
      splits.push(split);
    }
    if (splits.length < 2) throw new HttpsError("invalid-argument", "A split needs at least two lines.");
    const total = round2(splits.reduce((acc, item) => acc + item.amount, 0));
    const txAbs = round2(Math.abs(Number(tx.amount) || 0));
    if (Math.abs(total - txAbs) > 0.005) {
      throw new HttpsError("invalid-argument", `Split lines add up to ${total.toFixed(2)} but the transaction is ${txAbs.toFixed(2)} — they must match exactly.`);
    }

    await txRef.set({ splits, reviewedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return { ok: true, lines: splits.length };
  });

  // Incoming payments: what landed in the bank must be MATCHED to the payment
  // the order already recorded, never recorded twice. "suggest" lists the
  // order's unlinked payments with the same amount; "link" stamps one of them
  // with the bank transaction id; "create" appends a new payment entry (only
  // when nothing matched) — guarded so the same bank row can never create two;
  // "unlink" undoes the link but never deletes a payment.
  const bankMatchIncomingToOrder = onCall({ region: REGION, timeoutSeconds: 60 }, async (request) => {
    const { companyId, uid } = await requireOwner(request);
    const transactionId = cleanText(request.data?.transactionId, 250);
    const mode = cleanText(request.data?.mode, 12) || "suggest";
    if (!transactionId) throw new HttpsError("invalid-argument", "transactionId is required.");
    const txRef = transactionsRef(companyId).doc(transactionId);
    const txDoc = await txRef.get();
    if (!txDoc.exists) throw new HttpsError("not-found", "Transaction not found.");
    const tx = txDoc.data() || {};
    const amount = round2(Number(tx.amount) || 0);
    if (!(amount > 0)) throw new HttpsError("failed-precondition", "Only incoming transactions can be matched to order payments.");

    if (mode === "unlink") {
      const previousOrderId = cleanText(tx.linkedOrderId, 120);
      const previousPaymentId = cleanText(tx.linkedPaymentId, 80);
      if (previousOrderId && previousPaymentId) {
        const orderRef = db().collection("siparisler").doc(previousOrderId);
        const orderDoc = await orderRef.get();
        const orderData = orderDoc.data();
        if (orderData && cleanText(orderData.companyId, 120) === companyId && Array.isArray(orderData.payments)) {
          const payments = orderData.payments.map((entry) =>
            entry && cleanText(entry.id, 80) === previousPaymentId ? { ...entry, bankTransactionId: "" } : entry);
          await orderRef.set({ payments }, { merge: true });
        }
      }
      await txRef.set({
        linkedOrderId: "", linkedOrderLabel: "", linkedPaymentId: "",
        incomingKind: admin.firestore.FieldValue.delete()
      }, { merge: true });
      return { ok: true, unlinked: true };
    }

    const orderId = cleanText(request.data?.orderId, 120);
    if (!orderId) throw new HttpsError("invalid-argument", "orderId is required.");
    const orderRef = db().collection("siparisler").doc(orderId);
    const orderDoc = await orderRef.get();
    const orderData = orderDoc.data();
    if (!orderData || cleanText(orderData.companyId, 120) !== companyId) {
      throw new HttpsError("not-found", "Order not found in this workspace.");
    }
    const orderLabel = cleanText(orderData.designName, 80) || cleanText(orderData.customerName, 80) || orderId;
    const payments = Array.isArray(orderData.payments) ? orderData.payments : [];

    // The same bank row already created/linked a payment on this order →
    // idempotent success, nothing is written twice.
    const existing = payments.find((entry) => entry && cleanText(entry.bankTransactionId, 250) === transactionId);
    if (existing) {
      await txRef.set({ incomingKind: "order_payment", linkedOrderId: orderId, linkedOrderLabel: orderLabel, linkedPaymentId: cleanText(existing.id, 80) }, { merge: true });
      return { ok: true, linked: true, paymentId: cleanText(existing.id, 80), already: true };
    }

    const candidates = payments
      .filter((entry) => entry && !cleanText(entry.bankTransactionId, 250) && Math.abs(round2(Number(entry.amount) || 0) - amount) <= 0.01)
      .map((entry) => ({
        id: cleanText(entry.id, 80),
        amount: round2(Number(entry.amount) || 0),
        method: cleanText(entry.method, 60),
        note: cleanText(entry.note, 200),
        dateMs: entry.date?.toMillis ? entry.date.toMillis() : 0
      }));

    if (mode === "suggest") {
      return { ok: true, orderLabel, candidates };
    }

    if (mode === "link") {
      const paymentId = cleanText(request.data?.paymentId, 80) || (candidates.length === 1 ? candidates[0].id : "");
      if (!paymentId) {
        // Zero or several candidates and no explicit choice — the client must
        // ask the owner instead of guessing at money.
        return { ok: false, needsChoice: true, orderLabel, candidates };
      }
      const target = payments.find((entry) => entry && cleanText(entry.id, 80) === paymentId);
      if (!target) throw new HttpsError("not-found", "That payment entry was not found on the order.");
      if (cleanText(target.bankTransactionId, 250)) throw new HttpsError("failed-precondition", "That payment is already matched to another bank transaction.");
      const nextPayments = payments.map((entry) =>
        entry && cleanText(entry.id, 80) === paymentId ? { ...entry, bankTransactionId: transactionId } : entry);
      await orderRef.set({ payments: nextPayments }, { merge: true });
      await txRef.set({ incomingKind: "order_payment", linkedOrderId: orderId, linkedOrderLabel: orderLabel, linkedPaymentId: paymentId }, { merge: true });
      return { ok: true, linked: true, paymentId };
    }

    if (mode === "create") {
      const entry = {
        id: crypto.randomUUID(),
        amount,
        date: tx.bookingDate ? admin.firestore.Timestamp.fromDate(new Date(`${cleanText(tx.bookingDate, 10)}T12:00:00Z`)) : admin.firestore.Timestamp.now(),
        method: "Bank transfer",
        note: cleanText(tx.counterparty || tx.description, 160),
        createdByUid: uid || "",
        createdByEmail: "",
        bankTransactionId: transactionId
      };
      const paidAmount = round2((Number(orderData.paidAmount) || 0) + amount);
      const remainingAmount = Math.max(0, round2((Number(orderData.remainingAmount) || 0) - amount));
      await orderRef.set({
        payments: payments.concat([entry]).slice(-200),
        paidAmount,
        remainingAmount,
        orderValue: round2(paidAmount + remainingAmount)
      }, { merge: true });
      await txRef.set({ incomingKind: "order_payment", linkedOrderId: orderId, linkedOrderLabel: orderLabel, linkedPaymentId: entry.id }, { merge: true });
      return { ok: true, created: true, paymentId: entry.id };
    }

    throw new HttpsError("invalid-argument", "Unknown mode.");
  });

  // Manual category on a single transaction ("" clears it back to auto).
  const bankSetTransactionCategory = onCall({ region: REGION, timeoutSeconds: 60 }, async (request) => {
    const { companyId } = await requireOwner(request);
    const transactionId = cleanText(request.data?.transactionId, 250);
    if (!transactionId) throw new HttpsError("invalid-argument", "transactionId is required.");
    const txRef = transactionsRef(companyId).doc(transactionId);
    if (!(await txRef.get()).exists) throw new HttpsError("not-found", "Transaction not found.");
    const category = cleanText(request.data?.category, 60);
    await txRef.set(category ? { category } : { category: admin.firestore.FieldValue.delete() }, { merge: true });
    return { ok: true };
  });

  // Bulk review: one category for many transactions (≤200 per call).
  const bankSetTransactionCategoryBulk = onCall({ region: REGION, timeoutSeconds: 120 }, async (request) => {
    const { companyId } = await requireOwner(request);
    const ids = Array.from(new Set((Array.isArray(request.data?.transactionIds) ? request.data.transactionIds : [])
      .map((id) => cleanText(id, 250)).filter(Boolean))).slice(0, 200);
    if (!ids.length) throw new HttpsError("invalid-argument", "transactionIds is required.");
    const category = cleanText(request.data?.category, 60);
    const value = category ? { category } : { category: admin.firestore.FieldValue.delete() };
    const refs = ids.map((id) => transactionsRef(companyId).doc(id));
    const docs = await db().getAll(...refs);
    const batch = db().batch();
    let updated = 0;
    docs.forEach((doc) => { if (doc.exists) { batch.set(doc.ref, value, { merge: true }); updated += 1; } });
    if (updated) await batch.commit();
    return { ok: true, updated };
  });

  // VAT treatment per transaction (NivaDesk's own codes — the connector maps
  // them per provider at push time). Empty = fall back to the category default.
  const bankSetTransactionVatBulk = onCall({ region: REGION, timeoutSeconds: 120 }, async (request) => {
    const { companyId } = await requireOwner(request);
    const ids = Array.from(new Set((Array.isArray(request.data?.transactionIds) ? request.data.transactionIds : [])
      .map((id) => cleanText(id, 250)).filter(Boolean))).slice(0, 200);
    if (!ids.length) throw new HttpsError("invalid-argument", "transactionIds is required.");
    const vatCode = cleanText(request.data?.vatCode, 4).toUpperCase();
    if (vatCode && !BANK_VAT_CODES.includes(vatCode)) throw new HttpsError("invalid-argument", "Unknown VAT code.");
    const value = vatCode ? { vatCode } : { vatCode: admin.firestore.FieldValue.delete() };
    const docs = await db().getAll(...ids.map((id) => transactionsRef(companyId).doc(id)));
    const batch = db().batch();
    let updated = 0;
    docs.forEach((doc) => { if (doc.exists) { batch.set(doc.ref, value, { merge: true }); updated += 1; } });
    if (updated) await batch.commit();
    return { ok: true, updated };
  });

  // Transaction drawer "Save": category, VAT code and note in one write.
  const bankUpdateTransaction = onCall({ region: REGION, timeoutSeconds: 60 }, async (request) => {
    const { companyId } = await requireOwner(request);
    const transactionId = cleanText(request.data?.transactionId, 250);
    if (!transactionId) throw new HttpsError("invalid-argument", "transactionId is required.");
    const txRef = transactionsRef(companyId).doc(transactionId);
    if (!(await txRef.get()).exists) throw new HttpsError("not-found", "Transaction not found.");
    const patch = {};
    const data = request.data || {};
    if (data.category !== undefined) {
      const category = cleanText(data.category, 60);
      patch.category = category || admin.firestore.FieldValue.delete();
    }
    if (data.vatCode !== undefined) {
      const vatCode = cleanText(data.vatCode, 4).toUpperCase();
      if (vatCode && !BANK_VAT_CODES.includes(vatCode)) throw new HttpsError("invalid-argument", "Unknown VAT code.");
      patch.vatCode = vatCode || admin.firestore.FieldValue.delete();
    }
    if (data.note !== undefined) {
      const note = cleanText(data.note, 1000);
      patch.note = note || admin.firestore.FieldValue.delete();
    }
    if (data.receiptNotNeeded !== undefined) {
      patch.receiptNotNeeded = data.receiptNotNeeded === true ? true : admin.firestore.FieldValue.delete();
    }
    if (data.reviewStatus !== undefined) {
      const reviewStatus = cleanText(data.reviewStatus, 20).toLowerCase();
      if (reviewStatus && !BANK_REVIEW_STATUSES.includes(reviewStatus)) throw new HttpsError("invalid-argument", "Unknown review status.");
      patch.reviewStatus = reviewStatus && reviewStatus !== "unreviewed" ? reviewStatus : admin.firestore.FieldValue.delete();
    }
    if (data.incomingKind !== undefined) {
      const incomingKind = cleanText(data.incomingKind, 24).toLowerCase();
      if (incomingKind && !INCOMING_KINDS.includes(incomingKind)) throw new HttpsError("invalid-argument", "Unknown incoming kind.");
      patch.incomingKind = incomingKind || admin.firestore.FieldValue.delete();
    }
    if (!Object.keys(patch).length) throw new HttpsError("invalid-argument", "Nothing to update.");
    patch.reviewedAt = admin.firestore.FieldValue.serverTimestamp();
    await txRef.set(patch, { merge: true });
    return { ok: true };
  });

  // Review workflow, in bulk so "Mark reviewed" / "Ready for accounting" work
  // straight from a table selection. "unreviewed" (or empty) clears the field.
  const bankSetReviewStatusBulk = onCall({ region: REGION, timeoutSeconds: 120 }, async (request) => {
    const { companyId } = await requireOwner(request);
    const ids = Array.from(new Set((Array.isArray(request.data?.transactionIds) ? request.data.transactionIds : [])
      .map((id) => cleanText(id, 250)).filter(Boolean))).slice(0, 200);
    if (!ids.length) throw new HttpsError("invalid-argument", "transactionIds is required.");
    const reviewStatus = cleanText(request.data?.reviewStatus, 20).toLowerCase();
    if (reviewStatus && !BANK_REVIEW_STATUSES.includes(reviewStatus)) throw new HttpsError("invalid-argument", "Unknown review status.");
    const value = reviewStatus && reviewStatus !== "unreviewed"
      ? { reviewStatus, reviewedAt: admin.firestore.FieldValue.serverTimestamp() }
      : { reviewStatus: admin.firestore.FieldValue.delete() };
    const docs = await db().getAll(...ids.map((id) => transactionsRef(companyId).doc(id)));
    const batch = db().batch();
    let updated = 0;
    docs.forEach((doc) => { if (doc.exists) { batch.set(doc.ref, value, { merge: true }); updated += 1; } });
    if (updated) await batch.commit();
    return { ok: true, updated };
  });

  // ---- Categories ----------------------------------------------------------
  // The built-in names every client ships are a starting set, not the model:
  // a workspace can add its own categories, rename them, deactivate them, give
  // each a default VAT treatment and map it per accounting provider. Nothing
  // is hard-coded to Pandle/QuickBooks/Xero — connectors read the mapping at
  // push time and translate then.

  const categoriesRef = (companyId) =>
    db().collection("companies").doc(companyId).collection("bankCategories");
  const CATEGORY_TYPES = ["expense", "income", "transfer"];

  function normalizeCategoryMappings(value) {
    const src = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const out = {};
    if (src.pandle && typeof src.pandle === "object") {
      out.pandle = {
        nominalCode: cleanText(src.pandle.nominalCode, 12),
        taxCode: cleanText(src.pandle.taxCode, 12).toUpperCase()
      };
    }
    if (src.quickbooks && typeof src.quickbooks === "object") {
      out.quickbooks = { accountId: cleanText(src.quickbooks.accountId, 40) };
    }
    if (src.xero && typeof src.xero === "object") {
      out.xero = { accountCode: cleanText(src.xero.accountCode, 12) };
    }
    return out;
  }

  // Renaming follows through: transactions and rules that carried the old
  // name move to the new one, otherwise the rename would orphan them.
  async function renameCategoryEverywhere(companyId, oldName, newName) {
    let renamed = 0;
    for (const field of ["category", "categoryAuto"]) {
      let cursor = null;
      for (let page = 0; page < 10; page += 1) {
        let queryRef = transactionsRef(companyId).where(field, "==", oldName).orderBy("__name__").limit(400);
        if (cursor) queryRef = queryRef.startAfter(cursor);
        const snap = await queryRef.get();
        if (snap.empty) break;
        const batch = db().batch();
        snap.docs.forEach((doc) => batch.set(doc.ref, { [field]: newName }, { merge: true }));
        await batch.commit();
        renamed += snap.size;
        cursor = snap.docs[snap.docs.length - 1];
        if (snap.size < 400) break;
      }
    }
    const rules = await rulesRef(companyId).where("category", "==", oldName).get();
    for (const doc of rules.docs) await doc.ref.set({ category: newName }, { merge: true });
    return renamed;
  }

  const bankSaveCategory = onCall({ region: REGION, timeoutSeconds: 300 }, async (request) => {
    const { companyId } = await requireOwner(request);
    const name = cleanText(request.data?.name, 60);
    if (!name) throw new HttpsError("invalid-argument", "name is required.");
    const categoryId = cleanText(request.data?.categoryId, 120);
    const rawType = cleanText(request.data?.type, 20).toLowerCase();
    const type = CATEGORY_TYPES.includes(rawType) ? rawType : "expense";
    const defaultVatCode = cleanText(request.data?.defaultVatCode, 4).toUpperCase();
    if (defaultVatCode && !BANK_VAT_CODES.includes(defaultVatCode)) throw new HttpsError("invalid-argument", "Unknown VAT code.");
    const reportingGroup = cleanText(request.data?.reportingGroup, 60);
    const active = request.data?.active !== false;
    const mappings = normalizeCategoryMappings(request.data?.mappings);

    // One record per name.
    const clash = await categoriesRef(companyId).where("name", "==", name).limit(1).get();
    if (!clash.empty && clash.docs[0].id !== categoryId) {
      throw new HttpsError("already-exists", "A category with this name already exists.");
    }

    const ref = categoryId ? categoriesRef(companyId).doc(categoryId) : categoriesRef(companyId).doc();
    const previousDoc = categoryId ? await ref.get() : null;
    if (categoryId && !previousDoc.exists) throw new HttpsError("not-found", "Category not found.");
    const previous = previousDoc ? previousDoc.data() || {} : {};
    await ref.set({
      name, type, defaultVatCode, reportingGroup, active, mappings,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: previous.createdAt || admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    let renamed = 0;
    const oldName = cleanText(previous.name, 60);
    if (oldName && oldName !== name) {
      renamed = await renameCategoryEverywhere(companyId, oldName, name);
    }
    return { ok: true, categoryId: ref.id, renamed };
  });

  // Removes the record. Transactions keep their category as a plain string
  // (it simply becomes an unmanaged name again) — deactivating via
  // bankSaveCategory({active:false}) is the softer option.
  const bankDeleteCategory = onCall({ region: REGION, timeoutSeconds: 60 }, async (request) => {
    const { companyId } = await requireOwner(request);
    const categoryId = cleanText(request.data?.categoryId, 120);
    if (!categoryId) throw new HttpsError("invalid-argument", "categoryId is required.");
    await categoriesRef(companyId).doc(categoryId).delete();
    return { ok: true };
  });

  // Walks the whole feed (paged) recomputing categoryAuto against the current
  // rule set. Shared by rule create and rule delete so both stay consistent.
  async function recomputeAutoCategories(companyId) {
    const rules = await loadRules(companyId);
    let cursor = null;
    for (let page = 0; page < 10; page += 1) {
      let queryRef = transactionsRef(companyId).orderBy("__name__").limit(400);
      if (cursor) queryRef = queryRef.startAfter(cursor);
      const snap = await queryRef.get();
      if (snap.empty) break;
      const batch = db().batch();
      let touched = 0;
      for (const doc of snap.docs) {
        const data = doc.data() || {};
        const hit = matchRule(rules, data);
        const nextCategory = hit ? cleanText(hit.category, 60) : "";
        const nextVat = hit && hit.vatCode ? cleanText(hit.vatCode, 4) : "";
        const nextRule = hit ? cleanText(hit.keyword, 120) : "";
        if (nextCategory !== cleanText(data.categoryAuto, 60) || nextVat !== cleanText(data.vatCodeAuto, 4) || nextRule !== cleanText(data.categoryAutoRule, 120)) {
          batch.set(doc.ref, {
            categoryAuto: nextCategory || admin.firestore.FieldValue.delete(),
            categoryAutoRule: nextRule || admin.firestore.FieldValue.delete(),
            vatCodeAuto: nextVat || admin.firestore.FieldValue.delete()
          }, { merge: true });
          touched += 1;
        }
      }
      if (touched > 0) await batch.commit();
      cursor = snap.docs[snap.docs.length - 1];
      if (snap.size < 400) break;
    }
  }

  const bankSaveRule = onCall({ region: REGION, timeoutSeconds: 300 }, async (request) => {
    const { companyId } = await requireOwner(request);
    const keyword = cleanText(request.data?.keyword, 120).toLowerCase();
    const category = cleanText(request.data?.category, 60);
    if (!keyword || keyword.length < 2) throw new HttpsError("invalid-argument", "The rule keyword must be at least 2 characters.");
    if (!category) throw new HttpsError("invalid-argument", "category is required.");
    const vatCode = cleanText(request.data?.vatCode, 4).toUpperCase();
    if (vatCode && !BANK_VAT_CODES.includes(vatCode)) throw new HttpsError("invalid-argument", "Unknown VAT code.");
    const appliesTo = ["out", "in", "both"].includes(cleanText(request.data?.appliesTo, 8)) ? cleanText(request.data?.appliesTo, 8) : "out";
    // One rule per keyword: saving again overwrites the category/VAT/scope.
    const existing = await rulesRef(companyId).where("keyword", "==", keyword).limit(1).get();
    const ruleRef = existing.empty ? rulesRef(companyId).doc() : existing.docs[0].ref;
    await ruleRef.set({
      keyword, category, appliesTo,
      vatCode: vatCode || admin.firestore.FieldValue.delete(),
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    await recomputeAutoCategories(companyId);
    return { ok: true, ruleId: ruleRef.id };
  });

  // ---- Vendors -----------------------------------------------------------
  // Two things the automatic detection cannot know on its own: that several
  // bank names are the same payee (a salary paid from two accounts), and that a
  // payment repeats even though its dates wander (payroll paid when convenient).
  // A vendor doc carries both: the merchant keys that belong together, and the
  // owner's "this repeats, monthly" decision.

  const CADENCES = ["weekly", "monthly", "yearly"];

  const bankSaveVendor = onCall({ region: REGION, timeoutSeconds: 60 }, async (request) => {
    const { companyId } = await requireOwner(request);
    const vendorId = cleanText(request.data?.vendorId, 120);
    const name = cleanText(request.data?.name, 120);
    const cadence = CADENCES.includes(cleanText(request.data?.cadence, 10)) ? cleanText(request.data?.cadence, 10) : "monthly";
    const keys = Array.from(new Set((Array.isArray(request.data?.keys) ? request.data.keys : [])
      .map((key) => cleanText(key, 120).toLowerCase())
      .filter((key) => key.length >= 2))).slice(0, 20);
    if (!keys.length) throw new HttpsError("invalid-argument", "At least one merchant key is required.");

    // A key belongs to one vendor only: pull it out of any other doc first.
    const existing = await vendorsRef(companyId).get();
    for (const doc of existing.docs) {
      if (doc.id === vendorId) continue;
      const current = Array.isArray(doc.get("keys")) ? doc.get("keys") : [];
      const remaining = current.filter((key) => !keys.includes(key));
      if (remaining.length === current.length) continue;
      if (remaining.length) await doc.ref.set({ keys: remaining }, { merge: true });
      else await doc.ref.delete();
    }

    const ref = vendorId ? vendorsRef(companyId).doc(vendorId) : vendorsRef(companyId).doc();
    const previous = vendorId ? (await ref.get()).data() || {} : {};
    const merged = Array.from(new Set([...(Array.isArray(previous.keys) ? previous.keys : []), ...keys])).slice(0, 20);
    await ref.set({
      name: name || previous.name || merged[0],
      keys: merged,
      cadence,
      manual: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: previous.createdAt || admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    return { ok: true, vendorId: ref.id, keys: merged };
  });

  const bankDeleteVendor = onCall({ region: REGION, timeoutSeconds: 60 }, async (request) => {
    const { companyId } = await requireOwner(request);
    const vendorId = cleanText(request.data?.vendorId, 120);
    if (!vendorId) throw new HttpsError("invalid-argument", "vendorId is required.");
    // Dropping a single key leaves the rest of the vendor intact.
    const key = cleanText(request.data?.key, 120).toLowerCase();
    const ref = vendorsRef(companyId).doc(vendorId);
    const doc = await ref.get();
    if (!doc.exists) return { ok: true };
    if (key) {
      const remaining = (Array.isArray(doc.get("keys")) ? doc.get("keys") : []).filter((item) => item !== key);
      if (remaining.length) { await ref.set({ keys: remaining }, { merge: true }); return { ok: true, keys: remaining }; }
    }
    await ref.delete();
    return { ok: true };
  });

  const bankDeleteRule = onCall({ region: REGION, timeoutSeconds: 300 }, async (request) => {
    const { companyId } = await requireOwner(request);
    const ruleId = cleanText(request.data?.ruleId, 120);
    if (!ruleId) throw new HttpsError("invalid-argument", "ruleId is required.");
    await rulesRef(companyId).doc(ruleId).delete();
    await recomputeAutoCategories(companyId);
    return { ok: true };
  });

  // ---- Receipt OCR matching (Google Cloud Vision) --------------------------
  // The owner drops a receipt photo into companies/{id}/bank_receipts/_inbox/;
  // Vision reads the text, we parse total/date/merchant and score the feed for
  // the best matching transactions. Confirming a match moves the file into the
  // transaction's own receipt slot.

  async function visionOcrText(storagePath) {
    const [bytes] = await admin.storage().bucket().file(storagePath).download();
    if (bytes.length > 15 * 1024 * 1024) throw new HttpsError("invalid-argument", "The image is too large for OCR (max 15MB).");
    const { GoogleAuth } = require("google-auth-library");
    const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
    const client = await auth.getClient();
    const response = await client.request({
      url: "https://vision.googleapis.com/v1/images:annotate",
      method: "POST",
      data: {
        requests: [{
          image: { content: bytes.toString("base64") },
          features: [{ type: "TEXT_DETECTION" }]
        }]
      }
    });
    const annotation = response.data?.responses?.[0];
    if (annotation?.error) throw new HttpsError("internal", `OCR failed: ${annotation.error.message || "unknown"}`);
    return String(annotation?.fullTextAnnotation?.text || annotation?.textAnnotations?.[0]?.description || "");
  }

  function parseReceiptText(text) {
    const lower = text.toLowerCase();

    // Amounts: every 12.34-looking number; prefer ones on a line mentioning a
    // total keyword, otherwise fall back to the largest amount on the receipt.
    const totalWords = ["total", "toplam", "amount", "paid", "balance due", "gesamt", "montant", "totale", "importe"];
    const amounts = [];
    for (const line of lower.split(/\n/)) {
      const matches = line.match(/\d{1,6}[.,]\d{2}(?!\d)/g) || [];
      for (const matchText of matches) {
        const value = Number(matchText.replace(",", "."));
        if (Number.isFinite(value) && value > 0 && value < 100000) {
          amounts.push({ value, hasTotalWord: totalWords.some((word) => line.includes(word)) });
        }
      }
    }
    const totalCandidates = amounts.filter((item) => item.hasTotalWord).map((item) => item.value);
    const amount = totalCandidates.length > 0 ? Math.max(...totalCandidates) : (amounts.length > 0 ? Math.max(...amounts.map((item) => item.value)) : 0);

    // Date: dd/mm/yyyy, dd-mm-yy, yyyy-mm-dd, "14 Aug 2026" styles.
    // Invoice numbers like INV-2026-08-4492 look like ISO dates; only accept a
    // match that is not part of a longer digit run and has a real month/day.
    let date = "";
    const valid = (y, m, d) => Number(m) >= 1 && Number(m) <= 12 && Number(d) >= 1 && Number(d) <= 31 ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : "";
    const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const textual = lower.match(new RegExp(`(?<!\\d)(\\d{1,2})\\s*(${monthNames.join("|")})[a-z]*\\.?,?\\s*(20\\d{2})(?!\\d)`));
    const iso = lower.match(/(?<!\d)(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/);
    const dmy = lower.match(/(?<!\d)(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2}|\d{2})(?!\d)/);
    if (textual) date = valid(textual[3], monthNames.indexOf(textual[2]) + 1, textual[1]);
    if (!date && iso) date = valid(iso[1], iso[2], iso[3]);
    if (!date && dmy) date = valid(dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3], dmy[2], dmy[1]);

    // Merchant guess: meaningful words from the first few lines.
    const words = new Set();
    for (const line of text.split(/\n/).slice(0, 6)) {
      for (const word of line.toLowerCase().split(/[^\p{L}]+/u)) {
        if (word.length >= 4) words.add(word);
      }
    }
    return { amount, date, words: Array.from(words).slice(0, 30) };
  }

  // Scores recent spending against a parsed receipt (amount/date/merchant words).
  // Shared by the web OCR flow and the ChatGPT attach_bank_receipt tool.
  async function scoreReceiptCandidates(companyId, parsed) {
    const snap = await transactionsRef(companyId).orderBy("bookingDate", "desc").limit(1500).get();
    const receiptTime = parsed.date ? new Date(parsed.date).getTime() : 0;
    const candidates = [];
    for (const doc of snap.docs) {
      const tx = doc.data() || {};
      if (Number(tx.amount) >= 0) continue;
      let score = 0;
      const spend = Math.abs(Number(tx.amount) || 0);
      if (parsed.amount > 0 && Math.abs(spend - parsed.amount) <= 0.015) score += 60;
      else if (parsed.amount > 0 && Math.abs(spend - parsed.amount) <= parsed.amount * 0.02) score += 30;
      if (receiptTime && tx.bookingDate) {
        const days = Math.abs(new Date(tx.bookingDate).getTime() - receiptTime) / (24 * 60 * 60 * 1000);
        if (days <= 1) score += 25;
        else if (days <= 4) score += 15;
        else if (days <= 10) score += 5;
        else if (score > 0) score -= 10;
      }
      const haystack = `${tx.counterparty || ""} ${tx.description || ""}`.toLowerCase();
      const wordHits = parsed.words.filter((word) => haystack.includes(word)).length;
      score += Math.min(15, wordHits * 5);
      if (tx.receiptPath) score -= 20; // already has a document
      if (score >= 30) {
        candidates.push({
          transactionId: doc.id,
          score,
          amount: Number(tx.amount) || 0,
          currency: cleanText(tx.currency, 8) || "GBP",
          bookingDate: cleanText(tx.bookingDate, 20),
          counterparty: cleanText(tx.counterparty, 160),
          description: cleanText(tx.description, 160),
          hasReceipt: Boolean(tx.receiptPath)
        });
      }
    }
    candidates.sort((a, b) => b.score - a.score);

    return candidates;
  }

  const bankMatchReceipt = onCall({ region: REGION, timeoutSeconds: 120, memory: "512MiB" }, async (request) => {
    const { companyId } = await requireOwner(request);
    const storagePath = cleanText(request.data?.storagePath, 500);
    const inboxPrefix = `companies/${companyId}/bank_receipts/_inbox/`;
    if (!storagePath.startsWith(inboxPrefix)) {
      throw new HttpsError("invalid-argument", "storagePath must be an inbox upload.");
    }

    const text = await visionOcrText(storagePath);
    const parsed = parseReceiptText(text);

    const candidates = await scoreReceiptCandidates(companyId, parsed);
    return {
      parsed: { amount: parsed.amount, date: parsed.date },
      candidates: candidates.slice(0, 5)
    };
  });

  // Confirms an OCR match: moves the inbox file into the transaction's own
  // receipt slot and stamps the doc — same end state as a manual attach.
  const bankAssignInboxReceipt = onCall({ region: REGION, timeoutSeconds: 60 }, async (request) => {
    const { companyId } = await requireOwner(request);
    const storagePath = cleanText(request.data?.storagePath, 500);
    const transactionId = cleanText(request.data?.transactionId, 250);
    const fileName = cleanText(request.data?.fileName, 200) || "receipt.jpg";
    const inboxPrefix = `companies/${companyId}/bank_receipts/_inbox/`;
    if (!storagePath.startsWith(inboxPrefix)) throw new HttpsError("invalid-argument", "storagePath must be an inbox upload.");
    if (!transactionId) throw new HttpsError("invalid-argument", "transactionId is required.");
    await assignInboxReceipt(companyId, storagePath, transactionId, fileName);
    return { ok: true };
  });

  // ---- Waiting receipts -------------------------------------------------
  // A receipt photographed right after paying usually reaches the bank feed
  // 1-3 days later, so "no match" must not mean "throw the file away". The file
  // stays in _inbox with a bankReceiptInbox doc holding what OCR read; every
  // sync that imports rows re-scores the waiting receipts and attaches the
  // ones with a single confident match, then notifies the workspace.

  const WAITING_MATCH_MIN_SCORE = 75;   // amount + date (or amount + merchant words)
  const WAITING_MATCH_MIN_LEAD = 20;    // clear winner over the runner-up

  async function queueInboxReceipt(companyId, { storagePath, fileName, parsed, source }) {
    const inboxPrefix = `companies/${companyId}/bank_receipts/_inbox/`;
    if (!storagePath.startsWith(inboxPrefix)) throw new HttpsError("invalid-argument", "storagePath must be an inbox upload.");
    const existing = await receiptInboxRef(companyId).where("storagePath", "==", storagePath).limit(1).get();
    const ref = existing.empty ? receiptInboxRef(companyId).doc() : existing.docs[0].ref;
    await ref.set({
      storagePath,
      fileName: cleanText(fileName, 200) || "receipt.jpg",
      amount: Number(parsed?.amount) || 0,
      date: cleanText(parsed?.date, 10),
      words: Array.isArray(parsed?.words) ? parsed.words.slice(0, 30).map((word) => cleanText(word, 40)) : [],
      source: cleanText(source, 20) || "web",
      status: "waiting",
      attempts: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastTriedAt: null
    }, { merge: true });
    return ref.id;
  }

  async function matchWaitingReceipts(companyId) {
    const snap = await receiptInboxRef(companyId).where("status", "==", "waiting").limit(50).get();
    if (snap.empty) return 0;
    let matched = 0;
    for (const doc of snap.docs) {
      const data = doc.data() || {};
      const parsed = { amount: Number(data.amount) || 0, date: cleanText(data.date, 10), words: Array.isArray(data.words) ? data.words : [] };
      if (!parsed.amount) { await doc.ref.set({ lastTriedAt: admin.firestore.FieldValue.serverTimestamp(), attempts: admin.firestore.FieldValue.increment(1) }, { merge: true }); continue; }
      const candidates = await scoreReceiptCandidates(companyId, parsed);
      const top = candidates[0];
      const second = candidates[1];
      const confident = top && top.score >= WAITING_MATCH_MIN_SCORE && !top.hasReceipt && (!second || top.score - second.score >= WAITING_MATCH_MIN_LEAD);
      if (!confident) {
        await doc.ref.set({ lastTriedAt: admin.firestore.FieldValue.serverTimestamp(), attempts: admin.firestore.FieldValue.increment(1) }, { merge: true });
        continue;
      }
      try {
        const assigned = await assignInboxReceipt(companyId, data.storagePath, top.transactionId, data.fileName);
        await doc.ref.delete();
        matched += 1;
        if (typeof notifyCompany === "function") {
          const tx = assigned.transaction || {};
          const amount = Math.abs(Number(tx.amount) || 0).toFixed(2);
          await notifyCompany(companyId, {
            id: `bankReceipt_${top.transactionId}`,
            type: "bank_receipt_matched",
            title: "Receipt matched",
            message: `${cleanText(data.fileName, 80)} → ${cleanText(tx.counterparty || tx.description, 80)} · ${cleanText(tx.currency, 8) || "GBP"} ${amount} · ${cleanText(tx.bookingDate, 10)}`,
            route: "bank",
            transactionId: top.transactionId,
            source: "scheduledBankSync"
          });
        }
      } catch (error) {
        console.warn("waiting receipt attach failed:", doc.id, error?.message || error);
      }
    }
    return matched;
  }

  // Web: keep an OCR'd upload waiting for the bank instead of discarding it.
  const bankQueueInboxReceipt = onCall({ region: REGION, timeoutSeconds: 60 }, async (request) => {
    const { companyId } = await requireOwner(request);
    const storagePath = cleanText(request.data?.storagePath, 500);
    const fileName = cleanText(request.data?.fileName, 200) || "receipt.jpg";
    const parsed = {
      amount: Number(request.data?.amount) || 0,
      date: cleanText(request.data?.date, 10),
      words: Array.isArray(request.data?.words) ? request.data.words : []
    };
    const id = await queueInboxReceipt(companyId, { storagePath, fileName, parsed, source: "web" });
    return { ok: true, id };
  });

  // Web: try to match the waiting receipts right now (after a manual sync,
  // or when the owner knows the payment has landed).
  const bankMatchWaitingReceipts = onCall({ region: REGION, timeoutSeconds: 120 }, async (request) => {
    const { companyId } = await requireOwner(request);
    const matched = await matchWaitingReceipts(companyId);
    return { ok: true, matched };
  });

  // Web: drop a waiting receipt (file + doc).
  const bankDeleteInboxReceipt = onCall({ region: REGION, timeoutSeconds: 60 }, async (request) => {
    const { companyId } = await requireOwner(request);
    const id = cleanText(request.data?.id, 120);
    if (!id) throw new HttpsError("invalid-argument", "id is required.");
    const ref = receiptInboxRef(companyId).doc(id);
    const doc = await ref.get();
    if (!doc.exists) return { ok: true };
    const storagePath = cleanText(doc.get("storagePath"), 500);
    if (storagePath) { try { await admin.storage().bucket().file(storagePath).delete(); } catch { /* already gone */ } }
    await ref.delete();
    return { ok: true };
  });

  // Moves an inbox upload into the transaction's receipt slot and stamps the doc.
  async function assignInboxReceipt(companyId, storagePath, transactionId, fileName) {
    const txRef = transactionsRef(companyId).doc(transactionId);
    const txDoc = await txRef.get();
    if (!txDoc.exists) throw new HttpsError("not-found", "Transaction not found.");

    const safeName = (cleanText(fileName, 200) || "receipt.jpg").replace(/[^A-Za-z0-9._-]/g, "_");
    const destination = `companies/${companyId}/bank_receipts/${transactionId}/${Date.now()}_${safeName}`;
    await admin.storage().bucket().file(storagePath).move(destination);

    const previousPath = cleanText((txDoc.data() || {}).receiptPath, 500);
    await txRef.set({ receiptPath: destination, receiptName: safeName }, { merge: true });
    try {
      const queued = await receiptInboxRef(companyId).where("storagePath", "==", storagePath).limit(1).get();
      for (const queuedDoc of queued.docs) await queuedDoc.ref.delete();
    } catch (error) {
      console.warn("receipt inbox cleanup failed:", error?.message || error);
    }
    if (previousPath) {
      try { await admin.storage().bucket().file(previousPath).delete(); } catch { /* already gone */ }
    }
    return { transactionId, receiptPath: destination, receiptName: safeName, transaction: txDoc.data() || {} };
  }

  return {
    bankCreateRequisition,
    bankFinalizeRequisition,
    bankSyncTransactions,
    bankDeleteConnection,
    bankListAuditLog,
    bankSetTransactionReceipt,
    bankLinkTransactionToOrder,
    bankSetTransactionSplits,
    bankMatchIncomingToOrder,
    bankSetTransactionCategory,
    bankSetTransactionCategoryBulk,
    bankSetTransactionVatBulk,
    bankSetReviewStatusBulk,
    bankSaveCategory,
    bankDeleteCategory,
    bankUpdateTransaction,
    bankSaveRule,
    bankDeleteRule,
    bankSaveVendor,
    bankDeleteVendor,
    bankMatchReceipt,
    bankAssignInboxReceipt,
    bankQueueInboxReceipt,
    bankMatchWaitingReceipts,
    bankDeleteInboxReceipt,
    scheduledBankSync,
    _internal: { visionOcrText, parseReceiptText, scoreReceiptCandidates, assignInboxReceipt, queueInboxReceipt, matchWaitingReceipts, normalizeTransaction, transactionDocId, reconcilePendingToBooked }
  };
}

module.exports = { createBankFeedFunctions, BANK_VAT_CODES, BANK_REVIEW_STATUSES };
