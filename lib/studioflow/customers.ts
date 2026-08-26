import { httpsCallable } from "firebase/functions";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { auth, functions, storage } from "@/lib/firebase/client";
import { normalizeWorkspaceRole, type WorkspaceContext } from "@/lib/studioflow/firestore";
import { withWebSyncStatus } from "@/lib/studioflow/syncStatus";

const CUSTOMER_PHOTO_EXTENSIONS = new Set(["jpg", "jpeg", "png", "heic", "heif", "webp"]);
export const CUSTOMER_PHOTO_ACCEPT = ".jpg,.jpeg,.png,.heic,.heif,.webp";

function customerPhotoExtension(file: File) {
  const extension = file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() ?? "" : "";
  if (!CUSTOMER_PHOTO_EXTENSIONS.has(extension)) {
    throw new Error("Choose a JPG, JPEG, PNG, HEIC, HEIF or WEBP image.");
  }
  return extension;
}

function customerPhotoContentType(file: File, extension: string) {
  if (file.type) return file.type;
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "heic") return "image/heic";
  if (extension === "heif") return "image/heif";
  if (extension === "webp") return "image/webp";
  return "image/jpeg";
}

function newCustomerPhotoFileName(extension: string) {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${id}.${extension || "jpg"}`;
}

export type CustomerFormInput = {
  name: string;
  email: string;
  phone: string;
  // A landline/primary number distinct from the WhatsApp-capable one.
  primaryPhone: string;
  // The customer's own WhatsApp number — the store-fed "phone" stays untouched.
  whatsappNumber: string;
  // Trade customers: the business the person buys for.
  company: string;
  instagram: string;
  address: string;
  streetAddress: string;
  city: string;
  postalCode: string;
  country: string;
  shippingStreetAddress: string;
  shippingCity: string;
  shippingPostalCode: string;
  shippingCountry: string;
  shippingPhone: string;
  notes: string;
  // Optional: only sent when editing segments — omitted on contact autosaves
  // so the backend never wipes them.
  tags?: string[];
  // Contact preferences (all optional, key-present semantics on the server).
  preferredChannel?: string;
  doNotContact?: boolean;
  marketingOptIn?: string;
  nextFollowUpDateMillis?: number | null;
  // Optional: only sent when changing the customer photo. Omitting it preserves the
  // existing avatar (the backend skips the key and the doc is merged).
  profileImageUrl?: string;
};

type CustomerActionResult = {
  ok?: boolean;
  customerId?: string;
  message?: string;
  [key: string]: unknown;
};

export function canManageCustomersForRole(role: string) {
  const normalized = normalizeWorkspaceRole(role);
  return normalized === "owner" || normalized === "admin" || normalized === "member";
}

function friendlyCustomerError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  if (/customer limit|failed-precondition|plan.*limit/i.test(message)) {
    return "Your current plan has reached its customer limit. Upgrade the workspace plan to add more customers.";
  }
  if (/permission|role|denied/i.test(message)) {
    return "Your workspace role cannot manage customers.";
  }
  return message || fallback;
}

export async function createCustomerFromWeb(workspace: WorkspaceContext, input: CustomerFormInput) {
  if (!canManageCustomersForRole(workspace.role)) {
    throw new Error("Your workspace role cannot create customers.");
  }

  try {
    return await withWebSyncStatus(async () => {
      const callable = httpsCallable<Record<string, unknown>, CustomerActionResult>(functions, "createWebCustomer");
      const response = await callable({
        companyId: workspace.id,
        ...input
      });
      if (response.data?.ok === false || !response.data?.customerId) {
        throw new Error(response.data?.message || "Could not create the customer.");
      }
      return response.data;
    }, "Saving customer to cloud.");
  } catch (error) {
    throw new Error(friendlyCustomerError(error, "Could not create the customer."));
  }
}

export async function updateCustomerFromWeb(workspace: WorkspaceContext, customerId: string, input: CustomerFormInput) {
  if (!canManageCustomersForRole(workspace.role)) {
    throw new Error("Your workspace role cannot edit customers.");
  }

  try {
    return await withWebSyncStatus(async () => {
      const callable = httpsCallable<Record<string, unknown>, CustomerActionResult>(functions, "updateWebCustomer");
      const response = await callable({
        companyId: workspace.id,
        customerId,
        ...input
      });
      if (response.data?.ok === false) {
        throw new Error(response.data?.message || "Could not update the customer.");
      }
      return response.data;
    }, "Saving customer changes to cloud.");
  } catch (error) {
    throw new Error(friendlyCustomerError(error, "Could not update the customer."));
  }
}

// Folds a duplicate record into the primary. `keep` names the fields where
// the duplicate's value should win (e.g. { email: "merged" }); everything
// else keeps the primary's value, gaps fill from the duplicate.
export async function mergeCustomersFromWeb(
  workspace: WorkspaceContext,
  primaryId: string,
  mergedId: string,
  keep: Partial<Record<"name" | "email" | "phone" | "primaryPhone" | "whatsappNumber", "primary" | "merged">> = {}
) {
  if (!canManageCustomersForRole(workspace.role)) {
    throw new Error("Your workspace role cannot merge customers.");
  }

  try {
    return await withWebSyncStatus(async () => {
      const callable = httpsCallable<Record<string, unknown>, CustomerActionResult & { movedOrderCount?: number }>(functions, "mergeWebCustomers");
      const response = await callable({
        companyId: workspace.id,
        primaryId,
        mergedId,
        keep
      });
      if (response.data?.ok === false) {
        throw new Error(response.data?.message || "The customers could not be merged.");
      }
      return response.data;
    }, "Merging customers in cloud.");
  } catch (error) {
    throw new Error(friendlyCustomerError(error, "The customers could not be merged."));
  }
}

// Replays the store's last webhook payload onto the profile — the explicit
// "take the store's values now" action; no store API call is involved.
export async function resyncIntegrationCustomerFromWeb(workspace: WorkspaceContext, customerId: string) {
  try {
    return await withWebSyncStatus(async () => {
      const callable = httpsCallable<Record<string, unknown>, CustomerActionResult & { applied?: number }>(functions, "resyncIntegrationCustomer");
      const response = await callable({ companyId: workspace.id, customerId });
      if (response.data?.ok === false) {
        throw new Error(response.data?.message || "The customer could not be resynced.");
      }
      return response.data;
    }, "Resyncing customer from store data.");
  } catch (error) {
    throw new Error(friendlyCustomerError(error, "The customer could not be resynced."));
  }
}

// GDPR anonymization: owner-only and irreversible. Personal fields vanish
// from the profile and every order; financial records stay intact.
export async function anonymizeCustomerFromWeb(workspace: WorkspaceContext, customerId: string) {
  if (normalizeWorkspaceRole(workspace.role) !== "owner") {
    throw new Error("Only the workspace owner can anonymize a customer.");
  }

  try {
    return await withWebSyncStatus(async () => {
      const callable = httpsCallable<Record<string, unknown>, CustomerActionResult & { anonymizedOrderCount?: number }>(functions, "anonymizeWebCustomer");
      const response = await callable({ companyId: workspace.id, customerId });
      if (response.data?.ok === false) {
        throw new Error(response.data?.message || "The customer could not be anonymized.");
      }
      return response.data;
    }, "Anonymizing customer in cloud.");
  } catch (error) {
    throw new Error(friendlyCustomerError(error, "The customer could not be anonymized."));
  }
}

export async function uploadCustomerPhoto(workspace: WorkspaceContext, file: File) {
  if (!canManageCustomersForRole(workspace.role)) {
    throw new Error("Your workspace role cannot edit customers.");
  }
  const user = auth.currentUser;
  if (!user) throw new Error("Please sign in again before updating the customer photo.");
  if (file.size > 10 * 1024 * 1024) throw new Error("Choose a customer photo under 10 MB.");

  const extension = customerPhotoExtension(file);
  const contentType = customerPhotoContentType(file, extension);
  const storedFileName = newCustomerPhotoFileName(extension);
  const storageRef = ref(storage, `companies/${workspace.id}/design_images/${storedFileName}`);
  const uploadedAt = new Date();

  return withWebSyncStatus(async () => {
    await uploadBytes(storageRef, file, {
      contentType,
      customMetadata: {
        companyId: workspace.id,
        uploadedByUid: user.uid,
        uploadedByEmail: user.email || "unknown",
        originalFileName: file.name,
        source: "customer_photo",
        orderId: "",
        uploadedAt: uploadedAt.toISOString(),
        fileType: contentType,
        fileSize: String(file.size),
        storagePath: storageRef.fullPath
      }
    });
    return getDownloadURL(storageRef);
  }, "Uploading customer photo to cloud.");
}

export async function deleteCustomerFromWeb(workspace: WorkspaceContext, customerId: string) {
  if (!canManageCustomersForRole(workspace.role)) {
    throw new Error("Your workspace role cannot delete customers.");
  }

  try {
    return await withWebSyncStatus(async () => {
      const callable = httpsCallable<Record<string, unknown>, CustomerActionResult>(functions, "deleteWebCustomer");
      const response = await callable({
        companyId: workspace.id,
        customerId
      });
      if (response.data?.ok === false) {
        throw new Error(response.data?.message || "Could not delete the customer.");
      }
      return response.data;
    }, "Saving customer changes to cloud.");
  } catch (error) {
    throw new Error(friendlyCustomerError(error, "Could not delete the customer."));
  }
}
