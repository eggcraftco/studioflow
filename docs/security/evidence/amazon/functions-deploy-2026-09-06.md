# Main Cloud Functions — dependency remediation deployment record

Execution record for `../../functions-dependency-deploy-plan-2026-09-06.md`.
Operator approval: 2026-09-06 (in chat): "Functions deploy planını onaylıyorum,
B0 ve B1 ile başla". Batches beyond B1 need their own go. Times in UTC.

## Pre-flight (01:33 UTC)

| Check | Result |
|---|---|
| Tree | `e0f290ce` (functions code unchanged since `4b44eef9`, which CI ran green: run 34001844015); `git status` clean apart from untracked spec files outside `functions/` |
| Identity | `firebase login:list` → contact@eggcraft.co.uk; `firebase projects:list` shows `eggcraft-studio` (current) |
| Install | `functions/package-lock.json` sha256 `4ad17e4ff1fe62d2…` = HEAD; `npm ci` added 477 packages, exit 0 |
| Unit suite | `npm test` exit 0 (1,239 PASS lines) |
| Secrets | all 40 `defineSecret` names exist in Secret Manager (checked 00:40 UTC, metadata only) |
| Inventory | B0 (3) and B1 (29) all present live; none of the six live-only functions is named anywhere |
| Rollback targets | `gcloud run services list` snapshot at 01:33 UTC: latest ready revision per service recorded (scratch `run-services-pre-map.json`; the per-batch tables below carry the ones that matter) |
| Error-log baseline | ERROR-level entries for the 32 services in the previous 60 min: **0** |
| Probe baseline | 32 unauthenticated probes, no 5xx (expected refusals: 401/403/400/405/410, 302 for OAuth callbacks without state, 200 for the two well-known documents and for an empty JSON-RPC POST to `chatgptMcp`) |

## B0 — canary (3 functions)

Command (repository root):

```bash
firebase deploy --only "functions:validateInboundOrderPayload,functions:getSitePresence,functions:amazonStatus" --project eggcraft-studio --non-interactive
```

| Function | Revision before | Revision after | State | Probe before → after |
|---|---|---|---|---|
| validateInboundOrderPayload | validateinboundorderpayload-00001-pab | validateinboundorderpayload-00002-fuf | ACTIVE 01:38:08 | 401 → 401 |
| getSitePresence | getsitepresence-00004-kez | getsitepresence-00005-vuh | ACTIVE 01:38:07 | 403 → 403 |
| amazonStatus | amazonstatus-00002-jih | amazonstatus-00003-sew | ACTIVE 01:38:06 | 401 → 401 |

Deploy started 01:36:07, "Deploy complete" 01:38:14 (three "Successful update operation" lines, exit 0). Cloud Build `516d95c3-d961-41b0-914e-37735aac4e31` (01:36:47, SUCCESS) installed the dependencies with `npm ci --quiet --no-fund --no-audit (NODE_ENV=production)` from the uploaded lockfile — 362 packages — so the new revisions run the remediated tree. ERROR entries for the three services since 01:35: 0 at 01:38:27; the 15-minute watch result is recorded below.

Authenticated canary (01:42:50): from the operator's session, Settings › Integrations › Website / inbound › "Check this payload" with a synthetic order (no customer data) — the callable answered **200 in 0.98 s on revision `validateinboundorderpayload-00002-fuf`** (the 204 before it is the CORS preflight) and the page rendered the parsed preview. Nothing was written: the function only validates.

Gate: state ACTIVE on all three ✔, probes unchanged ✔, authenticated call on the new revision ✔. Error watch: 0 ERROR entries and 0 request 5xx from 01:35 to 01:46 UTC (checked at 01:46:10 before B1); the operator instructed "B1'e geç" at that point, so B1 started 11 minutes into the planned 15. Full-window readback at 01:53:30 UTC: **0 ERROR entries and 0 request 5xx** for the three services since 01:35 — gate passed.

## B1 — ingress (29 functions)

Command: the `--only` list from the plan's appendix (B1 ingress), 29 names, run from the repository root. Started **2026-09-06T01:46:26Z** from `ea37d25d` (functions code identical to `4b44eef9`).

Rollback targets captured before the batch (Cloud Run latest ready revision at 01:33 UTC) and the unauthenticated probe baseline (01:34 UTC):

| Function | Revision before (rollback target) | Probe before | Revision after | Probe after |
|---|---|---|---|---|
| chatgptMcp | chatgptmcp-00070-muv | 200 | chatgptmcp-00071-tir | 200 |
| chatgptOAuthApprove | chatgptoauthapprove-00042-doq | 405 | chatgptoauthapprove-00043-feq | 405 |
| chatgptOAuthAuthorizationServer | chatgptoauthauthorizationserver-00047-don | 200 | chatgptoauthauthorizationserver-00048-puq | 200 |
| chatgptOAuthAuthorize | chatgptoauthauthorize-00043-mip | 400 | chatgptoauthauthorize-00044-tew | 400 |
| chatgptOAuthProtectedResource | chatgptoauthprotectedresource-00042-peb | 200 | chatgptoauthprotectedresource-00043-nuc | 200 |
| chatgptOAuthRegister | chatgptoauthregister-00046-rus | 400 | chatgptoauthregister-00047-kax | 400 |
| chatgptOAuthToken | chatgptoauthtoken-00044-zec | 400 | chatgptoauthtoken-00045-sup | 400 |
| chatgptOAuthWorkspaces | chatgptoauthworkspaces-00033-jof | 401 | chatgptoauthworkspaces-00034-wow | 401 |
| etsyOAuthCallback | etsyoauthcallback-00013-xeb | 302 | etsyoauthcallback-00014-vux | 302 |
| etsyWebhook | etsywebhook-00021-xug | 401 | etsywebhook-00022-peb | 401 |
| inboundOrderWebhook | inboundorderwebhook-00024-mis | 400 | inboundorderwebhook-00025-pay | 400 |
| ingestAmazonEnvelope | ingestamazonenvelope-00001-gim | 403 | ingestamazonenvelope-00002-car | 403 |
| quickbooksOAuthCallback | quickbooksoauthcallback-00003-yir | 302 | quickbooksoauthcallback-00004-fed | 302 |
| quickbooksWebhook | quickbookswebhook-00003-qiz | 401 | quickbookswebhook-00004-pif | 401 |
| sendTestInboundWebhook | sendtestinboundwebhook-00003-nap | 401 | sendtestinboundwebhook-00004-mib | 401 |
| sendTestIntegrationWebhook | sendtestintegrationwebhook-00002-how | 401 | sendtestintegrationwebhook-00003-vub | 401 |
| shopifyAppBridge | shopifyappbridge-00012-geh | 401 | shopifyappbridge-00013-wuh | 401 |
| shopifyAppWebhook | shopifyappwebhook-00016-mit | 401 | shopifyappwebhook-00017-feh | 401 |
| shopifyOrderWebhook | shopifyorderwebhook-00025-yaf | 410 | shopifyorderwebhook-00026-qux | 410 |
| smsDeliveryWebhook | smsdeliverywebhook-00001-vud | 403 | smsdeliverywebhook-00002-xen | 403 |
| squareOAuthCallback | squareoauthcallback-00008-bat | 302 | squareoauthcallback-00009-kic | 302 |
| squareWebhook | squarewebhook-00011-hud | 401 | squarewebhook-00012-kat | 401 |
| stripeWebhook | stripewebhook-00045-zog | 400 | stripewebhook-00046-peq | 400 |
| track17Webhook | track17webhook-00120-faz | 401 | track17webhook-00121-lub | 401 |
| wooAuthCallback | wooauthcallback-00002-xez | 405 | wooauthcallback-00003-pax | 405 |
| wooConnectorWebhook | wooconnectorwebhook-00005-jix | 401 | wooconnectorwebhook-00006-tol | 401 |
| woocommerceOrderWebhook | woocommerceorderwebhook-00138-zit | 410 | woocommerceorderwebhook-00139-dez | 410 |
| xeroOAuthCallback | xerooauthcallback-00003-gul | 302 | xerooauthcallback-00004-yaf | 302 |
| xeroWebhook | xerowebhook-00004-wev | 401 | xerowebhook-00005-law | 401 |

Result: "Deploy complete" at 01:48:47 (2 min 21 s), **29 of 29 "Successful update operation"**, exit 0. At 01:49:00 every function reads ACTIVE on its new revision (table above). ERROR entries for the 29 services since the start: 0 at 01:49:00. Unauthenticated probe table re-run at 01:49:28: identical to the baseline, 0 × 5xx.

Signed test delivery (01:49:48, operator's session, Settings › Integrations › Website / inbound › "Send test webhook"): the callable `sendtestinboundwebhook-00004-mib` answered 200 in 1.9 s and its signed delivery reached `inboundorderwebhook-00025-pay`, which answered **200 in 0.9 s**; the app showed "The delivery URL answered. No order was created. This proves the URL, workspace and token." — the inbound path that reads the idempotency headers through `req.get` (the one the e2e fixture had to learn) works on the new revision with no order written. The Shopify / WooCommerce test button was not used: the workspace's store runs on the connector path and the legacy paste-URL webhooks answer 410 by design, exactly as in the probe table.

Gate: probe table unchanged ✔, signed test delivery ✔, 30-minute log watch (01:46:26 → 02:18:30): _pending_.

## B2 — scheduled (8 functions)

Operator approval "B2 ve B3'e geç" at 01:53 UTC; B0 + B1 health at that moment: 0 ERROR entries and 0 request 5xx since 01:35. Started 2026-09-06T01:53:40Z from `0d11da8d` (functions code identical to `4b44eef9`).

| Function | Revision before (rollback target) | Revision after | State |
|---|---|---|---|
| scheduledAccountingReconcile | scheduledaccountingreconcile-00005-kec | scheduledaccountingreconcile-00006-zeg | ACTIVE |
| scheduledBankSync | scheduledbanksync-00019-son | scheduledbanksync-00020-jet | ACTIVE |
| scheduledBillingEntitlementReconcile | scheduledbillingentitlementreconcile-00007-joz | scheduledbillingentitlementreconcile-00008-poq | ACTIVE |
| scheduledFinanceSweep | scheduledfinancesweep-00004-bud | scheduledfinancesweep-00005-roz | ACTIVE |
| scheduledQuickReplyKeySweep | scheduledquickreplykeysweep-00001-san | scheduledquickreplykeysweep-00002-laq | ACTIVE |
| scheduledReminderCheck | scheduledremindercheck-00107-kuh | scheduledremindercheck-00108-pev | ACTIVE |
| scheduledTrackingRefresh | scheduledtrackingrefresh-00112-taq | scheduledtrackingrefresh-00113-gux | ACTIVE |
| sweepMarketplacePii | sweepmarketplacepii-00002-jox | sweepmarketplacepii-00003-hic | ACTIVE |

Cloud Scheduler jobs behind the batch (read at 01:54 UTC, `gcloud scheduler jobs list`):

| Job | Schedule | Last run before B2 (UTC) | Next run (UTC) |
|---|---|---|---|
| sweepMarketplacePii | every 24 hours | 14:35 | 14:35 |
| scheduledFinanceSweep | every 20 minutes | 01:51 | 02:11 |
| scheduledBillingEntitlementReconcile | every 60 minutes | 01:13 | 02:13 |
| scheduledAccountingReconcile | every 6 hours | 00:43 | 06:43 |
| scheduledReminderCheck | every 15 minutes | 01:42 | 01:57 |
| scheduledTrackingRefresh | every 60 minutes | 01:00 | 02:00 |
| scheduledQuickReplyKeySweep | every 24 hours | 00:54 | 00:54 |
| scheduledBankSync | every 8 hours | 22:47 | 06:47 |

Result: "Deploy complete" at 01:55:56 (2 min 16 s), **8 of 8 "Successful update operation"**, exit 0; all eight ACTIVE on their new revisions at 01:56:05; ERROR entries since the start: 0. The eight Cloud Scheduler jobs read back ENABLED with the same schedules after the deploy. One side effect worth knowing for the later batches: re-deploying an `onSchedule` function re-applies its Scheduler job, and for interval schedules ("every N minutes/hours") that re-anchors the interval at the deploy time — after B2 the next runs read reminder check 02:10 (was 01:57), tracking refresh 02:55 (was 02:00), billing reconcile 02:55 (was 02:13), quick-reply key sweep 01:55 (ran at deploy time instead of 00:54 tomorrow); finance sweep 02:11, accounting reconcile 06:43 and bank sync 06:47 kept their next run. No job was lost or disabled; the hourly jobs simply skipped one tick.

Gate (passive, as planned): each job's next scheduled run is read from the logs; no manual trigger. Four of the eight run inside the 30-minute window (reminder check 01:57, tracking refresh 02:00, finance sweep 02:11, billing reconcile 02:13); the others are read at their next run.

## B3 — event-triggered (7 functions)

Rollback targets captured before the batch:

| Function | Revision before (rollback target) | Revision after | State |
|---|---|---|---|
| enforceWorkspaceSeatLimit | enforceworkspaceseatlimit-00001-hud | | |
| notifyCustomerOnStatusChange | notifycustomeronstatuschange-00008-vuh | | |
| scanUploadedFile | scanuploadedfile-00003-duh | | |
| scheduleDeletedOrderFileCleanup | scheduledeletedorderfilecleanup-00005-dey | | |
| settingsAuditTrail | settingsaudittrail-00002-bip | | |
| stampOrderFinance | stamporderfinance-00004-ruk | | |
| syncWorkflowSafeOrderView | syncworkflowsafeorderview-00018-raf | | |

Gate: one order edit in the operator's own workspace (and a file upload if practical), then the trigger logs; 30-minute watch.

## Rollback used

None so far.
