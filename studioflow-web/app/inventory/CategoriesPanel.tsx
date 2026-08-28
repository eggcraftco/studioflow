"use client";

// Inventory → Manage → Categories.
//
// Categories used to be ten fixed words, which is fine if you sell watches and
// wrong for everyone else. This is where a workshop names what it actually
// keeps. Two rules shape the screen:
//   * one central name — renaming here renames it everywhere, because the
//     server carries the new title to the items that used the old one;
//   * nothing is orphaned — a category holding items cannot simply be removed,
//     so the delete button asks where those items should go instead.

import { useCallback, useEffect, useMemo, useState } from "react";
import { dispatchStudioToast } from "@/components/StudioToastHost";
import { useAuth } from "@/lib/auth/AuthProvider";
import { studioT } from "@/lib/studioflow/language";
import {
  deleteInventoryCategory,
  listInventoryCategories,
  mergeInventoryCategories,
  saveInventoryCategories,
  type InventoryCategory,
  type InventoryCategoryDisposition
} from "@/lib/studioflow/inventory";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";

// A short, deliberately plain set — enough to tell rows apart at a glance
// without turning the sidebar into a sticker album.
const ICON_CHOICES = [
  "⌚", "◎", "⚙", "⚒", "⚗", "➰", "▧", "✄", "◇", "⬢",
  "◈", "✦", "❖", "⬡", "◐", "▤", "▦", "✧", "⌘", "▪"
];

export function CategoriesPanel({
  workspace,
  canEdit,
  onCategoriesChanged
}: {
  workspace: WorkspaceContext;
  canEdit: boolean;
  onCategoriesChanged: () => void;
}) {
  const { language } = useAuth();
  const t = (text: string) => studioT(text, language);

  const [rows, setRows] = useState<InventoryCategory[]>([]);
  const [defaultCategory, setDefaultCategory] = useState("");
  const [orphans, setOrphans] = useState<{ title: string; itemCount: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [dirty, setDirty] = useState(false);
  const [removing, setRemoving] = useState<InventoryCategory | null>(null);
  const [merging, setMerging] = useState<InventoryCategory | null>(null);

  const reload = useCallback(async () => {
    const data = await listInventoryCategories(workspace);
    setRows(data.categories ?? []);
    setDefaultCategory(data.defaultCategory ?? "");
    setOrphans(data.orphans ?? []);
    setDirty(false);
  }, [workspace]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listInventoryCategories(workspace);
        if (cancelled) return;
        setRows(data.categories ?? []);
        setDefaultCategory(data.defaultCategory ?? "");
        setOrphans(data.orphans ?? []);
      } catch (failure) {
        if (!cancelled) setNotice(failure instanceof Error ? failure.message : t("Categories could not be loaded."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.id]);

  const usedCount = useMemo(
    () => rows.reduce((total, row) => total + (row.itemCount ?? 0), 0),
    [rows]
  );

  function update(index: number, patch: Partial<InventoryCategory>) {
    setRows(current => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    setDirty(true);
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    setRows(current => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setDirty(true);
  }

  function addRow() {
    if (rows.length >= 40) return;
    setRows(current => [
      ...current,
      { id: `category_${Date.now().toString(36)}`, title: "", icon: "◇", archived: false, itemCount: 0 }
    ]);
    setDirty(true);
  }

  async function save() {
    const cleaned = rows
      .map(row => ({ ...row, title: row.title.trim() }))
      .filter(row => Boolean(row.title));
    if (cleaned.length === 0) {
      setNotice(t("Inventory needs at least one category."));
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const result = await saveInventoryCategories(workspace, cleaned, defaultCategory);
      setRows(result.categories ?? cleaned);
      setDirty(false);
      onCategoriesChanged();
      dispatchStudioToast({
        message: result.renamedItems
          ? `${t("Categories saved")} · ${result.renamedItems} ${t("items renamed")}`
          : t("Categories saved")
      });
      await reload();
    } catch (failure) {
      setNotice(failure instanceof Error ? failure.message : t("Categories could not be saved."));
    } finally {
      setBusy(false);
    }
  }

  async function remove(category: InventoryCategory, disposition: InventoryCategoryDisposition, moveToId: string) {
    setBusy(true);
    setNotice("");
    try {
      const result = await deleteInventoryCategory(workspace, {
        categoryId: category.id,
        disposition,
        ...(disposition === "move" ? { moveToId } : {})
      });
      setRemoving(null);
      onCategoriesChanged();
      dispatchStudioToast({
        message: result.archived
          ? `${t("Archived")} · ${category.title}`
          : `${t("Removed")} · ${category.title}${result.itemsMoved ? ` · ${result.itemsMoved} ${t("items moved")}` : ""}`
      });
      await reload();
    } catch (failure) {
      setNotice(failure instanceof Error ? failure.message : t("Category could not be removed."));
    } finally {
      setBusy(false);
    }
  }

  async function merge(from: InventoryCategory, intoId: string) {
    setBusy(true);
    setNotice("");
    try {
      const result = await mergeInventoryCategories(workspace, { fromId: from.id, intoId });
      setMerging(null);
      onCategoriesChanged();
      dispatchStudioToast({
        message: `${from.title} → ${result.into ?? ""}${result.itemsMoved ? ` · ${result.itemsMoved} ${t("items moved")}` : ""}`
      });
      await reload();
    } catch (failure) {
      setNotice(failure instanceof Error ? failure.message : t("Categories could not be merged."));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="inventory-notice">{t("Loading categories…")}</p>;

  return (
    <section className="inventory-panel inv-categories">
      <header className="inv-categories-head">
        <div>
          <h2>{t("Categories")}</h2>
          <p>{t("Name these the way your workshop talks. Renaming one here renames it on every item, filter and report.")}</p>
        </div>
        {canEdit ? (
          <div className="inv-categories-actions">
            <button type="button" className="btn" onClick={addRow} disabled={busy || rows.length >= 40}>
              ＋ {t("Add category")}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy || !dirty}>
              {busy ? t("Saving…") : t("Save changes")}
            </button>
          </div>
        ) : null}
      </header>

      {notice ? <p className="inventory-notice">{notice}</p> : null}

      {orphans.length > 0 ? (
        <p className="inv-categories-orphans">
          <strong>{t("Not on this list:")}</strong>{" "}
          {orphans.map(item => `${item.title} (${item.itemCount})`).join(", ")}.{" "}
          {t("Add the name back, or open the category filter to move those items.")}
        </p>
      ) : null}

      <table className="inv-categories-table">
        <thead>
          <tr>
            <th aria-label={t("Order")} />
            <th>{t("Icon")}</th>
            <th>{t("Name")}</th>
            <th>{t("Items")}</th>
            <th>{t("Default")}</th>
            <th>{t("Visible")}</th>
            <th aria-label={t("Actions")} />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id} className={row.archived ? "is-archived" : ""}>
              <td>
                <div className="inv-categories-order">
                  <button type="button" onClick={() => move(index, -1)} disabled={!canEdit || index === 0} aria-label={t("Move up")}>▲</button>
                  <button type="button" onClick={() => move(index, 1)} disabled={!canEdit || index === rows.length - 1} aria-label={t("Move down")}>▼</button>
                </div>
              </td>
              <td>
                <select
                  className="input inv-categories-icon"
                  value={ICON_CHOICES.includes(row.icon) ? row.icon : ICON_CHOICES[0]}
                  disabled={!canEdit}
                  onChange={event => update(index, { icon: event.target.value })}
                  aria-label={t("Icon")}
                >
                  {ICON_CHOICES.map(icon => <option key={icon} value={icon}>{icon}</option>)}
                </select>
              </td>
              <td>
                <input
                  className="input"
                  value={row.title}
                  maxLength={60}
                  disabled={!canEdit}
                  placeholder={t("Category name")}
                  onChange={event => update(index, { title: event.target.value })}
                />
              </td>
              <td className="inv-categories-count">{row.itemCount ?? 0}</td>
              <td>
                <input
                  type="radio"
                  name="inventory-default-category"
                  checked={defaultCategory === row.title && Boolean(row.title)}
                  disabled={!canEdit || !row.title}
                  onChange={() => { setDefaultCategory(row.title); setDirty(true); }}
                  aria-label={t("Use as default")}
                />
              </td>
              <td>
                <input
                  type="checkbox"
                  checked={!row.archived}
                  disabled={!canEdit}
                  onChange={event => update(index, { archived: !event.target.checked })}
                  aria-label={t("Show in the sidebar")}
                />
              </td>
              <td>
                <div className="inv-categories-row-actions">
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={!canEdit || busy || rows.length < 2}
                    onClick={() => setMerging(row)}
                  >
                    {t("Merge")}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    disabled={!canEdit || busy}
                    onClick={() => {
                      // An empty category needs no ceremony; a full one does.
                      if ((row.itemCount ?? 0) === 0) void remove(row, "other", "");
                      else setRemoving(row);
                    }}
                  >
                    {t("Remove")}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="inv-categories-foot">
        {rows.filter(row => !row.archived).length} {t("visible")} · {usedCount} {t("items filed")}
      </p>

      {removing ? (
        <RemoveCategoryModal
          category={removing}
          categories={rows.filter(row => row.id !== removing.id && !row.archived && row.title)}
          t={t}
          busy={busy}
          onCancel={() => setRemoving(null)}
          onConfirm={(disposition, moveToId) => void remove(removing, disposition, moveToId)}
        />
      ) : null}

      {merging ? (
        <MergeCategoryModal
          category={merging}
          categories={rows.filter(row => row.id !== merging.id && row.title)}
          t={t}
          busy={busy}
          onCancel={() => setMerging(null)}
          onConfirm={intoId => void merge(merging, intoId)}
        />
      ) : null}
    </section>
  );
}

function RemoveCategoryModal({
  category, categories, t, busy, onCancel, onConfirm
}: {
  category: InventoryCategory;
  categories: InventoryCategory[];
  t: (text: string) => string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (disposition: InventoryCategoryDisposition, moveToId: string) => void;
}) {
  const [disposition, setDisposition] = useState<InventoryCategoryDisposition>(categories.length > 0 ? "move" : "other");
  const [moveToId, setMoveToId] = useState(categories[0]?.id ?? "");
  const count = category.itemCount ?? 0;

  return (
    <div className="production-modal-backdrop" role="dialog" aria-modal="true">
      <div className="production-modal">
        <h2>{t("Remove")} “{category.title}”</h2>
        <p>
          {count} {count === 1 ? t("item is filed here.") : t("items are filed here.")}{" "}
          {t("Choose where they should go — nothing is deleted.")}
        </p>
        <div className="production-modal-reasons">
          {categories.length > 0 ? (
            <label className={disposition === "move" ? "is-active" : ""}>
              <input type="radio" name="cat-disposition" checked={disposition === "move"} onChange={() => setDisposition("move")} />
              {t("Move the items to")}
              <select
                className="input inv-categories-move-to"
                value={moveToId}
                onChange={event => { setMoveToId(event.target.value); setDisposition("move"); }}
              >
                {categories.map(row => <option key={row.id} value={row.id}>{row.icon} {row.title}</option>)}
              </select>
            </label>
          ) : null}
          <label className={disposition === "archive" ? "is-active" : ""}>
            <input type="radio" name="cat-disposition" checked={disposition === "archive"} onChange={() => setDisposition("archive")} />
            {t("Hide the category and leave the items where they are")}
          </label>
          <label className={disposition === "other" ? "is-active" : ""}>
            <input type="radio" name="cat-disposition" checked={disposition === "other"} onChange={() => setDisposition("other")} />
            {t("Move the items to Other")}
          </label>
        </div>
        <div className="production-modal-actions">
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>{t("Cancel")}</button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || (disposition === "move" && !moveToId)}
            onClick={() => onConfirm(disposition, moveToId)}
          >
            {busy ? t("Working…") : t("Confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

function MergeCategoryModal({
  category, categories, t, busy, onCancel, onConfirm
}: {
  category: InventoryCategory;
  categories: InventoryCategory[];
  t: (text: string) => string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (intoId: string) => void;
}) {
  const [intoId, setIntoId] = useState(categories[0]?.id ?? "");
  return (
    <div className="production-modal-backdrop" role="dialog" aria-modal="true">
      <div className="production-modal">
        <h2>{t("Merge")} “{category.title}”</h2>
        <p>{t("Its items move across and the category disappears. Bracelets into Straps, say.")}</p>
        <label className="production-modal-note">
          <span>{t("Merge into")}</span>
          <select className="input" value={intoId} onChange={event => setIntoId(event.target.value)}>
            {categories.map(row => <option key={row.id} value={row.id}>{row.icon} {row.title}</option>)}
          </select>
        </label>
        <div className="production-modal-actions">
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>{t("Cancel")}</button>
          <button type="button" className="btn btn-primary" disabled={busy || !intoId} onClick={() => onConfirm(intoId)}>
            {busy ? t("Working…") : t("Merge")}
          </button>
        </div>
      </div>
    </div>
  );
}
