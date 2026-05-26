"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  colorForType,
  dismissActivityNotifications,
  iconForType,
  isNotificationDismissed,
  isNotificationUnread,
  markActivityNotificationRead,
  markAllActivityNotificationsRead,
  notificationStackKey,
  type StudioActivityNotification,
  typeKeyFor,
  typeLabel,
} from "@/lib/studioflow/notifications";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";

type Props = {
  open: boolean;
  workspace: WorkspaceContext | null;
  uid: string;
  email: string;
  notifications: StudioActivityNotification[];
  dismissedLocally: Set<string>;
  onClose: () => void;
  onLocalDismiss: (ids: string[]) => void;
};

export function NotificationsDrawer({
  open,
  workspace,
  uid,
  email,
  notifications,
  dismissedLocally,
  onClose,
  onLocalDismiss,
}: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [readFilter, setReadFilter] = useState<"all" | "unread">("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [optimisticReadIds, setOptimisticReadIds] = useState<Set<string>>(new Set());
  const [optimisticAllRead, setOptimisticAllRead] = useState(false);

  // Persist dismissed IDs to localStorage so they don't come back after refresh.
  useEffect(() => {
    if (typeof window === "undefined" || !workspace || !uid) return;
    try {
      const raw = window.localStorage.getItem(`studio_notif_dismissed_${workspace.id}_${uid}`);
      if (raw) {
        const ids: string[] = JSON.parse(raw);
        if (Array.isArray(ids) && ids.length) onLocalDismiss(ids);
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.id, uid]);

  // Reset optimistic states when workspace switches or notifications change drastically
  useEffect(() => {
    setOptimisticAllRead(false);
    setOptimisticReadIds(new Set());
  }, [workspace?.id]);

  const visible = useMemo(
    () => notifications.filter((n) => !dismissedLocally.has(n.id) && !isNotificationDismissed(n, uid, email)),
    [notifications, dismissedLocally, uid, email],
  );

  const computeUnread = (n: StudioActivityNotification) => {
    if (optimisticAllRead) return false;
    if (optimisticReadIds.has(n.id)) return false;
    return isNotificationUnread(n, uid, email);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return visible.filter((n) => {
      if (readFilter === "unread" && !computeUnread(n)) return false;
      if (typeFilter !== "all" && typeKeyFor(n) !== typeFilter) return false;
      if (!q) return true;
      const hay = [n.title, n.message, n.type, n.route, n.senderName, n.senderEmail]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, search, readFilter, typeFilter, uid, email, optimisticAllRead, optimisticReadIds]);

  const sections = useMemo(() => buildSections(filtered), [filtered]);
  const unreadCount = visible.filter((n) => computeUnread(n)).length;

  const handleMarkRead = async (id: string) => {
    setOptimisticReadIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    if (!workspace) return;
    try { await markActivityNotificationRead(workspace, id); } catch {}
  };

  const handleMarkAllRead = async () => {
    setOptimisticAllRead(true);
    if (!workspace) return;
    try { await markAllActivityNotificationsRead(workspace); } catch {}
  };

  const handleDismiss = async (ids: string[]) => {
    onLocalDismiss(ids);
    if (typeof window !== "undefined" && workspace && uid) {
      try {
        const key = `studio_notif_dismissed_${workspace.id}_${uid}`;
        const existing = window.localStorage.getItem(key);
        const prev: string[] = existing ? JSON.parse(existing) : [];
        const merged = Array.from(new Set([...prev, ...ids])).slice(-500);
        window.localStorage.setItem(key, JSON.stringify(merged));
      } catch {}
    }
    if (!workspace) return;
    try { await dismissActivityNotifications(workspace, ids); } catch {}
  };

  const handleOpenNotification = (n: StudioActivityNotification) => {
    void handleMarkRead(n.id);
    const route = n.route.trim().toLowerCase();
    if (route === "messagethread" || n.threadId.trim()) {
      router.push("/messages");
      onClose();
    } else if (route === "supportticket" || n.ticketId.trim()) {
      router.push("/settings?section=support-tickets");
      onClose();
    } else if (route === "order" || n.orderId.trim()) {
      router.push("/orders");
      onClose();
    }
  };

  // Notification permission state for banner
  const [permState, setPermState] = useState<NotificationPermission | "unsupported">("default");
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) { setPermState("unsupported"); return; }
    setPermState(Notification.permission);
  }, [open]);
  const showPermissionBanner = open && permState === "denied";

  if (!open) return null;

  return (
    <>
      {/* Click-outside catcher (transparent, LEFT of drawer) */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "transparent",
          zIndex: 80,
        }}
        onClick={onClose}
      />
      <aside className="notif-drawer">
        <div className="notif-card notif-header-card">
          <div className="notif-header-row">
            <div style={{ flex: 1 }}>
              <h2>Notification Centre</h2>
              <p>Latest activity and workflow updates</p>
            </div>
            {unreadCount > 0 && (
              <button type="button" className="notif-pill-button" onClick={() => void handleMarkAllRead()}>
                Mark all read
              </button>
            )}
            {filtered.length > 0 && (
              <button type="button" className="notif-icon-button" onClick={() => void handleDismiss(filtered.map((n) => n.id))} title="Clear visible">×</button>
            )}
            <button type="button" className="notif-icon-button" onClick={onClose} title="Close">›</button>
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notifications"
            className="notif-search"
          />
          <div>
            <div className="notif-filter-row">
              <button
                type="button"
                className={`notif-chip${filtersOpen ? " active" : ""}`}
                onClick={() => setFiltersOpen((v) => !v)}
              >
                Filters {readFilter === "unread" || typeFilter !== "all" ? "•" : ""}
              </button>
              {(readFilter === "unread" || typeFilter !== "all") && (
                <button
                  type="button"
                  className="notif-clear"
                  onClick={() => { setReadFilter("all"); setTypeFilter("all"); }}
                >
                  Clear
                </button>
              )}
            </div>
            {filtersOpen && (
              <div className="notif-filters-expanded">
                <div className="notif-filter-row">
                  <button type="button" className={`notif-chip${readFilter === "all" ? " active" : ""}`} onClick={() => setReadFilter("all")}>
                    All ({visible.length})
                  </button>
                  <button type="button" className={`notif-chip${readFilter === "unread" ? " active" : ""}`} onClick={() => setReadFilter("unread")}>
                    Unread ({visible.filter((n) => computeUnread(n)).length})
                  </button>
                </div>
                <div className="notif-filter-row" style={{ flexWrap: "wrap", marginTop: 6 }}>
                  {(["all", "messages", "support", "orders", "tasks", "files", "system"] as const).map((key) => (
                    <button
                      key={key}
                      type="button"
                      className={`notif-chip${typeFilter === key ? " active" : ""}`}
                      onClick={() => setTypeFilter(key)}
                    >
                      {key === "all" ? "All types" : typeLabel(key)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {showPermissionBanner && (
          <div className="notif-permission-banner">
            <div style={{ flex: 1 }}>
              <strong>Notifications are blocked</strong>
              <div style={{ fontSize: 11, marginTop: 2, opacity: 0.85 }}>
                Allow notifications in your browser settings to get push alerts.
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (typeof window === "undefined") return;
                window.open("chrome://settings/content/notifications", "_blank");
              }}
            >
              How to enable
            </button>
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="notif-card notif-empty">
            <div style={{ fontSize: 28 }}>{readFilter === "unread" ? "🔕" : "🔔"}</div>
            <div style={{ fontWeight: 700, marginTop: 8 }}>
              {readFilter === "unread" ? "No unread notifications" : "No notifications yet"}
            </div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
              {search ? "No notifications match your search." : "Important updates from messages, support tickets, orders and workflow will appear here."}
            </div>
          </div>
        ) : (
          sections.map((section) => (
            <div key={section.id} className="notif-section">
              <div className="notif-section-title">{section.title}</div>
              {groupBy(section.items).map((group) => {
                const groupId = `${section.id}_${group.key}`;
                const isExpanded = expandedGroups.has(groupId);
                if (group.items.length <= 1) {
                  return (
                    <NotificationCard
                      key={group.items[0].id}
                      item={group.items[0]}
                      isUnread={computeUnread(group.items[0])}
                      sectionId={section.id}
                      onClick={() => handleOpenNotification(group.items[0])}
                      onDismiss={() => void handleDismiss([group.items[0].id])}
                    />
                  );
                }
                if (!isExpanded) {
                  return (
                    <StackedCard
                      key={`group_${groupId}`}
                      latest={group.items[0]}
                      count={group.items.length}
                      isUnread={group.items.some((i) => computeUnread(i))}
                      sectionId={section.id}
                      onExpand={() => setExpandedGroups((prev) => new Set(prev).add(groupId))}
                      onDismissAll={() => void handleDismiss(group.items.map((i) => i.id))}
                    />
                  );
                }
                return (
                  <div key={`expanded_${groupId}`}>
                    <div className="notif-stack-banner">
                      <span>Showing {group.items.length} grouped notifications</span>
                      <button type="button" onClick={() => setExpandedGroups((prev) => {
                        const next = new Set(prev); next.delete(groupId); return next;
                      })}>Collapse</button>
                    </div>
                    {group.items.map((item) => (
                      <NotificationCard
                        key={item.id}
                        item={item}
                        isUnread={computeUnread(item)}
                        sectionId={section.id}
                        indent
                        onClick={() => handleOpenNotification(item)}
                        onDismiss={() => void handleDismiss([item.id])}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </aside>
      <DrawerStyles />
    </>
  );
}

function NotificationCard({
  item,
  isUnread,
  sectionId,
  indent,
  onClick,
  onDismiss,
}: {
  item: StudioActivityNotification;
  isUnread: boolean;
  sectionId: string;
  indent?: boolean;
  onClick: () => void;
  onDismiss: () => void;
}) {
  const key = typeKeyFor(item);
  const tint = colorForType(key);
  const sender = senderHeader(item);
  return (
    <div
      className={`notif-card${isUnread ? " unread" : ""}`}
      onClick={onClick}
      onContextMenu={(e) => { e.preventDefault(); onDismiss(); }}
      style={{ marginLeft: indent ? 16 : 0, cursor: "pointer" }}
    >
      <div className="notif-card-row">
        <div className="notif-avatar" style={{ background: `${tint}26`, color: tint }}>
          {item.senderPhotoURL ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.senderPhotoURL} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
          ) : (
            <span>{iconForType(key)}</span>
          )}
          {isUnread && <span className="notif-unread-dot" />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="notif-card-header">
            <span className="notif-sender">{sender}</span>
            <span className="notif-time">{timeText(item.createdAtMillis, sectionId)}</span>
          </div>
          {(item.message || item.title) && (
            <div className="notif-body">{item.message || item.title}</div>
          )}
          <span className="notif-type-pill" style={{ background: `${tint}1e`, color: tint }}>
            {typeLabel(key)}
          </span>
        </div>
      </div>
    </div>
  );
}

function StackedCard({
  latest,
  count,
  isUnread,
  sectionId,
  onExpand,
  onDismissAll,
}: {
  latest: StudioActivityNotification;
  count: number;
  isUnread: boolean;
  sectionId: string;
  onExpand: () => void;
  onDismissAll: () => void;
}) {
  const key = typeKeyFor(latest);
  const tint = colorForType(key);
  return (
    <div
      className={`notif-card${isUnread ? " unread" : ""}`}
      onClick={onExpand}
      onContextMenu={(e) => { e.preventDefault(); onDismissAll(); }}
      style={{ cursor: "pointer" }}
    >
      <div className="notif-card-row">
        <div className="notif-avatar" style={{ background: `${tint}26`, color: tint }}>
          {iconForType(key)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="notif-card-header">
            <span className="notif-stack-title">
              {typeLabel(key)} <span className="notif-count-pill">{count}</span>
            </span>
            <span className="notif-time">{timeText(latest.createdAtMillis, sectionId)}</span>
          </div>
          {latest.title && <div className="notif-stack-sub">{latest.title}</div>}
          {latest.message && <div className="notif-body">{latest.message}</div>}
          <span className="notif-expand-pill">Tap to show {count} notifications ▾</span>
        </div>
      </div>
    </div>
  );
}

type Section = { id: string; title: string; items: StudioActivityNotification[] };
type Group = { key: string; items: StudioActivityNotification[] };

function buildSections(items: StudioActivityNotification[]): Section[] {
  if (items.length === 0) return [];
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday); startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfWeek = new Date(startOfToday); startOfWeek.setDate(startOfWeek.getDate() - 7);

  const today: StudioActivityNotification[] = [];
  const yesterday: StudioActivityNotification[] = [];
  const week: StudioActivityNotification[] = [];
  const older: StudioActivityNotification[] = [];
  for (const item of items) {
    if (!item.createdAtMillis) continue;
    const t = item.createdAtMillis;
    if (t >= startOfToday.getTime()) today.push(item);
    else if (t >= startOfYesterday.getTime()) yesterday.push(item);
    else if (t >= startOfWeek.getTime()) week.push(item);
    else older.push(item);
  }
  const out: Section[] = [];
  if (today.length) out.push({ id: "today", title: "TODAY", items: today });
  if (yesterday.length) out.push({ id: "yesterday", title: "YESTERDAY", items: yesterday });
  if (week.length) out.push({ id: "week", title: "EARLIER THIS WEEK", items: week });
  if (older.length) out.push({ id: "older", title: "OLDER", items: older });
  return out;
}

function groupBy(items: StudioActivityNotification[]): Group[] {
  if (items.length === 0) return [];
  const map = new Map<string, StudioActivityNotification[]>();
  for (const item of items) {
    const key = notificationStackKey(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return Array.from(map.entries()).map(([key, group]) => ({ key, items: group }));
}

function senderHeader(item: StudioActivityNotification): string {
  const name = item.senderName.trim();
  const email = item.senderEmail.trim();
  if (name && email) return `${name} • ${email}`;
  if (name) return name;
  if (email) return email;
  return item.title || "Notification";
}

function timeText(ms: number, sectionId: string): string {
  if (!ms) return "";
  const d = new Date(ms);
  if (sectionId === "today" || sectionId === "yesterday") {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function DrawerStyles() {
  return (
    <style jsx global>{`
      .notif-drawer {
        position: fixed;
        right: 0; top: 0; bottom: 0;
        width: min(400px, calc(100vw - 56px));
        z-index: 90;
        padding: 16px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 10px;
        pointer-events: auto;
      }
      .notif-card {
        background: #ffffff;
        border-radius: 14px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.10), 0 1px 3px rgba(0,0,0,0.08);
        border: 1px solid rgba(0,0,0,0.06);
        padding: 12px;
      }
      .notif-card.unread { background: #f5f8ff; border-color: rgba(37,99,235,0.18); }
      .notif-header-card { padding: 14px; display: flex; flex-direction: column; gap: 10px; }
      .notif-header-row { display: flex; align-items: flex-start; gap: 6px; }
      .notif-header-row h2 { margin: 0; font-size: 18px; font-weight: 800; }
      .notif-header-row p { margin: 0; font-size: 11px; color: #6b7280; }
      .notif-pill-button { background: rgba(37,99,235,0.1); color: #2563eb; border: none; border-radius: 999px; padding: 6px 12px; font-weight: 700; font-size: 11px; cursor: pointer; }
      .notif-icon-button { background: rgba(0,0,0,0.06); border: none; border-radius: 50%; width: 28px; height: 28px; cursor: pointer; color: #6b7280; font-size: 14px; }
      .notif-search { width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 13px; }
      .notif-filter-row { display: flex; gap: 6px; align-items: center; }
      .notif-chip { background: #f3f4f6; border: none; border-radius: 999px; padding: 4px 10px; font-size: 11px; cursor: pointer; }
      .notif-chip.active { background: rgba(37,99,235,0.14); color: #2563eb; font-weight: 600; }
      .notif-clear { background: transparent; border: none; color: #2563eb; font-size: 11px; cursor: pointer; font-weight: 600; margin-left: auto; }
      .notif-filters-expanded { padding-top: 6px; }
      .notif-section { display: flex; flex-direction: column; gap: 8px; margin-top: 6px; }
      .notif-section-title { font-size: 10px; font-weight: 800; color: #9ca3af; letter-spacing: 0.6px; padding-left: 4px; }
      .notif-card-row { display: flex; gap: 10px; align-items: flex-start; }
      .notif-avatar { position: relative; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; }
      .notif-unread-dot { position: absolute; top: -2px; right: -2px; width: 10px; height: 10px; border-radius: 50%; background: #ef4444; border: 1.5px solid white; }
      .notif-card-header { display: flex; gap: 6px; align-items: center; }
      .notif-sender { flex: 1; font-weight: 800; font-size: 13px; color: #111827; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
      .notif-stack-title { flex: 1; font-weight: 800; font-size: 14px; color: #111827; }
      .notif-count-pill { background: rgba(0,0,0,0.08); color: #374151; font-size: 10px; font-weight: 700; padding: 1px 7px; border-radius: 999px; margin-left: 4px; }
      .notif-time { font-size: 10px; color: #6b7280; }
      .notif-body { font-size: 12px; color: #374151; margin: 4px 0; word-break: break-word; }
      .notif-stack-sub { font-size: 12px; font-weight: 700; color: #111827; margin-top: 2px; }
      .notif-type-pill { display: inline-block; font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 999px; margin-top: 4px; }
      .notif-expand-pill { display: inline-block; background: rgba(0,0,0,0.06); color: #6b7280; font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 999px; margin-top: 6px; }
      .notif-stack-banner { display: flex; align-items: center; padding: 2px 4px; }
      .notif-stack-banner span { flex: 1; font-size: 10px; font-weight: 700; color: #2563eb; }
      .notif-stack-banner button { background: transparent; border: none; color: #2563eb; font-size: 11px; cursor: pointer; font-weight: 600; }
      .notif-empty { padding: 32px; display: flex; flex-direction: column; align-items: center; text-align: center; }
      .notif-permission-banner { background: #fee2e2; color: #991b1b; border-radius: 12px; padding: 10px 12px; display: flex; gap: 10px; align-items: center; }
      .notif-permission-banner button { background: white; border: 1px solid #fca5a5; color: #991b1b; border-radius: 8px; padding: 4px 10px; font-size: 11px; font-weight: 700; cursor: pointer; }
    `}</style>
  );
}
