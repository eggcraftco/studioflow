// The credential envelope.
//
// Firestore is encrypted at rest already, and these collections are denied to
// every client. This is the third layer, and it is here for the failure we
// cannot rule out: a rules regression, an export, a support tool reading a
// document it should not. A refresh token is weeks or months of access to
// somebody else's shop, bank or ledger; it should not be legible to anyone who
// merely reaches the row.
//
// This began inside the Etsy connector, because Etsy was the first to need it.
// It is used by Shopify, Square, WooCommerce, QuickBooks, Xero, PayPal, the
// bank feed and Pandle, so it lives here now and etsy.js re-exports it — one
// implementation, no copies to drift.
const crypto = require("crypto");

function tokenKeyBytes(rawKey) {
  const raw = String(rawKey || "").trim();
  if (!raw) throw new Error("No token encryption key is configured.");
  // Accept hex or base64 so the operator can paste whichever their generator
  // produced; both must decode to exactly 32 bytes for AES-256.
  let key = null;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) key = Buffer.from(raw, "hex");
  else {
    try {
      const decoded = Buffer.from(raw, "base64");
      if (decoded.length === 32) key = decoded;
    } catch (_error) { key = null; }
  }
  if (!key || key.length !== 32) {
    throw new Error("A token encryption key must be 32 bytes, as 64 hex characters or base64.");
  }
  return key;
}

/**
 * A short, non-secret fingerprint of a key, so a box can say which key wrote it.
 *
 * Eight hex characters of a SHA-256 over the key bytes. It identifies the key
 * without being usable to find it: the box already sits beside data the key
 * protects, so the identifier must not be a hint about the key itself.
 */
function tokenKeyId(rawKey) {
  return crypto.createHash("sha256").update(tokenKeyBytes(rawKey)).digest("hex").slice(0, 8);
}

/**
 * Every key a caller is willing to READ with, newest first.
 *
 * Accepts what callers have always passed — one key as a string — and also a
 * list, which is what makes rotation survivable. Blank entries are dropped so a
 * caller can pass `[primary, previous]` where previous is simply unset.
 */
function tokenKeyList(keyOrKeys) {
  const list = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
  const seen = new Set();
  const out = [];
  for (const entry of list) {
    const raw = String(entry || "").trim();
    if (!raw || seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
  }
  return out;
}

function encryptToken(plain, rawKey) {
  const text = String(plain || "");
  if (!text) return null;
  // The key a caller writes with is always the first one it offers.
  const key = tokenKeyList(rawKey)[0];
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", tokenKeyBytes(key), iv);
  const data = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return {
    v: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
    // Which key wrote this. Without it a rotation is a guess: every box has to
    // be tried against every key, and a box that fails under all of them cannot
    // be told apart from one whose key has simply been retired.
    k: tokenKeyId(key)
  };
}

/**
 * Reads a box under any key offered, newest first.
 *
 * Rotation used to be destructive: one key per connector, no key identifier in
 * the box, and no second key to fall back on — so changing a key made every
 * stored credential permanently unreadable and every seller had to reconnect.
 * Nothing announced that; the connections simply started failing.
 *
 * Now a caller passes the keys it is willing to read with. A box that names its
 * key is tried against that key first; anything else is tried in order. The
 * throw from the last attempt is the one that surfaces, so a genuinely corrupt
 * box still fails loudly rather than silently returning "".
 */
function decryptToken(box, keyOrKeys) {
  if (!box || typeof box !== "object" || !box.data) return "";
  const keys = tokenKeyList(keyOrKeys);
  if (!keys.length) throw new Error("No decryption key was offered.");

  // The named key first, when the box names one it was given.
  const named = String(box.k || "");
  const ordered = named
    ? [...keys.filter((k) => { try { return tokenKeyId(k) === named; } catch { return false; } }),
       ...keys.filter((k) => { try { return tokenKeyId(k) !== named; } catch { return true; } })]
    : keys;

  let lastError = null;
  for (const key of ordered) {
    try {
      const decipher = crypto.createDecipheriv(
        "aes-256-gcm",
        tokenKeyBytes(key),
        Buffer.from(String(box.iv || ""), "base64")
      );
      decipher.setAuthTag(Buffer.from(String(box.tag || ""), "base64"));
      const out = Buffer.concat([
        decipher.update(Buffer.from(String(box.data || ""), "base64")),
        decipher.final()
      ]);
      return out.toString("utf8");
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("The stored credential could not be read with any offered key.");
}

/**
 * Whether a box was written by the key a caller would write with now.
 *
 * A caller that re-boxes when this is false turns rotation into something that
 * finishes by itself: each credential moves to the new key the next time it is
 * used, and the old key can be retired once nothing answers to it.
 */
function tokenNeedsRebox(box, keyOrKeys) {
  if (!box || typeof box !== "object" || !box.data) return false;
  const primary = tokenKeyList(keyOrKeys)[0];
  if (!primary) return false;
  try { return String(box.k || "") !== tokenKeyId(primary); } catch { return false; }
}

/**
 * Reads a credential that may be sealed, or may be a plain string written before
 * this connector was sealed.
 *
 * Every connector that has a migration to finish needs the same three-way
 * answer — what the value is, whether the row should be rewritten, and whether
 * it cannot be read at all — and each one deciding for itself is how two of them
 * ended up storing plain text in the first place. So the decision lives here,
 * where a test can call it with real inputs rather than read the caller's source
 * and hope.
 *
 * `needsSealing` is false when no key is offered. Marking a row for resealing
 * that cannot then be sealed turns a working connection into a broken one; the
 * write paths refuse to add a new credential in the clear, which is the half of
 * the problem that actually matters.
 */
function openCredential({ box = null, legacy = "" } = {}, keyOrKeys = []) {
  const keys = tokenKeyList(keyOrKeys);
  const sealed = box && typeof box === "object" && box.data ? box : null;
  if (sealed) {
    if (!keys.length) return { token: "", needsSealing: false, unreadable: true };
    return { token: decryptToken(sealed, keys), needsSealing: tokenNeedsRebox(sealed, keys), unreadable: false };
  }
  const plain = String(legacy || "");
  return { token: plain, needsSealing: Boolean(plain) && keys.length > 0, unreadable: false };
}

module.exports = {
  tokenKeyBytes, tokenKeyId, tokenKeyList, encryptToken, decryptToken, tokenNeedsRebox, openCredential
};
