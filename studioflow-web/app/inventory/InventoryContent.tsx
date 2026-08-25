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
import { listSuppliers } from "@/lib/studioflow/inventory";
import { useAuth } from "@/lib/auth/AuthProvider";
import { studioT } from "@/lib/studioflow/language";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";
import { ItemLabelModal } from "./ItemLabelModal";
import { ItemPhotosModal } from "./ItemPhotosModal";
import { OpeningStockModal } from "./OpeningStockModal";
import { PurchasesPanel } from "./PurchasesPanel";
import { ReportsPanel } from "./ReportsPanel";
import { StocktakePanel } from "./StocktakePanel";
import { SuppliersPanel } from "./SuppliersPanel";

type InventoryTab = "items" | "purchases" | "suppliers" | "stocktake" | "reports";

// Labels are stored untranslated and translated where they are drawn: this
// list is module scope, and t() needs the language from the component.
const TABS: Array<{ key: InventoryTab; label: string }> = [
  { key: "items", label: "Items" },
  { key: "purchases", label: "Purchases" },
  { key: "suppliers", label: "Suppliers" },
  { key: "stocktake", label: "Stocktake" },
  { key: "reports", label: "Reports" }
];

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
  const { language } = useAuth();
  const t = (text: string) => studioT(text, language);

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [openingOpen, setOpeningOpen] = useState(false);
  const [photosFor, setPhotosFor] = useState<InventoryItem | null>(null);
  const [labelFor, setLabelFor] = useState<InventoryItem | null>(null);
  const [tab, setTab] = useState<InventoryTab>("items");
  const [supplierNames, setSupplierNames] = useState<string[]>([]);

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
      setNotice(failure instanceof Error ? t(failure.message) : t("Inventory could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [workspace]);

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
      setNotice(failure instanceof Error ? t(failure.message) : t("The item status could not be changed."));
    }
  }

  const cards: { label: string; value: string; sub?: string; tone?: string }[] = summary
    ? [
        { label: t("Total Inventory Value"), value: money(currencySymbol, summary.totalValue), tone: "accent" },
        { label: t("Unique Items"), value: String(summary.uniqueCount), sub: money(currencySymbol, summary.uniqueValue) },
        { label: t("Quantity Items"), value: String(summary.quantityCount), sub: money(currencySymbol, summary.quantityValue) },
        { label: t("Reserved for Orders"), value: money(currencySymbol, summary.reservedValue), sub: `${summary.reservedCount} items` },
        { label: t("Incoming"), value: `${summary.incomingCount} items`, sub: money(currencySymbol, summary.incomingValue) },
        { label: t("Low Stock"), value: `${summary.lowStockCount} items`, tone: summary.lowStockCount > 0 ? "warn" : undefined }
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

      <div className="inventory-tabs" role="tablist">
        {TABS.map(entry => (
          <button
            key={entry.key}
            type="button"
            role="tab"
            aria-selected={tab === entry.key}
            data-active={tab === entry.key}
            onClick={() => setTab(entry.key)}
          >
            {t(entry.label)}
          </button>
        ))}
      </div>

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
      </div>

      {notice ? <p className="inventory-notice">{notice}</p> : null}

      <div className="inventory-table-wrap">
        <table className="inventory-table">
          <thead>
            <tr>
              <th>{t("Item")}</th><th>{t("Type")}</th><th>{t("Category")}</th><th>{t("Status")}</th>
              <th className="r">{t("On Hand")}</th><th className="r">{t("Value")}</th><th>{t("Location")}</th><th /><th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="inventory-empty">{t("Loading…")}</td></tr>
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={9} className="inventory-empty">
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
            ) : visible.map(item => (
              <tr key={item.id}>
                <td>
                  <strong>{item.name}</strong>
                  <span className="inventory-sub">
                    {[item.number, item.reference && `Ref. ${item.reference}`, item.serialNumber]
                      .filter(Boolean).join(" · ")}
                  </span>
                </td>
                <td><span className="inventory-chip">{item.trackingType === "unique" ? t("Unique") : t("Quantity")}</span></td>
                <td>{t(item.category)}</td>
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
                <td className="r">
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
                <td className="r">
                  {canEdit ? (
                    <select
                      className="inventory-status-select"
                      value=""
                      onChange={e => { if (e.target.value) void changeStatus(item, e.target.value as InventoryStatus); }}
                    >
                      <option value="">{t("Move to…")}</option>
                      {INVENTORY_STATUSES.filter(s => s !== item.status).map(s => (
                        <option key={s} value={s}>{t(STATUS_LABEL[s])}</option>
                      ))}
                    </select>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
  const { language } = useAuth();
  const t = (text: string) => studioT(text, language);
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
      setError(failure instanceof Error ? t(failure.message) : "The item could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal inventory-modal" role="dialog" aria-modal="true" aria-label="Add inventory item">
        <div className="inventory-modal-head">
          <h2>{t("Add Inventory Item")}</h2>
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
              placeholder={t("Safe A, Drawer 3…")} />
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
              <input className="input" type="number" min={0} step="0.01" value={draft.purchasePrice ? String(draft.purchasePrice) : ""} placeholder="0.00"
                onChange={e => set("purchasePrice", Number(e.target.value) || 0)} />
            </label>
            <label className="inventory-field">
              <span>{t("Current value (est.)")}</span>
              <input className="input" type="number" min={0} step="0.01" value={draft.currentValueEst ? String(draft.currentValueEst) : ""} placeholder="0.00"
                onChange={e => set("currentValueEst", Number(e.target.value) || 0)} />
            </label>
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

        {error ? <p className="inventory-notice">{error}</p> : null}

        <div className="inventory-modal-actions">
          <button type="button" onClick={onClose}>{t("Cancel")}</button>
          <button type="button" className="inventory-primary" disabled={busy} onClick={() => void submit()}>
            {busy ? t("Saving…") : t("Add Item")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function InventoryIcon() {
  return <CardIconGlyph icon="shippingBox" />;
}
