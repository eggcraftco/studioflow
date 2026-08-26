// The central file library, client side. One rule carries the design: a file
// is uploaded once; everything else — orders, inventory items, purchases, bank
// transactions — is a LINK on its record. Linking never shares to the client
// portal; only the explicit share flow can.

import { httpsCallable } from "firebase/functions";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { functions, storage } from "@/lib/firebase/client";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";

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
export async function uploadLibraryFile(workspace: WorkspaceContext, file: File): Promise<{ fileId?: string }> {
  const safeName = (file.name || "file").replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120);
  const storagePath = `companies/${workspace.id}/library/${Date.now()}-${safeName}`;
  await uploadBytes(storageRef(storage, storagePath), file, { contentType: file.type || "application/octet-stream" });
  return call<{ ok?: boolean; fileId?: string }>(
    "registerLibraryFile",
    { companyId: workspace.id, storagePath, fileName: file.name || safeName, fileType: file.type || "", fileSize: file.size },
    "The file could not be registered."
  );
}

export async function addLibraryFileVersion(workspace: WorkspaceContext, fileId: string, file: File, note = "") {
  const safeName = (file.name || "file").replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120);
  const storagePath = `companies/${workspace.id}/library/${Date.now()}-${safeName}`;
  await uploadBytes(storageRef(storage, storagePath), file, { contentType: file.type || "application/octet-stream" });
  return call<{ ok?: boolean }>(
    "addLibraryFileVersion",
    { companyId: workspace.id, fileId, storagePath, fileName: file.name || safeName, fileSize: file.size, note },
    "The new version could not be saved."
  );
}

export async function libraryFileUrl(storagePath: string) {
  return getDownloadURL(storageRef(storage, storagePath));
}
