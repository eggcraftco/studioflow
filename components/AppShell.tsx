"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { signOut } from "firebase/auth";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { hiddenMoneyLabel, usePricePrivacy } from "@/components/PricePrivacy";
import { useAuth } from "@/lib/auth/AuthProvider";
import { NotificationsDrawer } from "@/components/NotificationsDrawer";
import { auth } from "@/lib/firebase/client";
import {
  loadDashboardFinanceOrders,
  loadWorkspaceContext,
  loadWorkspaceSettingsOverview,
  normalizeWorkspaceRole,
  workspaceAccessAllows,
  type DashboardFinanceOrder,
  type WorkspaceMemberAccessKey,
  type WorkspaceContext,
  type WorkspaceSettingsOverview,
} from "@/lib/studioflow/firestore";
import { swiftOrderNetProfit } from "@/lib/studioflow/finance";
import { studioT } from "@/lib/studioflow/language";
import {
  formatStudioMoney,
  moneySymbol,
  type StudioMoneySettings,
} from "@/lib/studioflow/money";
import {
  canCreateOrdersForRole,
  createOrderFromWeb,
} from "@/lib/studioflow/orders";
import {
  WEB_SYNC_STATUS_EVENT,
  type WebSyncState,
  type WebSyncStatusDetail,
} from "@/lib/studioflow/syncStatus";
import {
  saveWorkspaceOnboardingSkip,
  saveWorkspaceOnboardingTemplate,
  workspaceOnboardingPromptSeed,
  WORKSPACE_ONBOARDING_BUSINESS_TYPES,
} from "@/lib/studioflow/workspaceOnboarding";
import {
  FIRST_PROJECT_GUIDE_EVENT,
  completeFirstProjectGuide,
  getFirstProjectGuideState,
  setFirstProjectGuideState,
  type FirstProjectGuideState,
} from "@/lib/studioflow/firstProjectGuide";

type NavIconName =
  | "orders"
  | "dashboard"
  | "schedule"
  | "customers"
  | "files"
  | "messages"
  | "notes"
  | "reply"
  | "settings"
  | "activity"
  | "account"
  | "signout";

const NAV_ITEMS: Array<
  | { href: string; label: string; icon: NavIconName }
  | { label: string; icon: NavIconName; disabled: true }
> = [
  { href: "/orders", label: "Orders", icon: "orders" },
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/schedule", label: "Schedule", icon: "schedule" },
  { href: "/customers", label: "Customers", icon: "customers" },
  { href: "/files", label: "Files", icon: "files" },
  { href: "/messages", label: "Messages", icon: "messages" },
  { href: "/notes", label: "Notes", icon: "notes" },
  { href: "/quick-reply", label: "AI Replies", icon: "reply" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

const NAV_ACCESS_BY_HREF: Record<string, WorkspaceMemberAccessKey> = {
  "/orders": "orders",
  "/dashboard": "dashboard",
  "/schedule": "schedule",
  "/customers": "customers",
  "/messages": "messages",
  "/notes": "notes",
  "/quick-reply": "quickReply",
  "/settings": "settings",
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
  },
) {
  cachedAppShellUserId = userId;
  if ("workspace" in snapshot) cachedWorkspace = snapshot.workspace ?? null;
  if ("settings" in snapshot) cachedSettings = snapshot.settings ?? null;
  if ("financeOrders" in snapshot)
    cachedFinanceOrders = snapshot.financeOrders ?? [];
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

function memberCanAccess(
  workspace: WorkspaceContext | null,
  key: WorkspaceMemberAccessKey,
) {
  return workspace ? workspaceAccessAllows(workspace.memberAccess, key) : true;
}

function profileInitials(
  displayName: string | null | undefined,
  email: string | null | undefined,
) {
  const cleanName = displayName?.trim() ?? "";
  const cleanEmailName = (email ?? "")
    .split("@")[0]
    .replace(/[._-]+/g, " ")
    .trim();
  const source = cleanName || cleanEmailName || "NivaDesk";
  const parts = source.split(/\s+/).filter(Boolean);
  const initials =
    parts.length >= 2
      ? `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`
      : source.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2);
  return (initials || "ND").toUpperCase();
}

function roleCanSetUpWorkspace(role: string) {
  return ["owner", "admin"].includes(role.trim().toLowerCase());
}

function orderInCurrentMonth(order: DashboardFinanceOrder) {
  if (!order.paymentDate) return false;
  const now = new Date();
  return (
    order.paymentDate.getFullYear() === now.getFullYear() &&
    order.paymentDate.getMonth() === now.getMonth()
  );
}

function orderInCurrentYear(order: DashboardFinanceOrder) {
  if (!order.paymentDate) return false;
  return order.paymentDate.getFullYear() === new Date().getFullYear();
}

function syncTitle(state: WebSyncState, language?: string | null) {
  switch (state) {
    case "offline":
      return studioT("Offline mode", language);
    case "syncing":
      return studioT("Syncing changes", language);
    case "saving":
      return studioT("Saving to cloud", language);
    case "saved":
      return studioT("Saved to cloud", language);
    case "error":
      return studioT("Cloud sync issue", language);
    default:
      return studioT("Connecting to cloud", language);
  }
}

function syncIconName(
  state: WebSyncState,
): "cloud" | "cloudUpload" | "cloudError" | "wifiOff" {
  if (state === "offline") return "wifiOff";
  if (state === "saving" || state === "syncing") return "cloudUpload";
  if (state === "error") return "cloudError";
  return "cloud";
}

function syncTimeLabel(date: Date | null) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function syncSubtitle(
  state: WebSyncState,
  message: string,
  lastSyncDate: Date | null,
  language?: string | null,
) {
  if (state === "offline") {
    return message
      ? studioT(message, language)
      : studioT("Offline. Showing saved local data.", language);
  }
  if (state === "saving" || state === "syncing") {
    return message
      ? studioT(message, language)
      : studioT("Your latest changes are being sent to the cloud.", language);
  }
  if (state === "saved") {
    const time = syncTimeLabel(lastSyncDate);
    return time
      ? `${studioT("Saved. Last sync:", language)} ${time}`
      : studioT(
          "Saved. You can open the same workspace on Mac, iPad and iPhone.",
          language,
        );
  }
  if (state === "error") {
    return message
      ? studioT(message, language)
      : studioT("There was a problem syncing your changes.", language);
  }
  return message
    ? studioT(message, language)
    : studioT(
        "Checking cloud connection for shared layout and settings.",
        language,
      );
}

function ToolbarIcon({
  name,
}: {
  name: "eye" | "eyeOff" | "cloud" | "cloudUpload" | "cloudError" | "wifiOff" | "bell";
}) {
  const paths = {
    eye: [
      "M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z",
      "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
    ],
    eyeOff: [
      "m3 3 18 18",
      "M10.6 10.6a2 2 0 0 0 2.8 2.8",
      "M9.9 4.2A10.7 10.7 0 0 1 12 4c6.5 0 10 8 10 8a17.8 17.8 0 0 1-3.2 4.1",
      "M6.6 6.6C3.6 8.4 2 12 2 12s3.5 8 10 8c1.2 0 2.3-.2 3.3-.6",
    ],
    cloud: [
      "M17.5 19H8a5 5 0 1 1 .8-9.9A6.5 6.5 0 0 1 21 12.5 3.5 3.5 0 0 1 17.5 19Z",
      "m10 14 2 2 4-5",
    ],
    cloudUpload: [
      "M17.5 19H8a5 5 0 1 1 .8-9.9A6.5 6.5 0 0 1 21 12.5 3.5 3.5 0 0 1 17.5 19Z",
      "M12 16V9",
      "m8 13 4-4 4 4",
    ],
    cloudError: [
      "M17.5 19H8a5 5 0 1 1 .8-9.9A6.5 6.5 0 0 1 21 12.5 3.5 3.5 0 0 1 17.5 19Z",
      "M12 9v4",
      "M12 16h.01",
    ],
    wifiOff: [
      "m3 3 18 18",
      "M2 8.5A16 16 0 0 1 6.8 5",
      "M10.7 4.1A16.6 16.6 0 0 1 22 8.5",
      "M5 13a10 10 0 0 1 4-2.2",
      "M15 10.8A10 10 0 0 1 19 13",
      "M8.5 17a5 5 0 0 1 7 0",
      "M12 20h.01",
    ],
    bell: [
      "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9",
      "M13.7 21a2 2 0 0 1-3.4 0",
    ],
  }[name];

  return (
    <svg
      viewBox="0 0 24 24"
      width="17"
      height="17"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths.map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  );
}

function NavIcon({ name }: { name: NavIconName }) {
  const paths: Record<NavIconName, string[]> = {
    orders: [
      "M8 6h12",
      "M8 12h12",
      "M8 18h12",
      "M4 6h.01",
      "M4 12h.01",
      "M4 18h.01",
    ],
    dashboard: ["M4 20V10", "M10 20V4", "M16 20v-7", "M22 20H2"],
    schedule: [
      "M7 2v3M17 2v3M4 9h16",
      "M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z",
      "M8 13h.01M12 13h.01M16 13h.01",
    ],
    customers: [
      "M16 11a4 4 0 1 0-8 0",
      "M3 21a7 7 0 0 1 14 0",
      "M20 8v6",
      "M23 11h-6",
    ],
    files: [
      "M4 5h5l2 2h9a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z",
    ],
    reply: ["M4 5h16v10H8l-4 4V5Z", "M8 9h8M8 12h5"],
    messages: [
      "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z",
    ],
    notes: [
      "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z",
      "M14 3v6h6",
      "M8 13h8",
      "M8 17h5",
    ],
    settings: [
      "M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z",
      "M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.9 3.2-.2-.1a1.7 1.7 0 0 0-2 .1 1.7 1.7 0 0 0-.8 1.7V22h-5.8v-.1a1.7 1.7 0 0 0-.8-1.7 1.7 1.7 0 0 0-2-.1l-.2.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1.1H3v-3.8h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.9-3.2.2.1a1.7 1.7 0 0 0 2-.1 1.7 1.7 0 0 0 .8-1.7V2h5.8v.1a1.7 1.7 0 0 0 .8 1.7 1.7 1.7 0 0 0 2 .1l.2-.1L19.8 7l-.1.1A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.5 1.1h.1v3.8h-.1a1.7 1.7 0 0 0-1.5 1.1Z",
    ],
    activity: [
      "M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9Z",
      "M10.3 21a2 2 0 0 0 3.4 0",
    ],
    account: [
      "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
      "M4 21a8 8 0 0 1 16 0",
    ],
    signout: [
      "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4",
      "M16 17l5-5-5-5",
      "M21 12H9",
    ],
  };

  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name].map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  );
}

function ToolbarAvatarPlaceholder({ initials }: { initials: string }) {
  return (
    <span className="toolbar-avatar-placeholder" aria-hidden="true">
      {initials}
    </span>
  );
}

function WorkspaceOnboardingScreen({
  businessType,
  prompt,
  saving,
  error,
  language,
  onBusinessTypeChange,
  onPromptChange,
  onSmart,
  onStandard,
  onSkip,
}: {
  businessType: string;
  prompt: string;
  saving: boolean;
  error: string;
  language: string;
  onBusinessTypeChange: (value: string) => void;
  onPromptChange: (value: string) => void;
  onSmart: () => void;
  onStandard: () => void;
  onSkip: () => void;
}) {
  const t = (text: string) => studioT(text, language);
  return (
    <section
      className="workspace-onboarding-shell"
      aria-label={t("Set up your workspace")}
    >
      <div className="workspace-onboarding-inner">
        <div className="workspace-onboarding-hero">
          <span className="workspace-onboarding-icon" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m15 4 5 5" />
              <path d="M14 5 3 16l5 5L19 10" />
              <path d="M5 8h.01" />
              <path d="M12 2v4" />
              <path d="M10 4h4" />
              <path d="M19 16v4" />
              <path d="M17 18h4" />
            </svg>
          </span>
          <h1>{t("Set up your workspace")}</h1>
          <p>
            {t(
              "Choose your business type first. NivaDesk can then prepare useful workflow steps, fields, card labels and statuses before you create your first order.",
            )}
          </p>
        </div>

        <div className="workspace-onboarding-card">
          <label className="workspace-onboarding-field">
            <span>{t("Business Type")}</span>
            <select
              value={businessType}
              disabled={saving}
              onChange={(event) => onBusinessTypeChange(event.target.value)}
            >
              {WORKSPACE_ONBOARDING_BUSINESS_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>

          <div className="workspace-onboarding-copy">
            <strong>{t("Optional smart description")}</strong>
            <p>
              {t(
                "You can describe how your work flows, what information you collect from customers, approvals, materials, appointments, deposits, shipping or delivery. If you leave this empty, NivaDesk will use the standard template for the selected business type.",
              )}
            </p>
          </div>

          <textarea
            className="workspace-onboarding-textarea"
            value={prompt}
            disabled={saving}
            placeholder={t(
              "Example: We create custom painted watch dials. We need watch model, dial size, artwork theme, client approval, deposit, painting stage, curing, final photos and shipping.",
            )}
            onChange={(event) => onPromptChange(event.target.value)}
          />

          <div className="workspace-onboarding-actions">
            <button
              className="workspace-onboarding-primary"
              type="button"
              disabled={saving}
              onClick={onSmart}
            >
              {saving ? t("Saving...") : t("Smart Customize")}
            </button>
            <button
              className="workspace-onboarding-secondary"
              type="button"
              disabled={saving}
              onClick={onStandard}
            >
              {t("Use Standard Template")}
            </button>
            <button
              className="workspace-onboarding-skip"
              type="button"
              disabled={saving}
              onClick={onSkip}
            >
              {t("Skip for now")}
            </button>
          </div>
          {error ? <p className="layout-error">{error}</p> : null}
        </div>

        <p className="workspace-onboarding-footer">
          {t(
            "You can change this later from Settings > Workflow > Business Type.",
          )}
        </p>
      </div>
    </section>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const shellAlreadyMounted = useContext(AppShellMountedContext);
  if (shellAlreadyMounted) return <>{children}</>;
  return <AppShellFrame>{children}</AppShellFrame>;
}

function AppShellFrame({ children }: { children: ReactNode }) {
  const { user, language: personalLanguage, theme: personalTheme } = useAuth();
  const { hideNumbers, toggleHideNumbers } = usePricePrivacy();
  const pathname = usePathname();
  const router = useRouter();
  const wideWorkspace =
    pathname === "/orders" ||
    pathname.startsWith("/orders/") ||
    pathname === "/customers" ||
    pathname === "/schedule" ||
    pathname === "/dashboard" ||
    pathname === "/quick-reply" ||
    pathname === "/notes" ||
    pathname === "/messages" ||
    pathname === "/settings";
  const cachedShellMatchesUser = hasCachedShellForUser(user?.uid);
  const [workspace, setWorkspace] = useState<WorkspaceContext | null>(() =>
    cachedShellMatchesUser ? cachedWorkspace : null,
  );
  const [settings, setSettings] = useState<WorkspaceSettingsOverview | null>(
    () => (cachedShellMatchesUser ? cachedSettings : null),
  );
  const [financeOrders, setFinanceOrders] = useState<DashboardFinanceOrder[]>(
    () => (cachedShellMatchesUser ? cachedFinanceOrders : []),
  );
  const [cloudSyncState, setCloudSyncState] =
    useState<WebSyncState>("connecting");
  const [cloudSyncMessage, setCloudSyncMessage] = useState(
    "Connecting to cloud...",
  );
  const [lastCloudSyncDate, setLastCloudSyncDate] = useState<Date | null>(null);
  const [syncInfoOpen, setSyncInfoOpen] = useState(false);
  const [notifDrawerOpen, setNotifDrawerOpen] = useState(false);

  // Anonymous in-app presence heartbeat: powers the admin "In App Now"
  // counter. Random per-session id, no user identifiers, production only.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!user) return;
    if (!window.location.hostname.endsWith("nivadesk.app")) return;

    const ping = () => {
      if (document.visibilityState !== "visible") return;
      try {
        let id = window.sessionStorage.getItem("nv_app_presence");
        if (!id) {
          id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`).toLowerCase();
          window.sessionStorage.setItem("nv_app_presence", id);
        }
        const body = JSON.stringify({ kind: "heartbeat", scope: "app", platform: "web", sessionId: id, path: window.location.pathname });
        if (navigator.sendBeacon) {
          navigator.sendBeacon("https://europe-west2-eggcraft-studio.cloudfunctions.net/recordSiteVisit", new Blob([body], { type: "application/json" }));
        } else {
          void fetch("https://europe-west2-eggcraft-studio.cloudfunctions.net/recordSiteVisit", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true });
        }
      } catch {
        // Presence is best-effort.
      }
    };

    ping();
    const interval = window.setInterval(ping, 30000);
    return () => window.clearInterval(interval);
  }, [user]);
  const [notifications, setNotifications] = useState<
    import("@/lib/studioflow/notifications").StudioActivityNotification[]
  >([]);
  const [notifDismissedLocal, setNotifDismissedLocal] = useState<Set<string>>(new Set());
  const [messageUnreadCount, setMessageUnreadCount] = useState(0);
  const [notesReminderCount, setNotesReminderCount] = useState(0);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [orderCreateError, setOrderCreateError] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [avatarImageFailed, setAvatarImageFailed] = useState(false);
  const [workspaceLogoFailed, setWorkspaceLogoFailed] = useState(false);
  const [onboardingBusinessType, setOnboardingBusinessType] =
    useState("Photography Studio");
  const [onboardingPrompt, setOnboardingPrompt] = useState(
    workspaceOnboardingPromptSeed("Photography Studio"),
  );
  const [onboardingSaving, setOnboardingSaving] = useState(false);
  const [onboardingError, setOnboardingError] = useState("");
  const addProjectButtonRef = useRef<HTMLButtonElement | null>(null);
  const [firstProjectGuide, setFirstProjectGuide] =
    useState<FirstProjectGuideState | null>(null);
  const [addProjectGuidePosition, setAddProjectGuidePosition] = useState<{
    top: number;
    left: number;
  } | null>(null);

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
        rememberAppShellSnapshot(currentUser.uid, {
          workspace: loadedWorkspace,
        });

        const canLoadFinance =
          memberCanAccess(loadedWorkspace, "dashboard") &&
          memberCanAccess(loadedWorkspace, "financialInfo");
        const [loadedOrders, loadedSettings] = await Promise.all([
          canLoadFinance
            ? loadDashboardFinanceOrders(loadedWorkspace.id)
            : Promise.resolve([]),
          loadWorkspaceSettingsOverview(loadedWorkspace.id),
        ]);
        // loadWorkspaceSettingsOverview already overlays the signed-in
        // user's personal theme/language for every workspace role.
        const resolvedSettings = loadedSettings;
        if (cancelled) return;
        setFinanceOrders(loadedOrders);
        setSettings(resolvedSettings);
        rememberAppShellSnapshot(currentUser.uid, {
          workspace: loadedWorkspace,
          settings: resolvedSettings,
          financeOrders: loadedOrders,
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
      const savedLastSync = window.localStorage.getItem(
        "studioflow-last-cloud-sync",
      );
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

      setCloudSyncState((current) =>
        current === "offline" || current === "connecting" ? "saved" : current,
      );
      setCloudSyncMessage((current) =>
        current === "Offline. Showing saved local data." ||
        current === "Connecting to cloud..."
          ? "Saved to cloud."
          : current,
      );
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
          window.localStorage.setItem(
            "studioflow-last-cloud-sync",
            syncDate.toISOString(),
          );
        } catch {
          // Last sync time is only used for the toolbar popover.
        }
      }
    }

    window.addEventListener(WEB_SYNC_STATUS_EVENT, handleSyncEvent);
    return () =>
      window.removeEventListener(WEB_SYNC_STATUS_EVENT, handleSyncEvent);
  }, []);

  useEffect(() => {
    function handleSettingsUpdated(event: Event) {
      const nextSettings = (
        event as CustomEvent<{ settings?: Partial<WorkspaceSettingsOverview> }>
      ).detail?.settings;
      if (!nextSettings) return;
      setSettings((current) => {
        const baseSettings =
          current ?? (hasCachedShellForUser(user?.uid) ? cachedSettings : null);
        const mergedSettings = baseSettings
          ? { ...baseSettings, ...nextSettings }
          : baseSettings;
        if (mergedSettings && user?.uid)
          rememberAppShellSnapshot(user.uid, { settings: mergedSettings });
        return mergedSettings;
      });
    }

    window.addEventListener(
      "studioflow-settings-updated",
      handleSettingsUpdated,
    );
    return () =>
      window.removeEventListener(
        "studioflow-settings-updated",
        handleSettingsUpdated,
      );
  }, [user?.uid]);

  useEffect(() => {
    function handleWorkspaceUpdated(event: Event) {
      const nextWorkspace = (
        event as CustomEvent<{ workspace?: Partial<WorkspaceContext> }>
      ).detail?.workspace;
      if (!nextWorkspace) return;
      setWorkspace((current) => {
        const baseWorkspace =
          current ??
          (hasCachedShellForUser(user?.uid) ? cachedWorkspace : null);
        const mergedWorkspace = baseWorkspace
          ? { ...baseWorkspace, ...nextWorkspace }
          : baseWorkspace;
        if (mergedWorkspace && user?.uid)
          rememberAppShellSnapshot(user.uid, { workspace: mergedWorkspace });
        return mergedWorkspace;
      });
    }

    window.addEventListener(
      "studioflow-workspace-updated",
      handleWorkspaceUpdated,
    );
    return () =>
      window.removeEventListener(
        "studioflow-workspace-updated",
        handleWorkspaceUpdated,
      );
  }, [user?.uid]);

  useEffect(() => {
    const storedThemeKey = "studioflow-app-theme";
    // Theme is per-user — read the personal theme from auth context, never the
    // workspace-wide settings value, so members keep their own appearance.
    const theme = personalTheme;

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
      const resolvedTheme =
        activeTheme === "System"
          ? media.matches
            ? "dark"
            : "light"
          : activeTheme.toLowerCase();
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
  }, [personalTheme]);

  useEffect(() => {
    if (!workspace) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setCloudSyncState("offline");
      setCloudSyncMessage("Offline. Showing saved local data.");
      return;
    }
    setCloudSyncState((current) =>
      current === "connecting" ? "saved" : current,
    );
    setCloudSyncMessage((current) =>
      current === "Connecting to cloud..." ? "Saved to cloud." : current,
    );
  }, [workspace]);

  useEffect(() => {
    setMobileNavOpen(false);
    setAvatarMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!workspace || !user) {
      setNotifications([]);
      return;
    }
    let cancelled = false;
    let unsub: (() => void) | null = null;
    (async () => {
      const mod = await import("@/lib/studioflow/notifications");
      if (cancelled) return;
      unsub = mod.listenToActivityNotifications(
        workspace,
        user.uid,
        user.email ?? "",
        (items) => setNotifications(items),
      );
    })();
    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, [workspace, user]);

  // Listen to message threads only when the current plan and assigned role
  // are permitted to read Messages. This avoids Firestore permission errors in
  // Free/Lite/Pro workspaces and for Workflow Only members.
  useEffect(() => {
    const role = normalizeWorkspaceRole(workspace?.role);
    const canReadMessages = Boolean(
      workspace &&
      user &&
      workspace.entitlements.features.messages === true &&
      ["owner", "admin", "member", "viewer", "workflow"].includes(role),
    );

    if (!canReadMessages || !workspace || !user) {
      setMessageUnreadCount(0);
      return;
    }

    let cancelled = false;
    let unsub: (() => void) | null = null;
    (async () => {
      const mod = await import("@/lib/studioflow/messages");
      if (cancelled) return;
      unsub = mod.listenToMessageThreads(workspace, user.uid, (threads) => {
        setMessageUnreadCount(threads.filter((t) => t.isUnread).length);
      });
    })();
    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, [workspace, user]);

  useEffect(() => {
    if (!workspace || !user) {
      setNotesReminderCount(0);
      return;
    }
    let cancelled = false;
    let unsub: (() => void) | null = null;
    (async () => {
      const mod = await import("@/lib/studioflow/notes");
      if (cancelled) return;
      unsub = mod.listenToKeepNotes(workspace.id, user.uid, (items) => {
        const now = Date.now();
        setNotesReminderCount(
          items.filter(
            (n) =>
              !n.isDeleted &&
              !n.isArchived &&
              n.reminderDateMillis != null &&
              (n.reminderDateMillis as number) <= now
          ).length
        );
      });
    })();
    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, [workspace, user]);

  // FCM web push registration (silently no-ops if VAPID not configured)
  useEffect(() => {
    if (!workspace || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const mod = await import("@/lib/studioflow/pushNotifications");
        if (cancelled) return;
        await mod.registerWebPush(workspace, { uid: user.uid, email: user.email });
      } catch {
        /* ignore */
      }
    })();
    return () => { cancelled = true; };
  }, [workspace, user]);

  const notifUnreadCount = useMemo(() => {
    if (!user) return 0;
    return notifications.filter((n) => {
      if (notifDismissedLocal.has(n.id)) return false;
      const uidClean = user.uid;
      const emailClean = (user.email ?? "").toLowerCase();
      if (n.dismissedByMillis[uidClean]) return false;
      if (emailClean && n.dismissedByMillis[emailClean]) return false;
      if (n.readByMillis[uidClean]) return false;
      if (emailClean && n.readByMillis[emailClean]) return false;
      return true;
    }).length;
  }, [notifications, notifDismissedLocal, user]);

  useEffect(() => {
    function refreshFirstProjectGuide() {
      setFirstProjectGuide(getFirstProjectGuideState());
    }

    refreshFirstProjectGuide();
    window.addEventListener(
      FIRST_PROJECT_GUIDE_EVENT,
      refreshFirstProjectGuide,
    );
    window.addEventListener("storage", refreshFirstProjectGuide);
    return () => {
      window.removeEventListener(
        FIRST_PROJECT_GUIDE_EVENT,
        refreshFirstProjectGuide,
      );
      window.removeEventListener("storage", refreshFirstProjectGuide);
    };
  }, []);

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
    memberCanAccess(workspace, "financialInfo"),
  );
  const monthNet = useMemo(
    () =>
      financeOrders
        .filter(orderInCurrentMonth)
        .reduce((total, order) => total + swiftOrderNetProfit(order), 0),
    [financeOrders],
  );
  const yearNet = useMemo(
    () =>
      financeOrders
        .filter(orderInCurrentYear)
        .reduce((total, order) => total + swiftOrderNetProfit(order), 0),
    [financeOrders],
  );
  const toolbarAvatarUrl = workspace?.currentMemberPhotoURL ?? "";
  const showToolbarAvatarImage = Boolean(
    toolbarAvatarUrl && !avatarImageFailed,
  );
  const toolbarAvatarInitials = profileInitials(
    workspace?.currentMemberDisplayName || user?.displayName,
    user?.email,
  );
  const workspaceLogoUrl = settings?.appLogoUrl?.trim() ?? "";
  const showWorkspaceToolbarLogo = Boolean(
    workspaceLogoUrl && !workspaceLogoFailed,
  );
  const toolbarLogoSrc = showWorkspaceToolbarLogo
    ? workspaceLogoUrl
    : "/brand/nivadesk-logo.png";
  const toolbarLogoLabel = showWorkspaceToolbarLogo
    ? `${workspace?.name || "Workspace"} logo`
    : "NivaDesk";
  const canCreateToolbarOrder = Boolean(
    workspace &&
    memberCanAccess(workspace, "orders") &&
    canCreateOrdersForRole(workspace.role) &&
    workspace.entitlements.features.orders_create,
  );
  const language = personalLanguage || settings?.selectedLanguage || "English";
  const t = (text: string) => studioT(text, language);
  const showWorkspaceOnboarding = Boolean(
    user &&
    workspace &&
    settings &&
    !settings.businessOnboardingCompleted &&
    financeOrders.length === 0 &&
    memberCanAccess(workspace, "settings") &&
    roleCanSetUpWorkspace(workspace.role),
  );
  // The "add your first project" guide is only for genuinely new users: no orders
  // yet and the guide not already completed. (Previously `firstProjectGuide === null`
  // made it show for any existing user without local guide state.)
  const showAddProjectGuide = Boolean(
    canCreateToolbarOrder &&
    pathname.startsWith("/orders") &&
    financeOrders.length === 0 &&
    !firstProjectGuide?.completed &&
    (firstProjectGuide === null || firstProjectGuide.step === 1),
  );

  useEffect(() => {
    if (!showWorkspaceOnboarding) return;
    setOnboardingError("");
    setOnboardingBusinessType((current) => current || "Photography Studio");
    setOnboardingPrompt(
      (current) =>
        current ||
        workspaceOnboardingPromptSeed(
          onboardingBusinessType || "Photography Studio",
        ),
    );
  }, [showWorkspaceOnboarding, onboardingBusinessType]);

  useEffect(() => {
    if (!showAddProjectGuide) {
      setAddProjectGuidePosition(null);
      return;
    }

    function updateAddProjectGuidePosition() {
      const rect = addProjectButtonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const bubbleWidth = 360;
      const left = Math.max(
        16,
        Math.min(window.innerWidth - bubbleWidth - 16, rect.left),
      );
      setAddProjectGuidePosition({ top: rect.bottom + 12, left });
    }

    updateAddProjectGuidePosition();
    const frame = window.requestAnimationFrame(updateAddProjectGuidePosition);
    window.addEventListener("resize", updateAddProjectGuidePosition);
    window.addEventListener("scroll", updateAddProjectGuidePosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateAddProjectGuidePosition);
      window.removeEventListener("scroll", updateAddProjectGuidePosition, true);
    };
  }, [showAddProjectGuide]);

  function handleOrderCreated(orderId: string) {
    const currentGuide =
      firstProjectGuide ?? getFirstProjectGuideState() ?? {
        step: 1,
        completed: false,
      };
    // Only kick off the first-project guide on the user's very first project
    // (no existing orders) and when it isn't already completed.
    const isFirstEverProject = financeOrders.length === 0;
    if (isFirstEverProject && !currentGuide.completed && currentGuide.step <= 1) {
      const nextGuide: FirstProjectGuideState = {
        ...currentGuide,
        step: 2,
        orderId,
        completed: false,
      };
      setFirstProjectGuideState(nextGuide);
      setFirstProjectGuide(nextGuide);
    }
    window.dispatchEvent(
      new CustomEvent("studioflow-order-created", { detail: { orderId } }),
    );
    router.push(`/orders?selectedOrderId=${encodeURIComponent(orderId)}`);
  }

  async function handleAddOrder() {
    setOrderCreateError("");

    if (!workspace) {
      setOrderCreateError(
        t("Workspace is still loading. Please try again in a moment."),
      );
      return;
    }

    if (!canCreateOrdersForRole(workspace.role)) {
      setOrderCreateError(t("Your workspace role cannot create projects."));
      return;
    }

    if (!workspace.entitlements.features.orders_create) {
      setOrderCreateError(
        t("Creating projects is not available on this workspace plan."),
      );
      return;
    }

    setCreatingOrder(true);
    try {
      const result = await createOrderFromWeb(workspace);
      handleOrderCreated(result.orderId || "");
    } catch (createError) {
      setOrderCreateError(
        createError instanceof Error
          ? createError.message
          : t("Could not create the project. Please try again."),
      );
    } finally {
      setCreatingOrder(false);
    }
  }

  async function handleToolbarSignOut() {
    setAvatarMenuOpen(false);
    await signOut(auth);
    router.replace("/login");
  }

  async function completeWorkspaceOnboarding(
    action: "smart" | "standard" | "skip",
  ) {
    if (!workspace || !user) return;
    setOnboardingSaving(true);
    setOnboardingError("");
    try {
      if (action === "skip") {
        await saveWorkspaceOnboardingSkip(workspace.id, user.uid);
      } else {
        await saveWorkspaceOnboardingTemplate(
          workspace.id,
          user.uid,
          onboardingBusinessType,
          onboardingPrompt,
          action === "smart",
        );
      }
      setSettings((current) => {
        const mergedSettings = current
          ? { ...current, businessOnboardingCompleted: true }
          : current;
        if (mergedSettings && user?.uid)
          rememberAppShellSnapshot(user.uid, { settings: mergedSettings });
        return mergedSettings;
      });
      window.dispatchEvent(
        new CustomEvent("studioflow-settings-updated", {
          detail: { settings: { businessOnboardingCompleted: true } },
        }),
      );
    } catch (saveError) {
      setOnboardingError(
        saveError instanceof Error
          ? saveError.message
          : t("Workspace setup could not be saved."),
      );
    } finally {
      setOnboardingSaving(false);
    }
  }

  if (showWorkspaceOnboarding) {
    return (
      <AppShellMountedContext.Provider value={true}>
        <WorkspaceOnboardingScreen
          businessType={onboardingBusinessType}
          prompt={onboardingPrompt}
          saving={onboardingSaving}
          error={onboardingError}
          language={language}
          onBusinessTypeChange={(nextType) => {
            setOnboardingBusinessType(nextType);
            setOnboardingPrompt((current) =>
              current.trim()
                ? current
                : workspaceOnboardingPromptSeed(nextType),
            );
            setOnboardingError("");
          }}
          onPromptChange={(nextPrompt) => {
            setOnboardingPrompt(nextPrompt);
            setOnboardingError("");
          }}
          onSmart={() => completeWorkspaceOnboarding("smart")}
          onStandard={() => completeWorkspaceOnboarding("standard")}
          onSkip={() => completeWorkspaceOnboarding("skip")}
        />
      </AppShellMountedContext.Provider>
    );
  }

  return (
    <AppShellMountedContext.Provider value={true}>
      <main className="page-shell app-shell-fixed">
        <div
          className={
            wideWorkspace
              ? "shell-container shell-container-wide"
              : "shell-container"
          }
        >
          <header className="app-toolbar app-toolbar-native">
            <div className="toolbar-main">
              <Link
                href={canSeeToolbarFinance ? "/dashboard" : "/orders"}
                className="toolbar-brand native-brand"
                aria-label={canSeeToolbarFinance ? "Dashboard" : "Orders"}
              >
                <span
                  className="native-brand-logo-frame"
                  aria-label={toolbarLogoLabel}
                >
                  <img
                    src={toolbarLogoSrc}
                    alt=""
                    aria-hidden="true"
                    onError={() => {
                      if (showWorkspaceToolbarLogo)
                        setWorkspaceLogoFailed(true);
                    }}
                  />
                </span>
              </Link>
              {canSeeToolbarFinance ? (
                <div
                  className="toolbar-net-strip"
                  aria-label="Workspace net profit"
                >
                  <span>
                    {t("Month Net")}{" "}
                    <strong>{money(monthNet, hideNumbers, settings)}</strong>
                  </span>
                  <span>
                    {t("Year Net")}{" "}
                    <strong>{money(yearNet, hideNumbers, settings)}</strong>
                  </span>
                </div>
              ) : (
                <div className="toolbar-role-strip" aria-label="Workspace role">
                  <span>{workspace?.roleLabel?.trim() || t("Workflow Only")}</span>
                </div>
              )}
            </div>

            <nav
              className={
                mobileNavOpen
                  ? "toolbar-nav native-toolbar-nav is-open"
                  : "toolbar-nav native-toolbar-nav"
              }
              aria-label="Main navigation"
            >
              {NAV_ITEMS.map((item) => {
                if (
                  "href" in item &&
                  item.href === "/dashboard" &&
                  !canSeeToolbarFinance
                )
                  return null;
                if (
                  "href" in item &&
                  item.href === "/messages" &&
                  workspace?.entitlements.features.messages !== true
                )
                  return null;
                if (
                  "href" in item &&
                  item.href === "/quick-reply" &&
                  workspace?.quickReplyMenuEnabled === false
                )
                  return null;
                if ("href" in item) {
                  const accessKey = NAV_ACCESS_BY_HREF[item.href];
                  if (accessKey && !memberCanAccess(workspace, accessKey))
                    return null;
                }
                if (!("href" in item)) {
                  return (
                    <span
                      key={item.label}
                      className="nav-pill native-nav-pill disabled"
                      aria-disabled="true"
                    >
                      <NavIcon name={item.icon} />
                      {t(item.label)}
                    </span>
                  );
                }

                const active =
                  pathname === item.href ||
                  pathname.startsWith(`${item.href}/`);
                const showMsgBadge = item.href === "/messages" && messageUnreadCount > 0;
                const showNotesBadge = item.href === "/notes" && notesReminderCount > 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={
                      active
                        ? "nav-pill native-nav-pill active"
                        : "nav-pill native-nav-pill"
                    }
                  >
                    <NavIcon name={item.icon} />
                    {t(item.label)}
                    {showMsgBadge && (
                      <span className="nav-pill-badge">
                        {messageUnreadCount > 99 ? "99+" : messageUnreadCount}
                      </span>
                    )}
                    {showNotesBadge && (
                      <span className="nav-pill-badge">
                        {notesReminderCount > 99 ? "99+" : notesReminderCount}
                      </span>
                    )}
                  </Link>
                );
              })}
              <button
                type="button"
                className="nav-pill native-nav-pill native-nav-extra"
                onClick={() => {
                  setMobileNavOpen(false);
                  setNotifDrawerOpen(true);
                }}
              >
                <NavIcon name="activity" />
                {t("Activity")}
                {notifUnreadCount > 0 && (
                  <span className="nav-pill-badge">
                    {notifUnreadCount > 99 ? "99+" : notifUnreadCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                className="nav-pill native-nav-pill native-nav-extra"
                onClick={() => {
                  setMobileNavOpen(false);
                  router.push("/settings?section=account");
                }}
              >
                <NavIcon name="account" />
                {t("Account")}
              </button>
              <span className="native-nav-divider native-nav-extra" aria-hidden="true" />
              <button
                type="button"
                className="nav-pill native-nav-pill native-nav-signout native-nav-extra"
                onClick={() => {
                  setMobileNavOpen(false);
                  void handleToolbarSignOut();
                }}
              >
                <NavIcon name="signout" />
                {t("Sign Out")}
              </button>
            </nav>

            <div className="toolbar-account native-toolbar-actions">
              {canSeeToolbarFinance ? (
                <button
                  className={
                    hideNumbers
                      ? "toolbar-icon-button price-privacy-active"
                      : "toolbar-icon-button"
                  }
                  type="button"
                  title={
                    hideNumbers
                      ? t("Show financial totals")
                      : t("Hide financial totals")
                  }
                  aria-label={
                    hideNumbers
                      ? t("Show financial totals")
                      : t("Hide financial totals")
                  }
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
                  onClick={() => setSyncInfoOpen((open) => !open)}
                >
                  <ToolbarIcon name={syncIconName(cloudSyncState)} />
                </button>
                {syncInfoOpen ? (
                  <span className="toolbar-sync-popover" role="status">
                    <strong>{syncTitle(cloudSyncState, language)}</strong>
                    <span>
                      {syncSubtitle(
                        cloudSyncState,
                        cloudSyncMessage,
                        lastCloudSyncDate,
                        language,
                      )}
                    </span>
                  </span>
                ) : null}
              </span>
              <button
                className="toolbar-icon-button notif-bell-btn"
                type="button"
                title="Notifications"
                aria-label="Notifications"
                onClick={() => setNotifDrawerOpen(true)}
              >
                <ToolbarIcon name="bell" />
                {notifUnreadCount > 0 && (
                  <span className="notif-bell-badge">
                    {notifUnreadCount > 99 ? "99+" : notifUnreadCount}
                  </span>
                )}
              </button>
              {canCreateToolbarOrder ? (
                <button
                  ref={addProjectButtonRef}
                  className={
                    showAddProjectGuide
                      ? "button native-add-order studio-guide-target"
                      : "button native-add-order"
                  }
                  type="button"
                  disabled={creatingOrder}
                  title={t("Add Project")}
                  onClick={handleAddOrder}
                >
                  <span className="native-add-order-plus" aria-hidden="true">+</span>
                  <span className="native-add-order-label">
                    {creatingOrder ? t("Creating...") : t("Add Project")}
                  </span>
                </button>
              ) : null}
              <span className="toolbar-avatar-wrap">
                <button
                  className="toolbar-avatar"
                  type="button"
                  title={t("Account")}
                  aria-label={t("Account")}
                  aria-expanded={avatarMenuOpen}
                  onClick={() => setAvatarMenuOpen((open) => !open)}
                >
                  {showToolbarAvatarImage ? (
                    <img
                      src={toolbarAvatarUrl}
                      alt=""
                      onError={() => setAvatarImageFailed(true)}
                    />
                  ) : (
                    <ToolbarAvatarPlaceholder
                      initials={toolbarAvatarInitials}
                    />
                  )}
                </button>
                {avatarMenuOpen ? (
                  <span className="toolbar-avatar-menu" role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setAvatarMenuOpen(false);
                        router.push("/settings?section=account");
                      }}
                    >
                      {t("Account")}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="danger"
                      onClick={handleToolbarSignOut}
                    >
                      {t("Sign Out")}
                    </button>
                  </span>
                ) : null}
              </span>
              <button
                className={
                  mobileNavOpen
                    ? "toolbar-menu-button is-open"
                    : "toolbar-menu-button"
                }
                type="button"
                aria-label={mobileNavOpen ? t("Close menu") : t("Open menu")}
                aria-expanded={mobileNavOpen}
                onClick={() => setMobileNavOpen((open) => !open)}
              >
                <span />
                <span />
                <span />
                {notifUnreadCount > 0 ? (
                  <span className="toolbar-menu-badge" aria-hidden="true">
                    {notifUnreadCount > 99 ? "99+" : notifUnreadCount}
                  </span>
                ) : null}
              </button>
            </div>
          </header>
          {showAddProjectGuide ? (
            <div
              role="dialog"
              aria-live="polite"
              style={{
                position: "fixed",
                top: addProjectGuidePosition?.top ?? 96,
                left: addProjectGuidePosition?.left ?? 24,
                width: "min(360px, calc(100vw - 32px))",
                zIndex: 9999,
                padding: "18px",
                borderRadius: "22px",
                border: "4px solid #2563eb",
                background: "color-mix(in srgb, var(--surface) 92%, #dbeafe)",
                boxShadow: "0 24px 60px rgba(37, 99, 235, 0.36)",
                color: "var(--text)",
                pointerEvents: "auto",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  borderRadius: "999px",
                  padding: "4px 12px",
                  marginBottom: "10px",
                  background: "#2563eb",
                  color: "white",
                  fontWeight: 800,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  fontSize: "0.78rem",
                }}
              >
                {t("Step 1 / 6")}
              </span>
              <button
                type="button"
                aria-label={t("Skip")}
                onClick={() =>
                  completeFirstProjectGuide(
                    firstProjectGuide ?? { step: 1, completed: false },
                  )
                }
                style={{
                  position: "absolute",
                  top: "12px",
                  right: "12px",
                  width: "30px",
                  height: "30px",
                  borderRadius: "999px",
                  border: 0,
                  background:
                    "color-mix(in srgb, var(--muted) 18%, transparent)",
                  color: "var(--muted)",
                  fontSize: "20px",
                  cursor: "pointer",
                }}
              >
                ×
              </button>
              <strong
                style={{
                  display: "block",
                  fontSize: "1.35rem",
                  marginBottom: "8px",
                }}
              >
                {t("Start with Add Project")}
              </strong>
              <p
                style={{
                  margin: 0,
                  color: "var(--muted)",
                  fontSize: "1rem",
                  lineHeight: 1.45,
                }}
              >
                {t(
                  "Create your first project. We will then show you the most important cards one by one.",
                )}
              </p>
            </div>
          ) : null}
          {mobileNavOpen ? (
            <button
              className="mobile-nav-scrim"
              type="button"
              aria-label={t("Close menu")}
              onClick={() => setMobileNavOpen(false)}
            />
          ) : null}
          <div className="app-shell-scroll-area">
            {orderCreateError ? (
              <p className="layout-error toolbar-action-message">
                {orderCreateError}
              </p>
            ) : null}
            {children}
          </div>
        </div>
      </main>
      <NotificationsDrawer
        open={notifDrawerOpen}
        workspace={workspace}
        uid={user?.uid ?? ""}
        email={user?.email ?? ""}
        notifications={notifications}
        dismissedLocally={notifDismissedLocal}
        onClose={() => setNotifDrawerOpen(false)}
        onLocalDismiss={(ids) => setNotifDismissedLocal((prev) => {
          const next = new Set(prev);
          for (const id of ids) next.add(id);
          return next;
        })}
      />
      <style jsx global>{`
        .notif-bell-btn { position: relative; }
        .notif-bell-badge { position: absolute; top: -4px; right: -4px; background: #ef4444; color: white; font-size: 10px; font-weight: 700; padding: 1px 5px; border-radius: 999px; min-width: 16px; text-align: center; line-height: 1.4; }
        .nav-pill-badge { background: #ef4444; color: white; font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 999px; margin-left: 4px; line-height: 1.4; }
      `}</style>
    </AppShellMountedContext.Provider>
  );
}
