# Sync health: one display contract — 12 September 2026

Branch `sales-faz1-release-candidate`. **Not merged, not deployed.** No function, rule or index was published.

The Sync health card had three ways of saying "nothing here" and no way of telling them apart. A connector that records nothing produced no health document, so the card drew the same empty box as a workspace with no connection at all, under the words *"No sync activity recorded yet."* — which is wrong for Etsy, whose orders do arrive. This is the contract that replaces it.

## The three states

| State | When | Decided by |
|---|---|---|
| **Not connected** | the workspace has no live connection with this provider | `getCommerceHealth` reads the provider's connection collection; a row whose status is `disconnected`, `uninstalled`, `revoked`, `deleted` or `removed` does not count |
| **Not supported** | connected, but nothing in this codebase records sync health for it, so the card can never measure anything | `healthInstrumented` in the capability registry, read through `health.recordsHealth` |
| **Never synced** | connected and instrumented, but no health row exists yet | no `commerceHealth` document for the connection |

A fourth outcome is not a state: once health rows exist, the card shows them per entity (`Fresh` / `Stale` / `Never synced` / `Not supported`) and the states above no longer apply.

`functions/commerce/health.js` → `healthCardState({ provider, connected, rows })` is the only place the rule lives. The web renders the answer; it does not work it out again. That duplication is exactly how "Never synced" came to sit on a connector that measures nothing.

## What each provider shows today

| Provider | Records health? | Connected | Not connected |
|---|---|---|---|
| Shopify, WooCommerce, Square, eBay | yes | per-entity rows, or **Never synced** until the first sweep | **Not connected** |
| **Etsy** | **no** | **Not supported** | **Not connected** |
| **Amazon** | **no** | *no card exists — see below* | *no card exists* |
| Website (inbound) | no | **Not supported** | **Not connected** |

Etsy and Amazon read orders and apply them (`implemented.orders` is `true` for both). Neither calls `touchHealth`, so no health document is ever written for them. The card therefore says **Not supported** and, underneath, in the merchant's words: *orders from this channel do reach your workspace; their freshness is not recorded yet, so this card has nothing to measure.* That sentence is the point — "Not supported" alone would read as "Etsy orders do not sync", which is false.

## The row that is hidden on purpose

**Amazon has no Sync health card at all, and this is deliberate.** Two reasons, both structural:

1. The web integration registry lists Amazon as `kind: "planned"` (`studioflow-web/lib/studioflow/integrations.ts`). A planned provider carries no Manage screen, so there is no Amazon settings section for a card to live in. The hub shows it as *Planned*.
2. Amazon connections are not a Firestore collection in this project. They live in the hardened `nivadesk-amazon` project and are reached through `amazonStatus`, a service-account call. `getCommerceHealth` deliberately does not list Amazon in `HEALTH_CARD_CONNECTIONS`, because guessing at a connection it cannot read would be worse than saying nothing.

So the Amazon row is absent, not silent: it is written down here, and the server's contract still answers for Amazon (`connected` → `not_supported`) the moment a card is given somewhere to live.

The hub card's own vocabulary — *Connected*, *Available*, *Planned*, *Action needed* — is a different question (is there a connection, is it healthy) and is not touched by this contract. Do not merge the two vocabularies.

## Proven, in three layers

`functions/test/qa/commerce-sync-health-contract.test.js`:

* **capability** — `healthInstrumented` is not trusted as a written fact. The test reads which code actually calls `touchHealth`, including the queue wrapper's `String(task.provider)` route through the dispatcher's accepted providers, and fails if the registry disagrees with the source. Instrumenting Etsy tomorrow breaks this test until the registry and this record move with it.
* **health** — every provider without a connection is `not_connected`; Etsy, Amazon and inbound connected are `not_supported`; the four instrumented ones are `never_synced`; a connection with rows falls through. An uninstrumented provider can never reach `never_synced`.
* **web** — the card asks `getCommerceHealth` for its own provider, renders the state the server decided, carries the three labels, and no longer claims there is no activity when it simply does not measure any. The three labels are checked for translations.

## Open, not fixed here

* The two explanatory sentences under the pill are English-only; `studioT` falls back to the key, so they read as English in the other ten languages. They need entries in `lib/studioflow/language.ts` before a release.
* Instrumenting Etsy and Amazon with `touchHealth` is the real fix for their rows, and is its own PR. Until then the pinned test in `commerce-capability-truth.test.js` keeps the gap visible.
* `getCommerceHealth` now performs one extra indexed read (`companyId ==`, limit 10) when a provider is named. Existing callers that pass no provider are unaffected.
