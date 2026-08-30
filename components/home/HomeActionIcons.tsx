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
  | "reminder" | "order" | "customer" | "note";

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
  | "inventory" | "customer" | "schedule" | "update";

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
