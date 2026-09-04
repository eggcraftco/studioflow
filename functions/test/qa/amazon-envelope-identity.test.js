// The boundary contract has two copies — one in each project's codebase —
// and this side's suite fails if they differ. Editing the main copy alone
// would make the main project accept, or refuse, something the Amazon project
// does not, which is exactly the drift a two-sided contract must not have.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const here = fs.readFileSync(path.join(__dirname, "..", "..", "commerce", "amazon", "envelope.js"), "utf8");
const there = fs.readFileSync(path.join(__dirname, "..", "..", "..", "functions-amazon", "src", "envelope.js"), "utf8");

try {
  assert.strictEqual(here, there, "functions/commerce/amazon/envelope.js differs from functions-amazon/src/envelope.js — copy the file across, do not edit one side");
  const envelope = require("../../commerce/amazon/envelope");
  // And the main side refuses what it must refuse.
  const poisoned = {
    version: 1, connectionId: "c", companyId: "co", marketplaceId: "M", syncedAtMs: 1, taxKnown: false, removedPaths: [],
    order: { AmazonOrderId: "1", BuyerInfo: { BuyerEmail: "jane@example.com" } }, items: []
  };
  assert.strictEqual(envelope.validateSafeEnvelope(poisoned).ok, false, "the main side accepted a buyer field");
  console.log("PASS  the boundary contract is one file on both sides, and the main side refuses a poisoned envelope");
  console.log("\n✅ AMAZON ENVELOPE IDENTITY GEÇTİ");
} catch (error) {
  console.log(`FAIL  ${error.message}`);
  console.log("\n❌ 1 failing");
  process.exit(1);
}
