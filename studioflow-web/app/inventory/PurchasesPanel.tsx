"use client";

// Purchases: the object that sits between a bank payment and a shelf.
//
// A bank row knows £2,450 left the account and went to a watch dealer. It does
// not know that this was one Rolex 1601 dial at £2,300 plus £150 of postage.
// A purchase carries that, so stock and banking can be joined by a fact rather
// than by a guess — which is why nothing here is ever created automatically
// from a bank feed.

import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import {
  INVENTORY_CATEGORIES,
  deletePurchase,
  linkPurchaseToBankTransaction,
  listPurchases,
  receivePurchase,
  savePurchase,
  type InventoryTrackingType,
  type Purchase,
  type PurchaseInput
} from "@/lib/studioflow/inventory";
import { useAuth } from "@/lib/auth/AuthProvider";
import { studioT } from "@/lib/studioflow/language";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";

type DraftLine = {
  name: string;
  category: string;
  trackingType: InventoryTrackingType;
  quantity: string;
  unit: string;
  unitPrice: string;
  reference: string;
  serialNumber: string;
  location: string;
};

type BankRow = {
  id: string;
  amount: number;
  bookingDate: string;
  description: string;
  counterparty: string;
  purchaseId: string;
  purchaseNumber: string;
};

function money(symbol: string, value: number) {
  return `${symbol}${(Number(value) || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function emptyLine(): DraftLine {
  return {
    name: "",
    category: "Other",
    trackingType: "unique",
    quantity: "1",
    unit: "",
    unitPrice: "",
    reference: "",
    serialNumber: "",
    location: ""
  };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

const num = (value: string) => {
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

export function PurchasesPanel({
  workspace,
  currencySymbol,
  canEdit,
  supplierNames,
  onStockChanged
}: {
  workspace: WorkspaceContext;
  currencySymbol: string;
  canEdit: boolean;
  supplierNames: string[];
  onStockChanged: () => void;
}) {
  const { language } = useAuth();
  const t = (text: string) => studioT(text, language);

  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [matching, setMatching] = useState<Purchase | null>(null);
  const [busyId, setBusyId] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listPurchases(workspace);
      setPurchases(result?.purchases ?? []);
    } catch (failure) {
      setNotice(failure instanceof Error ? t(failure.message) : t("Purchases could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [workspace]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function markReceived(purchase: Purchase) {
    setBusyId(purchase.id);
    setNotice("");
    try {
      const result = await receivePurchase(workspace, purchase.id);
      await reload();
      onStockChanged();
      setNotice(
        result?.received
          ? `${purchase.number} received — ${result.received} item${result.received === 1 ? "" : "s"} moved onto the shelf.`
          : `${purchase.number} was already received.`
      );
    } catch (failure) {
      setNotice(failure instanceof Error ? t(failure.message) : t("The purchase could not be received."));
    } finally {
      setBusyId("");
    }
  }

  async function removePurchase(purchase: Purchase) {
    const count = purchase.itemIds?.length || 0;
    const warning = count > 0
      ? `Delete ${purchase.number}? The ${count} incoming item${count === 1 ? "" : "s"} it created will go with it.`
      : `Delete ${purchase.number}?`;
    if (!window.confirm(warning)) return;
    setBusyId(purchase.id);
    try {
      await deletePurchase(workspace, purchase.id);
      await reload();
      onStockChanged();
      setNotice("");
    } catch (failure) {
      setNotice(failure instanceof Error ? t(failure.message) : t("The purchase could not be deleted."));
    } finally {
      setBusyId("");
    }
  }

  const totals = useMemo(() => {
    const ordered = purchases.filter(row => row.status === "ordered");
    const unmatched = purchases.filter(row => !row.bankTransactionId);
    return {
      ordered: ordered.length,
      orderedValue: ordered.reduce((sum, row) => sum + (Number(row.total) || 0), 0),
      unmatched: unmatched.length
    };
  }, [purchases]);

  return (
    <div className="inventory-panel">
      <div className="inventory-head">
        <div>
          <h2>{t("Purchases")}</h2>
          <p className="inventory-panel-hint">{t("What you bought, from whom, and what it cost — the record a bank payment gets matched to.")}</p>
        </div>
        {canEdit ? (
          <button type="button" className="inventory-primary" onClick={() => setModalOpen(true)}>
            + New Purchase
          </button>
        ) : null}
      </div>

      {purchases.length > 0 ? (
        <div className="inventory-stats inventory-stats-slim">
          <div className="inventory-stat">
            <span className="inventory-stat-label">{t("Awaiting Delivery")}</span>
            <strong>{totals.ordered}</strong>
            <span className="inventory-stat-sub">{money(currencySymbol, totals.orderedValue)}</span>
          </div>
          <div className="inventory-stat" data-tone={totals.unmatched > 0 ? "warn" : undefined}>
            <span className="inventory-stat-label">{t("No Payment Matched")}</span>
            <strong>{totals.unmatched}</strong>
          </div>
        </div>
      ) : null}

      {notice ? <p className="inventory-notice">{notice}</p> : null}

      {loading ? (
        <p className="inventory-note">{t("Loading purchases…")}</p>
      ) : purchases.length === 0 ? (
        <div className="inventory-empty">
          <strong>{t("No purchases yet")}</strong>
          <p>
            Record what you buy here and the stock is created for you — held as
            incoming until you mark it received.
          </p>
        </div>
      ) : (
        <div className="inventory-table-wrap">
          <table className="inventory-table">
            <thead>
              <tr>
                <th>{t("Purchase")}</th>
                <th>{t("Supplier")}</th>
                <th>{t("Date")}</th>
                <th>{t("Items")}</th>
                <th className="r">{t("Total")}</th>
                <th>{t("Status")}</th>
                <th>{t("Payment")}</th>
                {canEdit ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {purchases.map(purchase => (
                <tr key={purchase.id}>
                  <td>
                    <strong>{purchase.number}</strong>
                    {purchase.reference ? <span className="inventory-sub">{purchase.reference}</span> : null}
                  </td>
                  <td>{purchase.supplierName || "—"}</td>
                  <td>{purchase.purchaseDate || "—"}</td>
                  <td>
                    {purchase.lines?.length || 0}
                    {purchase.shipping > 0 || purchase.otherCosts > 0 ? (
                      <span className="inventory-sub">
                        + {money(currencySymbol, (purchase.shipping || 0) + (purchase.otherCosts || 0))} costs
                      </span>
                    ) : null}
                  </td>
                  <td className="r">{money(currencySymbol, purchase.total)}</td>
                  <td>
                    <span className="inventory-chip" data-status={purchase.status === "received" ? "available" : "incoming"}>
                      {purchase.status === "received" ? t("Received") : t("Ordered")}
                    </span>
                  </td>
                  <td>
                    {purchase.bankTransactionId ? (
                      <span className="inventory-chip" data-status="available">{t("Matched")}</span>
                    ) : canEdit ? (
                      <button type="button" className="inventory-link" onClick={() => setMatching(purchase)}>{t("Match payment")}</button>
                    ) : (
                      <span className="inventory-sub">{t("Not matched")}</span>
                    )}
                  </td>
                  {canEdit ? (
                    <td className="inventory-row-actions">
                      {purchase.status === "ordered" ? (
                        <>
                          <button
                            type="button"
                            className="inventory-link"
                            disabled={busyId === purchase.id}
                            onClick={() => void markReceived(purchase)}
                          >{t("Mark received")}</button>
                          <button
                            type="button"
                            className="inventory-link inventory-link-danger"
                            disabled={busyId === purchase.id}
                            onClick={() => void removePurchase(purchase)}
                          >{t("Delete")}</button>
                        </>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen ? (
        <NewPurchaseModal
          workspace={workspace}
          currencySymbol={currencySymbol}
          supplierNames={supplierNames}
          onClose={() => setModalOpen(false)}
          onSaved={async () => {
            setModalOpen(false);
            await reload();
            onStockChanged();
          }}
        />
      ) : null}

      {matching ? (
        <MatchPaymentModal
          workspace={workspace}
          purchase={matching}
          currencySymbol={currencySymbol}
          onClose={() => setMatching(null)}
          onMatched={async () => {
            setMatching(null);
            await reload();
          }}
        />
      ) : null}
    </div>
  );
}

function NewPurchaseModal({
  workspace,
  currencySymbol,
  supplierNames,
  onClose,
  onSaved
}: {
  workspace: WorkspaceContext;
  currencySymbol: string;
  supplierNames: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { language } = useAuth();
  const t = (text: string) => studioT(text, language);
  const [supplierName, setSupplierName] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(today());
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [shipping, setShipping] = useState("");
  const [otherCosts, setOtherCosts] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const goods = useMemo(
    () => lines.reduce((sum, line) => sum + num(line.unitPrice) * num(line.quantity), 0),
    [lines]
  );
  const extras = num(shipping) + num(otherCosts);
  const total = goods + extras;

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setLines(current => current.map((line, position) => {
      if (position !== index) return line;
      const next = { ...line, ...patch };
      // A unique object is one thing by definition; the quantity box would only
      // invite a number that cannot be true.
      if (patch.trackingType === "unique") next.quantity = "1";
      return next;
    }));
  }

  async function submit() {
    const usable = lines.filter(line => line.name.trim() && num(line.quantity) > 0);
    if (usable.length === 0) {
      setError(t("Add at least one line with a name and a quantity."));
      return;
    }
    setSaving(true);
    setError("");
    const payload: PurchaseInput = {
      supplierName: supplierName.trim(),
      purchaseDate,
      reference: reference.trim(),
      notes: notes.trim(),
      shipping: num(shipping),
      otherCosts: num(otherCosts),
      lines: usable.map(line => ({
        name: line.name.trim(),
        category: line.category,
        trackingType: line.trackingType,
        quantity: num(line.quantity),
        unit: line.unit.trim(),
        unitPrice: num(line.unitPrice),
        reference: line.reference.trim(),
        serialNumber: line.serialNumber.trim(),
        location: line.location.trim()
      }))
    };
    try {
      await savePurchase(workspace, payload);
      onSaved();
    } catch (failure) {
      setError(failure instanceof Error ? t(failure.message) : t("The purchase could not be saved."));
      setSaving(false);
    }
  }

  return (
    <div className="inventory-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="inventory-modal inventory-modal-wide"
        role="dialog"
        aria-modal="true"
        aria-label={t("New purchase")}
        onClick={event => event.stopPropagation()}
      >
        <div className="inventory-modal-head">
          <h2>{t("New Purchase")}</h2>
          <button type="button" className="inventory-modal-close" onClick={onClose} aria-label={t("Close")}>×</button>
        </div>

        <div className="inventory-modal-body">
          <div className="inventory-form">
            <label className="inventory-field">
              <span>{t("Supplier")}</span>
              <input
                className="input"
                list="purchase-suppliers"
                value={supplierName}
                onChange={event => setSupplierName(event.target.value)}
                placeholder={t("Who you bought from")}
              />
              <datalist id="purchase-suppliers">
                {supplierNames.map(name => <option key={name} value={name} />)}
              </datalist>
            </label>
            <label className="inventory-field">
              <span>{t("Purchase date")}</span>
              <input className="input" type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} />
            </label>
            <label className="inventory-field">
              <span>{t("Invoice / order reference")}</span>
              <input className="input" value={reference} onChange={e => setReference(e.target.value)} />
            </label>
          </div>

          <div className="inventory-section">
            <div className="inventory-section-head">
              <h3>{t("Items")}</h3>
              <button type="button" className="inventory-link" onClick={() => setLines(current => [...current, emptyLine()])}>
                + Add line
              </button>
            </div>

            {lines.map((line, index) => (
              <div className="inventory-line" key={index}>
                <div className="inventory-line-head">
                  <span className="inventory-line-number">{index + 1}</span>
                  <div className="inventory-toggle inventory-toggle-small">
                    <button
                      type="button"
                      data-active={line.trackingType === "unique"}
                      onClick={() => updateLine(index, { trackingType: "unique" })}
                    >{t("Unique")}</button>
                    <button
                      type="button"
                      data-active={line.trackingType === "quantity"}
                      onClick={() => updateLine(index, { trackingType: "quantity" })}
                    >{t("Quantity")}</button>
                  </div>
                  {lines.length > 1 ? (
                    <button
                      type="button"
                      className="inventory-link inventory-link-danger"
                      onClick={() => setLines(current => current.filter((_, position) => position !== index))}
                    >{t("Remove")}</button>
                  ) : null}
                </div>

                <div className="inventory-form">
                  <label className="inventory-field is-wide">
                    <span>{t("Item")}</span>
                    <input
                      className="input"
                      value={line.name}
                      onChange={e => updateLine(index, { name: e.target.value })}
                      placeholder={line.trackingType === "unique" ? t("Rolex 1601 silver dial") : t("Dial feet solder")}
                    />
                  </label>
                  <label className="inventory-field">
                    <span>{t("Category")}</span>
                    <select className="input" value={line.category} onChange={e => updateLine(index, { category: e.target.value })}>
                      {INVENTORY_CATEGORIES.map(category => <option key={category} value={category}>{t(category)}</option>)}
                    </select>
                  </label>
                  {line.trackingType === "quantity" ? (
                    <>
                      <label className="inventory-field">
                        <span>{t("Quantity")}</span>
                        <input className="input" inputMode="decimal" value={line.quantity} onChange={e => updateLine(index, { quantity: e.target.value })} />
                      </label>
                      <label className="inventory-field">
                        <span>{t("Unit")}</span>
                        <input className="input" value={line.unit} onChange={e => updateLine(index, { unit: e.target.value })} placeholder={t("pcs, ml, g")} />
                      </label>
                    </>
                  ) : (
                    <>
                      <label className="inventory-field">
                        <span>{t("Reference")}</span>
                        <input className="input" value={line.reference} onChange={e => updateLine(index, { reference: e.target.value })} />
                      </label>
                      <label className="inventory-field">
                        <span>{t("Serial number")}</span>
                        <input className="input" value={line.serialNumber} onChange={e => updateLine(index, { serialNumber: e.target.value })} />
                      </label>
                    </>
                  )}
                  <label className="inventory-field">
                    <span>{line.trackingType === "unique" ? t("Purchase price") : t("Price per unit")}</span>
                    <input className="input" inputMode="decimal" value={line.unitPrice} onChange={e => updateLine(index, { unitPrice: e.target.value })} placeholder="0.00" />
                  </label>
                  <label className="inventory-field">
                    <span>{t("Location")}</span>
                    <input className="input" value={line.location} onChange={e => updateLine(index, { location: e.target.value })} placeholder={t("Safe, drawer 3")} />
                  </label>
                </div>
              </div>
            ))}
          </div>

          <div className="inventory-section">
            <h3>{t("Shipping and fees")}</h3>
            <p className="inventory-hint">
              Kept out of the item prices on purpose. Each item&apos;s purchase price stays exactly what
              you paid for the goods, and its share of these costs is recorded separately against it.
            </p>
            <div className="inventory-form">
              <label className="inventory-field">
                <span>{t("Shipping")}</span>
                <input className="input" inputMode="decimal" value={shipping} onChange={e => setShipping(e.target.value)} placeholder="0.00" />
              </label>
              <label className="inventory-field">
                <span>{t("Other costs")}</span>
                <input className="input" inputMode="decimal" value={otherCosts} onChange={e => setOtherCosts(e.target.value)} placeholder={t("Import duty, fees")} />
              </label>
            </div>
          </div>

          <div className="inventory-totals">
            <div><span>{t("Goods")}</span><strong>{money(currencySymbol, goods)}</strong></div>
            <div><span>{t("Shipping and fees")}</span><strong>{money(currencySymbol, extras)}</strong></div>
            <div className="inventory-totals-final"><span>{t("Purchase total")}</span><strong>{money(currencySymbol, total)}</strong></div>
          </div>

          <label className="inventory-field">
            <span>{t("Notes")}</span>
            <textarea className="input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </label>

          {error ? <p className="inventory-error">{error}</p> : null}
        </div>

        <div className="inventory-modal-foot">
          <p className="inventory-hint">
            The items are created as <strong>incoming</strong> — they become available stock when you mark
            the purchase received.
          </p>
          <div className="inventory-modal-actions">
            <button type="button" className="inventory-secondary" onClick={onClose}>{t("Cancel")}</button>
            <button type="button" className="inventory-primary" disabled={saving} onClick={() => void submit()}>
              {saving ? t("Saving…") : t("Save purchase")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MatchPaymentModal({
  workspace,
  purchase,
  currencySymbol,
  onClose,
  onMatched
}: {
  workspace: WorkspaceContext;
  purchase: Purchase;
  currencySymbol: string;
  onClose: () => void;
  onMatched: () => void;
}) {
  const { language } = useAuth();
  const t = (text: string) => studioT(text, language);
  const [rows, setRows] = useState<BankRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(
          query(collection(db, "companies", workspace.id, "bankTransactions"), orderBy("bookingDate", "desc"))
        );
        if (cancelled) return;
        const all = snap.docs.map(doc => {
          const data = doc.data() as Record<string, unknown>;
          return {
            id: doc.id,
            amount: Number(data.amount) || 0,
            bookingDate: String(data.bookingDate || ""),
            description: String(data.description || ""),
            counterparty: String(data.counterparty || ""),
            purchaseId: String(data.purchaseId || ""),
            purchaseNumber: String(data.purchaseNumber || "")
          };
        });
        // Money out only, and nothing already spoken for by another purchase.
        setRows(all.filter(row => row.amount < 0 && (!row.purchaseId || row.purchaseId === purchase.id)));
      } catch {
        if (!cancelled) setError(t("The bank feed could not be read. Connect a bank account first."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [workspace.id, purchase.id]);

  // Closest amount first: the row you want is almost always the one that matches
  // the total, and scrolling a year of statements to find it is the whole chore.
  const ranked = useMemo(() => {
    const target = Number(purchase.total) || 0;
    return [...rows]
      .sort((a, b) => Math.abs(Math.abs(a.amount) - target) - Math.abs(Math.abs(b.amount) - target))
      .slice(0, 40);
  }, [rows, purchase.total]);

  async function match(transactionId: string) {
    setBusy(transactionId || "clear");
    setError("");
    try {
      const result = await linkPurchaseToBankTransaction(workspace, purchase.id, transactionId);
      if (result?.linked && Math.abs(result.difference || 0) > 0.009) {
        const paid = money(currencySymbol, result.paid || 0);
        const due = money(currencySymbol, result.purchaseTotal || 0);
        window.alert(`Matched, but the amounts differ: paid ${paid} against a purchase of ${due}. If this was a deposit or a part payment that is fine — otherwise check the purchase.`);
      }
      onMatched();
    } catch (failure) {
      setError(failure instanceof Error ? t(failure.message) : t("The payment could not be matched."));
      setBusy("");
    }
  }

  return (
    <div className="inventory-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="inventory-modal" role="dialog" aria-modal="true" aria-label={t("Match payment")} onClick={e => e.stopPropagation()}>
        <div className="inventory-modal-head">
          <h2>{t("Match a payment")}</h2>
          <button type="button" className="inventory-modal-close" onClick={onClose} aria-label={t("Close")}>×</button>
        </div>
        <div className="inventory-modal-body">
          <p className="inventory-hint">
            {purchase.number} · {purchase.supplierName || "No supplier"} · <strong>{money(currencySymbol, purchase.total)}</strong>
          </p>

          {loading ? (
            <p className="inventory-note">{t("Reading the bank feed…")}</p>
          ) : ranked.length === 0 ? (
            <p className="inventory-note">{t("No unmatched money-out transactions to choose from.")}</p>
          ) : (
            <div className="inventory-match-list">
              {ranked.map(row => {
                const paid = Math.abs(row.amount);
                const gap = Math.round((paid - (Number(purchase.total) || 0)) * 100) / 100;
                return (
                  <button
                    key={row.id}
                    type="button"
                    className="inventory-match-row"
                    data-exact={Math.abs(gap) < 0.01}
                    disabled={busy !== ""}
                    onClick={() => void match(row.id)}
                  >
                    <span className="inventory-match-main">
                      <strong>{row.counterparty || row.description || "Transaction"}</strong>
                      <span className="inventory-sub">{row.bookingDate}</span>
                    </span>
                    <span className="inventory-match-amount">
                      <strong>{money(currencySymbol, paid)}</strong>
                      {Math.abs(gap) < 0.01 ? (
                        <span className="inventory-sub">{t("Exact match")}</span>
                      ) : (
                        <span className="inventory-sub">{gap > 0 ? "+" : ""}{money(currencySymbol, gap)}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {error ? <p className="inventory-error">{error}</p> : null}
        </div>
        <div className="inventory-modal-foot">
          {purchase.bankTransactionId ? (
            <button type="button" className="inventory-link inventory-link-danger" disabled={busy !== ""} onClick={() => void match("")}>{t("Unlink current payment")}</button>
          ) : <span />}
          <div className="inventory-modal-actions">
            <button type="button" className="inventory-secondary" onClick={onClose}>{t("Close")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
