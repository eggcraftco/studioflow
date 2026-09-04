// What NivaDesk actually asks Amazon for.
//
// The request is where phase A1's promises are either kept or quietly broken.
// A connector can hold a perfect sanitizer and still ask for the buyer's name,
// and then the only thing standing between a marketplace's data and an order
// document is a list of field names somebody maintained by hand.
//
// Better not to be sent it.
const assert = require("assert");
const { createAmazonClient, AmazonApiError, ORDERS_API_VERSION } = require("../src/amazon/client");
const oauth = require("../src/amazon/oauth");
const sanitize = require("../src/amazon/sanitize");

let failures = 0;
const checks = [];
const check = (name, run) => checks.push({ name, run });

function recorder(response = { payload: {} }, { status = 200, headers = {} } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (k) => headers[String(k).toLowerCase()] ?? null },
      json: async () => response
    };
  };
  return { calls, fetchImpl };
}

const GB = "A1F83G8C2ARO7P";
const run = (fn) => { let out, err; fn().then((v) => { out = v; }, (e) => { err = e; }); return () => ({ out, err }); };

check("orders come from v2026-01-01, not v0", () => {
  // v0 is what most code and most training data know, it still answers, and it
  // fails acceptance. The version is in the path, so this is checkable.
  assert.strictEqual(ORDERS_API_VERSION, "2026-01-01");
  const { calls, fetchImpl } = recorder({ payload: { orders: [] } });
  const client = createAmazonClient({ marketplaceId: GB, accessToken: "Atza|x", fetchImpl });
  return client.searchOrders({ marketplaceIds: [GB] }).then(() => {
    assert.ok(calls[0].url.includes("/orders/2026-01-01/orders"), `wrong path: ${calls[0].url}`);
    assert.ok(!/\/orders\/v0\//.test(calls[0].url), "the deprecated v0 Orders API is being called");
  });
});

check("the request never asks for a buyer or a recipient", () => {
  const { calls, fetchImpl } = recorder({ payload: { orders: [] } });
  const client = createAmazonClient({ marketplaceId: GB, accessToken: "Atza|x", fetchImpl });
  return client.searchOrders({ marketplaceIds: [GB] })
    .then(() => client.getOrder("203-1"))
    .then(() => {
      for (const call of calls) {
        const included = new URL(call.url).searchParams.get("includedData") || "";
        assert.ok(!/BUYER/.test(included), `a request asked for the buyer: ${call.url}`);
        assert.ok(!/RECIPIENT/.test(included), `a request asked for the recipient: ${call.url}`);
        assert.ok(!/\bTAX\b/.test(included), `a request asked for the tax dataset before it was reviewed: ${call.url}`);
      }
      // And the default really is the phase's list rather than "whatever was passed".
      const included = new URL(calls[0].url).searchParams.get("includedData").split(",");
      assert.deepStrictEqual(included, [...sanitize.INCLUDED_DATA_A1]);
    });
});

check("marketplace discovery asks Amazon rather than the seller", () => {
  const { calls, fetchImpl } = recorder({
    payload: [
      { marketplace: { id: GB, countryCode: "GB", defaultCurrencyCode: "GBP", name: "Amazon.co.uk" }, participation: { isParticipating: true, hasSuspendedListings: false } },
      { marketplace: { id: "A1PA6795UKMFR9", countryCode: "DE", defaultCurrencyCode: "EUR", name: "Amazon.de" }, participation: { isParticipating: false } },
      { marketplace: {}, participation: { isParticipating: true } }
    ]
  });
  const client = createAmazonClient({ marketplaceId: GB, accessToken: "Atza|x", fetchImpl });
  return client.getMarketplaceParticipations().then((rows) => {
    assert.ok(calls[0].url.endsWith("/sellers/v1/marketplaceParticipations"), `wrong path: ${calls[0].url}`);
    assert.strictEqual(rows.length, 2, "a marketplace with no id was kept");
    assert.deepStrictEqual(rows[0], {
      marketplaceId: GB, countryCode: "GB", currencyCode: "GBP", name: "Amazon.co.uk",
      participating: true, hasSuspendedListings: false
    });
    // Not participating is a fact the connection needs, not a row to drop:
    // a seller who has registered for Germany but not started is a different
    // state from one who has never heard of it.
    assert.strictEqual(rows[1].participating, false);
  });
});

check("the regional host follows the marketplace, because the wrong one is a 403", () => {
  const eu = createAmazonClient({ marketplaceId: GB, accessToken: "x" });
  const na = createAmazonClient({ marketplaceId: "ATVPDKIKX0DER", accessToken: "x" });
  const fe = createAmazonClient({ marketplaceId: "A1VC38T7YXB528", accessToken: "x" });
  assert.ok(eu.host.includes("-eu."), eu.host);
  assert.ok(na.host.includes("-na."), na.host);
  assert.ok(fe.host.includes("-fe."), fe.host);
  // An unknown marketplace falls back to the declared region rather than
  // guessing, and to EU rather than to undefined.
  assert.ok(createAmazonClient({ marketplaceId: "NOPE", region: "na", accessToken: "x" }).host.includes("-na."));
  assert.ok(createAmazonClient({ accessToken: "x" }).host.includes("-eu."));
});

check("the access token travels in Amazon's header, not as a bearer", () => {
  const { calls, fetchImpl } = recorder({ payload: { orders: [] } });
  const client = createAmazonClient({ marketplaceId: GB, accessToken: "Atza|secret", fetchImpl });
  return client.searchOrders({ marketplaceIds: [GB] }).then(() => {
    assert.strictEqual(calls[0].init.headers["x-amz-access-token"], "Atza|secret");
    assert.strictEqual(calls[0].init.headers.Authorization, undefined,
      "the token is being sent as a bearer, which SP-API ignores");
    assert.strictEqual(calls[0].init.redirect, "manual", "a redirect could send the token somewhere else");
  });
});

check("a continuation sends the token and nothing else", () => {
  // Re-sending the filters alongside nextToken is a 400 from Amazon, and it is
  // the natural thing to write.
  const { calls, fetchImpl } = recorder({ payload: { orders: [], nextToken: null } });
  const client = createAmazonClient({ marketplaceId: GB, accessToken: "x", fetchImpl });
  return client.searchOrders({ marketplaceIds: [GB], nextToken: "T1", lastUpdatedAfter: "2026-09-01T00:00:00Z" }).then(() => {
    const params = new URL(calls[0].url).searchParams;
    assert.strictEqual(params.get("nextToken"), "T1");
    assert.strictEqual(params.get("lastUpdatedAfter"), null, "the filters were re-sent with the continuation token");
    assert.strictEqual(params.get("includedData"), null);
  });
});

check("every failure carries the class the retry policy reads", () => {
  const cases = [
    [401, "auth"], [403, "permission"], [404, "not_found"],
    [429, "transient"], [500, "transient"], [503, "transient"],
    [400, "validation"], [418, "unknown"]
  ];
  for (const [status, expected] of cases) {
    assert.strictEqual(new AmazonApiError("x", status).errorClass, expected, `status ${status}`);
  }
  // 429 is Amazon's entire throttling model. Classifying it as a failure rather
  // than as "come back later" would dead-letter a healthy connection.
  assert.strictEqual(new AmazonApiError("x", 429).errorClass, "transient");
});

check("a 429 keeps Amazon's own retry-after", () => {
  const { fetchImpl } = recorder({ errors: [{ code: "QuotaExceeded" }] }, { status: 429, headers: { "retry-after": "30" } });
  const client = createAmazonClient({ marketplaceId: GB, accessToken: "x", fetchImpl });
  return client.searchOrders({ marketplaceIds: [GB] }).then(
    () => { throw new Error("a 429 was treated as success"); },
    (error) => {
      assert.strictEqual(error.status, 429);
      assert.strictEqual(error.retryAfter, "30");
      assert.strictEqual(error.code, "QuotaExceeded");
      assert.strictEqual(error.errorClass, "transient");
    }
  );
});

check("one 401 buys exactly one refresh and one retry", () => {
  let served = 0;
  let refreshes = 0;
  const fetchImpl = async () => {
    served += 1;
    const unauthorized = served === 1;
    return {
      ok: !unauthorized, status: unauthorized ? 401 : 200,
      headers: { get: () => null },
      json: async () => (unauthorized ? { errors: [{ code: "Unauthorized" }] } : { payload: { orders: [{ AmazonOrderId: "1" }] } })
    };
  };
  const client = createAmazonClient({
    marketplaceId: GB, accessToken: "old", fetchImpl,
    onUnauthorized: async () => { refreshes += 1; return "new"; }
  });
  return client.searchOrders({ marketplaceIds: [GB] }).then((page) => {
    assert.strictEqual(refreshes, 1, "a 401 did not trigger exactly one refresh");
    assert.strictEqual(served, 2, "the call was not retried exactly once");
    assert.strictEqual(page.orders.length, 1);
  });
});

check("a token that stays rejected gives up instead of refreshing in a loop", () => {
  // The retry has to be one-shot. If the retried call is allowed to retry in
  // turn, a genuinely revoked authorization becomes a refresh loop against
  // Amazon — the one call in this file where getting it wrong costs more than a
  // failed sync.
  let served = 0;
  let refreshes = 0;
  const fetchImpl = async () => {
    served += 1;
    // Succeeds eventually, so a looping implementation finishes rather than
    // hanging this suite — and is caught by the refresh count instead.
    const unauthorized = served < 4;
    return {
      ok: !unauthorized, status: unauthorized ? 401 : 200,
      headers: { get: () => null },
      json: async () => (unauthorized ? { errors: [{ code: "Unauthorized" }] } : { payload: { orders: [] } })
    };
  };
  const client = createAmazonClient({
    marketplaceIds: [GB], marketplaceId: GB, accessToken: "old", fetchImpl,
    onUnauthorized: async () => { refreshes += 1; return "still-no-good"; }
  });
  return client.searchOrders({ marketplaceIds: [GB] }).then(
    () => { throw new Error("a still-rejected token was refreshed more than once and eventually succeeded"); },
    (error) => {
      assert.strictEqual(error.status, 401);
      assert.strictEqual(refreshes, 1, `the token was refreshed ${refreshes} times for one call`);
      assert.strictEqual(served, 2, `the call was made ${served} times`);
    }
  );
});

check("consent needs a state, and a draft app says so", () => {
  const url = new URL(oauth.consentUrl({ sellerCentralHost: "sellercentral.amazon.co.uk", applicationId: "amzn1.app.1", state: "s1" }));
  assert.strictEqual(url.searchParams.get("state"), "s1");
  assert.strictEqual(url.searchParams.get("application_id"), "amzn1.app.1");
  assert.strictEqual(url.searchParams.get("version"), null, "a published app sent version=beta, which Amazon refuses");
  const draft = new URL(oauth.consentUrl({ sellerCentralHost: "sellercentral.amazon.co.uk", applicationId: "a", state: "s", draft: true }));
  assert.strictEqual(draft.searchParams.get("version"), "beta");
});

check("an LWA failure never repeats the credential back", () => {
  // Amazon's error_description quotes what you sent. A log line is a place a
  // client secret must never reach.
  const fetchImpl = async () => ({
    ok: false, status: 400, headers: { get: () => null },
    json: async () => ({ error: "invalid_client", error_description: "client_secret amzn1.oa2-cs.v1.SUPERSECRET is wrong" })
  });
  return oauth.accessTokenFromRefresh({ refreshToken: "Atzr|r", clientId: "c", clientSecret: "SUPERSECRET", fetchImpl }).then(
    () => { throw new Error("a rejected credential was treated as success"); },
    (error) => {
      assert.strictEqual(error.code, "invalid_client");
      assert.strictEqual(error.errorClass, "auth", "a rejected credential would be retried forever");
      assert.ok(!/SUPERSECRET/.test(error.message), "the error message repeats the client secret");
      assert.ok(!/SUPERSECRET/.test(String(error.stack || "")), "the stack repeats the client secret");
    }
  );
});

check("consent that returns no refresh token is a failure, not an empty connection", () => {
  const fetchImpl = async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ access_token: "a", expires_in: 3600 }) });
  return oauth.exchangeAuthorizationCode({ code: "c", clientId: "i", clientSecret: "s", fetchImpl }).then(
    () => { throw new Error("a connection was made with no way to refresh it"); },
    (error) => { assert.strictEqual(error.code, "no_refresh_token"); }
  );
});

(async () => {
  for (const { name, run: fn } of checks) {
    try { await fn(); console.log(`PASS  ${name}`); }
    catch (error) { failures += 1; console.log(`FAIL  ${name} - ${error.message}`); }
  }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log("\n✅ AMAZON CLIENT GEÇTİ");
})();
