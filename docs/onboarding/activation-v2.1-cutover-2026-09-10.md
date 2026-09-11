# Activation v2.1 — the cutover package, ready to deploy (10 September 2026, afternoon)

Prepared while the operator was away, per the instruction "verify the old/new result differences and the affected
workspaces; complete the applicable transition package without a data change". Nothing was deployed and nothing
in Firestore was written.

## 1. The difference, re-measured read-only at 13:52Z (`v21-dryrun.mjs`, ids only, no names)

| | Old (`derive.js` live today) | Gate only | New (this branch's `derive.js`) |
|---|---|---|---|
| Activated workspaces (of 64 external) | **23** | **9** | **9** |
| Lifecycle states | new 37 · dormant 12 · at_risk 8 · setup_started 4 · activated 2 · engaged 1 | — | 18 zero-order workspaces relabel `new → onboarding`; the 16 below flip |

Unchanged from the night's dry run (02:24Z): the whole move 23 → 9 is the substantive-order gate; the skip
derivation only relabels. **Sixteen workspaces flip**, all of them shell-only (38 shell orders between them):
`2R4ltpnQ…` dormant→new · `61nNqjDx…` activated→new · `Jro4NLxG…` activated→setup_started · `LdCRwOTG…` dormant→new ·
`MN8lHVXz…` dormant→new · `P5eI1VzI…` dormant→new · `RrFWqjED…` dormant→new · `YeOKKhVW…` dormant→new ·
`Yl4v2SUX…` dormant→new (17 shells) · `Zr9KG4l7…` dormant→new · `a374UIpw…` setup_started→new · `jVVwNjDy…`
setup_started→new · `omUX4bne…` dormant→new · `p5bfCb9p…` at_risk→new · `qrOKICjj…` dormant→new · `tNFtO5ju…`
dormant→new. Full ids in the dry-run log. Every one already sees "Complete your first project" from the live
checklist (v2.1 `getSetupChecklist`, deployed 10 Sep).

## 2. What this branch carries — and what the night's plan would have broken

The night's package said "carry `derive.js` and `lifecycle-derive.test.js` from `onboarding-retention`". Since then the
deploy branch's `derive.js` gained the eBay merge's change (`integration_connected` derived from `snapshot.ebayConnections`,
carried on 10 Sep), and the eBay wiring test pins it. A wholesale carry would have reverted that — the suite said so
(`FAIL … lifecycle derives integration_connected from eBay rows`). So the two files were merged **three-way**
(base `bc26a7ba`, ours = deploy tip, theirs = `onboarding-retention`): clean, no conflict markers; `derive.js` now holds
both the eBay derivation and the v2.1 gate + skip derivation; the test pins both. Commit **`1fb4d17e`** on
`activation-v21-cutover` (pushed). Suite: `lifecycle-derive.test.js` green; full `npm test` **1,661 PASS, exit 0**.

## 3. The cutover — the operator's commands

The only production reader of `derive.js` is `getActivationFunnel` (`index.js:30255`); the checklist already runs v2.1.

```bash
git checkout macbook-save-before-macstudio-2026-06-01 && git merge --no-ff activation-v21-cutover
# runbook pre-checks (docs/audit-deploy-checklist.md), then, by name:
npx firebase deploy --project eggcraft-studio --only functions:getActivationFunnel
```

Expect the admin funnel to read **9 activated of 64** and the sixteen ids above to show `new` / `setup_started`
(the 18 zero-order workspaces `onboarding`). No backfill: nothing derived is stored; the funnel recomputes on every call.

**Rollback:** redeploy `getActivationFunnel` from the deploy branch before the merge (`51ad6953`) — the old `derive.js`
is there; no data to restore.

**Caveat carried from the night (rollout doc §2):** thirteen workspaces stop being "dormant activated" and become
"new"; any retention rule keyed on `new` / `setup_started` would start considering them. Sending is off
(`NIVADESK_RETENTION_*` unset); do not cut over while a `new`-cohort rule is armed without re-reading these sixteen.

## 4. Finalised on 11 September 2026 — candidate, re-measurement, impact, deploy scope, rollback

### 4.1 Candidate

Branch **`activation-v21-cutover-candidate`**, commit **`21d13bb4`** = the deploy tip `8bd71b57` (feedback live for
every workspace, eBay stage as recorded) + `git merge --no-ff activation-v21-cutover`. The merge touched exactly the three
files this package always carried — `functions/lifecycle/derive.js` (+63 −1 vs the deploy tip), `functions/test/qa/lifecycle-derive.test.js`,
this document — and nothing else: `functions/index.js`, `functions/feedback.js`, `functions/lifecycle/feedback.js`,
`functions/ebayConnector.js` and `firestore.rules` are byte-identical to `8bd71b57`. `git merge-tree` reported no conflict;
the deploy branch had not touched `derive.js` since the merge-base `51ad6953`, so the three-way carry of 10 Sep (`1fb4d17e`)
still holds: `derive.js` keeps the eBay `integration_connected` derivation **and** gains the v2.1 gate (`isSubstantiveOrder`)
plus the skip derivation.

Tests run on the candidate, chosen for the diff: `lifecycle-derive.test.js` PASS, `activation-funnel-wiring.test.js` PASS
(pins that `index.js` requires `./lifecycle/derive` and calls `deriveEvents`), `commerce-ebay-wiring.test.js` PASS (pins the
eBay `integration_connected` derivation in `derive.js`), `lifecycle-substantive-order.test.js` PASS, `feedback.test.js`
PASS (the live feedback code, untouched). CI (`functions-tests`, run 34548748823 on `21d13bb4`): **success** (both jobs: unit on the fake Firestore, rules + e2e on the Firestore emulator; 2026-09-11 ≈01:02Z).

### 4.2 Dry run re-measured on today's data (11 Sep 01:00Z, read-only, `v21-dryrun-2.mjs`)

Same scope rule as the 10 Sep run: every company document (66 today), "external" = not in the one-id `OUR` set
(`KSQidetb…`). OLD = `derive.js` at the deploy tip (an extracted copy), NEW = the candidate's `derive.js`; `activation.js`
and `substantiveOrder.js` are the same files in both runs (unchanged by the merge).

| | OLD | NEW |
|---|---|---|
| Activated, external (of 65) | **24** | **10** |
| Activated, all 66 (what the live funnel's `totals.activated` will show; it excludes nobody) | 25 | 11 |
| Lifecycle states, external | new 37 · dormant 13 · at_risk 7 · setup_started 4 · activated 2 · engaged 2 | onboarding 18 · new 34 · at_risk 6 · setup_started 3 · dormant 2 · engaged 2 |

**Both directions.** Active → inactive: **14**. Inactive → active: **0**. Net −14. All fourteen are shell-only
workspaces (every order fails the substantive predicate; 0 substantive orders each; 1–17 shells): eleven land in
`onboarding` (`onboarding_in_progress`), two in `new` (`no_setup_action` — `P5eI1VzI…`, `qrOKICjj…`), one in `setup_started`
(`setup_action_without_activation` — `Jro4NLxG…`, bespoke_studio path). Ids: `2R4ltpnQ…`, `61nNqjDx…`, `Jro4NLxG…`,
`LdCRwOTG…`, `MN8lHVXz…`, `P5eI1VzI…`, `RrFWqjED…`, `YeOKKhVW…`, `Yl4v2SUX…`, `Zr9KG4l7…`, `omUX4bne…`, `p5bfCb9p…`,
`qrOKICjj…`, `tNFtO5ju…` — the same fourteen as on 10 Sep.

**Relabels without an activation change: 9** — seven zero-order workspaces `new → onboarding` and two shell-only
workspaces `setup_started → new` (`a374UIpw…`, `jVVwNjDy…`). Total state changes 23 = 14 + 9.

**The arithmetic behind "23 → 9, 16 flips" (10 Sep), reconciled with today's "24 → 10, 14 + 9":**
* 23 → 9 was 14 activations lost and 0 gained; today 24 → 10 is the same 14 lost and 0 gained. The extra activated
  workspace on both sides is our own **test workspace `GuglEFKS…`**, which had no orders on 10 Sep and gained one
  substantive order at 22:45Z that evening (the feedback pilot's synthetic order); it is `engaged` under both derivations.
* "16 flips" on 10 Sep counted the 14 activation losses plus the two `setup_started → new` relabels; it did not count
  the zero-order `new → onboarding` relabels, which that document listed separately as "18 zero-order workspaces". That
  "18" is in fact the NEW `onboarding` total, of which only seven are zero-order relabels; the other eleven are shell-only
  workspaces losing activation. Today's count keeps the two kinds apart.

**Test / demo workspaces inside the counted set — reported, scope unchanged:** `FvnnEcQA…` (named "test", 0 orders,
not activated either way), `GuglEFKS…` (our test workspace, activated both ways because of the synthetic pilot order),
`iZFBJqrT…` (EGGcraft, our company, 84 orders, activated both ways). `KSQidetb…` is the only workspace the dry run
excludes as `OUR`; the live funnel excludes none of the four. Whether to exclude them from the admin funnel is a separate
decision; this package does not change the funnel's scope.

### 4.3 What the cutover changes — by code dependency, not assumption

| Reader | Uses `derive.js`? | Effect of this cutover |
|---|---|---|
| `getActivationFunnel` (`functions/index.js:30270`; `require("./lifecycle/derive")` at :30277; `deriveEvents(snapshot)` at :30313) | **yes — the only production reader** | its `workspaces[].state/activated` and `totals.activated` change as in §4.2. The function **writes nothing** (no `set`/`update`/`batch` in its body); every call recomputes, so there is no backfill and nothing to migrate |
| `getSetupChecklist` (`index.js:30135`) | no — it calls `substantiveOrder.firstOrderProgress` directly (:30138, :30181) | unchanged; it has run v2.1 since 10 Sep |
| Feedback (`functions/feedback.js` :26–28 imports `lifecycle/feedback`, `lifecycle/substantiveOrder`, `lifecycle/messaging`; `lifecycle/feedback.js` imports `messaging` and `substantiveOrder`) | no `derive`, no `activation` import | **unchanged**: invitation eligibility is `firstSuccess()` over the workspace's orders with the same substantive predicate; the cutover neither adds nor removes an invitation |
| Retention rules | no reader of `NIVADESK_RETENTION_*` exists on this branch (`retention-wiring` is not merged) | nothing to influence today; the 10 Sep caveat stands for the day a `new`/`onboarding`-cohort rule is armed: thirteen of the fourteen ex-"dormant/activated" workspaces would then be in scope |
| Stored records | — | none: lifecycle states are not persisted anywhere; only the funnel's response changes |

### 4.4 Deploy scope, expected reading, rollback

* **Deploy, by name, from the deploy branch after `git merge --no-ff activation-v21-cutover-candidate`** (runbook
  pre-checks first): `npx firebase deploy --project eggcraft-studio --only functions:getActivationFunnel`. One function.
  The web needs nothing (the admin Activation tab already renders `state`/`activated` as returned).
* **Expected on the admin Activation tab afterwards:** `totals.activated` **11 of 66** (10 external + `KSQidetb…`), the
  fourteen ids above in `onboarding` / `new` / `setup_started`, eighteen workspaces labelled `onboarding`.
* **Rollback:** redeploy `getActivationFunnel` from `8bd71b57` (the deploy tip before the merge — the old `derive.js` is
  there); no data to restore. Not touched by this package: OpenAI review surface, Stripe, the live feedback behaviour,
  retention flags (unset), any user-facing message.
