import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  type Unsubscribe,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase/client";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";

export type StudioActivityNotification = {
  id: string;
  companyId: string;
  type: string;
  title: string;
  message: string;
  route: string;
  orderId: string;
  ticketId: string;
  ticketType: string;
  threadId: string;
  messageId: string;
  senderUid: string;
  senderName: string;
  senderEmail: string;
  senderPhotoURL: string;
  priority: string;
  status: string;
  source: string;
  recipientUids: string[];
  recipientEmails: string[];
  readByMillis: Record<string, number>;
  dismissedByMillis: Record<string, number>;
  createdAtMillis: number;
};

function tsMillis(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "object" && value !== null) {
    const v = value as { toMillis?: () => number; seconds?: number; _seconds?: number };
    if (typeof v.toMillis === "function") return v.toMillis();
    if (typeof v.seconds === "number") return v.seconds * 1000;
    if (typeof v._seconds === "number") return v._seconds * 1000;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function strList(value: unknown): string[] {
  return Array.isArray(value) ? (value.filter((v): v is string => typeof v === "string")) : [];
}

function millisMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const ms = tsMillis(v);
    if (ms > 0) out[k] = ms;
  }
  return out;
}

function notificationFromDoc(id: string, data: Record<string, unknown>): StudioActivityNotification {
  return {
    id,
    companyId: str(data.companyId),
    type: str(data.type, "update"),
    title: str(data.title, "Notification"),
    message: str(data.message ?? data.body),
    route: str(data.route),
    orderId: str(data.orderId),
    ticketId: str(data.ticketId),
    ticketType: str(data.ticketType),
    threadId: str(data.threadId),
    messageId: str(data.messageId),
    senderUid: str(data.senderUid),
    senderName: str(data.senderName),
    senderEmail: str(data.senderEmail),
    senderPhotoURL: str(data.senderPhotoURL ?? data.imageUrl),
    priority: str(data.priority),
    status: str(data.status),
    source: str(data.source),
    recipientUids: strList(data.recipientUids ?? data.recipients),
    recipientEmails: strList(data.recipientEmails),
    readByMillis: millisMap(data.readBy),
    dismissedByMillis: millisMap(data.dismissedBy),
    createdAtMillis: tsMillis(data.createdAt),
  };
}

export function isNotificationUnread(
  notification: StudioActivityNotification,
  uid: string,
  email: string,
): boolean {
  const uidClean = uid.trim();
  const emailClean = email.trim().toLowerCase();
  if (uidClean && uidClean in notification.readByMillis) return false;
  if (emailClean && emailClean in notification.readByMillis) return false;
  return true;
}

export function isNotificationDismissed(
  notification: StudioActivityNotification,
  uid: string,
  email: string,
): boolean {
  const uidClean = uid.trim();
  const emailClean = email.trim().toLowerCase();
  if (uidClean && uidClean in notification.dismissedByMillis) return true;
  if (emailClean && emailClean in notification.dismissedByMillis) return true;
  return false;
}

export function isNotificationVisible(
  notification: StudioActivityNotification,
  uid: string,
  email: string,
): boolean {
  if (notification.recipientUids.length === 0 && notification.recipientEmails.length === 0) return true;
  const uidClean = uid.trim();
  const emailClean = email.trim().toLowerCase();
  if (uidClean && notification.recipientUids.includes(uidClean)) return true;
  if (emailClean && notification.recipientEmails.map((e) => e.toLowerCase()).includes(emailClean)) return true;
  return false;
}

export function listenToActivityNotifications(
  workspace: WorkspaceContext,
  uid: string,
  email: string,
  callback: (items: StudioActivityNotification[]) => void,
): Unsubscribe {
  if (!workspace.id) {
    callback([]);
    return () => {};
  }
  const q = query(
    collection(db, "companies", workspace.id, "notifications"),
    orderBy("createdAt", "desc"),
    limit(100),
  );
  return onSnapshot(q, (snap) => {
    const items = snap.docs
      .map((d) => notificationFromDoc(d.id, d.data() as Record<string, unknown>))
      .filter((n) => isNotificationVisible(n, uid, email))
      .sort((a, b) => b.createdAtMillis - a.createdAtMillis);
    callback(items);
  });
}

type CallableResult<T> = { data: T };
async function call<T>(name: string, payload: Record<string, unknown>): Promise<T> {
  const fn = httpsCallable(functions, name);
  const result = (await fn(payload)) as CallableResult<T>;
  return result.data;
}

export async function markActivityNotificationRead(workspace: WorkspaceContext, notificationId: string): Promise<void> {
  if (!workspace.id || !notificationId) return;
  await call("markActivityNotificationRead", { companyId: workspace.id, notificationId });
}

export async function markAllActivityNotificationsRead(workspace: WorkspaceContext): Promise<void> {
  if (!workspace.id) return;
  await call("markAllActivityNotificationsRead", { companyId: workspace.id });
}

export async function dismissActivityNotifications(workspace: WorkspaceContext, notificationIds: string[]): Promise<void> {
  const clean = notificationIds.map((s) => s.trim()).filter(Boolean);
  if (!workspace.id || clean.length === 0) return;
  await call("dismissActivityNotifications", {
    companyId: workspace.id,
    notificationIds: Array.from(new Set(clean)),
  });
}

// ----- helpers for UI -----

export type NotificationTypeKey = "messages" | "support" | "orders" | "tasks" | "files" | "system" | "update";

export function typeKeyFor(notification: StudioActivityNotification): NotificationTypeKey {
  const t = notification.type.toLowerCase();
  const r = notification.route.toLowerCase();
  if (r.includes("message") || t.includes("message")) return "messages";
  if (r.includes("support") || t.includes("ticket") || t.includes("support")) return "support";
  if (r.includes("order") || t.includes("order") || t.includes("delivery") || t.includes("tracking")) return "orders";
  if (t.includes("task") || r.includes("task") || t.includes("reminder")) return "tasks";
  if (t.includes("file") || t.includes("attachment") || r.includes("file")) return "files";
  if (t.includes("system") || t.includes("plan") || t.includes("workspace")) return "system";
  return "update";
}

export function typeLabel(key: NotificationTypeKey | string): string {
  switch (key) {
    case "messages": return "Messages";
    case "support": return "Support";
    case "orders": return "Orders";
    case "tasks": return "Tasks";
    case "files": return "Files";
    case "system": return "System";
    case "update": return "Update";
    case "unread": return "Unread";
    default: return "Update";
  }
}

export function colorForType(key: NotificationTypeKey | string): string {
  switch (key) {
    case "messages": return "#16a34a";
    case "support": return "#8b5cf6";
    case "orders": return "#2563eb";
    case "tasks": return "#ca8a04";
    case "files": return "#0ea5e9";
    case "system": return "#6b7280";
    default: return "#16a34a";
  }
}

export function iconForType(key: NotificationTypeKey | string): string {
  switch (key) {
    case "messages": return "✉️";
    case "support": return "🛟";
    case "orders": return "✅";
    case "tasks": return "📋";
    case "files": return "📎";
    case "system": return "🛠️";
    default: return "🔔";
  }
}

export function notificationStackKey(notification: StudioActivityNotification): string {
  if (notification.threadId.trim()) return `thread:${notification.threadId.trim()}`;
  if (notification.orderId.trim()) return `order:${notification.orderId.trim()}`;
  if (notification.ticketId.trim()) return `ticket:${notification.ticketId.trim()}`;
  return `id:${notification.id}`;
}
