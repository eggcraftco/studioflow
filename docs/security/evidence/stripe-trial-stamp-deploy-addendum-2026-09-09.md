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
