import { collection, getCountFromServer, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase/client";
import { combinePlanOrderCounts, type PlanOrderUsage } from "@/lib/studioflow/planOrderUsage";

type PlanUsageResponse = {
  ok?: boolean;
  usage?: { activeOrderCount?: unknown; orderCount?: unknown };
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
 * - If the callable fails, the client count stands in, so the screen never
 *   shows nothing.
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

  if (orderLimit == null) return { ...local, limit: null, source: "client" };

  try {
    const callable = httpsCallable<{ companyId: string }, PlanUsageResponse>(functions, "getWorkspacePlanUsage");
    const response = await callable({ companyId });
    const serverActive = Number(response.data?.usage?.activeOrderCount);
    const serverLimitRaw = response.data?.limits?.orderLimit;
    const serverLimit = serverLimitRaw == null ? null : Number(serverLimitRaw);
    // Only trust the active figure when the server also says a limit applies —
    // on an unlimited plan its activeOrderCount is the total.
    if (response.data?.ok !== false && Number.isFinite(serverActive) && serverLimit != null && Number.isFinite(serverLimit)) {
      return { active: Math.max(0, Math.floor(serverActive)), total: local.total, limit: serverLimit, source: "server" };
    }
  } catch (error) {
    console.warn("getWorkspacePlanUsage failed; showing the client count:", error);
  }
  return { ...local, limit: orderLimit, source: "client" };
}
