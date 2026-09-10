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
