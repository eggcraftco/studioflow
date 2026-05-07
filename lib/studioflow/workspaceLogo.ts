import { httpsCallable } from "firebase/functions";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { functions, storage } from "@/lib/firebase/client";
import { requireWorkspacePlanAction } from "@/lib/studioflow/planActions";
import { normalizeWorkspaceRole, type WorkspaceContext } from "@/lib/studioflow/firestore";
import { withWebSyncStatus } from "@/lib/studioflow/syncStatus";

const WORKSPACE_LOGO_EXTENSIONS = new Set(["jpg", "jpeg", "png", "heic", "heif", "webp"]);

export const WORKSPACE_LOGO_ACCEPT = ".jpg,.jpeg,.png,.heic,.heif,.webp";

type UploadUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
};

export type WorkspaceLogoResult = {
  ok?: boolean;
  message?: string;
  settings?: {
    appLogoUrl?: string;
  };
};

export function canManageWorkspaceLogoForRole(role: string) {
  const normalized = normalizeWorkspaceRole(role);
  return normalized === "owner" || normalized === "admin" || normalized === "member";
}

function extensionForWorkspaceLogo(file: File) {
  const extension = file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() ?? "" : "";
  if (!WORKSPACE_LOGO_EXTENSIONS.has(extension)) {
    throw new Error("Choose a JPG, JPEG, PNG, HEIC, HEIF or WEBP image.");
  }
  return extension;
}

function contentTypeForWorkspaceLogo(file: File, extension: string) {
  if (file.type) return file.type;
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "heic") return "image/heic";
  if (extension === "heif") return "image/heif";
  if (extension === "webp") return "image/webp";
  return "image/jpeg";
}

function newLogoFileName(extension: string) {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${id}.${extension || "jpg"}`;
}

function logoError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/feature_not_in_plan|pro|team|plan/i.test(message)) {
    return "Workspace logo upload is available on Monthly Pro and Team plans.";
  }
  if (/permission|role|denied/i.test(message)) {
    return "Your workspace role cannot edit Workspace Logo.";
  }
  return message || "Workspace logo could not be saved.";
}

export async function saveWorkspaceLogoUrl(workspace: WorkspaceContext, appLogoUrl: string) {
  if (!canManageWorkspaceLogoForRole(workspace.role)) {
    throw new Error("Your workspace role cannot edit Workspace Logo.");
  }

  try {
    return await withWebSyncStatus(async () => {
      const callable = httpsCallable<Record<string, unknown>, WorkspaceLogoResult>(functions, "saveWorkspaceLogo");
      const result = await callable({
        companyId: workspace.id,
        appLogoUrl
      });
      if (typeof window !== "undefined" && result.data.settings) {
        window.dispatchEvent(new CustomEvent("studioflow-settings-updated", { detail: { settings: result.data.settings } }));
      }
      return result.data;
    }, appLogoUrl ? "Saving workspace logo to cloud." : "Removing workspace logo.");
  } catch (error) {
    throw new Error(logoError(error));
  }
}

export async function uploadWorkspaceLogo({
  workspace,
  file,
  user,
  policyAccepted,
  maxSizeMB
}: {
  workspace: WorkspaceContext;
  file: File;
  user: UploadUser;
  policyAccepted: boolean;
  maxSizeMB: number;
}) {
  if (!canManageWorkspaceLogoForRole(workspace.role)) {
    throw new Error("Your workspace role cannot edit Workspace Logo.");
  }

  const extension = extensionForWorkspaceLogo(file);
  const contentType = contentTypeForWorkspaceLogo(file, extension);
  await requireWorkspacePlanAction(workspace.id, "upload_workspace_logo", {
    fileSizeBytes: file.size
  });

  const storedFileName = newLogoFileName(extension);
  const uploadedAt = new Date();
  const storageRef = ref(storage, `companies/${workspace.id}/design_images/${storedFileName}`);
  const uploadedByEmail = user.email ?? "";
  const uploadedBy = uploadedByEmail || user.displayName || user.uid;

  try {
    const downloadURL = await withWebSyncStatus(async () => {
      await uploadBytes(storageRef, file, {
        contentType,
        customMetadata: {
          companyId: workspace.id,
          uploadedByUid: user.uid,
          uploadedByEmail: uploadedByEmail || "unknown",
          uploadedBy,
          originalFileName: file.name,
          source: "app_logo",
          orderId: "",
          uploadedAt: uploadedAt.toISOString(),
          fileType: contentType,
          fileSize: String(file.size),
          storagePath: storageRef.fullPath,
          policyAccepted: policyAccepted ? "true" : "false",
          maxSizeMB: String(Math.round(maxSizeMB))
        }
      });
      return getDownloadURL(storageRef);
    }, "Uploading workspace logo to cloud.");

    return saveWorkspaceLogoUrl(workspace, downloadURL);
  } catch (error) {
    throw new Error(logoError(error));
  }
}
