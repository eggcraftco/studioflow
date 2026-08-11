// Client for the NivaDesk backend bridge (Firebase Functions).
//
// Every call is server→server with the shared secret header; nothing here is
// ever exposed to the browser. Access tokens flow only through upsertStore.
import crypto from "node:crypto";

const BRIDGE_URL =
  process.env.NIVADESK_BRIDGE_URL ||
  "https://europe-west2-eggcraft-studio.cloudfunctions.net/shopifyAppBridge";
const IMPORT_URL =
  process.env.NIVADESK_IMPORT_URL ||
  "https://europe-west2-eggcraft-studio.cloudfunctions.net/shopifyImportOrders";

function bridgeSecret(): string {
  const secret = process.env.NIVADESK_BRIDGE_SECRET || "";
  if (!secret) throw new Error("NIVADESK_BRIDGE_SECRET is not configured");
  return secret;
}

export interface NivadeskStoreView {
  shop: string;
  shopName: string;
  status: "pending" | "active" | "paused" | "uninstalled";
  companyId: string;
  linkedEmail: string;
  scopes: string;
  settings: Record<string, unknown>;
  stats: {
    syncedOrders: number;
    failedCount: number;
    lastSyncAt: unknown;
    lastWebhookAt: unknown;
  };
}

export async function nivadeskBridge<T = Record<string, unknown>>(
  action: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(BRIDGE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-nivadesk-bridge-secret": bridgeSecret(),
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown> & {
    ok?: boolean;
    error?: string;
  };
  if (!response.ok || body.ok === false) {
    throw new Error(String(body.error || `bridge_http_${response.status}`));
  }
  return body as T;
}

// Fire-and-forget backfill: the run can take minutes, so we only launch it and
// hand back the import id for importStatus polling.
export function startNivadeskImport(payload: Record<string, unknown>): string {
  const importId = crypto.randomUUID().replace(/-/g, "");
  void fetch(IMPORT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-nivadesk-bridge-secret": bridgeSecret(),
    },
    body: JSON.stringify({ ...payload, importId }),
  }).catch((error) => console.error("NivaDesk import launch failed:", error));
  return importId;
}
