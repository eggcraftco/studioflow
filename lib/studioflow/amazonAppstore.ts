// The Appstore leg of the Amazon connect flow (AMZ-3), kept free of Firebase so
// scripts/check-amazon-appstore.mts can run it directly.

/**
 * Where Connect sends the browser. A seller who arrived from Amazon's Appstore
 * ("Authorize" there, then ?amazon=appstore here) goes through the same
 * owner-gated, sealed flow with one flag added, which tells the zone to return
 * them to Amazon's confirm page instead of opening a fresh consent. The flag
 * grants nothing: without the zone's own Appstore cookie it is ignored.
 */
export function amazonStartUrl(url: string, fromAppstore: boolean): string {
  if (!fromAppstore) return url;
  try {
    const target = new URL(url);
    if (target.protocol !== "https:" || target.pathname !== "/oauth/start") return url;
    target.searchParams.set("appstore", "1");
    return target.toString();
  } catch {
    return url;
  }
}
