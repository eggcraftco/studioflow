"use strict";

// The buckets a NivaDesk file link may name. Identity, not shape.
//
// THIS IS A COPY, and deliberately one. The definition it copies is
// studioflow-web/lib/studioflow/fileProxyGuards.ts, which the /f/ viewer route
// imports. firebase.json ships only the `functions/` directory to Cloud Functions
// and the web ships only `studioflow-web`, so neither bundle can import a file
// from the other; the choice is a copy or a divergence waiting to happen.
// studioflow-web/scripts/check-file-proxy-guards.mjs ("npm run test:file-proxy")
// loads BOTH shipped modules and fails the moment these two lists differ — and,
// because two copies can perfectly agree on a third party's bucket, also pins
// each list to exactly the two names below. Do not edit one without the other.
//
// Why this file has to exist at all: fixing the viewer alone moves the abuse
// rather than ending it. nvCreateFileLink takes a caller-supplied Firebase
// Storage URL and stores whatever bucket appears in it, so a signed-in member of
// any self-serve workspace could mint a short /f/<id> link pointing at his own
// Firebase project — a cleaner, query-string-free version of the same link, on
// our hostname. The check belongs at both doors or at neither.
//
// And at BOTH ENDS of each door. A gate on the write is not retroactive: a row
// already carrying a foreign bucket — planted before this landed, or during the
// window between the web build and the functions deploy — is honoured for ever
// by whatever reads it back. So nvViewSharedFile re-checks the stored bucket
// before it builds a storage URL, and so does the web /f/ route. The control is
// then independent of deploy ordering and of what is already in the store.

/** Both entries name the SAME bucket; the second is the legacy alias Firebase
 *  projects still answer to, kept so links minted before the rename keep working. */
const ALLOWED_FILE_BUCKETS = Object.freeze([
  "eggcraft-studio.firebasestorage.app",
  "eggcraft-studio.appspot.com"
]);

/**
 * The allowlist entry this bucket IS, or null.
 *
 * Returns the matched entry rather than a boolean so callers use the value that
 * was checked instead of the one they passed in. Normalising for the comparison
 * and then using the caller's spelling is a checked-value/used-value split; it
 * does not reach a foreign bucket (GCS bucket names are lowercase-only), but it
 * is how a padded URL — `/v0/b/%20eggcraft-studio.appspot.com/o/…` — used to mint
 * a fileShares row whose every link 404s for ever.
 */
function canonicalFileBucket(bucket) {
  const candidate = String(bucket == null ? "" : bucket).trim().toLowerCase();
  if (!candidate) return null;
  return ALLOWED_FILE_BUCKETS.includes(candidate) ? candidate : null;
}

/** True only for one of our own buckets. Case-insensitive. */
function isAllowedFileBucket(bucket) {
  return canonicalFileBucket(bucket) !== null;
}

module.exports = { ALLOWED_FILE_BUCKETS, canonicalFileBucket, isAllowedFileBucket };
