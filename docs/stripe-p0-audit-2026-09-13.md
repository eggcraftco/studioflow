# Stripe PR-P0 — read-only audit and contract

Branch `stripe-connect-faz1`, cut from the deploy base `72634e62` so R4 (Payment
Links) stays independent of R1/R2. Nothing here is deployed, no Stripe call is
made, and no live configuration is changed.

Scope: the Stripe plan §3 audit table, §6 data contract, §8 webhook boundary and
§9 permission model. No secret value, customer record or payment method appears
below.

---

## 1. The audit table (plan §3)

### Stripe hesapları

| | |
| --- | --- |
| What Stripe is used for today | NivaDesk's **own SaaS subscriptions only**. `mode: "subscription"`, `client_reference_id: companyId`, `success_url: /plan?billing=success`. |
| Connect activity | **None.** `stripeAccount`, `account_links`, `on_behalf_of`, `transfer_data`, `application_fee` and any `acct_` literal return **zero hits** across `functions/`, `studioflow-web/`, `EGGcraft/` and `studioflow-android/`. There is no connected account, no onboarding flow and no Connect webhook in the tree. |
| Test / live | `configStatus()` in `functions/stripeBilling.js` refuses an `sk_live_` key unless `STRIPE_ALLOW_LIVE_BILLING=true`, and refuses any key that is not `sk_test_` under the same flag. Live billing is therefore a deliberate environment decision, not a deploy accident. |

### Kod

| | |
| --- | --- |
| The module | `functions/stripeBilling.js`, 2,968 lines / 141,171 bytes, a factory (`createStripeBillingFunctions`) wired in at `functions/index.js:5851-5869`. |
| Deployable exports | 11: `createStripeCheckoutSession`, `createStripeCustomerPortalSession`, `resyncStripeWorkspaceEntitlements`, `stripeWebhook`, `scheduledBillingEntitlementReconcile`, plus the six Apple/Google StoreKit-and-Play mirrors. Four are Stripe-specific; one spans providers. |
| Non-deployable internals | `cancelWorkspaceStripeSubscriptionsForDeletion` (used by `deleteMyAccount`) and the eight webhook internals exposed for `functions/test/qa/stripe-invoice-api-drift.test.js`. |
| Refund code | **There is no Stripe refund path.** No `stripe.refunds`, no refund webhook, nothing. Every refund NivaDesk knows about arrives through the bank feed (see *Muhasebe*). |
| Secrets in code | `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are declared with `defineSecret` in `functions/index.js:98` and `:106` and injected; `stripeBilling.js` itself declares none. |

### Veriler

| Identity | Where it lives |
| --- | --- |
| Stripe customer | `companies/{companyId}.billingCustomerId` (legacy alias `billingStripeCustomerId`) |
| Subscription | `companies/{companyId}.billing*` — plan, status, trial stamps, the seat and storage add-on subscription ids |
| Provider events | `stripeBillingEvents/{event.id}` — `{id, type, livemode, apiVersion, created, receivedAt, processingStatus, processedAt, result}` |
| PaymentIntent / charge | **Nowhere.** NivaDesk has never stored one. |

`companies/{companyId}.billing*` is protected server-side by
`protectedBillingFields()` and by the Firestore rules deny-list — an owner cannot
write their own plan or trial end date from a client.

### Webhook

| | |
| --- | --- |
| Endpoint | one: `stripeWebhook` (`onRequest`, `europe-west2`) |
| Signature | `stripe.webhooks.constructEvent(request.rawBody, signature, config.webhookSecret)`; a missing signature is 400, a failed verification is 400, and no body is parsed before verification. |
| Idempotency | `stripeBillingEvents/{event.id}`: a row with `processedAt` returns `{duplicate:true}` before any work. A handler that throws leaves the row at `processingStatus:"received"` with no `processedAt`, so Stripe's retry finds it retryable. |
| Handled events | six — `checkout.session.completed`, `customer.subscription.created` / `.updated` / `.deleted`, `invoice.paid`, `invoice.payment_failed`. |
| Ordering | `stripeSubscriptionEventOrdering` + `writeStripeSubscriptionLedger` already refuse to let an older event roll a newer subscription state back. |
| **`event.account`** | **never read, and not recorded.** `eventSummary()` stores `id`, `type`, `livemode`, `apiVersion`, `created` — no account. See §2 below; this is the finding that shapes PR-P1. |

### Yetkiler

`createStripeCheckoutSession`, `createStripeCustomerPortalSession` and
`resyncStripeWorkspaceEntitlements` all call `requireWorkspaceForBilling(...)`
then `ownerOrAdminRole(companyData, uid)` — which despite its name throws
`permission-denied` for anyone whose normalized role is not `owner`. Billing is
owner-only today.

The roles themselves come from `normalizeWorkspaceRole` (`functions/index.js:2487`):
`owner | admin | member | workflowOnly | viewOnly`. Money visibility is
`workspaceMemberAccess().financialInfo`; assigned-only scope is
`workspaceMemberAccess().assignedProjectsOnly`.

### Native

No payment UI on any native surface. The Stripe mentions in `EGGcraft/` and
`studioflow-android/` are plan/paywall copy and integration-hub labels, not
payment code:

| File | What it is |
| --- | --- |
| `EGGcraft/AuthViewModel.swift`, `ContentView.swift`, `NivaDeskIntegrations.swift` | plan and integration strings |
| `EGGcraft/BankInsights.swift`, `.../data/model/BankInsights.kt` | "Stripe" as a bank-statement vendor name |
| `.../features/orders/OrdersScreen.kt` | order payment-method labels |
| `.../features/settings/IntegrationsHub.kt` | the integrations grid entry |

Subscriptions on iOS/macOS go through StoreKit and on Android through Play
Billing, never Stripe — the six Apple/Google exports above are that rail.

### Ortam

| | |
| --- | --- |
| Flags | `STRIPE_BILLING_ENABLED`, `STRIPE_ALLOW_LIVE_BILLING`, `STRIPE_INTERNAL_TEST_BILLING_ENABLED`, `STRIPE_INTERNAL_TEST_EMAILS` |
| Emulator | the emulator pulls **real** secrets from Secret Manager (see the standing `emulator-sends-real-email` note), so a Connect test must use a fake transport rather than a live key — PR-P1's transport seam is not optional. |
| CI | the three real jobs are `unit`, `relay`, `emulator` in `.github/workflows/functions-tests.yml`. `functions/npm test` globs `test/qa/*.test.js`, so the PR-P0 test file below runs in `unit` with no wiring. |

### Muhasebe

The canonical order payment ledger today is an **array on the order document**,
`siparisler/{orderId}.payments[]`, capped at 200 entries:

```
{ id, amount, date, method, note, createdByUid, createdByEmail,
  bankTransactionId?, refund?: true }
```

* positive `amount` = money in; negative `amount` with `refund:true` = refund or
  chargeback, written only by `functions/bankFeed.js`;
* side effects on the same write: `paidAmount`, `remainingAmount`,
  `refundedAmount`, `orderValue = paidAmount + remainingAmount`;
* revenue is finance v4 (`functions/finance/engine.js`, `ENGINE_VERSION = 4`).

**There is no provider identity in this shape.** No `provider`, no
`externalPaymentId`, no `status`, no currency — the source of a marketplace
payment survives only as free display text in `method` (`seedInitialPayment`
writes `"WooCommerce"` there). Two facts follow, and both are PR-P2 blockers
rather than nice-to-haves.

---

## 2. The two findings that decide PR-P1 and PR-P2

### F1 — the subscription webhook would swallow a workspace's takings

`processStripeEvent` routes on `event.type` alone. Today that is correct: every
event on that endpoint is a platform event, because NivaDesk is the only Stripe
account involved. The moment a workspace connects its own account, Stripe starts
delivering that account's events too — and a workspace customer's
`checkout.session.completed` would land in `applyCompletedSubscriptionCheckout`,
NivaDesk's *entitlement* rail, carrying a stranger's session.

The boundary is therefore the first thing PR-P1 ships, and it is decided before
any handler runs: a platform event (no `event.account`) goes to the subscription
rail; a connected-account event goes to the collection rail and only if that
account resolves to exactly one workspace; an account we do not recognise is
**refused**, never processed on the platform rail as a fallback.
`functions/payments/eventBoundary.js` is that decision, and the test pins
`stripeBilling.js` as platform-only so the two rails cannot be merged by
accident.

### F2 — the order payment array is not admissible as payment evidence

`payments` appears **nowhere in `firestore.rules`**. `siparisler/{orderId}` allows
a direct client `update` to any workspace member with write access, and the
rules file itself documents why the neighbouring `estimates` array was left
unlocked:

> the Apple apps replace the whole order document on save
> (`FirebaseManager.setData(from:)`, no merge) … the guard cost real saves and
> protected only a cache

So any member — and any released iOS/Mac build predating the merge fix — can
rewrite `payments[]`, `paidAmount` and `refundedAmount` from a client. A Stripe
payment recorded only there is a claim, not a record. This is exactly the plan's
§3 warning, and it is confirmed by the rules rather than assumed from client
behaviour.

The consequence for §6.4: the canonical row must live in a **server-only**
collection that the rules deny to clients, with the order array kept as a
mirror. Reconciliation reads the server record; the clients keep reading the
array they already render.

### F2b — a currency symbol is not a currency

`companySettings.seciliParaBirimi` stores a **symbol**, from the nine in
`FINANCIAL_CURRENCY_SYMBOLS` (`functions/index.js:8848`): `£ $ € ₺ ¥ A$ C$ CHF د.إ`.
Stripe needs an ISO-4217 code, and two of the nine do not name one — `$` is USD
or another dollar, and `¥` is **JPY (zero-decimal) or CNY (two-decimal)**, the
exact pair where guessing wrong charges the customer 100×.

`functions/payments/money.js` refuses an ambiguous symbol instead of resolving
it. A workspace on `$` or `¥` must state a code before it can take a payment;
that is a PR-P2 onboarding step, recorded here so it is not discovered late.

Related: `functions/commerce/money.js` fixes `SCALE = 2` on purpose (the commerce
envelope has to hash byte-identically across providers). Putting a JPY amount
through its `toMinorUnits` returns 50000 for ¥500. The two modules answer
different questions and must not be shared; the test asserts both answers so the
difference cannot be mistaken for a bug in either.

---

## 3. What PR-P0 built (candidate branch only)

Four pure modules under `functions/payments/` — no Firestore, no network, no
secret — and one test file in the real CI `unit` job.

| Module | The decision it owns |
| --- | --- |
| `money.js` | minor-unit integers from text (never `19.99 * 100`), a closed currency allowlist, symbol ambiguity refused |
| `connectionState.js` | connection status **derived** from the account snapshot, capability per status, a client summary with no account id |
| `paymentRequestState.js` | the `publicStatus` reducer: exactly-once, forward-only, cumulative refunds, refund-before-payment waits |
| `eventBoundary.js` | platform vs connected rail, the event ledger key, one external payment identity for Checkout + PaymentIntent, event-vs-request matching |
| `permissions.js` | the §9 matrix over the existing role contract, including the reassignment rule |

`functions/test/qa/payments-connect-contract.test.js` — **31 checks, all green**,
and the whole `functions` unit suite stays green.

Two of those checks are worth naming because they are the ones that would have
cost money:

* *"JPY is zero-decimal here and would be 100× through commerce/money.js"* —
  asserts both modules' answers side by side.
* *"Checkout and PaymentIntent resolve to one external payment identity"* —
  Stripe emits both for one payment; keying the ledger on the event or the
  session writes that payment twice.

Writing the tests also caught a real defect in the first draft of the reducer:
`partially_refunded` and `refunded` shared a rank, so a partial refund could
never become a full one. The rank ladder is now ordered
`draft < open/expired/cancelled < processing < paid < partially_refunded <
refunded < disputed`, with `disputed` at the top so a later refund records its
money without quietly clearing a dispute off the operator's screen.

### Deliberately not decided here

* Stripe's per-currency minimum charge (0.30 GBP, 50 JPY, …) is a live account
  and settlement property. It is checked against the provider at PR-P2, not
  copied into a table in this repo.
* The currency allowlist covers only the nine symbols NivaDesk offers. Stripe's
  wider list carries cases that contradict the folk rule — ISK and UGX are
  zero-decimal currencies the API still wants as two-decimal with `00` decimals;
  HUF and TWD are two-decimal to charge and zero-decimal to pay out. Adding a
  currency means reading the current Stripe page for it, not extending the table
  from memory.

---

## 4. Next

PR-P1: the server-only connection model, owner-only connect/disconnect callables,
Account Link onboarding, the `account.updated` webhook on the **second** endpoint
with its **own** signing secret, and the fake transport. No live connection is
made.
