"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { CardTitle } from "@/components/CardTitle";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useQuickActionParam } from "@/lib/studioflow/quickActions";
import { studioLocaleTag, studioT } from "@/lib/studioflow/language";
import { studioCountLabel } from "@/lib/studioflow/countLabel";
import {
  CLIENT_FILE_ACCEPT,
  canManageClientFilesForRole,
  clientFileSizeLabel,
  clientFileTypeLabel,
  deleteClientFileForOrder,
  deleteClientFilesBatchForOrders,
  downloadClientFilesZip,
  isClientFileImage,
  renameClientFileForOrder,
  uploadClientFileForOrder,
  type ClientFileBatchDeleteRow
} from "@/lib/studioflow/clientFiles";
import {
  UPLOAD_POLICY_BUILTIN_SENTENCE,
  type UploadPolicyAcceptance,
  type UploadPolicyStamp,
  clearUploadPolicyAcceptance,
  readUploadPolicyAcceptance,
  uploadPolicyAllows,
  uploadPolicyStamp,
  uploadPolicyVersion,
  uploadPolicyWording,
  writeUploadPolicyAcceptance
} from "@/lib/studioflow/uploadPolicy";
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
import { pageAccessRedirectFor } from "@/lib/studioflow/pageAccess";
import { FilesLibraryView, type LibraryView } from "./FilesLibraryView";
import { maskFileUrl, openSharedFile } from "@/lib/studioflow/fileMask";
import { UploadQueuePanel } from "@/components/UploadQueuePanel";
import { useUploadQueue } from "@/lib/studioflow/useUploadQueue";

function formatDate(date: Date | null, language: string) {
  if (!date) return "-";
  return new Intl.DateTimeFormat(studioLocaleTag(language), { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function orderOptionLabel(order: OrderOptionItem) {
  return `${order.customerName} - ${order.designName}`;
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
  onSelect,
  brandedHost,
  t
}: {
  files: ClientFileListItem[];
  activeFile: ClientFileListItem;
  onClose: () => void;
  onSelect: (fileId: string) => void;
  brandedHost?: string;
  t: (text: string) => string;
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
        aria-label={t("Client file preview")}
        onMouseDown={event => event.stopPropagation()}
      >
        <header className="client-file-preview-header">
          <div>
            <h2>{activeFile.fileName}</h2>
            <p>
              {currentIndex + 1} / {files.length} · {clientFileSizeLabel(activeFile.fileSize)}
              {uploaderLabel(activeFile) ? ` · ${t("Added by {name}").replace("{name}", uploaderLabel(activeFile))}` : ""}
            </p>
          </div>
          <button className="workspace-blocks-close" type="button" onClick={onClose} aria-label={t("Close file preview")}>
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
              <strong>{t("Preview is not available for this file type.")}</strong>
              <p>{t("Use Open / Download to view this file in another app.")}</p>
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
            {t("Previous")}
          </button>
          {activeFile.downloadURL ? (
            <a
              className="button secondary"
              href={maskFileUrl(activeFile.downloadURL, brandedHost)}
              target="_blank"
              rel="noreferrer"
              onClick={event => { event.preventDefault(); void openSharedFile(activeFile.downloadURL, brandedHost); }}
            >
              {t("Open / Download")}
            </a>
          ) : null}
          <button
            className="button secondary"
            type="button"
            disabled={currentIndex >= files.length - 1}
            onClick={() => onSelect(files[currentIndex + 1].id)}
          >
            {t("Next")}
          </button>
        </footer>
      </section>
    </div>
  );
}

export default function FilesPage() {
  const router = useRouter();
  const { user, loading, language } = useAuth();
  const t = (text: string) => studioT(text, language);
  const [workspace, setWorkspace] = useState<WorkspaceContext | null>(null);
  const [uploadSafetySettings, setUploadSafetySettings] = useState<WorkspaceSettingsOverview | null>(null);
  // Acceptance is per workspace AND per policy version (lib/studioflow/uploadPolicy.ts).
  const [browserUploadPolicyAcceptance, setBrowserUploadPolicyAcceptance] = useState<UploadPolicyAcceptance | null>(null);
  const browserAcceptedUploadPolicy = browserUploadPolicyAcceptance !== null;
  const [files, setFiles] = useState<ClientFileListItem[]>([]);
  const [orders, setOrders] = useState<OrderOptionItem[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  // Arriving from Home's "Upload file" quick action. The upload form is always
  // on this page, so the action brings it into view and puts the cursor in it
  // rather than opening anything new.
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  useQuickActionParam("upload", Boolean(workspace), () => {
    uploadInputRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    uploadInputRef.current?.focus();
  });
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Uploads run through a queue, two at a time; each row shows the storage
  // task's own bytes, can be cancelled, and retries on the same file id and
  // path. The order each file belongs to is fixed when it is queued.
  const uploadQueue = useUploadQueue<{ orderId: string; policy: UploadPolicyStamp; maxSizeMB: number }>(
    async (file, slot, hooks, context) => {
      if (!workspace || !user) throw new Error("Sign in again before uploading a client file.");
      await uploadClientFileForOrder({
        workspace,
        orderId: context.orderId,
        file,
        user,
        slot,
        progress: hooks,
        uploadSafety: { policy: context.policy, maxSizeMB: context.maxSizeMB }
      });
      await refreshFiles(workspace);
    }
  );
  const uploading = uploadQueue.isActive;
  const [fileInputKey, setFileInputKey] = useState(0);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actioningFileId, setActioningFileId] = useState<string | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [previewingFileId, setPreviewingFileId] = useState<string | null>(null);
  const [downloadingOrderId, setDownloadingOrderId] = useState<string | null>(null);
  const [fileSearch, setFileSearch] = useState("");
  const [fileSort, setFileSort] = useState<"newest" | "name" | "size">("newest");
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  // "Delete selected" (owner request, 8 Oct 2026): rows are ticked one by one
  // (or a whole order at once) and go in one confirmed call to the server's
  // deleteClientFilesBatch; every refused row comes back by name. The ids are
  // the list rows' ids (orderId + fileId), so a refresh prunes what is gone.
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(() => new Set());
  const [deletingSelection, setDeletingSelection] = useState(false);
  const [selectionFailures, setSelectionFailures] = useState<ClientFileBatchDeleteRow[]>([]);
  // "classic" is the original per-order upload/browse experience; everything
  // else is a view over the central library registry.
  const [pageView, setPageView] = useState<LibraryView | "classic">("all");

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

  function toggleFileSelected(fileId: string, selected: boolean) {
    setSelectedFileIds(previous => {
      const next = new Set(previous);
      if (selected) next.add(fileId); else next.delete(fileId);
      return next;
    });
  }

  function toggleOrderSelected(group: FilesByOrder, selected: boolean) {
    setSelectedFileIds(previous => {
      const next = new Set(previous);
      for (const file of group.files) {
        if (selected) next.add(file.id); else next.delete(file.id);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelectedFileIds(new Set());
    setSelectionFailures([]);
  }

  async function handleDeleteSelection() {
    if (!workspace || deletingSelection || deletingOrderId) return;
    setActionError(null);
    setActionStatus(null);
    setSelectionFailures([]);
    if (!canDeleteClientFiles) {
      setActionError("Client Files delete is available to editable Pro and Team workspace members.");
      return;
    }
    const chosen = files.filter(file => selectedFileIds.has(file.id));
    if (chosen.length === 0) return;
    const confirmed = window.confirm(
      t("Delete {count} files? This cannot be undone.").replace("{count}", String(chosen.length))
    );
    if (!confirmed) return;

    setDeletingSelection(true);
    setActionStatus(t("Deleting {count} files…").replace("{count}", String(chosen.length)));
    try {
      const outcome = await deleteClientFilesBatchForOrders({
        workspace,
        items: chosen.map(file => ({ orderId: file.orderId, fileId: file.fileId }))
      });
      const failedRows = outcome.results.filter(row => !row.ok).map(row => {
        const match = chosen.find(file => file.orderId === row.orderId && file.fileId === row.fileId);
        return { ...row, fileName: row.fileName || match?.fileName || row.fileId };
      });
      setSelectionFailures(failedRows);
      // Keep only the rows that did not go, so the person can retry or clear.
      const failedIds = new Set(failedRows.map(row => chosen.find(file => file.orderId === row.orderId && file.fileId === row.fileId)?.id ?? ""));
      setSelectedFileIds(new Set([...selectedFileIds].filter(id => failedIds.has(id))));
      if (failedRows.length > 0) {
        setActionStatus(null);
        setActionError(
          t("{failed} of {total} files could not be deleted.")
            .replace("{failed}", String(failedRows.length))
            .replace("{total}", String(outcome.requested))
        );
      } else {
        setActionStatus(t("Deleted {count} files.").replace("{count}", String(outcome.deleted)));
      }
    } catch (deleteFailure) {
      setActionStatus(null);
      setActionError(deleteFailure instanceof Error ? deleteFailure.message : "Delete failed. Please try again.");
    } finally {
      try {
        await refreshFiles(workspace);
      } catch {
        /* refresh best-effort */
      }
      setDeletingSelection(false);
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
      t("Delete all {count} files for {name}? This cannot be undone.")
        .replace("{count}", String(group.files.length))
        .replace("{name}", label)
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
          router.replace(pageAccessRedirectFor("/files", loadedWorkspace.memberAccess));
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
  // Search and sort run before grouping, so a needle narrows every order's
  // group and the groups themselves stay in the chosen order.
  const filteredSortedFiles = useMemo(() => {
    const needle = fileSearch.trim().toLowerCase();
    const filtered = needle
      ? files.filter(file =>
          [file.fileName, file.customerName, file.designName]
            .filter(Boolean)
            .some(field => String(field).toLowerCase().includes(needle)))
      : files.slice();
    filtered.sort((a, b) => {
      if (fileSort === "name") return String(a.fileName).localeCompare(String(b.fileName));
      if (fileSort === "size") return (b.fileSize || 0) - (a.fileSize || 0);
      return (b.uploadedAt?.getTime() ?? 0) - (a.uploadedAt?.getTime() ?? 0);
    });
    return filtered;
  }, [files, fileSearch, fileSort]);

  const groupedFiles = useMemo(() => groupFilesByOrder(filteredSortedFiles), [filteredSortedFiles]);
  useEffect(() => {
    setSelectedFileIds(previous => {
      const present = new Set(files.map(file => file.id));
      const kept = [...previous].filter(id => present.has(id));
      return kept.length === previous.size ? previous : new Set(kept);
    });
  }, [files]);
  const selectedCount = selectedFileIds.size;
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
  const uploadPolicyVersionId = uploadPolicyVersion(uploadSafetySettings);
  const workspaceId = workspace?.id ?? "";

  // Read for this workspace and this version only; a changed policy unticks the box.
  useEffect(() => {
    if (!workspaceId) {
      setBrowserUploadPolicyAcceptance(null);
      return;
    }
    try {
      setBrowserUploadPolicyAcceptance(readUploadPolicyAcceptance(window.localStorage, workspaceId, uploadPolicyVersionId));
    } catch {
      setBrowserUploadPolicyAcceptance(null);
    }
  }, [workspaceId, uploadPolicyVersionId]);

  function updateBrowserUploadPolicyAccepted(accepted: boolean) {
    if (!workspace) return;
    setUploadError(null);
    try {
      if (accepted) {
        setBrowserUploadPolicyAcceptance(writeUploadPolicyAcceptance(window.localStorage, workspace.id, uploadPolicyVersionId));
      } else {
        clearUploadPolicyAcceptance(window.localStorage, workspace.id);
        setBrowserUploadPolicyAcceptance(null);
      }
    } catch {
      if (accepted) {
        setUploadError("This browser could not save the upload policy acceptance. Please try again.");
        setBrowserUploadPolicyAcceptance(null);
      }
    }
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

  function handleUpload(event: FormEvent<HTMLFormElement>) {
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
    if (selectedFiles.length === 0) {
      setUploadError("Choose a file to upload.");
      return;
    }
    if (!uploadPolicyAllows(requireUploadPolicyAcceptance, browserUploadPolicyAcceptance)) {
      setUploadError("Accept the upload policy in this browser before uploading.");
      return;
    }
    const tooLarge = selectedFiles.filter(file => file.size > maxUploadSizeMB * 1024 * 1024);
    if (tooLarge.length > 0) {
      setUploadError(`This file is larger than the ${maxUploadSizeMB} MB workspace upload limit.`);
      return;
    }

    uploadQueue.enqueue(selectedFiles, {
      orderId: selectedOrderId,
      policy: uploadPolicyStamp(requireUploadPolicyAcceptance, browserUploadPolicyAcceptance),
      maxSizeMB: maxUploadSizeMB
    });
    setSelectedFiles([]);
    setSelectedOrderId("");
    setFileInputKey(value => value + 1);
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

    const confirmed = window.confirm(
      t("Delete \"{name}\" from this order? This cannot be undone.").replace("{name}", file.fileName)
    );
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
        <div className="pill">{t("Every file in this workspace, linked to its records")}</div>
        <h1 style={{ fontSize: 34, lineHeight: 1.05, margin: "14px 0 8px" }}>{t("Files")}</h1>
        <p style={{ color: "var(--muted)", margin: 0 }}>
          {workspace ? `${workspace.name} - ${workspace.billingPlanName}` : t("Loading workspace...")}
        </p>
      </section>

      {error ? (
        <section className="card" style={{ padding: 22, marginBottom: 18 }}>
          <CardTitle icon="lock" eyebrow={t("File error")} title={t("Could not load client files")} />
          <p style={{ color: "var(--danger)", margin: 0 }}>{t(error)}</p>
        </section>
      ) : null}

      <div className="inventory-shell files-shell">
        <nav className="inventory-nav" aria-label={t("File views")}>
          <p className="inventory-nav-group">{t("Library")}</p>
          <button type="button" data-active={pageView === "all"} onClick={() => setPageView("all")}>{t("All Files")}</button>
          <button type="button" data-active={pageView === "recent"} onClick={() => setPageView("recent")}>{t("Recent")}</button>
          <button type="button" data-active={pageView === "sharedClients"} onClick={() => setPageView("sharedClients")}>{t("Shared with Clients")}</button>
          <button type="button" data-active={pageView === "internalOnly"} onClick={() => setPageView("internalOnly")}>{t("Internal Only")}</button>
          <button type="button" data-active={pageView === "unlinked"} onClick={() => setPageView("unlinked")}>{t("Unlinked")}</button>
          <p className="inventory-nav-group">{t("By Connection")}</p>
          <button type="button" data-active={pageView === "classic"} onClick={() => setPageView("classic")}>{t("Client & Orders")}</button>
          <button type="button" data-active={pageView === "connInventory"} onClick={() => setPageView("connInventory")}>{t("Inventory")}</button>
          <button type="button" data-active={pageView === "connPurchases"} onClick={() => setPageView("connPurchases")}>{t("Purchases")}</button>
          <button type="button" data-active={pageView === "connSuppliers"} onClick={() => setPageView("connSuppliers")}>{t("Suppliers")}</button>
          <button type="button" data-active={pageView === "connBank"} onClick={() => setPageView("connBank")}>{t("Bank Transactions")}</button>
          <p className="inventory-nav-group">{t("Manage")}</p>
          <button type="button" data-active={pageView === "trash"} onClick={() => setPageView("trash")}>{t("Trash")}</button>
        </nav>
        <div className="files-main">

      {pageView !== "classic" && workspace ? (
        <FilesLibraryView workspace={workspace} view={pageView} canEdit={canManageClientFiles} canDelete={canDeleteClientFiles} />
      ) : null}

      {pageView === "classic" ? (<>

      {workspace && !canUseClientFiles ? (
        <section className="card locked-panel" style={{ padding: 22, marginBottom: 18 }}>
          <CardTitle icon="lock" eyebrow={t("Locked")} title={t("Open and download require Pro or Team")} />
          <p style={{ color: "var(--muted)", margin: 0 }}>
            {t("File metadata is listed for reference, but full Client Files cloud access stays locked on Free and NivaDesk Starter. Data export remains available separately.")}
          </p>
        </section>
      ) : null}

      {workspace && canUseClientFiles ? (
        <section className="card" style={{ padding: 22, marginBottom: 18 }}>
          <CardTitle icon="files" eyebrow={t("Upload")} title={t("Add a client file")} />

          {canUploadClientFiles ? (
            <>
              <div className="upload-safety-panel">
                <span className="studio-pill">{t("Max {size} MB").replace("{size}", String(maxUploadSizeMB))}</span>
                <span className="studio-pill">{t("PDF, image, PSD, PSB, ZIP")}</span>
                {requireUploadPolicyAcceptance ? (
                  <>
                    {/* The workspace's own text, else the built-in sentence — the
                        box is never shown without the sentence it refers to. */}
                    <p className="muted-copy upload-safety-policy-text" style={{ flexBasis: "100%", margin: 0 }}>
                      {uploadPolicyWording(uploadSafetySettings?.uploadSafetyPolicyText, t(UPLOAD_POLICY_BUILTIN_SENTENCE))}
                    </p>
                    <label className="upload-safety-check">
                      <input
                        type="checkbox"
                        checked={browserAcceptedUploadPolicy}
                        onChange={event => updateBrowserUploadPolicyAccepted(event.target.checked)}
                        disabled={uploading}
                      />
                      <span>{t("I understand and accept the upload policy for this browser.")}</span>
                    </label>
                  </>
                ) : null}
              </div>

              <form onSubmit={handleUpload} className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", alignItems: "end" }}>
                <label style={{ display: "grid", gap: 8, fontWeight: 800 }}>
                  {t("Order")}
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
                    <option value="">{t("Choose order")}</option>
                    {orders.map(order => (
                      <option key={order.id} value={order.id}>{orderOptionLabel(order)}</option>
                    ))}
                  </select>
                </label>

                <label style={{ display: "grid", gap: 8, fontWeight: 800 }}>
                  {t("File")}
                  <input
                    ref={uploadInputRef}
                    key={fileInputKey}
                    className="input"
                    type="file"
                    accept={CLIENT_FILE_ACCEPT}
                    multiple
                    onChange={event => {
                      setSelectedFiles(Array.from(event.target.files ?? []));
                      setUploadError(null);
                      setUploadStatus(null);
                    }}
                    disabled={uploading}
                  />
                </label>

                <button
                  className="button"
                  type="submit"
                  disabled={uploading || !selectedOrderId || selectedFiles.length === 0 || orders.length === 0 || (requireUploadPolicyAcceptance && !browserAcceptedUploadPolicy)}
                >
                  {uploading ? t("Uploading...") : t("Upload")}
                </button>
              </form>
            </>
          ) : (
            <p style={{ color: "var(--muted)", margin: 0 }}>
              {t("Your current role can view Client Files but cannot upload new files.")}
            </p>
          )}

          {uploadStatus ? <p style={{ color: "var(--muted)", margin: "14px 0 0", fontWeight: 800 }}>{t(uploadStatus)}</p> : null}
          {uploadError ? <p style={{ color: "var(--danger)", margin: "14px 0 0", fontWeight: 800 }}>{t(uploadError)}</p> : null}
          <UploadQueuePanel
            items={uploadQueue.items}
            onCancel={uploadQueue.cancel}
            onRetry={uploadQueue.retry}
            onRemove={uploadQueue.remove}
            onClearFinished={uploadQueue.clearFinished}
          />
        </section>
      ) : null}

      <section className="card" style={{ padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
          <div>
            <CardTitle icon="files" eyebrow={studioCountLabel(files.length, "file", language)} title={t("Workspace client files")} />
            <p style={{ color: "var(--muted)", margin: 0 }}>
              {t("Total listed size: {size}").replace("{size}", clientFileSizeLabel(totalSize))}
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              <input
                className="input"
                style={{ maxWidth: 260 }}
                placeholder={t("Search files, customer, design…")}
                value={fileSearch}
                onChange={event => setFileSearch(event.target.value)}
              />
              <select className="input" style={{ maxWidth: 170 }} value={fileSort} onChange={event => setFileSort(event.target.value as "newest" | "name" | "size")}>
                <option value="newest">{t("Newest first")}</option>
                <option value="name">{t("Name A–Z")}</option>
                <option value="size">{t("Largest first")}</option>
              </select>
            </div>
            {actionStatus ? <p style={{ color: "var(--muted)", margin: "10px 0 0", fontWeight: 800 }}>{t(actionStatus)}</p> : null}
            {actionError ? <p style={{ color: "var(--danger)", margin: "10px 0 0", fontWeight: 800 }}>{t(actionError)}</p> : null}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {canUseClientFiles && files.length > 0 ? (
              <button className="button" onClick={handleDownloadAll} disabled={downloadingAll}>
                {downloadingAll ? t("Preparing…") : t("Download all (ZIP)")}
              </button>
            ) : null}
            <Link className="button secondary" href="/orders">{t("Open orders")}</Link>
          </div>
        </div>

        {canDeleteClientFiles && (selectedCount > 0 || selectionFailures.length > 0) ? (
          <div className="files-selection-bar" role="region" aria-label={t("Selected files")}>
            <div className="files-selection-bar-row">
              <strong>{t("{count} selected").replace("{count}", String(selectedCount))}</strong>
              <span style={{ flex: 1 }} />
              <button
                className="button"
                type="button"
                style={{ background: "var(--danger)", borderColor: "var(--danger)" }}
                disabled={deletingSelection || selectedCount === 0}
                onClick={handleDeleteSelection}
              >
                {deletingSelection ? t("Deleting…") : t("Delete selected")}
              </button>
              <button className="button secondary" type="button" disabled={deletingSelection} onClick={clearSelection}>
                {t("Clear selection")}
              </button>
            </div>
            {selectionFailures.length > 0 ? (
              <ul className="files-selection-failures">
                {selectionFailures.map(row => (
                  <li key={`${row.orderId}:${row.fileId}`}>
                    <strong>{row.fileName || row.fileId}</strong>
                    {" — "}
                    {row.message ? t(row.message) : t("Could not be deleted.")}
                    {row.reason ? <span className="muted-copy"> ({row.reason})</span> : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {files.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>{t("No client files found for this workspace yet.")}</p>
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
                    {group.customerName || t("Order")}{group.designName ? ` · ${group.designName}` : ""}
                  </Link>
                  {group.orderStatus ? <span className="pill">{group.orderStatus}</span> : null}
                  <span style={{ color: "var(--muted)", fontSize: 12, fontWeight: 700 }}>
                    {studioCountLabel(group.files.length, "file", language)}
                  </span>
                  {canDeleteClientFiles ? (() => {
                    const allSelected = group.files.every(file => selectedFileIds.has(file.id));
                    return (
                      <label className="files-select-order" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={allSelected}
                          disabled={deletingSelection}
                          onChange={event => toggleOrderSelected(group, event.target.checked)}
                          aria-label={t("Select all in this order")}
                        />
                        {t("Select all in this order")}
                      </label>
                    );
                  })() : null}
                  <span style={{ flex: 1 }} />
                  {canUseClientFiles ? (
                    <button
                      className="button secondary"
                      type="button"
                      style={{ padding: "4px 10px", fontSize: 12 }}
                      disabled={downloadingOrderId === group.orderId}
                      onClick={() => handleDownloadOrderGroup(group.orderId)}
                    >
                      {downloadingOrderId === group.orderId ? t("Preparing…") : "⬇ ZIP"}
                    </button>
                  ) : null}
                  {canDeleteClientFiles ? (
                    // Destructive, so it must not sit shoulder-to-shoulder with
                    // the ZIP button in the same visual weight (report §19):
                    // pushed apart, plain text, danger-colored.
                    <button
                      type="button"
                      style={{ marginLeft: 18, padding: "4px 6px", fontSize: 11.5, color: "var(--danger)", background: "transparent", border: "none", textDecoration: "underline", cursor: "pointer" }}
                      disabled={deletingOrderId === group.orderId}
                      onClick={() => handleDeleteOrderGroup(group)}
                    >
                      {deletingOrderId === group.orderId ? t("Deleting…") : t("Delete all")}
                    </button>
                  ) : null}
                </div>
                <div className="app-client-files-list compact-list-grid is-static">
                  {group.files.map(file => {
                    const canOpenPreview = canUseClientFiles && Boolean(file.downloadURL);
                    const showThumb = canUseClientFiles && Boolean(file.downloadURL) && isClientFileImage(file);
                    return (
                      <article key={file.id} className={selectedFileIds.has(file.id) ? "client-file-list-row is-selected" : "client-file-list-row"}>
                        {canDeleteClientFiles ? (
                          <label className="client-file-select">
                            <input
                              type="checkbox"
                              checked={selectedFileIds.has(file.id)}
                              disabled={deletingSelection}
                              onChange={event => toggleFileSelected(file.id, event.target.checked)}
                              aria-label={t("Select file")}
                            />
                          </label>
                        ) : null}
                        <button
                          className="client-file-preview-trigger"
                          type="button"
                          disabled={!canOpenPreview}
                          onClick={() => setPreviewingFileId(file.id)}
                          title={canOpenPreview ? t("Preview file") : t("Preview is locked for this plan.")}
                        >
                          {showThumb ? (
                            <img src={file.downloadURL} alt={file.fileName} className="file-preview compact-file-preview" />
                          ) : (
                            <div className="file-token compact-file-preview">{fileBadgeLabel(file)}</div>
                          )}
                          <div className="client-file-main">
                            <strong>{file.fileName}</strong>
                            <p className="muted-copy">
                              {clientFileTypeLabel(file)} · {clientFileSizeLabel(file.fileSize)} · {formatDate(file.uploadedAt, language)}
                            </p>
                            {uploaderLabel(file) ? (
                              <p className="muted-copy">{t("Added by {name}").replace("{name}", uploaderLabel(file))}</p>
                            ) : null}
                          </div>
                        </button>

                        <div className="client-file-icon-actions">
                          {canUseClientFiles ? (
                            file.downloadURL ? (
                              <a className="button secondary" href={maskFileUrl(file.downloadURL, workspace?.clientPortalHost)} target="_blank" rel="noreferrer" onClick={event => { event.preventDefault(); void openSharedFile(file.downloadURL, workspace?.clientPortalHost); }}>{t("Open")}</a>
                            ) : (
                              <span className="pill">{t("No URL")}</span>
                            )
                          ) : (
                            <span className="pill">{t("Locked")}</span>
                          )}
                          {canManageClientFiles ? (
                            <>
                              <button className="button secondary" type="button" onClick={() => handleRename(file)} disabled={Boolean(actioningFileId)}>
                                {actioningFileId === file.id ? "..." : t("Rename")}
                              </button>
                              {canDeleteClientFiles ? (
                                <button
                                  className="button secondary"
                                  type="button"
                                  onClick={() => handleDelete(file)}
                                  disabled={Boolean(actioningFileId)}
                                  style={{ color: "var(--danger)" }}
                                >
                                  {t("Delete")}
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

      </>) : null}

        </div>
      </div>

      {activePreview ? (
        <FilesPreviewModal
          t={t}
          brandedHost={workspace?.clientPortalHost}
          files={previewFiles}
          activeFile={activePreview}
          onClose={() => setPreviewingFileId(null)}
          onSelect={setPreviewingFileId}
        />
      ) : null}
    </AppShell>
  );
}
