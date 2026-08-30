"use client";

// A recipe is a job's parts list, written once: "1 buckle + 20cm leather +
// 2 screws". The order card applies it in one act — the server reserves every
// line in one transaction, all or nothing. This panel only writes the lists.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteInventoryRecipe,
  listInventoryRecipes,
  saveInventoryRecipe,
  type InventoryItem,
  type InventoryRecipe,
  type InventoryRecipeLine
} from "@/lib/studioflow/inventory";
import { useAuth } from "@/lib/auth/AuthProvider";
import { studioT } from "@/lib/studioflow/language";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";

type DraftLine = { itemId: string; quantity: string };

export function RecipesPanel({
  workspace,
  items,
  canEdit
}: {
  workspace: WorkspaceContext;
  items: InventoryItem[];
  canEdit: boolean;
}) {
  const { language } = useAuth();
  const t = (text: string) => studioT(text, language);

  const [recipes, setRecipes] = useState<InventoryRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<InventoryRecipe | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([{ itemId: "", quantity: "1" }]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listInventoryRecipes(workspace);
      setRecipes(result?.recipes ?? []);
    } catch (failure) {
      setNotice(failure instanceof Error ? t(failure.message) : t("Recipes could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [workspace]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const itemById = useMemo(() => new Map(items.map(item => [item.id, item])), [items]);
  // Only what a recipe can honestly promise: business stock still in play.
  const componentChoices = useMemo(
    () => items.filter(item => item.ownership !== "customer" && !["sold", "used", "archived", "removed"].includes(item.status)),
    [items]
  );

  function openForm(recipe: InventoryRecipe | null) {
    setEditing(recipe);
    setName(recipe?.name ?? "");
    setNotes(recipe?.notes ?? "");
    setLines(recipe && recipe.lines.length > 0
      ? recipe.lines.map(line => ({ itemId: line.itemId, quantity: String(line.quantity) }))
      : [{ itemId: "", quantity: "1" }]);
    setFormOpen(true);
  }

  async function submit() {
    const cleaned: InventoryRecipeLine[] = lines
      .map(line => ({ itemId: line.itemId, quantity: Number(line.quantity) || 0 }))
      .filter(line => line.itemId && line.quantity > 0);
    if (!name.trim() || cleaned.length === 0) {
      setNotice(t("A recipe needs a name and at least one line."));
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      await saveInventoryRecipe(workspace, { name: name.trim(), notes: notes.trim(), lines: cleaned }, editing?.id);
      setFormOpen(false);
      await reload();
    } catch (failure) {
      setNotice(failure instanceof Error ? t(failure.message) : t("The recipe could not be saved."));
    } finally {
      setBusy(false);
    }
  }

  async function remove(recipe: InventoryRecipe) {
    setBusy(true);
    setNotice("");
    try {
      await deleteInventoryRecipe(workspace, recipe.id);
      await reload();
    } catch (failure) {
      setNotice(failure instanceof Error ? t(failure.message) : t("The recipe could not be deleted."));
    } finally {
      setBusy(false);
    }
  }

  const lineLabel = (line: InventoryRecipeLine) => {
    const item = itemById.get(line.itemId);
    const unit = item?.trackingType === "quantity" && item.quantity?.unit ? ` ${item.quantity.unit}` : "";
    return `${line.quantity}${unit} × ${item?.name ?? t("(missing item)")}`;
  };

  return (
    <div className="inventory-panel">
      <div className="inventory-head">
        <div>
          <h2>{t("Recipes")}</h2>
          <p className="inventory-panel-hint">
            {t("A job's parts list, written once. Applying it to an order reserves every line in one act — all or nothing.")}
          </p>
        </div>
        {canEdit ? (
          <button type="button" className="inventory-primary" onClick={() => openForm(null)}>
            + {t("New recipe")}
          </button>
        ) : null}
      </div>

      {notice ? <p className="inventory-notice">{t(notice)}</p> : null}

      {loading ? (
        <p className="inventory-note">{t("Loading…")}</p>
      ) : recipes.length === 0 ? (
        <div className="inventory-empty">
          <strong>{t("No recipes yet")}</strong>
          <p>{t("Write the parts a repeated job takes, and the order card reserves them in one click.")}</p>
        </div>
      ) : (
        <ul className="inventory-location-list">
          {recipes.map(recipe => (
            <li key={recipe.id}>
              <span className="inventory-location-name">
                <strong>{recipe.name}</strong>
                <span className="inventory-sub">
                  {recipe.lines.map(lineLabel).join(" · ")}
                  {recipe.notes ? ` — ${recipe.notes}` : ""}
                </span>
              </span>
              {canEdit ? (
                <span className="order-stock-actions">
                  <button type="button" className="inventory-link" disabled={busy} onClick={() => openForm(recipe)}>{t("Edit")}</button>
                  <button type="button" className="inventory-link inventory-link-danger" disabled={busy} onClick={() => void remove(recipe)}>{t("Delete")}</button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {formOpen ? (
        <div className="inventory-modal-backdrop" role="presentation" onClick={() => setFormOpen(false)}>
          <div className="inventory-modal" role="dialog" aria-modal="true" aria-label={t("Recipe")} onClick={e => e.stopPropagation()}>
            <div className="inventory-modal-head">
              <h2>{editing ? t("Edit recipe") : t("New recipe")}</h2>
              <button type="button" className="inventory-modal-close" onClick={() => setFormOpen(false)} aria-label={t("Close")}>×</button>
            </div>
            <div className="inventory-modal-body">
              <div className="inventory-form">
                <label className="inventory-field is-wide">
                  <span>{t("Name")}</span>
                  <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder={t("Strap job, full service…")} />
                </label>
                <label className="inventory-field is-wide">
                  <span>{t("Notes")}</span>
                  <input className="input" value={notes} onChange={e => setNotes(e.target.value)} />
                </label>
              </div>
              <div className="inventory-section">
                <div className="inventory-section-head">
                  <h3>{t("Parts")}</h3>
                  <button type="button" className="inventory-link" onClick={() => setLines(current => [...current, { itemId: "", quantity: "1" }])}>
                    + {t("Add line")}
                  </button>
                </div>
                {lines.map((line, index) => (
                  <div className="inventory-reserve-row" key={index}>
                    <select
                      className="input"
                      value={line.itemId}
                      onChange={e => setLines(current => current.map((row, position) => position === index ? { ...row, itemId: e.target.value } : row))}
                    >
                      <option value="">{t("Choose an item…")}</option>
                      {componentChoices.map(item => (
                        <option key={item.id} value={item.id}>
                          {item.name}{item.number ? ` (${item.number})` : ""}
                        </option>
                      ))}
                    </select>
                    <input
                      className="input inventory-qty-input"
                      inputMode="decimal"
                      value={line.quantity}
                      onChange={e => setLines(current => current.map((row, position) => position === index ? { ...row, quantity: e.target.value } : row))}
                      aria-label={t("Quantity")}
                    />
                    {lines.length > 1 ? (
                      <button type="button" className="inventory-link inventory-link-danger" onClick={() => setLines(current => current.filter((_, position) => position !== index))}>
                        {t("Remove")}
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
            <div className="inventory-modal-foot">
              <span />
              <div className="inventory-modal-actions">
                <button type="button" className="inventory-secondary" onClick={() => setFormOpen(false)}>{t("Cancel")}</button>
                <button type="button" className="inventory-primary" disabled={busy} onClick={() => void submit()}>
                  {busy ? t("Saving…") : t("Save recipe")}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
