// The order screen's files, through the common file service.
//
// WHY THIS EXISTS BESIDE clientFiles.ts RATHER THAN INSIDE IT. The two modules
// talk to two different eras and the difference is not cosmetic:
//
//   clientFiles.ts uploads from the BROWSER straight into Firebase Storage at a
//   path the client chooses, then calls `appendClientFile` to record it in the
//   order document's `clientFiles[]` array. The client decides where the bytes
//   go, and every file it writes carries a permanent download token.
//
//   this module asks the SERVER. `attachOrderFile` decides the provider from
//   the workspace's own storage connection, writes a `fileMetadata` record, and
//   mints a short-lived link per request. Nothing here names a provider, a
//   bucket or a connection id — a client that could name one could name
//   somebody else's.
//
// Both eras stay readable. `listOrderFiles` returns them merged and says which
// is which, so an order whose files all predate the service still lists and
// opens with no migration.
//
// The extension allow-list and the content-type mapping are IMPORTED from
// clientFiles.ts rather than restated. Two copies of an allow-list is the drift
// check-file-proxy-guards.mjs exists to catch, and it would be the same bug here.

import { httpsCallable, type HttpsCallableResult } from "firebase/functions";
import { auth, functions } from "@/lib/firebase/client";
import { requireWorkspacePlanAction } from "@/lib/studioflow/planActions";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";
import { withWebSyncStatus } from "@/lib/studioflow/syncStatus";
import { contentTypeForFile, extensionForFile } from "@/lib/studioflow/clientFiles";
import { storageProviderLabel } from "@/lib/studioflow/storage";
import { throwIfCancelled } from "@/lib/studioflow/uploadRunner";

/** The managed bucket's provider name, as files/identity.js spells it. */
export const MANAGED_PROVIDER = "nivadesk";

/**
 * Where a row came from.
 *
 * `fileMetadata` is a record this service wrote. `order.clientFiles` is a row
 * from the array the older flow owns — it is listed, it opens, and it is NOT
 * deletable from here (see `detachOrderFile`, which refuses it on purpose).
 */
export type OrderFileOrigin = "fileMetadata" | "order.clientFiles";

/**
 * How the bytes are reachable.
 *
 * `authorized` means a link is minted per request and expires. `legacy_token`
 * means the row carries a permanent download URL that anyone holding it can
 * read — named rather than hidden, because the difference decides what the
 * screen may offer.
 */
export type OrderFileAccess = "authorized" | "legacy_token";

/** One row of `listOrderFiles`, exactly as the server merges it. */
export type OrderServiceFile = {
  ref: string;
  fileId: string;
  fileName: string;
  sizeBytes: number;
  contentType: string;
  uploadedAtMs: number;
  uploadedByEmail: string;
  provider: string;
  access: OrderFileAccess;
  legacyTokenUrl: string;
  origin: OrderFileOrigin;
  deletable: boolean;
  /** True when the same object is recorded in both eras. */
  alsoInLegacyArray?: boolean;
};

export type OrderFileListing = {
  files: OrderServiceFile[];
  counts: { total: number; records: number; legacy: number };
};

export type OpenedOrderFile = {
  url: string;
  expiresAtMs: number;
  access: string;
  origin: string;
  fileName: string;
};

export type AttachedOrderFile = {
  ref: string;
  fileId: string;
  fileName: string;
  sizeBytes: number;
  /** True when these exact bytes were already attached — a retry, not a copy. */
  alreadyAttached: boolean;
};

function callable<Request extends Record<string, unknown>, Response>(name: string) {
  return httpsCallable<Request, Response>(functions, name);
}

function messageFor(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/**
 * A callable's `details.reason`, when it set one.
 *
 * Firebase puts the server's `details` payload on the error object. Reading the
 * reason rather than matching the message keeps the branch working when the
 * sentence is reworded or translated.
 */
function refusalReason(error: unknown): string {
  const details = (error as { details?: unknown })?.details;
  if (details && typeof details === "object" && "reason" in details) {
    return String((details as { reason?: unknown }).reason ?? "");
  }
  return "";
}

/**
 * True when `detachOrderFile` refused because the file belongs to the older
 * array. The screen answers this by calling `deleteClientFile` instead — which
 * is the one writer that may rewrite `clientFiles[]`.
 */
export function isLegacyClientFileRefusal(error: unknown): boolean {
  return refusalReason(error) === "legacy_client_file";
}

/** True when the environment cannot sign links (a local emulator on ADC). */
export function isNoSignerRefusal(error: unknown): boolean {
  return refusalReason(error) === "no_signer";
}

/** A file the workspace's own provider holds, rather than the managed bucket. */
export function isProviderHosted(file: Pick<OrderServiceFile, "provider">): boolean {
  return Boolean(file.provider) && file.provider !== MANAGED_PROVIDER;
}

/**
 * The permanent URL, or "" when there is none.
 *
 * Only a legacy row has one. A record written by this service is reachable ONLY
 * through `openOrderFile`, and anything that stores a URL for later — the
 * Preview card's `designLink`, for instance — must not be offered a minted link
 * that expires in ten minutes.
 */
export function permanentUrlFor(file: Pick<OrderServiceFile, "legacyTokenUrl">): string {
  return file.legacyTokenUrl || "";
}

/**
 * Whether this file may be used as the order's Preview image.
 *
 * `designLink` is written into the order document and read back for as long as
 * the order exists, so it needs a URL that does not expire. That is exactly
 * what an authorised file does not have. Refused here rather than in the UI, so
 * every surface answers it the same way.
 */
export function canUseFileAsPreview(file: Pick<OrderServiceFile, "legacyTokenUrl">): boolean {
  return permanentUrlFor(file).length > 0;
}

/**
 * What deleting this file actually does, in the user's words.
 *
 * Google Drive's API does not destroy a file: `files.update` with
 * `trashed: true` moves it to the owner's bin, where they can restore it. The
 * screen must say that, and must not claim a permanent deletion it did not
 * perform.
 */
export function deleteActionLabel(file: Pick<OrderServiceFile, "provider">): string {
  return isProviderHosted(file) ? "Move to bin" : "Delete";
}

/**
 * The confirmation, with `{name}` (and for a provider file `{provider}`) left
 * for the caller to fill AFTER translating — the sentence is the table key.
 * All four providers bin rather than destroy (Drive trash, OneDrive recycle
 * bin, Dropbox deleted files, Box trash), so one sentence covers them.
 */
export function deleteConfirmSentence(file: Pick<OrderServiceFile, "provider" | "fileName">): string {
  if (isProviderHosted(file)) {
    return "Move \"{name}\" to the bin in {provider}? It stays recoverable there.";
  }
  return "Delete \"{name}\" from this order? This cannot be undone.";
}

/** "Google Drive", "OneDrive", "Dropbox", "Box" — or NivaDesk Cloud. Never translated. */
export function providerBadgeLabel(provider: string): string {
  return storageProviderLabel(provider === MANAGED_PROVIDER ? "managed" : provider);
}

/**
 * The rows of a listing that the order document's own array does NOT already
 * show: what the service recorded (`fileMetadata`), and not also present in
 * the legacy array. The legacy rows keep being drawn from `order.clientFiles`
 * exactly as before, so nothing about an existing file's row changes.
 */
export function serviceOnlyRows(files: OrderServiceFile[]): OrderServiceFile[] {
  return files.filter(row => row.origin === "fileMetadata" && row.alsoInLegacyArray !== true && Boolean(row.ref));
}

/**
 * The bytes, base64 encoded, without building one enormous argument list.
 *
 * `String.fromCharCode(...bytes)` on a multi-megabyte file overflows the call
 * stack, which is a crash that only shows up on big files and looks like a
 * broken upload. Chunked deliberately.
 */
async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = new Uint8Array(await blob.arrayBuffer());
  const CHUNK = 0x8000;
  let binary = "";
  for (let offset = 0; offset < buffer.length; offset += CHUNK) {
    binary += String.fromCharCode(...buffer.subarray(offset, offset + CHUNK));
  }
  return btoa(binary);
}

const fileToBase64 = (file: File) => blobToBase64(file);

/**
 * Every file on this order, both eras, as the server merges them.
 *
 * The screen renders THIS rather than the order document's array, because the
 * array cannot see a `fileMetadata` record and a workspace on its own storage
 * would look empty.
 */
export async function listOrderFilesViaService({
  workspace,
  orderId
}: {
  workspace: WorkspaceContext;
  orderId: string;
}): Promise<OrderFileListing> {
  try {
    const response: HttpsCallableResult<OrderFileListing> = await callable<
      { companyId: string; orderId: string },
      OrderFileListing
    >("listOrderFiles")({ companyId: workspace.id, orderId });
    const data = response.data || ({} as OrderFileListing);
    return {
      files: Array.isArray(data.files) ? data.files : [],
      counts: data.counts || { total: 0, records: 0, legacy: 0 }
    };
  } catch (error) {
    throw new Error(messageFor(error, "Could not load this order's files."));
  }
}

/**
 * Attach a file. The SERVER chooses where it goes.
 *
 * Nothing about the destination is sent: no provider, no connection id, no
 * path. `attachOrderFile` reads the workspace's own connection and decides. A
 * retry after a timeout is safe — the object's name is derived from its
 * content, so the second attempt lands on the same record and comes back with
 * `alreadyAttached: true` rather than making a second copy.
 */
export async function attachOrderFileViaService({
  workspace,
  orderId,
  file
}: {
  workspace: WorkspaceContext;
  orderId: string;
  file: File;
}): Promise<AttachedOrderFile> {
  if (!workspace.entitlements.features.client_files) {
    throw new Error("Client Files upload is available on Pro Monthly and Team Monthly plans.");
  }

  // The same local refusals the older flow makes, kept so a wrong file type is
  // answered before a megabyte leaves the browser. The server checks again.
  const extension = extensionForFile(file);
  const contentType = contentTypeForFile(file, extension);
  await requireWorkspacePlanAction(workspace.id, "upload_client_file", {
    fileSizeBytes: file.size,
    orderId
  });

  return withWebSyncStatus(async () => {
    try {
      const response = await callable<
        { companyId: string; orderId: string; fileName: string; contentType: string; dataBase64: string; fileSizeBytes: number },
        AttachedOrderFile
      >("attachOrderFile")({
        companyId: workspace.id,
        orderId,
        fileName: file.name.trim() || "Client file",
        contentType,
        dataBase64: await fileToBase64(file),
        fileSizeBytes: file.size
      });
      const data = response.data || ({} as AttachedOrderFile);
      return {
        ref: String(data.ref || ""),
        fileId: String(data.fileId || ""),
        fileName: String(data.fileName || file.name),
        sizeBytes: Number(data.sizeBytes || file.size),
        alreadyAttached: data.alreadyAttached === true
      };
    } catch (error) {
      throw new Error(messageFor(error, "Upload failed. Please try again."));
    }
  }, "Uploading client file to cloud.");
}

/**
 * How far an upload has got, for a screen that wants to say so.
 *
 * `resumed` is true when this attempt JOINED an upload that an earlier one
 * left behind — the app was closed, or the tab was — rather than starting it.
 */
export type OrderUploadProgress = {
  sentBytes: number;
  totalBytes: number;
  resumed: boolean;
};

type BegunUpload = {
  /** v2: true when this exact file is already attached at the provider (then no session). */
  alreadyAttached?: boolean;
  ref?: string;
  fileId?: string;
  fileName?: string;
  sessionId: string;
  uploadKey: string;
  offset: number;
  sizeBytes: number;
  resumed: boolean;
  adopted: boolean;
  chunkBytes: number;
  chunkAlignBytes: number;
  maxChunkBytes: number;
};

/**
 * Upload a file in chunks the browser sends one request at a time.
 *
 * NOTHING IS REMEMBERED IN THE BROWSER, on purpose. The server derives the
 * upload key from the order, the file's name, its size and its modified stamp,
 * so choosing the same file again after a reload re-derives the same key and
 * `beginOrderFileUpload` answers with the session that was already open and the
 * offset the PROVIDER reports. A key kept in localStorage would be a second
 * source of truth that can disagree with the provider, and the provider is the
 * one that knows what it actually received.
 *
 * The offset to continue from is always the server's answer, never a number
 * this function carried across the gap.
 */
export async function attachOrderFileResumable({
  workspace,
  orderId,
  file,
  onProgress,
  signal
}: {
  workspace: WorkspaceContext;
  orderId: string;
  file: File;
  onProgress?: (progress: OrderUploadProgress) => void;
  /** The upload queue's cancel. Checked between chunks: a chunk in flight finishes. */
  signal?: AbortSignal;
}): Promise<AttachedOrderFile> {
  if (!workspace.entitlements.features.client_files) {
    throw new Error("Client Files upload is available on Pro Monthly and Team Monthly plans.");
  }
  const extension = extensionForFile(file);
  const contentType = contentTypeForFile(file, extension);
  await requireWorkspacePlanAction(workspace.id, "upload_client_file", {
    fileSizeBytes: file.size,
    orderId
  });

  const identity = {
    companyId: workspace.id,
    orderId,
    fileName: file.name.trim() || "Client file",
    contentType,
    sizeBytes: file.size,
    // The server hashes this with the rest; it is what keeps the key stable for
    // THIS file and different for a new version of it.
    lastModifiedMs: file.lastModified || 0
  };

  const begun = (await callable<typeof identity, BegunUpload>("beginOrderFileUpload")(identity)).data;
  // v2: the same file (same order, name, size and stamp) is already attached
  // at the provider and still there. Nothing to send and nothing to complete —
  // the answer is the record, exactly what the one-request path reports.
  if (begun.alreadyAttached === true) {
    onProgress?.({ sentBytes: file.size, totalBytes: file.size, resumed: false });
    return {
      ref: String(begun.ref || ""),
      fileId: String(begun.fileId || ""),
      fileName: String(begun.fileName || file.name),
      sizeBytes: Number(begun.sizeBytes || file.size),
      alreadyAttached: true
    };
  }
  let offset = Number(begun.offset) || 0;
  onProgress?.({ sentBytes: offset, totalBytes: file.size, resumed: begun.adopted === true });

  while (offset < file.size) {
    // A cancelled upload stops between chunks and leaves the provider's session
    // open: choosing the same file again continues from where it stopped.
    throwIfCancelled(signal);
    // `chunkBytes` is the provider's alignment multiplied up; slicing at it
    // keeps every chunk but the last aligned, which is Drive's rule and is
    // checked before any bytes leave the server.
    const length = Math.min(Number(begun.chunkBytes) || 0, file.size - offset);
    if (length <= 0) throw new Error("The upload could not continue.");
    const progress = (await callable<
      { companyId: string; orderId: string; sessionId: string; uploadKey: string; offset: number; sizeBytes: number; dataBase64: string },
      { receivedBytes: number; complete: boolean }
    >("uploadOrderFileChunk")({
      companyId: workspace.id,
      orderId,
      sessionId: begun.sessionId,
      // Sent with every chunk because the request that carries it is rarely
      // served by the instance that opened the session: this is how the server
      // finds the sealed session URL again.
      uploadKey: begun.uploadKey,
      offset,
      sizeBytes: file.size,
      dataBase64: await blobToBase64(file.slice(offset, offset + length))
    })).data;

    const received = Number(progress.receivedBytes) || 0;
    // An answer that does not advance is an infinite loop wearing a retry's
    // clothes — the same refusal the server-side loop makes.
    if (received <= offset) throw new Error("The upload stopped making progress. Try again.");
    offset = Math.min(received, file.size);
    onProgress?.({ sentBytes: offset, totalBytes: file.size, resumed: begun.adopted === true });
    if (progress.complete === true) break;
  }

  const stored = (await callable<typeof identity & { sessionId: string }, AttachedOrderFile>(
    "completeOrderFileUpload"
  )({ ...identity, sessionId: begun.sessionId })).data;

  return {
    ref: String(stored.ref || ""),
    fileId: String(stored.fileId || ""),
    fileName: String(stored.fileName || file.name),
    sizeBytes: Number(stored.sizeBytes || file.size),
    alreadyAttached: stored.alreadyAttached === true
  };
}

/**
 * Attach a file by whichever route its size and the workspace's storage allow.
 *
 * The threshold is a FIRST GUESS, not a rule: the server owns both limits and
 * refuses either way. Trying the chunked route first for a large file and
 * falling back when the storage cannot chunk means this function never has to
 * hold a copy of the server's numbers — the only thing it must not do is send
 * eight megabytes to a callable that will refuse them.
 */
export async function uploadOrderFile({
  workspace,
  orderId,
  file,
  onProgress,
  signal
}: {
  workspace: WorkspaceContext;
  orderId: string;
  file: File;
  onProgress?: (progress: OrderUploadProgress) => void;
  signal?: AbortSignal;
}): Promise<AttachedOrderFile> {
  const SINGLE_REQUEST_HINT = 8 * 1024 * 1024;
  if (file.size <= SINGLE_REQUEST_HINT) {
    throwIfCancelled(signal);
    const attached = await attachOrderFileViaService({ workspace, orderId, file });
    onProgress?.({ sentBytes: file.size, totalBytes: file.size, resumed: false });
    return attached;
  }
  try {
    return await attachOrderFileResumable({ workspace, orderId, file, onProgress, signal });
  } catch (error) {
    if (refusalReason(error) === "resumable_unsupported") {
      // Said plainly. The file is too large for one request AND this workspace's
      // storage cannot continue an interrupted upload, so there is no route —
      // rather than a fallback that silently puts it somewhere else.
      throw new Error(
        "This file is too large to attach in one request, and this workspace's storage cannot continue an interrupted upload."
      );
    }
    throw error;
  }
}

/**
 * A link to open one file, minted now and good for ten minutes.
 *
 * Deliberately NOT routed through `openSharedFile` / `createSharedFileLink`.
 * That rail turns a Firebase Storage URL into a branded `/f/{id}` link, and a
 * provider-hosted file has no such URL: handing it a Google address would
 * either fail or, worse, present a Google file address as a NivaDesk share
 * link. A minted link is opened as itself.
 */
export async function openOrderFileViaService({
  workspace,
  orderId,
  ref
}: {
  workspace: WorkspaceContext;
  orderId: string;
  ref: string;
}): Promise<OpenedOrderFile> {
  const response = await callable<
    { companyId: string; orderId: string; ref: string },
    OpenedOrderFile
  >("openOrderFile")({ companyId: workspace.id, orderId, ref });
  const data = response.data || ({} as OpenedOrderFile);
  if (!data.url) throw new Error("That file could not be opened.");
  return data;
}

/**
 * Open a file in a new tab without the popup blocker eating it.
 *
 * The blank tab is opened SYNCHRONOUSLY inside the click, then pointed at the
 * link once the callable answers — the same reason fileMask.ts does it, and the
 * same reason it does not pass "noopener" (which makes window.open return null
 * and strands an uncontrollable blank tab).
 */
/**
 * True for an address our own file endpoint serves.
 *
 * Such an address is not a place the browser can simply be sent: the endpoint
 * refuses without the person's sign-in in a HEADER, deliberately, so that no
 * credential ever has to travel in a URL. Recognised by its path rather than by
 * a flag on the callable response, because the adapter builds that response and
 * does not know how the link it was handed is meant to be read.
 */
export function isAuthorizedViewUrl(url: string): boolean {
  try {
    return new URL(url).pathname.endsWith("/nvOpenProviderFile");
  } catch {
    return false;
  }
}

/**
 * What opening a file came to.
 *
 * `shown` is whether a tab actually took the file. When the browser refused
 * every `window.open` — a popup blocker, an embedded pane, a strict profile —
 * the bytes may still have been fetched and turned into `blobUrl`, and the
 * screen can show them itself rather than letting the click do nothing. An
 * open that fetched nothing and showed nothing is an error, not an outcome.
 */
export type OpenOrderFileOutcome = {
  shown: boolean;
  /** A blob: URL for the fetched bytes, present only for an authorised file. */
  blobUrl?: string;
  fileName: string;
};

export async function openOrderFileInTab(params: {
  workspace: WorkspaceContext;
  orderId: string;
  ref: string;
}): Promise<OpenOrderFileOutcome> {
  if (typeof window === "undefined") return { shown: false, fileName: "" };
  const tab = window.open("about:blank", "_blank");
  try {
    const opened = await openOrderFileViaService(params);

    if (isAuthorizedViewUrl(opened.url)) {
      // A provider file. The bytes are fetched HERE with the sign-in in the
      // Authorization header, and the tab is pointed at the result — so the
      // grant in the URL is redeemed exactly once, by this person, and nothing
      // credential-shaped is ever navigated to, bookmarked or logged.
      const user = auth.currentUser;
      if (!user) throw new Error("Sign in again to open this file.");
      const idToken = await user.getIdToken();
      const response = await fetch(opened.url, { headers: { Authorization: `Bearer ${idToken}` } });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(text || "That file could not be opened.");
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      let shown = false;
      if (tab && !tab.closed) {
        tab.location.href = objectUrl;
        shown = true;
      } else {
        shown = Boolean(window.open(objectUrl, "_blank"));
      }
      if (shown) {
        // Long enough for the tab to load it; the blob then goes with the page.
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      }
      // Not shown: the caller owns the blob URL now and shows it in-app. Left
      // alive on purpose — revoking it here would hand back a dead link.
      return { shown, blobUrl: objectUrl, fileName: opened.fileName };
    }

    // A file in the managed bucket: a short-lived signed object URL the browser
    // can be sent to directly, exactly as before.
    let shown = false;
    if (tab && !tab.closed) {
      tab.location.href = opened.url;
      shown = true;
    } else {
      shown = Boolean(window.open(opened.url, "_blank"));
    }
    return { shown, fileName: opened.fileName };
  } catch (error) {
    if (tab && !tab.closed) tab.close();
    throw error;
  }
}

/**
 * Detach a file this service recorded.
 *
 * A legacy row is refused with `reason: "legacy_client_file"` — removing one
 * means rewriting the order's array, and that belongs to `deleteClientFile`.
 * Callers branch on `isLegacyClientFileRefusal`.
 */
export async function detachOrderFileViaService({
  workspace,
  orderId,
  ref
}: {
  workspace: WorkspaceContext;
  orderId: string;
  ref: string;
}): Promise<{ removed: boolean; reason: string }> {
  const response = await callable<
    { companyId: string; orderId: string; ref: string },
    { removed?: boolean; reason?: string }
  >("detachOrderFile")({ companyId: workspace.id, orderId, ref });
  const data = response.data || {};
  return { removed: data.removed === true, reason: String(data.reason || "") };
}
