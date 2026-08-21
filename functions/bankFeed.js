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
//     accountId, connectionId, amount (Number, signed), currency, bookingDate,
//     description, counterparty, status, importedAt — owner-readable.
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

function createBankFeedFunctions({ admin, onCall, onSchedule, HttpsError, uidIsCompanyOwner }) {
  const db = () => admin.firestore();

  const connectionsRef = (companyId) =>
    db().collection("companies").doc(companyId).collection("bankConnections");
  const tokensRef = (companyId) =>
    db().collection("companies").doc(companyId).collection("bankTokens");
  const transactionsRef = (companyId) =>
    db().collection("companies").doc(companyId).collection("bankTransactions");
  const rulesRef = (companyId) =>
    db().collection("companies").doc(companyId).collection("bankRules");

  // Categorisation rules: "if the counterparty/description contains <keyword>,
  // auto-categorise as <category>". Auto results live in `categoryAuto`; a
  // manual choice lives in `category` and always wins on the client, so a
  // re-sync can safely recompute categoryAuto without touching manual picks.
  async function loadRules(companyId) {
    const snap = await rulesRef(companyId).limit(200).get();
    return snap.docs.map((doc) => ({
      id: doc.id,
      keyword: String((doc.data() || {}).keyword || "").toLowerCase(),
      category: String((doc.data() || {}).category || "")
    })).filter((rule) => rule.keyword && rule.category);
  }

  function matchRule(rules, tx) {
    const haystack = `${tx.counterparty || ""} ${tx.description || ""}`.toLowerCase();
    const hit = rules.find((rule) => haystack.includes(rule.keyword));
    return hit ? hit.category : "";
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
      throw new HttpsError("internal", `Bank data auth failed: ${detail}`);
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
      importedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    const auto = matchRule(rules, normalized);
    if (auto) normalized.categoryAuto = cleanText(auto, 60);
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

  async function syncAccountTransactions(companyId, connectionId, accountId, accessToken, rules = []) {
    // Without an explicit range TrueLayer returns only ~3 months; ask for two
    // years so the Year view can walk back. Providers cap this at whatever
    // history the bank exposes — anything extra is simply not returned.
    const to = new Date();
    const from = new Date(to.getFullYear() - 2, to.getMonth(), to.getDate());
    const range = `from=${from.toISOString().slice(0, 10)}&to=${to.toISOString().slice(0, 10)}`;
    const payload = await tlData(accessToken, `/data/v1/accounts/${accountId}/transactions?${range}`);
    const booked = Array.isArray(payload?.results) ? payload.results : [];
    let pending = [];
    try {
      const pendingPayload = await tlData(accessToken, `/data/v1/accounts/${accountId}/transactions/pending`);
      pending = Array.isArray(pendingPayload?.results) ? pendingPayload.results : [];
    } catch { /* not all providers expose pending transactions */ }

    const writes = [];
    for (const tx of booked) writes.push({ id: transactionDocId(accountId, tx), data: normalizeTransaction(accountId, connectionId, tx, "booked", rules) });
    for (const tx of pending) writes.push({ id: transactionDocId(accountId, tx), data: normalizeTransaction(accountId, connectionId, tx, "pending", rules) });

    for (let i = 0; i < writes.length; i += 450) {
      const batch = db().batch();
      for (const { id, data } of writes.slice(i, i + 450)) {
        batch.set(transactionsRef(companyId).doc(id), data, { merge: true });
      }
      await batch.commit();
    }
    return writes.length;
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
        imported += await syncAccountTransactions(companyId, state, account.id, token.access_token, rules);
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
      lastSyncedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // Registers the workspace for the scheduled background sync.
    await db().collection("companies").doc(companyId).set({ bankFeedEnabled: true }, { merge: true });

    return { status: "linked", accounts, imported };
  });

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
      try {
        const accessToken = await accessTokenForConnection(companyId, doc.id);
        const accounts = Array.isArray(data.accounts) ? data.accounts : [];
        for (const account of accounts) {
          try {
            imported += await syncAccountTransactions(companyId, doc.id, account.id, accessToken, rules);
            ok = true;
          } catch (error) {
            console.warn("bank sync account failed:", account.id, error?.message || error);
            if (error?.tlStatus === 429) skipped += 1;
          }
        }
      } catch (error) {
        console.warn("bank sync connection failed:", doc.id, error?.message || error);
      }
      if (ok) {
        synced += 1;
        await doc.ref.set({ lastSyncedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
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

  const bankDeleteConnection = onCall({ region: REGION, secrets: [TL_CLIENT_ID, TL_CLIENT_SECRET], timeoutSeconds: 180 }, async (request) => {
    const { companyId } = await requireOwner(request);
    const connectionId = cleanText(request.data?.requisitionId, 120);
    if (!connectionId) throw new HttpsError("invalid-argument", "requisitionId is required.");
    const connectionDoc = await connectionsRef(companyId).doc(connectionId).get();
    if (!connectionDoc.exists) throw new HttpsError("not-found", "Bank connection not found.");

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

    return { deleted: true };
  });

  // Records (or clears) the receipt/invoice attached to a transaction. The
  // file itself is uploaded by the owner's client straight to Storage under
  // companies/{companyId}/bank_receipts/{transactionId}/ — this callable only
  // validates and stamps the transaction doc, and deletes the object on clear.
  const bankSetTransactionReceipt = onCall({ region: REGION, timeoutSeconds: 60 }, async (request) => {
    const { companyId } = await requireOwner(request);
    const transactionId = cleanText(request.data?.transactionId, 250);
    if (!transactionId) throw new HttpsError("invalid-argument", "transactionId is required.");
    const txRef = transactionsRef(companyId).doc(transactionId);
    const txDoc = await txRef.get();
    if (!txDoc.exists) throw new HttpsError("not-found", "Transaction not found.");

    const storagePath = cleanText(request.data?.storagePath, 500);
    const fileName = cleanText(request.data?.fileName, 200);
    const previousPath = cleanText((txDoc.data() || {}).receiptPath, 500);

    if (storagePath) {
      const expectedPrefix = `companies/${companyId}/bank_receipts/${transactionId}/`;
      if (!storagePath.startsWith(expectedPrefix)) {
        throw new HttpsError("invalid-argument", "storagePath does not belong to this transaction.");
      }
      await txRef.set({ receiptPath: storagePath, receiptName: fileName || storagePath.split("/").pop() || "receipt" }, { merge: true });
    } else {
      await txRef.set({ receiptPath: "", receiptName: "" }, { merge: true });
    }

    // Best-effort cleanup of a replaced/removed file.
    if (previousPath && previousPath !== storagePath) {
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
        const auto = matchRule(rules, data);
        const currentAuto = cleanText(data.categoryAuto, 60);
        if (auto !== currentAuto) {
          batch.set(doc.ref, { categoryAuto: auto || admin.firestore.FieldValue.delete() }, { merge: true });
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
    // One rule per keyword: saving again overwrites the category.
    const existing = await rulesRef(companyId).where("keyword", "==", keyword).limit(1).get();
    const ruleRef = existing.empty ? rulesRef(companyId).doc() : existing.docs[0].ref;
    await ruleRef.set({ keyword, category, createdAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    await recomputeAutoCategories(companyId);
    return { ok: true, ruleId: ruleRef.id };
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
    let date = "";
    const iso = lower.match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/);
    const dmy = lower.match(/(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2}|\d{2})(?!\d)/);
    const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const textual = lower.match(new RegExp(`(\\d{1,2})\\s*(${monthNames.join("|")})[a-z]*\\s*(20\\d{2})`));
    if (iso) date = `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
    else if (textual) date = `${textual[3]}-${String(monthNames.indexOf(textual[2]) + 1).padStart(2, "0")}-${textual[1].padStart(2, "0")}`;
    else if (dmy) {
      const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
      date = `${year}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
    }

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
    bankSetTransactionReceipt,
    bankLinkTransactionToOrder,
    bankSetTransactionCategory,
    bankSaveRule,
    bankDeleteRule,
    bankMatchReceipt,
    bankAssignInboxReceipt,
    scheduledBankSync,
    _internal: { visionOcrText, parseReceiptText, scoreReceiptCandidates, assignInboxReceipt }
  };
}

module.exports = { createBankFeedFunctions };
