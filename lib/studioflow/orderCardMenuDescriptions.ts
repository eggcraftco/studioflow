// Order-detail card "..." menu: one short description per option (8 Oct 2026).
//
// The panel behind the three dots on every order card (OrderDetailContent
// renderCardMenu) carried bare labels — "Fit content", "Match column", "S M L",
// "Reset" — and nothing said what each one would do until it had done it. These
// are the sentences shown on hover and keyboard focus on a desktop, and under
// each option on a phone once the "i" in the panel header is on; they are also
// what a screen reader gets through aria-describedby.
//
// Reading one must never run the option: the description is a sibling of the
// button, not part of it, and the phone toggle is its own button.
//
// English here; the 11 translations live in language.ts, probed by
// scripts/check-menu-card-strings.mjs through the real studioT.

export const ORDER_CARD_MENU_DESCRIPTIONS = {
  menuButton: "Block options: hide it, rename its headings, move, resize or colour it.",
  exportTodoPdf: "Opens a printable PDF of this to-do list in a new tab.",
  exportHistoryPdf: "Opens a printable PDF of this order's history log in a new tab.",
  editHeading: "Rename the headings inside this block for the whole workspace.",
  editHeadingUnavailable: "This block's headings cannot be renamed on the web yet.",
  hideBlock: "Removes this block from the order view. Bring it back from Customize cards in the order menu.",
  moveUp: "Moves this block one place up in its column.",
  moveDown: "Moves this block one place down in its column.",
  moveLeft: "Moves this block to the previous column.",
  moveRight: "Moves this block to the next column.",
  fitContent: "Shrinks the block to the exact height of its content.",
  matchColumn: "Gives every block in this column the same height as this one.",
  sizeS: "Short block height.",
  sizeM: "Medium block height.",
  sizeL: "Tall block height.",
  colourDefault: "Removes the tint and shows the block in the default card colour.",
  colourTint: "Tints this block in the chosen colour. The colour's meaning appears as a small chip on the block.",
  manageColourLabels: "Set what each colour means for the whole workspace.",
  reset: "Restores this block's default height and colour. Position and visibility are kept.",
  closePanel: "Closes this panel. Every change is already saved."
} as const;

export type OrderCardMenuOptionId = keyof typeof ORDER_CARD_MENU_DESCRIPTIONS;

/** The phone/touch affordance in the panel header; aria-pressed carries its state. */
export const ORDER_CARD_MENU_DESCRIPTIONS_TOGGLE = "Show what each option does";

export function orderCardMenuDescriptionId(cardId: string, option: OrderCardMenuOptionId, suffix?: string) {
  return `order-card-menu-desc-${cardId}-${option}${suffix ? `-${suffix.toLowerCase()}` : ""}`;
}
