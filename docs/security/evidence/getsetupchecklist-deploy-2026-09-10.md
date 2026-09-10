# getSetupChecklist deploy — 10 September 2026, 02:29 UTC

| | |
|---|---|
| Source | deploy branch `macbook-save-before-macstudio-2026-06-01` @ `b9aeec70` (carry of onboarding-retention `eabbe001`'s checklist side; predicate module `e5695be0` = cherry-pick of `7aab1f44`) |
| Pre-deploy checks | `76c5e3c3` (Stripe fix) and `baa21204` (OpenAI 1.2.0) are ancestors; tree clean but for the night report; `functions/.env` present, orchestrator flag line intact; `nodemailer` 9.1.1 installed; full `npm test` in `functions`: exit 0, 1,489 PASS |
| Command | `firebase deploy --only "functions:getSetupChecklist" --project eggcraft-studio --non-interactive` → "Successful update operation", exit 0 |
| Revision | `getsetupchecklist-00002-zeq` → **`getsetupchecklist-00003-noh`**, 100 % traffic |
| Index | `siparisler (companyId ASC, paymentDate DESC)` created 02:14 UTC, **READY** before the deploy (the ordered read is the steady state; the unordered fallback never had to serve) |
| Handler evidence | read-only mirror of the new logic against production: shell-only workspaces (17 shells / 1 shell) → "Complete your first project" with `open_order` → newest shell id; the review workspace (26 orders) → `order_created` done, `complete: true`; "read: ordered" in all three |
| Live | review account, Round 170 web: `/home` Getting started card renders after the deploy (first open step "Import your first order" as before, order step ticked), `/dashboard` renders, no console error; `getsetupchecklist` logs after the deploy: 200s on `00003-noh`, no error line |
| Not deployed | `getActivationFunnel` / `derive.js` (§3.1) — dry run and rollout package in `docs/onboarding/activation-v2.1-rollout-2026-09-10.md` (onboarding-retention `f295814f`) |
| Rollback | `gcloud run services update-traffic getsetupchecklist --region europe-west2 --to-revisions getsetupchecklist-00002-zeq=100`, or redeploy the function by name from `cc9d5979` |
