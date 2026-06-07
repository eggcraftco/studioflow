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
  const canUseClientFiles = Boolean(workspace?.entitlements.features.client_files);
  const canManageClientFiles = Boolean(workspace && canUseClientFiles && canManageClientFilesForRole(workspace.role));
  const canUploadClientFiles = canManageClientFiles;
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
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Filename</th>
                  <th>Type</th>
                  <th>Size</th>
                  <th>Uploaded</th>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Design</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {files.map(file => (
                  <tr key={file.id}>
                    <td style={{ fontWeight: 900 }}>{file.fileName}</td>
                    <td>{clientFileTypeLabel(file)}</td>
                    <td>{clientFileSizeLabel(file.fileSize)}</td>
                    <td>{formatDate(file.uploadedAt)}</td>
                    <td>
                      <Link href={`/orders/${file.orderId}`} style={{ fontWeight: 800 }}>
                        Open order
                      </Link>
                      <div style={{ marginTop: 6 }}>
                        <span className="pill">{file.orderStatus}</span>
                      </div>
                    </td>
                    <td>{file.customerName}</td>
                    <td>{file.designName}</td>
                    <td>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {canUseClientFiles ? (
                          file.downloadURL ? (
                            <a className="button secondary" href={file.downloadURL} target="_blank" rel="noreferrer">
                              Open / Download
                            </a>
                          ) : (
                            <span className="pill">No download URL</span>
                          )
                        ) : (
                          <span className="pill">Locked</span>
                        )}

                        {canManageClientFiles ? (
                          <>
                            <button className="button secondary" type="button" onClick={() => handleRename(file)} disabled={Boolean(actioningFileId)}>
                              {actioningFileId === file.id ? "Working..." : "Rename"}
                            </button>
                            <button
                              className="button secondary"
                              type="button"
                              onClick={() => handleDelete(file)}
                              disabled={Boolean(actioningFileId)}
                              style={{ color: "var(--danger)" }}
                            >
                              Delete
                            </button>
                          </>
                        ) : canUseClientFiles ? (
                          <span className="pill">Edit locked</span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}
