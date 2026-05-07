"use client";

import { useEffect, useState } from "react";
import {
  ORDER_QUICK_FILTERS,
  quickFilterCount,
  type FilterableOrder,
  type OrderQuickFilterId,
  type OrderSortMode
} from "@/lib/studioflow/orderFilters";

export function OrderQuickFilterBar({
  orders,
  filter,
  sortMode,
  onFilterChange,
  onSortModeChange,
  filters = ORDER_QUICK_FILTERS
}: {
  orders: FilterableOrder[];
  filter: OrderQuickFilterId;
  sortMode: OrderSortMode;
  onFilterChange: (filter: OrderQuickFilterId) => void;
  onSortModeChange: (sortMode: OrderSortMode) => void;
  filters?: typeof ORDER_QUICK_FILTERS;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const selectedFilter = filters.find(item => item.id === filter) ?? filters[0] ?? ORDER_QUICK_FILTERS[0];
  const selectedCount = quickFilterCount(orders, filter);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileMenuOpen(false);
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [mobileMenuOpen]);

  function chooseSort(nextSortMode: OrderSortMode) {
    onSortModeChange(nextSortMode);
  }

  function chooseFilter(nextFilter: OrderQuickFilterId) {
    onFilterChange(nextFilter);
    setMobileMenuOpen(false);
  }

  return (
    <div className="order-filter-card" aria-label="Order Filters">
      <div className="order-filter-topline">
        <span className="order-filter-icon" aria-hidden="true">☰</span>
        <div>
          <small>Order Filters</small>
          <strong>{selectedFilter.label} · {sortMode === "smart" ? "Smart" : "Recent"}</strong>
        </div>
        <span className="order-filter-count">{selectedCount}</span>
      </div>

      <div className="order-filter-sort" role="group" aria-label="Order sort">
        <button
          type="button"
          className={sortMode === "smart" ? "is-active" : ""}
          onClick={() => onSortModeChange("smart")}
        >
          Smart
        </button>
        <button
          type="button"
          className={sortMode === "recent" ? "is-active" : ""}
          onClick={() => onSortModeChange("recent")}
        >
          Recent
        </button>
      </div>

      <select
        className="order-filter-select"
        value={filter}
        onChange={event => onFilterChange(event.target.value as OrderQuickFilterId)}
        aria-label="Order quick filter"
      >
        {filters.map(item => (
          <option key={item.id} value={item.id}>
            {item.label} ({quickFilterCount(orders, item.id)})
          </option>
        ))}
      </select>

      <button
        className="order-filter-mobile-hit"
        type="button"
        aria-label="Open order filters"
        aria-expanded={mobileMenuOpen}
        onClick={() => setMobileMenuOpen(open => !open)}
      />

      {mobileMenuOpen ? (
        <>
          <button
            className="order-filter-mobile-scrim"
            type="button"
            aria-label="Close order filters"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="order-filter-mobile-menu" role="menu" aria-label="Order filters">
            <button className="order-filter-menu-row" type="button" role="menuitemradio" aria-checked={sortMode === "smart"} onClick={() => chooseSort("smart")}>
              <span className="order-filter-menu-icon">{sortMode === "smart" ? "✓" : "✦"}</span>
              <span>Smart</span>
            </button>
            <button className="order-filter-menu-row" type="button" role="menuitemradio" aria-checked={sortMode === "recent"} onClick={() => chooseSort("recent")}>
              <span className="order-filter-menu-icon">{sortMode === "recent" ? "✓" : "↺"}</span>
              <span>Recent</span>
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
                <span>{item.label}</span>
                <span className="order-filter-menu-count">({quickFilterCount(orders, item.id)})</span>
              </button>
            ))}
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
