"use client";

import { CHANGELOG } from "@/lib/publicSite/changelog";
import { clearDeviceLocalWorkspaceCache } from "@/lib/studioflow/deviceLocalCache";
import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { signOut, sendEmailVerification } from "firebase/auth";
import { AppShell } from "@/components/AppShell";
import { CardIconGlyph, CardTitle, type CardIcon } from "@/components/CardTitle";
import { CustomRoleManager } from "@/components/CustomRoleManager";
import { LoadingScreen } from "@/components/LoadingScreen";
import { SettingsDialog } from "./SettingsDialog";
import type { FinancialRecalculationPreview, ClearTaxPreview, ImportBackupPreview, SettingsAuditEntry } from "@/lib/studioflow/settingsActions";
import type { InboundWebhookTestResult, InboundPayloadCheck } from "@/lib/studioflow/planActions";
import { SettingsDirtyProvider, useProvideSettingsDirty, useUnsavedGuard } from "./unsavedChanges";
import { useAuth } from "@/lib/auth/AuthProvider";
import { auth, db, functions } from "@/lib/firebase/client";
import { collection, getDocs } from "firebase/firestore";
import {
  INTEGRATION_CATEGORIES,
  INTEGRATION_PROVIDERS,
  INTEGRATION_STATE_LABELS,
  resolveIntegrationState,
  type IntegrationLiveState,
  type IntegrationManageTarget,
  type IntegrationProvider,
  type IntegrationSignals,
  loadIntegrationSignals,
  EMPTY_INTEGRATION_SIGNALS,
} from "@/lib/studioflow/integrations";
import { getEtsyConnections, type EtsyConnection } from "@/lib/studioflow/etsy";
import { httpsCallable } from "firebase/functions";
import { EtsyIntegrationSection } from "./EtsyIntegrationSection";
import { WooCommerceIntegrationSection } from "./WooCommerceIntegrationSection";
import { SquareIntegrationSection } from "./SquareIntegrationSection";
import { PayPalIntegrationSection } from "./PayPalIntegrationSection";
import { QuickBooksIntegrationSection } from "./QuickBooksIntegrationSection";
import { SettingsPageHeader, SettingsHeaderActionsContext, SettingsCardHead, useSettingsHeaderActions, type SettingsHeaderStatus } from "./pageHeader";
import { CommerceSyncHealthCard } from "./CommerceSyncHealthCard";
import { ClientDomainSection } from "./ClientDomainSection";
import { SmsNotificationsSection } from "./SmsNotificationsSection";
import { getIntegrationWebhookInfo, rotateIntegrationWebhookToken, sendTestInboundWebhook, sendTestIntegrationWebhook, validateInboundOrderPayload, type IntegrationWebhookInfo, type IntegrationWebhookKind } from "@/lib/studioflow/planActions";
import { PlanComparisonCard } from "@/components/PlanComparisonCard";
import { ACCOUNT_AVATAR_ACCEPT, changeAccountEmail, saveAccountAvatar, saveAccountProfile, sendAccountPasswordReset, uploadAccountAvatar } from "@/lib/studioflow/accountProfile";
import { PLAN_ENTITLEMENTS, STRIPE_LIST_PRICE_LABELS, usagePercent, type PlanEntitlements } from "@/lib/studioflow/plans";
import {
  loadDashboardCounts,
  loadQuickReplySettings,
  loadTeamAccessData,
  loadJoinedWorkspaceOptions,
  loadWorkspaceContext,
  switchActiveWorkspace,
  loadWorkspaceExportData,
  loadWorkspaceSettingsOverview,
  setWorkspaceQuickReplyMenuEnabled,
  normalizeWorkspaceRole,
  workspaceAccessAllows,
  WORKSPACE_MEMBER_ACCESS_DEFAULTS,
  WORKSPACE_SETTINGS_ACCESS_OPTIONS,
  type WorkspaceMemberAccess,
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
import { canContributeQuickReplyKnowledgeForRole, canEditPersonalQuickReplySettingsForRole, canEditQuickReplySettingsForRole, deleteQuickReplyContribution, listQuickReplyContributions, loadQuickReplyPersonalSettings, saveQuickReplyContribution, saveQuickReplyPersonalSettings, saveQuickReplySettings, testQuickReplyApiKey, type QuickReplyContributionItem, type QuickReplyKeyTestResult } from "@/lib/studioflow/quickReply";
import {
  loadWorkspaceBlockHeadings,
  saveWorkspaceBlockHeadings,
  type BlockHeadingSettings,
  type HeadingItem
} from "@/lib/studioflow/blockHeadings";
import { workspaceOnboardingPromptSeed, isWorkspaceOnboardingPromptSeed } from "@/lib/studioflow/workspaceOnboarding";
import { appCompatibleBackupJson, customersToCsv, downloadTextFile, fullBackupJson, ordersToCsv, safeFileDate } from "@/lib/studioflow/export";
import { studioT, SUPPORTED_STUDIO_LANGUAGES, studioLocaleTag } from "@/lib/studioflow/language";
import { getAutoLockMinutes, setAutoLockMinutes } from "@/lib/auth/sessionLock";
import { getMessageWorkspaceSettings, setMessageWorkspaceSettings, type StudioMessageWorkspaceSettings } from "@/lib/studioflow/messages";
import { canDeleteWorkspaceDataForRole, canEditWorkspaceSettingsForRole, clearAllOrdersTax, previewClearAllOrdersTax, undoClearAllOrdersTax, deleteWorkspaceData, getPersonalInterfaceSettings, importWorkspaceBackup, previewWorkspaceBackupImport, undoWorkspaceBackupImport, recordWorkspaceBackupExport, previewFinancialRecalculationForOrders, recalculateFinancialSettingsForOrders, saveFinancialSettings, saveLanguageSettings, savePdfExportSettings, savePersonalInterfaceSettings, saveThemeBrandingSettings, saveUploadSafetySettings, saveIntegrationSyncSettings, getSettingsAuditLog } from "@/lib/studioflow/settingsActions";
import { approveJoinRequest, declineJoinRequest, deleteWorkspaceCustomRole, removeTeamMember, requestWorkspaceAccess, saveWorkspaceCustomRole, syncAcceptedJoinRequests, updateTeamMemberRole, WEB_TEAM_ROLES } from "@/lib/studioflow/teamActions";
import { canManageWorkspaceLogoForRole, saveWorkspaceLogoUrl, uploadWorkspaceLogo, WORKSPACE_LOGO_ACCEPT } from "@/lib/studioflow/workspaceLogo";
import { canDeleteOrdersForRole, canEditOrderStatusForRole } from "@/lib/studioflow/orders";
import { canManageClientFilesForRole } from "@/lib/studioflow/clientFiles";
import {
  addNivaDeskSupportTicketReply,
  addWorkspaceSupportTicketReply,
  uploadSupportTicketAttachment,
  type StudioSupportTicketAttachment,
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
  type StudioSupportTicketType,
  getWebsiteAssistantConfig,
  setWebsiteAssistant
} from "@/lib/studioflow/supportTickets";

type SettingsSectionId =
  | "profile-security"
  | "preferences"
  | "about"
  | "branding"
  | "workflow"
  | "pdf"
  | "quick-reply"
  | "financial"
  | "integrations"
  | "safety-uploads"
  | "data"
  | "plan-access"
  | "team-access"
  | "message-settings"
  | "sms-notifications"
  | "support-tickets"
  | "client-domain";

type SettingsGroup =
  | "personal"
  | "design"
  | "workflowGroup"
  | "finance"
  | "team"
  | "files"
  | "dataGroup"
  | "billing"
  | "integrations"
  | "supportGroup";

type SettingsSection = {
  id: SettingsSectionId;
  title: string;
  appKey: string;
  description: string;
  icon: keyof typeof SETTINGS_ICON_PATHS;
  group: SettingsGroup;
};

// Backwards-compatible deep links. Older URLs / buttons point at the previous
// section ids; map them onto the new Account / Workspace structure so existing
// `?section=...` links and the avatar menu keep landing on the right screen.
const SETTINGS_SECTION_ALIASES: Record<string, SettingsSectionId> = {
  woocommerce: "integrations",
  square: "integrations",
  shopify: "integrations",
  inbound: "integrations",
  etsy: "integrations",
  quickbooks: "integrations",
  sms: "sms-notifications",
  general: "profile-security",
  account: "profile-security",
  appearance: "preferences",
  language: "preferences",
  "theme-branding": "preferences",
  "language-labels": "preferences"
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
  about: ["M12 17v-5", "M12 8h.01", "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z"],
  brand: ["M3 11.5 11.5 3H19a2 2 0 0 1 2 2v6.5L12.5 20a2 2 0 0 1-2.8 0l-5.7-5.7a2 2 0 0 1 0-2.8Z", "M16 8h.01"],
  sliders: ["M4 8h9", "M16 8h4", "M4 16h4", "M11 16h9", "M13 6v4", "M8 14v4"]
};

// The reviewer's point stands: personal preferences, tax rules, destructive
// data actions and integration secrets carried the same visual weight under
// two broad headings. Ten narrow groups sort the menu by what a mistake there
// would cost. Section ids are untouched, so every deep link keeps working.
const SETTINGS_SECTIONS: SettingsSection[] = [
  { id: "profile-security", title: "Profile & Security", appKey: "Account", description: "Your name, photo, sign-in email and password.", icon: "account", group: "personal" },
  { id: "preferences", title: "Preferences", appKey: "Preferences", description: "Your personal theme and language.", icon: "sliders", group: "personal" },
  { id: "about", title: "About", appKey: "About", description: "App version and product information.", icon: "about", group: "personal" },
  { id: "branding", title: "Branding", appKey: "Branding", description: "Workspace name, logo and subtitle.", icon: "brand", group: "design" },
  { id: "client-domain", title: "Customer Portal Domain", appKey: "Client Domain", description: "Branded customer links: your subdomain and your own domain.", icon: "brand", group: "design" },
  { id: "pdf", title: "PDF Export Settings", appKey: "PDF", description: "Invoice and PDF export options.", icon: "pdf", group: "design" },
  { id: "workflow", title: "Workflow Steps", appKey: "Workflow", description: "Order steps and custom fields.", icon: "workflow", group: "workflowGroup" },
  { id: "quick-reply", title: "AI Reply Settings", appKey: "Quick Reply", description: "Reply engine, tone and company knowledge.", icon: "reply", group: "workflowGroup" },
  { id: "sms-notifications", title: "Customer SMS", appKey: "Customer SMS", description: "Text updates to customers: sender ID, what triggers a message, this month's usage.", icon: "reply", group: "workflowGroup" },
  { id: "financial", title: "Financial Settings", appKey: "Financial", description: "Fees, tax and calculations.", icon: "financial", group: "finance" },
  { id: "team-access", title: "Team Access", appKey: "Team Access", description: "Members, roles and workspace requests.", icon: "team", group: "team" },
  { id: "message-settings", title: "Message Settings", appKey: "Message Settings", description: "Workspace-wide messaging permissions for the team.", icon: "reply", group: "team" },
  { id: "safety-uploads", title: "Safety & Uploads", appKey: "Upload Safety", description: "Upload rules, file limits and audit protection.", icon: "shield", group: "files" },
  { id: "data", title: "Data Management", appKey: "Data", description: "Import, export and backup.", icon: "data", group: "files" },
  { id: "plan-access", title: "Plan & Access", appKey: "Plan & Access", description: "Billing, limits and feature access.", icon: "plan", group: "billing" },
  { id: "integrations", title: "Integrations", appKey: "Integrations", description: "Connect the tools you use to run your business.", icon: "cart", group: "integrations" },
  { id: "support-tickets", title: "Support / Tickets", appKey: "Support / Tickets", description: "Contact your workspace owner or NivaDesk support.", icon: "reply", group: "supportGroup" }
];

// Settings search (settings report): each section carries the terms a user
// actually types — "VAT", "logo", "password" — beyond its title words.
const SETTINGS_SEARCH_KEYWORDS: Record<SettingsSectionId, string> = {
  "profile-security": "password email photo sign in account delete biometric security",
  preferences: "theme language dark light auto lock",
  about: "version release diagnostics whats new",
  branding: "logo name subtitle brand colour",
  "client-domain": "domain subdomain dns cname portal accent powered by",
  pdf: "invoice pdf export vat eori job sheet preview",
  workflow: "status steps template material headings badges",
  "quick-reply": "ai reply openai api key knowledge tone quick",
  "sms-notifications": "sms text message texts sender id twilio notification trigger calling code customer updates mobile",
  financial: "vat tax fee currency corporation margin recalculate decimal",
  "team-access": "role member permission invite seat join request",
  "message-settings": "chat group messaging direct",
  "safety-uploads": "upload file size limit policy zip audit virus",
  data: "backup export import csv restore delete archive audit history change log who changed",
  "plan-access": "billing plan storage subscription upgrade seat",
  integrations: "integration connect webhook woocommerce shopify etsy square pos wix squarespace amazon zapier make stripe paypal quickbooks xero pandle dropbox google drive open banking store sync api",
  "support-tickets": "ticket help support contact"
};

const SETTINGS_GROUP_LABELS: Record<SettingsGroup, string> = {
  personal: "Personal",
  design: "Workspace",
  workflowGroup: "Workflow",
  finance: "Finance & Tax",
  team: "Team & Permissions",
  files: "Files & Data",
  dataGroup: "Data & Backups",
  billing: "Billing",
  integrations: "Integrations",
  supportGroup: "Support"
};

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
  // ACTIVE orders: finished work is not using anything, and saying so is the
  // difference between a limit you can get back under and one you cannot.
  return plan.orderLimit == null ? "Unlimited orders" : `${plan.orderLimit} active orders`;
}

function planBillingStateLabel(status: string) {
  switch (String(status || "").toLowerCase()) {
    case "active": return "Active";
    case "trialing": return "Trial";
    case "past_due": return "Payment failed";
    case "cancelled":
    case "canceled": return "Cancelled";
    case "free": return "Free";
    default: return status ? status : "Free";
  }
}

function planCustomerLimitText(plan: { customerLimit: number | null }) {
  return plan.customerLimit == null ? "Unlimited customers" : `${plan.customerLimit} customers`;
}

function planTeamLimitText(plan: { plan?: string; teamMemberLimit: number }) {
  // "add up to 10" read as "10 more". TEAM_INCLUDED_SEATS 5, TEAM_SELF_SERVICE_MAX_SEATS 10.
  if (plan.plan === "team_monthly") return "5 seats included · 10 in total";
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

type PermissionMatrixColumn = {
  key: string;
  label: string;
  count: number;
  /** Normalized base behavior role ("owner" | "admin" | "member" | "viewer" | "workflow"). */
  baseRole: string;
  access: WorkspaceMemberAccess;
  isCustom: boolean;
};

type PermissionMatrixCell = boolean | { enabled: number; total: number };

type PermissionMatrixRow = {
  key: string;
  label: string;
  value: (column: PermissionMatrixColumn) => PermissionMatrixCell;
};

/**
 * Access map a plain base-role member receives. Mirrors the role defaults and
 * workflow hard-overrides applied in workspaceMemberAccess()
 * (lib/studioflow/firestore.ts) — custom roles use their own saved access map
 * instead and are NOT run through the workflow overrides, matching the server.
 */
function baseRoleMatrixAccess(baseRole: string): WorkspaceMemberAccess {
  const access: WorkspaceMemberAccess = { ...WORKSPACE_MEMBER_ACCESS_DEFAULTS };
  if (baseRole === "owner") {
    // Owners see everything, including the opt-in bank feed.
    access.bankFeed = true;
    return access;
  }
  if (baseRole === "workflow") {
    access.dashboard = false;
    access.financialInfo = false;
    access.customers = false;
    access.teamAccess = false;
    access.cardFinancial = false;
    access.assignedProjectsOnly = true;
    access.manageProjectAssignments = false;
    access.orders = true;
    access.schedule = true;
    access.quickReply = true;
    access.clientFiles = true;
    access.cardClientFiles = true;
  }
  return access;
}

/**
 * Read-only matrix rows. Every row derives from something the app actually
 * enforces: either a workspace access flag (WORKSPACE_*_ACCESS_OPTIONS keys)
 * or a base-role capability helper (canXxxForRole). Inventory intentionally
 * has no row of its own — the inventory page shares the "orders" gate.
 */
const PERMISSION_MATRIX_ROWS: PermissionMatrixRow[] = [
  { key: "viewOrders", label: "View orders", value: column => column.access.orders !== false },
  { key: "editOrders", label: "Edit orders & workflow", value: column => canEditOrderStatusForRole(column.baseRole) },
  { key: "deleteOrders", label: "Delete orders", value: column => canDeleteOrdersForRole(column.baseRole) },
  { key: "dashboard", label: "Dashboard", value: column => column.access.dashboard !== false },
  { key: "financialInfo", label: "Financial Info", value: column => column.access.financialInfo !== false },
  { key: "customers", label: "Customers", value: column => column.access.customers !== false },
  { key: "messages", label: "Messages", value: column => column.access.messages !== false },
  { key: "clientFiles", label: "Client Files", value: column => column.access.clientFiles !== false },
  {
    key: "deleteClientFiles",
    label: "Delete client files",
    // Same pair of checks the files page and order detail use for the delete button.
    value: column => canManageClientFilesForRole(column.baseRole) && column.access.deleteClientFiles !== false
  },
  { key: "bankFeed", label: "Bank Spending", value: column => column.access.bankFeed !== false },
  {
    key: "settingsAreas",
    label: "Settings areas",
    value: column => ({
      enabled: WORKSPACE_SETTINGS_ACCESS_OPTIONS.filter(option => column.access[option.key] !== false).length,
      total: WORKSPACE_SETTINGS_ACCESS_OPTIONS.length
    })
  },
  // Approving requests, changing roles and removing members are owner-only
  // (canManageTeam in TeamAccessSection requires the owner role).
  { key: "manageMembers", label: "Manage members & roles", value: column => column.baseRole === "owner" }
];

function canSeeSettingsSection(workspace: WorkspaceContext | null, sectionId: SettingsSectionId) {
  if (!workspace) return true;
  // Message Settings only exists on plans with the Messages feature — hidden from
  // everyone (owners included) otherwise, matching the Messages nav gate and Mac/Android.
  if (sectionId === "message-settings" && workspace.entitlements.features.messages !== true) return false;
  if (normalizeWorkspaceRole(workspace.role) === "owner") return true;

  const allowed = (key: keyof NonNullable<WorkspaceContext["memberAccess"]>) => workspaceAccessAllows(workspace.memberAccess, key);
  const isWorkflowOnly = normalizeWorkspaceRole(workspace.role) === "workflow";

  // Settings sidebar items are gated SOLELY by their own per-section permission flag.
  // We deliberately do not require the workspace-level "settings" nav flag here so
  // an owner can hand out individual settings screens (e.g. only Quick Reply) to a
  // role without having to also toggle on the broader Settings nav access. Mirrors
  // the Mac / Android behaviour where disabled permissions hide the menu cleanly
  // without surfacing a Firestore "Missing or insufficient permissions" popup.
  // Personal Account screens — visible to any member (including workflow-only)
  // that has the General settings flag, because they edit their own account.
  if (
    sectionId === "profile-security" ||
    sectionId === "preferences" ||
    sectionId === "about"
  ) {
    return allowed("settingsGeneral");
  }
  if (sectionId === "support-tickets") return allowed("settingsSupport");
  if (sectionId === "team-access") return allowed("settingsTeamAccess");
  // Message Settings — workspace messaging toggles, only meaningful on a plan with
  // the Messages feature (mirrors the Mac/Android team-access gate).
  if (sectionId === "message-settings") {
    return workspace.entitlements.features.messages === true && allowed("settingsMessageSettings");
  }

  if (isWorkflowOnly) {
    if (sectionId === "quick-reply") return allowed("settingsQuickReply");
    if (sectionId === "pdf") return allowed("settingsPdf");
    return false;
  }

  // Workspace branding/identity — shared workspace setting, hidden from
  // workflow-only members (handled above) like the other workspace sections.
  if (sectionId === "branding") return allowed("settingsGeneral");

  // Explicit per-section gates for non-owner, non-workflow members. Default = false.
  if (sectionId === "workflow") return allowed("settingsWorkflow");
  if (sectionId === "quick-reply") return allowed("settingsQuickReply");
  if (sectionId === "financial") return workspace.entitlements.features.financial_advanced && allowed("settingsFinancial");
  if (sectionId === "pdf") return allowed("settingsPdf");
  if (sectionId === "safety-uploads") return allowed("settingsSafetyUploads");
  if (sectionId === "data") return allowed("settingsData");
  if (sectionId === "integrations") return allowed("settingsWorkflow");
  // Customer SMS is deliberately NOT hidden on plans without it: a workspace
  // that cannot text customers still deserves to be told that is why, and what
  // it would take. The screen itself is read-only for everyone but the owner.
  if (sectionId === "sms-notifications") return allowed("settingsWorkflow");
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
  const [teamDataLoadFailed, setTeamDataLoadFailed] = useState(false);
  const [supportUnreadCount, setSupportUnreadCount] = useState(0);
  const [activeSection, setActiveSection] = useState<SettingsSectionId>("profile-security");
  const [sectionSearch, setSectionSearch] = useState("");
  // The page header's action group, registered by the section that owns it.
  const [headerActions, setHeaderActions] = useState<ReactNode>(null);
  const headerActionsContext = useMemo(() => ({ setActions: setHeaderActions }), []);
  // Sidebar groups fold; the choice is this browser's and survives reloads.
  const [collapsedGroups, setCollapsedGroups] = useState<Partial<Record<SettingsGroup, boolean>>>({});
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("nivadesk-settings-collapsed-groups");
      if (raw) setCollapsedGroups(JSON.parse(raw) as Partial<Record<SettingsGroup, boolean>>);
    } catch { /* a fresh browser starts with every group open */ }
  }, []);
  const toggleGroup = useCallback((group: SettingsGroup) => {
    setCollapsedGroups(prev => {
      const next = { ...prev, [group]: !prev[group] };
      try { window.localStorage.setItem("nivadesk-settings-collapsed-groups", JSON.stringify(next)); } catch { /* storage may be unavailable */ }
      return next;
    });
  }, []);
  // Sections register their own unsaved edits here; see ./unsavedChanges.
  const settingsDirty = useProvideSettingsDirty();
  const unsavedSectionId = useMemo(
    () => Object.keys(settingsDirty.dirtySections).find(id => settingsDirty.dirtySections[id]) ?? "",
    [settingsDirty.dirtySections]
  );
  const [pendingExit, setPendingExit] = useState<
    { kind: "section"; sectionId: SettingsSectionId } | { kind: "link"; href: string } | null
  >(null);
  const [savingBeforeExit, setSavingBeforeExit] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [error, setError] = useState("");
  // Mobile drill-in: show the section list first, then the selected section's
  // content full-screen with a Back button (like the Mac/iPhone settings).
  const [isPhone, setIsPhone] = useState(false);
  const [mobileDetail, setMobileDetail] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 980px)");
    const onChange = () => setIsPhone(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, router, user]);

  // The Integrations hub reads three things out of the URL: which provider an
  // old ?section=shopify link meant, which category to lead with, and whether
  // the Getting started card sent this person here to connect a shop.
  const [integrationIntent, setIntegrationIntent] = useState("");
  const [integrationCategory, setIntegrationCategory] = useState("");
  const [integrationProvider, setIntegrationProvider] = useState<IntegrationManageTarget>("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rawRequested = params.get("section");
    setIntegrationIntent(params.get("intent") ?? "");
    setIntegrationCategory(params.get("category") ?? "");
    if (
      rawRequested === "shopify" ||
      rawRequested === "woocommerce" ||
      rawRequested === "inbound" ||
      rawRequested === "etsy" ||
      rawRequested === "square" || rawRequested === "paypal" || rawRequested === "quickbooks"
    ) {
      setIntegrationProvider(rawRequested);
    }
    // Etsy sends the seller back to /settings with ?etsy=connected|cancelled|error
    // and no section of its own. That message is read by the Etsy panel, and the
    // panel only mounts once it is open - so a return from Etsy has to open it.
    // Without this, the seller approves access to their shop, lands on whichever
    // settings page happens to be first, and is told nothing at the one moment
    // they most need an answer.
    if (params.get("etsy")) {
      setIntegrationProvider("etsy");
      setActiveSection("integrations");
    }
    if (!rawRequested) return;
    const requested = (SETTINGS_SECTION_ALIASES[rawRequested] ?? rawRequested) as SettingsSectionId;
    if (SETTINGS_SECTIONS.some(section => section.id === requested)) {
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
        let teamLoadFailed = false;
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
              return loadTeamAccessData(loadedWorkspace).catch(teamLoadError => {
                console.warn("Team access data could not be loaded:", teamLoadError);
                teamLoadFailed = true;
                return null;
              });
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
        setTeamDataLoadFailed(teamLoadFailed);
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
    () => visibleSections.find(section => section.id === activeSection) ?? visibleSections[0] ?? SETTINGS_SECTIONS.find(section => section.id === "profile-security") ?? SETTINGS_SECTIONS[0],
    [activeSection, visibleSections]
  );
  const language = settings?.selectedLanguage ?? "English";
  const t = (text: string) => studioT(text, language);

  const storagePercent = useMemo(() => {
    if (!workspace || !counts) return 0;
    return usagePercent(counts.estimatedFileUsageMB, workspace.billingStorageLimitMB);
  }, [counts, workspace]);

  // Closing or reloading the tab is the browser's to warn about.
  useEffect(() => {
    if (!unsavedSectionId) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [unsavedSectionId]);

  // Leaving through the app's own nav is a client-side route change, so
  // beforeunload never fires for it. This is the path that actually loses work.
  useEffect(() => {
    if (!unsavedSectionId) return;
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
      const anchor = (event.target as HTMLElement | null)?.closest?.("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href") ?? "";
      if (!href.startsWith("/") || anchor.getAttribute("target") === "_blank") return;
      const destination = new URL(href, window.location.origin);
      if (destination.pathname === window.location.pathname) return;
      event.preventDefault();
      setPendingExit({ kind: "link", href });
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [unsavedSectionId]);

  function leavePendingExit(exit: { kind: "section"; sectionId: SettingsSectionId } | { kind: "link"; href: string }) {
    setPendingExit(null);
    if (exit.kind === "section") applySection(exit.sectionId);
    else router.push(exit.href);
  }

  async function savePendingExit() {
    if (!pendingExit) return;
    const save = settingsDirty.saveHandlerFor(unsavedSectionId);
    if (!save) return;
    setSavingBeforeExit(true);
    try {
      await save();
      leavePendingExit(pendingExit);
    } catch {
      // The section shows its own error; keep the user where the edit still is.
      setPendingExit(null);
    } finally {
      setSavingBeforeExit(false);
    }
  }

  function applySection(sectionId: SettingsSectionId) {
    setActiveSection(sectionId);
    setMobileDetail(true);
    const url = new URL(window.location.href);
    url.searchParams.set("section", sectionId);
    window.history.replaceState(null, "", url);
  }

  function selectSection(sectionId: SettingsSectionId) {
    if (sectionId === activeSection || !unsavedSectionId) {
      applySection(sectionId);
      return;
    }
    setPendingExit({ kind: "section", sectionId });
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
    setTeamDataLoadFailed(false);
    return nextTeamData;
  }

  if (loading || !user) return <LoadingScreen />;

  return (
    <AppShell>
      {loadingSettings ? <LoadingScreen /> : null}
      {pendingExit ? (
        <SettingsDialog
          eyebrow={t("Unsaved changes")}
          title={t("Leave without saving?")}
          onDismiss={() => setPendingExit(null)}
          actions={[
            ...(settingsDirty.saveHandlerFor(unsavedSectionId)
              ? [{
                  label: savingBeforeExit ? t("Saving...") : t("Save and continue"),
                  tone: "primary" as const,
                  disabled: savingBeforeExit,
                  onClick: () => { void savePendingExit(); }
                }]
              : []),
            {
              label: t("Discard changes"),
              tone: "danger" as const,
              disabled: savingBeforeExit,
              onClick: () => leavePendingExit(pendingExit)
            },
            {
              label: t("Stay here"),
              tone: "secondary" as const,
              disabled: savingBeforeExit,
              onClick: () => setPendingExit(null)
            }
          ]}
        >
          <p>{t("This section has changes you have not saved yet. Leaving now discards them.")}</p>
        </SettingsDialog>
      ) : null}
      <SettingsDirtyProvider value={settingsDirty}>
      <SettingsHeaderActionsContext.Provider value={headerActionsContext}>
      <div className="settings-workspace" data-mobile-view={isPhone ? (mobileDetail ? "detail" : "list") : "both"}>
        <aside className="settings-sidebar">
          <div className="settings-sidebar-heading">
            <h1>{t("Settings")}</h1>
            <p>{t("Choose a section to edit.")}</p>
          </div>
          <label className="settings-search">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><circle cx="9" cy="9" r="5.5" /><path d="M13.2 13.2 17 17" /></svg>
            <input
              type="search"
              value={sectionSearch}
              placeholder={t("Search settings...")}
              aria-label={t("Search settings...")}
              onChange={event => setSectionSearch(event.target.value)}
            />
          </label>
          <div className="settings-section-list">
            {(() => {
              const searching = Boolean(sectionSearch.trim());
              const list = searching
                ? visibleSections.filter(section => {
                    const query = sectionSearch.trim().toLowerCase();
                    const haystack = [
                      section.title,
                      section.description,
                      t(section.title),
                      t(section.description),
                      SETTINGS_SEARCH_KEYWORDS[section.id] || ""
                    ].join(" ").toLowerCase();
                    return query.split(/\s+/).every(word => haystack.includes(word));
                  })
                : visibleSections;
              const groups: { group: SettingsGroup; sections: SettingsSection[] }[] = [];
              for (const section of list) {
                const last = groups[groups.length - 1];
                if (last && last.group === section.group) last.sections.push(section);
                else groups.push({ group: section.group, sections: [section] });
              }
              return groups.map(({ group, sections }) => {
                // A search shows everything it found; the active section's group never hides it.
                const collapsed = !searching && Boolean(collapsedGroups[group]) && !sections.some(section => section.id === selectedSection.id);
                return (
                  <div key={group} className={collapsed ? "settings-section-group-block is-collapsed" : "settings-section-group-block"}>
                    <button type="button" className="settings-section-group" aria-expanded={!collapsed} onClick={() => toggleGroup(group)}>
                      <span>{t(SETTINGS_GROUP_LABELS[group])}</span>
                      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 8 4 4 4-4" /></svg>
                    </button>
                    {collapsed ? null : sections.map(section => {
                      const unreadCount = section.id === "support-tickets" ? supportUnreadCount : 0;
                      return (
                        <button
                          key={section.id}
                          className={section.id === selectedSection.id ? "settings-section-button active" : "settings-section-button"}
                          type="button"
                          aria-current={section.id === selectedSection.id ? "page" : undefined}
                          onClick={() => selectSection(section.id)}
                        >
                          <SettingsSectionIcon icon={section.icon} />
                          <span>
                            <strong>
                              {t(section.title)}
                              {settingsDirty.dirtySections[section.id] ? (
                                <span className="settings-unsaved-dot" title={t("Unsaved changes")} aria-label={t("Unsaved changes")} />
                              ) : null}
                              {unreadCount > 0 ? <span className="settings-section-badge">{unreadCount}</span> : null}
                            </strong>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              });
            })()}
          </div>
        </aside>

        <section className="settings-content-pane">
          <button
            type="button"
            className="settings-mobile-back"
            onClick={() => setMobileDetail(false)}
          >
            <span aria-hidden="true">‹</span> {t("Settings")}
          </button>
          <div className="settings-mobile-title">{t(selectedSection.title)}</div>
          {error ? (
            <div className="card app-card">
              <CardTitle icon="lock" eyebrow={t("Settings error")} title={t("Could not load workspace settings")} />
              <p className="layout-error">{t(error)}</p>
            </div>
          ) : null}

          {workspace ? (
            <SettingsPageHeader
              eyebrow={t(SETTINGS_GROUP_LABELS[selectedSection.group])}
              title={t(selectedSection.title)}
              subtitle={t(selectedSection.description)}
              status={(() => {
                // Only sections that track a draft have a save state; the rest say nothing.
                if (!(selectedSection.id in settingsDirty.dirtySections)) return null;
                return settingsDirty.dirtySections[selectedSection.id] ? "dirty" : "saved";
              })() as SettingsHeaderStatus}
              statusLabels={{ saved: t("All changes saved"), dirty: t("Unsaved changes"), saving: t("Saving..."), readonly: t("Read-only") }}
              actions={headerActions}
            />
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
            teamDataLoadFailed,
            onRefreshTeamAccess: refreshTeamAccessData,
            supportUnreadCount,
            onSupportUnreadChanged: setSupportUnreadCount,
            storagePercent,
            userEmail: user.email ?? "Signed in",
            onDataImported: refreshSettingsAfterImport,
            integrationIntent,
            integrationCategory,
            integrationProvider,
            onOpenSupport: () => setActiveSection("support-tickets")
          }) : null}

        </section>
      </div>
      </SettingsHeaderActionsContext.Provider>
      </SettingsDirtyProvider>
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
  teamDataLoadFailed,
  onRefreshTeamAccess,
  supportUnreadCount,
  onSupportUnreadChanged,
  storagePercent,
  userEmail,
  onDataImported,
  integrationIntent,
  integrationCategory,
  integrationProvider,
  onOpenSupport
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
  teamDataLoadFailed: boolean;
  onRefreshTeamAccess: () => Promise<TeamAccessData | null>;
  supportUnreadCount: number;
  onSupportUnreadChanged: (count: number) => void;
  storagePercent: number;
  userEmail: string;
  onDataImported: () => Promise<void>;
  /** From ?intent= / ?category= / an aliased ?section=shopify deep link. */
  integrationIntent: string;
  integrationCategory: string;
  integrationProvider: IntegrationManageTarget;
  onOpenSupport: () => void;
}) {
  switch (sectionId) {
    case "profile-security":
      return (
        <AccountSection
          workspace={workspace}
          settings={settings}
          userEmail={userEmail}
          onSaved={onWorkspaceSettingsChange}
          hideWorkspaceIdentity
        />
      );
    case "preferences":
      return <PreferencesSection workspace={workspace} settings={settings} language={language} onSaved={onWorkspaceSettingsChange} />;
    case "branding":
      return <WorkspaceBrandingSection workspace={workspace} settings={settings} onSaved={onWorkspaceSettingsChange} />;
    case "client-domain":
      return <ClientDomainSection workspace={workspace} language={language} />;
    case "workflow":
      return <WorkflowSettingsSection workspace={workspace} language={language} />;
    case "pdf":
      return <PdfExportSettingsSection workspace={workspace} settings={settings} onSaved={onWorkspaceSettingsChange} language={language} />;
    case "quick-reply":
      return <QuickReplySettingsSection workspace={workspace} settings={quickReplySettings} onSaved={onQuickReplySettingsChange} language={language} />;
    case "financial":
      return <FinancialSettingsSection workspace={workspace} settings={settings} language={language} onSaved={onWorkspaceSettingsChange} />;
    case "integrations":
      return (
        <IntegrationsSection
          workspace={workspace}
          language={language}
          intent={integrationIntent}
          category={integrationCategory}
          openProvider={integrationProvider}
          onOpenSupport={onOpenSupport}
        />
      );
    case "safety-uploads":
      return <SafetyUploadsSection workspace={workspace} settings={settings} onSaved={onWorkspaceSettingsChange} language={language} />;
    case "data":
      return <DataManagementSection workspace={workspace} counts={counts} settings={settings} userEmail={userEmail} onImported={onDataImported} language={language} />;
    case "plan-access":
      return <PlanAccessSection workspace={workspace} counts={counts} storagePercent={storagePercent} language={language} />;
    case "team-access":
      return <TeamAccessSection workspace={workspace} teamData={teamData} loadFailed={teamDataLoadFailed} onRefreshTeamAccess={onRefreshTeamAccess} language={language} />;
    case "message-settings":
      return <MessageSettingsSection workspace={workspace} language={language} />;
    case "sms-notifications":
      return <SmsNotificationsSection workspace={workspace} language={language} />;
    case "support-tickets":
      return <SupportTicketsSection workspace={workspace} language={language} supportUnreadCount={supportUnreadCount} onSupportUnreadChanged={onSupportUnreadChanged} />;
    case "about":
      return <AboutSection workspace={workspace} language={language} />;
  }
}

function MessageSettingsSection({ workspace, language = "English" }: { workspace: WorkspaceContext; language?: string }) {
  const t = (text: string) => studioT(text, language);
  const [directMessages, setDirectMessages] = useState(true);
  const [groupConversations, setGroupConversations] = useState(true);
  const [attachments, setAttachments] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  // The client-side role guess said a plain member could edit; the server
  // disagreed and rejected the save. The callable already answers who can
  // manage, so Save now follows that answer — start from the guess only until
  // the first load lands.
  const [canEdit, setCanEdit] = useState(() => canEditWorkspaceSettingsForRole(workspace.role));

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const current = await getMessageWorkspaceSettings(workspace);
      setDirectMessages(current.directMessagesEnabled);
      setGroupConversations(current.groupConversationsEnabled);
      setAttachments(current.attachmentsEnabled);
      setCanEdit(current.canManage);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load message settings.");
    } finally {
      setLoading(false);
    }
  }, [workspace]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  // The three switches start true and are overwritten once the callable answers,
  // so the baseline waits for `loading` to clear.
  const { dirty: messageDirty, markSaved: markMessageSaved } = useUnsavedGuard(
    "message-settings",
    { directMessages, groupConversations, attachments },
    !loading,
    () => handleSave(true)
  );

  async function handleSave(rethrow = false) {
    setSaving(true);
    setStatus("");
    setError("");
    try {
      const next: StudioMessageWorkspaceSettings = {
        directMessagesEnabled: directMessages,
        groupConversationsEnabled: groupConversations,
        attachmentsEnabled: attachments
      };
      await setMessageWorkspaceSettings(workspace, next);
      markMessageSaved();
      setStatus("Message settings saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Message settings could not be saved.");
      if (rethrow) throw saveError;
    } finally {
      setSaving(false);
    }
  }

  const permissionRows = [
    { key: "direct", label: "Direct messages", detail: "Team members can start one-to-one conversations.", overview: "Start 1-to-1 chats", value: directMessages, set: setDirectMessages, icon: "reply" as const },
    { key: "group", label: "Group conversations", detail: "Team members can add people and create group chats.", overview: "Create group chats", value: groupConversations, set: setGroupConversations, icon: "team" as const },
    { key: "files", label: "File & image sharing", detail: "Team members can send images and files in Messages.", overview: "Send files & images", value: attachments, set: setAttachments, icon: "docText" as const }
  ];

  return (
    <div className="settings-card-stack settings-messages-page">
      <div className="settings-two-col settings-messages-columns">
        <section className="card app-card">
          <SettingsCardHead
            title={t("Conversation permissions")}
            subtitle={t("These settings apply to every team member.")}
            aside={<span className="settings-tag">{t("Workspace-wide")}</span>}
          />
          {/* The three switches start ticked and disabled for about a second while
              the real values load. With nothing on screen saying so, that looked
              like the app had decided for you. */}
          {loading ? <p className="settings-field-hint">{t("Loading permissions...")}</p> : null}
          <div className="settings-switch-list">
            {permissionRows.map(row => (
              <label className="settings-switch-line" key={row.key}>
                <span className="settings-card-head-icon" aria-hidden="true"><CardIconGlyph icon={row.icon} /></span>
                <span className="settings-switch-line-copy">
                  <strong>{t(row.label)}</strong>
                  <small>{t(row.detail)}</small>
                  {row.key === "files" ? <a className="settings-inline-link" href="/settings?section=safety-uploads">{t("View upload rules")} ↗</a> : null}
                </span>
                <input
                  type="checkbox"
                  className="settings-switch"
                  checked={row.value}
                  disabled={!canEdit || saving || loading}
                  onChange={event => row.set(event.target.checked)}
                />
              </label>
            ))}
          </div>
        </section>

        <section className="card app-card">
          <SettingsCardHead title={t("Permissions overview")} />
          <div className="settings-overview-rows">
            {permissionRows.map(row => (
              <div className="settings-overview-row" key={row.key}>
                <span>{t(row.overview)}</span>
                <span className={row.value ? "settings-dot-status" : "settings-dot-status is-offline"}>{row.value ? t("Allowed") : t("Not allowed")}</span>
              </div>
            ))}
          </div>
          <p className="settings-notice">
            {t("File types and upload limits are managed in Safety & Uploads.")}{" "}
            <a className="settings-inline-link" href="/settings?section=safety-uploads">{t("Open Safety & Uploads")} ↗</a>
          </p>
        </section>
      </div>

      <div className="settings-save-row settings-save-bar">
        <button
          className="button secondary"
          type="button"
          disabled={loading}
          onClick={() => {
            // Reload silently threw away unsaved switches; now it says so first.
            if (messageDirty && !window.confirm(t("Reload will discard your unsaved changes here. Continue?"))) return;
            void loadSettings();
          }}
        >
          {t("Reload saved settings")}
        </button>
        <p className="settings-save-bar-note">{t("Reload discards unsaved edits. Changes apply to everyone.")}</p>
        {!canEdit ? <p className="settings-field-hint">{t("Only workspace owners or admins can change these settings.")}</p> : null}
        {status ? <p className="success-copy">{studioT(status, language)}</p> : null}
        {error ? <p className="layout-error">{t(error)}</p> : null}
        <button className="button" type="button" disabled={!canEdit || saving || loading || !messageDirty} onClick={() => { void handleSave(); }}>
          {saving ? t("Saving...") : t("Save changes")}
        </button>
      </div>
    </div>
  );
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

function PreferencesSection({
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
  // Theme and language are personal to the signed-in user; the workspace values
  // are only the fallback until the personal record has been read. One Save
  // writes whichever of the two changed. Auto-lock is browser-local and saves
  // itself on change, as before.
  const canEditLanguage = workspaceAccessAllows(workspace.memberAccess, "settingsGeneral");
  const [baseline, setBaseline] = useState<{ appTheme: string; selectedLanguage: string } | null>(null);
  const [appTheme, setAppTheme] = useState(settings?.appTheme ?? "System");
  const [selectedLanguage, setSelectedLanguage] = useState(settings?.selectedLanguage ?? language ?? "English");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [autoLockMinutes, setAutoLockMinutesState] = useState(0);
  const previewLanguage = selectedLanguage || language || "English";
  const t = (text: string) => studioT(text, previewLanguage);

  useEffect(() => {
    let cancelled = false;
    const base = { appTheme: settings?.appTheme ?? "System", selectedLanguage: settings?.selectedLanguage ?? language ?? "English" };
    setBaseline(null);
    setAppTheme(base.appTheme);
    setSelectedLanguage(base.selectedLanguage);
    setStatus("");
    setError("");
    getPersonalInterfaceSettings(workspace).then(personal => {
      if (cancelled) return;
      const next = { appTheme: personal.appTheme || base.appTheme, selectedLanguage: personal.selectedLanguage || base.selectedLanguage };
      setAppTheme(next.appTheme);
      setSelectedLanguage(next.selectedLanguage);
      setBaseline(next);
    }).catch(() => {
      if (!cancelled) setBaseline(base);
    });
    return () => {
      cancelled = true;
    };
  }, [language, settings, workspace.id]);

  useEffect(() => {
    setAutoLockMinutesState(getAutoLockMinutes());
  }, []);

  const { dirty, markSaved } = useUnsavedGuard(
    "preferences",
    { appTheme, selectedLanguage },
    baseline !== null && Boolean(settings),
    () => handleSave(true)
  );

  async function handleSave(rethrow = false) {
    if (!settings || !baseline) return;
    setSaving(true);
    setStatus("");
    setError("");
    try {
      let savedSettings = settings;
      let savedTheme = baseline.appTheme;
      let savedLanguage = baseline.selectedLanguage;
      if (appTheme !== baseline.appTheme) {
        const result = await savePersonalInterfaceSettings(workspace, { appTheme });
        savedTheme = result.settings?.appTheme ?? appTheme;
        savedSettings = { ...savedSettings, appTheme: savedTheme };
      }
      if (selectedLanguage !== baseline.selectedLanguage) {
        const result = await savePersonalInterfaceSettings(workspace, { selectedLanguage });
        savedLanguage = result.settings?.selectedLanguage ?? selectedLanguage;
        savedSettings = { ...savedSettings, selectedLanguage: savedLanguage };
      }
      setBaseline({ appTheme: savedTheme, selectedLanguage: savedLanguage });
      setAppTheme(savedTheme);
      setSelectedLanguage(savedLanguage);
      markSaved();
      onSaved(savedSettings);
      setStatus(studioT("Preferences saved.", savedLanguage));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("Preferences could not be saved."));
      if (rethrow) throw saveError;
    } finally {
      setSaving(false);
    }
  }

  const autoLockOptions: { minutes: number; label: string }[] = [
    { minutes: 0, label: "Off" },
    { minutes: 1, label: "1 min" },
    { minutes: 5, label: "5 min" },
    { minutes: 15, label: "15 min" },
    { minutes: 60, label: "1 hour" }
  ];

  return (
    <div className="settings-card-stack settings-preferences-page">
      <section className="card app-card">
        <SettingsCardHead
          icon={<CardIconGlyph icon="paintbrush" />}
          title={t("Appearance")}
          subtitle={t("Choose a theme for your account across every device.")}
        />
        <div className="settings-theme-grid" role="radiogroup" aria-label={t("Theme")}>
          {(["System", "Light", "Dark"] as const).map(option => {
            const selected = appTheme === option;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={selected}
                className={selected ? "settings-theme-card is-selected" : "settings-theme-card"}
                data-theme-preview={option.toLowerCase()}
                disabled={saving || !settings}
                onClick={() => {
                  setAppTheme(option);
                  setStatus("");
                  setError("");
                }}
              >
                <span className="settings-theme-preview" aria-hidden="true">
                  <span className="settings-theme-preview-pane is-light"><i /><i /><i /></span>
                  <span className="settings-theme-preview-pane is-dark"><i /><i /><i /></span>
                </span>
                <span className="settings-theme-label"><span className="settings-theme-radio" aria-hidden="true" />{t(option)}</span>
                {selected ? <span className="settings-theme-check" aria-hidden="true">✓</span> : null}
              </button>
            );
          })}
        </div>
        <p className="settings-field-hint">{t("Synced across your devices.")}</p>
      </section>

      <section className="card app-card">
        <SettingsCardHead
          icon={<CardIconGlyph icon="language" />}
          title={t("Language & region")}
          subtitle={t("Choose the language used across NivaDesk.")}
          aside={!canEditLanguage ? <span className="settings-tag">{t("Read-only")}</span> : null}
        />
        <label className="settings-field">
          <span className="settings-field-label">{t("Language")}</span>
          <select
            className="input"
            value={selectedLanguage}
            disabled={!canEditLanguage || saving || !settings}
            onChange={event => {
              setSelectedLanguage(event.target.value);
              setStatus("");
              setError("");
            }}
          >
            {SUPPORTED_STUDIO_LANGUAGES.map(option => (
              <option value={option} key={option}>{option}</option>
            ))}
          </select>
        </label>
        <p className="settings-field-hint">{t("Changes apply immediately after saving.")}</p>
        {!canEditLanguage ? <p className="settings-field-hint">{t("Your current workspace role cannot edit Language & Labels.")}</p> : null}
      </section>

      <section className="card app-card">
        <SettingsCardHead
          icon={<CardIconGlyph icon="lock" />}
          title={t("Auto-lock")}
          subtitle={t("Require sign-in again after a period of inactivity.")}
          aside={<span className="settings-tag">{t("This browser")}</span>}
        />
        <div className="settings-segmented" role="group" aria-label={t("Auto-lock")}>
          {autoLockOptions.map(option => (
            <button
              key={option.minutes}
              type="button"
              className={autoLockMinutes === option.minutes ? "active" : ""}
              aria-pressed={autoLockMinutes === option.minutes}
              onClick={() => {
                setAutoLockMinutesState(option.minutes);
                setAutoLockMinutes(option.minutes);
              }}
            >
              {t(option.label)}
            </button>
          ))}
        </div>
        {/* Theme and language above wait for Save; this one writes on change, so say so. */}
        <p className="settings-field-hint">{t("Saved automatically on this browser.")}</p>
        <p className="settings-field-hint">{t("Lock NivaDesk after a period of inactivity, then unlock with your password or your sign-in provider (Google or Apple). This applies to this browser only.")}</p>
      </section>

      <div className="settings-save-row">
        {status ? <p className="success-copy">{status}</p> : null}
        {error ? <p className="layout-error">{t(error)}</p> : null}
        <button className="button" type="button" disabled={saving || !dirty || !settings} onClick={() => { void handleSave(); }}>
          {saving ? t("Saving...") : t("Save changes")}
        </button>
      </div>
    </div>
  );
}

function WorkspaceBrandingSection({
  workspace,
  settings,
  onSaved
}: {
  workspace: WorkspaceContext;
  settings: WorkspaceSettingsOverview | null;
  onSaved: (settings: WorkspaceSettingsOverview) => void;
}) {
  const { user } = useAuth();
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const [companyName, setCompanyName] = useState(workspace.name);
  const [appSubtitle, setAppSubtitle] = useState(settings?.appSubtitle ?? "Bespoke Hand-Painted Dials");
  const [savingIdentity, setSavingIdentity] = useState(false);
  const [identityStatus, setIdentityStatus] = useState("");
  const [identityError, setIdentityError] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [pendingLogoFile, setPendingLogoFile] = useState<File | null>(null);
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [logoStatus, setLogoStatus] = useState("");
  const [logoError, setLogoError] = useState("");
  const canEditBranding = canEditWorkspaceSettingsForRole(workspace.role);
  const canEditCompanyName = Boolean(user && (workspace.ownerUid === user.uid || workspace.role === "owner"));
  const canEditLogo = canManageWorkspaceLogoForRole(workspace.role);
  const canUploadLogo = Boolean(workspace.entitlements.features.workspace_logo_upload);
  const requirePolicy = settings?.uploadSafetyRequirePolicyAcceptance ?? true;
  const maxSizeMB = settings?.uploadSafetyMaxFileSizeMB ?? 10;
  const logoUrl = settings?.appLogoUrl?.trim() ?? "";
  const language = settings?.selectedLanguage ?? "English";
  const t = (text: string) => studioT(text, language);

  useEffect(() => {
    setCompanyName(workspace.name);
  }, [workspace.name]);

  useEffect(() => {
    setAppSubtitle(settings?.appSubtitle ?? "Bespoke Hand-Painted Dials");
    setIdentityStatus("");
    setIdentityError("");
  }, [settings?.appSubtitle]);

  useEffect(() => {
    setPolicyAccepted(window.localStorage.getItem(uploadSafetyAcceptanceKey(workspace.id)) === "accepted");
  }, [workspace.id]);

  // Only the two fields the Save button writes. The logo upload is its own
  // action and the policy checkbox writes to localStorage on the spot, so
  // neither is an unsaved edit.
  const { dirty: brandingDirty, markSaved: markBrandingSaved } = useUnsavedGuard(
    "branding",
    { companyName, appSubtitle },
    Boolean(settings),
    () => handleSaveIdentity(true)
  );

  async function handleSaveIdentity(rethrow = false) {
    if (!settings) return;
    setSavingIdentity(true);
    setIdentityStatus("");
    setIdentityError("");
    try {
      // Workspace name routes through the shared profile saver (the member's own
      // display name is passed unchanged); the subtitle routes through branding.
      if (canEditCompanyName && companyName.trim() !== workspace.name) {
        await saveAccountProfile(workspace, { displayName: workspace.currentMemberDisplayName, companyName });
      }
      let nextSettings = settings;
      if (canEditBranding && appSubtitle !== settings.appSubtitle) {
        const result = await saveThemeBrandingSettings(workspace, { appSubtitle });
        nextSettings = { ...settings, ...(result.settings ?? { appSubtitle }) };
        setAppSubtitle(nextSettings.appSubtitle);
      }
      onSaved(nextSettings);
      markBrandingSaved();
      setIdentityStatus(t("Workspace branding saved."));
    } catch (saveError) {
      setIdentityError(saveError instanceof Error ? saveError.message : t("Workspace branding could not be saved."));
      if (rethrow) throw saveError;
    } finally {
      setSavingIdentity(false);
    }
  }

  async function saveLogoResult(result: { message?: string; settings?: { appLogoUrl?: string } }) {
    if (!settings) return;
    const nextSettings = { ...settings, ...(result.settings ?? {}) };
    onSaved(nextSettings);
    setLogoStatus(result.message || t("Workspace logo saved."));
  }

  async function uploadLogo(file: File, acceptedPolicy: boolean) {
    if (!settings || !user) return;
    setUploadingLogo(true);
    setLogoStatus("");
    setLogoError("");
    try {
      const result = await uploadWorkspaceLogo({
        workspace,
        file,
        user: { uid: user.uid, email: user.email, displayName: user.displayName },
        policyAccepted: acceptedPolicy,
        maxSizeMB
      });
      await saveLogoResult(result);
      setPendingLogoFile(null);
      if (logoInputRef.current) logoInputRef.current.value = "";
    } catch (uploadError) {
      setLogoError(uploadError instanceof Error ? uploadError.message : t("Workspace logo could not be uploaded."));
    } finally {
      setUploadingLogo(false);
    }
  }

  function handleLogoFile(file: File | undefined) {
    if (!file) return;
    if (!settings) {
      setLogoError(t("Workspace settings are still loading."));
      return;
    }
    if (!canEditLogo) {
      setLogoError(t("Your workspace role cannot edit Workspace Logo."));
      return;
    }
    if (requirePolicy && !policyAccepted) {
      setPendingLogoFile(file);
      setLogoStatus("");
      setLogoError("");
      return;
    }
    void uploadLogo(file, policyAccepted || !requirePolicy);
  }

  function openLogoPicker() {
    setLogoStatus("");
    setLogoError("");
    if (!settings) {
      setLogoError(t("Workspace settings are still loading."));
      return;
    }
    if (!canEditLogo) {
      setLogoError(t("Your workspace role cannot edit Workspace Logo."));
      return;
    }
    logoInputRef.current?.click();
  }

  async function handleAcceptPolicyAndUpload() {
    if (!pendingLogoFile) return;
    window.localStorage.setItem(uploadSafetyAcceptanceKey(workspace.id), "accepted");
    window.localStorage.setItem(uploadSafetyAcceptanceAtKey(workspace.id), String(Date.now()));
    setPolicyAccepted(true);
    const file = pendingLogoFile;
    setPendingLogoFile(null);
    await uploadLogo(file, true);
  }

  async function handleRemoveLogo() {
    if (!settings) return;
    setUploadingLogo(true);
    setLogoStatus("");
    setLogoError("");
    try {
      const result = await saveWorkspaceLogoUrl(workspace, "");
      await saveLogoResult(result);
    } catch (removeError) {
      setLogoError(removeError instanceof Error ? removeError.message : t("Workspace logo could not be removed."));
    } finally {
      setUploadingLogo(false);
    }
  }

  const previewInitials = (workspace.currentMemberDisplayName || "NivaDesk")
    .split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "N";
  const previewName = companyName.trim() || workspace.name;

  return (
    <div className="settings-card-stack settings-branding-page">
      <section className="card app-card">
        <SettingsCardHead title={t("Workspace identity")} subtitle={t("These details are shared by everyone in this workspace and appear in the app header.")} />
        <div className="settings-two-col settings-branding-identity">
          <div className="settings-field-stack">
            <label className="settings-field">
              <span className="settings-field-label">{t("Company / Studio Name")}</span>
              <input
                className="input"
                value={companyName}
                disabled={!canEditCompanyName || savingIdentity || !settings}
                placeholder={t("My Studio")}
                onChange={event => {
                  setCompanyName(event.target.value);
                  setIdentityStatus("");
                  setIdentityError("");
                }}
              />
              {!canEditCompanyName ? <span className="settings-field-hint">{t("Company / Studio Name can only be changed by the workspace owner.")}</span> : null}
            </label>
            <label className="settings-field">
              <span className="settings-field-label">{t("Brand Subtitle")}</span>
              <input
                className="input"
                value={appSubtitle}
                disabled={!canEditBranding || savingIdentity || !settings}
                placeholder="Bespoke Hand-Painted Dials"
                onChange={event => {
                  setAppSubtitle(event.target.value);
                  setIdentityStatus("");
                  setIdentityError("");
                }}
              />
              <span className="settings-field-hint">{t("Shared with everyone in this workspace.")}</span>
            </label>
            <div className="settings-action-row">
              <button
                className="button"
                type="button"
                disabled={savingIdentity || !brandingDirty || !settings || (!canEditCompanyName && !canEditBranding)}
                onClick={() => { void handleSaveIdentity(); }}
              >
                {savingIdentity ? t("Saving...") : t("Save changes")}
              </button>
            </div>
            {identityStatus ? <p className="success-copy">{studioT(identityStatus, language)}</p> : null}
            {identityError ? <p className="layout-error">{t(identityError)}</p> : null}
          </div>
          {/* What the header will look like, drawn from the unsaved drafts. */}
          <div className="settings-branding-preview">
            <div className="settings-branding-preview-head">
              <span className="settings-field-label">{t("Header preview")}</span>
              <span className="settings-tag">{t("Live preview")}</span>
            </div>
            <div className="settings-branding-header-mock" aria-hidden="true">
              <span className="settings-branding-mock-menu"><i /><i /><i /></span>
              {logoUrl ? <img src={logoUrl} alt="" /> : <span className="settings-branding-mock-mark">{previewName.trim().charAt(0).toUpperCase() || "N"}</span>}
              <span className="settings-branding-mock-name">{previewName}</span>
              {appSubtitle.trim() ? <span className="settings-branding-mock-divider" /> : null}
              {appSubtitle.trim() ? <span className="settings-branding-mock-subtitle">{appSubtitle}</span> : null}
              <span className="settings-branding-mock-actions"><i /><i /><b>{previewInitials}</b></span>
            </div>
          </div>
        </div>
      </section>

      <section className="card app-card">
        <SettingsCardHead title={t("Workspace Logo")} subtitle={t("Used in the app header and shared workspace surfaces.")} />
        <div className="settings-logo-stage">
          {logoUrl ? (
            <img src={logoUrl} alt={`${workspace.name} logo`} />
          ) : (
            <span className="workspace-studio-fallback workspace-studio-fallback-preview" aria-label={t("Studio")}>
              <span className="workspace-studio-mark" aria-hidden="true" />
              <span className="workspace-studio-text">{t("Studio")}</span>
            </span>
          )}
        </div>
        <div className="settings-logo-meta">
          <span className={logoUrl ? "settings-status-pill is-saved" : "settings-status-pill is-readonly"}>
            <span className="settings-status-pill-mark" aria-hidden="true">{logoUrl ? "✓" : "○"}</span>
            {logoUrl ? t("Workspace logo is set") : t("No logo uploaded yet")}
          </span>
          {/* The picker accepted a file and then rejected it after the fact,
              with nothing on screen saying what it would accept. */}
          <span className="settings-field-hint">
            {t("JPG, PNG, HEIC or WEBP. Wide works best — around 512 × 128 pixels.")}
            {" "}
            {t("Maximum")} {maxSizeMB} MB.
          </span>
        </div>
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
            {uploadingLogo ? t("Uploading...") : logoUrl ? t("Replace Logo") : t("Upload Logo")}
          </button>
          {logoUrl ? (
            <button
              className="button danger secondary"
              type="button"
              disabled={!canEditLogo || uploadingLogo || !settings}
              onClick={handleRemoveLogo}
            >
              {t("Remove Logo")}
            </button>
          ) : null}
        </div>
        <p className="settings-field-hint">{t("Logo changes save immediately.")}</p>
        {!canUploadLogo ? <p className="settings-field-hint">{t("Workspace logo upload is checked when you choose a file. Monthly Pro or Team is required.")}</p> : null}
        {!canEditLogo ? <p className="settings-field-hint">{t("Your current workspace role cannot edit Workspace Logo.")}</p> : null}
        {logoStatus ? <p className="success-copy">{studioT(logoStatus, language)}</p> : null}
        {logoError ? <p className="layout-error">{t(logoError)}</p> : null}
        {pendingLogoFile ? (
          <div className="workspace-logo-policy">
            <strong>{t("Upload Policy")}</strong>
            <p>{t("Only upload legal, safe and work-related images that belong in this workspace.")}</p>
            <div className="workspace-logo-actions">
              <button className="button secondary" type="button" disabled={uploadingLogo} onClick={() => setPendingLogoFile(null)}>{t("Cancel")}</button>
              <button className="button" type="button" disabled={uploadingLogo} onClick={handleAcceptPolicyAndUpload}>{t("I Agree and Upload")}</button>
            </div>
          </div>
        ) : null}
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

// Which trades a label belongs to, read straight out of the templates below —
// no separate list to keep in step. A workspace ends up with Vehicle Repair
// fields under a Photography business type by trying templates one after
// another; nothing ever said so.
function workflowLabelsOfTemplate(template: WorkflowTemplate): string[] {
  return [...template.customFields, ...template.customSteps, ...template.customToggles, ...template.inventoryLabels]
    .map(label => label.trim().toLowerCase())
    .filter(Boolean);
}

function workflowForeignTrades(settings: BlockHeadingSettings | null): string[] {
  if (!settings) return [];
  const own = new Set(
    workflowLabelsOfTemplate(WORKFLOW_STANDARD_TEMPLATES[settings.businessType] ?? DEFAULT_WORKFLOW_TEMPLATE)
  );
  const present = [
    ...(settings.customFields ?? []),
    ...(settings.customSteps ?? []),
    ...(settings.customToggles ?? []),
    ...(settings.materialsDefaultChecks ?? [])
  ]
    .map(item => String(item?.title ?? "").trim().toLowerCase())
    .filter(label => label && !own.has(label));
  if (present.length === 0) return [];

  const trades = new Set<string>();
  for (const [type, template] of Object.entries(WORKFLOW_STANDARD_TEMPLATES)) {
    if (type === settings.businessType) continue;
    const labels = new Set(workflowLabelsOfTemplate(template));
    // Two shared labels, so a single generic word ("Material 1") is not enough
    // to accuse a workspace of borrowing from another trade.
    if (present.filter(label => labels.has(label)).length >= 2) trades.add(type);
  }
  return [...trades];
}

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

function WorkflowSettingsSection({ workspace, language }: { workspace: WorkspaceContext; language: string }) {
  const [blockSettings, setBlockSettings] = useState<BlockHeadingSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const canEditRole = canEditWorkspaceSettingsForRole(workspace.role);
  const canEdit = canEditRole && workspace.entitlements.features.card_customization;
  const t = (text: string) => studioT(text, language);

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
    // Deleting a production step ripples into every existing order's status
    // card and can re-map the summary rows — that one asks first.
    if (key === "customSteps") {
      const item = blockSettings[key].find(entry => entry.id === id);
      setPendingStepRemoval(item ? { id, title: item.title } : null);
      return;
    }
    updateList(key, blockSettings[key].filter(item => item.id !== id));
  }

  // The order of these rows is the order they take on every order card, so the
  // list can be re-ordered here; it is the same array the save already writes.
  function moveListItem(key: WorkflowHeadingListKey, id: string, direction: -1 | 1) {
    if (!blockSettings) return;
    const items = [...blockSettings[key]];
    const index = items.findIndex(item => item.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];
    updateList(key, items);
  }

  function confirmStepRemoval() {
    if (!blockSettings || !pendingStepRemoval) return;
    updateList("customSteps", blockSettings.customSteps.filter(item => item.id !== pendingStepRemoval.id));
    setPendingStepRemoval(null);
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

  // Two controls here persist on their own (business type, standard template),
  // so re-baselining belongs in the one place all three paths pass through.
  const { dirty: workflowDirty, markSaved: markWorkflowSaved } = useUnsavedGuard(
    "workflow",
    blockSettings,
    Boolean(blockSettings) && !loading,
    () => handleSave(true)
  );

  async function persistWorkflowSettings(settingsToSave: BlockHeadingSettings, successMessage: string, rethrow = false) {
    setSaving(true);
    setStatus("");
    setError("");
    try {
      await saveWorkspaceBlockHeadings(workspace, "status", settingsToSave);
      await saveWorkspaceBlockHeadings(workspace, "customer", settingsToSave);
      const saved = await saveWorkspaceBlockHeadings(workspace, "materials", settingsToSave);
      setBlockSettings(workflowSettingsWithMaterialDefaults(saved));
      markWorkflowSaved();
      setStatus(successMessage);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Workflow settings could not be saved.");
      if (rethrow) throw saveError;
    } finally {
      setSaving(false);
    }
  }

  function selectBusinessType(nextBusinessType: string) {
    if (!blockSettings) return;
    // Match the onboarding screen: changing the industry refreshes the
    // description to that industry's seed, unless the owner has hand-written a
    // custom description (i.e. the current text is not one of the known seeds).
    const current = blockSettings.businessDescriptionPrompt;
    const keepCustom = current.trim().length > 0 && !isWorkspaceOnboardingPromptSeed(current);
    const nextSettings = {
      ...blockSettings,
      businessType: nextBusinessType,
      businessDescriptionPrompt: keepCustom
        ? current
        : workspaceOnboardingPromptSeed(nextBusinessType, language)
    };
    setBlockSettings(nextSettings);
    void persistWorkflowSettings(nextSettings, "Business type saved.");
  }

  // The old confirm listed the categories it would overwrite but never what it
  // would put there, and never said the labels are shared with every existing
  // order's cards.
  function applyStandardTemplate() {
    if (!blockSettings) return;
    setPendingTemplate(WORKFLOW_STANDARD_TEMPLATES[blockSettings.businessType] ?? DEFAULT_WORKFLOW_TEMPLATE);
  }

  function commitStandardTemplate() {
    if (!blockSettings || !pendingTemplate) return;
    const template = pendingTemplate;
    setPendingTemplate(null);
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

  function workflowDuplicateTitles(settings: BlockHeadingSettings): string[] {
    const lists: WorkflowHeadingListKey[] = ["customSteps", "customToggles", "materialsDefaultChecks", "materialsToggles"];
    const duplicates: string[] = [];
    for (const key of lists) {
      const seen = new Map<string, number>();
      for (const item of settings[key] || []) {
        const normalized = item.title.trim().toLowerCase();
        if (!normalized) continue;
        seen.set(normalized, (seen.get(normalized) || 0) + 1);
      }
      for (const [name, count] of seen) {
        if (count > 1) duplicates.push(name);
      }
    }
    return duplicates;
  }

  async function handleSave(rethrow = false) {
    if (!blockSettings) return;
    // Two same-named checks are not cosmetic: order cards fall back to
    // title-keyed storage, so they can read and write each other's value.
    const duplicates = workflowDuplicateTitles(blockSettings);
    if (duplicates.length > 0) {
      setError(`${t("Two rows share the same name. Rename one — same-named rows can overwrite each other on order cards.")} (${duplicates.join(", ")})`);
      if (rethrow) throw new Error("duplicate workflow titles");
      return;
    }
    await persistWorkflowSettings(blockSettings, "Workflow settings saved.", rethrow);
  }

  const foreignTrades = useMemo(() => workflowForeignTrades(blockSettings), [blockSettings]);
  const [pendingTemplate, setPendingTemplate] = useState<WorkflowTemplate | null>(null);
  const [pendingStepRemoval, setPendingStepRemoval] = useState<{ id: string; title: string } | null>(null);

  function renderHeadingList(key: WorkflowHeadingListKey, emptyTitle: string, addTitle: string, placeholder: string, addLabel: string, emptyLabel: string) {
    const items = blockSettings?.[key] ?? [];
    return (
      <div className="settings-heading-list">
        <div className="settings-heading-list-head">
          <strong>{t(emptyTitle)}</strong>
          <button className="settings-link-button" type="button" disabled={!canEdit || saving || !blockSettings} onClick={() => addListItem(key, addTitle)}>
            + {t(addLabel)}
          </button>
        </div>
        {items.length === 0 ? (
          <p className="settings-empty-line">{t(emptyLabel)}</p>
        ) : null}
        {items.map((item, index) => (
          <div className="settings-heading-row" key={item.id}>
            <span className="settings-heading-row-index" aria-hidden="true" title={t("Row number — the order these appear in on order cards.")}>{index + 1}</span>
            <span className="settings-heading-row-move">
              <button type="button" className="settings-icon-button" disabled={!canEdit || saving || index === 0} onClick={() => moveListItem(key, item.id, -1)} aria-label={t("Move up")} title={t("Move up")}>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5-5 5 5" /></svg>
              </button>
              <button type="button" className="settings-icon-button" disabled={!canEdit || saving || index === items.length - 1} onClick={() => moveListItem(key, item.id, 1)} aria-label={t("Move down")} title={t("Move down")}>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 8 5 5 5-5" /></svg>
              </button>
            </span>
            <input
              className="input"
              value={item.title}
              disabled={!canEdit || saving}
              placeholder={placeholder}
              onChange={event => renameListItem(key, item.id, event.target.value)}
            />
            <button
              className="settings-icon-button danger"
              type="button"
              disabled={!canEdit || saving}
              onClick={() => removeListItem(key, item.id)}
              aria-label={t("Remove")}
              title={t("Remove this row. Existing orders keep their recorded values but stop showing this heading.")}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
            </button>
          </div>
        ))}
      </div>
    );
  }

  if (loading) {
    return (
      <section className="card app-card">
        <CardTitle icon="checklist" eyebrow={t("Workflow Steps")} title={t("Loading workflow settings")} />
        <p className="muted-copy">{t("Loading your workspace's shared workflow headings...")}</p>
      </section>
    );
  }

  if (!blockSettings) {
    return <PlaceholderSection t={t} title={t("Workflow Steps")} detail={error || t("Workflow settings could not be loaded yet.")} />;
  }

  const steps = workflowStepOptions(blockSettings);
  const activeStatuses = Array.isArray(blockSettings.activeStatuses)
    ? blockSettings.activeStatuses
    : DEFAULT_ACTIVE_STATUS_OPTIONS;
  const statusOptions = Array.from(new Set([...STATUS_OPTION_POOL, ...activeStatuses].map(item => item.trim()).filter(Boolean)));

  const templatePreview = WORKFLOW_STANDARD_TEMPLATES[blockSettings.businessType] ?? DEFAULT_WORKFLOW_TEMPLATE;
  const jumpTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="settings-card-stack settings-workflow-page">
      {pendingStepRemoval ? (
        <SettingsDialog
          eyebrow={t("Workflow Steps")}
          title={`${t("Delete step")} "${pendingStepRemoval.title}"?`}
          onDismiss={() => setPendingStepRemoval(null)}
          actions={[
            { label: t("Delete step"), tone: "danger" as const, onClick: confirmStepRemoval },
            { label: t("Keep step"), tone: "secondary" as const, onClick: () => setPendingStepRemoval(null) }
          ]}
        >
          <p>{t("The step disappears from every existing order's status card. Values already recorded for it stay on the orders but stop being displayed.")}</p>
          <p>{t("Any Order Summary row pointing at it falls back to the first remaining step automatically — deleting the first step also re-maps which status the summary rows show.")}</p>
        </SettingsDialog>
      ) : null}
      {pendingTemplate ? (
        <SettingsDialog
          wide
          eyebrow={t("Apply Standard Template")}
          title={t("Replace this workflow with the standard template?")}
          onDismiss={() => setPendingTemplate(null)}
          actions={[
            { label: t("Replace"), tone: "danger" as const, onClick: commitStandardTemplate },
            { label: t("Keep custom fields"), tone: "secondary" as const, onClick: () => setPendingTemplate(null) }
          ]}
        >
          <p>{t("Your current custom fields, production steps, Yes / No checks and material labels are replaced by the ones below. Anything you renamed is lost.")}</p>
          <div className="settings-impact-grid">
            <span>{t("Custom fields")}</span>
            <strong>{pendingTemplate.customFields.join(", ") || "—"}</strong>
            <span>{t("Production Steps")}</span>
            <strong>{pendingTemplate.customSteps.join(", ") || "—"}</strong>
            <span>{t("Yes / No checks")}</span>
            <strong>{pendingTemplate.customToggles.join(", ") || "—"}</strong>
            <span>{t("Material checks")}</span>
            <strong>{pendingTemplate.inventoryLabels.join(", ") || "—"}</strong>
          </div>
          <p>{t("These labels are shared, so existing projects show the new headings too. Values already recorded under an old heading stay on the project but stop being displayed.")}</p>
        </SettingsDialog>
      ) : null}
      {!canEdit ? (
        <p className="settings-notice is-caution">
          <strong>{canEditRole ? t("Workflow customization starts with NivaDesk Starter") : t("Workflow settings are read-only")}</strong>
          {" "}
          {canEditRole ? t("Demo / Free workspaces can view these settings, but saving workflow block changes is available from NivaDesk Starter.") : t("Your current workspace role cannot edit workflow settings.")}
        </p>
      ) : null}

      <nav className="settings-anchor-tabs" aria-label={t("Workflow Steps")}>
        {[
          ["workflow-template", "Template"],
          ["workflow-status-menus", "Status menus"],
          ["workflow-checks", "Checks"],
          ["workflow-materials", "Materials"],
          ["workflow-summary", "Order summary"]
        ].map(([id, label]) => (
          <button key={id} type="button" onClick={() => jumpTo(id)}>{t(label)}</button>
        ))}
      </nav>

      <section className="card app-card" id="workflow-template">
        <SettingsCardHead title={t("Standard workflow template")} />
        <div className="settings-two-col">
          <div className="settings-field-stack">
            <label className="settings-field">
              <span className="settings-field-label">{t("Industry")}</span>
              <select
                className="input"
                value={blockSettings.businessType}
                disabled={!canEdit || saving}
                onChange={event => selectBusinessType(event.target.value)}
              >
                {BUSINESS_TYPES.map(type => <option value={type} key={type}>{studioT(type, language)}</option>)}
              </select>
            </label>
            <label className="settings-field">
              <span className="settings-field-label">{t("Business description")}</span>
              <textarea
                className="input"
                value={blockSettings.businessDescriptionPrompt}
                disabled={!canEdit || saving}
                rows={5}
                placeholder={t("Describe what the business does and which workflow steps matter.")}
                onChange={event => updateSetting("businessDescriptionPrompt", event.target.value)}
              />
            </label>
            <div className="settings-action-row">
              <button className="button secondary" type="button" disabled={!canEdit || saving} onClick={applyStandardTemplate}>
                {t("Apply template")}
              </button>
            </div>
            <p className="settings-field-hint">{t("Applying a template updates shared headings for the whole workspace.")}</p>
          </div>
          <div className="settings-template-preview">
            <p className="settings-field-label">
              {t("Template preview")} <span className="settings-field-hint">({t("not saved workflow data")})</span>
            </p>
            <ol className="settings-template-flow" aria-label={t("Production Steps")}>
              {templatePreview.customSteps.map((step, index) => (
                <li key={step}>
                  <span className="settings-template-flow-dot">{index + 1}</span>
                  <span className="settings-template-flow-label">{studioT(step, language)}</span>
                </li>
              ))}
            </ol>
            <p className="settings-field-hint">
              {t("Yes / No checks")}: {templatePreview.customToggles.map(item => studioT(item, language)).join(", ") || "—"}
              {" · "}
              {t("Material checks")}: {templatePreview.inventoryLabels.map(item => studioT(item, language)).join(", ") || "—"}
            </p>
          </div>
        </div>
        {foreignTrades.length > 0 ? (
          <p className="settings-notice is-caution">
            <strong>{t("This workflow mixes fields from more than one trade")}</strong>
            {" "}
            {t("Fields matching these industry templates are also in use:")} {foreignTrades.map(type => studioT(type, language)).join(", ")}.
            {" "}
            {t("That is fine if you built it deliberately. Applying the standard template replaces them — on existing orders too, since these headings are shared.")}
          </p>
        ) : null}
      </section>

      <section className="card app-card" id="workflow-status-menus">
        <SettingsCardHead title={t("Status menu options")} />
        <button className="settings-disclosure" type="button" aria-expanded={statusMenuOpen} onClick={() => setStatusMenuOpen(open => !open)}>
          <span className="settings-disclosure-chevron" aria-hidden="true">{statusMenuOpen ? "⌄" : "›"}</span>
          <span className="settings-disclosure-copy">
            <strong>{t("Order status dropdowns")}</strong>
            <small>{activeStatuses.length} {t("active statuses")}</small>
          </span>
          <span className="settings-tag">{statusMenuOpen ? t("Collapse") : t("Expand")}</span>
        </button>
        {statusMenuOpen ? (
          <div className="settings-status-option-grid">
            {statusOptions.map(option => {
              const checked = activeStatuses.some(active => active.toLowerCase() === option.toLowerCase());
              return (
                <label className={checked ? "settings-status-option is-active" : "settings-status-option"} key={option}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!canEdit || saving}
                    onChange={event => toggleActiveStatus(option, event.target.checked)}
                  />
                  <span>{option}</span>
                </label>
              );
            })}
          </div>
        ) : null}
        <p className="settings-field-hint">{t("Controls the status choices used in web order cards.")}</p>
      </section>

      <div className="settings-two-col settings-workflow-columns">
        <div className="settings-card-stack">
          <section className="card app-card" id="workflow-checks">
            <SettingsCardHead title={t("Production steps")} />
            {renderHeadingList("customSteps", "Status dropdown headings", "New Step", "Step name", "Add step", "No custom steps yet")}
            <div className="settings-divider" />
            {renderHeadingList("customToggles", "Yes / No checks", "New Toggle", "Toggle name", "Add check", "No custom checks yet")}
          </section>

          <section className="card app-card" id="workflow-summary">
            <SettingsCardHead title={t("Order summary")} />
            <div className="settings-select-grid">
              {[
                ["Summary 1", "summaryStep1"],
                ["Summary 2", "summaryStep2"],
                ["Badge 1", "orderListStep1"],
                ["Badge 2", "orderListStep2"]
              ].map(([label, key]) => (
                <label className="settings-field" key={key}>
                  <span className="settings-field-label">{t(label)}</span>
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
            <p className="settings-field-hint">{t("These selections map to summary rows and small order-card badges.")}</p>
          </section>
        </div>

        <section className="card app-card" id="workflow-materials">
          <SettingsCardHead title={t("Materials & Inventory")} />
          {renderHeadingList("materialsDefaultChecks", "Material check headings", "New Material Check", "Material check name", "Add material check", "No material checks yet")}
          <div className="settings-divider" />
          <label className="settings-switch-row">
            <input
              type="checkbox"
              className="settings-switch"
              checked={blockSettings.showMaterialsNotesSupplier}
              disabled={!canEdit || saving}
              onChange={event => updateSetting("showMaterialsNotesSupplier", event.target.checked)}
            />
            <span>{t("Show Notes / Supplier")}</span>
          </label>
          <label className="settings-field">
            <span className="settings-field-label">{t("Notes / Supplier heading")}</span>
            <input
              className="input"
              value={blockSettings.materialsNotesSupplierLabel}
              disabled={!canEdit || saving}
              onChange={event => updateSetting("materialsNotesSupplierLabel", event.target.value)}
              placeholder={t("Notes / Supplier")}
            />
          </label>
          <div className="settings-divider" />
          {renderHeadingList("materialsToggles", "Extra Yes / No checks", "New Material Toggle", "Material toggle name", "Add check", "No custom checks yet")}
        </section>
      </div>

      <div className="settings-save-row settings-save-bar">
        <p className="settings-save-bar-note">
          <CardIconGlyph icon="team" />
          {t("Shared with every teammate and device.")}
        </p>
        {status ? <p className="success-copy">{studioT(status, language)}</p> : null}
        {error ? <p className="layout-error">{t(error)}</p> : null}
        <button className="button" type="button" disabled={!canEdit || saving || !workflowDirty} onClick={() => { void handleSave(); }}>
          {saving ? studioT("Saving...", language) : t("Save workflow settings")}
        </button>
      </div>
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
    // Fixed ids: the seed runs again whenever the settings document changes,
    // and random ids made every re-seed look like an unsaved edit.
    companyNumbers: [
      { id: "default-vat-number", title: "VAT Number", value: "" },
      { id: "default-eori-number", title: "EORI Number", value: "" },
      { id: "default-company-number", title: "Company No.", value: "" }
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
  "pdfShowPriority" |
  "pdfShowAddress" |
  "pdfShowShippingAddress"
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
  ["pdfShowShipping", "Shipping & Tracking"],
  ["pdfShowAddress", "Billing Address"],
  ["pdfShowShippingAddress", "Shipping Address"]
];

type PdfToggleKey = (typeof PDF_SETTING_TOGGLES)[number][0];

// Curated starting points for the section toggles. A preset never prints
// internal cost, profit or supplier data on a customer-facing document —
// Internal Financials stays off in every preset and is only ever a manual
// opt-in.
const PDF_SECTION_PRESETS: Array<{ id: string; label: string; values: Record<PdfToggleKey, boolean> }> = [
  {
    id: "customer-invoice",
    label: "Customer invoice",
    values: {
      pdfShowCustomer: true, pdfShowContact: false, pdfShowPreview: true,
      pdfShowMaterials: false, pdfShowPriority: false, pdfShowFinCustomer: true,
      pdfShowPaymentMethod: true, pdfShowFinInternal: false, pdfShowStatus: false,
      pdfShowShipping: true, pdfShowAddress: true, pdfShowShippingAddress: true
    }
  },
  {
    id: "job-sheet",
    label: "Internal job sheet",
    values: {
      pdfShowCustomer: true, pdfShowContact: true, pdfShowPreview: true,
      pdfShowMaterials: true, pdfShowPriority: true, pdfShowFinCustomer: false,
      pdfShowPaymentMethod: false, pdfShowFinInternal: false, pdfShowStatus: true,
      pdfShowShipping: true, pdfShowAddress: false, pdfShowShippingAddress: true
    }
  },
  {
    id: "estimate",
    label: "Estimate",
    values: {
      pdfShowCustomer: true, pdfShowContact: false, pdfShowPreview: true,
      pdfShowMaterials: false, pdfShowPriority: false, pdfShowFinCustomer: true,
      pdfShowPaymentMethod: false, pdfShowFinInternal: false, pdfShowStatus: false,
      pdfShowShipping: false, pdfShowAddress: true, pdfShowShippingAddress: false
    }
  },
  {
    id: "delivery-note",
    label: "Delivery note",
    values: {
      pdfShowCustomer: true, pdfShowContact: false, pdfShowPreview: true,
      pdfShowMaterials: false, pdfShowPriority: false, pdfShowFinCustomer: false,
      pdfShowPaymentMethod: false, pdfShowFinInternal: false, pdfShowStatus: false,
      pdfShowShipping: true, pdfShowAddress: false, pdfShowShippingAddress: true
    }
  }
];

function PdfExportSettingsSection({
  workspace,
  settings,
  onSaved,
  language = "English"
}: {
  workspace: WorkspaceContext;
  settings: WorkspaceSettingsOverview | null;
  onSaved: (settings: WorkspaceSettingsOverview) => void;
  language?: string;
}) {
  const t = (text: string) => studioT(text, language);
  const [draft, setDraft] = useState<WorkspaceSettingsOverview | null>(settings);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const isWorkflowOnly = normalizeWorkspaceRole(workspace.role) === "workflow";
  const canEdit = isWorkflowOnly || canEditWorkspaceSettingsForRole(workspace.role);
  const visiblePdfToggles = isWorkflowOnly
    ? PDF_SETTING_TOGGLES.filter(([key]) => !["pdfShowFinCustomer", "pdfShowPaymentMethod", "pdfShowFinInternal"].includes(String(key)))
    : PDF_SETTING_TOGGLES;

  // The unsaved-changes baseline must be the seeded draft (fresh ids for the
  // default company-number rows), so the guard only arms once seeding is done.
  const [pdfSeeded, setPdfSeeded] = useState(false);
  useEffect(() => {
    setPdfSeeded(false);
    setDraft(settingsWithDefaultCompanyNumbers(settings));
    setStatus("");
    setError("");
    if (isWorkflowOnly && settings) {
      getPersonalInterfaceSettings(workspace).then(personal => {
        setDraft(current => current ? { ...current, ...personal } : current);
      }).catch(() => undefined).finally(() => setPdfSeeded(true));
    } else {
      setPdfSeeded(true);
    }
  }, [settings, isWorkflowOnly, workspace]);

  // The baseline is the seeded draft, not the stored document: this section
  // injects three company-number rows with fresh crypto.randomUUID() ids for a
  // workspace that has never saved any, so a document comparison could never
  // match.
  const { dirty: pdfDirty, markSaved: markPdfSaved } = useUnsavedGuard(
    "pdf",
    draft,
    Boolean(draft) && pdfSeeded,
    () => handleSave(true)
  );

  // The live preview: the same generators the real print buttons use, loaded
  // once from the order-detail module and re-run on every unsaved change.
  type PdfPreviewModule = { invoice: (settings: WorkspaceSettingsOverview) => string; jobsheet: (settings: WorkspaceSettingsOverview, name: string) => string };
  const [previewModule, setPreviewModule] = useState<PdfPreviewModule | null>(null);
  const [previewKind, setPreviewKind] = useState<"invoice" | "jobsheet">("invoice");
  const previewFrameRef = useRef<HTMLDivElement | null>(null);
  const [previewScale, setPreviewScale] = useState(0.5);
  useEffect(() => {
    let cancelled = false;
    import("@/app/orders/OrderDetailContent").then(mod => {
      if (!cancelled) setPreviewModule({ invoice: mod.invoicePreviewHtml, jobsheet: mod.jobSheetPreviewHtml });
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    const node = previewFrameRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (width > 0) setPreviewScale(Math.min(1, width / 794));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [draft === null]);
  const previewHtml = useMemo(() => {
    if (!previewModule || !draft || !settings) return "";
    const previewSettings = { ...settings, ...draft } as WorkspaceSettingsOverview;
    return previewKind === "invoice" ? previewModule.invoice(previewSettings) : previewModule.jobsheet(previewSettings, workspace.name);
  }, [previewModule, draft, settings, previewKind, workspace.name]);

  useSettingsHeaderActions(
    <Link className="button secondary" href="/export" title={t("Opens the CSV and backup export page. It does not generate a PDF.")}>
      {t("Open Export page")}
    </Link>,
    [language]
  );

  if (!draft) {
    return <PlaceholderSection t={t} title={t("PDF Export Settings")} detail={t("PDF settings could not be loaded yet.")} action={<Link className="button secondary" href="/export">{t("Open Export")}</Link>} />;
  }

  function updateBoolean(key: keyof WorkspaceSettingsOverview, value: boolean) {
    setDraft(current => current ? { ...current, [key]: value } : current);
    setStatus("");
    setError("");
  }

  // A preset only rewrites the toggles this role is allowed to see: for a
  // workflow-only member the finance keys keep their stored values instead of
  // pretending to flip in a UI that could never save them.
  function applyPdfPreset(preset: (typeof PDF_SECTION_PRESETS)[number]) {
    setDraft(current => {
      if (!current) return current;
      const next = { ...current };
      for (const [key] of visiblePdfToggles) next[key] = preset.values[key];
      return next;
    });
    setStatus("");
    setError("");
  }

  const activePdfPresetId = draft
    ? PDF_SECTION_PRESETS.find(preset =>
        visiblePdfToggles.every(([key]) => Boolean(draft[key]) === preset.values[key])
      )?.id ?? null
    : null;

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

  async function handleSave(rethrow = false) {
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
            pdfShowPriority: draft.pdfShowPriority,
            pdfShowAddress: draft.pdfShowAddress,
            pdfShowShippingAddress: draft.pdfShowShippingAddress
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
            pdfShowAddress: draft.pdfShowAddress,
            pdfShowShippingAddress: draft.pdfShowShippingAddress,
            companyNumbers: draft.companyNumbers
          });
      const savedSettings = { ...draft, ...(result.settings ?? {}) };
      setDraft(savedSettings);
      onSaved(savedSettings);
      markPdfSaved();
      setStatus(result.message || "PDF Export settings saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("PDF Export settings could not be saved."));
      if (rethrow) throw saveError;
    } finally {
      setSaving(false);
    }
  }

  const toggleLabels = new Map<string, string>(PDF_SETTING_TOGGLES.map(([key, label]) => [String(key), label]));
  const visibleKeys = new Set(visiblePdfToggles.map(([key]) => String(key)));
  const financeKeys = ["pdfShowFinCustomer", "pdfShowPaymentMethod", "pdfShowFinInternal"];
  const toggleGroups: { title: string; keys: PdfToggleKey[] }[] = [
    { title: "Customer details", keys: ["pdfShowCustomer", "pdfShowContact", "pdfShowPreview", "pdfShowAddress", "pdfShowShippingAddress"] },
    { title: "Operations", keys: ["pdfShowMaterials", "pdfShowPriority", "pdfShowStatus", "pdfShowShipping"] },
    { title: "Payments", keys: ["pdfShowFinCustomer", "pdfShowPaymentMethod", "pdfShowFinInternal"] }
  ];

  return (
    <div className="settings-card-stack settings-pdf-page">
      {!canEdit ? (
        <p className="settings-notice">
          {isWorkflowOnly
            ? t("Payment and financial PDF fields remain hidden. You can edit your own non-financial export sections below.")
            : t("Your current workspace role cannot edit PDF Export settings.")}
        </p>
      ) : null}

      <div className="settings-pdf-layout">
        <section className="card app-card">
          <SettingsCardHead title={t("Document preset")} subtitle={t("Start with a recommended set of sections, then customise it.")} />
          <div className="settings-preset-tabs" role="group" aria-label={t("PDF presets")}>
            {PDF_SECTION_PRESETS.map(preset => (
              <button
                key={preset.id}
                type="button"
                className={activePdfPresetId === preset.id ? "is-active" : ""}
                aria-pressed={activePdfPresetId === preset.id}
                disabled={!canEdit || saving}
                onClick={() => applyPdfPreset(preset)}
              >
                {t(preset.label)}
              </button>
            ))}
            <span className={activePdfPresetId === null ? "is-active is-custom" : "is-custom"} aria-hidden={activePdfPresetId !== null}>
              {t("Custom")}
            </span>
          </div>

          <h4 className="settings-subheading">{t("Visible sections")}</h4>
          <div className="settings-toggle-groups">
            {toggleGroups.map(group => {
              const keys = group.keys.filter(key => visibleKeys.has(String(key)));
              if (keys.length === 0) return null;
              return (
                <div key={group.title} className="settings-toggle-group">
                  <p className="settings-toggle-group-title">{t(group.title)}</p>
                  {keys.map(key => {
                    const isFinance = financeKeys.includes(String(key));
                    const isInternal = String(key) === "pdfShowFinInternal";
                    // Mirrors the server's personal-capable list: finance keys and
                    // company numbers are always workspace-shared.
                    const scope = isFinance || !isWorkflowOnly ? "Shared" : "Personal";
                    return (
                      <div key={String(key)} className={isInternal ? "settings-toggle-line is-caution" : "settings-toggle-line"}>
                        <label className="settings-toggle-line-main">
                          <input
                            type="checkbox"
                            className="settings-switch"
                            checked={Boolean(draft[key])}
                            disabled={!canEdit || saving}
                            onChange={event => updateBoolean(key, event.target.checked)}
                          />
                          <span className="settings-toggle-line-label">{t(toggleLabels.get(String(key)) ?? String(key))}</span>
                          <span className="settings-tag is-muted">{t(scope)}</span>
                        </label>
                        {isInternal ? (
                          <p className={draft.pdfShowFinInternal ? "settings-field-hint is-danger" : "settings-field-hint"}>
                            {draft.pdfShowFinInternal
                              ? t("Internal Financials prints your cost, profit and supplier details. Do not send that PDF to a customer.")
                              : t("Internal cost and profit are never included unless enabled.")}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <p className="settings-field-hint">{t("Finance-free preferences can be personal. Financial options are owner-managed and shared.")}</p>
        </section>

        <section className="card app-card settings-pdf-preview-card">
          <SettingsCardHead title={t("PDF preview")} subtitle={t("Sample order · live preview")} />
          <div className="settings-pdf-preview" ref={previewFrameRef} style={{ height: `${Math.round(1123 * previewScale)}px` }}>
            {previewHtml ? (
              <iframe
                srcDoc={previewHtml}
                sandbox=""
                title={t("PDF preview")}
                style={{ transform: `scale(${previewScale})` }}
              />
            ) : (
              <p className="settings-field-hint">{t("Loading...")}</p>
            )}
          </div>
          <div className="settings-button-row">
            <button type="button" className={previewKind === "invoice" ? "button secondary is-selected" : "button secondary"} aria-pressed={previewKind === "invoice"} onClick={() => setPreviewKind("invoice")}>
              {t("Preview invoice")}
            </button>
            <button type="button" className={previewKind === "jobsheet" ? "button secondary is-selected" : "button secondary"} aria-pressed={previewKind === "jobsheet"} onClick={() => setPreviewKind("jobsheet")}>
              {t("Preview job sheet")}
            </button>
          </div>
          <p className="settings-field-hint">{t("The preview uses a sample order and your current unsaved choices, rendered by the same template the real print buttons use.")}</p>
        </section>
      </div>

      {!isWorkflowOnly ? (
        <section className="card app-card">
          <SettingsCardHead title={t("Company invoice numbers")} subtitle={t("VAT, EORI, company number or another reference printed on invoices.")} />
          <div className="settings-table settings-company-numbers">
            <div className="settings-table-head" aria-hidden="true">
              <span>{t("Label")}</span>
              <span>{t("Number / value")}</span>
              <span />
            </div>
            {draft.companyNumbers.map(item => (
              <div className="settings-table-row" key={item.id}>
                <input
                  className="input"
                  value={item.title}
                  disabled={!canEdit || saving}
                  onChange={event => updateCompanyNumber(item.id, { title: event.target.value })}
                  placeholder={t("Label")}
                  aria-label={t("Label")}
                />
                <input
                  className="input"
                  value={item.value}
                  disabled={!canEdit || saving}
                  onChange={event => updateCompanyNumber(item.id, { value: event.target.value })}
                  placeholder={t("Number / value")}
                  aria-label={t("Number / value")}
                />
                <button className="settings-icon-button danger" type="button" disabled={!canEdit || saving} onClick={() => removeCompanyNumber(item.id)} aria-label={t("Remove")} title={t("Remove")}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
                </button>
              </div>
            ))}
          </div>
          <div className="settings-action-row settings-action-row-split">
            <button className="button secondary" type="button" disabled={!canEdit || saving} onClick={addCompanyNumber}>+ {t("Add reference")}</button>
            <span className="settings-field-hint">{t("Empty values are automatically omitted from PDFs.")}</span>
          </div>
        </section>
      ) : null}

      <div className="settings-save-row">
        {status ? <p className="success-copy">{studioT(status, language)}</p> : null}
        {error ? <p className="layout-error">{t(error)}</p> : null}
        <button className="button" type="button" disabled={!canEdit || saving || !pdfDirty} onClick={() => { void handleSave(); }}>
          {saving ? t("Saving...") : t("Save PDF Settings")}
        </button>
      </div>
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
  onSaved,
  language = "English"
}: {
  workspace: WorkspaceContext;
  settings: QuickReplySettings | null;
  onSaved: (settings: QuickReplySettings) => void;
  language?: string;
}) {
  const t = (text: string) => studioT(text, language);
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
  const [confirmClearKey, setConfirmClearKey] = useState(false);
  const [personalLoaded, setPersonalLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [contributionDraft, setContributionDraft] = useState("");
  const [contributions, setContributions] = useState<QuickReplyContributionItem[]>([]);
  const [contributionSaving, setContributionSaving] = useState(false);
  const [testingKey, setTestingKey] = useState(false);
  const [keyTest, setKeyTest] = useState<QuickReplyKeyTestResult | null>(null);
  const canEditCore = canEditQuickReplySettingsForRole(workspace.role);
  // The same key can also power the assistant on the public website. Only a
  // NivaDesk support admin sees this, and only they can switch it on.
  const [assistant, setAssistant] = useState<{ visible: boolean; enabled: boolean; hasKey: boolean }>({ visible: false, enabled: false, hasKey: false });
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [assistantError, setAssistantError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const config = await getWebsiteAssistantConfig();
      if (cancelled) return;
      setAssistant({
        visible: Boolean(config.visible),
        enabled: Boolean(config.enabled),
        hasKey: Boolean(config.hasKey)
      });
    })();
    return () => { cancelled = true; };
  }, [workspace.id]);

  async function toggleWebsiteAssistant(next: boolean) {
    setAssistantBusy(true);
    setAssistantError("");
    try {
      const result = await setWebsiteAssistant({ enabled: next, companyId: workspace.id });
      setAssistant(current => ({
        visible: true,
        enabled: Boolean(result.enabled),
        hasKey: next ? Boolean(result.hasKey) : current.hasKey
      }));
    } catch (error) {
      setAssistantError(error instanceof Error ? error.message : String(error));
    } finally {
      setAssistantBusy(false);
    }
  }
  const canEditPersonal = canEditPersonalQuickReplySettingsForRole(workspace.role);
  const canContribute = canContributeQuickReplyKnowledgeForRole(workspace.role);
  const [menuEnabled, setMenuEnabled] = useState(workspace.quickReplyMenuEnabled);
  const [menuSaving, setMenuSaving] = useState(false);

  async function toggleMenuEnabled() {
    if (menuSaving) return;
    const next = !menuEnabled;
    setMenuEnabled(next);
    setMenuSaving(true);
    try {
      await setWorkspaceQuickReplyMenuEnabled(workspace.id, next);
    } catch {
      setMenuEnabled(!next);
    } finally {
      setMenuSaving(false);
    }
  }

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

  // personalLoaded is the section's own "the callables have answered" flag, so
  // it is exactly the right moment to take the baseline. The API key box is
  // deliberately excluded: it is write-only and never reflects stored state.
  const { dirty: quickReplyDirty, markSaved: markQuickReplySaved } = useUnsavedGuard(
    "quick-reply",
    { replyMode, politeness, replyLength, mainKnowledgeBase, onDeviceKnowledgeBase, products, rules },
    personalLoaded,
    () => handleSave(true)
  );

  useSettingsHeaderActions(
    <Link className="button secondary" href="/quick-reply">{t("Open Quick Reply")}</Link>,
    [language]
  );

  async function handleSave(rethrow = false) {
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
      markQuickReplySaved();
      setStatus(personalResult.message || "Your Quick Reply settings were saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Quick Reply settings could not be saved.");
      if (rethrow) throw saveError;
    } finally {
      setSaving(false);
    }
  }

  if (!settings) {
    return <PlaceholderSection t={t} title={t("Quick Reply Settings")} detail={t("Quick Reply settings could not be loaded yet.")} />;
  }

  const showMaskedOpenAIKey = canEditCore && settings.hasOpenAIKey && !isReplacingOpenAIKey && !clearOpenAIKey;
  const clearKeyDialog = confirmClearKey ? (
    <SettingsDialog
      eyebrow={t("OpenAI API Key")}
      title={t("Clear the API key?")}
      onDismiss={() => setConfirmClearKey(false)}
      actions={[
        {
          label: t("Clear on save"),
          tone: "danger" as const,
          onClick: () => { setClearOpenAIKey(true); setIsReplacingOpenAIKey(false); setApiKeyInput(""); setConfirmClearKey(false); }
        },
        { label: t("Cancel"), tone: "secondary" as const, onClick: () => setConfirmClearKey(false) }
      ]}
    >
      <p>{t("Clearing takes effect when you save. Until you paste a new key, AI Replies stop generating for everyone in this workspace, and the website assistant stops answering if it was on.")}</p>
    </SettingsDialog>
  ) : null;

  async function runKeyTest() {
    setTestingKey(true);
    setKeyTest(null);
    try {
      setKeyTest(await testQuickReplyApiKey(workspace));
    } catch (testError) {
      setKeyTest({ ok: false, message: testError instanceof Error ? testError.message : t("The key did not answer.") });
    } finally {
      setTestingKey(false);
    }
  }

  const engineOptions = [
    { value: "Apple", label: "On-Device Settings", tag: "Private", detail: "Runs on the Mac or iPhone itself. Free and private, shorter replies, and only in the app — never in this browser." },
    { value: "AI", label: "OpenAI Online", tag: "Online", detail: "Writes a fresh reply from your knowledge base. Needs an API key and internet. Costs money per reply." },
    { value: "Offline", label: "Offline Template", tag: "No AI", detail: "Fills a fixed template. No AI, no key, no internet — the same wording every time." }
  ];
  const engineLabel = engineOptions.find(option => option.value === replyMode)?.label ?? "OpenAI Online";
  const keyStatusText = keyTest
    ? (keyTest.ok ? t("The key works.") : keyTest.message || t("The key did not answer."))
    : settings.openAIKeyCheckedAtMs > 0
      ? `${settings.openAIKeyWorks ? t("Last checked, working") : t("Last checked, failing")}: ${new Date(settings.openAIKeyCheckedAtMs).toLocaleDateString(studioLocaleTag(language))}`
      : t("Never checked");
  const keyStatusTone = keyTest ? (keyTest.ok ? "is-success" : "is-danger") : settings.openAIKeyWorks ? "is-success" : "";

  return (
    <div className="settings-card-stack settings-ai-page">
      {clearKeyDialog}
      {canEditCore ? (
        <div className="settings-status-band is-info">
          <span className="settings-status-band-icon" aria-hidden="true">✦</span>
          <div className="settings-status-band-copy">
            <strong>{t("Show “AI Replies” in the menu")}</strong>
            <p>{t("Turn this off to hide the AI Replies item from your main menu.")}</p>
          </div>
          <span className="settings-status-band-side">
            <input
              type="checkbox"
              className="settings-switch"
              role="switch"
              aria-checked={menuEnabled}
              aria-label={t("Show “AI Replies” in the menu")}
              checked={menuEnabled}
              disabled={menuSaving}
              onChange={() => { void toggleMenuEnabled(); }}
            />
          </span>
        </div>
      ) : null}

      <section className="card app-card">
        <SettingsCardHead title={t("Reply engine")} subtitle={t("Choose where replies are created.")} />
        <div className="settings-choice-grid" role="radiogroup" aria-label={t("Your Reply Engine")}>
          {engineOptions.map(option => {
            const selected = replyMode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                className={selected ? "settings-choice-card is-selected" : "settings-choice-card"}
                disabled={!canEditPersonal}
                onClick={() => setReplyMode(option.value)}
              >
                <span className="settings-choice-card-head">
                  <strong>{t(option.label)}</strong>
                  <span className="settings-tag">{t(option.tag)}</span>
                </span>
                <span className="settings-choice-card-detail">{t(option.detail)}</span>
                <span className="settings-choice-card-radio" aria-hidden="true">{selected ? "✓" : ""}</span>
              </button>
            );
          })}
        </div>
        <p className="settings-field-hint">
          {t("Currently using")} <strong>{t(engineLabel)}</strong>.{" "}
          {replyMode === "Apple"
            ? t("Configure personal on-device knowledge here. On-device generation runs in the supported mobile or desktop app, not in the web browser.")
            : t(quickReplyEngineDescription(replyMode))}
        </p>
      </section>

      <div className="settings-two-col">
        <section className="card app-card">
          <SettingsCardHead title={t("Default reply style")} />
          <div className="settings-field-stack">
            <div className="settings-field">
              <span className="settings-field-label">{t("Politeness")}</span>
              <div className="settings-segmented" role="group" aria-label={t("Politeness")}>
                {["Direct", "Warm", "Very Polite"].map(option => (
                  <button key={option} type="button" className={politeness === option ? "active" : ""} aria-pressed={politeness === option} disabled={!canEditPersonal} onClick={() => setPoliteness(option)}>{t(option)}</button>
                ))}
              </div>
            </div>
            <div className="settings-field">
              <span className="settings-field-label">{t("Length")}</span>
              <div className="settings-segmented" role="group" aria-label={t("Length")}>
                {["Short", "Balanced", "Detailed"].map(option => (
                  <button key={option} type="button" className={replyLength === option ? "active" : ""} aria-pressed={replyLength === option} disabled={!canEditPersonal} onClick={() => setReplyLength(option)}>{t(option)}</button>
                ))}
              </div>
            </div>
          </div>
          <p className="settings-field-hint">{t("These personal settings sync across your devices and do not change another team member’s templates.")}</p>
        </section>

        {replyMode === "AI" ? (
          canEditCore ? (
            <section className="card app-card">
              <SettingsCardHead
                title={t("OpenAI connection")}
                aside={
                  <span className={settings.hasOpenAIKey && !clearOpenAIKey ? "settings-dot-status" : "settings-dot-status is-offline"}>
                    {clearOpenAIKey ? t("Key will be cleared") : settings.hasOpenAIKey ? t("API key configured") : t("No API key configured")}
                  </span>
                }
              />
              <div className="settings-field-stack">
                <input
                  className={showMaskedOpenAIKey ? "input quick-reply-masked-key" : "input"}
                  type={showMaskedOpenAIKey ? "text" : "password"}
                  value={showMaskedOpenAIKey ? "sk-proj-••••" : apiKeyInput}
                  readOnly={showMaskedOpenAIKey}
                  disabled={clearOpenAIKey}
                  aria-label={t("OpenAI API Key")}
                  onFocus={() => { if (showMaskedOpenAIKey) setIsReplacingOpenAIKey(true); }}
                  onChange={event => { if (!showMaskedOpenAIKey) setApiKeyInput(event.target.value); }}
                  placeholder={settings.hasOpenAIKey ? t("Paste a new key to replace") : "sk-proj-..."}
                />
                {/* "Configured" said nothing about whether the key still works. A
                    revoked key looked identical to a good one until a customer
                    reply failed. */}
                {settings.hasOpenAIKey ? <p className={`settings-field-hint ${keyStatusTone}`}>{keyStatusText}</p> : null}
                <div className="settings-button-row">
                  {settings.hasOpenAIKey ? (
                    <button className="button secondary" type="button" disabled={testingKey} onClick={() => { void runKeyTest(); }}>
                      {testingKey ? t("Testing...") : t("Test API Connection")}
                    </button>
                  ) : null}
                  {showMaskedOpenAIKey ? <button className="button secondary" type="button" onClick={() => setIsReplacingOpenAIKey(true)}>{t("Replace Key")}</button> : null}
                  {isReplacingOpenAIKey ? <button className="button secondary" type="button" onClick={() => { setIsReplacingOpenAIKey(false); setApiKeyInput(""); }}>{t("Cancel Replace")}</button> : null}
                  {settings.hasOpenAIKey ? (
                    <button className={clearOpenAIKey ? "button secondary" : "button danger secondary"} type="button" onClick={() => { if (!clearOpenAIKey) { setConfirmClearKey(true); return; } setClearOpenAIKey(false); setIsReplacingOpenAIKey(false); setApiKeyInput(""); }}>
                      {clearOpenAIKey ? t("Keep Key") : t("Clear Key")}
                    </button>
                  ) : null}
                </div>
                <p className="settings-field-hint">{t("Stored server-side and never shared with workspace members. If the website assistant is switched on below, the same key answers questions from the nivadesk.app chat widget.")}</p>
              </div>
            </section>
          ) : (
            <section className="card app-card">
              <SettingsCardHead
                title={t("Workspace AI Access")}
                aside={
                  <span className={settings.hasOpenAIKey ? "settings-dot-status" : "settings-dot-status is-offline"}>
                    {settings.hasOpenAIKey ? t("Workspace OpenAI key configured") : t("Workspace OpenAI key not configured")}
                  </span>
                }
              />
              <p className="settings-field-hint">{t("Only the workspace owner can view or change the API key and main Company Knowledge Base. You can use OpenAI replies once a key is configured.")}</p>
            </section>
          )
        ) : replyMode === "Apple" ? (
          <section className="card app-card">
            <SettingsCardHead title={t("On-Device Settings")} aside={<span className="settings-tag">{t("Private")}</span>} />
            <p className="settings-field-hint">{t("Use this knowledge with Apple On-Device AI in the Mac/iPhone/iPad app. Android on-device generation requires a separate Gemini Nano integration and is not presented as active on web.")}</p>
          </section>
        ) : (
          <section className="card app-card">
            <SettingsCardHead title={t("Offline Template")} aside={<span className="settings-tag">{t("No AI")}</span>} />
            <p className="settings-field-hint">{t("Your own reusable products and rules sync across your devices without changing the workspace owner’s Company Knowledge Base.")}</p>
          </section>
        )}
      </div>

      {replyMode === "AI" && canEditCore && assistant.visible ? (
        <section className="card app-card">
          <SettingsCardHead
            title={t("Website assistant")}
            aside={<span className="settings-tag">{t("NivaDesk only")}</span>}
          />
          <p className="settings-field-hint">{t("Let this OpenAI key answer first questions in the nivadesk.app chat widget. The assistant only answers from public NivaDesk facts, never from this workspace's Quick Reply knowledge base, and hands over to a person when it is unsure. Every question still reaches Support / Tickets and your email.")}</p>
          <div className="settings-action-row">
            <span className={assistant.enabled ? "settings-dot-status" : "settings-dot-status is-offline"}>
              {assistant.enabled ? t("Website assistant is on") : t("Website assistant is off")}
            </span>
            {assistant.enabled && !assistant.hasKey ? <span className="settings-tag is-muted">{t("No API key configured")}</span> : null}
            <button className="button secondary" type="button" disabled={assistantBusy} onClick={() => void toggleWebsiteAssistant(!assistant.enabled)}>
              {assistantBusy ? t("Saving...") : (assistant.enabled ? t("Turn off") : t("Turn on"))}
            </button>
          </div>
          {assistantError ? <p className="layout-error">{t(assistantError)}</p> : null}
        </section>
      ) : null}

      {replyMode === "AI" && canEditCore ? (
        <section className="card app-card">
          <SettingsCardHead
            title={t("Company knowledge base")}
            subtitle={t("Pricing, process, policies, FAQs and common customer answers used by OpenAI.")}
            aside={<span className="settings-tag">{t("Owner managed")}</span>}
          />
          <KnowledgeBaseEditor title={t("Company Knowledge Base (For OpenAI)")} value={mainKnowledgeBase} disabled={false} onChange={setMainKnowledgeBase} language={language} />
          {/* The one previous version the server keeps on every real change.
              Restoring only edits the draft — Save is still the moment anything
              is written, and the replaced text becomes the new previous version,
              so a restore can itself be undone. */}
          {(settings.aiKnowledgeBasePrevious || "").trim() && settings.aiKnowledgeBasePrevious !== mainKnowledgeBase ? (
            <div className="settings-action-row">
              <button className="button secondary" type="button" onClick={() => setMainKnowledgeBase(settings.aiKnowledgeBasePrevious || "")}>
                {t("Restore previous version")}
                {settings.aiKnowledgeBasePreviousSavedAtMs ? ` (${new Date(settings.aiKnowledgeBasePreviousSavedAtMs).toLocaleDateString(studioLocaleTag(language))})` : ""}
              </button>
              <span className="settings-field-hint">{t("Puts the previous Knowledge Base text back into the editor. Nothing changes until you save.")}</span>
            </div>
          ) : null}
          {/* An empty box with a "add your pricing, process, policies" placeholder
              is a blank page problem: everyone left it empty, which is why the
              replies came out generic. */}
          {mainKnowledgeBase.trim().length === 0 ? (
            <div className="settings-action-row">
              <button className="button secondary" type="button" onClick={() => setMainKnowledgeBase(QUICK_REPLY_STARTER_KNOWLEDGE)}>
                {t("Start from headings")}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {replyMode === "AI" && canContribute ? (
        <section className="card app-card">
          <SettingsCardHead title={t("Team contributions")} subtitle={t("Add supporting information for shared OpenAI replies without changing the owner-managed Company Knowledge Base.")} />
          <p className="settings-notice">{t("The AI reads one combined text: the owner's Company Knowledge Base first, then each contribution with its author's name. Nothing overrides anything — if a contribution contradicts the owner text, the AI sees both. Keep contributions consistent with it.")}</p>
          <div className="settings-field-stack">
            <textarea className="input" rows={3} value={contributionDraft} maxLength={4000} onChange={event => setContributionDraft(event.target.value)} placeholder={t("Add an additional fact or instruction for AI replies...")} aria-label={t("Team contributions")} />
            <div className="settings-action-row settings-action-row-split">
              <span className="settings-field-hint">{contributionDraft.length.toLocaleString()} / 4,000 {t("characters")}.</span>
              <button className="button secondary" type="button" disabled={contributionSaving || !contributionDraft.trim()} onClick={addTeamContribution}>{contributionSaving ? t("Adding...") : t("Add Contribution")}</button>
            </div>
          </div>
          {contributions.length > 0 ? (
            <div className="settings-contribution-list">
              {contributions.map(item => (
                <div className="settings-contribution-row" key={item.id}>
                  <div>
                    <strong>{item.authorName}</strong>
                    <p>{item.text}</p>
                  </div>
                  {item.canDelete ? (
                    <button className="settings-icon-button danger" type="button" onClick={() => removeTeamContribution(item.id)} aria-label={t("Remove")} title={t("Remove")}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {replyMode === "Apple" ? (
        <section className="card app-card">
          <SettingsCardHead title={t("Personal On-Device Knowledge")} />
          <KnowledgeBaseEditor
            title={t("My On-Device Knowledge")}
            value={onDeviceKnowledgeBase}
            disabled={!canEditPersonal}
            onChange={setOnDeviceKnowledgeBase}
            language={language}
          />
        </section>
      ) : null}

      {replyMode === "Offline" ? (
        <section className="card app-card">
          <SettingsCardHead title={t("My Offline Template")} />
          <QuickReplyTemplateEditor title={t("Products / Services")} addLabel="Add Product" titlePlaceholder="Product Name" descPlaceholder="Product Detail / Price" items={products} disabled={!canEditPersonal} onAdd={() => setProducts(current => [...current, newQuickReplyTemplateItem()])} onRemove={index => setProducts(current => current.filter((_, itemIndex) => itemIndex !== index))} onChange={updateProduct} language={language} />
          <div className="settings-divider" />
          <QuickReplyTemplateEditor title={t("Custom Rules / FAQs")} addLabel="Add Rule" titlePlaceholder="Rule Title" descPlaceholder="Rule Description" items={rules} disabled={!canEditPersonal} onAdd={() => setRules(current => [...current, newQuickReplyTemplateItem()])} onRemove={index => setRules(current => current.filter((_, itemIndex) => itemIndex !== index))} onChange={updateRule} language={language} />
        </section>
      ) : null}

      <div className="settings-save-row settings-save-bar">
        {status ? <p className="success-copy">{studioT(status, language)}</p> : null}
        {error ? <p className="layout-error">{t(error)}</p> : null}
        <button
          className="button"
          type="button"
          disabled={!canEditPersonal || !personalLoaded || saving || (!quickReplyDirty && !apiKeyInput.trim() && !clearOpenAIKey)}
          onClick={() => { void handleSave(); }}
        >
          {saving ? t("Saving...") : t("Save My Settings")}
        </button>
      </div>
    </div>
  );
}

// Headings, not answers: the studio fills them in. Every one of these is a
// question customers actually ask, so a half-filled version already beats empty.
const QUICK_REPLY_STARTER_KNOWLEDGE = `What we make:
Typical prices:
How long an order usually takes:
Deposit and payment terms:
What we need from the customer before starting:
Delivery, postage and collection:
Returns, repairs and guarantees:
Rush orders:
What we do NOT take on:
Opening hours and how to reach us:`;

function KnowledgeBaseEditor({
  title,
  value,
  disabled,
  onChange,
  language = "English",
  maxLength = 50000
}: {
  title: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  language?: string;
  maxLength?: number;
}) {
  const t = (text: string) => studioT(text, language);
  const nearLimit = value.length > maxLength * 0.9;
  return (
    <label className="quick-reply-settings-label quick-reply-knowledge-panel">
      <span>{t(title)}</span>
      <textarea
        className="quick-reply-settings-textarea"
        value={value}
        disabled={disabled}
        maxLength={maxLength}
        onChange={event => onChange(event.target.value)}
        placeholder={t("Add your pricing, process, policies, FAQs and common customer answers here...")}
      />
      <span className={nearLimit ? "layout-error" : undefined}>
        {t("This Knowledge Base is synced across Mac, iPad and iPhone for the same company.")}
        {" "}
        {value.length.toLocaleString()} / {maxLength.toLocaleString()} {t("characters")}.
      </span>
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
  onChange,
  language = "English"
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
  language?: string;
}) {
  const t = (text: string) => studioT(text, language);
  return (
    <div className="quick-reply-template-editor">
      <div className="quick-reply-template-heading">
        <strong>{t(title)}</strong>
        <button className="button secondary" type="button" disabled={disabled} onClick={onAdd}>{t(addLabel)}</button>
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
                placeholder={t(titlePlaceholder)}
              />
              <textarea
                className="quick-reply-template-description"
                value={item.desc}
                disabled={disabled}
                onChange={event => onChange(index, { desc: event.target.value })}
                placeholder={t(descPlaceholder)}
              />
            </div>
            <button className="icon-action danger" type="button" disabled={disabled || items.length <= 1} onClick={() => onRemove(index)} aria-label={t("Remove")}>
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
  onSaved,
  language = "English"
}: {
  workspace: WorkspaceContext;
  settings: WorkspaceSettingsOverview | null;
  onSaved: (settings: WorkspaceSettingsOverview) => void;
  language?: string;
}) {
  const t = (text: string) => studioT(text, language);
  const [requirePolicy, setRequirePolicy] = useState(true);
  const [maxFileSizeMB, setMaxFileSizeMB] = useState(10);
  const [policyText, setPolicyText] = useState("");
  const [browserAccepted, setBrowserAccepted] = useState(false);
  const [acceptedAtMs, setAcceptedAtMs] = useState(0);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const canEdit = canEditWorkspaceSettingsForRole(workspace.role);

  useEffect(() => {
    if (!settings) return;
    setRequirePolicy(settings.uploadSafetyRequirePolicyAcceptance);
    setMaxFileSizeMB(Math.min(Math.max(Math.round(settings.uploadSafetyMaxFileSizeMB || 10), 1), 50));
    setPolicyText(settings.uploadSafetyPolicyText || "");
  }, [settings]);

  useEffect(() => {
    const accepted = window.localStorage.getItem(uploadSafetyAcceptanceKey(workspace.id)) === "accepted";
    setBrowserAccepted(accepted);
    const atRaw = window.localStorage.getItem(uploadSafetyAcceptanceAtKey(workspace.id));
    setAcceptedAtMs(accepted && atRaw ? Number(atRaw) || 0 : 0);
  }, [workspace.id]);

  function updateBrowserAccepted(nextAccepted: boolean) {
    setBrowserAccepted(nextAccepted);
    const key = uploadSafetyAcceptanceKey(workspace.id);
    const atKey = uploadSafetyAcceptanceAtKey(workspace.id);
    if (nextAccepted) {
      window.localStorage.setItem(key, "accepted");
      window.localStorage.setItem(atKey, String(Date.now()));
      setAcceptedAtMs(Date.now());
    } else {
      window.localStorage.removeItem(key);
      window.localStorage.removeItem(atKey);
      setAcceptedAtMs(0);
    }
  }

  // browserAccepted is excluded: it writes to localStorage the moment it
  // changes, so it is never an unsaved edit.
  const { dirty: safetyDirty, markSaved: markSafetySaved } = useUnsavedGuard(
    "safety-uploads",
    { requirePolicy, maxFileSizeMB, policyText },
    Boolean(settings),
    () => handleSave(true)
  );

  async function handleSave(rethrow = false) {
    if (!settings) return;
    setSaving(true);
    setStatus("");
    setError("");
    try {
      const result = await saveUploadSafetySettings(workspace, {
        uploadSafetyRequirePolicyAcceptance: requirePolicy,
        uploadSafetyMaxFileSizeMB: maxFileSizeMB,
        uploadSafetyPolicyText: policyText
      });
      onSaved({
        ...settings,
        uploadSafetyRequirePolicyAcceptance: result.settings?.uploadSafetyRequirePolicyAcceptance ?? requirePolicy,
        uploadSafetyMaxFileSizeMB: result.settings?.uploadSafetyMaxFileSizeMB ?? maxFileSizeMB,
        uploadSafetyPolicyText: (result.settings as { uploadSafetyPolicyText?: string } | undefined)?.uploadSafetyPolicyText ?? policyText
      });
      markSafetySaved();
      setStatus(result.message || "Upload Safety settings saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Upload Safety settings could not be saved.");
      if (rethrow) throw saveError;
    } finally {
      setSaving(false);
    }
  }

  const acceptedDate = acceptedAtMs > 0 ? new Date(acceptedAtMs).toLocaleDateString(studioLocaleTag(language)) : "";

  return (
    <div className="settings-card-stack settings-safety-page">
      <div className="settings-fact-cards">
        <div className="settings-fact-card">
          <span className="settings-card-head-icon" aria-hidden="true"><CardIconGlyph icon="check" /></span>
          <span className="settings-fact-card-copy">
            <small>{t("Policy prompt")}</small>
            <strong>{requirePolicy ? t("Required") : t("Not required")}</strong>
          </span>
        </div>
        <div className="settings-fact-card">
          <span className="settings-card-head-icon" aria-hidden="true"><CardIconGlyph icon="docText" /></span>
          <span className="settings-fact-card-copy">
            <small>{t("Maximum file size")}</small>
            <strong>{Math.round(maxFileSizeMB)} MB</strong>
          </span>
        </div>
        <div className={browserAccepted ? "settings-fact-card" : "settings-fact-card is-caution"}>
          <span className="settings-card-head-icon" aria-hidden="true"><CardIconGlyph icon="warningTriangle" /></span>
          <span className="settings-fact-card-copy">
            <small>{t("This browser")}</small>
            <strong>{browserAccepted ? t("Accepted") : t("Not accepted")}</strong>
            <em>
              {browserAccepted
                ? `${t("Uploads will not ask again until you reset it.")}${acceptedDate ? ` (${acceptedDate})` : ""}`
                : t("The next upload will ask for acceptance.")}
            </em>
          </span>
        </div>
      </div>

      <div className="settings-two-col settings-safety-columns">
        <section className="card app-card">
          <SettingsCardHead title={t("Upload policy settings")} />
          <div className="settings-field-stack">
            <label className="settings-switch-line is-plain">
              <span className="settings-switch-line-copy">
                <strong>{t("Require policy acceptance")}</strong>
                <small>{t("When enabled, every browser and device in this workspace must accept the upload policy before its first Client Files upload.")}</small>
              </span>
              <input
                type="checkbox"
                className="settings-switch"
                checked={requirePolicy}
                disabled={!canEdit || saving}
                onChange={event => setRequirePolicy(event.target.checked)}
              />
            </label>
            <label className="settings-field">
              <span className="settings-field-label">{t("Workspace upload policy text")}</span>
              <textarea
                className="input"
                rows={3}
                maxLength={2000}
                value={policyText}
                disabled={!canEdit || saving}
                placeholder={t("Optional. Shown to your team when they are asked to accept the upload policy. Leave empty to use the built-in wording.")}
                onChange={event => setPolicyText(event.target.value)}
              />
            </label>
            <label className="settings-field-row">
              <span className="settings-switch-line-copy">
                <strong>{t("Maximum upload size")}</strong>
                <small>{t("The NivaDesk apps block files larger than this before upload.")}</small>
              </span>
              <span className="settings-unit-input">
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
                <em>MB</em>
              </span>
            </label>
            {/* This used to be a checkbox whose label read "This browser has
                accepted the upload policy" — styled exactly like the status
                sentence below it, so an un-accepted browser showed the claim and
                its own contradiction one after the other. The state is stated
                once now, and the control is only ever a reset: ticking a box
                should not count as reading a policy. */}
            <div className="settings-action-row settings-action-row-split">
              <span className="settings-field-hint">{t("Acceptance is stored on this browser only, the same way each device accepts separately.")}</span>
              {browserAccepted ? (
                <button className="button secondary" type="button" onClick={() => updateBrowserAccepted(false)}>
                  {t("Reset for this browser")}
                </button>
              ) : null}
            </div>
          </div>
        </section>

        <section className="card app-card">
          <SettingsCardHead title={t("Allowed file types")} />
          <div className="settings-field-stack">
            <div className="settings-field">
              <span className="settings-field-label">{t("Client Files")}</span>
              <div className="settings-chip-row">
                {["PDF", "JPG", "PNG", "HEIC", "HEIF", "WEBP", "PSD", "PSB", "ZIP"].map(type => <span className="settings-chip" key={type}>{type}</span>)}
              </div>
            </div>
            <div className="settings-field">
              <span className="settings-field-label">{t("Previews, logos & avatars")}</span>
              <div className="settings-chip-row"><span className="settings-chip">{t("Images only")}</span></div>
            </div>
            <p className="settings-field-hint">
              {t("Cloud file upload is available on Pro and Team plans.")}{" "}
              <a className="settings-inline-link" href="/settings?section=plan-access">{t("View plan & storage limits")}</a>
            </p>
          </div>
        </section>
      </div>

      <div className="settings-status-band is-caution" role="note">
        <span className="settings-status-band-icon" aria-hidden="true"><CardIconGlyph icon="warningTriangle" /></span>
        <div className="settings-status-band-copy">
          <strong>{t("Human review still matters")}</strong>
          <p>{t("This does not automatically judge the content of a file. It adds clear rules, upload limits and an audit trail. Owners should still review and remove anything unsuitable.")} {t("NivaDesk does not virus-scan uploaded files. Your own device's antivirus still applies when files are downloaded.")}</p>
        </div>
      </div>

      <section className="card app-card">
        <SettingsCardHead title={t("Guidance & protection")} />
        <div className="settings-accordion">
          <details open>
            <summary><span>{t("Upload rules")}</span><span className="settings-tag is-muted">4 · {t("What users must understand")}</span></summary>
            <div className="settings-rule-grid">
              <IntegrationInfoRow number="1" title={t("Only upload suitable files")} detail={t("Users must only upload legal, safe and work-related files that belong in this workspace.")} />
              <IntegrationInfoRow number="2" title={t("No illegal or harmful content")} detail={t("Illegal, abusive, explicit, stolen, harmful or unrelated files must not be uploaded.")} />
              <IntegrationInfoRow number="3" title={t("Client approval and rights")} detail={t("If a file belongs to a client or third party, the user should have permission to use it for the order.")} />
              <IntegrationInfoRow number="4" title={t("Owner can remove files")} detail={t("Workspace owners should remove unsuitable files and can remove users from the workspace if needed.")} />
            </div>
          </details>
          <details>
            <summary><span>{t("Workspace upload protection")}</span><span className="settings-tag is-muted">4 · {t("What the app does")}</span></summary>
            <div className="settings-rule-grid">
              <IntegrationInfoRow number="1" title={t("Company workspace only")} detail={t("Uploads are saved under the active Company ID so they stay connected to this workspace.")} />
              <IntegrationInfoRow number="2" title={t("Allowed file types only")} detail={t("Client Files accepts PDF, JPG, PNG, HEIC, HEIF, WEBP, PSD, PSB and ZIP, while previews, logos and avatars stay image-only.")} />
              <IntegrationInfoRow number="3" title={t("File size limit")} detail={t("The NivaDesk apps block files larger than the selected limit before upload.")} />
              <IntegrationInfoRow number="4" title={t("Upload audit log")} detail={t("Each upload records the company, user, file type, file size, upload date, source and related order when available.")} />
            </div>
          </details>
          <details>
            <summary><span>{t("Important limitation")}</span><span className="settings-tag is-muted">{t("Review required")}</span></summary>
            <p className="settings-field-hint">{t("Allowed Client Files types remain PDF, JPG, PNG, HEIC, HEIF, WEBP, PSD, PSB and ZIP. Plan guards still keep cloud file upload on Pro and Team.")}</p>
            <p className="settings-field-hint">{t("This per-file limit is separate from your plan's total storage, which is counted across Client Files and enforced on every upload.")}</p>
          </details>
        </div>
      </section>

      <div className="settings-save-row settings-save-bar">
        <p className="settings-save-bar-note">{t("The per-file limit is separate from your plan's total storage.")}</p>
        {status ? <p className="success-copy">{studioT(status, language)}</p> : null}
        {error ? <p className="layout-error">{t(error)}</p> : null}
        <button className="button" type="button" disabled={!canEdit || saving || !safetyDirty} onClick={() => { void handleSave(); }}>
          {saving ? t("Saving...") : t("Save upload safety")}
        </button>
      </div>
    </div>
  );
}

function uploadSafetyAcceptanceKey(workspaceId: string) {
  return `studioflow-upload-policy-accepted:${workspaceId}`;
}

// The acceptance flag stays the literal "accepted" for compatibility with every
// existing reader; the WHEN lives beside it under its own key.
function uploadSafetyAcceptanceAtKey(workspaceId: string) {
  return `studioflow-upload-policy-accepted-at:${workspaceId}`;
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
  // OAuth-only accounts (Google / Apple, no password provider) can't change their
  // sign-in email — it's owned by the provider. Lock the field for them.
  const accountProviderIds = user?.providerData.map(provider => provider.providerId) ?? [];
  const isOAuthOnlyAccount = accountProviderIds.length > 0 && !accountProviderIds.includes("password");
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
      setProfileError(t("Enter a valid email address."));
      return;
    }
    if (cleanEmail === currentEmail) {
      setProfileStatus(t("This is already your sign-in email."));
      return;
    }
    const confirmed = window.confirm(t("Change your sign-in email to") + " " + cleanEmail + "? " + t("You can change it again after 10 days."));
    if (!confirmed) return;

    setSavingEmail(true);
    try {
      const result = await changeAccountEmail(workspace, { email: cleanEmail });
      const nextEmail = result.profile?.email ?? cleanEmail;
      setAccountEmail(nextEmail);
      setEmailDraft(nextEmail);
      await auth.currentUser?.reload();
      await auth.currentUser?.getIdToken(true);
      // Send a verification email to the new address so the user confirms ownership
      // and clears the unverified flag set by the email change (best-effort).
      if (auth.currentUser && !auth.currentUser.emailVerified) {
        await sendEmailVerification(auth.currentUser, { url: "https://nivadesk.app/login" }).catch(() => undefined);
      }
      setProfileStatus(result.message || t("Email updated. Check your new inbox to verify it. You can change it again after 10 days."));
    } catch (emailError) {
      setProfileError(emailError instanceof Error ? emailError.message : t("Email could not be changed."));
    } finally {
      setSavingEmail(false);
    }
  }

  async function copyIdentifier(value: string, feedback: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setProfileStatus(feedback);
    } catch {
      setProfileError(t("Copy failed. Select the value and copy it manually."));
    }
  }

  // Email, avatar and the workspace logo are their own actions with their own
  // buttons; only the two fields Save Profile writes are tracked here.
  const { dirty: profileDirty, markSaved: markProfileSaved } = useUnsavedGuard(
    "profile-security",
    { displayName, companyName },
    true,
    () => handleSaveProfile(true)
  );

  async function handleSaveProfile(rethrow = false) {
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
      markProfileSaved();
      setProfileStatus(result.message || t("Profile updated."));
    } catch (saveError) {
      setProfileError(saveError instanceof Error ? saveError.message : t("Profile could not be saved."));
      if (rethrow) throw saveError;
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
      setProfileStatus(result.message || t("Avatar updated."));
    } catch (avatarError) {
      setProfileError(avatarError instanceof Error ? avatarError.message : t("Avatar could not be saved."));
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
      setProfileStatus(result.message || t("Avatar removed."));
    } catch (avatarError) {
      setProfileError(avatarError instanceof Error ? avatarError.message : t("Avatar could not be removed."));
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
      setProfileStatus(result.message || t("Avatar updated."));
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    } catch (avatarError) {
      setProfileError(avatarError instanceof Error ? avatarError.message : t("Avatar could not be uploaded."));
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
      setProfileStatus(t("Password reset email sent."));
    } catch (resetError) {
      setProfileError(resetError instanceof Error ? resetError.message : t("Password reset email could not be sent."));
    } finally {
      setSendingReset(false);
    }
  }

  async function handleSignOut() {
    const confirmed = window.confirm(t("Sign out of NivaDesk on this browser?"));
    if (!confirmed) return;
    setSigningOut(true);
    setProfileStatus("");
    setProfileError("");
    try {
      // Remove the push registration while still authenticated — Firestore
      // rules reject the delete after signOut.
      try {
        const mod = await import("@/lib/studioflow/pushNotifications");
        await mod.unregisterWebPush();
      } catch {
        /* ignore */
      }
      clearDeviceLocalWorkspaceCache();
      await signOut(auth);
      router.replace("/login");
    } catch (signOutError) {
      setProfileError(signOutError instanceof Error ? signOutError.message : t("Could not sign out."));
      setSigningOut(false);
    }
  }

  async function saveLogoResult(result: { message?: string; settings?: { appLogoUrl?: string } }) {
    if (!settings) return;
    const nextSettings = { ...settings, ...(result.settings ?? {}) };
    onSaved(nextSettings);
    setStatus(result.message || t("Workspace logo saved."));
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
      setError(uploadError instanceof Error ? uploadError.message : t("Workspace logo could not be uploaded."));
    } finally {
      setUploadingLogo(false);
    }
  }

  function handleLogoFile(file: File | undefined) {
    if (!file) return;
    if (!settings) {
      setError(t("Workspace settings are still loading."));
      return;
    }
    if (!canEditLogo) {
      setError(t("Your workspace role cannot edit Workspace Logo."));
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
      setError(t("Workspace settings are still loading."));
      return;
    }
    if (!canEditLogo) {
      setError(t("Your workspace role cannot edit Workspace Logo."));
      return;
    }
    logoInputRef.current?.click();
  }

  async function handleAcceptPolicyAndUpload() {
    if (!pendingLogoFile) return;
    const key = uploadSafetyAcceptanceKey(workspace.id);
    window.localStorage.setItem(key, "accepted");
    window.localStorage.setItem(uploadSafetyAcceptanceAtKey(workspace.id), String(Date.now()));
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
      setError(removeError instanceof Error ? removeError.message : t("Workspace logo could not be removed."));
    } finally {
      setUploadingLogo(false);
    }
  }

  return (
    <div className="settings-card-stack settings-profile-page">
      <section className="card app-card settings-profile-card">
        <SettingsCardHead title={t("Profile")} />
        <div className="settings-profile-photo">
          <div className="account-avatar-preview">
            {accountPhotoUrl ? (
              <img src={accountPhotoUrl} alt={displayName || userEmail || t("Account avatar")} />
            ) : (
              <span>{accountInitials}</span>
            )}
          </div>
          <div className="settings-profile-photo-copy">
            <strong>{t("Profile Photo")}</strong>
            <p className="muted-copy">{t("Your profile photo is shown to team members in this workspace.")}</p>
            <div className="settings-button-row">
              <input
                ref={avatarInputRef}
                type="file"
                accept={ACCOUNT_AVATAR_ACCEPT}
                hidden
                onChange={event => void handleAvatarFile(event.target.files?.[0])}
              />
              <button className="button secondary" type="button" disabled={savingAvatar} onClick={() => avatarInputRef.current?.click()}>
                {savingAvatar ? t("Saving...") : accountPhotoUrl ? t("Change Avatar") : t("Upload Avatar")}
              </button>
              {googlePhotoUrl && googlePhotoUrl !== accountPhotoUrl ? (
                <button className="button secondary" type="button" disabled={savingAvatar} onClick={handleUseGooglePhoto}>
                  {savingAvatar ? t("Saving...") : t("Use Google Photo")}
                </button>
              ) : null}
              {accountPhotoUrl ? (
                <button className="button secondary" type="button" disabled={savingAvatar} onClick={handleRemoveAvatar}>
                  {savingAvatar ? t("Saving...") : t("Remove Avatar")}
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="settings-field-stack">
          <label className="settings-field">
            <span className="settings-field-label">{t("Email")}</span>
            {isOAuthOnlyAccount ? (
              <>
                <input
                  className="input"
                  value={accountEmail}
                  disabled
                  readOnly
                  type="email"
                />
                <span className="settings-field-hint">{t("Your sign-in email is managed by Google or Apple and can't be changed here.")}</span>
              </>
            ) : (
              <>
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
                    {savingEmail ? t("Changing...") : t("Change Email")}
                  </button>
                </div>
                {/* The 10-day rule stays right under the field it governs. */}
                <span className="settings-field-hint">{t("After changing your sign-in email, you can change it again after 10 days.")}</span>
              </>
            )}
          </label>
          <label className="settings-field">
            <span className="settings-field-label">{t("Your Name")}</span>
            <input
              className="input"
              value={displayName}
              disabled={savingProfile}
              placeholder={t("Your name")}
              onChange={event => setDisplayName(event.target.value)}
            />
          </label>
          {!hideWorkspaceIdentity ? (
            <label className="settings-field">
              <span className="settings-field-label">{t("Company / Studio Name")}</span>
              <input
                className="input"
                value={companyName}
                disabled={!canEditCompanyName || savingProfile}
                placeholder={t("My Studio")}
                onChange={event => setCompanyName(event.target.value)}
              />
            </label>
          ) : null}
        </div>

        {!hideWorkspaceIdentity && !canEditCompanyName ? <p className="muted-copy">{t("Company / Studio Name can only be changed by the workspace owner.")}</p> : null}
        {/* Workspace, role and user id: a compact read-only strip, not three cards. */}
        <div className="settings-identity-grid">
          <div className="settings-identity-item">
            <span>{t("Workspace")}</span>
            <strong>{workspace.name}</strong>
          </div>
          <div className="settings-identity-item">
            <span>{t("Role")}</span>
            <strong>{workspace.roleLabel}</strong>
          </div>
          <div className="settings-identity-item">
            <span>{t("User ID")}</span>
            <strong>{user?.uid ? `${user.uid.slice(0, 6)}…${user.uid.slice(-4)}` : "-"}</strong>
            {user?.uid ? (
              <button className="button secondary settings-identity-copy" type="button" onClick={() => copyIdentifier(user.uid, t("User ID copied"))}>
                {t("Copy")}
              </button>
            ) : null}
          </div>
        </div>
        <div className="settings-action-row">
          <button className="button" type="button" disabled={savingProfile || !profileDirty} onClick={() => { void handleSaveProfile(); }}>
            {savingProfile ? t("Saving...") : t("Save changes")}
          </button>
        </div>
        {profileStatus ? <p className="success-copy">{t(profileStatus)}</p> : null}
        {profileError ? <p className="layout-error">{t(profileError)}</p> : null}
      </section>

      <section className="card app-card settings-security-card">
        <SettingsCardHead title={t("Sign-in security")} aside={<span className="settings-tag">{t("App only")}</span>} />
        <div className="settings-security-item">
          <strong>{t("Face ID / device passcode")}</strong>
          <p className="muted-copy">{t("The Mac and iPhone app can require Face ID, Touch ID or device passcode on launch. Browser Face ID is not enabled on web yet, so use Sign Out on shared computers.")}</p>
        </div>
        <p className="muted-copy">{t("Password changes are handled securely by Firebase. Web sends a reset link to your account email instead of storing or editing your password here.")}</p>
        <div className="settings-action-row settings-action-row-split">
          {/* The button sent a link without ever naming the address it was
              going to, which matters on an account whose email was changed. */}
          <button className="button secondary" type="button" disabled={sendingReset} onClick={handlePasswordReset}>
            {sendingReset ? t("Sending...") : `${t("Send reset link to")} ${accountEmail || userEmail}`}
          </button>
          <button className="button secondary" type="button" disabled={signingOut} onClick={handleSignOut}>
            {signingOut ? t("Signing out...") : t("Sign Out")}
          </button>
        </div>
      </section>

      {!hideWorkspaceIdentity ? <section className="card app-card">
        <CardTitle icon="storage" eyebrow={t("Workspace Logo")} title={t("Upload or replace only")} />
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
            <strong>{logoUrl ? t("Workspace logo is set") : t("No logo uploaded yet")}</strong>
            <p className="muted-copy">{t("Upload or replace the logo used in the app header for this workspace. Manual logo links are disabled so each workspace uses an uploaded logo file.")}</p>
            {/* The picker accepted a file and then rejected it after the fact,
                with nothing on screen saying what it would accept. */}
            <p className="muted-copy">
              {t("JPG, PNG, HEIC or WEBP. Wide works best — around 512 × 128 pixels.")}
              {" "}
              {t("Maximum")} {maxSizeMB} MB.
            </p>
            <p className="muted-copy">
              {t("Choosing a logo uploads and saves it immediately — it is separate from the Save Branding button, which saves only the name and subtitle.")}
            </p>
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
                {uploadingLogo ? t("Uploading...") : logoUrl ? t("Replace Logo") : t("Upload Logo")}
              </button>
              {logoUrl ? (
                <button
                  className="button secondary"
                  type="button"
                  disabled={!canEditLogo || uploadingLogo || !settings}
                  onClick={handleRemoveLogo}
                >
                  {t("Remove Logo")}
                </button>
              ) : null}
            </div>
            {!canUploadLogo ? <p className="muted-copy">{t("Workspace logo upload is checked when you choose a file. Monthly Pro or Team is required.")}</p> : null}
            {!canEditLogo ? <p className="muted-copy">{t("Your current workspace role cannot edit Workspace Logo.")}</p> : null}
            {status ? <p className="success-copy">{studioT(status, accountLanguage)}</p> : null}
            {error ? <p className="layout-error">{t(error)}</p> : null}
          </div>
        </div>
        {pendingLogoFile ? (
          <div className="workspace-logo-policy">
            <strong>{t("Upload Policy")}</strong>
            <p>{t("Only upload legal, safe and work-related images that belong in this workspace.")}</p>
            <div className="workspace-logo-actions">
              <button className="button secondary" type="button" disabled={uploadingLogo} onClick={() => setPendingLogoFile(null)}>{t("Cancel")}</button>
              <button className="button" type="button" disabled={uploadingLogo} onClick={handleAcceptPolicyAndUpload}>{t("I Agree and Upload")}</button>
            </div>
          </div>
        ) : null}
      </section> : null}
      <DeleteAccountCard language={accountLanguage} />
    </div>
  );
}

function DeleteAccountCard({ language = "English" }: { language?: string }) {
  const t = (text: string) => studioT(text, language);
  const router = useRouter();
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    if (confirmText.trim().toUpperCase() !== "DELETE") {
      setError(t("Type DELETE to confirm."));
      return;
    }
    if (!window.confirm(t("This permanently deletes your account, your workspace, all orders, customers, notes and files. This cannot be undone. Continue?"))) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const callable = httpsCallable<{ confirmation: string }, { ok: boolean }>(functions, "deleteMyAccount");
      await callable({ confirmation: "DELETE" });
      clearDeviceLocalWorkspaceCache();
      try {
        await auth.signOut();
      } catch {
        // account already gone server-side
      }
      router.replace("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Could not delete the account."));
      setBusy(false);
    }
  }

  return (
    <section className="card app-card settings-danger-card">
      <SettingsCardHead title={t("Danger zone")} />
      <div className="settings-danger-row">
        <span className="settings-danger-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
        </span>
        <div className="settings-danger-copy">
          <strong>{t("Delete account")}</strong>
          {/* Two different losses, two separate lines — "your workspace dies" and
              "you leave other people's workspaces" were buried in one sentence. */}
          <p>{t("This deletes your account permanently. It cannot be undone.")}</p>
          <ul className="muted-copy">
            <li>{t("The workspace you own is deleted with all of its data: orders, customers, notes, messages and files.")}</li>
            <li>{t("Your memberships in other teams' workspaces are removed. Their data stays with them.")}</li>
          </ul>
        </div>
        <div className="settings-danger-actions">
          <input
            className="input"
            placeholder={t("Type DELETE to confirm")}
            value={confirmText}
            onChange={event => setConfirmText(event.target.value)}
            disabled={busy}
          />
          <button
            type="button"
            className="button danger secondary"
            onClick={() => void handleDelete()}
            disabled={busy || confirmText.trim().toUpperCase() !== "DELETE"}
          >
            {busy ? t("Deleting…") : t("Delete my account")}
          </button>
        </div>
      </div>
      {error ? <p className="layout-error">{t(error)}</p> : null}
    </section>
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
  const [clearingTax, setClearingTax] = useState(false);
  const [recalculationPreview, setRecalculationPreview] = useState<FinancialRecalculationPreview | null>(null);
  const [clearTaxPreview, setClearTaxPreview] = useState<ClearTaxPreview | null>(null);
  // Kept so the removal can be taken back without hunting for a run id.
  const [clearTaxUndoRunId, setClearTaxUndoRunId] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const canEdit = canEditWorkspaceSettingsForRole(workspace.role);
  const t = (text: string) => studioT(text, language);

  useEffect(() => {
    setDraft(settings);
    setStatus("");
    setError("");
  }, [settings]);

  const { dirty: financialDirty, markSaved: markFinancialSaved } = useUnsavedGuard(
    "financial",
    draft,
    Boolean(draft),
    () => handleSave(true)
  );
  // The shared page header carries Discard / Save; the handlers are function
  // declarations below, read through a ref so a click always sees this render.
  const financialActions = useRef({ save: () => handleSave(), discard: () => handleDiscard() });
  financialActions.current = { save: () => handleSave(), discard: () => handleDiscard() };
  useSettingsHeaderActions(
    <>
      <button type="button" className="button secondary" disabled={saving || !financialDirty} onClick={() => financialActions.current.discard()}>{t("Discard changes")}</button>
      <button type="button" className="button" disabled={!canEdit || saving || !financialDirty} onClick={() => { void financialActions.current.save(); }}>{saving ? t("Saving...") : t("Save changes")}</button>
    </>,
    [saving, financialDirty, canEdit, language]
  );

  if (!draft) {
    return <PlaceholderSection t={t} title={t("Financial Settings")} detail={t("Financial settings could not be loaded yet.")} />;
  }

  function updateString(
    key: "selectedCurrency" | "selectedDecimalSeparator" | "taxRuleNameRevenue" | "taxRuleNameProfit" | "taxCalculationType" | "invoiceFooterNote",
    value: string
  ) {
    setDraft(current => current ? { ...current, [key]: value } : current);
    setStatus("");
    setError("");
  }

  function updateNumber(key: "feePercentage" | "defaultTaxRate" | "defaultDeliveryTime" | "taxMilestoneDate" | "corporationTaxRate", value: number) {
    setDraft(current => current ? { ...current, [key]: value } : current);
    setStatus("");
    setError("");
  }

  function updateBoolean(key: "taxMilestoneEnabled" | "corporationTaxEnabled", value: boolean) {
    setDraft(current => current ? { ...current, [key]: value } : current);
    setStatus("");
    setError("");
  }

  async function handleSave(rethrow = false) {
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
        defaultDeliveryTime: draft.defaultDeliveryTime,
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
      markFinancialSaved();
      setStatus(result.message || t("Financial settings saved."));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("Financial settings could not be saved."));
      if (rethrow) throw saveError;
    } finally {
      setSaving(false);
    }
  }

  // Discard resets the draft to the last loaded/saved settings; the unsaved
  // guard's baseline was captured from that same object, so dirty drops back
  // to false without any extra bookkeeping.
  function handleDiscard() {
    setDraft(settings);
    setStatus("");
    setError("");
  }

  // The old flow was a browser confirm over a number nobody could see. Saving
  // the settings first is deliberate: the preview has to describe the rules that
  // will actually be applied, not the draft on screen.
  async function handleRecalculate() {
    if (!draft) return;
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
        defaultDeliveryTime: draft.defaultDeliveryTime,
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
      markFinancialSaved();
      setRecalculationPreview(await previewFinancialRecalculationForOrders(workspace));
    } catch (recalculateError) {
      setError(recalculateError instanceof Error ? recalculateError.message : t("Existing projects could not be recalculated."));
    } finally {
      setRecalculating(false);
    }
  }

  async function applyRecalculation() {
    setRecalculationPreview(null);
    setRecalculating(true);
    setStatus("");
    setError("");
    try {
      const result = await recalculateFinancialSettingsForOrders(workspace);
      setStatus(result.message || t("Existing projects recalculated."));
    } catch (recalculateError) {
      setError(recalculateError instanceof Error ? recalculateError.message : t("Existing projects could not be recalculated."));
    } finally {
      setRecalculating(false);
    }
  }

  async function handleClearTax() {
    if (!workspace) return;
    setClearingTax(true);
    setError("");
    setStatus("");
    try {
      setClearTaxPreview(await previewClearAllOrdersTax(workspace));
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : t("Preview could not be loaded."));
    } finally {
      setClearingTax(false);
    }
  }

  async function applyClearTax() {
    setClearTaxPreview(null);
    setClearingTax(true);
    setError("");
    setStatus("");
    try {
      const result = await clearAllOrdersTax(workspace);
      setClearTaxUndoRunId(result.undoAvailable && result.runId ? result.runId : "");
      setStatus(result.message || t("VAT removed from all orders."));
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : t("VAT could not be removed."));
    } finally {
      setClearingTax(false);
    }
  }

  async function handleUndoClearTax() {
    if (!clearTaxUndoRunId) return;
    setClearingTax(true);
    setError("");
    setStatus("");
    try {
      const result = await undoClearAllOrdersTax(workspace, clearTaxUndoRunId);
      setClearTaxUndoRunId("");
      setStatus(result.message || t("VAT restored."));
    } catch (undoError) {
      setError(undoError instanceof Error ? undoError.message : t("VAT could not be restored."));
    } finally {
      setClearingTax(false);
    }
  }

  // Worked from this workspace's own rate, so the example can never drift from
  // what the invoice will actually print.
  const taxExample = (() => {
    const rate = Math.max(0, Number(draft.defaultTaxRate) || 0);
    const round = (value: number) => Math.round(value * 100) / 100;
    const vatFromGross = (gross: number) => (rate > 0 ? round((gross * rate) / (100 + rate)) : 0);
    const vat = vatFromGross(1000);
    const marginVat = vatFromGross(400);
    return { rate, vat, net: round(1000 - vat), marginVat, marginNet: round(400 - marginVat) };
  })();

  const previewCurrency = draft.selectedCurrency || "£";
  const previewMoney = (value: number) =>
    `${previewCurrency}${Number(value || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const currencySummaryLabel =
    FINANCIAL_CURRENCIES.find(([symbol]) => symbol === draft.selectedCurrency)?.[1] ?? previewCurrency;
  const activeTaxBasisLabel = draft.taxCalculationType === "Profit"
    ? (draft.taxRuleNameProfit || "Profit")
    : (draft.taxRuleNameRevenue || "Revenue");

  return (
    <div className="settings-card-stack financial-settings-page">
      {recalculationPreview ? (
        <SettingsDialog
          wide
          eyebrow={t("Recalculate Taxes for Past Orders")}
          title={
            recalculationPreview.wouldUpdateCount === 0
              ? t("Nothing would change")
              : `${t("Recalculate")} ${recalculationPreview.wouldUpdateCount} / ${recalculationPreview.orderCount}`
          }
          onDismiss={() => setRecalculationPreview(null)}
          actions={[
            ...(recalculationPreview.wouldUpdateCount > 0
              ? [{
                  label: t("Apply these changes"),
                  tone: "primary" as const,
                  onClick: () => { void applyRecalculation(); }
                }]
              : []),
            { label: t("Cancel"), tone: "secondary" as const, onClick: () => setRecalculationPreview(null) }
          ]}
        >
          <p>{t("This preview does not change anything yet.")}</p>
          <div className="settings-impact-grid">
            <span>{t("Projects that would change")}</span>
            <strong>{recalculationPreview.wouldUpdateCount}</strong>
            <span>{t("Skipped — tax came from your shop")}</span>
            <strong>{recalculationPreview.skippedIntegrationCount}</strong>
            <span>{t("Of those, in Trash")}</span>
            <strong>{recalculationPreview.trashedAffectedCount}</strong>
            <span>{t("At 0% — would move to the default rate")}</span>
            <strong>{recalculationPreview.zeroRateForcedToDefaultCount}</strong>
            <span>{t("VAT total before")}</span>
            <strong>{previewMoney(recalculationPreview.totals.taxBefore)}</strong>
            <span>{t("VAT total after")}</span>
            <strong>{previewMoney(recalculationPreview.totals.taxAfter)}</strong>
            <span>{t("Difference")}</span>
            <strong>{previewMoney(recalculationPreview.totals.taxDelta)}</strong>
            <span>{t("Platform fee total after")}</span>
            <strong>{previewMoney(recalculationPreview.totals.feeAfter)}</strong>
          </div>
          {recalculationPreview.sample.length > 0 ? (
            <div className="settings-impact-samples">
              <table>
                <thead>
                  <tr>
                    <th>{t("Project")}</th>
                    <th>{t("VAT now")}</th>
                    <th>{t("VAT after")}</th>
                  </tr>
                </thead>
                <tbody>
                  {recalculationPreview.sample.slice(0, 3).map(row => (
                    <tr key={row.orderId}>
                      <td>{row.label}{row.inTrash ? ` (${t("Trash")})` : ""}</td>
                      <td>{previewMoney(row.taxBefore)}</td>
                      <td>{previewMoney(row.taxAfter)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <p>{t("Each changed project records this in its own history. Existing estimates you already sent are not touched.")}</p>
        </SettingsDialog>
      ) : null}
      {clearTaxPreview ? (
        <SettingsDialog
          wide
          eyebrow={t("Remove VAT from all orders")}
          title={
            clearTaxPreview.wouldClearCount === 0
              ? t("Nothing would change")
              : `${t("Remove VAT")} ${clearTaxPreview.wouldClearCount} / ${clearTaxPreview.orderCount}`
          }
          onDismiss={() => setClearTaxPreview(null)}
          actions={[
            ...(clearTaxPreview.wouldClearCount > 0
              ? [{
                  label: t("Remove VAT"),
                  tone: "danger" as const,
                  onClick: () => { void applyClearTax(); }
                }]
              : []),
            { label: t("Cancel"), tone: "secondary" as const, onClick: () => setClearTaxPreview(null) }
          ]}
        >
          <p>{t("Use this when VAT does not apply — you sell abroad, or you are not VAT-registered.")}</p>
          <div className="settings-impact-grid">
            <span>{t("Projects that would change")}</span>
            <strong>{clearTaxPreview.wouldClearCount}</strong>
            <span>{t("Of those, in Trash")}</span>
            <strong>{clearTaxPreview.trashedAffectedCount}</strong>
            <span>{t("VAT total before")}</span>
            <strong>{previewMoney(clearTaxPreview.totals.taxBefore)}</strong>
            <span>{t("VAT total after")}</span>
            <strong>{previewMoney(0)}</strong>
          </div>
          {clearTaxPreview.sample.length > 0 ? (
            <div className="settings-impact-samples">
              <table>
                <thead>
                  <tr>
                    <th>{t("Project")}</th>
                    <th>{t("VAT now")}</th>
                    <th>{t("VAT after")}</th>
                  </tr>
                </thead>
                <tbody>
                  {clearTaxPreview.sample.map(row => (
                    <tr key={row.orderId}>
                      <td>{row.label}{row.inTrash ? ` (${t("Trash")})` : ""}</td>
                      <td>{previewMoney(row.taxBefore)}</td>
                      <td>{previewMoney(0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <p>
            {clearTaxPreview.undoAvailable
              ? t("This can be undone straight afterwards — an Undo button appears once it has run.")
              : t("Too many projects to keep an undo record. Export a backup first.")}
          </p>
        </SettingsDialog>
      ) : null}
      {!canEdit ? (
        <p className="settings-notice is-caution"><strong>{t("Financial settings are read-only")}</strong> {t("Your current workspace role cannot edit Financial Settings.")}</p>
      ) : null}

      {status ? <p className="success-copy">{t(status)}</p> : null}
      {error ? <p className="layout-error">{t(error)}</p> : null}

      <nav className="settings-anchor-tabs" aria-label={t("Financial Settings")}>
        {[
          ["financial-general", "General"],
          ["financial-tax", "Tax & VAT"],
          ["financial-dates", "Effective dates"],
          ["financial-invoice", "Invoice"],
          ["financial-existing", "Existing orders"]
        ].map(([id, label]) => (
          <button key={id} type="button" onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })}>{t(label)}</button>
        ))}
      </nav>

      <div className="settings-two-col" id="financial-general">
        <section className="card app-card">
          <SettingsCardHead icon={<CardIconGlyph icon="finance" symbol={draft.selectedCurrency} />} title={t("Currency & formatting")} />
          <div className="settings-field-stack">
            <label className="settings-field-row">
              <span className="settings-field-label">{t("Currency")}</span>
              <select
                className="input"
                value={draft.selectedCurrency}
                disabled={!canEdit || saving}
                onChange={event => updateString("selectedCurrency", event.target.value)}
              >
                {FINANCIAL_CURRENCIES.map(([symbol, label]) => (
                  <option value={symbol} key={symbol}>{label}</option>
                ))}
              </select>
            </label>
            <div className="settings-field-row">
              <span className="settings-field-label">{t("Decimal Separator")}</span>
              <div className="settings-segmented is-compact" role="group" aria-label={t("Decimal Separator")}>
                <button type="button" className={draft.selectedDecimalSeparator === "." ? "active" : ""} aria-pressed={draft.selectedDecimalSeparator === "."} disabled={!canEdit || saving} onClick={() => updateString("selectedDecimalSeparator", ".")}>{t("Dot (.)")}</button>
                <button type="button" className={draft.selectedDecimalSeparator === "," ? "active" : ""} aria-pressed={draft.selectedDecimalSeparator === ","} disabled={!canEdit || saving} onClick={() => updateString("selectedDecimalSeparator", ",")}>{t("Comma (,)")}</button>
              </div>
            </div>
          </div>
          <p className="settings-field-hint">
            {t("Changing the currency symbol only relabels amounts — existing records are never converted between currencies. The decimal separator changes how numbers are shown; CSV exports always use a dot and a separate Currency column.")}
          </p>
        </section>

        <section className="card app-card">
          <SettingsCardHead icon={<CardIconGlyph icon="orders" />} title={t("Defaults for new orders")} />
          <div className="settings-field-stack">
            <label className="settings-field-row">
              <span className="settings-field-label">{t("Average platform fee")}</span>
              <span className="settings-unit-input">
                <input
                  className="input"
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
            <label className="settings-field-row">
              <span className="settings-field-label">{t("Default delivery time")}</span>
              <span className="settings-unit-input">
                <input
                  className="input"
                  type="number"
                  min="1"
                  max="730"
                  step="1"
                  value={draft.defaultDeliveryTime}
                  disabled={!canEdit || saving}
                  onChange={event => updateNumber("defaultDeliveryTime", Number(event.target.value))}
                />
                <em>{t("days")}</em>
              </span>
            </label>
          </div>
          <p className="settings-field-hint">{t("Applied only to new orders after saving.")}</p>
        </section>
      </div>

      <section className="card app-card" id="financial-tax">
        <SettingsCardHead icon={<CardIconGlyph icon="docText" />} title={t("Tax calculation")} />
        <div className="settings-two-col">
          <div className="settings-field-stack">
            <div className="financial-tax-choice" role="radiogroup" aria-label={t("Calculate Tax On")}>
              <button
                type="button"
                role="radio"
                aria-checked={draft.taxCalculationType !== "Profit"}
                data-active={draft.taxCalculationType !== "Profit" ? "true" : "false"}
                className="financial-tax-choice-card"
                disabled={!canEdit || saving}
                onClick={() => updateString("taxCalculationType", "Revenue")}
              >
                <strong>{draft.taxRuleNameRevenue || "Revenue"}</strong>
                <p>{t("Prices include VAT. The figure you enter is what the customer pays; the VAT is taken out of it, not added on top.")}</p>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={draft.taxCalculationType === "Profit"}
                data-active={draft.taxCalculationType === "Profit" ? "true" : "false"}
                className="financial-tax-choice-card"
                disabled={!canEdit || saving}
                onClick={() => updateString("taxCalculationType", "Profit")}
              >
                <strong>{draft.taxRuleNameProfit || "Profit"}</strong>
                <p>{t("Margin scheme: VAT is due on your margin, not on the whole price. The margin already contains the VAT.")}</p>
              </button>
            </div>
            <label className="settings-field-row">
              <span className="settings-field-label">{t("Revenue tax label")}</span>
              <input className="input" value={draft.taxRuleNameRevenue} disabled={!canEdit || saving} onChange={event => updateString("taxRuleNameRevenue", event.target.value)} />
            </label>
            <label className="settings-field-row">
              <span className="settings-field-label">{t("Eligible profit tax label")}</span>
              <input className="input" value={draft.taxRuleNameProfit} disabled={!canEdit || saving} onChange={event => updateString("taxRuleNameProfit", event.target.value)} />
            </label>
            <label className="settings-field-row">
              <span className="settings-field-label">{t("Default VAT rate")}</span>
              <span className="settings-unit-input">
                <input
                  className="input"
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
          </div>
          {/* The page named the rule and the rate and never said what either one
              meant, so nobody could tell whether the price already contained the
              VAT or had it added later. The arithmetic is spelled out with this
              workspace's own rate instead of described. */}
          <div className="settings-calc-preview">
            <span className="settings-field-label">{t("Calculation preview")}</span>
            <strong className="settings-calc-headline">{previewMoney(1000)} {t("customer price")}</strong>
            <dl className="settings-calc-rows">
              <div><dt>{t("Tax basis")}</dt><dd>{activeTaxBasisLabel}</dd></div>
              <div><dt>{t("VAT rate")}</dt><dd>{taxExample.rate}%</dd></div>
              {draft.taxCalculationType === "Profit" ? (
                <>
                  <div><dt>{t("Cost")}</dt><dd>{previewMoney(600)}</dd></div>
                  <div><dt>{t("Margin")}</dt><dd>{previewMoney(400)}</dd></div>
                  <div><dt>{t("VAT included")}</dt><dd>{previewMoney(taxExample.marginVat)}</dd></div>
                  <div><dt>{t("Net margin")}</dt><dd>{previewMoney(taxExample.marginNet)}</dd></div>
                </>
              ) : (
                <>
                  <div><dt>{t("VAT included")}</dt><dd>{previewMoney(taxExample.vat)}</dd></div>
                  <div><dt>{t("Net revenue")}</dt><dd>{previewMoney(taxExample.net)}</dd></div>
                </>
              )}
            </dl>
            <p className="settings-field-hint">{t("To charge VAT on top of your prices instead, raise the price itself — NivaDesk does not add it at invoice time.")}</p>
            <span className="settings-tag">{t("Applies to new orders")}</span>
          </div>
        </div>
      </section>

      <div className="settings-two-col">
        <section className="card app-card" id="financial-dates">
          <SettingsCardHead icon={<CardIconGlyph icon="calendarClock" />} title={t("Effective dates & corporation tax")} />
          <div className="settings-field-stack">
            <label className="settings-switch-line is-plain">
              <span className="settings-switch-line-copy">
                <strong>{t("Use Tax Transition Date")}</strong>
                <small>{t("Turning this on reveals a VAT Registration Date field: orders before that date are treated as pre-registration.")}</small>
              </span>
              <input type="checkbox" className="settings-switch" checked={draft.taxMilestoneEnabled} disabled={!canEdit || saving} onChange={event => updateBoolean("taxMilestoneEnabled", event.target.checked)} />
            </label>
            {draft.taxMilestoneEnabled ? (
              <label className="settings-field-row">
                <span className="settings-field-label">{t("VAT Registration Date")}</span>
                <input className="input" type="date" value={dateInputValueFromSeconds(draft.taxMilestoneDate)} disabled={!canEdit || saving} onChange={event => updateNumber("taxMilestoneDate", secondsFromDateInput(event.target.value))} />
              </label>
            ) : null}
            <label className="settings-switch-line is-plain">
              <span className="settings-switch-line-copy">
                <strong>{t("Enable Corporation Tax")}</strong>
                <small>{t("Turning this on reveals a Corporation Tax rate field used in the yearly summary.")}</small>
              </span>
              <input type="checkbox" className="settings-switch" checked={Boolean(draft.corporationTaxEnabled)} disabled={!canEdit || saving} onChange={event => updateBoolean("corporationTaxEnabled", event.target.checked)} />
            </label>
            {draft.corporationTaxEnabled ? (
              <>
                <label className="settings-field-row">
                  <span className="settings-field-label">{t("Corporation tax rate")}</span>
                  <span className="settings-unit-input">
                    <input className="input" type="number" min="0" max="100" step="0.1" value={draft.corporationTaxRate ?? 19} disabled={!canEdit || saving} onChange={event => updateNumber("corporationTaxRate", Number(event.target.value))} />
                    <em>%</em>
                  </span>
                </label>
                <p className="settings-notice is-caution">{t("Estimated — a planning figure, not your filed liability.")}</p>
              </>
            ) : null}
          </div>
        </section>

        <section className="card app-card" id="financial-invoice">
          <SettingsCardHead icon={<CardIconGlyph icon="notes" />} title={t("Invoice footer")} />
          <label className="settings-field">
            <span className="settings-field-label">{t("Invoice Footer / Payment Terms")}</span>
            <textarea
              className="input"
              rows={5}
              value={draft.invoiceFooterNote ?? ""}
              disabled={!canEdit || saving}
              placeholder={t("Bank details, payment terms, thank-you note shown on the customer invoice.")}
              onChange={event => updateString("invoiceFooterNote", event.target.value)}
            />
          </label>
          <p className="settings-field-hint">{t("Shown on customer invoices.")}</p>
        </section>
      </div>

      <section className="card app-card">
        <SettingsCardHead icon={<CardIconGlyph icon="check" />} title={t("Current workspace calculation")} />
        <dl className="settings-facts">
          <div><dt>{t("Currency")}</dt><dd>{currencySummaryLabel}</dd></div>
          <div><dt>{t("VAT")}</dt><dd>{taxExample.rate}%</dd></div>
          <div><dt>{t("Tax basis")}</dt><dd>{activeTaxBasisLabel}</dd></div>
          <div><dt>{t("Applies to")}</dt><dd>{t("New orders")}</dd></div>
        </dl>
        <p className="settings-field-hint">{t("Follows your edits above. New orders use these values once saved.")}</p>
      </section>

      <section className="settings-tools-panel" id="financial-existing">
        <div className="settings-tools-head">
          <span className="settings-status-band-icon" aria-hidden="true"><CardIconGlyph icon="warningTriangle" /></span>
          <div>
            <strong>{t("Existing order tools")}</strong>
            <p>{t("Changing the default calculation model sets the tax rule for new projects. Use recalculation when you want existing projects to adopt the current VAT rule, default VAT rate and platform fee.")}</p>
          </div>
        </div>
        <div className="settings-tools-row">
          <span className="settings-tools-row-icon" aria-hidden="true">↻</span>
          <div className="settings-tools-row-copy">
            <strong>{t("Recalculate Taxes for Past Orders")}</strong>
            <p>{t("Apply the current VAT rule, default rate and platform fee to orders you already have.")}</p>
          </div>
          <div className="settings-tools-actions">
            <button className="button secondary" type="button" disabled={!canEdit || saving || recalculating} onClick={handleRecalculate}>
              {recalculating ? t("Recalculating...") : t("Recalculate")}
            </button>
          </div>
        </div>
        <div className="settings-tools-row">
          <span className="settings-tools-row-icon is-danger" aria-hidden="true">⊘</span>
          <div className="settings-tools-row-copy">
            <strong>{t("Remove VAT from all orders")}</strong>
            <p>{t("Use this when VAT does not apply — you sell abroad, or you are not VAT-registered.")}</p>
          </div>
          <div className="settings-tools-actions">
            {clearTaxUndoRunId ? (
              <button className="button secondary" type="button" disabled={clearingTax} onClick={() => { void handleUndoClearTax(); }}>
                {t("Undo VAT removal")}
              </button>
            ) : null}
            <button className="button danger secondary" type="button" disabled={!canEdit || saving || clearingTax} onClick={handleClearTax}>
              {clearingTax ? t("Removing VAT...") : t("Remove VAT")}
            </button>
          </div>
        </div>
      </section>

      <div className="settings-save-row settings-save-bar">
        <p className="settings-save-bar-note">{t("Your workspace is shared with other team members.")}</p>
        <button type="button" className="button secondary" disabled={saving || !financialDirty} onClick={() => handleDiscard()}>{t("Discard changes")}</button>
        <button type="button" className="button" disabled={!canEdit || saving || !financialDirty} onClick={() => { void handleSave(); }}>{saving ? t("Saving...") : t("Save changes")}</button>
      </div>
    </div>
  );
}

// Field-level conflict policy for store-sourced customer updates. Lives in
// both the WooCommerce and Shopify sections — the policy is store-agnostic.
function IntegrationCustomerSyncCard({ workspace, language = "English" }: { workspace: WorkspaceContext; language?: string }) {
  const t = (text: string) => studioT(text, language);
  const [policy, setPolicy] = useState<"store" | "nivadesk">("store");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let active = true;
    loadWorkspaceSettingsOverview(workspace.id)
      .then(overview => {
        if (!active) return;
        setPolicy(overview.integrationCustomerSync === "nivadesk" ? "nivadesk" : "store");
        setLoaded(true);
      })
      .catch(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, [workspace.id]);

  async function save(next: "store" | "nivadesk") {
    const previous = policy;
    setPolicy(next);
    setSaving(true);
    setStatus("");
    try {
      await saveIntegrationSyncSettings(workspace, next);
      setStatus(t("Saved."));
    } catch (saveError) {
      setPolicy(previous);
      setStatus(saveError instanceof Error ? saveError.message : t("Could not save the sync policy."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card app-card quick-reply-settings-card">
      <CardTitle icon="customer" eyebrow={t("Customers")} title={t("Customer contact updates")} />
      <div className="quick-reply-settings-info">
        <p>{t("When a store order arrives for a customer you already have, who wins on contact details?")}</p>
      </div>
      <select
        className="input"
        style={{ maxWidth: 420 }}
        value={policy}
        disabled={!loaded || saving}
        onChange={event => void save(event.target.value as "store" | "nivadesk")}
      >
        <option value="store">{t("Store updates contact details (default)")}</option>
        <option value="nivadesk">{t("NivaDesk edits win — stores only fill blanks")}</option>
      </select>
      {status ? <p className="muted-copy" style={{ margin: "8px 0 0" }}>{t(status)}</p> : null}
    </section>
  );
}

/**
 * One place for everything NivaDesk connects to.
 *
 * The three integration screens used to be three menu entries, which meant the
 * menu grew by one every time a provider did, and a workshop looking for "where
 * do I connect my shop" had to already know which shop platform we called it.
 * The menu now carries Integrations and nothing else; each provider is a card,
 * and its setup, sync, webhook and security detail is what Manage opens.
 *
 * Every status here is resolved from the workspace, never written down — see
 * lib/studioflow/integrations.ts for which signal each one reads.
 */
function IntegrationsSection({
  workspace, language = "English", intent, category, openProvider, onOpenSupport,
}: {
  workspace: WorkspaceContext;
  language?: string;
  /** From the Getting started card: lead with the shop platforms. */
  intent?: string;
  category?: string;
  /** An old ?section=shopify link opens that provider's screen directly. */
  openProvider?: IntegrationManageTarget;
  onOpenSupport: () => void;
}) {
  const t = (text: string) => studioT(text, language);
  const companyId = workspace.id.trim();
  const [managing, setManaging] = useState<IntegrationManageTarget>(openProvider ?? "");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "connected" | "available" | "planned">("all");
  const [signals, setSignals] = useState<IntegrationSignals>(EMPTY_INTEGRATION_SIGNALS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    let active = true;
    // The same five reads the onboarding wizard makes, from one place.
    void loadIntegrationSignals(companyId).then((next) => {
      if (!active) return;
      setSignals(next);
      setLoaded(true);
    });
    return () => { active = false; };
  }, [companyId]);

  const resolved = useMemo(
    () => INTEGRATION_PROVIDERS.map((provider) => ({
      provider, live: resolveIntegrationState(provider, signals),
    })),
    [signals],
  );

  // The parent hands down a fresh callback on every render; going through a
  // ref keeps the header registration from re-running (and re-rendering the
  // page) in a loop.
  const openSupportRef = useRef(onOpenSupport);
  openSupportRef.current = onOpenSupport;
  useSettingsHeaderActions(
    <button type="button" className="button secondary" onClick={() => openSupportRef.current()}>{t("Request an integration")}</button>,
    [language]
  );

  if (managing) {
    return (
      <div className="settings-card-stack">
        <nav className="integrations-crumb">
          <button type="button" onClick={() => setManaging("")}>{t("Integrations")}</button>
          <span aria-hidden="true">/</span>
          <strong>{INTEGRATION_PROVIDERS.find((p) => p.manage === managing && p.kind !== "planned")?.name ?? t("Setup")}</strong>
        </nav>
        {managing === "shopify" ? <ShopifyIntegrationSection workspace={workspace} language={language} /> : null}
        {managing === "etsy" ? <EtsyIntegrationSection workspace={workspace} language={language} /> : null}
        {managing === "woocommerce" ? <WooCommerceIntegrationSection workspace={workspace} language={language} /> : null}
        {managing === "square" ? <SquareIntegrationSection workspace={workspace} language={language} /> : null}
        {managing === "paypal" ? <PayPalIntegrationSection workspace={workspace} language={language} /> : null}
        {managing === "quickbooks" ? <QuickBooksIntegrationSection workspace={workspace} language={language} /> : null}
        {managing === "inbound" ? <InboundWebhookSection workspace={workspace} language={language} /> : null}
      </div>
    );
  }

  const connected = resolved.filter((row) => row.live.state === "connected").length;
  const attention = resolved.filter((row) => row.live.state === "attention").length;
  const needle = query.trim().toLowerCase();
  const matches = (row: (typeof resolved)[number]) => {
    if (needle && !row.provider.name.toLowerCase().includes(needle)) return false;
    if (filter === "connected") return row.live.state === "connected" || row.live.state === "attention";
    if (filter === "available") return row.live.state === "available" || row.live.state === "webhook";
    if (filter === "planned") return row.live.state === "planned";
    return true;
  };
  const shown = resolved.filter(matches);
  // The Getting started card sends people here to connect a shop. Leading with
  // the two platforms NivaDesk talks to itself is the whole point of the link.
  const shopFirst = intent === "connect-shop";
  const highlighted = new Set(shopFirst ? ["shopify", "woocommerce"] : []);

  // Grouped by what the owner can do with each one, not by which shelf the
  // provider sits on: connected first, then what is ready to connect, and the
  // ones that do not exist yet as a compact row.
  const inCategory = (row: (typeof resolved)[number]) => !category || shopFirst || row.provider.category === category;
  const groups = [
    { id: "connected", title: "Connected", rows: shown.filter(row => inCategory(row) && (row.live.state === "connected" || row.live.state === "attention")) },
    { id: "available", title: "Ready to connect", rows: shown.filter(row => inCategory(row) && (row.live.state === "available" || row.live.state === "webhook")) }
  ];
  const planned = shown.filter(row => inCategory(row) && row.live.state === "planned");
  const categoryTitle = (id: string) => INTEGRATION_CATEGORIES.find(group => group.id === id)?.title ?? "";
  const orderRows = (rows: typeof resolved) => shopFirst
    ? [...rows].sort((a, b) => Number(highlighted.has(b.provider.id)) - Number(highlighted.has(a.provider.id)))
    : rows;

  return (
    <div className="settings-card-stack settings-integrations-page">
      {shopFirst ? (
        <Link className="integrations-intent" href="/home">
          <span className="integrations-intent-mark" aria-hidden="true">
            <SettingsSectionIcon icon="cart" />
          </span>
          <span>
            <em>{t("Getting started")}</em>
            <strong>{t("Connect your shop")}</strong>
            <small>{t("Choose where you sell. Orders and customers will import automatically.")}</small>
          </span>
          <span className="integrations-intent-back">{t("Back to checklist")} →</span>
        </Link>
      ) : null}

      <div className="settings-integrations-toolbar">
        <label className="settings-search settings-integrations-search">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="9" cy="9" r="5.5" /><path d="m13.5 13.5 3 3" /></svg>
          <span className="sr-only">{t("Search integrations...")}</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Search integrations...")} />
        </label>
        <div className="settings-segmented is-compact" role="group" aria-label={t("Integrations")}>
          {([["all", "All"], ["connected", "Connected"], ["available", "Available"], ["planned", "Coming soon"]] as const)
            .map(([id, label]) => (
              <button key={id} type="button" aria-pressed={filter === id} className={filter === id ? "active" : ""} onClick={() => setFilter(id)}>{t(label)}</button>
            ))}
        </div>
        <p className="settings-integrations-count">
          {/* Only once the reads have landed: "0 connected" while they are in
              flight is a statement about the network, not the workspace. */}
          {loaded ? (
            <>
              <span className="settings-dot-status">{t("{count} connected").replace("{count}", String(connected))}</span>
              {attention > 0 ? <span className="settings-dot-status is-offline">{t("{count} needs attention").replace("{count}", String(attention))}</span> : null}
            </>
          ) : <span className="settings-field-hint">{t("Loading...")}</span>}
        </p>
      </div>

      {groups.map(group => group.rows.length === 0 ? null : (
        <section key={group.id} className="card app-card">
          <SettingsCardHead title={t(group.title)} aside={<span className="settings-tag is-muted">{group.rows.length}</span>} />
          <div className="integrations-grid settings-integrations-grid">
            {orderRows(group.rows).map(({ provider, live }) => (
              <IntegrationCard key={provider.id} provider={provider} live={live} t={t}
                               highlighted={highlighted.has(provider.id)}
                               categoryLabel={t(categoryTitle(provider.category))}
                               onManage={() => setManaging(provider.manage)} />
            ))}
          </div>
        </section>
      ))}

      {planned.length > 0 ? (
        <section className="card app-card">
          <SettingsCardHead title={t("Coming soon")} subtitle={t("Not connectable yet. Ask for one and we will tell you when it lands.")} />
          <div className="settings-chip-row">
            {planned.map(({ provider }) => (
              <span className="settings-chip settings-integration-chip" key={provider.id}>
                {provider.logo ? <img src={provider.logo} alt="" width={16} height={16} /> : null}
                {provider.name}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {shown.length === 0 ? (
        <section className="card app-card">
          <p className="settings-empty-line">{t("Nothing here yet.")}</p>
        </section>
      ) : null}
    </div>
  );
}

function IntegrationCard({
  provider, live, t, highlighted, onManage, categoryLabel,
}: {
  provider: IntegrationProvider;
  live: IntegrationLiveState;
  t: (text: string) => string;
  highlighted: boolean;
  onManage: () => void;
  categoryLabel?: string;
}) {
  const label = INTEGRATION_STATE_LABELS[live.state];
  return (
    <article className={`integration-card is-${live.state}${highlighted ? " is-highlighted" : ""}`}>
      <div className="integration-card-head">
        {/* The brand's own file where we have one we are allowed to use, and its
            initial where we do not — never a drawing of someone's logo. */}
        <span className="integration-logo" aria-hidden="true">
          {provider.logo
            ? <img src={provider.logo} alt="" width={28} height={28} />
            : <b>{provider.mark ?? provider.name.slice(0, 1)}</b>}
        </span>
        <div>
          <strong>{provider.name}</strong>
          <span className={`integration-state is-${live.state}`}>{t(label)}</span>
        </div>
        {categoryLabel ? <span className="settings-tag is-muted integration-category">{categoryLabel}</span> : null}
      </div>
      {/* A card for something that does not exist yet is the name and the word
          "Coming soon", once. A blurb and a second "Coming soon" under it were
          the same sentence three times. */}
      {live.state === "planned" ? null : (
        <>
          {live.detail ? <p className="integration-detail">{live.detail}</p> : null}
          <p className="integration-blurb">{t(provider.blurb)}</p>
          {provider.capabilities.length > 0 ? (
            <ul className="integration-caps">
              {provider.capabilities.map((cap) => <li key={cap}>{t(cap)}</li>)}
            </ul>
          ) : null}
          {provider.manage ? (
            <button type="button" className="button secondary" onClick={onManage}>
              {t(live.state === "connected" || live.state === "attention" ? "Manage" : "Set up")}
            </button>
          ) : provider.id === "openbanking" ? (
            <Link className="button secondary" href="/bank">
              {t(live.state === "connected" ? "Manage" : "Set up")}
            </Link>
          ) : null}
        </>
      )}
    </article>
  );
}

type ShopifyStoreView = {
  shop: string;
  shopName: string;
  status: string;
  linkedEmail: string;
  stats: {
    syncedOrders: number;
    failedCount: number;
    lastSyncAt?: { _seconds?: number } | null;
    lastWebhookAt?: { _seconds?: number } | null;
  };
  /** Last nine sync-log rows, newest first — including failures. */
  recentSync?: Array<{ atMs: number; topic: string; status: string; error: string; shopifyOrderNumber: string }>;
};

function shopifyTsText(value: unknown): string {
  const seconds =
    value && typeof value === "object" && "_seconds" in (value as Record<string, unknown>)
      ? Number((value as { _seconds?: unknown })._seconds)
      : 0;
  if (!seconds || Number.isNaN(seconds)) return "—";
  return new Date(seconds * 1000).toLocaleString();
}

// Stores linked through the official Shopify App Store app (the manual webhook
// cards below remain as the advanced/legacy path).
function ShopifyConnectedStoresCard({ workspace, language = "English" }: { workspace: WorkspaceContext; language?: string }) {
  const t = (text: string) => studioT(text, language);
  const isOwner = workspace.role === "owner";
  const [stores, setStores] = useState<ShopifyStoreView[] | null>(null);
  const [error, setError] = useState("");
  const [busyShop, setBusyShop] = useState("");

  const loadStores = useCallback(async () => {
    try {
      const callable = httpsCallable<{ companyId: string }, { stores: ShopifyStoreView[] }>(
        functions,
        "getShopifyIntegrationsForWorkspace"
      );
      const result = await callable({ companyId: workspace.id });
      setStores(result.data?.stores ?? []);
      setError("");
    } catch (err) {
      setStores([]);
      setError(err instanceof Error ? err.message : "Could not load connected stores.");
    }
  }, [workspace.id]);

  useEffect(() => {
    void loadStores();
  }, [loadStores]);

  async function setStoreState(shop: string, state: "active" | "paused" | "unlinked") {
    if (
      state === "unlinked" &&
      !window.confirm(t("Remove this store connection? New orders stop arriving. Orders already synced stay in your workspace. To reconnect, install the NivaDesk app from the Shopify App Store again."))
    ) {
      return;
    }
    if (
      state === "paused" &&
      !window.confirm(t("Pause this store? Orders placed while paused are NOT delivered later — syncing resumes only for new orders after you press Resume."))
    ) {
      return;
    }
    setBusyShop(shop);
    setError("");
    try {
      const callable = httpsCallable(functions, "setShopifyIntegrationState");
      await callable({ companyId: workspace.id, shop, state });
      await loadStores();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setBusyShop("");
    }
  }

  return (
    <section className="card app-card">
      <CardTitle icon="orders" eyebrow={t("Shopify App")} title={t("Connected Shopify stores")} />
      <p className="muted-copy">
        {t("Stores connected through the official NivaDesk app on the Shopify App Store. Orders, customers and status updates sync automatically.")}
      </p>
      {stores === null ? (
        <p className="muted-copy">{t("Loading…")}</p>
      ) : stores.length === 0 ? (
        <p className="muted-copy">
          {t("No stores connected yet. Install “NivaDesk – Custom Order Management” from the Shopify App Store, then press Connect inside the app.")}
        </p>
      ) : (
        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          {stores.map(store => {
            const handle = store.shop.replace(/\.myshopify\.com$/, "");
            const paused = store.status === "paused";
            const uninstalled = store.status === "uninstalled";
            const busy = busyShop === store.shop;
            return (
              <div
                key={store.shop}
                style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px" }}
              >
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                  <strong>{store.shopName || handle}</strong>
                  <span className="muted-copy" style={{ fontSize: 12 }}>{store.shop}</span>
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: 11,
                      fontWeight: 800,
                      padding: "3px 9px",
                      borderRadius: 999,
                      background: uninstalled
                        ? "rgba(220, 38, 38, 0.1)"
                        : paused
                          ? "rgba(234, 138, 0, 0.12)"
                          : "rgba(22, 163, 74, 0.12)",
                      color: uninstalled ? "#b91c1c" : paused ? "#b45309" : "#15803d"
                    }}
                  >
                    {t(uninstalled ? "Uninstalled" : paused ? "Paused" : "Active")}
                  </span>
                </div>
                <p className="muted-copy" style={{ fontSize: 12.5, margin: "6px 0 10px" }}>
                  {store.stats.syncedOrders} {t("orders synced")} · {store.stats.failedCount} {t("failed")} ·{" "}
                  {t("Last sync")}: {shopifyTsText(store.stats.lastSyncAt)}
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                  <a
                    className="button"
                    style={{ padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700 }}
                    href={`https://admin.shopify.com/store/${handle}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("Open Shopify admin")}
                  </a>
                  {!uninstalled ? (
                    <button
                      type="button"
                      className="button"
                      style={{ padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700 }}
                      disabled={!isOwner || busy}
                      onClick={() => setStoreState(store.shop, paused ? "active" : "paused")}
                    >
                      {t(paused ? "Resume" : "Pause")}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="button"
                    style={{ padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, color: "#b91c1c" }}
                    disabled={!isOwner || busy}
                    onClick={() => setStoreState(store.shop, "unlinked")}
                  >
                    {t("Remove")}
                  </button>
                </div>
                {(store.recentSync || []).length > 0 ? (
                  <details style={{ marginTop: 6 }}>
                    <summary className="muted-copy" style={{ cursor: "pointer", fontSize: 11.5 }}>
                      {t("Recent sync activity")} ({(store.recentSync || []).length})
                    </summary>
                    <ul className="muted-copy" style={{ margin: "6px 0 0", paddingLeft: 18, display: "grid", gap: 3, fontSize: 11.5 }}>
                      {(store.recentSync || []).map((row, index) => (
                        <li key={`${row.atMs}-${index}`}>
                          {row.atMs > 0 ? new Date(row.atMs).toLocaleString() : "—"}
                          {" — "}
                          {row.topic || t("event")} · {row.status}
                          {row.shopifyOrderNumber ? ` · #${row.shopifyOrderNumber}` : ""}
                          {row.error ? ` · ${row.error}` : ""}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
                {!isOwner ? (
                  <p className="muted-copy" style={{ fontSize: 11.5, marginTop: 6 }}>
                    {t("Only the workspace owner can change this connection.")}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      {error ? <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 8 }}>{t(error)}</p> : null}
    </section>
  );
}

function ShopifyIntegrationSection({ workspace, language = "English" }: { workspace: WorkspaceContext; language?: string }) {
  // SHOP-001: the manual-webhook cards that used to sit under these are gone —
  // Shopify connects through the official app, and the stores card says how.
  return (
    <div className="settings-card-stack">
      <ShopifyConnectedStoresCard workspace={workspace} language={language} />
      <IntegrationCustomerSyncCard workspace={workspace} language={language} />
      <CommerceSyncHealthCard workspace={workspace} language={language} provider="shopify" />
    </div>
  );
}

function InboundWebhookSection({ workspace, language = "English" }: { workspace: WorkspaceContext; language?: string }) {
  const t = (text: string) => studioT(text, language);
  const [copyStatus, setCopyStatus] = useState("");
  const companyId = workspace.id.trim();
  const [deliveryUrl, setDeliveryUrl] = useState("");
  const [deliveryUrlLoading, setDeliveryUrlLoading] = useState(false);
  const [webhookInfo, setWebhookInfo] = useState<IntegrationWebhookInfo | null>(null);
  const [rotating, setRotating] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [webhookTest, setWebhookTest] = useState<InboundWebhookTestResult | null>(null);
  const [payloadDraft, setPayloadDraft] = useState("");
  const [checkingPayload, setCheckingPayload] = useState(false);
  const [payloadCheck, setPayloadCheck] = useState<InboundPayloadCheck | null>(null);

  async function runWebhookTest() {
    setTestingWebhook(true);
    setWebhookTest(null);
    try {
      setWebhookTest(await sendTestInboundWebhook(companyId));
    } catch (testError) {
      setWebhookTest({ ok: false, message: testError instanceof Error ? testError.message : t("The test could not be sent.") });
    } finally {
      setTestingWebhook(false);
    }
  }

  async function runPayloadCheck() {
    setCheckingPayload(true);
    setPayloadCheck(null);
    try {
      setPayloadCheck(await validateInboundOrderPayload(companyId, payloadDraft));
    } catch (checkError) {
      setPayloadCheck({ ok: false, parseError: checkError instanceof Error ? checkError.message : t("The payload could not be checked."), warnings: [] });
    } finally {
      setCheckingPayload(false);
    }
  }
  useEffect(() => {
    if (!companyId) {
      setDeliveryUrl("");
      return;
    }
    let active = true;
    setDeliveryUrlLoading(true);
    getIntegrationWebhookInfo("inbound", companyId)
      .then((next) => {
        if (!active) return;
        setWebhookInfo(next);
        setDeliveryUrl(next.deliveryUrl);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setDeliveryUrlLoading(false);
      });
    return () => {
      active = false;
    };
  }, [companyId]);

  async function replaceDeliveryUrl() {
    if (!companyId) return;
    setRotating(true);
    try {
      const next = await rotateIntegrationWebhookToken("inbound", companyId);
      setWebhookInfo(next);
      setDeliveryUrl(next.deliveryUrl);
      setCopyStatus(t("Webhook URL replaced. Paste the new one into your shop."));
    } catch (rotateError) {
      setCopyStatus(rotateError instanceof Error ? rotateError.message : t("The URL could not be replaced."));
    } finally {
      setRotating(false);
      setConfirmRotate(false);
    }
  }

  async function copyText(value: string, label: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus(`${label} ${t("copied.")}`);
    } catch {
      setCopyStatus(t("Copy failed. Select the value and copy it manually."));
    }
    window.setTimeout(() => setCopyStatus(""), 1600);
  }

  return (
    <div className="settings-card-stack">
      <section className="card app-card quick-reply-settings-card">
        <CardTitle icon="orders" eyebrow={t("Other Platforms")} title={t("Connect any store with one webhook")} />
        <div className="quick-reply-settings-info">
          <strong>{t("Orders from almost any platform can flow into this workspace.")}</strong>
          <p>{t("Use Zapier, Make or your own site to POST each new order to the Delivery URL below. It works with Wix, Squarespace, Etsy, BigCommerce, custom sites and more. Orders appear in Orders and Schedule automatically.")}</p>
        </div>
        {!companyId ? (
          <p className="layout-error">{t("Company ID is not available yet. Sign in or reconnect your workspace first.")}</p>
        ) : null}
      </section>

      <section className="card app-card quick-reply-settings-card">
        <CardTitle icon="docText" eyebrow={t("Copy Setup Details")} title={t("Webhook values")} />
        <CopyableIntegrationValue
          title={t("Your Company ID")}
          value={companyId || t("Unavailable")}
          buttonTitle={t("Copy Company ID")}
          canCopy={Boolean(companyId)}
          onCopy={() => copyText(companyId, t("Company ID"))}
        />
        <SecretDeliveryUrl
          title={t("Delivery URL with Company ID")}
          url={deliveryUrl}
          loading={deliveryUrlLoading}
          info={webhookInfo}
          canManage={canEditWorkspaceSettingsForRole(workspace.role)}
          rotating={rotating}
          onCopy={() => copyText(deliveryUrl, t("Delivery URL"))}
          onRotate={() => setConfirmRotate(true)}
          t={t}
          language={language}
        />
        {confirmRotate ? (
          <SettingsDialog
            eyebrow={t("Replace URL")}
            title={t("Replace this webhook URL?")}
            onDismiss={() => setConfirmRotate(false)}
            actions={[
              { label: t("Replace URL"), tone: "danger" as const, disabled: rotating, onClick: () => { void replaceDeliveryUrl(); } },
              { label: t("Cancel"), tone: "secondary" as const, disabled: rotating, onClick: () => setConfirmRotate(false) }
            ]}
          >
            <p>{t("The current URL stops working straight away. Orders will not arrive until you paste the new URL into your shop.")}</p>
          </SettingsDialog>
        ) : null}
        {copyStatus ? <p className="success-copy">{t(copyStatus)}</p> : null}
      </section>

      <section className="card app-card quick-reply-settings-card">
        <CardTitle icon="checklist" eyebrow={t("What you need to do")} title={t("Connection steps")} />
        <div className="settings-rule-list">
          <IntegrationInfoRow number="1" title={t("Pick a connection method")} detail={t("Most platforms connect through Zapier or Make (a 'Webhooks → POST' action). Developers can also POST directly from their own site.")} />
          <IntegrationInfoRow number="2" title={t("Send the order as JSON")} detail={t("POST a JSON body to the Delivery URL on each new order. At minimum include orderId. Common fields: orderId, orderNumber, customerName, email, phone, total, currency, products, note, source.")} />
          <IntegrationInfoRow number="3" title={t("Order appears automatically")} detail={t("Each posted order is added to Orders and Schedule, tagged with the source you send.")} />
        </div>
        {/* The old example taught products as a string, which is exactly the
            shape that produces no itemised invoice, and showed currency as if it
            changed anything. */}
        <pre style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, padding: 12, overflowX: "auto", fontSize: 12, lineHeight: 1.5, margin: "10px 0 0", color: "var(--text)" }}>{`{
  "schemaVersion": 1,
  "orderId": "1001",
  "customerName": "Jane Doe",
  "email": "jane@example.com",
  "total": 120.50,
  "status": "paid",
  "products": [
    { "name": "Custom dial", "quantity": 1, "unitPrice": 120.50 }
  ],
  "shippingCost": 4.99,
  "source": "Wix"
}`}</pre>
        <p className="muted-copy">{t("Send total as a plain number. A status of cancelled, refunded, voided or failed means the order is not created. An order in another currency keeps its own currency — NivaDesk never converts it silently, and the dashboard lists it unconverted.")}</p>
        <p className="muted-copy">{t("Redelivery is safe: orderId is the identity, so sending the same order again updates it instead of creating a copy — production status and tracking are never overwritten. There is no automatic retry on our side; if your tool retries, that is fine for the same reason.")}</p>
        <p className="muted-copy">{t("Amounts are rounded to 2 decimal places; both 1,234.56 and 1.234,56 styles are read correctly. schemaVersion says which payload format this is — today it is 1, and future formats will keep 1 working.")}</p>
        <p className="muted-copy">{t("Authentication is the secret token inside the Delivery URL — there is no separate signature header. Treat the URL like a password and replace it if it leaks.")}</p>

        <div className="settings-action-row">
          <button className="button secondary" type="button" disabled={testingWebhook || !companyId} onClick={() => { void runWebhookTest(); }}>
            {testingWebhook ? t("Testing...") : t("Send test webhook")}
          </button>
        </div>
        {webhookTest ? (
          <p className={webhookTest.ok ? "success-copy" : "layout-error"}>
            {webhookTest.message}{" "}
            {webhookTest.ok ? t("This proves the URL, workspace and token. It does not prove your own tool is pointed at it.") : ""}
          </p>
        ) : null}

        {/* The £0-order class of bug is a payload problem, not a reachability
            problem, so checking a payload is a separate box from pressing the URL. */}
        <label className="quick-reply-settings-label">
          <span>{t("Check a payload before you wire it up")}</span>
          <textarea
            className="input"
            rows={5}
            value={payloadDraft}
            placeholder={'{ "orderId": "1001", "total": 120.50 }'}
            onChange={event => setPayloadDraft(event.target.value)}
          />
        </label>
        <div className="settings-action-row">
          <button className="button secondary" type="button" disabled={checkingPayload || !payloadDraft.trim()} onClick={() => { void runPayloadCheck(); }}>
            {checkingPayload ? t("Checking...") : t("Check this payload")}
          </button>
        </div>
        {payloadCheck ? (
          <div className="settings-dialog-body">
            {payloadCheck.parseError ? <p className="layout-error">{payloadCheck.parseError}</p> : null}
            {payloadCheck.reads ? (
              <div className="settings-impact-grid">
                <span>{t("Customer")}</span><strong>{payloadCheck.reads.customerName}</strong>
                <span>{t("Total")}</span><strong>{payloadCheck.reads.total}</strong>
                <span>{t("Invoice lines")}</span><strong>{payloadCheck.reads.lineItemCount}</strong>
              </div>
            ) : null}
            {(payloadCheck.warnings ?? []).map(warning => (
              <p className="layout-error" key={t(warning)}>{t(warning)}</p>
            ))}
            {payloadCheck.ok ? <p className="success-copy">{t("This payload reads cleanly.")}</p> : null}
          </div>
        ) : null}
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

// A delivery URL carries a token that creates orders. It used to sit on screen
// in plain text on every platform, so a screen share or a support screenshot
// handed it away. Masked by default, revealed briefly on request, and copied
// without ever being shown.
function maskDeliveryUrl(url: string) {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    const token = parsed.searchParams.get("token");
    if (!token) return url;
    parsed.searchParams.set("token", `${token.slice(0, 4)}${"•".repeat(24)}`);
    return decodeURIComponent(parsed.toString());
  } catch {
    return url.replace(/token=[^&]+/i, `token=${"•".repeat(24)}`);
  }
}

const REVEAL_SECONDS = 30;

function SecretDeliveryUrl({
  title,
  url,
  loading,
  info,
  canManage,
  rotating,
  onCopy,
  onRotate,
  t,
  language
}: {
  title: string;
  url: string;
  loading: boolean;
  info: IntegrationWebhookInfo | null;
  canManage: boolean;
  rotating: boolean;
  onCopy: () => void;
  onRotate: () => void;
  t: (text: string) => string;
  language: string;
}) {
  const [revealedUntil, setRevealedUntil] = useState(0);
  const revealed = revealedUntil > 0;

  useEffect(() => {
    if (!revealedUntil) return;
    const timer = window.setTimeout(() => setRevealedUntil(0), REVEAL_SECONDS * 1000);
    return () => window.clearTimeout(timer);
  }, [revealedUntil]);

  // A rotated URL must never stay on screen from the previous token.
  useEffect(() => { setRevealedUntil(0); }, [url]);

  const shown = url
    ? (revealed ? url : maskDeliveryUrl(url))
    : (loading ? t("Loading…") : t("Unavailable"));

  const deliveryDate = info && info.lastDeliveryAtMs > 0 ? new Date(info.lastDeliveryAtMs) : null;

  return (
    <div className="copyable-integration-value">
      <div>
        <strong>{title}</strong>
        <div className="integration-secret-actions">
          <button className="button secondary" type="button" disabled={!url} onClick={onCopy}>
            {t("Copy Delivery URL")}
          </button>
          <button
            className="button secondary"
            type="button"
            disabled={!url}
            onClick={() => setRevealedUntil(revealed ? 0 : Date.now() + REVEAL_SECONDS * 1000)}
          >
            {revealed ? t("Hide") : t("Reveal for 30 seconds")}
          </button>
          {canManage ? (
            <button className="button secondary" type="button" disabled={!url || rotating} onClick={onRotate}>
              {rotating ? t("Replacing...") : t("Replace URL")}
            </button>
          ) : null}
        </div>
      </div>
      <code>{shown}</code>
      {info ? (
        <p className="muted-copy integration-secret-status">
          {deliveryDate
            ? `${info.lastDeliveryOk ? (info.lastDeliveryWasTest ? t("Last test") : t("Last order received")) : t("Last delivery failed")}: ${deliveryDate.toLocaleString(studioLocaleTag(language))}${info.lastDeliveryOk ? "" : ` — ${info.lastDeliveryError}`}`
            : t("No delivery received yet.")}
        </p>
      ) : null}
      {info && info.recentDeliveries.length > 0 ? (
        <details className="integration-secret-status">
          <summary className="muted-copy" style={{ cursor: "pointer" }}>
            {t("Recent deliveries")} ({info.recentDeliveries.length})
          </summary>
          <ul className="muted-copy" style={{ margin: "6px 0 0", paddingLeft: 18, display: "grid", gap: 3 }}>
            {info.recentDeliveries.map((entry, index) => (
              <li key={`${entry.atMs}-${index}`}>
                {new Date(entry.atMs).toLocaleString(studioLocaleTag(language))}
                {" — "}
                {entry.ok ? (entry.test ? t("test") : t("delivered")) : `${t("failed")}: ${entry.error}`}
                {entry.orderId ? ` · ${t("order")} ${entry.orderId}` : ""}
                {entry.source ? ` · ${entry.source}` : ""}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
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

// Raw settings keys read like code; the history reads like a sentence. A few
// keys carry names of their own, the rest just get their camelCase unfolded.
const AUDIT_KEY_LABELS: Record<string, string> = {
  hasOpenAIKey: "OpenAI key",
  openAIKeyRotatedAtMs: "OpenAI key replaced",
  aiKnowledgeBase: "Company Knowledge Base"
};

function humanizeSettingsKey(key: string) {
  if (AUDIT_KEY_LABELS[key]) return AUDIT_KEY_LABELS[key];
  return key
    .replace(/JSON$/, "")
    .replace(/^__/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, first => first.toUpperCase())
    .replace(/^Pdf /, "PDF ")
    .replace(/^Ai /, "AI ");
}

function DataManagementSection({
  workspace,
  counts,
  settings,
  userEmail,
  onImported,
  language = "English"
}: {
  workspace: WorkspaceContext;
  counts: DashboardCounts | null;
  settings: WorkspaceSettingsOverview | null;
  userEmail: string;
  onImported: () => Promise<void>;
  language?: string;
}) {
  const t = (text: string) => studioT(text, language);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [exporting, setExporting] = useState<"backup" | "webBackup" | "orders" | "customers" | "">("");
  const [importing, setImporting] = useState(false);
  const [pendingImport, setPendingImport] = useState<{ backup: unknown; preview: ImportBackupPreview; matchesLastBackup: boolean; hasBackupHash: boolean } | null>(null);
  const [skipDuplicatesChoice, setSkipDuplicatesChoice] = useState(true);
  const [lastImportRunId, setLastImportRunId] = useState("");
  const [undoingImport, setUndoingImport] = useState(false);
  const [lastBackupAtMs, setLastBackupAtMs] = useState(settings?.lastBackupExportedAtMs ?? 0);
  const [lastBackupHash, setLastBackupHash] = useState(settings?.lastBackupExportedHash ?? "");
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const exportAllowed = workspace.entitlements.features.export_data;
  const canImport = canEditWorkspaceSettingsForRole(workspace.role);
  const canDelete = canDeleteWorkspaceDataForRole(workspace.role);
  const isWorkspaceOwner = normalizeWorkspaceRole(workspace.role) === "owner";
  const [auditEntries, setAuditEntries] = useState<SettingsAuditEntry[] | null>(null);
  const [auditEnabled, setAuditEnabled] = useState(true);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState("");

  async function loadAuditLog() {
    setAuditLoading(true);
    setAuditError("");
    try {
      const result = await getSettingsAuditLog(workspace);
      setAuditEnabled(result.enabled);
      setAuditEntries(result.entries);
    } catch (loadError) {
      setAuditError(loadError instanceof Error ? loadError.message : t("The change history could not be loaded."));
    } finally {
      setAuditLoading(false);
    }
  }

  async function sha256Hex(text: string) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  async function runExport(kind: "backup" | "webBackup" | "orders" | "customers") {
    if (!exportAllowed) {
      setError(t("Export is not available for this workspace."));
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
        const text = appCompatibleBackupJson(exportData);
        downloadTextFile(`StudioManager_Backup_${date}.json`, text, "application/json");
        const hash = await sha256Hex(text);
        setLastBackupHash(hash);
        setStatus(`App-compatible backup downloaded. SHA-256 ${hash.slice(0, 12)}…`);
        await recordWorkspaceBackupExport(workspace, hash).catch(() => undefined);
        setLastBackupAtMs(Date.now());
      } else if (kind === "webBackup") {
        const text = fullBackupJson(exportData, userEmail);
        downloadTextFile(`${prefix}-web-backup-${date}.json`, text, "application/json");
        const hash = await sha256Hex(text);
        setLastBackupHash(hash);
        setStatus(`Web JSON backup downloaded. SHA-256 ${hash.slice(0, 12)}…`);
        await recordWorkspaceBackupExport(workspace, hash).catch(() => undefined);
        setLastBackupAtMs(Date.now());
      } else if (kind === "orders") {
        downloadTextFile(`${prefix}-orders-${date}.csv`, ordersToCsv(exportData.orders), "text/csv");
        setStatus("Orders CSV downloaded.");
      } else {
        downloadTextFile(`${prefix}-customers-${date}.csv`, customersToCsv(exportData.customers), "text/csv");
        setStatus("Customers CSV downloaded.");
      }
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : t("Export could not be prepared."));
    } finally {
      setExporting("");
    }
  }

  // Picking a file used to import it on the spot. Import is append-only and
  // mints new records every time, so the second run of the same file silently
  // doubled the workspace.
  async function handleImportFile(file: File | undefined) {
    if (!file) return;
    setImporting(true);
    setStatus("");
    setError("");
    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error(t("That file could not be read as JSON. Choose a NivaDesk backup file ending in .json."));
      }
      // The hash noted at download time turns "is this the right file?" from a
      // guess into an answer — a mismatch is still importable, just called out.
      const fileHash = await sha256Hex(text);
      const preview = await previewWorkspaceBackupImport(workspace, parsed);
      // Skipping is the safe default; someone who wants deliberate copies unticks it.
      setSkipDuplicatesChoice(true);
      setPendingImport({
        backup: parsed,
        preview,
        matchesLastBackup: Boolean(lastBackupHash) && fileHash === lastBackupHash,
        hasBackupHash: Boolean(lastBackupHash)
      });
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : t("Import could not be completed."));
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  async function applyPendingImport() {
    if (!pendingImport) return;
    const backup = pendingImport.backup;
    const preview = pendingImport.preview;
    const hasDuplicates = preview.likelyDuplicateOrders > 0 || preview.likelyDuplicateCustomers > 0;
    setPendingImport(null);
    setImporting(true);
    setStatus("");
    setError("");
    try {
      const result = await importWorkspaceBackup(workspace, backup, {
        skipDuplicates: hasDuplicates && skipDuplicatesChoice
      });
      await onImported();
      setLastImportRunId(result.undoAvailable && result.runId ? result.runId : "");
      setStatus(result.message || "Import finished.");
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : t("Import could not be completed."));
    } finally {
      setImporting(false);
    }
  }

  async function handleUndoImport() {
    if (!lastImportRunId) return;
    setUndoingImport(true);
    setError("");
    try {
      const result = await undoWorkspaceBackupImport(workspace, lastImportRunId);
      setLastImportRunId("");
      await onImported();
      setStatus(result.message || t("Import undone."));
    } catch (undoError) {
      setError(undoError instanceof Error ? undoError.message : t("Import could not be undone."));
    } finally {
      setUndoingImport(false);
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
      setError(deleteError instanceof Error ? deleteError.message : t("Workspace data could not be deleted."));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="settings-card-stack">
      {pendingImport ? (
        <SettingsDialog
          wide
          eyebrow={t("Import Backup")}
          title={t("Import this backup?")}
          onDismiss={() => setPendingImport(null)}
          actions={[
            { label: t("Import"), tone: "primary" as const, onClick: () => { void applyPendingImport(); } },
            { label: t("Cancel"), tone: "secondary" as const, onClick: () => setPendingImport(null) }
          ]}
        >
          <div className="settings-impact-grid">
            <span>{t("Orders in this file")}</span>
            <strong>{pendingImport.preview.fileOrders}</strong>
            <span>{t("Customers in this file")}</span>
            <strong>{pendingImport.preview.fileCustomers}</strong>
            <span>{t("Orders already in this workspace")}</span>
            <strong>{pendingImport.preview.existingOrders}</strong>
            <span>{t("Customers already in this workspace")}</span>
            <strong>{pendingImport.preview.existingCustomers}</strong>
            <span>{t("Look like they are already here")}</span>
            <strong>{pendingImport.preview.likelyDuplicateOrders + pendingImport.preview.likelyDuplicateCustomers}</strong>
            <span>{t("Includes settings")}</span>
            <strong>{pendingImport.preview.importsSettings ? t("Yes") : t("No")}</strong>
          </div>
          {pendingImport.matchesLastBackup ? (
            <p className="success-copy">{t("This file matches your last downloaded backup exactly.")}</p>
          ) : pendingImport.hasBackupHash ? (
            <p className="muted-copy">{t("Not the file from your last download — that is fine if this is an older backup or one from another device.")}</p>
          ) : null}
          <p>{t("Import adds records — it never replaces or clears anything. Client Files are not included in a backup.")}</p>
          {(pendingImport.preview.unsupportedCustomers ?? 0) > 0 ? (
            <p className="layout-error">
              {t("Rows that could not be read as records:")} {pendingImport.preview.unsupportedCustomers}
            </p>
          ) : null}
          {pendingImport.preview.likelyDuplicateOrders > 0 || pendingImport.preview.likelyDuplicateCustomers > 0 ? (
            <>
              <label className="settings-toggle-row">
                <span>
                  <strong>{t("Skip likely duplicates")}</strong>
                  <small>{t("Records matching ones already in this workspace are left out of the import.")}</small>
                </span>
                <input
                  type="checkbox"
                  checked={skipDuplicatesChoice}
                  onChange={event => setSkipDuplicatesChoice(event.target.checked)}
                />
              </label>
              {!skipDuplicatesChoice ? (
                <p className="layout-error">
                  {t("Some of these look like records you already have. Importing anyway will create a second copy of each.")}
                </p>
              ) : null}
            </>
          ) : null}
          {pendingImport.preview.truncated ? (
            <>
              <p className="layout-error">{t("One import is capped at 500 records. The rest will not be imported.")}</p>
              <div className="settings-impact-grid">
                <span>{t("Orders that will not be imported")}</span>
                <strong>{pendingImport.preview.droppedOrders}</strong>
                <span>{t("Customers that will not be imported")}</span>
                <strong>{pendingImport.preview.droppedCustomers}</strong>
              </div>
            </>
          ) : null}
        </SettingsDialog>
      ) : null}
      <div className="settings-fact-cards">
        <div className="settings-fact-card">
          <span className="settings-fact-card-copy">
            <small>{t("Orders")}</small>
            <strong>{counts?.orderCount ?? 0}</strong>
          </span>
        </div>
        <div className="settings-fact-card">
          <span className="settings-fact-card-copy">
            <small>{t("Customers")}</small>
            <strong>{counts?.customerCount ?? 0}</strong>
          </span>
        </div>
        <div className={lastBackupAtMs > 0 ? "settings-fact-card" : "settings-fact-card is-caution"}>
          <span className="settings-fact-card-copy">
            <small>{t("Last backup")}</small>
            <strong>{lastBackupAtMs > 0 ? new Date(lastBackupAtMs).toLocaleDateString(studioLocaleTag(language)) : t("Never")}</strong>
            {lastBackupAtMs > 0 ? null : <em>{t("Create your first backup")}</em>}
          </span>
        </div>
      </div>

      {status ? <p className="success-copy">{studioT(status, language)}</p> : null}
      {error ? <p className="layout-error">{t(error)}</p> : null}
      {lastImportRunId ? (
        <div className="settings-action-row">
          <button className="button secondary" type="button" disabled={undoingImport} onClick={() => { void handleUndoImport(); }}>
            {undoingImport ? t("Undoing...") : t("Undo this import")}
          </button>
          <span className="settings-field-hint">{t("Removes exactly the records this import created. Settings changes are not undone.")}</span>
        </div>
      ) : null}

      <div className="settings-two-col">
        <section className="card app-card">
          <SettingsCardHead
            title={t("Workspace backup")}
            subtitle={t("Create a portable backup of your settings, orders and customers.")}
            aside={<span className="settings-tag">{t("Restorable")}</span>}
          />
          <div className="settings-button-row">
            <button className="button" type="button" title={t("Restores into NivaDesk on any device.")} disabled={!exportAllowed || Boolean(exporting)} onClick={() => runExport("backup")}>
              {exporting === "backup" ? t("Exporting...") : t("Download backup")}
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={event => void handleImportFile(event.target.files?.[0])}
            />
            <button className="button secondary" type="button" disabled={!canImport || importing} onClick={() => importInputRef.current?.click()}>
              {importing ? t("Importing...") : t("Import Backup")}
            </button>
          </div>
          <ul className="settings-check-list">
            <li>{t("Works across NivaDesk devices")}</li>
            <li>{t("Import is append-only")}</li>
            <li>{t("Uploaded Client Files are not included")}</li>
          </ul>
          <p className="settings-field-hint">{t("You can import app backups and web JSON backups.")}</p>
          {!exportAllowed ? <p className="settings-field-hint is-caution">{t("Export is not available for this workspace.")}</p> : null}
          {!canImport ? <p className="settings-field-hint">{t("Your current workspace role cannot import backup files.")}</p> : null}
        </section>

        <section className="card app-card">
          <SettingsCardHead title={t("Other export formats")} />
          <div className="settings-export-rows">
            {[
              { kind: "webBackup" as const, title: "Full web archive", tag: "Support", detail: t("A raw copy for support and safe keeping. Not for re-import.") },
              { kind: "orders" as const, title: "Orders CSV", tag: "Spreadsheet", detail: `${counts?.orderCount ?? 0} ${t("order records")}. ${t("Cannot be imported back.")}` },
              { kind: "customers" as const, title: "Customers CSV", tag: "Spreadsheet", detail: `${counts?.customerCount ?? 0} ${t("customer records")}. ${t("Cannot be imported back.")}` }
            ].map(row => (
              <div className="settings-export-row" key={row.kind}>
                <span className="settings-card-head-icon" aria-hidden="true"><CardIconGlyph icon="export" /></span>
                <span className="settings-export-row-copy">
                  <strong>{t(row.title)} <span className="settings-tag is-muted">{t(row.tag)}</span></strong>
                  <small>{row.detail}</small>
                </span>
                <button className="button secondary" type="button" disabled={!exportAllowed || Boolean(exporting)} onClick={() => runExport(row.kind)}>
                  {exporting === row.kind ? t("Exporting...") : t("Download")}
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>

      {isWorkspaceOwner ? (
        <section className="card app-card">
          <div className="settings-status-band is-info settings-history-band">
            <span className="settings-status-band-icon" aria-hidden="true"><CardIconGlyph icon="historyClock" /></span>
            <div className="settings-status-band-copy">
              <strong>{t("Change history")} <span className="settings-tag">{t("Last 90 days")}</span></strong>
              <p>{t("Who changed what, and when — workspace settings changes from the last 90 days, recorded from every device.")}</p>
            </div>
            <span className="settings-status-band-side">
              <button className="button secondary" type="button" disabled={auditLoading} onClick={() => { void loadAuditLog(); }}>
                {auditLoading ? t("Loading...") : auditEntries === null ? t("Load history") : t("Refresh")}
              </button>
            </span>
          </div>
          {auditEntries === null ? null : !auditEnabled ? (
            <p className="settings-field-hint">{t("Change history is part of the Pro and Team plans. Changes are already being recorded — upgrade to read them.")}</p>
          ) : auditEntries.length === 0 ? (
            <p className="settings-field-hint">{t("No settings changes recorded yet. New saves appear here within a few seconds.")}</p>
          ) : (
            <div className="settings-audit-list">
              {auditEntries.map(entry => (
                <div className="settings-audit-entry" key={entry.id}>
                  <div className="settings-audit-head">
                    <strong>{entry.byName || t("Workspace member")}</strong>
                    <span>{entry.areas.map(area => t(area)).join(" · ")}</span>
                    <time>{new Date(entry.atMs).toLocaleString(studioLocaleTag(language))}</time>
                  </div>
                  <p className="muted-copy settings-audit-keys">
                    {entry.changedKeys.slice(0, 6).map(humanizeSettingsKey).join(", ")}
                    {entry.changedCount > 6 ? ` +${entry.changedCount - 6}` : ""}
                  </p>
                  {entry.values.slice(0, 4).map(value => (
                    <p className="settings-audit-value" key={value.key}>
                      {humanizeSettingsKey(value.key)}: {value.from} → {value.to}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          )}
          {auditError ? <p className="layout-error">{t(auditError)}</p> : null}
        </section>
      ) : null}

      <section className="card app-card settings-danger-card">
        <SettingsCardHead
          title={t("Delete orders and customers")}
          subtitle={t("This removes orders and customers only.")}
          aside={<span className="settings-tag">{canDelete ? t("Owner/Admin only") : t("Locked")}</span>}
        />
        <div className="settings-two-col">
          <div className="settings-field-stack">
            <div className="settings-delete-lists">
              <div>
                <span className="settings-field-label is-danger">{t("Will be deleted")}</span>
                <ul><li>{t("Orders")}</li><li>{t("Customers")}</li></ul>
              </div>
              <div>
                <span className="settings-field-label">{t("Will stay")}</span>
                <ul><li>{t("Workspace settings")}</li><li>{t("Members")}</li><li>{t("Logos")}</li><li>{t("Client Files")}</li></ul>
              </div>
            </div>
            <p className="settings-field-hint">{t("Web import is append-only and app-compatible. It imports app backups, web JSON backups, orders, customers and supported settings, but does not import Client Files storage objects. Delete Data mirrors the app: it removes orders and customers only, not workspace settings, members, logos or Storage files.")}</p>
          </div>
          <div className="settings-field-stack">
            <p className="settings-field-hint">{t("Export a backup first.")} {t("Then type")} <code>DELETE DATA</code> {t("to unlock the delete action.")}</p>
            <input
              className="input"
              value={deleteConfirmation}
              disabled={!canDelete || deleting}
              placeholder="DELETE DATA"
              aria-label="DELETE DATA"
              onChange={event => {
                setDeleteConfirmation(event.target.value);
                setStatus("");
                setError("");
              }}
            />
            <button
              className="button danger"
              type="button"
              disabled={!canDelete || deleting || deleteConfirmation.trim() !== "DELETE DATA"}
              onClick={handleDeleteData}
            >
              {deleting ? t("Deleting...") : t("Delete Data")}
            </button>
            {!canDelete ? <p className="settings-field-hint">{t("Only workspace Owner or Admin can delete workspace data.")}</p> : null}
            <Link className="settings-inline-link" href="/export">{t("Open full Export page")} ↗</Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function PlanAccessSection({
  workspace,
  counts,
  storagePercent,
  language = "English"
}: {
  workspace: WorkspaceContext;
  counts: DashboardCounts | null;
  storagePercent: number;
  language?: string;
}) {
  const t = (text: string) => studioT(text, language);
  const currentPlan = workspace.entitlements;
  // Effective storage for the current workspace = base plan + active add-on.
  const effectiveStorageLabel = workspace.billingStorageLimitMB >= 1024
    ? `${Math.round((workspace.billingStorageLimitMB / 1024) * 10) / 10} GB`
    : `${workspace.billingStorageLimitMB} MB`;
  useSettingsHeaderActions(
    <span className="settings-field-hint settings-header-note">
      <CardIconGlyph icon="lock" /> {t("Plan changes are managed securely.")}
    </span>,
    [language]
  );
  const isActiveWorkspaceOwner = normalizeWorkspaceRole(workspace.role) === "owner";
  const featurePills = [
    { title: planOrderLimitText(currentPlan), enabled: true },
    { title: planCustomerLimitText(currentPlan), enabled: true },
    { title: `${t("Storage")}: ${effectiveStorageLabel}`, enabled: currentPlan.features.client_files },
    { title: planTeamLimitText(currentPlan), enabled: currentPlan.features.team_access },
    { title: t("Client Files"), enabled: currentPlan.features.client_files },
    { title: t("Export Data"), enabled: currentPlan.features.export_data },
    { title: t("Card Customise"), enabled: currentPlan.features.card_customization },
    { title: t("Financial Cards"), enabled: currentPlan.features.financial_basic },
    { title: t("Advanced Finance"), enabled: currentPlan.features.financial_advanced },
    { title: t("Workspace Logo"), enabled: currentPlan.features.workspace_logo_upload },
    { title: t("Team Access"), enabled: currentPlan.features.team_access },
    { title: t("Storage Add-ons"), enabled: currentPlan.features.storage_addons }
  ];

  type PlanRow = (typeof PLAN_ENTITLEMENTS)[keyof typeof PLAN_ENTITLEMENTS];
  const plans = Object.values(PLAN_ENTITLEMENTS) as PlanRow[];
  const included = (enabled: boolean) => (
    <span className={enabled ? "settings-plan-cell is-yes" : "settings-plan-cell is-no"}>{enabled ? `✓ ${t("Included")}` : t("Locked")}</span>
  );
  const limitCell = (limit: number | null) => limit === null ? <span className="settings-plan-cell is-yes">✓ {t("Unlimited")}</span> : <span className="settings-plan-cell">{limit}</span>;
  const compareRows: { label: string; icon: CardIcon; render: (plan: PlanRow) => React.ReactNode }[] = [
    { label: "Orders", icon: "orders", render: plan => limitCell(plan.orderLimit) },
    { label: "Customers", icon: "customers", render: plan => limitCell(plan.customerLimit) },
    { label: "Storage", icon: "storage", render: plan => <span className="settings-plan-cell">{formatStorageFromMB(plan.storageLimitMB)}</span> },
    { label: "Client Files", icon: "files", render: plan => included(plan.features.client_files) },
    { label: "Team Access", icon: "team", render: plan => included(plan.features.team_access) },
    { label: "Advanced Finance", icon: "finance", render: plan => included(plan.features.financial_advanced) },
    { label: "Card Customise", icon: "paintbrush", render: plan => included(plan.features.card_customization) },
    { label: "Workspace Logo", icon: "photo", render: plan => included(plan.features.workspace_logo_upload) },
    { label: "Storage Add-ons", icon: "storage", render: plan => included(plan.features.storage_addons) }
  ];
  const usedMB = counts?.estimatedFileUsageMB ?? 0;
  const seatsIncluded = currentPlan.includedTeamSeats ?? workspace.billingTeamMemberLimit;
  const billingActive = workspace.billingStatus === "active" || workspace.billingStatus === "trialing";

  return (
    <div className="settings-card-stack settings-plan-page">
      <div className="settings-plan-columns">
        <section className="card app-card settings-plan-hero">
          <span className="settings-tag">{t("Current plan")}</span>
          <div className="settings-plan-hero-head">
            <div className="settings-plan-hero-title">
              <strong>{workspace.billingPlanName}</strong>
              <span className={billingActive ? "settings-status-pill is-saved" : "settings-status-pill is-dirty"}>
                <span className="settings-status-pill-mark" aria-hidden="true">{billingActive ? "✓" : "●"}</span>
                {t(planBillingStateLabel(workspace.billingStatus))}
              </span>
            </div>
            {isActiveWorkspaceOwner ? (
              <Link className="button" href="/plan">{t("Open Plan & Billing")} ↗</Link>
            ) : null}
          </div>
          <p className="settings-plan-hero-model">{currentPlan.purchaseModel}</p>
          <p className="settings-field-hint">{planSummaryText(currentPlan.plan)}</p>
          {!isActiveWorkspaceOwner ? <p className="settings-field-hint">{t("This workspace plan is managed by its owner.")}</p> : null}
          <div className="settings-metric-grid">
            <div className="settings-metric">
              <small>{t("Orders")}</small>
              <strong>{counts?.orderCount ?? 0}</strong>
              <em>{currentPlan.orderLimit === null ? t("Unlimited") : `${t("of")} ${currentPlan.orderLimit}`}</em>
            </div>
            <div className="settings-metric">
              <small>{t("Customers")}</small>
              <strong>{counts?.customerCount ?? 0}</strong>
              <em>{currentPlan.customerLimit === null ? t("Unlimited") : `${t("of")} ${currentPlan.customerLimit}`}</em>
            </div>
            <div className="settings-metric">
              <small>{workspace.billingTeamMemberLimit > 1 ? t("Seats") : t("Users")}</small>
              <strong>{workspace.billingTeamMemberLimit > 1 ? `${seatsIncluded} ${t("included")}` : "1"}</strong>
              <em>{workspace.billingTeamMemberLimit > 1 ? `${workspace.billingTeamMemberLimit} ${t("in total")}` : t("single-user plan")}</em>
            </div>
            <div className="settings-metric">
              <small>{t("Storage")}</small>
              <strong>{usedMB} MB {t("used")}</strong>
              <em>
                {formatStorageFromMB(workspace.billingStorageLimitMB)} {t("total")}
                {/* A 210 GB total against a 50 GB plan matrix read as a
                    contradiction; the sum spells itself out now. */}
                {workspace.storageAddonMB > 0 ? ` (${formatStorageFromMB(workspace.billingStorageLimitMB - workspace.storageAddonMB)} + ${formatStorageFromMB(workspace.storageAddonMB)} ${t("add-on")})` : ""}
              </em>
            </div>
          </div>
          <div className="settings-progress">
            <div className="settings-progress-track"><div className="settings-progress-fill" style={{ width: `${Math.min(100, Math.max(0, storagePercent))}%` }} /></div>
            <div className="settings-progress-labels">
              <span>{usedMB} {t("MB used of")} {formatStorageFromMB(workspace.billingStorageLimitMB)}</span>
              <span>{Math.round(storagePercent)}%</span>
            </div>
          </div>
          <dl className="settings-facts">
            {/* Renewal date and billing state were on the company document all
                along; Settings just never showed either. */}
            {workspace.billingCurrentPeriodEndMs > 0 ? (
              <div>
                <dt>{workspace.billingStatus === "cancelled" || workspace.billingStatus === "canceled" ? t("Access until") : t("Renews on")}</dt>
                <dd>{new Date(workspace.billingCurrentPeriodEndMs).toLocaleDateString(studioLocaleTag(language))}</dd>
              </div>
            ) : null}
            <div><dt>{t("Billing state")}</dt><dd>{t(planBillingStateLabel(workspace.billingStatus))}</dd></div>
            {/* Price is shown only for Stripe: Apple and Google set their own
                per-territory prices in the store consoles, and those amounts
                exist nowhere in this codebase — printing the £ list price for a
                store-billed workspace could simply be wrong. Even for Stripe this
                is the list price, not any particular invoice. */}
            {workspace.billingEffectiveProvider === "stripe" && STRIPE_LIST_PRICE_LABELS[workspace.billingSubscriptionItemKey] ? (
              <div title={t("The advertised price for this plan. Your invoice can differ if a discount applies.")}>
                <dt>{t("List price")}</dt>
                <dd>{STRIPE_LIST_PRICE_LABELS[workspace.billingSubscriptionItemKey]}</dd>
              </div>
            ) : null}
            {workspace.billingEffectiveProvider === "apple" || workspace.billingEffectiveProvider === "google" ? (
              <div title={t("The price is set in the store and shown in your store subscription settings.")}>
                <dt>{t("Billed through")}</dt>
                <dd>{workspace.billingEffectiveProvider === "apple" ? t("App Store") : t("Google Play")}</dd>
              </div>
            ) : null}
          </dl>
        </section>

        <section className="card app-card">
          <SettingsCardHead title={t("Included with your plan")} />
          <div className="settings-feature-grid">
            {featurePills.map(feature => (
              <span className={feature.enabled ? "settings-feature is-on" : "settings-feature"} key={feature.title}>
                <b aria-hidden="true">{feature.enabled ? "✓" : "–"}</b>
                {feature.title}
              </span>
            ))}
          </div>
        </section>
      </div>

      <section className="card app-card">
        <SettingsCardHead title={t("Compare plan access")} subtitle={t("Shared app and web plan keys")} />
        <div className="settings-table-scroll">
          <table className="settings-plan-table">
            <thead>
              <tr>
                <th>{t("Feature")}</th>
                {plans.map(plan => (
                  <th key={plan.plan} className={plan.plan === workspace.billingPlan ? "is-current" : ""}>
                    {plan.title}
                    {plan.plan === workspace.billingPlan ? <span className="settings-tag">{t("Current")}</span> : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {compareRows.map(row => (
                <tr key={row.label}>
                  <th scope="row"><span className="settings-plan-row-label"><CardIconGlyph icon={row.icon} />{t(row.label)}</span></th>
                  {plans.map(plan => (
                    <td key={plan.plan} className={plan.plan === workspace.billingPlan ? "is-current" : ""}>{row.render(plan)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="settings-status-band is-info">
        <span className="settings-status-band-icon" aria-hidden="true"><CardIconGlyph icon="lock" /></span>
        <div className="settings-status-band-copy">
          <strong>{t("Plan changes are protected")}</strong>
          <p>{t("Subscription access is managed through secure billing and updates automatically when a payment status changes.")}</p>
        </div>
        <span className="settings-status-band-side">
          {isActiveWorkspaceOwner ? (
            <Link className="button secondary" href="/plan">{t("Open Plan & Billing")} ↗</Link>
          ) : (
            <span className="settings-field-hint">{t("Only the workspace owner can change or manage this plan.")}</span>
          )}
        </span>
      </div>
    </div>
  );
}

function TeamAccessSection({
  workspace,
  teamData,
  loadFailed = false,
  onRefreshTeamAccess,
  language = "English"
}: {
  workspace: WorkspaceContext;
  teamData: TeamAccessData | null;
  loadFailed?: boolean;
  onRefreshTeamAccess: () => Promise<TeamAccessData | null>;
  language?: string;
}) {
  const t = (text: string) => studioT(text, language);
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
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : t("Workspaces could not be loaded."));
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
      setError(switchError instanceof Error ? switchError.message : t("Could not switch workspace."));
      setSwitchingWorkspaceId("");
    }
  }

  const workspaceSwitchPanel = (
    <section className="card app-card team-access-panel-card">
      <div className="team-access-panel-heading">
        <strong>{t("Workspaces")}</strong>
        <span>{joinedWorkspaces.length} {t("connected")}</span>
      </div>
      <p className="muted-copy">{t("Switch to a workspace you own or have joined. Your assigned role controls what you can see after switching.")}</p>
      {joinedWorkspaces.map(option => (
        <div className="team-access-workspace-option" key={option.id}>
          <span className="team-access-icon team-access-icon-owner" aria-hidden="true">{option.role === "owner" ? "♛" : "◉"}</span>
          <div>
            <strong>{option.name}</strong>
            <small>{option.roleLabel}</small>
          </div>
          {option.isCurrent ? (
            <span className="studio-pill success">{t("Current")}</span>
          ) : (
            <button
              className="button secondary"
              type="button"
              onClick={() => void switchWorkspace(option)}
              disabled={Boolean(switchingWorkspaceId)}
            >
              {switchingWorkspaceId === option.id ? t("Switching...") : t("Switch")}
            </button>
          )}
        </div>
      ))}
    </section>
  );

  useEffect(() => {
    // joinRequests falls back to a fresh [] whenever teamData is null (e.g. a
    // failed load), so this effect can run on every render. Returning the
    // previous object untouched when nothing was added lets React bail out of
    // the update instead of re-rendering forever.
    setRequestRoles(previous => {
      let changed = false;
      const next = { ...previous };
      joinRequests.forEach(request => {
        if (!next[request.id]) {
          next[request.id] = "member";
          changed = true;
        }
      });
      return changed ? next : previous;
    });
  }, [joinRequests]);

  const isOwner = normalizeWorkspaceRole(workspace.role) === "owner";
  const hasTeamPlan = Boolean(workspace.entitlements.features.team_access);
  const canViewTeamManagement = Boolean(hasTeamPlan && workspaceAccessAllows(workspace.memberAccess, "teamAccess"));
  const canManageTeam = Boolean(isOwner && canViewTeamManagement);
  const roleOptions = useMemo(() => standardAndCustomRoleOptions(customRoles), [customRoles]);
  const teamLimit = workspace.billingTeamMemberLimit > 9999 ? t("Unlimited") : `${members.length} / ${workspace.billingTeamMemberLimit}`;
  const roleCounts = useMemo(() => {
    return members.reduce<Record<string, number>>((acc, member) => {
      acc[member.roleLabel] = (acc[member.roleLabel] ?? 0) + 1;
      return acc;
    }, {});
  }, [members]);
  const matrixColumns = useMemo<PermissionMatrixColumn[]>(() => {
    const customRoleIds = new Set(customRoles.map(role => role.id));
    const baseRoleCount = (base: string) => members.filter(member =>
      !member.isOwner && !customRoleIds.has(member.role) && normalizeWorkspaceRole(member.effectiveRole) === base
    ).length;
    const columns: PermissionMatrixColumn[] = [{
      key: "owner",
      label: "Owner",
      count: members.filter(member => member.isOwner).length,
      baseRole: "owner",
      access: baseRoleMatrixAccess("owner"),
      isCustom: false
    }];
    // Legacy "Admin" assignments still exist in a few workspaces; only show
    // the column when someone actually holds that role.
    const adminCount = baseRoleCount("admin");
    if (adminCount > 0) {
      columns.push({ key: "admin", label: "Admin", count: adminCount, baseRole: "admin", access: baseRoleMatrixAccess("admin"), isCustom: false });
    }
    WEB_TEAM_ROLES.forEach(option => {
      columns.push({
        key: option.value,
        label: option.label,
        count: baseRoleCount(option.value),
        baseRole: option.value,
        access: baseRoleMatrixAccess(option.value),
        isCustom: false
      });
    });
    customRoles.forEach(role => {
      columns.push({
        key: role.id,
        label: role.name,
        // A member holds a custom role when their raw role value is the custom role id.
        count: members.filter(member => member.role === role.id).length,
        baseRole: normalizeWorkspaceRole(role.baseRole, "member") || "member",
        access: { ...WORKSPACE_MEMBER_ACCESS_DEFAULTS, ...role.access },
        isCustom: true
      });
    });
    return columns;
  }, [customRoles, members]);

  const seatLimit = workspace.billingTeamMemberLimit;
  const seatsUnlimited = seatLimit > 9999;
  const seatPercent = seatsUnlimited ? 0 : Math.min(100, Math.round((members.length / Math.max(1, seatLimit)) * 100));
  useSettingsHeaderActions(
    canViewTeamManagement ? (
      <span className="settings-header-chip">
        <CardIconGlyph icon="team" />
        {seatsUnlimited ? `${members.length} ${t("members")}` : `${members.length} ${t("of")} ${seatLimit} ${t("seats used")}`}
      </span>
    ) : null,
    [canViewTeamManagement, members.length, seatLimit, language]
  );

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
      setError(actionError instanceof Error ? actionError.message : t("Team action failed."));
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
      t("Access request sent. The workspace owner can approve it from Team Access.")
    );
    setRequestOwnerIdentifier("");
  }

  async function retryTeamDataLoad() {
    if (actioning) return;
    setActioning("retry-team-data");
    setError("");
    try {
      await onRefreshTeamAccess();
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : t("Team data could not be loaded."));
    } finally {
      setActioning("");
    }
  }

  if (canViewTeamManagement && loadFailed && !teamData) {
    return (
      <div className="settings-stack team-access-shell">
        <section className="card app-card team-access-hero-card">
          <CardTitle icon="team" title={t("Team Access")}>
            <p className="team-access-hero-subtitle">{t("Manage workspace members, roles and join requests.")}</p>
          </CardTitle>
          <p className="layout-error">{t("Team data could not be loaded.")}</p>
          <p className="muted-copy">{t("Check your connection and try again. If the problem continues, contact support.")}</p>
          {error ? <p className="layout-error">{t(error)}</p> : null}
          <button
            className="button secondary"
            type="button"
            onClick={() => void retryTeamDataLoad()}
            disabled={Boolean(actioning)}
            style={{ alignSelf: "flex-start" }}
          >
            {actioning === "retry-team-data" ? t("Loading…") : t("Refresh")}
          </button>
        </section>
      </div>
    );
  }

  if (!canViewTeamManagement) {
    return (
      <div className="settings-card-stack settings-team-page">
        <section className="card app-card">
          <SettingsCardHead title={t("Join an existing Team workspace")} subtitle={t("Request access using the Company ID or owner email shared by a Team workspace owner.")} />
          <p className="settings-field-hint">{t("Requesting access is available on every plan. Team management remains available only inside a Team workspace with permission.")}</p>
          {status ? <p className="success-copy">{t(status)}</p> : null}
          {error ? <p className="layout-error">{t(error)}</p> : null}
        </section>
        <section className="card app-card">
          <SettingsCardHead title={t("Workspaces")} subtitle={t("Switch to a workspace you own or have joined. Your assigned role controls what you can see after switching.")} aside={<span className="settings-tag is-muted">{joinedWorkspaces.length}</span>} />
          <div className="settings-member-list">
            {joinedWorkspaces.map(option => (
              <div className="settings-member-row" key={option.id}>
                <span className="settings-member-avatar" aria-hidden="true">{option.role === "owner" ? "♛" : "◉"}</span>
                <div className="settings-member-copy">
                  <strong>{option.name}</strong>
                  <small>{option.roleLabel}</small>
                </div>
                <div className="settings-member-actions">
                  {option.isCurrent ? (
                    <span className="settings-status-pill is-saved"><span className="settings-status-pill-mark" aria-hidden="true">✓</span>{t("Current")}</span>
                  ) : (
                    <button className="button secondary" type="button" onClick={() => void switchWorkspace(option)} disabled={Boolean(switchingWorkspaceId)}>
                      {switchingWorkspaceId === option.id ? t("Switching...") : t("Switch")}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
        <form className="card app-card" onSubmit={event => {
          event.preventDefault();
          void submitAccessRequest();
        }}>
          <SettingsCardHead title={t("Request Access")} aside={<span className="settings-tag">{t("Every plan")}</span>} />
          <p className="settings-field-hint">{t("Enter the Team workspace owner’s email address or Company ID.")}</p>
          <div className="settings-inline-row">
            <input
              className="input"
              value={requestOwnerIdentifier}
              onChange={event => setRequestOwnerIdentifier(event.target.value)}
              placeholder={t("Owner email or Company ID")}
              disabled={Boolean(actioning)}
            />
            <button className="button secondary" type="submit" disabled={!requestOwnerIdentifier.trim() || Boolean(actioning)}>
              {actioning === "request-access" ? t("Sending...") : t("Send request")}
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="settings-card-stack settings-team-page">
        <section className="card app-card">
          <SettingsCardHead title={t("Team workspace membership")} subtitle={`${t("You have joined this workspace as")} ${workspace.roleLabel}.`} />
          <div className="settings-chip-row">
            <span className="settings-chip">{workspace.billingPlanName}</span>
            <span className="settings-chip">{workspace.roleLabel}</span>
            <span className="settings-chip">{t("Shared with you")}</span>
          </div>
          <p className="settings-field-hint">{t("You can use the areas permitted by your assigned role. Workspace members, roles, join requests and billing are managed by the owner.")}</p>
          {status ? <p className="success-copy">{t(status)}</p> : null}
          {error ? <p className="layout-error">{t(error)}</p> : null}
        </section>
        <section className="card app-card">
          <SettingsCardHead title={t("Workspaces")} subtitle={t("Switch to a workspace you own or have joined. Your assigned role controls what you can see after switching.")} aside={<span className="settings-tag is-muted">{joinedWorkspaces.length}</span>} />
          <div className="settings-member-list">
            {joinedWorkspaces.map(option => (
              <div className="settings-member-row" key={option.id}>
                <span className="settings-member-avatar" aria-hidden="true">{option.role === "owner" ? "♛" : "◉"}</span>
                <div className="settings-member-copy">
                  <strong>{option.name}</strong>
                  <small>{option.roleLabel}</small>
                </div>
                <div className="settings-member-actions">
                  {option.isCurrent ? (
                    <span className="settings-status-pill is-saved"><span className="settings-status-pill-mark" aria-hidden="true">✓</span>{t("Current")}</span>
                  ) : (
                    <button className="button secondary" type="button" onClick={() => void switchWorkspace(option)} disabled={Boolean(switchingWorkspaceId)}>
                      {switchingWorkspaceId === option.id ? t("Switching...") : t("Switch")}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
        <form className="card app-card" onSubmit={event => {
          event.preventDefault();
          void submitAccessRequest();
        }}>
          <SettingsCardHead title={t("Request Access")} aside={<span className="settings-tag">{t("Every plan")}</span>} />
          <p className="settings-field-hint">{t("Enter another Team workspace owner’s email address or Company ID.")}</p>
          <div className="settings-inline-row">
            <input
              className="input"
              value={requestOwnerIdentifier}
              onChange={event => setRequestOwnerIdentifier(event.target.value)}
              placeholder={t("Owner email or Company ID")}
              disabled={Boolean(actioning)}
            />
            <button className="button secondary" type="submit" disabled={!requestOwnerIdentifier.trim() || Boolean(actioning)}>
              {actioning === "request-access" ? t("Sending...") : t("Send request")}
            </button>
          </div>
        </form>
      </div>
    );
  }

  const jumpTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="settings-card-stack settings-team-page">
      {status ? <p className="success-copy">{t(status)}</p> : null}
      {error ? <p className="layout-error">{t(error)}</p> : null}
      {copied ? <p className="success-copy">{copied}</p> : null}
      {!hasTeamPlan ? (
        <p className="settings-notice is-caution">{t("Team management is locked on this plan. Current membership is visible, but approving requests and changing roles requires NivaDesk Team.")}</p>
      ) : null}

      <nav className="settings-anchor-tabs" aria-label={t("Team Access")}>
        {[
          ["team-overview", t("Overview"), ""],
          ["team-members", t("Members"), String(members.length)],
          ["team-requests", t("Requests"), String(joinRequests.length)],
          ["team-roles", t("Roles"), String(matrixColumns.length)],
          ["team-permissions", t("Permissions"), ""]
        ].map(([id, label, count]) => (
          <button key={id} type="button" onClick={() => jumpTo(id)}>{label}{count ? <span className="settings-tag is-muted">{count}</span> : null}</button>
        ))}
      </nav>

      <div className="settings-two-col" id="team-overview">
        <section className="card app-card">
          <SettingsCardHead title={t("Current Workspace")} />
          <div className="settings-team-workspace">
            <span className="settings-card-head-icon" aria-hidden="true"><CardIconGlyph icon="team" /></span>
            <div>
              <strong>{workspace.name || "NivaDesk"}</strong>
              <span className="settings-chip-row">
                <span className="settings-tag">{workspace.roleLabel}</span>
                <span className="settings-tag is-muted">{t("Current")}</span>
              </span>
            </div>
          </div>
          <p className="settings-field-hint">{t("You own this workspace")}</p>
          <div className="settings-field">
            <span className="settings-field-label">{t("Company ID")}</span>
            <div className="settings-link-row">
              <code className="settings-link-box">{workspace.id}</code>
              <button className="button secondary" type="button" onClick={() => copyText(workspace.id, t("Company ID copied"))}>{t("Copy")}</button>
            </div>
          </div>
          <Link className="settings-inline-link" href="/team">{t("Advanced: connect with Company ID")} ›</Link>
        </section>

        <section className="card app-card">
          <SettingsCardHead title={t("Team plan")} aside={<span className="settings-tag">{hasTeamPlan ? t("Team plan available") : t("Team plan locked")}</span>} />
          <div className="settings-metric settings-metric-wide">
            <small>{t("Team seats")}</small>
            <strong>{seatsUnlimited ? t("Unlimited") : <>{members.length} <span className="settings-metric-of">/ {seatLimit}</span></>}</strong>
            {!seatsUnlimited ? <div className="settings-progress-track"><div className="settings-progress-fill" style={{ width: `${seatPercent}%` }} /></div> : null}
            {!seatsUnlimited ? <em>{Math.max(0, seatLimit - members.length)} {t("seats available")}</em> : null}
          </div>
          <p className="settings-field-hint">
            {hasTeamPlan
              ? t("Team includes 5 seats. Additional seats will be available for £5/month or £50/year each, up to 10 users. For larger teams, contact contact@nivadesk.co.uk.")
              : t("Team management is locked on this plan. Current membership is visible, but approving requests and changing roles requires NivaDesk Team.")}
          </p>
        </section>
      </div>

      <section className="card app-card">
        <SettingsCardHead title={t("Add people or join another workspace")} />
        <div className="settings-two-col settings-team-join">
          {/* Nothing here sends an invitation: the other person has to ask to
              join and the owner approves. Calling it "Invite People" made people
              wait for an email that was never going to arrive. */}
          <div className="settings-field-stack">
            <strong className="settings-subheading-inline">{t("Let people join this workspace")}</strong>
            <p className="settings-field-hint">{t("NivaDesk does not send invitation emails. Share your Company ID with the person; they sign up, send a join request, and you approve it here.")}</p>
            {isOwner && hasTeamPlan ? (
              <div className="settings-link-row">
                <code className="settings-link-box">{workspace.id}</code>
                <button className="button secondary" type="button" onClick={() => copyText(workspace.id, t("Company ID copied"))}>{t("Copy invite code")}</button>
              </div>
            ) : (
              <p className="settings-field-hint">{isOwner ? t("Upgrade to NivaDesk Team to approve new members.") : t("Only the workspace owner can invite and approve new members.")}</p>
            )}
          </div>
          <form className="settings-field-stack" onSubmit={event => {
            event.preventDefault();
            void submitAccessRequest();
          }}>
            <strong className="settings-subheading-inline">{t("Request Access")}</strong>
            <p className="settings-field-hint">{t("Enter the owner’s email address or Company ID and send a request.")}</p>
            <div className="settings-inline-row">
              <input
                className="input"
                value={requestOwnerIdentifier}
                onChange={event => setRequestOwnerIdentifier(event.target.value)}
                placeholder={t("Owner email or Company ID")}
                disabled={Boolean(actioning)}
              />
              <button className="button secondary" type="submit" disabled={!requestOwnerIdentifier.trim() || Boolean(actioning)}>
                {actioning === "request-access" ? t("Sending...") : t("Send request")}
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className="card app-card" id="team-requests">
        <div className="settings-status-band is-info settings-history-band">
          <span className="settings-status-band-icon" aria-hidden="true"><CardIconGlyph icon="team" /></span>
          <div className="settings-status-band-copy">
            <strong>{t("Join Requests")}</strong>
            <p>{!isOwner ? t("Only workspace owners can see and review join requests.") : joinRequests.length === 0 ? t("No pending requests.") : `${joinRequests.length} ${t("pending requests.")}`}</p>
          </div>
          <span className="settings-status-band-side">
            <button className="button secondary" type="button" onClick={() => void onRefreshTeamAccess()}>{t("Refresh")}</button>
          </span>
        </div>
        {isOwner && joinRequests.length > 0 ? (
          <div className="settings-member-list">
            {joinRequests.map(request => {
              const selectedRole = requestRoles[request.id] ?? "member";
              const approveKey = `approve-${request.id}`;
              const declineKey = `decline-${request.id}`;
              return (
                <article key={request.id} className="settings-member-row">
                  <span className="settings-member-avatar" aria-hidden="true">{requestLabel(request).slice(0, 1).toUpperCase()}</span>
                  <div className="settings-member-copy">
                    <strong>{requestLabel(request)}</strong>
                    <small>{t("Requested")} {formatTeamDate(request.createdAt)}</small>
                    {!hasTeamPlan ? <small>{t("Approving new team members requires NivaDesk Team. Decline remains available for cleanup.")}</small> : null}
                  </div>
                  <div className="settings-member-actions">
                    <span className="settings-tag is-muted">{request.status}</span>
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
                        t("Access request approved.")
                      )}
                    >
                      {actioning === approveKey ? t("Approving...") : t("Approve")}
                    </button>
                    <button
                      className="button secondary"
                      type="button"
                      disabled={!isOwner || Boolean(actioning)}
                      onClick={() => void runTeamAction(declineKey, () => declineJoinRequest(workspace, request), t("Access request declined."))}
                    >
                      {actioning === declineKey ? t("Declining...") : t("Decline")}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
      </section>

      <section className="card app-card" id="team-members">
        <SettingsCardHead title={t("Team Members")} aside={<span className="settings-tag is-muted">{members.length}</span>} />
        <div className="settings-member-list">
          {members.map(member => {
            const changingKey = `role-${member.id}`;
            const removeKey = `remove-${member.id}`;
            const canChangeRole = canManageTeam && !member.isOwner;
            return (
              <article key={member.id} className="settings-member-row">
                <span className="settings-member-avatar" aria-hidden="true">
                  {member.photoURL ? <img src={member.photoURL} alt="" /> : memberLabel(member).slice(0, 1).toUpperCase()}
                </span>
                <div className="settings-member-copy">
                  <strong>{memberLabel(member)}</strong>
                  <small>{member.email || member.id}</small>
                </div>
                <span className="settings-chip-row settings-member-tags">
                  {member.isOwner ? <span className="settings-tag">{t("Owner")}</span> : <span className="settings-tag is-muted">{member.roleLabel}</span>}
                  {user && member.id === user.uid ? <span className="settings-tag is-muted">{t("You")}</span> : null}
                  {actioning === changingKey ? <span className="settings-tag is-muted">{t("Updating...")}</span> : null}
                </span>
                <div className="settings-member-actions">
                  {canChangeRole ? (
                    <select
                      className="input"
                      aria-label={t("Role")}
                      value={roleOptions.some(option => option.value === member.role) ? member.role : "member"}
                      disabled={Boolean(actioning)}
                      onChange={event => {
                        const nextRole = event.target.value;
                        if (nextRole === member.role) return;
                        void runTeamAction(
                          changingKey,
                          () => updateTeamMemberRole(workspace, member, nextRole),
                          `${t("Role updated to")} ${roleOptions.find(option => option.value === nextRole)?.label ?? roleOptionLabel(nextRole)}.`
                        );
                      }}
                    >
                      {roleOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  ) : null}
                  <button className="button secondary" type="button" onClick={() => copyText(member.id, t("User ID copied"))}>{t("Copy ID")}</button>
                  {canChangeRole ? (
                    <button
                      className="button danger secondary"
                      type="button"
                      disabled={Boolean(actioning)}
                      onClick={() => {
                        if (!window.confirm(`${t("Remove")} ${memberLabel(member)} ${t("from this workspace?")}`)) return;
                        void runTeamAction(removeKey, () => removeTeamMember(workspace, member), t("Team member removed."));
                      }}
                    >
                      {actioning === removeKey ? t("Removing...") : t("Remove")}
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
          {members.length === 0 ? <p className="settings-empty-line">{t("No members found.")}</p> : null}
        </div>
      </section>

      <section className="card app-card" id="team-roles">
        <SettingsCardHead title={t("Role Profiles")} subtitle={t("Create custom access roles, then assign one to any workspace member.")} />
        {canManageTeam ? (
          <CustomRoleManager
            roles={customRoles}
            disabled={Boolean(actioning)}
            savingKey={actioning}
            language={language}
            onSave={role => runTeamAction(
              role.id ? `custom-role-${role.id}` : "custom-role-new",
              () => saveWorkspaceCustomRole(workspace, role),
              t("Role profile saved.")
            )}
            onDelete={role => runTeamAction(
              `delete-custom-role-${role.id}`,
              () => deleteWorkspaceCustomRole(workspace, role),
              t("Role profile deleted.")
            )}
          />
        ) : (
          <p className="settings-field-hint">{t("Only the workspace owner on NivaDesk Team can create custom role profiles.")}</p>
        )}
      </section>

      <section className="card app-card" id="team-permissions">
        <SettingsCardHead title={t("Permission matrix")} subtitle={`${t("What each role can see and do at a glance.")} ${t("Owner always has full access")}.`} />
        <div className="permission-matrix-scroll">
          <table className="permission-matrix-table">
            <thead>
              <tr>
                <th scope="col">{t("Permission")}</th>
                {matrixColumns.map(column => (
                  <th scope="col" key={column.key}>
                    <span>{column.isCustom ? column.label : t(column.label)}</span>
                    <small>({column.count})</small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSION_MATRIX_ROWS.map(row => (
                <tr key={row.key}>
                  <th scope="row">{t(row.label)}</th>
                  {matrixColumns.map(column => {
                    const cell = row.value(column);
                    if (typeof cell === "object") {
                      const none = cell.enabled === 0;
                      return (
                        <td key={column.key} className={none ? "is-off" : "is-on"}>
                          {cell.enabled >= cell.total ? "✓" : none ? "—" : `${cell.enabled}/${cell.total}`}
                        </td>
                      );
                    }
                    return <td key={column.key} className={cell ? "is-on" : "is-off"}>{cell ? "✓" : "—"}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="settings-field-hint">
          ✓ {t("Allowed")} · — {t("Hidden / locked")} · {t("Numbers show how many settings menus the role can open.")}
        </p>
        {customRoles.length > 0 ? (
          <div className="settings-field-stack">
            {customRoles.map(role => {
              const affected = members.filter(member => member.role === role.id).length;
              return (
                <p className="settings-field-hint" key={role.id}>
                  <strong>{role.name}</strong>: {t("Editing this role affects")} {affected} {affected === 1 ? t("member") : t("members")}.
                </p>
              );
            })}
          </div>
        ) : null}
      </section>

        <section className="card app-card">
          <SettingsCardHead title={t("Workspaces")} subtitle={t("Switch to a workspace you own or have joined. Your assigned role controls what you can see after switching.")} aside={<button className="button secondary" type="button" onClick={() => void onRefreshTeamAccess()}>{t("Refresh")}</button>} />
          <div className="settings-member-list">
            {joinedWorkspaces.map(option => (
              <div className="settings-member-row" key={option.id}>
                <span className="settings-member-avatar" aria-hidden="true">{option.role === "owner" ? "♛" : "◉"}</span>
                <div className="settings-member-copy">
                  <strong>{option.name}</strong>
                  <small>{option.roleLabel}</small>
                </div>
                <div className="settings-member-actions">
                  {option.isCurrent ? (
                    <span className="settings-status-pill is-saved"><span className="settings-status-pill-mark" aria-hidden="true">✓</span>{t("Current")}</span>
                  ) : (
                    <button className="button secondary" type="button" onClick={() => void switchWorkspace(option)} disabled={Boolean(switchingWorkspaceId)}>
                      {switchingWorkspaceId === option.id ? t("Switching...") : t("Switch")}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

      <section className="card app-card">
        <SettingsCardHead title={t("Current role mix")} subtitle={t("Role counts")} />
        <dl className="settings-facts">
          {Object.entries(roleCounts).map(([role, count]) => <div key={role}><dt>{role}</dt><dd>{count}</dd></div>)}
          {Object.keys(roleCounts).length === 0 ? <div><dt>{t("Members")}</dt><dd>0</dd></div> : null}
        </dl>
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
  // ?support=appSupport was read by nothing, so the assistant's "send this to
  // support" link landed on Settings and left you to find the tab yourself.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("support");
    if (requested === "appSupport" || requested === "workspace" || requested === "website") {
      setTicketMode(requested);
    }
  }, []);
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
  const sendingTicketRef = useRef(false);
  const [replyFilesByTicketId, setReplyFilesByTicketId] = useState<Record<string, File[]>>({});
  const [pendingTicketFiles, setPendingTicketFiles] = useState<File[]>([]);
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
  // Website chats arrive through the same NivaDesk support inbox, so they use
  // the appSupport callables and are split out by ticketType for display.
  const isWebsiteMode = ticketMode === "website";
  const canUpdateStatus = isWorkspaceMode ? canSeeWorkspaceQueue : isSupportAdmin;
  const visibleTickets = isWorkspaceMode
    ? tickets
    : tickets.filter(ticket => (String(ticket.ticketType || "") === "website") === isWebsiteMode);
  const categories = isWorkspaceMode ? WORKSPACE_SUPPORT_CATEGORY_OPTIONS : APP_SUPPORT_CATEGORY_OPTIONS;
  const currentUserUid = auth.currentUser?.uid ?? "";
  const [ticketQuery, setTicketQuery] = useState("");
  const [ticketFilter, setTicketFilter] = useState<"all" | "unread" | "open" | "waiting" | "resolved">("all");

  async function refreshSupportUnreadSummary() {
    try {
      const summary = await getSupportTicketUnreadSummary(workspace);
      onSupportUnreadChanged(supportUnreadTotal(summary));
      setUnreadTicketIds(supportUnreadTicketIds(summary));
      // This call runs on mount for everyone, so it is what makes the Website
      // tab visible without first opening the NivaDesk Support tab.
      if (summary?.isSupportAdmin) setIsSupportAdmin(true);
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

  useEffect(() => {
    void refreshSupportUnreadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.id]);

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
    // The disabled attribute lands only after a re-render; this ref closes the
    // window between two clicks that arrive before it does. (The server also
    // dedupes rapid identical tickets, so even a slip here files one ticket.)
    if (sendingTicketRef.current) return;
    sendingTicketRef.current = true;
    setSendingTicket(true);
    setStatus("");
    setError("");
    try {
      const payload = { title, message, category, priority, language };
      const result = isWorkspaceMode
        ? await createWorkspaceSupportTicket(workspace, payload)
        : await createNivaDeskSupportTicket(workspace, payload);
      // Attachments ride in as a follow-up reply, the same way the Mac app has
      // always done it: the create callables deliberately take no files.
      if (result.ticketId && pendingTicketFiles.length > 0) {
        try {
          const attachments: StudioSupportTicketAttachment[] = [];
          for (const file of pendingTicketFiles.slice(0, 6)) {
            attachments.push(await uploadSupportTicketAttachment(workspace, result.ticketId, file));
          }
          await (isWorkspaceMode
            ? addWorkspaceSupportTicketReply(workspace, result.ticketId, "", attachments)
            : addNivaDeskSupportTicketReply(workspace, result.ticketId, "", attachments));
        } catch (attachError) {
          setError(attachError instanceof Error
            ? `${t("Ticket sent, but the attachments could not be uploaded.")} ${attachError.message}`
            : t("Ticket sent, but the attachments could not be uploaded."));
        }
      }
      setPendingTicketFiles([]);
      setTitle("");
      setMessage("");
      setPriority("normal");
      setStatus(result.message || t("Ticket sent."));
      await loadTickets();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : t("Ticket could not be sent."));
    } finally {
      sendingTicketRef.current = false;
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
    const files = replyFilesByTicketId[ticket.id] || [];
    if (!reply && files.length === 0) return;
    setSendingReply(previous => ({ ...previous, [ticket.id]: true }));
    setError("");
    setStatus("");
    try {
      const attachments: StudioSupportTicketAttachment[] = [];
      for (const file of files.slice(0, 6)) {
        attachments.push(await uploadSupportTicketAttachment(workspace, ticket.id, file));
      }
      await (isWorkspaceMode
        ? addWorkspaceSupportTicketReply(workspace, ticket.id, reply, attachments)
        : addNivaDeskSupportTicketReply(workspace, ticket.id, reply, attachments));
      setReplyByTicketId(previous => ({ ...previous, [ticket.id]: "" }));
      setReplyFilesByTicketId(previous => ({ ...previous, [ticket.id]: [] }));
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

  const ticketBucket = (ticket: StudioSupportTicket): "open" | "waiting" | "resolved" => {
    const value = String(ticket.status || "open").toLowerCase();
    if (value.includes("wait")) return "waiting";
    if (value.includes("resolved") || value.includes("closed") || value.includes("done")) return "resolved";
    return "open";
  };
  const needle = ticketQuery.trim().toLowerCase();
  const filteredTickets = visibleTickets.filter(ticket => {
    const isUnread = supportTicketIsUnread(ticket, currentUserUid) || unreadTicketIds.includes(ticket.id);
    if (ticketFilter === "unread" && !isUnread) return false;
    if ((ticketFilter === "open" || ticketFilter === "waiting" || ticketFilter === "resolved") && ticketBucket(ticket) !== ticketFilter) return false;
    if (needle) {
      const haystack = `${ticket.title || ""} ${ticket.message || ""} ${ticket.createdByName || ""} ${ticket.createdByEmail || ""}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
  const modeOptions: { mode: StudioSupportTicketType; title: string; detail: string }[] = [
    // Named one role, so on an owner account it read as writing to yourself. The
    // sender is always excluded server-side, so this wording is true for every
    // role — including the owner, whose ticket goes to their admins and support
    // managers.
    { mode: "workspace", title: "Internal Workspace Ticket", detail: "Goes to your workspace owner, admins and support managers. For internal project, task, customer or approval questions." },
    { mode: "appSupport", title: "Contact NivaDesk Support", detail: "For app bugs, sync issues, billing, account or feature requests." },
    ...(isSupportAdmin ? [{ mode: "website" as StudioSupportTicketType, title: "Website Chats", detail: "Questions people send from the nivadesk.app chat widget." }] : [])
  ];
  const inboxTitle = isWorkspaceMode
    ? (canSeeWorkspaceQueue ? t("Workspace Tickets") : t("My Workspace Tickets"))
    : (isWebsiteMode ? t("Questions from the website") : (isSupportAdmin ? t("NivaDesk Support Inbox") : t("My NivaDesk Support Tickets")));

  return (
    <div className="settings-card-stack settings-support-page">
      <div className="settings-support-toolbar">
        {supportUnreadCount > 0 ? <span className="settings-status-pill is-dirty"><span className="settings-status-pill-mark" aria-hidden="true">●</span>{supportUnreadCount} {t("unread ticket update")}</span> : null}
        <button className="button secondary" type="button" disabled={loadingTickets} onClick={() => void loadTickets()}>
          {loadingTickets ? t("Refreshing...") : t("Refresh Tickets")}
        </button>
      </div>

      <div className="settings-choice-grid" role="radiogroup" aria-label={t("Support / Tickets")}>
        {modeOptions.map(option => {
          const selected = ticketMode === option.mode;
          return (
            <button key={option.mode} type="button" role="radio" aria-checked={selected} className={selected ? "settings-choice-card is-selected" : "settings-choice-card"} onClick={() => setTicketMode(option.mode)}>
              <span className="settings-choice-card-head"><strong>{t(option.title)}</strong></span>
              <span className="settings-choice-card-detail">{t(option.detail)}</span>
              <span className="settings-choice-card-radio" aria-hidden="true">{selected ? "✓" : ""}</span>
            </button>
          );
        })}
      </div>

      {status ? <p className="success-copy">{t(status)}</p> : null}
      {error ? <p className="layout-error">{t(error)}</p> : null}

      <div className={isWebsiteMode ? "settings-support-columns is-single" : "settings-support-columns"}>
        {isWebsiteMode ? null : (
          <section className="card app-card settings-support-form">
            <SettingsCardHead title={t("New Ticket")} aside={<span className="settings-tag">{isWorkspaceMode ? t("Workspace Ticket") : t("NivaDesk Support")}</span>} />
            <div className="settings-field-stack">
              <div className="settings-select-grid">
                <label className="settings-field">
                  <span className="settings-field-label">{t("Category")}</span>
                  <select className="input" value={category} disabled={sendingTicket} onChange={event => setCategory(event.target.value)}>
                    {categories.map(option => <option key={option.value} value={option.value}>{t(option.label)}</option>)}
                  </select>
                </label>
                <label className="settings-field">
                  <span className="settings-field-label">{t("Priority")}</span>
                  <select className="input" value={priority} disabled={sendingTicket} onChange={event => setPriority(event.target.value)}>
                    {SUPPORT_PRIORITY_OPTIONS.map(option => <option key={option.value} value={option.value}>{t(option.label)}</option>)}
                  </select>
                </label>
              </div>
              <label className="settings-field">
                <span className="settings-field-label">{t("Subject")}</span>
                <input className="input" value={title} disabled={sendingTicket} maxLength={160} onChange={event => setTitle(event.target.value)} placeholder={t("Briefly describe the issue")} />
              </label>
              <label className="settings-field">
                <span className="settings-field-label">{t("Message")}</span>
                <textarea className="input" value={message} disabled={sendingTicket} rows={6} maxLength={5000} onChange={event => setMessage(event.target.value)} placeholder={t("Add details, steps, screenshots context or what you expected to happen.")} />
              </label>
              {pendingTicketFiles.length > 0 ? (
                <div className="settings-chip-row">
                  {pendingTicketFiles.map((file, index) => (
                    <span key={`${file.name}-${index}`} className="settings-chip">
                      {file.name}
                      <button type="button" className="settings-chip-remove" aria-label={t("Remove")} onClick={() => setPendingTicketFiles(previous => previous.filter((_, i) => i !== index))}>×</button>
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="settings-action-row settings-action-row-split">
                <label className="button secondary settings-file-button">
                  {t("Attach file")}
                  <input
                    type="file"
                    multiple
                    hidden
                    disabled={sendingTicket}
                    onChange={event => {
                      const picked = Array.from(event.target.files || []);
                      if (picked.length === 0) return;
                      setPendingTicketFiles(previous => [...previous, ...picked].slice(0, 6));
                      event.target.value = "";
                    }}
                  />
                </label>
                <button className="button" type="button" disabled={sendingTicket || !title.trim() || !message.trim()} onClick={submitTicket}>
                  {sendingTicket ? t("Sending...") : t("Send Ticket")}
                </button>
              </div>
              <p className="settings-field-hint">{t("Subject and message are required.")}</p>
            </div>
          </section>
        )}

        <section className="card app-card settings-support-inbox">
          <SettingsCardHead title={inboxTitle} subtitle={supportUnreadCount > 0 ? `${supportUnreadCount} ${t("unread ticket update")}` : undefined} />
          <div className="settings-integrations-toolbar">
            <label className="settings-search settings-integrations-search">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="9" cy="9" r="5.5" /><path d="m13.5 13.5 3 3" /></svg>
              <span className="sr-only">{t("Search tickets...")}</span>
              <input value={ticketQuery} onChange={event => setTicketQuery(event.target.value)} placeholder={t("Search tickets...")} />
            </label>
            <div className="settings-segmented is-compact" role="group" aria-label={t("Filter")}>
              {([["all", "All"], ["unread", "Unread"], ["open", "Open"], ["waiting", "Waiting"], ["resolved", "Resolved"]] as const).map(([id, label]) => (
                <button key={id} type="button" className={ticketFilter === id ? "active" : ""} aria-pressed={ticketFilter === id} onClick={() => setTicketFilter(id)}>{t(label)}</button>
              ))}
            </div>
          </div>
          {loadingTickets ? <p className="settings-field-hint">{t("Loading tickets...")}</p> : null}
          {!loadingTickets && filteredTickets.length === 0 ? <p className="settings-empty-line">{isWebsiteMode ? t("No website questions yet.") : t("No tickets yet.")}</p> : null}
          <div className="settings-ticket-list">
            {filteredTickets.map(ticket => {
              const isSelected = selectedTicketId === ticket.id;
              const ticketMessages = messagesByTicketId[ticket.id] ?? [];
              const isUnread = supportTicketIsUnread(ticket, currentUserUid) || unreadTicketIds.includes(ticket.id);
              const lastMessageTime = ticket.lastMessageAtMillis || ticket.updatedAtMillis || ticket.createdAtMillis;
              const bucket = ticketBucket(ticket);
              return (
                <article key={ticket.id} className={isSelected ? "settings-ticket is-open" : "settings-ticket"}>
                  <div className="settings-ticket-row">
                    <span className={isUnread ? "settings-ticket-dot is-unread" : "settings-ticket-dot"} aria-hidden="true" />
                    <div className="settings-ticket-copy">
                      <strong>{ticket.title || t("Untitled ticket")}</strong>
                      <p>{ticket.lastMessagePreview || ticket.message}</p>
                      <small>
                        {ticket.createdByName || ticket.createdByEmail || ticket.createdByUid} · {formatSupportDate(lastMessageTime)}
                        {!isWorkspaceMode && isSupportAdmin ? ` · ${ticket.companyName || ticket.companyId} · ${ticket.platform} ${ticket.appVersion}` : ""}
                      </small>
                      {isWebsiteMode && isSupportAdmin ? (
                        // The spec's context card: WHO is asking, from WHERE, on
                        // WHICH plan — before the first reply is typed.
                        <div className="settings-notice">
                          <strong>
                            {ticket.accountUid
                              ? `${ticket.accountName || ticket.accountEmail}${ticket.accountCompanyName ? ` · ${ticket.accountCompanyName}` : ""}`
                              : `${ticket.createdByName || t("Website visitor")}${ticket.visitorEmail ? ` · ${ticket.visitorEmail}` : ` · ${t("no email left")}`}`}
                          </strong>
                          {ticket.accountUid ? (
                            <span>
                              {" "}{ticket.accountPlan ? `${t("Plan")}: ${ticket.accountPlan}` : t("Signed-in user")}
                              {typeof ticket.accountOrderCount === "number" && ticket.accountOrderCount > 0 ? ` · ${t("Orders")}: ${ticket.accountOrderCount}` : ""}
                              {ticket.accountEmail ? ` · ${ticket.accountEmail}` : ""}
                            </span>
                          ) : null}
                          {ticket.visitorPage ? <span> · {t("Current page")}: {ticket.visitorPage}</span> : null}
                          {ticket.needsHuman ? <span className="settings-field-hint is-caution"> · 👥 {t("Asked for a person")}</span> : null}
                        </div>
                      ) : null}
                    </div>
                    <div className="settings-ticket-side">
                      {isUnread ? <span className="settings-tag settings-tag-danger">{t("New")}</span> : null}
                      <span className={bucket === "resolved" ? "settings-tag is-muted" : bucket === "waiting" ? "settings-tag settings-tag-caution" : "settings-tag"}>{t(supportStatusLabel(ticket.status))}</span>
                      <span className="settings-tag is-muted">{t(supportPriorityLabel(ticket.priority))}</span>
                      {canUpdateStatus ? (
                        <select
                          className="input settings-ticket-status"
                          aria-label={t("Status")}
                          value={ticket.status || "open"}
                          disabled={Boolean(statusUpdating[ticket.id])}
                          onChange={event => void updateTicketStatus(ticket, event.target.value as StudioSupportTicketStatus)}
                        >
                          {SUPPORT_STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{t(option.label)}</option>)}
                        </select>
                      ) : null}
                      <button className="settings-link-button" type="button" onClick={() => void loadMessages(ticket)}>
                        {isSelected ? t("Hide Conversation") : t("Open Conversation")}
                      </button>
                    </div>
                  </div>
                  {isSelected ? (
                    <div className="settings-ticket-thread">
                      {loadingMessages[ticket.id] ? <p className="settings-field-hint">{t("Loading conversation...")}</p> : null}
                      {!loadingMessages[ticket.id] && ticketMessages.length === 0 ? <p className="settings-field-hint">{t("No replies yet.")}</p> : null}
                      {ticketMessages.map(item => (
                        <div key={item.id} className={item.authorRole === "user" ? "settings-ticket-message" : "settings-ticket-message is-staff"}>
                          <div className="settings-ticket-message-head">
                            <strong>{item.authorName || item.authorEmail || t("Unknown user")}</strong>
                            <small>{t(supportAuthorRoleLabel(item.authorRole))} · {formatSupportDate(item.createdAtMillis)}</small>
                          </div>
                          <p>{item.message}</p>
                          {(item.attachments || []).length > 0 ? (
                            <div className="settings-chip-row">
                              {(item.attachments || []).map(attachment => (
                                <a key={attachment.id} className="settings-chip" href={attachment.fileURL} target="_blank" rel="noopener noreferrer">
                                  {attachment.fileName}
                                </a>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ))}
                      <label className="settings-field">
                        <span className="settings-field-label">{t("Reply")}</span>
                        <textarea
                          className="input"
                          rows={4}
                          value={replyByTicketId[ticket.id] ?? ""}
                          disabled={Boolean(sendingReply[ticket.id])}
                          onChange={event => setReplyByTicketId(previous => ({ ...previous, [ticket.id]: event.target.value }))}
                          placeholder={t("Write a reply...")}
                        />
                      </label>
                      {(replyFilesByTicketId[ticket.id] || []).length > 0 ? (
                        <div className="settings-chip-row">
                          {(replyFilesByTicketId[ticket.id] || []).map((file, index) => (
                            <span key={`${file.name}-${index}`} className="settings-chip">
                              {file.name}
                              <button
                                type="button"
                                className="settings-chip-remove"
                                aria-label={t("Remove")}
                                onClick={() => setReplyFilesByTicketId(previous => ({
                                  ...previous,
                                  [ticket.id]: (previous[ticket.id] || []).filter((_, i) => i !== index)
                                }))}
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <div className="settings-action-row settings-action-row-split">
                        <label className="button secondary settings-file-button">
                          {t("Attach file")}
                          <input
                            type="file"
                            multiple
                            hidden
                            disabled={Boolean(sendingReply[ticket.id])}
                            onChange={event => {
                              const picked = Array.from(event.target.files || []);
                              if (picked.length === 0) return;
                              setReplyFilesByTicketId(previous => ({
                                ...previous,
                                [ticket.id]: [...(previous[ticket.id] || []), ...picked].slice(0, 6)
                              }));
                              event.target.value = "";
                            }}
                          />
                        </label>
                        <button className="button" type="button" disabled={Boolean(sendingReply[ticket.id]) || (!(replyByTicketId[ticket.id] || "").trim() && (replyFilesByTicketId[ticket.id] || []).length === 0)} onClick={() => void sendReply(ticket)}>
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


function AboutSection({ workspace, language = "English" }: { workspace: WorkspaceContext; language?: string }) {
  const t = (text: string) => studioT(text, language);
  const [diagStatus, setDiagStatus] = useState("");
  // The only live signal the web has about "sync": whether this browser is online.
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  async function copyText(value: string, feedback: string) {
    try {
      await navigator.clipboard.writeText(value);
      setDiagStatus(feedback);
    } catch {
      setDiagStatus(t("Copy failed. Select the value and copy it manually."));
    }
    window.setTimeout(() => setDiagStatus(""), 2000);
  }

  // One block a support thread can paste in whole: what, where, which plan,
  // which browser. Nothing here is secret — it is the same data the screen shows.
  function copyDiagnostics() {
    const lines = [
      `NivaDesk ${CHANGELOG[0]?.version ?? ""} (${CHANGELOG[0]?.date ?? ""})`,
      `Workspace: ${workspace.name} (${workspace.id})`,
      `Role: ${workspace.roleLabel}`,
      `Plan: ${workspace.billingPlanName} · ${workspace.billingStatus}`,
      `Language: ${language}`,
      typeof navigator !== "undefined" ? `Browser: ${navigator.userAgent}` : ""
    ].filter(Boolean);
    return copyText(lines.join("\n"), t("Diagnostic info copied."));
  }

  const isLocal = typeof window !== "undefined" && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);

  return (
    <div className="settings-card-stack settings-about-page">
      <section className="card app-card">
        <div className="settings-about-hero">
          <span className="settings-about-mark" aria-hidden="true">⬢</span>
          <div className="settings-about-copy">
            <strong>NivaDesk</strong>
            <p className="muted-copy">{t("An EGGcraft brand for studio workspace management.")}</p>
            <p className="settings-about-version">
              {t("Version")} {CHANGELOG[0]?.version ?? ""}
              {CHANGELOG[0]?.date ? ` · ${CHANGELOG[0].date}` : ""}
              {" · "}
              {isLocal ? t("Local") : t("Web")}
            </p>
            <div className="settings-button-row">
              <Link className="button secondary" href="/guide" target="_blank" rel="noopener noreferrer">{t("User guide")}</Link>
              <Link className="button secondary" href="/changelog" target="_blank" rel="noopener noreferrer">{t("What's new")}</Link>
            </div>
          </div>
          {/* The web build is the release: what is running is what is published. */}
          <span className="settings-status-pill is-saved" title={t("The web app always runs the latest release.")}>
            <span className="settings-status-pill-mark" aria-hidden="true">✓</span>
            {t("Up to date")}
          </span>
        </div>
      </section>

      <section className="card app-card">
        <SettingsCardHead
          icon={<CardIconGlyph icon="storage" />}
          title={t("Current workspace")}
          subtitle={t("Technical details for this signed-in workspace.")}
        />
        <div className="settings-kv-grid">
          <div className="settings-kv">
            <span>{t("Workspace")}</span>
            <strong>{workspace.name}</strong>
          </div>
          <div className="settings-kv">
            <span>{t("Company ID")}</span>
            <strong>{workspace.id}</strong>
            <button className="button secondary settings-kv-action" type="button" onClick={() => { void copyText(workspace.id, t("Copied.")); }}>
              {t("Copy")}
            </button>
          </div>
          <div className="settings-kv">
            <span>{t("Platform")}</span>
            <strong>Next.js + Firebase</strong>
          </div>
          <div className="settings-kv">
            <span>{t("Sync")}</span>
            <strong>{t("Web, Mac and iPhone")}</strong>
            <span className={online ? "settings-dot-status" : "settings-dot-status is-offline"}>{online ? t("Online") : t("Offline")}</span>
          </div>
        </div>
        <p className="muted-copy">{t("NivaDesk keeps orders, Client Files, plan guards and card profiles synced across the Swift app, web portal and Firebase backend.")}</p>
        <div className="settings-action-row">
          <button className="button secondary" type="button" onClick={() => { void copyDiagnostics(); }}>
            {t("Copy diagnostic info")}
          </button>
        </div>
        {diagStatus ? <p className="success-copy">{t(diagStatus)}</p> : null}
      </section>

      <footer className="settings-footer-note">
        <p><strong>{t("© 2026 All rights reserved.")}</strong></p>
        <p>{t("This software and all its components, including its custom logic, layout, and AI integration systems, are the exclusive intellectual property of the developer.")}</p>
      </footer>
    </div>
  );
}

function PlaceholderSection({ title, detail, action, t }: { title: string; detail: string; action?: React.ReactNode; t: (text: string) => string }) {
  return (
    <section className="card app-card">
      <CardTitle icon="notes" eyebrow={t("Status")} title={title} />
      <p className="muted-copy">{detail}</p>
      {action}
    </section>
  );
}

function InfoTile({
  label,
  value,
  action,
  hint
}: {
  label: string;
  value: string;
  action?: { label: string; onClick: () => void };
  hint?: string;
}) {
  return (
    <article className="mini-panel settings-info-tile" title={hint}>
      <span>{label}</span>
      <strong>{value}</strong>
      {action ? (
        <button className="button secondary settings-info-tile-action" type="button" onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
    </article>
  );
}
