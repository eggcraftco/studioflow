"use client";

// One row's picture in the item list (inventory fixes, 27 Oct 2026). Lazy twice over: the download URL is asked for only
// when the row is about to scroll into view (IntersectionObserver), and the <img> itself is loading="lazy". A URL is
// asked for once per photo path for the whole visit (module cache), so paging and filtering do not ask again. A photo
// that cannot be read (deleted, quarantined by the malware scan, offline) falls back to the category tile — the row
// never shows a broken image.
import { useEffect, useRef, useState } from "react";
import { inventoryPhotoUrl } from "@/lib/studioflow/inventory";

const urls = new Map<string, Promise<string>>();
function photoUrl(path: string): Promise<string> {
  let pending = urls.get(path);
  if (!pending) {
    pending = inventoryPhotoUrl(path).catch((error) => { urls.delete(path); throw error; });
    urls.set(path, pending);
  }
  return pending;
}

export function InventoryThumb({ path, glyph, size = "row" }: { path: string; glyph: string; size?: "row" | "small" }) {
  const box = useRef<HTMLSpanElement>(null);
  const [near, setNear] = useState(false);
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setNear(false);
    if (!path) return;
    const el = box.current;
    if (!el || typeof IntersectionObserver === "undefined") { setNear(true); return; }
    const watch = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setNear(true); watch.disconnect(); }
    }, { rootMargin: "240px" });
    watch.observe(el);
    return () => watch.disconnect();
  }, [path]);

  useEffect(() => {
    setUrl(""); setFailed(false);
    if (!near || !path) return;
    let cancelled = false;
    photoUrl(path).then((next) => { if (!cancelled) setUrl(next); }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [near, path]);

  const showPhoto = Boolean(path && url && !failed);
  const state = showPhoto ? "photo" : path && !failed ? "loading" : "placeholder";
  return (
    <span ref={box} className={`inventory-thumb is-${size}`} data-testid="inventory-thumb" data-state={state} aria-hidden="true">
      {showPhoto
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={url} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
        : <span className="inventory-thumb-glyph">{glyph}</span>}
    </span>
  );
}

export default InventoryThumb;
