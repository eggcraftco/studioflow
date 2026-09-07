> **Read-only investigation, 7 September 2026.** Nothing was changed: no secret rotated, no endpoint
> deleted, no production configuration touched, no secret value read. Opened after the 24-hour soak
> gate surfaced the 400s incidentally; it is **not** a finding against the dependency remediation.
>
> **This report corrects three premises it was given.** They came from a 14-day log window that
> clipped the successes, and they are corrected inside. Read §0 before anything else.

# stripeWebhook — investigation report

Project `eggcraft-studio` · service `stripewebhook` (europe-west2) · written 2026-09-07
All work read-only. No deploy, no secret rotation, no config change, no Stripe login, no `versions access`.
Worktree `/Users/gocmen/Developer/studioflow-app` unmodified (`git status --porcelain` empty).

---

## Bottom line, first

**Most likely root cause: two Stripe webhook endpoints are pointed at the same URL, and this service
holds exactly one signing secret. The endpoint whose secret it holds has been working the whole time.
The other endpoint's deliveries fail signature verification and are answered 400 with no log line.**

**Confidence that the deployed signing secret is NOT wrong and must NOT be rotated: high (~95%).**
The decisive evidence is that the *same* secret version, on the *same* revision, produced six HTTP 200s
and eighteen HTTP 400s inside the same 30-day window — six 400s on 8 Aug and the first 200 nine hours
later on 9 Aug, revision `stripewebhook-00043-hip` both times, `STRIPE_WEBHOOK_SECRET` pinned at version
4 both times. A wrong secret cannot be intermittent. Rotating it would break the only endpoint that
currently works.

**Confidence that the failing signer is specifically the *test-mode* endpoint: high but not proven
(~85%).** See Q2 — this is the one thing only the Stripe dashboard can settle.

**This is NOT a raw-body problem.** The handler reads `request.rawBody`
(`functions/stripeBilling.js:1800`), which is correct; that line has never been edited (single commit,
`bea42c8c`, 11 May 2026); and a body-parsing bug fails 100% deterministically, whereas this line has
successfully verified 42 events, six of them in the current log window. Do not touch the body handling.

**Three premises in the brief are wrong, and the corrections are most of the answer:**

| Brief says | Evidence says |
|---|---|
| 14 requests, all 400, zero successes | In the same service's full 30-day log: **18 Stripe 400s + 6 Stripe 200s + 2 non-Stripe curl 400s**. Successes on 9 Aug (×4), 18 Aug, 20 Aug. |
| 14 deliveries | **12 Stripe attempts (4 distinct events, 3 attempts each) + 2 `curl/8.7.1` operator probes** on 6 Sep 01:35 and 01:49, either side of the 01:48 deploy of revision 00046. |
| Failures start 27 Aug | 27 Aug is where the 14-day window clips. **Six 400s on 8 Aug**, on the same revision and secret as the 9 Aug successes. The real boundary is **9 June**. |

---

## Q1 — The exact production endpoint Stripe is calling

**ESTABLISHED.**

```
https://stripewebhook-ukbn4tcyca-nw.a.run.app/
```

- `gcloud run services describe stripewebhook --region=europe-west2 --project=eggcraft-studio --format="value(status.url,status.latestReadyRevisionName,metadata.creationTimestamp)"`
  → `https://stripewebhook-ukbn4tcyca-nw.a.run.app` | `stripewebhook-00046-peq` | `2026-05-07T12:13:51Z`
- Every one of the 24 Stripe-UA rows in `raw_requests_30d.json` lands on that host. No cloudfunctions.net
  URL, no custom domain.
- This is the intended URL, not a stale one: `SESSION_LOG_BILLING_STORAGE_LEGAL_2026-06.md:62` records the
  configured endpoint as exactly `https://stripewebhook-ukbn4tcyca-nw.a.run.app`.
- Exactly one Stripe signature-verification site exists in the codebase:
  `grep -rn constructEvent functions studioflow-web | grep -v node_modules` → one live hit,
  `functions/stripeBilling.js:1800` (the second hit is a copy inside
  `studioflow-web/.claude/worktrees/affectionate-edison-7af5f2/`, not deployed).
- The other two `onRequest` handlers in that file are Apple (`:1725`) and Google Play (`:2116`). The 400
  at `:1775` belongs to Apple's handler, not Stripe's — worth stating because it is easy to misread.

**The raw `.a.run.app` URL is not the fault.** It is what Stripe was configured with, and it is what the
six successful deliveries used.

---

## Q2 — Which webhook endpoint ID / account it belongs to

**NOT ESTABLISHED — and this is the single open item.**

Stripe's endpoint id (`we_…`) and account id (`acct_…`) appear nowhere in a Cloud Run request log, and a
rejected delivery writes nothing to Firestore, so neither is recoverable read-only from this side.

What **is** established is that there are **at least two distinct signers** hitting this one URL:

- One whose signatures verify. 42 events have been verified over the service's life
  (`stripeBillingEvents`, read via `read_switchover.js`), 6 of them inside the log window.
- One whose signatures do not. 18 Stripe-UA 400s, all on the verification branch (see Q3).

And the ledger dates the split precisely:

```
2026-06-08T19:14:19Z   last livemode:false event EVER recorded  (28 test events, 29 May – 8 Jun)
2026-06-09T08:16:54Z   STRIPE_WEBHOOK_SECRET version 4 created
2026-06-09T08:19:08Z   revision stripewebhook-00041-qex deployed onto v4
2026-06-09T08:45:14Z   first livemode:true event verified
…thereafter            14 events, EVERY one livemode:true, ZERO test-mode
```

Test-mode acceptance stopped at the exact minute the secret rotated to v4, and live-mode acceptance began
at the exact same minute. The natural reading is that v4 is the **live** endpoint's `whsec_`, and the
**test** endpoint — still configured, still pointed at this same URL — has been 400ing silently since
9 June.

Two independent corroborations:

1. **Anniversary arithmetic.** The last test subscription was created `2026-06-08T19:14:19Z`
   (a `storage_addon` row, still in the ledger with `updatedAt 2026-06-08T19:14:19`). Its monthly renewal
   would fall on `2026-08-08 19:14` — and the very first 400 in the log is `2026-08-08T19:14:41Z`, 22
   seconds later. The live subscription created `2026-06-09T08:45` renewed at `2026-07-09T08:45:23` and
   `2026-08-09T08:45:49`, both **200**. Same clock, one mode verifying and one not.
2. **Retry shape.** Every failed event got exactly **3 attempts** at roughly T, T+17s, T+1h, then was
   abandoned. Every successful event got exactly 1. Three attempts over about an hour is Stripe's
   test-mode retry policy; live mode retries for ~3 days.

**What would establish it:** Stripe Dashboard → **Developers → Webhooks**, checked **twice — once with
the Test-mode toggle OFF and once ON**. In each mode, look for an endpoint whose URL is
`https://stripewebhook-ukbn4tcyca-nw.a.run.app/`. For each one read:
- the **endpoint ID** (`we_…`) shown at the top of the endpoint page, and the account in the top-left
  account switcher (`acct_…`);
- the **Signing secret** (click *Reveal*);
- **Event deliveries → Failed**, filtered to `27 Aug 19:34`, `28 Aug 21:05`, `28 Aug 22:05`,
  `6 Sep 19:34` (all UTC). The endpoint that lists those four as failed is the one whose secret this
  service does not hold.

---

## Q3 — Does the configured signing secret correspond to that endpoint?

**ESTABLISHED, in both directions.**

**(a) The secret is present, mounted, non-empty, and current.**

- `functions/index.js:104` declares `defineSecret("STRIPE_WEBHOOK_SECRET")`; it is passed into
  `createStripeBillingFunctions(...)` at `index.js:5825` and declared on the function itself at
  `stripeBilling.js:1779` (`secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET]`).
- `gcloud secrets versions list STRIPE_WEBHOOK_SECRET --project=eggcraft-studio` →
  v4 `2026-06-09T08:16:54`, v3 `2026-05-29T16:01:02`, v2 `2026-05-29T15:53:52`, v1 `2026-05-07T12:10:21`.
  **No v5.** v4 is the latest, so the pin is not stale.
- `gcloud run revisions describe stripewebhook-00043-hip` and `…-00046-peq` (europe-west2) both show
  `STRIPE_WEBHOOK_SECRET → secretKeyRef key "4"`. Identical across the 400s *and* the 200s.
- Audit log: `gcloud logging read 'protoPayload.resourceName=~"secrets/STRIPE_"' --freshness=400d` →
  nothing has touched either Stripe secret since 2026-06-09.

**(b) A missing secret would have been 503, not 400 — so the observed 400s prove it is configured.**
`configStatus(null, {requireWebhook:true})` returns `{configured:false}` for every configuration fault
(`stripeBilling.js:250-275`), including an empty `STRIPE_WEBHOOK_SECRET` at `:271-273`, and the handler
answers **503** on that path (`:1785-1789`). We never see a 503.

**(c) Which of the two 400 branches is firing — proven by response size, no dashboard needed.**
The two 400 bodies are fixed-length: `"Missing Stripe signature"` = 24 bytes (`:1793`) and
`"Webhook signature verification failed."` = 38 bytes (`:1802`), a 14-byte difference. Observed
`httpRequest.responseSize` values are exactly **158** and **172** — also 14 apart, i.e. 134 bytes of
identical header overhead either way.

| responseSize | branch | line | who |
|---|---|---|---|
| **172** | signature verification failed | `:1799-1804` | **all 18 Stripe 400s** |
| 158 | missing `stripe-signature` header | `:1791-1795` | the 2 `curl` probes (they sent no header) |

**(d) So: the secret is correct for the signer that matters and wrong for the other one.**
`config.webhookSecret` is a single string (`:274`). `constructEvent(request.rawBody, signature,
config.webhookSecret)` is called **once** (`:1800`) — no array, no fallback loop, no second attempt with
another secret. There is no test/live branching anywhere in the webhook path; the only mode logic in the
file is the API-key gate at `:261-267`, which affects the 503 path and never the signature check.
Tolerance is not passed, so it is the SDK default 300 s (`stripe@22.1.1`,
`node_modules/stripe/cjs/Webhooks.js:8,16`) — clock skew is not a candidate at these margins anyway.

**Do not rotate this secret.** It is the working one.

---

## Q4 — Duplicates / stale traffic, or events NivaDesk actually expects?

**ESTABLISHED as duplicates-plus-stale, with one qualification.**

Clustering the 26 rows of `raw_requests_30d.json` by timestamp and `requestSize`:

```
#   first attempt (UTC)   attempts (offsets)          reqSize        status
 1  2026-08-08 19:14:41   T, +18.9s, +59m18s          9163/9164/9164   400
 2  2026-08-08 20:15:53   T, +1h00m14s, +2h00m59s     7083/7082/7083   400
 3  2026-08-09 08:45:47   T only                      9084             200   subscription.updated  live
 4  2026-08-09 09:46:54   T only                      6871             200   subscription.updated  live
 5  2026-08-09 17:53:42   T only                      9119             200   subscription.updated  live
 6  2026-08-09 18:54:43   T only                      6906             200   subscription.updated  live
 7  2026-08-18 16:53:26   T only                      6926             200   subscription.deleted  live
 8  2026-08-20 08:52:15   T only                      6891             200   subscription.deleted  live
 9  2026-08-27 19:34:20   T, +17.2s, +1h00m26s        6956 x3          400
10  2026-08-28 21:05:11   T, +17.3s, +58m49s          6983 x3          400
11  2026-08-28 22:05:12   T, +58m59s, +2h01m27s       6984/6985/6985   400
12  2026-09-06 19:34:00   T, +17.2s, +1h00m53s        7060/7060/7061   400
```

- **12 distinct events / 24 Stripe attempts.** 6 succeeded (1 attempt each), 6 failed (exactly 3 attempts
  each, byte-identical within a burst).
- **In the operator's 14-day window: 4 distinct events, 12 attempts, plus 2 curl probes.** The "6 Sep (5)"
  is one event retried three times (19:34:00 → +17.2s → +1h00m53s) plus the two curl hits at 01:35 and
  01:49. The "27 Aug (3)" is one event. The "28 Aug (5) + 29 Aug (1)" is two events (3+3, with one attempt
  landing after midnight).
- **Stale, not expected.** There is no live subscription left for these to be about: the last two live
  events were the *cancellations* of the only two live Stripe subscriptions, on 18 and 20 Aug, and both
  were delivered successfully (200). See Q6.
- **Qualification:** "stale" is a judgement about the *sender*, and the sender's mode is the Q2 open item.
  What is proven is that these events reference no live subscription this project knows about.

The two `curl/8.7.1` hits (6 Sep 01:35:33Z and 01:49:27Z, from a UK IPv6 address, `responseSize` 158)
straddle the 01:47-01:48 deploy of revision 00046. That is a smoke-test of the deploy. Note what it
returned: 400 "missing signature" — which only proves the service is up, and is very likely why the real
failure has gone unnoticed.

---

## Q5 — Which event types are being dropped

**NOT ESTABLISHED.** Cloud Run does not log request bodies, and a rejected event writes nothing to
Firestore (`processStripeEvent` is only reached *after* `constructEvent` returns). The type is simply not
recoverable from this side.

**Bounds that are established:**

- The handler switches on five types (`stripeBilling.js:1257-1267`): `checkout.session.completed`,
  `customer.subscription.created` / `.updated` / `.deleted`, `invoice.paid`, `invoice.payment_failed`.
  Anything else returns `{skipped:true, reason:"unhandled_event"}` **and still answers 200**, so an
  unhandled type could never produce a 400. Whatever these are, they are being rejected at the signature,
  not at the switch.
- Payload sizes (6956-7061 B for the four in-window events, 9163 B and 7083 B for the 8 Aug pair) are in
  the same range as the successful `customer.subscription.*` deliveries (6871-9119 B), which is
  consistent with subscription/invoice events rather than anything exotic. Indicative only.
- Renewal arithmetic (Q2) points at the monthly renewal of the 8 June test subscription for event #1.

**What would establish it:** the endpoint's **Event deliveries** list in the Stripe dashboard (Q2), which
shows `type` and `livemode` per delivery. Match on the four UTC timestamps listed in Q2.

---

## Q6 — Should any business state have changed?

**ESTABLISHED: no live business state was lost. Nothing broke for any customer.**

**What a success would have written** (`processStripeEvent :1241-1277`): first a `stripeBillingEvents/{id}`
doc, then per type — `applyCompletedSubscriptionCheckout` (`:1053`, stamps `billingCheckoutSessionId`,
`billingCheckoutCompletedAt`, `billingTrialUsedAt`); `applySubscription` (`:1081`, writes the ledger row
`companies/{id}/subscriptions/stripe_{subId}` and, for plans, re-resolves `billingPlan` /
`billingStatus` / `billingEffective*` via `recomputeEffectiveWorkspaceEntitlement` `:807`);
`applyInvoicePaid` (`:1181`); `applyInvoicePaymentFailed` (`:1201`).

**Why nothing was lost anyway — the Stripe ledger, read directly:**

```
provider | providerStatus | active | subscriptionType | currentPeriodEnd | updatedAt           | lastEvent
stripe   | canceled       | false  | plan             | (empty)          | 2026-08-20T08:52:18 | customer.subscription.deleted
stripe   | canceled       | false  | team_seat_addon  | (empty)          | 2026-08-18T16:53:29 | customer.subscription.deleted
stripe   | active         | true   | plan             | (empty)          | 2026-05-30T21:02:30 | checkout.session.completed
stripe   | active         | true   | plan             | (empty)          | 2026-05-30T21:45:35 | checkout.session.completed
stripe   | active         | true   | storage_addon    | (empty)          | 2026-06-08T19:14:19 | checkout.session.completed
```

- **Both live subscriptions were already cancelled seven days before the window opens**, and both
  cancellations were delivered successfully (200 at 18 Aug 16:53 and 20 Aug 08:52). There was no live
  subscription left for a dropped event to be about.
- **No new live subscriber could have been dropped.**
  `gcloud logging read … service_name="createstripecheckoutsession" … --freshness=30d` returns
  **zero 2xx in 30 days** — 204 preflights, ten 500s on 28 Aug, two 400s on 6 Sep. And
  `getOrCreateCustomer` (`:465-494`) stamps `billingCustomerId` *before* any webhook fires, so a checkout
  that merely started would leave a Firestore trace. None did. Newest `billingCustomerCreatedAt` across
  all 63 companies is **2026-06-09**.
- No workspace anywhere is `past_due`, `incomplete` or `unpaid`.
- No billing support contact in the window: of 62 tickets, the 47 created 20 Aug - 8 Sep are all
  `ticketType: "website"` marketing-chat items; the five billing-adjacent ones are pricing enquiries, none
  from either live-Stripe workspace.

**Two standing divergences that PREDATE this and are not caused by it:**

1. **Three test-era ledger rows are permanently `activeForEntitlement: true` in production** (written by
   test-mode webhooks on 30 May 21:02, 30 May 21:45, 8 Jun 19:14). Two internal `@nivadesk.app`
   workspaces therefore hold paid entitlement resolved from test-mode purchases. Both have 0 orders.
2. **`currentPeriodEnd` is empty on every Stripe row** while Apple/Google rows carry real values, and all
   7 skipped events are `invoice.paid → invoice_without_subscription` (`:1184-1186`). Same root cause: on
   the Stripe API version in use, `invoice.subscription` and `subscription.current_period_end` are no
   longer where `applyInvoicePaid` and `applySubscription` (`:1096`) look.

**The reconcile rail does NOT compensate — correcting the brief.** `reconcileExpiredBillingEntitlements`
(`:2168-2214`) contains zero references to Stripe and its registration (`:2216-2221`) declares **no
`secrets:` array**, unlike `stripeWebhook` (`:1779`) and `resyncStripeWorkspaceEntitlements` (`:1275`) —
it cannot authenticate to Stripe even in principle. It queries
`companies where billingEffectiveStatus == "active" and billingCurrentPeriodEnd < now-2h` and only ever
*downgrades*. Because divergence #2 leaves `currentPeriodEnd` null on every Stripe row, and a Firestore
range filter never matches a null field, **no Stripe workspace can ever be selected**. Consistent with
that, all 338 runs logged the same line: `Billing reconcile: expired 0 subscription(s) across 0
workspace(s).` The 338×200 means the cron fires. It does not mean billing is covered. A dropped Stripe
webhook is a permanent divergence with no self-healing.

---

## Q7 — Does Stripe have another active, successful endpoint?

**ESTABLISHED (partially): the endpoint under investigation IS the successful one.** Six 200s in the
window, 42 verified events over its life. There is no "other, working" endpoint to find — the working
endpoint and the failing one are the same URL with two different signers.

**ESTABLISHED within this GCP project: no second Stripe webhook receiver exists.**
`gcloud logging read 'resource.type="cloud_run_revision" AND httpRequest.userAgent=~"Stripe"'
--freshness=30d` → `stripewebhook` 400×18 / 200×6, and `recordsitevisit` 200×2 (that is `Stripebot/1.0`
crawling the marketing site, not webhook delivery). Only one signature-verification site exists in the
codebase (Q1), and `studioflow-web` has no `api/` directory.

**NOT ESTABLISHED: whether Stripe has endpoints configured outside this project.** A named control
failed: `gcloud logging read 'httpRequest.requestMethod:*' --freshness=30d` returns *only*
`cloud_run_revision` rows — this project emits no HTTP request logs outside Cloud Run, so an endpoint
hosted on Hostinger or nivadesk.app would be invisible from here. (Control on `nivadesk-amazon` passes —
it has load-balancer request logs and zero Stripe UA. Control on `social-login-442223` fails — no request
logs at all.)

**What would establish it:** the full endpoint list on Stripe Dashboard → Developers → Webhooks, in
**both** Test and Live mode. Count the endpoints and read each URL.

**Also bounded by retention:** `_Default` bucket = 30 days (`_Required` = 400 days but holds audit logs
only). The oldest request log anywhere in the project is `2026-08-08T07:28:05Z`. The service dates to
7 May with 46 revisions; May-July request logs are simply gone. The `stripeBillingEvents` ledger is what
let this analysis reach back to 29 May.

---

## Urgency

**This is a tidy-up, not an incident — but a tidy-up sitting on top of a billing rail that is not safe
for the next real customer.** Both halves matter; do not read only one.

**Why it is not an incident:**
- No live Stripe subscription has existed since 20 Aug, and the two cancellations that ended them were
  both delivered successfully.
- Zero successful checkout sessions in 30 days, zero new Stripe customers since 9 June — no live event
  could have been generated, let alone dropped.
- No workspace in `past_due` / `incomplete` / `unpaid`, no billing complaint.
- Nothing regressed on 27 August. Nothing regressed at all: the handler's code is byte-identical to the
  11 May baseline (`git log -L 1779,1813:functions/stripeBilling.js` → one commit, `bea42c8c`), the
  secret has not moved since 9 June, and there was no deploy between 23 June and 30 Aug.

**Why it is not nothing:**
- The rejection path writes **no log line at all** (`:1799-1804` binds `error` and never reads it), so
  this failed for three months in silence and would have kept doing so.
- The reconcile rail cannot compensate (Q6) — a dropped Stripe event is permanent.
- Two internal workspaces hold entitlement resolved from test-mode purchases, which a working webhook
  would have corrected.
- `currentPeriodEnd` has never been populated for any Stripe subscription, which disables the expiry
  safety net entirely for Stripe.

None of the second list is on fire today, because there are no paying Stripe customers today. All of it
is on fire the day there is one.

---

## Smallest next step

**NOTHING IS TO BE CHANGED UNTIL THE OPERATOR APPROVES IT.** No secret has been rotated, no endpoint
touched, no deploy run, and none should be on the strength of this report alone.

**The one action to take first — read-only, five minutes, no change:**

Open Stripe Dashboard → **Developers → Webhooks**. Toggle **Test mode ON**, then **OFF**, and in each
mode answer three questions about any endpoint whose URL is
`https://stripewebhook-ukbn4tcyca-nw.a.run.app/`:

1. Does an endpoint on that URL exist in this mode? (Expected: one in each — that is the whole hypothesis.)
2. Under **Event deliveries → Failed**, are the failures at `27 Aug 19:34`, `28 Aug 21:05`,
   `28 Aug 22:05`, `6 Sep 19:34` UTC listed here? Read their `type`. (This answers Q5.)
3. Note the endpoint **ID** (`we_…`). (This answers Q2.)

That single page closes Q2, Q5 and Q7 and tells you which endpoint is the failing signer. Then, and only
then, decide.

**When you do decide, the likely shape of the fix — for approval, not for action now:**

- If the failing endpoint is the **test-mode** one: **disable or delete it**, or repoint it at a separate
  function with its own secret. Do **not** add the test secret as a second `defineSecret` on this handler
  — that widens what the live endpoint will accept, and it would not work anyway: the deployed
  `STRIPE_SECRET_KEY` is a live key, so `applyInvoicePaid`'s `stripe.invoices.retrieve` would then fail
  downstream on test events and turn silent 400s into 500s.
- Whatever else happens, **do not rotate `STRIPE_WEBHOOK_SECRET`.** Q3 establishes it is the correct
  secret for the working endpoint.

**Two things worth queueing separately, both out of scope here:**

1. `currentPeriodEnd` and `invoice.subscription` are read from the wrong place for the current Stripe API
   version (`:1096`, `:1184-1186`). Until fixed, `billingLastInvoicePaidAt` is never written and the
   reconcile rail is structurally dead for Stripe.
2. **Security, unrelated to this incident:** `TRACK17_WEBHOOK_TOKEN` is stored as a **plaintext
   environment variable** on the `stripewebhook` service (present on revisions 00043, 00045 and 00046),
   readable by anyone with `run.revisions.get`. Its value has not been read or reproduced anywhere in this
   investigation. `functions/index.js:93` already declares the same name as a `defineSecret`, so the
   plaintext copy duplicates something already managed properly. Worth reconciling in its own change.

---

## Evidence index

All under
`/private/tmp/claude-501/-Users-gocmen-Developer-studioflow-app/5b787108-6e8d-45bb-9cdf-ad907f483cb8/scratchpad/stripe/`

| file | what |
|---|---|
| `raw_requests_30d.json` | every Cloud Run request log for `stripewebhook`, 30-day window (26 rows) |
| `webhook_requests_90d.csv` | same, flattened |
| `BURSTS.txt` | the 12-event / 24-attempt clustering |
| `QUERIES.md` | every gcloud command run, with positive and failed controls named |
| `read_switchover.js` | read-only `stripeBillingEvents` timeline (the 9 June live/test cut) |
| `read_livemode.js`, `read_events.js`, `read_billing_agg.js`, `read_stripe_subs.js`, `probe1-6.js` | read-only Firestore aggregates |

Code references are to `/Users/gocmen/Developer/studioflow-app/functions/stripeBilling.js` unless stated.
