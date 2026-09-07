"use strict";

// The buckets a NivaDesk file link may name. Identity, not shape.
//
// THIS IS A COPY, and deliberately one. The definition it copies is
// studioflow-web/lib/studioflow/fileProxyGuards.ts, which the /f/ viewer route
// imports. firebase.json ships only the `functions/` directory to Cloud Functions
// and the web ships only `studioflow-web`, so neither bundle can import a file
// from the other; the choice is a copy or a divergence waiting to happen.
// studioflow-web/scripts/check-file-proxy-guards.mjs ("npm run test:file-proxy")
// loads BOTH shipped modules and fails the moment these two lists differ.
// Do not edit one without the other.
//
// Why this file has to exist at all: fixing the viewer alone moves the abuse
// rather than ending it. nvCreateFileLink takes a caller-supplied Firebase
// Storage URL and stores whatever bucket appears in it, so a signed-in member of
// any self-serve workspace could mint a short /f/<id> link pointing at his own
// Firebase project — a cleaner, query-string-free version of the same link, on
// our hostname. The check belongs at both doors or at neither.

/** Both entries name the SAME bucket; the second is the legacy alias Firebase
 *  projects still answer to, kept so links minted before the rename keep working. */
const ALLOWED_FILE_BUCKETS = Object.freeze([
  "eggcraft-studio.firebasestorage.app",
  "eggcraft-studio.appspot.com"
]);

/** True only for one of our own buckets. Case-insensitive. */
function isAllowedFileBucket(bucket) {
  const candidate = String(bucket == null ? "" : bucket).trim().toLowerCase();
  if (!candidate) return false;
  return ALLOWED_FILE_BUCKETS.includes(candidate);
}

module.exports = { ALLOWED_FILE_BUCKETS, isAllowedFileBucket };
