// The Production board's Done lane: the latest few, the count, and the whole
// list on request.
//
// Done only ever grows — every dispatched job lands there and stays — and the
// lane used to draw all of it, earliest due date first. With forty jobs it was
// 5,800 px tall, every other lane and the detail panel were stretched to the
// same height, and the panel's Open order button sat at the bottom of that.
//
// Order: latest due date first. An order does not record when it was
// dispatched, so the date it was promised for is the one date every finished
// job has; productionStageAtMs is the last board move of any kind, not the move
// into Done, so it cannot stand in. A job the viewer has just moved into Done
// goes to the top for the rest of the visit, so the move is seen.
//
// No imports: scripts/check-production-panel.mjs compiles and runs this file.

/** How many finished jobs the lane shows before "Show all". */
export const DONE_LANE_PREVIEW = 3;

export type DoneLaneCard = {
  order: { id: string };
  dueDate: Date | null;
};

/** Just moved here (most recent first), then latest due first, undated last; stable otherwise. */
export function sortDoneLane<T extends DoneLaneCard>(cards: T[], movedHereIds: readonly string[] = []): T[] {
  const pins = new Map<string, number>();
  movedHereIds.forEach((id, index) => { if (!pins.has(id)) pins.set(id, index); });
  const due = (card: T) => {
    const time = card.dueDate instanceof Date ? card.dueDate.getTime() : NaN;
    return Number.isFinite(time) ? time : -Infinity;
  };
  return cards
    .map((card, index) => ({ card, index, pin: pins.get(card.order.id), due: due(card) }))
    .sort((a, b) => {
      if (a.pin !== undefined || b.pin !== undefined) {
        if (a.pin === undefined) return 1;
        if (b.pin === undefined) return -1;
        return a.pin - b.pin;
      }
      if (a.due !== b.due) return a.due === -Infinity ? 1 : b.due === -Infinity ? -1 : b.due - a.due;
      return a.index - b.index;
    })
    .map(item => item.card);
}

export type DoneLaneView<T> = {
  /** The cards to draw. */
  visible: T[];
  /** How many are left out of this view. */
  hidden: number;
  total: number;
  /** Whether a Show all / Show less control belongs on the lane at all. */
  collapsible: boolean;
};

/** The preview when collapsed, everything when expanded; a short lane is never collapsed. */
export function doneLaneView<T>(cards: T[], expanded: boolean, preview: number = DONE_LANE_PREVIEW): DoneLaneView<T> {
  const limit = Math.max(1, Math.floor(preview));
  const total = cards.length;
  const collapsible = total > limit;
  const visible = collapsible && !expanded ? cards.slice(0, limit) : cards.slice();
  return { visible, hidden: total - visible.length, total, collapsible };
}

/** A move into Done puts that job first; the list keeps the last twenty. */
export function rememberMovedHere(ids: readonly string[], orderId: string, limit = 20): string[] {
  const id = String(orderId || "").trim();
  if (!id) return ids.slice();
  return [id, ...ids.filter(existing => existing !== id)].slice(0, Math.max(1, limit));
}
