// MIG-001 — the common engine is opened per connection or per provider, by a
// flag document, never by a deploy. `appConfig/commerce`:
//
//   { shadow: { enabled: false, providers: { shopify: true }, connections: { "shopify:eggcraft.myshopify.com": true } },
//     queue:  { enabled: false, providers: {}, connections: {} } }
//
// A connection entry beats a provider entry beats the global switch, so one
// store can run in shadow while the rest of the world is untouched. Cached
// for a minute per instance: a webhook burst must not become a read storm.
const CACHE_MS = 60 * 1000;
let cache = { at: 0, flags: null };

const EMPTY = Object.freeze({ shadow: { enabled: false, providers: {}, connections: {} }, queue: { enabled: false, providers: {}, connections: {} } });

async function readCommerceFlags(db, { now = Date.now(), force = false } = {}) {
  if (!force && cache.flags && now - cache.at < CACHE_MS) return cache.flags;
  let flags = EMPTY;
  try {
    const snap = await db.collection("appConfig").doc("commerce").get();
    const data = snap.exists ? (snap.data() || {}) : {};
    flags = {
      shadow: { ...EMPTY.shadow, ...(data.shadow || {}) },
      queue: { ...EMPTY.queue, ...(data.queue || {}) }
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

function resetCommerceFlagCache() { cache = { at: 0, flags: null }; }

module.exports = { readCommerceFlags, flagEnabled, resetCommerceFlagCache, EMPTY_COMMERCE_FLAGS: EMPTY };
