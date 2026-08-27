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

export async function getClientDomainConfig(workspace: WorkspaceContext) {
  return call<{ ok?: boolean; subdomain?: ClientDomainRow | null; customDomains?: ClientDomainRow[]; cnameTarget?: string }>(
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
  return call<{ ok?: boolean; verified?: boolean; found?: string[]; expected?: string; error?: string }>(
    "verifyClientDomain",
    { companyId: workspace.id, host },
    "The domain could not be checked."
  );
}

export async function removeClientDomain(workspace: WorkspaceContext, host: string) {
  return call<{ ok?: boolean }>(
    "removeClientDomain",
    { companyId: workspace.id, host },
    "The domain could not be removed."
  );
}
