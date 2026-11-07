"use client";

/**
 * A row's "···" menu that the box around it cannot cut off (7 Nov 2026).
 *
 * Banking ▸ Payment links drew its row menu inside the table's frame, and the frame clips what overflows it
 * (`overflow: hidden` keeps its rounded corners). On a wide screen the menu opened under the row and the table's
 * own bottom edge hid it; on a tab with one row it hid all of it, so "Cancel link" could not be reached at all
 * (the owner: "menü açılmıyor, arka planda içeride kalıyor").
 *
 * The menu now opens in a layer of its own — a portal on <body>, `position: fixed` — placed from the button's
 * rectangle: under the button when it fits, over it when it does not, kept inside the window, and moved with the
 * page while it is open. If the button scrolls out of the part of the page that can be seen, the menu closes rather
 * than float over something else.
 *
 * Keyboard (the WAI-ARIA menu button): Enter, Space or ↓ open it on the first item, ↑ on the last; ↑ ↓ Home End move
 * between the items; Esc closes it and gives the focus back to the button; Tab closes it and goes on from the button.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { placeMenu, type MenuPlace, type MenuRect } from "@/lib/studioflow/menuPlacement";

export type RowMenuItem = { key: string; label: string; danger?: boolean; disabled?: boolean; run: () => void };

/** The part of the window the button can actually be seen in: the window, cut by every ancestor that clips. */
function visibleArea(element: HTMLElement): MenuRect {
  let area: MenuRect = { top: 0, left: 0, bottom: window.innerHeight, right: window.innerWidth };
  for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
    const style = window.getComputedStyle(node);
    if (style.overflowX === "visible" && style.overflowY === "visible") continue;
    const box = node.getBoundingClientRect();
    area = {
      top: Math.max(area.top, box.top), left: Math.max(area.left, box.left),
      bottom: Math.min(area.bottom, box.bottom), right: Math.min(area.right, box.right),
    };
  }
  return area;
}

const TABBABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Focus the field after (step 1) or before (step -1) `from` in the page's Tab order; `from` itself when there is none. */
function focusBeside(from: HTMLElement, step: 1 | -1) {
  const fields = Array.from(document.querySelectorAll<HTMLElement>(TABBABLE))
    .filter((field) => field === from || (field.tabIndex >= 0 && field.getClientRects().length > 0 && !field.closest('[role="menu"]')));
  const at = fields.indexOf(from);
  (fields[at + step] ?? from).focus();
}

export default function RowActionsMenu({
  open,
  onOpenChange,
  items,
  "aria-label": ariaLabel,
  triggerClassName,
  menuClassName,
  dangerClassName,
  wrapClassName,
  rowKey,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: RowMenuItem[];
  "aria-label": string;
  triggerClassName?: string;
  menuClassName?: string;
  dangerClassName?: string;
  wrapClassName?: string;
  /** Marks the button's wrapper and the menu layer with `data-row-menu`, so the page can tell which row's menu it is. */
  rowKey: string;
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [place, setPlace] = useState<MenuPlace | null>(null);
  const focusOnOpen = useRef<"first" | "last">("first");
  const menuId = useId();
  const triggerId = `${menuId}-button`;
  // The page passes a new function on every render (a keystroke in its search box); kept in a ref so the listeners
  // below are not taken down and put back each time.
  const openChange = useRef(onOpenChange);
  openChange.current = onOpenChange;
  const setOpen = useCallback((next: boolean) => openChange.current(next), []);

  const close = useCallback((giveFocusBack: boolean) => {
    setOpen(false);
    if (giveFocusBack) triggerRef.current?.focus({ preventScroll: true });
  }, [setOpen]);

  const reposition = useCallback(() => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;
    const box = trigger.getBoundingClientRect();
    const seen = visibleArea(trigger);
    const middleY = (box.top + box.bottom) / 2;
    const middleX = (box.left + box.right) / 2;
    if (middleY < seen.top || middleY > seen.bottom || middleX < seen.left || middleX > seen.right) {
      // The button went out of sight (scrolled under the top bar, or out of its list): no menu floating over the page.
      setOpen(false);
      return;
    }
    const border = menu.offsetHeight - menu.clientHeight;
    const size = { width: menu.offsetWidth, height: menu.scrollHeight + border };
    const rtl = window.getComputedStyle(trigger).direction === "rtl";
    setPlace(placeMenu(box, size, { width: document.documentElement.clientWidth || window.innerWidth, height: window.innerHeight }, rtl));
  }, [setOpen]);

  // Placed before the first paint (no flash in the top corner), and again when the items change.
  useLayoutEffect(() => {
    if (!open) { setPlace(null); return; }
    reposition();
  }, [open, reposition, items.length]);

  // While open: follow the page as it scrolls or resizes; a press anywhere else closes it.
  useEffect(() => {
    if (!open) return;
    let frame = 0;
    const follow = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => { frame = 0; reposition(); });
    };
    const outside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && (triggerRef.current?.contains(target) || menuRef.current?.contains(target))) return;
      close(false);
    };
    window.addEventListener("scroll", follow, { capture: true, passive: true });
    window.addEventListener("resize", follow);
    document.addEventListener("pointerdown", outside, true);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", follow, { capture: true });
      window.removeEventListener("resize", follow);
      document.removeEventListener("pointerdown", outside, true);
    };
  }, [open, reposition, close]);

  const enabledItems = () => Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);

  // Once placed, the focus goes into the menu (first item, or the last when it was opened with ↑).
  const placed = place !== null;
  useEffect(() => {
    if (!open || !placed) return;
    const list = enabledItems();
    const target = focusOnOpen.current === "last" ? list[list.length - 1] : list[0];
    target?.focus({ preventScroll: true });
    focusOnOpen.current = "first";
  }, [open, placed]);

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      focusOnOpen.current = event.key === "ArrowUp" ? "last" : "first";
      if (!open) setOpen(true);
      else {
        const list = enabledItems();
        (event.key === "ArrowUp" ? list[list.length - 1] : list[0])?.focus({ preventScroll: true });
      }
    }
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const list = enabledItems();
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    const move = (index: number) => { event.preventDefault(); list[(index + list.length) % list.length]?.focus({ preventScroll: true }); };
    switch (event.key) {
      case "ArrowDown": move(at + 1); break;
      case "ArrowUp": move(at < 0 ? list.length - 1 : at - 1); break;
      case "Home": move(0); break;
      case "End": move(list.length - 1); break;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        close(true);
        break;
      case "Tab": {
        // The menu sits at the end of <body>: left to the browser, Tab would jump to the end of the page. It goes on
        // from the button instead — the next field after it, or the one before it with Shift.
        event.preventDefault();
        const trigger = triggerRef.current;
        close(false);
        if (trigger) focusBeside(trigger, event.shiftKey ? -1 : 1);
        break;
      }
      default:
        break;
    }
  };

  return (
    <span className={wrapClassName} data-row-menu={rowKey}>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        className={triggerClassName}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={ariaLabel}
        onClick={() => { focusOnOpen.current = "first"; setOpen(!open); }}
        onKeyDown={onTriggerKeyDown}
      >
        <span aria-hidden="true">···</span>
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-labelledby={triggerId}
            data-row-menu={rowKey}
            data-placement={place?.above ? "above" : "below"}
            className={menuClassName}
            style={{
              position: "fixed",
              top: place?.top ?? 0,
              left: place?.left ?? 0,
              maxHeight: place ? place.maxHeight : undefined,
              visibility: place ? "visible" : "hidden",
            }}
            onKeyDown={onMenuKeyDown}
          >
            {items.map((item) => (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                tabIndex={-1}
                className={item.danger ? dangerClassName : undefined}
                disabled={item.disabled}
                onClick={() => { close(true); item.run(); }}
              >
                {item.label}
              </button>
            ))}
          </div>,
          document.body
        )
        : null}
    </span>
  );
}
