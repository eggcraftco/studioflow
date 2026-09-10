// MIG-001 — the common engine is opened per connection or per provider, by a
// flag document, never by a deploy. `appConfig/commerce`:
//
//   { shadow: { enabled: false, providers: { shopify: true }, connections: { "shopify:eggcraft.myshopify.com": true } },
//     queue:  { enabled: false, providers: {}, connections: {} },
//     connectors: { enabled: false, providers: { ebay: false }, connections: { "ebay:<connectionId>": false },
//                   workspaces: { "ebay:<companyId>": true, "ebay:*": false } } }
//
// A connection entry beats a provider entry beats the global switch, so one
// store can run in shadow while the rest of the world is untouched.
//
// `workspaces` is the second, narrower gate on STARTING a connection
// (`beginEbayConnect`): a provider may be switched on for the sweeps and the
// queue while no workspace, or exactly one, is allowed to begin a new OAuth
// flow. Closed by default — no entry means no workspace may begin, whatever the
// provider entry says; `"ebay:*": true` is the explicit way to open it to all,
// and an exact `"ebay:<companyId>"` entry beats the wildcard in both directions. Cached
// for a minute per instance: a webhook burst must not become a read storm.
//
// `connectors` is the runtime switch for a whole connector (eBay first): the
// sweeps, Sync now, import and the queue read it per connection; get, verify,
// disconnect and account-deletion compliance never do. Off by default, so a
// deploy activates nothing and a rollback needs no redeploy.
const CACHE_MS = 60 * 1000;
let cache = { at: 0, flags: null };

const EMPTY = Object.freeze({
  shadow: { enabled: false, providers: {}, connections: {} },
  queue: { enabled: false, providers: {}, connections: {} },
  connectors: { enabled: false, providers: {}, connections: {} }
});

async function readCommerceFlags(db, { now = Date.now(), force = false } = {}) {
  if (!force && cache.flags && now - cache.at < CACHE_MS) return cache.flags;
  let flags = EMPTY;
  try {
    const snap = await db.collection("appConfig").doc("commerce").get();
    const data = snap.exists ? (snap.data() || {}) : {};
    flags = {
      shadow: { ...EMPTY.shadow, ...(data.shadow || {}) },
      queue: { ...EMPTY.queue, ...(data.queue || {}) },
      connectors: { ...EMPTY.connectors, ...(data.connectors || {}) }
    };
  } catch (error) {
    console.warn("commerce flags: read failed, everything stays off:", error?.message || error);
  }
  cache = { at: now, flags };
  return flags;
}

function flagEnabled(flags, area, provider, connectionId) {
  const section = (flags && flags[area]) || EMPTY[area] || EMPTY.shadow;
  const key = `${provider}:${connectionId}`;
  if (section.connections && Object.prototype.hasOwnProperty.call(section.connections, key)) return section.connections[key] === true;
  if (section.providers && Object.prototype.hasOwnProperty.call(section.providers, provider)) return section.providers[provider] === true;
  return section.enabled === true;
}

/**
 * May this workspace BEGIN a connection with this provider? Exact entry, then the
 * wildcard, then closed — never the provider entry and never the global switch,
 * so switching a provider on for its sweeps opens no consent screen anywhere.
 */
function workspaceEnabled(flags, area, provider, companyId) {
  const section = (flags && flags[area]) || EMPTY[area] || EMPTY.shadow;
  const workspaces = section.workspaces && typeof section.workspaces === "object" ? section.workspaces : {};
  const exact = `${provider}:${String(companyId || "")}`;
  if (companyId && Object.prototype.hasOwnProperty.call(workspaces, exact)) return workspaces[exact] === true;
  const wildcard = `${provider}:*`;
  if (Object.prototype.hasOwnProperty.call(workspaces, wildcard)) return workspaces[wildcard] === true;
  return false;
}

function resetCommerceFlagCache() { cache = { at: 0, flags: null }; }

module.exports = { readCommerceFlags, flagEnabled, workspaceEnabled, resetCommerceFlagCache, EMPTY_COMMERCE_FLAGS: EMPTY };
