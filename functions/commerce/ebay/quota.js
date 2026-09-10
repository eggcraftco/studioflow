"use strict";

// eBay's daily call allowance, spent per connection first and app-wide second
// (design §7.4). eBay limits calls per APPLICATION per day; without a share per
// connection, one seller's Sync now button could spend every other workspace's
// sweep. So each connection gets a tenth of the day, the sweep stands down at
// three quarters, the nightly pass and the import at four fifths, and people
// (Sync now, verify, preview) are served up to 95 %. Never the Amazon bucket,
// never Etsy's numbers.
//
// The pure verdict is here with the counter's shape; the ledger that reads and
// writes `ebayQuota/{YYYY-MM-DD}` is created with a Firestore handed in.
const DEFAULT_DAILY_CAP = 5000;
const CONNECTION_SHARE = 0.10;
const APP_CEILING = 0.95;
const STAND_DOWN = Object.freeze({ sweep: 0.75, nightly: 0.80, import: 0.80, people: APP_CEILING });
const FAMILIES = Object.freeze(["orders", "fulfillments", "identity", "notification"]);
const MAX_UNKNOWN_KIDS_PER_HOUR = 20;
const MAX_VERIFIED_PER_HOUR = 3000;

/**
 * @param {object} input { total, connection, perDay, priority: sweep|nightly|import|people }
 * @returns {{allowed:boolean, reason:string, share:number, ceiling:number}}
 */
function quotaVerdict({ total = 0, connection = 0, perDay = DEFAULT_DAILY_CAP, priority = "people" } = {}) {
  const cap = Number(perDay) > 0 ? Number(perDay) : DEFAULT_DAILY_CAP;
  const share = Math.floor(cap * CONNECTION_SHARE);
  const ceiling = Math.floor(cap * (STAND_DOWN[priority] || APP_CEILING));
  const spentByConnection = Number(connection) || 0;
  const spentInTotal = Number(total) || 0;
  if (spentByConnection >= share) return { allowed: false, reason: "connection_share_spent", share, ceiling };
  if (spentInTotal >= ceiling) return { allowed: false, reason: "app_budget_spent", share, ceiling };
  return { allowed: true, reason: "", share, ceiling };
}

function dayKey(nowMs) { return new Date(Number(nowMs) || Date.now()).toISOString().slice(0, 10); }
function hourKey(nowMs) { return new Date(Number(nowMs) || Date.now()).toISOString().slice(0, 13).replace("T", "_"); }

/** The per-connection view a health screen shows. */
function quotaView(dayDoc, connectionId, perDay = DEFAULT_DAILY_CAP) {
  const row = dayDoc || {};
  const cap = Number(perDay) > 0 ? Number(perDay) : DEFAULT_DAILY_CAP;
  const byConnection = row.byConnection && typeof row.byConnection === "object" ? row.byConnection : {};
  return { today: Number(byConnection[String(connectionId)] || 0), share: Math.floor(cap * CONNECTION_SHARE), cap, appToday: Number(row.calls || 0) };
}

/**
 * The counter document: `ebayQuota/{YYYY-MM-DD}` with nested maps (never dotted
 * keys). `charge` refuses BEFORE the request and throws an error the sweep and
 * the client classify as rate limiting.
 */
function createQuotaLedger({ db, FieldValue, perDay = DEFAULT_DAILY_CAP, now = () => Date.now(), collection = "ebayQuota" }) {
  const ref = (ms) => db.collection(collection).doc(dayKey(ms));
  const inc = (n) => (FieldValue && typeof FieldValue.increment === "function" ? FieldValue.increment(n) : n);
  return {
    async read(ms = now()) { const snap = await ref(ms).get(); return snap.exists ? (snap.data() || {}) : {}; },
    /** One call about to be made for `connectionId` in `family`, at `priority`. Throws { code: "rate_limited", reason } when refused. */
    async charge({ connectionId = "", family = "orders", priority = "people" } = {}) {
      const ms = now();
      const today = await this.read(ms);
      const byConnection = today.byConnection && typeof today.byConnection === "object" ? today.byConnection : {};
      const verdict = quotaVerdict({ total: Number(today.calls || 0), connection: connectionId ? Number(byConnection[connectionId] || 0) : 0, perDay, priority });
      if (!verdict.allowed) {
        const error = new Error(`ebay_quota_${verdict.reason}`);
        error.code = "rate_limited"; error.reason = verdict.reason; error.errorClass = "transient"; error.status = 429;
        throw error;
      }
      const fam = FAMILIES.includes(family) ? family : "orders";
      const patch = { day: dayKey(ms), calls: inc(1), byFamily: { [fam]: inc(1) }, updatedAtMs: ms };
      if (connectionId) patch.byConnection = { [String(connectionId)]: inc(1) };
      await ref(ms).set(patch, { merge: true });
      return verdict;
    },
    /** A distinct unknown `kid` fetched this hour; answers whether the hour's budget is spent. */
    async noteUnknownKid(ms = now()) {
      const key = hourKey(ms);
      const today = await this.read(ms);
      const spent = Number(((today.unknownKidsByHour || {})[key]) || 0);
      if (spent >= MAX_UNKNOWN_KIDS_PER_HOUR) return { allowed: false, count: spent };
      await ref(ms).set({ day: dayKey(ms), unknownKidsByHour: { [key]: inc(1) }, updatedAtMs: ms }, { merge: true });
      return { allowed: true, count: spent + 1 };
    },
    /** A verified notification this hour; answers whether the post-verification budget is spent. */
    async noteVerified(ms = now()) {
      const key = hourKey(ms);
      const today = await this.read(ms);
      const spent = Number(((today.verifiedByHour || {})[key]) || 0);
      if (spent >= MAX_VERIFIED_PER_HOUR) return { allowed: false, count: spent };
      await ref(ms).set({ day: dayKey(ms), verifiedByHour: { [key]: inc(1) }, updatedAtMs: ms }, { merge: true });
      return { allowed: true, count: spent + 1 };
    },
    view(dayDoc, connectionId) { return quotaView(dayDoc, connectionId, perDay); }
  };
}

module.exports = { DEFAULT_DAILY_CAP, CONNECTION_SHARE, APP_CEILING, STAND_DOWN, FAMILIES, MAX_UNKNOWN_KIDS_PER_HOUR, MAX_VERIFIED_PER_HOUR, quotaVerdict, dayKey, hourKey, quotaView, createQuotaLedger };
