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
