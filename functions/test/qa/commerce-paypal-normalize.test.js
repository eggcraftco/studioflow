"use strict";
// PayPal → bank-feed row, pure: the event-code groups, the sign carrying
// direction, fees kept beside the gross, withdrawals becoming payouts, and
// the client's window and auth plumbing with a fake fetch.
const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyPayPalTransaction, normalizePayPalTransaction, payoutOfPayPalTransaction } = require("../../commerce/paypal/normalize");
const { createPayPalClient, paypalIso } = require("../../commerce/paypal/client");

const tx = (code, value, over = {}) => ({
  transaction_info: { transaction_id: `TX${code}${String(value).replace(/[^0-9]/g, "")}`, transaction_event_code: code, transaction_status: "S", transaction_initiation_date: "2026-09-01T10:15:00+0000",
    transaction_amount: { currency_code: "GBP", value: String(value) }, fee_amount: { currency_code: "GBP", value: "-0.54" }, transaction_subject: "Signet ring", ...(over.info || {}) },
  payer_info: { email_address: "ada@example.com", payer_name: { given_name: "Ada", surname: "Lovelace", alternate_full_name: "Ada Lovelace" } },
  cart_info: { item_details: [{ item_name: "Signet ring" }] }, ...over
});

test("event codes: payments split by sign, fees and card spend are money out, withdrawals are payouts, funding and holds are nothing", () => {
  assert.equal(classifyPayPalTransaction(tx("T0006", "19.99")).kind, "sale");
  assert.equal(classifyPayPalTransaction(tx("T0000", "-45.00")).kind, "purchase");
  assert.equal(classifyPayPalTransaction(tx("T0106", "-15.00")).kind, "fee");
  assert.equal(classifyPayPalTransaction(tx("T0500", "-3.20")).kind, "purchase");
  assert.equal(classifyPayPalTransaction(tx("T0400", "-250.00")).kind, "payout");
  assert.equal(classifyPayPalTransaction(tx("T1700", "-90.00")).kind, "payout");
  assert.equal(classifyPayPalTransaction(tx("T1107", "-19.99")).kind, "refund");
  assert.equal(classifyPayPalTransaction(tx("T1201", "-19.99")).kind, "adjustment");
  assert.equal(classifyPayPalTransaction(tx("T0800", "5.00")).kind, "income");
  for (const code of ["T0300", "T0200", "T0700", "T1300", "T1500", "T2000", "T9900", "T1110"]) assert.equal(classifyPayPalTransaction(tx(code, "10.00")).kind, "skip", code);
  assert.equal(classifyPayPalTransaction(tx("T0006", "19.99", { info: { transaction_status: "D" } })).kind, "skip");
  assert.equal(classifyPayPalTransaction(tx("T0006", "19.99", { info: { transaction_status: "V" } })).kind, "skip");
  assert.equal(classifyPayPalTransaction(tx("T0006", "0.00")).kind, "skip");
});

test("a received payment becomes a booked row with the gross amount, the fee beside it, the payer as counterparty and a stable provider identity", () => {
  const row = normalizePayPalTransaction(tx("T0006", "19.99"), { accountId: "pp_abc", connectionId: "conn-1" });
  assert.equal(row.provider, "paypal"); assert.equal(row.amount, 19.99); assert.equal(row.feeAmount, -0.54); assert.equal(row.netAmount, 19.45);
  assert.equal(row.currency, "GBP"); assert.equal(row.bookingDate, "2026-09-01"); assert.equal(row.bookedAtMs, Date.parse("2026-09-01T10:15:00+0000"));
  assert.equal(row.counterparty, "Ada Lovelace"); assert.equal(row.description, "Signet ring"); assert.equal(row.payerEmail, "ada@example.com");
  assert.equal(row.txType, "PAYPAL_SALE"); assert.equal(row.status, "booked"); assert.equal(row.paypalEventCode, "T0006");
  assert.equal(row.providerTransactionId, row.normalisedProviderId); assert.equal(row.accountId, "pp_abc"); assert.equal(row.connectionId, "conn-1");
});

test("a pending payment is a pending row; a fee row names PayPal and keeps the subject; a sent payment is money out", () => {
  const pending = normalizePayPalTransaction(tx("T0006", "19.99", { info: { transaction_status: "P" } }), { accountId: "a", connectionId: "c" });
  assert.equal(pending.status, "pending");
  const fee = normalizePayPalTransaction(tx("T0106", "-15.00", { payer_info: {} }), { accountId: "a", connectionId: "c" });
  assert.equal(fee.amount, -15); assert.equal(fee.counterparty, "PayPal"); assert.equal(fee.description, "PayPal fee · Signet ring"); assert.equal(fee.txType, "PAYPAL_FEE");
  const sent = normalizePayPalTransaction(tx("T0000", "-45.00", { info: { transaction_subject: "", transaction_note: "" }, cart_info: {} }), { accountId: "a", connectionId: "c" });
  assert.equal(sent.amount, -45); assert.equal(sent.description, "PayPal payment sent"); assert.equal(sent.txType, "PAYPAL_PURCHASE");
});

test("a withdrawal to the bank is no row but a payout record the settlement matcher can use", () => {
  assert.equal(normalizePayPalTransaction(tx("T0400", "-250.00"), { accountId: "a", connectionId: "c" }), null);
  const payout = payoutOfPayPalTransaction(tx("T0400", "-250.00", { info: { fee_amount: { currency_code: "GBP", value: "0.00" } } }), { connectionId: "c" });
  assert.equal(payout.provider, "paypal"); assert.equal(payout.amount, "250.00"); assert.equal(payout.currency, "GBP"); assert.equal(payout.arrivalDate, "2026-09-01"); assert.equal(payout.status, "PAID");
  assert.equal(payoutOfPayPalTransaction(tx("T0006", "19.99"), { connectionId: "c" }), null);
});

test("the client takes a basic-auth token once, sends it as bearer, and asks the search API for 31-day windows with PayPal's date format", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), auth: init.headers.Authorization, method: init.method });
    if (String(url).includes("/v1/oauth2/token")) return { ok: true, status: 200, json: async () => ({ access_token: "A1", expires_in: 3600 }) };
    const u = new URL(String(url)); const page = Number(u.searchParams.get("page"));
    return { ok: true, status: 200, json: async () => ({ transaction_details: page === 1 ? [tx("T0006", "1.00")] : [], page, total_pages: 1, total_items: 1, account_number: "ACC1" }) };
  };
  const client = createPayPalClient({ environment: "sandbox", clientId: "id", clientSecret: "secret", fetchImpl });
  const start = Date.parse("2026-07-01T00:00:00Z"); const end = Date.parse("2026-08-15T00:00:00Z");
  const pages = []; for await (const page of client.transactionsBetween({ startMs: start, endMs: end })) pages.push(page);
  assert.equal(pages.length, 2, "45 days = two 31-day windows");
  assert.equal(calls[0].auth, `Basic ${Buffer.from("id:secret").toString("base64")}`); assert.equal(calls[0].method, "POST");
  assert.ok(calls[1].url.startsWith("https://api-m.sandbox.paypal.com/v1/reporting/transactions?")); assert.equal(calls[1].auth, "Bearer A1");
  assert.ok(calls[1].url.includes("start_date=2026-07-01T00%3A00%3A00-0000")); assert.ok(calls[1].url.includes("fields=all"));
  assert.equal(calls.filter((c) => c.url.includes("oauth2")).length, 1, "the token is reused");
  assert.equal(paypalIso(Date.parse("2026-09-02T13:05:06.789Z")), "2026-09-02T13:05:06-0000");
});

test("a refused credential is an auth-stage error, a refused search a data-stage error", async () => {
  const bad = createPayPalClient({ environment: "live", clientId: "id", clientSecret: "nope", fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ error: "invalid_client", error_description: "Client Authentication failed" }) }) });
  await assert.rejects(bad.probe(), (e) => e.status === 401 && e.stage === "auth" && /invalid_client/.test(e.message));
  const forbidden = createPayPalClient({ environment: "live", clientId: "id", clientSecret: "ok", fetchImpl: async (url) => String(url).includes("oauth2") ? ({ ok: true, status: 200, json: async () => ({ access_token: "A", expires_in: 100 }) }) : ({ ok: false, status: 403, json: async () => ({ name: "NOT_AUTHORIZED", message: "Authorization failed due to insufficient permissions." }) }) });
  await assert.rejects(forbidden.probe(), (e) => e.status === 403 && e.stage === "data" && /NOT_AUTHORIZED/.test(e.message));
});
