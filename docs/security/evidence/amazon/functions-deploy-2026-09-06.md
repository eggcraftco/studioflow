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

Gate: state ACTIVE on all three ✔, probes unchanged ✔, authenticated call on the new revision ✔, 15-minute error watch: _pending_.

## B1 — ingress (29 functions)

Command: the `--only` list from the plan's appendix (B1 ingress), 29 names, run from the repository root.

Rollback targets captured before the batch (Cloud Run latest ready revision at 01:33 UTC) and the unauthenticated probe baseline (01:34 UTC):

| Function | Revision before (rollback target) | Probe before | Revision after | Probe after |
|---|---|---|---|---|
| chatgptMcp | chatgptmcp-00070-muv | 200 | | |
| chatgptOAuthApprove | chatgptoauthapprove-00042-doq | 405 | | |
| chatgptOAuthAuthorizationServer | chatgptoauthauthorizationserver-00047-don | 200 | | |
| chatgptOAuthAuthorize | chatgptoauthauthorize-00043-mip | 400 | | |
| chatgptOAuthProtectedResource | chatgptoauthprotectedresource-00042-peb | 200 | | |
| chatgptOAuthRegister | chatgptoauthregister-00046-rus | 400 | | |
| chatgptOAuthToken | chatgptoauthtoken-00044-zec | 400 | | |
| chatgptOAuthWorkspaces | chatgptoauthworkspaces-00033-jof | 401 | | |
| etsyOAuthCallback | etsyoauthcallback-00013-xeb | 302 | | |
| etsyWebhook | etsywebhook-00021-xug | 401 | | |
| inboundOrderWebhook | inboundorderwebhook-00024-mis | 400 | | |
| ingestAmazonEnvelope | ingestamazonenvelope-00001-gim | 403 | | |
| quickbooksOAuthCallback | quickbooksoauthcallback-00003-yir | 302 | | |
| quickbooksWebhook | quickbookswebhook-00003-qiz | 401 | | |
| sendTestInboundWebhook | sendtestinboundwebhook-00003-nap | 401 | | |
| sendTestIntegrationWebhook | sendtestintegrationwebhook-00002-how | 401 | | |
| shopifyAppBridge | shopifyappbridge-00012-geh | 401 | | |
| shopifyAppWebhook | shopifyappwebhook-00016-mit | 401 | | |
| shopifyOrderWebhook | shopifyorderwebhook-00025-yaf | 410 | | |
| smsDeliveryWebhook | smsdeliverywebhook-00001-vud | 403 | | |
| squareOAuthCallback | squareoauthcallback-00008-bat | 302 | | |
| squareWebhook | squarewebhook-00011-hud | 401 | | |
| stripeWebhook | stripewebhook-00045-zog | 400 | | |
| track17Webhook | track17webhook-00120-faz | 401 | | |
| wooAuthCallback | wooauthcallback-00002-xez | 405 | | |
| wooConnectorWebhook | wooconnectorwebhook-00005-jix | 401 | | |
| woocommerceOrderWebhook | woocommerceorderwebhook-00138-zit | 410 | | |
| xeroOAuthCallback | xerooauthcallback-00003-gul | 302 | | |
| xeroWebhook | xerowebhook-00004-wev | 401 | | |

Gate: probe table unchanged against the baseline (no 5xx), signed test deliveries from the app, 30-minute log watch.

## Rollback used

None so far.
