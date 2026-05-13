"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { hiddenMoneyLabel, usePricePrivacy } from "@/components/PricePrivacy";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  loadDashboardFinanceOrders,
  loadWorkspaceContext,
  loadWorkspaceSettingsOverview,
  workspaceAccessAllows,
  type DashboardFinanceOrder,
  type WorkspaceMemberAccessKey,
  type WorkspaceContext,
  type WorkspaceSettingsOverview
} from "@/lib/studioflow/firestore";
import { swiftOrderNetProfit } from "@/lib/studioflow/finance";
import { studioT } from "@/lib/studioflow/language";
import { formatStudioMoney, moneySymbol, type StudioMoneySettings } from "@/lib/studioflow/money";
import { canCreateOrdersForRole, createOrderFromWeb } from "@/lib/studioflow/orders";
import { WEB_SYNC_STATUS_EVENT, type WebSyncState, type WebSyncStatusDetail } from "@/lib/studioflow/syncStatus";

type NavIconName = "orders" | "dashboard" | "schedule" | "customers" | "reply" | "settings";

const NAV_ITEMS: Array<{ href: string; label: string; icon: NavIconName } | { label: string; icon: NavIconName; disabled: true }> = [
  { href: "/orders", label: "Orders", icon: "orders" },
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/schedule", label: "Schedule", icon: "schedule" },
  { href: "/customers", label: "Customers", icon: "customers" },
  { href: "/quick-reply", label: "Quick Reply", icon: "reply" },
  { href: "/settings", label: "Settings", icon: "settings" }
];

const NAV_ACCESS_BY_HREF: Record<string, WorkspaceMemberAccessKey> = {
  "/orders": "orders",
  "/dashboard": "dashboard",
  "/schedule": "schedule",
  "/customers": "customers",
  "/quick-reply": "quickReply",
  "/settings": "settings"
};

const AppShellMountedContext = createContext(false);

let cachedAppShellUserId = "";
let cachedWorkspace: WorkspaceContext | null = null;
let cachedSettings: WorkspaceSettingsOverview | null = null;
let cachedFinanceOrders: DashboardFinanceOrder[] = [];

function hasCachedShellForUser(userId?: string | null) {
  return Boolean(userId && cachedAppShellUserId === userId);
}

function rememberAppShellSnapshot(
  userId: string,
  snapshot: {
    workspace?: WorkspaceContext | null;
    settings?: WorkspaceSettingsOverview | null;
    financeOrders?: DashboardFinanceOrder[];
  }
) {
  cachedAppShellUserId = userId;
  if ("workspace" in snapshot) cachedWorkspace = snapshot.workspace ?? null;
  if ("settings" in snapshot) cachedSettings = snapshot.settings ?? null;
  if ("financeOrders" in snapshot) cachedFinanceOrders = snapshot.financeOrders ?? [];
}

function clearAppShellSnapshot() {
  cachedAppShellUserId = "";
  cachedWorkspace = null;
  cachedSettings = null;
  cachedFinanceOrders = [];
}

function money(value: number, hidden: boolean, settings: StudioMoneySettings) {
  if (hidden) return hiddenMoneyLabel(moneySymbol(settings));
  return formatStudioMoney(value, settings);
}

function memberCanAccess(workspace: WorkspaceContext | null, key: WorkspaceMemberAccessKey) {
  return workspace ? workspaceAccessAllows(workspace.memberAccess, key) : true;
}

function orderInCurrentMonth(order: DashboardFinanceOrder) {
  if (!order.paymentDate) return false;
  const now = new Date();
  return order.paymentDate.getFullYear() === now.getFullYear() && order.paymentDate.getMonth() === now.getMonth();
}

function orderInCurrentYear(order: DashboardFinanceOrder) {
  if (!order.paymentDate) return false;
  return order.paymentDate.getFullYear() === new Date().getFullYear();
}

function syncTitle(state: WebSyncState, language?: string | null) {
  switch (state) {
    case "offline": return studioT("Offline mode", language);
    case "syncing": return studioT("Syncing changes", language);
    case "saving": return studioT("Saving to cloud", language);
    case "saved": return studioT("Saved to cloud", language);
    case "error": return studioT("Cloud sync issue", language);
    default: return studioT("Connecting to cloud", language);
  }
}

function syncIconName(state: WebSyncState): "cloud" | "cloudUpload" | "cloudError" | "wifiOff" {
  if (state === "offline") return "wifiOff";
  if (state === "saving" || state === "syncing") return "cloudUpload";
  if (state === "error") return "cloudError";
  return "cloud";
}

function syncTimeLabel(date: Date | null) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function syncSubtitle(state: WebSyncState, message: string, lastSyncDate: Date | null, language?: string | null) {
  if (state === "offline") {
    return message ? studioT(message, language) : studioT("Offline. Showing saved local data.", language);
  }
  if (state === "saving" || state === "syncing") {
    return message ? studioT(message, language) : studioT("Your latest changes are being sent to the cloud.", language);
  }
  if (state === "saved") {
    const time = syncTimeLabel(lastSyncDate);
    return time ? `${studioT("Saved. Last sync:", language)} ${time}` : studioT("Saved. You can open the same workspace on Mac, iPad and iPhone.", language);
  }
  if (state === "error") {
    return message ? studioT(message, language) : studioT("There was a problem syncing your changes.", language);
  }
  return message ? studioT(message, language) : studioT("Checking cloud connection for shared layout and settings.", language);
}

function ToolbarIcon({ name }: { name: "eye" | "eyeOff" | "cloud" | "cloudUpload" | "cloudError" | "wifiOff" }) {
  const paths = {
    eye: ["M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"],
    eyeOff: ["m3 3 18 18", "M10.6 10.6a2 2 0 0 0 2.8 2.8", "M9.9 4.2A10.7 10.7 0 0 1 12 4c6.5 0 10 8 10 8a17.8 17.8 0 0 1-3.2 4.1", "M6.6 6.6C3.6 8.4 2 12 2 12s3.5 8 10 8c1.2 0 2.3-.2 3.3-.6"],
    cloud: ["M17.5 19H8a5 5 0 1 1 .8-9.9A6.5 6.5 0 0 1 21 12.5 3.5 3.5 0 0 1 17.5 19Z", "m10 14 2 2 4-5"],
    cloudUpload: ["M17.5 19H8a5 5 0 1 1 .8-9.9A6.5 6.5 0 0 1 21 12.5 3.5 3.5 0 0 1 17.5 19Z", "M12 16V9", "m8 13 4-4 4 4"],
    cloudError: ["M17.5 19H8a5 5 0 1 1 .8-9.9A6.5 6.5 0 0 1 21 12.5 3.5 3.5 0 0 1 17.5 19Z", "M12 9v4", "M12 16h.01"],
    wifiOff: ["m3 3 18 18", "M2 8.5A16 16 0 0 1 6.8 5", "M10.7 4.1A16.6 16.6 0 0 1 22 8.5", "M5 13a10 10 0 0 1 4-2.2", "M15 10.8A10 10 0 0 1 19 13", "M8.5 17a5 5 0 0 1 7 0", "M12 20h.01"]
  }[name];

  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths.map(path => <path key={path} d={path} />)}
    </svg>
  );
}

function NavIcon({ name }: { name: NavIconName }) {
  const paths: Record<NavIconName, string[]> = {
    orders: ["M8 6h12", "M8 12h12", "M8 18h12", "M4 6h.01", "M4 12h.01", "M4 18h.01"],
    dashboard: ["M4 20V10", "M10 20V4", "M16 20v-7", "M22 20H2"],
    schedule: ["M7 2v3M17 2v3M4 9h16", "M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z", "M8 13h.01M12 13h.01M16 13h.01"],
    customers: ["M16 11a4 4 0 1 0-8 0", "M3 21a7 7 0 0 1 14 0", "M20 8v6", "M23 11h-6"],
    reply: ["M4 5h16v10H8l-4 4V5Z", "M8 9h8M8 12h5"],
    settings: ["M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z", "M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.9 3.2-.2-.1a1.7 1.7 0 0 0-2 .1 1.7 1.7 0 0 0-.8 1.7V22h-5.8v-.1a1.7 1.7 0 0 0-.8-1.7 1.7 1.7 0 0 0-2-.1l-.2.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1.1H3v-3.8h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.9-3.2.2.1a1.7 1.7 0 0 0 2-.1 1.7 1.7 0 0 0 .8-1.7V2h5.8v.1a1.7 1.7 0 0 0 .8 1.7 1.7 1.7 0 0 0 2 .1l.2-.1L19.8 7l-.1.1A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.5 1.1h.1v3.8h-.1a1.7 1.7 0 0 0-1.5 1.1Z"]
  };

  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name].map(path => <path key={path} d={path} />)}
    </svg>
  );
}

function ToolbarAvatarPlaceholder() {
  return (
    <span className="toolbar-avatar-placeholder" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
        <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
      </svg>
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const shellAlreadyMounted = useContext(AppShellMountedContext);
  if (shellAlreadyMounted) return <>{children}</>;
  return <AppShellFrame>{children}</AppShellFrame>;
}

function AppShellFrame({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { hideNumbers, toggleHideNumbers } = usePricePrivacy();
  const pathname = usePathname();
  const router = useRouter();
  const wideWorkspace = pathname === "/orders" ||
    pathname.startsWith("/orders/") ||
    pathname === "/customers" ||
    pathname === "/schedule" ||
    pathname === "/dashboard" ||
    pathname === "/quick-reply" ||
    pathname === "/settings";
  const cachedShellMatchesUser = hasCachedShellForUser(user?.uid);
  const [workspace, setWorkspace] = useState<WorkspaceContext | null>(() => cachedShellMatchesUser ? cachedWorkspace : null);
  const [settings, setSettings] = useState<WorkspaceSettingsOverview | null>(() => cachedShellMatchesUser ? cachedSettings : null);
  const [financeOrders, setFinanceOrders] = useState<DashboardFinanceOrder[]>(() => cachedShellMatchesUser ? cachedFinanceOrders : []);
  const [cloudSyncState, setCloudSyncState] = useState<WebSyncState>("connecting");
  const [cloudSyncMessage, setCloudSyncMessage] = useState("Connecting to cloud...");
  const [lastCloudSyncDate, setLastCloudSyncDate] = useState<Date | null>(null);
  const [syncInfoOpen, setSyncInfoOpen] = useState(false);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [orderCreateError, setOrderCreateError] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [avatarImageFailed, setAvatarImageFailed] = useState(false);
  const [workspaceLogoFailed, setWorkspaceLogoFailed] = useState(false);

  useEffect(() => {
    if (!user) {
      clearAppShellSnapshot();
      setWorkspace(null);
      setSettings(null);
      setFinanceOrders([]);
      return;
    }

    let cancelled = false;
    const currentUser = user;
    async function run() {
      try {
        const loadedWorkspace = await loadWorkspaceContext(currentUser.uid);
        if (cancelled) return;
        setWorkspace(loadedWorkspace);
        rememberAppShellSnapshot(currentUser.uid, { workspace: loadedWorkspace });

        const canLoadFinance = memberCanAccess(loadedWorkspace, "dashboard") &&
          memberCanAccess(loadedWorkspace, "financialInfo");
        const [loadedOrders, loadedSettings] = await Promise.all([
          canLoadFinance ? loadDashboardFinanceOrders(loadedWorkspace.id) : Promise.resolve([]),
          loadWorkspaceSettingsOverview(loadedWorkspace.id)
        ]);
        if (cancelled) return;
        setFinanceOrders(loadedOrders);
        setSettings(loadedSettings);
        rememberAppShellSnapshot(currentUser.uid, {
          workspace: loadedWorkspace,
          settings: loadedSettings,
          financeOrders: loadedOrders
        });
      } catch {
        if (!cancelled) {
          if (hasCachedShellForUser(currentUser.uid) && cachedWorkspace) {
            setWorkspace(cachedWorkspace);
            setSettings(cachedSettings);
            setFinanceOrders(cachedFinanceOrders);
          } else {
            setWorkspace(null);
            setSettings(null);
            setFinanceOrders([]);
          }
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    try {
      const savedLastSync = window.localStorage.getItem("studioflow-last-cloud-sync");
      if (savedLastSync) {
        const parsed = new Date(savedLastSync);
        if (!Number.isNaN(parsed.getTime())) setLastCloudSyncDate(parsed);
      }
    } catch {
      setLastCloudSyncDate(null);
    }
  }, []);

  useEffect(() => {
    function updateOnlineState() {
      if (!navigator.onLine) {
        setCloudSyncState("offline");
        setCloudSyncMessage("Offline. Showing saved local data.");
        return;
      }

      setCloudSyncState(current => current === "offline" || current === "connecting" ? "saved" : current);
      setCloudSyncMessage(current => current === "Offline. Showing saved local data." || current === "Connecting to cloud..." ? "Saved to cloud." : current);
    }

    updateOnlineState();
    window.addEventListener("online", updateOnlineState);
    window.addEventListener("offline", updateOnlineState);
    return () => {
      window.removeEventListener("online", updateOnlineState);
      window.removeEventListener("offline", updateOnlineState);
    };
  }, []);

  useEffect(() => {
    function handleSyncEvent(event: Event) {
      const detail = (event as CustomEvent<WebSyncStatusDetail>).detail;
      if (!detail?.state) return;

      setCloudSyncState(detail.state);
      setCloudSyncMessage(detail.message || "");

      if (detail.state === "saved") {
        const syncDate = new Date(detail.at || Date.now());
        setLastCloudSyncDate(syncDate);
        try {
          window.localStorage.setItem("studioflow-last-cloud-sync", syncDate.toISOString());
        } catch {
          // Last sync time is only used for the toolbar popover.
        }
      }
    }

    window.addEventListener(WEB_SYNC_STATUS_EVENT, handleSyncEvent);
    return () => window.removeEventListener(WEB_SYNC_STATUS_EVENT, handleSyncEvent);
  }, []);

  useEffect(() => {
    function handleSettingsUpdated(event: Event) {
      const nextSettings = (event as CustomEvent<{ settings?: Partial<WorkspaceSettingsOverview> }>).detail?.settings;
      if (!nextSettings) return;
      setSettings(current => {
        const baseSettings = current ?? (hasCachedShellForUser(user?.uid) ? cachedSettings : null);
        const mergedSettings = baseSettings ? { ...baseSettings, ...nextSettings } : baseSettings;
        if (mergedSettings && user?.uid) rememberAppShellSnapshot(user.uid, { settings: mergedSettings });
        return mergedSettings;
      });
    }

    window.addEventListener("studioflow-settings-updated", handleSettingsUpdated);
    return () => window.removeEventListener("studioflow-settings-updated", handleSettingsUpdated);
  }, [user?.uid]);

  useEffect(() => {
    function handleWorkspaceUpdated(event: Event) {
      const nextWorkspace = (event as CustomEvent<{ workspace?: Partial<WorkspaceContext> }>).detail?.workspace;
      if (!nextWorkspace) return;
      setWorkspace(current => {
        const baseWorkspace = current ?? (hasCachedShellForUser(user?.uid) ? cachedWorkspace : null);
        const mergedWorkspace = baseWorkspace ? { ...baseWorkspace, ...nextWorkspace } : baseWorkspace;
        if (mergedWorkspace && user?.uid) rememberAppShellSnapshot(user.uid, { workspace: mergedWorkspace });
        return mergedWorkspace;
      });
    }

    window.addEventListener("studioflow-workspace-updated", handleWorkspaceUpdated);
    return () => window.removeEventListener("studioflow-workspace-updated", handleWorkspaceUpdated);
  }, [user?.uid]);

  useEffect(() => {
    const storedThemeKey = "studioflow-app-theme";
    const theme = settings?.appTheme;

    if (!theme) {
      if (!document.body.dataset.studioTheme) {
        try {
          const storedTheme = window.localStorage.getItem(storedThemeKey);
          if (storedTheme === "light" || storedTheme === "dark") {
            document.documentElement.dataset.studioTheme = storedTheme;
            document.body.dataset.studioTheme = storedTheme;
          }
        } catch {
          // Theme cache is only used to avoid a brief light/dark flash while settings load.
        }
      }
      return;
    }

    const activeTheme = theme;
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    function applyTheme() {
      const resolvedTheme = activeTheme === "System" ? (media.matches ? "dark" : "light") : activeTheme.toLowerCase();
      if (resolvedTheme !== "light" && resolvedTheme !== "dark") return;
      document.documentElement.dataset.studioTheme = resolvedTheme;
      document.body.dataset.studioTheme = resolvedTheme;
      try {
        window.localStorage.setItem(storedThemeKey, resolvedTheme);
      } catch {
        // Theme cache is non-critical.
      }
    }

    applyTheme();
    if (activeTheme === "System") {
      media.addEventListener("change", applyTheme);
      return () => media.removeEventListener("change", applyTheme);
    }
  }, [settings?.appTheme]);

  useEffect(() => {
    if (!workspace) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setCloudSyncState("offline");
      setCloudSyncMessage("Offline. Showing saved local data.");
      return;
    }
    setCloudSyncState(current => current === "connecting" ? "saved" : current);
    setCloudSyncMessage(current => current === "Connecting to cloud..." ? "Saved to cloud." : current);
  }, [workspace]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    setAvatarImageFailed(false);
  }, [workspace?.currentMemberPhotoURL]);

  useEffect(() => {
    setWorkspaceLogoFailed(false);
  }, [settings?.appLogoUrl]);

  useEffect(() => {
    if (!mobileNavOpen) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileNavOpen(false);
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [mobileNavOpen]);

  const canSeeToolbarFinance = Boolean(
    workspace &&
    memberCanAccess(workspace, "dashboard") &&
    memberCanAccess(workspace, "financialInfo")
  );
  const monthNet = useMemo(
    () => financeOrders.filter(orderInCurrentMonth).reduce((total, order) => total + swiftOrderNetProfit(order), 0),
    [financeOrders]
  );
  const yearNet = useMemo(
    () => financeOrders.filter(orderInCurrentYear).reduce((total, order) => total + swiftOrderNetProfit(order), 0),
    [financeOrders]
  );
  const toolbarAvatarUrl = workspace?.currentMemberPhotoURL ?? "";
  const showToolbarAvatarImage = Boolean(toolbarAvatarUrl && !avatarImageFailed);
  const workspaceLogoUrl = settings?.appLogoUrl?.trim() ?? "";
  const toolbarLogoUrl = workspaceLogoUrl && !workspaceLogoFailed ? workspaceLogoUrl : "/brand/nivadesk-logo.png";
  const canCreateToolbarOrder = Boolean(
    workspace &&
    memberCanAccess(workspace, "orders") &&
    canCreateOrdersForRole(workspace.role) &&
    workspace.entitlements.features.orders_create
  );
  const language = settings?.selectedLanguage ?? "English";
  const t = (text: string) => studioT(text, language);

  function handleOrderCreated(orderId: string) {
    window.dispatchEvent(new CustomEvent("studioflow-order-created", { detail: { orderId } }));
    router.push(`/orders?selectedOrderId=${encodeURIComponent(orderId)}`);
  }

  async function handleAddOrder() {
    setOrderCreateError("");

    if (!workspace) {
      setOrderCreateError(t("Workspace is still loading. Please try again in a moment."));
      return;
    }

    if (!canCreateOrdersForRole(workspace.role)) {
      setOrderCreateError(t("Your workspace role cannot create projects."));
      return;
    }

    if (!workspace.entitlements.features.orders_create) {
      setOrderCreateError(t("Creating projects is not available on this workspace plan."));
      return;
    }

    setCreatingOrder(true);
    try {
      const result = await createOrderFromWeb(workspace);
      handleOrderCreated(result.orderId || "");
    } catch (createError) {
      setOrderCreateError(createError instanceof Error ? createError.message : t("Could not create the project. Please try again."));
    } finally {
      setCreatingOrder(false);
    }
  }

  return (
    <AppShellMountedContext.Provider value={true}>
      <main className="page-shell app-shell-fixed">
        <div className={wideWorkspace ? "shell-container shell-container-wide" : "shell-container"}>
          <header className="app-toolbar app-toolbar-native">
          <div className="toolbar-main">
            <Link href={canSeeToolbarFinance ? "/dashboard" : "/orders"} className="toolbar-brand native-brand" aria-label={canSeeToolbarFinance ? "Dashboard" : "Orders"}>
              <span className="native-brand-logo-frame" aria-label={workspaceLogoUrl ? `${workspace?.name || "Workspace"} logo` : "NivaDesk"}>
                <img
                  src={toolbarLogoUrl}
                  alt=""
                  aria-hidden="true"
                  onError={() => {
                    if (workspaceLogoUrl) setWorkspaceLogoFailed(true);
                  }}
                />
              </span>
            </Link>
            {canSeeToolbarFinance ? (
              <div className="toolbar-net-strip" aria-label="Workspace net profit">
                <span>{t("Month Net")} <strong>{money(monthNet, hideNumbers, settings)}</strong></span>
                <span>{t("Year Net")} <strong>{money(yearNet, hideNumbers, settings)}</strong></span>
              </div>
            ) : (
              <div className="toolbar-role-strip" aria-label="Workspace role">
                <span>{t("Workflow Only")}</span>
              </div>
            )}
          </div>

          <nav className={mobileNavOpen ? "toolbar-nav native-toolbar-nav is-open" : "toolbar-nav native-toolbar-nav"} aria-label="Main navigation">
            {NAV_ITEMS.map(item => {
              if ("href" in item && item.href === "/dashboard" && !canSeeToolbarFinance) return null;
              if ("href" in item) {
                const accessKey = NAV_ACCESS_BY_HREF[item.href];
                if (accessKey && !memberCanAccess(workspace, accessKey)) return null;
              }
              if (!("href" in item)) {
                return (
                  <span key={item.label} className="nav-pill native-nav-pill disabled" aria-disabled="true">
                    <NavIcon name={item.icon} />
                    {t(item.label)}
                  </span>
                );
              }

              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link key={item.href} href={item.href} className={active ? "nav-pill native-nav-pill active" : "nav-pill native-nav-pill"}>
                  <NavIcon name={item.icon} />
                  {t(item.label)}
                </Link>
              );
            })}
          </nav>

          <div className="toolbar-account native-toolbar-actions">
            {canSeeToolbarFinance ? (
              <button
                className={hideNumbers ? "toolbar-icon-button price-privacy-active" : "toolbar-icon-button"}
                type="button"
                title={hideNumbers ? t("Show financial totals") : t("Hide financial totals")}
                aria-label={hideNumbers ? t("Show financial totals") : t("Hide financial totals")}
                onClick={toggleHideNumbers}
              >
                <ToolbarIcon name={hideNumbers ? "eyeOff" : "eye"} />
              </button>
            ) : null}
            <span className="toolbar-sync-wrap">
              <button
                className={`toolbar-icon-button cloud-state-${cloudSyncState}`}
                type="button"
                title={syncTitle(cloudSyncState, language)}
                aria-label={syncTitle(cloudSyncState, language)}
                onClick={() => setSyncInfoOpen(open => !open)}
              >
                <ToolbarIcon name={syncIconName(cloudSyncState)} />
              </button>
              {syncInfoOpen ? (
                <span className="toolbar-sync-popover" role="status">
                  <strong>{syncTitle(cloudSyncState, language)}</strong>
                  <span>{syncSubtitle(cloudSyncState, cloudSyncMessage, lastCloudSyncDate, language)}</span>
                </span>
              ) : null}
            </span>
            {canCreateToolbarOrder ? (
              <button
                className="button native-add-order"
                type="button"
                disabled={creatingOrder}
                title={t("Add Project")}
                onClick={handleAddOrder}
              >
                <span>{creatingOrder ? t("Creating...") : `+ ${t("Add Project")}`}</span>
              </button>
            ) : null}
            <button
              className="toolbar-avatar"
              type="button"
              title={t("Account")}
              aria-label={t("Account")}
              onClick={() => router.push("/settings?section=account")}
            >
              {showToolbarAvatarImage ? (
                <img src={toolbarAvatarUrl} alt="" onError={() => setAvatarImageFailed(true)} />
              ) : (
                <ToolbarAvatarPlaceholder />
              )}
            </button>
            <button
              className={mobileNavOpen ? "toolbar-menu-button is-open" : "toolbar-menu-button"}
              type="button"
              aria-label={mobileNavOpen ? t("Close menu") : t("Open menu")}
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen(open => !open)}
            >
              <span />
              <span />
              <span />
            </button>
          </div>
          </header>
          {mobileNavOpen ? (
            <button
              className="mobile-nav-scrim"
              type="button"
              aria-label={t("Close menu")}
              onClick={() => setMobileNavOpen(false)}
            />
          ) : null}
          <div className="app-shell-scroll-area">
            {orderCreateError ? <p className="layout-error toolbar-action-message">{orderCreateError}</p> : null}
            {children}
          </div>
        </div>
      </main>
    </AppShellMountedContext.Provider>
  );
}
