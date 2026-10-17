"use client";

// Order detail on a phone (review N14, 17 Oct 2026): the header and tab bar
// stick to the top of the scrolling pane, and on a 390 px phone they kept
// 286 px of an 844 px screen (with the 66 px app bar, 43 %) while the person
// read the cards below. Once the full header has scrolled past, it condenses
// to one line — the order's name and Actions — and it opens up again at the
// top of the page, or when keyboard focus enters it (and stays open while
// keyboard focus is inside).
//
// The two thresholds are far apart on purpose. Condensing shortens the sticky
// header, the content under it moves up and the browser's scroll anchoring
// lowers scrollTop by about the same amount; with one threshold that would
// flip the header back and forth.

import { useEffect, useState, type RefObject } from "react";

/** Phones only: the desktop header is short and has room. */
export const CONDENSED_HEADER_QUERY = "(max-width: 640px)";
/** Scrolled this far past the full header's height before it condenses. */
export const CONDENSE_AFTER_EXTRA_PX = 24;
/** Back within this distance of the top before it opens up again. */
export const EXPAND_WITHIN_PX = 8;

export function nextCondensedState(condensed: boolean, scrollTop: number, fullHeaderHeight: number): boolean {
  if (!condensed && scrollTop > fullHeaderHeight + CONDENSE_AFTER_EXTRA_PX) return true;
  if (condensed && scrollTop < EXPAND_WITHIN_PX) return false;
  return condensed;
}

function scrollParentOf(element: HTMLElement): HTMLElement | null {
  let node = element.parentElement;
  while (node) {
    const overflowY = getComputedStyle(node).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") return node;
    node = node.parentElement;
  }
  return null;
}

export function useCondensedHeader(headRef: RefObject<HTMLElement | null>): boolean {
  const [condensed, setCondensed] = useState(false);

  useEffect(() => {
    const head = headRef.current;
    if (!head || typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia(CONDENSED_HEADER_QUERY);
    const scroller = scrollParentOf(head);
    let current = false;
    let fullHeight = head.getBoundingClientRect().height;

    const apply = (next: boolean) => {
      if (next === current) return;
      current = next;
      setCondensed(next);
    };
    let keyboardInside = false;
    const onScroll = () => {
      if (!media.matches) { apply(false); return; }
      // While keyboard focus is in the header it stays open (see onFocusIn).
      if (keyboardInside) return;
      // The full height is read only while the full header is on screen: right
      // after it opens React has not re-rendered yet, and the condensed height
      // would make the next scroll event fold it again.
      if (!head.classList.contains("is-condensed")) fullHeight = head.getBoundingClientRect().height;
      const top = scroller ? scroller.scrollTop : window.scrollY;
      apply(nextCondensedState(current, top, fullHeight));
    };
    // A keyboard user tabbing back into the header gets all of it. Only keyboard
    // focus: a tap on Actions must not move the button from under the finger.
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target as Element | null;
      let keyboard = false;
      try { keyboard = Boolean(target?.matches(":focus-visible")); } catch { keyboard = false; }
      if (keyboard) { keyboardInside = true; apply(false); }
    };
    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget as Node | null;
      if (!next || !head.contains(next)) keyboardInside = false;
    };

    const target: HTMLElement | Window = scroller ?? window;
    target.addEventListener("scroll", onScroll, { passive: true });
    head.addEventListener("focusin", onFocusIn);
    head.addEventListener("focusout", onFocusOut);
    media.addEventListener?.("change", onScroll);
    onScroll();
    return () => {
      target.removeEventListener("scroll", onScroll);
      head.removeEventListener("focusin", onFocusIn);
      head.removeEventListener("focusout", onFocusOut);
      media.removeEventListener?.("change", onScroll);
    };
  }, [headRef]);

  return condensed;
}
