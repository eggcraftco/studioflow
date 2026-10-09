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
import { createHash } from "crypto";

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
    UPLOAD_POLICY_BUILTIN_SENTENCE, uploadPolicyVersion, uploadPolicyVersionForText, uploadPolicyVersionShort,
    normalizeUploadPolicyText, uploadPolicyWording,
    readUploadPolicyAcceptance, writeUploadPolicyAcceptance, clearUploadPolicyAcceptance,
    uploadPolicyAllows, uploadPolicyStamp, uploadPolicyMetadata,
    uploadPolicyForSource, uploadPolicySettingsAccess
  } = await import(pathToFileURL(path.join(tmp, "uploadPolicy.mjs")).href);

  expect("built-in sentence: the natives' wording", UPLOAD_POLICY_BUILTIN_SENTENCE, BUILTIN);
  expect("wording: empty text -> built-in", uploadPolicyWording(""), BUILTIN);
  expect("wording: whitespace text -> built-in", uploadPolicyWording("   \n"), BUILTIN);
  expect("wording: workspace text wins, trimmed", uploadPolicyWording("  Studio rule.  "), "Studio rule.");

  // 1. Version key derivation.
  // 1. Version derivation — the shared contract (docs/native/upload-policy-
  //    version-contract-2026-10-08.md v2): the nine vectors, full 64-hex,
  //    server value first, no timestamp source.
  const vectors = JSON.parse(read("scripts/fixtures/upload-policy-version-vectors.json"));
  expect("vectors: nine cases in scripts/fixtures", vectors.length, 9);
  const docVectors = path.join(root, "..", "docs", "native", "upload-policy-version-vectors.json");
  if (fs.existsSync(docVectors)) expect("vectors: fixture equals docs/native copy", vectors, JSON.parse(fs.readFileSync(docVectors, "utf8")));
  for (const vector of vectors) {
    expect(`vector "${vector.case}": version`, uploadPolicyVersionForText(vector.text), vector.version);
    expect(`vector "${vector.case}": via uploadPolicyVersion (no stored value)`, uploadPolicyVersion({ uploadSafetyPolicyText: vector.text }), vector.version);
    expect(`vector "${vector.case}": short form`, uploadPolicyVersionShort(vector.version), vector.short);
    if (vector.version !== "builtin-1") {
      const normalized = normalizeUploadPolicyText(vector.text);
      expect(`vector "${vector.case}": bundled SHA-256 equals node:crypto`, vector.version, `sha256-${createHash("sha256").update(Buffer.from(normalized, "utf8")).digest("hex")}`);
    }
  }
  // Longer than one 64-byte block and across a block boundary: the bundled hash must still equal node's.
  for (const length of [55, 56, 63, 64, 65, 119, 120, 500, 2000]) {
    const text = "x".repeat(length);
    expect(`sha256: ${length}-byte text equals node:crypto`, uploadPolicyVersionForText(text), `sha256-${createHash("sha256").update(text, "utf8").digest("hex")}`);
  }
  expect("version: full 64 hex, never a prefix", /^sha256-[0-9a-f]{64}$/.test(uploadPolicyVersionForText("Studio rule.")), true);
  expect("version: the stored server value wins", uploadPolicyVersion({ uploadSafetyPolicyVersion: "sha256-" + "a".repeat(64), uploadSafetyPolicyText: "Studio rule." }), "sha256-" + "a".repeat(64));
  expect("version: stored value wins over an empty text too", uploadPolicyVersion({ uploadSafetyPolicyVersion: "builtin-1", uploadSafetyPolicyText: "" }), "builtin-1");
  {
    const warnings = [];
    const original = console.warn;
    console.warn = (...args) => { warnings.push(args.join(" ")); };
    try {
      uploadPolicyVersion({ uploadSafetyPolicyVersion: "sha256-" + "b".repeat(64), uploadSafetyPolicyText: "Studio rule." });
      uploadPolicyVersion({ uploadSafetyPolicyVersion: "sha256-" + "b".repeat(64), uploadSafetyPolicyText: "Studio rule." });
      uploadPolicyVersion({ uploadSafetyPolicyVersion: uploadPolicyVersionForText("Studio rule."), uploadSafetyPolicyText: "Studio rule." });
    } finally {
      console.warn = original;
    }
    expect("version: a stored/computed disagreement is warned once, agreement never", warnings.length, 1);
  }
  const textVersion = uploadPolicyVersion({ uploadSafetyPolicyText: "Studio rule." });
  expect("version: the same text hashes the same", uploadPolicyVersion({ uploadSafetyPolicyText: "Studio rule." }), textVersion);
  expect("version: surrounding whitespace does not change the text version", uploadPolicyVersion({ uploadSafetyPolicyText: "  Studio rule.\n" }), textVersion);
  expect("version: a different text is a different version", uploadPolicyVersion({ uploadSafetyPolicyText: "Studio rule, revised." }) === textVersion, false);
  expect("version: no stored value, no text -> builtin-1", uploadPolicyVersion({ uploadSafetyPolicyText: "" }), "builtin-1");
  expect("version: whitespace text -> builtin-1", uploadPolicyVersion({ uploadSafetyPolicyText: "  " }), "builtin-1");
  expect("version: nothing loaded yet -> builtin-1", uploadPolicyVersion(null), "builtin-1");
  expect("version: no timestamp source (an unrelated save never re-asks)", uploadPolicyVersion({ uploadSafetySettingsUpdatedAtMs: 1759900000000, uploadSafetyPolicyText: "Studio rule." }), textVersion);
  expect("version: the module has no ts- source at all", /`ts-\$\{/.test(read("lib/studioflow/uploadPolicy.ts")), false);

  // 1b. The cross-platform stamp + gate vectors (docs/native/upload-policy-stamp-vectors.json, 9 Oct 2026) —
  //     the same file iOS and Android assert. Required and accepted separate; required=false never manufactures
  //     an acceptance; at + version only with a real acceptance of the current version, at in whole seconds.
  {
    const stampVectors = JSON.parse(read("scripts/fixtures/upload-policy-stamp-vectors.json"));
    const docStamp = path.join(root, "..", "docs", "native", "upload-policy-stamp-vectors.json");
    if (fs.existsSync(docStamp)) expect("stamp vectors: fixture equals docs/native copy", stampVectors, JSON.parse(fs.readFileSync(docStamp, "utf8")));
    expect("stamp vectors: 7 stamp + 5 resolve + 6 scope + 9 card",
      ["stamp", "resolve", "scope", "card"].map(kind => stampVectors.filter(v => v.kind === kind).length), [7, 5, 6, 9]);
    for (const v of stampVectors) {
      // Scope (owner decision 9 Oct 2026, 4a): the avatar is outside the client-file policy — no prompt, no
      // acceptance written, no policy keys, whatever the workspace requires or the browser accepted.
      if (v.kind === "scope") {
        if (typeof uploadPolicyForSource !== "function") { expect(`scope "${v.case}": uploadPolicyForSource exists`, false, true); continue; }
        const sstore = fakeStorage();
        if (v.storedVersion) writeUploadPolicyAcceptance(sstore, "ws-vec", v.storedVersion, new Date(Number(v.storedAtMillis)));
        const before = JSON.stringify(sstore.dump());
        const acc = readUploadPolicyAcceptance(sstore, "ws-vec", v.currentVersion);
        const decision = uploadPolicyForSource(v.source, v.required === "true", acc);
        expect(`scope "${v.case}": asks`, decision.asks, v.asks === "true");
        expect(`scope "${v.case}": allowed`, decision.allowed, v.allowed === "true");
        expect(`scope "${v.case}": policy keys`, Object.keys(decision.metadata).join(","), v.policyKeys);
        if (v.policyAccepted) expect(`scope "${v.case}": policyAccepted`, decision.metadata.policyAccepted, v.policyAccepted);
        expect(`scope "${v.case}": no acceptance written`, JSON.stringify(sstore.dump()) !== before, v.writesAcceptance === "true");
        continue;
      }
      // Settings ▸ Safety & Uploads (owner decision 9 Oct 2026, 4b): who sees their own acceptance and who the controls.
      if (v.kind === "card") {
        if (typeof uploadPolicySettingsAccess !== "function") { expect(`card "${v.case}": uploadPolicySettingsAccess exists`, false, true); continue; }
        const got = uploadPolicySettingsAccess({
          role: v.role,
          clientFilesPlan: v.clientFilesPlan === "true",
          clientFilesAccess: v.clientFilesAccess === "true",
          settingsSafetyUploads: v.settingsSafetyUploads === "true",
          settingsGeneral: v.settingsGeneral === "true"
        });
        expect(`card "${v.case}"`, got, {
          showsSection: v.showsSection === "true",
          showsAcceptanceCard: v.showsAcceptanceCard === "true",
          showsAdminControls: v.showsAdminControls === "true"
        });
        continue;
      }
      if (v.kind === "resolve") {
        expect(`resolve "${v.case}"`, uploadPolicyVersion({ uploadSafetyPolicyVersion: v.serverVersion, uploadSafetyPolicyText: v.text }), v.version);
        continue;
      }
      const vstore = fakeStorage();
      if (v.storedVersion) writeUploadPolicyAcceptance(vstore, "ws-vec", v.storedVersion, new Date(Number(v.storedAtMillis)));
      const acc = readUploadPolicyAcceptance(vstore, "ws-vec", v.currentVersion);
      const required = v.required === "true";
      expect(`stamp "${v.case}": allowed`, uploadPolicyAllows(required, acc), v.allowed === "true");
      const meta = uploadPolicyMetadata(uploadPolicyStamp(required, acc));
      const wanted = { policyRequired: v.policyRequired, policyAccepted: v.policyAccepted };
      if (v.policyAcceptedAt) wanted.policyAcceptedAt = v.policyAcceptedAt;
      if (v.policyVersion) wanted.policyVersion = v.policyVersion;
      expect(`stamp "${v.case}": metadata`, meta, wanted);
    }
    // A value stored before this change carries milliseconds; the stamp still writes whole seconds.
    expect("stamp: a stored millisecond value is written in whole seconds",
      uploadPolicyStamp(true, { version: "v", acceptedAt: "2026-10-09T01:02:03.456Z" }).policyAcceptedAt, "2026-10-09T01:02:03Z");
  }

  // 1c. The workspace logo goes through the same policy (contract §6, 9 Oct 2026): no fixed sentence, no
  //     "accepted || !required", the prompt shows the versioned wording, the stamp is uploadPolicyStamp.
  {
    const logo = read("lib/studioflow/workspaceLogo.ts");
    const settingsPage = read("app/settings/page.tsx");
    expect("logo: metadata from uploadPolicyMetadata(policy)", /\.\.\.uploadPolicyMetadata\(policy\)/.test(logo), true);
    expect("logo: no raw policyAccepted flag", /policyAccepted:\s*policyAccepted/.test(logo), false);
    expect("logo: settings never passes accepted || !required", /policyAccepted \|\| !requirePolicy/.test(settingsPage), false);
    expect("logo: both logo uploads stamp through uploadPolicyStamp", (settingsPage.match(/const logoPolicy = uploadPolicyStamp\(requirePolicy, logoPolicyAcceptance\)/g) || []).length, 2);
    // Two logo prompts + the Safety & Uploads member view (the wording the member's acceptance stands for).
    expect("logo: both prompts show the versioned wording", (settingsPage.match(/uploadPolicyWording\(settings\?\.uploadSafetyPolicyText, t\(UPLOAD_POLICY_BUILTIN_SENTENCE\)\)/g) || []).length, 3);
    expect("logo: the fixed sentence is gone", settingsPage.includes("Only upload legal, safe and work-related images that belong in this workspace."), false);
  }

  // 1d. Avatar + Settings wiring (owner decision 9 Oct 2026, item 4).
  {
    const profile = read("lib/studioflow/accountProfile.ts");
    const settingsPage = read("app/settings/page.tsx");
    const fnBody = (src, name) => {
      const start = src.indexOf(`function ${name}(`);
      if (start < 0) return "";
      const next = src.indexOf("\nfunction ", start + 10);
      return src.slice(start, next < 0 ? undefined : next);
    };
    expect("avatar: decided by uploadPolicyForSource(ACCOUNT_AVATAR_UPLOAD_SOURCE, …)", /uploadPolicyForSource\(ACCOUNT_AVATAR_UPLOAD_SOURCE,/.test(profile), true);
    expect("avatar: the object gets only that decision's (empty) policy keys", profile.includes("...avatarPolicy.metadata"), true);
    expect("avatar: never writes an acceptance", /writeUploadPolicyAcceptance|policyAccepted:/.test(profile), false);
    const avatarHandler = (settingsPage.match(/async function handleAvatarFile[\s\S]*?\n  }\n/) || [""])[0];
    expect("avatar: the settings handler exists", avatarHandler.includes("uploadAccountAvatar(workspace, file)"), true);
    expect("avatar: the settings handler opens no policy prompt", /uploadPolicy|policyAccept/i.test(avatarHandler), false);
    expect("card: not under Preferences any more (no settingsGeneral dependency)", fnBody(settingsPage, "PreferencesSection").includes("<UploadPolicyBrowserStatusCard"), false);
    expect("card: in Safety & Uploads, for the member view and the admin view", (fnBody(settingsPage, "SafetyUploadsSection").match(/<UploadPolicyBrowserStatusCard /g) || []).length, 2);
    expect("card: the member view is chosen by showsAdminControls", fnBody(settingsPage, "SafetyUploadsSection").includes("if (!policyAccess.showsAdminControls) {"), true);
    expect("section: Safety & Uploads visibility comes from uploadPolicySettingsAccess",
      fnBody(settingsPage, "canSeeSettingsSection").includes('if (sectionId === "safety-uploads") return uploadPolicySettingsAccessFor(workspace).showsSection;'), true);
    expect("section: no settingsSafetyUploads-only gate left", fnBody(settingsPage, "canSeeSettingsSection").includes('if (sectionId === "safety-uploads") return allowed("settingsSafetyUploads");'), false);
    expect("section: the Safety & Uploads gate runs before the workflow-only cut-off",
      fnBody(settingsPage, "canSeeSettingsSection").indexOf('"safety-uploads") return uploadPolicySettingsAccessFor') < fnBody(settingsPage, "canSeeSettingsSection").indexOf("if (isWorkflowOnly) {"), true);
  }

  // 2. An acceptance of an older version does not count.
  const store = fakeStorage();
  const now = new Date("2026-10-08T12:34:56.000Z");
  const first = writeUploadPolicyAcceptance(store, "ws1", "v-old", now);
  expect("accept: records version and ISO-8601 UTC time in whole seconds (contract §2)", first, { version: "v-old", acceptedAt: "2026-10-08T12:34:56Z" });
  expect("accept: key is workspace + version", Object.keys(store.dump()), ["studioflow-upload-policy-acceptance:ws1:v-old"]);
  expect("read: the current version is accepted", readUploadPolicyAcceptance(store, "ws1", "v-old"), first);
  expect("read: a newer version is NOT accepted (re-ask)", readUploadPolicyAcceptance(store, "ws1", "v-new"), null);
  expect("read: another workspace is NOT accepted", readUploadPolicyAcceptance(store, "ws2", "v-old"), null);
  expect("read: no store (SSR) -> null", readUploadPolicyAcceptance(null, "ws1", "v-old"), null);
  const second = writeUploadPolicyAcceptance(store, "ws1", "v-new", new Date("2026-10-09T00:00:00.000Z"));
  expect("accept again: the older version's entry is dropped", Object.keys(store.dump()), ["studioflow-upload-policy-acceptance:ws1:v-new"]);
  expect("read: old version no longer counts after re-acceptance", readUploadPolicyAcceptance(store, "ws1", "v-old"), null);
  expect("read: the new version counts", readUploadPolicyAcceptance(store, "ws1", "v-new"), second);
  // The pre-versioning flag ("accepted", no version) is not an acceptance of anything.
  const legacy = fakeStorage();
  legacy.setItem("studioflow-upload-policy-accepted:ws1", "accepted");
  legacy.setItem("studioflow-upload-policy-accepted-at:ws1", "1759900000000");
  expect("read: the legacy unversioned flag does not count", readUploadPolicyAcceptance(legacy, "ws1", "builtin-1"), null);
  clearUploadPolicyAcceptance(legacy, "ws1");
  expect("reset: clears the legacy keys too", Object.keys(legacy.dump()), []);
  const broken = fakeStorage();
  broken.setItem("studioflow-upload-policy-acceptance:ws1:v-1", "not json");
  expect("read: unparseable entry does not count", readUploadPolicyAcceptance(broken, "ws1", "v-1"), null);
  broken.setItem("studioflow-upload-policy-acceptance:ws1:v-1", JSON.stringify({ version: "v-1", acceptedAt: "yesterday" }));
  expect("read: an entry without a real time does not count", readUploadPolicyAcceptance(broken, "ws1", "v-1"), null);
  broken.setItem("studioflow-upload-policy-acceptance:ws1:v-1", JSON.stringify({ version: "v-other", acceptedAt: "2026-10-08T00:00:00.000Z" }));
  expect("read: a version mismatch inside the entry does not count", readUploadPolicyAcceptance(broken, "ws1", "v-1"), null);
  clearUploadPolicyAcceptance(store, "ws1");
  expect("reset: nothing left for the workspace", readUploadPolicyAcceptance(store, "ws1", "v-new"), null);

  // 3. The four metadata cases. policyAccepted is "true" ONLY with a real
  //    acceptance; policyAcceptedAt / policyVersion only then.
  const acceptance = { version: "v-new", acceptedAt: "2026-10-09T00:00:00.000Z" };
  expect("required + accepted: gate opens", uploadPolicyAllows(true, acceptance), true);
  expect("required + accepted: metadata", uploadPolicyMetadata(uploadPolicyStamp(true, acceptance)),
    { policyRequired: "true", policyAccepted: "true", policyAcceptedAt: "2026-10-09T00:00:00Z", policyVersion: "v-new" });
  expect("required + none: gate blocks", uploadPolicyAllows(true, null), false);
  expect("required + none: metadata (no At / Version keys)", uploadPolicyMetadata(uploadPolicyStamp(true, null)), { policyRequired: "true", policyAccepted: "false" });
  expect("not required + accepted: gate opens", uploadPolicyAllows(false, acceptance), true);
  expect("not required + accepted: a real acceptance is still recorded", uploadPolicyMetadata(uploadPolicyStamp(false, acceptance)),
    { policyRequired: "false", policyAccepted: "true", policyAcceptedAt: "2026-10-09T00:00:00Z", policyVersion: "v-new" });
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
expect("overview: reads the server-stored uploadSafetyPolicyVersion", overview.includes("uploadSafetyPolicyVersion: stringValue(data.uploadSafetyPolicyVersion, \"\") || null"), true);
expect("overview: the timestamp is not the version source", /uploadSafetySettingsUpdatedAtMs[^\n]*version/i.test(overview), false);
expect("settings page: the saved version is read back from the server, not guessed", read("app/settings/page.tsx").includes("uploadSafetyPolicyVersion: refreshed?.uploadSafetyPolicyVersion"), true);

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
const tables = ["language", "macTranslations", "settingsContentTranslations", "shippingTranslations", "trackingEmailTranslations", "screenGapTranslations"]
  .filter((name) => exists(`lib/studioflow/${name}.ts`));
for (const name of tables) compile(`lib/studioflow/${name}.ts`, name);
const { studioT } = await import(pathToFileURL(path.join(tmp, "language.mjs")).href);
for (const key of [
  BUILTIN,
  "I understand and accept the upload policy for this browser.",
  "Upload policy accepted. Choose a file to upload.",
  "Accept the upload policy in the Client Files card before uploading a preview image.",
  "Only the workspace owner and people with the Safety & Uploads permission can change the upload rules."
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
