// The upload-policy acceptance for client files (8 Oct 2026), shared by the
// order page, the Files library and Settings. Pure: no React, no Firebase —
// the browser's localStorage is passed in, so scripts/check-upload-policy.mjs
// runs it against a Map.
//
// Whether acceptance is REQUIRED is the workspace's setting
// (companySettings.uploadSafetyRequirePolicyAcceptance, written by the
// server). The acceptance itself is given once in this browser, per workspace
// AND per policy version: when the policy changes, the stored acceptance no
// longer counts and the box is asked again. The metadata written to the
// object says both things separately (policyRequired / policyAccepted) and
// "true" in policyAccepted only ever means a real acceptance of the current
// version exists in this browser — never a manufactured one because nothing
// was required. The stamp is an audit trail, not a security control and not
// verified consent on its own.

/** The sentence shown when the workspace has no policy text of its own — the
 *  same wording the iOS alert and the Android prompt fall back to. */
export const UPLOAD_POLICY_BUILTIN_SENTENCE =
  "Before uploading, confirm that this file is legal, safe, client-approved when needed, and suitable for this workspace.";

/** The versioned built-in policy. "builtin-2" only when the built-in
 *  sentence's MEANING changes; a translation or a language switch never
 *  changes a version (the version derives from the workspace's source text,
 *  not from the viewer's language). */
export const UPLOAD_POLICY_BUILTIN_VERSION = "builtin-1";

export type UploadPolicySource = {
  uploadSafetyPolicyText?: string | null;
  /** companySettings.uploadSafetyPolicyVersion, written by the server on every
   *  Safety & Uploads save (saveUploadSafetySettings). When present it is THE
   *  version; the text-derived one is only a fallback for older records. */
  uploadSafetyPolicyVersion?: string | null;
};

/** The workspace's own wording when it has one, else the built-in sentence
 *  (callers translate the built-in sentence with t()). This is exactly the text
 *  the stored version stands for — the dialog must show it, nothing else. */
export function uploadPolicyWording(policyText: string | null | undefined, builtIn = UPLOAD_POLICY_BUILTIN_SENTENCE) {
  const text = normalizeUploadPolicyText(policyText);
  return text || builtIn;
}

// ---------------------------------------------------------------------------
// The shared version algorithm (docs/native/upload-policy-version-contract-
// 2026-10-08.md v2; vectors in scripts/fixtures/upload-policy-version-vectors.json).
// Normalise in this order: Unicode NFC; CRLF/CR -> LF; trailing spaces and tabs
// per line; trim. Nothing else. UTF-8 (no BOM), SHA-256, lowercase hex, the FULL
// 64 characters: "sha256-<64 hex>". Empty after normalisation -> "builtin-1".
// ---------------------------------------------------------------------------

export function normalizeUploadPolicyText(text: string | null | undefined): string {
  return String(text ?? "")
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .trim();
}

/** SHA-256 (FIPS 180-4) over bytes, synchronous. Bundled because the version
 *  is read during render and Web Crypto's digest is async only; the vectors
 *  check pins it against the contract hashes. */
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

function sha256Hex(bytes: Uint8Array): string {
  const bitLength = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  // Message length in bits, big-endian 64-bit (inputs here are far below 2^32 bits).
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);

  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
  }
  let hex = "";
  for (let i = 0; i < 8; i += 1) hex += h[i].toString(16).padStart(8, "0");
  return hex;
}

/** The contract's version for a policy text: "sha256-<64 hex>" of the
 *  normalised UTF-8 text, or "builtin-1" when nothing is left after
 *  normalisation. Same function on the server (functions/uploadPolicyVersion.js),
 *  iOS and Android. */
export function uploadPolicyVersionForText(text: string | null | undefined): string {
  const normalized = normalizeUploadPolicyText(text);
  if (!normalized) return UPLOAD_POLICY_BUILTIN_VERSION;
  return `sha256-${sha256Hex(new TextEncoder().encode(normalized))}`;
}

/** UI-only short form (first 12 hex). Never stored, never compared. */
export function uploadPolicyVersionShort(version: string | null | undefined): string {
  const value = String(version ?? "");
  const match = /^sha256-([0-9a-f]{64})$/.exec(value);
  return match ? `sha256-${match[1].slice(0, 12)}` : value;
}

// A text/version disagreement is logged once per pair, not on every render.
const warnedVersionMismatches = new Set<string>();

/** The identity of the policy the uploader is asked to accept — source order
 *  per the contract: the server-stored uploadSafetyPolicyVersion when present
 *  (on a disagreement with the text-derived value the SERVER value is used
 *  and the disagreement is logged once), else the version computed from the
 *  workspace text, which is "builtin-1" when that text is empty. There is no
 *  timestamp source: saving an unrelated Safety & Uploads setting (maximum
 *  size, the required switch) never changes the version or asks again. */
export function uploadPolicyVersion(source: UploadPolicySource | null | undefined): string {
  const computed = uploadPolicyVersionForText(source?.uploadSafetyPolicyText);
  const stored = typeof source?.uploadSafetyPolicyVersion === "string" ? source.uploadSafetyPolicyVersion.trim() : "";
  if (!stored) return computed;
  if (stored !== computed) {
    const pair = `${stored}|${computed}`;
    if (!warnedVersionMismatches.has(pair)) {
      warnedVersionMismatches.add(pair);
      console.warn(`upload policy: stored version ${uploadPolicyVersionShort(stored)} differs from the text-derived ${uploadPolicyVersionShort(computed)}; using the stored one.`);
    }
  }
  return stored;
}

export type UploadPolicyAcceptance = {
  version: string;
  /** ISO-8601 UTC, the moment the box was ticked in this browser. */
  acceptedAt: string;
};

/** The subset of Storage the helpers use — window.localStorage, or a fake. */
export type UploadPolicyAcceptanceStore = {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

const ACCEPTANCE_PREFIX = "studioflow-upload-policy-acceptance:";
// The pre-versioning keys. The rule (contract §4): an acceptance record counts
// only when it proves the workspace AND the current version — its key carries
// workspaceId + version and that version equals the current one. These carry
// no version, so they are never read as an acceptance; a reset clears them too.
// No date cut-off: an old record is simply asked again, never rewritten.
const LEGACY_ACCEPTED_PREFIX = "studioflow-upload-policy-accepted:";
const LEGACY_ACCEPTED_AT_PREFIX = "studioflow-upload-policy-accepted-at:";

export function uploadPolicyAcceptanceKey(workspaceId: string, version: string) {
  return `${ACCEPTANCE_PREFIX}${workspaceId}:${version}`;
}

function workspaceKeys(store: UploadPolicyAcceptanceStore, workspaceId: string) {
  const keys: string[] = [];
  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i);
    if (!key) continue;
    if (
      key.startsWith(`${ACCEPTANCE_PREFIX}${workspaceId}:`)
      || key === `${LEGACY_ACCEPTED_PREFIX}${workspaceId}`
      || key === `${LEGACY_ACCEPTED_AT_PREFIX}${workspaceId}`
    ) keys.push(key);
  }
  return keys;
}

/** The acceptance for THIS workspace and THIS version, or null. A stored
 *  acceptance for any other version does not count. */
export function readUploadPolicyAcceptance(
  store: UploadPolicyAcceptanceStore | null | undefined,
  workspaceId: string,
  version: string
): UploadPolicyAcceptance | null {
  if (!store) return null;
  let raw: string | null;
  try {
    raw = store.getItem(uploadPolicyAcceptanceKey(workspaceId, version));
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { version?: unknown; acceptedAt?: unknown };
    if (parsed.version !== version) return null;
    if (typeof parsed.acceptedAt !== "string" || !Number.isFinite(Date.parse(parsed.acceptedAt))) return null;
    return { version, acceptedAt: parsed.acceptedAt };
  } catch {
    return null;
  }
}

/** Records the acceptance given now for this workspace and version; any older
 *  version's entry for the workspace is dropped. Throws when the store does
 *  (private mode, quota) — the caller decides what to tell the user. */
export function writeUploadPolicyAcceptance(
  store: UploadPolicyAcceptanceStore,
  workspaceId: string,
  version: string,
  now: Date = new Date()
): UploadPolicyAcceptance {
  const acceptance: UploadPolicyAcceptance = { version, acceptedAt: uploadPolicyIsoSeconds(now) };
  for (const key of workspaceKeys(store, workspaceId)) store.removeItem(key);
  store.setItem(uploadPolicyAcceptanceKey(workspaceId, version), JSON.stringify(acceptance));
  return acceptance;
}

/** "Reset for this browser": every acceptance this workspace has here, any version. */
export function clearUploadPolicyAcceptance(store: UploadPolicyAcceptanceStore, workspaceId: string) {
  for (const key of workspaceKeys(store, workspaceId)) store.removeItem(key);
}

/** The gate: nothing required, or a real acceptance of the current version. */
export function uploadPolicyAllows(required: boolean, acceptance: UploadPolicyAcceptance | null | undefined) {
  return !required || Boolean(acceptance);
}

export type UploadPolicyStamp = {
  /** The workspace setting at upload time. */
  policyRequired: "true" | "false";
  /** "true" only with a real acceptance of the current version in this browser. */
  policyAccepted: "true" | "false";
  policyAcceptedAt?: string;
  policyVersion?: string;
};

/** Contract §2: policyAcceptedAt is ISO-8601 UTC in whole seconds ("YYYY-MM-DDTHH:MM:SSZ"), as iOS and
 *  Android write it. toISOString() carried milliseconds; a stored value with them is cut to seconds. */
export function uploadPolicyIsoSeconds(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const iso = Number.isFinite(date.getTime()) ? date.toISOString() : String(value);
  return iso.replace(/\.\d+Z$/, "Z");
}

export function uploadPolicyStamp(required: boolean, acceptance: UploadPolicyAcceptance | null | undefined): UploadPolicyStamp {
  if (acceptance) {
    return {
      policyRequired: required ? "true" : "false",
      policyAccepted: "true",
      policyAcceptedAt: uploadPolicyIsoSeconds(acceptance.acceptedAt),
      policyVersion: acceptance.version
    };
  }
  return { policyRequired: required ? "true" : "false", policyAccepted: "false" };
}

/** The custom-metadata keys an upload writes. policyAcceptedAt and
 *  policyVersion are present only with a real acceptance. */
export function uploadPolicyMetadata(stamp: UploadPolicyStamp): Record<string, string> {
  const metadata: Record<string, string> = {
    policyRequired: stamp.policyRequired,
    policyAccepted: stamp.policyAccepted
  };
  if (stamp.policyAcceptedAt) metadata.policyAcceptedAt = stamp.policyAcceptedAt;
  if (stamp.policyVersion) metadata.policyVersion = stamp.policyVersion;
  return metadata;
}

// ---------------------------------------------------------------------------
// Scope (owner decision 9 Oct 2026, item 4a). The workspace upload policy is
// the CLIENT-FILE policy: client files, order previews and the workspace logo.
// A personal account avatar is not under it — no prompt, no acceptance written,
// no policy keys on the object; the text shown and the acceptance stored must
// belong to the same scope, and no avatar notice exists. Same rule on iOS and
// Android; vectors kind "scope" in docs/native/upload-policy-stamp-vectors.json.
// ---------------------------------------------------------------------------

export const ACCOUNT_AVATAR_UPLOAD_SOURCE = "account_avatar";

/** Whether the workspace client-file policy governs an upload from this source. */
export function uploadPolicyAppliesToSource(source: string) {
  return source !== ACCOUNT_AVATAR_UPLOAD_SOURCE;
}

export type UploadPolicySourceDecision = {
  /** Show the policy prompt before this upload. */
  asks: boolean;
  /** The upload may start now. */
  allowed: boolean;
  /** The policy keys written on the object ({} when the policy does not apply). */
  metadata: Record<string, string>;
};

/** One decision per upload source: the client-file gate and stamp where the
 *  workspace policy applies; nothing at all (no prompt, no keys) where it does not. */
export function uploadPolicyForSource(
  source: string,
  required: boolean,
  acceptance: UploadPolicyAcceptance | null | undefined
): UploadPolicySourceDecision {
  if (!uploadPolicyAppliesToSource(source)) return { asks: false, allowed: true, metadata: {} };
  const allowed = uploadPolicyAllows(required, acceptance);
  return { asks: !allowed, allowed, metadata: uploadPolicyMetadata(uploadPolicyStamp(required, acceptance)) };
}

// ---------------------------------------------------------------------------
// Settings ▸ Safety & Uploads visibility (owner decision 9 Oct 2026, item 4b).
// Everyone who can upload client files sees THEIR OWN acceptance on this
// browser there (status, date, short version) and can forget it — no settings
// permission needed (it used to sit under Preferences, behind settingsGeneral).
// The policy's admin controls stay with the owner and with admins/members given
// the Safety & Uploads permission; workflow-only and view-only never get them.
// Vectors kind "card" (same file); iOS and Android run the same rule.
// ---------------------------------------------------------------------------

export type UploadPolicySettingsAccessInput = {
  role: string;
  /** The plan has Client Files (entitlements.features.client_files). */
  clientFilesPlan: boolean;
  /** memberAccess.clientFiles !== false */
  clientFilesAccess: boolean;
  /** memberAccess.settingsSafetyUploads !== false */
  settingsSafetyUploads: boolean;
};

export type UploadPolicySettingsAccess = {
  showsSection: boolean;
  showsAcceptanceCard: boolean;
  showsAdminControls: boolean;
};

function uploadPolicyRoleKey(role: string) {
  const compact = String(role ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (compact === "workflowonly") return "workflow";
  if (compact === "viewonly" || compact === "readonly") return "viewer";
  return compact;
}

export function uploadPolicySettingsAccess(input: UploadPolicySettingsAccessInput): UploadPolicySettingsAccess {
  const role = uploadPolicyRoleKey(input.role);
  const canUpload = input.clientFilesPlan && input.clientFilesAccess
    && (role === "owner" || role === "admin" || role === "member" || role === "workflow");
  const showsAdminControls = role === "owner" || ((role === "admin" || role === "member") && input.settingsSafetyUploads);
  const showsSection = canUpload || showsAdminControls;
  return { showsSection, showsAcceptanceCard: showsSection, showsAdminControls };
}
