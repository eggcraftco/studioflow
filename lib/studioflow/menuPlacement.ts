/**
 * Where a row's "···" menu goes (7 Nov 2026) — pure, so a check can run it without a browser.
 *
 * Used by components/RowActionsMenu.tsx, which draws the menu in its own layer (a portal on <body>,
 * `position: fixed`) instead of inside the box around the row: Banking ▸ Payment links' table frame clips what
 * overflows it, and the menu used to open under the row and disappear behind the frame's bottom edge.
 *
 * No imports on purpose: `node scripts/check-row-menu-layer.mts` loads this file as it is.
 */

export type MenuRect = { top: number; bottom: number; left: number; right: number };
export type MenuPlace = { top: number; left: number; above: boolean; maxHeight: number };

/** The gap between the button and the menu, and the margin the menu keeps from the window's edges. */
export const MENU_GAP = 6;
export const MENU_EDGE = 8;

/**
 * Under the button when the whole menu fits there; over it when it fits there instead; otherwise on the roomier side,
 * as tall as that side allows (the menu then scrolls). Its end lines up with the button's end — the button sits at
 * the row's end: the right in a left-to-right page, the left in Arabic — and it never leaves the window sideways.
 */
export function placeMenu(
  trigger: MenuRect,
  menu: { width: number; height: number },
  view: { width: number; height: number },
  rtl = false
): MenuPlace {
  const spaceBelow = view.height - MENU_EDGE - (trigger.bottom + MENU_GAP);
  const spaceAbove = trigger.top - MENU_GAP - MENU_EDGE;
  let above = false;
  let maxHeight = menu.height;
  let top: number;
  if (menu.height <= spaceBelow) {
    top = trigger.bottom + MENU_GAP;
  } else if (menu.height <= spaceAbove) {
    above = true;
    top = trigger.top - MENU_GAP - menu.height;
  } else if (spaceBelow >= spaceAbove) {
    maxHeight = Math.max(0, spaceBelow);
    top = trigger.bottom + MENU_GAP;
  } else {
    above = true;
    maxHeight = Math.max(0, spaceAbove);
    top = trigger.top - MENU_GAP - maxHeight;
  }
  let left = rtl ? trigger.left : trigger.right - menu.width;
  left = Math.min(left, view.width - MENU_EDGE - menu.width);
  left = Math.max(MENU_EDGE, left);
  return { top: Math.round(top), left: Math.round(left), above, maxHeight: Math.round(maxHeight) };
}
