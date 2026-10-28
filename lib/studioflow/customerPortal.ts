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

export type PortalLinkLookup =
  | { kind: "link"; url: string }
  | { kind: "none" }
  | { kind: "denied"; reason: "customers_off" | "financial_off" | "other" }
  | { kind: "unavailable" };

// SEC-NAME C-portal (28 Oct 2026): Copy Link asks the server for the live link, behind the gates that mint one
// (Customers, Financial Info, the member's assigned scope). The order document still carries the plaintext for
// apps released before getOrderPortalLink; "unavailable" (the call got no answer) is the only case in which the
// card may fall back to that copy — a "no" from the server is final. Never throws.
export async function getOrderPortalLink(workspace: WorkspaceContext, orderId: string): Promise<PortalLinkLookup> {
  try {
    const callable = httpsCallable<Record<string, unknown>, { ok?: boolean; active?: boolean; url?: string }>(functions, "getOrderPortalLink");
    const { data } = await callable({ companyId: workspace.id, orderId });
    const url = typeof data?.url === "string" ? data.url : "";
    return data?.active === true && url ? { kind: "link", url } : { kind: "none" };
  } catch (error) {
    const code = String((error as { code?: unknown } | null)?.code ?? "");
    if (code === "functions/permission-denied" || code === "functions/unauthenticated") {
      const reason = String((error as { details?: { reason?: unknown } } | null)?.details?.reason ?? "");
      return { kind: "denied", reason: reason === "customers_off" || reason === "financial_off" ? reason : "other" };
    }
    return { kind: "unavailable" };
  }
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

export function portalUrlForToken(token: string, brandedHost = "") {
  if (!token) return "";
  const host = brandedHost.trim().toLowerCase() || "nivadesk.app";
  return `https://${host}/track/${token}`;
}
