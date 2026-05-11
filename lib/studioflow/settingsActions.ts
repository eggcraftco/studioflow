import { httpsCallable } from "firebase/functions";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db, functions } from "@/lib/firebase/client";
import { PLAN_ENTITLEMENTS, type StudioBillingPlan } from "@/lib/studioflow/plans";
import {
  type DashboardWidgetVisibility,
  normalizeWorkspaceRole,
  workspaceAccessAllows,
  type CompanyNumberSetting,
  type WorkspaceContext
} from "@/lib/studioflow/firestore";
import { withWebSyncStatus } from "@/lib/studioflow/syncStatus";

export type UploadSafetySettingsInput = {
  uploadSafetyRequirePolicyAcceptance: boolean;
  uploadSafetyMaxFileSizeMB: number;
};

export type UploadSafetySettingsResult = {
  ok?: boolean;
  message?: string;
  settings?: UploadSafetySettingsInput;
};

export type PdfExportSettingsInput = {
  pdfShowCustomer: boolean;
  pdfShowContact: boolean;
  pdfShowPreview: boolean;
  pdfShowFinCustomer: boolean;
  pdfShowPaymentMethod: boolean;
  pdfShowFinInternal: boolean;
  pdfShowStatus: boolean;
  pdfShowShipping: boolean;
  pdfShowMaterials: boolean;
  pdfShowPriority: boolean;
  companyNumbers: CompanyNumberSetting[];
};

export type PdfExportSettingsResult = {
  ok?: boolean;
  message?: string;
  settings?: PdfExportSettingsInput;
};

export type FinancialSettingsInput = {
  selectedCurrency: string;
  selectedDecimalSeparator: string;
  feePercentage: number;
  taxRuleNameRevenue: string;
  taxRuleNameProfit: string;
  defaultTaxRate: number;
  taxCalculationType: string;
  taxMilestoneEnabled: boolean;
  taxMilestoneDate: number;
};

export type FinancialSettingsResult = {
  ok?: boolean;
  message?: string;
  settings?: FinancialSettingsInput;
};

export type LanguageSettingsInput = {
  selectedLanguage: string;
};

export type LanguageSettingsResult = {
  ok?: boolean;
  message?: string;
  settings?: LanguageSettingsInput;
};

export type ThemeBrandingSettingsInput = {
  appTheme: string;
  appSubtitle: string;
};

export type ThemeBrandingSettingsResult = {
  ok?: boolean;
  message?: string;
  settings?: ThemeBrandingSettingsInput;
};

export type DashboardWidgetVisibilityResult = {
  ok?: boolean;
  message?: string;
  visibility?: DashboardWidgetVisibility;
};

export type OrderCardDisplaySettingsInput = {
  showStatusBadges: boolean;
};

export type OrderCardDisplaySettingsResult = {
  ok?: boolean;
  message?: string;
  settings?: OrderCardDisplaySettingsInput;
};

export type RecalculateFinancialSettingsResult = {
  ok?: boolean;
  message?: string;
  updatedCount?: number;
};

export type ImportWorkspaceBackupResult = {
  ok?: boolean;
  message?: string;
  importedOrders?: number;
  importedCustomers?: number;
  importedSettings?: boolean;
};

export type DeleteWorkspaceDataResult = {
  ok?: boolean;
  message?: string;
  deletedOrders?: number;
  deletedCustomers?: number;
};

export type UpdateWorkspaceBillingPlanResult = {
  ok: boolean;
  message: string;
  plan: StudioBillingPlan;
};

export function canEditWorkspaceSettingsForRole(role: string) {
  const normalized = normalizeWorkspaceRole(role);
  return normalized === "owner" || normalized === "admin" || normalized === "member";
}

export function canDeleteWorkspaceDataForRole(role: string) {
  const normalized = normalizeWorkspaceRole(role);
  return normalized === "owner" || normalized === "admin";
}

export function canUseOwnerTestingControlsForRole(role: string) {
  return normalizeWorkspaceRole(role) === "owner";
}

function friendlySettingsError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/permission|role|denied/i.test(message)) return "Your workspace role cannot edit this settings section.";
  return message || "Settings could not be saved.";
}

export async function saveUploadSafetySettings(workspace: WorkspaceContext, settings: UploadSafetySettingsInput) {
  if (!canEditWorkspaceSettingsForRole(workspace.role)) {
    throw new Error("Your workspace role cannot edit this settings section.");
  }

  try {
    return await withWebSyncStatus(async () => {
      const callable = httpsCallable<Record<string, unknown>, UploadSafetySettingsResult>(functions, "saveUploadSafetySettings");
      const result = await callable({
        companyId: workspace.id,
        settings
      });
      if (typeof window !== "undefined" && result.data.settings) {
        window.dispatchEvent(new CustomEvent("studioflow-settings-updated", { detail: { settings: result.data.settings } }));
      }
      return result.data;
    }, "Saving settings to cloud.");
  } catch (error) {
    throw new Error(friendlySettingsError(error));
  }
}

export async function updateWorkspaceBillingPlan(workspace: WorkspaceContext, plan: StudioBillingPlan): Promise<UpdateWorkspaceBillingPlanResult> {
  if (!canUseOwnerTestingControlsForRole(workspace.role)) {
    throw new Error("Only the workspace owner can change the plan.");
  }

  const entitlements = PLAN_ENTITLEMENTS[plan];
  if (!entitlements) {
    throw new Error("Unknown plan selected.");
  }

  try {
    await withWebSyncStatus(async () => {
      await setDoc(doc(db, "companies", workspace.id), {
        billingPlan: entitlements.plan,
        billingPlanName: entitlements.title,
        billingPlanSource: "manual_workspace",
        billingUpdatedAt: serverTimestamp(),
        billingStorageLimitMB: entitlements.storageLimitMB,
        billingTeamMemberLimit: entitlements.teamMemberLimit,
        updatedAt: serverTimestamp()
      }, { merge: true });
    }, "Saving plan test change to cloud.");
    return {
      ok: true,
      message: `Plan updated to ${entitlements.title}.`,
      plan: entitlements.plan
    };
  } catch (error) {
    throw new Error(friendlySettingsError(error));
  }
}

export async function savePdfExportSettings(workspace: WorkspaceContext, settings: PdfExportSettingsInput) {
  if (!canEditWorkspaceSettingsForRole(workspace.role)) {
    throw new Error("Your workspace role cannot edit this settings section.");
  }

  try {
    return await withWebSyncStatus(async () => {
      const callable = httpsCallable<Record<string, unknown>, PdfExportSettingsResult>(functions, "savePdfExportSettings");
      const result = await callable({
        companyId: workspace.id,
        settings
      });
      if (typeof window !== "undefined" && result.data.settings) {
        window.dispatchEvent(new CustomEvent("studioflow-settings-updated", { detail: { settings: result.data.settings } }));
      }
      return result.data;
    }, "Saving PDF settings to cloud.");
  } catch (error) {
    throw new Error(friendlySettingsError(error));
  }
}

export async function saveFinancialSettings(workspace: WorkspaceContext, settings: FinancialSettingsInput) {
  if (!canEditWorkspaceSettingsForRole(workspace.role)) {
    throw new Error("Your workspace role cannot edit this settings section.");
  }

  try {
    return await withWebSyncStatus(async () => {
      const callable = httpsCallable<Record<string, unknown>, FinancialSettingsResult>(functions, "saveFinancialSettings");
      const result = await callable({
        companyId: workspace.id,
        settings
      });
      if (typeof window !== "undefined" && result.data.settings) {
        window.dispatchEvent(new CustomEvent("studioflow-settings-updated", { detail: { settings: result.data.settings } }));
      }
      return result.data;
    }, "Saving financial settings to cloud.");
  } catch (error) {
    throw new Error(friendlySettingsError(error));
  }
}

export async function saveLanguageSettings(workspace: WorkspaceContext, settings: LanguageSettingsInput) {
  if (!canEditWorkspaceSettingsForRole(workspace.role)) {
    throw new Error("Your workspace role cannot edit this settings section.");
  }

  try {
    return await withWebSyncStatus(async () => {
      const callable = httpsCallable<Record<string, unknown>, LanguageSettingsResult>(functions, "saveLanguageSettings");
      const result = await callable({
        companyId: workspace.id,
        settings
      });
      if (typeof window !== "undefined" && result.data.settings) {
        window.dispatchEvent(new CustomEvent("studioflow-settings-updated", { detail: { settings: result.data.settings } }));
      }
      return result.data;
    }, "Saving language settings to cloud.");
  } catch (error) {
    throw new Error(friendlySettingsError(error));
  }
}

export async function saveThemeBrandingSettings(workspace: WorkspaceContext, settings: ThemeBrandingSettingsInput) {
  if (!canEditWorkspaceSettingsForRole(workspace.role)) {
    throw new Error("Your workspace role cannot edit this settings section.");
  }

  try {
    return await withWebSyncStatus(async () => {
      const callable = httpsCallable<Record<string, unknown>, ThemeBrandingSettingsResult>(functions, "saveThemeBrandingSettings");
      const result = await callable({
        companyId: workspace.id,
        settings
      });
      if (typeof window !== "undefined" && result.data.settings) {
        window.dispatchEvent(new CustomEvent("studioflow-settings-updated", { detail: { settings: result.data.settings } }));
      }
      return result.data;
    }, "Saving theme settings to cloud.");
  } catch (error) {
    throw new Error(friendlySettingsError(error));
  }
}

export async function saveDashboardWidgetVisibility(workspace: WorkspaceContext, visibility: DashboardWidgetVisibility) {
  if (!canEditWorkspaceSettingsForRole(workspace.role)) {
    throw new Error("Your workspace role cannot edit dashboard settings.");
  }

  try {
    return await withWebSyncStatus(async () => {
      const callable = httpsCallable<Record<string, unknown>, DashboardWidgetVisibilityResult>(functions, "saveDashboardWidgetVisibility");
      const result = await callable({
        companyId: workspace.id,
        visibility
      });
      return result.data;
    }, "Saving dashboard customization to cloud.");
  } catch (error) {
    throw new Error(friendlySettingsError(error));
  }
}

export async function saveOrderCardDisplaySettings(workspace: WorkspaceContext, settings: OrderCardDisplaySettingsInput) {
  const normalizedRole = normalizeWorkspaceRole(workspace.role);
  const isCustomRole = /^custom_[A-Za-z0-9_-]{6,64}$/.test(workspace.role);
  const canEditOrderCards = workspaceAccessAllows(workspace.memberAccess, "orders") &&
    normalizedRole !== "viewer" &&
    (normalizedRole !== "" || isCustomRole);
  if (!canEditOrderCards) {
    throw new Error("Your workspace role cannot edit order card settings.");
  }

  try {
    return await withWebSyncStatus(async () => {
      const callable = httpsCallable<Record<string, unknown>, OrderCardDisplaySettingsResult>(functions, "saveOrderCardDisplaySettings");
      const result = await callable({
        companyId: workspace.id,
        settings
      });
      return result.data;
    }, "Saving order card settings to cloud.");
  } catch (error) {
    throw new Error(friendlySettingsError(error));
  }
}

export async function recalculateFinancialSettingsForOrders(workspace: WorkspaceContext) {
  if (!canEditWorkspaceSettingsForRole(workspace.role)) {
    throw new Error("Your workspace role cannot edit this settings section.");
  }

  try {
    return await withWebSyncStatus(async () => {
      const callable = httpsCallable<Record<string, unknown>, RecalculateFinancialSettingsResult>(functions, "recalculateFinancialSettingsForOrders");
      const result = await callable({
        companyId: workspace.id
      });
      return result.data;
    }, "Recalculating order finance.");
  } catch (error) {
    throw new Error(friendlySettingsError(error));
  }
}

export async function importWorkspaceBackup(workspace: WorkspaceContext, backup: unknown) {
  if (!canEditWorkspaceSettingsForRole(workspace.role)) {
    throw new Error("Your workspace role cannot import workspace data.");
  }

  try {
    return await withWebSyncStatus(async () => {
      const callable = httpsCallable<Record<string, unknown>, ImportWorkspaceBackupResult>(functions, "importWorkspaceBackup");
      const result = await callable({
        companyId: workspace.id,
        backup
      });
      return result.data;
    }, "Importing workspace backup to cloud.");
  } catch (error) {
    throw new Error(friendlySettingsError(error));
  }
}

export async function deleteWorkspaceData(workspace: WorkspaceContext, confirmation: string) {
  if (!canDeleteWorkspaceDataForRole(workspace.role)) {
    throw new Error("Only workspace Owner or Admin can delete workspace data.");
  }

  try {
    return await withWebSyncStatus(async () => {
      const callable = httpsCallable<Record<string, unknown>, DeleteWorkspaceDataResult>(functions, "deleteWorkspaceData");
      const result = await callable({
        companyId: workspace.id,
        confirmation
      });
      return result.data;
    }, "Deleting workspace orders and customers.");
  } catch (error) {
    throw new Error(friendlySettingsError(error));
  }
}
