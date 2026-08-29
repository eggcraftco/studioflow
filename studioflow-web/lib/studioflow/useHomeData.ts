"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { getInventorySummary, type InventorySummary } from "@/lib/studioflow/inventory";
import {
  listenToActivityNotifications,
  type StudioActivityNotification,
} from "@/lib/studioflow/notifications";
import {
  DEFAULT_PRODUCTION_STAGES,
  productionStagesFromSettings,
  type ProductionStage,
} from "@/lib/studioflow/production";
import { loadWorkspaceBlockHeadings, type HeadingItem } from "@/lib/studioflow/blockHeadings";
import { detectRecurringSpends, monthlyFixedTotal, type BankVendor } from "@/lib/studioflow/bankInsights";
import { listenToKeepNotes, type StudioKeepNote } from "@/lib/studioflow/notes";
import {
  loadDashboardCounts,
  loadDashboardFinanceOrders,
  loadRecentOrders,
  loadScheduleOrders,
  loadWorkspaceClientFiles,
  loadWorkspaceCustomers,
  loadWorkspaceProductionStages,
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
  /** Who the money moved to or from, as the feed named it. */
  name: string;
  /** The raw pair the recurring detector groups on. */
  counterparty: string;
  description: string;
  currency: string;
  /** "YYYY-MM-DD", the shape the shared bank helpers read. */
  bookingDay: string;
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
  activity: StudioActivityNotification[];
  productionStages: ProductionStage[];
  productionSteps: HeadingItem[];
  notes: StudioKeepNote[];
  /** The newest lastSyncedAt across the workspace's connections. This is the
   *  real signal — a live snapshot only says the listener fired, not that the
   *  bank actually handed anything over. */
  bankLastSync: Date | null;
  /** True when a linked connection is reporting anything other than a clean sync. */
  bankNeedsAttention: boolean;
  /** What the workspace pays every month on repeat, by the same rule the
   *  Banking screen uses — detected from the feed plus the owner's own vendors. */
  bankMonthlyFixed: number;
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

export function useHomeData(workspace: WorkspaceContext | null, uid: string, email = ""): HomeData {
  const [status, setStatus] = useState<Record<HomeDomain, HomeDomainStatus>>(EMPTY_STATUS);
  const [counts, setCounts] = useState<DashboardCounts | null>(null);
  const [financeOrders, setFinanceOrders] = useState<DashboardFinanceOrder[]>([]);
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [scheduleOrders, setScheduleOrders] = useState<ScheduleOrderItem[]>([]);
  const [customers, setCustomers] = useState<CustomerDirectoryItem[]>([]);
  const [inventory, setInventory] = useState<InventorySummary | null>(null);
  const [files, setFiles] = useState<ClientFileListItem[]>([]);
  const [bankTransactions, setBankTransactions] = useState<HomeBankTx[]>([]);
  const [activity, setActivity] = useState<StudioActivityNotification[]>([]);
  const [productionStages, setProductionStages] = useState<ProductionStage[]>(DEFAULT_PRODUCTION_STAGES);
  const [productionSteps, setProductionSteps] = useState<HeadingItem[]>([]);
  const [notes, setNotes] = useState<StudioKeepNote[]>([]);
  const [bankLastSync, setBankLastSync] = useState<Date | null>(null);
  const [bankNeedsAttention, setBankNeedsAttention] = useState(false);
  const [bankVendors, setBankVendors] = useState<BankVendor[]>([]);
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

    // The production stage is never stored — it is derived from the order's own
    // steps against the workspace's own stages, by the one rule the Production
    // screen uses. Matching order.status against a hard-coded list is a second,
    // incompatible definition, and it read zero for every stage.
    (async () => {
      const [rawStages, headings] = await Promise.all([
        loadWorkspaceProductionStages(workspaceId).catch(() => null),
        loadWorkspaceBlockHeadings(workspace).catch(() => null),
      ]);
      if (cancelled.current) return;
      setProductionStages(productionStagesFromSettings(rawStages));
      setProductionSteps((headings?.customSteps ?? []).filter((step) => Boolean(step.title?.trim())));
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
        // The callable answers { ok, summary } — the summary is nested. Reading
        // the wrapper as if it were the summary gave every field undefined, and
        // cash(undefined) still prints a currency zero, so the card looked fine
        // while showing nothing. No cast here: let the compiler check the shape.
        const response = await getInventorySummary(workspace);
        if (cancelled.current) return;
        setInventory(response.summary ?? null);
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
              name: String(data.counterparty || data.description || ""),
              counterparty: String(data.counterparty || ""),
              description: String(data.description || ""),
              currency: String(data.currency || ""),
              bookingDay: typeof raw === "string" ? raw : (bookingDate ? bookingDate.toISOString().slice(0, 10) : ""),
              amount: Number(data.amount ?? 0),
              bookingDate,
              categoryId: String(data.categoryId ?? ""),
              hasReceipt: Boolean(data.receiptUrl || data.receiptFileId),
              reviewed: data.reviewed === true || Boolean(data.categoryId),
            };
          }),
        );
        setDomain("bank", "ready");
      },
      () => setDomain("bank", "denied"),
    );
    return () => unsubscribe();
  }, [workspaceId, canSeeBank, setDomain, reloadKey]);

  // Recent activity is the workspace's own notification stream, live, and
  // already filtered to what this user is a recipient of — §12 is explicit that
  // activity must never widen what someone can see.
  useEffect(() => {
    if (!workspace?.id) return;
    return listenToActivityNotifications(workspace, uid, email, setActivity);
  }, [workspace, uid, email]);

  // §13: the Notes card is for notes — the ones in the Notes app, not the free
  // text typed on an order. Live, and per-user by path.
  useEffect(() => {
    if (!workspaceId || !uid) return;
    return listenToKeepNotes(workspaceId, uid, setNotes);
  }, [workspaceId, uid]);

  // Connection health, from the connections themselves.
  useEffect(() => {
    if (!workspaceId || !canSeeBank) return;
    return onSnapshot(
      collection(db, "companies", workspaceId, "bankConnections"),
      (snap) => {
        let newest: Date | null = null;
        let unhealthy = false;
        snap.docs.forEach((docSnap) => {
          const data = docSnap.data() as Record<string, unknown>;
          const raw = data.lastSyncedAt as { toDate?: () => Date } | undefined;
          const synced = raw && typeof raw.toDate === "function" ? raw.toDate() : null;
          if (synced && (!newest || synced > newest)) newest = synced;
          if (String(data.status || "") === "linked" && String(data.syncState || "ok") !== "ok") unhealthy = true;
        });
        setBankLastSync(newest);
        setBankNeedsAttention(unhealthy);
      },
      () => {},
    );
  }, [workspaceId, canSeeBank]);

  useEffect(() => {
    if (!workspaceId || !canSeeBank) return;
    return onSnapshot(
      collection(db, "companies", workspaceId, "bankVendors"),
      (snap) => setBankVendors(snap.docs.map((docSnap) => {
        const data = docSnap.data() as Record<string, unknown>;
        return {
          id: docSnap.id,
          name: String(data.name || ""),
          keys: Array.isArray(data.keys) ? (data.keys as string[]) : [],
          cadence: (["weekly", "monthly", "yearly"].includes(String(data.cadence))
            ? String(data.cadence) : "monthly") as BankVendor["cadence"],
        };
      })),
      () => setBankVendors([]),
    );
  }, [workspaceId, canSeeBank]);

  const bankMonthlyFixed = useMemo(
    () => monthlyFixedTotal(detectRecurringSpends(
      bankTransactions.map((tx) => ({
        id: tx.id, amount: tx.amount, currency: tx.currency,
        bookingDate: tx.bookingDay, counterparty: tx.counterparty, description: tx.description,
      })),
      bankVendors,
    )),
    [bankTransactions, bankVendors],
  );

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
      activity,
      productionStages,
      productionSteps,
      notes,
      bankLastSync,
      bankNeedsAttention,
      bankMonthlyFixed,
      lastLoadedAtMs,
      offline,
      reload,
    }),
    [
      status, counts, financeOrders, orders, scheduleOrders, customers,
      inventory, files, bankTransactions, activity, productionStages, productionSteps, notes,
      bankLastSync, bankNeedsAttention, bankMonthlyFixed, lastLoadedAtMs, offline, reload,
    ],
  );
}
