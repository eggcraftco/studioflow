"use client";

// The one reminder row every screen draws (Notes ▸ Reminders, the order card's linked reminders): what it is, its
// date AND time (or "All day"), where it belongs, overdue in red. Theme colours only — the old order-alert rows were a
// hard-coded white card, unreadable on the dark theme (7 Nov 2026 emulator screenshot).
import { studioLocaleTag, studioT } from "@/lib/studioflow/language";
import type { ReminderItem, ReminderKind } from "@/lib/studioflow/reminderCore";

const KIND_ICON: Record<ReminderKind, string> = { note: "📝", order: "📦", calendar: "📅" };
const KIND_LABEL: Record<ReminderKind, string> = { note: "Note", order: "Order reminder", calendar: "Calendar" };

/** "Sun 8 Nov" in the app language (from YYYY-MM-DD, never shifted by a zone). */
export function reminderDayLabel(dayKey: string, language: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!m) return dayKey;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  const sameYear = Number(m[1]) === new Date().getFullYear();
  return new Intl.DateTimeFormat(studioLocaleTag(language), { weekday: "short", day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }), timeZone: "UTC" }).format(date);
}

/** "Sun 8 Nov · 14:30" or "Sun 8 Nov · All day". */
export function reminderWhenLabel(item: Pick<ReminderItem, "dayKey" | "time" | "allDay">, language: string | null | undefined): string {
  const day = reminderDayLabel(item.dayKey, language);
  return `${day} · ${item.allDay || !item.time ? studioT("All day", language) : item.time}`;
}

export function ReminderList({
  items,
  language,
  onOpen,
  showOrder = true,
}: {
  items: ReminderItem[];
  language: string | null | undefined;
  onOpen: (item: ReminderItem) => void;
  /** The order card already says which order it is; elsewhere every linked row names its order. */
  showOrder?: boolean;
}) {
  const t = (text: string) => studioT(text, language);
  if (items.length === 0) return null;
  return (
    <div data-testid="reminder-list" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          data-reminder-key={item.key}
          data-reminder-kind={item.kind}
          onClick={() => onOpen(item)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            width: "100%",
            textAlign: "left",
            background: "var(--surface)",
            color: "var(--text)",
            border: `1px solid ${item.overdue ? "#dc2626" : "var(--border)"}`,
            borderRadius: 12,
            padding: "10px 14px",
            cursor: "pointer",
          }}
        >
          <span aria-hidden style={{ fontSize: 16 }}>{KIND_ICON[item.kind]}</span>
          <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</span>
            <span style={{ fontSize: 11, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {t(KIND_LABEL[item.kind])}
              {showOrder && item.orderLabel ? <span style={{ color: "#2D7BF4" }}> · ⛓ {item.orderLabel}</span> : null}
            </span>
          </span>
          <span
            data-reminder-when
            style={{ fontSize: 12, whiteSpace: "nowrap", fontWeight: item.overdue ? 800 : 600, color: item.overdue ? "#dc2626" : "var(--text)" }}
          >
            {reminderWhenLabel(item, language)}
          </span>
        </button>
      ))}
    </div>
  );
}
