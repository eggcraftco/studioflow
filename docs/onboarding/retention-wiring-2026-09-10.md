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
