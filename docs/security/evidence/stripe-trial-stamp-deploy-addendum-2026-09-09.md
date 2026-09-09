# Stripe trial-stamp fix — deploy decision addendum (9 September 2026, late)

Companion to `stripe-trial-stamp-fix-2026-09-09.md`. Same branch, `stripe-trial-stamp`. Written to close
the last open sentence in that record ("four lesser Addendum 7 findings stay open") and to verify three
things the operator asked for before deciding. **Still not deployed.** Passed suites were not re-run;
only the two suites touched by this addendum's one comment change and one new check were.

## 1. The four lesser findings of Addendum 7, one by one

| # | Finding (Addendum 7 wording) | Severity | Real user / data / billing impact | Live? | Candidate? | Relation to the two functions' changed flow | Why it is not a deploy blocker | Follow-up |
|---|---|---|---|---|---|---|---|---|
| **L1** | The watermark is a non-transactional read-modify-write; the canonical retrieve widens the window between read and write by one API call | ~~LOW~~ **HIGH — reproduced, see §4** | `stripeSubscriptionEventOrdering` reads `stripeEventSequence` (`stripeBilling.js:589-619`) and `writeStripeSubscriptionLedger` writes it later (`:660`). Two deliveries for one subscription that interleave can both pass the check, and the later write can leave the watermark at the older value. **No workspace state is at risk**: since `d0c7f431` every rail applies the subscription Stripe *currently* holds, so both members write the same state; the only effects are one redundant apply and a watermark that may sit lower than the newest event, which means a replayed intermediate event could be applied once more — again as current state | **yes** — the same read-then-write shape has been live since `ce1fb764` (3 Sep) on the `customer.subscription.*` rail | yes, on all four rails now | both functions run it (`stripeWebhook` on every rail; `resyncStripeWorkspaceEntitlements` passes no event time, so it never reads or lowers the watermark: `:591-592`, `:660`) | it cannot write stale payload state — the add-on branches and the recompute read `current` — proven by "a current event followed by a stale one mutates nothing anywhere" and "two conflicting events created in the same second converge on Stripe's state" (both green) | make the ordering read and the ledger write one Firestore transaction (or a `set` with a precondition), with an interleaving check like the trial-stamp one; separate change |
| **L2** | `invoice.paid`, `invoice.payment_failed`, `checkout.session.completed` retrieve the subscription in the caller, before the stale decision, so a stale event on those rails still costs one Stripe API call | INFO (cost) | one Stripe API read per stale delivery on three rails; no data written, no billing effect. The trial stamp adds **no** call — it reuses the retrieve the caller already made | yes — the live callers retrieve in the same place | yes | `stripeWebhook` only (the resync rail retrieves by design) | cost only, bounded by Stripe's redelivery schedule; the stale decision itself still costs zero writes | resolve the workspace from the payload's subscription id and run the ordering check before retrieving; separate change with a check that a stale event on those rails spends zero retrieves |
| **L3** | The commit message and the comment at the canonical-state block claim the subscription's "id, customer and workspace metadata are immutable"; Stripe metadata is mutable | INFO (documentation) | none at runtime. Identification already falls back from `metadata.workspaceId` to the subscription id and the customer (`:1241-1245`), and NivaDesk writes `metadata.workspaceId` once at checkout and never rewrites it | no — the comment does not exist in the live file | **reworded in this commit**: the comment now says id and customer never change, that the metadata rule is NivaDesk's and not Stripe's, and why the resolver falls back (`:1204-1211`) | comment only; no behaviour | a comment cannot block a deploy; the reasoning it describes is correct as reworded | none |
| **L4** | An event with no `created` is never stale and skips the ledger read entirely, so it carries no fail-closed exposure — "noted as correct, not as a defect" | INFO | none. Stripe always sends `created`; the internal callers that pass none (owner resync, reconcile) are meant not to be ordered (`:591-592`) | same in both | same | both functions, by design | not a defect; a delivery without `created` performs no read that could fail closed | none (optionally refuse a webhook body without `created` at the HTTP layer; not needed) |

L2–L4 write, drop or reorder nothing. L1 was written up above on the argument that its worst case is a
redundant apply of current truth; §4 drives the interleave and shows that argument fails when Stripe's
state changes between an apply's retrieve and its write. **L1 is a blocker; L2–L4 are not.**

## 2. Three verifications

### 2.1 A failed trial-stamp transaction is retryable, and the redelivery stamps

Code path, read in the candidate: `stampTrialUsedIfMissing` has no catch (`:1178-1188`);
`applyCompletedSubscriptionCheckout` awaits it with no catch (`:1149`); `processStripeEvent` stamps
`processedAt` only after the applier returns (`:1543-1547`), so a throw leaves the row at
`processingStatus: "received"` with no `processedAt`; `stripeWebhook` catches and answers **500**
(`:2081-2083`), which makes Stripe redeliver; the dedupe keys on `processedAt` (`:1504`) and lets the
redelivery through. Firestore's own `runTransaction` retries contention internally and throws only a hard
failure, which is the case driven here.

There was no check for this specific failure (the existing retryability checks inject a ledger read
failure and a Stripe retrieve failure), so one was added — `stripe-invoice-api-drift.test.js`, **"a failed
trial-stamp transaction leaves the event retryable, and the redelivery stamps"**: the transaction's read
of the company document is made to fail once; the delivery rejects with that error, writes nothing (whole
store unchanged, no stamp), the event row is `received` with no `processedAt`; the same event id is
redelivered, is **not** refused as a duplicate, returns `skipped` with `billingTrialUsedAtStamped: true`,
the stamp is present and the row is `skipped` with a `processedAt`. Result: **PASS** (suite 47 → **48**,
`EXPECTED_CHECKS` raised). Mutation m3 — a `try/catch` swallowing the stamp failure — makes exactly this
check fail ("Missing expected rejection"); restored byte-identically, 48/48 again.

### 2.2 The tested tree is the deploy candidate; why 1,223 ≠ 1,382

`functions/stripeBilling.js` hashes to blob `761c1857697d00461b5bd573e99e7f103490fe26` in `ed24abd9`
(the fix commit), in `2598c0e6` (which changed only the evidence document — `git diff --stat ed24abd9
2598c0e6` lists that one file), in the copy the suites ran against and in the working tree at the time of
the clean full run. That run (`npm test`, exit 0, **1,223 PASS, 0 FAIL**, no file changed during it)
therefore tested exactly the product code of `2598c0e6`. Since then the product code changed by **one
comment block** (L3) and the suite by one added check; the two affected suites were re-run
(`stripe-invoice-api-drift` 48/48, `trial-checkout` 7/7) and the full suite was not, per instruction.
The commit carrying this addendum is the deploy candidate; its `stripeBilling.js` differs from
`761c1857…` only in that comment.

**1,223 vs 1,382** is a difference of branch scope, not of health. The Stripe branch descends from the
deploy branch (`macbook-save-before-macstudio-2026-06-01`) and holds 104 `test/qa` + 12 `test/inventory`
suites; the OpenAI worktree is on the `mcp-orchestration` line (merge base with the deploy branch
`015d5792`) and holds 118 + 12. The sixteen suites present only there are the MCP/orchestrator ones
(`mcp-no-money`, `mcp-one-inventory-search`, `mcp-reduced-surface`, `mcp-scope-enforcement`,
`mcp-tool-annotations`, `mcp-tools-list-snapshot`, ten `orchestrator-*`); the two present only here are
`ssrf-remote-fetch` and `stripe-invoice-api-drift`. PASS totals count assertions across different suite
sets and are not expected to match; neither number is a subset of the other.

### 2.3 Rollback revisions exist, and how the fix stays in the source branch

Read from Cloud Run on 9 September 22:20Z: `stripewebhook-00046-peq` (created 2026-09-06T01:48:01Z,
Ready True, Active True) and `resyncstripeworkspaceentitlements-00031-seb` (2026-09-06T03:03:53Z, Ready
True, Active True); each service routes 100 % to that revision today (`latestRevision: true`). Rollback
is therefore available as `gcloud run services update-traffic <service> --region europe-west2 --project
eggcraft-studio --to-revisions <revision>=100`. As recorded in the fix document, rolling `stripewebhook`
back re-opens the live add-on HIGH (Addendum 6) and the invoice API-drift skips; it does not re-open the
trial leak, which never shipped.

Two things make a rollback silently *un*-roll: a later `firebase deploy` of either function creates a new
revision and routes 100 % to it, and a deploy from a branch that does not contain this fix would ship the
old code again. So the fix has to live in the branch every functions deploy runs from:

1. Before the deploy: on the deploy branch, `git merge --ff-only stripe-trial-stamp` (the branch is a
   linear descendant, so this is a pointer move), then `git push origin
   macbook-save-before-macstudio-2026-06-01`. The main checkout (`~/Developer/studioflow-app`) is where
   `functions/.env` lives and where the deploy runs.
2. Every other worktree that will ever deploy a function (`onboarding-retention`, `ebay-connector`,
   `mcp-orchestration`, `openai-resubmission`, `whatsapp-channel`, `ssrf-assessment`) rebases or merges
   onto the updated deploy branch before its own functions deploy; a pre-deploy check of
   `git merge-base --is-ancestor <fix commit> HEAD` on whatever branch is being deployed from makes the
   omission fail loudly instead of quietly reverting the fix (`functions-deploy-branch-divergence`).

## 3. Decision — superseded by §4

The verdict below was written before L1 was driven. §4 reproduces the interleave the operator asked
about and reclassifies L1 as a **HIGH state-corruption path**. Under the standing rule — a new HIGH
stops the deploy and nothing is repaired inside the same review loop — the decision is **NO-GO**, and
the §4 text is the decision. The three verifications of §2 stand; §1's L2–L4 stand.

<details><summary>Earlier text, kept for the record</summary>

- Four lesser findings: none is a blocker (§1); L1 and L2 carry follow-ups on their own schedule; L3
  is closed by the comment in this commit; L4 needs nothing.
- Retry behaviour: safe and now pinned (§2.1).
- Tested tree = candidate, up to a comment (§2.2). Rollback targets exist and are reachable; the branch
  carry into the deploy branch is a runbook step, not an afterthought (§2.3).
- GO — deploy `stripeWebhook` and `resyncStripeWorkspaceEntitlements` at the head of `stripe-trial-stamp`
  that carries this addendum.

</details>

## 4. L1, driven: an in-flight apply writes a cancelled add-on back — HIGH, STOP

The operator asked for the interleave to be driven rather than argued: A retrieves the add-on while
Stripe still has it active and is held before its write; Stripe cancels; B retrieves the cancellation
and applies it; A resumes and writes what it retrieved. The check
**"an apply that read the add-on alive cannot write it back after a later apply cancelled it (L1
interleave)"** (`stripe-invoice-api-drift.test.js`) does exactly that through the real
`processStripeEvent` → `applySubscription` path, deterministically: A's `stripe.subscriptions.retrieve`
returns a promise the check resolves only after B has finished, so no timing is involved.

**Result: FAIL — the cancellation is overwritten.** Seat add-on on a Team workspace, E0 active at
`created = 1 800 000`, A (`customer.subscription.updated`, `1 800 100`) held at its retrieve, B
(`customer.subscription.deleted`, `1 800 200`) applied — workspace `cancelled / 0 seats / limit 5`,
ledger watermark `1 800 200 000` — then A released:

```
aResult:          { updated: true, addon: "additional_team_seat_monthly", active: true, purchasedSeatQuantity: 3 }
seatStatus:       "active"          (was "cancelled" after B)
seatQuantity:     3                 (was 0)
teamMemberLimit:  8                 (was 5)
watermark:        1800100000        (was 1800200000 — moved backwards)
```

and A's event row is filed as `processed`. The earlier argument for LOW — "every apply writes Stripe's
current state, so both write the same thing" — holds only while Stripe's state does not change between
an apply's retrieve and its write. It changed here, and nothing checked again.

**Where the protection acts, and where it does not** (candidate `stripeBilling.js`):

- The only guard is the ordering decision at `:1252-1255`, taken **before** the canonical retrieve at
  `:1268`. It compares the event's `created` with the ledger's `stripeEventSequence` once, and is never
  consulted again.
- The ledger write at `:657` is a plain merge `set`; it refuses only an ordering result already marked
  stale (`:644`) and writes `stripeEventSequence` unconditionally (`:660`) — which is how the watermark
  moved backwards.
- The add-on writes at `:1307` (storage) and `:1327` (seats) are plain merge `set`s of what this apply
  retrieved; the plan path's recompute at `:1345-1352` is the same shape.
- No transaction, precondition or re-read sits between the decision and any of these writes.

**Webhook–webhook and resync–webhook use the same path, and the resync side is weaker.**
`resyncStripeWorkspaceEntitlements` lists the customer's subscriptions with `status: "all"` (`:1643`)
and calls `applySubscription(subscription, "manual.owner_resync")` (`:1664`) with **no event time** and
**no `stripe`**: the ordering helper returns `stale: false` without reading (`:591-592`), no canonical
retrieve happens (the listed object is applied as-is), and the same unconditional writes follow. A
resync that listed an add-on active, held anywhere before its writes while a webhook applied the
cancellation, would write the add-on back exactly as A did — and it cannot be ruled stale by anything.
(The same listing is also what would *repair* a reactivated add-on if the owner pressed refresh after
the fact, because a canceled subscription is listed and applied as canceled.)

**Impact and scope.** A paid add-on that was cancelled comes back active with its seats or storage:
`activeAdditionalTeamSeats()` (`index.js:2409-2415`) and the storage check enforce on exactly these
fields, so the workspace keeps paid capacity it no longer pays for, and the ledger watermark regresses,
so an intermediate event can be accepted again. Durable until another event arrives for that
subscription — none follows `customer.subscription.deleted` — or the owner refreshes billing. Needs two
appliers for one subscription overlapping such that one's write lands after a newer one's, with a Stripe
state change in between: Stripe emits several events per change and the webhook service runs them
concurrently, so the window is real though narrow. **Not measured in production** — no evidence of an
occurrence was sought or found in this pass.

**Live or candidate?** Both, by different mechanisms. The candidate reproduces it (above). The live
file (`0ad2a2aa`) has the same read-decide-then-write shape on the `customer.subscription.*` rail —
ordering read `:584-588`, payload applied, unconditional `workspace.ref.set` `:784` — with the event
**payload** where the candidate has a retrieve, so an in-flight payload apply overwrites a newer one the
same way. That is derived from the code, not driven: the live module exposes no `_internal` appliers
(`_internal: { cancelWorkspaceStripeSubscriptionsForDeletion }` only). So the candidate does not
introduce the race, but it ships with it, and the operator's rule does not distinguish.

**What a fix has to look like — noted, not implemented.** The write, not the decision, has to be
guarded: the ledger row **and** the workspace fields an apply writes must go through one Firestore
transaction that re-reads `stripeEventSequence` at write time and turns into `skipped` if a higher
sequence has landed since the decision. Putting only the watermark into a transaction would still let
the workspace write land and is therefore not a solution. The resync rail needs a sequence of its own
(or a "never lower than what is recorded" rule inside the same transaction) before it can share the
guard. That is a change to a frozen path with its own review.

**STOP.** New HIGH → no repair in this loop, no deploy. The interleave check is committed **red** on
purpose: the branch's `npm test` fails at it until the write-time guard exists, which is the honest
state of the candidate. The trial-stamp work itself (§2.1 and the fix document's A–E) is unaffected
and stays green.

## 5. Decision

**NO-GO.** Candidate commit: the head of `stripe-trial-stamp` carrying this addendum (see the commit
message). Do not deploy `stripeWebhook` or `resyncStripeWorkspaceEntitlements` from it. What GO would
need: the write-time guard above, this check green, the other 48 still green, and a fresh review of the
resync rail. Rollback targets (§2.3) and the branch-carry rule remain correct for whenever that candidate
exists.

## 6. L1 closed: the decision is taken again at the moment of writing (10 September, after midnight)

Operator authorisation, 9 September late: fix L1 on `dc37909c`, narrowly; prepare for deploy; **no
production deploy permission**; no production data changed; no Chrome. §4 and §5 above stand as the
record of the STOP and the NO-GO they were written for. This section is the closure. Everything below was
run on the working tree that became the commit named in §6.7.

### 6.1 The change (`functions/stripeBilling.js`)

Two mechanisms, one transaction, no Stripe call inside it.

- **The write is one Firestore transaction.** `applySubscription` (`:1335`) resolves the workspace, takes
  the pre-read (`stripeSubscriptionEventOrdering`, `:609`), retrieves canonical state exactly as before —
  and then hands the write to `commitStripeSubscriptionApply` (`:1462`). Inside `runTransaction` the
  callback reads the ledger row, the whole `subscriptions` collection and the workspace document first
  (`readEntitlementInputs`, `:915`), then writes the ledger row, the add-on fields (seat quantity and the
  limit computed from it in the same `set`) or the plan resolve, and the fallback stamps — or writes
  nothing. Reads before writes is Firestore's rule; reading the workspace document is what makes two
  applies for *different* subscriptions of one workspace serialise on the engine instead of each resolving
  from a picture that is missing the other.
- **The decision is taken again on the committed row.** Two checks at `:1486-1487`:
  (a) `eventSequence < stripeEventSequence` now → stale after all → `{ stale }` and no write, whatever
  the pre-read said; (b) the row's **`stripeApplyGeneration`** (new field, `stripeApplyGenerationOf`,
  `:533`; incremented by every applied write, `:708`) differs from the generation this apply read
  **before its snapshot** → `{ conflict }` and no write. On a conflict `applySubscription` re-reads Stripe
  *outside* the transaction (`retrieveCanonicalSubscription`, `:1433`) and retries against the generation
  it saw, at most `STRIPE_APPLY_CONFLICT_RETRIES = 3` times (`:542`); then it throws, which keeps the
  webhook retryable (500 → redelivery; `stripeBillingEvents` row stays `received`). The watermark is
  written as `max(seen, event)` (`:707`) and a resync still leaves it alone.
- **The generation is read before the snapshot on every rail.** The `customer.subscription.*` rail already
  pre-read before its retrieve. The three rails that retrieve first (checkout `:1200`, `invoice.paid`
  `:1602`, `invoice.payment_failed` `:1634`) now take `stripeApplyBaseline` (`:1451`) — the same pre-read —
  *before* their retrieve and pass it in; each keeps its one retrieve and its existing error semantics.
  The resync reads every Stripe row's generation **before `subscriptions.list`** (`:1868`) and hands each
  listed subscription its expected generation (`:1905`); a row the baseline does not know (a re-subscribe
  under a new id) is expected at 0, which is how an absent row reads, so it applies.
- **The resync's closing step is under the same guard.** Deactivating rows Stripe no longer lists,
  clearing add-on fields no active row backs, and the plan resolve used to be three writes computed from
  the list; they are now one transaction (`:1926`) computed from the rows as they stand, and an unlisted
  row is touched only if it still carries its baseline generation (`:1937-1938`) — "Stripe no longer
  lists it" is a claim about the list's snapshot and is not made about a row that is newer than it.
- **The resolver is split, not changed.** `recomputeEffectiveWorkspaceEntitlement` (`:1082`) is now
  `readEntitlementInputs` + pure `resolveWorkspaceEntitlement` (`:925`) + one merge write, so the apply
  can run the resolve inside its transaction with this subscription's row substituted for the pending
  write. The Apple, Google and scheduled callers keep calling the wrapper; the one visible difference for
  them is that the workspace document is read on every resolve rather than only on the no-plan branch.

Not changed: the ordering rule itself (`<`, never `<=`), the trial-stamp exception (§2.1 and the fix
document's A–E), `processStripeEvent`, the checkout session and portal callables, `deleteMyAccount`'s
cleanup helper.

### 6.2 Tests — fake Firestore (`stripe-invoice-api-drift.test.js`, 49 → 55 checks)

The L1 check (`:1990`) is kept verbatim and is now **green**. Six checks added (`:2143-2409`), each driven
through `processStripeEvent` or the real `resyncStripeWorkspaceEntitlements` callable (run as the
callable, with the fake Stripe supplied through the module cache for the duration of the call):

| # | Check | What it pins |
|---|---|---|
| 1 | in-flight applies that read the seats **and** the storage alive cannot write either back after both were cancelled | requirement 1 on both add-on branches; skip reason names the out-ranking event; `state()` byte-identical after the two late applies; **zero writes** by them |
| 2 | an owner resync whose list read the seats alive cannot write them back over a webhook cancellation that landed after the list | requirement 2; conflict logged; exactly **one** re-read of Stripe; cancellation stands; watermark untouched; generation 3 |
| 3 | a resync applied first is corrected by the webhook that follows, and a re-subscribe or a quantity change through resync still applies | resync-first → webhook; resync listing the cancellation agrees; new id applies at generation 0; quantity 2 → 4 → 1 all apply; a listed cancelled row is not filed "missing at provider" |
| 4 | two events in the same second … converge on the cancellation whichever lands last | equal is not stale; the late one conflicts, re-reads, applies the cancellation; retrieves `active, active, canceled, canceled` |
| 5 | concurrent applies of the plan, the seats and the storage on one workspace contend, and each still sees the others | three transactions at once; fake reports retries > 0; all three rows and both add-ons present |
| 6 | a failed apply transaction and an exhausted conflict retry each leave no partial write, and the redelivery repairs both | commit failure → only the event row written, `received`, no `processedAt`; redelivery lands whole. Perpetual conflict → 1 + 3 re-reads then throws, generation advanced only by the other writer, watermark unmoved; redelivery lands |

The fake gained what these need: a version per collection so a transaction that read the
`subscriptions` collection is overtaken by a row written under it, and a `failCommit` injection. The
existing trial checks A–E, the retry check (§2.1), the retrieve-error and stale-event checks ran unchanged
(the suite's count guard is 55). `trial-checkout` 7/7, `apple-billing-order`, `entitlement-shopify`,
`shopify-billing`, `commerce-woo-adapter`: green.

**Red on removal** (each mutation applied to the fixed file alone, suite re-run, file restored and
byte-compared to the fixed copy):

| Mutation | Result |
|---|---|
| M1 delete the write-time stale re-check (`:1486`) | **2 red**: the L1 check and #1 (the late apply lands, `updated: true`) |
| M2 delete the generation-conflict check (`:1487`) | **3 red**: #2 (resync writes its old list), #4 (equal-second apply writes its old snapshot), #6 (the contested apply is "handled") |
| M3 write `stripeEventSequence` as-is instead of `max(seen, event)` | green — the re-check at `:1486` already refuses every write that would lower it; `max` is belt and braces |
| M4 resync takes its expected generation from a read **after** the list instead of before | **1 red**: #2 — the ordering of the generation read relative to the snapshot is load-bearing |

### 6.3 Firestore emulator (`stripe-apply-transaction.test.mjs`, new, 5 checks — the evidence the fake cannot give)

`firebase emulators:exec --only firestore --project eggcraft-studio "node functions/test/qa/stripe-apply-transaction.test.mjs"`
runs the shipped factory through `firebase-admin` against the emulator, real `runTransaction`, real
`serverTimestamp`, a fake Stripe. All five **PASS**:

1. **L1 interleave**: A held at its retrieve, B cancels, A released → A `skipped / stale_subscription_event
   / appliedEventSequence = B's`; workspace `cancelled / 0 / limit 5`; watermark B's; and Firestore's own
   proof that A wrote nothing — the workspace document's and the ledger row's **`updateTime` are equal
   before and after A** (any write by A carries a `serverTimestamp`).
2. **The transaction itself**: A's transaction held open *after* its reads, B started while A holds. The
   emulator serialised B **behind A's read locks** (the server-SDK semantics: reads lock, writers wait;
   B did not commit within 1.5 s while A was held), then A committed, then B's cancellation landed over
   it — 4 callback attempts for 3 transactions, cancellation the last word, watermark B's. The check
   accepts either engine behaviour (optimistic re-run or pessimistic wait) and records which occurred;
   the guard is correct under both because the re-check reads the committed row after the lock is held.
3. **Resync race**: list snapshot taken, webhook cancellation applied, list released → conflict logged,
   exactly one re-read, cancellation stands, generation 3, `billingUpdatedBy: stripe_owner_resync`.
4. **Resync first, then webhook; re-subscribe and quantity change** (the callable's one-minute throttle is
   real time here; the check clears the request stamp between refreshes, standing for the minute).
5. **Three subscriptions applied at once**: 6 callback attempts for 3 transactions — three real
   contention retries on the engine — and every row and add-on survives with generation 1 each.

The file sits in `test/qa/*.test.mjs`, so `npm run test:rules` now includes it (needs the emulator, like
the other seven).

### 6.4 Full suite on the final code

`npm test` (emulator-independent tier, 102 suites): exit 0, **1,231 PASS, 0 FAIL** (was 1,223 in §2.2:
+6 drift checks, +2 elsewhere counted by the same grep). Run once, on the tree that was committed.

### 6.5 Deploy list, re-derived

Method as before — every factory-level and module-level unit of `stripeBilling.js` compared
comment-stripped between live (`0ad2a2aa`) and the candidate, then each exported handler traced through
the module's call graph to the changed units. The previous two-function answer was **not** carried over;
it no longer holds, because the L1 fix touched the shared resolver.

| Export | Reaches changed code | Why | Serving revision (read 10 Sep, 100 % traffic) |
|---|---|---|---|
| `stripeWebhook` | **yes — carries the fix** | all four rails → `applySubscription` → `commitStripeSubscriptionApply` | `stripewebhook-00046-peq` (2026-09-06T01:48:01Z) |
| `resyncStripeWorkspaceEntitlements` | **yes — carries the fix** | baseline, guarded applies, closing transaction | `resyncstripeworkspaceentitlements-00031-seb` (06T03:03:53Z) |
| `scheduledBillingEntitlementReconcile` | yes | `recomputeEffectiveWorkspaceEntitlement` (split resolver) | `scheduledbillingentitlementreconcile-00008-poq` (06T01:55:31Z) |
| `verifyAppleSubscriptionPurchase` | yes | same resolver via `persistApplePlanSubscription` | `verifyapplesubscriptionpurchase-00009-qop` (06T03:04:01Z) |
| `appleAppStoreServerNotification` | yes | same | `appleappstoreservernotification-00009-mek` (06T02:09:35Z) |
| `verifyGooglePlayPurchase` | yes | same | `verifygoogleplaypurchase-00009-yaf` (06T04:14:48Z) |
| `googlePlayRtdnNotification` | yes | same | `googleplayrtdnnotification-00009-rey` (06T03:38:14Z) |
| `createStripeCheckoutSession`, `createStripeCustomerPortalSession`, `prepareAppleSubscriptionPurchase`, `prepareGooglePlayPurchase` | no | — | not in the list |
| `deleteMyAccount` (index.js, via `_internal.cancelWorkspaceStripeSubscriptionsForDeletion`) | no | helper unchanged, reaches nothing changed | not in the list |

**The deploy list is the seven.** Two of them carry the L1 guard; the other five carry only the split
resolver, which reads the same rows, writes the same fields and differs by one extra workspace read — they
are functionally compatible with the live resolver either way, and none reads `stripeApplyGeneration`.
Deploying all seven from one commit keeps every writer of the ledger and the workspace on one version of
the resolver; deploying only the two closes L1 and leaves five functions on the old resolver, which is
safe but is a mixed state to reason about later. Recommendation: the seven, by name, in one command:

```
firebase deploy --only "functions:stripeWebhook,functions:resyncStripeWorkspaceEntitlements,functions:scheduledBillingEntitlementReconcile,functions:verifyAppleSubscriptionPurchase,functions:appleAppStoreServerNotification,functions:verifyGooglePlayPurchase,functions:googlePlayRtdnNotification"
```

Never `--only functions` (branch divergence, `functions-deploy-branch-divergence`). Every serving revision
above was created on 6 September from the same deploy session as the two already recorded in §2.3.

### 6.6 Rollback and the branch carry

Rollback per service is `gcloud run services update-traffic <service> --region europe-west2 --project
eggcraft-studio --to-revisions <revision>=100` to the revision in the table. Rolling `stripewebhook` and
`resyncstripeworkspaceentitlements` back **re-opens the live add-on HIGH (Addendum 6), the invoice
API-drift skips, and L1** — L1 is present in live by the same read-decide-then-write shape (§4); it never
shipped fixed. Rolling the other five back changes nothing observable. The new ledger field
`stripeApplyGeneration` is ignored by the live code, so a rollback needs no data change; a later re-deploy
of the fix picks the field up where it stands.

Branch carry is unchanged from §2.3: `git merge --ff-only stripe-trial-stamp` onto
`macbook-save-before-macstudio-2026-06-01` from the main checkout, push, deploy from there; every other
worktree that deploys functions rebases first; `git merge-base --is-ancestor <§6.7 commit> HEAD` as the
pre-deploy guard.

### 6.7 Commit, limitations, decision

**Commit:** `d8b605ae928599a3f5fff4bda620da77bd7af355` on `stripe-trial-stamp` ("L1 closed: the apply decides
again at the moment of writing, in one transaction"), pushed to origin; this hash line is the only later
change on the branch, in a docs-only commit. Product change: `functions/stripeBilling.js` only. Tests:
`stripe-invoice-api-drift.test.js` (+6, harness extended), `stripe-apply-transaction.test.mjs` (new).
Evidence: this section. `node_modules` symlink removed before the commit.

**Limitations, stated:**

- Under the server SDK's pessimistic locking (observed on the emulator, documented for production) a
  transaction now holds read locks on every ledger row and the workspace document for its duration. The
  callback makes no network call, so the hold is milliseconds; concurrent applies of one workspace, and
  non-transactional writes to its document, wait rather than fail. Contention beyond the SDK's five
  attempts throws, which is retryable on both rails.
- The generation read for the three retrieve-first rails is taken by `stripeApplyBaseline` only when the
  session's or invoice's own references resolve a workspace; when they do not (a subscription nothing can
  find yet), `applySubscription` resolves and pre-reads after the retrieve, which is the pre-fix window,
  confined to that case.
- Rows written before this deploy carry no `stripeApplyGeneration`; they read as 0 and start counting at
  the first applied write. A row at legacy 0 and an absent row are indistinguishable to the guard, which
  is safe: both mean "nothing applied since the baseline".
- Not in scope, observed while here, **not HIGH**: (i) `planUpdatePayload` writes the base plan's
  `billingTeamMemberLimit` on every plan resolve, so a plan renewal after a seat purchase leaves that
  display field at 5 while `billingAdditionalTeamSeatQuantity` stays 3 — enforcement
  (`activeAdditionalTeamSeats`, `effectiveTeamSeatLimit`, index.js) reads the add-on fields, not this one;
  pre-existing, unchanged, #5 above deliberately does not assert it. (ii) The resync's closing reconcile
  clears seat/storage fields when no active **Stripe** add-on row exists, as the live code did from the
  list — an Apple add-on on a workspace whose owner presses the Stripe refresh is cleared until the Apple
  path re-grants it; pre-existing, mirrored on purpose to keep this change narrow.
- The mutation runs prove the tests are load-bearing for the guard; they do not prove the absence of a
  third interleaving nobody has driven. The emulator run proves the transaction semantics the fake
  models; it is not a production observation — no production data was read for L1 beyond the revision
  list, and none was changed.

**Decision: GO** for the seven-function deploy in §6.5 from the commit in §6.7, subject to the operator's
separate deploy approval, which this section does not constitute. No new HIGH was found while closing L1.

## 7. The §6.7 fallback closed, and the deploy scope stated without ambiguity (10 September)

Operator, 10 September: the L1 transaction, mutation and emulator evidence is accepted; GO is **not**
accepted while §6.7's "if the workspace cannot be resolved before the retrieve, the old window remains"
stands. This section closes that path only. No deploy, no production change, no Chrome.

### 7.1 Where the fallback is, and when it is reached

The three retrieve-first rails take their baseline (`stripeApplyBaseline`, `:1467`) from the session's
or invoice's **own** references — `metadata.workspaceId`, the subscription id, the customer — before they
retrieve. When none resolves a workspace the baseline is `null`, the rail retrieves anyway, and
`applySubscription` resolves the workspace from the **retrieved subscription's** references (`:1358`
onward). Up to `d8b605ae` it then took its pre-read and wrote the snapshot it had resolved the workspace
from. That snapshot predates the pre-read, so the generation it compared against had been read *after*
anything that landed in between; and whatever landed in between — a cancellation in the **same second**,
or an owner resync, which carries **no event time** — is invisible to the watermark as well. Nothing
refused the write.

Reachability in production, from the code: a NivaDesk checkout session carries `metadata.workspaceId`
(`:2106-2127`), a customer created before the session and written to the workspace as
`billingCustomerId` (`:476-488`), and `subscription_data.metadata` with the same workspace id; Stripe
copies the subscription's metadata onto every invoice's `parent.subscription_details.metadata`. So for
NivaDesk-created subscriptions the baseline resolves through the workspace id or the stored customer, and
the fallback is reached only when the session or invoice lacks those references while the subscription
still carries the workspace metadata — a session or invoice not created by NivaDesk (a Dashboard
subscription whose metadata was set by hand), or a workspace document that no longer exists under the
metadata id while the customer is not stored on any other. Narrow, but it is the resolver's designed
path, the harness fixtures reach it directly, and it cannot be proved unreachable from guards alone: it
is closed instead.

### 7.2 The change (`stripeBilling.js :1398-1401`)

```
const generationFromCaller = expectedGeneration !== null && expectedGeneration !== undefined;
const snapshotPredatesPreRead = subscriptionIsCanonical && !baselineApplies && !generationFromCaller;
if (stripe && (!subscriptionIsCanonical || snapshotPredatesPreRead)) current = await retrieveCanonicalSubscription(...)
```

A retrieve-first rail's subscription is trusted for the write **only behind a baseline**. Without one, it
is used to identify the subscription and resolve the workspace — nothing else — and, once the workspace is
resolved and the pre-read taken, Stripe is read again and *that* is applied under the §6 transaction.
This is the operator's prescription verbatim: resolve, then baseline, then re-fetch canonical, then the
existing guard. The webhook-body rail is unchanged (it already retrieved after its pre-read); the owner
resync is unchanged (its generation was read before the list, `generationFromCaller`); a rail with a
baseline is unchanged (one retrieve, no extra call). Cost: one additional Stripe call, on the fallback path
only. A workspace that nothing resolves is still `workspace_not_found` — skipped, never written — and a
failing re-read throws, which is the existing retry contract (500 → redelivery; row stays `received`).

### 7.3 The test — fake Firestore (`stripe-invoice-api-drift.test.js :2482`, 55 → 56)

One check, five runs. Four fallback cases: `checkout.session.completed` with B a **same-second
`customer.subscription.deleted`**; the same with B an **owner resync** (no event time); `invoice.paid`
and `invoice.payment_failed` with the same-second B. In each, no ledger row and no workspace field names
the subscription (the shape of a real first checkout), the session/invoice carries no reference, A is held
at its first retrieve with the seats alive, B lands, A resumes and resolves the workspace from its read.
Asserted, outcome first: seats `cancelled / 0 / limit 5`, row inactive and `canceled`, generation 2 (B's
apply, then A's fresh read applied), watermark B's second; then the mechanism: exactly **one** re-read of
Stripe after the workspace was resolved, and **no** generation-conflict line — which is what tells this
path apart from §6's. A fifth, control run gives the session its workspace reference: the baseline is then
taken before the retrieve, B moves the generation, and A's write is refused as a conflict and re-read —
the §6 road — ending at the same cancellation.

**Red on removal** — mutation M5 restores the `d8b605ae` condition (`if (stripe && !subscriptionIsCanonical)`),
suite re-run, file restored and byte-compared: **1 red, the new check**, first case,
`checkout.session.completed / B=webhook: A wrote the snapshot it resolved the workspace from over the
cancellation: {"aResult":{"updated":true,"workspaceId":"ws_drift","addon":"additional_team_seat_mon…`
(the runner truncates at 200 characters; the assertion that failed is the seats' status, which the fixed
code passes). The other 55 stay green under M5, so the fallback was not covered by any earlier check.
`trial-checkout` 7/7.

### 7.4 The test — Firestore emulator (`stripe-apply-transaction.test.mjs :439`, 5 → 6)

The checkout fallback race with the same-second cancellation, on the real engine: row absent before A's
first read, B applied (generation 1), A released → exactly one re-read, no conflict line, seats
`cancelled / 0 / 5`, row inactive `canceled`, generation 2, watermark B's. **6/6 PASS**; the five §6.3
checks re-ran unchanged because they share the file (4 attempts / 6 attempts as before).

### 7.5 Deploy scope, stated as two separate facts

**Mandatory — carries the L1 fix and this closure (2):** `stripeWebhook` (all four rails →
`applySubscription` → `commitStripeSubscriptionApply`, the baselines, the fallback re-read) and
`resyncStripeWorkspaceEntitlements` (baseline before the list, guarded applies, closing transaction).
Without these two the HIGH stays open.

**Optional — behaviour-neutral resolver refactor (5):** `scheduledBillingEntitlementReconcile`,
`verifyAppleSubscriptionPurchase`, `appleAppStoreServerNotification`, `verifyGooglePlayPurchase`,
`googlePlayRtdnNotification`. They reach changed *code* only through
`recomputeEffectiveWorkspaceEntitlement`, which was split into read + pure resolve + one write. Whether
that is neutral was **measured, not asserted**: the live module (`0ad2a2aa`, with its resolver exposed
through a temporary copy) and the candidate were run against the Firestore emulator on identically seeded
workspaces for seven scenarios — Stripe plan with both add-ons; no plan → demo after a cancellation; no
plan, `unpaid` → expired; manual plan preserved; Shopify plan preserved; two active plans (Apple Team
out-ranks Stripe Pro, duplicate fields set); Apple grace period — comparing the returned result, every
written field except the `*At` timestamps, and the set of timestamp fields written: **7 same, 0
different**.

Does leaving the five on the old binary next to the new transactions create an inconsistency? No, and
here is the write path. The old resolver reads the `subscriptions` collection, reads the workspace on the
no-plan branch, and merge-writes the same payload (proved above); it never reads or writes
`stripeApplyGeneration`, which the guard ignores when absent. The scheduled reconcile's row flip
(`activeForEntitlement: false, providerStatus: "expired"` on a plan row past its period end) is the same
non-transactional merge-set in both versions and does not bump the generation in either — correctly,
because it is derived from a date and is never newer than Stripe's truth: a Stripe apply that then lands
writes canonical state over it (right), and a resync's listed state does the same. Apple and Google write
their own `apple_…`/`google_…` rows, never Stripe rows. Under the server SDK's pessimistic locking their
non-transactional writes wait for an open apply transaction rather than interleave with it. The pre-existing
race between the reconcile's stale decision and a concurrent apply exists identically with the old and the
new resolver and is not part of L1. So the five are **not** required for correctness; deploying them is a
version-unity choice and is presented as exactly that. Rollback anchors for all seven remain as in §6.5.

### 7.6 Candidate, limitations, decision

**Candidate commit:** the commit carrying this section — code, both test files and this evidence in one
commit, hash reported to the operator and recorded in memory. Product change since `d8b605ae`:
`stripeBilling.js` +23/−9 lines, all in `applySubscription`'s canonical-state step and one comment.

**Remaining behavioural limitations** (unchanged from §6.7 except the first, which is closed):
- ~~pre-read after the retrieve when the rail's references resolve nothing~~ — closed by §7.2; the
  remaining behaviour on that path is one extra Stripe call.
- Pessimistic read locks for the transaction's duration (milliseconds; no network call inside).
- Rows from before the deploy read as generation 0 until first applied; indistinguishable from an absent
  row, which is safe.
- Not L1, not changed, not HIGH: `planUpdatePayload` writes the base `billingTeamMemberLimit` on a plan
  resolve (enforcement reads the add-on fields); the resync's closing reconcile considers Stripe add-on
  rows only, as live does.

**Decision: GO** for the mandatory two, from the candidate commit, by name; the five are optional and
neutral. Deploy approval remains the operator's separate act. No new HIGH was found.
