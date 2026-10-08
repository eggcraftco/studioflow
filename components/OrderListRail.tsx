"use client";

// The narrow rail the Orders and Schedule lists fold to (8 Oct 2026). Before,
// collapsing the list hid it outright and left a 64 px strip with one button;
// now every order in the current filter keeps a square: its photo, or the
// customer's initials / project number (lib/studioflow/orderRail.ts), with the
// status colour in the corner. The selected order has a ring. Hover shows the
// number, the customer and the status; click selects; the keyboard walks the
// list with the arrows and selects with Enter or Space. The full list stays
// mounted behind it, so the filters, the search and the selection are the
// page's own state and survive the fold untouched.
import { useEffect, useRef, type KeyboardEvent, type SyntheticEvent } from "react";
import { orderRailFallbackText, orderRailImageUrl, orderRailTone, orderRailTooltip, type OrderRailItem } from "@/lib/studioflow/orderRail";

export function OrderListRail<T extends OrderRailItem>({
  orders,
  selectedId,
  onSelect,
  onHoverChange,
  label,
  statusText,
  idPrefix,
}: {
  orders: T[];
  selectedId: string;
  onSelect: (order: T) => void;
  onHoverChange?: (orderId: string) => void;
  /** The rail's accessible name, already in the reader's language. */
  label: string;
  /** The status in the reader's language, for the tooltip. */
  statusText: (status: string) => string;
  idPrefix: string;
}) {
  const railRef = useRef<HTMLDivElement | null>(null);

  // The selected square is kept in view whenever the selection changes or the
  // rail appears, so the person folding the list still sees where they are.
  useEffect(() => {
    if (!selectedId) return;
    const node = railRef.current?.querySelector<HTMLElement>(`[data-rail-order="${CSS.escape(selectedId)}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [selectedId, orders.length]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
    if (!keys.includes(event.key)) return;
    const buttons = Array.from(railRef.current?.querySelectorAll<HTMLButtonElement>("button[data-rail-order]") ?? []);
    if (buttons.length === 0) return;
    const current = buttons.findIndex(button => button === document.activeElement);
    let next = current;
    if (event.key === "ArrowDown") next = current < 0 ? 0 : Math.min(buttons.length - 1, current + 1);
    if (event.key === "ArrowUp") next = current < 0 ? buttons.length - 1 : Math.max(0, current - 1);
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = buttons.length - 1;
    event.preventDefault();
    buttons[next]?.focus();
  }

  function hideBrokenImage(event: SyntheticEvent<HTMLImageElement>) {
    event.currentTarget.style.display = "none";
  }

  return (
    <div
      ref={railRef}
      className="orders-rail"
      role="listbox"
      aria-label={label}
      aria-orientation="vertical"
      onKeyDown={handleKeyDown}
      data-orders-rail="1"
    >
      {orders.map(order => {
        const selected = order.id === selectedId;
        const image = orderRailImageUrl(order.previewImageUrl);
        const tone = orderRailTone(order.status, order.isDispatched);
        const tooltip = orderRailTooltip(order, statusText(order.status));
        return (
          <button
            key={order.id}
            id={`${idPrefix}-${order.id}`}
            type="button"
            role="option"
            aria-selected={selected}
            aria-label={tooltip}
            title={tooltip}
            tabIndex={selected || (!selectedId && order === orders[0]) ? 0 : -1}
            className={selected ? "orders-rail-item is-selected" : "orders-rail-item"}
            data-rail-order={order.id}
            data-rail-tone={tone}
            onClick={() => onSelect(order)}
            onMouseEnter={onHoverChange ? () => onHoverChange(order.id) : undefined}
            onMouseLeave={onHoverChange ? () => onHoverChange("") : undefined}
          >
            <span className="orders-rail-fallback" aria-hidden="true">{orderRailFallbackText(order)}</span>
            {image ? <img src={image} alt="" loading="lazy" onError={hideBrokenImage} /> : null}
            <span className={`orders-rail-dot is-${tone}`} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
