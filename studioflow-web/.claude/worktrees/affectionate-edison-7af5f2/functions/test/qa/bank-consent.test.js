// Why a bank connection looked dead every morning.
//
// Evidence from production (EGGcraft, 26-28 Aug): connected 16:07, ONE
// successful sync at 16:08, then every unattended sync — 22:47, 06:47, 14:47,
// 22:47 — failed with "Bank data request failed: Access denied", and the
// connection flipped to needs_reconsent. The token exchange never failed; only
// the data request did. That is a bank refusing deep history while the
// customer is away, not a dead consent.
//
// Run: node test/qa/bank-consent.test.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const SOURCE = fs.readFileSync(path.join(__dirname, "..", "..", "bankFeed.js"), "utf8");
function pass(name) { console.log("PASS ", name); }

// The classifier, lifted out of the module so it can be exercised directly.
const classifySource = SOURCE.slice(
  SOURCE.indexOf("function classifySyncError(error)"),
  SOURCE.indexOf("// The report's §\"audit\" ask")
);
const classifySyncError = new Function(classifySource + "; return classifySyncError;")();

// 1. A refused token exchange is the only thing that means "reconnect".
{
  const authError = Object.assign(new Error("Bank data auth failed: invalid_grant"), { tlStage: "auth", tlStatus: 400 });
  assert.strictEqual(classifySyncError(authError).kind, "needs_reconsent");
  pass("refused consent asks for a reconnect");
}

// 2. The production failure — a data request denied — must NOT read as a dead
// consent on its first occurrence.
{
  const dataError = Object.assign(new Error("Bank data request failed: Access denied"), { tlStage: "data", tlStatus: 403 });
  assert.strictEqual(classifySyncError(dataError).kind, "data_denied");
  pass("a refused data request is not a dead consent");
}

// 3. Rate limiting still stands apart, and unknown failures stay plain errors.
{
  assert.strictEqual(classifySyncError(Object.assign(new Error("too many"), { tlStatus: 429 })).kind, "rate_limited");
  assert.strictEqual(classifySyncError(new Error("socket hang up")).kind, "error");
  pass("rate limits and network blips keep their own kinds");
}

// 4. The range itself: unattended syncs must ask for ~90 days, and only the
// connect-time sync may ask for years.
{
  const syncSource = SOURCE.slice(
    SOURCE.indexOf("async function syncAccountTransactions"),
    SOURCE.indexOf("const booked = Array.isArray(payload?.results)")
  );
  assert(/89 \* 24 \* 60 \* 60 \* 1000/.test(syncSource), "a 90-day window exists");
  assert(/fullHistory = false/.test(syncSource), "deep history is opt-in, not the default");
  assert(/status !== 401 && status !== 403/.test(syncSource), "a refused deep range retries narrow");

  const connectCall = SOURCE.slice(SOURCE.indexOf("bankFinalizeRequisition"), SOURCE.indexOf("classifySyncError"));
  assert(/fullHistory: true/.test(connectCall), "the connect-time sync takes the deep history");

  const scheduledCall = SOURCE.slice(SOURCE.indexOf("async function syncCompanyConnections"));
  assert(/fullHistory: false/.test(scheduledCall), "the routine sync stays inside 90 days");
  pass("deep history only while the customer is present");
}

// 5. Two refused data requests in a row still surface as a reconnect, so a
// genuinely revoked consent is not hidden behind an amber error forever.
{
  const recordSource = SOURCE.slice(SOURCE.indexOf("const nextState = failure.kind"), SOURCE.indexOf("const nextState = failure.kind") + 400);
  assert(/data_denied/.test(recordSource) && /failures >= 2 \? "needs_reconsent"/.test(recordSource));
  pass("a persistently refused connection is still reported");
}

console.log("\n✅ BANK CONSENT GEÇTİ");
