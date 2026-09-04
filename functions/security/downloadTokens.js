"use strict";

// Minting and rotating download tokens from the server, without defeating
// the scan that holds them.
//
// A Firebase download URL carries its own token, and the token bypasses
// Storage rules entirely — so the upload scanner works by taking the token off
// an object until a scan has cleared it. Two pieces of NivaDesk's own server
// code write tokens: the portal share, which mints one so a visitor with no
// session can open a file, and the portal revoke, which replaces the token so
// every copied URL dies. Left as they were, both would put a token straight
// back onto a file the scanner was holding, and the hold would mean nothing.
//
// So both go through here, and here consults the scan record first:
//
//   - A file that is HELD (its record says so) stays tokenless. The token is
//     added to the record instead, and the trigger restores it — with the
//     record's other tokens — when the verdict is clean. The URL is handed out
//     now and starts working then. For a revoke, the record's token is
//     replaced, so the old URL is dead the moment the file is released.
//   - A file that is not held gets the token on the object, with a
//     metageneration precondition so a strip that lands in between is seen
//     rather than overwritten. If the file has a scan record that is still
//     pending (claimed, not yet held) the record's copy is cleared on a
//     rotate, so the old token cannot come back through the restore.
//
// Which record? The one for the object's CURRENT generation. The scanner keys
// records by generation because an overwrite is a new file; so does this.
const crypto = require("crypto");
const {
  scanDocId, tokenUnion, isPreconditionFailure, HELD_TOKEN_COLLECTION, TOKEN_METADATA_KEY
} = require("../malwareScanTrigger");

const RACE_ATTEMPTS = 3;

function createDownloadTokenService({ admin, uuid = () => crypto.randomUUID(), now = () => Date.now() }) {
  const records = () => admin.firestore().collection(HELD_TOKEN_COLLECTION);

  /** The object and its scan record, as they are right now. */
  async function lookAt(objectPath) {
    const bucket = admin.storage().bucket();
    const file = bucket.file(objectPath);
    const [meta] = await file.getMetadata();
    const generation = String((meta && meta.generation) || "");
    const tokens = String(((meta && meta.metadata) || {})[TOKEN_METADATA_KEY] || "");
    const recordRef = records().doc(scanDocId(objectPath, generation));
    const snap = await recordRef.get();
    const record = snap.exists ? (snap.data() || {}) : null;
    return { bucket, file, generation, metageneration: meta && meta.metageneration, tokens, record, recordRef };
  }

  const urlFor = (bucketName, objectPath, token) =>
    `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;

  /**
   * A token for the object — the one it has, or a fresh one.
   *
   * `deferred` is true when the file is held: the URL is real but answers 403
   * until the scan clears the file and the trigger restores the token.
   */
  async function ensureToken(objectPath) {
    const path = String(objectPath || "").trim();
    if (!path) return { token: "", url: "", deferred: false, reason: "no_path" };

    for (let attempt = 1; attempt <= RACE_ATTEMPTS; attempt += 1) {
      const look = await lookAt(path);

      if (look.record && look.record.holding) {
        const existing = String(look.record.heldToken || "").split(",")[0].trim();
        const token = existing || uuid();
        if (!existing) {
          await look.recordRef.set({
            heldToken: tokenUnion(look.record.heldToken, token), holding: true, updatedAtMs: now()
          }, { merge: true });
        }
        return { token, url: urlFor(look.bucket.name, path, token), deferred: true, reason: "" };
      }

      const first = look.tokens.split(",")[0].trim();
      if (first) return { token: first, url: urlFor(look.bucket.name, path, first), deferred: false, reason: "" };

      const token = uuid();
      try {
        await look.file.setMetadata(
          { metadata: { [TOKEN_METADATA_KEY]: token } },
          { ifMetagenerationMatch: look.metageneration }
        );
        return { token, url: urlFor(look.bucket.name, path, token), deferred: false, reason: "" };
      } catch (error) {
        if (!isPreconditionFailure(error)) throw error;
      }
    }
    return { token: "", url: "", deferred: false, reason: "lost_the_race" };
  }

  /**
   * Replaces the object's token so every existing URL stops working.
   *
   * On a held file the replacement goes into the record, which is where the
   * restore will read it from; the object stays tokenless, which is what
   * "revoked" already looks like.
   */
  async function rotate(objectPath) {
    const path = String(objectPath || "").trim();
    if (!path) return { rotated: false, deferred: false, reason: "no_path" };

    for (let attempt = 1; attempt <= RACE_ATTEMPTS; attempt += 1) {
      const look = await lookAt(path);
      const token = uuid();

      if (look.record && look.record.holding) {
        await look.recordRef.set({ heldToken: token, holding: true, rotatedAtMs: now(), updatedAtMs: now() }, { merge: true });
        return { rotated: true, deferred: true, reason: "" };
      }

      try {
        await look.file.setMetadata(
          { metadata: { [TOKEN_METADATA_KEY]: token } },
          { ifMetagenerationMatch: look.metageneration }
        );
      } catch (error) {
        if (!isPreconditionFailure(error)) throw error;
        continue;
      }
      if (look.record && look.record.verdict === "pending") {
        // Claimed but not (yet) held: the record's copy of the old token is
        // now stale, and a restore must not bring it back.
        await look.recordRef.set({ heldToken: "", holding: false, rotatedAtMs: now(), updatedAtMs: now() }, { merge: true });
      }
      return { rotated: true, deferred: false, reason: "" };
    }
    return { rotated: false, deferred: false, reason: "lost_the_race" };
  }

  return { ensureToken, rotate, urlFor };
}

module.exports = { createDownloadTokenService };
