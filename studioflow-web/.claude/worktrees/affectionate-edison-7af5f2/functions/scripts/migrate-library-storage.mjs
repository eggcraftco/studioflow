// One-off: move library-owned storage objects from the client_files/library
// squat to the library's own path, and make the records follow.
//
//   node scripts/migrate-library-storage.mjs           # dry run — reports only
//   node scripts/migrate-library-storage.mjs --live    # copy, update, re-mint, delete
//
// Per version: copy object to companies/{id}/library/<basename> (the copy
// carries the download token with it), rewrite the record's storagePath(s),
// re-mint portalUrl for portal-visible records (the URL embeds the path), and
// only then delete the original. Idempotent: a re-run finds nothing left on
// the old prefix. Records keep their ids — every reference (bank receipts,
// order shares, inventory tabs) points at the record, not the path.

import { createRequire } from "node:module";
import crypto from "node:crypto";
const require = createRequire(import.meta.url);
const admin = require("firebase-admin");

const LIVE = process.argv.includes("--live");
const PROJECT = "eggcraft-studio";
const BUCKET = "eggcraft-studio.firebasestorage.app";

admin.initializeApp({ projectId: PROJECT, storageBucket: BUCKET });
const db = admin.firestore();
const bucket = admin.storage().bucket();

function newPathFor(companyId, oldPath) {
  const prefix = `companies/${companyId}/client_files/library/`;
  if (!oldPath.startsWith(prefix)) return null;
  return `companies/${companyId}/library/${oldPath.slice(prefix.length)}`;
}

async function portalUrlFor(path) {
  try {
    const file = bucket.file(path);
    const [meta] = await file.getMetadata();
    let token = String(((meta || {}).metadata || {}).firebaseStorageDownloadTokens || "").split(",")[0].trim();
    if (!token) {
      token = crypto.randomUUID();
      await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: token } });
    }
    return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
  } catch {
    return "";
  }
}

const totals = { companies: 0, records: 0, versionsMoved: 0, portalReminted: 0, originalsDeleted: 0, failures: [] };

const companies = await db.collection("companies").select().get();
for (const companyDoc of companies.docs) {
  const companyId = companyDoc.id;
  const records = await db.collection("companies").doc(companyId)
    .collection("fileRecords").where("source", "==", "library").get();
  if (records.empty) continue;

  let companyTouched = false;
  for (const recordDoc of records.docs) {
    const data = recordDoc.data() || {};
    const versions = Array.isArray(data.versions) ? data.versions : [];
    const moves = []; // { from, to, index }
    versions.forEach((version, index) => {
      const from = String(version.storagePath || "");
      const to = newPathFor(companyId, from);
      if (to) moves.push({ from, to, index });
    });
    const topTo = newPathFor(companyId, String(data.storagePath || ""));
    if (moves.length === 0 && !topTo) continue;

    totals.records += 1;
    companyTouched = true;
    console.log(`${LIVE ? "MOVE" : "would move"}  ${companyId}/${recordDoc.id}  ${data.fileName || ""}  (${moves.length} version object${moves.length === 1 ? "" : "s"})`);
    if (!LIVE) { totals.versionsMoved += moves.length; continue; }

    // 1) Copy every object first; nothing is deleted until the record is safe.
    let allCopied = true;
    for (const move of moves) {
      try {
        await bucket.file(move.from).copy(bucket.file(move.to));
        totals.versionsMoved += 1;
      } catch (error) {
        allCopied = false;
        totals.failures.push(`${companyId}/${recordDoc.id} copy ${move.from}: ${error?.message || error}`);
      }
    }
    if (!allCopied) continue; // record untouched; originals untouched; re-run later

    // 2) Rewrite the record.
    const nextVersions = versions.map((version, index) => {
      const move = moves.find((row) => row.index === index);
      return move ? { ...version, storagePath: move.to } : version;
    });
    const patch = { versions: nextVersions };
    if (topTo) patch.storagePath = topTo;
    else if (moves.some((row) => row.from === String(data.storagePath || ""))) {
      patch.storagePath = moves.find((row) => row.from === String(data.storagePath || "")).to;
    }

    // 3) Portal URL embeds the path — re-mint from the new active object.
    if (data.clientPortalVisible === true || String(data.portalUrl || "")) {
      const activePath = String(patch.storagePath || data.storagePath || "");
      const url = await portalUrlFor(activePath);
      if (url) { patch.portalUrl = url; totals.portalReminted += 1; }
    }
    try {
      await recordDoc.ref.set(patch, { merge: true });
    } catch (error) {
      totals.failures.push(`${companyId}/${recordDoc.id} record update: ${error?.message || error}`);
      continue; // copies exist but record still points at originals — safe; re-run later
    }

    // 4) Only now the originals go.
    for (const move of moves) {
      try {
        await bucket.file(move.from).delete();
        totals.originalsDeleted += 1;
      } catch (error) {
        totals.failures.push(`${companyId}/${recordDoc.id} delete original ${move.from}: ${error?.message || error}`);
      }
    }
  }
  if (companyTouched) totals.companies += 1;
}

console.log(`\n${LIVE ? "DONE" : "DRY RUN"}:`, JSON.stringify(totals, null, 2));
process.exit(totals.failures.length > 0 ? 1 : 0);
