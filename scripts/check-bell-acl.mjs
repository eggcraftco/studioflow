// Bell ACL (8 Oct 2026). firestore.rules lets a member read a bell row only
// when their uid is in its recipientUids, and refuses a list query that does
// not say so. The web bell listener must therefore:
//   1. query with where("recipientUids", "array-contains", <uid>) — the
//      unconstrained query of a9f8e0b2 is refused (permission-denied);
//   2. not render a snapshot served from the persistent IndexedDB cache
//      (metadata.fromCache) — after an access change it can still hold a row
//      the member may no longer read — and listen to metadata changes so the
//      server-confirmed snapshot always arrives;
//   3. on a refused listen, empty the bell instead of keeping the last list.
// And every reader of companies/{id}/notifications goes through that listener.
//
//   node scripts/check-bell-acl.mjs [--root <dir>]
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const argRoot = process.argv.indexOf("--root");
const root = argRoot > 0 ? path.resolve(process.argv[argRoot + 1]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const check = (ok, what) => { if (!ok) failures.push(what); };
const src = fs.readFileSync(path.join(root, "lib/studioflow/notifications.ts"), "utf8");
const start = src.indexOf("export function listenToActivityNotifications(");
check(start >= 0, "listenToActivityNotifications is absent");
const body = src.slice(start, src.indexOf("\n}\n", start));
check(/where\(\s*"recipientUids",\s*"array-contains",\s*uidClean\s*\)/.test(body), "the bell query is not constrained by recipientUids array-contains <uid>");
check(/if \(!workspace\.id \|\| !uidClean\)/.test(body), "a listener without a uid is not short-circuited");
check(/includeMetadataChanges:\s*true/.test(body), "metadata changes are not listened to (the server snapshot may never arrive when it equals the cache)");
check(/if \(snap\.metadata\.fromCache\) return;/.test(body), "a cache-only snapshot is rendered");
check(/\(\)\s*=>\s*\{[\s\S]*?callback\(\[\]\);[\s\S]*?\}\s*,?\s*\);\s*$/.test(body.trim() + "\n") || /,\s*\(\)\s*=>\s*\{[^}]*callback\(\[\]\)/.test(body), "a refused listen does not empty the bell");

// No other reader of the collection (it would be refused, or would bypass 2/3).
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".next", ".git", "public"].includes(entry.name)) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(p);
  }
  return out;
}
for (const file of walk(root)) {
  const rel = path.relative(root, file);
  if (rel === "lib/studioflow/notifications.ts") continue;
  const text = fs.readFileSync(file, "utf8");
  check(!/collection\([^)]*"notifications"\s*\)/.test(text), `${rel} reads companies/{id}/notifications directly`);
}
const notifCollections = (src.match(/collection\([^)]*"notifications"\s*\)/g) || []).length;
check(notifCollections === 1, `notifications.ts opens the collection ${notifCollections} times (expected 1, the bell listener)`);

if (failures.length) {
  console.log(`FAIL  bell ACL web listener (${failures.length})`);
  for (const f of failures) console.log("  -", f);
  process.exit(1);
}
console.log("PASS  bell ACL web listener: recipient-constrained query, no cache-only render, refused listen empties the bell, single reader");
