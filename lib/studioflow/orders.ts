import { httpsCallable } from "firebase/functions";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { functions, storage } from "@/lib/firebase/client";
import { normalizeWorkspaceRole, type WorkspaceContext } from "@/lib/studioflow/firestore";
import { withWebSyncStatus } from "@/lib/studioflow/syncStatus";

const PREVIEW_IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "heic", "heif", "webp"]);

export const ORDER_PREVIEW_IMAGE_ACCEPT = ".jpg,.jpeg,.png,.heic,.heif,.webp";

export type CreateOrderInput = {
  customerName: string;
  designName: string;
  watchRef: string;
  orderValue: number;
  paidAmount: number;
  deliveryDueDate: string;
  designStatus: string;
  paintingStatus: string;
  notes: string;
};

export type CreateOrderResult = {
  ok?: boolean;
  orderId?: string;
  customerId?: string;
  customerCreated?: boolean;
  message?: string;
  [key: string]: unknown;
};

export type UpdateOrderInput = Partial<CreateOrderInput> & {
  orderId: string;
  details?: {
    customerName?: string;
    designName?: string;
    assignedToUid?: string;
    assignedToEmail?: string;
    watchRef?: string;
    designLink?: string;
    emailAddress?: string;
    whatsappNumber?: string;
    instagramUsername?: string;
    tiktokUsername?: string;
    address?: string;
    communication?: string[];
    customerNotes?: string;
    paymentDate?: string;
    deliveryTime?: number;
    deliveryDueDate?: string;
    courier?: string;
    trackingNumber?: string;
    isDispatched?: boolean;
    isDelivered?: boolean;
    priority?: string;
    risk?: string;
    riskReason?: string;
    invBool1?: boolean;
    invBool2?: boolean;
    invBool3?: boolean;
    invBool4?: boolean;
    invNotes?: string;
    extraStatuses?: Record<string, string>;
    customToggles?: Record<string, boolean>;
    materialsDefaultToggles?: Record<string, boolean>;
    materialsToggles?: Record<string, boolean>;
    statusNotesSupplier?: string;
    notes?: string;
    customFields?: Record<string, string>;
    specialNotes?: Record<string, string>;
  };
  finance?: {
    orderValue?: number;
    paidAmount?: number;
    remainingAmount?: number;
    watchPurchasePrice?: number;
    paymentFee?: number;
    deliveryCost?: number;
    taxRate?: number;
    taxType?: string;
    paymentMethod?: string;
    fullPaymentReceived?: boolean;
    recordPayment?: { amount: number; method?: string; note?: string };
    deletePaymentId?: string;
    // Per-order amounts for the workspace's custom Extra Spending / Remaining
    // headings, keyed by heading title. Mirrors the Mac/iPhone/Android editors.
    financialExpenseValues?: Record<string, number>;
    financialRemainingValues?: Record<string, number>;
  };
  todo?: {
    action: "add" | "toggle" | "delete" | "update" | "move" | "reorder";
    taskId?: string;
    title?: string;
    note?: string;
    priority?: string;
    dueDate?: string;
    isDone?: boolean;
    move?: "up" | "down" | "top" | "bottom";
    orderedIds?: string[];
    assignedToUid?: string;
    assignedToEmail?: string;
  };
  schedule?: {
    action: "add" | "complete" | "snooze" | "delete" | "update";
    reminderId?: string;
    title?: string;
    note?: string;
    dueAt?: string;
    priority?: "Low" | "Normal" | "High" | "Urgent";
    notify?: boolean;
    hours?: number;
  };
  workTime?: {
    action: "start" | "continue" | "stop" | "delete";
    title?: string;
    sessionId?: string;
    newSessionId?: string;
  };
};

export type UpdateOrderResult = {
  ok?: boolean;
  orderId?: string;
  changed?: boolean;
  historyCount?: number;
  message?: string;
  [key: string]: unknown;
};

export type DeleteOrderResult = {
  ok?: boolean;
  orderId?: string;
  message?: string;
  [key: string]: unknown;
};

export function canCreateOrdersForRole(role: string) {
  const normalized = normalizeWorkspaceRole(role);
  return normalized === "owner" || normalized === "admin" || normalized === "member" || normalized === "workflow";
}

export function canEditOrderFullyForRole(role: string) {
  return canCreateOrdersForRole(role);
}

export function canDeleteOrdersForRole(role: string) {
  const normalized = normalizeWorkspaceRole(role);
  return normalized === "owner" || normalized === "admin" || normalized === "member";
}

export function canEditOrderStatusForRole(role: string) {
  const normalized = normalizeWorkspaceRole(role);
  return normalized === "owner" || normalized === "admin" || normalized === "member" || normalized === "workflow";
}

export function canEditOrderDetailsForRole(role: string) {
  return canEditOrderStatusForRole(role);
}

function friendlyCreateOrderError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/plan.*limit|order limit|failed-precondition/i.test(message)) {
    return "Your current plan has reached its project limit. Upgrade the workspace plan to add more projects.";
  }
  if (/permission|role|denied/i.test(message)) {
    return "Your workspace role cannot create projects.";
  }
  return message || "Could not create the project. Please try again.";
}

function friendlyUpdateOrderError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/^Your current role/i.test(message)) return message;
  if (/workflow/i.test(message)) return "Workflow Only can edit order details, but cannot edit finance fields.";
  if (/permission|role|denied/i.test(message)) return "Your workspace role cannot edit this order.";
  return message || "Could not update the order. Please try again.";
}

function friendlyDeleteOrderError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/permission|role|denied/i.test(message)) return "Your workspace role cannot delete orders.";
  return message || "Could not delete the order. Please try again.";
}

function extensionForPreviewImage(file: File) {
  const extension = file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() ?? "" : "";
  if (!PREVIEW_IMAGE_EXTENSIONS.has(extension)) {
    throw new Error("Choose a JPG, JPEG, PNG, HEIC, HEIF or WEBP image.");
  }
  return extension;
}

function contentTypeForPreviewImage(file: File, extension: string) {
  if (file.type) return file.type;
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "heic") return "image/heic";
  if (extension === "heif") return "image/heif";
  if (extension === "webp") return "image/webp";
  return "image/jpeg";
}

function previewFileName(extension: string) {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${id}.${extension || "jpg"}`;
}

export async function createOrderFromWeb(workspace: WorkspaceContext, input: Partial<CreateOrderInput> = {}) {
  if (!workspace.entitlements.features.orders_create) {
    throw new Error("Creating projects is not available on the current workspace plan.");
  }

  if (!canCreateOrdersForRole(workspace.role)) {
    throw new Error("Your workspace role cannot create projects.");
  }

  try {
    return await withWebSyncStatus(async () => {
      const callable = httpsCallable<Record<string, unknown>, CreateOrderResult>(functions, "createWebOrder");
      const response = await callable({
        companyId: workspace.id,
        ...input
      });
      if (response.data?.ok === false || !response.data?.orderId) {
        throw new Error(response.data?.message || "Could not create the project.");
      }
      return response.data;
    }, "Saving new project to cloud.");
  } catch (error) {
    throw new Error(friendlyCreateOrderError(error));
  }
}

export async function updateOrderFromWeb(workspace: WorkspaceContext, input: UpdateOrderInput) {
  if (!canEditOrderStatusForRole(workspace.role)) {
    throw new Error("Your workspace role cannot edit this order.");
  }

  try {
    return await withWebSyncStatus(async () => {
      const callable = httpsCallable<Record<string, unknown>, UpdateOrderResult>(functions, "updateWebOrder");
      const response = await callable({
        companyId: workspace.id,
        ...input
      });
      if (response.data?.ok === false) {
        throw new Error(response.data?.message || "Could not update the order.");
      }
      return response.data;
    }, "Saving order changes to cloud.");
  } catch (error) {
    throw new Error(friendlyUpdateOrderError(error));
  }
}

export async function assignInvoiceNumberFromWeb(workspace: WorkspaceContext, orderId: string): Promise<string> {
  const callable = httpsCallable<Record<string, unknown>, { ok?: boolean; invoiceNumber?: string }>(functions, "assignInvoiceNumber");
  const response = await callable({ companyId: workspace.id, orderId });
  return response.data?.invoiceNumber || "";
}

export async function requestWorkflowOrderDeletionFromWeb(workspace: WorkspaceContext, orderId: string) {
  const requiresOwnerApproval = normalizeWorkspaceRole(workspace.role) === "workflow"
    || (workspace.memberAccess.assignedProjectsOnly === true
      && workspace.memberAccess.manageProjectAssignments !== true);
  if (!requiresOwnerApproval) {
    throw new Error("This role does not use owner-approved project deletion.");
  }
  return await withWebSyncStatus(async () => {
    const callable = httpsCallable<Record<string, unknown>, DeleteOrderResult>(functions, "requestWorkflowOrderDeletion");
    const response = await callable({ companyId: workspace.id, orderId });
    if (response.data?.ok === false) throw new Error(response.data?.message || "Could not request deletion.");
    return response.data;
  }, "Sending deletion request to owner.");
}

export async function deleteOrderFromWeb(workspace: WorkspaceContext, orderId: string) {
  if (!canDeleteOrdersForRole(workspace.role)) {
    throw new Error("Your workspace role cannot delete orders.");
  }

  try {
    return await withWebSyncStatus(async () => {
      const callable = httpsCallable<Record<string, unknown>, DeleteOrderResult>(functions, "deleteWebOrder");
      const response = await callable({
        companyId: workspace.id,
        orderId
      });
      if (response.data?.ok === false) {
        throw new Error(response.data?.message || "Could not delete the order.");
      }
      return response.data;
    }, "Deleting order from cloud.");
  } catch (error) {
    throw new Error(friendlyDeleteOrderError(error));
  }
}

export async function restoreOrderFromWeb(workspace: WorkspaceContext, orderId: string) {
  if (!canDeleteOrdersForRole(workspace.role)) {
    throw new Error("Your workspace role cannot restore orders.");
  }
  return await withWebSyncStatus(async () => {
    const callable = httpsCallable<Record<string, unknown>, DeleteOrderResult>(functions, "restoreWebOrder");
    const response = await callable({ companyId: workspace.id, orderId });
    if (response.data?.ok === false) {
      throw new Error(response.data?.message || "Could not restore the order.");
    }
    return response.data;
  }, "Restoring order from cloud.");
}

export async function uploadOrderPreviewImage({
  workspace,
  orderId,
  file,
  user,
  uploadSafety
}: {
  workspace: WorkspaceContext;
  orderId: string;
  file: File;
  user: {
    uid: string;
    email: string | null;
    displayName: string | null;
  };
  uploadSafety?: {
    policyAccepted: boolean;
    maxSizeMB: number;
  };
}) {
  if (!canEditOrderDetailsForRole(workspace.role)) {
    throw new Error("Your workspace role cannot edit this order.");
  }

  const maxSizeMB = Math.min(Math.max(Math.round(uploadSafety?.maxSizeMB ?? 10), 1), 50);
  if (file.size > maxSizeMB * 1024 * 1024) {
    throw new Error(`This image is larger than the ${maxSizeMB} MB workspace upload limit.`);
  }

  const extension = extensionForPreviewImage(file);
  const contentType = contentTypeForPreviewImage(file, extension);
  const storedFileName = previewFileName(extension);
  const uploadedAt = new Date();
  const storageRef = ref(storage, `companies/${workspace.id}/design_images/${storedFileName}`);
  const uploadedByEmail = user.email ?? "";
  const uploadedBy = uploadedByEmail || user.displayName || user.uid;

  try {
    return await withWebSyncStatus(async () => {
      await uploadBytes(storageRef, file, {
        contentType,
        customMetadata: {
          companyId: workspace.id,
          uploadedByUid: user.uid,
          uploadedByEmail: uploadedByEmail || "unknown",
          uploadedBy,
          originalFileName: file.name,
          source: "order_preview",
          orderId,
          uploadedAt: uploadedAt.toISOString(),
          fileType: contentType,
          fileSize: String(file.size),
          storagePath: storageRef.fullPath,
          policyAccepted: uploadSafety?.policyAccepted ? "true" : "false",
          maxSizeMB: String(maxSizeMB)
        }
      });
      return getDownloadURL(storageRef);
    }, "Uploading preview image to cloud.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    throw new Error(message || "Could not upload preview image.");
  }
}
