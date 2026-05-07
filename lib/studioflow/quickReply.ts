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

export function canEditQuickReplySettingsForRole(role: string) {
  const normalized = normalizeWorkspaceRole(role);
  return normalized === "owner" || normalized === "admin" || normalized === "member";
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
