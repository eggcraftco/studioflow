/**
 * ETSY-UI-1 Phase B (27 Oct 2026): the small Etsy photo on an order-list row.
 *
 * Same server call as the order page (getEtsyListingPhotos — no new function), same rules: nothing stored, Etsy's
 * own image host only, never shown at or after its 6-hour expiry. What this adds is a SESSION budget for the list:
 *  - a row asks only when it is on screen (the component observes it), and only once per order per session;
 *  - an answer with no photo, a quota stop or an error is remembered for the session — scrolling past the row
 *    again does not ask again (the order page itself still asks when the order is opened);
 *  - a photo that reaches its expiry while its row is on screen is asked for once more.
 * loadEtsyListingPhotos shares its fresh-answer cache with the order page, so opening an order whose row photo was
 * fetched (or the other way round) costs no second call.
 */
import {
  etsyPhotoIsShowable, loadEtsyListingPhotos, nextEtsyPhotoExpiry,
  type EtsyListingPhoto, type EtsyPhotosAnswer
} from "./etsyListingPhotos";

type Entry = { promise: Promise<EtsyPhotosAnswer>; answer?: EtsyPhotosAnswer };
const entries = new Map<string, Entry>();

/** The row's photo: the first one that may be shown now (small size first). */
export function etsyListThumbnail(answer: EtsyPhotosAnswer | null | undefined, nowMs: number): EtsyListingPhoto | undefined {
  return (answer?.photos || []).find((photo) => etsyPhotoIsShowable(photo, nowMs, false));
}

/** One question per order per session (again only after a shown photo expires). Never rejects. */
export function requestEtsyListThumbnail(
  orderId: string,
  call: (orderId: string) => Promise<unknown>,
  now: () => number = Date.now
): Promise<EtsyPhotosAnswer> {
  const entry = entries.get(orderId);
  if (entry) {
    if (!entry.answer) return entry.promise;
    const expiry = nextEtsyPhotoExpiry(entry.answer.photos);
    const expired = entry.answer.photos.length > 0 && expiry > 0 && now() >= expiry;
    if (!expired) return entry.promise;
  }
  const next: Entry = { promise: loadEtsyListingPhotos(orderId, call, now) };
  void next.promise.then((answer) => { next.answer = answer; });
  entries.set(orderId, next);
  return next.promise;
}

export function clearEtsyListThumbnails(): void {
  entries.clear();
}
