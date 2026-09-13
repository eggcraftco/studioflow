# Continuation table — 13 September 2026

What is live, what is a ready candidate, what is waiting on somebody, and what
has not been started. Written so that nothing from the main plan is lost between
sessions, and so a completed check is not run again for the sake of it.

The older record (`docs/nivadesk-current-handoff.md`) stays authoritative for
everything before 13 September; this table carries it forward and does not
repeat it.

## Released live today

| What | Where | Evidence |
| --- | --- | --- |
| Personal note image uploads (Storage rules only) | ruleset `5bd58dce-a39e-4da4-a6bb-281623338b93`, created 15:00:19Z | `docs/release-notes-image-rules-2026-09-13.md` — live bytes diffed against the candidate, empty |

Nothing else was deployed. No function, no hosting round, no Firestore rules, no
index.

## Candidates ready (CI green, nothing deployed)

| Package | Branch @ commit | What it is | Gates passed on that commit |
| --- | --- | --- | --- |
| R1 — existing UX | `faz1-combined-verify @ f2a0dc88` | A/B/C/D + hook-order gate + CI fixes + refund wording | three CI jobs |
| R2 — integration health truth | same branch | Shopify auth-health back-off; two functions changed, no new exports | three CI jobs, 9 auth-health checks |
| Stripe PR-P0 | `stripe-connect-faz1 @ 544c64ed` | audit + the pure contract modules | 31 checks |
| Stripe PR-P1 | `… @ 72df887a`, `964cc9bb` | Connect connection, its own webhook and secret, Integrations card | 17 + 24 checks |
| Rail separation | `… @ 85393d1a` | the subscription handler refuses connected-account events | 10 checks, drift suite 56 |
| Payment ledger | `… @ 6bb7b5ac` | server-only provider evidence; finance v4 counts once | 13 + 13 checks |
| Stripe PR-P2 | `… @ 6ab17b1c` | payment requests, Checkout, Banking → Payment Links | 14 + 7 checks; **all three CI jobs green** |
| Note image rules | `notes-image-rules-fix @ 7235865b` | **released**; the branch also carries the release record | 8 emulator checks |
| Storage PR-S0 | `storage-own-cloud-faz1 @ faf21d5f` | the file-system audit, measured in production | read-only |
| Storage PR-S1 | `… @ 9dafdccf` | common file service, legacy readers, managed adapter | 13 checks |
| Orphan dry run | `… @ 9628589e` | 31 candidates, nothing deleted | read-only |
| Sales Faz 1 | `sales-faz1-release-candidate @ 05040bf3` | from 12 Sep; unchanged today | as recorded then |
| Dependency highs | `dependency-highs-2026-09-11 @ bbb16ec4` | three highs closed without a major bump | as recorded then |
| Retention e-mail | `retention-email-candidate @ ca530686` | hardened, flags off | as recorded then |

## Waiting on a person or a portal

| Item | Waiting for | Note |
| --- | --- | --- |
| `/f/` MEDIUM security fix | its own release decision | held out on 9 Sep; still not live |
| Dependency merge + its web round | a merge decision | branch green since 11 Sep |
| Retention pilot acceptance | restoring the synthetic order | the authority for that one step was never given |
| eBay manual stage | eBay | sandbox order creation broken, no ETA from them |
| Etsy API application | Etsy | resubmitted narrowed after the 30 Aug refusal |
| Twilio sender `NivaDesk` | Twilio | In Review since 25 Aug |
| OpenAI app 1.2.0 | OpenAI | In Review since 10 Sep |
| Shopify Billing 1.2.1 | Shopify | Submitted 28 Aug |
| Google case | Google | update due 15 Sep 17:00Z |
| Stripe Connect live connection | a decision, plus `STRIPE_CONNECT_ENABLED` and its secrets | by design: PR-P1 and PR-P2 are complete against a fake transport and make no live call |

## Not started

| Item | Where it sits |
| --- | --- |
| Stripe PR-P3 (webhook ↔ finance v4 wiring end to end), P4 (native surfaces), P5 (refund/dispute + admin), P6 (pilot) | after PR-P2 |
| Storage PR-S2 (Google Drive), S3 (OneDrive/SharePoint), S4 (Dropbox/Box), S5 (native + iCloud), S6 (migration/switch), S7 (sharing, AI, observability), S8 (pilot) | after PR-S1 |
| Stage 3 §6.1 — native Sales on the iOS simulator and Mac | Android already done |
| Stage 3 §6.2 — A/B native parity: chatbot state, activity tap, Getting Started | never done natively |
| Daily cards on iOS / Android / Mac | the shared vectors and the three mirrors exist; the screens do not |
| Stage 7 — Pandle capability truth | not begun |
| Stage 8 — competitor benchmark from current official docs | not begun |
| Stage 9 — `/f/` security candidate and the dependency candidates as a package | the fixes exist; the package does not |

## Findings from today that are somebody's decision, not a task

1. **`UgmZnoZHHwlMbWTlN6Dp`** is an unreachable order stub: three fields, no
   `companyId`, so every `siparisler` rule refuses it and no client can read,
   edit or delete it. It holds a 7.4 MB orphaned file. Data repair, separate
   from the orphan question.
2. **Storage access logs are not enabled** on the bucket. They are the missing
   input for both the orphan grace period and stage 4 of the token transition,
   and the log has to accumulate before it can answer anything — so enabling it
   is worth doing long before it is needed.
3. **A workspace on `$` or `¥` cannot take a card payment** until it states an
   ISO currency code. `¥` is JPY or CNY and the two differ by a factor of a
   hundred; the server refuses rather than guesses. That is an onboarding step
   somebody has to design.
4. **Three web gates were not in CI** — `test:finance`, `test:workspace`,
   `test:file-proxy` — written, passing, and protecting nothing. Now wired, with
   two new ones beside them.

## Checks deliberately not repeated

R1/R2's gates, the Sales Faz 1 gates, the dependency branch's audit and the
retention candidate's checks all passed on commits that have not changed since.
They were not re-run today, and their evidence stands where it was recorded.

---

# Update — later on 13 September 2026

## Live / candidate / awaiting acceptance, separated per package

The three are different things and the earlier table blurred two of them. Below,
**live** means running in production now; **candidate** means a commit with its
gates passing and nothing deployed; **awaiting acceptance** means the work is
finished and somebody has to look at it before it can be called done.

| Package | Live | Candidate | Awaiting acceptance |
| --- | --- | --- | --- |
| Note image Storage rule | **yes** — ruleset `5bd58dce`, 15:00:19Z | `notes-image-rules-fix @ 46246236` | the end-to-end user flow: nobody has attached an image in production yet |
| Stripe Connect (P0–P2) | no | `stripe-connect-faz1 @ 83a3d863` | the whole browser acceptance, and a live Stripe connection |
| Storage service (S0, S1, S1a) | no | `storage-own-cloud-faz1 @ 0bd2e805` | nothing — it is wired to one flow and emulator-verified |
| Tracking stub fix | no | `tracking-stub-orders-fix @ a530f325` | nothing; the four existing stubs are a separate decision |
| Combined verification | no, **and never will be** | `combined-verify-2026-09-13 @ 0f38f2be` | it is a check, not a package |
| R1 — existing UX | no | `faz1-combined-verify @ f2a0dc88` | its user flows, unchanged since 13 Sep morning |
| R2 — integration health truth | no | same branch | same |
| **Sales Faz 1** | **no — nothing Sales is live, on any platform** | `sales-faz1-release-candidate @ 05040bf3`, from 12 Sep | its native acceptance |
| Dependency highs | no | `dependency-highs-2026-09-11 @ bbb16ec4` | a merge decision |
| Retention e-mail | no | `retention-email-candidate @ ca530686` | the pilot's restore step |

**On the Sales row specifically.** `05040bf3` is a candidate from 12 September
and says nothing about what is live. Nothing Sales-related has been deployed:
no function, no web round, no store build. The live native apps are the store
builds that predate all of it — iOS/macOS 1.3 (build 17) and Android 0.1.8 —
and they contain no Sales screens at all. The last live web round is Round 176
per the 12 September hand-off, which was not re-verified today.

## Deferred — needs a browser, and Chrome is in use by other work

None of these has been run. They are listed as **not done**, not as passed:

| Flow | Where |
| --- | --- |
| Banking → Payment Links: empty list, loading, error and retry | web, `/bank?tab=payment-links` |
| Create a payment request from an order and see it appear in the list | web |
| Deposit, partial payment, remaining balance, expired and cancelled links | web, against the fake provider |
| Payment and refund states updating on screen | web |
| A member with no finance permission; another workspace; switching account or workspace | web |
| Phone: touch, scroll, keyboard, copying a link | web at mobile width |
| The note-image attach flow end to end in production | web and Android |

Everything those flows exercise is covered at the server and unit level —
14 request-flow checks, 10 race checks, 13 ledger checks, 7 panel checks
including every status-to-tab mapping — but none of that is a browser, and a
fake Checkout screen is not evidence about Stripe.

## New since the first table

| Item | Branch @ commit | Evidence |
| --- | --- | --- |
| Release blocker: the live storage rule is on one branch only | `notes-image-rules-fix @ 46246236` | 5 coverage checks, proven to fail on the deploy base |
| Payment races: concurrent links, post-provider write failure, hostile rewrite, refund accounting | `stripe-connect-faz1 @ 83a3d863` | 10 checks; found and fixed a skipped overpayment verdict |
| Storage PR-S1a: note images through the common service | `storage-own-cloud-faz1 @ 0bd2e805` | 12 emulator checks; found a content-addressing bug |
| Reference scan in the repo, with a regression test | same | 8 checks |
| Tracking stubs: a deleted order resurrected every hour | `tracking-stub-orders-fix @ a530f325` | 6 emulator checks |
| Combined verification of all four | `combined-verify-2026-09-13 @ 0f38f2be` | one conflict, resolved; every gate green |

## Decisions that are yours, not tasks

1. **Carry the 31-line storage rule to the deploy branch.** Until then any
   storage deploy reverts a live fix. It must travel alone.
2. **The four resurrected order stubs** — leave, recover, or delete. The fix
   that stops new ones is a candidate; deleting before it lands achieves
   nothing.
3. **The 31 orphaned files** — a finding, not a delete list.
4. **Storage access logs are still not enabled**, and they are the input for
   both the orphan grace period and the token transition's last stage.
5. **A workspace on `$` or `¥`** cannot take a card payment until it states an
   ISO currency code.

