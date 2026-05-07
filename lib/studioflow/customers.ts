import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import { normalizeWorkspaceRole, type WorkspaceContext } from "@/lib/studioflow/firestore";
import { withWebSyncStatus } from "@/lib/studioflow/syncStatus";

export type CustomerFormInput = {
  name: string;
  email: string;
  phone: string;
  instagram: string;
  address: string;
  notes: string;
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
