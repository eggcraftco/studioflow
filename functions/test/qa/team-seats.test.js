// Losing a seat must not lose a person.
//
// The dangerous half of this feature is not the suspending, it is everything
// that must survive it: the name on old orders, the history entries, the
// assignments. So these check the choice of who goes, and that the rule is
// stable — an owner who reads "we kept your two longest-standing colleagues"
// should get the same two every time, not whoever the object happened to list
// first.
const assert = require("assert");
const {
  isSuspendedUid, activeSeatCount, seatsToSuspend, canRestoreMember, seatHolders
} = require("../../team/seats");

let failures = 0;
const checks = [];
function check(name, run) { checks.push({ name, run }); }

/** A member as Firestore hands one back. */
function member(joinedSeconds, extra = {}) {
  return { role: "member", addedAt: { seconds: joinedSeconds, nanoseconds: 0 }, ...extra };
}

/** A workspace document: members, its owner, and who is currently out. */
function workspace(members, ownerUid = "owner", suspendedUids = []) {
  const suspendedMembers = {};
  for (const uid of suspendedUids) suspendedMembers[uid] = { reason: "plan_downgrade" };
  return { ownerUid, members, suspendedMembers };
}

check("a workspace on one seat suspends everyone but the owner", () => {
  const members = { owner: member(1), a: member(2), b: member(3) };
  assert.deepStrictEqual(seatsToSuspend(workspace(members), 1), ["a", "b"]);
});

check("the owner is never in the list, whatever the limit says", () => {
  const members = { owner: member(9), a: member(1) };
  for (const limit of [1, 0, -4, NaN, null, undefined, "nonsense"]) {
    assert.ok(!seatsToSuspend(workspace(members), limit).includes("owner"), String(limit));
  }
});

check("the longest-standing colleagues keep their seats", () => {
  const members = {
    owner: member(1),
    oldest: member(100),
    middle: member(200),
    newest: member(300)
  };
  // Three seats: the owner plus two, so the newest joiner is the one who goes.
  assert.deepStrictEqual(seatsToSuspend(workspace(members), 3), ["newest"]);
  assert.deepStrictEqual(seatsToSuspend(workspace(members), 2), ["middle", "newest"]);
});

check("the order does not depend on how the object was built", () => {
  const forwards = { owner: member(1), z: member(100), a: member(300) };
  const backwards = { a: member(300), z: member(100), owner: member(1) };
  assert.deepStrictEqual(seatsToSuspend(workspace(forwards), 2), seatsToSuspend(workspace(backwards), 2));
  assert.deepStrictEqual(seatsToSuspend(workspace(forwards), 2), ["a"]);
});

check("members who joined before the field existed sort last, not first", () => {
  // "We do not know when they joined" is not "they have been here forever" —
  // guessing the flattering answer would suspend a known colleague to protect
  // an unknown one.
  const members = { owner: member(1), known: member(500), unknown: { role: "member" } };
  assert.deepStrictEqual(seatsToSuspend(workspace(members), 2), ["unknown"]);
});

check("every shape Firestore returns a timestamp in is read the same way", () => {
  const seconds = 1_700_000_000;
  const shapes = [
    { seconds, nanoseconds: 0 },
    { _seconds: seconds, _nanoseconds: 0 },
    { toMillis: () => seconds * 1000 },
    new Date(seconds * 1000),
    seconds * 1000,
    seconds,
    new Date(seconds * 1000).toISOString()
  ];
  for (const addedAt of shapes) {
    const members = { owner: member(1), early: { role: "member", addedAt }, late: member(seconds + 10) };
    assert.deepStrictEqual(
      seatsToSuspend(workspace(members), 2), ["late"],
      `timestamp shape ${JSON.stringify(addedAt)} was not read`
    );
  }
});

check("a member already suspended is not suspended again", () => {
  const members = { owner: member(1), gone: member(100), here: member(200) };
  // One seat: the active one goes, and the already-gone one is not listed twice.
  assert.deepStrictEqual(seatsToSuspend(workspace(members, "owner", ["gone"]), 1), ["here"]);
});

check("a suspended member does not hold a seat", () => {
  const members = { owner: member(1), a: member(2), b: member(3) };
  assert.strictEqual(activeSeatCount(workspace(members, "owner", ["b"])), 2);
});

check("the count always includes the owner, even in an empty members map", () => {
  assert.strictEqual(activeSeatCount(workspace({})), 1);
  assert.strictEqual(activeSeatCount(workspace({ owner: member(1) })), 1);
});

check("an upgrade hands nobody their access back on its own", () => {
  // The decision is that the OWNER chooses who returns. A rule that restored
  // people automatically would re-admit an ex-employee the moment a card was
  // charged, which is the exact thing suspension exists to prevent.
  const doc = workspace({ owner: member(1), gone: member(2) }, "owner", ["gone"]);
  assert.deepStrictEqual(seatsToSuspend(doc, 5), []);
  assert.strictEqual(isSuspendedUid(doc, "gone"), true);
});

check("restoring is refused when the workspace is already full", () => {
  const full = { owner: member(1), a: member(2) };
  assert.strictEqual(canRestoreMember(workspace(full), 2), false);
  assert.strictEqual(canRestoreMember(workspace(full), 3), true);
  const room = { owner: member(1), a: member(2) };
  assert.strictEqual(canRestoreMember(workspace(room, "owner", ["a"]), 2), true);
});

check("suspending is idempotent: running it twice changes nothing the second time", () => {
  const members = { owner: member(1), a: member(2), b: member(3), c: member(4) };
  const first = seatsToSuspend(workspace(members), 2);
  assert.deepStrictEqual(seatsToSuspend(workspace(members, "owner", first), 2), []);
});

check("a member map that is missing, null or an array does not throw", () => {
  for (const bad of [null, undefined, [], "members", 7]) {
    assert.deepStrictEqual(seatsToSuspend(workspace(bad), 1), [], String(bad));
    assert.strictEqual(activeSeatCount(workspace(bad)), 1, String(bad));
  }
});

check("an owner uid that is missing does not silently suspend the owner", () => {
  // Without an ownerUid nobody can be identified as the owner, so the safe
  // reading is that every record in the map is an ordinary member — but the
  // caller must never reach this with a real workspace.
  const members = { someone: member(2) };
  assert.deepStrictEqual(seatHolders({ ownerUid: "", members }).map((row) => row.uid), ["someone"]);
});

(async () => {
  for (const { name, run } of checks) {
    try { await run(); console.log("PASS ", name); }
    catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).split("\n")[0].slice(0, 200)); }
  }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log("\n✅ TEAM SEATS GEÇTİ");
})();
