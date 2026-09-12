// The Sales pilot switch. `appConfig/sales`:
//
//   { enabled: false, workspaces: { "<companyId>": true, "*": false } }
//
// Closed twice over: the server switch has to be on AND the workspace has to be
// listed, so a deploy opens nothing anywhere and an empty allowlist means
// nobody. An exact workspace entry beats the wildcard in both directions.
//
// Clients never read this document — no rule admits `appConfig` — they ask
// `getSalesCapability`. Cached for a minute per instance like the commerce
// flags, so a list screen cannot turn into a read storm. A failed read leaves
// everything off rather than guessing.
const CACHE_MS = 60 * 1000;
let cache = { at: 0, flags: null };

const EMPTY = Object.freeze({ enabled: false, workspaces: {} });

async function readSalesFlags(db, { now = Date.now(), force = false } = {}) {
  if (!force && cache.flags && now - cache.at < CACHE_MS) return cache.flags;
  let flags = EMPTY;
  try {
    const snap = await db.collection("appConfig").doc("sales").get();
    const data = snap.exists ? (snap.data() || {}) : {};
    flags = {
      enabled: data.enabled === true,
      workspaces: data.workspaces && typeof data.workspaces === "object" && !Array.isArray(data.workspaces) ? data.workspaces : {}
    };
  } catch (error) {
    console.warn("sales flags: read failed, Sales stays closed:", error?.message || error);
    flags = EMPTY;
  }
  cache = { at: now, flags };
  return flags;
}

/** Is the Sales pilot open for this workspace? Exact entry, then `*`, then closed. */
function salesWorkspaceEnabled(flags, companyId) {
  if (!flags || flags.enabled !== true) return false;
  const workspaces = flags.workspaces && typeof flags.workspaces === "object" ? flags.workspaces : {};
  const id = String(companyId || "").trim();
  if (id && Object.prototype.hasOwnProperty.call(workspaces, id)) return workspaces[id] === true;
  if (Object.prototype.hasOwnProperty.call(workspaces, "*")) return workspaces["*"] === true;
  return false;
}

function resetSalesFlagCache() { cache = { at: 0, flags: null }; }

module.exports = { readSalesFlags, salesWorkspaceEnabled, resetSalesFlagCache, EMPTY_SALES_FLAGS: EMPTY };
