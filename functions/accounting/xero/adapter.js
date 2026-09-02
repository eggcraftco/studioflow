"use strict";

// XeroAccountingAdapter — the contract in core/adapter.js over a pure client.
// Reads only until the posting phase; previewPosting/postDocument say so rather
// than pretending. One Contacts read feeds both customers and suppliers: a
// Starter organisation has 1,000 calls a day and none is spent twice.

const { assertAdapter, defaultCapabilities } = require("../core/adapter");
const normalize = require("./normalize");

const PAGE = 1000;

function pageOf(rows, cursor, pageSize = PAGE) {
  const start = Math.max(0, Number(cursor) || 0);
  const slice = rows.slice(start, start + pageSize);
  return { items: slice, nextCursor: start + slice.length < rows.length ? String(start + slice.length) : "" };
}

function notAvailable() {
  const error = new Error("posting_not_available_yet");
  error.errorClass = "validation";
  throw error;
}

// clientFor(): a ready client (token refreshed, tenant header set) for this
// connection. connect/disconnect are the store-aware steps the functions module supplies.
function createXeroAdapter({ clientFor, connect, disconnect, profile = null, scopes = [], scopeLevel = "read" }) {
  let contactsPromise = null;
  const contacts = () => {
    if (!contactsPromise) contactsPromise = clientFor().then((client) => client.contacts()).then((rows) => rows.map(normalize.normalizeContact));
    return contactsPromise;
  };
  const adapter = {
    provider: "xero",
    async connect(input) { return connect(input); },
    async disconnect(connectionId) { return disconnect(connectionId); },
    getCapabilities() {
      const base = defaultCapabilities("xero");
      return { ...base, multiCurrency: { enabled: Boolean(profile?.multiCurrencyEnabled) }, scopes: { granted: Array.isArray(scopes) ? scopes : [], level: scopeLevel } };
    },
    async getCompanyProfile() {
      const client = await clientFor();
      const org = await client.organisation();
      const currencies = await client.currencies().catch(() => []);
      return normalize.normalizeCompanyProfile(org, { currencies });
    },
    async getAccounts(cursor) {
      const client = await clientFor();
      return pageOf((await client.accounts()).map(normalize.normalizeAccount), cursor);
    },
    async getTaxCodes(cursor) {
      const client = await clientFor();
      const codes = (await client.taxRates()).map(normalize.normalizeTaxRate);
      const page = pageOf(codes, cursor);
      return { ...page, rates: codes.map((code) => ({ externalId: code.externalId, name: code.name, rateValue: code.effectiveSalesRate, active: code.active })) };
    },
    async getCustomers(cursor) {
      const all = await contacts();
      return pageOf(all.filter((row) => row.isCustomer || !row.isSupplier).map(normalize.asCustomer), cursor);
    },
    async getVendors(cursor) {
      const all = await contacts();
      return pageOf(all.filter((row) => row.isSupplier).map(normalize.asVendor), cursor);
    },
    async getItems(cursor) {
      const client = await clientFor();
      return pageOf((await client.items()).map(normalize.normalizeItem), cursor);
    },
    async previewPosting() { return notAvailable(); },
    async postDocument() { return notAvailable(); },
    async fetchEntity({ entityType, externalId }) {
      const resource = normalize.RESOURCE_OF[entityType];
      if (!resource) {
        const error = new Error(`xero_entity_unknown_${entityType}`);
        error.errorClass = "validation";
        throw error;
      }
      const client = await clientFor();
      let raw = null;
      try {
        raw = await client.read(resource, externalId);
      } catch (error) {
        if (error?.errorClass === "not_found") raw = null;
        else throw error;
      }
      const deleted = !raw || normalize.isDeleted(raw);
      return { entityType, externalId: String(externalId), raw, snapshot: raw ? normalize.snapshotOf(entityType, raw) : null, deleted };
    },
    // cursor = { entities?: string[], changedSince: ISO } → every row Xero
    // reports as modified since then (If-Modified-Since), voided/deleted rows
    // flagged. A resource the granted scopes do not cover is skipped and named,
    // never guessed.
    async reconcile(cursor) {
      const client = await clientFor();
      const entities = Array.isArray(cursor?.entities) && cursor.entities.length ? cursor.entities : normalize.INCREMENTAL_ENTITIES;
      const changes = [];
      const skipped = [];
      for (const entity of entities) {
        const resource = normalize.RESOURCE_OF[entity];
        if (!resource) { skipped.push({ entity, reason: "unknown_entity" }); continue; }
        let rows = [];
        try {
          rows = await client.getAll(resource, { ifModifiedSince: cursor?.changedSince || "" });
        } catch (error) {
          if (error?.errorClass === "permission") { skipped.push({ entity, reason: error.scopeProblem ? "scope" : "permission" }); continue; }
          throw error;
        }
        for (const row of rows) {
          const deleted = normalize.isDeleted(row);
          changes.push({ entityType: entity, externalId: normalize.idOf(entity, row), deleted, raw: row, snapshot: deleted ? null : normalize.snapshotOf(entity, row) });
        }
      }
      return { changes, skipped };
    }
  };
  return assertAdapter(adapter, "xero");
}

module.exports = { createXeroAdapter };
