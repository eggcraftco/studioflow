// Team-message uploads carry uploaderUid (docs/team-group-delete-contract-2026-10-08.md).
// storage.rules lets the uploader delete their own file in
// companies/{cid}/message_files/{threadId}/ only through the custom metadata
// uploaderUid, which an upload may set to the caller's own uid alone. Static
// read of the source:
//   1. every web upload into message_files is uploadMessageFileAndSend's;
//   2. its uploadBytes customMetadata includes uploaderUid;
//   3. uploaderUid comes from auth.currentUser.uid (Firebase Auth, imported
//      from @/lib/firebase/client) and never from a parameter or the options;
//   4. no uid → the upload throws before uploadBytes.
//
//   node scripts/check-message-uploader-uid.mjs [--root <dir>]
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const argRoot = process.argv.indexOf("--root");
const root = argRoot > 0 ? path.resolve(process.argv[argRoot + 1]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const check = (ok, what) => { if (!ok) failures.push(what); };

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

// 1. Where message_files paths are built.
const writers = [];
for (const dir of ["app", "components", "lib"]) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) continue;
  for (const file of walk(abs)) {
    const text = fs.readFileSync(file, "utf8");
    if (/message_files\/\$\{/.test(text)) writers.push(path.relative(root, file));
  }
}
check(writers.length === 1 && writers[0] === path.join("lib", "studioflow", "messages.ts"),
  `message_files paths are built in: ${writers.join(", ") || "(none)"}`);

const source = (() => { try { return fs.readFileSync(path.join(root, "lib/studioflow/messages.ts"), "utf8"); } catch { return ""; } })();
const start = source.indexOf("export async function uploadMessageFileAndSend(");
check(start >= 0, "uploadMessageFileAndSend not found");
const next = source.indexOf("\nexport ", start + 1);
const body = start >= 0 ? source.slice(start, next > 0 ? next : undefined) : "";
const signature = body.slice(0, body.indexOf("): Promise<"));

// 2. The metadata.
const upload = body.slice(body.indexOf("await uploadBytes("), body.indexOf("});", body.indexOf("await uploadBytes(")) + 3);
check(/customMetadata:\s*\{[^}]*\buploaderUid\b[^}]*\}/s.test(upload), "uploadBytes customMetadata has no uploaderUid");

// 3. The source of the uid.
check(/import\s*\{[^}]*\bauth\b[^}]*\}\s*from\s*"@\/lib\/firebase\/client"/.test(source), "auth is not imported from @/lib/firebase/client");
const assignments = [...body.matchAll(/\buploaderUid\s*(?::[^=]+)?=\s*([^;]+);/g)].map((m) => m[1].trim());
check(assignments.length === 1, `uploaderUid assigned ${assignments.length} times`);
check(/^auth\.currentUser\?\.uid\b/.test(assignments[0] || ""), `uploaderUid comes from "${assignments[0] || ""}"`);
check(!/uploaderUid|\buid\b/.test(signature), "uploadMessageFileAndSend takes a uid parameter");
check(!/options\.\w*[uU]id\b/.test(body), "a uid is read from options");

// 4. Signed out → throw before the upload.
const guard = body.indexOf("if (!uploaderUid) throw");
check(guard > 0 && guard < body.indexOf("await uploadBytes("), "no signed-out guard before uploadBytes");

if (failures.length) {
  console.log(`check-message-uploader-uid: ${failures.length} failure(s)`);
  for (const failure of failures) console.log(`  ✗ ${failure}`);
  process.exit(1);
}
console.log("check-message-uploader-uid: OK (single message_files writer; uploaderUid from auth.currentUser.uid; signed-out guard before uploadBytes)");
