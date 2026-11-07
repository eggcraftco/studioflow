// Stock-card pictures copied from an eBay listing (copyListingPictures) carry their copy date (siparis-onizleme,
// owner 7 Nov 2026 "Evet, şartlarla aç"; eBay API License §8.1.3: shown listing content is ≤ 6 h old or its age is
// disclosed). The date is in the file name the server gives the copy:
//   companies/<ws>/inventory_photos/<card>/<copiedAtMs>-ebay-<itemId>.<ext>
// Same pattern as functions inventoryEbayPhotos.js and the iOS/Mac/Android apps. Read only.

const EBAY_PHOTO = /^companies\/[^/]{1,200}\/inventory_photos\/[^/]{1,80}\/(\d{10,16})-ebay-\d{1,20}\.(jpg|png|webp|gif)$/;

/** The copy time (ms) of a card photo copied from an eBay listing; null for any other photo. */
export function ebayListingPhotoCopiedAt(path: string | null | undefined): number | null {
  const m = EBAY_PHOTO.exec(String(path ?? "").trim());
  if (!m) return null;
  const ms = Number(m[1]);
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

/** "07 Nov 2026" — the same short date the order Preview's eBay caption uses. */
export function formatCopyDate(ms: number, locale = "en-GB"): string {
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric" }).format(new Date(ms));
}
