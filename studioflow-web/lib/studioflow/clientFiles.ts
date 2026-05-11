import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, functions, storage } from "@/lib/firebase/client";
import { requireWorkspacePlanAction } from "@/lib/studioflow/planActions";
import { normalizeWorkspaceRole, type ClientFileDetail, type WorkspaceContext } from "@/lib/studioflow/firestore";
import { withWebSyncStatus } from "@/lib/studioflow/syncStatus";

const ALLOWED_CLIENT_FILE_EXTENSIONS = new Set(["pdf", "jpg", "jpeg", "png", "heic", "heif", "webp", "psd", "psb"]);

export const CLIENT_FILE_ACCEPT = [
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".heic",
  ".heif",
  ".webp",
  ".psd",
  ".psb"
].join(",");

export function clientFileSizeLabel(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "Unknown size";
  if (bytes === 0) return "0 B";
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export function clientFileTypeLabel(file: Pick<ClientFileDetail, "contentType" | "fileName">) {
  if (file.contentType) return file.contentType;
  const extension = file.fileName.split(".").pop();
  return extension && extension !== file.fileName ? extension.toUpperCase() : "File";
}

export function isClientFileImage(file: Pick<ClientFileDetail, "contentType" | "fileName">) {
  const lowerName = file.fileName.toLowerCase();
  if (lowerName.endsWith(".psd") || lowerName.endsWith(".psb") || lowerName.endsWith(".pdf")) return false;
  return file.contentType.toLowerCase().startsWith("image/")
    || [".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp"].some(extension => lowerName.endsWith(extension));
}

export function canManageClientFilesForRole(role: string) {
  const normalized = normalizeWorkspaceRole(role);
  return normalized === "owner" || normalized === "admin" || normalized === "member" || normalized === "workflow";
}

type UploadUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
};

type UploadedClientFile = ClientFileDetail & {
  uploadedByUid: string;
  uploadedBy: string;
  source: "web";
};

export type ClientFileActionResult = {
  ok?: boolean;
  message?: string;
  fileName?: string;
  oldFileName?: string;
  storageDeleted?: boolean;
  storageCleanupError?: string;
  [key: string]: unknown;
};

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function extensionForFile(file: File) {
  const name = file.name.trim();
  const extension = name.includes(".") ? name.split(".").pop()?.toLowerCase() ?? "" : "";
  if (!ALLOWED_CLIENT_FILE_EXTENSIONS.has(extension)) {
    throw new Error("Choose a PDF, JPG, JPEG, PNG, HEIC, HEIF, WEBP, PSD or PSB file.");
  }
  return extension;
}

function contentTypeForFile(file: File, extension: string) {
  if (extension === "pdf") return "application/pdf";
  if (extension === "psd") return "image/vnd.adobe.photoshop";
  if (extension === "psb") return "application/octet-stream";
  if (file.type) return file.type;
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "heic") return "image/heic";
  if (extension === "heif") return "image/heif";
  if (extension === "webp") return "image/webp";
  return "application/octet-stream";
}

function safeOrderId(orderId: string) {
  return orderId.replaceAll("/", "_");
}

function newFileId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function callableError(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Client Files action failed. Please try again.";
}

async function callClientFileFunction(name: string, payload: Record<string, unknown>) {
  try {
    return await withWebSyncStatus(async () => {
      const callable = httpsCallable<Record<string, unknown>, ClientFileActionResult>(functions, name);
      const response = await callable(payload);
      if (response.data?.ok === false) {
        throw new Error(response.data.message || "Client Files action was not allowed.");
      }
      return response.data;
    }, "Saving Client Files changes to cloud.");
  } catch (error) {
    throw new Error(callableError(error));
  }
}

async function requireOrderInWorkspace(workspace: WorkspaceContext, orderId: string) {
  const orderRef = doc(db, "siparisler", orderId);
  const snapshot = await getDoc(orderRef);
  if (!snapshot.exists()) {
    throw new Error("Order not found.");
  }
  const companyId = stringValue(snapshot.data().companyId, workspace.id);
  if (companyId !== workspace.id) {
    throw new Error("This order does not belong to the active workspace.");
  }
  return orderRef;
}

export async function uploadClientFileForOrder({
  workspace,
  orderId,
  file,
  user,
  uploadSafety
}: {
  workspace: WorkspaceContext;
  orderId: string;
  file: File;
  user: UploadUser;
  uploadSafety?: {
    policyAccepted: boolean;
    maxSizeMB: number;
  };
}): Promise<UploadedClientFile> {
  if (!workspace.entitlements.features.client_files) {
    throw new Error("Client Files upload is available on Pro Monthly and Team Monthly plans.");
  }

  await requireOrderInWorkspace(workspace, orderId);
  const extension = extensionForFile(file);
  const contentType = contentTypeForFile(file, extension);

  await requireWorkspacePlanAction(workspace.id, "upload_client_file", {
    fileSizeBytes: file.size,
    orderId
  });

  const fileId = newFileId();
  const storedFileName = `${fileId}.${extension}`;
  const storageRef = ref(storage, `companies/${workspace.id}/client_files/${safeOrderId(orderId)}/${storedFileName}`);
  const uploadedAt = new Date();
  const uploadedByEmail = user.email ?? "";
  const uploadedBy = uploadedByEmail || user.displayName || user.uid;

  return withWebSyncStatus(async () => {
    await uploadBytes(storageRef, file, {
      contentType,
      customMetadata: {
        companyId: workspace.id,
        uploadedByUid: user.uid,
        uploadedByEmail: uploadedByEmail || "unknown",
        uploadedBy,
        originalFileName: file.name,
        source: "web",
        orderId,
        uploadedAt: uploadedAt.toISOString(),
        fileType: contentType,
        fileSize: String(file.size),
        storagePath: storageRef.fullPath,
        policyAccepted: uploadSafety ? String(uploadSafety.policyAccepted) : "",
        maxSizeMB: uploadSafety ? String(uploadSafety.maxSizeMB) : "",
        uploadPolicyAccepted: uploadSafety ? String(uploadSafety.policyAccepted) : "",
        uploadMaxSizeMB: uploadSafety ? String(uploadSafety.maxSizeMB) : ""
      }
    });

    const downloadURL = await getDownloadURL(storageRef);
    const clientFile = {
      id: fileId,
      fileName: file.name.trim() || "Client file",
      downloadURL,
      storagePath: storageRef.fullPath,
      contentType,
      fileSize: file.size,
      uploadedByUid: user.uid,
      uploadedByEmail,
      uploadedBy,
      uploadedAt: uploadedAt.toISOString(),
      source: "web",
      note: "",
      isPendingUpload: false,
      localFilePath: "",
      pendingQueueId: ""
    };

    await callClientFileFunction("appendClientFile", {
      companyId: workspace.id,
      orderId,
      fileId,
      fileSizeBytes: file.size,
      clientFile
    });

    return {
      ...clientFile,
      uploadedAt,
      source: "web"
    };
  }, "Uploading client file to cloud.");
}

export async function renameClientFileForOrder({
  workspace,
  orderId,
  fileId,
  fileName
}: {
  workspace: WorkspaceContext;
  orderId: string;
  fileId: string;
  fileName: string;
}) {
  if (!workspace.entitlements.features.client_files) {
    throw new Error("Client Files management is available on Pro Monthly and Team Monthly plans.");
  }

  const cleanedFileName = fileName.trim();
  if (!cleanedFileName) {
    throw new Error("File name is required.");
  }

  return callClientFileFunction("renameClientFile", {
    companyId: workspace.id,
    orderId,
    fileId,
    fileName: cleanedFileName
  });
}

export async function deleteClientFileForOrder({
  workspace,
  orderId,
  fileId
}: {
  workspace: WorkspaceContext;
  orderId: string;
  fileId: string;
}) {
  if (!workspace.entitlements.features.client_files) {
    throw new Error("Client Files management is available on Pro Monthly and Team Monthly plans.");
  }

  return callClientFileFunction("deleteClientFile", {
    companyId: workspace.id,
    orderId,
    fileId
  });
}
