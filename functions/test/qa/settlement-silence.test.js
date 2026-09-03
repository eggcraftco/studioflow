// Money that arrives twice, and the silence that let it.
//
// A PayPal sale lands as a positive bank row. The withdrawal that moves that
// money to the real bank arrives a SECOND time through the bank feed, and the
// only thing that stops the second arrival being counted as income again is the
// settlement match, which stamps the row `incomingKind: "payout"`.
//
// That match is gated on an exact amount, an exact currency, a three-day window
// and a score margin. When any of them fails the row stays ordinary income and
// the workshop's turnover quietly contains the same money twice — and nothing
// said so: the counters were incremented and thrown away by the caller, the
// matcher had no notification channel at all, and even the console line was
// skipped when nothing matched.
//
// Worse, the one case a person is actually needed for — a fee or an exchange
// rate moved the amount — was the one case the manual confirm refused, while
// the server computed those "near" candidates and the phone apps showed a Match
// button for them.
const assert = require("assert");
const { createSettlementMatcher } = require("../../commerce/settlementMatch");

let failures = 0;
const checks = [];
function check(name, run) { checks.push({ name, run }); }

const COMPANY = "acme";
const NOW = 1_788_000_000_000;

/** A Firestore small enough to reason about, and a record of what was told to whom. */
function world({ payouts = [], rows = [] } = {}) {
  const docs = new Map();
  const notices = [];
  for (const payout of payouts) docs.set(`companies/${COMPANY}/paypalPayouts/${payout.id}`, payout);
  for (const row of rows) docs.set(`companies/${COMPANY}/bankTransactions/${row.id}`, row);

  const snapOf = (path) => ({
    exists: docs.has(path),
    id: path.split("/").pop(),
    data: () => (docs.has(path) ? { ...docs.get(path) } : undefined),
    ref: handle(path)
  });
  // A document handle that is also a path: `doc()` has to keep returning
  // something you can hang a subcollection off, which is how the real SDK works
  // and how the matcher walks companies/<id>/paypalPayouts.
  function handle(path) {
    return {
      path,
      get: async () => snapOf(path),
      set: async (patch, options = {}) => {
        const base = options.merge && docs.has(path) ? docs.get(path) : {};
        docs.set(path, { ...base, ...patch });
      },
      collection: (name) => collection(`${path}/${name}`)
    };
  }
  const listOf = (prefix) => [...docs.keys()]
    .filter((key) => key.startsWith(prefix) && !key.slice(prefix.length).includes("/"))
    .map(snapOf);
  function collection(prefix) {
    const api = {
      doc: (id) => handle(`${prefix}/${id}`),
      where: () => api,
      limit: () => api,
      orderBy: () => api,
      get: async () => {
        const rows = listOf(`${prefix}/`);
        return { docs: rows, empty: rows.length === 0, size: rows.length };
      }
    };
    return api;
  }
  const db = () => ({
    collection: (name) => collection(name),
    batch: () => {
      const ops = [];
      return {
        set: (ref, patch, options) => ops.push([ref, patch, options]),
        commit: async () => { for (const [ref, patch, options] of ops) await ref.set(patch, options); }
      };
    }
  });
  const admin = { firestore: Object.assign(db, { FieldValue: { delete: () => undefined } }) };
  return { admin, db, docs, notices };
}

function matcher(w, { notify = true } = {}) {
  return createSettlementMatcher({
    admin: w.admin,
    db: w.db,
    now: () => NOW,
    notifyCompany: notify ? async (companyId, payload) => { w.notices.push({ companyId, ...payload }); } : null
  });
}

const day = (offset = 0) => new Date(NOW + offset * 86_400_000).toISOString().slice(0, 10);

const PAYOUT = (over = {}) => ({
  id: "po1", externalId: "PO-1", amount: 640, currency: "GBP",
  arrivalDate: day(0), externalCreatedAt: new Date(NOW).toISOString(),
  status: "PAID", ...over
});
const ROW = (over = {}) => ({
  id: "tx1", amount: 640, currency: "GBP", bookingDate: day(0),
  description: "PAYPAL TRANSFER", ...over
});

check("a payout that cannot be matched is reported, not counted in a discarded number", async () => {
  // The exact failure that lets money be counted twice: nothing in the feed
  // looks like this payout, so the deposit stays ordinary income.
  const w = world({ payouts: [PAYOUT()], rows: [] });
  const audit = await matcher(w).matchProviderPayouts(COMPANY, "paypal");
  assert.strictEqual(audit.matched, 0);
  assert.strictEqual(w.notices.length, 1, "the owner was told nothing");
  assert.match(w.notices[0].message, /counted twice/i);
  assert.strictEqual(w.notices[0].route, "bank");
});

check("the notice says how many, so one is not read as all of them", async () => {
  const w = world({ payouts: [PAYOUT(), PAYOUT({ id: "po2", externalId: "PO-2" })], rows: [] });
  await matcher(w).matchProviderPayouts(COMPANY, "paypal");
  assert.strictEqual(w.notices.length, 1, "one notice, not one per payout");
  assert.match(w.notices[0].message, /^2 /);
});

check("a payout that matched says nothing at all", async () => {
  const w = world({ payouts: [PAYOUT()], rows: [ROW()] });
  const audit = await matcher(w).matchProviderPayouts(COMPANY, "paypal");
  assert.strictEqual(audit.matched, 1);
  assert.strictEqual(w.notices.length, 0, "a working sync must stay quiet");
});

check("the matched row is stamped, which is what keeps it out of the income total", async () => {
  const w = world({ payouts: [PAYOUT()], rows: [ROW()] });
  await matcher(w).matchProviderPayouts(COMPANY, "paypal");
  assert.strictEqual(w.docs.get(`companies/${COMPANY}/bankTransactions/tx1`).incomingKind, "payout");
});

check("a matcher built with no channel still works, it just cannot speak", async () => {
  // The old construction. It must not throw — a missing notifier is not a
  // reason to stop matching.
  const w = world({ payouts: [PAYOUT()], rows: [] });
  const audit = await matcher(w, { notify: false }).matchProviderPayouts(COMPANY, "paypal");
  assert.strictEqual(audit.unmatched, 1);
  assert.strictEqual(w.notices.length, 0);
});

// ---- the owner's word on a fee or an exchange rate -------------------------
check("an owner can confirm a payout whose amount a fee moved", async () => {
  // £640 sent, £638.20 arrived. This is the one case a person is needed for,
  // and it was the one case the confirm refused — while the server computed it
  // as a "near" candidate and the phone apps offered a Match button.
  const w = world({ payouts: [PAYOUT()], rows: [ROW({ amount: 638.2 })] });
  const result = await matcher(w).confirmMatch(COMPANY, "paypal", "po1", "tx1");
  assert.strictEqual(result.ok, true);
  assert.strictEqual(w.docs.get(`companies/${COMPANY}/bankTransactions/tx1`).incomingKind, "payout");
});

check("and the difference is recorded, not swallowed", async () => {
  const w = world({ payouts: [PAYOUT()], rows: [ROW({ amount: 638.2 })] });
  const result = await matcher(w).confirmMatch(COMPANY, "paypal", "po1", "tx1");
  assert.strictEqual(result.amountDelta, -1.8);
  assert.strictEqual(w.docs.get(`companies/${COMPANY}/bankTransactions/tx1`).settlement.amountDelta, -1.8);
});

check("an exact match records no difference", async () => {
  const w = world({ payouts: [PAYOUT()], rows: [ROW()] });
  const result = await matcher(w).confirmMatch(COMPANY, "paypal", "po1", "tx1");
  assert.strictEqual(result.amountDelta, 0);
});

check("a row that is nothing like the payout is still refused", async () => {
  // Tolerance, not surrender. Beyond a fifth of the payout it is far more
  // likely to be the wrong row than a fee.
  const w = world({ payouts: [PAYOUT()], rows: [ROW({ amount: 200 })] });
  await assert.rejects(() => matcher(w).confirmMatch(COMPANY, "paypal", "po1", "tx1"), /amount_differs/);
});

check("money going OUT is never a payout arriving", async () => {
  const w = world({ payouts: [PAYOUT()], rows: [ROW({ amount: -640 })] });
  await assert.rejects(() => matcher(w).confirmMatch(COMPANY, "paypal", "po1", "tx1"), /money_out/);
});

check("a different currency is still refused, because that is not a judgement call", async () => {
  const w = world({ payouts: [PAYOUT()], rows: [ROW({ currency: "USD" })] });
  await assert.rejects(() => matcher(w).confirmMatch(COMPANY, "paypal", "po1", "tx1"), /currency_differs/);
});

(async () => {
  for (const { name, run } of checks) {
    try { await run(); console.log("PASS ", name); }
    catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).split("\n")[0].slice(0, 200)); }
  }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log("\n✅ SETTLEMENT SILENCE GEÇTİ");
})();
