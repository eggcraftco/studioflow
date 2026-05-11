import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";
import type { OrderDetailCardId } from "@/lib/studioflow/cardLayouts";
import { withWebSyncStatus } from "@/lib/studioflow/syncStatus";

export type HeadingItem = {
  id: string;
  title: string;
};

export type ScheduleHeadingItem = HeadingItem & {
  days?: number;
  hours?: number;
  priority?: string;
  notify?: boolean;
};

export type BlockHeadingSettings = {
  businessType: string;
  businessDescriptionPrompt: string;
  customSteps: HeadingItem[];
  customFields: HeadingItem[];
  customToggles: HeadingItem[];
  activeStatuses: string[];
  materialsToggles: HeadingItem[];
  materialsDefaultChecks: HeadingItem[];
  financialExpenseItems: HeadingItem[];
  financialRemainingItems: HeadingItem[];
  financialShowBaseCost: boolean;
  financialBaseCostLabel: string;
  summaryStep1: string;
  summaryStep2: string;
  orderListStep1: string;
  orderListStep2: string;
  invLabel1: string;
  invLabel2: string;
  invLabel3: string;
  invLabel4: string;
  showStatusNotesSupplier: boolean;
  showMaterialsNotesSupplier: boolean;
  statusNotesSupplierLabel: string;
  materialsNotesSupplierLabel: string;
  scheduleQuickReminders: ScheduleHeadingItem[];
  communicationShowTelephone: boolean;
  communicationShowEmail: boolean;
  communicationShowAddress: boolean;
  communicationShowChannel: boolean;
  communicationShowCustomerNotes: boolean;
  communicationChannelLabels: string[];
  specialNoteSections: HeadingItem[];
};

type BlockHeadingCallableResult = {
  ok?: boolean;
  settings?: BlockHeadingSettings;
  message?: string;
  [key: string]: unknown;
};

export const WEB_BLOCK_HEADING_CARD_IDS = new Set<OrderDetailCardId>([
  "summary",
  "financial",
  "status",
  "customer",
  "notes",
  "materials",
  "schedule"
]);

function friendlyBlockHeadingError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("StudioFlow Lite")) return "Card customization is available from StudioFlow Lite.";
  if (/permission|role|denied/i.test(message)) return "Your workspace role cannot edit block headings.";
  if (/not available on web/i.test(message)) return "Block heading editing for this card is not available on web yet.";
  return message || "Could not save block headings. Please try again.";
}

async function callBlockHeadingFunction(name: string, payload: Record<string, unknown>) {
  try {
    const callable = httpsCallable<Record<string, unknown>, BlockHeadingCallableResult>(functions, name);
    const response = await callable(payload);
    if (response.data?.ok === false) {
      throw new Error(response.data.message || "Block heading action failed.");
    }
    return response.data;
  } catch (error) {
    throw new Error(friendlyBlockHeadingError(error));
  }
}

export async function loadWorkspaceBlockHeadings(workspace: WorkspaceContext) {
  const response = await callBlockHeadingFunction("getWorkspaceBlockHeadings", {
    companyId: workspace.id
  });
  if (!response.settings) throw new Error("Could not load block headings.");
  return response.settings;
}

export async function saveWorkspaceBlockHeadings(
  workspace: WorkspaceContext,
  cardId: OrderDetailCardId,
  settings: BlockHeadingSettings
) {
  const response = await withWebSyncStatus(() => callBlockHeadingFunction("saveWorkspaceBlockHeadings", {
      companyId: workspace.id,
      cardId,
      settings
    }),
    "Saving block headings to cloud."
  );
  if (!response.settings) throw new Error("Could not save block headings.");
  return response.settings;
}
