// GN-01 (22 Oct 2026): selecting several files on the Files screen, and dropping
// several files onto it. Pure — no React, no Firebase — so
// scripts/check-file-selection.mts runs it in Node.
//
// The rule the screen keeps: what is ticked AND on screen is what a bulk action
// touches. A search, a view change or a reload prunes the selection to the rows
// still shown, so a file hidden by the current filter is never acted on by
// accident. The selection belongs to one workspace; a different workspace id
// starts it empty.

export type FileSelection = {
  workspaceId: string;
  ids: ReadonlySet<string>;
};

export function emptyFileSelection(workspaceId = ""): FileSelection {
  return { workspaceId, ids: new Set() };
}

/** The selection for `workspaceId`: the same one, or an empty one if it was made in another workspace. */
export function selectionForWorkspace(selection: FileSelection, workspaceId: string): FileSelection {
  return selection.workspaceId === workspaceId ? selection : emptyFileSelection(workspaceId);
}

/** Only ids still on screen stay selected. Returns the same object when nothing changed. */
export function pruneFileSelection(selection: FileSelection, visibleIds: readonly string[]): FileSelection {
  const visible = new Set(visibleIds);
  let changed = false;
  const kept = new Set<string>();
  for (const id of selection.ids) {
    if (visible.has(id)) kept.add(id);
    else changed = true;
  }
  return changed ? { workspaceId: selection.workspaceId, ids: kept } : selection;
}

export function toggleFileSelected(selection: FileSelection, id: string, selected?: boolean): FileSelection {
  const next = new Set(selection.ids);
  const on = selected ?? !next.has(id);
  if (on) next.add(id); else next.delete(id);
  return { workspaceId: selection.workspaceId, ids: next };
}

export type SelectionScope = "none" | "some" | "all";

/** How much of what is shown is ticked: drives the "select all shown" box (checked / mixed / empty). */
export function selectionScope(selection: FileSelection, visibleIds: readonly string[]): SelectionScope {
  if (visibleIds.length === 0) return "none";
  let ticked = 0;
  for (const id of visibleIds) if (selection.ids.has(id)) ticked += 1;
  if (ticked === 0) return "none";
  return ticked === visibleIds.length ? "all" : "some";
}

/** "Select all shown": ticks every visible row, or clears them all when every one was already ticked. */
export function toggleAllShown(selection: FileSelection, visibleIds: readonly string[]): FileSelection {
  const next = new Set(selection.ids);
  if (selectionScope(selection, visibleIds) === "all") {
    for (const id of visibleIds) next.delete(id);
  } else {
    for (const id of visibleIds) next.add(id);
  }
  return { workspaceId: selection.workspaceId, ids: next };
}

/** The rows a bulk action runs on: ticked AND shown, in the order shown. */
export function selectedRows<T extends { id: string }>(selection: FileSelection, visible: readonly T[]): T[] {
  return visible.filter(row => selection.ids.has(row.id));
}

// ---------------------------------------------------------------------------
// Bulk actions that have no batch callable (library trash / restore / delete):
// one call per file, in order, each answer kept. Nothing is reported done that
// did not answer ok.

export type BulkRowOutcome = { id: string; label: string; ok: boolean; message?: string };
export type BulkOutcome = { requested: number; succeeded: number; failed: BulkRowOutcome[] };

export async function runBulkSequentially<T extends { id: string }>(
  rows: readonly T[],
  label: (row: T) => string,
  action: (row: T) => Promise<unknown>,
  fallbackMessage = "Could not be completed."
): Promise<BulkOutcome> {
  const failed: BulkRowOutcome[] = [];
  let succeeded = 0;
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    try {
      await action(row);
      succeeded += 1;
    } catch (failure) {
      const message = failure instanceof Error && failure.message ? failure.message : fallbackMessage;
      failed.push({ id: row.id, label: label(row), ok: false, message });
    }
  }
  return { requested: seen.size, succeeded, failed };
}

// ---------------------------------------------------------------------------
// Dropping files from the desktop.

type DataTransferLike = {
  types?: ArrayLike<string> | readonly string[] | null;
  files?: ArrayLike<File> | null;
  items?: ArrayLike<{ kind: string; webkitGetAsEntry?: () => { isDirectory?: boolean } | null }> | null;
};

/** A drag that carries files from outside the page (not text, not a row being moved). */
export function dragCarriesFiles(transfer: DataTransferLike | null | undefined): boolean {
  if (!transfer || !transfer.types) return false;
  return Array.from(transfer.types as ArrayLike<string>).includes("Files");
}

/**
 * The files of a drop. Folders are left out (the browser hands a folder over as
 * a zero-byte "file" that cannot be read); the count of what was left out comes
 * back so the screen can say so rather than swallow it.
 */
export function filesFromDrop(transfer: DataTransferLike | null | undefined): { files: File[]; skippedFolders: number } {
  if (!transfer || !transfer.files) return { files: [], skippedFolders: 0 };
  const files = Array.from(transfer.files as ArrayLike<File>);
  const items = transfer.items ? Array.from(transfer.items) : [];
  const fileItems = items.filter(item => item.kind === "file");
  if (fileItems.length !== files.length) return { files, skippedFolders: 0 };
  const out: File[] = [];
  let skippedFolders = 0;
  files.forEach((file, index) => {
    const entry = fileItems[index]?.webkitGetAsEntry?.() ?? null;
    if (entry && entry.isDirectory) skippedFolders += 1;
    else out.push(file);
  });
  return { files: out, skippedFolders };
}

/** The upload checks a pick and a drop share. A message to show, or null when the batch may be queued. */
export function uploadBatchRefusal(params: {
  canUpload: boolean;
  orderId: string;
  orderExists: boolean;
  files: readonly { size: number }[];
  maxSizeMB: number;
  policyAllows: boolean;
}): string | null {
  if (!params.canUpload) return "Client Files upload is available to editable Pro and Team workspace members.";
  if (!params.orderId) return "Choose an order before uploading.";
  if (!params.orderExists) return "That order is no longer in this workspace. Choose the order again.";
  if (params.files.length === 0) return "Choose a file to upload.";
  if (!params.policyAllows) return "Accept the upload policy in this browser before uploading.";
  const limit = params.maxSizeMB * 1024 * 1024;
  if (params.files.some(file => file.size > limit)) {
    return `This file is larger than the ${params.maxSizeMB} MB workspace upload limit.`;
  }
  return null;
}
