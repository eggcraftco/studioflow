# eBay — the afternoon's autonomous run (10 September 2026, operator away)

Operator's instruction (10 Sep, ~13:35Z): proceed through six numbered items with tests and evidence; record blockers as
"awaiting approval", "user session needed" or "automatic security check refused", and move to the next independent
item. This file is the evidence for items 1–5; item 6 has its own files. No secret value appears anywhere.

## 1. The backend state, confirmed — what is functionally proven versus merely quiet

| Layer | Proof that is functional (not "zero errors") | Source |
|---|---|---|
| Worker + queue | tasks with OIDC `ebay-connector@` and with the compute default both reached the handler, which failed closed with `connection_missing` and wrote nothing (tests A2 / A2-compute, 11:21Z) | `ebay-sandbox-rollout-2026-09-10.md` §6 |
| Scheduled sweeps | `reconcileEbayConnections`: HTTP 200 from Cloud Scheduler with the application log `connector off` (12:00Z, 12:15Z, 12:30Z, …); `reconcileEbayDeletions`: HTTP 200 every 10 minutes, silent on an empty ledger — and at 13:45Z it **re-drove a row** (§2 below) | `ebay-sandbox-backend-2026-09-10.md` §5.3; this file §2 |
| Public endpoints | `ebayOAuthCallback`: 405 on GET, 401 unsigned; `ebayNotifications`: challenge answered with the hash predicted from the secret (12:56Z), 401 unsigned POST | `ebay-relay-key-and-deletion-token-2026-09-10.md` §1; backend §5 |
| Callables | 401 `UNAUTHENTICATED` without a user; the positive paths need a signed-in workspace owner and stay proven by the unit and emulator suites only (CI run 34471692589; local 1,656 PASS + both eBay e2e suites, this afternoon) | backend §5; this file §4 |
| Rules | ruleset `8256326f` == committed `firestore.rules`; the eBay rules suite (52 assertions) and the full rules suite green on that file | backend §2.1 |
| Web relay | a ticket minted under the secret was sealed with 204 + `__Host-` cookie; a tampered one refused | relay-key §2 |

Not proven functionally, and said so: the sync/import/order paths against a real eBay Sandbox (no connection exists;
item 4 below), and the deletion path against a real eBay notification (needs the portal registration, a production
keyset gate). Health at 13:20Z and 13:46Z: no WARNING/ERROR from any `ebay*` service beyond the operator's own probes.

## 2. Runtime service account → queue → worker: proven with one synthetic ledger row (approved)

**Pre-checks from code** (`functions/ebayConnector.js`): `processEbayBuyerDeletion` (1566–1631) makes no eBay API call
(no `client.`, `appAccessToken`, `oauth.`, `publicKey` inside it); it matches the task's hashes against
`ebayBuyers.usernameHash` and `ebayConnections.sellerUserIdHash` — **both collections held 0 documents** (13:39:50Z,
read-only count) — so random 64-hex hashes can match nothing, scrub no order, delete no restricted document and
disconnect no seller; the worker path for `buyer_deletion` skips the health touch (1531). The reconciliation pass
re-drives a `queued` row once `receivedAtMs` is older than the 5-minute backoff (1694–1728).

**The row:** `ebayDeletionRequests/preflight-synthetic-20260910T134031Z`, written 13:40:31Z with `status: queued`,
`leaseUntilMs: 0`, `receivedAtMs` = now − 7 min, `attempts: 0`, two random hashes, `synthetic: true` and a note;
the only document in the collection.

**The correlated trace (raw log `synthetic-deletion-watch.log`):**

| Time (UTC) | Where | Record |
|---|---|---|
| 13:45:04.686 | `reconcileebaydeletions` | HTTP 200, user-agent Google-Cloud-Scheduler — the scheduled run |
| 13:45:04.781 | Firestore | the row leased: `leaseUntilMs` +5 min, `reconciledAtMs` / `lastRedeliveryAtMs` stamped (poll at 13:45:07 saw it) |
| 13:45:05.105 | Cloud Tasks queue `ebayEventWorker` | `taskCreationLog` OK, task `96857506344983599201`, target `…/ebayEventWorker` — **created by the sweep's own identity, `ebay-connector@`** (the only principal in that container); the sweep's log line reads `ebay deletion reconciliation: 1 unfinished, 1 re-driven, 0 waiting, 0 stuck` and there is **no** `ebay deletion enqueue failed, running inline` warning |
| 13:45:05.110 | Cloud Tasks | `attemptDispatchLog` |
| 13:45:05.196 | `ebayeventworker` | **HTTP 204**, user-agent Google-Cloud-Tasks (a new instance started for it) |
| 13:45:08.725 | Firestore | the row **`status: done, attempts: 1`**, all counters 0, `sanitizedError: ""` |
| 13:45:08.825 | Cloud Tasks | `attemptResponseLog` OK |
| 13:45:42 | Firestore | the synthetic row deleted; `ebayDeletionRequests` count 0 |

**What this proves:** the production enqueue leg end to end — `cloudtasks.tasks.create` on the queue **as
`ebay-connector@`** (row 4), the OIDC token for `ebay-connector@` minted for a task *created by* `ebay-connector@` (the
reflexive `actAs`, row 5), dispatch accepted at the worker's door (row 6), and the worker's deletion path completing.
The open item of the morning's evidence is closed. Nothing but the synthetic row was written, and it is gone.

## 3. TTL — the three eBay-only groups, analysed and enabled (approved conditionally; conditions met)

| Group | How `expireAt` is written | Existing docs / expired / pending at 13:39:50Z | Deleting an expired doc means |
|---|---|---|---|
| `ebayConnectStates` | `beginEbayConnect` writes `expireAt = now + 10 min` beside `used: false` (517); a state past its expiry is unusable by design | 0 / 0 / 0 unused | nothing — an expired state can neither be claimed nor exchanged |
| `ebayPresentedCodes` | `claimCode` creates `{ expireAt: now + 1 h }` as the replay trap for an eBay authorization code (655–668); the design text says "create as the primitive, duplicate → skip, TTL to clean up" | 0 / 0 / — | nothing — a code older than an hour cannot be exchanged at eBay anyway |
| `ebayDeletionRequests` | `claimDeletion` writes `expireAt = now + 400 days` on first receipt (1681); the reconciliation pass alarms a row long before that (12 attempts) | 0 / 0 / 0 queued-or-failed | a 400-day-old row; nothing pending could be that old without twelve alarms first |

No pending work, no early deletion, no undefined retention → the three policies were enabled 13:40:38Z
(`gcloud firestore fields ttls update expireAt --collection-group=<g> --enable-ttl`) and reached **ACTIVE** by 13:45:44Z.
The shared `deliveries` group (59 documents across connectors) was **not touched**, as instructed.

## 4. Sandbox OAuth with one workspace — the switch is global, so the narrow gate was built instead (not deployed)

**Finding.** `beginEbayConnect` (`ebayConnector.js:505-509`) requires `connectorOn()` — the process-wide
`NIVADESK_EBAY_CONNECTOR=1` — and `providerFlagOn()` — `appConfig/commerce` → `connectors.providers.ebay` (or the
global `connectors.enabled`). Neither names a workspace; the per-connection entries (`connectors.connections["ebay:<id>"]`)
gate sync/import/queue **after** a connection exists. Turning the switch on would let **every** workspace owner start a
consent flow. Per instruction: not turned on.

**Prepared and tested, on branch `ebay-workspace-allowlist` (`9b94433b`, `6566f9aa`; pushed; not merged, not
deployed):** `connectors.workspaces` in the flag document — `"ebay:<companyId>": true` lists one workspace, `"ebay:*": true`
opens all, an exact entry beats the wildcard, and **no entry means closed** whatever the provider entry says
(`flags.js` `workspaceEnabled`, `beginEbayConnect` refuses with "eBay is not enabled for this workspace yet."). Tests:
`commerce-flags.test.js` precedence case; `ebay-connect.test.js` three gate cases; the harness and the e2e seeds list
their own workspace; full unit suite **1,656 PASS**, both eBay emulator suites green. Two test-environment fixes rode
along: the sanitize and wiring tests now read "the marker is committed" as *tracked by git* (the marker has been
git-ignored since `e7f59525`, so its presence on the deploying machine wrongly failed them).

**Still needed before any Sandbox OAuth, none of it doable alone:** (1) the operator names the test workspace — no
designated eBay test workspace or sandbox seller exists in the records (the review workspace is excluded); (2) the
branch is merged and the eBay functions redeployed by name (the gate lives in `ebayConnector.js`, shared by all
seventeen); (3) `NIVADESK_EBAY_CONNECTOR=1` on the deploying machine and `appConfig/commerce` → `providers.ebay: true` +
`workspaces["ebay:<that companyId>"]: true`; (4) a sandbox seller (eBay *Create Test Users*) and its consent in a
browser — **user session needed**. Status: **awaiting approval + user session needed.**

## 5. Sandbox acceptance tests — not started

Depend on §4; nothing was run, nothing counted. The emulator-proven rows of the package's table (§6, rows 5–9) remain
emulator-only proofs, stated as such.
