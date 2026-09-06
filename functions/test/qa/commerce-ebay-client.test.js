// The eBay Fulfillment client, pinned to the getOrders reference (design §1):
// the lastmodifieddate filter with millisecond UTC timestamps, TAX_BREAKDOWN on
// every read, limit 200 and offset, `next` pagination, ids in batches of 50,
// 404 → null, one refresh on a 401, 429 as a transient with Retry-After, quota
// charged BEFORE the call — and no eBay path spelled anywhere else.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { createEbayClient, isoMs, dateFilter, MAX_PAGE_SIZE, MAX_IDS_PER_CALL } = require("../../commerce/ebay/client");
let failures = 0;
function check(name, fn) { return Promise.resolve().then(fn).then(() => console.log("PASS ", name)).catch((error) => { failures += 1; console.log("FAIL ", name, "-", String(error.message).replace(/\s+/g, " ").slice(0, 300)); }); }
function fakeFetch(handler) { const calls = []; const impl = async (url, init) => { calls.push({ url: String(url), init }); return handler(String(url), init, calls.length); }; impl.calls = calls; return impl; }
const jsonResponse = (status, body, headers = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body, headers: { get: (k) => headers[k.toLowerCase()] || null } });

(async () => {
  await check("timestamps are ISO 8601 UTC with milliseconds and Z, and the filter is lastmodifieddate:[from..to]", () => {
    assert.strictEqual(isoMs(Date.UTC(2026, 8, 2, 9, 0, 0, 0)), "2026-09-02T09:00:00.000Z");
    assert.strictEqual(dateFilter("lastmodifieddate", Date.UTC(2026, 8, 2, 9), Date.UTC(2026, 8, 2, 10)), "lastmodifieddate:[2026-09-02T09:00:00.000Z..2026-09-02T10:00:00.000Z]");
    assert.throws(() => isoMs("not a date"), /invalid_timestamp/);
  });

  await check("getOrders asks for the window with TAX_BREAKDOWN, limit 200 and the offset; a bigger limit is capped", async () => {
    const fetchImpl = fakeFetch(() => jsonResponse(200, { orders: [{ orderId: "1" }], total: 1, limit: 200, offset: 0 }));
    const client = createEbayClient({ environment: "sandbox", accessToken: "at", fetchImpl });
    const page = await client.getOrders({ lastModifiedFromMs: Date.UTC(2026, 8, 2, 9), lastModifiedToMs: Date.UTC(2026, 8, 2, 10), limit: 999, offset: 400 });
    const url = new URL(fetchImpl.calls[0].url);
    assert.strictEqual(url.origin, "https://api.sandbox.ebay.com");
    assert.strictEqual(url.pathname, "/sell/fulfillment/v1/order");
    assert.strictEqual(url.searchParams.get("filter"), "lastmodifieddate:[2026-09-02T09:00:00.000Z..2026-09-02T10:00:00.000Z]");
    assert.strictEqual(url.searchParams.get("fieldGroups"), "TAX_BREAKDOWN", "without it every order is tax_responsibility_unknown");
    assert.strictEqual(url.searchParams.get("limit"), String(MAX_PAGE_SIZE));
    assert.strictEqual(url.searchParams.get("offset"), "400");
    assert.strictEqual(fetchImpl.calls[0].init.headers.Authorization, "Bearer at");
    assert.deepStrictEqual(page.orders, [{ orderId: "1" }]); assert.strictEqual(page.next, null);
    const production = createEbayClient({ environment: "production", accessToken: "at", fetchImpl });
    await production.getOrders({ creationFromMs: Date.UTC(2026, 8, 1), creationToMs: Date.UTC(2026, 8, 8) });
    const url2 = new URL(fetchImpl.calls[1].url);
    assert.strictEqual(url2.origin, "https://api.ebay.com");
    assert.ok(url2.searchParams.get("filter").startsWith("creationdate:["), "the backfill filters by creation date");
  });

  await check("`next` says there is another page; without it the page is the last", async () => {
    const fetchImpl = fakeFetch((url) => jsonResponse(200, { orders: [{ orderId: "1" }], total: 3, limit: 1, offset: 0, next: "https://api.sandbox.ebay.com/sell/fulfillment/v1/order?limit=1&offset=1" }));
    const client = createEbayClient({ environment: "sandbox", accessToken: "at", fetchImpl });
    const page = await client.getOrders({ lastModifiedFromMs: 0, lastModifiedToMs: 1000 });
    assert.ok(page.next); assert.strictEqual(page.total, 3);
  });

  await check("getOrdersByIds chunks at 50 per call and joins the pages", async () => {
    const fetchImpl = fakeFetch((url) => { const ids = new URL(url).searchParams.get("orderIds").split(","); return jsonResponse(200, { orders: ids.map((id) => ({ orderId: id })) }); });
    const client = createEbayClient({ environment: "sandbox", accessToken: "at", fetchImpl });
    const ids = Array.from({ length: 120 }, (_, i) => `o${i}`);
    const orders = await client.getOrdersByIds([...ids, "o1", ""]);
    assert.strictEqual(fetchImpl.calls.length, 3, `${MAX_IDS_PER_CALL} per call`);
    assert.strictEqual(new URL(fetchImpl.calls[0].url).searchParams.get("orderIds").split(",").length, 50);
    assert.strictEqual(orders.length, 120, "duplicates and blanks dropped");
    assert.strictEqual(new URL(fetchImpl.calls[0].url).searchParams.get("fieldGroups"), "TAX_BREAKDOWN");
  });

  await check("getOrder answers null on a 404 and the order otherwise; fulfilments are the list or [] on a 404", async () => {
    const fetchImpl = fakeFetch((url) => (url.includes("/order/gone") ? jsonResponse(404, { errors: [{ errorId: 32100, message: "Order not found" }] }) : url.includes("shipping_fulfillment") ? jsonResponse(200, { fulfillments: [{ fulfillmentId: "f1" }] }) : jsonResponse(200, { orderId: "here" })));
    const client = createEbayClient({ environment: "sandbox", accessToken: "at", fetchImpl });
    assert.strictEqual(await client.getOrder("gone"), null);
    assert.deepStrictEqual(await client.getOrder("here"), { orderId: "here" });
    assert.strictEqual(new URL(fetchImpl.calls[1].url).pathname, "/sell/fulfillment/v1/order/here");
    assert.deepStrictEqual(await client.getShippingFulfillments("here"), [{ fulfillmentId: "f1" }]);
    assert.strictEqual(new URL(fetchImpl.calls[2].url).pathname, "/sell/fulfillment/v1/order/here/shipping_fulfillment");
  });

  await check("a 401 triggers one refresh through onUnauthorized and the same call again; a second 401 is thrown as auth", async () => {
    let refreshed = 0;
    const fetchImpl = fakeFetch((url, init) => (init.headers.Authorization === "Bearer fresh" ? jsonResponse(200, { orders: [] }) : jsonResponse(401, { errors: [{ errorId: 1001 }] })));
    const client = createEbayClient({ environment: "sandbox", accessToken: "stale", fetchImpl, onUnauthorized: async () => { refreshed += 1; return "fresh"; } });
    await client.getOrders({ lastModifiedFromMs: 0, lastModifiedToMs: 1 });
    assert.strictEqual(refreshed, 1); assert.strictEqual(fetchImpl.calls.length, 2);
    const stubborn = createEbayClient({ environment: "sandbox", accessToken: "stale", fetchImpl: fakeFetch(() => jsonResponse(401, {})), onUnauthorized: async () => "still-bad" });
    await assert.rejects(stubborn.getOrders({ lastModifiedFromMs: 0, lastModifiedToMs: 1 }), (e) => e.status === 401 && e.errorClass === "auth");
  });

  await check("a 429 is transient and carries Retry-After; a 403 is permission; a 500 is transient", async () => {
    const limited = createEbayClient({ environment: "sandbox", accessToken: "at", fetchImpl: fakeFetch(() => jsonResponse(429, { errors: [{ errorId: 1050 }] }, { "retry-after": "120" })) });
    await assert.rejects(limited.getOrders({ lastModifiedFromMs: 0, lastModifiedToMs: 1 }), (e) => e.status === 429 && e.errorClass === "transient" && e.retryAfter === "120");
    const forbidden = createEbayClient({ environment: "sandbox", accessToken: "at", fetchImpl: fakeFetch(() => jsonResponse(403, {})) });
    await assert.rejects(forbidden.getOrders({ lastModifiedFromMs: 0, lastModifiedToMs: 1 }), (e) => e.errorClass === "permission");
    const down = createEbayClient({ environment: "sandbox", accessToken: "at", fetchImpl: fakeFetch(() => jsonResponse(503, {})) });
    await assert.rejects(down.getOrders({ lastModifiedFromMs: 0, lastModifiedToMs: 1 }), (e) => e.errorClass === "transient");
    const offline = createEbayClient({ environment: "sandbox", accessToken: "at", fetchImpl: async () => { throw new Error("ECONNRESET"); } });
    await assert.rejects(offline.getOrders({ lastModifiedFromMs: 0, lastModifiedToMs: 1 }), (e) => e.errorClass === "transient" && e.status === 0);
  });

  await check("quota is charged before the request, by family, and a refusal stops the call from being made", async () => {
    const charges = [];
    const fetchImpl = fakeFetch(() => jsonResponse(200, { orders: [], fulfillments: [] }));
    const client = createEbayClient({ environment: "sandbox", accessToken: "at", fetchImpl, quota: { charge: async ({ family }) => { charges.push(family); if (family === "fulfillments") { const e = new Error("ebay_quota_connection_share_spent"); e.code = "rate_limited"; throw e; } } } });
    await client.getOrders({ lastModifiedFromMs: 0, lastModifiedToMs: 1 });
    assert.deepStrictEqual(charges, ["orders"]);
    await assert.rejects(client.getShippingFulfillments("x"), /connection_share_spent/);
    assert.strictEqual(fetchImpl.calls.length, 1, "the refused call never reached eBay");
  });

  await check("the public key lookup uses the notification family and answers null for a kid eBay does not know", async () => {
    const fetchImpl = fakeFetch((url) => (url.endsWith("/known") ? jsonResponse(200, { key: "-----BEGIN PUBLIC KEY-----abc-----END PUBLIC KEY-----", algorithm: "ECDSA", digest: "SHA1" }) : jsonResponse(404, {})));
    const client = createEbayClient({ environment: "production", accessToken: "app-token", fetchImpl });
    assert.deepStrictEqual(await client.publicKey("known"), { key: "-----BEGIN PUBLIC KEY-----abc-----END PUBLIC KEY-----", algorithm: "ECDSA", digest: "SHA1" });
    assert.strictEqual(new URL(fetchImpl.calls[0].url).pathname, "/commerce/notification/v1/public_key/known");
    assert.strictEqual(await client.publicKey("unknown"), null);
  });

  await check("no eBay URL or API path is spelled outside commerce/ebay/ (§9 layering)", () => {
    const root = path.join(__dirname, "..", "..");
    const offenders = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (["node_modules", "test", ".git"].includes(entry.name) || entry.name.startsWith(".")) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { if (full.endsWith(path.join("commerce", "ebay"))) continue; walk(full); continue; }
        if (!entry.name.endsWith(".js")) continue;
        const body = fs.readFileSync(full, "utf8");
        if (/api(?:z)?\.(?:sandbox\.)?ebay\.com|\/sell\/fulfillment\/v1|\/identity\/v1\/oauth2|\/commerce\/notification\/v1|auth\.(?:sandbox\.)?ebay\.com/.test(body)) offenders.push(path.relative(root, full));
      }
    };
    walk(root);
    assert.deepStrictEqual(offenders, [], "an eBay path leaked out of commerce/ebay/");
  });

  if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
  console.log("\n✅ COMMERCE EBAY CLIENT GEÇTİ");
})();
