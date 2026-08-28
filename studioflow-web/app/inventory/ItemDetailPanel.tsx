"use client";

// The right-hand item panel: everything one item knows about itself, in one
// place. The list answers "what do we have"; this answers "what is THIS —
// where did it come from, what is it promised to, what happened to it".
//
// Every fact drawn here already lives on the servers the module ships with:
// the item doc, the movement ledger, the purchase doc and (for owners) the
// matched bank transaction. The panel joins them client-side and never writes
// anything the existing callables would not.

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePrivateMoney } from "@/components/PricePrivacy";
import QRCode from "qrcode";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { studioT } from "@/lib/studioflow/language";
import {
  inventoryFreeToReserve,
  inventoryItemToInput,
  inventoryLineValue,
  inventoryOnHand,
  inventoryPhotoUrl,
  isInventoryLowStock,
  listInventoryMovements,
  recordInventoryLoss,
  releaseInventoryFromOrder,
  reserveInventoryForOrder,
  saveInventoryItem,
  setInventoryItemStatus,
  type InventoryItem,
  type InventoryLossKind,
  type InventoryMovement,
  type InventoryStatus
} from "@/lib/studioflow/inventory";
import { loadWorkspaceOrderOptions, type OrderOptionItem, type WorkspaceContext } from "@/lib/studioflow/firestore";
import { libraryFileUrl, listLibraryFiles, type LibraryFile } from "@/lib/studioflow/filesLibrary";

type PanelTab = "details" | "history" | "purchases" | "photos" | "files";

// Mirrors the server's STATUS_TRANSITIONS so buttons that would be refused are
// not offered. (functions/inventory.js — sold can only be archived, etc.)
// The server's STATUS_TRANSITIONS verbatim, minus "reserved" as a target —
// reserving must go through reserveInventoryForOrder, never a bare flip.
const STATUS_NEXT: Record<InventoryStatus, InventoryStatus[]> = {
  available: ["used", "sold", "incoming", "archived"],
  reserved: ["available", "used", "sold", "archived"],
  partiallyReserved: ["available", "used", "sold", "archived"],
  incoming: ["available", "archived"],
  used: ["available", "archived"],
  sold: ["archived"],
  removed: ["available", "archived"],
  archived: ["available"]
};

const KIND_LABEL: Record<string, string> = {
  openingStock: "Opening stock",
  purchase: "Purchase",
  adjustment: "Adjustment",
  stocktake: "Stocktake",
  used: "Used",
  sold: "Sold",
  removed: "Removed",
  moved: "Moved",
  returned: "Returned to supplier",
  damaged: "Damaged",
  lost: "Lost",
  wastage: "Wastage"
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

type PurchaseJoin = {
  number: string;
  supplierName: string;
  purchaseDate: string;
  total: number;
  bankTransactionId: string;
};

type BankTxJoin = {
  descriptionOrCounterparty: string;
  receiptPath: string;
  receiptName: string;
};

export function ItemDetailPanel({
  workspace,
  item,
  currencySymbol,
  canEdit,
  onClose,
  onChanged,
  onEdit,
  onPrintLabel,
  onManagePhotos
}: {
  workspace: WorkspaceContext;
  item: InventoryItem;
  currencySymbol: string;
  canEdit: boolean;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
  onEdit: (item: InventoryItem) => void;
  onPrintLabel: (item: InventoryItem) => void;
  onManagePhotos: (item: InventoryItem) => void;
}) {
  const money = usePrivateMoney();
  const { language, user } = useAuth();
  const t = useCallback((text: string) => studioT(text, language), [language]);

  const [tab, setTab] = useState<PanelTab>("details");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [qrSvg, setQrSvg] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[] | null>(null);
  const [purchase, setPurchase] = useState<PurchaseJoin | null | "none">(null);
  const [bankTx, setBankTx] = useState<BankTxJoin | null>(null);
  const [reserveOpen, setReserveOpen] = useState(false);
  const [libraryFiles, setLibraryFiles] = useState<LibraryFile[] | null>(null);
  const [movingLocation, setMovingLocation] = useState(false);
  const [locationDraft, setLocationDraft] = useState(item.location || "");
  const [lossOpen, setLossOpen] = useState(false);
  const [lossKind, setLossKind] = useState<InventoryLossKind>("damaged");
  const [lossQty, setLossQty] = useState("1");
  const [lossNote, setLossNote] = useState("");

  useEffect(() => {
    setTab("details");
    setError("");
    setMovements(null);
    setPurchase(null);
    setBankTx(null);
    setLibraryFiles(null);
    setMovingLocation(false);
    setLocationDraft(item.location || "");
  }, [item.id]);

  // QR — same content contract as the printable label: just the number.
  useEffect(() => {
    let cancelled = false;
    QRCode.toString(item.number || item.id, { type: "svg", margin: 0, errorCorrectionLevel: "M" })
      .then(svg => { if (!cancelled) setQrSvg(svg); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [item.number, item.id]);

  // Photos resolve lazily: paths are permanent, URLs are not.
  useEffect(() => {
    let cancelled = false;
    const paths = (item.photos || []).slice(0, 12);
    Promise.all(paths.map(path => inventoryPhotoUrl(path).catch(() => "")))
      .then(urls => { if (!cancelled) setPhotoUrls(urls.filter(Boolean)); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [item.photos]);

  // History loads when its tab is first opened.
  useEffect(() => {
    if (tab !== "history" || movements !== null) return;
    let cancelled = false;
    listInventoryMovements(workspace, item.id)
      .then(result => { if (!cancelled) setMovements(result?.movements ?? []); })
      .catch(() => { if (!cancelled) setMovements([]); });
    return () => { cancelled = true; };
  }, [tab, movements, workspace, item.id]);

  // Library files linked to this item, loaded when the tab is first opened.
  useEffect(() => {
    if (tab !== "files" || libraryFiles !== null) return;
    let cancelled = false;
    listLibraryFiles(workspace, { linkKey: `inventoryItem:${item.id}` })
      .then(result => { if (!cancelled) setLibraryFiles(result.files ?? []); })
      .catch(() => { if (!cancelled) setLibraryFiles([]); });
    return () => { cancelled = true; };
  }, [tab, libraryFiles, workspace, item.id]);

  // Purchase join: the item names its purchase; the purchase names its bank
  // transaction; the transaction (readable to owners / bankFeed members)
  // carries the receipt. Each hop failing quietly narrows what is shown —
  // a member without bank access sees "Matched" and nothing more, which is
  // correct, not a bug.
  useEffect(() => {
    let cancelled = false;
    if (!item.purchaseId) {
      setPurchase("none");
      return;
    }
    (async () => {
      try {
        const snap = await getDoc(doc(db, "companies", workspace.id, "purchases", item.purchaseId as string));
        if (cancelled) return;
        if (!snap.exists()) { setPurchase("none"); return; }
        const data = snap.data() || {};
        const join: PurchaseJoin = {
          number: String(data.number || item.purchaseNumber || ""),
          supplierName: String(data.supplierName || ""),
          purchaseDate: String(data.purchaseDate || ""),
          total: Number(data.total) || 0,
          bankTransactionId: String(data.bankTransactionId || "")
        };
        setPurchase(join);
        if (join.bankTransactionId) {
          try {
            const txSnap = await getDoc(doc(db, "companies", workspace.id, "bankTransactions", join.bankTransactionId));
            if (!cancelled && txSnap.exists()) {
              const tx = txSnap.data() || {};
              setBankTx({
                descriptionOrCounterparty: String(tx.counterparty || tx.description || ""),
                receiptPath: String(tx.receiptPath || ""),
                receiptName: String(tx.receiptName || "")
              });
            }
          } catch {
            /* no bankFeed permission — the bare Matched chip is the whole story */
          }
        }
      } catch {
        if (!cancelled) setPurchase("none");
      }
    })();
    return () => { cancelled = true; };
  }, [workspace.id, item.purchaseId, item.purchaseNumber]);

  const reservations = useMemo(() => {
    const rows = (item.reservations || []).filter(row => row && row.orderId);
    // Items reserved before the reservations array existed carry only
    // reservedForOrderId; show the link rather than an empty card.
    if (rows.length === 0 && item.reservedForOrderId) {
      return [{ orderId: item.reservedForOrderId, quantity: 1, createdAtMs: 0 }];
    }
    return rows;
  }, [item.reservations, item.reservedForOrderId]);

  async function run(action: () => Promise<unknown>, failText: string) {
    setBusy(true);
    setError("");
    try {
      await action();
      await onChanged();
    } catch (failure) {
      setError(failure instanceof Error ? t(failure.message) : t(failText));
    } finally {
      setBusy(false);
    }
  }

  async function openReceipt() {
    if (!bankTx?.receiptPath) return;
    try {
      const url = await inventoryPhotoUrl(bankTx.receiptPath);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      // Receipt files are owner-only in storage; a member's click lands here.
      setError(t("The receipt file is only accessible to the workspace owner."));
    }
  }

  function duplicateItem() {
    // A fresh identity: the server assigns a new INV number; the serial is the
    // one thing that must never travel to a second object.
    onEdit({
      ...item,
      id: "",
      number: "",
      serialNumber: "",
      photos: [],
      reservations: [],
      reservedOrderIds: [],
      reservedForOrderId: "",
      purchaseId: "",
      purchaseNumber: "",
      status: "available"
    });
  }

  const statusPill = (
    <span className={`inventory-status is-${item.status}`}>
      {isInventoryLowStock(item) && item.status === "available" ? t("Low Stock") : t(STATUS_LABEL[item.status] ?? item.status)}
    </span>
  );

  return (
    <aside className="inventory-panel" aria-label={t("Item details")}>
      <div className="inventory-panel-head">
        <div>
          <h2>{item.name}</h2>
          <span className="inventory-sub">{item.number}</span>
        </div>
        <div className="inventory-panel-head-right">
          {statusPill}
          <button type="button" className="inventory-modal-close" onClick={onClose} aria-label={t("Close")}>×</button>
        </div>
      </div>

      <div className="inventory-panel-tabs" role="tablist">
        {([
          { key: "details" as const, label: "Details" },
          { key: "history" as const, label: "History" },
          { key: "purchases" as const, label: "Purchases" },
          { key: "photos" as const, label: "Photos" },
          { key: "files" as const, label: "Files" }
        ]).map(entry => (
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

      {error ? <p className="inventory-notice">{error}</p> : null}

      {tab === "details" ? (
        <div className="inventory-panel-body">
          {photoUrls.length > 0 ? (
            <div className="inventory-panel-gallery">
              {photoUrls.slice(0, 4).map((url, index) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={index} src={url} alt="" onClick={() => onManagePhotos(item)} />
              ))}
            </div>
          ) : null}

          <section className="inventory-panel-card">
            <header>
              <strong>{t("Linked Records")}</strong>
            </header>
            {/* Report §7: every operational connection in one card — purchase,
                supplier, bank and order — not the order alone. */}
            <dl className="inventory-panel-grid">
              {purchase && purchase !== "none" && purchase.number ? (
                <><dt>{t("Purchase")}</dt><dd>{purchase.number}</dd></>
              ) : null}
              {(purchase && purchase !== "none" && purchase.supplierName) || item.supplierName ? (
                <><dt>{t("Supplier")}</dt><dd>{(purchase !== "none" && purchase?.supplierName) || item.supplierName}</dd></>
              ) : null}
              {purchase && purchase !== "none" ? (
                <>
                  <dt>{t("Bank Transaction")}</dt>
                  <dd>
                    {purchase.bankTransactionId
                      ? <span className="inventory-status is-available">{t("Matched")} ✓</span>
                      : <span className="inventory-sub">{t("Not matched")}</span>}
                  </dd>
                </>
              ) : null}
            </dl>
            {reservations.length > 0 ? (
              <ul className="inventory-panel-list">
                {reservations.map(row => (
                  <li key={row.orderId}>
                    <a href={`/orders?order=${row.orderId}`}>{t("Order")} {row.orderId.slice(0, 8)}…</a>
                    {item.trackingType === "quantity" ? ` · ${row.quantity}${item.quantity?.unit ? ` ${item.quantity.unit}` : ""}` : ""}
                    {canEdit ? (
                      <button
                        type="button"
                        className="inventory-link"
                        disabled={busy}
                        onClick={() => void run(
                          () => releaseInventoryFromOrder(workspace, item.id, row.orderId),
                          "The item could not be released."
                        )}
                      >
                        {t("Release")}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <>
                <p className="inventory-sub">{t("Not linked to any order")}</p>
                {canEdit && inventoryFreeToReserve(item) > 0 ? (
                  <button type="button" className="inventory-secondary" onClick={() => setReserveOpen(true)}>
                    {t("Reserve for Order")}
                  </button>
                ) : null}
              </>
            )}
          </section>

          <section className="inventory-panel-card">
            <header><strong>{t("Basic Information")}</strong></header>
            <dl className="inventory-panel-grid">
              <dt>{t("Category")}</dt><dd>{t(item.category)}</dd>
              {item.brand ? <><dt>{t("Brand")}</dt><dd>{item.brand}</dd></> : null}
              {item.model ? <><dt>{t("Model")}</dt><dd>{item.model}</dd></> : null}
              {item.reference ? <><dt>{t("Reference")}</dt><dd>{item.reference}</dd></> : null}
              {item.serialNumber ? <><dt>{t("Serial Number")}</dt><dd>{item.serialNumber}</dd></> : null}
              {item.sku ? <><dt>{t("SKU")}</dt><dd>{item.sku}</dd></> : null}
              {item.year ? <><dt>{t("Year")}</dt><dd>{item.year}</dd></> : null}
              {item.condition ? <><dt>{t("Condition")}</dt><dd>{item.condition}</dd></> : null}
            </dl>
            {item.description ? <p className="inventory-sub">{item.description}</p> : null}
          </section>

          <section className="inventory-panel-card">
            <header><strong>{t("Purchase Info")}</strong></header>
            {purchase === null && item.purchaseId ? (
              <p className="inventory-sub">{t("Loading…")}</p>
            ) : purchase && purchase !== "none" ? (
              <dl className="inventory-panel-grid">
                {purchase.supplierName ? <><dt>{t("Supplier")}</dt><dd>{purchase.supplierName}</dd></> : null}
                {purchase.number ? <><dt>{t("Purchase")}</dt><dd>{purchase.number}</dd></> : null}
                {purchase.purchaseDate ? <><dt>{t("Purchase date")}</dt><dd>{purchase.purchaseDate}</dd></> : null}
                <dt>{t("Purchase price")}</dt><dd>{money(currencySymbol, item.purchasePrice)}</dd>
                <dt>{t("Bank Transaction")}</dt>
                <dd>
                  {purchase.bankTransactionId
                    ? <span className="inventory-status is-available">{t("Matched")} ✓</span>
                    : <span className="inventory-sub">{t("Not matched")}</span>}
                </dd>
                {bankTx?.receiptPath ? (
                  <>
                    <dt>{t("Receipt")}</dt>
                    <dd>
                      <button type="button" className="inventory-link" onClick={() => void openReceipt()}>
                        {bankTx.receiptName || t("View")}
                      </button>
                    </dd>
                  </>
                ) : null}
              </dl>
            ) : (
              <dl className="inventory-panel-grid">
                {item.supplierName ? <><dt>{t("Supplier")}</dt><dd>{item.supplierName}</dd></> : null}
                {item.purchaseDate ? <><dt>{t("Purchase date")}</dt><dd>{item.purchaseDate}</dd></> : null}
                <dt>{t("Purchase price")}</dt><dd>{money(currencySymbol, item.purchasePrice)}</dd>
                <dt>{t("Bank Transaction")}</dt>
                <dd><span className="inventory-sub">{t("No purchase recorded")}</span></dd>
              </dl>
            )}
          </section>

          <section className="inventory-panel-card">
            <header><strong>{t("Inventory Details")}</strong></header>
            <dl className="inventory-panel-grid">
              <dt>{t("Tracking Type")}</dt>
              <dd>{item.trackingType === "unique" ? t("Unique Item") : t("Quantity Item")}</dd>
              <dt>{t("On Hand")}</dt>
              <dd>{inventoryOnHand(item)}{item.trackingType === "quantity" && item.quantity?.unit ? ` ${item.quantity.unit}` : ""}</dd>
              <dt>{t("Location")}</dt>
              <dd>
                {movingLocation ? (
                  <span className="inventory-panel-inline-edit">
                    <input
                      className="input"
                      value={locationDraft}
                      onChange={event => setLocationDraft(event.target.value)}
                      placeholder={t("Safe A, Drawer 3…")}
                    />
                    <button
                      type="button"
                      className="inventory-link"
                      disabled={busy}
                      onClick={() => void run(async () => {
                        await saveInventoryItem(workspace, { ...inventoryItemToInput(item), location: locationDraft }, item.id);
                        setMovingLocation(false);
                      }, "The item could not be saved.")}
                    >
                      {t("Save")}
                    </button>
                    <button type="button" className="inventory-link" onClick={() => setMovingLocation(false)}>{t("Cancel")}</button>
                  </span>
                ) : (item.location || "—")}
              </dd>
              {item.purchaseDate ? <><dt>{t("Acquisition Date")}</dt><dd>{item.purchaseDate}</dd></> : null}
              {(item.tags ?? []).length > 0 ? (
                <>
                  <dt>{t("Tags")}</dt>
                  <dd>
                    {(item.tags ?? []).map(tag => (
                      <span className="inventory-chip inventory-tag-chip" key={tag}>{tag}</span>
                    ))}
                  </dd>
                </>
              ) : null}
              <dt>{t("Value")}</dt>
              <dd>{item.ownership === "customer" ? t("Customer's") : money(currencySymbol, inventoryLineValue(item))}</dd>
              {item.currentValueEst > 0 ? <><dt>{t("Current value (est.)")}</dt><dd>{money(currencySymbol, item.currentValueEst)}</dd></> : null}
            </dl>
            {item.notes ? <p className="inventory-sub">{item.notes}</p> : <p className="inventory-sub">{t("No notes yet.")}</p>}
          </section>

          {canEdit ? (
            <section className="inventory-panel-card">
              <header><strong>{t("Quick Actions")}</strong></header>
              <div className="inventory-panel-actions">
                <button type="button" className="inventory-secondary" disabled={busy} onClick={() => onEdit(item)}>
                  {t("Edit Item")}
                </button>
                <button type="button" className="inventory-secondary" disabled={busy} onClick={() => setMovingLocation(true)}>
                  {t("Move / Change Location")}
                </button>
                {STATUS_NEXT[item.status]?.includes("sold") ? (
                  <button
                    type="button"
                    className="inventory-secondary"
                    disabled={busy}
                    onClick={() => void run(() => setInventoryItemStatus(workspace, item.id, "sold"), "The item status could not be changed.")}
                  >
                    {t("Mark as Sold")}
                  </button>
                ) : null}
                {STATUS_NEXT[item.status]?.includes("used") ? (
                  <button
                    type="button"
                    className="inventory-secondary"
                    disabled={busy}
                    onClick={() => void run(() => setInventoryItemStatus(workspace, item.id, "used"), "The item status could not be changed.")}
                  >
                    {t("Mark as Used")}
                  </button>
                ) : null}
                {!["sold", "used", "removed", "archived"].includes(item.status) ? (
                  <button type="button" className="inventory-secondary" disabled={busy} onClick={() => setLossOpen(open => !open)}>
                    {t("Record a Loss…")}
                  </button>
                ) : null}
                <button type="button" className="inventory-secondary" disabled={busy} onClick={duplicateItem}>
                  {t("Duplicate Item")}
                </button>
                <button type="button" className="inventory-secondary" onClick={() => onPrintLabel(item)}>
                  {t("Print Label (QR)")}
                </button>
              </div>
              {lossOpen ? (
                <div className="inventory-loss-form">
                  {/* The reason is the point: the ledger line it produces is the
                      answer to "where did that stock go" months later. */}
                  <select className="input" value={lossKind} onChange={e => setLossKind(e.target.value as InventoryLossKind)} aria-label={t("Loss reason")}>
                    <option value="damaged">{t("Damaged")}</option>
                    <option value="lost">{t("Lost")}</option>
                    <option value="returned">{t("Returned to supplier")}</option>
                    <option value="wastage">{t("Wastage")}</option>
                  </select>
                  {item.trackingType === "quantity" ? (
                    <input
                      className="input inventory-qty-input"
                      inputMode="decimal"
                      value={lossQty}
                      onChange={e => setLossQty(e.target.value)}
                      aria-label={t("Quantity lost")}
                    />
                  ) : null}
                  <input
                    className="input"
                    value={lossNote}
                    onChange={e => setLossNote(e.target.value)}
                    placeholder={t("What happened? (optional)")}
                  />
                  <div className="inventory-panel-actions">
                    <button
                      type="button"
                      className="inventory-secondary"
                      disabled={busy || (item.trackingType === "quantity" && !(Number(lossQty) > 0))}
                      onClick={() => void run(async () => {
                        await recordInventoryLoss(workspace, item.id, lossKind, {
                          quantity: item.trackingType === "quantity" ? Number(lossQty) : undefined,
                          note: lossNote.trim() || undefined
                        });
                        setLossOpen(false);
                        setLossNote("");
                      }, "The loss could not be recorded.")}
                    >
                      {t("Record the loss")}
                    </button>
                    <button type="button" className="inventory-link" onClick={() => setLossOpen(false)}>{t("Cancel")}</button>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="inventory-panel-card inventory-panel-qr">
            <header><strong>{t("QR / Barcode")}</strong></header>
            <div dangerouslySetInnerHTML={{ __html: qrSvg }} />
            <span>{item.number}</span>
            <span className="inventory-sub">{t("Scan to view item")}</span>
          </section>
        </div>
      ) : tab === "history" ? (
        <div className="inventory-panel-body">
          {movements === null ? (
            <p className="inventory-sub">{t("Loading…")}</p>
          ) : movements.length === 0 ? (
            <p className="inventory-sub">{t("No movements recorded for this item yet.")}</p>
          ) : (
            <ul className="inventory-panel-list inventory-panel-history">
              {movements.map(row => (
                <li key={row.id}>
                  <strong>{t(KIND_LABEL[row.kind] ?? row.kind)}</strong>
                  {" · "}
                  {row.delta > 0 ? "+" : ""}{row.delta}
                  {" · "}
                  {money(currencySymbol, Math.abs(row.valueDelta))}
                  <span className="inventory-sub">
                    {new Date(row.at).toLocaleString()}{row.byEmail ? ` · ${row.byEmail}` : ""}{row.note ? ` · ${row.note}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : tab === "purchases" ? (
        <div className="inventory-panel-body">
          {purchase && purchase !== "none" ? (
            <section className="inventory-panel-card">
              <header><strong>{purchase.number || t("Purchase")}</strong></header>
              <dl className="inventory-panel-grid">
                {purchase.supplierName ? <><dt>{t("Supplier")}</dt><dd>{purchase.supplierName}</dd></> : null}
                {purchase.purchaseDate ? <><dt>{t("Purchase date")}</dt><dd>{purchase.purchaseDate}</dd></> : null}
                <dt>{t("Total")}</dt><dd>{money(currencySymbol, purchase.total)}</dd>
                <dt>{t("Bank Transaction")}</dt>
                <dd>
                  {purchase.bankTransactionId
                    ? <span className="inventory-status is-available">{t("Matched")} ✓</span>
                    : <span className="inventory-sub">{t("Not matched")}</span>}
                </dd>
              </dl>
            </section>
          ) : (
            <p className="inventory-sub">
              {t("No purchase recorded for this item. Items created before purchasing existed, or added by hand, have no purchase trail.")}
            </p>
          )}
        </div>
      ) : tab === "photos" ? (
        <div className="inventory-panel-body">
          {photoUrls.length === 0 ? (
            <p className="inventory-sub">{t("No photos yet. For a unique piece, the photos are half the identity.")}</p>
          ) : (
            <div className="inventory-panel-gallery is-full">
              {photoUrls.map((url, index) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={index} src={url} alt="" onClick={() => onManagePhotos(item)} />
              ))}
            </div>
          )}
          {canEdit ? (
            <button type="button" className="inventory-secondary" onClick={() => onManagePhotos(item)}>
              {t("Manage photos")}
            </button>
          ) : null}
        </div>
      ) : (
        <div className="inventory-panel-body">
          {libraryFiles === null ? (
            <p className="inventory-sub">{t("Loading…")}</p>
          ) : libraryFiles.length === 0 ? (
            <p className="inventory-sub">{t("No library files are linked to this item. Certificates, valuations and receipts linked in the Files library appear here.")}</p>
          ) : (
            <ul className="inventory-panel-list">
              {libraryFiles.map(file => (
                <li key={file.id}>
                  <strong>{file.displayName}</strong>
                  <span className="inventory-sub">
                    {file.fileSize >= 1024 * 1024
                      ? `${(file.fileSize / (1024 * 1024)).toFixed(1)} MB`
                      : file.fileSize >= 1024
                        ? `${Math.round(file.fileSize / 1024)} KB`
                        : `${file.fileSize} B`}
                    {file.updatedAtMs ? ` · ${new Date(file.updatedAtMs).toLocaleDateString()}` : ""}
                  </span>
                  <button
                    type="button"
                    className="inventory-link"
                    onClick={() => {
                      void libraryFileUrl(file.storagePath)
                        .then(url => window.open(url, "_blank", "noopener,noreferrer"))
                        .catch(() => undefined);
                    }}
                  >
                    {t("Open")}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <a className="inventory-link" href="/files">{t("Manage in the Files library")}</a>
        </div>
      )}

      {reserveOpen ? (
        <ReserveForOrderModal
          workspace={workspace}
          item={item}
          uid={user?.uid || ""}
          onClose={() => setReserveOpen(false)}
          onReserved={async () => {
            setReserveOpen(false);
            await onChanged();
          }}
        />
      ) : null}
    </aside>
  );
}

// The inventory-side reserve flow. The one rule that matters: reservations go
// through reserveInventoryForOrder, which writes the reservation arrays — a
// bare status flip to "reserved" links nothing and is invisible to the order.
function ReserveForOrderModal({
  workspace,
  item,
  uid,
  onClose,
  onReserved
}: {
  workspace: WorkspaceContext;
  item: InventoryItem;
  uid: string;
  onClose: () => void;
  onReserved: () => void | Promise<void>;
}) {
  const { language } = useAuth();
  const t = useCallback((text: string) => studioT(text, language), [language]);
  const [orders, setOrders] = useState<OrderOptionItem[] | null>(null);
  const [orderId, setOrderId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const free = inventoryFreeToReserve(item);

  useEffect(() => {
    let cancelled = false;
    loadWorkspaceOrderOptions(workspace.id, workspace, uid)
      .then(list => { if (!cancelled) setOrders(list); })
      .catch(() => { if (!cancelled) setOrders([]); });
    return () => { cancelled = true; };
  }, [workspace, uid]);

  async function submit() {
    if (!orderId) { setError(t("Choose an order first.")); return; }
    setBusy(true);
    setError("");
    try {
      await reserveInventoryForOrder(workspace, item.id, orderId, item.trackingType === "unique" ? 1 : quantity);
      await onReserved();
    } catch (failure) {
      setError(failure instanceof Error ? t(failure.message) : t("The item could not be reserved."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal inventory-modal is-narrow" role="dialog" aria-modal="true" aria-label={t("Reserve for Order")}>
        <div className="inventory-modal-head">
          <h2>{t("Reserve for Order")}</h2>
          <button type="button" className="inventory-modal-close" onClick={onClose} aria-label={t("Close")}>×</button>
        </div>
        <p className="inventory-sub">
          {item.name} · {item.number}
          {item.trackingType === "quantity" ? ` · ${t("free")}: ${free}${item.quantity?.unit ? ` ${item.quantity.unit}` : ""}` : ""}
        </p>
        <label className="inventory-field is-wide">
          <span>{t("Order")}</span>
          <select className="input" value={orderId} onChange={event => setOrderId(event.target.value)}>
            <option value="">{orders === null ? t("Loading…") : t("Choose an order…")}</option>
            {(orders ?? []).map(order => (
              <option key={order.id} value={order.id}>
                {order.customerName} — {order.designName}
              </option>
            ))}
          </select>
        </label>
        {item.trackingType === "quantity" ? (
          <label className="inventory-field">
            <span>{t("Quantity")}</span>
            <input
              className="input"
              type="number"
              min={0.01}
              max={free}
              step="0.01"
              value={quantity ? String(quantity) : ""}
              onChange={event => setQuantity(Number(event.target.value) || 0)}
            />
          </label>
        ) : null}
        {error ? <p className="inventory-notice">{error}</p> : null}
        <div className="inventory-modal-actions">
          <button type="button" onClick={onClose}>{t("Cancel")}</button>
          <button type="button" className="inventory-primary" disabled={busy || !orderId} onClick={() => void submit()}>
            {busy ? t("Saving…") : t("Reserve")}
          </button>
        </div>
      </div>
    </div>
  );
}
