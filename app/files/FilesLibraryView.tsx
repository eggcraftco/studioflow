"use client";

// The central library's screen: left rail of views, the file list, and a
// right-hand record panel. Everything here manipulates LINKS and metadata —
// the bytes stay wherever their feature put them.

import { useCallback, useEffect, useMemo, useState } from "react";
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
  canEdit
}: {
  workspace: WorkspaceContext;
  view: LibraryView;
  canEdit: boolean;
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

  const reload = useCallback(async () => {
    try {
      const result = await listLibraryFiles(workspace, { trashed: view === "trash" });
      setFiles(result.files ?? []);
    } catch (failure) {
      setFiles([]);
      setNotice(failure instanceof Error ? t(failure.message) : t("The file library could not be loaded."));
    }
  }, [workspace, view, t]);

  useEffect(() => {
    setFiles(null);
    setSelectedId("");
    void reload();
  }, [reload]);

  const visible = useMemo(() => {
    if (!files) return [];
    const needle = search.trim().toLowerCase();
    let list = files;
    if (view === "recent") list = list.slice(0, 25);
    if (view === "sharedClients") list = list.filter(file => file.clientPortalVisible);
    if (view === "internalOnly") list = list.filter(file => !file.clientPortalVisible);
    if (view === "unlinked") list = list.filter(file => file.links.length === 0);
    if (view === "connOrders") list = list.filter(file => file.linkKinds.includes("order"));
    if (view === "connInventory") list = list.filter(file => file.linkKinds.includes("inventoryItem"));
    if (view === "connPurchases") list = list.filter(file => file.linkKinds.includes("purchase"));
    if (view === "connSuppliers") list = list.filter(file => file.linkKinds.includes("supplier"));
    if (view === "connBank") list = list.filter(file => file.linkKinds.includes("bankTransaction"));
    if (!needle) return list;
    return list.filter(file =>
      [file.displayName, file.fileName, ...file.links.map(link => link.label)]
        .filter(Boolean)
        .some(field => String(field).toLowerCase().includes(needle)));
  }, [files, view, search]);

  const selected = useMemo(
    () => (files ?? []).find(file => file.id === selectedId) ?? null,
    [files, selectedId]
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
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setNotice(t("This file's storage area is not accessible to your account."));
    }
  }

  return (
    <div className={selected ? "library-body has-panel" : "library-body"}>
      <div className="card library-list" style={{ padding: 18 }}>
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
                  style={{ display: "none" }}
                  disabled={busy}
                  onChange={event => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    void run(() => uploadLibraryFile(workspace, file), "The file could not be registered.");
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

        {notice ? <p className="inventory-notice">{notice}</p> : null}

        {files === null ? (
          <p className="inventory-sub">{t("Loading…")}</p>
        ) : visible.length === 0 ? (
          <p className="inventory-sub">
            {files.length === 0
              ? t("The library is empty. Index existing files to bring in everything the workspace already stores.")
              : t("No files match this view.")}
          </p>
        ) : (
          <table className="inventory-table library-table">
            <thead>
              <tr>
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
                      void run(() => addLibraryFileVersion(workspace, selected.id, file), "The new version could not be saved.");
                    }}
                  />
                </label>
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
