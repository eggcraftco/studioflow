# Retention wiring — prepared with every flag OFF (10 September 2026, night)

Branch `retention-wiring` (worktree `~/Developer/studioflow-retention`, cut from `onboarding-retention`
`f295814f`). **Nothing here is deployed, no flag is set, no e-mail, in-app message or recovery message was
sent.** The 9 Sep status document (§10.2) found that `messaging.js` had no production call site, that no
writer existed for either channel, and that `user_replied` suppression could not be claimed without real
reply ingestion. This branch supplies each of those as code with tests, behind four flags, and records what
still needs a decision or a provider before any flag can be turned on.

## 1. The flags (all read at call time; unset = off)

| Flag | What `=1` allows | Off behaviour |
|---|---|---|
| `NIVADESK_RETENTION_SWEEP` | the hourly `retentionSweep` evaluates workspaces | the function logs "off" and returns |
| `NIVADESK_RETENTION_IN_APP` | the in-app writer creates `companies/{cid}/retentionMessages` rows | decision returned as `flag_off`, **no write** |
| `NIVADESK_RETENTION_EMAIL` | the founder/welcome e-mail is queued and sent through SMTP; the outbox retries | `flag_off`, no queue row, no send |
| `NIVADESK_RETENTION_INBOUND` | `retentionInboundReply` accepts replies | HTTP 503 `inbound_disabled` |

With everything off the sweep is a dry run in the log: which workspace was due which campaign and why
each was refused — the thing to read before turning anything on.

## 2. What was built

| Component | Where | Tests |
|---|---|---|
| Trigger rules — which campaign a workspace is due (founder note 10 min–14 d after signup; unfinished wizard after 12 h; commerce/finance path with no shop/bank after 12 h; shell first order after 24 h; no order after 24 h; nothing to a churned or month-quiet workspace); all timings configurable (§65) | `functions/lifecycle/retention.js` `triggerCandidates` | `retention-rules.test.js` (13 checks) |
| Templates — five in-app messages with the action the clients already map (`open_order` carries the shell's id) and the replyable founder note ("Gunes from NivaDesk", reply-to `contact@eggcraft.co.uk`, one link, escaped, unsubscribe line) | `renderTemplate` | same |
| Reply parsing — reply key from `retention+<key>@…` or `[NV-<key>]`, quoted thread stripped, auto-replies (`Auto-Submitted`, `Precedence`, out-of-office subjects in 4 languages) and bounces told apart, STOP/unsubscribe recognised | `parseInboundReply` | same |
| Outbox schedule — 5 min → 30 min → 2 h → 12 h, dead on the fifth attempt, configurable | `outboxSchedule` | same |
| Tokens — HMAC unsubscribe token per workspace (constant-time verify), random 16-char reply keys | `retentionToken` / `newReplyKey` | same |
| Suppressions added to the decision engine — `user_replied`, `workspace_cancelled`, `support_case_open`, `activated` (onboarding kind only), `optOut` alias; `complete_first_order` goal | `functions/lifecycle/messaging.js` | `lifecycle-messaging.test.js` (+5) |
| **In-app writer** — one `retentionLog/{campaign__channel}` row claimed in a transaction (duplicate control), one `retentionMessages` row; dismissal writes the 30-day cooldown | `functions/retention/writer.js` `deliver` / `dismissMessage` | `retention-writer.test.js` (10 checks) |
| **Founder/welcome e-mail writer** — outbox row with payload and reply key, one attempt, `List-Unsubscribe` header, retries on the schedule, dead-lettered | `deliver` / `attemptEmail` / `retryOutboxEntries` | same |
| **Reply ingestion + `user_replied`** — reply key → workspace, `retention/state.userRepliedAtMs`, inbound row kept as feedback, every later automated message refused `user_replied`; auto-replies noted but not suppressing; STOP opts out | `applyInboundReply` | same |
| Opt-out — settings callable and unsubscribe link, honoured by both channels | `setOptOut`, `retentionUnsubscribe`, `setRetentionOptOut` | same |
| The edge — hourly schedule, inbound POST with a shared-secret header, unsubscribe GET, two callables | `functions/index.js` (tail) | module loads; not deployed |

Per-workspace layout: `companies/{cid}/retention/state`, `retentionLog/{campaign__channel}`,
`retentionMessages/{id}`, `retentionInbound/{id}`; one lookup `retentionReplyKeys/{key}`.
**Firestore rules:** none of these paths is in `firestore.rules` yet — the deny-list rule
([[firestore-rules-deny-list]]) means a new sensitive subcollection is readable by every member unless it
is denied in the three places; `retentionInbound` holds the owner's own words and must be denied to
non-owners before the inbound flag goes on. Not done tonight: the rules file is outside this branch's scope
and a rules deploy is a production change.

## 3. Gaps that need a decision or a provider (recorded, not pretended)

1. **Inbound route.** Replies go to `contact@eggcraft.co.uk` (Hostinger mailbox). Nothing delivers them
   to `retentionInboundReply`. Options: (a) a mail provider with inbound parsing (SendGrid Inbound Parse /
   Mailgun Routes / Postmark) on a subdomain such as `reply.nivadesk.co.uk`, posting to the endpoint with
   the shared secret; (b) an IMAP poller against the Hostinger mailbox (a scheduled function with the
   mailbox password as a secret). Until one exists `user_replied` cannot become true from a real reply,
   so **`NIVADESK_RETENTION_EMAIL` must stay off** — the status document's rule.
2. **Reply domain.** `NIVADESK_RETENTION_REPLY_DOMAIN` (the domain the `retention+<key>@` reply-to
   uses) is unset; with it unset the reply-to is the plain founder address and the reply key rides only in
   the subject tag. Decide with (1).
3. **Sender identity.** The note is signed "Gunes from NivaDesk" but leaves from the support account
   (`contact@nivadesk.co.uk`, SPF/DKIM already set up for support mail). A dedicated founder address needs
   its own authentication; not decided.
4. **Secrets.** `NIVADESK_RETENTION_TOKEN_SECRET` (unsubscribe tokens) and
   `NIVADESK_RETENTION_INBOUND_SECRET` (inbound POST) do not exist. Without the first, no unsubscribe
   link is generated and the founder note would go out without one — the writer still sends the
   `List-Unsubscribe` header only when a URL exists, so the token secret is a precondition of the e-mail
   flag.
5. **The in-app surface.** No client reads `retentionMessages` yet. The web Home/Dashboard cards and the
   native Home screens need a reader that shows the open message, routes its `action`/`target` through the
   existing checklist mapping, and calls `dismissRetentionMessage`. Until then the in-app flag writes
   rows nobody sees — harmless, but pointless.
6. **Copy.** English only; the `language` seam exists. The checklist strings show the pattern (all eleven
   languages in `language.ts`, walked by a test).
7. **Firestore rules** (see §2) and the composite index the outbox query needs
   (`retentionLog` collection group: `status ASC, nextAttemptAtMs ASC`) — not declared yet.
8. **`workspaceCancelled`** is read from `company.billingStatus === "canceled"`; the support-case signal
   (`supportCaseOpen`) has no writer — the support ticket path should stamp
   `retention/state.supportCaseOpenAtMs` when a ticket opens and clear it when it closes.

## 4. How it would be turned on, in order

1. Deploy nothing until the rules and the two secrets exist.
2. `NIVADESK_RETENTION_SWEEP=1` alone, deploy `retentionSweep` by name → read the hourly dry-run summary
   for a few days (`evaluated`, `refused` by reason); compare with the v2.1 dry run
   (`activation-v2.1-rollout-2026-09-10.md` §1).
3. Client reader for in-app messages shipped → `NIVADESK_RETENTION_IN_APP=1`.
4. Inbound route live and tested with a real reply → `NIVADESK_RETENTION_INBOUND=1`, then
   `NIVADESK_RETENTION_EMAIL=1` — never the other way round.

## 5. Evidence

`node test/qa/retention-rules.test.js`, `retention-writer.test.js`, `lifecycle-messaging.test.js` — all
green on this branch; the full `npm test` run is recorded in the night report. The fake Firestore in the
writer test records every path written: the "every flag off" case asserts the list is empty.

## 6. On the live base — 11 September 2026 (branch `retention-live-base`, nothing deployed, every flag off)

**Base and branch.** `retention-wiring` (`55f6fa4d`) merged onto the live deploy tip `47010a45` (feedback v1 live for every
workspace, activation funnel on v2.1) as **`bfa4bfc9`** — one doc-only conflict, resolved by keeping the deploy copy. Then
**`d3d40de1`** (the fixes below and the web reader) and **`8158e7f8`** (scope semantics). CI green on `bfa4bfc9` and `d3d40de1`
(unit + rules/e2e), `8158e7f8` covered by the same suites locally (15 + 13 + 4 checks). A side effect worth its own line: the
merge brought the web onboarding source (Rounds 169/170: `setupChecklist.ts`, `onboardingProgress.ts`, the wizard, Home,
Dashboard, AppShell's Continue-setup band) into the repo — nine files now byte-identical to the publish repo, so the source
and the live site agree again.

**Data source, read from the code, not assumed.** `nvRetentionTriggerFor` (index.js) builds a snapshot and runs it through
`lifecycle/derive.deriveEvents` → `activation.lifecycleState` → `substantiveOrder.firstOrderProgress`: the same pure
engines the v2.1 funnel uses, the same `derive.js` (with the eBay `integration_connected` carry). **Defect found and fixed:**
the branch's snapshot held only settings/orders/customers, so `bank_connected` and `integration_connected` could never be
derived and "connect your bank" / "connect your first store" would have gone to a workspace that had connected (the §24
rule the engine exists for). The trigger now reads what the funnel reads (bank, accounting, inventory) **plus the five
store connections `derive.js` knows** (`shopifyStores`, `etsyConnections`, `wooConnections`, `squareConnections`,
`ebayConnections`, root collections keyed by `companyId`). Pinned by `retention-sweep-wiring.test.js`. Noted, not changed:
the funnel itself still omits the five store collections, so its `integration_connected` is never derived either — a
funnel follow-up.

### 6.1 How the code reaches a person today

| Campaign | Trigger | Waits | Channel | Stops / is cancelled by |
|---|---|---|---|---|
| `founder_intro` | signed up | ≥ 10 min after signup, never after 14 days | e-mail (kind `founder`) | sent once ever (founder cap); every generic stop below. **Not deliverable today**: `NIVADESK_RETENTION_EMAIL` off, no inbound route, no token secret |
| `finish_onboarding` | wizard neither completed nor skipped | 12 h after `onboarding_started` / signup | in-app | `onboarding_completed` (goal met); nothing else is proposed until the wizard is done |
| `connect_first_store` | commerce path, no `integration_connected`, no `external_order_imported` | 12 h after the wizard | in-app | `integration_connected` cancels; `activated` suppresses every onboarding-kind card |
| `connect_bank` | finance path, no `bank_connected` | 12 h after the wizard | in-app | `bank_connected`; `activated` |
| `complete_first_order` | non-commerce path, the first order is a shell | 24 h after the shell was created | in-app | `order_created` / `external_order_imported` (the v2.1 hand-off); `activated` |
| `create_first_order` | bespoke_studio / general path, no order | 24 h after the wizard | in-app | `order_created` / `external_order_imported`; `activated` |

Generic stops for every campaign (`messaging.js` + `retention.js`): opt-out / unsubscribe, `user_replied`,
`workspace_cancelled` (`billingStatus canceled`), `support_case_open` (stamped by the four ticket callables), 30 days
of silence (nudges stop; that is the recovery engine's question), `churned`, a dismissal inside 30 days, the caps (2
in-app per day, 1 e-mail per 48 h, 1 founder note ever, 1 feedback prompt per 7 days), one card per channel per sweep —
and, new on this branch: not on the pilot list / on the exclude list / owned by one of us (under `*`), and a feedback
prompt shown or answered in the last 24 h (the in-app card waits for the next sweep). Timings come from
`DEFAULT_RETENTION_TIMINGS` and may be overridden (spec §65: nothing hard-coded).

**Not implemented (spec, separate):** the +24–48 h "you haven't had the chance to get fully set up yet" personal e-mail
as a distinct no-activation message (today's founder note is a +10 min welcome with a question, sent to everyone),
the activation-blocker survey, dormancy and win-back (§65–66) and any reactivation message, the retention event
stream (§33), NPS / PMF (§122–123), native (Mac/iPhone/Android) readers of `retentionMessages`, e-mail copy in any
language but English, push.

### 6.2 Nothing lands on top of something else — verified

| Situation | Rule | Where |
|---|---|---|
| The person replied to the founder note | every automated message stops (`user_replied`) | `messaging.js`; set by `applyInboundReply` — **only real once an inbound route exists** |
| The person opted out (link or Settings) | stops everything but transactional | `messaging.js` `unsubscribed`; `retentionUnsubscribe`, `setRetentionOptOut` |
| The person re-activated (a real order, a connection) | onboarding-kind cards refused (`activated`); the specific goal cancels its card (`goal_already_met`) | `messaging.js` `CAMPAIGN_GOALS`; `activated` from `lifecycleState` |
| A support ticket is open / in progress / waiting for the user | every nudge refused (`support_case_open`) | stamp in `createSupportTicket`, `createWorkspaceTicket`, `updateSupportTicketStatus`, `updateWorkspaceTicketStatus`; `retention-support-case-wiring.test.js` |
| The workspace cancelled | refused (`workspace_cancelled`) | sweep reads `billingStatus` |
| The person dismissed a card | that campaign waits 30 days; acting on a card records no cooldown | `dismissMessage` outcome `dismissed` / `acted` (new) |
| A feedback prompt was shown or answered in the last 24 h | in-app nudges held that sweep (`feedback_prompt_recent`) — **new, server** | sweep reads `companies/{cid}/feedbackState/{ownerUid}`; `feedbackPromptRecent` |
| The feedback invitation is on screen right now | the nudge is not rendered until the invitation closes — **new, web** | `FeedbackCenter.onInviteVisible` → `RetentionNudge hold` |
| Two nudges due at once | one per channel per sweep, then the daily cap | `sweepWorkspace`; seen in the emulator: the third card of the day was refused `in_app_daily_cap` |

Still one-directional, a decision (§6.6): the feedback prompt does not yield to an open support case or to a retention
card; it follows its own 7-day and dismissal rules only.

### 6.3 Test and internal workspaces

The activation funnel counts every company; the sweep must not message every company. New in `retention.js`
`workspaceScope`, applied before any read: **`NIVADESK_RETENTION_WORKSPACES`** (unset or empty = nobody, `*` = every
workspace, otherwise exact ids — an id named here is deliberate and may be our own), **`NIVADESK_RETENTION_EXCLUDE_WORKSPACES`**
(exact ids, always wins), and under `*` an owner whose e-mail is on `nivadesk.co.uk` / `eggcraft.co.uk` or in
`SUPPORT_ADMIN_EMAILS` is skipped (`internal_owner`). Skips are counted in the sweep summary (`skipped: {not_in_pilot,
excluded_workspace, internal_owner}`), so a log line shows who was never considered. Recommended exclude list at general
launch: `KSQidetb…`, `GuglEFKS…` (test), `FvnnEcQA…` ("test"), `iZFBJqrT…` (EGGcraft).

### 6.4 The in-app reader — built and verified in the emulator

`studioflow-web/components/RetentionNudge.tsx` + `lib/studioflow/retention.ts`, mounted in `AppShell` in the band the
Continue-setup banner uses: a live listener on `companies/{cid}/retentionMessages` where `status == "open"` (the branch's
rules allow members to read it; nothing is written from the client), newest first, one card. Copy is keyed by campaign
through the translation tables (six new keys in eleven languages; the stored English text is the fallback for an unknown
campaign), the primary button routes through the checklist's own map (`setupStepHref`; `setup` → the wizard), "Not now"
and × close through the `dismissRetentionMessage` callable (`outcome` "dismissed" → cooldown; the primary button closes
with "acted" → no cooldown). The card is not rendered while the feedback invitation is on screen.

Emulator run (Firestore + Auth + Functions with the branch's rules, dev server on the branch, in-app browser, one seeded
owner whose wizard finished three days ago and who had one shell order; every card written through the real writer
module with only the in-app flag on):

| Time (Z) | Step | Observed |
|---|---|---|
| 01:35 | `sweepWorkspace` | `complete_first_order` in-app card written (`retentionMessages` + `retentionLog sent`) |
| 01:36 | load `/orders` | the card at the top: "Complete your first project — You started one — add the customer…" · **Open the project** · **Not now** · × |
| 01:37:36 | Not now | card gone at once; server: `status dismissed`, `closedAtMs`/`dismissedAtMs`, `retention/state.dismissals` = [complete_first_order]; the log row stays `sent` |
| 01:38 | second card (`create_first_order`) | appeared **live, no reload** (the listener); CTA "Create a project" → closed and stayed on `/orders`; server: `status acted`, `actedAtMs`, dismissals unchanged (1) |
| 01:39 | third card the same day | **refused by the writer: `in_app_daily_cap`** — the cap works end to end |
| 01:39 | third card with a new-day context (`connect_bank`) | written |
| 01:40:13 | a substantive order created, then a fresh session | the **feedback invitation** rendered ("How is it going so far?") and the nudge was **absent** — held |
| 01:40:37 | invitation "Not now" | invitation gone, the nudge appeared: "Connect your bank" · **Connect bank** |

Not verified there: the scheduled `retentionSweep` end to end (the emulator's flags are off, as production's are; the
function's body is pinned by `retention-sweep-wiring.test.js`), the e-mail leg, the inbound leg.

### 6.5 E-mail — one proposal, no new provider

Keep what exists. Sending already works through nodemailer on `smtp.hostinger.com:465` with `NIVADESK_SMTP_USER`
(`contact@nivadesk.co.uk`, SPF/DKIM in place for support mail) and the `NIVADESK_SMTP_PASSWORD` secret; the founder
note leaves as "Gunes from NivaDesk <contact@nivadesk.co.uk>" with the same mailbox as reply-to (`NIVADESK_RETENTION_REPLY_DOMAIN`
stays unset) and the reply key in the subject tag. **Inbound: a scheduled IMAP poller on that same mailbox** (imapflow,
`imap.hostinger.com:993`, the existing SMTP credentials — host/port to confirm in the Hostinger panel), every 15 minutes,
ingesting only messages whose subject carries a reply key or whose `In-Reply-To` matches a note we sent, posting them to
`applyInboundReply`; everything else in the mailbox is left untouched. Cost £0, no account to open, no DNS change; latency
= the poll interval. **Secrets:** `NIVADESK_RETENTION_TOKEN_SECRET` (new, generated) — required before the e-mail flag
because it makes the unsubscribe link; `NIVADESK_RETENTION_INBOUND_SECRET` not needed on this path (the HTTP endpoint stays
for a provider later). Alternative, not recommended now: SendGrid / Mailgun / Postmark inbound parse on
`reply.nivadesk.co.uk` — a new account, DNS records, a monthly cost, and a second sending identity to authenticate.

### 6.6 Decisions, with a recommendation each

1. **Pilot workspace:** our test workspace `GuglEFKSEKNTq1xibFpJav3EWkY2` (named on the list, so allowed) — *recommended*; or one consenting external workspace.
2. **Which channel in the pilot:** in-app only (`SWEEP=1`, `IN_APP=1`, `EMAIL=0`, `INBOUND=0`) — *recommended*; e-mail waits for the IMAP poller and the token secret.
3. **Feedback vs support case:** should the feedback invitation also yield to an open support ticket? *Recommended: yes, later* — a two-line read in `getFeedbackPrompt`; not in this package.
4. **Spec's +24–48 h "not set up yet" e-mail:** keep the founder note as the single welcome, or add the later no-activation mail as a second `founder`-kind campaign? *Recommended: decide after the in-app pilot; nothing in code depends on it.*
5. **Exclude list at general launch:** the four ids in §6.3 — *recommended*.
6. **Funnel follow-up:** pass the five store collections to the funnel too — *recommended, separate deploy of `getActivationFunnel`*.

### 6.7 The single-workspace pilot — exact scope when approved

* **Merge** `retention-live-base` into the deploy branch (normal merge, docs included).
* **Rules + indexes:** `firestore:rules` (the four retention collections, server-only except member-readable
  `retentionMessages`, two deny-list entries) and `firestore:indexes` (the `retentionLog` collection-group index) —
  diff against live to be produced at approval time.
* **`functions/.env`:** `NIVADESK_RETENTION_SWEEP=1`, `NIVADESK_RETENTION_IN_APP=1`, `NIVADESK_RETENTION_WORKSPACES=<pilot id>`,
  `NIVADESK_RETENTION_EXCLUDE_WORKSPACES=<the four ids>`; `EMAIL` and `INBOUND` unset.
* **Functions, by name:** `retentionSweep` (new, hourly), `dismissRetentionMessage`, `setRetentionOptOut` (new), plus the
  four ticket callables that carry the support-case stamp (`createSupportTicket`, `createWorkspaceTicket`,
  `updateSupportTicketStatus`, `updateWorkspaceTicketStatus`). Not `retentionInboundReply` / `retentionUnsubscribe`
  until e-mail. Nothing else — OpenAI, Stripe, feedback, eBay, checklist, funnel untouched.
* **Web:** one Round with `RetentionNudge.tsx`, `retention.ts`, the AppShell/FeedbackCenter/language/globals deltas — file-scoped
  into the publish repo as before.
* **Expected in the pilot workspace:** at most two cards a day, the first one within an hour of becoming due, none while the
  feedback invitation is up; the sweep's log line shows `evaluated 1`, every other workspace under `skipped.not_in_pilot`.
* **Rollback:** set the flags back to unset and redeploy the same functions by name — with every flag off the sweep
  evaluates nothing and writes nothing; cards already written stay readable until the person closes them; no data is
  deleted; the web reader shows nothing when no card is open.

## 7. The one-workspace in-app pilot — pre-checks, deploy, verification (11 September 2026)

Operator approval: in-app only, pilot workspace `GuglEFKSEKNTq1xibFpJav3EWkY2`, e-mail and inbound off, no re-approval
once the five pre-checks pass. OpenAI, Stripe, eBay, Google untouched; the funnel's store collections left for a separate
change; the e-mail/IMAP note stays a proposal (no mailbox access, no secret created).

### 7.1 Pre-check 1 — the tested tree is the deployed tree

| | |
|---|---|
| Final product commit on the branch | **`dd9fc6e9`** (`retention-live-base`): read-time review, `getRetentionMessage`, the reader change |
| CI on it | run for `dd9fc6e9`: **success** (unit on the fake Firestore; rules + e2e on the Firestore emulator); earlier commits `bfa4bfc9`, `d3d40de1`, `8158e7f8` also green |
| Merge into the deploy branch | normal `--no-ff` merge → **`9aacbe5b`**; `functions/` tree, `firestore.rules` and `firestore.indexes.json` **byte-identical** to `dd9fc6e9`; ancestors intact (Stripe, allowlist, OpenAI, checklist, feedback, activation) |

### 7.2 Pre-check 2 — `acted` is not completion

`acted` is a status on the card only (`retentionMessages/{id}.status`, `actedAtMs`); activation and the goal are read from
the workspace's data (`lifecycleState`, `firstOrderProgress`, the derived events) and never from a click. What happens to
a half-finished project afterwards, by the existing rules: the next sweep still sees a shell and proposes
`complete_first_order` again, and the writer refuses it with **`already_sent`** — one card per campaign per workspace is the
rule (`retentionLog` claim + `messaging.js`), not "the click completed it". Pinned by `retention-writer.test.js` ("acting on a
card is not completing the goal…"): the shell trigger is proposed again a day later, refused `already_sent`, no second card,
no dismissal recorded, and the writer never touches `siparisler`.

### 7.3 Pre-check 3 — a pending card is judged again at the moment of looking

New `reviewOpenMessages` (writer) behind the new callable **`getRetentionMessage`**: before anything is shown the open cards
are re-judged against today's data. **Withdrawn for good** (persisted, `status withdrawn`, `withdrawReason`): goal met
(`CAMPAIGN_GOALS` ∩ derived events — the shell became a real project, the store or bank got connected), opt-out, workspace
cancelled, workspace activated (onboarding-kind cards). **Held** (nothing written, nothing shown, the next look decides):
an open support case, a feedback prompt shown or answered in the last 24 hours — judged for the person looking (their own
`feedbackState`). Withdrawal is evaluated before a hold, so a met goal is withdrawn even during a hold. The web reader asks
the server on mount and page change (at most every ten minutes per session), **again when the feedback invitation closes**
and after a card is closed — so a card written before the invitation cannot pop up the moment the invitation goes away.
Tests: `retention-writer.test.js` (review: goal met / opt-out / cancelled / activated withdraw; support case / feedback hold
write nothing; newest surviving card; withdrawal beats hold), `retention-sweep-wiring.test.js` (the callable's gate, query,
snapshot and hold inputs). Emulator, final code, all through the real callable (`getRetentionMessage` over HTTP with the
owner's emulator token):

| Rule | Observed |
|---|---|
| goal met | a `connect_bank` card returned → a bank connection added → next look: `withdrawn 1`, card `withdrawn (goal_met)` |
| feedback prompt recent | a `connect_first_store` card returned → the owner's `feedbackState.shows` stamped now → next look: `message null, reason feedback_prompt_recent`, card still `open` → stamp moved two days back → card returned again |
| support case open | `markSupportCase(open)` → `reason support_case_open` → closed → card returned |
| opt-out | `setOptOut(true)` → `withdrawn 1`, card `withdrawn (opt_out)` |
| UI, Not now | card rendered ("Complete your first project"), Not now → gone; server `dismissed`, `dismissals` +1, next look `none_open` |
| UI, CTA | fresh look, "Create your first project" → CTA → stayed on `/orders`, server `acted`, `actedAtMs`, dismissals unchanged, next look `none_open` |

### 7.4 Pre-check 4 — only the pilot workspace

`NIVADESK_RETENTION_WORKSPACES=GuglEFKSEKNTq1xibFpJav3EWkY2` (an explicit id: allowed even though its owner is one of us),
`NIVADESK_RETENTION_EXCLUDE_WORKSPACES=KSQidetb3oOSItE9amLISf9Lh6h2,FvnnEcQAFVQnin5GOe88YkDaBxf1,iZFBJqrTJfUBVPA4BgKyvg9zV9o1`
(our internal workspace, the "test"-named workspace owned by a Shopify app-review tester, and EGGcraft — kept for the general
launch), the internal-owner rule under `*`. Verified: unit (`workspaceScope`, 12 assertions); emulator — a card written for a
second workspace `qa-other-co`, its owner's `getRetentionMessage` → `enabled false, reason not_in_pilot`; that owner asking
for the pilot workspace → `PERMISSION_DENIED`. The sweep applies the same gate before any read and counts skips.

### 7.5 Pre-check 5 — rules, indexes, the four ticket callables, the deploy list, rollback

* **Rules diff vs live** (deploy tip `firestore.rules` = the ruleset released on 10 Sep): four `companies/{cid}/retention*`
  blocks (state, log, inbound server-only; `retentionMessages` member-readable, server-written), the two deny-list entries
  ×4 names, `retentionReplyKeys` server-only. Nothing else.
* **Index diff vs live:** one composite index, collection group `retentionLog` (`status ASC, nextAttemptAtMs ASC`); not
  present before. Used only by the e-mail outbox retry (`flags.email`), so the in-app pilot never queries it — deployed and
  waited for anyway, as instructed, before the sweep flag was set.
* **The four ticket callables** (`createSupportTicket`, `createWorkspaceTicket`, `updateSupportTicketStatus`,
  `updateWorkspaceTicketStatus`): the only change in each is the added `await nvRetentionSupportCaseSync(…)` after the
  ticket write / status update, plus the helper itself; nothing else in `index.js` changes for them.
* **Before the deploy:** `createsupportticket-00067-juw`, `createworkspaceticket-00048-ruk`, `updatesupportticketstatus-00036-loj`,
  `updateworkspaceticketstatus-00040-rip`; `retentionsweep`, `getretentionmessage`, `dismissretentionmessage`,
  `setretentionoptout` did not exist; `functions/.env` had no `NIVADESK_RETENTION_*` line (a copy kept beside the chain log).
* **Deploy list, by name:** `retentionSweep` (new, hourly schedule), `getRetentionMessage` (new), `dismissRetentionMessage`
  (new), `setRetentionOptOut` (new), and the four ticket callables. Not `retentionInboundReply`, not `retentionUnsubscribe`.
* **Rollback:** the four ticket callables → route traffic back to the revisions above (their own image and env). The four new
  services → **shutdown path:** set the four `NIVADESK_RETENTION_*` lines back to unset and redeploy the same names (with every
  flag off the sweep evaluates nothing and the callable answers `flag_off` and reads nothing), or pause the scheduler job
  (`gcloud scheduler jobs pause firebase-schedule-retentionSweep-europe-west2`), or delete the four functions
  (`firebase functions:delete …`). Rules and the index can stay: they only make server-only collections explicit. No data is
  deleted by any rollback; open cards simply stop being shown.

**Why eight functions, not seven.** The §6.7 list had seven. The eighth is **`getRetentionMessage`**, added for pre-check 3:
the card shown to a person has to be judged at the moment of looking (goal met, opt-out, cancelled, activated → withdrawn;
open support case or a feedback prompt in the last 24 hours → held), and a client-side listener on `retentionMessages`
cannot know any of that. The reader now asks this callable instead of reading Firestore. Same pilot gate, same scope.

### 7.6 Deployed (11 September 2026, 02:10–02:20Z)

| Step | Record |
|---|---|
| Rules + indexes | released 02:10:24–02:10:38Z; the `retentionLog` composite index was `CREATING` at 02:13Z and **`READY`** before 02:16:01Z (JSON listing). The chain's text-format check never saw it, so the chain was stopped at 02:16:50Z while it was only polling — the index was **not deleted or recreated** — and continued from the flags step after re-reading every pre-check |
| Flags (`functions/.env`, the copy from before kept beside the chain log) | `NIVADESK_RETENTION_SWEEP=1`, `NIVADESK_RETENTION_IN_APP=1`, `NIVADESK_RETENTION_WORKSPACES=GuglEFKSEKNTq1xibFpJav3EWkY2`, `NIVADESK_RETENTION_EXCLUDE_WORKSPACES=KSQidetb3oOSItE9amLISf9Lh6h2,FvnnEcQAFVQnin5GOe88YkDaBxf1,iZFBJqrTJfUBVPA4BgKyvg9zV9o1`; `EMAIL` and `INBOUND` unset |
| Functions, 02:16:52–02:19:50Z | created `retentionsweep-00001-cob`, `getretentionmessage-00001-yoy`, `dismissretentionmessage-00001-jej`, `setretentionoptout-00001-jat`; updated `createsupportticket-00068-lot`, `createworkspaceticket-00049-dux`, `updatesupportticketstatus-00037-dup`, `updateworkspaceticketstatus-00041-feb` — all Ready, 100 % traffic, the four flags read back on each, `EMAIL`/`INBOUND` unset |
| Scheduler | `firebase-schedule-retentionSweep-europe-west2`, every 60 minutes, ENABLED |
| Untouched | `chatgptmcp-00073-fuz`, `stripewebhook-00047-por`, `getsetupchecklist-00003-noh`, `getactivationfunnel-00003-cuv`, `getfeedbackprompt-00002-git`, `submitfeedback-00002-jih`, `beginebayconnect-00002-cod`, `previewebayimport-00002-hac` |
| Web | publish repo **Round 173** `3edb0b0` (the six files, file-scoped; Rounds 169–172 intact), pushed 02:20:47Z |

### 7.7 The pilot in production — first sweep and the timeline

**The synthetic order** `YFFB4Xqi8zSfFgPEN48t` in the pilot workspace (created by the feedback pilot check on 10 Sep 22:45:58Z:
customer "Pilot Check Customer", design "Feedback pilot synthetic order", project number 1, status "Not Yet", paid 0,
`createdByEmail contact@nivadesk.co.uk`) — verified synthetic, then moved to the bin the way the app does it
(`isDeleted true`, `deletedAt`, `updatedAt`) with a `retentionPilotNote` saying why and how to restore. With it in the bin the
workspace has no live order, so a first-project card can become due; the bin is reversible and the order is not deleted.

**First sweep, triggered once by hand at 02:20:56Z** (`gcloud scheduler jobs run`), summary line at 02:20:59Z:
`{"evaluated":1,"sent":0,"refused":{"flag_off":1},"skipped":{"not_in_pilot":62,"excluded_workspace":3}}` — exactly one
workspace evaluated (the pilot), sixty-two skipped as not on the list, three skipped by the exclude list, nothing sent. The
one refusal is `flag_off`: the only candidate due for the pilot workspace right now is `founder_intro` (signed up on 10 Sep,
inside the 14-day window) — an **e-mail**, and the e-mail flag is off, so it was refused before anything could leave. That
is the live proof that e-mail stays closed.

**When the first card can appear.** `create_first_order` needs 24 hours since the wizard was finished (10 Sep 18:31:18Z →
due from **11 Sep 18:31Z**), and the pilot owner's last feedback prompt was shown at 10 Sep 22:48:51Z, so the 24-hour hold
runs until **11 Sep 22:48:51Z**. The hourly sweep after that (≈ **23:20Z on 11 Sep**) is the first that can write the card.
The live checks that need a card — it appears, Not now closes it, the CTA routes and closes it as acted, and restoring the
synthetic order withdraws the pending card as `goal_met` — are therefore scheduled for after that sweep; nothing in the
rules was shortened to bring them forward. Until then the synthetic order stays in the bin, marked.

### 7.8 Live checks done now (11 Sep 02:23–02:25Z)

| Check | Observed |
|---|---|
| Web live | Round 173 served at **02:23:44Z** (the `getRetentionMessage` reader found in the published chunk) |
| Only the pilot workspace gets a card | the admin's **EGGcraft** session (on the exclude list): the reader ran (session look stamp set), the server was asked (the reader's session look stamp was set; the function's DEBUG log line had not been ingested when read at 02:25Z and 02:26Z), **no card in the page** — EGGcraft is `excluded_workspace`; the sweep's own log already showed 62 `not_in_pilot` + 3 `excluded_workspace`, 1 evaluated |
| E-mail and inbound stay closed | `NIVADESK_RETENTION_EMAIL` / `_INBOUND` unset on all eight services (read back); `retentionInboundReply` and `retentionUnsubscribe` not deployed; the first sweep refused the only e-mail candidate as `flag_off` |
| Feedback behaviour preserved | `getfeedbackprompt-00002-git` / `submitfeedback-00002-jih` untouched; after Round 173 the account menu still reads Account · **Send feedback** · Visit website · Sign Out in the EGGcraft session; no invitation there (old first success), as before |

**Still open, time-gated, nothing else changed:** the pilot workspace's first card (≈ 23:20Z sweep on 11 Sep, after the
24-hour first-order rule and the 24-hour feedback hold both pass) → see it, Not now, CTA/acted, then restore the synthetic
order `YFFB4Xqi8zSfFgPEN48t` (clear `isDeleted`) and confirm the next look withdraws the pending card as `goal_met`.

## 8. Operating the pilot, and the two kinds of rollback (written 11 Sep 02:3xZ, nothing applied)

**The real schedule.** Cloud Scheduler job `firebase-schedule-retentionSweep-europe-west2`: `every 60 minutes`, time zone UTC,
ENABLED; last attempt 02:20:58Z (the run triggered by hand), next scheduled **03:20:01Z**, then every hour at **:20**. So the
natural sweeps tonight are 03:20, 04:20 … and the first that can write the pilot's card is the **23:20Z** run (after the
24-hour first-order rule at 18:31Z and the 24-hour feedback hold at 22:48:51Z). No persistent watcher exists in this
session: the evening's check has to be run by hand — the sweep summary line in Cloud Logging, then the pilot workspace
in a browser session — or the operator asks for it in the morning.

**What each switch does — from the code, not from memory.**

| Action | Effect on new cards | Effect on cards already written (`status open`) |
|---|---|---|
| Pause the scheduler (`gcloud scheduler jobs pause firebase-schedule-retentionSweep-europe-west2 --location=europe-west2`) | no sweep runs → nothing new is evaluated or written | **unchanged and still shown**: `getRetentionMessage` reads `retentionMessages` where `status == open` and answers whenever `NIVADESK_RETENTION_IN_APP=1` and the workspace passes the pilot gate (index.js: `if (!flags.inApp) return … flag_off` is the only client-side kill switch) |
| `NIVADESK_RETENTION_SWEEP` unset + redeploy `retentionSweep` | the function exits at once ("nothing evaluated") | unchanged and still shown (same reason) |
| `NIVADESK_RETENTION_IN_APP` unset + redeploy `getRetentionMessage` (and `retentionSweep`, whose writer refuses in-app with `flag_off` — writer.js line 83) | nothing written | **hidden everywhere at once**: the callable answers `enabled false, reason flag_off` and reads nothing; the documents stay `open` in Firestore, untouched, and would show again if the flag came back |
| `NIVADESK_RETENTION_WORKSPACES` emptied + redeploy the two | nothing written (`not_in_pilot`) | hidden (`not_in_pilot` on read) |
| Delete the four new functions (`firebase functions:delete retentionSweep getRetentionMessage dismissRetentionMessage setRetentionOptOut`) | nothing | hidden (the web reader's call fails and it shows nothing); the web keeps calling a missing function until a Round removes the reader |

So "pausing the scheduler" is a **freeze**, not a rollback: it stops the pilot from growing but leaves whatever is on screen.
Closing the cards' display is the in-app flag. Nothing in any of these deletes a document; `dismiss`/`acted`/`withdrawn`
statuses written so far stay as history.

**Full shutdown, ready to run (in this order):**

```bash
# 1. freeze the sweep
gcloud scheduler jobs pause firebase-schedule-retentionSweep-europe-west2 --location=europe-west2 --project=eggcraft-studio
# 2. turn the display off and the writer off: remove the four lines from functions/.env …
sed -i '' '/^NIVADESK_RETENTION_/d' functions/.env
# … and redeploy the four retention services by name (the ticket callables keep the stamp; it is harmless with everything off)
npx firebase deploy --project eggcraft-studio --only functions:retentionSweep,functions:getRetentionMessage,functions:dismissRetentionMessage,functions:setRetentionOptOut
# 3. (optional) the ticket callables back to their pre-pilot revisions — only if the stamp itself must go
gcloud run services update-traffic createsupportticket --region=europe-west2 --to-revisions=createsupportticket-00067-juw=100
gcloud run services update-traffic createworkspaceticket --region=europe-west2 --to-revisions=createworkspaceticket-00048-ruk=100
gcloud run services update-traffic updatesupportticketstatus --region=europe-west2 --to-revisions=updatesupportticketstatus-00036-loj=100
gcloud run services update-traffic updateworkspaceticketstatus --region=europe-west2 --to-revisions=updateworkspaceticketstatus-00040-rip=100
```

**Reopen:** restore the four `.env` lines (the pilot values are in §7.6), redeploy the same four names, then
`gcloud scheduler jobs resume firebase-schedule-retentionSweep-europe-west2 --location=europe-west2 --project=eggcraft-studio`.
The web needs nothing either way. Rules and the index stay in both directions.

**Check that the natural sweeps stay inside the pilot.** The summary line every sweep logs is the record
(`retentionSweep: {"evaluated":…,"sent":…,"refused":…,"skipped":…}`): `evaluated` must stay 1, `sent` 0 until the card is
due, `skipped.not_in_pilot` + `skipped.excluded_workspace` = every other company, and `refused.flag_off` is the e-mail
candidate being turned away. The 02:20Z run reads exactly that; the 03:20Z and later runs are to be read the same way
(one `gcloud logging read`, no new queries against the workspaces).

## 9. The Shopify connection rule brought to the retention readers — `retentionSweep` + `getRetentionMessage` redeployed (11 Sep 12:10Z)

**Why:** `getactivationfunnel-00004-tot` (11:41Z) judges store connections by each connector's own status words
(`docs/onboarding/activation-funnel-stores-2026-09-11.md`); the two retention readers of the same `derive.js` were still on
the earlier rule (an uninstalled Shopify store counted as connected → `connect_first_store` never proposed, an open
`connect_first_store` card withdrawn `goal_met`). Operator approval 11 Sep ~12:07Z: only these two functions.

**No new code, no re-merge.** The fix was already on the deploy branch (`ff514cf8`). Product diff between the live retention
source (merge `9aacbe5b`, functions tree `dd9fc6e9`) and HEAD: `lifecycle/derive.js` (the rule), `index.js` (two hunks, both
inside `getActivationFunnel` — the funnel's snapshot reads; nothing in the retention wiring), `feedback.js` +
`lifecycle/feedback.js` (already live through `submitfeedback-00003-jez`; not on these two functions' paths).
`retention/writer.js`, `lifecycle/retention.js`, `lifecycle/messaging.js`: byte-identical to the live source. So the only
behaviour difference these two functions gain is the derive rule; no out-of-scope change to separate.

**Evidence reused, not re-run:** `lifecycle-derive-consumers.test.js` (4 — campaign selection and the pending-card review
under both rules) and `retention-sweep-wiring.test.js` (5) passed on the merged tree at 11:3xZ; `functions/` is unchanged
since (`git diff --quiet ff514cf8 HEAD -- functions/`).

| | Before | After |
|---|---|---|
| `retentionsweep` | `retentionsweep-00001-cob` (02:19Z, Ready, retained) | **`retentionsweep-00002-maz`** (12:10:42Z, 100 %) |
| `getretentionmessage` | `getretentionmessage-00001-yoy` (02:19Z, Ready, retained) | **`getretentionmessage-00002-woz`** (12:10:54Z, 100 %) |
| Flags on the new revision (read back) | — | `SWEEP=1`, `IN_APP=1`, `WORKSPACES=GuglEFKSEKNTq1xibFpJav3EWkY2`, `EXCLUDE=KSQidetb…,FvnnEcQA…,iZFBJqrT…`; `EMAIL`, `INBOUND`, `INBOUND_MODE` absent — identical to the pilot's |
| Scheduler | `every 60 minutes`, ENABLED, UTC, last attempt 11:20:02Z | unchanged; **not triggered by hand** |
| Timings / caps / rules | unchanged (no code change in the retention modules) | unchanged |

Deploy: `firebase deploy --only functions:retentionSweep,functions:getRetentionMessage` → both "Successful update operation",
exit 0 (raw log kept in the session scratchpad). Nothing else deployed. Rollback: traffic back to `-00001-cob` / `-00001-yoy`.

Natural sweeps today (08:20–11:20Z, all on the old revision): `evaluated 1, sent 0, refused flag_off 1, skipped not_in_pilot 62 /
excluded_workspace 3` — the founder e-mail candidate refused because e-mail is off; no card yet (none due). The next natural
run (12:20Z) is the first on `-00002-maz`; the ≈23:20Z one is the pilot's expected first card.

**Closed:** the funnel/retention Shopify rule difference (funnel record, third pass) — both readers now run the same `derive.js`.
**Still open, unchanged:** the ≈23:20Z (11 Sep) pilot check — the natural card → restore the synthetic order → `goal_met`;
the pilot is not accepted until that is seen.

## 10. The pilot's first natural card moved by the Mac feedback send — recomputed from the real stamps (12:39Z, read-only)

**What the 24-hour hold reads** (`feedbackPromptRecent`, `lifecycle/retention.js`): the owner's `feedbackState` **`shows`** (invitation
rendered) and **`submissions`** (any send, manual included — `campaign ""` counts) within the last 24 hours. **Dismissals do not
count.** Both readers use it: the sweep (`holdInApp` for the owner) and `getRetentionMessage` (for the person looking).

**The test account's stamps** (`companies/GuglEFKS…/feedbackState/GuglEFKS…`): submission 10 Sep 22:39:41.817Z (pilot note),
show 10 Sep 22:48:51.994Z, dismissal 10 Sep 22:49:31.646Z, **submission 11 Sep 12:02:30.875Z (the Mac QA note `fb_uFGXmTi0BxcX`)**.
So yes — the manual Mac send moved the hold: it now ends at **12 Sep 2026 12:02:30.875Z**.

**The other conditions, from the real fields:** workspace created 10 Sep 18:30:41Z; wizard completed 18:31:18.232Z;
`onboardingMainGoal orders_customers` → path `bespoke_studio`; the only order (`YFFB4Xqi8zSfFgPEN48t`, created 10 Sep 22:45:58Z)
is in the bin since 11 Sep 02:20:55Z and a deleted order is no evidence (`substantiveOrder.js`), so `firstOrder.state = none`;
`create_first_order` (in-app) is proposed once 24 h have passed since the wizard → from **11 Sep 18:31:18Z** (computed with
`triggerCandidates` on these values: 18:20Z → founder_intro only; 18:31:19Z onward → founder_intro + create_first_order).
The founder note stays refused `flag_off` (e-mail off). No retention dismissal, no in-app send today (cap 2/day untouched),
no support case, not churned/silent, no retention state document yet, 0 `retentionMessages`.

**First eligible natural sweep:** the schedule fires at :20 every hour; the hold is still true at 12 Sep 11:20Z and false from
12:02:31Z → **12 September 2026, 12:20Z run** (the 11 Sep 23:20Z figure in §7/§8 and the hand-off is void — at that run the
sweep will evaluate the workspace and hold the card, `holdReason feedback_prompt_recent`). Any new invitation show or
feedback send from this account before then moves it again by 24 hours; nothing was changed to make it earlier.

**Unchanged and still open:** no stamp, cooldown or rule was touched; the synthetic order stays in the bin; the acceptance
chain remains the natural card (12 Sep ≈12:20Z) → restore the synthetic order → `goal_met` withdrawal.
