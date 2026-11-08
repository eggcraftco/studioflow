// "How do I…?" must never sit on a page's own button (owner, 8 Nov 2026: in Inventory ▸ WooCommerce products the
// floating help button covered "Bring in selected" — a click on that button opened the help panel instead).
//
// Two kinds of control can end up under the bubble's corner:
//   * ordinary page content (a table row's "Move to…", a form field) — it scrolls, and .app-shell-content already
//     keeps room under the last row (globals.css), so the person can always scroll it out from under the bubble;
//   * a PINNED control — inside a `position: sticky` or `position: fixed` box (the import panels' footer with
//     "Bring in selected", the Messages reply box). Scrolling cannot move it, so the bubble moves instead: it rises
//     just above the highest pinned control under it, and comes back down when the page no longer has one there.
// While a modal dialog is open the bubble goes under the dialog's dimmed backdrop (a dialog is modal: its Save is
// never covered, and the bubble does not jump around the form).
//
// The arithmetic is pure (helpLiftFor) so it can be tested without a browser; the hook only measures.
import { useEffect, type RefObject } from "react";

export type HelpBox = { top: number; bottom: number; left: number; right: number };

export const HELP_CLEARANCE_GAP = 10;
export const HELP_LIFT_MAX = 320;
const HELP_LIFT_ROUNDS = 5;

/**
 * How far (px) the bubble must rise from its home box so that no pinned control is under it.
 * `pinnedUnder(box)` answers the pinned controls' boxes under a candidate position; each round raises the bubble
 * above the highest one found, then looks again (a footer can sit above another bar). Never more than `max`.
 */
export function helpLiftFor(
  home: HelpBox,
  pinnedUnder: (box: HelpBox) => HelpBox[],
  { gap = HELP_CLEARANCE_GAP, max = HELP_LIFT_MAX, rounds = HELP_LIFT_ROUNDS } = {}
): number {
  let lift = 0;
  for (let round = 0; round < rounds; round += 1) {
    const box = { ...home, top: home.top - lift, bottom: home.bottom - lift };
    const under = pinnedUnder(box).filter((c) => c.bottom > box.top && c.top < box.bottom && c.right > box.left && c.left < box.right);
    if (!under.length) return lift;
    const highest = Math.min(...under.map((c) => c.top));
    const next = Math.ceil(home.bottom - highest + gap);
    if (next <= lift) return lift;          // cannot rise further over this one: stay where we are
    if (next >= max) return max;
    lift = next;
  }
  return lift;
}

const INTERACTIVE = 'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [contenteditable="true"]';
const HELP_PARTS = ".app-help-bubble, .app-help-panel";
const MODAL = '.modal-backdrop, [aria-modal="true"]';

function isPinned(element: Element | null): boolean {
  for (let node = element; node && node !== document.body && node !== document.documentElement; node = node.parentElement) {
    const position = window.getComputedStyle(node).position;
    if (position === "sticky" || position === "fixed") return !node.matches(HELP_PARTS);
  }
  return false;
}

function boxOf(rect: DOMRect | HelpBox): HelpBox {
  return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
}

/** The pinned controls under a box: the topmost page element (help parts skipped) at nine points of the box. */
function pinnedControlsUnder(box: HelpBox): HelpBox[] {
  const xs = [box.left + 6, (box.left + box.right) / 2, box.right - 6];
  const ys = [box.top + 6, (box.top + box.bottom) / 2, box.bottom - 6];
  const found = new Set<Element>();
  for (const x of xs) {
    for (const y of ys) {
      if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) continue;
      const stack = typeof document.elementsFromPoint === "function" ? document.elementsFromPoint(x, y) : [];
      const top = stack.find((element) => !element.closest(HELP_PARTS));
      const control = top ? top.closest(INTERACTIVE) : null;
      if (control && !control.closest(HELP_PARTS) && isPinned(control)) found.add(control);
    }
  }
  return Array.from(found).map((element) => boxOf(element.getBoundingClientRect()));
}

function modalIsOpen(): boolean {
  return Array.from(document.querySelectorAll(MODAL)).some((element) => {
    if (element.closest(HELP_PARTS)) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
}

/**
 * Keeps the bubble (`bubbleRef`) clear of pinned controls and under modal dialogs. Writes two things on <html>:
 * `--app-help-lift` (the bubble's and the panel's rise, globals.css) and `data-help-under-modal`.
 */
export function useAppHelpClearance(bubbleRef: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active || typeof window === "undefined") return;
    const rootStyle = document.documentElement.style;
    let lift = 0;
    let frame = 0;

    const measure = () => {
      frame = 0;
      const bubble = bubbleRef.current;
      if (!bubble) return;
      const underModal = modalIsOpen();
      document.documentElement.toggleAttribute("data-help-under-modal", underModal);
      const rect = bubble.getBoundingClientRect();
      // Home = where the bubble is drawn without the rise (the rise is a transform, so the box already includes it).
      const home = { top: rect.top + lift, bottom: rect.bottom + lift, left: rect.left, right: rect.right };
      const next = underModal || rect.width === 0 ? 0 : helpLiftFor(home, pinnedControlsUnder);
      if (next !== lift) {
        lift = next;
        if (lift) rootStyle.setProperty("--app-help-lift", `${lift}px`);
        else rootStyle.removeProperty("--app-help-lift");
      }
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(measure); };

    schedule();
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    const observer = typeof MutationObserver === "function" ? new MutationObserver(schedule) : null;
    observer?.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "hidden", "open", "aria-modal"] });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      observer?.disconnect();
      rootStyle.removeProperty("--app-help-lift");
      document.documentElement.removeAttribute("data-help-under-modal");
    };
  }, [bubbleRef, active]);
}
