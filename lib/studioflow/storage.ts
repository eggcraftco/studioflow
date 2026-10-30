// "Use your own cloud" — the client half of the storage connection callables.
//
// The server contract is functions/files/storageConnect.js (own-cloud CONTRACT,
// 30 Oct 2026), and this file is a thin, typed mirror of it. Three things it
// deliberately does NOT do:
//
//   it does not decide whether a Connect button appears. Each provider's
//   `available` comes from the server and only an explicit `true` opens the
//   flow — a provider whose OAuth app does not exist yet is told false, and a
//   screen that decided this locally would offer a consent page for an
//   application that does not exist.
//
//   it does not decide where a file goes. `storageRoute` reads the server's
//   `primary`, and anything it cannot read (an older server, a failed call)
//   means NivaDesk Cloud — the live upload path, unchanged.
//
//   it does not see a credential. `storageStatus` returns safe summaries; there
//   is no field here for a token or for the pointer to one.
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";

/** The providers a workspace can keep its files in, besides NivaDesk Cloud. */
export const STORAGE_PROVIDER_IDS = ["gdrive", "onedrive", "dropbox", "box"] as const;
export type StorageProviderId = (typeof STORAGE_PROVIDER_IDS)[number];

/** NivaDesk Cloud, as `storageStatus().primary.provider` names it. */
export const MANAGED_STORAGE = "managed";

/** Brand names: never translated. */
const PROVIDER_LABELS: Readonly<Record<string, string>> = Object.freeze({
  gdrive: "Google Drive",
  onedrive: "OneDrive",
  dropbox: "Dropbox",
  box: "Box",
  managed: "NivaDesk Cloud",
  nivadesk: "NivaDesk Cloud",
});

export function isStorageProviderId(value: string): value is StorageProviderId {
  return (STORAGE_PROVIDER_IDS as readonly string[]).includes(value);
}

export function storageProviderLabel(id: string): string {
  return PROVIDER_LABELS[id] || id;
}

/** The plan's §8.1 record, minus everything a client may not see. */
export type StorageConnectionRow = {
  connectionId: string;
  provider: string;
  status: "connected" | "limited" | "reauth_required" | "revoked" | "error" | string;
  rootFolderId: string;
  displayAccountHint: string;
  connectedAt: number;
  lastSuccessAt: number;
  lastErrorCode: string;
  /** New files go to this connection. At most one row is primary. */
  primary: boolean;
};

export type StorageProviderOffer = {
  id: string;
  label: string;
  /** Whether this server can connect it at all. Only `true` offers Connect. */
  available: boolean;
};

export type StorageStatusResult = {
  /** Legacy fields (drive-night era), kept so an older reader still parses. */
  provider: string;
  available: boolean;
  providers: StorageProviderOffer[];
  /** Where NEW files go. `provider === "managed"` is NivaDesk Cloud. */
  primary: { provider: string; connectionId: string; label: string };
  connections: StorageConnectionRow[];
  canConnect: boolean;
  canDisconnect: boolean;
  /** Why not, when a capability is false: "needs_owner", "workflow_only", … */
  reason: string;
};

export type StorageConsent = {
  stage: string;
  provider: string;
  consentUrl: string;
  state: string;
  expiresAtMs: number;
  scopes: string[];
};

const text = (value: unknown): string => (typeof value === "string" ? value : "");
const count = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const list = (value: unknown): string[] => (Array.isArray(value) ? value.map(text).filter(Boolean) : []);
const record = (value: unknown): Record<string, unknown> =>
  (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {});

/**
 * Normalised by NAMING what may arrive rather than by spreading the answer.
 *
 * A field the server grows later is dropped here by default, which is the
 * direction a mistake should fall in when the thing on the other side of the
 * wire is a credential store.
 */
export function normalizeStorageRow(raw: unknown): StorageConnectionRow {
  const row = record(raw);
  return {
    connectionId: text(row.connectionId),
    provider: text(row.provider) || "gdrive",
    status: text(row.status),
    rootFolderId: text(row.rootFolderId),
    displayAccountHint: text(row.displayAccountHint),
    connectedAt: count(row.connectedAt),
    lastSuccessAt: count(row.lastSuccessAt),
    lastErrorCode: text(row.lastErrorCode),
    primary: row.primary === true,
  };
}

/** One answer → the shape every screen reads. Exported for the check script. */
export function normalizeStorageStatus(raw: unknown): StorageStatusResult {
  const answer = record(raw);
  const legacyProvider = text(answer.provider) || "gdrive";
  const legacyAvailable = answer.available === true;
  const offered = Array.isArray(answer.providers)
    ? answer.providers.map((entry) => {
        const row = record(entry);
        const id = text(row.id);
        return { id, label: text(row.label) || storageProviderLabel(id), available: row.available === true };
      }).filter((row) => isStorageProviderId(row.id))
    // A server from before the four providers knew only Drive.
    : [{ id: legacyProvider, label: storageProviderLabel(legacyProvider), available: legacyAvailable }];
  const primaryRaw = record(answer.primary);
  const primaryProvider = text(primaryRaw.provider);
  return {
    provider: legacyProvider,
    available: legacyAvailable,
    providers: offered,
    // No `primary` (an older server) is NivaDesk Cloud: the safe reading.
    primary: {
      provider: primaryProvider && (primaryProvider === MANAGED_STORAGE || isStorageProviderId(primaryProvider))
        ? primaryProvider
        : MANAGED_STORAGE,
      connectionId: text(primaryRaw.connectionId),
      label: text(primaryRaw.label) || storageProviderLabel(primaryProvider || MANAGED_STORAGE),
    },
    connections: Array.isArray(answer.connections) ? answer.connections.map(normalizeStorageRow) : [],
    canConnect: answer.canConnect === true,
    canDisconnect: answer.canDisconnect === true,
    reason: text(answer.reason),
  };
}

export async function getStorageStatus(companyId: string): Promise<StorageStatusResult> {
  const callable = httpsCallable<Record<string, unknown>, Record<string, unknown>>(functions, "storageStatus");
  const answer = (await callable({ companyId })).data || {};
  return normalizeStorageStatus(answer);
}

/**
 * The status, asked at most once a minute per workspace by the order screens.
 *
 * An order page decides its upload route from this, and a person opening ten
 * orders should not cost ten identical calls. A failed call is NOT cached as
 * an answer: it resolves to null (the live path) and the next screen asks again.
 * Settings always reads fresh (`getStorageStatus`) and clears this after a
 * change, so a connect or disconnect is never second-guessed by a stale copy.
 */
const statusCache = new Map<string, { atMs: number; value: Promise<StorageStatusResult | null> }>();
const STATUS_CACHE_MS = 60_000;

export function getStorageStatusCached(companyId: string): Promise<StorageStatusResult | null> {
  const id = companyId.trim();
  if (!id) return Promise.resolve(null);
  const now = Date.now();
  const held = statusCache.get(id);
  if (held && now - held.atMs < STATUS_CACHE_MS) return held.value;
  const value = getStorageStatus(id).catch(() => {
    statusCache.delete(id);
    return null;
  });
  statusCache.set(id, { atMs: now, value });
  return value;
}

export function forgetStorageStatus(companyId?: string) {
  if (companyId) statusCache.delete(companyId.trim());
  else statusCache.clear();
}

/**
 * Where a NEW file of this workspace goes, as the order screens must read it.
 *
 * The safety rule of the whole feature: "managed" — the live upload path,
 * byte-for-byte — unless the server says, in so many words, that a provider is
 * primary. A null status (call failed, older server) is "managed".
 */
export function storageRoute(status: StorageStatusResult | null): string {
  if (!status) return MANAGED_STORAGE;
  const primary = status.primary.provider;
  return isStorageProviderId(primary) ? primary : MANAGED_STORAGE;
}

/** Whether the order screen should also ask `listOrderFiles`: any connection, live or not. */
export function storageHasServiceFiles(status: StorageStatusResult | null): boolean {
  return Boolean(status && status.connections.length > 0);
}

/** The sessionStorage key a web-started consent leaves for its own callback page. */
export const STORAGE_CONNECT_SESSION_PREFIX = "nvStorageConnect:";

export async function beginStorageConnect(companyId: string, provider: StorageProviderId): Promise<StorageConsent> {
  const callable = httpsCallable<Record<string, unknown>, Record<string, unknown>>(functions, "storageConnectStart");
  const answer = record((await callable({ companyId, provider })).data);
  const consent = {
    stage: text(answer.stage),
    provider: text(answer.provider) || provider,
    consentUrl: text(answer.consentUrl),
    state: text(answer.state),
    expiresAtMs: count(answer.expiresAtMs),
    scopes: list(answer.scopes),
  };
  // The mark that tells /oauth/<provider>/callback this consent was started in
  // THIS browser, so it finishes here. Without it the page hands the code to
  // the app (nivadesk://storage-connect), which is where a native flow began.
  if (consent.state && typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(
        `${STORAGE_CONNECT_SESSION_PREFIX}${consent.state}`,
        JSON.stringify({ provider: consent.provider, companyId, atMs: Date.now() })
      );
    } catch {
      // A browser that refuses sessionStorage gets the app hand-off page, with
      // a link back — the connection is not lost, only the shortcut.
    }
  }
  forgetStorageStatus(companyId);
  return consent;
}

export type StorageConnectFinish = {
  /** "connected" or "cancelled". Anything else is a failure and arrives as a thrown error. */
  stage: string;
  provider: string;
  reason: string;
  connection: StorageConnectionRow | null;
  /** How many superseded connections had their stored credential destroyed. */
  retired: number;
};

/**
 * Complete the consent the browser came back from.
 *
 * It sends the code and the state and NOTHING else — no companyId, no provider.
 * Both are recorded on the server in the pending consent, and the server
 * compares them with the caller. A browser that could name the workspace could
 * name the wrong one.
 */
export async function finishStorageConnect(
  params: { code?: string; state: string; error?: string },
): Promise<StorageConnectFinish> {
  const callable = httpsCallable<Record<string, unknown>, Record<string, unknown>>(functions, "storageConnectFinish");
  const answer = record((await callable({
    state: params.state,
    ...(params.code ? { code: params.code } : {}),
    ...(params.error ? { error: params.error } : {}),
  })).data);
  forgetStorageStatus();
  return {
    stage: text(answer.stage),
    provider: text(answer.provider),
    reason: text(answer.reason),
    connection: answer.connection ? normalizeStorageRow(answer.connection) : null,
    retired: count(answer.retired),
  };
}

export async function disconnectStorage(companyId: string, connectionId: string): Promise<StorageConnectionRow> {
  const callable = httpsCallable<Record<string, unknown>, Record<string, unknown>>(functions, "storageDisconnect");
  const answer = record((await callable({ companyId, connectionId })).data);
  forgetStorageStatus(companyId);
  return normalizeStorageRow(answer.connection);
}

const isLive = (row: StorageConnectionRow) => row.status === "connected" || row.status === "limited";

/** The provider's live connection, or none. Anything not `connected`/`limited` is not live. */
export function liveStorageConnection(rows: StorageConnectionRow[], provider: string): StorageConnectionRow | null {
  return rows.find((row) => row.provider === provider && isLive(row)) || null;
}

/**
 * A connection this workspace HAS with this provider, which has stopped working.
 *
 * A live connection outranks it, and a revoked row is not a problem — it is
 * what disconnecting leaves behind, so it reads as "not connected".
 */
export function storageConnectionNeedingReconnect(rows: StorageConnectionRow[], provider: string): StorageConnectionRow | null {
  if (liveStorageConnection(rows, provider)) return null;
  return rows.find((row) => row.provider === provider && (row.status === "reauth_required" || row.status === "error")) || null;
}

/**
 * Why the person cannot change this, in their own words.
 *
 * The server sends a reason code rather than a sentence so that the wording
 * lives with the screen and the twelve languages, not in a callable.
 */
export function storageReasonText(reason: string, t: (s: string) => string): string {
  switch (reason) {
    case "workflow_only":
      return t("Your role does not include workspace settings.");
    case "assigned_only":
      return t("You only see the work assigned to you, so this cannot be changed here.");
    case "not_signed_in":
      return t("Please sign in again.");
    default:
      // "needs_owner" and anything newer: the one rule of the first release.
      return t("Only the workspace owner can change cloud storage.");
  }
}
