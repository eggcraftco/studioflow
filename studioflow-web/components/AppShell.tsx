"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { signOut } from "firebase/auth";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { hiddenMoneyLabel, usePricePrivacy } from "@/components/PricePrivacy";
import { useAuth } from "@/lib/auth/AuthProvider";
import { auth } from "@/lib/firebase/client";
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
import {
  saveWorkspaceOnboardingSkip,
  saveWorkspaceOnboardingTemplate,
  workspaceOnboardingPromptSeed,
  WORKSPACE_ONBOARDING_BUSINESS_TYPES
} from "@/lib/studioflow/workspaceOnboarding";

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


type FirstProjectGuideStep = 1 | 2 | 3 | 4 | 5 | 6;

type FirstProjectGuideState = {
  step: FirstProjectGuideStep;
  orderId?: string;
  completed?: boolean;
};

const FIRST_PROJECT_GUIDE_EVENT = "studioflow-web-first-project-guide-updated";
const FIRST_PROJECT_GUIDE_TEST_EMAIL = "studioflow.guide.test@eggcraft.co.uk";

function firstProjectGuideStorageKey(userId: string, workspaceId: string) {
  return `studioflow-web-first-project-guide-v1:${userId}:${workspaceId}`;
}

function readFirstProjectGuideState(userId: string, workspaceId: string, email?: string | null): FirstProjectGuideState {
  const key = firstProjectGuideStorageKey(userId, workspaceId);
  try {
    window.localStorage.setItem("studioflow-web-first-project-guide-active-key", key);
  } catch {
    // Continue without the active-key cache.
  }

  if (email?.trim().toLowerCase() === FIRST_PROJECT_GUIDE_TEST_EMAIL) {
    // For the test account, reset to step 1 only once per browser session
    // (so navigation / refresh within a session keeps the user's progress).
    const sessionFlagKey = `studioflow-web-first-project-guide-test-session:${userId}:${workspaceId}`;
    try {
      const alreadyInitialized = window.sessionStorage.getItem(sessionFlagKey) === "1";
      if (!alreadyInitialized) {
        window.sessionStorage.setItem(sessionFlagKey, "1");
        const fresh: FirstProjectGuideState = { step: 1 };
        try { window.localStorage.setItem(key, JSON.stringify(fresh)); } catch { /* ignore */ }
        try {
          window.dispatchEvent(new CustomEvent(FIRST_PROJECT_GUIDE_EVENT, { detail: fresh }));
        } catch { /* ignore */ }
        return fresh;
      }
    } catch {
      // Fall through to normal read if sessionStorage is unavailable.
    }
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return { step: 1 };
    const decoded = JSON.parse(raw) as Partial<FirstProjectGuideState>;
    if (decoded.completed) return { step: 6, orderId: decoded.orderId, completed: true };
    const step = Number(decoded.step);
    if (step >= 1 && step <= 6) {
      return { step: step as FirstProjectGuideStep, orderId: typeof decoded.orderId === "string" ? decoded.orderId : undefined };
    }
  } catch {
    // The guide is local-only; if storage is unavailable, start from the first step for this session.
  }
  return { step: 1 };
}

function writeFirstProjectGuideState(userId: string, workspaceId: string, next: FirstProjectGuideState, email?: string | null) {
  try {
    const key = firstProjectGuideStorageKey(userId, workspaceId);
    window.localStorage.setItem(key, JSON.stringify(next));
    window.localStorage.setItem("studioflow-web-first-project-guide-active-key", key);
  } catch {
    // Keep the guide in memory if localStorage is unavailable.
  }
  window.dispatchEvent(new CustomEvent(FIRST_PROJECT_GUIDE_EVENT, { detail: next }));
}

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

function profileInitials(displayName: string | null | undefined, email: string | null | undefined) {
  const cleanName = displayName?.trim() ?? "";
  const cleanEmailName = (email ?? "")
    .split("@")[0]
    .replace(/[._-]+/g, " ")
    .trim();
  const source = cleanName || cleanEmailName || "NivaDesk";
  const parts = source.split(/\s+/).filter(Boolean);
  const initials = parts.length >= 2
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
  onSkip
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
    <section className="workspace-onboarding-shell" aria-label={t("Set up your workspace")}>
      <div className="workspace-onboarding-inner">
        <div className="workspace-onboarding-hero">
          <span className="workspace-onboarding-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
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
          <p>{t("Choose your business type first. NivaDesk can then prepare useful workflow steps, fields, card labels and statuses before you create your first order.")}</p>
        </div>

        <div className="workspace-onboarding-card">
          <label className="workspace-onboarding-field">
            <span>{t("Business Type")}</span>
            <select
              value={businessType}
              disabled={saving}
              onChange={event => onBusinessTypeChange(event.target.value)}
            >
              {WORKSPACE_ONBOARDING_BUSINESS_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>

          <div className="workspace-onboarding-copy">
            <strong>{t("Optional smart description")}</strong>
            <p>{t("You can describe how your work flows, what information you collect from customers, approvals, materials, appointments, deposits, shipping or delivery. If you leave this empty, NivaDesk will use the standard template for the selected business type.")}</p>
          </div>

          <textarea
            className="workspace-onboarding-textarea"
            value={prompt}
            disabled={saving}
            placeholder={t("Example: We create custom painted watch dials. We need watch model, dial size, artwork theme, client approval, deposit, painting stage, curing, final photos and shipping.")}
            onChange={event => onPromptChange(event.target.value)}
          />

          <div className="workspace-onboarding-actions">
            <button className="workspace-onboarding-primary" type="button" disabled={saving} onClick={onSmart}>
              {saving ? t("Saving...") : t("Smart Customize")}
            </button>
            <button className="workspace-onboarding-secondary" type="button" disabled={saving} onClick={onStandard}>
              {t("Use Standard Template")}
            </button>
            <button className="workspace-onboarding-skip" type="button" disabled={saving} onClick={onSkip}>
              {t("Skip for now")}
            </button>
          </div>
          {error ? <p className="layout-error">{error}</p> : null}
        </div>

        <p className="workspace-onboarding-footer">{t("You can change this later from Settings > Workflow > Business Type.")}</p>
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
  const { user } = useAuth();
  const { hideNumbers, toggleHideNumbers } = usePricePrivacy();
  const pathname = usePathname();
  const router = useRouter();
  const addProjectButtonRef = useRef<HTMLButtonElement | null>(null);
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
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [avatarImageFailed, setAvatarImageFailed] = useState(false);
  const [workspaceLogoFailed, setWorkspaceLogoFailed] = useState(false);
  const [onboardingBusinessType, setOnboardingBusinessType] = useState("Photography Studio");
  const [onboardingPrompt, setOnboardingPrompt] = useState(workspaceOnboardingPromptSeed("Photography Studio"));
  const [onboardingSaving, setOnboardingSaving] = useState(false);
  const [onboardingError, setOnboardingError] = useState("");
  const [firstProjectGuide, setFirstProjectGuide] = useState<FirstProjectGuideState | null>(null);

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
    setAvatarMenuOpen(false);
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

  useEffect(() => {
    if (!user || !workspace) {
      setFirstProjectGuide(null);
      return;
    }

    setFirstProjectGuide(readFirstProjectGuideState(user.uid, workspace.id, user.email));

    function handleGuideUpdate(event: Event) {
      const next = (event as CustomEvent<FirstProjectGuideState>).detail;
      if (!next) return;
      setFirstProjectGuide(next);
    }

    window.addEventListener(FIRST_PROJECT_GUIDE_EVENT, handleGuideUpdate);
    return () => window.removeEventListener(FIRST_PROJECT_GUIDE_EVENT, handleGuideUpdate);
  }, [user, workspace?.id]);

  function updateFirstProjectGuide(next: FirstProjectGuideState) {
    if (!user || !workspace) return;
    setFirstProjectGuide(next);
    writeFirstProjectGuideState(user.uid, workspace.id, next, user.email);
  }

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
  const toolbarAvatarInitials = profileInitials(workspace?.currentMemberDisplayName || user?.displayName, user?.email);
  const workspaceLogoUrl = settings?.appLogoUrl?.trim() ?? "";
  const showWorkspaceToolbarLogo = Boolean(workspaceLogoUrl && !workspaceLogoFailed);
  const toolbarLogoSrc = showWorkspaceToolbarLogo ? workspaceLogoUrl : "/brand/nivadesk-logo.png";
  const toolbarLogoLabel = showWorkspaceToolbarLogo ? `${workspace?.name || "Workspace"} logo` : "NivaDesk";
  const canCreateToolbarOrder = Boolean(
    workspace &&
    memberCanAccess(workspace, "orders") &&
    canCreateOrdersForRole(workspace.role) &&
    workspace.entitlements.features.orders_create
  );
  const language = settings?.selectedLanguage ?? "English";
  const t = (text: string) => studioT(text, language);
  const isFirstProjectGuideTestUser =
    user?.email?.trim().toLowerCase() === FIRST_PROJECT_GUIDE_TEST_EMAIL;
  const showWorkspaceOnboarding = Boolean(
    user &&
    workspace &&
    settings &&
    !settings.businessOnboardingCompleted &&
    financeOrders.length === 0 &&
    memberCanAccess(workspace, "settings") &&
    roleCanSetUpWorkspace(workspace.role) &&
    !isFirstProjectGuideTestUser
  );
  const showFirstProjectAddGuide = Boolean(
    firstProjectGuide &&
    !firstProjectGuide.completed &&
    firstProjectGuide.step === 1 &&
    canCreateToolbarOrder &&
    pathname.startsWith("/orders")
  );

  useEffect(() => {
    if (!showWorkspaceOnboarding) return;
    setOnboardingError("");
    setOnboardingBusinessType(current => current || "Photography Studio");
    setOnboardingPrompt(current => current || workspaceOnboardingPromptSeed(onboardingBusinessType || "Photography Studio"));
  }, [showWorkspaceOnboarding, onboardingBusinessType]);

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
      const newOrderId = result.orderId || "";
      if (firstProjectGuide && !firstProjectGuide.completed && firstProjectGuide.step === 1 && newOrderId) {
        updateFirstProjectGuide({ step: 2, orderId: newOrderId });
      }
      handleOrderCreated(newOrderId);
    } catch (createError) {
      setOrderCreateError(createError instanceof Error ? createError.message : t("Could not create the project. Please try again."));
    } finally {
      setCreatingOrder(false);
    }
  }

  async function handleToolbarSignOut() {
    setAvatarMenuOpen(false);
    await signOut(auth);
    router.replace("/login");
  }

  async function completeWorkspaceOnboarding(action: "smart" | "standard" | "skip") {
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
          action === "smart"
        );
      }
      setSettings(current => {
        const mergedSettings = current ? { ...current, businessOnboardingCompleted: true } : current;
        if (mergedSettings && user?.uid) rememberAppShellSnapshot(user.uid, { settings: mergedSettings });
        return mergedSettings;
      });
      window.dispatchEvent(new CustomEvent("studioflow-settings-updated", {
        detail: { settings: { businessOnboardingCompleted: true } }
      }));
    } catch (saveError) {
      setOnboardingError(saveError instanceof Error ? saveError.message : t("Workspace setup could not be saved."));
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
          onBusinessTypeChange={nextType => {
            setOnboardingBusinessType(nextType);
            setOnboardingPrompt(current => current.trim() ? current : workspaceOnboardingPromptSeed(nextType));
            setOnboardingError("");
          }}
          onPromptChange={nextPrompt => {
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
        <div className={wideWorkspace ? "shell-container shell-container-wide" : "shell-container"}>
          <header className="app-toolbar app-toolbar-native">
          <div className="toolbar-main">
            <Link href={canSeeToolbarFinance ? "/dashboard" : "/orders"} className="toolbar-brand native-brand" aria-label={canSeeToolbarFinance ? "Dashboard" : "Orders"}>
              <span className="native-brand-logo-frame" aria-label={toolbarLogoLabel}>
                <img
                  src={toolbarLogoSrc}
                  alt=""
                  aria-hidden="true"
                  onError={() => {
                    if (showWorkspaceToolbarLogo) setWorkspaceLogoFailed(true);
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
              <span className="web-first-guide-add-wrap">
                <button
                  ref={addProjectButtonRef}
                  className={["button native-add-order", showFirstProjectAddGuide ? "web-first-guide-target" : ""].filter(Boolean).join(" ")}
                  type="button"
                  disabled={creatingOrder}
                  title={t("Add Project")}
                  onClick={handleAddOrder}
                >
                  <span>{creatingOrder ? t("Creating...") : `+ ${t("Add Project")}`}</span>
                </button>
                {showFirstProjectAddGuide ? (
                  <WebFirstProjectGuideBubble
                    targetRef={addProjectButtonRef}
                    eyebrow={`${t("Step")} 1 / 6`}
                    title={t("Start with Add Project")}
                    message={t("Use Add Project to create your first workspace project. We will keep the guide simple and show one card at a time.")}
                    onSkip={() => updateFirstProjectGuide({ step: 6, completed: true })}
                    skipLabel={t("Skip")}
                  />
                ) : null}
              </span>
            ) : null}
            <span className="toolbar-avatar-wrap">
              <button
                className="toolbar-avatar"
                type="button"
                title={t("Account")}
                aria-label={t("Account")}
                aria-expanded={avatarMenuOpen}
                onClick={() => setAvatarMenuOpen(open => !open)}
              >
                {showToolbarAvatarImage ? (
                  <img src={toolbarAvatarUrl} alt="" onError={() => setAvatarImageFailed(true)} />
                ) : (
                  <ToolbarAvatarPlaceholder initials={toolbarAvatarInitials} />
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
                  <button type="button" role="menuitem" className="danger" onClick={handleToolbarSignOut}>
                    {t("Sign Out")}
                  </button>
                </span>
              ) : null}
            </span>
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


type WebFirstProjectGuideBubbleProps = {
  eyebrow: string;
  title: string;
  message: string;
  nextLabel?: string;
  skipLabel?: string;
  onNext?: () => void;
  onSkip?: () => void;
  targetRef?: RefObject<HTMLElement | null>;
};

function WebFirstProjectGuideBubble({ eyebrow, title, message, nextLabel, skipLabel, onNext, onSkip, targetRef }: WebFirstProjectGuideBubbleProps) {
  const [bubbleStyle, setBubbleStyle] = useState<CSSProperties | null>(null);

  useEffect(() => {
    if (!targetRef) return;
    let frame = 0;
    function update() {
      const el = targetRef?.current;
      if (!el) {
        frame = window.requestAnimationFrame(update);
        return;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        frame = window.requestAnimationFrame(update);
        return;
      }
      const vw = window.innerWidth || document.documentElement.clientWidth || 1024;
      const width = Math.min(340, Math.max(280, vw - 32));
      const left = Math.max(16, Math.min(rect.right - width, vw - width - 16));
      const top = rect.bottom + 14;
      setBubbleStyle({ left, top, width });
    }
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [targetRef]);

  if (!bubbleStyle) return null;

  return (
    <span className="web-first-guide-bubble" role="note" style={bubbleStyle}>
      <span className="web-first-guide-eyebrow">{eyebrow}</span>
      <strong>{title}</strong>
      <span>{message}</span>
      <span className="web-first-guide-actions">
        {onSkip ? <button type="button" onClick={onSkip}>{skipLabel || "Skip"}</button> : null}
        {onNext ? <button type="button" className="primary" onClick={onNext}>{nextLabel || "Next"}</button> : null}
      </span>
      <style jsx global>{`
        .web-first-guide-add-wrap {
          position: relative;
          display: inline-flex;
          align-items: center;
        }
        .web-first-guide-target {
          position: relative;
          z-index: 45;
          box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.26), 0 0 0 8px rgba(37, 99, 235, 0.13), 0 18px 40px rgba(37, 99, 235, 0.24) !important;
          outline: 3px solid rgba(37, 99, 235, 0.86) !important;
          outline-offset: 4px;
        }
        .web-first-guide-bubble {
          position: fixed;
          z-index: 9999;
          display: grid;
          gap: 8px;
          padding: 16px;
          border-radius: 22px;
          border: 3px solid rgba(37, 99, 235, 0.9);
          background: linear-gradient(180deg, rgba(239, 246, 255, 0.98), rgba(255, 255, 255, 0.98));
          color: #0f172a;
          box-shadow: 0 24px 70px rgba(37, 99, 235, 0.24), 0 0 0 8px rgba(37, 99, 235, 0.12);
          text-align: left;
          white-space: normal;
        }
        .web-first-guide-bubble::before {
          content: "";
          position: absolute;
          top: -10px;
          right: 28px;
          width: 18px;
          height: 18px;
          transform: rotate(45deg);
          border-left: 3px solid rgba(37, 99, 235, 0.9);
          border-top: 3px solid rgba(37, 99, 235, 0.9);
          background: rgba(239, 246, 255, 0.98);
        }
        .web-first-guide-eyebrow {
          width: fit-content;
          padding: 4px 10px;
          border-radius: 999px;
          background: rgba(37, 99, 235, 0.13);
          color: #1d4ed8;
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .web-first-guide-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 4px;
        }
        .web-first-guide-actions button {
          border: 1px solid rgba(37, 99, 235, 0.2);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.86);
          color: #1d4ed8;
          cursor: pointer;
          font-weight: 800;
          padding: 8px 12px;
        }
        .web-first-guide-actions button.primary {
          background: #2563eb;
          color: white;
          border-color: #2563eb;
        }
      `}</style>
    </span>
  );
}
