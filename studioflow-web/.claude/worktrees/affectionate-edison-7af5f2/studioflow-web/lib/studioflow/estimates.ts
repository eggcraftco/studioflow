import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";
import { withWebSyncStatus } from "@/lib/studioflow/syncStatus";

// Staff side of an estimate. Everything that matters — the number, the totals,
// the status, the approval — is decided on the server; these calls only ask.

export type EstimateLineInput = {
  id?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type EstimateRecord = {
  estimateId: string;
  number: string;
  version: number;
  status: string;
  currency: string;
  lineItems: EstimateLineInput[];
  subtotal: number;
  taxRate: number;
  taxType: string;
  taxAmount: number;
  total: number;
  terms: string;
  notes: string;
  validUntilMs: number;
  createdAtMs: number;
  sentAtMs: number;
  viewedAtMs: number;
  replacesNumber: string;
  approval: {
    decision: string;
    method: string;
    decidedAtMs: number;
    approvedByName: string;
    approvedByEmail: string;
    declineReason: string;
    signatureDownloadUrl: string;
  } | null;
};

function estimateError(error: unknown, fallback: string) {
  const raw = error instanceof Error ? error.message : "";
  if (/failed-precondition/i.test(raw)) return raw.replace(/^[a-z-]+:\s*/i, "").trim() || fallback;
  if (/permission-denied|role/i.test(raw)) return "Your workspace role cannot change estimates.";
  const cleaned = raw.replace(/^[a-z-]+:\s*/i, "").trim();
  if (!cleaned || /^(internal|unknown|unavailable|not-found)$/i.test(cleaned)) return fallback;
  return cleaned;
}

async function call<T>(name: string, payload: Record<string, unknown>, fallback: string) {
  try {
    const callable = httpsCallable<Record<string, unknown>, T>(functions, name);
    const result = await callable(payload);
    return result.data;
  } catch (error) {
    throw new Error(estimateError(error, fallback));
  }
}

export async function createOrderEstimate(
  workspace: WorkspaceContext,
  input: {
    orderId: string;
    lineItems: EstimateLineInput[];
    taxRate: number;
    taxType: string;
    notes?: string;
    terms?: string;
    validUntilMs?: number;
    supersedesId?: string;
  }
) {
  return withWebSyncStatus(() =>
    call<{ ok?: boolean; estimateId?: string; number?: string; total?: number }>(
      "createOrderEstimate",
      { companyId: workspace.id, ...input },
      "The estimate could not be created."
    )
  );
}

export async function sendOrderEstimate(workspace: WorkspaceContext, orderId: string, estimateId: string) {
  return call<{ ok?: boolean; url?: string; expiresAtMs?: number }>(
    "sendOrderEstimate",
    { companyId: workspace.id, orderId, estimateId },
    "The link could not be created."
  );
}

export async function revokeOrderEstimateLink(workspace: WorkspaceContext, orderId: string, estimateId: string) {
  return call<{ ok?: boolean }>(
    "revokeOrderEstimateLink",
    { companyId: workspace.id, orderId, estimateId },
    "The link could not be revoked."
  );
}

export async function loadOrderEstimateRecord(workspace: WorkspaceContext, orderId: string, estimateId?: string) {
  return call<{ ok?: boolean; record?: EstimateRecord; records?: EstimateRecord[] }>(
    "getOrderEstimateRecord",
    { companyId: workspace.id, orderId, estimateId: estimateId || "" },
    "The estimate could not be opened."
  );
}

export function estimateStatusLabel(status: string) {
  switch (status) {
    case "sent": return "Sent";
    case "viewed": return "Viewed";
    case "approved": return "Approved";
    case "declined": return "Declined";
    case "superseded": return "Superseded";
    default: return "Draft";
  }
}
