"use client";

// Suppliers. The totals here are counted from the purchases every time they are
// asked for, not stored on the supplier, so they cannot quietly drift away from
// what was actually bought.
//
// A name that appears on a purchase but has no card of its own is still listed.
// The buying is what makes a supplier real; the card is just extra detail.

import { useCallback, useEffect, useState } from "react";
import { listSuppliers, saveSupplier, type Supplier } from "@/lib/studioflow/inventory";
import { useAuth } from "@/lib/auth/AuthProvider";
import { studioT } from "@/lib/studioflow/language";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";

function money(symbol: string, value: number) {
  return `${symbol}${(Number(value) || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

export function SuppliersPanel({
  workspace,
  currencySymbol,
  canEdit,
  onChanged
}: {
  workspace: WorkspaceContext;
  currencySymbol: string;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const { language } = useAuth();
  const t = (text: string) => studioT(text, language);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [creating, setCreating] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listSuppliers(workspace);
      const rows = result?.suppliers ?? [];
      setSuppliers([...rows].sort((a, b) => (b.stats?.total || 0) - (a.stats?.total || 0)));
    } catch (failure) {
      setNotice(failure instanceof Error ? t(failure.message) : t("Suppliers could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [workspace]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div className="inventory-panel">
      <div className="inventory-head">
        <div>
          <h2>{t("Suppliers")}</h2>
          <p className="inventory-panel-hint">{t("Who you buy from, and what you have spent with each of them.")}</p>
        </div>
        {canEdit ? (
          <button type="button" className="inventory-primary" onClick={() => setCreating(true)}>
            + New Supplier
          </button>
        ) : null}
      </div>

      {notice ? <p className="inventory-notice">{notice}</p> : null}

      {loading ? (
        <p className="inventory-note">{t("Loading suppliers…")}</p>
      ) : suppliers.length === 0 ? (
        <div className="inventory-empty">
          <strong>{t("No suppliers yet")}</strong>
          <p>{t("Suppliers appear here as soon as you record a purchase from them.")}</p>
        </div>
      ) : (
        <div className="inventory-supplier-grid">
          {suppliers.map(supplier => (
            <div className="inventory-supplier" key={supplier.id || supplier.name}>
              <div className="inventory-supplier-head">
                <strong>{supplier.name}</strong>
                {canEdit ? (
                  <button type="button" className="inventory-link" onClick={() => setEditing(supplier)}>
                    {supplier.implied ? t("Add details") : t("Edit")}
                  </button>
                ) : null}
              </div>
              {supplier.email || supplier.phone ? (
                <p className="inventory-sub">{[supplier.email, supplier.phone].filter(Boolean).join(" · ")}</p>
              ) : null}
              <div className="inventory-supplier-stats">
                <div>
                  <span>{t("Spent")}</span>
                  <strong>{money(currencySymbol, supplier.stats?.total || 0)}</strong>
                </div>
                <div>
                  <span>{t("Purchases")}</span>
                  <strong>{supplier.stats?.count || 0}</strong>
                </div>
                <div>
                  <span>{t("Items")}</span>
                  <strong>{supplier.stats?.lines || 0}</strong>
                </div>
                <div>
                  <span>{t("Last")}</span>
                  <strong>{supplier.stats?.lastDate || "—"}</strong>
                </div>
              </div>
              {supplier.stats?.count > 0 && supplier.stats.matched < supplier.stats.count ? (
                <p className="inventory-sub inventory-sub-warn">
                  {supplier.stats.count - supplier.stats.matched} purchase
                  {supplier.stats.count - supplier.stats.matched === 1 ? "" : "s"} with no payment matched
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {editing || creating ? (
        <SupplierModal
          workspace={workspace}
          supplier={editing}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={async () => {
            setEditing(null);
            setCreating(false);
            await reload();
            onChanged();
          }}
        />
      ) : null}
    </div>
  );
}

function SupplierModal({
  workspace,
  supplier,
  onClose,
  onSaved
}: {
  workspace: WorkspaceContext;
  supplier: Supplier | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { language } = useAuth();
  const t = (text: string) => studioT(text, language);
  const [name, setName] = useState(supplier?.name || "");
  const [email, setEmail] = useState(supplier?.email || "");
  const [phone, setPhone] = useState(supplier?.phone || "");
  const [website, setWebsite] = useState(supplier?.website || "");
  const [notes, setNotes] = useState(supplier?.notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!name.trim()) {
      setError("A supplier name is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await saveSupplier(
        workspace,
        { name: name.trim(), email: email.trim(), phone: phone.trim(), website: website.trim(), notes: notes.trim() },
        supplier?.id || undefined
      );
      onSaved();
    } catch (failure) {
      setError(failure instanceof Error ? t(failure.message) : t("The supplier could not be saved."));
      setSaving(false);
    }
  }

  return (
    <div className="inventory-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="inventory-modal" role="dialog" aria-modal="true" aria-label={t("Supplier")} onClick={e => e.stopPropagation()}>
        <div className="inventory-modal-head">
          <h2>{supplier && !supplier.implied ? t("Edit supplier") : t("New supplier")}</h2>
          <button type="button" className="inventory-modal-close" onClick={onClose} aria-label={t("Close")}>×</button>
        </div>
        <div className="inventory-modal-body">
          <div className="inventory-form">
            <label className="inventory-field is-wide">
              <span>{t("Name")}</span>
              <input className="input" value={name} onChange={e => setName(e.target.value)} />
            </label>
            <label className="inventory-field">
              <span>{t("Email")}</span>
              <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} />
            </label>
            <label className="inventory-field">
              <span>{t("Phone")}</span>
              <input className="input" value={phone} onChange={e => setPhone(e.target.value)} />
            </label>
            <label className="inventory-field is-wide">
              <span>{t("Website")}</span>
              <input className="input" value={website} onChange={e => setWebsite(e.target.value)} />
            </label>
          </div>
          <label className="inventory-field">
            <span>{t("Notes")}</span>
            <textarea className="input" rows={3} value={notes} onChange={e => setNotes(e.target.value)} />
          </label>
          {error ? <p className="inventory-error">{error}</p> : null}
        </div>
        <div className="inventory-modal-foot">
          <span />
          <div className="inventory-modal-actions">
            <button type="button" className="inventory-secondary" onClick={onClose}>{t("Cancel")}</button>
            <button type="button" className="inventory-primary" disabled={saving} onClick={() => void submit()}>
              {saving ? t("Saving…") : t("Save supplier")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
