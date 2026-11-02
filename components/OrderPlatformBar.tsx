"use client";

// UX-010 / UX-006 (28 Oct 2026): the quick platform bar at the top of an order list column, under the
// search box. Owner: the Source choice inside Order Filters was too far away — one click on the column
// itself should switch platforms. "All" plus one button per source this list really has (its monogram and
// count; "By hand" for orders added by hand). One click filters; clicking the chosen one, or All, clears.
// It is the SAME choice as the Source rows in Order Filters: both read orderSourceChoices and act on the
// page's one `source` state, so picking in one shows in the other. Hidden when the list has one source.
// WOO-STORES (2 Nov 2026): with two or more WooCommerce stores in the list, each store is its own button — the
// WooCommerce monogram and the store's name — and "Store unknown" holds the Woo orders that record no store.
import { OrderSourceMonogram } from "@/components/OrderSourceMonogram";
import {
  isOrderPlatform,
  orderSourceChipLabel,
  orderSourceChoices,
  type FilterableOrder,
  type OrderQuickFilterId,
  type OrderSourceChoice,
  type OrderSourceChoiceId
} from "@/lib/studioflow/orderFilters";

/** A button's full name: its tooltip and accessible name. */
function choiceName(choice: OrderSourceChoice, t: (text: string) => string): string {
  if (choice.wooStoreKey !== undefined) return choice.wooStoreKey ? `WooCommerce · ${choice.label}` : t(choice.label);
  if (choice.id === "all") return t("All sources");
  if (choice.id === "manual") return t("Added by hand");
  return isOrderPlatform(choice.id) ? orderSourceChipLabel(choice.id, t) : t(choice.label);
}

export function OrderPlatformBar({
  orders,
  filter,
  source,
  onSourceChange,
  t,
  className = ""
}: {
  /** The list before search, quick filter and source (presence is read from it; counts within the quick filter). */
  orders: FilterableOrder[];
  filter: OrderQuickFilterId;
  source: OrderSourceChoiceId;
  onSourceChange: (source: OrderSourceChoiceId) => void;
  t: (text: string) => string;
  className?: string;
}) {
  const choices = orderSourceChoices(orders, filter, source);
  if (choices.length === 0) return null;
  return (
    <div className={["order-platform-bar", className].filter(Boolean).join(" ")} role="group" aria-label={t("Source")} data-order-platform-bar="1">
      {choices.map(choice => {
        const pressed = source === choice.id;
        const name = choiceName(choice, t);
        const store = choice.wooStoreKey !== undefined;
        return (
          <button
            key={choice.id}
            type="button"
            className={store ? "order-platform-bar-item is-woocommerce is-woo-store" : `order-platform-bar-item is-${choice.id}`}
            aria-pressed={pressed}
            aria-label={`${name} (${choice.count})`}
            title={name}
            data-order-platform={choice.id}
            onClick={() => onSourceChange(pressed || choice.id === "all" ? "all" : choice.id)}
          >
            {store ? (
              <>
                <OrderSourceMonogram source="woocommerce" t={t} decorative />
                <span className="order-platform-bar-store">{choice.wooStoreKey ? choice.label : t("Store unknown")}</span>
              </>
            ) : isOrderPlatform(choice.id)
              ? <OrderSourceMonogram source={choice.id} t={t} decorative />
              : <span className="order-platform-bar-word">{choice.id === "all" ? t("All") : t("By hand")}</span>}
            <span className="order-platform-bar-count">{choice.count}</span>
          </button>
        );
      })}
    </div>
  );
}
