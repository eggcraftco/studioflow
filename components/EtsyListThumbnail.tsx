"use client";

// ETSY-UI-1 Phase B (27 Oct 2026): the Etsy photo in an order-list row's thumbnail square. It asks only while the
// row is on screen (an IntersectionObserver, after a short dwell so a fast scroll past does not ask), through the
// session budget in lib/studioflow/etsyListThumbnails.ts — one getEtsyListingPhotos call per order per session.
// A row the list hides (narrow list, the other layout) is never on screen and never asks. Nothing is stored.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { httpsCallable } from "firebase/functions";
import { nextEtsyPhotoExpiry, type EtsyPhotosAnswer } from "@/lib/studioflow/etsyListingPhotos";
import { etsyListThumbnail, requestEtsyListThumbnail } from "@/lib/studioflow/etsyListThumbnails";

const DWELL_MS = 300;

async function callGetEtsyListingPhotos(orderId: string): Promise<unknown> {
  const { functions } = await import("@/lib/firebase/client");
  const res = await httpsCallable<{ orderId: string }, unknown>(functions, "getEtsyListingPhotos")({ orderId });
  return res.data;
}

export function EtsyListThumbnail({ orderId, fallback }: { orderId: string; fallback: ReactNode }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [answer, setAnswer] = useState<EtsyPhotosAnswer | null>(null);
  const [broken, setBroken] = useState(false);
  const [round, setRound] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    let cancelled = false;
    let dwell: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver((entries) => {
      if (dwell) clearTimeout(dwell);
      if (!entries.some((entry) => entry.isIntersecting)) return;
      dwell = setTimeout(() => {
        void requestEtsyListThumbnail(orderId, callGetEtsyListingPhotos).then((next) => { if (!cancelled) setAnswer(next); });
      }, DWELL_MS);
    });
    observer.observe(node);
    return () => { cancelled = true; if (dwell) clearTimeout(dwell); observer.disconnect(); };
  }, [orderId, round]);

  // At the photo's expiry the row drops it and, if it is still on screen, asks once more.
  useEffect(() => {
    const expiry = answer ? nextEtsyPhotoExpiry(answer.photos) : 0;
    if (!expiry) return;
    const timer = setTimeout(() => setRound((value) => value + 1), Math.max(0, expiry - Date.now()) + 50);
    return () => clearTimeout(timer);
  }, [answer]);

  const photo = broken ? undefined : etsyListThumbnail(answer, Date.now());
  const url = photo ? String(photo.thumbUrl || photo.url || "") : "";
  return (
    <span ref={ref} className="order-list-etsy-thumb" data-etsy-list-thumb={url ? "photo" : answer ? "none" : "pending"}>
      {url ? <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} /> : fallback}
    </span>
  );
}

export default EtsyListThumbnail;
