# Activation funnel — the five store connections, a candidate (11 September 2026, night)

**The gap, confirmed from the code.** `derive.js` derives `integration_connected` from five snapshot keys
(`shopifyStores`, `etsyConnections`, `wooConnections`, `squareConnections`, `ebayConnections`); the retention sweep now
passes all five, but `getActivationFunnel` built its snapshot from settings, orders, customers, bank, accounting and
inventory only — so in the funnel a connected store never produced `integration_connected`, and a commerce workspace that
had connected its shop looked as if it had not.

**The change** (branch `funnel-store-connections`, commit `ea0ce5d0`, from the deploy tip `37025406`): the funnel reads the
five root collections by `companyId` (limit 20 each, missing collections tolerated) and passes them into `deriveEvents`
beside the existing keys. Nothing else in the callable changes; `activation.js`, `derive.js` (with the eBay carry) and the
v2.1 gate are untouched. `activation-funnel-wiring.test.js` gained a check that pins the five reads and the snapshot keys
(8/8 green).

**Measured, read-only, 02:37Z, ids only (`funnel-stores-dryrun.mjs`, same engines, snapshot with and without the five):**

| | Without (deployed today) | With (candidate) |
|---|---|---|
| Workspaces | 66 | 66 |
| Workspaces with at least one store connection row | 5 | 5 |
| Workspaces deriving `integration_connected` | **0** | **3** (two of the five rows are not live: `status disconnected`/`unlinked`) |
| Activated | 10 | 10 |
| Lifecycle state changes | — | **0** |

So today the candidate changes no state and no activation count — activation on the commerce path needs an imported
order, not a connection, and the three connected workspaces are already past `setup_started` on other evidence. What it
fixes is the record: those three now carry the `integration_connected` event (visible in the admin's per-workspace
"meaningful events" and the risk reasons), and any future workspace whose only setup step is connecting a shop will read
`setup_started` instead of `new`. The retention sweep and the funnel now read the same picture.

**Not deployed.** Deploying it is one function by name (`functions:getActivationFunnel`), rollback = traffic back to
`getactivationfunnel-00003-cuv`. Morning decision.

## Second pass — the data model, proven per connector (11 Sep 11:10Z, code `22dedd67`)

**What the first pass could not prove.** The 03:0xZ dry run changed no workspace state; that is a fact about today's 66
workspaces, not about the reader. The reader's "live" test was `status !== "unlinked"` for Shopify and
`status !== "disconnected"` for the four OAuth connectors — words the writers do not all use.

**What the writers actually store** (from `functions/index.js` Shopify link/uninstall/unlink, `etsyConnect.js`,
`wooConnector.js`, `squareConnector.js`, `ebayConnector.js`):

| Collection | Status word on the connection row | Counted as a connection? |
|---|---|---|
| `shopifyStores` | `active` (linked) | yes |
| | `uninstalled` (app/uninstalled webhook; token cleared) | **no — the live reader counted it** |
| | `pending` (before the link completes; and after a workspace deletion unlinks the store, `companyId` cleared) | no |
| | `unlinked` (older rows) | no |
| `etsyConnections`, `wooConnections`, `squareConnections`, `ebayConnections` | `connected` | yes |
| | `reconnect_required` (Square, eBay), `needs_reconnect` (Woo): the shop is still linked, the token failed | yes |
| | `disconnected` (owner, or the platform: `ebay_account_deleted`) | no |
| | no status word (older rows) | only with a `connectedAtMs` |
| any | time = `linkedAt`/`createdAt`/`updatedAt` (Shopify) or `connectedAtMs`/`createdAt`; eBay writes `connectedAtMs: 0` on a fresh row, so `createdAt` carries it | — |

**Change on the candidate:** `lifecycle/derive.js` now judges each connector by its own words (table above); nothing
else in the file changed. `functions/test/qa/lifecycle-derive-connections.test.js` (new, 8 checks) pins connected and
not-connected rows side by side for every connector in the writers' shapes, plus the no-status row, the all-disconnected
workspace and cross-connector time order. Existing suites unchanged and green: `lifecycle-derive` 18, `activation-funnel-wiring` 8,
`lifecycle-activation` 24, `lifecycle-checklist` 11, `commerce-ebay-wiring` 14; the whole qa suite on this worktree has
one failure, `stripe-invoice-api-drift` — it looks for `functions/node_modules/stripe` on disk and this worktree links the
main tree's modules through `NODE_PATH`; CI installs and runs it properly (see the branch's run).

**Difference from the live base (`getactivationfunnel-00003-cuv`, source `088c673e`):** two things — (1) the snapshot
reads the five store collections (first pass); (2) the per-connector live predicate (this pass). A Shopify store that
was uninstalled is the case that flips: live counts it as connected, the candidate does not. Whether any of today's 66
workspaces has such a row is exactly what the dry run must say — **the dry run has to be re-run after the credentials
are renewed** (application-default credentials expired at 11:0xZ, `invalid_rapt`); until then the 03:0xZ numbers
(integration_connected 0→3, activated 10→10) describe the first pass only.

**Scope when approved:** one function, `getActivationFunnel`, deployed by name from the deploy branch after the normal
merge of this branch; no `.env`, rules, index or secret; nobody else reads `derive.js` (checked in the first pass). It
writes nothing, so a wrong count is a wrong number on the admin page and nothing more.

**Rollback:** route traffic back to **`getactivationfunnel-00003-cuv`** (the revision live since 11 Sep 01:15Z, retained),
or redeploy the function from `088c673e`.
