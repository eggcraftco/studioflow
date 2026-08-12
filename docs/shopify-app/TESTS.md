# NivaDesk Shopify App — Test Matrix

Statuses: **PASS-live** (exercised against deployed functions / real dev store),
**PASS-code** (behaviour verified by code inspection + adjacent live test),
**STAGING** (needs a healthy embedded-app session or production hosting — see note),
**DEFERRED** (post-v1 feature).

Last run: **12 Aug 2026**, store `nivadesk-dev-store.myshopify.com`, workspace
`review@nivadesk.app / My Studio` (`KSQidetb3oOSItE9amLISf9Lh6h2`).

> **RESOLVED (12 Aug, on Cloud Run):** the dead buttons were NOT a tunnel/CDN
> issue — React 18 does not attach JSX event props (onClick/onChange) to custom
> elements, so Polaris web-component handlers never fired inside the iframe.
> Proven by discriminator test: `fetcher.Form` + `s-button type="submit"`
> ("Save settings") worked while onClick buttons on the same hosting were dead.
> Fix: every in-iframe action is now a native form submission (hidden intent
> inputs), selects are static-initial + form-submitted, and conditional fields
> render unconditionally with "only used with…" hints. Only App Bridge
> chrome-slot buttons (e.g. "Sync now") may keep onClick. Keep this pattern for
> ALL future screens.

| # | Scenario | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Install on dev store (managed install, scopes auto-grant) | PASS-live | App embedded in admin; scopes `read_orders, read_customers, read_products, read_fulfillments` granted |
| 2 | afterAuth → `upsertStore` persists offline token server-side | PASS-live | `shopifyStores/{shop}` doc: token present, status `pending`, shopName/email from GraphQL |
| 3 | Begin connect mints single-use nonce (15 min, timing-safe) | PASS-live | Via UI (first session) and direct bridge call; nonce rotates/reuses while valid |
| 4 | Connect page — signed-out state offers Sign in / Create account with safe `?next=` | PASS-code | Same-origin-only `nextDestination()`; open-redirect blocked (`//` rejected) |
| 5 | Connect page — workspace picker lists memberships, owner-first | PASS-live | Rules `allow list` fix deployed; roletest123 saw own (selectable) + member (locked) |
| 6 | Non-owner workspace cannot be linked | PASS-live (UI) | "owner only" row disabled; server double-checks via `requireWorkspaceForBilling(request, true)` |
| 7 | `shopifyCompleteConnect` links store, clears nonce, sets active | PASS-live | Ran twice (roletest123 My Studio → review My Studio) |
| 8 | Shopify Connection screen flips to Connected automatically (4 s poll) | STAGING | Fix committed (157a977: awaitingConnect state); blocked by dead-iframe env |
| 9 | orders/create + orders/paid webhook → order in NivaDesk with full field mapping | PASS-live | #1001: name, email, £45 paid, status "Not Yet", customFields Source/Store/Domain/Order ID/Status |
| 10 | Out-of-order delivery does not duplicate (paid before create) | PASS-live | create arrived after paid → `skipped / no_changes`; single doc |
| 11 | Event-id idempotency claim; replay acked as duplicate | PASS-live | Same event id twice → `{"ok":true,"duplicate":true}`, no reprocess |
| 12 | Paid-gate: unpaid order skipped (unless importUnpaid) | PASS-live | Fake `financial_status: pending` → syncLog `skipped / unpaid_pending`, no doc |
| 13 | Tag include/exclude filters | PASS-live | includeTags `[niva-e2e]` set via bridge → untagged paid order `skipped / tag_not_included`, no doc; settings restored |
| 14 | Product / collection filters (incl. fail-closed collection lookup) | PASS-code | Same `shopifyOrderPassesFilters` path as #13; collection lookup throws → retryable failed row (never silently violates the filter) |
| 15 | Customer upsert + matching (shopifyCustomerId > email > phone) | PASS-live | Emma Testcustomer in `musteriler` with `source: shopify`; skip paths upsert nothing (verified after #12/#13) |
| 16 | Workflow rules: defaultStatus / todoTemplate / assignee / productWorkflows first-match | PASS-code + partial live | defaultStatus "Not Yet" applied live to #1001; template/assignee mapping code-verified (exact client todo schema), needs a staged order to observe end-to-end |
| 17 | Update webhooks patch, never stomp merchant edits | PASS-code + live update row | orders/updated on #1001 → targeted patch, `ok`; full stomp-regression check on STAGING list |
| 18 | Fulfilment webhook → isDispatched + tracking + history | PASS-code | `applyShopifyFulfilmentEvent` (both payload shapes); live fulfilment run on STAGING list |
| 19 | Refund webhook → amount from transactions/line items + history row | PASS-code | `applyShopifyRefundEvent` with `amountHistoryValue` |
| 20 | Historical import (range/selected, GraphQL→REST transform, progress, retry) | PASS-live | Sync-now (24 h) and direct endpoint: `done`, created:1 in review workspace, idempotent re-run skipped:1; UI progress/retry buttons on STAGING list |
| 21 | GDPR: data_request / customers-redact / shop-redact + HMAC negative | PASS-live | 200 + audit row; graceful unknown-store redact; sample-shop tree purged by shop/redact; bad signature → 401 (see COMPLIANCE.md §2) |
| 22 | Uninstall: app/uninstalled clears token, status uninstalled; reinstall → pending again | PASS-code | Handler at functions/index.js (app/uninstalled branch) + `upsertStore` reinstall logic; live uninstall/reinstall cycle on STAGING list |

## Staging checklist (rerun on healthy embedded session / prod hosting)

1. Connection auto-flip to Connected without manual reload (#8).
2. Settings screen save → verify persisted values render back (embedded UI path).
3. Import screen: preview count, progress polling, failed-row Retry button.
4. History screen list + Retry on a failed row.
5. Live fulfilment (mark #1001 fulfilled with tracking) → dispatched fields + history in NivaDesk. *(Will modify the test order — fine.)*
6. Workflow template + assignee on a fresh staged order (set template first, then create order).
7. Uninstall → reinstall cycle on the dev store.
8. Non-owner `shopifyCompleteConnect` server rejection (needs a member-account ID token).

## Residue from live tests (intentional, harmless)

- Review workspace holds test order **#1001 Emma Testcustomer (£45)** + customer record — delete on request.
- Store syncLog contains two `skipped` rows (`#T9001 unpaid_pending`, `#T9002 tag_not_included`) documenting tests 12–13.
