import { sendPasswordResetEmail } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { auth, functions, storage } from "@/lib/firebase/client";
import { type WorkspaceContext } from "@/lib/studioflow/firestore";
import { withWebSyncStatus } from "@/lib/studioflow/syncStatus";

const ACCOUNT_AVATAR_EXTENSIONS = new Set(["jpg", "jpeg", "png", "heic", "heif", "webp"]);
export const ACCOUNT_AVATAR_ACCEPT = ".jpg,.jpeg,.png,.heic,.heif,.webp";

export type AccountProfileInput = {
  displayName: string;
  companyName: string;
};

export type AccountAvatarInput = {
  photoURL: string;
};

export type AccountProfileResult = {
  ok?: boolean;
  message?: string;
  profile?: {
    displayName: string;
    companyName: string;
    photoURL: string;
    companyNameEditable?: boolean;
  };
};

export type AccountEmailInput = {
  email: string;
};

export type AccountEmailResult = {
  ok?: boolean;
  message?: string;
  profile?: {
    email: string;
    displayName?: string;
    companyName?: string;
    photoURL?: string;
    emailNextChangeAt?: number | null;
  };
};

function friendlyAccountError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/permission|role|denied/i.test(message)) return "Your workspace role cannot edit this account profile.";
  return message || "Account profile could not be saved.";
}

function accountAvatarExtension(file: File) {
  const extension = file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() ?? "" : "";
  if (!ACCOUNT_AVATAR_EXTENSIONS.has(extension)) {
    throw new Error("Choose a JPG, JPEG, PNG, HEIC, HEIF or WEBP image.");
  }
  return extension;
}

function accountAvatarContentType(file: File, extension: string) {
  if (file.type) return file.type;
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "heic") return "image/heic";
  if (extension === "heif") return "image/heif";
  if (extension === "webp") return "image/webp";
  return "image/jpeg";
}

function newAccountAvatarFileName(extension: string) {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${id}.${extension || "jpg"}`;
}

export async function saveAccountProfile(workspace: WorkspaceContext, input: AccountProfileInput) {
  try {
    return await withWebSyncStatus(async () => {
      const callable = httpsCallable<Record<string, unknown>, AccountProfileResult>(functions, "saveAccountProfile");
      const result = await callable({
        companyId: workspace.id,
        profile: input
      });
      if (typeof window !== "undefined" && result.data.profile) {
        window.dispatchEvent(new CustomEvent("studioflow-workspace-updated", {
          detail: {
            workspace: {
              name: result.data.profile.companyName,
              currentMemberDisplayName: result.data.profile.displayName
            }
          }
        }));
      }
      return result.data;
    }, "Saving account profile to cloud.");
  } catch (error) {
    throw new Error(friendlyAccountError(error));
  }
}


export async function changeAccountEmail(workspace: WorkspaceContext, input: AccountEmailInput) {
  try {
    return await withWebSyncStatus(async () => {
      const callable = httpsCallable<Record<string, unknown>, AccountEmailResult>(functions, "changeAccountEmail");
      const result = await callable({
        companyId: workspace.id,
        email: input.email
      });
      if (typeof window !== "undefined" && result.data.profile) {
        window.dispatchEvent(new CustomEvent("studioflow-workspace-updated", {
          detail: {
            workspace: {
              currentMemberDisplayName: result.data.profile.displayName ?? workspace.currentMemberDisplayName,
              currentMemberPhotoURL: result.data.profile.photoURL ?? workspace.currentMemberPhotoURL
            }
          }
        }));
      }
      return result.data;
    }, "Changing sign-in email.");
  } catch (error) {
    throw new Error(friendlyAccountError(error));
  }
}

export async function saveAccountAvatar(workspace: WorkspaceContext, input: AccountAvatarInput) {
  try {
    return await withWebSyncStatus(async () => {
      const callable = httpsCallable<Record<string, unknown>, AccountProfileResult>(functions, "saveAccountAvatar");
      const result = await callable({
        companyId: workspace.id,
        photoURL: input.photoURL
      });
      if (typeof window !== "undefined" && result.data.profile) {
        window.dispatchEvent(new CustomEvent("studioflow-workspace-updated", {
          detail: {
            workspace: {
              currentMemberDisplayName: result.data.profile.displayName,
              currentMemberPhotoURL: result.data.profile.photoURL
            }
          }
        }));
      }
      return result.data;
    }, input.photoURL ? "Saving account avatar to cloud." : "Removing account avatar.");
  } catch (error) {
    throw new Error(friendlyAccountError(error));
  }
}

export async function uploadAccountAvatar(workspace: WorkspaceContext, file: File) {
  const user = auth.currentUser;
  if (!user) throw new Error("Please sign in again before updating your profile photo.");
  if (file.size > 10 * 1024 * 1024) throw new Error("Choose an avatar image under 10 MB.");

  const extension = accountAvatarExtension(file);
  const contentType = accountAvatarContentType(file, extension);
  const storedFileName = newAccountAvatarFileName(extension);
  const storageRef = ref(storage, `companies/${workspace.id}/design_images/${storedFileName}`);
  const uploadedAt = new Date();

  const downloadURL = await withWebSyncStatus(async () => {
    await uploadBytes(storageRef, file, {
      contentType,
      customMetadata: {
        companyId: workspace.id,
        uploadedByUid: user.uid,
        uploadedByEmail: user.email || "unknown",
        originalFileName: file.name,
        source: "account_avatar",
        orderId: "",
        uploadedAt: uploadedAt.toISOString(),
        fileType: contentType,
        fileSize: String(file.size),
        storagePath: storageRef.fullPath
      }
    });
    return getDownloadURL(storageRef);
  }, "Uploading account avatar to cloud.");

  return saveAccountAvatar(workspace, { photoURL: downloadURL });
}

export async function sendAccountPasswordReset(email: string) {
  const cleaned = email.trim();
  if (!cleaned) throw new Error("Account email is not available.");
  await sendPasswordResetEmail(auth, cleaned);
}
