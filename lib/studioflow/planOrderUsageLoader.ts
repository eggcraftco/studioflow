import { collection, getCountFromServer, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase/client";
import { combinePlanOrderCounts, type PlanOrderUsage } from "@/lib/studioflow/planOrderUsage";

type PlanUsageResponse = {
  ok?: boolean;
  usage?: { activeOrderCount?: unknown; orderCount?: unknown; storeHistoryOrderCount?: unknown };
  limits?: { orderLimit?: unknown };
};

/**
 * Where the numbers come from:
 *
 * - Limited plan (Free): the ACTIVE figure is getWorkspacePlanUsage's
 *   `usage.activeOrderCount` — the very countActiveOrders() the order-create
 *   guard reads, so the screen and the limit cannot disagree.
 * - Unlimited plan: that callable skips the scan and returns the TOTAL in
 *   `activeOrderCount` (functions/index.js workspaceBillingUsage, live archive
 *   rev getworkspaceplanusage-00105), so it cannot be used. The same rule is
 *   counted here from four exact count aggregates instead (planOrderUsage.ts
 *   combinePlanOrderCounts). A server field that always carries the real active
 *   count would make this branch unnecessary.
 * - Limited plan and the callable fails: no active figure (the screen shows
 *   "—"). The client cannot see the server-only Etsy exemption, so its own
 *   count would claim a limit the server does not (ET-E3 b2).
 *
 * TOTAL is always the client count: the callable's `orderCount` includes Trash.
 */
export async function loadPlanOrderUsage(companyId: string, orderLimit: number | null): Promise<PlanOrderUsage> {
  const orders = collection(db, "siparisler");
  const base = where("companyId", "==", companyId);
  const deleted = where("isDeleted", "==", true);
  const delivered = where("isDelivered", "==", true);
  const [all, deletedCount, deliveredCount, both] = await Promise.all([
    getCountFromServer(query(orders, base)),
    getCountFromServer(query(orders, base, deleted)),
    getCountFromServer(query(orders, base, delivered)),
    getCountFromServer(query(orders, base, deleted, delivered))
  ]);
  const local = combinePlanOrderCounts({
    all: all.data().count,
    deleted: deletedCount.data().count,
    delivered: deliveredCount.data().count,
    deletedAndDelivered: both.data().count
  });

  if (orderLimit == null) return { ...local, limit: null, source: "client", storeHistory: null };

  // ET-E3 b2 (24 Oct 2026): on a limited plan the client never shows its own count against the limit. It cannot
  // see which Etsy orders the server leaves out (server-only rows), so a workspace with 202 past Etsy orders would
  // read "211 / 10" here while the server says 9. No server answer -> no active figure (the screens show "—").
  try {
    const callable = httpsCallable<{ companyId: string }, PlanUsageResponse>(functions, "getWorkspacePlanUsage");
    const response = await callable({ companyId });
    const serverActive = Number(response.data?.usage?.activeOrderCount);
    const serverLimitRaw = response.data?.limits?.orderLimit;
    const serverLimit = serverLimitRaw == null ? null : Number(serverLimitRaw);
    // Only trust the active figure when the server also says a limit applies —
    // on an unlimited plan its activeOrderCount is the total.
    if (response.data?.ok !== false && Number.isFinite(serverActive) && serverLimit != null && Number.isFinite(serverLimit)) {
      const history = Number(response.data?.usage?.storeHistoryOrderCount);
      return {
        active: Math.max(0, Math.floor(serverActive)), total: local.total, limit: serverLimit, source: "server",
        storeHistory: Number.isFinite(history) && history >= 0 ? Math.floor(history) : null
      };
    }
  } catch (error) {
    console.warn("getWorkspacePlanUsage failed; no active figure is shown without the server:", error);
  }
  throw new Error("The plan's active-order figure comes from the server and is not available right now.");
}
