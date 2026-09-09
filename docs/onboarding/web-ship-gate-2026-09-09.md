# Web onboarding package — ship gate, 9 September 2026

Branch `onboarding-retention`, web head `b2d1939b` ("The wizard writes a draft only after a
real touch"). Everything below was run against that head. **Not deployed.** The deploy is a
separate, operator-triggered step; the plan is at the end.

## 1. Static gate

| Check | Where | Result |
|---|---|---|
| `tsc --noEmit` | `studioflow-web` | **exit 0** |
| `next build` (production) | `studioflow-web` | **exit 0** — "Compiled successfully in 11.8s" (the warnings are the two pre-existing autoprefixer notes in `globals.css`) |
| `npm test` | `functions` (includes `lifecycle-derive`, `dashboard-checklist`, guide retrieval) | **exit 0** |

The build ran without the Hostinger environment (the worktree has no `.env.local`); it proves
the code compiles, not the runtime config. Runtime config is Hostinger's and did not change.

## 2. Behavioural gate — real dev server against the Firebase emulator

Setup: auth + firestore + storage emulators from this worktree (no functions emulator, so no
callable and no mail/SMS path could run), `next dev` on :3005 with
`NEXT_PUBLIC_FIREBASE_EMULATOR=1`. Emulator attachment was proven from the page itself before
any sign-in: the only non-local hosts the app talked to were `127.0.0.1:9099`, `:8080`, `:5001`.
Three fixture identities: `qa-review-uid` (the seed's finished Team workspace), `onb-fresh-uid`
(never set up), `onb-skip-uid` (Skipped: `businessOnboardingCompletedAt` + `Action: "skip"`,
no boolean).

| # | Scenario | Observed | Gate item |
|---|---|---|---|
| A | Fresh user opens `/dashboard`; wizard takes over (empty workspace) | STEP 1 OF 5, **no** `nivadesk-onboarding-progress:*` key | resume only after a real partial start |
| A′ | Reload without touching | still STEP 1, still no key | same |
| B | Press Continue | key written, `step: "bringWork"` | persistence |
| C | Reload | resumes at STEP 2 "Bring your work in", Back + Continue present | resume |
| D | Give the workspace an order (takeover no longer automatic) | wizard hidden, **Continue setup** card shown, draft intact | not hijacked (§113) |
| E | Click Continue setup | `?setup=continue`, STEP 2 (resumed), **Not now** + Back + Continue | reopen |
| F | Browser Back | wizard gone, URL clean, draft still `bringWork` | web Back can exit the resumed wizard; leaving writes nothing |
| G | Skip user opens `/dashboard` | no wizard, no Continue setup card, no draft; the five-step Getting started checklist shows **0/5** | Skip remains Skip (not asked again, not counted as finished) |
| G′ | `companySettings/onb-skip` re-read after the visit | exactly the three skip fields; **no** `businessOnboardingCompleted` boolean | Skip never becomes Completed |
| H | Skip stamped on `onb-fresh` from "another device" (admin write), fresh user reloads | wizard and card gone, draft **cleared** | completion/skip clears local progress |
| L | Stamps removed again ("Run Business Setup" reset) | card back, no draft | reset leaves nothing stale |
| M | Continue setup after reset | STEP 1 (not resumed), **no draft written by opening** | resume only after a real partial start |
| N | Not now | back on dashboard, card still there, no draft | leaving writes nothing |
| I–K | Seed owner: `/dashboard`, `/orders`, `/settings` | all render, no wizard, no draft, no application error; dashboard 1/5 with "Create your first order" ticked; the seed order lists | existing flows |
| P | **Mutation:** gate line replaced by `if (false && …)`, served chunk verified to carry the mutation | opening the wizard via the card wrote a draft at `step: "basics"` immediately | the check in M is not vacuous |

File restored after P (`grep -c MUTATION` = 0) and the committed diff re-read before commit.

Two things the emulator run cannot show and are covered elsewhere: the `plan` step's
`setTrialPlan` callable (functions not running here; server-side owner check verified earlier in
`functions/index.js`), and the checklist hrefs (asserted by `functions/test/qa/dashboard-checklist.test.js`
against the shared `setupChecklist.ts`, with three mutations proven).

## 3. Two environment facts worth keeping

- A worktree has no `.env.local`; the dev server then boots with `auth/invalid-api-key`. Only the
  `NEXT_PUBLIC_*` lines were copied in (gitignored). Nothing secret lives in that file.
- After the env fix the browser kept serving the old `app/layout.js` from its HTTP cache (same
  URL, no version query) and the error persisted. `fetch(url, {cache: "reload"})` on the chunk
  fixed it; a "still broken after the fix" on a dev server is worth one cache check before
  anything else.

## 4. Web deploy plan (needs the operator's go — "canlıya at")

The live site (publish repo `studioflow-hostinger-publish-20260530`, HEAD **Round 167**, 6 Sep)
was last published from the eBay line: it carries `app/ebay`, `EbayIntegrationSection.tsx`, six
`lib/studioflow/ebay*.ts` files and Rounds 163–167, none of which exist in this worktree. So
**a whole-tree `rsync --delete` from this worktree would take the eBay web files off the live
site and roll back four rounds.** The deploy is file-scoped instead.

Three-way check, every web file this branch changed, publish version vs the branch point
(`bc26a7ba`, 7 Sep):

| File | Publish vs base | Action |
|---|---|---|
| `app/dashboard/page.tsx`, `app/globals.css`, `app/home/page.tsx`, `components/AppShell.tsx`, `components/OnboardingWizard.tsx`, `components/home/HomeCardBodies.tsx`, `lib/studioflow/firestore.ts`, `lib/studioflow/onboardingWizard.ts`, `lib/studioflow/workspaceOnboarding.ts` | identical to base | copy the branch version over |
| `lib/studioflow/onboardingProgress.ts`, `lib/studioflow/setupChecklist.ts` | new | add |
| `lib/studioflow/language.ts` | **diverged** (eBay rounds added strings) | apply the branch's one-hunk patch ("Continue setup" in 11 languages) onto the publish version — `git apply --check -p2` passes on a scratch copy |

`package.json` dependencies are identical; the only difference is the `test:file-proxy` script
from the frozen `/f/` fix, which stays out. `fileProxyGuards.ts` and the `/f/` route stay out
for the same reason.

Steps:

1. In the publish repo, `git status` clean, on `main`, `git pull`.
2. Copy the nine "identical to base" files and the two new files from
   `studioflow-onboarding/studioflow-web/` to the matching root paths; `git apply -p2` the
   `language.ts` patch (`git diff bc26a7ba..b2d1939b -- studioflow-web/lib/studioflow/language.ts`).
3. `tsc --noEmit` and `next build` **in the publish repo** (it has the eBay files; the branch build
   above did not).
4. Commit as `Round 168: onboarding resumes where it stopped, and Skip stays Skip`; push `main`.
   Hostinger auto-deploys in ~3 min — check the hPanel deployment row, not the site.
5. Verify by chunk, not by HTML: the served JS must contain `nivadesk-onboarding-progress`
   and `setup=continue`; the old build had neither.
6. Rollback = `git revert` of Round 168 and push.

No functions, rules, secrets or env change is part of this deploy. The functions-side pieces
of this branch (`lifecycle/derive.js` Skip semantics, the checklist test) are **not** in it and
are not needed by it: the web reads the same fields it always read.

## 5. Native — separate store-release line, not gated on web

The Apple and Android commits on this branch (persisted wizard, checklist ownership, setup
reopen, skip-safe checklist) go out with the next App Store / Play release lines, on their own
build-and-verify pass (`xcodebuild` + `BUILD SUCCESSFUL`, per the standing rule). The web deploy
does not wait for them and they do not wait for it. One known footgun stays flagged, not fixed:
`markBusinessOnboardingCompletedForCurrentCompany(action: String = "skip")` defaults to skip.
