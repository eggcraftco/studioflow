// The retention nudge's client side. The server decides what a person may see
// at the moment of looking (getRetentionMessage judges the open cards against the
// workspace's data, an open support case and a recent feedback prompt), and closes
// a card through dismissRetentionMessage. Nothing here reads or writes Firestore.
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";

export type RetentionMessage = {
  id: string;
  campaign: string;
  kind: string;
  title: string;
  body: string;
  action: string;
  target: { orderId?: string } | null;
  createdAtMs: number;
};

export type RetentionLookup = { ok: boolean; enabled: boolean; message: RetentionMessage | null; reason?: string; withdrawn?: number };
export type RetentionCloseOutcome = "dismissed" | "acted";

/** Ask the server which card, if any, may be shown right now. */
export async function fetchRetentionMessage(companyId: string): Promise<RetentionLookup> {
  const call = httpsCallable<{ companyId: string }, RetentionLookup>(functions, "getRetentionMessage");
  const result = await call({ companyId });
  const data = result.data || ({} as RetentionLookup);
  const m = data.message;
  return {
    ok: Boolean(data.ok),
    enabled: Boolean(data.enabled),
    reason: data.reason ? String(data.reason) : "",
    withdrawn: Number(data.withdrawn) || 0,
    message: m && m.id ? {
      id: String(m.id), campaign: String(m.campaign ?? ""), kind: String(m.kind ?? ""), title: String(m.title ?? ""), body: String(m.body ?? ""),
      action: String(m.action ?? ""), target: m.target && typeof m.target === "object" ? { orderId: String(m.target.orderId ?? "") || undefined } : null,
      createdAtMs: Number(m.createdAtMs) || 0
    } : null
  };
}

/** "acted" when the person followed the card; anything else counts as a dismissal (30-day cooldown for that campaign). */
export async function closeRetentionMessage(companyId: string, messageId: string, outcome: RetentionCloseOutcome) {
  const call = httpsCallable<{ companyId: string; messageId: string; outcome: RetentionCloseOutcome }, { ok: boolean; status?: string; reason?: string }>(functions, "dismissRetentionMessage");
  const result = await call({ companyId, messageId, outcome });
  return result.data;
}
