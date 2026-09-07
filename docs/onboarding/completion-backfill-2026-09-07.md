# Onboarding completion backfill — one-time, 13 records

**What was wrong.** Four clients wrote onboarding completion, two of them wrote only the timestamp and
not the boolean, and two server readers require the boolean with `=== true`
(`functions/index.js:29531` in `getSetupChecklist`, `:31111` in the admin count). So workspaces that had
finished onboarding were invisible to the server as having finished.

## Two corrections made before writing anything

**1. The field names in the instruction were not the field names in the code.** The approval named
`onboardingCompleted` / `onboardingCompletedAt`. The code uses **`businessOnboardingCompleted`** and
**`businessOnboardingCompletedAt`**, and they live on **`companySettings/{companyId}`**, not on the
company document. Writing the instructed names would have created a field no reader looks at — a silent
no-op dressed as a fix.

**2. The population was not 27, and most of it should not have been written.** Dry run over
`companySettings` (80 docs) found **72** with a timestamp and no boolean. Broken down:

| | count | included? |
|---|---|---|
| Settings for a **deleted** workspace (no live `companies` doc) | 37 | no |
| Live, but the user pressed **Skip** | 22 | **no** |
| Live, with a genuine completion action (`standard` 6, `smart` 5, `wizard` 2) | **13** | **yes** |

The Skip exclusion is the one that mattered. `studioflow-web/lib/studioflow/workspaceOnboarding.ts:495`
writes `businessOnboardingCompletedAt` for the **skip** path too, and never writes the boolean. Marking
those 22 as completed would have told the server that 22 people who explicitly declined setup had
finished it — and then the cohort measurement and the nudge targeting, which this backfill exists to
make trustworthy, would have been built on that. The correction protects the very measurement it serves.

## The write

Frozen id list, then each id re-verified immediately before the write (settings doc exists, company
still live, timestamp present, boolean not already true, action not `skip`): **13 of 13 still eligible,
0 rejected.**

```
companySettings/{id}.set({ businessOnboardingCompleted: true }, { merge: true })
```

One field. `merge: true`. No timestamp rewritten, no other field touched.

## Verification after the write

| Check | Result |
|---|---|
| Flag true, `...CompletedAt` still a Timestamp, `...CompletedAction` unchanged | **13 / 13** |
| The 22 Skip workspaces still without the flag | **0 of 22 have it** |
| The 37 deleted-workspace settings untouched | **0 have it, 0 vanished** |
| Estate recount | flag true **5 → 18** (+13); timestamp-without-flag **72 → 59** (−13) |

Ids written: `scratchpad/backfill/written-ids.json`. Full population with both excluded sets:
`scratchpad/backfill/proposed-backfill.json`. Rollback is the same 13 ids with the field deleted.

## Consequence for the cohorts

The 22 Skip workspaces are now their own recovery cohort — **"explicitly skipped onboarding"** — and
must not receive the messaging meant for users who completed setup and failed to activate. They did not
fail at setup; they declined it, which is a different question and probably a different answer.

---

## Re-measurement after the backfill (the operator asked for this)

| Boundary input | Re-measured | Report said |
|---|---|---|
| companies | 63 | 63 |
| no `companySettings` doc at all (cohort A rule) | 22 | 21 — **see note** |
| stamp with `action == "skip"` (cohort B* rule) | 22 | 22 |
| stamp with a real completion action | 18 | — |
| live workspaces with the boolean now true | **18** (5 pre-existing + 13 written) | — |
| ...of which pressed Skip | **0** | — |

**The A difference is not a data conflict.** My rule was the plain one, "no settings document". The
cohort report resolves an overlap by testing activation FIRST, which moves one workspace that satisfies
both A and D into D — and the report states the alternative outright: *"Reverse the order and A becomes
22, D becomes 5."* My 22 is exactly that predicted number, which is corroboration rather than
disagreement.

**Verdict: the backfill is neutral to the cohort segmentation, as expected.** The five cohorts key on
`businessOnboardingCompletedAt` and `businessOnboardingCompletedAction`, never on the boolean. The
boolean's only consumers are the two strict server readers — `getSetupChecklist` and the admin count —
which is exactly the visibility the backfill was for. No cohort number moves, so no recovery decision
is invalidated.

**What the backfill did NOT fix, and must not be mistaken for fixed.** `functions/lifecycle/derive.js:69`
reads only `businessOnboardingCompletedAt` and ignores the action field, so `getActivationFunnel` still
counts all 22 Skip workspaces as having completed onboarding — over-reporting completion by roughly
2.5x on the operator's own dashboard. That is a one-line server change in a file this phase is not
allowed to touch, and it is listed as a backend item rather than silently left.
