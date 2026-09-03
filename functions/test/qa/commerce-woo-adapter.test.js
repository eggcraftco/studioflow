// Faz 4 slice 1 — WooCommerce, pure: the adapter against two fixture shapes
// (WOO-015), the raw-body signature (WOO-005/006), the site URL rules (WOO-003)
// and the REST client's paging and error classes with a fake fetch.
const assert = require("assert");
const crypto = require("crypto");
const { normalizeWooOrder, wooGmtIso } = require("../../commerce/adapters/woocommerce");
const { verifyWooSignature, expectedSignature } = require("../../commerce/woo/signature");
const { normalizeWooSiteUrl, isPrivateAddress, wooAuthorizeUrl } = require("../../commerce/woo/url");
const { createWooClient, WooApiError } = require("../../commerce/woo/client");
const { validateEnvelope, contentHash } = require("../../commerce/envelope");
const { classifyError } = require("../../commerce/events");
const projection = require("../../commerce/envelopeToOrder");
let failures = 0;
function check(name, fn) { return Promise.resolve().then(fn).then(() => console.log("PASS ", name), (error) => { failures += 1; console.log("FAIL ", name, "-", String(error.message).replace(/\s+/g, " ").slice(0, 260)); }); }

const wooOrder = (extra = {}) => ({
  id: 8801, number: "8801", status: "processing", currency: "GBP", total: "113.00", total_tax: "18.00", shipping_total: "5.00", discount_total: "10.00",
  date_created: "2026-09-02T10:00:00", date_created_gmt: "2026-09-02T09:00:00", date_modified_gmt: "2026-09-02T09:30:00", date_paid_gmt: "2026-09-02T09:05:00",
  customer_id: 42, customer_note: "engrave AL", payment_method: "stripe", payment_method_title: "Card (Stripe)", transaction_id: "pi_123", created_via: "checkout",
  billing: { first_name: "Ada", last_name: "Lovelace", company: "", address_1: "10 Analytical Way", address_2: "Flat 3", city: "London", state: "", postcode: "N1 1AA", country: "GB", email: "Ada@Example.com", phone: "+44 7700 900000" },
  shipping: { first_name: "Ada", last_name: "Lovelace", address_1: "10 Analytical Way", city: "London", postcode: "N1 1AA", country: "GB" },
  line_items: [
    { id: 1, name: "Signet ring", product_id: 55, variation_id: 0, quantity: 1, sku: "RING-1", subtotal: "90.00", total: "80.00", total_tax: "16.00", meta_data: [{ key: "engraving", value: "AL", display_key: "Engraving", display_value: "AL" }, { key: "_hidden", value: "x" }] },
    { id: 2, name: "Band", product_id: 56, variation_id: 561, quantity: 2, subtotal: "10.00", total: "10.00", total_tax: "2.00", meta_data: [] }
  ],
  meta_data: [{ key: "studioflow_delivery_days", value: "12" }, { key: "designName", value: "Ada's signet" }],
  refunds: [], ...extra
});
const ctx = { connectionId: "c1_shop.example.com", siteUrl: "https://shop.example.com", storeName: "Ada's Woo", eventOrigin: "provider" };

(async () => {
  await check("a wc/v3 order becomes a valid envelope with Woo's money, dates, status and meta resolved", () => {
    const env = normalizeWooOrder(wooOrder(), ctx);
    assert.deepStrictEqual(validateEnvelope(env), []);
    assert.strictEqual(env.identity.provider, "woocommerce"); assert.strictEqual(env.identity.external_id, "8801");
    assert.strictEqual(env.identity.external_updated_at, "2026-09-02T09:30:00.000Z", "GMT without a zone is read as UTC");
    assert.strictEqual(env.order.placed_at, "2026-09-02T09:05:00.000Z", "paid time first, as the legacy mapper did");
    assert.strictEqual(env.order.grand_total, "113.00"); assert.strictEqual(env.order.tax_total, "18.00"); assert.strictEqual(env.order.shipping_total, "5.00"); assert.strictEqual(env.order.subtotal, "100.00");
    assert.strictEqual(env.order.payment_status, "paid"); assert.strictEqual(env.order.platform_status, "processing"); assert.strictEqual(env.order.fulfillment_status, "unfulfilled");
    assert.strictEqual(env.order.buyer_note, "engrave AL");
    assert.strictEqual(env.customer.email, "ada@example.com"); assert.strictEqual(env.customer.external_customer_id, "42"); assert.strictEqual(env.customer.name, "Ada Lovelace");
    assert.strictEqual(env.customer.billing_address.street, "10 Analytical Way, Flat 3"); assert.strictEqual(env.customer.billing_address.postalCode, "N1 1AA");
    assert.strictEqual(env.order.line_items[0].line_total, "96.00", "line total includes its tax, as the legacy mapper did");
    assert.strictEqual(env.order.line_items[0].unit_price, "96.00"); assert.strictEqual(env.order.line_items[1].unit_price, "6.00");
    assert.deepStrictEqual(env.order.line_items[0].properties, [{ name: "Engraving", value: "AL" }], "hidden meta stays hidden");
    assert.strictEqual(env.order.line_items[1].product_external_id, "56:561", "variation kept for inventory mapping (WOO-012)");
    assert.strictEqual(env.payments[0].external_id, "pi_123"); assert.strictEqual(env.payments[0].amount, "113.00");
    assert.strictEqual(env.source.provider_metadata.delivery_days, 12); assert.strictEqual(env.source.provider_metadata.design_name, "Ada's signet");
    assert.strictEqual(env.source.external_admin_url, "https://shop.example.com/wp-admin/post.php?post=8801&action=edit");
  });
  await check("status words map to canonical payment states; unpaid, cancelled and refunded are visible", () => {
    assert.strictEqual(normalizeWooOrder(wooOrder({ status: "pending", date_paid_gmt: null, transaction_id: "" }), ctx).order.payment_status, "pending");
    assert.strictEqual(normalizeWooOrder(wooOrder({ status: "on-hold" }), ctx).order.payment_status, "pending");
    const cancelled = normalizeWooOrder(wooOrder({ status: "cancelled" }), ctx);
    assert.strictEqual(cancelled.order.platform_status, "cancelled"); assert.strictEqual(cancelled.order.cancelled_at, "2026-09-02T09:30:00.000Z");
    const refunded = normalizeWooOrder(wooOrder({ status: "refunded", refunds: [{ id: 9, total: "-20.00", reason: "chipped" }] }), ctx);
    assert.strictEqual(refunded.order.payment_status, "refunded"); assert.strictEqual(refunded.refunds[0].amount, "20.00");
    const completed = normalizeWooOrder(wooOrder({ status: "completed" }), ctx);
    assert.strictEqual(completed.order.fulfillment_status, "fulfilled");
    const tracked = normalizeWooOrder(wooOrder({ meta_data: [{ key: "_wc_shipment_tracking_items", value: [{ tracking_id: "t1", tracking_provider: "Royal Mail", tracking_number: "RM77", date_shipped: 1788307200 }] }] }), ctx);
    assert.strictEqual(tracked.shipments[0].tracking_number, "RM77"); assert.strictEqual(tracked.order.fulfillment_status, "fulfilled");
  });
  await check("the projection writes the legacy WooCommerce document: keys, summary, delivery days, design name", () => {
    const env = normalizeWooOrder(wooOrder(), ctx);
    const doc = projection.shopOwnedFields(env, { companyId: "c1" });
    assert.strictEqual(doc.customFields["WooCommerce Order ID"], "8801"); assert.strictEqual(doc.customFields["WooCommerce Products"], "Signet ring x1, Band x2");
    assert.strictEqual(doc.customFields["WooCommerce Total"], "113.00"); assert.strictEqual(doc.customFields.Source, "WooCommerce");
    assert.strictEqual(doc.customFields.communicationAddress, "10 Analytical Way, Flat 3, London, N1 1AA, GB");
    assert.strictEqual(doc.designName, "Ada's signet"); assert.strictEqual(doc.paymentMethod, "Card (Stripe)"); assert.strictEqual(doc.paidAmount, 113);
    assert.deepStrictEqual(doc.communication, ["WooCommerce"]);
    const sparse = normalizeWooOrder({ id: 1, status: "processing", total: "9.00", currency: "GBP", line_items: [{ name: "Thing", quantity: 1, total: "9.00", total_tax: "0" }], billing: {} }, ctx);
    assert.strictEqual(projection.shopOwnedFields(sparse, { companyId: "c1" }).customerName, "WooCommerce Customer");
    assert.strictEqual(contentHash(env), contentHash(normalizeWooOrder(wooOrder(), { ...ctx, rawSnapshotRef: "x" })));
  });
  await check("the signature is base64 HMAC-SHA256 over the raw bytes, and a wrong one is refused whatever the URL says (WOO-005/006)", () => {
    const raw = Buffer.from(JSON.stringify({ id: 1, total: "9.00" }));
    const secret = "wh_secret_123";
    const good = expectedSignature(raw, secret);
    assert.strictEqual(good, crypto.createHmac("sha256", secret).update(raw).digest("base64"));
    assert.strictEqual(verifyWooSignature(raw, good, secret), true);
    assert.strictEqual(verifyWooSignature(Buffer.from(JSON.stringify({ id: 1, total: "9.00" }, null, 2)), good, secret), false, "different bytes, same JSON → refused");
    assert.strictEqual(verifyWooSignature(raw, good, "other"), false);
    assert.strictEqual(verifyWooSignature(raw, "", secret), false);
    assert.strictEqual(verifyWooSignature(raw, good.slice(0, -2) + "==", secret), false);
  });
  await check("a store URL is normalised and anything private, plain-http or credentialed is refused (WOO-003)", () => {
    assert.deepStrictEqual(normalizeWooSiteUrl("Shop.Example.com/wp-json/"), { ok: true, siteUrl: "https://shop.example.com", host: "shop.example.com" });
    assert.strictEqual(normalizeWooSiteUrl("https://shop.example.com/store/").siteUrl, "https://shop.example.com/store");
    assert.strictEqual(normalizeWooSiteUrl("http://shop.example.com").reason, "not_https");
    assert.strictEqual(normalizeWooSiteUrl("https://user:pw@shop.example.com").reason, "credentials_in_url");
    assert.strictEqual(normalizeWooSiteUrl("https://192.168.1.10").reason, "private_ip");
    assert.strictEqual(normalizeWooSiteUrl("https://8.8.8.8").reason, "ip_literal");
    assert.strictEqual(normalizeWooSiteUrl("https://localhost").reason, "private_host");
    assert.strictEqual(normalizeWooSiteUrl("https://intranet").reason, "not_a_domain");
    assert.strictEqual(normalizeWooSiteUrl("https://shop.example.com:8443").reason, "port");
    assert.strictEqual(isPrivateAddress("10.0.0.5"), true); assert.strictEqual(isPrivateAddress("::ffff:192.168.0.1"), true); assert.strictEqual(isPrivateAddress("93.184.216.34"), false);
    const url = new URL(wooAuthorizeUrl("https://shop.example.com", { appName: "NivaDesk", userId: "c1", returnUrl: "https://nivadesk.app/settings", callbackUrl: "https://x.cloudfunctions.net/wooAuthCallback" }));
    assert.strictEqual(url.pathname, "/wc-auth/v1/authorize"); assert.strictEqual(url.searchParams.get("scope"), "read_write"); assert.strictEqual(url.searchParams.get("user_id"), "c1");
  });
  await check("the client pages through orders, never follows a redirect, and its errors carry the status the retry policy reads", async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, init });
      const u = new URL(url);
      if (u.pathname.endsWith("/orders") && u.searchParams.get("page") === "1") return { ok: true, status: 200, headers: { get: (h) => (h === "x-wp-totalpages" ? "2" : null) }, json: async () => [wooOrder()] };
      if (u.pathname.endsWith("/orders") && u.searchParams.get("page") === "2") return { ok: true, status: 200, headers: { get: (h) => (h === "x-wp-totalpages" ? "2" : null) }, json: async () => [wooOrder({ id: 8802 })] };
      if (u.pathname.endsWith("/orders/404")) return { ok: false, status: 404, headers: { get: () => null }, json: async () => ({ code: "woocommerce_rest_shop_order_invalid_id" }) };
      if (u.pathname.endsWith("/orders/429")) return { ok: false, status: 429, headers: { get: (h) => (h === "retry-after" ? "30" : null) }, json: async () => ({}) };
      if (u.pathname.endsWith("/orders/301")) return { ok: false, status: 301, headers: { get: () => null }, json: async () => ({}) };
      if (u.pathname.endsWith("/webhooks") && init.method === "POST") return { ok: true, status: 201, headers: { get: () => null }, json: async () => ({ id: 77, ...JSON.parse(init.body) }) };
      return { ok: false, status: 500, headers: { get: () => null }, json: async () => ({}) };
    };
    // checkHost is injected here for the same reason fetchImpl is: this suite
    // drives the client without a store, and shop.example.com does not resolve.
    // The guard itself is exercised below, on its own.
    const client = createWooClient({ siteUrl: "https://shop.example.com/", consumerKey: "ck_x", consumerSecret: "cs_y", fetchImpl, checkHost: async () => {} });
    const p1 = await client.listOrders({ modifiedAfterIso: "2026-09-02T00:00:00Z", page: 1 });
    assert.strictEqual(p1.orders.length, 1); assert.strictEqual(p1.totalPages, 2);
    const p2 = await client.listOrders({ modifiedAfterIso: "2026-09-02T00:00:00Z", page: 2 });
    assert.strictEqual(String(p2.orders[0].id), "8802");
    assert.ok(calls[0].url.startsWith("https://shop.example.com/wp-json/wc/v3/orders?"), calls[0].url);
    assert.ok(calls[0].url.includes("modified_after=2026-09-02T00%3A00%3A00Z") && calls[0].url.includes("orderby=modified"));
    assert.strictEqual(calls[0].init.headers.Authorization, "Basic " + Buffer.from("ck_x:cs_y").toString("base64"));
    assert.strictEqual(calls[0].init.redirect, "manual");
    assert.strictEqual(await client.getOrder("404"), null, "a deleted order is null, not an error");
    await assert.rejects(client.getOrder("429"), (e) => e instanceof WooApiError && e.status === 429 && e.retryAfter === "30" && classifyError(e) === "transient");
    await assert.rejects(client.getOrder("301"), (e) => e.message === "woo_redirected");
    await assert.rejects(client.getOrder("500x"), (e) => classifyError(e) === "transient");
    const hook = await client.createWebhook({ name: "NivaDesk orders", topic: "order.updated", deliveryUrl: "https://x/hook", secret: "s" });
    assert.strictEqual(hook.id, 77); assert.strictEqual(hook.topic, "order.updated"); assert.strictEqual(hook.status, "active");
  });
  {
  // WOO-003, the half that was missing: the URL is checked when the merchant
  // types it and DNS is checked once, at connect. Neither runs again — so a
  // store domain later repointed at 10.x, at 127.0.0.1 or at the cloud
  // metadata service went on receiving authenticated requests from the
  // fifteen-minute reconcile job, with our credentials, for as long as the
  // connection lived.
  const { assertPublicHost } = require("../../commerce/woo/client");
  let checked = 0;
  // The REAL guard, with only the resolver stubbed. An earlier version of this
  // stubbed checkHost itself and so tested the test: narrowing the guard to the
  // first address only sailed through it.
  const guarded = (addresses) => createWooClient({
    siteUrl: "https://shop.example.com/", consumerKey: "ck", consumerSecret: "cs",
    fetchImpl: async () => { throw new Error("the request must never be made"); },
    checkHost: (host) => {
      checked += 1;
      return assertPublicHost(host, async () => addresses.map((address) => ({ address, family: 4 })));
    }
  });

  await assert.rejects(
    guarded(["10.0.0.7"]).getOrder("1"),
    (e) => e instanceof WooApiError && e.message === "woo_private_address",
    "a store now pointing at a private address must be refused"
  );
  await assert.rejects(
    guarded(["169.254.169.254"]).getOrder("1"),
    (e) => e.message === "woo_private_address",
    "and at the cloud metadata service"
  );
  await assert.rejects(
    guarded(["93.184.216.34", "127.0.0.1"]).getOrder("1"),
    (e) => e.message === "woo_private_address",
    "one public answer does not make a mixed result safe"
  );

  // And the real resolver refuses a name that does not resolve at all, rather
  // than letting the request through.
  await assert.rejects(
    assertPublicHost("no-such-host.invalid", async () => { throw new Error("ENOTFOUND"); }),
    (e) => /woo_dns_failed/.test(e.message)
  );
  await assert.rejects(
    assertPublicHost("empty.example", async () => []),
    (e) => /woo_dns_failed/.test(e.message),
    "a name that resolves to nothing is not a reason to proceed"
  );
  await assert.rejects(assertPublicHost(""), (e) => e.message === "woo_private_address");

  assert.ok(checked >= 3, "the guard runs on every request, not once at connect");
  console.log("PASS  a store repointed at a private address is refused on every request");
}

console.log(failures === 0 ? "\n✅ COMMERCE WOO ADAPTER GEÇTİ" : `\n❌ ${failures} BAŞARISIZ`);
  process.exit(failures === 0 ? 0 : 1);
})();
