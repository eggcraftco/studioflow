import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import { type WorkspaceContext } from "@/lib/studioflow/firestore";

export type StudioSupportTicketType = "appSupport" | "workspace";
export type StudioSupportTicketStatus = "open" | "inProgress" | "waitingForUser" | "resolved" | "closed";

export type StudioSupportTicket = {
  id: string;
  ticketType: StudioSupportTicketType | string;
  companyId: string;
  companyName: string;
  createdByUid: string;
  createdByEmail: string;
  createdByName: string;
  title: string;
  message: string;
  category: string;
  priority: string;
  status: StudioSupportTicketStatus | string;
  platform: string;
  appVersion: string;
  deviceInfo: string;
  language: string;
  createdAtMillis: number;
  updatedAtMillis: number;
  lastMessageAtMillis: number;
  lastMessageByUid?: string;
  lastMessageByEmail?: string;
  lastMessageByRole?: string;
  lastMessagePreview?: string;
  readBy?: Record<string, unknown>;
};

export type StudioSupportTicketMessage = {
  id: string;
  ticketId: string;
  message: string;
  authorUid: string;
  authorEmail: string;
  authorName: string;
  authorRole: string;
  createdAtMillis: number;
};

export type SupportTicketFormInput = {
  title: string;
  message: string;
  category: string;
  priority: string;
  language: string;
};

export type TicketListResult = {
  ok?: boolean;
  tickets?: StudioSupportTicket[];
  isSupportAdmin?: boolean;
  canSeeWorkspaceQueue?: boolean;
};

export type TicketMessagesResult = {
  ok?: boolean;
  ticketId?: string;
  messages?: StudioSupportTicketMessage[];
};

export type TicketMutationResult = {
  ok?: boolean;
  ticketId?: string;
  messageId?: string;
  status?: string;
  message?: string;
};

export type SupportTicketUnreadSummary = {
  ok?: boolean;
  totalUnread?: number;
  unreadCount?: number;
  appSupportUnread?: number;
  supportUnread?: number;
  workspaceUnread?: number;
  supportTicketIds?: string[];
  workspaceTicketIds?: string[];
  unreadTicketIds?: string[];
  appSupportTicketIds?: string[];
  supportUnreadIds?: string[];
  workspaceUnreadIds?: string[];
  appSupportUnreadIds?: string[];
};

function webDeviceInfo() {
  if (typeof navigator === "undefined") return "Web";
  return navigator.userAgent || "Web";
}

function supportError(error: unknown) {
  const raw = error instanceof Error ? error.message : "";
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code || "") : "";
  const details = typeof error === "object" && error && "details" in error ? (error as { details?: unknown }).details : undefined;
  const detailMessage = typeof details === "string"
    ? details
    : details && typeof details === "object" && "message" in details
      ? String((details as { message?: unknown }).message || "")
      : "";
  const combined = `${code} ${raw} ${detailMessage}`.trim();
  if (/unauthenticated/i.test(combined)) return "Please sign in again to use Support / Tickets.";
  if (/permission|denied/i.test(combined)) return "You do not have permission for this ticket action.";
  if (/not-found/i.test(combined)) return "Ticket not found.";
  if (/invalid-argument/i.test(combined)) return "Please check the ticket fields and try again.";
  if (/internal/i.test(combined)) {
    const meaningful = detailMessage || raw.replace(/^internal$/i, "").trim();
    return meaningful || "Reply could not be sent yet. Please refresh and try again after the support ticket functions finish deploying.";
  }
  return raw || detailMessage || "Support ticket action failed.";
}

function supportTimestampMillis(value: unknown): number {
  if (!value) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value instanceof Date) return value.getTime();

  if (typeof value === "object") {
    const source = value as { seconds?: unknown; _seconds?: unknown; nanoseconds?: unknown; _nanoseconds?: unknown; toMillis?: unknown };
    if (typeof source.toMillis === "function") {
      const millis = source.toMillis();
      return typeof millis === "number" && Number.isFinite(millis) ? millis : 0;
    }

    const seconds = Number(source.seconds ?? source._seconds ?? 0);
    const nanoseconds = Number(source.nanoseconds ?? source._nanoseconds ?? 0);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.round((seconds * 1000) + (Number.isFinite(nanoseconds) ? nanoseconds / 1_000_000 : 0));
    }
  }

  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.getTime() : 0;
  }

  return 0;
}

export function supportTicketIsUnread(ticket: StudioSupportTicket, currentUserUid: string) {
  const uid = String(currentUserUid || "").trim();
  if (!uid) return false;

  const lastMessageAt = supportTimestampMillis(ticket.lastMessageAtMillis);
  if (lastMessageAt <= 0) return false;

  if (String(ticket.lastMessageByUid || "") === uid) return false;

  const readBy = ticket.readBy && typeof ticket.readBy === "object" ? ticket.readBy : {};
  const readAt = supportTimestampMillis((readBy as Record<string, unknown>)[uid]);
  return lastMessageAt > readAt;
}

export function supportUnreadTotal(summary: SupportTicketUnreadSummary | null | undefined) {
  const fallbackCount =
    (Number(summary?.appSupportUnread ?? summary?.supportUnread ?? 0) || 0) +
    (Number(summary?.workspaceUnread ?? 0) || 0);
  const count = Number(summary?.totalUnread ?? summary?.unreadCount ?? fallbackCount);
  return Number.isFinite(count) && count > 0 ? Math.round(count) : 0;
}

export function supportUnreadTicketIds(summary: SupportTicketUnreadSummary | null | undefined) {
  const ids = [
    ...(summary?.unreadTicketIds ?? []),
    ...(summary?.supportTicketIds ?? []),
    ...(summary?.workspaceTicketIds ?? []),
    ...(summary?.appSupportTicketIds ?? []),
    ...(summary?.supportUnreadIds ?? []),
    ...(summary?.workspaceUnreadIds ?? []),
    ...(summary?.appSupportUnreadIds ?? [])
  ];
  return Array.from(new Set(ids.map(item => String(item || "").trim()).filter(Boolean)));
}

function basePayload(workspace: WorkspaceContext, input: SupportTicketFormInput) {
  return {
    companyId: workspace.id,
    companyName: workspace.name,
    title: input.title,
    message: input.message,
    category: input.category,
    priority: input.priority,
    platform: "web",
    appVersion: "web",
    deviceInfo: webDeviceInfo(),
    language: input.language || "English"
  };
}

export async function createNivaDeskSupportTicket(workspace: WorkspaceContext, input: SupportTicketFormInput) {
  try {
    const callable = httpsCallable<Record<string, unknown>, TicketMutationResult>(functions, "createSupportTicket");
    const result = await callable(basePayload(workspace, input));
    return result.data;
  } catch (error) {
    throw new Error(supportError(error));
  }
}

export async function createWorkspaceSupportTicket(workspace: WorkspaceContext, input: SupportTicketFormInput) {
  try {
    const callable = httpsCallable<Record<string, unknown>, TicketMutationResult>(functions, "createWorkspaceTicket");
    const result = await callable(basePayload(workspace, input));
    return result.data;
  } catch (error) {
    throw new Error(supportError(error));
  }
}

export async function listNivaDeskSupportTickets(workspace: WorkspaceContext) {
  try {
    const callable = httpsCallable<Record<string, unknown>, TicketListResult>(functions, "listMySupportTickets");
    const result = await callable({ companyId: workspace.id });
    return { ...result.data, tickets: result.data.tickets ?? [] };
  } catch (error) {
    throw new Error(supportError(error));
  }
}

export async function listWorkspaceSupportTickets(workspace: WorkspaceContext) {
  try {
    const callable = httpsCallable<Record<string, unknown>, TicketListResult>(functions, "listWorkspaceTickets");
    const result = await callable({ companyId: workspace.id });
    return { ...result.data, tickets: result.data.tickets ?? [] };
  } catch (error) {
    throw new Error(supportError(error));
  }
}

export async function updateNivaDeskSupportTicketStatus(workspace: WorkspaceContext, ticketId: string, status: StudioSupportTicketStatus) {
  try {
    const callable = httpsCallable<Record<string, unknown>, TicketMutationResult>(functions, "updateSupportTicketStatus");
    const result = await callable({ companyId: workspace.id, ticketId, status });
    return result.data;
  } catch (error) {
    throw new Error(supportError(error));
  }
}

export async function updateWorkspaceSupportTicketStatus(workspace: WorkspaceContext, ticketId: string, status: StudioSupportTicketStatus) {
  try {
    const callable = httpsCallable<Record<string, unknown>, TicketMutationResult>(functions, "updateWorkspaceTicketStatus");
    const result = await callable({ companyId: workspace.id, ticketId, status });
    return result.data;
  } catch (error) {
    throw new Error(supportError(error));
  }
}

export async function listNivaDeskSupportTicketMessages(workspace: WorkspaceContext, ticketId: string) {
  try {
    const callable = httpsCallable<Record<string, unknown>, TicketMessagesResult>(functions, "listSupportTicketMessages");
    const result = await callable({ companyId: workspace.id, ticketId });
    return { ...result.data, messages: result.data.messages ?? [] };
  } catch (error) {
    throw new Error(supportError(error));
  }
}

export async function listWorkspaceSupportTicketMessages(workspace: WorkspaceContext, ticketId: string) {
  try {
    const callable = httpsCallable<Record<string, unknown>, TicketMessagesResult>(functions, "listWorkspaceTicketMessages");
    const result = await callable({ companyId: workspace.id, ticketId });
    return { ...result.data, messages: result.data.messages ?? [] };
  } catch (error) {
    throw new Error(supportError(error));
  }
}

export async function addNivaDeskSupportTicketReply(workspace: WorkspaceContext, ticketId: string, message: string) {
  try {
    const callable = httpsCallable<Record<string, unknown>, TicketMutationResult>(functions, "addSupportTicketReply");
    const result = await callable({ companyId: workspace.id, ticketId, message });
    return result.data;
  } catch (error) {
    throw new Error(supportError(error));
  }
}

export async function addWorkspaceSupportTicketReply(workspace: WorkspaceContext, ticketId: string, message: string) {
  try {
    const callable = httpsCallable<Record<string, unknown>, TicketMutationResult>(functions, "addWorkspaceTicketReply");
    const result = await callable({ companyId: workspace.id, ticketId, message });
    return result.data;
  } catch (error) {
    throw new Error(supportError(error));
  }
}

export async function markNivaDeskSupportTicketRead(workspace: WorkspaceContext, ticketId: string) {
  try {
    const callable = httpsCallable<Record<string, unknown>, TicketMutationResult>(functions, "markSupportTicketRead");
    const result = await callable({ companyId: workspace.id, ticketId });
    return result.data;
  } catch (error) {
    throw new Error(supportError(error));
  }
}

export async function markWorkspaceSupportTicketRead(workspace: WorkspaceContext, ticketId: string) {
  try {
    const callable = httpsCallable<Record<string, unknown>, TicketMutationResult>(functions, "markWorkspaceTicketRead");
    const result = await callable({ companyId: workspace.id, ticketId });
    return result.data;
  } catch (error) {
    throw new Error(supportError(error));
  }
}

export async function getSupportTicketUnreadSummary(workspace: WorkspaceContext) {
  try {
    const callable = httpsCallable<Record<string, unknown>, SupportTicketUnreadSummary>(functions, "getSupportTicketUnreadSummary");
    const result = await callable({ companyId: workspace.id });
    return result.data;
  } catch (error) {
    throw new Error(supportError(error));
  }
}
