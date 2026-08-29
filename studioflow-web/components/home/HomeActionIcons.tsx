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
