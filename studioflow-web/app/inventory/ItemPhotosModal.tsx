"use client";

// Photos of one inventory item.
//
// A serialled dial or a watch head is identified by how it looks as much as by
// its number, so a unique item carries its own pictures. The item stores
// storage paths — permanent — and this modal resolves them to URLs only to
// draw them. Uploads go to storage first and the item is saved after, so a
// failed upload never leaves a path pointing at nothing.

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { studioT } from "@/lib/studioflow/language";
import {
  INVENTORY_PHOTO_LIMIT,
  deleteInventoryPhoto,
  inventoryPhotoUrl,
  saveInventoryItem,
  uploadInventoryPhoto,
  type InventoryItem
} from "@/lib/studioflow/inventory";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";

export function ItemPhotosModal({
  workspace,
  item,
  canEdit,
  onClose,
  onChanged
}: {
  workspace: WorkspaceContext;
  item: InventoryItem;
  canEdit: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { language } = useAuth();
  const t = useCallback((text: string) => studioT(text, language), [language]);

  const [paths, setPaths] = useState<string[]>(item.photos ?? []);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [viewing, setViewing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    paths.forEach(path => {
      if (urls[path]) return;
      inventoryPhotoUrl(path)
        .then(url => { if (!cancelled) setUrls(current => ({ ...current, [path]: url })); })
        .catch(() => undefined);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paths]);

  async function persist(next: string[]) {
    // Only the photos move; every other field rides through untouched because
    // the server keeps what the form does not send.
    await saveInventoryItem(workspace, {
      name: item.name,
      category: item.category,
      trackingType: item.trackingType,
      ownership: item.ownership,
      photos: next
    } as never, item.id);
  }

  async function add(files: FileList | null) {
    if (!files || files.length === 0) return;
    const room = INVENTORY_PHOTO_LIMIT - paths.length;
    if (room <= 0) {
      setError(`${t("An item carries at most")} ${INVENTORY_PHOTO_LIMIT} ${t("photos.")}`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const uploaded: string[] = [];
      for (const file of [...files].slice(0, room)) {
        uploaded.push(await uploadInventoryPhoto(workspace, item.id, file));
      }
      const next = [...paths, ...uploaded];
      await persist(next);
      setPaths(next);
      onChanged();
    } catch (failure) {
      setError(failure instanceof Error ? t(failure.message) : t("The photo could not be uploaded."));
    } finally {
      setBusy(false);
    }
  }

  async function remove(path: string) {
    if (!window.confirm(t("Remove this photo?"))) return;
    setBusy(true);
    setError("");
    try {
      const next = paths.filter(existing => existing !== path);
      // The document first: a photo the item no longer lists is just an
      // orphaned file, but a listed path with no file behind it is a broken
      // screen.
      await persist(next);
      setPaths(next);
      await deleteInventoryPhoto(path);
      if (viewing === path) setViewing(null);
      onChanged();
    } catch (failure) {
      setError(failure instanceof Error ? t(failure.message) : t("The photo could not be removed."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inventory-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="inventory-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t("Photos")}
        onClick={event => event.stopPropagation()}
      >
        <div className="inventory-modal-head">
          <h2>{item.name}</h2>
          <button type="button" className="inventory-modal-close" onClick={onClose} aria-label={t("Close")}>×</button>
        </div>

        <div className="inventory-modal-body">
          {viewing && urls[viewing] ? (
            <div className="inventory-photo-stage">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={urls[viewing]} alt={item.name} />
              <div className="inventory-inline-actions">
                <button type="button" className="inventory-link" onClick={() => setViewing(null)}>
                  {t("Back to all photos")}
                </button>
                {canEdit ? (
                  <button type="button" className="inventory-link inventory-link-danger"
                    disabled={busy} onClick={() => void remove(viewing)}>
                    {t("Remove this photo")}
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <>
              {paths.length === 0 ? (
                <p className="inventory-note">
                  {t("No photos yet. For a unique piece, the photos are half the identity.")}
                </p>
              ) : (
                <div className="inventory-photo-grid">
                  {paths.map(path => (
                    <button
                      key={path}
                      type="button"
                      className="inventory-photo-thumb"
                      onClick={() => setViewing(path)}
                    >
                      {urls[path] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={urls[path]} alt={item.name} loading="lazy" />
                      ) : (
                        <span className="inventory-sub">…</span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {canEdit ? (
                <>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/*"
                    multiple
                    className="inventory-file-input"
                    onChange={event => { void add(event.target.files); event.target.value = ""; }}
                  />
                  <button
                    type="button"
                    className="inventory-secondary"
                    disabled={busy || paths.length >= INVENTORY_PHOTO_LIMIT}
                    onClick={() => fileInput.current?.click()}
                  >
                    {busy ? t("Uploading…") : t("Add photos")}
                  </button>
                </>
              ) : null}
            </>
          )}

          {error ? <p className="inventory-error">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
