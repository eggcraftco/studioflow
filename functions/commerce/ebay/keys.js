"use strict";

// The two eBay secrets that are keys — EBAY_TOKEN_KEY (boxes the seller's
// tokens) and EBAY_HASH_KEY (keys the buyer hashes) — are strings of ONE OR TWO
// keys separated by whitespace or a comma. The first entry is the key we write
// with; the second is read-only, and exists so a rotation can finish by itself:
// put the new key first and the old one second, deploy, wait for every box and
// every index row to move, then drop the second entry.
//
// Each entry is validated with the envelope's own rule (32 bytes as 64 hex or
// base64) at FIRST USE, so a mistyped key throws on the first call rather than
// silently at the moment the old key is retired. Pure: no network, no clock.
const { tokenKeyBytes } = require("../../security/tokenBox");

const MAX_KEYS = 2;

/**
 * The keys a secret carries, in order — index 0 is the write key.
 *
 * @param {string} secret  "key1" | "key1 key2" | "key1,key2"
 * @returns {string[]}
 */
function keyListOf(secret) {
  const raw = String(secret || "").trim();
  if (!raw) throw new Error("No eBay key is configured.");
  const entries = raw.split(/[\s,]+/).map((v) => v.trim()).filter(Boolean);
  if (!entries.length) throw new Error("No eBay key is configured.");
  if (entries.length > MAX_KEYS) throw new Error(`An eBay key secret carries at most ${MAX_KEYS} keys (new first, old second); found ${entries.length}.`);
  for (const entry of entries) tokenKeyBytes(entry);   // throws on a bad entry
  return entries;
}

/** The key new boxes and new index rows are written under. */
function writeKeyOf(secret) { return keyListOf(secret)[0]; }

module.exports = { MAX_KEYS, keyListOf, writeKeyOf };
