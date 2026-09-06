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

Gate: probe table unchanged ✔, signed test delivery ✔, 30-minute log watch (01:46:26 → 02:18:48 UTC): **0 ERROR entries, 0 request 5xx**; the only traffic in the window was the probe set (401/403/400/410 as baselined) and the signed test delivery (200) — passed.

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

Gate (passive, as planned): each job's next scheduled run is read from the logs; no manual trigger. Readback at 02:20:41 UTC (window 01:53:40 → 02:20:41): **0 ERROR entries**; two jobs ran inside the window, both on their new revisions and both 200 — `scheduledremindercheck-00108-pev` at 02:10:01 (0.99 s) and `scheduledfinancesweep-00005-roz` at 02:11:02 (2.16 s). The hourly jobs (tracking refresh, billing reconcile) were re-anchored to 02:55 by the deploy and are read at that run; the 6-hourly, 8-hourly and daily jobs at theirs. No job disabled, no job lost.

## B3 — event-triggered (7 functions)

Rollback targets captured before the batch:

| Function | Revision before (rollback target) | Revision after | State |
|---|---|---|---|
| enforceWorkspaceSeatLimit | enforceworkspaceseatlimit-00001-hud | enforceworkspaceseatlimit-00002-yap | ACTIVE |
| notifyCustomerOnStatusChange | notifycustomeronstatuschange-00008-vuh | notifycustomeronstatuschange-00009-nox | ACTIVE |
| scanUploadedFile | scanuploadedfile-00003-duh | scanuploadedfile-00004-nar | ACTIVE |
| scheduleDeletedOrderFileCleanup | scheduledeletedorderfilecleanup-00005-dey | scheduledeletedorderfilecleanup-00006-bug | ACTIVE |
| settingsAuditTrail | settingsaudittrail-00002-bip | settingsaudittrail-00003-rad | ACTIVE |
| stampOrderFinance | stamporderfinance-00004-ruk | stamporderfinance-00005-zab | ACTIVE |
| syncWorkflowSafeOrderView | syncworkflowsafeorderview-00018-raf | syncworkflowsafeorderview-00019-tuw | ACTIVE |

Started 2026-09-06T01:56:28Z from `0d11da8d`; "Deploy complete" at 01:58:22 (1 min 54 s), **7 of 7 "Successful update operation"**, exit 0; all seven ACTIVE on their new revisions at 01:58:44; ERROR entries since the start: 0. The seven Eventarc triggers (five Firestore `document.written`, one `document.deleted`, one Storage `object.finalized`) are unchanged — a function redeploy replaces the Cloud Run revision behind the trigger, not the trigger.

Order-edit check (02:01:25, operator's own workspace, from the operator's session): one existing order's empty "Special Notes" field was given a test word and saved; the single Firestore write fired three of the seven triggers, all on their new revisions and all 200 — `stamporderfinance-00005-zab` (0.99 s), `syncworkflowsafeorderview-00019-tuw` (1.08 s), `notifycustomeronstatuschange-00009-nox` (0.05 s). The note was cleared again straight after (a second write, same three triggers). `settingsAuditTrail` and `enforceWorkspaceSeatLimit` fire on other documents (settings, membership) and `scheduleDeletedOrderFileCleanup` / `scanUploadedFile` on deletes and uploads — no test event was forced for those; they are read passively from the next real event, and their revisions are ACTIVE with their triggers unchanged.

Gate: one order edit ✔ (three triggers proven on the new revisions), 30-minute watch (01:56:28 → 02:27:25 UTC): **0 ERROR entries**; executions in the window: `stamporderfinance-00005-zab` 2 × 200, `syncworkflowsafeorderview-00019-tuw` 2 × 200, `notifycustomeronstatuschange-00009-nox` 2 × 200 (the two writes of the order-edit check); no other trigger fired in the window, none failed — passed.

## B4.1 — callables last deployed 1–5 Sep, chunk 1 (45 functions)

Operator approval "B4.1'e geç" at 02:05 UTC; health of the 47 functions deployed so far at that moment: 0 ERROR entries and 0 request 5xx since 01:35. Started 2026-09-06T02:07:29Z from `2777968a` (functions code identical to `4b44eef9`). Baseline probes (unauthenticated `POST {"data":{}}`): 44 × 401, 1 × 400 (`appleAppStoreServerNotification`, an HTTP endpoint that rejects an empty body), 0 × 5xx.

| Function | Revision before (rollback target) | Probe before | Revision after | Probe after |
|---|---|---|---|---|
| acceptWorkspaceInvitation | acceptworkspaceinvitation-00001-geq | 401 | acceptworkspaceinvitation-00002-wir | 401 |
| accountingAttentionResolve | accountingattentionresolve-00002-sor | 401 | accountingattentionresolve-00003-lev | 401 |
| accountingMappingSuggestions | accountingmappingsuggestions-00003-gif | 401 | accountingmappingsuggestions-00004-qid | 401 |
| accountingOverview | accountingoverview-00002-qov | 401 | accountingoverview-00003-suf | 401 |
| accountingPlanMigration | accountingplanmigration-00002-yem | 401 | accountingplanmigration-00003-duj | 401 |
| accountingSaveMappings | accountingsavemappings-00002-yug | 401 | accountingsavemappings-00003-zaz | 401 |
| accountingSetMode | accountingsetmode-00002-teg | 401 | accountingsetmode-00003-yar | 401 |
| accountingSyncActivity | accountingsyncactivity-00003-tav | 401 | accountingsyncactivity-00004-pid | 401 |
| addLibraryFileVersion | addlibraryfileversion-00003-mah | 401 | addlibraryfileversion-00004-buj | 401 |
| addSupportTicketReply | addsupportticketreply-00056-sus | 401 | addsupportticketreply-00057-hof | 401 |
| addWorkspaceTeamMember | addworkspaceteammember-00047-bog | 401 | addworkspaceteammember-00048-hex | 401 |
| amazonConnectStart | amazonconnectstart-00001-vij | 401 | amazonconnectstart-00002-fiw | 401 |
| amazonDisconnect | amazondisconnect-00002-xuq | 401 | amazondisconnect-00003-hun | 401 |
| anonymizeWebCustomer | anonymizewebcustomer-00003-men | 401 | anonymizewebcustomer-00004-foy | 401 |
| appleAppStoreServerNotification | appleappstoreservernotification-00008-kek | 400 | appleappstoreservernotification-00009-mek | 400 |
| approveWorkspaceJoinRequest | approveworkspacejoinrequest-00109-tis | 401 | approveworkspacejoinrequest-00110-cih | 401 |
| askAppAssistant | askappassistant-00061-vet | 401 | askappassistant-00062-daj | 401 |
| auditSquareOrders | auditsquareorders-00010-wan | 401 | auditsquareorders-00011-len | 401 |
| auditWooOrders | auditwooorders-00003-bec | 401 | auditwooorders-00004-nev | 401 |
| backfillWorkspaceFinance | backfillworkspacefinance-00004-ray | 401 | backfillworkspacefinance-00005-var | 401 |
| bankAssignInboxReceipt | bankassigninboxreceipt-00004-noz | 401 | bankassigninboxreceipt-00005-xak | 401 |
| bankCreateRequisition | bankcreaterequisition-00004-qec | 401 | bankcreaterequisition-00005-roh | 401 |
| bankDeleteCategory | bankdeletecategory-00002-wow | 401 | bankdeletecategory-00003-lib | 401 |
| bankDeleteConnection | bankdeleteconnection-00007-ric | 401 | bankdeleteconnection-00008-leb | 401 |
| bankDeleteInboxReceipt | bankdeleteinboxreceipt-00002-zud | 401 | bankdeleteinboxreceipt-00003-ket | 401 |
| bankDeleteRule | bankdeleterule-00004-yuc | 401 | bankdeleterule-00005-xir | 401 |
| bankDeleteVendor | bankdeletevendor-00002-pay | 401 | bankdeletevendor-00003-jar | 401 |
| bankFinalizeRequisition | bankfinalizerequisition-00015-zux | 401 | bankfinalizerequisition-00016-xey | 401 |
| bankLinkRefundToOrder | banklinkrefundtoorder-00002-zur | 401 | banklinkrefundtoorder-00003-nax | 401 |
| bankLinkTransactionToOrder | banklinktransactiontoorder-00003-jos | 401 | banklinktransactiontoorder-00004-xaj | 401 |
| bankListAuditLog | banklistauditlog-00002-vet | 401 | banklistauditlog-00003-pih | 401 |
| bankListPayouts | banklistpayouts-00002-tuv | 401 | banklistpayouts-00003-fom | 401 |
| bankMatchIncomingToOrder | bankmatchincomingtoorder-00002-vil | 401 | bankmatchincomingtoorder-00003-ziy | 401 |
| bankMatchReceipt | bankmatchreceipt-00004-kit | 401 | bankmatchreceipt-00005-vog | 401 |
| bankMatchWaitingReceipts | bankmatchwaitingreceipts-00002-cix | 401 | bankmatchwaitingreceipts-00003-piv | 401 |
| bankQueueInboxReceipt | bankqueueinboxreceipt-00002-jeg | 401 | bankqueueinboxreceipt-00003-vex | 401 |
| bankSaveCategory | banksavecategory-00002-qoq | 401 | banksavecategory-00003-har | 401 |
| bankSaveRule | banksaverule-00006-luk | 401 | banksaverule-00007-woc | 401 |
| bankSaveVendor | banksavevendor-00002-doh | 401 | banksavevendor-00003-goc | 401 |
| bankSetReviewStatusBulk | banksetreviewstatusbulk-00002-gaz | 401 | banksetreviewstatusbulk-00003-nep | 401 |
| bankSetTransactionCategory | banksettransactioncategory-00003-heg | 401 | banksettransactioncategory-00004-waj | 401 |
| bankSetTransactionCategoryBulk | banksettransactioncategorybulk-00002-law | 401 | banksettransactioncategorybulk-00003-dil | 401 |
| bankSetTransactionReceipt | banksettransactionreceipt-00003-gap | 401 | banksettransactionreceipt-00004-baf | 401 |
| bankSetTransactionSplits | banksettransactionsplits-00002-mir | 401 | banksettransactionsplits-00003-wuz | 401 |
| bankSetTransactionVatBulk | banksettransactionvatbulk-00003-doj | 401 | banksettransactionvatbulk-00004-xih | 401 |

Result: "Deploy complete" at 02:11:15 (3 min 46 s), **45 of 45 "Successful update operation"**, exit 0; all 45 ACTIVE on their new revisions at 02:11:26; ERROR entries since the start: 0; probe table re-run at 02:12: identical to the baseline (44 × 401, 1 × 400, 0 × 5xx).

Gate: state ACTIVE on all 45 ✔, probe table unchanged ✔, 15-minute error watch (02:07:29 → 02:27:52 UTC): **0 ERROR entries, 0 request 5xx**; the only traffic was the probe set (401) — passed.

### Four-gate summary before B4.2 (02:28 UTC)

| Batch | Window | ERROR entries | Request 5xx | Probes vs baseline | Behaviour |
|---|---|---|---|---|---|
| B1 ingress | 01:46:26 → 02:18:48 | 0 | 0 | identical (32 endpoints) | signed test delivery 200 |
| B2 scheduled | 01:53:40 → 02:20:41 | 0 | n/a (no HTTP surface) | n/a | reminder check + finance sweep ran 200 on new revisions; hourly jobs re-anchored to 02:55, none lost |
| B3 event-triggered | 01:56:28 → 02:27:25 | 0 | n/a | n/a | order write fired three triggers, all 200, twice |
| B4.1 callables | 02:07:29 → 02:27:52 | 0 | 0 | identical (45 callables) | — |

All four conditions the operator set (no new 5xx/error, no unexpected error log, probes unchanged, no scheduler/trigger regression) hold → B4.2 proceeds.

## B4.2 — callables last deployed 1–5 Sep, chunk 2 (45 functions)

Operator's process for this batch (in chat, 02:14 UTC): go only if the four previous gates are clean — they were (summary table above) — then 1 rollback snapshot, 2 probe baseline, 3 deploy, 4 ACTIVE/new-revision check, 5 probe compare, 6 fifteen-minute watch, 7 record and commit.

1–2: snapshot at 02:29:04, baseline probes at 02:29:09 (unauthenticated `POST {"data":{}}`): 1 × 200 (a visitor-facing read that answers an empty request with an empty result), 5 × 400, 24 × 401, 15 × 403, 0 × 5xx.
3: started 2026-09-06T02:31:00Z from `fdbd8d9a` (functions code identical to `4b44eef9`); "Deploy complete" 02:35:09 (4 min 9 s), **45 of 45 "Successful update operation"**, exit 0.
4: at 02:35:09 all 45 services report a new Ready revision (table below).
5: probes re-run at 02:35:12 — identical to the baseline; ERROR/5xx since the deploy start: 0.

| Function | Revision before (rollback target) | Probe before | Revision after | Probe after |
|---|---|---|---|---|
| bankSyncTransactions | banksynctransactions-00021-piz | 401 | banksynctransactions-00022-hum | 401 |
| bankUpdateTransaction | bankupdatetransaction-00005-hok | 401 | bankupdatetransaction-00006-tek | 401 |
| beginEtsyConnect | beginetsyconnect-00008-gas | 401 | beginetsyconnect-00009-xel | 401 |
| beginSquareConnect | beginsquareconnect-00008-nud | 401 | beginsquareconnect-00009-goc | 401 |
| beginWooConnect | beginwooconnect-00002-reg | 401 | beginwooconnect-00003-wiq | 401 |
| changeAccountEmail | changeaccountemail-00039-vos | 401 | changeaccountemail-00040-qul | 401 |
| chatgptWorkspaceAction | chatgptworkspaceaction-00046-ruf | 401 | chatgptworkspaceaction-00047-him | 401 |
| cleanupStaleUnverifiedAccounts | cleanupstaleunverifiedaccounts-00005-lig | 403 | cleanupstaleunverifiedaccounts-00006-qer | 403 |
| commerceEventWorker | commerceeventworker-00013-yuc | 403 | commerceeventworker-00014-gab | 403 |
| createStripeCheckoutSession | createstripecheckoutsession-00051-gum | 400 | createstripecheckoutsession-00052-lug | 400 |
| createSupportTicket | createsupportticket-00065-jol | 401 | createsupportticket-00066-ciy | 401 |
| createSwiftOrder | createswiftorder-00055-wok | 401 | createswiftorder-00056-cus | 401 |
| createWebOrder | createweborder-00108-rax | 401 | createweborder-00109-tot | 401 |
| createWebsiteChat | createwebsitechat-00068-qar | 400 | createwebsitechat-00069-nap | 400 |
| deleteMyAccount | deletemyaccount-00009-xaz | 401 | deletemyaccount-00010-lom | 401 |
| deleteWebCustomer | deletewebcustomer-00084-yob | 401 | deletewebcustomer-00085-fuz | 401 |
| deleteWorkspaceData | deleteworkspacedata-00061-wex | 401 | deleteworkspacedata-00062-hed | 401 |
| disconnectEtsyShop | disconnectetsyshop-00010-wes | 401 | disconnectetsyshop-00011-yew | 401 |
| disconnectSquare | disconnectsquare-00009-lak | 401 | disconnectsquare-00010-muz | 401 |
| disconnectWooShop | disconnectwooshop-00003-jay | 401 | disconnectwooshop-00004-sop | 401 |
| exportOrders | exportorders-00007-mol | 401 | exportorders-00008-zam | 401 |
| finishWooConnect | finishwooconnect-00004-hob | 401 | finishwooconnect-00005-jaj | 401 |
| generateQuickReply | generatequickreply-00085-heg | 401 | generatequickreply-00086-tof | 401 |
| getActivationFunnel | getactivationfunnel-00001-muv | 403 | getactivationfunnel-00002-ret | 403 |
| getAdminFeatureUsageDetail | getadminfeatureusagedetail-00004-det | 403 | getadminfeatureusagedetail-00005-cug | 403 |
| getAdminInsights | getadmininsights-00007-tax | 403 | getadmininsights-00008-jeq | 403 |
| getAdminLookup | getadminlookup-00004-caw | 403 | getadminlookup-00005-leq | 403 |
| getAdminOnboardingDetail | getadminonboardingdetail-00003-dew | 403 | getadminonboardingdetail-00004-biv | 403 |
| getAdminPlansDetail | getadminplansdetail-00005-wus | 403 | getadminplansdetail-00006-juz | 403 |
| getAdminRevenueDetail | getadminrevenuedetail-00005-wiy | 403 | getadminrevenuedetail-00006-vos | 403 |
| getAdminStorageDetail | getadminstoragedetail-00004-hal | 403 | getadminstoragedetail-00005-zor | 403 |
| getAdminSubscriptionsDetail | getadminsubscriptionsdetail-00004-hif | 403 | getadminsubscriptionsdetail-00005-ves | 403 |
| getAdminUsersWorkspacesDetail | getadminusersworkspacesdetail-00006-qic | 403 | getadminusersworkspacesdetail-00007-led | 403 |
| getAppAssistantAvailability | getappassistantavailability-00019-mid | 200 | getappassistantavailability-00020-jel | 200 |
| getCommerceCapabilities | getcommercecapabilities-00003-gur | 401 | getcommercecapabilities-00004-hav | 401 |
| getCommerceHealth | getcommercehealth-00004-seg | 401 | getcommercehealth-00005-mav | 401 |
| getCustomOrderLandingStats | getcustomorderlandingstats-00005-rus | 403 | getcustomorderlandingstats-00006-kif | 403 |
| getEstimateForVisitor | getestimateforvisitor-00006-yis | 400 | getestimateforvisitor-00007-koj | 400 |
| getEtsyConnections | getetsyconnections-00006-qit | 401 | getetsyconnections-00007-xew | 401 |
| getInboundWebhookToken | getinboundwebhooktoken-00006-sad | 401 | getinboundwebhooktoken-00007-kod | 401 |
| getPortalForVisitor | getportalforvisitor-00007-giq | 400 | getportalforvisitor-00008-buw | 400 |
| getSearchConsoleStats | getsearchconsolestats-00004-xob | 403 | getsearchconsolestats-00005-xac | 403 |
| getSetupChecklist | getsetupchecklist-00001-yod | 401 | getsetupchecklist-00002-zeq | 401 |
| getShopifyWebhookToken | getshopifywebhooktoken-00007-teq | 400 | getshopifywebhooktoken-00008-hoc | 400 |
| getSiteStats | getsitestats-00007-zux | 403 | getsitestats-00008-yem | 403 |

6: fifteen-minute watch (02:31:00 → 02:50:57 UTC): **0 ERROR entries, 0 request 5xx**; traffic in the window was the probe set plus real calls from the operator's app sessions (`getAppAssistantAvailability` 5 × 200 and 2 × 204 on the new revision) — passed.

## B4.3 — callables last deployed 1–5 Sep, chunk 3 (45 functions)

Operator's instruction "B4.3'e geç" at 02:38 UTC, i.e. seven minutes into B4.2's fifteen-minute window; the immediate readback at 02:38:33 showed 0 ERROR entries and 0 request 5xx for B4.2 since its deploy and for all 137 functions deployed so far since 01:35, so the batch started; B4.2's full-window result is recorded in its own section. The operator's standing rule for B4.4: it does not start until B4.2's full gate, B4.2's hourly scheduled-job check and B4.3's full gate are all clean, shown together.

1–2: snapshot at 02:38:45, baseline probes at 02:38:49: 1 × 200, 4 × 400, 36 × 401, 4 × 403, 0 × 5xx.
3: started 2026-09-06T02:40:37Z from `85aee6c9` (functions code identical to `4b44eef9`); "Deploy complete" 02:43:58 (3 min 21 s), **45 of 45 "Successful update operation"**, exit 0.
4: at 02:43:58 all 45 services report a new Ready revision (table below).
5: probes re-run at 02:44:01 — identical to the baseline; ERROR/5xx since the deploy start: 0.

| Function | Revision before (rollback target) | Probe before | Revision after | Probe after |
|---|---|---|---|---|
| getSquareConnections | getsquareconnections-00008-cex | 401 | getsquareconnections-00009-duj | 401 |
| getUserGuide | getuserguide-00053-qan | 401 | getuserguide-00054-guh | 401 |
| getWebsiteChatThread | getwebsitechatthread-00004-juw | 400 | getwebsitechatthread-00005-naq | 400 |
| getWooCommerceWebhookToken | getwoocommercewebhooktoken-00007-poy | 400 | getwoocommercewebhooktoken-00008-leg | 400 |
| getWooConnections | getwooconnections-00002-gen | 401 | getwooconnections-00003-tij | 401 |
| importOpeningStock | importopeningstock-00007-vih | 401 | importopeningstock-00008-baf | 401 |
| importWorkspaceBackup | importworkspacebackup-00071-bex | 401 | importworkspacebackup-00072-liz | 401 |
| initializeFreeDemoWorkspace | initializefreedemoworkspace-00032-web | 401 | initializefreedemoworkspace-00033-mil | 401 |
| inviteWorkspaceMember | inviteworkspacemember-00001-yak | 401 | inviteworkspacemember-00002-qiw | 401 |
| listChatGPTConnections | listchatgptconnections-00001-gic | 401 | listchatgptconnections-00002-caw | 401 |
| listCommerceEvents | listcommerceevents-00003-pib | 401 | listcommerceevents-00004-tuy | 401 |
| listCommerceReviewQueue | listcommercereviewqueue-00002-gib | 401 | listcommercereviewqueue-00003-poy | 401 |
| listRetiredIntegrationHolds | listretiredintegrationholds-00001-jef | 401 | listretiredintegrationholds-00002-vew | 401 |
| listSquarePayouts | listsquarepayouts-00008-vid | 401 | listsquarepayouts-00009-haw | 401 |
| listSquareUnmatched | listsquareunmatched-00008-dew | 401 | listsquareunmatched-00009-pos | 401 |
| listWorkspaceInvitations | listworkspaceinvitations-00001-hid | 401 | listworkspaceinvitations-00002-duj | 401 |
| maintainFileScans | maintainfilescans-00002-xir | 403 | maintainfilescans-00003-qeb | 403 |
| matchPayoutToBank | matchpayouttobank-00002-jek | 401 | matchpayouttobank-00003-tez | 401 |
| matchSquarePayoutToBank | matchsquarepayouttobank-00001-yoj | 401 | matchsquarepayouttobank-00002-teg | 401 |
| mergeOrders | mergeorders-00004-kil | 401 | mergeorders-00005-puy | 401 |
| mergeWebCustomers | mergewebcustomers-00004-moz | 401 | mergewebcustomers-00005-var | 401 |
| pandleConfirmMatch | pandleconfirmmatch-00003-yav | 401 | pandleconfirmmatch-00004-yej | 401 |
| pandleConnectFinish | pandleconnectfinish-00002-zux | 401 | pandleconnectfinish-00003-nev | 401 |
| pandleConnectStart | pandleconnectstart-00002-bec | 401 | pandleconnectstart-00003-tel | 401 |
| pandlePreview | pandlepreview-00005-zod | 401 | pandlepreview-00006-cud | 401 |
| pandlePush | pandlepush-00005-jiv | 401 | pandlepush-00006-luh | 401 |
| pandleRefreshMeta | pandlerefreshmeta-00002-tir | 401 | pandlerefreshmeta-00003-quh | 401 |
| pandleSelectBankAccount | pandleselectbankaccount-00002-rux | 401 | pandleselectbankaccount-00003-fer | 401 |
| paypalConnect | paypalconnect-00005-fit | 401 | paypalconnect-00006-hay | 401 |
| postEstimateDecision | postestimatedecision-00003-kek | 400 | postestimatedecision-00004-lum | 400 |
| postWebsiteChatMessage | postwebsitechatmessage-00071-six | 400 | postwebsitechatmessage-00072-jeq | 400 |
| previewEtsyImport | previewetsyimport-00015-goh | 401 | previewetsyimport-00016-wox | 401 |
| previewFinancialRecalculationForOrders | previewfinancialrecalculationfororders-00003-laq | 401 | previewfinancialrecalculationfororders-00004-fuy | 401 |
| previewSquareImport | previewsquareimport-00010-hut | 401 | previewsquareimport-00011-muz | 401 |
| previewWooImport | previewwooimport-00005-vad | 401 | previewwooimport-00006-dum | 401 |
| previewWorkspaceInvitation | previewworkspaceinvitation-00001-niy | 200 | previewworkspaceinvitation-00002-sup | 200 |
| purgeExpiredEstimateLinks | purgeexpiredestimatelinks-00002-ron | 403 | purgeexpiredestimatelinks-00003-wef | 403 |
| purgeWebOrders | purgeweborders-00002-yes | 401 | purgeweborders-00003-law | 401 |
| quickbooksConnectStart | quickbooksconnectstart-00002-pil | 401 | quickbooksconnectstart-00003-ceq | 401 |
| quickbooksDisconnect | quickbooksdisconnect-00003-mex | 401 | quickbooksdisconnect-00004-yen | 401 |
| quickbooksSyncNow | quickbookssyncnow-00003-git | 401 | quickbookssyncnow-00004-duf | 401 |
| recalculateFinancialSettingsForOrders | recalculatefinancialsettingsfororders-00077-nod | 401 | recalculatefinancialsettingsfororders-00078-jel | 401 |
| recalculateWorkspacePlanUsage | recalculateworkspaceplanusage-00103-rud | 401 | recalculateworkspaceplanusage-00104-cud | 401 |
| reconcileEtsyConnections | reconcileetsyconnections-00018-saw | 403 | reconcileetsyconnections-00019-noj | 403 |
| reconcileSquareConnections | reconcilesquareconnections-00013-fax | 403 | reconcilesquareconnections-00014-mox | 403 |

6: fifteen-minute watch (02:40:37 → 02:56:31 UTC): **0 ERROR entries, 0 request 5xx**; traffic in the window was the probe set plus real calls on the new revisions (`reconcileSquareConnections` 200, `reconcileEtsyConnections` 200, `previewWorkspaceInvitation` 200) — passed.

## Rollback used

None so far.
