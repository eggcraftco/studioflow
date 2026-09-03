// Links that hand out a file, and what "stop sharing" has to mean.
//
// Three things were wrong, and the first is the serious one:
//
//   * nvCreateFileLink checked only that the caller was signed in. Anyone with
//     an account who knew — or guessed — a storage path could mint a PUBLIC
//     link to another workspace's file. The path names the workspace; nothing
//     compared it to the caller.
//   * A shared link had no expiry and no off switch. There was no revoke
//     callable anywhere in any of the four codebases, so a link forwarded once
//     was published for ever.
//   * Revoking a customer portal set a flag on the /track/ page and stopped
//     there. The photos and files it had handed out are Firebase Storage URLs
//     with the download token IN them — the URL is the credential — so every
//     one the customer had copied kept working, while the screen said "the
//     customer's link no longer opens".
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const SOURCE = fs.readFileSync(path.join(__dirname, "..", "..", "index.js"), "utf8");

let failures = 0;
const checks = [];
function check(name, run) { checks.push({ name, run }); }

function body(marker, endMarker) {
  const at = SOURCE.indexOf(marker);
  assert.ok(at > 0, `${marker} is where it was`);
  const end = SOURCE.indexOf(endMarker, at + marker.length);
  return SOURCE.slice(at, end > 0 ? end : at + 4000);
}

// ---- whose file is it ------------------------------------------------------
check("minting a link proves the caller is in the file's workspace", () => {
  const mint = body("exports.nvCreateFileLink = onCall(", "exports.nvRevokeFileLink");
  assert.ok(/companies\\\/\(\[\^\/\]\+\)/.test(mint) || /companies\\\//.test(mint), "the workspace is read off the path");
  assert.ok(/uidHasCompanyAccess\(ownerData, uid\)/.test(mint), "and the caller is checked against it");
  const guard = mint.indexOf("uidHasCompanyAccess");
  const write = mint.indexOf('collection("fileShares")');
  assert.ok(guard > 0 && write > 0 && guard < write, "the check happens before the link exists");
});

check("a path that names no workspace is refused rather than shared", () => {
  const mint = body("exports.nvCreateFileLink = onCall(", "exports.nvRevokeFileLink");
  assert.ok(/if \(!ownerCompanyId\)/.test(mint));
  assert.ok(/does not belong to a workspace/.test(mint));
});

// ---- the off switch --------------------------------------------------------
check("a link is written with both an end date and a revoked flag", () => {
  const mint = body("exports.nvCreateFileLink = onCall(", "exports.nvRevokeFileLink");
  assert.ok(/expireAt: admin\.firestore\.Timestamp\.fromMillis/.test(mint));
  assert.ok(/revokedAtMs: 0/.test(mint));
  assert.ok(/companyId: ownerCompanyId/.test(mint), "so revoking can check who may");
});

check("there is a revoke, and it is not open to everybody", () => {
  const revoke = body("exports.nvRevokeFileLink = onCall(", "exports.nvViewSharedFile");
  assert.ok(revoke.length > 200, "the callable exists");
  assert.ok(/uidHasCompanyAccess\(companyData, uid\)/.test(revoke));
  assert.ok(/revokedAtMs: Date\.now\(\)/.test(revoke));
});

check("a link minted before companyId was recorded can still be revoked", () => {
  // Otherwise the fix would leave every existing link permanently un-revokable,
  // which is the population that most needs it.
  const revoke = body("exports.nvRevokeFileLink = onCall(", "exports.nvViewSharedFile");
  assert.ok(/String\(data\.path \|\| ""\)/.test(revoke), "it falls back to the path");
});

check("the public viewer refuses a withdrawn or aged-out link", () => {
  // This handler is the whole gate: public, no auth, a short id in the URL.
  const viewer = body("exports.nvViewSharedFile = onRequest(", "\nexports.");
  assert.ok(/revokedAtMs > 0/.test(viewer));
  assert.ok(/Date\.now\(\) > expireAtMs/.test(viewer));
  const check = viewer.indexOf("revokedAtMs > 0");
  const serve = viewer.indexOf("firebasestorage");
  assert.ok(check > 0 && (serve < 0 || check < serve), "refused before anything is served");
});

// ---- what revoking a portal has to mean ------------------------------------
check("revoking a portal rotates the download token on what it shared", () => {
  // Without this, revoke set a flag and the customer's copied photo URLs went
  // on working. The token IS the credential; changing it is the only thing that
  // closes them.
  const revoke = body("exports.revokeOrderPortalLink = onCall(", "async function rotatePortalFileTokens");
  assert.ok(/await rotatePortalFileTokens\(orderData, companyId, orderId\)/.test(revoke));
  const rotate = revoke.indexOf("rotatePortalFileTokens");
  const flag = revoke.indexOf("portalRevokedAtMs");
  assert.ok(rotate > 0 && flag > 0 && rotate < flag, "rotate before the order is marked revoked");
});

check("it covers the library files the portal shared, not only the attachments", () => {
  // Two separate sources of portal URLs. Rotating one and not the other closes
  // half the door.
  const rotator = body("async function rotatePortalFileTokens(", "\n/** The object path");
  assert.ok(/clientFiles/.test(rotator), "the order's own attachments");
  assert.ok(/linkKeys", "array-contains", `order:\$\{orderId\}`/.test(rotator), "and the library files linked to it");
  assert.ok(/clientPortalVisible !== true/.test(rotator), "only the ones actually shared");
  assert.ok(/portalUrl: ""/.test(rotator), "the cached URL is cleared, or the file dies when the portal comes back");
});

check("a file that cannot be rotated does not block the revoke", () => {
  // The person asked for the portal to be off. A storage error must not leave
  // it on.
  const rotator = body("async function rotatePortalFileTokens(", "\n/** The object path");
  assert.ok(/catch \(error\)/.test(rotator));
  assert.ok(/failed \+= 1/.test(rotator));
  assert.ok(/return \{ rotated, failed \}/.test(rotator));
});

check("the caller is told how much was closed and how much was not", () => {
  const revoke = body("exports.revokeOrderPortalLink = onCall(", "async function rotatePortalFileTokens");
  assert.ok(/rotatedFiles: rotated\.rotated, unrotatedFiles: rotated\.failed/.test(revoke));
});

check("the screen no longer promises more than the code does", () => {
  const web = fs.readFileSync(
    path.join(__dirname, "..", "..", "..", "studioflow-web", "app", "orders", "OrderDetailContent.tsx"), "utf8"
  );
  assert.ok(!/The customer's link no longer opens\."\)/.test(web), "the old, untrue sentence is gone");
  assert.ok(/photos and files it shared are closed too/.test(web));
});

(async () => {
  for (const { name, run } of checks) {
    try { await run(); console.log("PASS ", name); }
    catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).split("\n")[0].slice(0, 200)); }
  }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log("\n✅ SHARED LINKS GEÇTİ");
})();
