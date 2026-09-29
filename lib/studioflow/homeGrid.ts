import { homeCardColumns, homeCardRows, type HomeCardPlacement, type HomeCardSize } from "@/lib/studioflow/homeCards";

/**
 * Where the Home cards actually land, and where the holes are.
 *
 * The stored layout is an ordered list with no positions in it — that is what
 * makes it safe to sync — so every platform has to derive the grid from the
 * order. This is that derivation, and it is deliberately the same arithmetic in
 * TypeScript, Swift and Kotlin: two devices showing one member's layout must
 * agree about it.
 *
 * The rule is CSS grid's own sparse auto-placement, because the web grid was
 * always doing it and the native comments always described it: a card that does
 * not fit the space left on a row starts the next one, and the cursor never
 * goes backwards. The native packers searched from row 0 for every card, which
 * quietly backfilled a hole with a later card — the same layout drew one way on
 * a Mac and another in a browser, and a card dropped "at the end" could appear
 * at the top.
 *
 * A hole is a run of free cells with a card after it. It is the thing you can
 * now drop a card into, and its `index` is where that card goes in the list.
 *
 * `fillRows` is for a grid narrower than the four columns a layout is arranged
 * in (three or two beside a sidebar or on a tablet; never the phone's two).
 * There a 2x1 that does not fit the one column left on a row starts the next
 * row, and in the default layout that left the right-hand column empty on
 * five rows. So the card that ends a row takes the free cells after it: a row
 * never ends in a gap, nothing moves in the reading order, and nothing is
 * drawn smaller than its own size. A 1x1 that grows to two columns is drawn
 * as the 2x1 it now is (`drawnSize`); the stored size does not change.
 */

export type HomeGridSlot = {
  placement: HomeCardPlacement;
  /** Index in the list this grid was packed from. */
  index: number;
  row: number;
  column: number;
  width: number;
  height: number;
  /** The size the card is drawn at: its own, or 2x1 for a 1x1 that closed a gap. */
  drawnSize: HomeCardSize;
};

export type HomeGridHole = {
  row: number;
  column: number;
  width: number;
  /** Where a card dropped here goes in the list it was packed from. */
  index: number;
};

export type HomeGrid = {
  slots: HomeGridSlot[];
  holes: HomeGridHole[];
  rows: number;
};

function fits(taken: Set<string>, row: number, column: number, width: number, height: number) {
  for (let r = 0; r < height; r += 1) {
    for (let c = 0; c < width; c += 1) {
      if (taken.has(`${row + r}:${column + c}`)) return false;
    }
  }
  return true;
}

export function packHomeGrid(
  placements: HomeCardPlacement[],
  columnCount: number,
  options: { fillRows?: boolean } = {},
): HomeGrid {
  const taken = new Set<string>();
  const slots: HomeGridSlot[] = [];
  // The auto-placement cursor. It only ever moves forward, which is the whole
  // difference between "reading order" and "wherever it happens to fit".
  let cursorRow = 0;
  let cursorColumn = 0;

  placements.forEach((placement, index) => {
    const width = Math.min(homeCardColumns(placement.size), columnCount);
    const height = homeCardRows(placement.size);
    let row = cursorRow;
    let column = cursorColumn;
    for (;;) {
      if (column + width > columnCount) {
        row += 1;
        column = 0;
        continue;
      }
      if (fits(taken, row, column, width, height)) break;
      column += 1;
    }
    for (let r = 0; r < height; r += 1) {
      for (let c = 0; c < width; c += 1) taken.add(`${row + r}:${column + c}`);
    }
    slots.push({ placement, index, row, column, width, height, drawnSize: placement.size });
    cursorRow = row;
    cursorColumn = column + width;
  });

  const rows = slots.reduce((most, slot) => Math.max(most, slot.row + slot.height), 0);

  if (options.fillRows) {
    for (let row = 0; row < rows; row += 1) {
      let last = -1;
      for (let column = columnCount - 1; column >= 0; column -= 1) {
        if (taken.has(`${row}:${column}`)) { last = column; break; }
      }
      if (last < 0 || last === columnCount - 1) continue;
      const slot = slots.find((candidate) => candidate.row <= row && row < candidate.row + candidate.height
        && candidate.column <= last && last < candidate.column + candidate.width);
      if (!slot) continue;
      // A 2x2 widens only if the space beside it is free on both of its rows.
      let free = true;
      for (let r = slot.row; r < slot.row + slot.height && free; r += 1) {
        for (let c = last + 1; c < columnCount; c += 1) {
          if (taken.has(`${r}:${c}`)) { free = false; break; }
        }
      }
      if (!free) continue;
      for (let r = slot.row; r < slot.row + slot.height; r += 1) {
        for (let c = last + 1; c < columnCount; c += 1) taken.add(`${r}:${c}`);
      }
      slot.width += columnCount - 1 - last;
      if (slot.placement.size === "1x1" && slot.width >= 2) slot.drawnSize = "2x1";
    }
  }

  // A free cell is only a hole if something comes after it: the empty space at
  // the end of the last row is where the list simply stops, not a gap in it.
  const holes: HomeGridHole[] = [];
  const lastCell = slots.reduce(
    (latest, slot) => Math.max(latest, (slot.row + slot.height - 1) * columnCount + slot.column + slot.width - 1),
    -1,
  );
  for (let row = 0; row < rows; row += 1) {
    let column = 0;
    while (column < columnCount) {
      if (taken.has(`${row}:${column}`) || row * columnCount + column > lastCell) {
        column += 1;
        continue;
      }
      let width = 0;
      while (column + width < columnCount && !taken.has(`${row}:${column + width}`)
             && row * columnCount + column + width <= lastCell) {
        width += 1;
      }
      // The card that comes after this space in reading order is the one this
      // space sits in front of, so a card dropped here takes its place in the
      // list and pushes it along.
      const after = slots.find((slot) => slot.row > row || (slot.row === row && slot.column >= column + width));
      holes.push({ row, column, width, index: after ? after.index : placements.length });
      column += width;
    }
  }

  return { slots, holes, rows };
}

/** Whether a card of this size can be dropped into this hole. */
export function homeHoleAccepts(hole: HomeGridHole, size: HomeCardPlacement["size"]) {
  return homeCardColumns(size) <= hole.width;
}
