// Which NivaDesk rows a Pandle bank account is allowed to see.
//
// bankTransactions is not one bank account: PayPal rows land in it too
// (provider "paypal") and a workspace can hold several banks. Pandle's matcher
// compares only amount, direction and date, so an unscoped queue offered a
// PayPal row against a real bank line — a wrong nominal and VAT code confirmed
// into live books, and a NivaDesk row stamped confirmed that never was. The
// collision is a coincidence of amount and date, so only a test with both feeds
// in the collection shows it.
//
//   node functions/test/qa/pandle-account-scope.test.js
const test = require("node:test");
const assert = require("node:assert");
const { createPandleFunctions, pandleFeedScope, rowFeedsPandleAccount } = require("../../pandle");

const COMPANY = "c1";
const NOW = 1_760_000_000_000;
const PANDLE_ROW_ID = "imp_1";

// --- a fake Firestore, just enough of it ------------------------------------
const DELETE = Symbol("delete");
const SERVER_TS = Symbol("serverTimestamp");
const increment = (by) => ({ __increment: by });
const arrayUnion = (...values) => ({ __arrayUnion: values });

function applyPatch(target, patch) {
  const out = { ...(target || {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === DELETE) delete out[key];
    else if (value === SERVER_TS) out[key] = NOW;
    else if (value && typeof value === "object" && "__increment" in value) out[key] = (Number(out[key]) || 0) + value.__increment;
    else if (value && typeof value === "object" && "__arrayUnion" in value) out[key] = [...new Set([...(Array.isArray(out[key]) ? out[key] : []), ...value.__arrayUnion])];
    else if (value && typeof value === "object" && !Array.isArray(value)) out[key] = applyPatch(out[key], value);
    else out[key] = value;
  }
  return out;
}

function makeAdmin() {
  const docs = new Map();

  function docHandle(path) {
    return {
      path,
      id: path.split("/").pop(),
      get: async () => ({ exists: docs.has(path), ref: docHandle(path), data: () => (docs.has(path) ? docs.get(path) : undefined) }),
      set: async (patch, options = {}) => { docs.set(path, applyPatch(options.merge && docs.has(path) ? docs.get(path) : {}, patch)); },
      delete: async () => { docs.delete(path); },
      collection: (name) => collectionHandle(`${path}/${name}`)
    };
  }

  function collectionHandle(prefix) {
    const children = () => [...docs.entries()]
      .filter(([key]) => key.startsWith(`${prefix}/`) && !key.slice(prefix.length + 1).includes("/"))
      .map(([key, row]) => ({ id: key.split("/").pop(), ref: docHandle(key), data: () => row }));
    const query = (rows) => ({
      get: async () => ({ docs: rows, size: rows.length, empty: rows.length === 0 }),
      limit: (n) => query(rows.slice(0, n)),
      orderBy: () => query(rows)
    });
    return { doc: (id) => docHandle(`${prefix}/${id}`), ...query([]), get: async () => ({ docs: children() }), limit: (n) => query(children().slice(0, n)), orderBy: () => query(children()) };
  }

  const firestore = () => ({ collection: (name) => collectionHandle(name) });
  const admin = { firestore: Object.assign(firestore, { FieldValue: { serverTimestamp: () => SERVER_TS, delete: () => DELETE, increment, arrayUnion } }) };
  return { admin, docs };
}

class FakeHttpsError extends Error {
  constructor(code, message) { super(message); this.httpsCode = code; }
}

const BANK_ROW = {
  accountId: "acct-bank", connectionId: "conn-bank", provider: "truelayer", status: "booked",
  amount: -42.5, currency: "GBP", bookingDate: "2026-08-30",
  description: "Wire", counterparty: "Gem Supplier", category: "Materials"
};
const PAYPAL_ROW = {
  accountId: "pp_conn", connectionId: "conn", provider: "paypal", status: "booked",
  amount: -42.5, currency: "GBP", bookingDate: "2026-09-01",
  description: "PayPal payment", counterparty: "Gem Supplier", category: "Materials"
};

// One unconfirmed Pandle row: dated with the PayPal row, two days off the bank
// row, so the unscoped matcher preferred PayPal on score.
const importedPage = {
  data: [{
    id: PANDLE_ROW_ID, type: "imported-bank-transactions",
    attributes: { date: "2026-09-01", description: "Card payment", payee: "Gem Supplier", "money-out": 42.5, "money-in": 0, "is-ignored": false, "currency-id": "cur-1" }
  }]
};

function build({ connection = {}, rows = { tl_1: BANK_ROW, pp_1: PAYPAL_ROW }, fetchImpl = null } = {}) {
  const { admin, docs } = makeAdmin();
  docs.set(`companies/${COMPANY}`, { ownerUid: "owner" });
  docs.set(`companies/${COMPANY}/pandleConnection/main`, {
    status: "linked", pandleCompanyId: "pco-1", bankAccountId: "pba-1", bankAccountName: "Business current",
    bankAccounts: [{ id: "pba-1", name: "Business current", code: "1200", currency: "GBP" }],
    categories: [{ id: "n1", code: "500", name: "Materials" }],
    taxCodes: [{ id: "t1", code: "ST", name: "Standard", rate: 0.2 }],
    ...connection
  });
  docs.set(`companies/${COMPANY}/pandleTokens/main`, { accessToken: "pandle-token", refreshToken: "r", expiresAt: Date.now() + 3_600_000 });
  docs.set(`companies/${COMPANY}/bankConnections/conn-bank`, { provider: "truelayer", accounts: [{ id: "acct-bank", name: "Current", currency: "GBP" }] });
  docs.set(`companies/${COMPANY}/bankConnections/conn`, { provider: "paypal", accounts: [{ id: "pp_conn", name: "PayPal", currency: "" }] });
  for (const [id, row] of Object.entries(rows)) docs.set(`companies/${COMPANY}/bankTransactions/${id}`, row);

  const requests = [];
  globalThis.fetch = async (url, init = {}) => {
    requests.push(`${init.method || "GET"} ${String(url)}`);
    const body = fetchImpl ? fetchImpl(String(url), init) : null;
    if (body) return { ok: true, status: 200, json: async () => body };
    if (String(url).includes("imported_bank_transactions?")) return { ok: true, status: 200, json: async () => importedPage };
    return { ok: false, status: 500, json: async () => ({ errors: [{ detail: "unexpected call" }] }) };
  };

  const fns = createPandleFunctions({
    admin,
    onCall: (_options, handler) => handler,
    HttpsError: FakeHttpsError,
    uidIsCompanyOwner: (_company, uid) => uid === "owner"
  });
  return { fns, docs, requests };
}

const call = (fn, data) => fn({ auth: { uid: "owner" }, data: { companyId: COMPANY, ...data } });

// --- the scope itself -------------------------------------------------------

test("unpaired, the queue is the bank feed: PayPal is out, a legacy row with no provider is in", () => {
  const scope = pandleFeedScope({ bankAccountId: "pba-1", bankAccounts: [{ id: "pba-1", currency: "GBP" }] });
  assert.ok(rowFeedsPandleAccount({ provider: "truelayer", accountId: "acct-bank", currency: "GBP" }, scope));
  assert.ok(!rowFeedsPandleAccount({ provider: "paypal", accountId: "pp_conn", currency: "GBP" }, scope));
  assert.ok(rowFeedsPandleAccount({ accountId: "acct-bank", currency: "GBP" }, scope), "rows written before the provider field are the bank's");
  assert.ok(!rowFeedsPandleAccount({ provider: "truelayer", accountId: "acct-bank", currency: "EUR" }, scope), "one Pandle account keeps one currency");
});

test("paired, only that account's rows count — which is what makes a PayPal account in Pandle work", () => {
  const scope = pandleFeedScope({ nivaAccountId: "pp_conn", bankAccountId: "pba-2", bankAccounts: [{ id: "pba-2", currency: "" }] });
  assert.ok(rowFeedsPandleAccount({ provider: "paypal", accountId: "pp_conn", currency: "GBP" }, scope));
  assert.ok(!rowFeedsPandleAccount({ provider: "truelayer", accountId: "acct-bank", currency: "GBP" }, scope));
});

// --- the preview ------------------------------------------------------------

test("a PayPal row is never offered against a bank account's Check queue, even when it scores better", async () => {
  const { fns } = build();
  const preview = await call(fns.pandlePreview, {});
  assert.strictEqual(preview.nivaCandidates, 1, "only the bank row is a candidate at all");
  assert.strictEqual(preview.matched, 1);
  assert.strictEqual(preview.items[0].transactionId, "tl_1", "the PayPal row is two days closer and used to take this match");
  assert.ok(!preview.items.some((item) => item.transactionId === "pp_1"));
});

test("paired to the PayPal account, the same queue offers the PayPal row instead", async () => {
  const { fns } = build({ connection: { nivaAccountId: "pp_conn" } });
  const preview = await call(fns.pandlePreview, {});
  assert.strictEqual(preview.items.length, 1);
  assert.strictEqual(preview.items[0].transactionId, "pp_1");
});

// --- the push ---------------------------------------------------------------

test("a replayed preview cannot push a PayPal row into a bank account, and does not stamp it as broken", async () => {
  const { fns, docs, requests } = build();
  const result = await call(fns.pandlePush, { items: [{ transactionId: "pp_1", importedId: PANDLE_ROW_ID }] });
  assert.strictEqual(result.confirmed, 0);
  // Nothing is paired in this fixture, and every workspace today is in that
  // state. The refusal has to say what actually happened — the row is not from
  // the bank feed — rather than point at a setting nobody made.
  assert.match(result.results[0].error, /Only bank feed transactions can be sent to Pandle/);
  assert.ok(!requests.some((line) => line.includes("confirmation")), "nothing was confirmed at Pandle");
  assert.strictEqual(docs.get(`companies/${COMPANY}/bankTransactions/pp_1`).reviewStatus, undefined, "a row that is simply not ours must not be marked sync_error");
});

test("the bank row still pushes — the guard scopes the queue, it does not close it", async () => {
  const { fns, docs } = build({
    fetchImpl: (url, init) => {
      if (init.method === "POST" && url.includes("confirmation")) return { data: { id: "btx-9" } };
      if (url.endsWith(`/${PANDLE_ROW_ID}`)) return { data: importedPage.data[0] };
      return null;
    }
  });
  const result = await call(fns.pandlePush, { items: [{ transactionId: "tl_1", importedId: PANDLE_ROW_ID }] });
  assert.strictEqual(result.confirmed, 1, result.results[0]?.error || "");
  assert.strictEqual(docs.get(`companies/${COMPANY}/bankTransactions/tl_1`).pandle.status, "confirmed");
});

// --- choosing the pairing ---------------------------------------------------

test("the owner can pair a Pandle account with one NivaDesk account, and only a real one", async () => {
  const { fns, docs } = build();
  await call(fns.pandleSelectBankAccount, { bankAccountId: "pba-1", nivaAccountId: "pp_conn" });
  assert.strictEqual(docs.get(`companies/${COMPANY}/pandleConnection/main`).nivaAccountId, "pp_conn");
  await assert.rejects(() => call(fns.pandleSelectBankAccount, { bankAccountId: "pba-1", nivaAccountId: "acct-ghost" }), /not found/);
  await call(fns.pandleSelectBankAccount, { bankAccountId: "pba-1", nivaAccountId: "" });
  assert.strictEqual(docs.get(`companies/${COMPANY}/pandleConnection/main`).nivaAccountId, "", "sent empty, the pairing is cleared");
});
