// The shop photo on an order's Preview (siparis-onizleme, 7 Nov 2026).
//
// The server (copyOrderChannelPreview) copies the ordered product's photo from the channel into the workspace's own
// Storage and writes `channelPreview` { url, provider, copiedAtMs, filledDesignLink }. For WooCommerce (and Shopify,
// if blank) it also fills `designLink`, so every client — old ones too — shows it. For eBay it never does: eBay's API
// License §8.1.3 wants the age of shown listing content disclosed, and only clients that print
// "Photo from the eBay listing · <date>" under it may show it. The same rule on web, iOS/Mac and Android:
//   1. designLink is a picture                                       → designLink (the studio's own picture always wins);
//   2. the server copied a photo, AND designLink is some other link
//      (Shopify's status page) OR the copy did not fill designLink    → channelPreview.url;
//   3. otherwise                                                     → designLink as it is. A blank designLink whose copy
//      DID fill it stays blank: the studio removed the picture.
// Read only: no client ever writes `channelPreview`.

const PICTURE_EXTENSION = /\.(png|jpe?g|webp|gif|heic|heif)$/;

export type ChannelPreviewInfo = {
  url: string;
  provider: string;
  copiedAtMs: number;
  filledDesignLink: boolean;
};

/** The path before "?" ends in a picture extension (the test the Preview card has always used). */
export function isPictureLink(value: string | null | undefined): boolean {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return false;
  return PICTURE_EXTENSION.test(raw.split("?")[0]);
}

function safeUrl(value: unknown): string {
  const url = typeof value === "string" ? value.trim() : "";
  if (!url) return "";
  if (url.startsWith("https://")) return url;
  if (/^http:\/\/(127\.0\.0\.1|localhost):\d+\/v0\/b\//.test(url)) return url;
  return "";
}

/** `channelPreview` from an order document; null when there is no usable copy (https only, or the local emulator). */
export function channelPreviewFrom(data: Record<string, unknown> | null | undefined): ChannelPreviewInfo | null {
  const raw = data && typeof data.channelPreview === "object" && data.channelPreview ? (data.channelPreview as Record<string, unknown>) : null;
  if (!raw) return null;
  const url = safeUrl(raw.url);
  if (!url) return null;
  const copiedAtMs = Number(raw.copiedAtMs);
  return {
    url,
    provider: typeof raw.provider === "string" ? raw.provider : "",
    copiedAtMs: Number.isFinite(copiedAtMs) ? copiedAtMs : 0,
    // A copy written before the field existed filled designLink whenever it was blank.
    filledDesignLink: raw.filledDesignLink !== false
  };
}

/** `channelPreview.url` alone (kept for callers that only need the link). */
export function channelPreviewUrlFrom(data: Record<string, unknown> | null | undefined): string {
  return channelPreviewFrom(data)?.url ?? "";
}

/** The picture link the Preview shows (see the header). */
export function effectivePreviewLink(designLink: string | null | undefined, copy: ChannelPreviewInfo | null | undefined): string {
  const own = String(designLink ?? "").trim();
  if (isPictureLink(own)) return own;
  if (copy && copy.url && (own || copy.filledDesignLink === false)) return copy.url;
  return own;
}

/** The caption a shown copy must carry: eBay's copy shows its date (§8.1.3). null when none is needed. */
export function previewCopyCaption(designLink: string | null | undefined, copy: ChannelPreviewInfo | null | undefined): { kind: "ebay"; copiedAtMs: number } | null {
  if (!copy || copy.provider !== "ebay") return null;
  const shown = effectivePreviewLink(designLink, copy);
  return shown && shown === copy.url ? { kind: "ebay", copiedAtMs: copy.copiedAtMs } : null;
}
