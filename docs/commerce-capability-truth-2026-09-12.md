# What a connector can do: the claim corrected (12 Sep 2026)

Branch **`commerce-capability-truth`** (worktree `~/Developer/studioflow-capability`), cut from the deploy branch at `85a1a720`. **Not merged, not deployed.** It is independent of the Sales work and can ship on its own.

## The problem

`functions/commerce/capabilities.js` is one registry describing what each provider's API offers. Sync Health read it as "NivaDesk syncs this":

```js
products: Boolean(caps.products && caps.products.read)
```

Every provider's API can read products and stock, so Sync Health reported those entities as **`never`** — a sync that has not run yet — for all six connectors, although no product or stock sync exists anywhere in the codebase. `functions/orchestrator/inventory.js` says so in its own words: there is no product-to-listing mapping collection at all.

The hub card carried the same kind of claim: eBay was advertised as "Orders, Payments, Refunds" while every eBay sync, import and refund function is switched off, and Square's payouts — the one money feed that does exist — were not mentioned.

## The correction

One registry, two questions kept apart, and no second capability list anywhere:

| Question | Where it is answered |
|---|---|
| What does the provider's API offer? | the entity blocks in `capabilities.js`, unchanged |
| What does this codebase read today? | the new `implemented` map per provider |
| Is the connector switched on? | `functions/commerce/flags.js` |
| Did the seller grant the scope? | `functions/commerce/connectionCapabilities.js`, proven per connection |
| Is this connection healthy? | `functions/commerce/health.js` freshness records |

`health.js` now asks `implemented` and falls back to the old test only for a registry entry that predates the field. Today `implemented` says: orders for all seven entries, products and inventory for none, finance for Square alone.

The web hub now lists eBay as "Orders" and Square as "Orders, Payments, Payouts, Customers".

## Effect

* Sync Health answers **unsupported** for products and stock instead of "never synced". The card's wording for unsupported already exists.
* No behaviour changes for orders, and no connector gains or loses a capability: nothing reads `implemented` except Sync Health.
* A seller reading the hub is no longer offered two eBay features that cannot arrive, and is told about Square payouts, which can.

## Tests

`functions/test/qa/commerce-capability-truth.test.js` (7 checks): every provider declares `implemented` in booleans; orders everywhere, products and stock nowhere; Square alone has finance; the protocol statement stays true beside it; `health.supportedEntities` itself returns unsupported for products and stock; the regression is pinned (a protocol-level `products.read` no longer makes Health claim support); and the hub card no longer advertises eBay payments or refunds while naming Square's payouts.

Whole functions suite and the web typecheck and production build: see the release record below.

## Proof for Etsy and Amazon

The operator asked for evidence that a person is shown "not supported" rather than "never synced" for these two. Three layers, each with its own check:

| Layer | What it says |
|---|---|
| Capability | `implemented.products`, `implemented.inventory` and `implemented.finance` are `false` for both providers |
| Health | `healthView(null, "etsy"/"amazon")` returns `state: "unsupported"` for those entities, and a connection that does record an order sync still reads `unsupported` for them rather than falling back to "never" |
| Web | `CommerceSyncHealthCard.tsx` maps `unsupported` to "Not supported", keeps "Never synced" for `never`, and falls back to "Not supported" for any state it does not know |

**The gap this does not close, pinned by its own check:** neither Etsy nor Amazon calls `touchHealth` anywhere, so no health row exists for them at all, and a workspace whose only connector is one of those two sees "No sync activity recorded yet" instead of a row. Their orders do sync. That is a recording gap in those two connectors, not a capability claim, and it belongs to its own small PR; the test fails the day somebody adds the call, so the record cannot go stale quietly. Woo and Square are the control: they do record health.

## Release scope

1. Merge, then deploy by name the functions that read the registry or report health: `getCommerceCapabilities`, `getCommerceHealth`. Nothing else reads `implemented`.
2. Web: a Round carrying `lib/studioflow/integrations.ts`.
3. Rollback: revert the commit; the registry and the labels return to their previous values. No data changes either way.
