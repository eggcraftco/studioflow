// One workspace must not be able to spend Etsy's day for all of them.
//
// Etsy's 5,000 calls belong to the NivaDesk application, not to each seller.
// The counter had no workspace in it and the three hand-triggered paths never
// read it, so one shop repeating Sync now could push the shared number past the
// sweep's stand-down — switching off the reconciliation safety net for every
// other Etsy shop on the platform — and then past 5,000, where Etsy 429s
// everybody.
//
// These checks are against the real functions, not against the text of the
// file: a guard that is only asserted by grepping for a pattern still passes
// when somebody wraps it in `if (false)`.

const assert = require("assert");
const etsy = require("../../etsy");
const customerMatch = require("../../etsyCustomerMatch");
const { integrationOrderUpdate } = require("../../integrationOrderFields");
const { createEtsySyncFunctions } = require("../../etsySync");

let failed = 0;
const tests = [];
function test(name, fn) { tests.push([name, fn]); }

const DELETE = Symbol("delete");
const SERVER_TS = Symbol("ts");
const INCREMENT = (n) => ({ __increment: n });

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value) && !("__increment" in value);
}

// set(merge: true) in Firestore merges maps a level down rather than replacing
// them, and that is exactly what byCompany relies on — one workspace's counter
// must not wipe another's. A shallow fake would hide that.
function applyPatch(target, patch, nowMs) {
  const out = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    if (value === DELETE) delete out[key];
    else if (value === SERVER_TS) out[key] = nowMs;
    else if (value && typeof value === "object" && "__increment" in value) {
      out[key] = (Number(out[key]) || 0) + value.__increment;
    } else if (isPlainObject(value)) {
      out[key] = applyPatch(isPlainObject(out[key]) ? out[key] : {}, value, nowMs);
    } else out[key] = value;
  }
  return out;
}

function makeWorld(nowRef) {
  const docs = new Map();
  const events = [];
  function handle(path) {
    return {
      path,
      get: async () => ({
        exists: docs.has(path),
        data: () => (docs.has(path) ? { ...docs.get(path) } : undefined),
        ref: handle(path)
      }),
      set: async (patch, options = {}) => {
        const base = options.merge && docs.has(path) ? docs.get(path) : {};
        docs.set(path, applyPatch(base, patch, nowRef.value));
      },
      collection: () => ({ add: async (row) => { events.push(row); } })
    };
  }
  const firestore = () => ({
    collection: (name) => ({
      doc: (id) => handle(`${name}/${id}`),
      where: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }), get: async () => ({ docs: [] }) })
    })
  });
  const admin = {
    firestore: Object.assign(firestore, {
      FieldValue: { serverTimestamp: () => SERVER_TS, delete: () => DELETE, increment: INCREMENT }
    })
  };
  return { admin, docs, events, handle };
}

const RECEIPT = {
  receipt_id: 555,
  status: "paid",
  is_paid: true,
  buyer_user_id: 987,
  buyer_email: "relay@etsy.com",
  name: "Ada Lovelace",
  first_line: "12 Analytical Way",
  city: "London",
  zip: "EC1A 1BB",
  country_iso: "GB",
  create_timestamp: 1_756_000_000,
  update_timestamp: 1_756_000_600,
  grandtotal: { amount: 12500, divisor: 100, currency_code: "GBP" },
  subtotal: { amount: 12000, divisor: 100, currency_code: "GBP" },
  total_shipping_cost: { amount: 500, divisor: 100, currency_code: "GBP" },
  total_tax_cost: { amount: 0, divisor: 100, currency_code: "GBP" },
  total_vat_cost: { amount: 0, divisor: 100, currency_code: "GBP" },
  discount_amt: { amount: 0, divisor: 100, currency_code: "GBP" },
  transactions: [{
    transaction_id: 1, listing_id: 9, sku: "RING", title: "Ring", quantity: 1,
    price: { amount: 12000, divisor: 100, currency_code: "GBP" }
  }]
};

class FakeHttpsError extends Error {
  constructor(code, message, details) { super(message); this.code = code; this.details = details; }
}

function build({ nowRef, world, companyId = "c1", etsyThrows = false }) {
  const calls = { etsy: 0 };
  const connect = {
    loadConnection: async (id, cid) => ({
      ref: world.handle(`etsyConnections/${id}`),
      data: { externalShopId: "222", externalShopName: "Ada Studio", shopCurrency: "GBP", companyId: cid }
    }),
    callEtsy: async (_ref, _path, options) => {
      calls.etsy += 1;
      // Etsy refusing a request is the case the meter has to survive: it counted
      // the request even though we got nothing back.
      if (etsyThrows) throw new Error("429 rate limit");
      if (Number(options?.query?.offset) > 0) return { results: [], count: 1 };
      return { results: [RECEIPT], count: 1 };
    },
    writeSyncEvent: async (_ref, event) => { world.events.push(event); }
  };
  const fns = createEtsySyncFunctions({
    admin: world.admin,
    onCall: (_o, handler) => handler,
    HttpsError: FakeHttpsError,
    etsy,
    customerMatch,
    connect,
    requireWorkspaceMember: async () => ({ uid: "u1", companyId }),
    requireWorkspaceOwner: async () => ({ uid: "u1", companyId }),
    orderDocRef: (id) => world.handle(`siparisler/${id}`),
    integrationOrderUpdate,
    integrationOrderCapacity: async () => ({ allowed: true }),
    holdIntegrationOrder: async () => {},
    upsertIntegrationCustomer: async () => {},
    reconcileLineItems: (items) => items,
    resolveDefaultDeliveryTime: () => 30,
    companySettingsDocRef: () => world.handle(`companySettings/${companyId}`),
    customersOfCompany: () => ({ where: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }) }),
    sendPushNotificationToCompany: async () => {},
    now: () => nowRef.value
  });
  return { fns, calls };
}

const NOW = 1_760_000_000_000;                                  // a fixed UTC day
const DAY = new Date(NOW).toISOString().slice(0, 10);
const REQ = (data) => ({ auth: { uid: "u1" }, data });

async function seedQuota(world, { calls = 0, byCompany = {} }) {
  await world.handle(`etsyQuota/${DAY}`).set({ day: DAY, calls, byCompany }, { merge: true });
}

async function refuses(fn, expectedCode, label) {
  try {
    await fn();
  } catch (error) {
    assert.strictEqual(error.code, "resource-exhausted", `${label}: wrong error code ${error.code}`);
    assert.strictEqual(error.details?.code, expectedCode, `${label}: wrong reason ${error.details?.code}`);
    assert.ok(String(error.message || "").length > 20, `${label}: the seller is left without an explanation`);
    return error;
  }
  throw new assert.AssertionError({ message: `${label}: went through when the share was spent` });
}

// --- the decision itself ----------------------------------------------------

test("the verdict draws both lines and names which one was hit", () => {
  const share = Math.floor(etsy.ETSY_REQUESTS_PER_DAY * etsy.ETSY_COMPANY_DAILY_SHARE);
  const ceiling = Math.floor(etsy.ETSY_REQUESTS_PER_DAY * etsy.ETSY_HARD_QUOTA_CEILING);

  assert.strictEqual(etsy.etsyQuotaVerdict({ total: 0, company: 0 }).allowed, true, "an empty day is open");
  assert.strictEqual(
    etsy.etsyQuotaVerdict({ total: ceiling - 1, company: share - 1 }).allowed, true,
    "one call short of either line is still allowed"
  );
  assert.strictEqual(etsy.etsyQuotaVerdict({ total: share, company: share }).reason, "workspace_share_spent");
  assert.strictEqual(etsy.etsyQuotaVerdict({ total: ceiling, company: 0 }).reason, "app_budget_spent");

  // A quiet workspace is not punished for a busy platform until the hard
  // ceiling, and a noisy one is told it is its own doing rather than ours.
  assert.strictEqual(
    etsy.etsyQuotaVerdict({ total: ceiling - 1, company: 0 }).allowed, true,
    "the sweep's 0.75 stand-down must not also stop a person"
  );
  assert.strictEqual(
    etsy.etsyQuotaVerdict({ total: ceiling + 10, company: share + 10 }).reason, "workspace_share_spent",
    "when both lines are crossed the workspace's own overspend is the one reported"
  );

  // The whole point: a workspace's ceiling is a fraction of the day, so the
  // other nine tenths survive the noisiest tenant.
  assert.ok(share > 0 && share < ceiling, `share ${share} must sit under the app ceiling ${ceiling}`);
  assert.ok(
    etsy.ETSY_HARD_QUOTA_CEILING > 0.75,
    "a person must still be served after the sweep has stood down"
  );
});

// --- the three paths a person can trigger -----------------------------------

test("a workspace that has spent its share is refused, and makes no Etsy call", async () => {
  const share = Math.floor(etsy.ETSY_REQUESTS_PER_DAY * etsy.ETSY_COMPANY_DAILY_SHARE);
  for (const name of ["previewEtsyImport", "runEtsyImport", "syncEtsyNow"]) {
    const nowRef = { value: NOW };
    const world = makeWorld(nowRef);
    const { fns, calls } = build({ nowRef, world });
    await seedQuota(world, { calls: share, byCompany: { c1: share } });

    await refuses(() => fns[name](REQ({ connectionId: "c1_222" })), "workspace_share_spent", name);
    assert.strictEqual(calls.etsy, 0, `${name}: refused but still spent a call on Etsy`);
  }
});

test("one shop's spent share does not stop another shop", async () => {
  const share = Math.floor(etsy.ETSY_REQUESTS_PER_DAY * etsy.ETSY_COMPANY_DAILY_SHARE);
  const nowRef = { value: NOW };
  const world = makeWorld(nowRef);
  await seedQuota(world, { calls: share, byCompany: { c1: share } });

  const noisy = build({ nowRef, world, companyId: "c1" });
  await refuses(() => noisy.fns.syncEtsyNow(REQ({ connectionId: "c1_222" })), "workspace_share_spent", "c1");

  const neighbour = build({ nowRef, world, companyId: "c2" });
  const result = await neighbour.fns.syncEtsyNow(REQ({ connectionId: "c2_333" }));
  assert.strictEqual(result.ok, true, "the neighbour was refused for what c1 did");
  assert.ok(neighbour.calls.etsy > 0, "the neighbour reached Etsy");

  // And the two counters stayed apart.
  const quota = world.docs.get(`etsyQuota/${DAY}`);
  assert.strictEqual(quota.byCompany.c1, share, "c1's counter moved without c1 making a call");
  assert.ok(quota.byCompany.c2 > 0, "c2's own calls were recorded against c2");
  assert.strictEqual(quota.calls, share + quota.byCompany.c2, "the shared total counts both");
});

test("the app-wide hard ceiling stops even a workspace with share left", async () => {
  const ceiling = Math.floor(etsy.ETSY_REQUESTS_PER_DAY * etsy.ETSY_HARD_QUOTA_CEILING);
  const nowRef = { value: NOW };
  const world = makeWorld(nowRef);
  const { fns, calls } = build({ nowRef, world });
  await seedQuota(world, { calls: ceiling, byCompany: { someone_else: ceiling } });

  await refuses(() => fns.previewEtsyImport(REQ({ connectionId: "c1_222" })), "app_budget_spent", "preview");
  assert.strictEqual(calls.etsy, 0, "refused but still spent a call on Etsy");
});

test("a quiet workspace still syncs while the platform is under the ceiling", async () => {
  const nowRef = { value: NOW };
  const world = makeWorld(nowRef);
  const { fns, calls } = build({ nowRef, world });
  // Past the sweep's 0.75 stand-down, below the hard ceiling: the sweep gives
  // way here, a person does not.
  await seedQuota(world, { calls: 4000, byCompany: { someone_else: 4000 } });

  const result = await fns.syncEtsyNow(REQ({ connectionId: "c1_222" }));
  assert.strictEqual(result.ok, true, "a seller was refused while the day still had room");
  assert.ok(calls.etsy > 0, "no call was made");
});

// --- the sweep keeps running ------------------------------------------------

test("the sweep does not spend the workspace's own allowance", async () => {
  // A workspace with several shops would otherwise burn its Sync now share on
  // background work it never pressed, and then be locked out of the button.
  const nowRef = { value: NOW };
  const world = makeWorld(nowRef);
  await seedQuota(world, { calls: 0, byCompany: {} });
  const { fns } = build({ nowRef, world, companyId: "c1" });
  // Read off the shipping code, not from an argument this test chose: the whole
  // question is what the SCHEDULED sweep passes, and a test that supplies
  // chargeShare itself would pass with the production call site unchanged.
  const source = require("fs").readFileSync(require("path").join(__dirname, "..", "..", "etsySync.js"), "utf8");
  assert.ok(
    /reconcileConnection\(row\.ref, row\.data, \{ companyId: String\(row\.data\.companyId\), chargeShare: false \}\)/.test(source),
    "the scheduled sweep must not charge the workspace's share"
  );

  await fns._internal.reconcileConnection(
    world.handle("etsyConnections/c1_222"),
    { externalShopId: "222", companyId: "c1" },
    { companyId: "c1", chargeShare: false }
  );

  const quota = world.docs.get(`etsyQuota/${DAY}`) || {};
  assert.ok(Number(quota.calls) > 0, "the platform total still counts the sweep, because Etsy does");
  assert.ok(!(quota.byCompany || {}).c1, "the sweep must not charge the workspace's share");
  assert.ok(Number((quota.byCompanyBackground || {}).c1) > 0, "but it is still visible per workspace");
});

test("a fetch that throws is still charged, so the guard cannot fail open", async () => {
  // Etsy counts a request it refused. Recording only on the way back meant a
  // rate limit or an expired token cost the meter nothing — the guard opened at
  // exactly the moment it was needed.
  const nowRef = { value: NOW };
  const world = makeWorld(nowRef);
  await seedQuota(world, { calls: 0, byCompany: {} });
  const { fns } = build({ nowRef, world, companyId: "c1", etsyThrows: true });
  await fns.syncEtsyNow(REQ({ connectionId: "c1_222" })).catch(() => undefined);

  const quota = world.docs.get(`etsyQuota/${DAY}`) || {};
  assert.ok(Number(quota.calls) > 0, "a failed request still spent Etsy's allowance");
});

test("the background sweep is not stopped by a workspace's own overspend", async () => {
  const share = Math.floor(etsy.ETSY_REQUESTS_PER_DAY * etsy.ETSY_COMPANY_DAILY_SHARE);
  const nowRef = { value: NOW };
  const world = makeWorld(nowRef);
  const { fns, calls } = build({ nowRef, world });
  await seedQuota(world, { calls: share, byCompany: { c1: share } });

  // What reconcileEtsyConnections calls for each connected shop. Refusing this
  // too would turn "you have used your share of Sync now" into "your orders
  // stop arriving until midnight".
  const outcome = await fns._internal.reconcileConnection(
    world.handle("etsyConnections/c1_222"),
    { externalShopId: "222", companyId: "c1" },
    { companyId: "c1" }
  );
  assert.ok(outcome, "the safety net was stopped along with the seller");
  assert.ok(calls.etsy > 0, "the sweep made no call");
});

// --- run --------------------------------------------------------------------
(async () => {
  console.log("Etsy daily quota — one workspace cannot spend the platform's day");
  for (const [name, fn] of tests) {
    try { await fn(); console.log("  ok  " + name); } catch (error) {
      failed += 1;
      console.log("  FAIL " + name + "\n        " + (error?.message || error));
    }
  }
  if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
  console.log("\nPASS");
})();
