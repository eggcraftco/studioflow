"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { AppShell } from "@/components/AppShell";
import { CardIconGlyph, CardTitle } from "@/components/CardTitle";
import { CustomRoleManager } from "@/components/CustomRoleManager";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useAuth } from "@/lib/auth/AuthProvider";
import { auth } from "@/lib/firebase/client";
import { getWooCommerceWebhookDeliveryUrl } from "@/lib/studioflow/planActions";
import { PlanComparisonCard } from "@/components/PlanComparisonCard";
import { ACCOUNT_AVATAR_ACCEPT, changeAccountEmail, saveAccountAvatar, saveAccountProfile, sendAccountPasswordReset, uploadAccountAvatar } from "@/lib/studioflow/accountProfile";
import { PLAN_ENTITLEMENTS, storageLimitLabel, usagePercent, type PlanEntitlements } from "@/lib/studioflow/plans";
import {
  loadDashboardCounts,
  loadQuickReplySettings,
  loadTeamAccessData,
  loadJoinedWorkspaceOptions,
  loadWorkspaceContext,
  switchActiveWorkspace,
  loadWorkspaceExportData,
  loadWorkspaceSettingsOverview,
  normalizeWorkspaceRole,
  workspaceAccessAllows,
  type JoinRequestDetail,
  type JoinedWorkspaceOption,
  type DashboardCounts,
  type CompanyNumberSetting,
  type QuickReplySettings,
  type QuickReplyTemplateItem,
  type TeamAccessData,
  type TeamMemberDetail,
  type WorkspaceContext,
  type WorkspaceSettingsOverview
} from "@/lib/studioflow/firestore";
import { canContributeQuickReplyKnowledgeForRole, canEditPersonalQuickReplySettingsForRole, canEditQuickReplySettingsForRole, deleteQuickReplyContribution, listQuickReplyContributions, loadQuickReplyPersonalSettings, saveQuickReplyContribution, saveQuickReplyPersonalSettings, saveQuickReplySettings, type QuickReplyContributionItem } from "@/lib/studioflow/quickReply";
import {
  loadWorkspaceBlockHeadings,
  saveWorkspaceBlockHeadings,
  type BlockHeadingSettings,
  type HeadingItem
} from "@/lib/studioflow/blockHeadings";
import { appCompatibleBackupJson, customersToCsv, downloadTextFile, fullBackupJson, ordersToCsv, safeFileDate } from "@/lib/studioflow/export";
import { studioT, SUPPORTED_STUDIO_LANGUAGES } from "@/lib/studioflow/language";
import { canDeleteWorkspaceDataForRole, canEditWorkspaceSettingsForRole, deleteWorkspaceData, getPersonalInterfaceSettings, importWorkspaceBackup, recalculateFinancialSettingsForOrders, saveFinancialSettings, saveLanguageSettings, savePdfExportSettings, savePersonalInterfaceSettings, saveThemeBrandingSettings, saveUploadSafetySettings } from "@/lib/studioflow/settingsActions";
import { approveJoinRequest, declineJoinRequest, deleteWorkspaceCustomRole, removeTeamMember, requestWorkspaceAccess, saveWorkspaceCustomRole, syncAcceptedJoinRequests, updateTeamMemberRole, WEB_TEAM_ROLES } from "@/lib/studioflow/teamActions";
import { canManageWorkspaceLogoForRole, saveWorkspaceLogoUrl, uploadWorkspaceLogo, WORKSPACE_LOGO_ACCEPT } from "@/lib/studioflow/workspaceLogo";
import {
  addNivaDeskSupportTicketReply,
  addWorkspaceSupportTicketReply,
  createNivaDeskSupportTicket,
  createWorkspaceSupportTicket,
  listNivaDeskSupportTicketMessages,
  listNivaDeskSupportTickets,
  listWorkspaceSupportTicketMessages,
  listWorkspaceSupportTickets,
  markNivaDeskSupportTicketRead,
  markWorkspaceSupportTicketRead,
  getSupportTicketUnreadSummary,
  supportTicketIsUnread,
  supportUnreadTicketIds,
  supportUnreadTotal,
  updateNivaDeskSupportTicketStatus,
  updateWorkspaceSupportTicketStatus,
  type StudioSupportTicket,
  type StudioSupportTicketMessage,
  type StudioSupportTicketStatus,
  type StudioSupportTicketType
} from "@/lib/studioflow/supportTickets";

type SettingsSectionId =
  | "general"
  | "theme-branding"
  | "language-labels"
  | "workflow"
  | "pdf"
  | "quick-reply"
  | "financial"
  | "woocommerce"
  | "safety-uploads"
  | "data"
  | "account"
  | "plan-access"
  | "team-access"
  | "support-tickets"
  | "about";

type SettingsSection = {
  id: SettingsSectionId;
  title: string;
  appKey: string;
  description: string;
  icon: keyof typeof SETTINGS_ICON_PATHS;
};

const SETTINGS_ICON_PATHS = {
  theme: ["M12 3a9 9 0 0 0 0 18h1.2a2.2 2.2 0 0 0 1.6-3.8l-.4-.4a1.7 1.7 0 0 1 1.2-2.9H17a4 4 0 0 0 0-8.1A9 9 0 0 0 12 3Z", "M7.5 10h.1M10 7.5h.1M13.5 7h.1M16 10h.1"],
  language: ["M4 5h9M7 5c.8 4.5 3.2 7.4 7 9", "M12 5c-.8 4.5-3.2 7.4-7 9", "M14 19l3-7 3 7M15.2 16h3.6"],
  workflow: ["M5 6h5v5H5V6ZM14 6h5v5h-5V6ZM5 15h5v5H5v-5ZM10 8.5h4M7.5 11v4"],
  pdf: ["M6 3h9l3 3v15H6V3Z", "M14 3v4h4", "M8 13h8M8 17h5"],
  reply: ["M4 5h16v10H8l-4 4V5Z", "M8 9h8M8 12h5"],
  financial: ["M12 3v18", "M17 7.5A4 4 0 0 0 9 8c0 2 1.5 3 4 3s4 1 4 3-1.8 4-5 4a6 6 0 0 1-5-2.5"],
  cart: ["M4 5h2l2 10h9l2-7H7", "M10 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM17 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"],
  shield: ["M12 3 5 6v5c0 4.5 2.8 8.3 7 10 4.2-1.7 7-5.5 7-10V6l-7-3Z", "m9 12 2 2 4-5"],
  data: ["M4 7c0-2 16-2 16 0v10c0 2-16 2-16 0V7Z", "M4 7c0 2 16 2 16 0", "M4 12c0 2 16 2 16 0"],
  account: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M4 21a8 8 0 0 1 16 0"],
  plan: ["M4 5h16v14H4V5Z", "M4 10h16", "M8 15h3"],
  team: ["M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM17 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z", "M3 21a6 6 0 0 1 12 0M14 20a5 5 0 0 1 7-4.5"],
  about: ["M12 17v-5", "M12 8h.01", "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z"]
};

const SETTINGS_SECTIONS: SettingsSection[] = [
  { id: "general", title: "General", appKey: "General", description: "Appearance, language, profile and security.", icon: "theme" },
  { id: "workflow", title: "Workflow Steps", appKey: "Workflow", description: "Order steps and custom fields.", icon: "workflow" },
  { id: "pdf", title: "PDF Export Settings", appKey: "PDF", description: "Invoice and PDF export options.", icon: "pdf" },
  { id: "quick-reply", title: "Quick Reply Settings", appKey: "Quick Reply", description: "Quick reply templates.", icon: "reply" },
  { id: "financial", title: "Financial Settings", appKey: "Financial", description: "Fees, tax and calculations.", icon: "financial" },
  { id: "woocommerce", title: "WooCommerce Integration", appKey: "WooCommerce", description: "Live website orders and webhook setup.", icon: "cart" },
  { id: "safety-uploads", title: "Safety & Uploads", appKey: "Upload Safety", description: "Upload rules, file limits and audit protection.", icon: "shield" },
  { id: "data", title: "Data Management", appKey: "Data", description: "Import, export and backup.", icon: "data" },
  { id: "plan-access", title: "Plan & Access", appKey: "Plan & Access", description: "Billing, limits and feature access.", icon: "plan" },
  { id: "team-access", title: "Team Access", appKey: "Team Access", description: "Members, roles and workspace requests.", icon: "team" },
  { id: "support-tickets", title: "Support / Tickets", appKey: "Support / Tickets", description: "Contact your workspace owner or NivaDesk support.", icon: "reply" }
];

function formatStorageFromMB(valueMB: number) {
  if (!Number.isFinite(valueMB) || valueMB <= 0) return "0 MB";
  if (valueMB >= 1024) return `${Math.round((valueMB / 1024) * 10) / 10} GB`;
  return `${Math.round(valueMB)} MB`;
}

function formatTeamDate(date: Date | null) {
  if (!date) return "-";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function planOrderLimitText(plan: { orderLimit: number | null }) {
  return plan.orderLimit == null ? "Unlimited orders" : `${plan.orderLimit} orders`;
}

function planCustomerLimitText(plan: { customerLimit: number | null }) {
  return plan.customerLimit == null ? "Unlimited customers" : `${plan.customerLimit} customers`;
}

function planTeamLimitText(plan: { plan?: string; teamMemberLimit: number }) {
  if (plan.plan === "team_monthly") return "5 seats included · add up to 10";
  return plan.teamMemberLimit <= 1 ? "1 user" : `Up to ${plan.teamMemberLimit} users`;
}

function planSummaryText(plan: string) {
  switch (plan) {
    case "lifetime_lite":
      return "Lower-cost subscription for solo order management, timeline tracking and personal scheduling.";
    case "pro_monthly":
      return "Cloud files, Share Sheet, advanced schedule tools and professional dashboard access.";
    case "team_monthly":
      return "Shared workspace access with roles, team scheduling and live card profile sync.";
    default:
      return "Try the core order workflow with safe limits before upgrading.";
  }
}

function memberLabel(member: TeamMemberDetail) {
  return member.displayName || member.email || member.id;
}

function requestLabel(request: JoinRequestDetail) {
  return request.requesterEmail || request.requesterDisplayName || request.requesterUid;
}

function roleOptionLabel(role: string) {
  return WEB_TEAM_ROLES.find(option => option.value === role)?.label ?? "Member";
}

function standardAndCustomRoleOptions(customRoles: { id: string; name: string }[] = []) {
  return [
    ...WEB_TEAM_ROLES,
    ...customRoles.map(role => ({ value: role.id, label: role.name }))
  ];
}

function canSeeSettingsSection(workspace: WorkspaceContext | null, sectionId: SettingsSectionId) {
  if (!workspace) return true;
  if (normalizeWorkspaceRole(workspace.role) === "owner") return true;

  const allowed = (key: keyof NonNullable<WorkspaceContext["memberAccess"]>) => workspaceAccessAllows(workspace.memberAccess, key);
  const isWorkflowOnly = normalizeWorkspaceRole(workspace.role) === "workflow";

  // Settings sidebar items are gated SOLELY by their own per-section permission flag.
  // We deliberately do not require the workspace-level "settings" nav flag here so
  // an owner can hand out individual settings screens (e.g. only Quick Reply) to a
  // role without having to also toggle on the broader Settings nav access. Mirrors
  // the Mac / Android behaviour where disabled permissions hide the menu cleanly
  // without surfacing a Firestore "Missing or insufficient permissions" popup.
  if (sectionId === "general" || sectionId === "account" || sectionId === "about") {
    return allowed("settingsGeneral");
  }
  if (sectionId === "support-tickets") return allowed("settingsSupport");
  if (sectionId === "team-access") return allowed("settingsTeamAccess");

  if (isWorkflowOnly) {
    if (sectionId === "theme-branding" || sectionId === "language-labels") return allowed("settingsGeneral");
    if (sectionId === "quick-reply") return allowed("settingsQuickReply");
    if (sectionId === "pdf") return allowed("settingsPdf");
    return false;
  }

  // Explicit per-section gates for non-owner, non-workflow members. Default = false.
  if (sectionId === "workflow") return allowed("settingsWorkflow");
  if (sectionId === "quick-reply") return allowed("settingsQuickReply");
  if (sectionId === "financial") return workspace.entitlements.features.financial_advanced && allowed("settingsFinancial");
  if (sectionId === "pdf") return allowed("settingsPdf");
  if (sectionId === "safety-uploads") return allowed("settingsSafetyUploads");
  if (sectionId === "data") return allowed("settingsData");
  if (sectionId === "woocommerce") return allowed("settingsWorkflow");
  if (sectionId === "plan-access") return allowed("settingsPlanAccess");
  return false;
}

export default function SettingsPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [workspace, setWorkspace] = useState<WorkspaceContext | null>(null);
  const [counts, setCounts] = useState<DashboardCounts | null>(null);
  const [settings, setSettings] = useState<WorkspaceSettingsOverview | null>(null);
  const [quickReplySettings, setQuickReplySettings] = useState<QuickReplySettings | null>(null);
  const [teamData, setTeamData] = useState<TeamAccessData | null>(null);
  const [supportUnreadCount, setSupportUnreadCount] = useState(0);
  const [activeSection, setActiveSection] = useState<SettingsSectionId>("general");
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, router, user]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("section") as SettingsSectionId | null;
    if (requested && SETTINGS_SECTIONS.some(section => section.id === requested)) {
      setActiveSection(requested);
    }
  }, []);

  // Keep activeSection in sync with the visibleSections set so a user landing on a
  // section their role can no longer access (e.g. after the owner toggles off a
  // permission, or via a stale URL `?section=...`) automatically falls back to the
  // first visible section instead of triggering a Firestore permission error.
  useEffect(() => {
    if (!workspace) return;
    if (!canSeeSettingsSection(workspace, activeSection)) {
      const firstVisible = SETTINGS_SECTIONS.find(section => canSeeSettingsSection(workspace, section.id));
      if (firstVisible && firstVisible.id !== activeSection) {
        setActiveSection(firstVisible.id);
      }
    }
  }, [workspace, activeSection]);

  useEffect(() => {
    if (!user) return;
    const currentUser = user;
    let cancelled = false;

    async function run() {
      setLoadingSettings(true);
      setError("");
      try {
        const loadedWorkspace = await loadWorkspaceContext(currentUser.uid);
        const teamDataPromise = loadedWorkspace.entitlements.features.team_access
          && workspaceAccessAllows(loadedWorkspace.memberAccess, "teamAccess")
          ? (async () => {
              if (normalizeWorkspaceRole(loadedWorkspace.role) === "owner") {
                try {
                  await syncAcceptedJoinRequests(loadedWorkspace);
                } catch (syncError) {
                  console.warn("Team access sync skipped:", syncError);
                }
              }
              return loadTeamAccessData(loadedWorkspace).catch(() => null);
            })()
          : Promise.resolve(null);
        const isWorkflowOnly = normalizeWorkspaceRole(loadedWorkspace.role) === "workflow";
        const [loadedCounts, loadedSettings, loadedQuickReplySettings, loadedTeamData, loadedSupportUnreadSummary] = await Promise.all([
          isWorkflowOnly ? Promise.resolve(null) : loadDashboardCounts(loadedWorkspace.id),
          loadWorkspaceSettingsOverview(loadedWorkspace.id),
          loadQuickReplySettings(loadedWorkspace.id),
          teamDataPromise,
          getSupportTicketUnreadSummary(loadedWorkspace).catch(() => null)
        ]);
        if (cancelled) return;
        setWorkspace(loadedWorkspace);
        setCounts(loadedCounts);
        setSettings(loadedSettings);
        setQuickReplySettings(loadedQuickReplySettings);
        setTeamData(loadedTeamData);
        setSupportUnreadCount(supportUnreadTotal(loadedSupportUnreadSummary));
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Could not load settings.");
      } finally {
        if (!cancelled) setLoadingSettings(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const visibleSections = useMemo(
    () => SETTINGS_SECTIONS.filter(section => canSeeSettingsSection(workspace, section.id)),
    [workspace]
  );
  const selectedSection = useMemo(
    () => visibleSections.find(section => section.id === activeSection) ?? visibleSections[0] ?? SETTINGS_SECTIONS.find(section => section.id === "general") ?? SETTINGS_SECTIONS[0],
    [activeSection, visibleSections]
  );
  const language = settings?.selectedLanguage ?? "English";
  const t = (text: string) => studioT(text, language);

  const storagePercent = useMemo(() => {
    if (!workspace || !counts) return 0;
    return usagePercent(counts.estimatedFileUsageMB, workspace.billingStorageLimitMB);
  }, [counts, workspace]);

  function selectSection(sectionId: SettingsSectionId) {
    setActiveSection(sectionId);
    const url = new URL(window.location.href);
    url.searchParams.set("section", sectionId);
    window.history.replaceState(null, "", url);
  }

  async function refreshSettingsAfterImport() {
    if (!workspace) return;
    const isWorkflowOnly = normalizeWorkspaceRole(workspace.role) === "workflow";
    const [nextCounts, nextSettings, nextQuickReplySettings] = await Promise.all([
      isWorkflowOnly ? Promise.resolve(null) : loadDashboardCounts(workspace.id),
      loadWorkspaceSettingsOverview(workspace.id),
      loadQuickReplySettings(workspace.id)
    ]);
    setCounts(nextCounts);
    setSettings(nextSettings);
    setQuickReplySettings(nextQuickReplySettings);
  }

  async function refreshTeamAccessData() {
    if (!workspace || !workspace.entitlements.features.team_access || !workspaceAccessAllows(workspace.memberAccess, "teamAccess")) return null;
    if (normalizeWorkspaceRole(workspace.role) === "owner") {
      try {
        await syncAcceptedJoinRequests(workspace);
      } catch (syncError) {
        console.warn("Team access sync skipped:", syncError);
      }
    }
    const nextTeamData = await loadTeamAccessData(workspace);
    setTeamData(nextTeamData);
    return nextTeamData;
  }

  if (loading || !user) return <LoadingScreen />;

  return (
    <AppShell>
      {loadingSettings ? <LoadingScreen /> : null}
      <div className="settings-workspace">
        <aside className="settings-sidebar">
          <div className="settings-sidebar-heading">
            <h1>{t("Settings")}</h1>
            <p>{t("Choose a section to edit.")}</p>
          </div>
          <div className="settings-section-list">
            {visibleSections.map(section => {
              const unreadCount = section.id === "support-tickets" ? supportUnreadCount : 0;
              return (
                <button
                  key={section.id}
                  className={section.id === selectedSection.id ? "settings-section-button active" : "settings-section-button"}
                  type="button"
                  onClick={() => selectSection(section.id)}
                >
                  <SettingsSectionIcon icon={section.icon} />
                  <span>
                    <strong style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      {t(section.title)}
                      {unreadCount > 0 ? <span style={supportUnreadMenuBadgeStyle}>{unreadCount}</span> : null}
                    </strong>
                    <small>{t(section.description)}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="settings-content-pane">
          {error ? (
            <div className="card app-card">
              <CardTitle icon="lock" eyebrow={t("Settings error")} title={t("Could not load workspace settings")} />
              <p className="layout-error">{error}</p>
            </div>
          ) : null}

          {workspace ? renderSettingsSection({
            sectionId: selectedSection.id,
            workspace,
            counts,
            settings,
            onWorkspaceSettingsChange: setSettings,
            language,
            quickReplySettings,
            onQuickReplySettingsChange: setQuickReplySettings,
            teamData,
            onRefreshTeamAccess: refreshTeamAccessData,
            supportUnreadCount,
            onSupportUnreadChanged: setSupportUnreadCount,
            storagePercent,
            userEmail: user.email ?? "Signed in",
            onDataImported: refreshSettingsAfterImport
          }) : null}
        </section>
      </div>
    </AppShell>
  );
}

function renderSettingsSection({
  sectionId,
  workspace,
  counts,
  settings,
  onWorkspaceSettingsChange,
  language,
  quickReplySettings,
  onQuickReplySettingsChange,
  teamData,
  onRefreshTeamAccess,
  supportUnreadCount,
  onSupportUnreadChanged,
  storagePercent,
  userEmail,
  onDataImported
}: {
  sectionId: SettingsSectionId;
  workspace: WorkspaceContext;
  counts: DashboardCounts | null;
  settings: WorkspaceSettingsOverview | null;
  onWorkspaceSettingsChange: (settings: WorkspaceSettingsOverview) => void;
  language: string;
  quickReplySettings: QuickReplySettings | null;
  onQuickReplySettingsChange: (settings: QuickReplySettings) => void;
  teamData: TeamAccessData | null;
  onRefreshTeamAccess: () => Promise<TeamAccessData | null>;
  supportUnreadCount: number;
  onSupportUnreadChanged: (count: number) => void;
  storagePercent: number;
  userEmail: string;
  onDataImported: () => Promise<void>;
}) {
  switch (sectionId) {
    case "general":
      return (
        <GeneralSettingsSection
          workspace={workspace}
          settings={settings}
          language={language}
          userEmail={userEmail}
          onSaved={onWorkspaceSettingsChange}
        />
      );
    case "theme-branding":
      return <ThemeBrandingSection workspace={workspace} settings={settings} onSaved={onWorkspaceSettingsChange} />;
    case "language-labels":
      return <LanguageLabelsSection workspace={workspace} settings={settings} language={language} onSaved={onWorkspaceSettingsChange} />;
    case "workflow":
      return <WorkflowSettingsSection workspace={workspace} />;
    case "pdf":
      return <PdfExportSettingsSection workspace={workspace} settings={settings} onSaved={onWorkspaceSettingsChange} />;
    case "quick-reply":
      return <QuickReplySettingsSection workspace={workspace} settings={quickReplySettings} onSaved={onQuickReplySettingsChange} />;
    case "financial":
      return <FinancialSettingsSection workspace={workspace} settings={settings} language={language} onSaved={onWorkspaceSettingsChange} />;
    case "woocommerce":
      return <WooCommerceIntegrationSection workspace={workspace} />;
    case "safety-uploads":
      return <SafetyUploadsSection workspace={workspace} settings={settings} onSaved={onWorkspaceSettingsChange} />;
    case "data":
      return <DataManagementSection workspace={workspace} counts={counts} userEmail={userEmail} onImported={onDataImported} />;
    case "account":
      return <AccountSection workspace={workspace} settings={settings} userEmail={userEmail} onSaved={onWorkspaceSettingsChange} />;
    case "plan-access":
      return <PlanAccessSection workspace={workspace} counts={counts} storagePercent={storagePercent} />;
    case "team-access":
      return <TeamAccessSection workspace={workspace} teamData={teamData} onRefreshTeamAccess={onRefreshTeamAccess} />;
    case "support-tickets":
      return <SupportTicketsSection workspace={workspace} language={language} supportUnreadCount={supportUnreadCount} onSupportUnreadChanged={onSupportUnreadChanged} />;
    case "about":
      return <AboutSection workspace={workspace} />;
  }
}

function SettingsSectionIcon({ icon }: { icon: keyof typeof SETTINGS_ICON_PATHS }) {
  return (
    <span className="settings-section-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {SETTINGS_ICON_PATHS[icon].map(path => <path key={path} d={path} />)}
      </svg>
    </span>
  );
}

function GeneralSettingsSection({
  workspace,
  settings,
  language,
  userEmail,
  onSaved
}: {
  workspace: WorkspaceContext;
  settings: WorkspaceSettingsOverview | null;
  language: string;
  userEmail: string;
  onSaved: (settings: WorkspaceSettingsOverview) => void;
}) {
  type GeneralSubsection = "menu" | "appearance" | "language" | "profile" | "about";
  const [selected, setSelected] = useState<GeneralSubsection>("menu");
  const t = (text: string) => studioT(text, settings?.selectedLanguage ?? language ?? "English");
  const normalizedRole = normalizeWorkspaceRole(workspace.role);
  const canManageWorkspaceIdentity = normalizedRole === "owner" || normalizedRole === "admin" || normalizedRole === "member";
  const [personalSettings, setPersonalSettings] = useState<{ appTheme?: string; selectedLanguage?: string }>({});

  useEffect(() => {
    getPersonalInterfaceSettings(workspace)
      .then(values => setPersonalSettings(values))
      .catch(() => setPersonalSettings({}));
  }, [workspace.id]);

  if (selected === "appearance") {
    return (
      <div className="settings-card-stack">
        <button className="button secondary" type="button" onClick={() => setSelected("menu")}>← {t("General")}</button>
        <ThemeBrandingSection workspace={workspace} settings={settings} onSaved={onSaved} />
      </div>
    );
  }
  if (selected === "language") {
    return (
      <div className="settings-card-stack">
        <button className="button secondary" type="button" onClick={() => setSelected("menu")}>← {t("General")}</button>
        <LanguageLabelsSection workspace={workspace} settings={settings} language={language} onSaved={onSaved} />
      </div>
    );
  }
  if (selected === "profile") {
    return (
      <div className="settings-card-stack">
        <button className="button secondary" type="button" onClick={() => setSelected("menu")}>← {t("General")}</button>
        <AccountSection workspace={workspace} settings={settings} userEmail={userEmail} onSaved={onSaved} hideWorkspaceIdentity={!canManageWorkspaceIdentity} />
      </div>
    );
  }
  if (selected === "about") {
    return (
      <div className="settings-card-stack">
        <button className="button secondary" type="button" onClick={() => setSelected("menu")}>← {t("General")}</button>
        <AboutSection workspace={workspace} />
      </div>
    );
  }

  return (
    <div className="settings-card-stack">
      <section className="card app-card quick-reply-settings-card">
        <CardTitle icon="customer" eyebrow={t("Settings")} title={t("General")} />
        <p className="muted-copy">{t("Manage your personal appearance, language, profile and sign-in security in one place.")}</p>
        <div className="general-settings-list">
          <button className="general-settings-row" type="button" onClick={() => setSelected("appearance")}>
            <span className="general-settings-row__title">{t("Appearance")}</span>
            <span className="general-settings-row__detail">{personalSettings.appTheme || settings?.appTheme || "System"}</span>
            <span className="general-settings-row__arrow">›</span>
          </button>
          <button className="general-settings-row" type="button" onClick={() => setSelected("language")}>
            <span className="general-settings-row__title">{t("Language & Region")}</span>
            <span className="general-settings-row__detail">{personalSettings.selectedLanguage || settings?.selectedLanguage || language || "English"}</span>
            <span className="general-settings-row__arrow">›</span>
          </button>
          <button className="general-settings-row" type="button" onClick={() => setSelected("profile")}>
            <span className="general-settings-row__title">{t("Profile & Security")}</span>
            <span className="general-settings-row__detail">{canManageWorkspaceIdentity ? t("Profile, workspace and security") : t("Profile and security")}</span>
            <span className="general-settings-row__arrow">›</span>
          </button>
          <button className="general-settings-row" type="button" onClick={() => setSelected("about")}>
            <span className="general-settings-row__title">{t("About")}</span>
            <span className="general-settings-row__detail">NivaDesk</span>
            <span className="general-settings-row__arrow">›</span>
          </button>
        </div>
      </section>
    </div>
  );
}

function ThemeBrandingSection({
  workspace,
  settings,
  onSaved
}: {
  workspace: WorkspaceContext;
  settings: WorkspaceSettingsOverview | null;
  onSaved: (settings: WorkspaceSettingsOverview) => void;
}) {
  const [appTheme, setAppTheme] = useState(settings?.appTheme ?? "System");
  const [appSubtitle, setAppSubtitle] = useState(settings?.appSubtitle ?? "Bespoke Hand-Painted Dials");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const isWorkflowOnly = normalizeWorkspaceRole(workspace.role) === "workflow";
  const canEditBranding = canEditWorkspaceSettingsForRole(workspace.role);
  const language = settings?.selectedLanguage ?? "English";
  const t = (text: string) => studioT(text, language);

  useEffect(() => {
    setAppTheme(settings?.appTheme ?? "System");
    setAppSubtitle(settings?.appSubtitle ?? "Bespoke Hand-Painted Dials");
    setStatus("");
    setError("");
    getPersonalInterfaceSettings(workspace).then(personal => {
      if (personal.appTheme) setAppTheme(personal.appTheme);
    }).catch(() => undefined);
  }, [settings, workspace.id]);

  async function handleSaveTheme() {
    if (!settings) return;
    setSaving(true);
    setStatus("");
    setError("");
    try {
      // Theme is ALWAYS personal — each user (owner included) keeps their own
      // theme across their devices. Workspace branding fields (subtitle) still
      // route through saveThemeBrandingSettings for owners/admins separately.
      const personalResult = await savePersonalInterfaceSettings(workspace, { appTheme });
      if (!isWorkflowOnly && appSubtitle !== settings?.appSubtitle) {
        await saveThemeBrandingSettings(workspace, { appSubtitle });
      }
      const savedTheme = personalResult.settings?.appTheme ?? appTheme;
      onSaved({ ...settings, appTheme: savedTheme });
      setAppTheme(savedTheme);
      setStatus(personalResult.message || "Personal theme saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Theme could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveBranding() {
    if (!settings || !canEditBranding) return;
    setSaving(true);
    setStatus("");
    setError("");
    try {
      const result = await saveThemeBrandingSettings(workspace, { appSubtitle });
      const savedSettings = { ...settings, ...(result.settings ?? { appSubtitle }) };
      onSaved(savedSettings);
      setAppSubtitle(savedSettings.appSubtitle);
      setStatus(result.message || "Workspace branding saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Workspace branding could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-card-stack">
      <section className="card app-card">
        <CardTitle icon="dashboard" eyebrow={t("Theme")} title={t("Theme selector")} />
        <label className="quick-reply-settings-label">
          <span>{t("Theme")}</span>
          <select
            className="input"
            value={appTheme}
            disabled={saving || !settings}
            onChange={event => {
              setAppTheme(event.target.value);
              setStatus("");
              setError("");
            }}
          >
            <option value="System">{t("System")}</option>
            <option value="Light">{t("Light")}</option>
            <option value="Dark">{t("Dark")}</option>
          </select>
        </label>
        <div className="settings-action-row">
          <button className="button" type="button" disabled={saving || !settings} onClick={handleSaveTheme}>
            {saving ? t("Saving...") : t("Save Appearance")}
          </button>
        </div>
      </section>

      {canEditBranding ? <section className="card app-card">
        <CardTitle icon="storage" eyebrow={t("Branding")} title={t("Theme & Branding")} />
        <label className="quick-reply-settings-label">
          <span>{t("Brand Subtitle")}</span>
          <input
            className="input"
            value={appSubtitle}
            disabled={!canEditBranding || saving || !settings}
            placeholder="Bespoke Hand-Painted Dials"
            onChange={event => {
              setAppSubtitle(event.target.value);
              setStatus("");
              setError("");
            }}
          />
        </label>
        <p className="muted-copy">{t("Workspace logo is managed from Account > Workspace Logo.")}</p>
        <div className="settings-action-row">
          <button className="button" type="button" disabled={!canEditBranding || saving || !settings} onClick={handleSaveBranding}>
            {saving ? t("Saving...") : t("Save Theme & Branding")}
          </button>
        </div>
        {status ? <p className="success-copy">{studioT(status, language)}</p> : null}
        {error ? <p className="layout-error">{error}</p> : null}
      </section> : null}
    </div>
  );
}

function LanguageLabelsSection({
  workspace,
  settings,
  language,
  onSaved
}: {
  workspace: WorkspaceContext;
  settings: WorkspaceSettingsOverview | null;
  language: string;
  onSaved: (settings: WorkspaceSettingsOverview) => void;
}) {
  const [selectedLanguage, setSelectedLanguage] = useState(settings?.selectedLanguage ?? language ?? "English");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const canEdit = workspaceAccessAllows(workspace.memberAccess, "settingsGeneral");
  const previewLanguage = selectedLanguage || language || "English";
  const t = (text: string) => studioT(text, previewLanguage);

  useEffect(() => {
    setSelectedLanguage(settings?.selectedLanguage ?? language ?? "English");
    setStatus("");
    setError("");
    getPersonalInterfaceSettings(workspace).then(personal => {
      if (personal.selectedLanguage) setSelectedLanguage(personal.selectedLanguage);
    }).catch(() => undefined);
  }, [language, settings, workspace.id]);

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    setStatus("");
    setError("");
    try {
      // Language is ALWAYS personal — each user (owner included) keeps their own
      // language preference across their devices.
      const result = await savePersonalInterfaceSettings(workspace, { selectedLanguage });
      const savedSettings = { ...settings, selectedLanguage: result.settings?.selectedLanguage ?? selectedLanguage };
      onSaved(savedSettings);
      setSelectedLanguage(savedSettings.selectedLanguage);
      setStatus(studioT(result.message || "Language settings saved.", savedSettings.selectedLanguage));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("Language settings could not be saved."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-card-stack">
      {!canEdit ? (
        <section className="card app-card">
          <CardTitle icon="lock" eyebrow={t("Locked")} title={t("Language settings are read-only")} />
          <p className="muted-copy">{t("Your current workspace role cannot edit Language & Labels.")}</p>
        </section>
      ) : null}

      <section className="card app-card quick-reply-settings-card">
        <CardTitle icon="language" eyebrow={t("Language & Labels")} title={t("Select Language")} />
        <label className="quick-reply-settings-label">
          <span>{t("Language")}</span>
          <select
            className="input"
            value={selectedLanguage}
            disabled={!canEdit || saving}
            onChange={event => {
              setSelectedLanguage(event.target.value);
              setStatus("");
              setError("");
            }}
          >
            {SUPPORTED_STUDIO_LANGUAGES.map(language => (
              <option value={language} key={language}>{language}</option>
            ))}
          </select>
        </label>
        <div className="settings-action-row">
          <button className="button" type="button" disabled={!canEdit || saving} onClick={handleSave}>
            {saving ? t("Saving...") : t("Save Language Settings")}
          </button>
        </div>
        {status ? <p className="success-copy">{status}</p> : null}
        {error ? <p className="layout-error">{error}</p> : null}
        <p className="muted-copy">{t("This language is personal to your account and synchronises across your devices.")}</p>
      </section>
    </div>
  );
}

function newHeadingItem(title: string): HeadingItem {
  const randomId = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `heading-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return { id: randomId, title };
}

function workflowStepOptions(settings: BlockHeadingSettings) {
  const cleaned = settings.customSteps
    .map(item => ({ ...item, title: item.title.trim() }))
    .filter(item => item.title.length > 0);
  return cleaned.length > 0
    ? cleaned
    : [newHeadingItem("Design"), newHeadingItem("Painting")];
}

function workflowSettingsWithMaterialDefaults(settings: BlockHeadingSettings): BlockHeadingSettings {
  if (settings.materialsDefaultChecks.length > 0) return settings;
  const defaultLabels = [settings.invLabel1, settings.invLabel2, settings.invLabel3, settings.invLabel4]
    .map(label => label.trim())
    .filter(Boolean);
  return {
    ...settings,
    materialsDefaultChecks: defaultLabels.length > 0
      ? defaultLabels.map((title, index) => ({ id: `material-default-${index}`, title }))
      : settings.materialsDefaultChecks
  };
}

const STATUS_OPTION_POOL = [
  "New",
  "Quoted",
  "Waiting for Deposit",
  "Deposit Paid",
  "Waiting for Customer",
  "Waiting for Approval",
  "Approved",
  "Not Yet",
  "In Progress",
  "Waiting for Material",
  "Ready for Review",
  "Revision Needed",
  "Ready to Ship",
  "Shipped",
  "Delivered",
  "Done",
  "Completed",
  "Cancelled",
  "Refunded",
  "On Hold",
  "Blocked",
  "Overdue"
];

const DEFAULT_ACTIVE_STATUS_OPTIONS = ["New", "Not Yet", "In Progress", "Done", "Cancelled"];

type WorkflowHeadingListKey = "customSteps" | "customToggles" | "materialsDefaultChecks" | "materialsToggles";

const BUSINESS_TYPES = [
  "Custom Art Studio",
  "Freelancer / Designer",
  "Repair Service",
  "Handmade Products",
  "Photography Studio",
  "Tailor / Alteration Studio",
  "Jewellery Studio",
  "Agency / Creative Studio",
  "Food / Bakery / Catering",
  "Beauty / Clinic / Wellness",
  "Consultancy / Professional Service",
  "General Small Business",
  "Other / Prompt Based"
];

type WorkflowTemplate = {
  customFields: string[];
  customSteps: string[];
  customToggles: string[];
  inventoryLabels: string[];
  summaryStep1: string;
  summaryStep2: string;
};

const WORKFLOW_STANDARD_TEMPLATES: Record<string, WorkflowTemplate> = {
  "Custom Art Studio": {
    customFields: ["Watch Ref.", "Concept"],
    customSteps: ["Sketching", "Painting", "Varnishing"],
    customToggles: ["Client Approved Sketch?", "Varnish Dried?"],
    inventoryLabels: ["Dial Sourced", "Paints Ready", "Brushes Prepared", "Canvas Sourced"],
    summaryStep1: "Sketching",
    summaryStep2: "Painting"
  },
  "Freelancer / Designer": {
    customFields: ["Project Type", "Brand Name"],
    customSteps: ["Briefing", "Concept", "Drafting", "Finalizing"],
    customToggles: ["Assets Received?", "Deposit Cleared?"],
    inventoryLabels: ["Material 1", "Material 2", "Prep Done", "Ready to Use"],
    summaryStep1: "Concept",
    summaryStep2: "Finalizing"
  },
  "Agency / Creative Studio": {
    customFields: ["Project Type", "Brand Name"],
    customSteps: ["Briefing", "Concept", "Drafting", "Finalizing"],
    customToggles: ["Assets Received?", "Deposit Cleared?"],
    inventoryLabels: ["Material 1", "Material 2", "Prep Done", "Ready to Use"],
    summaryStep1: "Concept",
    summaryStep2: "Finalizing"
  },
  "Repair Service": {
    customFields: ["Device Model", "Serial Number"],
    customSteps: ["Diagnostics", "Repairing", "Testing"],
    customToggles: ["Warranty Valid?", "Customer Approved Cost?"],
    inventoryLabels: ["Item Received", "Parts Ordered", "Parts Arrived", "Ready for Pickup"],
    summaryStep1: "Diagnostics",
    summaryStep2: "Repairing"
  },
  "Tailor / Alteration Studio": {
    customFields: ["Garment Type", "Fabric"],
    customSteps: ["Pinning", "Cutting", "Sewing", "Fitting"],
    customToggles: ["Measurements Taken?", "Ironed?"],
    inventoryLabels: ["Fabric Sourced", "Threads Ready", "Accessories Ready", "Machine Setup"],
    summaryStep1: "Sewing",
    summaryStep2: "Fitting"
  },
  "Jewellery Studio": {
    customFields: ["Metal Type", "Ring Size"],
    customSteps: ["Designing", "Casting", "Polishing", "Stone Setting"],
    customToggles: ["3D Render Approved?", "Hallmarked?"],
    inventoryLabels: ["Metal Sourced", "Moulds Ready", "Stones Arrived", "Box Ready"],
    summaryStep1: "Casting",
    summaryStep2: "Stone Setting"
  },
  "Photography Studio": {
    customFields: ["Shoot Type", "Location"],
    customSteps: ["Pre-shoot", "Shooting", "Editing", "Retouching"],
    customToggles: ["Contract Signed?", "Deposit Paid?"],
    inventoryLabels: ["Equipment Ready", "Memory Cards Ready", "Backup Drive Ready", "Delivery Folder Ready"],
    summaryStep1: "Shooting",
    summaryStep2: "Editing"
  }
};

const DEFAULT_WORKFLOW_TEMPLATE: WorkflowTemplate = {
  customFields: ["Item Name"],
  customSteps: ["Sourcing", "Crafting"],
  customToggles: ["Quality Checked?"],
  inventoryLabels: ["Material 1", "Material 2", "Prep Done", "Ready to Use"],
  summaryStep1: "Sourcing",
  summaryStep2: "Crafting"
};

function businessPromptSeed(type: string) {
  switch (type) {
    case "Custom Art Studio":
      return "We create custom artwork for clients. We need references, concept approval, materials, production stages, review, final approval and delivery.";
    case "Repair Service":
      return "We repair customer items. We need item model, serial number, issue description, diagnostics, parts order, customer approval, repair, testing, warranty and pickup or shipping.";
    case "Photography Studio":
      return "We manage photo shoots. We need shoot type, location, date, package, contract, deposit, shooting, editing, retouching and digital delivery.";
    case "Other / Prompt Based":
      return "";
    default:
      return "Describe this business here, including customer information needed, workflow stages, approval steps, materials, shipping, appointments, deposits and delivery.";
  }
}

function WorkflowSettingsSection({ workspace }: { workspace: WorkspaceContext }) {
  const [blockSettings, setBlockSettings] = useState<BlockHeadingSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const canEditRole = canEditWorkspaceSettingsForRole(workspace.role);
  const canEdit = canEditRole && workspace.entitlements.features.card_customization;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    loadWorkspaceBlockHeadings(workspace)
      .then(settings => {
        if (!cancelled) setBlockSettings(workflowSettingsWithMaterialDefaults(settings));
      })
      .catch(loadError => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Workflow settings could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [workspace]);

  function updateSetting<K extends keyof BlockHeadingSettings>(key: K, value: BlockHeadingSettings[K]) {
    setBlockSettings(current => current ? { ...current, [key]: value } : current);
    setStatus("");
    setError("");
  }

  function updateList(key: WorkflowHeadingListKey, items: HeadingItem[]) {
    updateSetting(key, items as BlockHeadingSettings[typeof key]);
  }

  function renameListItem(key: WorkflowHeadingListKey, id: string, title: string) {
    if (!blockSettings) return;
    updateList(key, blockSettings[key].map(item => item.id === id ? { ...item, title } : item));
  }

  function addListItem(key: WorkflowHeadingListKey, title: string) {
    if (!blockSettings) return;
    updateList(key, [...blockSettings[key], newHeadingItem(title)]);
  }

  function removeListItem(key: WorkflowHeadingListKey, id: string) {
    if (!blockSettings) return;
    updateList(key, blockSettings[key].filter(item => item.id !== id));
  }

  function toggleActiveStatus(statusOption: string, enabled: boolean) {
    if (!blockSettings) return;
    const activeStatuses = Array.isArray(blockSettings.activeStatuses)
      ? blockSettings.activeStatuses
      : DEFAULT_ACTIVE_STATUS_OPTIONS;
    const cleaned = statusOption.trim();
    if (!cleaned) return;

    const next = enabled
      ? [...activeStatuses, cleaned]
      : activeStatuses.filter(item => item.toLowerCase() !== cleaned.toLowerCase());
    const uniqueNext = Array.from(new Set(next.map(item => item.trim()).filter(Boolean)));
    updateSetting("activeStatuses", uniqueNext);
  }

  async function persistWorkflowSettings(settingsToSave: BlockHeadingSettings, successMessage: string) {
    setSaving(true);
    setStatus("");
    setError("");
    try {
      await saveWorkspaceBlockHeadings(workspace, "status", settingsToSave);
      await saveWorkspaceBlockHeadings(workspace, "customer", settingsToSave);
      const saved = await saveWorkspaceBlockHeadings(workspace, "materials", settingsToSave);
      setBlockSettings(workflowSettingsWithMaterialDefaults(saved));
      setStatus(successMessage);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Workflow settings could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  function selectBusinessType(nextBusinessType: string) {
    if (!blockSettings) return;
    const shouldSeedPrompt = blockSettings.businessDescriptionPrompt.trim().length === 0;
    const nextSettings = {
      ...blockSettings,
      businessType: nextBusinessType,
      businessDescriptionPrompt: shouldSeedPrompt
        ? businessPromptSeed(nextBusinessType)
        : blockSettings.businessDescriptionPrompt
    };
    setBlockSettings(nextSettings);
    void persistWorkflowSettings(nextSettings, "Business type saved.");
  }

  function applyStandardTemplate() {
    if (!blockSettings) return;
    const confirmed = window.confirm("This will overwrite workflow steps, custom fields, production checks, material labels and summary badge choices. Apply the standard template?");
    if (!confirmed) return;

    const template = WORKFLOW_STANDARD_TEMPLATES[blockSettings.businessType] ?? DEFAULT_WORKFLOW_TEMPLATE;
    const materialLabels = [...template.inventoryLabels, "Material 1", "Material 2", "Prep Done", "Ready to Use"];
    const nextSettings = {
      ...blockSettings,
      customFields: template.customFields.map(newHeadingItem),
      customSteps: template.customSteps.map(newHeadingItem),
      customToggles: template.customToggles.map(newHeadingItem),
      materialsDefaultChecks: template.inventoryLabels.map(newHeadingItem),
      invLabel1: materialLabels[0],
      invLabel2: materialLabels[1],
      invLabel3: materialLabels[2],
      invLabel4: materialLabels[3],
      summaryStep1: template.summaryStep1,
      summaryStep2: template.summaryStep2,
      orderListStep1: template.summaryStep1,
      orderListStep2: template.summaryStep2
    };
    setBlockSettings(nextSettings);
    void persistWorkflowSettings(nextSettings, "Template applied and saved.");
  }

  async function handleSave() {
    if (!blockSettings) return;
    await persistWorkflowSettings(blockSettings, "Workflow settings saved.");
  }

  function renderHeadingList(key: WorkflowHeadingListKey, emptyTitle: string, addTitle: string, placeholder: string) {
    const items = blockSettings?.[key] ?? [];
    return (
      <div className="workflow-settings-list">
        <div className="quick-reply-template-heading">
          <strong>{emptyTitle}</strong>
          <button className="button secondary" type="button" disabled={!canEdit || saving || !blockSettings} onClick={() => addListItem(key, addTitle)}>
            Add
          </button>
        </div>
        {items.length === 0 ? (
          <p className="muted-copy">No custom rows yet.</p>
        ) : null}
        {items.map((item, index) => (
          <div className="workflow-settings-row" key={item.id}>
            <span>{index + 1}</span>
            <input
              className="input"
              value={item.title}
              disabled={!canEdit || saving}
              placeholder={placeholder}
              onChange={event => renameListItem(key, item.id, event.target.value)}
            />
            <button className="icon-action danger" type="button" disabled={!canEdit || saving} onClick={() => removeListItem(key, item.id)} aria-label="Remove">
              ×
            </button>
          </div>
        ))}
      </div>
    );
  }

  if (loading) {
    return (
      <section className="card app-card">
        <CardTitle icon="checklist" eyebrow="Workflow Steps" title="Loading workflow settings" />
        <p className="muted-copy">Loading app-compatible workspace block settings...</p>
      </section>
    );
  }

  if (!blockSettings) {
    return <PlaceholderSection title="Workflow Steps" detail={error || "Workflow settings could not be loaded yet."} />;
  }

  const steps = workflowStepOptions(blockSettings);
  const activeStatuses = Array.isArray(blockSettings.activeStatuses)
    ? blockSettings.activeStatuses
    : DEFAULT_ACTIVE_STATUS_OPTIONS;
  const statusOptions = Array.from(new Set([...STATUS_OPTION_POOL, ...activeStatuses].map(item => item.trim()).filter(Boolean)));

  return (
    <div className="settings-card-stack">
      {!canEdit ? (
        <section className="card app-card">
          <CardTitle icon="lock" eyebrow="Locked" title={canEditRole ? "Workflow customization starts with NivaDesk Lite" : "Workflow settings are read-only"} />
          <p className="muted-copy">
            {canEditRole ? "Demo / Free workspaces can view these settings, but saving workflow block changes is available from NivaDesk Lite." : "Your current workspace role cannot edit workflow settings."}
          </p>
        </section>
      ) : null}

      <section className="card app-card quick-reply-settings-card">
        <CardTitle icon="checklist" eyebrow="Business Type" title="Standard workflow template" />
        <label className="quick-reply-settings-label">
          <span>Select Industry</span>
          <select
            className="input"
            value={blockSettings.businessType}
            disabled={!canEdit || saving}
            onChange={event => selectBusinessType(event.target.value)}
          >
            {BUSINESS_TYPES.map(type => <option value={type} key={type}>{type}</option>)}
          </select>
        </label>
        <label className="quick-reply-settings-label">
          <span>Business description</span>
          <textarea
            className="input"
            value={blockSettings.businessDescriptionPrompt}
            disabled={!canEdit || saving}
            rows={4}
            placeholder="Describe what the business does and which workflow steps matter."
            onChange={event => updateSetting("businessDescriptionPrompt", event.target.value)}
          />
        </label>
        <div className="settings-action-row">
          <button className="button secondary" type="button" disabled={!canEdit || saving} onClick={applyStandardTemplate}>
            Apply Standard Template
          </button>
        </div>
        <p className="muted-copy">Matches the app’s Business Type template flow. Saving writes to app-compatible workflow and block heading fields.</p>
      </section>

      <section className="card app-card quick-reply-settings-card">
        <CardTitle icon="checklist" eyebrow="Status Menu Options" title="Order status dropdowns" />
        <button className="status-menu-toggle-card" type="button" onClick={() => setStatusMenuOpen(open => !open)}>
          <span className="status-menu-toggle-icon" aria-hidden="true">{statusMenuOpen ? "⌄" : "›"}</span>
          <span>
            <strong>{statusMenuOpen ? "Hide Status Options" : "Show Status Options"}</strong>
            <small>{activeStatuses.length} active statuses selected</small>
          </span>
          <b>{statusMenuOpen ? "Collapse" : "Expand"}</b>
        </button>

        {statusMenuOpen ? (
          <div className="workflow-status-option-list">
            {statusOptions.map(option => {
              const checked = activeStatuses.some(active => active.toLowerCase() === option.toLowerCase());
              return (
                <label className={checked ? "workflow-status-option active" : "workflow-status-option"} key={option}>
                  <span aria-hidden="true">{checked ? "✓" : "○"}</span>
                  <strong>{option}</strong>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!canEdit || saving}
                    onChange={event => toggleActiveStatus(option, event.target.checked)}
                  />
                </label>
              );
            })}
          </div>
        ) : null}
        <p className="muted-copy">These options match the app’s status menu pool and control the dropdowns used in web order cards.</p>
      </section>

      <section className="card app-card quick-reply-settings-card">
        <CardTitle icon="checklist" eyebrow="Production Steps" title="Status dropdown headings" />
        {renderHeadingList("customSteps", "Custom Status Menus", "New Step", "Step name")}
      </section>

      <section className="card app-card quick-reply-settings-card">
        <CardTitle icon="check" eyebrow="Production Toggles" title="Yes / No checks" />
        {renderHeadingList("customToggles", "Extra Yes / No checks", "New Toggle", "Toggle name")}
      </section>

      <section className="card app-card quick-reply-settings-card">
        <CardTitle icon="shippingBox" eyebrow="Materials & Inventory" title="Material check headings" />
        {renderHeadingList("materialsDefaultChecks", "Default material checks", "New Material Check", "Material check name")}
        <div className="settings-divider" />
        {renderHeadingList("materialsToggles", "Extra Yes / No checks", "New Material Toggle", "Material toggle name")}
        <div className="settings-divider" />
        <label className="settings-toggle-row">
          <span>
            <strong>Show Notes / Supplier</strong>
            <small>Matches the app’s Materials & Inventory notes/supplier field visibility.</small>
          </span>
          <input
            type="checkbox"
            checked={blockSettings.showMaterialsNotesSupplier}
            disabled={!canEdit || saving}
            onChange={event => updateSetting("showMaterialsNotesSupplier", event.target.checked)}
          />
        </label>
        <label className="quick-reply-settings-label">
          Notes / Supplier heading
          <input
            className="input"
            value={blockSettings.materialsNotesSupplierLabel}
            disabled={!canEdit || saving}
            onChange={event => updateSetting("materialsNotesSupplierLabel", event.target.value)}
            placeholder="Notes / Supplier"
          />
        </label>
      </section>

      <section className="card app-card quick-reply-settings-card">
        <CardTitle icon="orders" eyebrow="Order Summary" title="Summary rows and small order badges" />
        <div className="workflow-select-grid">
          {[
            ["Summary 1", "summaryStep1"],
            ["Summary 2", "summaryStep2"],
            ["Badge 1", "orderListStep1"],
            ["Badge 2", "orderListStep2"]
          ].map(([label, key]) => (
            <label className="quick-reply-settings-label" key={key}>
              {label}
              <select
                className="input"
                value={String(blockSettings[key as keyof BlockHeadingSettings] || "")}
                disabled={!canEdit || saving}
                onChange={event => updateSetting(key as "summaryStep1" | "summaryStep2" | "orderListStep1" | "orderListStep2", event.target.value)}
              >
                {steps.map(step => <option key={step.id} value={step.title}>{step.title}</option>)}
              </select>
            </label>
          ))}
        </div>
        <p className="muted-copy">These fields match the app’s Order Summary status rows and the shortened badges on the small order cards.</p>
      </section>

      <section className="card app-card quick-reply-settings-actions">
        <div>
          <strong>Shared workflow settings</strong>
          <p className="muted-copy">Saved values write to the same app-compatible companySettings block heading fields used by Mac, iPad, iPhone and web.</p>
        </div>
        <div className="settings-action-row">
          <button className="button" type="button" disabled={!canEdit || saving} onClick={handleSave}>
            {saving ? "Saving..." : "Save Workflow Settings"}
          </button>
        </div>
        {status ? <p className="success-copy">{status}</p> : null}
        {error ? <p className="layout-error">{error}</p> : null}
      </section>
    </div>
  );
}

function newCompanyNumber(title = "New Number", value = ""): CompanyNumberSetting {
  const randomId = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `company-number-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return { id: randomId, title, value };
}

function settingsWithDefaultCompanyNumbers(settings: WorkspaceSettingsOverview | null) {
  if (!settings) return null;
  if (settings.companyNumbers.length > 0) return settings;
  return {
    ...settings,
    companyNumbers: [
      newCompanyNumber("VAT Number"),
      newCompanyNumber("EORI Number"),
      newCompanyNumber("Company No.")
    ]
  };
}

const PDF_SETTING_TOGGLES: Array<[keyof Pick<WorkspaceSettingsOverview,
  "pdfShowCustomer" |
  "pdfShowContact" |
  "pdfShowPreview" |
  "pdfShowFinCustomer" |
  "pdfShowPaymentMethod" |
  "pdfShowFinInternal" |
  "pdfShowStatus" |
  "pdfShowShipping" |
  "pdfShowMaterials" |
  "pdfShowPriority"
>, string]> = [
  ["pdfShowCustomer", "Customer & Design"],
  ["pdfShowContact", "Contact & Notes"],
  ["pdfShowPreview", "Preview Image"],
  ["pdfShowMaterials", "Materials & Inventory"],
  ["pdfShowPriority", "Priority / Risk"],
  ["pdfShowFinCustomer", "Financials: Paid & Remaining"],
  ["pdfShowPaymentMethod", "Payment Method"],
  ["pdfShowFinInternal", "Internal Financials"],
  ["pdfShowStatus", "Production Status"],
  ["pdfShowShipping", "Shipping & Tracking"]
];

function PdfExportSettingsSection({
  workspace,
  settings,
  onSaved
}: {
  workspace: WorkspaceContext;
  settings: WorkspaceSettingsOverview | null;
  onSaved: (settings: WorkspaceSettingsOverview) => void;
}) {
  const [draft, setDraft] = useState<WorkspaceSettingsOverview | null>(settings);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const isWorkflowOnly = normalizeWorkspaceRole(workspace.role) === "workflow";
  const canEdit = isWorkflowOnly || canEditWorkspaceSettingsForRole(workspace.role);
  const visiblePdfToggles = isWorkflowOnly
    ? PDF_SETTING_TOGGLES.filter(([key]) => !["pdfShowFinCustomer", "pdfShowPaymentMethod", "pdfShowFinInternal"].includes(String(key)))
    : PDF_SETTING_TOGGLES;

  useEffect(() => {
    setDraft(settingsWithDefaultCompanyNumbers(settings));
    setStatus("");
    setError("");
    if (isWorkflowOnly && settings) {
      getPersonalInterfaceSettings(workspace).then(personal => {
        setDraft(current => current ? { ...current, ...personal } : current);
      }).catch(() => undefined);
    }
  }, [settings, isWorkflowOnly, workspace]);

  if (!draft) {
    return <PlaceholderSection title="PDF Export Settings" detail="PDF settings could not be loaded yet." action={<Link className="button secondary" href="/export">Open Export</Link>} />;
  }

  function updateBoolean(key: keyof WorkspaceSettingsOverview, value: boolean) {
    setDraft(current => current ? { ...current, [key]: value } : current);
    setStatus("");
    setError("");
  }

  function updateCompanyNumber(id: string, patch: Partial<CompanyNumberSetting>) {
    setDraft(current => current ? {
      ...current,
      companyNumbers: current.companyNumbers.map(item => item.id === id ? { ...item, ...patch } : item)
    } : current);
    setStatus("");
    setError("");
  }

  function addCompanyNumber() {
    setDraft(current => current ? {
      ...current,
      companyNumbers: [...current.companyNumbers, newCompanyNumber()]
    } : current);
  }

  function removeCompanyNumber(id: string) {
    setDraft(current => current ? {
      ...current,
      companyNumbers: current.companyNumbers.filter(item => item.id !== id)
    } : current);
  }

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    setStatus("");
    setError("");
    try {
      const result = isWorkflowOnly
        ? await savePersonalInterfaceSettings(workspace, {
            pdfShowCustomer: draft.pdfShowCustomer,
            pdfShowContact: draft.pdfShowContact,
            pdfShowPreview: draft.pdfShowPreview,
            pdfShowStatus: draft.pdfShowStatus,
            pdfShowShipping: draft.pdfShowShipping,
            pdfShowMaterials: draft.pdfShowMaterials,
            pdfShowPriority: draft.pdfShowPriority
          })
        : await savePdfExportSettings(workspace, {
            pdfShowCustomer: draft.pdfShowCustomer,
            pdfShowContact: draft.pdfShowContact,
            pdfShowPreview: draft.pdfShowPreview,
            pdfShowFinCustomer: draft.pdfShowFinCustomer,
            pdfShowPaymentMethod: draft.pdfShowPaymentMethod,
            pdfShowFinInternal: draft.pdfShowFinInternal,
            pdfShowStatus: draft.pdfShowStatus,
            pdfShowShipping: draft.pdfShowShipping,
            pdfShowMaterials: draft.pdfShowMaterials,
            pdfShowPriority: draft.pdfShowPriority,
            companyNumbers: draft.companyNumbers
          });
      const savedSettings = { ...draft, ...(result.settings ?? {}) };
      setDraft(savedSettings);
      onSaved(savedSettings);
      setStatus(result.message || "PDF Export settings saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "PDF Export settings could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-card-stack">
      {!canEdit ? (
        <section className="card app-card">
          <CardTitle icon="lock" eyebrow="Safe access" title="Finance-free PDF preferences" />
          <p className="muted-copy">
            {isWorkflowOnly
              ? "Payment and financial PDF fields remain hidden. You can edit your own non-financial export sections below."
              : "Your current workspace role cannot edit PDF Export settings."}
          </p>
        </section>
      ) : null}

      <section className="card app-card quick-reply-settings-card">
        <CardTitle icon="docText" eyebrow="PDF Export Settings" title="Visible PDF sections" />
        <div className="pdf-settings-grid">
          {visiblePdfToggles.map(([key, label]) => (
            <label className="pdf-settings-toggle" key={key}>
              <span>{label}</span>
              <input
                type="checkbox"
                checked={Boolean(draft[key])}
                disabled={!canEdit || saving}
                onChange={event => updateBoolean(key, event.target.checked)}
              />
            </label>
          ))}
        </div>
      </section>

      {!isWorkflowOnly ? <section className="card app-card quick-reply-settings-card">
        <CardTitle icon="notes" eyebrow="Invoice Numbers" title="Company invoice numbers" />
        <div className="quick-reply-template-heading">
          <p className="muted-copy" style={{ margin: 0 }}>VAT, EORI, company number or any reference you want to show on PDF invoices.</p>
          <button className="button secondary" type="button" disabled={!canEdit || saving} onClick={addCompanyNumber}>Add</button>
        </div>
        <div className="company-number-list">
          {draft.companyNumbers.map(item => (
            <div className="company-number-row" key={item.id}>
              <input
                className="input"
                value={item.title}
                disabled={!canEdit || saving}
                onChange={event => updateCompanyNumber(item.id, { title: event.target.value })}
                placeholder="Label"
              />
              <input
                className="input"
                value={item.value}
                disabled={!canEdit || saving}
                onChange={event => updateCompanyNumber(item.id, { value: event.target.value })}
                placeholder="Number / value"
              />
              <button className="icon-action danger" type="button" disabled={!canEdit || saving} onClick={() => removeCompanyNumber(item.id)} aria-label="Remove">
                ×
              </button>
            </div>
          ))}
        </div>
      </section> : null}

      <section className="card app-card quick-reply-settings-actions">
        <div>
          <strong>{isWorkflowOnly ? "Safe PDF access" : "Shared PDF settings"}</strong>
          <p className="muted-copy">Your finance-free PDF section preferences are personal. Shared financial and invoice PDF settings remain owner-managed.</p>
        </div>
        <div className="settings-action-row">
          <Link className="button secondary" href="/export">Open Export</Link>
          <button className="button" type="button" disabled={!canEdit || saving} onClick={handleSave}>
            {saving ? "Saving..." : "Save PDF Settings"}
          </button>
        </div>
        {status ? <p className="success-copy">{status}</p> : null}
        {error ? <p className="layout-error">{error}</p> : null}
      </section>
    </div>
  );
}

function newQuickReplyTemplateItem(title = "", desc = ""): QuickReplyTemplateItem {
  const randomId = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `template-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return { id: randomId, title, desc };
}

function defaultQuickReplyProducts(items: QuickReplyTemplateItem[] | undefined) {
  return items && items.length > 0
    ? items
    : [newQuickReplyTemplateItem("Service / Product 1", "Price starts at $100.")];
}

function defaultQuickReplyRules(items: QuickReplyTemplateItem[] | undefined) {
  return items && items.length > 0
    ? items
    : [newQuickReplyTemplateItem("Delivery Rule", "We usually deliver within 3-5 business days.")];
}

function quickReplyEngineDescription(mode: string) {
  if (mode === "Apple" || mode === "Local") {
    return "Uses Apple Foundation Models on the device. No Ollama setup is required. Works only on Apple Intelligence-capable devices with the model available.";
  }
  if (mode === "AI") return "Uses OpenAI online with your API key.";
  return "Uses your saved products and rules without an AI model.";
}

function QuickReplySettingsSection({
  workspace,
  settings,
  onSaved
}: {
  workspace: WorkspaceContext;
  settings: QuickReplySettings | null;
  onSaved: (settings: QuickReplySettings) => void;
}) {
  const [replyMode, setReplyMode] = useState("AI");
  const [politeness, setPoliteness] = useState("Warm");
  const [replyLength, setReplyLength] = useState("Short");
  const [mainKnowledgeBase, setMainKnowledgeBase] = useState("");
  const [onDeviceKnowledgeBase, setOnDeviceKnowledgeBase] = useState("");
  const [products, setProducts] = useState<QuickReplyTemplateItem[]>(defaultQuickReplyProducts([]));
  const [rules, setRules] = useState<QuickReplyTemplateItem[]>(defaultQuickReplyRules([]));
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [isReplacingOpenAIKey, setIsReplacingOpenAIKey] = useState(false);
  const [clearOpenAIKey, setClearOpenAIKey] = useState(false);
  const [personalLoaded, setPersonalLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [contributionDraft, setContributionDraft] = useState("");
  const [contributions, setContributions] = useState<QuickReplyContributionItem[]>([]);
  const [contributionSaving, setContributionSaving] = useState(false);
  const canEditCore = canEditQuickReplySettingsForRole(workspace.role);
  const canEditPersonal = canEditPersonalQuickReplySettingsForRole(workspace.role);
  const canContribute = canContributeQuickReplyKnowledgeForRole(workspace.role);

  useEffect(() => {
    if (!settings) return;
    setMainKnowledgeBase(settings.aiKnowledgeBase);
    setApiKeyInput("");
    setIsReplacingOpenAIKey(false);
    setClearOpenAIKey(false);
    setStatus("");
    setError("");
  }, [settings]);

  useEffect(() => {
    let active = true;
    if (!canEditPersonal) return;
    loadQuickReplyPersonalSettings(workspace)
      .then(personal => {
        if (!active) return;
        setReplyMode(personal.replyMode === "Local" ? "Apple" : personal.replyMode);
        setPoliteness(personal.quickReplyPoliteness);
        setReplyLength(personal.quickReplyLength);
        setOnDeviceKnowledgeBase(personal.onDeviceKnowledgeBase);
        setProducts(defaultQuickReplyProducts(personal.products));
        setRules(defaultQuickReplyRules(personal.rules));
        setPersonalLoaded(true);
      })
      .catch(loadError => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Could not load your Quick Reply settings.");
      });
    return () => { active = false; };
  }, [workspace.id, canEditPersonal]);

  useEffect(() => {
    if (!canContribute) return;
    listQuickReplyContributions(workspace).then(setContributions).catch(() => undefined);
  }, [workspace.id, canContribute]);

  async function addTeamContribution() {
    if (!canContribute || !contributionDraft.trim()) return;
    setContributionSaving(true);
    setError("");
    try {
      const result = await saveQuickReplyContribution(workspace, contributionDraft.trim());
      setContributionDraft("");
      setContributions(await listQuickReplyContributions(workspace));
      setStatus(result.message || "Contribution added.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not add contribution.");
    } finally {
      setContributionSaving(false);
    }
  }

  async function removeTeamContribution(id: string) {
    try {
      await deleteQuickReplyContribution(workspace, id);
      setContributions(await listQuickReplyContributions(workspace));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not remove contribution.");
    }
  }

  function updateProduct(index: number, patch: Partial<QuickReplyTemplateItem>) {
    setProducts(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  function updateRule(index: number, patch: Partial<QuickReplyTemplateItem>) {
    setRules(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  async function handleSave() {
    if (!settings || !canEditPersonal) return;
    setSaving(true);
    setStatus("");
    setError("");
    try {
      const personalResult = await saveQuickReplyPersonalSettings(workspace, {
        replyMode,
        quickReplyPoliteness: politeness,
        quickReplyLength: replyLength,
        onDeviceKnowledgeBase,
        products,
        rules
      });
      if (canEditCore) {
        const ownerResult = await saveQuickReplySettings(workspace, {
          aiKnowledgeBase: mainKnowledgeBase,
          ...(apiKeyInput.trim() || clearOpenAIKey ? { openAIKey: clearOpenAIKey ? "" : apiKeyInput.trim() } : {})
        });
        if (ownerResult.settings) onSaved(ownerResult.settings);
      }
      setApiKeyInput("");
      setIsReplacingOpenAIKey(false);
      setClearOpenAIKey(false);
      setStatus(personalResult.message || "Your Quick Reply settings were saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Quick Reply settings could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  if (!settings) {
    return <PlaceholderSection title="Quick Reply Settings" detail="Quick Reply settings could not be loaded yet." />;
  }

  const showMaskedOpenAIKey = canEditCore && settings.hasOpenAIKey && !isReplacingOpenAIKey && !clearOpenAIKey;

  return (
    <div className="settings-card-stack">
      <section className="card app-card quick-reply-settings-card quick-reply-settings-shell">
        <div className="quick-reply-settings-main-title">
          <span className="quick-reply-settings-main-icon" aria-hidden="true">✦</span>
          <h2>Quick Reply Settings</h2>
        </div>

        <div className="quick-reply-engine-block">
          <h3>Your Reply Engine</h3>
          <div className={canEditPersonal ? "quick-reply-engine-segment" : "quick-reply-engine-segment is-disabled"}>
            {[
              ["Apple", "◉", "On-Device Settings"],
              ["AI", "◎", "OpenAI Online"],
              ["Offline", "▤", "Offline Template"]
            ].map(([value, icon, label]) => (
              <button
                key={value}
                className={replyMode === value ? "active" : ""}
                type="button"
                disabled={!canEditPersonal}
                onClick={() => setReplyMode(value)}
              >
                <span aria-hidden="true">{icon}</span>
                {label}
              </button>
            ))}
          </div>
          {replyMode === "Apple" ? (
            <p className="muted-copy">Configure personal on-device knowledge here. On-device generation runs in the supported mobile or desktop app, not in the web browser.</p>
          ) : (
            <p className="muted-copy">{quickReplyEngineDescription(replyMode)}</p>
          )}
        </div>

        <div className="quick-reply-style-panel">
          <h3>Your Default Reply Style</h3>
          <div className="quick-reply-setting-group">
            <span>Politeness</span>
            <div className={canEditPersonal ? "quick-reply-purple-segment" : "quick-reply-purple-segment is-disabled"}>
              {["Direct", "Warm", "Very Polite"].map(option => (
                <button key={option} className={politeness === option ? "active" : ""} type="button" disabled={!canEditPersonal} onClick={() => setPoliteness(option)}>{option}</button>
              ))}
            </div>
          </div>
          <div className="quick-reply-setting-group">
            <span>Length</span>
            <div className={canEditPersonal ? "quick-reply-purple-segment" : "quick-reply-purple-segment is-disabled"}>
              {["Short", "Balanced", "Detailed"].map(option => (
                <button key={option} className={replyLength === option ? "active" : ""} type="button" disabled={!canEditPersonal} onClick={() => setReplyLength(option)}>{option}</button>
              ))}
            </div>
          </div>
          <p className="muted-copy">These personal settings sync across your devices and do not change another team member&apos;s templates.</p>
        </div>

        {replyMode === "Apple" ? (
          <div className="quick-reply-settings-panel">
            <CardTitle icon="dashboard" eyebrow="On-Device Settings" title="Personal On-Device Knowledge" />
            <p className="muted-copy">Use this knowledge with Apple On-Device AI in the Mac/iPhone/iPad app. Android on-device generation requires a separate Gemini Nano integration and is not presented as active on web.</p>
            <KnowledgeBaseEditor
              title="My On-Device Knowledge"
              value={onDeviceKnowledgeBase}
              disabled={!canEditPersonal}
              onChange={setOnDeviceKnowledgeBase}
            />
          </div>
        ) : null}

        {replyMode === "AI" ? (
          <>
            {canEditCore ? (
              <>
                <div className="quick-reply-api-card">
                  <span className="quick-reply-api-icon" aria-hidden="true">⌕</span>
                  <div className="quick-reply-api-title">OpenAI API Key</div>
                  <div className="quick-reply-api-fields">
                    <input
                      className={showMaskedOpenAIKey ? "input quick-reply-masked-key" : "input"}
                      type={showMaskedOpenAIKey ? "text" : "password"}
                      value={showMaskedOpenAIKey ? "sk-proj-••••" : apiKeyInput}
                      readOnly={showMaskedOpenAIKey}
                      disabled={clearOpenAIKey}
                      onFocus={() => { if (showMaskedOpenAIKey) setIsReplacingOpenAIKey(true); }}
                      onChange={event => { if (!showMaskedOpenAIKey) setApiKeyInput(event.target.value); }}
                      placeholder={settings.hasOpenAIKey ? "Paste a new key to replace" : "sk-proj-..."}
                    />
                    <span>Stored server-side and never shared with workspace members.</span>
                  </div>
                </div>
                <div className="quick-reply-key-row">
                  <span className={settings.hasOpenAIKey && !clearOpenAIKey ? "studio-pill success" : "studio-pill"}>
                    {clearOpenAIKey ? "Key will be cleared" : settings.hasOpenAIKey ? "API key configured" : "No API key configured"}
                  </span>
                  {showMaskedOpenAIKey ? <button className="button secondary" type="button" onClick={() => setIsReplacingOpenAIKey(true)}>Replace Key</button> : null}
                  {isReplacingOpenAIKey ? <button className="button secondary" type="button" onClick={() => { setIsReplacingOpenAIKey(false); setApiKeyInput(""); }}>Cancel Replace</button> : null}
                  {settings.hasOpenAIKey ? <button className="button secondary" type="button" onClick={() => { setClearOpenAIKey(current => !current); setIsReplacingOpenAIKey(false); setApiKeyInput(""); }}>{clearOpenAIKey ? "Keep Key" : "Clear Key"}</button> : null}
                </div>
                <KnowledgeBaseEditor title="Company Knowledge Base (For OpenAI)" value={mainKnowledgeBase} disabled={false} onChange={setMainKnowledgeBase} />
              </>
            ) : (
              <div className="quick-reply-settings-panel">
                <CardTitle icon="lock" eyebrow="OpenAI Online" title="Workspace AI Access" />
                <span className={settings.hasOpenAIKey ? "studio-pill success" : "studio-pill"}>
                  {settings.hasOpenAIKey ? "Workspace OpenAI key configured" : "Workspace OpenAI key not configured"}
                </span>
                <p className="muted-copy">Only the workspace owner can view or change the API key and main Company Knowledge Base. You can use OpenAI replies once a key is configured.</p>
              </div>
            )}
            {canContribute ? (
              <section className="quick-reply-settings-panel">
                <CardTitle icon="notes" eyebrow="Team Contributions" title="Additional Knowledge for OpenAI" />
                <p className="muted-copy">Add supporting information for shared OpenAI replies without changing the owner-managed Company Knowledge Base.</p>
                <textarea className="quick-reply-settings-textarea" value={contributionDraft} onChange={event => setContributionDraft(event.target.value)} placeholder="Add an additional fact or instruction for AI replies..." />
                <button className="button" type="button" disabled={contributionSaving || !contributionDraft.trim()} onClick={addTeamContribution}>{contributionSaving ? "Adding..." : "Add Contribution"}</button>
                <div className="quick-reply-template-list">
                  {contributions.map(item => (
                    <div className="quick-reply-template-row" key={item.id}>
                      <div><strong>{item.authorName}</strong><p className="muted-copy">{item.text}</p></div>
                      {item.canDelete ? <button className="icon-action danger" type="button" onClick={() => removeTeamContribution(item.id)} aria-label="Remove">×</button> : null}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        ) : null}

        {replyMode === "Offline" ? (
          <div className="quick-reply-settings-panel">
            <CardTitle icon="notes" eyebrow="Offline Template" title="My Offline Template" />
            <p className="muted-copy">Your own reusable products and rules sync across your devices without changing the workspace owner&apos;s Company Knowledge Base.</p>
            <QuickReplyTemplateEditor title="Products / Services" addLabel="Add Product" titlePlaceholder="Product Name" descPlaceholder="Product Detail / Price" items={products} disabled={!canEditPersonal} onAdd={() => setProducts(current => [...current, newQuickReplyTemplateItem()])} onRemove={index => setProducts(current => current.filter((_, itemIndex) => itemIndex !== index))} onChange={updateProduct} />
            <div className="settings-divider" />
            <QuickReplyTemplateEditor title="Custom Rules / FAQs" addLabel="Add Rule" titlePlaceholder="Rule Title" descPlaceholder="Rule Description" items={rules} disabled={!canEditPersonal} onAdd={() => setRules(current => [...current, newQuickReplyTemplateItem()])} onRemove={index => setRules(current => current.filter((_, itemIndex) => itemIndex !== index))} onChange={updateRule} />
          </div>
        ) : null}

        <div className="quick-reply-settings-actions quick-reply-settings-footer">
          <Link className="button secondary" href="/quick-reply">Open Quick Reply</Link>
          <button className="button" type="button" disabled={!canEditPersonal || !personalLoaded || saving} onClick={handleSave}>
            {saving ? "Saving..." : "Save My Settings"}
          </button>
        </div>
        {status ? <p className="success-copy">{status}</p> : null}
        {error ? <p className="layout-error">{error}</p> : null}
      </section>
    </div>
  );
}

function KnowledgeBaseEditor({
  title,
  value,
  disabled,
  onChange
}: {
  title: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="quick-reply-settings-label quick-reply-knowledge-panel">
      <span>{title}</span>
      <textarea
        className="quick-reply-settings-textarea"
        value={value}
        disabled={disabled}
        onChange={event => onChange(event.target.value)}
        placeholder="Add your pricing, process, policies, FAQs and common customer answers here..."
      />
      <span>This Knowledge Base is synced across Mac, iPad and iPhone for the same company.</span>
    </label>
  );
}

function QuickReplyTemplateEditor({
  title,
  addLabel,
  titlePlaceholder,
  descPlaceholder,
  items,
  disabled,
  onAdd,
  onRemove,
  onChange
}: {
  title: string;
  addLabel: string;
  titlePlaceholder: string;
  descPlaceholder: string;
  items: QuickReplyTemplateItem[];
  disabled: boolean;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onChange: (index: number, patch: Partial<QuickReplyTemplateItem>) => void;
}) {
  return (
    <div className="quick-reply-template-editor">
      <div className="quick-reply-template-heading">
        <strong>{title}</strong>
        <button className="button secondary" type="button" disabled={disabled} onClick={onAdd}>{addLabel}</button>
      </div>
      <div className="quick-reply-template-list">
        {items.map((item, index) => (
          <div className="quick-reply-template-row" key={item.id}>
            <div>
              <input
                className="input"
                value={item.title}
                disabled={disabled}
                onChange={event => onChange(index, { title: event.target.value })}
                placeholder={titlePlaceholder}
              />
              <textarea
                className="quick-reply-template-description"
                value={item.desc}
                disabled={disabled}
                onChange={event => onChange(index, { desc: event.target.value })}
                placeholder={descPlaceholder}
              />
            </div>
            <button className="icon-action danger" type="button" disabled={disabled || items.length <= 1} onClick={() => onRemove(index)} aria-label="Remove">
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function SafetyUploadsSection({
  workspace,
  settings,
  onSaved
}: {
  workspace: WorkspaceContext;
  settings: WorkspaceSettingsOverview | null;
  onSaved: (settings: WorkspaceSettingsOverview) => void;
}) {
  const [requirePolicy, setRequirePolicy] = useState(true);
  const [maxFileSizeMB, setMaxFileSizeMB] = useState(10);
  const [browserAccepted, setBrowserAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const canEdit = canEditWorkspaceSettingsForRole(workspace.role);

  useEffect(() => {
    if (!settings) return;
    setRequirePolicy(settings.uploadSafetyRequirePolicyAcceptance);
    setMaxFileSizeMB(Math.min(Math.max(Math.round(settings.uploadSafetyMaxFileSizeMB || 10), 1), 50));
  }, [settings]);

  useEffect(() => {
    const accepted = window.localStorage.getItem(uploadSafetyAcceptanceKey(workspace.id)) === "accepted";
    setBrowserAccepted(accepted);
  }, [workspace.id]);

  function updateBrowserAccepted(nextAccepted: boolean) {
    setBrowserAccepted(nextAccepted);
    const key = uploadSafetyAcceptanceKey(workspace.id);
    if (nextAccepted) window.localStorage.setItem(key, "accepted");
    else window.localStorage.removeItem(key);
  }

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    setStatus("");
    setError("");
    try {
      const result = await saveUploadSafetySettings(workspace, {
        uploadSafetyRequirePolicyAcceptance: requirePolicy,
        uploadSafetyMaxFileSizeMB: maxFileSizeMB
      });
      onSaved({
        ...settings,
        uploadSafetyRequirePolicyAcceptance: result.settings?.uploadSafetyRequirePolicyAcceptance ?? requirePolicy,
        uploadSafetyMaxFileSizeMB: result.settings?.uploadSafetyMaxFileSizeMB ?? maxFileSizeMB
      });
      setStatus(result.message || "Upload Safety settings saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Upload Safety settings could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-card-stack">
      <section className="card app-card">
        <CardTitle icon="lock" eyebrow="Safety & Uploads" title="Upload safety policy" />
        <p className="muted-copy">
          Use this section to explain the upload rules to your team and reduce the risk of illegal, unsafe or unsuitable files being stored in this workspace.
        </p>
        <div className="settings-toggle-stack">
          <label className="settings-toggle-row">
            <span>
              <strong>Require upload policy acceptance before upload</strong>
              <small>When enabled, this browser asks the user to accept the upload policy before Client Files upload.</small>
            </span>
            <input
              type="checkbox"
              checked={requirePolicy}
              disabled={!canEdit || saving}
              onChange={event => setRequirePolicy(event.target.checked)}
            />
          </label>

          <label className="settings-toggle-row">
            <span>
              <strong>This browser has accepted the upload policy</strong>
              <small>This remains local to this browser, matching the app’s device-level acceptance behavior.</small>
            </span>
            <input
              type="checkbox"
              checked={browserAccepted}
              onChange={event => updateBrowserAccepted(event.target.checked)}
            />
          </label>

          <label className="settings-range-row">
            <span>
              <strong>Maximum upload size</strong>
              <small>Files larger than this are blocked before upload.</small>
            </span>
            <input
              className="input"
              type="number"
              min={1}
              max={50}
              step={1}
              value={maxFileSizeMB}
              disabled={!canEdit || saving}
              onChange={event => setMaxFileSizeMB(Math.min(Math.max(Number(event.target.value) || 1, 1), 50))}
            />
            <b>MB</b>
          </label>
        </div>

        <div className="settings-mini-grid">
          <InfoTile label="Policy prompt" value={requirePolicy ? "Required" : "Not required"} />
          <InfoTile label="Accepted in browser" value={browserAccepted ? "Accepted" : "Not accepted"} />
          <InfoTile label="Max file size" value={`${Math.round(maxFileSizeMB)} MB`} />
        </div>
        <div className="quick-reply-settings-info">
          <strong>{browserAccepted ? "Upload policy is accepted on this browser." : "The first upload will ask this browser to accept the upload policy."}</strong>
          <p>Order previews, logos and avatars accept image files. Client Files accepts images and PDF documents only.</p>
        </div>
        <div className="settings-action-row">
          <button className="button" type="button" disabled={!canEdit || saving} onClick={handleSave}>
            {saving ? "Saving..." : "Save Upload Safety"}
          </button>
        </div>
        {status ? <p className="success-copy">{status}</p> : null}
        {error ? <p className="layout-error">{error}</p> : null}
        <p className="muted-copy">Allowed Client Files types remain PDF, JPG, PNG, HEIC, HEIF, WEBP, PSD and PSB. Plan guards still keep cloud file upload on Pro and Team.</p>
      </section>

      <section className="card app-card">
        <CardTitle icon="check" eyebrow="What users must understand" title="Upload rules" />
        <div className="settings-rule-list">
          <IntegrationInfoRow number="1" title="Only upload suitable files" detail="Users must only upload legal, safe and work-related files that belong in this workspace." />
          <IntegrationInfoRow number="2" title="No illegal or harmful content" detail="Illegal, abusive, explicit, stolen, harmful or unrelated files must not be uploaded." />
          <IntegrationInfoRow number="3" title="Client approval and rights" detail="If a file belongs to a client or third party, the user should have permission to use it for the order." />
          <IntegrationInfoRow number="4" title="Owner can remove files" detail="Workspace owners should remove unsuitable files and can remove users from the workspace if needed." />
        </div>
      </section>

      <section className="card app-card">
        <CardTitle icon="lock" eyebrow="What the app does" title="Workspace upload protection" />
        <div className="settings-rule-list">
          <IntegrationInfoRow number="1" title="Company workspace only" detail="Uploads are saved under the active Company ID so they stay connected to this workspace." />
          <IntegrationInfoRow number="2" title="Allowed file types only" detail="Client Files accepts PDF, JPG, PNG, HEIC, HEIF, WEBP, PSD and PSB, while previews, logos and avatars stay image-only." />
          <IntegrationInfoRow number="3" title="File size limit" detail="Files larger than the selected limit are blocked before upload." />
          <IntegrationInfoRow number="4" title="Upload audit log" detail="Each upload records the company, user, file type, file size, upload date, source and related order when available." />
        </div>
      </section>

      <section className="card app-card">
        <CardTitle icon="lock" eyebrow="Important limitation" title="Human review still matters" />
        <p className="muted-copy">
          This does not automatically judge the content of a file. It adds clear rules, upload limits and an audit trail. Owners should still review and remove anything unsuitable.
        </p>
      </section>
    </div>
  );
}

function uploadSafetyAcceptanceKey(workspaceId: string) {
  return `studioflow-upload-policy-accepted:${workspaceId}`;
}

function AccountSection({
  workspace,
  settings,
  userEmail,
  onSaved,
  hideWorkspaceIdentity = false
}: {
  workspace: WorkspaceContext;
  settings: WorkspaceSettingsOverview | null;
  userEmail: string;
  onSaved: (settings: WorkspaceSettingsOverview) => void;
  hideWorkspaceIdentity?: boolean;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [displayName, setDisplayName] = useState(workspace.currentMemberDisplayName);
  const [companyName, setCompanyName] = useState(workspace.name);
  const [accountPhotoUrl, setAccountPhotoUrl] = useState(workspace.currentMemberPhotoURL);
  const [accountEmail, setAccountEmail] = useState(userEmail);
  const [emailDraft, setEmailDraft] = useState(userEmail);
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [profileStatus, setProfileStatus] = useState("");
  const [profileError, setProfileError] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [pendingLogoFile, setPendingLogoFile] = useState<File | null>(null);
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const canEditLogo = canManageWorkspaceLogoForRole(workspace.role);
  const canUploadLogo = Boolean(workspace.entitlements.features.workspace_logo_upload);
  const requirePolicy = settings?.uploadSafetyRequirePolicyAcceptance ?? true;
  const maxSizeMB = settings?.uploadSafetyMaxFileSizeMB ?? 10;
  const logoUrl = settings?.appLogoUrl?.trim() ?? "";
  const accountLanguage = settings?.selectedLanguage ?? "English";
  const t = (text: string) => studioT(text, accountLanguage);
  const canEditCompanyName = Boolean(user && (workspace.ownerUid === user.uid || workspace.role === "owner"));
  const googlePhotoUrl = user?.providerData.find(provider => provider.providerId === "google.com")?.photoURL?.trim() ?? "";
  const accountInitials = (displayName || accountEmail || userEmail || "NivaDesk")
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join("") || "S";

  useEffect(() => {
    setDisplayName(workspace.currentMemberDisplayName);
    setAccountPhotoUrl(workspace.currentMemberPhotoURL);
  }, [workspace.currentMemberDisplayName, workspace.currentMemberPhotoURL]);

  useEffect(() => {
    setCompanyName(workspace.name);
  }, [workspace.name]);

  useEffect(() => {
    setAccountEmail(userEmail);
    setEmailDraft(userEmail);
  }, [userEmail]);

  useEffect(() => {
    setPolicyAccepted(window.localStorage.getItem(uploadSafetyAcceptanceKey(workspace.id)) === "accepted");
  }, [workspace.id]);

  async function handleChangeEmail() {
    const cleanEmail = emailDraft.trim().toLowerCase();
    const currentEmail = accountEmail.trim().toLowerCase();
    setProfileStatus("");
    setProfileError("");
    if (!cleanEmail) {
      setProfileError("Enter a valid email address.");
      return;
    }
    if (cleanEmail === currentEmail) {
      setProfileStatus("This is already your sign-in email.");
      return;
    }
    const confirmed = window.confirm("Change your sign-in email to " + cleanEmail + "? You can change it again after 10 days.");
    if (!confirmed) return;

    setSavingEmail(true);
    try {
      const result = await changeAccountEmail(workspace, { email: cleanEmail });
      const nextEmail = result.profile?.email ?? cleanEmail;
      setAccountEmail(nextEmail);
      setEmailDraft(nextEmail);
      await auth.currentUser?.reload();
      await auth.currentUser?.getIdToken(true);
      setProfileStatus(result.message || "Email updated. You can change it again after 10 days.");
    } catch (emailError) {
      setProfileError(emailError instanceof Error ? emailError.message : "Email could not be changed.");
    } finally {
      setSavingEmail(false);
    }
  }

  async function handleSaveProfile() {
    setSavingProfile(true);
    setProfileStatus("");
    setProfileError("");
    try {
      const result = await saveAccountProfile(workspace, { displayName, companyName });
      const profile = result.profile;
      if (profile) {
        setDisplayName(profile.displayName);
        setCompanyName(profile.companyName);
      }
      setProfileStatus(result.message || "Profile updated.");
    } catch (saveError) {
      setProfileError(saveError instanceof Error ? saveError.message : "Profile could not be saved.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleUseGooglePhoto() {
    if (!googlePhotoUrl) return;
    setSavingAvatar(true);
    setProfileStatus("");
    setProfileError("");
    try {
      const result = await saveAccountAvatar(workspace, { photoURL: googlePhotoUrl });
      setAccountPhotoUrl(result.profile?.photoURL ?? googlePhotoUrl);
      setProfileStatus(result.message || "Avatar updated.");
    } catch (avatarError) {
      setProfileError(avatarError instanceof Error ? avatarError.message : "Avatar could not be saved.");
    } finally {
      setSavingAvatar(false);
    }
  }

  async function handleRemoveAvatar() {
    setSavingAvatar(true);
    setProfileStatus("");
    setProfileError("");
    try {
      const result = await saveAccountAvatar(workspace, { photoURL: "" });
      setAccountPhotoUrl(result.profile?.photoURL ?? "");
      setProfileStatus(result.message || "Avatar removed.");
    } catch (avatarError) {
      setProfileError(avatarError instanceof Error ? avatarError.message : "Avatar could not be removed.");
    } finally {
      setSavingAvatar(false);
    }
  }

  async function handleAvatarFile(file: File | undefined) {
    if (!file) return;
    setSavingAvatar(true);
    setProfileStatus("");
    setProfileError("");
    try {
      const result = await uploadAccountAvatar(workspace, file);
      setAccountPhotoUrl(result.profile?.photoURL ?? "");
      setProfileStatus(result.message || "Avatar updated.");
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    } catch (avatarError) {
      setProfileError(avatarError instanceof Error ? avatarError.message : "Avatar could not be uploaded.");
    } finally {
      setSavingAvatar(false);
    }
  }

  async function handlePasswordReset() {
    setSendingReset(true);
    setProfileStatus("");
    setProfileError("");
    try {
      await sendAccountPasswordReset(accountEmail || userEmail);
      setProfileStatus("Password reset email sent.");
    } catch (resetError) {
      setProfileError(resetError instanceof Error ? resetError.message : "Password reset email could not be sent.");
    } finally {
      setSendingReset(false);
    }
  }

  async function handleSignOut() {
    const confirmed = window.confirm("Sign out of NivaDesk on this browser?");
    if (!confirmed) return;
    setSigningOut(true);
    setProfileStatus("");
    setProfileError("");
    try {
      await signOut(auth);
      router.replace("/login");
    } catch (signOutError) {
      setProfileError(signOutError instanceof Error ? signOutError.message : "Could not sign out.");
      setSigningOut(false);
    }
  }

  async function saveLogoResult(result: { message?: string; settings?: { appLogoUrl?: string } }) {
    if (!settings) return;
    const nextSettings = { ...settings, ...(result.settings ?? {}) };
    onSaved(nextSettings);
    setStatus(result.message || "Workspace logo saved.");
  }

  async function uploadLogo(file: File, acceptedPolicy: boolean) {
    if (!settings || !user) return;
    setUploadingLogo(true);
    setStatus("");
    setError("");
    try {
      const result = await uploadWorkspaceLogo({
        workspace,
        file,
        user: {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName
        },
        policyAccepted: acceptedPolicy,
        maxSizeMB
      });
      await saveLogoResult(result);
      setPendingLogoFile(null);
      if (logoInputRef.current) logoInputRef.current.value = "";
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Workspace logo could not be uploaded.");
    } finally {
      setUploadingLogo(false);
    }
  }

  function handleLogoFile(file: File | undefined) {
    if (!file) return;
    if (!settings) {
      setError("Workspace settings are still loading.");
      return;
    }
    if (!canEditLogo) {
      setError("Your workspace role cannot edit Workspace Logo.");
      return;
    }
    if (requirePolicy && !policyAccepted) {
      setPendingLogoFile(file);
      setStatus("");
      setError("");
      return;
    }
    void uploadLogo(file, policyAccepted || !requirePolicy);
  }

  function openLogoPicker() {
    setStatus("");
    setError("");
    if (!settings) {
      setError("Workspace settings are still loading.");
      return;
    }
    if (!canEditLogo) {
      setError("Your workspace role cannot edit Workspace Logo.");
      return;
    }
    logoInputRef.current?.click();
  }

  async function handleAcceptPolicyAndUpload() {
    if (!pendingLogoFile) return;
    const key = uploadSafetyAcceptanceKey(workspace.id);
    window.localStorage.setItem(key, "accepted");
    setPolicyAccepted(true);
    const file = pendingLogoFile;
    setPendingLogoFile(null);
    await uploadLogo(file, true);
  }

  async function handleRemoveLogo() {
    if (!settings) return;
    setUploadingLogo(true);
    setStatus("");
    setError("");
    try {
      const result = await saveWorkspaceLogoUrl(workspace, "");
      await saveLogoResult(result);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Workspace logo could not be removed.");
    } finally {
      setUploadingLogo(false);
    }
  }

  return (
    <div className="settings-card-stack">
      <section className="card app-card account-profile-card">
        <CardTitle icon="customer" eyebrow="General" title="Profile & Security" />
        <div className="account-profile-panel">
          <div className="account-avatar-preview">
            {accountPhotoUrl ? (
              <img src={accountPhotoUrl} alt={displayName || userEmail || "Account avatar"} />
            ) : (
              <span>{accountInitials}</span>
            )}
          </div>
          <div className="account-profile-copy">
            <strong>Profile Photo</strong>
            <p className="muted-copy">Your profile photo is shown to team members in this workspace.</p>
            <div className="workspace-logo-actions">
              <input
                ref={avatarInputRef}
                type="file"
                accept={ACCOUNT_AVATAR_ACCEPT}
                hidden
                onChange={event => void handleAvatarFile(event.target.files?.[0])}
              />
              <button className="button secondary" type="button" disabled={savingAvatar} onClick={() => avatarInputRef.current?.click()}>
                {savingAvatar ? "Saving..." : accountPhotoUrl ? "Change Avatar" : "Upload Avatar"}
              </button>
              {googlePhotoUrl && googlePhotoUrl !== accountPhotoUrl ? (
                <button className="button secondary" type="button" disabled={savingAvatar} onClick={handleUseGooglePhoto}>
                  {savingAvatar ? "Saving..." : "Use Google Photo"}
                </button>
              ) : null}
              {accountPhotoUrl ? (
                <button className="button secondary" type="button" disabled={savingAvatar} onClick={handleRemoveAvatar}>
                  {savingAvatar ? "Saving..." : "Remove Avatar"}
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="account-profile-fields">
          <label className="quick-reply-settings-label">
            Email
            <div className="settings-inline-row">
              <input
                className="input"
                value={emailDraft}
                disabled={savingEmail}
                placeholder="name@example.com"
                type="email"
                onChange={event => setEmailDraft(event.target.value)}
                onKeyDown={event => {
                  if (event.key === "Enter") void handleChangeEmail();
                }}
              />
              <button
                className="button secondary"
                type="button"
                disabled={savingEmail || emailDraft.trim().toLowerCase() === accountEmail.trim().toLowerCase()}
                onClick={() => void handleChangeEmail()}
              >
                {savingEmail ? "Changing..." : "Change Email"}
              </button>
            </div>
            <span className="muted-copy">After changing your sign-in email, you can change it again after 10 days.</span>
          </label>
          <label className="quick-reply-settings-label">
            Your Name
            <input
              className="input"
              value={displayName}
              disabled={savingProfile}
              placeholder="Your name"
              onChange={event => setDisplayName(event.target.value)}
            />
          </label>
          {!hideWorkspaceIdentity ? (
            <label className="quick-reply-settings-label">
              Company / Studio Name
              <input
                className="input"
                value={companyName}
                disabled={!canEditCompanyName || savingProfile}
                placeholder="My Studio"
                onChange={event => setCompanyName(event.target.value)}
              />
            </label>
          ) : null}
        </div>

        {!hideWorkspaceIdentity && !canEditCompanyName ? <p className="muted-copy">Company / Studio Name can only be changed by the workspace owner.</p> : null}
        <div className="settings-mini-grid">
          <InfoTile label="Workspace" value={workspace.name} />
          <InfoTile label="Role" value={workspace.roleLabel} />
          <InfoTile label="User ID" value={user?.uid ?? "-"} />
        </div>
        <div className="settings-action-row">
          <button className="button" type="button" disabled={savingProfile} onClick={handleSaveProfile}>
            {savingProfile ? "Saving..." : "Save Profile"}
          </button>
        </div>
        {profileStatus ? <p className="success-copy">{profileStatus}</p> : null}
        {profileError ? <p className="layout-error">{profileError}</p> : null}
      </section>

      <section className="card app-card account-security-card">
        <CardTitle icon="lock" eyebrow="Security" title="Sign-in security" />
        <div className="account-security-panel">
          <div>
            <strong>Face ID / device passcode</strong>
            <p className="muted-copy">The Mac and iPhone app can require Face ID, Touch ID or device passcode on launch. Browser Face ID is not enabled on web yet, so use Sign Out on shared computers.</p>
          </div>
          <span className="status-pill neutral">App only</span>
        </div>
        <p className="muted-copy">Password changes are handled securely by Firebase. Web sends a reset link to your account email instead of storing or editing your password here.</p>
        <div className="settings-action-row">
          <button className="button secondary" type="button" disabled={sendingReset} onClick={handlePasswordReset}>
            {sendingReset ? "Sending..." : "Send Password Reset Email"}
          </button>
          <button className="button secondary danger-button" type="button" disabled={signingOut} onClick={handleSignOut}>
            {signingOut ? "Signing out..." : "Sign Out"}
          </button>
        </div>
      </section>

      {!hideWorkspaceIdentity ? <section className="card app-card">
        <CardTitle icon="storage" eyebrow="Workspace Logo" title="Upload or replace only" />
        <div className="workspace-logo-row workspace-logo-editor">
          {logoUrl ? (
            <img src={logoUrl} alt={`${workspace.name} logo`} />
          ) : (
            <div className="workspace-logo-placeholder">
              <span className="workspace-studio-fallback workspace-studio-fallback-preview" aria-label={t("Studio")}>
                <span className="workspace-studio-mark" aria-hidden="true" />
                <span className="workspace-studio-text">{t("Studio")}</span>
              </span>
            </div>
          )}
          <div className="workspace-logo-copy">
            <strong>{logoUrl ? "Workspace logo is set" : "No logo uploaded yet"}</strong>
            <p className="muted-copy">Upload or replace the logo used in the app header for this workspace. Manual logo links are disabled so each workspace uses an uploaded logo file.</p>
            <div className="workspace-logo-actions">
              <input
                ref={logoInputRef}
                type="file"
                accept={WORKSPACE_LOGO_ACCEPT}
                className="visually-hidden-file"
                onClick={event => {
                  event.currentTarget.value = "";
                }}
                onChange={event => handleLogoFile(event.currentTarget.files?.[0])}
              />
              <button
                className="button"
                type="button"
                disabled={uploadingLogo || !settings}
                onClick={openLogoPicker}
              >
                {uploadingLogo ? "Uploading..." : logoUrl ? "Replace Logo" : "Upload Logo"}
              </button>
              {logoUrl ? (
                <button
                  className="button secondary"
                  type="button"
                  disabled={!canEditLogo || uploadingLogo || !settings}
                  onClick={handleRemoveLogo}
                >
                  Remove Logo
                </button>
              ) : null}
            </div>
            {!canUploadLogo ? <p className="muted-copy">Workspace logo upload is checked when you choose a file. Monthly Pro or Team is required.</p> : null}
            {!canEditLogo ? <p className="muted-copy">Your current workspace role cannot edit Workspace Logo.</p> : null}
            {status ? <p className="success-copy">{status}</p> : null}
            {error ? <p className="layout-error">{error}</p> : null}
          </div>
        </div>
        {pendingLogoFile ? (
          <div className="workspace-logo-policy">
            <strong>Upload Policy</strong>
            <p>Only upload legal, safe and work-related images that belong in this workspace.</p>
            <div className="workspace-logo-actions">
              <button className="button secondary" type="button" disabled={uploadingLogo} onClick={() => setPendingLogoFile(null)}>Cancel</button>
              <button className="button" type="button" disabled={uploadingLogo} onClick={handleAcceptPolicyAndUpload}>I Agree and Upload</button>
            </div>
          </div>
        ) : null}
      </section> : null}
    </div>
  );
}

const FINANCIAL_CURRENCIES = [
  ["£", "GBP (£)"],
  ["$", "USD ($)"],
  ["€", "EUR (€)"],
  ["₺", "TRY (₺)"],
  ["¥", "JPY (¥)"],
  ["A$", "AUD (A$)"],
  ["C$", "CAD (C$)"],
  ["CHF", "CHF (CHF)"],
  ["د.إ", "AED (د.إ)"]
] as const;

function dateInputValueFromSeconds(seconds: number) {
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function secondsFromDateInput(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? Date.now() / 1000 : date.getTime() / 1000;
}

function FinancialSettingsSection({
  workspace,
  settings,
  language,
  onSaved
}: {
  workspace: WorkspaceContext;
  settings: WorkspaceSettingsOverview | null;
  language: string;
  onSaved: (settings: WorkspaceSettingsOverview) => void;
}) {
  const [draft, setDraft] = useState<WorkspaceSettingsOverview | null>(settings);
  const [saving, setSaving] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const canEdit = canEditWorkspaceSettingsForRole(workspace.role);
  const t = (text: string) => studioT(text, language);

  useEffect(() => {
    setDraft(settings);
    setStatus("");
    setError("");
  }, [settings]);

  if (!draft) {
    return <PlaceholderSection title={t("Financial Settings")} detail={t("Financial settings could not be loaded yet.")} />;
  }

  function updateString(
    key: "selectedCurrency" | "selectedDecimalSeparator" | "taxRuleNameRevenue" | "taxRuleNameProfit" | "taxCalculationType" | "invoiceFooterNote",
    value: string
  ) {
    setDraft(current => current ? { ...current, [key]: value } : current);
    setStatus("");
    setError("");
  }

  function updateNumber(key: "feePercentage" | "defaultTaxRate" | "taxMilestoneDate" | "corporationTaxRate", value: number) {
    setDraft(current => current ? { ...current, [key]: value } : current);
    setStatus("");
    setError("");
  }

  function updateBoolean(key: "taxMilestoneEnabled" | "corporationTaxEnabled", value: boolean) {
    setDraft(current => current ? { ...current, [key]: value } : current);
    setStatus("");
    setError("");
  }

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    setStatus("");
    setError("");
    try {
      const result = await saveFinancialSettings(workspace, {
        selectedCurrency: draft.selectedCurrency,
        selectedDecimalSeparator: draft.selectedDecimalSeparator,
        feePercentage: draft.feePercentage,
        taxRuleNameRevenue: draft.taxRuleNameRevenue,
        taxRuleNameProfit: draft.taxRuleNameProfit,
        defaultTaxRate: draft.defaultTaxRate,
        taxCalculationType: draft.taxCalculationType,
        taxMilestoneEnabled: draft.taxMilestoneEnabled,
        taxMilestoneDate: draft.taxMilestoneDate,
        corporationTaxEnabled: draft.corporationTaxEnabled,
        corporationTaxRate: draft.corporationTaxRate,
        invoiceFooterNote: draft.invoiceFooterNote
      });
      const savedSettings = { ...draft, ...(result.settings ?? {}) };
      setDraft(savedSettings);
      onSaved(savedSettings);
      setStatus(result.message || t("Financial settings saved."));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("Financial settings could not be saved."));
    } finally {
      setSaving(false);
    }
  }

  async function handleRecalculate() {
    if (!draft) return;
    const confirmed = window.confirm(t("Recalculate VAT and platform fees for existing projects using these Financial Settings?"));
    if (!confirmed) return;
    setRecalculating(true);
    setStatus("");
    setError("");
    try {
      const saved = await saveFinancialSettings(workspace, {
        selectedCurrency: draft.selectedCurrency,
        selectedDecimalSeparator: draft.selectedDecimalSeparator,
        feePercentage: draft.feePercentage,
        taxRuleNameRevenue: draft.taxRuleNameRevenue,
        taxRuleNameProfit: draft.taxRuleNameProfit,
        defaultTaxRate: draft.defaultTaxRate,
        taxCalculationType: draft.taxCalculationType,
        taxMilestoneEnabled: draft.taxMilestoneEnabled,
        taxMilestoneDate: draft.taxMilestoneDate,
        corporationTaxEnabled: draft.corporationTaxEnabled,
        corporationTaxRate: draft.corporationTaxRate,
        invoiceFooterNote: draft.invoiceFooterNote
      });
      const savedSettings = { ...draft, ...(saved.settings ?? {}) };
      setDraft(savedSettings);
      onSaved(savedSettings);
      const result = await recalculateFinancialSettingsForOrders(workspace);
      setStatus(result.message || t("Existing projects recalculated."));
    } catch (recalculateError) {
      setError(recalculateError instanceof Error ? recalculateError.message : t("Existing projects could not be recalculated."));
    } finally {
      setRecalculating(false);
    }
  }

  return (
    <div className="settings-card-stack">
      {!canEdit ? (
        <section className="card app-card">
          <CardTitle icon="lock" eyebrow={t("Locked")} title={t("Financial settings are read-only")} />
          <p className="muted-copy">{t("Your current workspace role cannot edit Financial Settings.")}</p>
        </section>
      ) : null}

      <section className="card app-card financial-settings-card">
        <header className="financial-settings-main-title">
          <span className="financial-settings-main-icon">%</span>
          <h2>{t("Financial Settings")}</h2>
        </header>

        <div className="financial-settings-section">
          <div className="financial-settings-section-title">
            <strong>{t("General")}</strong>
            <span />
          </div>

          <label className="financial-settings-row">
            <span>{t("Currency Symbol")}</span>
            <select
              className="input financial-control"
              value={draft.selectedCurrency}
              disabled={!canEdit || saving}
              onChange={event => updateString("selectedCurrency", event.target.value)}
            >
              {FINANCIAL_CURRENCIES.map(([symbol, label]) => (
                <option value={symbol} key={symbol}>{label}</option>
              ))}
            </select>
          </label>

          <label className="financial-settings-row">
            <span>{t("Decimal Separator")}</span>
            <div className={canEdit ? "financial-segmented" : "financial-segmented is-disabled"}>
              <button
                type="button"
                className={draft.selectedDecimalSeparator === "." ? "active" : ""}
                disabled={!canEdit || saving}
                onClick={() => updateString("selectedDecimalSeparator", ".")}
              >
                {t("Dot (.)")}
              </button>
              <button
                type="button"
                className={draft.selectedDecimalSeparator === "," ? "active" : ""}
                disabled={!canEdit || saving}
                onClick={() => updateString("selectedDecimalSeparator", ",")}
              >
                {t("Comma (,)")}
              </button>
            </div>
          </label>

          <label className="financial-settings-row">
            <span>{t("Avg. Platform Fee (%)")}</span>
            <span className="financial-percent-control">
              <input
                className="input financial-control"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={draft.feePercentage}
                disabled={!canEdit || saving}
                onChange={event => updateNumber("feePercentage", Number(event.target.value))}
              />
              <em>%</em>
            </span>
          </label>
        </div>

        <div className="financial-settings-section">
          <div className="financial-settings-section-title">
            <strong>{t("Tax / VAT Settings")}</strong>
            <span />
          </div>

          <label className="financial-settings-row wide-control">
            <span>{t("Rule 1 (Revenue)")}</span>
            <input
              className="input financial-control"
              value={draft.taxRuleNameRevenue}
              disabled={!canEdit || saving}
              onChange={event => updateString("taxRuleNameRevenue", event.target.value)}
            />
          </label>

          <label className="financial-settings-row wide-control">
            <span>{t("Rule 2 (Profit)")}</span>
            <input
              className="input financial-control"
              value={draft.taxRuleNameProfit}
              disabled={!canEdit || saving}
              onChange={event => updateString("taxRuleNameProfit", event.target.value)}
            />
          </label>

          <label className="financial-settings-row wide-control">
            <span>{t("Default Tax Rate (%)")}</span>
            <span className="financial-percent-control is-vat-rate">
              <input
                className="input financial-control"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={draft.defaultTaxRate}
                disabled={!canEdit || saving}
                onChange={event => updateNumber("defaultTaxRate", Number(event.target.value))}
              />
              <em>%</em>
            </span>
          </label>

          <label className="financial-settings-row wide-control">
            <span>{t("Calculate Tax On")}</span>
            <select
              className="input financial-control"
              value={draft.taxCalculationType}
              disabled={!canEdit || saving}
              onChange={event => updateString("taxCalculationType", event.target.value)}
            >
              <option value="Revenue">{draft.taxRuleNameRevenue || "Revenue"}</option>
              <option value="Profit">{draft.taxRuleNameProfit || "Profit"}</option>
            </select>
          </label>

          <label className="financial-settings-row">
            <span>{t("Use Tax Transition Date")}</span>
            <span className="financial-checkbox-line">
              <input
                type="checkbox"
                checked={draft.taxMilestoneEnabled}
                disabled={!canEdit || saving}
                onChange={event => updateBoolean("taxMilestoneEnabled", event.target.checked)}
              />
              <strong>{t("Use Tax Transition Date")}</strong>
            </span>
          </label>

          {draft.taxMilestoneEnabled ? (
            <label className="financial-settings-row wide-control">
              <span>{t("VAT Registration Date")}</span>
              <input
                className="input financial-control"
                type="date"
                value={dateInputValueFromSeconds(draft.taxMilestoneDate)}
                disabled={!canEdit || saving}
                onChange={event => updateNumber("taxMilestoneDate", secondsFromDateInput(event.target.value))}
              />
            </label>
          ) : null}

          <label className="financial-settings-row">
            <span>{t("Enable Corporation Tax")}</span>
            <span className="financial-checkbox-line">
              <input
                type="checkbox"
                checked={Boolean(draft.corporationTaxEnabled)}
                disabled={!canEdit || saving}
                onChange={event => updateBoolean("corporationTaxEnabled", event.target.checked)}
              />
              <strong>{t("Enable Corporation Tax")}</strong>
            </span>
          </label>

          {draft.corporationTaxEnabled ? (
            <>
              <label className="financial-settings-row wide-control">
                <span>{t("Corporation Tax Rate (%)")}</span>
                <span className="financial-percent-control is-vat-rate">
                  <input
                    className="input financial-control"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={draft.corporationTaxRate ?? 19}
                    disabled={!canEdit || saving}
                    onChange={event => updateNumber("corporationTaxRate", Number(event.target.value))}
                  />
                  <em>%</em>
                </span>
              </label>
              <label className="financial-settings-row wide-control">
                <span>{t("Invoice Footer / Payment Terms")}</span>
                <textarea
                  className="input financial-control"
                  rows={3}
                  value={draft.invoiceFooterNote ?? ""}
                  disabled={!canEdit || saving}
                  placeholder={t("Bank details, payment terms, thank-you note shown on the customer invoice.")}
                  onChange={event => updateString("invoiceFooterNote", event.target.value)}
                />
              </label>
            </>
          ) : null}
        </div>

        <div className="financial-settings-footer">
          <button className="button secondary financial-save-button" type="button" disabled={!canEdit || saving} onClick={handleSave}>
            {saving ? t("Saving...") : t("Save Financial Settings")}
          </button>
          <button className="financial-recalculate-button" type="button" disabled={!canEdit || saving || recalculating} onClick={handleRecalculate}>
            <span aria-hidden="true">↻</span>
            {recalculating ? t("Recalculating...") : t("Recalculate Taxes for Past Orders")}
          </button>
        </div>
        {status ? <p className="success-copy">{status}</p> : null}
        {error ? <p className="layout-error">{error}</p> : null}
        <p className="muted-copy financial-settings-note">{t("Changing the default calculation model sets the tax rule for new projects. Use recalculation when you want existing projects to adopt the current VAT rule, default VAT rate and platform fee.")}</p>
      </section>
    </div>
  );
}

function WooCommerceIntegrationSection({ workspace }: { workspace: WorkspaceContext }) {
  const [copyStatus, setCopyStatus] = useState("");
  const companyId = workspace.id.trim();
  // The signed Delivery URL (with this workspace's webhook token) is loaded from the backend
  // so the copied URL authenticates with the webhook.
  const [deliveryUrl, setDeliveryUrl] = useState("");
  const [deliveryUrlLoading, setDeliveryUrlLoading] = useState(false);
  useEffect(() => {
    if (!companyId) {
      setDeliveryUrl("");
      return;
    }
    let active = true;
    setDeliveryUrlLoading(true);
    getWooCommerceWebhookDeliveryUrl(companyId)
      .then((url) => {
        if (active) setDeliveryUrl(url);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setDeliveryUrlLoading(false);
      });
    return () => {
      active = false;
    };
  }, [companyId]);

  async function copyText(value: string, label: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus(`${label} copied.`);
    } catch {
      setCopyStatus("Copy failed. Select the value and copy it manually.");
    }
    window.setTimeout(() => setCopyStatus(""), 1600);
  }

  return (
    <div className="settings-card-stack">
      <section className="card app-card quick-reply-settings-card">
        <CardTitle icon="orders" eyebrow="WooCommerce Integration" title="Connect WooCommerce" />
        <div className="quick-reply-settings-info">
          <strong>Website orders can flow into this workspace.</strong>
          <p>To activate this connection, create one WooCommerce webhook and paste the Delivery URL below. After that, new website orders appear in Orders and Schedule automatically.</p>
        </div>
        {!companyId ? (
          <p className="layout-error">Company ID is not available yet. Sign in or reconnect your workspace first.</p>
        ) : null}
      </section>

      <section className="card app-card quick-reply-settings-card">
        <CardTitle icon="docText" eyebrow="Copy Setup Details" title="Webhook values" />
        <CopyableIntegrationValue
          title="Your Company ID"
          value={companyId || "Unavailable"}
          buttonTitle="Copy Company ID"
          canCopy={Boolean(companyId)}
          onCopy={() => copyText(companyId, "Company ID")}
        />
        <CopyableIntegrationValue
          title="Delivery URL with Company ID"
          value={deliveryUrl || (deliveryUrlLoading ? "Loading…" : "Unavailable")}
          buttonTitle="Copy Delivery URL"
          canCopy={Boolean(deliveryUrl)}
          onCopy={() => copyText(deliveryUrl, "Delivery URL")}
        />
        {copyStatus ? <p className="success-copy">{copyStatus}</p> : null}
      </section>

      <section className="card app-card quick-reply-settings-card">
        <CardTitle icon="checklist" eyebrow="What you need to do" title="WooCommerce webhook steps" />
        <div className="settings-rule-list">
          <IntegrationInfoRow number="1" title="Open WooCommerce webhooks" detail="In WordPress, open WooCommerce > Settings > Advanced > Webhooks." />
          <IntegrationInfoRow number="2" title="Create a new webhook" detail="Create a new webhook for NivaDesk orders." />
          <IntegrationInfoRow number="3" title="Set it active" detail="Set Status to Active and Topic to Order created." />
          <IntegrationInfoRow number="4" title="Paste the Delivery URL" detail="Paste the copied Delivery URL, save the webhook, then place a test order." />
        </div>
      </section>

      <section className="card app-card quick-reply-settings-card">
        <CardTitle icon="dashboard" eyebrow="What happens when it is active" title="Incoming website orders" />
        <p className="muted-copy">New website orders are added to Orders automatically. They also appear in Schedule and are saved under this Company ID.</p>
      </section>
    </div>
  );
}

function CopyableIntegrationValue({
  title,
  value,
  buttonTitle,
  canCopy,
  onCopy
}: {
  title: string;
  value: string;
  buttonTitle: string;
  canCopy: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="copyable-integration-value">
      <div>
        <strong>{title}</strong>
        <button className="button secondary" type="button" disabled={!canCopy} onClick={onCopy}>
          {buttonTitle}
        </button>
      </div>
      <code>{value}</code>
    </div>
  );
}

function IntegrationInfoRow({ number, title, detail }: { number: string; title: string; detail: string }) {
  return (
    <div className="integration-info-row">
      <span>{number}</span>
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
    </div>
  );
}

function settingsFilePrefix(workspace: WorkspaceContext) {
  return (workspace.name || "studioflow")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "studioflow";
}

function DataManagementSection({
  workspace,
  counts,
  userEmail,
  onImported
}: {
  workspace: WorkspaceContext;
  counts: DashboardCounts | null;
  userEmail: string;
  onImported: () => Promise<void>;
}) {
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [exporting, setExporting] = useState<"backup" | "webBackup" | "orders" | "customers" | "">("");
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const exportAllowed = workspace.entitlements.features.export_data;
  const canImport = canEditWorkspaceSettingsForRole(workspace.role);
  const canDelete = canDeleteWorkspaceDataForRole(workspace.role);

  async function runExport(kind: "backup" | "webBackup" | "orders" | "customers") {
    if (!exportAllowed) {
      setError("Export is not available for this workspace.");
      return;
    }

    setExporting(kind);
    setStatus("");
    setError("");
    try {
      const exportData = await loadWorkspaceExportData(workspace);
      const prefix = settingsFilePrefix(workspace);
      const date = safeFileDate();

      if (kind === "backup") {
        downloadTextFile(`StudioManager_Backup_${date}.json`, appCompatibleBackupJson(exportData), "application/json");
        setStatus("App-compatible backup downloaded.");
      } else if (kind === "webBackup") {
        downloadTextFile(`${prefix}-web-backup-${date}.json`, fullBackupJson(exportData, userEmail), "application/json");
        setStatus("Web JSON backup downloaded.");
      } else if (kind === "orders") {
        downloadTextFile(`${prefix}-orders-${date}.csv`, ordersToCsv(exportData.orders), "text/csv");
        setStatus("Orders CSV downloaded.");
      } else {
        downloadTextFile(`${prefix}-customers-${date}.csv`, customersToCsv(exportData.customers), "text/csv");
        setStatus("Customers CSV downloaded.");
      }
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Export could not be prepared.");
    } finally {
      setExporting("");
    }
  }

  async function handleImportFile(file: File | undefined) {
    if (!file) return;
    setImporting(true);
    setStatus("");
    setError("");
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const result = await importWorkspaceBackup(workspace, parsed);
      await onImported();
      setStatus(result.message || "Import finished.");
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Import could not be completed.");
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  async function handleDeleteData() {
    setDeleting(true);
    setStatus("");
    setError("");
    try {
      const result = await deleteWorkspaceData(workspace, deleteConfirmation);
      setDeleteConfirmation("");
      await onImported();
      setStatus(result.message || "Workspace orders and customers deleted.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Workspace data could not be deleted.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="settings-card-stack">
      <section className="card app-card quick-reply-settings-card">
        <CardTitle icon="export" eyebrow="Data Management" title="Export and backup" />
        <p className="muted-copy">Create a backup before importing or deleting data.</p>
        <div className="settings-mini-grid">
          <InfoTile label="Orders" value={`${counts?.orderCount ?? 0}`} />
          <InfoTile label="Customers" value={`${counts?.customerCount ?? 0}`} />
          <InfoTile label="Export" value={exportAllowed ? "Available" : "Locked"} />
        </div>

        <div className="data-management-actions">
          <button className="button" type="button" disabled={!exportAllowed || Boolean(exporting)} onClick={() => runExport("backup")}>
            {exporting === "backup" ? "Exporting..." : "Export Backup"}
          </button>
          <button className="button secondary" type="button" disabled={!exportAllowed || Boolean(exporting)} onClick={() => runExport("webBackup")}>
            {exporting === "webBackup" ? "Exporting..." : "Web JSON Backup"}
          </button>
          <button className="button secondary" type="button" disabled={!exportAllowed || Boolean(exporting)} onClick={() => runExport("orders")}>
            {exporting === "orders" ? "Exporting..." : "Export CSV"}
          </button>
          <button className="button secondary" type="button" disabled={!exportAllowed || Boolean(exporting)} onClick={() => runExport("customers")}>
            {exporting === "customers" ? "Exporting..." : "Customers CSV"}
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={event => void handleImportFile(event.target.files?.[0])}
          />
          <button className="button" type="button" disabled={!canImport || importing} onClick={() => importInputRef.current?.click()}>
            {importing ? "Importing..." : "Import Backup"}
          </button>
        </div>

        <p className="muted-copy">Export Backup uses the same JSON structure as the Swift app. Web JSON Backup keeps the raw web archive. Import accepts both formats and adds the selected NivaDesk backup into the current workspace without clearing existing data.</p>
        {!canImport ? <p className="muted-copy">Your current workspace role cannot import backup files.</p> : null}
        {status ? <p className="success-copy">{status}</p> : null}
        {error ? <p className="layout-error">{error}</p> : null}
      </section>

      <section className="card app-card quick-reply-settings-card">
        <CardTitle icon="lock" eyebrow="Protected Actions" title="Import and delete" />
        <div className="settings-rule-list">
          <InfoTile label="Import Backup" value="Available" />
          <InfoTile label="Delete Data" value={canDelete ? "Owner/Admin only" : "Locked"} />
        </div>
        <p className="muted-copy">Web import is append-only and app-compatible. It imports app backups, web JSON backups, orders, customers and supported settings, but does not import Client Files storage objects. Delete Data mirrors the app: it removes orders and customers only, not workspace settings, members, logos or Storage files.</p>
        <div className="data-management-actions">
          <Link className="button secondary" href="/export">Open full Export page</Link>
        </div>
        <div className="settings-danger-box">
          <strong>Delete orders and customers</strong>
          <p>Export a backup first. Then type <code>DELETE DATA</code> to unlock the delete action.</p>
          <input
            className="input"
            value={deleteConfirmation}
            disabled={!canDelete || deleting}
            placeholder="DELETE DATA"
            onChange={event => {
              setDeleteConfirmation(event.target.value);
              setStatus("");
              setError("");
            }}
          />
          <button
            className="button danger-button"
            type="button"
            disabled={!canDelete || deleting || deleteConfirmation.trim() !== "DELETE DATA"}
            onClick={handleDeleteData}
          >
            {deleting ? "Deleting..." : "Delete Data"}
          </button>
          {!canDelete ? <p className="muted-copy">Only workspace Owner or Admin can delete workspace data.</p> : null}
        </div>
      </section>
    </div>
  );
}

function PlanAccessSection({
  workspace,
  counts,
  storagePercent
}: {
  workspace: WorkspaceContext;
  counts: DashboardCounts | null;
  storagePercent: number;
}) {
  const currentPlan = workspace.entitlements;
  const isActiveWorkspaceOwner = normalizeWorkspaceRole(workspace.role) === "owner";
  const featurePills = [
    { title: planOrderLimitText(currentPlan), enabled: true },
    { title: planCustomerLimitText(currentPlan), enabled: true },
    { title: `Storage: ${storageLimitLabel(currentPlan)}`, enabled: currentPlan.features.client_files },
    { title: planTeamLimitText(currentPlan), enabled: currentPlan.features.team_access },
    { title: "Client Files", enabled: currentPlan.features.client_files },
    { title: "Export Data", enabled: currentPlan.features.export_data },
    { title: "Card Customise", enabled: currentPlan.features.card_customization },
    { title: "Financial Cards", enabled: currentPlan.features.financial_basic },
    { title: "Advanced Finance", enabled: currentPlan.features.financial_advanced },
    { title: "Workspace Logo", enabled: currentPlan.features.workspace_logo_upload },
    { title: "Team Access", enabled: currentPlan.features.team_access },
    { title: "Storage Add-ons", enabled: currentPlan.features.storage_addons }
  ];

  return (
    <div className="settings-card-stack">
      <section className="card app-card">
        <CardTitle icon="plan" eyebrow="Plan & Access" title={workspace.billingPlanName} />
        <div className="plan-access-hero">
          <div className="plan-access-hero-icon" aria-hidden="true">◆</div>
          <div>
            <div className="plan-access-hero-title">
              <strong>{currentPlan.title}</strong>
              <span>{currentPlan.purchaseModel}</span>
            </div>
            <p>{planSummaryText(currentPlan.plan)}</p>
            <div className="plan-access-compact-metrics">
              <span>{planOrderLimitText(currentPlan)}</span>
              <span>{`Storage: ${storageLimitLabel(currentPlan)}`}</span>
              <span>{planTeamLimitText(currentPlan)}</span>
            </div>
          </div>
        </div>
        <div className="settings-mini-grid">
          <InfoTile label="Orders" value={`${counts?.orderCount ?? 0}`} />
          <InfoTile label="Customers" value={`${counts?.customerCount ?? 0}`} />
          <InfoTile label="Current seat allowance" value={`${workspace.billingTeamMemberLimit}`} />
          <InfoTile label="Storage" value={formatStorageFromMB(workspace.billingStorageLimitMB)} />
        </div>
        <div className="progress-track settings-progress">
          <div className="progress-fill" style={{ width: `${storagePercent}%` }} />
        </div>
        <p className="muted-copy">{counts?.estimatedFileUsageMB ?? 0} MB used of {formatStorageFromMB(workspace.billingStorageLimitMB)}.</p>
        {isActiveWorkspaceOwner ? (
          <Link className="button secondary" href="/plan" style={{ display: "inline-block", marginTop: 12 }}>Open full Plan &amp; Billing page</Link>
        ) : (
          <p className="muted-copy">This workspace plan is managed by its owner.</p>
        )}
      </section>

      <section className="card app-card">
        <CardTitle icon="check" eyebrow="Available now" title="Current plan access" />
        <div className="plan-feature-pill-grid">
          {featurePills.map(feature => (
            <span className={feature.enabled ? "plan-feature-pill enabled" : "plan-feature-pill"} key={feature.title}>
              <b>{feature.enabled ? "✓" : "–"}</b>
              {feature.title}
            </span>
          ))}
        </div>
      </section>

      <section className="card app-card">
        <CardTitle icon="check" eyebrow="Plan Matrix" title="Shared app and web plan keys" />
        <div className="plan-compare-grid">
          {Object.values(PLAN_ENTITLEMENTS).map(plan => (
            <PlanComparisonCard
              key={plan.plan}
              plan={plan}
              currentPlanKey={workspace.billingPlan}
              footer={plan.plan === workspace.billingPlan ? <span>Your workspace is using this plan.</span> : null}
            />
          ))}
        </div>
      </section>

      <section className="card app-card">
        <CardTitle icon="lock" eyebrow="Billing security" title="Plan changes are protected" />
        <p className="muted-copy">
          Subscription access is managed through secure billing and updates automatically when a payment status changes.
        </p>
        {isActiveWorkspaceOwner ? (
          <Link className="button secondary" href="/plan" style={{ display: "inline-block", marginTop: 12 }}>Open Plan &amp; Billing</Link>
        ) : (
          <p className="muted-copy">Only the workspace owner can change or manage this plan.</p>
        )}
      </section>
    </div>
  );
}

function TeamAccessSection({
  workspace,
  teamData,
  onRefreshTeamAccess
}: {
  workspace: WorkspaceContext;
  teamData: TeamAccessData | null;
  onRefreshTeamAccess: () => Promise<TeamAccessData | null>;
}) {
  const members = teamData?.members ?? [];
  const joinRequests = teamData?.joinRequests ?? [];
  const customRoles = teamData?.customRoles ?? [];
  const [requestRoles, setRequestRoles] = useState<Record<string, string>>({});
  const [actioning, setActioning] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [requestOwnerIdentifier, setRequestOwnerIdentifier] = useState("");
  const [joinedWorkspaces, setJoinedWorkspaces] = useState<JoinedWorkspaceOption[]>([]);
  const [switchingWorkspaceId, setSwitchingWorkspaceId] = useState("");
  const { user } = useAuth();

  useEffect(() => {
    let cancelled = false;
    if (!user) return;
    loadJoinedWorkspaceOptions(user.uid, workspace.id)
      .then(options => {
        if (!cancelled) setJoinedWorkspaces(options);
      })
      .catch(loadError => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Workspaces could not be loaded.");
      });
    return () => {
      cancelled = true;
    };
  }, [user, workspace.id]);

  async function switchWorkspace(option: JoinedWorkspaceOption) {
    if (!user || option.isCurrent || switchingWorkspaceId) return;
    setSwitchingWorkspaceId(option.id);
    setError("");
    setStatus("");
    try {
      await switchActiveWorkspace(user.uid, option.id);
      window.location.reload();
    } catch (switchError) {
      setError(switchError instanceof Error ? switchError.message : "Could not switch workspace.");
      setSwitchingWorkspaceId("");
    }
  }

  const workspaceSwitchPanel = (
    <section className="card app-card team-access-panel-card">
      <div className="team-access-panel-heading">
        <strong>Workspaces</strong>
        <span>{joinedWorkspaces.length} connected</span>
      </div>
      <p className="muted-copy">Switch to a workspace you own or have joined. Your assigned role controls what you can see after switching.</p>
      {joinedWorkspaces.map(option => (
        <div className="team-access-workspace-option" key={option.id}>
          <span className="team-access-icon team-access-icon-owner" aria-hidden="true">{option.role === "owner" ? "♛" : "◉"}</span>
          <div>
            <strong>{option.name}</strong>
            <small>{option.roleLabel}</small>
          </div>
          {option.isCurrent ? (
            <span className="studio-pill success">Current</span>
          ) : (
            <button
              className="button secondary"
              type="button"
              onClick={() => void switchWorkspace(option)}
              disabled={Boolean(switchingWorkspaceId)}
            >
              {switchingWorkspaceId === option.id ? "Switching..." : "Switch"}
            </button>
          )}
        </div>
      ))}
    </section>
  );

  useEffect(() => {
    setRequestRoles(previous => {
      const next = { ...previous };
      joinRequests.forEach(request => {
        if (!next[request.id]) next[request.id] = "member";
      });
      return next;
    });
  }, [joinRequests]);

  const isOwner = normalizeWorkspaceRole(workspace.role) === "owner";
  const hasTeamPlan = Boolean(workspace.entitlements.features.team_access);
  const canViewTeamManagement = Boolean(hasTeamPlan && workspaceAccessAllows(workspace.memberAccess, "teamAccess"));
  const canManageTeam = Boolean(isOwner && canViewTeamManagement);
  const roleOptions = useMemo(() => standardAndCustomRoleOptions(customRoles), [customRoles]);
  const teamLimit = workspace.billingTeamMemberLimit > 9999 ? "Unlimited" : `${members.length} / ${workspace.billingTeamMemberLimit}`;
  const roleCounts = useMemo(() => {
    return members.reduce<Record<string, number>>((acc, member) => {
      acc[member.roleLabel] = (acc[member.roleLabel] ?? 0) + 1;
      return acc;
    }, {});
  }, [members]);

  async function copyText(value: string, label: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(""), 1600);
    } catch {
      setCopied("");
    }
  }

  async function runTeamAction(key: string, action: () => Promise<unknown>, success: string) {
    setActioning(key);
    setError("");
    setStatus("");
    try {
      await action();
      setStatus(success);
      await onRefreshTeamAccess();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Team action failed.");
    } finally {
      setActioning("");
    }
  }

  async function submitAccessRequest() {
    const cleanIdentifier = requestOwnerIdentifier.trim();
    if (!cleanIdentifier || actioning) return;
    await runTeamAction(
      "request-access",
      () => requestWorkspaceAccess(cleanIdentifier),
      "Access request sent. The workspace owner can approve it from Team Access."
    );
    setRequestOwnerIdentifier("");
  }

  if (!canViewTeamManagement) {
    return (
      <div className="settings-stack team-access-shell">
        <section className="card app-card team-access-hero-card">
          <CardTitle icon="team" title="Join an existing Team workspace">
            <p className="team-access-hero-subtitle">
              Request access using the Company ID or owner email shared by a Team workspace owner.
            </p>
          </CardTitle>
          <p className="muted-copy">
            Requesting access is available on every plan. Team management remains available only inside a Team workspace with permission.
          </p>
          {status ? <p className="layout-status">{status}</p> : null}
          {error ? <p className="layout-error">{error}</p> : null}
        </section>

        {workspaceSwitchPanel}

        <form className="card app-card team-access-panel-card" onSubmit={event => {
          event.preventDefault();
          void submitAccessRequest();
        }}>
          <div className="team-access-panel-heading">
            <strong>Request Access</strong>
            <span>Every plan</span>
          </div>
          <p className="muted-copy">Enter the Team workspace owner’s email address or Company ID.</p>
          <div className="team-access-request-row">
            <input
              className="input"
              value={requestOwnerIdentifier}
              onChange={event => setRequestOwnerIdentifier(event.target.value)}
              placeholder="Owner email or Company ID"
              disabled={Boolean(actioning)}
            />
            <button className="team-access-send-button" type="submit" disabled={!requestOwnerIdentifier.trim() || Boolean(actioning)} aria-label="Send access request">
              {actioning === "request-access" ? "..." : "➤"}
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="settings-stack team-access-shell">
        <section className="card app-card team-access-hero-card">
          <CardTitle icon="team" title="Team workspace membership">
            <p className="team-access-hero-subtitle">
              You have joined this workspace as {workspace.roleLabel}.
            </p>
          </CardTitle>
          <div className="team-access-hero-meta">
            <span>{workspace.billingPlanName}</span>
            <span>{workspace.roleLabel}</span>
            <span>Shared with you</span>
          </div>
          <p className="muted-copy">
            You can use the areas permitted by your assigned role. Workspace members, roles, join requests and billing are managed by the owner.
          </p>
          {status ? <p className="layout-status">{status}</p> : null}
          {error ? <p className="layout-error">{error}</p> : null}
        </section>

        {workspaceSwitchPanel}

        <form className="card app-card team-access-panel-card" onSubmit={event => {
          event.preventDefault();
          void submitAccessRequest();
        }}>
          <div className="team-access-panel-heading">
            <strong>Request Access</strong>
            <span>Every plan</span>
          </div>
          <p className="muted-copy">Enter another Team workspace owner’s email address or Company ID.</p>
          <div className="team-access-request-row">
            <input
              className="input"
              value={requestOwnerIdentifier}
              onChange={event => setRequestOwnerIdentifier(event.target.value)}
              placeholder="Owner email or Company ID"
              disabled={Boolean(actioning)}
            />
            <button className="team-access-send-button" type="submit" disabled={!requestOwnerIdentifier.trim() || Boolean(actioning)} aria-label="Send access request">
              {actioning === "request-access" ? "..." : "➤"}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="settings-stack team-access-shell">
      <section className="card app-card team-access-hero-card">
        <CardTitle icon="team" title="Team Access">
          <p className="team-access-hero-subtitle">Manage workspace members, roles and join requests.</p>
        </CardTitle>
        <div className="team-access-hero-meta">
          <span>{hasTeamPlan ? "Team plan available" : "Team plan locked"}</span>
          <span>{teamLimit} members</span>
          <span>{joinRequests.length} join requests</span>
          <span>{workspace.roleLabel}</span>
        </div>
        {!hasTeamPlan ? (
          <p className="muted-copy">Team management is locked on this plan. Current membership is visible, but approving requests and changing roles requires NivaDesk Team.</p>
        ) : (
          <p className="muted-copy">Team includes 5 seats. Additional seats will be available for £5/month or £50/year each, up to 10 users. For larger teams, contact contact@nivadesk.co.uk.</p>
        )}
        {!isOwner ? (
          <p className="muted-copy">Only workspace owners can approve join requests, change roles or remove members.</p>
        ) : null}
        {status ? <p className="layout-status">{status}</p> : null}
        {error ? <p className="layout-error">{error}</p> : null}
        {copied ? <span className="studio-pill">{copied}</span> : null}
      </section>

      <div className="team-access-top-grid">
        <section className="card app-card team-access-panel-card">
          <div className="team-access-panel-heading">
            <strong>Current Workspace</strong>
          </div>
          <div className="team-access-workspace-row">
            <span className="team-access-icon team-access-icon-owner" aria-hidden="true">♛</span>
            <div>
              <strong>{workspace.name || "NivaDesk"}</strong>
              <div className="team-access-inline-meta">
                <span className="studio-pill team-access-owner-pill">{workspace.roleLabel}</span>
                <small>{isOwner ? "You own this workspace" : "Shared with you"}</small>
              </div>
            </div>
          </div>
          <label className="team-access-copy-field">
            <span>Company ID</span>
            <div>
              <code>{workspace.id}</code>
              <button className="team-access-copy-icon-button" type="button" aria-label="Copy Company ID" onClick={() => copyText(workspace.id, "Company ID copied")}>⧉</button>
            </div>
          </label>
        </section>

        <section className="card app-card team-access-panel-card">
          <div className="team-access-panel-heading">
            <strong>Workspaces</strong>
            <button className="team-access-icon-button" type="button" onClick={() => void onRefreshTeamAccess()} aria-label="Refresh workspaces">↻</button>
          </div>
          {joinedWorkspaces.map(option => (
            <div className="team-access-workspace-option" key={option.id}>
              <span className="team-access-icon team-access-icon-owner" aria-hidden="true">{option.role === "owner" ? "♛" : "◉"}</span>
              <div>
                <strong>{option.name}</strong>
                <small>{option.roleLabel}</small>
              </div>
              {option.isCurrent ? (
                <>
                  <span className="studio-pill success">Current</span>
                  <span className="studio-pill team-access-connected-pill">Connected</span>
                </>
              ) : (
                <button className="button secondary" type="button" onClick={() => void switchWorkspace(option)} disabled={Boolean(switchingWorkspaceId)}>
                  {switchingWorkspaceId === option.id ? "Switching..." : "Switch"}
                </button>
              )}
            </div>
          ))}
          <Link className="team-access-advanced-link" href="/team">Advanced: connect with Company ID</Link>
        </section>

        <form className="card app-card team-access-panel-card" onSubmit={event => {
          event.preventDefault();
          void submitAccessRequest();
        }}>
          <div className="team-access-panel-heading">
            <strong>Request Access</strong>
          </div>
          <p className="muted-copy">Enter the owner’s email address or Company ID and send a request.</p>
          <div className="team-access-request-row">
            <input
              className="input"
              value={requestOwnerIdentifier}
              onChange={event => setRequestOwnerIdentifier(event.target.value)}
              placeholder="Owner email or Company ID"
              disabled={Boolean(actioning)}
            />
            <button className="team-access-send-button" type="submit" disabled={!requestOwnerIdentifier.trim() || Boolean(actioning)} aria-label="Send access request">
              {actioning === "request-access" ? "..." : "➤"}
            </button>
          </div>
        </form>

        <section className="card app-card team-access-panel-card">
          <div className="team-access-panel-heading">
            <strong>Invite People</strong>
          </div>
          <p className="muted-copy">Share your account email or Company ID with the person you want to invite. They will send a request, then you approve it here.</p>
          {isOwner && hasTeamPlan ? (
            <div className="team-access-id-box">
              <code>{workspace.id}</code>
              <button className="button secondary team-access-copy-button" type="button" onClick={() => copyText(workspace.id, "Company ID copied")}>⧉ Copy</button>
            </div>
          ) : (
            <p className="muted-copy">{isOwner ? "Upgrade to NivaDesk Team to approve new members." : "Only the workspace owner can invite and approve new members."}</p>
          )}
        </section>
      </div>

      <section className="card app-card team-access-panel-card team-access-join-card">
        <div className="team-access-panel-heading">
          <span className="team-access-join-icon" aria-hidden="true"><CardIconGlyph icon="team" /></span>
          <div>
            <strong>Join Requests</strong>
            <p className="muted-copy">{!isOwner ? "Only workspace owners can see and review join requests." : joinRequests.length === 0 ? "No pending requests." : `${joinRequests.length} pending requests.`}</p>
          </div>
          <span className="team-access-chevron" aria-hidden="true">›</span>
        </div>
        {isOwner && joinRequests.length > 0 ? (
          <div className="settings-team-list">
            {joinRequests.map(request => {
              const selectedRole = requestRoles[request.id] ?? "member";
              const approveKey = `approve-${request.id}`;
              const declineKey = `decline-${request.id}`;
              return (
                <article key={request.id} className="settings-team-row">
                  <div className="settings-team-person">
                    <span>{requestLabel(request).slice(0, 1).toUpperCase()}</span>
                    <div>
                      <strong>{requestLabel(request)}</strong>
                      <small>Requested {formatTeamDate(request.createdAt)}</small>
                    </div>
                  </div>
                  <div className="settings-team-actions">
                    <span className="studio-pill">{request.status}</span>
                    <select
                      className="input"
                      value={selectedRole}
                      disabled={!canManageTeam || Boolean(actioning)}
                      onChange={event => setRequestRoles(previous => ({ ...previous, [request.id]: event.target.value }))}
                    >
                      {roleOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                    <button
                      className="button"
                      type="button"
                      disabled={!canManageTeam || Boolean(actioning)}
                      onClick={() => void runTeamAction(
                        approveKey,
                        () => approveJoinRequest(workspace, request, selectedRole),
                        "Access request approved."
                      )}
                    >
                      {actioning === approveKey ? "Approving..." : "Approve"}
                    </button>
                    <button
                      className="button secondary"
                      type="button"
                      disabled={!isOwner || Boolean(actioning)}
                      onClick={() => void runTeamAction(declineKey, () => declineJoinRequest(workspace, request), "Access request declined.")}
                    >
                      {actioning === declineKey ? "Declining..." : "Decline"}
                    </button>
                  </div>
                  {!hasTeamPlan ? <p className="muted-copy">Approving new team members requires NivaDesk Team. Decline remains available for cleanup.</p> : null}
                </article>
              );
            })}
          </div>
        ) : null}
      </section>

      <section className="card app-card team-access-panel-card">
        <div className="team-access-panel-heading">
          <div>
            <strong>Role Profiles</strong>
            <p className="muted-copy">Create custom access roles, then assign one to any workspace member.</p>
          </div>
        </div>
        {canManageTeam ? (
          <CustomRoleManager
            roles={customRoles}
            disabled={Boolean(actioning)}
            savingKey={actioning}
            onSave={role => runTeamAction(
              role.id ? `custom-role-${role.id}` : "custom-role-new",
              () => saveWorkspaceCustomRole(workspace, role),
              "Role profile saved."
            )}
            onDelete={role => runTeamAction(
              `delete-custom-role-${role.id}`,
              () => deleteWorkspaceCustomRole(workspace, role),
              "Role profile deleted."
            )}
          />
        ) : (
          <p className="muted-copy">Only the workspace owner on NivaDesk Team can create custom role profiles.</p>
        )}
      </section>

      <section className="card app-card team-access-panel-card">
        <div className="team-access-panel-heading">
          <strong>Team Members</strong>
        </div>
        <div className="settings-team-list team-access-member-list">
          {members.map(member => {
            const changingKey = `role-${member.id}`;
            const removeKey = `remove-${member.id}`;
            const canChangeRole = canManageTeam && !member.isOwner;
            return (
              <article key={member.id} className="settings-team-row">
                <div className="settings-team-person">
                  {member.photoURL ? <img src={member.photoURL} alt="" /> : <span>{memberLabel(member).slice(0, 1).toUpperCase()}</span>}
                  <div>
                    <strong>{memberLabel(member)}</strong>
                    <small>{member.email || member.id}</small>
                  </div>
                </div>
                <div className="settings-team-actions">
                  {member.isOwner ? <span className="studio-pill">Owner</span> : null}
                  <span className="studio-pill">{member.roleLabel}</span>
                  <button className="button secondary" type="button" onClick={() => copyText(member.id, "User ID copied")}>Copy ID</button>
                  {canChangeRole ? (
                    <>
                      <select
                        className="input"
                        value={roleOptions.some(option => option.value === member.role) ? member.role : "member"}
                        disabled={Boolean(actioning)}
                        onChange={event => {
                          const nextRole = event.target.value;
                          if (nextRole === member.role) return;
                          void runTeamAction(
                            changingKey,
                            () => updateTeamMemberRole(workspace, member, nextRole),
                            `Role updated to ${roleOptions.find(option => option.value === nextRole)?.label ?? roleOptionLabel(nextRole)}.`
                          );
                        }}
                      >
                        {roleOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                      <button
                        className="button secondary"
                        type="button"
                        disabled={Boolean(actioning)}
                        onClick={() => {
                          if (!window.confirm(`Remove ${memberLabel(member)} from this workspace?`)) return;
                          void runTeamAction(removeKey, () => removeTeamMember(workspace, member), "Team member removed.");
                        }}
                      >
                        {actioning === removeKey ? "Removing..." : "Remove"}
                      </button>
                    </>
                  ) : null}
                  {actioning === changingKey ? <span className="studio-pill">Updating...</span> : null}
                </div>
              </article>
            );
          })}
          {members.length === 0 ? <p className="muted-copy">No members found.</p> : null}
        </div>
      </section>

      <section className="card app-card team-access-panel-card">
        <div className="team-access-panel-heading">
          <div>
            <strong>Current role mix</strong>
            <p className="muted-copy">Role counts</p>
          </div>
        </div>
        <div className="settings-mini-grid team-access-role-mix-grid">
          {Object.entries(roleCounts).map(([role, count]) => <InfoTile key={role} label={role} value={`${count}`} />)}
          {Object.keys(roleCounts).length === 0 ? <InfoTile label="Members" value="0" /> : null}
        </div>
      </section>
    </div>
  );
}

function SupportTicketsSection({
  workspace,
  language,
  supportUnreadCount,
  onSupportUnreadChanged
}: {
  workspace: WorkspaceContext;
  language: string;
  supportUnreadCount: number;
  onSupportUnreadChanged: (count: number) => void;
}) {
  const [ticketMode, setTicketMode] = useState<StudioSupportTicketType>("workspace");
  const [category, setCategory] = useState("project");
  const [priority, setPriority] = useState("normal");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [tickets, setTickets] = useState<StudioSupportTicket[]>([]);
  const [messagesByTicketId, setMessagesByTicketId] = useState<Record<string, StudioSupportTicketMessage[]>>({});
  const [replyByTicketId, setReplyByTicketId] = useState<Record<string, string>>({});
  const [selectedTicketId, setSelectedTicketId] = useState("");
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [sendingTicket, setSendingTicket] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState<Record<string, boolean>>({});
  const [sendingReply, setSendingReply] = useState<Record<string, boolean>>({});
  const [statusUpdating, setStatusUpdating] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [unreadTicketIds, setUnreadTicketIds] = useState<string[]>([]);
  const [isSupportAdmin, setIsSupportAdmin] = useState(false);
  const [canSeeWorkspaceQueue, setCanSeeWorkspaceQueue] = useState(false);
  const t = (text: string) => studioT(text, language);
  const isWorkspaceMode = ticketMode === "workspace";
  const canUpdateStatus = isWorkspaceMode ? canSeeWorkspaceQueue : isSupportAdmin;
  const categories = isWorkspaceMode ? WORKSPACE_SUPPORT_CATEGORY_OPTIONS : APP_SUPPORT_CATEGORY_OPTIONS;
  const currentUserUid = auth.currentUser?.uid ?? "";

  async function refreshSupportUnreadSummary() {
    try {
      const summary = await getSupportTicketUnreadSummary(workspace);
      onSupportUnreadChanged(supportUnreadTotal(summary));
      setUnreadTicketIds(supportUnreadTicketIds(summary));
    } catch {
      // Keep the currently visible count if unread summary is temporarily unavailable.
    }
  }

  async function markTicketAsRead(ticket: StudioSupportTicket) {
    const uid = auth.currentUser?.uid ?? "";
    try {
      await (isWorkspaceMode
        ? markWorkspaceSupportTicketRead(workspace, ticket.id)
        : markNivaDeskSupportTicketRead(workspace, ticket.id));

      if (uid) {
        const readAt = Date.now();
        setTickets(previous => previous.map(item => item.id === ticket.id
          ? { ...item, readBy: { ...(item.readBy ?? {}), [uid]: readAt } }
          : item
        ));
      }
      setUnreadTicketIds(previous => previous.filter(id => id !== ticket.id));

      await refreshSupportUnreadSummary();
    } catch {
      // Opening the conversation should not fail just because read receipt sync is delayed.
    }
  }

  function ticketStarterMessage(ticket: StudioSupportTicket): StudioSupportTicketMessage {
    return {
      id: `${ticket.id}-initial`,
      ticketId: ticket.id,
      message: ticket.message,
      authorUid: ticket.createdByUid,
      authorEmail: ticket.createdByEmail,
      authorName: ticket.createdByName || ticket.createdByEmail || t("Unknown user"),
      authorRole: "user",
      createdAtMillis: ticket.createdAtMillis
    };
  }

  function localReplyMessage(ticket: StudioSupportTicket, reply: string): StudioSupportTicketMessage {
    return {
      id: `${ticket.id}-local-${Date.now()}`,
      ticketId: ticket.id,
      message: reply,
      authorUid: "",
      authorEmail: "",
      authorName: t("You"),
      authorRole: isWorkspaceMode && canSeeWorkspaceQueue ? "workspaceAdmin" : (!isWorkspaceMode && isSupportAdmin ? "supportAdmin" : "user"),
      createdAtMillis: Date.now()
    };
  }

  useEffect(() => {
    setCategory(ticketMode === "workspace" ? "project" : "bug");
    setTitle("");
    setMessage("");
    setStatus("");
    setError("");
    setSelectedTicketId("");
    setMessagesByTicketId({});
  }, [ticketMode]);

  useEffect(() => {
    void loadTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.id, ticketMode]);

  async function loadTickets() {
    setLoadingTickets(true);
    setError("");
    try {
      const result = isWorkspaceMode
        ? await listWorkspaceSupportTickets(workspace)
        : await listNivaDeskSupportTickets(workspace);
      const sortedTickets = [...(result.tickets ?? [])].sort((a, b) =>
        Number(b.lastMessageAtMillis || b.updatedAtMillis || b.createdAtMillis || 0) -
        Number(a.lastMessageAtMillis || a.updatedAtMillis || a.createdAtMillis || 0)
      );
      setTickets(sortedTickets);
      setIsSupportAdmin(Boolean(result.isSupportAdmin));
      setCanSeeWorkspaceQueue(Boolean(result.canSeeWorkspaceQueue));
      void refreshSupportUnreadSummary();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("Could not load support tickets."));
    } finally {
      setLoadingTickets(false);
    }
  }

  async function submitTicket() {
    setSendingTicket(true);
    setStatus("");
    setError("");
    try {
      const payload = { title, message, category, priority, language };
      const result = isWorkspaceMode
        ? await createWorkspaceSupportTicket(workspace, payload)
        : await createNivaDeskSupportTicket(workspace, payload);
      setTitle("");
      setMessage("");
      setPriority("normal");
      setStatus(result.message || t("Ticket sent."));
      await loadTickets();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : t("Ticket could not be sent."));
    } finally {
      setSendingTicket(false);
    }
  }

  async function loadMessages(ticket: StudioSupportTicket) {
    const shouldClose = ticket.id === selectedTicketId;
    setSelectedTicketId(shouldClose ? "" : ticket.id);
    if (shouldClose) return;

    void markTicketAsRead(ticket);
    if (messagesByTicketId[ticket.id]) return;

    setMessagesByTicketId(previous => ({
      ...previous,
      [ticket.id]: previous[ticket.id] ?? [ticketStarterMessage(ticket)]
    }));
    setLoadingMessages(previous => ({ ...previous, [ticket.id]: true }));
    setError("");
    try {
      const result = isWorkspaceMode
        ? await listWorkspaceSupportTicketMessages(workspace, ticket.id)
        : await listNivaDeskSupportTicketMessages(workspace, ticket.id);
      const remoteMessages = result.messages ?? [];
      setMessagesByTicketId(previous => ({
        ...previous,
        [ticket.id]: remoteMessages.length > 0 ? remoteMessages : [ticketStarterMessage(ticket)]
      }));
    } catch {
      setMessagesByTicketId(previous => ({
        ...previous,
        [ticket.id]: previous[ticket.id] && previous[ticket.id].length > 0 ? previous[ticket.id] : [ticketStarterMessage(ticket)]
      }));
      setStatus(t("Conversation will sync when the support functions finish updating."));
    } finally {
      setLoadingMessages(previous => ({ ...previous, [ticket.id]: false }));
    }
  }

  async function sendReply(ticket: StudioSupportTicket) {
    const reply = (replyByTicketId[ticket.id] || "").trim();
    if (!reply) return;
    setSendingReply(previous => ({ ...previous, [ticket.id]: true }));
    setError("");
    setStatus("");
    try {
      await (isWorkspaceMode
        ? addWorkspaceSupportTicketReply(workspace, ticket.id, reply)
        : addNivaDeskSupportTicketReply(workspace, ticket.id, reply));
      setReplyByTicketId(previous => ({ ...previous, [ticket.id]: "" }));
      setMessagesByTicketId(previous => {
        const existing = previous[ticket.id] && previous[ticket.id].length > 0 ? previous[ticket.id] : [ticketStarterMessage(ticket)];
        return { ...previous, [ticket.id]: [...existing, localReplyMessage(ticket, reply)] };
      });
      setStatus(t("Reply sent."));

      try {
        const result = isWorkspaceMode
          ? await listWorkspaceSupportTicketMessages(workspace, ticket.id)
          : await listNivaDeskSupportTicketMessages(workspace, ticket.id);
        const remoteMessages = result.messages ?? [];
        if (remoteMessages.length > 0) {
          setMessagesByTicketId(previous => ({ ...previous, [ticket.id]: remoteMessages }));
        }
      } catch {
        setStatus(t("Reply sent. Conversation will refresh automatically after the support functions update."));
      }

      await loadTickets();
      await refreshSupportUnreadSummary();
      setSelectedTicketId(ticket.id);
    } catch (replyError) {
      setError(replyError instanceof Error ? replyError.message : t("Reply could not be sent."));
    } finally {
      setSendingReply(previous => ({ ...previous, [ticket.id]: false }));
    }
  }

  async function updateTicketStatus(ticket: StudioSupportTicket, nextStatus: StudioSupportTicketStatus) {
    setStatusUpdating(previous => ({ ...previous, [ticket.id]: true }));
    setError("");
    try {
      await (isWorkspaceMode
        ? updateWorkspaceSupportTicketStatus(workspace, ticket.id, nextStatus)
        : updateNivaDeskSupportTicketStatus(workspace, ticket.id, nextStatus));
      await loadTickets();
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : t("Ticket status could not be updated."));
    } finally {
      setStatusUpdating(previous => ({ ...previous, [ticket.id]: false }));
    }
  }

  return (
    <div className="settings-card-stack">
      <section className="card app-card">
        <CardTitle icon="notes" eyebrow={t("Support / Tickets")} title={t("How can we help?")} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
          <button
            className={isWorkspaceMode ? "settings-section-button active" : "settings-section-button"}
            type="button"
            onClick={() => setTicketMode("workspace")}
            style={{ textAlign: "left" }}
          >
            <span>
              <strong>{t("Contact Workspace Owner")}</strong>
              <small>{t("For internal project, task, customer or approval questions.")}</small>
            </span>
          </button>
          <button
            className={!isWorkspaceMode ? "settings-section-button active" : "settings-section-button"}
            type="button"
            onClick={() => setTicketMode("appSupport")}
            style={{ textAlign: "left" }}
          >
            <span>
              <strong>{t("Contact NivaDesk Support")}</strong>
              <small>{t("For app bugs, sync issues, billing, account or feature requests.")}</small>
            </span>
          </button>
        </div>
      </section>

      <section className="card app-card quick-reply-settings-card">
        <CardTitle icon="notes" eyebrow={isWorkspaceMode ? t("Workspace Ticket") : t("NivaDesk Support")} title={t("New Ticket")} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          <label className="quick-reply-settings-label">
            <span>{t("Category")}</span>
            <select className="input" value={category} disabled={sendingTicket} onChange={event => setCategory(event.target.value)}>
              {categories.map(option => <option key={option.value} value={option.value}>{t(option.label)}</option>)}
            </select>
          </label>
          <label className="quick-reply-settings-label">
            <span>{t("Priority")}</span>
            <select className="input" value={priority} disabled={sendingTicket} onChange={event => setPriority(event.target.value)}>
              {SUPPORT_PRIORITY_OPTIONS.map(option => <option key={option.value} value={option.value}>{t(option.label)}</option>)}
            </select>
          </label>
        </div>
        <label className="quick-reply-settings-label">
          <span>{t("Subject")}</span>
          <input className="input" value={title} disabled={sendingTicket} maxLength={160} onChange={event => setTitle(event.target.value)} placeholder={t("Briefly describe the issue")} />
        </label>
        <label className="quick-reply-settings-label">
          <span>{t("Message")}</span>
          <textarea className="input" value={message} disabled={sendingTicket} rows={6} maxLength={5000} onChange={event => setMessage(event.target.value)} placeholder={t("Add details, steps, screenshots context or what you expected to happen.")} />
        </label>
        <div className="settings-action-row">
          <button className="button" type="button" disabled={sendingTicket || !title.trim() || !message.trim()} onClick={submitTicket}>
            {sendingTicket ? t("Sending...") : t("Send Ticket")}
          </button>
          <button className="button secondary" type="button" disabled={loadingTickets} onClick={() => void loadTickets()}>
            {loadingTickets ? t("Refreshing...") : t("Refresh Tickets")}
          </button>
        </div>
        {status ? <p className="success-copy">{status}</p> : null}
        {error ? <p className="layout-error">{error}</p> : null}
      </section>

      <section className="card app-card">
        <CardTitle
          icon="notes"
          eyebrow={isWorkspaceMode ? t("Workspace Inbox") : t("NivaDesk Support Inbox")}
          title={isWorkspaceMode
            ? (canSeeWorkspaceQueue ? t("Workspace Tickets") : t("My Workspace Tickets"))
            : (isSupportAdmin ? t("NivaDesk Support Inbox") : t("My NivaDesk Support Tickets"))}
        />
        {supportUnreadCount > 0 ? <p className="muted-copy" style={{ marginTop: -4 }}>{supportUnreadCount} {t("unread ticket update")}</p> : null}
        {loadingTickets ? <p className="muted-copy">{t("Loading tickets...")}</p> : null}
        {!loadingTickets && tickets.length === 0 ? <p className="muted-copy">{t("No tickets yet.")}</p> : null}
        <div style={{ display: "grid", gap: 12 }}>
          {tickets.map(ticket => {
            const isSelected = selectedTicketId === ticket.id;
            const ticketMessages = messagesByTicketId[ticket.id] ?? [];
            const isUnread = supportTicketIsUnread(ticket, currentUserUid) || unreadTicketIds.includes(ticket.id);
            const lastMessageTime = ticket.lastMessageAtMillis || ticket.updatedAtMillis || ticket.createdAtMillis;
            return (
              <article key={ticket.id} className="mini-panel" style={supportTicketCardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div style={{ minWidth: 240, flex: "1 1 360px", display: "grid", gap: 5 }}>
                    <strong style={{ fontSize: 17, lineHeight: 1.25, color: "var(--text)" }}>{ticket.title || t("Untitled ticket")}</strong>
                    <p className="muted-copy" style={{ margin: 0, lineHeight: 1.45 }}>{ticket.message}</p>
                    <small className="muted-copy" style={{ lineHeight: 1.4 }}>{ticket.createdByName || ticket.createdByEmail || ticket.createdByUid} · {t("Created")} {formatSupportDate(ticket.createdAtMillis)}</small>
                    <small className="muted-copy" style={{ lineHeight: 1.4 }}>{t("Last message")} · {formatSupportDate(lastMessageTime)}</small>
                    {ticket.lastMessagePreview ? <small className="muted-copy" style={{ lineHeight: 1.4 }}>{t("Last reply")} · {ticket.lastMessagePreview}</small> : null}
                    {!isWorkspaceMode && isSupportAdmin ? <small className="muted-copy" style={{ lineHeight: 1.4 }}>{ticket.companyName || ticket.companyId} · {ticket.platform} {ticket.appVersion}</small> : null}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap", flex: "0 1 auto" }}>
                    {isUnread ? <span style={supportNewBadgeStyle}>{t("New")}</span> : null}
                    <span style={supportStatusPillStyle(ticket.status)}>{t(supportStatusLabel(ticket.status))}</span>
                    <span style={supportPriorityPillStyle(ticket.priority)}>{t(supportPriorityLabel(ticket.priority))}</span>
                    {canUpdateStatus ? (
                      <select
                        className="input"
                        value={ticket.status || "open"}
                        disabled={Boolean(statusUpdating[ticket.id])}
                        onChange={event => void updateTicketStatus(ticket, event.target.value as StudioSupportTicketStatus)}
                        style={{
                          width: 170,
                          minHeight: 34,
                          borderRadius: 10,
                          background: "rgba(241, 245, 249, 0.92)",
                          border: "1px solid rgba(100, 116, 139, 0.34)",
                          color: "#0f172a",
                          fontWeight: 800
                        }}
                      >
                        {SUPPORT_STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{t(option.label)}</option>)}
                      </select>
                    ) : null}
                    <button
                      className="button secondary"
                      type="button"
                      onClick={() => void loadMessages(ticket)}
                      style={{
                        padding: "6px 12px",
                        minHeight: 30,
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 700,
                        letterSpacing: "0.01em",
                        background: isSelected ? "rgba(226, 232, 240, 0.92)" : "rgba(219, 234, 254, 0.98)",
                        border: isSelected ? "1px solid rgba(100, 116, 139, 0.24)" : "1px solid rgba(59, 130, 246, 0.18)",
                        color: isSelected ? "#334155" : "#0284c7",
                        boxShadow: "none"
                      }}
                    >
                      {isSelected ? t("Hide Conversation") : t("Open Conversation")}
                    </button>
                  </div>
                </div>
                {isSelected ? (
                  <div style={{ borderTop: "1px solid rgba(148, 163, 184, 0.25)", paddingTop: 10, display: "grid", gap: 10 }}>
                    {loadingMessages[ticket.id] ? <p className="muted-copy">{t("Loading conversation...")}</p> : null}
                    {!loadingMessages[ticket.id] && ticketMessages.length === 0 ? <p className="muted-copy">{t("No replies yet.")}</p> : null}
                    {ticketMessages.map(item => (
                      <div key={item.id} className="mini-panel" style={{
                        background: item.authorRole === "user" ? "rgba(148, 163, 184, 0.08)" : "rgba(59, 130, 246, 0.12)",
                        border: item.authorRole === "user" ? "1px solid rgba(148, 163, 184, 0.22)" : "1px solid rgba(96, 165, 250, 0.30)",
                        padding: 14
                      }}>
                        <strong style={{ color: "var(--text)" }}>{item.authorName || item.authorEmail || t("Unknown user")}</strong>
                        <small className="muted-copy"> · {t(supportAuthorRoleLabel(item.authorRole))} · {formatSupportDate(item.createdAtMillis)}</small>
                        <p className="muted-copy" style={{ marginTop: 6, marginBottom: 0, whiteSpace: "pre-wrap", lineHeight: 1.45 }}>{item.message}</p>
                      </div>
                    ))}
                    <label className="quick-reply-settings-label">
                      <span>{t("Reply")}</span>
                      <textarea
                        className="input"
                        rows={4}
                        value={replyByTicketId[ticket.id] ?? ""}
                        disabled={Boolean(sendingReply[ticket.id])}
                        onChange={event => setReplyByTicketId(previous => ({ ...previous, [ticket.id]: event.target.value }))}
                        placeholder={t("Write a reply...")}
                      />
                    </label>
                    <div className="settings-action-row">
                      <button className="button" type="button" disabled={Boolean(sendingReply[ticket.id]) || !(replyByTicketId[ticket.id] || "").trim()} onClick={() => void sendReply(ticket)}>
                        {sendingReply[ticket.id] ? t("Sending...") : t("Send Reply")}
                      </button>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

const APP_SUPPORT_CATEGORY_OPTIONS = [
  { value: "bug", label: "Bug / Problem" },
  { value: "question", label: "Question" },
  { value: "billing", label: "Billing" },
  { value: "feature", label: "Feature Request" },
  { value: "account", label: "Account" },
  { value: "other", label: "Other" }
];

const WORKSPACE_SUPPORT_CATEGORY_OPTIONS = [
  { value: "project", label: "Project" },
  { value: "task", label: "Task" },
  { value: "approval", label: "Approval" },
  { value: "customer", label: "Customer" },
  { value: "internal", label: "Internal" },
  { value: "other", label: "Other" }
];

const SUPPORT_PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" }
];

const SUPPORT_STATUS_OPTIONS: Array<{ value: StudioSupportTicketStatus; label: string }> = [
  { value: "open", label: "Open" },
  { value: "inProgress", label: "In Progress" },
  { value: "waitingForUser", label: "Waiting for User" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" }
];


const supportTicketCardStyle: React.CSSProperties = {
  display: "grid",
  gap: 12,
  padding: "18px 20px",
  borderRadius: 18,
  border: "1px solid rgba(148, 163, 184, 0.28)",
  background: "color-mix(in srgb, var(--card) 88%, transparent)",
  boxShadow: "0 12px 28px rgba(15, 23, 42, 0.08)"
};

const baseSupportPillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 30,
  padding: "0 13px",
  borderRadius: 999,
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: "0.01em",
  whiteSpace: "nowrap",
  border: "1px solid transparent"
};

const supportNewBadgeStyle: React.CSSProperties = {
  ...baseSupportPillStyle,
  color: "#ef4444",
  background: "rgba(254, 226, 226, 0.98)",
  borderColor: "rgba(239, 68, 68, 0.18)",
  boxShadow: "none"
};

const supportUnreadMenuBadgeStyle: React.CSSProperties = {
  display: "inline-flex",
  minWidth: 22,
  height: 22,
  alignItems: "center",
  justifyContent: "center",
  padding: "0 8px",
  borderRadius: 999,
  background: "rgba(254, 226, 226, 0.98)",
  border: "1px solid rgba(239, 68, 68, 0.18)",
  color: "#ef4444",
  fontSize: 12,
  fontWeight: 900,
  boxShadow: "none"
};

function supportStatusPillStyle(status: string): React.CSSProperties {
  const normalized = String(status || "open");
  if (normalized === "resolved") {
    return { ...baseSupportPillStyle, color: "#16a34a", background: "rgba(220, 252, 231, 0.98)", borderColor: "rgba(34, 197, 94, 0.16)" };
  }
  if (normalized === "inProgress") {
    return { ...baseSupportPillStyle, color: "#0284c7", background: "rgba(219, 234, 254, 0.98)", borderColor: "rgba(59, 130, 246, 0.18)" };
  }
  if (normalized === "waitingForUser") {
    return { ...baseSupportPillStyle, color: "#c026d3", background: "rgba(250, 232, 255, 0.98)", borderColor: "rgba(217, 70, 239, 0.16)" };
  }
  if (normalized === "closed") {
    return { ...baseSupportPillStyle, color: "#64748b", background: "rgba(241, 245, 249, 0.98)", borderColor: "rgba(100, 116, 139, 0.16)" };
  }
  return { ...baseSupportPillStyle, color: "#0284c7", background: "rgba(224, 242, 254, 0.98)", borderColor: "rgba(14, 165, 233, 0.18)" };
}

function supportPriorityPillStyle(priority: string): React.CSSProperties {
  const normalized = String(priority || "normal");
  if (normalized === "urgent") {
    return { ...baseSupportPillStyle, color: "#dc2626", background: "rgba(254, 226, 226, 0.98)", borderColor: "rgba(239, 68, 68, 0.18)" };
  }
  if (normalized === "high") {
    return { ...baseSupportPillStyle, color: "#ea580c", background: "rgba(255, 237, 213, 0.98)", borderColor: "rgba(249, 115, 22, 0.18)" };
  }
  if (normalized === "low") {
    return { ...baseSupportPillStyle, color: "#16a34a", background: "rgba(220, 252, 231, 0.98)", borderColor: "rgba(34, 197, 94, 0.16)" };
  }
  return { ...baseSupportPillStyle, color: "#64748b", background: "rgba(241, 245, 249, 0.98)", borderColor: "rgba(100, 116, 139, 0.16)" };
}

function supportStatusLabel(status: string) {
  return SUPPORT_STATUS_OPTIONS.find(option => option.value === status)?.label ?? "Open";
}

function supportPriorityLabel(priority: string) {
  return SUPPORT_PRIORITY_OPTIONS.find(option => option.value === priority)?.label ?? "Normal";
}

function supportAuthorRoleLabel(role: string) {
  if (role === "supportAdmin") return "NivaDesk Support";
  if (role === "workspaceAdmin") return "Workspace Owner/Admin";
  return "User";
}

function formatSupportDate(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}


function AboutSection({ workspace }: { workspace: WorkspaceContext }) {
  return (
    <div className="settings-card-stack">
      <section className="card app-card">
        <CardTitle icon="notes" eyebrow="About" title="NivaDesk" />
        <div className="about-app-panel">
          <span className="about-app-mark" aria-hidden="true">⬢</span>
          <div>
            <strong>NivaDesk</strong>
            <p>Version 1.0.0</p>
            <p>An EGGcraft brand for studio workspace management.</p>
          </div>
        </div>
        <div className="settings-divider" />
        <p className="muted-copy"><strong>© 2026 All rights reserved.</strong></p>
        <p className="muted-copy">This software and all its components, including its custom logic, layout, and AI integration systems, are the exclusive intellectual property of the developer.</p>
      </section>

      <section className="card app-card">
        <CardTitle icon="storage" eyebrow="Workspace" title="Current workspace" />
        <div className="settings-mini-grid">
          <InfoTile label="Workspace" value={workspace.name} />
          <InfoTile label="Company ID" value={workspace.id} />
          <InfoTile label="Web portal" value="Next.js + Firebase" />
        </div>
        <p className="muted-copy">NivaDesk keeps orders, Client Files, plan guards and card profiles synced across the Swift app, web portal and Firebase backend.</p>
      </section>
    </div>
  );
}

function PlaceholderSection({ title, detail, action }: { title: string; detail: string; action?: React.ReactNode }) {
  return (
    <section className="card app-card">
      <CardTitle icon="notes" eyebrow="Status" title={title} />
      <p className="muted-copy">{detail}</p>
      {action}
    </section>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <article className="mini-panel settings-info-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
