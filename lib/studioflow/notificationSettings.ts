import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";

// Settings ▸ Notifications (GN-09, 22 Oct 2026).
//
// One place that lists every notification NivaDesk has, grouped by what it is about, and says honestly
// where each one is decided. Only the switches in NOTIFICATION_PREF_KEYS are switches: the server stores
// them with the person's other personal settings (personalInterfaceSettings/{uid}.notificationPrefs) and
// the producer reads them before it writes a bell row or sends a push. Everything else on the screen is
// a description of an existing rule (an access key, a per-thread mute, the workspace's Customer SMS
// settings, the browser's own permission) with a link to where it is actually changed — not a second
// settings system that the producers would not read.

export const NOTIFICATION_PREF_KEYS = ["memberFileUploads", "memberWorkTime"] as const;
export type NotificationPrefKey = (typeof NOTIFICATION_PREF_KEYS)[number];
export type NotificationPrefs = Record<NotificationPrefKey, boolean>;
export type NotificationChannel = "bell" | "push" | "email" | "sms";

export type NotificationSettings = {
  isOwner: boolean;
  prefs: NotificationPrefs;
  editable: Record<NotificationPrefKey, boolean>;
  channels: Record<NotificationPrefKey, NotificationChannel[]>;
  /** This person's devices registered for push in this workspace; null when the server could not count. */
  pushDeviceCount: number | null;
  smsAvailable: boolean;
};

export const NOTIFICATION_PREF_DEFAULTS: NotificationPrefs = { memberFileUploads: false, memberWorkTime: false };

export function normalizeNotificationSettings(raw: unknown): NotificationSettings {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const prefsIn = value.prefs && typeof value.prefs === "object" ? (value.prefs as Record<string, unknown>) : {};
  const editableIn = value.editable && typeof value.editable === "object" ? (value.editable as Record<string, unknown>) : {};
  const prefs = { ...NOTIFICATION_PREF_DEFAULTS };
  const editable = { memberFileUploads: false, memberWorkTime: false };
  for (const key of NOTIFICATION_PREF_KEYS) {
    prefs[key] = prefsIn[key] === true;
    editable[key] = editableIn[key] === true;
  }
  const count = typeof value.pushDeviceCount === "number" && Number.isFinite(value.pushDeviceCount) ? value.pushDeviceCount : null;
  return {
    isOwner: value.isOwner === true,
    prefs,
    editable,
    channels: { memberFileUploads: ["bell", "push"], memberWorkTime: ["bell", "push"] },
    pushDeviceCount: count,
    smsAvailable: value.smsAvailable === true,
  };
}

async function call(name: string, payload: Record<string, unknown>, fallback: string): Promise<NotificationSettings> {
  try {
    const callable = httpsCallable<Record<string, unknown>, { settings?: unknown }>(functions, name);
    const result = await callable(payload);
    return normalizeNotificationSettings(result.data?.settings);
  } catch (error) {
    const raw = error instanceof Error ? error.message : "";
    const cleaned = raw.replace(/^[a-z-]+:\s*/i, "").trim();
    if (!cleaned || /^(internal|unknown|unavailable|not-found|deadline-exceeded)$/i.test(cleaned)) throw new Error(fallback);
    throw new Error(cleaned);
  }
}

export function getNotificationSettings(workspace: WorkspaceContext) {
  return call("getNotificationSettings", { companyId: workspace.id }, "Notification settings could not be loaded.");
}

export function saveNotificationSettings(workspace: WorkspaceContext, changes: Partial<NotificationPrefs>) {
  return call("saveNotificationSettings", { companyId: workspace.id, settings: changes }, "Notification settings could not be saved.");
}

/**
 * Where a bell row or push opens: the order, scrolled to the card the notice is about.
 * Server shape (functions/notifications/memberOrderActivity.js): route "order", orderId, focus
 * "files" | "workTime", and fileId / workSessionId / workDayId when the notice is about one item.
 */
export function orderNotificationHref(row: { orderId?: string | null; focus?: string | null; fileId?: string | null; workSessionId?: string | null; workDayId?: string | null }): string {
  const orderId = String(row.orderId || "").trim();
  if (!orderId) return "/orders";
  const params = new URLSearchParams({ orderId });
  const focus = String(row.focus || "").trim();
  if (focus === "files" || focus === "workTime") params.set("focus", focus);
  for (const key of ["fileId", "workSessionId", "workDayId"] as const) {
    const value = String(row[key] || "").trim();
    if (value) params.set(key, value);
  }
  return `/orders?${params.toString()}`;
}

/** The order card id a `focus` value scrolls to (OrderDetailContent card ids). */
export function orderCardForFocus(focus: string | null | undefined): "clientFiles" | "workTime" | null {
  if (focus === "files") return "clientFiles";
  if (focus === "workTime") return "workTime";
  return null;
}
