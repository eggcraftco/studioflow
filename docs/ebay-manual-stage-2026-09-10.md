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

## 2. Paused here — waiting for the operator (no new attempts, by instruction)

Waiting for: the seller token to be attached again in the API Explorer tab (operator action), then `GetUser` to confirm
`TESTUSER_nivadesk_seller1`, then one synthetic listing, the buyer token + `GetUser` for `TESTUSER_nivadesk_buyer1`, one
`PlaceOffer`, and the acceptance run (narrow-window preview → import → second import → Sync now). Chrome tabs left as
they are: NivaDesk settings (owner), API Explorer (GetUser prepared), Sandbox Registration. Nothing else was changed.

Current settings: `autoSync` off; flag document unchanged; three functions switched on; no order, listing or buyer
purchase exists yet. Rollback of the three: traffic back to `previewebayimport-00001-vul`, `runebayimport-00001-tod`,
`syncebaynow-00001-gun`.
