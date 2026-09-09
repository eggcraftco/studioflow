> **Read-only audit, 7 September 2026, run before the Stripe billing patch deploy.** Nothing was
> replayed, no event resent, no workspace state changed, no Stripe API call made, no secret read.
> Workspace ids are truncated; no customer email, name or full Stripe object id appears.
>
> **Bounded by design:** the audit could not ask Stripe what the truth is, because that needs the live
> secret. Every question our own data cannot decide is marked NOT ESTABLISHABLE with the exact check
> that would decide it.

# Stripe API drift — historical impact audit

**Date:** 2026-09-07 · **Project:** `eggcraft-studio` · **Mode:** read-only (Admin SDK reads only; no writes, no replays, no Stripe API calls, no deploys, nothing committed).

Two field drifts were fixed in code today and are **not yet deployed**. This audit asks, for each affected cohort, only the two questions the operator asked, and answers them separately:

1. **Is there wrong entitlement / status / billing state TODAY?**
2. **Is a backfill or replay ACTUALLY needed?**

---

## Boundary of this audit — read this before the verdicts

**This audit could not ask Stripe anything.** Doing so requires the API secret, which is out of bounds. Every finding below is derived from our own Firestore data (`stripeBillingEvents`, the `subscriptions` collection group, `companies`) and from the source in this repo.

That boundary has one precise consequence: **we can prove what our system believes, and we can prove what our system did with what it was told. We cannot prove what Stripe actually sent, or what Stripe believes today.** Where a question turns on that, the verdict below is "NOT ESTABLISHABLE without Stripe" and names the exact Dashboard screen that would settle it. It is never softened into a guess.

Everything else in this document is established from data, and each verdict names the evidence that decides it.

---

## The estate, so the verdicts have a denominator

| | count |
|---|---|
| `stripeBillingEvents` rows (all time, 2026-05-29 → 2026-08-20) | **42** |
| — live-mode | 14 |
| — test-mode | 28 |
| `subscriptions` ledger rows (all providers) | 9 — stripe 5, apple 3, google 1 |
| — Stripe rows, live-mode | **2** (both `canceled`, `activeForEntitlement: false`) |
| — Stripe rows, test-mode | **3** (all `active`) |
| `companies` documents | 63 |
| — with any Stripe signal | 4 (`32kcTj`, `KSQide`, `Yl4v2S`, `iZFBJq`) |
| — entitled *by* Stripe today (`billingEffectiveProvider == "stripe"`) | 2 (`KSQide`, `Yl4v2S`) — **both test-mode subscriptions** |
| — with a non-null `billingCurrentPeriodEnd` | **0 of 63** |

**The single most important framing fact: there is no live-mode Stripe subscription in this estate today.** The only two that ever existed — `32kcTj`'s plan and `iZFBJq`'s seat add-on — were both deleted (2026-08-18 and 2026-08-20) and applied correctly. The two workspaces currently drawing paid entitlement from Stripe are both backed by `livemode: false` subscriptions.

---

## Cohort 1 — the 7 skipped `invoice.paid` events (drift #1)

**Cohort:** 7 rows, `type: "invoice.paid"`, all with `result = {skipped: true, reason: "invoice_without_subscription"}`. That is **7 of 7** — a 100% skip rate, no un-skipped `invoice.paid` exists anywhere in the collection. All seven are **`livemode: false`**. Four belong to a workspace (`O6UfVt…`) whose `companies` document no longer exists; the rest to `KSQide` and `Yl4v2S`. Every one is a *first* invoice at subscription creation — there is not a single renewal invoice in the cohort.

### Q1 — Wrong state today? **NO.**

The evidence that decides it: **for all seven, a `customer.subscription.created` for the same subscription landed in the same second and processed with `updated: true`.** `applyInvoicePaid` does exactly two things — it calls `applySubscription` (which that sibling event already called, successfully), and it stamps `billingLastInvoiceId` / `billingLastInvoicePaidAt`. Those two fields are read by **nothing**: across functions, web, Swift and Kotlin the only other occurrences are the server-only write-deny list in `firestore.rules` and the new drift test. No rule gates on them, no client renders them, no server branch reads them.

So the damage is precisely: **two fields are null that nothing consumes, on test-mode rows, for a plan/status that is already correct.** This is a null field, not a harmed customer.

### Q2 — Backfill or replay needed? **NO.**

A replay would rewrite plan/status values that are already correct, stamp two fields nothing reads, reproduce the same `currentPeriodEnd: null` under today's undeployed code, and push **test-mode** state into production `companies` documents. It would also apply *today's* Stripe state rather than the state at event time, because `applyInvoicePaid` re-retrieves the subscription. The replay carries more risk than the gap it closes.

### Not establishable here

- **"Stripe sent exactly 7."** Not establishable. `stripeWebhook` returns 400 on a failed signature *before* any Firestore write, and an undelivered event leaves no row — 7 is the count that reached the handler. **Would be answered by:** Dashboard → Developers → Events filtered to `invoice.paid`, plus the endpoint delivery log, in both modes.

---

## Cohort 2 — `invoice.payment_failed` (the broken dunning handler)

**Cohort: EMPTY. Zero events, ever.** Type distribution sums exactly to the 42 documents (subscription.updated 12, subscription.created 9, checkout.completed 9, invoice.paid 7, subscription.deleted 5), so nothing is hiding in an unlisted bucket. Three further checks close the "maybe it was dropped" gap: `processStripeEvent` writes the row with `processingStatus: "received"` *before* dispatch, an unrecognised type still lands as `skipped / unhandled_event`, and there are **0** rows stuck at `received`, **0** without `processedAt`, and **0** with `unhandled_event`.

`applyInvoicePaymentFailed` has therefore **never run in production.** `billingPaymentFailedAt` is absent on **63 of 63** companies — verified by scanning every field name, not by querying for one.

### Q1 — Wrong state today? **NO.**

Checked independently of the events: **0 workspaces** hold `past_due` in `billingStatus` or `billingEffectiveStatus`, **0** company documents contain the string `past_due` in any field, and no field matching `/paymentfail|dunning|past_due/` exists anywhere in the collection.

The one workspace that genuinely went `past_due` — `32kcTj`, live mode, 2026-08-09T09:46:53Z — **was applied correctly**, because it arrived on the `customer.subscription.updated` rail, which calls `applySubscription` directly and never touches the broken invoice handler. It later cancelled (2026-08-20) and now reads `demo` / `cancelled` / `free` with a `canceled, activeForEntitlement: false` ledger row. Fully consistent.

### Q2 — Backfill or replay needed? **NO — there is literally nothing to replay.**

Zero events received, zero stamps written, zero workspaces in or near `past_due`, and the single real dunning transition already applied through a different, working rail. The broken code was never reached.

### The finding that matters more than the cohort

**No `invoice.*` event of any kind has ever arrived in live mode.** All 7 `invoice.paid` rows are test. Yet the live `lifetime_lite` subscription renewed monthly (2026-06-09, 07-09, 08-09) and went `past_due` on 2026-08-09 — a Stripe subscription only reaches `past_due` after an invoice payment fails, so a live `invoice.payment_failed` almost certainly existed on Stripe's side. No row for it.

The reading our data supports is that **the live webhook endpoint does not subscribe to `invoice.*` events.** That is **NOT ESTABLISHABLE without Stripe** — **it would be answered by** the enabled-events list on each of the two endpoints. It matters because if it holds, **deploying the `applyInvoicePaymentFailed` fix changes nothing in live mode**, since the event never arrives. This is the highest-value open item in the whole audit and it needs the Dashboard.

---

## Cohort 3 — null `billingCurrentPeriodEnd` (drift #2)

**Cohort:** `currentPeriodEnd` is null on **5 of 5** Stripe ledger rows (100%), against a clean control of **0 of 4** for Apple and Google rows written by the same writer through the same schema. At company level, `billingCurrentPeriodEnd` holds **0 real timestamps across all 63 documents**: 4 explicit nulls, 59 field-absent. Of the 4 nulls, only **2 are drift-caused** (`KSQide`, `Yl4v2S`); the other two are the resolver's deliberate `billingCurrentPeriodEnd: null` on the drop-to-Demo branch (`functions/stripeBilling.js:901`).

### Q1 — Wrong state today? **NO for entitlement; one workspace is in a stale grant, and it is a test workspace.**

Consumer by consumer, this is what the null actually does:

| consumer | behaviour with a null | live impact today |
|---|---|---|
| `firestore.rules:142-152` `trialLapsed()` | only reached when status is `trialing`; the period-end clause is the **second** arm, guarded by `!(billingTrialEndsAt is timestamp)`. A null is not a timestamp → arm false → gates pass. **Fails open.** | none — see the intersection below |
| `storage.rules:210-220` | byte-identical clause | none, same reason |
| `functions/index.js:2234` `trialHasExpired()` + its web/Swift/Kotlin mirrors | `billingTrialEndsAt \|\| billingCurrentPeriodEnd` → falsy → early `return false`. **Fails open.** | none, same reason |
| expiry sweep, `stripeBilling.js:2194` | `.where("billingCurrentPeriodEnd","<",cutoff)` never matches a null or an absent field; second gate `endMs > 0` at `:2212` blocks again. **Never fires.** | never revokes — permissive, not a lockout |
| Settings "Renews on" row, `studioflow-web/app/settings/page.tsx:6686` | rendered only when the value is `> 0` → **row silently omitted** | no wrong date is shown anywhere; native has no renewal-date surface at all |

**The fail-open arm has an empty intersection.** Workspaces that are `trialing` **AND** have no `billingTrialEndsAt` **AND** no `billingCurrentPeriodEnd`: **0**. All 5 trialing workspaces carry a real `billingTrialEndsAt` (2026-09-11 … 09-15) because they came from the server-granted signup trial, which always stamps it. **There is no live hole in the rules today.**

I confirmed the inequality semantics on production data rather than assuming them: the sweep's exact query matched **0 documents** while 3 documents sit at `billingEffectiveStatus == "active"`; and a control probe on `billingTrialEndsAt` (`< now+10y`) matched exactly the 6 documents holding a real timestamp — 0 nulls, 0 absences. A `<` filter genuinely never sees a null.

**The one genuine exposure, stated without softening:** `Yl4v2S` holds `team_monthly` / `active`, no `billingTrialEndsAt`, null period end, last billing write **2026-05-30**, owner uid no longer resolving in Firebase Auth. Nothing in our data can ever end that grant — the sweep is blocked at both gates and no webhook has arrived in three months. Whether the grant is factually wrong right now is **NOT ESTABLISHABLE without Stripe**: it depends on the live state of that subscription id. What *is* established: if that subscription has ended, this workspace keeps Team indefinitely, and the null is the reason. It is a **test-mode** subscription in a **test** workspace with a deleted owner account — a defect worth carrying forward, not a billing incident.

`KSQide` (the other drift-caused null) is safe on a second, independent ground: its status is `active`, so `trialLapsed()` never enters its body at all, and it also carries a future `billingTrialEndsAt`.

### Q2 — Backfill needed? **NO.**

Four reasons, in order of weight:

1. **There is nothing live to backfill.** Both live Stripe subscriptions are deleted and correctly resolved. The 2 drift-caused nulls sit on `livemode: false` subscriptions.
2. **No consumer is mis-granting because of it.** The fail-open arm's intersection is empty, the sweep's failure mode is "never fires" and it has matched nothing anyway, and the only UI that reads the value hides its row rather than printing something false.
3. **The value cannot be sourced from our own data.** The ledger rows are null too; the only source of truth is Stripe — outside this audit's bounds, and a write.
4. **The fixed code self-heals on the paths that matter, and does not need a renewal to do it.** Any `customer.subscription.*` delivery, any checkout completion, or an owner/admin pressing **Refresh subscription access** (`resyncStripeWorkspaceEntitlements`) re-lists from Stripe and calls `applySubscription`. Our own event log shows the realistic cadence while live subscriptions existed: `customer.subscription.updated` on 07-09 (×3), 07-17, 08-09 (×4). A live row would be null for days, not months.

### The forward-looking caveat that belongs with this cohort

This is code-established, not speculation. `createStripeCheckoutSession` attaches `trial_period_days = 14` to a first plan purchase (`stripeBilling.js:1622`), `mappedEffectiveStatus` maps Stripe's `trialing` straight onto `billingStatus` (`:547`), and the Stripe path writes `billingTrialUsedAt` but **never** `billingTrialEndsAt` (`:1069-1073`). A Stripe checkout on undeployed code therefore produces exactly the empty-intersection triple — `trialing`, no trial end, null period end — for its entire 14-day trial, which *is* the fail-open case. **The intersection is 0 today only because no Stripe subscription is currently in `trialing`.** The next paid checkout on undeployed code would populate it. The deployed fix closes this by itself, because for a trialing subscription the item's `current_period_end` is the trial end.

**This is the reason the deploy is urgent even though the backfill is not.**

---

## Adjacent findings — real, but NOT caused by either drift

Flagged so they are not lost, and explicitly not counted as drift damage:

1. **Two workspaces hold live paid entitlement from `environment: "test"` Stripe rows** — `KSQide` (pro) and `Yl4v2S` (team). `subscriptionActiveForEntitlement` never inspects `environment`, so a test-mode subscription grants production entitlement. This predates and is independent of both drifts.
2. **`iZFBJq` carries `billingPlan: team_monthly` with no status at all** — `billingStatus`, `billingEffectiveStatus`, `billingEffectivePlan`, `billingEffectivePlanTier` and `billingEffectiveProvider` are all absent. It is a `manual_workspace` grant on the operator's own workspace, so nothing is over-entitled by accident, but a paid plan with no status field is a schema hole.
3. **`KSQide` has four rails disagreeing on one workspace** (`billingPlanSource: shopify`, `shopifySubscriptionStatus: ACTIVE`, `billingEffectiveProvider: stripe`, `billingUpdatedBy: apple_verification`, plus expired apple/google rows). It is a multi-rail test workspace; worth understanding before it is used as a reference for anything.
4. **`stripeEventSequence` is absent from all 5 ledger rows and this is expected** — the out-of-order guard landed in `ce1fb764` (2026-09-03), after the newest recorded event (2026-08-20). Not a deployment gap.

---

## What a Stripe-side check would add, so the operator can price it

Three questions, in descending value. All need the Dashboard; none need a write.

1. **Are `invoice.paid` and `invoice.payment_failed` enabled on the LIVE webhook endpoint?** Our data says no live `invoice.*` has ever arrived, while a live subscription demonstrably went `past_due`. If they are not enabled, **both deployed fixes are inert in production** until the endpoint is reconfigured. *Two minutes on the endpoint's enabled-events list.* **Do this one.**
2. **Are the two subscription ids behind `KSQide` and `Yl4v2S` still active, and what are their real period ends?** This is the only thing that decides whether `Yl4v2S`'s Team grant is wrong right now. Both are test-mode, which is why it is second rather than first.
3. **Did any live invoice ever hit the `invoice.subscription` drift?** From our data the answer is "none observed" — which is not the same as "none happened". Only Stripe's delivery history settles it, and given #1 it is likely moot.

---

## Recommendation on backfill

**No backfill. No replay. Not for any cohort — including the subset that looks worst.**

What makes it unnecessary, rather than merely asserted:

- **There is no live-mode Stripe subscription in the estate.** Every drift-damaged row is either a cancelled live subscription that already resolved correctly, or a test-mode subscription. A backfill would be a no-op against anything live.
- **The damaged fields are, with one exception, fields nothing consumes.** `billingLastInvoiceId` / `billingLastInvoicePaidAt` have no reader in four codebases. `billingCurrentPeriodEnd` has readers, but each one fails **open** on a null and the one arm that could mis-grant has an **empty intersection** today, verified against production data.
- **The single stale grant (`Yl4v2S`) would not be fixed by a backfill anyway** — its ledger row is null too, so there is no value to write from our side. The correct remedy is an owner/admin resync, which is a write and out of this audit's scope, and it is a test workspace.
- **A replay would import test-mode state into production documents and apply *today's* Stripe state to *historical* events.** That is a new risk taken on to repair fields nobody reads.

**What is needed instead is a deploy, and it is genuinely time-sensitive** — not because of the backlog, but because of the *next* live Stripe subscriber. On undeployed code, that subscriber's 14-day Stripe trial lands in exactly the `trialing` + no `billingTrialEndsAt` + null `billingCurrentPeriodEnd` state where the rules and `trialHasExpired()` fail open. Today that intersection is empty. The first live checkout after today fills it.

Ship the fix, then check the live endpoint's enabled-events list (item 1 above) — otherwise the `invoice.*` half of the fix will sit in production waiting for events that never come.
