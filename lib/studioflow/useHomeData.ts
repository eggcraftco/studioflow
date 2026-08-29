"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { getInventorySummary, type InventorySummary } from "@/lib/studioflow/inventory";
import {
  loadDashboardCounts,
  loadDashboardFinanceOrders,
  loadRecentOrders,
  loadScheduleOrders,
  loadWorkspaceClientFiles,
  loadWorkspaceCustomers,
  workspaceAccessAllows,
  type ClientFileListItem,
  type CustomerDirectoryItem,
  type DashboardCounts,
  type DashboardFinanceOrder,
  type OrderListItem,
  type ScheduleOrderItem,
  type WorkspaceContext,
} from "@/lib/studioflow/firestore";

/**
 * One load for the whole Home screen, sliced per card.
 *
 * §19 asks for a per-card query with its own cache, and for a shared layer so
 * the same data is not fetched twice when several cards need it. Orders alone
 * feed Money, Orders & production, Schedule, Recent activity and Customers —
 * five separate queries for one collection would be five times the cost for
 * exactly the same rows. So the fetch is shared and the STATUS is per domain:
 * banking failing leaves the rest of Home working, which is what §18 is after.
 */

export type HomeDomain = "orders" | "customers" | "inventory" | "files" | "bank";

export type HomeDomainStatus = "loading" | "ready" | "error" | "denied";

export type HomeBankTx = {
  id: string;
  amount: number;
  bookingDate: Date | null;
  categoryId: string;
  hasReceipt: boolean;
  reviewed: boolean;
};

export type HomeData = {
  status: Record<HomeDomain, HomeDomainStatus>;
  counts: DashboardCounts | null;
  financeOrders: DashboardFinanceOrder[];
  orders: OrderListItem[];
  scheduleOrders: ScheduleOrderItem[];
  customers: CustomerDirectoryItem[];
  inventory: InventorySummary | null;
  files: ClientFileListItem[];
  bankTransactions: HomeBankTx[];
  bankLastSync: Date | null;
  lastLoadedAtMs: number;
  offline: boolean;
  reload: (domain?: HomeDomain) => void;
};

const EMPTY_STATUS: Record<HomeDomain, HomeDomainStatus> = {
  orders: "loading",
  customers: "loading",
  inventory: "loading",
  files: "loading",
  bank: "loading",
};

export function useHomeData(workspace: WorkspaceContext | null, uid: string): HomeData {
  const [status, setStatus] = useState<Record<HomeDomain, HomeDomainStatus>>(EMPTY_STATUS);
  const [counts, setCounts] = useState<DashboardCounts | null>(null);
  const [financeOrders, setFinanceOrders] = useState<DashboardFinanceOrder[]>([]);
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [scheduleOrders, setScheduleOrders] = useState<ScheduleOrderItem[]>([]);
  const [customers, setCustomers] = useState<CustomerDirectoryItem[]>([]);
  const [inventory, setInventory] = useState<InventorySummary | null>(null);
  const [files, setFiles] = useState<ClientFileListItem[]>([]);
  const [bankTransactions, setBankTransactions] = useState<HomeBankTx[]>([]);
  const [bankLastSync, setBankLastSync] = useState<Date | null>(null);
  const [lastLoadedAtMs, setLastLoadedAtMs] = useState(0);
  const [offline, setOffline] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const cancelled = useRef(false);

  const workspaceId = workspace?.id ?? "";

  // Offline is a card state, not a failure: cached data plus a label (§18).
  useEffect(() => {
    function online() { setOffline(false); }
    function down() { setOffline(true); }
    setOffline(typeof navigator !== "undefined" && navigator.onLine === false);
    window.addEventListener("online", online);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", down);
    };
  }, []);

  const setDomain = useCallback((domain: HomeDomain, next: HomeDomainStatus) => {
    setStatus((current) => (current[domain] === next ? current : { ...current, [domain]: next }));
  }, []);

  useEffect(() => {
    cancelled.current = false;
    if (!workspaceId || !workspace) return;

    // Orders — the shared spine. Counts and the two order shapes come together
    // because every one of them is read from the same collection.
    (async () => {
      setDomain("orders", "loading");
      try {
        const [nextCounts, nextFinance, nextOrders, nextSchedule] = await Promise.all([
          loadDashboardCounts(workspaceId),
          loadDashboardFinanceOrders(workspaceId),
          loadRecentOrders(workspaceId, workspace, uid),
          loadScheduleOrders(workspaceId, workspace, uid),
        ]);
        if (cancelled.current) return;
        setCounts(nextCounts);
        setFinanceOrders(nextFinance);
        setOrders(nextOrders);
        setScheduleOrders(nextSchedule);
        setLastLoadedAtMs(Date.now());
        setDomain("orders", "ready");
      } catch {
        if (!cancelled.current) setDomain("orders", "error");
      }
    })();

    (async () => {
      if (!workspaceAccessAllows(workspace.memberAccess, "customers")) {
        setDomain("customers", "denied");
        return;
      }
      setDomain("customers", "loading");
      try {
        const next = await loadWorkspaceCustomers(workspaceId);
        if (cancelled.current) return;
        setCustomers(next);
        setDomain("customers", "ready");
      } catch {
        if (!cancelled.current) setDomain("customers", "error");
      }
    })();

    (async () => {
      setDomain("inventory", "loading");
      try {
        const next = await getInventorySummary(workspace);
        if (cancelled.current) return;
        setInventory(next as InventorySummary);
        setDomain("inventory", "ready");
      } catch {
        if (!cancelled.current) setDomain("inventory", "error");
      }
    })();

    (async () => {
      if (!workspaceAccessAllows(workspace.memberAccess, "clientFiles")) {
        setDomain("files", "denied");
        return;
      }
      setDomain("files", "loading");
      try {
        const next = await loadWorkspaceClientFiles(workspaceId, false, workspace, uid);
        if (cancelled.current) return;
        setFiles(next);
        setDomain("files", "ready");
      } catch {
        if (!cancelled.current) setDomain("files", "error");
      }
    })();

    return () => { cancelled.current = true; };
  }, [workspaceId, workspace, uid, reloadKey, setDomain]);

  // Bank is live rather than fetched: the review queue is the whole point of the
  // card, and a stale count is the one number nobody should act on. Rules deny
  // other roles, so an error simply leaves it denied rather than shouting.
  const canSeeBank = Boolean(
    workspace && (workspace.role === "owner" || workspaceAccessAllows(workspace.memberAccess, "bankFeed")),
  );
  useEffect(() => {
    if (!workspaceId || !canSeeBank) {
      setDomain("bank", canSeeBank ? "loading" : "denied");
      return;
    }
    setDomain("bank", "loading");
    const unsubscribe = onSnapshot(
      query(collection(db, "companies", workspaceId, "bankTransactions"), orderBy("bookingDate", "desc")),
      (snap) => {
        setBankTransactions(
          snap.docs.slice(0, 400).map((txDoc) => {
            const data = txDoc.data() as Record<string, unknown>;
            const raw = data.bookingDate;
            const bookingDate =
              raw && typeof (raw as { toDate?: () => Date }).toDate === "function"
                ? (raw as { toDate: () => Date }).toDate()
                : typeof raw === "string" && raw
                  ? new Date(raw)
                  : null;
            return {
              id: txDoc.id,
              amount: Number(data.amount ?? 0),
              bookingDate,
              categoryId: String(data.categoryId ?? ""),
              hasReceipt: Boolean(data.receiptUrl || data.receiptFileId),
              reviewed: data.reviewed === true || Boolean(data.categoryId),
            };
          }),
        );
        setBankLastSync(new Date());
        setDomain("bank", "ready");
      },
      () => setDomain("bank", "denied"),
    );
    return () => unsubscribe();
  }, [workspaceId, canSeeBank, setDomain, reloadKey]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  return useMemo(
    () => ({
      status,
      counts,
      financeOrders,
      orders,
      scheduleOrders,
      customers,
      inventory,
      files,
      bankTransactions,
      bankLastSync,
      lastLoadedAtMs,
      offline,
      reload,
    }),
    [
      status, counts, financeOrders, orders, scheduleOrders, customers,
      inventory, files, bankTransactions, bankLastSync, lastLoadedAtMs, offline, reload,
    ],
  );
}
