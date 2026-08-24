import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";

export type PortalVisibility = {
  status: boolean;
  estimate: boolean;
  payments: boolean;
  photos: boolean;
  expectedDate: boolean;
};

export type PortalAutoUpdates = { enabled: boolean; email: boolean; sms: boolean };

function portalError(error: unknown, fallback: string) {
  const raw = error instanceof Error ? error.message : "";
  if (/permission-denied|role/i.test(raw)) return "Your workspace role cannot change the customer portal.";
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
    throw new Error(portalError(error, fallback));
  }
}

export async function createOrderPortalLink(workspace: WorkspaceContext, orderId: string) {
  return call<{ ok?: boolean; url?: string; token?: string }>(
    "createOrderPortalLink",
    { companyId: workspace.id, orderId },
    "The portal link could not be created."
  );
}

export async function revokeOrderPortalLink(workspace: WorkspaceContext, orderId: string) {
  return call<{ ok?: boolean }>(
    "revokeOrderPortalLink",
    { companyId: workspace.id, orderId },
    "The portal link could not be turned off."
  );
}

export async function saveOrderPortalSettings(
  workspace: WorkspaceContext,
  orderId: string,
  visibility: PortalVisibility,
  autoUpdates: PortalAutoUpdates
) {
  return call<{ ok?: boolean }>(
    "saveOrderPortalSettings",
    { companyId: workspace.id, orderId, visibility, autoUpdates },
    "The portal settings could not be saved."
  );
}

export function portalUrlForToken(token: string) {
  return token ? `https://nivadesk.app/track/${token}` : "";
}
