"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePrivateMoney } from "@/components/PricePrivacy";
import { CardIconGlyph } from "@/components/CardTitle";
import {
  INVENTORY_CATEGORIES,
  INVENTORY_PHOTO_LIMIT,
  INVENTORY_STATUSES,
  getInventorySummary,
  inventoryItemToInput,
  inventoryLineValue,
  inventoryOnHand,
  isInventoryLowStock,
  listInventoryItems,
  listInventoryLocations,
  type InventoryListCursor,
  saveInventoryItem,
  setInventoryItemStatus,
  uploadInventoryPhoto,
  type InventoryItem,
  type InventoryItemInput,
  type InventorySummary,
  type InventoryStatus,
  type InventoryTrackingType
} from "@/lib/studioflow/inventory";
import { listSuppliers } from "@/lib/studioflow/inventory";
import { useAuth } from "@/lib/auth/AuthProvider";
import { studioT } from "@/lib/studioflow/language";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";
import { ItemDetailPanel } from "./ItemDetailPanel";
import { ItemLabelModal } from "./ItemLabelModal";
import { ItemPhotosModal } from "./ItemPhotosModal";
import { OpeningStockModal } from "./OpeningStockModal";
import { PurchasesPanel } from "./PurchasesPanel";
import { ReportsPanel } from "./ReportsPanel";
import { LocationsPanel } from "./LocationsPanel";
import { RecipesPanel } from "./RecipesPanel";
import { StocktakePanel } from "./StocktakePanel";
import { SuppliersPanel } from "./SuppliersPanel";

type InventoryTab = "items" | "purchases" | "suppliers" | "stocktake" | "locations" | "recipes" | "reports";

// Small glyphs so a long list scans by shape, not by reading every word.
const CATEGORY_ICON: Record<string, string> = {
  "Watches": "\u231A",
  "Dials": "\u25CE",
  "Movements": "\u2699",
  "Parts": "\u2692",
  "Consumables": "\u2697",
  "Straps & Bracelets": "\u27B0",
  "Packaging": "\u25A7",
  "Tools": "\u2704",
  "Stones & Gems": "\u25C7",
  "Other": "\u25AA"
};

const STATUS_LABEL: Record<InventoryStatus, string> = {
  available: "Available",
  reserved: "Reserved",
  partiallyReserved: "Partially Reserved",
  incoming: "Incoming",
  used: "Used",
  sold: "Sold",
  removed: "Removed",
  archived: "Archived"
};

function emptyDraft(trackingType: InventoryTrackingType): InventoryItemInput {
  return {
    name: "",
    category: trackingType === "quantity" ? "Consumables" : "Watches",
    trackingType,
    ownership: "business",
    brand: "",
    model: "",
    reference: "",
    serialNumber: "",
    year: "",
    condition: "",
    description: "",
    sku: "",
    location: "",
    supplierName: "",
    purchaseDate: "",
    notes: "",
    onHand: trackingType === "quantity" ? 0 : 1,
    unit: "",
    lowStockAt: 0,
    purchasePrice: 0,
    additionalCosts: [],
    currentValueEst: 0,
    tags: []
  };
}

export function InventoryContent({
  workspace,
  currencySymbol,
  canEdit
}: {
  workspace: WorkspaceContext;
  currencySymbol: string;
  canEdit: boolean;
}) {
  const money = usePrivateMoney();
  const { language } = useAuth();
  const t = (text: string) => studioT(text, language);

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [listCursor, setListCursor] = useState<InventoryListCursor | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  // A scanned label lands here: /inventory?item=INV-00012 puts the number in
  // the search box, so pointing a phone camera at a drawer opens the item
  // instead of offering a web search for a bare number.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const scanned = new URLSearchParams(window.location.search).get("item");
    if (!scanned) return;
    setSearch(scanned.trim());
    const url = new URL(window.location.href);
    url.searchParams.delete("item");
    window.history.replaceState({}, "", url.pathname + url.search);
  }, []);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [openingOpen, setOpeningOpen] = useState(false);
  const [photosFor, setPhotosFor] = useState<InventoryItem | null>(null);
  const [labelFor, setLabelFor] = useState<InventoryItem | null>(null);
  const [tab, setTab] = useState<InventoryTab>("items");
  // The report's call (§28): ONE primary navigation. The sidebar is it; the
  // old tab strip is gone. Quick views are saved filters over the same list.
  const [quickView, setQuickView] = useState<"all" | "low" | "incoming" | "reserved">("all");
  const [locationFilter, setLocationFilter] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  // Checkboxes select for BULK work; clicking the row opens the panel. The two
  // gestures never share a meaning (report §13/§28).
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkLocationOpen, setBulkLocationOpen] = useState(false);
  const [bulkLocationDraft, setBulkLocationDraft] = useState("");
  const [supplierNames, setSupplierNames] = useState<string[]>([]);
  // Defined location paths ("Safe A / Drawer 3") — offered in the item form so
  // a fresh, still-empty location is pickable before anything stands in it.
  const [locationPaths, setLocationPaths] = useState<string[]>([]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [list, totals] = await Promise.all([
        listInventoryItems(workspace),
        getInventorySummary(workspace)
      ]);
      setItems(list?.items ?? []);
      setListCursor(list?.hasMore ? list?.cursor ?? null : null);
      setSummary(totals?.summary ?? null);
      setNotice("");
    } catch (failure) {
      setNotice(failure instanceof Error ? t(failure.message) : t("Inventory could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [workspace]);

  // A workshop past 500 items used to fall silently off the end of the list;
  // the server now hands back a cursor and this fetches the next page.
  const loadMore = useCallback(async () => {
    if (!listCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const list = await listInventoryItems(workspace, listCursor);
      const fresh = list?.items ?? [];
      setItems(current => {
        const seen = new Set(current.map(item => item.id));
        return [...current, ...fresh.filter(item => !seen.has(item.id))];
      });
      setListCursor(list?.hasMore ? list?.cursor ?? null : null);
    } catch (failure) {
      setNotice(failure instanceof Error ? t(failure.message) : t("Inventory could not be loaded."));
    } finally {
      setLoadingMore(false);
    }
  }, [workspace, listCursor, loadingMore]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Fed to the purchase form so a supplier can be picked rather than retyped —
  // a second spelling of the same name would split its history in two.
  const reloadSuppliers = useCallback(async () => {
    try {
      const result = await listSuppliers(workspace);
      setSupplierNames((result?.suppliers ?? []).map(row => row.name).filter(Boolean));
    } catch {
      setSupplierNames([]);
    }
  }, [workspace]);

  useEffect(() => {
    void reloadSuppliers();
  }, [reloadSuppliers]);

  const reloadLocationPaths = useCallback(async () => {
    try {
      const result = await listInventoryLocations(workspace);
      setLocationPaths((result?.locations ?? []).map(row => row.path).filter(Boolean));
    } catch {
      setLocationPaths([]);
    }
  }, [workspace]);

  useEffect(() => {
    void reloadLocationPaths();
  }, [reloadLocationPaths]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items.filter(item => {
      if (quickView === "low" && !(isInventoryLowStock(item) && item.status === "available")) return false;
      if (quickView === "incoming" && item.status !== "incoming") return false;
      if (quickView === "reserved" && item.status !== "reserved" && item.status !== "partiallyReserved") return false;
      if (categoryFilter && item.category !== categoryFilter) return false;
      if (typeFilter && item.trackingType !== typeFilter) return false;
      if (statusFilter && item.status !== statusFilter) return false;
      if (locationFilter && (item.location || "") !== locationFilter) return false;
      if (supplierFilter && (item.supplierName || "") !== supplierFilter) return false;
      if (!needle) return true;
      return [item.name, item.brand, item.model, item.reference, item.serialNumber, item.sku, item.number, (item.tags ?? []).join(" ")]
        .filter(Boolean)
        .some(field => String(field).toLowerCase().includes(needle));
    });
  }, [items, search, quickView, categoryFilter, typeFilter, statusFilter, locationFilter, supplierFilter]);

  // Every tag in use, offered back as suggestions so spellings converge.
  const allTags = useMemo(
    () => Array.from(new Set(items.flatMap(item => item.tags ?? []).filter(Boolean))).sort(),
    [items]
  );

  // Distinct values off the loaded list — no locations collection exists yet,
  // and free-text locations are still worth filtering by.
  const locationOptions = useMemo(
    () => Array.from(new Set(items.map(item => item.location).filter(Boolean))).sort(),
    [items]
  );
  const supplierOptions = useMemo(
    () => Array.from(new Set(items.map(item => item.supplierName).filter(Boolean))).sort(),
    [items]
  );

  useEffect(() => {
    setPage(1);
  }, [search, quickView, categoryFilter, typeFilter, statusFilter, locationFilter, supplierFilter, pageSize]);

  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const paged = useMemo(
    () => visible.slice((page - 1) * pageSize, page * pageSize),
    [visible, page, pageSize]
  );

  function openQuickView(next: "all" | "low" | "incoming" | "reserved") {
    setTab("items");
    setQuickView(next);
    setStatusFilter("");
    setSelectedId("");
  }

  function openCategory(category: string) {
    setTab("items");
    setQuickView("all");
    setCategoryFilter(category);
    setSelectedId("");
  }

  const selectedItem = useMemo(
    () => items.find(entry => entry.id === selectedId) ?? null,
    [items, selectedId]
  );

  function toggleChecked(id: string) {
    setCheckedIds(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const checkedItems = useMemo(
    () => items.filter(item => checkedIds.has(item.id)),
    [items, checkedIds]
  );

  async function runBulk(action: (item: InventoryItem) => Promise<unknown>, failText: string) {
    setBulkBusy(true);
    setNotice("");
    let failures = 0;
    for (const item of checkedItems) {
      try {
        await action(item);
      } catch {
        failures += 1;
      }
    }
    setBulkBusy(false);
    setCheckedIds(new Set());
    await reload();
    if (failures > 0) setNotice(`${failures} ${t(failText)}`);
  }

  function exportChecked() {
    // Header names match what the importer understands, and the unit cost
    // travels as "Purchase price" — exporting only a line total meant prices
    // never came back on import.
    const header = [
      "Number", "Name", "Category", "Type", "Status", "SKU", "Serial number",
      "On hand", "Unit", "Purchase price", "Line value", "Location", "Supplier"
    ];
    const rows = checkedItems.map(item => [
      item.number, item.name, item.category, item.trackingType, item.status,
      item.sku || "", item.serialNumber || "",
      String(inventoryOnHand(item)), item.quantity?.unit || "",
      (Number(item.valuationCost) || 0).toFixed(2),
      inventoryLineValue(item).toFixed(2), item.location || "", item.supplierName || ""
    ]);
    const csv = [header, ...rows]
      .map(row => row.map(cell => /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "inventory-selection.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function changeStatus(item: InventoryItem, status: InventoryStatus) {
    try {
      await setInventoryItemStatus(workspace, item.id, status);
      await reload();
    } catch (failure) {
      setNotice(failure instanceof Error ? t(failure.message) : t("The item status could not be changed."));
    }
  }

  // Each tile says exactly what its number is made of (report §12): every
  // value is internal PURCHASE COST (price + allocated extras), never sale
  // price, and customer-owned property is excluded throughout.
  const cards: { label: string; value: string; sub?: string; tone?: string; hint?: string }[] = summary
    ? [
        {
          label: t("Total Inventory Value"),
          value: money(currencySymbol, summary.totalValue),
          tone: "accent",
          sub: summary.monthlyChange?.available
            ? `${summary.monthlyChange.pct > 0 ? "+" : ""}${summary.monthlyChange.pct}% ${t("this month")}`
            : undefined,
          hint: t("Purchase cost of business-owned stock on the shelf (available + reserved). Customer property, incoming, sold and used items are excluded.")
        },
        {
          label: t("Unique Items"), value: String(summary.uniqueCount), sub: money(currencySymbol, summary.uniqueValue),
          hint: t("Serial-tracked pieces on the shelf, and their purchase cost.")
        },
        {
          label: t("Quantity Items"), value: String(summary.quantityCount), sub: money(currencySymbol, summary.quantityValue),
          hint: t("Counted stock lines (SKUs, not units), and their purchase cost on hand.")
        },
        {
          label: t("Reserved for Orders"), value: money(currencySymbol, summary.reservedValue), sub: `${summary.reservedCount} items`,
          hint: t("Purchase cost of items currently held for orders, and how many lines are held.")
        },
        {
          label: t("Incoming"), value: `${summary.incomingCount} items`, sub: money(currencySymbol, summary.incomingValue),
          hint: t("Purchased but not yet received. Counted apart — not in Total Inventory Value until it arrives.")
        },
        {
          label: t("Low Stock"), value: `${summary.lowStockCount} items`, tone: summary.lowStockCount > 0 ? "warn" : undefined,
          hint: t("Stock lines at or below their reorder point — lines, not missing units.")
        }
      ]
    : [];

  return (
    <div className="inventory-page">
      <div className="inventory-head">
        <h1>{t("Inventory")}</h1>
        {canEdit && tab === "items" ? (
          <div className="inventory-head-actions">
            <button type="button" className="inventory-secondary" onClick={() => setOpeningOpen(true)}>
              {t("Import opening stock")}
            </button>
            <button type="button" className="inventory-primary" onClick={() => setModalOpen(true)}>
              + {t("Add Item")}
            </button>
          </div>
        ) : null}
      </div>

      <div className="inventory-shell">
      <nav className="inventory-nav" aria-label={t("Inventory")}>
        <p className="inventory-nav-group">{t("Overview")}</p>
        <button type="button" data-active={tab === "items" && quickView === "all" && !categoryFilter} onClick={() => { openQuickView("all"); setCategoryFilter(""); }}>
          {t("All Items")}
        </button>
        <button type="button" data-active={tab === "items" && quickView === "low"} onClick={() => openQuickView("low")}>
          {t("Low Stock")}{summary && summary.lowStockCount > 0 ? <span className="inventory-nav-badge">{summary.lowStockCount}</span> : null}
        </button>
        <button type="button" data-active={tab === "items" && quickView === "incoming"} onClick={() => openQuickView("incoming")}>
          {t("Incoming")}{summary && summary.incomingCount > 0 ? <span className="inventory-nav-badge">{summary.incomingCount}</span> : null}
        </button>
        <button type="button" data-active={tab === "items" && quickView === "reserved"} onClick={() => openQuickView("reserved")}>
          {t("Reserved")}{summary && summary.reservedCount > 0 ? <span className="inventory-nav-badge">{summary.reservedCount}</span> : null}
        </button>
        <p className="inventory-nav-group">{t("Items")}</p>
        {INVENTORY_CATEGORIES.map(category => (
          <button
            key={category}
            type="button"
            data-active={tab === "items" && categoryFilter === category}
            onClick={() => openCategory(category)}
          >
            <span aria-hidden="true">{CATEGORY_ICON[category] ?? CATEGORY_ICON.Other}</span> {t(category)}
          </button>
        ))}
        <p className="inventory-nav-group">{t("Purchasing")}</p>
        <button type="button" data-active={tab === "purchases"} onClick={() => { setTab("purchases"); setSelectedId(""); }}>{t("Purchases")}</button>
        <button type="button" data-active={tab === "suppliers"} onClick={() => { setTab("suppliers"); setSelectedId(""); }}>{t("Suppliers")}</button>
        <p className="inventory-nav-group">{t("Manage")}</p>
        <button type="button" data-active={tab === "stocktake"} onClick={() => { setTab("stocktake"); setSelectedId(""); }}>{t("Stocktake")}</button>
        <button type="button" data-active={tab === "locations"} onClick={() => { setTab("locations"); setSelectedId(""); }}>{t("Locations")}</button>
        <button type="button" data-active={tab === "recipes"} onClick={() => { setTab("recipes"); setSelectedId(""); }}>{t("Recipes")}</button>
        <button type="button" data-active={tab === "reports"} onClick={() => { setTab("reports"); setSelectedId(""); }}>{t("Reports")}</button>
      </nav>

      <div className="inventory-main">
      {tab === "purchases" ? (
        <PurchasesPanel
          workspace={workspace}
          currencySymbol={currencySymbol}
          canEdit={canEdit}
          supplierNames={supplierNames}
          onStockChanged={() => { void reload(); void reloadSuppliers(); }}
        />
      ) : tab === "stocktake" ? (
        <StocktakePanel
          workspace={workspace}
          currencySymbol={currencySymbol}
          canEdit={canEdit}
          onStockChanged={() => void reload()}
        />
      ) : tab === "recipes" ? (
        <RecipesPanel workspace={workspace} items={items} canEdit={canEdit} />
      ) : tab === "locations" ? (
        <LocationsPanel
          workspace={workspace}
          items={items}
          canEdit={canEdit}
          onLocationsChanged={() => { void reload(); void reloadLocationPaths(); }}
        />
      ) : tab === "reports" ? (
        <ReportsPanel workspace={workspace} currencySymbol={currencySymbol} />
      ) : tab === "suppliers" ? (
        <SuppliersPanel
          workspace={workspace}
          currencySymbol={currencySymbol}
          canEdit={canEdit}
          onChanged={() => void reloadSuppliers()}
        />
      ) : (
        <>

      <div className="inventory-stats">
        {cards.map(card => (
          <div className="inventory-stat" key={card.label} data-tone={card.tone} title={card.hint}>
            <span className="inventory-stat-label">{card.label}</span>
            <strong>{card.value}</strong>
            {card.sub ? <span className="inventory-stat-sub">{card.sub}</span> : null}
          </div>
        ))}
      </div>

      {summary && summary.customerOwnedCount > 0 ? (
        <p className="inventory-note">
          {summary.customerOwnedCount} customer-owned item
          {summary.customerOwnedCount === 1 ? " is" : "s are"} held here and deliberately valued at zero —
          they are the customer&apos;s property, not stock.
        </p>
      ) : null}

      <div className="inventory-filters">
        <input
          className="input"
          placeholder={t("Search items, brand, ref, serial, SKU…")}
          value={search}
          onChange={event => setSearch(event.target.value)}
        />
        <select className="input" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
          <option value="">{t("All Categories")}</option>
          {INVENTORY_CATEGORIES.map(c => <option key={c} value={c}>{t(c)}</option>)}
        </select>
        <select className="input" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">{t("All Types")}</option>
          <option value="unique">{t("Unique")}</option>
          <option value="quantity">{t("Quantity")}</option>
        </select>
        <select className="input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">{t("All Status")}</option>
          {INVENTORY_STATUSES.map(s => <option key={s} value={s}>{t(STATUS_LABEL[s])}</option>)}
        </select>
        <select className="input" value={locationFilter} onChange={e => setLocationFilter(e.target.value)}>
          <option value="">{t("All Locations")}</option>
          {locationOptions.map(loc => <option key={loc} value={loc}>{loc}</option>)}
        </select>
        <select className="input" value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)}>
          <option value="">{t("All Suppliers")}</option>
          {supplierOptions.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </div>

      {checkedIds.size > 0 ? (
        <div className="inventory-bulkbar">
          <strong>{checkedIds.size} {t("selected")}</strong>
          <button type="button" disabled={bulkBusy} onClick={() => { setBulkLocationDraft(""); setBulkLocationOpen(true); }}>
            {t("Move location")}
          </button>
          <button
            type="button"
            disabled={bulkBusy}
            onClick={() => void runBulk(
              item => setInventoryItemStatus(workspace, item.id, "archived"),
              "items could not be archived."
            )}
          >
            {t("Archive")}
          </button>
          <button type="button" disabled={bulkBusy} onClick={exportChecked}>{t("Export CSV")}</button>
          <button type="button" disabled={bulkBusy} onClick={() => setCheckedIds(new Set())}>{t("Clear selection")}</button>
          {bulkBusy ? <span className="inventory-sub">{t("Working…")}</span> : null}
        </div>
      ) : null}

      {bulkLocationOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal inventory-modal is-narrow" role="dialog" aria-modal="true" aria-label={t("Move location")}>
            <div className="inventory-modal-head">
              <h2>{t("Move location")}</h2>
              <button type="button" className="inventory-modal-close" onClick={() => setBulkLocationOpen(false)} aria-label={t("Close")}>×</button>
            </div>
            <p className="inventory-sub">{checkedIds.size} {t("selected")}</p>
            <label className="inventory-field is-wide">
              <span>{t("Location")}</span>
              <input className="input" value={bulkLocationDraft} onChange={e => setBulkLocationDraft(e.target.value)} placeholder={t("Safe A, Drawer 3…")} />
            </label>
            <div className="inventory-modal-actions">
              <button type="button" onClick={() => setBulkLocationOpen(false)}>{t("Cancel")}</button>
              <button
                type="button"
                className="inventory-primary"
                disabled={bulkBusy || !bulkLocationDraft.trim()}
                onClick={() => {
                  setBulkLocationOpen(false);
                  // Full payload per item — the server rebuilds the document
                  // from the input, so a location-only body would blank fields.
                  void runBulk(
                    item => saveInventoryItem(workspace, { ...inventoryItemToInput(item), location: bulkLocationDraft.trim() }, item.id),
                    "items could not be moved."
                  );
                }}
              >
                {t("Move")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {notice ? <p className="inventory-notice">{notice}</p> : null}

      <div className={selectedItem ? "inventory-body has-panel" : "inventory-body"}>
      <div className="inventory-table-wrap">
        <table className="inventory-table">
          <thead>
            <tr>
              <th className="inventory-check-col" aria-label={t("Select")} />
              <th>{t("Item")}</th><th>{t("Type")}</th><th>{t("Category")}</th><th>{t("Status")}</th>
              <th className="r">{t("On Hand")}</th><th className="r">{t("Value")}</th><th>{t("Location")}</th><th>{t("Updated")}</th><th /><th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={11} className="inventory-empty">{t("Loading…")}</td></tr>
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={11} className="inventory-empty">
                  {items.length === 0 ? (
                    <>
                      {t("Nothing in inventory yet.")}{" "}
                      {canEdit ? (
                        <button type="button" className="inventory-link" onClick={() => setOpeningOpen(true)}>
                          {t("Import your opening stock")}
                        </button>
                      ) : null}
                    </>
                  ) : t("No items match these filters.")}
                </td>
              </tr>
            ) : paged.map(item => (
              <tr
                key={item.id}
                className={selectedId === item.id ? "is-selected" : undefined}
                onClick={() => setSelectedId(current => current === item.id ? "" : item.id)}
              >
                <td className="inventory-check-col" onClick={event => event.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={checkedIds.has(item.id)}
                    onChange={() => toggleChecked(item.id)}
                    aria-label={t("Select")}
                  />
                </td>
                <td>
                  <strong>{item.name}</strong>
                  <span className="inventory-sub">
                    {[item.number, item.reference && `Ref. ${item.reference}`, item.serialNumber]
                      .filter(Boolean).join(" · ")}
                  </span>
                </td>
                <td><span className="inventory-chip">{item.trackingType === "unique" ? t("Unique") : t("Quantity")}</span></td>
                <td>
                  <span className="inventory-category">
                    <span aria-hidden="true">{CATEGORY_ICON[item.category] ?? CATEGORY_ICON.Other}</span> {t(item.category)}
                  </span>
                </td>
                <td>
                  <span className={`inventory-status is-${item.status}`}>
                    {isInventoryLowStock(item) && item.status === "available"
                      ? "Low Stock"
                      : t(STATUS_LABEL[item.status] ?? item.status)}
                  </span>
                </td>
                <td className="r">
                  {inventoryOnHand(item)}{item.trackingType === "quantity" && item.quantity?.unit ? ` ${item.quantity.unit}` : ""}
                </td>
                <td className="r">
                  {item.ownership === "customer"
                    ? <span className="inventory-sub">Customer&apos;s</span>
                    : money(currencySymbol, inventoryLineValue(item))}
                </td>
                <td>{item.location || "—"}</td>
                <td className="inventory-sub">
                  {item.updatedAtMs ? new Date(item.updatedAtMs).toLocaleDateString() : "—"}
                </td>
                <td className="r" onClick={event => event.stopPropagation()}>
                  <button
                    type="button"
                    className="inventory-link"
                    title={t("Photos")}
                    onClick={() => setPhotosFor(item)}
                  >
                    {item.photos && item.photos.length > 0 ? `📷 ${item.photos.length}` : "📷"}
                  </button>
                  {" "}
                  <button
                    type="button"
                    className="inventory-link"
                    title={t("Label")}
                    onClick={() => setLabelFor(item)}
                  >
                    🏷
                  </button>
                </td>
                <td className="r" onClick={event => event.stopPropagation()}>
                  {canEdit ? (
                    <select
                      className="inventory-status-select"
                      value=""
                      onChange={e => { if (e.target.value) void changeStatus(item, e.target.value as InventoryStatus); }}
                    >
                      <option value="">{t("Move to…")}</option>
                      {/* "reserved" is deliberately not offered here: a bare
                          status flip links no order and is invisible to
                          getOrderInventory. Reserving goes through the panel's
                          Reserve for Order, which writes the reservation. */}
                      {INVENTORY_STATUSES.filter(s => s !== item.status && s !== "reserved" && s !== "partiallyReserved").map(s => (
                        <option key={s} value={s}>{t(STATUS_LABEL[s])}</option>
                      ))}
                    </select>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length > 0 ? (
          <div className="inventory-pager">
            <span className="inventory-sub">
              {t("Showing")} {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, visible.length)} {t("of")} {visible.length} {t("items")}
            </span>
            <div className="inventory-pager-controls">
              <button type="button" disabled={page <= 1} onClick={() => setPage(current => current - 1)}>‹</button>
              <span>{page} / {pageCount}</span>
              <button type="button" disabled={page >= pageCount} onClick={() => setPage(current => current + 1)}>›</button>
              <select className="input" value={pageSize} onChange={e => setPageSize(Number(e.target.value) || 10)}>
                {[10, 25, 50].map(size => <option key={size} value={size}>{size} / {t("page")}</option>)}
              </select>
            </div>
          </div>
        ) : null}
        {listCursor ? (
          <p className="inventory-note">
            {t("There is more stock than one page carries.")}{" "}
            <button type="button" className="inventory-link" disabled={loadingMore} onClick={() => void loadMore()}>
              {loadingMore ? t("Loading…") : t("Load the next 500 items")}
            </button>
          </p>
        ) : null}
      </div>

      {selectedItem ? (
        <ItemDetailPanel
          workspace={workspace}
          item={selectedItem}
          currencySymbol={currencySymbol}
          canEdit={canEdit}
          onClose={() => setSelectedId("")}
          onChanged={() => reload()}
          onEdit={target => setEditing(target)}
          onPrintLabel={target => setLabelFor(target)}
          onManagePhotos={target => setPhotosFor(target)}
        />
      ) : null}
      </div>

        </>
      )}

      {labelFor ? (
        <ItemLabelModal
          item={labelFor}
          workspaceName={workspace.name || ""}
          onClose={() => setLabelFor(null)}
        />
      ) : null}

      {photosFor ? (
        <ItemPhotosModal
          workspace={workspace}
          item={photosFor}
          canEdit={canEdit}
          onClose={() => setPhotosFor(null)}
          onChanged={() => void reload()}
        />
      ) : null}

      {openingOpen ? (
        <OpeningStockModal
          workspace={workspace}
          currencySymbol={currencySymbol}
          onClose={() => setOpeningOpen(false)}
          onImported={async count => {
            setOpeningOpen(false);
            await reload();
            setNotice(`${count} ${t("items were imported as opening stock.")}`);
          }}
        />
      ) : null}

      </div>
      </div>

      {modalOpen ? (
        <NewItemModal
          workspace={workspace}
          currencySymbol={currencySymbol}
          tagSuggestions={allTags}
          locationSuggestions={Array.from(new Set([...locationPaths, ...locationOptions]))}
          onClose={() => setModalOpen(false)}
          onSaved={async () => { setModalOpen(false); await reload(); }}
        />
      ) : null}

      {editing ? (
        <NewItemModal
          workspace={workspace}
          currencySymbol={currencySymbol}
          tagSuggestions={allTags}
          locationSuggestions={Array.from(new Set([...locationPaths, ...locationOptions]))}
          initialItem={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await reload(); }}
        />
      ) : null}
    </div>
  );
}

// The entry modal. The first decision is the one that changes everything below
// it, so it is asked first and the form redraws around the answer: a unique
// object carries identity (serial, condition, photos) and a quantity item
// carries a count and a reorder point.
function NewItemModal({
  workspace,
  currencySymbol,
  tagSuggestions,
  locationSuggestions,
  initialItem,
  onClose,
  onSaved
}: {
  workspace: WorkspaceContext;
  currencySymbol: string;
  /** Every tag already in use, so spellings converge instead of multiplying. */
  tagSuggestions: string[];
  /** Defined location paths plus every location already in use. */
  locationSuggestions: string[];
  /** When set, the form edits this item (or, with a blank id, creates a copy). */
  initialItem?: InventoryItem | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const money = usePrivateMoney();
  const { language } = useAuth();
  const t = (text: string) => studioT(text, language);
  const editingId = initialItem?.id || "";
  const [draft, setDraft] = useState<InventoryItemInput>(() =>
    initialItem ? inventoryItemToInput(initialItem) : emptyDraft("unique"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tagInput, setTagInput] = useState("");
  // Photos picked before the item exists. Storage paths are keyed by item id,
  // so the files wait here and go up the moment the save returns that id —
  // the form no longer sends people back through the list to add a photo.
  const [stagedPhotos, setStagedPhotos] = useState<File[]>([]);
  const [stagedPreviews, setStagedPreviews] = useState<string[]>([]);

  useEffect(() => {
    const urls = stagedPhotos.map(file => URL.createObjectURL(file));
    setStagedPreviews(urls);
    return () => { urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [stagedPhotos]);

  const photoRoom = INVENTORY_PHOTO_LIMIT - (initialItem?.photos?.length ?? 0) - stagedPhotos.length;

  const isUnique = draft.trackingType === "unique";
  const set = <K extends keyof InventoryItemInput>(key: K, value: InventoryItemInput[K]) =>
    setDraft(current => ({ ...current, [key]: value }));

  const extras = draft.additionalCosts ?? [];
  const extrasTotal = extras.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const internalTotal = (Number(draft.purchasePrice) || 0) + extrasTotal;

  function chooseType(trackingType: InventoryTrackingType) {
    // Keep what still makes sense so switching type mid-entry is not punished.
    setDraft(current => ({
      ...emptyDraft(trackingType),
      name: current.name,
      location: current.location,
      supplierName: current.supplierName,
      purchaseDate: current.purchaseDate,
      purchasePrice: current.purchasePrice,
      additionalCosts: current.additionalCosts,
      ownership: current.ownership
    }));
  }

  async function submit() {
    if (!draft.name.trim()) {
      setError("Give the item a name.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const saved = await saveInventoryItem(workspace, draft, editingId || undefined);
      const itemId = editingId || saved?.itemId || "";
      if (stagedPhotos.length > 0 && itemId) {
        // The item is real now, so the photos have somewhere to live. A photo
        // that fails to upload must not silently vanish: the item stays saved
        // and the message says what is missing.
        const uploaded: string[] = [];
        try {
          for (const file of stagedPhotos) {
            uploaded.push(await uploadInventoryPhoto(workspace, itemId, file));
          }
          await saveInventoryItem(
            workspace,
            { ...draft, photos: [...(draft.photos ?? []), ...uploaded] },
            itemId
          );
        } catch {
          await onSaved();
          setError("The item was saved, but the photos could not be uploaded. Add them from the item's photo button.");
          setBusy(false);
          return;
        }
      }
      await onSaved();
    } catch (failure) {
      setError(failure instanceof Error ? t(failure.message) : "The item could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal inventory-modal" role="dialog" aria-modal="true" aria-label="Add inventory item">
        <div className="inventory-modal-head">
          <h2>{editingId ? t("Edit Item") : t("Add Inventory Item")}</h2>
          <button type="button" className="inventory-modal-close" onClick={onClose} aria-label={t("Close")}>×</button>
        </div>

        <div className="inventory-type-choice">
          {([
            {
              type: "unique" as const,
              title: "Unique Item",
              body: "One physical object with its own identity — a watch, a specific dial, a movement."
            },
            {
              type: "quantity" as const,
              title: "Quantity Item",
              body: "Something you count or measure — paint, screws, packaging, generic blanks."
            }
          ]).map(option => (
            <button
              key={option.type}
              type="button"
              className={`inventory-type-option ${draft.trackingType === option.type ? "is-on" : ""}`}
              onClick={() => chooseType(option.type)}
            >
              <strong>{option.title}</strong>
              <span>{option.body}</span>
            </button>
          ))}
        </div>

        <div className="inventory-form">
          <label className="inventory-field is-wide">
            <span>{t("Name")}</span>
            <input className="input" value={draft.name} onChange={e => set("name", e.target.value)}
              placeholder={isUnique ? "Rolex Air-King 5500" : "Dial Paint — Black"} />
          </label>

          <label className="inventory-field">
            <span>{t("Category")}</span>
            <select className="input" value={draft.category} onChange={e => set("category", e.target.value)}>
              {INVENTORY_CATEGORIES.map(c => <option key={c} value={c}>{t(c)}</option>)}
            </select>
          </label>

          <label className="inventory-field">
            <span>{t("Location")}</span>
            <input className="input" value={draft.location ?? ""} onChange={e => set("location", e.target.value)}
              placeholder={t("Safe A, Drawer 3…")} list="inventory-location-suggestions" />
            <datalist id="inventory-location-suggestions">
              {locationSuggestions.map(path => <option key={path} value={path} />)}
            </datalist>
          </label>

          {isUnique ? (
            <>
              <label className="inventory-field"><span>{t("Brand")}</span>
                <input className="input" value={draft.brand ?? ""} onChange={e => set("brand", e.target.value)} /></label>
              <label className="inventory-field"><span>{t("Model")}</span>
                <input className="input" value={draft.model ?? ""} onChange={e => set("model", e.target.value)} /></label>
              <label className="inventory-field"><span>{t("Reference")}</span>
                <input className="input" value={draft.reference ?? ""} onChange={e => set("reference", e.target.value)} /></label>
              <label className="inventory-field"><span>{t("Serial Number")}</span>
                <input className="input" value={draft.serialNumber ?? ""} onChange={e => set("serialNumber", e.target.value)} /></label>
              <label className="inventory-field"><span>{t("Year")}</span>
                <input className="input" value={draft.year ?? ""} onChange={e => set("year", e.target.value)} /></label>
              <label className="inventory-field"><span>{t("Condition")}</span>
                <input className="input" value={draft.condition ?? ""} onChange={e => set("condition", e.target.value)}
                  placeholder={t("Good, Fair, Needs service…")} /></label>
            </>
          ) : (
            <>
              <label className="inventory-field"><span>{t("SKU")}</span>
                <input className="input" value={draft.sku ?? ""} onChange={e => set("sku", e.target.value)}
                  placeholder="PAINT-BLK" /></label>
              <label className="inventory-field"><span>{t("On Hand")}</span>
                <input className="input" type="number" min={0} step="0.01" value={draft.onHand ? String(draft.onHand) : ""} placeholder="0"
                  onChange={e => set("onHand", Number(e.target.value) || 0)} /></label>
              <label className="inventory-field"><span>{t("Unit")}</span>
                <input className="input" value={draft.unit ?? ""} onChange={e => set("unit", e.target.value)}
                  placeholder={t("ml, g, pcs")} /></label>
              <label className="inventory-field"><span>{t("Reorder at")}</span>
                <input className="input" type="number" min={0} step="0.01" value={draft.lowStockAt ? String(draft.lowStockAt) : ""} placeholder="0"
                  onChange={e => set("lowStockAt", Number(e.target.value) || 0)} /></label>
            </>
          )}

          <label className="inventory-field"><span>{t("Supplier")}</span>
            <input className="input" value={draft.supplierName ?? ""} onChange={e => set("supplierName", e.target.value)} /></label>
          <label className="inventory-field"><span>{t("Purchase date")}</span>
            <input className="input" type="date" value={draft.purchaseDate ?? ""} onChange={e => set("purchaseDate", e.target.value)} /></label>
          <div className="inventory-field is-wide">
            <span>{t("Tags")}</span>
            <div className="inventory-tag-editor">
              {(draft.tags ?? []).map(tag => (
                <span className="inventory-chip inventory-tag-chip" key={tag}>
                  {tag}
                  <button
                    type="button"
                    aria-label={`${t("Remove")} ${tag}`}
                    onClick={() => set("tags", (draft.tags ?? []).filter(existing => existing !== tag))}
                  >×</button>
                </span>
              ))}
              <input
                className="input"
                list="inventory-tag-suggestions"
                value={tagInput}
                placeholder={t("Add a tag and press Enter")}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  const value = tagInput.trim();
                  if (value && !(draft.tags ?? []).includes(value)) {
                    set("tags", [...(draft.tags ?? []), value].slice(0, 20));
                  }
                  setTagInput("");
                }}
              />
              <datalist id="inventory-tag-suggestions">
                {tagSuggestions.map(tag => <option key={tag} value={tag} />)}
              </datalist>
            </div>
          </div>
        </div>

        <div className="inventory-cost-block">
          <div className="inventory-cost-head">
            <strong>{t("Cost")}</strong>
            <span>
              {t("Purchase price and additional costs are kept apart on purpose — the VAT margin scheme uses the price of the item alone.")}
            </span>
          </div>
          <div className="inventory-form">
            <label className="inventory-field">
              <span>{isUnique ? t("Purchase price") : t("Purchase price (per unit)")}</span>
              <span className="inventory-money-input">
                <em aria-hidden="true">{currencySymbol}</em>
                <input className="input" type="number" min={0} step="0.01" value={draft.purchasePrice ? String(draft.purchasePrice) : ""} placeholder="0.00"
                  onChange={e => set("purchasePrice", Number(e.target.value) || 0)} />
              </span>
            </label>
            <label className="inventory-field">
              <span>{t("Current value (est.)")}</span>
              <span className="inventory-money-input">
                <em aria-hidden="true">{currencySymbol}</em>
                <input className="input" type="number" min={0} step="0.01" value={draft.currentValueEst ? String(draft.currentValueEst) : ""} placeholder="0.00"
                  onChange={e => set("currentValueEst", Number(e.target.value) || 0)} />
              </span>
              <small className="inventory-field-hint">
                {t("An estimate for insurance or resale. Inventory value stays at what you paid — purchase price plus the costs below.")}
              </small>
            </label>
          </div>

          {/* The number the item will actually carry in the list and the KPIs,
              worked out here so nobody has to guess which field moves it. */}
          <div className="inventory-value-preview">
            <span>{isUnique ? t("This item's inventory value") : t("Inventory value per unit")}</span>
            <strong>{money(currencySymbol, draft.ownership === "customer" ? 0 : internalTotal)}</strong>
            {draft.ownership === "customer" ? (
              <small>{t("Customer property is held, not owned — it stays at zero.")}</small>
            ) : null}
          </div>

          {extras.map((row, index) => (
            <div className="inventory-extra-row" key={index}>
              <input className="input" placeholder={t("Service, shipping, restoration…")} value={row.label}
                onChange={e => set("additionalCosts", extras.map((r, i) => i === index ? { ...r, label: e.target.value } : r))} />
              <input className="input" type="number" min={0} step="0.01" value={row.amount ? String(row.amount) : ""} placeholder="0.00"
                onChange={e => set("additionalCosts", extras.map((r, i) => i === index ? { ...r, amount: Number(e.target.value) || 0 } : r))} />
              <button type="button" onClick={() => set("additionalCosts", extras.filter((_, i) => i !== index))}>{t("Remove")}</button>
            </div>
          ))}
          <button type="button" className="inventory-add-cost"
            onClick={() => set("additionalCosts", [...extras, { label: "", amount: 0 }])}>
            {t("+ Add cost")}
          </button>

          <div className="inventory-cost-total">
            <span>{t("Internal total cost")}</span>
            <strong>{money(currencySymbol, internalTotal)}</strong>
          </div>
        </div>

        <label className="inventory-ownership">
          <input
            type="checkbox"
            checked={draft.ownership === "customer"}
            onChange={e => set("ownership", e.target.checked ? "customer" : "business")}
          />
          <span>
            {t("This belongs to a customer, not the business. It will be held and findable, but valued at zero and left out of inventory value.")}
          </span>
        </label>

        <div className="inventory-photo-picker">
          <div className="inventory-photo-picker-head">
            <strong>{t("Photos")}</strong>
            <span className="muted-copy">
              {editingId
                ? t("New photos are added when you save.")
                : t("Pick photos now — they upload as soon as the item is created.")}
            </span>
          </div>
          <div className="inventory-photo-picker-row">
            {stagedPreviews.map((url, index) => (
              <div className="inventory-photo-thumb" key={url}>
                <img src={url} alt="" />
                <button
                  type="button"
                  aria-label={t("Remove")}
                  onClick={() => setStagedPhotos(current => current.filter((_, i) => i !== index))}
                >
                  ×
                </button>
              </div>
            ))}
            {photoRoom > 0 ? (
              <label className="inventory-photo-add">
                <span aria-hidden="true">＋</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  disabled={busy}
                  onChange={event => {
                    const picked = [...(event.target.files ?? [])].slice(0, photoRoom);
                    event.target.value = "";
                    if (picked.length > 0) setStagedPhotos(current => [...current, ...picked]);
                  }}
                />
              </label>
            ) : (
              <span className="muted-copy">{`${t("An item carries at most")} ${INVENTORY_PHOTO_LIMIT} ${t("photos.")}`}</span>
            )}
          </div>
        </div>

        {error ? <p className="inventory-notice">{error}</p> : null}

        <div className="inventory-modal-actions">
          <button type="button" onClick={onClose}>{t("Cancel")}</button>
          <button type="button" className="inventory-primary" disabled={busy} onClick={() => void submit()}>
            {busy ? t("Saving…") : editingId ? t("Save") : t("Add Item")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function InventoryIcon() {
  return <CardIconGlyph icon="shippingBox" />;
}
