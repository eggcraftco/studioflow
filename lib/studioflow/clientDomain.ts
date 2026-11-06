import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";

// The workspace's client-facing domain layer: a subdomain slug for everyone,
// a custom hostname for Pro/Team. Mirrors functions/clientDomains.js.

export type ClientDomainRow = {
  host: string;
  kind: "subdomain" | "custom";
  status: "active" | "pending";
  cnameTarget?: string;
  lastCheckFound?: string[];
  verifiedAtMs?: number;
  /** Edge certificate state written at verify time — "active" once TLS is being served. */
  cfSslStatus?: string;
};

async function call<T>(name: string, payload: Record<string, unknown>, fallback: string) {
  try {
    const callable = httpsCallable<Record<string, unknown>, T>(functions, name);
    const result = await callable(payload);
    return result.data;
  } catch (error) {
    const raw = error instanceof Error ? error.message : "";
    const cleaned = raw.replace(/^[a-z-]+:\s*/i, "").trim();
    if (!cleaned || /^(internal|unknown|unavailable|not-found)$/i.test(cleaned)) throw new Error(fallback);
    throw new Error(cleaned);
  }
}

export type ClientPortalBranding = {
  accentColor: string;
  showPoweredBy: boolean;
};

export async function getClientDomainConfig(workspace: WorkspaceContext) {
  return call<{ ok?: boolean; subdomain?: ClientDomainRow | null; customDomains?: ClientDomainRow[]; cnameTarget?: string; branding?: ClientPortalBranding }>(
    "getClientDomainConfig",
    { companyId: workspace.id },
    "The domain settings could not be loaded."
  );
}

export async function setClientSubdomain(workspace: WorkspaceContext, slug: string) {
  return call<{ ok?: boolean; slug?: string; host?: string }>(
    "setClientSubdomain",
    { companyId: workspace.id, slug },
    "The subdomain could not be saved."
  );
}

export async function requestClientDomain(workspace: WorkspaceContext, host: string) {
  return call<{ ok?: boolean; host?: string; record?: { type: string; name: string; target: string } }>(
    "requestClientDomain",
    { companyId: workspace.id, host },
    "The domain could not be added."
  );
}

export async function verifyClientDomain(workspace: WorkspaceContext, host: string) {
  return call<{ ok?: boolean; verified?: boolean; found?: string[]; expected?: string; error?: string; certificate?: { status?: string; error?: string } }>(
    "verifyClientDomain",
    { companyId: workspace.id, host },
    "The domain could not be checked."
  );
}

export async function saveClientPortalBranding(workspace: WorkspaceContext, branding: ClientPortalBranding) {
  return call<{ ok?: boolean; accentColor?: string; showPoweredBy?: boolean }>(
    "saveClientPortalBranding",
    { companyId: workspace.id, accentColor: branding.accentColor, showPoweredBy: branding.showPoweredBy },
    "The branding could not be saved."
  );
}

export async function removeClientDomain(workspace: WorkspaceContext, host: string) {
  return call<{ ok?: boolean }>(
    "removeClientDomain",
    { companyId: workspace.id, host },
    "The domain could not be removed."
  );
}

// STRIPE-LINKS short links (29 Oct 2026): the payment domain — pay.<their domain> — that payment links are
// written on. Mirrors managePaymentLinkDomain in functions/clientDomains.js: its own registry row, so it never
// becomes the address of the tracking and estimate links above.
export type PaymentLinkDomainView = {
  ok?: boolean;
  host: string;
  /** "payments" for an address added here; "custom" when a verified client domain was chosen as it is. */
  kind?: string;
  status: string;
  cnameTarget?: string;
  record?: { type: string; name: string; target: string };
  certificate?: { status?: string; error?: string } | null;
  verified?: boolean;
  found?: string[];
  error?: string;
};

export async function managePaymentLinkDomain(
  workspace: WorkspaceContext,
  action: "get" | "request" | "verify" | "remove",
  host = ""
) {
  return call<PaymentLinkDomainView>(
    "managePaymentLinkDomain",
    { companyId: workspace.id, action, ...(host ? { host } : {}) },
    "The payment address could not be updated."
  );
}

// FILE LINK ADDRESS (6 Nov 2026): the address shared FILE links are written on — files.<their domain> — so a
// file no longer reads "track.…/f/…". Mirrors manageFileLinkDomain in functions/clientDomains.js: its own
// registry row (kind "files"), so adding it never moves the tracking, estimate or payment links. The server
// sets the workspace's fileLinkHostLive only once DNS and the certificate are both in place; the link
// builders read that through workspace.fileLinkHost (lib/studioflow/fileLinkHost.ts).
export type FileLinkDomainView = {
  ok?: boolean;
  host: string;
  /** "files" for an address added here; "custom" when a verified client domain was chosen as it is. */
  kind?: string;
  status: string;
  /** True once new file links are written on this address (DNS verified and certificate active). */
  live?: boolean;
  cnameTarget?: string;
  record?: { type: string; name: string; target: string };
  certificate?: { status?: string; error?: string } | null;
  verified?: boolean;
  found?: string[];
  error?: string;
};

export async function manageFileLinkDomain(
  workspace: WorkspaceContext,
  action: "get" | "request" | "verify" | "remove",
  host = ""
) {
  return call<FileLinkDomainView>(
    "manageFileLinkDomain",
    { companyId: workspace.id, action, ...(host ? { host } : {}) },
    "The file address could not be updated."
  );
}
