# eBay connector — the ACCOUNT half, design before code (6 Sep 2026, revised after review)

Source: `NivaDesk_Amazon_eBay_Integration_AI_Spec.md` (§7–11, 19–25, 30–31, 33, 35, 54–64, 67–69, 71–74, 77, 79, 81, 84–89).
The PURE half already exists and is not rewritten here: `functions/commerce/adapters/ebay.js`
(`normalizeEbayOrder`), `commerce/marketplaces.js`, `commerce/connectionCapabilities.js`
(`EBAY_DEFAULTS`), `commerce/capabilities.js`, and the pins in `test/qa/commerce-ebay-adapter`,
`marketplace-registry`, `marketplace-tax-and-net`. The adapter is touched in exactly one place in this
half (§8.3, `marketplaceId` pass-through), with a test that proves the bug first.

This half is: an eBay seller **account** — OAuth, credentials at rest, read-only order sync through the
common engine, sync health, the mandatory Marketplace Account Deletion endpoint, the Integrations card
on web/Mac/iPhone/Android, guide entries, and the tests. Listings, inventory, shipment write, refunds,
finance and payouts are **not** in this half; the connection must not claim them (§62 registry stays as
the three-state map, `orders.read` is the only capability this half proves — §4.1).

Positioning (§7): *bring eBay orders into the same NivaDesk workflow.* Never say "real-time sync",
"fully automatic accounting", "all eBay listing types" or "zero manual reconciliation" (§8).

**Everything ships gated off.** A deploy of this code with the gates closed is visually and
operationally indistinguishable from today (§7 TARGET, §77 E8, §87 #47).

Review revisions folded in (6 Sep): eBay-specific PII split and trip-wire (§8), keyed hashes and a
hash-only deletion task (§4.6, §4.7, §9), deletion compliance that bypasses the gates (§2, §9),
`kid` abuse limits (§9), a dedicated service account and worker for the eBay secrets (§3.2), browser-bound
OAuth state (§5), read-only scopes only (§0), the reveal callable's authorization model (§3.3),
owner-only preview with per-connection budget (§3, §7.4), six root deny blocks (§4.10), server-side
input whitelists (§4.11), the two-key encoding (§6), a 90-day retention window (§8.4),
signature-then-budget instead of per-IP (§9), cursor bisection + nightly reconciliation + forced
catch-up (§7.1, §7.6), refresh-failure classification by body (§6), the queue path routed through
`applyEbayOrder` (§7.5), the username as `customerName` (§8.2), the `marketplaceId` fix (§8.3), the
truthful capability map (§4.1), SDK-shaped signature verification and the order-topic decision (§9,
§7.5), resumable backfill (§7.2), environment-filtered sweep (§7.1), one status table (§10), the
`connectors` flag merge (§2), mandatory refetch on held release (§7.3), and cited eBay facts (§1).

---

## 0. Decisions at a glance

| Question | Decision | Why |
|---|---|---|
| Template | One Square-style factory `functions/ebayConnector.js` → `createEbayConnectorFunctions(deps)`; orders land only through `commerce/engine.applyEnvelope` in `mode:"apply"`, and every path (sweep, Sync now, import, queue, held release) goes through **one** `applyEbayOrder` (§7.5, MERGE-006) | The adapter already emits the canonical envelope; Etsy's own live applier + shadow path is legacy. Shadow mode has no live path to diff against, so it is inapplicable (§75 "shadow → verify → enable" is satisfied by the connector flag + sandbox seller instead) |
| Connection row | Root `ebayConnections/{companyId__sellerUserId}` (server-only), like `squareConnections` | Purge, lifecycle, sweep, wiring pins and the rules layout all assume root connector collections |
| Credentials | Separate server-only doc `ebayConnections/{id}/credentials/current`, boxed with `EBAY_TOKEN_KEY` via `security/tokenBox.js`; never on the connection doc | §11 "Token/secret bu JSON içinde tutulmaz" taken literally; the public view then has nothing to strip |
| Secrets identity | The **five** `EBAY_*` secrets (`EBAY_CALLBACK_KEY` included since §5.4) are mounted **only** on functions that run as the dedicated service account `ebay-connector@eggcraft-studio.iam.gserviceaccount.com`; eBay tasks ride their own Cloud Tasks worker `ebayEventWorker`, never `commerceEventWorker`; the access-control trip-wire is extended from `AMAZON_*` to `(AMAZON|EBAY)_*` (§3.2) | `docs/security/access-control-policy.md` §5 "Open remediation": a marketplace's credentials must not be readable by every function; eBay's obligations (API License Agreement, account-deletion program, buyer PII in `restrictedCustomer`) are the same class as Amazon's, so the same answer |
| Buyer PII | Split **before** the adapter by `commerce/ebay/sanitize.js` — its **own** camelCase path list and scanner, pinned against a captured sandbox order (§8.1); restricted half → `companies/{cid}/restrictedCustomer/{orderId}` (existing, `provider:"ebay"`); the order doc carries the buyer **username** as `customerName` (§8.2) | §25 minimisation + `privacy/outbound.js` already marks eBay `restricted: true`; the Amazon isolation layer is the precedent for the shape, not for the field names |
| Buyer identifiers at rest | Keyed hashes only: `HMAC-SHA256(EBAY_HASH_KEY, lower(value))` for `ebayBuyers`, the deletion ledger, the deletion task and the seller match; `sellerUserIdHash` stored on the connection at connect time (§4.6, §4.7, §9) | An unsalted SHA-256 of a low-entropy eBay handle is dictionary-reversible; a Cloud Tasks payload is readable by any project viewer |
| Reveal | `revealRestrictedCustomer` is **implemented in this half**, provider-agnostic, in `functions/privacy/reveal.js` + one wiring line; the Amazon side consumes it (§3.3) | Two variants racing is the failure mode; one owner |
| Customers list | **No** `upsertIntegrationCustomer` in this half. `MarketplaceCustomerProfile` rows are created `mergeStatus:"unreviewed"`; merging is a later, explicit-approval feature | §25 "sadece isim benzerliği ile merge YASAK"; the relay email is not an identity |
| Sync pattern | 15-minute reconciliation sweep on the common cursor (`lastmodifieddate` window with overlap, **bisected** on truncation) + a nightly `reconcileEbayConnectionsNightly` with a multi-day lookback + a forced catch-up from the stored watermark on flag-on/reconnect (§7.1, §7.6); `ORDER_CONFIRMATION` notifications through the same gateway once the per-seller subscription exists (`notifications: "subscription_dependent"`, §7.5) | §54/§55 (nightly full reconciliation with overlap), §85 #20/#21 — neither notification-only nor polling-only. eBay's only seller order topic is create-only, so polling stays the source of updates |
| Environment | `NIVADESK_EBAY_ENVIRONMENT` = `sandbox` (default) \| `production`, threaded through every host, written on the state doc **and** the connection doc, refused on mismatch, filtered by the sweep (§7.1) | Square precedent (SQ-AUTH-009) plus the sandbox-to-production flip (§7.7) |
| Gate | Three layers: secrets marker file, runtime env switch, Firestore connector flag (`appConfig/commerce.connectors`) — **none of which gates account-deletion compliance** (§2) | Deploy activates nothing; rollback without redeploy; per-connection pause; compliance is not a feature |
| Queue | `ebayEventWorker` (its own Cloud Tasks queue, created by the deploy under the function's own name, own service account); `retryCommerceEvent` re-enqueues eBay rows there instead of processing inline | §72 "payload goes to a queue"; §3.2 secrets isolation |
| Scopes | `sell.fulfillment.readonly` + `commerce.identity.readonly` — **nothing else** | Read-only half, `readOnly: true`, consent copy "NivaDesk will read your orders". Square precedent SQ-AUTH-011 (read-first). When shipment-write ships, the card's existing *Reconnect required* event carries the new scope; a leaked refresh token from this half cannot write |
| OAuth browser binding | `beginEbayConnect` returns a nonce whose hash is on the state doc; the web stores the nonce in a short-lived first-party cookie; the callback route reads it and copies it into a **signed POST body**, never a URL (§5.4), forwarding an absent cookie as `nonce: ""` so the state is still burned at the moment of consent; the function refuses a callback whose nonce does not match (`reason=browser`). Native clients start the flow through `nivadesk.app/ebay/start`, which requires a signed-in owner of the state's workspace (§5) | A workspace owner must not be able to phish a foreign seller's account into their workspace; PKCE would not help (verifier is server-held) and eBay has no PKCE |
| Preview / Sync now | `previewEbayImport` owner-only with the `syncLockUntilMs` single-flight; `syncEbayNow` member but charged to the connection's daily share (§7.4) | Square's preview is owner-only (`squareConnector.js` 832–833); an app-wide cap alone is a cross-tenant DoS |
| Retention | `privacy/retention.js` eBay `{ days: 90, reason: "ebay_address_withheld_after_90d" }` — restricted doc deleted 90 days after delivery by `sweepMarketplacePii` (§8.4) | eBay itself stops returning `addressLine1/2` for orders older than 90 days (§1); keeping them longer than eBay does is not minimisation |

---

## 1. eBay facts this design honours

Every row names the page it was read from and the sentence that was read (captured 6 Sep 2026 from
developer.ebay.com; re-verify against the same page before the production keyset, §92). A row marked
**UNVERIFIED** is a fact the design does **not** depend on, or one it hedges explicitly.

| Topic | Fact | Source / verify |
|---|---|---|
| Authorize | `https://auth.ebay.com/oauth2/authorize?client_id&response_type=code&redirect_uri=<RuName>&scope=<list>&state` — sandbox `https://auth.sandbox.ebay.com/oauth2/authorize`. Docs: "Instead of a URL, the OAuth flow requires a custom RuName value that eBay generates and assigns to your application." | *The authorization code grant flow* (`/api-docs/static/oauth-authorization-code-grant.html`) |
| Scope encoding | Docs: "scope=<scopeList> // a URL-encoded string of space-separated scopes"; every example encodes the separator as `%20`. **Decision:** `oauth.js` builds the query by hand — `scope=` + `scopes.map(encodeURIComponent).join("%20")` — and never through `URLSearchParams`/`searchParams.set`, which would emit `+`. `commerce-ebay-oauth.test.js` pins `%20` and the absence of `+`. | same page. Whether `+` is *also* accepted is UNVERIFIED and irrelevant once `%20` is pinned |
| RuName | Per keyset (sandbox and production have separate RuNames and separate app keys). The RuName's "auth accepted URL" is `https://nivadesk.app/ebay/callback`; "auth declined URL" is `https://nivadesk.app/settings?section=ebay&ebay=cancelled` | Owner registers both in the developer portal |
| Token | `POST https://api.ebay.com/identity/v1/oauth2/token` (sandbox `api.sandbox.ebay.com`), `Authorization: Basic base64(clientId:clientSecret)`, form `grant_type=authorization_code&code=&redirect_uri=<RuName>`. Response: `access_token`, `"expires_in": 7200`, `refresh_token`, `"refresh_token_expires_in": 47304000` (547.5 days ≈ 18 months) | same page (response example quoted) |
| Refresh | `grant_type=refresh_token&refresh_token=&scope=`. Docs: "If you do specify a scope parameter, the included scope values must be equal to or a subset of the scope values included in the consent request." **Decision:** the refresh request sends exactly the stored `scopes[]` (the granted set), never a wider one. | *Using a refresh token to update a User access token* (`/api-docs/static/oauth-refresh-token-request.html`) |
| Refresh rotation | eBay does **not** rotate the refresh token on refresh; when a refresh response does carry one, store it | UNVERIFIED as a doc sentence; the code stores whatever comes back, so nothing depends on it |
| Revocation | No public revoke endpoint for user tokens; the seller revokes from eBay account settings. Docs: "Refresh tokens can be revoked due to various merchant activity on eBay. Specifically, if a seller changes their eBay member log-in name or the password for their eBay account, any active refresh tokens associated with the account" are revoked. | same page. Disconnect = delete our boxes |
| Token-endpoint errors | Documented: `invalid_client` → **HTTP 401** `{ "error": "invalid_client", "error_description": "Client authentication failed" }`; `invalid_request` → **HTTP 400**. A revoked/expired refresh token answers **HTTP 400** `{ "error": "invalid_grant", … }` (SDK and community reports; the exact status is pinned from the first sandbox capture — see §6). **Decision:** classification reads the body's `error` field, never the status alone (§6). | *OAuth token introspection and revocation* page (errors table); `invalid_grant` status UNVERIFIED and hedged |
| Identity | `GET https://apiz.ebay.com/commerce/identity/v1/user/` (sandbox `apiz.sandbox.ebay.com`) → `{ userId, username, accountType, registrationMarketplaceId, individualAccount?{…}, businessAccount?{…} }` — scope `commerce.identity.readonly`. **Only `userId`, `username`, `accountType`, `registrationMarketplaceId` are persisted**; the `individualAccount`/`businessAccount` blocks carry the seller's own name, email and address and are dropped before the response leaves `fetchIdentity` (§5). | Identity API reference; `userId` is the stable key, username can change |
| getOrders | `GET https://api.ebay.com/sell/fulfillment/v1/order?filter=lastmodifieddate:[<fromIso>..<toIso>]&fieldGroups=TAX_BREAKDOWN&limit=200&offset=N` → `{ orders[], total, limit, offset, next?, prev? }`. Docs: "`limit` … returns up to 50 orders. If a requested limit is more than 200, the call fails and returns an error. … Maximum: 200 Default: 50"; "By default, when no filters are used this call returns all orders created within the last 90 days"; "getOrders can return orders up to two years old. Do not set the creationdate filter to a date beyond two years in the past"; "If creationdate and lastmodifieddate are both included, only creationdate is used"; timestamps "in ISO 8601 format … 24-hour Universal Coordinated Time (UTC)", examples with milliseconds and `Z`. **No sort parameter is documented** — the result order is treated as **unspecified** (§7.1 bisection does not rely on it). | getOrders reference (`/api-docs/sell/fulfillment/resources/order/methods/getOrders`) |
| Address ageing | Docs: "addressLine1 will not be returned for any order that is more than 90 days old" (and the same for `addressLine2`). | same page, `Address` type. Basis of §8.4 |
| One order | `GET /sell/fulfillment/v1/order/{orderId}?fieldGroups=TAX_BREAKDOWN` (404 → not found); `orderIds` on getOrders takes "a comma-separated list … (maximum 50)" | same page; used by the nightly fulfilment follow-up (§7.6) |
| Fulfilments | `GET /sell/fulfillment/v1/order/{orderId}/shipping_fulfillment` → `{ fulfillments[] }` | The adapter builds shipments **only** from `ctx.fulfillments` |
| `lastModifiedDate` on shipment | Whether creating a shipping fulfilment moves the order's `lastModifiedDate` is **UNVERIFIED** (not stated on the reference page). **Decision:** the design does not depend on it — the nightly pass re-fetches fulfilments for every unfulfilled order of the last 30 days by `orderIds` (§7.6). The sandbox e2e records the observed behaviour in the fixture's `_captured` block. | Verify in sandbox before production |
| TAX_BREAKDOWN | `fieldGroups=TAX_BREAKDOWN` populates `taxes[]` / `ebayCollectAndRemitTaxes[]`; without it every order lands `tax_responsibility_unknown` | getOrders reference ("Include the optional fieldGroups query parameter set to TAX_BREAKDOWN to return a breakdown of the taxes and fees") |
| Rate limits | Per-app daily call limits per API family; 429 may carry a `Retry-After`-style hint (or none); the Analytics API `getRateLimits` reports usage | Own limiter keyed `ebay + connection + operation family` (§7.4); never the Amazon bucket |
| Notification API | Destination (endpoint + verification token), subscription per topic; payload `{ metadata:{ topic, schemaVersion, deprecated }, notification:{ notificationId, eventDate, publishDate, publishAttemptCount, data:{…} } }`; header `X-EBAY-SIGNATURE` "ECC message signature"; public key via `GET /commerce/notification/v1/public_key/{public_key_id}` with an **application** token (client-credentials, `https://api.ebay.com/oauth/api_scope`). Docs: "The public key value retrieved from the getPublicKey method should be cached for a temporary — but reasonable — amount of time (e.g., one-hour is recommended.)" | Notification API overview + Marketplace Account Deletion page |
| Signature verification (SDK) | `eBay/event-notification-nodejs-sdk` `lib/validator.js`: header → `Buffer.from(header, "base64")` → JSON `{ alg, kid, signature, digest }`; key → the `key` string from getPublicKey with `\n` inserted after `-----BEGIN PUBLIC KEY-----` and before `-----END PUBLIC KEY-----`; `crypto.createVerify("ssl3-sha1")` (SHA-1) `.update(JSON.stringify(message))` where `message` is the **parsed** JSON body; `.verify(pem, signature, "base64")`; 412 on failure. **Decision:** verify over `JSON.stringify(parsedBody)` exactly as the SDK does, not over `req.rawBody` (§9). | GitHub `eBay/event-notification-nodejs-sdk` (`lib/validator.js`, `lib/constants.js`) |
| Order topics | `ORDER_CONFIRMATION` (Notification v1.6.x, 2025): "sent to a seller when the buyer completes the checkout process and payment clears"; "generated for each line item in the order"; requires a **user** token (authorization-code grant) with `sell.fulfillment` **or** `sell.fulfillment.readonly`; "The seller looks up the order ID from the notification and then makes a GetOrders call". `ITEM_MARKED_SHIPPED` is a **buyer**-side topic (scope `commerce.shipping`). There is **no** order-updated / order-shipped topic for sellers. **Decision:** §7.5 — event support = `ORDER_CONFIRMATION` per seller (subscription created with the seller's own token in a follow-up commit once the payload is captured in sandbox); updates and tracking stay on polling; legacy Trading API Platform Notifications are **out of scope** (§85 #21 answered, not deferred). | Notification API topic catalogue |
| Account deletion | Topic `MARKETPLACE_ACCOUNT_DELETION`, mandatory. Docs: challenge `GET https://<callback_URL>?challenge_code=123`; "hash together the challenge code, verification token, and endpoint URL … 200 OK … through a challengeResponse field in JSON format … content-type … 'application/json'. The three parameters must be hashed in the following order … challengeCode + verificationToken + endpoint"; SHA-256 hex; "verification token has to be between 32 and 80 characters … alphanumeric … underscore (_), and hyphen (-)"; POST `notification.data = { username, userId, eiasToken }`; "200 OK, 201 Created, 202 Accepted, and 204 No Content are all acceptable"; "eBay will resend the notification to the callback URL until it is acknowledged. After a 24-hour period of multiple, unacknowledged notifications … the callback URL is marked down … up to 30 days to resolve"; "be prepared to acknowledge up to 1500 notifications on any given day"; "Effective September 26, 2025, select developers will no longer receive username data for U.S. users through this field. Instead, an immutable user ID will be returned in its place." | Marketplace User Account Deletion page. The last sentence is why §9 matches the index on **both** hashes |
| Adapter pitfalls (already handled, do not regress) | no `collectedBy`; `taxes[]` vs `ebayCollectAndRemitTaxes[]`; `NET` collection method missing from `pricingSummary.tax`; `paymentReferenceId` is an array; `listingMarketplaceId` is a site id; `lineItemCost` is extended not unit | `commerce-ebay-adapter.test.js` |

---

## 2. Gates — deploying this code activates nothing (and compliance never switches off)

Three independent layers; each one alone keeps the connector dark. **Account-deletion compliance is
outside all three**: `entityType:"buyer_deletion"` is dispatched, processed and retried regardless of the
marker, the switch and the flag (§9); the challenge GET is always answered.

1. **Secrets marker (deploy-time).** Exactly the Xero precedent (`index.js` 134–141): the `defineSecret`s
   are declared only when `functions/.ebay-secrets-ready` exists or `NIVADESK_EBAY_SECRETS_READY=1`.
   Without the marker `EBAY_SECRET_PARAMS = []`, `EBAY_RUNTIME = {}` (no `serviceAccount` either — a
   function that names a service account that does not exist yet fails to deploy), and the Firebase CLI
   keeps deploying every other function. The marker is committed only after the owner has created the
   **five** secrets — `EBAY_CALLBACK_KEY` included since §5.4 — **and** the service account (§15; not
   this task; no gcloud). A deploy with the marker absent mounts nothing, which for the callback means
   401 on every request and `reason=unavailable` for every seller (§5.4, *Rollout*).
   ```js
   const EBAY_SECRETS_READY = process.env.NIVADESK_EBAY_SECRETS_READY === "1" || fs.existsSync(path.join(__dirname, ".ebay-secrets-ready"));
   const EBAY_SECRET_PARAMS = EBAY_SECRETS_READY
     ? [defineSecret("EBAY_CLIENT_ID"), defineSecret("EBAY_CLIENT_SECRET"), defineSecret("EBAY_TOKEN_KEY"),
        defineSecret("EBAY_HASH_KEY"), defineSecret("EBAY_CALLBACK_KEY")]   // five since §5.4
     : [];
   const EBAY_SERVICE_ACCOUNT = "ebay-connector@eggcraft-studio.iam.gserviceaccount.com";
   // Every eBay trigger spreads this into its options: secrets AND identity travel together (§3.2).
   const EBAY_RUNTIME = EBAY_SECRETS_READY ? { secrets: EBAY_SECRET_PARAMS, serviceAccount: EBAY_SERVICE_ACCOUNT } : {};
   const ebaySecretValue = (name) => process.env[name] || "";   // values arrive as env either way
   ```
   **Compliance without secrets:** the deletion POST needs an application token to fetch the signing
   key. When the secrets are absent (`EBAY_CLIENT_ID` blank) or the key fetch fails, `ebayNotifications`
   answers **503** `{ ok:false, error:"verification_unavailable" }` — retryable, so eBay keeps
   redelivering (`publishAttemptCount` climbs) and nothing is silently dropped — never 401. The
   challenge GET needs no secret and is answered whenever the verification token and endpoint URL are
   configured. "Compliance does not switch off" therefore holds from the moment the marker is committed,
   and *before* that moment the endpoint is honest about it (503, alert log line
   `"ebay notifications: deletion received without secrets"`). The marker is committed **before** the
   endpoint URL is registered in the portal (§15 order of owner actions).
2. **Runtime switch (deploy-time param).** `NIVADESK_EBAY_CONNECTOR="1"` read once at module load
   (the `NIVADESK_MALWARE_SCAN` precedent, `index.js` ~34123). Off ⇒ `beginEbayConnect` throws
   `failed-precondition "eBay is not enabled on this server yet."`, `ebayOAuthCallback` answers
   `reason=disabled` — to a **signed** caller only; an unsigned one gets 401 and learns nothing about the
   switch (§5.4) — `reconcileEbayConnections`/`reconcileEbayConnectionsNightly` log
   `"ebay reconcile sweep: connector off"` and return before reading any connection,
   `syncEbayNow`/`runEbayImport`/`previewEbayImport` throw `failed-precondition`, order-topic tasks are
   recorded `skipped connector_off` by the worker without a fetch, and `ebayNotifications` still answers
   the challenge and still **accepts and enqueues** deletion notifications but records order-topic
   notifications as `received` without enqueueing. **`buyer_deletion` tasks are processed with the
   switch off.**
3. **Firestore connector flag (runtime, no redeploy).** `commerce/flags.js` gains a third area with the
   same precedence rule (connection > provider > global), cached 60 s:
   ```
   appConfig/commerce = { shadow:{…}, queue:{…},
                          connectors: { enabled:false, providers:{ ebay:false }, connections:{ "ebay:<connectionId>":false } } }
   ```
   `readCommerceFlags` gains `connectors: { ...EMPTY.connectors, ...(data.connectors || {}) }` and
   `EMPTY` gains `connectors: { enabled:false, providers:{}, connections:{} }` — today
   `flagEnabled(flags, "connectors", …)` would fall back to `EMPTY.shadow` and the document field would
   drive nothing. `commerce-flags.test.js` pins the merge; e2e #10 asserts the **document field** drives
   the sweep. `flagEnabled(flags, "connectors", "ebay", connectionId)` is checked by the sweeps (per
   connection), `syncEbayNow`, `runEbayImport`, `previewEbayImport`, order-topic tasks and the order-topic
   branch of the gateway. `beginEbayConnect` checks the provider entry (no connection yet). `get`,
   `verify`, `disconnect`, `revealRestrictedCustomer` and **`buyer_deletion`** are **never** gated — a
   seller must always be able to see and remove a connection, and a buyer's deletion must always run. A
   connection whose flag is off is reported as spec status `suspended` (§11) and the card shows *Needs
   attention* with the sentence "eBay sync is paused on this server." This is the spec's
   `integration.ebay.enabled` (§74) and the rollback plan (§75, §84 "Feature flag/rollback test edildi").

`configured` in `getEbayConnections` = `Boolean(clientId()) && connectorOn()` — the web/native cards
show the Etsy-style "eBay is not set up on this server yet" card when false, never a dead Connect button.

### 2.1 Status mapping (spec enum ↔ stored status ↔ card) — see §10 for the single table

Stored `status` keeps the codebase's three-value convention (the sweep, purge, lifecycle and pins all
query it); the spec enum is **derived** for the public view as `specStatus` by
`commerce/ebay/status.js`, which is the only place the mapping lives (§10 is that file in prose).

| stored `status` / condition | `specStatus` (§11) | card state (§7/§8) |
|---|---|---|
| state doc issued, no connection yet | `connecting` | — |
| `connected`, `lastErrorCode` empty or in the *benign* set (§10) | `connected_read_only` (this half never reaches `connected`: no write capability is proven) | `connected` |
| `connected`, `lastErrorCode` in the *transient* set (§10) | `degraded` | `needs_attention` |
| `connected`, connector flag off for this connection | `suspended` | `needs_attention` |
| `connected`, `lastErrorCode` `environment_mismatch` | `suspended` | `needs_attention` |
| `reconnect_required` (`invalid_grant`, 401 after refresh, revoked, refresh token lapsing, `token_unreadable`) | `reauthorization_required` | `needs_attention` |
| `disconnected` | `disconnected` | not a connection (filtered on every platform) → `connect` |
| no rows / connector off | — | `coming_soon` when `configured:false`, else `connect` |

`draft` is unused.

---

## 3. Exported functions

All `region: "europe-west2"`. Wrappers inject the runtime bundle exactly as Square injects secrets
(`onCall`, `onRequest`, `onSchedule` **and** `onTaskDispatched` — the `reconcileEtsyConnections` lesson):
`onCall: (o, h) => onCall({ ...o, ...EBAY_RUNTIME }, h)`. Role gates are
`requireWorkspaceForBilling(request, true|false)`; `loadOwnedConnection` throws `not-found` /
`permission-denied` when `data.companyId !== companyId` (the isolation boundary).

| Export | Trigger | Role | Plan / gates | Timeout | Returns / effect |
|---|---|---|---|---|---|
| `beginEbayConnect` | onCall | owner | connector on + configured; refuses `failed-precondition` otherwise | 60 | `{ ok, authorizeUrl, state, nonce, scopes, environment }` — browser only ever gets a URL and a nonce (§5) |
| `claimEbayConnectState` | onCall `{state}` | the **uid that began the flow** (`stateData.uid === request.auth.uid`, else `permission-denied`) | connector on | 60 | `{ ok, authorizeUrl, nonce }` for the native start page (§5.2); single use per state (`claimedAtMs`) |
| `ebayOAuthCallback` | onRequest **POST only** (GET → 405), `maxInstances: 10` | HMAC over `req.rawBody` under `EBAY_CALLBACK_KEY` (unconfigured key → 401, never a distinguishable status); the state binds company+uid+browser nonce | connector on, **after** the signature | 120 | JSON `{ ok, outcome, reason?, rid }` to the web route, which performs the seller-facing redirect (**§5.4**) |
| `getEbayConnections` | onCall | member | never gated | 60 | `{ ok, connections:[publicView], configured, environment }` |
| `verifyEbayConnection` | onCall `{connectionId}` | member | never gated; charged to the connection's share (§7.4) | 60 | `{ ok:true, healthy, reason }` — never throws for a provider failure |
| `updateEbayConnectionSettings` | onCall `{connectionId, settings}` | owner | — | 60 | `{ ok, settings }` after `settingsOf`/`marketplacesOf` coercion (§4.11) |
| `previewEbayImport` | onCall `{connectionId, sinceDays}` | **owner** | connector on; `syncLockUntilMs` single-flight (same lock as import/Sync now); connection share (§7.4) | 300 | `{ ok, ordersFound, duplicatesPrevented, unpaid, cancelled, marketplaces[], truncated, windowsScanned }` (§69 "orders found / duplicate orders prevented") |
| `runEbayImport` | onCall `{connectionId, sinceDays, includeUnpaid?, includeCancelled?}` | owner | connector on; capacity → held; `syncLockUntilMs` | 540 | `{ ok, outcome{created,updated,noop,held,skipped,failed,stale}, complete, resumeFromMs, failures[≤25] }`; resumable (§7.2) |
| `syncEbayNow` | onCall `{connectionId}` | member | connector on; `status==="connected"`; `syncLockUntilMs` (3 min); connection share (§7.4) | 300 | same outcome shape; `force:true, lookbackMs: 24h` |
| `disconnectEbay` | onCall `{connectionId}` | owner | never gated | 60 | `{ ok:true, ordersKept:true, revoked:false }` — deletes the credentials doc, stops jobs |
| `reconcileEbayConnections` | onSchedule `every 15 minutes`, `Europe/London` | — | connector on (global + per connection); environment match | 540 | `"ebay reconcile sweep: N connection(s), M failed, K connected"` |
| `reconcileEbayConnectionsNightly` | onSchedule `every day 02:40`, `Europe/London` | — | connector on; environment match; low priority (80 % quota line) | 540 | multi-day lookback + unfulfilled-order follow-up (§7.6); writes `lastFullReconciliationAtMs` |
| `ebayNotifications` | onRequest GET/POST | — (signature) | GET challenge always; POST deletion always (503 when unverifiable); order topics only when connector on | 30 | GET → `{ challengeResponse }`; POST → 200 fast, work enqueued |
| `ebayEventWorker` | onTaskDispatched (its own queue) | — | `buyer_deletion` never gated; `order` tasks connector on | 300 | `processEbayCommerceTask(task)` → `{ status }` the worker loop understands (§7.5, §9) |
| `revealRestrictedCustomer` | onCall `{companyId, orderId}` | owner, or member with the `restrictedCustomer` grant (§3.3) | never gated; per-user rate limit | 60 | provider-agnostic reveal that writes `piiAccessLog` `restricted_resource_accessed` through `recordPiiAccess` **before** returning |
| (existing) `retryCommerceEvent` | onCall | owner | — | — | `if (record.provider === "ebay") { await enqueueEbayTask(task, 0); return { ok:true, queued:true }; }` — never processes an eBay row inline (that function does not hold the eBay secrets) |
| (existing) `commerceEventWorker` | Cloud Tasks | — | — | — | **unchanged**: `secrets: [SHOPIFY_TOKEN_KEY, WOO_TOKEN_KEY, ...SQUARE_SECRETS]`; `processCommerceTaskByProvider` throws `provider_not_on_this_worker` for `ebay` (a task that lands here by mistake is a bug, not a silent skip) |
| (existing) `getCommerceHealth`, `listCommerceEvents`, `listCommerceReviewQueue` | onCall | member | — | — | unchanged; rows carry `provider:"ebay"` |

Non-secret configuration (plain env, read through getters at call time, sandbox by default):
`NIVADESK_EBAY_ENVIRONMENT` (`sandbox`|`production`), `NIVADESK_EBAY_RUNAME`,
`NIVADESK_EBAY_DELETION_VERIFICATION_TOKEN` (32–80 chars, alnum `_ -`),
`NIVADESK_EBAY_DELETION_ENDPOINT_URL` (byte-for-byte the URL registered in the portal),
`NIVADESK_EBAY_DAILY_CAP` (calls/day the app may spend; the per-connection share is derived, §7.4),
`NIVADESK_EBAY_CONNECTOR`.

`index.js` additions: secrets/runtime block after the Square block; factory call with deps (below); one
literal `exports.<fn> = ebayExports.<fn>;` line per export; `_e2e.ebay = ebayExports._internal` under
`NIVADESK_E2E`; `purgeProviderDataForWorkspace` steps; `releaseHeldIntegrationOrders` branch;
`lifecycle/derive.js` connection group + snapshot loader; the `retryCommerceEvent` eBay branch; the
`retention` sweep's restricted-doc deletion step (§8.4).

Deps injected (Square shape): `admin, HttpsError, onCall, onRequest, onSchedule, onTaskDispatched,
clientId, clientSecret, tokenKey, hashKey, callbackKey, environment, ruName, deletionToken, deletionEndpointUrl,
connectorEnabled, encryptToken, decryptToken, requireWorkspaceOwner, requireWorkspaceMember,
appReturnUrl, functionsBaseUrl, orderDocRef, integrationOrderCapacity, holdIntegrationOrder,
sendPushNotificationToCompany, reconcileLineItems, resolveDefaultDeliveryTime, companySettingsDocRef,
enqueue, recordPiiAccess`, and under `NIVADESK_E2E=1`: `createClient`, `oauth` (Proxy),
`notificationVerifier`, `enqueue` reading `global.__nivadeskEbayFakeClient / FakeOAuth / FakeVerifier /
FakeEnqueue`.

### 3.1 Files

```
functions/ebayConnector.js                    factory (OAuth, credentials, refresh, sync, import, health, disconnect, gateway, task)
functions/commerce/ebay/oauth.js              pure: HOSTS by environment, authorizeUrl(), exchangeCode(), refreshToken(), appToken(), fetchIdentity(), classifyTokenError()
functions/commerce/ebay/client.js             pure: createEbayClient({environment, accessToken, fetchImpl, onUnauthorized, quota}) — getOrders/getOrder/getOrdersByIds/getShippingFulfillments/publicKey
functions/commerce/ebay/sanitize.js           pure: ORDER_PII_PATHS, LINE_ITEM_PII_PATHS, FULFILLMENT_PII_PATHS, PII_KEY_NAMES, splitEbayOrder(), scanForPii()
functions/commerce/ebay/notification.js       pure: challengeResponse(), parseSignatureHeader(), pemOf(key), verifyNotification(), isValidKid(), TOPICS
functions/commerce/ebay/quota.js              pure verdict (Etsy shape) + per-day counter doc + per-connection stand-down
functions/commerce/ebay/cursorPlan.js         pure: bisect(window, truncatedAt), nightlyWindow(now, lastFull), catchUpWindow(cursor, now)
functions/commerce/ebay/status.js             pure: TRANSIENT_ERROR_CODES, BENIGN_ERROR_CODES, STALE_AFTER_MS, specStatusOf(doc, flags, now), cardStateOf(rows)
functions/commerce/ebay/hashing.js            pure: buyerHash(key, value) = HMAC-SHA256, hex; keys are validated by keys.js keyListOf(secret)
functions/privacy/reveal.js                   pure decision: revealAllowed({ role, memberAccess, orderAssignment }), revealPayloadOf(restrictedDoc)
functions/test/fixtures/ebay-sandbox-order.json, ebay-sandbox-fulfillments.json   captured sandbox responses (§8.1)
studioflow-web/lib/studioflow/ebay.ts, app/settings/EbayIntegrationSection.tsx, app/ebay/callback/route.ts, app/ebay/start/page.tsx
EGGcraft/EbayIntegrationView.swift; Android SettingsScreen.kt EbayDetail; registries + dictionaries (see §12–13)
```

No eBay URL or path appears outside `commerce/ebay/*` (§9 "provider API path'lerini core katmana sızdırmamalı").

### 3.2 Service account and the eBay worker — the secrets decision

**Decision: yes, eBay gets the Amazon treatment before any production seller is served, and the
suite enforces it from the first commit.**

- Why the same answer: eBay buyer details land in `restrictedCustomer` under the same access-control
  policy (§5) as Amazon's; eBay's API License Agreement and the account-deletion programme impose
  data-handling obligations on the *application*; and the refresh token in `credentials/current` is
  18 months of read access to a seller's orders and buyer addresses. A key that opens that must not be
  readable by the 39-secret default compute identity.
- What runs as `ebay-connector@eggcraft-studio.iam.gserviceaccount.com`: every function in the table
  above that spreads `EBAY_RUNTIME` — the callables, the callback, the two sweeps, the gateway and
  `ebayEventWorker`. The account holds `roles/secretmanager.secretAccessor` on the **five** `EBAY_*` secrets
  (`EBAY_CALLBACK_KEY` included since §5.4) only, `roles/datastore.user`, `roles/cloudtasks.enqueuer` on the `ebayEventWorker` queue, and
  `roles/iam.serviceAccountUser` for the Cloud Tasks OIDC call. The default compute account is
  **not** granted the `EBAY_*` secrets.
- Why a separate worker: `commerceEventWorker` mounts `SHOPIFY_TOKEN_KEY`, `WOO_TOKEN_KEY` and
  `SQUARE_SECRETS` and runs as the default identity; giving it `EBAY_SECRETS` would either hand the
  eBay key to the default identity or hand every other connector's key to the eBay identity. So eBay
  tasks are enqueued to a second queue (the one Cloud Tasks creates for `ebayEventWorker` itself, same `retryConfig: { maxAttempts: 1 }` and
  `rateLimits: { maxConcurrentDispatches: 5 }`) whose handler `ebayEventWorker` is the only place
  `processEbayCommerceTask` runs. `enqueueEbayTask(task, delaySeconds)` mirrors `enqueueCommerceEvent`
  with the queue name changed; the worker loop (health touch, `retrying` re-enqueue) is copied
  verbatim and pinned by `commerce-ebay-wiring.test.js`.
- The trip-wire: `test/qa/access-control-policy.test.js` "if Amazon has shipped, its secrets are not
  readable by every function" becomes provider-generic — the regex
  `defineSecret\("(AMAZON_[A-Z_0-9]*|NIVADESK_AMAZON_[A-Z_0-9]*)"\)` becomes
  `defineSecret\("((?:AMAZON|EBAY)_[A-Z_0-9]*|NIVADESK_(?:AMAZON|EBAY)_[A-Z_0-9]*)"\)`, and the mount
  scan accepts a `...EBAY_RUNTIME` spread within 400 chars as the `serviceAccount:` evidence (the pin
  also asserts `EBAY_RUNTIME` contains `serviceAccount: EBAY_SERVICE_ACCOUNT`). The policy document's
  "Before the Amazon connector serves a production seller" paragraph gains "and the eBay connector"
  in the same commit, and the policy test's wording check is updated with it.
- Until the service account exists the marker is absent, `EBAY_RUNTIME = {}`, no secret is mounted
  anywhere, and the trip-wire has nothing to fail on — deploy stays green (§2 layer 1).

### 3.3 `revealRestrictedCustomer` — the authorization model (owned by this half)

Implemented once, provider-agnostic, in this half; the Amazon side calls the same export.

- **Grant:** `companies/{cid}.memberAccess[uid].restrictedCustomer === true`. It is set only by the
  owner through the existing member-access editor (the `bankFeed` pattern: a new key in
  `WORKSPACE_MEMBER_ACCESS_DEFAULTS` defaulting `false`, mirrored into `memberAccess[uid]` by the
  same code path that mirrors every other key; the owner's own entry is implicitly `true`). Rules
  need no change — the collection stays `allow read, write: if false` and the grant is consulted
  server-side only.
- **Tier checks (policy §5.3), in `privacy/reveal.js` `revealAllowed({ isOwner, access, order, uid })`:**
  owner → allowed; `access.restrictedCustomer !== true` → denied `no_grant`; role `workflowOnly`
  (`isWorkflowOnlyMember` semantics: `access.workflowOnly === true`) → denied `workflow_only` even
  with the grant; `access.assignedProjectsOnly === true && !access.manageProjectAssignments` and the
  order's `assignedTo`/`assignedUids` does not contain `uid` → denied `not_assigned`; suspended member
  (`suspendedMembers[uid]`) → denied `suspended`. Pure, table-tested.
- **Rate limit:** `companies/{cid}/privacyState/revealCounters/{uid}` (server-only, already denied by
  the `privacyState` block) — 60 reveals per rolling hour per user, 300 per day; over → `resource-exhausted`
  with the sentence "Too many address reveals. Try again later." An owner is limited too.
- **Response:** exactly `{ ok, provider, orderId, buyerUsername, fields: { fullName, companyName?,
  email?, phone?, address: { line1, line2?, city, stateOrProvince?, postalCode, countryCode } },
  updatedAtMs, ageDays }` — never `paths`, never `taxIdentifier` (VAT ids are not needed to ship;
  they stay in the doc for the accounting phase behind their own decision), never gift messages or
  checkout notes (those are revealed separately by a later `revealBuyerNotes` if a product decision
  wants them; this half returns shipping identity only). Empty restricted doc → `not-found`
  "No protected buyer details for this order."
- **Log first, then return:** `recordPiiAccess({ action:"restricted_resource_accessed", source: <client>,
  subject:{ kind:"order", id: orderId, provider, externalId }, categories: derived from the fields
  present, note:"reveal" })` is awaited before the payload is returned; a failed log write → the reveal
  fails (`unavailable`). Never a value in the log (policy §5.4).
- **Clients:** the order detail's "Channel details" shows username + country and a *Show address*
  button (§8.2); the button is hidden for members without the grant (the callable is the enforcement,
  the hiding is courtesy).
- Tests: `privacy-reveal.test.js` (tier table, response shape has no `taxIdentifier`, log-before-return
  order via a failing fake log), e2e in `commerce-ebay-connector-emulator.test.js` #14.

---

## 4. Firestore documents

Field names follow the codebase (camelCase); the spec's snake_case names are quoted in comments and
tests. Every number is a number and every string a string — never `undefined` (Firestore rejects the
whole `set`).

### 4.1 `ebayConnections/{connectionId}` — the seller account (§11, §20, §64 `commerce_connections`)

`connectionId = ${safeIdPart(companyId)}__${safeIdPart(sellerUserId)}` (deterministic: a reconnect
updates the same row; the same seller in two workspaces is two rows; `companyId` is inside the id so
nothing crosses workspaces).

```jsonc
{
  "companyId": "acme",
  "provider": "ebay",
  "environment": "sandbox",                       // sandbox | production — never mixed; the sweep filters on it (§7.1)
  "sellerUserId": "ebayuser_xxx",                 // spec seller_external_id (identity API userId)
  "sellerUserIdHash": "<hmac hex>",               // buyerHash(EBAY_HASH_KEY, userId) — what the deletion task matches on (§9)
  "sellerUsername": "eggcraft_uk",                // display; can change on eBay
  "displayName": "eggcraft_uk",                   // spec display_name
  "registrationMarketplaceId": "EBAY_GB",
  "marketplaces": [ { "marketplace": "EBAY_GB", "enabled": true, "currency": "GBP" } ],  // spec §20; grown from listingMarketplaceId seen on orders
  "status": "connected",                          // connected | reconnect_required | disconnected  (spec enum derived, §2.1)
  "readOnly": true,
  "scopes": ["https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly", "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly"],
  // The three-state registry (§62), TRUTHFUL for this half: only what this half has proved is `true`.
  // The EBAY_DEFAULTS strings are kept; every EBAY_DEFAULTS `true` that this half does not prove is
  // replaced by the reason string "not_in_this_release" so capabilityAllowed() answers no. Recomputed
  // (connectionCapabilities.proveEbay(row, proofs)) when a later half proves an entry.
  "capabilities": { "orders.read": true, "inventory.read": "not_in_this_release", "listing.create": "business_policy_and_management_mode", "listing.migrate": "eligible_only", "price.write": "managed_listing_only", "quantity.write": "managed_listing_only", "shipment.write": "not_in_this_release", "refund.write": "permission_dependent", "dispute.read": "permission_dependent", "finance.read": "not_in_this_release", "notifications": "subscription_dependent" },
  "settings": { "autoSync": true, "includeUnpaid": false, "includeCancelled": true },   // always through settingsOf() (§4.11)
  "hasCredentials": true,                         // the only thing the connection doc says about tokens
  "accessTokenExpiresAtMs": 0,                    // mirror for the public view only; the boxes live in credentials/current
  "refreshTokenExpiresAtMs": 0,
  "importState": "none",                          // none | running | done
  "importCursor": { "sinceMs": 0, "untilMs": 0, "sliceFromMs": 0, "sliceToMs": 0, "offset": 0, "includeUnpaid": false, "includeCancelled": true, "failedIds": [] },   // resumable backfill (§7.2)
  "importStartedAtMs": 0, "importFinishedAtMs": 0, "importCounters": { "created": 0, "updated": 0, "held": 0, "skipped": 0, "failed": 0 },
  "connectedAtMs": 0, "connectedByUid": "uid",    // spec created_by
  "lastVerifiedAtMs": 0,                          // spec last_verified_at (verify + every successful pass)
  "lastSyncAtMs": 0, "lastSuccessAtMs": 0,        // spec last_successful_sync_at
  "lastFullReconciliationAtMs": 0,                // nightly pass (§7.6)
  "catchUpDueFromMs": 0,                          // set on reconnect / flag-on; consumed by the next pass (§7.6)
  "lastErrorCode": "", "lastErrorAtMs": 0,
  "lastReconcile": { "orders": { "scanned": 0, "created": 0, "updated": 0, "noop": 0, "skipped": 0, "held": 0, "failed": 0, "stale": 0 }, "truncated": false, "subWindows": 1, "atMs": 0 },
  "syncLockUntilMs": 0,                           // Sync now / preview / import single-flight (3 min; import 10 min)
  "rateLimitedUntilMs": 0,                        // 429 stand-down
  "notificationSubscriptionId": "",               // "" until the ORDER_CONFIRMATION subscription exists (capability stays subscription_dependent)
  "disconnectedAtMs": 0, "disconnectedByUid": "", "disconnectReason": "",
  "updatedAt": "<serverTimestamp>"
}
```

`connectionCapabilities.js` gains `proveEbay(base, proofs)` (pure): starts from `EBAY_DEFAULTS`, sets
every entry not in `proofs` that is `true` in the defaults to `"not_in_this_release"`, and copies
`proofs` (this half passes `{ "orders.read": true }`). `commerce-ebay-capabilities.test.js` pins that a
row from this half answers `capabilityAllowed(caps, "shipment.write") === false` and
`capabilityReason(...) === "not_in_this_release"`, and that the spec's default map is reproduced when
every proof is supplied.

### 4.2 `ebayConnections/{connectionId}/credentials/current` — the only place a token exists

```jsonc
{
  "accessTokenEncrypted":  { "v": 1, "iv": "…", "tag": "…", "data": "…", "k": "8hex" },   // encryptToken(plain, EBAY_TOKEN_KEY)
  "refreshTokenEncrypted": { "v": 1, "iv": "…", "tag": "…", "data": "…", "k": "8hex" },
  "accessTokenExpiresAtMs": 0,        // now + expires_in*1000 (~2 h)
  "refreshTokenExpiresAtMs": 0,       // now + refresh_token_expires_in*1000 (~18 months)
  "refreshLockUntilMs": 0,            // single-flight refresh claim
  "refreshedAtMs": 0, "grantedAtMs": 0,
  "updatedAt": "<serverTimestamp>"
}
```
Boxed under `EBAY_TOKEN_KEY` only (never a shared key), `tokenNeedsRebox` honoured on read (secret
rotation, §6). `disconnectEbay` **deletes the document**. `credentials-at-rest.test.js` gets
`ebayConnector.js` and `commerce/ebay/*.js` in its evidence list; request bodies are built with
`URLSearchParams` (token endpoint only — never for the authorize URL, §1 scope encoding) so no
`refreshToken: raw` style line exists.

### 4.3 `ebayConnections/{connectionId}/deliveries/{notificationId}` — notification dedupe

`{ topic, receivedAtMs, via: "gateway", expireAt: Timestamp(+7d) }`, created with `.create()`
(duplicate → skip, answer 200). TTL policy on `expireAt` is created out of band by the owner.

### 4.4 `ebayConnections/{connectionId}/syncLog/{auto}` — the human-readable trail (Etsy shape)

`{ ts: serverTimestamp, atMs, type, error?, orderId?, externalId?, reason?, correlationId?, actor? }` with
`type ∈ connected | reconnected | verify_failed | token_refresh_failed | reauthorization_required |
refresh_token_expiring | app_credentials_invalid | import_started | import_resumed | import_finished |
sync_completed | sync_partial | sync_bisected | nightly_completed | catch_up_completed | order_imported |
order_updated | order_held | order_needs_review | order_import_failed | rate_limited | environment_mismatch |
notification | buyer_deleted | paused | disconnected`.
The nine newest rows feed `recentEvents[]`. The machine-readable trail with old/new hash, attempts and
sanitized error (§68) is the common `commerceEvents/{eventDocId}` row the worker writes — no second copy.

### 4.5 `ebayConnectStates/{state}` — single-use OAuth CSRF defence, bound to a browser

`state = base64url(randomBytes(32))` is the document id.
`{ companyId, uid, environment, redirectRuName, scopes[], nonceHash: sha256hex(nonce), origin: "web" | "native",
claimedAtMs: 0, createdAt: serverTimestamp, expiresAt: <ms number>, expireAt: Timestamp(+10 min), used: false, usedAt?, connectionId? }`.
The nonce itself is never stored — its hash is enough to check, and the nonce is what the browser
holds (§5). Consumed inside `runTransaction`: `!exists || used === true || expiresAt < now()` → null →
`reason=state`; `stateData.environment !== environment()` → `reason=environment`;
`sha256hex(body.nonce) !== stateData.nonceHash` → `reason=browser` (the state is **also** burned,
so a second attempt with the right nonce cannot follow a wrong one). This holds for an **empty** nonce
exactly as for a wrong one: **§5.4** forwards an absent cookie as `nonce: ""` precisely so that the burn
still happens, and the burn is the whole of §5's defence. `state` must match
`/^[A-Za-z0-9_-]{20,120}$/` **before** it is passed to `states().doc(state)` — Firestore's own argument
error embeds the rejected path in its message, so an unvalidated path-shaped state plus any logged error
message writes the state into Cloud Logging (§5.4, *Logging*).

### 4.6 `ebayBuyers/{companyId__usernameHash}` — the account-deletion index

Written at every apply (`set(merge)` with `arrayUnion`): `{ companyId, provider:"ebay", usernameHash:
buyerHash(EBAY_HASH_KEY, lower(buyer.username)), orderIds: [...], updatedAtMs }` where
`buyerHash = HMAC-SHA256(key, value)` hex (`commerce/ebay/hashing.js`; the key is the dedicated secret
`EBAY_HASH_KEY`, 32 bytes hex/base64, validated by `tokenKeyBytes`, **never** derived from
`EBAY_TOKEN_KEY` so that rotating one does not orphan the other). Exists so a
`MARKETPLACE_ACCOUNT_DELETION` for `username` finds every order in every workspace with one equality
query and no collection-group index. Deleted when the buyer is anonymised and when the workspace is
purged. Key rotation: `EBAY_HASH_KEY` may carry two keys (§6 encoding); the index is written under the
first, the deletion match is run under **every** key offered, and a `rehashEbayBuyers` one-off script
(owner-run, documented in §15) moves rows to the new key before the old one is retired.

### 4.7 `ebayDeletionRequests/{notificationId}` — compliance ledger

`{ receivedAtMs, eventDate, usernameHash, userIdHash, status: queued | done | failed, attempts,
ordersScrubbed, restrictedDocsDeleted, connectionsDisconnected, finishedAtMs, sanitizedError,
expireAt: Timestamp(+400d) }`. Hashes are **keyed** (§4.6), so the 400-day ledger holds nothing a
dictionary can reverse without the server-held key; no username, userId or eiasToken in clear, ever
(`eiasToken` is not stored in any form).

### 4.8 Common-engine documents (unchanged modules, eBay rows)

- `commerceCursors/{ebay__<connectionId>__order}` — `cursors.readCursor/cursorWindow/recordPass`;
  `watermarkMs` moves to `toMs` **only** when `complete = !truncated && failed === 0` (spec §56
  "partial failure varsa cursor ilerlemez", §85 #22). Because eBay's page order is unspecified, a
  truncated window is **bisected** (§7.1) and `recordPass` is called per completed sub-window, so the
  watermark advances through the part that was fully read. Overlap: the engine default 10 min (a
  superset of the spec's `overlap_seconds: 300`). Separate cursor per entity type; this half uses
  `order` only.
- `commerceHealth/{ebay__<connectionId>}` — `health.touchHealth` with `companyId` (the callable queries
  by it), `entity:"orders"`, kinds `success | attempt | retry_scheduled | retry_cleared | dead | webhook`.
  `supportedEntities("ebay")` lists products/inventory/finance too, so those read `never` until their
  streams exist — that is the truthful Sync Health (§67, review Q19). `buyer_deletion` tasks touch
  **no** health document (§9).
- `commerceEvents/{eventDocId(key)}` — `worker.recordReceived` / `processCommerceEvent` rows (§68 fields).
- `externalEntities/{ebay__<connectionId>__order__<orderId>}` — identity (spec `external_entities`;
  unique key = provider + connection_id + entity_type + external_id, review Q4: yes, the connection
  id is inside the key).
- `siparisler/{ebay_<company>_<orderId>}` — the order with the `commerce{}` stamp (spec `channel_orders`:
  `order_source:"ebay"`, `source_connection_id`, `external_order_id`, `channel_status`,
  `payment_state`, `fulfilment_source:"merchant"` map onto `commerce.provider/connectionId/externalId/
  platformStatus/paymentStatus/fulfillmentStatus`).
- `commerceReviewQueue/{orderId}` — review rows (`tax_responsibility_unknown`, `missing_total`, …).

### 4.9 Per-company documents

- `companies/{cid}/restrictedCustomer/{orderId}` (existing, Amazon's) —
  `{ provider:"ebay", connectionId, buyerUsername, fields:{ fullName, companyName?, email?, phone?, address:{…}, taxAddress?, taxIdentifier?, buyerCheckoutNotes?, giftDetails?[] }, paths:[…], deliveredAtMs?, updatedAtMs }`.
  Written after every apply whose outcome is `created | updated | noop` (self-healing) **when the
  restricted half is non-empty**, never on `held`, never an empty document (§7.3). Deleted by the
  retention sweep 90 days after delivery (§8.4) and by the deletion task (§9). The `ebayBuyers` index
  row is **not** tied to it: that is written whenever the order carries `buyer.username`, empty
  restricted half or not (§9 — an order with no address still names the buyer, and the deletion task
  reaches orders through the index alone).
- `companies/{cid}/heldIntegrationOrders/{ebay_<orderId>}` (existing) — payload is the **safe** half only.
- `companies/{cid}/privacyState/revealCounters/{uid}` — reveal rate-limit counters (§3.3), inside the
  already-denied `privacyState` subtree.

### 4.10 `firestore.rules` — the deny list (rules are OR'd; the catch-all is not enough for the pins)

Root, beside the Square blocks (~1177–1182), **six** blocks — one per server-only root this half
introduces, including the two operational ones:
```
// eBay connector: seller OAuth credentials, connect states, the buyer index, the deletion ledger,
// the daily quota counter and the notification signing-key cache are server-only.
match /ebayConnections/{document=**} { allow read, write: if false; }
match /ebayConnectStates/{document=**} { allow read, write: if false; }
match /ebayBuyers/{document=**} { allow read, write: if false; }
match /ebayDeletionRequests/{document=**} { allow read, write: if false; }
match /ebayQuota/{document=**} { allow read, write: if false; }
match /ebayNotificationKeys/{document=**} { allow read, write: if false; }
```
The root catch-all (`match /{document=**} { allow read, write: if false; }`, ~1268) denies them today;
the explicit block is the rule this design sets for every server-only root, so a later rule cannot
widen one by accident. The wiring pin regex covers **all six**. Per-company: this half adds **no** new
`companies/{cid}/…` subcollection beyond the already-denied `privacyState` subtree. `restrictedCustomer`
is already in the explicit block (rules 714) and in **both** wildcard deny lists (921 and 980);
`heldIntegrationOrders` likewise (918/977). Should a later commit add a per-company eBay
subcollection, it goes in all three places (explicit match + read list + write list) in the same
commit, with a case in `ebay-rules.test.mjs`. `ebay-rules.test.mjs` (Etsy shape): owner, member,
outsider and signed-out each fail get/set/update/delete/create on every ebay* root collection (all
six) and on `restrictedCustomer`.

### 4.11 Server-side whitelists — nothing reaches `set(merge)` unshaped

- `settingsOf(data)` (Square `squareConnector.js` 136 shape): `{ autoSync: s.autoSync !== false,
  includeUnpaid: s.includeUnpaid === true, includeCancelled: s.includeCancelled !== false }` — three
  booleans, nothing else survives. `updateEbayConnectionSettings` writes
  `settings: settingsOf({ settings: request.data.settings })`, never the caller's object.
- `marketplacesOf(existing, patch)`: the caller may only flip `enabled` on ids already present in the
  row's `marketplaces[]` (seen on orders or the registration marketplace); ids not seen, non-boolean
  `enabled`, or a `currency` change → `invalid-argument "Unknown eBay marketplace for this account."`.
  `commerce/marketplaces.js` `ebayMarketplace(id)` must also know the id.
- `sinceDays`: `Math.min(Math.max(Number(request.data?.sinceDays) || 90, 1), 90)` — clamped, never
  trusted (Square clamps 1..365; eBay's backfill is capped at 90 by product decision, well inside the
  documented two-year retrieval window).
- `includeUnpaid` / `includeCancelled` on `runEbayImport`: `=== true` / `!== false`, stored on
  `importCursor` for the resumed runs.
- `connectionId`: `String(...).trim()`, must match `/^[A-Za-z0-9_-]{1,200}$/` before the doc read.
- Tests: `ebay-connect.test.js` "settings whitelist drops unknown keys and non-booleans", "marketplace
  toggle refuses an unseen id", "sinceDays 400 → 90, 0 → 90, -3 → 1".

---

## 5. OAuth with RuName, bound to the owner's browser (§19, §69 B steps 1–4)

```
Connect eBay ──▶ beginEbayConnect (owner) ──▶ ebayConnectStates/{state} { nonceHash } ──▶ { authorizeUrl, nonce }
   ──▶ [web] section sets cookie nv_ebay_nonce=<nonce> (Secure; SameSite=Lax; Path=/ebay/callback; Max-Age=600) ──▶ location = authorizeUrl
   ──▶ seller consents on auth[.sandbox].ebay.com ──▶ RuName "accepted URL" https://nivadesk.app/ebay/callback?code&state&expires_in
   ──▶ app/ebay/callback/route.ts READS the cookie (absent → nonce:""), then SIGNED POST { v, rid, code, state, nonce } ──▶ ebayOAuthCallback   (§5.4 — never a query string)
   ──▶ consume state (tx: used/expiry/environment/nonceHash) ──▶ exchange code (server, Basic auth) ──▶ identity API ──▶ box tokens ──▶ upsert connection
   ──▶ touchHealth success ──▶ syncLog connected ──▶ catchUpDueFromMs (reconnect) ──▶ 200 { ok, outcome } ──▶ the WEB route redirects: /settings?section=ebay&ebay=connected
```

- **The gap this closes (inherited from Square/Etsy, not accepted here):** without the nonce, an owner
  of workspace B could mint an `authorizeUrl` and phish a foreign seller into consenting; the seller's
  account, orders and buyer addresses would land in B. Server-side binding to `companyId+uid` does not
  stop that because the *attacker* is that uid. The nonce lives only in the browser that called
  `beginEbayConnect`; a phished browser has no cookie, the callback carries an empty nonce, the state is
  burned with `reason=browser` — and it is burned **at the moment of consent**, which is why the web
  route forwards an absent cookie instead of refusing it (§5.4, *The burn*). PKCE would not help (verifier server-held) and eBay offers none.
- `beginEbayConnect`: refuse `failed-precondition "eBay is not configured on this server yet."` when
  the client id is blank; refuse when the connector flag is off. Mint `nonce = base64url(randomBytes(24))`,
  write the state doc (§4.5) with `nonceHash` and `origin` (`"web"` by default, `"native"` when
  `request.data.origin === "native"`). Return `{ ok, authorizeUrl, state, nonce, scopes, environment }`.
  `scope` in the URL is the `%20`-joined list (§1); `state` is opaque to eBay and echoed back.
- `ebayOAuthCallback` (**POST since §5.4**; the reason words below are unchanged, they now travel in JSON;
  the decline is **not** among them — `ebay=cancelled` is produced by the web route alone, because the POST
  body has no `error` field, and the function's own decline branch is deleted): missing `state`/`code` → `reason=missing_code`;
  empty `nonce` (no cookie) or hash mismatch → `reason=browser` (**state burned in both cases**); connector off → `reason=disabled`;
  state replay/expiry → `reason=state`; environment mismatch → `reason=environment`. Exchange the code
  server-side with `redirect_uri=<RuName>`; then **ask eBay who it is** (`fetchIdentity`, which returns
  only `{ userId, username, accountType, registrationMarketplaceId }` — the seller's own name, email
  and address in `individualAccount`/`businessAccount` are dropped inside `oauth.js` and never reach
  the connector) — never trust anything in the URL. Identity 403 (scope not granted) → `reason=no_seller`.
  `connectionId` from `userId`; `set(..., { merge:true })` preserving `connectedAtMs`, `importState`,
  `importCursor`, `settings`, `marketplaces` on reconnect; credentials doc replaced whole; `status:
  "connected"`, `lastErrorCode: ""`, `sellerUserIdHash`, `environment: environment()`,
  `capabilities: proveEbay(defaults, { "orders.read": true })`; on **reconnect** also
  `catchUpDueFromMs = min(existing catchUpDueFromMs || ∞, cursor.watermarkMs || connectedAtMs)` so the
  next pass covers the gap (§7.6); `syncLog { type: existing ? "reconnected" : "connected" }`;
  `health.touchHealth(success)`; write `connectionId` back onto the state doc. Any throw →
  `console.error` (sanitized) + `reason = classifyTokenError(e) === "auth" ? "token" : "exchange"`.
- "Verify seller scopes/capabilities" (§19 step): the token response's `scope` (when present) and the
  identity call are the proof; `scopes[]` stored as granted, and `verifyEbayConnection` re-proves
  `orders.read` with a 1-order `getOrders` call (`limit=1`), never a write.
- Wizard steps 4–5 (§69 B "Select marketplaces", "Select import range") are the connected screen's
  settings + `previewEbayImport` / `runEbayImport`; there is no separate wizard screen.
- Multiple connections: a second seller account in the same workspace is a second row (different
  `sellerUserId`); the same seller cannot exist twice (deterministic id) — reconnect updates.
- Redirect helper: **deleted with the GET path** (§5.4). The callback was `connectRedirect`'s only
  caller; the seller-facing redirect is now built by the web route from a module constant.

### 5.1 Web
`EbayIntegrationSection` calls `beginEbayConnect`, writes `document.cookie =
"nv_ebay_nonce=<nonce>; Secure; SameSite=Lax; Path=/ebay/callback; Max-Age=600"` and then sets
`window.location.href = authorizeUrl`. `app/ebay/callback/route.ts` reads `nv_ebay_nonce` from `request.cookies` and sends `code`, `state` and
that nonce — the empty string when there is no cookie — to the function in a **signed POST body**, never
a URL (**§5.4**, which supersedes the forwarding this paragraph used to describe). An absent cookie is
**not** refused on the web side: the request must reach the function so the state is burned at the moment
of consent (§5.4, *The burn*). It expires the cookie on every response. The cookie is first-party to
`nivadesk.app` and `SameSite=Lax` survives the top-level GET redirect from eBay. It is scoped to the
callback path, which is a request-matching rule and **not** a security boundary: it is written from
client JavaScript, so it cannot be `HttpOnly`, and any script running on `nivadesk.app` can read it
(§5.4, residual 2).

### 5.2 Native (Mac / iPhone / Android)
A native app cannot set a cookie in the system browser, so it does not receive the nonce. It calls
`beginEbayConnect({ origin:"native" })` (the reply carries **no** `nonce` for a native origin; the
authorizeUrl is not opened directly) and opens
`https://nivadesk.app/ebay/start?state=<state>` in the system browser. `app/ebay/start/page.tsx`:
requires a signed-in web session (the existing Firebase web sign-in; a signed-out visitor is sent to
sign in and back), calls `claimEbayConnectState({ state })` — which answers only when
`request.auth.uid === stateData.uid` and `claimedAtMs === 0` — receives `{ authorizeUrl, nonce }`,
sets the cookie exactly as §5.1 and redirects to eBay. A phished start link therefore fails twice: the
victim is not signed in as the owner who began the flow (`permission-denied`), and even a signed-in
member of B who is not that uid is refused. The app polls `getEbayConnections` on return (`awaitingReturn`)
as today. This replaces the "no deep link" note: the callback still ends on nivadesk.app.

### 5.3 What is still not covered, said plainly
A workspace owner who is *also* the seller can of course connect their own account — that is the
feature. A member who has stolen the owner's signed-in browser session can start a flow as the owner;
session theft is outside this design (it is covered by the account security policy). The e2e
adversarial list (§14.3) claims exactly: cross-workspace state, state replay, expiry, environment,
**and browser binding** — not more.

### 5.4 The callback transport — the code and the nonce never travel in a backend URL

**Supersedes** the last two lines of the §5 diagram, the forwarding paragraph in §5.1, the
`ebayOAuthCallback` row in §3 (GET → POST) and the `connectRedirect` bullet at the end of §5.
§4.5 is **not** superseded: its single-use transaction, including "the state is **also** burned" on an
absent or wrong nonce, stands word for word and is load-bearing here (see *The burn* below).
Everything else in §5, §5.1, §5.2 and §5.3 stands.

#### Why this section exists

Round 166 put `https://nivadesk.app/ebay/callback` on the live site. As shipped, it answers eBay by
redirecting the seller's browser to
`https://europe-west2-eggcraft-studio.cloudfunctions.net/ebayOAuthCallback?code=…&state=…&nonce=…`.
Cloud Run writes `httpRequest.requestUrl` — query string included — into Cloud Logging on every
request. Our own code logs neither value; the platform does it for us. The result is that the
**authorization code** and the **browser-binding nonce** are readable by anyone with log access on
`eggcraft-studio`. The nonce is not a nuisance value: it is the single thing that stops a phished
seller's consent landing in a stranger's workspace (§5). A log reader who has it, plus the ability to
mint a state, has the whole of the defence §5 is built on.

Nothing here is theoretical and nothing here is fixed by redacting our own logging, so the transport
changes instead: **eBay still lands on nivadesk.app in a browser, and everything after that is a
signed server-to-server POST.** This must be in place before the first real sandbox OAuth connection,
because that is the first moment a genuine code and a genuine nonce exist.

**What this section deliberately does not do is weaken any check.** The transport moves; the decisions
do not. Every refusal the GET flow made, the POST flow still makes, in the same place, with the same
side effect on the state document. Where an earlier draft of this section proposed refusing an absent
nonce cookie on the web side "to save an invocation", that draft was wrong and is corrected below.

#### The hop, after this change

```
… seller consents on auth[.sandbox].ebay.com
   ──▶ RuName accepted URL  GET https://nivadesk.app/ebay/callback?code&state&expires_in   (browser, unchanged)
   ──▶ app/ebay/callback/route.ts:  decline? code+state shaped? key present?   ← decided here, on our own domain
         (the nonce cookie is READ, never gated on: absent means nonce:"" in the body)
   ──▶ POST https://europe-west2-eggcraft-studio.cloudfunctions.net/ebayOAuthCallback
         x-nivadesk-timestamp / x-nivadesk-signature, JSON body { v, rid, code, state, nonce }   ← no query string, ever
   ──▶ ebayOAuthCallback: method ▸ query ▸ rawBody ▸ key ▸ signature ▸ parse ▸ rid ▸ gate ▸ presence ▸ shapes ▸ state tx (burn) ▸ exchange ▸ identity ▸ upsert
   ──▶ 200 { ok, outcome, reason?, rid }                                                  ← JSON, not a 302
   ──▶ the WEB route redirects the seller: 302 /settings?section=ebay&ebay=…&reason=…
```

The function no longer redirects anything and no longer reads `req.query`. The browser never meets the
function host at all: it meets `nivadesk.app` twice and eBay once.

#### The two names

| Where | Name | What it is |
|---|---|---|
| Secret Manager, mounted on the eBay functions | **`EBAY_CALLBACK_KEY`** | The **fifth** eBay secret, added to `EBAY_SECRET_PARAMS` beside `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_TOKEN_KEY`, `EBAY_HASH_KEY`, and therefore mounted only through `EBAY_RUNTIME` on the `ebay-connector` service account (§3.2). Read at call time as `callbackKey: () => ebaySecretValue("EBAY_CALLBACK_KEY")`. **`EBAY_SECRET_PARAMS` is built only when `EBAY_SECRETS_READY` is true** (`functions/index.js`: `NIVADESK_EBAY_SECRETS_READY=1` or the committed marker `functions/.ebay-secrets-ready`), so the fifth name must be added to that array *and* the marker committed, or nothing is mounted at all — see *Rollout*. |
| Hostinger environment, read by the web server | **`NIVADESK_EBAY_CALLBACK_KEY`** | Read inside the route handler as `process.env.NIVADESK_EBAY_CALLBACK_KEY`, never at module scope. **Never prefixed `NEXT_PUBLIC_`** — that prefix compiles a value into the browser bundle, which for this value would publish the credential to every visitor. This is the **first server-only environment value the web tree has ever read**: a grep of `studioflow-web/{app,lib,components}` for `process.env.` minus `NEXT_PUBLIC_` and `NODE_ENV` returns zero matches today, so Hostinger's ability to deliver it *at runtime* is unproven and is verified explicitly in *Rollout* step 2a before anything depends on it. |

Both hold the same value: 32 random bytes as hex. The operator mints it (`openssl rand -hex 32`) and
enters it in the two places above; it appears in no file, no commit and no log. It is rotated by
writing a new Secret Manager version, setting the same value in Hostinger and **restarting the web
process — a rebuild is *not* required, because the route reads `process.env` per request rather than
at module scope**; if Hostinger turns out to inject only at build time (step 2a decides this), a
rotation is a rebuild and this sentence is corrected in the same commit that records the answer. The
window in between costs failed connect attempts, not data, because an unmatched key is refused
(below). Neither the design, the code nor any test contains the value.

The key is **not** sent on the wire. The web route signs; the function verifies. A bearer-style header
carrying the secret itself would be simpler and would be adequately protected by TLS and by Cloud Run
not logging request headers — but a signature costs one function call more and gives two things a
bearer cannot: the secret survives any future header dump, error reporter or proxy that learns to
record headers, and the authentication is bound to *this body*, so a captured request cannot be
re-pointed at a different code.

#### The request

```
POST https://europe-west2-eggcraft-studio.cloudfunctions.net/ebayOAuthCallback
content-type: application/json
accept: application/json
x-nivadesk-timestamp: 1757160000123          (unix milliseconds, decimal, no padding)
x-nivadesk-signature: v1=<64 lowercase hex>
```
```json
{ "v": 1, "rid": "9f2c4ad1b0e37c56", "code": "<eBay's code, verbatim>", "state": "<the state>", "nonce": "<the cookie value, or \"\">" }
```

- **Signature.** `HMAC-SHA256(key, "v1." + timestamp + "." + rawBody)`, hex. `rawBody` is the exact byte
  string sent. The route serialises **once** (`const raw = JSON.stringify({ v: 1, rid, code, state, nonce })`)
  and passes that same string as the body, so the bytes signed and the bytes sent cannot drift. The
  function verifies over `req.rawBody` — the bytes Cloud Run received — and **never** over a
  re-serialisation of `req.body` (see *Order of checks*, step 3).
- **`rid`** is 8 random bytes as hex — exactly 16 lowercase hex characters, `/^[0-9a-f]{16}$/`. It is
  minted by the web route, is derived from nothing and is meaningful to nobody: it exists so a failed
  attempt can be traced across two logs without either log holding a value that matters. Because it
  arrives in the body, it is **caller-controlled**: a party who can sign could otherwise set it to the
  code, the state or the nonce and have the function write that value into Cloud Logging under a field
  this design has pre-approved for logging — defeating the "never log the code" rule with the very
  mechanism added to make logging safe, and defeating the response pin as well, since the value would
  then be echoed back. The function therefore **validates the shape before the rid is logged, echoed or
  used in any way** (step 7) and refuses anything else with 400. The 16-hex shape also removes the
  log-injection surface — no newline, no quote, no JSON fragment can survive it.
- **`nonce`** is the cookie value the browser presented, or the empty string when there was no cookie.
  It is always present as a key; its absence as a *value* is the signal, and the function decides what
  that means.
- **No query string, no cookies, no redirect following** (`redirect: "error"`). The route sends no header
  it was given: the seller's `User-Agent`, `Referer`, IP and cookies stay on the first hop.
- The route builds the body itself from the query and the cookie. It is not a relay for a caller's body,
  and there is nothing an outsider can post *to the web route* — `/ebay/callback` exports only `GET`;
  a POST to it gets Next's own 405.

#### The response

Always `content-type: application/json`, always `cache-control: no-store`.

| Status | Body | Meaning |
|---|---|---|
| 200 | `{"ok":true,"outcome":"connected","rid":"…"}` | Connected or reconnected. |
| 200 | `{"ok":false,"outcome":"error","reason":"<word>","rid":"…"}` | A decided refusal. `reason` ∈ `disabled`, `missing_code`, `state`, `browser`, `environment`, `no_seller`, `token`, `exchange` — the same eight words the 302 used to carry. |
| 400 | `{"ok":false,"rid":"…"}` | A **validated** rid exists (step 10 field shapes failed): malformed `state`, over-long `code`, over-long `nonce`. |
| 400 | `{"ok":false}` | No validated rid exists yet: a query string, a body over 8 KB, a body that is not a JSON object, `v !== 1`, or a `rid` that is not 16 lowercase hex. |
| 401 | `{"ok":false}` | `req.rawBody` absent; `EBAY_CALLBACK_KEY` unconfigured or under 32 characters; missing, malformed, stale or wrong signature. **No detail, ever** — not which of them it was, not whether the state exists, not whether the connector is on, **and not whether the secret is configured**. |
| 405 | `{"ok":false}` | Any method other than POST, **GET included**. |

There is deliberately **no 503**. An earlier draft answered 503 for an unconfigured `EBAY_CALLBACK_KEY`,
which made the status code an unauthenticated oracle for whether the secret exists — the more useful
signal to an attacker choosing when to probe, and a direct contradiction of the care taken to keep the
connector flag behind the signature. An unconfigured key answers **401**, identically to a wrong one;
the distinction lives only in the ops log. The seller-facing outcome is `unavailable` either way, so
nothing is lost.

Two statuses do remain distinguishable without a key, and that is accepted rather than overlooked:
405 and the rid-less 400. Both report **fixed properties of the endpoint** — it takes POST only, it
takes no query string, it caps bodies at 8 KB — identical in every deployment, revealing nothing about
configuration, state or whether any seller exists. That is a different class of fact from "the secret
is set" or "the connector is on", both of which stay behind the 401 wall.

A decided refusal is an answer, not a transport failure, so it is 200 with `ok:false`. The web route
distinguishes exactly on that: 200 + a parseable body + a known outcome is obeyed; **anything else** —
400, 401, 405, a 5xx, unparseable JSON, an unknown reason word, a network error, a timeout — becomes
one seller-facing outcome, `reason=unavailable`.

#### Order of checks, and which side is authoritative

**Web route, `GET /ebay/callback`** — in this order, stopping at the first that fires. Every branch
clears the nonce cookie on its response and redirects to a module constant with only `section`, `ebay`
and `reason` set from a fixed vocabulary; no value from the query ever reaches `NextResponse.redirect`.

1. `error` present → `?ebay=cancelled`. **No backend call.** eBay's declined URL points straight at the
   settings page, so this is defence in depth; either way a decline never reaches the connector. This is
   the **only** place `cancelled` is produced: the function's POST body has no `error` field and the
   word is not in its vocabulary. **Presence is `params.has("error")`, not the truthiness of its value:**
   `URLSearchParams.get` answers `""` — not `null` — for `?error=`, so a truthy test reads an empty
   decline as "not a decline" and sends the seller down the `missing_code` path.
2. `code` and `state` both present and shaped (`state` matches `/^[A-Za-z0-9_-]{20,120}$/`, `code` is
   1–4096 characters) → else `?ebay=error&reason=missing_code`. **No call.**
3. Read the `nv_ebay_nonce` cookie. The mirror of `setEbayNonceCookie`'s `encodeURIComponent` is
   **already applied by `NextRequest.cookies`** — `next/dist/compiled/@edge-runtime/cookies`'s
   `parseCookie` calls `decodeURIComponent` on every value — so the route must **not** decode a second
   time. (This step used to instruct one. For a base64url nonce both readings are the identity, so
   nothing was at risk, but a second decode is wrong in principle and throws `URIError` on a stray `%`.)
   Absent, empty or longer than 200 characters → the body carries `nonce: ""`. **This is not a refusal
   and never was one:** an absent cookie must reach the function so the state is burned. See *The burn*.
4. `NIVADESK_EBAY_CALLBACK_KEY` present **and at least 32 characters** → else
   `?ebay=error&reason=unavailable`. **No call**, plus one ops log line naming the variable and which
   check failed by name (`not configured` / `shorter than 32 characters`) and nothing else. The length
   floor is the same one the function applies; without it a truncated paste on Hostinger produces a
   signed POST that dies as an opaque 401 with no ops line naming a cause. This is the **one** step that
   refuses without posting, and it suspends the burn while it lasts — see *The burn*, last two
   paragraphs, and the operator action in the deploy plan §4.2.
5. Mint `rid`, serialise once, sign, POST, with a 20-second abort.
6. 200 + JSON + a known `outcome`/`reason` → redirect accordingly. Anything else →
   `?ebay=error&reason=unavailable`, plus **one ops log line for every non-200 outcome**, not only the
   transport failures: `ebay callback relay rid=<rid> status=<n>`, `… unreachable`, `… timeout`. An
   operator debugging a key mismatch is looking at exactly this line, and the web side always has the
   rid because the web side minted it.

**Function, `POST ebayOAuthCallback`** — in this order. The whole handler body sits inside one
outermost `try`; see *Logging*.

1. `req.method !== "POST"` → 405. The body is not read, the state collection is not touched.
2. A query string is present → 400 before the body is read. Nothing in this contract puts a value in a
   URL, so a query string means a caller from the old world, or someone probing — and refusing it makes
   the hole impossible to reopen by accident. **The mechanism is stated, not left to the implementer:**
   `String(req.originalUrl || req.url || "").includes("?")`. It is deliberately *not*
   `Object.keys(req.query).length` — Firebase's Express layer always populates `req.query`, and reading
   it would contradict source pin **#28**, which forbids a `req.query` read anywhere in this handler.
3. `req.rawBody` is a Buffer → else **401**. `req.rawBody.length > 8192` → 400. **Never** the fallback
   pattern at `functions/index.js:32833` (`req.rawBody || Buffer.from(JSON.stringify(req.body || {}))`):
   a re-serialisation silently breaks an exact-bytes HMAC, and the absence of raw bytes is a request
   that cannot be authenticated, not one to guess at. This step is before the HMAC on purpose — the cap
   is a guard on the work the signature check does, and a cap applied after the HMAC would guard nothing.
4. `callbackKey()` blank or under 32 characters → **401**, and one ops line:
   `ebay callback: EBAY_CALLBACK_KEY not configured`. An unconfigured function refuses; it never accepts.
5. Signature: header present and `v1=`-shaped, `x-nivadesk-timestamp` a number within **±5 minutes** of
   now in **both** directions, `crypto.timingSafeEqual` over the two hex digests (length-guarded first,
   because `timingSafeEqual` throws on unequal lengths) → else 401 `{"ok":false}`.
6. `JSON.parse(req.rawBody.toString("utf8"))` → a plain object (not an array, not `null`) with `v === 1`
   → else 400.
7. `rid` matches `/^[0-9a-f]{16}$/` → else 400 `{"ok":false}` with no rid. Nothing has been logged with a
   rid before this point, and nothing is.
8. `connectorOn()` → else 200 `reason=disabled`. **After** the signature, deliberately: an
   unauthenticated caller must not be able to learn whether the connector is switched on.
9. `code` and `state` both non-empty → else 200 `reason=missing_code`. Absence is a seller-facing
   outcome, and stays one.
10. Field shapes: `state` matches `/^[A-Za-z0-9_-]{20,120}$/`, `code` ≤ 4096 characters, `nonce` a string
    ≤ 200 characters (empty allowed) → else 400 `{"ok":false,"rid":"…"}`. Malformation, unlike absence,
    is a protocol error and not a seller. **The `state` shape check is a security control, not tidiness,
    and it must be here, before `states().doc(state)`:** Firestore's own argument validation embeds the
    rejected path *in the error message* — verified against this repo's `firebase-admin`,
    `states().doc("abc/def")` throws `Value for argument "documentPath" must point to a document, but was
    "abc/def"…` — so a path-shaped state reaching `.doc()` and then a logged `error.message` would write
    the state verbatim into Cloud Logging, which is the exact exposure this whole section exists to
    close. A Firestore document id may be up to 1500 bytes (a 1600-character id does not throw at
    `.doc()`), so length alone is no filter either. §4.5's regex is the filter, applied on **this** side:
    the function must not depend on a caller having applied it.
11. The state transaction, **unchanged from §4.5**: unknown / `used` / expired → `state`; otherwise burn
    it (`used: true, usedAt`) inside the same transaction, then compare `sha256hex(nonce)` with
    `nonceHash` → mismatch **or empty nonce** → `browser`; then `row.environment !== environment()` →
    `environment`.
11b. On a verdict that FOLLOWED the burn — `browser` or `environment` — redeem the code and throw the
    tokens away before answering: one token request, no identity call, nothing written, nothing logged.
    eBay's code is single use and is bound to the application rather than to the state, so a refusal that
    leaves it unspent leaves it replayable against a freshly minted state (*The burn, and the spend*).
    `state` and `disabled` are deliberately **not** redeemed: the first is reachable with no live state at
    all and would let a signed caller drive outbound token requests at will, and the second must not
    contact eBay while the connector is switched off (§2).
12. Exchange the code server-side, ask the Identity API who the seller is, box the tokens, upsert the
    connection, write `syncLog` and health — all unchanged — then 200 `outcome:"connected"`.
    Identity 403 → `no_seller`; auth-class throw → `token`; anything else → `exchange`.

| Question | Authoritative side | Why it can only be there |
|---|---|---|
| Did eBay decline? | **Web** | The `error` parameter exists only on the browser hop. |
| Is a `code` and a `state` present at all? | **Web** refuses early; **function** re-checks and is authoritative | The web check is an economy (it saves an invocation and keeps a scan off the connector); the function must not depend on a caller having done it. |
| Was a nonce cookie present in this browser? | **Web reports, function decides** | The function cannot see cookies, so the web is the only thing that can *observe* the cookie — but it merely copies what it saw into `nonce` (a value or `""`). The refusal, and the state burn that goes with it, are the function's. |
| Is the nonce the right one? | **Function** | Only the state document holds `nonceHash`; the web side never sees a hash and never compares. The cryptographic half stays server-side. |
| Is the state real, unused, unexpired, this environment? | **Function** | It is a Firestore transaction; there is no other candidate. |
| Is the caller allowed to speak to the connector? | **Function** | The HMAC is verified where the secret lives. |
| Is the connector switched on? | **Function** | `NIVADESK_EBAY_CONNECTOR` is a server switch. |
| What does the seller see? | **Web** | The function answers JSON now; the redirect is the route's. |

#### The burn, and the spend — why an absent cookie still costs one invocation

This is the part of §5 that the transport change must not touch, so it is written out rather than
implied. **An earlier revision of this section got the mechanism wrong, and the correction is the
subject of the whole subsection**: it claimed the burn ended the attack "at the moment of consent,
unconditionally". It does not. Burning a state stops *that state*; the attack does not need it.

§5's threat model: attacker B is a legitimate owner of workspace B. B calls `beginEbayConnect`, keeps
`state_B` and `nonce_B`, and phishes seller S into consenting. eBay sends S's browser to
`nivadesk.app/ebay/callback?code=X&state=state_B`. **S has no cookie.**

- **The burn, and exactly what it is worth.** The request reaches the function, the transaction burns
  `state_B` (`used: true`) and answers `browser`. `state_B` is dead, and a *second presentation of
  `state_B`* — the right nonce following a wrong one — answers `state`. That is the whole of it.
- **Why that is not the end of the attack.** The authorization code is bound to the **application**, not
  to the state that fetched it: `exchangeCode` sends `grant_type`, `code` and `redirect_uri`, and
  `redirect_uri` is the one global RuName (`functions/commerce/ebay/oauth.js`). So B never needs
  `state_B` again. B calls `beginEbayConnect` in B's own browser, gets a fresh `state_L` and `nonce_L`,
  and requests `nivadesk.app/ebay/callback?code=X&state=state_L`. The state is live, the nonce matches,
  the environment is right, and S's eBay account lands in workspace B. **Executed against the real
  handler:** the victim's state answered `reason=browser` with `exchangeCode` called zero times, and a
  second, freshly minted state then exchanged the *same* code and answered `outcome:"connected"`.
- **What actually closes it: the refusal spends the code.** On a verdict that follows a burn — `browser`
  and `environment` — the function calls `exchangeCode` itself and throws the tokens away: no identity
  call, no connection document, no credentials, no `syncLog` row, no log line. eBay's codes are single
  use, so an observed code is dead before a log reader can reach it, and B's replay above answers
  `reason=token` (`invalid_grant`) instead of connecting. That, and not the burn, is what makes
  residual 1 *survivable* rather than merely small.
- **What an absent-cookie web-side refusal would cost.** The route would refuse at its step 3 and never
  call, so nothing would burn `state_B` **and — the part that matters — nothing would spend code `X`**.
  It would sit valid in Hostinger's access log for the rest of eBay's TTL, and B replays it against a
  state of B's own minting. Refusing at the edge does not save the defence by one invocation; it removes
  the only step that can kill the code.

The "economy" was one function invocation. It is not an economy; it is the removal of the defence.
The rule is therefore: **a shaped callback always POSTs**, cookie or no cookie; the state is consumed at
first presentation exactly as §4.5 says, and the code is consumed with it. The stated justification of
the earlier draft — "the only party holding the nonce is the party who began the flow, who can simply
start again" — describes the attacker in this threat model, not the victim.

**Where the browser binding is decided, stated plainly rather than left to be inferred.** It is *split*,
and criterion 2 of the review list ("browser/session binding verified in the web layer") is met in
substance and not literally. The route can see only whether a cookie was **present**; it copies what it
saw into `nonce` and posts. Whether the value is **right** is `sha256hex(nonce) !== row.nonceHash` inside
the function's transaction, because the hash lives in Firestore and the Hostinger process holds no
credential for it — and giving it one would be a far worse trade than the one under review. Nothing in
the web layer *verifies* anything; it observes and carries. Residual 3 says what the cookie check is
worth on its own.

The cost of the rule is bounded: a scan can only reach the function with a `code` and a `state` that
pass the web route's shape checks, and an invented state answers `reason=state` after one transaction
read.

**The burn has one dependency, and it is the key.** The rule "a shaped callback always POSTs" holds only
while the route *can* post: with `NIVADESK_EBAY_CALLBACK_KEY` unset, short, or disagreeing with Secret
Manager, step 4 above returns `unavailable` without calling, or the function answers 401 before the
transaction — and either way **the state is not burned**. That is not a flaw in step 4: without a key
there is nothing to sign with, and an unsigned POST would be a 401 that burns nothing either. It is a
property that has to be *stated*, because it is the same collapse this section just argued against,
reached by configuration instead of by a code change. For as long as a key outage lasts, **§5's browser
binding is suspended for every state minted in that window**: each consent leaves a live, unused state
for the rest of its ten-minute TTL, while eBay's code for that consent is in Hostinger's access log
(residual 1). Attacker B, who minted the state and holds `nonce_B`, needs only the code.

The window is small — ten minutes past the last failed attempt — and the deploy plan carries the
operator's action rather than leaving it implied: a key outage is a reason to **expire the outstanding
`ebayConnectStates` before restoring service** (`docs/ebay-web-callback-deploy-plan.md` §4.2), or to wait
out the TTL of the last failure before telling sellers to retry. The half-configured state fails closed
for the *connection* and open for the *defence*, and a rollout document that says only the first has told
the operator half of it.

Replay is likewise still stopped by the state, not by the signature. A captured POST replayed inside
the five-minute skew window verifies, reaches the transaction, finds `used: true` and answers
`reason=state`. The signature is authentication; the single-use state is the replay defence, and it is
unchanged. Note also that the nonce comparison inside the transaction is a plain string compare, not
constant-time — which is safe **only** because the state is burned before the comparison happens. That
is one more reason the burn cannot be traded away.

#### What a leaked shared key buys, and what stands in front of this endpoint

A key holder **cannot complete a connection.** They still need a genuine `code`, a live unused state
and the matching nonce; `nonceHash` is only ever compared server-side, and the state is 32 random bytes.
The exchange also needs `EBAY_CLIENT_SECRET`, which is not on Hostinger at all.

What a key holder does get, stated so nobody has to rediscover it:

- **A state oracle.** A signed probe distinguishes `state` (absent, used or expired) from `browser`
  (exists, unused, unexpired, wrong nonce). States are unguessable, so this is only useful against a
  state the attacker has already observed — realistically from Hostinger's access log, the residual at
  the end of this section.
- **Targeted denial.** Every probe that *hits* a live state burns it, so an attacker holding both the
  key and an observed state can stop that seller's connection from completing. The seller's remedy is
  to press Connect again; the damage is nuisance, not data.
- Everything else is a 401, a 400, or a `reason=state`.

**The authorization code is bound to the application, not to the state that fetched it — so the burn is
the whole of that defence.** `exchangeCode` sends `grant_type`, `code` and `redirect_uri` and nothing
else (`functions/commerce/ebay/oauth.js`), and `redirect_uri` is `redirectRuName`, one global value for
every workspace. eBay therefore validates the code against **our application**, never against which
NivaDesk state presented it. Concretely: an attacker who observes a live code can begin their own connect
flow in their own browser, obtain `state_L` and `nonce_L`, and request
`GET https://nivadesk.app/ebay/callback?code=<observed>&state=state_L` with `nv_ebay_nonce=nonce_L`. The
route signs and relays it unchanged; the function finds `state_L` unused, the nonce matching and the
environment right, and exchanges **someone else's** code into the attacker's workspace. Nothing in the
protocol notices, because nothing in the protocol ties the two together.

What prevents it is that the code is spent before the attacker can present it — by the genuine flow when
the flow completes, and by the **refusal path** when it does not (*The burn, and the spend*). Note which
way that causality runs, because an earlier revision had it backwards: burning the state does **not**
cause the code to be spent, and on the browser-mismatch path nothing used to spend it at all. Residual 1
lists the places a code can be observed (Hostinger's access log, the seller's browser history, the address
bar) and then discounts them; the discount rests on the code being dead by the time it is read, which is
true only because the refusal redeems it. PKCE would bind the code to the
request that started it, and eBay's OAuth documents do not offer it for this flow
(`docs/ebay-callback-platform-logging.md`, Hostinger's own suggestion and why only "redeem immediately"
was available). It is also the reason production stays blocked on `connect.nivadesk.app` rather than that
being a tidiness preference: the code sitting in a log we do not control is not made harmless by our own
state handling, it is made *survivable* by it.

**Ingress: the shared key is knowingly the sole control, and this is a decision, not an omission.**
`ebayOAuthCallback` is a public unauthenticated Cloud Function. `ingress-internal-and-cloud-load-balancing`
is not available to us, because the only legitimate caller is Hostinger's egress on the public internet;
an IAM-authenticated caller would require a long-lived Google service-account credential to live on that
same shared host, which trades a scoped HMAC key for a Google identity and is worse. Hostinger's egress
address is not stable enough to allowlist. What the design does add is a spend bound: the function is
declared with **`maxInstances: 10`** — far above any real OAuth rate, and enough that an unkeyed flood
costs a bounded number of invocations rather than an unbounded bill. The trade is stated plainly: a
sustained flood would also make legitimate connects fail with `reason=unavailable` for its duration,
which is the correct failure direction for a connector. An attacker with no key is refused with 401
before anything stateful is touched — no Firestore read, no state, no eBay call.

The timing question is clean and is left alone: `timingSafeEqual` with a length guard leaks only the
digest length, which is public.

#### Every failure, what the seller sees, what is logged

`Seller sees` is the sentence `ebayReasonText()` already produces (§10, §11.5); a technical code never
reaches the screen.

| Case | Where decided | Wire result | Seller sees | What is logged |
|---|---|---|---|---|
| eBay decline (`error=…`) | Web | 302 `ebay=cancelled`, no call | "eBay connection cancelled. Nothing was changed." | nothing by us |
| Not a callback (no `code`, no `error`) | Web | 302 `reason=missing_code`, no call | "eBay did not complete the connection. Try again." | nothing by us |
| Malformed `code`/`state` | Web | 302 `reason=missing_code`, no call | same | nothing by us |
| **No nonce cookie** | **Function** (the web posts `nonce:""`) | 200 `reason=browser`, **state burned and the code redeemed and discarded** | "Finish connecting eBay in the same browser you started from." | nothing |
| Nonce mismatch | Function | 200 `reason=browser`, **state burned, code redeemed and discarded** | same | nothing |
| `NIVADESK_EBAY_CALLBACK_KEY` unset or under 32 chars | Web | 302 `reason=unavailable`, no call | "eBay did not complete the connection. Try again." | `ebay callback relay: NIVADESK_EBAY_CALLBACK_KEY not configured` / `… shorter than 32 characters` |
| Unauthenticated / wrongly signed / no `rawBody` POST | Function | **401** `{"ok":false}` | — (not a seller; if it were, `reason=unavailable`) | `ebay callback: rejected unsigned request` — no header, no body, no rid, no reason for the rejection; **at most once a minute per instance** (below) |
| Timestamp outside the ±5-minute window (either direction) | Function | **401** `{"ok":false}` — byte-identical to the row above | same | `ebay callback: relay timestamp outside the five-minute window`, throttled the same way. **Its own ops key on purpose:** a relay host whose clock has drifted produces exactly the 401 a key mismatch produces, and a runbook naming only the key (deploy plan §4.2) sends the operator round the same loop for ever. The distinction is in our log, never in the answer, so it is no oracle |
| `EBAY_CALLBACK_KEY` unset on the function | Function | **401** `{"ok":false}` (indistinguishable from a wrong key) | `reason=unavailable` → "eBay did not complete the connection. Try again." | `ebay callback: EBAY_CALLBACK_KEY not configured`, **at most once a minute per instance** — it is a configuration fact, not a per-request event, and the repeat is what an outsider would use to bury it |
| GET (or any non-POST) on the function | Function | **405** `{"ok":false}` | — | nothing |
| Query string on the function | Function | **400** `{"ok":false}` | — | `ebay callback: query string refused` (the string itself is **not** logged), at most once a minute per instance |
| Oversized (> 8 KB) body | Function | **400** `{"ok":false}` | `reason=unavailable` | `ebay callback: body refused` + byte length, at most once a minute per instance (the byte length is in the line, never in the throttle key — otherwise varying the size would defeat it) |
| Non-JSON / array / `v !== 1` body | Function | **400** `{"ok":false}` | `reason=unavailable` | `ebay callback: body refused` + byte length (**never** the `JSON.parse` message — see *Logging*) |
| `rid` not 16 lowercase hex | Function | **400** `{"ok":false}` | `reason=unavailable` | `ebay callback: rid refused` (the value is **not** logged) |
| Malformed `state` / over-long `code` or `nonce` | Function | **400** `{"ok":false,"rid"}` | `reason=unavailable` | `ebay callback: field shape refused rid=<rid>` + which field name |
| Connector off | Function | 200 `reason=disabled` | "eBay is not set up on this server yet. Contact support and we will enable it." | nothing |
| Unknown / replayed / expired state | Function | 200 `reason=state` | "The eBay sign-in link has expired or was already used. Start again." | nothing (a transaction throw logs `ebay callback: state transaction failed rid=<rid> code=<n>` — a fixed string, the validated rid and the numeric gRPC status, **never** `error.message`) |
| Environment mismatch | Function | 200 `reason=environment`, state burned, code redeemed and discarded (best effort — a code minted on the other host is simply refused) | "This eBay account belongs to a different environment." | nothing |
| Identity 403 / no seller | Function | 200 `reason=no_seller` | "eBay did not tell us which seller account this is. Reconnect and approve every permission." | nothing |
| Exchange refused (auth class) | Function | 200 `reason=token` | "eBay did not complete the connection. Try again." | `ebayOAuthCallback failed:` + the truncated `EbayOAuthError` message, which §14.1 pins to be built from eBay's `error` / `error_description` only |
| Exchange failed (anything else from `commerce/ebay/oauth.js`) | Function | 200 `reason=exchange` | same | as above |
| Anything else in the connect block throwing (the token box, a Firestore write, the cursor read, the health touch) | Function | 200 `reason=token` / `exchange` by class | same | `ebayOAuthCallback failed: rid=<rid> class=<word>` — **never** the message: §14.1 pins `EbayOAuthError`'s message and nothing else, so nothing else gets to log one |
| Unexpected throw anywhere in steps 1–10 | Function | **400** `{"ok":false}` | `reason=unavailable` | `ebay callback: refused` — a fixed string and nothing else (see *Logging*) |
| Function unreachable (DNS, TLS, refused) | Web | no HTTP result | `reason=unavailable` → "eBay did not complete the connection. Try again." | `ebay callback relay rid=<rid> unreachable` |
| Function answered non-200 | Web | — | same | `ebay callback relay rid=<rid> status=<n>` |
| Function slow (web aborts at 20 s) | Web | aborted | same | `ebay callback relay rid=<rid> timeout` |
| Connected | Function | 200 `outcome:"connected"` | "eBay account connected." | the existing `syncLog` row (`connected` / `reconnected`) and health touch |

#### Logging — the rules, and the two traps that defeat them

**The field names that must never appear in any log line, on either side, in any form:** `code`,
`state`, `nonce`, `nonceHash`, `x-nivadesk-signature`, `x-nivadesk-timestamp`, `access_token`,
`refresh_token`, and the request body itself — `req.body`, `req.rawBody` and `req.query` must never be
stringified into a log argument, whole or sliced. The only values either side may log are: a **validated**
`rid`, a `reason` word, an HTTP status number, a numeric gRPC status code, a byte length, an
environment-variable *name*, a field *name*, and a truncated error message from `commerce/ebay/oauth.js`.

Two traps make that rule fail silently unless they are named, and both were found by reading real
behaviour rather than the code:

1. **A caught error's `message` can carry the value that threw.** `JSON.parse` on a non-JSON body echoes
   the body's first ten characters — verified on this repo's Node v22.22.3,
   `JSON.parse("AUTHCODE_v4x_SECRET_…")` throws `Unexpected token 'A', "AUTHCODE_v"... is not valid JSON`.
   Firestore's `.doc()` embeds the whole rejected path (step 10 above). Therefore: **no caught error's
   `message`, `stack` or object may be passed to a log function on any path `ebayOAuthCallback` can
   reach** — today the handler body, `writeSyncEvent` (called from the connect block) and
   `spendAndDiscardCode` (called from the refusal path). An earlier revision wrote that as "anywhere in
   `ebayConnector.js`", which was both wider than the design enforces — the sync, import, notification and
   deletion paths log a provider message deliberately, and no callback value can reach them — and, where
   it counted, **false**: `writeSyncEvent` logged `error?.message || error` and is reached from the
   callback's own SUCCESS path. A test now proves it rather than asserting it, by refusing the `syncLog`
   write and hunting the marker through every captured line, and both helpers are pinned **by name** in
   `ebay-connect.test.js` because the handler slice cannot see them. The one
   exception is the truncated `EbayOAuthError` from `commerce/ebay/oauth.js`, which §14.1 pins to
   be built from eBay's own `error`/`error_description` fields. Everywhere else the log line is a fixed
   string plus values from the allowed list. The existing
   `console.error("ebayOAuthCallback state failed:", error?.message || error)` at
   `functions/ebayConnector.js:417` is **rewritten**, not kept.

   **The exception is applied at the log site, by class, because the `try` around it is wider than the
   exception.** The connect block does not wrap only `exchangeCode` and `fetchIdentity`: `storeCredentials`,
   the connection read and write, the `ebayConnectStates` merge, the cursor read and the health touch all
   throw into the same `catch`, and §14.1 pins none of their messages. None of them can carry a listed
   value today — `state` has passed its regex before `.doc()` sees it, `id` is sanitised, the code exists
   only inside the oauth call — but "today" is the whole of that guarantee, and the source pin counts the
   log LINE, not the throws that can reach it. So the line reads
   `if (error?.name === "EbayOAuthError") console.error("ebayOAuthCallback failed:", …)` and every other
   throw is logged as `ebayOAuthCallback failed: rid=<rid> class=<word>`, where the word comes from
   `ERROR_CLASSES` — a closed vocabulary that can carry no value. The class is matched by `name`, not by
   `instanceof`: `oauth` is an injected dependency, so a second copy of the module or a subclass would slip
   an identity check. A future `throw new Error(\`… ${code}\`)` anywhere in those forty-five lines now logs
   its class and nothing else, instead of shipping green past every pin in the suite.
2. **An uncaught throw is logged by the platform, with the stack and the message.** Steps 1–10 contain no
   try/catch today, so any throw in them — a Buffer method on an unexpected type, a malformed header, a
   Firestore argument error — produces exactly the exposure this section exists to prevent, through a
   channel our own log rules do not govern. The whole handler body therefore sits inside **one outermost
   `try`** whose `catch` answers 400 `{"ok":false}` and logs the fixed string `ebay callback: refused`
   with no arguments at all. It is a backstop, not a control: every expected condition is already
   answered above it.

**Every line before the signature check is anonymously triggerable, so those lines are throttled.**
`ebayOAuthCallback` is public: the method, query-string, `rawBody`, size, key and timestamp checks all
answer before any key is proven, so an outsider decides how often five log lines are written, and one —
`ebay callback: EBAY_CALLBACK_KEY not configured` — is at **error** severity and is the line *Rollout*
step 4 tells the operator to grep for. Unthrottled, a stranger can write it out of the very window it
matters in, one line per request, at our expense. Each of those lines is therefore emitted **at most once
a minute per instance, per message**, from a small map in the instance (`maxInstances: 10` bounds how many
maps exist). What is suppressed is a repeat of a line already present; nothing is lost that the first line
does not already say, and the lines *after* the signature — field shapes, the transaction failure, the
connect block — are unthrottled because only a keyed caller can reach them. `maxInstances` bounds the
invocation bill; this bounds the log bill, and they are not the same bound.

What the platform still records for the POST, and why none of it matters: method, `requestUrl` — now the
bare function URL with **no query string** — status, latency, `serverIp`, `userAgent` (the web server's),
and `remoteIp`, which is now Hostinger's egress address rather than the seller's. Cloud Run does not
record request headers or bodies, so the signature and the `code`, `state` and `nonce` inside the body
are outside its reach entirely.

#### Timeouts, and why the function keeps its long budget

The web route aborts at **20 seconds**. The function keeps `timeoutSeconds: 120` — do **not** shorten it
to match. The state is burned inside the transaction *before* the exchange, so cutting the function short
is precisely the thing that would leave a burned state with no connection. Letting it finish means a slow
eBay still produces a connection row even after the seller's browser has been sent somewhere controlled.

There is no half-consumed condition to leave behind: the state document has exactly two conditions,
unused and used, and it moves between them in one transaction. An abandoned `fetch` on the web side
changes nothing about it. What is genuinely ambiguous is the *screen*, not the data — and the recovery is real, though it is not
quite the one an earlier draft of this paragraph described. `EbayIntegrationSection` calls `refresh(true)`
**once**, in the same effect that sets the banner (`EbayIntegrationSection.tsx`); there is no interval and
no second poll anywhere in that file. So if the function is still exchanging — the realistic case being a
Cloud Run cold start on this bundle plus eBay's token and identity round trips inside a 20-second budget —
that refresh returns nothing and the connection does **not** "appear a moment after the error banner". The
seller sees the error, presses Connect again, and that second attempt reconnects onto the same
deterministic row (`companyId__sellerUserId`, `set(merge)`), which costs nothing and is the actual
recovery. A reload of the settings page shows the row too. If the sentence is ever to be true as written
it needs a short re-poll on `reason=unavailable` — two calls a few seconds apart — which is a UI change,
not a transport one, and is not part of this section. A separate
`ebay=pending` outcome was considered and rejected: it would buy a slightly better sentence at the price
of a new outcome word, a new string and twelve translations, for a case the refresh already resolves.

`unavailable` is the one new reason word. It maps to the English sentence
`"eBay did not complete the connection. Try again."` — which `ebayReasonText` already returns as its
fallback and which already exists in all eleven other languages — so it is added to `REASON_TEXT` pointing
at that same string and needs **no** new translation. It is produced only by the web route and is never
returned by the function.

`REASON_TEXT` carries **nine** rows, not six. The three that share `unavailable`'s sentence —
`missing_code` (the route's, for a visit that is not a callback) and `token` / `exchange` (the function's,
relayed unchanged) — are listed explicitly rather than left to the fallback. The landing is identical
either way; what is not identical is the claim the table makes about itself. Its own comment says the
vocabulary is complete in one place, and a reader checking a reason word against it has to be able to
find every word the route can redirect with. Same string, same translations, no new key.

#### What does not change

- `beginEbayConnect`, `claimEbayConnectState`, `/ebay/start` and the whole native hand-off (§5.2) are
  **unchanged**, line for line. They never touched the function's URL query; a native flow still ends at
  the same web callback, which now posts like any other.
- `ebayConnectStates/{state}` (§4.5) is unchanged: same fields, same TTL, same `nonceHash`, same
  single-use transaction, same burn — on an absent nonce and on a wrong one alike.
- The eight reason words, the sentences behind them, and §10's table are unchanged apart from the
  `unavailable` row and the three rows (`missing_code`, `token`, `exchange`) that point at the same
  sentence the fallback already gave them.
- The accepted URL registered in the eBay portal is unchanged. eBay is not told anything new and is not
  contacted about this.
- The nonce cookie's transport attributes are unchanged: `nv_ebay_nonce`, `Secure`, `SameSite=Lax`,
  `Path=/ebay/callback`, `Max-Age=600`, written by `setEbayNonceCookie`, cleared on every callback
  response. **`HttpOnly` is absent from that list because the cookie structurally cannot have it**, not
  because it was forgotten — see the residuals below. The claim "scoped to the callback path so no other
  page can read it", which appears in §5.1, in `setEbayNonceCookie`'s JSDoc at
  `studioflow-web/lib/studioflow/ebay.ts:236-241` and in the deploy plan's stated-property paragraph, is
  **wrong and is removed in all three**: `Path` is a request-matching rule, not a security
  boundary, and same-origin script under a matching path reads the cookie freely.

Removed, not kept as a fallback:

- **The GET path.** `ebayOAuthCallback` is not deployed in production, so there is no live caller to keep
  working, and a GET fallback would reopen the exact hole this section closes — a query string that Cloud
  Run logs. GET answers 405.
- **`connectRedirect()`**, whose only caller was this handler. `appReturnUrl()` stays, because
  `beginEbayConnect` derives the native `startUrl` from it, and the settings URL becomes a module constant
  in the web route. The §5 bullet describing `connectRedirect` is deleted.
- **The function's decline branch**, `if (String(req.query?.error || "")) { … ebay: "cancelled" … }` at
  `functions/ebayConnector.js:400`. The POST body has no `error` field, so the branch is unreachable; it
  is **deleted**, not left as dead code, and `cancelled` is not in the function's response vocabulary. The
  qa case at `ebay-connect.test.js:71-72` that asserts it against the function is **deleted with it**; the
  decline is now covered on the side that owns it, by `studioflow-web/scripts/check-ebay-relay-vectors.mjs`
  (below), which both asserts the branch in the route's source and drives the real route with `?error=…`
  and with a bare `?error=` — presence, not truthiness — to see `ebay=cancelled` and no call. The matching function-side assertion is scoped to **`ebayOAuthCallback`'s body**, not to
  the file — `functions/ebayConnector.js` legitimately carries a `"cancelled"` literal elsewhere
  (`envelope.order.platform_status === "cancelled"` in `applyEbayOrder`), so a file-wide pin would fail on
  correct code. It is pinned in `ebay-connect.test.js`'s source-pin case. §5's `ebayOAuthCallback` bullet
  is corrected in the same commit to stop attributing the decline to the function.

#### Rollout order (the marker gates the mount, and the web runtime is verified before it is trusted)

1. Operator mints the value and sets **`EBAY_CALLBACK_KEY`** in Secret Manager (granted to
   `ebay-connector@` only) and **`NIVADESK_EBAY_CALLBACK_KEY`** in Hostinger, in that order.
2. Web deploy of the new route. Until step 4 it posts to a function that does not exist and every attempt
   lands on `reason=unavailable` — which is the correct behaviour for a connector that is not there, and
   is the same thing the old route achieved by redirecting into a Google 404.
   **2a. Prove the runtime environment before anything depends on it.** This value is the first
   server-only env var the web tree has ever read, and this project's precedent is against us: the
   web-push VAPID key had to go into Hostinger's *build* environment. So, immediately after step 2 and
   before any state exists: request `https://nivadesk.app/ebay/callback?code=probe&state=<20+ chars of
   [A-Za-z0-9_-]>` and confirm the Hostinger log does **not** contain
   `ebay callback relay: NIVADESK_EBAY_CALLBACK_KEY not configured` — it should contain
   `ebay callback relay rid=<rid> unreachable` instead, because the function is not deployed yet. If the
   key line appears, Hostinger injects at build time only: rebuild with the value in the build
   environment, record that fact, and correct the rotation sentence in *The two names* in the same commit.
   Without this step a build that never sees the key fails silently and permanently, with one log line as
   the only diagnostic.
3. **Commit `functions/.ebay-secrets-ready` with `EBAY_SECRET_PARAMS` naming all five secrets.** This is
   the step both earlier lists omitted and it is the one that actually controls the mount:
   `functions/index.js` builds `EBAY_SECRET_PARAMS` and `EBAY_RUNTIME` **only** when `EBAY_SECRETS_READY`
   is true (`NIVADESK_EBAY_SECRETS_READY=1` or that marker file). Deploy without it and `EBAY_RUNTIME` is
   `{}`, no secret is mounted, `ebaySecretValue("EBAY_CALLBACK_KEY")` returns `""`, check 4 fires, and
   **every** POST answers 401 → every seller sees `reason=unavailable`, permanently, with no OAuth ever
   completing. §15's owner-action step 3 is the canonical list and now names five secrets; this step and
   that one must not drift apart again.
4. `firebase deploy` of the eBay functions. Confirm the mount before trusting it: a signed probe with an
   invented state must answer 200 `reason=state`, not 401.
5. Only then the first sandbox OAuth attempt, under its own approval.

If the two values ever disagree, every connect attempt ends at `reason=unavailable` and no state is
consumed; the same holds if either side is unconfigured — 401 on the function, no call from the web. The
failure mode of a rotation mistake is downtime for the connection — **and a suspended browser binding for
the states minted while it lasts**, because an unconsumed state is exactly what *The burn* says must not
survive a consent. Not an open door: B still needs the code, and the code is only in Hostinger's access
log (residual 1). But not nothing either, which is why the rotation procedure ends with expiring the
outstanding states rather than simply restoring the key (deploy plan §4.2).

#### Test matrix

**qa — `ebay-connect.test.js` (extended) — but first, the harness, which is the single largest piece of
work in this change.** `functions/test/qa/helpers/ebayHarness.js` is **not** ready and the claim that
"the `fakeRes` already records `status`/`json`" covers only a fraction of it:

- `buildEbay` passes **no `callbackKey` dep at all** (lines 60–99). It gains
  `callbackKey: () => TEST_CALLBACK_KEY`, a 64-hex constant local to the harness with no production
  meaning, plus a `switches.callbackKey` override so tests 4 and 5 can blank or truncate it.
- `connect()` (lines 112–116) invokes `fns.ebayOAuthCallback({ method: "GET", query: {…} }, res)`. Under
  this contract that is a 405 followed by a 400. It is rewritten to POST, and every one of the **16**
  `await connect(` sites in `ebay-connect.test.js` and the **1** in `ebay-sync.test.js` rides on that one
  rewrite (the signature of `connect()` does not change).
- **The fake request must carry `rawBody`, and `body` must be derived from it, never the reverse.** A new
  helper `signedCallback(fns, fields, { key, timestampMs })` builds
  `const raw = JSON.stringify(fields)`, signs `"v1." + ts + "." + raw`, and calls the handler with
  `{ method: "POST", originalUrl: "/ebayOAuthCallback", headers: {…}, rawBody: Buffer.from(raw, "utf8"),
  body: JSON.parse(raw) }`. If `body` were the literal and `rawBody` derived from it, test 9 (body swap)
  would go green while proving nothing about the Cloud Run path, where key order, unicode escaping and
  whitespace can differ from any re-serialisation — this repo's own recurring "tests that assert the bug"
  failure, applied across a process boundary.
- The **15** `res.redirectedTo` assertions in `ebay-connect.test.js` and the **7** in the e2e file assert a
  302 the function will no longer emit; they become `statusCode` / `payload` assertions.
- The e2e helpers `callback()` / `connect()` at
  `commerce-ebay-connector-emulator.test.js:113-114` (5 + 2 call sites) have the same GET+query shape and
  get the same rewrite, with `process.env.EBAY_CALLBACK_KEY` set beside the other four before
  `require("../../index.js")`.

| # | Case | Asserts |
|---|---|---|
| 1 | `GET` on the function | 405, `{"ok":false}`, and the state document is untouched |
| 2 | `PUT`, `DELETE`, `OPTIONS` | 405 |
| 3 | A POST carrying a query string (`originalUrl` ends `?x=1`) | 400, body never parsed |
| 4 | `callbackKey()` returns `""` | **401** even with an otherwise perfect signed request; state untouched; and the answer is byte-identical to case 8's, so the status cannot be used as a configuration oracle |
| 5 | `callbackKey()` returns a 31-character value | 401 (the length floor is enforced, not assumed) |
| 6 | Correctly signed POST | 200 `{"ok":true,"outcome":"connected"}`, connection row written exactly as the GET flow wrote it |
| 7 | No signature header | 401, body is exactly `{"ok":false}` — no `error`, no `reason`, no `rid` |
| 8 | Signature computed with a different key | 401 |
| 9 | Signature valid, then `code` changed in the body before sending | 401 (the body is bound) |
| 10 | Timestamp 6 minutes old → 401; **6 minutes in the future → 401**; 4 minutes old → accepted; 4 minutes in the future → accepted | the skew window is real in **both** directions |
| 11 | Timestamp missing / non-numeric / negative | 401 |
| 12 | `rawBody` absent from the request object | **401**, and the source pin below proves no re-serialised fallback exists |
| 13 | The same signed POST sent twice | first 200 connected, second 200 `reason=state` — replay is stopped by the state, not the signature |
| 14 | Unknown state / expired state | 200 `reason=state` |
| 15 | Wrong nonce value in the body | 200 `reason=browser` **and** `used === true` on the state document |
| 16 | **`nonce: ""` in the body — the absent-cookie case** | 200 `reason=browser` **and** `used === true`. Then a second signed POST with the *right* nonce and the same state → 200 `reason=state`. This is the §5 attack, and it is the reason the web route must not refuse an absent cookie |
| 17 | No `nonce` key in the body at all | same as 16 |
| 18 | Environment mismatch | 200 `reason=environment` |
| 19 | Connector off, **unsigned** POST | 401, not `disabled` — the gate must not be readable without the key |
| 20 | Connector off, signed POST | 200 `reason=disabled` |
| 21 | **Signed** body of 9 KB → 400; **unsigned** body of 9 KB → 400 as well (the size guard is ahead of the HMAC, and the matrix says which is sent rather than leaving it ambiguous); signed non-JSON → 400; signed JSON array → 400; signed `v: 2` → 400 |
| 22 | `rid` absent / 15 hex / 17 hex / uppercase hex / `"a".repeat(16)` / containing `\n` | 400 `{"ok":false}` with **no** `rid` key in the body |
| 23 | `rid` set to the case's own code value, and separately to its state value, in an otherwise valid signed body | 400, and the log pin (#26) still passes — i.e. the value never reached a log line, because the shape check runs before anything is logged |
| 24 | `state` = `"abc/def"`, `"a//b"`, `"x".repeat(1600)`, `"short"` in an otherwise valid signed body | 400 `{"ok":false,"rid"}`, `states().doc()` never called, and the log pin still passes. (Firestore's own `documentPath` error text embeds the rejected path, and a 1500-byte id is legal, so neither `.doc()` nor a length check is a filter) |
| 25 | `code` of 4097 characters; `nonce` of 201 characters | 400 `{"ok":false,"rid"}` |
| 26 | **Log pin** | `console.log/warn/error` captured across the whole suite. Assert that no captured line contains the code, the state, the nonce or the signature of any case above — **and also that it contains none of their first 8 characters**, which is what catches a truncated echo like `JSON.parse`'s ten-character prefix. Assert additionally that the only `rid` appearing in any line is one that matches `/^[0-9a-f]{16}$/` |
| 26b | **The unpinned throw** | a throw inside the connect block that is **not** an `EbayOAuthError` — `fetchIdentity` raising a plain `Error` whose message carries a marker value — answers `reason=exchange` and logs `class=unknown`, with the marker in no line. The source pin cannot see this: it counts the log line, not what can reach it |
| 27 | **Response pin** | `JSON.stringify(res.payload)` for every case contains no code, state or nonce value, and no 8-character prefix of one. The rid is checked against the shape, not against a fixture value — case 23 is the reason |
| 28 | **Source pin** | `ebayOAuthCallback`'s body contains no `req.query` read, no `res.redirect` call, no `JSON.stringify(req.body)`, no `req.rawBody \|\|` fallback, no `"cancelled"` literal, and exactly one `console.*` call carrying an `error.message` — the `ebayOAuthCallback failed:` line §14.1 pins to eBay's own `error`/`error_description`, **and that line carries the `error?.name === "EbayOAuthError"` guard**, because counting the line says nothing about which throws reach it — with no `error.stack` anywhere; it does contain `req.originalUrl` (the stated query-string mechanism) and `req.rawBody`; and the file still contains `crypto.timingSafeEqual` and no `connectRedirect`. Scoped to the handler, **not** the file: `applyEbayOrder` compares `platform_status === "cancelled"` and must keep doing so |

**qa — `commerce-ebay-wiring.test.js`:** `EBAY_SECRET_PARAMS` now names **five** secrets including
`EBAY_CALLBACK_KEY` (the existing row says four and must be updated); the array is still built **only**
under `EBAY_SECRETS_READY`; the `callbackKey` dep is passed in `index.js`; `EBAY_RUNTIME` still carries
`serviceAccount`, so the fifth secret is never mounted on the default compute account;
`ebayOAuthCallback` is declared with `maxInstances`; `access-control-policy.test.js`'s `EBAY_*` regex
already covers it.

**web — `npm run test:relay`, `studioflow-web/scripts/check-ebay-relay-vectors.mjs`.** This paragraph
described a committed vector file in the past tense before either half existed; what exists now is
stronger than the plan, and the plan's own premise turned out to be wrong, so both are recorded.

*The plan was:* `functions/test/fixtures/ebay-callback-signature-vectors.json` holding
`{ key, timestampMs, body, signature }` triples under a fixed **test** key, checked by the function's
verifier in `ebay-connect.test.js` and by the route's signer in the script — the two implementations
being, it said, unable to import each other, so **the vector is the shared pure thing**. That file has
**not** been written, and it is blocked on a decision rather than effort: a committed vector needs a fixed
HMAC key, and who mints that key and where it is recorded is the **owner's** call (deploy plan check 10).

*What is written instead:* the script **executes both implementations against each other**, which is what
the vector was for. It compiles the real `app/ebay/callback/route.ts` with the project's own `tsc`
(CommonJS, so `next/server` resolves; into a temp dir under the web tree, so `next` resolves at all),
drives `GET` with `globalThis.fetch` captured, and hands the request the route produced — headers, exact
body bytes and all — to the real `ebayOAuthCallback` through `functions/test/qa/helpers/ebayHarness.js`,
under the harness's per-run key. Neither side re-implements the other and no key is committed. It covers:
the canonical string agreeing across the boundary (the function accepts the route's signature and connects);
the signature binding the body (one swapped field → 401, and the state survives); the absent cookie posting
`nonce: ""` and the function burning the state; both decline shapes settling on our domain with no call;
and a blank or 31-character key making no call, landing `unavailable`, and leaving the state unburned —
the cost §4.2 of the deploy plan now names. It also makes the source assertions the plan listed, which no
execution can show: `runtime = "nodejs"`, `dynamic = "force-dynamic"`, the decline branch, the in-handler
`process.env.NIVADESK_EBAY_CALLBACK_KEY` read with its length floor, no `NEXT_PUBLIC_` outside comments,
and no `return` on the line that reads the nonce cookie.

*What it does not cover, and says so on every run:* the committed vector file. If someone writes it, the
function's verifier should be checked against it in `ebay-connect.test.js` as planned; the script prints a
`NOTE` when the file appears so the two do not drift apart silently.

**e2e — `commerce-ebay-connector-emulator.test.js`:** set `process.env.EBAY_CALLBACK_KEY` beside the other
four before `require("../../index.js")`. Case 1 becomes: begin → state doc with `nonceHash` and the
`expireAt` twin; a signed POST with a forged state → 200 `reason=state`; a signed POST with the right
state and `nonce: ""` → 200 `reason=browser` **and the state is burned**, proven by a follow-up signed
POST with the right nonce answering `reason=state`; a signed POST with the right nonce (fresh state) →
`outcome:"connected"` and every assertion that row already makes (capabilities, scopes,
`sellerUserIdHash`, marketplaces, the credentials box decrypting under `EBAY_TOKEN_KEY`, no plaintext
token and no `Hash` key in `getEbayConnections`). Add: an **unsigned** POST → 401 and the state survives
untouched, provable by then completing the flow with a signed one.

**web:** `npm run typecheck` and `npx next build --no-lint` clean, with `ƒ /ebay/callback` still dynamic in
the manifest; `npm run test:relay` green (what that covers is the paragraph above — the executed
cross-boundary check, not the unwritten vector file); and a grep of the built output that makes **two** assertions,
not one:

- **Negative**, over the *client* chunks: no `NIVADESK_EBAY_CALLBACK_KEY` and no literal
  `x-nivadesk-signature`, proving the signer stayed on the server.
- **Positive**, over the *server* chunk for the route: the literal string
  `process.env.NIVADESK_EBAY_CALLBACK_KEY` is still present. The reference surviving is the evidence that
  no build-time inlining happened. The negative grep alone is blind to exactly the failure it exists to
  catch: if Next statically replaces `process.env.X` — which it does for Edge-runtime route handlers —
  the *name* vanishes from the bundle and the *value* appears in its place, so the grep goes green in the
  worst case. `export const runtime = "nodejs"` in the route (asserted by `test:relay`) is what keeps that
  from happening; this grep is what proves it.

This grep joins check 7 of the Round 166 pre-deploy list.

**§14.3 adversarial list gains:** unsigned POST, POST signed with a rotated-away key, replayed signed POST,
body-swap after signing, timestamp outside the window in both directions, GET on the function, query
string on the function, a path-shaped `state`, a `rid` set to the code, an absent `rawBody`, a 9 KB body,
and the web route with no key configured.

#### Residual risk, stated plainly

Five things this change does **not** fix. Each is reduced or bounded, none is closed, and each names who
would have to decide otherwise.

1. **The code is still in Hostinger's access log.** eBay's RuName has one accepted URL and eBay decides how
   it calls it: a top-level browser GET carrying `code` and `state` in the query string. That hop is
   untouched by this work, so `GET /ebay/callback?code=…&state=…` is still recorded on nivadesk.app, and
   anyone with access to that log can read a single-use authorization code for as long as it is retained.
   The code now appears in **one** access log instead of two, and the one that remains is on our own
   domain rather than in a Google project whose log readers are a different and larger set of people. It
   is worthless without `EBAY_CLIENT_SECRET`, and — because of *The burn, and the spend* — worthless once
   it has been presented **at all**: every callback that reaches the transaction either exchanges the code
   into a connection or redeems and discards it, so a log reader finds a code eBay has already refused.
   The exception is every consent that lands while the relay cannot reach the function (a key outage, a
   401, a 5xx, the route's timeout): those codes are never presented, nothing on our side can invalidate
   them, and the deploy plan's §4.2 says what the operator does about it. It can only be closed by not
   receiving the code in a query string at all,
   which eBay's redirect does not offer. This is **measured, not assumed**: synthetic requests sent on 6
   September appear in hPanel's access-log view with the query string verbatim, and Hostinger's own
   answers offer no disable, no redaction, no established retention, no disclosed reader set and no
   confirmation that copies are not forwarded (`docs/ebay-callback-platform-logging.md`). Retention is
   therefore **not** the lever it was assumed to be. The lever is where the accepted URL points, and the
   operator's decision on it is recorded in that note: the sandbox residual accepted on the record, and
   **production blocked** until the callback is served by a Cloudflare Worker on `connect.nivadesk.app`
   with synthetic values proving no query string is retained there. That is an operator decision, not
   part of this design. The state is in the same log, which is what makes the leaked-key state oracle
   above reachable at all.
2. **The nonce is a non-`HttpOnly` bearer string.** The headline result of this section is real, but it
   must be stated at exactly its true size: **the nonce is out of every URL.** On the second hop that is
   the end of it — it travels in a POST body, and Cloud Run records `requestUrl` but neither headers nor
   bodies. On the first hop it travels in a `Cookie` header, and the access-log view Hostinger exposes
   records the request line, the user agent and the caller's IP, not request headers — measured on 6
   September, not assumed (`docs/ebay-callback-platform-logging.md`). What no measurement of ours can
   establish is what sits behind that view: retention, readers and onward copies are "not established",
   "not disclosed" and "cannot confirm or deny" in Hostinger's own answers. So the claim this section
   supports is that the nonce is in no URL anywhere and in nothing the access log shows — and **never**
   that OAuth values have stopped appearing in platform logs, which is false: the code and the state
   demonstrably still do (residual 1). That still removes the sharper of the two exposures, because
   unlike a code the nonce does not expire on use. But the
   matching residual belongs in the same paragraph: `claimEbayConnectState` returns the nonce as JSON to
   the client and `studioflow-web/lib/studioflow/ebay.ts:242-246` writes it with `document.cookie` from
   client JavaScript, so it **cannot** be `HttpOnly` and is readable by any script running on
   nivadesk.app. `Path=/ebay/callback` is a request-matching rule, not a boundary. Any script execution on
   our origin therefore defeats browser binding regardless of this transport change. Making it `HttpOnly`
   needs a server route to mint the cookie — a change to the connect flow (§5.2's native hand-off included),
   not to this transport, and one the **owner** decides to schedule.
3. **The web-side cookie check binds no session.** The route proves only that *some* browser presented a
   string; it never checks that the browser is signed in, still less as the state's `uid`. The binding is
   entirely the nonce, and a nonce is a bearer value that replays from any browser it is pasted into. This
   is by construction: eBay's redirect lands on a route that must work for a seller who may have no
   NivaDesk session at all. §5.3's list of what is claimed stays accurate; this sentence makes the
   mechanism explicit so no reviewer reads the cookie check as more than it is.
4. **The shared key is knowingly the sole control on a public endpoint.** No ingress restriction and no IAM
   invoker requirement, for the reasons argued above; `maxInstances: 10` bounds the spend and nothing
   bounds the attempts. If that is not acceptable, the alternative is a Google service-account credential
   living on Hostinger, and that is an **owner** decision, not one this design can make quietly.
5. **The state is a Firestore document id, so one Google log type could still record it.** The headline of
   this section is that the code and the nonce are out of every backend URL, and that holds. It does not
   hold for the **state**: `states().doc(state)` makes it a document id (`beginEbayConnect`,
   `claimEbayConnectState`, the callback transaction and the `connectionId` merge), and **Firestore Data
   Access audit logs record the full document path in `protoPayload.resourceName`**. Those logs are
   **off by default** on a Google Cloud project and this is not a regression — the state has been the
   document id since the connector was written — but the claim "these values are in no log we control"
   has to be checked rather than assumed, because this section itself treats a state as half an attack: a
   key holder gets *a state oracle*, and a log reader who can also mint a state *has the whole of the
   defence*. **One operator check, before the first sandbox connection:** confirm that Data Access audit
   logs (`DATA_READ` / `DATA_WRITE`) are not enabled for Firestore on `eggcraft-studio` — IAM → Audit
   Logs → Cloud Firestore API — and record the answer in `docs/ebay-callback-platform-logging.md`, beside
   the Cloud Run finding. If they ever are enabled, the state joins the code in a log, and the mitigation
   is the same one residual 1 names: the state is single-use and burned at first presentation, so a log
   reader has an oracle and a denial, not a connection. Hashing the state to derive the document id would
   close it and is an **owner** decision, not part of this transport change.

Two things are recorded as **verified correct** so a later reviser does not re-litigate them: every one of
the eight reason words plus `cancelled` still reaches the seller as a translated sentence
(`EbayIntegrationSection.tsx:88-90`, with `unavailable` falling through to a string that already exists in
all eleven non-English tables at `language.ts:7982`); and state consumability under transport failure is
sound — `unreachable`, 401, 405 and 400 all leave the state consumable, and only the 20-second abort is
genuinely indeterminate. What that abort leaves indeterminate is the screen, not the data, and the single
`refresh(true)` fires too early to resolve it on its own; pressing Connect again reconnects onto the same
deterministic row, which is the recovery (see *Timeouts*).

---

## 6. Token refresh and boxing (§19, §59, §73)

- `clientFor(ref)` reads `credentials/current`, `unbox`es the access token (`decryptToken(box,
  tokenKeys())`, loud failure = `token_unreadable`, auth-class), and refreshes ahead of expiry when
  `accessTokenExpiresAtMs − now < 10 min` (eBay tokens live ~2 h; Square's 3-day lead is wrong here).
- **Two-key secret encoding** (the improvised-at-2 a.m. rule): `EBAY_TOKEN_KEY` and `EBAY_HASH_KEY`
  are strings of **one or two keys separated by whitespace or a comma**
  (`/[\s,]+/`); `commerce/ebay/keys.js` `keyListOf(secret)` splits, trims, drops blanks, refuses more
  than two entries, and validates **each** entry with `tokenKeyBytes` (exactly 32 bytes as 64 hex or
  base64) at first use — a bad entry throws at the first call, never silently at rotation. **The first
  entry is the write key**; the second is read-only (`tokenBox.tokenKeyList` order). Rotation =
  put the new key first and the old key second, deploy, wait for `tokenNeedsRebox` to move every
  box (each credential is re-boxed on its next successful read; the sweep touches every connected
  row within 15 min), then remove the second entry. `commerce-ebay-keys.test.js` pins: one key,
  two keys with either separator, three keys refused, a 31-byte entry refused, write key is index 0.
- **Single-flight**: `runTransaction` claims `refreshLockUntilMs = now + 90 s` (must outlast one refresh
  attempt chain: 3 attempts × 20 s); the loser re-reads after the winner and **refuses an expired
  token** with `unavailable "The eBay connection is being refreshed. Try again shortly."`. Refresh =
  `POST /identity/v1/oauth2/token grant_type=refresh_token` with Basic auth and the stored `scopes[]`
  (equal to the granted set — §1); store `accessTokenEncrypted`, `accessTokenExpiresAtMs`, the rotated
  `refreshTokenEncrypted` when eBay returns one, `refreshedAtMs`, and clear the lock in the same
  `set(merge)`. The mirrors `accessTokenExpiresAtMs` / `refreshTokenExpiresAtMs` on the connection doc
  are updated for the public view.
- One forced refresh on a 401 mid-call (`onUnauthorized`), then give up for this pass.
- **Failure classification — by body, in `oauth.js` `classifyTokenError(status, body)`** (the module
  contract; the connector never classifies a token error itself):

  | token endpoint answer | thrown as | effect |
  |---|---|---|
  | body `error === "invalid_grant"` (HTTP **400** per eBay; also accepted at 401) | `errorClass:"auth"`, `code:"invalid_grant"` | `status → "reconnect_required"`, `lastErrorCode:"credentials_rejected"`, `syncLog reauthorization_required` |
  | body `error ∈ { invalid_client, unauthorized_client, invalid_scope }` (our keyset / RuName / scope list is wrong — e.g. at the sandbox-to-production flip) | `errorClass:"permission"`, `code:"app_credentials_invalid"` | **status unchanged**; `lastErrorCode:"app_credentials_invalid"`; `syncLog app_credentials_invalid`; `console.error("ebay: application credentials rejected")` (ops alert line, one per sweep); the sweep stops after the first such connection — one bad secret must not touch every row |
  | HTTP 429 / 5xx / network | `errorClass:"transient"` | `lastErrorCode: rate_limited \| provider_unavailable`; status unchanged |
  | HTTP 400 with any other `error` (`invalid_request`, unknown) | `errorClass:"validation"`, `code:"token_request_invalid"` | **status unchanged**; `lastErrorCode:"token_request_invalid"`; ops log — a malformed request is our bug, not the seller's |
  | `token_unreadable` (box cannot be opened under any offered key) | `errorClass:"auth"` | `reconnect_required`, `lastErrorCode:"token_unreadable"` |

  The Square precedent (`squareConnector.js` 124) flips on `validation` too and is **not** copied:
  a 400 from a misconfigured keyset must never mark a seller `reconnect_required`. `events.classifyError`
  is not consulted for token-endpoint answers; it is used for API calls. `commerce-ebay-oauth.test.js`
  pins the table with **HTTP 400 bodies** for `invalid_grant` and `invalid_client`; the e2e (#9) uses a
  400 `invalid_grant` body, not a 401 status.
- **Only** an auth-class failure (`invalid_grant`, 401 after refresh, `token_unreadable`) flips
  `status → "reconnect_required"`; everything else records `lastErrorCode` + `lastErrorAtMs` and leaves
  `status` alone (spec: 401 → refresh/reauth; 403 → permission task `lastErrorCode: "permission_missing"`;
  429 → provider retry guidance).
- **Refresh-token lifecycle monitoring** (§73): the sweep flips `reconnect_required` with
  `lastErrorCode: "refresh_token_expiring"` 14 days before `refreshTokenExpiresAtMs`, and the public
  view carries `reauthorizeByMs` so the card can say "Reconnect before <date>".
- Tokens never enter logs, `syncLog`, `commerceEvents`, analytics, the public view, the assistant corpus
  or any prompt (§19, §85 #25). Sanitized errors only (`events.outcomeForError`).
- **Application token** (client-credentials, used only by the notification gateway for the signing
  key): held **in process memory only** (`{ token, expiresAtMs }` module variable, refreshed 60 s
  before expiry), never written to Firestore, never boxed at rest, never returned by any callable.
  A cold instance mints a new one (one call).
- eBay has no revoke endpoint: `disconnectEbay` deletes the credentials doc and sets
  `status:"disconnected", hasCredentials:false, disconnectedAtMs, disconnectedByUid: uid,
  disconnectReason:"owner"`. The sweeps, Sync now, import and the worker all refuse a non-`connected`
  row, which is how "provider disconnect background jobs'u durdurur" holds (review Q18); an in-flight
  pass re-reads the connection before writing its summary and aborts when it is no longer connected.

---

## 7. Sync (§23–24, §55–57, §61)

### 7.1 One reconciliation pass — the exact sequence

Entry: `reconcileEbayConnections` (every 15 min: `where("status","==","connected")`, then in memory
`data.environment === environment()` (else `lastErrorCode:"environment_mismatch"`, `syncLog
environment_mismatch`, skipped — §7.7), `settings.autoSync`, per-connection flag on,
`rateLimitedUntilMs < now`, oldest `lastSyncAtMs` first, `MAX_CONNECTIONS_PER_SWEEP = 25`) or
`syncEbayNow` (`force:true`, `lookbackMs: 24 h`, lock). Both call
`reconcileConnection(ref, data, { force, lookbackMs, maxPages: 4, pageSize: 200, eventOrigin: "reconcile" })`.
Page size is eBay's documented maximum (**200**, §1), so one pass reads up to **800** orders before
bisecting — four times the first draft's 200.

1. `client = clientFor(ref)` (§6). Auth-class failure here → `reconnect_required`, rethrow so the sweep
   counts one failed connection and moves on. `app_credentials_invalid` → rethrow with that code; the
   sweep **stops** (one bad secret, one log line, no row touched).
2. `cursor = cursors.readCursor(db, "ebay", ref.id, "order")`; `window = cursorPlan.catchUpWindow(cursor,
   data, now, { force, lookbackMs })` → normally `cursors.cursorWindow` = `[watermark−10min .. now]`, with the
   24 h `maxWindowMs` capping only how much of that range **one pass** may cover, never where the next pass
   starts: a watermark older than 24 h is worked forward pass by pass, and step 3's bisection is what keeps
   the watermark honest inside each pass. On a connection with no cursor at all the first pass is
   `[now−24h .. now]` (the owner's backfill is `runEbayImport`, not the sweep) — **except**
   when `data.catchUpDueFromMs > 0` (reconnect / flag-on / long pause, §7.6), in which case
   `fromMs = catchUpDueFromMs − 10 min` regardless of the 24 h cap, and the pass runs as a catch-up
   (`eventOrigin:"catch_up"`, sub-windowed by §7.6).
3. **Page loop with bisection** (`cursorPlan.bisect`): read `client.getOrders({ lastModifiedFromIso,
   lastModifiedToIso, limit: 200, offset })` with `fieldGroups=TAX_BREAKDOWN`; stop on empty page /
   no `next`; when `pages ≥ maxPages` and `next` is still present the **window is too big**, and
   because eBay's result order is unspecified (§1) the Etsy trick (advance to the last-seen
   modification time) is unavailable. So: discard nothing already applied (every order applied so far
   is idempotent), split `[fromMs..toMs]` at the midpoint, and re-run the loop on `[fromMs..midMs]`
   with a fresh page budget; a sub-window that completes is recorded with `recordPass(complete:true,
   toMs: midMs)`, moving the watermark to `midMs`; then continue with `[midMs−10min..toMs]`. Recurse
   at most `MAX_BISECTIONS = 6` times per pass (a 24 h window halves to ≈ 22 min); when the budget
   (`pages`, `MAX_BISECTIONS`, or 400 s of the 540 s timeout) is exhausted the pass ends **truncated
   at the first sub-window that did not complete**, and the watermark stands at the end of the last
   completed sub-window — never at `now`. Because the watermark moves through completed sub-windows,
   `cursorWindow`'s 24 h `maxWindowMs` cap can no longer slide past unread orders: the next pass
   starts at the watermark, not at `now − 24 h`. `syncLog sync_bisected { subWindows }`.
   Quota is charged **before** each call (`commerce/ebay/quota.js`); a 429 sets `rateLimitedUntilMs =
   now + parseRetryAfter(...) || 15 min`, marks the pass incomplete and ends the loop.
4. Per order (never rethrow inside the loop): `scanned++`; `eventKey = events.idempotencyKey({ provider:
   "ebay", connectionId: ref.id, externalId: String(order.orderId), eventType: `${eventOrigin}@${order.
   lastModifiedDate || ""}` })`; `outcome = applyEbayOrder(ref, data, order, { eventKey, eventOrigin,
   client })`; count by `outcome.result`; a throw → `failed++` + `syncLog order_import_failed` (sanitized).
5. `applyEbayOrder(ref, data, order, { eventKey, eventOrigin, client, fulfillments? })` — **the one
   policy layer every path uses** (sweep, Sync now, import, queue, held release; MERGE-006):
   a. `data.status !== "connected"` → `{ result:"skipped", reason:"connection_<status>" }` (re-read, not
      the sweep's snapshot — a disconnect mid-pass stops writes).
   b. `fulfillments = opts.fulfillments ?? (order.orderFulfillmentStatus === "NOT_STARTED" ? [] : await client.getShippingFulfillments(orderId))`
      — the adapter builds shipments from nothing else; tracking otherwise never fills and
      `shipmentPatch` never flips `isDispatched`.
   c. `{ safe, restricted, removed } = splitEbayOrder(order, fulfillments)` (§8.1). `scanForPii(safe)` —
      the **eBay** scanner — is the trip-wire: anything personal left in `safe` →
      `{ result:"invalid", problems:["pii_in_safe_half", ...paths] }` and a `console.error` naming the
      paths (never the values) — never an apply.
   d. `envelope = normalizeEbayOrder(safe, { connectionId: ref.id, accountName: data.sellerUsername,
      marketplaceId: safe.lineItems?.[0]?.listingMarketplaceId || data.registrationMarketplaceId,
      eventOrigin, rawSnapshotRef: eventKey, fulfillments: safe.fulfillments })` — `marketplaceId` **is**
      passed, so `external_admin_url` lands on the order's own site (§8.3). Seen marketplace ids are
      merged into `marketplaces[]` (enabled `true`, currency from `pricingSummary.total.currency`).
   e. `externalId = envelope.identity.external_id`; missing → `invalid`.
   f. `docId = ebayOrderDocId(companyId, externalId) = "ebay_" + safeIdPart(companyId) + "_" + safeIdPart(externalId)`.
   g. Create-time policy (only when the order doc does not exist): `!settings.autoSync && eventOrigin
      !== "import"` → `skipped auto_sync_off`; `order.orderPaymentStatus === "PENDING" && !settings.
      includeUnpaid` → `skipped awaiting_payment` (checkout-complete but unpaid keeps provider
      semantics, §23 — it reappears in the window when payment lands because `lastModifiedDate`
      moves); `envelope.order.platform_status === "cancelled" && !settings.includeCancelled` →
      `skipped cancelled_not_imported`; marketplace disabled in `marketplaces[]` → `skipped
      marketplace_disabled`; `importState !== "done" && eventOrigin !== "import"` → `skipped
      awaiting_first_import`. Updates to an existing order are always applied.
   h. `settingsSnap = companySettingsDocRef(companyId).get()`;
      `outcome = engine.applyEnvelope(db, envelope, { companyId, mode:"apply", source:"ebay", eventKey,
      orderIdFor: () => docId, defaultDeliveryTime: resolveDefaultDeliveryTime(settingsSnap.data()),
      defaultStatus:"Not Yet", syncCancellations:true, reconcileLineItems,
      capacity: async () => integrationOrderCapacity(companyId, (await companyRef.get()).data() || {}),
      hold: async (env, capacity) => holdIntegrationOrder(companyId, "ebay", env.identity.external_id, safe, capacity, { ebayConnectionId: ref.id, eventType: eventOrigin }) })`.
      The engine does the rest in order (§10 pipeline): validate → identity (workspace-bound, DATA-002)
      → duplicate (`lastEventKey`) → stale (`externalUpdatedAt`) → capacity/hold → create/update with
      the `commerce` stamp and review row. Stale-guard order (§57) = provider `lastModifiedDate` →
      content hash → event key; eBay has no version number.
   i. On `created | updated | noop`: the `ebayBuyers` index `arrayUnion(docId)` under the keyed hash
      of `safe.buyer.username` **whenever that handle is present**, and — separately, **only when the
      restricted half is non-empty** — `restrictedCustomer/{docId}.set(merge)` with the restricted half
      (+ `deliveredAtMs` when the engine reports delivery, for §8.4). The two are not one condition: an
      order with no address (digital, collect-in-person, or one eBay has already stripped) still names
      the buyer on `customerName`, `shippingName` and `customFields["eBay Buyer"]`, and §9 finds orders
      through the index alone — tying the index to the restricted half left such an order carrying the
      username after eBay had said to erase it. An empty restricted half writes and deletes no
      restricted document (a replay from a stored safe payload must not blank a real address — §7.3).
      On `created`:
      `sendPushNotificationToCompany(companyId, { title:"New eBay order", body: "<orderId> · <currency>
      <total>", orderId, type:"ebay_order" })` and `syncLog order_imported`; on review required →
      `syncLog order_needs_review`. No customer upsert.
   j. Return the outcome. `UNKNOWN_ON_UPDATE_BY_SOURCE` gets **no** `ebay` entry (null → nothing extra
      skipped); the adapter writes no placeholders that would need one.
6. After the loop: per completed sub-window `recordPass(complete:true)` was already called; for the
   pass as a whole `complete = !truncated && failed === 0 && !rateLimited`; a final
   `cursors.recordPass(db, { provider:"ebay", connectionId: ref.id, entityType:"order", companyId,
   fromMs: lastSubWindow.fromMs, toMs: lastSubWindow.toMs, complete, scanned, applied: created+updated,
   failed, truncated, now })` records the last sub-window (its watermark moves only if it completed).
   `failed > 0` inside a sub-window marks **that** sub-window incomplete (its watermark does not move,
   spec §56), the earlier completed ones stand.
7. `health.touchHealth(db, { provider:"ebay", connectionId: ref.id, companyId, entity:"orders",
   kind: complete ? "success" : "attempt", now, FieldValue })`.
8. `ref.set({ lastSyncAtMs, ...(complete ? { lastSuccessAtMs, lastVerifiedAtMs, lastErrorCode:"",
   catchUpDueFromMs: 0 } : { lastErrorCode: failed ? "partial_pass" : rateLimited ? "rate_limited" :
   "truncated", lastErrorAtMs }), lastReconcile:{ orders:{ all numbers }, truncated, subWindows, atMs },
   updatedAt }, { merge:true })` + `syncLog sync_completed | sync_partial`. `truncated` is in the
   **benign** set (§10): the watermark advanced through what was read and the next pass continues.
9. Return `{ outcome, truncated, window, subWindows }`.

### 7.2 Backfill and preview (§55 initial backfill, §69 Import Preview) — resumable, oldest-first-safe

Both walk `creationdate:[since..now]` in **7-day slices, oldest slice first**, each slice paged at
`limit=200` until `next` is absent. A slice is the unit of completeness; getOrders' unspecified order
inside a slice does not matter because a slice is always read to its end or not counted at all.

- `previewEbayImport({ sinceDays })` (owner, lock): counts `ordersFound`, `duplicatesPrevented`
  (identity doc already exists for the external id), `unpaid`, `cancelled`, marketplaces seen; page
  budget 20 pages (4,000 orders) or 120 s, then `truncated:true` with `windowsScanned`; writes nothing
  but `syncLog`. The preview is an estimate and says so on the card when truncated.
- `runEbayImport` (owner, lock 10 min): `importState:"running"`, `importCursor` initialised
  `{ sinceMs, untilMs: now, sliceFromMs: sinceMs, sliceToMs: min(sinceMs+7d, untilMs), offset: 0,
  includeUnpaid, includeCancelled, failedIds: [] }`, `syncLog import_started | import_resumed`. Walk:
  for the current slice, page from `offset`; each order → `applyEbayOrder(..., { eventOrigin:"import" })`
  (bypasses `autoSync` and `awaiting_first_import`, honours the explicit flags for this run only);
  a throw → `failedIds.push(orderId)` (≤ 500 kept), `failed++`; after each page persist
  `importCursor.offset`; after a slice persist `sliceFromMs/sliceToMs` advanced by 7 days; stop when
  `sliceFromMs ≥ untilMs` (complete) or at 480 s of the 540 s budget (**not** complete: `importState`
  stays `"running"`, `importCursor` points at the next page, the reply is `{ complete:false,
  resumeFromMs }` and the card shows "Import paused — press Import again to continue"; the next
  `runEbayImport` call with the same connection **resumes** from the cursor instead of restarting).
- On completion: retry `failedIds` once (by `getOrdersByIds`, 50 per call); ids that fail again stay
  in `importCursor.failedIds` and are surfaced on the card ("N orders could not be imported — Retry")
  through `retryEbayImportFailures` (owner; same lock), and the connection's `lastErrorCode` is
  `partial_pass` until the list is empty. **Only when `complete && failedIds.length === 0`**:
  `importState:"done"`, `importCounters`, `syncLog import_finished`, and the cursor is **seeded** with
  `recordPass({ fromMs: importStartMs − 10 min, toMs: importStartMs, complete: true })` so the sweep
  continues from the moment the import began. With failures outstanding the cursor is **not** seeded
  and `importState` stays `"running"` — the sweep keeps skipping (`awaiting_first_import`) rather than
  taking a 24 h lookback that would miss the failed ids; the card says so.
- Nothing lands automatically before the owner ran the first import (Etsy rule).

### 7.3 Held orders (plan capacity)

`releaseHeldIntegrationOrders` gains `else if (provider === "ebay")`: look the connection up by
`extra.ebayConnectionId` (fallback: the workspace's single connected eBay row); require
`status === "connected"`; then **hand the row to `ebayEventWorker`** as an ordinary order task
(`eventType:"release"`, `eventOrigin:"retry"`, one idempotency key per row) and leave it parked.
The worker **fetches fresh** — `client.getOrder(externalId)` + `getShippingFulfillments` — and lands it
through the one `applyEbayOrder`, which clears the held row once the order exists. The stored safe
payload is **never** replayed: it has no address, so replaying it would land an order whose
`restrictedCustomer` could never be filled (and step 5.i's empty-half guard would leave it
address-less forever).

It is handed over rather than done here because `releaseHeldIntegrationOrders` is a **shared,
general-purpose callable**: it cannot wear the `ebay-connector@` identity, and §3.2 and
`access-control-policy.md` both say the secrets and the identity travel together, so it cannot mount
`EBAY_TOKEN_KEY` either. Calling `clientFor` from it therefore threw `No eBay key is configured.` on
the first row, into the branch's own catch, which wrote `releaseError`, counted the row `unknown` and
reported a benign 'left in place' — an eBay order held by a plan limit could never be imported, even
after the owner upgraded, until its 90-day `expireAt` deleted it. `retryCommerceEvent` had already
established the fix (re-enqueue rather than process inline); this path uses it. The callable's result
counts these apart as `queued`, because the sale is on its way in, not in.

When the connection is gone or not connected, or the queue refuses the task, the row is **left held**
with `releaseError` and retried on the next release; a 404 after the 90-day `expireAt` lets it expire.
The held row is marked (`releaseQueuedAtMs`, `releaseTaskKey`) **before** the hand-off, never after:
the worker deletes it the moment the order lands, and a mark written afterwards would recreate it as a
payload-less zombie. The trip-wire is in `access-control-policy.test.js`: any function reaching
`ebayExports._internal` must spread `EBAY_RUNTIME`.

### 7.4 Rate limiting (§61) — per connection first, app-wide second

`commerce/ebay/quota.js` (Etsy's `etsyQuotaVerdict` shape, eBay numbers): `ebayQuota/{YYYY-MM-DD}`
`{ calls, byConnection:{ [id]: n }, byFamily:{ orders: n, fulfillments: n, identity: n, notification: n } }`
— nested maps, never dotted keys; charged **before** the request. `quotaVerdict({ total, connection,
perDay: NIVADESK_EBAY_DAILY_CAP })` (pure): `share = floor(perDay × 0.10)` per connection per day;
`connection ≥ share` → `{ allowed:false, reason:"connection_share_spent" }` (the seller's own card says
"This account has used its eBay allowance for today; sync resumes tomorrow" — `lastErrorCode:
"rate_limited"`); `total ≥ floor(perDay × 0.95)` → `app_budget_spent`; the sweep stands down at 75 %,
the nightly pass and import at 80 %, Sync now / verify / preview serve people up to 95 %. A member
pressing Sync now can therefore spend at most its own connection's tenth, never another workspace's
sweep. Per-connection `rateLimitedUntilMs` after a 429; rolling usage surfaces on the health view as
`quota: { today, share, cap }`. Never the Amazon bucket, never Etsy's numbers. `commerce-ebay-quota.test.js`
pins the verdict table.

### 7.5 Event/queue path — `ORDER_CONFIRMATION` and the eBay worker

**Decision on topics (§85 #21):** eBay's only seller-facing order topic is `ORDER_CONFIRMATION`
(create/payment-cleared, one notification per line item, user-token subscription — §1). There is no
seller topic for updates, cancellations or shipments; those stay on polling. Legacy Trading API
Platform Notifications are **out of scope** (a second transport, SOAP, no signature model). Event
support is therefore: this half ships the gateway and the task shape; the subscription itself
(`POST /commerce/notification/v1/subscription` with the **seller's** token, one per connection,
`notificationSubscriptionId` stored) lands in the follow-up commit after the sandbox payload has been
captured into `test/fixtures/ebay-sandbox-order-confirmation.json`, because the routing key below has
to be read from a real payload, not guessed.

Routing: the notification's `notification.data` carries the order id and line item id; the seller is
identified by the **subscription** it was delivered under, not by a payload field — so the gateway
resolves `connectionId` from `ebayConnections where notificationSubscriptionId == <data.subscriptionId
or metadata equivalent — field name pinned from the fixture>`, falling back to a seller identifier in
`data` if the fixture shows one. Unknown subscription → 200 `skipped unknown_subscription` + warning.
A connection that is `reconnect_required` receives the task and the worker records it `retrying` with
`errorClass auth` (Square rule) so it applies after reconnect.

Gateway POST for an order topic: verify (§9) → route → claim `deliveries/{notificationId}` → `task = {
key: events.idempotencyKey({ provider:"ebay", connectionId, eventId: notificationId, externalId: orderId,
eventType: topic }), provider:"ebay", connectionId, companyId, entityType:"order", externalId: orderId,
eventType: topic, attempt:1, eventOrigin:"provider", correlationId: events.newCorrelationId() }` →
`worker.recordReceived(db, task, { status: "queued" })` → `health.touchHealth(kind:"webhook")` →
`enqueueEbayTask(task, 0)`; if enqueue throws, apply inline and on failure delete the claim so eBay's
retry is not a "duplicate". "Notification event latest state yerine geçmez" (§24): the payload is only
an address; the order is always refetched. Reconciliation keeps running regardless (missed
notification → the window finds it).

`processEbayCommerceTask(task)` — the only entry of `ebayEventWorker`:
```js
if (task.entityType === "buyer_deletion") return processEbayBuyerDeletion(task);   // §9: never gated, no connection, no health
const { ref, data } = await loadConnectionForTask(task);   // must be connected, else throw { errorClass: data?.status === "reconnect_required" ? "auth" : "validation" }
if (!connectorOn() || !(await flagOn(ref.id))) return worker.skip(db, task, "connector_off");   // records `skipped`, no fetch
const client = await clientFor(ref);
return worker.processCommerceEvent(db, task, {
  fetchLatest: async () => {
    const order = await client.getOrder(String(task.externalId));           // 404 → null → not_found (dead after 1)
    if (!order) return null;
    const fulfillments = order.orderFulfillmentStatus === "NOT_STARTED" ? [] : await client.getShippingFulfillments(order.orderId);
    return { order, fulfillments };
  },
  normalize: (raw) => raw,                                                    // identity: the split + adapter live inside applyEbayOrder
  apply: (raw) => applyEbayOrder(ref, data, raw.order, { eventKey: task.key, eventOrigin: task.eventOrigin || "provider", client, fulfillments: raw.fulfillments }),
  retryAfterOf: (e) => events.parseRetryAfter(e?.retryAfter), now
});
```
`worker.processCommerceEvent` calls `normalize` synchronously and without `await`, which is why the
fulfilment fetch lives in `fetchLatest` and the adapter call lives in `apply`; the first draft's
`normalize: (raw) => normalizeEbayOrder(splitEbayOrder(raw, fulfillments).safe, ctx)` referenced a
`fulfillments` that did not exist in that scope and skipped every gate in `applyEbayOrder`. The
worker loop in `index.js` switches on `result.status` (`applied | retrying | dead | …`) and re-enqueues
on `retrying`; `processEbayBuyerDeletion` returns `{ status: "applied" | "retrying", nextRetryInMs? }`
in that shape (§9), and the loop's `touchHealth` is skipped when `task.entityType === "buyer_deletion"`
(a task with no `connectionId` would otherwise write a junk `commerceHealth/ebay__` document).
`ebay-sync.test.js` "queue path and sweep path agree": the same fake order through both entries yields
the same order document, the same `restrictedCustomer` document and the same `ebayBuyers` row.

### 7.6 Nightly reconciliation and forced catch-up (§55 "Full reconciliation: nightly, overlap window")

`reconcileEbayConnectionsNightly` (02:40 Europe/London, low priority — stands down at 80 % of the daily
cap, `MAX_CONNECTIONS_PER_SWEEP = 25`, oldest `lastFullReconciliationAtMs` first, every eligibility
filter of §7.1):
1. **Lookback pass:** `window = cursorPlan.nightlyWindow(now, data.lastFullReconciliationAtMs)` =
   `[max(now − 7 d, lastFullReconciliationAtMs − 24 h) .. now]` on `lastmodifieddate`, walked in
   **24 h sub-windows oldest first** with the §7.1 loop (bisection included); the common cursor is
   **not** moved by this pass (it belongs to the 15-minute sweep) — the pass records itself on the
   connection only. Orders it finds are idempotent applies (`duplicate`/`noop` for the ones the sweep
   already had). Budget 480 s; on exhaustion the remaining sub-windows carry to the next night.
2. **Fulfilment follow-up:** every order of this connection created in the last 30 days whose
   `commerce.fulfillmentStatus !== "fulfilled"` (query on `siparisler` by `commerce.connectionId` +
   `commerce.fulfillmentStatus`, ≤ 500) is re-read in batches of 50 with `getOrdersByIds` and
   `applyEbayOrder(..., { eventOrigin:"nightly" })` — so tracking arrives even if creating a shipping
   fulfilment does not move `lastModifiedDate` (§1, UNVERIFIED and hedged here).
3. `lastFullReconciliationAtMs = now` when both steps completed; `syncLog nightly_completed
   { scanned, applied, followUps }`; `health.touchHealth(kind:"success")` only when complete.

**Forced catch-up** (rollback proof, reconnect story): `catchUpDueFromMs` is set on the connection
(a) at reconnect (§5) to the stored watermark, (b) when the per-connection or provider flag turns from
off to on — detected by the sweep as `flagOn && data.lastFlagState === false` (the sweep writes
`lastFlagState` on every visit), (c) when a connection has been `rateLimitedUntilMs`,
`reconnect_required` or `environment_mismatch` for more than 24 h (`lastSuccessAtMs < now − 24 h`)
and becomes eligible again, and (d) when a connection's watermark has stood still under repeated
truncation — three consecutive passes recorded `truncated` without the watermark moving — so a window
too dense for the page budget is re-walked from the watermark in sub-windows rather than waiting for
the nightly seven-day pass to notice. The next §7.1 pass then starts at `catchUpDueFromMs − 10 min` in 24 h
sub-windows oldest first (bisection applies inside each), records each completed sub-window, clears
`catchUpDueFromMs` when it reaches `now`, and writes `syncLog catch_up_completed`. e2e #10 asserts:
flag off for a simulated 36 h with three orders modified meanwhile → flag on → the next pass applies
all three and the watermark ends at `now` (not `now − 24 h`). The guide sentence "once more each
night with an overlap" (§13) is therefore true and stays.

### 7.7 Sandbox-to-production flip

`environment()` is read at call time; every row carries `environment`. After the flip (the single
`EBAY_CLIENT_ID/SECRET` pair now holds the production keyset), rows whose `environment !==
environment()` are **skipped by both sweeps, Sync now, import, preview and the worker** with
`lastErrorCode:"environment_mismatch"` (spec status `suspended`, card: "This eBay connection belongs
to the sandbox. Disconnect it and connect your live account.") — never called against `api.ebay.com`
with a sandbox token, never flipped to `reconnect_required`. Owner action at the flip (§15): disconnect
and purge every sandbox row (`disconnectEbay` per row, then `purgeEbaySandboxRows` — an owner-run
script that deletes rows with `environment:"sandbox"`, their subtrees, their `ebayBuyers` entries and
their imported orders' `restrictedCustomer` docs; the sandbox orders themselves are deleted with the
sandbox workspace). Deletion notifications are environment-independent and keep working across the flip.

---

## 8. PII minimisation (§25, §63, §73)

### 8.1 Split first, adapt second — eBay's own path list and scanner

`commerce/ebay/sanitize.js` is **not** a mirror of `commerce/amazon/sanitize.js`: the Amazon scanner
recognises PascalCase SP-API names (`Name`, `AddressLine1`, `BuyerEmail`, …) and would let every
camelCase eBay field through untouched, so its `pii_in_safe_half` guarantee would be hollow here.
The eBay module carries its own lists, and the Amazon module is untouched.

`splitEbayOrder(order, fulfillments)` → `{ safe, restricted, removed }`:

| Path (`ORDER_PII_PATHS` / `LINE_ITEM_PII_PATHS` / `FULFILLMENT_PII_PATHS`) — removed to `restrictedCustomer.fields` | Kept on the safe half |
|---|---|
| `buyer.buyerRegistrationAddress` (`fullName`, `companyName`, `email`, `primaryPhone`, `contactAddress`) | `buyer.username` (the pseudonymous handle eBay itself shows the seller) |
| `buyer.taxAddress`, `buyer.taxIdentifier` (`taxpayerId`, `taxIdentifierType`, `issuingCountry`) | — |
| `buyerCheckoutNotes` (free text written by the buyer — an address in prose more often than not) | — |
| `fulfillmentStartInstructions[].shippingStep.shipTo` (`fullName`, `companyName`, `email`, `primaryPhone.phoneNumber`, `contactAddress.{addressLine1,addressLine2,city,stateOrProvince,county,postalCode}`) | `fulfillmentStartInstructions[].shippingStep.shipTo.contactAddress.countryCode` — the **one deliberate exception** (VAT/delivery logic; a country is not a person), plus `shippingServiceCode`, `shippingCarrierCode`, `fulfillmentInstructionsType`, `minEstimatedDeliveryDate`, `maxEstimatedDeliveryDate` |
| `fulfillmentStartInstructions[].pickupStep` (all fields), `fulfillmentStartInstructions[].finalDestinationAddress` | — |
| `lineItems[].giftDetails` (`message`, `senderName`, `recipientEmail`, `recipientName`) | `lineItems[]` otherwise (sku, listing ids, `title`, `variationAspects`, costs, taxes, `listingMarketplaceId`) |
| `lineItems[].title` / `variationAspects[]` **values** when `PII_KEY_NAMES` or the value scanner flags them (personalisation typed by the buyer: "Engrave: John & Mary", an email, a phone) — the line keeps `title` replaced by `"[personalised item]"` and the original goes to `fields.lineItems[i].title` | everything else in `lineItems[]` |
| `fulfillments[].shipTo`, `fulfillments[].contact*` and any key in `PII_KEY_NAMES` inside a fulfilment | `fulfillments[]` otherwise (`fulfillmentId`, `shippingCarrierCode`, `shipmentTrackingNumber`, `shippedDate`, `lineItems[].{lineItemId,quantity}`) |
| any key matched by `PII_KEY_NAMES` **anywhere** (unknown/new fields) | `pricingSummary`, `paymentSummary` (method/status/reference ids), `cancelStatus`, `orderFulfillmentStatus`, `orderPaymentStatus`, dates, `salesRecordReference`, `sellerId`, `legacyOrderId`, `ebayCollectAndRemitTaxes[]`, `taxes[]` |

`PII_KEY_NAMES = /^(fullName|firstName|lastName|companyName|email|recipientEmail|phoneNumber|primaryPhone|secondaryPhone|addressLine1|addressLine2|city|stateOrProvince|county|postalCode|contactAddress|shipTo|buyerRegistrationAddress|taxAddress|taxIdentifier|taxpayerId|finalDestinationAddress|buyerCheckoutNotes|giftDetails|senderName|recipientName|message)$/`
— `countryCode` is deliberately **absent** from this list; `city`/`stateOrProvince`/`postalCode`
are present so an `itemLocation` (the **seller's** own postcode) is also stripped rather than argued
about. Removal is by path first (structured, exact) and by key name second (defence for fields the
list does not know), with `removed[]` listing paths only.

`scanForPii(value)` — the **eBay** trip-wire, run on `safe` after the split:
- any key matching `PII_KEY_NAMES` with a non-empty value → found (path);
- any string that looks like an email (`/[^\s@]+@[^\s@]+\.[^\s@]+/`), a phone (`/(?:\+|00)?\d[\d\s().-]{7,}\d/`
  with ≥ 8 digits, outside keys named `*Id`, `*Number`, `orderId`, `legacyOrderId`, `lineItemId`,
  `shipmentTrackingNumber`, `salesRecordReference`, `referenceId`), or a UK/EU/US postcode
  (`/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/`, `/\b\d{5}(?:-\d{4})?\b/` outside the id keys) → found;
- the allow-list: a `countryCode` key with a two-letter value is **not** found (the exception is
  named in the test).
The scanner is a check on the list, not a replacement for it: it is what turns a new eBay field into
a loud `pii_in_safe_half` instead of a document eleven people can read.

**Fixtures — captured, not hand-written.** `test/fixtures/ebay-sandbox-order.json` and
`ebay-sandbox-fulfillments.json` are the literal responses of `getOrder` and `getShippingFulfillments`
for a sandbox order the owner places on the sandbox seller with: a phone number, an `addressLine2`, a
`companyName`, `buyerCheckoutNotes`, a gift message with sender/recipient names, a personalised
variation aspect, and two line items; the files carry a `_captured: { environment:"sandbox",
capturedAt, apiVersion:"v1", orderId, lastModifiedMovedOnFulfillment: true|false }` header (that last
flag records the §1 UNVERIFIED fact as observed). `commerce-ebay-sanitize.test.js` **refuses to pass**
on a fixture without `_captured` (the hand-written stand-in used while iterating is named
`ebay-synthetic-order.json` and is only used by the adapter tests). The sanitize test plants — in
addition to the fixture's own values — an email, a phone, a postcode and a `fullName` at a path the
lists do not name, and asserts each trips `scanForPii`; asserts the split removes every path in the
table and keeps `buyer.username` and `countryCode`; asserts `removed[]` names paths and never values;
asserts fulfilments lose contact fields and keep tracking; asserts the sanitized fixture, run through
the adapter, produces `customer.email === null`, `customer.phone === null`, `shipping_address === null`.
Capturing the fixture is an owner action listed in §15 and is a **gate** on `NIVADESK_EBAY_CONNECTOR=1`
in production.

### 8.2 What the order document carries — the username, decided

The adapter sets `customer.name = shipTo.fullName || buyer.username` and `envelopeToOrder` sets
`customerName = envelope.customer.name || "eBay Customer"` (and `shippingName` likewise). After the
split `fullName` is gone, so the order document carries the **buyer username** as `customerName` and
`shippingName`, and the engine is the only writer (the wiring pin forbids a second `orderDocRef` set).
**Decision: accept the username.** It is the pseudonymous handle eBay shows the seller in Seller Hub,
it is what the seller searches by, and it is not a name, an email or an address. The first draft's
`customerName: "eBay buyer"` is withdrawn; e2e #3 asserts `customerName === buyer.username` and
`customFields["eBay Buyer"] === buyer.username`, `shippingCountry` set, and **no** `emailAddress`,
`shippingPhone`, `shippingStreetAddress`, `shippingCity`, `shippingPostalCode`. `envelope.customer`
is `{ external_customer_id: username, name: username, email: null, phone: null, billing_address: null,
shipping_address: null }`. The `buyer_note` (`buyerCheckoutNotes`) is null on the envelope because
the split removed it; the note is revealed with the address (§3.3 keeps it out of the shipping-identity
payload; a later product decision may add `revealBuyerNotes`).

- `MarketplaceCustomerProfile` (§25) is the `restrictedCustomer` doc plus the index row:
  `{ customerType:"unknown", externalIdentities:[{ provider:"ebay", connectionId, externalId: username }],
  dataOrigin:"ebay", piiPolicy:"provider_restricted", mergeStatus:"unreviewed" }` — recorded as fields on
  `restrictedCustomer` so a later merge feature has its input without a schema change. No automatic
  merge into `musteriler`; no name-only matching; the masked `@members.ebay.com` relay address is never
  used as an identity (§25).
- Reveal is on demand through `revealRestrictedCustomer` (§3.3) — "on-demand for shipping" (§25). The
  order detail's "Channel details" (§69 D) shows the buyer summary as the username + country and a
  *Show address* button.
- Outbound (`privacy/outbound.js` eBay row already): assistant / AI reply / analytics / accounting /
  export **DENY**, messaging MINIMAL. Nothing in this half changes that table; the
  `outbound-pii-policy.test.js` pin stays green.
- Raw snapshots (§63): **not stored** in this half. `rawSnapshotRef` is the event key of the
  `commerceEvents` row (no payload). Unknown fields are not dropped by the adapter (it maps by name and
  leaves the rest) and `schema drift` is reported as a `commerceEvents` safe message when
  `metadata.schemaVersion` on a notification is unexpected. The held-order payload is the safe half.
- Logs never contain the username, email or address; the deletion ledger stores keyed hashes.

### 8.3 The one adapter change: `marketplaceId` for the admin link (test first)

`external_admin_url` uses `ebayMarketplace(ctx.marketplaceId)` only — never the
`lineItems[0].listingMarketplaceId` fallback that `identity.marketplace_id` uses — so with
`marketplaceId` unset every order links to `www.ebay.co.uk`, the exact bug the adapter's own comment
warns about. Fix in two commits: (1) `commerce-ebay-adapter.test.js` gains "a DE order with no
ctx.marketplaceId links to ebay.de, not ebay.co.uk" and fails; (2) the adapter's `external_admin_url`
resolves the host from `ctx.marketplaceId || order.lineItems?.[0]?.listingMarketplaceId` (the same
chain `identity.marketplace_id` already uses). The connector **also** passes `marketplaceId` (§7.1 5.d),
so both layers agree; `dashboard-channels.test.js` and the existing adapter pins stay green.

### 8.4 Retention — 90 days after delivery, by the existing sweep

`privacy/retention.js`: `ebay: { days: 90, reason: "ebay_address_withheld_after_90d" }`. The
justification is eBay's own behaviour: `addressLine1`/`addressLine2` "will not be returned for any
order that is more than 90 days old" (§1) — after that point eBay no longer shows the seller the
address, and NivaDesk holding it longer is not minimisation. What happens at day 90 after
`deliveredAtMs`, through `sweepMarketplacePii` (which already runs one pass per distinct period, so a
90-day eBay pass sits beside Amazon's 30-day pass without stalling it):
- the order's `PII_FIELDS` are scrubbed exactly as for Amazon (`customerName: "Buyer details removed"`
  — the username goes too; the order keeps its money, items, `commerce` stamp and `shippingCountry`);
- **the sweep gains the step policy §5.6 already promises and the code does not yet do**: delete
  `companies/{cid}/restrictedCustomer/{orderId}` in the same iteration (`ordersPiiScrubbed` and
  `restrictedDocsDeleted` counted separately; a missing doc is not an error). This is provider-generic
  and closes the same gap for Amazon; `pii-retention-sweep.test.js` gains the case;
- the `ebayBuyers` entry keeps the order id (it is an id, not PII) so a later account-deletion
  notification still finds and re-scrubs it idempotently;
- `recordPiiAccess({ action:"erased", note:"retention:ebay_address_withheld_after_90d" })` as today.
Undelivered orders are not scrubbed (there is nothing to ship to without the address); an order that
never reaches `deliveredAtMs` keeps its restricted doc until the deletion endpoint or the workspace
purge removes it — recorded here as the deliberate remainder. The PR checklist's "PII impact" line
says "retention 90 days after delivery; restricted doc deleted by the sweep".

---

## 9. Marketplace Account Deletion endpoint (`ebayNotifications`)

One endpoint for every eBay topic, registered once in the developer portal as the notification
destination with the verification token; the deletion subscription and any later order-topic
subscription point at it. `HTTPS` only (Cloud Functions), size limit 256 KB (413 otherwise), sanitized
logging. **No per-IP limiter**: eBay delivers from many source addresses and a limiter tuned for abuse
would throttle genuine bursts ("up to 1500 notifications on any given day", §1) and get the endpoint
marked down. The budget is applied **after** the signature is verified (below).

**GET `?challenge_code=<c>`** (challenge, always on, no secrets needed):
```js
const challengeResponse = crypto.createHash("sha256").update(challengeCode).update(verificationToken).update(endpointUrl).digest("hex");
res.status(200).type("application/json").send(JSON.stringify({ challengeResponse }));   // JSON via a library, no BOM (eBay's warning)
```
`endpointUrl` is `NIVADESK_EBAY_DELETION_ENDPOINT_URL` byte for byte (the URL in the portal — the direct
function URL `https://europe-west2-eggcraft-studio.cloudfunctions.net/ebayNotifications`; no
nivadesk.app forwarder, so the hashed URL and the receiving URL cannot drift). Missing token/URL config
→ 503 `{ ok:false }`; missing `challenge_code` → 200 text "eBay notification endpoint" (Square's GET habit).

**POST** (order of checks, §72 — no business write before validation):
1. Body is JSON, ≤ 256 KB, parses to an object, else 400. `x-ebay-signature` header present and, after
   base64 decoding, a JSON object `{ alg:"ecdsa", kid, signature, digest:"SHA1" }`, else 401
   `{ ok:false, error:"invalid_signature" }` with no detail.
2. **`kid` hygiene before any fetch**: `isValidKid(kid)` = `/^[A-Za-z0-9_-]{8,128}$/`, else 401.
   Negative cache: `ebayNotificationKeys/{kid}` with `{ status:"unknown", at }` (in-memory too) — a
   `kid` eBay answered 404/400 for is 401'd for 6 h without another fetch. Unknown-kid budget:
   `quota.js` family `notification` counts **distinct unknown kids fetched per hour**; above
   `MAX_UNKNOWN_KIDS_PER_HOUR = 20` the endpoint answers **503** (retryable — a genuine key rotation
   inside a flood is redelivered later, and eBay's endpoint-health counter is not tripped by a 401
   storm) and logs `"ebay notifications: unknown-kid budget spent"`. A forged POST with a random kid
   therefore costs at most one API call per distinct kid, twenty per hour, app-wide.
3. Public key for `kid` via `client.publicKey(kid)` using the in-memory application token (§6);
   cached 1 h in memory and 24 h in `ebayNotificationKeys/{kid}` `{ key, algorithm, digest, fetchedAtMs }`
   (server-only; the key is public material, not a secret). **Fetch failure (network, 5xx, application
   token unavailable, secrets absent) → 503**, never 401 — eBay retries and `publishAttemptCount`
   tells the story. Verify per the SDK (§1): `pem = pemOf(body.key)` (insert `\n` after the BEGIN
   marker and before the END marker), `crypto.createVerify("sha1").update(JSON.stringify(req.body))
   .verify(pem, sig.signature, "base64")` — over the **parsed body re-serialised**, exactly as
   `event-notification-nodejs-sdk` does, **not** over `req.rawBody`. Failure → 401.
   `commerce-ebay-notification.test.js` pins the verifier with a vector signed by our own EC P-256 key
   in the test (`crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" })`, sign
   `JSON.stringify(body)` with SHA-1, export the SPKI public key, strip the newlines the way eBay's
   response does, and check that `verifyNotification` accepts it, rejects a byte-changed body, rejects
   a raw-body-with-different-whitespace only when the parsed object differs, and rejects a wrong kid).
   In the e2e the verifier is injected (`deps.notificationVerifier`).
4. **Post-verification budget**: verified notifications per hour app-wide `MAX_VERIFIED_PER_HOUR = 3000`
   (2× eBay's stated daily peak in an hour); above it → 503 (retryable) — never a 4xx to a genuine
   notification.
5. Body shape: `metadata.topic`, `notification.notificationId`, `notification.eventDate` (parseable, not
   more than 5 min in the future) else 400. Replay: `deliveries` claim keyed by `notificationId` — for the
   deletion topic the claim lives at `ebayDeletionRequests/{notificationId}`, and it is a claim on
   **completion, not on receipt**: `claimDeletion` reads the row in a transaction and answers
   `duplicate` for exactly one stored state, `status:"done"`. A row that is `queued` or `failed` is
   **re-driven** (`requeued`), because eBay's redelivery is the only safety net behind this endpoint
   and a receipt-shaped dedup (`.create()`, any failure → 200 `duplicate`) threw it away: an
   anonymisation that failed stayed failed for ever. A delivery already in flight holds
   `leaseUntilMs` (5 min) and is answered `in_progress` rather than run twice; the lease expires, so a
   process that died mid-task does not park the row.
6. Dispatch by topic:
   - `MARKETPLACE_ACCOUNT_DELETION` → compute `usernameHash = buyerHash(key, lower(data.username))` and
     `userIdHash = buyerHash(key, data.userId)` **in the request** (the raw values are dropped here and
     never leave the handler; `eiasToken` is not read) → write the ledger row (`status:"queued"`,
     hashes only) → **200 immediately** → `enqueueEbayTask({ provider:"ebay", entityType:"buyer_deletion",
     key:"ebay|deletion|<notificationId>", connectionId:"", companyId:"", usernameHash, userIdHash,
     attempt:1, correlationId }, 0)` — **hashes only in the Cloud Tasks payload** (readable by any
     project viewer via `gcloud tasks describe`); fallback inline (bounded to 40 s) when enqueue throws,
     ledger `status:"failed"` + sanitized error + `leaseUntilMs: 0` on failure, so the row is the
     reconciliation's to take. **Bypasses all three gates** (§2): the task is dispatched with the switch off, with the
     flag off, and — since the secrets are needed to hash — the endpoint answers 503 before the marker
     is committed rather than dropping the notification.
   - order topics (when subscribed) → §7.5; connector off → `received`, 200.
   - unknown topic → 200, `syncLog notification { reason:"ignored_topic" }` when a connection is
     identifiable, else a warning log.
7. Anything thrown after the claim → delete the claim and answer 500 so eBay retries; before the claim →
   401/400/503 as above.

**Anonymisation task** (`processEbayBuyerDeletion(task)` — runs on `ebayEventWorker`, returns
`{ status:"applied" }` on success and `{ status:"retrying", nextRetryInMs }` on a transient failure
(the worker loop re-enqueues; ledger `attempts++`; after 6 attempts `status:"dead"` + ledger
`failed` for the sweep's retry); **no** `touchHealth`, no connection load, no flag check):
1. Candidate hashes: `[usernameHash, userIdHash]` under **every** hash key offered (rotation, §4.6) —
   eBay may deliver the immutable id in the `username` field for U.S. users (§1), and the index is
   keyed by whatever the order's `buyer.username` carried, so both are tried. `ebayBuyers` where
   `usernameHash == h` for each → for every row and every `orderId`:
   `siparisler/{orderId}.set({ ...scrubPatch(order, now, { reason:"ebay_account_deletion" }),
   customerName:"Buyer details removed", customFields:{ "eBay Buyer": "" }, commerce:{ buyerRemovedAtMs: now } }, { merge:true })`
   — `privacy/retention.js` `PII_FIELDS` is the field list (one definition, the sweep's);
   `restrictedCustomer/{orderId}` **deleted**; `heldIntegrationOrders` rows for those external ids get
   their payload's `buyer.username` blanked (the payload is the safe half, so nothing else is there);
   `commerceReviewQueue` rows carry `customerName: null` already (the envelope name is the username →
   the review row is rewritten with `customerName: null` in the same loop).
2. Delete the `ebayBuyers` row(s).
3. Seller match: `ebayConnections where sellerUserIdHash == userIdHash` (no raw `userId` needed — the
   hash was stored at connect time, §4.1; rows connected before this field existed are backfilled by
   the first sweep after deploy, which computes it from `sellerUserId`) → delete `credentials/current`,
   `set({ status:"disconnected", disconnectReason:"ebay_account_deleted", sellerUsername:"", displayName:"eBay account (deleted)", hasCredentials:false, disconnectedAtMs, disconnectedByUid:"ebay" })`
   + `syncLog disconnected`. Orders stay (they are the workshop's own sales records; buyer data was
   handled in step 1 if the seller was also a buyer).
4. Ledger `status:"done"`, counters, lease dropped; `syncLog buyer_deleted { count }` on each affected
   connection (no username). Idempotent: running twice finds nothing and still reports `done`.
   `status:"done"` is written **only here, after the work** — it is the one state the gateway calls a
   duplicate.

**Reconciliation** (`reconcileEbayDeletions`, `every 10 minutes`, ungated — no connector switch, no
flag, no connection): reads the ledger back, which nothing did before it. For `status` `queued` and
`failed`, a row whose lease has expired and whose backoff has passed
(`min(5 min × attempts, 6 h)` since its last attempt or redelivery) is re-driven through the same
`driveDeletion` path as a live notification, from the hashes the row already carries
(`usernameHashes`/`userIdHashes`, arrays, so a rotation in progress is still matched). A row with no
hashes at all, and a row still unfinished after twice `MAX_DELETION_ATTEMPTS`, are counted `stuck` and
logged at error level with the `notificationId`. Without this pass the only signal that an
anonymisation never happened was a console line and a row that expires silently after 400 days.

---

## 10. Error and reconnect states — one table, `commerce/ebay/status.js` (§59, §7)

`status.js` exports the three sets the clients copy line for line:
```js
const BENIGN_ERROR_CODES    = ["", "truncated", "paused_by_owner"];                       // connected_read_only
const TRANSIENT_ERROR_CODES = ["rate_limited", "partial_pass", "provider_unavailable",
                               "permission_missing", "token_request_invalid", "app_credentials_invalid"];   // degraded
const STALE_AFTER_MS = 6 * 60 * 60 * 1000;   // connected + no lastSuccessAtMs for 6 h → degraded even with a benign code
```
`specStatusOf(doc, flags, now)`: `disconnected` → `disconnected`; `reconnect_required` →
`reauthorization_required`; flag off or `environment_mismatch` → `suspended`; `lastErrorCode` in
TRANSIENT, or `now − lastSuccessAtMs > STALE_AFTER_MS` while `settings.autoSync` and
`importState === "done"` → `degraded`; otherwise `connected_read_only`. `cardStateOf(rows)`: no rows →
`connect` (`coming_soon` when `configured:false`); every row `reauthorization_required|suspended|degraded`
→ `attention`; else `connected`. The staleness rule is **inside** the table, not a sentence beside it.

| Situation | `lastErrorCode` | stored `status` | specStatus | card / sentence (web, Mac, Android — through `t()`) |
|---|---|---|---|---|
| Client id blank / connector off | — | — | — | "eBay is not set up on this server yet. Contact support and we will enable it." |
| Per-connection flag off | (unchanged) | `connected` | `suspended` | Needs attention · "eBay sync is paused on this server." |
| Sandbox row on a production server | `environment_mismatch` | `connected` | `suspended` | Needs attention · "This eBay connection belongs to the sandbox. Disconnect it and connect your live account." |
| State replay / expired | callback `reason=state` | — | — | "The eBay sign-in link has expired or was already used. Start again." |
| Callback from a different browser | callback `reason=browser` | — | — | "Finish connecting eBay in the same browser you started from." |
| Sandbox/production mismatch at callback | `reason=environment` | — | — | "This eBay account belongs to a different environment." |
| Identity scope missing | `reason=no_seller` | — | — | "eBay did not tell us which seller account this is. Reconnect and approve every permission." |
| Exchange failed | `reason=exchange` / `token` | — | — | "eBay did not complete the connection. Try again." |
| The callback could not be completed at all: `NIVADESK_EBAY_CALLBACK_KEY` unset or too short, the two halves of the shared key disagreeing, the function unreachable, any non-200 (401/400/405/5xx), an unparseable body, an unknown reason word, or the web route's 20-second abort | `reason=unavailable` (§5.4) | — | — | same sentence |
| `invalid_grant` (HTTP 400 body) / 401 after refresh / revoked | `credentials_rejected` | `reconnect_required` | `reauthorization_required` | Reconnect required · "eBay no longer accepts this connection. Reconnect to continue syncing." + **Reconnect** (owner) |
| Credential box unreadable | `token_unreadable` | `reconnect_required` | `reauthorization_required` | same sentence |
| Refresh token within 14 d of expiry | `refresh_token_expiring` | `reconnect_required` | `reauthorization_required` | "Reconnect eBay before {date} to keep syncing." |
| Our keyset / RuName / scope list rejected (`invalid_client`, `unauthorized_client`, `invalid_scope`) | `app_credentials_invalid` | `connected` | `degraded` | Needs attention · "eBay sync is temporarily unavailable. NivaDesk has been notified." (ops alert; the seller is not asked to reconnect) |
| Malformed token request (`invalid_request`) | `token_request_invalid` | `connected` | `degraded` | same sentence |
| 403 | `permission_missing` | `connected` | `degraded` | Needs attention · "eBay refused a permission. Reconnect and approve every permission." |
| 429 / quota cap / connection share spent | `rate_limited` | `connected` | `degraded` | Needs attention · "eBay is rate-limiting this account. Sync resumes automatically." |
| Partial pass (one order failed) / import failures outstanding | `partial_pass` | `connected` | `degraded` | Needs attention · "Some eBay orders could not be imported. See Sync health." (that sub-window's cursor not advanced) |
| Truncated window (bisection budget spent) | `truncated` | `connected` | `connected_read_only` | Healthy (the watermark advanced through what was read; the next pass continues) |
| Provider 5xx / network | `provider_unavailable` | `connected` | `degraded` | Needs attention · "eBay could not be reached. Sync retries automatically." |
| No successful pass for 6 h (any code) | (any) | `connected` | `degraded` | Needs attention · "eBay has not synced for a while. See Sync health." |
| Import awaiting / paused / resumable | `importState !== "done"` | `connected` | `connected_read_only` | Connected · "Choose what to import to start syncing." / "Import paused — press Import again to continue." |
| Disconnected | — | `disconnected` | `disconnected` | not shown; "eBay account disconnected." notice once |

`verifyEbayConnection` returns `{ ok:true, healthy:false, reason }` with the same codes; the web
`ebayErrorText(code)` / `ebayEventText(type)` / `ebayReasonText(reason)` maps are the single place a
code becomes a sentence — a technical code never reaches the screen. Every sentence above is an
English key with entries in all 11 other languages (§11.5). `unavailable` is the one reason word the
function never sends: it is produced by the web callback route alone (§5.4) and points at the sentence
`ebayReasonText` already returns as its fallback, so it is added to `REASON_TEXT` and needs no new
translation. `missing_code`, `token` and `exchange` are listed beside it pointing at that same sentence,
so every word the callback can redirect with is in the table rather than three of them relying on the
fallback while the table claims to be complete. Reconnect = `beginEbayConnect` again;
the callback lands on the same row and sets `catchUpDueFromMs` (§7.6).

---

## 11. Web (studioflow-web)

### 11.1 Registry + state — `lib/studioflow/integrations.ts`
- Row 105 becomes `{ id:"ebay", name:"eBay", category:"commerce", kind:"native", mark:"E",
  blurb:"Connect your eBay seller account once; orders, payments and refunds arrive on their own.",
  capabilities:["Orders","Payments","Refunds"], manage:"ebay" }`
  (§7 chips; the category label shown is the existing "commerce" group — a `Marketplace` category is a
  hub-wide change for Amazon and eBay together, out of this half). No logo file (README forbids a
  redrawn mark); `mark:"E"` stays.
- `IntegrationManageTarget` gains `"ebay"`; `IntegrationSignals`/`EMPTY_INTEGRATION_SIGNALS` gain
  `ebayConnections: { account: string; status: string; specStatus: string; needsAttention: boolean; environment?: string }[]`;
  `loadIntegrationSignals` adds a `getEbayConnections` read inside the same `Promise.allSettled`
  (rejection → `[]`); `resolveProviderState` adds a plain-JS `if (provider.id === "ebay")` branch
  mirroring Square (filter `status !== "disconnected"`; none → `available`; all `needsAttention` →
  `attention`; else `connected`; detail = account name or `${n} accounts`, `· Sandbox` when
  `environment === "sandbox"`). No `as`, no inline types — `shopify-badge-uninstalled.test.js` lifts
  the function with `new Function`.
- `needsAttention` on a row = `specStatus ∈ {reauthorization_required, degraded, suspended}` — the
  server computes `specStatus` (§10); the client never re-derives it from codes.

### 11.2 Settings hub — `app/settings/page.tsx`
Import `EbayIntegrationSection`; `SETTINGS_SECTION_ALIASES.ebay = "integrations"`; add `"ebay"` to the
integrations search keywords; add `rawRequested === "ebay"` to the preselect list (~545); add
`{managing === "ebay" ? <EbayIntegrationSection workspace={workspace} language={language} /> : null}`
beside Etsy/Square (~5339). The crumb finds the provider by `manage === "ebay" && kind !== "planned"`.

### 11.3 Callables — `lib/studioflow/ebay.ts`
`const call = <TIn, TOut>(name) => httpsCallable<TIn, TOut>(functions, name)`; exports
`beginEbayConnect(companyId)`, `claimEbayConnectState(state)`, `getEbayConnections(companyId) → { ok, connections, configured, environment }`,
`verifyEbayConnection`, `updateEbayConnectionSettings`, `previewEbayImport`, `runEbayImport`,
`retryEbayImportFailures`, `syncEbayNow`, `disconnectEbay`, `revealRestrictedCustomer`, plus
`ebayErrorText`, `ebayEventText`, `ebayReasonText`, `ebayStatusLabel(specStatus)`, and
`setEbayNonceCookie(nonce)` (the one place the cookie string is written). Types mirror `publicView`:
```ts
type EbayConnectionView = { id; provider:"ebay"; environment; sellerUsername; sellerUserId; displayName;
  registrationMarketplaceId; marketplaces:{marketplace;enabled;currency}[]; status; specStatus; readOnly:true;
  scopes:string[]; capabilities:Record<string, true|false|string>; settings; importState; importCounters;
  importCursor:{ complete:boolean; failedCount:number } | null; connectedAtMs; lastSyncAtMs; lastSuccessAtMs;
  lastVerifiedAtMs; lastFullReconciliationAtMs; lastErrorCode; lastErrorAtMs; reauthorizeByMs; needsReconnect;
  paused; quota:{ today; share; cap }; lastReconcile; recentEvents:{atMs;type;error?;orderId?;reason?}[] };
```
Never a token, box, hash, nonce hash, or `sellerUserIdHash`.

### 11.4 Section — `app/settings/EbayIntegrationSection.tsx` (Square template, Etsy behaviours)
- Reads `?ebay=connected|cancelled|error&reason=…` once, `params.delete`, `history.replaceState`, sets
  notice/error, then `refresh(true)`.
- `configured === false` → the not-set-up card. No rows → connect card: `CardTitle eyebrow="eBay"
  title="Connect your eBay account"`, blurb, environment hint when sandbox ("Sandbox — test orders
  only"), **Connect eBay** (owner; "Opening eBay…" while busy; `setEbayNonceCookie(nonce)` then
  `window.location.href = authorizeUrl`), the owner-only hint for members, and the honest scope line:
  "NivaDesk will read your orders. It will not change listings, prices or stock." (true of the
  requested scopes, §0).
- Connected: header card (seller username, `studio-pill` Healthy / Needs attention / Reconnect
  required / Paused / Connected from `specStatus`, environment badge, **Reconnect** when `needsReconnect`,
  **Check now** → verify, **Sync now** with a result notice "Synced: {created} new, {updated} updated,
  {held} held, {failed} failed"); *Choose what to import* card while `importState !== "done"` (range
  7/30/90 days, include unpaid / cancelled toggles, **Preview** (owner) → "orders found / duplicate
  orders prevented" tiles with "estimate — more than {n} orders" when truncated, **Import**, and when
  `importCursor.complete === false` the "Import paused — press Import again to continue" line, when
  `failedCount > 0` "N orders could not be imported — **Retry**"); *Settings* card (auto sync, include
  unpaid, include cancelled, marketplaces enabled — only the seen ids are offered);
  `<CommerceSyncHealthCard workspace language provider="ebay" />` (real telemetry: cursor, health,
  events, review queue, quota — §67); *Recent activity* (nine `recentEvents` through `ebayEventText`);
  *Disconnect* card (confirm / Keep connected → "eBay account disconnected. Your orders stay in NivaDesk.").
- The external-management line (§71) is not shown here (no listings in this half); the section states
  "Listings and stock stay managed on eBay."
- `app/ebay/callback/route.ts` (**§5.4**) is no longer the Square redirect route. It exports
  `dynamic = "force-dynamic"` and `runtime = "nodejs"` (load-bearing, not a default: Next replaces
  `process.env` statically for Edge route handlers, which would bake the relay key into the build
  output). It settles the decline and the shape checks itself, reads the nonce cookie **without gating
  on it**, signs a JSON body with `NIVADESK_EBAY_CALLBACK_KEY` and POSTs it to
  `https://europe-west2-eggcraft-studio.cloudfunctions.net/ebayOAuthCallback` — no query string on that
  hop, ever — then turns the function's JSON answer into the seller-facing 302 and clears the cookie on
  every path, the connected one included. The redirect target is a module constant and `reason` a fixed
  union, so no eBay parameter and no value from the function's body reaches a URL.
- `app/ebay/start/page.tsx` (§5.2): signed-in gate, `claimEbayConnectState`, cookie, redirect; on
  `permission-denied` it shows "This eBay connection was started by a different NivaDesk user." and
  a link back to Settings. `dynamic = "force-dynamic"`, `noindex`.

### 11.5 Translations — `lib/studioflow/language.ts`
A new commented `mergeIntoTranslations({...})` block after line 7901 ("The eBay connection screen…"),
one entry per exact English string above and in §10, each with all 11 non-English languages; deep
merge only (never a spread). Reuse existing keys ("Sync now", "Check now", "Keep connected", "Needs
attention", "Connected", "Set up", "Manage", "Loading...", "Just now", "minutes ago", …). The same
strings are copied verbatim to `DilMotoru.swift` and `StudioTranslations.kt`.

### 11.6 Already fine
`app/dashboard/page.tsx` has `{ key:"ebay", source:"eBay" }`; `provider_display_name: "eBay"` in the
adapter is pinned by `dashboard-channels.test.js`; `OrderDetailContent.tsx` shows the channel strip from
the `commerce` stamp (no `CHANNEL_SOURCES` change) and gains the *Show address* button wired to
`revealRestrictedCustomer` (hidden without the grant); onboarding tiles are optional and not part of
this half.

---

## 12. Native cards

### 12.1 Mac / iPhone (Swift, EGGcraft)
- `NivaDeskIntegrations.swift` 109: `.init(id:"ebay", name:"eBay", category:"commerce", kind:"native",
  blurb: <same blurb>, capabilities:["Orders","Payments","Refunds"], manage:"ebay", asset:"", mark:"E")`;
  `NivaDeskIntegrationSignals` gains `ebayConnections` / `ebayConnectionsNeedingAttention`;
  `detail(signals:)` and `state(signals:)` gain `id == "ebay"` branches copied from Square.
- `AyarlarView.swift`: `else if integrationsManaging == "ebay" { ebayIntegrationAyari }` (~6505);
  `loadIntegrationSignals()` adds a `getEbayConnections` block (filter `status != "disconnected"`,
  attention = `specStatus ∈ {reauthorization_required, degraded, suspended}` — the server's word);
  factory `ebayIntegrationAyari = EbayIntegrationView(language: seciliDil, isOwner: …)` (~6700).
- New `EGGcraft/EbayIntegrationView.swift` (compiles without pbxproj edits): `EbayConnectionInfo`
  from `[String: Any]`, calls through `FirebaseManager.etsyCall(name, data, timeout)` (europe-west2,
  companyId injected) — `getEbayConnections` (`configured` default `true`), `beginEbayConnect` with
  `origin:"native"` → `state` → `awaitingReturn = true; openExternal("https://nivadesk.app/ebay/start?state=\(state)")`
  (`NSWorkspace.shared.open` / `UIApplication.shared.open`; the authorize URL itself is never opened
  from the app — §5.2); `.onChange(of: scenePhase)` reload when `awaitingReturn`; `verify`,
  `syncEbayNow` (timeout 300), `runEbayImport` (540, resumable notice), `disconnectEbay`;
  `CommerceSyncHealthView(companyId:, provider:"ebay", isOwner:, language:)`. Every card is its own
  `private struct` (`EbayConnectCard`, `EbayHeaderCard`, `EbayAttentionCard`, `EbayImportCard`,
  `EbaySyncCard`, `EbayDisconnectCard`) — the device stack-guard rule. SF Symbols only from the set
  already in use (`cart.fill`, `arrow.triangle.2.circlepath`, `link.badge.plus`,
  `exclamationmark.triangle.fill`, `lock.shield`). No deep link: the callback ends on nivadesk.app
  and the app re-polls.
- `DilMotoru.swift`: `_make_studioFlowFeatureTranslations_16()` + `private let` + one `.merging` line
  (3600–3615) with the eBay strings, 11 languages each; scan the chunk for duplicate keys (a duplicate
  literal crashes at launch) and reuse existing keys.
- Proof: the two `xcodebuild` commands from the native map (macOS with the separate
  `-derivedDataPath`, then iPhone 17 Pro simulator), `** BUILD SUCCEEDED **`, then remove the unsigned
  `NivaDesk.app` from the verify DerivedData.

### 12.2 Android (Kotlin)
- `IntegrationsHub.kt` 178: `IntegrationProvider("ebay", "eBay", "commerce", "native", <blurb>,
  listOf("Orders","Payments","Refunds"), "ebay", "E")`;
  `IntegrationSignals` gains the eBay pair; `detail()`/`state()` gain `id == "ebay"` branches;
  `IntegrationsHubStateTest.kt` gains Available / Connected / Attention cases for eBay.
- `SettingsScreen.kt`: `IntegrationsHubDetail` signals add
  `runCatching { repository.ebayConnections(ws.id) }.getOrDefault(emptyList()).filter { it.status != "disconnected" }`;
  `when (managing)` adds `"ebay" -> EbayDetail(state)`; `EbayDetail` lives in this file (DetailCard/
  DetailColumn are private) and copies `SquareDetail`: `reload()/run()`, `LifecycleEventObserver`
  `ON_RESUME` reload when `awaitingReturn`, connect → `repository.ebayBeginConnect(ws.id, origin = "native")`
  → `uriHandler.openUri("https://nivadesk.app/ebay/start?state=$state")`, "Finish connection", Check
  now, Sync now, `CommerceSyncHealthCard(state, provider = "ebay")`, import card (resumable notice),
  settings card, two-button disconnect; `configured == false` → the not-set-up card (Etsy).
- `StudioFlowRepository.kt`: `data class EbayConnectionRow(...)`; `ebayConnections(workspaceId):
  Pair<List<EbayConnectionRow>, Boolean>`, `ebayBeginConnect`, `ebayVerify`, `ebayUpdateSettings`,
  `ebayPreviewImport`, `ebayRunImport(timeoutSeconds = 540)`, `ebaySyncNow(timeoutSeconds = 300)`,
  `ebayDisconnect` — all on the shared `etsyCall(name, workspaceId, data, timeoutSeconds)`.
- `StudioTranslations.kt`: `private val TR_EBAY by lazy { mapOf(...) }` appended to the `+` chain at
  line 361 (later wins), 11 target languages per English key.
- Proof: `./gradlew :app:assembleDebug` and `:app:testDebugUnitTest --tests "...IntegrationsHubStateTest"`
  with `JAVA_HOME` = Android Studio's jbr, no `-q`, `BUILD SUCCESSFUL` visible.

### 12.3 One rule for all three clients
Card state is derived from `getEbayConnections` rows (`status`, `specStatus`), never from a local
"pressed Connect" flag and never by re-deriving `specStatus` from `lastErrorCode` on the client; a
`disconnected` row is not a connection; `configured:false` means the not-set-up card, not an error.
`commerce/ebay/status.js` is the single definition the three `state()` functions copy line for line,
and `IntegrationsHubStateTest` + `shopify-badge-uninstalled` pin both ends.

---

## 13. Guide entries (`lib/publicSite/guide.ts` → `set-ebay` in `TREE_EN` **and** `TREE_TR`, right after `set-etsy`; then `node functions/assistant/buildGuideCorpus.js` and commit the three JSON files)

Public paragraphs (the website assistant sees these — money-neutral, no guarantees):

**EN** — *eBay*: "Connect your eBay seller account and your eBay orders appear in NivaDesk's Orders
alongside everything else, with the buyer's username, the items, totals, taxes and any tracking eBay
has. NivaDesk reads your orders; it does not change your listings, prices or stock. Buyer contact
details are kept in a protected place and shown only when you ask for them."
- sub "Connecting your account": "[Web] Settings → Integrations → eBay → Set up, then **Connect eBay**.
  Approve the connection on eBay in the same browser and you come straight back." "[Mac] [iPhone/iPad]
  [Android] The same button opens nivadesk.app in your browser; sign in if asked, approve on eBay,
  then come back to the app and press **Check now**." "Only the workspace owner can connect or disconnect."
- sub "Choosing what comes in": "Pick how far back to import (up to 90 days), whether unpaid or
  cancelled orders come in, and which eBay sites. **Preview** shows how many orders were found and how
  many duplicates were prevented before anything is written. A large import may pause and ask you to
  press Import again; nothing is lost in between."
- sub "Staying up to date": "NivaDesk checks eBay for changed orders every few minutes and once more
  each night with an overlap, so a change is never missed. **Sync now** checks the last 24 hours
  immediately. Sync health shows the last successful check, pending retries and anything that needs
  a look." (no "real-time"; the nightly sentence is backed by §7.6)
- sub "Buyers and your customer list": "eBay buyers are not added to your customer list automatically
  and are never merged by name. Their address is available from the order when you need it to ship,
  and is removed 90 days after delivery, which is also when eBay stops showing it to you."
- sub "If eBay asks you to reconnect": "When eBay stops accepting the connection (permission removed,
  a changed eBay password, or the 18-month authorisation ends) the card says **Reconnect required**;
  press **Reconnect** and approve again. Nothing already imported is lost, and orders that changed
  while you were disconnected are picked up."
- sub "Disconnecting": "**Disconnect** removes NivaDesk's access to your eBay account and stops
  syncing; the orders you imported stay."

**TR** — *eBay*: "eBay satıcı hesabınızı bağlayın; eBay siparişleriniz alıcı kullanıcı adı, ürünler,
tutarlar, vergiler ve eBay'deki kargo takibiyle birlikte Siparişler'de diğer her şeyin yanında görünür.
NivaDesk siparişlerinizi okur; ilanlarınızı, fiyatlarınızı veya stoğunuzu değiştirmez. Alıcı iletişim
bilgileri korumalı bir yerde tutulur ve yalnızca siz istediğinizde gösterilir." Subs mirror the EN
ones ("Hesabı bağlama", "Neyin geleceğini seçme", "Güncel kalma", "Alıcılar ve müşteri listeniz",
"eBay yeniden bağlanmanızı isterse", "Bağlantıyı kesme") with the same button names in bold.
`GUIDE_T` gets the 10 other languages for each EN sentence (optional but the Etsy pattern does it).
The `set-woocommerce` bullet that lists connectors is updated if its wording enumerates them.

---

## 14. Test plan

Run: `cd functions && npm test` (qa, fake Firestore: no `where()` beyond one equality in
`etsy-connect`'s fake, no undefined rejection — run the new file directly while iterating because
`npm test` stops at the first failing file); `npm run test:rules` for the `.mjs`; e2e under
`firebase emulators:exec --only firestore,storage --project demo-nivadesk-ci "cd functions && bash test/run-e2e.sh"`
with `JAVA_HOME` set. Tests assert the spec's contract, never a copy of the implementation
(the "tests that assert the bug" lesson: pure modules are imported by both sides).

### 14.1 qa (pure, fake Firestore)
| File | Asserts |
|---|---|
| `commerce-ebay-oauth.test.js` | authorize URL host per environment (`auth.ebay.com` / `auth.sandbox.ebay.com`), `redirect_uri` is the RuName verbatim, `scope` = the **two** scopes joined by `%20` (no `+`, no `sell.fulfillment` write scope), `state` echoed, no secret in any URL; token request uses Basic auth + `URLSearchParams`; refresh body carries exactly the stored `scopes`; `refresh_token_expires_in` → `refreshTokenExpiresAtMs`; `classifyTokenError` table (§6) with **HTTP 400** `invalid_grant` → auth, 400 `invalid_client` → `app_credentials_invalid`, 401 `invalid_client` → same, 400 `invalid_request` → `token_request_invalid`; `fetchIdentity` drops `individualAccount`/`businessAccount` |
| `commerce-ebay-keys.test.js` | two-key encoding: whitespace and comma separators, 3 keys refused, 31-byte entry refused, write key is index 0, `buyerHash` matches under either key |
| `commerce-ebay-client.test.js` | `getOrders` builds `filter=lastmodifieddate:[<from>..<to>]` with millisecond `Z` ISO, `fieldGroups=TAX_BREAKDOWN`, `limit=200`/`offset`; `next` pagination; `getOrdersByIds` chunks at 50; 404 → null on `getOrder`; 401 → one `onUnauthorized` then rethrow; 429 → `errorClass transient` + `retryAfter`; quota charged before the call; no path string outside `commerce/ebay/` (grep pin) |
| `commerce-ebay-cursor-plan.test.js` | `bisect`: a window that truncates at page 4 halves, completed halves are reported in order, `MAX_BISECTIONS` respected, the recorded watermark never exceeds the last completed sub-window; `nightlyWindow` = max(7 d, lastFull − 24 h); `catchUpWindow` ignores the 24 h cap when `catchUpDueFromMs` is set and slices at 24 h |
| `commerce-ebay-sanitize.test.js` | against the **captured** fixture (`_captured` required): every path in the §8.1 table removed, `buyer.username` + `countryCode` kept; planted email / phone / postcode / `fullName` at unknown paths each trip `scanForPii`; `countryCode` never trips; `removed[]` paths only; fulfilments lose contact fields and keep tracking; adapter on the safe half → `customer.email/phone === null`, `shipping_address === null`, `customer.name === username`; personalised aspect goes to the restricted half |
| `commerce-ebay-notification.test.js` | challenge vector: `sha256hex(c + token + url)` for a fixed triple, response body via JSON library; header base64-JSON parse; **own-EC-key signed vector** over `JSON.stringify(body)` with SHA-1 accepted, changed body rejected, wrong kid rejected, PEM wrapping of a newline-less key; `isValidKid`; missing header → 401 with no detail; `eventDate` in the future → 400; same `notificationId` twice → second is 200 + skipped; deletion topic answers 200 before the task runs; unknown topic → 200; key fetch failure → 503; secrets absent → 503; unknown-kid budget → 503; hashes in the task payload and no `username`/`userId`/`eiasToken` key anywhere in it |
| `commerce-ebay-status.test.js` | the §10 table row by row (stored status + code + flags + staleness → `specStatus` → card state); the transient/benign sets are exported constants |
| `commerce-ebay-quota.test.js` | verdict table: connection share before app budget; sweep 75 % / nightly+import 80 % / people 95 %; a second connection is unaffected by the first's spent share |
| `commerce-ebay-capabilities.test.js` | `proveEbay` yields `shipment.write/finance.read/inventory.read === "not_in_this_release"` and `orders.read === true`; with every proof the spec's default map is reproduced |
| `privacy-reveal.test.js` | tier table (§3.3), response shape excludes `taxIdentifier`/`paths`/notes, log-before-return (failing fake log → no payload), rate limit |
| `ebay-connect.test.js` (Etsy shape) | the whole §5.4 transport matrix (28 cases: method, query string, key floor, signature, skew both ways, rawBody, rid shape, state shape, field caps, log/response/source pins) — note the harness rewrite §5.4 specifies; state replay refused (`reason=state`), expiry, environment mismatch, **nonce mismatch and empty nonce → `reason=browser` and the state is burned in both cases**, `claimEbayConnectState` refuses a different uid and a second claim, `no_seller` when identity fails, cross-workspace connection id, reconnect keeps `connectedAtMs`/`settings`/`importState`/`importCursor` and sets `catchUpDueFromMs`, `sellerUserIdHash` written, single-flight refresh + lock outlasting retries, loser refuses expired token, only auth-class failure flips `reconnect_required` (`invalid_client` does not), disconnect deletes `credentials/current` and writes `disconnectedByUid: uid`, public view contains no `Encrypted` key, no token substring, no `Hash` key; settings/marketplace/sinceDays whitelists (§4.11) |
| `ebay-sync.test.js` | pending-payment create rule, `autoSync` off skips creates but applies updates, `awaiting_first_import` before import, `includeCancelled`, `marketplace_disabled`, `restrictedCustomer` written on noop too, never on held, **never when the restricted half is empty**, `ebayBuyers` arrayUnion under the keyed hash **whenever the order names the buyer** (an address-less order is still reachable by a deletion notice), no `upsertIntegrationCustomer` call, held payload has no email, `marketplaceId` passed to the adapter, **queue path and sweep path agree** (same fake order → same documents), environment mismatch skipped, `app_credentials_invalid` stops the sweep after one row |
| `commerce-ebay-wiring.test.js` (mirror of the Square pin) | secrets gate (`EBAY_SECRET_PARAMS` with the **five** names including `EBAY_CALLBACK_KEY`, built only under `EBAY_SECRETS_READY`, marker file, `EBAY_RUNTIME` with `serviceAccount`), `ebayOAuthCallback` declared with `maxInstances`, the four wrappers, every `exports.<fn> = ebayExports.<fn>;` line, `ebayEventWorker` on its own queue with the copied loop and the `buyer_deletion` health skip, `retryCommerceEvent` eBay branch enqueues and never processes, `commerceEventWorker` secrets literal **unchanged** and `provider_not_on_this_worker`, `_e2e.ebay`, rules regex for **all six** root blocks, purge steps, `releaseHeldIntegrationOrders` branch with a fresh fetch and no payload replay, `lifecycle/derive.js` group, `engine.applyEnvelope` used and no direct `orderDocRef(...).set` in the connector, exactly one `applyEbayOrder` definition and every path calling it, `NIVADESK_EBAY_CONNECTOR` read, retention sweep deletes `restrictedCustomer` |
| `commerce-flags.test.js` (extend) | `connectors` area precedence: connection > provider > global; default off; **`readCommerceFlags` merges `connectors` from the document**; cache reset |
| `access-control-policy.test.js` (extend) | regex covers `EBAY_*`; a mount of an eBay secret without `serviceAccount` fails; the policy paragraph names eBay |
| `commerce-ebay-adapter.test.js` (extend, first) | "a DE order with no ctx.marketplaceId links to ebay.de" (fails before §8.3 lands) |
| `commerce-square-wiring.test.js` | **unchanged** (the worker secrets literal does not change) |
| `credentials-at-rest.test.js` | `ebayConnector.js` + `commerce/ebay/*.js` in CONNECTORS; still one `encryptToken` implementation |
| `pii-retention-sweep.test.js` (extend) | eBay 90-day period present; the sweep deletes the restricted doc; Amazon's 30-day pass unaffected |
| `connector-attribution.test.js`, `account-deletion-coverage.test.js`, `lifecycle-derive.test.js`, `outbound-pii-policy.test.js`, `guide-corpus-fresh.test.js`, `shopify-badge-uninstalled.test.js`, `dashboard-channels.test.js`, `commerce-contracts.test.js` | extended or unchanged-and-green (provider order pinned: do not touch `listProviders()`) |
| `ebay-rules.test.mjs` | owner / member / outsider / signed-out fail read, create, update, delete on `ebayConnections`, `ebayConnections/x/credentials/current`, `ebayConnectStates`, `ebayBuyers`, `ebayDeletionRequests`, `ebayQuota`, `ebayNotificationKeys`, `companies/acme/restrictedCustomer/o1`, `companies/acme/privacyState/revealCounters/u1` |

### 14.2 e2e (real emulator; `process.env.EBAY_*` (**five**, `EBAY_CALLBACK_KEY` included) + `NIVADESK_EBAY_CONNECTOR=1` + random 32-byte hex keys set **before** `require("../../index.js")`; fakes via `global.__nivadeskEbayFake*`; wipe `siparisler / musteriler / commerceEvents / commerceHealth / commerceCursors / externalEntities / ebayBuyers / ebayQuota / companies/{cid}/restrictedCustomer` by companyId)
`commerce-ebay-connector-emulator.test.js`:
1. `beginEbayConnect.run(...)` → state doc with `expireAt` Timestamp twin and `nonceHash`; a **signed POST**
   with a forged state → 200 `reason=state`; a signed POST with the right state and `nonce: ""` →
   200 `reason=browser` and the state is burned (proven by a follow-up signed POST with the *right* nonce
   answering `reason=state`); an **unsigned** POST → 401 with the state untouched; a signed POST with the
   right nonce on a fresh state → connection row `status connected`,
   `specStatus connected_read_only`, `capabilities.orders.read === true` and `shipment.write ===
   "not_in_this_release"`, `scopes` = the two read scopes, `sellerUserIdHash` present, `marketplaces[0]
   = EBAY_GB/GBP`, credentials doc decrypts with `etsy.decryptToken(box, process.env.EBAY_TOKEN_KEY)`,
   `JSON.stringify` of the connection doc and of `getEbayConnections` output contains no plaintext token
   and no `Hash` key.
2. Environment mismatch (`state.environment = "production"` on a sandbox server) → `reason=environment`;
   a stored `environment:"production"` row on a sandbox server → sweep skips it with `environment_mismatch`.
3. `runEbayImport` on a fake page set (two 7-day slices) → order created through the engine:
   `commerce.provider "ebay"`, `commerce.orderNumber = orderId`, `externalEntities` row bound to the
   company, `customerName === buyer.username`, `customFields["eBay Buyer"] === buyer.username`, **no**
   `emailAddress`/`shippingPhone`/`shippingStreetAddress`, `restrictedCustomer/{docId}` holds the
   address and `buyerCheckoutNotes`, `ebayBuyers` row lists the order under the keyed hash,
   `musteriler` unchanged, `external_admin_url` host matches the line's `listingMarketplaceId`.
4. Same order again with the same `lastModifiedDate` → `duplicate`; older `lastModifiedDate` → `stale`;
   newer with a changed total → `updated`; `noop` still refreshes `restrictedCustomer`.
5. Fulfilment appears → `trackingNumber` filled, `isDispatched true`; a manual tracking number is not
   overwritten; the nightly follow-up finds it even when `lastModifiedDate` did not move.
6. Cancelled order → `status "Cancelled"` on create; cancel on update → history entry.
7. **Bisection**: 9 pages faked for a 24 h window with `maxPages 4` → the pass records ≥ 2 completed
   sub-windows, `commerceCursors.watermarkMs` equals the end of the last completed sub-window (not
   `now`, not untouched), `lastErrorCode "truncated"`, `specStatus connected_read_only`; the next pass
   starts at that watermark; clean pass → watermark = `toMs`, `commerceHealth` `orders.lastSuccessAtMs`
   set, `lastReconcile` all numbers.
8. One failing order in a page → `failed 1`, that sub-window's watermark unchanged, `partial_pass`.
9. Refresh answered **HTTP 400 `{ "error": "invalid_grant" }`** → `reconnect_required` +
   `credentials_rejected`; HTTP 400 `{ "error": "invalid_client" }` → status **unchanged**,
   `app_credentials_invalid`, sweep stops after one row; 429 → `rateLimitedUntilMs` set, status stays
   `connected`; sweep skips that connection until then.
10. Per-connection flag off in `appConfig/commerce.connectors.connections` (with
    `resetCommerceFlagCache()`) → sweep skips, `specStatus "suspended"`, `syncEbayNow` refuses; three
    orders modified during a simulated 36 h; flag on again → `catchUpDueFromMs` set, the next pass
    applies all three and the watermark ends at `now` (rollback proof, §84; the **document field**
    drives it).
11. Plan capacity `allowed:false` → `held`, `heldIntegrationOrders` payload has no email;
    `releaseHeldIntegrationOrders` eBay branch **queues** the row (`queued:1`, `imported:0`), the worker
    fetches fresh (fake `getOrder` called) and creates the order with its `restrictedCustomer`, and the
    held row is gone; with the fake client refusing, the row is still parked and no order exists. The
    limit is **filled deliberately** rather than assumed: this check used to wrap every assertion in
    `if (outcome.result === "held")` and fall through to a `console.log`, so it could pass while
    testing nothing.
12. Disconnect → credentials doc gone, `status disconnected`, `disconnectedByUid`, a pending fake task for
    that connection → `errorClass auth`, no order write.
13. `purgeProviderDataForWorkspace` → `report.ebayConnections === 1`, `report.ebayConnectStates === 1`,
    `report.ebayBuyers ≥ 1`, `report.errors` empty, credentials/deliveries/syncLog subtrees gone.
14. `revealRestrictedCustomer`: owner → payload without `taxIdentifier` and a `piiAccessLog`
    `restricted_resource_accessed` row written first; member without grant → `permission-denied`;
    workflow-only member with grant → denied; 61st call in an hour → `resource-exhausted`.
15. Import resumability: a fake budget exhaustion after slice 1 → `importState "running"`,
    `importCursor` at slice 2, cursor **not** seeded; second call resumes and completes → `done`,
    cursor seeded at `importStartMs`; a failed id → `failedIds`, `retryEbayImportFailures` clears it.
16. Retention: an eBay order with `deliveredAtMs` 91 days ago → after `sweepMarketplacePii` the order's
    `PII_FIELDS` are scrubbed **and** `restrictedCustomer/{id}` is gone; a 60-day-old one is untouched.

`ebay-account-deletion-emulator.test.js`: GET challenge → exact hash; POST with the fake verifier for
a buyer with two orders in two workspaces → 200 within the call, ledger `queued` with keyed hashes
only, the enqueued task payload has no `username`/`userId`/`eiasToken` → task on `ebayEventWorker`
with the connector switch **off** and the flag **off** → both orders scrubbed with `PII_FIELDS` blanks
+ `customFields["eBay Buyer"] === ""`, both `restrictedCustomer` docs deleted, `ebayBuyers` rows gone,
review rows `customerName: null`, ledger `done` with counters, no `commerceHealth/ebay__` document
created, second delivery of the same `notificationId` → 200 + no change; **the replay-after-FAILURE
case beside it** — a deletion whose queue is down and whose inline run fails leaves the row `failed`
with no lease and the order un-anonymised, the next delivery of that same `notificationId` answers
`requeued` (never `duplicate`) and finishes the work, and only then is a third delivery a duplicate;
**the reconciliation pass** — a `queued` row nobody redelivered is re-driven and finishes, a leased
row and a `done` row are left alone, and a second pass does nothing; seller `userId` match via
`sellerUserIdHash` → connection disconnected with credentials deleted and `sellerUsername ""`; a
notification whose `username` field carries the immutable id (U.S. case) still matches; secrets
absent → 503. Extend `account-deletion-emulator.test.js` for the purge report.

### 14.3 Adversarial cases (each one is a test above or listed here to be added)
- Forged signature, wrong `kid`, malformed `kid`, 25 distinct unknown kids in an hour (→ 503 and one
  fetch each), signature over a different body, body > 256 KB, non-JSON body, key fetch 5xx (→ 503).
- Replayed `notificationId` ×10 (§79 "duplicate event ×10") and out-of-order notifications (older
  `eventDate` after newer) → one order state, the newest.
- State used twice, state from another workspace, state after expiry, state with the wrong environment,
  **callback with the right state from a browser without the nonce**, `claimEbayConnectState` by a
  different signed-in user.
- Token key rotated (two keys in `EBAY_TOKEN_KEY`) → old boxes still open and are re-boxed; hash key
  rotated → the deletion match still finds rows written under the old key.
- Identity API returns a different `userId` than the row being reconnected → new row, old row untouched.
- An eBay order whose id collides across two workspaces → two orders, two identities, no cross-write
  (§24 "yalnız kendi connection'ına write").
- Envelope carrying an email in `custom_fields` (planted) → `pii_in_safe_half`, nothing written; a
  planted phone in a `variationAspects` value → the value is diverted, the item title reads
  "[personalised item]".
- `paymentReferenceId` as array / `NET` tax lines / missing `TAX_BREAKDOWN` → review reason, never a crash.
- Sweep with a connection whose `credentials/current` is missing → `token_unreadable`, `reconnect_required`.
- Disconnect during a pass → the pass's summary write is skipped (`connection_disconnected`).
- A member calls `previewEbayImport` → `permission-denied`; a member's `syncEbayNow` ×200 in a day →
  `connection_share_spent` on that connection, another workspace's sweep unaffected.
- Regression (§82): Etsy OAuth/import fixtures unchanged, `etsySource` preserved, Square/Woo e2e green
  (their worker untouched), Orders UI loads with zero eBay rows, `listProviders()` order unchanged.

---

## 15. Rollout, acceptance and the PR checklist

Order of commits (small, on `ebay-connector`, never pushed by the agent):
1. `commerce/flags.js` connectors area + `readCommerceFlags` merge + test; `access-control-policy.test.js`
   regex + policy paragraph.
2. `commerce-ebay-adapter.test.js` marketplaceId case (red) → adapter `external_admin_url` fix (green).
3. `commerce/ebay/{oauth,client,sanitize,notification,status,quota,cursorPlan,hashing,keys}.js`,
   `connectionCapabilities.proveEbay`, `privacy/reveal.js` + qa (synthetic fixture for the adapter,
   captured fixture required by the sanitize test — see owner actions).
4. `ebayConnector.js` + index wiring (`EBAY_RUNTIME`, `ebayEventWorker`, `retryCommerceEvent` branch,
   `revealRestrictedCustomer`) + rules (six blocks) + purge + release branch + lifecycle + retention
   sweep step + wiring pins.
5. e2e suites.  6. Web card/section/callables/callback/start page/translations.  7. Guide + corpus rebuild.
8. Swift card + view + dictionary (xcodebuild proof).  9. Android card + detail + repository + dictionary + unit test (gradle proof).

Owner actions outside the repo (not this task), **in this order**:
1. Sandbox keyset + RuName with the accepted/declined URLs; a sandbox seller and a sandbox buyer.
2. Place the fixture order (§8.1: phone, `addressLine2`, `companyName`, checkout notes, gift message,
   personalised aspect, two lines), ship it from the sandbox, capture `getOrder` and
   `getShippingFulfillments` into `test/fixtures/ebay-sandbox-*.json` with the `_captured` header
   (record whether `lastModifiedDate` moved on shipment), commit.
3. Create the service account `ebay-connector@eggcraft-studio` with the grants of §3.2; create the
   **five** secrets (`EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_TOKEN_KEY`, `EBAY_HASH_KEY`,
   `EBAY_CALLBACK_KEY` — the last three 32-byte hex, one key each for now) granted to that account only;
   set the same value as `EBAY_CALLBACK_KEY` in Hostinger as `NIVADESK_EBAY_CALLBACK_KEY` and run §5.4's
   rollout step 2a to prove the web reads it **at runtime**; only then commit
   `functions/.ebay-secrets-ready` with all five names in `EBAY_SECRET_PARAMS`. The marker is the gate:
   without it `EBAY_RUNTIME` is `{}`, nothing is mounted, and every callback answers 401 →
   `reason=unavailable` forever (§5.4, *Rollout*). This list and §5.4's rollout are the same list; they
   must not drift.
4. Deploy; **then** register `ebayNotifications` as the notification destination with the
   verification token (the challenge is answered without secrets; the deletion POST needs them —
   hence step 3 first), subscribe `MARKETPLACE_ACCOUNT_DELETION`, press *Send Test Notification*
   and confirm a ledger row `done`.
5. TTL policies for `ebayConnectStates.expireAt`, `deliveries.expireAt`, `ebayDeletionRequests.expireAt`.
   No queue to create by hand: `onTaskDispatched` makes `ebayEventWorker`'s queue at deploy time under
   the function's own name in europe-west2, which is exactly what `enqueueEbayTask` targets
   (`locations/europe-west2/functions/ebayEventWorker`). Grant the connector account
   `roles/cloudtasks.enqueuer` on it after the first deploy.
6. Set `NIVADESK_EBAY_CONNECTOR=1` and the flag doc for the first sandbox seller; run the §14 e2e
   list against the sandbox; capture the `ORDER_CONFIRMATION` payload for the §7.5 follow-up.
7. Production keyset only after sandbox acceptance; at the flip run `purgeEbaySandboxRows` (§7.7),
   set the production RuName/env, re-register the destination if the URL changed; then flip the card (§77 E8).

Acceptance owned by this half (§84): secure OAuth works (browser-bound) · seller scopes verified ·
order import idempotent and resumable · notification (deletion, ungated) + reconciliation
(15-minute, bisected, nightly, catch-up) work · Sync Health present with real telemetry · retry/DLQ
present (`ebayEventWorker` + `retryCommerceEvent`) · feature flag/rollback tested (e2e #10) ·
existing integrations regression passed.

PR checklist (§88), each PR body carries: requirement section(s) · API version (`sell/fulfillment/v1`,
`identity/v1/oauth2`, `commerce/identity/v1`, `commerce/notification/v1`) · scopes requested (the
two read scopes) · idempotency / stale / rate-limit / retry behaviour · rollback (flag off, catch-up
on) · PII impact (split table §8.1, keyed hashes, retention 90 days after delivery with restricted-doc
deletion, deletion endpoint ungated) · secrets identity (`ebay-connector@`, trip-wire green) · audit
(`commerceEvents`, `syncLog`, `piiAccessLog`) · tests run (qa, rules, e2e, xcodebuild, gradle) ·
sandbox verification evidence (seller test account order ids, fixture `_captured` header).
