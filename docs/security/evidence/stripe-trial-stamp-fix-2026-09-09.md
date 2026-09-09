# Stripe billing hotfix — the trial stamp as the one exception, and the deploy that carries both HIGHs closed

> **Superseded on the deploy question, 9 September late:** the addendum
> `stripe-trial-stamp-deploy-addendum-2026-09-09.md` §4 drove Addendum 7's first lesser finding and
> reproduced a cancelled add-on written back by an in-flight apply. That is a HIGH state-corruption path
> present in live and in this candidate; under the STOP rule the recommendation below is withdrawn and
> the decision is **NO-GO** until a write-time guard exists. The trial-stamp fix and its checks stand.
>
> **Closed, 10 September:** the write-time guard exists — addendum §6 (one transaction, the decision taken
> again on the committed row, a generation read before every snapshot, the resync bound to the same
> guard; 55/55 fake, 5/5 emulator, 1,231 full suite, red-on-removal shown). Deploy list re-derived: seven
> functions (§6.5). Decision **GO**, deploy approval separate.
>
> **§6.7's fallback closed, 10 September:** a retrieve-first rail without a baseline now re-reads Stripe after
> resolving the workspace (addendum §7; 56/56 fake, 6/6 emulator, M5 red). Deploy scope: **2 mandatory**
> (`stripeWebhook`, `resyncStripeWorkspaceEntitlements`), 5 optional and measured neutral (7/7 same).

Date: 9 September 2026. Branch **`stripe-trial-stamp`** (worktree `/Users/gocmen/Developer/studioflow-stripe`),
cut from the deploy branch `macbook-save-before-macstudio-2026-06-01` at `9be6a597`, which already carries
the four hotfix commits (`3b4e1761`, `1a2aabee`, `9a08cda6`, `d0c7f431`) and the STOP record
(`stripe-webhook-investigation-2026-09-07.md`, Addenda 6–7). **Nothing deployed. No production data
changed.** This document is the evidence for the operator's GO/NO-GO; the deploy itself is a separate
approval.

Decision this implements (operator, 9 September): *where verified Stripe data proves a trial was
actually used, `billingTrialUsedAt` may be written when absent — the single, documented exception to "a
stale event mutates nothing"; an existing stamp is never changed; a stale event may not write back
subscription, plan, add-on, session or completion state.*

---

## 1. What changed

One production file, one function, two helpers — `functions/stripeBilling.js`, 62 lines net:

| Where | Change |
|---|---|
| `applyCompletedSubscriptionCheckout` (`:1110-1162`) | The stamp is no longer part of the `updated`-gated `set` beside `billingCheckoutSessionId`. After `applySubscription` returns — stale or not — if it resolved a workspace **and** the subscription Stripe returned shows a trial, `stampTrialUsedIfMissing(workspaceId)` runs. The session fields stay behind `result.updated`. A stamp that was written is reported on the result as `billingTrialUsedAtStamped: true`, so the `stripeBillingEvents` row for a skipped event says the trial was spent rather than "nothing happened" |
| `subscriptionShowsTrial(subscription)` (`:1165`) | The evidence rule: Stripe's **retrieved** subscription has `status === "trialing"` or a positive `trial_end`. The event payload is never consulted; an absent or malformed `trial_end` is "no trial", never a guess |
| `stampTrialUsedIfMissing(workspaceId)` (`:1178`) | `admin.firestore().runTransaction`: read the company document, return `{stamped:false, reason:"already_stamped"}` if `billingTrialUsedAt` is set, else `set({ billingTrialUsedAt: serverTimestamp() }, { merge: true })` inside the transaction. One decision, one write, contention retried by Firestore |

The workspace is the one `applySubscription` resolved through the trusted references
(`metadata.workspaceId` → subscription id → customer id, `stripeBilling.js:1237-1241`); the stale return
already carried `workspaceId` (`:1255`), so no second resolution was added. Every other rail, field and
invariant is untouched: the ordering decision, the ledger writer, the canonical retrieve, the add-on
branches and the entitlement recompute are exactly `d0c7f431`'s.

Not changed, on purpose: `createStripeCheckoutSession`'s guard (`hasUsedTrial` = stamp **or** a live
`billingSubscriptionId`, `:1865-1866`) — it already reads the stamp as a boolean, which is why the fix
is a write and not a read.

## 2. Tests — the handlers run, not read

All in `functions/test/qa/`, driven through the factory's `_internal` appliers against the fake
Firestore and a fake Stripe; no check below asserts on source text.

**Harness additions** (`stripe-invoice-api-drift.test.js`): the fake Firestore now records every write
with its fields (`writes`, `:443`) and implements **optimistic transactions** (`runTransaction`, `:491`):
reads note the document version they saw, writes are held until the function returns, a commit that
finds a read overtaken retries the whole function, and each read yields a turn — so two transactions
started in the same tick interleave the way two webhook deliveries do. The harness can also hand the
checkout callable a workspace resolver, so the guard is exercised through the real handler.

| # | Check | What it proves | Result |
|---|---|---|---|
| A | a stale trial checkout still spends the once-per-workspace trial, and writes nothing else (`:1687`) | after a current `customer.subscription.updated`, a stale `checkout.session.completed` returns `skipped`/`stale_subscription_event` **with** `billingTrialUsedAtStamped: true`; the whole-store diff is exactly `companies/ws_drift.billingTrialUsedAt`; the only workspace write carried only that field; session id absent; cancelled add-ons still cancelled | PASS |
| B | an existing trial stamp keeps its date through a stale and a current checkout (`:1718`) | stale: state byte-identical, no stamp claim; current: `updated`, session id written, stamp date unchanged | PASS |
| C | a checkout whose subscription shows no trial writes no stamp, stale or current (`:1740`) | `trial_end: null` + active: stale → no mutation at all; current → session fields only, no stamp | PASS |
| D | a cancellation followed by a new checkout does not hand out a second free trial (`:1792`) | stamp via a stale checkout → `customer.subscription.deleted` drops the plan to demo and clears `billingSubscriptionId` (the guard's other arm) → the real `createStripeCheckoutSession` handler (Stripe SDK session-create patched on the prototype for the duration, env set and restored) builds a session with **no** `trial_period_days` and no `payment_method_collection`; **control**: with the stamp removed the same call asks for `trial_period_days: 14` — the stamp is exactly what stands between a cancellation and a second trial | PASS |
| E | two concurrent deliveries of a stale trial checkout write the stamp once, and a replay writes nothing (`:1760`) | `Promise.all` of two stale checkouts: both skipped, **one** stamp write, exactly one result claims it; a replay of a processed id returns `{duplicate:true}` and the date holds | PASS |

Requested by the operator and already in the suite (unchanged, re-run green):

| Requirement | Check(s) |
|---|---|
| a stale subscription event cannot resurrect cancelled seat/storage add-ons (the **live** HIGH, Addendum 6) | "a cancelled storage add-on is not resurrected by a later stale event"; "cancelled team seats are not resurrected by a later stale event"; "a current event followed by a stale one mutates nothing anywhere" (whole-store, three stale shapes) |
| retrieve failure keeps retry and watermark protections | "a failed canonical subscription retrieve leaves the event retryable"; "a failed subscription retrieve leaves the payment_failed event retryable"; "a ledger read failure fails closed and leaves the event retryable"; "a renewal raises the watermark that protects its own date"; "a stale event is dropped and the current event that follows still applies" |
| repeated events | "a replayed event is refused by the dedupe and changes nothing" (+ E above) |

`trial-checkout.test.js` check 5 was a source-text check that greped for the old inline spread
(`...(startedTrial ? { billingTrialUsedAt …`); it now asserts the new shape (stamp decided from the
retrieved subscription, written through the write-once path, not inline beside the session fields) and
points at A–E for the behaviour. It is the one test the fix broke, and it broke for the right reason.

### Runs

| Suite | Result |
|---|---|
| `stripe-invoice-api-drift.test.js` | **47 / 47 PASS** (was 42; `EXPECTED_CHECKS` raised to 47 so a lost check fails the run) |
| `trial-checkout.test.js` | 7 / 7 PASS |
| `apple-billing-order` 10, `automatic-trial` 7, `entitlement-shopify` 9, `shopify-billing` 12, `team-seats` 14 | all PASS |
| full `npm test` (clean run, no concurrent edits) | **exit 0 — 1,223 PASS, 0 FAIL, 95 suite banners** |
| `billing-trial-rules`, `seat-suspension-rules`, `workspace-create-billing-rules` (`.test.mjs`, `npm run test:rules`) | **not run** — they need the Firestore emulator (`ECONNREFUSED 127.0.0.1:8080`); no rules changed on this branch |

One note on process: a first full-suite run was started while a mutation swap (§3) was in progress on
the same tree, so its green result could have been contaminated; it was discarded and the suite was
re-run with no file changing during the run. The counts above are from the clean run.

## 3. The new checks fail when the fix is taken away

Two mutations, each applied to the working tree, run, then restored byte-identically
(`cmp` confirmed, 47/47 again after restore):

| Mutation | What happens |
|---|---|
| **m1 — the fix reverted** (`stripeBilling.js` restored to `9be6a597`, i.e. `d0c7f431` behaviour) | **4 FAIL / 43 PASS**: A "the event record must say the trial was spent"; B "a current checkout moved the date of an existing stamp"; E "the stamp was written 0 times"; D "Expected values to be strictly equal" (a second `trial_period_days: 14`). C passes under both, as it should — the old code never stamped without a trial either |
| **m2 — the transaction replaced by a naive read-then-write** (two `setImmediate` yields around it, the shape a concurrent pair actually has) | **1 FAIL / 46 PASS**: E "the stamp was written 2 times" — the write-once claim is only true with the transaction |

## 4. The two HIGHs, closed separately

| HIGH | Closed by | Evidence |
|---|---|---|
| **Addendum 6 — live today**: a stale `customer.subscription.*` event re-grants cancelled storage/seat add-ons from its payload and `invoice.paid` never repairs it | `d0c7f431` (already on this branch; not yet deployed) — ordering decided once before any mutation, canonical state applied, add-on branches unreachable after a stale decision | the three add-on/whole-store checks above, green; Addendum 7's four-invariant table, re-run today inside the 47 |
| **Addendum 7 — introduced by `d0c7f431`, never shipped**: a stale checkout no longer spends the trial; after a cancellation clears `billingSubscriptionId` the workspace can buy a second free fortnight | this branch (§1) | A, B, C, D, E green; m1 shows the leak reproduces (D) the moment the fix is removed |

No new HIGH was found while doing this. The four lesser findings of Addendum 7 (non-transactional
watermark, the one extra retrieve on three rails, the "immutable metadata" wording, `created`-less events)
are unchanged and unaddressed here, as reported.

## 5. Deploy scope — exact, from the code

Method: every inner function of `stripeBilling.js` whose body (comments stripped) differs between the
**live** file (`0ad2a2aa`, the last commit before the 6 September deploy) and this branch, then the exported
handlers that can reach one of them through the module's own call graph.

Changed or new: `applyCompletedSubscriptionCheckout`, `applySubscription`, `applyInvoicePaid`,
`applyInvoicePaymentFailed`, `processStripeEvent`, `writeStripeSubscriptionLedger`,
`stripeSubscriptionEventOrdering` (new), `stripeSubscriptionIdFromInvoice` (new),
`stripeCurrentPeriodEndUnix` (new), `stripeReferenceId` (new), `subscriptionShowsTrial` (new),
`stampTrialUsedIfMissing` (new).

| Export | Reaches changed code? | Deploy |
|---|---|---|
| `stripeWebhook` | all four rails, the ordering guard, the ledger writer, the stamp | **yes** |
| `resyncStripeWorkspaceEntitlements` | `applySubscription(subscription, "manual.owner_resync")` (`:1660`) → ordering, canonical retrieve, ledger, helpers | **yes** |
| `createStripeCheckoutSession` | no — the guard and the session build are unchanged | no |
| `createStripeCustomerPortalSession`, `prepareAppleSubscriptionPurchase`, `prepareGooglePlayPurchase`, `verifyGooglePlayPurchase`, `googlePlayRtdnNotification` | no | no |
| `verifyAppleSubscriptionPurchase`, `appleAppStoreServerNotification` | `appleEventIsStale`'s body is identical live vs branch (comment-only diff) | no |
| `scheduledBillingEntitlementReconcile` | wrapper and `reconcileExpiredBillingEntitlements` bodies identical | no |
| `deleteMyAccount` (index.js, via `_internal.cancelWorkspaceStripeSubscriptionsForDeletion`) | unchanged | no |

**Deploy list: `stripeWebhook`, `resyncStripeWorkspaceEntitlements`.** The "candidate two functions"
of the decision note resolve to exactly these; `createStripeCheckoutSession` is not one of them.

| | |
|---|---|
| Commit to deploy | the head of `stripe-trial-stamp` carrying this document (fast-forwards onto `macbook-save-before-macstudio-2026-06-01`, of which it is a linear descendant) |
| Deploy from | the main checkout (`~/Developer/studioflow-app`), which alone holds `functions/.env`; after `git merge --ff-only stripe-trial-stamp` on the deploy branch |
| Command | `firebase deploy --only "functions:stripeWebhook,functions:resyncStripeWorkspaceEntitlements"` — never `--only functions` (the branch-divergence rule) |
| Production today | `stripewebhook-00046-peq` (2026-09-06T01:48:01Z) and `resyncstripeworkspaceentitlements-00031-seb` (2026-09-06T03:03:53Z); `stripeBilling.js` in both is `0ad2a2aa` |
| Before deploying | re-read both revision names; confirm `git status` clean and the deploy branch head equals the commit above |
| After deploying | watch `stripeBillingEvents` for 24 h: `processingStatus` (`processed` / `skipped` with a reason) and any 5xx on `stripewebhook`; a skipped checkout that carries `result.billingTrialUsedAtStamped: true` is the fix working. Stripe's delivery status and its dashboard error rate are **not** evidence for either HIGH |

### Rollback

`gcloud run services update-traffic stripewebhook --region europe-west2 --project eggcraft-studio --to-revisions stripewebhook-00046-peq=100`
and the same for `resyncstripeworkspaceentitlements` → `resyncstripeworkspaceentitlements-00031-seb`.

**Rolling back re-opens the live HIGH.** `stripewebhook-00046-peq` is the code in which a stale
`customer.subscription.*` event writes cancelled add-ons back from its payload (Addendum 6) and in which
`invoice.paid` still reads fields the pinned Stripe API no longer sends. It does **not** re-open the trial
leak, which never shipped. Data written by the fixed revision is safe to leave: ledger rows are additive,
and a `billingTrialUsedAt` stamp only ever says "used", which the guard would say anyway.

## 6. Remaining blockers and recommendation

- **Operator approval to deploy** — this command was not a deploy permission.
- The three emulator-backed rules suites were not run (no rules changed); `npm run test:rules` needs the
  Firestore emulator if the operator wants them in the record.
- The four lesser Addendum 7 findings stay open and are not part of this deploy.
- Onboarding backend wiring stays frozen until this deploy lands (the operator's sequencing rule).

**Recommendation: GO** for deploying `stripeWebhook` and `resyncStripeWorkspaceEntitlements` at the
commit above, from the main checkout, by name, with the rollback revisions recorded first.
