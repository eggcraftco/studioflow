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

export const UPLOAD_POLICY_BUILTIN_VERSION = "builtin-1";

export type UploadPolicySource = {
  uploadSafetyPolicyText?: string | null;
  /** companySettings.uploadSafetySettingsUpdatedAt as epoch ms, when present. */
  uploadSafetySettingsUpdatedAtMs?: number | null;
};

/** The workspace's own wording when it has one, else the built-in sentence
 *  (callers translate the built-in sentence with t()). */
export function uploadPolicyWording(policyText: string | null | undefined, builtIn = UPLOAD_POLICY_BUILTIN_SENTENCE) {
  const text = (policyText ?? "").trim();
  return text || builtIn;
}

/** FNV-1a over the UTF-16 code units, two seeds, 16 hex chars. Synchronous on
 *  purpose: the version is read during render, and a stable text hash is all
 *  that is needed to notice a changed policy. */
function stableTextHash(text: string) {
  const fnv = (seed: number) => {
    let hash = seed >>> 0;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
  };
  return `${fnv(0x811c9dc5)}${fnv(0x050c5d1f)}`;
}

/** The identity of the policy the uploader is asked to accept:
 *  the server's save timestamp when there is one, else a stable hash of the
 *  workspace text, else the built-in sentence's own version. */
export function uploadPolicyVersion(source: UploadPolicySource | null | undefined): string {
  const updatedAtMs = source?.uploadSafetySettingsUpdatedAtMs;
  if (typeof updatedAtMs === "number" && Number.isFinite(updatedAtMs) && updatedAtMs > 0) {
    return `ts-${Math.floor(updatedAtMs)}`;
  }
  const text = (source?.uploadSafetyPolicyText ?? "").trim();
  if (text) return `text-${stableTextHash(text)}`;
  return UPLOAD_POLICY_BUILTIN_VERSION;
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
// The pre-versioning keys. They are never read as an acceptance any more (an
// acceptance of an unknown version does not count); a reset clears them too.
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
  const acceptance: UploadPolicyAcceptance = { version, acceptedAt: now.toISOString() };
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

export function uploadPolicyStamp(required: boolean, acceptance: UploadPolicyAcceptance | null | undefined): UploadPolicyStamp {
  if (acceptance) {
    return {
      policyRequired: required ? "true" : "false",
      policyAccepted: "true",
      policyAcceptedAt: acceptance.acceptedAt,
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
