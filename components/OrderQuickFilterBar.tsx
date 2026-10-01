"use client";

import { useEffect, useState } from "react";
import {
  ORDER_QUICK_FILTERS,
  ORDER_SOURCE_FILTERS,
  orderMatchesQuickFilter,
  orderMatchesSource,
  orderSourcesPresent,
  quickFilterCount,
  sourceFilterCount,
  type FilterableOrder,
  type OrderQuickFilterId,
  type OrderSortMode,
  type OrderSourceId
} from "@/lib/studioflow/orderFilters";
import { studioT } from "@/lib/studioflow/language";

export function OrderQuickFilterBar({
  orders,
  filter,
  sortMode,
  onFilterChange,
  onSortModeChange,
  filters = ORDER_QUICK_FILTERS,
  language = "English",
  deletedCount = 0,
  source = "all",
  onSourceChange
}: {
  orders: FilterableOrder[];
  filter: OrderQuickFilterId;
  sortMode: OrderSortMode;
  onFilterChange: (filter: OrderQuickFilterId) => void;
  onSortModeChange: (sortMode: OrderSortMode) => void;
  filters?: typeof ORDER_QUICK_FILTERS;
  language?: string | null;
  deletedCount?: number;
  /** Where the orders came from (eBay, Shopify, …). Offered only when the list carries more than one source, or one is chosen. */
  source?: OrderSourceId;
  onSourceChange?: (source: OrderSourceId) => void;
}) {
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const selectedFilter = filters.find(item => item.id === filter) ?? filters[0] ?? ORDER_QUICK_FILTERS[0];
  // Each row counts what picking it would show, the other choice kept: the
  // quick filters within the chosen source, the sources within the chosen filter.
  const inSource = source === "all" ? orders : orders.filter(order => orderMatchesSource(order, source));
  const inFilter = filter === "trash" ? orders : orders.filter(order => orderMatchesQuickFilter(order, filter));
  const countFor = (id: OrderQuickFilterId) => id === "trash" ? deletedCount : quickFilterCount(inSource, id);
  const selectedCount = countFor(filter);
  const t = (text: string) => studioT(text, language);
  // The source rows: every source the list really has, plus "All sources". A
  // workspace that only ever adds orders by hand sees no source section at all.
  const sourcesPresent = orderSourcesPresent(orders);
  const sourceRows = onSourceChange && (sourcesPresent.length > 1 || source !== "all")
    ? ORDER_SOURCE_FILTERS.filter(item => item.id === "all" || sourcesPresent.includes(item.id) || item.id === source)
    : [];
  const selectedSource = ORDER_SOURCE_FILTERS.find(item => item.id === source) ?? ORDER_SOURCE_FILTERS[0];

  useEffect(() => {
    if (!filterMenuOpen) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setFilterMenuOpen(false);
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [filterMenuOpen]);

  function chooseSort(nextSortMode: OrderSortMode) {
    onSortModeChange(nextSortMode);
    setFilterMenuOpen(false);
  }

  function chooseFilter(nextFilter: OrderQuickFilterId) {
    onFilterChange(nextFilter);
    setFilterMenuOpen(false);
  }

  function chooseSource(nextSource: OrderSourceId) {
    onSourceChange?.(nextSource);
    setFilterMenuOpen(false);
  }

  return (
    <div className={filterMenuOpen ? "order-filter-card is-open" : "order-filter-card"} aria-label={t("Order Filters")}>
      <div className="order-filter-topline">
        <span className="order-filter-icon" aria-hidden="true">☰</span>
        <div>
          <small>{t("Order Filters")}</small>
          <strong>{t(selectedFilter.label)} {" • "} {sortMode === "smart" ? t("Smart") : t("Recent")}{source !== "all" ? <> {" • "} {t(selectedSource.label)}</> : null}</strong>
        </div>
        <span className="order-filter-count">{selectedCount}</span>
        <span className="order-filter-chevron" aria-hidden="true">⌄</span>
      </div>

      <button
        className="order-filter-mobile-hit"
        type="button"
        aria-label={t("Open order filters")}
        aria-expanded={filterMenuOpen}
        onClick={() => setFilterMenuOpen(open => !open)}
      />

      {filterMenuOpen ? (
        <>
          <button
            className="order-filter-mobile-scrim"
            type="button"
            aria-label={t("Close order filters")}
            onClick={() => setFilterMenuOpen(false)}
          />
          <div className="order-filter-mobile-menu" role="menu" aria-label={t("Order filters")}>
            <button className="order-filter-menu-row" type="button" role="menuitemradio" aria-checked={sortMode === "smart"} onClick={() => chooseSort("smart")}>
              <span className="order-filter-menu-icon">{sortMode === "smart" ? "✓" : "✦"}</span>
              <span>{t("Smart")}</span>
            </button>
            <button className="order-filter-menu-row" type="button" role="menuitemradio" aria-checked={sortMode === "recent"} onClick={() => chooseSort("recent")}>
              <span className="order-filter-menu-icon">{sortMode === "recent" ? "✓" : "↺"}</span>
              <span>{t("Recent")}</span>
            </button>

            <div className="order-filter-menu-divider" />

            {filters.map(item => (
              <button
                key={item.id}
                className="order-filter-menu-row"
                type="button"
                role="menuitemradio"
                aria-checked={filter === item.id}
                onClick={() => chooseFilter(item.id)}
              >
                <span className="order-filter-menu-icon">{filter === item.id ? "✓" : filterIcon(item.id)}</span>
                <span>{t(item.label)}</span>
                <span className="order-filter-menu-count">({countFor(item.id)})</span>
              </button>
            ))}

            {sourceRows.length > 0 ? (
              <>
                <div className="order-filter-menu-divider" />
                <p className="order-filter-menu-heading">{t("Source")}</p>
                {sourceRows.map(item => (
                  <button
                    key={`source-${item.id}`}
                    className="order-filter-menu-row"
                    type="button"
                    role="menuitemradio"
                    aria-checked={source === item.id}
                    data-order-source={item.id}
                    onClick={() => chooseSource(item.id)}
                  >
                    <span className="order-filter-menu-icon">{source === item.id ? "✓" : "◦"}</span>
                    <span>{t(item.label)}</span>
                    <span className="order-filter-menu-count">({sourceFilterCount(inFilter, item.id)})</span>
                  </button>
                ))}
              </>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

function filterIcon(id: OrderQuickFilterId) {
  switch (id) {
    case "all": return "✓";
    case "active": return "ϟ";
    case "waitingCustomer": return "☊";
    case "inProduction": return "♢";
    case "thisWeek": return "▦";
    case "lateOrders": return "△";
    case "unpaidBalance": return "£";
    case "readyToShip": return "□";
    case "completed": return "✓";
  }
}
