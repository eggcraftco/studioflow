// UX-010 / UX-006: the platform an order came from, on every order row (Orders list, Schedule list,
// Production board). 27 Oct 2026 it was the platform's name in a capsule; 28 Oct 2026 (owner: "show
// initials, not the long names") it is the platform's monogram (components/OrderSourceMonogram.tsx),
// the full name in the tooltip and as the accessible name. One resolver decides it (orderSourceOf, the
// same one the Source filter and the quick platform bar use); an order added by hand — including
// assistant-created and repair orders — has none. The order page's channel strip keeps the full name.
import { OrderSourceMonogram } from "@/components/OrderSourceMonogram";
import { isOrderPlatform, orderSourceChipLabel, orderSourceOf, type OrderSourceInput } from "@/lib/studioflow/orderFilters";

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
  if (!isOrderPlatform(source)) return null;
  return (
    <OrderSourceMonogram
      source={source}
      t={t}
      title={`${t("Source")}: ${orderSourceChipLabel(source, t)}`}
      className={className}
    />
  );
}
