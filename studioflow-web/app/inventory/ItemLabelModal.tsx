"use client";

// A printable label for one item.
//
// The label's job is to survive on a drawer: the number big enough to read at
// arm's length, and a QR code that opens the item. The QR carries a NivaDesk
// link that ends in the item number, so any phone camera lands on the item
// instead of offering a web search for a bare number — and the number stays
// printed underneath, readable long after any phone is gone.

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { useAuth } from "@/lib/auth/AuthProvider";
import { studioT } from "@/lib/studioflow/language";
import type { InventoryItem } from "@/lib/studioflow/inventory";

const INVENTORY_LABEL_ORIGIN = (process.env.NEXT_PUBLIC_NIVADESK_PUBLIC_ORIGIN || "https://nivadesk.app").replace(/\/$/, "");

export function ItemLabelModal({
  item,
  workspaceName,
  onClose
}: {
  item: InventoryItem;
  workspaceName: string;
  onClose: () => void;
}) {
  const { language } = useAuth();
  const t = useCallback((text: string) => studioT(text, language), [language]);
  const [qrSvg, setQrSvg] = useState("");
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const reference = item.number || item.id;
    QRCode.toString(`${INVENTORY_LABEL_ORIGIN}/inventory?item=${encodeURIComponent(reference)}`, {
      type: "svg", margin: 0, errorCorrectionLevel: "M"
    })
      .then(svg => { if (!cancelled) setQrSvg(svg); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [item.number, item.id]);

  function print() {
    const label = printRef.current;
    if (!label) return;
    // Its own window, so the label prints alone rather than the whole app
    // behind it. Same-origin, opened and written by us — nothing external.
    const win = window.open("", "_blank", "width=420,height=320");
    if (!win) return;
    win.document.write(`<!doctype html><html><head><title>${item.number}</title>
      <style>
        body { margin: 0; display: grid; place-items: center; min-height: 100vh;
               font-family: -apple-system, system-ui, sans-serif; }
        .label { width: 62mm; padding: 4mm; border: 1px dashed #bbb; border-radius: 2mm;
                 display: grid; grid-template-columns: 22mm 1fr; gap: 3mm; align-items: center; }
        .label svg { width: 22mm; height: 22mm; }
        .num { font-size: 14pt; font-weight: 800; letter-spacing: 0.5px; }
        .name { font-size: 8pt; font-weight: 600; overflow: hidden; }
        .loc { font-size: 7pt; color: #555; }
        .ws { font-size: 6pt; color: #999; margin-top: 1mm; }
        @media print { .label { border: none; } }
      </style></head><body>
      <div class="label">
        <div>${qrSvg}</div>
        <div>
          <div class="num">${item.number}</div>
          <div class="name">${item.name.replace(/</g, "&lt;")}</div>
          ${item.location ? `<div class="loc">${item.location.replace(/</g, "&lt;")}</div>` : ""}
          <div class="ws">${workspaceName.replace(/</g, "&lt;")}</div>
        </div>
      </div>
      <script>window.onload = () => { window.print(); }</script>
      </body></html>`);
    win.document.close();
  }

  return (
    <div className="inventory-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="inventory-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t("Label")}
        onClick={event => event.stopPropagation()}
      >
        <div className="inventory-modal-head">
          <h2>{t("Label")}</h2>
          <button type="button" className="inventory-modal-close" onClick={onClose} aria-label={t("Close")}>×</button>
        </div>

        <div className="inventory-modal-body">
          <div ref={printRef} className="inventory-label-preview">
            {qrSvg ? (
              <span
                className="inventory-label-qr"
                // Trusted output of the qrcode library from our own item number,
                // never user HTML.
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
            ) : null}
            <span>
              <strong className="inventory-label-number">{item.number}</strong>
              <span className="inventory-label-name">{item.name}</span>
              {item.location ? <span className="inventory-sub">{item.location}</span> : null}
            </span>
          </div>
          <p className="inventory-hint">
            {t("The code carries only the item number. Scan it with any phone and paste it into the inventory search — a label outlives links.")}
          </p>
        </div>

        <div className="inventory-modal-foot">
          <span />
          <div className="inventory-modal-actions">
            <button type="button" className="inventory-secondary" onClick={onClose}>{t("Close")}</button>
            <button type="button" className="inventory-primary" disabled={!qrSvg} onClick={print}>
              {t("Print label")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
