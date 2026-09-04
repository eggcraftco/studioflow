// The two storage rules the upload scanner depends on.
//
// 1. A client may not write nvScan* custom metadata. The scanner records its
//    verdict there; custom metadata is otherwise whatever the uploader says it
//    is, and an upload claiming nvScanStatus "clean" would be a scan that never
//    ran. The gate in the trigger no longer reads metadata at all, so this is
//    belt-and-braces — but the metadata is also what the second rule reads.
//
// 2. A file the scanner settled as anything but clean is unreadable through
//    the SDK. getDownloadURL() is an SDK read that mints a fresh download token
//    onto the object — which would put a token straight back on a file the
//    scanner just took one off. Files with no verdict, or a verdict still
//    pending, read exactly as before; so does everything uploaded before
//    scanning existed.
//
// Needs the Firestore emulator on 127.0.0.1:8080 AND the Storage emulator on
// 127.0.0.1:9199 (storage.rules reads company documents out of Firestore).
// Run: npm run test:storage-rules
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, setLogLevel } from "firebase/firestore";
import { ref, uploadBytes, getBytes, getDownloadURL, getMetadata } from "firebase/storage";

setLogLevel("error");
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..", "..", "..");
const FIRESTORE_RULES = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");
const STORAGE_RULES = fs.readFileSync(path.join(root, "storage.rules"), "utf8");

// The owner's uid IS the company id (the oldest shape storage.rules accepts:
// `request.auth.uid == companyId`), so nothing about roles is under test here.
const CO = "acme-scan";
const OWNER = CO;
// The project id must be the one the emulators were started with: storage.rules
// reads company documents with firestore.get(), and the Storage emulator looks
// them up in the Firestore emulator under the request's project. A different id
// here means "company does not exist" and every rule denies — including the
// ones this file exists to prove ALLOW, which would make the deny cases vacuous.
const PROJECT = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT || "eggcraft-studio";
const BUCKET = `${PROJECT}.appspot.com`;

const env = await initializeTestEnvironment({
  projectId: PROJECT,
  firestore: { rules: FIRESTORE_RULES, host: "127.0.0.1", port: 8080 },
  storage: { rules: STORAGE_RULES, host: "127.0.0.1", port: 9199 }
});

await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), "companies", CO), { ownerUid: OWNER, authorizedUsers: [OWNER], companyName: "Acme" });
});

const owner = env.authenticatedContext(OWNER);
const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
const objectPath = (name) => `companies/${CO}/inventory_photos/item1/${name}`;

let failures = 0;
const check = async (name, run) => {
  try { await run(); console.log(`PASS  ${name}`); }
  catch (error) { failures += 1; console.log(`FAIL  ${name} - ${String(error && error.message || error).slice(0, 300)}`); }
};

// Seeds an object with metadata the scanner would have written, bypassing rules.
async function seed(name, customMetadata) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await uploadBytes(ref(ctx.storage(BUCKET), objectPath(name)), bytes, { customMetadata });
  });
}

await check("an ordinary upload, with no scan metadata, is allowed", async () => {
  await assertSucceeds(uploadBytes(ref(owner.storage(BUCKET), objectPath("plain.png")), bytes, { contentType: "image/png" }));
});

await check("an upload that claims to have been scanned is refused at the door", async () => {
  for (const key of ["nvScanStatus", "nvScanVerdict", "nvScanReason", "nvScannedAtMs", "nvScanner", "nvScanDetail"]) {
    await assertFails(uploadBytes(
      ref(owner.storage(BUCKET), objectPath(`forged-${key}.png`)), bytes,
      { contentType: "image/png", customMetadata: { [key]: "clean" } }
    ));
  }
});

await check("an upload with harmless custom metadata is still allowed", async () => {
  await assertSucceeds(uploadBytes(
    ref(owner.storage(BUCKET), objectPath("tagged.png")), bytes,
    { contentType: "image/png", customMetadata: { uploadedBy: "owner", note: "not a scan field" } }
  ));
});

await check("a file the scanner settled as unusable cannot be read, so no fresh token can be minted onto it", async () => {
  for (const verdict of ["error", "timeout", "too_large", "unsupported", "unknown", "released"]) {
    await seed(`held-${verdict}.png`, { nvScanStatus: "unverified", nvScanVerdict: verdict });
    const r = ref(owner.storage(BUCKET), objectPath(`held-${verdict}.png`));
    await assertFails(getDownloadURL(r));
    await assertFails(getBytes(r));
    await assertFails(getMetadata(r));
  }
});

await check("an infected file cannot be read either", async () => {
  await seed("infected.png", { nvScanStatus: "infected", nvScanVerdict: "infected" });
  await assertFails(getDownloadURL(ref(owner.storage(BUCKET), objectPath("infected.png"))));
});

await check("a clean file reads as normal", async () => {
  await seed("clean.png", { nvScanStatus: "clean", nvScanVerdict: "clean" });
  await assertSucceeds(getDownloadURL(ref(owner.storage(BUCKET), objectPath("clean.png"))));
});

await check("a file still being scanned reads as before — the client's first getDownloadURL must not break", async () => {
  await seed("pending.png", { nvScanStatus: "unverified", nvScanVerdict: "pending" });
  await assertSucceeds(getDownloadURL(ref(owner.storage(BUCKET), objectPath("pending.png"))));
});

await check("a file uploaded before scanning existed reads as before", async () => {
  await seed("legacy.png", { anything: "else" });
  await assertSucceeds(getDownloadURL(ref(owner.storage(BUCKET), objectPath("legacy.png"))));
  await seed("legacy-no-meta.png", undefined);
  await assertSucceeds(getDownloadURL(ref(owner.storage(BUCKET), objectPath("legacy-no-meta.png"))));
});

await check("a stranger cannot read a clean file either — the scan rule is not a grant", async () => {
  const stranger = env.authenticatedContext("nobody");
  await assertFails(getDownloadURL(ref(stranger.storage(BUCKET), objectPath("clean.png"))));
});

await env.cleanup();
if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
console.log("\n✅ STORAGE SCAN RULES GEÇTİ");
