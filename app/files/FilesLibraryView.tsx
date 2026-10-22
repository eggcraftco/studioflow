"use client";

// The central library's screen: left rail of views, the file list, and a
// right-hand record panel. Everything here manipulates LINKS and metadata —
// the bytes stay wherever their feature put them.

import { type DragEvent as ReactDragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { studioT } from "@/lib/studioflow/language";
import {
  addLibraryFileVersion,
  deleteLibraryFile,
  indexWorkspaceFilesIntoLibrary,
  libraryFileUrl,
  linkLibraryFile,
  listLibraryFiles,
  renameLibraryFile,
  restoreLibraryFile,
  setLibraryFileActiveVersion,
  shareLibraryFileWithOrder,
  trashLibraryFile,
  unlinkLibraryFile,
  uploadLibraryFile,
  type LibraryFile,
  type LibraryLinkKind
} from "@/lib/studioflow/filesLibrary";
import { loadWorkspaceOrderOptions, type OrderOptionItem, type WorkspaceContext } from "@/lib/studioflow/firestore";
import { openSharedFile } from "@/lib/studioflow/fileMask";
import { UploadQueuePanel } from "@/components/UploadQueuePanel";
import { useUploadQueue } from "@/lib/studioflow/useUploadQueue";
import {
  dragCarriesFiles,
  emptyFileSelection,
  filesFromDrop,
  pruneFileSelection,
  runBulkSequentially,
  selectedRows,
  selectionForWorkspace,
  selectionScope,
  toggleAllShown,
  toggleFileSelected,
  type BulkRowOutcome,
  type FileSelection
} from "@/lib/studioflow/fileSelection";

export type LibraryView =
  | "all" | "recent" | "sharedClients" | "internalOnly" | "unlinked"
  | "connOrders" | "connInventory" | "connPurchases" | "connSuppliers" | "connBank"
  | "trash";

const KIND_LABEL: Record<string, string> = {
  order: "Order",
  inventoryItem: "Inventory Item",
  purchase: "Purchase",
  bankTransaction: "Bank Transaction",
  supplier: "Supplier"
};

const SOURCE_LABEL: Record<string, string> = {
  clientFile: "Client file",
  inventoryPhoto: "Inventory photo",
  bankReceipt: "Bank receipt",
  library: "Library upload"
};

function sizeLabel(bytes: number) {
  if (!bytes) return "—";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export function FilesLibraryView({
  workspace,
  view,
  canEdit,
  canDelete
}: {
  workspace: WorkspaceContext;
  view: LibraryView;
  canEdit: boolean;
  // Trash and permanent delete follow the per-member deleteClientFiles access,
  // the same gate the classic client-files delete honors.
  canDelete: boolean;
}) {
  const { language, user } = useAuth();
  const t = useCallback((text: string) => studioT(text, language), [language]);

  const [files, setFiles] = useState<LibraryFile[] | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");

  // A slow early response must not clobber the result of a later action:
  // only the newest in-flight reload may write.
  const reloadSeq = useRef(0);
  const reload = useCallback(async () => {
    const seq = ++reloadSeq.current;
    try {
      const result = await listLibraryFiles(workspace, { trashed: view === "trash" });
      if (seq === reloadSeq.current) setFiles(result.files ?? []);
    } catch (failure) {
      if (seq !== reloadSeq.current) return;
      setFiles([]);
      setNotice(failure instanceof Error ? t(failure.message) : t("The file library could not be loaded."));
    }
  }, [workspace, view, t]);

  useEffect(() => {
    setFiles(null);
    setSelectedId("");
    setNotice("");
    void reload();
  }, [reload]);

  // The rename editor belongs to exactly one record; switching records or
  // closing the panel discards it rather than carrying the draft over.
  useEffect(() => {
    setRenaming(false);
    setRenameDraft("");
  }, [selectedId]);

  const visible = useMemo(() => {
    if (!files) return [];
    const needle = search.trim().toLowerCase();
    let list = files;
    if (view === "sharedClients") list = list.filter(file => file.clientPortalVisible);
    if (view === "internalOnly") list = list.filter(file => !file.clientPortalVisible);
    if (view === "unlinked") list = list.filter(file => file.links.length === 0);
    if (view === "connOrders") list = list.filter(file => file.linkKinds.includes("order"));
    if (view === "connInventory") list = list.filter(file => file.linkKinds.includes("inventoryItem"));
    if (view === "connPurchases") list = list.filter(file => file.linkKinds.includes("purchase"));
    if (view === "connSuppliers") list = list.filter(file => file.linkKinds.includes("supplier"));
    if (view === "connBank") list = list.filter(file => file.linkKinds.includes("bankTransaction"));
    if (needle) {
      list = list.filter(file =>
        [file.displayName, file.fileName, ...file.links.map(link => link.label)]
          .filter(Boolean)
          .some(field => String(field).toLowerCase().includes(needle)));
    }
    // Recent trims last so a search covers the whole library, not just the
    // newest twenty-five.
    if (view === "recent") list = list.slice(0, 25);
    return list;
  }, [files, view, search]);

  const selected = useMemo(
    () => (files ?? []).find(file => file.id === selectedId) ?? null,
    [files, selectedId]
  );

  // GN-01 (22 Oct 2026): ticking several records. Separate from `selectedId`
  // (the one record open in the side panel). Pruned to the rows this view and
  // search show; another workspace starts empty (lib/studioflow/fileSelection.ts).
  const [ticked, setTicked] = useState<FileSelection>(() => emptyFileSelection(workspace.id));
  const [bulkFailures, setBulkFailures] = useState<BulkRowOutcome[]>([]);
  const [dropActive, setDropActive] = useState(false);
  const visibleIds = useMemo(() => visible.map(file => file.id), [visible]);
  useEffect(() => {
    setTicked(previous => pruneFileSelection(selectionForWorkspace(previous, workspace.id), visibleIds));
  }, [visibleIds, workspace.id]);
  // Another view is another scope: the last run's failure list belongs to the old one.
  useEffect(() => {
    setBulkFailures([]);
  }, [view]);
  const tickedRows = selectedRows(ticked, visible);
  const tickScope = selectionScope(ticked, visibleIds);
  const inTrash = view === "trash";
  const canTickRows = canEdit && (inTrash || canDelete);

  async function runBulk(kind: "trash" | "restore" | "delete") {
    const rows = tickedRows;
    if (rows.length === 0 || busy) return;
    const count = String(rows.length);
    if (kind === "trash") {
      const linked = rows.filter(file => file.links.length > 1).length;
      const question = t("Move {count} files to trash? They are hidden everywhere until restored.").replace("{count}", count) +
        (linked > 0 ? "\n" + t("{linked} of them are linked to more than one record.").replace("{linked}", String(linked)) : "");
      if (!window.confirm(question)) return;
    }
    if (kind === "delete" && !window.confirm(
      t("Delete {count} file records permanently? Files uploaded through the library are also removed from storage; indexed files keep their original storage.").replace("{count}", count)
    )) return;
    setBusy(true);
    setNotice("");
    setBulkFailures([]);
    try {
      const outcome = await runBulkSequentially(
        rows,
        file => file.displayName || file.fileName,
        file => kind === "trash"
          ? trashLibraryFile(workspace, file.id)
          : kind === "restore"
            ? restoreLibraryFile(workspace, file.id)
            : deleteLibraryFile(workspace, file.id),
        "Could not be completed."
      );
      setBulkFailures(outcome.failed);
      const doneText = kind === "trash"
        ? t("Moved {count} files to trash.")
        : kind === "restore"
          ? t("Restored {count} files.")
          : t("Deleted {count} files.");
      setNotice(outcome.failed.length > 0
        ? `${outcome.succeeded > 0 ? doneText.replace("{count}", String(outcome.succeeded)) + " " : ""}${t("{failed} of {total} files could not be changed.").replace("{failed}", String(outcome.failed.length)).replace("{total}", String(outcome.requested))}`
        : doneText.replace("{count}", String(outcome.succeeded)));
      // The rows that failed stay ticked so they can be tried again.
      const failedIds = new Set(outcome.failed.map(row => row.id));
      setTicked(previous => ({ workspaceId: previous.workspaceId, ids: new Set([...previous.ids].filter(id => failedIds.has(id))) }));
      if (selectedId && !failedIds.has(selectedId) && rows.some(file => file.id === selectedId)) setSelectedId("");
      await reload();
    } finally {
      setBusy(false);
    }
  }

  function dropProps() {
    if (!canEdit || inTrash) return {};
    return {
      "data-drop-active": dropActive ? "true" : undefined,
      onDragEnter: (event: ReactDragEvent) => {
        if (!dragCarriesFiles(event.dataTransfer)) return;
        event.preventDefault();
        setDropActive(true);
      },
      onDragOver: (event: ReactDragEvent) => {
        if (!dragCarriesFiles(event.dataTransfer)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      },
      onDragLeave: (event: ReactDragEvent) => {
        const next = event.relatedTarget as Node | null;
        if (next && (event.currentTarget as Node).contains(next)) return;
        setDropActive(false);
      },
      onDrop: (event: ReactDragEvent) => {
        if (!dragCarriesFiles(event.dataTransfer)) return;
        event.preventDefault();
        event.stopPropagation();
        setDropActive(false);
        const { files: dropped, skippedFolders } = filesFromDrop(event.dataTransfer);
        setNotice(skippedFolders > 0
          ? t("{count} folders were left out. Drop the files inside them instead.").replace("{count}", String(skippedFolders))
          : "");
        if (dropped.length > 0) uploads.enqueue(dropped, { kind: "new" });
      }
    };
  }

  // Library uploads and new versions go through the queue: measured progress
  // per file, cancel, and a retry that lands on the same storage path (so the
  // server's sha1(path) record is the same one). The list reloads after each.
  const uploads = useUploadQueue<{ kind: "new" } | { kind: "version"; fileId: string }>(
    async (file, slot, hooks, context) => {
      if (context.kind === "new") {
        await uploadLibraryFile(workspace, file, { slot, progress: hooks });
      } else {
        await addLibraryFileVersion(workspace, context.fileId, file, "", { slot, progress: hooks });
      }
      await reload();
    }
  );

  async function run(action: () => Promise<unknown>, failText: string) {
    setBusy(true);
    setNotice("");
    try {
      await action();
      await reload();
    } catch (failure) {
      setNotice(failure instanceof Error ? t(failure.message) : t(failText));
    } finally {
      setBusy(false);
    }
  }

  async function openFile(file: LibraryFile) {
    try {
      const url = await libraryFileUrl(file.storagePath);
      // Masked viewer: the tab shows the workspace's branded host (or
      // nivadesk.app), never the raw firebasestorage address.
      await openSharedFile(url, workspace.clientPortalHost);
    } catch {
      setNotice(t("This file's storage area is not accessible to your account."));
    }
  }

  return (
    <div className={selected ? "library-body has-panel" : "library-body"}>
      <div className="card library-list files-drop-zone" style={{ padding: 18 }} {...dropProps()}>
        <div className="library-toolbar">
          <input
            className="input"
            placeholder={t("Search files and links…")}
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
          {canEdit ? (
            <>
              <label className="button secondary" style={{ cursor: "pointer" }}>
                {t("Upload to library")}
                <input
                  type="file"
                  multiple
                  style={{ display: "none" }}
                  disabled={busy}
                  onChange={event => {
                    const files = Array.from(event.target.files ?? []);
                    event.target.value = "";
                    if (files.length === 0) return;
                    setNotice("");
                    uploads.enqueue(files, { kind: "new" });
                  }}
                />
              </label>
              <button
                className="button secondary"
                type="button"
                disabled={busy}
                title={t("Scans existing client files, inventory photos and bank receipts into the library. Running it again never duplicates.")}
                onClick={() => void run(() => indexWorkspaceFilesIntoLibrary(workspace), "Existing files could not be indexed.")}
              >
                {t("Index existing files")}
              </button>
            </>
          ) : null}
        </div>

        {canEdit && !inTrash ? (
          <p className="muted-copy files-drop-hint" style={{ margin: "0 0 10px" }}>
            {t("Drop several files here to add them to the library.")}
          </p>
        ) : null}
        {notice ? <p className="inventory-notice">{t(notice)}</p> : null}
        {canTickRows && (tickedRows.length > 0 || bulkFailures.length > 0) ? (
          <div className="files-selection-bar" role="region" aria-label={t("Selected files")} aria-live="polite">
            <div className="files-selection-bar-row">
              <strong>{t("{count} selected").replace("{count}", String(tickedRows.length))}</strong>
              <span className="muted-copy files-selection-scope">
                {search.trim()
                  ? t("Only files shown by the current search are included.")
                  : t("Only files in this view are included.")}
              </span>
              <span style={{ flex: 1 }} />
              {inTrash ? (
                <>
                  <button className="button secondary" type="button" disabled={busy || tickedRows.length === 0} onClick={() => void runBulk("restore")}>
                    {t("Restore selected")}
                  </button>
                  {canDelete ? (
                    <button
                      className="button"
                      type="button"
                      style={{ background: "var(--danger)", borderColor: "var(--danger)" }}
                      disabled={busy || tickedRows.length === 0}
                      onClick={() => void runBulk("delete")}
                    >
                      {t("Delete selected permanently")}
                    </button>
                  ) : null}
                </>
              ) : (
                <button
                  className="button"
                  type="button"
                  style={{ background: "var(--danger)", borderColor: "var(--danger)" }}
                  disabled={busy || tickedRows.length === 0}
                  onClick={() => void runBulk("trash")}
                >
                  {t("Move selected to trash")}
                </button>
              )}
              <button
                className="button secondary"
                type="button"
                disabled={busy}
                onClick={() => { setTicked(emptyFileSelection(workspace.id)); setBulkFailures([]); }}
              >
                {t("Clear selection")}
              </button>
            </div>
            {bulkFailures.length > 0 ? (
              <ul className="files-selection-failures">
                {bulkFailures.map(row => (
                  <li key={row.id}>
                    <strong>{row.label}</strong>{" — "}{row.message ? t(row.message) : t("Could not be completed.")}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        <UploadQueuePanel
          items={uploads.items}
          onCancel={uploads.cancel}
          onRetry={uploads.retry}
          onRemove={uploads.remove}
          onClearFinished={uploads.clearFinished}
        />

        {files === null ? (
          <p className="inventory-sub">{t("Loading…")}</p>
        ) : visible.length === 0 ? (
          <p className="inventory-sub">
            {view === "trash"
              ? t("Trash is empty.")
              : files.length === 0
                ? t("The library is empty. Index existing files to bring in everything the workspace already stores.")
                : t("No files match this view.")}
          </p>
        ) : (
          <table className="inventory-table library-table">
            <thead>
              <tr>
                {canTickRows ? (
                  <th className="library-tick">
                    <input
                      type="checkbox"
                      aria-label={(search.trim()
                        ? t("Select all {count} files matching the search")
                        : t("Select all {count} files in this view")).replace("{count}", String(visibleIds.length))}
                      title={(search.trim()
                        ? t("Select all {count} files matching the search")
                        : t("Select all {count} files in this view")).replace("{count}", String(visibleIds.length))}
                      checked={tickScope === "all"}
                      ref={element => { if (element) element.indeterminate = tickScope === "some"; }}
                      disabled={busy}
                      onChange={() => setTicked(previous => toggleAllShown(previous, visibleIds))}
                    />
                  </th>
                ) : null}
                <th>{t("File")}</th>
                <th>{t("Links")}</th>
                <th>{t("Visibility")}</th>
                <th className="r">{t("Size")}</th>
                <th>{t("Updated")}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(file => (
                <tr
                  key={file.id}
                  className={selectedId === file.id ? "is-selected" : undefined}
                  onClick={() => setSelectedId(current => current === file.id ? "" : file.id)}
                >
                  {canTickRows ? (
                    <td className="library-tick" onClick={event => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={t("Select {name}").replace("{name}", file.displayName || file.fileName)}
                        checked={ticked.ids.has(file.id)}
                        disabled={busy}
                        onChange={event => {
                          const on = event.target.checked;
                          setTicked(previous => toggleFileSelected(previous, file.id, on));
                        }}
                      />
                    </td>
                  ) : null}
                  <td>
                    <strong>{file.displayName}</strong>
                    <span className="inventory-sub">{SOURCE_LABEL[file.source] ? t(SOURCE_LABEL[file.source]) : file.source}{file.versions.length > 1 ? ` · v${file.activeVersionIndex + 1}/${file.versions.length}` : ""}</span>
                  </td>
                  <td>
                    {file.links.length === 0
                      ? <span className="inventory-sub">{t("Unlinked")}</span>
                      : <span className="inventory-sub">{file.links.map(link => t(KIND_LABEL[link.kind] ?? link.kind)).join(", ")}</span>}
                  </td>
                  <td>
                    {file.clientPortalVisible
                      ? <span className="inventory-status is-incoming">{t("Client portal")}</span>
                      : <span className="inventory-status is-archived">{t("Internal")}</span>}
                  </td>
                  <td className="r">{sizeLabel(file.fileSize)}</td>
                  <td className="inventory-sub">{file.updatedAtMs ? new Date(file.updatedAtMs).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected ? (
        <aside className="inventory-panel" aria-label={t("File details")}>
          <div className="inventory-panel-head">
            <div>
              {renaming ? (
                <span className="inventory-panel-inline-edit">
                  <input className="input" value={renameDraft} onChange={event => setRenameDraft(event.target.value)} />
                  <button
                    type="button"
                    className="inventory-link"
                    disabled={busy}
                    onClick={() => void run(async () => {
                      await renameLibraryFile(workspace, selected.id, renameDraft.trim() || selected.fileName);
                      setRenaming(false);
                    }, "The file could not be renamed.")}
                  >
                    {t("Save")}
                  </button>
                  <button type="button" className="inventory-link" disabled={busy} onClick={() => setRenaming(false)}>
                    {t("Cancel")}
                  </button>
                </span>
              ) : (
                <h2>{selected.displayName}</h2>
              )}
              <span className="inventory-sub">{selected.fileName} · {sizeLabel(selected.fileSize)}</span>
            </div>
            <button type="button" className="inventory-modal-close" onClick={() => setSelectedId("")} aria-label={t("Close")}>×</button>
          </div>

          <section className="inventory-panel-card">
            <header><strong>{t("Linked Records")}</strong></header>
            {selected.links.length === 0 ? (
              <p className="inventory-sub">{t("Not linked to any record yet.")}</p>
            ) : (
              <ul className="inventory-panel-list">
                {selected.links.map(link => (
                  <li key={`${link.kind}:${link.id}`}>
                    <strong>{t(KIND_LABEL[link.kind] ?? link.kind)}</strong>
                    {" "}{link.label || link.id.slice(0, 10)}
                    {link.kind === "order" && link.audience === "portal" ? (
                      <span className="inventory-status is-incoming">{t("Client portal")}</span>
                    ) : null}
                    {canEdit && !selected.trashedAtMs ? (
                      <button
                        type="button"
                        className="inventory-link"
                        disabled={busy}
                        title={t("Removes only this connection. The file itself stays in the library.")}
                        onClick={() => void run(
                          () => unlinkLibraryFile(workspace, selected.id, link.kind as LibraryLinkKind, link.id),
                          "The link could not be removed."
                        )}
                      >
                        {t("Remove link")}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {canEdit && !selected.trashedAtMs ? (
            <section className="inventory-panel-card">
              <header><strong>{t("Actions")}</strong></header>
              <div className="inventory-panel-actions">
                <button type="button" className="inventory-secondary" disabled={busy} onClick={() => void openFile(selected)}>
                  {t("Open / Download")}
                </button>
                <button type="button" className="inventory-secondary" disabled={busy} onClick={() => { setRenameDraft(selected.displayName); setRenaming(true); }}>
                  {t("Rename")}
                </button>
                <button type="button" className="inventory-secondary" disabled={busy} onClick={() => setShareOpen(true)}>
                  {t("Share with Order")}
                </button>
                <button type="button" className="inventory-secondary" disabled={busy} onClick={() => setLinkOpen(true)}>
                  {t("Add link")}
                </button>
                <label className="inventory-secondary" style={{ cursor: "pointer", textAlign: "left" }}>
                  {t("Replace / new version")}
                  <input
                    type="file"
                    style={{ display: "none" }}
                    disabled={busy}
                    onChange={event => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (!file) return;
                      setNotice("");
                      uploads.enqueue([file], { kind: "version", fileId: selected.id });
                    }}
                  />
                </label>
                {canDelete ? (
                  <button
                    type="button"
                    className="inventory-secondary"
                    disabled={busy}
                    onClick={() => {
                      if (selected.links.length > 1 && !window.confirm(
                        `${t("This file is linked to")} ${selected.links.length} ${t("records. Moving it to trash hides it everywhere. Continue?")}`
                      )) return;
                      void run(() => trashLibraryFile(workspace, selected.id), "The file could not be moved to trash.");
                    }}
                  >
                    {t("Move to trash")}
                  </button>
                ) : null}
              </div>
            </section>
          ) : null}

          {selected.trashedAtMs && canEdit ? (
            <section className="inventory-panel-card">
              <header><strong>{t("Trash")}</strong></header>
              <div className="inventory-panel-actions">
                <button type="button" className="inventory-secondary" disabled={busy} onClick={() => void run(() => restoreLibraryFile(workspace, selected.id), "The file could not be restored.")}>
                  {t("Restore")}
                </button>
                {canDelete ? (
                  <button
                    type="button"
                    className="inventory-secondary"
                    disabled={busy}
                    onClick={() => {
                      if (!window.confirm(t("Delete this file record permanently? Files uploaded through the library are also removed from storage; indexed files keep their original storage."))) return;
                      void run(async () => {
                        await deleteLibraryFile(workspace, selected.id);
                        setSelectedId("");
                      }, "The file could not be deleted.");
                    }}
                  >
                    {t("Delete permanently")}
                  </button>
                ) : null}
              </div>
            </section>
          ) : null}

          {selected.versions.length > 1 ? (
            <section className="inventory-panel-card">
              <header><strong>{t("Versions")}</strong></header>
              <ul className="inventory-panel-list">
                {selected.versions.map((version, index) => (
                  <li key={index}>
                    <strong>v{index + 1}</strong> {version.fileName}
                    <span className="inventory-sub">{new Date(version.uploadedAtMs).toLocaleDateString()}{version.note ? ` · ${version.note}` : ""}</span>
                    {index === selected.activeVersionIndex ? (
                      <span className="inventory-status is-available">{t("Active")}</span>
                    ) : canEdit && !selected.trashedAtMs ? (
                      <button type="button" className="inventory-link" disabled={busy}
                        onClick={() => void run(() => setLibraryFileActiveVersion(workspace, selected.id, index), "The version could not be selected.")}>
                        {t("Make active")}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="inventory-panel-card">
            <header><strong>{t("Activity")}</strong></header>
            {selected.activity.length === 0 ? (
              <p className="inventory-sub">{t("No activity recorded yet.")}</p>
            ) : (
              <ul className="inventory-panel-list inventory-panel-history">
                {selected.activity.slice(0, 10).map((entry, index) => (
                  <li key={index}>
                    <strong>{t(entry.action)}</strong>{entry.detail ? ` · ${entry.detail}` : ""}
                    <span className="inventory-sub">{new Date(entry.atMs).toLocaleString()}{entry.byEmail ? ` · ${entry.byEmail}` : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {shareOpen ? (
            <ShareWithOrderModal
              workspace={workspace}
              uid={user?.uid || ""}
              fileName={selected.displayName}
              onClose={() => setShareOpen(false)}
              onShare={async (orderId, visibility, displayName) => {
                setShareOpen(false);
                await run(
                  () => shareLibraryFileWithOrder(workspace, selected.id, orderId, visibility, displayName),
                  "The file could not be shared."
                );
              }}
            />
          ) : null}

          {linkOpen ? (
            <AddLinkModal
              workspace={workspace}
              uid={user?.uid || ""}
              onClose={() => setLinkOpen(false)}
              onLink={async (kind, id, label) => {
                setLinkOpen(false);
                await run(() => linkLibraryFile(workspace, selected.id, kind, id, label), "The link could not be added.");
              }}
            />
          ) : null}
        </aside>
      ) : null}
    </div>
  );
}

// The report's §22 flow, verbatim: pick the order, pick the audience, rename
// what the client sees if needed. No copies are made anywhere.
function ShareWithOrderModal({
  workspace,
  uid,
  fileName,
  onClose,
  onShare
}: {
  workspace: WorkspaceContext;
  uid: string;
  fileName: string;
  onClose: () => void;
  onShare: (orderId: string, visibility: "team" | "portal" | "internal", displayName: string) => Promise<void>;
}) {
  const { language } = useAuth();
  const t = useCallback((text: string) => studioT(text, language), [language]);
  const [orders, setOrders] = useState<OrderOptionItem[] | null>(null);
  const [orderId, setOrderId] = useState("");
  const [visibility, setVisibility] = useState<"team" | "portal" | "internal">("team");
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    let cancelled = false;
    loadWorkspaceOrderOptions(workspace.id, workspace, uid)
      .then(list => { if (!cancelled) setOrders(list); })
      .catch(() => { if (!cancelled) setOrders([]); });
    return () => { cancelled = true; };
  }, [workspace, uid]);

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal inventory-modal is-narrow" role="dialog" aria-modal="true" aria-label={t("Share with Order")}>
        <div className="inventory-modal-head">
          <h2>{t("Share with Order")}</h2>
          <button type="button" className="inventory-modal-close" onClick={onClose} aria-label={t("Close")}>×</button>
        </div>
        <p className="inventory-sub">{fileName}</p>
        <label className="inventory-field is-wide">
          <span>{t("Order")}</span>
          <select className="input" value={orderId} onChange={event => setOrderId(event.target.value)}>
            <option value="">{orders === null ? t("Loading…") : t("Choose an order…")}</option>
            {(orders ?? []).map(order => (
              <option key={order.id} value={order.id}>{order.customerName} — {order.designName}</option>
            ))}
          </select>
        </label>
        <label className="inventory-field is-wide">
          <span>{t("Visibility")}</span>
          <select className="input" value={visibility} onChange={event => setVisibility(event.target.value as "team" | "portal" | "internal")}>
            <option value="team">{t("Order team only")}</option>
            <option value="portal">{t("Client portal visible")}</option>
            <option value="internal">{t("Internal only")}</option>
          </select>
        </label>
        <label className="inventory-field is-wide">
          <span>{t("Name shown to the client (optional)")}</span>
          <input className="input" value={displayName} onChange={event => setDisplayName(event.target.value)} maxLength={160} />
        </label>
        <p className="inventory-sub">{t("Sharing creates a link, never a copy. Removing the share later removes only the link.")}</p>
        <div className="inventory-modal-actions">
          <button type="button" onClick={onClose}>{t("Cancel")}</button>
          <button type="button" className="inventory-primary" disabled={!orderId} onClick={() => void onShare(orderId, visibility, displayName.trim())}>
            {t("Share")}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddLinkModal({
  workspace,
  uid,
  onClose,
  onLink
}: {
  workspace: WorkspaceContext;
  uid: string;
  onClose: () => void;
  onLink: (kind: LibraryLinkKind, id: string, label: string) => Promise<void>;
}) {
  const { language } = useAuth();
  const t = useCallback((text: string) => studioT(text, language), [language]);
  const [kind, setKind] = useState<LibraryLinkKind>("order");
  const [orders, setOrders] = useState<OrderOptionItem[] | null>(null);
  const [targetId, setTargetId] = useState("");

  useEffect(() => {
    if (kind !== "order") return;
    let cancelled = false;
    loadWorkspaceOrderOptions(workspace.id, workspace, uid)
      .then(list => { if (!cancelled) setOrders(list); })
      .catch(() => { if (!cancelled) setOrders([]); });
    return () => { cancelled = true; };
  }, [workspace, uid, kind]);

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal inventory-modal is-narrow" role="dialog" aria-modal="true" aria-label={t("Add link")}>
        <div className="inventory-modal-head">
          <h2>{t("Add link")}</h2>
          <button type="button" className="inventory-modal-close" onClick={onClose} aria-label={t("Close")}>×</button>
        </div>
        <label className="inventory-field is-wide">
          <span>{t("Record type")}</span>
          <select className="input" value={kind} onChange={event => { setKind(event.target.value as LibraryLinkKind); setTargetId(""); }}>
            <option value="order">{t("Order")}</option>
            <option value="inventoryItem">{t("Inventory Item")}</option>
            <option value="purchase">{t("Purchase")}</option>
            <option value="bankTransaction">{t("Bank Transaction")}</option>
            <option value="supplier">{t("Supplier")}</option>
          </select>
        </label>
        {kind === "order" ? (
          <label className="inventory-field is-wide">
            <span>{t("Order")}</span>
            <select className="input" value={targetId} onChange={event => setTargetId(event.target.value)}>
              <option value="">{orders === null ? t("Loading…") : t("Choose an order…")}</option>
              {(orders ?? []).map(order => (
                <option key={order.id} value={order.id}>{order.customerName} — {order.designName}</option>
              ))}
            </select>
          </label>
        ) : (
          <label className="inventory-field is-wide">
            <span>{t("Record ID")}</span>
            <input className="input" value={targetId} onChange={event => setTargetId(event.target.value)} placeholder={t("Paste the record's ID")} />
          </label>
        )}
        <div className="inventory-modal-actions">
          <button type="button" onClick={onClose}>{t("Cancel")}</button>
          <button type="button" className="inventory-primary" disabled={!targetId.trim()} onClick={() => void onLink(kind, targetId.trim(), "")}>
            {t("Add link")}
          </button>
        </div>
      </div>
    </div>
  );
}
