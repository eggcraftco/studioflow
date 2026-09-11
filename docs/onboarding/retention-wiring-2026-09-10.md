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
