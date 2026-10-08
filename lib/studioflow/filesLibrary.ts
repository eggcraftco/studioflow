// The central file library, client side. One rule carries the design: a file
// is uploaded once; everything else — orders, inventory items, purchases, bank
// transactions — is a LINK on its record. Linking never shares to the client
// portal; only the explicit share flow can.

import { httpsCallable } from "firebase/functions";
import { getDownloadURL, ref as storageRef } from "firebase/storage";
import { functions, storage } from "@/lib/firebase/client";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";
import { browserUploadDeps } from "@/lib/studioflow/storageUploadDeps";
import { newUploadSlot, type UploadScanState, type UploadSlot } from "@/lib/studioflow/uploadProgress";
import { awaitScanVerdict, throwIfCancelled, transferTracked, type TrackedUploadHooks } from "@/lib/studioflow/uploadRunner";

export type LibraryLinkKind = "order" | "inventoryItem" | "purchase" | "bankTransaction" | "supplier";

export type LibraryLink = {
  kind: LibraryLinkKind;
  id: string;
  label: string;
  audience: "team" | "portal" | "internal";
  displayName: string;
  addedAtMs: number;
  addedByEmail: string;
};

export type LibraryVersion = {
  storagePath: string;
  fileName: string;
  fileSize: number;
  uploadedAtMs: number;
  uploadedByEmail: string;
  note: string;
};

export type LibraryActivity = { atMs: number; byEmail: string; action: string; detail: string };

export type LibraryFile = {
  id: string;
  fileName: string;
  displayName: string;
  fileType: string;
  fileSize: number;
  storagePath: string;
  source: "clientFile" | "inventoryPhoto" | "bankReceipt" | "library" | string;
  links: LibraryLink[];
  linkKinds: string[];
  clientPortalVisible: boolean;
  tags: string[];
  versions: LibraryVersion[];
  activeVersionIndex: number;
  activity: LibraryActivity[];
  trashedAtMs: number;
  uploadedByEmail: string;
  createdAtMs: number;
  updatedAtMs: number;
};

async function call<T>(name: string, payload: Record<string, unknown>, fallback: string): Promise<T> {
  try {
    const callable = httpsCallable<Record<string, unknown>, T>(functions, name);
    const result = await callable(payload);
    return result.data;
  } catch (error) {
    const raw = error instanceof Error ? error.message : "";
    const cleaned = raw.replace(/^[a-z-]+:\s*/i, "").trim();
    throw new Error(!cleaned || /^(internal|unknown|unavailable)$/i.test(cleaned) ? fallback : cleaned);
  }
}

export async function listLibraryFiles(
  workspace: WorkspaceContext,
  filter: { linkKey?: string; kind?: string; trashed?: boolean } = {}
) {
  return call<{ ok?: boolean; files?: LibraryFile[]; capped?: boolean }>(
    "listLibraryFiles",
    { companyId: workspace.id, ...filter },
    "The file library could not be loaded."
  );
}

export async function indexWorkspaceFilesIntoLibrary(workspace: WorkspaceContext) {
  return call<{ ok?: boolean; created?: number; refreshed?: number }>(
    "indexWorkspaceFilesIntoLibrary",
    { companyId: workspace.id },
    "Existing files could not be indexed."
  );
}

export async function renameLibraryFile(workspace: WorkspaceContext, fileId: string, displayName: string) {
  return call<{ ok?: boolean }>("renameLibraryFile", { companyId: workspace.id, fileId, displayName }, "The file could not be renamed.");
}

export async function linkLibraryFile(
  workspace: WorkspaceContext,
  fileId: string,
  kind: LibraryLinkKind,
  id: string,
  label = ""
) {
  return call<{ ok?: boolean }>("linkLibraryFile", { companyId: workspace.id, fileId, kind, id, label }, "The link could not be added.");
}

export async function unlinkLibraryFile(workspace: WorkspaceContext, fileId: string, kind: LibraryLinkKind, id: string) {
  return call<{ ok?: boolean }>("unlinkLibraryFile", { companyId: workspace.id, fileId, kind, id }, "The link could not be removed.");
}

export async function shareLibraryFileWithOrder(
  workspace: WorkspaceContext,
  fileId: string,
  orderId: string,
  visibility: "team" | "portal" | "internal",
  displayName = ""
) {
  return call<{ ok?: boolean }>(
    "shareLibraryFileWithOrder",
    { companyId: workspace.id, fileId, orderId, visibility, displayName },
    "The file could not be shared."
  );
}

export async function trashLibraryFile(workspace: WorkspaceContext, fileId: string) {
  return call<{ ok?: boolean }>("trashLibraryFile", { companyId: workspace.id, fileId }, "The file could not be moved to trash.");
}

export async function restoreLibraryFile(workspace: WorkspaceContext, fileId: string) {
  return call<{ ok?: boolean }>("restoreLibraryFile", { companyId: workspace.id, fileId }, "The file could not be restored.");
}

export async function deleteLibraryFile(workspace: WorkspaceContext, fileId: string) {
  return call<{ ok?: boolean }>("deleteLibraryFile", { companyId: workspace.id, fileId }, "The file could not be deleted.");
}

export async function setLibraryFileActiveVersion(workspace: WorkspaceContext, fileId: string, index: number) {
  return call<{ ok?: boolean }>("setLibraryFileActiveVersion", { companyId: workspace.id, fileId, index }, "The version could not be selected.");
}

// Library uploads live on the library's OWN storage path — the rule for it
// allows read and create only (objects are immutable; deletion is the server's
// trash-first job). Older records may still point at the client_files/library
// squat until the one-off migration has swept them.
//
// The timestamp in the path comes from the upload's slot, not from the clock
// at call time: a retry with the same slot targets the same path, so the
// object already there is reused and the server's sha1(path) record id is the
// same one — a retry can never register a second file.
type LibraryUploadOptions = { slot?: UploadSlot; progress?: TrackedUploadHooks };

function libraryStoragePath(workspace: WorkspaceContext, file: File, slot: UploadSlot) {
  const safeName = (file.name || "file").replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120);
  return { safeName, storagePath: `companies/${workspace.id}/library/${slot.createdAtMs}-${safeName}` };
}

async function transferLibraryFile(workspace: WorkspaceContext, file: File, options: LibraryUploadOptions) {
  const hooks: TrackedUploadHooks = options.progress ?? {};
  hooks.onStage?.("preparing");
  const slot = options.slot ?? newUploadSlot();
  const { safeName, storagePath } = libraryStoragePath(workspace, file, slot);
  throwIfCancelled(hooks.signal);
  const deps = browserUploadDeps(file, { contentType: file.type || "application/octet-stream" });
  await transferTracked(deps, storagePath, hooks, { skipIfExists: slot.attempt > 1 });
  return { slot, safeName, storagePath, deps, hooks };
}

async function settleLibraryScan(deps: ReturnType<typeof browserUploadDeps>, storagePath: string, options: LibraryUploadOptions, hooks: TrackedUploadHooks) {
  const scan: UploadScanState = options.progress ? await awaitScanVerdict(deps, storagePath, hooks) : "none";
  return scan;
}

export async function uploadLibraryFile(
  workspace: WorkspaceContext,
  file: File,
  options: LibraryUploadOptions = {}
): Promise<{ fileId?: string; scan: UploadScanState }> {
  const { safeName, storagePath, deps, hooks } = await transferLibraryFile(workspace, file, options);
  // registerLibraryFile answers { existed: true } for a path it already knows.
  const registered = await call<{ ok?: boolean; fileId?: string }>(
    "registerLibraryFile",
    { companyId: workspace.id, storagePath, fileName: file.name || safeName, fileType: file.type || "", fileSize: file.size },
    "The file could not be registered."
  );
  const scan = await settleLibraryScan(deps, storagePath, options, hooks);
  return { fileId: registered.fileId, scan };
}

/** Whether the record already carries a version at this path — the retry check. */
async function libraryVersionExists(workspace: WorkspaceContext, fileId: string, storagePath: string) {
  const result = await listLibraryFiles(workspace, {});
  const record = (result.files ?? []).find(entry => entry.id === fileId);
  return Boolean(record && record.versions.some(version => version.storagePath === storagePath));
}

export async function addLibraryFileVersion(
  workspace: WorkspaceContext,
  fileId: string,
  file: File,
  note = "",
  options: LibraryUploadOptions = {}
): Promise<{ ok?: boolean; scan: UploadScanState }> {
  const { slot, safeName, storagePath, deps, hooks } = await transferLibraryFile(workspace, file, options);
  // addLibraryFileVersion pushes a version every time it is called, so a
  // retry asks first whether the earlier attempt already got that far.
  const alreadyThere = slot.attempt > 1 && await libraryVersionExists(workspace, fileId, storagePath);
  const result = alreadyThere
    ? { ok: true }
    : await call<{ ok?: boolean }>(
      "addLibraryFileVersion",
      { companyId: workspace.id, fileId, storagePath, fileName: file.name || safeName, fileSize: file.size, note },
      "The new version could not be saved."
    );
  const scan = await settleLibraryScan(deps, storagePath, options, hooks);
  return { ...result, scan };
}

export async function libraryFileUrl(storagePath: string) {
  return getDownloadURL(storageRef(storage, storagePath));
}
