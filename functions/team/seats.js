"use strict";

// Who keeps their seat when a workspace drops to a smaller plan.
//
// The decision is that over-limit members lose access rather than being left
// read-only: an ex-colleague who can still open customer records, invoices and
// files is a security problem, not a courtesy. But nothing about them is
// deleted — the name, the role, the order assignments and every history entry
// they wrote stay exactly where they are, so the workspace's past still reads
// correctly and one press restores them if the plan comes back.
//
// Its own module because the rule has to be the same in three places that
// cannot see each other: the trigger that reacts to a plan change, the callable
// that lets an owner choose differently, and the tests.

// Suspension is kept in its own map on the workspace document —
// `suspendedMembers: { uid: { at, reason, by } }` — and NOT as a flag inside the
// member record, for one reason: the rules can forbid a client to touch a
// top-level field absolutely, but cannot forbid one sub-key of `members`, which
// an owner on a Team plan is otherwise allowed to edit. A flag the owner can
// flip from a client is a workspace running seven people on five seats.
//
// Membership is unchanged by any of this. The member record, the role, the
// access map, the assignments and the history all stay exactly as they were.

/** The suspension map as stored, whatever nonsense the document holds. */
function suspendedMap(data = {}) {
  const raw = data && typeof data === "object" ? data.suspendedMembers : null;
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

/** True when this uid holds no access. Absent means active. */
function isSuspendedUid(data = {}, uid = "") {
  const key = String(uid || "").trim();
  return Boolean(key) && Object.prototype.hasOwnProperty.call(suspendedMap(data), key);
}

/**
 * The seconds a member joined at, for ordering. Firestore hands timestamps back
 * in more than one shape depending on who wrote them and through which SDK, and
 * a member added before this field existed has none at all — those sort last,
 * because the only honest thing to say about them is that we do not know.
 */
function joinedAtSeconds(member) {
  const raw = member && typeof member === "object"
    ? (member.addedAt ?? member.joinedAt ?? member.createdAt)
    : null;
  if (raw == null) return Number.POSITIVE_INFINITY;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw > 1e12 ? raw / 1000 : raw;
  if (typeof raw === "string") {
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed / 1000 : Number.POSITIVE_INFINITY;
  }
  if (typeof raw.toMillis === "function") return raw.toMillis() / 1000;
  if (typeof raw.seconds === "number") return raw.seconds;
  if (typeof raw._seconds === "number") return raw._seconds;
  if (raw instanceof Date) return raw.getTime() / 1000;
  return Number.POSITIVE_INFINITY;
}

/** Everyone but the owner who holds a seat, oldest first, ties broken by uid. */
function seatHolders(data = {}) {
  const owner = String(data.ownerUid || "").trim();
  const raw = data.members;
  const map = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return Object.keys(map)
    .filter((uid) => uid && map[uid] && uid !== owner)
    .map((uid) => ({ uid, member: map[uid], joinedAt: joinedAtSeconds(map[uid]) }))
    .sort((a, b) => (a.joinedAt - b.joinedAt) || (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0));
}

/** Active seats in use, counting the owner, who always has one. */
function activeSeatCount(data = {}) {
  return seatHolders(data).filter((row) => !isSuspendedUid(data, row.uid)).length + 1;
}

/**
 * The members a drop to `seatLimit` must suspend, and the ones it must not.
 *
 * The owner is never suspended: they hold the subscription, and a workspace
 * whose owner cannot open it is a workspace nobody can rescue. Everyone else is
 * kept longest-standing first — an order the owner can predict and argue with,
 * which "whoever the map happened to list first" is not.
 *
 * Already-suspended members stay suspended. An upgrade does not hand access
 * back on its own: the owner decides who returns, so this never un-suspends.
 */
function seatsToSuspend(data = {}, seatLimit = 1) {
  const limit = Number.isFinite(Number(seatLimit)) ? Math.max(Math.floor(Number(seatLimit)), 1) : 1;
  const holders = seatHolders(data);
  const keepable = Math.max(limit - 1, 0); // the owner's seat is spent.

  const suspend = [];
  let kept = 0;
  for (const row of holders) {
    if (isSuspendedUid(data, row.uid)) continue;
    if (kept < keepable) { kept += 1; continue; }
    suspend.push(row.uid);
  }
  return suspend;
}

/**
 * Whether one suspended member can be let back in.
 *
 * Restoring is the only operation that can take a workspace back over its own
 * limit, so it is the one that has to ask. The owner's seat is already counted.
 */
function canRestoreMember(data = {}, seatLimit = 1) {
  const limit = Number.isFinite(Number(seatLimit)) ? Math.max(Math.floor(Number(seatLimit)), 1) : 1;
  return activeSeatCount(data) < limit;
}

module.exports = {
  suspendedMap,
  isSuspendedUid,
  joinedAtSeconds,
  seatHolders,
  activeSeatCount,
  seatsToSuspend,
  canRestoreMember
};
