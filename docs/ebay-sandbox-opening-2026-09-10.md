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
