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
