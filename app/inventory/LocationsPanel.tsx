"use client";

// The places stock lives, as a tree the workshop actually has: Safe A holds
// Drawer 3 holds Tray 1. Renaming a node here renames it on every item
// standing in it (the server owns that cascade); deleting is refused while
// anything — a child location or standing stock — still lives inside.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteInventoryLocation,
  listInventoryLocations,
  saveInventoryLocation,
  type InventoryItem,
  type InventoryLocation
} from "@/lib/studioflow/inventory";
import { useAuth } from "@/lib/auth/AuthProvider";
import { studioT } from "@/lib/studioflow/language";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";

export function LocationsPanel({
  workspace,
  items,
  canEdit,
  onLocationsChanged
}: {
  workspace: WorkspaceContext;
  items: InventoryItem[];
  canEdit: boolean;
  /** Renames cascade into item location strings — the list needs a reload. */
  onLocationsChanged: () => void;
}) {
  const { language } = useAuth();
  const t = (text: string) => studioT(text, language);

  const [locations, setLocations] = useState<InventoryLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const [newParentId, setNewParentId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editName, setEditName] = useState("");
  const [editParentId, setEditParentId] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listInventoryLocations(workspace);
      setLocations(result?.locations ?? []);
    } catch (failure) {
      setNotice(failure instanceof Error ? t(failure.message) : t("Locations could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [workspace]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // How many items stand at each exact path — counted client-side from the
  // already-loaded list, so no extra reads.
  const countsByPath = useMemo(() => {
    const counts = new Map<string, number>();
    items.forEach(item => {
      const value = (item.location || "").trim();
      if (!value) return;
      counts.set(value, (counts.get(value) ?? 0) + 1);
    });
    return counts;
  }, [items]);

  async function run(action: () => Promise<unknown>, failText: string) {
    setBusy(true);
    setNotice("");
    try {
      await action();
      await reload();
      onLocationsChanged();
    } catch (failure) {
      setNotice(failure instanceof Error ? t(failure.message) : t(failText));
    } finally {
      setBusy(false);
    }
  }

  async function addLocation() {
    const name = newName.trim();
    if (!name) return;
    await run(async () => {
      await saveInventoryLocation(workspace, { name, parentId: newParentId || undefined });
      setNewName("");
      setNewParentId("");
    }, "The location could not be saved.");
  }

  async function saveEdit(location: InventoryLocation) {
    const name = editName.trim();
    if (!name) return;
    await run(async () => {
      await saveInventoryLocation(workspace, { name, parentId: editParentId || undefined }, location.id);
      setEditingId("");
    }, "The location could not be saved.");
  }

  return (
    <div className="inventory-panel">
      <div className="inventory-head">
        <div>
          <h2>{t("Locations")}</h2>
          <p className="inventory-panel-hint">
            {t("The places stock lives — a safe holds a drawer holds a tray. Renaming one renames it on every item standing there.")}
          </p>
        </div>
      </div>

      {notice ? <p className="inventory-notice">{t(notice)}</p> : null}

      {canEdit ? (
        <div className="inventory-form" style={{ alignItems: "end" }}>
          <label className="inventory-field">
            <span>{t("New location")}</span>
            <input className="input" value={newName} onChange={e => setNewName(e.target.value)} placeholder={t("Safe A, Drawer 3…")} />
          </label>
          <label className="inventory-field">
            <span>{t("Inside")}</span>
            <select className="input" value={newParentId} onChange={e => setNewParentId(e.target.value)}>
              <option value="">{t("Top level")}</option>
              {locations.filter(row => row.depth < 4).map(row => (
                <option key={row.id} value={row.id}>{row.path}</option>
              ))}
            </select>
          </label>
          <button type="button" className="inventory-primary" disabled={busy || !newName.trim()} onClick={() => void addLocation()}>
            {t("Add location")}
          </button>
        </div>
      ) : null}

      {loading ? (
        <p className="inventory-note">{t("Loading…")}</p>
      ) : locations.length === 0 ? (
        <div className="inventory-empty">
          <strong>{t("No locations yet")}</strong>
          <p>{t("Items can carry any free-typed location; defining them here adds structure and safe renames.")}</p>
        </div>
      ) : (
        <ul className="inventory-location-list">
          {locations.map(location => {
            const count = countsByPath.get(location.path) ?? 0;
            const editing = editingId === location.id;
            return (
              <li key={location.id} style={{ paddingLeft: (location.depth - 1) * 22 }}>
                {editing ? (
                  <span className="inventory-panel-inline-edit">
                    <input className="input" value={editName} onChange={e => setEditName(e.target.value)} />
                    <select className="input" value={editParentId} onChange={e => setEditParentId(e.target.value)}>
                      <option value="">{t("Top level")}</option>
                      {locations
                        .filter(row => row.id !== location.id && !row.path.startsWith(`${location.path} / `) && row.depth < 4)
                        .map(row => <option key={row.id} value={row.id}>{row.path}</option>)}
                    </select>
                    <button type="button" className="inventory-link" disabled={busy} onClick={() => void saveEdit(location)}>{t("Save")}</button>
                    <button type="button" className="inventory-link" onClick={() => setEditingId("")}>{t("Cancel")}</button>
                  </span>
                ) : (
                  <>
                    <span className="inventory-location-name">
                      <strong>{location.name}</strong>
                      <span className="inventory-sub">
                        {count > 0 ? `${count} ${t("items here")}` : t("empty")}
                      </span>
                    </span>
                    {canEdit ? (
                      <span className="order-stock-actions">
                        <button
                          type="button"
                          className="inventory-link"
                          disabled={busy}
                          onClick={() => { setEditingId(location.id); setEditName(location.name); setEditParentId(location.parentId); }}
                        >{t("Rename / Move")}</button>
                        <button
                          type="button"
                          className="inventory-link inventory-link-danger"
                          disabled={busy}
                          onClick={() => void run(() => deleteInventoryLocation(workspace, location.id), "The location could not be deleted.")}
                        >{t("Delete")}</button>
                      </span>
                    ) : null}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
