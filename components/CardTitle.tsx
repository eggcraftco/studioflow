"use client";

export type CardIcon =
  | "airplane"
  | "calendar"
  | "calendarClock"
  | "check"
  | "checklist"
  | "customer"
  | "dashboard"
  | "docText"
  | "export"
  | "files"
  | "finance"
  | "folderPerson"
  | "historyClock"
  | "language"
  | "lock"
  | "notes"
  | "orders"
  | "paintbrush"
  | "photo"
  | "plan"
  | "reply"
  | "shippingBox"
  | "storage"
  | "tasks"
  | "timer"
  | "warningTriangle";

const ICON_PATHS: Record<CardIcon, string[]> = {
  airplane: ["M2 16.5 22 7l-8.5 11-3.2-4.6-4.8 1.8 1.8-4.8L2 7.2v9.3Z", "M16 8l3 8"],
  calendar: ["M7 2v3M17 2v3M4 9h16", "M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"],
  calendarClock: ["M7 2v3M17 2v3M4 9h16", "M5 4h14a2 2 0 0 1 2 2v7", "M5 4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h7", "M17 14v4l3 2", "M17 22a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z"],
  check: ["m5 12 4 4L19 6"],
  checklist: ["M8 6h12", "M8 12h12", "M8 18h12", "m3 6 .7 .7L5 5", "m3 12 .7 .7L5 11", "m3 18 .7 .7L5 17"],
  customer: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M4 21a8 8 0 0 1 16 0"],
  dashboard: ["M4 13h6V4H4v9ZM14 20h6V4h-6v16ZM4 20h6v-4H4v4Z"],
  docText: ["M6 3h8l4 4v14H6V3Z", "M14 3v5h4", "M9 12h6M9 16h6"],
  export: ["M12 3v12", "m7 8 5-5 5 5", "M5 15v4h14v-4"],
  files: ["M3 7h7l2 2h9v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z", "M3 7V5a2 2 0 0 1 2-2h5l2 4"],
  finance: ["M12 3v18", "M17 7.5A4 4 0 0 0 9 8c0 2 1.5 3 4 3s4 1 4 3-1.8 4-5 4a6 6 0 0 1-5-2.5"],
  folderPerson: ["M3 7h6l2 2h10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z", "M15 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z", "M11.5 17a3.5 3.5 0 0 1 7 0"],
  historyClock: ["M4 6v5h5", "M4.5 11A8 8 0 1 0 7 5", "M12 8v5l3 2"],
  language: ["M4 5h9M7 5c.8 4.5 3.2 7.4 7 9", "M12 5c-.8 4.5-3.2 7.4-7 9", "M14 19l3-7 3 7M15.2 16h3.6"],
  lock: ["M7 11V8a5 5 0 0 1 10 0v3", "M6 11h12v10H6V11Z"],
  notes: ["M6 3h9l3 3v15H6V3Z", "M14 3v4h4", "M8 12h8M8 16h6"],
  orders: ["M6 3h12v18H6V3Z", "M9 7h6M9 11h6M9 15h4"],
  paintbrush: ["M14 4l6 6-7 7-6-6 7-7Z", "M6 12l6 6", "M5 14c-2 2-2 5-2 7 2 0 5 0 7-2"],
  photo: ["M4 5h16v14H4V5Z", "M8 13l2.5-2.5L14 14l2-2 4 4", "M9 9h.01"],
  plan: ["M4 5h16v14H4V5Z", "M4 10h16", "M8 15h3"],
  reply: ["M4 5h16v10H8l-4 4V5Z", "M8 9h8M8 12h5"],
  shippingBox: ["M4 8 12 4l8 4-8 4-8-4Z", "M4 8v8l8 4 8-4V8", "M12 12v8"],
  storage: ["M4 7c0-2 16-2 16 0v10c0 2-16 2-16 0V7Z", "M4 7c0 2 16 2 16 0", "M4 12c0 2 16 2 16 0"],
  tasks: ["m5 7 2 2 4-4", "M13 8h6", "m5 15 2 2 4-4", "M13 16h6"],
  timer: ["M10 2h4", "M12 14V9", "M16.2 5.8l1.4-1.4", "M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z"],
  warningTriangle: ["M12 3 2 21h20L12 3Z", "M12 9v5", "M12 17h.01"]
};

export function CardIconGlyph({ icon }: { icon: CardIcon }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {ICON_PATHS[icon].map(path => <path key={path} d={path} />)}
    </svg>
  );
}

export function CardTitle({
  icon,
  title,
  eyebrow,
  children
}: {
  icon: CardIcon;
  title: string;
  eyebrow?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="card-title">
      <span className="card-title-icon" aria-hidden="true">
        <CardIconGlyph icon={icon} />
      </span>
      <div>
        {eyebrow ? <div className="card-title-eyebrow">{eyebrow}</div> : null}
        <h2 className="card-title-text">{title}</h2>
        {children}
      </div>
    </div>
  );
}
