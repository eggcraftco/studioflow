# Activation v2.1 — dry-run comparison and rollout package (10 September 2026, night)

Status: **prepared, not cut over.** The checklist side of v2.1 is live (`getSetupChecklist`, deployed
by name on 10 Sep — see `substantive-order-wiring.md` §6). The funnel side — `lifecycle/derive.js`
skipping shell orders — is on branch `onboarding-retention` (`eabbe001`) and **not** in production.
No lifecycle record, cohort record or message trigger was changed. Sending is off.

## 1. What changes when the funnel derivation moves to v2.1

Read-only dry run over every workspace (65; 64 external, the review workspace excluded), 02:24 UTC,
with the same per-workspace snapshot `getActivationFunnel` builds (orders ≤400, customers ≤400, bank,
accounting and inventory connections, settings), derived three ways:

| Derivation | Activated | Lifecycle states |
|---|---|---|
| **production today** (`derive.js` on the deploy branch) | **23** | new 37 · dormant 12 · at_risk 8 · setup_started 4 · activated 2 · engaged 1 |
| **gate only** — production derivation with non-substantive orders removed before deriving (exactly what §3.1's one line does) | **9** | new 52 · at_risk 7 · setup_started 3 · engaged 1 · dormant 1 |
| **branch `derive.js`** (gate + the 9 Sep "a skip is a refusal" derivation) | **9** | onboarding 18 · new 34 · at_risk 7 · setup_started 3 · engaged 1 · dormant 1 |

- The activation count moves **23 → 9** and the whole move is the substantive gate; the skip
  derivation changes no activation, it only relabels 18 zero-order workspaces `new → onboarding`
  (the state activation.js reports for a skipper — the "wrong tense" already pinned in the derive test).
- The 9 September baseline said 24 → 11; two workspaces since then either gained a substantive
  order or lost one to deletion. The direction and the size of the correction are the same.
- **Sixteen workspaces flip** under the gate, all of them shell-only (38 shell orders between them,
  16 with `firstOrder: shell`): 13 `dormant → new`, 2 `activated → new / setup_started`,
  1 `at_risk → new`, 2 `setup_started → new`. Their ids are in the dry-run log
  (`v21-dryrun-2.log`, ids only, no names). Every one of them now sees "Complete your first project"
  pointing at their newest shell — the live checklist already does this.
- Ten workspaces have a substantive first order; 38 have none at all.

## 2. What the flips mean for lifecycle transitions and message triggers

`lifecycle/messaging.js` and `risk.js` read the derived state. Under the gate, thirteen workspaces
stop being "dormant activated" and become "new, never activated"; two stop being "activated". Any
rule keyed on `activated` / `dormant` (re-engagement, win-back) would stop firing for them and any
rule keyed on `new` / `setup_started` (nudges) would start considering them. **Sending is off**
(Task 4's flags), so today this changes numbers on the admin funnel, not messages. The cutover must
not be done while a retention rule is armed for the `new` cohort without re-reading these sixteen.

## 3. Rollout package (operator decision)

1. Carry `derive.js` + `lifecycle-derive.test.js` from `onboarding-retention` to the deploy branch
   (they differ from the deploy branch already because of the 9 Sep skip derivation — carry both
   changes together or neither; the test file pins both).
2. Deploy **`getActivationFunnel`** by name (the only production reader of `derive.js` today; the
   lifecycle jobs, if any are scheduled, are listed in `docs/onboarding/activation-definition-v2.md`
   and must be named individually — never `--only functions`).
3. Expect the admin funnel to read **9 activated of 64** and the sixteen ids above to move to `new`.
4. No backfill: nothing derived is stored; the funnel recomputes from the documents on every call.
5. Rollback: redeploy `getActivationFunnel` from the previous commit (`b9aeec70` on the deploy branch
   has the old `derive.js`).

## 4. First measurement after the web publish (Round 169, live 02:11:49 UTC)

Taken at **02:24 UTC** from the same dry run, i.e. 13 minutes after the onboarding package went live —
a baseline, not an outcome:

| | |
|---|---|
| external workspaces | 64 |
| activated (production rule / v2.1 rule) | 23 / 9 |
| workspaces whose only orders are shells | 16 (38 shell orders) |
| workspaces with no order at all | 38 |
| workspaces with a substantive first order | 10 |

Nothing about retention can be concluded from this; it is the number to compare against in a week.
