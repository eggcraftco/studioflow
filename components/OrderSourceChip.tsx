// UX-010 / UX-006 (27 Oct 2026): the platform an order came from, as a small
// text capsule on every order row (Orders list, Schedule list, Production board).
// One resolver decides it (orderSourceOf, the same one the Source filter uses);
// an order added by hand — including assistant-created and repair orders — has
// no chip. The words are always there; the colour (app/globals.css, the
// --order-source-* tokens) only repeats them.
import { orderSourceChipLabel, orderSourceOf, type OrderSourceInput } from "@/lib/studioflow/orderFilters";

export function OrderSourceChip({
  order,
  t,
  className = ""
}: {
  order: OrderSourceInput;
  /** The screen's own studioT for its language ("Website" and the "Source" hover word go through it). */
  t: (text: string) => string;
  className?: string;
}) {
  const source = orderSourceOf(order);
  const label = orderSourceChipLabel(source, t);
  if (!label) return null;
  return (
    <span
      className={["order-source-chip", `is-${source}`, className].filter(Boolean).join(" ")}
      data-source-chip={source}
      title={`${t("Source")}: ${label}`}
    >
      {label}
    </span>
  );
}
