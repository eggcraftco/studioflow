# Xero connector — plan before code (3 Sep 2026)

Source: `NivaDesk_Xero_AI_Accounting_Entegrasyon_Spesifikasyonu.md` (2 Sep 2026). Per its §28 this is the
analysis the spec asks for before any code changes. Positioning is unchanged from QuickBooks:
**NivaDesk runs the business; the accounting provider makes it official; every economic event once.**

## 1. Verified Xero facts (developer.xero.com, read 3 Sep 2026)

| Topic | Fact |
|---|---|
| Authorize | `https://login.xero.com/identity/connect/authorize?response_type=code&client_id&redirect_uri&scope&state` — redirect URI must be https (exact match) |
| Token | `POST https://identity.xero.com/connect/token`, `Authorization: Basic base64(client_id:client_secret)`, form `grant_type=authorization_code|refresh_token` |
| Token life | access 30 min (JWT, carries `authentication_event_id` + `scope[]`), refresh 60 days; **every refresh returns a new refresh token, save both**; the previous refresh token keeps a 30-minute grace |
| Tenants | `GET https://api.xero.com/connections` (Bearer) → `[{ id, authEventId, tenantId, tenantType, tenantName }]`; filter `?authEventId=` for the tenants added in this consent; `DELETE /connections/{id}` removes one tenant |
| Revoke | `POST https://identity.xero.com/connect/revocation` body `token=<refresh_token>` (Basic) — removes every connection of that user |
| API | `https://api.xero.com/api.xro/2.0/<Resource>` with `Authorization: Bearer` + `xero-tenant-id` + `Accept: application/json`; `If-Modified-Since` for incremental reads; `page=` (100 rows) on Invoices, CreditNotes, Contacts, BankTransactions, ManualJournals; `Idempotency-Key` on writes |
| Scopes (granular since Mar 2026) | read-only phase: `openid profile email offline_access accounting.settings.read accounting.contacts.read accounting.invoices.read accounting.payments.read accounting.banktransactions.read accounting.attachments.read`; write phases add `accounting.invoices accounting.payments accounting.banktransactions accounting.attachments accounting.contacts` and, only if the COGS mode needs it, `accounting.manualjournals`; `accounting.journals.read` is a premium (Advanced-tier) capability and is **not** requested |
| Limits | per tenant: 5 concurrent, 60/min, 1,000/day (Starter) or 5,000/day (Core+); app-wide 10,000/min; headers `X-DayLimit-Remaining`, `X-MinLimit-Remaining`, `X-AppMinLimit-Remaining`; 429 carries `X-Rate-Limit-Problem` + `Retry-After`; uncertified apps: 5 connections (Starter) and an organisation may connect at most two uncertified apps |
| Webhooks | categories: Contact, Invoice, Credit Note, Overpayment, Prepayment, Subscription — **nothing else** (no payments, bank transactions, items, accounts); payload `{ events:[{ resourceUrl, resourceId, eventDateUtc, eventType, eventCategory, tenantId, tenantType }], firstEventSequence, lastEventSequence, entropy }`; header `x-xero-signature` = base64(HMAC-SHA256(webhook key, raw body)); **intent-to-receive**: reply 200 to correctly signed and 401 to incorrectly signed payloads within 5 s, no cookies; failures retried for 24 h then the subscription is disabled (events kept 31 days) |
| Bank feeds | `bankfeeds` scope is certification-only (closed); the public Accounting API exposes no unreconciled statement lines — capability `bankFeedPendingRows: false` |

## 2. What the accounting core already gives us (no provider columns anywhere)

`functions/accounting/core/{adapter,store,fingerprint}.js` are provider-agnostic: connection/identity/cursor ids are
`provider__…`, capabilities come from `defaultCapabilities(provider)`, mappings/attention/audit are per connection.
`functions/accountingFunctions.js` however hard-codes `PROVIDER = "quickbooks_online"` in ~40 places (connect,
callback, catalogue import, reconcile, webhook, disconnect, sweep, overview filter). The web section
`app/settings/QuickBooksIntegrationSection.tsx` is 631 lines of QuickBooks-named calls over generic accounting
types (`lib/studioflow/quickbooks.ts`). Existing MCP tools (`index.js`): read — `search_orders`, `get_order_detail`,
`get_order_financials`, `get_financial_overview`, `get_extra_spending_overview`, `get_dashboard_summary`,
`get_bank_spending_summary`, `search_bank_transactions`, `search_notes`, `get_note_detail`, `search_inventory`;
write — `create_order`, `update_order_status`, `add_order_note`, `create_note`, `update_note`, `append_note`,
`pin_note`, `archive_note`, `create_inventory_item`, `attach_bank_receipt`. None touches an accounting provider;
none returns a "derived accounting effect" yet (spec §16.3 — phase 6).

## 3. Provider-specific places Xero must not copy

- `accountingFunctions.js`: `PROVIDER` constant, `disconnectQuickBooks`, attention kinds `changed_in_quickbooks` /
  `deleted_in_quickbooks`, SyncToken wording in conflict messages, `CDC_ENTITIES`. → generalise into a small
  provider registry `{ oauth, client, normalize, webhook, adapter, conflictStrategy }` keyed by provider; the
  callables stay generic and take `connectionId`, whose prefix names the provider.
- `BANK_MATCH_STATUSES` has `awaiting_match_in_quickbooks` — add the neutral `awaiting_reconciliation_in_provider`
  and map both providers to it.
- Web: `IntegrationManageTarget` union + `page.tsx` dispatch + `integrations.ts` card (`xero` is `planned` today).

## 4. Decisions the owner has to make (spec §28)

1. **Xero app** — create an "Auth Code" app at developer.xero.com (workspace: EGGcraft Limited / NivaDesk), redirect
   URIs `https://europe-west2-eggcraft-studio.cloudfunctions.net/xeroOAuthCallback` and
   `https://nivadesk.app/xero/callback`; note the Client ID, generate a Client Secret; create the webhook
   (Contacts, Invoices, Credit Notes) pointing at `https://europe-west2-eggcraft-studio.cloudfunctions.net/xeroWebhook`
   and note the Webhook Key. Secrets (owner enters them, never through chat): `NIVADESK_XERO_CLIENT_ID`,
   `NIVADESK_XERO_CLIENT_SECRET`, `NIVADESK_XERO_WEBHOOK_KEY`. Token boxing reuses `NIVADESK_QBO_TOKEN_KEY`
   (already provisioned) unless the owner wants a separate `NIVADESK_XERO_TOKEN_KEY`.
2. **Tier** — Starter (5 connections, 1,000 calls/day) is enough for EGGcraft + tests; the budget/limits live in
   `xero/client.js` config, never in callers.
3. **Primary provider** — default stays Pandle `primary_write`; Xero starts `shadow_read` (same one-writer rule as
   QuickBooks). Migration date is an owner action in the UI, never automatic.
4. **Test organisation** — Xero's Demo Company (every Xero login has one) or a free trial org; the webhook
   intent-to-receive check needs the function deployed first.
5. **Scopes** — read-only set above for phase 2; each write phase re-consents with the extra scopes and the UI shows
   `Update permissions` on `insufficient_scope` instead of "disconnected".

## 5. Phase plan (what changes, what stays)

**Phase 1 (core refactor, no behaviour change for QuickBooks):** provider registry in `accountingFunctions.js`,
generic attention kinds, generic bank-match status, `PROVIDERS` += `xero`, capability registry for Xero
(`webhooks: { contacts, invoices, creditNotes, overpayments, prepayments }`, `journals: { manualWrite: "verify",
fullJournalRead: false }`, `bankFeedPendingRows: false`), conflict strategy `updatedDateUtc + snapshot hash`.
Regression: `test/qa/accounting-core.test.js` (10) + `test/e2e/accounting-quickbooks-emulator.test.js` (9) unchanged.

**Phase 2 (Xero read-only):** `functions/accounting/xero/{oauth,client,webhook,normalize,adapter}.js`; callables
`xeroConnectStart`, `xeroOAuthCallback` (→ tenant selection step: the callback stores the grant, lists
`/connections?authEventId=`, and the owner picks the organisation in the UI via `xeroSelectTenant`),
`xeroSyncNow` (Organisation, Accounts, TaxRates, Contacts, Items catalogue + `If-Modified-Since` reconciliation of
Invoices / CreditNotes / Payments / BankTransactions / BankTransfers), `xeroWebhook` (ITR-correct, inbox by
`tenantId+resourceId+eventDateUtc`), `xeroDisconnect` (DELETE connection, forget tokens). Web: the QuickBooks
section becomes `AccountingProviderSection` with a provider prop (Overview / Setup / Mappings / Reconciliation /
Sync activity / Settings) — same wizard steps, Xero words. Rules: the accounting subcollections already cover it;
root `accountingRealms/xero__<tenantId>` reuses the realm map. Tests: `test/e2e/accounting-xero-emulator.test.js`
with a fake Xero client (connect → tenant pick → catalogue → suggestions → webhook ITR + event → reconcile →
refresh with rotation → disconnect). Rollback: Xero is additive; disabling = not deploying the new functions.

**Later phases** follow the spec (3 draft sales posting, 4 payments/clearing, 5 purchases, 6 AI proposal layer,
7 inventory/COGS, 8 automation) and are shared with QuickBooks through the core.

## 6. Security assumptions

Tokens boxed with the token key, server-only `accountingTokens`; refresh serialised with the existing per-connection
lock (`refreshTokenWithLock`); tenant id is never taken from client input — the connection doc names it; no Xero data
leaves the server to any model; webhook signature checked on the raw body before any read of the payload.

## 7. Built — phases 1 and 2 in code (3 Sep 2026, night)

**Phase 1 (registry).** `functions/accountingFunctions.js` now keeps a `PROVIDER_MODULES` registry
(`quickbooks_online`, `xero`): normalize module, CDC/incremental entity list, subscribed webhook entities, look-back
window, inline webhook limit, token scope (`connection` for QuickBooks, `grant` for Xero), conflict field
(`syncToken` vs `updatedAt`) and attention kinds (`changed_in_xero` / `deleted_in_xero`). Every shared path reads
`connection.provider`; `providerOf(connectionId)` derives it from the `provider__` prefix. Contact matching moved to
`accounting/core/matching.js` (re-exported from the QuickBooks normalize). `core/adapter.js`: `PROVIDERS.xero`,
`defaultCapabilities("xero")`, `BANK_MATCH_STATUSES += awaiting_reconciliation_in_provider`. Each function names the
secret set it needs (`secretsFor: quickbooks | xero | core | all`); index.js maps that to `defineSecret` arrays, so the
QuickBooks and core functions deploy while the Xero secrets do not exist yet. **The 6-hourly sweep binds both sets and
therefore deploys only after the three Xero secrets are created.** QuickBooks behaviour unchanged: QA 15/15, QuickBooks
e2e 9/9.

**Phase 2 (Xero read-only).** `functions/accounting/xero/{oauth,client,webhook,normalize,adapter}.js`. Functions:
`xeroConnectStart` (read scope set), `xeroOAuthCallback` (exchange → JWT `authentication_event_id` → `/connections?authEventId=`
→ one organisation links at once; several park the tokens under `accountingTokens/xero_grant__<authEventId>` and the
names in the state doc for 15 minutes), `xeroListTenants` + `xeroSelectTenant` (owner picks; tokens never reach the
browser), `xeroSyncNow` (organisation + currencies, accounts, tax rates, one Contacts read split into customers and
suppliers, items; then If-Modified-Since over Contact/Item/Account/Invoice/CreditNote/Payment/BankTransaction/BankTransfer/
Overpayment/Prepayment), `xeroWebhook` (`x-xero-signature` base64 HMAC on the raw body; ITR: 200 for a correctly signed
empty payload, 401 otherwise; at most 5 events fetched inline, the rest wait for the sweep), `xeroDisconnect`
(`DELETE /connections/{id}` for this organisation; the consent's refresh token is revoked and forgotten only when no
other linked organisation shares it). Realm map `accountingRealms/xero__<tenantId>`. Xero e2e
`test/e2e/accounting-xero-emulator.test.js`: 9/9 (fake Xero, network blocked).

**Web.** `app/settings/QuickBooksIntegrationSection.tsx` is now the generic `AccountingProviderSection` with
`QuickBooksIntegrationSection` / `XeroIntegrationSection` wrappers; copy uses `{provider}`, `{providerName}`, `{vendor}`,
`{company}` placeholders (60 template keys, 11 languages). Xero has no environment picker, shows the read-only scope
note, and renders the organisation chooser when the callback answers `?section=xero&xero=choose&state=…`.
`lib/studioflow/quickbooks.ts` carries the Xero callables; `integrations.ts` lists Xero as a native card with live
status; `app/xero/callback/page.tsx` forwards to the function. Not deployed to the web until "canlıya at".

**What the owner still does (in this order).** Create the Xero app (redirect URIs
`https://europe-west2-eggcraft-studio.cloudfunctions.net/xeroOAuthCallback` and `https://nivadesk.app/xero/callback`;
webhook URL `https://europe-west2-eggcraft-studio.cloudfunctions.net/xeroWebhook`, Contacts + Invoices + Credit notes)
→ `firebase functions:secrets:set NIVADESK_XERO_CLIENT_ID`, `NIVADESK_XERO_CLIENT_SECRET`, `NIVADESK_XERO_WEBHOOK_KEY`
(Xero tokens are boxed with `NIVADESK_QBO_TOKEN_KEY`) → deploy by name (`functions/.xero-secrets-ready` is the marker that lets index.js declare the secrets; the CLI's
discovery step runs with a minimal environment and loads neither the shell nor `functions/.env`, so an env flag never
reached it — two deploys bound only the QuickBooks token key before the marker file fixed it) → save the
webhook in the portal (intent-to-receive runs against the live endpoint) → connect the Demo Company from Settings →
Integrations → Xero. Not built: native panels (web-first, as QuickBooks), phases 3+.

## 8. Live (3 Sep 2026, 22:27 UTC)

Xero app "NivaDesk" (app id `14bf723b-503e-4f20-a3bd-a49c96ea2de5`, web app, uncertified: 5 connections) created under the
owner's new Xero login; redirect URIs `…/xeroOAuthCallback` and `https://nivadesk.app/xero/callback`; webhook
`…/xeroWebhook` for Contacts, Invoices, Credit notes, Prepayments, Overpayments. The three secrets exist
(`NIVADESK_XERO_CLIENT_SECRET` is at version 2). All seven `xero*` functions and `scheduledAccountingReconcile` are
deployed with the Xero secrets bound (verified through the Cloud Functions v2 API). Intent-to-receive: **OK** at
22:26:54 UTC (the first attempt failed with three 401s because the secrets were not bound — see §7). Remaining: deploy
the web ("canlıya at") so the Xero card and section are on nivadesk.app, activate the Demo Company under the Xero login
(my.xero.com → Try Demo Company), then connect it from Settings → Integrations → Xero.

**Demo Company on a brand-new Xero login (3 Sep 2026).** A login created through the developer sign-up has no
organisation; my.xero.com and the "organisation settings" link both land on the "Add your business" trial wall, which
no longer shows "Try the Demo Company", and the consent screen says "You have no organisation setup". The old direct
route still works and creates the demo organisation immediately:
`https://my.xero.com/!xkcD/Dashboard/DemoOrganisation/CreateDemoAndLogin?versioncode=VERSION%2FUK` (other regions:
`VERSION%2FAU`, `%2FNZ`, `%2FUS`, `%2FGLOBAL`). The demo company resets every 28 days; the connection must be made again
after a reset.
