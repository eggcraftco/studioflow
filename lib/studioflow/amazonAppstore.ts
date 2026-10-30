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

/** The zone's Login URI for an Appstore "Authorize" (AMZ-3). */
export const AMAZON_APPSTORE_LANDING = "https://amazon.nivadesk.app/oauth/appstore";

/**
 * Developer Central still names https://nivadesk.app/login as the application's Login URI, and the
 * registration cannot be edited while Amazon reviews the listing. So /login hands an Appstore arrival
 * (amazon_callback_uri + amazon_state) to the zone, which does all the checking. Only Amazon's four
 * parameters travel, to one fixed address; anything else in the query is dropped.
 */
export function amazonAppstoreForward(search: string): string | null {
  const params = new URLSearchParams(search);
  if (!params.get("amazon_callback_uri") || !params.get("amazon_state")) return null;
  const out = new URLSearchParams();
  for (const key of ["amazon_callback_uri", "amazon_state", "selling_partner_id", "version"]) {
    const value = params.get(key);
    if (value) out.set(key, value);
  }
  return `${AMAZON_APPSTORE_LANDING}?${out.toString()}`;
}
