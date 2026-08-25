"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CardIconGlyph } from "@/components/CardTitle";
import {
  INVENTORY_CATEGORIES,
  INVENTORY_STATUSES,
  getInventorySummary,
  inventoryLineValue,
  inventoryOnHand,
  isInventoryLowStock,
  listInventoryItems,
  saveInventoryItem,
  setInventoryItemStatus,
  type InventoryItem,
  type InventoryItemInput,
  type InventorySummary,
  type InventoryStatus,
  type InventoryTrackingType
} from "@/lib/studioflow/inventory";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";

function money(symbol: string, value: number) {
  return `${symbol}${(Number(value) || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

const STATUS_LABEL: Record<InventoryStatus, string> = {
  available: "Available",
  reserved: "Reserved",
  incoming: "Incoming",
  used: "Used",
  sold: "Sold",
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
    currentValueEst: 0
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
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [list, totals] = await Promise.all([
        listInventoryItems(workspace),
        getInventorySummary(workspace)
      ]);
      setItems(list?.items ?? []);
      setSummary(totals?.summary ?? null);
      setNotice("");
    } catch (failure) {
      setNotice(failure instanceof Error ? failure.message : "Inventory could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [workspace]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items.filter(item => {
      if (categoryFilter && item.category !== categoryFilter) return false;
      if (typeFilter && item.trackingType !== typeFilter) return false;
      if (statusFilter && item.status !== statusFilter) return false;
      if (!needle) return true;
      return [item.name, item.brand, item.model, item.reference, item.serialNumber, item.sku, item.number]
        .filter(Boolean)
        .some(field => String(field).toLowerCase().includes(needle));
    });
  }, [items, search, categoryFilter, typeFilter, statusFilter]);

  async function changeStatus(item: InventoryItem, status: InventoryStatus) {
    try {
      await setInventoryItemStatus(workspace, item.id, status);
      await reload();
    } catch (failure) {
      setNotice(failure instanceof Error ? failure.message : "The item status could not be changed.");
    }
  }

  const cards: { label: string; value: string; sub?: string; tone?: string }[] = summary
    ? [
        { label: "Total Inventory Value", value: money(currencySymbol, summary.totalValue), tone: "accent" },
        { label: "Unique Items", value: String(summary.uniqueCount), sub: money(currencySymbol, summary.uniqueValue) },
        { label: "Quantity Items", value: String(summary.quantityCount), sub: money(currencySymbol, summary.quantityValue) },
        { label: "Reserved for Orders", value: money(currencySymbol, summary.reservedValue), sub: `${summary.reservedCount} items` },
        { label: "Incoming", value: `${summary.incomingCount} items`, sub: money(currencySymbol, summary.incomingValue) },
        { label: "Low Stock", value: `${summary.lowStockCount} items`, tone: summary.lowStockCount > 0 ? "warn" : undefined }
      ]
    : [];

  return (
    <div className="inventory-page">
      <div className="inventory-head">
        <h1>Inventory</h1>
        {canEdit ? (
          <button type="button" className="inventory-primary" onClick={() => setModalOpen(true)}>
            + Add Item
          </button>
        ) : null}
      </div>

      <div className="inventory-stats">
        {cards.map(card => (
          <div className="inventory-stat" key={card.label} data-tone={card.tone}>
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
          placeholder="Search items, brand, ref, serial, SKU…"
          value={search}
          onChange={event => setSearch(event.target.value)}
        />
        <select className="input" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
          <option value="">All Categories</option>
          {INVENTORY_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="input" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">All Types</option>
          <option value="unique">Unique</option>
          <option value="quantity">Quantity</option>
        </select>
        <select className="input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          {INVENTORY_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </div>

      {notice ? <p className="inventory-notice">{notice}</p> : null}

      <div className="inventory-table-wrap">
        <table className="inventory-table">
          <thead>
            <tr>
              <th>Item</th><th>Type</th><th>Category</th><th>Status</th>
              <th className="r">On Hand</th><th className="r">Value</th><th>Location</th><th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="inventory-empty">Loading…</td></tr>
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={8} className="inventory-empty">
                  {items.length === 0
                    ? "Nothing in inventory yet. Add your first item, or import your opening stock."
                    : "No items match these filters."}
                </td>
              </tr>
            ) : visible.map(item => (
              <tr key={item.id}>
                <td>
                  <strong>{item.name}</strong>
                  <span className="inventory-sub">
                    {[item.number, item.reference && `Ref. ${item.reference}`, item.serialNumber]
                      .filter(Boolean).join(" · ")}
                  </span>
                </td>
                <td><span className="inventory-chip">{item.trackingType === "unique" ? "Unique" : "Quantity"}</span></td>
                <td>{item.category}</td>
                <td>
                  <span className={`inventory-status is-${item.status}`}>
                    {isInventoryLowStock(item) && item.status === "available"
                      ? "Low Stock"
                      : STATUS_LABEL[item.status] ?? item.status}
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
                <td className="r">
                  {canEdit ? (
                    <select
                      className="inventory-status-select"
                      value=""
                      onChange={e => { if (e.target.value) void changeStatus(item, e.target.value as InventoryStatus); }}
                    >
                      <option value="">Move to…</option>
                      {INVENTORY_STATUSES.filter(s => s !== item.status).map(s => (
                        <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                      ))}
                    </select>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen ? (
        <NewItemModal
          workspace={workspace}
          currencySymbol={currencySymbol}
          onClose={() => setModalOpen(false)}
          onSaved={async () => { setModalOpen(false); await reload(); }}
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
  onClose,
  onSaved
}: {
  workspace: WorkspaceContext;
  currencySymbol: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [draft, setDraft] = useState<InventoryItemInput>(() => emptyDraft("unique"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
      await saveInventoryItem(workspace, draft);
      await onSaved();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The item could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal inventory-modal" role="dialog" aria-modal="true" aria-label="Add inventory item">
        <div className="inventory-modal-head">
          <h2>Add Inventory Item</h2>
          <button type="button" className="inventory-modal-close" onClick={onClose} aria-label="Close">×</button>
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
            <span>Name</span>
            <input className="input" value={draft.name} onChange={e => set("name", e.target.value)}
              placeholder={isUnique ? "Rolex Air-King 5500" : "Dial Paint — Black"} />
          </label>

          <label className="inventory-field">
            <span>Category</span>
            <select className="input" value={draft.category} onChange={e => set("category", e.target.value)}>
              {INVENTORY_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>

          <label className="inventory-field">
            <span>Location</span>
            <input className="input" value={draft.location ?? ""} onChange={e => set("location", e.target.value)}
              placeholder="Safe A, Drawer 3…" />
          </label>

          {isUnique ? (
            <>
              <label className="inventory-field"><span>Brand</span>
                <input className="input" value={draft.brand ?? ""} onChange={e => set("brand", e.target.value)} /></label>
              <label className="inventory-field"><span>Model</span>
                <input className="input" value={draft.model ?? ""} onChange={e => set("model", e.target.value)} /></label>
              <label className="inventory-field"><span>Reference</span>
                <input className="input" value={draft.reference ?? ""} onChange={e => set("reference", e.target.value)} /></label>
              <label className="inventory-field"><span>Serial Number</span>
                <input className="input" value={draft.serialNumber ?? ""} onChange={e => set("serialNumber", e.target.value)} /></label>
              <label className="inventory-field"><span>Year</span>
                <input className="input" value={draft.year ?? ""} onChange={e => set("year", e.target.value)} /></label>
              <label className="inventory-field"><span>Condition</span>
                <input className="input" value={draft.condition ?? ""} onChange={e => set("condition", e.target.value)}
                  placeholder="Good, Fair, Needs service…" /></label>
            </>
          ) : (
            <>
              <label className="inventory-field"><span>SKU</span>
                <input className="input" value={draft.sku ?? ""} onChange={e => set("sku", e.target.value)}
                  placeholder="PAINT-BLK" /></label>
              <label className="inventory-field"><span>On Hand</span>
                <input className="input" type="number" min={0} step="0.01" value={draft.onHand ?? 0}
                  onChange={e => set("onHand", Number(e.target.value) || 0)} /></label>
              <label className="inventory-field"><span>Unit</span>
                <input className="input" value={draft.unit ?? ""} onChange={e => set("unit", e.target.value)}
                  placeholder="ml, g, pcs" /></label>
              <label className="inventory-field"><span>Reorder at</span>
                <input className="input" type="number" min={0} step="0.01" value={draft.lowStockAt ?? 0}
                  onChange={e => set("lowStockAt", Number(e.target.value) || 0)} /></label>
            </>
          )}

          <label className="inventory-field"><span>Supplier</span>
            <input className="input" value={draft.supplierName ?? ""} onChange={e => set("supplierName", e.target.value)} /></label>
          <label className="inventory-field"><span>Purchase date</span>
            <input className="input" type="date" value={draft.purchaseDate ?? ""} onChange={e => set("purchaseDate", e.target.value)} /></label>
        </div>

        <div className="inventory-cost-block">
          <div className="inventory-cost-head">
            <strong>Cost</strong>
            <span>
              Purchase price and additional costs are kept apart on purpose — the VAT margin scheme
              uses the price of the item alone.
            </span>
          </div>
          <div className="inventory-form">
            <label className="inventory-field">
              <span>Purchase price {isUnique ? "" : "(per unit)"}</span>
              <input className="input" type="number" min={0} step="0.01" value={draft.purchasePrice ?? 0}
                onChange={e => set("purchasePrice", Number(e.target.value) || 0)} />
            </label>
            <label className="inventory-field">
              <span>Current value (est.)</span>
              <input className="input" type="number" min={0} step="0.01" value={draft.currentValueEst ?? 0}
                onChange={e => set("currentValueEst", Number(e.target.value) || 0)} />
            </label>
          </div>

          {extras.map((row, index) => (
            <div className="inventory-extra-row" key={index}>
              <input className="input" placeholder="Service, shipping, restoration…" value={row.label}
                onChange={e => set("additionalCosts", extras.map((r, i) => i === index ? { ...r, label: e.target.value } : r))} />
              <input className="input" type="number" min={0} step="0.01" value={row.amount}
                onChange={e => set("additionalCosts", extras.map((r, i) => i === index ? { ...r, amount: Number(e.target.value) || 0 } : r))} />
              <button type="button" onClick={() => set("additionalCosts", extras.filter((_, i) => i !== index))}>Remove</button>
            </div>
          ))}
          <button type="button" className="inventory-add-cost"
            onClick={() => set("additionalCosts", [...extras, { label: "", amount: 0 }])}>
            + Add cost
          </button>

          <div className="inventory-cost-total">
            <span>Internal total cost</span>
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
            This belongs to a customer, not the business. It will be held and findable, but valued at
            zero and left out of inventory value.
          </span>
        </label>

        {error ? <p className="inventory-notice">{error}</p> : null}

        <div className="inventory-modal-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" className="inventory-primary" disabled={busy} onClick={() => void submit()}>
            {busy ? "Saving…" : "Add Item"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function InventoryIcon() {
  return <CardIconGlyph icon="shippingBox" />;
}
