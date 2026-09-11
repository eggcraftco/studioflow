# Current User Recovery Cohort

Read-only against Firestore project `eggcraft-studio`, snapshot **2026-09-07 22:47 UTC**.
Nothing was written, deployed or committed. Derivations use the *shipped* modules in
`/Users/gocmen/Developer/studioflow-onboarding/functions/lifecycle/` so the numbers are the
product's own opinion of itself, not a private definition.

Scripts and data: `/private/tmp/claude-501/-Users-gocmen-Developer-studioflow-app/5b787108-6e8d-45bb-9cdf-ad907f483cb8/scratchpad/cohort/`
(`part.js` builds the partition; `verify1-5.js` are the independent re-checks; `e_rows.json` is the estate.)

---

## The one-paragraph answer

The estate is **63 workspaces**. They partition cleanly into the five cohorts plus one residual, with
no overlap and two named gaps. But three of the five boundaries the operator asked for are proxies,
and one of them — cohort B — **cannot be drawn at all**, because the onboarding wizard's only write
happens at the Finish button and its step counter lives in React `useState`. Worse for ranking than
any of that: **cohort E's activation is not real**. All 33 orders across the 11 dormant workspaces
have zero money, the default customer name, and no design name — the "activation milestone" they
crossed was a button that writes an empty document. And there is **no outbound channel in the
codebase that can email an existing account holder about their own account**. Every recovery action
below is therefore in-app, on next open, or nothing.

---

## Boundaries established first (as instructed)

| Boundary | Status | The field that actually exists |
|---|---|---|
| signed up | **REAL** (Auth), partial (Firestore) | Firebase Auth `metadata.creationTime` — present on all 58 accounts. `companies/{cid}.createdAt` is on 54/63; `signupCompletedAt` on only 9/63. 11 workspaces have **no Auth record at all** (owner deleted) and therefore no signup date and no channel. |
| onboarding **started** | **DOES NOT EXIST** | `onboarding_started` is declared in `functions/lifecycle/events.js:31` and consumed in `activation.js` and `checklist.js`, but **no client ever writes it**. `derive.js:69-74` synthesises it *from the completion stamp* with the comment "you cannot finish something you did not begin" — so by construction it can never distinguish started from completed. |
| onboarding **completed** | **REAL, server-side** | `companySettings/{cid}.businessOnboardingCompletedAt` + `.businessOnboardingCompletedAction`. Written at `studioflow-web/lib/studioflow/onboardingWizard.ts:482`, `workspaceOnboarding.ts:469/495`, `EGGcraft/ContentView.swift:10695`, `OnboardingWizard.kt:330`. **The earlier project note was wrong about this half** — completion *is* knowable server-side. |
| activation milestone | **NO STORED FIELD — derived only** | Nothing writes activation anywhere. `activationProgress()` (`functions/lifecycle/activation.js:158`) recomputes it from documents on every read: an order, a customer, a matched bank line, consumed inventory, an accounting connection. |
| last activity | **TWO PROXIES, both weak** | Session clock = Auth `metadata.lastRefreshTime`. Content clock = newest derived meaningful event. There is no presence signal usable for cohorting — `appPresence` (`functions/index.js:29319`) carries **no uid and no companyId** and is deleted after 15 minutes idle. |
| dormant | **A CHOICE — I used the product's own** | `dormantDays: 30` and `activatedLowFrequencyDays: 14`, `functions/lifecycle/activation.js:79-84`. I did not invent a threshold; picking my own would have made cohort E an artefact of my choice. |

### The two things the operator should read twice

**1. Cohort B is not measurable, anywhere — not just server-side.**
The web wizard performs *exactly one* `setDoc`, at Finish, and it carries the completion stamp with
it (`onboardingWizard.ts:458-486`). Steps 1-5 hold answers in `useState` (`components/OnboardingWizard.tsx:147-148`).
Close the tab on step 4 and **nothing is written to Firestore, to localStorage, or to any other
store** — the user restarts at step 1 next visit. Android is the same single write. "Started and
abandoned" and "never opened the app again" produce byte-identical state.

macOS/iOS is the one genuine exception: Swift splits the write in two (`ContentView.swift:10485-10520`
writes answers, `:10678-10699` writes the stamp on a later confirmation screen), so "answers present,
stamp absent" would be real evidence of abandonment. **I queried it across all 63 workspaces. It
matches zero.**

*What it would take to know the truth, without new collection:* persist the step counter the wizard
already holds in hand. That is a new write, not new data — but it is still out of scope here.

**2. The shipped funnel over-reports onboarding completion by ~2.5x.**
`derive.js:69` reads only `businessOnboardingCompletedAt` and ignores `businessOnboardingCompletedAction`.
Of 40 stamped live workspaces, **22 pressed Skip** and were stamped COMPLETED. `getActivationFunnel`
currently reports those 22 as finished onboarding. My cohorts split on the *action*, which is why my
C (11) is smaller than the number the admin panel would show (13).

---

## The estate, and how I cut it

**Rule (order matters, and the order is what makes the partition disjoint): activation is checked
first, then the onboarding stamp.** Without this ordering one workspace (`395OJD`) would be in both
A and D — it has no onboarding stamp *and* three real orders.

| | Cohort | Rule |
|---|---|---|
| A | signed up, onboarding never started | not activated **and** no onboarding stamp |
| B\* | onboarding started, not completed | not activated **and** `action == "skip"` — **PROXY**, see below |
| C | onboarding completed, no activation | not activated **and** `action ∈ {wizard, standard, smart}` |
| D | activated, then stopped | activated **and** `lcState == "at_risk"` (quiet 14-30d) |
| E | dormant | activated **and** `lcState == "dormant"` (quiet ≥30d) |
| — | LIVE (residual) | activated **and** quiet <14d — not a recovery cohort |

I also classified every workspace as REAL / JUNK / INTERNAL / FIXTURE, because size is not
opportunity. JUNK = owner email domain is `deneme.com`, `denem.com`, `test.com`, `dsdf.ff`,
`dsafsd.com`, `dffd.dd`, `gmali.com`. INTERNAL = `eggcraft.co.uk`, `nivadesk.app`. FIXTURE =
`test_studio_123`, a company document with **no fields at all** but 222 orders and 83 customers,
backdated to 2024, living in production.

---

# Cohort A — signed up, onboarding never started

**21 workspaces (20 real, 1 junk). The largest cohort, and the only one where size and opportunity
point the same way.**

**Last activity** (session clock, PROXY):

| bucket | all 21 | real 20 |
|---|---|---|
| <24h | 1 | 1 |
| 1-7d | 3 | 3 |
| 7-30d | 3 | 2 |
| 30-90d | 14 | 14 |
| >90d | 0 | 0 |

**This table is close to worthless and that is the finding.** For **19 of 21**,
`creationTime == lastSignInTime == lastRefreshTime` **to the second**. The token was minted once and
never refreshed. The distribution above is the signup-date histogram wearing a different label.
Only three rows move at all: +186 s, +9.2 h, +25.0 h. Nobody in this cohort drifted away — they left
in the first sitting. The `>90d` bucket is empty because the oldest signup here is 2026-07-11: the
whole cohort was acquired in the last two months.

**Stuck at:** the first write. All 21 have **no `companySettings` document at all** — not an empty
stamp, the document does not exist — and none carries any wizard answer field. Since the wizard's
only write is at Finish, the most specific true statement is *stuck before step 5 of 5*. Naming a
step is not hard here; it is impossible by design.

The gate that meets them next time (`studioflow-web/components/AppShell.tsx:1689-1698`) fires on
`!businessOnboardingCompleted && financeOrders.length === 0 && owner`. All 21 satisfy it, so **they
will be shown the wizard at step 1 on next sign-in** with no code change.

**Existing channel:** in-app only, and it already works.
- The onboarding gate above, on next open.
- `GettingStartedCard` on `/dashboard` (`studioflow-web/app/dashboard/page.tsx:118-160`), fed live by
  the `getSetupChecklist` callable (`functions/index.js:29511`). It is already personalised and
  already ticks steps by what the workspace has *done*, not clicked.
- **Push: 0 of 21 have a device token.** Unavailable.
- **Email: none.** See the channel inventory below.

**Lowest-risk action: nothing outbound. Do not build a campaign — fix the surface that already
greets them.** 19 of 21 never got a second session, so a message is not the missing piece; the
first sixty seconds are. The single reversible, no-new-data change with the best odds is to make the
wizard survive a closed tab (persist the step it already holds). That is not a retention campaign, it
is a bug fix, and it converts an unmeasurable cohort into a measurable one as a side effect.

---

# Cohort B — onboarding started, not completed

**Measurable size: 0. Reported as B\* = 7 by proxy. True size: somewhere in 0-21, and no existing
field can narrow it.**

I am not reporting "nobody abandoned onboarding". I am reporting that **abandonment leaves no
trace**, and that the one state which *would* prove it (macOS answers-without-stamp) matches nobody.

**B\* (PROXY) = the 7 not-activated workspaces stamped `action: "skip"`.** A Skip stamp is the only
server-side evidence the onboarding surface was ever *rendered*. It is proof of a refusal, not of an
abandonment — a materially different thing, and the single weakest boundary in this report.

**Last activity** (7 workspaces):

| bucket | session clock | content clock |
|---|---|---|
| 7-30d | 1 | 2 |
| 30-90d | 1 | 4 |
| >90d | 0 | 1 |
| no signal | 5 | 0 |

**Stuck at:** nothing — they declined. All 7 have zero orders, zero customers; one connected a bank
and stopped.

**Existing channel: five of the seven have no owner Auth record at all.** Their accounts are deleted.
They cannot be emailed, pushed to, or shown anything, ever. Two remain reachable (14d and 75d quiet,
both email-verified). Two hold device tokens — and both of those are on deleted-owner workspaces, so
the tokens are unusable.

**Lowest-risk action: do nothing at cohort level.** A cohort of 7 whose defining act was pressing
"Skip", of whom 5 no longer have an account, does not deserve a campaign. Chasing people who
explicitly declined is exactly the coercion the brief rules out.

---

# Cohort C — onboarding completed, no activation milestone

**11 workspaces — but 5 of the 11 are test domains (`deneme.com`, `denem.com`, `dsafsd.com`,
`gmali.com`). Real C = 6.**

**Last activity** (session clock; content clock agrees within a day):

| bucket | all 11 | real 6 |
|---|---|---|
| 1-7d | 4 | 1 |
| 7-30d | 3 | 1 |
| 30-90d | 4 | 4 |
| >90d | 0 | 0 |

**Stuck at:** for 8 of 11 the first undone checklist step is `external_order_imported` — the product
is asking them to import from a store they do not have. Two sub-populations:

- **Five legacy-template workspaces stamped 8, 19, 22, 22 and 22 seconds after the account was
  created.** Four of the five carry `businessType = "Custom Art Studio"`, the *first tile* in
  `WORKSPACE_ONBOARDING_BUSINESS_TYPES` (`workspaceOnboarding.ts:6`), and all five left the
  description prompt at its auto-seeded length. They tapped the first tile and the primary button in
  under half a minute. `action` distinguishes them from `skip` only by which button they pressed.
- **Six wizard-era workspaces**, three of whom last pressed a button that did nothing: their
  `onboardingStartChoice` values (`spreadsheet`, `sample`, `first_order`) are the three options the
  repo's own comment at `onboardingWizard.ts:270-281` says were removed because none of them did
  anything.

**Existing channel:** in-app. All 11 have a live Auth account; 6 are email-verified. Five hold a
device token, stale by 5-74 days. The `GettingStartedCard` is already rendering the *right* list for
them — this is the one cohort the personalised checklist was built for.

**Lowest-risk action: change what the checklist asks for, not who it asks.** Eight of eleven are
being told to connect a store as step one. Re-ordering an existing, already-server-driven checklist
so a workspace on the `general` path is offered "create your first order" before
"import from your store" is reversible, invisible if wrong, sends nothing, and collects nothing.
No message to this cohort.

---

# Cohort D — activated, then stopped (quiet 14-30d)

**6 workspaces — 2 internal (`nivadesk.app`), 2 junk (`test.com`, `dffd.dd`), and 2 real.**

**Last activity:** all six sit in 7-30d on both clocks, by construction. The two clocks agree within
~2 days on all six — nobody came back and did nothing.

**Stuck at:** not onboarding — all six are past it. They are stuck at **the first job that finishes**.
Across the 4 orders in the two real workspaces: 4 of 4 carry money, 4 of 4 carry a design name,
**0 dispatched, 0 delivered**. Not one order in the cohort ever left the first column. Five of six did
their entire meaningful history inside a single day.

**This is the only cohort whose activation is real.** Both real members did genuine typed work.

**One of the two — `395OJD` — never used the app UI at all.** I verified it directly: all three of its
orders carry `createdFrom: "chatgpt"`, written only by the MCP order path (`functions/index.js:24098`),
`createdByUid` = the owner, created and edited across 8 minutes on 2026-08-22 — **46 hours after the
session clock says the account went dark.** A second workspace (`n06Uzp`, in the LIVE residual) is the
same: 5 of 5 orders via ChatGPT. Two of the estate's most genuinely engaged non-internal workspaces
reached the product **only through ChatGPT**, and neither has ever been offered onboarding.
`395OJD` now has 3 orders, so `financeOrders.length === 0` in the AppShell gate has **locked it out of
onboarding permanently**.

**Existing channel:** 6/6 have a live Auth account but only 2 are email-verified; **0 of 6 have any
device token**. In-app on next open is the only channel. There is no sender in any case — see below.

**Lowest-risk action: in-app, on next open, on the order they already made.** A single prompt on the
existing order — *"mark this In Progress"* / *"mark it dispatched"* — not a new-order prompt. It rides
a surface that exists, needs no deliverability, and `messageDecision` in
`functions/lifecycle/messaging.js` already knows to cancel it once `order_status_changed` lands.
For 4 of the 6 (internal + junk) the honest action is nothing.

---

# Cohort E — dormant (quiet ≥30d)

**12 workspaces — 1 is the production QA fixture. Real E = 11. Also: 11 of the 24 workspaces the
engine calls "activated" are dormant; half of everyone the product thinks it has served is gone.**

**Last activity:**

| bucket | content clock (n=11) | session clock (n=11) |
|---|---|---|
| 7-30d | 0 | 1 |
| 30-90d | 8 | 6 |
| >90d | 3 | 0 |
| no signal | 0 | 4 |

Quiet days on the content clock: 36, 43, 52, 68, 68, 68, 70, 74, 95, 99, 116. **Nothing sits near the
30-day line from below** — this cohort is not "recently slipped", it is gone. The three at 68 all
signed up inside one 24-hour window.

**Stuck at — and this is the finding that should change the ranking:**

I checked every order in the cohort directly. **33 orders across 11 workspaces:**

- orders carrying any money in `watchPurchasePrice` / `paidAmount` / `remainingAmount`: **0 of 33**
- orders whose `customerName` is still the literal default `"New Project"`: **33 of 33**
- orders with a design name: **0** · tracking number: **0** · dispatched: **0** · delivered: **0**
- customers, inventory items, bank connections, store connections, accounting connections,
  assistant use, file uploads, estimates across the whole cohort: **0**

Compare cohort D's real members: 4 of 4 orders with money, 4 of 4 with a design name.

**So the activation PROXY fails completely here.** These 11 did not activate and then lapse. They
pressed a button that writes a fully-defaulted document, and the derivation counted it. Nine of the
eleven had pressed Skip on onboarding first. Eight of eleven finished their entire relationship with
the product **inside ten minutes**; the median is three minutes. A typical shape: signed up 00:38,
onboarding stamped 00:39, blank order 00:40, never seen again.

**Existing channel:** 5 of 11 owner Auth accounts are **deleted** — unreachable by any means. Six
remain, five email-verified. Three hold device tokens, stale by 36-95 days (FCM will almost certainly
return `NotRegistered`). One deleted-owner workspace still has a live team member.

**Lowest-risk action: do nothing.** There is no experience to remind them of. A message saying
"come back to your order" would be pointing at an empty default document, which is precisely the
self-discrediting message `messaging.js:5-11` was written to prevent. If the operator wants to spend
effort here, spend it on the fixture and the deleted-owner rows, which are data hygiene, not retention.

---

## The partition check

**Does it add up? Yes — over the `companies` collection, exactly, with two named gaps outside it.**

```
  A   signed up, onboarding never started      21
  B*  skip-stamped, not activated (PROXY)        7
  C   onboarding completed, not activated       11
  D   activated, quiet 14-30d                    6
  E   activated, quiet >=30d                    12
  --- residual, not a recovery cohort ---
  LIVE activated, quiet <14d                     6
                                             -----
                                                63   == companies documents (63)  OK
```

**No overlap**, and it is not accidental — it is enforced by checking activation *before* the
onboarding stamp. `395OJD` satisfies both "no onboarding stamp" (cohort A's rule) and "activated then
stopped" (D's rule); the ordering puts it in D. Reverse the order and A becomes 22, D becomes 5, and
the two cohorts intersect. **Any recount that does not state its ordering rule will disagree with
this table by exactly one workspace.**

Cross-check on a second axis (same 63, cut by realness):

```
  REAL       48        A 20 | B* 7 | C  6 | D 2 | E 11 | LIVE 2
  JUNK       10        A  1 | B* 0 | C  5 | D 2 | E  0 | LIVE 2
  INTERNAL    4        A  0 | B* 0 | C  0 | D 2 | E  0 | LIVE 2
  FIXTURE     1        A  0 | B* 0 | C  0 | D 0 | E  1 | LIVE 0
             ---
              63   OK
```

### Gap 1 — six people the census cannot see

**6 Firebase Auth accounts own no `companies/{uid}` document at all.** All email-verified, created
2026-07-26 to 2026-08-30. `ensurePersonalWorkspace` never landed its write. Lifespans: four at 0
seconds, one at 9 minutes, one at **2.5 days** — somebody held a session for two and a half days and
still has no workspace.

They are outside all five cohorts because the cohorts are keyed on workspaces. They are not cohort A
(A has workspaces); they are a *sixth* state the brief did not anticipate: **signed up, no workspace
created**. 58 Auth accounts − 52 owning a live workspace = 6. They are reachable by email in
principle and by nothing in practice, since no email machinery exists.

### Gap 2 — 39 deleted workspaces still leaving residue

**39 `companySettings` documents have no matching `companies` document and no live Auth uid.**
All last touched between **2026-05-13 and 2026-07-01** — nothing after 1 July, so whatever produced
them stopped. **23 of them still have orders sitting in `siparisler`** (40 orders total).

These are correctly *outside* the estate — the brief asked for users registered today. But the
operator should know two things: the deletion path leaves settings and order data behind, and the
residue looks exactly like cohort E (40 orders, 5 with money, 26 with the default customer name, 0
dispatched). The churn that already happened had the same shape as the churn about to happen.

`companies` 63 + `companySettings` 80 reconciles as: 41 settings docs match a live company
(63 − 41 = 22 companies have no settings doc: the 21 in cohort A plus `395OJD`), 39 are orphans.

---

## Every proxy, named

| # | Boundary | Real signal? | How wrong it could be |
|---|---|---|---|
| 1 | **"onboarding started"** | **No signal exists at all.** | Total. B\* counts *refusals* (Skip), not abandonments. The true count of people who opened the wizard and gave up is anywhere from 0 to 21 and **is not recoverable from any store** — not Firestore, not localStorage, not the client. Every abandoned wizard is currently sitting inside cohort A. |
| 2 | **"activation milestone"** | **Nothing is stored.** Recomputed from documents. | **Demonstrated wrong, badly, in cohort E:** all 11 "activated" workspaces have 33 orders with zero money, zero design names and the default customer name. The proxy counts a button press as first value delivered. Treat E's activation as false and D's as true — the difference is visible in the order contents, not in the flag. |
| 3 | **"last activity" (session clock)** | Auth `lastRefreshTime` — real field, wrong meaning. | It measures "a signed-in client held a live token", not a person. **Demonstrated false-negative rate of 1-in-21 in cohort A alone**: `395OJD` did 46 hours of real work after its clock froze, via ChatGPT. It is also blind to every MCP-only user by construction. In cohort A it is not merely uninformative — for 19 of 21 it *is* the signup timestamp. |
| 4 | **"last activity" (content clock)** | Newest document timestamp. | Moves for server sweeps as well as people — three unrelated workspaces share the identical stamp `2026-09-04T09:51`. Some "newest" values are future-dated (`billingTrialEndsAt`). Where both clocks are clean they agree within a day. |
| 5 | **"dormant" at 30d** | A choice, but the product's own (`activation.js:83`). | Defensible, not neutral. The engine's `dormant` state is only reachable *after* activation, so a never-activated workspace silent for 200 days is `new`, not dormant. If the operator means "everyone long gone", E is not 12 — it is E plus most of A, and the cohorts stop being disjoint. |
| 6 | **"signed up"** | Auth `creationTime` is real and complete. | Only for the 52 workspaces whose owner still exists. 11 workspaces have no Auth record and therefore no signup date at all. |
| 7 | **REAL / JUNK classification** | **Mine, not the product's.** | Judgement by email domain. `deneme` is Turkish for "trial"; `nivadesk.app` is the product's own domain. I could be wrong about `gmali.com` (a plausible `gmail` typo) and about `konstrulaer.com` / `electronicswarehouse.solutions`, which I counted as real. Worst case this moves 1-2 workspaces between REAL and JUNK. It does not move anyone between cohorts. |

**Solid enough to decide on:** the cohort *sizes* (they partition exactly), the onboarding-stamp
split by action, the order-content evidence in D and E, and the channel inventory.
**Not solid:** anything that depends on B\* meaning "abandoned", on E meaning "activated", or on the
session clock meaning "a person was here".

---

## Existing channels — the full inventory

This is a finding in its own right: **there is no code path in this product that can send an email to
an existing account holder about their own account.**

Every mail path in `functions/index.js` is transactional and inbound-triggered:

| Function | Line | Who it mails |
|---|---|---|
| `emailNivadeskSupportForTicket` | 3530 | the studio, not the user |
| `emailNivadeskSupportForWebsiteChat` | 3726 | the studio, not the user |
| `emailWebsiteChatVisitorReply` | 3814 | a website-chat visitor who wrote in first |
| `emailWorkspaceInvitation` | 17297 | a *new* team member, and only when an owner acts |
| `sendPortalStatusEmail` | 27728 | the workspace's **end customer**, about their order |

Plus Firebase Auth's own verify-email and password-reset, which are not ours to repurpose.

`functions/lifecycle/messaging.js` — the entire send/suppress decision engine, with
`CAMPAIGN_GOALS.create_first_order` already defined and caps already configured — is `require`d by
**exactly one file: its own test** (`functions/test/qa/lifecycle-messaging.test.js:12`). Only two
lifecycle callables are wired at all (`getSetupChecklist` at `index.js:29511`, `getActivationFunnel`
at `:29610`), and both are read-only measurement. **Nothing can send today without new code.**

What *does* exist and is live:

| Channel | Where it lives | Reach |
|---|---|---|
| Onboarding gate (wizard on next open) | `studioflow-web/components/AppShell.tsx:1689-1698` | A: all 21. Not D (order-count gate excludes them). |
| `GettingStartedCard` + `getSetupChecklist` | `studioflow-web/app/dashboard/page.tsx:118-160` → `functions/index.js:29511` | A, B\*, C, D, E — anyone who opens the dashboard |
| In-app notification bell | `companies/{cid}/notifications`, `functions/index.js:368` | exists; **no broadcast or announcement writer exists** — there is no way to put a message in it that isn't tied to an order/billing/integration event |
| Push (FCM) | `sendPushNotificationToCompany`, `functions/index.js:472` | **15 of 63 workspaces have any token.** A: 0. D: 0. C: 5 (stale 5-74d). E: 3 (stale 36-95d). Outside the studio's own workspace every one is a single stale token; FCM will mostly return `NotRegistered`. |

**Per cohort, the honest answer:**
- **A** — in-app only (gate + checklist). No email, no push. Reachable *if they return*.
- **B\*** — 5 of 7 have no account. **No reachable channel today.** That is a finding, not a gap.
- **C** — in-app only. Push nominally available for 5, practically dead.
- **D** — in-app only. Zero push tokens, 2 of 6 verified emails, and no sender anyway.
- **E** — 5 of 11 unreachable by anything. The other 6: in-app only, if they ever return.

---

## Lowest-risk recovery action per cohort

| Cohort | Action | Why it is the lowest risk |
|---|---|---|
| **A (21)** | **Nothing outbound.** Make the wizard survive a closed tab, and let the existing gate do its job. | No message, no data collection, no one annoyed. Reversible. It also converts B from unmeasurable to measurable as a side effect. |
| **B\* (7)** | **Nothing.** | Their defining act was declining. Five have no account. Chasing them is the coercion the brief rules out. |
| **C (11 → real 6)** | **Re-order the checklist the server already builds** so `general`-path workspaces are asked for a first order before a store import. | Invisible if wrong, sends nothing, collects nothing, one server-side list order. |
| **D (6 → real 2)** | **One in-app prompt on the order they already created**, on next open — "mark this In Progress", not "create another". | Rides an existing surface; no deliverability needed; `messageDecision` already cancels it once the status changes. For the 4 internal/junk members: nothing. |
| **E (12 → real 11)** | **Nothing.** | There is no experience to recall. Every one of their 33 orders is an empty default document. Any "come back to your work" message would point at nothing and discredit the next one. |
| *Gap 1 (6 accounts, no workspace)* | Investigate why `ensurePersonalWorkspace` fails — a bug, not a cohort. | |
| *Gap 2 (39 deleted workspaces)* | Data hygiene: the deletion path leaves settings and 40 orders behind. | |

---

## Ranking note for the operator

**Largest real opportunity: cohort A — 20 real workspaces.**
It is the biggest cohort, and unusually for a biggest cohort it is also the best one. Nineteen of
twenty-one are email-verified with live accounts; seven were acquired in the last 30 days and one in
the last 24 hours; and their failure has a single mechanical cause that is visible in the code rather
than inferred from behaviour — the wizard writes nothing until Finish, and 19 of 21 never got a second
session. Nothing needs to be sent to them, which is what makes it low-risk: the fix is to the surface
they will hit anyway.

**Largest that is not worth pursuing: cohort E — 12, of which effectively zero are recoverable.**
It is the second-largest cohort and it will look like the obvious retention target on any dashboard,
because the funnel says these people *activated and then left*. They did not. One is a production
test fixture with 222 backdated orders. Five have deleted owner accounts and cannot be contacted by
any means. And all 33 orders belonging to the remaining eleven have zero money, no design name and
the default customer name — the "activation" is an artifact of a button that writes an empty
document. Spending a recovery campaign here would be spending it on people who never received
anything to come back to.

**Two smaller notes that matter more than their size:**

- **Cohort C is half test accounts.** Five of eleven are `deneme.com` / `denem.com` / `dsafsd.com` /
  `gmali.com`. Any per-cohort conversion rate computed on C without that exclusion will be wrong by
  roughly a factor of two — and three of those five carry `trialing` billing status, so they will
  also distort trial metrics.
- **Two real workspaces reached the product only through ChatGPT** (`395OJD`, 3 orders; `n06Uzp`,
  5 orders — verified: 8 of 8 orders carry `createdFrom: "chatgpt"`). They are among the most
  genuinely engaged non-internal users in the estate, neither has ever been offered onboarding, and
  the order-count condition in the AppShell gate means `395OJD` never can be. That is not a cohort —
  it is two people — but it is the only place in this data where somebody got real value from a
  surface the onboarding funnel cannot see.
