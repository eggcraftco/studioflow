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
| 8 | Shopify Connection screen flips to Connected automatically (4 s poll) | PASS-live | 12 Aug, Cloud Run rev 00003: completed connect on localhost, Shopify tab flipped to Connected untouched within the 4 s poll |
| 9 | orders/create + orders/paid webhook → order in NivaDesk with full field mapping | PASS-live | #1001: name, email, £45 paid, status "Not Yet", customFields Source/Store/Domain/Order ID/Status |
| 10 | Out-of-order delivery does not duplicate (paid before create) | PASS-live | create arrived after paid → `skipped / no_changes`; single doc |
| 11 | Event-id idempotency claim; replay acked as duplicate | PASS-live | Same event id twice → `{"ok":true,"duplicate":true}`, no reprocess |
| 12 | Paid-gate: unpaid order skipped (unless importUnpaid) | PASS-live | Fake `financial_status: pending` → syncLog `skipped / unpaid_pending`, no doc |
| 13 | Tag include/exclude filters | PASS-live | includeTags `[niva-e2e]` set via bridge → untagged paid order `skipped / tag_not_included`, no doc; settings restored |
| 14 | Product / collection filters (incl. fail-closed collection lookup) | PASS-code | Same `shopifyOrderPassesFilters` path as #13; collection lookup throws → retryable failed row (never silently violates the filter) |
| 15 | Customer upsert + matching (shopifyCustomerId > email > phone) | PASS-live | Emma upserted on #1001; on #1002 matched to the SAME `musteriler` doc (no duplicate) |
| 16 | Workflow rules: defaultStatus / todoTemplate / assignee / productWorkflows first-match | PASS-live | Staged order #1002 with template settings: status "In Progress", 3 todos created, each assignedToEmail review@nivadesk.app; settings restored after. Email→uid resolution added to saveSettings and live-verified 12 Aug (review@nivadesk.app → uid; clearing the email clears the uid). productWorkflows first-match remains code-verified |
| 17 | Update webhooks patch, never stomp merchant edits | PASS-live | orders/updated rows `ok` across create/paid/fulfil cycles; targeted patches only |
| 18 | Fulfilment webhook → isDispatched + tracking + history | PASS-live | #1001 marked fulfilled with NIVA-TEST-123456 → isDispatched true, trackingNumber + courier set, history "Dispatched (Shopify)", syncLog fulfillments/create + orders/fulfilled ok |
| 19 | Refund webhook → amount from transactions/line items + history row | PASS-code | `applyShopifyRefundEvent` with `amountHistoryValue` |
| 20 | Historical import (range/selected, GraphQL→REST transform, progress, retry) | PASS-live | Full UI cycle on Cloud Run rev 00004: Preview "1 orders in this range" → Start (echoed hidden fields) → progress poll → "1/1 processed · 0 created · 1 skipped · 0 failed" |
| 21 | GDPR: data_request / customers-redact / shop-redact + HMAC negative | PASS-live | 200 + audit row; graceful unknown-store redact; sample-shop tree purged by shop/redact; bad signature → 401 (see COMPLIANCE.md §2) |
| 22 | Uninstall → reinstall cycle | PASS-live | 12 Aug: uninstall → status uninstalled + token cleared + sessions purged (fix f66c754 — surviving sessions previously made reinstall skip token exchange and stay stuck); reinstall via grant screen → fresh token exchange → status active, workspace link + currencyCode resumed |

## Staging checklist — result (12 Aug, Cloud Run revs 00003–00004)

1. ✅ Connection auto-flip (#8) — live.
2. ✅ Settings save toast + persisted values render back on revisit.
3. ✅ Import: preview count, start, progress poll, idempotent finish. (Failed-row Retry: same proven form-submit pattern; no failed row available to click.)
4. ✅ History list renders 10 events with badges/reasons/links.
5. ✅ Live fulfilment → dispatched + tracking + history in NivaDesk.
6. ✅ Workflow template + assignee on staged order #1002 — status/todos/email assignment live; email→uid resolution noted as follow-up.
7. ✅ Uninstall → reinstall cycle — live; found+fixed the stuck-session bug (f66c754), resume-as-active verified.
8. ⏳ Non-owner `shopifyCompleteConnect` server rejection — needs a member-account ID token; UI gating verified.

## Residue from live tests (intentional, harmless)

- Review workspace holds test orders **#1001 (£45, fulfilled)** and **#1002 (£30, In Progress + 3 todos)** for Emma Testcustomer + one customer record — delete on request.
- Store syncLog contains two `skipped` rows (`#T9001 unpaid_pending`, `#T9002 tag_not_included`) documenting tests 12–13.
