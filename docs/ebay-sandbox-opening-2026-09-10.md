# eBay sandbox — the controlled opening, part 1: the workspace gate is live, the workspace is not yet chosen (10 September 2026, evening)

Operator's instruction (18:0xZ): test2 (`Yl4v2SUXiLhGZttcexy7TPwED4B2`) chosen for the sandbox tests; report its owner's
e-mail; check the portal's sandbox test users; if CI on `120615ad` is green, merge the allowlist branch and deploy the four
functions by name; apply `appConfig/commerce` only in the eBay fields; record the twelve functions still switched off
and the unchanged OpenAI/Stripe/checklist revisions; write the shared-`.env` warning into the runbook.

## 1. The chosen workspace cannot start a connection today — a decision is needed

| | |
|---|---|
| Workspace | `Yl4v2SUXiLhGZttcexy7TPwED4B2` "test2", owner uid `Yl4v2SUXiLhGZttcexy7TPwED4B2`, `ownerEmail` **`test123@nivadesk.app`** |
| Firebase Auth | **neither the uid nor the e-mail exists** (`auth/user-not-found`, read at 18:1xZ) — the owner account was deleted |
| Members | one remaining member, `ro***@nivadesk.app`, role `member` (exists, not disabled) |
| Consequence | `beginEbayConnect` requires the workspace **owner** (`requireWorkspaceOwner`); no account can sign in as this owner; ownership and membership were not changed, per instruction |
| Options put to the operator | (a) the fallback `aiVY7UKjbfP5Dkhy5lamTTltkex2` "testwork" — owner account exists and is enabled (`co***@nivadesk.app`), 8 orders, one customer record with an e-mail; (b) a fresh test workspace opened by the operator under a test account |

`appConfig/commerce` was therefore **not written** — the entry is meaningless until a workspace whose owner can sign in is
named. Current document (read 18:1xZ): `shadow` (Shopify dev store), `queue`, a note — **no `connectors` key at all**,
so the provider entry and the workspace entry will both be new fields; `shadow` and `queue` will be untouched (merge
write, before/after diff to be recorded when applied).

## 2. Sandbox test users

The portal offers no listing of existing sandbox users — only *Create Test Users* (`/sandbox/register`) and
*Reset Password*; `/sandbox` itself is a 404. The registration form was opened in the operator's signed-in session
("Hi nivadesk"): Username (`TESTUSER_` prefix fixed), First name, Last name, Email + re-enter, Password, Feedback score,
Registration date, Registration site (United Kingdom is `3`), *Register*. Nothing was typed. The operator either
registers a seller here or names an existing one; only the username is needed by this side.

## 3. CI, merge, deploy — done under the standing approval

- CI on `120615ad` (the callback/claim gate): **success**, run 34512798580, 18:11Z.
- Merge: `ebay-workspace-allowlist` → deploy branch, normal `--no-ff`, **`def97f49`**, pushed; `functions/` tree identical to
  the branch; ancestors `76c5e3c3` (Stripe), `baa21204` (OpenAI 1.2.0), `b9aeec70` (checklist), `cf9dd20b` (eBay) present;
  production diff since `5d24bf18`: `functions/commerce/flags.js` (+26/−3) and `functions/ebayConnector.js` (+15) only;
  `functions/lifecycle`, `functions/retention`, `firestore.rules`: 0 lines — the activation and retention branches were
  **not** carried.
- Shared env: `functions/.env` gained `NIVADESK_EBAY_CONNECTOR=1` (beside the sandbox environment and RuName lines).
- Deploy 18:18:19Z → 18:21:20Z, `--only functions:beginEbayConnect,functions:claimEbayConnectState,functions:ebayOAuthCallback,functions:getEbayConnections`,
  four `Successful update operation`, exit 0.

## 4. Read-backs

| Function | Revision | `NIVADESK_EBAY_CONNECTOR` in the container env |
|---|---|---|
| beginEbayConnect | beginebayconnect-00002-cod | PRESENT |
| claimEbayConnectState | claimebayconnectstate-00002-kub | PRESENT |
| ebayOAuthCallback | ebayoauthcallback-00002-cox | PRESENT |
| getEbayConnections | getebayconnections-00002-jur | PRESENT |
| syncEbayNow | syncebaynow-00001-gun | absent |
| reconcileEbayConnections | reconcileebayconnections-00001-xan | absent |
| ebayEventWorker | ebayeventworker-00001-cej | absent |
| ebayNotifications | ebaynotifications-00001-wuv | absent |
| previewebayimport | previewebayimport-00001-vul | absent |
| runebayimport | runebayimport-00001-tod | absent |
| retryebayimportfailures | retryebayimportfailures-00001-pep | absent |
| verifyebayconnection | verifyebayconnection-00001-buj | absent |
| updateebayconnectionsettings | updateebayconnectionsettings-00001-kat | absent |
| disconnectebay | disconnectebay-00001-dep | absent |
| revealrestrictedcustomer | revealrestrictedcustomer-00001-vom | absent |
| reconcileebayconnectionsnightly | reconcileebayconnectionsnightly-00001-tiy | absent |
| reconcileebaydeletions | reconcileebaydeletions-00001-sah | absent |

Twelve functions plus the worker keep the switch **off**: their sweeps, sync, import and order notifications do nothing;
account deletion (`ebayNotifications` deletion path, `reconcileEbayDeletions`) is ungated by design and unaffected.
Unauthenticated probes on the redeployed callables answer as before:
- beginEbayConnect -> 401
- getEbayConnections -> 401

**Unchanged revisions:** chatgptmcp-00073-fuz, chatgptoauthauthorize-00045-has, stripewebhook-00047-por,
resyncstripeworkspaceentitlements-00032-xej, getsetupchecklist-00003-noh.

## 5. What the gate now enforces in production (with the flag document still without `connectors`)

`connectorOn()` is true in the four functions, but `providerFlagOn()` is false (no `connectors.providers.ebay`) and
`workspaceFlagOn()` is false for every workspace (no `connectors.workspaces`) — so `beginEbayConnect` refuses every
owner with "not enabled on this server yet" until the document names a provider and a workspace. Nothing can be
started anywhere; the callback and the claim would refuse a delisted workspace mid-flow (reason `workspace`, the web
relay shows it as `unavailable` until the web vocabulary learns the word).

## 6. The runbook line

`docs/audit-deploy-checklist.md` now says it: the switch lives in the shared `.env`, it rides every later by-name deploy
of the other twelve eBay functions and the worker, and each eBay deploy must re-check that scope first.

## 7. Next, once the operator answers

Workspace decision → `appConfig/commerce` merge write (`connectors.providers.ebay: true`, `connectors.workspaces["ebay:<id>"]: true`),
before/after diff → sandbox seller username → the operator signs in to nivadesk.app as that workspace's owner and presses
Connect in Settings → Integrations → eBay; consent in the sandbox sign-in; then the read-only verification
(`verifyEbayConnection` → one `getOrders` read) and the workspace/seller/environment match from the connection document,
tokens never shown.

## 8. Part 2 — the account switch, the seller, the consent, the connection (18:30–19:03Z)

**Account.** The operator moved to `contact@nivadesk.co.uk` (Auth uid `GuglEFKSEKNTq1xibFpJav3EWkY2`, created 18:30:37Z,
password provider). It owns exactly one workspace, **`GuglEFKSEKNTq1xibFpJav3EWkY2` "test"** (created today, plan trialing):
0 orders, 0 customers, 0 bank/accounting/inventory/ticket documents, 0 eBay connections — an empty test workspace, so no
new workspace was created (the app allows one active workspace per account anyway). The Chrome session first showed the
review account (`review@nivadesk.app`, "My Studio") — nothing was clicked in it; the operator signed out and back in as
`contact@nivadesk.co.uk`; the profile page then read Workspace `test`, Role `Owner`, User ID `GuglEF…WkY2`.

**Flag document.** `appConfig/commerce` merge-written at 18:40:22Z: only `connectors` was added —
`providers.ebay: true`, `workspaces["ebay:GuglEFKSEKNTq1xibFpJav3EWkY2"]: true`; `shadow`, `queue` and the note byte-identical
before and after (diff in the run log).

**Sandbox seller.** No record in either mailbox (contact@eggcraft.co.uk: only the 5 Sep welcome and 6 Sep keys-changed
mails from dev-relations@ebay.com; gunes.gocmen@gmail.com: nothing). The registration form was filled by the assistant
with non-secret values (username `TESTUSER_nivadesk_seller1`, NivaDesk / Sandbox, contact@nivadesk.co.uk, site United
Kingdom (3), the form's own defaults for feedback score 500 and registration date 01.01.2006); the operator typed the
password and pressed *Register*; the page confirmed `successfully registered sandbox user TESTUSER_nivadesk_seller1`.

**The flow, correlated.**

| Time (UTC) | Where | Record |
|---|---|---|
| 18:53:53 | `beginEbayConnect` | HTTP 200 (owner of `test`); one `ebayConnectStates` row: `environment: sandbox`, `origin: web`, `used: false` |
| 18:53:5x | browser | `signin.sandbox.ebay.com` with `ru` → `auth2.sandbox.ebay.com/oauth2/consents`, `client_id` = the sandbox App ID, `redirect_uri` = `EGGCRAFT_LIMITE-EGGCRAFT-NivaDe-nerasfwi`, scopes `sell.fulfillment.readonly` + `commerce.identity.readonly`, `response_type=code` |
| 18:58 | browser | the operator signed in as the sandbox seller; consent page "Review and Grant Application Access: NivaDesk" listing the two permissions |
| 19:01:46.567 | `ebayOAuthCallback` | HTTP 200 (the web relay's signed POST) — the state burned (`used: true`), one row in `ebayPresentedCodes`, the code exchanged, the identity read |
| 19:01:51.380 | Firestore | **`ebayConnections/GuglEFKSEKNTq1xibFpJav3EWkY2__mtm4ubrcsv2`**: `companyId` = the test workspace, `connectedByUid` = its owner, `environment: sandbox`, `sellerUsername: testuser_nivadesk_seller1`, `sellerUserId: mtm4ubrcsv2`, `registrationMarketplaceId: EBAY_GB`, `accountType: INDIVIDUAL`, `marketplaces: [EBAY_GB/GBP]`, `readOnly: true`, `status: connected`, `scopes` = the two above; `credentials/current` holds only `accessTokenEncrypted` / `refreshTokenEncrypted` and their timestamps (values never read); `syncLog: connected` |
| 19:01:5x | UI | "eBay account connected." — Sandbox · Read only · Connection Healthy · EBAY_GB · Calls used today 0 / 500 |
| 19:03:07.159 | `verifyEbayConnection` (*Check now*) | HTTP 200 — one `getOrders` read (limit 1, last 24 h, the only call that proves `sell.fulfillment.readonly`); `lastVerifiedAtMs` 19:03:08.763Z; `ebayQuota/2026-09-10`: `calls: 1`, `byFamily.orders: 1`, `byConnection[…mtm4ubrcsv2]: 1`; UI "The eBay connection is working." — Calls used today 1 / 500 |

The identity read at the callback (`commerce.identity`) and the *Check now* `getOrders` are the two read-only Sandbox
API calls of this step. No WARNING/ERROR from any `ebay*` service between 18:53Z and 19:03Z. **Workspace ↔ seller ↔
environment match:** connection document's `companyId` == the chosen workspace, `connectedByUid` == its owner
(`contact@nivadesk.co.uk`), `environment` == `sandbox` == the deployed `NIVADESK_EBAY_ENVIRONMENT`, seller == the user
registered minutes earlier.

**Final state of the test workspace:** listed in `connectors.workspaces` (open for *beginning* connections — it now has
one), connected read-only, `importState: none`, `lastSyncAtMs: 0`, 0 orders; `settings.autoSync: true` on the
connection, but the sweeps, the worker, `syncEbayNow` and the import functions still run with the connector switch
**off** in their containers, so nothing syncs or imports until those functions are deployed with the switch — the
next stage's decision. The other 12 functions and the worker are unchanged; OpenAI/Stripe/checklist untouched.

**Not done, by instruction:** no order, payment, refund or shipping test; no production keyset, no production OAuth,
no portal deletion-token change; no ownership or membership change; no password or token read.

