// The bounds the /f/ file viewer applies to bytes it fetches and to the bucket
// it is willing to name. One definition; app/f/[...slug]/route.ts imports it and
// holds none of its own.
//
// There is a SECOND copy of the bucket allowlist, in functions/security/fileBuckets.js.
// It is a copy on purpose and not by accident: firebase.json ships only the
// `functions/` directory to Cloud Functions and the web ships only
// `studioflow-web`, so neither bundle can import a file from the other. The two
// copies are held identical by studioflow-web/scripts/check-file-proxy-guards.mjs
// ("npm run test:file-proxy"), which loads BOTH shipped modules and fails the
// moment their lists differ — and, because two copies can perfectly agree on a
// third party's bucket, also pins each list to exactly the two names below.
// Do not edit one without the other.

/**
 * The buckets a /f/ link may name. An IDENTITY test, not a shape test.
 *
 * What was here before was `^[a-z0-9._-]+\.(appspot\.com|firebasestorage\.app)$`,
 * which admits every Firebase project on earth: an attacker uploads to his own
 * project, passes its bucket in `?b=`, and our hostname serves his bytes — on
 * nivadesk.app, on an unclaimed *.nivadesk.app subdomain, or on a customer's own
 * branded domain where the viewer drops our name entirely. The cost of that is
 * not the single victim; it is a Safe Browsing listing landing on a hostname
 * that also carries every portal, tracking, estimate and invoice link we send.
 *
 * Both entries name the SAME bucket. `eggcraft-studio.firebasestorage.app` is the
 * only bucket of OURS named anywhere in this tree (the census also turns up
 * `staging-bucket.firebasestorage.app`, a fixture in functions/test/qa/malware-scan.test.js,
 * and the deliberately-foreign names in the guard tests — no other real project).
 * `eggcraft-studio.appspot.com` is the legacy alias Firebase projects still answer
 * to, and a link minted before the rename would carry it; functions/test/qa/files-library.mjs
 * already exercised both spellings before this guard existed. Admitting the alias
 * grants an attacker nothing — it is still our bucket and a valid Firebase download
 * token in `?t=` is still required — while leaving it out would break old customer
 * links silently, with a message that reads like an expiry rather than a bug. The
 * thing to refuse is not the legacy spelling of our bucket; it is somebody else's
 * project.
 */
export const ALLOWED_FILE_BUCKETS: readonly string[] = Object.freeze([
  "eggcraft-studio.firebasestorage.app",
  "eggcraft-studio.appspot.com"
]);

/**
 * The allowlist entry this bucket IS, or null.
 *
 * Returning the matched entry rather than a boolean is the point. The comparison
 * has to normalise (trim + lowercase, as the old pattern was case-insensitive),
 * and a guard that normalises for the compare while the caller goes on using the
 * caller's own spelling is a checked-value/used-value split — the shape of every
 * bypass in this file's history. It does not reach a foreign bucket here (GCS
 * bucket names are lowercase-only, so a case-drifted spelling can name our bucket
 * or nothing), but it did cause a real durable bug: a padded URL such as
 * `/v0/b/%20eggcraft-studio.appspot.com/o/…` passed the mint-side parser and the
 * padding was written into the fileShares row, so every link from that row 404s
 * for ever. Callers use what this returns, not what they passed in.
 */
export function canonicalFileBucket(bucket: string | null | undefined): string | null {
  const candidate = String(bucket ?? "").trim().toLowerCase();
  if (!candidate) return null;
  return ALLOWED_FILE_BUCKETS.includes(candidate) ? candidate : null;
}

/** True only for one of our own buckets. Case-insensitive, as the old pattern was. */
export function isAllowedFileBucket(bucket: string | null | undefined): boolean {
  return canonicalFileBucket(bucket) !== null;
}

/**
 * The most bytes ?dl=1 will pass through this server for one request.
 *
 * 210 MB is not invented here: it is the ceiling the product already enforces on
 * upload. storage.rules `safeUploadSize()` gates create/update on every path this
 * route can serve — client_files, library, design_images and the rest — at
 * `request.resource.size <= 210 * 1024 * 1024`, and functions/malwareScanTrigger.js
 * carries the same number as its scan ceiling. Matching it exactly is the point:
 * a smaller cap would refuse a file the product itself accepted, and a refusal
 * here is indistinguishable from an expired link.
 */
export const MAX_PROXY_BYTES = 210 * 1024 * 1024;

/**
 * The longest one ?dl=1 request may run, headers and body together.
 *
 * The byte cap bounds how MUCH a request moves; this bounds how LONG it may hold
 * a connection on shared hosting while moving it. 210 MB in 600 s is ~350 KB/s
 * (2.8 Mbit/s) — under any broadband and at the low end of mobile, so a legitimate
 * download of the largest file the product accepts clears it, and one slower than
 * that was failing anyway. If the host's own request limit is shorter, it fires
 * first and this is simply the outer of two bounds.
 */
export const PROXY_DEADLINE_MS = 600000;

/**
 * True when the upstream DECLARES more than the cap, so the body need never start.
 *
 * A missing, unparseable or lying content-length returns false here on purpose —
 * this check is the cheap one, and `capBytes` below is what makes the cap true
 * regardless of what the header said.
 */
export function declaredLengthExceedsCap(contentLength: string | null | undefined, limit: number = MAX_PROXY_BYTES): boolean {
  const raw = String(contentLength ?? "").trim();
  if (!raw) return false;
  const declared = Number(raw);
  if (!Number.isFinite(declared)) return false;
  return declared > limit;
}

/**
 * Counts bytes on their way to the client and errors the stream past the cap.
 *
 * This is the bound that does not trust anybody: content-length can be absent
 * and it can lie. Erroring the transform aborts the pipe, which cancels the
 * upstream response body — stopping the transfer rather than merely declining to
 * forward the rest of it. At most `limit` bytes are ever enqueued.
 */
export function capBytes(limit: number = MAX_PROXY_BYTES): TransformStream<Uint8Array, Uint8Array> {
  let seen = 0;
  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      seen += chunk.byteLength;
      if (seen > limit) {
        controller.error(new Error("nivadesk: upstream exceeded the file proxy byte cap"));
        return;
      }
      controller.enqueue(chunk);
    }
  });
}
