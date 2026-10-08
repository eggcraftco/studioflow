// The upload-policy acceptance (8 Oct 2026): the policy version a browser
// accepts, the rule that an acceptance of an older version does not count,
// the four metadata cases the stamp can produce, the built-in sentence shown
// when the workspace has no text, and the eleven translations behind the new
// strings. The helper module is pure, so it runs here against a Map-backed
// store; the page checks are source checks.
//
//   node scripts/check-upload-policy.mjs
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath, pathToFileURL } from "url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
let checks = 0;
const expect = (name, actual, wanted) => {
  checks += 1;
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) failures.push(`${name}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(wanted)}`);
};
const exists = (rel) => fs.existsSync(path.join(root, rel));
const read = (rel) => (exists(rel) ? fs.readFileSync(path.join(root, rel), "utf8") : "");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "upload-policy-"));
const compile = (rel, name) => {
  const js = ts.transpileModule(read(rel), { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText
    .replace(/from "\.\/(\w+)"/g, 'from "./$1.mjs"');
  fs.writeFileSync(path.join(tmp, `${name}.mjs`), js);
};

// The sentence the iOS alert and the Android prompt fall back to — the web
// must show the very same words when the workspace text is empty.
const BUILTIN = "Before uploading, confirm that this file is legal, safe, client-approved when needed, and suitable for this workspace.";

// A localStorage stand-in with the same five members the helpers use.
function fakeStorage() {
  const map = new Map();
  return {
    get length() { return map.size; },
    key: (i) => Array.from(map.keys())[i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    dump: () => Object.fromEntries(map)
  };
}

// ---------------------------------------------------------------------------
// 1-3. The helper module: version, older-version rule, the four stamp cases.
// ---------------------------------------------------------------------------
if (!exists("lib/studioflow/uploadPolicy.ts")) {
  checks += 1;
  failures.push("lib/studioflow/uploadPolicy.ts: missing (no shared acceptance helper)");
} else {
  compile("lib/studioflow/uploadPolicy.ts", "uploadPolicy");
  const {
    UPLOAD_POLICY_BUILTIN_SENTENCE, uploadPolicyVersion, uploadPolicyWording,
    readUploadPolicyAcceptance, writeUploadPolicyAcceptance, clearUploadPolicyAcceptance,
    uploadPolicyAllows, uploadPolicyStamp, uploadPolicyMetadata
  } = await import(pathToFileURL(path.join(tmp, "uploadPolicy.mjs")).href);

  expect("built-in sentence: the natives' wording", UPLOAD_POLICY_BUILTIN_SENTENCE, BUILTIN);
  expect("wording: empty text -> built-in", uploadPolicyWording(""), BUILTIN);
  expect("wording: whitespace text -> built-in", uploadPolicyWording("   \n"), BUILTIN);
  expect("wording: workspace text wins, trimmed", uploadPolicyWording("  Studio rule.  "), "Studio rule.");

  // 1. Version key derivation.
  expect("version: server stamp wins", uploadPolicyVersion({ uploadSafetySettingsUpdatedAtMs: 1759900000000, uploadSafetyPolicyText: "Studio rule." }), "ts-1759900000000");
  expect("version: fractional ms are floored", uploadPolicyVersion({ uploadSafetySettingsUpdatedAtMs: 1759900000000.7 }), "ts-1759900000000");
  const textVersion = uploadPolicyVersion({ uploadSafetySettingsUpdatedAtMs: null, uploadSafetyPolicyText: "Studio rule." });
  expect("version: no stamp -> text hash", /^text-[0-9a-f]{16}$/.test(textVersion), true);
  expect("version: the same text hashes the same", uploadPolicyVersion({ uploadSafetyPolicyText: "Studio rule." }), textVersion);
  expect("version: surrounding whitespace does not change the text version", uploadPolicyVersion({ uploadSafetyPolicyText: "  Studio rule.\n" }), textVersion);
  expect("version: a different text is a different version", uploadPolicyVersion({ uploadSafetyPolicyText: "Studio rule, revised." }) === textVersion, false);
  expect("version: no stamp, no text -> builtin-1", uploadPolicyVersion({ uploadSafetySettingsUpdatedAtMs: null, uploadSafetyPolicyText: "" }), "builtin-1");
  expect("version: whitespace text -> builtin-1", uploadPolicyVersion({ uploadSafetyPolicyText: "  " }), "builtin-1");
  expect("version: nothing loaded yet -> builtin-1", uploadPolicyVersion(null), "builtin-1");
  expect("version: a zero / NaN stamp is no stamp", [uploadPolicyVersion({ uploadSafetySettingsUpdatedAtMs: 0 }), uploadPolicyVersion({ uploadSafetySettingsUpdatedAtMs: Number.NaN })], ["builtin-1", "builtin-1"]);

  // 2. An acceptance of an older version does not count.
  const store = fakeStorage();
  const now = new Date("2026-10-08T12:34:56.000Z");
  const first = writeUploadPolicyAcceptance(store, "ws1", "ts-100", now);
  expect("accept: records version and ISO-8601 UTC time", first, { version: "ts-100", acceptedAt: "2026-10-08T12:34:56.000Z" });
  expect("accept: key is workspace + version", Object.keys(store.dump()), ["studioflow-upload-policy-acceptance:ws1:ts-100"]);
  expect("read: the current version is accepted", readUploadPolicyAcceptance(store, "ws1", "ts-100"), first);
  expect("read: a newer version is NOT accepted (re-ask)", readUploadPolicyAcceptance(store, "ws1", "ts-200"), null);
  expect("read: another workspace is NOT accepted", readUploadPolicyAcceptance(store, "ws2", "ts-100"), null);
  expect("read: no store (SSR) -> null", readUploadPolicyAcceptance(null, "ws1", "ts-100"), null);
  const second = writeUploadPolicyAcceptance(store, "ws1", "ts-200", new Date("2026-10-09T00:00:00.000Z"));
  expect("accept again: the older version's entry is dropped", Object.keys(store.dump()), ["studioflow-upload-policy-acceptance:ws1:ts-200"]);
  expect("read: old version no longer counts after re-acceptance", readUploadPolicyAcceptance(store, "ws1", "ts-100"), null);
  expect("read: the new version counts", readUploadPolicyAcceptance(store, "ws1", "ts-200"), second);
  // The pre-versioning flag ("accepted", no version) is not an acceptance of anything.
  const legacy = fakeStorage();
  legacy.setItem("studioflow-upload-policy-accepted:ws1", "accepted");
  legacy.setItem("studioflow-upload-policy-accepted-at:ws1", "1759900000000");
  expect("read: the legacy unversioned flag does not count", readUploadPolicyAcceptance(legacy, "ws1", "builtin-1"), null);
  clearUploadPolicyAcceptance(legacy, "ws1");
  expect("reset: clears the legacy keys too", Object.keys(legacy.dump()), []);
  const broken = fakeStorage();
  broken.setItem("studioflow-upload-policy-acceptance:ws1:ts-1", "not json");
  expect("read: unparseable entry does not count", readUploadPolicyAcceptance(broken, "ws1", "ts-1"), null);
  broken.setItem("studioflow-upload-policy-acceptance:ws1:ts-1", JSON.stringify({ version: "ts-1", acceptedAt: "yesterday" }));
  expect("read: an entry without a real time does not count", readUploadPolicyAcceptance(broken, "ws1", "ts-1"), null);
  broken.setItem("studioflow-upload-policy-acceptance:ws1:ts-1", JSON.stringify({ version: "ts-9", acceptedAt: "2026-10-08T00:00:00.000Z" }));
  expect("read: a version mismatch inside the entry does not count", readUploadPolicyAcceptance(broken, "ws1", "ts-1"), null);
  clearUploadPolicyAcceptance(store, "ws1");
  expect("reset: nothing left for the workspace", readUploadPolicyAcceptance(store, "ws1", "ts-200"), null);

  // 3. The four metadata cases. policyAccepted is "true" ONLY with a real
  //    acceptance; policyAcceptedAt / policyVersion only then.
  const acceptance = { version: "ts-200", acceptedAt: "2026-10-09T00:00:00.000Z" };
  expect("required + accepted: gate opens", uploadPolicyAllows(true, acceptance), true);
  expect("required + accepted: metadata", uploadPolicyMetadata(uploadPolicyStamp(true, acceptance)),
    { policyRequired: "true", policyAccepted: "true", policyAcceptedAt: "2026-10-09T00:00:00.000Z", policyVersion: "ts-200" });
  expect("required + none: gate blocks", uploadPolicyAllows(true, null), false);
  expect("required + none: metadata (no At / Version keys)", uploadPolicyMetadata(uploadPolicyStamp(true, null)), { policyRequired: "true", policyAccepted: "false" });
  expect("not required + accepted: gate opens", uploadPolicyAllows(false, acceptance), true);
  expect("not required + accepted: a real acceptance is still recorded", uploadPolicyMetadata(uploadPolicyStamp(false, acceptance)),
    { policyRequired: "false", policyAccepted: "true", policyAcceptedAt: "2026-10-09T00:00:00.000Z", policyVersion: "ts-200" });
  expect("not required + none: gate opens (false must not block)", uploadPolicyAllows(false, null), true);
  expect("not required + none: no manufactured acceptance", uploadPolicyMetadata(uploadPolicyStamp(false, null)), { policyRequired: "false", policyAccepted: "false" });
  expect("not required + none: At / Version absent, not empty strings",
    Object.keys(uploadPolicyMetadata(uploadPolicyStamp(false, null))).sort(), ["policyAccepted", "policyRequired"]);
}

// ---------------------------------------------------------------------------
// 4. The pages: the sentence is on screen when the text is empty, the stamp
//    reaches every client_files write, the legacy duplicate key is gone, and
//    the preview image's Client Files copy goes through the card's acceptance.
// ---------------------------------------------------------------------------
const orderPage = read("app/orders/OrderDetailContent.tsx");
const filesPage = read("app/files/page.tsx");
const clientFiles = read("lib/studioflow/clientFiles.ts");
const orders = read("lib/studioflow/orders.ts");
const overview = read("lib/studioflow/firestore.ts");

const panel = (src) => {
  const start = src.indexOf('className="upload-safety-panel"');
  return start < 0 ? "" : src.slice(start, src.indexOf("upload-safety-check", start) + 200);
};
expect("order page: built-in sentence shown above the checkbox when the text is empty",
  panel(orderPage).includes("UPLOAD_POLICY_BUILTIN_SENTENCE") && panel(orderPage).includes("uploadPolicyWording("), true);
expect("order page: the sentence is not gated on the workspace text", /uploadSafetyPolicyText \? \(\s*<p/.test(panel(orderPage)), false);
expect("files page: built-in sentence shown above the checkbox when the text is empty",
  panel(filesPage).includes("UPLOAD_POLICY_BUILTIN_SENTENCE") && panel(filesPage).includes("uploadPolicyWording("), true);
expect("files page: the sentence is not gated on the workspace text", /uploadSafetyPolicyText \? \(\s*<p/.test(panel(filesPage)), false);
expect("order page: checkbox label goes through t()", orderPage.includes('t("I understand and accept the upload policy for this browser.")'), true);
expect("files page: checkbox label goes through t()", filesPage.includes('t("I understand and accept the upload policy for this browser.")'), true);
expect("order page: acceptance is read per version (effect depends on the version)", /\[workspace\.id, clientFileUploadPolicyVersion\]/.test(orderPage), true);
expect("files page: acceptance is read per version (effect depends on the version)", /\[workspaceId, uploadPolicyVersionId\]/.test(filesPage), true);

expect("client_files upload: writes the stamp (policyRequired + policyAccepted separately)", clientFiles.includes("...uploadPolicyMetadata(uploadSafety.policy)"), true);
expect("client_files upload: no `!require || accepted` stamp left in the pages",
  [orderPage, filesPage].some((src) => /policyAccepted:\s*!\w+RequirePolicyAcceptance\s*\|\|/.test(src) || /policyAccepted:\s*!\w+RequiresPolicyAcceptance\s*\|\|/.test(src)), false);
expect("client_files upload: legacy uploadPolicyAccepted key no longer written", /\buploadPolicyAccepted\s*:/.test(clientFiles), false);
expect("overview: reads uploadSafetySettingsUpdatedAt as the version source", overview.includes("uploadSafetySettingsUpdatedAtMs: dateValue(data.uploadSafetySettingsUpdatedAt)"), true);

// The preview image: its copy is mirrored into client_files (uploadClientFileForOrder
// inside uploadPreviewFile), so when that mirror can happen the path must refuse
// without the card's acceptance — not open window.confirm.
const previewStart = orderPage.indexOf("async function uploadPreviewFile(");
const previewBody = previewStart < 0 ? "" : orderPage.slice(previewStart, orderPage.indexOf("\n  async function ", previewStart + 10));
expect("preview path: still mirrors into client_files (the verdict this check rests on)", previewBody.includes("uploadClientFileForOrder("), true);
expect("preview path: when the mirror can happen, refuses to the Client Files card instead of a confirm",
  /if \(canManageClientFiles\) \{\s*setInlineError\("Accept the upload policy in the Client Files card before uploading a preview image\."\);\s*return;/.test(previewBody), true);
expect("preview path: the mirror and the image carry the same stamp", (previewBody.match(/uploadSafety,?\n/g) || []).length >= 2 && previewBody.includes("uploadPolicyStamp(requirePolicyAcceptance, policyAcceptance)"), true);
expect("preview path: the confirm (design_images only) records a versioned acceptance", previewBody.includes("writeUploadPolicyAcceptance(window.localStorage, workspace.id, clientFileUploadPolicyVersion)"), true);
expect("preview image object: same stamp keys", orders.includes("...uploadPolicyMetadata(uploadSafety.policy)"), true);

// ---------------------------------------------------------------------------
// 5. Eleven translations for the new strings, through the compiled table
//    (macTranslations wins the merge, so a text check alone is not enough).
// ---------------------------------------------------------------------------
const LANGUAGES = ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português",
  "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"];
const tables = ["language", "macTranslations", "settingsContentTranslations", "shippingTranslations", "trackingEmailTranslations"]
  .filter((name) => exists(`lib/studioflow/${name}.ts`));
for (const name of tables) compile(`lib/studioflow/${name}.ts`, name);
const { studioT } = await import(pathToFileURL(path.join(tmp, "language.mjs")).href);
for (const key of [
  BUILTIN,
  "I understand and accept the upload policy for this browser.",
  "Upload policy accepted. Choose a file to upload.",
  "Accept the upload policy in the Client Files card before uploading a preview image."
]) {
  const untranslated = LANGUAGES.filter((language) => studioT(key, language) === key);
  expect(`translations: "${key.slice(0, 48)}…" in all eleven languages`, untranslated, []);
}
expect("translations: built-in sentence in Deutsch is German, not English", studioT(BUILTIN, "Deutsch").startsWith("Bestätigen Sie"), true);

fs.rmSync(tmp, { recursive: true, force: true });
if (failures.length) {
  console.error(`check-upload-policy: ${failures.length} of ${checks} checks failed`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`check-upload-policy: ${checks} checks passed`);
