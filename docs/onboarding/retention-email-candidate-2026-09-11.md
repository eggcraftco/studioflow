# Retention e-mail stage — a deploy-ready candidate (11 September 2026, 02:4x–03:0xZ)

Branch **`retention-email-candidate`**, cut from the deploy branch head `37025406` (the live in-app pilot tree), code
commit **`3670c58e`**, pushed. **Nothing is deployed from it.** In production `NIVADESK_RETENTION_EMAIL` and
`NIVADESK_RETENTION_INBOUND` stay unset; no mailbox was opened, no message was sent, no provider account, DNS record or
secret was created or changed. The overnight brief asked for the e-mail stage as a candidate with local tests, and for an
honest answer on whether the IMAP approach fits — both are below, plus the deploy list and the morning decisions.

## 1. What the live base was missing (found by reading `retention/writer.js`, `lifecycle/retention.js`, `index.js`)

| # | Gap on the live base | What the candidate does |
|---|---|---|
| 1 | The reply key travelled **only** in a plus-address (`retention+<key>@<replyDomain>`), which needs `NIVADESK_RETENTION_REPLY_DOMAIN` *and* a mailbox that accepts plus-addressing. With the domain unset — the §6.5 proposal — a reply carried no key at all and fell to `no_reply_key`. | The key is appended to the subject as ` [NV-<key>]`, once; a `Re:` keeps it (`subjectWithReplyKey`). The plus-address is still used when a reply domain exists. |
| 2 | A reply whose subject lost the tag (some clients rewrite subjects, some people start a fresh mail from the thread) could not be matched. | At send time the note's own `Message-ID` is stored beside its key (`retentionReplyKeys/<key>.messageId`). A reply is matched by the tag first, else by `In-Reply-To` (or the first `References` entry) against that id (`resolveReplyOwner`). |
| 3 | The same mail seen twice was recorded twice (an `add()` per call). | One inbound document per mail: id `mid_<sha1(Message-ID)>`, written with `create()`; a second sight returns `already_processed` / `duplicate: true` and changes nothing (`claimInbound`). Mails without a Message-ID still get an auto id. |
| 4 | The outbox retry re-sent a queued note whatever had happened in between. | Each due entry is judged again with the workspace's **current** state before the attempt: `opt_out`, `user_replied`, `support_case_open`, `workspace_cancelled`, and `activated` for setup-kind mails — the row dies as `suppressed_<reason>` and nothing leaves (`suppressedBeforeSend`, `attemptEmail({ recheck: true })`). The sweep passes a per-workspace context loader that derives activation exactly the way the sweep itself does (`nvRetentionTriggerFor`). |
| 5 | No inbound path existed without a mail provider; `retentionInboundReply` (HTTP, shared secret) waits for one. | `functions/retention/imapPoll.js`: reads the mailbox the notes leave from over IMAP, **read-only** (nothing is marked, moved or removed), opens the body only of mails that could be answers (subject tag, `In-Reply-To` or `References`), hands each to the same `applyInboundReply` the HTTP route uses, keeps a cursor with a day of overlap (the dedupe absorbs it). `retentionInboundPoll` (new, hourly) runs it only when `NIVADESK_RETENTION_INBOUND=1` **and** `NIVADESK_RETENTION_INBOUND_MODE=imap`; the client is handed in, so the poller is tested with a fake and `imapflow` is never loaded in tests. |
| 6 | The stored payload's reply address defaulted to the template's `contact@eggcraft.co.uk`. | The sweep passes the sending mailbox as `templateContext.replyTo`; `attemptEmail` already prefers the transport's address at send time. |
| 7 | `retryOutboxEntries` reported only `attempted/sent`. | It now also counts `suppressed`; the sweep summary line carries it. |

Dependency added: `imapflow ^1.7.8` (25 packages, `npm audit` on the branch not run separately — the CI dependency audit
workflow covers the branch on push). `functions/index.js` changes are three: the outbox context loader, the reply address,
and the new scheduled function — every other function is byte-identical to the live tree.

## 2. Behaviours completed with local tests (all against the fake Firestore and a fake transport / fake IMAP client)

| Behaviour asked for | Where it is proven | Result |
|---|---|---|
| A reply matches the right workspace and campaign — by the subject tag | `retention-writer.test.js` "a reply is matched by the tag, or by In-Reply-To when the tag was dropped; the same mail seen twice is processed once" | PASS |
| … and by `In-Reply-To` when the tag was dropped (case differences in the id are normalised) | same check; `retention-rules.test.js` "a mail's own Message-ID and the id it answers are read from the headers, normalised, and absent when missing" | PASS |
| The same mail is never processed twice | same writer check (`duplicate: true`, one inbound record, the first reply time stands); `retention-imap-poll.test.js` "a poll applies each answer once … and moves the cursor" (the second poll sees the same mails: 0 applied, 2 duplicates) | PASS |
| Opt-out: `STOP` / "unsubscribe" by reply opts the workspace out; the unsubscribe link and the settings switch unchanged | writer "a reply stops every automated sequence; an auto-reply does not; 'unsubscribe' also opts out", "opt-out is honoured by every channel and can be switched back"; poller "an unsubscribe by reply opts the workspace out through the same poll" | PASS |
| A person's reply stops every automated sequence; an out-of-office / `Auto-Submitted` / `Precedence: bulk` reply does not count as a reply | writer check above; rules "a reply is recognised by its key, stripped of the quoted thread, and told apart from an auto-reply" | PASS |
| Support case open → no new note (sweep) and a queued note dies at retry | writer "the support-case stamp …", "a queued note is not retried to someone who opted out, replied, opened a support case or cancelled since it was queued" | PASS |
| Sending stops after (re)activation | writer: at recheck a **setup-kind** e-mail dies `suppressed_activated`; the **founder note (kind `founder`) still goes** — the same rule `messaging.js` §9.4 applies before the first attempt. Today the only e-mail campaign is the founder note, so this matters when a setup e-mail campaign is added; whether activation should also stop the founder note is decision 4 below. | PASS (behaviour recorded as it is) |
| Every note carries its key in the subject and replies to the mailbox it left from; the note's Message-ID is kept beside the key | writer "every note carries its reply key in the subject …" | PASS |
| The outbox: failed send kept with the next attempt scheduled, retried, dead after the last try; flag off = nothing queued or sent | writer checks 3–4 (unchanged) | PASS |
| The poller reads nothing with the flag off, opens only candidate mails, never writes to the mailbox | `retention-imap-poll.test.js` 4 checks; `retention-sweep-wiring.test.js` pins that `retention/imapPoll.js` contains none of imapflow's write calls and connects with TLS only | PASS |
| `index.js` wiring | `retention-sweep-wiring.test.js` 7 checks (2 new: the recheck context loader + reply address; the poller's two gates, secret and schedule) | PASS |

Counts on `3670c58e`: `retention-rules` 17, `retention-writer` 18, `retention-sweep-wiring` 7, `retention-imap-poll` 4,
`activation-funnel-wiring` 7, `feedback` 16; full `npm test` in `functions/` exit 0, no FAIL line (log in the session
scratchpad, `npm-test-email-branch.log`). CI on the pushed branch: see the hand-off row for the run result.

## 3. Is IMAP actually suitable? — evaluation

**Verdict: suitable for the pilot scale, and preferable to a provider now — with four conditions the morning has to settle.**

For it:
* No provider, no DNS, no monthly cost; the mailbox (`contact@nivadesk.co.uk`) and its credentials already exist and
  already send the support mail.
* Read-only by construction: the client never sets a flag, moves or deletes; support staff working the same inbox see
  nothing change. Idempotent by construction: one inbound record per Message-ID, so re-reading the same window is harmless.
* Selective: only mails whose subject carries `[NV-…]` or that have a thread header are opened; a supplier's invoice
  in the same inbox is never downloaded (test: uid 12 is never fetched).
* Latency up to one poll interval (60 min) is fine for a founder note; the cadence is one schedule string.
* The HTTP route stays for a provider later; nothing here forecloses that.

Against it / conditions:
1. **Shared mailbox, shared secret.** The poller would authenticate with the mailbox password that today lives in the
   `NIVADESK_SMTP_PASSWORD` secret — the same account, but a *broader use* of that secret (read as well as send). A
   dedicated mailbox (e.g. a `hello@`/`founder@` box) would isolate this; it costs a Hostinger mailbox seat (price not
   checked tonight) and a new secret (operator action). Decision 3.
2. **Host/port not verified.** `imap.hostinger.com:993` (TLS) is assumed from Hostinger's published defaults; not confirmed
   in the panel (no panel access tonight, none attempted). One connection per poll; Hostinger's IMAP connection limits are
   not a concern at one login per hour.
3. **Volume cap.** A poll reads at most 200 headers per run (`maxMessages`) since the cursor; the summary logs `seen`,
   so a backlog would be visible, not silent. Fine for this inbox; a high-volume shared box would need a dedicated one.
4. **The plus-address path is no longer needed** (tag + `In-Reply-To` cover it), so `NIVADESK_RETENTION_REPLY_DOMAIN`
   stays unset and no catch-all/plus-addressing question arises.

Not suitable if: the team wants sub-minute reply handling, or the inbox is to be moved to a provider that disallows
IMAP for automation — neither applies today.

## 4. Deploy list when approved (not run; recorded so the morning can say yes or no to a fixed scope)

* **Secret first:** `NIVADESK_RETENTION_TOKEN_SECRET` must exist before `EMAIL=1` — it signs the unsubscribe link in
  every note (`nvRetentionUnsubscribeUrl` returns "" without it and the note would go without a working link). Creating
  it is the operator's action; nothing was created tonight.
* **`functions/.env`:** `NIVADESK_RETENTION_EMAIL=1`, `NIVADESK_RETENTION_INBOUND=1`, `NIVADESK_RETENTION_INBOUND_MODE=imap`;
  optional `NIVADESK_RETENTION_IMAP_HOST` / `_PORT` / `_USER` / `_MAILBOX` (defaults `imap.hostinger.com` / `993` /
  the SMTP user / `INBOX`). `NIVADESK_RETENTION_REPLY_DOMAIN` stays unset. Pilot list unchanged (one workspace).
* **Functions, by name:** minimum `retentionSweep` (sends + outbox), `retentionInboundPoll` (new), `retentionUnsubscribe`
  (new HTTP). *Recommended instead:* the whole retention set so one tree runs everywhere, as pre-check 1 of the pilot
  required — the three above plus `getRetentionMessage`, `dismissRetentionMessage`, `setRetentionOptOut` and the four
  ticket callables (`createSupportTicket`, `createWorkspaceTicket`, `updateSupportTicketStatus`, `updateWorkspaceTicketStatus`).
  Not `retentionInboundReply` (mode `imap`, and no inbound secret exists).
* **Expected on the first e-mail sweep in the pilot workspace:** `founder_intro` already refused as `flag_off` on 11 Sep
  02:20Z is *not* logged as sent, so it becomes due again once `EMAIL=1` (a `flag_off` refusal writes no log row);
  the note goes to the workspace owner's address (our test account), the summary shows `sent 1`, and
  `retentionLog/founder_intro_email` reads `status: sent` with a `providerId`; a reply from that mailbox shows in the
  next poll's summary as `applied 1`.
* **Rollback:** unset `EMAIL`, `INBOUND`, `INBOUND_MODE` and redeploy the same names — the sweep queues and sends nothing,
  the poller reads nothing (its own flag check refuses even if the schedule fires), outbox rows keep their state, no data
  is deleted. Pausing the `retentionInboundPoll` scheduler alone stops reads without a deploy.

## 5. What is settled, and the three real decisions (rewritten 11 Sep 11:1xZ)

**Verified technical facts (no decision needed):**
* Hostinger's own e-mail service: **IMAP `imap.hostinger.com` port 993 (TLS/SSL)**, POP3 `pop.hostinger.com` 995, **SMTP `smtp.hostinger.com` 465 (TLS/SSL)** — Hostinger documentation (docs.hostinger.com/emails/setup-devices; the support article 1575756 says the same). The code's defaults are exactly these; nothing to configure for host/port.
* Current sending configuration: `functions/.env` carries **no** `NIVADESK_SMTP_*` line, so the code defaults apply (host `smtp.hostinger.com`, port 465, user = `contact@nivadesk.co.uk`); the password is the secret `NIVADESK_SMTP_PASSWORD`, already used by the support/ticket/invitation mails. The retention note would leave through the same transport.
* Hostinger's documentation does not mention plus-addressing; it is not needed — the subject tag and `In-Reply-To` carry the key, `NIVADESK_RETENTION_REPLY_DOMAIN` stays unset.
* Secret Manager metadata could not be read this morning: gcloud and the Firebase CLI both report expired credentials (`gcloud auth login` / `firebase login --reauth` — the operator's sign-in). The last known state (10 Sep records): `NIVADESK_SMTP_PASSWORD` exists; `NIVADESK_RETENTION_TOKEN_SECRET` and `NIVADESK_RETENTION_INBOUND_SECRET` do not.

**Routine choices, made with a reason (say so if you want them otherwise):**
* Poll cadence **hourly** (one IMAP login per hour, matches the sweep; the 15-minute figure in the earlier proposal buys nothing for a founder note).
* Activation **does not** stop the founder note (it is a personal question, not a setup nudge; only setup-kind mails stop — the rule `messaging.js` already applies).
* Inbound mode `imap` on the existing HTTP route's flag; the HTTP route stays for a provider later.
* The unsubscribe token secret: **I create it** once the CLI is signed in — `firebase functions:secrets:set NIVADESK_RETENTION_TOKEN_SECRET` fed with 32 random bytes (hex) generated locally; nobody types it, nothing is written to a file or a record. Required permission on `eggcraft-studio`: Secret Manager Admin (`roles/secretmanager.admin`) or Owner on the signed-in account — the operator's account is the project owner, so the sign-in is the only prerequisite. It becomes readable to the functions when they are deployed with `secrets: [NIVADESK_RETENTION_TOKEN_SECRET]` (already declared in code).

**The three decisions that are yours:**
1. **Sender and reply identity:** the notes go out as "Gunes from NivaDesk <contact@nivadesk.co.uk>" and replies come back to the same mailbox — *recommended* (authenticated, already in use, replies land where support reads). Alternative: a dedicated mailbox (one Hostinger mailbox seat; price to check in the panel; a new sending identity to warm up).
2. **Mailbox access for the poller:** read the shared `contact@nivadesk.co.uk` inbox over IMAP with the existing `NIVADESK_SMTP_PASSWORD` for the **one-workspace pilot** — *recommended for the pilot*; before a general launch, a dedicated mailbox and its own secret (decision 1's alternative solves both).
3. **Permission to send in the pilot:** turn `EMAIL=1` + `INBOUND=1` + `INBOUND_MODE=imap` on for the single pilot workspace (our test account is the recipient), deploy the retention set by name per §4 — yes/no. Nothing is sent until this is a yes and the token secret exists.

## 6. Evidence and pointers

* Code: `3670c58e` on `retention-email-candidate` (files: `functions/retention/writer.js`, `functions/retention/imapPoll.js`
  (new), `functions/lifecycle/retention.js`, `functions/index.js`, four test files, `package.json`/lock).
* Tests: §2 table; the temporary debug line used while fixing the In-Reply-To test was removed before the commit.
* Not done, deliberately: no mailbox access, no test send, no secret, no DNS, no provider, no deploy.
