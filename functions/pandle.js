"use strict";

// Pandle (UK bookkeeping) bridge.
//
// NivaDesk already pulls the owner's bank feed (TrueLayer) and lets them
// categorise each payment. Pandle pulls the same bank through Plaid and parks
// every transaction in its "Check" queue until someone picks a category and a
// tax code. This module pushes the NivaDesk decision into Pandle instead of
// the owner doing it twice: it matches the two feeds by date + amount, then
// confirms each Pandle imported transaction with the mapped nominal account
// and tax code via Pandle's public API (https://my.pandle.com/api/docs/v1).
//
// Auth: OAuth2 authorization-code (app id/secret issued by Pandle support).
// Tokens are server-only. Read + confirm on the connected user's own company
// only — nothing here can move money.
//
// Data model (all server-written):
//   companies/{companyId}/pandleConnection/main            owner-readable
//     status (pending|linked|none), state, pandleCompanyId, pandleCompanyName,
//     bankAccountId, bankAccountName,
//     bankAccounts   [{id, name, code, currency}],
//     categories     [{id, code, name}]        (Pandle nominal accounts)
//     taxCodes       [{id, code, name, rate}]  (rate as a fraction, 0.2)
//     mappings       [{category, nominalCode, taxCode}]  NivaDesk → Pandle
//     linkedAt, lastMetaAt, lastPushAt, lastPushCount
//   companies/{companyId}/pandleTokens/main                 no client access
//     accessToken, refreshToken, expiresAt (ms epoch)
//   companies/{companyId}/bankTransactions/{id}.pandle     nested object
//     {status: "confirmed", importedId, bankTransactionId, nominalCode,
//      taxCode, pushedAt}
//
// Secrets: NIVADESK_PANDLE_CLIENT_ID / NIVADESK_PANDLE_CLIENT_SECRET.

const crypto = require("node:crypto");
const { defineSecret } = require("firebase-functions/params");

const PANDLE_CLIENT_ID = defineSecret("NIVADESK_PANDLE_CLIENT_ID");
const PANDLE_CLIENT_SECRET = defineSecret("NIVADESK_PANDLE_CLIENT_SECRET");

const PANDLE_BASE = "https://my.pandle.com";
const PANDLE_API = `${PANDLE_BASE}/api/v1`;
const REDIRECT_URL = "https://nivadesk.app/pandle/callback";
const REGION = "europe-west2";
const PAGE_SIZE = 100;
const MAX_PAGES = 30; // 3000 unconfirmed rows is far beyond any realistic queue
const MATCH_DAY_TOLERANCE = 2; // Plaid vs TrueLayer booking dates can drift a day or two

// NivaDesk preset categories → Pandle's default UK chart of accounts.
// Codes (not ids) so the mapping can be saved before Pandle is connected;
// ids are resolved against the cached category list at push time.
const DEFAULT_MAPPINGS = [
  { category: "Materials", nominalCode: "500", taxCode: "ST" },
  { category: "Equipment", nominalCode: "000", taxCode: "ST" },
  { category: "Shipping", nominalCode: "685", taxCode: "ST" },
  { category: "Software", nominalCode: "710", taxCode: "ST" },
  { category: "Subscriptions", nominalCode: "695", taxCode: "ST" },
  { category: "Fees", nominalCode: "700", taxCode: "NV" },
  { category: "Marketing", nominalCode: "725", taxCode: "ST" },
  { category: "Travel", nominalCode: "615", taxCode: "ST" },
  { category: "Utilities", nominalCode: "680", taxCode: "ST" },
  { category: "Rent", nominalCode: "645", taxCode: "EX" },
  { category: "Staff", nominalCode: "520", taxCode: "NV" },
  { category: "Tax", nominalCode: "730", taxCode: "NV" },
  { category: "Other", nominalCode: "735", taxCode: "ST" }
];

function createPandleFunctions({ admin, onCall, HttpsError, uidIsCompanyOwner }) {
  const db = () => admin.firestore();
  const connectionRef = (companyId) =>
    db().collection("companies").doc(companyId).collection("pandleConnection").doc("main");
  const tokensRef = (companyId) =>
    db().collection("companies").doc(companyId).collection("pandleTokens").doc("main");
  const transactionsRef = (companyId) =>
    db().collection("companies").doc(companyId).collection("bankTransactions");

  const cleanText = (value, max = 300) => String(value || "").trim().slice(0, max);
  const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

  async function requireOwner(request) {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "You must be signed in.");
    const companyId = cleanText(request.data?.companyId, 120);
    if (!companyId) throw new HttpsError("invalid-argument", "companyId is required.");
    const snap = await db().collection("companies").doc(companyId).get();
    if (!snap.exists) throw new HttpsError("not-found", "Workspace not found.");
    if (!uidIsCompanyOwner(snap.data() || {}, uid)) {
      throw new HttpsError("permission-denied", "The Pandle connection is managed by the workspace owner.");
    }
    return { uid, companyId };
  }

  function credentials() {
    const clientId = PANDLE_CLIENT_ID.value().trim();
    const clientSecret = PANDLE_CLIENT_SECRET.value().trim();
    if (!clientId || !clientSecret) {
      throw new HttpsError("failed-precondition", "Pandle is not configured yet — the app credentials are missing.");
    }
    return { clientId, clientSecret };
  }

  // ---- OAuth ----------------------------------------------------------------

  async function oauthToken(form) {
    const res = await fetch(`${PANDLE_BASE}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams(form).toString()
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.access_token) {
      const detail = json?.error_description || json?.error || `HTTP ${res.status}`;
      throw new HttpsError("internal", `Pandle sign-in failed: ${detail}`);
    }
    return json;
  }

  async function storeTokens(companyId, json) {
    const expiresIn = Number(json.expires_in) || 7200;
    await tokensRef(companyId).set({
      accessToken: cleanText(json.access_token, 4000),
      refreshToken: cleanText(json.refresh_token, 4000),
      expiresAt: Date.now() + expiresIn * 1000,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  async function accessToken(companyId) {
    const doc = await tokensRef(companyId).get();
    const data = doc.data() || {};
    if (!data.accessToken) throw new HttpsError("failed-precondition", "Pandle is not connected — connect it first.");
    if (Number(data.expiresAt) - Date.now() > 60 * 1000) return data.accessToken;
    if (!data.refreshToken) throw new HttpsError("failed-precondition", "The Pandle session expired — reconnect Pandle.");
    const { clientId, clientSecret } = credentials();
    const json = await oauthToken({
      grant_type: "refresh_token",
      refresh_token: data.refreshToken,
      client_id: clientId,
      client_secret: clientSecret
    });
    await storeTokens(companyId, json);
    return json.access_token;
  }

  // ---- API helpers ----------------------------------------------------------

  function apiErrorMessage(json, status) {
    const first = Array.isArray(json?.errors) ? json.errors[0] : null;
    if (first) return cleanText(first.detail || first.title || JSON.stringify(first), 300);
    if (json?.error) return cleanText(json.error_description || json.error, 300);
    return `HTTP ${status}`;
  }

  async function api(companyId, method, path, body) {
    const token = await accessToken(companyId);
    const res = await fetch(`${PANDLE_API}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const code = res.status === 401 ? "unauthenticated"
        : res.status === 404 ? "not-found"
          : res.status === 422 ? "invalid-argument"
            : res.status === 429 ? "resource-exhausted" : "internal";
      throw new HttpsError(code, `Pandle: ${apiErrorMessage(json, res.status)}`);
    }
    return json;
  }

  // JSON:API → {id, ...attributes (dashes kept), rel: {name: {type,id}}}
  function flatten(item) {
    if (!item || typeof item !== "object") return null;
    const out = { id: String(item.id ?? ""), type: String(item.type || "") };
    Object.assign(out, item.attributes || {});
    out.rel = {};
    for (const [name, value] of Object.entries(item.relationships || {})) {
      const data = value && value.data;
      if (data && !Array.isArray(data)) out.rel[name] = { type: String(data.type || ""), id: String(data.id ?? "") };
    }
    return out;
  }

  const listOf = (json) => (Array.isArray(json?.data) ? json.data.map(flatten).filter(Boolean) : []);
  const attr = (row, ...names) => {
    for (const name of names) if (row && row[name] !== undefined && row[name] !== null) return row[name];
    return undefined;
  };

  async function listAll(companyId, basePath) {
    const rows = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const sep = basePath.includes("?") ? "&" : "?";
      const json = await api(companyId, "GET", `${basePath}${sep}page=${page}&size=${PAGE_SIZE}`);
      const chunk = listOf(json);
      rows.push(...chunk);
      if (chunk.length < PAGE_SIZE) break;
    }
    return rows;
  }

  // ---- Pandle metadata (company, accounts, categories, tax codes) ----------

  async function fetchCompanies(companyId) {
    const rows = await listAll(companyId, "/companies");
    return rows.map((row) => ({
      id: row.id,
      name: cleanText(attr(row, "company-name", "name"), 160)
    })).filter((row) => row.id);
  }

  async function fetchMeta(companyId, pandleCompanyId) {
    const [accountRows, categoryRows, taxRows] = await Promise.all([
      listAll(companyId, `/companies/${pandleCompanyId}/bank_accounts`),
      listAll(companyId, `/companies/${pandleCompanyId}/bank_transaction_categories`),
      listAll(companyId, `/companies/${pandleCompanyId}/tax_codes`)
    ]);
    const bankAccounts = accountRows.map((row) => ({
      id: row.id,
      name: cleanText(attr(row, "name"), 120),
      code: cleanText(attr(row, "nominal-code", "nominal_code"), 12),
      currency: cleanText(attr(row, "currency")?.code || attr(row, "currency-code") || "", 8),
      outstanding: Number(attr(row, "outstanding-imported-bank-transaction-count")) || 0
    })).filter((row) => row.id);
    const categories = categoryRows.map((row) => ({
      id: row.id,
      code: cleanText(attr(row, "nominal-code", "nominal_code", "code"), 12),
      name: cleanText(attr(row, "name"), 120)
    })).filter((row) => row.id && row.code).sort((a, b) => a.code.localeCompare(b.code));
    const taxCodes = taxRows.map((row) => {
      const rawRate = Number(attr(row, "tax-rate", "tax_rate")) || 0;
      return {
        id: row.id,
        code: cleanText(attr(row, "taxcode", "code"), 12).toUpperCase(),
        name: cleanText(attr(row, "description", "name"), 120),
        rate: rawRate > 1 ? rawRate / 100 : rawRate
      };
    }).filter((row) => row.id && row.code);
    return { bankAccounts, categories, taxCodes };
  }

  // ---- Mapping --------------------------------------------------------------

  function normalizeMappings(value) {
    const seen = new Set();
    const out = [];
    for (const item of Array.isArray(value) ? value : []) {
      const category = cleanText(item?.category, 60);
      const nominalCode = cleanText(item?.nominalCode, 12);
      const taxCode = cleanText(item?.taxCode, 12).toUpperCase();
      if (!category || seen.has(category)) continue;
      seen.add(category);
      out.push({ category, nominalCode, taxCode });
      if (out.length >= 200) break;
    }
    return out;
  }

  function resolveMapping(connection, category) {
    const mappings = Array.isArray(connection.mappings) && connection.mappings.length ? connection.mappings : DEFAULT_MAPPINGS;
    const mapping = mappings.find((item) => item.category === category);
    if (!mapping || !mapping.nominalCode) return { error: "unmapped" };
    const nominal = (connection.categories || []).find((item) => item.code === mapping.nominalCode);
    const tax = (connection.taxCodes || []).find((item) => item.code === mapping.taxCode);
    if (!nominal) return { error: "nominal-missing", mapping };
    if (!tax) return { error: "tax-missing", mapping };
    return { mapping, nominal, tax };
  }

  // ---- Matching -------------------------------------------------------------

  const dayNumber = (iso) => {
    const ms = Date.parse(`${String(iso || "").slice(0, 10)}T00:00:00Z`);
    return Number.isFinite(ms) ? Math.round(ms / 86400000) : null;
  };
  const words = (text) => new Set(String(text || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3));

  function normalizeImported(row) {
    const moneyOut = Number(attr(row, "money-out", "money_out")) || 0;
    const moneyIn = Number(attr(row, "money-in", "money_in")) || 0;
    return {
      id: row.id,
      date: cleanText(attr(row, "date"), 10),
      description: cleanText(attr(row, "description"), 300),
      payee: cleanText(attr(row, "payee"), 160),
      moneyOut: round2(moneyOut),
      moneyIn: round2(moneyIn),
      ignored: Boolean(attr(row, "is-ignored", "is_ignored")),
      currencyId: cleanText(attr(row, "currency-id", "currency_id"), 20) || (row.rel?.currency?.id || "")
    };
  }

  // Greedy one-to-one assignment, best score first. Amount must match to the
  // penny and direction must agree; the date may drift a couple of days.
  function matchFeeds(nivaRows, pandleRows) {
    const candidates = [];
    for (const niva of nivaRows) {
      const nivaAbs = round2(Math.abs(niva.amount));
      const nivaDay = dayNumber(niva.bookingDate);
      if (!nivaAbs || nivaDay === null) continue;
      const nivaWords = words(`${niva.counterparty} ${niva.description}`);
      for (const pandle of pandleRows) {
        if (pandle.ignored) continue;
        const pandleAbs = niva.amount < 0 ? pandle.moneyOut : pandle.moneyIn;
        if (round2(pandleAbs) !== nivaAbs) continue;
        const pandleDay = dayNumber(pandle.date);
        if (pandleDay === null) continue;
        const drift = Math.abs(pandleDay - nivaDay);
        if (drift > MATCH_DAY_TOLERANCE) continue;
        let overlap = 0;
        for (const word of words(`${pandle.payee} ${pandle.description}`)) if (nivaWords.has(word)) overlap += 1;
        const score = 100 - drift * 20 + Math.min(overlap, 3) * 5;
        candidates.push({ niva, pandle, score, drift });
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    const usedNiva = new Set();
    const usedPandle = new Set();
    const matches = [];
    for (const candidate of candidates) {
      if (usedNiva.has(candidate.niva.id) || usedPandle.has(candidate.pandle.id)) continue;
      usedNiva.add(candidate.niva.id);
      usedPandle.add(candidate.pandle.id);
      matches.push(candidate);
    }
    return { matches, usedNiva, usedPandle };
  }

  async function loadConnection(companyId, { requireLinked = true } = {}) {
    const doc = await connectionRef(companyId).get();
    const data = doc.data() || {};
    if (requireLinked && (data.status !== "linked" || !data.pandleCompanyId)) {
      throw new HttpsError("failed-precondition", "Pandle is not connected — connect it first.");
    }
    return data;
  }

  // ---- Callables ------------------------------------------------------------

  const pandleConnectStart = onCall({ region: REGION, secrets: [PANDLE_CLIENT_ID, PANDLE_CLIENT_SECRET] }, async (request) => {
    const { uid, companyId } = await requireOwner(request);
    const { clientId } = credentials();
    const state = crypto.randomUUID();
    await connectionRef(companyId).set({
      status: "pending",
      state,
      createdByUid: uid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: REDIRECT_URL,
      response_type: "code",
      state
    });
    return { link: `${PANDLE_BASE}/oauth/authorize?${params.toString()}` };
  });

  const pandleConnectFinish = onCall({ region: REGION, secrets: [PANDLE_CLIENT_ID, PANDLE_CLIENT_SECRET], timeoutSeconds: 120 }, async (request) => {
    const { companyId } = await requireOwner(request);
    const code = cleanText(request.data?.code, 2000);
    const state = cleanText(request.data?.state, 120);
    if (!code || !state) throw new HttpsError("invalid-argument", "code and state are required.");
    const existing = await loadConnection(companyId, { requireLinked: false });
    if (existing.status === "linked") return { status: "linked" };
    if (!existing.state || existing.state !== state) {
      throw new HttpsError("failed-precondition", "This Pandle sign-in link is stale — start again from the Bank page.");
    }
    const { clientId, clientSecret } = credentials();
    const token = await oauthToken({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URL
    });
    await storeTokens(companyId, token);

    const companies = await fetchCompanies(companyId);
    if (!companies.length) throw new HttpsError("failed-precondition", "This Pandle user has no company to connect.");
    // Prefer a company already chosen (reconnect), else the first one.
    const chosen = companies.find((item) => item.id === existing.pandleCompanyId) || companies[0];
    const meta = await fetchMeta(companyId, chosen.id);
    // Keep a previously chosen bank account if it still exists; otherwise pick
    // the account with the biggest unconfirmed queue (that's the one to clear).
    const keep = meta.bankAccounts.find((item) => item.id === existing.bankAccountId);
    const busiest = [...meta.bankAccounts].sort((a, b) => b.outstanding - a.outstanding)[0];
    const account = keep || busiest || null;

    await connectionRef(companyId).set({
      status: "linked",
      state: admin.firestore.FieldValue.delete(),
      pandleCompanyId: chosen.id,
      pandleCompanyName: chosen.name,
      pandleCompanies: companies,
      bankAccountId: account ? account.id : "",
      bankAccountName: account ? account.name : "",
      bankAccounts: meta.bankAccounts,
      categories: meta.categories,
      taxCodes: meta.taxCodes,
      mappings: Array.isArray(existing.mappings) && existing.mappings.length ? existing.mappings : DEFAULT_MAPPINGS,
      linkedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastMetaAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    return { status: "linked", company: chosen.name, bankAccount: account ? account.name : "" };
  });

  const pandleDisconnect = onCall({ region: REGION, timeoutSeconds: 60 }, async (request) => {
    const { companyId } = await requireOwner(request);
    await tokensRef(companyId).delete().catch(() => null);
    await connectionRef(companyId).set({
      status: "none",
      state: admin.firestore.FieldValue.delete(),
      pandleCompanyId: admin.firestore.FieldValue.delete(),
      pandleCompanyName: admin.firestore.FieldValue.delete(),
      pandleCompanies: admin.firestore.FieldValue.delete(),
      bankAccounts: [],
      categories: [],
      taxCodes: [],
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    return { ok: true };
  });

  const pandleRefreshMeta = onCall({ region: REGION, secrets: [PANDLE_CLIENT_ID, PANDLE_CLIENT_SECRET], timeoutSeconds: 120 }, async (request) => {
    const { companyId } = await requireOwner(request);
    const connection = await loadConnection(companyId);
    const meta = await fetchMeta(companyId, connection.pandleCompanyId);
    const account = meta.bankAccounts.find((item) => item.id === connection.bankAccountId) || null;
    await connectionRef(companyId).set({
      bankAccounts: meta.bankAccounts,
      categories: meta.categories,
      taxCodes: meta.taxCodes,
      bankAccountId: account ? account.id : "",
      bankAccountName: account ? account.name : "",
      lastMetaAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    return { accounts: meta.bankAccounts.length, categories: meta.categories.length, taxCodes: meta.taxCodes.length };
  });

  const pandleSelectBankAccount = onCall({ region: REGION, timeoutSeconds: 60 }, async (request) => {
    const { companyId } = await requireOwner(request);
    const connection = await loadConnection(companyId);
    const bankAccountId = cleanText(request.data?.bankAccountId, 40);
    const account = (connection.bankAccounts || []).find((item) => item.id === bankAccountId);
    if (!account) throw new HttpsError("not-found", "That Pandle bank account was not found — refresh the Pandle data.");
    await connectionRef(companyId).set({
      bankAccountId: account.id,
      bankAccountName: account.name,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    return { ok: true };
  });

  // Mapping can be edited before Pandle is connected (codes are Pandle's
  // standard chart), so this only needs the doc to exist.
  const pandleSaveMappings = onCall({ region: REGION, timeoutSeconds: 60 }, async (request) => {
    const { companyId } = await requireOwner(request);
    const mappings = normalizeMappings(request.data?.mappings);
    if (!mappings.length) throw new HttpsError("invalid-argument", "mappings is required.");
    const doc = await connectionRef(companyId).get();
    await connectionRef(companyId).set({
      status: doc.exists ? (doc.data() || {}).status || "none" : "none",
      mappings,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    return { ok: true, count: mappings.length };
  });

  // Dry run: which NivaDesk-categorised transactions line up with Pandle's
  // unconfirmed queue, and what each would be confirmed as.
  const pandlePreview = onCall({ region: REGION, secrets: [PANDLE_CLIENT_ID, PANDLE_CLIENT_SECRET], timeoutSeconds: 300, memory: "512MiB" }, async (request) => {
    const { companyId } = await requireOwner(request);
    const connection = await loadConnection(companyId);
    if (!connection.bankAccountId) throw new HttpsError("failed-precondition", "Choose the Pandle bank account first.");

    const pandleRows = (await listAll(companyId, `/companies/${connection.pandleCompanyId}/bank_accounts/${connection.bankAccountId}/imported_bank_transactions`))
      .map(normalizeImported);

    const snap = await transactionsRef(companyId).orderBy("bookingDate", "desc").limit(3000).get();
    const nivaRows = snap.docs.map((doc) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        amount: Number(data.amount) || 0,
        currency: cleanText(data.currency, 8),
        bookingDate: cleanText(data.bookingDate, 10),
        description: cleanText(data.description, 300),
        counterparty: cleanText(data.counterparty, 160),
        category: cleanText(data.category, 60) || cleanText(data.categoryAuto, 60),
        hasReceipt: Boolean(data.receiptPath),
        linkedOrderLabel: cleanText(data.linkedOrderLabel, 120),
        pandleStatus: cleanText(data.pandle?.status, 20)
      };
    }).filter((row) => row.pandleStatus !== "confirmed");

    const { matches } = matchFeeds(nivaRows, pandleRows);
    const items = matches.map(({ niva, pandle, score, drift }) => {
      const resolved = niva.category ? resolveMapping(connection, niva.category) : { error: "uncategorised" };
      return {
        transactionId: niva.id,
        importedId: pandle.id,
        bookingDate: niva.bookingDate,
        pandleDate: pandle.date,
        dateDrift: drift,
        amount: niva.amount,
        currency: niva.currency,
        counterparty: niva.counterparty,
        description: niva.description,
        pandleDescription: pandle.payee || pandle.description,
        category: niva.category,
        hasReceipt: niva.hasReceipt,
        linkedOrderLabel: niva.linkedOrderLabel,
        score,
        ready: !resolved.error,
        problem: resolved.error || "",
        nominalCode: resolved.nominal ? resolved.nominal.code : (resolved.mapping?.nominalCode || ""),
        nominalName: resolved.nominal ? resolved.nominal.name : "",
        taxCode: resolved.tax ? resolved.tax.code : (resolved.mapping?.taxCode || "")
      };
    }).sort((a, b) => (b.bookingDate > a.bookingDate ? 1 : b.bookingDate < a.bookingDate ? -1 : 0));

    return {
      pandleQueue: pandleRows.filter((row) => !row.ignored).length,
      nivaCandidates: nivaRows.length,
      matched: items.length,
      ready: items.filter((item) => item.ready).length,
      items
    };
  });

  // Confirms the chosen matches in Pandle. Each item is re-validated against
  // the live mapping; a failure on one row does not stop the others.
  const pandlePush = onCall({ region: REGION, secrets: [PANDLE_CLIENT_ID, PANDLE_CLIENT_SECRET], timeoutSeconds: 540, memory: "512MiB" }, async (request) => {
    const { companyId } = await requireOwner(request);
    const connection = await loadConnection(companyId);
    if (!connection.bankAccountId) throw new HttpsError("failed-precondition", "Choose the Pandle bank account first.");
    const items = (Array.isArray(request.data?.items) ? request.data.items : [])
      .map((item) => ({ transactionId: cleanText(item?.transactionId, 260), importedId: cleanText(item?.importedId, 40) }))
      .filter((item) => item.transactionId && item.importedId)
      .slice(0, 200);
    if (!items.length) throw new HttpsError("invalid-argument", "items is required.");

    const base = `/companies/${connection.pandleCompanyId}/bank_accounts/${connection.bankAccountId}/imported_bank_transactions`;
    const results = [];
    for (const item of items) {
      const txDoc = await transactionsRef(companyId).doc(item.transactionId).get();
      const tx = txDoc.data();
      if (!tx) { results.push({ ...item, ok: false, error: "Transaction not found." }); continue; }
      if (tx.pandle?.status === "confirmed") { results.push({ ...item, ok: true, skipped: true }); continue; }
      const category = cleanText(tx.category, 60) || cleanText(tx.categoryAuto, 60);
      const resolved = category ? resolveMapping(connection, category) : { error: "uncategorised" };
      if (resolved.error) { results.push({ ...item, ok: false, error: `Category "${category || "—"}" is not mapped to a Pandle category.` }); continue; }

      // Re-read the Pandle row so the amount and direction come from Pandle
      // itself, never from our side of the match.
      let imported;
      try {
        const json = await api(companyId, "GET", `${base}/${item.importedId}`);
        imported = normalizeImported(flatten(json?.data));
      } catch (error) {
        results.push({ ...item, ok: false, error: error.message || "Pandle row not found." });
        continue;
      }
      const isPayment = imported.moneyOut > 0;
      const total = round2(isPayment ? imported.moneyOut : imported.moneyIn);
      if (!total) { results.push({ ...item, ok: false, error: "Pandle row has no amount." }); continue; }
      const rate = Number(resolved.tax.rate) || 0;
      const tax = rate > 0 ? round2(total - total / (1 + rate)) : 0;
      const net = round2(total - tax);
      const description = cleanText(tx.counterparty || tx.description || imported.payee || imported.description, 200)
        + (tx.linkedOrderLabel ? ` · ${cleanText(tx.linkedOrderLabel, 60)}` : "");

      const fields = {
        date: imported.date || cleanText(tx.bookingDate, 10),
        type: isPayment ? "bankpayment" : "bankreceipt",
        account_class_and_id: `NominalAccount#${resolved.nominal.id}`,
        description,
        net_amount: net.toFixed(2),
        tax_code_id: resolved.tax.id,
        tax_amount: tax.toFixed(2),
        total_amount: total.toFixed(2),
        conversion_rate: "1.0",
        is_split: false
      };
      if (imported.currencyId) fields.currency_id = imported.currencyId;

      try {
        // Sent flat and wrapped: Pandle's docs show the flat shape while a
        // Rails backend commonly expects the wrapped one; duplicates are inert.
        const json = await api(companyId, "POST", `${base}/${item.importedId}/confirmation`, { ...fields, imported_bank_transaction: fields });
        const created = Array.isArray(json?.data) ? json.data[0] : json?.data;
        const bankTransactionId = cleanText(created?.id, 40);
        await txDoc.ref.set({
          pandle: {
            status: "confirmed",
            importedId: item.importedId,
            bankTransactionId,
            nominalCode: resolved.nominal.code,
            taxCode: resolved.tax.code,
            pushedAt: admin.firestore.FieldValue.serverTimestamp()
          }
        }, { merge: true });
        results.push({ ...item, ok: true, bankTransactionId });
      } catch (error) {
        results.push({ ...item, ok: false, error: error.message || "Pandle rejected the confirmation." });
      }
    }

    const confirmed = results.filter((row) => row.ok && !row.skipped).length;
    if (confirmed) {
      await connectionRef(companyId).set({
        lastPushAt: admin.firestore.FieldValue.serverTimestamp(),
        lastPushCount: confirmed,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }
    return { confirmed, failed: results.filter((row) => !row.ok).length, results };
  });

  return {
    pandleConnectStart,
    pandleConnectFinish,
    pandleDisconnect,
    pandleRefreshMeta,
    pandleSelectBankAccount,
    pandleSaveMappings,
    pandlePreview,
    pandlePush
  };
}

module.exports = { createPandleFunctions, DEFAULT_MAPPINGS };
