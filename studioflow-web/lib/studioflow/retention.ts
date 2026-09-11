// The retention nudge's client side: read the workspace's open in-app messages
// (written only by the server's sweep) and close one through the callable. The
// rules let any member read `retentionMessages`; nothing here writes Firestore.
import { collection, onSnapshot, query, where, type Unsubscribe } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase/client";

export type RetentionMessage = {
  id: string;
  campaign: string;
  kind: string;
  title: string;
  body: string;
  action: string;
  target: { orderId?: string } | null;
  createdAtMs: number;
  status: string;
};

export type RetentionCloseOutcome = "dismissed" | "acted";

/** Newest first; only messages the server still considers open. */
export function subscribeOpenRetentionMessages(
  companyId: string,
  onChange: (messages: RetentionMessage[]) => void,
  onError?: (error: unknown) => void
): Unsubscribe {
  const open = query(collection(db, "companies", companyId, "retentionMessages"), where("status", "==", "open"));
  return onSnapshot(
    open,
    (snapshot) => {
      const rows = snapshot.docs.map((doc) => {
        const data = doc.data() as Partial<RetentionMessage>;
        return {
          id: doc.id,
          campaign: String(data.campaign ?? ""),
          kind: String(data.kind ?? ""),
          title: String(data.title ?? ""),
          body: String(data.body ?? ""),
          action: String(data.action ?? ""),
          target: data.target && typeof data.target === "object" ? { orderId: String((data.target as { orderId?: string }).orderId ?? "") || undefined } : null,
          createdAtMs: Number(data.createdAtMs) || 0,
          status: String(data.status ?? "")
        };
      });
      rows.sort((a, b) => b.createdAtMs - a.createdAtMs);
      onChange(rows);
    },
    (error) => onError?.(error)
  );
}

/** "acted" when the person followed the card; anything else counts as a dismissal (30-day cooldown for that campaign). */
export async function closeRetentionMessage(companyId: string, messageId: string, outcome: RetentionCloseOutcome) {
  const call = httpsCallable<{ companyId: string; messageId: string; outcome: RetentionCloseOutcome }, { ok: boolean; status?: string; reason?: string }>(functions, "dismissRetentionMessage");
  const result = await call({ companyId, messageId, outcome });
  return result.data;
}
