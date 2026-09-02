"use strict";

// PandleAccountingAdapter — a thin description of what the existing Pandle
// bridge (functions/pandle.js) is, so the engine can count it as a writer.
// Pandle confirms rows already waiting in its own bank feed and never creates
// ledger documents; that is the whole of its write capability, and it is the
// one capability QuickBooks does not have (§8).

const { assertAdapter, defaultCapabilities } = require("../core/adapter");

const IMPLICIT_CONNECTION_ID = "pandle__main";

function describeFromPandleDoc(data = {}, modeDoc = null) {
  const linked = String(data.status || "") === "linked";
  return {
    connectionId: IMPLICIT_CONNECTION_ID,
    provider: "pandle",
    implicit: true,
    status: linked ? "linked" : "none",
    externalCompanyId: String(data.pandleCompanyId || ""),
    companyName: String(data.pandleCompanyName || ""),
    homeCurrency: "GBP",
    countryCode: "GB",
    // Until the owner says otherwise, a linked Pandle is the company's primary
    // bank-side writer with no end date: exactly the double-writer risk the
    // QuickBooks wizard must surface.
    mode: modeDoc && modeDoc.mode ? String(modeDoc.mode) : linked ? "primary_write" : "disabled",
    writeBoundaryDate: modeDoc ? String(modeDoc.writeBoundaryDate || "") : "",
    writeUntilDate: modeDoc ? String(modeDoc.writeUntilDate || "") : "",
    capabilities: defaultCapabilities("pandle"),
    lastPushAtMs: data.lastPushAt && typeof data.lastPushAt.toMillis === "function" ? data.lastPushAt.toMillis() : 0,
    bankAccountName: String(data.bankAccountName || "")
  };
}

function createPandleAdapter({ readPandleConnection }) {
  const unsupported = (name) => async () => {
    const error = new Error(`pandle_${name}_not_supported`);
    error.errorClass = "validation";
    throw error;
  };
  const adapter = {
    provider: "pandle",
    connect: unsupported("connect"),
    disconnect: unsupported("disconnect"),
    getCapabilities() { return defaultCapabilities("pandle"); },
    async getCompanyProfile() {
      const data = await readPandleConnection();
      return describeFromPandleDoc(data);
    },
    async getAccounts() {
      const data = await readPandleConnection();
      const rows = Array.isArray(data.categories) ? data.categories : [];
      return { items: rows.map((row) => ({ externalId: String(row.id || ""), name: String(row.name || ""), accountNumber: String(row.code || ""), active: true })), nextCursor: "" };
    },
    async getTaxCodes() {
      const data = await readPandleConnection();
      const rows = Array.isArray(data.taxCodes) ? data.taxCodes : [];
      return { items: rows.map((row) => ({ externalId: String(row.id || ""), name: String(row.name || ""), code: String(row.code || ""), effectiveSalesRate: Number(row.rate) || 0, active: true })), nextCursor: "" };
    },
    async getCustomers() { return { items: [], nextCursor: "" }; },
    async getVendors() { return { items: [], nextCursor: "" }; },
    async getItems() { return { items: [], nextCursor: "" }; },
    previewPosting: unsupported("preview"),
    postDocument: unsupported("post"),
    fetchEntity: unsupported("fetch"),
    async reconcile() { return { changes: [] }; }
  };
  return assertAdapter(adapter, "pandle");
}

module.exports = { IMPLICIT_CONNECTION_ID, describeFromPandleDoc, createPandleAdapter };
