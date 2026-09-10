import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";

// Feedback v1 — the in-app note and the admin inbox, over the feedback
// callables (functions/feedback.js). Nothing here reads Firestore directly:
// both collections are server-only.

export type FeedbackExperience = "easy" | "okay" | "difficult";
export type FeedbackKind = "problem" | "missing_feature" | "suggestion";
export type FeedbackTrigger = "first_success" | "manual";
export type FeedbackStatus = "new" | "reviewing" | "planned" | "in_progress" | "shipped" | "closed" | "not_planned";

export const FEEDBACK_EXPERIENCES: FeedbackExperience[] = ["easy", "okay", "difficult"];
export const FEEDBACK_KINDS: FeedbackKind[] = ["problem", "missing_feature", "suggestion"];
export const FEEDBACK_STATUSES: FeedbackStatus[] = ["new", "reviewing", "planned", "in_progress", "shipped", "closed", "not_planned"];
export const FEEDBACK_TEXT_MAX = 2000;

export type FeedbackPromptResult = { ok: boolean; enabled: boolean; show: boolean; campaign: string; reason: string };
export type FeedbackSubmitInput = {
  trigger: FeedbackTrigger;
  experience: FeedbackExperience;
  kind?: FeedbackKind | "";
  text?: string;
  page?: string;
  clientKey?: string;
  language?: string;
};
export type FeedbackSubmitResult = { ok: boolean; id: string; duplicate: boolean };

export type FeedbackRow = {
  id: string; createdAtMs: number; updatedAtMs: number;
  feedbackType: string; kind: string; experience: string; status: FeedbackStatus | string;
  trigger: string; stage: string; companyId: string; workspaceName: string; userEmail: string;
  page: string; platform: string; language: string; excerpt: string; textLength: number; ownerUid: string;
  category: string; impact: string | null;
};
export type FeedbackRecord = FeedbackRow & {
  uid: string; text: string; adminNote: string; campaign: string; source: string;
  statusHistory: { status: string; atMs: number; byUid: string }[];
};
export type FeedbackListResult = {
  ok: boolean; rows: FeedbackRow[]; pageSize: number; nextBeforeMs: number;
  statuses: FeedbackStatus[]; feedbackTypes: string[]; kinds: FeedbackKind[]; experiences: FeedbackExperience[];
};

const call = <TIn, TOut>(name: string) => httpsCallable<TIn, TOut>(functions, name);

export async function getFeedbackPrompt(companyId: string, page: string): Promise<FeedbackPromptResult> {
  return (await call<{ companyId: string; page: string }, FeedbackPromptResult>("getFeedbackPrompt")({ companyId, page })).data;
}

/** The card is on screen: only this confirmed showing counts for the server's seven-day cap. Idempotent inside a minute. */
export async function confirmFeedbackPromptShown(companyId: string, campaign: string): Promise<FeedbackPromptResult & { recorded?: boolean }> {
  return (await call<{ companyId: string; shown: string }, FeedbackPromptResult & { recorded?: boolean }>("getFeedbackPrompt")({ companyId, shown: campaign })).data;
}

export async function dismissFeedbackPrompt(companyId: string, campaign: string) {
  return (await call<{ companyId: string; campaign: string }, { ok: boolean; campaign: string; cooldownDays: number }>("dismissFeedbackPrompt")({ companyId, campaign })).data;
}

export async function submitFeedback(companyId: string, input: FeedbackSubmitInput): Promise<FeedbackSubmitResult> {
  return (await call<{ companyId: string } & FeedbackSubmitInput, FeedbackSubmitResult>("submitFeedback")({ companyId, ...input })).data;
}

export async function listFeedback(filters: { status?: FeedbackStatus | ""; feedbackType?: string; limit?: number; beforeMs?: number } = {}): Promise<FeedbackListResult> {
  return (await call<typeof filters, FeedbackListResult>("listFeedback")(filters)).data;
}

export async function getFeedbackDetail(id: string): Promise<FeedbackRecord> {
  return (await call<{ id: string }, { ok: boolean; feedback: FeedbackRecord }>("getFeedbackDetail")({ id })).data.feedback;
}

export async function updateFeedbackStatus(id: string, status: FeedbackStatus, adminNote?: string): Promise<FeedbackRecord> {
  const payload: { id: string; status: FeedbackStatus; adminNote?: string } = { id, status };
  if (adminNote !== undefined) payload.adminNote = adminNote;
  return (await call<typeof payload, { ok: boolean; feedback: FeedbackRecord }>("updateFeedbackStatus")(payload)).data.feedback;
}

/** A user-facing sentence for a failed call; the keys are translated by the caller. */
export function feedbackErrorText(error: unknown): string {
  const code = String((error as { code?: string } | null)?.code || "").replace(/^functions\//, "");
  if (code === "resource-exhausted") return "Too many messages in a short time. Please try again later.";
  if (code === "failed-precondition") return "Feedback is not available yet.";
  if (code === "permission-denied") return "You do not have access to this workspace.";
  if (code === "invalid-argument") return "Please choose how it is going before sending.";
  return "Your feedback could not be sent. Please try again.";
}

export function newFeedbackClientKey(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID().replace(/-/g, "").slice(0, 32);
  } catch { /* fall through */ }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}
