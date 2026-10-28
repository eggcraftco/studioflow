"use client";

// Settings → Notifications (GN-09, 22 Oct 2026).
//
// One entry for every notification NivaDesk sends, grouped by what it is about. Three kinds of rows,
// kept visibly apart because they are decided in different places:
//   Personal   — this person's own switches (stored in personalInterfaceSettings/{uid}; nobody else can
//                change them, and the server refuses a member who tries to set the owner's).
//   Workspace  — decided for the whole workspace (Customer SMS, Message Settings, access keys); shown
//                here with a link to where the owner changes them, never duplicated as a second switch.
//   This device — the browser's own permission and how many of your devices can receive push. When
//                push is off we say delivery is off; the bell still collects the notices.
// A category with no switch says what decides it today rather than pretending to be adjustable.

import { useCallback, useEffect, useState } from "react";
import { SettingsCardHead } from "./pageHeader";
import { studioT } from "@/lib/studioflow/language";
import { normalizeWorkspaceRole, type WorkspaceContext } from "@/lib/studioflow/firestore";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  getNotificationSettings,
  saveNotificationSettings,
  type NotificationPrefKey,
  type NotificationSettings,
} from "@/lib/studioflow/notificationSettings";

type Props = { workspace: WorkspaceContext; language?: string };

type InfoRow = { title: string; detail: string; scope: "personal" | "workspace" | "access"; href?: string; linkLabel?: string; ownerOnlyLink?: boolean };
type Category = { id: string; title: string; prefKey?: NotificationPrefKey; prefTitle?: string; prefDetail?: string; rows: InfoRow[] };

const CATEGORIES: Category[] = [
  {
    id: "orders",
    title: "Orders and assignment",
    rows: [
      { title: "Deliveries, estimate decisions, reminders and new shop orders", detail: "Sent to the people who can open that order. Turning someone's Orders access off, or limiting them to assigned projects, also stops these notices for them.", scope: "access", href: "/settings?section=team-access", linkLabel: "Team Access", ownerOnlyLink: true },
      { title: "Deletion requests", detail: "When a member asks to delete an order, the owner is notified and can approve or reject it from the bell.", scope: "workspace" },
    ],
  },
  {
    id: "files",
    title: "Files",
    prefKey: "memberFileUploads",
    prefTitle: "A member uploads a file to an order assigned to them",
    prefDetail: "One notice per upload (several files at once count as one). Your own uploads never notify you.",
    rows: [],
  },
  {
    id: "workTime",
    title: "Work Time",
    prefKey: "memberWorkTime",
    prefTitle: "A member saves work time on an order assigned to them",
    prefDetail: "When they stop a timer or log a full or half day. A running timer does not notify; your own entries and corrections never notify you.",
    rows: [],
  },
  {
    id: "team",
    title: "Team",
    rows: [
      { title: "Team chat messages and mentions", detail: "Sent to the members of the conversation. Mute a conversation from its menu in Messages (one hour, today, or until you turn it back on); muting is personal.", scope: "personal", href: "/messages", linkLabel: "Messages" },
      { title: "Who may message whom", detail: "Workspace-wide messaging permissions.", scope: "workspace", href: "/settings?section=message-settings", linkLabel: "Message Settings", ownerOnlyLink: true },
      { title: "Shared notes and note invitations", detail: "Sent only to the person a note is shared with.", scope: "personal" },
    ],
  },
  {
    id: "customerMessages",
    title: "Customer messages",
    rows: [
      { title: "A customer writes on WhatsApp or Instagram", detail: "Sent to members with Customer Messages access (to the assigned member when the conversation has one). The notice never contains the customer's words.", scope: "access", href: "/settings?section=team-access", linkLabel: "Team Access", ownerOnlyLink: true },
      { title: "Texts and e-mails to your customers", detail: "What can text a customer is set for the whole workspace in Customer SMS; each order's Customer Portal card has its own Automatic Updates switch, and a customer marked Do not contact is never messaged.", scope: "workspace", href: "/settings?section=sms-notifications", linkLabel: "Customer SMS" },
    ],
  },
  {
    id: "finance",
    title: "Finance and bank",
    rows: [
      { title: "Bank matches, receipts and connection problems", detail: "Sent only to people with Bank Feed and financial access.", scope: "access", href: "/settings?section=team-access", linkLabel: "Team Access", ownerOnlyLink: true },
    ],
  },
  {
    id: "integrations",
    title: "Integrations",
    rows: [
      { title: "New orders from connected shops and marketplaces", detail: "Sent to people with Orders access; amounts and customer names only to those who may see them.", scope: "access", href: "/settings?section=integrations", linkLabel: "Integrations" },
    ],
  },
  {
    id: "appUpdates",
    title: "App updates",
    rows: [
      { title: "No update notifications", detail: "NivaDesk does not send notifications about new app versions; the App Store, Google Play and your browser handle updates.", scope: "workspace" },
    ],
  },
  {
    id: "security",
    title: "Account security",
    rows: [
      { title: "Support replies and security e-mails", detail: "Replies to your support tickets and e-mails you ask for (such as a password reset) are always sent; there is no switch for them.", scope: "personal", href: "/settings?section=profile-security", linkLabel: "Profile & Security" },
    ],
  },
];

const SCOPE_LABEL: Record<InfoRow["scope"], string> = {
  personal: "Personal",
  workspace: "Workspace",
  access: "Follows access",
};

function browserPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export function NotificationSettingsSection({ workspace, language = "English" }: Props) {
  const t = useCallback((text: string) => studioT(text, language), [language]);
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [busyKey, setBusyKey] = useState<NotificationPrefKey | "">("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [enabling, setEnabling] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSettings(await getNotificationSettings(workspace));
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? t(loadError.message) : t("Notification settings could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [workspace, t]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    setPermission(browserPermission());
    const onFocus = () => setPermission(browserPermission());
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // Saved on change, one switch at a time, like the other personal preferences. The screen shows
  // the value the server sent back, never the one it hoped to store.
  const toggle = async (key: NotificationPrefKey, value: boolean) => {
    if (!settings?.editable[key]) return;
    setBusyKey(key);
    setNotice("");
    setError("");
    try {
      const saved = await saveNotificationSettings(workspace, { [key]: value });
      setSettings(saved);
      setNotice(t("Saved."));
    } catch (saveError) {
      setError(saveError instanceof Error ? t(saveError.message) : t("Notification settings could not be saved."));
    } finally {
      setBusyKey("");
    }
  };

  const enableBrowserPush = async () => {
    if (!user) return;
    setEnabling(true);
    try {
      const mod = await import("@/lib/studioflow/pushNotifications");
      await mod.registerWebPush(workspace, { uid: user.uid, email: user.email }, { requestPermission: true });
      setPermission(browserPermission());
      await load();
    } finally {
      setEnabling(false);
    }
  };

  // The server's answer decides; before it lands, the role the shell already holds.
  const isOwner = settings ? settings.isOwner : normalizeWorkspaceRole(workspace.role) === "owner";
  const devices = settings?.pushDeviceCount;
  const deviceLine = permission === "unsupported"
    ? t("This browser cannot show notifications. Push is off here; the bell still collects every notice for you.")
    : permission === "denied"
      ? t("Notifications are blocked for NivaDesk in this browser, so push delivery is off here. Allow them in your browser's site settings; until then the bell still collects every notice.")
      : permission === "default"
        ? t("This browser has not been allowed to show notifications yet, so push delivery is off here.")
        : t("This browser may show NivaDesk notifications.");

  return (
    <div className="settings-card-stack settings-notifications-page">
      <section className="card app-card">
        <SettingsCardHead title={t("This device")} subtitle={t("Push delivery depends on each device's own permission.")} />
        <p className="settings-field-hint">{deviceLine}</p>
        {devices !== null && devices !== undefined ? (
          <p className="settings-field-hint">
            {devices === 0
              ? t("None of your devices is registered for push in this workspace. Push is off for you until a phone, tablet or browser allows notifications.")
              : `${t("Your devices registered for push in this workspace:")} ${devices}`}
          </p>
        ) : null}
        {permission === "default" && user ? (
          <button type="button" className="button secondary" disabled={enabling} onClick={() => void enableBrowserPush()}>
            {t("Enable notifications")}
          </button>
        ) : null}
      </section>

      {error ? <p className="layout-error" role="alert">{error}</p> : null}
      {notice ? <p className="success-copy" role="status">{notice}</p> : null}

      {CATEGORIES.map(category => {
        const hasPref = Boolean(category.prefKey);
        // The member-activity switches are the owner's: they are about the owner hearing from the team.
        if (hasPref && !isOwner && category.rows.length === 0) return null;
        return (
          <section className="card app-card" key={category.id} data-notification-category={category.id}>
            <SettingsCardHead title={t(category.title)} />
            <div className="settings-switch-list">
              {hasPref && isOwner && category.prefKey ? (
                <label className="settings-switch-line">
                  <span className="settings-switch-line-copy">
                    <strong>{t(category.prefTitle || "")}</strong>
                    <small>{t(category.prefDetail || "")}</small>
                    <small>{t("Personal · Owner only · Bell and push")}</small>
                  </span>
                  <input
                    type="checkbox"
                    className="settings-switch"
                    aria-label={t(category.prefTitle || "")}
                    checked={settings?.prefs[category.prefKey] === true}
                    disabled={loading || !settings?.editable[category.prefKey] || busyKey === category.prefKey}
                    onChange={event => void toggle(category.prefKey as NotificationPrefKey, event.target.checked)}
                  />
                </label>
              ) : null}
              {category.rows.map(row => (
                <div className="settings-switch-line" key={row.title}>
                  <span className="settings-switch-line-copy">
                    <strong>{t(row.title)}</strong>
                    <small>{t(row.detail)}</small>
                    <small>{t(SCOPE_LABEL[row.scope])}</small>
                  </span>
                  {row.href && (!row.ownerOnlyLink || isOwner) ? (
                    <a className="button secondary" href={row.href}>{t(row.linkLabel || "Open")}</a>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        );
      })}
      {!isOwner ? (
        <p className="settings-field-hint">
          {t("Notices about the team's work on assigned orders go to the workspace owner, who switches them on here. Nobody can change another person's notification settings.")}
        </p>
      ) : null}
    </div>
  );
}
