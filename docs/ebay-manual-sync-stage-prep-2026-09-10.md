# eBay — the controlled manual sync / preview / import stage, prepared (10 September 2026, 19:40–20:05Z)

Preparation and read-only checks only, under the operator's instruction of 19:3xZ: nothing was deployed, no
document was written, no flag or setting changed, no eBay data created. This file is the plan the next approval
would execute. No secret, token, password or code appears here.

## 0. Live state compared with the hand-off record (`docs/nivadesk-current-handoff.md`)

| Item | Record | Live (read 19:4xZ) | Same? |
|---|---|---|---|
| Deploy branch / HEAD | `macbook-save-before-macstudio-2026-06-01` @ `c5dfee5a` == origin, clean | HEAD `c5dfee5a` == `origin/…`, `git status` clean; `76c5e3c3` (Stripe) and `def97f49` (allowlist) are ancestors | yes |
| `functions/` tree | — | `git diff def97f49..c5dfee5a -- functions/` is empty: the two later commits are docs only; vs the step-2 source `05d6765e` only the allowlist change (8 files) | — |
| Local prerequisites | `functions/.env` with the three `NIVADESK_EBAY_*` lines; marker `functions/.ebay-secrets-ready` | both present (names checked, values not read) | yes |
| The seventeen | four with the switch at `-00002-`, twelve + worker at `-00001-` without it, SA `ebay-connector@`, 6 secrets | `beginebayconnect-00002-cod`, `claimebayconnectstate-00002-kub`, `ebayoauthcallback-00002-cox`, `getebayconnections-00002-jur` carry `NIVADESK_EBAY_CONNECTOR`; the other thirteen (`…-00001-…`) do not; every one on `ebay-connector`, 6 secret env refs, 100 % traffic on the latest revision | yes |
| Protected functions | unchanged | `chatgptmcp-00073-fuz`, `chatgptoauthauthorize-00045-has`, `stripewebhook-00047-por`, `resyncstripeworkspaceentitlements-00032-xej`, `getsetupchecklist-00003-noh` | yes |
| Scheduler | (not listed) | three jobs **ENABLED** at the Scheduler level — `reconcileEbayConnections` every 15 min, `…Nightly` 02:40, `reconcileEbayDeletions` every 10 min — their targets answer "connector off" / an empty ledger; last attempts 19:15Z and 19:25Z, no error | consistent (record says the sweeps run with the switch off) |
| Queue `ebayEventWorker` | maxAttempts 1, concurrency 5 | RUNNING, same limits, **no pending task** | yes |
| Flag document | `connectors = { providers: { ebay: true }, workspaces: { "ebay:GuglEFKS…": true } }` | exactly that; `shadow` (Shopify dev store) and `queue` untouched | yes |
| Connection | `…__mtm4ubrcsv2` connected, sandbox, read-only, EBAY_GB/GBP, `importState: none`, `lastSyncAtMs: 0` | same; `settings = { autoSync: true, includeUnpaid: false, includeCancelled: true }`; `lastVerifiedAtMs` 19:03:08Z; `syncLog` has one row, `connected`; `credentials/current` holds only the two encrypted boxes and their timestamps (never read); `notificationSubscriptionId` empty | yes |
| Only connection | — | `ebayConnections` has **1** document in total | — |
| Test workspace data | 0 orders, 0 customers | `siparisler` for the workspace: **0**; orders bound to the connection: 0; `externalEntities` with prefix `ebay__`: 0; `heldIntegrationOrders`: 0; `restrictedCustomer`: 0; `ebayBuyers`: 0; `musteriler`: 0; company `test`, owner = the account, 1 member, plan `team_monthly`, `billingStatus: trialing` | yes |
| Quota | calls 1 | `ebayQuota/2026-09-10`: calls 1, all from this connection, family `orders` | yes |
| Web | Settings → Integrations → eBay signed in as `contact@nivadesk.co.uk` | the live page renders the connection card (Check now, Sync now), the **"Choose what to import"** card (7/30/90 days, include-unpaid, include-cancelled, **Preview**, **Import**), the **"What comes in"** card with the **autoSync checkbox** ("Check eBay for new and changed orders automatically"), Sync health and Disconnect; the published web source equals the repo source | yes |
| Push targets | — | `companies/<cid>/deviceTokens`: **2 Web tokens**, both `contact@nivadesk.co.uk` (tr and en-GB browsers), enabled — an imported order will push "New eBay order" to these | new observation |

**Differences found: none.** Two additions to the record: the Scheduler jobs are enabled (harmless while the targets
are switched off), and the workspace holds two web push tokens.

## 1. What the manual stage needs — from the code, not from the function list

Every manual path applies orders **inline** through `applyEbayOrder` → `engine.applyEnvelope`; the queue is used
only by the notification gateway, the held-order release and buyer deletions (`enqueue(` at `ebayConnector.js:1657`
and `:1847`; `releaseHeldIntegrationOrders` in `index.js`).

| Callable | Gate (`requireLive`) | What it does | Needs the worker? |
|---|---|---|---|
| `previewEbayImport` (owner) | switch + per-connection flag + connected + environment | reads eBay `getOrders` by creation date in 7-day slices, counts, checks `externalEntities` for duplicates; **writes no order** — it writes one `syncLog` row (`import_preview`) and the sync-lock fields on the connection | no |
| `runEbayImport` (owner) | same | resumable import; `applyEbayOrder(eventOrigin: "import")` creates orders (the only origin allowed to create before `importState = done`); writes `importState/importCursor/importCounters`, `commerceCursors`, `syncLog` | **only if an order is `held`** — `integrationOrderCapacity` uses the plan's `orderLimit`; `team_monthly` has `orderLimit: null` → unlimited → nothing is held on this workspace |
| `syncEbayNow` (member) | same | `reconcileConnection(force, last 24 h)` inline; before the first import it creates nothing (`awaiting_first_import`), afterwards it creates only if `autoSync` is on, and **updates existing orders regardless of `autoSync`** | no |
| `retryEbayImportFailures` (owner) | same | re-applies the ids an import left in `importCursor.failedIds` | no |
| `updateEbayConnectionSettings`, `verifyEbayConnection`, `disconnectEbay`, `revealRestrictedCustomer`, `getEbayConnections` | **no switch, no flag** | already usable at their live revisions | no |

**Exact deploy list for this stage (by name, from `c5dfee5a`):** `previewEbayImport`, `runEbayImport`,
`syncEbayNow`. Optional: `retryEbayImportFailures` (only if an import reports failures; can follow later).
**Not deployed, stays switched off:** `reconcileEbayConnections`, `reconcileEbayConnectionsNightly`,
`reconcileEbayDeletions`, `ebayNotifications`, `ebayEventWorker`; and no reason to touch `verifyEbayConnection`,
`updateEbayConnectionSettings`, `disconnectEbay`, `revealRestrictedCustomer`, the four already switched on, or
anything outside eBay. The shared `.env` line rides only on the functions named.

Today, pressing **Sync now** on the live page fails with *"eBay is not enabled on this server yet."*
(`syncebaynow-00001-gun` has no switch); the button is visible because `getEbayConnections` reports the connection
as on. Expected until the deploy.

Deploy command for the approval step (after the runbook checks in `docs/audit-deploy-checklist.md`):

```bash
npx firebase deploy --project eggcraft-studio --only functions:previewEbayImport,functions:runEbayImport,functions:syncEbayNow
```

## 2. `autoSync`, and what the allowlist does and does not cover

**Turning `autoSync` off, the supported way:** the owner unticks *"Check eBay for new and changed orders
automatically"* on the "What comes in" card → `updateEbayConnectionSettings({ settings: { autoSync: false } })`
→ `settingsOf` whitelist → `ebayConnections/…/settings.autoSync = false`. The callable is live and ungated; no
deploy, no flag, no script. (`ebayConnections` is server-only in the rules; nothing else can write it.)

Effect, read from the code: `eligibleRows` skips the connection for both sweeps (`ebayConnector.js:1324`);
`applyEbayOrder` refuses to **create** an order from any origin but `import` (`:1142`, `auto_sync_off`); updates of
an existing order still flow through Sync now and the sweeps. So with `autoSync` off: Import creates, Sync now
updates, nothing creates on its own — and a later deploy of the sweeps/worker with the shared `.env` no longer
starts automatic processing of this connection. **Recommendation:** untick it before the stage deploy (approval
needed: one settings write). Trade-off to remember for the later payment/refund/shipping stages: a *second*
sandbox order created after the first import is not created by Sync now while `autoSync` is off; it needs another
Import (the web hides the import card once `importState = done`; the callable still accepts a fresh run) or the box
ticked again for that test.

**Allowlist scope — verified, with the exact mechanism:** `connectors.workspaces` is consulted only by
`beginEbayConnect`, the native claim and the callback (flags.js: "the gate on STARTING a connection"). The manual
callables and the worker are gated **per connection** instead: `requireLive` → `flagOn(connectionId)` (an exact
`connections["ebay:<id>"]` entry beats `providers.ebay` beats the global switch), plus `loadOwnedConnection`, which
refuses a connection whose `companyId` is not the caller's workspace; the worker (`processEbayCommerceTask`) gates
the same way and takes `companyId` from the connection document, never from the task; the engine refuses an
identity already bound to another workspace (`identity_bound_to_other_workspace`). Since the allowlist lets only
the test workspace begin a connection and `ebayConnections` holds exactly that one connection, every manual
operation and every worker task can only act on the test workspace. **No flag change is required** for this stage.
Optional belt-and-braces (one flag write): `connectors.connections["ebay:GuglEFKSEKNTq1xibFpJav3EWkY2__mtm4ubrcsv2"] = true`,
which changes nothing today but makes the per-connection scope explicit if `providers.ebay` is ever turned off.

## 3. Test data: is there a sandbox order? — none on our side; the eBay side could not be listed read-only

- **NivaDesk side, proven read-only (§0):** no import has ever run (`importState: none`, one `syncLog` row), 0
  orders, 0 identities, 0 held rows, 0 buyer-index rows, 0 restricted customers.
- **eBay side:** the sandbox seller's own pages in the operator's Chrome session (signed in as
  `testuser_nivadesk_seller1`) do not render — My eBay summary shows "Sorry, something went wrong", `/mys/sold`
  is blank, `/mys/active` says "There was a problem loading your items", Seller Hub `/sh/ord` is "missing" in the
  sandbox. `verifyEbayConnection` discards the `getOrders` result and writes `lastVerifiedAtMs`, so it neither
  counts nor is read-only. The seller was registered today and has never listed an item, so no order can exist
  unless one is created; **the definitive read-only count is the Preview step itself once
  `previewEbayImport` is deployed** (writes one `syncLog` row, no order).
- Conclusion: **a real Sandbox order has to be created before the acceptance test.** Nothing from the emulator
  suite or the synthetic fixture (`test/fixtures/ebay-synthetic-order.json`, `12-09113-42375`, PAID) is
  sandbox evidence and none of it is presented as such.

**Steps to create one real Sandbox order (operator-run, not executed, each a later approval):**

1. **A sandbox buyer test user** — developer.ebay.com → *User Access Tokens* → *Register a new Sandbox user*
   (e.g. `TESTUSER_nivadesk_buyer1`); the operator sets its password; a buyer distinct from the seller is
   required. eBay's own note: buying from the same IP/browser as the seller can be refused — use a separate
   browser profile or network for the buyer.
2. **A fixed-price listing by the seller** — either (a) the sandbox site's *Sell* flow signed in as the seller
   (unreliable: the sandbox seller pages failed today), or (b) the API Explorer
   (developer.ebay.com/my/api_test_tool → Trading API, Sandbox) with a **seller** user token that the Explorer
   mints in the operator's own session (the tool displays the token: the operator runs this step alone and the
   assistant does not read that screen), call `AddFixedPriceItem`: site UK (3), a leaf category, condition New,
   `StartPrice` ~£5, `Quantity` 2, one `PictureDetails` URL, `ListingDuration GTC`, `Country GB`,
   `Currency GBP`, `Location`/`PostalCode`, `DispatchTimeMax 1`, flat `ShippingDetails` for GB, a `ReturnPolicy`,
   and **`AutoPay false`** — eBay's knowledge base says sandbox checkout works only for non-immediate-payment
   listings (KB 2178). Our connection's token is read-only and is never used for listing.
3. **The purchase by the buyer** — (a) sandbox site as the buyer: *Buy It Now* → *Commit to Buy* → checkout /
   pay (KB 2178's documented flow), or (b) the API Explorer with a **buyer** user token: Trading API
   `PlaceOffer` (`Offer.Action Purchase`, `Quantity 1`, `MaxBid` = price, `EndUserIP`). Whether the resulting
   sandbox order ends as `PAID` is not stated in eBay's documentation; if it stays `PENDING`, the import's
   *"Include orders that are not paid yet"* box (`includeUnpaid`) is the lever, and the plan below records which.
4. Wait a few minutes, then **Preview** (expect `ordersFound 1`, `duplicatesPrevented 0`).
5. For the restricted-customer check the buyer should carry a full name, address and phone (the design's §8.1
   fixture also lists an `addressLine2`, `companyName`, a checkout note, a gift message, a personalised aspect
   and two lines — optional for this stage, useful for the sanitize evidence).

## 4. Acceptance plan for one order (evidence to be captured in a raw folder, read with the redacting script)

Preconditions (each a separate approval): `autoSync` off (§2); the three functions deployed (§1); flag document
unchanged (or the optional connection entry); the sandbox order exists (§3).

| # | Action (web, as the owner) | Expected, from the code | Evidence |
|---|---|---|---|
| 1 | *Sync now* **before** any import (optional negative check) | `skipped 1`, reason `awaiting_first_import`; UI "Synced: 0 new"; no order, no identity | `syncLog` `sync_completed`, `lastReconcile.orders.skipped 1`, `siparisler` count 0 |
| 2 | *Preview*, 7 or 30 days | `ordersFound 1`, `duplicatesPrevented 0`, `unpaid` 0/1 by the order's payment status; **no order, no identity, no restricted doc, no push** | `syncLog` `import_preview`; `siparisler`/`externalEntities` counts unchanged (0); `syncLockUntilMs` back to 0 |
| 3 | *Import* (tick include-unpaid only if Preview said the order is unpaid) | outcome `created 1`, `complete true`; `importState done` | order `siparisler/ebay_GuglEFKSEKNTq1xibFpJav3EWkY2_<orderId>`: `companyId` = test workspace, `commerce.provider "ebay"`, `commerce.connectionId` = the connection, `commerce.externalId`/`orderNumber` = the eBay order id, `commerce.paymentStatus`/`fulfillmentStatus`/`grandTotal`/`currency GBP`, `customerName` = buyer **username** (or the ship-to name when eBay supplies it), `customFields.Source "eBay"`, `"eBay Order ID"`, `"eBay Buyer"`, `orderValue` = grand total, `paidAmount` = total if PAID else 0, `deliveryCost`, `taxAmount`, `taxResponsibility`, `status/designStatus "Not Yet"`, `deliveryTime` = the workspace default, **`emailAddress`, `whatsappNumber` and the shipping address fields empty** (the person is split off); identity `externalEntities/ebay__<connectionId>__order__<orderId>` with `companyId` + `nivadeskOrderId`; `companies/<cid>/restrictedCustomer/<orderDocId>` with the buyer's fields; one `ebayBuyers` row; connection `importCounters.created 1`, `syncLog` `import_started`, `order_imported`, `import_finished`; a `commerceCursors` pass row; `commerceHealth` success; quota +N |
| 4 | *Sync now* after the import | `noop 1` (same content hash), `created 0`; still one order, one identity; `commerce.lastEventKey` now `reconcile@…` | counts unchanged; `syncLog` `sync_completed` |
| 5 | A second import of the same order (the web hides the card after `done`; run the callable once more, or wait for the second-order test) | `duplicate` under the same event key or `noop` under a new one; **no second document** | counts unchanged |
| 6 | Cross-workspace | `ebayConnections` still 1; every `siparisler` document with `commerce.provider == "ebay"` has `companyId` = the test workspace; no other workspace's order count moved; a foreign call is refused by `loadOwnedConnection` (`permission-denied`) — proven by code and by the counts, no foreign call is made | read-only query |
| 7 | Side effects | **push "New eBay order" to the two web tokens of `contact@nivadesk.co.uk`** (best-effort, FCM); **no e-mail** — the import path sends none, and `notifyCustomerOnStatusChange` returns at "neither channel" because the safe half carries no e-mail or phone; no in-app notification (only a `held` order writes one); `commerceReviewQueue` row only if the envelope flags review (missing total / uncatalogued item) — then the "Needs review" card shows it | the push is the one user-visible side effect; record it |

Not part of this stage: payment changes, refunds, shipping/fulfilment, cancellations, a second order, the sweeps, notifications, production.

## 5. Rollback

| What | How |
|---|---|
| The three functions | `gcloud run services update-traffic previewebayimport --to-revisions previewebayimport-00001-vul=100 --region europe-west2 --project eggcraft-studio`; likewise `runebayimport → runebayimport-00001-tod`, `syncebaynow → syncebaynow-00001-gun` (and `retryebayimportfailures-00001-pep` if deployed) — those revisions have no switch, so the callables refuse again within seconds; no redeploy, no `.env` edit |
| `autoSync` | tick the box again (same callable) |
| Flag document | nothing to undo unless the optional connection entry was written — then delete that one key |
| Imported test data (approval, script to be written) | delete the order document, the `externalEntities` identity, the `restrictedCustomer` document, the `ebayBuyers` row, any `commerceReviewQueue` row, the connection's `commerceCursors` and `commerceHealth` rows and the new `syncLog` rows; reset the connection fields `importState "none"`, remove `importCursor/importCounters/importStartedAtMs/importFinishedAtMs`, `lastSyncAtMs 0`, `lastReconcile`. The design's `purgeEbaySandboxRows` is **not implemented** in the code (grep: no such symbol) |
| eBay side | the sandbox listing/order can stay (sandbox data) or the listing can be ended by the seller |

## 6. Not done, by instruction

No deploy, no Firestore write, no setting or flag change, no eBay listing, buyer or order, no Check now / Sync now
press, no Google message or test, nothing on the OpenAI, review or Stripe surfaces. The sandbox tab opened for the
read-only check was closed; the two existing Chrome tabs were left as they were.
