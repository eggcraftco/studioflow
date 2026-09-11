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

## Third pass — every production reader of derive.js, the fresh dry run, the exact scope (11 Sep 11:28Z)

**Readers of `lifecycle/derive.js` in production code (grep, and pinned by the test below):** exactly two call sites in
`functions/index.js` — `getActivationFunnel` (the admin funnel) and `nvRetentionTriggerFor`, which serves the hourly
**`retentionSweep`** and the read-time **`getRetentionMessage`**. `getSetupChecklist` does not call `deriveEvents`
(its own reads; `substantiveOrder.js` only mentions derive in a comment). No other module requires it.

**What the candidate's connection rule changes, per reader** (`functions/test/qa/lifecycle-derive-consumers.test.js`,
4 checks, on the one row that flips — a Shopify store the merchant uninstalled; the live rule is written into the test
as a literal copy of `status !== "unlinked"` so both sides are computed from the same rows):

| Reader | Live derive (today) | Candidate derive |
|---|---|---|
| Funnel stage of that workspace | the uninstalled store is a connection → the workspace sits one stage further | not a connection → one stage back; **activation verdict identical** (activation needs an imported order, not a connection) |
| Campaign selection (`retentionSweep`) | `connect_first_store` is never proposed (a connection "exists") | proposed after the setup-reminder delay (commerce path, wizard done, no imported order) |
| Pending-card review (`getRetentionMessage`, the sweep's review) | an open `connect_first_store` card is withdrawn `goal_met` by the uninstalled store | the card stays open |
| `getSetupChecklist` | untouched | untouched |

**Fresh dry run, live derive vs candidate derive on every workspace (11 Sep 11:2xZ, credentials renewed, read-only,
`activation-funnel-2026-09-11-raw/`):** 66 workspaces, 5 with store rows; status words present on the store rows today:
`shopify:active` 1, `etsy:connected` 1, `ebay:connected` 1, `woo:connected` 1, `square:connected` 1, `woo:disconnected` 1,
`square:disconnected` 1 — **no `uninstalled`, `pending`, `unlinked`, `reconnect_required` or status-less row exists today**.
Result: integration_connected workspaces 3 / 3, connected events 4 / 4, activated 0 / 0, **workspaces that differ: 0**.
So on today's data the two rules agree everywhere; the difference is a rule difference that shows the first time a
merchant uninstalls the Shopify app (the scenario the tests pin), not a change to any current number.

**Exact scope if only the funnel is deployed (the ask):** `getActivationFunnel` runs the candidate rule; `retentionSweep`
and `getRetentionMessage` keep the live rule (their own revisions `retentionsweep-00001-cob`, `getretentionmessage-00001-yoy`
are untouched by a by-name deploy of the funnel). The **behaviour difference that would remain** is the table above,
confined to workspaces that hold an uninstalled/pending/unlinked Shopify row — none today. The retention functions are
**not** made a mandatory part of this deploy: the pilot is one workspace (ours) with no Shopify row, so the split rule
cannot produce a visible inconsistency there. When the retention set is next deployed for its own reason (the e-mail stage),
it picks up the same `derive.js` and the two readers agree again — worth noting in that deploy's record, not a reason
to widen this one.

**Package, ready for approval, not run:** merge `funnel-store-connections` into the deploy branch (normal merge), pre-checks,
`firebase deploy --only functions:getActivationFunnel --project eggcraft-studio`; verify the admin funnel reads the same
counts as the fresh dry run (66 / 3 connected / activated unchanged); rollback = traffic back to `getactivationfunnel-00003-cuv`.
