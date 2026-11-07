// The shop photo on an order's Preview (siparis-onizleme, 7 Nov 2026).
//
// The server (copyOrderChannelPreview) copies the ordered product's photo from the channel into the workspace's own
// Storage and writes `channelPreview` — and `designLink` too when it was blank, so every client already shows it.
// `channelPreview.url` is only needed where `designLink` holds a link that is not a picture (Shopify puts the buyer's
// status page there). The same rule on web, iOS/Mac and Android:
//   * designLink is a picture            → designLink (the studio's own picture always wins);
//   * designLink is some other link, and
//     the server copied a shop photo     → channelPreview.url;
//   * otherwise                          → designLink as it is (an EMPTY designLink stays empty: the server fills a
//                                          blank one, so blank + channelPreview means the studio removed the picture).
// Read only: no client ever writes `channelPreview`.

const PICTURE_EXTENSION = /\.(png|jpe?g|webp|gif|heic|heif)$/;

/** The path before "?" ends in a picture extension (the test the Preview card has always used). */
export function isPictureLink(value: string | null | undefined): boolean {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return false;
  return PICTURE_EXTENSION.test(raw.split("?")[0]);
}

/** `channelPreview.url` from an order document: https only (or the local Storage emulator). "" otherwise. */
export function channelPreviewUrlFrom(data: Record<string, unknown> | null | undefined): string {
  const preview = data && typeof data.channelPreview === "object" && data.channelPreview ? (data.channelPreview as Record<string, unknown>) : null;
  const url = preview && typeof preview.url === "string" ? preview.url.trim() : "";
  if (!url) return "";
  if (url.startsWith("https://")) return url;
  if (/^http:\/\/(127\.0\.0\.1|localhost):\d+\/v0\/b\//.test(url)) return url;
  return "";
}

/** The picture link the Preview shows (see the header). */
export function effectivePreviewLink(designLink: string | null | undefined, channelPreviewUrl: string | null | undefined): string {
  const own = String(designLink ?? "").trim();
  const shop = String(channelPreviewUrl ?? "").trim();
  if (isPictureLink(own)) return own;
  if (own && shop) return shop;
  return own;
}
