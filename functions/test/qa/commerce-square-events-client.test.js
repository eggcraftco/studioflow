"use strict";
// The Events API client speaks Square's verbs exactly: EnableEvents is a PUT, SearchEvents a POST.
// (A POST to /v2/events/enable answers 404 NOT_FOUND — and with events never enabled, nothing is searchable.)
const test = require("node:test");
const assert = require("node:assert/strict");
const { createSquareEventsClient } = require("../../commerce/square/client");

function fakeFetch(calls, body = {}) {
  return async (url, init) => {
    calls.push({ url: String(url), method: init?.method, body: init?.body ? JSON.parse(init.body) : null, headers: init?.headers || {} });
    return { ok: true, status: 200, json: async () => body };
  };
}

test("enableEvents is PUT /v2/events/enable on the environment host", async () => {
  const calls = [];
  const client = createSquareEventsClient({ environment: "sandbox", appAccessToken: "app-token", fetchImpl: fakeFetch(calls) });
  await client.enableEvents();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "PUT");
  assert.equal(calls[0].url, "https://connect.squareupsandbox.com/v2/events/enable");
  assert.equal(calls[0].headers.Authorization, "Bearer app-token");
  assert.ok(calls[0].headers["Square-Version"], "the API version pin travels with every call");
});

test("searchEvents is POST /v2/events with the window, merchant and event types in the filter", async () => {
  const calls = [];
  const client = createSquareEventsClient({ environment: "production", appAccessToken: "app-token", fetchImpl: fakeFetch(calls, { events: [{ event_id: "e1" }], cursor: "next" }) });
  const page = await client.searchEvents({ createdAfterIso: "2026-09-01T00:00:00.000Z", createdBeforeIso: "2026-09-02T00:00:00.000Z", merchantId: "M1", eventTypes: ["order.created"], cursor: null });
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].url, "https://connect.squareup.com/v2/events");
  assert.deepEqual(calls[0].body.query.filter, { created_at: { start_at: "2026-09-01T00:00:00.000Z", end_at: "2026-09-02T00:00:00.000Z" }, merchant_ids: ["M1"], event_types: ["order.created"] });
  assert.deepEqual(page, { events: [{ event_id: "e1" }], cursor: "next" });
});

test("a non-2xx answer surfaces the status and Square's error code", async () => {
  const client = createSquareEventsClient({ environment: "sandbox", appAccessToken: "t", fetchImpl: async () => ({ ok: false, status: 404, json: async () => ({ errors: [{ code: "NOT_FOUND" }] }) }) });
  await assert.rejects(client.enableEvents(), /square_events_http_404: NOT_FOUND/);
});
