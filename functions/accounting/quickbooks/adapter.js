"use strict";

// QuickBooksOnlineAccountingAdapter — the contract in core/adapter.js over a
// pure client. Reads only until phase 3; previewPosting/postDocument say so
// rather than pretending.

const { assertAdapter, defaultCapabilities } = require("../core/adapter");
const normalize = require("./normalize");
const { SUBSCRIBED_ENTITIES } = require("./webhook");

const PAGE = 1000;

function pageOf(rows, cursor, pageSize = PAGE) {
  const start = Math.max(0, Number(cursor) || 0);
  const slice = rows.slice(start, start + pageSize);
  return { items: slice, nextCursor: start + slice.length < rows.length ? String(start + slice.length) : "" };
}

// clientFor(): a ready client (token refreshed) for this connection.
// connect/disconnect are the store-aware steps the functions module supplies.
function createQuickBooksAdapter({ clientFor, connect, disconnect, profile = null }) {
  const adapter = {
    provider: "quickbooks_online",
    async connect(input) { return connect(input); },
    async disconnect(connectionId) { return disconnect(connectionId); },
    getCapabilities() {
      const base = defaultCapabilities("quickbooks_online");
      return { ...base, multiCurrency: { enabled: Boolean(profile?.multiCurrencyEnabled) } };
    },
    async getCompanyProfile() {
      const client = await clientFor();
      const [info, prefs] = await Promise.all([client.companyInfo(), client.preferences()]);
      return normalize.normalizeCompanyProfile(info, prefs);
    },
    async getAccounts(cursor) {
      const client = await clientFor();
      const rows = (await client.queryAll("Account")).map(normalize.normalizeAccount);
      return pageOf(rows, cursor);
    },
    async getTaxCodes(cursor) {
      const client = await clientFor();
      const rates = (await client.queryAll("TaxRate")).map(normalize.normalizeTaxRate);
      const ratesById = new Map(rates.map((rate) => [rate.externalId, rate]));
      const codes = (await client.queryAll("TaxCode")).map((raw) => normalize.normalizeTaxCode(raw, ratesById));
      const page = pageOf(codes, cursor);
      return { ...page, rates };
    },
    async getCustomers(cursor) {
      const client = await clientFor();
      return pageOf((await client.queryAll("Customer")).map(normalize.normalizeCustomer), cursor);
    },
    async getVendors(cursor) {
      const client = await clientFor();
      return pageOf((await client.queryAll("Vendor")).map(normalize.normalizeVendor), cursor);
    },
    async getItems(cursor) {
      const client = await clientFor();
      return pageOf((await client.queryAll("Item")).map(normalize.normalizeItem), cursor);
    },
    async previewPosting() {
      const error = new Error("posting_not_available_yet");
      error.errorClass = "validation";
      throw error;
    },
    async postDocument() {
      const error = new Error("posting_not_available_yet");
      error.errorClass = "validation";
      throw error;
    },
    async fetchEntity({ entityType, externalId }) {
      const client = await clientFor();
      const raw = await client.read(entityType, externalId);
      return { entityType, externalId: String(externalId), raw, snapshot: raw ? normalize.snapshotOf(entityType, raw) : null, deleted: !raw };
    },
    // cursor = { entities?: string[], changedSince: ISO }
    async reconcile(cursor) {
      const client = await clientFor();
      const entities = Array.isArray(cursor?.entities) && cursor.entities.length ? cursor.entities : SUBSCRIBED_ENTITIES.filter((name) => name !== "Preferences" && name !== "CompanyInfo");
      const changes = await client.cdc(entities, cursor?.changedSince);
      return { changes: changes.map((change) => ({ entityType: change.entity, externalId: String(change.row?.Id || ""), deleted: change.deleted, raw: change.row, snapshot: change.deleted ? null : normalize.snapshotOf(change.entity, change.row) })) };
    }
  };
  return assertAdapter(adapter, "quickbooks_online");
}

module.exports = { createQuickBooksAdapter };
