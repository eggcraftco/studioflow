import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import {
  normalizeWorkspaceRole,
  type QuickReplySettings,
  type QuickReplyTemplateItem,
  type WorkspaceContext
} from "@/lib/studioflow/firestore";
import { withWebSyncStatus } from "@/lib/studioflow/syncStatus";

export type QuickReplySaveInput = {
  replyMode?: string;
  quickReplyPoliteness?: string;
  quickReplyLength?: string;
  aiKnowledgeBase?: string;
  openAIKey?: string;
  products?: QuickReplyTemplateItem[];
  rules?: QuickReplyTemplateItem[];
};

export type QuickReplyGenerateInput = {
  mode?: string;
  customerMessage?: string;
  customerName?: string;
  selectedCategory?: string;
  selectedTopic?: string;
  politeness?: string;
  length?: string;
};

type QuickReplySaveResult = {
  ok?: boolean;
  message?: string;
  settings?: QuickReplySettings;
};

type QuickReplyGenerateResult = {
  ok?: boolean;
  mode?: string;
  reply?: string;
  message?: string;
};

export type QuickReplyContributionItem = {
  id: string;
  text: string;
  authorUid: string;
  authorName: string;
  canDelete: boolean;
};

export type QuickReplyPersonalSettings = {
  replyMode: string;
  quickReplyPoliteness: string;
  quickReplyLength: string;
  onDeviceKnowledgeBase: string;
  products: QuickReplyTemplateItem[];
  rules: QuickReplyTemplateItem[];
};

export function canEditQuickReplySettingsForRole(role: string) {
  return normalizeWorkspaceRole(role) === "owner";
}

export function canContributeQuickReplyKnowledgeForRole(role: string) {
  const normalized = normalizeWorkspaceRole(role);
  return normalized === "owner" || normalized === "admin" || normalized === "member" || normalized === "workflow";
}

export function canEditPersonalQuickReplySettingsForRole(role: string) {
  return canContributeQuickReplyKnowledgeForRole(role);
}

function decodePersonalTemplateItems(value: unknown): QuickReplyTemplateItem[] {
  if (Array.isArray(value)) return value as QuickReplyTemplateItem[];
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const decoded = JSON.parse(value);
    return Array.isArray(decoded) ? decoded as QuickReplyTemplateItem[] : [];
  } catch {
    return [];
  }
}

function friendlyQuickReplyError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/API Key is missing|OpenAI API Key/i.test(message)) {
    return "OpenAI API Key is missing. Add it in Settings > Quick Reply Settings.";
  }
  if (/Apple On-Device/i.test(message)) {
    return "Apple On-Device AI is only available inside the Swift app. Use OpenAI Online or Offline Template on web.";
  }
  if (/permission|role|denied/i.test(message)) {
    return "Your workspace role cannot edit Quick Reply settings.";
  }
  return message || "Quick Reply could not complete the request.";
}

export async function saveQuickReplySettings(workspace: WorkspaceContext, input: QuickReplySaveInput) {
  if (!canEditQuickReplySettingsForRole(workspace.role)) {
    throw new Error("Your workspace role cannot edit Quick Reply settings.");
  }

  try {
    return await withWebSyncStatus(async () => {
      const callable = httpsCallable<Record<string, unknown>, QuickReplySaveResult>(functions, "saveQuickReplySettings");
      const result = await callable({
        companyId: workspace.id,
        settings: input
      });
      return result.data;
    }, "Saving Quick Reply settings to cloud.");
  } catch (error) {
    throw new Error(friendlyQuickReplyError(error));
  }
}

export async function generateQuickReply(workspace: WorkspaceContext, input: QuickReplyGenerateInput) {
  try {
    const callable = httpsCallable<Record<string, unknown>, QuickReplyGenerateResult>(functions, "generateQuickReply");
    const result = await callable({
      companyId: workspace.id,
      ...input
    });
    return result.data;
  } catch (error) {
    throw new Error(friendlyQuickReplyError(error));
  }
}


export async function listQuickReplyContributions(workspace: WorkspaceContext) {
  const callable = httpsCallable<Record<string, unknown>, { items?: QuickReplyContributionItem[] }>(functions, "listQuickReplyContributions");
  const result = await callable({ companyId: workspace.id });
  return result.data.items ?? [];
}

export async function saveQuickReplyContribution(workspace: WorkspaceContext, text: string) {
  const callable = httpsCallable<Record<string, unknown>, { message?: string }>(functions, "saveQuickReplyContribution");
  const result = await callable({ companyId: workspace.id, text });
  return result.data;
}

export async function deleteQuickReplyContribution(workspace: WorkspaceContext, contributionId: string) {
  const callable = httpsCallable<Record<string, unknown>, { message?: string }>(functions, "deleteQuickReplyContribution");
  const result = await callable({ companyId: workspace.id, contributionId });
  return result.data;
}


export async function loadQuickReplyPersonalSettings(workspace: WorkspaceContext): Promise<QuickReplyPersonalSettings> {
  const callable = httpsCallable<Record<string, unknown>, { settings?: Record<string, unknown> }>(functions, "getQuickReplyPersonalSettings");
  const result = await callable({ companyId: workspace.id });
  const data = result.data.settings ?? {};
  return {
    replyMode: typeof data.replyMode === "string" ? data.replyMode : "AI",
    quickReplyPoliteness: typeof data.quickReplyPoliteness === "string" ? data.quickReplyPoliteness : "Warm",
    quickReplyLength: typeof data.quickReplyLength === "string" ? data.quickReplyLength : "Short",
    onDeviceKnowledgeBase: typeof data.onDeviceKnowledgeBase === "string" ? data.onDeviceKnowledgeBase : "",
    products: decodePersonalTemplateItems(data.offlineProductsJSON),
    rules: decodePersonalTemplateItems(data.offlineRulesJSON)
  };
}

export async function saveQuickReplyPersonalSettings(workspace: WorkspaceContext, input: {
  replyMode?: string;
  quickReplyPoliteness?: string;
  quickReplyLength?: string;
  onDeviceKnowledgeBase?: string;
  products?: QuickReplyTemplateItem[];
  rules?: QuickReplyTemplateItem[];
}) {
  const callable = httpsCallable<Record<string, unknown>, { message?: string; settings?: Record<string, unknown> }>(functions, "saveQuickReplyPersonalSettings");
  const result = await callable({ companyId: workspace.id, settings: input });
  return result.data;
}
