"use strict";

// Keyed hashes for buyer identifiers.
//
// An eBay username is a short, low-entropy handle; an unsalted SHA-256 of it is
// reversible with a dictionary in an afternoon, and the deletion ledger keeps
// its hashes for 400 days. So every identifier stored at rest — the ebayBuyers
// index, the deletion ledger, the Cloud Tasks payload, the seller match on the
// connection — is HMAC-SHA256 under a server-held key (EBAY_HASH_KEY), never a
// plain digest. Without the key the hash says nothing.
//
// The key is never derived from EBAY_TOKEN_KEY: rotating one must not orphan
// the other. Pure: no network, no clock, no Firestore.
const crypto = require("crypto");
const { tokenKeyBytes } = require("../../security/tokenBox");
const { keyListOf } = require("./keys");

/** HMAC-SHA256 hex of `value` under one key. The value is hashed exactly as given. */
function buyerHash(key, value) {
  return crypto.createHmac("sha256", tokenKeyBytes(key)).update(String(value == null ? "" : value), "utf8").digest("hex");
}

/** The form a username is hashed in: trimmed, lower-cased (eBay handles are case-insensitive). */
function normalizeUsername(username) { return String(username || "").trim().toLowerCase(); }

/** The form a user id is hashed in: trimmed, as eBay gave it (ids are opaque and case-significant). */
function normalizeUserId(userId) { return String(userId || "").trim(); }

function usernameHash(key, username) { return buyerHash(key, normalizeUsername(username)); }
function userIdHash(key, userId) { return buyerHash(key, normalizeUserId(userId)); }

/**
 * The same value hashed under EVERY key the secret offers, write key first —
 * what a deletion match runs with, so rows written under the previous key are
 * still found while a rotation is in progress.
 */
function hashesUnderEveryKey(secret, value) {
  const keys = keyListOf(secret);
  const out = [];
  for (const key of keys) {
    const digest = buyerHash(key, value);
    if (!out.includes(digest)) out.push(digest);
  }
  return out;
}

module.exports = { buyerHash, normalizeUsername, normalizeUserId, usernameHash, userIdHash, hashesUnderEveryKey };
