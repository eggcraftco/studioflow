// The note editor's text area fits the note (owner, 28 Oct 2026: editing a long
// note kept it squeezed into the six-row box used for a new note). It opens tall
// enough to show the whole text and grows while typing; the CSS cap (maxHeight,
// a share of the screen) stops it there and the rest scrolls inside the box.

type FitTarget = {
  style: { height: string };
  scrollHeight: number;
  offsetHeight: number;
  clientHeight: number;
};

type ScrollTarget = { scrollTop: number };

/**
 * Size `area` to its content. Collapsing to `auto` first lets it shrink after a
 * deletion; `rows` stays the floor. The editor window scrolls (maxHeight 90vh)
 * and the momentary collapse shortens it, which would jump it upwards, so its
 * scroll position is put back.
 */
export function fitTextAreaToContent(area: FitTarget, scroller?: ScrollTarget | null): void {
  const outer = scroller ? scroller.scrollTop : 0;
  area.style.height = "auto";
  // border-box sizing: scrollHeight leaves out the borders, so add them back or
  // a box exactly as tall as the text shows a scrollbar.
  const borders = Math.max(0, area.offsetHeight - area.clientHeight);
  area.style.height = `${area.scrollHeight + borders}px`;
  if (scroller) scroller.scrollTop = outer;
}
