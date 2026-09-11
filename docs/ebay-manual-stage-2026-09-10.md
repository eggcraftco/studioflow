# eBay — manual sync / preview / import stage, execution record (10 September 2026, from 19:44Z)

Approved scope: `docs/ebay-manual-sync-stage-prep-2026-09-10.md` (prepared read-only) plus the operator's approval of
19:4xZ. No secret, token, password or code appears here. Raw records: `docs/ebay-manual-stage-2026-09-10-raw/`.

## 1. Done, in order

| Time (Z) | Step | Result / evidence |
|---|---|---|
| 19:46:57 | `autoSync` off through the web checkbox "Check eBay for new and changed orders automatically" (owner session, the ungated `updateEbayConnectionSettings` at its live revision) | server record `settings = { autoSync: false, includeUnpaid: false, includeCancelled: true }`, `updatedAt` 19:46:57.261Z. **Stays off** at the end of the stage and in any rollback |
| 19:47 | Push suppression: no supported per-workspace/per-type setting exists — `sendPushNotificationToCompany` sends to every `companies/<cid>/deviceTokens` row with `enabled !== false`; `enabled:false` is written only by FCM's invalid-token cleanup, and the web's only switch (`unregisterWebPush`) deletes the row. Nothing changed, per instruction; reported before the order step; the operator accepted the push to the two web tokens of `contact@nivadesk.co.uk`. No e-mail path exists in the import flow | code read, §2 of the prep doc |
| 19:47:18–19:50:11 | Deploy of the three by name from `8352ea5e` (functions tree `4fdb8994` == CI-green `def97f49`), runbook pre-checks green (Stripe/allowlist ancestors, clean tree, `.env` + marker, HEAD == origin, gcloud token) | `previewebayimport-00002-hac`, `runebayimport-00002-caw`, `syncebaynow-00002-buq` — Ready, 100 % traffic, SA `ebay-connector`, 6 secrets, `NIVADESK_EBAY_CONNECTOR` present, source hash `8ec990e6` (same as the four); the other thirteen unchanged at `-00001-` without the switch; protected revisions unchanged (`01-deploy-chain.log`, `02-firebase-deploy-output.log`) |
| 19:50:57–19:51:14 | The three uploaded source archives compared with the tree | 385 files each; the only differing file is the untracked, ignored emulator log `firestore-debug.log`, rewritten by the emulator run below after the upload (`03-source-archives.log`) |
| 19:48:50–19:48:59 | Existing emulator suites run locally on the same tree (engine + eBay connector) | both green: "the same external id in another connection is another order (TEST-004, DATA-002)", the flag/workspace gates, the connection-id isolation boundary in `ebay-connect.test.js` (targeted run, PASS) (`04-emulator-suites.log`) |
| 19:51:40 | **Preview, 90 days** from the web (owner) — the first real Sandbox API read after the deploy | HTTP 200 in 5.35 s on `previewebayimport-00002-hac`; UI "Orders found: 0 · Duplicate orders prevented: 0 · Not paid yet: 0 · Cancelled: 0"; `ebayQuota` 1 → 14 calls (13 creation slices, all successful — an API error surfaces as an error, not as zeros); `syncLog` `import_preview` "0 found"; orders/identities/held/buyers/restricted all still 0 (`05-preview-function-log.json`, `06-preview-readback.txt`) |
| 19:5x–20:0x | Sandbox test data preparation: buyer test user form filled (`TESTUSER_nivadesk_buyer1`, site UK) — password and *Register* by the operator, who confirmed the registration; API Explorer set to Sandbox / site (3) UK / Trading API, request URL `https://api.sandbox.ebay.com/ws/api.dll` | the operator completed the seller's "Get OAuth User Token" consent once; the first `GetUser` executed afterwards answered `Failure` with `Header "X-EBAY-API-APP-NAME" does not exist` (error 10011) twice — the Explorer sent the call **without a user token** (the page had been re-rendered by an operation change in between), so the seller identity is **not yet verified** |

| 22:0x–22:1x | The Explorer session had expired by the time the first re-attached token was used ("Your session expired. Please refresh the page and try again."); the page was refreshed (site UK, GetUser body prepared) and the operator signed in as the seller once more (sandbox sign-in page showed `testuser_nivadesk_seller1`, consent "Review and Grant Application Access: NivaDesk" — an Explorer-only token; NivaDesk's stored read-only connection unchanged) | — |
| 21:13:54 (eBay clock) | `GetUser` with the seller's Explorer token, Sandbox, site (3) UK | `Ack Success`; `Email contact@nivadesk.co.uk`, `RegistrationDate 2026-09-10T18:52:04Z`, `NewUser true`, feedback 500 — the seller registered at 18:52Z with that address (the response viewer truncated before the `UserID` element; the sign-in page named `testuser_nivadesk_seller1`) |
| 21:17:24 | `VerifyAddFixedPriceItem` (site UK, category 75576, £5.00, quantity 2, `AutoPay false`, picture `https://nivadesk.app/icon.png`, flat Royal Mail 2nd class £1.00, returns 30 days) | `Ack Warning` — two warnings only: `RefundOption` ignored (21916711), additional postage cost not given; no error → the listing is acceptable |
| 21:18:22 | **`AddFixedPriceItem`**, same body without `RefundOption` and with `ShippingServiceAdditionalCost 0.00` | **`Ack Success`, ItemID `110590626185`**, StartTime 2026-09-10T21:18:22Z, EndTime 2026-10-10T21:18:22Z — one synthetic sandbox listing on the seller's account |

| 22:3x | Resolution of §2a: `TESTUSER_nivadesk_buyer1`'s password was not accepted (the operator could sign in only as the seller), so a **second buyer** was registered — form filled by the assistant (`TESTUSER_nivadesk_buyer2`, Niva Buyer, `contact+ebaybuyer2@nivadesk.co.uk`, site UK), password and *Register* by the operator; the portal confirmed "You have successfully registered sandbox user TESTUSER_nivadesk_buyer2". The Explorer token flow was then driven step by step (Switch account → buyer2 → the operator's password → consent) | — |
| 22:4x | `GetUser` with the new Explorer token (site UK) | `Ack Success`, **`Email contact+ebaybuyer2@nivadesk.co.uk`** — the buyer, not the seller |
| 22:4x | **`PlaceOffer`** as the buyer: `Action Purchase`, `Quantity 1`, `MaxBid 5.00 GBP`, `ItemID 110590626185` (site UK) | **`Ack Success`, TransactionID `10000012799510`, OrderLineItemID `110590626185-10000012799510`**, current price 5.0 — one sandbox order now exists on the seller's account (`AutoPay false`: payment status to be read from the Fulfillment API by NivaDesk's preview) |

| 21:44:15 (eBay clock) | NivaDesk **Preview, 7 days** (owner, web) after the purchase | `ordersFound 0` — one `getOrders` call (quota 14 → 15), `syncLog import_preview "0 found"`; the new order is not yet visible through the Fulfillment API |
| 21:45:29 | Trading `GetOrders` as the **buyer** (`OrderRole Buyer`, today, `OrderStatus All`) | `Ack Success`, one order: **OrderID `110590626185-10000012799510`, OrderStatus `Active`, AmountPaid 0.0 GBP, eBayPaymentStatus `NoPaymentFailure`** — the order exists on eBay's side, unpaid (AutoPay off, checkout not completed) |

## 2b. Blocker — the order exists on eBay but the connector cannot see it: the Fulfillment API returns only checkout-complete (paid) orders

| Time (Z) | Check | Result |
|---|---|---|
| 21:44:15 | NivaDesk Preview, 7 days | `ordersFound 0` |
| 21:45:29 | Trading `GetOrders` (buyer role, today, all statuses) | the order **is** there: `110590626185-10000012799510`, `OrderStatus Active`, `AmountPaid 0.0 GBP`, `eBayPaymentStatus NoPaymentFailure` |
| 21:46:00 | NivaDesk Preview, 7 days (second run) | `ordersFound 0` |
| 21:51 (after a ~5-minute propagation wait) | NivaDesk Preview, 7 days (third run) | `ordersFound 0` — not a propagation delay |

**Reading.** The connector reads eBay's **Sell Fulfillment API** `getOrders` (`sell.fulfillment.readonly` — the only scope this
connection has). That API covers orders whose **checkout is complete**; an order awaiting payment is not in it
(eBay KB 5204; Fulfillment API Overview). `PlaceOffer` with `AutoPay false` creates exactly such an order: committed,
`Active`, unpaid. So NivaDesk is behaving correctly — there is nothing for it to read yet. The web card's
*"Include orders that are not paid yet"* cannot help either: that flag filters orders the API returned with
`orderPaymentStatus PENDING`, and this order is not returned at all.

**What would make it visible:** the order has to be paid / checkout-completed in the sandbox. Options, none taken:

1. **Trading `CompleteSale` with the SELLER's token** — one call (`ItemID`/`TransactionID` or `OrderID`, `<Paid>true</Paid>`),
   the seller marking the order as paid, which is how offline-payment orders are settled. Needs the Explorer's user token
   switched back to `TESTUSER_nivadesk_seller1` (one operator sign-in). No card, no money, no production.
2. **The buyer pays on the sandbox site** (`Pay now` in Purchase History) — the sandbox site pages have been returning
   errors for this account all evening (`/mys/*`, `/myb/PurchaseHistory` → "Error Page"), so this is unreliable.
3. **Order API v2 checkout session** (`initiateCheckoutSession` → `placeOrder`) — **not viable here**: the buyer token's
   granted scopes do not include member checkout, guest checkout needs card details (which the assistant never enters),
   and eBay restricts that API.

**Recommended:** option 1. It is a single seller-token call and touches nothing outside the sandbox.

## 2c. The order's real state, checked against eBay's own documentation (22:0xZ, read-only)

**The order, from Trading `GetOrders` (buyer role, `OutputSelector` limited to the status fields):**

| Field | Value |
|---|---|
| `OrderID` | `110590626185-10000012799510` |
| `OrderStatus` | `Active` |
| `CheckoutStatus.Status` | **`Incomplete`** |
| `CheckoutStatus.PaymentMethod` | **`None`** |
| `CheckoutStatus.eBayPaymentStatus` | `NoPaymentFailure` (no failed payment — not a statement that one was made) |
| `AmountPaid` | `0.0 GBP` |

**Checkout complete vs payment taken — two different things, and here neither has happened.** `PlaceOffer` with
`Action Purchase` created the order line item (the commitment to buy), but the buyer never entered checkout: no payment
method was chosen (`PaymentMethod None`) and checkout is `Incomplete`. Payment is a separate step after that, and
`AmountPaid` is 0.

**Why NivaDesk cannot see it.** The Fulfillment API overview states the API "includes only transactions that have
completed checkout", and adds that `getOrders` leaves out pending-payment purchases that require payment before
shipment. Our order fails the first test — checkout itself is incomplete — so it is outside the API the connection
reads (`sell.fulfillment.readonly`). Three previews returning 0 are the connector behaving correctly, not a defect.
The *"Include orders that are not paid yet"* switch cannot reach it either: that filters what the API returned.

**Does the Order API method complete this order? No — it makes a new one.** `placeOrder`
(Order API v1, `/checkout_session/{checkoutSessionId}/place_order`) is documented as creating the purchase order,
paying for it and ending the checkout session it was given; it acts on a checkout session the caller opened with
`initiateCheckoutSession`, not on an order that already exists. So it would produce a **second, different order** and
leave `110590626185-10000012799510` exactly as it is. It also needs the `buy.order` scope (the buyer token holds
`buy.order.readonly` and `buy.guest.order`, not that one), is restricted by site and, per its own note, involves a
credit card — which the assistant does not enter. **Not viable, and not the way to finish this order.**

**The supported way to finish THIS order — Trading `CompleteSale`, called by the SELLER.** The call's documented
purpose includes marking an order as paid, and its request carries a `<Paid>` boolean alongside `OrderID` /
`OrderLineItemID`; the documentation notes it is normally used after the buyer has paid but may be called by the
seller beforehand.

* **Exact call:** `CompleteSale` with `<OrderLineItemID>110590626185-10000012799510</OrderLineItemID>` (or
  `ItemID` + `TransactionID`) and `<Paid>true</Paid>`. Site UK, Sandbox.
* **Effect on this order:** it marks *this* order as paid on the seller's side; no new order is created, the listing is
  untouched, no money and no card are involved. What it does **not** do, on the documentation's own wording, is
  promise that `CheckoutStatus.Status` flips to `Complete` — that is the property the Fulfillment API tests. So the
  honest expectation is: run it, then re-read `GetOrders` for `CheckoutStatus.Status` and run one NivaDesk preview. If
  checkout still reads `Incomplete`, marking paid was not enough and the remaining route is a real buyer checkout.
* **Access needed:** the Explorer's user token switched back to `TESTUSER_nivadesk_seller1` — one operator sign-in and
  consent. Nothing about NivaDesk's stored connection, its `sell.fulfillment.readonly` scope or `autoSync: false`
  changes.

**The sandbox web checkout — correction: it is available, we were simply signed out.** `/myb/PurchaseHistory` kept
answering with eBay's "We looked everywhere" page, and the same was true of `/mys/sold`, `/mys/active` and `/sh/ord`
earlier this evening. At 22:0xZ the sandbox **home page rendered normally and its toolbar reads "Sign in"** — the
browser has no session on `www.sandbox.ebay.com`. The OAuth consent sign-ins all happened on `signin.sandbox.ebay.com`
inside the Explorer's token flow and did not leave a site session behind. So those error pages were the signed-out
state, not broken pages, and the earlier note calling this route "unreliable" was wrong.

This makes the **normal buyer checkout the first thing to try**, and it is the route that properly sets
`CheckoutStatus.Status` to `Complete` — exactly what the Fulfillment API tests, and something marking the order paid
from the seller's side may not achieve. Operator step: sign in on the sandbox **site** as `TESTUSER_nivadesk_buyer2`,
open Purchase History, and complete checkout on the £5.00 order (the listing is `AutoPay false`, so the order is
sitting unpaid and awaiting exactly this). No real card: the sandbox uses test payment methods, and the assistant
enters no payment details.

## 2d. The buyer signed in on the sandbox site; checkout is still not complete (22:0xZ)

The operator signed in on `www.sandbox.ebay.com` as the buyer: the toolbar reads **"Hi testuser_nivadesk_buyer2!"**,
the home page and the listing page render normally. So the site works and the session is real.

**But `/myb/PurchaseHistory` still answers with eBay's "We looked everywhere" page while signed in.** My earlier note
saying those errors were purely the signed-out state was wrong in this part: the page is unavailable in this sandbox
whether or not there is a session. Recorded rather than smoothed over.

**The order did not move.** Trading `GetOrders` (buyer role) immediately after the sign-in:

| Field | Value |
|---|---|
| `OrderStatus` | `Active` (unchanged) |
| `CheckoutStatus.Status` | **`Incomplete`** (unchanged) |
| `CheckoutStatus.PaymentMethod` | `None` (unchanged) |
| `AmountPaid` | `0.0 GBP` (unchanged) |
| last modified | 2026-09-10T21:42:09Z — the purchase itself, nothing since |

Signing in is not checkout. Something still has to walk the order through payment, and the page that normally offers
that is missing here.

## 2e. `CompleteSale` run with the seller's token (22:1xZ)

The operator approved the attempt and signed the Explorer's user token back in as `TESTUSER_nivadesk_seller1`
(Switch account → seller → password → consent; the assistant typed only the username). The Explorer's return address
was set to the CompleteSale screen beforehand.

| | |
|---|---|
| Call | `CompleteSale`, site (3) UK, Sandbox |
| Body | `<OrderLineItemID>110590626185-10000012799510</OrderLineItemID>` and `<Paid>true</Paid>` — nothing else |
| Result | **`Ack Success`**, no error and no warning returned |

That the call succeeded also proves the token is the seller's: only the seller of an order may mark it paid. No new
order, no listing change, no money, no card, no change to NivaDesk's stored connection or its scopes.

**Still to be measured (the point of the exercise):** whether marking the order paid also moved
`CheckoutStatus.Status` from `Incomplete` to `Complete`, which is the property the Fulfillment API tests, and whether
NivaDesk's preview can now see the order. Both readings follow in §2f.

## 2f. The order is now checkout-complete and paid — the open question from §2c is answered (22:16Z)

Trading `GetOrders`, **seller role**, immediately after the `CompleteSale`:

| Field | Before (§2c / §2d) | After |
|---|---|---|
| `OrderStatus` | `Active` | **`Completed`** |
| `CheckoutStatus.Status` | `Incomplete` | **`Complete`** |
| `AmountPaid` | `0.0 GBP` | **`6.00 GBP`** — £1.00 more than the £5.00 listing price. **Resolved in §2j** from the full order: £5.00 item + £1.00 Royal Mail 2nd Class postage, no tax (my earlier note that the listing page advertised free postage was a misreading) |
| `PaidTime` | — | **2026-09-10T22:16:30.208Z** |
| `CheckoutStatus.PaymentMethod` | `None` | `None` (unchanged; the order was settled by the seller's mark, not by a payment instrument) |

So marking the order paid **did** move checkout to `Complete`. The documentation only promised the paid mark, so this
was measured rather than assumed, and the answer is yes for this sandbox.

**The NivaDesk preview run seconds later still returned `Orders found: 0`.** The order had been checkout-complete for
under a minute at that point, so this reads as propagation into the Fulfillment API rather than the structural
exclusion of §2b, which no longer applies. One bounded wait and a single re-check follow — not a polling loop.

## 2g. Decisive: eBay's own Fulfillment API does not have the order either (22:2xZ)

The preview was run once more after a single bounded three-minute wait, and then the same question was put to eBay
directly, with the **seller's** token, through the API Explorer.

| Check | Time (Z) | Result |
|---|---|---|
| NivaDesk preview, 7 days | 22:17:52 | `Orders found: 0` |
| NivaDesk preview, 7 days | 22:20:52 | `Orders found: 0` (quota 17 → 19 across the two, so both calls really ran) |
| **Fulfillment API `GET /sell/fulfillment/v1/order`** (the exact API and scope the connector uses) | ~22:23 | **HTTP 200, `{"total": 0, "limit": 50, "offset": 0, "orders": []}`** |
| Trading `GetOrders`, seller role | 22:16 | the order is there: `Completed`, checkout `Complete`, `AmountPaid 6.00 GBP` |

**Reading.** Roughly seven minutes after the order became checkout-complete and paid, eBay's Fulfillment API returns
an empty list for this seller — not a filtered-out order, an empty account. The Trading API shows the same order as
completed and paid at the same moment. So the two APIs disagree, and NivaDesk is reading the one that has nothing in
it. **Verified:** the Trading API's checkout and payment state; the Fulfillment API's empty list. **Not verified:** any part of NivaDesk's import against a real order. **The most likely reading is a sandbox-side gap** — an order created and settled through the Trading API not reaching the Sandbox's Fulfillment service — but that is an inference, not a proof: the connector's only order source is `sell.fulfillment.readonly`, and its import path has still **not** been exercised against a real order. The import acceptance tests (one order in; identity, amount, currency, payment and fulfilment match; no duplicate on re-import and Sync now) remain **not completed**, and a defect on NivaDesk's side of that path cannot be ruled out from tonight's evidence.

**What this leaves.** The order was made with `PlaceOffer` and settled with `CompleteSale`, both Trading API calls,
which is the only route this sandbox allowed (the buyer's web checkout pages are missing or reporting themselves down,
§2d.1). An order created and paid that way may simply never reach the Sandbox's Fulfillment service, or may reach it
after a delay far longer than anything worth polling for. Both are consistent with what was measured; neither can be
distinguished from here tonight.

**Stopped here deliberately.** No more probing, no polling loop. The order, the listing and the two test users stay in
the sandbox as they are. NivaDesk's side is untouched: **0 orders, `importState: none`, `autoSync: false`**, the
connection still read-only with its two scopes, nothing deployed.

**If this is picked up again**, the one cheap thing worth doing is a single Fulfillment `getOrders` call and a single
NivaDesk preview after some hours have passed. If the list is still empty, the honest conclusion is that this sandbox
cannot produce a Fulfillment-visible order through the Trading route, and the order/import acceptance tests need
either a working buyer checkout in the sandbox web UI or a different sandbox seller account.

### 2d.1 The two other buyer-side entry points, probed once each — both unusable

| Page | Result (22:0xZ) |
|---|---|
| `www.sandbox.ebay.com/myb/PurchaseHistory` | eBay's "We looked everywhere" missing-page error, **while signed in** |
| `www.sandbox.ebay.com/mye/myebay/purchase` | eBay's **"It's not you. It's us. Our server is down"** page; its toolbar shows `Hi! (Sign in)` |
| `cart.sandbox.ebay.com` | renders, empty cart, toolbar also `Hi! (Sign in)` |

Two things are true at once: the session exists on `www.sandbox.ebay.com` (its home and the listing page greet
`testuser_nivadesk_buyer2`) but not on the other sandbox hosts, and eBay's own My-eBay purchase service is reporting
itself down in this sandbox. Neither is something this project can fix or work around, and no further URLs were tried
— three probes, no loop.

**So the buyer-side web checkout is not available today.** The only remaining supported route to finish this order is
the seller-side one in §2c: Trading `CompleteSale` with `<Paid>true</Paid>` on
`OrderLineItemID 110590626185-10000012799510`, which needs the Explorer's user token switched back to
`TESTUSER_nivadesk_seller1` (one operator sign-in), and which may or may not move `CheckoutStatus.Status` to
`Complete` — the documentation promises the paid mark, not the checkout state. Awaiting the operator's decision; nothing
was run.

**Independent confirmation the purchase is real.** The listing's own page on the sandbox site
(`www.sandbox.ebay.com/itm/110590626185`, read while signed out) renders normally and shows **"Last one · 1 sold"**,
seller `testuser_nivadesk_seller1`, GBP 5.00, free Royal Mail 2nd Class, 30-day returns. One of the two units is gone,
which is the `PlaceOffer` purchase.

**Ready for the operator.** The sandbox sign-in page is open in the fourth tab with a return to Purchase History, and
it already names `testuser_nivadesk_buyer2`; only the password is missing, which is the operator's to type.

**Nothing was run against the order.** No second order was created, no `CompleteSale`, no listing change, no payment
detail entered.

## 2i. Re-check ~2.5 hours later: one raw Fulfillment query (11 Sep ~00:12Z, seller token, Sandbox)

Run in eBay's API Explorer against the **NivaDesk sandbox keyset** (`EGGCRAFT-NivaDesk-SBX-…`, the same application
NivaDesk's stored connection uses) with a user token consented minutes earlier by **`testuser_nivadesk_seller1`** (the
sign-in page named that account; the previous, expired token had answered `401 Invalid access token`). Environment
radio **Sandbox**; request host `api.sandbox.ebay.com`. No token or customer field is reproduced here.

| | |
|---|---|
| Request | `GET /sell/fulfillment/v1/order?filter=creationdate:[2026-09-10T21:00:00.000Z..2026-09-11T00:05:00.000Z]&limit=50&offset=0` — the window contains the order's creation (21:42:09Z) and its settlement (22:16:30Z) |
| Attempts, counted honestly | **three executions of the Fulfillment call tonight:** (1) `401 Unauthorized`, error 1001 "Invalid access token" — the Explorer's earlier seller token had expired; the operator signed the seller in again; (2) `400 Bad Request`, error 30850 "The start and end dates can't be in the future" — the end I had typed (00:30Z) was ahead of eBay's clock; (3) the corrected call below. No further retries |
| Result (third execution) | **`200 OK`**, `total: 0`, `limit: 50`, `offset: 0`, `orders: []`, the `href` echoing the filter, **no `next` link** — a single, empty page, so nothing is hiding behind pagination |

**Reading, raw vs NivaDesk.** This is eBay's own answer to the same call NivaDesk's connector makes: the Fulfillment
API holds **no order at all** for this seller in that window. NivaDesk's six previews returning `0` were therefore
faithful reports of an empty upstream, not a filter on NivaDesk's side dropping an order it had received — there was
nothing to filter. What remains unproven is NivaDesk's import path itself, which has still not seen a real order.

## 2j. The £6.00 reconciled from the real order, and the seller identity confirmed (11 Sep 00:17Z)

One full Trading `GetOrders` (seller role, `DetailLevel ReturnAll`, window 21:00Z–00:05Z, no `OutputSelector`), the
same fresh seller token as §2i. `Ack Success`, `TotalNumberOfEntries 1`, `HasMoreOrders false`.

| Field (from the order, not from the listing request) | Value |
|---|---|
| `SellerUserID` | `testuser_nivadesk_seller1` — the token and the order belong to the right sandbox seller |
| `CreatedTime` / `PaidTime` | 2026-09-10T21:42:09Z / 2026-09-10T22:16:30.208Z |
| `OrderStatus` / `CheckoutStatus.Status` / `eBayPaymentStatus` / `PaymentMethod` | `Completed` / `Complete` / `NoPaymentFailure` / `None` |
| `TransactionPrice` × `QuantityPurchased` | 5.0 GBP × 1 |
| `Subtotal` | **5.0 GBP** |
| `ShippingServiceSelected`: `ShippingService` / `ShippingServiceCost` | `UK_RoyalMailSecondClassStandard` / **1.0 GBP** |
| `TotalTaxAmount` | 0.0 GBP (no `SalesTaxAmount`) |
| `AdjustmentAmount` / `AmountSaved` | 0.0 GBP / 0.0 GBP |
| `Total` | **6.0 GBP** |
| `AmountPaid` | **6.0 GBP** |

**5.00 + 1.00 + 0.00 = 6.00.** The difference is the flat second-class postage the listing carried; nothing is
unexplained. `CompleteSale` (§2e) sent no amount at all — only `OrderLineItemID` and `Paid true` — and eBay reports `AmountPaid`
equal to the order's `Total`. `PaymentMethod` reads `None`; we have found no documentation that states why, so the
reason is left open (the seller's paid mark is not a payment transaction, and no payment instrument was ever used in
this test). The Trading `GetOrders` above was **one execution**.

## 2k. Where this leaves the stage, and a support draft (not sent)

The Fulfillment API is still empty for the seller ~2.5 hours after checkout completed (§2i), so the approved
preview → import → re-import → sync acceptance tests **stay blocked**: there is no order for NivaDesk to read. No
further queries were made, no new order or seller created, `autoSync` stays `false`, nothing deployed.

**Concrete next step:** decide whether to send the draft below to eBay Developer Technical Support (or post it on the
developer forum), and in parallel try, once, a buyer checkout through the sandbox web UI on a day the sandbox's
My eBay pages are up — that is the one route that creates an order the way real buyers do. If either produces a
Fulfillment-visible order, the acceptance tests resume from the preview step with the pilot user.

### Draft for eBay Developer Technical Support — English, not sent (revised 11 Sep after the operator's review)

> **Subject:** Sandbox — order completed via the Trading API is not returned by the Sell Fulfillment API
>
> **Environment:** Sandbox. **Application (client ID):** `EGGCRAFT-NivaDesk-SBX-05fd51f72-0f019961`.
> **Seller test user:** `testuser_nivadesk_seller1` (site UK, site ID 3). **Buyer test user:** `TESTUSER_nivadesk_buyer2`.
>
> **What we did**
> 1. `AddFixedPriceItem` (seller) created listing **110590626185** — £5.00, quantity 2, `AutoPay false`, flat postage
>    Royal Mail 2nd Class £1.00 — on 2026-09-10 at 21:17 UTC.
> 2. `PlaceOffer` (buyer, `Action Purchase`, quantity 1) at 21:42:09 UTC created order **110590626185-10000012799510**
>    (transaction 10000012799510).
> 3. `CompleteSale` (seller) with `Paid = true` at 22:16:30 UTC. Please note: this is the seller marking the order as
>    paid; **no payment transaction took place** and no payment instrument was used at any point in this test.
>
> **What the Trading API reports** — `GetOrders`, seller role, `DetailLevel ReturnAll`, 2026-09-11 00:17 UTC:
> `OrderStatus Completed`, `CheckoutStatus.Status Complete`, `eBayPaymentStatus NoPaymentFailure`,
> `PaymentMethod None`, `Subtotal 5.00 GBP`, `ShippingServiceCost 1.00 GBP` (`UK_RoyalMailSecondClassStandard`),
> `TotalTaxAmount 0.00 GBP`, `Total 6.00 GBP`, `AmountPaid 6.00 GBP`, `PaidTime 2026-09-10T22:16:30Z`.
> The amounts reconcile (item £5.00 + postage £1.00 = £6.00); there is no amount discrepancy.
>
> **What the Fulfillment API reports** — seller user token (`sell.fulfillment.readonly`), 2026-09-11 ~00:12 UTC:
> `GET https://api.sandbox.ebay.com/sell/fulfillment/v1/order?filter=creationdate:[2026-09-10T21:00:00.000Z..2026-09-11T00:05:00.000Z]&limit=50&offset=0`
> → **HTTP 200**, `{"total": 0, "limit": 50, "offset": 0, "orders": []}`, no `next` link. The window covers both the
> order's creation (21:42 UTC) and its completion (22:16 UTC). An unfiltered `getOrders` for the same seller was also
> empty at 22:23 UTC, about seven minutes after completion.
>
> **Impact:** our integration reads orders only through the Fulfillment API, so our import acceptance tests against
> this order could not be completed.
>
> **Questions**
> 1. Is this existing Sandbox order expected to appear in the Fulfillment API `getOrders` / `getOrder` responses?
>    If yes, after what delay, or is something missing on our side?
> 2. If an order created with `PlaceOffer` and marked paid with `CompleteSale` is **not** expected to appear there,
>    what is the supported way in the Sandbox to create a test order that the Fulfillment API returns? (During this
>    test the Sandbox web checkout pages — Purchase History and My eBay purchases — returned error pages for the
>    buyer, so we could not complete a buyer-side checkout in the UI.)
>
> Thank you.

**Official channel, read on the portal on 11 Sep (nothing submitted):** eBay Developers Program → Support →
**Developer Technical Support** (`developer.ebay.com/support/developer-technical-support`), tickets at
**`developer.ebay.com/my/support/tickets`**, signed in as the developer account `nivadesk`. Prerequisites stated on
that page: the developer account must have **support activated** — Profile & Contacts → Primary Contact complete
(name, e-mail, phone, country) → Edit → *Activate Support*; then the **AI-Assisted Support** tab is where a ticket is
created. eBay asks for: the application ID, the API calls used, error logs, the HTTP response header values and any
error messages — the draft carries the first two and the messages; the Trading call's reference headers are below,
the Fulfillment call's headers were not saved (capture them when submitting, the Explorer shows them next to the
response). Public alternative: the Developer Community forum (`/support/developer-community-forum`). **Not sent.**

References from the Trading `GetOrders` execution of 2026-09-11 00:17:36 UTC (not secrets): `rlogid`
`t6lwbbq%60%7Espse3%60jhs9%3Fiug%60tb%7Bquq%601ehmq%2B050eee03d%3A%28rbpv1%3E.k3e7u-1a08dd3b396-0x232f`,
`x-ebay-soa-request-id` `1a08dd3b-3970-a244-4e26-3232fff37874`, `x-ebay-pop-id` `UFES2-LVSAZ01-apisandbox`.

## 2l. Sending the ticket — operator-approved (11 Sep 2026)

The operator approved sending the §2k draft as one ticket through Developer Technical Support with the `nivadesk`
developer account, on conditions: no duplicate ticket, activation only if it carries no fee / subscription / new
agreement, no secrets, not the public forum.

| Step | Observed |
|---|---|
| Existing tickets | `My Tickets` → "No support history available" — nothing open on this or any topic |
| Activation | the developer account's support was **INACTIVE**. The Profile & Contacts edit form showed all primary-contact fields already filled (name, e-mail, phone, country GB) and, next to *Activate Support*, only the three-step instruction — **no fee, price, subscription, terms or agreement text anywhere**; the newsletter and survey checkboxes were left unticked. Clicked *Activate Support* with the existing details, unchanged → "Support for this contact is activated." → tickets page now reads **ACTIVE** (~00:44Z) |
| Note | the primary phone is stored with a `+1` country code in front of a UK number; left as it was, not corrected here |

| AI-Assisted Support (the portal's required first step, ~00:47Z) | the approved text was submitted to the portal's AI assistant (the page states it "may return inaccurate or inappropriate responses"). Its *Suggested Solution*, recorded here as **eBay's assistant's non-authoritative view, not a support answer**: orders created with Trading calls and marked paid by `CompleteSale` are reported by Trading `GetOrders` but "are not guaranteed to appear" in Fulfillment `getOrders`/`getOrder`; the Fulfillment API returns orders that went through eBay's checkout flow including a payment transaction, which `CompleteSale` does not simulate; the only supported way in the Sandbox is a buyer-side checkout through the Sandbox web UI; Sandbox checkout pages returning errors "is a known limitation and may block Fulfillment API testing". It then offered *Mark as Resolved* / **Proceed to Create a Ticket** — the latter was chosen, as approved |

| Ticket form, first attempt | *Proceed to Create a Ticket* opened a two-step form with the approved text pre-filled in *Question*. Step 1 filled: Subject "Sandbox - order completed via the Trading API is not returned by the Sell Fulfillment API", Platform APIs, Product **Fulfillment API**, Bug Report No, RlogId = the Trading call's `rlogid`, Environment **Sandbox**, Date Started 10.09.2026 (the field kept showing its placeholder while editing, but the portal recorded it). Step 2 (all optional): Programming Language "Node.js (server integration); reproduced with the eBay API Explorer", Compatibility Level 1331, Format All, Frequency 100 %, Severity Medium, Application Affected = the sandbox client ID, Error Message "No error returned: Fulfillment getOrders answers HTTP 200 with total 0 and an empty orders array for an order that Trading GetOrders reports as Completed / checkout Complete.", User IDs Affected = the two sandbox test users, Customer Impact "Sandbox only. Blocks our order-import acceptance testing against the Sell Fulfillment API; no production customers are affected." **Submit → rejected by the portal:** "The entry for 'Question' exceeds the allowed character limit. Please shorten the text or attach a text file with the additional information." Not counted as sent |
| Second attempt — **sent** | as the portal suggested: the **approved text attached verbatim** as `ebay-sandbox-fulfillment-ticket-details.txt` (2,794 bytes; the "Reference headers" line and "Response headers of the Fulfillment calls were not retained" included), and *Question* replaced by a 1,541-character condensation that keeps every required distinction (Trading state; the paid mark is not a payment; Fulfillment 200 / total 0 with the verified seller and window; import tests blocked; £5 + £1 = £6; the two questions) and points to the attachment. Everything else unchanged. **Submitted at ≈ 2026-09-11T00:47:48Z** (the portal's Complete step) |
| Confirmation | "Thank you for submitting your support request — Use this reference number for follow up: **260910-000068** — A member of our support team will get back to you within 1-2 business days. If you need to update your incident, click the My Tickets tab and select the subject to open and update it." |
| What was sent, kept in the repo | `docs/ebay-support/ticket-260910-000068-question.txt` (the Question as typed) and `docs/ebay-support/ticket-260910-000068-attachment.txt` (the attachment, byte-identical to what was uploaded). No token, Authorization header, client secret or password anywhere in either; nothing posted to the public forum |

| Ticket link and portal record | **`https://developer.ebay.com/my/support/tickets/c9be2e40-7aad-f111-aaac-6045bdff416d`** (opens only for the signed-in `nivadesk` developer account; the portal appends its own `contactId` parameter). *My Tickets* lists it as Subject "Sandbox - order completed via the Trading API is not returned by the Sell Fulfillment API", Reference 260910-000068, Platform APIs, Status **Updated**, Date Created "September 10, 2026 at 5:46:43 PM" (the portal's display time zone; = 2026-09-11 00:46:43 UTC) |

| Ticket detail page, read back after submission | *Communication History* shows the Question exactly as typed ("Customer via CSS Web", 5:46:46 PM); *Additional Details*: e-mail contact@eggcraft.co.uk, Reference 260910-000068, Created 5:46:43 PM, Updated 5:46:49 PM, Platform APIs, Product Fulfillment API, **File Attachments: `ebay-sandbox-fulfillment-ticket-details.txt` 2.79 kB**, Programming Language / Compatibility Level 1331 / Format All / Environment Sandbox / Bug Report No / RlogID / Frequency 100 % / Severity Medium / Date Started September 10, 2026 — all as filled. The page offers *Update this Question* (limit **2,000 characters** per update, plus attachments) for follow-ups |

**Stage status from here: awaiting eBay Developer Technical Support's reply on ticket 260910-000068.** No new
Sandbox tests, no deploy, `autoSync: false`, all test records kept.

## 2m. eBay's reply on ticket 260910-000068 — received, evaluated (portal "Response via Email", 10 Sep 6:32:50 PM portal time = 11 Sep 01:32:50Z)

**What eBay Developer Support wrote (summary, not verbatim):** the Sandbox environment "is currently experiencing
limitations, and order creation is not operational there"; their engineering team is working on it and "it may take some
time"; they recommend testing in **production** where applicable, following the Test Listings Policy
(`ebay.com/help/policies/listing-policies/test-listings-policy?id=5039`).

**Does it explain our result?** Yes, and it closes the open question of §2g/§2i: the order we created and settled through
the Trading API was never going to reach the Fulfillment API, because Sandbox order creation itself is not operational —
not a propagation delay, not a NivaDesk filter, and not something a different Sandbox flow would fix today. It is also
consistent with what we saw on the buyer side (Purchase History and My eBay purchases returning error pages) and with the
portal assistant's earlier non-authoritative answer. The reply gives **no ETA** and does not say whether the existing order
will surface once the Sandbox is repaired.

**The recommended method, compared with what we did.** eBay's suggestion is a real production test: a genuine listing on the
production site marked per the Test Listings Policy, bought and paid for by a real buyer account, then read through the
Fulfillment API with a production token. We did not do this and it is not started: NivaDesk's connection is a Sandbox
connection (`NIVADESK_EBAY_ENVIRONMENT`, sandbox keyset, sandbox RuName), the policy requires a listing that is clearly a
test and priced/handled so that no real sale occurs, and a purchase would still move real money or fees unless cancelled.
It needs a decision, not a repeat: nothing from tonight's Sandbox steps (listing, PlaceOffer, CompleteSale, the three
Fulfillment executions) is worth re-running.

**Options for the morning (decision 1 in the hand-off):**
1. **Wait for the Sandbox fix** — no cost, no risk, no date; ask eBay (draft below) to notify us and to confirm whether
   `110590626185-10000012799510` will appear once fixed. *Recommended as the default.*
2. **Production test under the Test Listings Policy** — the only route that produces a Fulfillment-visible order now.
   Requires: the production keyset and RuName wired into NivaDesk (or a separate production connection in the test
   workspace), a production seller account (EGGcraft's), a test listing per the policy, a buyer account to purchase and pay
   (real money or a cancelled/refunded order), and the acceptance tests re-planned for production data. Cost: eBay fees on
   the listing/sale unless cancelled, plus the operational care the policy demands.
3. **Leave the import acceptance blocked** until (1) resolves, keep `autoSync` off, and ship nothing eBay-facing that
   depends on it — the state we are in.

**Reply draft (not sent):**

> Thank you for the explanation — it matches what we observed (the order created and settled through the Trading API
> never appeared in the Fulfillment API, and the Sandbox buyer pages returned errors). Two follow-ups, if you can:
> (1) Will the existing Sandbox order `110590626185-10000012799510` (seller `testuser_nivadesk_seller1`) become visible in
> `getOrders` once Sandbox order creation is operational again, or will we need to create a new one? (2) Is there a way to be
> notified when the Sandbox fix ships, or a reference we can watch (API status page item, ticket)? We will hold our
> Sandbox testing until then; we have not started production testing.

Nothing was sent, no new test, no new order, no change to the connection. `autoSync` stays off.

## 2n. The reply, verbatim, and what is eBay's and what is ours (recorded 11 Sep 11:0xZ from the ticket page)

**Source:** Developer Technical Support portal, ticket **260910-000068**, "Communication History" → entry **"Response via Email — September 10, 2026 at 6:32:50 PM"** (portal clock, US Pacific; = **11 Sep 2026 01:32:50Z**). Ticket "Updated September 10, 2026 at 6:33:18 PM". Our question is the entry "Customer via CSS Web — September 10, 2026 at 5:46:46 PM" (= 11 Sep 00:46:46Z), attachment `ebay-sandbox-fulfillment-ticket-details.txt` (2.79 kB).

**Full text of eBay's reply:**

> Hello Gunes,
>
> Thank you for submitting your support request regarding the Fulfillment API in Sandbox.
>
> We apologize for the inconvenience. The sandbox environment is currently experiencing limitations, and order creation is not operational there. Our engineering team is working to resolve this, but it may take some time.
>
> We understand this may be frustrating and could block your testing. If applicable, we recommend using the production environment for testing.
>
> When testing in production, please follow the best practices outlined in our Test Listings Policy: https://www.ebay.com/help/policies/listing-policies/test-listings-policy?id=5039
>
> Thank you for your cooperation and understanding.
>
> Best Regards,
>
> eBay Developer Support

**What is eBay's statement and what is our inference:**

| Statement | Whose |
|---|---|
| Sandbox order creation is not operational; engineering is working on it; no date ("may take some time") | eBay, verbatim |
| "If applicable, we recommend using the production environment for testing", under the Test Listings Policy | eBay, verbatim |
| That a production test would need the **production keyset/RuName wired into NivaDesk**, a production seller account, a real buyer purchase (real money or a cancelled/refunded order) and re-planned acceptance tests | **ours** (§2m option 2 — the mechanics implied by "production", not anything eBay wrote) |
| That the empty Fulfillment result is explained by the Sandbox limitation rather than a delay or a NivaDesk filter | ours, drawn from eBay's first sentence; eBay did not address our order by number |

**Our two questions — answered or open:**

| Question we asked | Status |
|---|---|
| 1) Will the existing Sandbox order `110590626185-10000012799510` appear in Fulfillment `getOrders`/`getOrder`, and after what delay? | **Open.** Not addressed. The reply implies the order was never "created" as far as the Sandbox order pipeline is concerned, but it does not say whether it will surface after the fix. |
| 2) What is the supported way to create a Fulfillment-visible test order in the Sandbox? | **Answered indirectly: none today.** Sandbox order creation is not operational; the supported alternative eBay names is production under the Test Listings Policy. |

No new test, no production connection, no message sent (the §2m draft still stands as a draft). `autoSync` stays off; the Sandbox connection and its read-only scopes are unchanged.

## 2h. Sandbox records left in place — cleanup listed separately, nothing deleted

| Record | Where | To remove |
|---|---|---|
| Listing `110590626185` "NivaDesk sandbox test item 2026-09-10" (1 of 2 sold) | eBay Sandbox, seller `TESTUSER_nivadesk_seller1` | Trading `EndFixedPriceItem` with the seller token, or let it expire (GTC listings in the sandbox are periodically purged by eBay) |
| Order `110590626185-10000012799510` (Completed, £6.00 marked paid) | eBay Sandbox | cannot be deleted; sandbox data is purged by eBay on its own schedule |
| Test users `TESTUSER_nivadesk_buyer1`, `TESTUSER_nivadesk_buyer2` | eBay Sandbox | leave; sandbox users cannot be deleted by the developer, and buyer1's password is unknown to us |
| NivaDesk side | workspace `GuglEFKSEKNTq1xibFpJav3EWkY2` | nothing was written by this stage: 0 imported orders, `importState none`; the `syncLog` rows (`connected`, six `import_preview 0 found`) and the daily quota counter are the only traces and expire on their own |

## 2a. Blocker — the Explorer keeps minting the SELLER's token, not the buyer's

Twice now the "Get OAuth User Token" flow, after the operator's "Switch account → TESTUSER_nivadesk_buyer1 → password →
Sign in", returned a token whose `GetUser` answers with the **seller's** identity: `Email contact@nivadesk.co.uk`,
`RegistrationDate 2026-09-10T18:52:04Z` — the seller's registration, not the buyer's (registered later, e-mail
`contact+ebaybuyer1@nivadesk.co.uk`). So no buyer token yet; `PlaceOffer` cannot run (a seller cannot buy their own item).

Cause: the sandbox sign-in keeps the seller session ("Welcome back! testuser_nivadesk_seller1", "Stay signed in"
checked), and the browser autofills the **seller's** saved password into the buyer's password field, so the buyer
sign-in silently does not take and the already-granted seller session is re-used. This is also eBay's own documented
trap — the buyer and seller should be separated (different session / not the same signed-in identity).

**The corrected operator step (once):** on the Explorer's "Get OAuth User Token", when the buyer's "Welcome back!
TESTUSER_nivadesk_buyer1" page appears, (1) **clear** the pre-filled password box, (2) uncheck **Stay signed in**,
(3) type the **buyer's** password (the one set when the buyer was registered — not the seller's), (4) Sign in, (5)
**Agree and Continue**. If it still returns the seller, the buyer's password is unknown/wrong → reset it from the
sandbox sign-in "Forgot your password?" or re-register a fresh buyer. Nothing is retried automatically until the
operator confirms.

## 2. Next — the purchase (operator step: the buyer's Explorer token)

Done since the pause: seller token re-obtained, `GetUser`, `VerifyAddFixedPriceItem`, `AddFixedPriceItem` (ItemID `110590626185`).
Next: the operator signs in to the Explorer's token flow as `TESTUSER_nivadesk_buyer1` (Switch account on the sandbox
sign-in page), `GetUser` confirms the buyer, `PlaceOffer` (Purchase, quantity 1, £5.00) on item `110590626185`, then the
acceptance run in NivaDesk (narrow-window preview → import → second import → Sync now). Chrome tabs left as
they are: NivaDesk settings (owner), API Explorer (GetUser prepared), Sandbox Registration. Nothing else was changed.

Current settings: `autoSync` off; flag document unchanged; three functions switched on; no order, listing or buyer
purchase exists yet. Rollback of the three: traffic back to `previewebayimport-00001-vul`, `runebayimport-00001-tod`,
`syncebaynow-00001-gun`.
