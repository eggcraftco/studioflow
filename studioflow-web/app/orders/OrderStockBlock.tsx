"use client";

// Stock committed to one order.
//
// Reserving is not consuming. A movement set aside for this job is still
// physically in the drawer and still an asset of the business; it just cannot be
// promised to a second order. That distinction is why this block shows a
// reserved total separately instead of quietly deducting it from stock.
//
// The total is offered to the Financial card rather than written into it. A
// figure a person typed is a decision, and silently overwriting it with a
// computed one would lose that decision without telling anyone.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  applyRecipeToOrder,
  consumeInventoryForOrder,
  getOrderInventory,
  inventoryFreeToReserve,
  listInventoryItems,
  listInventoryRecipes,
  releaseInventoryFromOrder,
  reserveInventoryForOrder,
  swapInventoryForOrder,
  type InventoryItem,
  type InventoryRecipe,
  type OrderInventoryLine
} from "@/lib/studioflow/inventory";
import { useAuth } from "@/lib/auth/AuthProvider";
import { studioT } from "@/lib/studioflow/language";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";

function money(symbol: string, value: number) {
  return `${symbol}${(Number(value) || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

export function OrderStockBlock({
  workspace,
  orderId,
  currencySymbol,
  canEdit,
  onUseAsBaseCost
}: {
  workspace: WorkspaceContext;
  orderId: string;
  currencySymbol: string;
  canEdit: boolean;
  onUseAsBaseCost?: (total: number) => void;
}) {
  const { language } = useAuth();
  const t = (text: string) => studioT(text, language);

  const [lines, setLines] = useState<OrderInventoryLine[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [swapFrom, setSwapFrom] = useState<OrderInventoryLine | null>(null);
  const [recipePicking, setRecipePicking] = useState(false);
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");

  const reload = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    try {
      const result = await getOrderInventory(workspace, orderId);
      setLines(result?.items ?? []);
      setTotal(Number(result?.totalCost) || 0);
    } catch (failure) {
      setNotice(failure instanceof Error ? t(failure.message) : "");
    } finally {
      setLoading(false);
    }
  }, [workspace, orderId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function release(line: OrderInventoryLine) {
    setBusyId(line.id);
    setNotice("");
    try {
      await releaseInventoryFromOrder(workspace, line.id, orderId);
      await reload();
    } catch (failure) {
      setNotice(failure instanceof Error ? t(failure.message) : t("The item could not be released."));
    } finally {
      setBusyId("");
    }
  }

  // Consuming is the moment the promised part actually goes into the job:
  // the whole reserved line leaves the shelf and the ledger names this order.
  async function consume(line: OrderInventoryLine) {
    setBusyId(line.id);
    setNotice("");
    try {
      await consumeInventoryForOrder(workspace, line.id, orderId);
      await reload();
    } catch (failure) {
      setNotice(failure instanceof Error ? t(failure.message) : t("The item could not be marked as used."));
    } finally {
      setBusyId("");
    }
  }

  if (loading && lines.length === 0) {
    return <p className="app-inline-note">{t("Loading reserved stock…")}</p>;
  }

  return (
    <div className="order-stock-block">
      <div className="order-stock-head">
        <span className="order-stock-title">{t("Stock reserved for this order")}</span>
        {canEdit ? (
          <span className="order-stock-actions">
            <button type="button" className="inventory-link" onClick={() => setPicking(true)}>
              + Reserve stock
            </button>
            <button type="button" className="inventory-link" onClick={() => setRecipePicking(true)}>
              {t("Use a recipe…")}
            </button>
          </span>
        ) : null}
      </div>

      {lines.length === 0 ? (
        <p className="app-inline-note">{t("Nothing reserved yet. Reserving puts a part aside for this job so it cannot be promised twice.")}</p>
      ) : (
        <>
          <ul className="order-stock-list">
            {lines.map(line => (
              <li key={line.id}>
                <span className="order-stock-name">
                  <strong>{line.name}</strong>
                  <span className="inventory-sub">
                    {/* "3 / 10 ml" — what this order holds out of what exists,
                        so a partial reserve doesn't read like the whole spool. */}
                    {[
                      line.number,
                      line.trackingType === "quantity"
                        ? `${line.quantity} / ${line.onHand}${line.unit ? ` ${line.unit}` : ""}`
                        : null,
                      line.location || null
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="order-stock-cost">{money(currencySymbol, line.lineCost)}</span>
                {canEdit ? (
                  <span className="order-stock-actions">
                    <button
                      type="button"
                      className="inventory-link"
                      disabled={busyId === line.id}
                      onClick={() => void consume(line)}
                    >{t("Use on the job")}</button>
                    <button
                      type="button"
                      className="inventory-link"
                      disabled={busyId === line.id}
                      onClick={() => setSwapFrom(line)}
                    >{t("Swap…")}</button>
                    <button
                      type="button"
                      className="inventory-link inventory-link-danger"
                      disabled={busyId === line.id}
                      onClick={() => void release(line)}
                    >{t("Release")}</button>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="order-stock-total">
            <span>{t("Committed stock cost")}</span>
            <strong>{money(currencySymbol, total)}</strong>
          </div>
          {canEdit && onUseAsBaseCost && total > 0 ? (
            <button type="button" className="inventory-link" onClick={() => onUseAsBaseCost(total)}>{t("Use as the base cost on the Financial card")}</button>
          ) : null}
        </>
      )}

      {notice ? <p className="app-inline-error">{t(notice)}</p> : null}

      {recipePicking ? (
        <ApplyRecipeModal
          workspace={workspace}
          orderId={orderId}
          onClose={() => setRecipePicking(false)}
          onApplied={async () => { setRecipePicking(false); await reload(); }}
        />
      ) : null}

      {picking || swapFrom ? (
        <ReserveStockModal
          workspace={workspace}
          orderId={orderId}
          currencySymbol={currencySymbol}
          alreadyReserved={lines.map(line => line.id)}
          swapFrom={swapFrom}
          onClose={() => { setPicking(false); setSwapFrom(null); }}
          onReserved={async () => { setPicking(false); setSwapFrom(null); await reload(); }}
        />
      ) : null}
    </div>
  );
}

function ReserveStockModal({
  workspace,
  orderId,
  currencySymbol,
  alreadyReserved,
  swapFrom,
  onClose,
  onReserved
}: {
  workspace: WorkspaceContext;
  orderId: string;
  currencySymbol: string;
  alreadyReserved: string[];
  /** When set, picking an item swaps this line for it instead of adding. */
  swapFrom?: OrderInventoryLine | null;
  onClose: () => void;
  onReserved: () => void;
}) {
  const { language } = useAuth();
  const t = (text: string) => studioT(text, language);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await listInventoryItems(workspace);
        if (!cancelled) setItems(result?.items ?? []);
      } catch (failure) {
        if (!cancelled) setError(failure instanceof Error ? t(failure.message) : t("Inventory could not be loaded."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [workspace]);

  // Only what can honestly be promised: business-owned, still on the shelf, and
  // not already spoken for. A customer's own property is never offered here.
  const choices = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items
      .filter(item => item.ownership !== "customer")
      .filter(item => !alreadyReserved.includes(item.id))
      .filter(item => inventoryFreeToReserve(item) > 0)
      .filter(item => {
        if (!needle) return true;
        return [item.name, item.brand, item.model, item.reference, item.serialNumber, item.sku, item.number]
          .filter(Boolean)
          .some(field => String(field).toLowerCase().includes(needle));
      })
      .slice(0, 60);
  }, [items, search, alreadyReserved]);

  async function reserve(item: InventoryItem) {
    const free = inventoryFreeToReserve(item);
    const fallback = swapFrom && item.trackingType === "quantity"
      ? Math.min(free, swapFrom.quantity)
      : free;
    const wanted = item.trackingType === "unique"
      ? 1
      : Number(amounts[item.id] ?? fallback) || 0;
    if (item.trackingType === "quantity" && wanted <= 0) {
      setError(t("Enter how much to reserve."));
      return;
    }
    setBusy(item.id);
    setError("");
    try {
      if (swapFrom) {
        await swapInventoryForOrder(workspace, orderId, swapFrom.id, item.id, wanted);
      } else {
        await reserveInventoryForOrder(workspace, item.id, orderId, wanted);
      }
      onReserved();
    } catch (failure) {
      setError(failure instanceof Error
        ? t(failure.message)
        : t(swapFrom ? "The swap could not be completed." : "The item could not be reserved."));
      setBusy("");
    }
  }

  return (
    <div className="inventory-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="inventory-modal" role="dialog" aria-modal="true" aria-label={t(swapFrom ? "Swap to a different item" : "Reserve stock")} onClick={e => e.stopPropagation()}>
        <div className="inventory-modal-head">
          <h2>{t(swapFrom ? "Swap to a different item" : "Reserve stock")}</h2>
          <button type="button" className="inventory-modal-close" onClick={onClose} aria-label={t("Close")}>×</button>
        </div>
        <div className="inventory-modal-body">
          <input
            className="input"
            placeholder={t("Search stock…")}
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
          {loading ? (
            <p className="inventory-note">{t("Loading stock…")}</p>
          ) : choices.length === 0 ? (
            <p className="inventory-note">
              {items.length === 0
                ? "There is nothing in inventory yet."
                : t("Nothing available to reserve — everything is either used, sold or already promised.")}
            </p>
          ) : (
            <div className="inventory-match-list">
              {choices.map(item => {
                const free = inventoryFreeToReserve(item);
                return (
                  <div className="inventory-reserve-row" key={item.id}>
                    <span className="inventory-match-main">
                      <strong>{item.name}</strong>
                      <span className="inventory-sub">
                        {[item.number, item.category, `${free}${item.quantity?.unit ? ` ${item.quantity.unit}` : ""} free`]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    {item.trackingType === "quantity" ? (
                      <input
                        className="input inventory-qty-input"
                        inputMode="decimal"
                        value={amounts[item.id] ?? String(swapFrom ? Math.min(free, swapFrom.quantity) : free)}
                        onChange={event => setAmounts(current => ({ ...current, [item.id]: event.target.value }))}
                        aria-label={`Quantity to reserve of ${item.name}`}
                      />
                    ) : (
                      <span className="inventory-match-amount">
                        <strong>{money(currencySymbol, item.valuationCost)}</strong>
                      </span>
                    )}
                    <button
                      type="button"
                      className="inventory-secondary inventory-secondary-small"
                      disabled={busy !== ""}
                      onClick={() => void reserve(item)}
                    >{t(swapFrom ? "Swap" : "Reserve")}</button>
                  </div>
                );
              })}
            </div>
          )}
          {error ? <p className="inventory-error">{t(error)}</p> : null}
        </div>
        <div className="inventory-modal-foot">
          <span />
          <div className="inventory-modal-actions">
            <button type="button" className="inventory-secondary" onClick={onClose}>{t("Close")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// One act: pick the recipe, say how many jobs' worth, and the server reserves
// every line in a single transaction — or refuses and reserves nothing.
function ApplyRecipeModal({
  workspace,
  orderId,
  onClose,
  onApplied
}: {
  workspace: WorkspaceContext;
  orderId: string;
  onClose: () => void;
  onApplied: () => void;
}) {
  const { language } = useAuth();
  const t = (text: string) => studioT(text, language);
  const [recipes, setRecipes] = useState<InventoryRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [recipeId, setRecipeId] = useState("");
  const [multiplier, setMultiplier] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await listInventoryRecipes(workspace);
        if (!cancelled) {
          const rows = result?.recipes ?? [];
          setRecipes(rows);
          if (rows.length === 1) setRecipeId(rows[0].id);
        }
      } catch (failure) {
        if (!cancelled) setError(failure instanceof Error ? t(failure.message) : t("Recipes could not be loaded."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [workspace]);

  async function apply() {
    if (!recipeId) { setError(t("Choose a recipe first.")); return; }
    const times = Number(multiplier) || 1;
    setBusy(true);
    setError("");
    try {
      await applyRecipeToOrder(workspace, recipeId, orderId, times);
      onApplied();
    } catch (failure) {
      setError(failure instanceof Error ? t(failure.message) : t("The recipe could not be applied."));
      setBusy(false);
    }
  }

  return (
    <div className="inventory-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="inventory-modal" role="dialog" aria-modal="true" aria-label={t("Use a recipe")} onClick={e => e.stopPropagation()}>
        <div className="inventory-modal-head">
          <h2>{t("Use a recipe")}</h2>
          <button type="button" className="inventory-modal-close" onClick={onClose} aria-label={t("Close")}>×</button>
        </div>
        <div className="inventory-modal-body">
          {loading ? (
            <p className="inventory-note">{t("Loading…")}</p>
          ) : recipes.length === 0 ? (
            <p className="inventory-note">{t("No recipes yet — write one under Inventory → Recipes.")}</p>
          ) : (
            <div className="inventory-form">
              <label className="inventory-field is-wide">
                <span>{t("Recipe")}</span>
                <select className="input" value={recipeId} onChange={e => setRecipeId(e.target.value)}>
                  <option value="">{t("Choose a recipe…")}</option>
                  {recipes.map(recipe => (
                    <option key={recipe.id} value={recipe.id}>{recipe.name} · {recipe.lines.length} {t("lines")}</option>
                  ))}
                </select>
              </label>
              <label className="inventory-field">
                <span>{t("How many jobs' worth")}</span>
                <input className="input inventory-qty-input" inputMode="numeric" value={multiplier} onChange={e => setMultiplier(e.target.value)} />
              </label>
            </div>
          )}
          {error ? <p className="inventory-error">{t(error)}</p> : null}
        </div>
        <div className="inventory-modal-foot">
          <span />
          <div className="inventory-modal-actions">
            <button type="button" className="inventory-secondary" onClick={onClose}>{t("Cancel")}</button>
            <button type="button" className="inventory-primary" disabled={busy || recipes.length === 0} onClick={() => void apply()}>
              {busy ? t("Saving…") : t("Reserve the parts")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
