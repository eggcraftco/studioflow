// The PayPal money feed on a real Firestore with PayPal replaced by a fake
// client: credentials are proved before anything is written (a refused
// secret writes nothing), the secret is stored boxed, a payment received
// becomes a row with its fee beside the gross, a fee and a sent payment are
// money out, a withdrawal to the bank is a payout record (no row) that the
// settlement matcher ties to the statement row, the regular sync runs through
// the bank sweep, entering the credentials again refreshes the same
// connection, and purge takes rows and payouts with it.
//   firebase emulators:exec --only firestore "node functions/test/e2e/bank-paypal-feed-emulator.test.js"
const assert = require("assert");
const crypto = require("crypto");
process.env.NIVADESK_E2E = "1";
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "eggcraft-studio";
process.env.FIREBASE_CONFIG = process.env.FIREBASE_CONFIG || '{"projectId":"eggcraft-studio"}';
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
process.env.NIVADESK_TL_CLIENT_ID = "tl-test-id";
process.env.NIVADESK_TL_CLIENT_SECRET = "tl-test-secret";
process.env.NIVADESK_PAYPAL_TOKEN_KEY = crypto.randomBytes(32).toString("hex");

// ---- the fake PayPal --------------------------------------------------------
const paypal = { transactions: [], clients: [], goodSecret: "secret-1", searchBroken: false };
const iso = (daysAgo, hour = "10:15:00") => `${new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10)}T${hour}+0000`;
const tx = (id, code, value, daysAgo, over = {}) => ({
  transaction_info: { transaction_id: id, transaction_event_code: code, transaction_status: "S", transaction_initiation_date: iso(daysAgo), transaction_amount: { currency_code: "GBP", value: String(value) }, fee_amount: { currency_code: "GBP", value: over.fee ?? "-0.54" }, transaction_subject: over.subject ?? "Signet ring" },
  payer_info: over.payer ?? { email_address: "ada@example.com", payer_name: { alternate_full_name: "Ada Lovelace" } }
});
global.__nivadeskPayPalFakeClient = (options) => {
  paypal.clients.push({ environment: options.environment, clientId: options.clientId, clientSecret: options.clientSecret });
  const ok = options.clientSecret === paypal.goodSecret;
  const fail = () => { const e = new Error("paypal_http_401: invalid_client"); e.status = 401; e.stage = "auth"; e.tlStatus = 401; e.tlStage = "auth"; throw e; };
  return {
    async probe() { if (!ok) fail(); return { ok: true, accountNumber: "ACC-42", lastRefreshed: new Date().toISOString() }; },
    async *transactionsBetween({ startMs, endMs }) {
      if (!ok) fail();
      if (paypal.searchBroken) { const e = new Error("paypal_http_400: INVALID_REQUEST"); e.status = 400; e.stage = "data"; throw e; }
      const inWindow = paypal.transactions.filter((t) => { const ms = Date.parse(t.transaction_info.transaction_initiation_date); return ms >= startMs && ms <= endMs; });
      yield { transactions: inWindow, page: 1, totalPages: 1, totalItems: inWindow.length, accountNumber: "ACC-42" };
    }
  };
};
globalThis.fetch = async () => { throw new Error("no real network in this test"); };

const admin = require("firebase-admin");
const index = require("../../index");
const db = admin.firestore();
let failures = 0;
function pass(name) { console.log("PASS ", name); }
function fail(name, error) { failures += 1; const where = String(error && error.stack || "").split("\n").find((line) => line.includes("emulator.test.js")) || ""; console.log("FAIL ", name, "-", String(error && error.message || error).replace(/\s+/g, " ").slice(0, 320), where.trim()); }
async function check(name, fn) { try { await fn(); pass(name); } catch (error) { fail(name, error); } }

const COMPANY = "e2e-paypal-company"; const OWNER = COMPANY;
const auth = { uid: OWNER, token: { email: "owner@example.com" } };
const company = () => db.collection("companies").doc(COMPANY);
const rows = () => company().collection("bankTransactions");

(async () => {
  await db.recursiveDelete(company());
  await company().set({ companyName: "PayPal Co", ownerUid: OWNER, billingPlan: "pro_monthly", billingPlanName: "NivaDesk Pro", billingStatus: "active", billingProvider: "stripe" });
  paypal.transactions = [
    tx("SALE1", "T0006", "19.99", 2),
    tx("FEE1", "T0106", "-15.00", 3, { subject: "Chargeback", payer: {} }),
    tx("SENT1", "T0000", "-45.00", 4, { subject: "Supplier", fee: "0.00", payer: { payer_name: { alternate_full_name: "Beads Ltd" } } }),
    tx("WD1", "T0400", "-250.00", 5, { subject: "", fee: "0.00", payer: {} }),
    tx("HOLD1", "T1110", "-19.99", 2),
    tx("OLD1", "T0006", "9.99", 400)   // beyond the initial window
  ];

  await check("a refused secret writes nothing and says what to check", async () => {
    await assert.rejects(index.paypalConnect.run({ auth, data: { companyId: COMPANY, clientId: "client-abc", clientSecret: "wrong", environment: "live" }, rawRequest: {} }), /rejected the client ID or secret/);
    assert.strictEqual((await company().collection("bankConnections").get()).size, 0);
    assert.strictEqual((await company().collection("bankTokens").get()).size, 0);
    await assert.rejects(index.paypalConnect.run({ auth: { uid: "someone-else", token: {} }, data: { companyId: COMPANY, clientId: "c", clientSecret: "s" }, rawRequest: {} }), /owner|permission|not/i);
  });

  let connectionId = ""; let accountId = "";
  await check("connect proves the credentials, boxes the secret, and imports the window: sale with fee, fee and sent payment as money out, the withdrawal as a payout record", async () => {
    const out = await index.paypalConnect.run({ auth, data: { companyId: COMPANY, clientId: "client-abc", clientSecret: paypal.goodSecret, environment: "live" }, rawRequest: {} });
    assert.strictEqual(out.status, "linked"); connectionId = out.connectionId; accountId = out.accountId;
    assert.strictEqual(out.imported, 3, "sale + fee + sent"); assert.strictEqual(out.payouts, 1);
    const conn = (await company().collection("bankConnections").doc(connectionId).get()).data();
    assert.strictEqual(conn.provider, "paypal"); assert.strictEqual(conn.status, "linked"); assert.strictEqual(conn.environment, "live"); assert.strictEqual(conn.accounts[0].id, accountId); assert.strictEqual(conn.accounts[0].accountNumber, "ACC-42");
    assert.strictEqual(conn.clientIdHint, "client…-abc");
    const tokens = (await company().collection("bankTokens").doc(connectionId).get()).data();
    assert.strictEqual(tokens.clientId, "client-abc"); assert.ok(tokens.secretBox && tokens.secretBox.data, "boxed"); assert.strictEqual(JSON.stringify(tokens).includes(paypal.goodSecret), false, "never in plain text");
    assert.strictEqual((await company().get()).data().bankFeedEnabled, true);
    const sale = (await rows().doc(`${accountId}_SALE1`).get()).data();
    assert.strictEqual(sale.provider, "paypal"); assert.strictEqual(sale.amount, 19.99); assert.strictEqual(sale.feeAmount, -0.54); assert.strictEqual(sale.netAmount, 19.45); assert.strictEqual(sale.counterparty, "Ada Lovelace"); assert.strictEqual(sale.txType, "PAYPAL_SALE"); assert.ok(sale.firstImportedAt && sale.importedAt); assert.ok(sale.bookedAtMs > 0);
    const fee = (await rows().doc(`${accountId}_FEE1`).get()).data(); assert.strictEqual(fee.amount, -15); assert.strictEqual(fee.counterparty, "PayPal"); assert.strictEqual(fee.txType, "PAYPAL_FEE");
    const sent = (await rows().doc(`${accountId}_SENT1`).get()).data(); assert.strictEqual(sent.amount, -45); assert.strictEqual(sent.counterparty, "Beads Ltd");
    assert.strictEqual((await rows().doc(`${accountId}_WD1`).get()).exists, false, "a withdrawal is not a row");
    assert.strictEqual((await rows().doc(`${accountId}_HOLD1`).get()).exists, false, "a hold moves no money");
    assert.strictEqual((await rows().doc(`${accountId}_OLD1`).get()).exists, false, "outside the initial window");
    const payout = (await company().collection("paypalPayouts").doc("WD1").get()).data();
    assert.strictEqual(payout.provider, "paypal"); assert.strictEqual(payout.amount, "250.00"); assert.strictEqual(payout.status, "PAID"); assert.strictEqual(payout.connectionId, connectionId);
    assert.strictEqual(paypal.clients[paypal.clients.length - 1].environment, "live");
  });

  await check("the bank sweep runs the PayPal connection too, and the statement row of the withdrawal is matched as a payout", async () => {
    // The bank's own row for the same £250 landing two days after the withdrawal.
    const wdDate = paypal.transactions.find((t) => t.transaction_info.transaction_id === "WD1").transaction_info.transaction_initiation_date.slice(0, 10);
    await rows().doc("acc_hsbc_z1").set({ accountId: "acc_hsbc", connectionId: "bank_1", provider: "truelayer", status: "booked", amount: 250, currency: "GBP", bookingDate: wdDate, description: "PAYPAL PTE LTD", counterparty: "PayPal" });
    // Yesterday, not "today": the fixture stamps every transaction at 10:15 UTC,
    // so a same-day sale is in the future for any run before that hour, and the
    // sweep — which searches up to Date.now() — correctly leaves it out. A day
    // back it is always in the past and well inside the fourteen-day overlap.
    paypal.transactions.push(tx("SALE2", "T0006", "5.00", 1));
    const out = await index.bankSyncTransactions.run({ auth, data: { companyId: COMPANY, force: true }, rawRequest: {} });
    assert.strictEqual(out.synced, 1); assert.ok(out.imported >= 2, JSON.stringify(out));
    assert.ok((await rows().doc(`${accountId}_SALE2`).get()).exists, "the new sale arrived through the sweep");
    const conn = (await company().collection("bankConnections").doc(connectionId).get()).data();
    assert.strictEqual(conn.syncState, "ok");
    const bankRow = (await rows().doc("acc_hsbc_z1").get()).data();
    assert.strictEqual(bankRow.incomingKind, "payout"); assert.strictEqual(bankRow.settlement.provider, "paypal"); assert.strictEqual(bankRow.settlement.payoutId, "WD1");
    const payout = (await company().collection("paypalPayouts").doc("WD1").get()).data();
    assert.strictEqual(payout.bankMatch.transactionId, "acc_hsbc_z1"); assert.strictEqual(payout.bankMatch.method, "auto");
    const listed = await index.bankListPayouts.run({ auth, data: { companyId: COMPANY, provider: "paypal" }, rawRequest: {} });
    assert.strictEqual(listed.payouts[0].externalId, "WD1"); assert.strictEqual(listed.payouts[0].bankMatch.transactionId, "acc_hsbc_z1");
    const unlinked = await index.matchPayoutToBank.run({ auth, data: { companyId: COMPANY, provider: "paypal", payoutId: "WD1", mode: "unlink" }, rawRequest: {} });
    assert.strictEqual(unlinked.unlinked, true);
    assert.strictEqual((await rows().doc("acc_hsbc_z1").get()).data().settlement, undefined);
    const suggest = await index.matchPayoutToBank.run({ auth, data: { companyId: COMPANY, provider: "paypal", payoutId: "WD1", mode: "suggest" }, rawRequest: {} });
    assert.strictEqual(suggest.candidates.length, 1); assert.ok(suggest.candidates[0].reasons.includes("provider_keyword"));
  });

  await check("a PayPal refund names the payment it reverses; recorded on that order it becomes a negative ledger entry, and unlink takes it back", async () => {
    // The order the sale was paid into, and the sale row matched to it (create mode records the payment).
    await db.collection("siparisler").doc("order-refund-1").set({ companyId: COMPANY, customerName: "Ada Lovelace", designName: "Signet ring", paidAmount: 0, remainingAmount: 19.99, payments: [], status: "In progress" });
    const created = await index.bankMatchIncomingToOrder.run({ auth, data: { companyId: COMPANY, transactionId: `${accountId}_SALE1`, mode: "create", orderId: "order-refund-1" }, rawRequest: {} });
    assert.strictEqual(created.ok, true);
    // PayPal's refund of that sale (T1107) names it through paypal_reference_id.
    paypal.transactions.push({ ...tx("REF1", "T1107", "-19.99", 1, { subject: "Refund", fee: "0.54" }), transaction_info: { ...tx("REF1", "T1107", "-19.99", 1, { fee: "0.54" }).transaction_info, paypal_reference_id: "SALE1", paypal_reference_id_type: "TXN" } });
    await index.bankSyncTransactions.run({ auth, data: { companyId: COMPANY, force: true }, rawRequest: {} });
    const refundRow = (await rows().doc(`${accountId}_REF1`).get()).data();
    assert.strictEqual(refundRow.txType, "PAYPAL_REFUND"); assert.strictEqual(refundRow.paypalReferenceId, "SALE1"); assert.strictEqual(refundRow.amount, -19.99);
    const suggest = await index.bankLinkRefundToOrder.run({ auth, data: { companyId: COMPANY, transactionId: `${accountId}_REF1`, mode: "suggest" }, rawRequest: {} });
    assert.strictEqual(suggest.suggestedKind, "customer_refund"); assert.strictEqual(suggest.hint.orderId, "order-refund-1"); assert.strictEqual(suggest.hint.reason, "reverses_paypal_payment");
    await assert.rejects(index.bankLinkTransactionToOrder.run({ auth, data: { companyId: COMPANY, transactionId: `${accountId}_SALE1`, orderId: "order-refund-1" }, rawRequest: {} }), /outgoing/, "a sale is not an expense");
    const linked = await index.bankLinkRefundToOrder.run({ auth, data: { companyId: COMPANY, transactionId: `${accountId}_REF1`, mode: "link", orderId: "order-refund-1", kind: "customer_refund" }, rawRequest: {} });
    assert.strictEqual(linked.linked, true);
    let order = (await db.collection("siparisler").doc("order-refund-1").get()).data();
    assert.strictEqual(order.paidAmount, 0); assert.strictEqual(order.refundedAmount, 19.99);
    const entry = order.payments.find((p) => p.refund === true);
    assert.ok(entry, "a refund entry sits in the ledger"); assert.strictEqual(entry.amount, -19.99); assert.strictEqual(entry.method, "Refund"); assert.strictEqual(entry.bankTransactionId, `${accountId}_REF1`);
    const rowAfter = (await rows().doc(`${accountId}_REF1`).get()).data();
    assert.strictEqual(rowAfter.outgoingKind, "customer_refund"); assert.strictEqual(rowAfter.linkedOrderId, "order-refund-1"); assert.strictEqual(rowAfter.linkedPaymentId, entry.id);
    await assert.rejects(index.bankLinkTransactionToOrder.run({ auth, data: { companyId: COMPANY, transactionId: `${accountId}_REF1`, orderId: "order-refund-1" }, rawRequest: {} }), /recorded as a refund/, "a refund row is not an expense");
    const again = await index.bankLinkRefundToOrder.run({ auth, data: { companyId: COMPANY, transactionId: `${accountId}_REF1`, mode: "link", orderId: "order-refund-1", kind: "chargeback" }, rawRequest: {} });
    assert.strictEqual(again.already, true, "the same row never becomes a second entry");
    order = (await db.collection("siparisler").doc("order-refund-1").get()).data();
    assert.strictEqual(order.payments.filter((p) => p.refund === true).length, 1); assert.strictEqual(order.payments.find((p) => p.refund === true).method, "Chargeback");
    const unlinked = await index.bankLinkRefundToOrder.run({ auth, data: { companyId: COMPANY, transactionId: `${accountId}_REF1`, mode: "unlink" }, rawRequest: {} });
    assert.strictEqual(unlinked.unlinked, true);
    order = (await db.collection("siparisler").doc("order-refund-1").get()).data();
    assert.strictEqual(order.paidAmount, 19.99); assert.strictEqual(order.refundedAmount, 0); assert.strictEqual(order.payments.some((p) => p.refund === true), false);
    const rowFree = (await rows().doc(`${accountId}_REF1`).get()).data();
    assert.strictEqual(rowFree.outgoingKind, undefined); assert.strictEqual(rowFree.linkedOrderId, "");
    // Deleting the refund entry from the order itself (the web/Android ledger) is the same unlink: totals restored, the bank row freed.
    const relinked = await index.bankLinkRefundToOrder.run({ auth, data: { companyId: COMPANY, transactionId: `${accountId}_REF1`, mode: "link", orderId: "order-refund-1", kind: "customer_refund" }, rawRequest: {} });
    order = (await db.collection("siparisler").doc("order-refund-1").get()).data();
    assert.strictEqual(order.refundedAmount, 19.99); assert.strictEqual(order.paidAmount, 0);
    const deleted = await index.updateWebOrder.run({ auth, data: { companyId: COMPANY, orderId: "order-refund-1", finance: { deletePaymentId: relinked.paymentId } }, rawRequest: {} });
    assert.strictEqual(deleted.ok, true);
    order = (await db.collection("siparisler").doc("order-refund-1").get()).data();
    assert.strictEqual(order.paidAmount, 19.99); assert.strictEqual(order.refundedAmount, 0); assert.strictEqual(order.payments.some((p) => p.refund === true), false);
    const rowFreedAgain = (await rows().doc(`${accountId}_REF1`).get()).data();
    assert.strictEqual(rowFreedAgain.outgoingKind, undefined); assert.strictEqual(rowFreedAgain.linkedOrderId, ""); assert.strictEqual(rowFreedAgain.linkedPaymentId, "");
    await db.collection("siparisler").doc("order-refund-1").delete();
  });

  await check("a refused secret on a later sync is a reconnect, not a silent nothing", async () => {
    paypal.goodSecret = "secret-2";   // PayPal rotated; ours is now wrong
    const out = await index.bankSyncTransactions.run({ auth, data: { companyId: COMPANY, force: true }, rawRequest: {} });
    assert.strictEqual(out.synced, 0);
    const conn = (await company().collection("bankConnections").doc(connectionId).get()).data();
    assert.strictEqual(conn.syncState, "needs_reconsent", JSON.stringify({ state: conn.syncState, err: conn.lastSyncError }));
  });

  await check("entering the credentials again refreshes the same connection", async () => {
    const out = await index.paypalConnect.run({ auth, data: { companyId: COMPANY, clientId: "client-abc", clientSecret: "secret-2", environment: "live" }, rawRequest: {} });
    assert.strictEqual(out.connectionId, connectionId); assert.strictEqual(out.reconnected, true);
    const conn = (await company().collection("bankConnections").doc(connectionId).get()).data();
    assert.strictEqual(conn.syncState, "ok"); assert.strictEqual(conn.status, "linked");
    assert.strictEqual((await company().collection("bankConnections").get()).size, 1, "still one PayPal connection");
  });

  await check("a connect whose first import fails still links, and the next sync takes the six months it owes", async () => {
    // Disconnect and purge the current one so the scenario starts clean, then connect while the search API is broken.
    await index.bankDeleteConnection.run({ auth, data: { companyId: COMPANY, requisitionId: connectionId, mode: "purge" }, rawRequest: {} });
    paypal.searchBroken = true;
    const out = await index.paypalConnect.run({ auth, data: { companyId: COMPANY, clientId: "client-abc", clientSecret: paypal.goodSecret, environment: "live" }, rawRequest: {} });
    assert.strictEqual(out.status, "linked"); assert.strictEqual(out.imported, 0);
    const linked = (await company().collection("bankConnections").doc(out.connectionId).get()).data();
    assert.strictEqual(linked.historyImportedAt, undefined, "the history is still owed");
    paypal.searchBroken = false;
    paypal.transactions.push(tx("OLD2", "T0006", "7.00", 120));   // four months back: only a full-history pass reaches it
    const swept = await index.bankSyncTransactions.run({ auth, data: { companyId: COMPANY, force: false }, rawRequest: {} });
    assert.strictEqual(swept.skipped, 0, "an owed history is not throttled by the interval");
    assert.ok((await rows().doc(`${out.accountId}_OLD2`).get()).exists, "the six-month import ran on the first good sync");
    assert.ok((await company().collection("bankConnections").doc(out.connectionId).get()).data().historyImportedAt, "and is marked as taken");
    connectionId = out.connectionId; accountId = out.accountId;
  });

  await check("purge takes the rows and the payout records with the connection", async () => {
    const out = await index.bankDeleteConnection.run({ auth, data: { companyId: COMPANY, requisitionId: connectionId, mode: "purge" }, rawRequest: {} });
    assert.strictEqual(out.deleted, true);
    assert.strictEqual((await rows().where("connectionId", "==", connectionId).get()).size, 0);
    assert.strictEqual((await company().collection("paypalPayouts").get()).size, 0);
    assert.ok((await rows().doc("acc_hsbc_z1").get()).exists, "the bank's own row stays");
    assert.strictEqual((await company().collection("bankTokens").doc(connectionId).get()).exists, false);
    assert.strictEqual((await company().get()).data().bankFeedEnabled, false);
  });

  await db.recursiveDelete(company());
  console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
  process.exit(failures ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });
