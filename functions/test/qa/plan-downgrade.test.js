// What happens when a trial ends and a workspace lands back on Free.
//
// The report's rule, and the reason this file exists: NOTHING is taken away.
// Every record stays visible, every file stays downloadable, and the system
// never decides which ten of someone's orders are the keepers. The limit only
// stops NEW work, and the owner chooses what to close to make room.
//
// Run: node test/qa/plan-downgrade.test.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const SOURCE = fs.readFileSync(path.join(__dirname, "..", "..", "index.js"), "utf8");
const ETSY_SOURCE = require("fs").readFileSync(require("path").join(__dirname, "..", "..", "etsySync.js"), "utf8");
function pass(name) { console.log("PASS ", name); }

// 1. Nothing is deleted or hidden by a plan change. The gated actions are all
// WRITES; there is no gate on reading or downloading what already exists.
{
  const actions = SOURCE.slice(SOURCE.indexOf("const BILLING_ACTIONS = {"), SOURCE.indexOf("function normalizeBillingPlan"));
  assert(/upload_client_file/.test(actions) && /rename_client_file/.test(actions) && /delete_client_file/.test(actions),
    "the file actions that are gated are the write ones");
  assert(!/download_client_file|read_client_file|view_order|open_order|list_orders/.test(actions),
    "reading, opening and downloading are never gated by plan");
  pass("a downgrade takes nothing away that already exists");
}

// 2. The limit counts ACTIVE orders. Delivered and deleted work is not using
// anything, which is what gives the owner a way back under the line.
{
  const counter = SOURCE.slice(SOURCE.indexOf("async function countActiveOrders"), SOURCE.indexOf("async function countCompanyCollection"));
  assert(/data\.isDeleted === true\) continue/.test(counter), "deleted orders do not count");
  assert(/data\.isDelivered === true\) continue/.test(counter), "delivered orders do not count");
  assert(/create_order: \{ limitKey: "orderLimit", usageKey: "activeOrderCount"/.test(SOURCE),
    "the limit reads the active count");
  pass("finished work stops counting, so there is a way back");
}

// 3. A store that keeps selling must not silently blow past the limit — and an
// order that will not fit must not be dropped either. It is parked.
{
  for (const [hook, provider] of [["woocommerceOrderWebhook", "woocommerce"], ["shopifyOrderWebhook", "shopify"]]) {
    const at = SOURCE.indexOf(`exports.${hook} =`);
    const body = SOURCE.slice(at, SOURCE.indexOf("\nexports.", at + 10));
    assert(/integrationOrderCapacity/.test(body), `${hook} checks capacity`);
    assert(new RegExp(`holdIntegrationOrder\\(companyId, "${provider}"`).test(body), `${hook} parks rather than drops`);
    assert(/res\.status\(200\)\.json\(\{ ok: true, held: true/.test(body),
      `${hook} answers 200 so the store does not retry forever`);
    assert(/if \(!existing\.exists\)/.test(body), `${hook} only gates NEW orders, never updates to existing ones`);
  }
  pass("a full workspace parks new store orders instead of losing them");
}

// 4. The owner can see the queue and bring it in; the system fills the room
// that exists and leaves the rest, rather than choosing what to drop.
{
  assert(/exports\.listHeldIntegrationOrders/.test(SOURCE), "the queue is readable");
  assert(/exports\.releaseHeldIntegrationOrders/.test(SOURCE), "the queue can be brought in");
  const release = SOURCE.slice(SOURCE.indexOf("exports.releaseHeldIntegrationOrders"), SOURCE.indexOf("exports.createWebOrder"));
  assert(/orderBy\("heldAtMs", "asc"\)/.test(release), "oldest first");
  assert(/if \(!capacity\.allowed\) break;/.test(release), "it stops when the plan is full again");
  assert(/uidCanEditWorkspaceOrders/.test(release), "only someone who may create orders can release them");
  pass("the queue comes in oldest first, and stops when full");
}

// 5. Parked payloads are raw store data — addresses, line items. Server-only.
{
  const rules = fs.readFileSync(path.join(__dirname, "..", "..", "..", "firestore.rules"), "utf8");
  const guards = (rules.match(/collectionId != 'heldIntegrationOrders'/g) || []).length;
  assert.strictEqual(guards, 2, "excluded from both the read and the write catch-all");
  pass("parked orders are closed to the client SDK");
}

// 6. The owner is told, but not once per sale.
{
  const hold = SOURCE.slice(SOURCE.indexOf("async function holdIntegrationOrder"), SOURCE.indexOf("async function countActiveOrders"));
  assert(/24 \* 60 \* 60 \* 1000/.test(hold), "at most one notification a day");
  assert(/Nothing is lost/.test(hold), "the message says the orders are safe");
  pass("one notification a day, and it says nothing is lost");
}

// Every provider that can park an order must have a branch that can replay it.
// Without this, adding a channel is a two-file change where forgetting the
// second file is silent and destructive: releaseHeldIntegrationOrders ends in
// `else { await doc.ref.delete(); continue; }`, so an unknown provider's parked
// order is DELETED rather than imported — and the seller is told the wait is
// over. Etsy shipped in exactly that state.
{
  const parked = [...SOURCE.matchAll(/holdIntegrationOrder\(\s*[A-Za-z_$][\w$]*\s*,\s*"([a-z]+)"/g)].map((m) => m[1]);
  const alsoParked = [...ETSY_SOURCE.matchAll(/holdIntegrationOrder\(\s*[A-Za-z_$][\w$]*\s*,\s*"([a-z]+)"/g)].map((m) => m[1]);
  const providers = [...new Set([...parked, ...alsoParked])];
  assert(providers.length >= 2, `expected several providers to park orders, found ${providers}`);

  const start = SOURCE.indexOf("exports.releaseHeldIntegrationOrders");
  assert(start > 0, "releaseHeldIntegrationOrders is still there");
  const release = SOURCE.slice(start, start + 5000);
  const missing = providers.filter((name) => !new RegExp(`provider === "${name}"`).test(release));
  assert.deepStrictEqual(
    missing, [],
    `${missing.join(", ")} can park an order but has no release branch, so those orders are deleted instead of imported`
  );
  pass(`every provider that parks an order can replay it (${providers.join(", ")})`);
}

console.log("\n✅ PLAN DOWNGRADE GEÇTİ");
