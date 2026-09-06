// eBay's daily allowance, per connection first and app-wide second (design
// §7.4): a tenth per connection, the sweep stands down at 75 %, the nightly
// pass and the import at 80 %, people are served up to 95 % — and one
// connection's spent share never touches another's.
const assert = require("assert");
const quota = require("../../commerce/ebay/quota");
const { makeFakeFirestore } = require("./helpers/fakeFirestore");
let failures = 0;
function check(name, fn) { return Promise.resolve().then(fn).then(() => console.log("PASS ", name)).catch((error) => { failures += 1; console.log("FAIL ", name, "-", String(error.message).replace(/\s+/g, " ").slice(0, 300)); }); }

(async () => {
  await check("the verdict table, with a 5,000-call day", () => {
    const perDay = 5000;
    assert.deepStrictEqual(quota.quotaVerdict({ total: 0, connection: 0, perDay }), { allowed: true, reason: "", share: 500, ceiling: 4750 });
    assert.strictEqual(quota.quotaVerdict({ total: 10, connection: 500, perDay }).reason, "connection_share_spent", "a tenth per connection");
    assert.strictEqual(quota.quotaVerdict({ total: 4750, connection: 0, perDay, priority: "people" }).reason, "app_budget_spent", "people are served to 95 %");
    assert.strictEqual(quota.quotaVerdict({ total: 4749, connection: 0, perDay, priority: "people" }).allowed, true);
    assert.strictEqual(quota.quotaVerdict({ total: 3750, connection: 0, perDay, priority: "sweep" }).reason, "app_budget_spent", "the sweep stands down at 75 %");
    assert.strictEqual(quota.quotaVerdict({ total: 3749, connection: 0, perDay, priority: "sweep" }).allowed, true);
    assert.strictEqual(quota.quotaVerdict({ total: 4000, connection: 0, perDay, priority: "nightly" }).reason, "app_budget_spent", "nightly at 80 %");
    assert.strictEqual(quota.quotaVerdict({ total: 4000, connection: 0, perDay, priority: "import" }).reason, "app_budget_spent", "import at 80 %");
    assert.strictEqual(quota.quotaVerdict({ total: 4000, connection: 0, perDay, priority: "people" }).allowed, true, "a person is still served where the sweep stands down");
  });

  await check("the connection share is checked before the app budget, and a second connection is unaffected by the first's spent share", async () => {
    const store = makeFakeFirestore({ value: Date.parse("2026-09-06T12:00:00.000Z") });
    const ledger = quota.createQuotaLedger({ db: store.admin.firestore(), FieldValue: store.admin.firestore.FieldValue, perDay: 100, now: store.now });
    for (let i = 0; i < 10; i += 1) await ledger.charge({ connectionId: "A", family: "orders", priority: "people" });
    await assert.rejects(ledger.charge({ connectionId: "A", family: "orders", priority: "people" }), (e) => e.code === "rate_limited" && e.reason === "connection_share_spent" && e.status === 429);
    await ledger.charge({ connectionId: "B", family: "fulfillments", priority: "sweep" });
    const day = await ledger.read();
    assert.strictEqual(day.calls, 11); assert.deepStrictEqual(day.byConnection, { A: 10, B: 1 }); assert.deepStrictEqual(day.byFamily, { orders: 10, fulfillments: 1 });
    assert.strictEqual(day.day, "2026-09-06");
    assert.deepStrictEqual(ledger.view(day, "A"), { today: 10, share: 10, cap: 100, appToday: 11 });
    assert.deepStrictEqual(ledger.view(null, "Z"), { today: 0, share: 10, cap: 100, appToday: 0 });
  });

  await check("a new day is a new counter; the notification budgets count per hour", async () => {
    const clock = { value: Date.parse("2026-09-06T23:59:00.000Z") };
    const store = makeFakeFirestore(clock);
    const ledger = quota.createQuotaLedger({ db: store.admin.firestore(), FieldValue: store.admin.firestore.FieldValue, perDay: 100, now: () => clock.value });
    await ledger.charge({ connectionId: "A", family: "orders" });
    clock.value += 2 * 60 * 1000;
    await ledger.charge({ connectionId: "A", family: "orders" });
    assert.strictEqual((await ledger.read(clock.value)).calls, 1, "the second call landed on the next day's document");
    assert.strictEqual((await ledger.read(clock.value - 2 * 60 * 1000)).calls, 1);
    for (let i = 0; i < quota.MAX_UNKNOWN_KIDS_PER_HOUR; i += 1) assert.strictEqual((await ledger.noteUnknownKid()).allowed, true);
    assert.strictEqual((await ledger.noteUnknownKid()).allowed, false, "the twenty-first unknown kid in an hour is refused");
    clock.value += 60 * 60 * 1000;
    assert.strictEqual((await ledger.noteUnknownKid()).allowed, true, "a new hour, a new budget");
    assert.strictEqual((await ledger.noteVerified()).allowed, true);
    assert.strictEqual(quota.MAX_VERIFIED_PER_HOUR, 3000);
  });

  await check("the counter document uses nested maps, never dotted keys", async () => {
    const store = makeFakeFirestore({ value: Date.parse("2026-09-06T12:00:00.000Z") });
    const ledger = quota.createQuotaLedger({ db: store.admin.firestore(), FieldValue: store.admin.firestore.FieldValue, perDay: 100, now: store.now });
    await ledger.charge({ connectionId: "acme__seller", family: "orders" });
    const raw = store.read("ebayQuota/2026-09-06");
    assert.ok(!Object.keys(raw).some((k) => k.includes(".")), Object.keys(raw).join(","));
    assert.strictEqual(raw.byConnection["acme__seller"], 1);
  });

  if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
  console.log("\n✅ COMMERCE EBAY QUOTA GEÇTİ");
})();
