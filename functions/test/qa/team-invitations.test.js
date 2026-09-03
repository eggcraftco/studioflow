// A link in an email is a credential. These check it behaves like one.
//
// The rules that matter are all about refusing: an invitation that was used, or
// withdrawn, or has aged out, or was sent to somebody else. The last is the one
// worth writing down — forwarding is the normal thing people do with email, and
// without an address check a forwarded invitation quietly seats the wrong
// person under a name the owner never typed.
const assert = require("assert");
const {
  mintInvitationToken, invitationIdForToken, normalizeInviteEmail, isPlausibleEmail,
  invitationAcceptability, invitationPreview, invitationExpiresAtMs, INVITATION_REFUSALS
} = require("../../team/invitations");

let failures = 0;
const checks = [];
function check(name, run) { checks.push({ name, run }); }

const NOW = 1_788_000_000_000;
function invitation(extra = {}) {
  return {
    companyId: "acme",
    companyName: "Acme",
    email: "sam@example.com",
    role: "member",
    status: "pending",
    invitedByName: "Ada",
    expiresAt: NOW + 60_000,
    ...extra
  };
}

check("a token is long, url-safe, and different every time", () => {
  const seen = new Set();
  for (let i = 0; i < 500; i += 1) {
    const { token } = mintInvitationToken();
    assert.ok(token.length >= 40, `token too short: ${token.length}`);
    assert.ok(/^[A-Za-z0-9_-]+$/.test(token), `token is not url-safe: ${token}`);
    assert.ok(!seen.has(token), "a token was minted twice");
    seen.add(token);
  }
});

check("the stored id is a hash, so the token itself is never written down", () => {
  const { token, id } = mintInvitationToken();
  assert.strictEqual(id, invitationIdForToken(token));
  assert.strictEqual(id.length, 64);
  assert.ok(!id.includes(token), "the id contains the token");
  // The point of the hash: knowing every id in the database tells you nothing
  // you could put in a URL.
  assert.notStrictEqual(id, token);
});

check("a token that is not the token does not resolve to the same invitation", () => {
  const { token, id } = mintInvitationToken();
  for (const wrong of [token + "x", token.slice(0, -1), token.toUpperCase(), " " + token.slice(1)]) {
    if (wrong.trim() === token) continue;
    assert.notStrictEqual(invitationIdForToken(wrong), id, wrong);
  }
  // Surrounding whitespace is forgiven, because email clients add it.
  assert.strictEqual(invitationIdForToken(`  ${token}\n`), id);
  assert.strictEqual(invitationIdForToken(""), "");
});

check("email comparison is case and space insensitive, and nothing cleverer", () => {
  assert.strictEqual(normalizeInviteEmail("  Sam@Example.COM "), "sam@example.com");
  // Deliberately NOT normalised: stripping these would be guessing at one
  // provider's rules and would let an address the owner did not type accept.
  assert.notStrictEqual(normalizeInviteEmail("s.am@example.com"), "sam@example.com");
  assert.notStrictEqual(normalizeInviteEmail("sam+work@example.com"), "sam@example.com");
});

check("obvious nonsense is refused before an email is ever sent", () => {
  for (const good of ["sam@example.com", "a.b-c@sub.example.co.uk", "SAM@EXAMPLE.COM"]) {
    assert.ok(isPlausibleEmail(good), good);
  }
  for (const bad of ["", "   ", "sam", "sam@", "@example.com", "sam@example", "sam @example.com", "a@b.c d", "x".repeat(250) + "@example.com"]) {
    assert.ok(!isPlausibleEmail(bad), JSON.stringify(bad));
  }
});

check("a pending invitation accepted by the person it was sent to goes through", () => {
  const verdict = invitationAcceptability(invitation(), "sam@example.com", NOW);
  assert.deepStrictEqual(verdict, { ok: true, reason: "" });
  // And the address is compared after normalising, on both sides.
  assert.ok(invitationAcceptability(invitation({ email: " Sam@Example.com " }), "SAM@example.COM ", NOW).ok);
});

check("a forwarded invitation does not seat the person it was forwarded to", () => {
  const verdict = invitationAcceptability(invitation(), "colleague@example.com", NOW);
  assert.strictEqual(verdict.ok, false);
  assert.strictEqual(verdict.reason, "wrong_account");
});

check("an invitation cannot be used twice", () => {
  assert.strictEqual(invitationAcceptability(invitation({ status: "accepted" }), "sam@example.com", NOW).reason, "already_accepted");
});

check("a withdrawn invitation stops working", () => {
  assert.strictEqual(invitationAcceptability(invitation({ status: "revoked" }), "sam@example.com", NOW).reason, "revoked");
});

check("an invitation ages out", () => {
  const stale = invitation({ expiresAt: NOW - 1 });
  assert.strictEqual(invitationAcceptability(stale, "sam@example.com", NOW).reason, "expired");
  // One second before is still fine — the boundary is not off by a day.
  assert.ok(invitationAcceptability(invitation({ expiresAt: NOW + 1 }), "sam@example.com", NOW).ok);
});

check("every timestamp shape Firestore returns is read the same way", () => {
  const future = NOW + 60_000;
  const shapes = [
    future,
    { seconds: future / 1000, nanoseconds: 0 },
    { _seconds: future / 1000 },
    { toMillis: () => future },
    new Date(future),
    new Date(future).toISOString()
  ];
  for (const expiresAt of shapes) {
    assert.ok(
      invitationAcceptability(invitation({ expiresAt }), "sam@example.com", NOW).ok,
      `expiry shape ${JSON.stringify(expiresAt)} was read as expired`
    );
  }
});

check("an account with no email address cannot accept anything", () => {
  for (const empty of ["", null, undefined, "   "]) {
    assert.strictEqual(invitationAcceptability(invitation(), empty, NOW).reason, "no_email_on_account");
  }
});

check("nothing that is not an invitation is accepted", () => {
  for (const bad of [null, undefined, "", 7, [], { status: "draft" }, {}]) {
    const verdict = invitationAcceptability(bad, "sam@example.com", NOW);
    assert.strictEqual(verdict.ok, false, JSON.stringify(bad));
  }
});

check("a record with no email address on it seats nobody", () => {
  // The hole this closes: the address check compares the invited address to the
  // signed-in one, and an empty invited address compares equal to nothing —
  // so a half-written record would have admitted whoever opened the link.
  for (const email of ["", null, undefined, "   "]) {
    const verdict = invitationAcceptability(invitation({ email }), "anyone@example.com", NOW);
    assert.strictEqual(verdict.ok, false, JSON.stringify(email));
    assert.strictEqual(verdict.reason, "not_found");
  }
});

check("every refusal has a sentence, and it is not a code", () => {
  const reasons = new Set();
  for (const [invite, email] of [
    [invitation({ status: "accepted" }), "sam@example.com"],
    [invitation({ status: "revoked" }), "sam@example.com"],
    [invitation({ expiresAt: NOW - 1 }), "sam@example.com"],
    [invitation(), "someone@else.com"],
    [invitation(), ""],
    [null, "sam@example.com"]
  ]) {
    reasons.add(invitationAcceptability(invite, email, NOW).reason);
  }
  for (const reason of reasons) {
    const sentence = INVITATION_REFUSALS[reason];
    assert.ok(sentence, `no sentence for ${reason}`);
    assert.ok(/[a-z] [a-z]/i.test(sentence), `${reason} reads like a code: ${sentence}`);
  }
  assert.strictEqual(reasons.size, 6, "one of the refusals stopped being reachable");
});

check("the preview tells a stranger enough to decide, and nothing about anybody else", () => {
  const preview = invitationPreview(invitation({ invitedByName: "Ada", acceptedByUid: "secret-uid", companyId: "acme" }));
  assert.strictEqual(preview.companyName, "Acme");
  assert.strictEqual(preview.invitedByName, "Ada");
  assert.strictEqual(preview.role, "member");
  // The workspace id is a credential in the old join-request flow, so it does
  // not travel to a page anybody with a URL can open.
  assert.ok(!("companyId" in preview), "the preview leaks the workspace id");
  assert.ok(!("acceptedByUid" in preview), "the preview leaks a uid");
  assert.strictEqual(invitationPreview(null), null);
});

check("an invitation expires two weeks out, not never and not tomorrow", () => {
  const days = (invitationExpiresAtMs(NOW) - NOW) / (24 * 60 * 60 * 1000);
  assert.strictEqual(days, 14);
});

// ---- the wiring, which no unit test of the module can see -----------------
//
// Three properties live in index.js rather than in the module, and each one is
// the whole feature if it is wrong.
const SOURCE = require("fs").readFileSync(require("path").join(__dirname, "..", "..", "index.js"), "utf8");

function callableBody(name) {
  const start = SOURCE.indexOf(`exports.${name} = onCall(`);
  assert.ok(start > 0, `${name} is where it was`);
  const end = SOURCE.indexOf("\n});", start);
  return SOURCE.slice(start, end);
}

check("the raw token is emailed and never written to the database", () => {
  const body = callableBody("inviteWorkspaceMember");
  // The document is addressed BY the hash, and the token appears only in the
  // helpers that mail it and build the URL. If it ever reaches a set() payload,
  // a database dump becomes a set of working keys.
  const writes = body.match(/\.set\(\{[\s\S]*?\}/g) || [];
  for (const write of writes) {
    assert.ok(!/(^|[^A-Za-z])token\s*[,:]/.test(write), `a write carries the token:\n${write.slice(0, 200)}`);
  }
  assert.ok(/mintInvitationToken\(\)/.test(body), "the token is minted here");
  assert.ok(/\.doc\(id\)\.set\(/.test(body), "the invitation is stored under the hash");
});

check("accepting takes the workspace from the invitation, never from the caller", () => {
  const body = callableBody("acceptWorkspaceInvitation");
  assert.ok(
    /const companyId = String\(invitation\.companyId/.test(body),
    "the workspace must come off the invitation"
  );
  assert.ok(
    !/request\.data\?\.companyId|request\.data\.companyId/.test(body),
    "accepting must never read a companyId the caller supplied"
  );
});

check("the seat is checked before the membership is written, not after", () => {
  const body = callableBody("acceptWorkspaceInvitation");
  const seatCheck = body.indexOf("validateBillingAction(\"add_team_member\"");
  const write = body.indexOf("batch.update(companyRef");
  assert.ok(seatCheck > 0, "accepting checks the seat limit");
  assert.ok(write > 0, "accepting writes the membership");
  assert.ok(seatCheck < write, "the seat limit is checked before anybody is seated");
  // And the refusal happens on ACCEPT, not only on invite: the link lives for
  // two weeks and the plan can shrink inside that.
  assert.ok(/throw new HttpsError\("failed-precondition", teamSeatLimitMessage/.test(body));
});

check("the preview never answers with the workspace id", () => {
  const body = callableBody("previewWorkspaceInvitation");
  assert.ok(/invitationPreview\(data\)/.test(body), "the preview goes through the module");
  assert.ok(!/companyId:/.test(body), "the preview response names a companyId");
});

(async () => {
  for (const { name, run } of checks) {
    try { await run(); console.log("PASS ", name); }
    catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).split("\n")[0].slice(0, 200)); }
  }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log("\n✅ TEAM INVITATIONS GEÇTİ");
})();
