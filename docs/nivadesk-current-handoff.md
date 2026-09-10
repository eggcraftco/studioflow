# NivaDesk — current hand-off record (written 10 September 2026, 19:10Z)

Read this first after a context reset or in a new session, then compare it with the live git and cloud state before
acting. Do not repeat work listed as done; do not treat candidates in older summaries as the current state. No password,
token, OAuth code or secret value appears here.

## 0. Repository state at hand-off

| | |
|---|---|
| Deploy branch | `macbook-save-before-macstudio-2026-06-01` — this is the branch functions are deployed from, by name only |
| HEAD | **`447ef785`** == `origin/macbook-save-before-macstudio-2026-06-01`; working tree clean (0 modified, 0 untracked) |
| Deploy runbook | `docs/audit-deploy-checklist.md` — ancestor check for the Stripe fix `76c5e3c3`, clean tree, `functions/.env` present, `functions/` == origin tip, deploy by name never `--only functions`; **new section:** the shared `.env` carries `NIVADESK_EBAY_CONNECTOR=1` and rides every later eBay deploy — re-check scope before each |
| Local-only deploy prerequisites (not in git) | `functions/.env` (ignored; holds the sandbox lines `NIVADESK_EBAY_ENVIRONMENT=sandbox`, `NIVADESK_EBAY_RUNAME=EGGCRAFT_LIMITE-EGGCRAFT-NivaDe-nerasfwi`, `NIVADESK_EBAY_CONNECTOR=1`) and the marker `functions/.ebay-secrets-ready` (ignored since `e7f59525`); both exist on this machine |
| Side branches, all pushed | `ebay-workspace-allowlist` @ `120615ad` — already merged into the deploy branch (`def97f49`), kept for history. Not merged: `activation-v21-cutover` @ `3f20e04f` (branch only, no worktree), `retention-wiring` @ `55f6fa4d`, `onboarding-retention` @ `4d525de4` (the older source of the activation work) |
| Worktrees (`git worktree list`) | `~/Developer/studioflow-retention` (`retention-wiring`), `~/Developer/studioflow-onboarding` (`onboarding-retention`), `~/Developer/studioflow-stripe` (`stripe-trial-stamp`, already merged), `~/Developer/studioflow-openai-review` (`openai-resubmission`), `~/Developer/studioflow-ebay` and `studioflow-ebay-carry` (superseded eBay candidates), `studioflow-mcp`, `studioflow-ssrf`, `studioflow-whatsapp`, `studioflow-hostinger-sync-20260530`; the web publish repo `~/Developer/studioflow-hostinger-publish-20260530` is separate (Round 170 `4e3a05f` live). Functions are deployed only from the main checkout |
| Background jobs | none running; no pending deploy; no scheduled watches |
| Credentials | gcloud user + ADC + Firebase CLI were re-authenticated by the operator between 11:13Z and 11:21Z on 10 Sep after a session-reauth wall broke a deploy mid-run (rollout doc §5); check `gcloud auth print-access-token` before any long deploy |
| Chrome (claude-in-chrome tab group) | tab "OpenAI Platform" (platform.openai.com/plugins) and tab "NivaDesk" signed in as `contact@nivadesk.co.uk` on Settings → Integrations → eBay; the Chrome profile's nivadesk.app session is now this account (it was `review@nivadesk.app` before — never act in that session) |

## 1. eBay — the last verified state (the live work of today)

| Item | State |
|---|---|
| Functions | all 17 eBay functions live on `ebay-connector@eggcraft-studio.iam.gserviceaccount.com` with the six secrets at version 1. **Four carry the connector switch** (`NIVADESK_EBAY_CONNECTOR=1`, revision `-00002-`): `beginEbayConnect`, `claimEbayConnectState`, `ebayOAuthCallback`, `getEbayConnections`. **The other twelve and the worker are switched off** (revision `-00001-`, no env): `syncEbayNow`, `previewEbayImport`, `runEbayImport`, `retryEbayImportFailures`, `verifyEbayConnection`, `updateEbayConnectionSettings`, `disconnectEbay`, `revealRestrictedCustomer`, `reconcileEbayConnections`, `reconcileEbayConnectionsNightly`, `reconcileEbayDeletions`, `ebayNotifications`, `ebayEventWorker` |
| Workspace gate (code) | `beginEbayConnect`, the native claim and the callback require an explicit `appConfig/commerce` → `connectors.workspaces["ebay:<companyId>"]: true` (or `"ebay:*"`); the provider switch alone opens nothing; a workspace delisted mid-flow is refused at the callback (`reason=workspace`, state burned, code spent) — merged `def97f49` |
| Flag document | `appConfig/commerce.connectors` = `{ providers: { ebay: true }, workspaces: { "ebay:GuglEFKSEKNTq1xibFpJav3EWkY2": true } }` — **only this workspace may begin a connection**; `shadow` and `queue` untouched |
| NivaDesk test account | **`contact@nivadesk.co.uk`**, Auth uid `GuglEFKSEKNTq1xibFpJav3EWkY2` — do not confuse with `contact@eggcraft.co.uk` (the operator's Google/GCP identity and the real EGGcraft workspace) or `review@nivadesk.app` (OpenAI review, off-limits) |
| Test workspace | **`GuglEFKSEKNTq1xibFpJav3EWkY2`, name "test"**, owner = the account above (verified), 0 orders, 0 customers, plan trialing; the app allows one workspace per account |
| Sandbox seller | **`TESTUSER_nivadesk_seller1`** (eBay sandbox user registered on 10 Sep before the 18:53Z OAuth begin — form filled by the assistant with non-secret values, password and *Register* by the operator; seller id `mtm4ubrcsv2`, site EBAY_GB); password known only to the operator |
| Connection | **`ebayConnections/GuglEFKSEKNTq1xibFpJav3EWkY2__mtm4ubrcsv2`**: `status: connected`, `environment: sandbox`, `readOnly: true`, scopes `sell.fulfillment.readonly` + `commerce.identity.readonly`, marketplace EBAY_GB/GBP, `importState: none`, `lastSyncAtMs: 0`; credentials in `credentials/current` (encrypted, never read) |
| Verified | OAuth completed 19:01:46–19:01:51Z; read-only *Check now* (`verifyEbayConnection` → one `getOrders` limit 1) HTTP 200 at 19:03:07Z; `ebayQuota/2026-09-10` calls 1. Evidence commit **`447ef785`** (`docs/ebay-sandbox-opening-2026-09-10.md` §8) |
| `autoSync` | `true` on the connection, **but the sweeps run with the switch off**, so nothing syncs. Deploying `reconcileEbayConnections`/`reconcileEbayConnectionsNightly`/`ebayEventWorker` with the shared `.env` **will start automatic syncing of this connection** — decide before that deploy |
| Manual stage (approved 19:4xZ, **in progress, paused on an operator step**) | see `docs/ebay-manual-stage-2026-09-10.md`: `autoSync` **off** (19:46:57Z, stays off); `previewEbayImport`/`runEbayImport`/`syncEbayNow` deployed from `8352ea5e` (`-00002-hac/-caw/-buq`, switch on; thirteen others unchanged); Preview 90 days = 0 orders from the real Sandbox API; buyer test user registered by the operator; API Explorer prepared; **waiting for the seller token to be re-attached in the Explorer** — no new attempts until the operator says so; then listing → purchase → narrow preview → import → second import → Sync now. Push to the operator's two web tokens accepted; no e-mail path |
| Not done / not approved | payment, refund, shipping, automatic sync tests. The manual stage was **prepared** in `docs/ebay-manual-sync-stage-prep-2026-09-10.md` (19:40–20:05Z, read-only): deploy list = `previewEbayImport`, `runEbayImport`, `syncEbayNow` (optional `retryEbayImportFailures`) from `c5dfee5a`; worker not needed (plan `team_monthly` has no order limit); `autoSync` off via the web checkbox (ungated callable, no deploy); no flag change needed; no sandbox order exists yet — one must be created (buyer test user + AutoPay-false listing + purchase); acceptance table and rollback in that file. Live state re-checked against this record: no differences; Scheduler jobs enabled with switched-off targets; 2 web push tokens on the test workspace |
| Separate gates | production keyset (not created) → portal Marketplace Account Deletion registration (endpoint proven with the token: challenge hash matched 12:56Z); production OAuth/RuName/Worker; the design's test B (impersonated enqueue) — superseded by the synthetic-ledger proof |
| Proven earlier today | runtime SA enqueue leg (synthetic ledger row 13:45Z, deleted after), TTL policies on `ebayConnectStates` / `ebayPresentedCodes` / `ebayDeletionRequests` ACTIVE, Firestore rules ruleset `8256326f` == committed file, Hostinger `NIVADESK_EBAY_CALLBACK_KEY` == secret (minted ticket sealed 204), delivery tests A2/A2-compute |
| Evidence files | `docs/ebay-sandbox-rollout-2026-09-10.md` (step 1: SA, secrets, worker, delivery tests), `docs/ebay-sandbox-backend-2026-09-10.md` (step 2: sixteen functions, rules), `docs/ebay-relay-key-and-deletion-token-2026-09-10.md`, `docs/ebay-autonomous-2026-09-10.md` (enqueue proof, TTL, allowlist), `docs/ebay-sandbox-opening-2026-09-10.md` (gate live, connection), `docs/ebay-operator-handoff-2026-09-10.md`; raw folders beside them with SHA-256 manifests |
| Rollback pointers | rollout §7 (step 1 resources), backend §6 (the sixteen); the opening doc has no rollback section — to undo today's opening: remove the workspace entry from `appConfig/commerce` (closes begin, claim and callback at once), delete the connection document (`disconnectEbay` is switched off and would refuse), and only if the gate itself must go `git revert -m 1 def97f49` plus a redeploy of the four by name |

## 2. Other live threads

| Thread | Verified state | Next |
|---|---|---|
| OpenAI ChatGPT app 1.2.0 | **In Review** — submitted by the operator 10 Sep 09:12Z; the platform's version list showed 1.2.0 Review, 1.1.1 Rejected, 1.0.0 Published, and still Review in the open Chrome tab at hand-off. MCP/OAuth surface frozen: no redeploy of `chatgptMcp`, `chatgptOAuthAuthorize` or the other OAuth functions (revisions `chatgptmcp-00073-fuz`, `chatgptoauthauthorize-00045-has` unchanged); the review workspace `KSQidetb3oOSItE9amLISf9Lh6h2` / `review@nivadesk.app` untouched | wait for OpenAI; after a decision see memory `openai-review-next-steps` |
| Stripe L1 / trial-stamp fix | `76c5e3c3` live (`stripewebhook-00047-por`, `resyncstripeworkspaceentitlements-00032-xej`) and on the deploy branch (`b6b30acc`); **natural-traffic observation: no alert policy exists and nobody is watching it automatically** — the last verified statement is the 24-hour check window noted in memory (until 10 Sep 23:00:56Z); read the Stripe evidence `docs/security/evidence/stripe-l1-deploy-2026-09-10.md` before claiming anything newer | a deliberate log check after the window, not a claim |
| Google support case 75151719 (Amazon CRTD) | the corrected test ran once (job `crtd-test-base64-elf-2026-09-10-09-28-57-utc`), no finding; the reply was sent by the operator from the e-mail thread 10 Sep ~11:50Z; **awaiting the Product Specialist**; Amazon Control 3 stays open; Developer Profile not submitted; no new test or message | wait |
| Activation v2.1 cutover | branch `activation-v21-cutover` (`1fb4d17e` three-way `derive.js` carry preserving the eBay `integration_connected` change; `3f20e04f` package `docs/onboarding/activation-v2.1-cutover-2026-09-10.md`, on that branch only); dry run 13:52Z: 23 → 9 activated, 16 shell-only flips; suite 1,661 PASS, CI green | **awaiting approval**: merge + `firebase deploy --only functions:getActivationFunnel` (expect 9/64); rollback = redeploy from `51ad6953` |
| Retention wiring | branch `retention-wiring` `55f6fa4d`: rules for `retention`/`retentionLog`/`retentionInbound` (server-only), `retentionMessages` (member-readable), `retentionReplyKeys`; outbox collection-group index; support-case stamp in all four ticket paths; unit + emulator rules + CI green; **all four flags off, nothing deployed** | decisions 1–4 (inbound route, reply domain, sender identity, two secrets); product work 5–6 (in-app reader, eleven-language copy) |
| Etsy | runtime == code (11 functions, deployed 6 Sep, no Etsy source change since); Android order path safe (`updateWebOrder` → field-level `transaction.update`); store builds still pre-2 Sep merge fix; developer-account verification needs the shop's own login (the Chrome Etsy session is a personal profile with no apps) — **user session needed**; no submission, e-mail or store publish | wait for the operator |
| Gmail filter | done 11:36Z in contact@eggcraft.co.uk: `from:(notifications@github.com) subject:"Run failed:" subject:"eggcraftco/studioflow-app"` → skip inbox, mark read, label `NivaDesk/GitHub CI`; 26 existing threads relabelled — **do not redo** | — |
| CI | `functions-tests.yml` parses again since `658fe5f8` (the relay job name was an unquoted colon; every push had produced "No jobs were run" since 4e74929f); runs green on the deploy branch and the three side branches; docs-only pushes no longer trigger it | — |
| Amazon hardened project | `nivadesk-amazon`: CRTD five tests no finding; ETD closed by Google as tier limitation; nothing else pending beyond the case reply | — |

## 3. Standing rules still in force

- Deploy only by name from the deploy branch after the runbook checks; never `--only functions`; never from another worktree.
- Preserve the Stripe fix in every merge; do not redeploy OpenAI MCP/OAuth, Stripe or checklist functions.
- No secret, token, password, OAuth code or PKCE verifier in logs, evidence, chat or shell history; the assistant never types
  credentials into third-party forms (hPanel, eBay portal, Etsy, Gmail) — the operator does.
- No production eBay keyset/OAuth; no portal deletion-token registration without the production-keyset decision.
- Ownership/membership of workspaces is never changed from the database; no plan purchases.
- Blocked actions are recorded as "awaiting approval", "user session needed" or "automatic security check refused" —
  never retried through another tool or identity.

## 4. How to resume

1. `git fetch && git status` on the deploy branch; confirm HEAD `447ef785` or later and a clean tree; `gcloud auth print-access-token` works.
2. Read `docs/night-report-2026-09-10.md` (the single timeline) and the eBay evidence files above; compare with
   `gcloud run services describe <name>` revisions for the seventeen and with `appConfig/commerce`.
3. Take the operator's next instruction; the first pending decision is the eBay manual stage prepared in
   `docs/ebay-manual-sync-stage-prep-2026-09-10.md` (three functions by name, `autoSync` off first, one real sandbox order).
