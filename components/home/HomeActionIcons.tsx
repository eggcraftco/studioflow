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
