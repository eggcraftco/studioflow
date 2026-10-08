// Order-detail cards: what each card is FOR (8 Oct 2026).
//
// Every card on the order view carries an "i" in its header. Pressing it shows
// one short purpose text for THAT card — what the Timeline & Delivery card does
// (delivery date, days remaining, late state), what To Do is for — so a member
// who is new to the workspace does not have to guess from the heading. It is
// not a description of the "..." menu options: those were tried and read as
// clutter.
//
// Keyed by card id (lib/studioflow/cardLayouts.ts ORDER_DETAIL_CARD_IDS), never
// by heading: the heading changes with the trade chosen at setup and with the
// owner's own renames ("Metals & Stones", "Ingredients"); the card's purpose
// does not. English here; the eleven translations live in language.ts and are
// probed through the real studioT by scripts/check-card-purposes.mjs.

import type { OrderDetailCardId } from "./cardLayouts";

export const ORDER_CARD_PURPOSES: Record<OrderDetailCardId, string> = {
  preview: "The order's pictures. Add photos of the piece, the design or the reference the customer sent; the first one is the order's cover image.",
  repairIntake: "Records the customer's own item that came in for repair: what it is, its condition and any marks. It is held for the customer, never counted as stock.",
  estimate: "The quote for this order and the customer's answer. Send the estimate, see whether it was approved or declined, and keep the signed record.",
  customerPortal: "The customer's own page for this order. Share the link so they can follow progress, see files and reply without an account.",
  summary: "The headline facts of the order: what is being made, how many, the main choices and the reference number. Edit a value by clicking it.",
  customer: "Who the order is for and how to reach them. Name, phone, e-mail and the customer's own notes, with shortcuts to call, message or open the customer.",
  invoiceItems: "The lines that will appear on the invoice: each item, its quantity and price. Totals and tax are worked out from these lines.",
  materials: "What this order needs in materials and parts, with a check for each. Items linked to inventory show their stock so nothing runs short mid-job.",
  priority: "How urgent the order is and whether it is at risk. Set the priority, flag a risk and write the reason so the team sees it at a glance.",
  delivery: "When the order was created and when it is due. Shows the delivery date, the days remaining and turns red once the order is late.",
  notes: "Free-form notes about this order for the team. Add your own note sections for the things this workspace always writes down.",
  clientFiles: "Files that belong to this order: designs, photos, documents and proofs. Upload, download and share them with the customer.",
  todo: "The task list for this order. Add steps, tick them off, set due dates and assign them to team members; overdue tasks are flagged.",
  workTime: "Time spent on this order. Start a timer or log hours by hand so labour can be costed and compared with the estimate.",
  financial: "The money on this order: price, cost, payments received, refunds and what is still owed. Record payments and see the margin.",
  status: "Where the order is in production. Tick the stages as the job moves along; the board and this card always show the same stage.",
  shipping: "How the finished order gets to the customer. Choose the courier, save the tracking number and follow the parcel from here.",
  schedule: "Reminders and alerts for this order. Set a date and time to be reminded about a fitting, a deadline or a follow-up.",
  historyLog: "Everything that happened to this order, in time order: who changed what and when. Read-only; nothing here can be edited."
};

export const ORDER_CARD_PURPOSE_TOGGLE = "What is this card for?";

/** The element the header "i" points at with aria-describedby, per card. */
export function orderCardPurposeId(cardId: OrderDetailCardId) {
  return `order-card-purpose-${cardId}`;
}
