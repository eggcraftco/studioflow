// RET-004 / ETSY-012. deleteMyAccount cannot run in the emulator suite (it ends
// by deleting the Auth user and cancelling Stripe), so what IS pinned here is
// the shape of the function: the provider purge happens, it happens before the
// workspace tree is taken, and the root collections keyed by companyId are all
// on the list. The purge itself is proven live in
// test/e2e/account-deletion-emulator.test.js.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(path.join(__dirname, "..", "..", "index.js"), "utf8");
const start = source.indexOf("exports.deleteMyAccount = onCall(");
assert(start > 0, "deleteMyAccount is where it was");
const end = source.indexOf("\n});", start);
const body = source.slice(start, end);

function pass(name) { console.log("PASS ", name); }

{
  const list = /for \(const collection of \[([^\]]+)\]\)/.exec(body);
  assert(list, "the root-collection loop is still a literal list");
  const names = list[1].split(",").map((s) => s.trim().replace(/"/g, ""));
  for (const required of ["siparisler", "musteriler", "notes", "messages", "workspaceTickets", "supportTickets"]) {
    assert(names.includes(required), `${required} is deleted by companyId`);
  }
  pass("every root collection keyed by companyId is on the deletion list, support tickets included");
}
{
  const purgeAt = body.indexOf("await purgeProviderDataForWorkspace(uid)");
  const treeAt = body.indexOf('db.recursiveDelete(db.collection("companies").doc(uid))');
  assert(purgeAt > 0, "deleteMyAccount purges the provider root collections");
  assert(treeAt > purgeAt, "and does so BEFORE the workspace tree goes — the purge reads nothing from it, but the log line should say what was found while the account still exists");
  pass("the provider purge runs inside deleteMyAccount, ahead of recursiveDelete");
}
{
  const purge = source.slice(source.indexOf("async function purgeProviderDataForWorkspace("));
  const fn = purge.slice(0, purge.indexOf("\n}\n") + 3);
  for (const col of ["etsyConnections", "etsyOAuthStates", "etsyExternalOrders", "etsyCustomerLinks", "etsyWebhookEvents", "shopifyStores"]) {
    assert(fn.includes(`"${col}"`), `${col} is covered`);
  }
  assert(fn.includes('unlinkReason: "account_deleted"'), "a store unlinked by a deletion says so");
  assert(!/accessToken:\s*""/.test(fn), "the Shopify token is NOT blanked by an account deletion — it belongs to the install, app/uninstalled blanks it");
  pass("the purge names all six provider root collections and leaves the install's token alone");
}

console.log("\n✅ ACCOUNT DELETION COVERAGE GEÇTİ");
