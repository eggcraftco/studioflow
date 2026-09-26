"use client";

// DHL Express on an order's Shipping & Tracking card: the order's shipments, what
// each one is waiting for, and the way to prepare the next one.
//
// It shows only when the server says DHL is open for this workspace
// (getShippingConnection); otherwise the card is exactly what it was. Every list
// and document comes through the shipping callables, already filtered by what
// this member may see, so nothing here decides who sees money or an address.
//
// A label is not a dispatch. Creating one fills the order's tracking number when
// it is empty, and nothing else; Dispatched and Delivered follow DHL's scans.
// A shipment whose creation got no answer is "unknown": it is searched for at
// DHL by its own reference, and a second label is made only when a search found
// nothing and an owner or admin accepts that it may be a second charge.

import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";
import { studioLocaleTag, studioT } from "@/lib/studioflow/language";
import {
  createOrderShipment,
  findOrderShipmentsOnDhl,
  getShippingConnection,
  listOrderShipments,
  openOrderShipmentDocument,
  openShipmentPdf,
  reconcileOrderShipment,
  refreshOrderShipmentTracking,
  shippingErrorMessage,
  startOrderShipment,
  type OrderShipment,
  type OrderShipmentsResult,
  type ShipmentDocumentType,
  type ShippingConnectionView
} from "@/lib/studioflow/shipping";
import { ShipmentDraftDialog } from "./ShipmentDraftDialog";

const EDITABLE = new Set(["draft", "invalid", "rejected", "not_sent"]);

const STATUS_LABELS: Record<string, string> = {
  LABEL_CREATED: "Label created",
  PICKUP_BOOKED: "Pickup booked",
  PICKED_UP: "Picked up",
  IN_TRANSIT: "In transit",
  CUSTOMS: "In customs",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  EXCEPTION: "Needs attention at DHL",
  CANCELLED: "Cancelled"
};

/** One word for where a shipment is, and a tone for its chip. */
function shipmentState(shipment: OrderShipment): { label: string; tone: "draft" | "busy" | "good" | "done" | "warn" | "bad" } {
  const state = shipment.creation.state;
  if (state === "draft" || state === "invalid") return { label: "Draft", tone: "draft" };
  if (state === "rejected") return { label: "Refused by DHL", tone: "bad" };
  if (state === "not_sent") return { label: "Not sent", tone: "warn" };
  if (state === "in_progress") return { label: "Sending to DHL…", tone: "busy" };
  if (state === "unknown") return { label: "Needs a check", tone: "warn" };
  const label = STATUS_LABELS[shipment.status] ?? "Label created";
  if (shipment.status === "DELIVERED") return { label, tone: "done" };
  if (shipment.status === "EXCEPTION" || shipment.attention) return { label, tone: "warn" };
  return { label, tone: "good" };
}

export function OrderShipmentsPanel({
  workspace,
  orderId,
  language,
  onOrderChanged,
  onSizeChange
}: {
  workspace: WorkspaceContext;
  orderId: string;
  language: string;
  /** The order's own fields may have changed (tracking number, Dispatched, Delivered). */
  onOrderChanged?: () => Promise<void> | void;
  /** The panel grew or shrank on its own (shipments loaded, a notice shown). */
  onSizeChange?: () => void;
}) {
  const t = useCallback((text: string) => studioT(text, language), [language]);
  const companyId = workspace.id.trim();
  const isOwner = workspace.role === "owner";
  const [connection, setConnection] = useState<ShippingConnectionView | null>(null);
  const [data, setData] = useState<OrderShipmentsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [editingId, setEditingId] = useState("");
  const [acknowledged, setAcknowledged] = useState<Record<string, boolean>>({});
  const rootRef = useRef<HTMLDivElement | null>(null);
  const sizeChangeRef = useRef(onSizeChange);
  sizeChangeRef.current = onSizeChange;

  useEffect(() => {
    let active = true;
    setConnection(null);
    if (!companyId) return () => { active = false; };
    // A refusal or a network failure reads as "off": the card stays as it was.
    getShippingConnection(companyId)
      .then(view => { if (active) setConnection(view); })
      .catch(() => { if (active) setConnection({ carrier: "dhl_express", enabled: false, connected: false }); });
    return () => { active = false; };
  }, [companyId]);

  const reload = useCallback(async () => {
    if (!companyId || !orderId) return;
    try {
      setData(await listOrderShipments(companyId, orderId));
      setError("");
    } catch (failure) {
      setError(shippingErrorMessage(failure, t));
    } finally {
      setLoading(false);
    }
  }, [companyId, orderId, t]);

  useEffect(() => {
    if (connection?.enabled) {
      setLoading(true);
      void reload();
    } else {
      setLoading(false);
    }
  }, [connection, reload]);

  // The order page sizes its cards when it renders; this panel changes height on its own
  // afterwards, so it says so, and the card grows with it instead of spilling over the next.
  const shown = Boolean(connection?.enabled);
  useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => sizeChangeRef.current?.());
    observer.observe(node);
    return () => observer.disconnect();
  }, [shown, connection?.connected]);

  async function guard(key: string, work: () => Promise<void>) {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (failure) {
      setError(shippingErrorMessage(failure, t));
    } finally {
      setBusy("");
    }
  }

  if (!connection || !connection.enabled) return null;

  const when = (value: string | number | null | undefined) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString(studioLocaleTag(language), { dateStyle: "medium", timeStyle: "short" });
  };

  const heading = (
    <div className="shipment-panel-head">
      <strong>DHL Express</strong>
      {connection.connected && connection.environment === "test" ? (
        <span className="shipment-chip" data-tone="warn" title={t("Labels from DHL's test environment are not real shipments.")}>{t("Test environment")}</span>
      ) : null}
    </div>
  );

  // Disconnected, the shipments already made are still listed and their stored documents
  // still open; everything that needs DHL (a new label, a search, tracking) is hidden.
  const connected = connection.connected;
  const notConnectedNote = connected ? null : (
    <p className="shipment-note">
      {isOwner
        ? <>{t("DHL Express is not connected.")} <a className="inventory-link" href="/settings?section=dhl">{t("Connect it in Settings ▸ Integrations.")}</a></>
        : t("DHL Express is not connected yet. The workspace owner connects it in Settings ▸ Integrations.")}
    </p>
  );

  const shipments = data?.shipments ?? [];
  const can = data?.can;
  const anyCreated = shipments.some(s => s.creation.state === "created" && s.trackingNumber);
  const editing = shipments.find(s => s.id === editingId) || null;

  async function openDocument(shipment: OrderShipment, type: ShipmentDocumentType) {
    // The tab is opened now, while the click still counts as the person's, so a pop-up
    // blocker does not stop it; the PDF goes into it once the server has answered.
    const target = window.open("", "_blank");
    if (target) target.opener = null;
    await guard(`doc:${shipment.id}:${type}`, async () => {
      try {
        openShipmentPdf(await openOrderShipmentDocument(companyId, orderId, shipment.id, type), target);
      } catch (failure) {
        target?.close();
        throw failure;
      }
    });
  }

  async function prepareNew() {
    await guard("start", async () => {
      const { shipmentId } = await startOrderShipment(companyId, orderId);
      await reload();
      setEditingId(shipmentId);
    });
  }

  async function searchAgain(shipment: OrderShipment) {
    await guard(`reconcile:${shipment.id}`, async () => {
      const result = await reconcileOrderShipment(companyId, orderId, shipment.id);
      if (result.outcome === "linked") {
        setNotice(`${t("Found at DHL and linked. Waybill")} ${result.trackingNumber ?? ""}`.trim());
        await onOrderChanged?.();
      } else if (result.outcome === "none") {
        setNotice(t("DHL has no shipment with this reference yet."));
      } else if (result.outcome === "several") {
        setNotice(t("DHL has more than one shipment with this reference. Check them in MyDHL before doing anything else."));
      } else if (result.outcome === "error") {
        setNotice(t("DHL could not be asked just now. Try again in a moment."));
      }
      await reload();
    });
  }

  async function createAnyway(shipment: OrderShipment) {
    await guard(`again:${shipment.id}`, async () => {
      const result = await createOrderShipment(companyId, orderId, shipment.id, true);
      if (result.outcome === "created") {
        setNotice(`${t("Label created. Waybill")} ${result.trackingNumber ?? ""}`.trim());
        await onOrderChanged?.();
      } else if (result.outcome === "unknown") {
        setNotice(t("DHL did not answer again. The shipment stays unknown until it is found."));
      } else {
        setNotice(t("DHL did not create the shipment. Open it to see what to change."));
      }
      setAcknowledged(current => ({ ...current, [shipment.id]: false }));
      await reload();
    });
  }

  async function findOnMyDhl() {
    await guard("mydhl", async () => {
      const result = await findOrderShipmentsOnDhl(companyId, orderId);
      const parts: string[] = [];
      if (result.outcome === "error") parts.push(t("DHL could not be asked just now. Try again in a moment."));
      else if (result.linked === 1) parts.push(t("Linked a shipment made on MyDHL."));
      else if (result.linked > 1) parts.push(t("Linked {count} shipments made on MyDHL.").replace("{count}", String(result.linked)));
      else parts.push(t("No shipment on MyDHL carries the reference {reference} yet.").replace("{reference}", result.reference));
      if (result.conflicts > 0) parts.push(t("A shipment on MyDHL with this reference belongs to another order, so it was left there."));
      setNotice(parts.join(" "));
      await reload();
      if (result.linked > 0) await onOrderChanged?.();
    });
  }

  async function refreshTracking() {
    await guard("track", async () => {
      const result = await refreshOrderShipmentTracking(companyId, orderId);
      setNotice(result.added === 1
        ? t("Tracking updated: 1 new checkpoint.")
        : result.added > 1
          ? t("Tracking updated: {count} new checkpoints.").replace("{count}", String(result.added))
          : t("Tracking is up to date."));
      await reload();
      await onOrderChanged?.();
    });
  }

  return (
    <div className="shipment-panel" ref={rootRef}>
      <div className="app-card-divider" />
      {heading}
      {notConnectedNote}

      {loading && !data ? <p className="shipment-note">{t("Loading shipments…")}</p> : null}

      {connected && data && shipments.length === 0 ? (
        <p className="shipment-note">{t("No DHL shipment for this order yet.")}</p>
      ) : null}

      {shipments.length > 0 ? (
        <ul className="shipment-list">
          {shipments.map(shipment => {
            const state = shipmentState(shipment);
            const editable = EDITABLE.has(shipment.creation.state);
            const reconcile = shipment.creation.lastReconcile;
            const searchedNothing = shipment.creation.state === "unknown" && reconcile?.outcome === "none";
            // A shipment made on MyDHL carries only the order's reference; ours carry their attempt's.
            const reference = shipment.source === "external_sync"
              ? shipment.orderReference
              : shipment.creation.attemptReference || `${shipment.orderReference}-S${shipment.sequence}`;
            const issues = shipment.issues ?? [];
            return (
              <li key={shipment.id} className="shipment-row">
                <div className="shipment-row-head">
                  <span className="shipment-row-title">
                    <strong>{t("Shipment")} {shipment.sequence}</strong>
                    <code>{reference}</code>
                  </span>
                  <span className="shipment-chip" data-tone={state.tone}>{t(state.label)}</span>
                </div>

                {shipment.trackingNumber ? (
                  <div className="shipment-facts">
                    <span>{t("Waybill")} <strong className="shipment-mono">{shipment.trackingNumber}</strong></span>
                    {shipment.statusText ? <span>{shipment.statusText}{shipment.statusAt ? ` · ${when(shipment.statusAt)}` : ""}</span> : null}
                  </div>
                ) : null}

                {editable && can?.prepare && connected ? (
                  <p className="shipment-note">
                    {issues.length > 0
                      ? t("{count} things to finish before DHL can create it.").replace("{count}", String(issues.length))
                      : t("Ready to create the label.")}
                  </p>
                ) : null}

                {shipment.creation.state === "rejected" && shipment.creation.lastError?.detail ? (
                  <p className="shipment-error">{t("DHL said:")} {shipment.creation.lastError.detail}</p>
                ) : null}

                {shipment.creation.state === "not_sent" ? (
                  <p className="shipment-note">{t("DHL could not be reached, so nothing was created. It can be sent again.")}</p>
                ) : null}

                {shipment.creation.state === "unknown" ? (
                  <div className="shipment-unknown">
                    <p>{t("DHL did not answer when this label was requested, so it may exist at DHL. NivaDesk looks for it by its reference; it never sends it again on its own.")}</p>
                    {reconcile?.outcome === "several" ? (
                      <p className="shipment-error">{t("DHL has more than one shipment with this reference. Check them in MyDHL before doing anything else.")}</p>
                    ) : null}
                    {can?.prepare && connected ? (
                      <button type="button" className="inventory-link" disabled={Boolean(busy)} onClick={() => void searchAgain(shipment)}>
                        {busy === `reconcile:${shipment.id}` ? t("Searching DHL…") : t("Search DHL again")}
                      </button>
                    ) : null}
                    {searchedNothing && can?.senderPaysDuties && connected ? (
                      <div className="shipment-second-label">
                        <label className="inventory-check">
                          <input
                            type="checkbox"
                            checked={Boolean(acknowledged[shipment.id])}
                            onChange={event => setAcknowledged(current => ({ ...current, [shipment.id]: event.target.checked }))}
                          />
                          {t("I understand this may create a second label and a second charge.")}
                        </label>
                        <button
                          type="button"
                          className="inventory-link inventory-link-danger"
                          disabled={!acknowledged[shipment.id] || Boolean(busy)}
                          onClick={() => void createAnyway(shipment)}
                        >{busy === `again:${shipment.id}` ? t("Sending to DHL…") : t("Create a new label")}</button>
                      </div>
                    ) : null}
                    {searchedNothing && !can?.senderPaysDuties && connected ? (
                      <p className="shipment-note">{t("An owner or admin can decide to create a new label.")}</p>
                    ) : null}
                  </div>
                ) : null}

                {shipment.source === "external_sync" ? (
                  <p className="shipment-note">{t("Made on MyDHL: its label and invoice are there.")}</p>
                ) : shipment.creation.documentsMissing ? (
                  <p className="shipment-note">{t("This shipment was found at DHL by its reference; DHL did not send its documents. Print them from MyDHL.")}</p>
                ) : null}

                <div className="shipment-actions">
                  {editable && can?.prepare && connected ? (
                    <button type="button" className="inventory-link" disabled={Boolean(busy)} onClick={() => setEditingId(shipment.id)}>{t("Continue")}</button>
                  ) : null}
                  {shipment.documents.filter(doc => doc.available).map(doc => (
                    <button
                      key={doc.type}
                      type="button"
                      className="inventory-link"
                      disabled={Boolean(busy)}
                      onClick={() => void openDocument(shipment, doc.type as ShipmentDocumentType)}
                    >{doc.type === "label" ? t("Open label") : t("Open commercial invoice")}</button>
                  ))}
                  {shipment.labelCreatedAtMs && shipment.source !== "external_sync" ? <span className="shipment-muted">{t("Label created")} {when(shipment.labelCreatedAtMs)}</span> : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {error ? <p className="shipment-error">{error}</p> : null}
      {notice ? <p className="shipment-note">{notice}</p> : null}

      <div className="shipment-actions">
        {can?.prepare && connected ? (
          <button type="button" className="inventory-link" disabled={Boolean(busy)} onClick={() => void prepareNew()}>
            {busy === "start" ? t("Preparing…") : t("+ Prepare a DHL shipment")}
          </button>
        ) : null}
        {anyCreated && connected ? (
          <button type="button" className="inventory-link" disabled={Boolean(busy)} onClick={() => void refreshTracking()}>
            {busy === "track" ? t("Asking DHL…") : t("Refresh tracking")}
          </button>
        ) : null}
        {can?.prepare && connected ? (
          <button type="button" className="inventory-link" disabled={Boolean(busy)} onClick={() => void findOnMyDhl()}>
            {busy === "mydhl" ? t("Searching DHL…") : t("Find shipments made on MyDHL")}
          </button>
        ) : null}
      </div>
      {can?.prepare && connected && data?.orderReference ? (
        <p className="shipment-muted">{t("Made the label on MyDHL? Put {reference} in its reference, and NivaDesk finds it.").replace("{reference}", data.orderReference)}</p>
      ) : null}
      <p className="shipment-muted">{t("A label is not a dispatch: the order is marked dispatched when DHL scans the parcel, and delivered when every parcel is delivered.")}</p>

      {editing && can && connected ? (
        <ShipmentDraftDialog
          companyId={companyId}
          orderId={orderId}
          orderReference={data?.orderReference ?? ""}
          shipment={editing}
          can={can}
          connection={connection}
          language={language}
          onClose={async () => { setEditingId(""); await reload(); }}
          onCreated={async (message) => {
            setEditingId("");
            setNotice(message);
            await reload();
            await onOrderChanged?.();
          }}
        />
      ) : null}
    </div>
  );
}
