"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { CardTitle } from "@/components/CardTitle";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  CLIENT_FILE_ACCEPT,
  canManageClientFilesForRole,
  clientFileSizeLabel,
  clientFileTypeLabel,
  deleteClientFileForOrder,
  downloadClientFilesZip,
  isClientFileImage,
  renameClientFileForOrder,
  uploadClientFileForOrder
} from "@/lib/studioflow/clientFiles";
import {
  loadWorkspaceClientFiles,
  loadWorkspaceContext,
  loadWorkspaceOrderOptions,
  loadWorkspaceSettingsOverview,
  workspaceAccessAllows,
  type ClientFileListItem,
  type OrderOptionItem,
  type WorkspaceSettingsOverview,
  type WorkspaceContext
} from "@/lib/studioflow/firestore";

function formatDate(date: Date | null) {
  if (!date) return "-";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function orderOptionLabel(order: OrderOptionItem) {
  return `${order.customerName} - ${order.designName}`;
}

function uploadSafetyAcceptanceKey(workspaceId: string) {
  return `studioflow-upload-policy-accepted:${workspaceId}`;
}

function isFilePdf(file: Pick<ClientFileListItem, "contentType" | "fileName">) {
  return (file.contentType || "").toLowerCase().includes("pdf") || file.fileName.toLowerCase().endsWith(".pdf");
}

function uploaderLabel(file: Pick<ClientFileListItem, "uploadedBy" | "uploadedByEmail">) {
  return (file.uploadedBy || "").trim() || (file.uploadedByEmail || "").trim();
}

function fileBadgeLabel(file: Pick<ClientFileListItem, "contentType" | "fileName">) {
  if (isFilePdf(file)) return "PDF";
  if (isClientFileImage(file)) return "IMG";
  const ext = file.fileName.split(".").pop();
  return ext && ext !== file.fileName ? ext.toUpperCase().slice(0, 4) : "FILE";
}

type FilesByOrder = {
  orderId: string;
  customerName: string;
  designName: string;
  orderStatus: string;
  files: ClientFileListItem[];
};

function groupFilesByOrder(files: ClientFileListItem[]): FilesByOrder[] {
  const groups = new Map<string, FilesByOrder>();
  for (const file of files) {
    let group = groups.get(file.orderId);
    if (!group) {
      group = {
        orderId: file.orderId,
        customerName: file.customerName,
        designName: file.designName,
        orderStatus: file.orderStatus,
        files: []
      };
      groups.set(file.orderId, group);
    }
    group.files.push(file);
  }
  return Array.from(groups.values());
}

function FilesPreviewModal({
  files,
  activeFile,
  onClose,
  onSelect
}: {
  files: ClientFileListItem[];
  activeFile: ClientFileListItem;
  onClose: () => void;
  onSelect: (fileId: string) => void;
}) {
  const currentIndex = Math.max(0, files.findIndex(file => file.id === activeFile.id));
  const isImage = isClientFileImage(activeFile);
  const isPdf = isFilePdf(activeFile);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && currentIndex > 0) onSelect(files[currentIndex - 1].id);
      if (event.key === "ArrowRight" && currentIndex < files.length - 1) onSelect(files[currentIndex + 1].id);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentIndex, files, onClose, onSelect]);

  return (
    <div className="modal-backdrop client-file-preview-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="client-file-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Client file preview"
        onMouseDown={event => event.stopPropagation()}
      >
        <header className="client-file-preview-header">
          <div>
            <h2>{activeFile.fileName}</h2>
            <p>
              {currentIndex + 1} / {files.length} · {clientFileSizeLabel(activeFile.fileSize)}
              {uploaderLabel(activeFile) ? ` · Added by ${uploaderLabel(activeFile)}` : ""}
            </p>
          </div>
          <button className="workspace-blocks-close" type="button" onClick={onClose} aria-label="Close file preview">
            ×
          </button>
        </header>

        <div className="client-file-preview-stage">
          {isImage ? (
            <img src={activeFile.downloadURL} alt={activeFile.fileName} />
          ) : isPdf ? (
            <iframe src={activeFile.downloadURL} title={activeFile.fileName} />
          ) : (
            <div className="client-file-preview-unavailable">
              <span>{fileBadgeLabel(activeFile)}</span>
              <strong>Preview is not available for this file type.</strong>
              <p>Use Open / Download to view this file in another app.</p>
            </div>
          )}
        </div>

        <footer className="client-file-preview-actions">
          <button
            className="button secondary"
            type="button"
            disabled={currentIndex <= 0}
            onClick={() => onSelect(files[currentIndex - 1].id)}
          >
            Previous
          </button>
          {activeFile.downloadURL ? (
            <a className="button secondary" href={activeFile.downloadURL} target="_blank" rel="noreferrer">
              Open / Download
            </a>
          ) : null}
          <button
            className="button secondary"
            type="button"
            disabled={currentIndex >= files.length - 1}
            onClick={() => onSelect(files[currentIndex + 1].id)}
          >
            Next
          </button>
        </footer>
      </section>
    </div>
  );
}

export default function FilesPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [workspace, setWorkspace] = useState<WorkspaceContext | null>(null);
  const [uploadSafetySettings, setUploadSafetySettings] = useState<WorkspaceSettingsOverview | null>(null);
  const [browserAcceptedUploadPolicy, setBrowserAcceptedUploadPolicy] = useState(false);
  const [files, setFiles] = useState<ClientFileListItem[]>([]);
  const [orders, setOrders] = useState<OrderOptionItem[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actioningFileId, setActioningFileId] = useState<string | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [previewingFileId, setPreviewingFileId] = useState<string | null>(null);
  const [downloadingOrderId, setDownloadingOrderId] = useState<string | null>(null);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);

  async function handleDownloadAll() {
    if (!workspace || downloadingAll) return;
    setActionError(null);
    setActionStatus(null);
    setDownloadingAll(true);
    try {
      await downloadClientFilesZip({ workspaceId: workspace.id, scope: "workspace" });
      setActionStatus("Download started.");
    } catch (downloadError) {
      setActionError(downloadError instanceof Error ? downloadError.message : "Could not download files.");
    } finally {
      setDownloadingAll(false);
    }
  }

  async function handleDownloadOrderGroup(orderId: string) {
    if (!workspace || downloadingOrderId) return;
    setActionError(null);
    setActionStatus(null);
    setDownloadingOrderId(orderId);
    try {
      await downloadClientFilesZip({ workspaceId: workspace.id, scope: "order", orderId });
      setActionStatus("Download started.");
    } catch (downloadError) {
      setActionError(downloadError instanceof Error ? downloadError.message : "Could not download files.");
    } finally {
      setDownloadingOrderId(null);
    }
  }

  async function handleDeleteOrderGroup(group: FilesByOrder) {
    if (!workspace || deletingOrderId) return;
    setActionError(null);
    setActionStatus(null);
    if (!canManageClientFiles) {
      setActionError("Client Files delete is available to editable Pro and Team workspace members.");
      return;
    }
    const label = group.customerName || "this order";
    const confirmed = window.confirm(
      `Delete all ${group.files.length} file${group.files.length === 1 ? "" : "s"} for ${label}? This cannot be undone.`
    );
    if (!confirmed) return;

    setDeletingOrderId(group.orderId);
    setActionStatus(`Deleting ${group.files.length} file${group.files.length === 1 ? "" : "s"}...`);
    let failures = 0;
    for (const file of group.files) {
      try {
        await deleteClientFileForOrder({ workspace, orderId: file.orderId, fileId: file.fileId });
      } catch {
        failures += 1;
      }
    }
    try {
      await refreshFiles(workspace);
    } catch {
      /* refresh best-effort */
    }
    setDeletingOrderId(null);
    if (failures > 0) {
      setActionStatus(null);
      setActionError(`${failures} file${failures === 1 ? "" : "s"} could not be deleted. Please try again.`);
    } else {
      setActionStatus(`Deleted all files for ${label}.`);
    }
  }

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, router, user]);

  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    let cancelled = false;

    async function run() {
      setLoadingFiles(true);
      setError(null);
      try {
        const loadedWorkspace = await loadWorkspaceContext(uid);
        if (cancelled) return;
        if (!workspaceAccessAllows(loadedWorkspace.memberAccess, "clientFiles")) {
          router.replace("/orders");
          return;
        }
        setWorkspace(loadedWorkspace);

        const [loadedFiles, loadedOrders, loadedUploadSafetySettings] = await Promise.all([
          loadWorkspaceClientFiles(loadedWorkspace.id, loadedWorkspace.entitlements.features.client_files, loadedWorkspace, uid),
          loadWorkspaceOrderOptions(loadedWorkspace.id, loadedWorkspace, uid),
          loadWorkspaceSettingsOverview(loadedWorkspace.id)
        ]);
        if (cancelled) return;
        setFiles(loadedFiles);
        setOrders(loadedOrders);
        setUploadSafetySettings(loadedUploadSafetySettings);
        setBrowserAcceptedUploadPolicy(window.localStorage.getItem(uploadSafetyAcceptanceKey(loadedWorkspace.id)) === "accepted");
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Could not load client files.");
        }
      } finally {
        if (!cancelled) setLoadingFiles(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const totalSize = useMemo(() => files.reduce((sum, file) => sum + Math.max(file.fileSize, 0), 0), [files]);
  const groupedFiles = useMemo(() => groupFilesByOrder(files), [files]);
  const canUseClientFiles = Boolean(workspace?.entitlements.features.client_files);
  const previewFiles = useMemo(
    () => files.filter(file => canUseClientFiles && Boolean(file.downloadURL)),
    [files, canUseClientFiles]
  );
  const activePreview = previewingFileId
    ? previewFiles.find(file => file.id === previewingFileId) ?? null
    : null;
  const canManageClientFiles = Boolean(workspace && canUseClientFiles && canManageClientFilesForRole(workspace.role));
  const canUploadClientFiles = canManageClientFiles;
  const canDeleteClientFiles = Boolean(canManageClientFiles && workspace?.memberAccess?.deleteClientFiles !== false);
  const maxUploadSizeMB = Math.min(Math.max(Math.round(uploadSafetySettings?.uploadSafetyMaxFileSizeMB ?? 10), 1), 50);
  const requireUploadPolicyAcceptance = uploadSafetySettings?.uploadSafetyRequirePolicyAcceptance ?? true;

  function updateBrowserUploadPolicyAccepted(accepted: boolean) {
    if (!workspace) return;
    setBrowserAcceptedUploadPolicy(accepted);
    const key = uploadSafetyAcceptanceKey(workspace.id);
    if (accepted) window.localStorage.setItem(key, "accepted");
    else window.localStorage.removeItem(key);
  }

  async function refreshFiles(currentWorkspace: WorkspaceContext) {
    if (!user) return;
    const uid = user.uid;
    const [loadedFiles, loadedOrders] = await Promise.all([
      loadWorkspaceClientFiles(currentWorkspace.id, currentWorkspace.entitlements.features.client_files, currentWorkspace, uid),
      loadWorkspaceOrderOptions(currentWorkspace.id, currentWorkspace, uid)
    ]);
    setFiles(loadedFiles);
    setOrders(loadedOrders);
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace || !user) return;
    setUploadError(null);
    setUploadStatus(null);

    if (!canUploadClientFiles) {
      setUploadError("Client Files upload is available to editable Pro and Team workspace members.");
      return;
    }
    if (!selectedOrderId) {
      setUploadError("Choose an order before uploading.");
      return;
    }
    if (!selectedFile) {
      setUploadError("Choose a file to upload.");
      return;
    }
    if (requireUploadPolicyAcceptance && !browserAcceptedUploadPolicy) {
      setUploadError("Accept the upload policy in this browser before uploading.");
      return;
    }
    if (selectedFile.size > maxUploadSizeMB * 1024 * 1024) {
      setUploadError(`This file is larger than the ${maxUploadSizeMB} MB workspace upload limit.`);
      return;
    }

    setUploading(true);
    setUploadStatus("Checking plan and uploading...");
    try {
      await uploadClientFileForOrder({
        workspace,
        orderId: selectedOrderId,
        file: selectedFile,
        user,
        uploadSafety: {
          policyAccepted: !requireUploadPolicyAcceptance || browserAcceptedUploadPolicy,
          maxSizeMB: maxUploadSizeMB
        }
      });
      setUploadStatus(`Uploaded ${selectedFile.name}.`);
      setSelectedFile(null);
      setSelectedOrderId("");
      setFileInputKey(value => value + 1);
      await refreshFiles(workspace);
    } catch (uploadFailure) {
      setUploadStatus(null);
      setUploadError(uploadFailure instanceof Error ? uploadFailure.message : "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleRename(file: ClientFileListItem) {
    if (!workspace) return;
    setActionError(null);
    setActionStatus(null);

    if (!canManageClientFiles) {
      setActionError("Client Files rename is available to editable Pro and Team workspace members.");
      return;
    }

    const nextName = window.prompt("Rename client file", file.fileName)?.trim();
    if (!nextName || nextName === file.fileName) return;

    setActioningFileId(file.id);
    setActionStatus("Renaming file...");
    try {
      await renameClientFileForOrder({
        workspace,
        orderId: file.orderId,
        fileId: file.fileId,
        fileName: nextName
      });
      await refreshFiles(workspace);
      setActionStatus(`Renamed ${nextName}.`);
    } catch (renameFailure) {
      setActionStatus(null);
      setActionError(renameFailure instanceof Error ? renameFailure.message : "Rename failed. Please try again.");
    } finally {
      setActioningFileId(null);
    }
  }

  async function handleDelete(file: ClientFileListItem) {
    if (!workspace) return;
    setActionError(null);
    setActionStatus(null);

    if (!canManageClientFiles) {
      setActionError("Client Files delete is available to editable Pro and Team workspace members.");
      return;
    }

    const confirmed = window.confirm(`Delete "${file.fileName}" from this order? This cannot be undone.`);
    if (!confirmed) return;

    setActioningFileId(file.id);
    setActionStatus("Deleting file...");
    try {
      const result = await deleteClientFileForOrder({
        workspace,
        orderId: file.orderId,
        fileId: file.fileId
      });
      await refreshFiles(workspace);
      setActionStatus(result.storageCleanupError
        ? "File metadata was removed. Storage cleanup could not complete automatically."
        : `Deleted ${file.fileName}.`
      );
    } catch (deleteFailure) {
      setActionStatus(null);
      setActionError(deleteFailure instanceof Error ? deleteFailure.message : "Delete failed. Please try again.");
    } finally {
      setActioningFileId(null);
    }
  }

  if (loading || !user) return <LoadingScreen />;

  return (
    <AppShell>
      {loadingFiles ? <LoadingScreen /> : null}

      <section className="card" style={{ padding: 24, marginBottom: 18 }}>
        <div className="pill">Read-only file index</div>
        <h1 style={{ fontSize: 34, lineHeight: 1.05, margin: "14px 0 8px" }}>Client Files</h1>
        <p style={{ color: "var(--muted)", margin: 0 }}>
          {workspace ? `${workspace.name} - ${workspace.billingPlanName}` : "Loading workspace..."}
        </p>
      </section>

      {error ? (
        <section className="card" style={{ padding: 22, marginBottom: 18 }}>
          <CardTitle icon="lock" eyebrow="File error" title="Could not load client files" />
          <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p>
        </section>
      ) : null}

      {workspace && !canUseClientFiles ? (
        <section className="card locked-panel" style={{ padding: 22, marginBottom: 18 }}>
          <CardTitle icon="lock" eyebrow="Locked" title="Open and download require Pro or Team" />
          <p style={{ color: "var(--muted)", margin: 0 }}>
            File metadata is listed for reference, but full Client Files cloud access stays locked on Free Demo and NivaDesk Lite. Data export remains available separately.
          </p>
        </section>
      ) : null}

      {workspace && canUseClientFiles ? (
        <section className="card" style={{ padding: 22, marginBottom: 18 }}>
          <CardTitle icon="files" eyebrow="Upload" title="Add a client file" />

          {canUploadClientFiles ? (
            <>
              <div className="upload-safety-panel">
                <span className="studio-pill">Max {maxUploadSizeMB} MB</span>
                <span className="studio-pill">PDF, image, PSD, PSB</span>
                {requireUploadPolicyAcceptance ? (
                  <label className="upload-safety-check">
                    <input
                      type="checkbox"
                      checked={browserAcceptedUploadPolicy}
                      onChange={event => updateBrowserUploadPolicyAccepted(event.target.checked)}
                      disabled={uploading}
                    />
                    <span>I understand and accept the upload policy for this browser.</span>
                  </label>
                ) : null}
              </div>

              <form onSubmit={handleUpload} className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", alignItems: "end" }}>
                <label style={{ display: "grid", gap: 8, fontWeight: 800 }}>
                  Order
                  <select
                    className="input"
                    value={selectedOrderId}
                    onChange={event => {
                      setSelectedOrderId(event.target.value);
                      setUploadError(null);
                      setUploadStatus(null);
                    }}
                    disabled={uploading}
                  >
                    <option value="">Choose order</option>
                    {orders.map(order => (
                      <option key={order.id} value={order.id}>{orderOptionLabel(order)}</option>
                    ))}
                  </select>
                </label>

                <label style={{ display: "grid", gap: 8, fontWeight: 800 }}>
                  File
                  <input
                    key={fileInputKey}
                    className="input"
                    type="file"
                    accept={CLIENT_FILE_ACCEPT}
                    onChange={event => {
                      setSelectedFile(event.target.files?.[0] ?? null);
                      setUploadError(null);
                      setUploadStatus(null);
                    }}
                    disabled={uploading}
                  />
                </label>

                <button
                  className="button"
                  type="submit"
                  disabled={uploading || !selectedOrderId || !selectedFile || orders.length === 0 || (requireUploadPolicyAcceptance && !browserAcceptedUploadPolicy)}
                >
                  {uploading ? "Uploading..." : "Upload"}
                </button>
              </form>
            </>
          ) : (
            <p style={{ color: "var(--muted)", margin: 0 }}>
              Your current role can view Client Files but cannot upload new files.
            </p>
          )}

          {uploadStatus ? <p style={{ color: "var(--muted)", margin: "14px 0 0", fontWeight: 800 }}>{uploadStatus}</p> : null}
          {uploadError ? <p style={{ color: "var(--danger)", margin: "14px 0 0", fontWeight: 800 }}>{uploadError}</p> : null}
        </section>
      ) : null}

      <section className="card" style={{ padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
          <div>
            <CardTitle icon="files" eyebrow={`${files.length} files`} title="Workspace client files" />
            <p style={{ color: "var(--muted)", margin: 0 }}>
              Total listed size: {clientFileSizeLabel(totalSize)}
            </p>
            {actionStatus ? <p style={{ color: "var(--muted)", margin: "10px 0 0", fontWeight: 800 }}>{actionStatus}</p> : null}
            {actionError ? <p style={{ color: "var(--danger)", margin: "10px 0 0", fontWeight: 800 }}>{actionError}</p> : null}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {canUseClientFiles && files.length > 0 ? (
              <button className="button" onClick={handleDownloadAll} disabled={downloadingAll}>
                {downloadingAll ? "Preparing…" : "Download all (ZIP)"}
              </button>
            ) : null}
            <Link className="button secondary" href="/orders">Open orders</Link>
          </div>
        </div>

        {files.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>No client files found for this workspace yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            {groupedFiles.map(group => (
              <div key={group.orderId}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    flexWrap: "wrap",
                    paddingBottom: 8,
                    marginBottom: 10,
                    borderBottom: "1px solid var(--border, rgba(0,0,0,0.08))"
                  }}
                >
                  <Link href={`/orders/${group.orderId}`} style={{ fontWeight: 900, fontSize: 14 }}>
                    {group.customerName || "Order"}{group.designName ? ` · ${group.designName}` : ""}
                  </Link>
                  {group.orderStatus ? <span className="pill">{group.orderStatus}</span> : null}
                  <span style={{ color: "var(--muted)", fontSize: 12, fontWeight: 700 }}>
                    {group.files.length} file{group.files.length === 1 ? "" : "s"}
                  </span>
                  <span style={{ flex: 1 }} />
                  {canUseClientFiles ? (
                    <button
                      className="button secondary"
                      type="button"
                      style={{ padding: "4px 10px", fontSize: 12 }}
                      disabled={downloadingOrderId === group.orderId}
                      onClick={() => handleDownloadOrderGroup(group.orderId)}
                    >
                      {downloadingOrderId === group.orderId ? "Preparing…" : "⬇ ZIP"}
                    </button>
                  ) : null}
                  {canDeleteClientFiles ? (
                    <button
                      className="button secondary"
                      type="button"
                      style={{ padding: "4px 10px", fontSize: 12, color: "var(--danger)" }}
                      disabled={deletingOrderId === group.orderId}
                      onClick={() => handleDeleteOrderGroup(group)}
                    >
                      {deletingOrderId === group.orderId ? "Deleting…" : "Delete all"}
                    </button>
                  ) : null}
                </div>
                <div className="app-client-files-list compact-list-grid is-static">
                  {group.files.map(file => {
                    const canOpenPreview = canUseClientFiles && Boolean(file.downloadURL);
                    const showThumb = canUseClientFiles && Boolean(file.downloadURL) && isClientFileImage(file);
                    return (
                      <article key={file.id} className="client-file-list-row">
                        <button
                          className="client-file-preview-trigger"
                          type="button"
                          disabled={!canOpenPreview}
                          onClick={() => setPreviewingFileId(file.id)}
                          title={canOpenPreview ? "Preview file" : "Preview is locked for this plan."}
                        >
                          {showThumb ? (
                            <img src={file.downloadURL} alt={file.fileName} className="file-preview compact-file-preview" />
                          ) : (
                            <div className="file-token compact-file-preview">{fileBadgeLabel(file)}</div>
                          )}
                          <div className="client-file-main">
                            <strong>{file.fileName}</strong>
                            <p className="muted-copy">
                              {clientFileTypeLabel(file)} · {clientFileSizeLabel(file.fileSize)} · {formatDate(file.uploadedAt)}
                            </p>
                            {uploaderLabel(file) ? (
                              <p className="muted-copy">Added by {uploaderLabel(file)}</p>
                            ) : null}
                          </div>
                        </button>

                        <div className="client-file-icon-actions">
                          {canUseClientFiles ? (
                            file.downloadURL ? (
                              <a className="button secondary" href={file.downloadURL} target="_blank" rel="noreferrer">Open</a>
                            ) : (
                              <span className="pill">No URL</span>
                            )
                          ) : (
                            <span className="pill">Locked</span>
                          )}
                          {canManageClientFiles ? (
                            <>
                              <button className="button secondary" type="button" onClick={() => handleRename(file)} disabled={Boolean(actioningFileId)}>
                                {actioningFileId === file.id ? "..." : "Rename"}
                              </button>
                              {canDeleteClientFiles ? (
                                <button
                                  className="button secondary"
                                  type="button"
                                  onClick={() => handleDelete(file)}
                                  disabled={Boolean(actioningFileId)}
                                  style={{ color: "var(--danger)" }}
                                >
                                  Delete
                                </button>
                              ) : null}
                            </>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {activePreview ? (
        <FilesPreviewModal
          files={previewFiles}
          activeFile={activePreview}
          onClose={() => setPreviewingFileId(null)}
          onSelect={setPreviewingFileId}
        />
      ) : null}
    </AppShell>
  );
}
