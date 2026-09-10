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
