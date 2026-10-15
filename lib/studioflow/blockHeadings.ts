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
  // Rows on the Repair Intake card: ids stay put, titles are the workspace's to
  // rename ("Ring Size" for a jeweller, "Case Size" for a watchmaker).
  repairIntakeFields: HeadingItem[];
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
  "schedule",
  "repairIntake",
  // invoiceItems uses the dialog only to edit the workspace company invoice numbers
  // (VAT/EORI/company no.) — it has no renamable headings.
  "invoiceItems"
]);

function friendlyBlockHeadingError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("NivaDesk Starter")) return "Card customization is available from NivaDesk Starter.";
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

async function fetchWorkspaceBlockHeadings(companyId: string) {
  const startedAt = Date.now();
  const response = await callBlockHeadingFunction("getWorkspaceBlockHeadings", { companyId });
  if (!response.settings) throw new Error("Could not load block headings.");
  // A read that started before a save finished must not put the older headings back.
  const current = blockHeadingCache.get(companyId);
  if (!current || current.at <= startedAt) blockHeadingCache.set(companyId, { settings: response.settings, at: Date.now() });
  return response.settings;
}

// Normal-session menu wait (15 Oct 2026): Orders, Schedule and Dashboard keep their loading card until this callable
// answers, and every visit called it again. Measured live the same day: a cold getWorkspaceBlockHeadings answered
// after 1.85 s, a warm one after 55 ms — so a menu click after a quiet spell waited for a function cold start. The
// headings are workspace-wide and change only through Settings, so within one page load the last answer is shown at
// once and refreshed in the background; a save puts its own answer in. Editors pass { fresh: true } and wait, as
// before. Memory only (cleared by every full load, which a workspace switch and a sign-out are), keyed by workspace.
const BLOCK_HEADING_REVALIDATE_MS = 15_000;
const blockHeadingCache = new Map<string, { settings: BlockHeadingSettings; at: number }>();
const blockHeadingInflight = new Map<string, Promise<BlockHeadingSettings>>();

function sharedBlockHeadingFetch(companyId: string) {
  const running = blockHeadingInflight.get(companyId);
  if (running) return running;
  const request = fetchWorkspaceBlockHeadings(companyId).finally(() => blockHeadingInflight.delete(companyId));
  blockHeadingInflight.set(companyId, request);
  return request;
}

export async function loadWorkspaceBlockHeadings(workspace: WorkspaceContext, options: { fresh?: boolean } = {}) {
  if (options.fresh) return fetchWorkspaceBlockHeadings(workspace.id);
  const cached = blockHeadingCache.get(workspace.id);
  if (!cached) return sharedBlockHeadingFetch(workspace.id);
  if (Date.now() - cached.at > BLOCK_HEADING_REVALIDATE_MS) {
    void sharedBlockHeadingFetch(workspace.id).catch(() => { /* the cached headings stay; the next visit tries again */ });
  }
  return cached.settings;
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
  blockHeadingCache.set(workspace.id, { settings: response.settings, at: Date.now() });
  return response.settings;
}
