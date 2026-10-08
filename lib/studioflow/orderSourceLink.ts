// The order's link back to the shop it came from (8 Oct 2026).
//
// One rule, kept out of the component so a test can hold it: the link is built
// from the channel stamp the server wrote (`commerce.externalAdminUrl`, the
// provider's own id) and from nothing else. The preview field (`designLink`)
// is the order's PHOTO — a pasted link or an uploaded image — and is never a
// source for this link; that fallback is how "Open in WooCommerce" came to open
// the preview image. A stored address is opened only when it is https, carries
// no credentials, sits on a host the provider owns (or, for a shop on its own
// domain, the host of a connection this workspace holds) and, where the provider
// puts the order id in the address, names this order. Anything else earns no
// link and a reason the strip can show, rather than a wrong door.
import { ebayOrderLink } from "@/lib/studioflow/ebayScreens";

export type OrderSourceLinkInput = {
  commerce: {
    provider: string;
    providerDisplayName?: string;
    externalId?: string;
    externalAdminUrl?: string;
  } | null;
  customFields?: Record<string, string>;
  /**
   * Hosts of the workspace's own store connections (WooCommerce `host`), lower-case.
   * `null`/`undefined` = not loaded yet: a shop-domain link waits; `[]` = loaded and
   * there is none: a shop-domain link is refused.
   */
  connectedHosts?: readonly string[] | null;
};

export type OrderSourceLinkReason = "no-source" | "no-address" | "host-mismatch" | "unsafe" | "wrong-order" | "loading";

export type OrderSourceLink =
  | { kind: "link"; href: string; provider: string; source: string }
  | { kind: "none"; reason: OrderSourceLinkReason; provider: string; source: string };

/** Hosts each marketplace runs its seller pages on; a stored link on any other host is not opened. */
const AMAZON_HOSTS: ReadonlySet<string> = new Set([
  "sellercentral.amazon.co.uk", "sellercentral.amazon.de", "sellercentral.amazon.fr", "sellercentral.amazon.it", "sellercentral.amazon.es",
  "sellercentral.amazon.nl", "sellercentral.amazon.se", "sellercentral.amazon.pl", "sellercentral.amazon.com.tr", "sellercentral.amazon.ae",
  "sellercentral.amazon.in", "sellercentral.amazon.com", "sellercentral.amazon.ca", "sellercentral.amazon.com.mx", "sellercentral.amazon.com.br",
  "sellercentral.amazon.co.jp", "sellercentral.amazon.com.au", "sellercentral.amazon.sg"
]);
const SQUARE_HOSTS: ReadonlySet<string> = new Set(["app.squareup.com", "app.squareupsandbox.com"]);
const SHOPIFY_ADMIN_HOST = "admin.shopify.com";

/** The custom-field "Source" names the legacy imports wrote, mapped to the engine's provider ids. */
const SOURCE_TO_PROVIDER: Record<string, string> = {
  woocommerce: "woocommerce", shopify: "shopify", etsy: "etsy", ebay: "ebay", amazon: "amazon", square: "square"
};
const PROVIDER_DISPLAY: Record<string, string> = {
  woocommerce: "WooCommerce", shopify: "Shopify", etsy: "Etsy", ebay: "eBay", amazon: "Amazon", square: "Square"
};

/** https, no user:pass, a real host; returns the parsed URL or null. */
function safeHttpsUrl(value: string): URL | null {
  const raw = String(value || "").trim();
  if (!raw || !/^https:\/\//i.test(raw)) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname) return null;
    return url;
  } catch {
    return null;
  }
}

function none(reason: OrderSourceLinkReason, provider: string, source: string): OrderSourceLink {
  return { kind: "none", reason, provider, source };
}

export function orderSourceLink(input: OrderSourceLinkInput): OrderSourceLink {
  const cf = input.customFields || {};
  const stamp = input.commerce && input.commerce.provider ? input.commerce : null;
  const sourceField = (cf["Source"] || "").trim();
  const provider = stamp ? stamp.provider.toLowerCase() : (SOURCE_TO_PROVIDER[sourceField.toLowerCase()] || "");
  const source = (stamp?.providerDisplayName || "").trim() || PROVIDER_DISPLAY[provider] || sourceField;
  if (!provider) return none("no-source", "", source);

  // eBay keeps its own builder: the link is made from the order id alone.
  if (provider === "ebay") {
    const href = ebayOrderLink(stamp?.externalId || cf["eBay Order ID"] || "", stamp?.externalAdminUrl || "");
    return href ? { kind: "link", href, provider, source } : none("no-address", provider, source);
  }

  // Shopify's legacy import stamped the store domain and the order id, and the
  // admin lives on one constant host: build it, do not read it.
  if (provider === "shopify" && !stamp?.externalAdminUrl) {
    const handle = (cf["Shopify Domain"] || "").trim().toLowerCase().replace(/\.myshopify\.com$/, "");
    const id = (cf["Shopify Order ID"] || "").trim();
    if (/^[a-z0-9][a-z0-9-]{0,98}$/.test(handle) && /^\d{1,24}$/.test(id)) {
      return { kind: "link", href: `https://${SHOPIFY_ADMIN_HOST}/store/${handle}/orders/${id}`, provider, source };
    }
    return none("no-address", provider, source);
  }

  const stored = (stamp?.externalAdminUrl || "").trim();
  if (!stored) return none("no-address", provider, source);
  const url = safeHttpsUrl(stored);
  if (!url) return none("unsafe", provider, source);
  const host = url.hostname.toLowerCase();
  const externalId = (stamp?.externalId || "").trim();

  switch (provider) {
    case "woocommerce": {
      // The shop runs on its own domain, so the only host we can trust is one the
      // workspace connected. Until the connections are known the link waits.
      if (input.connectedHosts === null || input.connectedHosts === undefined) return none("loading", provider, source);
      if (!input.connectedHosts.map(h => h.toLowerCase()).includes(host)) return none("host-mismatch", provider, source);
      if (!/\/wp-admin\/post\.php$/.test(url.pathname)) return none("unsafe", provider, source);
      const post = url.searchParams.get("post") || "";
      if (!/^\d{1,20}$/.test(post) || (externalId && post !== externalId)) return none("wrong-order", provider, source);
      return { kind: "link", href: `https://${host}/wp-admin/post.php?post=${post}&action=edit`, provider, source };
    }
    case "shopify": {
      if (!/^[a-z0-9][a-z0-9-]{0,98}\.myshopify\.com$/.test(host) && host !== SHOPIFY_ADMIN_HOST) return none("host-mismatch", provider, source);
      const match = /\/orders\/(\d{1,24})$/.exec(url.pathname);
      if (!match || (externalId && match[1] !== externalId)) return none("wrong-order", provider, source);
      return { kind: "link", href: `https://${host}${url.pathname}`, provider, source };
    }
    case "amazon": {
      if (!AMAZON_HOSTS.has(host)) return none("host-mismatch", provider, source);
      const match = /^\/orders-v3\/order\/([A-Za-z0-9-]{1,40})$/.exec(url.pathname);
      if (!match || (externalId && decodeURIComponent(match[1]) !== externalId)) return none("wrong-order", provider, source);
      return { kind: "link", href: `https://${host}${url.pathname}`, provider, source };
    }
    case "square": {
      if (!SQUARE_HOSTS.has(host)) return none("host-mismatch", provider, source);
      const match = /^\/dashboard\/orders\/overview\/([A-Za-z0-9_-]{1,80})$/.exec(url.pathname);
      if (!match || (externalId && decodeURIComponent(match[1]) !== externalId)) return none("wrong-order", provider, source);
      return { kind: "link", href: `https://${host}${url.pathname}`, provider, source };
    }
    case "etsy":
      // The server writes no seller address for Etsy (adapters/etsy.js: external_admin_url null).
      return none("no-address", provider, source);
    default:
      return none("no-address", provider, source);
  }
}

/** The sentence the strip shows in place of a link that cannot be offered; "" when the strip should stay silent. */
export function orderSourceLinkReasonText(reason: OrderSourceLinkReason): string {
  switch (reason) {
    case "no-address": return "The store did not provide a link to this order.";
    case "host-mismatch": return "The stored link points to a store that is not connected to this workspace.";
    case "unsafe": return "The stored link is not a secure web address.";
    case "wrong-order": return "The stored link does not name this order.";
    case "loading": return "Checking the connected store...";
    default: return "";
  }
}
