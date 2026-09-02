# Accounting connector — QuickBooks Online first, Pandle beside it

Source: `NivaDesk_QuickBooks_Online_Entegrasyon_Spesifikasyonu.md` (2 Sep 2026). This file is the
engineering reading of that spec: what is built, where it lives, and what is deliberately not done.
Positioning stays: **NivaDesk runs the business; the accounting provider makes it official; every
economic event is recorded once.**

## Verified provider facts (Intuit developer portal, read 2 Sep 2026)

| Topic | Fact |
|---|---|
| Authorize URL | `https://appcenter.intuit.com/connect/oauth2?client_id=…&response_type=code&scope=com.intuit.quickbooks.accounting&redirect_uri=…&state=…` |
| Callback | `?code=…&state=…&realmId=…` (the realm is the QuickBooks company id) |
| Token endpoint | `POST https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer`, `Authorization: Basic base64(client_id:client_secret)`, form body `grant_type=authorization_code|refresh_token` |
| Token response | `access_token` (3600 s), `refresh_token` (rolling 100 days, **may change on every refresh — always store the latest**), `x_refresh_token_expires_in` |
| Revoke | `POST https://developer.api.intuit.com/v2/oauth2/tokens/revoke` body `{ "token": refresh_token }` (Basic auth) |
| API base | sandbox `https://sandbox-quickbooks.api.intuit.com`, production `https://quickbooks.api.intuit.com`; `/v3/company/{realmId}/…?minorversion=75` |
| Webhook payload | CloudEvents **array**: `[{ specversion, id, source, type: "qbo.<entity>.<created|updated|deleted|merged|voided|emailed>.v1", datacontenttype, time, intuitentityid, intuitaccountid (realm), data? }]`; `data.deletedid` on merge. Parser also accepts the legacy `{ eventNotifications: [{ realmId, dataChangeEvent: { entities: [{ name, id, operation, lastUpdated }] } }] }`. |
| Webhook signature | header `intuit-signature` = base64(HMAC-SHA256(verifier_token, raw body)); one verifier per app per environment (Development / Production), endpoints configured separately per environment |
| Change Data Capture | `GET /v3/company/{realmId}/cdc?entities=Invoice,Payment,…&changedSince=<ISO>` — at most 30 days back; deleted rows come with `status: "Deleted"` |
| Rate limits | configurable in `functions/accounting/quickbooks/client.js` (`QBO_LIMITS`), never hardcoded in callers; 429/5xx → exponential backoff + jitter |

## Architecture (REQ-ARCH-001/002)

```
functions/accounting/
  core/
    adapter.js        the AccountingProviderAdapter contract + capability registry shape
    connections.js    companies/{cid}/accountingConnections/{connId}  (one primary writer per period)
    identities.js     companies/{cid}/accountingIdentities/{…}        (external id ↔ NivaDesk entity, SyncToken)
    events.js         companies/{cid}/accountingEvents/{eventId}      (normalised economic events)
    postings.js       companies/{cid}/accountingPostings/{postingId}  (fingerprint-unique, state machine)
    fingerprint.js    sha256(workspace|source_provider|source_connection|economic_event_key|policy|period)
    inbox.js          companies/{cid}/accountingInbox/{…}             (raw webhook envelopes, idempotent by event id)
    attention.js      companies/{cid}/accountingAttention/{…}         (Needs Attention queue)
    engine.js         orchestration: connect → profile → mappings → preview → post → reconcile
  pandle/adapter.js   thin adapter over functions/pandle.js (shadow_read / bank-row confirm capability only)
  quickbooks/
    client.js         pure HTTP client (fetchImpl injectable): oauth, query, cdc, entity read/write
    adapter.js        QuickBooksOnlineAccountingAdapter
    webhook.js        signature check + CloudEvents/legacy parser (pure)
    normalize.js      QBO entity → AccountingSnapshot (pure)
functions/accountingFunctions.js   callables + webhook + schedules, wired from index.js by name
```

Rules that never bend:

- Provider-specific ids live in `accountingIdentities`, never on orders/purchases/bank rows.
- `accountingConnections` carries `mode` (`primary_write | shadow_read | migration_read | disabled`) and
  `writeBoundaryDate`; the engine refuses a second `primary_write` for an overlapping period.
- Tokens: `companies/{cid}/accountingTokens/{connId}` (deny-listed in rules), secrets boxed with
  AES-256-GCM under `NIVADESK_QBO_TOKEN_KEY`; the realm id is stored with the token atomically.
- Secrets: `NIVADESK_QBO_CLIENT_ID`, `NIVADESK_QBO_CLIENT_SECRET`, `NIVADESK_QBO_WEBHOOK_VERIFIER`,
  `NIVADESK_QBO_TOKEN_KEY`. Environment (`sandbox | production`) is a connection field chosen at connect
  time, not a deploy-time constant (same lesson as Square).
- Bank feed "For Review" rows are **not** assumed reachable: capability `bankFeedPendingRows: {read:false, write:false}`,
  and bank match status is reported as `awaiting_match_in_quickbooks`.

## Phases

| Phase | Scope | Status |
|---|---|---|
| 0 | decisions (company type, VAT, plan, Pandle vs migration, posting modes) | user + accountant; the wizard records them |
| 1 | generic core (adapter contract, connections, identities, events, postings, fingerprint, inbox, attention, capability registry, queue/retry) | this pass |
| 2 | QuickBooks read-only: OAuth + realm, CompanyInfo/Preferences, accounts, tax codes, customers, vendors, items, webhook inbox, CDC reconciliation, mapping suggestions, duplicate report | this pass (server + web) |
| 3 | sales posting (Estimate, Invoice/SalesReceipt, Payment, credit/refund policy, detailed/daily summary, preview + manual approval) | next |
| 4 | purchases and documents | later |
| 5 | provider clearing accounts, fees, refunds, payouts, awaiting-bank-match | later |
| 6 | optional inventory accounting (valuation, COGS journal) | later |
| 7 | controlled automation and read-back conflicts | later |

## What the user must do once

1. Create the app on developer.intuit.com with the **QuickBooks Online Accounting** scope.
2. Development → Keys & OAuth: copy Client ID / Client Secret into the two secrets above.
3. Redirect URI: `https://nivadesk.app/quickbooks/callback`.
4. Development → Webhooks: endpoint `https://europe-west2-eggcraft-studio.cloudfunctions.net/quickbooksWebhook`,
   enable the entities listed in `functions/accounting/quickbooks/webhook.js` (`SUBSCRIBED_ENTITIES`), copy the
   verifier token into `NIVADESK_QBO_WEBHOOK_VERIFIER`.
5. Production keys repeat steps 2–4 when the sandbox run is clean.
