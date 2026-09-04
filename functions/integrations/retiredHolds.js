// What a workspace is still holding for a delivery address that has been retired.
//
// The endpoints for the old pasted-URL WooCommerce and Shopify webhooks answer
// 410 and write nothing at all. That silence is deliberate: the stub has no
// token to check, so anything it recorded would have to trust a companyId taken
// straight out of an unauthenticated URL, and a stranger could then paint any
// workspace's integration cards red.
//
// The cost of the silence is that a merchant whose WordPress site still posts
// to the old address sees orders simply stop. So the telling moves to the read
// side, where the caller is already signed in and already proven to belong to
// the workspace: if the workspace still holds a token for a retired method, the
// hub says so. It is a statement about what is in the database, not a claim
// that anybody actually posted — which is exactly as much as can honestly be
// known without trusting the caller of a public URL.

/** The delivery methods whose endpoints now answer 410. */
const RETIRED_KINDS = ["woocommerce", "shopify"];

/**
 * @param {Record<string, {token?: string}|null>} secrets  kind → its secret doc
 * @returns {{kind: string, createdAtMs: number}[]} the holds worth mentioning
 */
function retiredHolds(secrets = {}) {
  const held = [];
  for (const kind of RETIRED_KINDS) {
    const data = secrets[kind];
    if (!data) continue;
    // A doc that exists with no token is the residue of a rotation or a wipe.
    // Nothing can be posted with it, so there is nothing to warn about.
    const token = String(data.token || "").trim();
    if (!token) continue;
    const createdAt = data.createdAt;
    const createdAtMs = !createdAt
      ? 0
      : typeof createdAt.toMillis === "function"
        ? createdAt.toMillis()
        : Number(createdAt) || 0;
    held.push({ kind, createdAtMs });
  }
  return held;
}

module.exports = { RETIRED_KINDS, retiredHolds };
