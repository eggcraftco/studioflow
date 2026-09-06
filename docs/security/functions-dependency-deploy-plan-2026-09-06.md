# Main Cloud Functions — deployment plan for the dependency remediation

Status: **plan only — nothing deployed**. Written 2026-09-06 00:50 UTC for the
operator's review. No production deployment of the main functions happens
until the operator approves this plan explicitly. Until then the evidence
records read: *Remediation committed and tested; production deployment
pending.*

## 1. What would be deployed

| Item | Value |
|---|---|
| Project | `eggcraft-studio` (the main app; the hardened `nivadesk-amazon` project is frozen and out of scope) |
| Source | branch `macbook-save-before-macstudio-2026-06-01` at commit `4b44eef9` or later |
| Dependency change | `functions/package-lock.json` only (commit `5ed1823f`); `package.json` unchanged |
| What the change closes | `websocket-driver` (critical, via `firebase` → `@firebase/database` → `faye-websocket`), `@grpc/grpc-js` and `protobufjs` (via `firebase-admin` → `@google-cloud/firestore` → `google-gax`), `fast-xml-builder` and `form-data` (via `@google-cloud/storage`), `brace-expansion` (via `archiver`); see `evidence/amazon/vuln-scan-2026-09-05.md` |
| Runtime reach | every function loads `firebase-admin` at module load, so the gRPC / protobuf / storage chain is loaded by every function; the `websocket-driver` path is loaded only by code that touches the Realtime Database client, which no function does — its exposure was nil at runtime, the fix is hygiene |
| Test status | unit (fake Firestore) green; rules + e2e under Firestore and Storage emulators 282 checks / 0 failures (commit `4b44eef9`); CI job re-enabled with the Storage emulator |

### 1a. Inventory (read live on 2026-09-06 00:30 UTC with `gcloud functions list --v2`)

| Set | Count | Note |
|---|---|---|
| Live functions | 420 | 419 gen 2 (414 nodejs22, 1 nodejs24), 1 gen 1 |
| Exported by this branch | 415 | enumerated by loading `functions/index.js` |
| Common (deployable by name) | **414** | the population of this plan |
| Live-only, not in this branch | 6 | `getMessageUserPreferences`, `markAllWorkspaceNotificationsRead`, `markWorkspaceNotificationRead`, `setMessageUserPreferences`, `wooCommerceSiparis`, `wooCommerceWebhook` — **never named in a deploy, never deleted** (pin/unpin recovered into the tree since June; these six still have no source) |
| In this branch, not live | 1 | `nvRevokeFileLink` (shared-link revocation, 4 Sep) — a feature, not part of the remediation; separate decision |
| Trigger kinds (common) | 399 HTTP / callable, 8 scheduled, 7 event-triggered (5 Firestore written, 1 Firestore deleted, 1 Storage finalized) | |
| Functions with secrets | 98 | all 40 secrets declared in code exist in Secret Manager (checked 00:40 UTC, metadata only) |
| Min instances | `chatgptMcp` = 1 | the only warm function; a deploy replaces its instance |

### 1b. The code delta rides along

Deploying a function by name ships **the whole of `index.js` at HEAD**, not
only the lockfile. How much code each function has not yet seen depends on
when it was last deployed:

| Last deployed | Functions | Code regions changed since 23 June* |
|---|---|---|
| 1–5 Sep 2026 | 187 | small — the Amazon-side guards (5 Sep) and the test-only commits since |
| August 2026 | 138 | the September work: engine v4, retention, marketplace PII layer, credential boxing, banking plan gate |
| June / July 2026 | 69 | everything since 23 June; 39 of the 69 have edits inside their own export region |

\* "region" = the lines between one `exports.X =` and the next, mapped from
`git diff 43fff71d..HEAD -- functions/index.js` (2,047 hunks). Shared helpers
count against the export that precedes them, so this over-reports rather than
under-reports.

This is why the batches below run newest-deployed first and June-deployed
last, with a soak between them: the first batches change almost nothing but
the dependency tree; the last batch is the one that can surface a behaviour
change unrelated to the remediation.

## 2. Pre-flight (all must hold on the day)

1. Operator approval of this plan, in writing, naming the batches to run.
2. Freeze respected: no VPC-SC, `nivadesk-amazon`, scheduler, connector-activation or secret changes. The four `amazon*` functions in `eggcraft-studio` ship code only; every connector gate stays closed in code.
3. Working tree at the approved commit, `git status` clean, `cd functions && npm ci` from that lockfile (`shasum` of `package-lock.json` matches the commit).
4. `firebase login:list` shows `contact@eggcraft.co.uk`; credentials expired last on 5 Sep — the operator re-authenticates, not the assistant.
5. `npm test` green locally on the same tree; CI run for the commit green.
6. Deploy command is always **by name** — `firebase deploy --only "functions:a,functions:b,…" --project eggcraft-studio --non-interactive` — run from the repository root. Never `--only functions`, which would try to reconcile the six live-only functions.
7. Before each batch: `gcloud logging read` baseline of ERROR-level entries for the batch's services in the last hour, so "new errors" has a before-picture.

## 3. Batches, in order

Each batch is one `firebase deploy --only …` command. The CLI packages the
codebase once per command and updates the named functions in parallel.

| Batch | Contents | Size | Gate before the next batch |
|---|---|---|---|
| B0 canary | `validateInboundOrderPayload`, `getSitePresence`, `amazonStatus` — three low-traffic callables deployed 4–5 Sep | 3 | state ACTIVE, new revision serving, each answers (401/permission error for an unauthenticated call is the expected boot proof), 15 min with no new ERROR lines |
| B1 ingress | every webhook, OAuth callback, bridge and the ChatGPT MCP/OAuth surface | 29 | probe table in §4; a signed test delivery through `sendTestInboundWebhook` and `sendTestIntegrationWebhook` from the app's Integrations page; 30 min log watch |
| B2 scheduled | the 8 `scheduled*` / sweep functions | 8 | passive: wait for each job's next run (all run hourly or daily) and read its log line; no manual trigger |
| B3 event-triggered | 7 Firestore / Storage triggers (`stampOrderFinance`, `syncWorkflowSafeOrderView`, `settingsAuditTrail`, `notifyCustomerOnStatusChange`, `enforceWorkspaceSeatLimit`, `scheduleDeletedOrderFileCleanup`, `scanUploadedFile`) | 7 | one order edit and one file upload in the operator's own workspace, then the trigger logs; 30 min watch |
| B4.1–B4.5 | callables last deployed 1–5 Sep, alphabetical chunks | 45+45+45+45+1 | web smoke (§4) after B4.5; 15 min watch per chunk |
| B5.1–B5.3 | callables last deployed in August | 45+45+32 | web + Mac smoke after B5.3; **24 h soak** before B6 |
| B6.1–B6.2 | callables last deployed June/July | 35+29 | full web smoke + messaging/tickets/notes checks (that is what these functions serve); 24 h watch |

The exact `--only` argument for each batch is in the appendix. Nothing in any
batch is one of the six live-only functions or `nvRevokeFileLink`.

## 4. Smoke tests

**Generic, after every batch (scripted, read-only):**

```bash
# state + revision
gcloud functions describe <name> --region europe-west2 --project eggcraft-studio --format='value(state,updateTime,serviceConfig.revision)'
# new errors since the batch
gcloud logging read 'resource.type="cloud_run_revision" AND severity>=ERROR AND resource.labels.service_name=("<name>" OR "<name>")' --project eggcraft-studio --freshness=30m --limit 50
```

**B0/B1 probe table (unauthenticated requests; the expected status proves the
function boots and its parsers load, nothing is written):**

| Function | Probe | Expected |
|---|---|---|
| `inboundOrderWebhook`, `shopifyOrderWebhook`, `woocommerceOrderWebhook`, `wooConnectorWebhook`, `shopifyAppWebhook`, `etsyWebhook`, `squareWebhook`, `xeroWebhook`, `quickbooksWebhook` | `POST` with an empty JSON body and no signature | 401 or 400, never 500 |
| `stripeWebhook` | `POST` without `stripe-signature` | 400 |
| `track17Webhook`, `smsDeliveryWebhook` | `POST` without the provider token | 401 or 403 |
| `chatgptOAuthProtectedResource` | `GET /.well-known/oauth-protected-resource` | 200 JSON |
| `chatgptMcp` | `POST` without a bearer token | 401 with `WWW-Authenticate` |
| `ingestAmazonEnvelope` | `POST` without the bridge token | 401 or 403 (the gate stays closed) |
| OAuth callbacks (`etsy`, `square`, `woo`, `xero`, `quickbooks`) | `GET` without `state` | 400 or a redirect to the app with an error word — never 500 |

**Signed path (from the app, operator-driven):** Settings → Integrations →
Website / inbound → *Send test delivery* (`sendTestInboundWebhook`), and the
Shopify / WooCommerce card's test (`sendTestIntegrationWebhook`); the delivery
must land as a held or parked test order, exactly as before the deploy.

**App smoke (web, after B4.5 and again after B5.3 and B6.2):** login; dashboard
loads with the home cards; Orders list and one order card open (finance block
present, no console errors); Finance / Banking page opens with the connection
list; Files library opens and one file link renders; Settings → Integrations
statuses unchanged. Recorded in the evidence pack with timestamps, no
customer data.

**Mac app (after B5.3):** open the app, sign in, Orders, Production, Banking,
Messages — one read on each.

## 5. Rollback

Two mechanisms, fastest first. Gen 2 functions are Cloud Run services and keep
their previous revisions.

1. **Traffic shift, seconds per function, no build:**
   ```bash
   gcloud run revisions list --service <service> --region europe-west2 --project eggcraft-studio --format='value(name,creationTimestamp)'
   gcloud run services update-traffic <service> --region europe-west2 --project eggcraft-studio --to-revisions <previous-revision>=100
   ```
   The service name is the function name in lower case with hyphens (it is in
   the inventory file). Firebase's next deploy of that function moves traffic
   back to the latest revision, so a shifted function must be redeployed from
   the previous commit before anyone deploys it again.
2. **Redeploy from the previous commit, ~6–10 min per batch:** check out
   `3a981228` (the last commit with the old lockfile), `npm ci`, then the same
   `--only` list. This restores the old dependency tree *and* the old code.

Rollback triggers: any 5xx from a probe, a new ERROR pattern in the 15/30-min
watch that is not present in the before-picture, a signed test delivery that
does not land, or a smoke step that fails. Roll back the batch, not the world.

## 6. Time

| Step | Estimate |
|---|---|
| Pre-flight | 15 min |
| B0 + B1 + probes + signed tests | 45 min |
| B2 + B3 (deploy 10 min, passive watch runs alongside later batches) | 20 min |
| B4.1–B4.5 (5 commands, ~8 min each incl. build) + web smoke | 60 min |
| B5.1–B5.3 + web and Mac smoke | 45 min, then 24 h soak |
| B6.1–B6.2 + full smoke | 40 min, then 24 h watch |
| **Operator time in total** | **≈ 3 h 45 min over three sessions** (day 1: B0–B4; day 2: B5; day 3: B6) |

Quota note: the Cloud Functions API allows the parallel updates a 45-name
batch needs; the CLI queues the rest itself. A batch that hits a quota error
simply reports the functions it did not update — rerun the same list.

## 7. What this plan does not do

- It does not touch the six live-only functions, `nvRevokeFileLink`,
  `functions-amazon`, VPC-SC, schedulers, secrets or any connector gate.
- It does not deploy `geoip-lite` 2, `firebase-admin` 14 or `next` 16 — those
  are the separate major-upgrade backlog.
- It does not claim anything is remediated in production until the batch
  containing that function is deployed and its smoke checks are recorded.

## Appendix — the `--only` list per batch

Generated from the live inventory on 2026-09-06 00:45 UTC. The count in each
heading is the number of functions whose export region changed since 23 June
(see §1b).
### B0 canary — 3 functions, 1 with code changes in their region since 23 June

`functions:validateInboundOrderPayload,functions:getSitePresence,functions:amazonStatus`

### B1 ingress: webhooks, OAuth callbacks, bridges — 29 functions, 11 with code changes in their region since 23 June

`functions:chatgptMcp,functions:chatgptOAuthApprove,functions:chatgptOAuthAuthorizationServer,functions:chatgptOAuthAuthorize,functions:chatgptOAuthProtectedResource,functions:chatgptOAuthRegister,functions:chatgptOAuthToken,functions:chatgptOAuthWorkspaces,functions:etsyOAuthCallback,functions:etsyWebhook,functions:inboundOrderWebhook,functions:ingestAmazonEnvelope,functions:quickbooksOAuthCallback,functions:quickbooksWebhook,functions:sendTestInboundWebhook,functions:sendTestIntegrationWebhook,functions:shopifyAppBridge,functions:shopifyAppWebhook,functions:shopifyOrderWebhook,functions:smsDeliveryWebhook,functions:squareOAuthCallback,functions:squareWebhook,functions:stripeWebhook,functions:track17Webhook,functions:wooAuthCallback,functions:wooConnectorWebhook,functions:woocommerceOrderWebhook,functions:xeroOAuthCallback,functions:xeroWebhook`

### B2 scheduled — 8 functions, 4 with code changes in their region since 23 June

`functions:scheduledAccountingReconcile,functions:scheduledBankSync,functions:scheduledBillingEntitlementReconcile,functions:scheduledFinanceSweep,functions:scheduledQuickReplyKeySweep,functions:scheduledReminderCheck,functions:scheduledTrackingRefresh,functions:sweepMarketplacePii`

### B3 event-triggered (Firestore/Storage) — 7 functions, 5 with code changes in their region since 23 June

`functions:enforceWorkspaceSeatLimit,functions:notifyCustomerOnStatusChange,functions:scanUploadedFile,functions:scheduleDeletedOrderFileCleanup,functions:settingsAuditTrail,functions:stampOrderFinance,functions:syncWorkflowSafeOrderView`

### B4.1 callables last deployed 1–5 Sep — 45 functions, 9 with code changes in their region since 23 June

`functions:acceptWorkspaceInvitation,functions:accountingAttentionResolve,functions:accountingMappingSuggestions,functions:accountingOverview,functions:accountingPlanMigration,functions:accountingSaveMappings,functions:accountingSetMode,functions:accountingSyncActivity,functions:addLibraryFileVersion,functions:addSupportTicketReply,functions:addWorkspaceTeamMember,functions:amazonConnectStart,functions:amazonDisconnect,functions:anonymizeWebCustomer,functions:appleAppStoreServerNotification,functions:approveWorkspaceJoinRequest,functions:askAppAssistant,functions:auditSquareOrders,functions:auditWooOrders,functions:backfillWorkspaceFinance,functions:bankAssignInboxReceipt,functions:bankCreateRequisition,functions:bankDeleteCategory,functions:bankDeleteConnection,functions:bankDeleteInboxReceipt,functions:bankDeleteRule,functions:bankDeleteVendor,functions:bankFinalizeRequisition,functions:bankLinkRefundToOrder,functions:bankLinkTransactionToOrder,functions:bankListAuditLog,functions:bankListPayouts,functions:bankMatchIncomingToOrder,functions:bankMatchReceipt,functions:bankMatchWaitingReceipts,functions:bankQueueInboxReceipt,functions:bankSaveCategory,functions:bankSaveRule,functions:bankSaveVendor,functions:bankSetReviewStatusBulk,functions:bankSetTransactionCategory,functions:bankSetTransactionCategoryBulk,functions:bankSetTransactionReceipt,functions:bankSetTransactionSplits,functions:bankSetTransactionVatBulk`

### B4.2 callables last deployed 1–5 Sep — 45 functions, 26 with code changes in their region since 23 June

`functions:bankSyncTransactions,functions:bankUpdateTransaction,functions:beginEtsyConnect,functions:beginSquareConnect,functions:beginWooConnect,functions:changeAccountEmail,functions:chatgptWorkspaceAction,functions:cleanupStaleUnverifiedAccounts,functions:commerceEventWorker,functions:createStripeCheckoutSession,functions:createSupportTicket,functions:createSwiftOrder,functions:createWebOrder,functions:createWebsiteChat,functions:deleteMyAccount,functions:deleteWebCustomer,functions:deleteWorkspaceData,functions:disconnectEtsyShop,functions:disconnectSquare,functions:disconnectWooShop,functions:exportOrders,functions:finishWooConnect,functions:generateQuickReply,functions:getActivationFunnel,functions:getAdminFeatureUsageDetail,functions:getAdminInsights,functions:getAdminLookup,functions:getAdminOnboardingDetail,functions:getAdminPlansDetail,functions:getAdminRevenueDetail,functions:getAdminStorageDetail,functions:getAdminSubscriptionsDetail,functions:getAdminUsersWorkspacesDetail,functions:getAppAssistantAvailability,functions:getCommerceCapabilities,functions:getCommerceHealth,functions:getCustomOrderLandingStats,functions:getEstimateForVisitor,functions:getEtsyConnections,functions:getInboundWebhookToken,functions:getPortalForVisitor,functions:getSearchConsoleStats,functions:getSetupChecklist,functions:getShopifyWebhookToken,functions:getSiteStats`

### B4.3 callables last deployed 1–5 Sep — 45 functions, 20 with code changes in their region since 23 June

`functions:getSquareConnections,functions:getUserGuide,functions:getWebsiteChatThread,functions:getWooCommerceWebhookToken,functions:getWooConnections,functions:importOpeningStock,functions:importWorkspaceBackup,functions:initializeFreeDemoWorkspace,functions:inviteWorkspaceMember,functions:listChatGPTConnections,functions:listCommerceEvents,functions:listCommerceReviewQueue,functions:listRetiredIntegrationHolds,functions:listSquarePayouts,functions:listSquareUnmatched,functions:listWorkspaceInvitations,functions:maintainFileScans,functions:matchPayoutToBank,functions:matchSquarePayoutToBank,functions:mergeOrders,functions:mergeWebCustomers,functions:pandleConfirmMatch,functions:pandleConnectFinish,functions:pandleConnectStart,functions:pandlePreview,functions:pandlePush,functions:pandleRefreshMeta,functions:pandleSelectBankAccount,functions:paypalConnect,functions:postEstimateDecision,functions:postWebsiteChatMessage,functions:previewEtsyImport,functions:previewFinancialRecalculationForOrders,functions:previewSquareImport,functions:previewWooImport,functions:previewWorkspaceInvitation,functions:purgeExpiredEstimateLinks,functions:purgeWebOrders,functions:quickbooksConnectStart,functions:quickbooksDisconnect,functions:quickbooksSyncNow,functions:recalculateFinancialSettingsForOrders,functions:recalculateWorkspacePlanUsage,functions:reconcileEtsyConnections,functions:reconcileSquareConnections`

### B4.4 callables last deployed 1–5 Sep — 45 functions, 17 with code changes in their region since 23 June

`functions:reconcileWooConnections,functions:recreateWooWebhooks,functions:registerTracking,functions:releaseHeldIntegrationOrders,functions:removeWorkspaceTeamMember,functions:resetCustomOrderLandingStats,functions:resolveCommerceReview,functions:resolveEtsyCustomerMatch,functions:resyncStripeWorkspaceEntitlements,functions:retryCommerceEvent,functions:revokeChatGPTConnection,functions:revokeOrderEstimateLink,functions:revokeOrderPortalLink,functions:revokeWorkspaceInvitation,functions:rotateIntegrationWebhookToken,functions:runEtsyImport,functions:runSquareImport,functions:runWooImport,functions:saveFinancialSettings,functions:saveInventoryItem,functions:saveProductionStages,functions:saveSwiftOrder,functions:saveThemeBrandingSettings,functions:saveWooSignatureSecret,functions:sendOrderEstimate,functions:setLibraryFileActiveVersion,functions:setOrderProductionStage,functions:setShopifyIntegrationState,functions:shareLibraryFileWithOrder,functions:shopifyImportOrders,functions:shopifyReconcileOrders,functions:syncEtsyNow,functions:syncSquareNow,functions:syncWooNow,functions:undoOrderCreate,functions:undoOrderProductionStage,functions:updateSquareConnectionSettings,functions:updateWebOrder,functions:updateWorkspaceMemberSuspension,functions:verifyAppleSubscriptionPurchase,functions:verifyEtsyConnection,functions:xeroConnectStart,functions:xeroDisconnect,functions:xeroListTenants,functions:xeroSelectTenant`

### B4.5 callables last deployed 1–5 Sep — 1 functions, 0 with code changes in their region since 23 June

`functions:xeroSyncNow`

### B5.1 callables last deployed in August — 45 functions, 14 with code changes in their region since 23 June

`functions:acceptPersonalNoteCollaborationInvite,functions:appendClientFile,functions:applyRecipeToOrder,functions:approveWorkflowOrderDeletion,functions:assignSupportTicket,functions:cancelStocktake,functions:clearAllOrdersTax,functions:commitStocktake,functions:consumeInventoryForOrder,functions:createOrderEstimate,functions:createOrderPortalLink,functions:createWebCustomer,functions:createWorkspaceTicket,functions:deleteInventoryCategory,functions:deleteInventoryItem,functions:deleteInventoryLocation,functions:deleteInventoryRecipe,functions:deleteLibraryFile,functions:deletePurchase,functions:deleteWebOrder,functions:ensureWorkflowAssignedOrderViews,functions:getClientDomainConfig,functions:getInventoryReport,functions:getInventorySummary,functions:getOrderEstimateRecord,functions:getOrderInventory,functions:getSettingsAuditLog,functions:getShopifyIntegrationsForWorkspace,functions:getStocktake,functions:getSupportTicketUnreadSummary,functions:getWebsiteAssistantConfig,functions:getWorkspaceBlockHeadings,functions:getWorkspaceCardLayout,functions:getWorkspacePlanUsage,functions:getWorkspaceSmsSettings,functions:googlePlayRtdnNotification,functions:indexWorkspaceFilesIntoLibrary,functions:linkLibraryFile,functions:linkPurchaseToBankTransaction,functions:listHeldIntegrationOrders,functions:listInventoryCategories,functions:listInventoryItems,functions:listInventoryLocations,functions:listInventoryMovements,functions:listInventoryRecipes`

### B5.2 callables last deployed in August — 45 functions, 14 with code changes in their region since 23 June

`functions:listLibraryFiles,functions:listMySupportTickets,functions:listPurchases,functions:listStocktakes,functions:listSuppliers,functions:listWorkspaceTickets,functions:mergeInventoryCategories,functions:nvViewSharedFile,functions:pandleDisconnect,functions:pandleRejectMatch,functions:pandleSaveMappings,functions:parseOpeningStock,functions:pinMessageInThread,functions:prepareAppleSubscriptionPurchase,functions:prepareGooglePlayPurchase,functions:previewClearAllOrdersTax,functions:purgeDeletedOrders,functions:receivePurchase,functions:recordInventoryLoss,functions:registerLibraryFile,functions:releaseInventoryFromOrder,functions:removeClientDomain,functions:renameLibraryFile,functions:requestClientDomain,functions:reserveInventoryForOrder,functions:resetOrderWorkspaceCardLayout,functions:resolveClientDomain,functions:restoreLibraryFile,functions:resyncIntegrationCustomer,functions:saveClientPortalBranding,functions:saveDashboardWidgetVisibility,functions:saveIntegrationSyncSettings,functions:saveInventoryCategories,functions:saveInventoryLocation,functions:saveInventoryRecipe,functions:saveOrderCardDisplaySettings,functions:saveOrderPortalSettings,functions:saveOrderWorkspaceCardLayout,functions:savePdfExportSettings,functions:savePersonalInterfaceSettings,functions:savePurchase,functions:saveQuickReplyContribution,functions:saveQuickReplySettings,functions:saveStocktakeCounts,functions:saveSupplier`

### B5.3 callables last deployed in August — 32 functions, 19 with code changes in their region since 23 June

`functions:saveSwiftWorkspaceCardProfile,functions:saveTypeWorkspaceCardLayout,functions:saveUploadSafetySettings,functions:saveWorkspaceBlockHeadings,functions:saveWorkspaceCardLayout,functions:saveWorkspaceCustomRole,functions:saveWorkspaceLogo,functions:saveWorkspaceSidebarLayout,functions:saveWorkspaceSmsSettings,functions:sendThreadMessage,functions:setClientSubdomain,functions:setInventoryItemStatus,functions:setSharedPersonalNoteEditingPresence,functions:setTrialPlan,functions:setWebsiteAssistant,functions:sharePersonalNoteWithWorkspaceMember,functions:shopifyCompleteConnect,functions:startStocktake,functions:swapInventoryForOrder,functions:syncWorkspaceAcceptedJoinRequests,functions:testQuickReplyApiKey,functions:trashLibraryFile,functions:undoClearAllOrdersTax,functions:undoWorkspaceBackupImport,functions:unlinkLibraryFile,functions:unpinMessageInThread,functions:updateWebCustomer,functions:updateWorkspaceMemberAccess,functions:validateWorkspacePlanAction,functions:verifyClientDomain,functions:verifyGooglePlayPurchase,functions:websiteChatRequestHuman`

### B6.1 callables last deployed June/July (largest code delta) — 35 functions, 19 with code changes in their region since 23 June

`functions:addMembersToMessageThread,functions:addWorkspaceTicketReply,functions:assignInvoiceNumber,functions:assignWorkspaceTicket,functions:backupAuthUsers,functions:blockDisposableSignups,functions:cleanupExpiredOrderFiles,functions:clearMessageTypingStatus,functions:createMessageThread,functions:createPersonalNoteCollaborationInvite,functions:createStripeCustomerPortalSession,functions:declinePersonalNoteCollaborationInvite,functions:declineWorkspaceJoinRequest,functions:deleteClientFile,functions:deleteMessageForEveryone,functions:deleteMessageForMe,functions:deleteQuickReplyContribution,functions:deleteWorkspaceCustomRole,functions:dismissActivityNotifications,functions:downloadClientFilesZip,functions:editThreadMessage,functions:getMessageWorkspaceSettings,functions:getPersonalInterfaceSettings,functions:getQuickReplyPersonalSettings,functions:getWorkspaceSupportManagers,functions:leaveMessageThread,functions:listMessageThreads,functions:listPersonalNoteCollaborationInvites,functions:listQuickReplyContributions,functions:listSupportTicketMessages,functions:listThreadMessages,functions:listWorkspaceTicketMessages,functions:markActivityNotificationRead,functions:markAllActivityNotificationsRead,functions:markMessageThreadRead`

### B6.2 callables last deployed June/July (largest code delta) — 29 functions, 19 with code changes in their region since 23 June

`functions:markSupportTicketRead,functions:markWorkspaceTicketRead,functions:mergeOrderIntoOrder,functions:nvCreateFileLink,functions:recordSiteVisit,functions:rejectWorkflowOrderDeletion,functions:removeMemberFromMessageThread,functions:removeSharedPersonalNoteFromWorkspaceMember,functions:renameClientFile,functions:renameMessageThread,functions:requestWorkflowOrderDeletion,functions:requestWorkspaceAccess,functions:restoreWebOrder,functions:saveAccountAvatar,functions:saveAccountProfile,functions:saveLanguageSettings,functions:saveQuickReplyPersonalSettings,functions:setMessageThreadActive,functions:setMessageThreadMute,functions:setMessageTypingStatus,functions:setMessageWorkspaceSettings,functions:setWorkspaceSupportManagers,functions:snapshotSearchConsoleDaily,functions:syncSharedPersonalNoteContent,functions:toggleMessageReaction,functions:updateSupportTicketStatus,functions:updateWorkspaceMemberProfile,functions:updateWorkspaceMemberRole,functions:updateWorkspaceTicketStatus`
