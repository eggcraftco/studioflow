/**
 * The quick-action glyphs, drawn to match the reference sheet.
 *
 * These are not in the shared CardIcon set on purpose: those are 1-colour
 * navigation marks sized for a 20px slot, and these are 28-40px line drawings
 * that carry the action's own colour. Reusing the nav icons here made every
 * tile look like a menu row.
 */
export type HomeActionIconName =
  | "newOrder" | "addCustomer" | "addNote" | "uploadFile"
  | "addInventory" | "scanReceipt" | "addExpense" | "aiReply";

export function HomeActionIcon({ name }: { name: HomeActionIconName }) {
  const common = {
    viewBox: "0 0 32 32",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (name) {
    case "newOrder":
      return (
        <svg {...common}>
          <path d="M4 6h3l2.4 11.2A2 2 0 0 0 11.4 19h8.7a2 2 0 0 0 2-1.6L24 9H8" />
          <circle cx="12" cy="24" r="1.6" />
          <circle cx="22" cy="22.5" r="4.5" />
          <path d="M22 20.3v4.4M19.8 22.5h4.4" />
        </svg>
      );
    case "addCustomer":
      return (
        <svg {...common}>
          <circle cx="13" cy="10" r="4.2" />
          <path d="M5.5 24c0-4.1 3.4-6.6 7.5-6.6 1.5 0 2.9.3 4 .9" />
          <circle cx="23" cy="21.5" r="4.6" />
          <path d="M23 19.2v4.6M20.7 21.5h4.6" />
        </svg>
      );
    case "addNote":
      return (
        <svg {...common}>
          <path d="M7 5h13a2 2 0 0 1 2 2v10" />
          <path d="M7 5a2 2 0 0 0-2 2v18a2 2 0 0 0 2 2h9" />
          <path d="M9.5 11h9M9.5 15h9M9.5 19h5" />
          <path d="m20.5 25.5 6-6 2.5 2.5-6 6-3 .5z" />
        </svg>
      );
    case "uploadFile":
      return (
        <svg {...common}>
          <path d="M8 4h10l6 6v18a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
          <path d="M18 4v6h6" />
          <path d="M16 25v-9M12.5 19.5 16 16l3.5 3.5" />
        </svg>
      );
    case "addInventory":
      return (
        <svg {...common}>
          <path d="M16 4 27 10v12l-11 6-11-6V10z" />
          <path d="M5 10l11 6 11-6M16 16v12" />
        </svg>
      );
    case "scanReceipt":
      return (
        <svg {...common}>
          <path d="M5 11V7a2 2 0 0 1 2-2h4M21 5h4a2 2 0 0 1 2 2v4M27 21v4a2 2 0 0 1-2 2h-4M11 27H7a2 2 0 0 1-2-2v-4" />
          <circle cx="16" cy="16" r="4.2" />
          <path d="M13.4 12.4 14.6 10h2.8l1.2 2.4" />
        </svg>
      );
    case "addExpense":
      return (
        <svg {...common}>
          <path d="M5 11a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" />
          <path d="M5 13h20" />
          <circle cx="21" cy="18" r="1.7" />
        </svg>
      );
    case "aiReply":
      return (
        <svg {...common}>
          <path d="m11 4 1.8 4.7L17.5 10.5 12.8 12.3 11 17l-1.8-4.7L4.5 10.5l4.7-1.8z" />
          <path d="m22.5 16 1.1 2.9 2.9 1.1-2.9 1.1L22.5 24l-1.1-2.9-2.9-1.1 2.9-1.1z" />
        </svg>
      );
  }
}

/** The small marks the metric tiles carry. Line drawings at 20px, tinted by
 *  the tile's own colour. */
export type HomeTileIconName =
  | "in" | "out" | "receiptAlert" | "recurring" | "review"
  // The four production counts the 1x1 square carries.
  | "ready" | "inProduction" | "readyToShip" | "overdue"
  // The two stock holdings that are not free shelf.
  | "reserved" | "incomingStock"
  // What a note is about.
  | "reminder" | "order" | "customer" | "note" | "pin" | "search" | "upload"
  // What the Money card's four figures and four deductions mean. Added rather
  // than borrowed: the nearest existing glyphs meant something else, and a
  // clock standing in for a pie chart is worse than no icon at all.
  | "trendUp" | "paid" | "awaiting" | "margin" | "percent" | "calculator"
  // What the Files card's three figures mean. Same rule as the line above:
  // added, not borrowed — the card was drawing three empty coloured discs
  // because it passed no icon at all, and a stand-in would have been worse.
  | "fileStack" | "pie" | "link";

export function HomeTileIcon({ name }: { name: HomeTileIconName }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (name) {
    case "trendUp":
      return (<svg {...common}><polyline points="3 16.5 9 10.5 13 14.5 21 6.5" /><polyline points="15 6.5 21 6.5 21 12.5" /></svg>);
    case "paid":
      return (<svg {...common}><circle cx="12" cy="12" r="8.6" /><polyline points="8.2 12.2 11 15 15.9 9.4" /></svg>);
    case "awaiting":
      return (<svg {...common}><circle cx="12" cy="12" r="8.6" /><polyline points="12 7.2 12 12.3 15.6 14.4" /></svg>);
    case "margin":
      // A pie with one slice lifted: margin is a share of a whole, and a plain
      // circle would have said "clock" beside a clock.
      return (<svg {...common}><path d="M12 3.6a8.4 8.4 0 1 0 8.4 8.4H12V3.6Z" /><path d="M14.4 2.2a8.4 8.4 0 0 1 7.4 7.4h-7.4V2.2Z" /></svg>);
    case "percent":
      return (<svg {...common}><line x1="6.5" y1="17.5" x2="17.5" y2="6.5" /><circle cx="7.8" cy="7.8" r="2.4" /><circle cx="16.2" cy="16.2" r="2.4" /></svg>);
    case "calculator":
      return (<svg {...common}><rect x="5" y="2.8" width="14" height="18.4" rx="2.2" /><line x1="8.2" y1="7.2" x2="15.8" y2="7.2" /><line x1="8.4" y1="11.4" x2="8.5" y2="11.4" /><line x1="12" y1="11.4" x2="12.1" y2="11.4" /><line x1="15.6" y1="11.4" x2="15.7" y2="11.4" /><line x1="8.4" y1="15.4" x2="8.5" y2="15.4" /><line x1="12" y1="15.4" x2="12.1" y2="15.4" /><line x1="15.6" y1="15.4" x2="15.7" y2="15.4" /></svg>);

    case "in":
      return <svg {...common}><path d="M12 4v14M6.5 12.5 12 18l5.5-5.5" /></svg>;
    case "out":
      return <svg {...common}><path d="M12 20V6M6.5 11.5 12 6l5.5 5.5" /></svg>;
    case "receiptAlert":
      return (
        <svg {...common}>
          <path d="M5 4h10v11l-2.5-1.5L10 15l-2.5-1.5L5 15z" />
          <path d="M7.5 7.5h5M7.5 10.5h3" />
          <path d="M18.5 8v4M18.5 15v.5" />
        </svg>
      );
    case "recurring":
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M4 9.5h16M8.5 3.5v3M15.5 3.5v3" />
        </svg>
      );
    case "review":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="6" />
          <path d="m15.5 15.5 4 4" />
        </svg>
      );
    case "ready":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="m8.5 12 2.5 2.5 4.5-5" />
        </svg>
      );
    case "inProduction":
      return (
        <svg {...common}>
          <path d="M14.5 4.5a3.8 3.8 0 0 0 4.8 4.9l-8.6 8.7a2 2 0 1 1-2.8-2.8l8.7-8.6a3.8 3.8 0 0 0-2.1-2.2Z" />
          <path d="M6.5 17.5h.01" />
        </svg>
      );
    case "readyToShip":
      return (
        <svg {...common}>
          <path d="M3.5 7.5h9v8h-9zM12.5 10.5h3.5l2.5 2.5v2.5h-6z" />
          <circle cx="7" cy="17.5" r="1.6" />
          <circle cx="16" cy="17.5" r="1.6" />
        </svg>
      );
    case "overdue":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 7.5V12l3 2" />
        </svg>
      );
    case "reserved":
      return (
        <svg {...common}>
          <path d="M4 5h2l2.2 9.5h9L19 8H7" />
          <circle cx="10" cy="18.5" r="1.4" />
          <circle cx="16.5" cy="18.5" r="1.4" />
        </svg>
      );
    case "incomingStock":
      return (
        <svg {...common}>
          <path d="M3.5 7h9v8h-9zM12.5 10h3.5l2.5 2.5V15h-6z" />
          <circle cx="7" cy="17.5" r="1.6" />
          <circle cx="16" cy="17.5" r="1.6" />
        </svg>
      );
    case "reminder":
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M4 9.5h16M8.5 3.5v3M15.5 3.5v3" />
        </svg>
      );
    // A drawn pin, not 📌. This file already learned that lesson on the grip:
    // an emoji renders at a different weight, size and colour in every font on
    // every platform, so the same card looked different depending on where it
    // was opened — and an emoji cannot take the note's own colour.
    case "fileStack":
      return (
        <svg {...common}>
          <path d="M8 3h6l4 4v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
          <path d="M14 3v4h4" />
        </svg>
      );
    case "pie":
      return (
        <svg {...common}>
          <path d="M12 3a9 9 0 1 0 9 9h-9V3Z" />
          <path d="M14.5 3.6A9 9 0 0 1 20.4 9.5" />
        </svg>
      );
    case "link":
      return (
        <svg {...common}>
          <path d="M10 13.5a4 4 0 0 0 5.7.3l2.6-2.6a4 4 0 0 0-5.7-5.7l-1.5 1.5" />
          <path d="M14 10.5a4 4 0 0 0-5.7-.3l-2.6 2.6a4 4 0 0 0 5.7 5.7l1.5-1.5" />
        </svg>
      );
    case "upload":
      return (
        <svg {...common}>
          <path d="M12 16V5" />
          <path d="m7.5 9.5 4.5-4.5 4.5 4.5" />
          <path d="M5 15v3.5h14V15" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4.5 4.5" />
        </svg>
      );
    case "pin":
      return (
        <svg {...common}>
          <path d="M14.5 3.5 20.5 9.5" />
          <path d="M17.6 6.6 12.8 9.1a3 3 0 0 0-1.4 1.5l-1 2.4 4.6 4.6 2.4-1a3 3 0 0 0 1.5-1.4l2.5-4.8" />
          <path d="M10.4 13 4.5 19.5" />
        </svg>
      );
    case "order":
      return (
        <svg {...common}>
          <path d="M6 4h9l3 3v13H6z" />
          <path d="M9 10h6M9 14h4" />
        </svg>
      );
    case "customer":
      return (
        <svg {...common}>
          <circle cx="12" cy="8.5" r="3.5" />
          <path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" />
        </svg>
      );
    case "note":
      return (
        <svg {...common}>
          <path d="M5 4h14v16H5z" />
          <path d="M8.5 9h7M8.5 13h5" />
        </svg>
      );
  }
}

/**
 * The activity feed's glyphs.
 *
 * Filled white marks that sit inside the coloured disc, unlike the line
 * drawings above: at this size (a 30px disc in a 1x1 card) a stroked glyph
 * turns to grey mush, and the disc's colour is what makes the row scannable.
 * Colour never carries the meaning on its own — the title always names the
 * event — so these read as reinforcement, not as a legend to learn.
 */
export type HomeActivityIconName =
  | "order" | "payment" | "production" | "file"
  | "inventory" | "customer" | "schedule"
  | "estimate" | "bank" | "note" | "message" | "delivery" | "team"
  | "update";

export function HomeActivityIcon({ name }: { name: HomeActivityIconName }) {
  const common = { viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": true };
  switch (name) {
    case "order":
      return (
        <svg {...common}>
          <path d="M3.5 4.2h2.1a1 1 0 0 1 .98.8l.27 1.3h12.4a1 1 0 0 1 .98 1.2l-1.16 5.4a1.7 1.7 0 0 1-1.66 1.34H9.1a1.7 1.7 0 0 1-1.66-1.33L5.55 5.9H3.5a.85.85 0 0 1 0-1.7Z" />
          <circle cx="9.7" cy="18.6" r="1.7" />
          <circle cx="17.4" cy="18.6" r="1.7" />
        </svg>
      );
    case "production":
      // Eight fat teeth, not twelve fine ones: at 16px a detailed cog fills in
      // and reads as a dark blob rather than as a gear.
      return (
        <svg {...common}>
          <path d="M12 2.2a2 2 0 0 1 1.9 1.35l.35 1.02c.3.11.6.24.87.4l.99-.44a2 2 0 0 1 2.34.5l1.52 1.52a2 2 0 0 1 .5 2.34l-.44.99c.16.28.29.57.4.87l1.02.35A2 2 0 0 1 21.8 12v2.15a2 2 0 0 1-1.35 1.9l-1.02.35c-.11.3-.24.59-.4.87l.44.99a2 2 0 0 1-.5 2.34l-1.52 1.52-.03-.02a2 2 0 0 1-2.31.48l-.99-.44c-.28.16-.57.29-.87.4l-.35 1.02H10.1l-.35-1.02c-.3-.11-.59-.24-.87-.4l-.99.44a2 2 0 0 1-2.34-.5L4.03 20.6a2 2 0 0 1-.5-2.34l.44-.99c-.16-.28-.29-.57-.4-.87l-1.02-.35A2 2 0 0 1 2.2 14.15V12a2 2 0 0 1 1.35-1.9l1.02-.35c.11-.3.24-.59.4-.87l-.44-.99a2 2 0 0 1 .5-2.34L6.55 4.03a2 2 0 0 1 2.34-.5l.99.44c.28-.16.57-.29.87-.4l.35-1.02A2 2 0 0 1 12 2.2Zm0 5.9a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
        </svg>
      );
    case "file":
      return (
        <svg {...common}>
          <path d="M6.6 2.6h6.3l5.1 5.1v12.1a1.7 1.7 0 0 1-1.7 1.7H6.6a1.7 1.7 0 0 1-1.7-1.7V4.3a1.7 1.7 0 0 1 1.7-1.7Z" />
          <path d="M13.2 3v4.4h4.4" fill="#000" fillOpacity=".28" />
        </svg>
      );
    case "inventory":
      return (
        <svg {...common}>
          <path d="M12 2.4 3.2 6.9v10.2L12 21.6l8.8-4.5V6.9L12 2.4Zm0 2 6.1 3.1L12 10.6 5.9 7.5 12 4.4Z" />
          <path d="M4.9 8.9 11.1 12v7L4.9 15.9V8.9Zm8 3.1 6.2-3.1v7L12.9 19v-7Z" />
        </svg>
      );
    case "customer":
      return (
        <svg {...common}>
          <circle cx="12" cy="8.1" r="3.9" />
          <path d="M12 13.4c-4 0-7.2 2.4-7.2 5.4 0 .9.7 1.6 1.6 1.6h11.2c.9 0 1.6-.7 1.6-1.6 0-3-3.2-5.4-7.2-5.4Z" />
        </svg>
      );
    case "schedule":
      return (
        <svg {...common}>
          <path d="M7.4 2.6c.5 0 .9.4.9.9v1h6.4v-1a.9.9 0 1 1 1.8 0v1h1.2a2 2 0 0 1 2 2v12.6a2 2 0 0 1-2 2H5.3a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2h1.2v-1c0-.5.4-.9.9-.9ZM5.1 9.4v9.1h13.8V9.4H5.1Z" />
          <rect x="7" y="11.4" width="3.2" height="3.2" rx=".8" />
        </svg>
      );
    case "estimate":
      // A sheet with a tick: an estimate row is almost always an approval or a
      // decline, and the tick is what tells the two apart at a glance from the
      // colour beside it.
      return (
        <svg {...common}>
          <path d="M6.6 2.6h6.3l5.1 5.1v6.2a6 6 0 0 0-8.1 7.6H6.6a1.7 1.7 0 0 1-1.7-1.7V4.3a1.7 1.7 0 0 1 1.7-1.7Z" />
          <path d="M13.2 3v4.4h4.4" fill="#000" fillOpacity=".28" />
          <path d="M16.9 14.4a4.4 4.4 0 1 1 0 8.8 4.4 4.4 0 0 1 0-8.8Zm2.2 2.9-2.9 2.9-1.4-1.4-1 1 2.4 2.4 3.9-3.9-1-1Z" />
        </svg>
      );
    case "bank":
      return (
        <svg {...common}>
          <path d="M12 2.6 21.4 7v2H2.6V7L12 2.6Z" />
          <rect x="4.9" y="10.6" width="2.4" height="7.2" rx=".7" />
          <rect x="10.8" y="10.6" width="2.4" height="7.2" rx=".7" />
          <rect x="16.7" y="10.6" width="2.4" height="7.2" rx=".7" />
          <rect x="2.6" y="19.2" width="18.8" height="2.2" rx=".9" />
        </svg>
      );
    case "note":
      return (
        <svg {...common}>
          <path d="M5.4 3.2h13.2a1.8 1.8 0 0 1 1.8 1.8v10.3l-5.5 5.5H5.4a1.8 1.8 0 0 1-1.8-1.8V5a1.8 1.8 0 0 1 1.8-1.8Z" />
          <path d="M20.4 15.3h-4a1.4 1.4 0 0 0-1.4 1.4v4l5.4-5.4Z" fill="#000" fillOpacity=".28" />
        </svg>
      );
    case "message":
      return (
        <svg {...common}>
          <path d="M4.4 3.6h15.2a1.9 1.9 0 0 1 1.9 1.9v9.1a1.9 1.9 0 0 1-1.9 1.9H9.8l-4.6 3.7a.8.8 0 0 1-1.3-.63V16.5h-.1a1.9 1.9 0 0 1-1.3-1.8V5.5a1.9 1.9 0 0 1 1.9-1.9Z" />
        </svg>
      );
    case "delivery":
      return (
        <svg {...common}>
          <path d="M2.8 5.6h9.6a1.2 1.2 0 0 1 1.2 1.2v8.4H2.8a1.2 1.2 0 0 1-1.2-1.2V6.8a1.2 1.2 0 0 1 1.2-1.2Z" />
          <path d="M14.8 8.8h3.3l3.3 3.5v2.9h-6.6V8.8Z" />
          <circle cx="7" cy="17.7" r="2.1" />
          <circle cx="17.4" cy="17.7" r="2.1" />
        </svg>
      );
    case "team":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3.4" />
          <circle cx="17" cy="9.4" r="2.6" />
          <path d="M9 12.8c-3.5 0-6.3 2.1-6.3 4.7 0 .8.6 1.4 1.4 1.4h9.8c.8 0 1.4-.6 1.4-1.4 0-2.6-2.8-4.7-6.3-4.7Z" />
          <path d="M17 13.4c-.7 0-1.4.1-2 .3 1.1 1 1.8 2.3 1.8 3.8h3.5c.7 0 1.3-.6 1.3-1.3 0-1.6-2-2.8-4.6-2.8Z" fill="#000" fillOpacity=".22" />
        </svg>
      );
    case "update":
    default:
      return (
        <svg {...common}>
          <path d="M12 2.8a9.2 9.2 0 1 0 9.2 9.2.9.9 0 0 0-1.8 0A7.4 7.4 0 1 1 12 4.6a.9.9 0 0 0 0-1.8Z" />
          <path d="M12.9 7.3a.9.9 0 0 0-1.8 0v5.1c0 .3.2.6.4.8l3.2 2a.9.9 0 1 0 .95-1.53l-2.77-1.72V7.3Z" />
        </svg>
      );
  }
}
