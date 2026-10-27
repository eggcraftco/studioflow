/**
 * ETSY-E2E r2 (24 Oct 2026): Etsy product photo freshness.
 *
 * Etsy API Terms: listing content shown must not be more than 6 hours older than
 * Etsy's. The server (getEtsyListingPhotos) says when it asked Etsy: each photo's
 * expiresAtMs = that moment + 6 h. Older servers lack it: then fetchedAtMs + 5 h 50 m,
 * and with neither, the moment this client called + 5 h 50 m.
 *
 * The client never shows a photo at or after its expiry: it is dropped from what is
 * shown (placeholder + "View on Etsy") and the server is asked again. The module
 * cache below answers a reopened order only while every photo in it is fresh.
 */
export type EtsyListingPhoto = {
  transactionId?: string; listingId?: string; url?: string; thumbUrl?: string; alt?: string;
  width?: number; height?: number; listingUrl?: string; fetchedAtMs?: number; expiresAtMs?: number;
};
export type EtsyPhotosAnswer = { photos: EtsyListingPhoto[]; reason: string; loading: boolean };

export const ETSY_PHOTO_FALLBACK_TTL_MS = (5 * 60 + 50) * 60 * 1000;
export const ETSY_PHOTO_HOST = /^https:\/\/i\.etsystatic\.com\//;

const num = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const str = (value: unknown): string => (typeof value === "string" ? value : value == null ? "" : String(value));

/** Reads whatever the callable returned into rows that each carry an expiry. Never throws. */
export function normaliseEtsyPhotosResponse(data: unknown, calledAtMs: number): EtsyPhotosAnswer {
  try {
    const body = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
    const topExpires = num(body.expiresAtMs);
    const topFetched = num(body.fetchedAtMs);
    const rows = Array.isArray(body.photos) ? body.photos : [];
    const photos: EtsyListingPhoto[] = rows
      .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
      .map((row) => {
        const fetchedAtMs = num(row.fetchedAtMs) || topFetched;
        const expiresAtMs = num(row.expiresAtMs) || topExpires || (fetchedAtMs || calledAtMs) + ETSY_PHOTO_FALLBACK_TTL_MS;
        return {
          transactionId: str(row.transactionId), listingId: str(row.listingId), url: str(row.url), thumbUrl: str(row.thumbUrl),
          alt: str(row.alt), width: num(row.width) || undefined, height: num(row.height) || undefined,
          listingUrl: str(row.listingUrl), fetchedAtMs: fetchedAtMs || calledAtMs, expiresAtMs
        };
      });
    return { photos, reason: str(body.reason), loading: false };
  } catch {
    return { photos: [], reason: "unavailable", loading: false };
  }
}

/** True when the photo may be shown now: an Etsy image address, and not expired. */
export function etsyPhotoIsShowable(photo: EtsyListingPhoto | undefined | null, nowMs: number, large = false): boolean {
  if (!photo) return false;
  const url = large ? (photo.url || photo.thumbUrl) : (photo.thumbUrl || photo.url);
  if (!url || !ETSY_PHOTO_HOST.test(url)) return false;
  const expires = num(photo.expiresAtMs);
  return expires > 0 && nowMs < expires;
}

/** The earliest expiry among the rows (0 when none): when the screen must ask again. */
export function nextEtsyPhotoExpiry(photos: EtsyListingPhoto[]): number {
  let next = 0;
  for (const photo of photos) {
    const at = num(photo.expiresAtMs);
    if (at && (!next || at < next)) next = at;
  }
  return next;
}

/** The listing's address on Etsy, from the row or the listing id; "" when neither is safe. */
export function etsyListingLink(photo: EtsyListingPhoto | undefined | null, listingId?: unknown): string {
  const fromRow = str(photo?.listingUrl).trim();
  if (/^https:\/\/(www\.)?etsy\.com\//i.test(fromRow)) return fromRow;
  const id = str(listingId ?? photo?.listingId).trim();
  return /^\d+$/.test(id) ? `https://www.etsy.com/listing/${id}` : "";
}

// Module cache: per order, only while EVERY photo in the answer is still fresh.
const cache = new Map<string, EtsyPhotosAnswer>();

export function readEtsyPhotoCache(orderId: string, nowMs: number): EtsyPhotosAnswer | null {
  const hit = cache.get(orderId);
  if (!hit) return null;
  const expiry = nextEtsyPhotoExpiry(hit.photos);
  if (!hit.photos.length || !expiry || nowMs >= expiry) {
    cache.delete(orderId);
    return null;
  }
  return hit;
}

export function writeEtsyPhotoCache(orderId: string, answer: EtsyPhotosAnswer): void {
  if (answer.photos.length && !answer.reason) cache.set(orderId, answer);
  else cache.delete(orderId);
}

export function clearEtsyPhotoCache(): void {
  cache.clear();
  inFlight.clear();
}

// ETSY-UI-1 (27 Oct 2026): one question per order while it is being asked. A list row and the order page can ask for
// the same order at once, and the order screen can re-run its photo hook before a slow answer arrives (the acceptance
// rig saw two calls for one open when Etsy's answer was held back); while a call is in flight every caller shares it.
const inFlight = new Map<string, Promise<EtsyPhotosAnswer>>();

/**
 * One fetch, the way the screen does it: a fresh cached answer, or the callable.
 * A callable error, or a body that cannot be read, is "unavailable" — never a throw.
 */
export async function loadEtsyListingPhotos(
  orderId: string,
  call: (orderId: string) => Promise<unknown>,
  now: () => number = Date.now
): Promise<EtsyPhotosAnswer> {
  const cached = readEtsyPhotoCache(orderId, now());
  if (cached) return cached;
  const pending = inFlight.get(orderId);
  if (pending) return pending;
  const calledAtMs = now();
  const asking = (async (): Promise<EtsyPhotosAnswer> => {
    try {
      const answer = normaliseEtsyPhotosResponse(await call(orderId), calledAtMs);
      writeEtsyPhotoCache(orderId, answer);
      return answer;
    } catch {
      return { photos: [], reason: "unavailable", loading: false };
    } finally {
      inFlight.delete(orderId);
    }
  })();
  inFlight.set(orderId, asking);
  return asking;
}
