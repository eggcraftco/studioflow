// Which address a workspace's shared FILE links are written on (6 Nov 2026).
//
// Every customer link used to ride one name: the client domain (track.eggcraft.co.uk) or the workspace's
// nivadesk.app subdomain. That name is chosen for order tracking, so a file shared from the order read
// "track.…/f/…". A workspace can now give files their own address — files.yourdomain.com — managed like the
// payment link address (Settings → Portal address → File link address; functions/clientDomains.js
// manageFileLinkDomain). The server writes two fields on the workspace document:
//
//   fileLinkHost      the address the owner chose (it may still be waiting for its DNS record)
//   fileLinkHostLive  true only once the DNS record is verified AND the edge certificate is active
//
// Links move to the file address only while it is live, so a half-set-up address never hands a customer a
// link that fails to open. Otherwise — and for every workspace that never adds one — file links stay exactly
// where they were: the client domain, else the nivadesk.app subdomain, else nivadesk.app. Links already sent
// on the old address keep working; the /f/ viewer answers on every host.
//
// The same rule lives on the Apple and Android apps (CustomerPortalLink / CustomerLinks) when they ship it.

const HOST_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.){2,}[a-z]{2,}$/;

function cleanFileHost(value: unknown): string {
  if (typeof value !== "string") return "";
  const host = value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");
  if (!host || host.length > 253 || !HOST_PATTERN.test(host)) return "";
  // nivadesk.app names are claimed as the workspace subdomain, never as a file address.
  if (host === "nivadesk.app" || host.endsWith(".nivadesk.app")) return "";
  return host;
}

export function fileLinkHostFor(
  companyData: { fileLinkHost?: unknown; fileLinkHostLive?: unknown } | null | undefined,
  clientPortalHost: string
): string {
  const data = companyData || {};
  if (data.fileLinkHostLive === true) {
    const host = cleanFileHost(data.fileLinkHost);
    if (host) return host;
  }
  return clientPortalHost;
}
